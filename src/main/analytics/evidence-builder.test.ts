import { readFileSync } from 'node:fs'
import { syntheticConversation } from '../../shared/fixtures/synthetic-conversation'
import { parseJsonImportDocument } from '../data-sources/json-message-source'
import { compareInteractionPeriods } from './period-comparison'
import {
  describe,
  expect,
  it
} from 'vitest'

import type {
  InteractionPeriodComparison
} from '../../shared/interaction-analysis'

import {
  buildInteractionEvidenceReport
} from './evidence-builder'

function createComparison():
  InteractionPeriodComparison {
  return {
    windows: {
      previous: {
        startTime: 0,
        endTime: 100,
        label: '之前7天'
      },

      recent: {
        startTime: 100,
        endTime: 200,
        label: '最近7天'
      }
    },

    previous: {
      totalMessages: 100,

      incoming: {
        messageCount: 50,
        averageMessageLength: 10
      },

      outgoing: {
        messageCount: 50,
        averageMessageLength: 10
      },

      activeDays: 7,

      sessions: {
        totalSessions: 20,
        incomingStartedSessions: 10,
        outgoingStartedSessions: 10,
        incomingStartedRatio: 0.5,
        outgoingStartedRatio: 0.5
      },

      replies: {
        incomingToOutgoingCount: 10,
        incomingToOutgoingMedianMs:
          5 * 60_000,

        outgoingToIncomingCount: 10,
        outgoingToIncomingMedianMs:
          5 * 60_000
      },

      medianSessionDurationMs:
        10 * 60_000
    },

    recent: {
      totalMessages: 60,

      incoming: {
        messageCount: 25,
        averageMessageLength: 12
      },

      outgoing: {
        messageCount: 35,
        averageMessageLength: 10
      },

      activeDays: 7,

      sessions: {
        totalSessions: 12,
        incomingStartedSessions: 3,
        outgoingStartedSessions: 9,
        incomingStartedRatio: 0.25,
        outgoingStartedRatio: 0.75
      },

      replies: {
        incomingToOutgoingCount: 8,
        incomingToOutgoingMedianMs:
          6 * 60_000,

        outgoingToIncomingCount: 7,
        outgoingToIncomingMedianMs:
          12 * 60_000
      },

      medianSessionDurationMs:
        8 * 60_000
    },

    changes: {
      totalMessages: {
        previous: 100,
        recent: 60,
        absoluteChange: -40,
        relativeChange: -0.4
      },

      incomingMessages: {
        previous: 50,
        recent: 25,
        absoluteChange: -25,
        relativeChange: -0.5
      },

      outgoingMessages: {
        previous: 50,
        recent: 35,
        absoluteChange: -15,
        relativeChange: -0.3
      },

      activeDays: {
        previous: 7,
        recent: 7,
        absoluteChange: 0,
        relativeChange: 0
      },

      totalSessions: {
        previous: 20,
        recent: 12,
        absoluteChange: -8,
        relativeChange: -0.4
      },

      incomingStartedRatio: {
        previous: 0.5,
        recent: 0.25,
        percentagePointChange: -0.25
      },

      outgoingStartedRatio: {
        previous: 0.5,
        recent: 0.75,
        percentagePointChange: 0.25
      },

      incomingToOutgoingMedianMs: {
        previous: 5 * 60_000,
        recent: 6 * 60_000,
        absoluteChange: 60_000,
        relativeChange: 0.2
      },

      outgoingToIncomingMedianMs: {
        previous: 5 * 60_000,
        recent: 12 * 60_000,
        absoluteChange: 7 * 60_000,
        relativeChange: 1.4
      },

      incomingAverageMessageLength: {
        previous: 10,
        recent: 12,
        absoluteChange: 2,
        relativeChange: 0.2
      },

      outgoingAverageMessageLength: {
        previous: 10,
        recent: 10,
        absoluteChange: 0,
        relativeChange: 0
      }
    }
  }
}

describe(
  'buildInteractionEvidenceReport',
  () => {
    it('detects multiple decline signals', () => {
      const comparison =
        createComparison()

      const report =
        buildInteractionEvidenceReport({
          accountId: 'a1',
          conversationId: 'c1',
          analyzedMessageCount: 160,
          comparison,
          messages: []
        })

      const observation =
        report.observations[0]

      expect(
        observation.status
      ).toBe('detected')

      expect(
        observation.evidence.length
      ).toBeGreaterThanOrEqual(2)
    })

    it('keeps counter evidence', () => {
      const report =
        buildInteractionEvidenceReport({
          accountId: 'a1',
          conversationId: 'c1',
          analyzedMessageCount: 160,

          messages: [],

          comparison:
            createComparison()
        })

      expect(
        report.observations[0]
          .counterEvidence.length
      ).toBeGreaterThan(0)
    })

    it('marks insufficient data', () => {
      const comparison =
        createComparison()

      comparison.previous.totalMessages = 2
      comparison.recent.totalMessages = 3

      const report =
        buildInteractionEvidenceReport({
          accountId: 'a1',
          conversationId: 'c1',
          analyzedMessageCount: 5,

          messages: [],

          comparison
        })

      expect(
        report.observations[0].status
      ).toBe('insufficient')
    })
  }
)
it.each(['detected', 'not-detected', 'insufficient'] as const)(
  'attaches semantic context without changing %s metric status', (status) => {
    const comparison = createComparison()
    if (status === 'insufficient') comparison.previous.totalMessages = 0
    if (status === 'not-detected') {
      comparison.changes.totalMessages.relativeChange = 0
      comparison.changes.incomingMessages.relativeChange = 0
      comparison.changes.totalSessions.relativeChange = 0
      comparison.changes.incomingStartedRatio.percentagePointChange = 0
      comparison.changes.outgoingToIncomingMedianMs.relativeChange = 0
    }
    const input = { accountId: 'a1', conversationId: 'c1', analyzedMessageCount: 2, comparison }
    const messages = [
      { ...syntheticConversation[0], accountId: 'a1', conversationId: 'c1', id: 'context', timestamp: 110, text: '今天好累' },
      { ...syntheticConversation[0], accountId: 'a1', conversationId: 'c1', id: 'counter', timestamp: 120, text: '最近回复慢，因为工作太多，不是故意不回' }
    ]
    const baseline = buildInteractionEvidenceReport({ ...input, messages: [] }).observations[0]
    const enriched = buildInteractionEvidenceReport({ ...input, messages }).observations[0]
    expect(enriched.status).toBe(status)
    expect(enriched.status).toBe(baseline.status)
    expect(enriched.evidence).toEqual(baseline.evidence)
    expect(enriched.counterEvidence).toEqual(baseline.counterEvidence)
    expect(enriched.semanticEvidence).toEqual([
      expect.objectContaining({ category: 'fatigue', direction: 'context', messageIds: ['context'] })
    ])
    expect(enriched.counterSemanticEvidence.map((e) => e.category)).toEqual(['explicit-explanation', 'reassurance'])
  }
)


it('integrates the current Demo JSON with traceable semantic and message evidence', () => {
  const imported = parseJsonImportDocument(readFileSync('fixtures/import/sample-conversation.json', 'utf8'))
  expect(imported.rejected).toBe(0)
  const messages = imported.messages
  const comparison = compareInteractionPeriods(messages, Date.parse('2026-09-11T12:00:00+08:00'))
  const report = buildInteractionEvidenceReport({
    accountId: messages[0].accountId, conversationId: messages[0].conversationId,
    analyzedMessageCount: messages.length, messages, comparison
  })
  const observation = report.observations[0]
  expect(observation.evidence.length).toBeGreaterThan(0)
  expect(observation.messageEvidence.length).toBeGreaterThan(0)
  expect(observation.counterMessageEvidence.length).toBeGreaterThan(0)
  const semantic = [...observation.semanticEvidence, ...observation.counterSemanticEvidence]
  expect(semantic.map((e) => e.category)).toEqual(expect.arrayContaining([
    'workload', 'fatigue', 'explicit-explanation', 'reassurance'
  ]))
  for (const evidence of semantic) {
    const source = messages.find((m) => m.id === evidence.messageIds[0])!
    expect(source).toBeDefined()
    expect(evidence.excerpt).toBe(source.text)
    expect(evidence.timestamp).toBe(source.timestamp)
    expect(source.timestamp).toBeGreaterThanOrEqual(comparison.windows.recent.startTime)
    expect(source.timestamp).toBeLessThan(comparison.windows.recent.endTime)
    expect(source.direction).toBe('incoming')
  }
})
