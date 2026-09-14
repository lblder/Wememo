import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReasoningProviderStatus } from '../../shared/reasoning-ipc'
import { EVIDENCE_QUESTION_ERRORS } from '../../shared/evidence-question-ipc'
import { EvidenceQuestionController, type QuestionState } from './evidence-question-controller'
import { ReasoningResultView } from './ReasoningPanel'

export function QuestionOutcome({ state }: { state: QuestionState }): React.JSX.Element {
  const { response } = state
  const failure = response && !response.ok ? EVIDENCE_QUESTION_ERRORS[response.error.code] : null
  return (
    <div className="question-outcome" data-phase={state.phase}>
      {state.phase === 'idle' ? <p className="reasoning-meta">可以追问回复节奏、其他解释，或现有数据是否足够。</p> : null}
      {state.phase === 'running' ? <div className="question-status" role="status"><strong>正在取证与校验</strong><p>正在按需读取当前会话的分析证据。通过结构和引用校验后才显示答案。</p></div> : null}
      {failure ? <div className="question-status" role={state.phase === 'cancelled' ? 'status' : 'alert'}>
        <strong>{failure[1]}</strong><p>{failure[2]}</p>
        {state.phase === 'cancelled' && state.busy ? <p>正在结束当前请求…</p> : null}
      </div> : null}
      {response?.ok ? <>
        <div className="question-status" role="status"><strong>结构与引用校验通过</strong><p>追问：{state.question}</p></div>
        <ReasoningResultView value={response.value} />
      </> : null}
      {response?.stats ? <details className="question-diagnostics"><summary>本次执行记录</summary>
        <p>模型调用 {response.stats.modelCalls} 次 · 工具读取 {response.stats.toolCalls} 次 · 已交付证据 {response.stats.deliveredCount} 条 · {(response.stats.elapsedMs / 1000).toFixed(1)} 秒</p>
        {!response.ok ? <p>错误代码：<code>{response.error.code}</code></p> : null}
      </details> : null}
    </div>
  )
}

/** Parent keys this component by scope; unmount cancels and invalidates late results. */
export function EvidenceQuestionPanel({ accountId, conversationId }: { accountId: string; conversationId: string }): React.JSX.Element {
  const [controller] = useState(() => new EvidenceQuestionController(window.desktop))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const [provider, setProvider] = useState<ReasoningProviderStatus | null>(null)
  const [statusFailed, setStatusFailed] = useState(false)
  const [question, setQuestion] = useState('')
  const [days, setDays] = useState(7)
  useEffect(() => {
    let mounted = true
    void window.desktop.getEvidenceQuestionStatus().then(value => { if (mounted) setProvider(value) }).catch(() => { if (mounted) setStatusFailed(true) })
    return () => { mounted = false; controller.dispose() }
  }, [controller])
  const count = Array.from(question).length
  const canAsk = provider?.configured && question.trim().length > 0 && count <= 1000 && !state.busy
  return (
    <section className="reasoning-panel evidence-question-panel" aria-labelledby="question-heading">
      <h2 id="question-heading">证据追问</h2>
      <p>围绕当前会话提一个问题，答案会附上实际读取过的证据。</p>
      <p className="reasoning-meta">{provider ? `${provider.providerId} / ${provider.modelId} · ${provider.configured ? '已配置' : provider.message}` : statusFailed ? '无法读取模型配置，请重启后再试。' : '正在读取模型配置…'}</p>
      <form onSubmit={event => { event.preventDefault(); if (canAsk) void controller.ask({ accountId, conversationId, days, question: question.trim() }) }}>
        <div className="question-scope"><label htmlFor="question-days">分析范围</label>
          <select id="question-days" value={days} disabled={state.busy} onChange={event => { setDays(Number(event.target.value)); controller.reset() }}>
            <option value={7}>最近 7 天与前 7 天</option><option value={14}>最近 14 天与前 14 天</option><option value={30}>最近 30 天与前 30 天</option>
          </select>
        </div>
        <label htmlFor="evidence-question">你的问题</label>
        <textarea id="evidence-question" rows={3} maxLength={2000} placeholder="例如：回复变慢还有其他解释吗？" value={question} disabled={state.busy}
          aria-describedby="question-disclosure question-count" aria-invalid={count > 1000}
          onChange={event => setQuestion(event.target.value)} />
        <p id="question-count" className="reasoning-meta">{count} / 1000 字</p>
        <p id="question-disclosure" className="reasoning-meta">发起追问会将问题、分析指标和按需选择的聊天证据发送到 DeepSeek，可能产生 API 费用。</p>
        <div className="question-actions"><button type="submit" disabled={!canAsk}>{state.busy ? '追问处理中…' : '发起证据追问'}</button>
          {state.busy && state.phase !== 'cancelled' ? <button type="button" className="question-cancel" onClick={() => controller.cancel()}>取消追问</button> : null}
        </div>
      </form>
      <QuestionOutcome state={state} />
    </section>
  )
}
