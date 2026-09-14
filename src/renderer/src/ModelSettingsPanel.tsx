import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MODEL_SETTINGS_ERRORS, type SaveModelSettingsRequest } from '../../shared/model-settings'
import { ModelSettingsController, type ModelSettingsState } from './model-settings-controller'

const sourceLabels = { stored: '本机加密配置', environment: '启动环境', none: '尚未配置' }
export function ModelSettingsForm({ state, onSave }: { state: ModelSettingsState; onSave: (request: SaveModelSettingsRequest) => Promise<void> }): React.JSX.Element {
  const keyInput = useRef<HTMLInputElement>(null)
  const busy = state.phase === 'loading' || state.phase === 'saving'
  const error = state.error ?? state.status?.error
  async function submit(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const request = { baseUrl: String(data.get('baseUrl') ?? ''), modelId: String(data.get('modelId') ?? '').trim(), apiKey: String(data.get('apiKey') ?? '') }
    if (keyInput.current) keyInput.current.value = ''
    await onSave(request)
  }
  return <form className="model-settings-form" onSubmit={event => void submit(event)}>
    <p>DeepSeek · 当前来源：{state.status ? sourceLabels[state.status.source] : '正在读取'}</p>
    <fieldset disabled={busy || !state.status?.secureStorageAvailable}>
      <label>服务地址<select name="baseUrl" defaultValue={state.status?.baseUrl ?? 'https://api.deepseek.com'}>
        <option value="https://api.deepseek.com">https://api.deepseek.com</option>
        <option value="https://api.deepseek.com/v1">https://api.deepseek.com/v1</option>
      </select></label>
      <label>模型 ID<input name="modelId" defaultValue={state.status?.modelId ?? 'deepseek-flash'} maxLength={89} required spellCheck={false} /></label>
      <label>API Key<input ref={keyInput} type="password" name="apiKey" autoComplete="new-password" maxLength={4096}
        placeholder={state.status?.configured ? '留空保留当前密钥' : '输入 DeepSeek API Key'} /></label>
      <button type="submit">{state.phase === 'saving' ? '正在加密保存…' : '保存到本机并启用'}</button>
    </fieldset>
    <p className="reasoning-meta">密钥由系统安全存储加密，保存后立即生效。保存只更新本机配置，不调用模型。</p>
    {state.status?.source === 'environment' ? <p className="reasoning-meta">留空保存可将当前启动密钥转存为加密配置；原环境文件由你自行管理。</p> : null}
    {state.status && !state.status.secureStorageAvailable ? <p role="alert">系统安全存储不可用，暂时无法保存密钥。</p> : null}
    {error ? <p role="alert">{MODEL_SETTINGS_ERRORS[error]}</p> : null}
    {state.phase === 'saved' ? <p role="status">模型配置已保存并启用。</p> : null}
  </form>
}

export function ModelSettingsPanel({ onSaved }: { onSaved: () => void }): React.JSX.Element {
  const [controller] = useState(() => new ModelSettingsController(window.desktop))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => { void controller.load(); return () => controller.dispose() }, [controller])
  return <details className="model-settings-panel"><summary>模型设置</summary>
    {state.phase === 'loading' ? <p role="status">正在读取模型设置…</p> : <ModelSettingsForm state={state} onSave={async request => {
      if (await controller.save(request)) onSaved()
    }} />}
  </details>
}
