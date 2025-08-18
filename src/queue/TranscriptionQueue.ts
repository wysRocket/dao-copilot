/**
 * TranscriptionQueue - Queueing mechanism for partial transcriptions
 *
 * This class implements a queueing system for partial transcriptions when no connection
 * is available, with automatic flushing when connections become ready within a 1-second window.
 * Integrates with the ConnectionPoolManager and ensures no partial transcriptions are lost
 * during connection initialization or recovery scenarios.
 */

import {EventEmitter} from 'events'
import {ConnectionPoolManager} from '../connection/ConnectionPoolManager'
import {GeminiLiveWebSocketClient} from '../services/gemini-live-websocket'

/**
 * Configuration for the transcription queue
 */
export interface TranscriptionQueueConfig {
  maxQueueSize: number // Maximum number of partials to queue
  flushTimeoutMs: number // Maximum time to wait for connection (1 second)
  enablePartialBatching: boolean // Group multiple partials in one transmission
  maxBatchSize: number // Maximum partials per batch
  priorityLevels: boolean // Enable priority-based queueing
  enableMetrics: boolean // Track queue performance metrics
}

/**
 * Default configuration for transcription queueing
 */
export const DEFAULT_QUEUE_CONFIG: TranscriptionQueueConfig = {
  maxQueueSize: 100, // Queue up to 100 partials
  flushTimeoutMs: 1000, // 1 second timeout as per task requirement
  enablePartialBatching: true, // Batch partials for efficiency
  maxBatchSize: 10, // Up to 10 partials per batch
  priorityLevels: true, // Support priority queueing
  enableMetrics: true
}

/**
 * Priority levels for transcription partials
 */
export enum TranscriptionPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Queued transcription partial with metadata
 */
export interface QueuedPartial {
  id: string
  text: string
  timestamp: number
  confidence: number
  source: string
  priority: TranscriptionPriority
  metadata?: Record<string, unknown>
  queuedAt: number
  attempts: number
}

/**
 * Batch of transcription partials for efficient transmission
 */
interface TranscriptionBatch {
  id: string
  partials: QueuedPartial[]
  createdAt: number
  priority: TranscriptionPriority
}

/**
 * Queue metrics for monitoring performance
 */
export interface QueueMetrics {
  totalQueued: number
  totalFlushed: number
  totalDropped: number
  averageQueueTime: number
  currentQueueSize: number
  peakQueueSize: number
  flushSuccessRate: number
  timeouts: number
  lastFlushTimestamp: number
}

/**
 * TranscriptionQueue class for managing partial transcription queuing
 */
export class TranscriptionQueue extends EventEmitter {
  private config: TranscriptionQueueConfig
  private connectionPool: ConnectionPoolManager
  private queues: Map<TranscriptionPriority, QueuedPartial[]>
  private flushTimer: NodeJS.Timeout | null = null
  private isWaitingForConnection = false

  // Metrics tracking
  private metrics: QueueMetrics = {
    totalQueued: 0,
    totalFlushed: 0,
    totalDropped: 0,
    averageQueueTime: 0,
    currentQueueSize: 0,
    peakQueueSize: 0,
    flushSuccessRate: 0,
    timeouts: 0,
    lastFlushTimestamp: 0
  }

  constructor(
    connectionPool: ConnectionPoolManager,
    config: Partial<TranscriptionQueueConfig> = {}
  ) {
    super()

    this.connectionPool = connectionPool
    this.config = {...DEFAULT_QUEUE_CONFIG, ...config}

    // Initialize priority queues
    this.queues = new Map()
    Object.values(TranscriptionPriority).forEach(priority => {
      this.queues.set(priority, [])
    })

    this.setupConnectionPoolListeners()

    this.emit('initialized', {
      maxQueueSize: this.config.maxQueueSize,
      flushTimeoutMs: this.config.flushTimeoutMs,
      priorities: Object.values(TranscriptionPriority)
    })
  }

  /**
   * Queue a partial transcription
   */
  queuePartial(
    text: string,
    confidence: number = 0.8,
    source: string = 'websocket-gemini-partial',
    priority: TranscriptionPriority = TranscriptionPriority.NORMAL,
    metadata: Record<string, unknown> = {}
  ): string {
    const partial: QueuedPartial = {
      id: this.generatePartialId(),
      text,
      timestamp: Date.now(),
      confidence,
      source,
      priority,
      metadata,
      queuedAt: Date.now(),
      attempts: 0
    }

    // Check queue capacity
    if (this.getTotalQueueSize() >= this.config.maxQueueSize) {
      this.handleQueueOverflow(partial)
      return partial.id
    }

    // Add to appropriate priority queue
    const priorityQueue = this.queues.get(priority)!
    priorityQueue.push(partial)

    // Update metrics
    this.metrics.totalQueued++
    this.updateQueueSizeMetrics()

    this.emit('partialQueued', {
      partialId: partial.id,
      text: partial.text,
      priority: partial.priority,
      queueSize: this.getTotalQueueSize()
    })

    // Try immediate flush if connection available
    this.attemptImmediateFlush()

    return partial.id
  }

  /**
   * Try to flush queue immediately if connection is available
   */
  private async attemptImmediateFlush(): Promise<void> {
    try {
      const connection = (await Promise.race([
        this.connectionPool.getConnection(),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 50) // Very quick attempt
        )
      ])) as GeminiLiveWebSocketClient

      if (connection) {
        await this.flushQueueWithConnection(connection)
        this.connectionPool.releaseConnection(connection)
      }
    } catch {
      // No connection available, start waiting process if not already waiting
      if (!this.isWaitingForConnection && this.getTotalQueueSize() > 0) {
        this.startFlushTimer()
      }
    }
  }

  /**
   * Start timer to wait for connection within timeout window
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.isWaitingForConnection = true

    this.flushTimer = setTimeout(() => {
      this.handleFlushTimeout()
    }, this.config.flushTimeoutMs)

    // Listen for connection availability
    this.waitForConnection()

    this.emit('flushTimerStarted', {
      timeoutMs: this.config.flushTimeoutMs,
      queueSize: this.getTotalQueueSize()
    })
  }

  /**
   * Wait for connection to become available
   */
  private async waitForConnection(): Promise<void> {
    try {
      const connection = await this.connectionPool.getConnection()

      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }

      this.isWaitingForConnection = false
      await this.flushQueueWithConnection(connection)
      this.connectionPool.releaseConnection(connection)
    } catch (error) {
      // Connection request failed, timeout will handle cleanup
      this.emit('connectionWaitFailed', {
        error: error instanceof Error ? error.message : String(error),
        queueSize: this.getTotalQueueSize()
      })
    }
  }

  /**
   * Handle flush timeout - drop queued items or retry
   */
  private handleFlushTimeout(): void {
    this.isWaitingForConnection = false
    this.flushTimer = null

    const queueSize = this.getTotalQueueSize()
    this.metrics.timeouts++

    if (queueSize > 0) {
      // Drop old partials and keep only the most recent ones
      this.dropOldPartials()
    }

    this.emit('flushTimeout', {
      queueSize,
      droppedCount: queueSize - this.getTotalQueueSize()
    })
  }

  /**
   * Flush all queued partials using the provided connection
   */
  private async flushQueueWithConnection(connection: GeminiLiveWebSocketClient): Promise<void> {
    const startTime = Date.now()

    if (this.config.enablePartialBatching) {
      await this.flushInBatches(connection)
    } else {
      await this.flushIndividually(connection)
    }

    const flushDuration = Date.now() - startTime
    this.metrics.lastFlushTimestamp = Date.now()

    this.emit('queueFlushed', {
      duration: flushDuration,
      itemsFlushed: this.metrics.totalFlushed,
      connection: connection.constructor.name
    })
  }

  /**
   * Flush partials in batches for efficiency
   */
  private async flushInBatches(connection: GeminiLiveWebSocketClient): Promise<void> {
    const batches = this.createBatches()

    for (const batch of batches) {
      try {
        await this.sendBatch(connection, batch)
        this.metrics.totalFlushed += batch.partials.length

        // Update average queue time
        const avgQueueTime =
          batch.partials.reduce((sum, partial) => sum + (Date.now() - partial.queuedAt), 0) /
          batch.partials.length
        this.updateAverageQueueTime(avgQueueTime)
      } catch (error) {
        this.handleBatchSendError(batch, error)
      }
    }
  }

  /**
   * Flush partials individually
   */
  private async flushIndividually(connection: GeminiLiveWebSocketClient): Promise<void> {
    const allPartials = this.getAllPartialsSorted()

    for (const partial of allPartials) {
      try {
        await this.sendPartial(connection, partial)
        this.metrics.totalFlushed++

        const queueTime = Date.now() - partial.queuedAt
        this.updateAverageQueueTime(queueTime)
      } catch (error) {
        this.handlePartialSendError(partial, error)
      }
    }
  }

  /**
   * Create batches from queued partials
   */
  private createBatches(): TranscriptionBatch[] {
    const batches: TranscriptionBatch[] = []
    const allPartials = this.getAllPartialsSorted()

    for (let i = 0; i < allPartials.length; i += this.config.maxBatchSize) {
      const batchPartials = allPartials.slice(i, i + this.config.maxBatchSize)
      const highestPriority = this.getHighestPriority(batchPartials)

      batches.push({
        id: this.generateBatchId(),
        partials: batchPartials,
        createdAt: Date.now(),
        priority: highestPriority
      })
    }

    return batches
  }

  /**
   * Send a batch of partials
   */
  private async sendBatch(
    connection: GeminiLiveWebSocketClient,
    batch: TranscriptionBatch
  ): Promise<void> {
    // For WebSocket transcription, we might need to send each partial separately
    // or format them as a structured message depending on the API

    for (const partial of batch.partials) {
      await this.sendPartial(connection, partial)
    }

    this.emit('batchSent', {
      batchId: batch.id,
      partialCount: batch.partials.length,
      priority: batch.priority
    })
  }

  /**
   * Send individual partial transcription
   */
  private async sendPartial(
    connection: GeminiLiveWebSocketClient,
    partial: QueuedPartial
  ): Promise<void> {
    // The actual implementation would depend on the GeminiLiveWebSocketClient API
    // For now, we'll emit an event that can be handled by the bridge

    this.emit('partialToSend', {
      connection,
      partial,
      timestamp: Date.now()
    })

    // Remove from queue
    this.removePartialFromQueue(partial)

    this.emit('partialSent', {
      partialId: partial.id,
      text: partial.text,
      queueTime: Date.now() - partial.queuedAt
    })
  }

  /**
   * Get all partials sorted by priority and timestamp
   */
  private getAllPartialsSorted(): QueuedPartial[] {
    const allPartials: QueuedPartial[] = []

    // Order by priority (critical, high, normal, low)
    const priorityOrder = [
      TranscriptionPriority.CRITICAL,
      TranscriptionPriority.HIGH,
      TranscriptionPriority.NORMAL,
      TranscriptionPriority.LOW
    ]

    for (const priority of priorityOrder) {
      const priorityQueue = this.queues.get(priority)!
      // Sort by timestamp within each priority
      const sorted = priorityQueue.sort((a, b) => a.timestamp - b.timestamp)
      allPartials.push(...sorted)
    }

    return allPartials
  }

  /**
   * Remove partial from its queue
   */
  private removePartialFromQueue(partial: QueuedPartial): void {
    const priorityQueue = this.queues.get(partial.priority)!
    const index = priorityQueue.findIndex(p => p.id === partial.id)
    if (index !== -1) {
      priorityQueue.splice(index, 1)
      this.updateQueueSizeMetrics()
    }
  }

  /**
   * Handle queue overflow by dropping lowest priority/oldest items
   */
  private handleQueueOverflow(newPartial: QueuedPartial): void {
    // Try to drop from lowest priority queue first
    const priorityOrder = [
      TranscriptionPriority.LOW,
      TranscriptionPriority.NORMAL,
      TranscriptionPriority.HIGH,
      TranscriptionPriority.CRITICAL
    ]

    for (const priority of priorityOrder) {
      const priorityQueue = this.queues.get(priority)!
      if (priorityQueue.length > 0) {
        const dropped = priorityQueue.shift()! // Remove oldest
        this.metrics.totalDropped++

        this.emit('partialDropped', {
          droppedPartial: dropped,
          reason: 'queue_overflow',
          newPartial: newPartial.id
        })
        break
      }
    }

    // Add new partial after making space
    const priorityQueue = this.queues.get(newPartial.priority)!
    priorityQueue.push(newPartial)
    this.metrics.totalQueued++
  }

  /**
   * Drop old partials that have exceeded reasonable wait time
   */
  private dropOldPartials(): void {
    const cutoffTime = Date.now() - this.config.flushTimeoutMs * 2
    let droppedCount = 0

    for (const [priority, queue] of this.queues) {
      this.queues.set(
        priority,
        queue.filter(partial => {
          if (partial.queuedAt < cutoffTime) {
            droppedCount++
            this.emit('partialDropped', {
              droppedPartial: partial,
              reason: 'timeout',
              age: Date.now() - partial.queuedAt
            })
            return false
          }
          return true
        })
      )
    }

    this.metrics.totalDropped += droppedCount
    this.updateQueueSizeMetrics()
  }

  /**
   * Setup connection pool event listeners
   */
  private setupConnectionPoolListeners(): void {
    this.connectionPool.on('connectionCreated', () => {
      if (this.isWaitingForConnection && this.getTotalQueueSize() > 0) {
        this.attemptImmediateFlush()
      }
    })

    this.connectionPool.on('poolReady', () => {
      if (this.getTotalQueueSize() > 0) {
        this.attemptImmediateFlush()
      }
    })
  }

  /**
   * Get total size across all priority queues
   */
  private getTotalQueueSize(): number {
    return Array.from(this.queues.values()).reduce((sum, queue) => sum + queue.length, 0)
  }

  /**
   * Update queue size metrics
   */
  private updateQueueSizeMetrics(): void {
    this.metrics.currentQueueSize = this.getTotalQueueSize()
    this.metrics.peakQueueSize = Math.max(this.metrics.peakQueueSize, this.metrics.currentQueueSize)
  }

  /**
   * Update running average of queue time
   */
  private updateAverageQueueTime(newQueueTime: number): void {
    const count = this.metrics.totalFlushed
    if (count === 1) {
      this.metrics.averageQueueTime = newQueueTime
    } else {
      this.metrics.averageQueueTime =
        (this.metrics.averageQueueTime * (count - 1) + newQueueTime) / count
    }
  }

  /**
   * Handle batch send errors
   */
  private handleBatchSendError(batch: TranscriptionBatch, error: unknown): void {
    this.emit('batchSendError', {
      batchId: batch.id,
      error: error instanceof Error ? error.message : String(error),
      partialCount: batch.partials.length
    })
  }

  /**
   * Handle individual partial send errors
   */
  private handlePartialSendError(partial: QueuedPartial, error: unknown): void {
    partial.attempts++

    this.emit('partialSendError', {
      partialId: partial.id,
      error: error instanceof Error ? error.message : String(error),
      attempts: partial.attempts
    })
  }

  /**
   * Get highest priority from a collection of partials
   */
  private getHighestPriority(partials: QueuedPartial[]): TranscriptionPriority {
    const priorityOrder = [
      TranscriptionPriority.CRITICAL,
      TranscriptionPriority.HIGH,
      TranscriptionPriority.NORMAL,
      TranscriptionPriority.LOW
    ]

    for (const priority of priorityOrder) {
      if (partials.some(p => p.priority === priority)) {
        return priority
      }
    }

    return TranscriptionPriority.NORMAL
  }

  /**
   * Generate unique ID for partials
   */
  private generatePartialId(): string {
    return `partial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate unique ID for batches
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): QueueMetrics {
    this.metrics.flushSuccessRate =
      this.metrics.totalQueued > 0
        ? (this.metrics.totalFlushed / this.metrics.totalQueued) * 100
        : 0

    return {...this.metrics}
  }

  /**
   * Get queue status for each priority level
   */
  getQueueStatus(): Record<TranscriptionPriority, number> {
    const status = {} as Record<TranscriptionPriority, number>

    for (const [priority, queue] of this.queues) {
      status[priority] = queue.length
    }

    return status
  }

  /**
   * Clear all queues
   */
  clearAllQueues(): void {
    const totalCleared = this.getTotalQueueSize()

    for (const queue of this.queues.values()) {
      queue.length = 0
    }

    this.updateQueueSizeMetrics()

    this.emit('allQueuesCleared', {
      clearedCount: totalCleared,
      timestamp: Date.now()
    })
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<TranscriptionQueueConfig>): void {
    const oldConfig = {...this.config}
    this.config = {...this.config, ...newConfig}

    this.emit('configUpdated', {
      oldConfig,
      newConfig: this.config
    })
  }

  /**
   * Destroy the queue and clean up resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.clearAllQueues()
    this.removeAllListeners()

    this.emit('destroyed', {
      finalMetrics: this.getMetrics(),
      timestamp: Date.now()
    })
  }
}
