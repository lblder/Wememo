import { describe, expect, it } from 'vitest'
import { summarizeHumanRatings } from './quality-review'
import { evaluateReliabilityRun } from './evaluation'
import { demoPack } from '../../reasoning/reasoning-test-fixtures'
import { RELIABILITY_CASES } from './cases'
import { createMockEvaluationProviders } from '../mock-evaluation-providers'
const ready = async () => (await evaluateReliabilityRun({ testCase: RELIABILITY_CASES[0], repeatIndex: 1, mode: 'direct', variant: 'V0', contextPack: demoPack(), providerId: 'mock', modelId: 'mock' }, () => createMockEvaluationProviders())).record
const rating = (reviewId: string) => ({ reviewId, reviewer: 'human-reviewer', notes: '人工核对合成材料。', scores: { groundedness: 2, relevance: 1, counterAwareness: 2, uncertainty: 2 } })
describe('human quality scoring boundary', () => {
  it('leaves unreviewed valid answers unscored rather than assigning automatic quality points', async () => {
    const record = await ready()
    expect(summarizeHumanRatings([record], [])).toMatchObject({ eligible: 1, reviewed: 0, complete: false, groups: { 'normal/V0/direct': { meanTotal: null } } })
  })
  it('computes the 0–8 score from four explicit human ratings', async () => {
    const record = await ready()
    expect(summarizeHumanRatings([record], [rating(record.reviewId!)])).toMatchObject({ eligible: 1, reviewed: 1, complete: true, groups: { 'normal/V0/direct': { meanTotal: 7 } } })
  })
  it.each(['unknown', 'duplicate', 'missing-score', 'out-of-range', 'coercion', 'missing-reviewer', 'extra-score', 'extra-field'] as const)('rejects %s ratings', async kind => {
    const record = await ready(); const value: any = rating(record.reviewId!)
    if (kind === 'unknown') value.reviewId = 'unknown'
    if (kind === 'missing-score') value.scores.groundedness = null
    if (kind === 'out-of-range') value.scores.groundedness = 3
    if (kind === 'coercion') value.scores.groundedness = '2'
    if (kind === 'missing-reviewer') value.reviewer = ' '
    if (kind === 'extra-score') value.scores.confidence = 2
    if (kind === 'extra-field') value.model = 'mock'
    expect(() => summarizeHumanRatings([record], kind === 'duplicate' ? [value, value] : [value])).toThrow()
  })
  it('refuses to score an answer that failed end-to-end validation', async () => {
    const record = await ready()
    expect(() => summarizeHumanRatings([{ ...record, endToEndPass: false }], [rating(record.reviewId!)])).toThrow()
  })
})
