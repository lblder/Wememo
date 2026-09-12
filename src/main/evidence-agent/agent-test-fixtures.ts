// Offline test helpers only.
import { INTERACTION_REASONING_VERSION } from '../../shared/interaction-reasoning'
import { compareInteractionPeriods } from '../analytics/period-comparison'
import { buildInteractionEvidenceReport } from '../analytics/evidence-builder'
import { buildAnalysisContextPack } from '../analytics/analysis-context-builder'
import type { AgentCatalogEntry } from './agent-evidence-projection'
import type { ToolCallingRequest, ToolCallingResponse, AgentToolCall } from './tool-calling-provider'

export function catalogFrom(request: ToolCallingRequest): AgentCatalogEntry[] {
  const message = request.messages[0]
  if (message.role !== 'user') throw new Error('Expected user data')
  return JSON.parse(message.content).catalog
}
export const call = (id: string, name: string, args: unknown = {}): AgentToolCall => ({ id, name, argumentsJson: JSON.stringify(args) })
export const calls = (...items: AgentToolCall[]): ToolCallingResponse => ({ type: 'tool_calls', calls: items })
export function finalText(support: string[] = [], alternatives: string[] = []): ToolCallingResponse {
  return { type: 'final', text: JSON.stringify({ version: INTERACTION_REASONING_VERSION, summary: '仅根据已交付证据解释行为。',
    findings: support.length ? [{ id: 'f1', claim: '观察到互动行为变化。', evidenceIds: support, confidence: 'low' }] : [],
    alternativeExplanations: alternatives.length ? [{ id: 'a1', explanation: '存在其他情境解释。', evidenceIds: alternatives }] : [],
    uncertainties: ['聊天行为不能反映真实心理状态。'] }) }
}
export function readSupportAndContext(request: ToolCallingRequest): ToolCallingResponse {
  const catalog = catalogFrom(request)
  return calls(call('read-1', 'read_evidence', { evidenceIds: [catalog.find(item => item.direction === 'support')!.id, catalog.find(item => item.direction === 'context')!.id] }))
}
export function groundedFinal(request: ToolCallingRequest): ToolCallingResponse {
  const catalog = catalogFrom(request)
  return finalText([catalog.find(item => item.direction === 'support')!.id], [catalog.find(item => item.direction === 'context')!.id])
}
export function emptyPack() {
  const scope = { accountId: 'empty-account', conversationId: 'empty-conversation' }
  const comparison = compareInteractionPeriods([], Date.parse('2026-09-11T12:00:00+08:00'))
  const evidenceReport = buildInteractionEvidenceReport({ ...scope, comparison, messages: [], analyzedMessageCount: 0 })
  return buildAnalysisContextPack({ ...scope, comparison, evidenceReport, generatedAt: Date.now() })
}
