export const MODEL_SETTINGS_ERRORS = {
  'invalid-request': '模型配置格式无效，请使用 DeepSeek 官方地址和有效模型 ID。',
  'missing-key': '请填写 API Key。',
  'storage-unavailable': '系统安全存储不可用，无法保存密钥。',
  'storage-failed': '本机模型配置无法读取或保存，请检查系统安全存储后重试。',
  busy: '模型任务或配置保存正在进行，请结束后再修改。'
} as const
export type ModelSettingsErrorCode = keyof typeof MODEL_SETTINGS_ERRORS
export interface ModelSettingsStatus {
  providerId: 'deepseek'
  baseUrl: string
  modelId: string
  configured: boolean
  source: 'stored' | 'environment' | 'none'
  secureStorageAvailable: boolean
  error?: ModelSettingsErrorCode
}
/** Credentials are write-only. No API returns the key, its prefix or ciphertext. */
export interface SaveModelSettingsRequest { baseUrl: string; modelId: string; apiKey?: string }
export type SaveModelSettingsResponse =
  | { ok: true; status: ModelSettingsStatus }
  | { ok: false; error: { code: ModelSettingsErrorCode } }

export function validateSaveModelSettings(value: unknown): SaveModelSettingsRequest {
  const reject = (): never => { throw new Error('invalid-request') }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) reject()
  const data = value as Record<string, unknown>
  const keys = Reflect.ownKeys(data)
  if (keys.length < 2 || keys.length > 3 || keys.some(key => typeof key !== 'string' || !['baseUrl', 'modelId', 'apiKey'].includes(key))) reject()
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) reject()
  }
  if (typeof data.baseUrl !== 'string' || !['https://api.deepseek.com', 'https://api.deepseek.com/', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/v1/'].includes(data.baseUrl)) reject()
  if (typeof data.modelId !== 'string' || !/^deepseek-[a-z0-9.-]{1,80}$/.test(data.modelId)) reject()
  if (Object.hasOwn(data, 'apiKey') && (typeof data.apiKey !== 'string' || data.apiKey.length > 4096 || /[\u0000-\u001f\u007f]/.test(data.apiKey))) reject()
  return { baseUrl: (data.baseUrl as string).replace(/\/$/, ''), modelId: data.modelId as string,
    ...(typeof data.apiKey === 'string' && data.apiKey.trim() ? { apiKey: data.apiKey.trim() } : {}) }
}
