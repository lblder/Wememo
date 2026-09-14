import { DESKTOP_CHANNELS } from '../../shared/desktop-api'
import type { ModelSettingsService } from './model-settings-service'

export function registerModelSettingsIpc<Event>(
  ipc: { handle(channel: string, listener: (event: Event, ...args: unknown[]) => unknown): void },
  service: Pick<ModelSettingsService, 'getStatus' | 'save'>,
  trusted: (event: Event) => boolean
): void {
  const allowed = (event: Event): boolean => { try { return trusted(event) } catch { return false } }
  ipc.handle(DESKTOP_CHANNELS.modelSettingsStatus, (event, ...args) => {
    if (!allowed(event) || args.length) throw new Error('Model settings status rejected')
    return service.getStatus()
  })
  ipc.handle(DESKTOP_CHANNELS.saveModelSettings, (event, ...args) => {
    if (!allowed(event) || args.length !== 1) return { ok: false, error: { code: 'invalid-request' } }
    return service.save(args[0])
  })
}
