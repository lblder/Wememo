export type MessageDirection = 'incoming' | 'outgoing'
export type MessageType = 'text'

/**
 * 跨层消息契约
 *这个契约故意只包含普通“值”，不包含 Electron 对象、文件系统句柄、源数据库句柄、React 状态以及 UI 组件。
 * 为 Main、Preload 和 Renderer 提供统一的消息数据结构。
 * 约束：
 * - id 在当前会话内保持稳定。
 * - timestamp 使用包含时区的 ISO 8601 字符串。
 * - direction 相对于当前用户定义。
 *
 * 修改字段语义时，需要同步检查使用方、合成样本和契约测试。
 * 
 * @author liang
 * @created 2026-09-08
 */
export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  direction: MessageDirection
  timestamp: string
  type: MessageType
  text: string
}

export function compareMessages(left: Message, right: Message): number {
  const timestampOrder = left.timestamp.localeCompare(right.timestamp)

  return timestampOrder !== 0 ? timestampOrder : left.id.localeCompare(right.id)
}

export function sortMessages(messages: readonly Message[]): Message[] {
  return [...messages].sort(compareMessages)
}

