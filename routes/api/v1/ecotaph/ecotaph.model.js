import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

const isDuplicate = async (conn, ecotaph) => {
    logger.info("isDuplicate");

    //TODO: Add spatial
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                ecotaph_no 
            from 
                ecotaph 
            where 
                taxon_no = :taxon_no
                ${ecotaph.ecotaph_no ? 
                    `and ecotaph_no != :ecotaph_no` :
                    ''
                }
        `
    }, {
        taxon_no: ecotaph.taxon_no, 
        ecotaph_no: ecotaph.ecotaph_no || null 
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

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}

export const getEcotaphs = async (pool, limit, offset) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from ecotaph";
      let sql = "SELECT * from ecotaph order by ecotaph_no";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        ecotaphs: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getEcotaph = async (pool, id) => {
    logger.info("getEcotaph");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            o.*
        from 
        ecotaph o
        where 
            o.ecotaph_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createEcotaph = async (pool, ecotaph, user, allowDuplicate) => {
    logger.info("createEcotaph");
    logger.trace(ecotaph);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(ecotaph, []);
    insertAssets.propStr += `, enterer_no, authorizer_no`;
    insertAssets.valStr += `, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;

	const insertSQL = `insert into ecotaph (${insertAssets.propStr}) values (${insertAssets.valStr}) returning ecotaph_no`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, ecotaph)
        ) {
            //verify fks
            await verifyReference(conn, ecotaph.reference_no);
            
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].ecotaph_no)

            ecotaph.ecotaph_no = res[0].ecotaph_no;
                        
            await conn.commit();
            return ecotaph;
        } else {
            const error = new Error(`Duplicate ecotaph found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateEcotaph = async (pool, patch, user, allowDuplicate, mergedEcotaph) => {
    logger.info("updateEcotaph");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedEcotaph)

    const updateAssets = prepareUpdateAssets(patch, []);
    
    updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier_no = :modifier_no`
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.ecotaph_no = mergedEcotaph.ecotaph_no;

    const updateSQL = `update ecotaph set ${updateAssets.propStr} where ecotaph_no = :ecotaph_no`
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedEcotaph)
        ) {

            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no);
            }

            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate ecotaph found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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