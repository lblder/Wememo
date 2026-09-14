import { createServer } from 'vite'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEvaluationCurlTransport } from './evaluation-curl-transport.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const live = args.includes('--live')
const controller = new AbortController()
const interrupt = () => controller.abort()
process.on('SIGINT', interrupt)
let server
try {
  let proxy; let output
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live' || args[i] === '--mock') continue
    if (args[i] === '--proxy' && args[i + 1]) proxy = args[++i]
    else if (args[i] === '--out' && args[i + 1]) output = resolve(args[++i])
    else throw new Error('Invalid arguments')
  }
  if (args.includes('--mock') && live) throw new Error('Choose one mode')
  server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  const load = path => server.ssrLoadModule(path)
  const { buildEvaluationFixture, EVALUATION_REFERENCE_TIME } = await load('/src/main/evaluation/evaluation-fixture.ts')
  const { runEvaluation } = await load('/src/main/evaluation/evidence-question-evaluation.ts')
  const { EVALUATION_CASES } = await load('/src/main/evaluation/evidence-question-cases.ts')
  const fixture = await readFile(resolve(root, 'fixtures/import/sample-conversation.json'), 'utf8')
  const pack = buildEvaluationFixture(fixture)
  let providers; let modelId = 'mock'
  if (live) {
    const { loadDeepSeekConfiguration } = await load('/src/main/providers/deepseek-config.ts')
    const { DeepSeekProvider } = await load('/src/main/providers/deepseek-provider.ts')
    const { DeepSeekToolCallingProvider } = await load('/src/main/providers/deepseek-tool-calling-provider.ts')
    const { configuration } = loadDeepSeekConfiguration(process.env)
    if (!configuration) throw new Error('Missing valid local configuration')
    modelId = configuration.modelId
    const fetchTransport = proxy ? createEvaluationCurlTransport(proxy, controller.signal) : (url, init) => fetch(url, { ...init,
      signal: AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]) })
    const forbidden = [pack.scope.accountId, pack.scope.conversationId, ...Object.values(pack.evidence).flat().map(item => item.id)]
    const transport = (url, init) => {
      if (forbidden.some(id => String(init.body).includes(id))) throw new Error('Outbound identity check failed')
      return fetchTransport(url, init)
    }
    providers = { direct: new DeepSeekProvider(configuration, transport), agent: new DeepSeekToolCallingProvider(configuration, transport) }
  } else {
    const { createMockEvaluationProviders } = await load('/src/main/evaluation/mock-evaluation-providers.ts')
    providers = createMockEvaluationProviders()
  }
  const createdAt = new Date().toISOString()
  output ??= resolve(root, 'docs/evaluation/reports', `${createdAt.replaceAll(':', '-')}-${live ? 'live' : 'mock'}.json`)
  // Reserve the output before incurring any API cost. Never overwrite a previous evaluation.
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, '', { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify({ mode: live ? 'live' : 'mock', modelId, plannedRuns: EVALUATION_CASES.length * 2, input: 'synthetic-demo-only' }))
  const sourcePaths = [
    'src/main/evaluation/evidence-question-evaluation.ts', 'src/main/evaluation/evidence-question-cases.ts',
    'src/main/evaluation/evaluation-fixture.ts', 'src/main/evidence-agent/bounded-agent-runner.ts',
    'src/main/evidence-agent/agent-prompt.ts', 'src/main/evidence-agent/agent-policy.ts',
    'src/main/evidence-agent/agent-tools.ts', 'src/main/evidence-agent/agent-evidence-projection.ts',
    'src/main/providers/deepseek-provider.ts', 'src/main/providers/deepseek-tool-calling-provider.ts',
    'src/main/providers/deepseek-output-instructions.ts', 'src/main/reasoning/reasoning-prompt-builder.ts',
    'src/main/diagnostics/reasoning-failure-diagnostic.ts', 'src/main/diagnostics/reasoning-output-diagnostic.ts',
    'src/shared/reasoning-diagnostic.ts',
    'src/main/reasoning/evidence-citation-validator.ts', 'src/shared/interaction-reasoning-validation.ts'
  ]
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')])))
  const evaluation = await runEvaluation(pack, providers, { signal: controller.signal, onRecord: record => console.log(JSON.stringify(record)) })
  const report = { ...evaluation, mode: live ? 'live' : 'mock', createdAt, modelId, transport: proxy ? 'curl-local-proxy' : live ? 'fetch' : 'mock',
    fixtureSha256: createHash('sha256').update(fixture).digest('hex'), referenceTime: EVALUATION_REFERENCE_TIME,
    coverage: pack.coverage, sourceHashes, cases: EVALUATION_CASES }
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  const compactSummary = Object.fromEntries(Object.entries(report.summary).map(([path, { categories, ...metrics }]) => [path, metrics]))
  console.log(JSON.stringify({ report: output, completedRuns: report.completedRuns, summary: compactSummary }))
  if (controller.signal.aborted) process.exitCode = 130
} catch {
  console.error('Evaluation setup failed. Check mode, output path, local proxy and Main environment configuration. No raw provider data is logged.')
  process.exitCode = 1
} finally { process.removeListener('SIGINT', interrupt); await server?.close() }
