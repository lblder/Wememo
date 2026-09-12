import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekProvider, DEEPSEEK_REQUEST_TIMEOUT_MS, type ProviderTransport } from './deepseek-provider'
import { loadDeepSeekConfiguration, isDeepSeekEndpoint } from './deepseek-config'
import { ProviderRequestError } from './provider-request-error'
import { DEEPSEEK_OUTPUT_INSTRUCTIONS } from './deepseek-output-instructions'

const configuration = { apiKey: 'test-only-secret', modelId: 'deepseek-flash', endpoint: 'https://api.deepseek.com/chat/completions' }
const request = { systemPrompt: 'system JSON', userPrompt: '{"selectedEvidence":[]}', responseFormat: 'json' as const }
const envelope = (content = '{"result":true}') => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] })
afterEach(() => vi.useRealTimers())

describe('DeepSeek configuration', () => {
  it('defaults to an unconfigured safe status with no secret field', () => {
    const loaded = loadDeepSeekConfiguration({})
    expect(loaded.configuration).toBeUndefined()
    expect(loaded.status.configured).toBe(false)
    expect(loaded.status.modelId).toBe('deepseek-flash')
    expect(Object.keys(loaded.status)).toEqual(['providerId', 'modelId', 'configured', 'message'])
  })
  it('loads the secret only for Main and exposes no key in status', () => {
    const loaded = loadDeepSeekConfiguration({ DEEPSEEK_API_KEY: 'test-only-secret' })
    expect(loaded.configuration?.apiKey).toBe('test-only-secret')
    expect(loaded.status.configured).toBe(true)
    expect(JSON.stringify(loaded.status)).not.toContain('test-only-secret')
  })
  it('supports explicit official v1 configuration', () => {
    const loaded = loadDeepSeekConfiguration({ WEMEMO_DEEPSEEK_API_KEY: 'test-key', WEMEMO_DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1/' })
    expect(loaded.status.configured).toBe(true)
    expect(loaded.configuration?.endpoint).toBe('https://api.deepseek.com/v1/chat/completions')
  })
  it.each([
    'http://api.deepseek.com/chat/completions',
    'https://evil.example/chat/completions',
    'https://api.deepseek.com.evil.example/chat/completions',
    'https://user:password@api.deepseek.com/chat/completions',
    'https://api.deepseek.com/chat/completions?key=secret',
    'https://127.0.0.1/chat/completions'
  ])('rejects unsafe endpoint %s', (url) => {
    expect(isDeepSeekEndpoint(url)).toBe(false)
    expect(() => new DeepSeekProvider({ ...configuration, endpoint: url })).toThrow(ProviderRequestError)
  })
  it('rejects newline keys and invalid model values without exposing them', () => {
    const loaded = loadDeepSeekConfiguration({ DEEPSEEK_API_KEY: 'bad\nsecret', WEMEMO_DEEPSEEK_MODEL: 'invalid-secret-model' })
    expect(loaded.status.configured).toBe(false)
    expect(JSON.stringify(loaded.status)).not.toContain('invalid-secret-model')
  })
})

describe('DeepSeekProvider', () => {
  it('accepts an empty tool_calls array in a completed text response', async () => {
    const transport = vi.fn<ProviderTransport>().mockResolvedValue(Response.json({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}', tool_calls: [] } }]
    }))
    await expect(new DeepSeekProvider(configuration, transport).generate(request)).resolves.toMatchObject({ text: '{}' })
  })
  it('sends only the two prompts with JSON mode, abort signal and no redirect or tools', async () => {
    const transport = vi.fn<ProviderTransport>().mockResolvedValue(Response.json(envelope()))
    const provider = new DeepSeekProvider(configuration, transport)
    expect(await provider.generate(request)).toEqual({ text: '{"result":true}', providerId: 'deepseek', modelId: 'deepseek-flash' })
    const [url, init] = transport.mock.calls[0]
    expect(url).toBe(configuration.endpoint)
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-only-secret' })
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'deepseek-flash', messages: [{ role: 'system', content: request.systemPrompt + '\n' + DEEPSEEK_OUTPUT_INSTRUCTIONS }, { role: 'user', content: request.userPrompt }],
      response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, stream: false, max_tokens: 4096
    })
    expect(JSON.stringify(provider)).not.toContain('test-only-secret')
  })
  it.each([[401, 'authentication'], [403, 'authentication'], [429, 'rate-limited'], [500, 'provider-unavailable']])('maps HTTP %s without disclosing response bodies', async (status, code) => {
    const transport = vi.fn<ProviderTransport>().mockResolvedValue(new Response('SENSITIVE_PROVIDER_BODY', { status: status as number }))
    const result = new DeepSeekProvider(configuration, transport).generate(request)
    await expect(result).rejects.toMatchObject({ code, message: code })
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('wraps network errors without copying their sensitive messages', async () => {
    const transport = vi.fn<ProviderTransport>().mockRejectedValue(new Error('test-only-secret URL and request body'))
    await expect(new DeepSeekProvider(configuration, transport).generate(request)).rejects.toMatchObject({ code: 'provider-unavailable', message: 'provider-unavailable' })
  })
  it('aborts on timeout and never retries', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<ProviderTransport>((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const result = new DeepSeekProvider(configuration, transport).generate(request)
    const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(DEEPSEEK_REQUEST_TIMEOUT_MS)
    await assertion
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it.each([
    null, {}, { choices: [] },
    { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: null } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}', tool_calls: [{ type: 'function' }] } }] }
  ])('rejects malformed/truncated/tool responses', async (data) => {
    const transport = vi.fn<ProviderTransport>().mockResolvedValue(Response.json(data))
    await expect(new DeepSeekProvider(configuration, transport).generate(request)).rejects.toMatchObject({ code: 'invalid-output' })
  })
  it('rejects non-JSON envelopes', async () => {
    const transport = vi.fn<ProviderTransport>().mockResolvedValue(new Response('not JSON'))
    await expect(new DeepSeekProvider(configuration, transport).generate(request)).rejects.toMatchObject({ code: 'invalid-output' })
  })
  it('caps response size before JSON parsing', async () => {
    const transport = vi.fn<ProviderTransport>().mockResolvedValue(new Response('x'.repeat(1_000_001)))
    await expect(new DeepSeekProvider(configuration, transport).generate(request)).rejects.toMatchObject({ code: 'invalid-output' })
  })
})
