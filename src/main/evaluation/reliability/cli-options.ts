import type { EvaluationSet } from './cases'
import { PROMPT_VARIANTS, type PromptVariant } from './prompts'
export function reliabilityOptions(args: readonly string[]) {
  let mode: 'mock' | 'live' = 'mock'; let variants: PromptVariant[] = ['V0']; let sets: EvaluationSet[] = ['normal', 'stress']
  let output: string | undefined; let proxy: string | undefined; let canary = false
  const seen = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]; const key = arg === '--live' || arg === '--mock' ? '--mode' : arg
    if (seen.has(key)) throw new Error('Duplicate option')
    seen.add(key)
    if (arg === '--live' || arg === '--mock') { mode = arg === '--live' ? 'live' : 'mock'; continue }
    if (arg === '--canary') { canary = true; continue }
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error('Missing option value')
    if (arg === '--variants') {
      const values = value.split(',')
      if (!values.length || new Set(values).size !== values.length || values.some(v => !PROMPT_VARIANTS.includes(v as PromptVariant))) throw new Error('Invalid variants')
      variants = values as PromptVariant[]
    } else if (arg === '--set') {
      if (!['normal', 'stress', 'both'].includes(value)) throw new Error('Invalid set')
      sets = value === 'both' ? ['normal', 'stress'] : [value as EvaluationSet]
    } else if (arg === '--out') output = value
    else if (arg === '--proxy') {
      const parsed = new URL(value)
      if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Invalid proxy')
      proxy = value
    } else throw new Error('Unknown option')
  }
  if (proxy && mode !== 'live') throw new Error('Proxy only applies to live mode')
  if (canary && (variants.length !== 1 || variants[0] !== 'V0' || sets.length !== 2)) throw new Error('Canary requires full V0')
  return { mode, variants, sets, output, proxy, canary }
}
