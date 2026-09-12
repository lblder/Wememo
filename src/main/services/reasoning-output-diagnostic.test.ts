import { describe, expect, it } from 'vitest'
import { describeExactKeyFailure } from './reasoning-output-diagnostic'

describe('safe output field diagnostics', () => {
  it('identifies missing and extra contract fields without including their values', () => {
    const raw = JSON.stringify({ alternativeExplanations: [{ explanation: 'PRIVATE', evidenceIds: ['PRIVATE'], confidence: 'PRIVATE' }] })
    expect(describeExactKeyFailure(raw, 'alternativeExplanations[0]: expected exact keys')).toBe('缺少 id；多出 confidence')
  })
  it('counts arbitrary property names rather than displaying them', () => {
    const raw = JSON.stringify({ findings: [{ id: 'a', claim: 'PRIVATE', evidenceIds: ['x'], confidence: 'low', SECRET_KEY_NAME: 'PRIVATE' }] })
    expect(describeExactKeyFailure(raw, 'findings[0]: expected exact keys')).toBe('另有 1 个未识别字段')
  })
  it.each([undefined, 'not JSON', '{}', '{"alternativeExplanations":[null]}'])('handles unavailable or malformed diagnostic data', raw => {
    expect(describeExactKeyFailure(raw, 'alternativeExplanations[0]: expected exact keys')).toBe('')
  })
  it('ignores messages outside exact-key failures', () => {
    expect(describeExactKeyFailure('{}', 'PRIVATE: unexpected private value')).toBe('')
  })
})
