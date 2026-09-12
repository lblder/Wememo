import { expect, it } from 'vitest'
import { validateGenerateReasoningRequest, ReasoningRequestValidationError } from './reasoning-ipc'

const valid = { accountId: 'account', conversationId: 'conversation', days: 7 }
it('accepts only the scope and time selection', () => {
  expect(validateGenerateReasoningRequest(valid)).toEqual(valid)
})
it.each(['systemPrompt', 'userPrompt', 'contextPack', 'evidence', 'apiKey', 'endpoint', 'referenceTime'])('rejects Renderer-supplied %s', (key) => {
  expect(() => validateGenerateReasoningRequest({ ...valid, [key]: 'injected' })).toThrow(ReasoningRequestValidationError)
})
it.each([0, -1, 32, 1.5, Infinity, '7'])('rejects invalid days %s', (days) => {
  expect(() => validateGenerateReasoningRequest({ ...valid, days })).toThrow(ReasoningRequestValidationError)
})
it.each([null, [], {}, { ...valid, accountId: '' }, { ...valid, conversationId: ' ' }])('rejects malformed request', (value) => {
  expect(() => validateGenerateReasoningRequest(value)).toThrow(ReasoningRequestValidationError)
})
