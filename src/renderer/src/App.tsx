import { syntheticConversation } from '../../shared/fixtures/synthetic-conversation'
import { sortMessages } from '../../shared/message'

const messages = sortMessages(syntheticConversation)
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai'
})

/**
 * D1 Renderer 主界面。
 *
 * 主要职责：
 * - 读取并展示合成聊天数据。
 * - 使用 shared 层提供的消息排序规则。
 * - 通过 DesktopApi 获取有限的桌面环境信息。
 *
 * 本文件只负责界面展示，不应直接访问文件系统、
 * Electron 高权限 API、数据库或真实微信数据。
*
 * @author liang
 * @created 2026-09-09
 */
 
 
export function App(): React.JSX.Element {
  const platform = window.desktop.getPlatform()

  return (
    <main className="app-shell">
      <section className="prototype" aria-labelledby="app-title">
        <header className="titlebar">
          <div>
            <p className="eyebrow">D1 Prototype</p>
            <h1 id="app-title">WeChat Relationship Agent</h1>
          </div>
          <span className="stage-badge">当前阶段：D1</span>
        </header>

        <aside className="synthetic-notice" aria-label="数据来源说明">
          <strong>Synthetic / 合成测试数据</strong>
          <span>人物与对话均为虚构，未接入真实微信数据</span>
        </aside>

        <div className="conversation-summary">
          <div>
            <span className="summary-label">会话</span>
            <strong>小林（虚构）</strong>
          </div>
          <div>
            <span className="summary-label">数据来源</span>
            <strong>Synthetic</strong>
          </div>
          <div>
            <span className="summary-label">消息总数</span>
            <strong>{messages.length}</strong>
          </div>
        </div>

        <ol className="message-list" aria-label="合成聊天记录">
          {messages.map((message) => (
            <li className={`message-row ${message.direction}`} key={message.id}>
              <article className="message-block">
                <div className="message-meta">
                  <span>{message.senderName}</span>
                  <time dateTime={message.timestamp}>
                    {timeFormatter.format(new Date(message.timestamp))}
                  </time>
                </div>
                <p className="message-bubble">{message.text}</p>
              </article>
            </li>
          ))}
        </ol>

        <footer className="runtime-note">只读原型 · {platform} · Electron 安全隔离已启用</footer>
      </section>
    </main>
  )
}

