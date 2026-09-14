import { describe, expect, it } from 'vitest'
import { auditOutput, type VisibleEvidence } from './output-audit'
import { INTERACTION_REASONING_VERSION } from '../../../shared/interaction-reasoning'
const catalog: VisibleEvidence[] = [
  { id: 's', kind: 'metric', direction: 'support', label: 'support' },
  { id: 'c', kind: 'semantic', direction: 'context', label: 'context' },
  { id: 'r', kind: 'semantic', direction: 'counter', label: 'counter' }
]
export const answer = () => ({ version: INTERACTION_REASONING_VERSION, summary: '行为变化。',
  findings: [{ id: 'f1', claim: '观察到行为变化。', evidenceIds: ['s'], confidence: 'low' }],
  alternativeExplanations: [{ id: 'a1', explanation: '还有其他背景。', evidenceIds: ['c'] }], uncertainties: ['无法反映真实心理。'] })
const audit = (value: unknown, delivered = ['s', 'c', 'r']) => auditOutput(JSON.stringify(value), catalog, new Set(delivered))
describe('D6 observational failure funnel', () => {
  it.each(['', 'not JSON', '```json\n{}\n```', '{'])('rejects syntax without pretending fields or citations were inspected: %s', text => {
    expect(auditOutput(text, catalog, new Set())).toMatchObject({ jsonPass: false, schemaPass: null, citationScopePass: null, citationDirectionPass: null, failureCode: 'invalid_json' })
  })
  it.each([null, 1, [], { x: 'private' }])('valid JSON has a separate contract failure: %s', value => {
    expect(audit(value)).toMatchObject({ jsonPass: true, schemaPass: false, citationScopePass: null })
  })
  it('distinguishes missing and extra keys in the same answer without exposing unknown names/values', () => {
    const value: any = answer(); delete value.alternativeExplanations[0].id
    value.alternativeExplanations[0].PRIVATE_KEY = 'PRIVATE_VALUE'
    const result = audit(value)
    expect(result.issues).toEqual(['missing_field', 'extra_field'])
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
    expect(result).not.toHaveProperty('result')
  })
  it('separates confidence errors from other field errors', () => {
    const value = answer(); value.findings[0].confidence = 'certain'
    expect(audit(value).failureCode).toBe('invalid_confidence')
    value.findings[0].confidence = 'low'; value.uncertainties = []
    expect(audit(value).failureCode).toBe('invalid_schema')
  })
  it('distinguishes unknown IDs and catalog-only IDs, withholding direction checks until all scope checks pass', () => {
    const value = answer(); value.findings[0].evidenceIds = ['private-unknown', 'r']
    const result = audit(value, ['s', 'c'])
    expect(result).toMatchObject({ schemaPass: true, citationScopePass: false, citationDirectionPass: null, issues: ['unknown_citation', 'undelivered_citation'] })
    expect(JSON.stringify(result)).not.toContain('private-unknown')
  })
  it('checks all citation scopes before direction, even if runtime traverses findings first', () => {
    const value = answer(); value.findings[0].evidenceIds = ['c']; value.alternativeExplanations[0].evidenceIds = ['unknown']
    expect(audit(value)).toMatchObject({ failureCode: 'unknown_citation', citationDirectionPass: null })
  })
  it('distinguishes support-only and mixed-direction invalid alternatives', () => {
    const value = answer(); value.alternativeExplanations[0].evidenceIds = ['s']
    expect(audit(value).failureCode).toBe('alternative_support_only')
    value.alternativeExplanations[0].evidenceIds = ['s', 'c']
    expect(audit(value).failureCode).toBe('alternative_contains_support')
  })
  it('requires support for findings and permits support mixed with context', () => {
    const value = answer(); value.findings[0].evidenceIds = ['c']
    expect(audit(value)).toMatchObject({ citationScopePass: true, citationDirectionPass: false, failureCode: 'finding_without_support' })
    value.findings[0].evidenceIds = ['s', 'c']
    expect(audit(value).citationDirectionPass).toBe(true)
  })
  it('permits empty findings and empty alternatives without reading evidence', () => {
    const value = answer(); value.findings = []; value.alternativeExplanations = []
    expect(audit(value, [])).toMatchObject({ jsonPass: true, schemaPass: true, citationScopePass: true, citationDirectionPass: true, failureCode: null })
  })
  it('does not repair duplicate citations or mutated field types', () => {
    const value = answer(); value.findings[0].evidenceIds = ['s', 's']
    expect(audit(value).schemaPass).toBe(false)
    expect(value.findings[0].evidenceIds).toEqual(['s', 's'])
  })
})
