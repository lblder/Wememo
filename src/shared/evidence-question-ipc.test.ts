import { describe, expect, it, vi } from 'vitest'
import { validateEvidenceQuestionRequest } from './evidence-question-ipc'

const request = { accountId: 'a', conversationId: 'c', days: 7, question: '回复变慢还有其他解释吗？' }
describe('evidence question request boundary', () => {
  it('accepts only scope, bounded days and a bounded question', () => {
    expect(validateEvidenceQuestionRequest({ ...request, question: ' 问题 ' })).toEqual({ ...request, question: '问题' })
    expect(validateEvidenceQuestionRequest({ ...request, question: '😀'.repeat(1000) }).question).toHaveLength(2000)
  })
  it.each(['contextPack', 'evidenceIds', 'systemPrompt', 'tools', 'endpoint', 'apiKey', 'owner', 'referenceTime', 'runId'])('rejects injected %s', key => {
    expect(() => validateEvidenceQuestionRequest({ ...request, [key]: 'PRIVATE' })).toThrow()
  })
  it.each([null, [], {}, { ...request, days: 0 }, { ...request, days: 32 }, { ...request, days: 1.5 },
    { ...request, question: '' }, { ...request, question: '  ' }, { ...request, question: '字'.repeat(1001) },
    { ...request, accountId: '' }, { ...request, conversationId: 5 }])('rejects invalid values', value => {
    expect(() => validateEvidenceQuestionRequest(value)).toThrow()
  })
  it('rejects accessors/symbols without reading getters', () => {
    const getter = vi.fn(() => 'PRIVATE')
    expect(() => validateEvidenceQuestionRequest(Object.defineProperty({ ...request }, 'question', { get: getter }))).toThrow()
    expect(getter).not.toHaveBeenCalled()
    expect(() => validateEvidenceQuestionRequest({ ...request, [Symbol()]: 1 })).toThrow()
  })
})
