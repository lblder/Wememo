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
  compareInteractionPeriods
} from './period-comparison'

function createMessage(
  id: string,
  timestamp: number,
  direction: MessageDirection,
  text = '测试消息'
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
  'compareInteractionPeriods',
  () => {
    it('splits messages into previous and recent windows', () => {
      const referenceTime =
        Date.parse(
          '2026-09-10T12:00:00+08:00'
        )

      const day =
        24 * 60 * 60 * 1000

      const messages = [
        createMessage(
          'previous-1',
          referenceTime - 10 * day,
          'incoming'
        ),

        createMessage(
          'previous-2',
          referenceTime - 9 * day,
          'outgoing'
        ),

        createMessage(
          'recent-1',
          referenceTime - 3 * day,
          'incoming'
        ),

        createMessage(
          'recent-2',
          referenceTime - 2 * day,
          'outgoing'
        ),

        createMessage(
          'recent-3',
          referenceTime - day,
          'incoming'
        )
      ]

      const result =
        compareInteractionPeriods(
          messages,
          referenceTime
        )

      expect(
        result.previous.totalMessages
      ).toBe(2)

      expect(
        result.recent.totalMessages
      ).toBe(3)

      expect(
        result.changes
          .totalMessages
          .absoluteChange
      ).toBe(1)

      expect(
        result.changes
          .totalMessages
          .relativeChange
      ).toBe(0.5)
    })

    it('uses the shared boundary only in the recent window', () => {
      const referenceTime =
        Date.parse(
          '2026-09-10T12:00:00+08:00'
        )

      const sevenDays =
        7 * 24 * 60 * 60 * 1000

      const boundary =
        referenceTime - sevenDays

      const messages = [
        createMessage(
          'boundary',
          boundary,
          'incoming'
        )
      ]

      const result =
        compareInteractionPeriods(
          messages,
          referenceTime
        )

      expect(
        result.previous.totalMessages
      ).toBe(0)

      expect(
        result.recent.totalMessages
      ).toBe(1)
    })

    it('excludes messages at recent endTime', () => {
      const referenceTime =
        Date.parse(
          '2026-09-10T12:00:00+08:00'
        )

      const messages = [
        createMessage(
          'at-reference',
          referenceTime,
          'incoming'
        )
      ]

      const result =
        compareInteractionPeriods(
          messages,
          referenceTime
        )

      expect(
        result.recent.totalMessages
      ).toBe(0)
    })

    it('returns null relative change when previous is zero', () => {
      const referenceTime =
        Date.parse(
          '2026-09-10T12:00:00+08:00'
        )

      const messages = [
        createMessage(
          'recent',
          referenceTime - 1000,
          'incoming'
        )
      ]

      const result =
        compareInteractionPeriods(
          messages,
          referenceTime
        )

      expect(
        result.changes
          .totalMessages
          .previous
      ).toBe(0)

      expect(
        result.changes
          .totalMessages
          .recent
      ).toBe(1)

      expect(
        result.changes
          .totalMessages
          .relativeChange
      ).toBeNull()
    })

    it('calculates percentage-point change for starter ratio', () => {
      const referenceTime =
        Date.parse(
          '2026-09-10T12:00:00+08:00'
        )

      const day =
        24 * 60 * 60 * 1000

      const messages = [
        createMessage(
          'p1',
          referenceTime - 10 * day,
          'incoming'
        ),

        createMessage(
          'r1',
          referenceTime - 3 * day,
          'outgoing'
        )
      ]

      const result =
        compareInteractionPeriods(
          messages,
          referenceTime
        )

      expect(
        result.previous.sessions
          .incomingStartedRatio
      ).toBe(1)

      expect(
        result.recent.sessions
          .incomingStartedRatio
      ).toBe(0)

      expect(
        result.changes
          .incomingStartedRatio
          .percentagePointChange
      ).toBe(-1)
    })
  }
)