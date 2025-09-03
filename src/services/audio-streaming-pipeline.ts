/**
 * Audio Streaming Pipeline
 *
 * Enhanced integration service that coordinates audio streaming to WebSocket with VAD support.
 * Handles the complete data flow: audio chunks → VAD processing → format conversion → WebSocket transmission.
 * Includes voice activity detection and conversation management for Gemini Live API.
 */

import {EventEmitter} from 'events'
import {GeminiLiveWebSocketClient} from './gemini-live-websocket'
import {RealTimeAudioStreamingService, type AudioChunk} from './real-time-audio-streaming'
import {AudioFormatConverter} from './audio-format-converter'
import {AudioWorkerManager} from './audio-worker-manager'
import {createRealTimeAudioStreaming} from './real-time-audio-streaming'
import {VADManager, VADConfig, VADEvent, VADState} from './voice-activity-detector'
import {ConversationManager, ConversationConfig, ConversationState, InterruptionEvent} from './conversation-manager'

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

  // VAD configuration
  vad?: Partial<VADConfig>

  // Conversation management configuration
  conversation?: Partial<ConversationConfig>
}

export interface PipelineMetrics {
  chunksProcessed: number
  bytesStreamed: number
  averageLatency: number
  errorCount: number
  isActive: boolean
  // VAD metrics
  vadMetrics?: {
    speechFrames: number
    silenceFrames: number
    interruptionCount: number
    averageConfidence: number
  }
  // Conversation metrics
  conversationMetrics?: {
    totalTurns: number
    interruptionCount: number
    averageTurnDuration: number
    isUserTurn: boolean
    isModelTurn: boolean
  }
}

/**
 * Enhanced audio streaming pipeline that connects audio capture to WebSocket transmission
 * with integrated voice activity detection and conversation management
 */
export class AudioStreamingPipeline extends EventEmitter {
  private websocketClient: GeminiLiveWebSocketClient
  private audioStreaming: RealTimeAudioStreamingService | null = null
  private formatConverter: AudioFormatConverter
  private workerManager: AudioWorkerManager | null = null
  private vadManager: VADManager | null = null
  private conversationManager: ConversationManager | null = null

  private config: AudioPipelineConfig
  private isActive = false
  private metrics: PipelineMetrics

  constructor(config: AudioPipelineConfig) {
    super()
    this.config = config

    // Initialize core services
    this.websocketClient = new GeminiLiveWebSocketClient({
      apiKey: config.websocket.apiKey,
      model: config.websocket.model || 'gemini-live-2.5-flash-preview'
    })

    this.formatConverter = new AudioFormatConverter()

    if (config.processing.enableWorkers) {
      this.workerManager = new AudioWorkerManager()
    }

    // Initialize VAD if enabled
    if (config.processing.enableVAD) {
      this.vadManager = new VADManager({
        threshold: config.processing.vadThreshold,
        ...config.vad
      })
    }

    // Initialize conversation manager if VAD is enabled
    if (this.vadManager) {
      this.conversationManager = new ConversationManager(
        this.vadManager,
        this.websocketClient,
        config.conversation
      )
    }

    this.metrics = {
      chunksProcessed: 0,
      bytesStreamed: 0,
      averageLatency: 0,
      errorCount: 0,
      isActive: false
    }

    // Set up event forwarding from VAD and conversation managers
    this.setupEventHandlers()
  }

  /**
   * Set up event handlers for VAD and conversation managers
   */
  private setupEventHandlers(): void {
    if (this.vadManager) {
      // Forward VAD events
      this.vadManager.on('speech_start', (event) => this.emit('vad_speech_start', event))
      this.vadManager.on('speech_end', (event) => this.emit('vad_speech_end', event))
      this.vadManager.on('interruption_detected', (event) => this.emit('vad_interruption', event))
      this.vadManager.on('silence_detected', (event) => this.emit('vad_silence', event))
      this.vadManager.on('activity_change', (event) => this.emit('vad_activity_change', event))
    }

    if (this.conversationManager) {
      // Forward conversation events
      this.conversationManager.on('turn_started', (event) => this.emit('conversation_turn_started', event))
      this.conversationManager.on('turn_completed', (event) => this.emit('conversation_turn_completed', event))
      this.conversationManager.on('interruption_processed', (event) => this.emit('conversation_interruption', event))
      this.conversationManager.on('conversation_resumed', (event) => this.emit('conversation_resumed', event))
      this.conversationManager.on('model_response', (event) => this.emit('conversation_model_response', event))
      this.conversationManager.on('conversation_ready', () => this.emit('conversation_ready'))
      this.conversationManager.on('conversation_error', (error) => this.emit('conversation_error', error))
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

      // Initialize VAD manager if enabled
      if (this.vadManager) {
        await this.vadManager.initialize()
      }

      // Initialize conversation manager if enabled
      if (this.conversationManager) {
        this.conversationManager.start()
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

      // Process with VAD if enabled
      let vadEvent: VADEvent | null = null
      if (this.vadManager) {
        // Convert ArrayBuffer to Float32Array for VAD processing
        const audioFloat32 = new Float32Array(chunk.data.byteLength / 4)
        const dataView = new DataView(chunk.data)
        for (let i = 0; i < audioFloat32.length; i++) {
          audioFloat32[i] = dataView.getFloat32(i * 4, true) // little endian
        }
        
        // Process audio chunk through VAD
        vadEvent = this.vadManager.processAudioChunk(audioFloat32, chunk.timestamp)
        
        // Emit VAD event if detected
        if (vadEvent) {
          this.emit('vad_event', vadEvent)
        }
      }

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

      // Send to WebSocket (consider conversation state if managed)
      let shouldTransmit = true
      if (this.conversationManager) {
        const conversationState = this.conversationManager.getState()
        // Only transmit during user turns or when not interrupted
        shouldTransmit = conversationState.isUserTurn || !conversationState.isInterrupted
      }

      if (shouldTransmit) {
        await this.websocketClient.sendRealtimeInput({
          audio: {
            data: base64Data,
            mimeType: 'audio/pcm'
          }
        })
      }

      // Update metrics
      this.updatePipelineMetrics(processedData.byteLength, Date.now() - startTime)

      this.emit('chunkProcessed', {
        chunkId: chunk.timestamp,
        size: processedData.byteLength,
        latency: Date.now() - startTime,
        vadEvent,
        transmitted: shouldTransmit
      })
    } catch (error) {
      this.metrics.errorCount++
      this.emit('error', error)
      console.error('Error processing audio chunk:', error)
    }
  }

  /**
   * Update pipeline metrics including VAD and conversation metrics
   */
  private updatePipelineMetrics(bytesProcessed: number, latency: number): void {
    this.metrics.chunksProcessed++
    this.metrics.bytesStreamed += bytesProcessed
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2

    // Update VAD metrics if available
    if (this.vadManager) {
      const vadMetrics = this.vadManager.getMetrics()
      this.metrics.vadMetrics = {
        speechFrames: vadMetrics.speechFrames,
        silenceFrames: vadMetrics.silenceFrames,
        interruptionCount: vadMetrics.interruptionCount,
        averageConfidence: vadMetrics.averageConfidence
      }
    }

    // Update conversation metrics if available
    if (this.conversationManager) {
      const conversationState = this.conversationManager.getState()
      const turnHistory = this.conversationManager.getTurnHistory()
      
      // Calculate average turn duration
      const completedTurns = turnHistory.filter(turn => turn.isComplete && turn.endTime)
      const averageTurnDuration = completedTurns.length > 0 
        ? completedTurns.reduce((sum, turn) => sum + (turn.endTime! - turn.startTime), 0) / completedTurns.length
        : 0

      this.metrics.conversationMetrics = {
        totalTurns: conversationState.totalTurns,
        interruptionCount: conversationState.interruptionCount,
        averageTurnDuration,
        isUserTurn: conversationState.isUserTurn,
        isModelTurn: conversationState.isModelTurn
      }
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

      // Clean up VAD manager
      if (this.vadManager) {
        this.vadManager.destroy()
        this.vadManager = null
      }

      // Clean up conversation manager
      if (this.conversationManager) {
        this.conversationManager.destroy()
        this.conversationManager = null
      }

      await this.websocketClient.disconnect()

      this.emit('cleaned')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }
  /**
   * Get VAD manager instance
   */
  getVADManager(): VADManager | null {
    return this.vadManager
  }

  /**
   * Get conversation manager instance
   */
  getConversationManager(): ConversationManager | null {
    return this.conversationManager
  }

  /**
   * Get VAD state if available
   */
  getVADState(): VADState | null {
    return this.vadManager ? this.vadManager.getState() : null
  }

  /**
   * Get conversation state if available
   */
  getConversationState(): ConversationState | null {
    return this.conversationManager ? this.conversationManager.getState() : null
  }

  /**
   * Update VAD configuration
   */
  updateVADConfig(config: Partial<VADConfig>): void {
    if (this.vadManager) {
      this.vadManager.updateConfig(config)
    }
  }

  /**
   * Update conversation configuration
   */
  updateConversationConfig(config: Partial<ConversationConfig>): void {
    if (this.conversationManager) {
      this.conversationManager.updateConfig(config)
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
      model: 'gemini-live-2.5-flash-preview',
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
    },
    // Default VAD configuration
    vad: {
      threshold: 0.3,
      minSpeechDuration: 300,
      maxSilenceDuration: 2000,
      enableInterruption: true,
      interruptionThreshold: 0.6,
      gracePeriodMs: 500,
      enableBatchProcessing: true,
      maxProcessingDelay: 50
    },
    // Default conversation configuration
    conversation: {
      enableInterruptions: true,
      interruptionCooldownMs: 1000,
      maxInterruptionsPerMinute: 10,
      pauseOnInterruption: true,
      resumeAfterSilence: true,
      silenceThresholdMs: 2000,
      enableTurnTaking: true,
      turnTimeoutMs: 30000,
      maxResponseWaitMs: 10000,
      bufferInterruptedAudio: true,
      maxBufferSizeMs: 5000
    }
  }

  const mergedConfig = {
    websocket: {...defaultConfig.websocket, ...config.websocket},
    audio: {...defaultConfig.audio, ...config.audio},
    processing: {...defaultConfig.processing, ...config.processing},
    vad: {...defaultConfig.vad, ...config.vad},
    conversation: {...defaultConfig.conversation, ...config.conversation}
  }

  return new AudioStreamingPipeline(mergedConfig)
}
