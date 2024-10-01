import {logger} from './app.js'

export const prepareInsertAssets = (object) => {
    logger.trace("prepareInsertAssets")

    let properties = Object.keys(object);
    logger.trace(properties)

    let propStr = '';
    let valStr = '';
    const values = {};
    properties.forEach((prop, index) => {
        propStr += index === 0 ? ` ${prop}` : `, ${prop}`;
        valStr += index === 0 ? `:${prop}` : `, :${prop}`;
        //mariadb values for set types must be properly formatted
        if (Array.isArray(object[prop])) {
            values[prop] = object[prop].reduce((acc, obj, i) => {
                acc += i === 0 ? `${obj}` : `,${obj}`
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

export const prepareUpdateAssets = (object) => {
    logger.trace("prepareUpdateAssets")

    let properties = Object.keys(object);
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
