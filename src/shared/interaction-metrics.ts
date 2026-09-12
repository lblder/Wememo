/**
 * 单方向消息统计。
 */
export interface DirectionMetrics {
  messageCount: number
  averageMessageLength: number
}

/**
 * 回复行为统计。
 *
 * incomingToOutgoing：
 * 对方消息 → 我方首次回复
 *
 * outgoingToIncoming：
 * 我方消息 → 对方首次回复
 */
export interface ReplyMetrics {
  incomingToOutgoingCount: number
  incomingToOutgoingMedianMs: number | null

  outgoingToIncomingCount: number
  outgoingToIncomingMedianMs: number | null
}

/**
 * Session 发起统计。
 */
export interface SessionStarterMetrics {
  totalSessions: number

  incomingStartedSessions: number
  outgoingStartedSessions: number

  incomingStartedRatio: number
  outgoingStartedRatio: number
}

/**
 * 一段时间内确定性的互动行为指标。
 *
 * 注意：
 * 这些指标描述聊天行为，
 * 不直接代表亲密度、好感度或真实心理状态。
 */
export interface InteractionMetrics {
  totalMessages: number

  incoming: DirectionMetrics
  outgoing: DirectionMetrics

  activeDays: number

  sessions: SessionStarterMetrics

  replies: ReplyMetrics

  medianSessionDurationMs: number | null
}

/**
 * 普通数值指标的时期变化。
 *
 * relativeChange：
 * (recent - previous) / previous
 *
 * previous = 0 时无法计算比例变化，因此为 null。
 */
export interface NumericMetricChange {
  previous: number
  recent: number
  absoluteChange: number
  relativeChange: number | null
}

/**
 * 比例类指标的变化。
 *
 * 例如：
 * 0.5 → 0.3
 *
 * percentagePointChange = -0.2
 * 即下降 20 个百分点。
 */
export interface RatioMetricChange {
  previous: number
  recent: number
  percentagePointChange: number
}

/**
 * 可能不存在的指标变化。
 *
 * 例如没有回复行为时，
 * reply median = null。
 */
export interface NullableMetricChange {
  previous: number | null
  recent: number | null
  absoluteChange: number | null
  relativeChange: number | null
}

export interface InteractionMetricChanges {
  totalMessages: NumericMetricChange

  incomingMessages: NumericMetricChange
  outgoingMessages: NumericMetricChange

  activeDays: NumericMetricChange

  totalSessions: NumericMetricChange

  incomingStartedRatio: RatioMetricChange
  outgoingStartedRatio: RatioMetricChange

  incomingToOutgoingMedianMs:
    NullableMetricChange

  outgoingToIncomingMedianMs:
    NullableMetricChange

  incomingAverageMessageLength:
    NumericMetricChange

  outgoingAverageMessageLength:
    NumericMetricChange
}