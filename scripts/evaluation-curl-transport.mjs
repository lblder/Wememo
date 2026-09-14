import { spawn } from 'node:child_process'

const codes = { 5: 'CURLE_COULDNT_RESOLVE_PROXY', 6: 'CURLE_COULDNT_RESOLVE_HOST', 7: 'CURLE_COULDNT_CONNECT',
  18: 'CURLE_PARTIAL_FILE', 28: 'CURLE_OPERATION_TIMEDOUT', 35: 'CURLE_SSL_CONNECT_ERROR', 52: 'CURLE_GOT_NOTHING',
  55: 'CURLE_SEND_ERROR', 56: 'CURLE_RECV_ERROR', 60: 'CURLE_PEER_FAILED_VERIFICATION', 92: 'CURLE_HTTP2_STREAM' }
export class EvaluationTransportError extends Error {
  constructor(code, signal, httpStatus) {
    super('Evaluation transport failed'); this.name = 'EvaluationTransportError'; this.code = code
    if (signal?.aborted) this.abortKind = signal.reason?.code === 'timeout' || signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled'
    if (Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) this.httpStatus = httpStatus
  }
}

/** CLI only: secrets go through stdin, never argv or logs. No redirect/retry. */
export function createEvaluationCurlTransport(proxy, parentSignal, spawnProcess = spawn) {
  const parsed = new URL(proxy)
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use a local HTTP proxy')
  return async (url, init) => {
    const signal = AbortSignal.any([parentSignal, ...(init.signal ? [init.signal] : [])])
    if (signal.aborted) throw new EvaluationTransportError('CURL_OTHER', signal)
    const child = spawnProcess('/usr/bin/curl', ['--silent', '--show-error', '--proxy', proxy, '--request', 'POST',
      '--config', '-', '--data-binary', '@/dev/fd/3', '--dump-header', '/dev/fd/4', '--write-out', '\n%{http_code}', url], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] })
    const abort = () => child.kill('SIGTERM')
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const chunks = []; let size = 0
    const headerChunks = []; let headerSize = 0
    child.stdio[4].on('data', chunk => { headerSize += chunk.length; if (headerSize <= 65536) headerChunks.push(chunk) })
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 1_100_000) abort(); else chunks.push(chunk) })
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.stdio[3].on('error', () => {})
    const authorization = new Headers(init.headers).get('Authorization')
    child.stdin.end(`header = "Content-Type: application/json"\nheader = ${JSON.stringify('Authorization: ' + authorization)}\n`)
    child.stdio[3].end(init.body)
    try {
      const code = await new Promise(resolve => { child.on('error', () => resolve(-1)); child.on('close', resolve) })
      const output = Buffer.concat(chunks).toString('utf8'); const split = output.lastIndexOf('\n')
      const status = split >= 0 ? Number(output.slice(split + 1)) : 0
      if (code !== 0 || signal.aborted || size > 1_100_000) throw new EvaluationTransportError(
        size > 1_100_000 ? 'RESPONSE_TOO_LARGE' : code === -1 ? 'TRANSPORT_SPAWN_FAILED' : codes[code] ?? 'CURL_OTHER', signal, status)
      if (split < 0 || !Number.isInteger(status) || status < 200 || status > 599) throw new EvaluationTransportError('INVALID_HTTP_FRAMING', signal)
      const headers = new Headers()
      // CONNECT/interim headers are not the origin response. Never forward cookies/auth headers.
      const finalBlock = headerSize <= 65536 ? Buffer.concat(headerChunks).toString('utf8').split(/\r?\n\r?\n/).filter(block => /^HTTP\//.test(block)).at(-1) : undefined
      for (const line of finalBlock?.split(/\r?\n/).slice(1) ?? []) {
        const colon = line.indexOf(':'); const name = line.slice(0, colon).toLowerCase()
        if (['retry-after', 'x-request-id', 'request-id'].includes(name)) {
          try { headers.set(name, line.slice(colon + 1).trim()) } catch { /* Ignore malformed diagnostic headers. */ }
        }
      }
      return new Response([204, 205, 304].includes(status) ? null : output.slice(0, split), { status, headers })
    } finally { signal.removeEventListener('abort', abort) }
  }
}
