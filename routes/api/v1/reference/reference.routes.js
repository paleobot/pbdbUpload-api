import {getReferences, getReference, createReference} from './reference.model.js'
import {schema} from './reference.schema.js'

export default async function (fastify, opts) {

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
			fastify.log.info("get handler");

			const aCookieValue = request.cookies.session_id
			fastify.log.trace(aCookieValue);
			//throw new Error("Hogan's goat!");

			const limit = request.query.limit ? parseInt(request.query.limit) : 10;
      		const offset = request.query.offset ? parseInt(request.query.offset) : 0;
 	         fastify.log.trace(request.query)

			const refs = await getReferences(fastify.mariadb, limit, offset, fastify);
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

	//TODO: This is a test stub that writes to a dummy table.
    fastify.post(
		'/',
		{
		  schema: schema/*{
			body: {
			  type: 'object',
			  properties: {
				reference: {
				  type: "object",
				  properties: {
					name: { type: 'string' },
					notes: { type: "string"}
				  },
				  required: ["name", "notes"]
				}
			  },
			  required: ["reference"]
			}
		  }*/
		},
		async (req, res) => {
		  fastify.log.info("reference POST")
		  fastify.log.trace(req.body)
  
		  //if (await createReference(fastify.mariadb, req.body.reference, fastify)) {
			  res.send('success');
		  //} else {
			//  res.send('failure');
		  //}
	  })
  
}

