import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

const isDuplicate = async (conn, occurrence) => {
    logger.info("isDuplicate");

    //TODO: Add spatial
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                occurrence_no 
            from 
                occurrences 
            where 
                genus_reso = :genus_reso and
                genus_name = :genus_name and
                subgenus_reso = :subgenus_reso and
                subgenus_name = :subgenus_name and
		        species_reso = :species_reso and
                species_name = :species_name and
                taxon_no = :taxon_no and
                collection_no = :collection_no
                ${occurrence.occurrence_no ? 
                    `and occurrence_no != :occurrence_no` :
                    ''
                }
        `
    }, {
        genus_reso: occurrence.genus_reso || null, 
        genus_name: occurrence.genus_name || null, 
        subgenus_reso: occurrence.subgenus_reso || null, 
        subgenus_name: occurrence.subgenus_name || null, 
        species_reso: occurrence.species_reso || null, 
        species_name: occurrence.species_name || null, 
        taxon_no: occurrence.taxon_no || null, 
        collection_no: occurrence.collection_no || null, 
        occurrence_no: occurrence.occurrence_no || null, 
    });
    
    return rows.length > 0;
}

const verifyReference = async (conn, referenceID) => {
    const testResult = await conn.query("select reference_no from refs where reference_no = ?", [referenceID]);
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized reference: ${referenceID}`);
        error.statusCode = 400
        throw error
    }
}

const verifyCollection = async (conn, collectionID) => {
    const testResult = await conn.query("select collection_no from collections where collection_no = ?", [collectionID]);
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized collection: ${collectionID}`);
        error.statusCode = 400
        throw error
    }
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}

export const getOccurrences = async (pool, limit, offset) => {
    //logger.info("getReferences");
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from occurrences";
      let sql = "SELECT occurrence_no, genus_name from occurrences order by occurrence_no";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        occurrences: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getOccurrence = async (pool, id) => {
    logger.info("getOccurrence");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            o.*
        from 
            occurrences o
        where 
            o.occurrence_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createOccurrence = async (pool, occurrence, user, allowDuplicate) => {
    logger.info("createOccurrence");
    logger.trace(occurrence);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(occurrence, []);
	insertAssets.propStr += `, enterer, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer = user.userName; //TODO: consider stripping to first initial
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;

    //derived properties
    
	const insertSQL = `insert into occurrences (${insertAssets.propStr}) values (${insertAssets.valStr}) returning occurrence_no`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, occurrence)
        ) {
            //verify references
            await verifyReference(conn, occurrence.reference_no);
            await verifyCollection(conn, occurrence.collection_no);
            //TODO await verifyTaxon(conn, specimen.occurrence_no);
            
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].occurrence_no)

            occurrence.occurrence_no = res[0].occurrence_no;
                        
            await conn.commit();
            return occurrence;
        } else {
            const error = new Error(`Duplicate occurrence found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateOccurrence = async (pool, patch, user, allowDuplicate, mergedOccurrence) => {
    logger.info("updateOccurrence");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedOccurrence)

    const updateAssets = prepareUpdateAssets(patch, []);
    
    updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier = :modifier, modifier_no = :modifier_no`
    updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.occurrence_no = mergedOccurrence.occurrence_no;

    //derived properties

    const updateSQL = `update occurrences set ${updateAssets.propStr} where occurrence_no = :occurrence_no`
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedOccurrence)
        ) {

            //verify references
            if (patch.reference_no) {
                await verifyReference(conn, patch.reference_no);
            }
            //TODO: verify taxon_no and occurrence_no

            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate occurrence found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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