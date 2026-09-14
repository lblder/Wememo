import { AnalysisContextValidationError } from '../../shared/analysis-context-validation'
import { validateEvidenceQuestionRequest, type EvidenceQuestionResponse } from '../../shared/evidence-question-ipc'
import type { ReasoningProviderStatus } from '../../shared/reasoning-ipc'
import type { InteractionAnalysisService } from '../analytics/interaction-analysis-service'
import { BoundedAgentRunner } from '../evidence-agent/bounded-agent-runner'
import type { ToolCallingProvider } from '../evidence-agent/tool-calling-provider'

/** Main creates scope snapshots. Owner identity is supplied by IPC, never by Renderer data. */
export class EvidenceQuestionService {
  private active?: { owner: number; controller: AbortController }
  constructor(
    private readonly analysis: Pick<InteractionAnalysisService, 'analyzePeriod'>,
    private readonly provider: ToolCallingProvider | undefined,
    private readonly status: ReasoningProviderStatus
  ) {}

  getStatus(): ReasoningProviderStatus { return { ...this.status } }
  get isBusy(): boolean { return Boolean(this.active) }
  cancel(owner: number): { cancelled: boolean } {
    if (!this.active || this.active.owner !== owner) return { cancelled: false }
    this.active.controller.abort()
    return { cancelled: true }
  }

  async ask(value: unknown, owner: number): Promise<EvidenceQuestionResponse> {
    let request
    try { request = validateEvidenceQuestionRequest(value) } catch { return { ok: false, error: { code: 'invalid-request' } } }
    if (this.active) return { ok: false, error: { code: 'busy' } }
    if (!this.provider) return { ok: false, error: { code: 'not-configured' } }
    const active = { owner, controller: new AbortController() }
    this.active = active
    const started = performance.now()
    try {
      const { accountId, conversationId, days, question } = request
      const { contextPack } = this.analysis.analyzePeriod({ accountId, conversationId, days })
      const response = await new BoundedAgentRunner(this.provider).run({ contextPack, question }, { signal: active.controller.signal })
      const stats = { modelCalls: response.metadata.modelCalls, toolCalls: response.metadata.toolCalls,
        deliveredCount: response.metadata.deliveredIds.length, elapsedMs: Math.max(0, performance.now() - started) }
      if (active.controller.signal.aborted) return { ok: false, error: { code: 'cancelled' }, stats }
      if (!response.ok) return { ok: false, error: { code: response.error.code, ...(response.error.diagnostic ? { diagnostic: response.error.diagnostic } : {}) }, stats }
      return { ok: true, value: { ...response.value, providerId: this.status.providerId, modelId: this.status.modelId }, stats }
    } catch (error) {
      return { ok: false, error: { code: error instanceof AnalysisContextValidationError ? 'invalid-context' : 'internal' } }
    } finally { if (this.active === active) this.active = undefined }
  }
}
