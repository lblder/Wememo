// Test helpers only. Production reasoning modules must not import this file.
import { readFileSync } from 'node:fs'
import type { AnalysisContextPack } from '../../shared/analysis-context'
import { INTERACTION_REASONING_VERSION, type InteractionReasoningResult } from '../../shared/interaction-reasoning'
import { parseJsonImportDocument } from '../data-sources/json-message-source'
import { buildInteractionEvidenceReport } from '../analytics/evidence-builder'
import { buildAnalysisContextPack } from '../analytics/analysis-context-builder'
import { compareInteractionPeriods } from '../analytics/period-comparison'
import { buildReasoningPrompt } from './reasoning-prompt-builder'

export function demoMessages() {
  return parseJsonImportDocument(readFileSync('fixtures/import/sample-conversation.json', 'utf8')).messages
}

export function demoPack(): AnalysisContextPack {
  const messages = demoMessages()
  const referenceTime = Date.parse('2026-09-11T12:00:00+08:00')
  const comparison = compareInteractionPeriods(messages, referenceTime)
  const scope = { accountId: messages[0].accountId, conversationId: messages[0].conversationId }
  const evidenceReport = buildInteractionEvidenceReport({
    ...scope, comparison, messages,
    analyzedMessageCount: comparison.previous.totalMessages + comparison.recent.totalMessages
  })
  return structuredClone(buildAnalysisContextPack({ ...scope, comparison, evidenceReport, generatedAt: referenceTime }))
}

export function resultFor(pack: AnalysisContextPack): InteractionReasoningResult {
  const catalog: { selectedEvidence: { id: string; direction: string }[] } = JSON.parse(buildReasoningPrompt(pack).userPrompt)
  return {
    version: INTERACTION_REASONING_VERSION,
    summary: '近期互动行为下降，同时存在工作繁忙等背景，不能据此判断真实感情。',
    findings: [{ id: 'finding-1', claim: '近期存在可观察的互动行为下降。',
      evidenceIds: [catalog.selectedEvidence.find((e) => e.direction === 'support')!.id], confidence: 'medium' }],
    alternativeExplanations: [{ id: 'alternative-1', explanation: '工作安排可能提供替代背景。',
      evidenceIds: [catalog.selectedEvidence.find((e) => e.direction === 'context')!.id] }],
    uncertainties: ['聊天行为不能直接代表真实感情状态。']
  }
}

export function crowdedPack(): AnalysisContextPack {
  const pack = demoPack()
  for (let i = 0; i < 45; i++) {
    const item = { ...pack.evidence.semanticContext[0], id: `extra-context-${i}`, excerpt: `EXTRA_UNSELECTED_TEXT_${i}` }
    pack.evidence.semanticContext.push(item)
    pack.observations[0].evidenceIds.push(item.id)
  }
  return pack
}
