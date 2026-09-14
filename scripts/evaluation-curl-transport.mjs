import { spawn } from 'node:child_process'

/** CLI only: secrets go through stdin, never argv or logs. No redirect/retry. */
export function createEvaluationCurlTransport(proxy, parentSignal) {
  const parsed = new URL(proxy)
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use a local HTTP proxy')
  return async (url, init) => {
    const signal = AbortSignal.any([parentSignal, ...(init.signal ? [init.signal] : [])])
    if (signal.aborted) throw new Error('Transport cancelled')
    const child = spawn('/usr/bin/curl', ['--silent', '--show-error', '--proxy', proxy, '--request', 'POST',
      '--config', '-', '--data-binary', '@/dev/fd/3', '--write-out', '\n%{http_code}', url], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })
    const abort = () => child.kill('SIGTERM')
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const chunks = []; let size = 0
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 1_100_000) abort(); else chunks.push(chunk) })
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.stdio[3].on('error', () => {})
    const authorization = new Headers(init.headers).get('Authorization')
    child.stdin.end(`header = "Content-Type: application/json"\nheader = ${JSON.stringify('Authorization: ' + authorization)}\n`)
    child.stdio[3].end(init.body)
    try {
      const code = await new Promise(resolve => { child.on('error', () => resolve(-1)); child.on('close', resolve) })
      if (code !== 0 || signal.aborted || size > 1_100_000) throw new Error('Transport failed')
      const output = Buffer.concat(chunks).toString('utf8'); const split = output.lastIndexOf('\n')
      return new Response(output.slice(0, split), { status: Number(output.slice(split + 1)) })
    } finally { signal.removeEventListener('abort', abort) }
  }
}
