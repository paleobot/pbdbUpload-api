import {createSchema, editSchema, getSchema} from './collection.schema.js'
import {getCollection, createCollection, updateCollection} from './collection.model.js'
import jmp from 'json-merge-patch'

export default async function (fastify, opts) {
    fastify.get('/', {schema: getSchema}, async function (request, reply) {
      return { statusCode: 501, msg: "collection get not implemented" }
    })

	fastify.get('/:id', {schema: getSchema}, async (request, reply) => {
		//const collections = await getCollection(fastify.mariadb, request.params.id);
		//reply.send(collections);
		return { statusCode: 501, msg: "collection get not implemented" }
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
			fastify.log.info("collection POST")
			fastify.log.trace(req.body)
	
			const newCollection = await createCollection(fastify.mariadb, req.body.collection, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate)
		
			return {statusCode: 201, msg: "collection created", collection_no: newCollection.collection_no}
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
		  	fastify.log.info("collection PATCH")

			//fetch existing collection from db
			const collections = await getCollection(fastify.mariadb, req.params.id);

			if (!collections || collections.length === 0) {
				const error = new Error(`Unrecognized collection: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(collections[0])

			//strip null properties
			const collection = {collection: Object.fromEntries(Object.entries(collections[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(collection)

			//merge with patch in req.body 
			const mergedCollection = jmp.apply(collection, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedCollection)

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged collection
			if (!validate(mergedCollection)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//Need to re-add collection_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedCollection.collection.collection_no = parseInt(req.params.id);
			fastify.log.info("mergedCollection after validation(collection_no added")
			fastify.log.info(mergedCollection)

			await updateCollection(fastify.mariadb, req.body.collection, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, mergedCollection.collection)

			return {statusCode: 204, msg: "Collection modified"}
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



