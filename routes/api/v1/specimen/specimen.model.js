import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

const isDuplicate = async (conn, specimen) => {
    logger.info("isDuplicate");

    //TODO: Add spatial
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                specimen_no 
            from 
                specimens 
            where 
                specimen_id = :specimen_id
                ${specimen.specimen_no ? 
                    `and specimen_no != :specimen_no` :
                    ''
                }
        `
    }, {
        specimen_id: specimen.specimen_id || null, 
        specimen_no: specimen.specimen_no || null, 
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

const verifyOccurrence = async (conn, occurrenceID) => {
    const testResult = await conn.query("select occurrence_no from occurrences where occurrence_no = ?", [occurrenceID]);
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized occurrence: ${occurrenceID}`);
        error.statusCode = 400
        throw error
    }
}

const verifyTaxon = async (conn, taxonID) => {
    logger.trace("verifyTaxon")
    const testResult = await conn.query("select taxon_no from authorities where taxon_no = ?", [taxonID]);
    logger.trace(testResult.length)
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized taxon: ${taxonID}`);
        error.statusCode = 400
        throw error
    }
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}

export const getSpecimens = async (pool, limit, offset) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from specimens";
      let sql = "SELECT specimen_no, comments from specimens order by specimen_no";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        specimens: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getSpecimen = async (pool, id) => {
    logger.info("getSpecimen");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            o.*
        from 
            specimens o
        where 
            o.specimen_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createSpecimen = async (pool, specimen, user, allowDuplicate) => {
    logger.info("createSpecimen");
    logger.trace(specimen);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(specimen, []);
	insertAssets.propStr += `, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;

    //derived properties
    
	const insertSQL = `insert into specimens (${insertAssets.propStr}) values (${insertAssets.valStr}) returning specimen_no`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, specimen)
        ) {
            //verify fks
            await verifyReference(conn, specimen.reference_no);
            await verifyOccurrence(conn, specimen.occurrence_no);
            await verifyTaxon(conn, specimen.taxon_no);
            
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].specimen_no)

            specimen.specimen_no = res[0].specimen_no;
                        
            await conn.commit();
            return specimen;
        } else {
            const error = new Error(`Duplicate specimen found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateSpecimen = async (pool, patch, user, allowDuplicate, mergedSpecimen) => {
    logger.info("updateSpecimen");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedSpecimen)

    const updateAssets = prepareUpdateAssets(patch, []);
    
    updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier_no = :modifier_no`
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.specimen_no = mergedSpecimen.specimen_no;

    //derived properties

    const updateSQL = `update specimens set ${updateAssets.propStr} where specimen_no = :specimen_no`
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedSpecimen)
        ) {

            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no);
            }
            if (patch.occurrence_no || patch.occurrence_no === 0) {
                await verifyOccurrence(conn, patch.occurrence_no);
            }
            if (patch.taxon_no || patch.taxon_no === 0) {
                await verifyTaxon(conn, patch.taxon_no);
            }

            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate specimen found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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