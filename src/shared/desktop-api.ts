import type { GenerateReasoningRequest, GenerateReasoningResponse, ReasoningProviderStatus } from './reasoning-ipc'
import type { CanonicalMessage } from './message'
import type {
  MessageQuery,
  MessageScopeQuery,
  MessageSearchQuery,
  MessageSearchResult
} from './message-query'
import type {
  ConversationScope,
  ImportMessagesResult
} from './message-ipc'
import type {
  InteractionPeriodAnalysisRequest,
  InteractionPeriodAnalysisResult
} from './interaction-ipc'
/**
 * 桌面能力 API 契约。
 *
 * 主要职责：
 * - 定义 Renderer 可以使用哪些桌面能力。
 * - 定义 Preload 与 Renderer 之间传递的数据类型。
 *
 * 本文件只负责声明契约，不应依赖 Electron、Node.js 系统 API、
 * 文件系统句柄、数据库句柄或 React 状态。
 *
 * @author liang
 * @created 2026-09-09
 */
 
export type DesktopPlatform =
  | 'darwin'
  | 'linux'
  | 'win32'
  | 'unknown'

/**
 * Main 与 Preload 使用的 IPC 通道名称。
 */
export const DESKTOP_CHANNELS = {
  reasoningStatus: 'reasoning:status',
  generateReasoning: 'reasoning:generate',
  importMessages: 'messages:import-json',
  listConversationScopes: 'messages:list-scopes',
  listMessages: 'messages:list',
  searchMessages: 'messages:search',
  countMessages: 'messages:count',

  analyzeInteractionPeriod:
  'interaction:analyze-period',
} as const

/**
 * Renderer 能够使用的桌面能力契约。
 *
 * Renderer 不直接访问：
 * - SQLite
 * - 文件系统
 * - ipcRenderer
 * - Electron Main API
 */
export interface DesktopApi {
  getReasoningStatus: () => Promise<ReasoningProviderStatus>
  generateReasoning: (request: GenerateReasoningRequest) => Promise<GenerateReasoningResponse>

  getPlatform: () => DesktopPlatform

  chooseAndImportMessages:
    () => Promise<ImportMessagesResult>

  listConversationScopes:
    () => Promise<ConversationScope[]>

  listMessages:
    (query: MessageQuery) => Promise<CanonicalMessage[]>

  searchMessages:
    (query: MessageSearchQuery) => Promise<MessageSearchResult>

  countMessages:
    (query: MessageScopeQuery) => Promise<number>

  analyzeInteractionPeriod:
  (
    request: InteractionPeriodAnalysisRequest
  ) => Promise<InteractionPeriodAnalysisResult>
}