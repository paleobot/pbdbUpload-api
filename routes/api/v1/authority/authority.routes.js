import {createSchema, editSchema, getSchema} from './authority.schema.js'
import {getAuthorities, getAuthority, createAuthority, updateAuthority} from './authority.model.js'
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

			const authorities = await getAuthorities(fastify.mariadb, limit, offset, fastify);
			fastify.log.trace(authorities)
			return {
				data: {
					authorities: authorities.authorities,
				},
				navlinks: reply.navLinks(request, limit, offset, authorities.authorities.length, authorities.count, false)
			}
		}
	)

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const authorities = await getAuthority(fastify.mariadb, request.params.id);
		reply.send(authorities);
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
			fastify.log.info("authority POST")
			fastify.log.trace(req.body)
	
			const newAuthority = await createAuthority(fastify.mariadb, req.body.authority, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, req.body.bypassOccurrences)
		
			return {statusCode: 201, msg: "authority created", taxon_no: newAuthority.taxon_no}
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
		  	fastify.log.info("authority PATCH")

			//fetch existing collection from db
			const authorities = await getAuthority(fastify.mariadb, req.params.id);

			if (!authorities || authorities.length === 0) {
				const error = new Error(`Unrecognized authority: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			delete authorities[0].meta
			fastify.log.trace(authorities[0])

			//strip null properties
			const authority = {authority: Object.fromEntries(Object.entries(authorities[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(authority)

			//merge with patch in req.body 
			const mergedAuthority = jmp.apply(authority, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedAuthority)

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged occurrence
			if (!validate(mergedAuthority)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//Need to re-add occurrence_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedAuthority.authority.taxon_no = parseInt(req.params.id);
			fastify.log.info("mergedAuthority after validation(taxon_no added")
			fastify.log.info(mergedAuthority)

			await updateAuthority(fastify.mariadb, req.body.authority, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, req.body.bypassOccurrences, mergedAuthority.authority)

			return {statusCode: 204, msg: "Authority modified"}
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



