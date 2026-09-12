import { randomUUID } from 'node:crypto'
import type { AnalysisContextPack } from '../../shared/analysis-context'
import { validateAnalysisContextPack } from '../../shared/analysis-context-validation'
import type { MetricEvidence, MessageEvidence } from '../../shared/interaction-evidence'
import type { SemanticEvidence } from '../../shared/semantic-evidence'
import { AGENT_POLICY as POLICY, charCount, freezeJson, truncate } from './agent-policy'

type Evidence = MetricEvidence | MessageEvidence | SemanticEvidence
export interface AgentCatalogEntry {
  id: string
  kind: Evidence['kind']
  direction: Evidence['direction']
  label: string
}
export interface AgentEvidenceContent extends AgentCatalogEntry {
  metric?: MetricEvidence['metric']
  previous?: number | null
  recent?: number | null
  change?: number | null
  unit?: MetricEvidence['unit']
  category?: SemanticEvidence['category']
  sources?: { excerpt: string; timestamp: number; truncated: boolean }[]
  omittedSources?: number
}
export interface AgentEvidenceProjection {
  runId: string
  snapshot: AnalysisContextPack
  catalog: AgentCatalogEntry[]
  /** Local content store. Never spread this projection into a model request. */
  content: AgentEvidenceContent[]
  aliasBindings: { promptId: string; evidenceId: string }[]
}

// Labels are static metadata: a caller-supplied D4 label cannot smuggle a quote or values into the initial catalog.
function catalogLabel(item: Evidence): string {
  if (item.kind === 'metric') return {
    'total-messages': '消息总量', 'incoming-messages': '对方消息量', 'total-sessions': '会话数量',
    'incoming-started-ratio': '对方发起会话比例', 'active-days': '活跃天数',
    'incoming-reply-latency': '对方回复间隔', 'incoming-average-message-length': '对方平均消息长度'
  }[item.metric]
  if (item.kind === 'message') return { 'reply-latency': '回复间隔样本', 'session-starter': '会话发起样本', 'long-reply': '回复长度样本' }[item.evidenceType]
  return { workload: '工作繁忙', fatigue: '疲劳休息', 'explicit-explanation': '主动解释回复变化',
    'future-plan': '未来安排', reassurance: '澄清安抚', 'positive-engagement': '积极互动' }[item.category]
}

/** Exact identifier redaction is data minimization, not comprehensive anonymization. */
export function redactIdentifiers(text: string, snapshot: AnalysisContextPack): string {
  const identifiers = new Set([snapshot.scope.accountId, snapshot.scope.conversationId])
  for (const item of Object.values(snapshot.evidence).flat() as Evidence[]) {
    identifiers.add(item.id)
    if (item.kind === 'semantic') {
      identifiers.add(item.senderId); item.messageIds.forEach(id => identifiers.add(id))
    } else if (item.kind === 'message') {
      item.messages.forEach(message => { identifiers.add(message.senderId); identifiers.add(message.messageId) })
    }
  }
  for (const id of [...identifiers].sort((a, b) => b.length - a.length)) text = text.split(id).join('[identifier-redacted]')
  return text
}

/** Independent projection: deliberately does not call D5-F buildReasoningPrompt. */
export function createAgentEvidenceProjection(input: AnalysisContextPack): AgentEvidenceProjection {
  validateAnalysisContextPack(input)
  const snapshot: AnalysisContextPack = freezeJson(JSON.parse(JSON.stringify(input)))
  const runId = randomUUID()
  const { evidence: e } = snapshot
  const groups: Evidence[][] = [[...e.metricSupport, ...e.messageSupport, ...e.semanticSupport],
    [...e.metricCounter, ...e.messageCounter, ...e.semanticCounter], [...e.semanticContext]]
  const content: AgentEvidenceContent[] = []
  const catalog: AgentCatalogEntry[] = []
  const aliasBindings: AgentEvidenceProjection['aliasBindings'] = []
  const perItemBudget = Math.floor((POLICY.maxEvidenceChars - 2) / 3) - 1
  for (let round = 0; round < Math.max(...groups.map(group => group.length)); round++) {
    for (const group of groups) {
      const item = group[round]
      if (!item || content.length >= POLICY.maxEvidenceItems) continue
      const metadata: AgentCatalogEntry = { id: `ev-${runId}-${String(content.length + 1).padStart(3, '0')}`,
        kind: item.kind, direction: item.direction, label: catalogLabel(item) }
      const entry: AgentEvidenceContent = { ...metadata }
      if (item.kind === 'metric') {
        Object.assign(entry, { metric: item.metric, previous: item.previous, recent: item.recent, change: item.change, unit: item.unit })
      } else {
        if (item.kind === 'semantic') entry.category = item.category
        const sources = item.kind === 'semantic' ? [{ text: item.excerpt, timestamp: item.timestamp }] : item.messages
        entry.sources = []
        for (const source of sources) {
          const text = redactIdentifiers(source.text, snapshot)
          const excerpt = truncate(text, POLICY.maxExcerptChars)
          entry.sources.push({ excerpt, timestamp: source.timestamp, truncated: excerpt !== text })
          if (charCount(JSON.stringify(entry)) > perItemBudget) { entry.sources.pop(); break }
        }
        entry.omittedSources = sources.length - entry.sources.length
        if (!entry.sources.length) continue
      }
      if (charCount(JSON.stringify([...content, entry])) > POLICY.maxEvidenceChars) continue
      content.push(entry); catalog.push(metadata); aliasBindings.push({ promptId: metadata.id, evidenceId: item.id })
    }
    if (content.length >= POLICY.maxEvidenceItems) break
  }
  return freezeJson({ runId, snapshot, catalog, content, aliasBindings })
}
