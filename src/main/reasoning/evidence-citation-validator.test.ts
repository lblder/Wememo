import { describe, expect, it } from 'vitest'
import { InteractionReasoningValidationError } from '../../shared/interaction-reasoning-validation'
import { validateReasoningCitations, EvidenceCitationValidationError } from './evidence-citation-validator'
import { buildReasoningPrompt } from './reasoning-prompt-builder'
import { crowdedPack, demoPack, resultFor } from './reasoning-test-fixtures'

function setup(pack = demoPack()) {
  const prompt = buildReasoningPrompt(pack)
  const result = resultFor(pack)
  const check = () => validateReasoningCitations(result, pack, prompt.allowedEvidenceIds, prompt.evidenceIdBindings)
  const visible = JSON.parse(prompt.userPrompt).selectedEvidence as { id: string; direction: string }[]
  return { pack, prompt, result, check, visible }
}

describe('validateReasoningCitations', () => {
  it('accepts grounded citations and restores original evidence IDs without mutation', () => {
    const { result, prompt, check } = setup()
    const before = structuredClone(result)
    const validated = check()
    expect(validated.findings[0].evidenceIds[0]).toBe(prompt.evidenceIdBindings.find((b) => b.promptId === result.findings[0].evidenceIds[0])!.evidenceId)
    expect(result).toEqual(before)
  })
  it('also accepts canonical IDs without alias bindings', () => {
    const { pack, result } = setup()
    const ids = [pack.evidence.metricSupport[0].id, pack.evidence.semanticContext[0].id]
    result.findings[0].evidenceIds = [ids[0]]
    result.alternativeExplanations[0].evidenceIds = [ids[1]]
    expect(validateReasoningCitations(result, pack, ids)).toEqual(result)
  })
  it.each(['findings', 'alternativeExplanations'] as const)('rejects hallucinated IDs in %s', (key) => {
    const { result, check } = setup(); result[key][0].evidenceIds = ['E-999']
    expect(check).toThrow(EvidenceCitationValidationError)
  })
  it('rejects a Pack ID excluded by the prompt budget', () => {
    const { pack, prompt, result, check } = setup(crowdedPack())
    const omitted = pack.evidence.semanticContext.at(-1)!
    expect(prompt.evidenceIdBindings.some((b) => b.evidenceId === omitted.id)).toBe(false)
    result.alternativeExplanations[0].evidenceIds = [omitted.id]
    expect(check).toThrow('not provided')
  })
  it('rejects canonical ID bypass when the model was shown only an alias', () => {
    const { result, pack, check } = setup()
    result.findings[0].evidenceIds = [pack.evidence.metricSupport[0].id]
    expect(check).toThrow('not provided')
  })
  it.each(['context', 'counter'])('rejects finding relying only on %s', (direction) => {
    const { result, visible, check } = setup()
    result.findings[0].evidenceIds = [visible.find((e) => e.direction === direction)!.id]
    expect(check).toThrow('requires support')
  })
  it('accepts finding with support plus counter/context', () => {
    const { result, visible, check } = setup()
    result.findings[0].evidenceIds.push(visible.find((e) => e.direction === 'context')!.id)
    expect(check().findings).toHaveLength(1)
  })
  it('rejects alternative using only support', () => {
    const { result, visible, check } = setup()
    result.alternativeExplanations[0].evidenceIds = [visible.find((e) => e.direction === 'support')!.id]
    expect(check).toThrow('only counter/context')
  })
  it('also rejects an alternative mixing support with context', () => {
    const { result, visible, check } = setup()
    result.alternativeExplanations[0].evidenceIds.push(visible.find((e) => e.direction === 'support')!.id)
    expect(check).toThrow('only counter/context')
  })
  it('accepts alternatives combining counter and context', () => {
    const { result, visible, check } = setup()
    result.alternativeExplanations[0].evidenceIds.push(visible.find((e) => e.direction === 'counter')!.id)
    expect(check().alternativeExplanations).toHaveLength(1)
  })
  it('rejects repeated citations even when invoked directly', () => {
    const { result, check } = setup()
    result.findings[0].evidenceIds.push(result.findings[0].evidenceIds[0])
    expect(check).toThrow(InteractionReasoningValidationError)
  })
  it('rejects duplicate allowed IDs', () => {
    const { prompt, check } = setup(); prompt.allowedEvidenceIds.push(prompt.allowedEvidenceIds[0])
    expect(check).toThrow('duplicate allowed')
  })
  it('rejects mappings to nonexistent evidence', () => {
    const { prompt, check } = setup(); prompt.evidenceIdBindings[0].evidenceId = 'E-999'
    expect(check).toThrow('unknown ID')
  })
  it('rejects incomplete or ambiguous bindings', () => {
    const { prompt, check } = setup(); prompt.evidenceIdBindings.pop()
    expect(check).toThrow('incomplete bindings')
  })
})
