/**
 * TranscriptPersistenceManager - Orchestrates In-Memory Ring Buffer and Write-Ahead Log
 *
 * Core persistence layer that manages transcript durability through:
 * - In-memory ring buffer for fast access and active transcript management
 * - Write-Ahead Log (WAL) for crash recovery and durability
 * - Privacy-compliant buffer clearing for session deletion
 * - Configurable flush triggers and retention policies
 */

import {EventEmitter} from 'events'
import {TranscriptUtterance, TranscriptState} from '../transcription/fsm/TranscriptStates'
import {TranscriptRingBuffer, RingBufferConfig} from './TranscriptRingBuffer'
import WalRecoveryManager, {
  RecoveryResult,
  RecoveredSession,
  RecoveryConfig,
  RecoveryMode
} from './WalRecoveryManager'

// WAL-related interfaces (will be implemented in subsequent tasks)
export interface WalConfig {
  maxFileSize: number // 10MB default
  rotationIntervalMs: number // 15 minutes
  flushIntervalMs: number // 250ms
  flushOnNPartials: number // Every N partials
  enableCompression: boolean
  retentionCount: number // Number of WAL files to keep
}

export interface FlushTrigger {
  type: 'time' | 'count' | 'event' | 'visibility'
  threshold?: number // For count-based triggers
  intervalMs?: number // For time-based triggers
  eventType?: string // For event-based triggers
}

export interface PersistenceConfig {
  ringBuffer: Partial<RingBufferConfig>
  wal: Partial<WalConfig>
  recovery: Partial<RecoveryConfig>
  flushTriggers: FlushTrigger[]
  enableWal: boolean
  enablePrivacyMode: boolean
  recoveryTimeoutMs: number
}

export interface PersistenceMetrics {
  ringBuffer: {
    size: number
    utilization: number
    overflows: number
    compactions: number
  }
  wal: {
    fileCount: number
    totalSize: number
    pendingFlushes: number
    flushLatency: number
  }
  sessions: {
    active: number
    total: number
    deleted: number
  }
  performance: {
    appendLatency: number
    queryLatency: number
    flushLatency: number
  }
}

/**
 * Events emitted by the persistence layer
 */
export interface PersistenceEvents {
  'utterance:added': (utterance: TranscriptUtterance) => void
  'utterance:updated': (utterance: TranscriptUtterance) => void
  'utterance:removed': (utteranceId: string) => void
  'session:created': (sessionId: string) => void
  'session:deleted': (sessionId: string, utteranceCount: number) => void
  'wal:flushed': (entriesCount: number, durationMs: number) => void
  'wal:rotated': (oldFile: string, newFile: string) => void
  'buffer:overflow': (evictedCount: number) => void
  'recovery:started': (walFiles: string[]) => void
  'recovery:completed': (recoveredUtterances: number, durationMs: number) => void
  error: (error: Error, context?: Record<string, unknown>) => void
}

/**
 * Main persistence manager class
 */
export class TranscriptPersistenceManager extends EventEmitter {
  private readonly config: PersistenceConfig
  private readonly ringBuffer: TranscriptRingBuffer
  private readonly activeSessions = new Set<string>()
  private isInitialized = false
  private isDestroyed = false

  // Performance tracking
  private metrics: PersistenceMetrics
  private performanceTimers = new Map<string, number>()

  // WAL components
  // private walWriter?: WalWriter
  private walRecovery?: WalRecoveryManager

  // Flush management
  private flushTimer: NodeJS.Timeout | null = null
  private pendingPartialCount = 0

  constructor(config: Partial<PersistenceConfig> = {}) {
    super()

    this.config = {
      ringBuffer: {
        capacity: 10000,
        enableMetrics: true,
        enableIndexing: true,
        warnThreshold: 0.8
      },
      wal: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        rotationIntervalMs: 15 * 60 * 1000, // 15 minutes
        flushIntervalMs: 250, // 250ms
        flushOnNPartials: 10, // Every 10 partials
        enableCompression: true,
        retentionCount: 10 // Keep 10 WAL files
      },
      recovery: {
        walDirectory: './.wal',
        mode: RecoveryMode.FULL,
        maxRecoveryTimeMs: 30000,
        recoverPartialSessions: true,
        markUncertainEntries: true,
        conflictResolution: 'newest' as const
      },
      flushTriggers: [
        {type: 'time', intervalMs: 250},
        {type: 'count', threshold: 10},
        {type: 'event', eventType: 'transcript:finalized'},
        {type: 'visibility', intervalMs: 10000} // 10s background threshold
      ],
      enableWal: true,
      enablePrivacyMode: true,
      recoveryTimeoutMs: 30000,
      ...config
    }

    // Initialize ring buffer
    this.ringBuffer = new TranscriptRingBuffer(this.config.ringBuffer)

    // Initialize metrics
    this.metrics = {
      ringBuffer: {
        size: 0,
        utilization: 0,
        overflows: 0,
        compactions: 0
      },
      wal: {
        fileCount: 0,
        totalSize: 0,
        pendingFlushes: 0,
        flushLatency: 0
      },
      sessions: {
        active: 0,
        total: 0,
        deleted: 0
      },
      performance: {
        appendLatency: 0,
        queryLatency: 0,
        flushLatency: 0
      }
    }
  }

  /**
   * Initialize the persistence layer
   * This will set up WAL recovery and flush triggers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    const initStart = Date.now()
    console.log('[Persistence] Initializing TranscriptPersistenceManager...')

    try {
      // Initialize WAL components
      if (this.config.enableWal) {
        // Initialize recovery manager
        this.walRecovery = new WalRecoveryManager(this.config.recovery)

        // Perform crash recovery
        await this.performRecovery()

        // TODO: Initialize WAL writer when implemented
        // this.walWriter = new WalWriter(this.config.wal)
      }

      // Set up flush triggers
      this.setupFlushTriggers()

      this.isInitialized = true
      const initDuration = Date.now() - initStart

      console.log(`[Persistence] Initialized in ${initDuration}ms`, {
        walEnabled: this.config.enableWal,
        recoveryEnabled: !!this.walRecovery,
        ringBufferCapacity: this.config.ringBuffer.capacity,
        flushTriggers: this.config.flushTriggers.length
      })
    } catch (error) {
      console.error('[Persistence] Failed to initialize:', error)
      this.emit('error', error as Error, {phase: 'initialization'})
      throw error
    }
  }

  /**
   * Add or update an utterance in the persistence layer
   */
  async persistUtterance(utterance: TranscriptUtterance): Promise<boolean> {
    if (!this.isInitialized || this.isDestroyed) {
      return false
    }

    const timerId = this.startPerformanceTimer('persist-utterance')

    try {
      // Ensure session is tracked
      if (!this.activeSessions.has(utterance.sessionId)) {
        this.activeSessions.add(utterance.sessionId)
        this.metrics.sessions.active = this.activeSessions.size
        this.metrics.sessions.total++
        this.emit('session:created', utterance.sessionId)
      }

      // Check if utterance already exists (update case)
      const existing = this.ringBuffer.get(utterance.id)
      const isUpdate = !!existing

      // Add/update in ring buffer
      if (isUpdate) {
        await this.ringBuffer.update(utterance.id, utterance)
        this.emit('utterance:updated', utterance)
      } else {
        await this.ringBuffer.append(utterance)
        this.emit('utterance:added', utterance)
      }

      // TODO: Write to WAL when implemented
      // if (this.config.enableWal && this.walWriter) {
      //   await this.walWriter.writeUtterance(utterance, isUpdate ? 'update' : 'insert')
      // }

      // Track partials for flush triggers
      if (utterance.state === TranscriptState.STREAMING_ACTIVE) {
        this.pendingPartialCount++
        this.checkFlushTriggers()
      }

      // Update performance metrics
      this.endPerformanceTimer(timerId, 'appendLatency')
      this.updateMetricsFromRingBuffer()

      return true
    } catch (error) {
      console.error('[Persistence] Failed to persist utterance:', error)
      this.emit('error', error as Error, {
        utteranceId: utterance.id,
        operation: 'persist'
      })
      return false
    }
  }

  /**
   * Get utterance by ID
   */
  getUtterance(utteranceId: string): TranscriptUtterance | null {
    if (!this.isInitialized) {
      return null
    }

    const timerId = this.startPerformanceTimer('get-utterance')
    const result = this.ringBuffer.get(utteranceId)
    this.endPerformanceTimer(timerId, 'queryLatency')

    return result
  }

  /**
   * Get all utterances for a session
   */
  getSessionUtterances(sessionId: string): TranscriptUtterance[] {
    if (!this.isInitialized) {
      return []
    }

    const timerId = this.startPerformanceTimer('get-session')
    const result = this.ringBuffer.getBySession(sessionId)
    this.endPerformanceTimer(timerId, 'queryLatency')

    return result
  }

  /**
   * Get utterances by state
   */
  getUtterancesByState(state: TranscriptState): TranscriptUtterance[] {
    if (!this.isInitialized) {
      return []
    }

    const timerId = this.startPerformanceTimer('get-by-state')
    const result = this.ringBuffer.getByState(state)
    this.endPerformanceTimer(timerId, 'queryLatency')

    return result
  }

  /**
   * Get recent utterances
   */
  getRecentUtterances(limit: number = 100): TranscriptUtterance[] {
    if (!this.isInitialized) {
      return []
    }

    const timerId = this.startPerformanceTimer('get-recent')
    const result = this.ringBuffer.getRecent(limit)
    this.endPerformanceTimer(timerId, 'queryLatency')

    return result
  }

  /**
   * Delete a session and all its utterances (privacy compliance)
   */
  async deleteSession(sessionId: string): Promise<number> {
    if (!this.isInitialized || this.isDestroyed) {
      return 0
    }

    console.log(`[Persistence] Deleting session: ${sessionId}`)

    try {
      // Remove from ring buffer
      const removedCount = await this.ringBuffer.clearSession(sessionId)

      // TODO: Remove from WAL when implemented
      // if (this.config.enableWal && this.walWriter) {
      //   await this.walWriter.deleteSession(sessionId)
      // }

      // Update session tracking
      this.activeSessions.delete(sessionId)
      this.metrics.sessions.active = this.activeSessions.size
      this.metrics.sessions.deleted++

      this.emit('session:deleted', sessionId, removedCount)
      this.updateMetricsFromRingBuffer()

      console.log(`[Persistence] Deleted session ${sessionId} (${removedCount} utterances)`)
      return removedCount
    } catch (error) {
      console.error(`[Persistence] Failed to delete session ${sessionId}:`, error)
      this.emit('error', error as Error, {
        sessionId,
        operation: 'delete-session'
      })
      return 0
    }
  }

  /**
   * Clean up old terminal state utterances
   */
  async cleanupOldUtterances(maxAgeMs: number = 5 * 60 * 1000): Promise<number> {
    if (!this.isInitialized) {
      return 0
    }

    const removedCount = await this.ringBuffer.clearOldTerminal(maxAgeMs)

    if (removedCount > 0) {
      console.log(`[Persistence] Cleaned up ${removedCount} old terminal utterances`)
      this.updateMetricsFromRingBuffer()
    }

    return removedCount
  }

  /**
   * Force flush pending WAL entries
   */
  async flush(): Promise<void> {
    if (!this.isInitialized || !this.config.enableWal) {
      return
    }

    const flushStart = Date.now()

    try {
      // TODO: Flush WAL when implemented
      // if (this.walWriter) {
      //   await this.walWriter.flush()
      // }

      // Reset partial count
      this.pendingPartialCount = 0

      const flushDuration = Date.now() - flushStart
      this.metrics.wal.flushLatency = flushDuration

      this.emit('wal:flushed', this.pendingPartialCount, flushDuration)
    } catch (error) {
      console.error('[Persistence] Failed to flush WAL:', error)
      this.emit('error', error as Error, {operation: 'flush'})
    }
  }

  /**
   * Get current persistence metrics
   */
  getMetrics(): Readonly<PersistenceMetrics> {
    this.updateMetricsFromRingBuffer()
    return JSON.parse(JSON.stringify(this.metrics))
  }

  /**
   * Get active session IDs
   */
  getActiveSessions(): readonly string[] {
    return Array.from(this.activeSessions)
  }

  /**
   * Check if a session exists and has active utterances
   */
  hasSession(sessionId: string): boolean {
    return this.activeSessions.has(sessionId)
  }

  /**
   * Graceful shutdown - flush pending data and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    console.log('[Persistence] Shutting down TranscriptPersistenceManager...')

    try {
      // Stop flush timer
      if (this.flushTimer) {
        clearInterval(this.flushTimer)
        this.flushTimer = null
      }

      // Final flush if WAL enabled
      if (this.config.enableWal) {
        await this.flush()
      }

      // TODO: Close WAL writer when implemented
      // if (this.walWriter) {
      //   await this.walWriter.close()
      // }

      this.isDestroyed = true
      this.removeAllListeners()

      console.log('[Persistence] Shutdown complete')
    } catch (error) {
      console.error('[Persistence] Error during shutdown:', error)
      this.emit('error', error as Error, {phase: 'shutdown'})
    }
  }

  // Private methods

  private setupFlushTriggers(): void {
    // Set up time-based flush trigger
    const timeBasedTrigger = this.config.flushTriggers.find(t => t.type === 'time')
    if (timeBasedTrigger && timeBasedTrigger.intervalMs) {
      this.flushTimer = setInterval(() => {
        if (this.pendingPartialCount > 0) {
          this.flush()
        }
      }, timeBasedTrigger.intervalMs)
    }

    // TODO: Set up other trigger types (event-based, visibility-based)
    // This will be expanded when WAL is implemented
  }

  private checkFlushTriggers(): void {
    // Count-based trigger
    const countTrigger = this.config.flushTriggers.find(t => t.type === 'count')
    if (
      countTrigger &&
      countTrigger.threshold &&
      this.pendingPartialCount >= countTrigger.threshold
    ) {
      this.flush()
    }
  }

  private updateMetricsFromRingBuffer(): void {
    const bufferMetrics = this.ringBuffer.getMetrics()
    this.metrics.ringBuffer = {
      size: bufferMetrics.size,
      utilization: bufferMetrics.utilization,
      overflows: bufferMetrics.overflows,
      compactions: bufferMetrics.compactions
    }
  }

  private startPerformanceTimer(operation: string): string {
    const timerId = `${operation}-${Date.now()}-${Math.random()}`
    this.performanceTimers.set(timerId, Date.now())
    return timerId
  }

  private endPerformanceTimer(
    timerId: string,
    metricKey: keyof PersistenceMetrics['performance']
  ): void {
    const startTime = this.performanceTimers.get(timerId)
    if (startTime) {
      const duration = Date.now() - startTime

      // Simple moving average (last 10 measurements)
      const currentValue = this.metrics.performance[metricKey]
      this.metrics.performance[metricKey] =
        currentValue === 0 ? duration : (currentValue * 9 + duration) / 10

      this.performanceTimers.delete(timerId)
    }
  }

  /**
   * Perform crash recovery from WAL files
   */
  private async performRecovery(): Promise<void> {
    if (!this.walRecovery) {
      return
    }

    const recoveryStart = Date.now()
    this.emit('recovery:started', [])

    try {
      console.log('[Persistence] Starting WAL recovery...')

      const recoveryResult = await this.walRecovery.performRecovery()
      const recoveryDuration = Date.now() - recoveryStart

      // Process recovered sessions
      let totalUtterancesRecovered = 0
      for (const session of recoveryResult.sessions) {
        if (session.isComplete || this.config.recovery.recoverPartialSessions) {
          // Add recovered utterances to ring buffer
          for (const utterance of session.utterances) {
            try {
              await this.ringBuffer.append(utterance)
              totalUtterancesRecovered++
            } catch (error) {
              console.warn(`[Persistence] Failed to recover utterance ${utterance.id}:`, error)
            }
          }

          // Track recovered session
          this.activeSessions.add(session.sessionId)

          // Log uncertain entries
          if (session.uncertainEntries.length > 0) {
            console.warn(
              `[Persistence] Session ${session.sessionId} has ${session.uncertainEntries.length} uncertain entries that may need verification`
            )
          }
        }
      }

      // Update metrics
      this.metrics.sessions.active = this.activeSessions.size
      this.metrics.sessions.total = recoveryResult.sessions.length

      this.emit('recovery:completed', totalUtterancesRecovered, recoveryDuration)

      console.log(`[Persistence] Recovery completed:`, {
        result: recoveryResult.result,
        sessionsFound: recoveryResult.stats.sessionsFound,
        sessionsRecovered: recoveryResult.stats.sessionsRecovered,
        utterancesRecovered: totalUtterancesRecovered,
        uncertainEntries: recoveryResult.stats.uncertainEntries,
        durationMs: recoveryDuration
      })
    } catch (error) {
      console.error('[Persistence] Recovery failed:', error)
      this.emit('error', error as Error, {phase: 'recovery'})

      // Don't throw - continue initialization even if recovery fails
      console.warn('[Persistence] Continuing initialization despite recovery failure')
    }
  }

  /**
   * Get recovery status and statistics
   */
  getRecoveryStats(): {hasRecoveryManager: boolean; lastRecoveryStats: unknown} {
    return {
      hasRecoveryManager: !!this.walRecovery,
      lastRecoveryStats: this.walRecovery?.getLastRecoveryStats() || null
    }
  }

  /**
   * Perform a quick health check on WAL files
   */
  async quickHealthCheck(): Promise<{healthy: boolean; fileCount: number; lastWrite?: number}> {
    if (!this.walRecovery) {
      return {healthy: true, fileCount: 0}
    }

    return await this.walRecovery.quickHealthCheck()
  }
}

// Global singleton instance (optional - can be used for convenience)
export const globalPersistenceManager = new TranscriptPersistenceManager()

export default TranscriptPersistenceManager
