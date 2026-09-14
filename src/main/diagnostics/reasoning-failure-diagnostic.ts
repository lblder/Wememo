import type { ReasoningDiagnostic } from '../../shared/reasoning-diagnostic'
import { InteractionReasoningValidationError } from '../../shared/interaction-reasoning-validation'
import { ReasoningOutputParseError } from '../reasoning/reasoning-output-parser'
import { EvidenceCitationValidationError } from '../reasoning/evidence-citation-validator'
import { describeExactKeyFailure } from './reasoning-output-diagnostic'

/** Observes existing rejection decisions; never changes acceptance or returns model text. */
export function diagnoseReasoningFailure(error: unknown, text?: string): ReasoningDiagnostic | undefined {
  if (error instanceof ReasoningOutputParseError) return { kind: 'invalid-json' }
  if (error instanceof InteractionReasoningValidationError) {
    const path = /^(result|version|summary|findings(?:\[\d{1,6}\])?(?:\.(?:id|claim|evidenceIds|confidence))?(?:\[\d{1,6}\])?|alternativeExplanations(?:\[\d{1,6}\])?(?:\.(?:id|explanation|evidenceIds))?(?:\[\d{1,6}\])?|uncertainties(?:\[\d{1,6}\])?): /.exec(error.message)?.[1]
    const keys = describeExactKeyFailure(text, error.message)
    return { kind: 'invalid-fields', ...(path ? { detail: [path, keys].filter(Boolean).join('：') } : {}) }
  }
  if (error instanceof EvidenceCitationValidationError) {
    switch (error.message) {
      case 'Invalid evidence citation: ID was not provided in this prompt': return { kind: 'citation-not-delivered' }
      case 'Invalid evidence citation: finding requires support evidence': return { kind: 'finding-missing-support' }
      case 'Invalid evidence citation: alternative requires only counter/context evidence': return { kind: 'alternative-uses-support' }
      default: return { kind: 'citation-binding-invalid' }
    }
  }
  return undefined
}
