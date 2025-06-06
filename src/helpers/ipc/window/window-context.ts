import {contextBridge, ipcRenderer} from 'electron';
import {
  WIN_MINIMIZE_CHANNEL,
  WIN_MAXIMIZE_CHANNEL,
  WIN_CLOSE_CHANNEL,
  SHOW_TRANSCRIPT_WINDOW_CHANNEL,
  HIDE_TRANSCRIPT_WINDOW_CHANNEL,
  UPDATE_TRANSCRIPT_WINDOW_CHANNEL,
  CLOSE_TRANSCRIPT_WINDOW_CHANNEL,
  SHOW_AI_ASSISTANT_CHANNEL,
  TOGGLE_AI_ASSISTANT_CHANNEL,
} from './window-channels';
import {TranscriptionResult} from '../../../services/main-stt-transcription';

export function exposeWindowContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>;
    if (!globalWindow.electronWindow) {
      contextBridge.exposeInMainWorld('electronWindow', {
        minimize: () => ipcRenderer.invoke(WIN_MINIMIZE_CHANNEL),
        maximize: () => ipcRenderer.invoke(WIN_MAXIMIZE_CHANNEL),
        close: () => ipcRenderer.invoke(WIN_CLOSE_CHANNEL),
        showTranscriptWindow: () =>
          ipcRenderer.invoke(SHOW_TRANSCRIPT_WINDOW_CHANNEL),
        hideTranscriptWindow: () =>
          ipcRenderer.invoke(HIDE_TRANSCRIPT_WINDOW_CHANNEL),
        updateTranscriptWindow: (
          transcripts: TranscriptionResult[],
          isProcessing: boolean,
        ) =>
          ipcRenderer.invoke(
            UPDATE_TRANSCRIPT_WINDOW_CHANNEL,
            transcripts,
            isProcessing,
          ),
        closeTranscriptWindow: () =>
          ipcRenderer.invoke(CLOSE_TRANSCRIPT_WINDOW_CHANNEL),
        showAIAssistant: () => ipcRenderer.invoke(SHOW_AI_ASSISTANT_CHANNEL),
        toggleAIAssistant: () =>
          ipcRenderer.invoke(TOGGLE_AI_ASSISTANT_CHANNEL),
      });
    }
  } catch (error) {
    console.error('Error exposing window context:', error);
  }
}
