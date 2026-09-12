import { AGENT_POLICY, charCount } from './agent-policy'
import { AgentRunError, denseArray, exactObject } from './agent-errors'

export interface AgentToolCall {
  id: string
  name: string
  /** Raw JSON arguments, parsed and validated by the runtime before execution. */
  argumentsJson: string
}
export type ToolCallingResponse = { type: 'final'; text: string } | { type: 'tool_calls'; calls: AgentToolCall[] }
export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; calls: AgentToolCall[] }
  | { role: 'tool'; callId: string; name: string; content: string }

export interface AgentToolDefinition {
  name: 'read_metrics' | 'read_evidence'
  description: string
  parameters: Readonly<Record<string, unknown>>
}
export interface ToolCallingRequest {
  systemPrompt: string
  messages: AgentMessage[]
  tools: readonly AgentToolDefinition[]
  toolChoice: 'auto' | 'none'
  maxOutputTokens: number
}
export interface ToolCallingProvider {
  readonly id: string
  generate(request: ToolCallingRequest, options: { signal: AbortSignal }): Promise<ToolCallingResponse>
}

/** Adapters classify errors without returning raw bodies, headers or provider messages. */
export class ToolCallingProviderError extends Error {
  constructor(readonly code: 'rate-limited' | 'authentication' | 'provider-unavailable') {
    super(code); this.name = 'ToolCallingProviderError'
  }
}

export function validateToolCallingResponse(value: unknown): ToolCallingResponse {
  if (!value || typeof value !== 'object') throw new AgentRunError('invalid-output')
  const type = Object.getOwnPropertyDescriptor(value, 'type')?.value
  if (type === 'final') {
    const data = exactObject(value, ['type', 'text'], 'invalid-output')
    if (typeof data.text !== 'string' || !data.text.trim() || charCount(data.text) > AGENT_POLICY.maxResponseChars) throw new AgentRunError('invalid-output')
    return { type, text: data.text }
  }
  if (type !== 'tool_calls') throw new AgentRunError('invalid-output')
  const data = exactObject(value, ['type', 'calls'], 'invalid-output')
  if (Array.isArray(data.calls) && data.calls.length > AGENT_POLICY.maxToolCalls) throw new AgentRunError('budget-exceeded')
  const calls = denseArray(data.calls, AGENT_POLICY.maxToolCalls, 'invalid-output').map(value => {
    const call = exactObject(value, ['id', 'name', 'argumentsJson'], 'invalid-output')
    if (typeof call.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(call.id) ||
        typeof call.name !== 'string' || call.name.length > 128 || typeof call.argumentsJson !== 'string' ||
        charCount(call.argumentsJson) > AGENT_POLICY.maxResponseChars) throw new AgentRunError('invalid-output')
    return { id: call.id, name: call.name, argumentsJson: call.argumentsJson }
  })
  if (!calls.length || charCount(JSON.stringify(calls)) > AGENT_POLICY.maxResponseChars) throw new AgentRunError('invalid-output')
  return { type, calls }
}
