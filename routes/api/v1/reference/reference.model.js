import {prepareInsertAssets, prepareUpdateAssets} from '../../../../util.js'

export const getReferences = async (pool, limit, offset, fastify) => {
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
      fastify.log.trace(rows);
      fastify.log.trace(count);
      fastify.log.trace(count.count);
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

export const createReference = async (pool, reference, user, fastify) => {
    fastify.log.info("createReference");
    fastify.log.trace(reference);
	
    const insertAssets = prepareInsertAssets(reference);
	insertAssets.propStr += `, enterer, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer = user.userName; //TODO: consider stripping to first initial
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;

	const insertSQL = `insert into refs (${insertAssets.propStr}) values (${insertAssets.valStr})`
	fastify.log.trace(insertSQL)
	fastify.log.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
        if (rs.affectedRows !== 1) throw new Error("Could not update person table");

        const res = await conn.query({ 
            namedPlaceholders: true, 
            sql: insertSQL
        }, insertAssets.values);

        await conn.commit();
        return res;
    } catch (err) {
        fastify.log.error("Error loading data, reverting changes: ", err);
        await conn.rollback();
    } finally {
        if (conn) conn.release(); 
    }
}

export const updateReference = async (pool, patch, referenceID, user, fastify) => {
    fastify.log.info("updateReference");
    fastify.log.trace(user)
    fastify.log.trace(patch);

    const updateAssets = prepareUpdateAssets(patch);
    updateAssets.propStr += `, modifier = :modifier, modifier_no = :modifier_no`
    updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.reference_no = referenceID;
    
    const updateSQL = `update refs set ${updateAssets.propStr} where reference_no = :reference_no`
    fastify.log.trace(updateSQL)
    fastify.log.trace(updateAssets.values)

    //return true;
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
        if (rs.affectedRows !== 1) throw new Error("Could not update person table");

        const res = await conn.query({ 
            namedPlaceholders: true, 
            sql: updateSQL
        }, updateAssets.values);

        await conn.commit();
        return res;
    } catch (err) {
        fastify.log.error("Error loading data, reverting changes: ", err);
        await conn.rollback();
    } finally {
        if (conn) conn.release(); 
    }
    
}

