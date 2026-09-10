import type {
  CanonicalMessage,
  MessageDirection,
  MessageSource,
  MessageType
} from './message'

/**
 * CanonicalMessage 运行时校验错误。
 *
 * TypeScript 只能在编译期检查类型，
 * 外部 JSON、文件导入和未来微信数据必须在运行时重新校验。
 * 
 * @author liang
 * @created 2026-09-09
 * 
 */
export class MessageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MessageValidationError'
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isMessageSource(value: unknown): value is MessageSource {
  return value === 'synthetic' || value === 'json-import'
}

function isMessageDirection(value: unknown): value is MessageDirection {
  return value === 'incoming' || value === 'outgoing'
}

function isMessageType(value: unknown): value is MessageType {
  return value === 'text'
}

/**
 * 将未知运行时数据校验为 CanonicalMessage。
 *
 * 注意：
 * - 本函数只做校验，不负责生成稳定 ID。
 * - 不负责读取文件或数据库。
 * - 不信任调用方传入的对象。
 */
export function validateCanonicalMessage(value: unknown): CanonicalMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MessageValidationError('消息必须是普通对象')
  }

  const message = value as Record<string, unknown>

  if (!isNonEmptyString(message.id)) {
    throw new MessageValidationError('id 不能为空')
  }

  if (!isMessageSource(message.source)) {
    throw new MessageValidationError('source 不合法')
  }

  if (!isNonEmptyString(message.sourceMessageId)) {
    throw new MessageValidationError('sourceMessageId 不能为空')
  }

  if (!isNonEmptyString(message.accountId)) {
    throw new MessageValidationError('accountId 不能为空')
  }

  if (!isNonEmptyString(message.conversationId)) {
    throw new MessageValidationError('conversationId 不能为空')
  }

  if (!isNonEmptyString(message.senderId)) {
    throw new MessageValidationError('senderId 不能为空')
  }

  if (
    message.senderName !== undefined &&
    !isNonEmptyString(message.senderName)
  ) {
    throw new MessageValidationError('senderName 必须是非空字符串')
  }

  if (!isMessageDirection(message.direction)) {
    throw new MessageValidationError('direction 不合法')
  }

  if (
    typeof message.timestamp !== 'number' ||
    !Number.isFinite(message.timestamp)
  ) {
    throw new MessageValidationError('timestamp 必须是有效数字')
  }

  if (!isMessageType(message.type)) {
    throw new MessageValidationError('type 不合法')
  }

  if (!isNonEmptyString(message.text)) {
    throw new MessageValidationError('text 不能为空')
  }

  return {
    id: message.id,
    source: message.source,
    sourceMessageId: message.sourceMessageId,
    accountId: message.accountId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.senderName,
    direction: message.direction,
    timestamp: message.timestamp,
    type: message.type,
    text: message.text
  }
}