export default async function (fastify, opts) {
    fastify.get('/', async function (request, reply) {
      return { msg: "person routes not yet implemented" }
    })
  }