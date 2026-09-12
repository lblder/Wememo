export const INTERACTION_REASONING_VERSION = 'wememo-interaction-reasoning-v1'

/** Qualitative reasoning confidence, never a probability. */
export type ReasoningConfidence = 'low' | 'medium' | 'high'

export interface InteractionReasoningFinding {
  id: string
  claim: string
  evidenceIds: string[]
  confidence: ReasoningConfidence
}

export interface AlternativeExplanation {
  id: string
  explanation: string
  evidenceIds: string[]
}

export interface InteractionReasoningResult {
  version: typeof INTERACTION_REASONING_VERSION
  summary: string
  findings: InteractionReasoningFinding[]
  alternativeExplanations: AlternativeExplanation[]
  uncertainties: string[]
}
