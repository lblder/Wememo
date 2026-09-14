import type { DesktopApi } from '../../shared/desktop-api'
import type { ModelSettingsErrorCode, ModelSettingsStatus, SaveModelSettingsRequest } from '../../shared/model-settings'

export interface ModelSettingsState { phase: 'loading' | 'ready' | 'saving' | 'saved' | 'error'; status?: ModelSettingsStatus; error?: ModelSettingsErrorCode }
export class ModelSettingsController {
  private state: ModelSettingsState = { phase: 'loading' }
  private sequence = 0
  private listeners = new Set<() => void>()
  constructor(private readonly api: Pick<DesktopApi, 'getModelSettings' | 'saveModelSettings'>) {}
  getSnapshot = (): ModelSettingsState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private update(state: ModelSettingsState): void { this.state = state; this.listeners.forEach(listener => listener()) }
  async load(): Promise<void> {
    const sequence = ++this.sequence
    try {
      const status = await this.api.getModelSettings()
      if (sequence === this.sequence) this.update({ phase: 'ready', status })
    } catch { if (sequence === this.sequence) this.update({ phase: 'error', error: 'storage-failed' }) }
  }
  async save(request: SaveModelSettingsRequest): Promise<boolean> {
    if (this.state.phase === 'saving' || this.state.phase === 'loading') return false
    const sequence = ++this.sequence
    this.update({ phase: 'saving', status: this.state.status })
    try {
      const response = await this.api.saveModelSettings(request)
      if (sequence !== this.sequence) return false
      if (response.ok) { this.update({ phase: 'saved', status: response.status }); return true }
      this.update({ phase: 'error', status: this.state.status, error: response.error.code })
    } catch { if (sequence === this.sequence) this.update({ phase: 'error', status: this.state.status, error: 'storage-failed' }) }
    return false
  }
  dispose(): void { this.sequence++; this.listeners.clear() }
}
