import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds, parseTaxon} from '../../../../util.js'
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

/*
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
*/

export const fetchClosestTaxon = async (conn, occurrence) => {
    logger.trace("fetchClosestTaxon")

    const sql = `
        select 
            taxon_no, taxon_name, taxon_rank 
        from 
            authorities
        where
            taxon_name = "${occurrence.genus_name}${occurrence.subgenus_name ? ` (${occurrence.subgenus_name})` : ''}${occurrence.species_name ? ` ${occurrence.species_name}` : ''}${occurrence.subspecies_name ? ` ${occurrence.subspecies_name}` : ''}"
        union
        select 
            taxon_no, taxon_name, taxon_rank 
        from 
            authorities
        where
            taxon_name = "${occurrence.genus_name}${occurrence.subgenus_name ? ` (${occurrence.subgenus_name})` : ''}${occurrence.species_name ? ` ${occurrence.species_name}` : ''}"
        union
        select 
            taxon_no, taxon_name, taxon_rank 
        from 
            authorities
        where
            taxon_name = "${occurrence.genus_name}${occurrence.subgenus_name ? ` (${occurrence.subgenus_name})` : ''}"
        union
        select 
            taxon_no, taxon_name, taxon_rank 
        from 
            authorities
        where
            taxon_name = "${occurrence.genus_name}"
    `
    console.log(sql)

    const taxonResult = await conn.query(sql);
    if (taxonResult.length === 0) {
        return null
    }

    if (taxonResult.length > 1) {
        if (taxonResult[0].taxon_rank === taxonResult[1].taxon_rank) {
            const error = new Error(`Cannot assign taxon. The nearest taxon name (${taxonResult[0].taxon_name}) is a homonym. If this is expected, then resubmit with bypassTaxon set to true.`);
            error.statusCode = 409;
            throw error;
        }
    }
    
    logger.trace(taxonResult[0])

    const taxonParsed = [...taxonResult[0].taxon_name.matchAll(/^(?:(\p{Lu}\p{Ll}*) ?)(?:\((\p{Lu}\p{Ll}*)\) ?)?(\p{Ll}*)?(?: (\p{Ll}*))?/gu)]
    const genus = taxonParsed[0][1];
    const subgenus = taxonParsed[0][2];
    const species = taxonParsed[0][3];
    const subspecies = taxonParsed[0][4];

    return {
        id: taxonResult[0].taxon_no,
        rank: taxonResult[0].taxon_rank,
        name: taxonResult[0].taxon_name
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

export const createOccurrence = async (pool, occurrence, user, allowDuplicate, bypassTaxon) => {
    logger.info("createOccurrence");
    logger.trace(occurrence);
    logger.trace(user)

    //TODO: Assign _resos from taxon name? See OccurrenceEntry.pm line 759, 796

    if (occurrence.taxon_name) {
        const taxon = parseTaxon(occurrence.taxon_name, true);

        if (!taxon.genus ||
            (taxon.subspecies && !taxon.species)
        ) {
            const error = new Error(`Invalid taxon name: ${occurrence.taxon_name}`)
            error.statusCode = 400
            throw error
        }

        //NOTE: The occurrences table does not have a column for subspecies_name. I keep it separate here for use in fetchClosestTaxon. Then I merge it with species_name before passing the occurrence to prepareInsertAssets.
        //NOTE2: Subspecies name and reso appears to have been added to the occurrences table aroudn 2024/08/09. Verify this and get the latest db. Then update this code.
        occurrence.genus_name = taxon.genus;
        occurrence.subgenus_name = taxon.subgenus;
        occurrence.species_name = taxon.species;
        occurrence.subspecies_name = taxon.subspecies;
        occurrence.genus_reso = taxon.genusReso;
        occurrence.subgenus_reso = taxon.subgenusReso;
        occurrence.species_reso = taxon.speciesReso;
        //occurrence.subspecies_reso = taxon.subspeciesReso;
        delete occurrence.taxon_name;
    }
   
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (!bypassTaxon) {
            const taxon = await fetchClosestTaxon(conn, occurrence);
            if (taxon) {
                occurrence.taxon_no = taxon.id
            }
        }
        occurrence.species_name = `${occurrence.species_name}${occurrence.subspecies_name ? ` ${occurrence.subspecies_name}` : ''}`;
        delete occurrence.subspecies_name;

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, occurrence)
        ) {
            //verify references
            await verifyReference(conn, occurrence.reference_no);
            await verifyCollection(conn, occurrence.collection_no);
            
            const insertAssets = prepareInsertAssets(occurrence, []);
            insertAssets.propStr += `, enterer, enterer_no, authorizer_no`;
            insertAssets.valStr += `, :enterer, :enterer_no, :authorizer_no`;
            insertAssets.values.enterer = user.userName; //TODO: consider stripping to first initial
            insertAssets.values.enterer_no = user.userID;
            insertAssets.values.authorizer_no = user.authorizerID;
        
            const insertSQL = `insert into occurrences (${insertAssets.propStr}) values (${insertAssets.valStr}) returning occurrence_no`
            logger.trace(insertSQL)
            logger.trace(insertAssets.values)
        
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

export const updateOccurrence = async (pool, patch, user, allowDuplicate, bypassTaxon, mergedOccurrence) => {
    logger.info("updateOccurrence");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedOccurrence)

    /*
    if (patch.taxon_name) {
        const taxon = parseTaxon(patch.taxon_name);

        if (!taxon.genus ||
            (taxon.subspecies && !taxon.species)
        ) {
            const error = new Error(`Invalid taxon name: ${occurrence.taxon_name}`)
            error.statusCode = 400
            throw error
        }

        patch.genus_name = taxon.genus;
        patch.subgenus_name = taxon.subgenus;
        patch.species_name = taxon.species;
        patch.subspecies_name = taxon.subspecies;
        delete patch.taxon_name;

        mergedOccurrence.genus_name = taxon.genus;
        mergedOccurrence.subgenus_name = taxon.subgenus;
        mergedOccurrence.species_name = taxon.species;
        mergedOccurrence.subspecies_name = taxon.subspecies;
        delete mergedOccurrence.taxon_name;
    }
    */

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (!bypassTaxon) {
            const taxon = await fetchClosestTaxon(conn, mergedOccurrence);
            if (taxon) {
                patch.taxon_no = taxon.id
                mergedOccurrence.taxon_no = taxon.id
            }
        }

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedOccurrence)
        ) {

            patch.species_name = `${patch.species_name}${patch.subspecies_name ? ` ${patch.subspecies_name}` : ''}`;
            delete patch.subspecies_name;

            const updateAssets = prepareUpdateAssets(patch, []);
    
            updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier = :modifier, modifier_no = :modifier_no`
            updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
            updateAssets.values.modifier_no = user.userID;
            updateAssets.values.occurrence_no = mergedOccurrence.occurrence_no;
        
            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no);
            }
            if (patch.collection_no || patch.collection_no === 0) {
                await verifyCollection(conn, patch.collection_no);
            }

            const updateSQL = `update occurrences set ${updateAssets.propStr} where occurrence_no = :occurrence_no`
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