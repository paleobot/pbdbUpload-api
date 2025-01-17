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

const parseTaxon = taxonName => {
    let genus = subgenus = species = subspecies = "";
  
    let parsedName = taxonName.match(/^([A-Z][a-z]+)(?:\s\(([A-Z][a-z]+)\))?(?:\s([a-z.]+))?(?:\s([a-z.]+))?/);
    if (parsedName) {
        genus = parsedName[1] || genus;
        subgenus = parsedName[2] || subgenus;
        species = parsedName[3] || species;
        subspecies = parsedName[4] || subspecies;
    }

    if (!genus && taxonName) {
        //Loose match, capitalization doesn't matter. The % is a wildcard symbol
        parsedName = taxonName.match(/^([a-z%]+)(?:\s\(([a-z%]+)\))?(?:\s([a-z.]+))?(?:\s([a-z.]+))?/)
        if (parsedName) {
            genus = parsedName[1] || genus;
            subgenus = parsedName[2] || subgenus;
            species = parsedName[3] || species;
            subspecies = parsedName[4] || subspecies;
        }
    }
    
    return {
        genus: genus,
        subgenus: subgenus,
        species: species,
        subspecies: subspecies
    };
}

const getOriginalCombination = async(conn, taxon_no) => {
    let results = await conn.query(
        `SELECT 
            DISTINCT o.child_no 
        FROM 
            opinions o 
        WHERE 
            o.child_spelling_no=?`,
        [taxon_no]
    );
    
    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.child_no 
            FROM 
                opinions o 
            WHERE 
                o.child_no=?`,
            [taxon_no]
        )
    }

    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.parent_no AS child_no 
            FROM 
                opinions o 
            WHERE 
                o.parent_spelling_no=?`,
            [taxon_no]
        )
    }

    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.parent_no AS child_no 
            FROM 
                opinions o 
            WHERE 
                o.parent_no=?`,
            [taxon_no]
        )
    }

    if (results.length === 0) {
        results = await conn.query(
            `SELECT 
                DISTINCT o.child_no 
            FROM 
                opinions o 
            WHERE 
                o.parent_spelling_no=? AND 
                o.status='misspelling of'`,
            [taxon_no]
        )

        if (results.length === 0) {
            return taxon_no;
        } else {
            return results[0].child_no;
        }        
    } else if (results.length === 1){
        return results[0].child_no
    } else {
        //Weird case caused by bad data: two original combinations numbers.  In that case use the combination with the oldest record.  The other "original" name is probably a misspelling or such and falls by he wayside
        results = await conn.query(
            `SELECT 
                o.child_no, 
                o.opinion_no,
                IF (
                    o.pubyr IS NOT NULL AND 
                    o.pubyr != '' AND 
                    o.pubyr != '0000', 
                    o.pubyr, 
                    r.pubyr
                ) as pubyr
            FROM 
                opinions o
                LEFT JOIN refs r ON r.reference_no=o.reference_no
            WHERE 
                o.child_no IN (${results.map(result => result.child_no)},)
            ORDER BY 
                pubyr ASC, 
                opinion_no ASC 
            LIMIT 1`
        )
        return results[0].child_no
    }
}

const updateOccurrences = async (conn, authority) => {
    if ("subspecies" === authority.taxon_rank) {
        return;
    }
    
    const tR = await conn.query (
        `select 
            a.taxon_no,
            a.taxon_rank,
            a.taxon_name,
            if(a.ref_is_authority like 'YES', r.pubyr, a.pubyr) as pubyr, 
            if(a.ref_is_authority like 'YES', r.author1last, a.author1last) as author1last, 
            if(a.ref_is_authority like 'YES', r.author2last, a.author2last) as author2last 
        from 
            pbdb.authorities a
            left join pbdb.refs r on r.reference_no = a.reference_no  
        where 
            a.taxon_name = ?`, 
        [authority.taxon_name]
    );

    const taxonNumbers = tR.reduce((acc, taxon, idx, taxa) => {
        const origTaxon1 = getOriginalCombination(conn, taxon.taxon_no);
        let isSameTaxon = false;
        taxa.slice(idx+1).forEach((taxon2) => {
            const origTaxon2 = getOriginalCombination(conn, taxon2.taxon_no);
            isSameTaxon = ((origTaxon1 === origTaxon2) ||
                            (taxon1.author1last && 
                            taxon1.author1last === taxon2.author1last &&
                            taxon1.author2last === taxon2.author2last &&
                            taxon1.pubyr === taxon2.pubyr))
        })
        if (!isSameTaxon) {
            acc.push(taxon.taxon_no)
        }
        return acc
    })

    if (taxonNumbers.length > 1) {
        //TODO: No idea if this is the correct action.
        const error = new Error(`${authority.taxon_name} is a homonym. Occurrences of it may be incorrectly classified.  Please reclassify occurrences of this taxon.`);
        error.statusCode(409);
        throw error;
    } else if (taxonNumbers.length === 1) {
        const parsedTaxon = parseTaxon(authority.taxon_name)
        const higherNames = [parsedTaxon.genus];
        if (parsedTaxon.subgenus) {
            higherNames.push(parsedTaxon.subgenus)
        }

        const sqlQueries = [
            `SELECT 
                occurrence_no,
                o.taxon_no,
                genus_name,
                subgenus_name,
                species_name,
                taxon_name,
                taxon_rank 
            FROM 
                occurrences o 
                LEFT JOIN 
                    authorities a ON o.taxon_no=a.taxon_no
            WHERE 
                genus_name IN (${higherNames.reduce((nameStr, idx, name) => {
                    if (idx === 0) return `"${name}"`
                    else return `${nameStr}, "${name}"`
                }, "")})`, 
            `SELECT 
                reid_no,
                re.taxon_no,
                genus_name,
                subgenus_name,
                species_name,
                taxon_name,
                taxon_rank            
            FROM 
                reidentifications re 
                LEFT JOIN 
                    authorities a ON re.taxon_no=a.taxon_no
            WHERE 
                genus_name IN (${higherNames.reduce((nameStr, idx, name) => {
                    if (idx === 0) return `"${name}"`
                    else return `${nameStr}, "${name}"`
                }, "")})`,
            `SELECT 
                occurrence_no,
                o.taxon_no,
                genus_name,
                subgenus_name,
                species_name,
                taxon_name,
                taxon_rank 
            FROM 
                occurrences o 
                LEFT JOIN 
                    authorities a ON o.taxon_no=a.taxon_no
            WHERE 
                subgenus_name IN (${higherNames.reduce((nameStr, idx, name) => {
                    if (idx === 0) return `"${name}"`
                    else return `${nameStr}, "${name}"`
                }, "")})`,
            `SELECT 
                reid_no,
                re.taxon_no,
                genus_name,
                subgenus_name,
                species_name,
                taxon_name,
                taxon_rank            
            FROM 
                reidentifications re 
                LEFT JOIN 
                    authorities a ON o.taxon_no=a.taxon_no
            WHERE 
                subgenus_name IN (${higherNames.reduce((nameStr, idx, name) => {
                    if (idx === 0) return `"${name}"`
                    else return `${nameStr}, "${name}"`
                }, "")})`    
        ];
        if (parsedTaxon.species) {
            sqlQueries[0] = `${sqlQueries[0]} AND species_name LIKE "${parsedTaxon.species}"`;
            sqlQueries[1] = `${sqlQueries[1]} AND species_name LIKE "${parsedTaxon.species}"`;
            sqlQueries[2] = `${sqlQueries[2]} AND species_name LIKE "${parsedTaxon.species}"`;
            sqlQueries[3] = `${sqlQueries[3]} AND species_name LIKE "${parsedTaxon.species}"`;
        }

        const results = await Promise.all(sqlQueries.map(async sqlQuery => {
            return await conn.query(sqlQuery);
        }));

        const matchedOccurrences = [];
        const matchedReidentifications = [];

        results.forEach(row => {
            let oldMatchLevel = 0;
            let newMatchLevel = 0;

            const taxonFromRow = {
                genus: row.genus_name,
                subgenus: row.subgenus_name,
                species: row.species_name,
                subspecies: row.subspecies_name
            }

            if (row.taxon_no) {
                const tmpParsedTaxon = parseTaxon(row.taxon_name);
                oldMatchLevel = computMatchLevel(taxonFromRow, tmpParsedTaxon);
            }

            newMatchLevel = computMatchLevel(taxonFromRow, parsedTaxon);

            if (newMatchLevel > oldMatchLevel) {
                if (row.reid_no) { 
                    matchedReidentifications.push(row.reid_no);
                } else {
                    matchedOccurrences.push(row.occurrence_no);
                }
            }

        })

        if (matchedOccurrences) {
            const sql = `
                UPDATE 
                    occurrences 
                SET 
                    modified=modified,
                    taxon_no=${authority.taxon_no} 
                WHERE 
                    occurrence_no IN (${matchedOccurrences.reduce((occStr, idx, occurrenceID) => {
                        if (idx === 0) return `"${occurenceID}"`
                        else return `${occStr}, "${occurrenceID}"`
                    }, "")})
            `
           await conn.query(sql);
        }
        if (matchedReidentifications) {
            const sql = `
                UPDATE 
                    reidentifications 
                SET 
                    modified=modified,
                    taxon_no=${authority.taxon_no} 
                WHERE 
                    reid_no IN (${matchedReidentifications.reduce((accStr, idx, reID) => {
                        if (idx === 0) return `"${reID}"`
                        else return `${accStr}, "${reID}"`
                    }, "")})
            `
            await conn.query(sql);
        }
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
            //XTODO: Cleanup discussion field? Link handling in discussion? See Taxon.pm, line 798
            //TODO: ref_is_authority weirdness? See Taxon.pm, lines 623 and 937
            //TODO: taxon_name check already handled in isDuplicate? See Taxon.pm, line 672
            //TODO: !! Update occurrences? See Taxon.pm line 1011
        
            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].taxon_no)

            authority.taxon_no = res[0].taxon_no;

            updateOccurrences(conn, authority)
                        
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