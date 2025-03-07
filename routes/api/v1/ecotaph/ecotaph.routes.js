import {createSchema, editSchema, getSchema} from './ecotaph.schema.js'
import {getEcotaphs, getEcotaph, updateEcotaph, createEcotaph} from './ecotaph.model.js'
import jmp from 'json-merge-patch'

export default async function (fastify, opts) {
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

			const ecotaphs = await getEcotaphs(fastify.mariadb, limit, offset, fastify);
			fastify.log.trace(ecotaphs)
			return {
				data: {
					ecotaphs: ecotaphs.ecotaphs,
				},
				navlinks: reply.navLinks(request, limit, offset, ecotaphs.ecotaphs.length, ecotaphs.count, false)
			}
		}
	)

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const ecotaphs = await getEcotaph(fastify.mariadb, request.params.id);
		reply.send(ecotaphs);
	})


	/*
	Swagger UI needs this syntax if using OpenAPI 3. Then have to use a $ref to access it in the route definition. Couldn't get this to work well, so I'm using OpenAPI 2. Leaving this here as a reminder.
	https://github.com/fastify/fastify-swagger-ui?tab=readme-ov-file#rendering-models-at-the-bottom-of-the-page

	fastify.addSchema({
		$id: 'collectionsFullSchema',
		type: 'object',
		properties: schema.body.properties
	})	
	*/

    fastify.post(
		'/',
        {
			preHandler : fastify.auth([
				fastify.verifyAuth,
			]),
		  	schema: createSchema
		},
		async (req, res) => {
			fastify.log.info("ecotaph POST")
			fastify.log.trace(req.body)
	
			const newEcotaph = await createEcotaph(fastify.mariadb, req.body.ecotaph, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate)
		
			return {statusCode: 201, msg: "ecotaph created", ecotaph_no: newEcotaph.ecotaph_no}
		}
	)

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
		  	fastify.log.info("ecotaph PATCH")

			//fetch existing collection from db
			const ecotaphs = await getEcotaph(fastify.mariadb, req.params.id);

			if (!ecotaphs || ecotaphs.length === 0) {
				const error = new Error(`Unrecognized ecotaph: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(ecotaphs[0])

			//strip null properties
			const ecotaph = {ecotaph: Object.fromEntries(Object.entries(ecotaphs[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(ecotaph)

			//merge with patch in req.body 
			const mergedEcotaph = jmp.apply(ecotaph, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedEcotaph)

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged ecotaph
			if (!validate(mergedEcotaph)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//Need to re-add ecotaph_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedEcotaph.ecotaph.ecotaph_no = parseInt(req.params.id);
			fastify.log.info("mergedEcotaph after validation(ecotaph_no added")
			fastify.log.info(mergedEcotaph)

			await updateEcotaph(fastify.mariadb, req.body.ecotaph, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, mergedEcotaph.ecotaph)

			return {statusCode: 204, msg: "Ecotaph modified"}
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
			fastify.log.info("collection DELETE")
	
			const deleteCollection = await deleteCollection(fastify.mariadb, req.params.id, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID})
			
			return {statusCode: 200, msg: `collection ${req.params.id} deleted`}
		}
	)
	*/

}



