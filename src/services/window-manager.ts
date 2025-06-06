import {BrowserWindow, screen} from 'electron';
import {join} from 'path';

// Declare Electron Forge Vite globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

export interface WindowConfig {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  frame?: boolean;
  alwaysOnTop?: boolean;
  transparent?: boolean;
  resizable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  closable?: boolean;
  skipTaskbar?: boolean;
  webPreferences?: Electron.WebPreferences;
}

export class WindowManager {
  private static instance: WindowManager;
  private windows: Map<string, BrowserWindow> = new Map();
  private mainWindow: BrowserWindow | null = null;

  private constructor() {}

  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  createPortalWindow(config: WindowConfig): BrowserWindow {
    const existingWindow = this.windows.get(config.id);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.focus();
      return existingWindow;
    }

    const window = new BrowserWindow({
      width: config.width,
      height: config.height,
      x: config.x,
      y: config.y,
      frame: config.frame ?? false,
      alwaysOnTop: config.alwaysOnTop ?? true,
      transparent: config.transparent ?? true,
      backgroundColor: config.transparent ? '#00000000' : undefined,
      resizable: config.resizable ?? true,
      minimizable: config.minimizable ?? false,
      maximizable: config.maximizable ?? false,
      closable: config.closable ?? true,
      skipTaskbar: config.skipTaskbar ?? true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js'),
        ...config.webPreferences,
      },
    });

    // Set visible on all workspaces for macOS
    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
    }

    // Load the appropriate HTML file for each portal type
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      // In development, load the specific HTML file from the dev server
      window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/${config.id}.html`);
    } else {
      // In production, load the built HTML file
      window.loadFile(join(__dirname, `../renderer/${config.id}/index.html`));
    }

    window.on('closed', () => {
      this.windows.delete(config.id);
    });

    this.windows.set(config.id, window);
    return window;
  }

  getWindow(id: string): BrowserWindow | undefined {
    return this.windows.get(id);
  }

  closeWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  closeAllPortalWindows(): void {
    this.windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.close();
      }
    });
    this.windows.clear();
  }

  // Predefined window configurations
  static getConfigs() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const {width: screenWidth} = primaryDisplay.workAreaSize;

    return {
      titlebar: {
        id: 'titlebar',
        width: screenWidth,
        height: 50,
        x: 0,
        y: 0,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        skipTaskbar: true,
      } as WindowConfig,

      transcript: {
        id: 'transcript',
        width: 400,
        height: 300,
        x: screenWidth - 420,
        y: 80,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        closable: true,
        skipTaskbar: true,
      } as WindowConfig,

      aiAssistant: {
        id: 'ai-assistant',
        width: 400,
        height: 500,
        x: screenWidth - 420,
        y: 100,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        closable: true,
        skipTaskbar: true,
      } as WindowConfig,
    };
  }
}

export default WindowManager;
