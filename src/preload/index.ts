import { contextBridge } from 'electron'
//contextBridge 是 Electron 提供的能力，用来：
//  在 Preload 和 Renderer 之间安全地暴露少量 API。

/**
 * Electron Preload 安全桥接层。
 *
 * 主要职责：
 * - 实现 DesktopApi 契约。
 * - 向 Renderer 安全地暴露最小必要的桌面能力。
 *
 * Renderer 不应直接获得 Electron、Node.js、文件系统
 * 或 unrestricted ipcRenderer 等高权限能力。
  *
 * @author liang
 * @created 2026-09-09
 */
 
import type { DesktopApi, DesktopPlatform } from '../shared/desktop-api'

const supportedPlatforms = new Set<DesktopPlatform>(['darwin', 'linux', 'win32'])
const platform = supportedPlatforms.has(process.platform as DesktopPlatform)
  ? (process.platform as DesktopPlatform)
  : 'unknown'

const desktopApi: DesktopApi = Object.freeze({
  getPlatform: () => platform
})

contextBridge.exposeInMainWorld('desktop', desktopApi)

