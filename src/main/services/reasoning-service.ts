import { AnalysisContextValidationError } from '../../shared/analysis-context-validation'
import { InteractionReasoningValidationError } from '../../shared/interaction-reasoning-validation'
import {
  validateGenerateReasoningRequest, ReasoningRequestValidationError,
  type GenerateReasoningResponse, type ReasoningErrorCode, type ReasoningProviderStatus
} from '../../shared/reasoning-ipc'
import type { InteractionAnalysisService } from '../analytics/interaction-analysis-service'
import { InteractionReasoner } from '../reasoning/interaction-reasoner'
import { LLMProviderError, type LLMProvider } from '../reasoning/llm-provider'
import { ReasoningOutputParseError } from '../reasoning/reasoning-output-parser'
import { EvidenceCitationValidationError } from '../reasoning/evidence-citation-validator'
import { ProviderRequestError } from '../providers/provider-request-error'
import { describeExactKeyFailure } from './reasoning-output-diagnostic'
import { diagnoseReasoningFailure } from '../diagnostics/reasoning-failure-diagnostic'
import type { ReasoningDiagnostic } from '../../shared/reasoning-diagnostic'

const ERROR_MESSAGES: Record<ReasoningErrorCode, string> = {
  'invalid-request': '请求格式不正确，请重新选择会话。',
  'not-configured': '尚未配置模型密钥，请打开模型设置完成配置。',
  busy: '已有解释正在生成，请等待完成。',
  'no-data': '所选时期没有消息，请选择有数据的会话。',
  authentication: '模型认证失败，请检查密钥及账户状态。',
  'rate-limited': '模型服务限流或额度不足，请稍后再试。',
  timeout: '模型请求超时，请稍后重试。',
  'provider-unavailable': '模型服务连接失败，请检查网络后重试。',
  'invalid-context': '本地分析数据校验失败，未生成解释。',
  'invalid-output': '模型输出不符合结构要求，已拒绝显示。',
  'invalid-citation': '模型引用未通过证据校验，已拒绝显示。',
  internal: '生成解释失败，请重新分析后再试。'
}

/** Application orchestration only. Renderer never supplies provider configuration. */
export class ReasoningService {
  private busy = false

  constructor(
    private readonly analysis: Pick<InteractionAnalysisService, 'analyzePeriod'>,
    private readonly provider: LLMProvider | undefined,
    private readonly providerInfo: ReasoningProviderStatus
  ) {}

  getStatus(): ReasoningProviderStatus {
    return { ...this.providerInfo }
  }
  get isBusy(): boolean { return this.busy }

  async generate(value: unknown): Promise<GenerateReasoningResponse> {
    let diagnostic: ReasoningDiagnostic | undefined
    const failure = (code: ReasoningErrorCode, detail?: string): GenerateReasoningResponse => ({ ok: false, error: { code, message: ERROR_MESSAGES[code] + (detail ? `（${detail}）` : ''), ...(diagnostic ? { diagnostic } : {}) } })
    let request
    try { request = validateGenerateReasoningRequest(value) } catch { return failure('invalid-request') }
    if (this.busy) return failure('busy')
    if (!this.provider) return failure('not-configured')
    this.busy = true
    let receivedText: string | undefined
    try {
      const { contextPack } = this.analysis.analyzePeriod(request)
      if (contextPack.coverage.analyzedMessageCount === 0) return failure('no-data')
      const provider = this.provider
      const result = await new InteractionReasoner({
        id: provider.id,
        async generate(request) {
          const response = await provider.generate(request)
          receivedText = response.text
          return response
        }
      }).reason(contextPack)
      return {
        ok: true,
        value: { result, contextPack, providerId: this.providerInfo.providerId, modelId: this.providerInfo.modelId }
      }
    } catch (error) {
      diagnostic = diagnoseReasoningFailure(error, receivedText)
      if (error instanceof ReasoningRequestValidationError) return failure('invalid-request')
      if (error instanceof AnalysisContextValidationError) return failure('invalid-context')
      if (error instanceof ReasoningOutputParseError) return failure('invalid-output', 'JSON 解析失败：需要单个 JSON 对象，不能包含代码围栏或额外文字')
      if (error instanceof InteractionReasoningValidationError) {
        // Only locally defined paths/reasons cross IPC; never include model values or keys.
        const match = /^(result|version|summary|findings(?:\[\d{1,6}\])?(?:\.(?:id|claim|evidenceIds|confidence))?(?:\[\d{1,6}\])?|alternativeExplanations(?:\[\d{1,6}\])?(?:\.(?:id|explanation|evidenceIds))?(?:\[\d{1,6}\])?|uncertainties(?:\[\d{1,6}\])?): (expected plain JSON object|expected exact keys|expected JSON data properties|expected non-empty string|expected array|expected dense JSON array|expected JSON array values|at least one citation is required|duplicate evidence ID|duplicate ID|unsupported version|expected low, medium or high|at least one uncertainty is required)$/.exec(error.message)
        const keyDetail = describeExactKeyFailure(receivedText, error.message)
        return failure('invalid-output', match ? `字段校验：${match[1]} — ${match[2]}${keyDetail ? `；${keyDetail}` : ''}` : '字段校验失败')
      }
      if (error instanceof EvidenceCitationValidationError) return failure('invalid-citation')
      if (error instanceof LLMProviderError) {
        if (error.cause instanceof ProviderRequestError && error.cause.code === 'invalid-output') {
          diagnostic = { kind: 'invalid-provider-response' }
          return failure('invalid-output', '接口响应校验失败：响应为空、截断、包含工具调用或格式异常')
        }
        return failure(error.cause instanceof ProviderRequestError ? error.cause.code : 'provider-unavailable')
      }
      return failure('internal')
    } finally {
      receivedText = undefined
      this.busy = false
    }
  }
}
