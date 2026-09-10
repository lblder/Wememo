import { describe, expect, it } from 'vitest'

import { createCanonicalMessageId } from './message-identity'

describe('createCanonicalMessageId', () => {
  it('returns the same ID for the same identity', () => {
    const input = {
      source: 'json-import' as const,
      accountId: 'account-1',
      conversationId: 'conversation-1',
      sourceMessageId: 'message-1'
    }

    expect(createCanonicalMessageId(input)).toBe(
      createCanonicalMessageId(input)
    )
  })

  it('changes when conversation changes', () => {
    const first = createCanonicalMessageId({
      source: 'json-import',
      accountId: 'account-1',
      conversationId: 'conversation-a',
      sourceMessageId: 'message-1'
    })

    const second = createCanonicalMessageId({
      source: 'json-import',
      accountId: 'account-1',
      conversationId: 'conversation-b',
      sourceMessageId: 'message-1'
    })

    expect(first).not.toBe(second)
  })

  it('changes when account changes', () => {
    const first = createCanonicalMessageId({
      source: 'json-import',
      accountId: 'account-a',
      conversationId: 'conversation-1',
      sourceMessageId: 'message-1'
    })

    const second = createCanonicalMessageId({
      source: 'json-import',
      accountId: 'account-b',
      conversationId: 'conversation-1',
      sourceMessageId: 'message-1'
    })

    expect(first).not.toBe(second)
  })
})