import {createSchema, editSchema, getSchema} from './measurement.schema.js'
import {getMeasurements, getMeasurement, updateMeasurement, createMeasurement} from './measurement.model.js'
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

			const measurements = await getMeasurements(fastify.mariadb, limit, offset, fastify);
			fastify.log.trace(measurements)
			return {
				data: {
					measurements: measurements.measurements,
				},
				navlinks: reply.navLinks(request, limit, offset, measurements.measurements.length, measurements.count, false)
			}
		}
	)

	fastify.get('/:id',  {schema: getSchema}, async (request, reply) => {
		const measurements = await getMeasurement(fastify.mariadb, request.params.id);
		reply.send(measurements);
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
			fastify.log.info("measurement POST")
			fastify.log.trace(req.body)
	
			const newMeasurement = await createMeasurement(fastify.mariadb, req.body.measurement, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate)
		
			return {statusCode: 201, msg: "measurement created", measurement_no: newMeasurement.measurement_no}
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
		  	fastify.log.info("measurement PATCH")

			//fetch existing collection from db
			const measurements = await getMeasurement(fastify.mariadb, req.params.id);

			if (!measurements || measurements.length === 0) {
				const error = new Error(`Unrecognized measurement: ${req.params.id}`);
				error.statusCode = 400
				throw error
			}

			fastify.log.trace(measurements[0])

			//strip null properties
			const measurement = {measurement: Object.fromEntries(Object.entries(measurements[0]).filter(([_, v]) => v != null))};
			fastify.log.trace("after stripping nulls")
			fastify.log.trace(measurement)

			//merge with patch in req.body 
			const mergedMeasurement = jmp.apply(measurement, req.body)
			fastify.log.trace("after merge")
			fastify.log.trace(mergedMeasurement)

			//create a validator using the createSchema
			const validate = req.compileValidationSchema(createSchema.body);

			//validate the merged specimen
			if (!validate(mergedMeasurement)) {
				fastify.log.error("validation error")
				fastify.log.trace(validate.errors);
				return {statusCode: 400, msg: validate.errors}
			}

			//Need to re-add specimen_no after validation because fastify sets removeAdditional to true, which removes properties that aren't in validation schema. But model needs it.
			mergedMeasurement.measurement.measurement_no = parseInt(req.params.id);
			fastify.log.info("mergedMeasurement after validation(measurement_no added")
			fastify.log.info(mergedMeasurement)

			await updateMeasurement(fastify.mariadb, req.body.measurement, {userID: req.userID, userName: req.userName, authorizerID: req.authorizerID}, req.body.allowDuplicate, mergedMeasurement.measurement)

			return {statusCode: 204, msg: "Measurement modified"}
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



