import { DESKTOP_CHANNELS } from '../../shared/desktop-api'
import type { EvidenceQuestionService } from './evidence-question-service'

/** Narrow registration seam permits testing sender and argument boundaries without Electron. */
export function registerEvidenceQuestionIpc<Event extends { sender: { id: number } }>(
  ipc: { handle(channel: string, listener: (event: Event, ...args: unknown[]) => unknown): void },
  service: Pick<EvidenceQuestionService, 'getStatus' | 'ask' | 'cancel'>,
  trusted: (event: Event) => boolean
): void {
  const rejected = () => ({ ok: false, error: { code: 'invalid-request' } })
  const allowed = (event: Event): boolean => { try { return trusted(event) } catch { return false } }
  ipc.handle(DESKTOP_CHANNELS.evidenceQuestionStatus, (event, ...args) => {
    if (!allowed(event) || args.length) throw new Error('Evidence question status rejected')
    return service.getStatus()
  })
  ipc.handle(DESKTOP_CHANNELS.askEvidenceQuestion, (event, ...args) => {
    if (!allowed(event) || args.length !== 1) return rejected()
    return service.ask(args[0], event.sender.id)
  })
  ipc.handle(DESKTOP_CHANNELS.cancelEvidenceQuestion, (event, ...args) => {
    if (!allowed(event) || args.length) return { cancelled: false }
    return service.cancel(event.sender.id)
  })
}
