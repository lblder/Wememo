import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateReliabilityRun, runReliabilityEvaluation, summarizeReliability, type ProviderFactory, type ReliabilityMode } from './evaluation'
import { RELIABILITY_CASES } from './cases'
import { reliabilityFixtures } from './fixtures'
import { createMockEvaluationProviders } from '../mock-evaluation-providers'
import { demoPack } from '../../reasoning/reasoning-test-fixtures'
import { emptyPack, call, calls, finalText, catalogFrom } from '../../evidence-agent/agent-test-fixtures'
import { ToolCallingProviderError } from '../../evidence-agent/tool-calling-provider'
import { ProviderRequestError } from '../../providers/provider-request-error'
const factory: ProviderFactory = () => createMockEvaluationProviders()
const input = (mode: ReliabilityMode = 'agent') => ({ testCase: RELIABILITY_CASES[0], repeatIndex: 1, mode, variant: 'V0' as const,
  contextPack: demoPack(), providerId: 'mock', modelId: 'mock' })
afterEach(() => vi.useRealTimers())
describe('D6 frozen-runtime evaluation', () => {
  it('runs all 80 paired cases; separates Normal/Stress and retains null unscored quality', async () => {
    const fixtures = reliabilityFixtures(readFileSync('fixtures/import/sample-conversation.json', 'utf8'))
    const result = await runReliabilityEvaluation(fixtures, factory, { providerId: 'mock', modelId: 'mock' })
    expect(result.completedRuns).toBe(80)
    expect(result.records.filter(row => row.set === 'normal')).toHaveLength(60)
    expect(result.records.filter(row => row.set === 'stress')).toHaveLength(20)
    expect(result.records.every(row => row.endToEndPass)).toBe(true)
    expect(result.records.filter(row => row.mode === 'direct').every(row => row.modelCalls === 1)).toBe(true)
    expect(result.records.filter(row => row.mode === 'agent').every(row => row.modelCalls === 2 && row.toolCalls === 1)).toBe(true)
    expect(result.qualityScoring).toBe('pending-human-review')
    for (const item of result.reviews) {
      expect(Object.values(item.scores)).toEqual([null, null, null, null])
      expect(item).not.toHaveProperty('mode')
      expect(item.evidence.every(e => e.id.startsWith('review-evidence-'))).toBe(true)
    }
    const metrics = JSON.stringify(result.records)
    for (const id of [fixtures.demo.scope.accountId, fixtures.demo.scope.conversationId, ...Object.values(fixtures.demo.evidence).flat().map(item => item.id)]) expect(metrics).not.toContain(id)
    expect(metrics).not.toContain('excerpt')
  })
  it('rotates variant and path order instead of putting V0 first every repeat', async () => {
    const fixtures = reliabilityFixtures(readFileSync('fixtures/import/sample-conversation.json', 'utf8'))
    const result = await runReliabilityEvaluation(fixtures, factory, { providerId: 'mock', modelId: 'mock', cases: RELIABILITY_CASES.slice(0, 1), variants: ['V0', 'V1', 'V2', 'V3'] })
    expect(result.records).toHaveLength(24)
    expect(result.records.filter((_, i) => i % 8 === 0).map(row => row.promptVariant)).toEqual(['V0', 'V1', 'V2'])
    expect(result.records.filter(row => row.promptVariant === 'V0').map(row => row.mode)).toEqual(['direct', 'agent', 'agent', 'direct', 'direct', 'agent'])
  })
  it.each(['direct', 'agent'] as const)('observes stages and conditional denominators on %s without repairing output', async mode => {
    let text = 'PRIVATE_INVALID_JSON'
    const providers = createMockEvaluationProviders()
    providers.direct.generate = async () => ({ providerId: 'mock', text })
    providers.agent.generate = async () => ({ type: 'final', text })
    const json = await evaluateReliabilityRun(input(mode), () => providers)
    text = JSON.stringify({ PRIVATE_EXTRA: 'PRIVATE_VALUE' })
    const fields = await evaluateReliabilityRun(input(mode), () => providers)
    text = finalText(['PRIVATE_UNKNOWN']).type === 'final' ? (finalText(['PRIVATE_UNKNOWN']) as { text: string }).text : ''
    const citation = await evaluateReliabilityRun(input(mode), () => providers)
    expect(json.record).toMatchObject({ failureCode: 'invalid_json', jsonPass: false, schemaPass: null })
    expect(fields.record).toMatchObject({ failureCode: 'missing_field', jsonPass: true, schemaPass: false, citationScopePass: null })
    expect(citation.record).toMatchObject({ failureCode: 'unknown_citation', schemaPass: true, citationScopePass: false, citationDirectionPass: null })
    const summary = summarizeReliability([json.record, fields.record, citation.record]).normal.V0[mode]
    expect(summary.funnel.schemaPass).toEqual({ passed: 1, total: 2, rate: .5 })
    expect(summary.funnel.citationDirectionPass.total).toBe(0)
    expect(JSON.stringify([json, fields, citation])).not.toContain('PRIVATE')
    expect([json, fields, citation].every(item => !item.review)).toBe(true)
  })
  it('catalog-only citation is undelivered, even when the catalog contains the alias', async () => {
    const providers = createMockEvaluationProviders()
    providers.agent.generate = async request => finalText([catalogFrom(request).find(item => item.direction === 'support')!.id])
    const { record } = await evaluateReliabilityRun(input(), () => providers)
    expect(record).toMatchObject({ failureCode: 'undelivered_citation', deliveredCount: 0, toolCalls: 0, evidenceReadPass: false })
  })
  it.each(['finding_without_support', 'alternative_support_only', 'alternative_contains_support'] as const)('keeps valid tool reads distinct from final direction failure %s', async failure => {
    const providers = createMockEvaluationProviders(); const original = providers.agent.generate
    providers.agent.generate = async (request, options) => {
      if (!request.messages.some(item => item.role === 'tool')) return original(request, options)
      const catalog = catalogFrom(request); const support = catalog.find(item => item.direction === 'support')!.id; const context = catalog.find(item => item.direction === 'context')!.id
      return failure === 'finding_without_support' ? finalText([context]) : finalText([support], failure === 'alternative_support_only' ? [support] : [support, context])
    }
    const { record } = await evaluateReliabilityRun(input(), () => providers)
    expect(record).toMatchObject({ failureCode: failure, citationScopePass: true, citationDirectionPass: false, toolCalls: 1, evidenceReadCalls: 1, evidenceReadPass: true, failurePhase: 'final-citation' })
  })
  it('preflights a whole batch before any read and identifies tool selection failure', async () => {
    const providers = createMockEvaluationProviders()
    providers.agent.generate = async request => calls(call('a', 'read_evidence', { evidenceIds: [catalogFrom(request)[0].id] }), call('b', 'query_sql'))
    const { record } = await evaluateReliabilityRun(input(), () => providers)
    expect(record).toMatchObject({ failureCode: 'unknown_tool', toolProposals: 2, toolCalls: 0, deliveredCount: 0, jsonPass: null, failurePhase: 'tool-selection' })
  })
  it.each([
    [calls(call('a', 'read_metrics', { scope: 'PRIVATE' })), 'tool_argument_failure'],
    [calls(call('a', 'read_evidence', { evidenceIds: ['PRIVATE'] })), 'invalid_tool_alias'],
    [calls(call('a', 'read_metrics'), call('a', 'read_metrics')), 'duplicate_tool_call'],
    [calls(...Array.from({ length: 5 }, (_, i) => call(`a${i}`, 'read_metrics'))), 'budget_exceeded']
  ] as const)('records rejected tool proposals without executing %s', async (response, failureCode) => {
    const providers = createMockEvaluationProviders(); providers.agent.generate = async () => response
    const { record } = await evaluateReliabilityRun(input(), () => providers)
    expect(record).toMatchObject({ failureCode, toolCalls: 0, deliveredCount: 0, schemaPass: null })
  })
  it('does not execute tool requests on the third model turn', async () => {
    const providers = createMockEvaluationProviders(); let turns = 0
    providers.agent.generate = async () => calls(call(`turn-${++turns}`, 'read_metrics'))
    const { record } = await evaluateReliabilityRun(input(), () => providers)
    expect(record).toMatchObject({ failureCode: 'budget_exceeded', modelCalls: 3, toolCalls: 2, jsonPass: null })
  })
  it.each(['direct', 'agent'] as const)('records a 429 failure without retry on %s', async mode => {
    const providers = createMockEvaluationProviders(); let attempts = 0
    providers.direct.generate = async () => { attempts++; throw new ProviderRequestError('rate-limited') }
    providers.agent.generate = async () => { attempts++; throw new ToolCallingProviderError('rate-limited') }
    const { record } = await evaluateReliabilityRun(input(mode), () => providers)
    expect(record).toMatchObject({ failureCode: 'provider_error', providerPass: false, modelCalls: 1, jsonPass: null, runtimeFailureCode: 'rate-limited' })
    expect(attempts).toBe(1)
  })
  it.each(['direct', 'agent'] as const)('no-data exits locally on %s', async mode => {
    const create = vi.fn(factory)
    const { record } = await evaluateReliabilityRun({ ...input(mode), contextPack: emptyPack() }, create)
    expect(record).toMatchObject({ failureCode: 'no_data', providerPass: null, modelCalls: 0, jsonPass: null })
    expect(create).not.toHaveBeenCalled()
  })
  it.each(['direct', 'agent'] as const)('times out a hanging provider on %s and aborts its signal', async mode => {
    vi.useFakeTimers(); let seen!: AbortSignal
    const create: ProviderFactory = signal => {
      seen = signal
      const providers = createMockEvaluationProviders()
      providers.direct.generate = () => new Promise<never>(() => {})
      providers.agent.generate = (_request, options) => { seen = options.signal; return new Promise<never>(() => {}) }
      return providers
    }
    const pending = evaluateReliabilityRun(input(mode), create)
    await vi.advanceTimersByTimeAsync(mode === 'agent' ? 60000 : 120000)
    expect((await pending).record).toMatchObject({ failureCode: 'timeout', endToEndPass: false })
    expect(seen.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['direct', 'agent'] as const)('cancels and discards late private output on %s', async mode => {
    const abort = new AbortController(); let complete!: () => void
    const create: ProviderFactory = () => {
      const providers = createMockEvaluationProviders()
      providers.direct.generate = () => new Promise(resolve => { complete = () => resolve({ providerId: 'mock', text: 'PRIVATE_LATE' }) })
      providers.agent.generate = () => new Promise(resolve => { complete = () => resolve({ type: 'final', text: 'PRIVATE_LATE' }) })
      return providers
    }
    const pending = evaluateReliabilityRun(input(mode), create, abort.signal)
    for (let i = 0; i < 8; i++) await Promise.resolve()
    abort.abort(); const response = await pending; const saved = JSON.stringify(response)
    expect(response.record).toMatchObject({ failureCode: 'cancelled', providerResponses: 0, jsonPass: null })
    complete(); for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(JSON.stringify(response)).toBe(saved)
  })
  it('stops the schedule after cancellation while keeping completed rows', async () => {
    const abort = new AbortController(); const fixtures = reliabilityFixtures(readFileSync('fixtures/import/sample-conversation.json', 'utf8'))
    const report = await runReliabilityEvaluation(fixtures, factory, { providerId: 'mock', modelId: 'mock', signal: abort.signal, onRecord: () => abort.abort() })
    expect(report).toMatchObject({ completedRuns: 1, plannedRuns: 80, interrupted: true })
  })
})
