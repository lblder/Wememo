/** Runtime-owned hard limits. Neither the question nor the model can override these. */
export const AGENT_POLICY = Object.freeze({
  version: 'wememo-evidence-agent-v1',
  maxModelCalls: 3,
  maxToolCalls: 4,
  maxEvidencePerRead: 6,
  maxEvidenceItems: 24,
  maxExcerptChars: 500,
  maxEvidenceChars: 12_000,
  maxQuestionChars: 1_000,
  maxRequestChars: 32_000,
  maxResponseChars: 32_000,
  maxOutputTokens: 4_096,
  modelTimeoutMs: 60_000,
  toolTimeoutMs: 1_000,
  runTimeoutMs: 120_000
} as const)

export const charCount = (text: string): number => [...text].length
export const truncate = (text: string, limit: number): string => [...text].slice(0, limit).join('')

/** JSON data only; Maps/Sets are deliberately not used for frozen public state. */
export function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child)
    Object.freeze(value)
  }
  return value
}
