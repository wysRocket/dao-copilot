import {contextBridge, ipcRenderer} from 'electron'
import {
  TRANSCRIPTION_TRANSCRIBE_CHANNEL,
  TRANSCRIPTION_TEST_STREAMING_CHANNEL
} from './transcription-channels'

export function exposeTranscriptionContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>
    if (!globalWindow.transcriptionAPI) {
      contextBridge.exposeInMainWorld('transcriptionAPI', {
        transcribeAudio: (audioData: Uint8Array) =>
          ipcRenderer.invoke(TRANSCRIPTION_TRANSCRIBE_CHANNEL, audioData),
        testStreamingIPC: () => ipcRenderer.invoke(TRANSCRIPTION_TEST_STREAMING_CHANNEL)
      })
    }
  } catch (error) {
    console.error('Error exposing transcription context:', error)
  }
}
