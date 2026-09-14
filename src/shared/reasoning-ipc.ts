import type { AnalysisContextPack } from './analysis-context'
import type { InteractionReasoningResult } from './interaction-reasoning'
import type { ReasoningDiagnostic } from './reasoning-diagnostic'

/** Renderer can request a scope, never supply prompts, evidence or a Context Pack. */
export interface GenerateReasoningRequest {
  accountId: string
  conversationId: string
  days: number
}

export type ReasoningErrorCode =
  | 'invalid-request' | 'not-configured' | 'busy' | 'no-data'
  | 'authentication' | 'rate-limited' | 'timeout' | 'provider-unavailable'
  | 'invalid-context' | 'invalid-output' | 'invalid-citation' | 'internal'

export interface ReasoningProviderStatus {
  providerId: string
  modelId: string
  configured: boolean
  message: string
}

export interface GeneratedReasoning {
  result: InteractionReasoningResult
  /** The exact local snapshot used for this result's canonical citations. */
  contextPack: AnalysisContextPack
  providerId: string
  modelId: string
}

export type GenerateReasoningResponse =
  | { ok: true; value: GeneratedReasoning }
  | { ok: false; error: { code: ReasoningErrorCode; message: string; diagnostic?: ReasoningDiagnostic } }

export class ReasoningRequestValidationError extends Error {
  constructor() {
    super('仅允许 accountId、conversationId 和 1–31 的整数 days')
    this.name = 'ReasoningRequestValidationError'
  }
}

export function validateGenerateReasoningRequest(value: unknown): GenerateReasoningRequest {
  const reject = (): never => { throw new ReasoningRequestValidationError() }
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) reject()
  const data = value as Record<string, unknown>
  const keys = Reflect.ownKeys(data)
  if (keys.length !== 3 || keys.some((key) => !['accountId', 'conversationId', 'days'].includes(String(key)))) reject()
  for (const key of ['accountId', 'conversationId', 'days']) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) reject()
  }
  if (typeof data.accountId !== 'string' || !data.accountId.trim() || data.accountId.length > 512) reject()
  if (typeof data.conversationId !== 'string' || !data.conversationId.trim() || data.conversationId.length > 512) reject()
  if (typeof data.days !== 'number' || !Number.isInteger(data.days) || data.days < 1 || data.days > 31) reject()
  return { accountId: data.accountId as string, conversationId: data.conversationId as string, days: data.days as number }
}
