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
        values[prop] = object[prop]
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
        values[prop] = object[prop]
    })

    return {
        propStr: propStr,
        values: values
    }
}