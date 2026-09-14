import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, it, vi } from 'vitest'
// @ts-expect-error CLI JavaScript module has no declaration file.
import { createEvaluationCurlTransport } from '../../../scripts/evaluation-curl-transport.mjs'

function stubCurl(code: number, output = '\n000', headers = '') {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    stdio: [new PassThrough(), new PassThrough(), new PassThrough(), new PassThrough(), new PassThrough()], kill: vi.fn() })
  const spawn = vi.fn(() => {
    queueMicrotask(() => { child.stdio[4].write(headers); child.stdout.write(output); child.emit('close', code) })
    return child
  })
  return { child, spawn }
}
const init = { body: 'SECRET_PROMPT', headers: { Authorization: 'Bearer SECRET_KEY' } }
it.each([[5, 'CURLE_COULDNT_RESOLVE_PROXY'], [6, 'CURLE_COULDNT_RESOLVE_HOST'], [7, 'CURLE_COULDNT_CONNECT'],
  [18, 'CURLE_PARTIAL_FILE'], [28, 'CURLE_OPERATION_TIMEDOUT'], [35, 'CURLE_SSL_CONNECT_ERROR'], [52, 'CURLE_GOT_NOTHING'],
  [55, 'CURLE_SEND_ERROR'], [56, 'CURLE_RECV_ERROR'], [60, 'CURLE_PEER_FAILED_VERIFICATION'], [92, 'CURLE_HTTP2_STREAM'], [99, 'CURL_OTHER']])('preserves safe curl exit %s and never retries', async (exit, code) => {
  const { spawn } = stubCurl(Number(exit))
  const transport = createEvaluationCurlTransport('http://127.0.0.1:7897', new AbortController().signal, spawn)
  await expect(transport('https://api.deepseek.com/chat/completions', init)).rejects.toMatchObject({ code, message: 'Evaluation transport failed' })
  expect(spawn).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(spawn.mock.calls)).not.toContain('SECRET')
})
it('reads origin metadata after CONNECT headers, never exposes other headers, and keeps auth out of argv', async () => {
  const { spawn } = stubCurl(0, 'SECRET_RESPONSE\n429', 'HTTP/1.1 200 Connection established\r\nx-request-id: proxy\r\n\r\nHTTP/2 429\r\nretry-after: 20\r\nx-request-id: origin\r\nset-cookie: SECRET_COOKIE\r\n\r\n')
  const response = await createEvaluationCurlTransport('http://127.0.0.1:7897', new AbortController().signal, spawn)('https://api.deepseek.com/chat/completions', init)
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('20')
  expect(response.headers.get('x-request-id')).toBe('origin')
  expect(response.headers.has('set-cookie')).toBe(false)
  expect(await response.text()).toBe('SECRET_RESPONSE')
  expect(JSON.stringify(spawn.mock.calls)).not.toContain('SECRET')
})
it('distinguishes explicit cancellation from signal deadline without starting curl', async () => {
  for (const kind of ['cancelled', 'timeout']) {
    const controller = new AbortController(); controller.abort({ code: kind, message: 'SECRET' })
    const spawn = vi.fn()
    await expect(createEvaluationCurlTransport('http://127.0.0.1:7897', controller.signal, spawn)('https://api.deepseek.com/chat/completions', init)).rejects.toMatchObject({ abortKind: kind })
    expect(spawn).not.toHaveBeenCalled()
  }
})
it('rejects malformed HTTP framing instead of inventing a status', async () => {
  const { spawn } = stubCurl(0, 'SECRET_BODY\n000')
  await expect(createEvaluationCurlTransport('http://127.0.0.1:7897', new AbortController().signal, spawn)('https://api.deepseek.com/chat/completions', init)).rejects.toMatchObject({ code: 'INVALID_HTTP_FRAMING' })
})
