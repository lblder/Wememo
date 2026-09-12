import type { AnalysisContextPack } from '../../shared/analysis-context'
import { validateAnalysisContextPack } from '../../shared/analysis-context-validation'
import type { InteractionReasoningResult } from '../../shared/interaction-reasoning'
import { LLMProviderError, type LLMProvider, type LLMProviderResponse } from './llm-provider'
import { buildReasoningPrompt } from './reasoning-prompt-builder'
import { parseInteractionReasoningOutput } from './reasoning-output-parser'
import { validateReasoningCitations } from './evidence-citation-validator'

export class InteractionReasoner {
  constructor(private readonly provider: LLMProvider) {}

  async reason(contextPack: AnalysisContextPack): Promise<InteractionReasoningResult> {
    validateAnalysisContextPack(contextPack)
    // Snapshot before await: caller changes while a provider runs cannot change
    // which evidence and directions were actually sent and later validated.
    const snapshot = JSON.parse(JSON.stringify(contextPack)) as AnalysisContextPack
    const prompt = buildReasoningPrompt(snapshot)
    let response: LLMProviderResponse
    try {
      response = await this.provider.generate({
        systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, responseFormat: 'json'
      })
    } catch (cause) {
      throw new LLMProviderError(this.provider.id, cause)
    }
    const result = parseInteractionReasoningOutput(response?.text)
    return validateReasoningCitations(result, snapshot, prompt.allowedEvidenceIds, prompt.evidenceIdBindings)
  }
}
