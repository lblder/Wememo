import { INTERACTION_REASONING_VERSION } from '../../shared/interaction-reasoning'
import type { EvaluationProviders } from './evidence-question-evaluation'

interface Item { id: string; direction: string }
function answer(items: Item[]) {
  const support = items.find(item => item.direction === 'support')
  const context = items.find(item => item.direction === 'context')
  return JSON.stringify({ version: INTERACTION_REASONING_VERSION, summary: '离线 Mock 仅验证评估链路。',
    findings: support ? [{ id: 'f1', claim: '存在可观察行为证据。', confidence: 'low', evidenceIds: [support.id] }] : [],
    alternativeExplanations: context ? [{ id: 'a1', explanation: '存在其他背景。', evidenceIds: [context.id] }] : [],
    uncertainties: ['Mock 不评估真实回答质量或心理状态。'] })
}
export function createMockEvaluationProviders(): EvaluationProviders {
  return {
    direct: { id: 'mock-direct', async generate(request) {
      return { providerId: 'mock-direct', text: answer(JSON.parse(request.userPrompt).selectedEvidence) }
    } },
    agent: { id: 'mock-agent', async generate(request) {
      const first = request.messages[0]
      if (first.role !== 'user') throw new Error('Invalid mock input')
      const catalog = JSON.parse(first.content).catalog as Item[]
      const selected = ['support', 'context'].flatMap(direction => catalog.find(item => item.direction === direction) ?? [])
      if (!request.messages.some(message => message.role === 'tool')) return { type: 'tool_calls', calls: [
        { id: 'mock-read', name: 'read_evidence', argumentsJson: JSON.stringify({ evidenceIds: selected.map(item => item.id) }) }
      ] }
      return { type: 'final', text: answer(selected) }
    } }
  }
}
