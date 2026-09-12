import type { PeriodComparisonWindows } from './interaction-analysis'
import type { InteractionMetrics, InteractionMetricChanges } from './interaction-metrics'
import type { InteractionObservation, MetricEvidence, MessageEvidence } from './interaction-evidence'
import type { SemanticEvidence } from './semantic-evidence'
import type { AnalysisPolicy } from './analysis-policy'

export const ANALYSIS_CONTEXT_VERSION = 'wememo-analysis-context-v1'

export interface AnalysisContextScope {
  accountId: string
  conversationId: string
}

export interface AnalysisCoverage {
  analyzedMessageCount: number
  previousMessageCount: number
  recentMessageCount: number
  previousActiveDays: number
  recentActiveDays: number
}

export interface AnalysisEvidenceBundle {
  metricSupport: MetricEvidence[]
  metricCounter: MetricEvidence[]
  messageSupport: MessageEvidence[]
  messageCounter: MessageEvidence[]
  semanticSupport: SemanticEvidence[]
  semanticCounter: SemanticEvidence[]
  semanticContext: SemanticEvidence[]
}

/** References the normalized bundle; never repeats legacy mixed semantic arrays. */
export interface AnalysisContextObservation extends Pick<
  InteractionObservation, 'id' | 'title' | 'status' | 'summary'
> {
  evidenceIds: string[]
}

/** Sole standard analysis input for a future reasoner. No full-message snapshot. */
export interface AnalysisContextPack {
  version: typeof ANALYSIS_CONTEXT_VERSION
  scope: AnalysisContextScope
  generatedAt: number
  windows: PeriodComparisonWindows
  metrics: {
    previous: InteractionMetrics
    recent: InteractionMetrics
    changes: InteractionMetricChanges
  }
  observations: AnalysisContextObservation[]
  evidence: AnalysisEvidenceBundle
  coverage: AnalysisCoverage
  policy: AnalysisPolicy
}
