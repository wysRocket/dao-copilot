/**
 * Enhanced Audio Streaming Pipeline
 *
 * High-performance audio streaming pipeline optimized for the Gemini Live API
 * with advanced buffering, backpressure handling, and Web Audio API integration.
 */

import {EventEmitter} from 'events'
import {WebSocketConnectionEstablisher, ConnectionConfig} from './websocket-connection-establisher'
import {WebSocketConfigManager} from './websocket-config'
import {WebSocketHealthMonitor} from './websocket-health-monitor'
import {WebSocketDiagnosticsLogger} from './websocket-diagnostics'
import {AudioFormatConverter, AudioFormat} from './audio-format-converter'
import {AudioWorkerManager} from './audio-worker-manager'
import {logger} from './gemini-logger'

export interface AudioPipelineConfig {
  // WebSocket configuration
  websocket: {
    apiKey: string
    model?: string
    endpoint?: string
    connectionTimeout?: number
    reconnectAttempts?: number
  }

  // Audio configuration
  audio: {
    sampleRate: number
    channels: number
    bitDepth: number
    format: AudioFormat
    chunkSize: number
    maxBufferSize: number
  }

  // Processing configuration
  processing: {
    enableWorkers: boolean
    enableVAD: boolean
    vadThreshold: number
    enableNoiseSuppression: boolean
    enableEchoCancellation: boolean
    compressionLevel: number
    lowLatencyMode: boolean
  }

  // Performance configuration
  performance: {
    maxConcurrentChunks: number
    backpressureThreshold: number
    throttleDelayMs: number
    prioritizeLatency: boolean
    enableAdaptiveBitrate: boolean
  }
}

export interface PipelineMetrics {
  // Processing metrics
  chunksProcessed: number
  chunksDropped: number
  bytesStreamed: number
  averageLatency: number
  maxLatency: number
  minLatency: number

  // Buffer metrics
  currentBufferSize: number
  maxBufferSizeReached: number
  bufferUnderruns: number
  bufferOverruns: number

  // Performance metrics
  throughputBps: number
  compressionRatio: number
  cpuUsage: number
  memoryUsage: number

  // Quality metrics
  audioQualityScore: number
  networkQualityScore: number
  overallQualityScore: number

  // Error tracking
  errorCount: number
  warningCount: number
  lastError?: string
  lastErrorTimestamp?: number

  // Status
  isActive: boolean
  connectionHealth: 'healthy' | 'degraded' | 'unhealthy'
  backpressureActive: boolean
}

export interface AudioChunk {
  id: string
  data: ArrayBuffer
  timestamp: number
  duration: number
  sampleRate: number
  channels: number
  format: AudioFormat
  size: number
  quality?: number
}

export interface ProcessingResult {
  success: boolean
  processedChunk?: AudioChunk
  droppedChunk?: AudioChunk
  latency: number
  error?: Error
}

/**
 * Enhanced Audio Streaming Pipeline
 */
export class EnhancedAudioStreamingPipeline extends EventEmitter {
  private config: AudioPipelineConfig
  private connectionEstablisher: WebSocketConnectionEstablisher
  private wsConfig: WebSocketConfigManager
  private formatConverter: AudioFormatConverter
  private workerManager?: AudioWorkerManager
  private diagnostics: WebSocketDiagnosticsLogger
  private healthMonitor?: WebSocketHealthMonitor

  // Connection management
  private activeConnection?: WebSocket
  private connectionId?: string
  private isConnected = false

  // Audio processing
  private audioContext?: AudioContext
  private audioWorklet?: AudioWorkletNode
  private mediaStream?: MediaStream
  private isStreaming = false

  // Buffer management
  private audioBuffer: AudioChunk[] = []
  private processingQueue: AudioChunk[] = []
  private backpressureActive = false

  // Performance tracking
  private metrics: PipelineMetrics
  private performanceMonitor?: NodeJS.Timeout
  private latencySamples: number[] = []
  private throughputSamples: number[] = []

  // Adaptive quality
  private adaptiveConfig: {
    targetLatency: number
    currentBitrate: number
    qualityLevel: number
    adaptationHistory: Array<{timestamp: number; quality: number; latency: number}>
  }

  constructor(config: AudioPipelineConfig) {
    super()
    this.config = this.validateAndMergeConfig(config)

    // Initialize core services
    this.wsConfig = new WebSocketConfigManager()
    this.connectionEstablisher = new WebSocketConnectionEstablisher(
      this.buildConnectionConfig(),
      undefined,
      this.wsConfig
    )

    this.formatConverter = new AudioFormatConverter()
    this.diagnostics = new WebSocketDiagnosticsLogger()

    if (this.config.processing.enableWorkers) {
      this.workerManager = new AudioWorkerManager()
    }

    // Initialize metrics
    this.metrics = this.initializeMetrics()

    // Initialize adaptive configuration
    this.adaptiveConfig = {
      targetLatency: this.config.performance.prioritizeLatency ? 50 : 200,
      currentBitrate: this.calculateInitialBitrate(),
      qualityLevel: this.config.processing.compressionLevel,
      adaptationHistory: []
    }

    this.setupEventHandlers()

    logger.info('Enhanced Audio Streaming Pipeline initialized', {
      model: this.config.websocket.model,
      sampleRate: this.config.audio.sampleRate,
      format: this.config.audio.format,
      lowLatencyMode: this.config.processing.lowLatencyMode
    })
  }

  /**
   * Initialize the audio streaming pipeline
   */
  async initialize(): Promise<void> {
    try {
      this.emit('initializing')

      // Initialize Web Audio API
      await this.initializeWebAudio()

      // Initialize format converter
      await this.formatConverter.initialize()

      // Initialize worker manager if enabled
      if (this.workerManager) {
        await this.initializeWorkerManager()
      }

      // Start performance monitoring
      this.startPerformanceMonitoring()

      this.emit('initialized')
      logger.info('Audio streaming pipeline initialized successfully')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Start audio streaming
   */
  async startStreaming(): Promise<void> {
    if (this.isStreaming) {
      logger.warn('Audio streaming is already active')
      return
    }

    try {
      this.emit('starting')

      // Establish WebSocket connection
      await this.establishConnection()

      // Start audio capture
      await this.startAudioCapture()

      // Start audio processing
      this.startAudioProcessing()

      this.isStreaming = true
      this.metrics.isActive = true

      this.emit('started')
      logger.info('Audio streaming started successfully')
    } catch (error) {
      this.isStreaming = false
      this.metrics.isActive = false
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Stop audio streaming
   */
  async stopStreaming(): Promise<void> {
    if (!this.isStreaming) {
      return
    }

    try {
      this.emit('stopping')

      this.isStreaming = false
      this.metrics.isActive = false

      // Stop audio capture
      await this.stopAudioCapture()

      // Process remaining buffer
      await this.flushBuffer()

      // Close WebSocket connection
      await this.closeConnection()

      this.emit('stopped')
      logger.info('Audio streaming stopped successfully')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Initialize Web Audio API
   */
  private async initializeWebAudio(): Promise<void> {
    try {
      // Create AudioContext with optimal settings
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.audio.sampleRate,
        latencyHint: this.config.processing.lowLatencyMode ? 'interactive' : 'balanced'
      })

      // Ensure AudioContext is running
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // Load and initialize audio worklet for advanced processing
      if (this.config.processing.enableWorkers) {
        await this.initializeAudioWorklet()
      }

      logger.debug('Web Audio API initialized', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
        baseLatency: this.audioContext.baseLatency,
        outputLatency: this.audioContext.outputLatency
      })
    } catch (error) {
      logger.error('Failed to initialize Web Audio API', {error})
      throw new Error(`Web Audio API initialization failed: ${error}`)
    }
  }

  /**
   * Initialize audio worklet for advanced processing
   */
  private async initializeAudioWorklet(): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized')
    }

    try {
      // Load audio worklet module (would need to be created)
      await this.audioContext.audioWorklet.addModule('/audio-processor.js')

      // Create audio worklet node
      this.audioWorklet = new AudioWorkletNode(this.audioContext, 'audio-processor', {
        processorOptions: {
          sampleRate: this.config.audio.sampleRate,
          channels: this.config.audio.channels,
          chunkSize: this.config.audio.chunkSize,
          enableVAD: this.config.processing.enableVAD,
          vadThreshold: this.config.processing.vadThreshold,
          enableNoiseSuppression: this.config.processing.enableNoiseSuppression
        }
      })

      // Handle processed audio chunks from worklet
      this.audioWorklet.port.onmessage = event => {
        const {type, data} = event.data
        if (type === 'audioChunk') {
          this.handleProcessedAudioChunk(data)
        }
      }

      logger.debug('Audio worklet initialized successfully')
    } catch (error) {
      logger.warn('Failed to initialize audio worklet, falling back to main thread processing', {
        error
      })
      // Continue without worklet - will use main thread processing
    }
  }

  /**
   * Initialize worker manager
   */
  private async initializeWorkerManager(): Promise<void> {
    if (!this.workerManager) {
      return
    }

    try {
      await this.workerManager.initialize({
        inputFormat: {
          sampleRate: this.config.audio.sampleRate,
          channels: this.config.audio.channels,
          bitDepth: this.config.audio.bitDepth
        },
        outputFormat: {
          format: this.config.audio.format,
          sampleRate: this.config.audio.sampleRate,
          channels: this.config.audio.channels,
          bitDepth: this.config.audio.bitDepth
        },
        enableCompression: this.config.processing.compressionLevel > 0,
        qualityLevel: this.config.processing.compressionLevel,
        lowLatencyMode: this.config.processing.lowLatencyMode
      })

      logger.debug('Worker manager initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize worker manager', {error})
      throw error
    }
  }

  /**
   * Establish WebSocket connection
   */
  private async establishConnection(): Promise<void> {
    try {
      const result = await this.connectionEstablisher.establishConnection()

      if (!result.success || !result.websocket) {
        throw new Error('Failed to establish WebSocket connection')
      }

      this.activeConnection = result.websocket
      this.connectionId = result.metrics.connectionId || 'unknown'
      this.isConnected = true

      // Get health monitor for this connection
      this.healthMonitor = this.connectionEstablisher.getConnectionHealth(this.connectionId)

      // Set up connection event handlers
      this.setupConnectionEventHandlers()

      logger.info('WebSocket connection established', {
        connectionId: this.connectionId,
        totalTime: result.metrics.totalConnectionTime,
        quality: result.metrics.quality
      })
    } catch (error) {
      this.isConnected = false
      logger.error('Failed to establish WebSocket connection', {error})
      throw error
    }
  }

  /**
   * Start audio capture from microphone
   */
  private async startAudioCapture(): Promise<void> {
    try {
      // Request microphone access
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: this.config.audio.sampleRate,
          channelCount: this.config.audio.channels,
          echoCancellation: this.config.processing.enableEchoCancellation,
          noiseSuppression: this.config.processing.enableNoiseSuppression,
          autoGainControl: true,
          latency: this.config.processing.lowLatencyMode ? 0.01 : 0.02
        }
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

      if (!this.audioContext) {
        throw new Error('AudioContext not initialized')
      }

      // Create audio source from media stream
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)

      // Connect to audio worklet or script processor
      if (this.audioWorklet) {
        source.connect(this.audioWorklet)
      } else {
        // Fallback to script processor for older browsers
        const scriptProcessor = this.audioContext.createScriptProcessor(
          this.config.audio.chunkSize,
          this.config.audio.channels,
          this.config.audio.channels
        )

        scriptProcessor.onaudioprocess = event => {
          this.handleAudioProcess(event)
        }

        source.connect(scriptProcessor)
        scriptProcessor.connect(this.audioContext.destination)
      }

      logger.info('Audio capture started', {
        sampleRate: this.audioContext.sampleRate,
        channels: this.config.audio.channels,
        chunkSize: this.config.audio.chunkSize
      })
    } catch (error) {
      logger.error('Failed to start audio capture', {error})
      throw error
    }
  }

  /**
   * Handle audio processing from script processor (fallback)
   */
  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.isStreaming) {
      return
    }

    const inputBuffer = event.inputBuffer
    const inputData = inputBuffer.getChannelData(0)

    // Create audio chunk
    const chunk: AudioChunk = {
      id: this.generateChunkId(),
      data: inputData.buffer.slice(0),
      timestamp: Date.now(),
      duration: inputBuffer.duration * 1000,
      sampleRate: inputBuffer.sampleRate,
      channels: inputBuffer.numberOfChannels,
      format: AudioFormat.PCM16,
      size: inputData.byteLength
    }

    this.enqueueAudioChunk(chunk)
  }

  /**
   * Handle processed audio chunk from worklet
   */
  private handleProcessedAudioChunk(chunkData: any): void {
    if (!this.isStreaming) {
      return
    }

    const chunk: AudioChunk = {
      id: chunkData.id || this.generateChunkId(),
      data: chunkData.data,
      timestamp: chunkData.timestamp || Date.now(),
      duration: chunkData.duration || 0,
      sampleRate: chunkData.sampleRate || this.config.audio.sampleRate,
      channels: chunkData.channels || this.config.audio.channels,
      format: chunkData.format || this.config.audio.format,
      size: chunkData.data.byteLength,
      quality: chunkData.quality
    }

    this.enqueueAudioChunk(chunk)
  }

  /**
   * Enqueue audio chunk for processing
   */
  private enqueueAudioChunk(chunk: AudioChunk): void {
    // Check buffer size limits
    if (this.audioBuffer.length >= this.config.audio.maxBufferSize) {
      this.metrics.bufferOverruns++
      this.metrics.chunksDropped++

      // Drop oldest chunk if buffer is full
      const droppedChunk = this.audioBuffer.shift()
      if (droppedChunk) {
        logger.warn('Dropped audio chunk due to buffer overflow', {
          chunkId: droppedChunk.id,
          bufferSize: this.audioBuffer.length
        })
      }
    }

    this.audioBuffer.push(chunk)
    this.metrics.currentBufferSize = this.audioBuffer.length

    // Trigger backpressure if necessary
    this.checkBackpressure()
  }

  /**
   * Start audio processing loop
   */
  private startAudioProcessing(): void {
    const processChunks = async () => {
      while (this.isStreaming) {
        try {
          if (this.audioBuffer.length > 0) {
            const chunk = this.audioBuffer.shift()!
            await this.processAudioChunk(chunk)
          } else {
            // Brief pause when no chunks to process
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        } catch (error) {
          this.metrics.errorCount++
          this.metrics.lastError = error instanceof Error ? error.message : String(error)
          this.metrics.lastErrorTimestamp = Date.now()
          logger.error('Error in audio processing loop', {error})

          // Brief pause before retrying
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }

    // Start processing loop
    processChunks()
  }

  /**
   * Process individual audio chunk
   */
  private async processAudioChunk(chunk: AudioChunk): Promise<ProcessingResult> {
    const startTime = performance.now()

    try {
      // Check backpressure before processing
      if (this.backpressureActive) {
        await this.handleBackpressure()
      }

      // Process with worker manager if available
      let processedData = chunk.data
      if (this.workerManager) {
        const workerResult = await this.workerManager.processChunks([chunk.data], {
          normalize: true,
          removeNoise: this.config.processing.enableNoiseSuppression,
          enableVAD: this.config.processing.enableVAD
        })
        processedData = workerResult.data
      }

      // Convert format if needed
      const convertedResult = await this.formatConverter.convert(processedData, chunk.timestamp)

      // Apply adaptive quality if enabled
      if (this.config.performance.enableAdaptiveBitrate) {
        await this.applyAdaptiveQuality(chunk)
      }

      // Send to WebSocket
      await this.sendAudioChunk({
        ...chunk,
        data: convertedResult.data,
        format: convertedResult.format
      })

      const latency = performance.now() - startTime
      this.updateMetrics(chunk, latency, true)

      return {
        success: true,
        processedChunk: chunk,
        latency
      }
    } catch (error) {
      const latency = performance.now() - startTime
      this.updateMetrics(chunk, latency, false)

      return {
        success: false,
        droppedChunk: chunk,
        latency,
        error: error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  /**
   * Send audio chunk to WebSocket
   */
  private async sendAudioChunk(chunk: AudioChunk): Promise<void> {
    if (!this.activeConnection || !this.isConnected) {
      throw new Error('WebSocket not connected')
    }

    try {
      // Convert to base64 for transmission
      const base64Data = Buffer.from(chunk.data).toString('base64')

      // Create Gemini Live API message
      const message = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: this.getAudioMimeType(chunk.format),
              data: base64Data
            }
          ]
        }
      }

      // Send to WebSocket
      this.activeConnection.send(JSON.stringify(message))

      this.metrics.bytesStreamed += chunk.size
      this.metrics.chunksProcessed++

      // Log diagnostic event
      this.diagnostics.onMessageSent(message, JSON.stringify(message).length)

      this.emit('chunkSent', {
        chunkId: chunk.id,
        size: chunk.size,
        timestamp: chunk.timestamp
      })
    } catch (error) {
      logger.error('Failed to send audio chunk', {
        chunkId: chunk.id,
        error
      })
      throw error
    }
  }

  /**
   * Check and handle backpressure
   */
  private checkBackpressure(): void {
    const bufferUtilization = this.audioBuffer.length / this.config.audio.maxBufferSize
    const shouldActivateBackpressure =
      bufferUtilization > this.config.performance.backpressureThreshold / 100

    if (shouldActivateBackpressure && !this.backpressureActive) {
      this.backpressureActive = true
      this.metrics.backpressureActive = true
      logger.warn('Backpressure activated', {
        bufferSize: this.audioBuffer.length,
        maxBufferSize: this.config.audio.maxBufferSize,
        utilization: bufferUtilization
      })
    } else if (!shouldActivateBackpressure && this.backpressureActive) {
      this.backpressureActive = false
      this.metrics.backpressureActive = false
      logger.info('Backpressure deactivated', {
        bufferSize: this.audioBuffer.length,
        utilization: bufferUtilization
      })
    }
  }

  /**
   * Handle backpressure by throttling processing
   */
  private async handleBackpressure(): Promise<void> {
    const delay = this.config.performance.throttleDelayMs
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * Apply adaptive quality based on performance metrics
   */
  private async applyAdaptiveQuality(chunk: AudioChunk): Promise<void> {
    const currentLatency = this.getAverageLatency()
    const targetLatency = this.adaptiveConfig.targetLatency

    // Record adaptation history
    this.adaptiveConfig.adaptationHistory.push({
      timestamp: Date.now(),
      quality: this.adaptiveConfig.qualityLevel,
      latency: currentLatency
    })

    // Keep only recent history
    if (this.adaptiveConfig.adaptationHistory.length > 100) {
      this.adaptiveConfig.adaptationHistory = this.adaptiveConfig.adaptationHistory.slice(-50)
    }

    // Adjust quality based on latency
    if (currentLatency > targetLatency * 1.5) {
      // High latency - reduce quality
      this.adaptiveConfig.qualityLevel = Math.max(1, this.adaptiveConfig.qualityLevel - 1)
      this.adaptiveConfig.currentBitrate *= 0.8
    } else if (currentLatency < targetLatency * 0.7) {
      // Low latency - can increase quality
      this.adaptiveConfig.qualityLevel = Math.min(10, this.adaptiveConfig.qualityLevel + 1)
      this.adaptiveConfig.currentBitrate *= 1.1
    }

    // Apply the adapted quality to the chunk
    if (chunk.quality !== undefined) {
      chunk.quality = this.adaptiveConfig.qualityLevel
    }
  }

  /**
   * Get audio MIME type for WebSocket transmission
   */
  private getAudioMimeType(format: AudioFormat): string {
    switch (format) {
      case AudioFormat.PCM16:
        return 'audio/pcm'
      case AudioFormat.OPUS:
        return 'audio/opus'
      case AudioFormat.AAC:
        return 'audio/aac'
      case AudioFormat.MP3:
        return 'audio/mpeg'
      default:
        return 'audio/pcm'
    }
  }

  /**
   * Stop audio capture
   */
  private async stopAudioCapture(): Promise<void> {
    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop())
        this.mediaStream = undefined
      }

      if (this.audioWorklet) {
        this.audioWorklet.disconnect()
        this.audioWorklet = undefined
      }

      logger.info('Audio capture stopped')
    } catch (error) {
      logger.error('Error stopping audio capture', {error})
    }
  }

  /**
   * Flush remaining buffer
   */
  private async flushBuffer(): Promise<void> {
    logger.info('Flushing audio buffer', {remainingChunks: this.audioBuffer.length})

    while (this.audioBuffer.length > 0) {
      const chunk = this.audioBuffer.shift()!
      try {
        await this.processAudioChunk(chunk)
      } catch (error) {
        logger.warn('Error processing chunk during flush', {chunkId: chunk.id, error})
      }
    }
  }

  /**
   * Close WebSocket connection
   */
  private async closeConnection(): Promise<void> {
    if (this.connectionId) {
      await this.connectionEstablisher.closeConnection(this.connectionId)
      this.activeConnection = undefined
      this.connectionId = undefined
      this.isConnected = false
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.connectionEstablisher.on('connectionFailed', event => {
      this.emit('connectionFailed', event)
    })

    this.connectionEstablisher.on('healthAlert', event => {
      this.emit('healthAlert', event)
    })
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionEventHandlers(): void {
    if (!this.activeConnection) {
      return
    }

    this.activeConnection.onmessage = event => {
      this.handleWebSocketMessage(event)
    }

    this.activeConnection.onerror = error => {
      this.handleWebSocketError(error)
    }

    this.activeConnection.onclose = event => {
      this.handleWebSocketClose(event)
    }
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data)
      this.diagnostics.onMessageReceived(data, event.data.length)
      this.emit('response', data)
    } catch (error) {
      logger.error('Error parsing WebSocket message', {error})
    }
  }

  /**
   * Handle WebSocket errors
   */
  private handleWebSocketError(error: Event): void {
    this.diagnostics.onError(error, 'WebSocket error')
    this.emit('error', error)
  }

  /**
   * Handle WebSocket close
   */
  private handleWebSocketClose(event: CloseEvent): void {
    this.isConnected = false
    this.diagnostics.onConnectionClosed(event.code, event.reason, event.wasClean)
    this.emit('disconnected', event)
  }

  /**
   * Helper methods
   */
  private validateAndMergeConfig(config: AudioPipelineConfig): AudioPipelineConfig {
    // Merge with defaults
    const defaultConfig: AudioPipelineConfig = {
      websocket: {
        apiKey: '',
        model: 'gemini-live-2.5-flash-preview',
        connectionTimeout: 10000,
        reconnectAttempts: 3
      },
      audio: {
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        format: AudioFormat.PCM16,
        chunkSize: 4096,
        maxBufferSize: 100
      },
      processing: {
        enableWorkers: true,
        enableVAD: true,
        vadThreshold: 0.01,
        enableNoiseSuppression: true,
        enableEchoCancellation: true,
        compressionLevel: 5,
        lowLatencyMode: true
      },
      performance: {
        maxConcurrentChunks: 10,
        backpressureThreshold: 80,
        throttleDelayMs: 50,
        prioritizeLatency: true,
        enableAdaptiveBitrate: true
      }
    }

    return {
      websocket: {...defaultConfig.websocket, ...config.websocket},
      audio: {...defaultConfig.audio, ...config.audio},
      processing: {...defaultConfig.processing, ...config.processing},
      performance: {...defaultConfig.performance, ...config.performance}
    }
  }

  private buildConnectionConfig(): ConnectionConfig {
    return {
      apiKey: this.config.websocket.apiKey,
      endpoint: this.config.websocket.endpoint,
      model: this.config.websocket.model,
      connectionTimeout: this.config.websocket.connectionTimeout,
      retryAttempts: this.config.websocket.reconnectAttempts
    }
  }

  private initializeMetrics(): PipelineMetrics {
    return {
      chunksProcessed: 0,
      chunksDropped: 0,
      bytesStreamed: 0,
      averageLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      currentBufferSize: 0,
      maxBufferSizeReached: 0,
      bufferUnderruns: 0,
      bufferOverruns: 0,
      throughputBps: 0,
      compressionRatio: 1,
      cpuUsage: 0,
      memoryUsage: 0,
      audioQualityScore: 100,
      networkQualityScore: 100,
      overallQualityScore: 100,
      errorCount: 0,
      warningCount: 0,
      isActive: false,
      connectionHealth: 'healthy',
      backpressureActive: false
    }
  }

  private calculateInitialBitrate(): number {
    return this.config.audio.sampleRate * this.config.audio.channels * this.config.audio.bitDepth
  }

  private generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  private updateMetrics(chunk: AudioChunk, latency: number, success: boolean): void {
    if (success) {
      this.metrics.chunksProcessed++
    } else {
      this.metrics.chunksDropped++
      this.metrics.errorCount++
    }

    // Update latency metrics
    this.latencySamples.push(latency)
    if (this.latencySamples.length > 100) {
      this.latencySamples = this.latencySamples.slice(-50)
    }

    this.metrics.averageLatency =
      this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency)
    this.metrics.minLatency = Math.min(this.metrics.minLatency, latency)

    // Update buffer metrics
    this.metrics.currentBufferSize = this.audioBuffer.length
    this.metrics.maxBufferSizeReached = Math.max(
      this.metrics.maxBufferSizeReached,
      this.audioBuffer.length
    )
  }

  private getAverageLatency(): number {
    return this.metrics.averageLatency
  }

  private startPerformanceMonitoring(): void {
    this.performanceMonitor = setInterval(() => {
      this.updatePerformanceMetrics()
    }, 5000) // Update every 5 seconds
  }

  private updatePerformanceMetrics(): void {
    // Calculate throughput
    const throughput =
      (this.metrics.bytesStreamed / (Date.now() - (this.metrics as any).startTime || 1)) * 1000
    this.throughputSamples.push(throughput)
    if (this.throughputSamples.length > 20) {
      this.throughputSamples = this.throughputSamples.slice(-10)
    }
    this.metrics.throughputBps =
      this.throughputSamples.reduce((a, b) => a + b, 0) / this.throughputSamples.length

    // Update quality scores
    this.updateQualityScores()

    // Update connection health from health monitor
    if (this.healthMonitor) {
      const healthStatus = this.healthMonitor.getHealthStatus()
      this.metrics.connectionHealth = healthStatus.healthy ? 'healthy' : 'unhealthy'
    }
  }

  private updateQualityScores(): void {
    // Audio quality based on error rate and latency
    const errorRate =
      this.metrics.errorCount /
      Math.max(1, this.metrics.chunksProcessed + this.metrics.chunksDropped)
    const latencyScore = Math.max(0, 100 - this.metrics.averageLatency / 10)
    this.metrics.audioQualityScore = Math.max(0, 100 - errorRate * 100) * 0.6 + latencyScore * 0.4

    // Network quality from connection health
    this.metrics.networkQualityScore =
      this.metrics.connectionHealth === 'healthy'
        ? 100
        : this.metrics.connectionHealth === 'degraded'
          ? 70
          : 30

    // Overall quality
    this.metrics.overallQualityScore =
      (this.metrics.audioQualityScore + this.metrics.networkQualityScore) / 2
  }

  /**
   * Public API methods
   */
  getMetrics(): PipelineMetrics {
    return {...this.metrics}
  }

  isStreamingActive(): boolean {
    return this.isStreaming
  }

  isConnectionHealthy(): boolean {
    return this.metrics.connectionHealth === 'healthy'
  }

  getConnectionHealth(): any {
    return this.healthMonitor?.getHealthStatus()
  }

  getDiagnostics(): any {
    return this.diagnostics.exportDiagnostics()
  }

  async updateConfiguration(updates: Partial<AudioPipelineConfig>): Promise<void> {
    this.config = this.validateAndMergeConfig({...this.config, ...updates})
    this.connectionEstablisher.updateConfiguration(this.wsConfig.getConfig())
    this.emit('configurationUpdated', this.config)
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.isStreaming) {
        await this.stopStreaming()
      }

      if (this.performanceMonitor) {
        clearInterval(this.performanceMonitor)
      }

      if (this.workerManager) {
        await this.workerManager.destroy()
      }

      if (this.audioContext) {
        await this.audioContext.close()
      }

      await this.connectionEstablisher.cleanup()
      this.diagnostics.destroy()

      this.removeAllListeners()
      this.emit('cleanup')
    } catch (error) {
      logger.error('Error during cleanup', {error})
      throw error
    }
  }
}

/**
 * Factory function for creating enhanced audio streaming pipeline
 */
export function createEnhancedAudioStreamingPipeline(
  config: Partial<AudioPipelineConfig>
): EnhancedAudioStreamingPipeline {
  if (!config.websocket?.apiKey) {
    throw new Error('WebSocket API key is required')
  }

  const fullConfig: AudioPipelineConfig = {
    websocket: {
      apiKey: config.websocket.apiKey,
      model: config.websocket?.model || 'gemini-live-2.5-flash-preview',
      ...config.websocket
    },
    audio: {
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      format: AudioFormat.PCM16,
      chunkSize: 4096,
      maxBufferSize: 100,
      ...config.audio
    },
    processing: {
      enableWorkers: true,
      enableVAD: true,
      vadThreshold: 0.01,
      enableNoiseSuppression: true,
      enableEchoCancellation: true,
      compressionLevel: 5,
      lowLatencyMode: true,
      ...config.processing
    },
    performance: {
      maxConcurrentChunks: 10,
      backpressureThreshold: 80,
      throttleDelayMs: 50,
      prioritizeLatency: true,
      enableAdaptiveBitrate: true,
      ...config.performance
    }
  }

  return new EnhancedAudioStreamingPipeline(fullConfig)
}
