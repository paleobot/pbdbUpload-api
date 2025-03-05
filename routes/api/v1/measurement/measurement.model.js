import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

const isDuplicate = async (conn, measurement) => {
    logger.info("isDuplicate");

    //TODO: Add spatial
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                measurement_no 
            from 
                measurements 
            where 
                specimen_no = :specimen_no and
                measurement_type = :measurement_type and
                average <=> :average and
                median <=> :median and
                min <=> :min and
                max <=> :max
                ${measurement.measurement_no ? 
                    `and measurement_no != :measurement_no` :
                    ''
                }
        `
    }, {
        specimen_no: measurement.specimen_no, 
        measurement_type: measurement.measurement_type, 
        average: measurement.average || null, 
        median: measurement.median || null, 
        min: measurement.min || null, 
        max: measurement.max || null,
        measurement_no: measurement.measurement_no || null 
    });
    
    return rows.length > 0;
}

const verifySpecimen = async (conn, specimenID) => {
    const testResult = await conn.query("select specimen_no from specimens where specimen_no = ?", [specimenID]);
    if (testResult.length === 0) {
        const error = new Error(`Unrecognized specimen: ${specimenID}`);
        error.statusCode = 400
        throw error
    }
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}

export const getMeasurements = async (pool, limit, offset) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from measurements";
      let sql = "SELECT * from measurements order by measurement_no";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        measurements: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getMeasurement = async (pool, id) => {
    logger.info("getMeasurement");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            o.*
        from 
        measurements o
        where 
            o.measurement_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createMeasurement = async (pool, measurement, user, allowDuplicate) => {
    logger.info("createMeasurement");
    logger.trace(measurement);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(measurement, []);

    //derived properties
	insertAssets.propStr += `, real_average, real_median, real_min, real_max, real_error`;
	insertAssets.valStr += `, :real_average, :real_median, :real_min, :real_max, :real_error`;
    insertAssets.values.real_average = measurement.average ? measurement.average.toString() : null;
    insertAssets.values.real_median = measurement.median ? measurement.median.toString() : null;
    insertAssets.values.real_min = measurement.min ? measurement.min.toString() : null;
    insertAssets.values.real_max = measurement.max ? measurement.max.toString() : null;
    insertAssets.values.real_error = measurement.error ? measurement.error.toString() : null;
     
	const insertSQL = `insert into measurements (${insertAssets.propStr}) values (${insertAssets.valStr}) returning measurement_no`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, measurement)
        ) {
            //verify fks
            await verifySpecimen(conn, measurement.specimen_no);
            
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].measurement_no)

            measurement.measurement_no = res[0].measurement_no;
                        
            await conn.commit();
            return measurement;
        } else {
            const error = new Error(`Duplicate measurement found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateMeasurement = async (pool, patch, user, allowDuplicate, mergedMeasurement) => {
    logger.info("updateMeasurement");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedMeasurement)

    const updateAssets = prepareUpdateAssets(patch, []);
    
    updateAssets.values.measurement_no = mergedMeasurement.measurement_no;

    //derived properties
    if (patch.average) {
        updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '}real_average = :real_average`
        updateAssets.values.real_average = patch.average.toString()
    }
    if (patch.median) {
        updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '}real_median = :real_median`
        updateAssets.values.real_median = patch.median.toString()
    }
    if (patch.min) {
        updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '}real_min = :real_min`
        updateAssets.values.real_min = patch.min.toString()
    }
    if (patch.max) {
        updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '}real_max = :real_max`
        updateAssets.values.real_max = patch.max.toString()
    }
    if (patch.error) {
        updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '}real_error = :real_error`
        updateAssets.values.real_error = patch.error.toString()
    }

    const updateSQL = `update measurements set ${updateAssets.propStr} where measurement_no = :measurement_no`
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedMeasurement)
        ) {

            //verify fks
            if (patch.specimen_no || patch.specimen_no === 0) {
                await verifySpecimen(conn, patch.specimen_no);
            }

            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate measurement found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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