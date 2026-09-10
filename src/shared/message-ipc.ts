export interface ConversationScope {
  accountId: string
  conversationId: string
  messageCount: number
  lastTimestamp: number
}

export interface ImportRejectedItem {
  index: number
  sourceMessageId?: string
  reason: string
}

export interface ImportMessagesResult {
  canceled: boolean

  total: number
  accepted: number
  rejected: number

  inserted: number
  duplicate: number

  errors: ImportRejectedItem[]

  scopes: ConversationScope[]
}