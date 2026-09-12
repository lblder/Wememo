import {
  describe,
  expect,
  it
} from 'vitest'

import type {
  CanonicalMessage,
  MessageDirection
} from '../../shared/message'

import {
  syntheticConversation
} from '../../shared/fixtures/synthetic-conversation'

import {
  calculateInteractionMetrics
} from './interaction-metrics'

function createMessage(
  id: string,
  timestamp: number,
  direction: MessageDirection,
  text = '测试'
): CanonicalMessage {
  return {
    ...syntheticConversation[0],
    id,
    sourceMessageId: id,
    timestamp,
    direction,
    senderId:
      direction === 'incoming'
        ? 'other'
        : 'self',
    senderName:
      direction === 'incoming'
        ? '对方'
        : '我',
    text
  }
}

describe(
  'calculateInteractionMetrics',
  () => {
    it('returns zero metrics for an empty conversation', () => {
      const metrics =
        calculateInteractionMetrics([])

      expect(
        metrics.totalMessages
      ).toBe(0)

      expect(
        metrics.sessions.totalSessions
      ).toBe(0)

      expect(
        metrics.replies
          .incomingToOutgoingMedianMs
      ).toBeNull()
    })

    it('counts incoming and outgoing messages', () => {
      const metrics =
        calculateInteractionMetrics(
          syntheticConversation
        )

      expect(
        metrics.totalMessages
      ).toBe(14)

      expect(
        metrics.incoming.messageCount
      ).toBe(7)

      expect(
        metrics.outgoing.messageCount
      ).toBe(7)
    })

    it('counts active days', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm1',
          start,
          'incoming'
        ),

        createMessage(
          'm2',
          start +
            25 * 60 * 60 * 1000,
          'outgoing'
        )
      ]

      const metrics =
        calculateInteractionMetrics(
          messages,
          {
            timeZone: 'Asia/Shanghai'
          }
        )

      expect(
        metrics.activeDays
      ).toBe(2)
    })

    it('counts which side starts sessions', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm1',
          start,
          'incoming'
        ),

        createMessage(
          'm2',
          start + 60_000,
          'outgoing'
        ),

        createMessage(
          'm3',
          start +
            60 * 60 * 1000,
          'outgoing'
        )
      ]

      const metrics =
        calculateInteractionMetrics(
          messages
        )

      expect(
        metrics.sessions.totalSessions
      ).toBe(2)

      expect(
        metrics.sessions
          .incomingStartedSessions
      ).toBe(1)

      expect(
        metrics.sessions
          .outgoingStartedSessions
      ).toBe(1)

      expect(
        metrics.sessions
          .incomingStartedRatio
      ).toBe(0.5)

      expect(
        metrics.sessions
          .outgoingStartedRatio
      ).toBe(0.5)
    })

    it('measures reply latency on direction changes', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm1',
          start,
          'incoming'
        ),

        createMessage(
          'm2',
          start + 60_000,
          'incoming'
        ),

        createMessage(
          'm3',
          start + 4 * 60_000,
          'outgoing'
        ),

        createMessage(
          'm4',
          start + 10 * 60_000,
          'incoming'
        )
      ]

      const metrics =
        calculateInteractionMetrics(
          messages
        )

      expect(
        metrics.replies
          .incomingToOutgoingCount
      ).toBe(1)

      expect(
        metrics.replies
          .incomingToOutgoingMedianMs
      ).toBe(3 * 60_000)

      expect(
        metrics.replies
          .outgoingToIncomingCount
      ).toBe(1)

      expect(
        metrics.replies
          .outgoingToIncomingMedianMs
      ).toBe(6 * 60_000)
    })

    it('does not calculate replies across different sessions', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm1',
          start,
          'outgoing'
        ),

        createMessage(
          'm2',
          start +
            60 * 60 * 1000,
          'incoming'
        )
      ]

      const metrics =
        calculateInteractionMetrics(
          messages
        )

      expect(
        metrics.replies
          .outgoingToIncomingCount
      ).toBe(0)

      expect(
        metrics.replies
          .outgoingToIncomingMedianMs
      ).toBeNull()
    })

    it('calculates average message length by direction', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm1',
          start,
          'incoming',
          '你好'
        ),

        createMessage(
          'm2',
          start + 1000,
          'incoming',
          '今天好'
        ),

        createMessage(
          'm3',
          start + 2000,
          'outgoing',
          '好的'
        )
      ]

      const metrics =
        calculateInteractionMetrics(
          messages
        )

      expect(
        metrics.incoming
          .averageMessageLength
      ).toBe(2.5)

      expect(
        metrics.outgoing
          .averageMessageLength
      ).toBe(2)
    })
  }
)