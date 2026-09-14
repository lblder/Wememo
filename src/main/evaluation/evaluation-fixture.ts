import { parseJsonImportDocument } from '../data-sources/json-message-source'
import { compareInteractionPeriods } from '../analytics/period-comparison'
import { buildInteractionEvidenceReport } from '../analytics/evidence-builder'
import { buildAnalysisContextPack } from '../analytics/analysis-context-builder'

export const EVALUATION_REFERENCE_TIME = Date.parse('2026-09-11T12:00:00+08:00')
/** CLI supplies the repository's synthetic fixture, never a user-selected file or repository. */
export function buildEvaluationFixture(document: string) {
  const messages = parseJsonImportDocument(document).messages
  if (!messages.length) throw new Error('Missing synthetic evaluation messages')
  const comparison = compareInteractionPeriods(messages, EVALUATION_REFERENCE_TIME)
  const scope = { accountId: messages[0].accountId, conversationId: messages[0].conversationId }
  const evidenceReport = buildInteractionEvidenceReport({ ...scope, comparison, messages,
    analyzedMessageCount: comparison.previous.totalMessages + comparison.recent.totalMessages })
  return buildAnalysisContextPack({ ...scope, comparison, evidenceReport, generatedAt: EVALUATION_REFERENCE_TIME })
}
