import {schema} from './collection.schema.js'
import {createCollection} from './collection.model.js'

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
  
		  if (await createCollection(fastify.mariadb, req.body.collection, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID/*  */})) {
			  //res.send('success');
			  return {statusCode: 200, msg: "success"}
		  } else {
			  //res.send('failure');
			  return {statusCode: 500, msg: "failure"}
		  }
	})

  }