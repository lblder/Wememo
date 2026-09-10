import { describe, expect, it } from 'vitest'

import {
  MAX_MESSAGE_LIMIT,
  resolveMessageLimit,
  validateMessageQuery
} from './message-query'

describe('message query contract', () => {
  it('uses the default limit', () => {
    expect(resolveMessageLimit()).toBe(100)
  })

  it('caps excessive limits', () => {
    expect(
      resolveMessageLimit(1000)
    ).toBe(MAX_MESSAGE_LIMIT)
  })

  it('rejects an invalid scope', () => {
    expect(() =>
      validateMessageQuery({
        accountId: '',
        conversationId: 'conversation-1'
      })
    ).toThrow('accountId 不能为空')
  })

  it('rejects an inverted time range', () => {
    expect(() =>
      validateMessageQuery({
        accountId: 'account-1',
        conversationId: 'conversation-1',
        startTime: 200,
        endTime: 100
      })
    ).toThrow(
      'startTime 不能大于 endTime'
    )
  })
})