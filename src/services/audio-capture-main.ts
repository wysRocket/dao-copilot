/**
 * Audio Capture Service for Electron Main Process
 *
 * This service runs in the main process and coordinates audio capture
 * with the renderer process where AudioContext is available.
 */

import {EventEmitter} from 'events'
import {ipcMain, BrowserWindow} from 'electron'

export interface AudioCaptureConfig {
  sampleRate?: number
  channels?: number
  bufferSize?: number
  intervalSeconds?: number
}

export interface AudioChunkData {
  buffer: number[]
  timestamp: number
  sampleRate: number
  channels: number
}

/**
 * Main process audio capture coordinator
 * Delegates actual audio capture to renderer process
 */
export class MainProcessAudioCapture extends EventEmitter {
  private capturing = false
  private captureWindow: BrowserWindow | null = null
  private config: AudioCaptureConfig

  constructor(config: AudioCaptureConfig = {}) {
    super()
    this.config = {
      sampleRate: 44100,
      channels: 1,
      bufferSize: 4096,
      intervalSeconds: 10,
      ...config
    }

    this.setupIPCHandlers()
  }

  /**
   * Set up IPC communication with renderer process
   */
  private setupIPCHandlers(): void {
    // Handle audio chunk data from renderer
    ipcMain.on('audio-chunk-data', (event, chunkData: AudioChunkData) => {
      this.emit('audioChunk', chunkData)
    })

    // Handle audio capture errors from renderer
    ipcMain.on('audio-capture-error', (event, error: string) => {
      console.error('Audio capture error from renderer:', error)
      this.emit('error', new Error(error))
    })

    // Handle audio capture state changes
    ipcMain.on('audio-capture-state', (event, state: {isCapturing: boolean}) => {
      this.capturing = state.isCapturing
      this.emit('stateChange', state)
    })
  }

  /**
   * Start audio capture via renderer process
   */
  async startCapture(targetWindow?: BrowserWindow): Promise<void> {
    if (this.capturing) {
      console.log('Audio capture already in progress')
      return
    }

    // Use provided window or get focused window
    this.captureWindow = targetWindow || BrowserWindow.getFocusedWindow()

    if (!this.captureWindow) {
      throw new Error('No browser window available for audio capture')
    }

    try {
      // Send start capture message to renderer
      this.captureWindow.webContents.send('start-audio-capture', this.config)

      console.log('Audio capture start request sent to renderer process')
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      throw error
    }
  }

  /**
   * Stop audio capture
   */
  async stopCapture(): Promise<void> {
    if (!this.capturing || !this.captureWindow) {
      console.log('No audio capture in progress')
      return
    }

    try {
      // Send stop capture message to renderer
      this.captureWindow.webContents.send('stop-audio-capture')

      console.log('Audio capture stop request sent to renderer process')
    } catch (error) {
      console.error('Failed to stop audio capture:', error)
      throw error
    }
  }

  /**
   * Check if currently capturing
   */
  isCapturing(): boolean {
    return this.capturing
  }

  /**
   * Update capture configuration
   */
  updateConfig(newConfig: Partial<AudioCaptureConfig>): void {
    this.config = {...this.config, ...newConfig}

    // Send updated config to renderer if capture is active
    if (this.capturing && this.captureWindow) {
      this.captureWindow.webContents.send('update-audio-config', this.config)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioCaptureConfig {
    return {...this.config}
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.capturing) {
      this.stopCapture()
    }

    // Remove IPC listeners
    ipcMain.removeAllListeners('audio-chunk-data')
    ipcMain.removeAllListeners('audio-capture-error')
    ipcMain.removeAllListeners('audio-capture-state')

    this.removeAllListeners()
  }
}

// Singleton instance for main process
let mainAudioCaptureInstance: MainProcessAudioCapture | null = null

/**
 * Get singleton instance of main process audio capture
 */
export function getMainAudioCapture(config?: AudioCaptureConfig): MainProcessAudioCapture {
  if (!mainAudioCaptureInstance) {
    mainAudioCaptureInstance = new MainProcessAudioCapture(config)
  }
  return mainAudioCaptureInstance
}

/**
 * Factory function for creating audio capture service
 * Automatically detects if running in main or renderer process
 */
export function createAudioCaptureService(config?: AudioCaptureConfig) {
  // Check if we're in the main process
  if (typeof process !== 'undefined' && process.type === 'browser') {
    return getMainAudioCapture(config)
  } else {
    // Return null for renderer process - they should use audio_capture.ts directly
    console.warn(
      'createAudioCaptureService called from renderer process. Use audio_capture.ts instead.'
    )
    return null
  }
}

export default MainProcessAudioCapture
