import type { SemanticEvidence } from '../../shared/semantic-evidence'
import {
  useEffect,
  useState
} from 'react'

import type {
  CanonicalMessage
} from '../../shared/message'

import type {
  ConversationScope
} from '../../shared/message-ipc'

import type {
  MessageSearchMode
} from '../../shared/message-query'

import type {
  InteractionPeriodAnalysisResult
} from '../../shared/interaction-ipc'

const timeFormatter =
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai'
  })

const evidenceTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai'
})

function SemanticEvidenceList({ items }: { items: SemanticEvidence[] }): React.JSX.Element {
  if (items.length === 0) return <p>暂无匹配的语义证据</p>
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.label}</strong>
          <p>{item.category} · {item.direction === 'context' ? '背景' : item.direction === 'counter' ? '反向' : '支持'} · 规则强度 {item.confidence}</p>
          <p>{item.senderName ?? item.senderId} · {evidenceTimeFormatter.format(item.timestamp)}</p>
          <blockquote>{item.excerpt}</blockquote>
          <small>messageId: {item.messageIds.join(', ')}</small>
        </li>
      ))}
    </ul>
  )
}

export function App(): React.JSX.Element {
  const platform =
    window.desktop.getPlatform()

  const [scopes, setScopes] =
    useState<ConversationScope[]>([])

  const [
    selectedScopeIndex,
    setSelectedScopeIndex
  ] = useState(0)

  const [messages, setMessages] =
    useState<CanonicalMessage[]>([])

  const [searchText, setSearchText] =
    useState('')

  const [searchMode, setSearchMode] =
    useState<MessageSearchMode | null>(
      null
    )

  const [status, setStatus] =
    useState('正在读取本地数据库...')

  const selectedScope =
    scopes[selectedScopeIndex]

  const [analysis, setAnalysis] =
    useState<InteractionPeriodAnalysisResult | null>(
      null
    )

  async function loadScopes(): Promise<void> {
    try {
      const nextScopes =
        await window.desktop
          .listConversationScopes()

      setScopes(nextScopes)
      setSelectedScopeIndex(0)

      if (nextScopes.length === 0) {
        setMessages([])
        setStatus(
          '数据库为空，请导入测试 JSON'
        )
      } else {
        setStatus('本地数据库已加载')
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : '读取数据库失败'
      )
    }
  }

  async function loadMessages(
    scope: ConversationScope
  ): Promise<void> {
    try {
      const result =
        await window.desktop.listMessages({
          accountId: scope.accountId,
          conversationId:
            scope.conversationId,
          limit: 200
        })

      setMessages(result)
      setSearchMode(null)
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : '读取消息失败'
      )
    }
  }

  async function analyzeInteraction():
    Promise<void> {
    if (!selectedScope) {
      return
    }

    try {
      setStatus(
        '正在计算最近 7 天互动变化...'
      )

      const result =
        await window.desktop
          .analyzeInteractionPeriod({
            accountId:
              selectedScope.accountId,

            conversationId:
              selectedScope.conversationId,

            days: 7
          })

      setAnalysis(result)

      setStatus(
        `分析完成，共分析 ${result.analyzedMessageCount} 条消息`
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : '互动分析失败'
      )
    }
  }

  async function importMessages():
    Promise<void> {
    try {
      const result =
        await window.desktop
          .chooseAndImportMessages()

      if (result.canceled) {
        setStatus('已取消导入')
        return
      }

      setScopes(result.scopes)
      setSelectedScopeIndex(0)

      setStatus(
        `导入完成：新增 ${result.inserted} 条，重复 ${result.duplicate} 条，拒绝 ${result.rejected} 条`
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : '导入失败'
      )
    }
  }

  async function searchMessages():
    Promise<void> {
    if (!selectedScope) {
      return
    }

    const text = searchText.trim()

    if (text.length === 0) {
      await loadMessages(
        selectedScope
      )

      return
    }

    try {
      const result =
        await window.desktop
          .searchMessages({
            accountId:
              selectedScope.accountId,
            conversationId:
              selectedScope.conversationId,
            text,
            limit: 200
          })

      setMessages(result.messages)
      setSearchMode(result.mode)

      setStatus(
        `找到 ${result.messages.length} 条消息`
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : '搜索失败'
      )
    }
  }

  useEffect(() => {
    void loadScopes()
  }, [])

  useEffect(() => {
    if (!selectedScope) {
      return
    }

    void loadMessages(
      selectedScope
    )
  }, [
    selectedScope?.accountId,
    selectedScope?.conversationId
  ])

  return (
    <main className="app-shell">
      <section
        className="prototype"
        aria-labelledby="app-title"
      >
        <header className="titlebar">
          <div>
            <p className="eyebrow">
              D2 Data Layer
            </p>

            <h1 id="app-title">
              WeChat Relationship Agent
            </h1>
          </div>

          <span className="stage-badge">
            当前阶段：D2
          </span>
        </header>

        <aside
          className="synthetic-notice"
          aria-label="数据来源说明"
        >
          <strong>
            本地 SQLite 数据库
          </strong>

          <span>
            当前仍未读取真实微信数据库
          </span>
        </aside>

        <div>
          <button
            type="button"
            onClick={() =>
              void importMessages()
            }
          >
            Import JSON
          </button>
        </div>

        <p>{status}</p>

        {scopes.length > 0 && (
          <div>
            <label>
              当前会话：

              <select
                value={selectedScopeIndex}
                onChange={(event) => {
                  setSelectedScopeIndex(
                    Number(
                      event.target.value
                    )
                  )
                }}
              >
                {scopes.map(
                  (scope, index) => (
                    <option
                      key={`${scope.accountId}:${scope.conversationId}`}
                      value={index}
                    >
                      {scope.accountId}
                      {' / '}
                      {scope.conversationId}
                      {' ('}
                      {scope.messageCount}
                      {' 条)'}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>
        )}

        {selectedScope && (
          <div>
            <input
              type="search"
              value={searchText}
              placeholder="搜索消息"
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
            />

            <button
              type="button"
              onClick={() =>
                void searchMessages()
              }
            >
              搜索
            </button>

            <button
              type="button"
              onClick={() =>
                void analyzeInteraction()
              }
            >
              分析最近 7 天
            </button>

            {searchMode && (
              <span>
                {' '}
                搜索模式：
                {searchMode}
              </span>
            )}
          </div>
        )}

        <div className="conversation-summary">
          <div>
            <span className="summary-label">
              数据来源
            </span>

            <strong>
              Local SQLite
            </strong>
          </div>

          <div>
            <span className="summary-label">
              会话数量
            </span>

            <strong>
              {scopes.length}
            </strong>
          </div>

          <div>
            <span className="summary-label">
              当前显示
            </span>

            <strong>
              {messages.length}
            </strong>
          </div>
        </div>

        {analysis && (
          <section className="analysis-panel">
            <h2>
              最近 7 天 vs 前 7 天
            </h2>

            <p>
              分析消息：
              {analysis.analyzedMessageCount} 条
            </p>

            <section aria-label="Analysis Context">
              <h3>Analysis Context</h3>
              <p>Context Version: {analysis.contextPack.version}</p>
              <p>Policy Version: {analysis.contextPack.policy.version}</p>
              <p>
                Evidence: Support {analysis.contextPack.evidence.metricSupport.length + analysis.contextPack.evidence.messageSupport.length + analysis.contextPack.evidence.semanticSupport.length}
                {' · '}Counter {analysis.contextPack.evidence.metricCounter.length + analysis.contextPack.evidence.messageCounter.length + analysis.contextPack.evidence.semanticCounter.length}
                {' · '}Context {analysis.contextPack.evidence.semanticContext.length}
              </p>
              <p>
                Coverage: Previous {analysis.contextPack.coverage.previousMessageCount} messages
                {' · '}Recent {analysis.contextPack.coverage.recentMessageCount} messages
              </p>
            </section>

            <table>
              <thead>
                <tr>
                  <th>指标</th>
                  <th>前7天</th>
                  <th>最近7天</th>
                  <th>变化</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>消息数量</td>

                  <td>
                    {
                      analysis.comparison
                        .previous.totalMessages
                    }
                  </td>

                  <td>
                    {
                      analysis.comparison
                        .recent.totalMessages
                    }
                  </td>

                  <td>
                    {
                      analysis.comparison
                        .changes.totalMessages
                        .relativeChange === null
                        ? '无法计算'
                        : `${(
                            analysis.comparison
                              .changes.totalMessages
                              .relativeChange * 100
                          ).toFixed(1)}%`
                    }
                  </td>
                </tr>

                <tr>
                  <td>聊天 Session</td>

                  <td>
                    {
                      analysis.comparison
                        .previous.sessions
                        .totalSessions
                    }
                  </td>

                  <td>
                    {
                      analysis.comparison
                        .recent.sessions
                        .totalSessions
                    }
                  </td>

                  <td>
                    {
                      analysis.comparison
                        .changes.totalSessions
                        .relativeChange === null
                        ? '无法计算'
                        : `${(
                            analysis.comparison
                              .changes.totalSessions
                              .relativeChange * 100
                          ).toFixed(1)}%`
                    }
                  </td>
                </tr>

                <tr>
                  <td>对方发起率</td>

                  <td>
                    {(
                      analysis.comparison
                        .previous.sessions
                        .incomingStartedRatio *
                      100
                    ).toFixed(1)}
                    %
                  </td>

                  <td>
                    {(
                      analysis.comparison
                        .recent.sessions
                        .incomingStartedRatio *
                      100
                    ).toFixed(1)}
                    %
                  </td>

                  <td>
                    {(
                      analysis.comparison
                        .changes
                        .incomingStartedRatio
                        .percentagePointChange *
                      100
                    ).toFixed(1)}
                    个百分点
                  </td>
                </tr>

                <tr>
                  <td>活跃天数</td>

                  <td>
                    {
                      analysis.comparison
                        .previous.activeDays
                    }
                  </td>

                  <td>
                    {
                      analysis.comparison
                        .recent.activeDays
                    }
                  </td>

                  <td>
                    {
                      analysis.comparison
                        .changes.activeDays
                        .absoluteChange
                    }
                  </td>
                </tr>
              </tbody>
            </table>
            {analysis.evidenceReport.observations.map(
              (observation) => (
                <section
                  key={observation.id}
                  className="evidence-panel"
                >
                  <h3>
                    {observation.title}
                  </h3>

                  <p>
                    状态：
                    {observation.status}
                  </p>

                  <p>
                    {observation.summary}
                  </p>

                  <h4>支持证据</h4>

                  <ul>
                    {observation.evidence.map(
                      (item) => (
                        <li key={item.id}>
                          {item.label}
                        </li>
                      )
                    )}
                  </ul>

                  <h4>反向证据</h4>

                  {observation.counterEvidence.length ===
                  0 ? (
                    <p>暂无反向指标</p>
                  ) : (
                    <ul>
                      {observation.counterEvidence.map(
                        (item) => (
                          <li key={item.id}>
                            {item.label}
                          </li>
                        )
                      )}
                    </ul>
                  )}
                  <h4>原始聊天证据</h4>

                  {observation.messageEvidence.length === 0 ? (
                    <p>暂无对应原始消息证据</p>
                  ) : (
                    <ul>
                      {observation.messageEvidence.map(
                        (evidence) => (
                          <li key={evidence.id}>
                            <strong>
                              {evidence.label}
                            </strong>

                            {evidence.messages.map(
                              (message) => (
                                <p key={message.messageId}>
                                  {message.senderName ??
                                    message.senderId}
                                  ：
                                  {message.text}
                                </p>
                              )
                            )}
                          </li>
                        )
                      )}
                    </ul>
                  )}

                  <h4>原始反向证据</h4>

                  {observation.counterMessageEvidence.length ===
                  0 ? (
                    <p>暂无原始反向证据</p>
                  ) : (
                    <ul>
                      {observation.counterMessageEvidence.map(
                        (evidence) => (
                          <li key={evidence.id}>
                            <strong>
                              {evidence.label}
                            </strong>

                            {evidence.messages.map(
                              (message) => (
                                <p key={message.messageId}>
                                  {message.senderName ??
                                    message.senderId}
                                  ：
                                  {message.text}
                                </p>
                              )
                            )}
                          </li>
                        )
                      )}
                    </ul>
                  )}
                  <h4>语义证据</h4>
                  <p>中文规则匹配；规则强度不是概率。仅提供原文背景，不改变指标判定。</p>
                  <SemanticEvidenceList items={observation.semanticEvidence} />
                  <h4>语义反向证据</h4>
                  <SemanticEvidenceList items={observation.counterSemanticEvidence} />
                </section>
              )
            )}
          </section>
        )}

        {messages.length === 0 ? (
          <p>
            当前没有可显示的消息。
          </p>
        ) : (
          <ol
            className="message-list"
            aria-label="本地聊天记录"
          >
            {messages.map(
              (message) => (
                <li
                  className={
                    `message-row ${message.direction}`
                  }
                  key={message.id}
                >
                  <article className="message-block">
                    <div className="message-meta">
                      <span>
                        {message.senderName ??
                          message.senderId}
                      </span>

                      <time
                        dateTime={
                          new Date(
                            message.timestamp
                          ).toISOString()
                        }
                      >
                        {timeFormatter.format(
                          new Date(
                            message.timestamp
                          )
                        )}
                      </time>
                    </div>

                    <p className="message-bubble">
                      {message.text}
                    </p>
                  </article>
                </li>
              )
            )}
          </ol>
        )}

        <footer className="runtime-note">
          SQLite · {platform} ·
          Electron 安全隔离已启用
        </footer>
      </section>
    </main>
  )
}
