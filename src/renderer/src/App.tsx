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

const timeFormatter =
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai'
  })

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