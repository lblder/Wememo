import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

/**
 * Electron 主进程入口。
 *
 * 主要职责：
 * - 管理 Electron 应用生命周期。
 * - 创建并配置主窗口。
 * - 指定 Preload 安全桥接脚本。
 * - 根据开发/生产环境加载 Renderer 页面。
 *
 * Renderer 不应在此处实现 UI 业务逻辑；
 * Main 进程负责系统级能力和高权限操作。
 *
 * @author liang
 * @created 2026-09-09
 */

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'WeChat Relationship Agent',
    backgroundColor: '#eef1f1',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

