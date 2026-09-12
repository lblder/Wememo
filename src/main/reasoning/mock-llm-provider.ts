import type { LLMProvider, LLMProviderRequest, LLMProviderResponse } from './llm-provider'

/** Fixed response only: no network, SDK, credentials, retry or model selection. */
export class MockLLMProvider implements LLMProvider {
  readonly id = 'mock'
  callCount = 0
  lastRequest: LLMProviderRequest | undefined

  constructor(private readonly options: { responseText: string }) {}

  async generate(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    this.callCount++
    this.lastRequest = { ...request }
    return { text: this.options.responseText, providerId: this.id, modelId: 'fixed-response-v1' }
  }
}
