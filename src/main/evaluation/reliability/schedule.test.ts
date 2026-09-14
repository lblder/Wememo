import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { reliabilitySchedule } from './schedule'
import { reliabilityOptions } from './cli-options'
import { reliabilityFixtures } from './fixtures'
import { runReliabilityEvaluation } from './evaluation'
import { createMockEvaluationProviders } from '../mock-evaluation-providers'

const fixtures = () => reliabilityFixtures(readFileSync('fixtures/import/sample-conversation.json', 'utf8'))
describe('predeclared V0 canary scheduling', () => {
  it('selects six Normal and two Stress while preserving every original tuple and pair orientation', () => {
    const original = reliabilitySchedule(); const schedule = reliabilitySchedule({ canary: true })
    expect(schedule).toHaveLength(80)
    expect(schedule.slice(0, 8).map(item => item.originalIndex)).toEqual([1, 2, 7, 8, 13, 14, 61, 62])
    expect(schedule.slice(0, 8).filter(item => item.testCase.set === 'normal')).toHaveLength(6)
    expect(schedule.slice(0, 8).filter(item => item.testCase.set === 'stress')).toHaveLength(2)
    expect([...schedule].sort((a, b) => a.originalIndex - b.originalIndex)).toEqual(original)
    const used = new Set(schedule.slice(0, 8).map(item => item.originalIndex))
    expect(schedule.slice(8)).toEqual(original.filter(item => !used.has(item.originalIndex)))
    expect(Object.isFrozen(schedule[0].testCase)).toBe(true)
  })
  it.each([
    { variants: ['V1'] as const }, { variants: ['V0', 'V1'] as const }, { sets: ['normal'] as const }, { cases: [] }
  ])('rejects canary on a different experiment %j', options => {
    expect(() => reliabilitySchedule({ ...options, canary: true })).toThrow()
  })
  it('requires an explicit gate for canary execution before invoking any provider', async () => {
    const factory = vi.fn(createMockEvaluationProviders)
    await expect(runReliabilityEvaluation(fixtures(), factory, { canary: true, providerId: 'mock', modelId: 'mock' })).rejects.toThrow()
    expect(factory).not.toHaveBeenCalled()
  })
  it('pauses after persisted canary callbacks; continues the other 72 only when released', async () => {
    let release!: (approved: boolean) => void
    let reached!: () => void
    const paused = new Promise<void>(resolve => { reached = resolve })
    let stored = 0
    const pending = runReliabilityEvaluation(fixtures(), () => createMockEvaluationProviders(), {
      canary: true, providerId: 'mock', modelId: 'mock', onRecord: () => { stored++ },
      onCanary: rows => { expect(rows).toHaveLength(8); expect(stored).toBe(8); reached(); return new Promise(resolve => { release = resolve }) }
    })
    await paused
    await Promise.resolve(); expect(stored).toBe(8)
    release(true)
    const report = await pending
    expect(report).toMatchObject({ completedRuns: 80, plannedRuns: 80, canaryStopped: false })
    expect(new Set(report.records.map(row => `${row.questionId}/${row.repeatIndex}/${row.mode}`)).size).toBe(80)
  })
  it('retains eight results when the canary fails instead of silently continuing', async () => {
    const report = await runReliabilityEvaluation(fixtures(), () => createMockEvaluationProviders(), {
      canary: true, providerId: 'mock', modelId: 'mock', onCanary: () => false
    })
    expect(report).toMatchObject({ completedRuns: 8, plannedRuns: 80, canaryStopped: true })
    expect(report.records.filter(row => row.set === 'stress')).toHaveLength(2)
  })
  it('recognizes the flag without consuming the following option', () => {
    expect(reliabilityOptions(['--live', '--canary', '--variants', 'V0'])).toMatchObject({ mode: 'live', canary: true, variants: ['V0'] })
    expect(() => reliabilityOptions(['--canary', '--canary'])).toThrow()
    expect(() => reliabilityOptions(['--canary', '--variants', 'V2'])).toThrow()
  })
})
