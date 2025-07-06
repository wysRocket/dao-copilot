/**
 * Service Registry for Transcription Orchestrator Integration
 *
 * Provides a centralized way to initialize and manage the transcription
 * orchestrator with proper dependency injection and configuration.
 */

import {TranscriptionOrchestrator, OrchestratorConfig} from './transcription-orchestrator'
import {TranscriptionPerformanceOptimizer} from './transcription-performance-optimizer'
import {BatchTranscriptionService} from './batch-transcription-service'
import {WebSocketConnectionPool} from './websocket-connection-pool'
import {WebSocketConfigManager} from './websocket-config'
import {WebSocketHealthMonitor} from './websocket-health-monitor'
import {logger} from './gemini-logger'

export interface SystemHealthStatus {
  orchestrator: Record<string, unknown> | null
  optimizer: Record<string, unknown> | null
  batch: Record<string, unknown> | null
  websocket: Record<string, unknown> | null
  overall: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    uptime: number
    services: number
    healthyServices: number
  }
}

export interface SystemMetrics {
  orchestrator: Record<string, unknown> | null
  optimizer: Record<string, unknown> | null
  connectionPool: Record<string, unknown> | null
  timestamp: number
}

export interface ServiceRegistryConfig {
  orchestrator?: Partial<OrchestratorConfig>
  websocket?: {
    maxConnections?: number
    healthCheckInterval?: number
    connectionTimeout?: number
  }
  batch?: {
    maxConcurrentFiles?: number
    cacheEnabled?: boolean
    enableCompression?: boolean
  }
  optimizer?: {
    primaryModel?: string
    enableCaching?: boolean
    intelligentRouting?: boolean
  }
}

export class TranscriptionServiceRegistry {
  private static instance: TranscriptionServiceRegistry | null = null

  private orchestrator: TranscriptionOrchestrator | null = null
  private primaryOptimizer: TranscriptionPerformanceOptimizer | null = null
  private batchService: BatchTranscriptionService | null = null
  private connectionPool: WebSocketConnectionPool | null = null
  private wsConfig: WebSocketConfigManager | null = null
  private healthMonitor: WebSocketHealthMonitor | null = null

  private initialized = false

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TranscriptionServiceRegistry {
    if (!TranscriptionServiceRegistry.instance) {
      TranscriptionServiceRegistry.instance = new TranscriptionServiceRegistry()
    }
    return TranscriptionServiceRegistry.instance
  }

  /**
   * Initialize all services with configuration
   */
  async initialize(config: ServiceRegistryConfig = {}): Promise<void> {
    if (this.initialized) {
      logger.warn('TranscriptionServiceRegistry already initialized')
      return
    }

    try {
      logger.info('Initializing TranscriptionServiceRegistry...')

      // Initialize WebSocket configuration
      this.wsConfig = new WebSocketConfigManager('production')

      // Initialize health monitor
      this.healthMonitor = new WebSocketHealthMonitor(this.wsConfig)

      // Initialize connection pool
      this.connectionPool = new WebSocketConnectionPool(
        {
          minConnections: 2,
          maxConnections: config.websocket?.maxConnections || 5,
          connectionTimeout: config.websocket?.connectionTimeout || 30000,
          healthCheckInterval: config.websocket?.healthCheckInterval || 30000,
          connectionIdleTimeout: 300000, // 5 minutes
          loadBalancingStrategy: 'health-based',
          enableFailover: true,
          failoverThreshold: 0.7
        },
        {
          ...this.wsConfig,
          apiKey: process.env.GEMINI_API_KEY || ''
        }
      )

      // Initialize batch service
      this.batchService = new BatchTranscriptionService({
        maxConcurrentFiles: config.batch?.maxConcurrentFiles || 3,
        maxConcurrentChunks: 5,
        chunkSizeMs: 30000, // 30 seconds
        cacheEnabled: config.batch?.cacheEnabled !== false,
        cacheDirectory: '.cache/transcriptions',
        useParallelProcessing: true,
        enableCompression: config.batch?.enableCompression !== false,
        enableAudioNormalization: true,
        enableVoiceActivityDetection: false,
        primaryModel: config.optimizer?.primaryModel || 'gemini-live-2.5-flash-preview',
        fallbackModel: 'gemini-live-2.5-flash-preview',
        useWebSocketForShortFiles: true,
        shortFileThresholdMs: 10000, // 10 seconds
        targetSampleRate: 16000,
        targetChannels: 1,
        targetBitDepth: 16,
        maxRetries: 3,
        retryDelayMs: 1000,
        timeoutMs: 60000,
        outputFormat: 'json',
        includeTimestamps: true,
        includeConfidenceScores: true
      })

      // Initialize performance optimizer
      this.primaryOptimizer = new TranscriptionPerformanceOptimizer({
        primaryModel: config.optimizer?.primaryModel || 'gemini-live-2.5-flash-preview',
        fallbackModels: ['gemini-live-2.5-flash-preview'],
        enableCaching: config.optimizer?.enableCaching !== false
      })

      // Initialize orchestrator with all services
      this.orchestrator = new TranscriptionOrchestrator(
        {
          // Circuit Breaker Settings
          circuitBreakerTimeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 60000,
          monitoringPeriod: 10000,

          // Fallback Strategy
          fallbackProvider: 'google-cloud',
          enableFallback: true,
          fallbackTimeout: 20000,

          // Health Check Settings
          healthCheckInterval: 30000,
          consecutiveFailureThreshold: 3,
          recoveryHealthCheckCount: 5,

          // Data Consistency
          validateResults: true,
          confidenceThreshold: 0.7,
          retryOnLowConfidence: true,

          // Performance
          maxConcurrentRequests: 10,
          requestQueueSize: 100,

          ...config.orchestrator
        },
        this.primaryOptimizer,
        this.batchService,
        this.connectionPool
      )

      // Setup event listeners for monitoring
      this.setupEventListeners()

      this.initialized = true
      logger.info('TranscriptionServiceRegistry initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize TranscriptionServiceRegistry', {error})
      throw error
    }
  }

  /**
   * Setup event listeners for service monitoring
   */
  private setupEventListeners(): void {
    if (!this.orchestrator) return

    // Monitor fallback usage
    this.orchestrator.on('fallback-used', data => {
      logger.warn('Fallback service used', data)
    })

    // Monitor circuit breaker events
    this.orchestrator.on('circuit-breaker-opened', data => {
      logger.error('Circuit breaker opened', data)
    })

    this.orchestrator.on('circuit-breaker-closed', data => {
      logger.info('Circuit breaker closed', data)
    })

    // Monitor health checks
    this.orchestrator.on('health-check-completed', data => {
      logger.debug('Health check completed', data)
    })

    // Monitor transcription completions
    this.orchestrator.on('transcription-completed', data => {
      logger.info('Transcription completed', {
        requestId: data.requestId,
        responseTime: data.responseTime,
        usedFallback: data.usedFallback
      })
    })
  }

  /**
   * Get the orchestrator instance
   */
  getOrchestrator(): TranscriptionOrchestrator {
    if (!this.initialized || !this.orchestrator) {
      throw new Error('TranscriptionServiceRegistry not initialized. Call initialize() first.')
    }
    return this.orchestrator
  }

  /**
   * Get the performance optimizer
   */
  getOptimizer(): TranscriptionPerformanceOptimizer {
    if (!this.initialized || !this.primaryOptimizer) {
      throw new Error('TranscriptionServiceRegistry not initialized. Call initialize() first.')
    }
    return this.primaryOptimizer
  }

  /**
   * Get the batch service
   */
  getBatchService(): BatchTranscriptionService {
    if (!this.initialized || !this.batchService) {
      throw new Error('TranscriptionServiceRegistry not initialized. Call initialize() first.')
    }
    return this.batchService
  }

  /**
   * Get the connection pool
   */
  getConnectionPool(): WebSocketConnectionPool {
    if (!this.initialized || !this.connectionPool) {
      throw new Error('TranscriptionServiceRegistry not initialized. Call initialize() first.')
    }
    return this.connectionPool
  }

  /**
   * Get health monitor
   */
  getHealthMonitor(): WebSocketHealthMonitor {
    if (!this.initialized || !this.healthMonitor) {
      throw new Error('TranscriptionServiceRegistry not initialized. Call initialize() first.')
    }
    return this.healthMonitor
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): SystemHealthStatus {
    if (!this.initialized) {
      return {
        orchestrator: null,
        optimizer: null,
        batch: null,
        websocket: null,
        overall: {
          status: 'unhealthy',
          uptime: 0,
          services: 0,
          healthyServices: 0
        }
      }
    }

    const orchestratorHealth = this.orchestrator?.getHealthStatus() || null
    const optimizerMetrics = this.primaryOptimizer?.getMetrics() || null
    // Note: connectionPool.getStats() method may not exist - using placeholder
    const connectionPoolStats = null // this.connectionPool?.getStats() || null

    const services = [
      this.orchestrator,
      this.primaryOptimizer,
      this.batchService,
      this.connectionPool
    ]

    const healthyServices = services.filter(service => service !== null).length
    const totalServices = 4

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (healthyServices < totalServices * 0.5) {
      overallStatus = 'unhealthy'
    } else if (healthyServices < totalServices) {
      overallStatus = 'degraded'
    }

    return {
      orchestrator: orchestratorHealth as Record<string, unknown> | null,
      optimizer: optimizerMetrics as Record<string, unknown> | null,
      batch: this.batchService ? {initialized: true} : null,
      websocket: connectionPoolStats,
      overall: {
        status: overallStatus,
        uptime: process.uptime(),
        services: totalServices,
        healthyServices
      }
    }
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): SystemMetrics {
    if (!this.initialized) {
      throw new Error('TranscriptionServiceRegistry not initialized')
    }

    return {
      orchestrator: (this.orchestrator?.getMetrics() || null) as Record<string, unknown> | null,
      optimizer: (this.primaryOptimizer?.getMetrics() || null) as Record<string, unknown> | null,
      connectionPool: null, // this.connectionPool?.getStats() || null - method may not exist
      timestamp: Date.now()
    }
  }

  /**
   * Reset all circuit breakers
   */
  async resetCircuitBreakers(): Promise<void> {
    if (!this.initialized || !this.orchestrator) {
      throw new Error('TranscriptionServiceRegistry not initialized')
    }

    await this.orchestrator.resetCircuitBreakers()
    logger.info('All circuit breakers reset')
  }

  /**
   * Cleanup all services
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up TranscriptionServiceRegistry...')

    if (this.orchestrator) {
      await this.orchestrator.cleanup()
      this.orchestrator = null
    }

    if (this.connectionPool) {
      await this.connectionPool.cleanup()
      this.connectionPool = null
    }

    if (this.healthMonitor) {
      this.healthMonitor.cleanup()
      this.healthMonitor = null
    }

    this.primaryOptimizer = null
    this.batchService = null
    this.wsConfig = null
    this.initialized = false

    logger.info('TranscriptionServiceRegistry cleanup complete')
  }

  /**
   * Check if the registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Reinitialize with new configuration
   */
  async reinitialize(config: ServiceRegistryConfig = {}): Promise<void> {
    await this.cleanup()
    await this.initialize(config)
  }

  /**
   * Static cleanup for singleton
   */
  static async cleanup(): Promise<void> {
    if (TranscriptionServiceRegistry.instance) {
      await TranscriptionServiceRegistry.instance.cleanup()
      TranscriptionServiceRegistry.instance = null
    }
  }
}

// Export a default instance for convenience
export const transcriptionRegistry = TranscriptionServiceRegistry.getInstance()
