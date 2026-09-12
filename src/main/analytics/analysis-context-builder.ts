import { isDeepStrictEqual } from 'node:util'
import { ANALYSIS_CONTEXT_VERSION, type AnalysisContextPack, type AnalysisEvidenceBundle } from '../../shared/analysis-context'
import { DEFAULT_ANALYSIS_POLICY, type AnalysisPolicy } from '../../shared/analysis-policy'
import { validateAnalysisContextPack } from '../../shared/analysis-context-validation'
import type { InteractionPeriodComparison } from '../../shared/interaction-analysis'
import type { InteractionEvidenceReport, MetricEvidence, MessageEvidence } from '../../shared/interaction-evidence'
import type { SemanticEvidence } from '../../shared/semantic-evidence'

type Evidence = MetricEvidence | MessageEvidence | SemanticEvidence

function freezeData<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child)
    Object.freeze(value)
  }
  return value
}

/** Collects existing results; never reads messages, computes metrics or changes status. */
export function buildAnalysisContextPack(input: {
  accountId: string
  conversationId: string
  generatedAt: number
  comparison: InteractionPeriodComparison
  evidenceReport: InteractionEvidenceReport
  policy?: AnalysisPolicy
}): AnalysisContextPack {
  const { comparison, evidenceReport: report } = input
  if (report.accountId !== input.accountId || report.conversationId !== input.conversationId) {
    throw new Error('Analysis context scope mismatch')
  }
  if (!isDeepStrictEqual(report.windows, comparison.windows)) throw new Error('Analysis context windows mismatch')
  const evidence: AnalysisEvidenceBundle = {
    metricSupport: [], metricCounter: [], messageSupport: [], messageCounter: [],
    semanticSupport: [], semanticCounter: [], semanticContext: []
  }
  const seen = new Map<string, Evidence>()
  const add = (item: Evidence): void => {
    const existing = seen.get(item.id)
    if (existing) {
      if (!isDeepStrictEqual(existing, item)) throw new Error(`Conflicting evidence ID: ${item.id}`)
      return
    }
    seen.set(item.id, item)
    if (item.kind === 'metric') {
      if (item.direction === 'support') evidence.metricSupport.push(item)
      else if (item.direction === 'counter') evidence.metricCounter.push(item)
      else throw new Error('Invalid metric direction')
    } else if (item.kind === 'message') {
      if (item.direction === 'support') evidence.messageSupport.push(item)
      else if (item.direction === 'counter') evidence.messageCounter.push(item)
      else throw new Error('Invalid message direction')
    } else if (item.kind === 'semantic') {
      if (item.direction === 'support') evidence.semanticSupport.push(item)
      else if (item.direction === 'counter') evidence.semanticCounter.push(item)
      else if (item.direction === 'context') evidence.semanticContext.push(item)
      else throw new Error('Invalid semantic direction')
    } else throw new Error('Invalid evidence kind')
  }
  const observations = report.observations.map((observation) => {
    const items = [
      ...observation.evidence, ...observation.counterEvidence,
      ...observation.messageEvidence, ...observation.counterMessageEvidence,
      ...observation.semanticEvidence, ...observation.counterSemanticEvidence
    ]
    items.forEach(add)
    return {
      id: observation.id, title: observation.title, status: observation.status,
      summary: observation.summary, evidenceIds: [...new Set(items.map((item) => item.id))]
    }
  })
  const pack: AnalysisContextPack = {
    version: ANALYSIS_CONTEXT_VERSION,
    scope: { accountId: input.accountId, conversationId: input.conversationId },
    generatedAt: input.generatedAt, windows: comparison.windows,
    metrics: { previous: comparison.previous, recent: comparison.recent, changes: comparison.changes },
    observations, evidence,
    coverage: {
      analyzedMessageCount: report.analyzedMessageCount,
      previousMessageCount: comparison.previous.totalMessages,
      recentMessageCount: comparison.recent.totalMessages,
      previousActiveDays: comparison.previous.activeDays,
      recentActiveDays: comparison.recent.activeDays
    },
    policy: input.policy ?? DEFAULT_ANALYSIS_POLICY
  }
  validateAnalysisContextPack(pack)
  // Detach before freezing: caller-owned analytics results remain untouched.
  return freezeData(JSON.parse(JSON.stringify(pack)) as AnalysisContextPack)
}
