import {getReferences, getReference, createReference} from './reference.model.js'

export default async function (fastify, opts) {
    /*
    fastify.get('/', async function (request, reply) {
      return { reference: true }
    })
    */

    fastify.get(
    	'/',
        {
			preHandler: fastify.auth([
				fastify.verifyAuth,
			], {
				relation: 'and'
			})
        }, 
		async (request, reply) => {
			//return {references: [{name: "dummy"}]}
			fastify.log.info("get handler");

			const aCookieValue = request.cookies.session_id
			fastify.log.trace(aCookieValue);
			//throw new Error("Hogan's goat!");

			const limit = request.query.limit ? parseInt(request.query.limit) : 10;
      		const offset = request.query.offset ? parseInt(request.query.offset) : 0;
 	         fastify.log.trace(request.query)

			const refs = await getReferences(fastify.mariadb, limit, offset, fastify);
			//logger.silly(refs)
			//reply.send(refs);
			fastify.log.trace(refs)
			return {
				data: {
				references: refs.refs,
				},
				navlinks: reply.navLinks(request, limit, offset, refs.refs.length, refs.count, false)
			}
    	})


	fastify.get('/:id', async (request, reply) => {
		const refs = await getReference(fastify.mariadb, request.params.id);
		reply.send(refs);
	})

}

