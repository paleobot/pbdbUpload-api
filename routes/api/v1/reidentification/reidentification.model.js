import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

const isDuplicate = async (conn, reidentification) => {
    logger.info("isDuplicate");

    //TODO: Add spatial
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                reid_no 
            from 
                reidentifications 
            where 
                genus_reso = :genus_reso and
                genus_name = :genus_name and
                subgenus_reso = :subgenus_reso and
                subgenus_name = :subgenus_name and
		        species_reso = :species_reso and
                species_name = :species_name and
                taxon_no = :taxon_no and
                collection_no = :collection_no
                ${reidentification.reid_no ? 
                    `and reid_no != :reid_no` :
                    ''
                }
        `
    }, {
        genus_reso: reidentification.genus_reso || null, 
        genus_name: reidentification.genus_name || null, 
        subgenus_reso: reidentification.subgenus_reso || null, 
        subgenus_name: reidentification.subgenus_name || null, 
        species_reso: reidentification.species_reso || null, 
        species_name: reidentification.species_name || null, 
        taxon_no: reidentification.taxon_no || null, 
        collection_no: reidentification.collection_no || null, 
        reid_no: reidentification.reid_no || null, 
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

const verifyOccurrence = async (conn, occurrenceID) => {
    const testResult = await conn.query("select occurrence_no from occurrences where occurrence_no = ?", [occurrenceID]);
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized occurrence: ${occurrenceID}`);
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

export const getReidentifications = async (pool, limit, offset) => {
    //logger.info("getReferences");
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from reidentifications";
      let sql = "SELECT reid_no, genus_name from reidentifications order by reid_no";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        reidentifications: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getReidentification = async (pool, id) => {
    logger.info("getReidentification");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            r.*
        from 
        reidentifications r
        where 
            r.reid_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createReidentification = async (pool, reidentification, user, allowDuplicate) => {
    logger.info("createReidentification");
    logger.trace(reidentification);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(reidentification, []);
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
            ! await isDuplicate(conn, reidentification)
        ) {
            //verify references
            await verifyReference(conn, reidentification.reference_no);
            await verifyCollection(conn, reidentification.collection_no);
            await verifyOccurrence(conn, reidentification.occurrence_no);
            
            const taxon = await fetchTaxon(conn, reidentification.taxon_no);
            logger.trace("taxon = ")
            logger.trace(taxon)

            if (
                ("genus" === taxon.rank && !reidentification.genus_reso) ||
                ("subgenus" === taxon.rank && !reidentification.subgenus_reso) ||
                ("species" === taxon.rank && !reidentification.species_reso)
            ) {
                const error = new Error(`Taxon has rank ${taxon.rank}. ${taxon.rank}_reso is required.`)
                error.statusCode = 400
                throw error
            }

            if ((
                "genus" === taxon.rank && (
                    reidentification.subgenus_reso || 
                    reidentification.species_reso || 
                    reidentification.subspecies_reso
                )) ||  (
                "subgenus" === taxon.rank && (
                    reidentification.species_reso || 
                    reidentification.subspecies_reso
                )) || (
                "species" === taxon.rank && (
                    reidentification.subspecies_reso
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

            const insertSQL = `insert into reidentifications (${insertAssets.propStr}) values (${insertAssets.valStr}) returning reid_no`
            logger.trace(insertSQL)
            logger.trace(insertAssets.values)
        
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].reid_no)

            reidentification.reid_no = res[0].reid_no;
                        
            await conn.commit();
            return reidentification;
        } else {
            const error = new Error(`Duplicate reidentification found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateReidentification = async (pool, patch, user, allowDuplicate, mergedReidentification) => {
    logger.info("updateReidentification");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedReidentification)

    const updateAssets = prepareUpdateAssets(patch, []);
    
    updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier = :modifier, modifier_no = :modifier_no`
    updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.reid_no = mergedReidentification.reid_no;

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedReidentification)
        ) {

            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no);
            }
            if (patch.collection_no || patch.collection_no === 0) {
                await verifyCollection(conn, patch.collection_no);
            }
            if (patch.occurrence_no || patch.occurrence_no === 0) {
                await verifyOccurrence(conn, patch.occurrence_no);
            }

            const taxon = await fetchTaxon(conn, mergedReidentification.taxon_no);
            logger.trace("taxon = ")
            logger.trace(taxon)

            if (
                ("genus" === taxon.rank && !mergedReidentification.genus_reso) ||
                ("subgenus" === taxon.rank && !mergedReidentification.subgenus_reso) ||
                ("species" === taxon.rank && !mergedReidentification.species_reso)
            ) {
                const error = new Error(`Taxon has rank ${taxon.rank}. ${taxon.rank}_reso is required.`)
                error.statusCode = 400
                throw error
            }

            if ((
                "genus" === taxon.rank && (
                    mergedReidentification.subgenus_reso || 
                    mergedReidentification.species_reso || 
                    mergedReidentification.subspecies_reso
                )) ||  (
                "subgenus" === taxon.rank && (
                    mergedReidentification.species_reso || 
                    mergedReidentification.subspecies_reso
                )) || (
                "species" === taxon.rank && (
                    mergedReidentification.subspecies_reso
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

            const updateSQL = `update reidentifications set ${updateAssets.propStr} where reid_no = :reid_no`
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
            const error = new Error(`Duplicate reidentification found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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