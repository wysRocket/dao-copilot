import {contextBridge} from 'electron';
import {electronAPI} from '@electron-toolkit/preload';
import exposeContexts from './helpers/ipc/context-exposer';
// Custom APIs for renderer

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    // Check if electron API is already exposed
    const globalWindow = window as unknown as Record<string, unknown>;
    if (!globalWindow.electron) {
      contextBridge.exposeInMainWorld('electron', electronAPI);
    }

    // Expose all the contexts (including transcription)
    exposeContexts();

    // Note: Individual APIs (audioAPI, transcriptionAPI, etc.) are exposed
    // through the exposeContexts() call above. No need to duplicate them here.
  } catch (error) {
    console.error('Error in preload script:', error);
  }
} else {
  window.electron = electronAPI;
}
