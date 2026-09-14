import { describe, expect, it, vi } from 'vitest'
import { registerModelSettingsIpc } from './model-settings-ipc'
import { DESKTOP_CHANNELS } from '../../shared/desktop-api'
describe('model settings IPC ownership', () => {
  it('requires a trusted main frame and exact argument count, with write-only secret input', async () => {
    const handlers = new Map<string, (event: number, ...args: unknown[]) => unknown>()
    const status = { providerId: 'deepseek' as const, modelId: 'deepseek-flash', baseUrl: 'https://api.deepseek.com', configured: true, source: 'stored' as const, secureStorageAvailable: true }
    const service = { getStatus: vi.fn(() => status), save: vi.fn(async () => ({ ok: true as const, status })) }
    registerModelSettingsIpc({ handle: (channel, fn) => handlers.set(channel, fn) }, service, event => event === 1)
    const get = handlers.get(DESKTOP_CHANNELS.modelSettingsStatus)!
    const save = handlers.get(DESKTOP_CHANNELS.saveModelSettings)!
    expect(() => get(2)).toThrow('rejected'); expect(() => get(1, 'extra')).toThrow('rejected')
    for (const args of [[], [{ apiKey: 'PRIVATE' }, 'extra']]) expect(save(1, ...args)).toMatchObject({ error: { code: 'invalid-request' } })
    expect(save(2, { apiKey: 'PRIVATE' })).toMatchObject({ error: { code: 'invalid-request' } })
    expect(service.save).not.toHaveBeenCalled()
    expect(await save(1, { apiKey: 'PRIVATE' })).toEqual({ ok: true, status })
    expect(get(1)).toEqual(status)
    expect([...handlers.keys()]).toHaveLength(2)
  })
})
