import {prepareInsertAssets} from '../../../../util.js'
import {logger} from '../../../../app.js'

export const createCollection = async (pool, collection, user) => {
    logger.info("createCollection");
    logger.trace(collection);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(collection);
	insertAssets.propStr += `, enterer, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer = user.userName; //TODO: consider stripping to first initial
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;

	const insertSQL = `insert into collections (${insertAssets.propStr}) values (${insertAssets.valStr})`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        //logger.trace("before update")
        const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
        if (rs.affectedRows !== 1) throw new Error("Could not update person table");

        //logger.trace("before insert")
        const res = await conn.query({ 
            namedPlaceholders: true, 
            sql: insertSQL
        }, insertAssets.values);
        

        //logger.trace("before commit")
        await conn.commit();
        return res;
    } catch (err) {
        logger.error("Error loading data, reverting changes: ", err);
        logger.error(err)
        await conn.rollback();
    } finally {
        if (conn) conn.release(); //release to pool
    }
  
}