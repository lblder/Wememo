import { validateGenerateReasoningRequest, type GeneratedReasoning, type GenerateReasoningRequest } from './reasoning-ipc'

export interface EvidenceQuestionRequest extends GenerateReasoningRequest { question: string }
export interface EvidenceQuestionStats { modelCalls: number; toolCalls: number; deliveredCount: number; elapsedMs: number }
export type EvidenceQuestionFailurePhase = 'invalid-model-output' | 'invalid-citation' | 'provider-error' | 'timeout' | 'budget-exceeded' | 'cancelled' | 'request-error'

/** Fixed local copy only. Never render arbitrary provider error messages. */
export const EVIDENCE_QUESTION_ERRORS = {
  'invalid-request': ['request-error', '问题格式无效', '请填写 1–1000 字的问题，并选择有效会话和 1–31 天范围。'],
  'not-configured': ['provider-error', '模型尚未配置', '请在 Main 启动环境中配置模型后重启应用。'],
  busy: ['request-error', '已有追问正在运行', '请等待当前追问结束后再发起。'],
  'no-data': ['request-error', '所选时期没有数据', '请选择有聊天数据的会话或扩大天数。'],
  'invalid-context': ['request-error', '本地分析数据无效', '请重新分析当前会话。'],
  'invalid-output': ['invalid-model-output', '模型输出结构无效', '答案未通过 JSON 或字段校验，已拒绝显示。可缩小问题后重新发起。'],
  'unknown-tool': ['invalid-model-output', '模型请求了未授权工具', '本次工具请求已拒绝，未生成答案。'],
  'invalid-tool-arguments': ['invalid-model-output', '模型工具参数无效', '本次工具请求已拒绝，未生成答案。'],
  'duplicate-tool-call': ['invalid-model-output', '模型重复了工具调用', '重复请求已拒绝，未生成答案。'],
  'invalid-alias': ['invalid-citation', '模型请求的证据无效', '证据不属于本次可读目录，已拒绝读取。'],
  'invalid-citation': ['invalid-citation', '证据引用校验失败', '引用超出已读取证据范围或方向不符，已拒绝显示。'],
  authentication: ['provider-error', '模型认证失败', '请检查本地密钥和服务账户。'],
  'rate-limited': ['provider-error', '模型服务限流', '请稍后手动重新发起。'],
  'provider-unavailable': ['provider-error', '模型服务响应异常', '请检查网络或稍后重新发起。'],
  timeout: ['timeout', '追问超时', '本次等待已结束，可以缩小问题后重新发起。'],
  'budget-exceeded': ['budget-exceeded', '已达到本次追问上限', '本次取证已停止，请聚焦一个更小的问题。'],
  cancelled: ['cancelled', '追问已取消', '后续返回的答案不会显示。已发送的请求仍可能计费。'],
  internal: ['request-error', '追问执行异常', '请重新选择会话后再试。']
} as const satisfies Record<string, readonly [EvidenceQuestionFailurePhase, string, string]>
export type EvidenceQuestionErrorCode = keyof typeof EVIDENCE_QUESTION_ERRORS
export type EvidenceQuestionResponse =
  | { ok: true; value: GeneratedReasoning; stats: EvidenceQuestionStats }
  | { ok: false; error: { code: EvidenceQuestionErrorCode }; stats?: EvidenceQuestionStats }

export function validateEvidenceQuestionRequest(value: unknown): EvidenceQuestionRequest {
  const reject = (): never => { throw new Error('invalid-request') }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) reject()
  const data = value as Record<string, unknown>
  const fields = ['accountId', 'conversationId', 'days', 'question']
  const keys = Reflect.ownKeys(data)
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) reject()
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) reject()
  }
  if (typeof data.question !== 'string' || !data.question.trim() || Array.from(data.question).length > 1000) reject()
  const scope = validateGenerateReasoningRequest({ accountId: data.accountId, conversationId: data.conversationId, days: data.days })
  return { ...scope, question: (data.question as string).trim() }
}
