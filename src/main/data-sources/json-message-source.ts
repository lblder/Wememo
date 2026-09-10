import type {
  CanonicalMessage,
  MessageDirection,
  MessageType
} from '../../shared/message'
import { validateCanonicalMessage } from '../../shared/message-validation'
import { createCanonicalMessageId } from '../data/message-identity'

export const JSON_IMPORT_FORMAT = 'wememo-json-v1'

/**
 * JSON Import Adapter
 *
 *
 * 
 * @author liang
 * @created 2026-09-09
 */

export interface JsonImportRejectedItem {
  index: number
  sourceMessageId?: string
  reason: string
}

export interface JsonImportResult {
  total: number
  accepted: number
  rejected: number
  messages: CanonicalMessage[]
  errors: JsonImportRejectedItem[]
}

export class JsonImportFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonImportFormatError'
  }
}

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function readNonEmptyString(
  object: Record<string, unknown>,
  field: string
): string {
  const value = object[field]

  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new JsonImportFormatError(`${field} 不能为空`)
  }

  return value
}

function readOptionalString(
  object: Record<string, unknown>,
  field: string
): string | undefined {
  const value = object[field]

  if (value === undefined) {
    return undefined
  }

  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new JsonImportFormatError(
      `${field} 必须是非空字符串`
    )
  }

  return value
}

function readDirection(
  object: Record<string, unknown>
): MessageDirection {
  const value = object.direction

  if (value !== 'incoming' && value !== 'outgoing') {
    throw new JsonImportFormatError('direction 不合法')
  }

  return value
}

function readMessageType(
  object: Record<string, unknown>
): MessageType {
  if (object.type !== 'text') {
    throw new JsonImportFormatError('type 不合法')
  }

  return 'text'
}

function readTimestamp(
  object: Record<string, unknown>
): number {
  const value = object.timestamp

  if (typeof value !== 'string') {
    throw new JsonImportFormatError(
      'timestamp 必须是 ISO 8601 字符串'
    )
  }

  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    throw new JsonImportFormatError('timestamp 不合法')
  }

  return timestamp
}

function normalizeMessage(
  value: unknown,
  accountId: string
): CanonicalMessage {
  if (!isPlainObject(value)) {
    throw new JsonImportFormatError('消息必须是普通对象')
  }

  const sourceMessageId = readNonEmptyString(
    value,
    'sourceMessageId'
  )

  const conversationId = readNonEmptyString(
    value,
    'conversationId'
  )

  const senderId = readNonEmptyString(
    value,
    'senderId'
  )

  const senderName = readOptionalString(
    value,
    'senderName'
  )

  const direction = readDirection(value)
  const timestamp = readTimestamp(value)
  const type = readMessageType(value)
  const text = readNonEmptyString(value, 'text')

  const id = createCanonicalMessageId({
    source: 'json-import',
    accountId,
    conversationId,
    sourceMessageId
  })

  return validateCanonicalMessage({
    id,
    source: 'json-import',
    sourceMessageId,
    accountId,
    conversationId,
    senderId,
    ...(senderName !== undefined ? { senderName } : {}),
    direction,
    timestamp,
    type,
    text
  })
}

/**
 * 将 Wememo JSON 导入文档解析并标准化为 CanonicalMessage。
 *
 * 文档级错误直接终止；
 * 单条消息错误只拒绝该条，其余合法消息继续处理。
 */
export function parseJsonImportDocument(
  text: string
): JsonImportResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new JsonImportFormatError('JSON 解析失败')
  }

  if (!isPlainObject(parsed)) {
    throw new JsonImportFormatError(
      'JSON 顶层必须是对象'
    )
  }

  if (parsed.format !== JSON_IMPORT_FORMAT) {
    throw new JsonImportFormatError(
      `format 必须是 ${JSON_IMPORT_FORMAT}`
    )
  }

  const accountId = readNonEmptyString(
    parsed,
    'accountId'
  )

  if (!Array.isArray(parsed.messages)) {
    throw new JsonImportFormatError(
      'messages 必须是数组'
    )
  }

  const messages: CanonicalMessage[] = []
  const errors: JsonImportRejectedItem[] = []

  parsed.messages.forEach((rawMessage, index) => {
    try {
      messages.push(
        normalizeMessage(rawMessage, accountId)
      )
    } catch (error) {
      const sourceMessageId =
        isPlainObject(rawMessage) &&
        typeof rawMessage.sourceMessageId === 'string'
          ? rawMessage.sourceMessageId
          : undefined

      errors.push({
        index,
        ...(sourceMessageId
          ? { sourceMessageId }
          : {}),
        reason:
          error instanceof Error
            ? error.message
            : '未知导入错误'
      })
    }
  })

  return {
    total: parsed.messages.length,
    accepted: messages.length,
    rejected: errors.length,
    messages,
    errors
  }
}