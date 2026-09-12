import type { AnalysisContextPack } from './analysis-context'
import type {
  InteractionPeriodComparison
} from './interaction-analysis'

import type {
  InteractionEvidenceReport
} from './interaction-evidence'

export interface InteractionPeriodAnalysisRequest {
  accountId: string
  conversationId: string

  /**
   * 比较窗口终点。
   * 不传时由 Main 使用当前时间。
   */
  referenceTime?: number

  /**
   * 每个时期的长度。
   * 默认 7 天。
   */
  days?: number
}

export interface InteractionPeriodAnalysisResult {
  contextPack: AnalysisContextPack

  comparison: InteractionPeriodComparison

  evidenceReport: InteractionEvidenceReport

  analyzedMessageCount: number
}
