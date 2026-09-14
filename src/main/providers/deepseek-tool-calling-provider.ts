import {
  ToolCallingProviderError,
  type ToolCallingProvider, type ToolCallingRequest, type ToolCallingResponse
} from '../evidence-agent/tool-calling-provider'
import { isDeepSeekEndpoint, type DeepSeekConfiguration } from './deepseek-config'
import { ProviderDiagnosticTracker, type ProviderDiagnosticObserver } from './provider-diagnostic'

export type DeepSeekToolTransport = (url: string, init: RequestInit) => Promise<Response>
const MAX_ENVELOPE_BYTES = 1_000_000

/** Invalid/truncated API envelopes are protocol failures, never fabricated Agent responses.
 * Uses the existing provider-unavailable port code to keep G1/G2 contracts frozen.
 */
export class DeepSeekToolProtocolError extends ToolCallingProviderError {
  constructor() { super('provider-unavailable'); this.name = 'DeepSeekToolProtocolError' }
}

/** Wire translation only. Do not add permissions, alias filtering or tool execution here. */
export function encodeDeepSeekToolRequest(request: ToolCallingRequest, modelId: string) {
  const messages = request.messages.map(message => {
    if (message.role === 'user') return { role: 'user', content: message.content }
    if (message.role === 'tool') return { role: 'tool', tool_call_id: message.callId, content: message.content }
    return { role: 'assistant', content: null, tool_calls: message.calls.map(call => ({
      id: call.id, type: 'function', function: { name: call.name, arguments: call.argumentsJson }
    })) }
  })
  return {
    model: modelId,
    messages: [{ role: 'system', content: request.systemPrompt }, ...messages],
    tools: request.tools.map(tool => ({ type: 'function', function: {
      name: tool.name, description: tool.description, parameters: tool.parameters
    } })),
    tool_choice: request.toolChoice,
    thinking: { type: 'disabled' },
    stream: false,
    max_tokens: request.maxOutputTokens,
    // Let native tool selection operate normally; final-only turns request JSON mode.
    ...(request.toolChoice === 'none' ? { response_format: { type: 'json_object' } } : {})
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeepSeekToolProtocolError()
  return value as Record<string, unknown>
}

export function decodeDeepSeekToolResponse(value: unknown): ToolCallingResponse {
  const envelope = record(value)
  if (!Array.isArray(envelope.choices) || envelope.choices.length !== 1) throw new DeepSeekToolProtocolError()
  const choice = record(envelope.choices[0])
  const message = record(choice.message)
  if (message.role !== 'assistant' || message.refusal || (message.content != null && typeof message.content !== 'string')) throw new DeepSeekToolProtocolError()
  if (choice.finish_reason === 'tool_calls') {
    if (!Array.isArray(message.tool_calls) || !message.tool_calls.length) throw new DeepSeekToolProtocolError()
    const calls = message.tool_calls.map(value => {
      const call = record(value); const fn = record(call.function)
      if (call.type !== 'function' || typeof call.id !== 'string' || typeof fn.name !== 'string' || typeof fn.arguments !== 'string') throw new DeepSeekToolProtocolError()
      // Preserve even unknown names/malformed argument JSON. Runtime preflight is authoritative.
      return { id: call.id, name: fn.name, argumentsJson: fn.arguments }
    })
    return { type: 'tool_calls', calls }
  }
  if (choice.finish_reason !== 'stop' || typeof message.content !== 'string' || !message.content.trim() ||
      (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0))) throw new DeepSeekToolProtocolError()
  // No JSON repair, field deletion or evidence-ID rewriting. Frozen validators consume this text.
  return { type: 'final', text: message.content }
}

/** Standalone adapter. Main can inject Electron net.fetch; tests inject an offline transport.
 * The Runner owns step/run deadlines, cancellation, retries (none) and all Agent budgets.
 */
export class DeepSeekToolCallingProvider implements ToolCallingProvider {
  readonly id = 'deepseek-tool-calling'
  readonly #configuration: DeepSeekConfiguration
  readonly #transport: DeepSeekToolTransport

  constructor(configuration: DeepSeekConfiguration, transport: DeepSeekToolTransport = globalThis.fetch, private readonly observe?: ProviderDiagnosticObserver) {
    if (!configuration.apiKey.trim() || /[\r\n]/.test(configuration.apiKey) || !isDeepSeekEndpoint(configuration.endpoint) ||
        !/^deepseek-[a-z0-9.-]{1,80}$/.test(configuration.modelId)) throw new ToolCallingProviderError('authentication')
    this.#configuration = { ...configuration }
    this.#transport = transport
  }

  async generate(request: ToolCallingRequest, { signal }: { signal: AbortSignal }): Promise<ToolCallingResponse> {
    const diagnostic = new ProviderDiagnosticTracker(this.id, this.#configuration.modelId, signal, this.observe)
    const checkAbort = (): void => { if (signal.aborted) throw new ToolCallingProviderError('provider-unavailable') }
    try {
      checkAbort()
      diagnostic.phase = 'waiting-response'
      const response = await this.#transport(this.#configuration.endpoint, {
        method: 'POST', signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.#configuration.apiKey}` },
        body: JSON.stringify(encodeDeepSeekToolRequest(request, this.#configuration.modelId))
      })
      diagnostic.received(response)
      checkAbort()
      if (!response.ok) {
        await response.body?.cancel()
        throw new ToolCallingProviderError(response.status === 401 || response.status === 403 ? 'authentication'
          : response.status === 429 ? 'rate-limited' : 'provider-unavailable')
      }
      diagnostic.phase = 'reading-body'
      if (!response.body) throw new DeepSeekToolProtocolError()
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytesRead = 0
      try {
        while (true) {
          checkAbort()
          const { done, value } = await reader.read()
          checkAbort()
          if (done) break
          bytesRead += value.byteLength
          if (bytesRead > MAX_ENVELOPE_BYTES) {
            await reader.cancel()
            throw new DeepSeekToolProtocolError()
          }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      const bytes = new Uint8Array(bytesRead)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      let data: unknown
      diagnostic.phase = 'decoding-response'
      try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
      catch { throw new DeepSeekToolProtocolError() }
      checkAbort()
      const result = decodeDeepSeekToolResponse(data)
      diagnostic.success()
      return result
    } catch (error) {
      diagnostic.failure(error)
      if (error instanceof ToolCallingProviderError) throw error
      throw new ToolCallingProviderError('provider-unavailable')
    }
  }
}
