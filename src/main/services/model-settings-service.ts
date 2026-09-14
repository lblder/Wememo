import { validateSaveModelSettings, type ModelSettingsStatus, type SaveModelSettingsResponse } from '../../shared/model-settings'
import { loadDeepSeekConfiguration, type DeepSeekConfigurationResult } from '../providers/deepseek-config'
import { ModelStorageError, type ModelConfigurationStore } from '../providers/model-configuration-store'

/** Cache secrets only in Main; saves are explicit, serialized and blocked during reasoning. */
export class ModelSettingsService {
  private saving = false
  private current: DeepSeekConfigurationResult
  private status: ModelSettingsStatus
  constructor(private readonly store: Pick<ModelConfigurationStore, 'load' | 'save' | 'available'>,
    env: Record<string, string | undefined>, private readonly reasoningBusy: () => boolean,
    private readonly apply: (value: DeepSeekConfigurationResult) => void) {
    this.current = loadDeepSeekConfiguration(env)
    this.status = { providerId: 'deepseek', baseUrl: this.current.configuration?.endpoint.replace(/\/chat\/completions$/, '') ?? 'https://api.deepseek.com',
      modelId: this.current.status.modelId, configured: this.current.status.configured,
      source: this.current.status.configured ? 'environment' : 'none', secureStorageAvailable: false }
  }
  get isSaving(): boolean { return this.saving }
  getStatus(): ModelSettingsStatus { return { ...this.status } }
  async initialize(): Promise<void> {
    this.status.secureStorageAvailable = await this.store.available()
    if (!this.current.status.configured) this.current.status.message = '请打开模型设置，保存 DeepSeek 配置后开始使用。'
    try {
      const saved = await this.store.load()
      if (saved) {
        this.current = { configuration: saved, status: { providerId: 'deepseek', modelId: saved.modelId, configured: true, message: '已使用本机加密保存的模型配置。' } }
        this.status = { ...this.status, modelId: saved.modelId, baseUrl: saved.endpoint.replace(/\/chat\/completions$/, ''), configured: true, source: 'stored' }
      }
    } catch (error) {
      const code = error instanceof ModelStorageError ? error.code : 'storage-failed'
      this.status = { ...this.status, configured: false, source: 'stored', error: code }
      this.current = { status: { ...this.current.status, configured: false, message: '本机模型配置暂不可用，请检查模型设置。' } }
    }
    this.apply(this.current)
  }
  async save(value: unknown): Promise<SaveModelSettingsResponse> {
    let request
    try { request = validateSaveModelSettings(value) } catch { return { ok: false, error: { code: 'invalid-request' } } }
    if (this.saving || this.reasoningBusy()) return { ok: false, error: { code: 'busy' } }
    const apiKey = request.apiKey ?? this.current.configuration?.apiKey
    if (!apiKey) return { ok: false, error: { code: 'missing-key' } }
    this.saving = true
    try {
      const configuration = { apiKey, modelId: request.modelId, endpoint: `${request.baseUrl}/chat/completions` }
      await this.store.save(configuration)
      this.current = { configuration, status: { providerId: 'deepseek', modelId: request.modelId, configured: true, message: '已使用本机加密保存的模型配置。' } }
      this.status = { providerId: 'deepseek', baseUrl: request.baseUrl, modelId: request.modelId, configured: true, source: 'stored', secureStorageAvailable: true }
      this.apply(this.current)
      return { ok: true, status: this.getStatus() }
    } catch (error) { return { ok: false, error: { code: error instanceof ModelStorageError ? error.code : 'storage-failed' } } }
    finally { this.saving = false }
  }
}
