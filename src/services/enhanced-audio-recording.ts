/**
 * Enhanced Audio Recording Service with Real-Time Streaming Support
 *
 * Builds upon the existing audio-recording.ts to add real-time WebSocket streaming capabilities
 * while maintaining backward compatibility with interval-based recording.
 */

import {Subject, Subscription, interval, BehaviorSubject} from 'rxjs'
import {takeUntil} from 'rxjs/operators'
import {getAudioCapture, type AudioChunkData} from './audio-capture-factory'
import {
  RealTimeAudioStreamingService,
  createRealTimeAudioStreaming,
  type StreamingMetrics
} from './real-time-audio-streaming'
import {GeminiLiveIntegrationService} from './gemini-live-integration'
import type {TranscriptionResult} from './audio-recording'

// Re-export existing types for compatibility
export {
  TranscriptionResult,
  RecordingState,
  INTERVAL_SECONDS,
  TARGET_SAMPLE_RATE,
  DEVICE_SAMPLE_RATE,
  resampleAudio,
  renderAudioToWav
} from './audio-recording'

// Enhanced recording modes
export enum RecordingMode {
  INTERVAL = 'interval', // Traditional interval-based recording
  REALTIME = 'realtime', // Real-time WebSocket streaming
  HYBRID = 'hybrid' // Combination of both
}

// Enhanced configuration options
export interface AudioRecordingConfig {
  mode: RecordingMode
  intervalSeconds?: number
  enableRealTimeStreaming?: boolean
  bufferSize?: number
  adaptiveBuffering?: boolean
  qualityThreshold?: number
}

// Default configuration
export const DEFAULT_RECORDING_CONFIG: AudioRecordingConfig = {
  mode: RecordingMode.HYBRID,
  intervalSeconds: 10,
  enableRealTimeStreaming: true,
  bufferSize: 4096,
  adaptiveBuffering: true,
  qualityThreshold: 0.8
}

// Enhanced state interface
export interface EnhancedRecordingState {
  isRecording: boolean
  isTranscribing: boolean
  isStreaming: boolean
  recordingTime: number
  status: string
  mode: RecordingMode
  bufferHealth: number // 0-1 indicating buffer efficiency
  streamingMetrics?: {
    latency: number
    droppedFrames: number
    bytesStreamed: number
  }
}

/**
 * Adaptive Buffering Manager
 * Monitors performance and adjusts buffer parameters dynamically
 */
class AdaptiveBufferingManager {
  private performanceHistory: number[] = []
  private latencyHistory: number[] = []
  private readonly maxHistorySize = 20

  /**
   * Record performance metrics
   */
  recordMetrics(latency: number, bufferHealth: number): void {
    this.latencyHistory.push(latency)
    this.performanceHistory.push(bufferHealth)

    // Keep history size manageable
    if (this.latencyHistory.length > this.maxHistorySize) {
      this.latencyHistory.shift()
    }
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift()
    }
  }

  /**
   * Get recommended buffer size based on performance history
   */
  getRecommendedBufferSize(currentSize: number): number {
    if (this.performanceHistory.length < 5) {
      return currentSize // Not enough data yet
    }

    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
    const avgHealth =
      this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length

    // Increase buffer size if latency is high or health is poor
    if (avgLatency > 200 || avgHealth < 0.6) {
      return Math.min(currentSize * 1.5, 16384) // Cap at 16KB
    }

    // Decrease buffer size if performance is consistently good
    if (avgLatency < 50 && avgHealth > 0.9) {
      return Math.max(currentSize * 0.8, 1024) // Floor at 1KB
    }

    return currentSize
  }

  /**
   * Check if buffering needs adjustment
   */
  shouldAdjustBuffering(): boolean {
    if (this.performanceHistory.length < 3) {
      return false
    }

    // Check for recent performance degradation
    const recent = this.performanceHistory.slice(-3)
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length

    return recentAvg < 0.7 // Adjust if recent performance is poor
  }

  /**
   * Reset metrics history
   */
  reset(): void {
    this.performanceHistory = []
    this.latencyHistory = []
  }
}

/**
 * Enhanced Audio Recording Service with Real-Time Streaming
 */
export class EnhancedAudioRecordingService {
  private recordingSubscription: Subscription | null = null
  private stopSubject: Subject<void> | null = null
  private timerInterval: NodeJS.Timeout | null = null
  private realTimeStreaming: RealTimeAudioStreamingService | null = null
  private integrationService: GeminiLiveIntegrationService | null = null
  private adaptiveManager: AdaptiveBufferingManager

  private config: AudioRecordingConfig
  private state: EnhancedRecordingState
  private stateSubject: BehaviorSubject<EnhancedRecordingState>

  constructor(config: Partial<AudioRecordingConfig> = {}) {
    this.config = {...DEFAULT_RECORDING_CONFIG, ...config}
    this.adaptiveManager = new AdaptiveBufferingManager()

    this.state = {
      isRecording: false,
      isTranscribing: false,
      isStreaming: false,
      recordingTime: 0,
      status: 'Ready to record',
      mode: this.config.mode,
      bufferHealth: 1.0
    }

    this.stateSubject = new BehaviorSubject(this.state)
  }

  /**
   * Initialize the enhanced recording service
   */
  async initialize(integrationService?: GeminiLiveIntegrationService): Promise<void> {
    this.integrationService = integrationService

    // Initialize real-time streaming if enabled
    if (this.config.enableRealTimeStreaming) {
      this.realTimeStreaming = createRealTimeAudioStreaming({
        bufferSize: this.config.bufferSize,
        enableVAD: true
      })

      if (this.integrationService) {
        await this.realTimeStreaming.initialize(this.integrationService)
      }

      // Set up streaming event handlers
      this.setupStreamingEventHandlers()
    }
  }

  /**
   * Set up event handlers for real-time streaming
   */
  private setupStreamingEventHandlers(): void {
    if (!this.realTimeStreaming) return

    this.realTimeStreaming.on('metrics', metrics => {
      this.updateStreamingMetrics(metrics)
    })

    this.realTimeStreaming.on('bufferOverflow', data => {
      console.warn('Buffer overflow detected:', data)
      this.adaptBuffering()
    })

    this.realTimeStreaming.on('error', error => {
      console.error('Streaming error:', error)
      this.handleStreamingError(error)
    })
  }

  /**
   * Update streaming metrics in state
   */
  private updateStreamingMetrics(metrics: StreamingMetrics): void {
    this.updateState({
      bufferHealth: this.calculateBufferHealth(metrics),
      streamingMetrics: {
        latency: metrics.averageLatency || 0,
        droppedFrames: metrics.droppedFrames || 0,
        bytesStreamed: metrics.bufferedDuration || 0
      }
    })

    // Record metrics for adaptive buffering
    if (this.config.adaptiveBuffering) {
      this.adaptiveManager.recordMetrics(metrics.averageLatency || 0, this.state.bufferHealth)

      // Adjust buffering if needed
      if (this.adaptiveManager.shouldAdjustBuffering()) {
        this.adaptBuffering()
      }
    }
  }

  /**
   * Calculate buffer health score based on metrics
   */
  private calculateBufferHealth(metrics: StreamingMetrics): number {
    const latencyScore = Math.max(0, 1 - (metrics.averageLatency || 0) / 1000)
    const dropScore = Math.max(0, 1 - (metrics.droppedFrames || 0) / 100)
    const throttleScore = metrics.networkThrottling ? 0.5 : 1.0

    return (latencyScore + dropScore + throttleScore) / 3
  }

  /**
   * Adapt buffering parameters based on performance
   */
  private adaptBuffering(): void {
    if (!this.realTimeStreaming || !this.config.adaptiveBuffering) return

    const currentConfig = this.realTimeStreaming.getConfig()
    const newBufferSize = this.adaptiveManager.getRecommendedBufferSize(currentConfig.bufferSize)

    if (newBufferSize !== currentConfig.bufferSize) {
      console.log(`Adapting buffer size: ${currentConfig.bufferSize} -> ${newBufferSize}`)

      this.realTimeStreaming.updateConfig({
        bufferSize: newBufferSize,
        chunkDurationMs: Math.max(50, newBufferSize / 160) // Adjust chunk duration based on buffer size
      })
    }
  }

  /**
   * Handle streaming errors with fallback strategies
   */
  private handleStreamingError(error: Error): void {
    console.error('Streaming error, attempting fallback:', error)

    // Switch to interval mode if real-time streaming fails
    if (this.config.mode === RecordingMode.REALTIME || this.config.mode === RecordingMode.HYBRID) {
      this.updateState({
        mode: RecordingMode.INTERVAL,
        status: 'Fallback to interval mode due to streaming error'
      })

      // If we're currently recording, restart in interval mode
      if (this.state.isRecording) {
        this.stopRecording()
        setTimeout(() => {
          this.startRecording()
        }, 1000)
      }
    }
  }

  /**
   * Start recording with the configured mode
   */
  async startRecording(onTranscription?: (result: TranscriptionResult) => void): Promise<void> {
    if (this.state.isRecording) {
      console.log('Recording already in progress')
      return
    }

    this.updateState({
      isRecording: true,
      recordingTime: 0,
      status: `Recording... (${this.state.mode} mode)`
    })

    // Start timer for recording time
    this.timerInterval = setInterval(() => {
      this.updateState({recordingTime: this.state.recordingTime + 1})
    }, 1000)

    try {
      switch (this.state.mode) {
        case RecordingMode.REALTIME:
          await this.startRealTimeRecording(onTranscription)
          break
        case RecordingMode.INTERVAL:
          await this.startIntervalRecording(onTranscription)
          break
        case RecordingMode.HYBRID:
          await this.startHybridRecording(onTranscription)
          break
      }
    } catch (error) {
      console.error('Failed to start recording:', error)
      this.updateState({
        isRecording: false,
        status: `Recording error: ${error.message}`
      })
      this.cleanup()
    }
  }

  /**
   * Start real-time streaming recording
   */
  private async startRealTimeRecording(
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<void> {
    if (!this.realTimeStreaming) {
      throw new Error('Real-time streaming not initialized')
    }

    await this.realTimeStreaming.startStreaming()
    this.updateState({isStreaming: true})

    // Set up transcription handling if integration service is available
    if (this.integrationService && onTranscription) {
      this.integrationService.on('transcriptionResult', onTranscription)
    }
  }

  /**
   * Start interval-based recording (legacy mode)
   */
  private async startIntervalRecording(
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<void> {
    console.log(`Starting interval recording (${this.config.intervalSeconds} second intervals)`)

    // Create a subject that will emit when recording should stop
    const stopSubject = new Subject<void>()
    this.stopSubject = stopSubject

    try {
      // Get the audio capture service based on current process
      const audioCapture = await getAudioCapture({
        sampleRate: 44100,
        channels: 1,
        bufferSize: this.config.bufferSize || 4096,
        intervalSeconds: this.config.intervalSeconds || 10
      })

      // Set up audio chunk handler
      const audioChunks: AudioChunkData[] = []
      audioCapture.on('audioChunk', (chunkData: AudioChunkData) => {
        audioChunks.push(chunkData)
      })

      // Set up interval processing
      const intervalObservable = interval((this.config.intervalSeconds || 10) * 1000)

      this.recordingSubscription = intervalObservable.pipe(takeUntil(stopSubject)).subscribe({
        next: async () => {
          if (audioChunks.length > 0) {
            console.log(`Processing ${audioChunks.length} audio chunks for interval transcription`)
            await this.processAudioChunks(audioChunks.splice(0), onTranscription)
          }
        },
        error: err => {
          console.error('Interval recording error:', err)
          this.updateState({
            status: `Recording error: ${err.message}`,
            isRecording: false
          })
          this.cleanup()
        },
        complete: () => {
          console.log('Interval recording completed')
          audioCapture.destroy()
          this.updateState({
            isRecording: false,
            status: 'Ready to record'
          })
        }
      })

      // Start the audio capture
      await audioCapture.startCapture()
    } catch (error) {
      console.error('Failed to start interval recording:', error)
      throw error
    }
  }

  /**
   * Start hybrid recording (both real-time and interval)
   */
  private async startHybridRecording(
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<void> {
    // Start real-time streaming for immediate response
    if (this.realTimeStreaming) {
      try {
        await this.startRealTimeRecording(onTranscription)
      } catch (error) {
        console.warn('Real-time streaming failed, falling back to interval mode:', error)
        this.handleStreamingError(error as Error)
        return
      }
    }

    // Also start interval recording for backup/quality assurance
    await this.startIntervalRecording(onTranscription)
  }

  /**
   * Process audio chunks from the new audio capture system
   */
  private async processAudioChunks(
    chunks: AudioChunkData[],
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<TranscriptionResult | null> {
    try {
      this.updateState({
        isTranscribing: true,
        status: 'Processing audio...'
      })

      if (chunks.length === 0) {
        console.log('No audio chunks to process')
        return null
      }

      // Combine all audio buffers from chunks
      const combinedAudio = chunks.reduce((acc, chunk) => {
        acc.push(...chunk.buffer)
        return acc
      }, [] as number[])

      if (combinedAudio.length === 0) {
        console.log('Combined audio is empty')
        return null
      }

      console.log(`Processing ${combinedAudio.length} audio samples from ${chunks.length} chunks`)

      // Convert to Float32Array for processing
      const audioData = new Float32Array(combinedAudio)

      // Use the sample rate from the first chunk, or default to 44100
      const sourceSampleRate = chunks[0]?.sampleRate || 44100
      const targetSampleRate = 16000 // Standard for speech recognition

      // Resample if needed
      let processedAudio = audioData
      if (sourceSampleRate !== targetSampleRate) {
        const {resampleAudio} = await import('./audio-recording')
        processedAudio = resampleAudio(audioData, sourceSampleRate, targetSampleRate)
        console.log(`Resampled audio from ${audioData.length} to ${processedAudio.length} samples`)
      }

      // Convert to WAV format
      const {renderAudioToWav} = await import('./audio-recording')
      const wavData = await renderAudioToWav(processedAudio)
      console.log(`Generated WAV file: ${wavData.length} bytes`)

      // Send for transcription via IPC
      if (window.transcriptionAPI?.transcribeAudio) {
        const result = await window.transcriptionAPI.transcribeAudio(wavData)
        console.log('Transcription result:', result)

        if (onTranscription && result.text.trim()) {
          onTranscription(result)
        }

        return result
      } else {
        console.error('Transcription IPC not available')
        return null
      }
    } catch (error) {
      console.error('Error processing audio chunks:', error)
      this.updateState({status: 'Error processing audio'})
      return null
    } finally {
      this.updateState({
        isTranscribing: false,
        status: this.state.isRecording
          ? `Recording... (${this.state.mode} mode)`
          : 'Ready to record'
      })
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    if (!this.state.isRecording) {
      console.log('No recording in progress')
      return
    }

    console.log('Stopping recording')
    this.updateState({status: 'Stopping recording...'})

    // Stop real-time streaming if active
    if (this.state.isStreaming && this.realTimeStreaming) {
      await this.realTimeStreaming.stopStreaming()
      this.updateState({isStreaming: false})
    }

    this.cleanup()

    this.updateState({
      isRecording: false,
      recordingTime: 0,
      status: 'Ready to record'
    })

    console.log('Recording stopped')
  }

  /**
   * Toggle recording state
   */
  async toggleRecording(onTranscription?: (result: TranscriptionResult) => void): Promise<void> {
    if (this.state.isRecording) {
      await this.stopRecording()
    } else {
      await this.startRecording(onTranscription)
    }
  }

  /**
   * Update recording configuration
   */
  updateConfig(updates: Partial<AudioRecordingConfig>): void {
    this.config = {...this.config, ...updates}

    // Update real-time streaming config if applicable
    if (this.realTimeStreaming && updates.bufferSize) {
      this.realTimeStreaming.updateConfig({
        bufferSize: updates.bufferSize
      })
    }

    // Update mode if changed
    if (updates.mode) {
      this.updateState({mode: updates.mode})
    }
  }

  /**
   * Get current state as observable
   */
  getStateObservable() {
    return this.stateSubject.asObservable()
  }

  /**
   * Get current state
   */
  getState(): EnhancedRecordingState {
    return {...this.state}
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioRecordingConfig {
    return {...this.config}
  }

  /**
   * Update state and notify subscribers
   */
  private updateState(updates: Partial<EnhancedRecordingState>): void {
    this.state = {...this.state, ...updates}
    this.stateSubject.next(this.state)
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }

    // Trigger the stop subject
    if (this.stopSubject) {
      this.stopSubject.next()
      this.stopSubject.complete()
      this.stopSubject = null
    }

    // Unsubscribe from the recording subscription
    if (this.recordingSubscription) {
      this.recordingSubscription.unsubscribe()
      this.recordingSubscription = null
    }
  }

  /**
   * Destroy the service and cleanup all resources
   */
  async destroy(): Promise<void> {
    await this.stopRecording()

    if (this.realTimeStreaming) {
      await this.realTimeStreaming.cleanup()
      this.realTimeStreaming = null
    }

    this.adaptiveManager.reset()
    this.stateSubject.complete()
  }
}

// Singleton instance for shared use
let enhancedAudioRecordingServiceInstance: EnhancedAudioRecordingService | null = null

/**
 * Get the singleton enhanced audio recording service instance
 */
export function getEnhancedAudioRecordingService(): EnhancedAudioRecordingService {
  if (!enhancedAudioRecordingServiceInstance) {
    enhancedAudioRecordingServiceInstance = new EnhancedAudioRecordingService()
  }
  return enhancedAudioRecordingServiceInstance
}

/**
 * Factory function to create a new enhanced recording service with custom config
 */
export function createEnhancedAudioRecording(
  config?: Partial<AudioRecordingConfig>
): EnhancedAudioRecordingService {
  return new EnhancedAudioRecordingService(config)
}
