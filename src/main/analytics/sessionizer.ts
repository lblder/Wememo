import { DEFAULT_ANALYSIS_POLICY } from '../../shared/analysis-policy'
import { createHash } from 'node:crypto'

import {
  sortMessages,
  type CanonicalMessage
} from '../../shared/message'

import type {
  ConversationSession
} from '../../shared/interaction-analysis'

export const DEFAULT_SESSION_GAP_MS =
  DEFAULT_ANALYSIS_POLICY.sessionGapMs

export const SESSIONIZER_VERSION =
  'gap-v1'

function createSessionId(
  messages: readonly CanonicalMessage[],
  gapMs: number
): string {
  const identity = JSON.stringify({
    version: SESSIONIZER_VERSION,
    gapMs,
    accountId: messages[0].accountId,
    conversationId:
      messages[0].conversationId,
    messageIds:
      messages.map(
        (message) => message.id
      )
  })

  return createHash('sha256')
    .update(identity, 'utf8')
    .digest('hex')
}

function buildSession(
  messages: readonly CanonicalMessage[],
  gapMs: number
): ConversationSession {
  const first = messages[0]
  const last =
    messages[messages.length - 1]

  const participantIds =
    Array.from(
      new Set(
        messages.map(
          (message) => message.senderId
        )
      )
    )

  return {
    id: createSessionId(
      messages,
      gapMs
    ),

    accountId: first.accountId,
    conversationId:
      first.conversationId,

    startTime: first.timestamp,
    endTime: last.timestamp,

    firstMessageId: first.id,
    lastMessageId: last.id,

    messageIds:
      messages.map(
        (message) => message.id
      ),

    participantIds,

    messageCount: messages.length,

    starterSenderId:
      first.senderId,

    starterDirection:
      first.direction
  }
}

/**
 * 将一个账号、一个会话中的消息划分为连续聊天 Session。
 *
 * 当前规则：
 *
 * 相邻消息间隔 > gapMs
 * → 开启新的 Session
 *
 * 相邻消息间隔 <= gapMs
 * → 属于同一个 Session
 */
export function sessionizeConversation(
  messages: readonly CanonicalMessage[],
  gapMs = DEFAULT_SESSION_GAP_MS
): ConversationSession[] {
  if (
    !Number.isFinite(gapMs) ||
    gapMs <= 0
  ) {
    throw new Error(
      'gapMs 必须是正数'
    )
  }

  if (messages.length === 0) {
    return []
  }

  const sorted =
    sortMessages(messages)

  const accountId =
    sorted[0].accountId

  const conversationId =
    sorted[0].conversationId

  const containsDifferentScope =
    sorted.some(
      (message) =>
        message.accountId !==
          accountId ||
        message.conversationId !==
          conversationId
    )

  if (containsDifferentScope) {
    throw new Error(
      'sessionizeConversation 只能处理同一账号、同一会话'
    )
  }

  const sessions:
    ConversationSession[] = []

  let current:
    CanonicalMessage[] = []

  for (const message of sorted) {
    const previous =
      current[current.length - 1]

    if (
      previous !== undefined &&
      message.timestamp -
        previous.timestamp >
        gapMs
    ) {
      sessions.push(
        buildSession(
          current,
          gapMs
        )
      )

      current = []
    }

    current.push(message)
  }

  if (current.length > 0) {
    sessions.push(
      buildSession(
        current,
        gapMs
      )
    )
  }

  return sessions
}