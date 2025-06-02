import {contextBridge, ipcRenderer} from 'electron';
import {
  WIN_MINIMIZE_CHANNEL,
  WIN_MAXIMIZE_CHANNEL,
  WIN_CLOSE_CHANNEL,
} from './window-channels';

export function exposeWindowContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>;
    if (!globalWindow.electronWindow) {
      contextBridge.exposeInMainWorld('electronWindow', {
        minimize: () => ipcRenderer.invoke(WIN_MINIMIZE_CHANNEL),
        maximize: () => ipcRenderer.invoke(WIN_MAXIMIZE_CHANNEL),
        close: () => ipcRenderer.invoke(WIN_CLOSE_CHANNEL),
      });
    }
  } catch (error) {
    console.error('Error exposing window context:', error);
  }
}
