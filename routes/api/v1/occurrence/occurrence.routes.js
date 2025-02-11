import {createSchema, editSchema, getSchema} from './occurrence.schema.js'
import {getOccurrences, getOccurrence, createOccurrence, updateOccurrence} from './occurrence.model.js'
import jmp from 'json-merge-patch'
import {parseTaxon} from '../../../../util.js'

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

			if (request.query.taxonname) {
				const taxon = parseTaxon(request.query.taxonname, true)
				return {
					data: {
						taxon: taxon,
					}
				}
	
			}

			const aCookieValue = request.cookies.session_id
			fastify.log.trace(aCookieValue);
			//throw new Error("Hogan's goat!");

			const limit = request.query.limit ? parseInt(request.query.limit) : 10;
			const offset = request.query.offset ? parseInt(request.query.offset) : 0;
			fastify.log.trace(request.query)

			const occurrences = await getOccurrences(fastify.mariadb, limit, offset, fastify);
			fastify.log.trace(occurrences)
			return {
				data: {
				occurrences: occurrences.occurrences,
				},
				navlinks: reply.navLinks(request, limit, offset, occurrences.occurrences.length, occurrences.count, false)
			}
		}
	)

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const occurrences = await getOccurrence(fastify.mariadb, request.params.id);
		reply.send(occurrences);
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
			fastify.log.info("occurrence POST")
			fastify.log.trace(req.body)
	
			const newOccurrence = await createOccurrence(fastify.mariadb, req.body.occurrence, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, req.body.bypassTaxon)
		
			return {statusCode: 201, msg: "occurrence created", occurrence_no: newOccurrence.occurrence_no}
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
		  	fastify.log.info("occurrence PATCH")

			//fetch existing collection from db
			const occurrences = await getOccurrence(fastify.mariadb, req.params.id);

			if (!occurrences || occurrences.length === 0) {
				const error = new Error(`Unrecognized occurrence: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(occurrences[0])

			//strip null properties
			const occurrence = {occurrence: Object.fromEntries(Object.entries(occurrences[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(occurrence)

			if (req.body.occurrence.taxon_name) {
				const taxon = parseTaxon(req.body.occurrence.taxon_name, true);
		
				if (!taxon.genus ||
					(taxon.subspecies && !taxon.species)
				) {
					const error = new Error(`Invalid taxon name: ${occurrence.taxon_name}`)
					error.statusCode = 400
					throw error
				}
		
				req.body.occurrence.genus_name = taxon.genus;
				req.body.occurrence.subgenus_name = taxon.subgenus;
				req.body.occurrence.species_name = taxon.species;
				req.body.occurrence.subspecies_name = taxon.subspecies;
				req.body.occurrence.genus_reso = taxon.genusReso;
				req.body.occurrence.subgenus_reso = taxon.subgenusReso;
				req.body.occurrence.species_reso = taxon.speciesReso;
				//req.body.occurrence.subspecies_reso = taxon.subspeciesReso;
				delete req.body.occurrence.taxon_name;
			}
		
			//merge with patch in req.body 
			const mergedOccurrence = jmp.apply(occurrence, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedOccurrence) 

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged occurrence
			if (!validate(mergedOccurrence)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			const tmpTaxonNo = mergedOccurrence.occurrence.taxon_no
			const tmpReidNo = mergedOccurrence.occurrence.reid_no

			//Need to re-add occurrence_no, taxon_no, and reid_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs them.
			mergedOccurrence.occurrence.occurrence_no = parseInt(req.params.id);
			mergedOccurrence.occurrence.taxon_no = tmpTaxonNo;
			mergedOccurrence.occurrence.reid_no = tmpReidNo;
			fastify.log.info("mergedOccurrence after validation(occurrence_no added")
			fastify.log.info(mergedOccurrence)

			await updateOccurrence(fastify.mariadb, req.body.occurrence, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, req.body.bypassTaxon, mergedOccurrence.occurrence)

			return {statusCode: 204, msg: "Occurrence modified"}
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



