/**
 * Audio WebSocket Integration Service
 *
 * Connects the real-time audio streaming pipeline with the Gemini Live WebSocket client.
 * Handles audio capture, processing, format conversion, and streaming to the WebSocket.
 */

import {EventEmitter} from 'events'
import {
  GeminiLiveWebSocketClient,
  type GeminiLiveConfig,
  type RealtimeInput,
  ConnectionState
} from './gemini-live-websocket'
import {
  RealTimeAudioStreamingService,
  type AudioStreamingConfig,
  type AudioChunk
} from './real-time-audio-streaming'
import {
  EnhancedAudioRecordingService,
  type AudioRecordingConfig,
  RecordingMode
} from './enhanced-audio-recording'
import {
  AudioFormatConverter,
  type AudioConversionConfig,
  AudioFormat
} from './audio-format-converter'
import {AudioWorkerManager, type AudioWorkerConfig} from './audio-worker-manager'
import {logger} from './gemini-logger'

export interface AudioWebSocketConfig {
  // WebSocket configuration
  websocket: GeminiLiveConfig

  // Audio configuration
  audio: {
    sampleRate?: number
    channels?: number
    bitDepth?: number
    chunkSize?: number
    format?: 'pcm16' | 'opus' | 'aac' | 'mp3'
  }

  // Streaming configuration
  streaming: {
    enableVAD?: boolean
    vadThreshold?: number
    bufferSize?: number
    maxBufferTime?: number
    compressionEnabled?: boolean
    qualityLevel?: number
  }

  // Performance configuration
  performance: {
    useWebWorkers?: boolean
    maxWorkers?: number
    enableMonitoring?: boolean
    enableBackpressureControl?: boolean
  }

  // Behavior configuration
  behavior: {
    autoStart?: boolean
    autoReconnect?: boolean
    enableFallback?: boolean
    streamingMode?: 'real-time' | 'interval' | 'hybrid'
  }
}

export interface StreamingMetrics {
  connectionState: ConnectionState
  audioBufferHealth: number
  processingLatency: number
  throughputBps: number
  droppedChunks: number
  totalChunksProcessed: number
  averageChunkSize: number
  compressionRatio: number
  vadDetections: number
  errorCount: number
  uptime: number
}

export interface AudioStreamingState {
  isConnected: boolean
  isRecording: boolean
  isStreaming: boolean
  isProcessing: boolean
  currentMode: 'real-time' | 'interval' | 'hybrid'
  bufferUtilization: number
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor'
}

export enum StreamingEvent {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECORDING_STARTED = 'recording_started',
  RECORDING_STOPPED = 'recording_stopped',
  STREAMING_STARTED = 'streaming_started',
  STREAMING_STOPPED = 'streaming_stopped',
  AUDIO_CHUNK_PROCESSED = 'audio_chunk_processed',
  AUDIO_CHUNK_SENT = 'audio_chunk_sent',
  ERROR = 'error',
  METRICS_UPDATED = 'metrics_updated',
  STATE_CHANGED = 'state_changed',
  TRANSCRIPTION_RECEIVED = 'transcription_received'
}

/**
 * Main integration service that orchestrates audio streaming to WebSocket
 */
export class AudioWebSocketIntegration extends EventEmitter {
  private config: AudioWebSocketConfig
  private websocketClient: GeminiLiveWebSocketClient
  private audioStreaming: RealTimeAudioStreamingService
  private audioRecording: EnhancedAudioRecordingService
  private formatConverter: AudioFormatConverter
  private workerManager: AudioWorkerManager

  private isInitialized = false
  private isActive = false
  private state: AudioStreamingState
  private metrics: StreamingMetrics
  private metricsInterval: NodeJS.Timeout | null = null

  // Performance monitoring
  private startTime = 0
  private lastChunkTime = 0
  private totalBytesProcessed = 0
  private chunkCounter = 0
  private errorCounter = 0

  constructor(config: AudioWebSocketConfig) {
    super()
    this.config = this.validateAndNormalizeConfig(config)

    // Initialize services
    this.websocketClient = new GeminiLiveWebSocketClient(config)
    this.audioStreaming = new RealTimeAudioStreamingService()
    this.audioRecording = new EnhancedAudioRecordingService()
    this.formatConverter = new AudioFormatConverter()
    this.workerManager = new AudioWorkerManager()

    // Initialize state
    this.state = {
      isConnected: false,
      isRecording: false,
      isStreaming: false,
      isProcessing: false,
      currentMode: this.config.behavior.streamingMode || 'hybrid',
      bufferUtilization: 0,
      networkQuality: 'good'
    }

    // Initialize metrics
    this.metrics = {
      connectionState: ConnectionState.DISCONNECTED,
      audioBufferHealth: 0,
      processingLatency: 0,
      throughputBps: 0,
      droppedChunks: 0,
      totalChunksProcessed: 0,
      averageChunkSize: 0,
      compressionRatio: 1,
      vadDetections: 0,
      errorCount: 0,
      uptime: 0
    }

    this.setupServices()
    this.setupEventHandlers()

    logger.info('AudioWebSocketIntegration initialized', {
      audioConfig: this.config.audio,
      streamingMode: this.state.currentMode,
      useWebWorkers: this.config.performance.useWebWorkers
    })
  }

  /**
   * Initialize all audio and WebSocket services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      logger.info('Initializing audio WebSocket integration...')

      // Initialize format converter
      const formatConfig: AudioConversionConfig = {
        inputFormat: {
          sampleRate: this.config.audio.sampleRate || 44100,
          channels: this.config.audio.channels || 1,
          bitDepth: this.config.audio.bitDepth || 16
        },
        outputFormat: {
          format: AudioFormat.PCM16,
          sampleRate: 16000, // Gemini Live API requirement
          channels: 1,
          bitDepth: 16
        },
        enableCompression: this.config.streaming.compressionEnabled || false,
        qualityLevel: this.config.streaming.qualityLevel || 0.8,
        lowLatencyMode: true
      }

      await this.formatConverter.initialize()

      // Initialize worker manager if enabled
      if (this.config.performance.useWebWorkers) {
        const workerConfig = {
          inputFormat: formatConfig.inputFormat,
          outputFormat: formatConfig.outputFormat,
          enableCompression: formatConfig.enableCompression,
          qualityLevel: formatConfig.qualityLevel,
          lowLatencyMode: true
        }

        await this.workerManager.initialize(workerConfig)
      }

      // Initialize audio recording service with proper configuration
      const recordingConfig: AudioRecordingConfig = {
        mode: RecordingMode.HYBRID,
        intervalSeconds: 10,
        enableRealTimeStreaming: this.config.streaming.enableVAD || true,
        bufferSize: this.config.streaming.bufferSize || 4096,
        adaptiveBuffering: this.config.performance.enableBackpressureControl || true
      }

      // Update the audio recording service configuration
      this.audioRecording.updateConfig(recordingConfig)
      await this.audioRecording.initialize()

      // Initialize real-time streaming service with optimized configuration
      const streamConfig: AudioStreamingConfig = {
        sampleRate: this.config.audio.sampleRate || 16000,
        channelCount: this.config.audio.channels || 1,
        bitDepth: this.config.audio.bitDepth || 16,
        bufferSize: this.config.streaming.bufferSize || 2048, // Reduced for lower latency
        chunkDurationMs: 50, // Shorter chunks for faster streaming
        maxBufferSize: 16384, // Reduced buffer size for real-time performance
        throttleDelayMs: 25, // Reduced throttle for faster response
        enableVAD: this.config.streaming.enableVAD || true,
        vadThreshold: this.config.streaming.vadThreshold || 0.01
      }

      // Update the streaming service configuration
      this.audioStreaming.updateConfig(streamConfig)
      await this.audioStreaming.initialize(this.websocketClient)

      this.isInitialized = true

      // Start metrics monitoring if enabled
      if (this.config.performance.enableMonitoring) {
        this.startMetricsMonitoring()
      }

      logger.info('Audio WebSocket integration initialized successfully')

      // Auto-connect if configured
      if (this.config.behavior.autoStart) {
        await this.connect()
      }
    } catch (error) {
      this.errorCounter++
      logger.error('Failed to initialize audio WebSocket integration', {error})
      throw error
    }
  }

  /**
   * Connect to WebSocket and prepare for audio streaming
   */
  async connect(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('AudioWebSocketIntegration not initialized')
    }

    if (this.state.isConnected) {
      return
    }

    try {
      logger.info('Connecting to Gemini Live WebSocket...')
      await this.websocketClient.connect()

      this.state.isConnected = true
      this.startTime = Date.now()
      this.updateState()

      this.emit(StreamingEvent.CONNECTED)
      logger.info('Successfully connected to Gemini Live WebSocket')
    } catch (error) {
      this.errorCounter++
      this.state.isConnected = false
      this.updateState()

      logger.error('Failed to connect to WebSocket', {error})
      this.emit(StreamingEvent.ERROR, error)
      throw error
    }
  }

  /**
   * Start audio recording and streaming
   */
  async startStreaming(): Promise<void> {
    if (!this.state.isConnected) {
      throw new Error('WebSocket not connected')
    }

    if (this.state.isStreaming) {
      return
    }

    try {
      logger.info('Starting audio streaming...', {mode: this.state.currentMode})

      // Start audio recording
      await this.audioRecording.startRecording()
      this.state.isRecording = true

      // Start real-time streaming
      await this.audioStreaming.startStreaming()
      this.state.isStreaming = true
      this.state.isProcessing = true

      this.isActive = true
      this.updateState()

      this.emit(StreamingEvent.STREAMING_STARTED)
      logger.info('Audio streaming started successfully')
    } catch (error) {
      this.errorCounter++
      await this.stopStreaming()

      logger.error('Failed to start audio streaming', {error})
      this.emit(StreamingEvent.ERROR, error)
      throw error
    }
  }

  /**
   * Stop audio recording and streaming
   */
  async stopStreaming(): Promise<void> {
    if (!this.state.isStreaming && !this.state.isRecording) {
      return
    }

    try {
      logger.info('Stopping audio streaming...')

      // Stop streaming services
      if (this.state.isStreaming) {
        await this.audioStreaming.stopStreaming()
        this.state.isStreaming = false
      }

      if (this.state.isRecording) {
        await this.audioRecording.stopRecording()
        this.state.isRecording = false
      }

      this.state.isProcessing = false
      this.isActive = false
      this.updateState()

      this.emit(StreamingEvent.STREAMING_STOPPED)
      logger.info('Audio streaming stopped successfully')
    } catch (error) {
      this.errorCounter++
      logger.error('Error stopping audio streaming', {error})
      this.emit(StreamingEvent.ERROR, error)
    }
  }

  /**
   * Disconnect from WebSocket
   */
  async disconnect(): Promise<void> {
    try {
      // Stop streaming first
      if (this.state.isStreaming || this.state.isRecording) {
        await this.stopStreaming()
      }

      // Disconnect WebSocket
      if (this.state.isConnected) {
        await this.websocketClient.disconnect()
        this.state.isConnected = false
      }

      this.updateState()
      this.emit(StreamingEvent.DISCONNECTED)

      logger.info('Disconnected from WebSocket')
    } catch (error) {
      this.errorCounter++
      logger.error('Error during disconnect', {error})
      this.emit(StreamingEvent.ERROR, error)
    }
  }

  /**
   * Get current streaming state
   */
  getState(): AudioStreamingState {
    return {...this.state}
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamingMetrics {
    return {...this.metrics}
  }

  /**
   * Update streaming mode
   */
  async setStreamingMode(mode: 'real-time' | 'interval' | 'hybrid'): Promise<void> {
    if (this.state.currentMode === mode) {
      return
    }

    const wasActive = this.isActive

    if (wasActive) {
      await this.stopStreaming()
    }

    this.state.currentMode = mode

    // Update recording service mode
    await this.audioRecording.updateConfig({mode})

    if (wasActive) {
      await this.startStreaming()
    }

    this.updateState()
    logger.info('Streaming mode updated', {newMode: mode})
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    try {
      logger.info('Destroying audio WebSocket integration...')

      // Stop metrics monitoring
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval)
        this.metricsInterval = null
      }

      // Disconnect and cleanup
      await this.disconnect()

      // Cleanup services
      await this.audioStreaming.destroy()
      await this.audioRecording.destroy()
      await this.formatConverter.destroy()

      if (this.config.performance.useWebWorkers) {
        await this.workerManager.destroy()
      }

      this.isInitialized = false
      this.removeAllListeners()

      logger.info('Audio WebSocket integration destroyed')
    } catch (error) {
      logger.error('Error during cleanup', {error})
    }
  }

  /**
   * Setup all services with optimized configuration
   */
  private setupServices(): void {
    // Enhanced WebSocket configuration for optimal transcription performance
    // Merge with user-provided config, allowing overrides for flexibility
    const optimizedWebSocketConfig = {
      connectionTimeout: 15000, // Default increased connection timeout
      maxQueueSize: 30, // Default optimized queue size for transcription
      responseModalities: ['TEXT'], // Default optimize for text transcription
      systemInstruction:
        'You are a speech-to-text transcription assistant. Provide accurate, concise transcriptions of the audio input.',
      reconnectAttempts: 3, // Default reduced for faster fallback to batch mode
      heartbeatInterval: 60000, // Default longer interval to reduce overhead
      ...this.config.websocket // User config overrides defaults
    }

    this.websocketClient = new GeminiLiveWebSocketClient(optimizedWebSocketConfig)
    this.audioStreaming = new RealTimeAudioStreamingService()

    // Create audio recording service with default config (will be updated in initialize)
    this.audioRecording = new EnhancedAudioRecordingService()
    this.formatConverter = new AudioFormatConverter()

    if (this.config.performance.useWebWorkers) {
      const workerConfig: AudioWorkerConfig = {
        maxWorkers: this.config.performance.maxWorkers || 2,
        workerIdleTimeout: 30000,
        enableLogging: false,
        fallbackToMainThread: true
      }
      this.workerManager = new AudioWorkerManager(workerConfig)
    }
  }

  /**
   * Setup event handlers for all services
   */
  private setupEventHandlers(): void {
    // WebSocket events
    this.websocketClient.on('connected', () => {
      this.state.isConnected = true
      this.metrics.connectionState = ConnectionState.CONNECTED
      this.updateState()
    })

    this.websocketClient.on('disconnected', () => {
      this.state.isConnected = false
      this.metrics.connectionState = ConnectionState.DISCONNECTED
      this.updateState()
    })

    this.websocketClient.on('error', error => {
      this.errorCounter++
      this.metrics.errorCount = this.errorCounter
      this.emit(StreamingEvent.ERROR, error)
    })

    this.websocketClient.on('transcriptionUpdate', data => {
      this.emit(StreamingEvent.TRANSCRIPTION_RECEIVED, data)
    })

    // Audio streaming events
    this.audioStreaming.on('audioChunk', (chunk: AudioChunk) => {
      this.handleAudioChunk(chunk)
    })

    this.audioStreaming.on('vadDetected', () => {
      this.metrics.vadDetections++
    })

    this.audioStreaming.on('error', error => {
      this.errorCounter++
      this.metrics.errorCount = this.errorCounter
      this.emit(StreamingEvent.ERROR, error)
    })

    // Audio recording events
    this.audioRecording.on('stateChanged', (newState: RecordingState) => {
      this.state.bufferUtilization = newState.bufferHealth || 0
      this.updateState()
    })

    this.audioRecording.on('error', error => {
      this.errorCounter++
      this.metrics.errorCount = this.errorCounter
      this.emit(StreamingEvent.ERROR, error)
    })
  }

  /**
   * Handle incoming audio chunk and process for WebSocket transmission
   */
  private async handleAudioChunk(chunk: AudioChunk): Promise<void> {
    try {
      const processingStart = performance.now()

      // Convert audio format if needed
      let processedData: ArrayBuffer

      if (this.config.performance.useWebWorkers && this.workerManager) {
        // Process through Web Worker
        const result = await this.workerManager.convertAudio(chunk.data, chunk.timestamp)
        processedData = result.data
        this.metrics.compressionRatio = result.compressionRatio || 1
      } else {
        // Process on main thread
        const result = await this.formatConverter.convertAudio(chunk.data, {
          timestamp: chunk.timestamp
        })
        processedData = result.data
      }

      // Convert to base64 for WebSocket transmission (raw PCM data, no WAV headers needed)
      const base64Data = this.arrayBufferToBase64(processedData)

      // Create realtime input for WebSocket
      const realtimeInput: RealtimeInput = {
        audio: {
          data: base64Data,
          mimeType: this.getMimeType()
        }
      }

      // Send to WebSocket
      await this.websocketClient.sendRealtimeInput(realtimeInput)

      // Update metrics
      const processingTime = performance.now() - processingStart
      this.updateMetrics(chunk, processedData.byteLength, processingTime)

      this.emit(StreamingEvent.AUDIO_CHUNK_PROCESSED, {
        originalSize: chunk.data.length,
        processedSize: processedData.byteLength,
        processingTime
      })

      this.emit(StreamingEvent.AUDIO_CHUNK_SENT, realtimeInput)
    } catch (error) {
      this.errorCounter++
      this.metrics.droppedChunks++
      this.metrics.errorCount = this.errorCounter

      logger.error('Failed to process audio chunk', {error})
      this.emit(StreamingEvent.ERROR, error)
    }
  }

  /**
   * Update performance metrics with enhanced tracking
   */
  private updateMetrics(chunk: AudioChunk, processedSize: number, processingTime: number): void {
    this.chunkCounter++
    this.totalBytesProcessed += processedSize
    this.lastChunkTime = Date.now()

    // Update metrics with optimized calculations
    this.metrics.totalChunksProcessed = this.chunkCounter
    this.metrics.processingLatency = processingTime
    this.metrics.averageChunkSize = this.totalBytesProcessed / this.chunkCounter

    // Calculate optimized throughput (bytes per second)
    const uptimeSeconds = Math.max((Date.now() - this.startTime) / 1000, 0.1) // Prevent division by zero
    this.metrics.throughputBps = this.totalBytesProcessed / uptimeSeconds
    this.metrics.uptime = uptimeSeconds

    // Enhanced audio buffer health monitoring
    if (this.audioRecording) {
      const recordingState = this.audioRecording.getState()
      this.metrics.audioBufferHealth = recordingState.bufferHealth || 0
    }

    // Log performance improvements for monitoring
    if (this.chunkCounter % 10 === 0) {
      // Log every 10 chunks
      logger.debug('Audio processing performance', {
        totalChunks: this.chunkCounter,
        averageLatency: processingTime,
        throughputKbps: Math.round(this.metrics.throughputBps / 1024),
        bufferHealth: this.metrics.audioBufferHealth
      })
    }
  }

  /**
   * Start periodic metrics monitoring
   */
  private startMetricsMonitoring(): void {
    this.metricsInterval = setInterval(() => {
      this.emit(StreamingEvent.METRICS_UPDATED, this.metrics)
    }, 1000) // Update every second
  }

  /**
   * Update and emit state changes
   */
  private updateState(): void {
    // Assess network quality based on metrics
    this.assessNetworkQuality()

    this.emit(StreamingEvent.STATE_CHANGED, this.state)
  }

  /**
   * Assess network quality based on current metrics
   */
  private assessNetworkQuality(): void {
    const {processingLatency, droppedChunks, totalChunksProcessed} = this.metrics

    const dropRate = totalChunksProcessed > 0 ? droppedChunks / totalChunksProcessed : 0

    if (processingLatency < 50 && dropRate < 0.01) {
      this.state.networkQuality = 'excellent'
    } else if (processingLatency < 100 && dropRate < 0.05) {
      this.state.networkQuality = 'good'
    } else if (processingLatency < 200 && dropRate < 0.1) {
      this.state.networkQuality = 'fair'
    } else {
      this.state.networkQuality = 'poor'
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Get MIME type for current audio format
   */
  private getMimeType(): string {
    const format = this.config.audio.format || 'pcm16'

    switch (format) {
      case 'pcm16':
        return 'audio/pcm' // Gemini Live API expects plain "audio/pcm" without rate parameter
      case 'opus':
        return 'audio/opus'
      case 'aac':
        return 'audio/aac'
      case 'mp3':
        return 'audio/mpeg'
      default:
        return 'audio/pcm' // Default to plain PCM format for Gemini Live API
    }
  }

  /**
   * Validate and normalize configuration with optimized defaults
   */
  private validateAndNormalizeConfig(config: AudioWebSocketConfig): AudioWebSocketConfig {
    // Set optimized defaults for better performance
    const normalized: AudioWebSocketConfig = {
      websocket: config.websocket,
      audio: {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 16,
        chunkSize: 512, // Smaller chunks for lower latency
        format: 'pcm16',
        ...config.audio
      },
      streaming: {
        enableVAD: true,
        vadThreshold: 0.01,
        bufferSize: 2048, // Reduced for lower latency
        maxBufferTime: 3000, // Reduced buffer time for real-time performance
        compressionEnabled: false,
        qualityLevel: 0.9, // Higher quality for better transcription
        ...config.streaming
      },
      performance: {
        useWebWorkers: true,
        maxWorkers: 2,
        enableMonitoring: true,
        enableBackpressureControl: true,
        ...config.performance
      },
      behavior: {
        autoStart: false,
        autoReconnect: true,
        enableFallback: true,
        streamingMode: 'real-time', // Optimized for real-time transcription
        ...config.behavior
      }
    }

    // Validate required fields
    if (!normalized.websocket.apiKey) {
      throw new Error('WebSocket API key is required')
    }

    // Validate audio configuration
    if (normalized.audio.sampleRate && normalized.audio.sampleRate < 8000) {
      throw new Error('Sample rate must be at least 8000 Hz')
    }

    if (
      normalized.audio.channels &&
      (normalized.audio.channels < 1 || normalized.audio.channels > 2)
    ) {
      throw new Error('Channels must be 1 or 2')
    }

    return normalized
  }
}

export default AudioWebSocketIntegration
