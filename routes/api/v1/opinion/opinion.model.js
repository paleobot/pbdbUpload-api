import {prepareInsertAssets, prepareUpdateAssets, parseTaxon} from '../../../../util.js'
import {logger} from '../../../../app.js'
import { fetchClosestTaxon } from '../occurrence/occurrence.model.js';
import { getOriginalCombination } from '../authority/authority.model.js';

const isDuplicate = async (conn, opinion) => {
    logger.info("isDuplicate");


    const rows = await conn.query({
        namedPlaceholders: true,
       //NOTE: There appears to have been a bug in the following select in the original perl code. That used "ref_has_opinion !='YES'". The ref_has_opinion column contains many nulls. Those are ignored when != is used. Unless, the original coder intended that, the proper way to do this comparison in mysql syntax is "NOT (ref_has_opinion <=> 'YES')". That's how I'm doing it here.
       //From https://github.com/paleobiodb/classic/blob/1cc4d2748c339856c9263743a4bb6c6e1372ad8b/lib/PBDB/Opinion.pm#L820
        sql:`
            select 
                opinion_no 
            from 
                opinions 
            where 
                NOT (ref_has_opinion <=> 'YES') and
                child_no = :child_no and
                author1last = :author1last and
                author2last = :author2last and
                pubyr = :pubyr and
                status not in ('misspelling of')
                ${opinion.opinion_no ? 
                    `and opinion_no != :opinion_no` :
                    ''
                }
       `
    }, {
        child_no: opinion.child_no, 
        author1last: opinion.author1last, 
        author2last: opinion.author2last || '', 
        pubyr: opinion.pubyr, 
        opinion_no: opinion.opinion_no || null, 
    });
    
    //From https://github.com/paleobiodb/classic/blob/1cc4d2748c339856c9263743a4bb6c6e1372ad8b/lib/PBDB/Opinion.pm#L829
    const rows2 = await conn.query({
        namedPlaceholders: true,
        sql:`
            select 
                opinion_no 
            from 
                opinions o,
                refs r 
            where 
                ref_has_opinion ='YES' and
                child_no = :child_no and
                o.reference_no = r.reference_no and
                o.author1last = :author1last and
                o.author2last = :author2last and
                o.pubyr = :pubyr and
                o.status not in ('misspelling of','homonym of')
                ${opinion.opinion_no ? 
                    `and o.opinion_no != :opinion_no` :
                    ''
                }
       `
    }, {
        child_no: opinion.child_no, 
        author1last: opinion.author1last, 
        author2last: opinion.author2last || '', 
        pubyr: opinion.pubyr, 
        opinion_no: opinion.opinion_no || null, 
    });

    return rows.length > 0 || rows2.length > 0;
}

const fetchTaxon = async (conn, taxonID) => {
    logger.trace("fetchTaxon")
    logger.trace(taxonID)
    const taxonResult = await conn.query("select * from authorities where taxon_no = ?", [taxonID]);
    if (taxonResult.length === 0) {
        const error = new Error(`Unrecognized taxon: ${taxonID}`);
        error.statusCode = 400
        throw error
    }
    logger.trace(taxonResult[0])

    const taxonParsed = [...taxonResult[0].taxon_name.matchAll(/^(?:(\p{Lu}\p{Ll}*) ?)(?:\((\p{Lu}\p{Ll}*)\) ?)?(\p{Ll}*)?(?: (\p{Ll}*))?/gu)]
    const genus = taxonParsed[0][1];
    const subgenus = taxonParsed[0][2];
    const species = taxonParsed[0][3];
    const subspecies = taxonParsed[0][4];

    return {
        rank: taxonResult[0].taxon_rank,
        name: taxonResult[0].taxon_name,
        genus: taxonParsed[0][1] || null,
        subgenus: taxonParsed[0][2] || null,
        species: taxonParsed[0][3] ? 
                    taxonParsed[0][4] ?
                        `${taxonParsed[0][3]} ${taxonParsed[0][4]}` :
                        taxonParsed[0][3] :
                 null
    }
}


//This is a translation of the perl routine getOpinionsToMigrate in Opinion.pm. There is login in that routine that is inconsistent. There is also logic that I do not fully understand. I've tried to fix what it obvious to me and left the rest intact. 
//Comment from original routine: Gets a list of opinions that will be moved from a spelling to an original name.  Made into its own function so we can prompt the user before the move actually happens to make sure they're not making a mistake. The exclude_opinion_no is passed so we exclude the current opinion in the migration, which will only happen on an edit
const getOpinionsToMigrate = async (conn, child_no, child_spelling_no, exclude_opinion_no) => {

    /*
    NOTE: The original version of this select had duplicate logic in the WHERE clause:
        SELECT 
            * 
        FROM 
            opinions 
        WHERE 
            (
                (child_no = :child_no AND 
                    (parent_no = :child_spelling_no OR 
                        parent_spelling_no = :child_spelling_no
                    ) 
                ) OR
                (child_no = :child_no AND 
                    (parent_no = :child_spelling_no OR 
                        parent_spelling_no = :child_spelling_no
                    ) 
                ) 
            ) AND 
            status != 'misspelling of' ${exclude_opinion_no ? `AND
            opinion_no != :excluded_opinion_no` : ''}
    My guess is that this is a bug and they intended to query on something else.
    For now, I've just deleted the redundancy.
    */
    const sql = `
        SELECT 
            * 
        FROM 
            opinions 
        WHERE 
            (
                (child_no = :child_no AND 
                    (parent_no = :child_spelling_no OR 
                        parent_spelling_no = :child_spelling_no
                    )
                ) 
            ) AND 
            status != 'misspelling of' ${exclude_opinion_no ? `AND
            opinion_no != :excluded_opinion_no` : ''}
    `;

    const results = await conn.query(sql, {
        child_no: child_no,
        child_spelling_no: child_spelling_no,
        exclude_opinion_no: exclude_opinion_no
    });
    if ( results )	{
        return {
            opinions: [],
            parents: [],
            error: results[0].status
        };
    }
    //It's not clear to me what just happened. We abandon results here.
 
    const orig_no = getOriginalCombination(conn ,child_spelling_no);
    sql = `
        SELECT 
            * 
        FROM 
            opinions 
        WHERE 
            child_no = :orig_no ${exclude_opinion_no ? `AND
            opinion_no != :excluded_opinion_no` : ''}
    `;
    results = await conn.query(sql, {
        orig_no: orig_no,
        exclude_opinion_no: exclude_opinion_no
    });
  
    const parents = [];

    //Comment from original routine: there is a potential bizarre case where child_spelling_no has been used as a parent_no, but it completely unclassified itself, so we need to add it to the list of parents to be moved JA 12.6.07
    if ( !results && child_no != orig_no )	{
        sql = "SELECT count(*) c FROM opinions WHERE parent_no = :orig_no";
        const count = await conn.query(sql, {
            orig_no: orig_no,
        })[0].c;
        if ( count > 0 )	{
            parents.push(orig_no);
        }
    }

    const opinions = [];
    for (row of results) {
        if (row.child_no != child_no) {
            opinions.push(row);
            if ('misspelling of' === row.status) {
                //NOTE: This is the original test. I find this regex formulation odd. parent_spelling_no is an int in the db. I think they are just checking to see if it has a value. Maybe perl returns it as a string?
                //if (/^\d+$/.test(row.parent_spelling_no)) {
                if (row.parent_spelling_no) {
                    parents.push(row.parent_spelling_no);
                }
            }
            //ditto
            if (row.child_spelling_no) {
                parents.push(row.child_spelling_no);
            }
            //ditto
            if (row.child_no) {
                parents.push(row.child_no);
            }
        }
    }

    return opinions.length > 0 || parents.length > 0 ? {
        opinions: opinions,
        parents: parents
    } : null;
}


//NOTE: This routine is a translation of the same routine in Opinion.pm
//Original comment:
/*
# Figure out the spelling status - tricky cause we may need to infer it
# Something can be a 'corrected as', but the status is 'synonym of', so that info is lost
# This can't determine misspellings, which must be determined externally
*/
const guessSpellingReason = (child, spelling) => {
    
    let spellingReason = "";
    
    if (child.taxon_no === spelling.taxon_no) {
        spellingReason ='original spelling';
    } else {
        //#For a recombination, the upper names will always differ. If they're the same, its a correction
        if (/species|subgenus/.test(child.taxon_rank)) {
            const childBits = child.taxon_name.split(' ');
            const spellingBits= spelling.taxon_name.split(' ');
            childBits.pop();
            spellingBits.pop();
            const childParent = childBits.join(' ');
            const spellingParent = spellingBits.join(' ');
            if (childParent === spellingParent) {
                //# If the genus/subgenus/species names are the same, its a correction
                spellingReason = 'correction';
            } else {
                //# If they differ, its a bad record or its a recombination
                if (/subgenus/.test(child.taxon_rank)) {
                    if (child.taxon_rank !== spelling.taxon_rank) {
                        spellingReason = 'rank change';
                    } else {
                        spellingReason = 'reassignment';
                    } 
                } else {
                    spellingReason = 'recombination';
                } 
            }
        } else if (child.taxon_rank !== spelling.taxon_rank) {
            spellingReason = 'rank change';
        } else {
            spellingReason = 'correction';
        }
    }
    return spellingReason;
}

//NOTE: This routine is a translation of the same routine in Opinion.pm
//Original comment:
/*
# row is an opinion database row and must contain the following fields:
#   child_no,status,child_spelling_no,parent_spelling_no,opinion_no
# JA: there's a long-standing bug in here somewhere that causes the spelling
#  spelling reason to get messed up when original names are changed but I
#  have no time right now to fix it
*/
const resetOriginalNo = async (conn, newOriginalNumber, opinion) => {
   if (!newOriginalNumber) return
    
    const childTaxon = await fetchTaxon(conn, newOriginalNumber);

    let spellingTaxon;
    if ('misspelling of' === opinion.status) {
        spellingTaxon = await fetchTaxon(conn, opinion.parent_spelling_no);
    } else {
        spellingTaxon = await fetchTaxon(conn, opinion.child_spelling_no);
    }

    const isMisspelling = 
        "misspelling" === opinion.spelling_reason || 
        await conn.query({ 
            namedPlaceholders: true, 
            sql: "SELECT count(*) cnt FROM opinions WHERE child_spelling_no=:child_spelling_no AND status='misspelling of'"
        }, {child_spelling_no: opinion.child_spelling_no}).cnt > 0;

    const newSpellingReason = 
        isMisspelling ?
            'misspelling' :
            guessSpellingReason(childTaxon, spellingTaxon) //TODO: define this

    const sql = `
        UPDATE 
            opinions 
        SET 
            modified=modified,
            spelling_reason=:spelling_reason,
            child_no=:child_no  
        WHERE 
            opinion_no=:opinion_no`

    await conn.query({ 
        namedPlaceholders: true, 
        sql: sql
    }, {
        spelling_reason: newSpellingReason,
        child_no: newOriginalNumber,
        opinion_no: opinion.opinion_no
    });
}

//NOTE: This routine is a translation of the same routine in Taxon.pm
const propagateAuthorityInfo = async (conn, q, taxonNo, thisIsBest) => {
    if (!taxon_no) return;

    const origNo = await getOriginalCombination(conn,taxon_no);
    if (!orig_no) return;

    const spellingNos = await getAllSpellings(conn, origNo); //TODO: implement this

    //# Note that this is the taxon_no passed in, not the original combination -- an update to
    //# a spelling should proprate around as well
    const me = await fetchTaxon(conn, taxon_no);

    const authorityFields = ('author1init','author1last','author2init','author2last','otherauthors','pubyr');
    const moreFields = ('pages','figures','common_name','type_specimen','museum','catalog_number','type_body_part','part_details','type_locality','extant','form_taxon','preservation');

    //# Two steps: find best authority info, then propagate to all spelling variants
    const spellings = [];
    for (spellingNo of spellingNos) {
        const spelling = await fetchTaxon(conn, spellingNo);
        spellings.push(spelling);
    }

    const getDataQuality = (taxon) => {
        const quality = 0;
        //# Taxa where the ref is authority are preferred - in the cases where there
        //# are multiple refs that fit this criteria, go with the original combination
        //# Else if there is anything, go with that, otherwise we're stuck with nothing
        if (/yes/i.test(taxon.ref_is_authority)) {
            if (taxon.taxon_no === origNo) {
                quality = 5;
            } else {
                quality = 4;
            }
        } else if (taxon.author1last) {
            if (taxon.taxon_no === orig_no) {
                quality = 3;
            } else {
                quality = 2;
            }
        } else {
            quality = 1;
        }
        return quality;
    };
   
    //# Sort by quality in descending order
    spellings = spellings.map(spelling => {
        return {
            ...spelling,
            quality: getDataQuality(spelling)
        }
    }).sort((a,b) => a.quality - b.quality)
    /*
    @spellings = 
        map  {$_->[1]}
        sort {$b->[0] <=> $a->[0]}
        map  {[$getDataQuality->($_),$_]}
        @spellings;
    */

    let toUpdate;
    //# Get this additional metadata from wherever we can find it, giving preference
    //# to the taxa with better authority data
    const seenMore = {}
    for (spelling of spellings) {
        for (field of moreFields) {
            if (spelling.field !== '' && !seenMore[field]) {
                seenMore[field] = spelling.field;
            }

        }
    }

    //# special handling for comments and discussion JA 4.9.11
    //# these fields include subjective info that can't be ranked by "quality,"
    //#  so glom everything together
    //# whoops, completely screwed this up... behavior depends on whether the
    //#  submission was of an opinion (in which case comments from merged names
    //#  must be combined) or an authority (in which case the verbatim text
    //#  field must be used) JA 10.5.12
    for (field of ["comments", "discussion"]) {
        //# ref_is_authority is a required field, so this test is trustworthy
        if (q.ref_is_authority)	{
            seenMore[field] = q[field];
        } else	{
            const textSeen = [];
            for (spelling of spellings) {
                if (spelling[field] ) {
                    textSeen[spelling[field]]++;
                }
            }
            //# the comments will come out in random order, but who cares
            seenMore[field] = Object.keys(textSeen).join("\n");
        }

    }
    /*
    foreach my $f ( 'comments','discussion' )	{
        # ref_is_authority is a required field, so this test is trustworthy
        if ( $q->param('ref_is_authority') )	{
            $seenMore{$f} = $q->param($f);
        } else	{
            my %textSeen;
            foreach my $spelling (@spellings) {
                if ( $spelling->{$f} ) {
                    $textSeen{$spelling->{$f}}++;
                }
            }
            # the comments will come out in random order, but who cares
            $seenMore{$f} = join("\n",keys(%textSeen));
        }
    }
    */

    //# the user just entered these data, so if they exist, they should be used
    //# slightly dangerous because you cannot erase data completely if they're
    //#  wrong; you have to replace them with something
    //# this won't mess with authority data
    for (field of moreFields) {
        if (me[field]) {
            seenMore[field] = me[field]
        }
    }
    if (seenMore) {
        for (field of [...moreFields, "comments", "discussion"]) {
            toUpdate = toUpdate ?
                toUpdate.push(`${field} = "${seenMore[field]}"`) :
                [].push(`${field} = "${seenMore[field]}"`)
        }
    }

    if (toUpdate) {
        for (spellingNo of spellingNos) {
            const sql = `
                UPDATE 
                    authorities 
                SET 
                    modified=modified, ${toUpdate.join(", ")} 
                WHERE 
                    taxon_no = :taxon_no
            `;
            const results = await conn.query({ 
                namedPlaceholders: true, 
                sql: sql
            }, {
                taxon_no: spellingNo,
            });
                }
    }
}

//NOTE: This routine is a translation of the same routine in Opinion.pm
//Original comment:
/*
# Occasionally duplicate opinions will be created sort of due to user err.  User will enter
# an opinions 'A b belongs to A' when 'A b' isn't the original combination.  They they
# enter 'C b recombined as A b' from the same source, and the original 'A b' original gets
# migrated when its actually the same opinion.  Find these opinions.  Don't delete them,
# but just set all their key fields to zero and mark changes into the comments field
*/
const removeDuplicateOpinions = async (conn, childNo, resultOpinionNumber) => {
    if (!child_no) return

    const sql = `
        SELECT 
            * 
        FROM 
            opinions 
        WHERE 
            child_no=:child_no AND 
            child_no != parent_no AND 
            status !='misspelling of
    `;

    const results = await conn.query({ 
        namedPlaceholders: true, 
        sql: sql
    }, {
        child_no: childNo,
    });

    const dupeHash = {};
    //# "Reverse" prevents a bug where we delete teh last entered opinion (if its a dupe)
    //# which causes the scripts to crash later. So delete the earlier entered dupe opinion
    for (row of results.reverse()) {
        if (/yes/i.test(row.ref_has_opinion)) {
            const dupeKey = `${row.reference_no} ${row.child_no}`;
            dupeHash[dupeKey] = dupeHash[dupeKey] ? 
                dupeHash[dupeKey].concat(row) : 
                [].concat(row)
        } else {
            const dupeKey = `${row.child_no} ${row.author1last} ${row.author2last} ${row.otherauthors} ${row.pubyr}`;
            if (row.author1last) { //#Deal with some older screwy data records just missing authority info
                dupeHash[dupeKey] = dupeHash[dupeKey] ? 
                    dupeHash[dupeKey].concat(row) : 
                    [].concat(row)
            }
        }
    }
    const newNo = resultOpinionNumber;
    for (opinions of dupeHash) {
        if (opinions.length > 1) {
            const originalOpinion = opinions.shift()
            for (opinion of opinions) {
                //NOTE: The comment above from the original routine says not to delete the record but set fields to zero. I don't see that happening in the perl code. They delete it.
               const results = await conn.query({ 
                    namedPlaceholders: true, 
                    sql: "delete from opinions where opinion_no = :opinion_no"
                }, {
                    opinion_no: opinion.opinion_no,
                });
                if ( originalOpinion.opinion_no !== resultOpinionNumber )	{
                    newNo = originalOpinion.opinion_no;
                }
            }
        }
    }
    return newNo;
}

/***** 
 * We're not going to handle this for now. Keeping it ghosted in case we change our mind
//NOTE: This routine is a translation of the same routine in Opinion.pm
const fixMassEstimates = async (conn, taxon_no)	=> {
	//# update body mass estimates for this name and all spellings (because spelling numbers may
	//#  have been added) JA 7.12.10
	//# mass estimates of synonyms are not stored, so if this name is now a synonym the senior
	//#  synonym's data need to be updated; likewise, if this name was previously a synonym but
	//#  is now valid the data for both names need to be updated
	//# the easiest solution is just to work through all names ever linked to this one
	const sql = `
        SELECT 
            parent_no 
        FROM 
            opinions 
        WHERE 
            child_no = :child_no AND 
            status!='belongs to'
    `;
    const parents = await conn.query({ 
        namedPlaceholders: true, 
        sql: sql
    }, {
        child_no: taxon_no
    });
    const entangled = await getSeniorSynonym(conn, taxon_no); //TODO: define this

    //# the parent is 0 in some old bad nomen dubium opinions
	for (parent of parents)	{
		const ss = await getSeniorSynonym(conn, parent.parent_no);
		if ( ss > 0 )	{
			entangled.push(ss);
		}
	}

	for (e of entangled) {
		const inList = getAllSynonyms(conn, e); //TODO: define this
		const sql = `
            UPDATE 
                $TAXA_TREE_CACHE 
            SET 
                mass=NULL 
            WHERE 
                taxon_no IN (${in_list.join()})
        `;
        await conn.query({ 
            sql: sql
        });

		const specimens = await getMeasurements(conn, { //TODO: define this
            taxon_list: in_list,
            get_global_specimens: 1
        });
		if (specimens) {
			const p_table = await getMeasurementTable(specimens); //TODO: define this
			const m = await getMassEstimates(conn, e, p_table); //TODO: define this
			if (m[5] && m[6]) {
				const mean = m[5] / m[6];
				inList = getAllSpellings(conn, e); //TODO: define this
				$sql = `
                    UPDATE 
                        $TAXA_TREE_CACHE 
                    SET 
                        mass=${mean} 
                    WHERE 
                        taxon_no IN (${in_list.join()});
                `
                await conn.query({ 
                    sql: sql
                });
            }
		}
	}

}
********/

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

const gatherMigrations = async (conn, opinion, allowMigrations) => {
    let migrations1, migrations2;
    if ("misspelling of" === opinion.status) {
        if (opinion.parent_spelling_no) {
            migrations2 = await getOpinionsToMigrate(conn, opinion.parent_no, opinion.child_no, opinion.opinion_no)
            if (migrations2.error)	{
                const error = new Error(`${childSpellingTaxon.name} can't be a misspelling of ${parentTaxon.name} because there is already a '$error' opinion linking them, so they must be biologically distinct`);
                error.statusCode = 400
                throw error				
            } 
        }
    }
    if (opinion.child_spelling_no) {
        migrations1 = getOpinionsToMigrate(conn, opinion.child_no, $opinion.child_spelling_no, opinion.opinion_no);
        if (migrations1.error && childSpellingTaxon && childTaxon && childSpellingTaxon.name != childTaxon.name )	{
            const error = new Error(`${childSpellingTaxon.name} can't be an alternate spelling of ${childTaxon.name} because there is already a '${migrations1.status}' opinion linking them, so they must be biologically distinct"`);
            error.statusCode = 400
            throw error				
        } 
    }

    if (!allowMigrations && (migrations1 || migrations2)) {
        let msg = "Opinions to migrate:"
        migrations1.opinions.reduce((acc, opinion) => {
            if (migrations1.opinions || migrations2.opinions) {
                msg = `${msg}
                ${childSpellingTaxon.name} already exists with opinions classifying it`;
            } else if (migrations1.parents || migrations2.parents) {
                msg = `${msg}
                ${childSpellingTaxon.name} already exists`;
            }
            if ("misspelling of" !== opinion.status) {
                /*
                msg = `${msg}
                If '${childTaxon.name}' is actually a misspelling of '${childSpellingTaxon.name}', please enter 'Invalid, this taxon is a misspelling of $childSpellingName' in the 'How was it classified' section, and enter '$childName' in the 'How was it spelled' section.<br>";
                */
                //I actually have no idea what should happen here.
            }
            if (migrations1.opinions) {
                msg = `${msg}
                If '${childSpellingTaxon.name}' is actually a homonym (same spelling, totally different taxon), you must create a new '${childSpellingTaxon.name}'`;
            }
            return msg
        }, msg)

        msg = `${msg}
        If you wish to proceed, resubmit with allowMigrations set to true.
        
        Be aware that, if you do this, this name will be combined permanently with the existing one. This means: 
            --'${childTaxon.name}' will be considered the 'original' name. If another spelling is actually the original one, please enter opinions based on that other name. 
            -- authority information will be made identical and linked.  Changes to one name's authority record will be copied over automatically to the other's.
            -- these names will be considered the same when editing/adding opinions, downloading, searching, etc.`
        error.statusCode = 400
        throw error				
    }

    return {
        migrations1: migrations1,
        migrations2: migrations2
    }
}

const doMigrations = async (conn, migrations, opinion) => {
    const migrations1 = migrations.migrations1
    const migrations2 = migrations.migrations2
    
    if (migrations1 || migrations2)	{

        for (opinion of migrations1.opinions) {
            await resetOriginalNo(conn, opinion.child_no, opinion);
        }

        for (opinion of migrations2.opinions) {
            await resetOriginalNo(conn, opinion.child_no, opinion);
        }


        //We also have to modify the parent_no so it points to the original combination of any taxa classified into any migrated opinion
        if (migrations1.parents || migrations2.parents) {
            const parents = migrations1.parents ?
                migrations1.parents.concat(migrations2.parents) :
                migrations2.parents;
            const sql = `
                UPDATE 
                    opinions 
                SET 
                    modified=modified, 
                    parent_no=:parent_no 
                WHERE 
                    parent_no IN (${parents.reduce((acc, parent, idx) => idx === 0 ? parent : `${acc}, ${parent}`), ''} 
            `;
            await conn.query({ 
                namedPlaceholders: true, 
                sql: sql
            }, {parent_no: opinion.child_no});
        }
        
        //# Make sure opinions authority information is synchronized with the original combination
        await propagateAuthorityInfo(conn, opinion, opinion.child_no);
        
        //# Remove any duplicates that may have been added as a result of the migration
        resultOpinionNumber = await removeDuplicateOpinions(conn, opinion.child_no, resultOpinionNumber);
    }
}

const fetchPotentialSynonyms = async (conn, child_spelling_no, childTaxon) => {
    //# we need to warn about the nasty case in which the author has synonymized
    //#  genera X and Y, but we do not know the author's opinion on one or more
    //#  species placed at some point in X
    if ( /genus/.test(childTaxon.rank) && !/belongs to/.test(opinion.status))	{
        //# get every opinion on every child ever assigned to this genus
        //# we join on o2 to make sure that they have been
        const sql = `
            SELECT 
                taxon_name,
                o.child_no,
                o.ref_has_opinion,
                o.reference_no reference_no,
                IF (o.ref_has_opinion='YES',r.author1last,o.author1last) author1last,
                IF (o.ref_has_opinion='YES',r.author2last,o.author2last) author2last,
                IF (o.ref_has_opinion='YES',r.pubyr,o.pubyr) pubyr,
                r.pubyr ref_pubyr 
            FROM 
                refs r,
                opinions o,
                opinions o2,
                authorities 
            WHERE 
                r.reference_no=o.reference_no AND 
                taxon_no=o.child_no AND 
                taxon_no=o2.child_no AND 
                o2.parent_spelling_no = :parent_spelling_no 
            ORDER BY 
                pubyr
        `;
        const childRefs = await conn.query({ 
            namedPlaceholders: true, 
            sql: sql
        }, {parent_spelling_no: child_spelling_no});

        //TODO: ref_has_opinion appears to always be YES in db. Might be unused. I'm going to skip all this logic for now and just return all the results until I find out more.
        /*
        const authorHasOpinion = [];
        const speciesName = [];
        for (cr of childrefs) {
            if ((
                "YES" !== opinion.ref_has_opinion && 
                cr.pubyr <= opinion.pubyr 
            ) || ( 
                "YES" === opinion.ref_has_opinion && 
                cr.pubyr <= ref_pubyr //TODO: This is weird. Orig perl: cr.pubyr <= $ref->get('pubyr'). $ref comes from either opinion.reference_no or opinion.ref_has_opinion, or something, I dunno. See https://github.com/paleobiodb/classic/blob/1cc4d2748c339856c9263743a4bb6c6e1372ad8b/lib/PBDB/Opinion.pm#L794. For now, I added it to the select above.

            ))	{
                speciesName[cr.child_no] = cr.taxon_name;
                if (!authorHasOpinion[cr.child_no])	{
                    authorHasOpinion[cr.child_no] = "NO";
                }
                //# we test only on author1last, author2last, and pubyr to avoid
                //#  false mismatches due to typos
                if (
                    cr.reference_no === resultReferenceNumber &&
                    "YES" === cr.ref_has_opinion && 
                    "YES" === opinion.ref_has_opinion 
                ) {
                    authorHasOpinion[cr.child_no] = "YES";
                } else if ( 
                    cr.author1last === opinion.author1last && 
                    cr.author2last === opinion.author2last && 
                    cr.pubyr === opinion.pubyr && 
                    "YES" !== cr.ref_has_opinion && 
                    "YES" !== opinion.ref_has_opinion
                )	{
                    authorHasOpinion[cr.child_no] = "YES";
                }
            }
        }

        const children = Object.keys(authorHasOpinion).sort((a,b) => speciesName[a].localeCompare(speciesName[b]))
        let needOpinion;
        for (ch of children) {
            if ("NO" === authorHasOpinion[ch])	{
                if (!needOpinion) {
                    needOpinion = speciesName[ch];
                } else	{
                    if (!/ and /.test(needOpinion))	{
                        needOpinion += " and " + speciesName[ch];
                    } else	{
                        needOpinion.replaceAll(" and ", ", ");
                        needOpinion += " and " + speciesName[ch];
                    }
                }
            }
        }
        //$needOpinion =~ s/^, //; //TODO: Not sure what this does, omitting for now
        */
        /*
        //TODO: skipping for now. Probably return raw data rather than string
        const authors;
        if ( $opinionHTML =~ / and | et al/ )	{
            $authors = "These authors'";
        } else	{
            $authors = "This author's";
        }
        if ( $needOpinion =~ / and / )	{
            push @warnings , $authors . " opinions on " . $needOpinion . " still may need to be entered";
        } elsif ( $needOpinion )	{
            push @warnings , $authors . " opinion on " . $needOpinion . " still may need to be entered";
        }
        */
    }
}

const updatePerson = async (conn, user) => {
    const rs = await conn.query("update person set last_action = now(), last_entry = now() where person_no = ?", [user.userID]);
    if (rs.affectedRows !== 1) throw new Error("Could not update person table");
}


export const getOpinions = async (pool, limit, offset) => {
    //logger.info("getOpinions");
    let conn;
    try {
      conn = await pool.getConnection();
      const countsql = "SELECT count(*) as count from opinions";
      let sql = "SELECT opinion_no, child_no, child_spelling_no, parent_no, parent_spelling_no from opinions order by opinion_no";
      sql = limit ? `${sql} limit ${limit}` : sql;
      sql = offset ? `${sql} offset ${offset}` : sql;
      const count = await conn.query(countsql);
      const rows = await conn.query(sql);
      logger.trace(rows);
      logger.trace(count);
      logger.trace(count.count);
      return {
        opinions: rows,
        count: count[0].count
      }
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const getOpinion = async (pool, id) => {
    logger.info("getOpinion");

    let conn;
    try {

      conn = await pool.getConnection();
      const rows = await conn.query(`
        select  
            o.*
        from 
        opinions o
        where 
            o.opinion_no = ?
      `, [id])

      logger.trace(rows)

      return rows;
    } finally {
      if (conn) conn.release(); //release to pool
    }
}

export const createOpinion = async (pool, opinion, user, allowDuplicate, allowMigrations) => {
    logger.info("createOpinion");
    logger.trace(opinion);
    logger.trace(user)

    const insertAssets = prepareInsertAssets(opinion, []);
	insertAssets.propStr += `, enterer_no, authorizer_no`;
	insertAssets.valStr += `, :enterer_no, :authorizer_no`;
    insertAssets.values.enterer_no = user.userID;
    insertAssets.values.authorizer_no = user.authorizerID;
   
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        //Per https://github.com/paleobiodb/classic/blob/1cc4d2748c339856c9263743a4bb6c6e1372ad8b/lib/PBDB/Opinion.pm#L774
        opinion.child_no = await getOriginalCombination(conn, opinion.child_no);

        const childTaxon = await fetchTaxon(conn, opinion.child_no);
        logger.trace("childTaxon = ")
        logger.trace(childTaxon)

        let childSpellingTaxon;
        if (opinion.child_spelling_no) {
            childSpellingTaxon = await fetchTaxon(conn, opinion.child_spelling_no);
            logger.trace("childSpellingTaxon = ")
            logger.trace(childSpellingTaxon)
        }

        //Note: I have no idea if I'm doing this parent stuff right
        let parentTaxon;
        if (opinion.parent_no) {
            parentTaxon = await fetchTaxon(conn, opinion.parent_no);
            logger.trace("parentTaxon = ")
            logger.trace(parentTaxon)
        }

        let parentSpellingTaxon;
        if (opinion.parent_spelling_no) {
            parentSpellingTaxon = await fetchTaxon(conn, opinion.parent_spelling_no);
            logger.trace("parentSpellingTaxon = ")
            logger.trace(parentSpellingTaxon)
        }

        if (
            //allowDuplicate || //TODO: Not sure this applies for opinions
            ! await isDuplicate(conn, opinion)
        ) {

            //verify reference
            await verifyReference(conn, opinion.reference_no, opinion.pubyr);
            
            const migrations = await gatherMigrations(conn, opinion, allowMigrations)

            const insertSQL = `insert into opinions (${insertAssets.propStr}) values (${insertAssets.valStr}) returning opinion_no`
            logger.trace(insertSQL)
            logger.trace(insertAssets.values)
        
            await doMigrations(conn, migrations, opinion)

            //We've decided not to do this. Keeping it ghosted for now in case we change our mind.
            //await fixMassEstimates(conn, opinion.child_no);

            await updatePerson(conn, user);

            let res = await conn.query({ 
                namedPlaceholders: true, 
                sql: insertSQL
            }, insertAssets.values);
            logger.trace("after insert")
            logger.trace(res)
            logger.trace(res[0].opinion_no)

            const synonyms = await fetchPotentialSynonyms(conn, opinion.child_spelling_no, childTaxon)

            opinion.opinion_no = res[0].opinion_no;

            await conn.commit();
            //return opinion;
            return {
                opinion: opinion,
                warnings: synonyms ? [{
                    warning: "Opinions may need to be altered for these child taxa.",
                    data: {
                        taxaToCheck: synonyms.map((s) => s.taxon_name)
                    }
                }] :
                null
            }
        } else {
            const error = new Error(`The author's opinion on ${childTaxon.taxon_name} has already been entered - an author can only have one opinion on a name`);
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

export const updateOpinion = async (pool, patch, user, allowDuplicate,mergedOpinion) => {
    logger.info("updateOpinion");
    logger.trace(user)
    logger.trace(patch);
    logger.trace(mergedOpinion)

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        if (
            allowDuplicate || 
            ! await isDuplicate(conn, mergedOpinion)
        ) {

            const updateAssets = prepareUpdateAssets(patch, []);
    
            updateAssets.propStr += `${updateAssets.propStr === '' ? '': ', '} modifier_no = :modifier_no`
            updateAssets.values.modifier_no = user.userID;
            updateAssets.values.opinion_no = mergedOpinion.opinion_no;
        

            //verify fks
            if (patch.reference_no || patch.reference_no === 0) {
                await verifyReference(conn, patch.reference_no);
            }

            const updateSQL = `update opinions set ${updateAssets.propStr} where opinion_no = :opinion_no`
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
            const error = new Error(`Duplicate opinion found. If you wish to proceed, resubmit with property allowDuplicate set to true.`);
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