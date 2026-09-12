const MESSAGES = {
  'invalid-request': '问题格式无效或超过长度限制。',
  'invalid-context': '分析快照未通过校验。',
  'no-data': '分析窗口内没有消息。',
  'unknown-tool': '请求了未授权工具。',
  'invalid-tool-arguments': '工具参数不符合契约。',
  'invalid-alias': '证据别名不属于本次可读目录。',
  'duplicate-tool-call': '工具调用 ID 重复。',
  'budget-exceeded': '任务已达到调用或上下文预算。',
  timeout: '任务或步骤超时。',
  cancelled: '任务已取消。',
  'rate-limited': '模型服务限流。',
  authentication: '模型认证失败。',
  'provider-unavailable': '模型服务不可用。',
  'invalid-output': '模型输出未通过结构校验。',
  'invalid-citation': '模型引用未通过交付范围或方向校验。',
  internal: '任务执行失败。'
} as const

export type AgentErrorCode = keyof typeof MESSAGES
export class AgentRunError extends Error {
  constructor(readonly code: AgentErrorCode) { super(MESSAGES[code]); this.name = 'AgentRunError' }
}
export const agentFailure = (code: AgentErrorCode): { code: AgentErrorCode; message: string } => ({ code, message: MESSAGES[code] })

/** Validate descriptors before reading values from an untrusted adapter object. */
export function exactObject(value: unknown, keys: readonly string[], code: AgentErrorCode): Record<string, unknown> {
  const reject = (): never => { throw new AgentRunError(code) }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) reject()
  const ownKeys = Reflect.ownKeys(value as object)
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))) reject()
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) reject()
  }
  return value as Record<string, unknown>
}

export function denseArray(value: unknown, maximum: number, code: AgentErrorCode): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) throw new AgentRunError(code)
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new AgentRunError(code)
  }
  return value
}
