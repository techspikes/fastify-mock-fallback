import Fastify, { type FastifyPluginAsync } from 'fastify'
import { expect, test } from 'tstyche'
import fastifyMockFallback, {
  fastifyMockFallback as namedFastifyMockFallback,
  type MockFallbackOptions,
} from '@techspikes/fastify-mock-fallback'

test('exports a Fastify plugin', () => {
  expect(fastifyMockFallback).type.toBeAssignableTo<
    FastifyPluginAsync<MockFallbackOptions>
  >()
  expect(namedFastifyMockFallback).type.toBe<typeof fastifyMockFallback>()
})

test('accepts mock fallback options', () => {
  const options: MockFallbackOptions = {
    specification: './openapi.yaml',
  }

  expect(options.enable).type.toBe<boolean | undefined>()
  expect(fastifyMockFallback).type.toBeCallableWith(Fastify(), options)
})
