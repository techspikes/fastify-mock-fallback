import { isDeepStrictEqual } from 'node:util'
import fp from 'fastify-plugin'
import SwaggerParser from '@apidevtools/swagger-parser'
import accepts from 'accepts'

const X_MOCK_RESPONSE_HEADER = 'x-mock-response'
const X_REQUEST_MATCH = 'x-request-match'
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

// Normalizes media types for Accept and Content-Type comparisons.
const MediaType = {
  normalize (mediaType) {
    return mediaType.split(';')[0].trim().toLowerCase()
  },
  compare (actual, expected) {
    return MediaType.normalize(actual) === MediaType.normalize(expected)
  },
  negotiate (request, entries) {
    const mediaTypes = [...new Set(entries.map(entry => MediaType.normalize(entry.mediaType)))]
    return accepts({ headers: { ...request.headers } }).type(mediaTypes)
  },
}

// Matches collected request example conditions against Fastify requests.
const RequestMatcher = {
  sources: {
    path: 'params',
    query: 'query',
    header: 'header',
    cookie: 'cookie',
  },
  params (request, condition) {
    return String(request.params[condition.name]) === String(condition.value)
  },
  query (request, condition) {
    return String(request.query[condition.name]) === String(condition.value)
  },
  header (request, condition) {
    return request.headers[condition.name.toLowerCase()] === String(condition.value)
  },
  cookie (request, condition) {
    return String((request.cookies ?? {})[condition.name]) === String(condition.value)
  },
  body (request, condition) {
    return MediaType.compare(request.headers['content-type'] ?? '', condition.mediaType) &&
      isDeepStrictEqual(request.body, condition.value)
  },
  findEntry (request, entries, acceptedMediaType) {
    return entries.find(entry =>
      MediaType.compare(acceptedMediaType, entry.mediaType) &&
      entry.conditions.every(condition => RequestMatcher[condition.source](request, condition))
    )
  },
}

// Loads a local OpenAPI document and resolves supported refs before registration.
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

// Rejects response examples that point to a missing request example.
function rejectMissingRequestExample (requestExamples, matchName, operationName) {
  if (requestExamples.has(matchName)) return

  throw new Error(
    `Request example "${matchName}" referenced by operation "${operationName}" does not exist`
  )
}

// Keeps x-request-match constrained to response examples.
function rejectInvalidRequestMatchLocation (target, operationName) {
  if (target?.[X_REQUEST_MATCH] === undefined) return

  throw new Error(
    `${X_REQUEST_MATCH} is only supported at response example level for operation "${operationName}"`
  )
}

// Accepts only concrete HTTP response status codes.
function rejectInvalidResponseStatusCode (status, operationName) {
  if (/^[1-5][0-9]{2}$/.test(status)) return

  throw new Error(
    `Response status "${status}" in operation "${operationName}" must be a concrete HTTP status code from 100 to 599`
  )
}

// Limits matching to request locations Fastify can expose.
function rejectUnsupportedParameterLocation (param, operationName) {
  if (RequestMatcher.sources[param.in]) return

  throw new Error(
    `Unsupported OpenAPI parameter location "${param.in}" for parameter "${param.name}" in operation "${operationName}"`
  )
}

// OpenAPI operations must define at least one response entry.
function rejectMissingResponses (responses, operationName) {
  if (responses.length !== 0) return

  throw new Error(
    `Operation "${operationName}" must define at least one response`
  )
}

// Adds each response example as either an explicit match or a same-name match.
function pushMatchedEntry (explicitEntries, sameNameEntries, exampleName, example, statusCode, mediaType, requestExamples, operationName) {
  const getRequestExampleConditions = (requestExamples, matchName, operationName) => {
    rejectMissingRequestExample(requestExamples, matchName, operationName)
    return requestExamples.get(matchName)
  }

  if (example[X_REQUEST_MATCH]) {
    getRequestExampleConditions(requestExamples, example[X_REQUEST_MATCH], operationName)
      .forEach(conditions => {
        explicitEntries.push({ conditions, statusCode, mediaType, body: example.value })
      })
  } else if (requestExamples.has(exampleName)) {
    getRequestExampleConditions(requestExamples, exampleName, operationName)
      .forEach(conditions => {
        sameNameEntries.push({ conditions, statusCode, mediaType, body: example.value })
      })
  }
}

// Collects request examples into named condition variants used by responses.
function collectRequestExamples (pathItem, operation, operationName) {
  const collectParameters = () => {
    const operationParameters = operation.parameters ?? []

    // Operation parameters override path-level parameters with the same identity.
    const isOverriddenByOperation = (pathParam) =>
      operationParameters.some(operationParam =>
        operationParam.in === pathParam.in &&
        operationParam.name === pathParam.name
      )

    return [
      ...(pathItem?.parameters ?? []).filter(pathParam => !isOverriddenByOperation(pathParam)),
      ...operationParameters,
    ]
  }

  const requestExamples = new Map()
  const parameters = collectParameters()

  // Parameters with the same example name combine into one condition set.
  parameters.forEach(param => {
    rejectInvalidRequestMatchLocation(param, operationName)
    rejectUnsupportedParameterLocation(param, operationName)

    const source = RequestMatcher.sources[param.in]

    // Parameters without examples do not contribute matching conditions.
    Object.entries(param.examples ?? {}).forEach(([exampleName, example]) => {
      rejectInvalidRequestMatchLocation(example, operationName)

      const requestExampleVariants = requestExamples.get(exampleName) ?? [[]]

      requestExampleVariants.forEach(conditions => {
        conditions.push({ source, name: param.name, value: example.value })
      })

      requestExamples.set(exampleName, requestExampleVariants)
    })
  })

  // Request body examples add body conditions to matching request examples.
  Object.entries(operation.requestBody?.content ?? {}).forEach(([mediaType, media]) => {
    rejectInvalidRequestMatchLocation(media, operationName)

    Object.entries(media.examples ?? {}).forEach(([exampleName, example]) => {
      rejectInvalidRequestMatchLocation(example, operationName)

      const existingVariants = requestExamples.get(exampleName) ?? [[]]

      // Body examples attach to the parameter-only variant for the same name.
      const parameterConditions = existingVariants.find(conditions =>
        conditions.every(condition => condition.source !== 'body')
      ) ?? existingVariants[0].filter(condition => condition.source !== 'body')

      // Preserve existing body variants while adding this media type variant.
      const requestExampleVariants = [
        ...existingVariants.filter(conditions => conditions.some(condition => condition.source === 'body')),
        [
          ...parameterConditions,
          { source: 'body', mediaType, value: example.value },
        ],
      ]

      requestExamples.set(exampleName, requestExampleVariants)
    })
  })

  return requestExamples
}

// Collects all response examples that can produce mock responses.
function collectResponseEntries (pathItem, operation, operationName) {
  const matchedExampleEntries = []
  const matchedSameNameEntries = []
  const parameterlessEntries = []

  const responses = Object.entries(operation.responses ?? {})

  rejectMissingResponses(responses, operationName)

  const requestExamples = collectRequestExamples(pathItem, operation, operationName)

  responses.forEach(([status, response]) => {
    rejectInvalidRequestMatchLocation(response, operationName)
    rejectInvalidResponseStatusCode(status, operationName)

    const statusCode = Number(status)

    // Each response media type can contribute independently negotiable entries.
    Object.entries(response.content ?? {}).forEach(([mediaType, media]) => {
      rejectInvalidRequestMatchLocation(media, operationName)

      // Parameterless operations can use a plain 200 response example.
      if (requestExamples.size === 0 && statusCode === 200) {
        const exampleBody = Object.hasOwn(media, 'example') ? media.example : Object.values(media.examples ?? {})[0]?.value

        if (exampleBody !== undefined) {
          parameterlessEntries.push({ conditions: [], statusCode, mediaType, body: exampleBody })
        }
      }

      Object.entries(media.examples ?? {}).forEach(([exampleName, example]) => {
        pushMatchedEntry(
          matchedExampleEntries,
          matchedSameNameEntries,
          exampleName,
          example,
          statusCode,
          mediaType,
          requestExamples,
          operationName
        )
      })
    })
  })

  return {
    requestExamples,
    // Explicit matches win over same-name matches, then parameterless fallbacks.
    entries: [...matchedExampleEntries, ...matchedSameNameEntries, ...parameterlessEntries]
  }
}

// Converts OpenAPI operations into Fastify route definitions.
function buildMocks (api) {
  const buildOperationMock = (rawPath, pathItem, httpMethod, operation) => {
    const operationName = operation.operationId ?? `${httpMethod} ${rawPath}`
    const { requestExamples, entries } = collectResponseEntries(pathItem, operation, operationName)

    // Parameterized operations without linked responses are skipped.
    if (requestExamples.size !== 0 && entries.length === 0) return

    return {
      fastifyPath: rawPath.replace(/\{([^}]+)\}/g, ':$1'),
      httpMethod,
      operationName,
      entries,
    }
  }

  return Object.entries(api.paths).flatMap(([rawPath, pathItem]) =>
    HTTP_METHODS.flatMap(httpMethod => {
      const operation = pathItem?.[httpMethod.toLowerCase()]
      if (!operation) return []

      const mock = buildOperationMock(rawPath, pathItem, httpMethod, operation)

      return mock ? [mock] : []
    })
  )
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

  mocks.forEach(mock => {
    const { fastifyPath, httpMethod, operationName, entries } = mock

    // Real routes take precedence over generated fallback mocks.
    if (app.hasRoute({ method: httpMethod, url: fastifyPath })) {
      app.log.warn(`skip operation "${operationName}", already implemented`)
      return
    }

    app.route({
      method: httpMethod,
      url: fastifyPath,
      handler: async (request, reply) => {
        reply.header(X_MOCK_RESPONSE_HEADER, 'true')

        // Accept negotiation happens before request example matching.
        const acceptedMediaType = MediaType.negotiate(request, entries)

        if (!acceptedMediaType) {
          return reply.status(406).send({
            error: 'Not Acceptable',
            message: `No acceptable response media type found for operation "${operationName}"`,
          })
        }

        // A registered mock can still miss if request conditions do not match.
        const matched = RequestMatcher.findEntry(request, entries, acceptedMediaType)

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
  })

  app.log.info(`total mock routes: ${registeredCount}`)
}, {
  name: 'fastify-mock-fallback',
  fastify: '5.x',
})

export default fastifyMockFallback
