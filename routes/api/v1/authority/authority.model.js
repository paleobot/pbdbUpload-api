import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

//TODO: Review https://github.com/paleobiodb/classic/blob/master/lib/PBDB/Taxon.pm to better understand how this table is used.

const isDuplicate = async (conn, authority) => {
    logger.info("isDuplicate");

    //TODO: Add verify what constitutes a dup
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                taxon_no 
            from 
                authorities 
            where 
                reference_no = :reference_no and
                taxon_name = :taxon_name
                ${authority.taxon_no ? 
                    `and taxon_no != :taxon_no` :
                    ''
                }
        `
    }, {
        reference_no: authority.reference_no || null, 
        taxon_name: authority.taxon_name || null, 
    });
    
    return rows.length > 0;
}

const verifyReference = async (conn, referenceID, pubyr) => {
    //logger.trace("verifyReference")
    const testResult = await conn.query("select reference_no, pubyr from refs where reference_no = ?", [referenceID]);
    
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized reference: ${referenceID}`);
        error.statusCode = 400
        throw error
    }

    if (pubyr > testResult[0].pubyr ) {
        const error = new Error(`Reference pubyr ${testResult[0].pubyr} older than authority pubyr ${pubyr}`);
        error.statusCode = 400
        throw error
    }
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}

export const getAuthorities = async (pool, limit, offset) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from authorities";
      let sql = "SELECT taxon_no, genus_name from authorities order by taxon_no";
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

export const getAuthority = async (pool, id) => {
    logger.info("getAuthority");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            a.*
        from 
            authorities a
        where 
            a.taxon_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createAuthority = async (pool, authority, user, allowDuplicate) => {
    logger.info("createAuthority");
    logger.trace(authority);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(authority, []);
	insertAssets.propStr += `, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;
   
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, authority)
        ) {
            //verify references
            await verifyReference(conn, authority.reference_no, authority.pubyr);
       
            const insertSQL = `insert into authorities (${insertAssets.propStr}) values (${insertAssets.valStr}) returning taxon_no`
            logger.trace(insertSQL)
            logger.trace(insertAssets.values)

            //TODO: Update opinions table? See Taxon.pm, lines 772, 952, 963, 983, 999
            //TODO: Cleanup discussion field? Link handling in discussion? See Taxon.pm, line 798
            //TODO: ref_is_authority weirdness? See Taxon.pm, lines 623 and 937
            //TODO: Update occurrences? See Taxon.pm line 1011
        
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].taxon_no)

            authority.taxon_no = res[0].taxon_no;
                        
            await conn.commit();
            return authority;
        } else {
            const error = new Error(`Duplicate authority found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateAuthority = async (pool, patch, user, allowDuplicate, mergedAuthority) => {
    logger.info("updateAuthority");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedAuthority)

    const updateAssets = prepareUpdateAssets(patch, []);
    
    updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier = :modifier, modifier_no = :modifier_no`
    updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.occurrence_no = mergedAuthority.occurrence_no;

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedAuthority)
        ) {

            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no, mergedAuthority.pubyr);
            }
        
            const updateSQL = `update authorities set ${updateAssets.propStr} where taxon_no = :taxon_no`
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
            const error = new Error(`Duplicate authority found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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