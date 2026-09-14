import { createServer } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

// Offline parity check only: no Provider is constructed and no network request is made.
const input = resolve(process.argv[2] ?? 'docs/evaluation/reports/2026-09-14-instructor-pydantic-comparison.json')
const output = resolve(process.argv[3] ?? 'docs/evaluation/reports/2026-09-14-instructor-comparison-parity.json')
const raw = await readFile(input, 'utf8')
const report = JSON.parse(raw)
if (!report.completed) throw new Error('Comparison must be complete')
const server = await createServer({ root: process.cwd(), configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { validateInteractionReasoningResult } = await server.ssrLoadModule('/src/shared/interaction-reasoning-validation.ts')
  const { validateReasoningCitations } = await server.ssrLoadModule('/src/main/reasoning/evidence-citation-validator.ts')
  const { demoPack } = await server.ssrLoadModule('/src/main/reasoning/reasoning-test-fixtures.ts')
  const pack = demoPack()
  // Existing synthetic test Pack supplies valid support/context binding targets locally.
  // This checks validator decisions, not correspondence of generated claims to that Pack.
  const targets = new Map([
    ['ev-probe-support', pack.evidence.metricSupport[0].id],
    ['ev-probe-context', pack.evidence.semanticContext[0].id]
  ])
  const rows = []
  for (const vector of report.selfTest.vectors) {
    let accepted = false
    try { validateInteractionReasoningResult(vector.value); accepted = true } catch {}
    if (accepted !== vector.expected) throw new Error('Offline vector mismatch')
  }
  for (const record of report.records) {
    let value, jsonPass = null, shapePass = null, citationPass = null, safeError = null
    if (record.syntheticFinalText !== null) {
      try { value = JSON.parse(record.syntheticFinalText); jsonPass = true } catch { jsonPass = false }
      if (jsonPass) {
        try { value = validateInteractionReasoningResult(value); shapePass = true }
        catch (error) { shapePass = false; safeError = error.message }
      }
      if (shapePass) {
        const delivered = report.cases.find(item => item.id === record.caseId).delivered
        const bindings = delivered.map(promptId => ({ promptId, evidenceId: targets.get(promptId) }))
        try { validateReasoningCitations(value, pack, delivered, bindings); citationPass = true }
        catch (error) { citationPass = false; safeError = error.message }
      }
    }
    const agrees = jsonPass === record.jsonParsePass && shapePass === record.pydanticPass && citationPass === record.citationPass
    rows.push({ caseId: record.caseId, repetition: record.repetition, arm: record.arm, jsonPass, shapePass, citationPass, agrees, safeError })
  }
  const hashes = {}
  for (const path of ['src/shared/interaction-reasoning-validation.ts', 'src/main/reasoning/evidence-citation-validator.ts', 'fixtures/import/sample-conversation.json']) {
    hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  const result = { version: 'wememo-instructor-parity-v1', liveRequests: 0, validationFixture: 'existing-synthetic-demo-offline-only',
    inputSha256: createHash('sha256').update(raw).digest('hex'), sourceHashes: hashes,
    vectorsMatched: report.selfTest.vectors.length, recordsMatched: rows.filter(row => row.agrees).length, records: rows }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  if (rows.some(row => !row.agrees)) throw new Error('Live output validation parity mismatch')
  console.log(JSON.stringify({ parity: 'PASS', recordsMatched: result.recordsMatched, vectorsMatched: result.vectorsMatched, liveRequests: 0, report: output }))
} finally { await server.close() }
