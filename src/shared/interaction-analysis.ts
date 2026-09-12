import type {
  MessageDirection
} from './message'
import type {
  InteractionMetrics,
  InteractionMetricChanges
} from './interaction-metrics'

/**
 * 用于统计分析的时间窗口。
 *
 * 查询语义统一为：
 * [startTime, endTime)
 */
export interface AnalysisTimeWindow {
  startTime: number
  endTime: number
  label: string
}

/**
 * 两个相邻时期，用于比较“最近一段时间”和“之前一段时间”。
 */
export interface PeriodComparisonWindows {
  recent: AnalysisTimeWindow
  previous: AnalysisTimeWindow
}

/**
 * 一段连续聊天会话。
 *
 * Session 由消息之间的时间间隔划分。
 */
export interface ConversationSession {
  id: string

  accountId: string
  conversationId: string

  startTime: number
  endTime: number

  firstMessageId: string
  lastMessageId: string

  messageIds: string[]
  participantIds: string[]

  messageCount: number

  starterSenderId: string
  starterDirection: MessageDirection
}
/**
 * 两个相邻时期的完整互动对比结果。
 */
export interface InteractionPeriodComparison {
  windows: PeriodComparisonWindows

  previous: InteractionMetrics
  recent: InteractionMetrics

  changes: InteractionMetricChanges
}