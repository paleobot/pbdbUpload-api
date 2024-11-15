import {prepareInsertAssets, prepareUpdateAssets} from '../../../../util.js'
import {logger} from '../../../../app.js'

const isDuplicate = async (conn, reference) => {
    logger.info("isDuplicate");

    //TODO: Add spatial
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                reference_no 
            from 
                refs 
            where
                ${reference.doi ? 
                    `doi = :doi or` :
                    ''
                }
                match(reftitle) against (:reftitle) > 20
                ${reference.reference_no ? 
                    `and reference_no != :reference_no` :
                    ''
                }
        `

    }, {
        doi: reference.doi,
        reftitle: reference.reftitle, 
        pubyr: reference.pubyr,
        reference_no: reference.reference_no,
    });
    
    return rows.length > 0;
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}

export const getReferences = async (pool, limit, offset) => {
    //logger.info("getReferences");
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from refs";
      let sql = "SELECT reftitle from refs";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        refs: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getReference = async (pool, id) => {
    //logger.info("getReferences");
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query("SELECT * from refs where reference_no = " + id);
      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createReference = async (pool, reference, user, allowDuplicate) => {
    logger.info("createReference");
    logger.trace(reference);
	
    const insertAssets = prepareInsertAssets(reference);
	insertAssets.propStr += `, enterer, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer = user.userName; //TODO: consider stripping to first initial
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;

	const insertSQL = `insert into refs (${insertAssets.propStr}) values (${insertAssets.valStr}) returning reference_no`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, reference)
        ) {
            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);

            reference.reference_no = res[0].reference_no;

            await conn.commit();
            return reference;
        } else {
            const error = new Error(`Duplicate reference found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
            error.statusCode = 400
            throw error				
        }
    } catch (err) {
        logger.error("Error loading data, reverting changes: ", err);
        logger.error(err)
        await conn.rollback();
        throw err
    } finally {
        if (conn) conn.release(); 
    }
}

export const updateReference = async (pool, patch, user, allowDuplicate, mergedReference) => {
    logger.info("updateReference");
    logger.trace(user)
    logger.trace(patch);

    const updateAssets = prepareUpdateAssets(patch);
    updateAssets.propStr += `, modifier = :modifier, modifier_no = :modifier_no`
    updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.reference_no = mergedReference.reference_no;
    
    const updateSQL = `update refs set ${updateAssets.propStr} where reference_no = :reference_no`
    logger.trace(updateSQL)
    logger.trace(updateAssets.values)

    //return true;
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedReference)
        ) {

            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate reference found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

