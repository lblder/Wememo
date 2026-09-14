import { describe, expect, it } from 'vitest'
import { diagnoseReasoningFailure } from './reasoning-failure-diagnostic'
import { BoundedAgentRunner } from '../evidence-agent/bounded-agent-runner'
import { MockToolCallingProvider } from '../evidence-agent/mock-tool-calling-provider'
import type { ToolCallingRequest } from '../evidence-agent/tool-calling-provider'
import { catalogFrom, finalText, readSupportAndContext } from '../evidence-agent/agent-test-fixtures'
import { demoPack } from '../reasoning/reasoning-test-fixtures'
import { InteractionReasoningValidationError } from '../../shared/interaction-reasoning-validation'

describe('diagnostics preserve rejection and privacy', () => {
  it.each([
    ['json', 'invalid-json'], ['fields', 'invalid-fields'], ['undelivered', 'citation-not-delivered'],
    ['finding', 'finding-missing-support'], ['alternative', 'alternative-uses-support']
  ] as const)('classifies %s through the real Runner without accepting or repairing', async (mode, kind) => {
    const pack = demoPack()
    const provider = new MockToolCallingProvider([readSupportAndContext, (request: ToolCallingRequest) => {
      if (mode === 'json') return { type: 'final', text: 'PRIVATE_RAW_RESPONSE' }
      const catalog = catalogFrom(request)
      const support = catalog.find(item => item.direction === 'support')!.id
      const context = catalog.find(item => item.direction === 'context')!.id
      const result = finalText([mode === 'finding' ? context : mode === 'undelivered' ? 'PRIVATE_ID' : support], [mode === 'alternative' ? support : context])
      if (mode === 'fields' && result.type === 'final') {
        const value = JSON.parse(result.text)
        delete value.alternativeExplanations[0].id
        value.alternativeExplanations[0].confidence = 'PRIVATE_VALUE'
        value.alternativeExplanations[0].PRIVATE_KEY_NAME = 'PRIVATE_VALUE'
        return { type: 'final', text: JSON.stringify(value) }
      }
      return result
    }])
    const response = await new BoundedAgentRunner(provider).run({ contextPack: pack, question: '解释变化' })
    expect(response).toMatchObject({ ok: false, error: { diagnostic: { kind } }, metadata: { modelCalls: 2, toolCalls: 1 } })
    expect(provider.callCount).toBe(2)
    expect(response).not.toHaveProperty('value')
    if (!response.ok && mode === 'fields') expect(response.error.diagnostic?.detail).toBe('alternativeExplanations[0]：缺少 id；多出 confidence；另有 1 个未识别字段')
    for (const sensitive of ['PRIVATE', pack.scope.accountId, pack.scope.conversationId, ...Object.values(pack.evidence).flat().map(item => item.id)]) expect(JSON.stringify(response)).not.toContain(sensitive)
  })
  it('never echoes arbitrary exception paths or messages', () => {
    const error = new InteractionReasoningValidationError('PRIVATE_PATH', 'PRIVATE_REASON')
    expect(diagnoseReasoningFailure(error, 'PRIVATE_BODY')).toEqual({ kind: 'invalid-fields' })
    expect(diagnoseReasoningFailure(new Error('PRIVATE_ERROR'))).toBeUndefined()
  })
})
