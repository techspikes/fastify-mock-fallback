import type { FastifyPluginAsync } from 'fastify'

export type RequestExampleEntry = {
  source: 'params' | 'query' | 'header' | 'cookie' | 'body' | 'unknown'
  name?: string
  value: unknown
}

export type RequestExampleMap = Map<string, RequestExampleEntry[]>

export type MockEntry = {
  matchName: string
  statusCode: number
  body?: unknown
}

export type OperationMock = {
  fastifyPath: string
  httpMethod: string
  operationId: string
  entries: MockEntry[]
  requestExamples: RequestExampleMap
}

export type MockFallbackOptions = {
  specification: string
  enable?: boolean
}

export declare const fastifyMockFallback: FastifyPluginAsync<MockFallbackOptions>

export default fastifyMockFallback
