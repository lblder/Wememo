import type { InteractionReasoningResult } from '../../shared/interaction-reasoning'
import { validateInteractionReasoningResult } from '../../shared/interaction-reasoning-validation'

export class ReasoningOutputParseError extends Error {
  constructor() {
    super('Reasoning output must be a single valid JSON document')
    this.name = 'ReasoningOutputParseError'
  }
}

export function parseInteractionReasoningOutput(rawText: string): InteractionReasoningResult {
  let value: unknown
  try {
    if (typeof rawText !== 'string') throw new ReasoningOutputParseError()
    value = JSON.parse(rawText)
  } catch {
    // Do not echo model output into error messages or logs.
    throw new ReasoningOutputParseError()
  }
  return validateInteractionReasoningResult(value)
}
