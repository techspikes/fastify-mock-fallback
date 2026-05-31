import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Fastify from 'fastify'

import { fastifyMockFallback } from '../index.js'
import { buildApp, fixturePath } from './helper/helper.js'

describe('Plugin registration', () => {
  it('registers mock routes from a specification', async () => {
    const app = await buildApp(fixturePath('petstore-core-behavior'))

    try {
      // The plugin should register routes for every mockable operation.
      assert.equal(app.hasRoute({ method: 'GET', url: '/pet/:petId' }), true)
      assert.equal(app.hasRoute({ method: 'POST', url: '/pet' }), true)
    } finally {
      await app.close()
    }
  })

  it('keeps an existing implementation instead of replacing it with a mock', async () => {
    const app = await buildApp(fixturePath('petstore-core-behavior'), {
      'GET /pet/:petId': (_req, reply) =>
        reply.status(200).send({ source: 'real-impl' }),
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

  it('does not register mock routes by default', async () => {
    const app = Fastify({ logger: false })

    try {
      await app.register(fastifyMockFallback, {
        specification: fixturePath('petstore-core-behavior'),
      })
      await app.ready()

      // Default-disabled registration should leave even mockable operations absent.
      assert.equal(app.hasRoute({ method: 'GET', url: '/pet/:petId' }), false)
      assert.equal(app.hasRoute({ method: 'POST', url: '/pet' }), false)
    } finally {
      await app.close()
    }
  })
})
