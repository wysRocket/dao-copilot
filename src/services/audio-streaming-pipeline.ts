/**
 * Audio Streaming Pipeline
 *
 * Focused integration service that coordinates audio streaming to WebSocket.
 * Handles the core data flow: audio chunks → format conversion → WebSocket transmission.
 */

import {EventEmitter} from 'events'
import {GeminiLiveWebSocketClient} from './gemini-live-websocket'
import {RealTimeAudioStreamingService, type AudioChunk} from './real-time-audio-streaming'
import {AudioFormatConverter} from './audio-format-converter'
import {AudioWorkerManager} from './audio-worker-manager'
import {createRealTimeAudioStreaming} from './real-time-audio-streaming'

export interface AudioPipelineConfig {
  // WebSocket configuration
  websocket: {
    apiKey: string
    model: string
    enableReconnect: boolean
  }

  // Audio configuration
  audio: {
    sampleRate: number
    channels: number
    bitDepth: number
  }

  // Processing configuration
  processing: {
    enableWorkers: boolean
    bufferSize: number
    enableVAD: boolean
    vadThreshold: number
  }
}

export interface PipelineMetrics {
  chunksProcessed: number
  bytesStreamed: number
  averageLatency: number
  errorCount: number
  isActive: boolean
}

/**
 * Simple audio streaming pipeline that connects audio capture to WebSocket transmission
 */
export class AudioStreamingPipeline extends EventEmitter {
  private websocketClient: GeminiLiveWebSocketClient
  private audioStreaming: RealTimeAudioStreamingService | null = null
  private formatConverter: AudioFormatConverter
  private workerManager: AudioWorkerManager | null = null

  private config: AudioPipelineConfig
  private isActive = false
  private metrics: PipelineMetrics

  constructor(config: AudioPipelineConfig) {
    super()
    this.config = config

    // Initialize core services
    this.websocketClient = new GeminiLiveWebSocketClient({
      apiKey: config.websocket.apiKey,
      model: config.websocket.model || 'gemini-2.0-flash-exp'
    })

    this.formatConverter = new AudioFormatConverter()

    if (config.processing.enableWorkers) {
      this.workerManager = new AudioWorkerManager()
    }

    this.metrics = {
      chunksProcessed: 0,
      bytesStreamed: 0,
      averageLatency: 0,
      errorCount: 0,
      isActive: false
    }
  }

  /**
   * Initialize the pipeline
   */
  async initialize(): Promise<void> {
    try {
      // Initialize format converter
      await this.formatConverter.initialize()

      // Initialize worker manager if enabled
      if (this.workerManager) {
        await this.workerManager.initialize({
          inputFormat: {
            sampleRate: this.config.audio.sampleRate,
            channels: this.config.audio.channels,
            bitDepth: this.config.audio.bitDepth
          },
          outputFormat: {
            format: 'pcm16',
            sampleRate: 16000,
            channels: 1,
            bitDepth: 16
          },
          enableCompression: false,
          qualityLevel: 8,
          lowLatencyMode: true
        })
      }

      // Create audio streaming service
      this.audioStreaming = createRealTimeAudioStreaming({
        sampleRate: this.config.audio.sampleRate,
        channelCount: this.config.audio.channels,
        bitDepth: this.config.audio.bitDepth,
        bufferSize: this.config.processing.bufferSize,
        enableVAD: this.config.processing.enableVAD,
        vadThreshold: this.config.processing.vadThreshold,
        chunkDurationMs: 100,
        maxBufferSize: 32768,
        throttleDelayMs: 50
      })

      // Connect WebSocket
      await this.websocketClient.connect()

      this.emit('initialized')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Start audio streaming to WebSocket
   */
  async startStreaming(): Promise<void> {
    if (!this.audioStreaming) {
      throw new Error('Pipeline not initialized')
    }

    if (this.isActive) {
      return
    }

    try {
      this.isActive = true
      this.metrics.isActive = true

      // Set up audio chunk handler
      this.audioStreaming.on('audioChunk', this.handleAudioChunk.bind(this))
      this.audioStreaming.on('error', this.handleStreamingError.bind(this))

      // Start audio capture
      await this.audioStreaming.startStreaming()

      this.emit('streamingStarted')
    } catch (error) {
      this.isActive = false
      this.metrics.isActive = false
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Stop audio streaming
   */
  async stopStreaming(): Promise<void> {
    if (!this.isActive || !this.audioStreaming) {
      return
    }

    try {
      this.isActive = false
      this.metrics.isActive = false

      // Stop audio streaming
      await this.audioStreaming.stopStreaming()

      this.emit('streamingStopped')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Handle incoming audio chunks
   */
  private async handleAudioChunk(chunk: AudioChunk): Promise<void> {
    if (!this.isActive) {
      return
    }

    try {
      const startTime = Date.now()

      // Convert audio format
      const convertedAudio = await this.formatConverter.convert(chunk.data, chunk.timestamp)

      // Process with worker if available
      let processedData = convertedAudio.data
      if (this.workerManager) {
        try {
          const workerResult = await this.workerManager.processChunks([chunk.data], {
            normalize: true,
            removeNoise: false,
            enableVAD: this.config.processing.enableVAD
          })
          processedData = workerResult.data
        } catch (workerError) {
          // Fall back to direct processing if worker fails
          console.warn('Worker processing failed, using direct processing:', workerError)
        }
      }

      // Convert to base64 for WebSocket transmission
      const base64Data = Buffer.from(processedData).toString('base64')

      // Send to WebSocket
      await this.websocketClient.sendRealtimeInput({
        audio: {
          data: base64Data,
          mimeType: 'audio/pcm'
        }
      })

      // Update metrics
      this.metrics.chunksProcessed++
      this.metrics.bytesStreamed += processedData.byteLength
      this.metrics.averageLatency = (this.metrics.averageLatency + (Date.now() - startTime)) / 2

      this.emit('chunkProcessed', {
        chunkId: chunk.timestamp,
        size: processedData.byteLength,
        latency: Date.now() - startTime
      })
    } catch (error) {
      this.metrics.errorCount++
      this.emit('error', error)
      console.error('Error processing audio chunk:', error)
    }
  }

  /**
   * Handle streaming errors
   */
  private handleStreamingError(error: Error): void {
    this.metrics.errorCount++
    this.emit('error', error)
  }

  /**
   * Get current pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return {...this.metrics}
  }

  /**
   * Check if pipeline is active
   */
  isStreamingActive(): boolean {
    return this.isActive
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.isActive) {
        await this.stopStreaming()
      }

      if (this.audioStreaming) {
        await this.audioStreaming.cleanup()
      }

      if (this.workerManager) {
        await this.workerManager.destroy()
      }

      await this.websocketClient.disconnect()

      this.emit('cleaned')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }
}

/**
 * Factory function to create a pipeline with default configuration
 */
export function createAudioStreamingPipeline(
  config: Partial<AudioPipelineConfig>
): AudioStreamingPipeline {
  const defaultConfig: AudioPipelineConfig = {
    websocket: {
      apiKey: config.websocket?.apiKey || '',
      model: 'gemini-2.0-flash-exp',
      enableReconnect: true
    },
    audio: {
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16
    },
    processing: {
      enableWorkers: true,
      bufferSize: 4096,
      enableVAD: true,
      vadThreshold: 0.01
    }
  }

  const mergedConfig = {
    websocket: {...defaultConfig.websocket, ...config.websocket},
    audio: {...defaultConfig.audio, ...config.audio},
    processing: {...defaultConfig.processing, ...config.processing}
  }

  return new AudioStreamingPipeline(mergedConfig)
}
