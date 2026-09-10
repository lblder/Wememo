import { createHash } from 'node:crypto'

import type { MessageSource } from '../../shared/message'

export interface MessageIdentityInput {
  source: MessageSource
  accountId: string
  conversationId: string
  sourceMessageId: string
}

/**
 * 根据数据源中的稳定身份生成 Wememo 内部消息 ID。
 *
 * 不使用昵称、正文和时间戳作为身份，
 * 因为这些字段可能重复或发生变化。
 *  
 * @author liang
 * @created 2026-09-09
 */
export function createCanonicalMessageId(
  input: MessageIdentityInput
): string {
  const identity = JSON.stringify([
    input.source,
    input.accountId,
    input.conversationId,
    input.sourceMessageId
  ])

  return createHash('sha256')
    .update(identity, 'utf8')
    .digest('hex')
}