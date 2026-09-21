import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'

import { fastifyMockFallback } from '../../index.js'

export function resolveSpecification (specification) {
  if (typeof specification !== 'string' || !/\.(?:json|yaml)$/.test(specification)) {
    throw new TypeError('Specification must be a .json or .yaml file path')
  }

  return fileURLToPath(new URL(specification, import.meta.url))
}

export async function buildLoggedApp (specification) {
  const logs = []
  const app = Fastify({
    logger: {
      stream: {
        write: line => logs.push(JSON.parse(line))
      }
    }
  })

  try {
    await app.register(fastifyMockFallback, {
      specification: resolveSpecification(specification),
      enable: true,
    })
    await app.ready()
  } catch (error) {
    await app.close()
    throw error
  }

  return {
    app,
    hasSkipOperationLog: operationName => logs.some(log =>
      log.level === 40 &&
      log.msg === `skip operation "${operationName}", no response example found for parameterized operation`
    )
  }
}

export async function buildApp (specification, setup) {
  const app = Fastify({ logger: false })

  try {
    const options = typeof setup === 'function' ? { setup } : setup

    if (options?.cookie) {
      await app.register(await import('@fastify/cookie').then(m => m.default))
    }

    if (options?.setup) await options.setup(app)

    await app.register(fastifyMockFallback, {
      specification: resolveSpecification(specification),
      enable: true,
    })
    await app.ready()
  } catch (error) {
    await app.close()
    throw error
  }

  return app
}
