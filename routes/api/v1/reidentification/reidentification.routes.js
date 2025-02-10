import {createSchema, editSchema, getSchema} from './reidentification.schema.js'
import {getReidentifications, getReidentification, createReidentification, updateReidentification} from './reidentification.model.js'
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

			const occurrences = await getReidentifications(fastify.mariadb, limit, offset, fastify);
			fastify.log.trace(reidentifications)
			return {
				data: {
					reidentifications: reidentifications.reidentifications,
				},
				navlinks: reply.navLinks(request, limit, offset, reidentifications.reidentifications.length, reidentifications.count, false)
			}
		}
	)

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const reidentifications = await getReidentification(fastify.mariadb, request.params.id);
		reply.send(reidentifications);
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
			fastify.log.info("reidentification POST")
			fastify.log.trace(req.body)
	
			const newReidentification = await createReidentification(fastify.mariadb, req.body.reidentification, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate)
		
			return {statusCode: 201, msg: "reidentification created", reid_no: newReidentification.reid_no}
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
		  	fastify.log.info("reidentification PATCH")

			//fetch existing collection from db
			const reidentifications = await getReidentification(fastify.mariadb, req.params.id);

			if (!reidentifications || reidentifications.length === 0) {
				const error = new Error(`Unrecognized reidentification: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(reidentifications[0])

			//strip null properties
			const reidentification = {reidentification: Object.fromEntries(Object.entries(reidentifications[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(reidentification)

			if (req.body.reidentification.taxon_name) {
				const taxon = parseTaxon(req.body.reidentification.taxon_name, true);
		
				if (!taxon.genus ||
					(taxon.subspecies && !taxon.species)
				) {
					const error = new Error(`Invalid taxon name: ${occurrence.taxon_name}`)
					error.statusCode = 400
					throw error
				}
		
				req.body.reidentification.genus_name = taxon.genus;
				req.body.reidentification.subgenus_name = taxon.subgenus;
				req.body.reidentification.species_name = taxon.species;
				req.body.reidentification.subspecies_name = taxon.subspecies;
				req.body.reidentification.genus_reso = taxon.genusReso;
				req.body.reidentification.subgenus_reso = taxon.subgenusReso;
				req.body.reidentification.species_reso = taxon.speciesReso;
				//req.body.reidentification.subspecies_reso = taxon.subspeciesReso;
				delete req.body.reidentification.taxon_name;
			}

			//merge with patch in req.body 
			const mergedReidentification = jmp.apply(reidentification, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedReidentification)

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged reidentification
			if (!validate(mergedReidentification)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			const tmpNo = mergedReidentification.reidentification.taxon_no

			//Need to re-add reid_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedReidentification.reidentification.reid_no = parseInt(req.params.id);
			mergedReidentification.reidentification.taxon_no = tmpNo;
			fastify.log.info("mergedReidentification after validation(reid_no added")
			fastify.log.info(mergedReidentification)

			await updateReidentification(fastify.mariadb, req.body.reidentification, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, mergedReidentification.reidentification)

			return {statusCode: 204, msg: "Reidentification modified"}
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



