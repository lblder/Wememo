import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANALYSIS_CONTEXT_VERSION } from '../../shared/analysis-context'
import { DEFAULT_ANALYSIS_POLICY } from '../../shared/analysis-policy'
import { validateAnalysisContextPack } from '../../shared/analysis-context-validation'
import { syntheticConversation } from '../../shared/fixtures/synthetic-conversation'
import { parseJsonImportDocument } from '../data-sources/json-message-source'
import { openDatabase } from '../data/database'
import { SqliteMessageRepository } from '../data/sqlite-message-repository'
import { compareInteractionPeriods } from './period-comparison'
import { buildInteractionEvidenceReport } from './evidence-builder'
import { buildAnalysisContextPack } from './analysis-context-builder'
import { InteractionAnalysisService } from './interaction-analysis-service'

function input() {
  const messages = parseJsonImportDocument(readFileSync('fixtures/import/sample-conversation.json', 'utf8')).messages
  const generatedAt = Date.parse('2026-09-11T12:00:00+08:00')
  const comparison = compareInteractionPeriods(messages, generatedAt)
  const scope = { accountId: messages[0].accountId, conversationId: messages[0].conversationId }
  const evidenceReport = buildInteractionEvidenceReport({
    ...scope, comparison, messages,
    analyzedMessageCount: comparison.previous.totalMessages + comparison.recent.totalMessages
  })
  return { ...scope, generatedAt, comparison, evidenceReport }
}

describe('buildAnalysisContextPack', () => {
  it('preserves versions, policy, metrics, windows, status and coverage', () => {
    const source = input()
    const pack = buildAnalysisContextPack(source)
    expect(pack.version).toBe(ANALYSIS_CONTEXT_VERSION)
    expect(pack.policy).toEqual(DEFAULT_ANALYSIS_POLICY)
    expect(pack.metrics).toEqual({ previous: source.comparison.previous, recent: source.comparison.recent, changes: source.comparison.changes })
    expect(pack.windows).toEqual(source.comparison.windows)
    expect(pack.observations[0].status).toBe(source.evidenceReport.observations[0].status)
    expect(pack.coverage).toEqual({
      analyzedMessageCount: source.evidenceReport.analyzedMessageCount,
      previousMessageCount: source.comparison.previous.totalMessages,
      recentMessageCount: source.comparison.recent.totalMessages,
      previousActiveDays: source.comparison.previous.activeDays,
      recentActiveDays: source.comparison.recent.activeDays
    })
  })
  it('classifies all seven groups by direction, including legacy mixed semantic arrays', () => {
    const source = input()
    const observation = source.evidenceReport.observations[0]
    // Deliberately place a support item in the legacy counter container.
    observation.counterSemanticEvidence.push({ ...observation.counterSemanticEvidence[0], id: 'future-support', direction: 'support' })
    const pack = buildAnalysisContextPack(source)
    expect(pack.evidence.semanticSupport.map((e) => e.id)).toEqual(['future-support'])
    for (const key of ['metricSupport', 'messageSupport', 'semanticSupport'] as const) {
      expect(pack.evidence[key].length).toBeGreaterThan(0)
      expect(pack.evidence[key].every((e) => e.direction === 'support')).toBe(true)
    }
    for (const key of ['metricCounter', 'messageCounter', 'semanticCounter'] as const) {
      expect(pack.evidence[key].length).toBeGreaterThan(0)
      expect(pack.evidence[key].every((e) => e.direction === 'counter')).toBe(true)
    }
    expect(pack.evidence.semanticContext.length).toBeGreaterThan(0)
    expect(pack.evidence.semanticContext.every((e) => e.direction === 'context')).toBe(true)
    expect(pack.evidence.semanticSupport.some((e) => ['workload', 'fatigue'].includes(e.category))).toBe(false)
  })
  it('deduplicates shared evidence and references while preserving first-seen order', () => {
    const source = input()
    const baseline = buildAnalysisContextPack(source)
    const first = source.evidenceReport.observations[0]
    first.evidence.push(first.evidence[0])
    source.evidenceReport.observations.push({ ...first, id: 'another-observation' })
    const pack = buildAnalysisContextPack(source)
    expect(pack.evidence).toEqual(baseline.evidence)
    expect(pack.observations[0].evidenceIds).toEqual(baseline.observations[0].evidenceIds)
    expect(pack.observations[1].evidenceIds).toEqual(pack.observations[0].evidenceIds)
  })
  it('rejects conflicting evidence sharing an ID', () => {
    const source = input()
    const items = source.evidenceReport.observations[0].evidence
    items.push({ ...items[0], label: 'conflicting content' })
    expect(() => buildAnalysisContextPack(source)).toThrow('Conflicting evidence ID')
  })
  it.each(['accountId', 'conversationId'] as const)('rejects mismatched %s', (key) => {
    const source = input()
    source.evidenceReport[key] = 'other-scope'
    expect(() => buildAnalysisContextPack(source)).toThrow('scope mismatch')
  })
  it('rejects mismatched windows', () => {
    const source = input()
    source.evidenceReport.windows = structuredClone(source.comparison.windows)
    source.evidenceReport.windows.recent.endTime++
    expect(() => buildAnalysisContextPack(source)).toThrow('windows mismatch')
  })
  it('rejects mismatched analyzed counts', () => {
    const source = input()
    source.evidenceReport.analyzedMessageCount++
    expect(() => buildAnalysisContextPack(source)).toThrow('coverage')
  })
  it('builds a detached deeply frozen JSON snapshot', () => {
    const source = input()
    const pack = buildAnalysisContextPack(source)
    expect(Object.isFrozen(pack)).toBe(true)
    expect(Object.isFrozen(pack.evidence.semanticContext[0].messageIds)).toBe(true)
    expect(Object.isFrozen(source.comparison.previous)).toBe(false)
    source.comparison.previous.totalMessages++
    expect(pack.metrics.previous.totalMessages).not.toBe(source.comparison.previous.totalMessages)
    expect(validateAnalysisContextPack(JSON.parse(JSON.stringify(pack)))).toEqual(pack)
  })
  it('omits unselected message text and full-message arrays', () => {
    const marker = 'UNSELECTED-PRIVATE-MESSAGE-ONLY-9843'
    const generatedAt = 2_000_000_000_000
    const messages = [{ ...syntheticConversation[0], text: marker, timestamp: generatedAt - 1000, direction: 'outgoing' as const }]
    const comparison = compareInteractionPeriods(messages, generatedAt)
    const scope = { accountId: messages[0].accountId, conversationId: messages[0].conversationId }
    const evidenceReport = buildInteractionEvidenceReport({ ...scope, comparison, messages, analyzedMessageCount: 1 })
    const pack = buildAnalysisContextPack({ ...scope, comparison, evidenceReport, generatedAt })
    expect('messages' in pack).toBe(false)
    expect('allMessages' in pack).toBe(false)
    expect('entireConversation' in pack).toBe(false)
    expect(JSON.stringify(pack)).not.toContain(marker)
  })
  it('integrates Demo through SQLite and Service with original evidence provenance', () => {
    const database = openDatabase(':memory:')
    try {
      const repository = new SqliteMessageRepository(database)
      const imported = parseJsonImportDocument(readFileSync('fixtures/import/sample-conversation.json', 'utf8'))
      expect(imported.rejected).toBe(0)
      repository.insertMessages(imported.messages)
      const source = input()
      const result = new InteractionAnalysisService(repository).analyzePeriod({
        accountId: source.accountId, conversationId: source.conversationId, referenceTime: source.generatedAt
      })
      const pack = validateAnalysisContextPack(JSON.parse(JSON.stringify(result.contextPack)))
      expect(pack.evidence.semanticContext.some((e) => e.category === 'workload')).toBe(true)
      expect(pack.evidence.semanticCounter.map((e) => e.category)).toEqual(expect.arrayContaining(['explicit-explanation', 'reassurance']))
      expect(pack.evidence.semanticSupport).toEqual([])
      expect(pack.coverage.analyzedMessageCount).toBe(result.analyzedMessageCount)
      expect(pack.metrics.previous).toEqual(result.comparison.previous)
      for (const item of [...pack.evidence.semanticContext, ...pack.evidence.semanticCounter]) {
        const message = imported.messages.find((m) => m.id === item.messageIds[0])!
        expect(message).toBeDefined()
        expect(item.excerpt).toBe(message.text)
        expect(item.timestamp).toBe(message.timestamp)
      }
    } finally { database.close() }
  })
})
