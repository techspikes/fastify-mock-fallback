# fastify-mock-fallback

[![Node.js CI](https://github.com/techspikes/fastify-mock-fallback/actions/workflows/ci.yml/badge.svg)](https://github.com/techspikes/fastify-mock-fallback/actions/workflows/ci.yml)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

Fastify plugin that registers fallback mock routes from OpenAPI request and response examples.

Use it for spec-first development: keep real Fastify handlers for implemented operations, and let this plugin serve example responses for operations that are not implemented yet.

## Scope

**This plugin is intentionally short and simple.** It is designed for true agile teams where full-stack engineers develop both the frontend and backend while practicing XP.

If you need a full-featured API mocking and testing platform, consider [Microcks](https://microcks.io/), a CNCF Incubating project.

## Install

```sh
npm i @techspikes/fastify-mock-fallback
```

## Compatibility

| Plugin version | Fastify version |
| -------------- | --------------- |
| `^0.2.x` | `^5.x` |

## Supported Specification Versions

* Supports OpenAPI 3.0.x documents.
* OpenAPI 3.1.x is not officially supported.
* Swagger/OpenAPI 2.0 documents are not supported for mock generation, even though the underlying parser may be able to parse them.

## Usage

Register the plugin with an OpenAPI 3.0.x YAML or JSON file.

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

Existing Fastify routes are not replaced. If a generated mock route conflicts with an already registered route, the existing route wins.

### Options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `specification` | `string` | required | Path to an OpenAPI YAML or JSON file. |
| `enable` | `boolean` | `false` | Registers mock routes when set to `true`. |

## OpenAPI Loading

The plugin reads OpenAPI 3.0.x YAML and JSON files through `@apidevtools/swagger-parser`.

Supported before route registration:

* YAML anchors and aliases
* local `$ref`
* relative file `$ref`

Remote `$ref` entries are disabled as a safety precaution and are not fetched.

## Matching

The plugin builds request examples from an operation's parameters and request body examples, then links responses to those request examples.

Request examples can come from:

| OpenAPI source | Fastify request field |
| -------------- | --------------------- |
| `path` parameters | `request.params` |
| `query` parameters | `request.query` |
| `header` parameters | lower-case `request.headers` |
| `cookie` parameters | `request.cookies` |
| `requestBody` examples | `request.body` |

Parameter, header, cookie, and query values are compared as strings. Request bodies are compared with deep strict equality. Cookie matching requires a cookie parser such as `@fastify/cookie`.

Path-level parameters are included in request matching. Operation-level parameters override path-level parameters with the same `in` and `name` values.

When request body examples with the same name are defined across multiple media types, request matching uses the client `Content-Type` header to select the matching request body media.

### Response Matching

Responses are linked in this priority order:

1. response examples with `x-request-match`
2. same-name response and request examples
3. for operations without request examples, the first status `200` media entry with `example`
4. for operations without request examples, the first status `200` media entry with `examples`

Response media is selected from the request `Accept` header by using the `accepts` package. When `Accept` is omitted, `*/*` is assumed. After media selection, the first matching response entry in OpenAPI definition order is used.

### Example

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

In this example:

* `GET /pet/1` uses a response example with `x-request-match`.
* `GET /pet/2` uses same-name matching.
* `GET /pet/3` uses a response example with `x-request-match` and returns `404`.
* `GET /pets` has no request examples, so it uses the status `200` response `example`.

## Validation

Explicit references are strict:

* `x-request-match` must reference an existing request example.
* `x-request-match` can be defined only on response examples.
* response statuses must be concrete HTTP status codes from `100` to `599`.
* each operation must define at least one response entry.

Unsupported OpenAPI parameter locations throw during plugin registration.

## Runtime Behavior

* Converts OpenAPI paths such as `/pet/{petId}` to Fastify paths such as `/pet/:petId`.
* Registers routes only for operations with at least one linked response.
* Logs a warning when a parameterized operation has request examples but no linked response example.
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
