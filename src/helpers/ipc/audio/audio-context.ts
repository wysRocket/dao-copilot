import {contextBridge, ipcRenderer} from 'electron';
import {
  AUDIO_WRITE_FILE_CHANNEL,
  AUDIO_READ_FILE_CHANNEL,
  AUDIO_REQUEST_PERMISSIONS_CHANNEL,
} from './audio-channels';

export function exposeAudioContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>;
    if (!globalWindow.audioAPI) {
      contextBridge.exposeInMainWorld('audioAPI', {
        bufferAlloc: (size: number) => Buffer.alloc(size),
        writeFile: (path: string, data: Uint8Array) => {
          return ipcRenderer.invoke(AUDIO_WRITE_FILE_CHANNEL, path, data);
        },
        readFile: (path: string) => {
          return ipcRenderer.invoke(AUDIO_READ_FILE_CHANNEL, path);
        },
        requestAudioPermissions: () => {
          return ipcRenderer.invoke(AUDIO_REQUEST_PERMISSIONS_CHANNEL);
        },
      });
    }
  } catch (error) {
    console.error('Error exposing audio context:', error);
  }
}
