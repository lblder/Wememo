import { describe, expect, it } from 'vitest'
import { validateAnalysisContextPack } from './analysis-context-validation'
import { ANALYSIS_CONTEXT_VERSION, type AnalysisContextPack } from './analysis-context'
import { DEFAULT_ANALYSIS_POLICY } from './analysis-policy'

function pack() {
  const metrics = {
    totalMessages: 1, incoming: { messageCount: 1, averageMessageLength: 5 },
    outgoing: { messageCount: 0, averageMessageLength: 0 }, activeDays: 1,
    sessions: { totalSessions: 1, incomingStartedSessions: 1, outgoingStartedSessions: 0, incomingStartedRatio: 1, outgoingStartedRatio: 0 },
    replies: { incomingToOutgoingCount: 0, outgoingToIncomingCount: 0, incomingToOutgoingMedianMs: null, outgoingToIncomingMedianMs: null },
    medianSessionDurationMs: 0
  }
  const change = { previous: 1, recent: 1, absoluteChange: 0, relativeChange: 0 }
  const ratioChange = { previous: 1, recent: 1, percentagePointChange: 0 }
  const nullableChange = { previous: null, recent: null, absoluteChange: null, relativeChange: null }
  const value: AnalysisContextPack = {
    version: ANALYSIS_CONTEXT_VERSION, scope: { accountId: 'a1', conversationId: 'c1' },
    generatedAt: 200, policy: DEFAULT_ANALYSIS_POLICY,
    windows: { previous: { startTime: 0, endTime: 100, label: 'previous' }, recent: { startTime: 100, endTime: 200, label: 'recent' } },
    metrics: { previous: metrics, recent: metrics, changes: {
      totalMessages: change, incomingMessages: change, outgoingMessages: change,
      activeDays: change, totalSessions: change, incomingStartedRatio: ratioChange, outgoingStartedRatio: ratioChange,
      incomingToOutgoingMedianMs: nullableChange, outgoingToIncomingMedianMs: nullableChange,
      incomingAverageMessageLength: change, outgoingAverageMessageLength: change
    } },
    coverage: { analyzedMessageCount: 2, previousMessageCount: 1, recentMessageCount: 1, previousActiveDays: 1, recentActiveDays: 1 },
    observations: [{ id: 'interaction-decline', title: '观察', status: 'insufficient', summary: '数据不足', evidenceIds: ['s1'] }],
    evidence: {
      metricSupport: [], metricCounter: [], messageSupport: [], messageCounter: [], semanticSupport: [], semanticCounter: [],
      semanticContext: [{ id: 's1', kind: 'semantic', category: 'workload', direction: 'context', label: '工作安排',
        confidence: 0.7, ruleId: 'semantic-v1:workload', messageIds: ['m1'], excerpt: '工作项目忙', timestamp: 150, senderId: 'other' }]
    }
  }
  return JSON.parse(JSON.stringify(value))
}

describe('validateAnalysisContextPack', () => {
  it('accepts a complete JSON round trip', () => {
    const value = pack()
    expect(validateAnalysisContextPack(value)).toEqual(value)
  })
  it.each(['version', 'scope', 'generatedAt', 'windows', 'metrics', 'coverage', 'evidence', 'observations', 'policy'])(
    'rejects missing %s', (key) => {
      const value = pack()
      delete value[key]
      expect(() => validateAnalysisContextPack(value)).toThrow()
    }
  )
  it.each([null, 'v2', 1])('rejects illegal version %s', (version) => {
    const value = pack(); value.version = version
    expect(() => validateAnalysisContextPack(value)).toThrow('version')
  })
  it.each([NaN, Infinity, -1, 'today', new Date(), undefined])('rejects illegal generatedAt %s', (generatedAt) => {
    const value = pack(); value.generatedAt = generatedAt
    expect(() => validateAnalysisContextPack(value)).toThrow('generatedAt')
  })
  it.each([
    ['scope', 'accountId', ''], ['policy', 'version', 'policy-v2'],
    ['policy', 'sessionGapMs', 1000], ['policy', 'minimumMessagesPerPeriod', 1],
    ['coverage', 'recentMessageCount', -1]
  ])('rejects invalid %s.%s', (group, key, invalid) => {
    const value = pack(); value[group][key] = invalid
    expect(() => validateAnalysisContextPack(value)).toThrow()
  })
  it('rejects missing nested metric fields', () => {
    const value = pack(); delete value.metrics.previous.replies
    expect(() => validateAnalysisContextPack(value)).toThrow('replies')
  })
  it('rejects non-finite metric values', () => {
    const value = pack(); value.metrics.changes.totalMessages.relativeChange = Infinity
    expect(() => validateAnalysisContextPack(value)).toThrow('relativeChange')
  })
  it('rejects inconsistent coverage', () => {
    const value = pack(); value.coverage.analyzedMessageCount++
    expect(() => validateAnalysisContextPack(value)).toThrow('coverage')
  })
  it('rejects nonadjacent windows', () => {
    const value = pack(); value.windows.recent.startTime++
    expect(() => validateAnalysisContextPack(value)).toThrow('windows')
  })
  it('rejects semantic context in the support bucket', () => {
    const value = pack(); value.evidence.semanticSupport = value.evidence.semanticContext; value.evidence.semanticContext = []
    expect(() => validateAnalysisContextPack(value)).toThrow('direction')
  })
  it('rejects background relabeled as support', () => {
    const value = pack(); const item = value.evidence.semanticContext.pop(); item.direction = 'support'; value.evidence.semanticSupport.push(item)
    expect(() => validateAnalysisContextPack(value)).toThrow('background')
  })
  it('rejects missing semantic provenance', () => {
    const value = pack(); value.evidence.semanticContext[0].messageIds = []
    expect(() => validateAnalysisContextPack(value)).toThrow('messageIds')
  })
  it('rejects unknown semantic rule versions', () => {
    const value = pack(); value.evidence.semanticContext[0].ruleId = 'unversioned'
    expect(() => validateAnalysisContextPack(value)).toThrow('rule version')
  })
  it('rejects semantic evidence outside the policy window', () => {
    const value = pack(); value.evidence.semanticContext[0].timestamp = value.windows.recent.endTime
    expect(() => validateAnalysisContextPack(value)).toThrow('outside recent')
  })
  it('rejects duplicate evidence IDs', () => {
    const value = pack(); value.evidence.semanticContext.push(value.evidence.semanticContext[0])
    expect(() => validateAnalysisContextPack(value)).toThrow('duplicate evidence')
  })
  it('rejects dangling observation references', () => {
    const value = pack(); value.observations[0].evidenceIds.push('missing')
    expect(() => validateAnalysisContextPack(value)).toThrow('unknown evidence')
  })
  it.each(['messages', 'allMessages', 'entireConversation'])('rejects extra chat field %s', (key) => {
    const value = pack(); value[key] = ['private text']
    expect(() => validateAnalysisContextPack(value)).toThrow('unexpected field')
  })
  it.each([new Map(), new Set(), new Date(), () => 1])('rejects runtime objects/functions', (invalid) => {
    const value = pack(); value.metrics.previous = invalid
    expect(() => validateAnalysisContextPack(value)).toThrow('plain JSON object')
  })
  it('rejects nested extra data', () => {
    const value = pack(); value.evidence.semanticContext[0].allMessages = ['private text']
    expect(() => validateAnalysisContextPack(value)).toThrow('unexpected field')
  })
})
