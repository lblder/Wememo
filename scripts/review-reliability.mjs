import { createServer } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
let server
try {
  const args = process.argv.slice(2); const values = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--report', '--ratings', '--out'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw new Error('Invalid arguments')
    values[args[i]] = resolve(args[i + 1])
  }
  if (Object.keys(values).length !== 3) throw new Error('Missing arguments')
  const reportText = await readFile(values['--report'], 'utf8'); const ratingsText = await readFile(values['--ratings'], 'utf8')
  const report = JSON.parse(reportText)
  if (report.version !== 'wememo-real-model-reliability-v2') throw new Error('Invalid report')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  server = await createServer({ root, configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  const { summarizeHumanRatings } = await server.ssrLoadModule('/src/main/evaluation/reliability/quality-review.ts')
  const result = summarizeHumanRatings(report.records, JSON.parse(ratingsText))
  const sha256 = text => createHash('sha256').update(text).digest('hex')
  await writeFile(values['--out'], JSON.stringify({ ...result, reportSha256: sha256(reportText), ratingsSha256: sha256(ratingsText) }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify(result))
} catch { console.error('Human review import failed: check report, unique eligible review IDs, reviewer names, complete 0–2 scores and a new output file.'); process.exitCode = 1 }
finally { await server?.close() }
