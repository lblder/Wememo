import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GeneratedReasoning } from '../../shared/reasoning-ipc'
import { ANALYSIS_CONTEXT_VERSION } from '../../shared/analysis-context'
import { DEFAULT_ANALYSIS_POLICY } from '../../shared/analysis-policy'
import { INTERACTION_REASONING_VERSION } from '../../shared/interaction-reasoning'
import { ReasoningResultView } from './ReasoningPanel'

function result(): GeneratedReasoning {
  const direction = { messageCount: 0, averageMessageLength: 0 }
  const metrics = {
    totalMessages: 0, incoming: direction, outgoing: direction, activeDays: 0,
    sessions: { totalSessions: 0, incomingStartedSessions: 0, outgoingStartedSessions: 0, incomingStartedRatio: 0, outgoingStartedRatio: 0 },
    replies: { incomingToOutgoingCount: 0, incomingToOutgoingMedianMs: null, outgoingToIncomingCount: 0, outgoingToIncomingMedianMs: null },
    medianSessionDurationMs: null
  }
  const change = { previous: 0, recent: 0, absoluteChange: 0, relativeChange: null }
  const ratio = { previous: 0, recent: 0, percentagePointChange: 0 }
  return {
    providerId: 'deepseek', modelId: 'deepseek-flash',
    contextPack: {
      version: ANALYSIS_CONTEXT_VERSION, scope: { accountId: 'a', conversationId: 'c' }, generatedAt: 200,
      policy: DEFAULT_ANALYSIS_POLICY,
      windows: { previous: { startTime: 0, endTime: 100, label: 'previous' }, recent: { startTime: 100, endTime: 200, label: 'recent' } },
      metrics: { previous: metrics, recent: metrics, changes: {
        totalMessages: change, incomingMessages: change, outgoingMessages: change, activeDays: change, totalSessions: change,
        incomingStartedRatio: ratio, outgoingStartedRatio: ratio, incomingToOutgoingMedianMs: change,
        outgoingToIncomingMedianMs: change, incomingAverageMessageLength: change, outgoingAverageMessageLength: change
      } },
      coverage: { analyzedMessageCount: 0, previousMessageCount: 0, recentMessageCount: 0, previousActiveDays: 0, recentActiveDays: 0 },
      observations: [],
      evidence: {
        metricSupport: [{ id: 'metric-1', kind: 'metric', direction: 'support', metric: 'total-messages', label: '消息数量变化', previous: 10, recent: 5, change: -0.5, unit: 'count' }],
        metricCounter: [], messageSupport: [], messageCounter: [], semanticSupport: [], semanticCounter: [],
        semanticContext: [{ id: 'semantic-1', kind: 'semantic', category: 'workload', direction: 'context', label: '工作安排', confidence: 0.7,
          ruleId: 'semantic-v1:workload', messageIds: ['original-message-1'], excerpt: '<script>unsafe()</script> 工作忙', timestamp: 150, senderId: 'sender', senderName: '测试发送者' }]
      }
    },
    result: {
      version: INTERACTION_REASONING_VERSION, summary: '可观察的互动变化。',
      findings: [{ id: 'finding-1', claim: '消息数量下降。', evidenceIds: ['metric-1'], confidence: 'low' }],
      alternativeExplanations: [{ id: 'alternative-1', explanation: '工作可能是背景。', evidenceIds: ['semantic-1'] }],
      uncertainties: ['行为不等于心理。']
    }
  }
}

it('renders canonical evidence citations and escaped original text', () => {
  const html = renderToStaticMarkup(<ReasoningResultView value={result()} />)
  expect(html).toContain('metric-1')
  expect(html).toContain('semantic-1')
  expect(html).toContain('original-message-1')
  expect(html).toContain('测试发送者')
  expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('<details')
  expect(html).toContain('不确定性')
})
it('renders empty findings and alternatives without inventing claims', () => {
  const value = result(); value.result.findings = []; value.result.alternativeExplanations = []
  const html = renderToStaticMarkup(<ReasoningResultView value={value} />)
  expect(html).toContain('本次没有可引用的行为发现')
  expect(html).toContain('本次没有可引用的替代解释')
  expect(html).not.toContain('<details')
})
