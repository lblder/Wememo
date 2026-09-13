import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekToolCallingProvider, DeepSeekToolProtocolError, decodeDeepSeekToolResponse, encodeDeepSeekToolRequest, type DeepSeekToolTransport } from './deepseek-tool-calling-provider'
import { ToolCallingProviderError, type ToolCallingRequest } from '../evidence-agent/tool-calling-provider'
import { AGENT_TOOLS } from '../evidence-agent/agent-tools'
import { BoundedAgentRunner } from '../evidence-agent/bounded-agent-runner'
import { demoPack } from '../reasoning/reasoning-test-fixtures'
import { finalText } from '../evidence-agent/agent-test-fixtures'

const config = { apiKey: 'test-only-secret', modelId: 'deepseek-flash', endpoint: 'https://api.deepseek.com/chat/completions' }
const request: ToolCallingRequest = { systemPrompt: 'Strict JSON policy', messages: [{ role: 'user', content: '{"catalog":[]}' }], tools: AGENT_TOOLS, toolChoice: 'auto', maxOutputTokens: 4096 }
const apiCall = (id = 'call-1', name = 'read_evidence', args = '{"evidenceIds":["ev-run-001"]}') => ({ id, type: 'function', function: { name, arguments: args } })
const toolEnvelope = (items = [apiCall()]) => ({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: items } }] })
const finalEnvelope = (content = '{}') => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] })
const generate = (transport: DeepSeekToolTransport, value = request, signal = new AbortController().signal) => new DeepSeekToolCallingProvider(config, transport).generate(value, { signal })
afterEach(() => vi.useRealTimers())

describe('DeepSeek tool wire translation', () => {
  it('maps initial messages, function schemas and runtime-owned controls without mutation', () => {
    const before = structuredClone(request)
    const wire = encodeDeepSeekToolRequest(request, config.modelId)
    expect(wire).toMatchObject({ model: 'deepseek-flash', max_tokens: 4096, tool_choice: 'auto', thinking: { type: 'disabled' }, stream: false })
    expect(wire.messages).toEqual([{ role: 'system', content: request.systemPrompt }, ...request.messages])
    expect(wire.tools[0]).toEqual({ type: 'function', function: { name: 'read_metrics', description: AGENT_TOOLS[0].description, parameters: AGENT_TOOLS[0].parameters } })
    expect(wire).not.toHaveProperty('response_format')
    expect(wire).not.toHaveProperty('user_id')
    expect(request).toEqual(before)
  })
  it('preserves assistant call IDs/argument strings and pairs tool replies by tool_call_id', () => {
    const args = '{ "evidenceIds": ["ev-opaque-001"] }'
    const wire = encodeDeepSeekToolRequest({ ...request, messages: [...request.messages,
      { role: 'assistant', calls: [{ id: 'call_123', name: 'read_evidence', argumentsJson: args }] },
      { role: 'tool', callId: 'call_123', name: 'read_evidence', content: '{"result":{"evidence":[]},"deliveredIds":[]}' }
    ] }, config.modelId)
    expect(wire.messages[2]).toEqual({ role: 'assistant', content: null, tool_calls: [apiCall('call_123', 'read_evidence', args)] })
    expect(wire.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_123', content: '{"result":{"evidence":[]},"deliveredIds":[]}' })
    expect(JSON.stringify(wire)).not.toContain('argumentsJson')
    expect(JSON.stringify(wire)).not.toContain('callId')
  })
  it('honors final-only mode and the requested token limit', () => {
    const wire = encodeDeepSeekToolRequest({ ...request, toolChoice: 'none', maxOutputTokens: 256 }, config.modelId)
    expect(wire).toMatchObject({ tool_choice: 'none', max_tokens: 256, response_format: { type: 'json_object' } })
  })
  it('translates every call in a batch without changing raw arguments', () => {
    const envelope = toolEnvelope([apiCall('one'), apiCall('two', 'unknown_tool', '{invalid')])
    expect(decodeDeepSeekToolResponse(envelope)).toEqual({ type: 'tool_calls', calls: [
      { id: 'one', name: 'read_evidence', argumentsJson: '{"evidenceIds":["ev-run-001"]}' },
      { id: 'two', name: 'unknown_tool', argumentsJson: '{invalid' }
    ] })
  })
  it('passes final JSON unchanged to the runtime and ignores provider-only metadata', () => {
    const envelope = finalEnvelope(' { "extra": true } ')
    Object.assign(envelope, { model: 'server-model', usage: { prompt_tokens: 10 } })
    Object.assign(envelope.choices[0].message, { reasoning_content: 'PRIVATE_REASONING', tool_calls: [] })
    expect(decodeDeepSeekToolResponse(envelope)).toEqual({ type: 'final', text: ' { "extra": true } ' })
  })
  it.each([
    null, {}, { choices: [] }, { choices: [finalEnvelope().choices[0], finalEnvelope().choices[0]] },
    { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: '{}' } }] },
    { choices: [{ finish_reason: 'content_filter', message: { role: 'assistant', content: '{}' } }] },
    { choices: [{ finish_reason: 'aborted', message: { role: 'assistant', content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: null } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}', tool_calls: [apiCall()] } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'tool', content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}', refusal: 'PRIVATE' } }] },
    toolEnvelope([]), toolEnvelope([{ ...apiCall(), type: 'other' }]),
    toolEnvelope([{ ...apiCall(), function: { name: 'read_metrics', arguments: {} } } as never]),
    toolEnvelope([{ ...apiCall(), id: undefined } as never])
  ])('rejects incomplete, mixed, refused or malformed API envelopes', envelope => {
    expect(() => decodeDeepSeekToolResponse(envelope)).toThrow(DeepSeekToolProtocolError)
  })
})

describe('DeepSeekToolCallingProvider HTTP boundary', () => {
  it('POSTs to the official endpoint with secret header, passed abort signal, and redirects disabled', async () => {
    const transport = vi.fn<DeepSeekToolTransport>().mockResolvedValue(Response.json(toolEnvelope()))
    const signal = new AbortController().signal
    const provider = new DeepSeekToolCallingProvider(config, transport)
    expect((await provider.generate(request, { signal })).type).toBe('tool_calls')
    expect(transport.mock.calls[0]).toEqual([config.endpoint, expect.objectContaining({ method: 'POST', signal, redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-only-secret' } })])
    expect(JSON.stringify(provider)).not.toContain(config.apiKey)
    expect(transport.mock.calls[0][1].body).not.toContain(config.apiKey)
  })
  it.each([[401, 'authentication'], [403, 'authentication'], [429, 'rate-limited'], [500, 'provider-unavailable'], [302, 'provider-unavailable']])('maps HTTP %s to a safe port error without retries', async (status, code) => {
    const transport = vi.fn<DeepSeekToolTransport>().mockResolvedValue(new Response('PRIVATE_SERVER_RESPONSE', { status: Number(status) }))
    await expect(generate(transport)).rejects.toMatchObject({ code, message: code })
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it.each(['http://api.deepseek.com/chat/completions', 'https://evil.example/chat/completions', 'https://api.deepseek.com/chat/completions?secret=x'])('rejects unsafe endpoints before using credentials', endpoint => {
    expect(() => new DeepSeekToolCallingProvider({ ...config, endpoint })).toThrow(ToolCallingProviderError)
  })
  it('rejects blank/newline keys and invalid model IDs without echoing values', () => {
    for (const change of [{ apiKey: '' }, { apiKey: 'bad\nSECRET' }, { modelId: 'SECRET' }]) {
      expect(() => new DeepSeekToolCallingProvider({ ...config, ...change })).toThrow('authentication')
    }
  })
  it('wraps sensitive network errors', async () => {
    const transport = vi.fn<DeepSeekToolTransport>().mockRejectedValue(new Error('PRIVATE_HEADERS_AND_PROMPT'))
    await expect(generate(transport)).rejects.toMatchObject({ message: 'provider-unavailable' })
  })
  it('does not start HTTP for a pre-cancelled request', async () => {
    const abort = new AbortController(); abort.abort('PRIVATE_REASON')
    const transport = vi.fn<DeepSeekToolTransport>()
    await expect(generate(transport, request, abort.signal)).rejects.toMatchObject({ message: 'provider-unavailable' })
    expect(transport).not.toHaveBeenCalled()
  })
  it('discards a transport response that arrives after cancellation', async () => {
    const abort = new AbortController()
    const transport = vi.fn<DeepSeekToolTransport>(async () => { abort.abort(); return Response.json(finalEnvelope()) })
    await expect(generate(transport, request, abort.signal)).rejects.toThrow(ToolCallingProviderError)
  })
  it.each(['not JSON', '', new Uint8Array([0xff, 0xfe])])('rejects invalid JSON/encoding in HTTP bodies', async body => {
    const transport = vi.fn<DeepSeekToolTransport>().mockResolvedValue(new Response(body))
    await expect(generate(transport)).rejects.toThrow(DeepSeekToolProtocolError)
  })
  it('cancels oversized response streams before parsing', async () => {
    let cancelled = false
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(500_001)) }, cancel() { cancelled = true } })
    const transport = vi.fn<DeepSeekToolTransport>().mockResolvedValue(new Response(stream))
    await expect(generate(transport)).rejects.toThrow(DeepSeekToolProtocolError)
    expect(cancelled).toBe(true)
  })
})

describe('frozen Runner with the real adapter and stubbed HTTP', () => {
  it('completes native tool proposals → tool messages → final canonical citations', async () => {
    const pack = demoPack(); let selected: { id: string; direction: string }[] = []
    const transport = vi.fn<DeepSeekToolTransport>(async (_url, init) => {
      const wire = JSON.parse(init.body as string)
      const catalog = JSON.parse(wire.messages[1].content).catalog as { id: string; direction: string }[]
      if (!wire.messages.some((message: { role: string }) => message.role === 'tool')) {
        selected = [catalog.find(item => item.direction === 'support')!, catalog.find(item => item.direction === 'context')!]
        for (const item of pack.evidence.semanticContext) expect(init.body).not.toContain(item.excerpt)
        return Response.json(toolEnvelope([apiCall('native_read', 'read_evidence', JSON.stringify({ evidenceIds: selected.map(item => item.id) }))]))
      }
      expect(wire.messages[2].tool_calls[0].id).toBe('native_read')
      expect(wire.messages[3].tool_call_id).toBe('native_read')
      expect(JSON.parse(wire.messages[3].content).deliveredIds).toEqual(selected.map(item => item.id))
      for (const id of [pack.scope.accountId, pack.scope.conversationId, ...Object.values(pack.evidence).flat().map(item => item.id)]) expect(init.body).not.toContain(id)
      const final = finalText([selected[0].id], [selected[1].id]) as { type: 'final'; text: string }
      return Response.json(finalEnvelope(final.text))
    })
    const result = await new BoundedAgentRunner(new DeepSeekToolCallingProvider(config, transport)).run({ contextPack: pack, question: '有哪些替代解释？' })
    expect(result.ok).toBe(true)
    expect(result.metadata).toMatchObject({ modelCalls: 2, toolCalls: 1, deliveredIds: selected.map(item => item.id) })
    if (result.ok) expect(result.value.result.alternativeExplanations[0].evidenceIds).toEqual([pack.evidence.semanticContext[0].id])
  })
  it('lets runtime reject an unknown tool atomically instead of filtering the batch in the adapter', async () => {
    const transport = vi.fn<DeepSeekToolTransport>().mockResolvedValue(Response.json(toolEnvelope([apiCall('a', 'read_metrics', '{}'), apiCall('b', 'query_sql', '{}')])))
    const result = await new BoundedAgentRunner(new DeepSeekToolCallingProvider(config, transport)).run({ contextPack: demoPack(), question: '说明证据' })
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-tool' }, metadata: { toolCalls: 0, deliveredIds: [] } })
  })
  it.each([
    ['invalid JSON', 'invalid-output'],
    ['extra alternative field', 'invalid-output'],
    ['catalog-only citation', 'invalid-citation']
  ])('preserves strict runtime rejection of %s after a successful native tool read', async (scenario, code) => {
    let reads = 0
    const transport = vi.fn<DeepSeekToolTransport>(async (_url, init) => {
      const wire = JSON.parse(init.body as string)
      const catalog = JSON.parse(wire.messages[1].content).catalog as { id: string; direction: string }[]
      const support = catalog.find(item => item.direction === 'support')!.id
      const context = catalog.find(item => item.direction === 'context')!.id
      if (++reads === 1) return Response.json(toolEnvelope([apiCall('read', 'read_evidence', JSON.stringify({ evidenceIds: [support, context] }))]))
      const final = finalText([support], [context]) as { type: 'final'; text: string }
      if (scenario === 'invalid JSON') return Response.json(finalEnvelope('```json\n' + final.text + '\n```'))
      const data = JSON.parse(final.text)
      if (scenario === 'extra alternative field') data.alternativeExplanations[0].confidence = 'high'
      else data.findings[0].evidenceIds = [catalog.find(item => item.direction === 'support' && item.id !== support)!.id]
      return Response.json(finalEnvelope(JSON.stringify(data)))
    })
    const result = await new BoundedAgentRunner(new DeepSeekToolCallingProvider(config, transport)).run({ contextPack: demoPack(), question: '说明证据' })
    expect(result).toMatchObject({ ok: false, error: { code }, metadata: { modelCalls: 2, toolCalls: 1 } })
    expect(result).not.toHaveProperty('value')
    expect(result.metadata.deliveredIds).toHaveLength(2)
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('preserves Runner timeout and cancellation classification when HTTP ignores abort', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<DeepSeekToolTransport>(() => new Promise(() => {}))
    const runner = new BoundedAgentRunner(new DeepSeekToolCallingProvider(config, transport))
    const pending = runner.run({ contextPack: demoPack(), question: '说明证据' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await pending).toMatchObject({ ok: false, error: { code: 'timeout' } })
    expect(transport.mock.calls[0][1].signal?.aborted).toBe(true)
    const abort = new AbortController()
    const cancelled = runner.run({ contextPack: demoPack(), question: '说明证据' }, { signal: abort.signal })
    await vi.advanceTimersByTimeAsync(1); abort.abort('PRIVATE_REASON')
    expect(await cancelled).toMatchObject({ ok: false, error: { code: 'cancelled' } })
    expect(transport).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
