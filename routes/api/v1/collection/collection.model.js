import {prepareInsertAssets, prepareUpdateAssets, calcDegreesMinutesSeconds} from '../../../../util.js'
import {logger} from '../../../../app.js'

const isDuplicate = async (conn, collection) => {
    logger.info("isDuplicate");

    //TODO: Add spatial
    const rows = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                collection_no 
            from 
                collections 
            where 
                collection_name = :collection_name and
                min_interval_no = :min_interval_no and
                max_interval_no = :max_interval_no and 
                reference_no = :reference_no
                ${collection.collection_no ? 
                    `and collection_no != :collection_no` :
                    ''
                }
        `
    }, {
        collection_name: collection.collection_name, 
        min_interval_no: collection.min_interval_no,
        max_interval_no: collection.max_interval_no,
        reference_no: collection.references[0],
        collection_no: collection.collection_no
    });
    
    return rows.length > 0;
}

const verifyReferences = async (conn, references) => {
    return await Promise.all(references.map(async reference => {
        const testResult = await conn.query("select reference_no from refs where reference_no = ?", [reference]);
        if (testResult.length === 0) {
            const error = new Error(`Unrecognized reference: ${reference}`);
            error.statusCode = 400
            throw error
        }
    }))
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}

const updateReferences = async (conn, collection_no, references) => {
    for await (const reference of references) {
        await conn.query({
            namedPlaceholders: true,
            sql: "replace into secondary_refs (collection_no, reference_no) values (:collection_no, :reference_no)",
        }, {
            collection_no: collection_no, 
            reference_no: reference
        });
    }
}

export const getCollection = async (pool, id) => {
    logger.info("getCollection");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            c.*,
            JSON_ARRAYAGG(r.reference_no) as 'references'
        from 
            collections c,
            secondary_refs r 
        where 
            c.collection_no = ? and
            c.collection_no = r.collection_no
      `, [id])

      delete rows.meta
      logger.trace(rows)

      if (!rows || !rows.length > 0 || !rows.collection_no) {
        return null
      }
      
      //Need to convert validating date fields to ISO string
      rows.forEach(row => {
        row.release_date = row.release_date.toISOString();
      });      
      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createCollection = async (pool, collection, user, allowDuplicate) => {
    logger.info("createCollection");
    logger.trace(collection);
    logger.trace(user)

    collection.min_interval_no = collection.min_interval_no || collection.max_interval_no;

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

	const insertSQL = `insert into collections (${insertAssets.propStr}) values (${insertAssets.valStr}) returning collection_no`
	logger.trace(insertSQL)
	logger.trace(insertAssets.values)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, collection)
        ) {
            //verify references
            await verifyReferences(conn, collection.references);
            
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].collection_no)

            collection.collection_no = res[0].collection_no;
            
            await updateReferences(conn, collection.collection_no, collection.references)
            
            await conn.commit();
            return collection;
        } else {
            const error = new Error(`Duplicate collection found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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

export const updateCollection = async (pool, patch, user, allowDuplicate, mergedCollection) => {
    logger.info("updateCollection");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedCollection)

    const updateAssets = prepareUpdateAssets(patch, ["references"]);
    
    updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier = :modifier, modifier_no = :modifier_no`
    updateAssets.values.modifier = user.userName; //TODO: consider stripping to first initial
    updateAssets.values.modifier_no = user.userID;
    updateAssets.values.collection_no = mergedCollection.collection_no;

    //derived properties
    if (patch.lat || patch.lng) {
        updateAssets.propStr += `, latdir = :latdir, latdeg = :latdeg, latmin = :latmin, latsec = :latsec, lngdir = :lngdir, lngdeg = :lngdeg, lngmin = :lngmin, lngsec = :lngsec, coordinate = (PointFromText(:coordinate))`;
        
        const lat = patch.lat || mergedCollection.lat;
        const lon = patch.lng || mergedCollection.lng;

        const latDeg = calcDegreesMinutesSeconds(lat)
        updateAssets.values.latdir = patch.lat >= 0 ? "North" : "South";
        updateAssets.values.latdeg = latDeg.degrees;
        updateAssets.values.latmin = latDeg.minutes;
        updateAssets.values.latsec = latDeg.seconds;
        
        const lonDeg = calcDegreesMinutesSeconds(lon)
        updateAssets.values.lngdir = patch.lng >= 0 ? "East" : "West";
        updateAssets.values.lngdeg = lonDeg.degrees;
        updateAssets.values.lngmin = lonDeg.minutes;
        updateAssets.values.lngsec = lonDeg.seconds;

        updateAssets.values.coordinate = `POINT(${lat} ${lon})`;
    }

    if (patch.references) {
        updateAssets.propStr += `, reference_no = :reference_no`;
        updateAssets.values.reference_no = patch.references[0];    
    }

    const updateSQL = `update collections set ${updateAssets.propStr} where collection_no = :collection_no`
    
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedCollection)
        ) {

            //verify references
            if (patch.references) {
                await verifyReferences(conn, patch.references);
            }

            await updatePerson(conn, user);

            const res = await conn.query({ 
                namedPlaceholders: true, 
                sql: updateSQL
            }, updateAssets.values);

            if (patch.references) {
                //secondary_refs updates are all or nothing. First delete current records.
                await conn.query("delete from secondary_refs where collection_no = ?", [mergedCollection.collection_no])
                //Now recreate based on passed data
                await updateReferences(conn, mergedCollection.collection_no, patch.references)
            }

            await conn.commit();
            return res;
        } else {
            const error = new Error(`Duplicate collection found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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