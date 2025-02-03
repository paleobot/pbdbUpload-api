import path from 'path'
import AutoLoad from '@fastify/autoload'
import url, { fileURLToPath } from 'url'
import mariadb from 'fastify-mariadb'
import swagger from '@fastify/swagger'
import swaggerUI from "@fastify/swagger-ui";
import cookie from '@fastify/cookie'
import auth from '@fastify/auth'
import fs from 'fs'
import Ajv2019 from "ajv/dist/2019.js"
import addFormats from 'ajv-formats'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export let logger = null;

// Pass --options via CLI arguments in command to enable these options.
export const options = {}

export const SchemaCompiler = ({ schema }) => {
	const ajv = new Ajv2019()
	addFormats(ajv)
	const validate = ajv.compile(schema)
	//const validate = new Ajv2019().compile(schema)
	return (value) => !validate(value) 
	  ? ({ value, error: validate.errors })
	  : ({ value })
}

export default async function (fastify, opts) {
	// Place here your custom code!  

	logger = fastify.log;

	fastify.setValidatorCompiler(SchemaCompiler);

	//TODO: This is a hack to get around the fact that fastify-cli does not currently allow setting trustProxy. Without this setting, it is impossible to get the original host when building urls. 
	fastify.decorateRequest("hostHack", function () {
		return this.host.includes("host.docker.internal") ? "localhost" : this.host
		//return this.host.includes("host.docker.internal") ? "testpaleobiodb.colo-prod-aws.arizona.edu" : this.host
	})

	fastify.register(cookie, {
		hook: 'onRequest', 
		parseOptions: {}  
	})
	
	fastify.setErrorHandler((error, request, reply) => {
		fastify.log.error("error handler")
		fastify.log.error(error);
	
		let path = request.path || request.url;
		const errorLinks = [];
	
		//Get rid of path parameters
		Object.keys(request.params).forEach(key => {
			path = path.replace("/" + request.params[key], "");
		});
		path = `${path.substring(0, path.lastIndexOf('/'))}/help`

		errorLinks.push({
		href: url.format({
					protocol: request.protocol,
					host: request.hostHack(),
					pathname: path,
		}),
		rel: "help"
		});

		if (!error.statusCode) error.statusCode = 500;
		error.links = errorLinks;
		reply.code(error.statusCode).send({
			statusCode: error.statusCode,
			//Some razzle here to display unevaluatedProperty or allowedValues or additionalProperty if available
			msg: `${error.message}${
				error.validation && error.validation[0].params && error.validation[0].params.unevaluatedProperty ?
					`: ${error.validation[0].params.unevaluatedProperty}` :
					''
			}${
				error.validation && error.validation[0].params && error.validation[0].params.allowedValues ?
					`: ${error.validation[0].params.allowedValues}` :
					''
			}${
				error.validation && error.validation[0].params && error.validation[0].params.additionalProperty ?
					`: ${error.validation[0].params.additionalProperty}` :
					''
			}`,
			links: errorLinks
		})	
	})
	
	fastify.decorateReply('navLinks', (req, limit, offset, localCount, totalCount, single) => {
		const getHostURL = function() {
			return url.format({
				protocol: req.protocol,
				host: req.hostHack(),
			})
		}
		const navLinks = [
		];
		const myURL = url.parse(getHostURL() + req.originalUrl, true);
		myURL.search = null;
		navLinks.push({
			href: url.format(myURL),
			rel: "self"
		});
	
		if (!single) {
			const myURL = url.parse(getHostURL() + req.originalUrl, true);
			delete myURL.query.offset;
			myURL.search = null;
			navLinks.push({
				href: url.format(myURL),
				rel: "first"
			});
	
			if (offset != 0 && offset-limit >= 0) {
				const myURL = url.parse(getHostURL() + req.originalUrl, true);
				myURL.query.offset = offset - limit;
				myURL.search = null;
				navLinks.push({
					href: url.format(myURL),
					rel: "previous"
				});
			}
	
			if (offset + localCount < totalCount) {
				const myURL = url.parse(getHostURL() + req.originalUrl, true);
				myURL.query.offset = offset + limit;
				delete myURL.search;
				navLinks.push({
					href: url.format(myURL),
					rel: "next"
				});
			}
	
			const mod = totalCount % limit
			const lastURL = url.parse(getHostURL() + req.originalUrl, true);
			lastURL.query.offset =
				mod === 0 ?
					totalCount - limit :
					totalCount - mod;
			if (lastURL.query.offset <= 0) delete lastURL.query.offset;
			lastURL.search = null;
			navLinks.push({
				href: url.format(lastURL),
				rel: "last"
			});
		}
		return navLinks;
	})
	
	
	await fastify.register(swagger, {
		/*
		openapi: {
		  openapi: '3.0.0',
		  info: {
			title: 'PBDB Upload API',
			description: 'API for uploading content to the Paleobiology Database',
			version: '0.1.0'
		  }
		}
		*/
		swagger: {
			info: {
				title: 'PBDB Upload API',
				description: 'API for uploading content to the Paleobiology Database',
				version: '0.1.0'
			}
		}
			
	})
	
	/*
	Moving this to the v1.routes to avoid issue mentioned below. 
	I dunno, maybe that's a better place for it anyway.
	const image = fs.readFileSync('images/logo_grey.png', {encoding: 'base64'});
	fastify.register(swaggerUI, {
		//routePrefix is problematic.
		//See https://github.com/fastify/fastify-swagger-ui/issues/180
		//and many others.
		routePrefix: "/api/v1/help",
		logo: {
			type: 'image/png',
			content: Buffer.from(image, 'base64'),
			//href: '/help',
			target: '_blank'
		},
		theme: {
			title: "PBDB upload API documentation",
			favicon: [{
				filename: 'logo_grey.png',
				rel: 'icon',
				sizes: '16x16',
				type: 'image/png',
				content: Buffer.from(image, 'base64')
			}]
		}
		
	});
	*/

	fastify.register(mariadb, {
		promise: true,
		//TODO:  get host from .env and make it dependent on run variable.
		//Note: This works if host.docker.internal is added to docker run in vscode settings
		host: 'localhost',
		//host: 'host.docker.internal',
		user: 'pbdbuser',
		password: 'pbdbpwd',
		database: 'pbdb',
		connectionLimit: 5,
	})
	
	// Decorate request with a 'user' property
	fastify.decorateRequest('userID', '')
	fastify.decorateRequest('userName', '')
	fastify.decorateRequest('authorizerID', '')

	//TODO: This was a quick and dirty test. Could use some streamlining.
	fastify.decorate('verifyAuth', async (request, reply) => {
		fastify.log.trace("verifyAuth")
		const sessionID = request.cookies.session_id
		fastify.log.trace(sessionID);
		if (sessionID) {
			let conn;
			try {
				conn = await fastify.mariadb.getConnection();
				const sql = 'SELECT user_id from session_data where session_id = ?';
				const rows = await conn.query(sql, [sessionID]);
				//fastify.log.trace(rows);
				if (rows.length > 0 && rows[0].user_id) {
					let conn2;
					try {
						conn2 = await fastify.mariadb.getConnection();
						const sql = 'SELECT admin, role, person_no, real_name, authorizer_no from pbdb_wing.users where id = ?';
						const rows2 = await conn.query(sql, rows[0].user_id);
						//fastify.log.trace(rows2);
						if (rows2.length > 0 && rows2[0].role) {
							fastify.log.trace(rows2[0].person_no)
							request.userID = rows2[0].person_no;
							request.userName = rows2[0].real_name;
							request.authorizerID = rows2[0].authorizer_no;
							if (
								'enterer' === rows2[0].role || 
								'authorizer' === rows2[0].role ||
								('student' === rows2[0].role &&
									['POST', 'PUT'].includes(request.method) &&
									['references', 'collections', 'occurrences', 'specimens'].includes(request.url.match(/\/api\/v.\/([a-z]*)/)[1])  
								)
							) {
								return
							} else {
								const err = new Error('not authorized');
								err.statusCode = 403;
								throw err
							}
						} else {
							const err = new Error('could not access users');
							err.statusCode = 500;
							throw err
						}
					} finally {
						if (conn2) conn2.release(); 
					}
				} else {
					const err = new Error('session not found');
					err.statusCode = 400;
					throw err
				}
			} finally {
				if (conn) conn.release(); 
			}
		} else {
			fastify.log.trace("not authenticated")
			const err = new Error('not authenticated');
			err.statusCode = 401;
			throw err
		}
	})
	.register(auth)



	// Careful with the following lines

	// This loads all plugins defined in plugins
	// those should be support plugins that are reused
	// through your application
	fastify.register(AutoLoad, {
		dir: path.join(__dirname, 'plugins'),
    	options: Object.assign({}, opts)
  	})

	// This loads all plugins defined in routes
  	// define your routes in one of these
  	fastify.register(AutoLoad, {
    	dir: path.join(__dirname, 'routes'),
    	options: Object.assign({}, opts),
		ignorePattern: /^.*(model|schema)\.js$/
  	})
	
}
