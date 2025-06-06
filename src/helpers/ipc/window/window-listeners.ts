import {BrowserWindow, ipcMain} from 'electron';
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
} from './window-channels';
import WindowManager, {WindowType} from '../../../services/window-manager';

export function addWindowEventListeners(_mainWindow: BrowserWindow) {
  const windowManager = WindowManager.getInstance();

  // Existing window controls - operate on the current window
  ipcMain.handle(WIN_MINIMIZE_CHANNEL, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.minimize();
    }
  });

  ipcMain.handle(WIN_MAXIMIZE_CHANNEL, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  });

  ipcMain.handle(WIN_CLOSE_CHANNEL, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.close();
    }
  });

  // Multi-window management
  ipcMain.handle(
    WINDOW_CREATE_CHANNEL,
    (_event, type: WindowType, config?: any) => {
      return windowManager.createWindow(type, config);
    },
  );

  ipcMain.handle(WINDOW_SHOW_CHANNEL, (_event, windowId: string) => {
    windowManager.showWindow(windowId);
  });

  ipcMain.handle(WINDOW_HIDE_CHANNEL, (_event, windowId: string) => {
    windowManager.hideWindow(windowId);
  });

  ipcMain.handle(WINDOW_FOCUS_CHANNEL, (_event, windowId: string) => {
    windowManager.focusWindow(windowId);
  });

  ipcMain.handle(WINDOW_GET_ALL_CHANNEL, () => {
    return windowManager.getAllWindows().map((state: any) => ({
      windowId: state.id,
      type: state.type,
      isVisible: state.isVisible,
      config: state.config,
    }));
  });

  ipcMain.handle(WINDOW_GET_INFO_CHANNEL, (event, windowId?: string) => {
    if (windowId) {
      const window = windowManager.getWindow(windowId);
      if (window) {
        const state = windowManager
          .getAllWindows()
          .find((s: any) => s.id === windowId);
        return state
          ? {
              windowId: state.id,
              type: state.type,
              isVisible: state.isVisible,
              config: state.config,
            }
          : null;
      }
    } else {
      // Get info for current window
      const currentWindow = BrowserWindow.fromWebContents(event.sender);
      if (currentWindow) {
        const state = windowManager
          .getAllWindows()
          .find((s: any) => s.window === currentWindow);
        return state
          ? {
              windowId: state.id,
              type: state.type,
              isVisible: state.isVisible,
              config: state.config,
            }
          : null;
      }
    }
    return null;
  });

  // Inter-window communication
  ipcMain.handle(
    INTER_WINDOW_MESSAGE_CHANNEL,
    (_event, targetWindowId: string, channel: string, ...args: any[]) => {
      windowManager.sendToWindow(
        targetWindowId,
        'inter-window-message',
        channel,
        ...args,
      );
    },
  );

  ipcMain.handle(
    WINDOW_BROADCAST_CHANNEL,
    (_event, channel: string, ...args: any[]) => {
      windowManager.broadcastToAllWindows(
        'inter-window-message',
        channel,
        ...args,
      );
    },
  );
}
