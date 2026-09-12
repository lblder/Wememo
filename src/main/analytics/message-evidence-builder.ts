import type {
  CanonicalMessage
} from '../../shared/message'

import type {
  InteractionPeriodComparison
} from '../../shared/interaction-analysis'

import type {
  EvidenceMessageRef,
  MessageEvidence
} from '../../shared/interaction-evidence'

import {
  sessionizeConversation
} from './sessionizer'

function toEvidenceMessage(
  message: CanonicalMessage
): EvidenceMessageRef {
  return {
    messageId: message.id,

    senderId: message.senderId,

    ...(message.senderName !== undefined
      ? { senderName: message.senderName }
      : {}),

    direction: message.direction,

    timestamp: message.timestamp,

    text: message.text
  }
}

function getRecentMessages(
  messages: readonly CanonicalMessage[],
  comparison: InteractionPeriodComparison
): CanonicalMessage[] {
  const {
    startTime,
    endTime
  } = comparison.windows.recent

  return messages
    .filter(
      (message) =>
        message.timestamp >= startTime &&
        message.timestamp < endTime
    )
    .sort(
      (left, right) =>
        left.timestamp -
          right.timestamp ||
        left.id.localeCompare(right.id)
    )
}

interface ReplyTransition {
  previous: CanonicalMessage
  current: CanonicalMessage
  latencyMs: number
}

/**
 * 找出同一 Session 中：
 *
 * 我方消息 → 对方回复
 *
 * 的实际回复间隔。
 */
function collectIncomingReplies(
  messages: readonly CanonicalMessage[]
): ReplyTransition[] {
  const sessions =
    sessionizeConversation(messages)

  const transitions: ReplyTransition[] =
    []

  for (const session of sessions) {
    const messageIds =
      new Set(session.messageIds)

    const sessionMessages =
      messages.filter(
        (message) =>
          messageIds.has(message.id)
      )

    for (
      let index = 1;
      index < sessionMessages.length;
      index += 1
    ) {
      const previous =
        sessionMessages[index - 1]

      const current =
        sessionMessages[index]

      if (
        previous.direction === 'outgoing' &&
        current.direction === 'incoming'
      ) {
        transitions.push({
          previous,
          current,

          latencyMs:
            current.timestamp -
            previous.timestamp
        })
      }
    }
  }

  return transitions
}

/**
 * 从原始聊天中构建可追溯的行为证据。
 *
 * 注意：
 * 这里只选择消息证据，
 * 不判断消息真正表达的心理含义。
 */
export function buildMessageEvidence(
  messages: readonly CanonicalMessage[],
  comparison: InteractionPeriodComparison
): {
  support: MessageEvidence[]
  counter: MessageEvidence[]
} {
  const recentMessages =
    getRecentMessages(
      messages,
      comparison
    )

  if (recentMessages.length === 0) {
    return {
      support: [],
      counter: []
    }
  }

  const support: MessageEvidence[] = []
  const counter: MessageEvidence[] = []

  /*
   * 1. 如果对方回复中位时间明显增加，
   * 找最近阶段中回复最慢的两个实际例子。
   */
  const replyChange =
    comparison.changes
      .outgoingToIncomingMedianMs

  if (
    replyChange.relativeChange !== null &&
    replyChange.relativeChange >= 0.5
  ) {
    const slowReplies =
      collectIncomingReplies(
        recentMessages
      )
        .sort(
          (left, right) =>
            right.latencyMs -
            left.latencyMs
        )
        .slice(0, 2)

    for (const reply of slowReplies) {
      support.push({
        id:
          `M-reply-${reply.previous.id}-${reply.current.id}`,

        kind: 'message',

        direction: 'support',

        evidenceType:
          'reply-latency',

        label:
          `对方回复间隔约 ${(
            reply.latencyMs /
            60_000
          ).toFixed(1)} 分钟`,

        messages: [
          toEvidenceMessage(
            reply.previous
          ),

          toEvidenceMessage(
            reply.current
          )
        ]
      })
    }
  }

  /*
   * 2. 如果对方主动发起比例下降，
   * 找最近阶段由“我方”发起的 Session 示例。
   */
  const initiativeChange =
    comparison.changes
      .incomingStartedRatio

  if (
    initiativeChange
      .percentagePointChange <= -0.15
  ) {
    const sessions =
      sessionizeConversation(
        recentMessages
      )

    const outgoingStarted =
      sessions
        .filter(
          (session) =>
            session.starterDirection ===
            'outgoing'
        )
        .slice(0, 2)

    for (const session of outgoingStarted) {
      const firstMessage =
        recentMessages.find(
          (message) =>
            message.id ===
            session.firstMessageId
        )

      if (!firstMessage) {
        continue
      }

      support.push({
        id:
          `M-session-${session.id}`,

        kind: 'message',

        direction: 'support',

        evidenceType:
          'session-starter',

        label:
          '最近阶段存在由我方主动开启的聊天 Session',

        messages: [
          toEvidenceMessage(
            firstMessage
          )
        ]
      })
    }
  }

  /*
   * 3. 如果最近仍然存在对方主动开启的 Session，
   * 将它作为反向证据保留。
   */
  const recentSessions =
    sessionizeConversation(
      recentMessages
    )

  const incomingStarted =
    recentSessions.find(
      (session) =>
        session.starterDirection ===
        'incoming'
    )

  if (incomingStarted) {
    const firstMessage =
      recentMessages.find(
        (message) =>
          message.id ===
          incomingStarted.firstMessageId
      )

    if (firstMessage) {
      counter.push({
        id:
          `C-session-${incomingStarted.id}`,

        kind: 'message',

        direction: 'counter',

        evidenceType:
          'session-starter',

        label:
          '最近阶段仍存在对方主动开启的聊天',

        messages: [
          toEvidenceMessage(
            firstMessage
          )
        ]
      })
    }
  }

  /*
   * 4. 如果对方平均消息长度增加，
   * 选取最近阶段较长的一条回复作为反向行为证据。
   */
  const lengthChange =
    comparison.changes
      .incomingAverageMessageLength

  if (
    lengthChange.relativeChange !== null &&
    lengthChange.relativeChange >= 0.1
  ) {
    const longestIncoming =
      recentMessages
        .filter(
          (message) =>
            message.direction ===
            'incoming'
        )
        .sort(
          (left, right) =>
            [...right.text].length -
            [...left.text].length
        )[0]

    if (longestIncoming) {
      counter.push({
        id:
          `C-long-${longestIncoming.id}`,

        kind: 'message',

        direction: 'counter',

        evidenceType:
          'long-reply',

        label:
          '最近阶段仍存在较完整的对方回复',

        messages: [
          toEvidenceMessage(
            longestIncoming
          )
        ]
      })
    }
  }

  return {
    support,
    counter
  }
}