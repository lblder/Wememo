export type DesktopPlatform = 'darwin' | 'linux' | 'win32' | 'unknown'


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
 
export interface DesktopApi {
  getPlatform: () => DesktopPlatform
}

