import {getReferences, getReference, createReference} from './reference.model.js'
import {schema} from './reference.schema.js'
import jmp from 'json-merge-patch'

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

	
    fastify.post(
		'/',
        {
			preHandler : fastify.auth([
				fastify.verifyAuth,
			]),
		  	schema: schema
		},
		async (req, res) => {
		  fastify.log.info("reference POST")
		  fastify.log.trace(req.body)
  
		  if (await createReference(fastify.mariadb, req.body.reference, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, fastify)) {
			  //res.send('success');
			  return {statusCode: 200, msg: "success"}
		  } else {
			  //res.send('failure');
			  return {statusCode: 500, msg: "failure"}
		  }
	})

    fastify.patch(
		'/:id',
		/*
        {
			preHandler : fastify.auth([
				fastify.verifyAuth,
			]),
		  	schema: schema
		},
		*/
		async (req, res) => {
		  	fastify.log.info("reference PATCH")
			fastify.log.trace(req)
		  	fastify.log.trace(req.body)

			const refs = await getReference(fastify.mariadb, req.params.id);
			fastify.log.trace(refs[0])
			/*
			const ref = {reference: Object.entries(refs[0]).reduce((acc, [key, value]) => {
				if (value !== null && value !== undefined) {
					acc[key] = value;
				}
				return acc;
			}, {})}
			*/
			const ref = {reference: Object.fromEntries(Object.entries(refs[0]).filter(([_, v]) => v != null))};

			fastify.log.trace("after stripping nulls")
			fastify.log.trace(ref)

			const mergedRef = jmp.apply(ref, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedRef)

			const validate = req.compileValidationSchema(schema.body);


			if (validate(mergedRef)) {
				return {statusCode: 200, msg: "success"}
			} else {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors.length)
				fastify.log.trace(validate.errors);
				return {statusCode: 500, msg: "failure"}
			}
	})

	
}

