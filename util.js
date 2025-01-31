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
    
        let match = taxonName.match(/(.*?)\s*n[.] gen[.]\s*(.*)/)
        if (match) {
            taxon.genusReso = "n. gen."
            taxonName = `${match[1]} ${match[2]}`
        }
        match = taxonName.match(/(.*?)\s*n[.] subgen[.]\s*(.*)/)
        if (match) {
            taxon.subgenusReso = "n. subgen."
            taxonName = `${match[1]} ${match[2]}`
        }
        match = taxonName.match(/(.*?)\s*n[.] sp[.]\s*(.*)/)
        if (match) {
            taxon.speciesReso = "n. sp."
            taxonName = `${match[1]} ${match[2]}`
        }
        match = taxonName.match(/(.*?)\s*n[.] (?:subsp|ssp)[.]\s*(.*)/)
        if (match) {
            taxon.subspeciesReso = "n. ssp."
            taxonName = `${match[1]} ${match[2]}`
        }

        match = taxonName.match(/^\s*([?]|aff[.]|cf[.]|ex gr[.]|sensu lato)\s+(.*)/)
        if (match) {
            if (taxon.genusReso) {
                const error = new Error(`Conflicting genus reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.genusReso = match[1]
            taxonName = match[2]
        }
        match = taxonName.match(/^\s*<(.*?)>(?:\s(.*))?/)
        if (match) {
            if (taxon.genusReso) {
                const error = new Error(`Conflicting genus reso in ${taxonName}`);
                error.statusCode = 400
                throw error				
            }
            taxon.genusReso = "informal"
            taxonName = `${match[1]} ${match[2]}`
        } else {
            match = taxonName.match(/^\s*("?)([A-Za-z]+)("?)\s*(.*)/)
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
                taxonName = match[4]
            } else {
                const error = new Error(`Invalid name "${taxonName}": could not resolve genus`);
                error.statusCode = 400
                throw error				
            }  
            
            if (taxon.genus && "informal" !== taxon.genusReso && !/^[A-Z][a-z]+$/.test(taxon.genus)) {
                const error = new Error(`Invalid name "${taxonName}": bad capitalization on genus`);
                error.statusCode = 400
                throw error				
            }
        }

        //TODO: subgenus/species/subspecies, ugh
    }


    let parsedName = taxonName.match(/^([A-Z][a-z]+)(?:\s\(([A-Z][a-z]+)\))?(?:\s([a-z.]+))?(?:\s([a-z.]+))?/);
    if (parsedName) {
        taxon.genus = parsedName[1] || taxon.genus;
        taxon.subgenus = parsedName[2] || taxon.subgenus;
        taxon.species = parsedName[3] || taxon.species;
        taxon.subspecies = parsedName[4] || taxon.subspecies;
    }

    if (!genus && taxonName) {
        //Loose match, capitalization doesn't matter. The % is a wildcard symbol
        parsedName = taxonName.match(/^([a-z%]+)(?:\s\(([a-z%]+)\))?(?:\s([a-z.]+))?(?:\s([a-z.]+))?/)
        if (parsedName) {
            taxon.genus = parsedName[1] || taxon.genus;
            taxon.subgenus = parsedName[2] || taxon.subgenus;
            taxon.species = parsedName[3] || taxon.species;
            taxon.subspecies = parsedName[4] || taxon.subspecies;
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
