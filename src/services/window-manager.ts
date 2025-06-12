import {BrowserWindow, app, shell} from 'electron';
import {join} from 'path';
import icon from '../../resources/icon.png';

export type WindowType = 'main' | 'assistant';

export interface WindowConfig {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  x?: number;
  y?: number;
  show?: boolean;
  frame?: boolean;
  transparent?: boolean;
  alwaysOnTop?: boolean;
  resizable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  closable?: boolean;
  skipTaskbar?: boolean;
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover';
}

interface WindowState {
  id: string;
  type: WindowType;
  window: BrowserWindow;
  isVisible: boolean;
  config: WindowConfig;
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export class WindowManager {
  private static instance: WindowManager;
  private windows: Map<string, WindowState> = new Map();
  private windowConfigs: Record<WindowType, WindowConfig> = {
    main: {
      width: 900,
      height: 670,
      minWidth: 400,
      minHeight: 300,
      show: false,
      resizable: true,
      minimizable: true,
      maximizable: true,
      closable: true,
      frame: false,
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
    },
  };

  private constructor() {}

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  public createWindow(
    type: WindowType,
    customConfig?: Partial<WindowConfig>,
  ): string {
    const config = {...this.windowConfigs[type], ...customConfig};
    const windowId = `${type}-${Date.now()}`;

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
        additionalArguments: [
          `--window-type=${type}`,
          `--window-id=${windowId}`,
        ],
      },
    });

    // Handle window events
    this.setupWindowEvents(browserWindow, windowId, type);

    // Load the renderer content
    this.loadWindowContent(browserWindow, type);

    // Store window state
    const windowState: WindowState = {
      id: windowId,
      type,
      window: browserWindow,
      isVisible: config.show ?? false,
      config,
    };

    this.windows.set(windowId, windowState);

    return windowId;
  }

  public getWindow(windowId: string): BrowserWindow | null {
    const windowState = this.windows.get(windowId);
    return windowState ? windowState.window : null;
  }

  public getWindowsByType(type: WindowType): WindowState[] {
    return Array.from(this.windows.values()).filter(
      (state) => state.type === type,
    );
  }

  public showWindow(windowId: string): void {
    const windowState = this.windows.get(windowId);
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.show();
      windowState.window.focus();
      windowState.isVisible = true;
    }
  }

  public hideWindow(windowId: string): void {
    const windowState = this.windows.get(windowId);
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.hide();
      windowState.isVisible = false;
    }
  }

  public closeWindow(windowId: string): void {
    const windowState = this.windows.get(windowId);
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.close();
    }
  }

  public focusWindow(windowId: string): void {
    const windowState = this.windows.get(windowId);
    if (windowState && !windowState.window.isDestroyed()) {
      if (windowState.window.isMinimized()) {
        windowState.window.restore();
      }
      windowState.window.focus();
    }
  }

  public getAllWindows(): WindowState[] {
    return Array.from(this.windows.values()).filter(
      (state) => !state.window.isDestroyed(),
    );
  }

  public broadcastToAllWindows(channel: string, ...args: unknown[]): void {
    this.getAllWindows().forEach((state) => {
      if (!state.window.isDestroyed()) {
        state.window.webContents.send(channel, ...args);
      }
    });
  }

  public sendToWindow(
    windowId: string,
    channel: string,
    ...args: unknown[]
  ): void {
    const windowState = this.windows.get(windowId);
    if (windowState && !windowState.window.isDestroyed()) {
      windowState.window.webContents.send(channel, ...args);
    }
  }

  public getMainWindow(): BrowserWindow | null {
    const mainWindows = this.getWindowsByType('main');
    return mainWindows.length > 0 ? mainWindows[0].window : null;
  }

  private setupWindowEvents(
    browserWindow: BrowserWindow,
    windowId: string,
    type: WindowType,
  ): void {
    browserWindow.on('ready-to-show', () => {
      const windowState = this.windows.get(windowId);
      if (windowState?.config.show) {
        browserWindow.show();
        windowState.isVisible = true;
      }
    });

    browserWindow.on('closed', () => {
      this.windows.delete(windowId);

      // If this was the main window and it's the last window, quit the app
      if (type === 'main' && this.getWindowsByType('main').length === 0) {
        if (process.platform !== 'darwin') {
          app.quit();
        }
      }
    });

    browserWindow.on('show', () => {
      const windowState = this.windows.get(windowId);
      if (windowState) {
        windowState.isVisible = true;
      }
    });

    browserWindow.on('hide', () => {
      const windowState = this.windows.get(windowId);
      if (windowState) {
        windowState.isVisible = false;
      }
    });

    browserWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return {action: 'deny'};
    });

    // Send window info to renderer once ready
    browserWindow.webContents.once('did-finish-load', () => {
      browserWindow.webContents.send('window-info', {
        windowId,
        type,
        config: this.windows.get(windowId)?.config,
      });
    });
  }

  private loadWindowContent(
    browserWindow: BrowserWindow,
    type: WindowType,
  ): void {
    // For development, load the dev server URL with window type parameter
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      url.searchParams.set('windowType', type);
      browserWindow.loadURL(url.toString());
    } else {
      // For production, load the built HTML file
      browserWindow.loadFile(
        join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        {
          search: `windowType=${type}`,
        },
      );
    }
  }

  public cleanup(): void {
    this.getAllWindows().forEach((state) => {
      if (!state.window.isDestroyed()) {
        state.window.close();
      }
    });
    this.windows.clear();
  }
}

export default WindowManager;
