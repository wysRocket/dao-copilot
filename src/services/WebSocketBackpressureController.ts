/**
 * WebSocket Backpressure Management System
 * 
 * Implements flow control mechanisms to prevent overwhelming the transcription pipeline
 * and provides built-in backpressure support using ReadableStream and WritableStream APIs.
 * 
 * Key Features:
 * - Adaptive flow control based on processing capacity
 * - Queue-based buffering with size limits
 * - Automatic pause/resume of data flow
 * - Circuit breaker pattern for failure recovery
 * - Performance monitoring and metrics
 */

/**
 * Backpressure configuration options
 */
export interface BackpressureConfig {
  // Buffer management
  maxBufferSize: number // Maximum number of queued items
  maxBufferMemory: number // Maximum memory usage in bytes
  lowWaterMark: number // Resume processing threshold
  highWaterMark: number // Pause processing threshold
  
  // Flow control timing
  processingDelay: number // Minimum delay between processing items
  adaptiveDelay: boolean // Automatically adjust delay based on performance
  maxDelay: number // Maximum adaptive delay
  
  // Circuit breaker settings
  errorThreshold: number // Number of errors before circuit opens
  circuitResetTime: number // Time before attempting to reset circuit
  healthCheckInterval: number // Interval for health checks
  
  // Performance monitoring
  enableMetrics: boolean // Track performance metrics
  metricsWindowSize: number // Number of recent operations to track
}

/**
 * Default backpressure configuration
 */
const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  maxBufferSize: 50, // 50 audio chunks max
  maxBufferMemory: 10 * 1024 * 1024, // 10MB max buffer memory
  lowWaterMark: 10, // Resume at 10 items
  highWaterMark: 40, // Pause at 40 items
  
  processingDelay: 100, // 100ms minimum delay
  adaptiveDelay: true,
  maxDelay: 2000, // 2 second max delay
  
  errorThreshold: 5, // 5 errors to open circuit
  circuitResetTime: 30000, // 30 seconds
  healthCheckInterval: 5000, // 5 seconds
  
  enableMetrics: true,
  metricsWindowSize: 100 // Track last 100 operations
}

/**
 * Processing metrics for performance monitoring
 */
export interface ProcessingMetrics {
  processedCount: number
  errorCount: number
  averageProcessingTime: number
  maxProcessingTime: number
  currentQueueSize: number
  currentMemoryUsage: number
  isBackpressureActive: boolean
  circuitState: 'closed' | 'open' | 'half-open'
  adaptiveDelay: number
  recentThroughput: number // items per second
}

/**
 * Backpressure event types
 */
export type BackpressureEventType = 
  | 'buffer-full'
  | 'buffer-empty' 
  | 'backpressure-activated'
  | 'backpressure-deactivated'
  | 'circuit-opened'
  | 'circuit-closed'
  | 'processing-error'
  | 'metrics-updated'

/**
 * Backpressure event data
 */
export interface BackpressureEvent {
  type: BackpressureEventType
  timestamp: number
  data?: {
    queueSize?: number
    memoryUsage?: number
    errorCount?: number
    metrics?: ProcessingMetrics
  }
}

/**
 * Circuit breaker states and functionality
 */
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private errorCount = 0
  private lastErrorTime = 0
  private lastSuccessTime = Date.now()
  
  constructor(
    private errorThreshold: number,
    private resetTime: number
  ) {}

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.errorCount = 0
    this.lastSuccessTime = Date.now()
    
    if (this.state === 'half-open') {
      this.state = 'closed'
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.errorCount++
    this.lastErrorTime = Date.now()

    if (this.errorCount >= this.errorThreshold) {
      this.state = 'open'
    }
  }

  /**
   * Check if operation should be allowed
   */
  shouldAllow(): boolean {
    const now = Date.now()

    switch (this.state) {
      case 'closed':
        return true
        
      case 'open':
        // Check if enough time has passed to try again
        if (now - this.lastErrorTime >= this.resetTime) {
          this.state = 'half-open'
          return true
        }
        return false
        
      case 'half-open':
        return true
        
      default:
        return false
    }
  }

  /**
   * Get current circuit state
   */
  getState(): 'closed' | 'open' | 'half-open' {
    return this.state
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: string
    errorCount: number
    lastErrorTime: number
    lastSuccessTime: number
  } {
    return {
      state: this.state,
      errorCount: this.errorCount,
      lastErrorTime: this.lastErrorTime,
      lastSuccessTime: this.lastSuccessTime
    }
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed'
    this.errorCount = 0
    this.lastErrorTime = 0
  }
}

/**
 * Adaptive delay calculator
 */
class AdaptiveDelayCalculator {
  private recentProcessingTimes: number[] = []
  private currentDelay: number
  
  constructor(
    private baseDelay: number,
    private maxDelay: number,
    private windowSize: number = 20
  ) {
    this.currentDelay = baseDelay
  }

  /**
   * Record a processing time and adjust delay
   */
  recordProcessingTime(time: number): void {
    this.recentProcessingTimes.push(time)
    
    // Keep only recent samples
    if (this.recentProcessingTimes.length > this.windowSize) {
      this.recentProcessingTimes.shift()
    }

    this.calculateAdaptiveDelay()
  }

  /**
   * Calculate optimal delay based on recent performance
   */
  private calculateAdaptiveDelay(): void {
    if (this.recentProcessingTimes.length < 5) {
      return // Need more samples
    }

    const avgTime = this.recentProcessingTimes.reduce((sum, time) => sum + time, 0) / 
                   this.recentProcessingTimes.length

    const maxTime = Math.max(...this.recentProcessingTimes)
    
    // If processing is slow, increase delay
    if (avgTime > this.baseDelay * 2) {
      this.currentDelay = Math.min(this.maxDelay, avgTime * 1.5)
    } 
    // If processing is fast, decrease delay
    else if (avgTime < this.baseDelay * 0.5) {
      this.currentDelay = Math.max(this.baseDelay, avgTime * 2)
    }
    // If processing is unstable (high variance), increase delay for stability
    else if (maxTime > avgTime * 3) {
      this.currentDelay = Math.min(this.maxDelay, avgTime * 2)
    }
  }

  /**
   * Get current adaptive delay
   */
  getCurrentDelay(): number {
    return this.currentDelay
  }

  /**
   * Reset delay calculator
   */
  reset(): void {
    this.recentProcessingTimes = []
    this.currentDelay = this.baseDelay
  }
}

/**
 * Processing item interface for queue management
 */
export interface ProcessingItem {
  data: Buffer | ArrayBuffer | Uint8Array // Audio data types
  timestamp: number
  size: number
  id: string
  metadata?: {
    chunkIndex?: number
    isLast?: boolean
    confidence?: number
  }
}

/**
 * Main WebSocket Backpressure Controller
 * 
 * Manages flow control for WebSocket audio processing pipeline
 */
export class WebSocketBackpressureController {
  private config: BackpressureConfig
  private processingQueue: ProcessingItem[] = []
  
  private isProcessing = false
  private isPaused = false
  private currentMemoryUsage = 0
  
  private circuitBreaker: CircuitBreaker
  private adaptiveDelay: AdaptiveDelayCalculator
  private metrics: ProcessingMetrics
  private eventListeners: Map<BackpressureEventType, Set<(event: BackpressureEvent) => void>> = new Map()
  
  private processingTimeHistory: number[] = []
  private healthCheckInterval: NodeJS.Timeout | null = null
  private metricsUpdateInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<BackpressureConfig> = {}) {
    this.config = { ...DEFAULT_BACKPRESSURE_CONFIG, ...config }
    
    this.circuitBreaker = new CircuitBreaker(
      this.config.errorThreshold,
      this.config.circuitResetTime
    )
    
    this.adaptiveDelay = new AdaptiveDelayCalculator(
      this.config.processingDelay,
      this.config.maxDelay,
      this.config.metricsWindowSize
    )
    
    this.metrics = {
      processedCount: 0,
      errorCount: 0,
      averageProcessingTime: 0,
      maxProcessingTime: 0,
      currentQueueSize: 0,
      currentMemoryUsage: 0,
      isBackpressureActive: false,
      circuitState: 'closed',
      adaptiveDelay: this.config.processingDelay,
      recentThroughput: 0
    }

    this.startHealthChecks()
    this.startMetricsUpdates()
  }

  /**
   * Add data to processing queue with backpressure control
   */
  async enqueue(
    data: Buffer | ArrayBuffer | Uint8Array, 
    estimatedSize: number = 1024,
    metadata?: ProcessingItem['metadata']
  ): Promise<boolean> {
    // Check circuit breaker
    if (!this.circuitBreaker.shouldAllow()) {
      this.emitEvent('processing-error', {
        errorCount: this.metrics.errorCount
      })
      return false
    }

    // Check buffer limits
    if (this.processingQueue.length >= this.config.maxBufferSize) {
      this.activateBackpressure('buffer-full')
      return false
    }

    if (this.currentMemoryUsage + estimatedSize > this.config.maxBufferMemory) {
      this.activateBackpressure('buffer-full')
      return false
    }

    // Add to queue
    const item: ProcessingItem = {
      data,
      timestamp: Date.now(),
      size: estimatedSize,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      metadata
    }

    this.processingQueue.push(item)
    this.currentMemoryUsage += estimatedSize
    this.updateQueueMetrics()

    // Start processing if not already running
    if (!this.isProcessing && !this.isPaused) {
      this.startProcessing()
    }

    return true
  }

  /**
   * Start processing queue items
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      while (this.processingQueue.length > 0 && !this.isPaused) {
        const item = this.processingQueue.shift()
        if (!item) break

        await this.processItem(item)

        // Check if we should deactivate backpressure
        if (this.isPaused && this.processingQueue.length <= this.config.lowWaterMark) {
          this.deactivateBackpressure()
        }

        // Apply adaptive delay
        const delay = this.config.adaptiveDelay 
          ? this.adaptiveDelay.getCurrentDelay()
          : this.config.processingDelay

        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    } catch (error) {
      console.error('WebSocketBackpressureController: Processing error:', error)
      this.circuitBreaker.recordFailure()
      this.metrics.errorCount++
    } finally {
      this.isProcessing = false
      
      // If queue is empty, emit event
      if (this.processingQueue.length === 0) {
        this.emitEvent('buffer-empty')
      }
    }
  }

  /**
   * Process individual queue item
   */
  private async processItem(item: ProcessingItem): Promise<void> {
    const startTime = Date.now()

    try {
      // This would be replaced with actual audio processing
      // For now, simulate processing
      await this.simulateProcessing(item)

      // Record success
      this.circuitBreaker.recordSuccess()
      this.metrics.processedCount++

      const processingTime = Date.now() - startTime
      this.recordProcessingTime(processingTime)

      // Update memory usage
      this.currentMemoryUsage -= item.size

    } catch (error) {
      this.circuitBreaker.recordFailure()
      this.metrics.errorCount++
      throw error
    }
  }

  /**
   * Simulate audio processing (to be replaced with actual processing)
   */
  private async simulateProcessing(item: ProcessingItem): Promise<void> {
    // Simulate variable processing time based on data size
    const processingTime = Math.min(50 + (item.size / 1024) * 10, 500)
    await new Promise(resolve => setTimeout(resolve, processingTime))
  }

  /**
   * Record processing time for adaptive delay calculation
   */
  private recordProcessingTime(time: number): void {
    this.processingTimeHistory.push(time)
    
    if (this.processingTimeHistory.length > this.config.metricsWindowSize) {
      this.processingTimeHistory.shift()
    }

    // Update adaptive delay
    if (this.config.adaptiveDelay) {
      this.adaptiveDelay.recordProcessingTime(time)
    }

    // Update metrics
    this.metrics.averageProcessingTime = 
      this.processingTimeHistory.reduce((sum, t) => sum + t, 0) / this.processingTimeHistory.length
    
    this.metrics.maxProcessingTime = Math.max(this.metrics.maxProcessingTime, time)
    this.metrics.adaptiveDelay = this.adaptiveDelay.getCurrentDelay()
  }

  /**
   * Activate backpressure mechanisms
   */
  private activateBackpressure(reason: 'buffer-full' | 'memory-limit' | 'processing-slow'): void {
    if (!this.isPaused) {
      this.isPaused = true
      this.metrics.isBackpressureActive = true
      
      console.log(`WebSocketBackpressureController: Backpressure activated - ${reason}`, {
        queueSize: this.processingQueue.length,
        memoryUsage: this.currentMemoryUsage
      })

      this.emitEvent('backpressure-activated', {
        queueSize: this.processingQueue.length,
        memoryUsage: this.currentMemoryUsage
      })
    }
  }

  /**
   * Deactivate backpressure mechanisms
   */
  private deactivateBackpressure(): void {
    if (this.isPaused) {
      this.isPaused = false
      this.metrics.isBackpressureActive = false
      
      console.log('WebSocketBackpressureController: Backpressure deactivated', {
        queueSize: this.processingQueue.length,
        memoryUsage: this.currentMemoryUsage
      })

      this.emitEvent('backpressure-deactivated', {
        queueSize: this.processingQueue.length,
        memoryUsage: this.currentMemoryUsage
      })

      // Resume processing
      if (!this.isProcessing) {
        this.startProcessing()
      }
    }
  }

  /**
   * Update queue-related metrics
   */
  private updateQueueMetrics(): void {
    this.metrics.currentQueueSize = this.processingQueue.length
    this.metrics.currentMemoryUsage = this.currentMemoryUsage
    this.metrics.circuitState = this.circuitBreaker.getState()

    // Check for high water mark
    if (this.processingQueue.length >= this.config.highWaterMark) {
      this.activateBackpressure('buffer-full')
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, this.config.healthCheckInterval)
  }

  /**
   * Perform system health check
   */
  private performHealthCheck(): void {
    const now = Date.now()
    
    // Check for stuck processing
    if (this.isProcessing && this.processingQueue.length > 0) {
      // If processing has been active for too long, something might be stuck
      const oldestItem = this.processingQueue[0]
      if (oldestItem && now - oldestItem.timestamp > 30000) { // 30 seconds
        console.warn('WebSocketBackpressureController: Possible stuck processing detected')
        this.circuitBreaker.recordFailure()
      }
    }

    // Check circuit breaker state
    if (this.circuitBreaker.getState() === 'open') {
      this.emitEvent('circuit-opened', {
        errorCount: this.metrics.errorCount
      })
    } else if (this.circuitBreaker.getState() === 'closed' && this.metrics.circuitState === 'open') {
      this.emitEvent('circuit-closed')
    }
  }

  /**
   * Start periodic metrics updates
   */
  private startMetricsUpdates(): void {
    if (!this.config.enableMetrics) return

    this.metricsUpdateInterval = setInterval(() => {
      this.updateThroughputMetrics()
      this.emitEvent('metrics-updated', { metrics: this.metrics })
    }, 1000) // Update every second
  }

  /**
   * Update throughput metrics
   */
  private updateThroughputMetrics(): void {
    // Calculate throughput based on recent processing history
    const now = Date.now()
    const oneSecondAgo = now - 1000
    
    const recentProcessing = this.processingTimeHistory.filter((_, index) => {
      // Approximate timestamp based on processing order
      const estimatedTimestamp = now - (this.processingTimeHistory.length - index) * 100
      return estimatedTimestamp >= oneSecondAgo
    })

    this.metrics.recentThroughput = recentProcessing.length // items per second
  }

  /**
   * Add event listener
   */
  addEventListener(
    type: BackpressureEventType, 
    listener: (event: BackpressureEvent) => void
  ): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set())
    }
    
    this.eventListeners.get(type)!.add(listener)

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(type)?.delete(listener)
    }
  }

  /**
   * Emit backpressure event
   */
  private emitEvent(
    type: BackpressureEventType, 
    data?: BackpressureEvent['data']
  ): void {
    const event: BackpressureEvent = {
      type,
      timestamp: Date.now(),
      data
    }

    const listeners = this.eventListeners.get(type)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          console.error(`WebSocketBackpressureController: Error in ${type} event listener:`, error)
        }
      })
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics }
  }

  /**
   * Get detailed status
   */
  getStatus(): {
    isProcessing: boolean
    isPaused: boolean
    queueLength: number
    memoryUsage: number
    circuitState: string
    metrics: ProcessingMetrics
  } {
    return {
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      queueLength: this.processingQueue.length,
      memoryUsage: this.currentMemoryUsage,
      circuitState: this.circuitBreaker.getState(),
      metrics: this.getMetrics()
    }
  }

  /**
   * Clear queue and reset state
   */
  clearQueue(): void {
    this.processingQueue = []
    this.currentMemoryUsage = 0
    this.isPaused = false
    this.updateQueueMetrics()
    this.emitEvent('buffer-empty')
  }

  /**
   * Destroy controller and cleanup resources
   */
  destroy(): void {
    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval)
      this.metricsUpdateInterval = null
    }

    // Clear queue
    this.clearQueue()

    // Clear event listeners
    this.eventListeners.clear()

    // Reset state
    this.isProcessing = false
    this.isPaused = false
  }
}

/**
 * Factory function to create backpressure controller
 */
export function createWebSocketBackpressureController(
  config?: Partial<BackpressureConfig>
): WebSocketBackpressureController {
  return new WebSocketBackpressureController(config)
}
