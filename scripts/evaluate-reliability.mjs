import { createServer } from 'vite'
import { readFile, mkdir, writeFile, appendFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { execFileSync } from 'node:child_process'
import { createEvaluationCurlTransport } from './evaluation-curl-transport.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const controller = new AbortController(); const cancel = () => controller.abort()
process.on('SIGINT', cancel); process.on('SIGTERM', cancel)
let server; let directory; let metadata; let completed = false
const records = []; const reviews = []
const hash = text => createHash('sha256').update(text).digest('hex')
async function save(name, value) {
  await writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
try {
  if (process.argv.slice(2).includes('--help')) {
    console.log('D6: --mock (default) | --live; --variants V0[,V1,V2,V3]; --set normal|stress|both; --canary (full V0; pause after 6 Normal + 2 Stress); --out NEW_DIRECTORY; --proxy http://127.0.0.1:PORT (live only). Normal: 10×3×2; Stress: 5×2×2 runs per variant. Zero retries; synthetic fixtures only.')
  } else {
    server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
    const load = path => server.ssrLoadModule(`/src/main/evaluation/reliability/${path}.ts`)
    const { reliabilityOptions } = await load('cli-options')
    const options = reliabilityOptions(process.argv.slice(2))
    const { reliabilityFixtures } = await load('fixtures')
    const { RELIABILITY_CASES, REPEAT_COUNTS } = await load('cases')
    const { runReliabilityEvaluation } = await load('evaluation')
    const { reliabilitySchedule } = await load('schedule')
    const schedule = reliabilitySchedule(options)
    const { EVALUATION_REFERENCE_TIME } = await server.ssrLoadModule('/src/main/evaluation/evaluation-fixture.ts')
    const document = await readFile(resolve(root, 'fixtures/import/sample-conversation.json'), 'utf8')
    const fixtures = reliabilityFixtures(document)
    const createdAt = new Date().toISOString()
    directory = options.output ? resolve(options.output) : resolve(root, 'docs/evaluation/reliability', `${createdAt.replaceAll(':', '-')}-${options.mode}-${options.variants.join('-')}`)
    await mkdir(dirname(directory), { recursive: true })
    await mkdir(directory, { mode: 0o700 }) // Exclusive directory reservation before any API call.
    let factory; let modelId = 'mock'; let providerId = 'mock'
    if (options.mode === 'live') {
      const { loadDeepSeekConfiguration } = await server.ssrLoadModule('/src/main/providers/deepseek-config.ts')
      const { DeepSeekProvider } = await server.ssrLoadModule('/src/main/providers/deepseek-provider.ts')
      const { DeepSeekToolCallingProvider } = await server.ssrLoadModule('/src/main/providers/deepseek-tool-calling-provider.ts')
      const { redactIdentifiers } = await server.ssrLoadModule('/src/main/evidence-agent/agent-evidence-projection.ts')
      const { configuration } = loadDeepSeekConfiguration(process.env)
      if (!configuration) throw new Error('Missing model configuration')
      modelId = configuration.modelId; providerId = 'deepseek'
      factory = runSignal => {
        const raw = options.proxy ? createEvaluationCurlTransport(options.proxy, runSignal) : (url, init) => fetch(url, { ...init,
          signal: AbortSignal.any([runSignal, ...(init.signal ? [init.signal] : [])]) })
        const transport = (url, init) => {
          const body = String(init.body)
          // Check decoded text too: JSON escapes must not bypass the outbound identity boundary.
          const parsed = JSON.parse(body)
          const texts = parsed.messages.flatMap(message => [message.content, ...(message.tool_calls ?? []).map(call => call.function.arguments)]).filter(value => typeof value === 'string')
          for (const pack of Object.values(fixtures)) for (const text of texts) {
            if (redactIdentifiers(text, pack) !== text) throw new Error('Outbound identity check failed')
          }
          return raw(url, init)
        }
        return { direct: new DeepSeekProvider(configuration, transport), agent: new DeepSeekToolCallingProvider(configuration, transport) }
      }
    } else {
      const { createMockEvaluationProviders } = await server.ssrLoadModule('/src/main/evaluation/mock-evaluation-providers.ts')
      factory = () => createMockEvaluationProviders()
    }
    const sourcePaths = ['scripts/evaluate-reliability.mjs', 'scripts/evaluation-curl-transport.mjs',
      'src/main/evaluation/evidence-question-evaluation.ts', 'src/main/evaluation/evaluation-fixture.ts',
      'src/main/evidence-agent/bounded-agent-runner.ts', 'src/main/evidence-agent/agent-policy.ts', 'src/main/evidence-agent/agent-tools.ts',
      'src/main/evidence-agent/agent-prompt.ts', 'src/main/evidence-agent/agent-evidence-projection.ts', 'src/main/evidence-agent/tool-calling-provider.ts',
      'src/main/reasoning/reasoning-prompt-builder.ts', 'src/main/reasoning/interaction-reasoner.ts', 'src/main/reasoning/reasoning-output-parser.ts',
      'src/main/reasoning/evidence-citation-validator.ts', 'src/shared/interaction-reasoning-validation.ts',
      'src/main/providers/deepseek-provider.ts', 'src/main/providers/deepseek-tool-calling-provider.ts', 'src/main/providers/deepseek-output-instructions.ts',
      ...(await readdir(resolve(root, 'src/main/evaluation/reliability'))).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => `src/main/evaluation/reliability/${name}`)]
    const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(resolve(root, path)))])))
    const cases = RELIABILITY_CASES.filter(item => options.sets.includes(item.set))
    const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const frozenSchedule = schedule.map((item, index) => ({ position: index + 1, originalIndex: item.originalIndex, questionId: item.testCase.id, set: item.testCase.set, repeatIndex: item.repeatIndex, mode: item.mode, variant: item.variant }))
    metadata = { version: 'wememo-real-model-reliability-v2', createdAt, mode: options.mode, providerId, modelId, variants: options.variants, sets: options.sets,
      plannedRuns: schedule.length, gitHead, canary: options.canary,
      orderPolicy: options.canary ? 'canary-N01-N02-N03-S01-repeat1-then-original-remainder-v1' : 'original-rotating-pairs-v1',
      schedule: frozenSchedule, scheduleSha256: hash(JSON.stringify(frozenSchedule)),
      controls: { temperature: 'provider-default-omitted', thinking: 'disabled', stream: false, maxOutputTokens: 4096, retries: 0,
        agentMaxModelCalls: 3, agentMaxToolCalls: 4, agentMaxRequestChars: 32000, evidenceMaxItems: 24,
        evidenceMaxExcerptChars: 500, evidenceMaxChars: 12000, referenceTime: EVALUATION_REFERENCE_TIME },
      transport: options.proxy ? 'curl-local-proxy' : options.mode === 'live' ? 'fetch' : 'mock', sourceHashes,
      sourceFixtureSha256: hash(document), fixtureHashes: Object.fromEntries(Object.entries(fixtures).map(([key, pack]) => [key, hash(JSON.stringify(pack))])),
      cases, repeatCounts: REPEAT_COUNTS, fixtureProvenance: { demo: 'trusted synthetic Demo Builder', injection: 'Demo Pack with one workload excerpt containing an untrusted instruction',
        'context-only': 'Demo Pack filtered to context evidence; original metrics/status retained' }, qualityScoring: 'pending-human-review' }
    await save('manifest.json', metadata)
    await writeFile(resolve(directory, 'runs.jsonl'), '', { flag: 'wx', mode: 0o600 })
    await writeFile(resolve(directory, 'review-checkpoint.jsonl'), '', { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ mode: options.mode, modelId, plannedRuns: metadata.plannedRuns, variants: options.variants, sets: options.sets, input: 'synthetic-only' }))
    const report = await runReliabilityEvaluation(fixtures, factory, { ...options, providerId, modelId, signal: controller.signal,
      async onCanary(rows) {
        const stored = (await readFile(resolve(directory, 'runs.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
        const hashesMatch = (await Promise.all(Object.entries(sourceHashes).map(async ([path, expected]) => hash(await readFile(resolve(root, path))) === expected))).every(Boolean)
        const checks = { completedEight: rows.length === 8, normalSix: rows.filter(row => row.set === 'normal').length === 6,
          stressTwo: rows.filter(row => row.set === 'stress').length === 2,
          providerReturnedEveryTurn: rows.every(row => row.providerPass === true), persistedExactly: JSON.stringify(stored) === JSON.stringify(rows),
          failuresClassified: rows.every(row => row.endToEndPass ? row.failureCode === null : row.failureCode !== null && row.failureCode !== 'observation_mismatch' && row.failureCode !== 'runtime_rejection'),
          sourceHashesMatch: hashesMatch, gitHeadUnchanged: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() === gitHead }
        const infraPass = Object.values(checks).every(Boolean)
        await save('canary.json', { version: 'wememo-v0-canary-v1', checks, infraPass, records: rows, qualityScored: false })
        console.log(JSON.stringify({ stage: 'canary-review', runs: 8, infraPass, checks }))
        if (!infraPass) return false
        const terminal = createInterface({ input: process.stdin, output: process.stdout })
        let decision
        try { decision = await terminal.question('Canary saved. Type CONTINUE to run the remaining 72 with unchanged variables: ', { signal: controller.signal }) }
        finally { terminal.close() }
        const finalHashesMatch = (await Promise.all(Object.entries(sourceHashes).map(async ([path, expected]) => hash(await readFile(resolve(root, path))) === expected))).every(Boolean)
        const approved = decision.trim() === 'CONTINUE' && finalHashesMatch && !controller.signal.aborted && execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() === gitHead
        await save('canary-decision.json', { continue: approved, sourceHashesMatch: finalHashesMatch, reviewedAt: new Date().toISOString(), remainingRuns: 72 })
        return approved
      },
      async onRecord(record, review) {
        records.push(record); if (review) reviews.push(review)
        await appendFile(resolve(directory, 'runs.jsonl'), JSON.stringify(record) + '\n')
        if (review) await appendFile(resolve(directory, 'review-checkpoint.jsonl'), JSON.stringify(review) + '\n')
        console.log(JSON.stringify({ completed: records.length, set: record.set, question: record.questionId, repeat: record.repeatIndex,
          mode: record.mode, variant: record.promptVariant, failure: record.failureCode, valid: record.endToEndPass }))
      } })
    const { reviews: items, ...metrics } = report
    await save('report.json', { ...metadata, ...metrics })
    await save('review-items.json', items)
    await save('ratings-template.json', items.map(item => ({ reviewId: item.reviewId, reviewer: null, scores: item.scores, notes: '' })))
    completed = true
    console.log(JSON.stringify({ directory, completedRuns: report.completedRuns, summary: report.summary, pendingHumanReviews: items.length }))
    if (controller.signal.aborted) process.exitCode = 130
    else if (report.canaryStopped) process.exitCode = 2
  }
} catch {
  console.error('D6 evaluation stopped. Check arguments, a new output directory, model environment or local proxy. Existing checkpoints are retained; no automatic retry.')
  process.exitCode = 1
} finally {
  if (directory && metadata && !completed) {
    try { await save('incomplete.json', { ...metadata, completedRuns: records.length, interrupted: true, setupOrPersistenceFailed: true, records, qualityScoring: 'pending-human-review' }) } catch {}
  }
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); await server?.close()
}
