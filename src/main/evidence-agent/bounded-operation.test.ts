import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundedOperation } from './bounded-operation'
import { AGENT_POLICY } from './agent-policy'

afterEach(() => vi.useRealTimers())
describe('per-step lifetime boundary', () => {
  it('applies the 1-second tool timeout to an uncooperative async operation', async () => {
    vi.useFakeTimers()
    let operationSignal!: AbortSignal
    const pending = boundedOperation(signal => { operationSignal = signal; return new Promise(() => {}) }, new AbortController().signal, AGENT_POLICY.toolTimeoutMs)
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
    expect(operationSignal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels before scheduled work begins without invoking it', async () => {
    const abort = new AbortController(); const operation = vi.fn(() => 'must not run')
    const pending = boundedOperation(operation, abort.signal, 1_000)
    abort.abort('private')
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(operation).not.toHaveBeenCalled()
  })
  it('rejects synchronous completion after deadline even if the timer has not fired', async () => {
    vi.useFakeTimers()
    const pending = boundedOperation(() => { vi.advanceTimersByTime(1_001); return 'late' }, new AbortController().signal, 1_000)
    await expect(pending).rejects.toMatchObject({ code: 'timeout' })
  })
})
