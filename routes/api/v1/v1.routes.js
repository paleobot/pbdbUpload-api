import url from 'url'
import {logger} from '../../../app.js'
import swaggerUI from "@fastify/swagger-ui";
import fs from 'fs'

export default async function (fastify, opts) {

	const image = fs.readFileSync('images/logo_grey.png', {encoding: 'base64'});
	fastify.register(swaggerUI, {
		//routePrefix is problematic.
		//See https://github.com/fastify/fastify-swagger-ui/issues/180
		//and many others.
		routePrefix: "help",
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
		},
		uiConfig: {
			validatorUrl: null
		}
	});

  fastify.get('/', {schema: {hide: true}}, async function (request, reply) {    
    return { 
        help: url.format({
        protocol: request.protocol,
        host: request.hostHack(),
        pathname: request.url.replace(/\/$/, '') + "/help",
    })}
  })
}
