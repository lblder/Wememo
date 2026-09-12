import type { SemanticEvidence } from './semantic-evidence'
import type {
  PeriodComparisonWindows
} from './interaction-analysis'

export type EvidenceDirection =
  | 'support'
  | 'counter'

export type EvidenceMetric =
  | 'total-messages'
  | 'incoming-messages'
  | 'total-sessions'
  | 'incoming-started-ratio'
  | 'active-days'
  | 'incoming-reply-latency'
  | 'incoming-average-message-length'

export interface MetricEvidence {
  id: string
  kind: 'metric'

  direction: EvidenceDirection
  metric: EvidenceMetric

  label: string

  previous: number | null
  recent: number | null

  /**
   * 普通数值使用比例变化；
   * 比例指标使用百分点变化。
   */
  change: number | null

  unit:
    | 'count'
    | 'ratio'
    | 'milliseconds'
    | 'characters'
}

import type {
  MessageDirection
} from './message'

export interface EvidenceMessageRef {
  messageId: string

  senderId: string
  senderName?: string

  direction: MessageDirection

  timestamp: number
  text: string
}

export type MessageEvidenceType =
  | 'reply-latency'
  | 'session-starter'
  | 'long-reply'

/**
 * 可以直接追溯到原始聊天的证据。
 */
export interface MessageEvidence {
  id: string
  kind: 'message'

  direction: EvidenceDirection

  evidenceType: MessageEvidenceType

  label: string

  messages: EvidenceMessageRef[]
}

export type ObservationStatus =
  | 'detected'
  | 'not-detected'
  | 'insufficient'

/**
 * 确定性互动行为观察。
 *
 * 注意：
 * Observation 不是心理诊断，也不是关系结论。
 */
export interface InteractionObservation {
  id: string

  title: string

  status: ObservationStatus

  summary: string

  evidence: MetricEvidence[]
  counterEvidence: MetricEvidence[]

  messageEvidence: MessageEvidence[]
  counterMessageEvidence: MessageEvidence[]

  /** Support/context only; v1 emits context. Status remains metric-driven. */
  semanticEvidence: SemanticEvidence[]
  counterSemanticEvidence: SemanticEvidence[]
}

export interface InteractionEvidenceReport {
  accountId: string
  conversationId: string

  windows: PeriodComparisonWindows

  analyzedMessageCount: number

  observations: InteractionObservation[]
}
