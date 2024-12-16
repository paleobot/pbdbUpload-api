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
            
            const taxon = await fetchTaxon(conn, occurrence.taxon_no);
            logger.trace("taxon = ")
            logger.trace(taxon)

            if (
                ("genus" === taxon.rank && !occurrence.genus_reso) ||
                ("subgenus" === taxon.rank && !occurrence.subgenus_reso) ||
                ("species" === taxon.rank && !occurrence.species_reso)
            ) {
                const error = new Error(`Taxon has rank ${taxon.rank}. ${taxon.rank}_reso is required.`)
                error.statusCode = 400
                throw error
            }

            if ((
                "genus" === taxon.rank && (
                    occurrence.subgenus_reso || 
                    occurrence.species_reso || 
                    occurrence.subspecies_reso
                )) ||  (
                "subgenus" === taxon.rank && (
                    occurrence.species_reso || 
                    occurrence.subspecies_reso
                )) || (
                "species" === taxon.rank && (
                    occurrence.subspecies_reso
                )) 
            ) {
                const error = new Error(`Taxon has rank ${taxon.rank}. Resolutions below that rank are not allowed.`)
                error.statusCode = 400
                throw error
            }
        
            //properties derived from taxon
            insertAssets.propStr += `, genus_name`;
            insertAssets.valStr += `, :genus_name`;
            insertAssets.values.genus_name = taxon.genus; 
            if (taxon.subgenus) {
                insertAssets.propStr += ', subgenus_name';
                insertAssets.valStr += ', :subgenus_name';
                insertAssets.values.subgenus_name = taxon.subgenus;
            }
            if (taxon.species) {
                insertAssets.propStr += ', species_name';
                insertAssets.valStr += ', :species_name';
                insertAssets.values.species_name = taxon.species; 
            }

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

            const taxon = await fetchTaxon(conn, mergedOccurrence.taxon_no);
            logger.trace("taxon = ")
            logger.trace(taxon)

            if (
                ("genus" === taxon.rank && !mergedOccurrence.genus_reso) ||
                ("subgenus" === taxon.rank && !mergedOccurrence.subgenus_reso) ||
                ("species" === taxon.rank && !mergedOccurrence.species_reso)
            ) {
                const error = new Error(`Taxon has rank ${taxon.rank}. ${taxon.rank}_reso is required.`)
                error.statusCode = 400
                throw error
            }

            if ((
                "genus" === taxon.rank && (
                    mergedOccurrence.subgenus_reso || 
                    mergedOccurrence.species_reso || 
                    mergedOccurrence.subspecies_reso
                )) ||  (
                "subgenus" === taxon.rank && (
                    mergedOccurrence.species_reso || 
                    mergedOccurrence.subspecies_reso
                )) || (
                "species" === taxon.rank && (
                    mergedOccurrence.subspecies_reso
                )) 
            ) {
                const error = new Error(`Taxon has rank ${taxon.rank}. Resolutions below that rank are not allowed.`)
                error.statusCode = 400
                throw error
            }
        
            //properties derived from taxon
            updateAssets.propStr += `, genus_name = :genus_name`;
            updateAssets.values.genus_name = taxon.genus; 
            if (taxon.subgenus) {
                updateAssets.propStr += ', subgenus_name = :subgenus_name';
                updateAssets.values.subgenus_name = taxon.subgenus;
            }
            if (taxon.species) {
                updateAssets.propStr += ', species_name = :species_name';
                updateAssets.values.species_name = taxon.species; 
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