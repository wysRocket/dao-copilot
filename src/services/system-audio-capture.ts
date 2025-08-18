/**
 * System Audio Capture Service
 *
 * Comprehensive audio capture that supports:
 * - Microphone input
 * - System audio (speakers, applications, etc.)
 * - Mixed mode (both simultaneously)
 *
 * This service bridges the gap between the existing audio capture services
 * and adds full system audio transcription capabilities.
 */

import {Capturer} from './audio_capture'

// Use browser-compatible EventTarget instead of Node.js EventEmitter
export class AudioEventEmitter {
  private listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map()

  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(listener)
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      const index = eventListeners.indexOf(listener)
      if (index !== -1) {
        eventListeners.splice(index, 1)
      }
    }
  }

  emit(event: string, ...args: unknown[]): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args)
        } catch (error) {
          console.error(`Error in ${event} listener:`, error)
        }
      })
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}

export enum AudioSourceType {
  MICROPHONE = 'microphone',
  SYSTEM = 'system',
  MIXED = 'mixed' // Both microphone and system audio
}

export interface SystemAudioConfig {
  sourceType: AudioSourceType
  sampleRate?: number
  channels?: number
  bufferSize?: number
  systemAudioEnabled?: boolean
  microphoneEnabled?: boolean
  systemAudioVolume?: number // 0.0 to 1.0
  microphoneVolume?: number // 0.0 to 1.0
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

export interface AudioCaptureData {
  buffer: number[]
  sourceType: AudioSourceType
  timestamp: number
  sampleRate: number
  channels: number
}

/**
 * Enhanced system audio capture service
 * Combines microphone and system audio capture capabilities
 */
export class SystemAudioCaptureService extends AudioEventEmitter {
  private capturer: Capturer | null = null
  private isCapturing = false
  private currentConfig: SystemAudioConfig
  private microphoneStream: MediaStream | null = null
  private systemAudioStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private gainNodes: {mic?: GainNode; system?: GainNode} = {}

  constructor(config: SystemAudioConfig = {sourceType: AudioSourceType.MIXED}) {
    super()

    this.currentConfig = {
      sampleRate: 44100,
      channels: 1,
      bufferSize: 4096,
      systemAudioEnabled: true,
      microphoneEnabled: true,
      systemAudioVolume: 0.8,
      microphoneVolume: 0.8,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...config
    }

    this.capturer = new Capturer()
  }

  /**
   * Start comprehensive audio capture
   */
  async startCapture(): Promise<void> {
    if (this.isCapturing) {
      console.log('🔊 SystemAudio: Already capturing, skipping start')
      return
    }

    try {
      console.log(`🎧 SystemAudio: Starting capture with source: ${this.currentConfig.sourceType}`)
      this.isCapturing = true

      if (!this.capturer) {
        throw new Error('Audio capturer not initialized')
      }

      // Start the enhanced capturer which handles both mic and system audio
      await this.capturer.startRecording((buffer: number[]) => {
        const captureData: AudioCaptureData = {
          buffer,
          sourceType: this.currentConfig.sourceType,
          timestamp: Date.now(),
          sampleRate: this.currentConfig.sampleRate!,
          channels: this.currentConfig.channels!
        }

        // Emit the audio data for transcription services
        this.emit('audioData', captureData)

        // Also emit in a format compatible with existing transcription
        this.emit('audioChunk', buffer)
      })

      this.emit('captureStarted', this.currentConfig.sourceType)
      console.log(`✅ SystemAudio: Capture started successfully - ${this.currentConfig.sourceType}`)
    } catch (error) {
      this.isCapturing = false
      console.error('❌ SystemAudio: Failed to start capture:', error)
      this.emit('captureError', error)
      throw error
    }
  }

  /**
   * Stop audio capture
   */
  async stopCapture(): Promise<void> {
    if (!this.isCapturing) {
      console.log('🔊 SystemAudio: Not capturing, skipping stop')
      return
    }

    try {
      console.log('🛑 SystemAudio: Stopping capture...')

      if (this.capturer) {
        await this.capturer.stopRecording()
      }

      // Cleanup resources
      await this.cleanup()

      this.isCapturing = false
      this.emit('captureStopped')
      console.log('✅ SystemAudio: Capture stopped successfully')
    } catch (error) {
      console.error('❌ SystemAudio: Error stopping capture:', error)
      this.emit('captureError', error)
      throw error
    }
  }

  /**
   * Switch audio source type while recording
   */
  async switchSourceType(sourceType: AudioSourceType): Promise<void> {
    console.log(
      `🔄 SystemAudio: Switching source from ${this.currentConfig.sourceType} to ${sourceType}`
    )

    const wasCapturing = this.isCapturing

    if (wasCapturing) {
      await this.stopCapture()
    }

    this.currentConfig.sourceType = sourceType

    if (wasCapturing) {
      await this.startCapture()
    }

    this.emit('sourceChanged', sourceType)
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SystemAudioConfig>): void {
    this.currentConfig = {...this.currentConfig, ...config}
    console.log('⚙️ SystemAudio: Configuration updated:', config)
    this.emit('configUpdated', this.currentConfig)
  }

  /**
   * Get current configuration
   */
  getConfig(): SystemAudioConfig {
    return {...this.currentConfig}
  }

  /**
   * Check if currently capturing
   */
  getIsCapturing(): boolean {
    return this.isCapturing
  }

  /**
   * Get available audio sources
   */
  getAvailableSources(): AudioSourceType[] {
    return [AudioSourceType.MICROPHONE, AudioSourceType.SYSTEM, AudioSourceType.MIXED]
  }

  /**
   * Test system audio permissions
   */
  async testSystemAudioPermissions(): Promise<boolean> {
    try {
      console.log('🧪 SystemAudio: Testing system audio permissions...')

      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: {
          width: 320,
          height: 240,
          frameRate: 1
        }
      })

      const hasAudio = stream.getAudioTracks().length > 0
      console.log(`🎯 SystemAudio: System audio available: ${hasAudio}`)

      // Stop the test stream
      stream.getTracks().forEach(track => track.stop())

      return hasAudio
    } catch (error) {
      console.error('❌ SystemAudio: System audio permission test failed:', error)
      return false
    }
  }

  /**
   * Test microphone permissions
   */
  async testMicrophonePermissions(): Promise<boolean> {
    try {
      console.log('🧪 SystemAudio: Testing microphone permissions...')

      const stream = await navigator.mediaDevices.getUserMedia({audio: true})
      const hasAudio = stream.getAudioTracks().length > 0
      console.log(`🎯 SystemAudio: Microphone available: ${hasAudio}`)

      // Stop the test stream
      stream.getTracks().forEach(track => track.stop())

      return hasAudio
    } catch (error) {
      console.error('❌ SystemAudio: Microphone permission test failed:', error)
      return false
    }
  }

  /**
   * Get comprehensive permissions status
   */
  async getPermissionsStatus(): Promise<{
    microphone: boolean
    systemAudio: boolean
    bothAvailable: boolean
  }> {
    const [microphone, systemAudio] = await Promise.all([
      this.testMicrophonePermissions(),
      this.testSystemAudioPermissions()
    ])

    return {
      microphone,
      systemAudio,
      bothAvailable: microphone && systemAudio
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      // Cleanup gain nodes
      if (this.gainNodes.mic) {
        this.gainNodes.mic.disconnect()
        this.gainNodes.mic = undefined
      }

      if (this.gainNodes.system) {
        this.gainNodes.system.disconnect()
        this.gainNodes.system = undefined
      }

      // Close audio context
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close()
        this.audioContext = null
      }

      // Stop media streams
      if (this.microphoneStream) {
        this.microphoneStream.getTracks().forEach(track => track.stop())
        this.microphoneStream = null
      }

      if (this.systemAudioStream) {
        this.systemAudioStream.getTracks().forEach(track => track.stop())
        this.systemAudioStream = null
      }
    } catch (error) {
      console.error('❌ SystemAudio: Cleanup error:', error)
    }
  }

  /**
   * Destroy the service
   */
  async destroy(): Promise<void> {
    if (this.isCapturing) {
      await this.stopCapture()
    }

    await this.cleanup()
    this.removeAllListeners()
    this.capturer = null

    console.log('🗑️ SystemAudio: Service destroyed')
  }
}

/**
 * Factory function for creating system audio capture service
 */
export function createSystemAudioCapture(config?: SystemAudioConfig): SystemAudioCaptureService {
  return new SystemAudioCaptureService(config)
}

/**
 * Singleton instance
 */
let systemAudioCaptureInstance: SystemAudioCaptureService | null = null

/**
 * Get singleton instance
 */
export function getSystemAudioCapture(config?: SystemAudioConfig): SystemAudioCaptureService {
  if (!systemAudioCaptureInstance) {
    systemAudioCaptureInstance = new SystemAudioCaptureService(config)
  }
  return systemAudioCaptureInstance
}
