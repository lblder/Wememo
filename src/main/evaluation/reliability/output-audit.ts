import { parseInteractionReasoningOutput, ReasoningOutputParseError } from '../../reasoning/reasoning-output-parser'
import type { InteractionReasoningResult } from '../../../shared/interaction-reasoning'

export type Check = boolean | null
export type ReliabilityFailure = 'invalid_json' | 'missing_field' | 'extra_field' | 'invalid_confidence' | 'invalid_schema'
  | 'unknown_citation' | 'undelivered_citation' | 'finding_without_support' | 'alternative_support_only' | 'alternative_contains_support'
  | 'provider_error' | 'invalid_provider_response' | 'timeout' | 'budget_exceeded' | 'cancelled' | 'no_data' | 'invalid_context'
  | 'unknown_tool' | 'tool_argument_failure' | 'duplicate_tool_call' | 'invalid_tool_alias' | 'runtime_rejection' | 'observation_mismatch'
export interface VisibleEvidence {
  id: string; kind: 'metric' | 'message' | 'semantic'; direction: 'support' | 'counter' | 'context'
  label: string; metric?: string; category?: string
  [key: string]: unknown
}
export interface OutputAudit {
  jsonPass: Check; schemaPass: Check; citationScopePass: Check; citationDirectionPass: Check
  failureCode: ReliabilityFailure | null; issues: ReliabilityFailure[]
  /** Memory-only, only used to create a separate review artifact after runtime success. */
  result?: InteractionReasoningResult
}
export function unattemptedAudit(): OutputAudit {
  return { jsonPass: null, schemaPass: null, citationScopePass: null, citationDirectionPass: null, failureCode: null, issues: [] }
}
function fields(value: unknown): ReliabilityFailure[] {
  const issues = new Set<ReliabilityFailure>()
  const check = (value: unknown, keys: string[]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    if (keys.some(key => !Object.hasOwn(value, key))) issues.add('missing_field')
    if (Object.keys(value).some(key => !keys.includes(key))) issues.add('extra_field')
  }
  check(value, ['version', 'summary', 'findings', 'alternativeExplanations', 'uncertainties'])
  const data = value as Record<string, unknown> | null
  if (Array.isArray(data?.findings)) for (const item of data.findings) {
    check(item, ['id', 'claim', 'evidenceIds', 'confidence'])
    if (item && typeof item === 'object' && Object.hasOwn(item, 'confidence') && !['low', 'medium', 'high'].includes(item.confidence)) issues.add('invalid_confidence')
  }
  if (Array.isArray(data?.alternativeExplanations)) for (const item of data.alternativeExplanations) check(item, ['id', 'explanation', 'evidenceIds'])
  return issues.size ? [...issues] : ['invalid_schema']
}
/** Observational funnel. The frozen runtime remains the sole acceptance authority.
 * Scope is inspected across the whole answer before direction, regardless of validator traversal order.
 */
export function auditOutput(text: string, catalog: readonly VisibleEvidence[], delivered: ReadonlySet<string>): OutputAudit {
  const audit = unattemptedAudit()
  const reject = (issues: ReliabilityFailure[]): OutputAudit => ({ ...audit, failureCode: issues[0], issues })
  let result: InteractionReasoningResult
  try { result = parseInteractionReasoningOutput(text) }
  catch (error) {
    if (error instanceof ReasoningOutputParseError) { audit.jsonPass = false; return reject(['invalid_json']) }
    audit.jsonPass = true; audit.schemaPass = false
    return reject(fields(JSON.parse(text)))
  }
  audit.jsonPass = true; audit.schemaPass = true
  const all = new Map(catalog.map(item => [item.id, item]))
  const ids = [...result.findings, ...result.alternativeExplanations].flatMap(item => item.evidenceIds)
  const scope: ReliabilityFailure[] = []
  if (ids.some(id => !all.has(id))) scope.push('unknown_citation')
  if (ids.some(id => all.has(id) && !delivered.has(id))) scope.push('undelivered_citation')
  audit.citationScopePass = !scope.length
  if (scope.length) return reject(scope)
  const direction: ReliabilityFailure[] = []
  if (result.findings.some(item => !item.evidenceIds.some(id => all.get(id)!.direction === 'support'))) direction.push('finding_without_support')
  if (result.alternativeExplanations.some(item => item.evidenceIds.every(id => all.get(id)!.direction === 'support'))) direction.push('alternative_support_only')
  if (result.alternativeExplanations.some(item => item.evidenceIds.some(id => all.get(id)!.direction === 'support') && item.evidenceIds.some(id => all.get(id)!.direction !== 'support'))) direction.push('alternative_contains_support')
  audit.citationDirectionPass = !direction.length
  return direction.length ? reject(direction) : { ...audit, result }
}
