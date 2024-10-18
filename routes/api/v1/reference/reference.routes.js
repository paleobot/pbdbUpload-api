import {getReferences, getReference, createReference, updateReference} from './reference.model.js'
import {schema} from './reference.schema.js'
import jmp from 'json-merge-patch'

export default async function (fastify, opts) {

	//TODO: We aren't providing GET functionality. This is just for testing.
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

	/*
	patch expects the body to be in json merge patch format (https://datatracker.ietf.org/doc/html/rfc7386).
    */
	fastify.patch(
		'/:id',
        {
			preHandler : fastify.auth([
				fastify.verifyAuth,
			]),
			//validation is handled below
		},
		async (req, res) => {
		  	fastify.log.info("reference PATCH")

			//fetch existing reference from db
			const refs = await getReference(fastify.mariadb, req.params.id);
			fastify.log.trace(refs[0])

			//strip null properties
			const ref = {reference: Object.fromEntries(Object.entries(refs[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(ref)

			//merge with patch in req.body 
			const mergedRef = jmp.apply(ref, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedRef)

			//create a validator
			const validate = req.compileValidationSchema(schema.body);

			//validate the merged reference
			if (!validate(mergedRef)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//if it's good, let the model apply the patch
			if (await updateReference(fastify.mariadb, req.body.reference, req.params.id, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, fastify)) {
				return {statusCode: 200, msg: "success"}
			} else {
				return {statusCode: 500, msg: "failure"}
			}
  		}
	)

	//TODO: Tabling delete functionality for now. This will be tricky without
	//foreign key constraints
	/*
    fastify.delete(
		'/:id',
        {
			preHandler : fastify.auth([
				fastify.verifyAuth,
			]),
		},
		async (req, res) => {
			fastify.log.info("reference DELETE")
	
			const deleteReference = await deleteReference(fastify.mariadb, req.params.id, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID})
			
			return {statusCode: 200, msg: `reference ${req.params.id} deleted`}
		}
	)
	*/

}

