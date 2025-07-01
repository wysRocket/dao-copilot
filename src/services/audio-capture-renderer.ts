/**
 * Audio IPC Bridge for Renderer Process
 *
 * This module provides the bridge between main process audio coordination
 * and renderer process audio capture using AudioContext.
 */

import {ipcRenderer} from 'electron'
import {AudioCaptureConfig, AudioChunkData} from './audio-capture-main'

export interface RendererAudioCapture {
  startCapture: (config: AudioCaptureConfig) => Promise<void>
  stopCapture: () => Promise<void>
  updateConfig: (config: AudioCaptureConfig) => void
  isCapturing: () => boolean
}

/**
 * Renderer process audio capture implementation
 * Uses Web Audio API (AudioContext) which is only available in renderer
 */
class RendererAudioCaptureService implements RendererAudioCapture {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private isRecording = false
  private config: AudioCaptureConfig = {}

  constructor() {
    this.setupIPCHandlers()
  }

  /**
   * Set up IPC message handlers from main process
   */
  private setupIPCHandlers(): void {
    // Handle start capture request from main process
    ipcRenderer.on('start-audio-capture', async (event, config: AudioCaptureConfig) => {
      try {
        await this.startCapture(config)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        ipcRenderer.send('audio-capture-error', errorMessage)
      }
    })

    // Handle stop capture request from main process
    ipcRenderer.on('stop-audio-capture', async () => {
      try {
        await this.stopCapture()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        ipcRenderer.send('audio-capture-error', errorMessage)
      }
    })

    // Handle config update from main process
    ipcRenderer.on('update-audio-config', (event, config: AudioCaptureConfig) => {
      this.updateConfig(config)
    })
  }

  /**
   * Start audio capture using Web Audio API
   */
  async startCapture(config: AudioCaptureConfig): Promise<void> {
    if (this.isRecording) {
      console.log('Audio capture already in progress')
      return
    }

    this.config = {
      sampleRate: 44100,
      channels: 1,
      bufferSize: 4096,
      intervalSeconds: 10,
      ...config
    }

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate
      })

      // Create audio source from media stream
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream)

      // Create script processor for audio data
      this.processor = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        this.config.channels,
        this.config.channels
      )

      // Handle audio processing
      this.processor.onaudioprocess = event => {
        if (!this.isRecording) return

        const inputBuffer = event.inputBuffer
        const channelData = inputBuffer.getChannelData(0) // Get first channel

        // Convert Float32Array to regular array for IPC transmission
        const audioData: number[] = Array.from(channelData)

        const chunkData: AudioChunkData = {
          buffer: audioData,
          timestamp: Date.now(),
          sampleRate: inputBuffer.sampleRate,
          channels: inputBuffer.numberOfChannels
        }

        // Send audio chunk to main process
        ipcRenderer.send('audio-chunk-data', chunkData)
      }

      // Connect audio nodes
      this.source.connect(this.processor)
      this.processor.connect(this.audioContext.destination)

      this.isRecording = true

      // Notify main process of state change
      ipcRenderer.send('audio-capture-state', {isCapturing: true})

      console.log('Audio capture started successfully in renderer process')
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      await this.cleanup()
      throw error
    }
  }

  /**
   * Stop audio capture
   */
  async stopCapture(): Promise<void> {
    if (!this.isRecording) {
      console.log('No audio capture in progress')
      return
    }

    this.isRecording = false

    await this.cleanup()

    // Notify main process of state change
    ipcRenderer.send('audio-capture-state', {isCapturing: false})

    console.log('Audio capture stopped successfully')
  }

  /**
   * Update capture configuration
   */
  updateConfig(config: AudioCaptureConfig): void {
    this.config = {...this.config, ...config}

    // If capture is active, restart with new config
    if (this.isRecording) {
      this.stopCapture().then(() => {
        this.startCapture(this.config)
      })
    }
  }

  /**
   * Check if currently capturing
   */
  isCapturing(): boolean {
    return this.isRecording
  }

  /**
   * Cleanup audio resources
   */
  private async cleanup(): Promise<void> {
    try {
      // Disconnect audio nodes
      if (this.processor) {
        this.processor.disconnect()
        this.processor.onaudioprocess = null
        this.processor = null
      }

      if (this.source) {
        this.source.disconnect()
        this.source = null
      }

      // Close audio context
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close()
        this.audioContext = null
      }

      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop())
        this.mediaStream = null
      }
    } catch (error) {
      console.error('Error during audio cleanup:', error)
    }
  }

  /**
   * Destroy service and cleanup resources
   */
  destroy(): void {
    this.stopCapture()

    // Remove IPC listeners
    ipcRenderer.removeAllListeners('start-audio-capture')
    ipcRenderer.removeAllListeners('stop-audio-capture')
    ipcRenderer.removeAllListeners('update-audio-config')
  }
}

// Create singleton instance
let rendererAudioCaptureInstance: RendererAudioCaptureService | null = null

/**
 * Get singleton instance of renderer audio capture service
 */
export function getRendererAudioCapture(): RendererAudioCaptureService {
  if (!rendererAudioCaptureInstance) {
    rendererAudioCaptureInstance = new RendererAudioCaptureService()
  }
  return rendererAudioCaptureInstance
}

/**
 * Initialize audio capture service for renderer process
 * Should be called once when the renderer process starts
 */
export function initializeRendererAudioCapture(): RendererAudioCaptureService {
  return getRendererAudioCapture()
}

export default RendererAudioCaptureService
