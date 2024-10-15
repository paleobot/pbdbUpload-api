import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

export const getCollection = async (pool, id) => {
    //logger.info("getCollection");
    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query("SELECT * from collections where collection_no = " + id);

      //Need to convert validating date fields to ISO string
      rows.forEach(row => {
        row.release_date = row.release_date.toISOString();
      });      
      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createCollection = async (pool, collection, user) => {
    logger.info("createCollection");
    logger.trace(collection);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(collection, ["references"]);
	insertAssets.propStr += `, enterer, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer = user.userName; //TODO: consider stripping to first initial
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;

    //derived properties
    insertAssets.propStr += `, latdir, latdeg, latmin, latsec, lngdir, lngdeg, lngmin, lngsec, coordinate`;
    insertAssets.valStr += `, :latdir, :latdeg, :latmin, :latsec, :lngdir, :lngdeg, :lngmin, :lngsec, (PointFromText(:coordinate))`;
    
    const latDeg = calcDegreesMinutesSeconds(collection.lat)
    insertAssets.values.latdir = collection.lat >= 0 ? "North" : "South";
    insertAssets.values.latdeg = latDeg.degrees;
    insertAssets.values.latmin = latDeg.minutes;
    insertAssets.values.latsec = latDeg.seconds;
    
    const lonDeg = calcDegreesMinutesSeconds(collection.lng)
    insertAssets.values.lngdir = collection.lng >= 0 ? "East" : "West";
    insertAssets.values.lngdeg = lonDeg.degrees;
    insertAssets.values.lngmin = lonDeg.minutes;
    insertAssets.values.lngsec = lonDeg.seconds;

    insertAssets.values.coordinate = `POINT(${collection.lat} ${collection.lng})`;

    insertAssets.propStr += `, reference_no`;
    insertAssets.valStr += `, :reference_no`;
    insertAssets.values.reference_no = collection.references[0];

    //TODO: insert...returning requires mariadb 10.5
	//const insertSQL = `insert into collections (${insertAssets.propStr}) values (${insertAssets.valStr}) returning collection_no`
	const insertSQL = `insert into collections (${insertAssets.propStr}) values (${insertAssets.valStr})`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        //verify references
        //(in parallel)
        await Promise.all(collection.references.map(async reference => {
            const testResult = await conn.query("select reference_no from refs where reference_no = ?", [reference]);
            if (testResult.length === 0) {
                const error = new Error(`Unrecognized reference: ${reference}`);
                error.statusCode = 400
                throw error
            }
        }))
        /*
        //(in sqeuence)
        for await (const reference of collection.references) {
            const testResult = await conn.query("select reference_no from refs where reference_no = ?", [reference]);
            if (testResult.length === 0) {
                const error = new Error(`Unrecognized reference: ${reference}`);
                error.statusCode = 400
                throw error
            }
        }
        */
        
        const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
        if (rs.affectedRows !== 1) throw new Error("Could not update person table");        

        let res = await conn.query({ 
            namedPlaceholders: true, 
            sql: insertSQL
        }, insertAssets.values);
        logger.trace("after insert")
        logger.trace(res)

        //TODO: Until we get mariadb 10.5 and can do insert...returning, 
        //we have to do this seperate select to get the new collection_no.
        //Delete when we can. Until then, need to decide what fields to 
        //query on to ensure we're getting the record just created. 
        res = await conn.query("select collection_no from collections where collection_name = ?", [collection.collection_name])
        if (res.length === 0) {
            const error = new Error(`Could not get collection_no`);
            error.statusCode = 400
            throw error
        }


        collection.collection_no = res[0].collection_no;
        
        for await (const reference of collection.references) {
            res = await conn.query({
                namedPlaceholders: true,
                sql: "replace into secondary_refs (collection_no, reference_no) values (:collection_no, :reference_no)",
            }, {collection_no: collection.collection_no, reference_no: reference});
        }
        
        await conn.commit();
        return collection;
    } catch (err) {
        logger.error("Error loading data, reverting changes: ", err);
        logger.error(err)
        await conn.rollback();
        throw err
    } finally {
        if (conn) conn.release(); //release to pool
    }
}

export const updateCollection = async (pool, patch, collectionID, user) => {
    logger.info("updateCollection");
    logger.trace(user)
    logger.trace(patch);

    const updateAssets = prepareUpdateAssets(patch);
    
    updateAssets.propStr += `, modifier = :modifier, modifier_no = :modifier_no`
    updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.collection_no = collectionID;

    //derived properties
    if (patch.lat && patch.lng) {
        updateAssets.propStr += `, latdir = :latdir, latdeg = :latdeg, latmin = :latmin, latsec = :latsec, lngdir = :lngdir, lngdeg = :lngdeg, lngmin = :lngmin, lngsec = :lngsec, coordinate = (PointFromText(:coordinate))`;
        
        const latDeg = calcDegreesMinutesSeconds(patch.lat)
        updateAssets.values.latdir = patch.lat >= 0 ? "North" : "South";
        updateAssets.values.latdeg = latDeg.degrees;
        updateAssets.values.latmin = latDeg.minutes;
        updateAssets.values.latsec = latDeg.seconds;
        
        const lonDeg = calcDegreesMinutesSeconds(patch.lng)
        updateAssets.values.lngdir = patch.lng >= 0 ? "East" : "West";
        updateAssets.values.lngdeg = lonDeg.degrees;
        updateAssets.values.lngmin = lonDeg.minutes;
        updateAssets.values.lngsec = lonDeg.seconds;

        updateAssets.values.coordinate = `POINT(${patch.lat} ${patch.lng})`;
    }

    const updateSQL = `update collections set ${updateAssets.propStr} where collection_no = :collection_no`
    logger.trace(updateSQL)
    logger.trace(updateAssets.values)

    //return true;
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        //verify reference_no
        if (patch.reference_no) {
            const testResult = await conn.query("select reference_no from refs where reference_no = ?", [patch.reference_no]);
            if (testResult.length === 0) {
                const error = new Error("Unrecognized reference_no");
                error.statusCode = 400
                throw error
            }
        }

        const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
        if (rs.affectedRows !== 1) throw new Error("Could not update person table");

        const res = await conn.query({ 
            namedPlaceholders: true, 
            sql: updateSQL
        }, updateAssets.values);

        await conn.commit();
        return res;
    } catch (err) {
        logger.error("Error loading data, reverting changes: ", err);
        await conn.rollback();
        throw err
    } finally {
        if (conn) conn.release(); 
    }
}