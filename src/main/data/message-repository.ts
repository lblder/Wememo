import type { CanonicalMessage } from '../../shared/message'
import type {
  MessageQuery,
  MessageScopeQuery,
  MessageSearchQuery,
  MessageSearchResult
} from '../../shared/message-query'
import type { ConversationScope } from '../../shared/message-ipc'

export interface InsertMessagesResult {
  total: number
  inserted: number
  duplicate: number
}

export interface MessageRepository {
  insertMessages(
    messages: readonly CanonicalMessage[]
  ): InsertMessagesResult

  listConversationScopes(): ConversationScope[]

  listMessages(
    query: MessageQuery
  ): CanonicalMessage[]

  searchMessages(
    query: MessageSearchQuery
  ): MessageSearchResult

  countMessages(
    query: MessageScopeQuery
  ): number
}