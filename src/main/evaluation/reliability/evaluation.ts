import { createHash, randomUUID } from 'node:crypto'
import type { AnalysisContextPack } from '../../../shared/analysis-context'
import { AnalysisContextValidationError, validateAnalysisContextPack } from '../../../shared/analysis-context-validation'
import { AGENT_POLICY, charCount, freezeJson } from '../../evidence-agent/agent-policy'
import { BoundedAgentRunner } from '../../evidence-agent/bounded-agent-runner'
import { boundedOperation } from '../../evidence-agent/bounded-operation'
import { AgentRunError } from '../../evidence-agent/agent-errors'
import { InteractionReasoningValidationError } from '../../../shared/interaction-reasoning-validation'
import { ReasoningOutputParseError } from '../../reasoning/reasoning-output-parser'
import { EvidenceCitationValidationError } from '../../reasoning/evidence-citation-validator'
import { createAgentEvidenceProjection, redactIdentifiers } from '../../evidence-agent/agent-evidence-projection'
import { validateToolCallingResponse, type ToolCallingRequest } from '../../evidence-agent/tool-calling-provider'
import { InteractionReasoner } from '../../reasoning/interaction-reasoner'
import { LLMProviderError } from '../../reasoning/llm-provider'
import { ProviderRequestError } from '../../providers/provider-request-error'
import { DeepSeekToolProtocolError } from '../../providers/deepseek-tool-calling-provider'
import { directQuestionRequest, type EvaluationProviders } from '../evidence-question-evaluation'
import { reliabilitySchedule } from './schedule'
import { type EvaluationSet, type ReliabilityCase, type FixtureVariant, type ReadTarget } from './cases'
import { variantPrompt, type PromptVariant } from './prompts'
import { auditOutput, unattemptedAudit, type Check, type OutputAudit, type VisibleEvidence, type ReliabilityFailure } from './output-audit'

export type ReliabilityMode = 'direct' | 'agent'
export interface ReliabilityRun {
  runId: string; questionId: string; set: EvaluationSet; fixture: FixtureVariant; repeatIndex: number
  mode: ReliabilityMode; providerId: string; modelId: string; promptVariant: PromptVariant
  providerPass: Check; providerResponses: number; jsonPass: Check; schemaPass: Check
  citationScopePass: Check; citationDirectionPass: Check; endToEndPass: boolean
  failureCode: ReliabilityFailure | null; failureCodes: ReliabilityFailure[]; runtimeFailureCode: string | null
  modelCalls: number; runtimeModelCalls: number; toolCalls: number; toolProposals: number; evidenceReadCalls: number
  catalogCount: number; deliveredCount: number; readTargets: { available: boolean; delivered: boolean }[]; evidenceReadPass: Check
  failurePhase: 'tool-selection' | 'tool-arguments' | 'final-schema' | 'final-citation' | 'provider' | 'budget' | 'cancelled' | 'local' | null
  latencyMs: number; promptHashes: string[]; reviewId: string | null
}
export interface ReviewItem {
  reviewId: string; question: string; result: NonNullable<OutputAudit['result']>
  evidence: VisibleEvidence[]; coverage: AnalysisContextPack['coverage']
  scores: { groundedness: null; relevance: null; counterAwareness: null; uncertainty: null }; reviewer: null; notes: string
}
export type ProviderFactory = (signal: AbortSignal) => EvaluationProviders
export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const matches = (evidence: ReadTarget, target: ReadTarget): boolean => (Object.keys(target) as (keyof ReadTarget)[]).every(key => evidence[key] === target[key])
function mapError(error: unknown): { code: ReliabilityFailure; runtime: string } {
  if (error instanceof LLMProviderError) return mapError(error.cause)
  if (error instanceof ReasoningOutputParseError || error instanceof InteractionReasoningValidationError) return { code: 'invalid_schema', runtime: 'invalid-output' }
  if (error instanceof EvidenceCitationValidationError) return { code: 'runtime_rejection', runtime: 'invalid-citation' }
  if (error instanceof AnalysisContextValidationError) return { code: 'invalid_context', runtime: 'invalid-context' }
  const runtime = error instanceof AgentRunError || error instanceof ProviderRequestError ? error.code : 'internal'
  const mapped: Record<string, ReliabilityFailure> = { timeout: 'timeout', cancelled: 'cancelled', 'budget-exceeded': 'budget_exceeded',
    'no-data': 'no_data', 'invalid-context': 'invalid_context', 'unknown-tool': 'unknown_tool', 'invalid-tool-arguments': 'tool_argument_failure',
    'duplicate-tool-call': 'duplicate_tool_call', 'invalid-alias': 'invalid_tool_alias', authentication: 'provider_error',
    'rate-limited': 'provider_error', 'provider-unavailable': 'provider_error', 'invalid-output': 'invalid_provider_response' }
  return { code: mapped[runtime] ?? 'runtime_rejection', runtime }
}

export async function evaluateReliabilityRun(input: {
  testCase: ReliabilityCase; repeatIndex: number; mode: ReliabilityMode; variant: PromptVariant
  contextPack: AnalysisContextPack; providerId: string; modelId: string
}, factory: ProviderFactory, signal: AbortSignal = new AbortController().signal): Promise<{ record: ReliabilityRun; review?: ReviewItem }> {
  const { testCase, mode, variant } = input
  const start = performance.now()
  const record: ReliabilityRun = { runId: randomUUID(), questionId: testCase.id, set: testCase.set, fixture: testCase.fixture,
    repeatIndex: input.repeatIndex, mode, providerId: input.providerId, modelId: input.modelId, promptVariant: variant,
    providerPass: null, providerResponses: 0, jsonPass: null, schemaPass: null, citationScopePass: null, citationDirectionPass: null,
    endToEndPass: false, failureCode: null, failureCodes: [], runtimeFailureCode: null, modelCalls: 0, runtimeModelCalls: 0,
    toolCalls: 0, toolProposals: 0, evidenceReadCalls: 0, catalogCount: 0, deliveredCount: 0, readTargets: [], evidenceReadPass: null,
    failurePhase: null, latencyMs: 0, promptHashes: [], reviewId: null }
  let active = true; let audit = unattemptedAudit(); let runtimeOk = false
  let pack: AnalysisContextPack | undefined; let catalog: VisibleEvidence[] = []; const delivered = new Map<string, VisibleEvidence>()
  let effectiveBudgetRejected = false; let protocolRejected = false
  const alive = (inner: AbortSignal) => active && !signal.aborted && !inner.aborted
  const observeFinal = (text: string) => { audit = auditOutput(text, catalog, new Set(delivered.keys())) }
  const observeAgentInput = (request: ToolCallingRequest) => {
    const first = request.messages[0]
    if (first?.role !== 'user') throw new Error('Invalid evaluation input')
    catalog = JSON.parse(first.content).catalog
    // Only Main-produced tool messages that reach a provider attempt count as exposed content.
    for (const message of request.messages) if (message.role === 'tool' && message.name === 'read_evidence') {
      const payload = JSON.parse(message.content)
      for (const item of payload.result.evidence as VisibleEvidence[]) delivered.set(item.id, item)
    }
  }
  try {
    if (signal.aborted) throw new AgentRunError('cancelled')
    pack = freezeJson(structuredClone(validateAnalysisContextPack(input.contextPack)))
    if (!pack.coverage.analyzedMessageCount) throw new AgentRunError('no-data')
    const snapshot = pack
    await boundedOperation(async runSignal => {
      const providers = factory(runSignal)
      if (mode === 'direct') {
        await new InteractionReasoner({ id: providers.direct.id, async generate(original) {
          const questionRequest = directQuestionRequest(original, testCase.question, snapshot)
          const request = freezeJson({ ...questionRequest, systemPrompt: variantPrompt(questionRequest.systemPrompt, variant) })
          const payload = JSON.parse(request.userPrompt)
          catalog = payload.selectedEvidence
          for (const item of catalog) delivered.set(item.id, item)
          record.modelCalls++; record.runtimeModelCalls++
          record.promptHashes.push(sha256(JSON.stringify(request)))
          const response = await providers.direct.generate(request)
          if (alive(runSignal)) { record.providerResponses++; observeFinal(response.text) }
          return response
        } }).reason(snapshot)
        if (alive(runSignal)) runtimeOk = true
      } else {
        const response = await new BoundedAgentRunner({ id: providers.agent.id, async generate(original, options) {
          const request = freezeJson({ ...original, systemPrompt: variantPrompt(original.systemPrompt, variant) })
          if (charCount(JSON.stringify(request)) > AGENT_POLICY.maxRequestChars) {
            effectiveBudgetRejected = true; throw new AgentRunError('budget-exceeded')
          }
          observeAgentInput(request)
          record.modelCalls++; record.promptHashes.push(sha256(JSON.stringify(request)))
          let response
          try { response = await providers.agent.generate(request, options) }
          catch (error) { if (alive(runSignal) && error instanceof DeepSeekToolProtocolError) protocolRejected = true; throw error }
          if (alive(runSignal) && !options.signal.aborted) {
            record.providerResponses++
            const proposed = Object.getOwnPropertyDescriptor(response, 'calls')?.value
            if (Object.getOwnPropertyDescriptor(response, 'type')?.value === 'tool_calls' && Array.isArray(proposed)) record.toolProposals += proposed.length
            try {
              const checked = validateToolCallingResponse(response)
              if (checked.type === 'final') observeFinal(checked.text)
            } catch (error) { if (!(error instanceof AgentRunError && error.code === 'budget-exceeded')) protocolRejected = true }
          }
          return response
        } }).run({ contextPack: snapshot, question: testCase.question }, { signal: runSignal })
        if (!alive(runSignal)) return
        record.toolCalls = response.metadata.toolCalls; record.runtimeModelCalls = response.metadata.modelCalls
        record.evidenceReadCalls = response.metadata.trace.filter(event => event.phase === 'tool-complete' && event.toolName === 'read_evidence').length
        runtimeOk = response.ok
        if (!response.ok) {
          record.runtimeFailureCode = response.error.code
          record.failureCode = mapError(new AgentRunError(response.error.code)).code
        }
      }
    }, signal, AGENT_POLICY.runTimeoutMs)
  } catch (error) {
    const mapped = mapError(error); record.failureCode = mapped.code; record.runtimeFailureCode = mapped.runtime
  } finally { active = false }
  record.providerPass = record.modelCalls ? record.providerResponses === record.modelCalls : null
  for (const key of ['jsonPass', 'schemaPass', 'citationScopePass', 'citationDirectionPass'] as const) record[key] = audit[key]
  if (audit.failureCode && ['invalid-output', 'invalid-citation', 'internal'].includes(record.runtimeFailureCode ?? '')) record.failureCode = audit.failureCode
  if (effectiveBudgetRejected) record.failureCode = 'budget_exceeded'
  else if (protocolRejected) record.failureCode = 'invalid_provider_response'
  record.endToEndPass = runtimeOk && audit.citationDirectionPass === true
  if (runtimeOk && !record.endToEndPass) record.failureCode = 'observation_mismatch'
  if (record.endToEndPass) record.failureCode = null
  record.failureCodes = [...new Set([...(record.failureCode ? [record.failureCode] : []), ...audit.issues])]
  record.catalogCount = catalog.length; record.deliveredCount = delivered.size
  // The frozen projection is deterministic except for fixed-length UUID aliases.
  // An independent local projection supplies metric/category availability; it is never sent to the model.
  const available = mode === 'agent' && pack && record.modelCalls ? createAgentEvidenceProjection(pack).content : catalog
  record.readTargets = testCase.readTargets.map(target => ({
    available: available.some(item => matches(item, target)),
    delivered: [...delivered.values()].some(item => matches(item, target))
  }))
  record.evidenceReadPass = record.modelCalls && record.readTargets.length && record.readTargets.every(target => target.available)
    ? record.readTargets.every(target => target.delivered) : null
  const code = record.failureCode
  record.failurePhase = !code ? null : code === 'unknown_tool' ? 'tool-selection'
    : ['tool_argument_failure', 'duplicate_tool_call', 'invalid_tool_alias'].includes(code) ? 'tool-arguments'
    : ['invalid_json', 'missing_field', 'extra_field', 'invalid_confidence', 'invalid_schema'].includes(code) ? 'final-schema'
    : ['unknown_citation', 'undelivered_citation', 'finding_without_support', 'alternative_support_only', 'alternative_contains_support'].includes(code) ? 'final-citation'
    : ['provider_error', 'invalid_provider_response', 'timeout'].includes(code) ? 'provider'
    : code === 'budget_exceeded' ? 'budget' : code === 'cancelled' ? 'cancelled' : 'local'
  record.latencyMs = Math.max(0, Math.round(performance.now() - start))
  let review: ReviewItem | undefined
  if (record.endToEndPass && audit.result && pack) {
    record.reviewId = randomUUID()
    const publicIds = new Map([...delivered.keys()].map((id, index) => [id, `review-evidence-${index + 1}`]))
    const reviewedResult = structuredClone(audit.result)
    for (const item of [...reviewedResult.findings, ...reviewedResult.alternativeExplanations]) item.evidenceIds = item.evidenceIds.map(id => publicIds.get(id)!)
    review = JSON.parse(redactIdentifiers(JSON.stringify({ reviewId: record.reviewId, question: testCase.question,
      result: reviewedResult, evidence: [...delivered.values()].map(item => ({ ...item, id: publicIds.get(item.id)! })), coverage: pack.coverage,
      scores: { groundedness: null, relevance: null, counterAwareness: null, uncertainty: null }, reviewer: null, notes: '' }), pack))
  }
  return freezeJson({ record, ...(review ? { review } : {}) })
}
export function summarizeReliability(records: readonly ReliabilityRun[]) {
  const rate = (rows: readonly ReliabilityRun[], key: 'providerPass' | 'jsonPass' | 'schemaPass' | 'citationScopePass' | 'citationDirectionPass' | 'endToEndPass' | 'evidenceReadPass') => {
    const passed = rows.filter(row => row[key] === true).length; const total = rows.filter(row => row[key] !== null).length
    return { passed, total, rate: total ? passed / total : null }
  }
  const count = (values: (string | null)[]) => Object.fromEntries([...new Set(values.filter(value => value !== null))].map(value => [value, values.filter(item => item === value).length]))
  return Object.fromEntries((['normal', 'stress'] as const).map(set => [set, Object.fromEntries([...new Set(records.map(row => row.promptVariant))].map(variant => [variant,
    Object.fromEntries((['direct', 'agent'] as const).map(mode => {
      const rows = records.filter(row => row.set === set && row.promptVariant === variant && row.mode === mode)
      return [mode, { runs: rows.length, funnel: Object.fromEntries((['providerPass', 'jsonPass', 'schemaPass', 'citationScopePass', 'citationDirectionPass', 'endToEndPass'] as const).map(key => [key, rate(rows, key)])),
        providerTurns: { responses: rows.reduce((n, row) => n + row.providerResponses, 0), attempts: rows.reduce((n, row) => n + row.modelCalls, 0) },
        retrievalProxy: rate(rows, 'evidenceReadPass'),
        afterRetrievalMet: Object.fromEntries((['jsonPass', 'schemaPass', 'citationScopePass', 'citationDirectionPass', 'endToEndPass'] as const).map(key => [key, rate(rows.filter(row => row.evidenceReadPass === true), key)])),
        failures: count(rows.map(row => row.failureCode)), failurePhases: count(rows.map(row => row.failurePhase)),
        issueCounts: count(rows.flatMap(row => row.failureCodes)), modelCalls: rows.reduce((n, row) => n + row.modelCalls, 0),
        toolCalls: rows.reduce((n, row) => n + row.toolCalls, 0), meanLatencyMs: rows.length ? Math.round(rows.reduce((n, row) => n + row.latencyMs, 0) / rows.length) : null }]
    }))]))]))
}

export async function runReliabilityEvaluation(fixtures: Readonly<Record<FixtureVariant, AnalysisContextPack>>, factory: ProviderFactory,
  options: { variants?: readonly PromptVariant[]; sets?: readonly EvaluationSet[]; cases?: readonly ReliabilityCase[]; providerId: string; modelId: string;
    signal?: AbortSignal; canary?: boolean; onCanary?: (records: readonly ReliabilityRun[]) => boolean | Promise<boolean>;
    onRecord?: (record: ReliabilityRun, review?: ReviewItem) => void | Promise<void> }) {
  if (options.canary && !options.onCanary) throw new Error('Canary requires a review gate')
  const schedule = reliabilitySchedule(options)
  const snapshots = freezeJson(structuredClone(fixtures)); Object.values(snapshots).forEach(validateAnalysisContextPack)
  const records: ReliabilityRun[] = []; const reviews: ReviewItem[] = []
  let canaryStopped = false
  for (const { testCase, repeatIndex, mode, variant } of schedule) {
    if (options.signal?.aborted) break
    const { record, review } = await evaluateReliabilityRun({ testCase, repeatIndex, mode, variant, contextPack: snapshots[testCase.fixture],
      providerId: options.providerId, modelId: options.modelId }, factory, options.signal)
    records.push(record); if (review) reviews.push(review)
    await options.onRecord?.(record, review)
    if (options.canary && records.length === 8 && !options.signal?.aborted) {
      if (!await options.onCanary!(freezeJson([...records]))) { canaryStopped = true; break }
    }
  }
  return freezeJson({ version: 'wememo-real-model-reliability-v2', plannedRuns: schedule.length,
    completedRuns: records.length, interrupted: options.signal?.aborted ?? false, canaryStopped, qualityScoring: 'pending-human-review', records,
    // Review items carry no explicit mode/variant; sort independently of execution order.
    reviews: reviews.sort((a, b) => a.reviewId.localeCompare(b.reviewId)), summary: summarizeReliability(records) })
}
