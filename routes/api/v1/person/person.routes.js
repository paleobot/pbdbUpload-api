export default async function (fastify, opts) {
    fastify.get('/', async function (request, reply) {
      return { msg: "person routes not yet implemented" }
    })

    fastify.post(
		'/',
        {
			preHandler : fastify.auth([
				fastify.verifyAuth,
			]),
		  	//schema: schema
		},
		async (req, res) => {
		  fastify.log.info("person POST")
		  fastify.log.trace(req.body)
  
		  if (true/*await createPerson(fastify.mariadb, req.body.person, {userID: req.userID, userName: req.userName})*/) {
			  //res.send('success');
			  return {statusCode: 200, msg: "success"}
		  } else {
			  //res.send('failure');
			  return {statusCode: 500, msg: "failure"}
		  }
	})

  }