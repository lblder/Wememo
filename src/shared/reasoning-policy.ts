export const REASONING_PROMPT_POLICY_VERSION = 'wememo-reasoning-prompt-v1'

export const DEFAULT_REASONING_PROMPT_POLICY = Object.freeze({
  version: REASONING_PROMPT_POLICY_VERSION,
  language: 'zh-CN',
  maxEvidenceItems: 24,
  maxExcerptChars: 500,
  // Total Unicode code points of the serialized provider-facing evidence catalog.
  maxEvidenceTextChars: 12000
} as const)
