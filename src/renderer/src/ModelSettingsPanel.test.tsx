import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModelSettingsForm } from './ModelSettingsPanel'
import { ModelSettingsController } from './model-settings-controller'
import { ReasoningFailureDetail } from './ReasoningFailureDetail'
import type { ModelSettingsStatus, SaveModelSettingsResponse } from '../../shared/model-settings'
import { REASONING_DIAGNOSTICS } from '../../shared/reasoning-diagnostic'

const status: ModelSettingsStatus = { providerId: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-flash', configured: true, source: 'environment', secureStorageAvailable: true }
describe('model settings display and lifecycle', () => {
  it('uses a write-only password field and explains explicit environment migration', () => {
    const html = renderToStaticMarkup(<ModelSettingsForm state={{ phase: 'ready', status }} onSave={async () => {}} />)
    expect(html).toContain('type="password"'); expect(html).toMatch(/autocomplete="new-password"/i)
    expect(html).toContain('留空保留当前密钥'); expect(html).toContain('原环境文件由你自行管理')
    expect(html).not.toContain('localStorage'); expect(html).not.toContain('textarea')
  })
  it('disables saving when secure storage is unavailable', () => {
    const html = renderToStaticMarkup(<ModelSettingsForm state={{ phase: 'ready', status: { ...status, secureStorageAvailable: false } }} onSave={async () => {}} />)
    expect(html).toContain('<fieldset disabled=""'); expect(html).toContain('暂时无法保存密钥')
  })
  it('prevents duplicate submissions without retaining submitted keys in snapshots', async () => {
    let finish!: (value: SaveModelSettingsResponse) => void
    const api = { getModelSettings: vi.fn(async () => status), saveModelSettings: vi.fn(() => new Promise<SaveModelSettingsResponse>(resolve => { finish = resolve })) }
    const controller = new ModelSettingsController(api); await controller.load()
    const input = { baseUrl: status.baseUrl, modelId: status.modelId, apiKey: 'PRIVATE_KEY' }
    const first = controller.save(input)
    expect(await controller.save(input)).toBe(false)
    expect(api.saveModelSettings).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('PRIVATE')
    finish({ ok: true, status: { ...status, source: 'stored' } })
    expect(await first).toBe(true); expect(controller.getSnapshot().phase).toBe('saved')
  })
  it('does not echo rejected IPC errors and suppresses success after unmount', async () => {
    const api = { getModelSettings: async () => status, saveModelSettings: vi.fn().mockRejectedValue(new Error('PRIVATE_KEY')) }
    const controller = new ModelSettingsController(api); await controller.load()
    expect(await controller.save({ baseUrl: status.baseUrl, modelId: status.modelId })).toBe(false)
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('PRIVATE')
    let finish!: (value: SaveModelSettingsResponse) => void
    api.saveModelSettings.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const next = controller.save({ baseUrl: status.baseUrl, modelId: status.modelId })
    controller.dispose(); finish({ ok: true, status }); expect(await next).toBe(false)
  })
  it.each(Object.keys(REASONING_DIAGNOSTICS) as (keyof typeof REASONING_DIAGNOSTICS)[])('renders a specific explanation for %s without an answer', kind => {
    const html = renderToStaticMarkup(<ReasoningFailureDetail diagnostic={{ kind }} />)
    expect(html).toContain(REASONING_DIAGNOSTICS[kind][0]); expect(html).toContain(REASONING_DIAGNOSTICS[kind][1])
    expect(html).not.toContain('已验证的互动解释')
  })
})
