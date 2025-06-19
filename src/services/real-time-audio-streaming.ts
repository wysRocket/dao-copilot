/**
 * Real-Time Audio Streaming Service
 *
 * Optimized audio streaming service for WebSocket-based transcription.
 * Provides low-latency audio capture, efficient buffering, and real-time streaming
 * to the Gemini Live API WebSocket connection.
 */

import {EventEmitter} from 'events'
import {GeminiLiveIntegrationService} from './gemini-live-integration'

// Audio streaming configuration optimized for Gemini Live API
export interface AudioStreamingConfig {
  sampleRate: number
  channelCount: number
  bitDepth: number
  bufferSize: number
  chunkDurationMs: number
  maxBufferSize: number
  throttleDelayMs: number
  enableVAD: boolean // Voice Activity Detection
  vadThreshold: number
}

// Default configuration optimized for Gemini API and real-time performance
export const DEFAULT_STREAMING_CONFIG: AudioStreamingConfig = {
  sampleRate: 16000, // 16kHz - optimal for speech recognition
  channelCount: 1, // Mono
  bitDepth: 16, // 16-bit PCM
  bufferSize: 4096, // Small buffer for low latency
  chunkDurationMs: 100, // Send chunks every 100ms
  maxBufferSize: 32768, // Maximum buffer size to prevent memory issues
  throttleDelayMs: 50, // Throttle delay during network congestion
  enableVAD: true, // Enable voice activity detection to save bandwidth
  vadThreshold: 0.01 // Minimum volume threshold for voice activity
}

// Audio streaming performance metrics
export interface StreamingMetrics {
  bufferedDuration: number
  droppedFrames: number
  averageLatency: number
  bufferUnderruns: number
  networkThrottling: boolean
  vadActive: boolean
}

// Audio chunk with metadata
export interface AudioChunk {
  data: Float32Array
  timestamp: number
  duration: number
  hasVoice: boolean
  sequenceNumber: number
}

/**
 * Circular buffer for efficient audio data management
 */
class CircularAudioBuffer {
  private buffer: Float32Array
  private writeIndex = 0
  private readIndex = 0
  private size = 0

  constructor(private capacity: number) {
    this.buffer = new Float32Array(capacity)
  }

  write(data: Float32Array): number {
    const written = Math.min(data.length, this.capacity - this.size)

    for (let i = 0; i < written; i++) {
      this.buffer[this.writeIndex] = data[i]
      this.writeIndex = (this.writeIndex + 1) % this.capacity
    }

    this.size = Math.min(this.size + written, this.capacity)
    return written
  }

  read(length: number): Float32Array {
    const actualLength = Math.min(length, this.size)
    const result = new Float32Array(actualLength)

    for (let i = 0; i < actualLength; i++) {
      result[i] = this.buffer[this.readIndex]
      this.readIndex = (this.readIndex + 1) % this.capacity
    }

    this.size -= actualLength
    return result
  }

  availableData(): number {
    return this.size
  }

  availableSpace(): number {
    return this.capacity - this.size
  }

  clear(): void {
    this.readIndex = 0
    this.writeIndex = 0
    this.size = 0
  }
}

/**
 * Voice Activity Detection utility
 */
class VoiceActivityDetector {
  private rmsHistory: number[] = []
  private readonly historySize = 10

  detect(audioData: Float32Array, threshold: number): boolean {
    // Calculate RMS (Root Mean Square) for audio level
    let sum = 0
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i]
    }
    const rms = Math.sqrt(sum / audioData.length)

    // Maintain RMS history for adaptive thresholding
    this.rmsHistory.push(rms)
    if (this.rmsHistory.length > this.historySize) {
      this.rmsHistory.shift()
    }

    // Adaptive threshold based on recent audio levels
    const avgRms = this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length
    const adaptiveThreshold = Math.max(threshold, avgRms * 0.5)

    return rms > adaptiveThreshold
  }

  reset(): void {
    this.rmsHistory = []
  }
}

/**
 * Real-Time Audio Streaming Service
 *
 * Handles audio capture, buffering, and streaming for WebSocket transcription
 */
export class RealTimeAudioStreamingService extends EventEmitter {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private audioWorkletNode: AudioWorkletNode | null = null
  private circularBuffer: CircularAudioBuffer | null = null
  private vad: VoiceActivityDetector | null = null

  private config: AudioStreamingConfig
  private isStreaming = false
  private sequenceNumber = 0
  private streamingTimer: NodeJS.Timeout | null = null
  private performanceTimer: NodeJS.Timeout | null = null

  private metrics: StreamingMetrics = {
    bufferedDuration: 0,
    droppedFrames: 0,
    averageLatency: 0,
    bufferUnderruns: 0,
    networkThrottling: false,
    vadActive: false
  }

  private integrationService: GeminiLiveIntegrationService | null = null

  constructor(config: Partial<AudioStreamingConfig> = {}) {
    super()
    this.config = {...DEFAULT_STREAMING_CONFIG, ...config}
    this.circularBuffer = new CircularAudioBuffer(this.config.maxBufferSize)
    this.vad = new VoiceActivityDetector()
  }

  /**
   * Initialize the audio streaming service
   */
  async initialize(integrationService: GeminiLiveIntegrationService): Promise<void> {
    try {
      this.integrationService = integrationService

      // Initialize audio context with optimal settings
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
        latencyHint: 'interactive' // Optimize for low latency
      })

      // Get user media with optimized constraints
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      await this.setupAudioProcessing()
      this.emit('initialized')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Set up audio processing pipeline
   */
  private async setupAudioProcessing(): Promise<void> {
    if (!this.audioContext || !this.mediaStream) {
      throw new Error('Audio context or media stream not initialized')
    }

    const source = this.audioContext.createMediaStreamSource(this.mediaStream)

    // Try to use AudioWorklet for better performance, fallback to ScriptProcessor
    try {
      await this.audioContext.audioWorklet.addModule(
        new URL('./workers/audio-streaming-worklet.js', import.meta.url)
      )

      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-streaming-processor', {
        processorOptions: {
          bufferSize: this.config.bufferSize,
          sampleRate: this.config.sampleRate
        }
      })

      this.audioWorkletNode.port.onmessage = event => {
        this.handleAudioData(event.data.audioData)
      }

      source.connect(this.audioWorkletNode)
    } catch (error) {
      console.warn('AudioWorklet not available, falling back to ScriptProcessor:', error)

      // Fallback to ScriptProcessor (deprecated but more widely supported)
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        this.config.channelCount,
        this.config.channelCount
      )

      this.scriptProcessor.onaudioprocess = event => {
        const audioData = event.inputBuffer.getChannelData(0)
        this.handleAudioData(new Float32Array(audioData))
      }

      source.connect(this.scriptProcessor)
      this.scriptProcessor.connect(this.audioContext.destination)
    }
  }

  /**
   * Handle incoming audio data
   */
  private handleAudioData(audioData: Float32Array): void {
    if (!this.isStreaming || !this.circularBuffer) {
      return
    }

    // Voice Activity Detection
    const hasVoice = this.config.enableVAD
      ? this.vad!.detect(audioData, this.config.vadThreshold)
      : true

    this.metrics.vadActive = hasVoice

    // Skip silent frames if VAD is enabled and no voice detected
    if (this.config.enableVAD && !hasVoice) {
      return
    }

    // Write to circular buffer
    const written = this.circularBuffer.write(audioData)

    if (written < audioData.length) {
      // Buffer overflow - track dropped frames
      this.metrics.droppedFrames += audioData.length - written
      this.emit('bufferOverflow', {droppedSamples: audioData.length - written})
    }

    // Update buffered duration
    this.metrics.bufferedDuration =
      (this.circularBuffer.availableData() / this.config.sampleRate) * 1000
  }

  /**
   * Start real-time audio streaming
   */
  async startStreaming(): Promise<void> {
    if (this.isStreaming) {
      return
    }

    if (!this.integrationService) {
      throw new Error('Integration service not set')
    }

    this.isStreaming = true
    this.sequenceNumber = 0
    this.resetMetrics()

    // Start periodic chunk sending
    this.streamingTimer = setInterval(() => {
      this.sendAudioChunk()
    }, this.config.chunkDurationMs)

    // Start performance monitoring
    this.performanceTimer = setInterval(() => {
      this.updatePerformanceMetrics()
      this.emit('metrics', this.metrics)
    }, 1000)

    this.emit('streamingStarted')
  }

  /**
   * Stop audio streaming
   */
  async stopStreaming(): Promise<void> {
    if (!this.isStreaming) {
      return
    }

    this.isStreaming = false

    if (this.streamingTimer) {
      clearInterval(this.streamingTimer)
      this.streamingTimer = null
    }

    if (this.performanceTimer) {
      clearInterval(this.performanceTimer)
      this.performanceTimer = null
    }

    // Send any remaining buffered audio
    await this.flushBuffer()

    this.emit('streamingStopped')
  }

  /**
   * Send an audio chunk to the WebSocket connection
   */
  private async sendAudioChunk(): Promise<void> {
    if (!this.circularBuffer || !this.integrationService) {
      return
    }

    const chunkSize = Math.floor((this.config.sampleRate * this.config.chunkDurationMs) / 1000)

    if (this.circularBuffer.availableData() < chunkSize) {
      this.metrics.bufferUnderruns++
      return
    }

    const audioData = this.circularBuffer.read(chunkSize)
    const chunk: AudioChunk = {
      data: audioData,
      timestamp: Date.now(),
      duration: this.config.chunkDurationMs,
      hasVoice: this.metrics.vadActive,
      sequenceNumber: this.sequenceNumber++
    }

    try {
      // Convert to the format expected by Gemini API
      const audioBuffer = this.convertToGeminiFormat(audioData)

      // Send via the integration service
      await this.integrationService.sendAudioData(audioBuffer)

      this.emit('chunkSent', chunk)
    } catch (error) {
      this.emit('error', error)

      // Implement throttling on network errors
      const errorObj = error as Error & {code?: string}
      if (errorObj.name === 'NetworkError' || errorObj.code === 'NETWORK_ERROR') {
        this.metrics.networkThrottling = true
        setTimeout(() => {
          this.metrics.networkThrottling = false
        }, this.config.throttleDelayMs)
      }
    }
  }

  /**
   * Convert audio data to the format expected by Gemini API
   */
  private convertToGeminiFormat(audioData: Float32Array): Uint8Array {
    // Convert Float32Array to 16-bit PCM
    const buffer = new ArrayBuffer(audioData.length * 2)
    const view = new DataView(buffer)

    for (let i = 0; i < audioData.length; i++) {
      // Convert from float (-1.0 to 1.0) to 16-bit signed integer
      const sample = Math.max(-1, Math.min(1, audioData[i]))
      const intSample = Math.floor(sample * 32767)
      view.setInt16(i * 2, intSample, true) // little-endian
    }

    return new Uint8Array(buffer)
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private bufferToBase64(buffer: Uint8Array): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Flush remaining audio buffer
   */
  private async flushBuffer(): Promise<void> {
    if (!this.circularBuffer || this.circularBuffer.availableData() === 0) {
      return
    }

    const remainingData = this.circularBuffer.read(this.circularBuffer.availableData())
    if (remainingData.length > 0) {
      const audioBuffer = this.convertToGeminiFormat(remainingData)
      await this.integrationService?.sendAudioData(audioBuffer)
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    if (this.circularBuffer) {
      this.metrics.bufferedDuration =
        (this.circularBuffer.availableData() / this.config.sampleRate) * 1000
    }
  }

  /**
   * Reset performance metrics
   */
  private resetMetrics(): void {
    this.metrics = {
      bufferedDuration: 0,
      droppedFrames: 0,
      averageLatency: 0,
      bufferUnderruns: 0,
      networkThrottling: false,
      vadActive: false
    }
  }

  /**
   * Get current streaming metrics
   */
  getMetrics(): StreamingMetrics {
    return {...this.metrics}
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioStreamingConfig {
    return {...this.config}
  }

  /**
   * Update configuration (requires restart to take effect)
   */
  updateConfig(newConfig: Partial<AudioStreamingConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.emit('configUpdated', this.config)
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stopStreaming()

    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect()
      this.audioWorkletNode = null
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.circularBuffer?.clear()
    this.vad?.reset()

    this.removeAllListeners()
  }
}

// Export factory function for easier integration
export function createRealTimeAudioStreaming(
  config?: Partial<AudioStreamingConfig>
): RealTimeAudioStreamingService {
  return new RealTimeAudioStreamingService(config)
}
