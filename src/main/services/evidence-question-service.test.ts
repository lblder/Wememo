import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidenceQuestionService } from './evidence-question-service'
import { MockToolCallingProvider } from '../evidence-agent/mock-tool-calling-provider'
import { ToolCallingProviderError, type ToolCallingResponse } from '../evidence-agent/tool-calling-provider'
import { demoPack } from '../reasoning/reasoning-test-fixtures'
import { call, calls, emptyPack, finalText, groundedFinal, readSupportAndContext } from '../evidence-agent/agent-test-fixtures'
import type { InteractionPeriodAnalysisResult } from '../../shared/interaction-ipc'
import { openDatabase } from '../data/database'
import { SqliteMessageRepository } from '../data/sqlite-message-repository'
import { InteractionAnalysisService } from '../analytics/interaction-analysis-service'
import { demoMessages } from '../reasoning/reasoning-test-fixtures'

const request = { accountId: 'a', conversationId: 'c', days: 7, question: '还有什么解释？' }
const status = { providerId: 'deepseek', modelId: 'deepseek-flash', configured: true, message: 'ready' }
const setup = (steps: ConstructorParameters<typeof MockToolCallingProvider>[0] = [readSupportAndContext, groundedFinal]) => {
  const pack = demoPack()
  const analysis = { analyzePeriod: vi.fn(() => ({ contextPack: pack }) as InteractionPeriodAnalysisResult) }
  const provider = new MockToolCallingProvider(steps)
  return { pack, analysis, provider, service: new EvidenceQuestionService(analysis, provider, status) }
}
afterEach(() => vi.useRealTimers())
describe('EvidenceQuestionService', () => {
  it('builds Main scope and returns only validated canonical citations with safe execution counts', async () => {
    const { service, analysis, pack } = setup()
    const response = await service.ask(request, 1)
    expect(analysis.analyzePeriod).toHaveBeenCalledWith({ accountId: 'a', conversationId: 'c', days: 7 })
    expect(response).toMatchObject({ ok: true, stats: { modelCalls: 2, toolCalls: 1, deliveredCount: 2 } })
    if (response.ok) {
      expect(response.value.contextPack).toEqual(pack)
      expect(response.value.result.alternativeExplanations[0].evidenceIds).toEqual([pack.evidence.semanticContext[0].id])
    }
    expect(response).not.toHaveProperty('trace')
    expect(response).not.toHaveProperty('aliasBindings')
  })
  it('rejects injection before analysis/provider and reports missing config locally', async () => {
    const { service, analysis, provider } = setup()
    expect(await service.ask({ ...request, contextPack: demoPack() }, 1)).toMatchObject({ error: { code: 'invalid-request' } })
    expect(analysis.analyzePeriod).not.toHaveBeenCalled()
    expect(provider.callCount).toBe(0)
    expect(await new EvidenceQuestionService(analysis, undefined, { ...status, configured: false }).ask(request, 1)).toMatchObject({ error: { code: 'not-configured' } })
  })
  it('exits locally without data', async () => {
    const { analysis, provider, service } = setup()
    analysis.analyzePeriod.mockReturnValue({ contextPack: emptyPack() } as InteractionPeriodAnalysisResult)
    expect(await service.ask(request, 1)).toMatchObject({ error: { code: 'no-data' }, stats: { modelCalls: 0 } })
    expect(provider.callCount).toBe(0)
  })
  it.each([
    [calls(call('a', 'query_sql')), 'unknown-tool'],
    [calls(call('a', 'read_metrics', { accountId: 'PRIVATE' })), 'invalid-tool-arguments'],
    [calls(call('a', 'read_evidence', { evidenceIds: ['PRIVATE_CANONICAL_ID'] })), 'invalid-alias'],
    [calls(call('a', 'read_metrics'), call('a', 'read_metrics')), 'duplicate-tool-call'],
    [calls(...Array.from({ length: 5 }, (_, i) => call(`c${i}`, 'read_metrics'))), 'budget-exceeded'],
    [{ type: 'final', text: 'PRIVATE_RAW_OUTPUT' }, 'invalid-output'],
    [finalText(['PRIVATE_FAKE_CITATION']), 'invalid-citation']
  ])('preserves rejection %s as %s without output or local IDs', async (turn, code) => {
    const { service, pack } = setup([turn])
    const response = await service.ask(request, 1)
    expect(response).toMatchObject({ ok: false, error: { code } })
    expect(response).not.toHaveProperty('value')
    for (const privateText of ['PRIVATE', pack.scope.accountId, pack.scope.conversationId, ...Object.values(pack.evidence).flat().map(item => item.id)]) expect(JSON.stringify(response)).not.toContain(privateText)
  })
  it.each(['authentication', 'rate-limited', 'provider-unavailable'] as const)('preserves provider code %s', async code => {
    const { service } = setup([() => { throw new ToolCallingProviderError(code) }])
    expect(await service.ask(request, 1)).toMatchObject({ error: { code } })
  })
  it('cancels only the owning window, rejects busy work, ignores late output and releases its gate', async () => {
    let finish!: (response: ToolCallingResponse) => void
    const { service, provider } = setup([() => new Promise<ToolCallingResponse>(resolve => { finish = resolve }), finalText()])
    const pending = service.ask(request, 1)
    await Promise.resolve()
    expect(service.cancel(2)).toEqual({ cancelled: false })
    expect(await service.ask(request, 2)).toMatchObject({ error: { code: 'busy' } })
    expect(service.cancel(1)).toEqual({ cancelled: true })
    const response = await pending
    expect(response).toMatchObject({ error: { code: 'cancelled' } })
    expect(provider.signals[0].aborted).toBe(true)
    finish(finalText())
    expect(await service.ask(request, 1)).toMatchObject({ ok: true })
  })
  it('exposes timeout rather than generic failure', async () => {
    vi.useFakeTimers()
    const { service } = setup([() => new Promise<never>(() => {})])
    const pending = service.ask(request, 1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await pending).toMatchObject({ error: { code: 'timeout' } })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('covers SQLite → analysis → frozen Agent → canonical citations', async () => {
    const database = openDatabase(':memory:')
    try {
      const repository = new SqliteMessageRepository(database); const messages = demoMessages()
      repository.insertMessages(messages)
      const analysis = new InteractionAnalysisService(repository)
      const service = new EvidenceQuestionService({ analyzePeriod: value => analysis.analyzePeriod({ ...value, referenceTime: Date.parse('2026-09-11T12:00:00+08:00') }) },
        new MockToolCallingProvider([readSupportAndContext, groundedFinal]), status)
      const response = await service.ask({ ...request, accountId: messages[0].accountId, conversationId: messages[0].conversationId }, 1)
      expect(response.ok).toBe(true)
    } finally { database.close() }
  })
})
