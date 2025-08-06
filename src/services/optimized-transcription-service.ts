/**
 * Optimized Transcription Service
 * Uses connection pooling and streaming partial results for near real-time performance
 */

import {EventEmitter} from 'events'
import {GeminiConnectionPool, ConnectionPoolConfig} from './gemini-connection-pool'
import {GeminiLiveConfig, RealtimeInput} from './gemini-live-websocket'
import {logger} from './gemini-logger'

export interface OptimizedTranscriptionConfig {
  geminiConfig: GeminiLiveConfig
  poolConfig?: Partial<ConnectionPoolConfig>
  enablePartialStreaming?: boolean
  partialUpdateInterval?: number
  enablePersistentConnections?: boolean
  enableConnectionWarmup?: boolean
}

export interface TranscriptionRequest {
  id: string
  audioData: {
    data: string // Base64 encoded audio
    mimeType: string
  }
  timestamp: number
  priority?: 'low' | 'normal' | 'high'
}

export interface TranscriptionResult {
  requestId: string
  text: string
  confidence?: number
  isPartial: boolean
  isFinal: boolean
  processingTime: number
  connectionId?: string
}

export interface TranscriptionMetrics {
  totalRequests: number
  averageProcessingTime: number
  connectionPoolEfficiency: number
  partialResultCount: number
  finalResultCount: number
  errorRate: number
}

export interface TranscriptionEventData {
  connectionId?: string
  content?: string
  text?: string
  confidence?: number
  isFinal?: boolean
  message?: string
}

export interface PoolStats {
  totalConnections: number
  activeConnections: number
  idleConnections: number
  setupCompleteConnections: number
  totalRequests: number
  averageRequestsPerConnection: number
  poolEfficiency: number
}

/**
 * High-performance transcription service optimized for minimal latency
 * Key optimizations:
 * 1. Connection pooling eliminates setup overhead
 * 2. Streaming partial results reduce perceived latency
 * 3. Persistent connections with warmup for instant availability
 */
export class OptimizedTranscriptionService extends EventEmitter {
  private connectionPool: GeminiConnectionPool
  private config: OptimizedTranscriptionConfig
  private activeRequests: Map<string, TranscriptionRequest> = new Map()
  private requestCounter = 0
  private metrics: TranscriptionMetrics = {
    totalRequests: 0,
    averageProcessingTime: 0,
    connectionPoolEfficiency: 0,
    partialResultCount: 0,
    finalResultCount: 0,
    errorRate: 0
  }
  private processingTimes: number[] = []
  private errorCount = 0

  constructor(config: OptimizedTranscriptionConfig) {
    super()

    this.config = {
      enablePartialStreaming: true,
      partialUpdateInterval: 50, // 50ms for ultra-responsive partial updates
      enablePersistentConnections: true,
      enableConnectionWarmup: true,
      ...config
    }

    // Initialize connection pool with optimized settings
    const poolConfig = {
      maxConnections: 3,
      minConnections: 2,
      warmupConnections: 2,
      idleTimeout: 10 * 60 * 1000, // 10 minutes for longer session reuse
      healthCheckInterval: 30000,
      ...this.config.poolConfig
    }

    this.connectionPool = new GeminiConnectionPool(this.config.geminiConfig, poolConfig)
    this.setupConnectionPoolEvents()

    logger.info('OptimizedTranscriptionService initialized', {
      enablePartialStreaming: this.config.enablePartialStreaming,
      enablePersistentConnections: this.config.enablePersistentConnections,
      poolConfig
    })
  }

  /**
   * Initialize the transcription service
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing optimized transcription service')

      if (this.config.enablePersistentConnections) {
        await this.connectionPool.initialize()
        logger.info('Connection pool initialization completed')
      }

      this.emit('serviceInitialized', {
        poolStats: this.connectionPool.getStats(),
        enabledOptimizations: {
          connectionPooling: this.config.enablePersistentConnections,
          partialStreaming: this.config.enablePartialStreaming,
          connectionWarmup: this.config.enableConnectionWarmup
        }
      })
    } catch (error) {
      logger.error('Failed to initialize optimized transcription service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Transcribe audio with maximum performance optimizations
   * This is the main entry point with all optimizations applied
   */
  async transcribeAudio(
    audioData: {data: string; mimeType: string},
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<TranscriptionResult> {
    const requestId = `req_${++this.requestCounter}_${Date.now()}`
    const startTime = Date.now()

    const request: TranscriptionRequest = {
      id: requestId,
      audioData,
      timestamp: startTime,
      priority
    }

    this.activeRequests.set(requestId, request)
    this.metrics.totalRequests++

    logger.debug('Starting optimized transcription', {
      requestId,
      audioSize: audioData.data.length,
      priority,
      activeRequests: this.activeRequests.size
    })

    try {
      const result = await this.processTranscriptionRequest(request)

      const processingTime = Date.now() - startTime
      this.updateMetrics(processingTime, false)

      logger.debug('Transcription completed successfully', {
        requestId,
        processingTime,
        textLength: result.text.length,
        isPartial: result.isPartial
      })

      return result
    } catch (error) {
      this.errorCount++
      this.updateMetrics(Date.now() - startTime, true)

      logger.error('Transcription failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      })

      throw error
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  /**
   * Process transcription request with optimized flow
   */
  private async processTranscriptionRequest(
    request: TranscriptionRequest
  ): Promise<TranscriptionResult> {
    const realtimeInput: RealtimeInput = {
      audio: request.audioData
    }

    return new Promise((resolve, reject) => {
      let partialResultCount = 0
      let hasReceivedFinal = false

      // Set up result handlers
      const handlePartialResult = (data: TranscriptionEventData) => {
        if (data.connectionId && this.config.enablePartialStreaming) {
          partialResultCount++
          this.metrics.partialResultCount++

          const partialResult: TranscriptionResult = {
            requestId: request.id,
            text: data.content || data.text || '',
            confidence: data.confidence,
            isPartial: true,
            isFinal: false,
            processingTime: Date.now() - request.timestamp,
            connectionId: data.connectionId
          }

          // Emit partial result for immediate UI updates
          this.emit('partialResult', partialResult)

          logger.debug('Received partial transcription result', {
            requestId: request.id,
            textLength: partialResult.text.length,
            partialCount: partialResultCount
          })
        }
      }

      const handleFinalResult = (data: TranscriptionEventData) => {
        if (hasReceivedFinal) return // Prevent duplicate final results

        hasReceivedFinal = true
        this.metrics.finalResultCount++

        const finalResult: TranscriptionResult = {
          requestId: request.id,
          text: data.content || data.text || '',
          confidence: data.confidence,
          isPartial: false,
          isFinal: true,
          processingTime: Date.now() - request.timestamp,
          connectionId: data.connectionId
        }

        // Clean up listeners
        this.connectionPool.removeListener('textResponse', handlePartialResult)
        this.connectionPool.removeListener('transcriptionUpdate', handleFinalResult)

        logger.debug('Received final transcription result', {
          requestId: request.id,
          textLength: finalResult.text.length,
          totalPartials: partialResultCount,
          totalProcessingTime: finalResult.processingTime
        })

        resolve(finalResult)
      }

      const handleError = (error: Error) => {
        // Clean up listeners
        this.connectionPool.removeListener('textResponse', handlePartialResult)
        this.connectionPool.removeListener('transcriptionUpdate', handleFinalResult)

        reject(new Error(`Transcription failed: ${error.message || 'Unknown error'}`))
      }

      // Set up event listeners
      this.connectionPool.on('textResponse', handlePartialResult)
      this.connectionPool.on('transcriptionUpdate', data => {
        if (data.isFinal) {
          handleFinalResult(data)
        } else {
          handlePartialResult(data)
        }
      })

      // Set timeout for the request
      const timeout = setTimeout(() => {
        this.connectionPool.removeListener('textResponse', handlePartialResult)
        this.connectionPool.removeListener('transcriptionUpdate', handleFinalResult)
        reject(new Error(`Transcription timeout for request ${request.id}`))
      }, 30000) // 30 second timeout

      // Send the transcription request through the optimized pool
      this.connectionPool
        .sendTranscriptionRequest(realtimeInput)
        .then(() => {
          logger.debug('Transcription request sent through pool', {
            requestId: request.id
          })
        })
        .catch(error => {
          clearTimeout(timeout)
          handleError(error)
        })
    })
  }

  /**
   * Set up connection pool event listeners
   */
  private setupConnectionPoolEvents(): void {
    this.connectionPool.on('poolInitialized', stats => {
      logger.info('Connection pool initialized', stats)
      this.emit('poolInitialized', stats)
    })

    this.connectionPool.on('connectionCreated', data => {
      logger.debug('New connection created in pool', data)
      this.emit('connectionCreated', data)
    })

    this.connectionPool.on('connectionReady', data => {
      logger.debug('Connection ready for use', data)
      this.emit('connectionReady', data)
    })

    this.connectionPool.on('connectionRemoved', data => {
      logger.debug('Connection removed from pool', data)
      this.emit('connectionRemoved', data)
    })

    // Forward transcription events with connection context
    this.connectionPool.on('textResponse', data => {
      this.emit('textResponse', data)
    })

    this.connectionPool.on('transcriptionUpdate', data => {
      this.emit('transcriptionUpdate', data)
    })
  }

  /**
   * Update service metrics
   */
  private updateMetrics(processingTime: number, isError: boolean): void {
    if (!isError) {
      this.processingTimes.push(processingTime)

      // Keep only last 100 processing times for rolling average
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift()
      }

      this.metrics.averageProcessingTime =
        this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
    }

    this.metrics.errorRate = (this.errorCount / this.metrics.totalRequests) * 100
    this.metrics.connectionPoolEfficiency = this.connectionPool.getStats().poolEfficiency
  }

  /**
   * Get current service metrics
   */
  getMetrics(): TranscriptionMetrics & {poolStats: PoolStats} {
    return {
      ...this.metrics,
      poolStats: this.connectionPool.getStats()
    }
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size
  }

  /**
   * Force refresh connection pool (for testing/debugging)
   */
  async refreshConnectionPool(): Promise<void> {
    logger.info('Refreshing connection pool')
    await this.connectionPool.shutdown()
    await this.connectionPool.initialize()
    logger.info('Connection pool refresh completed')
  }

  /**
   * Get detailed connection pool statistics
   */
  getConnectionPoolStats() {
    return this.connectionPool.getStats()
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down optimized transcription service')

    // Wait for active requests to complete (with timeout)
    const maxWaitTime = 10000 // 10 seconds
    const startTime = Date.now()

    while (this.activeRequests.size > 0 && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    if (this.activeRequests.size > 0) {
      logger.warn('Shutting down with active requests remaining', {
        activeRequests: this.activeRequests.size
      })
    }

    // Shutdown connection pool
    await this.connectionPool.shutdown()

    logger.info('Optimized transcription service shutdown completed', {
      finalMetrics: this.metrics
    })

    this.emit('serviceShutdown', this.metrics)
  }
}
