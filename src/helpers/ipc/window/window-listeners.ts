import {BrowserWindow, ipcMain, screen} from 'electron';
import {join} from 'path';
import {
  WIN_CLOSE_CHANNEL,
  WIN_MAXIMIZE_CHANNEL,
  WIN_MINIMIZE_CHANNEL,
  SHOW_TRANSCRIPT_WINDOW_CHANNEL,
  HIDE_TRANSCRIPT_WINDOW_CHANNEL,
  UPDATE_TRANSCRIPT_WINDOW_CHANNEL,
  CLOSE_TRANSCRIPT_WINDOW_CHANNEL,
  SHOW_AI_ASSISTANT_CHANNEL,
  TOGGLE_AI_ASSISTANT_CHANNEL,
  CREATE_PORTAL_WINDOW_CHANNEL,
  CLOSE_PORTAL_WINDOW_CHANNEL,
  SHOW_PORTAL_WINDOW_CHANNEL,
  HIDE_PORTAL_WINDOW_CHANNEL,
  FOCUS_PORTAL_WINDOW_CHANNEL,
} from './window-channels';
import {TranscriptionResult} from '../../../services/main-stt-transcription';
import WindowManager from '../../../services/window-manager';

// Declare Electron Forge Vite globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

export function addWindowEventListeners(mainWindow: BrowserWindow) {
  ipcMain.handle(WIN_MINIMIZE_CHANNEL, () => {
    mainWindow.minimize();
  });
  ipcMain.handle(WIN_MAXIMIZE_CHANNEL, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle(WIN_CLOSE_CHANNEL, () => {
    mainWindow.close();
  });
}

// Multi-window management
let transcriptWindow: BrowserWindow | null = null;

export function addMultiWindowEventListeners(mainWindow: BrowserWindow) {
  ipcMain.handle(SHOW_TRANSCRIPT_WINDOW_CHANNEL, () => {
    if (transcriptWindow && !transcriptWindow.isDestroyed()) {
      transcriptWindow.show();
      transcriptWindow.focus();
    } else {
      createTranscriptWindow();
    }
  });

  ipcMain.handle(HIDE_TRANSCRIPT_WINDOW_CHANNEL, () => {
    if (transcriptWindow && !transcriptWindow.isDestroyed()) {
      transcriptWindow.hide();
    }
  });

  ipcMain.handle(
    UPDATE_TRANSCRIPT_WINDOW_CHANNEL,
    (_event, transcripts: TranscriptionResult[], isProcessing: boolean) => {
      if (transcriptWindow && !transcriptWindow.isDestroyed()) {
        transcriptWindow.webContents.send('transcript-data', {
          transcripts,
          isProcessing,
        });
      }
    },
  );

  ipcMain.handle(CLOSE_TRANSCRIPT_WINDOW_CHANNEL, () => {
    if (transcriptWindow && !transcriptWindow.isDestroyed()) {
      transcriptWindow.close();
      transcriptWindow = null;
    }
  });

  // AI Assistant communication channels
  ipcMain.handle(SHOW_AI_ASSISTANT_CHANNEL, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-ai-assistant');
    }
  });

  ipcMain.handle(TOGGLE_AI_ASSISTANT_CHANNEL, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toggle-ai-assistant');
    }
  });

  // Legacy portal window management removed - now handled by addPortalWindowEventListeners
}

function createTranscriptWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const {width} = primaryDisplay.workAreaSize;

  transcriptWindow = new BrowserWindow({
    width: 400,
    height: 300,
    x: width - 420,
    y: 80,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  transcriptWindow.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});

  // Load the transcript window content
  if (
    process.env.NODE_ENV === 'development' &&
    MAIN_WINDOW_VITE_DEV_SERVER_URL
  ) {
    transcriptWindow.loadURL(
      `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/transcript.html`,
    );
  } else {
    transcriptWindow.loadFile(join(__dirname, '../transcript.html'));
  }

  transcriptWindow.on('closed', () => {
    transcriptWindow = null;
  });

  return transcriptWindow;
}

export function getTranscriptWindow() {
  return transcriptWindow;
}

// New Portal Window Management IPC Handlers
let portalWindowListenersRegistered = false;

export function addPortalWindowEventListeners() {
  // Prevent duplicate registration
  if (portalWindowListenersRegistered) {
    return;
  }
  portalWindowListenersRegistered = true;

  const windowManager = WindowManager.getInstance();

  // Create a portal window
  ipcMain.handle(CREATE_PORTAL_WINDOW_CHANNEL, (_event, windowId: string) => {
    const configs = WindowManager.getConfigs();
    const config = configs[windowId as keyof typeof configs];

    if (!config) {
      throw new Error(`Unknown window ID: ${windowId}`);
    }

    windowManager.createPortalWindow(config);
    return {success: true, windowId};
  });

  // Close a portal window
  ipcMain.handle(CLOSE_PORTAL_WINDOW_CHANNEL, (_event, windowId: string) => {
    windowManager.closeWindow(windowId);
    return {success: true};
  });

  // Show/focus a portal window (creates if doesn't exist)
  ipcMain.handle(SHOW_PORTAL_WINDOW_CHANNEL, (_event, windowId: string) => {
    const configs = WindowManager.getConfigs();
    const config = configs[windowId as keyof typeof configs];

    if (!config) {
      throw new Error(`Unknown window ID: ${windowId}`);
    }

    let window = windowManager.getWindow(windowId);
    if (!window || window.isDestroyed()) {
      window = windowManager.createPortalWindow(config);
    }

    window.show();
    window.focus();
    return {success: true};
  });

  // Hide a portal window
  ipcMain.handle(HIDE_PORTAL_WINDOW_CHANNEL, (_event, windowId: string) => {
    const window = windowManager.getWindow(windowId);
    if (window && !window.isDestroyed()) {
      window.hide();
    }
    return {success: true};
  });

  // Focus a portal window
  ipcMain.handle(FOCUS_PORTAL_WINDOW_CHANNEL, (_event, windowId: string) => {
    const window = windowManager.getWindow(windowId);
    if (window && !window.isDestroyed()) {
      window.focus();
    }
    return {success: true};
  });
}
