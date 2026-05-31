import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildApp, buildLoggedApp } from './helper/helper.js'

describe('Petstore mock responses', () => {
  describe('matched requests', () => {
    describe('response examples', () => {
      it('matches same-name response and path parameter examples', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/1' })

          assert.equal(response.statusCode, 200)
          assert.equal(response.headers['x-mock-response'], 'true')
          assert.deepEqual(response.json(), {
            id: 1,
            name: 'rocky',
            category: { id: 1, name: 'Dogs' },
            photoUrls: ['https://example.com/rocky.png'],
            tags: [{ id: 1, name: 'friendly' }],
            status: 'available',
          })
        } finally {
          await app.close()
        }
      })

      it('matches same-name response and path-level parameter examples', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/store/order/5' })

          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), {
            id: 5,
            petId: 10,
            quantity: 1,
            status: 'approved',
            complete: true,
          })
        } finally {
          await app.close()
        }
      })

      it('uses operation-level parameter examples over path-level parameter examples', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'DELETE', url: '/store/order/6' })
          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), { deleted: 6 })

          const unmatchedResponse = await app.inject({ method: 'DELETE', url: '/store/order/5' })
          assert.equal(unmatchedResponse.statusCode, 501)
          assert.equal(unmatchedResponse.headers['x-mock-response'], 'true')
        } finally {
          await app.close()
        }
      })

      it('matches x-request-match and path parameter examples', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/2' })

          assert.equal(response.statusCode, 200)
          assert.equal(response.headers['x-mock-response'], 'true')
          assert.deepEqual(response.json(), {
            id: 2,
            name: 'daisy',
            category: { id: 1, name: 'Dogs' },
            photoUrls: ['https://example.com/daisy.png'],
            tags: [{ id: 1, name: 'explicit' }],
            status: 'pending',
          })
        } finally {
          await app.close()
        }
      })

      it('returns a 404 response for a matched response example', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/3' })

          assert.equal(response.statusCode, 404)
          assert.deepEqual(response.json(), { code: 404, type: 'error', message: 'Pet not found' })
        } finally {
          await app.close()
        }
      })

      it('returns a response body for a matched 400 response example', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/rocky' })

          assert.equal(response.statusCode, 400)
          assert.deepEqual(response.json(), { code: 400, type: 'error', message: 'Invalid ID supplied' })
        } finally {
          await app.close()
        }
      })
    })

    describe('parameterless operations', () => {
      it('uses 200 response example for operations without request examples', async () => {
        const app = await buildApp('../fixtures/petstore-parameterless-operations.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pets' })

          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), [{ id: 1, name: 'rocky' }])
        } finally {
          await app.close()
        }
      })

      it('uses accepted response media for operations without request examples', async () => {
        const app = await buildApp('../fixtures/petstore-parameterless-operations.yaml')

        try {
          const acceptedResponse = await app.inject({
            method: 'GET',
            url: '/pets/featured',
            headers: { accept: 'text/plain' },
          })

          assert.equal(acceptedResponse.statusCode, 200)
          assert.equal(acceptedResponse.body, 'plain featured pet')

          const defaultResponse = await app.inject({ method: 'GET', url: '/pets/featured' })

          assert.equal(defaultResponse.statusCode, 200)
          assert.equal(defaultResponse.body, 'plain featured pet')
        } finally {
          await app.close()
        }
      })

      it('returns 501 for operations without request examples when no usable 200 example exists', async () => {
        const app = await buildApp('../fixtures/petstore-parameterless-operations.yaml')

        try {
          const noExampleResponse = await app.inject({ method: 'DELETE', url: '/pets/cache' })

          assert.equal(noExampleResponse.statusCode, 501)
          assert.equal(noExampleResponse.headers['x-mock-response'], 'true')
          assert.deepEqual(noExampleResponse.json(), {
            error: 'Not Implemented',
            message: 'No matching example found for operation "clearPetsCache"',
          })

          const non200Response = await app.inject({ method: 'GET', url: '/pets/redirect-info' })

          assert.equal(non200Response.statusCode, 501)
          assert.equal(non200Response.headers['x-mock-response'], 'true')
          assert.deepEqual(non200Response.json(), {
            error: 'Not Implemented',
            message: 'No matching example found for operation "getPetsRedirectInfo"',
          })

          const emptyExamplesResponse = await app.inject({ method: 'GET', url: '/pets/empty-examples' })

          assert.equal(emptyExamplesResponse.statusCode, 501)
          assert.equal(emptyExamplesResponse.headers['x-mock-response'], 'true')
          assert.deepEqual(emptyExamplesResponse.json(), {
            error: 'Not Implemented',
            message: 'No matching example found for operation "getPetsEmptyExamples"',
          })
        } finally {
          await app.close()
        }
      })

      it('uses a 200 response example for operations without request examples', async () => {
        const app = await buildApp('../fixtures/petstore-parameterless-operations.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pets/summary' })

          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), { count: 1 })
        } finally {
          await app.close()
        }
      })

      it('returns 501 when a parameterized operation has no matching request example', async () => {
        const app = await buildApp('../fixtures/petstore-parameterless-operations.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/findByStatus?status=archived' })

          assert.equal(response.statusCode, 501)
          assert.equal(response.headers['x-mock-response'], 'true')
          assert.deepEqual(response.json(), {
            error: 'Not Implemented',
            message: 'No matching example found for operation "findPetsByStatus"',
          })
        } finally {
          await app.close()
        }
      })
    })

    describe('response media', () => {
      it('prioritizes explicit x-request-match over same-name response examples', async () => {
        const app = await buildApp('../fixtures/petstore-response-content-negotiation.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/1' })
          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), { matched: 'example-level' })
        } finally {
          await app.close()
        }
      })

      it('selects accepted x-request-match response media', async () => {
        const app = await buildApp('../fixtures/petstore-response-content-negotiation.yaml')

        try {
          const jsonResponse = await app.inject({
            method: 'GET',
            url: '/pet/1',
            headers: { accept: 'application/json' },
          })
          assert.equal(jsonResponse.statusCode, 200)
          assert.deepEqual(jsonResponse.json(), { matched: 'example-level' })

          const textResponse = await app.inject({
            method: 'GET',
            url: '/pet/1',
            headers: { accept: 'text/plain' },
          })
          assert.equal(textResponse.statusCode, 200)
          assert.equal(textResponse.body, 'text example-level')

          const anyResponse = await app.inject({
            method: 'GET',
            url: '/pet/1',
            headers: { accept: '*/*' },
          })
          assert.equal(anyResponse.statusCode, 200)
          assert.deepEqual(anyResponse.json(), { matched: 'example-level' })

          const applicationResponse = await app.inject({
            method: 'GET',
            url: '/pet/1',
            headers: { accept: 'application/*' },
          })
          assert.equal(applicationResponse.statusCode, 200)
          assert.deepEqual(applicationResponse.json(), { matched: 'example-level' })

          const qValueResponse = await app.inject({
            method: 'GET',
            url: '/pet/1',
            headers: { accept: 'application/json;q=0.5, text/plain;q=1.0' },
          })
          assert.equal(qValueResponse.statusCode, 200)
          assert.equal(qValueResponse.body, 'text example-level')
        } finally {
          await app.close()
        }
      })

      it('returns 406 when x-request-match response media is unacceptable', async () => {
        const app = await buildApp('../fixtures/petstore-response-content-negotiation.yaml')

        try {
          const unacceptableResponse = await app.inject({
            method: 'GET',
            url: '/pet/1',
            headers: { accept: 'image/png' },
          })
          assert.equal(unacceptableResponse.statusCode, 406)
          assert.equal(unacceptableResponse.headers['x-mock-response'], 'true')
          assert.deepEqual(unacceptableResponse.json(), {
            error: 'Not Acceptable',
            message: 'No acceptable response media type found for operation "getPetByPriority"',
          })
        } finally {
          await app.close()
        }
      })

      it('selects same-name response media using Accept negotiation', async () => {
        const app = await buildApp('../fixtures/petstore-response-content-negotiation.yaml')

        try {
          const jsonResponse = await app.inject({
            method: 'GET',
            url: '/pet/1/media-priority',
            headers: { accept: 'application/json' },
          })
          assert.equal(jsonResponse.statusCode, 200)
          assert.deepEqual(jsonResponse.json(), { matched: 'same-name' })

          const textResponse = await app.inject({
            method: 'GET',
            url: '/pet/1/media-priority',
            headers: { accept: 'text/plain' },
          })
          assert.equal(textResponse.statusCode, 200)
          assert.equal(textResponse.body, 'text same-name')
        } finally {
          await app.close()
        }
      })

      it('matches a JSON request body example with a non-JSON Accept header', async () => {
        const app = await buildApp('../fixtures/petstore-response-content-negotiation.yaml')

        try {
          const response = await app.inject({
            method: 'POST',
            url: '/pet/status-note',
            headers: {
              accept: 'text/plain',
              'content-type': 'application/json',
            },
            payload: { note: 'ready for pickup' },
          })

          assert.equal(response.statusCode, 200)
          assert.equal(response.body, 'status note accepted')
        } finally {
          await app.close()
        }
      })
    })

    describe('request body examples', () => {
      it('matches request body example', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({
            method: 'POST',
            url: '/pet',
            payload: {
              id: 10,
              name: 'doggie',
              category: { id: 1, name: 'Dogs' },
              photoUrls: ['https://example.com/doggie.png'],
              tags: [{ id: 1, name: 'friendly' }],
              status: 'available',
            },
          })

          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), {
            id: 10,
            name: 'doggie',
            category: { id: 1, name: 'Dogs' },
            photoUrls: ['https://example.com/doggie.png'],
            tags: [{ id: 1, name: 'friendly' }],
            status: 'available',
          })

          const reorderedResponse = await app.inject({
            method: 'POST',
            url: '/pet',
            payload: {
              status: 'available',
              tags: [{ name: 'friendly', id: 1 }],
              photoUrls: ['https://example.com/doggie.png'],
              category: { name: 'Dogs', id: 1 },
              name: 'doggie',
              id: 10,
            },
          })

          assert.equal(reorderedResponse.statusCode, 200)
          assert.deepEqual(reorderedResponse.json(), {
            id: 10,
            name: 'doggie',
            category: { id: 1, name: 'Dogs' },
            photoUrls: ['https://example.com/doggie.png'],
            tags: [{ id: 1, name: 'friendly' }],
            status: 'available',
          })
        } finally {
          await app.close()
        }
      })
    })

    describe('request body content types', () => {
      it('selects same-name request body media examples using Content-Type', async () => {
        const app = await buildApp('../fixtures/petstore-request-body-content-types.yaml')

        try {
          const jsonResponse = await app.inject({
            method: 'POST',
            url: '/pet/status-note',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            payload: { note: 'ready for pickup' },
          })
          assert.equal(jsonResponse.statusCode, 200)
          assert.deepEqual(jsonResponse.json(), { note: 'json accepted' })

          const textResponse = await app.inject({
            method: 'POST',
            url: '/pet/status-note',
            headers: {
              accept: 'text/plain',
              'content-type': 'text/plain',
            },
            payload: 'ready for pickup',
          })
          assert.equal(textResponse.statusCode, 200)
          assert.equal(textResponse.body, 'text accepted')
        } finally {
          await app.close()
        }
      })

      it('does not select same-name request body media examples when Content-Type is omitted', async () => {
        const app = await buildApp('../fixtures/petstore-request-body-content-types.yaml')

        try {
          const response = await app.inject({
            method: 'POST',
            url: '/pet/status-note',
          })

          assert.equal(response.statusCode, 501)
          assert.deepEqual(response.json(), {
            error: 'Not Implemented',
            message: 'No matching example found for operation "updatePetStatusNote"',
          })
        } finally {
          await app.close()
        }
      })
    })

    describe('request sources', () => {
      it('requires every parameter condition with the same request example name', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'POST', url: '/pet/10?name=doggie&status=sold' })

          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), {
            id: 10,
            name: 'doggie',
            category: { id: 1, name: 'Dogs' },
            photoUrls: ['https://example.com/doggie.png'],
            tags: [{ id: 1, name: 'friendly' }],
            status: 'sold',
          })
        } finally {
          await app.close()
        }
      })

      it('matches path, query, and header request sources together', async () => {
        const app = await buildApp('../fixtures/petstore-request-sources.yaml', { cookie: true })

        try {
          const paramsQueryHeaderResponse = await app.inject({
            method: 'GET',
            url: '/pet/10/status-report?status=available',
            headers: { api_key: 'special-key' },
          })
          assert.equal(paramsQueryHeaderResponse.statusCode, 200)
          assert.deepEqual(paramsQueryHeaderResponse.json(), { matched: 'params-query-header' })
        } finally {
          await app.close()
        }
      })

      it('matches path, cookie, and body request sources together', async () => {
        const app = await buildApp('../fixtures/petstore-request-sources.yaml', { cookie: true })

        try {
          const paramsCookieBodyResponse = await app.inject({
            method: 'POST',
            url: '/user/user1/session',
            cookies: { session: 'petstore-session' },
            payload: { active: true },
          })
          assert.equal(paramsCookieBodyResponse.statusCode, 200)
          assert.deepEqual(paramsCookieBodyResponse.json(), { matched: 'params-cookie-body' })
        } finally {
          await app.close()
        }
      })

      it('matches query, header, cookie, and body request sources together', async () => {
        const app = await buildApp('../fixtures/petstore-request-sources.yaml', { cookie: true })

        try {
          const queryHeaderCookieBodyResponse = await app.inject({
            method: 'POST',
            url: '/store/order/review?priority=high',
            headers: { api_key: 'special-key' },
            cookies: { session: 'petstore-session' },
            payload: { orderId: 5, approved: true },
          })
          assert.equal(queryHeaderCookieBodyResponse.statusCode, 200)
          assert.deepEqual(queryHeaderCookieBodyResponse.json(), { matched: 'query-header-cookie-body' })
        } finally {
          await app.close()
        }
      })

      it('matches a standalone cookie parameter example with @fastify/cookie', async () => {
        const app = await buildApp('../fixtures/petstore-request-sources.yaml', { cookie: true })

        try {
          const response = await app.inject({
            method: 'GET',
            url: '/user/logout',
            cookies: { session: 'petstore-session' },
          })

          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), { message: 'User logged out' })
        } finally {
          await app.close()
        }
      })

      it('returns 501 when standalone cookie examples cannot be read without @fastify/cookie', async () => {
        const app = await buildApp('../fixtures/petstore-request-sources.yaml')

        try {
          const response = await app.inject({
            method: 'GET',
            url: '/user/logout',
            headers: { cookie: 'session=petstore-session' },
          })

          assert.equal(response.statusCode, 501)
          assert.equal(response.headers['x-mock-response'], 'true')
        } finally {
          await app.close()
        }
      })

      it('ignores parameters that do not define examples', async () => {
        const app = await buildApp('../fixtures/petstore-partial-examples.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/user/login?username=user1' })

          assert.equal(response.statusCode, 200)
          assert.equal(response.body, 'logged-in-token')
        } finally {
          await app.close()
        }
      })
    })
  })

  describe('spec processing', () => {
    describe('parsing', () => {
      it('loads the core Petstore examples from a JSON specification', async () => {
        const app = await buildApp({
          path: '../fixtures/petstore-core-behavior',
          format: 'json',
        })

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/1' })

          assert.equal(response.statusCode, 200)
          assert.deepEqual(response.json(), {
            id: 1,
            name: 'rocky',
            category: { id: 1, name: 'Dogs' },
            photoUrls: ['https://example.com/rocky.png'],
            tags: [{ id: 1, name: 'friendly' }],
            status: 'available',
          })
        } finally {
          await app.close()
        }
      })

      it('resolves YAML anchors, aliases, local $ref, and relative file $ref entries before registering mocks', async () => {
        const app = await buildApp('../fixtures/petstore-parsing-dereferenced-examples.yaml')

        try {
          const matchedResponse = await app.inject({ method: 'GET', url: '/pet/42' })
          assert.equal(matchedResponse.statusCode, 200)
          assert.deepEqual(matchedResponse.json(), {
            id: 42,
            name: 'anchored',
            status: 'available',
          })

          const notFoundResponse = await app.inject({ method: 'GET', url: '/pet/404' })
          assert.equal(notFoundResponse.statusCode, 404)
          assert.deepEqual(notFoundResponse.json(), { code: 404, message: 'not found' })
        } finally {
          await app.close()
        }
      })

      it('handles a specification without paths', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-parsing-no-paths.yaml'),
          /is not a valid Openapi API definition/
        )
      })

      it('handles a specification with empty paths', async () => {
        const app = await buildApp('../fixtures/petstore-parsing-empty-paths.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/10' })

          assert.equal(response.statusCode, 404)
        } finally {
          await app.close()
        }
      })
    })

    describe('route generation', () => {
      it('marks generated mock responses with x-mock-response', async () => {
        const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/pet/1' })

          assert.equal(response.headers['x-mock-response'], 'true')
        } finally {
          await app.close()
        }
      })

      it('registers operations without operationId', async () => {
        const app = await buildApp('../fixtures/petstore-route-generation-without-operation-id.yaml')

        try {
          const matchedResponse = await app.inject({ method: 'GET', url: '/pet/10' })
          assert.equal(matchedResponse.statusCode, 200)
          assert.deepEqual(matchedResponse.json(), { id: 10, name: 'doggie' })

          const unmatchedResponse = await app.inject({ method: 'GET', url: '/pet/999' })
          assert.equal(unmatchedResponse.statusCode, 501)
          assert.deepEqual(unmatchedResponse.json(), {
            error: 'Not Implemented',
            message: 'No matching example found for operation "GET /pet/{petId}"',
          })
        } finally {
          await app.close()
        }
      })

      it('registers parameterless operations without 200 examples as 501 routes next to mockable operations', async () => {
        const app = await buildApp('../fixtures/petstore-route-generation-mixed-operations.yaml')

        try {
          // The mockable operation works, while the plain parameterless operation returns 501.
          const orderResponse = await app.inject({ method: 'GET', url: '/store/order/5' })
          assert.equal(orderResponse.statusCode, 200)
          assert.deepEqual(orderResponse.json(), {
            id: 5,
            petId: 10,
            quantity: 1,
            status: 'approved',
            complete: true,
          })

          const deleteOrderResponse = await app.inject({ method: 'DELETE', url: '/store/order/5' })
          assert.equal(deleteOrderResponse.statusCode, 501)
          assert.equal(deleteOrderResponse.headers['x-mock-response'], 'true')
        } finally {
          await app.close()
        }
      })

      it('registers 501 fallback routes without blocking operations that have usable examples', async () => {
        const app = await buildApp('../fixtures/petstore-route-generation-fallback-routes.yaml')

        try {
          const inventoryResponse = await app.inject({ method: 'GET', url: '/store/inventory' })
          assert.equal(inventoryResponse.statusCode, 501)
          assert.equal(inventoryResponse.headers['x-mock-response'], 'true')

          const createUserResponse = await app.inject({ method: 'POST', url: '/user', payload: {} })
          assert.equal(createUserResponse.statusCode, 501)
          assert.equal(createUserResponse.headers['x-mock-response'], 'true')

          const getUserResponse = await app.inject({ method: 'GET', url: '/user/user1' })
          assert.equal(getUserResponse.statusCode, 200)
          assert.deepEqual(getUserResponse.json(), {
            id: 10,
            username: 'user1',
            firstName: 'John',
            lastName: 'Smith',
          })
        } finally {
          await app.close()
        }
      })

      it('logs a warning when a parameterized operation has no response example', async () => {
        const { app, hasSkipOperationLog } = await buildLoggedApp('../fixtures/petstore-route-generation-missing-response-example.yaml')

        try {
          assert.equal(app.hasRoute({ method: 'GET', url: '/pet/findByStatus' }), false)
          assert.equal(hasSkipOperationLog('findPetsByStatus'), true)
        } finally {
          await app.close()
        }
      })
    })

    describe('validation', () => {
      it('throws during registration when an operation does not define response codes', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-missing-responses.yaml'),
          /Operation "uploadFile" must define at least one response/
        )
      })

      it('throws during registration when response default is used', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-response-status-default.yaml'),
          /Response status "default" in operation "listPets" must be a concrete HTTP status code from 100 to 599/
        )
      })

      it('throws during registration when response 1XX is used', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-response-status-1xx.yaml'),
          /Response status "1XX" in operation "listPets" must be a concrete HTTP status code from 100 to 599/
        )
      })

      it('throws during registration when response 2XX is used', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-response-status-2xx.yaml'),
          /Response status "2XX" in operation "listPets" must be a concrete HTTP status code from 100 to 599/
        )
      })

      it('throws during registration when response 3XX is used', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-response-status-3xx.yaml'),
          /Response status "3XX" in operation "listPets" must be a concrete HTTP status code from 100 to 599/
        )
      })

      it('throws during registration when response 4XX is used', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-response-status-4xx.yaml'),
          /Response status "4XX" in operation "listPets" must be a concrete HTTP status code from 100 to 599/
        )
      })

      it('throws during registration when response 5XX is used', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-response-status-5xx.yaml'),
          /Response status "5XX" in operation "listPets" must be a concrete HTTP status code from 100 to 599/
        )
      })

      it('throws for unsupported OpenAPI parameter locations', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-unsupported-parameter-location.yaml'),
          /Unsupported OpenAPI parameter location "params" for parameter "color" in operation "findPetsByColor"/
        )
      })

      it('registers no route when response examples are not linked to request examples for parameterized operations', async () => {
        const app = await buildApp('../fixtures/petstore-validation-missing-request-example.yaml')

        try {
          const response = await app.inject({ method: 'GET', url: '/store/inventory' })

          assert.equal(response.statusCode, 404)
        } finally {
          await app.close()
        }
      })

      it('throws during registration when response examples reference unavailable request body examples', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-missing-request-body-example.yaml'),
          /Request example "updated-pet" referenced by operation "updatePet" does not exist/
        )
      })

      it('throws during registration when x-request-match references a missing request example', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-orphan-request-match.yaml'),
          /Request example "missing-order-example" referenced by operation "getOrderById" does not exist/
        )
      })

      it('throws when x-request-match is defined outside response examples', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-request-match-location.yaml'),
          /x-request-match is only supported on response examples for operation "getPetById"/
        )
      })

      it('throws when x-request-match is defined on a response object', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-request-match-response-location.yaml'),
          /x-request-match is only supported on response examples for operation "getPetById"/
        )
      })

      it('throws when x-request-match is defined on response media content', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-invalid-request-match-media-location.yaml'),
          /x-request-match is only supported on response examples for operation "getPetById"/
        )
      })

      it('throws when a $ref target does not exist', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-ref-missing-target.yaml'),
          /Missing \$ref pointer "#\/components\/parameters\/PetId"/
        )
      })

      it('throws when $ref entries are circular', async () => {
        await assert.rejects(
          () => buildApp('../fixtures/petstore-validation-ref-circular.yaml'),
          /Circular \$ref pointer found/
        )
      })
    })
  })

  describe('unmatched requests', () => {
    it('returns 501 when no petId example matches', async () => {
      const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

      try {
        const response = await app.inject({ method: 'GET', url: '/pet/999' })

        assert.equal(response.statusCode, 501)
        assert.equal(response.headers['x-mock-response'], 'true')
      } finally {
        await app.close()
      }
    })

    it('returns 501 when any condition in a multi-parameter match fails', async () => {
      const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

      try {
        const response = await app.inject({ method: 'POST', url: '/pet/10?name=doggie&status=available' })

        assert.equal(response.statusCode, 501)
        assert.equal(response.headers['x-mock-response'], 'true')
      } finally {
        await app.close()
      }
    })

    it('returns 501 when no request body example matches', async () => {
      const app = await buildApp('../fixtures/petstore-core-behavior.yaml')

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/pet',
          payload: { id: 11, name: 'cat', photoUrls: ['https://example.com/cat.png'] },
        })

        assert.equal(response.statusCode, 501)
      } finally {
        await app.close()
      }
    })
  })
})
