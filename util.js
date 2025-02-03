import {logger} from './app.js'

export const parseTaxonx = taxonName => {
    let genus = "", subgenus = "", species = "", subspecies = "";
  
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

export const parseTaxon = (taxonName, handleResos) => {
    logger.trace("parseTaxon")
    logger.trace("taxonName = " +  taxonName)

    let taxon = {
        genus: "",
        subgenus: "",
        species: "",
        subspecies: ""
    }

    if (handleResos) {

        taxon = {
            ...taxon,
            genusReso: null,
            subgenusReso: null,
            speciesReso: null,
            subspeciesReso: null
        }

        let tmpName = taxonName
    
        let match = tmpName.match(/(.*?)\s*n[.] gen[.]\s*(.*)/)
        if (match) {
            taxon.genusReso = "n. gen."
            tmpName = `${match[1]} ${match[2]}`
        }
        match = tmpName.match(/(.*?)\s*n[.] subgen[.]\s*(.*)/)
        if (match) {
            taxon.subgenusReso = "n. subgen."
            tmpName = `${match[1]} ${match[2]}`
        }
        match = tmpName.match(/(.*?)\s*n[.] sp[.]\s*(.*)/)
        if (match) {
            taxon.speciesReso = "n. sp."
            tmpName = `${match[1]} ${match[2]}`
        }
        match = tmpName.match(/(.*?)\s*n[.] (?:subsp|ssp)[.]\s*(.*)/)
        if (match) {
            taxon.subspeciesReso = "n. ssp."
            tmpName = `${match[1]} ${match[2]}`
        }

        //*****Genus
        match = tmpName.match(/^\s*([?]|aff[.]|cf[.]|ex gr[.]|sensu lato)\s*(.*)/)
        if (match) {
            if (taxon.genusReso) {
                const error = new Error(`Conflicting genus reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.genusReso = match[1]
            tmpName = match[2]
        }
        match = tmpName.match(/^\s*<(.*?)>\s*(.*)/)
        if (match) {
            if (taxon.genusReso) {
                const error = new Error(`Conflicting genus reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.genusReso = "informal"
            taxon.genus = match[1]
            tmpName = match[2] || ''//`${match[1]}${match[2] ? ` ${match[2]}` : ''}`
        } else {
            match = tmpName.match(/^\s*("?)([A-Za-z]+)("?)(?:\s*(.*))?/)
            if (match) {
                if (match[1]) {
                    if (taxon.genusReso) {
                        const error = new Error(`Conflicting genus reso in ${taxonName}`);
                        error.statusCode = 400
                        throw error				
                    }    
                    if (match[1] !== match[3]) {
                        const error = new Error(`Invalid name "${taxonName}": mismatched quote character on genus`);
                        error.statusCode = 400
                        throw error				
                    }    
                    taxon.genusReso = match[1]
                }

                taxon.genusReso = taxon.genusReso || ''
                taxon.genus = match[2]
                tmpName = match[4] || ''

            } else {
                const error = new Error(`Invalid name "${taxonName}": could not resolve genus`);
                error.statusCode = 400
                throw error				
            }  
            
            if (
                taxon.genus && 
                "informal" !== taxon.genusReso && 
                !/^[A-Z][a-z]+$/.test(taxon.genus)
            ) {
                const error = new Error(`Invalid name "${taxonName}": bad capitalization on genus`);
                error.statusCode = 400
                throw error				
            }
        }
        logger.trace("after genus")
        logger.trace("taxon = ")
        logger.trace(taxon);
        logger.trace("tmpName = " + tmpName)

        //*****Subgenus
        match = tmpName.match(/^([?]|aff[.]|cf[.]|ex gr[.]|sensu lato)\s*([(].*)/)
        if (match) {
            if (taxon.subgenusReso) {
                const error = new Error(`Conflicting subgenus reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.subgenusReso = match[1]
            tmpName = match[2]
        }
        match = tmpName.match(/^[(]<(.*?)>[)]\s*(.*)/)
        if (match) {
            if (taxon.subgenusReso) {
                const error = new Error(`Conflicting subgenus reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.subgenusReso = "informal"
            taxon.subgenus = match[1]
            tmpName = match[2] || ''//`${match[1]} ${match[2]}`
        } else {
            match = tmpName.match(/^[(]("?)([A-Za-z]+)("?)[)]\s*(.*)/)
            if (match) {
                if (match[1]) {
                    if (taxon.subgenusReso) {
                        const error = new Error(`Conflicting subgenus reso in ${taxonName}`);
                        error.statusCode = 400
                        throw error				
                    }    
                    if (match[1] !== match[3]) {
                        const error = new Error(`Invalid name "${taxonName}": mismatched quote character on subgenus`);
                        error.statusCode = 400
                        throw error				
                    }    
                    taxon.subgenusReso = match[1]
                }

                taxon.subgenusReso = taxon.subgenusReso || ''
                taxon.subgenus = match[2]
                tmpName = match[4] || ''

            } else {
                match = taxonName.match(/[(]/)
                if (match) {
                    const error = new Error(`Invalid name "${taxonName}": could not resolve subgenus`);
                    error.statusCode = 400
                    throw error
                } else {
                    taxon.subgenus = taxon.subgenus || '';
                    taxon.subgenusReso = taxon.subgenusReso || '';
            
                }				
            }  
            
            if (
                taxon.subgenus && 
                "informal" !== taxon.subgenusReso && 
                !/^[A-Z][a-z]+$/.test(taxon.subgenus)
            ) {
                const error = new Error(`Invalid name "${taxonName}": bad capitalization on subgenus`);
                error.statusCode = 400
                throw error				
            }
        }
        logger.trace("after subgenus")
        logger.trace("taxon = ")
        logger.trace(taxon);
        logger.trace("tmpName = " + tmpName)

        //****Species 
        match = tmpName.match(/^([?]|aff[.]|cf[.]|ex gr[.]|sensu lato)(?:\s*(.*))?/)
        if (match) {
            if (taxon.speciesReso) {
                const error = new Error(`Conflicting species reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.speciesReso = match[1]
            tmpName = match[2]
        }
        match = tmpName.match(/^<(.*?)>(?:\s(.*))?/)
        if (match) {
            if (taxon.speciesReso) {
                const error = new Error(`Conflicting species reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.speciesReso = "informal"
            taxon.species = match[1]
            tmpName = match[2] || ''//`${match[1]} ${match[2]}`
        } else {
            match = tmpName.match(/^("?)([A-Za-z]+[.]?)("?)(?:\s+(.*))?/)
            if (match) {
                if (match[1]) {
                    if (taxon.speciesReso) {
                        const error = new Error(`Conflicting species reso in ${taxonName}`);
                        error.statusCode = 400
                        throw error				
                    }    
                    if (match[1] !== match[3]) {
                        const error = new Error(`Invalid name "${taxonName}": mismatched quote character on species`);
                        error.statusCode = 400
                        throw error				
                    }    
                    taxon.speciesReso = match[1]
                }

                taxon.speciesReso = taxon.speciesReso || ''
                taxon.species = match[2]
                tmpName = match[4] || ''

            } else if (taxon.speciesReso && ! taxon.species) {
                    const error = new Error(`Invalid name "${taxonName}": could not resolve species`);
                    error.statusCode = 400
                    throw error
            } else {
                taxon.species = taxon.species || '';
                taxon.speciesReso = taxon.speciesReso || '';        
            }				
              
            
            if (
                taxon.species && 
                "informal" !== taxon.speciesReso 
            ) {
                match = taxon.species.match(/[.]$/)
                if (match) {
                    if (!/^(?:sp|spp|indet)[.]$/.test(taxon.species)) {
                        const error = new Error(`Invalid name "${taxonName}": ${taxon.species} is not valid`);
                        error.statusCode = 400
                        throw error				
                    }
                } else if (!/^[a-z]+$/.test(taxon.species)) {
                    const error = new Error(`Invalid name "${taxonName}": bad capitalization on species`);
                    error.statusCode = 400
                    throw error				
                }
            }
        }
        logger.trace("after species")
        logger.trace("taxon = ")
        logger.trace(taxon);
        logger.trace("tmpName = " + tmpName)

        //****Subspecies
        match = tmpName.match(/^\s*([?]|aff[.]|cf[.]|ex gr[.]|sensu lato)(?:\s(.*))?/)
        if (match) {
            if (taxon.subspeciesReso) {
                const error = new Error(`Conflicting subspecies reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.subspeciesReso = match[1]
            tmpName = match[2]
        }
        match = tmpName.match(/^\s*<(.*?)>(?:\s*)?/)
        if (match) {
            if (taxon.subspeciesReso) {
                const error = new Error(`Conflicting subspecies reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.subspeciesReso = "informal"
            taxon.subspecies = match[1]
            tmpName = match[2] || ''//`${match[1]} ${match[2]}`
        } else {
            match = tmpName.match(/^\s*("?)([A-Za-z]+[.]?)("?)(?:\s*)?/)
            if (match) {
                if (match[1]) {
                    if (taxon.subspeciesReso) {
                        const error = new Error(`Conflicting subspecies reso in ${taxonName}`);
                        error.statusCode = 400
                        throw error				
                    }    
                    if (match[1] !== match[3]) {
                        const error = new Error(`Invalid name "${taxonName}": mismatched quote character on subspecies`);
                        error.statusCode = 400
                        throw error				
                    }    
                    taxon.subspeciesReso = match[1]
                }

                taxon.subspeciesReso = taxon.subspeciesReso || ''
                taxon.subspecies = match[2]
                tmpName = match[4] || ''

            } else if (tmpName && !taxon.species) {
                const error = new Error(`Invalid name "${taxonName}": could not resolve species`);
                error.statusCode = 400
                throw error
            } else if (taxon.subspeciesReso) {
                const error = new Error(`Invalid name "${taxonName}": could not resolve subspecies`);
                error.statusCode = 400
                throw error
            } else if (tmpName) {
                const error = new Error(`Invalid name "${taxonName}": could not parse ${tmpName}`);
                error.statusCode = 400
                throw error
            } else {
                taxon.subspecies = taxon.subspecies || '';
                taxon.subspeciesReso = taxon.subspeciesReso || '';        
            }				
              
            
            if (
                taxon.subspecies && 
                "informal" !== taxon.subspeciesReso 
            ) {
                match = taxon.subspecies.match(/[.]$/)
                if (match) {
                    if (!/^(?:subsp|subspp|indet)[.]$/.test(taxon.subspecies)) {
                        const error = new Error(`Invalid name "${taxonName}": ${taxon.subspecies} is not valid`);
                        error.statusCode = 400
                        throw error				
                    }
                } else if (!/^[a-z]+$/.test(taxon.subspecies)) {
                    const error = new Error(`Invalid name "${taxonName}": bad capitalization on species`);
                    error.statusCode = 400
                    throw error				
                }
            }
        }
        logger.trace("after subspecies")
        logger.trace("taxon = ")
        logger.trace(taxon);
        logger.trace("tmpName = " + tmpName)

        //NOTE: The comment to this code in OccurrenceEntry.pm, line 1109, says not to resolve it either genus or subgenus are informal. But the code only checks genus. I'm assuming that's a bug and correcting it here.
        taxon.fullName = 
            taxon.genusReso === "informal" || taxon.subgenusReso === "informal" ?
            '' :
            `${taxon.genus}${taxon.subgenus ? ` (${taxon.subgenus})` : ''}${taxon.species ? ` ${taxon.species}` : ''}${taxon.subspecies ? ` ${taxon.subspecies}` : ''}`

    } else {

        let parsedName = taxonName.match(/^([A-Z][a-z]+)(?:\s\(([A-Z][a-z]+)\))?(?:\s([a-z.]+))?(?:\s([a-z.]+))?/);
        if (parsedName) {
            taxon.genus = parsedName[1] || taxon.genus;
            taxon.subgenus = parsedName[2] || taxon.subgenus;
            taxon.species = parsedName[3] || taxon.species;
            taxon.subspecies = parsedName[4] || taxon.subspecies;
        }

        if (!taxon.genus && taxonName) {
            //Loose match, capitalization doesn't matter. The % is a wildcard symbol
            parsedName = taxonName.match(/^([a-z%]+)(?:\s\(([a-z%]+)\))?(?:\s([a-z.]+))?(?:\s([a-z.]+))?/)
            if (parsedName) {
                taxon.genus = parsedName[1] || taxon.genus;
                taxon.subgenus = parsedName[2] || taxon.subgenus;
                taxon.species = parsedName[3] || taxon.species;
                taxon.subspecies = parsedName[4] || taxon.subspecies;
            }
        }
    }
    
    return taxon;
}

export const prepareInsertAssets = (object, ignore = []) => {
    logger.trace("prepareInsertAssets")

    let properties = Object.keys(object).filter(key => !ignore.includes(key));
    logger.info(properties)

    let propStr = '';
    let valStr = '';
    const values = {};
    properties.forEach((prop, index) => {

        propStr += index === 0 ? ` ${prop}` : `, ${prop}`;
        valStr += index === 0 ? `:${prop}` : `, :${prop}`;
        //mariadb values for set types must be properly formatted
        if (Array.isArray(object[prop])) {
            values[prop] = object[prop].reduce((acc, obj, i) => {
                return acc += i === 0 ? `${obj}` : `,${obj}`
            }, '')
        } else {
            values[prop] = object[prop]
        }
    })

    return {
        propStr: propStr,
        valStr: valStr,
        values: values
    }
}

export const prepareUpdateAssets = (object, ignore = []) => {
    logger.trace("prepareUpdateAssets")

    let properties = Object.keys(object).filter(key => !ignore.includes(key));
    logger.trace(properties)

    let propStr = '';
    const values = {};
    properties.forEach((prop, index) => {

        propStr += index === 0 ? ` ${prop} = :${prop}` : `, ${prop} = :${prop}`;
        //mariadb values for set types must be properly formatted
        if (Array.isArray(object[prop])) {
            values[prop] = object[prop].reduce((acc, obj, i) => {
                logger.trace(obj)
                return acc += i === 0 ? `${obj}` : `,${obj}`
            }, '')
        } else {
            values[prop] = object[prop]
        }
    })

    return {
        propStr: propStr,
        values: values
    }
}

export const calcDegreesMinutesSeconds = (decVal) => {
    decVal = Math.abs(decVal)

    const degrees = Math.floor(decVal)
    const minutes = Math.floor((decVal - degrees) * 60)
    const seconds = Math.round((decVal - degrees - minutes/60) * 3600)

    return {
        degrees: degrees,
        minutes: minutes,
        seconds: seconds
    }
}
