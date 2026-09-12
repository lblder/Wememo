import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANALYSIS_CONTEXT_VERSION } from '../../shared/analysis-context'
import { AnalysisContextValidationError } from '../../shared/analysis-context-validation'
import { INTERACTION_REASONING_VERSION } from '../../shared/interaction-reasoning'
import { InteractionReasoningValidationError } from '../../shared/interaction-reasoning-validation'
import { openDatabase } from '../data/database'
import { SqliteMessageRepository } from '../data/sqlite-message-repository'
import { InteractionAnalysisService } from '../analytics/interaction-analysis-service'
import { InteractionReasoner } from './interaction-reasoner'
import { MockLLMProvider } from './mock-llm-provider'
import { LLMProviderError, type LLMProvider } from './llm-provider'
import { ReasoningOutputParseError } from './reasoning-output-parser'
import { EvidenceCitationValidationError } from './evidence-citation-validator'
import { demoMessages, demoPack, resultFor, crowdedPack } from './reasoning-test-fixtures'

const mock = (value: unknown) => new MockLLMProvider({ responseText: JSON.stringify(value) })

describe('InteractionReasoner', () => {
  it('executes the valid pipeline and preserves deterministic observations', async () => {
    const pack = demoPack(); const before = structuredClone(pack)
    const provider = mock(resultFor(pack))
    const result = await new InteractionReasoner(provider).reason(pack)
    expect(result.version).toBe(INTERACTION_REASONING_VERSION)
    expect(provider.callCount).toBe(1)
    expect(provider.lastRequest?.responseFormat).toBe('json')
    expect(Object.keys(provider.lastRequest!)).toEqual(['systemPrompt', 'userPrompt', 'responseFormat'])
    expect(pack).toEqual(before)
    expect(pack.evidence.metricSupport.map((e) => e.id)).toContain(result.findings[0].evidenceIds[0])
  })
  it('rejects invalid context with zero provider calls', async () => {
    const pack = demoPack(); pack.coverage.recentMessageCount++
    const provider = mock({})
    await expect(new InteractionReasoner(provider).reason(pack)).rejects.toBeInstanceOf(AnalysisContextValidationError)
    expect(provider.callCount).toBe(0)
    expect(provider.lastRequest).toBeUndefined()
  })
  it('rejects malformed provider output', async () => {
    const provider = new MockLLMProvider({ responseText: '```json\n{}\n```' })
    await expect(new InteractionReasoner(provider).reason(demoPack())).rejects.toBeInstanceOf(ReasoningOutputParseError)
  })
  it('rejects schema-invalid JSON output', async () => {
    await expect(new InteractionReasoner(mock({})).reason(demoPack())).rejects.toBeInstanceOf(InteractionReasoningValidationError)
  })
  it('rejects hallucinated evidence IDs', async () => {
    const pack = demoPack(); const response = resultFor(pack)
    response.findings[0].evidenceIds = ['E-999']
    await expect(new InteractionReasoner(mock(response)).reason(pack)).rejects.toBeInstanceOf(EvidenceCitationValidationError)
  })
  it('rejects IDs from valid Pack evidence not sent under the budget', async () => {
    const pack = crowdedPack(); const response = resultFor(pack)
    response.alternativeExplanations[0].evidenceIds = [pack.evidence.semanticContext.at(-1)!.id]
    await expect(new InteractionReasoner(mock(response)).reason(pack)).rejects.toBeInstanceOf(EvidenceCitationValidationError)
  })
  it('distinguishes provider errors without retrying', async () => {
    let calls = 0
    const cause = new Error('test provider failure')
    const provider: LLMProvider = { id: 'failing-test', async generate() { calls++; throw cause } }
    await expect(new InteractionReasoner(provider).reason(demoPack())).rejects.toMatchObject({ name: 'LLMProviderError', cause })
    expect(calls).toBe(1)
    expect(new LLMProviderError('test', cause)).toBeInstanceOf(Error)
  })
  it('uses the pre-call snapshot if the caller changes context while awaiting', async () => {
    const pack = demoPack(); const response = JSON.stringify(resultFor(pack))
    const provider: LLMProvider = { id: 'mutating-test', async generate() {
      pack.observations[0].status = 'insufficient'
      pack.evidence.metricSupport = []
      return { text: response, providerId: 'mutating-test' }
    } }
    const result = await new InteractionReasoner(provider).reason(pack)
    expect(result.findings).toHaveLength(1)
  })
  it('integrates Demo JSON → SQLite → Service → Reasoner → Mock without network', async () => {
    const database = openDatabase(':memory:')
    try {
      const messages = demoMessages()
      const repository = new SqliteMessageRepository(database)
      repository.insertMessages(messages)
      const { contextPack } = new InteractionAnalysisService(repository).analyzePeriod({
        accountId: messages[0].accountId, conversationId: messages[0].conversationId,
        referenceTime: Date.parse('2026-09-11T12:00:00+08:00')
      })
      const provider = mock(resultFor(contextPack))
      const result = await new InteractionReasoner(provider).reason(contextPack)
      expect(contextPack.version).toBe(ANALYSIS_CONTEXT_VERSION)
      expect(result.version).toBe(INTERACTION_REASONING_VERSION)
      expect(provider.lastRequest?.userPrompt).not.toContain(contextPack.scope.accountId)
      expect(provider.lastRequest?.userPrompt).not.toContain(contextPack.scope.conversationId)
      const supportIds = [...contextPack.evidence.metricSupport, ...contextPack.evidence.messageSupport, ...contextPack.evidence.semanticSupport].map((e) => e.id)
      const alternativeIds = [...contextPack.evidence.metricCounter, ...contextPack.evidence.messageCounter, ...contextPack.evidence.semanticCounter, ...contextPack.evidence.semanticContext].map((e) => e.id)
      expect(result.findings[0].evidenceIds.some((id) => supportIds.includes(id))).toBe(true)
      expect(result.alternativeExplanations[0].evidenceIds.every((id) => alternativeIds.includes(id))).toBe(true)
    } finally { database.close() }
  })
  it('keeps production reasoning independent of data access, analytics and networking', () => {
    const files = readdirSync('src/main/reasoning').filter((name) => name.endsWith('.ts') && !name.includes('.test.') && !name.includes('test-fixtures'))
    for (const name of files) {
      const source = readFileSync(`src/main/reasoning/${name}`, 'utf8')
      expect(source).not.toMatch(/from ['"].*(?:analytics\/|\/data\/|data-sources\/|electron|node:fs|node:sqlite)/)
      expect(source).not.toMatch(/\bfetch\s*\(|\bDatabaseSync\b|\bMessageRepository\b/)
    }
  })
})
