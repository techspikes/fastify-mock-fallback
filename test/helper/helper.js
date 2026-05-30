import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'

import { fastifyMockFallback } from '../../index.js'

export const fixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}.yaml`, import.meta.url))

export const jsonFixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url))

export async function buildApp (specPath, extraHandlers) {
  const app = Fastify({ logger: false })

  if (extraHandlers) {
    for (const [url, handler] of Object.entries(extraHandlers)) {
      const [method, path] = url.split(' ')
      app.route({ method, url: path, handler })
    }
  }

  await app.register(fastifyMockFallback, { specification: specPath, enable: true })
  await app.ready()
  return app
}
