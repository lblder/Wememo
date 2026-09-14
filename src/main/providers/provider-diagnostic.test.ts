import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekProvider, type ProviderTransport } from './deepseek-provider'
import { DeepSeekToolCallingProvider } from './deepseek-tool-calling-provider'
import { ProviderDiagnosticTracker, type ProviderCallDiagnostic, type ProviderDiagnosticObserver } from './provider-diagnostic'
import { AGENT_TOOLS } from '../evidence-agent/agent-tools'
import { AgentRunError } from '../evidence-agent/agent-errors'
import { evaluateReliabilityRun } from '../evaluation/reliability/evaluation'
import { RELIABILITY_CASES } from '../evaluation/reliability/cases'
import { demoPack } from '../reasoning/reasoning-test-fixtures'

const config = { apiKey: 'SECRET_API_KEY', modelId: 'deepseek-flash', endpoint: 'https://api.deepseek.com/chat/completions' }
const direct = { systemPrompt: 'SECRET_PROMPT', userPrompt: 'SECRET_EXCERPT', responseFormat: 'json' as const }
const agent = { systemPrompt: 'SECRET_PROMPT', messages: [{ role: 'user' as const, content: 'SECRET_EXCERPT' }], tools: AGENT_TOOLS, toolChoice: 'auto' as const, maxOutputTokens: 4096 }
const envelope = () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] })
const call = (mode: string, transport: ProviderTransport, observer: ProviderDiagnosticObserver, signal = new AbortController().signal) => mode === 'direct'
  ? new DeepSeekProvider(config, transport, observer).generate(direct)
  : new DeepSeekToolCallingProvider(config, transport, observer).generate(agent, { signal })
afterEach(() => vi.useRealTimers())

describe.each(['direct', 'agent'])('%s safe diagnostics', mode => {
  it.each([400, 401, 402, 422, 429, 500, 503])('retains HTTP %s without raw body/header values or retry', async status => {
    const events: ProviderCallDiagnostic[] = []
    const transport = vi.fn<ProviderTransport>().mockResolvedValue(new Response('SECRET_BODY', { status,
      headers: { 'retry-after': '12', 'x-request-id': 'SECRET_SCOPE_AND_KEY', authorization: 'SECRET_AUTH', 'set-cookie': 'SECRET_COOKIE' } }))
    await expect(call(mode, transport, item => events.push(item))).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ outcome: 'failure', kind: 'http', httpStatus: status, phase: 'waiting-response', safeMessage: `http_${status}`, retryAfter: '12', modelId: 'deepseek-flash' })
    expect(events[0].requestIdSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(events)).not.toContain('SECRET')
  })
  it.each([
    ['ENOTFOUND', 'network', 'dns_failure'], ['EAI_AGAIN', 'network', 'dns_failure'],
    ['ECONNRESET', 'network', 'connection_reset'], ['ECONNREFUSED', 'network', 'network_failure'],
    ['ETIMEDOUT', 'timeout', 'request_timeout'], ['UND_ERR_HEADERS_TIMEOUT', 'timeout', 'request_timeout'],
    ['CURLE_RECV_ERROR', 'network', 'network_failure'], ['SECRET_BAD_CODE', 'network', 'network_failure']
  ])('whitelists transport code %s and ignores error text', async (code, kind, safeMessage) => {
    const events: ProviderCallDiagnostic[] = []
    const error = new TypeError('SECRET_HEADERS_PROMPT', { cause: Object.assign(new Error('SECRET_BODY'), { code }) })
    await expect(call(mode, async () => { throw error }, item => events.push(item))).rejects.toThrow()
    expect(events[0]).toMatchObject({ kind, safeMessage, errorName: 'TypeError' })
    expect(JSON.stringify(events)).not.toContain('SECRET')
  })
  it.each(['not JSON', '{', JSON.stringify({ choices: [] })])('distinguishes JSON/envelope decoding from HTTP failure', async body => {
    const events: ProviderCallDiagnostic[] = []
    await expect(call(mode, async () => new Response(body), item => events.push(item))).rejects.toThrow()
    expect(events[0]).toMatchObject({ outcome: 'failure', kind: 'response-decode', phase: 'decoding-response', httpStatus: 200 })
  })
  it('distinguishes failed response stream from envelope decoding', async () => {
    const events: ProviderCallDiagnostic[] = []
    const stream = new ReadableStream({ start(controller) { controller.error(Object.assign(new Error('SECRET_CHAT'), { code: 'ECONNRESET' })) } })
    await expect(call(mode, async () => new Response(stream), item => events.push(item))).rejects.toThrow()
    expect(events[0]).toMatchObject({ kind: 'response-decode', phase: 'reading-body', httpStatus: 200, transportCode: 'ECONNRESET' })
    expect(JSON.stringify(events)).not.toContain('SECRET')
  })
  it('drops unsafe retry headers and does not retain result content on success', async () => {
    const events: ProviderCallDiagnostic[] = []
    const response = envelope(); response.headers.set('retry-after', 'SECRET_CHAT'); response.headers.set('x-request-id', 'x'.repeat(257))
    await call(mode, async () => response, item => events.push(item))
    expect(events[0]).toMatchObject({ outcome: 'success', httpStatus: 200, phase: 'decoding-response' })
    expect(events[0]).not.toHaveProperty('retryAfter')
    expect(events[0]).not.toHaveProperty('requestIdSha256')
    expect(JSON.stringify(events)).not.toContain('SECRET')
  })
  it('does not let diagnostic observer exceptions change provider results', async () => {
    await expect(call(mode, async () => envelope(), () => { throw new Error('observer failed') })).resolves.toBeDefined()
  })
})

it('direct deadline emits a timeout even if transport never settles', async () => {
  vi.useFakeTimers()
  const events: ProviderCallDiagnostic[] = []
  void call('direct', () => new Promise(() => {}), item => events.push(item))
  await vi.advanceTimersByTimeAsync(60000)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ kind: 'timeout', safeMessage: 'request_timeout', durationMs: 60000 })
})
it.each(['timeout', 'cancelled'] as const)('agent preserves boundary %s, emits once, and ignores late completion', async code => {
  const abort = new AbortController(); const events: ProviderCallDiagnostic[] = []
  let release!: (value: Response) => void
  const pending = call('agent', () => new Promise(resolve => { release = resolve }), item => events.push(item), abort.signal)
  const rejected = expect(pending).rejects.toThrow()
  abort.abort(new AgentRunError(code))
  expect(events[0]).toMatchObject({ kind: code })
  release(envelope()); await rejected
  expect(events).toHaveLength(1)
})
it('direct transport cancellation remains distinct from its own timeout', async () => {
  const events: ProviderCallDiagnostic[] = []
  await expect(call('direct', async () => { throw new AgentRunError('cancelled') }, item => events.push(item))).rejects.toThrow()
  expect(events[0]).toMatchObject({ kind: 'cancelled' })
})
it('does not start transport for pre-cancelled agent request', async () => {
  const abort = new AbortController(); abort.abort('SECRET_REASON')
  const events: ProviderCallDiagnostic[] = []; const transport = vi.fn<ProviderTransport>()
  await expect(call('agent', transport, item => events.push(item), abort.signal)).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
  expect(events[0]).toMatchObject({ kind: 'cancelled', phase: 'request' })
})
it('handles curl partial bodies and known HTTP status without retaining raw failure details', () => {
  const events: ProviderCallDiagnostic[] = []
  const tracker = new ProviderDiagnosticTracker('deepseek', 'SECRET_BAD_MODEL', new AbortController().signal, item => events.push(item))
  tracker.failure(Object.assign(new Error('SECRET_BODY'), { code: 'CURLE_PARTIAL_FILE', httpStatus: 200 }))
  expect(events[0]).toMatchObject({ modelId: 'invalid-model', kind: 'response-decode', phase: 'reading-body', httpStatus: 200 })
  expect(JSON.stringify(events)).not.toContain('SECRET')
})
it.each(['direct', 'agent'] as const)('D6 %s record retains diagnostics independently of frozen runtime error code', async mode => {
  const { record } = await evaluateReliabilityRun({ testCase: RELIABILITY_CASES[0], repeatIndex: 1, mode, variant: 'V0',
    contextPack: demoPack(), providerId: 'deepseek', modelId: 'deepseek-flash' }, (_signal, observe) => ({
    direct: new DeepSeekProvider(config, async () => new Response('SECRET_BODY', { status: 402 }), observe),
    agent: new DeepSeekToolCallingProvider(config, async () => new Response('SECRET_BODY', { status: 402 }), observe)
  }))
  expect(record).toMatchObject({ failureCode: 'provider_error', runtimeFailureCode: 'provider-unavailable', providerResponses: 0, modelCalls: 1,
    providerDiagnostics: [{ kind: 'http', httpStatus: 402, safeMessage: 'http_402' }] })
  expect(JSON.stringify(record)).not.toContain('SECRET')
})
it('D6 direct records cancellation before freezing, even when transport ignores abort', async () => {
  vi.useFakeTimers()
  const abort = new AbortController()
  let release!: (value: Response) => void
  const pending = evaluateReliabilityRun({ testCase: RELIABILITY_CASES[0], repeatIndex: 1, mode: 'direct', variant: 'V0',
    contextPack: demoPack(), providerId: 'deepseek', modelId: 'deepseek-flash' }, (signal, observe) => ({
    direct: new DeepSeekProvider(config, () => new Promise(resolve => { release = resolve }), observe, signal),
    agent: new DeepSeekToolCallingProvider(config, async () => envelope(), observe)
  }), abort.signal)
  await vi.advanceTimersByTimeAsync(1); abort.abort('SECRET')
  const { record } = await pending
  expect(record).toMatchObject({ failureCode: 'cancelled', providerDiagnostics: [{ kind: 'cancelled' }] })
  release(envelope()); await vi.advanceTimersByTimeAsync(1)
  expect(record.providerDiagnostics).toHaveLength(1)
  expect(record.providerResponses).toBe(0)
})
