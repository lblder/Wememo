import { ReasoningService } from './services/reasoning-service'
import { loadDeepSeekConfiguration } from './providers/deepseek-config'
import { DeepSeekProvider } from './providers/deepseek-provider'
/**
 * Electron 主进程入口。
 *
 * 主要职责：
 * - 管理应用生命周期；
 * - 创建 BrowserWindow；
 * - 初始化 Wememo SQLite；
 * - 注册消息相关 IPC；
 * - 执行本地 JSON 导入。
 */

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  type IpcMainInvokeEvent
} from 'electron'

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import {
  DESKTOP_CHANNELS
} from '../shared/desktop-api'

import type {
  ImportMessagesResult
} from '../shared/message-ipc'

import type {
  MessageQuery,
  MessageScopeQuery,
  MessageSearchQuery
} from '../shared/message-query'

import {
  parseJsonImportDocument
} from './data-sources/json-message-source'

import {
  openDatabase
} from './data/database'

import {
  SqliteMessageRepository
} from './data/sqlite-message-repository'

import type {
  InteractionPeriodAnalysisRequest
} from '../shared/interaction-ipc'

import {
  InteractionAnalysisService
} from './analytics/interaction-analysis-service'

let reasoningService: ReasoningService | undefined
let applicationWindow: BrowserWindow | undefined

let database: DatabaseSync | undefined
let messageRepository:
  | SqliteMessageRepository
  | undefined
let interactionAnalysisService:
  | InteractionAnalysisService
  | undefined

function getMessageRepository():
  SqliteMessageRepository {
  if (!messageRepository) {
    throw new Error(
      '消息数据库尚未初始化'
    )
  }

  return messageRepository
}

function initializeDatabase(): void {
  const databasePath = join(
    app.getPath('userData'),
    'wememo.sqlite'
  )

  database = openDatabase(databasePath)

  messageRepository =
    new SqliteMessageRepository(database)

  interactionAnalysisService =
    new InteractionAnalysisService(
      messageRepository
    )

  const deepseek = loadDeepSeekConfiguration(process.env)
  reasoningService = new ReasoningService(
    interactionAnalysisService,
    deepseek.configuration ? new DeepSeekProvider(deepseek.configuration, net.fetch.bind(net)) : undefined,
    deepseek.status
  )
}

function getInteractionAnalysisService():
  InteractionAnalysisService {
  if (!interactionAnalysisService) {
    throw new Error(
      '互动分析服务尚未初始化'
    )
  }

  return interactionAnalysisService
}



function isTrustedReasoningSender(event: IpcMainInvokeEvent): boolean {
  if (!applicationWindow || event.sender !== applicationWindow.webContents ||
      event.senderFrame !== applicationWindow.webContents.mainFrame) return false
  const expected = process.env.ELECTRON_RENDERER_URL
  const trustedUrl = expected ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href
  return new URL(event.senderFrame.url).href === new URL(trustedUrl).href
}

function registerMessageIpc(): void {
  ipcMain.handle(DESKTOP_CHANNELS.reasoningStatus, (event) => {
    if (!isTrustedReasoningSender(event) || !reasoningService) throw new Error('Reasoning request rejected')
    return reasoningService.getStatus()
  })
  ipcMain.handle(DESKTOP_CHANNELS.generateReasoning, (event, request: unknown) => {
    if (!isTrustedReasoningSender(event) || !reasoningService) {
      return { ok: false, error: { code: 'invalid-request', message: '请求来源无效。' } }
    }
    return reasoningService.generate(request)
  })
  ipcMain.handle(
    DESKTOP_CHANNELS.listConversationScopes,
    () => {
      return getMessageRepository()
        .listConversationScopes()
    }
  )

  ipcMain.handle(
    DESKTOP_CHANNELS.analyzeInteractionPeriod,
    (
      _event,
      request:
        InteractionPeriodAnalysisRequest
    ) => {
      return getInteractionAnalysisService()
        .analyzePeriod(request)
    }
  )

  ipcMain.handle(
    DESKTOP_CHANNELS.listMessages,
    (_event, query: MessageQuery) => {
      return getMessageRepository()
        .listMessages(query)
    }
  )

  ipcMain.handle(
    DESKTOP_CHANNELS.searchMessages,
    (_event, query: MessageSearchQuery) => {
      return getMessageRepository()
        .searchMessages(query)
    }
  )

  ipcMain.handle(
    DESKTOP_CHANNELS.countMessages,
    (_event, query: MessageScopeQuery) => {
      return getMessageRepository()
        .countMessages(query)
    }
  )

  ipcMain.handle(
    DESKTOP_CHANNELS.importMessages,
    async (): Promise<ImportMessagesResult> => {
      const selection =
        await dialog.showOpenDialog({
          title: '导入 Wememo JSON 消息',
          properties: ['openFile'],
          filters: [
            {
              name: 'JSON',
              extensions: ['json']
            }
          ]
        })

      if (
        selection.canceled ||
        selection.filePaths.length === 0
      ) {
        return {
          canceled: true,
          total: 0,
          accepted: 0,
          rejected: 0,
          inserted: 0,
          duplicate: 0,
          errors: [],
          scopes:
            getMessageRepository()
              .listConversationScopes()
        }
      }

      const filePath =
        selection.filePaths[0]

      const text = readFileSync(
        filePath,
        'utf8'
      )

      const parsed =
        parseJsonImportDocument(text)

      const insertion =
        getMessageRepository()
          .insertMessages(parsed.messages)

      return {
        canceled: false,
        total: parsed.total,
        accepted: parsed.accepted,
        rejected: parsed.rejected,
        inserted: insertion.inserted,
        duplicate: insertion.duplicate,
        errors: parsed.errors,
        scopes:
          getMessageRepository()
            .listConversationScopes()
      }
    }
  )
}

function createWindow(): void {
  const mainWindow =
    new BrowserWindow({
      width: 960,
      height: 760,
      minWidth: 720,
      minHeight: 560,
      show: false,
      title: 'WeChat Relationship Agent',
      backgroundColor: '#eef1f1',

      webPreferences: {
        preload: join(
          __dirname,
          '../preload/index.js'
        ),

        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

  applicationWindow = mainWindow
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.on('closed', () => { applicationWindow = undefined })

  mainWindow.once(
    'ready-to-show',
    () => mainWindow.show()
  )

  if (
    process.env.ELECTRON_RENDERER_URL
  ) {
    void mainWindow.loadURL(
      process.env.ELECTRON_RENDERER_URL
    )
  } else {
    void mainWindow.loadFile(
      join(
        __dirname,
        '../renderer/index.html'
      )
    )
  }
}

void app.whenReady().then(() => {
  initializeDatabase()

  registerMessageIpc()

  createWindow()

  app.on('activate', () => {
    if (
      BrowserWindow
        .getAllWindows()
        .length === 0
    ) {
      createWindow()
    }
  })
})

app.on(
  'window-all-closed',
  () => {
    if (
      process.platform !== 'darwin'
    ) {
      app.quit()
    }
  }
)

app.on('before-quit', () => {
  database?.close()

  database = undefined
  messageRepository = undefined
})