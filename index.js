import fp from 'fastify-plugin'
import SwaggerParser from '@apidevtools/swagger-parser'
import accepts from 'accepts'

const X_MOCK_RESPONSE_HEADER = 'x-mock-response'
const X_REQUEST_MATCH = 'x-request-match'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

const FASTIFY_REQUEST_SOURCES = {
  path: 'params',
  query: 'query',
  header: 'header',
  cookie: 'cookie',
}

function normalizeMediaType (mediaType) {
  return mediaType.split(';')[0].trim().toLowerCase()
}

function isSameMediaType (actual, expected) {
  return normalizeMediaType(actual) === normalizeMediaType(expected)
}

const REQUEST_MATCHERS = {
  params: (request, condition) => String(request.params[condition.name]) === String(condition.value),
  query: (request, condition) => String(request.query[condition.name]) === String(condition.value),
  header: (request, condition) => request.headers[condition.name.toLowerCase()] === String(condition.value),
  cookie: (request, condition) => String((request.cookies ?? {})[condition.name]) === String(condition.value),
  body: (request, condition) =>
    request.headers['content-type'] !== undefined &&
    isSameMediaType(request.headers['content-type'], condition.mediaType) &&
    JSON.stringify(request.body) === JSON.stringify(condition.value),
}

function selectAcceptedMediaType (request, entries) {
  const mediaTypes = [...new Set(entries.map(entry => normalizeMediaType(entry.mediaType)))]
  const acceptRequest = {
    headers: {
      ...request.headers,
      accept: request.headers.accept ?? '*/*',
    },
  }

  return accepts(acceptRequest).type(mediaTypes)
}

async function loadOpenApiSpecification (specification) {
  return await SwaggerParser.dereference(specification, {
    resolve: {
      http: false
    },
    dereference: {
      circular: false,
    },
  })
}

function assertRequestExampleExists (requestExamples, matchName, operationName) {
  if (requestExamples.has(matchName)) return

  throw new Error(
    `Request example "${matchName}" referenced by operation "${operationName}" does not exist`
  )
}

function assertRequestMatchLocation (target, operationName) {
  if (target?.[X_REQUEST_MATCH] === undefined) return

  throw new Error(
    `${X_REQUEST_MATCH} is only supported at response example level for operation "${operationName}"`
  )
}

function getRequestExampleConditions (requestExamples, matchName, operationName) {
  assertRequestExampleExists(requestExamples, matchName, operationName)

  return requestExamples.get(matchName)
}

function createMatchedEntry (conditions, statusCode, mediaType, body) {
  return {
    conditions,
    statusCode,
    mediaType,
    body,
  }
}

function pushMatchedExampleOrSameNameEntry (explicitEntries, sameNameEntries, exampleName, example, statusCode, mediaType, requestExamples, operationName) {
  if (example[X_REQUEST_MATCH]) {
    for (const conditions of getRequestExampleConditions(requestExamples, example[X_REQUEST_MATCH], operationName)) {
      explicitEntries.push(createMatchedEntry(conditions, statusCode, mediaType, example.value))
    }
    return
  }

  if (requestExamples.has(exampleName)) {
    for (const conditions of getRequestExampleConditions(requestExamples, exampleName, operationName)) {
      sameNameEntries.push(createMatchedEntry(conditions, statusCode, mediaType, example.value))
    }
  }
}

function collectRequestExamples (operation, operationName) {
  const requestExamples = new Map()

  for (const param of operation.parameters ?? []) {
    assertRequestMatchLocation(param, operationName)

    const source = FASTIFY_REQUEST_SOURCES[param.in]

    if (!source) {
      throw new Error(
        `Unsupported OpenAPI parameter location "${param.in}" for parameter "${param.name}" in operation "${operationName}"`
      )
    }

    for (const [exampleName, example] of Object.entries(param.examples ?? {})) {
      assertRequestMatchLocation(example, operationName)

      const requestExampleVariants = requestExamples.get(exampleName) ?? [[]]

      for (const conditions of requestExampleVariants) {
        conditions.push({ source, name: param.name, value: example.value })
      }

      requestExamples.set(exampleName, requestExampleVariants)
    }
  }

  for (const [mediaType, media] of Object.entries(operation.requestBody?.content ?? {})) {
    assertRequestMatchLocation(media, operationName)

    for (const [exampleName, example] of Object.entries(media.examples ?? {})) {
      assertRequestMatchLocation(example, operationName)

      const existingVariants = requestExamples.get(exampleName) ?? [[]]
      const parameterConditions = existingVariants.find(conditions =>
        conditions.every(condition => condition.source !== 'body')
      ) ?? existingVariants[0].filter(condition => condition.source !== 'body')
      const requestExampleVariants = [
        ...existingVariants.filter(conditions => conditions.some(condition => condition.source === 'body')),
        [
          ...parameterConditions,
          { source: 'body', mediaType, value: example.value },
        ],
      ]

      requestExamples.set(exampleName, requestExampleVariants)
    }
  }

  return requestExamples
}

function collectResponseEntries (operation, operationName) {
  const matchedExampleEntries = []
  const matchedSameNameEntries = []
  const parameterlessEntries = []

  const responses = Object.entries(operation.responses ?? {})

  if (responses.length === 0) {
    throw new Error(
      `Operation "${operationName}" must define at least one response`
    )
  }

  const requestExamples = collectRequestExamples(operation, operationName)

  for (const [status, response] of responses) {
    const statusCode = Number(status)

    assertRequestMatchLocation(response, operationName)

    for (const [mediaType, media] of Object.entries(response.content ?? {})) {
      assertRequestMatchLocation(media, operationName)

      if (requestExamples.size === 0 && statusCode === 200) {
        const exampleBody = Object.hasOwn(media, 'example') ? media.example : Object.values(media.examples ?? {})[0]?.value

        if (exampleBody !== undefined) {
          parameterlessEntries.push({ conditions: [], statusCode, mediaType, body: exampleBody })
        }
      }

      for (const [exampleName, example] of Object.entries(media.examples ?? {})) {
        pushMatchedExampleOrSameNameEntry(
          matchedExampleEntries,
          matchedSameNameEntries,
          exampleName,
          example,
          statusCode,
          mediaType,
          requestExamples,
          operationName
        )
      }
    }
  }

  return [...matchedExampleEntries, ...matchedSameNameEntries, ...parameterlessEntries]
}

function buildOperationMock (rawPath, httpMethod, operation) {
  const operationName = operation.operationId ?? `${httpMethod} ${rawPath}`
  const entries = collectResponseEntries(operation, operationName)

  if (entries.length === 0 && collectRequestExamples(operation, operationName).size !== 0) return

  return {
    fastifyPath: rawPath.replace(/\{([^}]+)\}/g, ':$1'),
    httpMethod,
    operationName,
    entries,
  }
}

function buildMocks (api) {
  const mocks = []

  for (const [rawPath, pathItem] of Object.entries(api.paths)) {
    for (const httpMethod of HTTP_METHODS) {
      const operation = pathItem?.[httpMethod.toLowerCase()]
      if (!operation) continue

      const mock = buildOperationMock(rawPath, httpMethod, operation)

      if (mock) mocks.push(mock)
    }
  }

  return mocks
}

export const fastifyMockFallback = fp(async (app, options) => {
  const { specification, enable = false } = options

  if (!enable) {
    app.log.info('mock fallback disabled, skipping')
    return
  }

  const api = await loadOpenApiSpecification(specification)
  const mocks = buildMocks(api)

  let registeredCount = 0

  for (const mock of mocks) {
    const { fastifyPath, httpMethod, operationName, entries } = mock

    if (app.hasRoute({ method: httpMethod, url: fastifyPath })) {
      app.log.warn(`skip operation "${operationName}", already implemented`)
      continue
    }

    app.route({
      method: httpMethod,
      url: fastifyPath,
      handler: async (request, reply) => {
        let matched
        const acceptedMediaType = selectAcceptedMediaType(request, entries)

        for (const entry of entries) {
          if (!acceptedMediaType || !isSameMediaType(acceptedMediaType, entry.mediaType)) continue

          const isMatched = entry.conditions.every((condition) =>
            REQUEST_MATCHERS[condition.source](request, condition)
          )

          if (isMatched) {
            matched = entry
            break
          }
        }

        reply.header(X_MOCK_RESPONSE_HEADER, 'true')

        if (!acceptedMediaType) {
          return reply.status(406).send({
            error: 'Not Acceptable',
            message: `No acceptable response media type found for operation "${operationName}"`,
          })
        }

        if (!matched) {
          return reply.status(501).send({
            error: 'Not Implemented',
            message: `No matching example found for operation "${operationName}"`,
          })
        }

        return reply.status(matched.statusCode).type(matched.mediaType).send(matched.body)
      },
    })

    app.log.info(`registered mock operation: ${operationName}`)
    registeredCount++
  }

  app.log.info(`total mock routes: ${registeredCount}`)
}, {
  name: 'fastify-mock-fallback',
  fastify: '5.x',
})

export default fastifyMockFallback
