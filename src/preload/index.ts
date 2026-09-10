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
    )
})

contextBridge.exposeInMainWorld(
  'desktop',
  desktopApi
)