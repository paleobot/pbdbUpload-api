//import {getPropertiesForPubType} from './reference.schema.js'
import {prepareInsertAssets} from '../../../../util.js'

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
      //logger.silly(rows);
      fastify.log.trace(rows);
      fastify.log.trace(count);
      fastify.log.trace(count.count);
      return {
        refs: rows,
        count: count[0].count
      }
    // rows: [ {val: 1}, meta: ... ]

	//const res = await conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
	// res: { affectedRows: 1, insertId: 1, warningStatus: 0 }

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
      //logger.silly(rows);
      return rows;
    // rows: [ {val: 1}, meta: ... ]

	//const res = await conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
	// res: { affectedRows: 1, insertId: 1, warningStatus: 0 }

    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createReferencex = async (pool, reference, fastify) => {
    fastify.log.info("createReference");
    fastify.log.trace(reference);
    let conn;
    try {
        conn = await pool.getConnection();
        const res = await conn.query(`insert into ddm_table01 (name, notes) values ('${reference.name}', '${reference.notes}')`);
        fastify.log.trace(res);
        fastify.log.trace(res.affectedRows)
        //logger.silly(JSON.stringify(res));
        return res.affectedRows;
        // rows: [ {val: 1}, meta: ... ]

        //const res = await conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
        // res: { affectedRows: 1, insertId: 1, warningStatus: 0 }

    } finally {
        if (conn) conn.release(); //release to pool
    }
}

export const createReference = async (pool, reference, user, fastify) => {
    fastify.log.info("createReference");
    fastify.log.trace(reference);
	
    /*
    let properties = Object.keys(reference); //already validate by route logic
    fastify.log.trace(properties)

    //const propMaster = getPropertiesForPubType(reference.publication_type, fastify)
    //fastify.log.trace(propMaster)

	//Check for required properties (Arguably, we shouldn't do this)
	//here. It's business logic and we don't care about that here.
	//const propSet = new Set(properties);
    //propMaster.requiredProps.forEach(prop => {
	//	if (!propSet.has(prop)) {
	//		throw new Error(`Missing required property: ${prop}`)
	//	}
    //})

	let propStr = '';
	let valStr = '';
	const values = {};
	properties.forEach((prop, index) => {
		//Check if known property (We do need to do this here, though.
		//A bad prop name would mess up our insert.)
		//if (!propMaster.allowedProps.has(prop)) {
		//	throw new Error(`Unrecognized propery: ${prop}`)
		//}
		propStr += index === 0 ? ` ${prop}` : `, ${prop}`;
		valStr += index === 0 ? `:${prop}` : `, :${prop}`;
        values[prop] = reference[prop]
	})
    */

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
