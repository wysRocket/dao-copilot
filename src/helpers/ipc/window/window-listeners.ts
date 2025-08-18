// Window reference info (not a real Window object, just info/proxy)
ipcMain.handle(WINDOW_GET_REF_CHANNEL, (_event, windowId: string) => {
  const state = windowManager.getAllWindows().find(s => s.id === windowId)
  if (state) {
    return {
      windowId: state.id,
      type: state.type,
      isVisible: state.isVisible,
      config: state.config
    }
  }
  return null
})
import {BrowserWindow, ipcMain} from 'electron'
import {
  WIN_CLOSE_CHANNEL,
  WIN_MAXIMIZE_CHANNEL,
  WIN_MINIMIZE_CHANNEL,
  WINDOW_CREATE_CHANNEL,
  WINDOW_SHOW_CHANNEL,
  WINDOW_HIDE_CHANNEL,
  WINDOW_FOCUS_CHANNEL,
  WINDOW_GET_ALL_CHANNEL,
  WINDOW_GET_INFO_CHANNEL,
  INTER_WINDOW_MESSAGE_CHANNEL,
  WINDOW_BROADCAST_CHANNEL,
  WINDOW_GET_REF_CHANNEL
} from './window-channels'
import WindowManager, {WindowType, WindowConfig} from '../../../services/window-manager'

export function addWindowEventListeners() {
  const windowManager = WindowManager.getInstance()

  // Window reference info (not a real Window object, just info/proxy)
  // Remove any existing handler first to prevent duplicate registration
  try {
    ipcMain.removeHandler(WINDOW_GET_REF_CHANNEL)
  } catch {
    // Handler might not exist yet, ignore
  }

  ipcMain.handle(WINDOW_GET_REF_CHANNEL, (_event, windowId: string) => {
    const state = windowManager.getAllWindows().find(s => s.id === windowId)
    if (state) {
      return {
        windowId: state.id,
        type: state.type,
        isVisible: state.isVisible,
        config: state.config
      }
    }
    return null
  })

  // Existing window controls - operate on the current window
  ipcMain.handle(WIN_MINIMIZE_CHANNEL, event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.minimize()
    }
  })

  ipcMain.handle(WIN_MAXIMIZE_CHANNEL, event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.handle(WIN_CLOSE_CHANNEL, event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.close()
    }
  })

  // Multi-window management
  ipcMain.handle(
    WINDOW_CREATE_CHANNEL,
    (_event, type: WindowType, config?: Partial<WindowConfig>) => {
      return windowManager.createWindow(type, config)
    }
  )

  ipcMain.handle(WINDOW_SHOW_CHANNEL, (_event, windowId: string) => {
    windowManager.showWindow(windowId)
  })

  ipcMain.handle(WINDOW_HIDE_CHANNEL, (_event, windowId: string) => {
    windowManager.hideWindow(windowId)
  })

  ipcMain.handle(WINDOW_FOCUS_CHANNEL, (_event, windowId: string) => {
    windowManager.focusWindow(windowId)
  })

  ipcMain.handle(WINDOW_GET_ALL_CHANNEL, () => {
    return windowManager.getAllWindows().map(state => ({
      windowId: state.id,
      type: state.type,
      isVisible: state.isVisible,
      config: state.config
    }))
  })

  ipcMain.handle(WINDOW_GET_INFO_CHANNEL, (event, windowId?: string) => {
    if (windowId) {
      const window = windowManager.getWindow(windowId)
      if (window) {
        const state = windowManager.getAllWindows().find(s => s.id === windowId)
        return state
          ? {
              windowId: state.id,
              type: state.type,
              isVisible: state.isVisible,
              config: state.config
            }
          : null
      }
    } else {
      // Get info for current window
      const currentWindow = BrowserWindow.fromWebContents(event.sender)
      if (currentWindow) {
        const state = windowManager.getAllWindows().find(s => s.window === currentWindow)
        return state
          ? {
              windowId: state.id,
              type: state.type,
              isVisible: state.isVisible,
              config: state.config
            }
          : null
      }
    }
    return null
  })

  // Inter-window communication
  ipcMain.handle(
    INTER_WINDOW_MESSAGE_CHANNEL,
    (_event, targetWindowId: string, channel: string, ...args: unknown[]) => {
      windowManager.sendToWindow(targetWindowId, 'inter-window-message', channel, ...args)
    }
  )

  ipcMain.handle(WINDOW_BROADCAST_CHANNEL, (_event, channel: string, ...args: unknown[]) => {
    windowManager.broadcastToAllWindows('inter-window-message', channel, ...args)
  })
}
