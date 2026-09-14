import { createServer } from 'vite'
import { readFile, mkdir, writeFile, appendFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEvaluationCurlTransport } from './evaluation-curl-transport.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const controller = new AbortController(); const cancel = () => controller.abort()
process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
let server; let directory; const records = []
const hash = data => createHash('sha256').update(data).digest('hex')
const save = (name, data) => writeFile(resolve(directory, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
try {
  const args = process.argv.slice(2)
  if (!args.length || args.includes('--help')) {
    console.log('D6-P0: --live | --mock; --out NEW_DIRECTORY; --proxy http://127.0.0.1:PORT (live only). A/B/C × 5, sequential, no retries. C uses validated synthetic assistant tool history. No V0 evaluation or answer storage.')
  } else {
    let mode; let output; let proxy
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--live' || args[i] === '--mock') { if (mode) throw new Error(); mode = args[i].slice(2) }
      else if (args[i] === '--out' && !output) output = args[++i]
      else if (args[i] === '--proxy' && !proxy) proxy = args[++i]
      else throw new Error()
    }
    if (!mode || !output || output.startsWith('--') || (proxy && (mode !== 'live' || proxy.startsWith('--')))) throw new Error()
    server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
    const { runTransportQualification, summarizeTransportQualification } = await server.ssrLoadModule('/src/main/evaluation/transport-qualification.ts')
    const { reliabilityFixtures } = await server.ssrLoadModule('/src/main/evaluation/reliability/fixtures.ts')
    const { loadDeepSeekConfiguration } = await server.ssrLoadModule('/src/main/providers/deepseek-config.ts')
    const fixtureBytes = await readFile(resolve(root, 'fixtures/import/sample-conversation.json'), 'utf8')
    const pack = reliabilityFixtures(fixtureBytes).demo
    const configuration = mode === 'live' ? loadDeepSeekConfiguration(process.env).configuration
      : { apiKey: 'offline-test-only', modelId: 'deepseek-mock', endpoint: 'https://api.deepseek.com/chat/completions' }
    if (!configuration) throw new Error()
    const transport = mode === 'mock' ? async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] })
      : proxy ? createEvaluationCurlTransport(proxy, controller.signal) : fetch
    const paths = (await readdir(resolve(root, 'src'), { recursive: true })).filter(path => path.endsWith('.ts') && !path.endsWith('.test.ts')).map(path => `src/${path}`)
    paths.push('scripts/qualify-provider-transport.mjs', 'scripts/evaluation-curl-transport.mjs', 'scripts/evaluate-reliability.mjs')
    paths.sort()
    const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(resolve(root, path)))])))
    const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    directory = resolve(output)
    await mkdir(dirname(directory), { recursive: true })
    await mkdir(directory, { mode: 0o700 })
    await save('manifest.json', { version: 'wememo-provider-qualification-v1', createdAt: new Date().toISOString(), mode,
      modelId: configuration.modelId, transport: mode === 'mock' ? 'mock' : proxy ? 'curl-local-proxy' : 'fetch',
      plannedProbes: 15, plannedHttpCalls: 15, order: 'A1-A5,B1-B5,C1-C5', gitHead, sourceHashes, fixtureSha256: hash(fixtureBytes),
      controls: { thinking: 'disabled', temperature: 'provider-default-omitted', maxOutputTokens: 4096, timeoutMs: 60000, stream: false,
        retries: 0, concurrency: 1, productionPromptsUnchanged: true, qualityScoring: false, countsTowardV0: false },
      continuation: 'Locally constructed assistant read_metrics + read_evidence history; existing whole-batch validator and read-only tools; tool_choice auto (second round). Not model-generated history.' })
    await writeFile(resolve(directory, 'requests.jsonl'), '', { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ mode, modelId: configuration.modelId, plannedHttpCalls: 15, countsTowardV0: false }))
    await runTransportQualification(configuration, pack, transport, { signal: controller.signal, async onRecord(record) {
      records.push(record)
      await appendFile(resolve(directory, 'requests.jsonl'), JSON.stringify(record) + '\n')
      console.log(JSON.stringify(record))
    } })
    const stored = (await readFile(resolve(directory, 'requests.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    const hashesMatch = (await Promise.all(paths.map(async path => sourceHashes[path] === hash(await readFile(resolve(root, path)))))).every(Boolean)
    const headUnchanged = gitHead === execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const checks = { sourceHashesMatch: hashesMatch, gitHeadUnchanged: headUnchanged, persistedExactly: JSON.stringify(records) === JSON.stringify(stored) }
    const summary = summarizeTransportQualification(records)
    await save('report.json', { version: 'wememo-provider-qualification-v1', completedProbes: records.length,
      httpAttempts: records.reduce((n, record) => n + record.providerCalls, 0), interrupted: controller.signal.aborted, checks, summary })
    console.log(JSON.stringify({ directory, checks, summary }))
    if (controller.signal.aborted) process.exitCode = 130
    else if (!Object.values(checks).every(Boolean) || records.length !== 15) process.exitCode = 1
    else if (records.some(record => !record.protocolPass)) process.exitCode = 2
  }
} catch {
  console.error('Transport qualification stopped; check options/configuration/output persistence. No retry. Existing safe checkpoints are retained.')
  process.exitCode = 1
  if (directory) { try { await save('incomplete.json', { completedProbes: records.length, interrupted: true }) } catch {} }
} finally {
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); await server?.close()
}
