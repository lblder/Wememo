import { AGENT_POLICY as POLICY, freezeJson } from './agent-policy'
import { AgentRunError, denseArray, exactObject } from './agent-errors'
import type { AgentEvidenceProjection, AgentEvidenceContent } from './agent-evidence-projection'
import type { AgentToolCall, AgentToolDefinition } from './tool-calling-provider'

export const AGENT_TOOLS: readonly AgentToolDefinition[] = freezeJson([
  { name: 'read_metrics', description: '读取本次快照的已计算指标；不授予 evidence 引用权限。',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'read_evidence', description: '按当前目录 alias 读取 1–6 个证据；只有成功交付的 ID 可以被最终引用。',
    parameters: { type: 'object', properties: { evidenceIds: { type: 'array', items: { type: 'string' }, minItems: 1,
      maxItems: POLICY.maxEvidencePerRead, uniqueItems: true } }, required: ['evidenceIds'], additionalProperties: false } }
])

export type ValidatedToolCall =
  | { id: string; name: 'read_metrics'; arguments: Record<string, never> }
  | { id: string; name: 'read_evidence'; arguments: { evidenceIds: string[] } }

/** Pure preflight. No tool execution or mutation occurs until the whole batch passes. */
export function validateToolBatch(calls: AgentToolCall[], projection: AgentEvidenceProjection, usedCallIds: ReadonlySet<string>, toolCount: number): ValidatedToolCall[] {
  if (!calls.length) throw new AgentRunError('invalid-output')
  if (toolCount + calls.length > POLICY.maxToolCalls) throw new AgentRunError('budget-exceeded')
  const seen = new Set(usedCallIds)
  const aliases = new Set(projection.catalog.map(item => item.id))
  const validated = calls.map((call): ValidatedToolCall => {
    if (seen.has(call.id)) throw new AgentRunError('duplicate-tool-call')
    seen.add(call.id)
    if (call.name !== 'read_metrics' && call.name !== 'read_evidence') throw new AgentRunError('unknown-tool')
    let args: unknown
    try { args = JSON.parse(call.argumentsJson) } catch { throw new AgentRunError('invalid-tool-arguments') }
    if (call.name === 'read_metrics') {
      exactObject(args, [], 'invalid-tool-arguments')
      return { id: call.id, name: call.name, arguments: {} }
    }
    const data = exactObject(args, ['evidenceIds'], 'invalid-tool-arguments')
    const ids = denseArray(data.evidenceIds, POLICY.maxEvidencePerRead, 'invalid-tool-arguments')
    if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) throw new AgentRunError('invalid-tool-arguments')
    if (ids.some(id => !aliases.has(id as string))) throw new AgentRunError('invalid-alias')
    return { id: call.id, name: call.name, arguments: { evidenceIds: ids as string[] } }
  })
  return freezeJson(validated)
}

/** In-memory snapshot reads only. There is no Repository, network or filesystem dependency. */
export function readMetrics(projection: AgentEvidenceProjection) {
  const pack = projection.snapshot
  return freezeJson({
    metrics: pack.metrics,
    windows: {
      previous: { startTime: pack.windows.previous.startTime, endTime: pack.windows.previous.endTime },
      recent: { startTime: pack.windows.recent.startTime, endTime: pack.windows.recent.endTime }
    },
    coverage: pack.coverage,
    // Avoid free-text summaries: they may repeat unrequested evidence excerpts.
    observations: pack.observations.map((item, index) => ({ id: `observation-${index + 1}`, status: item.status }))
  })
}

export function readEvidence(projection: AgentEvidenceProjection, evidenceIds: readonly string[]): { evidence: AgentEvidenceContent[] } {
  if (!evidenceIds.length || evidenceIds.length > POLICY.maxEvidencePerRead || new Set(evidenceIds).size !== evidenceIds.length) throw new AgentRunError('invalid-tool-arguments')
  const evidence = evidenceIds.map(id => {
    const item = projection.content.find(item => item.id === id)
    if (!item) throw new AgentRunError('invalid-alias')
    return item
  })
  return freezeJson({ evidence })
}

export function executeReadOnlyTool(call: ValidatedToolCall, projection: AgentEvidenceProjection): ReturnType<typeof readMetrics> | ReturnType<typeof readEvidence> {
  return call.name === 'read_metrics' ? readMetrics(projection) : readEvidence(projection, call.arguments.evidenceIds)
}
