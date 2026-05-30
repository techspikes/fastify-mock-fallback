# fastify-mock-fallback

[![Node.js CI](https://github.com/techspikes/fastify-mock-fallback/actions/workflows/ci.yml/badge.svg)](https://github.com/techspikes/fastify-mock-fallback/actions/workflows/ci.yml)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

Fastify plugin that registers fallback mock routes from OpenAPI request and response examples.

It is intended for spec-first development: keep real Fastify handlers for implemented operations, and let this plugin serve example responses for operations that are not yet implemented.

## Scope

**Intentionally short and simple.** Designed for true agile teams where full-stack engineers practice XP to develop both frontend and backend.

If you are looking for a more full-featured API mocking and testing platform, consider [Microcks](https://microcks.io/), a CNCF Incubating project.

## Install

```sh
npm i @techspikes/fastify-mock-fallback
```

### Compatibility

| Plugin version | Fastify version |
| -------------- | --------------- |
| `^0.1.x` | `^5.x` |

## Usage

Import `@techspikes/fastify-mock-fallback` and register it as any other plugin.

```js
import Fastify from 'fastify'
import mockFallback from '@techspikes/fastify-mock-fallback'

const fastify = Fastify()

await fastify.register(mockFallback, {
  specification: './openapi.yaml',
  enable: process.env.NODE_ENV !== 'production',
})

fastify.get('/implemented', async () => {
  return { source: 'real handler' }
})

await fastify.listen({ port: 3000 })
```

The plugin reads OpenAPI YAML and JSON files through `@apidevtools/swagger-parser`. YAML anchors, aliases, local `$ref`, and relative file `$ref` entries are resolved in memory before mock routes are registered. For security, remote `$ref` entries are not fetched.

Existing Fastify routes are not replaced. If a generated mock route conflicts with an already registered route, the existing route wins.

### Options

* `specification`: Path to an OpenAPI YAML or JSON file. Required.
* `enable`: Set to `true` to register mock routes. Default: `false`.

## Matching

The plugin builds request examples from an operation's parameters and request body examples, then links responses to those request examples.

Request examples can come from:

* `path` parameters, matched against `request.params`
* `query` parameters, matched against `request.query`
* `header` parameters, matched against lower-case `request.headers`
* `cookie` parameters, matched against `request.cookies`
* `requestBody`, matched against `request.body`

Parameter, header, cookie, and query values are compared as strings. Request bodies are compared by JSON serialization. Cookie matching requires a cookie parser such as `@fastify/cookie`.

When request body examples with the same name are defined across multiple media types, request matching uses the client `Content-Type` header to select the matching request body media.

### Response matching

Responses are linked in priority order:

1. response example-level `x-request-match`
2. same-name response and request examples
3. for operations without request examples, the first status `200` media entry with `example`
4. for operations without request examples, the first status `200` media entry with `examples`

```yaml
openapi: "3.0.4"
info:
  title: Example API
  version: "1.0.0"
paths:
  /pet/{petId}:
    get:
      operationId: getPetById
      parameters:
        - in: path
          name: petId
          required: true
          schema: { type: integer }
          examples:
            rocky:
              value: 1
            daisy:
              value: 2
            missing:
              value: 3
      responses:
        "200":
          description: successful operation
          content:
            application/json:
              examples:
                default:
                  x-request-match: rocky
                  value: { id: 1, name: rocky }
                daisy:
                  value: { id: 2, name: daisy }
        "404":
          description: not found
          content:
            application/json:
              examples:
                missing:
                  x-request-match: missing
                  value: { code: 404, message: not found }
  /pets:
    get:
      operationId: listPets
      responses:
        "200":
          description: successful operation
          content:
            application/json:
              example: [{ id: 1, name: rocky }, { id: 2, name: daisy }]
```

`GET /pet/1` uses response example-level `x-request-match`. `GET /pet/2` uses same-name matching. `GET /pet/3` uses response example-level `x-request-match` and returns `404`. `GET /pets` has no request examples, so it uses the status `200` response `example`.

Response media is selected from the request `Accept` header by using the `accepts` package. When `Accept` is omitted, `*/*` is assumed. After media selection, the first matching response entry in OpenAPI definition order is used.

### Validation

Explicit references are strict:

* `x-request-match` must reference an existing request example.
* `x-request-match` can be defined only at response example level.

Unsupported OpenAPI parameter locations throw during plugin registration.

## Runtime behavior

* Converts OpenAPI paths such as `/pet/{petId}` to Fastify paths such as `/pet/:petId`.
* Registers routes only for operations with at least one linked response.
* Checks `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, and `HEAD`.
* Adds `x-mock-response: true` to generated mock responses.
* Returns the matched response status code and body when a body is configured.
* Returns `406` with `x-mock-response: true` when no response media type is acceptable.
* Returns `501` with `x-mock-response: true` when no example matches.
* Rejects invalid OpenAPI specs, including specs without `paths`.
* Registers no routes for specs with empty `paths`.

## Exports

Both default and named exports are available.

```js
import mockFallback from '@techspikes/fastify-mock-fallback'
import { fastifyMockFallback } from '@techspikes/fastify-mock-fallback'
```

## License

Licensed under [MIT](./LICENSE).
