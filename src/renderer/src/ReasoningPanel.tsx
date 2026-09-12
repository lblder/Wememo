import { useEffect, useRef, useState } from 'react'
import type { GeneratedReasoning, ReasoningProviderStatus } from '../../shared/reasoning-ipc'
import type { MetricEvidence, MessageEvidence } from '../../shared/interaction-evidence'
import type { SemanticEvidence } from '../../shared/semantic-evidence'

type Evidence = MetricEvidence | MessageEvidence | SemanticEvidence
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' })
const confidenceLabel = { low: '低', medium: '中', high: '高' }

function Citation({ evidence, number }: { evidence: Evidence; number: number }): React.JSX.Element {
  return (
    <details className="reasoning-citation">
      <summary>证据 {number} · {evidence.label}</summary>
      <p>{evidence.kind} · {evidence.direction}</p>
      {evidence.kind === 'metric' ? (
        <p>前期 {evidence.previous ?? '无数据'} → 最近 {evidence.recent ?? '无数据'}（{evidence.unit}）</p>
      ) : evidence.kind === 'semantic' ? (
        <>
          <p>{evidence.senderName ?? evidence.senderId} · {dateFormatter.format(evidence.timestamp)}</p>
          <blockquote>{evidence.excerpt}</blockquote>
          <small>原始 messageId：{evidence.messageIds.join(', ')}</small>
        </>
      ) : evidence.messages.map((message) => (
        <div key={message.messageId}>
          <p>{message.senderName ?? message.senderId} · {dateFormatter.format(message.timestamp)}</p>
          <blockquote>{message.text}</blockquote>
          <small>原始 messageId：{message.messageId}</small>
        </div>
      ))}
      <p><small>D4 Evidence ID：{evidence.id}</small></p>
    </details>
  )
}

export function ReasoningResultView({ value }: { value: GeneratedReasoning }): React.JSX.Element {
  const items: Evidence[] = Object.values(value.contextPack.evidence).flat()
  const byId = new Map(items.map((item, index) => [item.id, { item, number: index + 1 }]))
  const citations = (ids: string[]) => ids.map((id) => {
    const reference = byId.get(id)
    return reference ? <Citation key={id} evidence={reference.item} number={reference.number} /> : null
  })
  return (
    <section aria-label="已验证的互动解释">
      <h3>互动变化解释</h3>
      <p>{value.result.summary}</p>
      <p className="reasoning-meta">
        {value.providerId} / {value.modelId} · 分析 {value.contextPack.coverage.analyzedMessageCount} 条消息
        {' · '}指标状态：{value.contextPack.observations.map((item) => item.status).join('、')}
      </p>
      <h4>行为发现</h4>
      {value.result.findings.length === 0 ? <p>本次没有可引用的行为发现。</p> : value.result.findings.map((finding) => (
        <article key={finding.id}>
          <p>{finding.claim}</p>
          <p className="reasoning-meta">定性置信度：{confidenceLabel[finding.confidence]}</p>
          {citations(finding.evidenceIds)}
        </article>
      ))}
      <h4>可能的替代解释</h4>
      {value.result.alternativeExplanations.length === 0 ? <p>本次没有可引用的替代解释。</p> : value.result.alternativeExplanations.map((alternative) => (
        <article key={alternative.id}><p>{alternative.explanation}</p>{citations(alternative.evidenceIds)}</article>
      ))}
      <h4>不确定性</h4>
      <ul>{value.result.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </section>
  )
}

/** Mounted with a scope key: changing conversations discards the old result. */
export function ReasoningPanel({ accountId, conversationId }: { accountId: string; conversationId: string }): React.JSX.Element {
  const [provider, setProvider] = useState<ReasoningProviderStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [value, setValue] = useState<GeneratedReasoning | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    let active = true
    void window.desktop.getReasoningStatus().then((status) => { if (active) setProvider(status) }).catch(() => {
      if (active) setError('无法读取模型配置状态。')
    })
    return () => { active = false; generation.current++ }
  }, [])

  async function generate(): Promise<void> {
    if (pending || !provider?.configured) return
    const current = ++generation.current
    setPending(true); setError(''); setValue(null)
    try {
      const response = await window.desktop.generateReasoning({ accountId, conversationId, days: 7 })
      if (generation.current !== current) return
      if (response.ok) setValue(response.value)
      else setError(response.error.message)
    } catch {
      if (generation.current === current) setError('解释请求失败，请重试。')
    } finally {
      if (generation.current === current) setPending(false)
    }
  }

  return (
    <section className="reasoning-panel" aria-label="模型互动解释">
      <h2>关系变化解释</h2>
      <p>{provider ? `${provider.providerId} / ${provider.modelId} · ${provider.message}` : '正在读取模型配置…'}</p>
      <p>点击生成会将近期分析指标和选中的聊天证据发送给模型服务，可能产生 API 费用。完整聊天记录不会发送。</p>
      <button type="button" disabled={!provider?.configured || pending} onClick={() => void generate()}>
        {pending ? '正在生成解释…' : '生成关系变化解释'}
      </button>
      {pending && <p role="status">正在校验模型输出与证据引用，请稍候。</p>}
      {error && <p role="alert">{error}</p>}
      {value && <ReasoningResultView value={value} />}
    </section>
  )
}
