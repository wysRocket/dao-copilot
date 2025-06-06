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
} from './window-channels';
import {TranscriptionResult} from '../../../services/main-stt-transcription';

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
