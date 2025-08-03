import {
  app,
  ipcMain,
  session,
  desktopCapturer,
  Tray,
  Menu,
  nativeImage,
  globalShortcut
} from 'electron'

import {electronApp, optimizer} from '@electron-toolkit/utils'

import {promises as fs} from 'fs'

import {createProxyServer, stopProxyServer} from './helpers/proxy-server'
import {loadEnvironmentConfig, validateEnvironmentConfig} from './helpers/environment-config'
import {initializeApiKeyManager} from './services/api-key-manager'
import WindowManager from './services/window-manager'
import registerListeners from './helpers/ipc/listeners-register'

// Add tray variable
let tray: Tray | null = null
let isShuttingDown = false

function safeLog(message: string): void {
  if (!isShuttingDown) {
    try {
      console.log(message)
    } catch {
      // Ignore logging errors during shutdown
    }
  }
}

async function performCleanup(): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  // Set a timeout to force quit if cleanup takes too long
  const forceQuitTimer = setTimeout(() => {
    try {
      console.log('Cleanup timeout - force quitting')
    } catch {
      // Ignore logging errors
    }
    process.exit(1)
  }, 5000)

  try {
    // Set shutdown state in WindowManager
    WindowManager.getInstance().setShuttingDown()

    // Stop proxy server
    await stopProxyServer()
    safeLog('Proxy server stopped')

    // Clean up WindowManager
    WindowManager.getInstance().cleanup()

    // Clean up global shortcuts
    globalShortcut.unregisterAll()

    // Clean up tray
    if (tray) {
      tray.destroy()
      tray = null
    }

    // Clear the force quit timer since cleanup completed
    clearTimeout(forceQuitTimer)
  } catch (error) {
    // Clear the force quit timer
    clearTimeout(forceQuitTimer)
    try {
      console.error('Error during cleanup:', error)
    } catch {
      // Ignore logging errors during shutdown
    }
  }
}

ipcMain.handle('writeFile', (_event, path, data): Promise<void> => {
  safeLog('writing file to ' + path)
  return fs.writeFile(path, data)
})

function createTray(windowManager: WindowManager) {
  // Create tray icon
  const icon = nativeImage.createFromPath('./resources/icon.png').resize({width: 16, height: 16})
  tray = new Tray(icon)

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show DAO Copilot',
      click: () => {
        const mainWindows = windowManager.getWindowsByType('main')
        if (mainWindows.length > 0) {
          windowManager.focusWindow(mainWindows[0].id)
        } else {
          createWindow()
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        WindowManager.getInstance().forceQuit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.setToolTip('DAO Copilot')

  // Handle tray icon click
  tray.on('click', () => {
    const mainWindows = windowManager.getWindowsByType('main')
    if (mainWindows.length > 0) {
      const mainWindow = mainWindows[0]
      if (mainWindow.window.isMinimized()) {
        mainWindow.window.restore()
      }
      mainWindow.window.focus()
    } else {
      createWindow()
    }
  })
}

function createWindow(): string {
  const windowManager = WindowManager.getInstance()

  // Create the main window using WindowManager
  const mainWindowId = windowManager.createWindow('main', {show: true})

  // Create tray if it doesn't exist
  if (!tray) {
    createTray(windowManager)
  }

  // Set up display media request handler
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({types: ['window', 'screen']}).then(sources => {
      // Grant access to the first screen found.
      callback({video: sources[0], audio: 'loopback'})
    })
  })

  return mainWindowId
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Load environment configuration first
  await loadEnvironmentConfig()

  // Initialize API key manager after environment is loaded
  try {
    initializeApiKeyManager()
    console.log('✅ API key manager initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize API key manager:', error)
  }

  // Validate that required environment variables are present
  const isConfigValid = validateEnvironmentConfig()
  if (!isConfigValid) {
    console.warn(
      '⚠️ Environment configuration issues detected. Transcription may not work properly.'
    )
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Register global IPC listeners once
  registerListeners()

  // Register global shortcuts

  // Register global shortcut to restore main window
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    safeLog('Global shortcut CommandOrControl+Shift+D triggered - focusing main window')
    const windowManager = WindowManager.getInstance()
    const mainWindows = windowManager.getWindowsByType('main')
    if (mainWindows.length > 0) {
      windowManager.focusWindow(mainWindows[0].id)
    } else {
      createWindow()
    }
  })

  // Register global shortcut for toggle assistant window visibility (⌘\ or Ctrl+\)
  // Focus stays on main window
  globalShortcut.register('CommandOrControl+\\', () => {
    safeLog('Global shortcut CommandOrControl+\\ triggered - toggling assistant')
    const windowManager = WindowManager.getInstance()
    windowManager.toggleAssistantWindow()
  })

  // Register global shortcut for AI assistant with dual focus (⌘Enter or Ctrl+Enter)
  // Toggles assistant window and coordinates focus with main window
  globalShortcut.register('CommandOrControl+Return', () => {
    safeLog('Global shortcut CommandOrControl+Return triggered - dual focus toggle')
    const windowManager = WindowManager.getInstance()
    windowManager.toggleAssistantWithDualFocus()
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Start proxy server (optional, for other API calls if needed)
  try {
    await createProxyServer()
    safeLog('Proxy server started successfully')
  } catch (error) {
    try {
      console.error('Failed to start proxy server:', error)
    } catch {
      // Ignore logging errors
    }
    // Don't fail the app if proxy server fails
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    const windowManager = WindowManager.getInstance()
    if (windowManager.getWindowsByType('main').length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  await performCleanup()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle app quit event
app.on('before-quit', async () => {
  await performCleanup()
})

// Handle unexpected process termination
process.on('SIGINT', async () => {
  await performCleanup()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await performCleanup()
  process.exit(0)
})

// Handle uncaught exceptions
process.on('uncaughtException', async error => {
  try {
    console.error('Uncaught exception:', error)
  } catch {
    // Ignore logging errors
  }
  await performCleanup()
  process.exit(1)
})

process.on('unhandledRejection', async (reason, promise) => {
  try {
    console.error('Unhandled rejection at:', promise, 'reason:', reason)
  } catch {
    // Ignore logging errors
  }
  await performCleanup()
  process.exit(1)
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
