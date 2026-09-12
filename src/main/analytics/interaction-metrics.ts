import type {
  CanonicalMessage,
  MessageDirection
} from '../../shared/message'

import type {
  InteractionMetrics
} from '../../shared/interaction-metrics'

import {
  sessionizeConversation
} from './sessionizer'

export interface InteractionMetricsOptions {
  sessionGapMs?: number
  timeZone?: string
}

function median(
  values: readonly number[]
): number | null {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort(
    (left, right) => left - right
  )

  const middle = Math.floor(
    sorted.length / 2
  )

  if (sorted.length % 2 === 1) {
    return sorted[middle]
  }

  return (
    sorted[middle - 1] +
    sorted[middle]
  ) / 2
}

function average(
  values: readonly number[]
): number {
  if (values.length === 0) {
    return 0
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length
  )
}

/**
 * 按 Unicode code point 统计消息长度。
 */
function messageLength(
  text: string
): number {
  return [...text].length
}

/**
 * 将时间戳转换为指定时区下的日期键。
 *
 * 例如：
 * 2026-09-10
 */
function createDateKey(
  timestamp: number,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone
    }
  ).format(new Date(timestamp))
}

interface ReplyLatencyGroups {
  incomingToOutgoing: number[]
  outgoingToIncoming: number[]
}

/**
 * 计算同一 Session 内双方“轮次切换”的回复时间。
 *
 * 连续多条同方向消息视为一个消息 run。
 *
 * 例如：
 *
 * A: 消息1
 * A: 消息2
 * A: 消息3
 * B: 回复
 *
 * 只计算一次回复时间：
 *
 * 最后一条 A 消息 → 第一条 B 消息
 */
function collectReplyLatencies(
  messages: readonly CanonicalMessage[]
): ReplyLatencyGroups {
  const incomingToOutgoing: number[] = []
  const outgoingToIncoming: number[] = []

  for (
    let index = 1;
    index < messages.length;
    index += 1
  ) {
    const previous = messages[index - 1]
    const current = messages[index]

    if (
      previous.direction ===
      current.direction
    ) {
      continue
    }

    const latency =
      current.timestamp -
      previous.timestamp

    if (latency < 0) {
      continue
    }

    if (
      previous.direction === 'incoming' &&
      current.direction === 'outgoing'
    ) {
      incomingToOutgoing.push(latency)
    } else {
      outgoingToIncoming.push(latency)
    }
  }

  return {
    incomingToOutgoing,
    outgoingToIncoming
  }
}

function ratio(
  value: number,
  total: number
): number {
  if (total === 0) {
    return 0
  }

  return value / total
}

function filterByDirection(
  messages: readonly CanonicalMessage[],
  direction: MessageDirection
): CanonicalMessage[] {
  return messages.filter(
    (message) =>
      message.direction === direction
  )
}

/**
 * 计算一个账号、一个会话中的互动行为指标。
 */
export function calculateInteractionMetrics(
  messages: readonly CanonicalMessage[],
  options: InteractionMetricsOptions = {}
): InteractionMetrics {
  if (messages.length === 0) {
    return {
      totalMessages: 0,

      incoming: {
        messageCount: 0,
        averageMessageLength: 0
      },

      outgoing: {
        messageCount: 0,
        averageMessageLength: 0
      },

      activeDays: 0,

      sessions: {
        totalSessions: 0,
        incomingStartedSessions: 0,
        outgoingStartedSessions: 0,
        incomingStartedRatio: 0,
        outgoingStartedRatio: 0
      },

      replies: {
        incomingToOutgoingCount: 0,
        incomingToOutgoingMedianMs: null,
        outgoingToIncomingCount: 0,
        outgoingToIncomingMedianMs: null
      },

      medianSessionDurationMs: null
    }
  }

  const timeZone =
    options.timeZone ??
    'Asia/Shanghai'

  const sessions =
    sessionizeConversation(
      messages,
      options.sessionGapMs
    )

  const incoming =
    filterByDirection(
      messages,
      'incoming'
    )

  const outgoing =
    filterByDirection(
      messages,
      'outgoing'
    )

  const incomingLengths =
    incoming.map(
      (message) =>
        messageLength(message.text)
    )

  const outgoingLengths =
    outgoing.map(
      (message) =>
        messageLength(message.text)
    )

  const activeDayKeys =
    new Set(
      messages.map(
        (message) =>
          createDateKey(
            message.timestamp,
            timeZone
          )
      )
    )

  const incomingStartedSessions =
    sessions.filter(
      (session) =>
        session.starterDirection ===
        'incoming'
    ).length

  const outgoingStartedSessions =
    sessions.filter(
      (session) =>
        session.starterDirection ===
        'outgoing'
    ).length

  const allIncomingToOutgoing: number[] =
    []

  const allOutgoingToIncoming: number[] =
    []

  for (const session of sessions) {
    const sessionMessageIds =
      new Set(session.messageIds)

    const sessionMessages =
      messages
        .filter(
          (message) =>
            sessionMessageIds.has(
              message.id
            )
        )
        .sort(
          (left, right) =>
            left.timestamp -
              right.timestamp ||
            left.id.localeCompare(
              right.id
            )
        )

    const replyLatencies =
      collectReplyLatencies(
        sessionMessages
      )

    allIncomingToOutgoing.push(
      ...replyLatencies
        .incomingToOutgoing
    )

    allOutgoingToIncoming.push(
      ...replyLatencies
        .outgoingToIncoming
    )
  }

  const sessionDurations =
    sessions.map(
      (session) =>
        session.endTime -
        session.startTime
    )

  return {
    totalMessages: messages.length,

    incoming: {
      messageCount: incoming.length,
      averageMessageLength:
        average(incomingLengths)
    },

    outgoing: {
      messageCount: outgoing.length,
      averageMessageLength:
        average(outgoingLengths)
    },

    activeDays: activeDayKeys.size,

    sessions: {
      totalSessions: sessions.length,

      incomingStartedSessions,
      outgoingStartedSessions,

      incomingStartedRatio:
        ratio(
          incomingStartedSessions,
          sessions.length
        ),

      outgoingStartedRatio:
        ratio(
          outgoingStartedSessions,
          sessions.length
        )
    },

    replies: {
      incomingToOutgoingCount:
        allIncomingToOutgoing.length,

      incomingToOutgoingMedianMs:
        median(
          allIncomingToOutgoing
        ),

      outgoingToIncomingCount:
        allOutgoingToIncoming.length,

      outgoingToIncomingMedianMs:
        median(
          allOutgoingToIncoming
        )
    },

    medianSessionDurationMs:
      median(sessionDurations)
  }
}