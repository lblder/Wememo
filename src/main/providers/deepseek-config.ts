import type { ReasoningProviderStatus } from '../../shared/reasoning-ipc'

export interface DeepSeekConfiguration {
  apiKey: string
  modelId: string
  endpoint: string
}

export interface DeepSeekConfigurationResult {
  status: ReasoningProviderStatus
  configuration?: DeepSeekConfiguration
}

export function isDeepSeekEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    const officialHost = url.hostname === 'api.deepseek.com'
    return url.protocol === 'https:' && officialHost && !url.username && !url.password && !url.port && !url.search && !url.hash &&
      ['/chat/completions', '/v1/chat/completions'].includes(url.pathname)
  } catch { return false }
}

/** Main-only environment loading. No secret getters, logging or Renderer storage. */
export function loadDeepSeekConfiguration(env: Record<string, string | undefined>): DeepSeekConfigurationResult {
  const apiKey = (env.WEMEMO_DEEPSEEK_API_KEY ?? env.DEEPSEEK_API_KEY ?? '').trim()
  const modelId = (env.WEMEMO_DEEPSEEK_MODEL ?? 'deepseek-flash').trim()
  const baseUrl = (env.WEMEMO_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
  const endpoint = `${baseUrl}/chat/completions`
  const valid = /^deepseek-[a-z0-9.-]{1,80}$/.test(modelId) && isDeepSeekEndpoint(endpoint) && !/[\r\n]/.test(apiKey)
  const status: ReasoningProviderStatus = {
    providerId: 'deepseek', modelId: valid ? modelId : 'deepseek-flash', configured: valid && apiKey.length > 0,
    message: !valid ? 'DeepSeek 配置无效，请检查 Main 环境中的模型和官方服务地址。'
      : !apiKey ? '未配置密钥；请设置 DEEPSEEK_API_KEY 后重启应用。' : '已配置 DeepSeek；点击生成时才发送选中的证据。'
  }
  return status.configured ? { status, configuration: { apiKey, modelId, endpoint } } : { status }
}
