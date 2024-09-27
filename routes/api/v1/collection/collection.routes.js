import {schema} from './collection.schema.js'
import {getCollection, createCollection, updateCollection} from './collection.model.js'
import jmp from 'json-merge-patch'

export default async function (fastify, opts) {
    fastify.get('/', async function (request, reply) {
      return { msg: "collection routes not yet implemented" }
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
			fastify.log.info("collection POST")
			fastify.log.trace(req.body)
	
			if (await createCollection(fastify.mariadb, req.body.collection, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID})) {
				//res.send('success');
				return {statusCode: 200, msg: "success"}
			} else {
				//res.send('failure');
				return {statusCode: 500, msg: "failure"}
			}
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
			//validation is handled below
		},
		async (req, res) => {
		  	fastify.log.info("collection PATCH")

			//fetch existing collection from db
			const collections = await getCollection(fastify.mariadb, req.params.id);
			fastify.log.trace(collections[0])

			//strip null properties
			const collection = {collection: Object.fromEntries(Object.entries(collections[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(collection)

			//merge with patch in req.body 
			const mergedCollection = jmp.apply(collection, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedCollection)

			//create a validator
			const validate = req.compileValidationSchema(schema.body);

			//validate the merged reference
			if (!validate(mergedCollection)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//if it's good, let the model apply the patch
			if (await updateCollection(fastify.mariadb, req.body.collection, req.params.id, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID})) {
				return {statusCode: 200, msg: "success"}
			} else {
				return {statusCode: 500, msg: "failure"}
			}
  		}
	)

}



