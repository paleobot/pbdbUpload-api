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
      const rows = await conn.query("SELECT reftitle from refs where reference_no = " + id);
      //logger.silly(rows);
      return rows;
    // rows: [ {val: 1}, meta: ... ]

	//const res = await conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
	// res: { affectedRows: 1, insertId: 1, warningStatus: 0 }

    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createReference = async (pool, reference, fastify) => {
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
