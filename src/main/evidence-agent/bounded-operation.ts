import { AgentRunError } from './agent-errors'

/** Rejects promptly even when an adapter ignores AbortSignal. Late results cannot win. */
export async function boundedOperation<T>(operation: (signal: AbortSignal) => Promise<T> | T, parent: AbortSignal, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const deadline = performance.now() + timeoutMs
  const parentError = (): AgentRunError => parent.reason instanceof AgentRunError ? parent.reason : new AgentRunError('cancelled')
  if (parent.aborted) throw parentError()
  if (timeoutMs <= 0) throw new AgentRunError('timeout')
  let rejectBoundary!: (error: AgentRunError) => void
  const boundary = new Promise<never>((_resolve, reject) => { rejectBoundary = reject })
  const stop = (error: AgentRunError): void => {
    controller.abort(error)
    rejectBoundary(error)
  }
  const onAbort = (): void => stop(parentError())
  parent.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => stop(new AgentRunError('timeout')), timeoutMs)
  try {
    const work = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason
      return operation(controller.signal)
    })
    const result = await Promise.race([work, boundary])
    if (parent.aborted) throw parentError()
    if (performance.now() >= deadline) throw new AgentRunError('timeout')
    return result
  } finally {
    clearTimeout(timeout)
    parent.removeEventListener('abort', onAbort)
  }
}
