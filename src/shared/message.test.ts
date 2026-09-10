import { describe, expect, it } from 'vitest'

import { syntheticConversation } from './fixtures/synthetic-conversation'
import { sortMessages, type CanonicalMessage } from './message'

describe('synthetic conversation fixture', () => {
  it('uses unique message IDs', () => {
    const ids = syntheticConversation.map((message) => message.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sorts by timestamp and uses ID as a stable secondary key', () => {
    const timestamp = Date.parse('2026-09-08T18:20:00+08:00')

    const sameTimeMessages: CanonicalMessage[] = [
      {
        ...syntheticConversation[0],
        id: 'synthetic-b',
        sourceMessageId: 'synthetic-b',
        timestamp
      },
      {
        ...syntheticConversation[0],
        id: 'synthetic-a',
        sourceMessageId: 'synthetic-a',
        timestamp
      }
    ]

    const unsorted = [
      syntheticConversation[3],
      ...sameTimeMessages,
      syntheticConversation[0]
    ]

    expect(sortMessages(unsorted).map((message) => message.id)).toEqual([
      'synthetic-001',
      'synthetic-004',
      'synthetic-a',
      'synthetic-b'
    ])
  })

  it('has a non-empty accountId and conversationId on every message', () => {
    expect(
      syntheticConversation.every(
        (message) =>
          message.accountId.trim().length > 0 &&
          message.conversationId.trim().length > 0
      )
    ).toBe(true)
  })

  it('has a non-empty sourceMessageId on every message', () => {
    expect(
      syntheticConversation.every(
        (message) => message.sourceMessageId.trim().length > 0
      )
    ).toBe(true)
  })

  it('uses valid numeric timestamps', () => {
    expect(
      syntheticConversation.every(
        (message) =>
          typeof message.timestamp === 'number' &&
          Number.isFinite(message.timestamp)
      )
    ).toBe(true)
  })

  it('only uses incoming or outgoing directions', () => {
    const allowedDirections = new Set(['incoming', 'outgoing'])

    expect(
      syntheticConversation.every((message) =>
        allowedDirections.has(message.direction)
      )
    ).toBe(true)
  })
})