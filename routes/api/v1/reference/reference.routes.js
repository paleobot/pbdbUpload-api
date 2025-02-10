import {getReferences, getReference, createReference, updateReference} from './reference.model.js'
import {createSchema, editSchema, getSchema} from './reference.schema.js'
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
			}),
			schema: getSchema
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

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const refs = await getReference(fastify.mariadb, request.params.id);
		reply.send(refs);
	})

    fastify.post(
		'/',
        {
			preHandler : fastify.auth([
				fastify.verifyAuth,
			]),
		  	schema: createSchema
		},
		async (req, res) => {
			fastify.log.info("reference POST")
			fastify.log.trace(req.body)
	
			const newReference = await createReference(fastify.mariadb, req.body.reference, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate)

			return {statusCode: 201, msg: "reference created", reference_no: newReference.reference_no}

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
			schema: editSchema
		},
		async (req, res) => {
		  	fastify.log.info("reference PATCH")

			//fetch existing reference from db
			const refs = await getReference(fastify.mariadb, req.params.id);

			if (!refs || refs.length === 0) {
				const error = new Error(`Unrecognized reference: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(refs[0])

			//strip null properties
			const ref = {reference: Object.fromEntries(Object.entries(refs[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(ref)

			//merge with patch in req.body 
			const mergedReference = jmp.apply(ref, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedReference)

			//create a validator
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged reference
			if (!validate(mergedReference)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//Need to re-add reference_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedReference.reference.reference_no = parseInt(req.params.id);

			//if it's good, let the model apply the patch
			await updateReference(fastify.mariadb, req.body.reference, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, mergedReference.reference)

			return {statusCode: 204, msg: "Reference modified"}
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

