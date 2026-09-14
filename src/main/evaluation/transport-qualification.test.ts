import { afterEach, expect, it, vi } from 'vitest'
import { qualificationAgentRequest, runTransportQualification, summarizeTransportQualification, type TransportProbeRecord } from './transport-qualification'
import { demoPack } from '../reasoning/reasoning-test-fixtures'
import { AGENT_SYSTEM_PROMPT } from '../evidence-agent/agent-prompt'
import { AGENT_TOOLS } from '../evidence-agent/agent-tools'

const config = { apiKey: 'SECRET_TEST_KEY', modelId: 'deepseek-flash', endpoint: 'https://api.deepseek.com/chat/completions' }
afterEach(() => vi.useRealTimers())
it('C constructs second-turn history with existing prompts/tools, aliases and delivered evidence', () => {
  const pack = demoPack(); const request = qualificationAgentRequest(pack, true)
  expect(request.systemPrompt).toBe(AGENT_SYSTEM_PROMPT)
  expect(request.tools).toBe(AGENT_TOOLS)
  expect(request.toolChoice).toBe('auto')
  expect(request.messages.map(item => item.role)).toEqual(['user', 'assistant', 'tool', 'tool'])
  const first = request.messages[0]; if (first.role !== 'user') throw new Error()
  const initial = JSON.parse(first.content)
  expect(initial.deliveredIds).toEqual([])
  expect(first.content).not.toContain('excerpt')
  const tool = request.messages[3]; if (tool.role !== 'tool') throw new Error()
  const payload = JSON.parse(tool.content)
  expect(payload.deliveredIds).toHaveLength(3)
  expect(payload.result.evidence.map((item: { id: string }) => item.id)).toEqual(payload.deliveredIds)
  expect(payload.result.evidence.map((item: { direction: string }) => item.direction)).toEqual(['support', 'counter', 'context'])
  for (const id of [pack.scope.accountId, pack.scope.conversationId, ...Object.values(pack.evidence).flat().map(item => item.id)]) expect(JSON.stringify(request)).not.toContain(id)
})
it('makes exactly 15 sequential attempts and persists each before the next, without saving answers', async () => {
  const rows: TransportProbeRecord[] = []; const wires: Record<string, any>[] = []; let active = 0
  await runTransportQualification(config, demoPack(), async (_url, init) => {
    expect(active++).toBe(0); expect(rows).toHaveLength(wires.length)
    const wire = JSON.parse(String(init.body)); wires.push(wire)
    await Promise.resolve(); active--
    return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'SECRET_FINAL_RESPONSE' } }] })
  }, { signal: new AbortController().signal, onRecord: row => { rows.push(row) } })
  expect(rows).toHaveLength(15)
  expect(rows.map(row => row.probe)).toEqual([...Array(5).fill('A'), ...Array(5).fill('B'), ...Array(5).fill('C')])
  for (const wire of wires) expect(wire).toMatchObject({ thinking: { type: 'disabled' }, max_tokens: 4096, stream: false })
  for (const wire of wires.slice(0, 5)) { expect(wire).not.toHaveProperty('tools'); expect(wire.response_format).toEqual({ type: 'json_object' }) }
  for (const wire of wires.slice(5, 10)) expect(wire.messages.map((item: { role: string }) => item.role)).toEqual(['system', 'user'])
  for (const wire of wires.slice(10)) {
    expect(wire.messages.map((item: { role: string }) => item.role)).toEqual(['system', 'user', 'assistant', 'tool', 'tool'])
    expect(wire.messages[2].tool_calls.map((call: { id: string }) => call.id)).toEqual(wire.messages.slice(3).map((message: { tool_call_id: string }) => message.tool_call_id))
    expect(wire).not.toHaveProperty('response_format')
  }
  expect(JSON.stringify(rows)).not.toContain('SECRET')
  expect(summarizeTransportQualification(rows)).toMatchObject({ A: { httpAttempts: 5, httpStatus: { 200: 5 }, protocolPass: 5 }, C: { probes: 5 } })
})
it('records HTTP failures across all groups without retry or continuation dependency', async () => {
  let calls = 0
  const records = await runTransportQualification(config, demoPack(), async () => {
    return new Response('SECRET_FAILURE', { status: [503, 429, 400][Math.floor(calls++ / 5)] })
  }, { signal: new AbortController().signal, onRecord: () => {} })
  expect(calls).toBe(15)
  expect(summarizeTransportQualification(records)).toMatchObject({ A: { failures: { http_503: 5 } }, B: { failures: { http_429: 5 } }, C: { failures: { http_400: 5 } } })
})
it('stops before more network calls when persistence fails', async () => {
  const transport = vi.fn(async () => new Response('private body', { status: 500 }))
  await expect(runTransportQualification(config, demoPack(), transport, { signal: new AbortController().signal, onRecord: () => { throw new Error('disk failed') } })).rejects.toThrow('disk failed')
  expect(transport).toHaveBeenCalledTimes(1)
})
it('cancels a hung probe without accepting late responses or starting another', async () => {
  const controller = new AbortController(); let finish!: (value: Response) => void
  const transport = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
  const pending = runTransportQualification(config, demoPack(), transport, { signal: controller.signal, onRecord: () => {} })
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
  controller.abort('SECRET_CANCEL')
  const records = await pending
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ protocolPass: false, diagnostic: { kind: 'cancelled' } })
  finish(Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] }))
  await Promise.resolve()
  expect(transport).toHaveBeenCalledTimes(1)
  expect(records[0].protocolPass).toBe(false)
})
