import { describe, expect, it, vi } from 'vitest'
import { ModelSettingsService } from './model-settings-service'
import { ModelStorageError } from '../providers/model-configuration-store'
import type { DeepSeekConfiguration } from '../providers/deepseek-config'

const input = { baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-flash' }
const config = { endpoint: input.baseUrl + '/chat/completions', modelId: input.modelId, apiKey: 'SYNTHETIC_STORED_KEY' }
function setup(environment = { DEEPSEEK_API_KEY: 'SYNTHETIC_ENV_KEY' }) {
  const store = { load: vi.fn(async (): Promise<DeepSeekConfiguration | undefined> => undefined), save: vi.fn(async (_value: DeepSeekConfiguration) => {}), available: vi.fn(async () => true) }
  const apply = vi.fn(); const busy = vi.fn(() => false)
  return { store, apply, busy, service: new ModelSettingsService(store, environment, busy, apply) }
}
describe('model settings lifecycle', () => {
  it('keeps environment compatibility until an explicit save, then reuses that key without returning it', async () => {
    const { store, service, apply } = setup(); await service.initialize()
    expect(service.getStatus()).toMatchObject({ configured: true, source: 'environment' })
    expect(store.save).not.toHaveBeenCalled()
    expect(await service.save(input)).toMatchObject({ ok: true, status: { source: 'stored' } })
    expect(store.save).toHaveBeenCalledWith({ ...config, apiKey: 'SYNTHETIC_ENV_KEY' })
    expect(apply).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(service.getStatus())).not.toContain('KEY')
  })
  it('prefers stored configuration and fails closed on a corrupt store rather than switching provider credentials', async () => {
    const { store, service, apply } = setup(); store.load.mockResolvedValue(config)
    await service.initialize(); expect(apply.mock.calls[0][0].configuration.apiKey).toBe(config.apiKey)
    const failed = setup(); failed.store.load.mockRejectedValue(new Error('PRIVATE_DISK_ERROR'))
    await failed.service.initialize()
    expect(failed.service.getStatus()).toMatchObject({ configured: false, source: 'stored', error: 'storage-failed' })
    expect(failed.apply.mock.calls[0][0]).not.toHaveProperty('configuration')
    expect(JSON.stringify(failed.service.getStatus())).not.toContain('PRIVATE')
  })
  it('rejects injected settings and missing keys before writing or applying', async () => {
    const { service, store, apply } = setup({ DEEPSEEK_API_KEY: '' }); await service.initialize()
    expect(await service.save({ ...input, prompt: 'PRIVATE' })).toMatchObject({ error: { code: 'invalid-request' } })
    expect(await service.save(input)).toMatchObject({ error: { code: 'missing-key' } })
    expect(store.save).not.toHaveBeenCalled(); expect(apply).toHaveBeenCalledTimes(1)
  })
  it('serializes saves and blocks changing configuration during active reasoning', async () => {
    const { service, store, busy } = setup(); await service.initialize()
    busy.mockReturnValue(true)
    expect(await service.save(input)).toMatchObject({ error: { code: 'busy' } }); expect(store.save).not.toHaveBeenCalled()
    busy.mockReturnValue(false)
    let finish!: () => void
    store.save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = service.save(input)
    expect(service.isSaving).toBe(true)
    expect(await service.save(input)).toMatchObject({ error: { code: 'busy' } })
    finish(); expect(await pending).toMatchObject({ ok: true }); expect(service.isSaving).toBe(false)
  })
  it('keeps the live provider and previous status when persistence fails', async () => {
    const { service, store, apply } = setup(); await service.initialize()
    const before = service.getStatus()
    store.save.mockRejectedValue(new ModelStorageError('storage-unavailable'))
    expect(await service.save({ ...input, apiKey: 'PRIVATE_REPLACEMENT' })).toEqual({ ok: false, error: { code: 'storage-unavailable' } })
    expect(service.getStatus()).toEqual(before); expect(apply).toHaveBeenCalledTimes(1); expect(service.isSaving).toBe(false)
  })
})
