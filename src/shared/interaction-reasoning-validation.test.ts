import { describe, expect, it } from 'vitest'
import { INTERACTION_REASONING_VERSION } from './interaction-reasoning'
import { InteractionReasoningValidationError, validateInteractionReasoningResult } from './interaction-reasoning-validation'

function valid(): any {
  return {
    version: INTERACTION_REASONING_VERSION, summary: '存在互动变化。',
    findings: [{ id: 'f1', claim: '消息数量下降。', evidenceIds: ['support-1'], confidence: 'medium' }],
    alternativeExplanations: [{ id: 'a1', explanation: '工作安排可能是背景。', evidenceIds: ['context-1'] }],
    uncertainties: ['行为不能代表真实心理。']
  }
}

describe('validateInteractionReasoningResult', () => {
  it('accepts the complete contract and returns independent data', () => {
    const input = valid()
    const result = validateInteractionReasoningResult(input)
    expect(result).toEqual(input)
    result.findings[0].evidenceIds.push('another')
    expect(input.findings[0].evidenceIds).toEqual(['support-1'])
  })
  it('allows empty findings and alternatives when evidence is unavailable', () => {
    const input = valid(); input.findings = []; input.alternativeExplanations = []
    expect(validateInteractionReasoningResult(input)).toEqual(input)
  })
  it.each(['version', 'summary', 'findings', 'alternativeExplanations', 'uncertainties'])('rejects missing %s', (key) => {
    const input = valid(); delete input[key]
    expect(() => validateInteractionReasoningResult(input)).toThrow(InteractionReasoningValidationError)
  })
  it.each(['newStatus', 'relationshipStatus', 'evilExtraField'])('rejects top-level extra %s', (key) => {
    const input = valid(); input[key] = 'detected'
    expect(() => validateInteractionReasoningResult(input)).toThrow('exact keys')
  })
  it.each(['findings', 'alternativeExplanations'])('rejects extra fields in %s', (key) => {
    const input = valid(); input[key][0].evilExtraField = 'bad'
    expect(() => validateInteractionReasoningResult(input)).toThrow('exact keys')
  })
  it.each([0.92, 'certain', null, true])('rejects confidence %s', (confidence) => {
    const input = valid(); input.findings[0].confidence = confidence
    expect(() => validateInteractionReasoningResult(input)).toThrow('confidence')
  })
  it.each(['low', 'medium', 'high'])('accepts qualitative confidence %s', (confidence) => {
    const input = valid(); input.findings[0].confidence = confidence
    expect(validateInteractionReasoningResult(input).findings[0].confidence).toBe(confidence)
  })
  it.each(['findings', 'alternativeExplanations'])('rejects empty citations in %s', (key) => {
    const input = valid(); input[key][0].evidenceIds = []
    expect(() => validateInteractionReasoningResult(input)).toThrow('citation')
  })
  it.each(['findings', 'alternativeExplanations'])('rejects duplicate citations in %s', (key) => {
    const input = valid(); input[key][0].evidenceIds = ['e1', 'e1']
    expect(() => validateInteractionReasoningResult(input)).toThrow('duplicate evidence')
  })
  it.each(['findings', 'alternativeExplanations'])('rejects duplicate row IDs in %s', (key) => {
    const input = valid(); input[key].push({ ...input[key][0] })
    expect(() => validateInteractionReasoningResult(input)).toThrow('duplicate ID')
  })
  it.each([
    ['findings', 'id'], ['findings', 'claim'], ['alternativeExplanations', 'id'], ['alternativeExplanations', 'explanation']
  ])('rejects blank %s.%s', (group, key) => {
    const input = valid(); input[group][0][key] = '  '
    expect(() => validateInteractionReasoningResult(input)).toThrow('non-empty')
  })
  it('rejects wrong version', () => {
    const input = valid(); input.version = 'v2'
    expect(() => validateInteractionReasoningResult(input)).toThrow('version')
  })
  it('requires uncertainty instead of silently ignoring it', () => {
    const input = valid(); input.uncertainties = []
    expect(() => validateInteractionReasoningResult(input)).toThrow('uncertainty')
  })
  it('rejects a blank uncertainty', () => {
    const input = valid(); input.uncertainties = [' ']
    expect(() => validateInteractionReasoningResult(input)).toThrow('non-empty')
  })
  it('rejects sparse arrays', () => {
    const input = valid(); input.findings = new Array(1)
    expect(() => validateInteractionReasoningResult(input)).toThrow('dense JSON array')
  })
  it('rejects accessors without executing them', () => {
    const input = valid()
    Object.defineProperty(input, 'summary', { enumerable: true, get: () => { throw new Error('must not execute') } })
    expect(() => validateInteractionReasoningResult(input)).toThrow('JSON data')
  })
})
