import {
  AUDIO_WRITE_FILE_CHANNEL,
  AUDIO_READ_FILE_CHANNEL,
  AUDIO_REQUEST_PERMISSIONS_CHANNEL,
} from './audio-channels';

export function exposeAudioContext() {
  const {contextBridge, ipcRenderer} = window.require('electron');

  // Expose nodeAPI following electron-audio-capture-with-stt pattern
  contextBridge.exposeInMainWorld('nodeAPI', {
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
