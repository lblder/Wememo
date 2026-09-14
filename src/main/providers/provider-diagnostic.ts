import { createHash } from 'node:crypto'

export type ProviderPhase = 'request' | 'waiting-response' | 'reading-body' | 'decoding-response'
interface ProviderDiagnosticBase {
  providerId: 'deepseek' | 'deepseek-tool-calling'
  modelId: string
  phase: ProviderPhase
  durationMs: number
  httpStatus?: number
  retryAfter?: string
  /** Hash only: arbitrary response header text must never enter diagnostics. */
  requestIdSha256?: string
}
export interface ProviderFailureDiagnostic extends ProviderDiagnosticBase {
  outcome: 'failure'
  kind: 'http' | 'network' | 'timeout' | 'cancelled' | 'response-decode'
  errorName?: string
  transportCode?: string
  safeMessage: string
}
export type ProviderCallDiagnostic = ProviderFailureDiagnostic | (ProviderDiagnosticBase & { outcome: 'success' })
export type ProviderDiagnosticObserver = (diagnostic: ProviderCallDiagnostic) => void

const transportCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'CURLE_COULDNT_RESOLVE_PROXY', 'CURLE_COULDNT_RESOLVE_HOST', 'CURLE_COULDNT_CONNECT', 'CURLE_PARTIAL_FILE',
  'CURLE_OPERATION_TIMEDOUT', 'CURLE_SSL_CONNECT_ERROR', 'CURLE_GOT_NOTHING', 'CURLE_SEND_ERROR',
  'CURLE_RECV_ERROR', 'CURLE_PEER_FAILED_VERIFICATION', 'CURLE_HTTP2_STREAM', 'CURL_OTHER',
  'TRANSPORT_SPAWN_FAILED', 'RESPONSE_TOO_LARGE', 'INVALID_HTTP_FRAMING'])
const timeoutCodes = new Set(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'CURLE_OPERATION_TIMEDOUT'])
const errorNames = new Set(['Error', 'TypeError', 'AbortError', 'TimeoutError', 'ProviderRequestError', 'ToolCallingProviderError', 'DeepSeekToolProtocolError', 'EvaluationTransportError'])
const field = (error: unknown, key: string): unknown => error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined
export function isTimeoutReason(reason: unknown): boolean {
  return field(reason, 'code') === 'timeout' || (reason instanceof DOMException && reason.name === 'TimeoutError')
}

/** Main-only metadata. No response body, request content, raw message, endpoint or scope is accepted. */
export class ProviderDiagnosticTracker {
  phase: ProviderPhase = 'request'
  #started = performance.now()
  #headers: Pick<ProviderDiagnosticBase, 'httpStatus' | 'retryAfter' | 'requestIdSha256'> = {}
  #finished = false
  #abort = (): void => { this.failure(undefined) }
  constructor(private readonly providerId: ProviderDiagnosticBase['providerId'], private readonly modelId: string,
    private readonly signal: AbortSignal, private readonly observer?: ProviderDiagnosticObserver) {
    signal.addEventListener('abort', this.#abort, { once: true })
  }
  received(response: Response): void {
    this.#headers.httpStatus = response.status
    const retry = response.headers.get('retry-after')
    if (retry && /^\d{1,5}$/.test(retry) && Number(retry) <= 86400) this.#headers.retryAfter = retry
    const id = response.headers.get('x-request-id') ?? response.headers.get('request-id')
    if (id && id.length <= 256) this.#headers.requestIdSha256 = createHash('sha256').update(id).digest('hex')
  }
  #base(): ProviderDiagnosticBase {
    return { providerId: this.providerId, modelId: /^deepseek-[a-z0-9.-]{1,80}$/.test(this.modelId) ? this.modelId : 'invalid-model',
      phase: this.phase, durationMs: Math.max(0, Math.round(performance.now() - this.#started)), ...this.#headers }
  }
  #emit(event: ProviderCallDiagnostic): void {
    if (this.#finished) return
    this.#finished = true
    this.signal.removeEventListener('abort', this.#abort)
    // Diagnostics must not change adapter results, even if a consumer fails.
    try { this.observer?.(Object.freeze(event)) } catch { /* No raw observer errors. */ }
  }
  success(): void { this.#emit({ ...this.#base(), outcome: 'success' }) }
  failure(error: unknown): void {
    const status = field(error, 'httpStatus')
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) this.#headers.httpStatus ??= status
    const rawCode = field(error, 'code') ?? field(field(error, 'cause'), 'code')
    const transportCode = typeof rawCode === 'string' && transportCodes.has(rawCode) ? rawCode : undefined
    if (transportCode === 'CURLE_PARTIAL_FILE' || transportCode === 'RESPONSE_TOO_LARGE') this.phase = 'reading-body'
    const rawName = error instanceof Error ? error.name : undefined
    const errorName = rawName && errorNames.has(rawName) ? rawName : undefined
    const aborted = this.signal.aborted || rawName === 'AbortError' || rawCode === 'cancelled' || field(error, 'abortKind') === 'cancelled' || field(error, 'abortKind') === 'timeout'
    const timeout = (this.signal.aborted && isTimeoutReason(this.signal.reason)) || field(error, 'abortKind') === 'timeout' ||
      rawName === 'TimeoutError' || rawCode === 'timeout' || (transportCode && timeoutCodes.has(transportCode))
    const http = this.#headers.httpStatus !== undefined && (this.#headers.httpStatus < 200 || this.#headers.httpStatus >= 300)
    const kind = timeout ? 'timeout' : aborted ? 'cancelled' : http ? 'http'
      : this.phase === 'reading-body' || this.phase === 'decoding-response' || transportCode === 'RESPONSE_TOO_LARGE' || transportCode === 'INVALID_HTTP_FRAMING' ? 'response-decode' : 'network'
    const safeMessage = kind === 'http' ? `http_${this.#headers.httpStatus}` : kind === 'timeout' ? 'request_timeout'
      : kind === 'cancelled' ? 'request_cancelled' : kind === 'response-decode' ? (this.phase === 'decoding-response' ? 'response_decode_failed' : 'response_body_failed')
      : ['ENOTFOUND', 'EAI_AGAIN', 'CURLE_COULDNT_RESOLVE_HOST', 'CURLE_COULDNT_RESOLVE_PROXY'].includes(transportCode ?? '') ? 'dns_failure'
      : transportCode === 'ECONNRESET' ? 'connection_reset' : 'network_failure'
    this.#emit({ ...this.#base(), outcome: 'failure', kind, safeMessage,
      ...(errorName ? { errorName } : {}), ...(transportCode ? { transportCode } : {}) })
  }
}
