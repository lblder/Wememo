import type { ToolCallingProvider, ToolCallingRequest, ToolCallingResponse } from './tool-calling-provider'

export type MockAgentStep = unknown | ((request: ToolCallingRequest, signal: AbortSignal) => unknown | Promise<unknown>)

/** Scripted, network-free adapter. Functions support deferred/malformed responses in boundary tests. */
export class MockToolCallingProvider implements ToolCallingProvider {
  readonly id = 'mock-tool-calling'
  readonly requests: ToolCallingRequest[] = []
  readonly signals: AbortSignal[] = []
  constructor(private readonly steps: readonly MockAgentStep[]) {}
  get callCount(): number { return this.requests.length }

  async generate(request: ToolCallingRequest, { signal }: { signal: AbortSignal }): Promise<ToolCallingResponse> {
    const index = this.callCount
    this.requests.push(structuredClone(request)); this.signals.push(signal)
    if (index >= this.steps.length) throw new Error('Mock script exhausted')
    const step = this.steps[index]
    const response = typeof step === 'function' ? await step(request, signal) : step
    // Boundary validation intentionally belongs to the runtime, including for malformed mocks.
    return response as ToolCallingResponse
  }
}
