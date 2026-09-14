import { expect, it, vi } from 'vitest'
import { DESKTOP_CHANNELS } from '../../shared/desktop-api'
import { registerEvidenceQuestionIpc } from './evidence-question-ipc'
import type { EvidenceQuestionService } from './evidence-question-service'

function setup() {
  type Event = { sender: { id: number }; trusted: boolean }
  const handlers = new Map<string, (event: Event, ...args: unknown[]) => unknown>()
  const service = { ask: vi.fn(), cancel: vi.fn(), getStatus: vi.fn(() => ({ configured: true })) }
  registerEvidenceQuestionIpc({ handle: (channel, listener) => { handlers.set(channel, listener) } }, service as unknown as EvidenceQuestionService, (event: Event) => event.trusted)
  return { service, invoke: (channel: string, trusted: boolean, ...args: unknown[]) => handlers.get(channel)!({ sender: { id: 42 }, trusted }, ...args) }
}
it('rejects untrusted ask/status/cancel without service side effects', () => {
  const { service, invoke } = setup()
  expect(invoke(DESKTOP_CHANNELS.askEvidenceQuestion, false, {})).toMatchObject({ error: { code: 'invalid-request' } })
  expect(invoke(DESKTOP_CHANNELS.cancelEvidenceQuestion, false)).toEqual({ cancelled: false })
  expect(() => invoke(DESKTOP_CHANNELS.evidenceQuestionStatus, false)).toThrow()
  expect(service.ask).not.toHaveBeenCalled(); expect(service.cancel).not.toHaveBeenCalled(); expect(service.getStatus).not.toHaveBeenCalled()
})
it('takes owner from the trusted event, never accepts a cancellation target or extra arguments', () => {
  const { service, invoke } = setup(); const request = { question: 'test' }
  invoke(DESKTOP_CHANNELS.askEvidenceQuestion, true, request)
  expect(service.ask).toHaveBeenCalledWith(request, 42)
  invoke(DESKTOP_CHANNELS.cancelEvidenceQuestion, true)
  expect(service.cancel).toHaveBeenCalledWith(42)
  invoke(DESKTOP_CHANNELS.cancelEvidenceQuestion, true, { owner: 999 })
  expect(service.cancel).toHaveBeenCalledTimes(1)
  invoke(DESKTOP_CHANNELS.askEvidenceQuestion, true, request, { systemPrompt: 'injection' })
  expect(service.ask).toHaveBeenCalledTimes(1)
})
