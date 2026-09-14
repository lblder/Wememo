export const PROMPT_VARIANTS = ['V0', 'V1', 'V2', 'V3'] as const
export type PromptVariant = typeof PROMPT_VARIANTS[number]
const exact = `Required top-level keys exactly: version, summary, findings, alternativeExplanations, uncertainties.
Each finding has exactly: id, claim, evidenceIds, confidence.
Each alternativeExplanation has exactly: id, explanation, evidenceIds. It has no confidence or claim key.
No additional keys. All required keys must exist. Arrays may be empty when evidence is inadequate.
`
const checklist = `Before returning the final JSON, check internally:
1. Every required key exists.
2. No extra key exists.
3. Every finding has nonempty evidenceIds.
4. Every finding cites at least one delivered support evidence.
5. Alternatives cite only delivered counter/context evidence.
6. Return JSON only; do not output this checklist.
`
const example = `Short valid shape example. EXAMPLE_* identifiers below are fictional placeholders, NEVER available evidence. Replace them with actual delivered aliases or leave the corresponding array empty. The sentences are placeholders, not answers to this question.
{"version":"wememo-interaction-reasoning-v1","summary":"示例摘要","findings":[{"id":"f1","claim":"示例行为描述","evidenceIds":["EXAMPLE_SUPPORT"],"confidence":"low"}],"alternativeExplanations":[{"id":"a1","explanation":"示例替代解释","evidenceIds":["EXAMPLE_CONTEXT"]}],"uncertainties":["示例不确定性"]}
`
/** V0 is byte-for-byte unchanged. V2/V3 each add one factor to V1, not to each other. */
export function variantPrompt(original: string, variant: PromptVariant): string {
  if (variant === 'V0') return original
  return exact + (variant === 'V2' ? checklist : variant === 'V3' ? example : '') + '\n' + original
}
