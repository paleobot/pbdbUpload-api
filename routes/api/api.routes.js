import url from 'url'
import {logger} from '../../app.js'

export default async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    return { 
    	v1: url.format({
        protocol: request.protocol,
        host: request.hostHack(),
        pathname: request.url.replace(/\/$/, '') + "/v1",
    })}
  })
}
