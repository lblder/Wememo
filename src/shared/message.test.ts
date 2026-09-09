import { describe, expect, it } from 'vitest'

import { syntheticConversation } from './fixtures/synthetic-conversation'
import { sortMessages, type Message } from './message'

describe('synthetic conversation fixture', () => {
  it('uses unique message IDs', () => {
    const ids = syntheticConversation.map((message) => message.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sorts by timestamp and uses ID as a stable secondary key', () => {
    const timestamp = '2026-09-08T18:20:00+08:00'
    const sameTimeMessages: Message[] = [
      { ...syntheticConversation[0], id: 'synthetic-b', timestamp },
      { ...syntheticConversation[0], id: 'synthetic-a', timestamp }
    ]
    const unsorted = [syntheticConversation[3], ...sameTimeMessages, syntheticConversation[0]]

    expect(sortMessages(unsorted).map((message) => message.id)).toEqual([
      'synthetic-001',
      'synthetic-004',
      'synthetic-a',
      'synthetic-b'
    ])
  })

  it('has a non-empty conversationId on every message', () => {
    expect(syntheticConversation.every((message) => message.conversationId.trim().length > 0)).toBe(true)
  })

  it('only uses incoming or outgoing directions', () => {
    const allowedDirections = new Set(['incoming', 'outgoing'])

    expect(syntheticConversation.every((message) => allowedDirections.has(message.direction))).toBe(true)
  })
})

