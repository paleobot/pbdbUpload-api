import path from 'path'
import AutoLoad from '@fastify/autoload'
import url, { fileURLToPath } from 'url'
import mariadb from 'fastify-mariadb'
//import swagger from '@fastify/swagger'
import cookie from '@fastify/cookie'
import auth from '@fastify/auth'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Pass --options via CLI arguments in command to enable these options.
export const options = {}

export default async function (fastify, opts) {
	// Place here your custom code!  

	fastify.register(cookie, {
		hook: 'onRequest', 
		parseOptions: {}  
	})
	
	fastify.setErrorHandler((error, request, reply) => {
		fastify.log.error("error handler")
		fastify.log.error(error);
	
		let path = request.path;
		const errorLinks = [];
	
		//Get rid of path parameters
		Object.keys(request.params).forEach(key => {
			path = path.replace("/" + request.params[key], "");
		});
	
		errorLinks.push({
		href: url.format({
					protocol: request.protocol,
					host: request.hostname,
					pathname: request.baseUrl + path,
					query: {"help": "json"}
		}),
		rel: "help"
		});

		if (!error.statusCode) error.statusCode = 500;
		error.links = errorLinks;
		reply.code(error.statusCode).send({
			statusCode: error.statusCode,
			msg: error.message,
			links: errorLinks
		})	
	})
	
	fastify.decorateReply('navLinks', (req, limit, offset, localCount, totalCount, single) => {
		const getHostURL = function() {
			return req.protocol + "://" + req.hostname; //TODO: This might choke with query params
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
	
	/*
	await fastify.register(swagger, {
		openapi: {
		  openapi: '3.0.0',
		  info: {
			title: 'Test swagger',
			description: 'Testing the Fastify swagger API',
			version: '0.1.0'
		  }
		}
	})
	*/
	
	fastify.register(mariadb, {
		promise: true,
		host: 'localhost',
		user: 'pbdbuser',
		password: 'pbdbpwd',
		database: 'pbdb',
		connectionLimit: 5
	})
	
	// Decorate request with a 'user' property
	fastify.decorateRequest('userID', '')

	//TODO: This was a quick and dirty test. Could use some streamlining.
	fastify.decorate('verifyAuth', async (request, reply) => {
	// your validatifastify
	const sessionID = request.cookies.session_id
	fastify.log.trace(sessionID);
	if (sessionID) {
		let conn;
		try {
			conn = await fastify.mariadb.getConnection();
			const sql = `SELECT user_id from session_data where session_id='${sessionID}'`;
			const rows = await conn.query(sql);
			//fastify.log.trace(rows);
			if (rows.length > 0 && rows[0].user_id) {
				let conn2;
				try {
					conn2 = await fastify.mariadb.getConnection();
					const sql = `SELECT admin, role, person_no from pbdb_wing.users where id='${rows[0].user_id}'`;
					const rows2 = await conn.query(sql);
					//fastify.log.trace(rows2);
					if (rows2.length > 0 && rows2[0].role) {
						fastify.log.trace(rows2[0].person_no)
						request.userID = rows2[0].person_no;
						if ('enterer' === rows2[0].role) {
							return
						} else {
							const err = new Error('hotdog, but not the right kind');
							err.code = 403;
							return err
						}
					} else {
						return new Error('could not access users')
					}
				} finally {
					if (conn2) conn2.release(); //release to pool
				}
			} else {
				return new Error('session not found')
			}
		} finally {
			if (conn) conn.release(); //release to pool
		}
	} else {
		const err = new Error('not hotdog');
		err.code = 401;
		return err
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
