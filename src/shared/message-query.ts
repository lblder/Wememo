export const DEFAULT_MESSAGE_LIMIT = 100
export const MAX_MESSAGE_LIMIT = 200

export interface MessageScopeQuery {
  accountId: string
  conversationId: string
  startTime?: number
  endTime?: number
}

export interface MessageQuery extends MessageScopeQuery {
  limit?: number
}

export interface MessageSearchQuery extends MessageQuery {
  text: string
}

export type MessageSearchMode =
  | 'fts-trigram'
  | 'like-short'

export interface MessageSearchResult {
  mode: MessageSearchMode
  messages: import('./message').CanonicalMessage[]
}

/**
 * 时间范围统一采用：
 *
 * [startTime, endTime)
 */
export function validateMessageQuery(
  query: MessageScopeQuery
): void {
  if (query.accountId.trim().length === 0) {
    throw new Error('accountId 不能为空')
  }

  if (query.conversationId.trim().length === 0) {
    throw new Error('conversationId 不能为空')
  }

  if (
    query.startTime !== undefined &&
    !Number.isFinite(query.startTime)
  ) {
    throw new Error('startTime 必须是有效数字')
  }

  if (
    query.endTime !== undefined &&
    !Number.isFinite(query.endTime)
  ) {
    throw new Error('endTime 必须是有效数字')
  }

  if (
    query.startTime !== undefined &&
    query.endTime !== undefined &&
    query.startTime > query.endTime
  ) {
    throw new Error('startTime 不能大于 endTime')
  }
}

export function validateMessageSearchQuery(
  query: MessageSearchQuery
): void {
  validateMessageQuery(query)

  if (query.text.trim().length === 0) {
    throw new Error('搜索文本不能为空')
  }
}

export function resolveMessageLimit(
  limit?: number
): number {
  if (limit === undefined) {
    return DEFAULT_MESSAGE_LIMIT
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('limit 必须是正整数')
  }

  return Math.min(limit, MAX_MESSAGE_LIMIT)
}