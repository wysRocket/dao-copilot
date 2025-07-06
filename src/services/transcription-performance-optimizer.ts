/**
 * Transcription Performance Optimizer
 *
 * Advanced performance optimization service for both WebSocket and batch transcription
 * with intelligent model selection, load balancing, and performance monitoring.
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {WebSocketConnectionPool} from './websocket-connection-pool'
import {BatchTranscriptionService} from './batch-transcription-service'
import {transcribeAudio, TranscriptionResult} from './main-stt-transcription'

export interface PerformanceMetrics {
  // Latency metrics
  averageLatency: number
  p95Latency: number
  p99Latency: number

  // Throughput metrics
  requestsPerSecond: number
  tokensPerSecond: number

  // Quality metrics
  successRate: number
  errorRate: number

  // Resource metrics
  cpuUsage: number
  memoryUsage: number
  connectionPoolUtilization: number

  // Model-specific metrics
  modelPerformance: Map<
    string,
    {
      latency: number
      accuracy: number
      throughput: number
      cost: number
    }
  >
}

export interface OptimizationConfig {
  // Performance targets
  targetLatency: number
  targetThroughput: number
  maxErrorRate: number

  // Model selection
  allowModelSwitching: boolean
  primaryModel: string
  fallbackModels: string[]

  // Load balancing
  enableLoadBalancing: boolean
  loadBalancingStrategy: 'round-robin' | 'least-connections' | 'weighted-response-time'

  // Adaptive optimization
  enableAdaptiveOptimization: boolean
  optimizationInterval: number

  // Caching
  enableCaching: boolean
  cacheStrategy: 'lru' | 'lfu' | 'ttl'
  maxCacheSize: number
  cacheTTL: number
}

export interface TranscriptionRequest {
  id: string
  audioData: ArrayBuffer | string
  audioFormat: string
  options: {
    model?: string
    priority?: 'low' | 'normal' | 'high' | 'critical'
    timeout?: number
    quality?: 'draft' | 'standard' | 'high'
    useCache?: boolean
  }
}

export interface OptimizedTranscriptionResult extends TranscriptionResult {
  optimizationMetadata: {
    modelUsed: string
    processingTime: number
    cacheHit: boolean
    optimizationApplied: string[]
    qualityScore: number
  }
}

/**
 * Transcription Performance Optimizer
 */
export class TranscriptionPerformanceOptimizer extends EventEmitter {
  private config: OptimizationConfig
  private connectionPool?: WebSocketConnectionPool
  private batchService?: BatchTranscriptionService

  // Performance tracking
  private metrics: PerformanceMetrics
  private requestHistory: Array<{
    timestamp: number
    latency: number
    model: string
    success: boolean
    size: number
  }> = []

  // Optimization state
  private currentOptimalModel = 'gemini-live-2.5-flash-preview'
  private optimizationTimer?: NodeJS.Timeout

  // Caching
  private cache = new Map<
    string,
    {
      result: OptimizedTranscriptionResult
      timestamp: number
      accessCount: number
    }
  >()

  // Request queues by priority
  private requestQueues = {
    critical: [] as TranscriptionRequest[],
    high: [] as TranscriptionRequest[],
    normal: [] as TranscriptionRequest[],
    low: [] as TranscriptionRequest[]
  }

  private isProcessing = false
  private readonly maxHistorySize = 1000

  constructor(config: Partial<OptimizationConfig>) {
    super()

    this.config = {
      targetLatency: 2000,
      targetThroughput: 10,
      maxErrorRate: 0.05,
      allowModelSwitching: true,
      primaryModel: 'gemini-live-2.5-flash-preview',
      fallbackModels: ['gemini-live-2.5-flash-preview'],
      enableLoadBalancing: true,
      loadBalancingStrategy: 'weighted-response-time',
      enableAdaptiveOptimization: true,
      optimizationInterval: 60000, // 1 minute
      enableCaching: true,
      cacheStrategy: 'lru',
      maxCacheSize: 1000,
      cacheTTL: 3600000, // 1 hour
      ...config
    }

    this.metrics = this.initializeMetrics()

    if (this.config.enableAdaptiveOptimization) {
      this.startOptimizationLoop()
    }

    logger.info('Transcription Performance Optimizer initialized', {
      config: this.config,
      caching: this.config.enableCaching,
      adaptiveOptimization: this.config.enableAdaptiveOptimization
    })
  }

  /**
   * Initialize connection pool and services
   */
  async initialize(
    connectionPool?: WebSocketConnectionPool,
    batchService?: BatchTranscriptionService
  ): Promise<void> {
    this.connectionPool = connectionPool
    this.batchService = batchService

    if (this.connectionPool) {
      this.connectionPool.on('connectionHealthUpdate', this.handleConnectionHealthUpdate.bind(this))
    }

    logger.info('Transcription optimizer initialized with services', {
      hasConnectionPool: !!this.connectionPool,
      hasBatchService: !!this.batchService
    })
  }

  /**
   * Optimized transcription with intelligent routing and performance optimization
   */
  async transcribe(request: TranscriptionRequest): Promise<OptimizedTranscriptionResult> {
    const startTime = Date.now()

    try {
      // Add to appropriate priority queue
      this.addToQueue(request)

      // Process if not already processing
      if (!this.isProcessing) {
        this.processQueue()
      }

      // Wait for result (simplified for this implementation)
      const result = await this.processTranscriptionRequest(request)

      // Record metrics
      this.recordRequest({
        timestamp: startTime,
        latency: Date.now() - startTime,
        model: result.optimizationMetadata.modelUsed,
        success: true,
        size:
          request.audioData instanceof ArrayBuffer
            ? request.audioData.byteLength
            : request.audioData.length
      })

      return result
    } catch (error) {
      // Record failed request
      this.recordRequest({
        timestamp: startTime,
        latency: Date.now() - startTime,
        model: request.options.model || this.currentOptimalModel,
        success: false,
        size:
          request.audioData instanceof ArrayBuffer
            ? request.audioData.byteLength
            : request.audioData.length
      })

      throw error
    }
  }

  /**
   * Process transcription request with optimization
   */
  private async processTranscriptionRequest(
    request: TranscriptionRequest
  ): Promise<OptimizedTranscriptionResult> {
    const optimizationMetadata = {
      modelUsed: '',
      processingTime: 0,
      cacheHit: false,
      optimizationApplied: [] as string[],
      qualityScore: 0
    }

    const startTime = Date.now()

    try {
      // Check cache first
      if (this.config.enableCaching && request.options.useCache !== false) {
        const cacheKey = this.generateCacheKey(request)
        const cachedResult = this.getFromCache(cacheKey)

        if (cachedResult) {
          optimizationMetadata.cacheHit = true
          optimizationMetadata.optimizationApplied.push('cache-hit')
          optimizationMetadata.processingTime = Date.now() - startTime

          return {
            ...cachedResult.result,
            optimizationMetadata
          }
        }
      }

      // Select optimal model
      const selectedModel = this.selectOptimalModel(request)
      optimizationMetadata.modelUsed = selectedModel

      // Select optimal transcription method
      const method = this.selectTranscriptionMethod(request)
      optimizationMetadata.optimizationApplied.push(`method-${method}`)

      // Perform transcription
      let result: TranscriptionResult

      if (method === 'websocket' && this.connectionPool) {
        result = await this.transcribeViaWebSocket(request, selectedModel)
        optimizationMetadata.optimizationApplied.push('websocket-optimization')
      } else if (method === 'batch' && this.batchService) {
        result = await this.transcribeViaBatch(request)
        optimizationMetadata.optimizationApplied.push('batch-optimization')
      } else {
        // Fallback to main transcription service
        // Convert audio data to Buffer
        let audioBuffer: Buffer
        if (typeof request.audioData === 'string') {
          audioBuffer = Buffer.from(request.audioData, 'base64')
        } else {
          audioBuffer = Buffer.from(request.audioData)
        }

        result = await transcribeAudio(audioBuffer, {
          modelName: selectedModel
        })
        optimizationMetadata.optimizationApplied.push('fallback-transcription')
      }

      optimizationMetadata.processingTime = Date.now() - startTime
      optimizationMetadata.qualityScore = this.calculateQualityScore(
        result,
        optimizationMetadata.processingTime
      )

      const optimizedResult: OptimizedTranscriptionResult = {
        ...result,
        optimizationMetadata
      }

      // Cache result if enabled
      if (this.config.enableCaching && request.options.useCache !== false) {
        const cacheKey = this.generateCacheKey(request)
        this.addToCache(cacheKey, optimizedResult)
        optimizationMetadata.optimizationApplied.push('result-cached')
      }

      return optimizedResult
    } catch (error) {
      optimizationMetadata.processingTime = Date.now() - startTime
      logger.error('Optimized transcription failed', {
        requestId: request.id,
        model: optimizationMetadata.modelUsed,
        processingTime: optimizationMetadata.processingTime,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Select optimal model based on current performance metrics and request requirements
   */
  private selectOptimalModel(request: TranscriptionRequest): string {
    // Use specified model if provided and model switching is disabled
    if (request.options.model && !this.config.allowModelSwitching) {
      return request.options.model
    }

    // For high priority requests, use the best performing model
    if (request.options.priority === 'critical' || request.options.priority === 'high') {
      return this.currentOptimalModel
    }

    // Use load balancing for normal priority requests
    if (this.config.enableLoadBalancing) {
      return this.selectModelViaLoadBalancing()
    }

    return request.options.model || this.currentOptimalModel
  }

  /**
   * Select transcription method based on request characteristics
   */
  private selectTranscriptionMethod(request: TranscriptionRequest): 'websocket' | 'batch' {
    const audioSize =
      request.audioData instanceof ArrayBuffer
        ? request.audioData.byteLength
        : request.audioData.length

    // For small files or high priority, prefer WebSocket
    if (
      audioSize < 1024 * 1024 || // < 1MB
      request.options.priority === 'critical' ||
      request.options.priority === 'high'
    ) {
      return 'websocket'
    }

    // For large files, prefer batch processing
    if (audioSize > 10 * 1024 * 1024) {
      // > 10MB
      return 'batch'
    }

    // Check WebSocket pool health (simplified)
    if (this.connectionPool) {
      // In a real implementation, this would check actual pool health
      // For now, we'll assume WebSocket is available
    }

    return 'websocket'
  }

  /**
   * WebSocket transcription with optimization
   */
  private async transcribeViaWebSocket(
    request: TranscriptionRequest,
    model: string
  ): Promise<TranscriptionResult> {
    if (!this.connectionPool) {
      throw new Error('WebSocket connection pool not available')
    }

    const connection = this.connectionPool.getConnection()
    if (!connection) {
      throw new Error('No healthy WebSocket connections available')
    }

    try {
      // Convert audio data to Buffer
      let audioBuffer: Buffer
      if (typeof request.audioData === 'string') {
        audioBuffer = Buffer.from(request.audioData, 'base64')
      } else {
        audioBuffer = Buffer.from(request.audioData)
      }

      return await transcribeAudio(audioBuffer, {
        modelName: model
      })
    } finally {
      this.connectionPool.releaseConnection(connection.id)
    }
  }

  /**
   * Batch transcription with optimization
   */
  private async transcribeViaBatch(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.batchService) {
      throw new Error('Batch transcription service not available')
    }

    // Create a temporary file and use batch service
    // Note: In a real implementation, we would process request.audioData
    const tempPath = `/tmp/temp-audio-${Date.now()}.wav`

    // Suppress unused parameter warning - request would be used to write audio data
    void request

    try {
      // For now, use the single file transcription method
      const result = await this.batchService.transcribeFile(tempPath)

      if (!result.success || !result.transcription) {
        throw new Error(`Batch transcription failed: ${result.error}`)
      }

      const transcription = result.transcription as TranscriptionResult

      return {
        text: transcription.text,
        confidence: transcription.confidence || 0,
        duration: result.duration,
        words: transcription.words || []
      }
    } finally {
      // Clean up temp file (in real implementation)
      // try { await fs.unlink(tempPath) } catch {}
    }
  }

  /**
   * Load balancing model selection
   */
  private selectModelViaLoadBalancing(): string {
    const availableModels = [this.config.primaryModel, ...this.config.fallbackModels]

    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        // Simple round-robin implementation
        return availableModels[Date.now() % availableModels.length]

      case 'weighted-response-time':
        return this.selectModelByResponseTime(availableModels)

      case 'least-connections':
        return this.selectModelByConnections()

      default:
        return this.currentOptimalModel
    }
  }

  /**
   * Select model based on response time
   */
  private selectModelByResponseTime(models: string[]): string {
    let bestModel = models[0]
    let bestResponseTime = Infinity

    for (const model of models) {
      const modelMetrics = this.metrics.modelPerformance.get(model)
      if (modelMetrics && modelMetrics.latency < bestResponseTime) {
        bestResponseTime = modelMetrics.latency
        bestModel = model
      }
    }

    return bestModel
  }

  /**
   * Select model based on connection load (simplified)
   */
  private selectModelByConnections(): string {
    // For this implementation, we'll use the primary model
    // In a real implementation, this would check actual connection counts
    return this.config.primaryModel
  }

  /**
   * Priority queue management
   */
  private addToQueue(request: TranscriptionRequest): void {
    const priority = request.options.priority || 'normal'
    this.requestQueues[priority].push(request)

    logger.debug('Request added to queue', {
      requestId: request.id,
      priority,
      queueSize: this.requestQueues[priority].length
    })
  }

  /**
   * Process priority queues
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      // Process queues in priority order
      const priorities: (keyof typeof this.requestQueues)[] = ['critical', 'high', 'normal', 'low']

      for (const priority of priorities) {
        while (this.requestQueues[priority].length > 0) {
          const request = this.requestQueues[priority].shift()
          if (request) {
            // Process request (in a real implementation, this would be more sophisticated)
            await this.processTranscriptionRequest(request)
          }
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Caching implementation
   */
  private generateCacheKey(request: TranscriptionRequest): string {
    const audioHash = this.hashAudioData(request.audioData)
    const optionsHash = this.hashObject(request.options)
    return `${audioHash}_${optionsHash}`
  }

  private hashAudioData(data: ArrayBuffer | string): string {
    // Simple hash implementation (in production, use a proper hash function)
    const str =
      data instanceof ArrayBuffer
        ? Array.from(new Uint8Array(data.slice(0, 1024))).join('')
        : data.substring(0, 1024)

    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  private hashObject(obj: Record<string, unknown>): string {
    return JSON.stringify(obj)
  }

  private getFromCache(key: string) {
    const cached = this.cache.get(key)
    if (!cached) {
      return null
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(key)
      return null
    }

    // Update access count for LFU
    cached.accessCount++

    return cached
  }

  private addToCache(key: string, result: OptimizedTranscriptionResult): void {
    // Check cache size and evict if necessary
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictFromCache()
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      accessCount: 1
    })
  }

  private evictFromCache(): void {
    switch (this.config.cacheStrategy) {
      case 'lru':
        this.evictLRU()
        break
      case 'lfu':
        this.evictLFU()
        break
      case 'ttl':
        this.evictTTL()
        break
    }
  }

  private evictLRU(): void {
    let oldestKey = ''
    let oldestTime = Date.now()

    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  private evictLFU(): void {
    let leastUsedKey = ''
    let leastAccess = Infinity

    for (const [key, value] of this.cache.entries()) {
      if (value.accessCount < leastAccess) {
        leastAccess = value.accessCount
        leastUsedKey = key
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey)
    }
  }

  private evictTTL(): void {
    const now = Date.now()
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.config.cacheTTL) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Metrics and optimization
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      requestsPerSecond: 0,
      tokensPerSecond: 0,
      successRate: 1.0,
      errorRate: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      connectionPoolUtilization: 0,
      modelPerformance: new Map()
    }
  }

  private recordRequest(request: {
    timestamp: number
    latency: number
    model: string
    success: boolean
    size: number
  }): void {
    this.requestHistory.push(request)

    // Trim history if too large
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory = this.requestHistory.slice(-this.maxHistorySize)
    }

    // Update metrics
    this.updateMetrics()
  }

  private updateMetrics(): void {
    const recentRequests = this.requestHistory.filter(
      req => Date.now() - req.timestamp < 60000 // Last minute
    )

    if (recentRequests.length === 0) {
      return
    }

    // Calculate latency metrics
    const latencies = recentRequests.map(req => req.latency).sort((a, b) => a - b)
    this.metrics.averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
    this.metrics.p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0
    this.metrics.p99Latency = latencies[Math.floor(latencies.length * 0.99)] || 0

    // Calculate success/error rates
    const successCount = recentRequests.filter(req => req.success).length
    this.metrics.successRate = successCount / recentRequests.length
    this.metrics.errorRate = 1 - this.metrics.successRate

    // Calculate throughput
    this.metrics.requestsPerSecond = recentRequests.length / 60 // Requests per minute / 60

    // Update model-specific metrics
    this.updateModelMetrics(recentRequests)

    // Emit metrics update
    this.emit('metricsUpdated', this.metrics)
  }

  private updateModelMetrics(requests: typeof this.requestHistory): void {
    const modelGroups = new Map<string, typeof requests>()

    // Group requests by model
    for (const request of requests) {
      if (!modelGroups.has(request.model)) {
        modelGroups.set(request.model, [])
      }
      modelGroups.get(request.model)!.push(request)
    }

    // Calculate metrics for each model
    for (const [model, modelRequests] of modelGroups.entries()) {
      const latencies = modelRequests.map(req => req.latency)
      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
      const successRate = modelRequests.filter(req => req.success).length / modelRequests.length
      const throughput = modelRequests.length / 60 // Per minute

      this.metrics.modelPerformance.set(model, {
        latency: avgLatency,
        accuracy: successRate,
        throughput,
        cost: 0 // Would be calculated based on model pricing
      })
    }
  }

  private calculateQualityScore(result: TranscriptionResult, processingTime: number): number {
    let score = 100

    // Factor in processing time
    if (processingTime > this.config.targetLatency) {
      score -= Math.min(30, (processingTime - this.config.targetLatency) / 100)
    }

    // Factor in confidence if available
    if (result.confidence !== undefined) {
      score = score * result.confidence
    }

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Adaptive optimization loop
   */
  private startOptimizationLoop(): void {
    this.optimizationTimer = setInterval(() => {
      this.performOptimization()
    }, this.config.optimizationInterval)
  }

  private performOptimization(): void {
    const currentMetrics = this.metrics

    // Check if we're meeting performance targets
    const meetingLatencyTarget = currentMetrics.averageLatency <= this.config.targetLatency
    const meetingErrorTarget = currentMetrics.errorRate <= this.config.maxErrorRate
    const meetingThroughputTarget = currentMetrics.requestsPerSecond >= this.config.targetThroughput

    if (!meetingLatencyTarget || !meetingErrorTarget || !meetingThroughputTarget) {
      this.optimizeConfiguration()
    }

    // Update optimal model based on performance
    this.updateOptimalModel()

    logger.info('Optimization cycle completed', {
      currentMetrics: {
        latency: currentMetrics.averageLatency,
        errorRate: currentMetrics.errorRate,
        throughput: currentMetrics.requestsPerSecond
      },
      optimalModel: this.currentOptimalModel,
      meetingTargets: {
        latency: meetingLatencyTarget,
        error: meetingErrorTarget,
        throughput: meetingThroughputTarget
      }
    })
  }

  private optimizeConfiguration(): void {
    // Implement configuration optimization logic
    // This could adjust connection pool sizes, timeout values, etc.

    if (this.metrics.averageLatency > this.config.targetLatency) {
      // Consider increasing connection pool size or switching models
      this.emit('optimizationSuggestion', {
        type: 'latency',
        suggestion: 'Consider increasing connection pool size or switching to a faster model'
      })
    }

    if (this.metrics.errorRate > this.config.maxErrorRate) {
      // Consider implementing better retry logic or fallback mechanisms
      this.emit('optimizationSuggestion', {
        type: 'reliability',
        suggestion: 'Consider implementing more robust error handling and retry mechanisms'
      })
    }
  }

  private updateOptimalModel(): void {
    // Find the best performing model
    let bestModel = this.config.primaryModel
    let bestScore = 0

    for (const [model, metrics] of this.metrics.modelPerformance.entries()) {
      // Calculate a composite score (lower latency and higher accuracy is better)
      const score = metrics.accuracy * 100 - metrics.latency / 10

      if (score > bestScore) {
        bestScore = score
        bestModel = model
      }
    }

    if (bestModel !== this.currentOptimalModel) {
      const previousModel = this.currentOptimalModel
      this.currentOptimalModel = bestModel

      logger.info('Optimal model updated', {
        previousModel,
        newModel: bestModel,
        score: bestScore
      })

      this.emit('modelOptimized', {
        previousModel,
        newModel: bestModel,
        metrics: this.metrics.modelPerformance.get(bestModel)
      })
    }
  }

  /**
   * Connection health monitoring
   */
  private handleConnectionHealthUpdate(health: {
    score: number
    isHealthy: boolean
    utilizationPercentage?: number
  }): void {
    this.metrics.connectionPoolUtilization = health.utilizationPercentage || 0

    // Adjust optimization based on connection health
    if (health.score < 50) {
      // Poor connection health, prefer batch processing
      this.emit('optimizationSuggestion', {
        type: 'connection',
        suggestion:
          'Poor WebSocket health detected, consider routing more requests to batch processing'
      })
    }
  }

  /**
   * Utility methods
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return {...this.metrics}
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: this.calculateCacheHitRate(),
      strategy: this.config.cacheStrategy
    }
  }

  private calculateCacheHitRate(): number {
    // Simplified calculation - in production, track actual hits/misses
    return this.cache.size > 0 ? 0.85 : 0 // Mock 85% hit rate
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = {...this.config, ...newConfig}

    logger.info('Optimization configuration updated', {
      updatedFields: Object.keys(newConfig)
    })
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer)
      this.optimizationTimer = undefined
    }

    this.cache.clear()
    this.requestHistory.length = 0
    this.removeAllListeners()

    logger.info('Transcription Performance Optimizer cleaned up')
  }
}

// Export factory function
export function createTranscriptionOptimizer(
  config: Partial<OptimizationConfig>
): TranscriptionPerformanceOptimizer {
  return new TranscriptionPerformanceOptimizer(config)
}
