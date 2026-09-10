import { describe, expect, it } from 'vitest'

import { syntheticConversation } from './fixtures/synthetic-conversation'
import {
  MessageValidationError,
  validateCanonicalMessage
} from './message-validation'

describe('validateCanonicalMessage', () => {
  it('accepts a valid canonical message', () => {
    const message = syntheticConversation[0]

    expect(validateCanonicalMessage(message)).toEqual(message)
  })

  it('rejects an invalid direction', () => {
    const message = {
      ...syntheticConversation[0],
      direction: 'left'
    }

    expect(() => validateCanonicalMessage(message)).toThrow(
      MessageValidationError
    )
  })

  it('rejects an empty accountId', () => {
    const message = {
      ...syntheticConversation[0],
      accountId: ''
    }

    expect(() => validateCanonicalMessage(message)).toThrow(
      'accountId 不能为空'
    )
  })

  it('rejects an empty sourceMessageId', () => {
    const message = {
      ...syntheticConversation[0],
      sourceMessageId: ''
    }

    expect(() => validateCanonicalMessage(message)).toThrow(
      'sourceMessageId 不能为空'
    )
  })

  it('rejects an invalid timestamp', () => {
    const message = {
      ...syntheticConversation[0],
      timestamp: Number.NaN
    }

    expect(() => validateCanonicalMessage(message)).toThrow(
      'timestamp 必须是有效数字'
    )
  })

  it('rejects empty text', () => {
    const message = {
      ...syntheticConversation[0],
      text: '   '
    }

    expect(() => validateCanonicalMessage(message)).toThrow(
      'text 不能为空'
    )
  })

  it('rejects null and arrays', () => {
    expect(() => validateCanonicalMessage(null)).toThrow(
      MessageValidationError
    )

    expect(() => validateCanonicalMessage([])).toThrow(
      MessageValidationError
    )
  })
})