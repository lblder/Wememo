/** Providers only receive serialized prompts, never analysis objects or data access. */
export interface LLMProviderRequest {
  systemPrompt: string
  userPrompt: string
  responseFormat: 'json'
}

export interface LLMProviderResponse {
  text: string
  providerId: string
  modelId?: string
}

export interface LLMProvider {
  readonly id: string
  generate(request: LLMProviderRequest): Promise<LLMProviderResponse>
}

export class LLMProviderError extends Error {
  constructor(providerId: string, cause: unknown) {
    super(`Reasoning provider ${providerId} failed`, { cause })
    this.name = 'LLMProviderError'
  }
}
