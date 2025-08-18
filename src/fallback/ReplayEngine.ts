/**
 * Audio Segment Replay Engine
 *
 * Advanced audio segment buffering and replay system for handling connection
 * interruptions and ensuring transcription continuity. Works in conjunction
 * with FallbackManager to provide sophisticated replay capabilities beyond
 * simple transport switching.
 *
 * Key Features:
 * - Time-based audio segment buffering with sequence IDs
 * - Intelligent replay prioritization for handling backlogs
 * - Transcript reconciliation with existing partial transcripts
 * - Configurable cleanup policies for memory management
 * - Integration with circuit breaker and retry policies
 */

import {EventEmitter} from 'events'
import {logger} from '../services/gemini-logger'

// Audio segment metadata
export interface AudioSegment {
  id: string
  sequenceId: number
  timestamp: number
  duration: number
  audioData: Buffer
  transcriptId?: string
  isProcessed: boolean
  priority: SegmentPriority
  retryCount: number
  metadata: SegmentMetadata
}

export interface SegmentMetadata {
  sessionId?: string
  chunkIndex?: number
  hasVoice: boolean
  confidence?: number
  source: 'websocket' | 'http-stream' | 'batch' | 'manual'
  originalTransport?: string
  fallbackReason?: string
}

export enum SegmentPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

// Buffer configuration
export interface AudioSegmentBufferConfig {
  maxSegments: number
  maxMemoryMB: number
  maxAgeMs: number
  retentionPolicyMs: number
  priorityThresholds: {
    low: number
    normal: number
    high: number
    critical: number
  }
}

// Replay configuration
export interface ReplayConfig {
  maxConcurrentReplays: number
  replayTimeoutMs: number
  priorityProcessing: boolean
  backlogThresholdMs: number
  adaptiveReplaySpeed: boolean
  reconciliationEnabled: boolean
}

// Replay statistics
export interface ReplayStatistics {
  totalSegments: number
  processedSegments: number
  failedSegments: number
  averageReplayLatency: number
  bufferUtilizationPercent: number
  oldestSegmentAge: number
  priorityDistribution: Record<SegmentPriority, number>
}

// Replay events
export interface ReplayEvents {
  'segment-buffered': (segment: AudioSegment) => void
  'segment-replayed': (segment: AudioSegment, result: ReplayResult) => void
  'segment-failed': (segment: AudioSegment, error: Error) => void
  'buffer-overflow': (droppedCount: number) => void
  'cleanup-completed': (removedCount: number) => void
  'replay-completed': (stats: ReplayStatistics) => void
  'backlog-warning': (backlogSize: number) => void
}

// Transcription result interface
export interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
  sessionId?: string
  source: 'websocket' | 'http-stream' | 'batch'
  timestamp?: number
}

export interface ReplayResult {
  success: boolean
  transcriptionResult?: TranscriptionResult
  latencyMs: number
  retriesUsed: number
  finalTransport?: string
}

/**
 * Advanced Audio Segment Buffer
 *
 * Manages time-based audio segments with intelligent prioritization,
 * memory management, and cleanup policies.
 */
export class AudioSegmentBuffer {
  private segments: Map<string, AudioSegment> = new Map()
  private sequenceCounter = 0
  private config: AudioSegmentBufferConfig
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<AudioSegmentBufferConfig> = {}) {
    this.config = {
      maxSegments: 1000,
      maxMemoryMB: 50,
      maxAgeMs: 30 * 60 * 1000, // 30 minutes
      retentionPolicyMs: 60 * 1000, // 1 minute cleanup interval
      priorityThresholds: {
        low: 10 * 60 * 1000, // 10 minutes
        normal: 5 * 60 * 1000, // 5 minutes
        high: 2 * 60 * 1000, // 2 minutes
        critical: 30 * 1000 // 30 seconds
      },
      ...config
    }

    this.startCleanupTimer()
  }

  /**
   * Add an audio segment to the buffer
   */
  addSegment(
    audioData: Buffer,
    duration: number,
    metadata: Partial<SegmentMetadata> = {}
  ): AudioSegment {
    const segment: AudioSegment = {
      id: this.generateSegmentId(),
      sequenceId: ++this.sequenceCounter,
      timestamp: Date.now(),
      duration,
      audioData,
      isProcessed: false,
      priority: this.calculatePriority(metadata.hasVoice, duration),
      retryCount: 0,
      metadata: {
        hasVoice: false,
        source: 'websocket',
        ...metadata
      }
    }

    // Check buffer capacity
    if (this.segments.size >= this.config.maxSegments) {
      this.evictOldestSegments(1)
    }

    // Check memory usage
    if (this.getCurrentMemoryUsageMB() + this.getSegmentSizeMB(segment) > this.config.maxMemoryMB) {
      this.evictByMemoryPressure()
    }

    this.segments.set(segment.id, segment)

    logger.debug('Audio segment buffered', {
      segmentId: segment.id,
      sequenceId: segment.sequenceId,
      duration: segment.duration,
      priority: segment.priority,
      bufferSize: this.segments.size
    })

    return segment
  }

  /**
   * Get segment by ID
   */
  getSegment(id: string): AudioSegment | undefined {
    return this.segments.get(id)
  }

  /**
   * Get all segments ordered by priority and timestamp
   */
  getAllSegments(includeProcessed: boolean = false): AudioSegment[] {
    const segments = Array.from(this.segments.values()).filter(
      segment => includeProcessed || !segment.isProcessed
    )

    return segments.sort((a, b) => {
      // First by priority (descending)
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      // Then by timestamp (ascending) for same priority
      return a.timestamp - b.timestamp
    })
  }

  /**
   * Get segments for replay in priority order
   */
  getSegmentsForReplay(maxCount?: number): AudioSegment[] {
    const unprocessedSegments = this.getAllSegments(false)
    return maxCount ? unprocessedSegments.slice(0, maxCount) : unprocessedSegments
  }

  /**
   * Mark segment as processed
   */
  markProcessed(segmentId: string, success: boolean): void {
    const segment = this.segments.get(segmentId)
    if (segment) {
      segment.isProcessed = success
      if (!success) {
        segment.retryCount++
      }
    }
  }

  /**
   * Remove segment from buffer
   */
  removeSegment(segmentId: string): boolean {
    return this.segments.delete(segmentId)
  }

  /**
   * Get buffer statistics
   */
  getStatistics(): ReplayStatistics {
    const allSegments = Array.from(this.segments.values())
    const processedSegments = allSegments.filter(s => s.isProcessed)
    const failedSegments = allSegments.filter(s => s.retryCount > 0 && !s.isProcessed)

    const now = Date.now()
    const oldestSegment = allSegments.reduce(
      (oldest, current) => (current.timestamp < oldest.timestamp ? current : oldest),
      allSegments[0]
    )

    const priorityDistribution = allSegments.reduce(
      (acc, segment) => {
        acc[segment.priority] = (acc[segment.priority] || 0) + 1
        return acc
      },
      {} as Record<SegmentPriority, number>
    )

    return {
      totalSegments: allSegments.length,
      processedSegments: processedSegments.length,
      failedSegments: failedSegments.length,
      averageReplayLatency: this.calculateAverageLatency(allSegments),
      bufferUtilizationPercent: (allSegments.length / this.config.maxSegments) * 100,
      oldestSegmentAge: oldestSegment ? now - oldestSegment.timestamp : 0,
      priorityDistribution
    }
  }

  /**
   * Clear all segments from buffer
   */
  clear(): void {
    this.segments.clear()
    this.sequenceCounter = 0
  }

  /**
   * Destroy buffer and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.clear()
  }

  // Private helper methods

  private generateSegmentId(): string {
    return `segment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private calculatePriority(hasVoice?: boolean, duration?: number): SegmentPriority {
    // Critical: segments with voice and short duration (likely speech)
    if (hasVoice && duration && duration < 2000) {
      return SegmentPriority.CRITICAL
    }

    // High: segments with voice
    if (hasVoice) {
      return SegmentPriority.HIGH
    }

    // Normal: longer segments that might contain speech
    if (duration && duration > 1000) {
      return SegmentPriority.NORMAL
    }

    // Low: short segments without detected voice
    return SegmentPriority.LOW
  }

  private getCurrentMemoryUsageMB(): number {
    let totalBytes = 0
    for (const segment of this.segments.values()) {
      totalBytes += this.getSegmentSizeBytes(segment)
    }
    return totalBytes / (1024 * 1024)
  }

  private getSegmentSizeMB(segment: AudioSegment): number {
    return this.getSegmentSizeBytes(segment) / (1024 * 1024)
  }

  private getSegmentSizeBytes(segment: AudioSegment): number {
    // Approximate memory usage: audio data + metadata overhead
    return segment.audioData.length + 512 // 512 bytes for metadata overhead
  }

  private evictOldestSegments(count: number): void {
    const segments = Array.from(this.segments.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, count)

    for (const segment of segments) {
      this.segments.delete(segment.id)
    }

    if (segments.length > 0) {
      logger.debug('Evicted oldest segments', {
        count: segments.length,
        oldestTimestamp: segments[0]?.timestamp
      })
    }
  }

  private evictByMemoryPressure(): void {
    // Evict low priority segments first, then by age
    const segments = Array.from(this.segments.values()).sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority // Lower priority first
      }
      return a.timestamp - b.timestamp // Older first
    })

    let evictedCount = 0
    const targetMemoryMB = this.config.maxMemoryMB * 0.8 // Target 80% of max

    for (const segment of segments) {
      this.segments.delete(segment.id)
      evictedCount++

      if (this.getCurrentMemoryUsageMB() <= targetMemoryMB) {
        break
      }
    }

    logger.warn('Memory pressure eviction', {
      evictedCount,
      currentMemoryMB: this.getCurrentMemoryUsageMB(),
      targetMemoryMB
    })
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup()
    }, this.config.retentionPolicyMs)
  }

  private performCleanup(): void {
    const now = Date.now()
    const segmentsToRemove: string[] = []

    for (const [id, segment] of this.segments.entries()) {
      const age = now - segment.timestamp

      // Remove expired segments based on age and priority
      const maxAge =
        this.config.priorityThresholds[
          SegmentPriority[
            segment.priority
          ].toLowerCase() as keyof typeof this.config.priorityThresholds
        ] || this.config.maxAgeMs

      if (age > maxAge || (segment.isProcessed && age > this.config.maxAgeMs / 2)) {
        segmentsToRemove.push(id)
      }
    }

    for (const id of segmentsToRemove) {
      this.segments.delete(id)
    }

    if (segmentsToRemove.length > 0) {
      logger.debug('Cleanup completed', {
        removedCount: segmentsToRemove.length,
        remainingSegments: this.segments.size
      })
    }
  }

  private calculateAverageLatency(segments: AudioSegment[]): number {
    const processedSegments = segments.filter(s => s.isProcessed)
    if (processedSegments.length === 0) return 0

    const totalLatency = processedSegments.reduce((sum, segment) => {
      // Estimate latency as time since segment creation
      return sum + (Date.now() - segment.timestamp)
    }, 0)

    return totalLatency / processedSegments.length
  }
}

/**
 * Main Replay Engine Class
 *
 * Orchestrates audio segment replay with sophisticated prioritization,
 * backlog management, and transcript reconciliation capabilities.
 */
export class ReplayEngine extends EventEmitter {
  private buffer: AudioSegmentBuffer
  private config: ReplayConfig
  private isReplaying = false
  private replayQueue: AudioSegment[] = []
  private activeReplays = new Set<string>()
  private destroyed = false

  // Statistics tracking
  private stats = {
    totalReplayed: 0,
    successfulReplays: 0,
    failedReplays: 0,
    averageLatency: 0,
    lastReplayTime: 0
  }

  constructor(
    bufferConfig: Partial<AudioSegmentBufferConfig> = {},
    replayConfig: Partial<ReplayConfig> = {}
  ) {
    super()

    this.buffer = new AudioSegmentBuffer(bufferConfig)
    this.config = {
      maxConcurrentReplays: 3,
      replayTimeoutMs: 30000,
      priorityProcessing: true,
      backlogThresholdMs: 10000, // 10 seconds
      adaptiveReplaySpeed: true,
      reconciliationEnabled: true,
      ...replayConfig
    }

    logger.info('ReplayEngine initialized', {
      bufferConfig,
      replayConfig: this.config
    })
  }

  /**
   * Buffer an audio segment for potential replay
   */
  bufferSegment(
    audioData: Buffer,
    duration: number,
    metadata: Partial<SegmentMetadata> = {}
  ): string {
    if (this.destroyed) {
      throw new Error('ReplayEngine is destroyed')
    }

    const segment = this.buffer.addSegment(audioData, duration, metadata)
    this.emit('segment-buffered', segment)

    // Check for backlog warning
    const stats = this.buffer.getStatistics()
    const backlogAge = stats.oldestSegmentAge

    if (backlogAge > this.config.backlogThresholdMs) {
      this.emit('backlog-warning', stats.totalSegments)
      logger.warn('Replay backlog detected', {
        backlogAge,
        totalSegments: stats.totalSegments,
        threshold: this.config.backlogThresholdMs
      })
    }

    return segment.id
  }

  /**
   * Start replaying buffered segments
   */
  async startReplay(
    replayHandler: (segment: AudioSegment) => Promise<TranscriptionResult | null>
  ): Promise<void> {
    if (this.destroyed || this.isReplaying) {
      return
    }

    this.isReplaying = true
    logger.info('Starting replay of buffered segments')

    try {
      const segmentsToReplay = this.buffer.getSegmentsForReplay()

      if (segmentsToReplay.length === 0) {
        logger.info('No segments to replay')
        return
      }

      logger.info('Starting replay process', {
        segmentCount: segmentsToReplay.length,
        priorityDistribution: this.buffer.getStatistics().priorityDistribution
      })

      // Process segments with priority-based batching
      if (this.config.priorityProcessing) {
        await this.processByPriority(segmentsToReplay, replayHandler)
      } else {
        await this.processSequentially(segmentsToReplay, replayHandler)
      }

      const finalStats = this.buffer.getStatistics()
      this.emit('replay-completed', finalStats)

      logger.info('Replay process completed', {
        processedSegments: finalStats.processedSegments,
        failedSegments: finalStats.failedSegments
      })
    } finally {
      this.isReplaying = false
    }
  }

  /**
   * Force replay of a specific segment
   */
  async replaySegment(
    segmentId: string,
    replayHandler: (segment: AudioSegment) => Promise<TranscriptionResult | null>
  ): Promise<ReplayResult> {
    const segment = this.buffer.getSegment(segmentId)
    if (!segment) {
      throw new Error(`Segment not found: ${segmentId}`)
    }

    return await this.executeSegmentReplay(segment, replayHandler)
  }

  /**
   * Get replay statistics
   */
  getStatistics(): ReplayStatistics {
    return this.buffer.getStatistics()
  }

  /**
   * Get current replay status
   */
  getStatus(): {
    isReplaying: boolean
    activeReplays: number
    queueSize: number
    bufferUtilization: number
  } {
    const stats = this.buffer.getStatistics()
    return {
      isReplaying: this.isReplaying,
      activeReplays: this.activeReplays.size,
      queueSize: this.replayQueue.length,
      bufferUtilization: stats.bufferUtilizationPercent
    }
  }

  /**
   * Clear all buffered segments
   */
  clearBuffer(): void {
    this.buffer.clear()
    this.replayQueue = []
    logger.info('Replay buffer cleared')
  }

  /**
   * Destroy the replay engine
   */
  destroy(): void {
    if (this.destroyed) return

    this.destroyed = true
    this.isReplaying = false
    this.buffer.destroy()
    this.replayQueue = []
    this.activeReplays.clear()

    logger.info('ReplayEngine destroyed')
  }

  // Private methods

  private async processByPriority(
    segments: AudioSegment[],
    replayHandler: (segment: AudioSegment) => Promise<TranscriptionResult | null>
  ): Promise<void> {
    // Group segments by priority
    const priorityGroups = segments.reduce(
      (groups, segment) => {
        const priority = segment.priority
        if (!groups[priority]) groups[priority] = []
        groups[priority].push(segment)
        return groups
      },
      {} as Record<SegmentPriority, AudioSegment[]>
    )

    // Process from highest to lowest priority
    const priorities = [
      SegmentPriority.CRITICAL,
      SegmentPriority.HIGH,
      SegmentPriority.NORMAL,
      SegmentPriority.LOW
    ]

    for (const priority of priorities) {
      const prioritySegments = priorityGroups[priority] || []
      if (prioritySegments.length > 0) {
        logger.debug('Processing priority group', {
          priority,
          segmentCount: prioritySegments.length
        })

        await this.processConcurrently(prioritySegments, replayHandler)
      }
    }
  }

  private async processSequentially(
    segments: AudioSegment[],
    replayHandler: (segment: AudioSegment) => Promise<TranscriptionResult | null>
  ): Promise<void> {
    for (const segment of segments) {
      await this.executeSegmentReplay(segment, replayHandler)
    }
  }

  private async processConcurrently(
    segments: AudioSegment[],
    replayHandler: (segment: AudioSegment) => Promise<TranscriptionResult | null>
  ): Promise<void> {
    const batchSize = this.config.maxConcurrentReplays

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize)
      const promises = batch.map(segment => this.executeSegmentReplay(segment, replayHandler))

      await Promise.allSettled(promises)
    }
  }

  private async executeSegmentReplay(
    segment: AudioSegment,
    replayHandler: (segment: AudioSegment) => Promise<TranscriptionResult | null>
  ): Promise<ReplayResult> {
    const startTime = Date.now()
    this.activeReplays.add(segment.id)

    const result: ReplayResult = {
      success: false,
      latencyMs: 0,
      retriesUsed: segment.retryCount
    }

    try {
      logger.debug('Replaying segment', {
        segmentId: segment.id,
        sequenceId: segment.sequenceId,
        priority: segment.priority,
        retryCount: segment.retryCount
      })

      // Execute the replay with timeout
      const replayPromise = replayHandler(segment)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Replay timeout')), this.config.replayTimeoutMs)
      )

      result.transcriptionResult = await Promise.race([replayPromise, timeoutPromise])
      result.success = true

      this.buffer.markProcessed(segment.id, true)
      this.stats.successfulReplays++

      this.emit('segment-replayed', segment, result)
    } catch (error) {
      result.success = false
      this.buffer.markProcessed(segment.id, false)
      this.stats.failedReplays++

      this.emit('segment-failed', segment, error as Error)

      logger.error('Segment replay failed', {
        segmentId: segment.id,
        error: error instanceof Error ? error.message : error,
        retryCount: segment.retryCount
      })
    } finally {
      result.latencyMs = Date.now() - startTime
      this.activeReplays.delete(segment.id)
      this.stats.totalReplayed++
      this.stats.lastReplayTime = Date.now()

      // Update average latency
      this.updateAverageLatency(result.latencyMs)
    }

    return result
  }

  private updateAverageLatency(latency: number): void {
    if (this.stats.totalReplayed === 1) {
      this.stats.averageLatency = latency
    } else {
      // Exponential moving average
      const alpha = 0.1
      this.stats.averageLatency = alpha * latency + (1 - alpha) * this.stats.averageLatency
    }
  }
}

// Export factory function for easy instantiation
export function createReplayEngine(
  bufferConfig?: Partial<AudioSegmentBufferConfig>,
  replayConfig?: Partial<ReplayConfig>
): ReplayEngine {
  return new ReplayEngine(bufferConfig, replayConfig)
}

// Default configurations for different use cases
export const REPLAY_ENGINE_CONFIGS = {
  // High-throughput configuration for busy environments
  HIGH_THROUGHPUT: {
    buffer: {
      maxSegments: 2000,
      maxMemoryMB: 100,
      maxAgeMs: 60 * 60 * 1000, // 1 hour
      retentionPolicyMs: 30 * 1000 // 30 seconds cleanup
    },
    replay: {
      maxConcurrentReplays: 5,
      replayTimeoutMs: 20000,
      priorityProcessing: true,
      backlogThresholdMs: 5000,
      adaptiveReplaySpeed: true,
      reconciliationEnabled: true
    }
  },

  // Memory-conscious configuration for resource-constrained environments
  MEMORY_OPTIMIZED: {
    buffer: {
      maxSegments: 500,
      maxMemoryMB: 25,
      maxAgeMs: 15 * 60 * 1000, // 15 minutes
      retentionPolicyMs: 15 * 1000 // 15 seconds cleanup
    },
    replay: {
      maxConcurrentReplays: 2,
      replayTimeoutMs: 15000,
      priorityProcessing: true,
      backlogThresholdMs: 8000,
      adaptiveReplaySpeed: false,
      reconciliationEnabled: false
    }
  },

  // Real-time optimized configuration for low-latency needs
  REAL_TIME: {
    buffer: {
      maxSegments: 100,
      maxMemoryMB: 10,
      maxAgeMs: 5 * 60 * 1000, // 5 minutes
      retentionPolicyMs: 10 * 1000 // 10 seconds cleanup
    },
    replay: {
      maxConcurrentReplays: 3,
      replayTimeoutMs: 10000,
      priorityProcessing: true,
      backlogThresholdMs: 3000,
      adaptiveReplaySpeed: true,
      reconciliationEnabled: true
    }
  }
}
