import type { GenerateReasoningRequest } from '../shared/reasoning-ipc'
import {
  contextBridge,
  ipcRenderer
} from 'electron'

import {
  DESKTOP_CHANNELS,
  type DesktopApi,
  type DesktopPlatform
} from '../shared/desktop-api'

import type {
  MessageQuery,
  MessageScopeQuery,
  MessageSearchQuery
} from '../shared/message-query'

import type {
  InteractionPeriodAnalysisRequest
} from '../shared/interaction-ipc'

const supportedPlatforms =
  new Set<DesktopPlatform>([
    'darwin',
    'linux',
    'win32'
  ])

const platform =
  supportedPlatforms.has(
    process.platform as DesktopPlatform
  )
    ? (process.platform as DesktopPlatform)
    : 'unknown'

const desktopApi: DesktopApi = Object.freeze({
  getPlatform: () => platform,
  getReasoningStatus: () => ipcRenderer.invoke(DESKTOP_CHANNELS.reasoningStatus),
  generateReasoning: (request: GenerateReasoningRequest) => ipcRenderer.invoke(DESKTOP_CHANNELS.generateReasoning, request),

  chooseAndImportMessages: () =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.importMessages
    ),

  listConversationScopes: () =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.listConversationScopes
    ),

  listMessages: (query: MessageQuery) =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.listMessages,
      query
    ),

  searchMessages: (query: MessageSearchQuery) =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.searchMessages,
      query
    ),

  countMessages: (query: MessageScopeQuery) =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.countMessages,
      query
    ),

  analyzeInteractionPeriod: (
    request: InteractionPeriodAnalysisRequest
  ) =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.analyzeInteractionPeriod,
      request
    )
})

contextBridge.exposeInMainWorld(
  'desktop',
  desktopApi
)