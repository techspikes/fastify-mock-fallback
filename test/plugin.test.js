import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Fastify from 'fastify'
import { fastifyMockFallback } from '../index.js'
import { buildApp, resolveSpecification } from './helper/helper.js'

describe('Plugin registration', () => {
  it('does not register mock routes by default', async () => {
    const app = Fastify({ logger: false })

    try {
      await app.register(fastifyMockFallback, {
        specification: resolveSpecification('../fixtures/petstore-core-behavior.yaml'),
      })

      await app.ready()

      // Default-disabled registration should leave even mockable operations absent.
      assert.equal(app.hasRoute({ method: 'GET', url: '/pet/:petId' }), false)
      assert.equal(app.hasRoute({ method: 'POST', url: '/pet' }), false)
    } finally {
      await app.close()
    }
  })

  it('registers mock routes from a specification', async () => {
    const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

    try {

      // The plugin should register routes for every mockable operation.
      assert.equal(app.hasRoute({ method: 'GET', url: '/pet/:petId' }), true)
      assert.equal(app.hasRoute({ method: 'POST', url: '/pet' }), true)
    } finally {
      await app.close()
    }
  })

  it('keeps an implementation registered before the plugin instead of replacing it with a mock', async () => {
    const app = await buildApp('../fixtures/petstore-core-behavior.yaml', app => {
      app.route({
        method: 'GET',
        url: '/pet/:petId',
        handler: (_req, reply) => reply.status(200).send({ source: 'real-impl' }),
      })
    })

    try {
      const res = await app.inject({ method: 'GET', url: '/pet/10' })

      // Existing routes should win over generated mock routes.
      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.json(), { source: 'real-impl' })
      assert.equal(res.headers['x-mock-response'], undefined)
    } finally {
      await app.close()
    }
  })

  describe('HEAD route registration', () => {
    it('registers an explicit HEAD operation before GET when it is defined first', async () => {
      const app = await buildApp('../fixtures/petstore-route-generation-head-before-get.yaml')

      try {
        const getResponse = await app.inject({ method: 'GET', url: '/store/inventory' })

        // The GET mock should use its JSON response example.
        assert.equal(getResponse.statusCode, 200)
        assert.equal(getResponse.headers['content-type'], 'application/json; charset=utf-8')

        const headResponse = await app.inject({ method: 'HEAD', url: '/store/inventory' })

        // The explicit HEAD mock should keep its own response media type.
        assert.equal(headResponse.statusCode, 200)
        assert.equal(headResponse.headers['content-type'], 'text/plain')
        assert.equal(headResponse.headers['x-mock-response'], 'true')
      } finally {
        await app.close()
      }
    })

    it('uses the automatic GET HEAD route when GET is defined before explicit HEAD', async () => {
      const app = await buildApp('../fixtures/petstore-route-generation-get-before-head.yaml')

      try {
        const response = await app.inject({ method: 'HEAD', url: '/store/inventory' })

        // GET-first definitions should use Fastify's automatic JSON HEAD route.
        assert.equal(response.statusCode, 200)
        assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
        assert.equal(response.headers['x-mock-response'], 'true')
      } finally {
        await app.close()
      }
    })

    it('keeps Fastify automatic HEAD routes for GET operations without explicit HEAD', async () => {
      const app = await buildApp('../fixtures/petstore-route-generation-get-only.yaml')

      try {
        const response = await app.inject({ method: 'HEAD', url: '/store/inventory' })

        // GET-only definitions should expose Fastify's automatic JSON HEAD route.
        assert.equal(response.statusCode, 200)
        assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
        assert.equal(response.headers['x-mock-response'], 'true')
      } finally {
        await app.close()
      }
    })
  })
})
