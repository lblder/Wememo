export const ANALYSIS_POLICY_VERSION = 'wememo-analysis-policy-v1'

/** v1 is fixed, not a promise of support for arbitrary runtime configuration. */
export interface AnalysisPolicy {
  readonly version: typeof ANALYSIS_POLICY_VERSION
  readonly sessionGapMs: number
  readonly semanticScope: {
    readonly window: 'recent'
    readonly directions: readonly ['incoming']
  }
  readonly minimumMessagesPerPeriod: number
}

export const DEFAULT_ANALYSIS_POLICY: AnalysisPolicy = Object.freeze({
  version: ANALYSIS_POLICY_VERSION,
  sessionGapMs: 30 * 60 * 1000,
  semanticScope: Object.freeze({
    window: 'recent',
    directions: Object.freeze(['incoming'] as const)
  }),
  minimumMessagesPerPeriod: 5
})
