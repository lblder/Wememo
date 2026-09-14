import type { DesktopApi } from '../../shared/desktop-api'
import { EVIDENCE_QUESTION_ERRORS, type EvidenceQuestionRequest, type EvidenceQuestionResponse, type EvidenceQuestionFailurePhase, type EvidenceQuestionErrorCode } from '../../shared/evidence-question-ipc'

export interface QuestionState {
  phase: 'idle' | 'running' | 'success' | EvidenceQuestionFailurePhase
  busy: boolean
  question?: string
  response?: EvidenceQuestionResponse
}

/** One mounted scope owns one controller. Invalidated generations can never publish results. */
export class EvidenceQuestionController {
  private state: QuestionState = { phase: 'idle', busy: false }
  private generation = 0
  private active: number | null = null
  private listeners = new Set<() => void>()
  constructor(private readonly api: Pick<DesktopApi, 'askEvidenceQuestion' | 'cancelEvidenceQuestion'>) {}
  getSnapshot = (): QuestionState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private publish(state: QuestionState): void { this.state = state; this.listeners.forEach(listener => listener()) }
  reset(): void { if (!this.state.busy) this.publish({ phase: 'idle', busy: false }) }

  async ask(request: EvidenceQuestionRequest): Promise<void> {
    if (this.active !== null) return
    const id = ++this.generation
    this.active = id
    this.publish({ phase: 'running', busy: true, question: request.question })
    try {
      const response = await this.api.askEvidenceQuestion(request)
      if (id !== this.generation) return
      this.publish({ phase: response.ok ? 'success' : EVIDENCE_QUESTION_ERRORS[response.error.code][0],
        busy: true, question: request.question, response })
    } catch {
      if (id === this.generation) this.fail('provider-unavailable')
    } finally {
      if (this.active === id) { this.active = null; this.publish({ ...this.state, busy: false }) }
    }
  }

  private fail(code: EvidenceQuestionErrorCode): void {
    this.publish({ ...this.state, phase: EVIDENCE_QUESTION_ERRORS[code][0], response: { ok: false, error: { code } } })
  }
  cancel(): void {
    if (this.active === null || this.state.phase === 'cancelled') return
    ++this.generation
    this.fail('cancelled')
    // Local cancellation discards late answers even if IPC is already closing.
    void this.api.cancelEvidenceQuestion().catch(() => {})
  }
  dispose(): void { this.cancel(); ++this.generation }
}
