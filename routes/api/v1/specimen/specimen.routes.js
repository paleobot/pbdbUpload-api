import {createSchema, editSchema, getSchema} from './specimen.schema.js'
import {getSpecimens, getSpecimen, updateSpecimen, createSpecimen} from './specimen.model.js'
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

			const specimens = await getSpecimens(fastify.mariadb, limit, offset, fastify);
			fastify.log.trace(specimens)
			return {
				data: {
				specimens: specimens.specimens,
				},
				navlinks: reply.navLinks(request, limit, offset, specimens.specimens.length, specimens.count, false)
			}
		}
	)

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const specimens = await getSpecimen(fastify.mariadb, request.params.id);
		reply.send(specimens);
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
			fastify.log.info("specimen POST")
			fastify.log.trace(req.body)
	
			const newSpecimen = await createSpecimen(fastify.mariadb, req.body.specimen, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate)
		
			return {statusCode: 201, msg: "specimen created", specimen_no: newSpecimen.specimen_no}
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
		  	fastify.log.info("specimen PATCH")

			//fetch existing collection from db
			const specimens = await getSpecimen(fastify.mariadb, req.params.id);

			if (!specimens || specimens.length === 0) {
				const error = new Error(`Unrecognized specimen: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(specimens[0])

			//strip null properties
			const specimen = {specimen: Object.fromEntries(Object.entries(specimens[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(specimen)

			//merge with patch in req.body 
			const mergedSpecimen = jmp.apply(specimen, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedSpecimen)

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged specimen
			if (!validate(mergedSpecimen)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//Need to re-add specimen_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedSpecimen.specimen.specimen_no = parseInt(req.params.id);
			fastify.log.info("mergedSpecimen after validation(specimen_no added")
			fastify.log.info(mergedSpecimen)

			await updateSpecimen(fastify.mariadb, req.body.specimen, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, mergedSpecimen.specimen)

			return {statusCode: 204, msg: "Specimen modified"}
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



