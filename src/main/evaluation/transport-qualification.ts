import type { AnalysisContextPack } from '../../shared/analysis-context'
import { AGENT_POLICY, charCount, freezeJson } from '../evidence-agent/agent-policy'
import { AgentRunError } from '../evidence-agent/agent-errors'
import { createAgentEvidenceProjection, redactIdentifiers } from '../evidence-agent/agent-evidence-projection'
import { AGENT_SYSTEM_PROMPT, initialAgentMessage } from '../evidence-agent/agent-prompt'
import { AGENT_TOOLS, executeReadOnlyTool, validateToolBatch } from '../evidence-agent/agent-tools'
import { boundedOperation } from '../evidence-agent/bounded-operation'
import type { ToolCallingRequest } from '../evidence-agent/tool-calling-provider'
import { buildReasoningPrompt } from '../reasoning/reasoning-prompt-builder'
import type { DeepSeekConfiguration } from '../providers/deepseek-config'
import { DeepSeekProvider, type ProviderTransport } from '../providers/deepseek-provider'
import { DeepSeekToolCallingProvider } from '../providers/deepseek-tool-calling-provider'
import { ProviderDiagnosticTracker, type ProviderCallDiagnostic } from '../providers/provider-diagnostic'
import { directQuestionRequest } from './evidence-question-evaluation'
import { RELIABILITY_CASES } from './reliability/cases'

export type ProbeGroup = 'A' | 'B' | 'C'
export interface TransportProbeRecord {
  probe: ProbeGroup; repetition: number; providerCalls: number; protocolPass: boolean
  responseType: 'final' | 'tool_calls' | null
  diagnostic: ProviderCallDiagnostic
}

/** Independent wire fixture, NOT model-generated history or a reasoning evaluation. */
export function qualificationAgentRequest(pack: AnalysisContextPack, continuation: boolean): ToolCallingRequest {
  const projection = createAgentEvidenceProjection(pack)
  const request: ToolCallingRequest = { systemPrompt: AGENT_SYSTEM_PROMPT,
    messages: [initialAgentMessage(RELIABILITY_CASES[0].question, projection)], tools: AGENT_TOOLS,
    toolChoice: 'auto', maxOutputTokens: AGENT_POLICY.maxOutputTokens }
  if (continuation) {
    const ids = (['support', 'counter', 'context'] as const).map(direction => projection.catalog.find(item => item.direction === direction)?.id)
    if (ids.some(id => !id)) throw new Error('Qualification fixture requires all evidence directions')
    const calls = [{ id: 'probe_metrics', name: 'read_metrics', argumentsJson: '{}' },
      { id: 'probe_evidence', name: 'read_evidence', argumentsJson: JSON.stringify({ evidenceIds: ids }) }]
    const batch = validateToolBatch(calls, projection, new Set(), 0)
    request.messages.push({ role: 'assistant', calls })
    const delivered = new Set<string>()
    for (const call of batch) {
      const result = executeReadOnlyTool(call, projection)
      if (call.name === 'read_evidence') call.arguments.evidenceIds.forEach(id => delivered.add(id))
      request.messages.push({ role: 'tool', callId: call.id, name: call.name, content: JSON.stringify({ result, deliveredIds: [...delivered] }) })
    }
  }
  if (charCount(JSON.stringify(request)) > AGENT_POLICY.maxRequestChars) throw new Error('Qualification fixture exceeds existing budget')
  return freezeJson(request)
}

export async function runTransportQualification(configuration: DeepSeekConfiguration, pack: AnalysisContextPack,
  rawTransport: ProviderTransport, options: { signal: AbortSignal; onRecord: (record: TransportProbeRecord) => Promise<void> | void }) {
  const prompt = buildReasoningPrompt(pack)
  const directRequest = directQuestionRequest({ systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, responseFormat: 'json' }, RELIABILITY_CASES[0].question, pack)
  const records: TransportProbeRecord[] = []
  for (const probe of ['A', 'B', 'C'] as const) for (let repetition = 1; repetition <= 5; repetition++) {
    if (options.signal.aborted) return records
    const agentRequest = probe === 'A' ? undefined : qualificationAgentRequest(pack, probe === 'C')
    let diagnostic: ProviderCallDiagnostic | undefined
    let responseType: TransportProbeRecord['responseType'] = null
    let providerCalls = 0
    const observe = (value: ProviderCallDiagnostic): void => { diagnostic ??= value }
    try {
      await boundedOperation(async signal => {
        const transport: ProviderTransport = (url, init) => {
          const wire = JSON.parse(String(init.body))
          const texts = wire.messages.flatMap((message: { content?: string; tool_calls?: { function: { arguments: string } }[] }) =>
            [message.content, ...(message.tool_calls ?? []).map(call => call.function.arguments)]).filter((value: unknown): value is string => typeof value === 'string')
          if (texts.some((text: string) => redactIdentifiers(text, pack) !== text)) throw new Error('Outbound identity boundary')
          providerCalls++
          return rawTransport(url, { ...init, signal: AbortSignal.any([signal, ...(init.signal ? [init.signal] : [])]) })
        }
        if (probe === 'A') {
          await new DeepSeekProvider(configuration, transport, observe, signal).generate(directRequest)
          responseType = 'final'
        } else {
          const response = await new DeepSeekToolCallingProvider(configuration, transport, observe).generate(agentRequest!, { signal })
          responseType = response.type
        }
      }, options.signal, AGENT_POLICY.modelTimeoutMs)
    } catch (error) {
      responseType = null
      if (!diagnostic) {
        const abort = new AbortController()
        if (error instanceof AgentRunError) abort.abort(error)
        new ProviderDiagnosticTracker(probe === 'A' ? 'deepseek' : 'deepseek-tool-calling', configuration.modelId, abort.signal, observe).failure(error)
      }
    }
    if (!diagnostic) throw new Error('Missing qualification diagnostic')
    const record = freezeJson({ probe, repetition, providerCalls, protocolPass: responseType !== null, responseType, diagnostic })
    records.push(record)
    await options.onRecord(record)
  }
  return records
}

export function summarizeTransportQualification(records: readonly TransportProbeRecord[]) {
  const counts = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]))
  return Object.fromEntries((['A', 'B', 'C'] as const).map(probe => {
    const rows = records.filter(row => row.probe === probe)
    return [probe, { probes: rows.length, httpAttempts: rows.reduce((sum, row) => sum + row.providerCalls, 0),
      httpStatus: counts(rows.map(row => String(row.diagnostic.httpStatus ?? 'no-http-status'))),
      protocolPass: rows.filter(row => row.protocolPass).length,
      failures: counts(rows.flatMap(row => row.diagnostic.outcome === 'failure' ? [row.diagnostic.safeMessage] : [])),
      transportCodes: counts(rows.flatMap(row => row.diagnostic.outcome === 'failure' && row.diagnostic.transportCode ? [row.diagnostic.transportCode] : [])),
      meanDurationMs: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.diagnostic.durationMs, 0) / rows.length) : null }]
  }))
}
