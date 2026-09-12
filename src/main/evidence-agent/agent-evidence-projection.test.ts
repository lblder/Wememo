import { describe, expect, it } from 'vitest'
import { demoPack, crowdedPack } from '../reasoning/reasoning-test-fixtures'
import { createAgentEvidenceProjection } from './agent-evidence-projection'
import { initialAgentMessage } from './agent-prompt'
import { AGENT_POLICY, charCount } from './agent-policy'
import { readEvidence, readMetrics, validateToolBatch } from './agent-tools'
import { call } from './agent-test-fixtures'

describe('independent Agent evidence projection', () => {
  it('initial metadata includes the third alias but no excerpt or complete metric values', () => {
    const pack = demoPack()
    pack.evidence.semanticContext[0].excerpt = 'UNIQUE_PRIVATE_EXCERPT'
    pack.evidence.semanticContext[0].label = 'UNIQUE_PRIVATE_EXCERPT'
    pack.evidence.metricSupport[0].previous = 123456789
    const projection = createAgentEvidenceProjection(pack)
    const message = initialAgentMessage('有哪些证据？', projection)
    expect(message.role).toBe('user')
    if (message.role !== 'user') return
    const data = JSON.parse(message.content)
    const alias = projection.catalog[2].id
    expect(alias).toMatch(/^ev-[a-f0-9-]+-003$/)
    expect(message.content).toContain(alias)
    expect(message.content).not.toContain('UNIQUE_PRIVATE_EXCERPT')
    expect(message.content).not.toContain('123456789')
    expect(data.deliveredIds).toEqual([])
    expect(Object.keys(data)).toEqual(['question', 'coverage', 'catalog', 'deliveredIds'])
    for (const entry of data.catalog) expect(Object.keys(entry)).toEqual(['id', 'kind', 'direction', 'label'])
    expect(readEvidence(projection, [alias]).evidence[0].sources?.[0].excerpt).toBe('UNIQUE_PRIVATE_EXCERPT')
  })
  it('never serializes scope, canonical IDs, sender IDs or message IDs into tool content', () => {
    const pack = demoPack()
    const item = pack.evidence.semanticContext[0]
    item.excerpt = [pack.scope.accountId, pack.scope.conversationId, item.id, item.senderId, ...item.messageIds].join(' ')
    const projection = createAgentEvidenceProjection(pack)
    const exposed = JSON.stringify({ initial: initialAgentMessage(item.excerpt, projection), content: projection.content, metrics: readMetrics(projection) })
    for (const id of [pack.scope.accountId, pack.scope.conversationId, item.id, item.senderId, ...item.messageIds]) expect(exposed).not.toContain(id)
    const metrics = JSON.stringify(readMetrics(projection))
    for (const key of ['accountId', 'conversationId', 'messageId', 'senderId', 'evidenceIds']) expect(metrics).not.toContain(key)
    const allEvidence = Object.values(pack.evidence).flat()
    for (const evidence of allEvidence) expect(metrics).not.toContain(evidence.id)
    for (const id of [pack.scope.accountId, pack.scope.conversationId]) expect(metrics).not.toContain(id)
    const read = readEvidence(projection, projection.catalog.slice(0, 6).map(entry => entry.id))
    expect(read.evidence.map(entry => entry.id)).toEqual(projection.catalog.slice(0, 6).map(entry => entry.id))
    for (const evidence of allEvidence) expect(JSON.stringify(read)).not.toContain(evidence.id)
  })
  it('makes a detached recursively frozen snapshot and local binding table', () => {
    const original = demoPack()
    const projection = createAgentEvidenceProjection(original)
    original.evidence.semanticContext[0].excerpt = 'changed later'
    expect(projection.snapshot.evidence.semanticContext[0].excerpt).not.toBe('changed later')
    expect(Object.isFrozen(projection.snapshot.metrics.previous)).toBe(true)
    expect(Object.isFrozen(projection.content[0])).toBe(true)
    expect(Object.isFrozen(projection.aliasBindings[0])).toBe(true)
    expect(() => { projection.catalog[0].label = 'mutated' }).toThrow()
  })
  it('generates distinct aliases across runs even for the same pack', () => {
    const first = createAgentEvidenceProjection(demoPack())
    const second = createAgentEvidenceProjection(demoPack())
    expect(first.runId).not.toBe(second.runId)
    expect(() => readEvidence(second, [first.catalog[0].id])).toThrow('证据别名')
  })
  it('preserves support/counter/context selection and enforces catalog/item budgets', () => {
    const pack = crowdedPack()
    pack.evidence.semanticContext.forEach(item => { item.excerpt = '🙂'.repeat(900) })
    const projection = createAgentEvidenceProjection(pack)
    expect(projection.content.length).toBeLessThanOrEqual(AGENT_POLICY.maxEvidenceItems)
    expect(charCount(JSON.stringify(projection.content))).toBeLessThanOrEqual(AGENT_POLICY.maxEvidenceChars)
    expect(new Set(projection.catalog.map(item => item.direction))).toEqual(new Set(['support', 'counter', 'context']))
    for (const item of projection.content) for (const source of item.sources ?? []) {
      expect(charCount(source.excerpt)).toBeLessThanOrEqual(500)
      expect(source.excerpt).not.toMatch(/[\uD800-\uDBFF]$/)
    }
    const context = projection.content.find(item => item.kind === 'semantic' && item.direction === 'context')!
    expect(context.sources![0].truncated).toBe(true)
  })
  it('does not leak raw summaries via read_metrics or initial catalog', () => {
    const pack = demoPack(); pack.observations[0].summary = 'UNREQUESTED_PRIVATE_SUMMARY'
    const projection = createAgentEvidenceProjection(pack)
    expect(JSON.stringify(readMetrics(projection))).not.toContain('UNREQUESTED_PRIVATE_SUMMARY')
    expect(JSON.stringify(initialAgentMessage('说明指标', projection))).not.toContain('UNREQUESTED_PRIVATE_SUMMARY')
    expect(readMetrics(projection).metrics).toEqual(pack.metrics)
  })
})

describe('read-only tool batch contract', () => {
  it.each(['accountId', 'conversationId', 'messageId', 'SQL', 'path', 'systemPrompt'])('rejects scope/argument injection %s for both tools', key => {
    const projection = createAgentEvidenceProjection(demoPack())
    for (const name of ['read_metrics', 'read_evidence']) {
      const args = name === 'read_evidence' ? { evidenceIds: [projection.catalog[0].id], [key]: 'private' } : { [key]: 'private' }
      expect(() => validateToolBatch([call('a', name, args)], projection, new Set(), 0)).toThrow('工具参数')
    }
  })
  it.each([[], ['missing'], ['x', 'x'], Array(7).fill('x'), [4], 'not-array', null])('rejects invalid evidence arguments %j', ids => {
    const projection = createAgentEvidenceProjection(demoPack())
    expect(() => validateToolBatch([call('a', 'read_evidence', { evidenceIds: ids })], projection, new Set(), 0)).toThrow()
  })
  it('rejects canonical evidence IDs, even when in the snapshot', () => {
    const projection = createAgentEvidenceProjection(demoPack())
    expect(() => readEvidence(projection, [projection.snapshot.evidence.metricSupport[0].id])).toThrow('证据别名')
  })
  it('rejects malformed argument JSON and unknown tools', () => {
    const projection = createAgentEvidenceProjection(demoPack())
    expect(() => validateToolBatch([{ id: 'a', name: 'read_metrics', argumentsJson: '{' }], projection, new Set(), 0)).toThrow('工具参数')
    expect(() => validateToolBatch([call('a', 'query_sql')], projection, new Set(), 0)).toThrow('未授权工具')
  })
})
