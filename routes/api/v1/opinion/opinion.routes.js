import {createSchema, editSchema, getSchema} from './opinion.schema.js'
import {getOpinions, getOpinion, createOpinion, updateOpinion} from './opinion.model.js'
import jmp from 'json-merge-patch'
import { parseTaxon } from '../../../../util.js';

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

			const opinions = await getOpinions(fastify.mariadb, limit, offset, fastify);
			fastify.log.trace(opinions)
			return {
				data: {
					opinions: opinions.opinions,
				},
				navlinks: reply.navLinks(request, limit, offset, opinions.opinions.length, opinions.count, false)
			}
		}
	)

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const opinion = await getOpinion(fastify.mariadb, request.params.id);
		reply.send(opinion);
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
			fastify.log.info("opinion POST")
			fastify.log.trace(req.body)
	
			const newOpinion = await createOpinion(fastify.mariadb, req.body.opinion, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate)
		
			return {statusCode: 201, msg: "opinion created", opinion_no: newOpinion.opinion_no}
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
		  	fastify.log.info("opinion PATCH")

			//fetch existing collection from db
			const opinions = await getOpinion(fastify.mariadb, req.params.id);

			if (!opinions || opinions.length === 0) {
				const error = new Error(`Unrecognized opinion: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(opinions[0])

			//strip null properties
			const opinion = {opinion: Object.fromEntries(Object.entries(opinions[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(opinion)

			//merge with patch in req.body 
			const mergedOpinion = jmp.apply(opinion, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedOpinion)

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged reidentification
			if (!validate(mergedOpinion)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			const tmpNo = mergedOpinion.opinion.taxon_no

			//Need to re-add reid_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedOpinion.opinion.reid_no = parseInt(req.params.id);
			mergedOpinion.opinion.taxon_no = tmpNo;
			fastify.log.info("mergedOpinion after validation(opinion_no added")
			fastify.log.info(mergedOpinion)

			await updateOpinion(fastify.mariadb, req.body.opinion, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, mergedOpinion.opinion)

			return {statusCode: 204, msg: "Opinion modified"}
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



