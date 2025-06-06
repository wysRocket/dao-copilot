import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
} from 'electron';
import {join} from 'path';
import {electronApp, optimizer} from '@electron-toolkit/utils';
import icon from '../resources/icon.png';
import {promises as fs} from 'fs';
import registerListeners from './helpers/ipc/listeners-register';
import {createProxyServer, stopProxyServer} from './helpers/proxy-server';
import {
  loadEnvironmentConfig,
  validateEnvironmentConfig,
} from './helpers/environment-config';
import WindowManager from './services/window-manager';

// Declare Electron Forge Vite globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Global window references
let mainWindow: BrowserWindow | null = null;
const windowManager = WindowManager.getInstance();

ipcMain.handle('writeFile', (_event, path, data): Promise<void> => {
  console.log('writing file to ' + path);
  return fs.writeFile(path, data);
});

function createWindow(): void {
  // Create the main content window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset', // Use native title bar for main window
    ...(process.platform === 'linux' ? {icon} : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Initialize WindowManager with main window
  windowManager.setMainWindow(mainWindow);

  // Create title bar portal window immediately
  const titleBarConfig = WindowManager.getConfigs().titlebar;
  windowManager.createPortalWindow(titleBarConfig);

  // Register all IPC listeners
  registerListeners(mainWindow);

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({types: ['window', 'screen']})
      .then((sources) => {
        // Grant access to the first screen found.
        callback({video: sources[0], audio: 'loopback'});
      });
  });

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
    // Title bar window is now managed by WindowManager
    const titleBarWindow = windowManager.getWindow('titlebar');
    if (titleBarWindow && !titleBarWindow.isDestroyed()) {
      titleBarWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return {action: 'deny'};
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Load environment configuration first
  await loadEnvironmentConfig();

  // Validate that required environment variables are present
  const isConfigValid = validateEnvironmentConfig();
  if (!isConfigValid) {
    console.warn(
      '⚠️ Environment configuration issues detected. Transcription may not work properly.',
    );
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Start proxy server (optional, for other API calls if needed)
  try {
    await createProxyServer();
    console.log('Proxy server started successfully');
  } catch (error) {
    console.error('Failed to start proxy server:', error);
    // Don't fail the app if proxy server fails
  }

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  // Stop proxy server when app is closing
  try {
    await stopProxyServer();
    console.log('Proxy server stopped');
  } catch (error) {
    console.error('Error stopping proxy server:', error);
  }

  // Close all portal windows managed by WindowManager
  windowManager.closeAllPortalWindows();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app quit event
app.on('before-quit', async () => {
  try {
    await stopProxyServer();
  } catch (error) {
    console.error('Error stopping proxy server on quit:', error);
  }

  // Close all portal windows managed by WindowManager
  windowManager.closeAllPortalWindows();
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
