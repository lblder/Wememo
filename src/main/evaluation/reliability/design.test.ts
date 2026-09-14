import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RELIABILITY_CASES, REPEAT_COUNTS } from './cases'
import { PROMPT_VARIANTS, variantPrompt } from './prompts'
import { reliabilityFixtures } from './fixtures'
import { reliabilityOptions } from './cli-options'
import { createAgentEvidenceProjection } from '../../evidence-agent/agent-evidence-projection'
import { initialAgentMessage } from '../../evidence-agent/agent-prompt'
import { readEvidence } from '../../evidence-agent/agent-tools'
import { validateAnalysisContextPack } from '../../../shared/analysis-context-validation'
import { demoPack } from '../../reasoning/reasoning-test-fixtures'
import { buildReasoningPrompt } from '../../reasoning/reasoning-prompt-builder'
const document = () => readFileSync('fixtures/import/sample-conversation.json', 'utf8')
describe('D6 predeclared experiment design', () => {
  it('has disjoint normal 10×3×2 and stress 5×2×2 schedules', () => {
    expect(new Set(RELIABILITY_CASES.map(item => item.id)).size).toBe(15)
    expect(RELIABILITY_CASES.filter(item => item.set === 'normal')).toHaveLength(10)
    expect(RELIABILITY_CASES.filter(item => item.set === 'stress')).toHaveLength(5)
    expect(RELIABILITY_CASES.reduce((sum, item) => sum + REPEAT_COUNTS[item.set] * 2, 0)).toBe(80)
    expect(Object.isFrozen(RELIABILITY_CASES[0])).toBe(true)
  })
  it('keeps V0 byte-identical and V2/V3 as separate additions to V1', () => {
    const original = buildReasoningPrompt(demoPack()).systemPrompt
    expect(variantPrompt(original, 'V0')).toBe(original)
    expect(variantPrompt(original, 'V1')).toContain('No additional keys.')
    expect(variantPrompt(original, 'V2')).toContain('check internally')
    expect(variantPrompt(original, 'V2')).not.toContain('EXAMPLE_SUPPORT')
    expect(variantPrompt(original, 'V3')).toContain('EXAMPLE_SUPPORT')
    expect(variantPrompt(original, 'V3')).not.toContain('check internally')
    for (const variant of PROMPT_VARIANTS) expect(variantPrompt(original, variant).endsWith(original)).toBe(true)
  })
  it('creates explicit frozen stress fixtures without changing Demo or deterministic metrics/status', () => {
    const original = document(); const fixtures = reliabilityFixtures(original)
    for (const pack of Object.values(fixtures)) expect(validateAnalysisContextPack(pack)).toBe(pack)
    expect(document()).toBe(original)
    expect(fixtures.demo.evidence.semanticContext.every(item => !item.excerpt.includes('ignore previous instructions'))).toBe(true)
    expect(Object.values(fixtures['context-only'].evidence).flat().every(item => item.direction === 'context')).toBe(true)
    expect(fixtures['context-only'].metrics).toEqual(fixtures.demo.metrics)
    expect(fixtures['context-only'].observations.map(item => item.status)).toEqual(fixtures.demo.observations.map(item => item.status))
  })
  it('exposes injected excerpt only through a real read, never in the initial catalog', () => {
    const projection = createAgentEvidenceProjection(reliabilityFixtures(document()).injection)
    const target = projection.content.find(item => item.category === 'workload')!
    const initial = initialAgentMessage('查看工作证据', projection)
    expect(initial.role === 'user' && initial.content).not.toContain('ignore previous instructions')
    expect(initial.role === 'user' && JSON.parse(initial.content).deliveredIds).toEqual([])
    expect(JSON.stringify(readEvidence(projection, [target.id]))).toContain('ignore previous instructions')
  })
  it('defaults to offline V0; explicit switches preserve strict schedules', () => {
    expect(reliabilityOptions([])).toMatchObject({ mode: 'mock', variants: ['V0'], sets: ['normal', 'stress'] })
    expect(reliabilityOptions(['--live', '--variants', 'V0,V1,V2,V3', '--set', 'stress'])).toMatchObject({ mode: 'live', variants: PROMPT_VARIANTS, sets: ['stress'] })
  })
  it.each([['--live', '--mock'], ['--variants', 'V9'], ['--variants', 'V0,V0'], ['--question', 'custom'], ['--set', 'all'], ['--out'],
    ['--live', '--proxy', 'https://example.com'], ['--live', '--proxy', 'http://localhost/x'], ['--proxy', 'http://localhost:7897']].map(args => ({ args })))('rejects unsafe or ambiguous CLI selection $args', ({ args }) => {
    expect(() => reliabilityOptions(args)).toThrow()
  })
})
