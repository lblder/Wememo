import { expect, it } from 'vitest'
import { MockLLMProvider } from './mock-llm-provider'

it('returns a fixed response and records call count and a copied request', async () => {
  const provider = new MockLLMProvider({ responseText: '{"mock":true}' })
  const request = { systemPrompt: 'system', userPrompt: 'data', responseFormat: 'json' as const }
  expect(provider.callCount).toBe(0)
  expect(provider.lastRequest).toBeUndefined()
  expect(await provider.generate(request)).toEqual({ text: '{"mock":true}', providerId: 'mock', modelId: 'fixed-response-v1' })
  expect(provider.callCount).toBe(1)
  expect(provider.lastRequest).toEqual(request)
  request.userPrompt = 'changed'
  expect(provider.lastRequest?.userPrompt).toBe('data')
  await provider.generate(request)
  expect(provider.callCount).toBe(2)
  expect(provider.lastRequest?.userPrompt).toBe('changed')
})
