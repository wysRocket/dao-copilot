import {contextBridge, ipcRenderer} from 'electron'
import {
  AUDIO_WRITE_FILE_CHANNEL,
  AUDIO_READ_FILE_CHANNEL,
  AUDIO_REQUEST_PERMISSIONS_CHANNEL
} from './audio-channels'
import {initializeRendererAudioCapture} from '../../../services/audio-capture-renderer'

export function exposeAudioContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>
    if (!globalWindow.audioAPI) {
      // Initialize renderer audio capture service
      const rendererAudioCapture = initializeRendererAudioCapture()

      contextBridge.exposeInMainWorld('audioAPI', {
        bufferAlloc: (size: number) => Buffer.alloc(size),
        writeFile: (path: string, data: Uint8Array) => {
          return ipcRenderer.invoke(AUDIO_WRITE_FILE_CHANNEL, path, data)
        },
        readFile: (path: string) => {
          return ipcRenderer.invoke(AUDIO_READ_FILE_CHANNEL, path)
        },
        requestAudioPermissions: () => {
          return ipcRenderer.invoke(AUDIO_REQUEST_PERMISSIONS_CHANNEL)
        },
        // New audio capture methods
        capture: {
          isCapturing: () => rendererAudioCapture.isCapturing()
          // Note: startCapture and stopCapture are handled via IPC from main process
          // These methods are exposed for status checking only
        }
      })
    }
  } catch (error) {
    console.error('Error exposing audio context:', error)
  }
}
