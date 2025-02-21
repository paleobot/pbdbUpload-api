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
        name: taxonResult[0].taxon_name,
        genus: taxonParsed[0][1] || null,
        subgenus: taxonParsed[0][2] || null,
        species: taxonParsed[0][3] ? 
                    taxonParsed[0][4] ?
                        `${taxonParsed[0][3]} ${taxonParsed[0][4]}` :
                        taxonParsed[0][3] :
                 null
    }
}


//This is a translation of the perl routine getOpinionsToMigrate in Opinion.pm. There is login in that routine that is inconsistent. There is also logic that I do not fully understand. I've tried to fix what it obvious to me and left the rest intact. 
//Comment from original routine: Gets a list of opinions that will be moved from a spelling to an original name.  Made into its own function so we can prompt the user before the move actually happens to make sure they're not making a mistake. The exclude_opinion_no is passed so we exclude the current opinion in the migration, which will only happen on an edit
const getOpinionsToMigrate = async (conn, child_no, child_spelling_no, exclude_opinion_no) => {

    /*
    NOTE: The original version of this select had duplicate logic in the WHERE clause:
        SELECT 
            * 
        FROM 
            opinions 
        WHERE 
            (
                (child_no = :child_no AND 
                    (parent_no = :child_spelling_no OR 
                        parent_spelling_no = :child_spelling_no
                    ) 
                ) OR
                (child_no = :child_no AND 
                    (parent_no = :child_spelling_no OR 
                        parent_spelling_no = :child_spelling_no
                    ) 
                ) 
            ) AND 
            status != 'misspelling of' ${exclude_opinion_no ? `AND
            opinion_no != :excluded_opinion_no` : ''}
    My guess is that this is a bug and they intended to query on something else.
    For now, I've just deleted the redundancy.
    */
    const sql = `
        SELECT 
            * 
        FROM 
            opinions 
        WHERE 
            (
                (child_no = :child_no AND 
                    (parent_no = :child_spelling_no OR 
                        parent_spelling_no = :child_spelling_no
                    )
                ) 
            ) AND 
            status != 'misspelling of' ${exclude_opinion_no ? `AND
            opinion_no != :excluded_opinion_no` : ''}
    `;

    const results = await conn.query(sql, {
        child_no: child_no,
        child_spelling_no: child_spelling_no,
        exclude_opinion_no: exclude_opinion_no
    });
    if ( results )	{
        return {
            opinions: [],
            parents: [],
            error: results[0].status
        };
    }
    //It's not clear to me what just happened. We abandon results here.
 
    const orig_no = getOriginalCombination(conn ,child_spelling_no);
    sql = `
        SELECT 
            * 
        FROM 
            opinions 
        WHERE 
            child_no = :orig_no ${exclude_opinion_no ? `AND
            opinion_no != :excluded_opinion_no` : ''}
    `;
    results = await conn.query(sql, {
        orig_no: orig_no,
        exclude_opinion_no: exclude_opinion_no
    });
  
    const parents = [];

    //Comment from original routine: there is a potential bizarre case where child_spelling_no has been used as a parent_no, but it completely unclassified itself, so we need to add it to the list of parents to be moved JA 12.6.07
    if ( !results && child_no != orig_no )	{
        sql = "SELECT count(*) c FROM opinions WHERE parent_no = :orig_no";
        const count = await conn.query(sql, {
            orig_no: orig_no,
        })[0].c;
        if ( count > 0 )	{
            parents.push(orig_no);
        }
    }

    const opinions = [];
    for (row of results) {
        if (row.child_no != child_no) {
            opinions.push(row);
            if ('misspelling of' === row.status) {
                //NOTE: This is the original test. I find this regex formulation odd. parent_spelling_no is an int in the db. I think they are just checking to see if it has a value. Maybe perl returns it as a string?
                //if (/^\d+$/.test(row.parent_spelling_no)) {
                if (row.parent_spelling_no) {
                    parents.push(row.parent_spelling_no);
                }
            }
            //ditto
            if (row.child_spelling_no) {
                parents.push(row.child_spelling_no);
            }
            //ditto
            if (row.child_no) {
                parents.push(row.child_no);
            }
        }
    }

    return {
        opinions: opinions,
        parents: parents
    };
}

//NOTE: This routine is a translation of the same routine in Opinion.pm
//Original comment:
/*
# row is an opinion database row and must contain the following fields:
#   child_no,status,child_spelling_no,parent_spelling_no,opinion_no
# JA: there's a long-standing bug in here somewhere that causes the spelling
#  spelling reason to get messed up when original names are changed but I
#  have no time right now to fix it
*/
const resetOriginalNo = async (conn, newOriginalNumber, opinion) => {
   if (!newOriginalNumber) return
    
    const childTaxon = await fetchTaxon(conn, newOriginalNumber);

    let spellingTaxon;
    if ('misspelling of' === opinion.status) {
        spellingTaxon = await fetchTaxon(conn, opinion.parent_spelling_no);
    } else {
        spellingTaxon = await fetchTaxon(conn, opinion.child_spelling_no);
    }

    const isMisspelling = 
        "misspelling" === opinion.spelling_reason || 
        await conn.query({ 
            namedPlaceholders: true, 
            sql: "SELECT count(*) cnt FROM opinions WHERE child_spelling_no=:child_spelling_no AND status='misspelling of'"
        }, {child_spelling_no: opinion.child_spelling_no}).cnt > 0;

    const newSpellingReason = 
        isMisspelling ?
            'misspelling' :
            guessSpellingReason(childTaxon, spellingTaxon) //TODO: define this

    const sql = `
        UPDATE 
            opinions 
        SET 
            modified=modified,
            spelling_reason=:spelling_reason,
            child_no=:child_no  
        WHERE 
            opinion_no=:opinion_no`

        await conn.query({ 
            namedPlaceholders: true, 
            sql: sql
        }, {
            spelling_reason: newSpellingReason,
            child_no: newOriginalNumber,
            opinion_no: opinion.opinion_no
        });
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

        let childSpellingTaxon;
        if (opinion.child_spelling_no) {
            childSpellingTaxon = await fetchTaxon(conn, opinion.child_spelling_no);
            logger.trace("childSpellingTaxon = ")
            logger.trace(childSpellingTaxon)
        }

        //Note: I have no idea if I'm doing this parent stuff right
        let parentTaxon;
        if (opinion.parent_no) {
            parentTaxon = await fetchTaxon(conn, opinion.parent_no);
            logger.trace("parentTaxon = ")
            logger.trace(parentTaxon)
        }

        let parentSpellingTaxon;
        if (opinion.parent_spelling_no) {
            parentSpellingTaxon = await fetchTaxon(conn, opinion.parent_spelling_no);
            logger.trace("parentSpellingTaxon = ")
            logger.trace(parentSpellingTaxon)
        }

        if (
            //allowDuplicate || 
            ! await isDuplicate(conn, opinion)
        ) {

            //verify reference
            await verifyReference(conn, opinion.reference_no, opinion.pubyr);
            
            //Migrations (should probably be in seperate routine)
            let migrations1 = {}, migrations2 = {};
            if ("misspelling of" === opinion.status) {
                if (opinion.parent_spelling_no) {
                    migrations2 = await getOpinionsToMigrate(conn, opinion.parent_no, opinion.child_no, opinion.opinion_no)
                    if (migrations2.error)	{
                        const error = new Error(`${childSpellingTaxon.name} can't be a misspelling of ${parentTaxon.name} because there is already a '$error' opinion linking them, so they must be biologically distinct`);
                        error.statusCode = 400
                        throw error				
                    } 
                }
            }
            if (opinion.child_spelling_no) {
                migrations1 = getOpinionsToMigrate(conn, opinion.child_no, $opinion.child_spelling_no, opinion.opinion_no);
                if (migrations1.error && childSpellingTaxon && childTaxon && childSpellingTaxon.name != childTaxon.name )	{
                    const error = new Error(`${childSpellingTaxon.name} can't be an alternate spelling of ${childTaxon.name} because there is already a '${migrations1.status}' opinion linking them, so they must be biologically distinct"`);
                    error.statusCode = 400
                    throw error				
                } 
            }

            if (!allowMigrations && (migrations1 || migrations2)) {
                let msg = "Opinions to migrate:"
                migrations1.opinions.reduce((acc, opinion) => {
                    if (migrations1.opinions || migrations2.opinions) {
                        msg = `${msg}
                        ${childSpellingTaxon.name} already exists with opinions classifying it`;
                    } else if (migrations1.parents || migrations2.parents) {
                        msg = `${msg}
                        ${childSpellingTaxon.name} already exists`;
                    }
                    if ("misspelling of" !== opinion.status) {
                        /*
                        msg = `${msg}
                        If '${childTaxon.name}' is actually a misspelling of '${childSpellingTaxon.name}', please enter 'Invalid, this taxon is a misspelling of $childSpellingName' in the 'How was it classified' section, and enter '$childName' in the 'How was it spelled' section.<br>";
                        */
                       //I actually have no idea what should happen here.
                    }
                    if (migrations1.opinions) {
                        msg = `${msg}
                        If '${childSpellingTaxon.name}' is actually a homonym (same spelling, totally different taxon), you must create a new '${childSpellingTaxon.name}'`;
                    }
                    return msg
                }, msg)

                msg = `${msg}
                If you wish to proceed, resubmit with allowMigrations set to true.
                
                Be aware that, if you do this, this name will be combined permanently with the existing one. This means: 
                    --'${childTaxon.name}' will be considered the 'original' name. If another spelling is actually the original one, please enter opinions based on that other name. 
                    -- authority information will be made identical and linked.  Changes to one name's authority record will be copied over automatically to the other's.
                    -- these names will be considered the same when editing/adding opinions, downloading, searching, etc.`
                error.statusCode = 400
                throw error				
            }

            const insertSQL = `insert into opinions (${insertAssets.propStr}) values (${insertAssets.valStr}) returning opinion_no`
            logger.trace(insertSQL)
            logger.trace(insertAssets.values)
        
            if (migrations1 || migrations2)	{

                //TODO: Define resetOriginalNo
                for (opinion of migrations1.opinions) {
                    await resetOriginalNo(conn, opinion.child_no, opinion);
                }

                for (opinion of migrations2.opinions) {
                    await resetOriginalNo(conn, opinion.child_no, opinion);
                }

       
                //We also have to modify the parent_no so it points to the original combination of any taxa classified into any migrated opinion
                if (migrations1.parents || migrations2.parents) {
                    const parents = migrations1.parents ?
                        migrations1.parents.concat(migrations2.parents) :
                        migrations2.parents;
                    const sql = `
                        UPDATE 
                            opinions 
                        SET 
                            modified=modified, 
                            parent_no=:parent_no 
                        WHERE 
                            parent_no IN (${parents.reduce((acc, parent, idx) => idx === 0 ? parent : `${acc}, ${parent}`), ''} 
                    `;
                    await conn.query({ 
                        namedPlaceholders: true, 
                        sql: sql
                    }, {parent_no: opinion.child_no});
                }
                
                //TODO: these
                /*
                # Make sure opinions authority information is synchronized with the original combination
                PBDB::Taxon::propagateAuthorityInfo($dbt,$q,$fields{'child_no'});
        
                # Remove any duplicates that may have been added as a result of the migration
                $resultOpinionNumber = removeDuplicateOpinions($dbt,$s,$fields{'child_no'},$resultOpinionNumber);
                */
            }
        

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