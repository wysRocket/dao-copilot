import {BrowserWindow, app, ipcMain} from 'electron';
import {join} from 'path';
import icon from '../../resources/icon.png?asset';

// Declare Electron Forge Vite globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Window types
export enum WindowType {
  MAIN = 'main',
  AI_ASSISTANT = 'ai-assistant',
}

// Window registry to keep track of all windows
const windows: Map<string, BrowserWindow> = new Map();

/**
 * Create a new window with the specified type
 */
export function createWindow(
  type: WindowType,
  options: Electron.BrowserWindowConstructorOptions = {},
): BrowserWindow {
  // Default window options
  const defaultOptions: Electron.BrowserWindowConstructorOptions = {
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? {icon} : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // Specific options based on window type
  const typeSpecificOptions: Record<
    WindowType,
    Electron.BrowserWindowConstructorOptions
  > = {
    [WindowType.MAIN]: {},
    [WindowType.AI_ASSISTANT]: {
      width: 400,
      height: 600,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      webPreferences: {
        ...defaultOptions.webPreferences,
      },
    },
  };

  // Merge options
  const mergedOptions = {
    ...defaultOptions,
    ...typeSpecificOptions[type],
    ...options,
  };

  // Create the browser window
  const window = new BrowserWindow(mergedOptions);

  // Store the window in the registry
  windows.set(type, window);

  // Load the appropriate URL
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?windowType=${type}`);
  } else {
    window.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      {
        hash: `windowType=${type}`,
      },
    );
  }

  // Show window when ready
  window.on('ready-to-show', () => {
    window.show();
  });

  // Remove from registry when closed
  window.on('closed', () => {
    windows.delete(type);
  });

  return window;
}

/**
 * Get a window by type
 */
export function getWindow(type: WindowType): BrowserWindow | undefined {
  return windows.get(type);
}

/**
 * Close a window by type
 */
export function closeWindow(type: WindowType): void {
  const window = windows.get(type);
  if (window && !window.isDestroyed()) {
    window.close();
    windows.delete(type);
  }
}

/**
 * Show a window by type
 */
export function showWindow(type: WindowType): void {
  const window = windows.get(type);
  if (window && !window.isDestroyed()) {
    window.show();
  } else {
    createWindow(type);
  }
}

/**
 * Hide a window by type
 */
export function hideWindow(type: WindowType): void {
  const window = windows.get(type);
  if (window && !window.isDestroyed()) {
    window.hide();
  }
}

/**
 * Toggle a window's visibility by type
 */
export function toggleWindow(type: WindowType): void {
  const window = windows.get(type);
  if (window && !window.isDestroyed()) {
    if (window.isVisible()) {
      window.hide();
    } else {
      window.show();
    }
  } else {
    createWindow(type);
  }
}

/**
 * Register IPC handlers for window management
 */
export function registerWindowManagerIPC(): void {
  ipcMain.handle('window:create', (_event, type: WindowType) => {
    createWindow(type);
  });

  ipcMain.handle('window:close', (_event, type: WindowType) => {
    closeWindow(type);
  });

  ipcMain.handle('window:show', (_event, type: WindowType) => {
    showWindow(type);
  });

  ipcMain.handle('window:hide', (_event, type: WindowType) => {
    hideWindow(type);
  });

  ipcMain.handle('window:toggle', (_event, type: WindowType) => {
    toggleWindow(type);
  });

  ipcMain.handle('window:isVisible', (_event, type: WindowType) => {
    const window = windows.get(type);
    return window && !window.isDestroyed() && window.isVisible();
  });
}