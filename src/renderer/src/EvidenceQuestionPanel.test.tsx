import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EVIDENCE_QUESTION_ERRORS, type EvidenceQuestionResponse } from '../../shared/evidence-question-ipc'
import { EvidenceQuestionController } from './evidence-question-controller'
import { QuestionOutcome } from './EvidenceQuestionPanel'
import type { GeneratedReasoning } from '../../shared/reasoning-ipc'
import { INTERACTION_REASONING_VERSION } from '../../shared/interaction-reasoning'

const request = { accountId: 'a', conversationId: 'c', days: 7, question: '还有其他解释吗？' }
function success(): Extract<EvidenceQuestionResponse, { ok: true }> {
  // View-only fields, with no import from Main or Node in the renderer compilation.
  const contextPack = {
    coverage: { analyzedMessageCount: 20 }, observations: [{ status: 'detected' }],
    evidence: {
      metricSupport: [{ id: 'canonical-metric-1', label: '消息量下降', kind: 'metric', direction: 'support', previous: 15, recent: 5, unit: 'count' }],
      metricCounter: [], messageSupport: [], messageCounter: [], semanticSupport: [], semanticCounter: [],
      semanticContext: [{ id: 'canonical-semantic-1', label: '工作繁忙', kind: 'semantic', direction: 'context', senderName: '合成人物',
        senderId: 'synthetic-sender', timestamp: 1789100000000, messageIds: ['synthetic-message-1'], excerpt: '今天工作很多。' }]
    }
  } as unknown as GeneratedReasoning['contextPack']
  return { ok: true, stats: { modelCalls: 2, toolCalls: 1, deliveredCount: 2, elapsedMs: 2500 }, value: {
    providerId: 'test', modelId: 'mock', contextPack, result: { version: INTERACTION_REASONING_VERSION,
      summary: '经过校验的解释。', findings: [{ id: 'f1', claim: '互动行为变化。', evidenceIds: [contextPack.evidence.metricSupport[0].id], confidence: 'low' }],
      alternativeExplanations: [{ id: 'a1', explanation: '工作可能是背景。', evidenceIds: [contextPack.evidence.semanticContext[0].id] }], uncertainties: ['行为不等于心理。'] }
  } }
}
describe('question outcomes', () => {
  it.each(Object.keys(EVIDENCE_QUESTION_ERRORS) as (keyof typeof EVIDENCE_QUESTION_ERRORS)[])('shows specific %s failure with no answer content', code => {
    const [phase, title, hint] = EVIDENCE_QUESTION_ERRORS[code]
    const html = renderToStaticMarkup(<QuestionOutcome state={{ phase, busy: false, response: { ok: false, error: { code } } }} />)
    expect(html).toContain(`data-phase="${phase}"`)
    expect(html).toContain(title); expect(html).toContain(hint)
    expect(html).not.toContain('已验证的互动解释')
  })
  it('shows an honest running state before validation', () => {
    const html = renderToStaticMarkup(<QuestionOutcome state={{ phase: 'running', busy: true }} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('正在取证与校验')
    expect(html).not.toContain('校验通过')
  })
  it('shows the submitted question, canonical evidence, original excerpts and safe counts', () => {
    const response = success()
    const html = renderToStaticMarkup(<QuestionOutcome state={{ phase: 'success', busy: false, response, question: '<script>question</script>' }} />)
    expect(html).toContain('结构与引用校验通过')
    expect(html).toContain('&lt;script&gt;question&lt;/script&gt;')
    expect(html).toContain(response.value.contextPack.evidence.semanticContext[0].id)
    expect(html).toContain(response.value.contextPack.evidence.semanticContext[0].messageIds[0])
    expect(html).toContain('模型调用 2 次')
    expect(html).not.toContain('<script>')
  })
})

describe('question lifecycle', () => {
  it('prevents duplicate clicks and maps each service failure to its UI state', async () => {
    let resolve!: (value: EvidenceQuestionResponse) => void
    const api = { askEvidenceQuestion: vi.fn(() => new Promise<EvidenceQuestionResponse>(done => { resolve = done })), cancelEvidenceQuestion: vi.fn(async () => ({ cancelled: true })) }
    const controller = new EvidenceQuestionController(api)
    const pending = controller.ask(request)
    expect(controller.getSnapshot().phase).toBe('running')
    await controller.ask(request)
    expect(api.askEvidenceQuestion).toHaveBeenCalledTimes(1)
    resolve({ ok: false, error: { code: 'invalid-output' } }); await pending
    expect(controller.getSnapshot()).toMatchObject({ phase: 'invalid-model-output', busy: false })
    api.askEvidenceQuestion.mockResolvedValue({ ok: false, error: { code: 'invalid-citation' } })
    await controller.ask(request)
    expect(controller.getSnapshot().phase).toBe('invalid-citation')
  })
  it('cancels once and never displays a late successful response', async () => {
    let resolve!: (value: EvidenceQuestionResponse) => void
    const api = { askEvidenceQuestion: vi.fn(() => new Promise<EvidenceQuestionResponse>(done => { resolve = done })), cancelEvidenceQuestion: vi.fn(async () => ({ cancelled: true })) }
    const controller = new EvidenceQuestionController(api); const pending = controller.ask(request)
    controller.cancel(); controller.cancel()
    expect(api.cancelEvidenceQuestion).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', busy: true })
    await controller.ask(request); expect(api.askEvidenceQuestion).toHaveBeenCalledTimes(1)
    resolve(success()); await pending
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', busy: false })
    expect(controller.getSnapshot().response).not.toHaveProperty('value')
  })
  it('scope unmount cancels work; a new scope has independent state', async () => {
    let resolve!: (value: EvidenceQuestionResponse) => void
    const api = { askEvidenceQuestion: () => new Promise<EvidenceQuestionResponse>(done => { resolve = done }), cancelEvidenceQuestion: vi.fn(async () => ({ cancelled: true })) }
    const oldScope = new EvidenceQuestionController(api); const pending = oldScope.ask(request)
    oldScope.dispose()
    const newScope = new EvidenceQuestionController(api)
    resolve(success()); await pending
    expect(newScope.getSnapshot()).toEqual({ phase: 'idle', busy: false })
    expect(oldScope.getSnapshot().phase).toBe('cancelled')
    expect(api.cancelEvidenceQuestion).toHaveBeenCalledTimes(1)
  })
  it('does not echo rejected IPC errors and permits a manual new attempt', async () => {
    const api = { askEvidenceQuestion: vi.fn().mockRejectedValue(new Error('PRIVATE_RESPONSE')), cancelEvidenceQuestion: vi.fn(async () => ({ cancelled: false })) }
    const controller = new EvidenceQuestionController(api)
    await controller.ask(request)
    expect(controller.getSnapshot().phase).toBe('provider-error')
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('PRIVATE')
    api.askEvidenceQuestion.mockResolvedValue(success())
    await controller.ask(request)
    expect(controller.getSnapshot().phase).toBe('success')
    controller.reset()
    expect(controller.getSnapshot()).toEqual({ phase: 'idle', busy: false })
  })
})
