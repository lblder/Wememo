import type { AnalysisContextPack } from '../../shared/analysis-context'
import { AnalysisContextValidationError } from '../../shared/analysis-context-validation'
import type { InteractionReasoningResult } from '../../shared/interaction-reasoning'
import { InteractionReasoningValidationError } from '../../shared/interaction-reasoning-validation'
import { parseInteractionReasoningOutput, ReasoningOutputParseError } from '../reasoning/reasoning-output-parser'
import { validateReasoningCitations, EvidenceCitationValidationError } from '../reasoning/evidence-citation-validator'
import { AgentRunError, agentFailure, exactObject, type AgentErrorCode } from './agent-errors'
import { AGENT_POLICY as POLICY, charCount, freezeJson } from './agent-policy'
import { createAgentEvidenceProjection } from './agent-evidence-projection'
import { AGENT_SYSTEM_PROMPT, initialAgentMessage } from './agent-prompt'
import { AGENT_TOOLS, executeReadOnlyTool, validateToolBatch } from './agent-tools'
import { boundedOperation } from './bounded-operation'
import { ToolCallingProviderError, validateToolCallingResponse, type AgentMessage, type ToolCallingProvider, type ToolCallingRequest } from './tool-calling-provider'

export interface AgentRunInput { contextPack: AnalysisContextPack; question: string }
export interface AgentTraceEvent {
  phase: 'model-start' | 'model-complete' | 'tool-start' | 'tool-complete' | 'complete' | 'failed'
  modelCalls: number
  toolCalls: number
  elapsedMs: number
  toolName?: 'read_metrics' | 'read_evidence'
  code?: AgentErrorCode
}
export interface AgentRunMetadata {
  version: typeof POLICY.version
  runId?: string
  modelCalls: number
  toolCalls: number
  deliveredIds: string[]
  trace: AgentTraceEvent[]
}
export type AgentRunResponse =
  | { ok: true; value: { result: InteractionReasoningResult; contextPack: AnalysisContextPack }; metadata: AgentRunMetadata }
  | { ok: false; error: { code: AgentErrorCode; message: string }; metadata: AgentRunMetadata }

/** All state belongs to one invocation; concurrent runs share no aliases, counters or history. */
export class BoundedAgentRunner {
  constructor(private readonly provider: ToolCallingProvider) {}

  async run(input: AgentRunInput, options: { signal?: AbortSignal } = {}): Promise<AgentRunResponse> {
    const started = performance.now()
    const controller = new AbortController()
    const cancel = (): void => controller.abort(new AgentRunError('cancelled'))
    options.signal?.addEventListener('abort', cancel, { once: true })
    if (options.signal?.aborted) cancel()
    const runTimeout = setTimeout(() => controller.abort(new AgentRunError('timeout')), POLICY.runTimeoutMs)
    let runId: string | undefined
    let modelCalls = 0
    let toolCalls = 0
    const delivered = new Set<string>()
    const usedCallIds = new Set<string>()
    const trace: AgentTraceEvent[] = []
    const event = (phase: AgentTraceEvent['phase'], detail: Pick<AgentTraceEvent, 'code' | 'toolName'> = {}): void => {
      trace.push({ phase, modelCalls, toolCalls, elapsedMs: Math.max(0, performance.now() - started), ...detail })
    }
    const metadata = (): AgentRunMetadata => ({ version: POLICY.version, ...(runId ? { runId } : {}), modelCalls, toolCalls, deliveredIds: [...delivered], trace })
    const checkActive = (): void => {
      if (controller.signal.aborted) throw controller.signal.reason
      if (performance.now() - started >= POLICY.runTimeoutMs) throw new AgentRunError('timeout')
    }
    try {
      checkActive()
      const data = exactObject(input, ['contextPack', 'question'], 'invalid-request')
      if (typeof data.question !== 'string' || !data.question.trim() || charCount(data.question) > POLICY.maxQuestionChars) throw new AgentRunError('invalid-request')
      const projection = createAgentEvidenceProjection(data.contextPack as AnalysisContextPack)
      runId = projection.runId
      checkActive()
      if (!projection.snapshot.coverage.analyzedMessageCount) throw new AgentRunError('no-data')
      const messages: AgentMessage[] = [initialAgentMessage(data.question, projection)]
      while (modelCalls < POLICY.maxModelCalls) {
        checkActive()
        const request: ToolCallingRequest = freezeJson({
          systemPrompt: AGENT_SYSTEM_PROMPT,
          messages: structuredClone(messages),
          tools: AGENT_TOOLS,
          toolChoice: modelCalls === POLICY.maxModelCalls - 1 ? 'none' : 'auto',
          maxOutputTokens: POLICY.maxOutputTokens
        })
        if (charCount(JSON.stringify(request)) > POLICY.maxRequestChars) throw new AgentRunError('budget-exceeded')
        modelCalls++; event('model-start')
        const raw = await boundedOperation(async signal => {
          try { return await this.provider.generate(request, { signal }) }
          catch (error) { throw new AgentRunError(error instanceof ToolCallingProviderError ? error.code : 'provider-unavailable') }
        }, controller.signal, POLICY.modelTimeoutMs)
        checkActive()
        const response = validateToolCallingResponse(raw)
        event('model-complete')
        if (response.type === 'final') {
          const result = parseInteractionReasoningOutput(response.text)
          const bindings = projection.aliasBindings.filter(binding => delivered.has(binding.promptId))
          const validated = validateReasoningCitations(result, projection.snapshot, [...delivered], bindings)
          checkActive(); event('complete')
          return freezeJson({ ok: true, value: { result: validated, contextPack: projection.snapshot }, metadata: metadata() })
        }
        if (modelCalls >= POLICY.maxModelCalls) throw new AgentRunError('budget-exceeded')
        // Preflight every call and the entire budget before the first read or state update.
        const batch = validateToolBatch(response.calls, projection, usedCallIds, toolCalls)
        messages.push({ role: 'assistant', calls: response.calls })
        for (const call of batch) {
          checkActive()
          usedCallIds.add(call.id); toolCalls++; event('tool-start', { toolName: call.name })
          const content = await boundedOperation(() => executeReadOnlyTool(call, projection), controller.signal, POLICY.toolTimeoutMs)
          checkActive()
          const newIds = call.name === 'read_evidence' ? call.arguments.evidenceIds : []
          const nextDelivered = [...new Set([...delivered, ...newIds])]
          const message: AgentMessage = { role: 'tool', callId: call.id, name: call.name,
            content: JSON.stringify({ result: content, deliveredIds: nextDelivered }) }
          // Do not mark material delivered if it cannot fit into the next provider request.
          const nextRequest = { ...request, messages: [...messages, message] }
          if (charCount(JSON.stringify(nextRequest)) > POLICY.maxRequestChars) throw new AgentRunError('budget-exceeded')
          messages.push(message)
          newIds.forEach(id => delivered.add(id))
          event('tool-complete', { toolName: call.name })
        }
      }
      throw new AgentRunError('budget-exceeded')
    } catch (error) {
      const code: AgentErrorCode = error instanceof AgentRunError ? error.code
        : error instanceof AnalysisContextValidationError ? 'invalid-context'
        : error instanceof InteractionReasoningValidationError || error instanceof ReasoningOutputParseError ? 'invalid-output'
        : error instanceof EvidenceCitationValidationError ? 'invalid-citation' : 'internal'
      event('failed', { code })
      return freezeJson({ ok: false, error: agentFailure(code), metadata: metadata() })
    } finally {
      clearTimeout(runTimeout)
      options.signal?.removeEventListener('abort', cancel)
    }
  }
}
