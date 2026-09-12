import type { DatabaseSync } from 'node:sqlite'

import type { CanonicalMessage } from '../../shared/message'
import type { ConversationScope } from '../../shared/message-ipc'
import {
  resolveMessageLimit,
  validateMessageQuery,
  validateMessageSearchQuery,
  type MessageQuery,
  type MessageScopeQuery,
  type MessageSearchQuery,
  type MessageSearchResult
} from '../../shared/message-query'
import { validateCanonicalMessage } from '../../shared/message-validation'

import type {
  InsertMessagesResult,
  MessageRepository
} from './message-repository'

interface MessageRow {
  id: string
  source: string
  source_message_id: string
  account_id: string
  conversation_id: string
  sender_id: string
  sender_name: string | null
  direction: string
  timestamp: number
  type: string
  text: string
}

/**
 * 将 SQLite 数据行转换回 Wememo 的 CanonicalMessage。
 *
 * 数据库中的 snake_case 字段在这里转换为应用层 camelCase 字段。
 */
function rowToMessage(
  row: MessageRow
): CanonicalMessage {
  return validateCanonicalMessage({
    id: row.id,
    source: row.source,
    sourceMessageId: row.source_message_id,
    accountId: row.account_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    ...(row.sender_name !== null
      ? { senderName: row.sender_name }
      : {}),
    direction: row.direction,
    timestamp: row.timestamp,
    type: row.type,
    text: row.text
  })
}

/**
 * SQLite MessageRepository 实现。
 *
 * 主要职责：
 * - 保存 CanonicalMessage；
 * - 保证重复导入幂等；
 * - 按账号、会话和时间范围读取消息；
 * - 提供中文消息搜索；
 * - 将 SQLite Row 转换回 CanonicalMessage。
 */
export class SqliteMessageRepository
  implements MessageRepository
{
  constructor(
    private readonly database: DatabaseSync
  ) {}

  /**
   * 批量插入消息。
   *
   * messages 是真实消息表；
   * message_fts 是派生搜索索引。
   *
   * 只有 messages 真正插入成功后，
   * 才同步写入 FTS 索引。
   */
  insertMessages(
    messages: readonly CanonicalMessage[]
  ): InsertMessagesResult {
    const statement = this.database.prepare(`
      INSERT INTO messages (
        id,
        source,
        source_message_id,
        account_id,
        conversation_id,
        sender_id,
        sender_name,
        direction,
        timestamp,
        type,
        text,
        imported_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT (
        source,
        account_id,
        conversation_id,
        source_message_id
      )
      DO NOTHING
    `)

    const ftsStatement = this.database.prepare(`
      INSERT INTO message_fts (
        id,
        account_id,
        conversation_id,
        text
      )
      VALUES (?, ?, ?, ?)
    `)

    let inserted = 0

    this.database.exec('BEGIN IMMEDIATE')

    try {
      for (const message of messages) {
        const validMessage =
          validateCanonicalMessage(message)

        const result = statement.run(
          validMessage.id,
          validMessage.source,
          validMessage.sourceMessageId,
          validMessage.accountId,
          validMessage.conversationId,
          validMessage.senderId,
          validMessage.senderName ?? null,
          validMessage.direction,
          validMessage.timestamp,
          validMessage.type,
          validMessage.text,
          Date.now()
        )

        const changes = Number(result.changes)

        inserted += changes

        /**
         * 只有 messages 表真正新增了一条消息，
         * 才同步增加 FTS 索引。
         *
         * 重复导入时 changes = 0，
         * 因此不会产生重复 FTS 记录。
         */
        if (changes > 0) {
          ftsStatement.run(
            validMessage.id,
            validMessage.accountId,
            validMessage.conversationId,
            validMessage.text
          )
        }
      }

      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }

    return {
      total: messages.length,
      inserted,
      duplicate: messages.length - inserted
    }
  }

  /**
   * 按明确 Scope 获取消息。
   *
   * 时间范围：
   * [startTime, endTime)
   */
  listMessages(
    query: MessageQuery
  ): CanonicalMessage[] {
    validateMessageQuery(query)

    const limit = resolveMessageLimit(query.limit)

    const conditions = [
      'account_id = ?',
      'conversation_id = ?'
    ]

    const parameters: Array<string | number> = [
      query.accountId,
      query.conversationId
    ]

    if (query.startTime !== undefined) {
      conditions.push('timestamp >= ?')
      parameters.push(query.startTime)
    }

    if (query.endTime !== undefined) {
      conditions.push('timestamp < ?')
      parameters.push(query.endTime)
    }

    const rows = this.database
      .prepare(`
        SELECT
          id,
          source,
          source_message_id,
          account_id,
          conversation_id,
          sender_id,
          sender_name,
          direction,
          timestamp,
          type,
          text
        FROM messages
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          timestamp ASC,
          id ASC
        LIMIT ?
      `)
      .all(
        ...parameters,
        limit
      ) as unknown as MessageRow[]

    return rows.map(rowToMessage)
  }

  listMessagesInRange(
    query: MessageScopeQuery
  ): CanonicalMessage[] {
    validateMessageQuery(query)

    const conditions = [
      'account_id = ?',
      'conversation_id = ?'
    ]

    const parameters: Array<string | number> = [
      query.accountId,
      query.conversationId
    ]

    if (query.startTime !== undefined) {
      conditions.push('timestamp >= ?')
      parameters.push(query.startTime)
    }

    if (query.endTime !== undefined) {
      conditions.push('timestamp < ?')
      parameters.push(query.endTime)
    }

    const rows = this.database
      .prepare(`
        SELECT
          id,
          source,
          source_message_id,
          account_id,
          conversation_id,
          sender_id,
          sender_name,
          direction,
          timestamp,
          type,
          text
        FROM messages
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          timestamp ASC,
          id ASC
      `)
      .all(
        ...parameters
      ) as unknown as MessageRow[]

    return rows.map(rowToMessage)
  }

  listConversationScopes(): ConversationScope[] {
    const rows = this.database
      .prepare(`
        SELECT
          account_id,
          conversation_id,
          COUNT(*) AS message_count,
          MAX(timestamp) AS last_timestamp
        FROM messages
        GROUP BY
          account_id,
          conversation_id
        ORDER BY
          last_timestamp DESC,
          account_id ASC,
          conversation_id ASC
      `)
      .all() as unknown as Array<{
        account_id: string
        conversation_id: string
        message_count: number
        last_timestamp: number
      }>

    return rows.map((row) => ({
      accountId: row.account_id,
      conversationId: row.conversation_id,
      messageCount: Number(row.message_count),
      lastTimestamp: Number(row.last_timestamp)
    }))
  }

  /**
   * 搜索消息。
   *
   * 1~2 个 Unicode 字符：
   * → Scoped LIKE
   *
   * 3 个及以上 Unicode 字符：
   * → FTS5 trigram
   */
  searchMessages(
    query: MessageSearchQuery
  ): MessageSearchResult {
    validateMessageSearchQuery(query)

    const normalizedText = query.text.trim()

    /**
     * [...text].length 按 Unicode code point 计算，
     * 比普通 text.length 更适合中文和 Emoji。
     */
    const characterCount =
      [...normalizedText].length

    if (characterCount < 3) {
      return {
        mode: 'like-short',
        messages: this.searchWithLike(
          query,
          normalizedText
        )
      }
    }

    return {
      mode: 'fts-trigram',
      messages: this.searchWithFts(
        query,
        normalizedText
      )
    }
  }

  /**
   * 1~2 字短文本搜索。
   *
   * 必须同时受到：
   * - accountId
   * - conversationId
   * - time range
   * - limit
   *
   * 的约束，因此不是全库 LIKE。
   */
  private searchWithLike(
    query: MessageSearchQuery,
    text: string
  ): CanonicalMessage[] {
    const limit = resolveMessageLimit(query.limit)

    const conditions = [
      'account_id = ?',
      'conversation_id = ?',
      `text LIKE ? ESCAPE '\\'`
    ]

    /**
     * 转义 LIKE 中有特殊含义的字符：
     *
     * %  → 任意长度字符
     * _  → 任意单个字符
     * \  → 我们指定的 ESCAPE 字符
     */
    const escapedText = text
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_')

    const parameters: Array<string | number> = [
      query.accountId,
      query.conversationId,
      `%${escapedText}%`
    ]

    if (query.startTime !== undefined) {
      conditions.push('timestamp >= ?')
      parameters.push(query.startTime)
    }

    if (query.endTime !== undefined) {
      conditions.push('timestamp < ?')
      parameters.push(query.endTime)
    }

    const rows = this.database
      .prepare(`
        SELECT
          id,
          source,
          source_message_id,
          account_id,
          conversation_id,
          sender_id,
          sender_name,
          direction,
          timestamp,
          type,
          text
        FROM messages
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          timestamp ASC,
          id ASC
        LIMIT ?
      `)
      .all(
        ...parameters,
        limit
      ) as unknown as MessageRow[]

    return rows.map(rowToMessage)
  }

  /**
   * 3 字及以上文本使用 FTS5 trigram 搜索。
   *
   * FTS 负责找候选消息，
   * messages 表仍然是最终真实数据来源。
   */
  private searchWithFts(
    query: MessageSearchQuery,
    text: string
  ): CanonicalMessage[] {
    const limit = resolveMessageLimit(query.limit)

    const conditions = [
      'm.account_id = ?',
      'm.conversation_id = ?',
      'message_fts MATCH ?'
    ]

    /**
     * 使用双引号形成普通 phrase 查询，
     * 同时把用户文本中的双引号转义，
     * 避免直接暴露 FTS Query Language。
     */
    const ftsQuery =
      `"${text.replaceAll('"', '""')}"`

    const parameters: Array<string | number> = [
      query.accountId,
      query.conversationId,
      ftsQuery
    ]

    if (query.startTime !== undefined) {
      conditions.push('m.timestamp >= ?')
      parameters.push(query.startTime)
    }

    if (query.endTime !== undefined) {
      conditions.push('m.timestamp < ?')
      parameters.push(query.endTime)
    }

    const rows = this.database
      .prepare(`
        SELECT
          m.id,
          m.source,
          m.source_message_id,
          m.account_id,
          m.conversation_id,
          m.sender_id,
          m.sender_name,
          m.direction,
          m.timestamp,
          m.type,
          m.text
        FROM message_fts
        JOIN messages AS m
          ON m.id = message_fts.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          m.timestamp ASC,
          m.id ASC
        LIMIT ?
      `)
      .all(
        ...parameters,
        limit
      ) as unknown as MessageRow[]

    return rows.map(rowToMessage)
  }

  /**
   * 统计指定 Scope 内的消息数量。
   */
  countMessages(
    query: MessageScopeQuery
  ): number {
    validateMessageQuery(query)

    const conditions = [
      'account_id = ?',
      'conversation_id = ?'
    ]

    const parameters: Array<string | number> = [
      query.accountId,
      query.conversationId
    ]

    if (query.startTime !== undefined) {
      conditions.push('timestamp >= ?')
      parameters.push(query.startTime)
    }

    if (query.endTime !== undefined) {
      conditions.push('timestamp < ?')
      parameters.push(query.endTime)
    }

    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM messages
        WHERE ${conditions.join(' AND ')}
      `)
      .get(
        ...parameters
      ) as { count: number }

    return Number(row.count)
  }
}