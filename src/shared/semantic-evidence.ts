export type SemanticEvidenceCategory =
  | 'workload'
  | 'fatigue'
  | 'explicit-explanation'
  | 'future-plan'
  | 'reassurance'
  | 'positive-engagement'

/** Literal message content, never a psychological or relationship judgment. */
export interface SemanticEvidence {
  id: string
  kind: 'semantic'
  category: SemanticEvidenceCategory
  direction: 'support' | 'counter' | 'context'
  label: string
  /** Static heuristic rule strength (0.7 or 0.9), not a learned probability. */
  confidence: number
  ruleId: string
  messageIds: string[]
  excerpt: string
  timestamp: number
  senderId: string
  senderName?: string
}
