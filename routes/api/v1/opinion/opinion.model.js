import {prepareInsertAssets, prepareUpdateAssets, parseTaxon} from '../../../../util.js'
import {logger} from '../../../../app.js'
import { fetchClosestTaxon } from '../occurrence/occurrence.model.js';
import { getOriginalCombination } from '../authority/authority.model.js';

const isDuplicate = async (conn, opinion) => {
    logger.info("isDuplicate");

    //TODO: See Opinion.pm, line 808, *837, *893, 907, 937, 968, 993, 1067
    //TODO: Add verify these
    const rows = await conn.query({
        namedPlaceholders: true,
        /*
        sql:`
            select 
                opinion_no 
            from 
                opinions 
            where 
                child_no = :child_no and
                child_spelling_no = :child_spelling_no and
                parent_no = :parent_no and
                parent_spelling_no = :parent_spelling_no
                ${opinion.opinion_no ? 
                    `and opinion_no != :opinion_no` :
                    ''
                }
        `
        */
       //From line 808
        sql:`
            select 
                opinion_no 
            from 
                opinions 
            where 
                ref_has_opinion !='YES' and
                child_no = :child_no and
                author1last = :author1last and
                author2last = :author2last and
                pubyr = :pubyr and
                status = not in ('misspelling of')
                ${opinion.opinion_no ? 
                    `and opinion_no != :opinion_no` :
                    ''
                }
       `
    }, {
        child_no: opinion.child_no || null, 
        author1last: opinion.author1last || null, 
        author2last: opinion.author2last || null, 
        pubyr: opinion.pubyr || null, 
        opinion_no: opinion.opinion_no || null, 
    });
    
    //Per line 818
    const rows2 = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                opinion_no 
            from 
                opinions o,
                refs r 
            where 
                ref_has_opinion ='YES' and
                child_no = :child_no and
                o.reference_no = r.reference_no and
                author1last = :author1last and
                author2last = :author2last and
                pubyr = :pubyr and
                status = not in ('misspelling of','homonym of')
                ${opinion.opinion_no ? 
                    `and opinion_no != :opinion_no` :
                    ''
                }
       `
    }, {
        child_no: opinion.child_no || null, 
        author1last: opinion.author1last || null, 
        author2last: opinion.author2last || null, 
        pubyr: opinion.pubyr || null, 
        opinion_no: opinion.opinion_no || null, 
    });

    return rows.length > 0 || rows2.length > 0;
}

const fetchTaxon = async (conn, taxonID) => {
    logger.trace("fetchTaxon")
    logger.trace(taxonID)
    const taxonResult = await conn.query("select * from authorities where taxon_no = ?", [taxonID]);
    if (taxonResult.length === 0) {
        const error = new Error(`Unrecognized taxon: ${taxonID}`);
        error.statusCode = 400
        throw error
    }
    logger.trace(taxonResult[0])

    const taxonParsed = [...taxonResult[0].taxon_name.matchAll(/^(?:(\p{Lu}\p{Ll}*) ?)(?:\((\p{Lu}\p{Ll}*)\) ?)?(\p{Ll}*)?(?: (\p{Ll}*))?/gu)]
    const genus = taxonParsed[0][1];
    const subgenus = taxonParsed[0][2];
    const species = taxonParsed[0][3];
    const subspecies = taxonParsed[0][4];

    return {
        rank: taxonResult[0].taxon_rank,
        genus: taxonParsed[0][1] || null,
        subgenus: taxonParsed[0][2] || null,
        species: taxonParsed[0][3] ? 
                    taxonParsed[0][4] ?
                        `${taxonParsed[0][3]} ${taxonParsed[0][4]}` :
                        taxonParsed[0][3] :
                 null
    }
}

const verifyReference = async (conn, referenceID, pubyr) => {
    //logger.trace("verifyReference")
    const testResult = await conn.query("select reference_no, pubyr from refs where reference_no = ?", [referenceID]);
    
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized reference: ${referenceID}`);
        error.statusCode = 400
        throw error
    }

    if (pubyr > testResult[0].pubyr ) {
        const error = new Error(`Reference pubyr ${testResult[0].pubyr} older than authority pubyr ${pubyr}`);
        error.statusCode = 400
        throw error
    }
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}


export const getOpinions = async (pool, limit, offset) => {
    //logger.info("getOpinions");
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from opinions";
      let sql = "SELECT opinion_no, child_no, child_spelling_no, parent_no, parent_spelling_no from opinions order by opinion_no";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        opinions: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getOpinion = async (pool, id) => {
    logger.info("getOpinion");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            o.*
        from 
        opinions o
        where 
            o.opinion_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createOpinion = async (pool, opinion, user, allowDuplicate) => {
    logger.info("createOpinion");
    logger.trace(opinion);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(opinion, []);
	insertAssets.propStr += `, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;
   
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        //Per line 763
        opinion.child_no = await getOriginalCombination(conn, opinion.child_no);

        const childTaxon = await fetchTaxon(conn, opinion.child_no);
        logger.trace("childTaxon = ")
        logger.trace(childTaxon)

        if (
            //allowDuplicate || 
            ! await isDuplicate(conn, opinion)
        ) {

            //verify reference
            await verifyReference(conn, opinion.reference_no, opinion.pubyr);
            
            const insertSQL = `insert into opinions (${insertAssets.propStr}) values (${insertAssets.valStr}) returning opinion_no`
            logger.trace(insertSQL)
            logger.trace(insertAssets.values)
        
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].opinion_no)

            opinion.opinion_no = res[0].opinion_no;

            await conn.commit();
            return opinion;
        } else {
            const error = new Error(`The author's opinion on ${childTaxon.taxon_name} has already been entered - an author can only have one opinion on a name`);
            error.statusCode = 400
            throw error				
        }

    } catch (err) {
        logger.error("Error loading data, reverting changes: ", err);
        logger.error(err)
        await conn.rollback();
        throw err
    } finally {
        if (conn) conn.release(); //release to pool
    }
}

export const updateOpinion = async (pool, patch, user, allowDuplicate,mergedOpinion) => {
    logger.info("updateOpinion");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedOpinion)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedOpinion)
        ) {

            const updateAssets = prepareUpdateAssets(patch, []);
    
            updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier_no = :modifier_no`
            updateAssets.values.modifier_no = user.userID;
            updateAssets.values.opinion_no = mergedOpinion.opinion_no;
        

            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no);
            }

            const updateSQL = `update opinions set ${updateAssets.propStr} where opinion_no = :opinion_no`
            logger.trace(updateSQL)
            logger.trace(updateAssets.values)
        
            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate opinion found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
            error.statusCode = 400
            throw error				
        }
    } catch (err) {
        logger.error("Error loading data, reverting changes: ", err);
        await conn.rollback();
        throw err
    } finally {
        if (conn) conn.release(); 
    }
}