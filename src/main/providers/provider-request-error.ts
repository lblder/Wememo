/** Safe codes only; never include response bodies, prompts, headers or API keys. */
export class ProviderRequestError extends Error {
  constructor(readonly code: 'authentication' | 'rate-limited' | 'timeout' | 'provider-unavailable' | 'invalid-output') {
    super(code)
    this.name = 'ProviderRequestError'
  }
}
