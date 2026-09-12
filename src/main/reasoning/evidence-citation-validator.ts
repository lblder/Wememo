import type { AnalysisContextPack } from '../../shared/analysis-context'
import { validateAnalysisContextPack } from '../../shared/analysis-context-validation'
import type { InteractionReasoningResult } from '../../shared/interaction-reasoning'
import { validateInteractionReasoningResult } from '../../shared/interaction-reasoning-validation'
import type { EvidenceIdBinding } from './reasoning-prompt-builder'

export class EvidenceCitationValidationError extends Error {
  constructor(reason: string) {
    super(`Invalid evidence citation: ${reason}`)
    this.name = 'EvidenceCitationValidationError'
  }
}

/** Checks existence, actual prompt exposure and direction, not natural-language entailment.
 * Optional local bindings resolve provider aliases to canonical D4 IDs. Without
 * bindings, callers may validate canonical IDs directly.
 */
export function validateReasoningCitations(
  result: InteractionReasoningResult,
  contextPack: AnalysisContextPack,
  allowedEvidenceIds: readonly string[],
  bindings?: readonly EvidenceIdBinding[]
): InteractionReasoningResult {
  const validated = validateInteractionReasoningResult(result)
  const pack = validateAnalysisContextPack(contextPack)
  const evidence = pack.evidence
  const directions = new Map<string, 'support' | 'counter' | 'context'>()
  for (const item of [...evidence.metricSupport, ...evidence.messageSupport, ...evidence.semanticSupport]) directions.set(item.id, 'support')
  for (const item of [...evidence.metricCounter, ...evidence.messageCounter, ...evidence.semanticCounter]) directions.set(item.id, 'counter')
  for (const item of evidence.semanticContext) directions.set(item.id, 'context')
  const reject = (reason: string): never => { throw new EvidenceCitationValidationError(reason) }
  const allowed = new Set(allowedEvidenceIds)
  if (allowed.size !== allowedEvidenceIds.length) reject('duplicate allowed ID')
  const idMap = new Map<string, string>()
  const canonicalIds = new Set<string>()
  for (const binding of bindings ?? allowedEvidenceIds.map((id) => ({ promptId: id, evidenceId: id }))) {
    if (!allowed.has(binding.promptId) || !directions.has(binding.evidenceId)) reject('unknown ID in allowed bindings')
    if (idMap.has(binding.promptId) || canonicalIds.has(binding.evidenceId)) reject('duplicate binding')
    idMap.set(binding.promptId, binding.evidenceId)
    canonicalIds.add(binding.evidenceId)
  }
  if (idMap.size !== allowed.size) reject('incomplete bindings')
  const resolve = (ids: readonly string[]): string[] => ids.map((id) => {
    if (!allowed.has(id) || !idMap.has(id)) reject('ID was not provided in this prompt')
    return idMap.get(id)!
  })
  for (const finding of validated.findings) {
    finding.evidenceIds = resolve(finding.evidenceIds)
    if (!finding.evidenceIds.some((id) => directions.get(id) === 'support')) reject('finding requires support evidence')
  }
  for (const alternative of validated.alternativeExplanations) {
    alternative.evidenceIds = resolve(alternative.evidenceIds)
    if (alternative.evidenceIds.some((id) => directions.get(id) === 'support')) reject('alternative requires only counter/context evidence')
  }
  return validated
}
