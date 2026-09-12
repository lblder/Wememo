import { INTERACTION_REASONING_VERSION, type InteractionReasoningResult, type InteractionReasoningFinding } from './interaction-reasoning'

export class InteractionReasoningValidationError extends Error {
  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`)
    this.name = 'InteractionReasoningValidationError'
  }
}

function fail(path: string, reason: string): never {
  throw new InteractionReasoningValidationError(path, reason)
}

function object(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(path, 'expected plain JSON object')
  }
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))) {
    fail(path, 'expected exact keys')
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(path, 'expected JSON data properties')
  }
  return value as Record<string, unknown>
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected non-empty string')
  return value
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected array')
  if (Reflect.ownKeys(value).length !== value.length + 1) fail(path, 'expected dense JSON array')
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (!descriptor?.enumerable || !('value' in descriptor)) fail(path, 'expected JSON array values')
  }
  return value
}

function evidenceIds(value: unknown, path: string): string[] {
  const ids = array(value, path).map((id, i) => text(id, `${path}[${i}]`))
  if (ids.length === 0) fail(path, 'at least one citation is required')
  if (new Set(ids).size !== ids.length) fail(path, 'duplicate evidence ID')
  return ids
}

function uniqueIds(items: { id: string }[], path: string): void {
  if (new Set(items.map((item) => item.id)).size !== items.length) fail(path, 'duplicate ID')
}

/** Exact JSON contract. Returns fresh data; never repairs malformed model output. */
export function validateInteractionReasoningResult(value: unknown): InteractionReasoningResult {
  const data = object(value, ['version', 'summary', 'findings', 'alternativeExplanations', 'uncertainties'], 'result')
  if (data.version !== INTERACTION_REASONING_VERSION) fail('version', 'unsupported version')
  const findings = array(data.findings, 'findings').map((value, index): InteractionReasoningFinding => {
    const path = `findings[${index}]`
    const item = object(value, ['id', 'claim', 'evidenceIds', 'confidence'], path)
    const confidence = item.confidence
    if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
      fail(`${path}.confidence`, 'expected low, medium or high')
    }
    return {
      id: text(item.id, `${path}.id`), claim: text(item.claim, `${path}.claim`),
      evidenceIds: evidenceIds(item.evidenceIds, `${path}.evidenceIds`), confidence
    }
  })
  const alternativeExplanations = array(data.alternativeExplanations, 'alternativeExplanations').map((value, index) => {
    const path = `alternativeExplanations[${index}]`
    const item = object(value, ['id', 'explanation', 'evidenceIds'], path)
    return {
      id: text(item.id, `${path}.id`), explanation: text(item.explanation, `${path}.explanation`),
      evidenceIds: evidenceIds(item.evidenceIds, `${path}.evidenceIds`)
    }
  })
  uniqueIds(findings, 'findings')
  uniqueIds(alternativeExplanations, 'alternativeExplanations')
  const uncertainties = array(data.uncertainties, 'uncertainties').map((item, i) => text(item, `uncertainties[${i}]`))
  if (uncertainties.length === 0) fail('uncertainties', 'at least one uncertainty is required')
  return {
    version: INTERACTION_REASONING_VERSION, summary: text(data.summary, 'summary'),
    findings, alternativeExplanations, uncertainties
  }
}
