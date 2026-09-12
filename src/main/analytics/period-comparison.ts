import type {
  CanonicalMessage
} from '../../shared/message'

import type {
  InteractionMetricChanges,
  NullableMetricChange,
  NumericMetricChange,
  RatioMetricChange
} from '../../shared/interaction-metrics'

import type {
  AnalysisTimeWindow,
  InteractionPeriodComparison
} from '../../shared/interaction-analysis'

import {
  calculateInteractionMetrics,
  type InteractionMetricsOptions
} from './interaction-metrics'

import {
  createPeriodComparisonWindows
} from './time-window'

function isInsideWindow(
  timestamp: number,
  window: AnalysisTimeWindow
): boolean {
  return (
    timestamp >= window.startTime &&
    timestamp < window.endTime
  )
}

function compareNumber(
  previous: number,
  recent: number
): NumericMetricChange {
  const absoluteChange =
    recent - previous

  return {
    previous,
    recent,
    absoluteChange,

    relativeChange:
      previous === 0
        ? null
        : absoluteChange / previous
  }
}

function compareRatio(
  previous: number,
  recent: number
): RatioMetricChange {
  return {
    previous,
    recent,

    percentagePointChange:
      recent - previous
  }
}

function compareNullableNumber(
  previous: number | null,
  recent: number | null
): NullableMetricChange {
  if (
    previous === null ||
    recent === null
  ) {
    return {
      previous,
      recent,
      absoluteChange: null,
      relativeChange: null
    }
  }

  const absoluteChange =
    recent - previous

  return {
    previous,
    recent,
    absoluteChange,

    relativeChange:
      previous === 0
        ? null
        : absoluteChange / previous
  }
}

function buildChanges(
  previous:
    InteractionPeriodComparison['previous'],
  recent:
    InteractionPeriodComparison['recent']
): InteractionMetricChanges {
  return {
    totalMessages:
      compareNumber(
        previous.totalMessages,
        recent.totalMessages
      ),

    incomingMessages:
      compareNumber(
        previous.incoming.messageCount,
        recent.incoming.messageCount
      ),

    outgoingMessages:
      compareNumber(
        previous.outgoing.messageCount,
        recent.outgoing.messageCount
      ),

    activeDays:
      compareNumber(
        previous.activeDays,
        recent.activeDays
      ),

    totalSessions:
      compareNumber(
        previous.sessions.totalSessions,
        recent.sessions.totalSessions
      ),

    incomingStartedRatio:
      compareRatio(
        previous.sessions
          .incomingStartedRatio,
        recent.sessions
          .incomingStartedRatio
      ),

    outgoingStartedRatio:
      compareRatio(
        previous.sessions
          .outgoingStartedRatio,
        recent.sessions
          .outgoingStartedRatio
      ),

    incomingToOutgoingMedianMs:
      compareNullableNumber(
        previous.replies
          .incomingToOutgoingMedianMs,
        recent.replies
          .incomingToOutgoingMedianMs
      ),

    outgoingToIncomingMedianMs:
      compareNullableNumber(
        previous.replies
          .outgoingToIncomingMedianMs,
        recent.replies
          .outgoingToIncomingMedianMs
      ),

    incomingAverageMessageLength:
      compareNumber(
        previous.incoming
          .averageMessageLength,
        recent.incoming
          .averageMessageLength
      ),

    outgoingAverageMessageLength:
      compareNumber(
        previous.outgoing
          .averageMessageLength,
        recent.outgoing
          .averageMessageLength
      )
  }
}

/**
 * 比较最近 N 天和之前 N 天的互动行为。
 *
 * 时间窗口统一使用：
 * [startTime, endTime)
 */
export function compareInteractionPeriods(
  messages: readonly CanonicalMessage[],
  referenceTime: number,
  days = 7,
  options: InteractionMetricsOptions = {}
): InteractionPeriodComparison {
  const windows =
    createPeriodComparisonWindows(
      referenceTime,
      days
    )

  const previousMessages =
    messages.filter(
      (message) =>
        isInsideWindow(
          message.timestamp,
          windows.previous
        )
    )

  const recentMessages =
    messages.filter(
      (message) =>
        isInsideWindow(
          message.timestamp,
          windows.recent
        )
    )

  const previous =
    calculateInteractionMetrics(
      previousMessages,
      options
    )

  const recent =
    calculateInteractionMetrics(
      recentMessages,
      options
    )

  return {
    windows,
    previous,
    recent,

    changes:
      buildChanges(
        previous,
        recent
      )
  }
}