import {logger} from './app.js'

export const parseTaxon = taxonName => {
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
