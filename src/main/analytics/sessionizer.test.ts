import {
  describe,
  expect,
  it
} from 'vitest'

import {
  syntheticConversation
} from '../../shared/fixtures/synthetic-conversation'

import type {
  CanonicalMessage
} from '../../shared/message'

import {
  DEFAULT_SESSION_GAP_MS,
  sessionizeConversation
} from './sessionizer'

function createMessage(
  id: string,
  timestamp: number
): CanonicalMessage {
  return {
    ...syntheticConversation[0],
    id,
    sourceMessageId: id,
    timestamp
  }
}

describe(
  'sessionizeConversation',
  () => {
    it('keeps the D1 synthetic conversation in one session', () => {
      const sessions =
        sessionizeConversation(
          syntheticConversation
        )

      expect(sessions).toHaveLength(1)

      expect(
        sessions[0].messageCount
      ).toBe(
        syntheticConversation.length
      )

      expect(
        sessions[0].starterDirection
      ).toBe('incoming')
    })

    it('splits when the gap is greater than 30 minutes', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm1',
          start
        ),

        createMessage(
          'm2',
          start + 10 * 60 * 1000
        ),

        createMessage(
          'm3',
          start + 41 * 60 * 1000
        )
      ]

      const sessions =
        sessionizeConversation(messages)

      expect(sessions).toHaveLength(2)

      expect(
        sessions[0].messageIds
      ).toEqual(['m1', 'm2'])

      expect(
        sessions[1].messageIds
      ).toEqual(['m3'])
    })

    it('does not split when the gap equals 30 minutes', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm1',
          start
        ),

        createMessage(
          'm2',
          start +
            DEFAULT_SESSION_GAP_MS
        )
      ]

      expect(
        sessionizeConversation(messages)
      ).toHaveLength(1)
    })

    it('sorts input before sessionizing', () => {
      const start =
        Date.parse(
          '2026-09-10T10:00:00+08:00'
        )

      const messages = [
        createMessage(
          'm2',
          start + 5000
        ),
        createMessage(
          'm1',
          start
        )
      ]

      const sessions =
        sessionizeConversation(messages)

      expect(
        sessions[0].messageIds
      ).toEqual([
        'm1',
        'm2'
      ])
    })

    it('rejects messages from multiple conversations', () => {
      const messages:
        CanonicalMessage[] = [
          {
            ...syntheticConversation[0]
          },
          {
            ...syntheticConversation[1],
            conversationId:
              'another-conversation'
          }
        ]

      expect(() =>
        sessionizeConversation(messages)
      ).toThrow(
        'sessionizeConversation 只能处理同一账号、同一会话'
      )
    })
  }
)