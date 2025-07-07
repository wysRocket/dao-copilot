/**
 * Transcription Pipeline Service
 *
 * Central orchestrator for the complete transcription workflow, coordinating between
 * audio recording, WebSocket streaming, and transcription processing. Provides a
 * unified interface for both real-time and batch transcription modes.
 */

import {EventEmitter} from 'events'
import {GeminiLiveIntegrationService, TranscriptionMode} from './gemini-live-integration'
import {GeminiLiveIntegrationFactory} from './gemini-live-integration-factory'
import {AudioRecordingService} from './audio-recording'
import {EnhancedAudioRecordingService, RecordingMode} from './enhanced-audio-recording'
import {AudioWebSocketIntegration} from './audio-websocket-integration'
import {AudioStreamingPipeline} from './audio-streaming-pipeline'
import type {TranscriptionResult} from './audio-recording'

/**
 * Pipeline configuration options
 */
export interface TranscriptionPipelineConfig {
  // API Configuration
  apiKey?: string
  model?: string

  // Processing Mode
  mode?: TranscriptionMode // 'websocket', 'batch', 'hybrid'
  recordingMode?: RecordingMode // 'realtime', 'interval', 'hybrid'

  // Audio Configuration
  sampleRate?: number
  channelCount?: number
  bufferSize?: number

  // Real-time Configuration
  enableRealTime?: boolean
  realTimeThreshold?: number // ms - minimum audio length for real-time processing
  chunkDurationMs?: number

  // Fallback Configuration
  fallbackToBatch?: boolean
  fallbackDelay?: number // ms
  maxRetries?: number

  // Performance Configuration
  enableVAD?: boolean // Voice Activity Detection
  vadThreshold?: number
  enableCompression?: boolean
  enableWorkers?: boolean

  // UI Configuration
  enableDebouncing?: boolean
  debounceInterval?: number // ms
  maxTranscripts?: number // Maximum stored transcripts
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: Required<TranscriptionPipelineConfig> = {
  // API Configuration
  apiKey: '',
  model: 'gemini-live-2.5-flash-preview',

  // Processing Mode
  mode: TranscriptionMode.HYBRID,
  recordingMode: RecordingMode.HYBRID,

  // Audio Configuration
  sampleRate: 16000,
  channelCount: 1,
  bufferSize: 4096,

  // Real-time Configuration
  enableRealTime: true,
  realTimeThreshold: 1000, // 1 second
  chunkDurationMs: 100,

  // Fallback Configuration
  fallbackToBatch: true,
  fallbackDelay: 2000, // 2 seconds
  maxRetries: 3,

  // Performance Configuration
  enableVAD: true,
  vadThreshold: 0.01,
  enableCompression: false,
  enableWorkers: true,

  // UI Configuration
  enableDebouncing: true,
  debounceInterval: 150, // ms
  maxTranscripts: 100
}

/**
 * Pipeline state information
 */
export interface PipelineState {
  // Connection Status
  isConnected: boolean
  isInitialized: boolean
  connectionQuality: 'good' | 'fair' | 'poor' | 'disconnected'

  // Recording Status
  isRecording: boolean
  isStreaming: boolean
  isProcessing: boolean

  // Current Mode
  currentMode: TranscriptionMode
  recordingMode: RecordingMode

  // Performance Metrics
  latency: number // ms
  throughput: number // bytes/second
  bufferHealth: number // 0-1
  droppedFrames: number

  // Error Information
  lastError?: Error
  retryCount: number

  // Transcription Status
  transcriptCount: number
  processingQueue: number
}

/**
 * Pipeline events
 */
export enum PipelineEvent {
  // Connection Events
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTION_QUALITY_CHANGED = 'connectionQualityChanged',

  // Recording Events
  RECORDING_STARTED = 'recordingStarted',
  RECORDING_STOPPED = 'recordingStopped',
  STREAMING_STARTED = 'streamingStarted',
  STREAMING_STOPPED = 'streamingStopped',

  // Transcription Events
  TRANSCRIPTION_STARTED = 'transcriptionStarted',
  TRANSCRIPTION_RECEIVED = 'transcriptionReceived',
  TRANSCRIPTION_COMPLETED = 'transcriptionCompleted',

  // Mode Events
  MODE_CHANGED = 'modeChanged',
  FALLBACK_ACTIVATED = 'fallbackActivated',

  // Error Events
  ERROR = 'error',
  WARNING = 'warning',

  // Performance Events
  METRICS_UPDATED = 'metricsUpdated',
  BUFFER_OVERFLOW = 'bufferOverflow',

  // State Events
  STATE_CHANGED = 'stateChanged'
}

/**
 * Main Transcription Pipeline Service
 *
 * Orchestrates the complete transcription workflow from audio input to final text output.
 * Supports multiple processing modes and provides comprehensive error handling and fallback mechanisms.
 */
export class TranscriptionPipeline extends EventEmitter {
  private config: Required<TranscriptionPipelineConfig>
  private state: PipelineState

  // Core Services
  private integrationService: GeminiLiveIntegrationService | null = null
  private audioRecording: AudioRecordingService | null = null
  private enhancedRecording: EnhancedAudioRecordingService | null = null
  private websocketIntegration: AudioWebSocketIntegration | null = null
  private streamingPipeline: AudioStreamingPipeline | null = null

  // State Management
  private transcripts: TranscriptionResult[] = []
  private processingQueue: Map<string, Promise<TranscriptionResult>> = new Map()

  // Performance Optimization
  private debounceTimer: NodeJS.Timeout | null = null
  private metricsInterval: NodeJS.Timeout | null = null

  // Error Handling
  private retryTimer: NodeJS.Timeout | null = null
  private isRetrying = false

  constructor(config: Partial<TranscriptionPipelineConfig> = {}) {
    super()

    this.config = {...DEFAULT_PIPELINE_CONFIG, ...config}

    // Initialize state
    this.state = {
      isConnected: false,
      isInitialized: false,
      connectionQuality: 'disconnected',
      isRecording: false,
      isStreaming: false,
      isProcessing: false,
      currentMode: this.config.mode,
      recordingMode: this.config.recordingMode,
      latency: 0,
      throughput: 0,
      bufferHealth: 1.0,
      droppedFrames: 0,
      retryCount: 0,
      transcriptCount: 0,
      processingQueue: 0
    }
  }

  /**
   * Initialize the transcription pipeline
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      return
    }

    try {
      console.log('Initializing transcription pipeline...')

      // Get API key
      const apiKey = this.getApiKey()

      // Initialize integration service
      this.integrationService = GeminiLiveIntegrationFactory.createProduction(apiKey, {
        mode: this.config.mode,
        fallbackToBatch: this.config.fallbackToBatch,
        realTimeThreshold: this.config.realTimeThreshold,
        model: this.config.model
      })

      // Set up integration service event handlers
      this.setupIntegrationHandlers()

      // Initialize recording services based on mode
      await this.initializeRecordingServices()

      // Initialize WebSocket integration if needed
      if (this.shouldUseWebSocket()) {
        await this.initializeWebSocketServices()
      }

      // Start performance monitoring
      this.startMetricsMonitoring()

      this.updateState({
        isInitialized: true,
        isConnected: false // Will be updated by connection events
      })

      this.emit(PipelineEvent.STATE_CHANGED, this.state)
      console.log('Transcription pipeline initialized successfully')
    } catch (error) {
      console.error('Failed to initialize transcription pipeline:', error)
      this.updateState({lastError: error as Error})
      this.emit(PipelineEvent.ERROR, error)
      throw error
    }
  }

  /**
   * Start transcription with current configuration
   */
  async startTranscription(): Promise<void> {
    if (!this.state.isInitialized) {
      await this.initialize()
    }

    if (this.state.isRecording) {
      console.log('Transcription already in progress')
      return
    }

    try {
      console.log(`Starting transcription in ${this.state.currentMode} mode`)

      this.updateState({
        isRecording: true,
        isProcessing: true,
        retryCount: 0
      })

      this.emit(PipelineEvent.TRANSCRIPTION_STARTED)

      // Start appropriate recording service
      if (
        this.config.recordingMode === RecordingMode.REALTIME ||
        this.config.recordingMode === RecordingMode.HYBRID
      ) {
        if (this.enhancedRecording) {
          await this.enhancedRecording.startRecording(this.handleTranscriptionResult.bind(this))
        }

        if (this.websocketIntegration) {
          await this.websocketIntegration.startStreaming()
          this.updateState({isStreaming: true})
          this.emit(PipelineEvent.STREAMING_STARTED)
        }
      } else {
        // Interval mode
        if (this.audioRecording) {
          this.audioRecording.startIntervalRecording(this.handleTranscriptionResult.bind(this))
        }
      }

      this.emit(PipelineEvent.RECORDING_STARTED)
    } catch (error) {
      console.error('Failed to start transcription:', error)
      await this.handleError(error as Error)
    }
  }

  /**
   * Stop transcription
   */
  async stopTranscription(): Promise<void> {
    if (!this.state.isRecording) {
      return
    }

    try {
      console.log('Stopping transcription...')

      // Stop recording services
      if (this.enhancedRecording) {
        await this.enhancedRecording.stopRecording()
      }

      if (this.audioRecording) {
        this.audioRecording.stopIntervalRecording()
      }

      if (this.websocketIntegration) {
        await this.websocketIntegration.stopStreaming()
        this.updateState({isStreaming: false})
        this.emit(PipelineEvent.STREAMING_STOPPED)
      }

      // Wait for processing queue to complete
      await this.waitForProcessingComplete()

      this.updateState({
        isRecording: false,
        isProcessing: false
      })

      this.emit(PipelineEvent.RECORDING_STOPPED)
      console.log('Transcription stopped successfully')
    } catch (error) {
      console.error('Error stopping transcription:', error)
      this.emit(PipelineEvent.ERROR, error)
    }
  }

  /**
   * Toggle transcription state
   */
  async toggleTranscription(): Promise<void> {
    if (this.state.isRecording) {
      await this.stopTranscription()
    } else {
      await this.startTranscription()
    }
  }

  /**
   * Switch transcription mode
   */
  async switchMode(mode: TranscriptionMode): Promise<void> {
    if (this.state.currentMode === mode) {
      return
    }

    const wasRecording = this.state.isRecording

    if (wasRecording) {
      await this.stopTranscription()
    }

    this.config.mode = mode
    this.updateState({currentMode: mode})

    // Reinitialize services if needed
    if (this.integrationService) {
      // Update integration service mode
      // Note: This would require adding a mode switching method to the integration service
    }

    if (wasRecording) {
      await this.startTranscription()
    }

    this.emit(PipelineEvent.MODE_CHANGED, mode)
  }

  /**
   * Get current transcription results
   */
  getTranscripts(): TranscriptionResult[] {
    return [...this.transcripts]
  }

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return {...this.state}
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<TranscriptionPipelineConfig> {
    return {...this.config}
  }

  /**
   * Clear transcription history
   */
  clearTranscripts(): void {
    this.transcripts = []
    this.updateState({transcriptCount: 0})
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(updates: Partial<TranscriptionPipelineConfig>): void {
    this.config = {...this.config, ...updates}

    // Apply relevant updates to services
    if (updates.recordingMode && this.enhancedRecording) {
      this.enhancedRecording.updateConfig({mode: updates.recordingMode})
    }
  }

  /**
   * Cleanup and destroy the pipeline
   */
  async destroy(): Promise<void> {
    try {
      // Stop any active transcription
      if (this.state.isRecording) {
        await this.stopTranscription()
      }

      // Clear timers
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }

      if (this.metricsInterval) {
        clearInterval(this.metricsInterval)
      }

      if (this.retryTimer) {
        clearTimeout(this.retryTimer)
      }

      // Cleanup services
      if (this.enhancedRecording) {
        this.enhancedRecording.destroy()
      }

      if (this.audioRecording) {
        this.audioRecording.destroy()
      }

      if (this.websocketIntegration) {
        await this.websocketIntegration.destroy()
      }

      if (this.streamingPipeline) {
        // Cleanup streaming pipeline if it has a destroy method
      }

      // Clear state
      this.transcripts = []
      this.processingQueue.clear()

      this.updateState({
        isInitialized: false,
        isConnected: false,
        isRecording: false,
        isStreaming: false,
        isProcessing: false
      })

      console.log('Transcription pipeline destroyed')
    } catch (error) {
      console.error('Error destroying transcription pipeline:', error)
    }
  }

  /**
   * Get API key from configuration or environment
   */
  private getApiKey(): string {
    const apiKey =
      this.config.apiKey ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY

    if (!apiKey) {
      throw new Error('Google API Key is required for transcription pipeline')
    }

    return apiKey
  }

  /**
   * Check if WebSocket mode should be used
   */
  private shouldUseWebSocket(): boolean {
    const webSocketEnabled = process.env.GEMINI_WEBSOCKET_ENABLED !== 'false'
    return (
      webSocketEnabled &&
      this.config.enableRealTime &&
      (this.config.mode === TranscriptionMode.WEBSOCKET ||
        this.config.mode === TranscriptionMode.HYBRID)
    )
  }

  /**
   * Initialize recording services
   */
  private async initializeRecordingServices(): Promise<void> {
    // Initialize enhanced recording service (supports all modes)
    this.enhancedRecording = new EnhancedAudioRecordingService({
      mode: this.config.recordingMode,
      enableRealTimeStreaming: this.config.enableRealTime,
      bufferSize: this.config.bufferSize,
      adaptiveBuffering: true
    })

    if (this.integrationService) {
      await this.enhancedRecording.initialize(this.integrationService)
    }

    // Also initialize legacy recording service for fallback
    this.audioRecording = new AudioRecordingService()

    // Set up recording event handlers
    this.setupRecordingHandlers()
  }

  /**
   * Initialize WebSocket services
   */
  private async initializeWebSocketServices(): Promise<void> {
    if (!this.shouldUseWebSocket()) {
      return
    }

    try {
      // Initialize WebSocket integration
      this.websocketIntegration = new AudioWebSocketIntegration({
        websocket: {
          apiKey: this.getApiKey(),
          model: this.config.model
        },
        audio: {
          sampleRate: this.config.sampleRate,
          channels: this.config.channelCount,
          bitDepth: 16
        },
        streaming: {
          enableVAD: this.config.enableVAD,
          vadThreshold: this.config.vadThreshold,
          bufferSize: this.config.bufferSize,
          compressionEnabled: this.config.enableCompression
        },
        performance: {
          useWebWorkers: this.config.enableWorkers,
          enableBackpressureControl: true
        },
        behavior: {
          streamingMode: 'hybrid'
        }
      })

      await this.websocketIntegration.initialize()
      this.setupWebSocketHandlers()
    } catch (error) {
      console.warn('Failed to initialize WebSocket services, falling back to batch mode:', error)
      this.emit(PipelineEvent.WARNING, {
        message: 'WebSocket initialization failed, falling back to batch mode',
        error
      })
    }
  }

  /**
   * Set up integration service event handlers
   */
  private setupIntegrationHandlers(): void {
    if (!this.integrationService) return

    this.integrationService.on('connected', () => {
      this.updateState({
        isConnected: true,
        connectionQuality: 'good'
      })
      this.emit(PipelineEvent.CONNECTED)
    })

    this.integrationService.on('disconnected', () => {
      this.updateState({
        isConnected: false,
        connectionQuality: 'disconnected'
      })
      this.emit(PipelineEvent.DISCONNECTED)
    })

    this.integrationService.on('transcription', (result, source) => {
      this.handleTranscriptionResult({
        ...result,
        source: source as string
      })
    })

    this.integrationService.on('error', error => {
      this.handleError(error)
    })
  }

  /**
   * Set up recording service event handlers
   */
  private setupRecordingHandlers(): void {
    if (this.enhancedRecording) {
      this.enhancedRecording.getStateObservable().subscribe(state => {
        this.updateState({
          bufferHealth: state.bufferHealth,
          isStreaming: state.isStreaming
        })
      })
    }

    if (this.audioRecording) {
      this.audioRecording.onStateChange(state => {
        // Handle legacy recording state changes if needed
        // Currently no specific handling required
      })
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.websocketIntegration) return

    this.websocketIntegration.on('connected', () => {
      this.updateState({connectionQuality: 'good'})
    })

    this.websocketIntegration.on('disconnected', () => {
      this.updateState({connectionQuality: 'disconnected'})
    })

    this.websocketIntegration.on('transcriptionReceived', result => {
      this.handleTranscriptionResult(result)
    })

    this.websocketIntegration.on('metricsUpdated', metrics => {
      this.updateState({
        latency: metrics.processingLatency || 0,
        throughput: metrics.throughputBps || 0,
        droppedFrames: metrics.droppedChunks || 0
      })
    })

    this.websocketIntegration.on('error', error => {
      this.handleError(error)
    })
  }

  /**
   * Handle transcription results
   */
  private handleTranscriptionResult(result: TranscriptionResult): void {
    if (!result.text.trim()) {
      return // Skip empty results
    }

    // Add to transcripts with debouncing if enabled
    if (this.config.enableDebouncing) {
      this.debouncedAddTranscript(result)
    } else {
      this.addTranscript(result)
    }
  }

  /**
   * Add transcript with debouncing
   */
  private debouncedAddTranscript(result: TranscriptionResult): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.addTranscript(result)
    }, this.config.debounceInterval)
  }

  /**
   * Add transcript to collection
   */
  private addTranscript(result: TranscriptionResult): void {
    this.transcripts.push(result)

    // Limit transcript history
    if (this.transcripts.length > this.config.maxTranscripts) {
      this.transcripts = this.transcripts.slice(-this.config.maxTranscripts)
    }

    this.updateState({transcriptCount: this.transcripts.length})
    this.emit(PipelineEvent.TRANSCRIPTION_RECEIVED, result)
  }

  /**
   * Handle errors with retry logic
   */
  private async handleError(error: Error): Promise<void> {
    console.error('Pipeline error:', error)

    this.updateState({
      lastError: error,
      retryCount: this.state.retryCount + 1
    })

    this.emit(PipelineEvent.ERROR, error)

    // Implement retry logic for recoverable errors
    if (this.state.retryCount < this.config.maxRetries && !this.isRetrying) {
      this.isRetrying = true

      const retryDelay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000) // Exponential backoff

      this.retryTimer = setTimeout(async () => {
        try {
          console.log(`Retrying after error (attempt ${this.state.retryCount})...`)

          if (this.config.fallbackToBatch && this.state.currentMode !== TranscriptionMode.BATCH) {
            // Fall back to batch mode
            await this.switchMode(TranscriptionMode.BATCH)
            this.emit(PipelineEvent.FALLBACK_ACTIVATED, TranscriptionMode.BATCH)
          } else {
            // Retry current mode
            await this.initialize()
          }

          this.isRetrying = false
        } catch (retryError) {
          console.error('Retry failed:', retryError)
          this.isRetrying = false
        }
      }, retryDelay)
    }
  }

  /**
   * Wait for all processing to complete
   */
  private async waitForProcessingComplete(): Promise<void> {
    if (this.processingQueue.size === 0) {
      return
    }

    const promises = Array.from(this.processingQueue.values())
    await Promise.allSettled(promises)
    this.processingQueue.clear()

    this.updateState({processingQueue: 0})
  }

  /**
   * Start metrics monitoring
   */
  private startMetricsMonitoring(): void {
    this.metricsInterval = setInterval(() => {
      // Update metrics and emit event
      this.emit(PipelineEvent.METRICS_UPDATED, {
        latency: this.state.latency,
        throughput: this.state.throughput,
        bufferHealth: this.state.bufferHealth,
        droppedFrames: this.state.droppedFrames,
        transcriptCount: this.state.transcriptCount,
        processingQueue: this.state.processingQueue
      })
    }, 1000) // Update every second
  }

  /**
   * Update state and emit change event
   */
  private updateState(updates: Partial<PipelineState>): void {
    this.state = {...this.state, ...updates}
    this.emit(PipelineEvent.STATE_CHANGED, this.state)
  }
}

/**
 * Factory function to create transcription pipeline with default configuration
 */
export function createTranscriptionPipeline(
  config: Partial<TranscriptionPipelineConfig> = {}
): TranscriptionPipeline {
  return new TranscriptionPipeline(config)
}

/**
 * Factory function to create production-ready pipeline
 */
export function createProductionTranscriptionPipeline(
  apiKey: string,
  options: Partial<TranscriptionPipelineConfig> = {}
): TranscriptionPipeline {
  return new TranscriptionPipeline({
    ...options,
    apiKey,
    mode: TranscriptionMode.HYBRID,
    recordingMode: RecordingMode.HYBRID,
    enableRealTime: true,
    fallbackToBatch: true,
    enableDebouncing: true,
    maxTranscripts: 100
  })
}

export default TranscriptionPipeline
