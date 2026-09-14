import type { LLMProvider, LLMProviderRequest, LLMProviderResponse } from '../reasoning/llm-provider'
import { isDeepSeekEndpoint, type DeepSeekConfiguration } from './deepseek-config'
import { ProviderRequestError } from './provider-request-error'
import { DEEPSEEK_OUTPUT_INSTRUCTIONS } from './deepseek-output-instructions'
import { ProviderDiagnosticTracker, type ProviderDiagnosticObserver } from './provider-diagnostic'

export const DEEPSEEK_REQUEST_TIMEOUT_MS = 60_000
export type ProviderTransport = (url: string, init: RequestInit) => Promise<Response>
const MAX_RESPONSE_BYTES = 1_000_000

/** HTTP adapter, outside the frozen reasoning core. Electron injects net.fetch
 * to honor the system proxy; unit tests inject a transport with no network.
 */
export class DeepSeekProvider implements LLMProvider {
  readonly id = 'deepseek'
  readonly #configuration: DeepSeekConfiguration
  readonly #transport: ProviderTransport

  constructor(configuration: DeepSeekConfiguration, transport: ProviderTransport = globalThis.fetch, private readonly observe?: ProviderDiagnosticObserver,
    private readonly diagnosticSignal?: AbortSignal) {
    if (!configuration.apiKey.trim() || /[\r\n]/.test(configuration.apiKey) || !isDeepSeekEndpoint(configuration.endpoint)) {
      throw new ProviderRequestError('authentication')
    }
    this.#configuration = { ...configuration }
    this.#transport = transport
  }

  async generate(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const controller = new AbortController()
    // Observe the caller's existing boundary without changing the Provider port or its deadline.
    const diagnostic = new ProviderDiagnosticTracker(this.id, this.#configuration.modelId,
      this.diagnosticSignal ? AbortSignal.any([controller.signal, this.diagnosticSignal]) : controller.signal, this.observe)
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), DEEPSEEK_REQUEST_TIMEOUT_MS)
    try {
      diagnostic.phase = 'waiting-response'
      const response = await this.#transport(this.#configuration.endpoint, {
        method: 'POST', signal: controller.signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.#configuration.apiKey}` },
        body: JSON.stringify({
          model: this.#configuration.modelId,
          messages: [{ role: 'system', content: request.systemPrompt + '\n' + DEEPSEEK_OUTPUT_INSTRUCTIONS }, { role: 'user', content: request.userPrompt }],
          response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, stream: false, max_tokens: 4096
        })
      })
      diagnostic.received(response)
      if (!response.ok) {
        await response.body?.cancel()
        throw new ProviderRequestError(response.status === 401 || response.status === 403 ? 'authentication'
          : response.status === 429 ? 'rate-limited' : 'provider-unavailable')
      }
      diagnostic.phase = 'reading-body'
      if (!response.body) throw new ProviderRequestError('invalid-output')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let byteCount = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          byteCount += value.byteLength
          if (byteCount > MAX_RESPONSE_BYTES) {
            await reader.cancel()
            throw new ProviderRequestError('invalid-output')
          }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      const bytes = new Uint8Array(byteCount)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      let data: unknown
      diagnostic.phase = 'decoding-response'
      try { data = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new ProviderRequestError('invalid-output') }
      const envelope = data as { choices?: { finish_reason?: string; message?: { role?: string; content?: unknown; tool_calls?: unknown; refusal?: unknown } }[] }
      const choice = envelope?.choices?.[0]
      if (!Array.isArray(envelope?.choices) || envelope.choices.length !== 1 || choice?.finish_reason !== 'stop' ||
          choice.message?.role !== 'assistant' || typeof choice.message.content !== 'string' || !choice.message.content.trim() ||
          (choice.message.tool_calls != null && (!Array.isArray(choice.message.tool_calls) || choice.message.tool_calls.length > 0)) ||
          choice.message.refusal) throw new ProviderRequestError('invalid-output')
      diagnostic.success()
      return { text: choice.message.content, providerId: this.id, modelId: this.#configuration.modelId }
    } catch (error) {
      diagnostic.failure(error)
      if (controller.signal.aborted) throw new ProviderRequestError('timeout')
      if (error instanceof ProviderRequestError) throw error
      throw new ProviderRequestError('provider-unavailable')
    } finally { clearTimeout(timeout) }
  }
}
