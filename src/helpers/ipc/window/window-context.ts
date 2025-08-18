import {WINDOW_GET_REF_CHANNEL} from './window-channels'
import {contextBridge, ipcRenderer} from 'electron'
import {
  WIN_MINIMIZE_CHANNEL,
  WIN_MAXIMIZE_CHANNEL,
  WIN_CLOSE_CHANNEL,
  WINDOW_CREATE_CHANNEL,
  WINDOW_SHOW_CHANNEL,
  WINDOW_HIDE_CHANNEL,
  WINDOW_FOCUS_CHANNEL,
  WINDOW_GET_ALL_CHANNEL,
  WINDOW_GET_INFO_CHANNEL,
  INTER_WINDOW_MESSAGE_CHANNEL,
  WINDOW_BROADCAST_CHANNEL,
  WINDOW_STATE_CHANGED_CHANNEL,
  WINDOW_INFO_CHANNEL
} from './window-channels'

export interface WindowInfo {
  windowId: string
  type: string
  isVisible: boolean
  config: any
}

export function exposeWindowContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>
    if (!globalWindow.electronWindow) {
      contextBridge.exposeInMainWorld('electronWindow', {
        // Existing window controls
        minimize: () => ipcRenderer.invoke(WIN_MINIMIZE_CHANNEL),
        maximize: () => ipcRenderer.invoke(WIN_MAXIMIZE_CHANNEL),
        close: () => ipcRenderer.invoke(WIN_CLOSE_CHANNEL),

        // Multi-window management
        createWindow: (type: string, config?: any) =>
          ipcRenderer.invoke(WINDOW_CREATE_CHANNEL, type, config),
        showWindow: (windowId: string) => ipcRenderer.invoke(WINDOW_SHOW_CHANNEL, windowId),
        hideWindow: (windowId: string) => ipcRenderer.invoke(WINDOW_HIDE_CHANNEL, windowId),
        focusWindow: (windowId: string) => ipcRenderer.invoke(WINDOW_FOCUS_CHANNEL, windowId),
        getAllWindows: () => ipcRenderer.invoke(WINDOW_GET_ALL_CHANNEL),
        getWindowInfo: (windowId?: string) => ipcRenderer.invoke(WINDOW_GET_INFO_CHANNEL, windowId),

        // Inter-window communication
        sendToWindow: (targetWindowId: string, channel: string, ...args: any[]) =>
          ipcRenderer.invoke(INTER_WINDOW_MESSAGE_CHANNEL, targetWindowId, channel, ...args),
        broadcast: (channel: string, ...args: any[]) =>
          ipcRenderer.invoke(WINDOW_BROADCAST_CHANNEL, channel, ...args),

        // Event listeners
        onWindowStateChanged: (callback: (windowInfo: WindowInfo) => void) => {
          const listener = (_event: any, windowInfo: WindowInfo) => callback(windowInfo)
          ipcRenderer.on(WINDOW_STATE_CHANGED_CHANNEL, listener)
          return () => ipcRenderer.removeListener(WINDOW_STATE_CHANGED_CHANNEL, listener)
        },

        onWindowInfo: (callback: (windowInfo: WindowInfo) => void) => {
          const listener = (_event: any, windowInfo: WindowInfo) => callback(windowInfo)
          ipcRenderer.on(WINDOW_INFO_CHANNEL, listener)
          return () => ipcRenderer.removeListener(WINDOW_INFO_CHANNEL, listener)
        },

        onInterWindowMessage: (callback: (channel: string, ...args: any[]) => void) => {
          const listener = (_event: any, channel: string, ...args: any[]) =>
            callback(channel, ...args)
          ipcRenderer.on('inter-window-message', listener)
          return () => ipcRenderer.removeListener('inter-window-message', listener)
        },

        // New: Get window reference/info (not a real Window object)
        getWindowReference: (windowId: string) =>
          ipcRenderer.invoke(WINDOW_GET_REF_CHANNEL, windowId)
      })
    }
  } catch (error) {
    console.error('Error exposing window context:', error)
  }
}
