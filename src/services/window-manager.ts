import {BrowserWindow, app, shell} from 'electron'
import {join} from 'path'
import icon from '../../resources/icon.png'

export type WindowType = 'main' | 'assistant'

export interface WindowConfig {
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  x?: number
  y?: number
  show?: boolean
  frame?: boolean
  transparent?: boolean
  alwaysOnTop?: boolean
  resizable?: boolean
  minimizable?: boolean
  maximizable?: boolean
  closable?: boolean
  skipTaskbar?: boolean
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
}

interface WindowState {
  id: string
  type: WindowType
  window: BrowserWindow
  isVisible: boolean
  config: WindowConfig
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

export class WindowManager {
  private static instance: WindowManager
  private windows: Map<string, WindowState> = new Map()
  private windowConfigs: Record<WindowType, WindowConfig> = {
    main: {
      width: 900,
      height: 100,
      minWidth: 400,
      minHeight: 100,
      show: false,
      resizable: true,
      minimizable: true,
      maximizable: true,
      closable: true,
      frame: false
    },
    assistant: {
      width: 900,
      height: 600,
      minWidth: 300,
      minHeight: 400,
      show: false,
      resizable: true,
      minimizable: true,
      maximizable: false,
      closable: true,
      alwaysOnTop: false,
      frame: false,
      transparent: true
    }
  }

  private constructor() {}

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager()
    }
    return WindowManager.instance
  }

  public createWindow(type: WindowType, customConfig?: Partial<WindowConfig>): string {
    const config = {...this.windowConfigs[type], ...customConfig}
    const windowId = `${type}-${Date.now()}`

    const browserWindow = new BrowserWindow({
      width: config.width,
      height: config.height,
      minWidth: config.minWidth,
      minHeight: config.minHeight,
      maxWidth: config.maxWidth,
      maxHeight: config.maxHeight,
      x: config.x,
      y: config.y,
      show: config.show ?? false,
      frame: config.frame ?? true,
      transparent: config.transparent ?? false,
      alwaysOnTop: config.alwaysOnTop ?? false,
      resizable: config.resizable ?? true,
      minimizable: config.minimizable ?? true,
      maximizable: config.maximizable ?? true,
      closable: config.closable ?? true,
      skipTaskbar: config.skipTaskbar ?? false,
      titleBarStyle: config.titleBarStyle,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? {icon} : {}),
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments: [`--window-type=${type}`, `--window-id=${windowId}`]
      }
    })

    // Handle window events
    this.setupWindowEvents(browserWindow, windowId, type)

    // Load the renderer content
    this.loadWindowContent(browserWindow, type)

    // Store window state
    const windowState: WindowState = {
      id: windowId,
      type,
      window: browserWindow,
      isVisible: config.show ?? false,
      config
    }

    this.windows.set(windowId, windowState)

    return windowId
  }

  public getWindow(windowId: string): BrowserWindow | null {
    const windowState = this.windows.get(windowId)
    return windowState ? windowState.window : null
  }

  public getWindowsByType(type: WindowType): WindowState[] {
    return Array.from(this.windows.values()).filter(state => state.type === type)
  }

  public showWindow(windowId: string): void {
    const windowState = this.windows.get(windowId)
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.show()
      windowState.window.focus()
      windowState.isVisible = true
    }
  }

  public showWindowWithoutFocus(windowId: string): void {
    const windowState = this.windows.get(windowId)
    if (windowState && !windowState.window.isDestroyed()) {
      // Try to use showInactive if available, otherwise use show and immediately blur
      if (typeof windowState.window.showInactive === 'function') {
        windowState.window.showInactive()
      } else {
        windowState.window.show()
        // Don't call focus, which will keep focus on the current window
      }
      windowState.isVisible = true
    }
  }

  public toggleAssistantWindow(): void {
    const assistantWindows = this.getWindowsByType('assistant')
    if (assistantWindows.length > 0) {
      const assistantWindow = assistantWindows[0]
      if (assistantWindow.window.isVisible()) {
        this.hideWindow(assistantWindow.id)
      } else {
        this.showWindowWithoutFocus(assistantWindow.id)
      }
    } else {
      // Create new assistant window without focusing
      const windowId = this.createWindow('assistant', { show: true })
      // The window will show but we won't focus it since showWindowWithoutFocus wasn't called
      this.hideWindow(windowId) // Hide first
      this.showWindowWithoutFocus(windowId) // Then show without focus
    }
  }

  public toggleAssistantWithDualFocus(): void {
    const assistantWindows = this.getWindowsByType('assistant')
    const mainWindows = this.getWindowsByType('main')
    
    if (assistantWindows.length > 0) {
      const assistantWindow = assistantWindows[0]
      if (assistantWindow.window.isVisible()) {
        // Hide assistant window
        this.hideWindow(assistantWindow.id)
      } else {
        // Show assistant window and focus both windows
        this.showWindow(assistantWindow.id)
        if (mainWindows.length > 0) {
          setTimeout(() => {
            this.focusWindow(mainWindows[0].id)
          }, 100)
        }
      }
    } else {
      // Create new assistant window and focus both
      this.createWindow('assistant', { show: true })
      if (mainWindows.length > 0) {
        setTimeout(() => {
          this.focusWindow(mainWindows[0].id)
        }, 200)
      }
    }
  }

  public hideWindow(windowId: string): void {
    const windowState = this.windows.get(windowId)
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.hide()
      windowState.isVisible = false
    }
  }

  public closeWindow(windowId: string): void {
    const windowState = this.windows.get(windowId)
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.close()
    }
  }

  public focusWindow(windowId: string): void {
    const windowState = this.windows.get(windowId)
    if (windowState && !windowState.window.isDestroyed()) {
      console.log(
        `Focusing window ${windowId}, isMinimized: ${windowState.window.isMinimized()}, isVisible: ${windowState.window.isVisible()}`
      )

      if (windowState.window.isMinimized()) {
        console.log('Restoring minimized window')
        windowState.window.restore()
      }

      if (!windowState.window.isVisible()) {
        console.log('Showing hidden window')
        windowState.window.show()
      }

      windowState.window.focus()
      windowState.isVisible = true

      console.log(`Window ${windowId} should now be focused`)
    } else {
      console.log(`Cannot focus window ${windowId}: ${windowState ? 'destroyed' : 'not found'}`)
    }
  }

  public getAllWindows(): WindowState[] {
    return Array.from(this.windows.values()).filter(state => !state.window.isDestroyed())
  }

  public broadcastToAllWindows(channel: string, ...args: unknown[]): void {
    this.getAllWindows().forEach(state => {
      if (!state.window.isDestroyed()) {
        state.window.webContents.send(channel, ...args)
      }
    })
  }

  public sendToWindow(windowId: string, channel: string, ...args: unknown[]): void {
    const windowState = this.windows.get(windowId)
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.webContents.send(channel, ...args)
    }
  }

  public getMainWindow(): BrowserWindow | null {
    const mainWindows = this.getWindowsByType('main')
    return mainWindows.length > 0 ? mainWindows[0].window : null
  }

  private setupWindowEvents(
    browserWindow: BrowserWindow,
    windowId: string,
    type: WindowType
  ): void {
    browserWindow.on('ready-to-show', () => {
      const windowState = this.windows.get(windowId)
      if (windowState?.config.show) {
        browserWindow.show()
        windowState.isVisible = true
      }
    })

    browserWindow.on('closed', () => {
      this.windows.delete(windowId)

      // If this was the main window and it's the last window, quit the app
      if (type === 'main' && this.getWindowsByType('main').length === 0) {
        if (process.platform !== 'darwin') {
          app.quit()
        }
      }
    })

    browserWindow.on('show', () => {
      const windowState = this.windows.get(windowId)
      if (windowState) {
        windowState.isVisible = true
      }
    })

    browserWindow.on('hide', () => {
      const windowState = this.windows.get(windowId)
      if (windowState) {
        windowState.isVisible = false
      }
    })

    // Add minimize and restore event handlers
    browserWindow.on('minimize', () => {
      const windowState = this.windows.get(windowId)
      if (windowState) {
        windowState.isVisible = false
      }
      console.log(`Window ${windowId} minimized`)
    })

    browserWindow.on('restore', () => {
      const windowState = this.windows.get(windowId)
      if (windowState) {
        windowState.isVisible = true
      }
      console.log(`Window ${windowId} restored`)
    })

    // Prevent main window from closing, minimize instead
    if (type === 'main') {
      browserWindow.on('close', event => {
        event.preventDefault()
        browserWindow.minimize()
        console.log('Main window close prevented, minimizing instead')
      })
    }

    browserWindow.webContents.setWindowOpenHandler(details => {
      shell.openExternal(details.url)
      return {action: 'deny'}
    })

    // Send window info to renderer once ready
    browserWindow.webContents.once('did-finish-load', () => {
      browserWindow.webContents.send('window-info', {
        windowId,
        type,
        config: this.windows.get(windowId)?.config
      })
    })
  }

  private loadWindowContent(browserWindow: BrowserWindow, type: WindowType): void {
    // For development, load the dev server URL with window type parameter
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      url.searchParams.set('windowType', type)
      browserWindow.loadURL(url.toString())
    } else {
      // For production, load the built HTML file
      browserWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
        search: `windowType=${type}`
      })
    }
  }

  public cleanup(): void {
    this.getAllWindows().forEach(state => {
      if (!state.window.isDestroyed()) {
        state.window.close()
      }
    })
    this.windows.clear()
  }
}

export default WindowManager
