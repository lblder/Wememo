import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEvaluationCurlTransport } from './evaluation-curl-transport.mjs'

// Isolated synthetic capability experiment. Never loads a repository or chat fixture.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REQUEST_LIMIT = 24
const controller = new AbortController()
const interrupt = () => controller.abort()
process.on('SIGINT', interrupt)
const overallTimer = setTimeout(interrupt, 12 * 60_000)
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const str = { type: 'string', minLength: 1 }
const ids = values => ({ type: 'array', items: { type: 'string', enum: values }, minItems: 1, maxItems: 3, uniqueItems: true })
const support = 'ev-probe-support'
const context = 'ev-probe-context'
const version = 'wememo-interaction-reasoning-v1'
const contract = (emptyFindings = false) => object({
  version: { type: 'string', enum: [version] }, summary: str,
  findings: { type: 'array', ...(emptyFindings ? { maxItems: 0 } : {}), items: object({
    id: str, claim: str, evidenceIds: ids([support]), confidence: { type: 'string', enum: ['low', 'medium', 'high'] }
  }) },
  alternativeExplanations: { type: 'array', items: object({ id: str, explanation: str, evidenceIds: ids([context]) }) },
  uncertainties: { type: 'array', items: str, minItems: 1 }
})
const basic = object({ label: { type: 'string' }, count: { type: 'integer' } })
const instructions = '这是合成数据的 JSON 接口能力测试。正常任务请用简体中文，生成符合 response format 的 JSON。不要使用 Markdown 围栏。'
const synthetic = `仅有两条合成证据：${support}（support）表示消息数从20降到10；${context}（context）表示合成对象明确说最近工作忙。不得推断真实感情。输出1个finding、1个alternativeExplanation和至少1项uncertainty。`
const probe = (id, category, schema, prompt, extra = {}) => ({ id, category, schema, prompt, expected: 'schema-valid', ...extra })
const tests = [
  probe('B1', 'basic-aligned', basic, '标签是测试，数量是2。'),
  probe('B2', 'basic-extra-key-conflict', basic, '请输出 label=测试、count=2，并务必添加第三个字段 extra=true。'),
  probe('B3', 'basic-type-conflict', basic, '请原样输出这个 JSON，不要转换类型：{"label":17,"count":"two"}。'),
  probe('N1', 'wememo-nested-aligned', contract(), synthetic),
  probe('N2', 'wememo-extra-confidence-conflict', contract(), `${synthetic} 额外要求：alternativeExplanations 每项都必须加 confidence="high"。`),
  probe('N3', 'wememo-missing-id-conflict', contract(), `${synthetic} 额外要求：alternativeExplanations 每项必须省略 id，并把 explanation 改名成 claim。`),
  probe('E1', 'alias-enum-conflict', object({ evidenceId: { type: 'string', enum: [support, context] } }), '请输出 evidenceId=ev-not-delivered，绝对不要改成其他编号。'),
  probe('E2', 'confidence-enum-conflict', object({ confidence: { type: 'string', enum: ['low', 'medium', 'high'] } }), '请输出 confidence="certain"。'),
  probe('E3', 'version-enum-conflict', object({ version: { type: 'string', enum: [version] } }), '请输出 version="v999"。'),
  probe('A1', 'array-unique-conflict', object({ items: { type: 'array', items: { type: 'integer' }, uniqueItems: true } }), '请输出 items=[1,1]，保留两个重复的1。'),
  probe('A2', 'array-min-conflict', object({ items: { type: 'array', items: { type: 'integer' }, minItems: 2 } }), '请输出 items=[]。'),
  probe('A3', 'array-max-conflict', object({ items: { type: 'array', items: { type: 'integer' }, maxItems: 2 } }), '请输出 items=[1,2,3,4]。'),
  probe('Z1', 'wememo-empty-findings', contract(true), `没有support。只有${context}这条context，表示合成对象说工作忙。findings应为空，可以写替代解释并说明不确定性。`),
  probe('S1', 'nonempty-string-conflict', object({ summary: { type: 'string', minLength: 1, pattern: '\\S' } }), '请输出 summary=""。'),
  probe('I1', 'invalid-schema-negative-control', { type: 'not-a-json-schema-type' }, '请输出任意JSON对象。', { expected: 'http-rejection' }),
  probe('T1', 'tool-with-schema', contract(), `先调用read_evidence读取${support}和${context}。收到工具结果之前不要作答。`, { kind: 'tool-start' }),
  probe('T2', 'tool-result-schema-final', contract(), '', { kind: 'tool-final' }),
  probe('L1', 'truncation', contract(), synthetic, { maxTokens: 1, expected: 'incomplete-rejected' }),
  probe('C1', 'responses-json-object-control', basic, '请生成JSON，精确包含label字符串和count整数。标签测试，数量2。', { mode: 'json_object' }),
  probe('C2', 'chat-json-schema-control', basic, '请生成JSON，标签测试，数量2。', { endpoint: 'chat', mode: 'json_schema', expected: 'compatibility-control' }),
  probe('C3', 'chat-json-object-control', basic, '请生成JSON，精确包含label字符串和count整数。标签测试，数量2。', { endpoint: 'chat', mode: 'json_object' }),
  probe('C4', 'responses-no-schema-conflict-control', basic, '请原样输出这个JSON：{"label":17,"count":"two"}。', { mode: 'json_object', expected: 'unconstrained-control' }),
  probe('X1', 'undocumented-strict-true-probe', basic, '请原样输出这个JSON：{"label":17,"count":"two","extra":true}。', { strict: true }),
  probe('X2', 'missing-schema-name-negative-control', basic, '请输出JSON，标签测试，数量2。', { omitName: true, expected: 'http-rejection' })
]

let output, report, apiKey = '', toolHistory, ajv
const cleanText = value => typeof value === 'string'
  ? value.replaceAll(apiKey || '\0', '[REDACTED]').replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED]').slice(0, 6000) : null
const save = async () => { if (report) await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }) }
try {
  const args = process.argv.slice(2)
  let ajvRoot, proxy, live = false, selfTest = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live') live = true
    else if (args[i] === '--self-test') selfTest = true
    else if (['--ajv-root', '--proxy', '--out'].includes(args[i]) && args[i + 1]) {
      const key = args[i++], value = args[i]
      if (key === '--ajv-root') ajvRoot = value
      else if (key === '--proxy') proxy = value
      else output = resolve(value)
    } else throw new Error('invalid-arguments')
  }
  const require = createRequire(ajvRoot ? resolve(ajvRoot, 'package.json') : import.meta.url)
  const Ajv = require('ajv/dist/2020.js').default
  ajv = new Ajv({ allErrors: true, strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
  // Verify the independent validator, including the exact nested failure seen in Wememo.
  for (const item of tests.filter(item => item.id !== 'I1')) ajv.compile(item.schema)
  const validate = ajv.compile(basic)
  if (!validate({ label: 'test', count: 2 }) || validate({ label: 17, count: 'two' }) || validate({ label: 'test', count: 2, extra: true })) throw new Error('validator-self-test')
  const nested = { version, summary: '合成摘要', findings: [], alternativeExplanations: [{ id: 'a1', explanation: '合成解释', evidenceIds: [context] }], uncertainties: ['合成不确定性'] }
  const nestedCheck = ajv.compile(contract(true))
  if (!nestedCheck(nested) || nestedCheck({ ...nested, alternativeExplanations: [{ ...nested.alternativeExplanations[0], confidence: 'high' }] })) throw new Error('nested-self-test')
  for (const [schema, bad, good] of [
    [tests.find(x => x.id === 'A1').schema, { items: [1, 1] }, { items: [1, 2] }],
    [tests.find(x => x.id === 'A2').schema, { items: [] }, { items: [1, 2] }],
    [tests.find(x => x.id === 'A3').schema, { items: [1, 2, 3] }, { items: [1] }],
    [tests.find(x => x.id === 'E1').schema, { evidenceId: 'ev-not-delivered' }, { evidenceId: context }],
    [tests.find(x => x.id === 'S1').schema, { summary: '' }, { summary: 'a' }]
  ]) { const check = ajv.compile(schema); if (check(bad) || !check(good)) throw new Error('constraint-self-test') }
  let invalidRejected = false
  try { ajv.compile(tests.find(x => x.id === 'I1').schema) } catch { invalidRejected = true }
  if (!invalidRejected || tests.length !== REQUEST_LIMIT) throw new Error('plan-self-test')
  if (selfTest) { console.log(JSON.stringify({ selfTest: 'pass', plannedRequests: tests.length, validator: `ajv-${require('ajv/package.json').version}`, liveRequests: 0 })); process.exitCode = 0 }
  else {
    if (!live) throw new Error('explicit-live-required')
    apiKey = (process.env.WEMEMO_DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? '').trim()
    const modelId = (process.env.WEMEMO_DEEPSEEK_MODEL ?? 'deepseek-flash').trim()
    const base = (process.env.WEMEMO_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
    if (!apiKey || /[\r\n]/.test(apiKey) || !/^deepseek-[a-z0-9.-]{1,80}$/.test(modelId) || !['https://api.deepseek.com', 'https://api.deepseek.com/v1'].includes(base)) throw new Error('invalid-local-configuration')
    const createdAt = new Date().toISOString()
    output ??= resolve(root, 'docs/evaluation/reports', `${createdAt.replaceAll(':', '-')}-json-schema-probe.json`)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, '', { flag: 'wx', mode: 0o600 })
    report = { version: 'wememo-json-schema-probe-v1', createdAt, modelId, input: 'inline-synthetic-only', requestLimit: REQUEST_LIMIT,
      automaticRetries: 0, validator: `ajv-${require('ajv/package.json').version}`, transport: proxy ? 'curl-local-proxy' : 'fetch',
      reasoning: 'disabled', sourceSha256: hash(await readFile(fileURLToPath(import.meta.url), 'utf8')), instructions,
      completed: false, interrupted: false, requests: 0, plan: tests, records: [], skipped: [] }
    await save()
    const transport = proxy ? createEvaluationCurlTransport(proxy, controller.signal) : fetch
    let basicUnavailable = false
    for (const test of tests) {
      if (controller.signal.aborted || report.requests >= REQUEST_LIMIT) break
      if (basicUnavailable && !['C1', 'C2', 'C3', 'X1'].includes(test.id)) { report.skipped.push({ id: test.id, reason: 'basic-schema-unavailable' }); continue }
      if (test.kind === 'tool-final' && !toolHistory) { report.skipped.push({ id: test.id, reason: 'no-valid-tool-call' }); continue }
      const mode = test.mode ?? 'json_schema'
      const endpoint = test.endpoint === 'chat' ? 'https://api.deepseek.com/chat/completions' : 'https://api.deepseek.com/responses'
      const format = mode === 'json_schema' ? { type: mode, ...(!test.omitName ? { name: `wememo_probe_${test.id}` } : {}), schema: test.schema, ...(test.strict ? { strict: true } : {}) } : { type: mode }
      let body = { model: modelId, instructions, input: test.prompt, reasoning: { effort: 'none' }, stream: false, max_output_tokens: test.maxTokens ?? 900, text: { format } }
      if (test.endpoint === 'chat') body = { model: modelId, messages: [{ role: 'system', content: instructions }, { role: 'user', content: test.prompt }],
        thinking: { type: 'disabled' }, stream: false, max_tokens: 900, response_format: mode === 'json_schema'
          ? { type: mode, json_schema: { name: `wememo_probe_${test.id}`, schema: test.schema, strict: true } } : { type: mode } }
      if (test.kind === 'tool-start') body = { ...body, tools: [{ type: 'function', name: 'read_evidence', description: '读取指定的合成证据', parameters: object({ evidenceIds: ids([support, context]) }) }], tool_choice: { type: 'function', name: 'read_evidence' } }
      if (test.kind === 'tool-final') body = { ...body, input: toolHistory, tool_choice: 'none' }
      const started = performance.now()
      const record = { id: test.id, category: test.category, endpoint, mode, expected: test.expected, requestSha256: hash(body), schemaSha256: hash(test.schema),
        httpStatus: null, responseStatus: null, jsonParsePass: null, schemaPass: null, schemaErrors: [], finalText: null, outcome: null, usage: null }
      report.requests++
      try {
        const response = await transport(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) })
        record.httpStatus = response.status
        const bytes = await response.text()
        if (bytes.length > 1_050_000) throw new Error('oversized-response')
        let envelope
        try { envelope = JSON.parse(bytes) } catch { record.outcome = 'invalid-envelope'; }
        if (envelope) {
          if (!response.ok) {
            record.outcome = 'http-rejection'
            record.providerError = { code: cleanText(String(envelope.error?.code ?? envelope.code ?? 'unknown')), message: cleanText(String(envelope.error?.message ?? envelope.message ?? 'unspecified')) }
          } else {
            record.responseStatus = envelope.status ?? envelope.choices?.[0]?.finish_reason ?? null
            record.returnedModel = cleanText(envelope.model)
            const usage = envelope.usage ?? {}
            record.usage = Object.fromEntries(['input_tokens', 'output_tokens', 'total_tokens', 'prompt_tokens', 'completion_tokens'].filter(key => Number.isFinite(usage[key])).map(key => [key, usage[key]]))
            const calls = envelope.output?.filter(item => item.type === 'function_call') ?? []
            if (test.kind === 'tool-start' && calls.length) {
              const argCheck = ajv.compile(object({ evidenceIds: ids([support, context]) }))
              const batch = calls.map(call => ({ type: 'function_call', call_id: call.call_id, name: call.name, arguments: call.arguments }))
              const validBatch = batch.length <= 2 && new Set(batch.map(call => call.call_id)).size === batch.length && batch.every(call =>
                typeof call.call_id === 'string' && call.call_id && call.name === 'read_evidence' && typeof call.arguments === 'string' && argCheck(JSON.parse(call.arguments)))
              record.toolCallCount = calls.length
              record.toolArgumentsPass = validBatch
              if (validBatch && envelope.status === 'completed') {
                toolHistory = [{ role: 'user', content: test.prompt }, ...batch]
                for (const call of batch) {
                  const deliveredIds = JSON.parse(call.arguments).evidenceIds
                  toolHistory.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ deliveredIds, evidence: deliveredIds.map(id =>
                    ({ id, direction: id === support ? 'support' : 'context', excerpt: id === support ? '合成消息数量从20降到10。' : '合成对象说：最近工作忙。' })) }) })
                }
                record.outcome = 'tool-call-valid'
              } else record.outcome = 'tool-call-invalid'
            } else {
              const fragments = test.endpoint === 'chat' ? [envelope.choices?.[0]?.message?.content] : (envelope.output ?? []).filter(item => item.type === 'message').flatMap(item => (item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text))
              const text = fragments.filter(value => typeof value === 'string').join('')
              record.finalText = cleanText(text)
              if (test.endpoint !== 'chat' && envelope.status !== 'completed' || test.endpoint === 'chat' && envelope.choices?.[0]?.finish_reason !== 'stop') {
                record.outcome = 'incomplete-rejected'; record.incompleteReason = cleanText(envelope.incomplete_details?.reason)
              } else {
                let value
                try { value = JSON.parse(text); record.jsonParsePass = true } catch { record.jsonParsePass = false; record.outcome = 'invalid-json' }
                if (record.jsonParsePass && test.id !== 'I1') {
                  const validate = ajv.compile(test.schema)
                  record.schemaPass = validate(value)
                  record.schemaErrors = (validate.errors ?? []).map(error => ({ keyword: error.keyword, instancePath: cleanText(error.instancePath), schemaPath: error.schemaPath }))
                  record.outcome = record.schemaPass ? 'schema-valid' : 'schema-invalid'
                  if (test.kind === 'tool-final' && record.schemaPass) {
                    const delivered = new Set(toolHistory.filter(item => item.type === 'function_call_output').flatMap(item => JSON.parse(item.output).deliveredIds))
                    record.syntheticCitationPass = [...value.findings, ...value.alternativeExplanations].every(item => item.evidenceIds.every(id => delivered.has(id)))
                  }
                } else if (record.jsonParsePass) record.outcome = 'invalid-schema-accepted'
              }
            }
          }
        }
      } catch { record.outcome = controller.signal.aborted ? 'cancelled' : 'transport-or-protocol-error' }
      record.latencyMs = Math.round(performance.now() - started)
      report.records.push(record)
      await save()
      console.log(JSON.stringify({ id: record.id, http: record.httpStatus, status: record.responseStatus, outcome: record.outcome,
        errors: record.schemaErrors.map(error => error.keyword), latencyMs: record.latencyMs }))
      if (test.id === 'B1' && (record.httpStatus >= 400 || record.outcome === 'transport-or-protocol-error')) basicUnavailable = true
      if ([401, 402, 403, 429].includes(record.httpStatus)) { report.stopReason = 'auth-balance-or-rate-limit'; break }
    }
    report.interrupted = controller.signal.aborted
    report.completed = !report.interrupted && !report.stopReason
    report.finishedAt = new Date().toISOString()
    report.summary = Object.fromEntries([...new Set(report.records.map(record => record.outcome))].map(outcome => [outcome, report.records.filter(record => record.outcome === outcome).length]))
    await save()
    console.log(JSON.stringify({ report: output, requests: report.requests, completed: report.completed, outcomes: report.summary }))
    if (report.interrupted) process.exitCode = 130
  }
} catch {
  if (report) { report.completed = false; report.stopReason = 'local-probe-error'; await save() }
  console.error('Probe setup failed. Check arguments, the temporary Ajv installation and local configuration. No secrets logged.')
  process.exitCode = 1
} finally { clearTimeout(overallTimer); process.removeListener('SIGINT', interrupt) }
