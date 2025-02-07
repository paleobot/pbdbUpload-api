import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds, parseTaxon} from '../../../../util.js'
import {logger} from '../../../../app.js'
import { fetchClosestTaxon } from '../occurrence/occurrence.model.js';

//TODO: Review https://github.com/paleobiodb/classic/blob/master/lib/PBDB/Taxon.pm to better understand how this table is used.

const isDuplicate = async (conn, authority) => {
    logger.info("isDuplicate");

    //TODO: Add verify what constitutes a dup
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                taxon_no 
            from 
                authorities 
            where 
                reference_no = :reference_no and
                taxon_name = :taxon_name
                ${authority.taxon_no ? 
                    `and taxon_no != :taxon_no` :
                    ''
                }
        `
    }, {
        reference_no: authority.reference_no || null, 
        taxon_name: authority.taxon_name || null, 
    });
    
    return rows.length > 0;
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

export const getAuthorities = async (pool, limit, offset) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from authorities";
      let sql = "SELECT taxon_no, genus_name from authorities order by taxon_no";
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

export const getAuthority = async (pool, id) => {
    logger.info("getAuthority");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            a.*
        from 
            authorities a
        where 
            a.taxon_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

const getOriginalCombination = async(conn, taxon_no) => {
    logger.trace("getOriginalCombination")
    logger.trace("taxon_no = " + taxon_no)

    let results = await conn.query(
        `SELECT 
            DISTINCT o.child_no 
        FROM 
            opinions o 
        WHERE 
            o.child_spelling_no=?`,
        [taxon_no]
    );
    delete results.meta;
    logger.trace("results 01 = ")
    logger.trace(results)
    
    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.child_no 
            FROM 
                opinions o 
            WHERE 
                o.child_no=?`,
            [taxon_no]
        )
    }
    delete results.meta;
    logger.trace("results 02 = ")
    logger.trace(results)

    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.parent_no AS child_no 
            FROM 
                opinions o 
            WHERE 
                o.parent_spelling_no=?`,
            [taxon_no]
        )
    }
    delete results.meta;
    logger.trace("results 03 = ")
    logger.trace(results)

    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.parent_no AS child_no 
            FROM 
                opinions o 
            WHERE 
                o.parent_no=?`,
            [taxon_no]
        )
    }
    delete results.meta;
    logger.trace("results 04 = ")
    logger.trace(results)

    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.child_no 
            FROM 
                opinions o 
            WHERE 
                o.parent_spelling_no=? AND 
                o.status='misspelling of'`,
            [taxon_no]
        )
        delete results.meta;
        logger.trace("results 05 = ")
        logger.trace(results)
    
        if (results.length === 0) {
            return taxon_no;
        } else {
            return results[0].child_no;
        }        
    } else if (results.length === 1){
        return results[0].child_no
    } else {
        logger.trace("weird case")
        //Weird case caused by bad data: two original combinations numbers.  In that case use the combination with the oldest record.  The other "original" name is probably a misspelling or such and falls by he wayside
        results = await conn.query(
            `SELECT 
                o.child_no, 
                o.opinion_no,
                IF (
                    o.pubyr IS NOT NULL AND 
                    o.pubyr != '' AND 
                    o.pubyr != '0000', 
                    o.pubyr, 
                    r.pubyr
                ) as pubyr
            FROM 
                opinions o
                LEFT JOIN refs r ON r.reference_no=o.reference_no
            WHERE 
                o.child_no IN (${results.map(result => result.child_no)},)
            ORDER BY 
                pubyr ASC, 
                opinion_no ASC 
            LIMIT 1`
        )
        return results[0].child_no
    }
}

const computeMatchLevel = (taxon1, taxon2) => {
    logger.trace("computeMatchLevel")
    logger.trace("taxon1 = ") 
    logger.trace(taxon1)
    logger.trace("taxon2 = ") 
    logger.trace(taxon2)

    let matchLevel = 0;
    if (!taxon1.genus  || !taxon2.genus) {
        return matchLevel
    }

    if (taxon2.species) {
        if (
            taxon1.genus === taxon2.genus && 
            taxon1.subgenus === taxon2.subgenus && 
            taxon1.species === taxon2.species
        ) {
                matchLevel = 30; //Exact match
        } else if (
            taxon1.genus === taxon2.genus && 
            taxon1.species && taxon2.species && taxon1.species === taxon2.species
        ) {
            matchLevel = 28; //Genus and species match, next best thing
        } else if (
            taxon1.genus === taxon2.subgenus && 
            taxon1.species && taxon2.species && taxon1.species === taxon2.species
        ) {
            matchLevel = 27; //The authorities subgenus being used as genus
        } else if (
            taxon1.subgenus === taxon2.genus && 
            taxon1.species && taxon2.species && taxon1.species === taxon2.species
        ) {
            matchLevel = 26; //The authorities genus being used as a subgenus
        } else if (
            taxon1.subgenus && taxon2.subgenus && taxon1.subgenus === taxon2.subgenus && 
            taxon1.species && taxon2.species && taxon1.species === taxon2.species
        ) {
            matchLevel = 25; //Genus don't match, but subgenus/species does, pretty weak
        } 
    } else if (taxon2.subgenus) {
        if (taxon1.genus === taxon2.genus  &&
            taxon1.subgenus === taxon2.subgenus) {
                matchLevel = 19; //Genus and subgenus match
        } else if (taxon1.genus === taxon2.subgenus) {
            matchLevel = 17; //The authorities subgenus being used a genus
        } else if (taxon1.subgenus === taxon2.genus) {
            matchLevel = 16; //The authorities genus being used as a subgenus
        } else if (taxon1.subgenus === taxon2.subgenus) {
            matchLevel = 14; //Subgenera match up but genera don't, very junky
        }
    } else {
        if (taxon1.genus === taxon2.genus) {
            matchLevel = 18; //Genus matches at least
        } else if (taxon1.subgenus === taxon2.genus) {
            matchLevel = 15; //The authorities genus being used as a subgenus
        }
    }

    logger.trace("matchLevel = " + matchLevel)
    return matchLevel;
}

const isHomonym = async (conn, authority) => {
    const tR = await conn.query (
        `select 
            a.taxon_no,
            a.taxon_rank,
            a.taxon_name,
            if(a.ref_is_authority like 'YES', r.pubyr, a.pubyr) as pubyr, 
            if(a.ref_is_authority like 'YES', r.author1last, a.author1last) as author1last, 
            if(a.ref_is_authority like 'YES', r.author2last, a.author2last) as author2last 
        from 
            pbdb.authorities a
            left join pbdb.refs r on r.reference_no = a.reference_no  
        where 
            a.taxon_name = ?`, 
        [authority.taxon_name]
    );
    delete tR.meta;
    logger.trace("tR = ")
    logger.trace(tR)

    const taxonNumbers = [];
    let idx = 0; 
    for (let idx = 0; idx < tR.length; idx++) {
        const taxon1 = tR[idx]  
        logger.trace("tR iteration " + idx)
        logger.trace(taxon1)
        const origTaxon1 = await getOriginalCombination(conn, taxon1.taxon_no);
        logger.trace("origTaxon1 = ")
        logger.trace(origTaxon1)
        let isSameTaxon = false;
        for (let jdx = idx+1; jdx < tR.length; jdx++ ) {
            const taxon2 = tR[jdx] 
            const origTaxon2 = await getOriginalCombination(conn, taxon2.taxon_no);
            logger.trace("inner iteration " + jdx)
            logger.trace("origTaxon2 = ")
            logger.trace(origTaxon2)
            isSameTaxon = ((origTaxon1 === origTaxon2) ||
                            (taxon1.author1last && 
                            taxon1.author1last === taxon2.author1last &&
                            taxon1.author2last === taxon2.author2last &&
                            taxon1.pubyr === taxon2.pubyr))
        }
        if (!isSameTaxon) {
            taxonNumbers.push(taxon1.taxon_no)
        }
    }

    logger.trace("taxonNumbers = ")
    logger.trace(taxonNumbers)

    return (taxonNumbers.length > 1)
}

const updateOccurrences = async (conn, authority, isUpdate) => {
    logger.trace("updateOccurrences")

    //TODO: Not sure why we're doing this
    if ("subspecies" === authority.taxon_rank) {
        logger.trace("subspecies, returning")
        return;
    }
    
    //If this was an update to an existing authority record, there may be occurrences whose taxon_no is no longer valid. Find all occurrence records currently fked to this authority record and reassign fk if necessary.
    if (isUpdate) {
        logger.trace("processing as update")
        const tR = await conn.query (
            `select
                *
            from
                occurrences
            where
                taxon_no = ?`,
            [authority.taxon_no]
        );
        delete tR.meta;
        logger.trace("tR = ")
        logger.trace(tR)

        for (const occurrence of tR) {
            logger.trace("tR iteration, occurrence = ")
            delete occurrence.meta
            logger.trace(occurrence)

            const newTaxon = await fetchClosestTaxon(conn, occurrence)
            logger.trace("newTaxon = ")
            logger.trace(newTaxon)

            if (newTaxon.id !== occurrence.taxon_no) {
                /* This threw a sql error around ":taxon_no". No idea why
                await conn.query(
                    `update
                        occurrences
                    set
                        taxon_no = :taxon_no
                    where
                        occurrence_no = :occurrence_no`,
                    {
                        taxon_no: newTaxon.id, 
                        occurrence_no: occurrence.occurrence_no
                    }
                )
                */
                await conn.query(
                    `update
                        occurrences
                    set
                        taxon_no = ${newTaxon.id}
                    where
                        occurrence_no = ${occurrence.occurrence_no}`
                )
            }
        }
    } 

    //Find all occurrence records to which this new authority should be applied
    const parsedTaxon = parseTaxon(authority.taxon_name)
    logger.trace("parsedTaxon =")
    logger.trace(parsedTaxon)
    const higherNames = [parsedTaxon.genus];
    if (parsedTaxon.subgenus) {
        higherNames.push(parsedTaxon.subgenus)
    }
    logger.trace("higherNames = ")
    logger.trace(higherNames)

    const sqlQueries = [
        `SELECT 
            o.occurrence_no,
            o.taxon_no,
            o.genus_name,
            o.subgenus_name,
            o.species_name,
            a.taxon_name,
            a.taxon_rank 
        FROM 
            occurrences o 
            LEFT JOIN 
                authorities a ON o.taxon_no=a.taxon_no
        WHERE 
            o.genus_name IN (${higherNames.reduce((nameStr, name, idx) => {
                if (idx === 0) return `"${name}"`
                else return `${nameStr}, "${name}"`
            }, "")})`, 
        `SELECT 
            re.reid_no,
            re.taxon_no,
            re.genus_name,
            re.subgenus_name,
            re.species_name,
            a.taxon_name,
            a.taxon_rank            
        FROM 
            reidentifications re 
            LEFT JOIN 
                authorities a ON re.taxon_no=a.taxon_no
        WHERE 
            re.genus_name IN (${higherNames.reduce((nameStr, name, idx) => {
                if (idx === 0) return `"${name}"`
                else return `${nameStr}, "${name}"`
            }, "")})`,
        `SELECT 
            o.occurrence_no,
            o.taxon_no,
            o.genus_name,
            o.subgenus_name,
            o.species_name,
            a.taxon_name,
            a.taxon_rank 
        FROM 
            occurrences o 
            LEFT JOIN 
                authorities a ON o.taxon_no=a.taxon_no
        WHERE 
            o.subgenus_name IN (${higherNames.reduce((nameStr, name, idx) => {
                if (idx === 0) return `"${name}"`
                else return `${nameStr}, "${name}"`
            }, "")})`,
        `SELECT 
            re.reid_no,
            re.taxon_no,
            re.genus_name,
            re.subgenus_name,
            re.species_name,
            a.taxon_name,
            a.taxon_rank            
        FROM 
            reidentifications re 
            LEFT JOIN 
                authorities a ON re.taxon_no=a.taxon_no
        WHERE 
            re.subgenus_name IN (${higherNames.reduce((nameStr, name, idx) => {
                if (idx === 0) return `"${name}"`
                else return `${nameStr}, "${name}"`
            }, "")})`    
    ];
    if (parsedTaxon.species) {
        sqlQueries[0] = `${sqlQueries[0]} AND o.species_name LIKE "${parsedTaxon.species}"`;
        sqlQueries[1] = `${sqlQueries[1]} AND re.species_name LIKE "${parsedTaxon.species}"`;
        sqlQueries[2] = `${sqlQueries[2]} AND o.species_name LIKE "${parsedTaxon.species}"`;
        sqlQueries[3] = `${sqlQueries[3]} AND re.species_name LIKE "${parsedTaxon.species}"`;
    }

    const results = await Promise.all(sqlQueries.map(async sqlQuery => {
        return await conn.query(sqlQuery);
    }));
    logger.trace("results = ")
    logger.trace(results)

    const matchedOccurrences = [];
    const matchedReidentifications = [];

    for (const result of results) {
        logger.trace("results iteration, result = ")
        delete result.meta
        logger.trace(result)

        for (const row of result) {
            logger.trace("result iteration, row = ")
            delete row.meta
            logger.trace(row)

            let oldMatchLevel = 0;
            let newMatchLevel = 0;

            const taxonFromRow = {
                genus: row.genus_name,
                subgenus: row.subgenus_name,
                species: row.species_name,
                subspecies: row.subspecies_name
            }

            if (row.taxon_no) {
                const tmpParsedTaxon = parseTaxon(row.taxon_name);
                oldMatchLevel = computeMatchLevel(taxonFromRow, tmpParsedTaxon);
            }

            newMatchLevel = computeMatchLevel(taxonFromRow, parsedTaxon);

            logger.trace("oldMatchLevel = ")
            logger.trace(oldMatchLevel)
            logger.trace("newMatchLevel = ")
            logger.trace(newMatchLevel)
            if (newMatchLevel > oldMatchLevel) {
                if (row.reid_no) { 
                    matchedReidentifications.push(row.reid_no);
                } else {
                    matchedOccurrences.push(row.occurrence_no);
                }
            }

        }
    }
    logger.trace("matchedOccurrences = ")
    logger.trace(matchedOccurrences)
    logger.trace("matchedReidentifications = ")
    logger.trace(matchedReidentifications)

    if (matchedOccurrences && matchedOccurrences.length > 0) {
        const sql = `
            UPDATE 
                occurrences 
            SET 
                taxon_no=${authority.taxon_no} 
            WHERE 
                occurrence_no IN (${matchedOccurrences.reduce((occStr, occurrenceID, idx) => {
                    if (idx === 0) return `"${occurrenceID}"`
                    else return `${occStr}, "${occurrenceID}"`
                }, "")})
        `
        await conn.query(sql);
    }
    if (matchedReidentifications && matchedReidentifications.length > 0) {
        const sql = `
            UPDATE 
                reidentifications 
            SET 
                taxon_no=${authority.taxon_no} 
            WHERE 
                reid_no IN (${matchedReidentifications.reduce((accStr, reID, idx) => {
                    if (idx === 0) return `"${reID}"`
                    else return `${accStr}, "${reID}"`
                }, "")})
        `
        await conn.query(sql);
    }
}

export const createAuthority = async (pool, authority, user, allowDuplicate, bypassOccurrences) => {
    logger.info("createAuthority");
    logger.trace(authority);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(authority, []);
	insertAssets.propStr += `, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;
   
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, authority)
        ) {
            //verify references
            await verifyReference(conn, authority.reference_no, authority.pubyr);
       
            const insertSQL = `insert into authorities (${insertAssets.propStr}) values (${insertAssets.valStr}) returning taxon_no`
            logger.trace(insertSQL)
            logger.trace(insertAssets.values)

            //TODO: Update opinions table? See Taxon.pm, lines 772, 952, 963, 983, 999
            //XTODO: Cleanup discussion field? Link handling in discussion? See Taxon.pm, line 798
            //TODO: ref_is_authority weirdness? See Taxon.pm, lines 623 and 937
            //TODO: taxon_name check already handled in isDuplicate? See Taxon.pm, line 672
            //TODO: !! Update occurrences? See Taxon.pm line 1011
        
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            delete res.meta
            logger.trace(res)
            logger.trace(res[0].taxon_no)

            authority.taxon_no = res[0].taxon_no;

            if (!bypassOccurrences) {
                if (await isHomonym(conn, authority)) {
                    const error = new Error(`${authority.taxon_name} is a homonym. Occurrences cannot be updated. If this was intentional, then resubmit with bypassOccurrences set to true and reclassify occurrences manually.`);
                    error.statusCode = 409;
                    throw error;
                } else {
                    await updateOccurrences(conn, authority)
                }
            }
                        
            await conn.commit();
            return authority;
        } else {
            const error = new Error(`Duplicate authority found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateAuthority = async (pool, patch, user, allowDuplicate, bypassOccurrences, mergedAuthority) => {
    logger.info("updateAuthority");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedAuthority)

    const updateAssets = prepareUpdateAssets(patch, []);
    
    updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier_no = :modifier_no`
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.taxon_no = mergedAuthority.taxon_no;

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedAuthority)
        ) {

            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no, mergedAuthority.pubyr);
            }
        
            const updateSQL = `update authorities set ${updateAssets.propStr} where taxon_no = :taxon_no`
            logger.trace(updateSQL)
            logger.trace(updateAssets.values)
        
            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            if (!bypassOccurrences) {
                if (await isHomonym(conn, mergedAuthority)) {
                    const error = new Error(`${mergedAuthority.taxon_name} is a homonym. Occurrences cannot be updated. If this was intentional, then resubmit with bypassOccurrences set to true and reclassify occurrences manually.`);
                    error.statusCode = 409;
                    throw error;
                } else {
                    await updateOccurrences(conn, mergedAuthority, true)
                }
            }

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate authority found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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