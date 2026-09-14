import { freezeJson } from '../../evidence-agent/agent-policy'
import { RELIABILITY_CASES, REPEAT_COUNTS, type EvaluationSet, type ReliabilityCase } from './cases'
import type { PromptVariant } from './prompts'

export interface ScheduledReliabilityRun {
  originalIndex: number; testCase: ReliabilityCase; repeatIndex: number
  mode: 'direct' | 'agent'; variant: PromptVariant
}
/** Canary prioritizes predeclared pairs; original pair orientation and remainder order are retained. */
export function reliabilitySchedule(options: { variants?: readonly PromptVariant[]; sets?: readonly EvaluationSet[];
  cases?: readonly ReliabilityCase[]; canary?: boolean } = {}): readonly ScheduledReliabilityRun[] {
  const variants: PromptVariant[] = [...(options.variants ?? ['V0'])]
  const sets: EvaluationSet[] = [...(options.sets ?? ['normal', 'stress'])]
  if (!variants.length || new Set(variants).size !== variants.length || variants.some(v => !['V0', 'V1', 'V2', 'V3'].includes(v))) throw new Error('Invalid variants')
  if (!sets.length || new Set(sets).size !== sets.length || sets.some(s => !['normal', 'stress'].includes(s))) throw new Error('Invalid sets')
  const cases = structuredClone((options.cases ?? RELIABILITY_CASES).filter(item => sets.includes(item.set)))
  const schedule: ScheduledReliabilityRun[] = []
  let pair = 0
  for (const testCase of cases) for (let repeatIndex = 1; repeatIndex <= REPEAT_COUNTS[testCase.set]; repeatIndex++) {
    const ordered = [...variants.slice(pair % variants.length), ...variants.slice(0, pair % variants.length)]
    for (const variant of ordered) {
      const modes: ('direct' | 'agent')[] = (pair + variants.indexOf(variant)) % 2 ? ['agent', 'direct'] : ['direct', 'agent']
      for (const mode of modes) schedule.push({ originalIndex: schedule.length + 1, testCase, repeatIndex, mode, variant })
    }
    pair++
  }
  if (!options.canary) return freezeJson(schedule)
  if (variants.length !== 1 || variants[0] !== 'V0' || schedule.length !== 80 || options.cases) throw new Error('Canary requires the full fixed V0 schedule')
  const selected = (item: ScheduledReliabilityRun) => item.repeatIndex === 1 && ['N01', 'N02', 'N03', 'S01'].includes(item.testCase.id)
  const prefix = schedule.filter(selected)
  if (prefix.length !== 8 || prefix.filter(item => item.testCase.set === 'normal').length !== 6) throw new Error('Invalid canary composition')
  return freezeJson([...prefix, ...schedule.filter(item => !selected(item))])
}
