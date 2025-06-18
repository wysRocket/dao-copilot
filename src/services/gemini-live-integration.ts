/**
 * Gemini Live WebSocket Integration Service
 * Bridges the WebSocket client with existing audio capture and transcription services
 */

import {EventEmitter} from 'events'
import GeminiLiveWebSocketClient, {
  ConnectionState,
  type GeminiLiveConfig,
  type RealtimeInput
} from './gemini-live-websocket'
import {
  AudioRecordingService,
  getAudioRecordingService,
  type TranscriptionResult,
  type RecordingState,
  DEVICE_SAMPLE_RATE,
  resampleAudio
} from './audio-recording'
import {convertFloat32ToPCM16, validateAudioFormat} from './gemini-audio-utils'
import {logger} from './gemini-logger'
import type {ProcessedMessage} from './gemini-message-handler'

export enum TranscriptionMode {
  BATCH = 'batch', // Traditional batch processing
  WEBSOCKET = 'websocket', // Real-time WebSocket
  HYBRID = 'hybrid' // Fallback between WebSocket and batch
}

export interface IntegrationConfig extends GeminiLiveConfig {
  mode: TranscriptionMode
  fallbackToBatch: boolean // Fallback to batch if WebSocket fails
  realTimeThreshold: number // Min audio length for real-time processing (ms)
  batchFallbackDelay: number // Delay before falling back to batch (ms)
  audioBufferSize: number // Size of audio buffer for streaming
  enableAudioStreaming: boolean // Enable continuous audio streaming
}

export interface IntegrationState {
  mode: TranscriptionMode
  connectionState: ConnectionState
  recordingState: RecordingState
  isStreaming: boolean
  isProcessing: boolean
  bytesStreamed: number
  messagesReceived: number
  errors: number
  lastTranscription?: TranscriptionResult
}

/**
 * Integration service that orchestrates between WebSocket and batch transcription
 */
export class GeminiLiveIntegrationService extends EventEmitter {
  private websocketClient: GeminiLiveWebSocketClient | null = null
  private audioService: AudioRecordingService
  private config: IntegrationConfig
  private state: IntegrationState
  private audioBuffer: Float32Array[] = []
  private streamingInterval: NodeJS.Timeout | null = null
  private fallbackTimer: NodeJS.Timeout | null = null
  private isDestroyed = false

  constructor(config: Partial<IntegrationConfig>) {
    super()

    this.config = {
      mode: TranscriptionMode.HYBRID,
      fallbackToBatch: true,
      realTimeThreshold: 1000, // 1 second
      batchFallbackDelay: 5000, // 5 seconds
      audioBufferSize: 4096, // Buffer size for streaming
      enableAudioStreaming: true,
      ...config,
      // Required fields
      apiKey: config.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || ''
    }

    if (!this.config.apiKey) {
      throw new Error('API key is required for Gemini Live integration')
    }

    this.audioService = getAudioRecordingService()

    this.state = {
      mode: this.config.mode,
      connectionState: ConnectionState.DISCONNECTED,
      recordingState: this.audioService.getState(),
      isStreaming: false,
      isProcessing: false,
      bytesStreamed: 0,
      messagesReceived: 0,
      errors: 0
    }

    this.initializeServices()

    logger.info('GeminiLiveIntegrationService initialized', {
      mode: this.config.mode,
      fallbackEnabled: this.config.fallbackToBatch,
      streamingEnabled: this.config.enableAudioStreaming
    })
  }

  /**
   * Initialize WebSocket client and audio service connections
   */
  private initializeServices(): void {
    // Initialize WebSocket client if needed
    if (
      this.config.mode === TranscriptionMode.WEBSOCKET ||
      this.config.mode === TranscriptionMode.HYBRID
    ) {
      this.initializeWebSocketClient()
    }

    // Set up audio service callbacks
    this.setupAudioServiceHandlers()
  }

  /**
   * Initialize and configure the WebSocket client
   */
  private initializeWebSocketClient(): void {
    this.websocketClient = new GeminiLiveWebSocketClient(this.config)
    this.setupWebSocketEventHandlers()
  }

  /**
   * Set up WebSocket client event handlers
   */
  private setupWebSocketEventHandlers(): void {
    if (!this.websocketClient) return

    this.websocketClient.on('connected', () => {
      logger.info('WebSocket client connected')
      this.updateState({connectionState: ConnectionState.CONNECTED})
      this.emit('websocketConnected')

      // Cancel fallback timer if connection succeeds
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer)
        this.fallbackTimer = null
      }
    })

    this.websocketClient.on('disconnected', event => {
      logger.warn('WebSocket client disconnected', {
        code: event.code,
        reason: event.reason
      })
      this.updateState({connectionState: ConnectionState.DISCONNECTED})
      this.emit('websocketDisconnected', event)
    })

    this.websocketClient.on('stateChange', newState => {
      this.updateState({connectionState: newState})
      this.emit('connectionStateChanged', newState)
    })

    this.websocketClient.on('message', message => {
      this.handleWebSocketMessage(message)
    })

    this.websocketClient.on('serverContent', content => {
      this.handleTranscriptionResult(content, 'websocket')
    })

    this.websocketClient.on('audioData', audioData => {
      logger.debug('Received audio data from WebSocket', {
        length: audioData.length
      })
    })

    this.websocketClient.on('error', error => {
      logger.error('WebSocket client error', {
        error: error.message,
        type: error.type
      })
      this.updateState({errors: this.state.errors + 1})
      this.emit('error', error)

      // Fallback to batch mode if enabled
      if (this.config.fallbackToBatch && this.config.mode === TranscriptionMode.HYBRID) {
        this.initiateFailover()
      }
    })

    this.websocketClient.on('maxReconnectAttemptsReached', () => {
      logger.error('WebSocket max reconnection attempts reached')
      if (this.config.fallbackToBatch) {
        this.initiateFailover()
      }
    })
  }

  /**
   * Set up audio service event handlers
   */
  private setupAudioServiceHandlers(): void {
    this.audioService.onStateChange(recordingState => {
      this.updateState({recordingState})
      this.emit('recordingStateChanged', recordingState)

      // Start/stop audio streaming based on recording state
      if (this.config.enableAudioStreaming) {
        if (recordingState.isRecording && !this.state.isStreaming) {
          this.startAudioStreaming()
        } else if (!recordingState.isRecording && this.state.isStreaming) {
          this.stopAudioStreaming()
        }
      }
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(message: ProcessedMessage): void {
    this.updateState({messagesReceived: this.state.messagesReceived + 1})

    logger.debug('Processing WebSocket message', {
      type: message.type,
      isValid: message.isValid
    })

    if (message.isValid && message.payload) {
      // Extract transcription text if available
      const payload = message.payload as Record<string, unknown>
      if (payload.text) {
        this.handleTranscriptionResult(
          {
            text: payload.text,
            confidence: payload.confidence,
            timestamp: Date.now()
          },
          'websocket'
        )
      }
    }
  }

  /**
   * Handle transcription results from either source
   */
  private handleTranscriptionResult(
    result: TranscriptionResult | Record<string, unknown>,
    source: 'websocket' | 'batch'
  ): void {
    const transcriptionResult: TranscriptionResult =
      'text' in result
        ? (result as TranscriptionResult)
        : {
            text:
              typeof result.text === 'string'
                ? result.text
                : typeof result.content === 'string'
                  ? result.content
                  : '',
            confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
            duration: typeof result.duration === 'number' ? result.duration : undefined,
            timestamp: typeof result.timestamp === 'number' ? result.timestamp : Date.now()
          }

    logger.info('Transcription result received', {
      source,
      textLength: transcriptionResult.text.length,
      confidence: transcriptionResult.confidence
    })

    this.updateState({
      lastTranscription: transcriptionResult,
      isProcessing: false
    })

    this.emit('transcription', transcriptionResult, source)
  }

  /**
   * Start real-time audio streaming to WebSocket
   */
  private async startAudioStreaming(): Promise<void> {
    if (!this.websocketClient || !this.websocketClient.isConnected()) {
      logger.warn('Cannot start audio streaming: WebSocket not connected')
      return
    }

    this.updateState({isStreaming: true})
    logger.info('Starting real-time audio streaming')

    // Set up streaming interval
    this.streamingInterval = setInterval(() => {
      this.streamAudioBuffer()
    }, 100) // Stream every 100ms

    this.emit('streamingStarted')
  }

  /**
   * Stop audio streaming
   */
  private stopAudioStreaming(): void {
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval)
      this.streamingInterval = null
    }

    // Send any remaining audio buffer
    if (this.audioBuffer.length > 0) {
      this.streamAudioBuffer()
    }

    this.updateState({isStreaming: false})
    logger.info('Audio streaming stopped')
    this.emit('streamingStopped')
  }

  /**
   * Stream accumulated audio buffer to WebSocket
   */
  private async streamAudioBuffer(): Promise<void> {
    if (!this.websocketClient || this.audioBuffer.length === 0) {
      return
    }

    try {
      // Combine buffer chunks
      const combinedLength = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
      const combinedAudio = new Float32Array(combinedLength)
      let offset = 0

      for (const chunk of this.audioBuffer) {
        combinedAudio.set(chunk, offset)
        offset += chunk.length
      }

      // Clear buffer
      this.audioBuffer = []

      // Resample to 16kHz if needed
      const resampledAudio = resampleAudio(combinedAudio, DEVICE_SAMPLE_RATE, 16000)

      // Convert to 16-bit PCM
      const pcmData = convertFloat32ToPCM16(resampledAudio)

      // Validate audio format
      const formatValidation = validateAudioFormat(16000, 1, 16)
      if (!formatValidation.isValid) {
        logger.warn('Audio format validation failed', {
          issues: formatValidation.issues
        })
        return
      }

      // Convert to base64 for WebSocket transmission
      const base64Audio = Buffer.from(pcmData).toString('base64')

      const audioInput: RealtimeInput = {
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000'
        }
      }

      await this.websocketClient.sendRealtimeInput(audioInput)

      this.updateState({
        bytesStreamed: this.state.bytesStreamed + pcmData.byteLength
      })

      logger.debug('Audio chunk streamed', {
        samples: resampledAudio.length,
        bytes: pcmData.byteLength
      })
    } catch (error) {
      logger.error('Failed to stream audio buffer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        bufferLength: this.audioBuffer.length
      })
    }
  }

  /**
   * Add audio data to streaming buffer
   */
  addAudioData(audioData: Float32Array): void {
    if (this.state.isStreaming && this.config.enableAudioStreaming) {
      this.audioBuffer.push(audioData)

      // Prevent buffer from growing too large
      if (this.audioBuffer.length > this.config.audioBufferSize) {
        this.audioBuffer.shift() // Remove oldest chunk
      }
    }
  }

  /**
   * Send audio data for real-time transcription
   * Used by the real-time streaming service
   */
  async sendAudioData(
    audioBuffer: Uint8Array,
    mimeType = 'audio/pcm;rate=16000;encoding=linear16'
  ): Promise<void> {
    if (!this.websocketClient || this.state.connectionState !== ConnectionState.CONNECTED) {
      throw new Error('WebSocket not connected')
    }

    // Convert buffer to base64
    let binary = ''
    const bytes = new Uint8Array(audioBuffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64Data = btoa(binary)

    // Send via WebSocket
    await this.websocketClient.sendRealtimeInput({
      audio: {
        data: base64Data,
        mimeType: mimeType
      }
    })

    // Update streaming metrics
    this.updateState({
      bytesStreamed: this.state.bytesStreamed + audioBuffer.length
    })
  }

  /**
   * Initiate failover to batch processing
   */
  private async initiateFailover(): Promise<void> {
    if (this.state.mode === TranscriptionMode.BATCH) {
      return // Already in batch mode
    }

    logger.warn('Initiating failover to batch processing')

    this.updateState({mode: TranscriptionMode.BATCH})
    this.emit('failover', 'batch')

    // Stop WebSocket streaming
    if (this.state.isStreaming) {
      this.stopAudioStreaming()
    }

    // Set timer to retry WebSocket connection
    if (this.config.mode === TranscriptionMode.HYBRID) {
      this.fallbackTimer = setTimeout(() => {
        this.attemptWebSocketReconnection()
      }, this.config.batchFallbackDelay)
    }
  }

  /**
   * Attempt to reconnect WebSocket and return to hybrid mode
   */
  private async attemptWebSocketReconnection(): Promise<void> {
    if (this.isDestroyed || !this.websocketClient) {
      return
    }

    logger.info('Attempting WebSocket reconnection for hybrid mode')

    try {
      await this.websocketClient.connect()
      this.updateState({mode: this.config.mode}) // Return to original mode
      this.emit('reconnected')
    } catch (error) {
      logger.error('WebSocket reconnection failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Retry after delay
      this.fallbackTimer = setTimeout(() => {
        this.attemptWebSocketReconnection()
      }, this.config.batchFallbackDelay * 2) // Exponential backoff
    }
  }

  /**
   * Start transcription with the configured mode
   */
  async startTranscription(): Promise<void> {
    this.updateState({isProcessing: true})

    logger.info('Starting transcription', {
      mode: this.state.mode
    })

    try {
      if (
        this.state.mode === TranscriptionMode.WEBSOCKET ||
        this.state.mode === TranscriptionMode.HYBRID
      ) {
        if (!this.websocketClient) {
          throw new Error('WebSocket client not initialized')
        }

        await this.websocketClient.connect()
      }

      // Start audio recording
      this.audioService.startIntervalRecording(result => {
        // Handle batch transcription results
        if (this.state.mode === TranscriptionMode.BATCH) {
          this.handleTranscriptionResult(result, 'batch')
        }
      })

      this.emit('transcriptionStarted')
    } catch (error) {
      logger.error('Failed to start transcription', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.updateState({isProcessing: false})

      if (this.config.fallbackToBatch && this.state.mode !== TranscriptionMode.BATCH) {
        await this.initiateFailover()
        await this.startTranscription() // Retry with batch mode
      } else {
        throw error
      }
    }
  }

  /**
   * Stop transcription
   */
  async stopTranscription(): Promise<void> {
    logger.info('Stopping transcription')

    // Stop audio recording
    this.audioService.stopIntervalRecording()

    // Stop audio streaming
    if (this.state.isStreaming) {
      this.stopAudioStreaming()
    }

    // Disconnect WebSocket
    if (this.websocketClient && this.websocketClient.isConnected()) {
      await this.websocketClient.disconnect()
    }

    // Clear fallback timer
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }

    this.updateState({
      isProcessing: false,
      isStreaming: false
    })

    this.emit('transcriptionStopped')
  }

  /**
   * Toggle transcription state
   */
  async toggleTranscription(): Promise<void> {
    if (this.state.isProcessing) {
      await this.stopTranscription()
    } else {
      await this.startTranscription()
    }
  }

  /**
   * Switch transcription mode
   */
  async switchMode(mode: TranscriptionMode): Promise<void> {
    if (this.state.mode === mode) {
      return
    }

    logger.info('Switching transcription mode', {
      from: this.state.mode,
      to: mode
    })

    const wasProcessing = this.state.isProcessing

    // Stop current transcription
    if (wasProcessing) {
      await this.stopTranscription()
    }

    // Update mode
    this.updateState({mode})
    this.config.mode = mode

    // Reinitialize services if needed
    if (mode === TranscriptionMode.WEBSOCKET || mode === TranscriptionMode.HYBRID) {
      if (!this.websocketClient) {
        this.initializeWebSocketClient()
      }
    }

    this.emit('modeChanged', mode)

    // Restart transcription if it was running
    if (wasProcessing) {
      await this.startTranscription()
    }
  }

  /**
   * Update state and emit events
   */
  private updateState(updates: Partial<IntegrationState>): void {
    this.state = {...this.state, ...updates}
    this.emit('stateChanged', this.state)
  }

  /**
   * Get current state
   */
  getState(): IntegrationState {
    return {...this.state}
  }

  /**
   * Get connection metrics
   */
  getMetrics() {
    const baseMetrics = {
      bytesStreamed: this.state.bytesStreamed,
      messagesReceived: this.state.messagesReceived,
      errors: this.state.errors,
      mode: this.state.mode
    }

    if (this.websocketClient) {
      return {
        ...baseMetrics,
        connectionMetrics: this.websocketClient.getConnectionMetrics(),
        reconnectionState: this.websocketClient.getReconnectionState(),
        errorStats: this.websocketClient.getErrorStats()
      }
    }

    return baseMetrics
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<IntegrationConfig>): void {
    this.config = {...this.config, ...updates}

    if (this.websocketClient && updates.reconnectionConfig) {
      this.websocketClient.updateReconnectionConfig(updates.reconnectionConfig)
    }

    logger.info('Integration configuration updated', updates)
    this.emit('configUpdated', this.config)
  }

  /**
   * Cleanup and destroy the service
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true
    logger.info('Destroying GeminiLiveIntegrationService')

    // Stop transcription
    if (this.state.isProcessing) {
      await this.stopTranscription()
    }

    // Clear timers
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }

    // Cleanup WebSocket client
    if (this.websocketClient) {
      this.websocketClient.destroy()
      this.websocketClient = null
    }

    // Clear audio buffer
    this.audioBuffer = []

    // Remove all listeners
    this.removeAllListeners()

    logger.info('GeminiLiveIntegrationService destroyed')
  }
}

export default GeminiLiveIntegrationService
