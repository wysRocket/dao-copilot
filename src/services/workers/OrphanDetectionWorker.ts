/**
 * Orphan Detection Worker
 *
 * Background worker that runs every 2 seconds to detect and recover orphaned transcripts.
 * Identifies partials stuck without finalization and attempts recovery.
 *
 * Task 5.1 - Implement OrphanDetectionWorker class
 */

import {EventEmitter} from 'events'
import {logger} from '../gemini-logger'
import {GCPGeminiLiveClient, TranscriptionResult} from '../gcp-gemini-live-client'
import {GeminiSessionManager, SessionData} from '../gemini-session-manager'

/**
 * Configuration for orphan detection behavior
 */
export interface OrphanDetectionConfig {
  /** How often to run detection sweep in milliseconds (default: 2000) */
  scanIntervalMs: number
  /** Time threshold for considering partials orphaned (default: 4000ms) */
  partialTimeoutMs: number
  /** Time threshold for sessions with small trailing partials (default: 3000ms) */
  sessionTimeoutMs: number
  /** Maximum length for "small" trailing partials (default: 150 chars) */
  smallPartialThreshold: number
  /** Maximum number of recovery attempts per orphaned item (default: 3) */
  maxRecoveryAttempts: number
  /** Whether to emit telemetry events (default: true) */
  enableTelemetry: boolean
  /** Whether detailed logging is enabled (default: false) */
  enableDetailedLogging: boolean
}

/**
 * Default configuration values
 */
export const DEFAULT_ORPHAN_CONFIG: OrphanDetectionConfig = {
  scanIntervalMs: 2000,
  partialTimeoutMs: 4000,
  sessionTimeoutMs: 3000,
  smallPartialThreshold: 150,
  maxRecoveryAttempts: 3,
  enableTelemetry: true,
  enableDetailedLogging: false
}

/**
 * Information about an orphaned partial result
 */
export interface OrphanedPartial {
  /** Unique identifier for the orphaned partial */
  id: string
  /** The partial transcription result */
  result: TranscriptionResult
  /** When the partial was last updated */
  lastUpdateTimestamp: number
  /** How many recovery attempts have been made */
  recoveryAttempts: number
  /** The session this partial belongs to */
  sessionId?: string
  /** Type of orphan detected */
  orphanType: 'stuck_partial' | 'trailing_small_partial'
}

/**
 * Information about an orphaned session
 */
export interface OrphanedSession {
  /** Session identifier */
  sessionId: string
  /** Session data */
  session: SessionData
  /** Array of small trailing partials */
  trailingPartials: TranscriptionResult[]
  /** When the session was last active */
  lastActivityTimestamp: number
  /** How many recovery attempts have been made */
  recoveryAttempts: number
}

/**
 * Recovery statistics
 */
export interface OrphanRecoveryStats {
  /** Total orphans detected since start */
  totalOrphansDetected: number
  /** Total successful recoveries */
  totalRecoveriesSucceeded: number
  /** Total failed recoveries */
  totalRecoveriesFailed: number
  /** Number of stuck partials detected */
  stuckPartialsDetected: number
  /** Number of sessions with trailing partials */
  trailingPartialsDetected: number
  /** Average recovery time in ms */
  averageRecoveryTime: number
  /** Last scan timestamp */
  lastScanTimestamp: number
  /** Number of scans performed */
  totalScansPerformed: number
}

/**
 * Events emitted by the OrphanDetectionWorker
 */
export interface OrphanDetectionEvents {
  /** Emitted when an orphaned partial is detected */
  orphanDetected: (orphan: OrphanedPartial | OrphanedSession) => void
  /** Emitted when recovery is attempted */
  recoveryAttempted: (orphan: OrphanedPartial | OrphanedSession, method: string) => void
  /** Emitted when recovery succeeds */
  recoverySucceeded: (
    orphan: OrphanedPartial | OrphanedSession,
    finalResult?: TranscriptionResult
  ) => void
  /** Emitted when recovery fails */
  recoveryFailed: (orphan: OrphanedPartial | OrphanedSession, error: Error) => void
  /** Emitted when a scan cycle completes */
  scanCompleted: (stats: OrphanRecoveryStats) => void
  /** Emitted when worker starts */
  workerStarted: () => void
  /** Emitted when worker stops */
  workerStopped: () => void
}

declare interface OrphanDetectionWorker {
  on<U extends keyof OrphanDetectionEvents>(event: U, listener: OrphanDetectionEvents[U]): this

  emit<U extends keyof OrphanDetectionEvents>(
    event: U,
    ...args: Parameters<OrphanDetectionEvents[U]>
  ): boolean
}

/**
 * OrphanDetectionWorker - Background worker for detecting and recovering orphaned transcripts
 *
 * This worker runs continuously to detect and recover from:
 * 1. Partial transcription results that are stuck (no update for > 4 seconds)
 * 2. Sessions with small trailing partials (< 150 chars, no final for > 3 seconds)
 *
 * Uses non-blocking operations to avoid impacting main thread performance.
 */
class OrphanDetectionWorker extends EventEmitter {
  private config: OrphanDetectionConfig
  private client: GCPGeminiLiveClient
  private sessionManager: GeminiSessionManager

  private isRunning: boolean = false
  private scanInterval: NodeJS.Timeout | null = null

  // Tracking orphaned items and recovery attempts
  private orphanedPartials: Map<string, OrphanedPartial> = new Map()
  private orphanedSessions: Map<string, OrphanedSession> = new Map()

  // Performance and statistics
  private stats: OrphanRecoveryStats = {
    totalOrphansDetected: 0,
    totalRecoveriesSucceeded: 0,
    totalRecoveriesFailed: 0,
    stuckPartialsDetected: 0,
    trailingPartialsDetected: 0,
    averageRecoveryTime: 0,
    lastScanTimestamp: 0,
    totalScansPerformed: 0
  }

  private recoveryTimes: number[] = []

  constructor(
    client: GCPGeminiLiveClient,
    sessionManager: GeminiSessionManager,
    config: Partial<OrphanDetectionConfig> = {}
  ) {
    super()

    this.client = client
    this.sessionManager = sessionManager
    this.config = {...DEFAULT_ORPHAN_CONFIG, ...config}

    // Set up event listeners for tracking transcription results
    this.setupEventListeners()

    logger.info('OrphanDetectionWorker initialized', {
      scanIntervalMs: this.config.scanIntervalMs,
      partialTimeoutMs: this.config.partialTimeoutMs,
      sessionTimeoutMs: this.config.sessionTimeoutMs
    })
  }

  /**
   * Set up event listeners to track transcription activity
   */
  private setupEventListeners(): void {
    // Listen for partial results to track potential orphans
    this.client.on('partialTranscriptionResult', (result: TranscriptionResult) => {
      // Update tracking for this partial
      this.updatePartialTracking(result)
    })

    // Listen for final results to remove from orphan tracking
    this.client.on('finalTranscriptionResult', (result: TranscriptionResult) => {
      // Remove any orphan tracking for this result
      this.removeOrphanTracking(result.id)
    })

    // Listen for session activity
    this.sessionManager.on('sessionCreated', (session: SessionData) => {
      if (this.config.enableDetailedLogging) {
        logger.debug('OrphanDetectionWorker: New session created', {
          sessionId: session.sessionId
        })
      }
    })

    this.sessionManager.on('sessionSuspended', (session: SessionData) => {
      // Check for orphaned partials in suspended session
      this.checkSessionForOrphans(session)
    })
  }

  /**
   * Update tracking information for a partial result
   */
  private updatePartialTracking(result: TranscriptionResult): void {
    if (!result.isPartial) return

    const existingOrphan = this.orphanedPartials.get(result.id)
    if (existingOrphan) {
      // Update existing tracking
      existingOrphan.lastUpdateTimestamp = Date.now()
      existingOrphan.result = result
    }
    // Don't add new tracking here - let the scan detect orphans
  }

  /**
   * Remove orphan tracking for a finalized result
   */
  private removeOrphanTracking(resultId: string): void {
    if (this.orphanedPartials.has(resultId)) {
      this.orphanedPartials.delete(resultId)

      if (this.config.enableDetailedLogging) {
        logger.debug('OrphanDetectionWorker: Removed orphan tracking for finalized result', {
          resultId
        })
      }
    }
  }

  /**
   * Check a session for potential orphaned partials
   */
  private checkSessionForOrphans(session: SessionData): void {
    const sessionPartials = this.client
      .getPartialResults()
      .filter(result => result.sessionId === session.sessionId)

    if (sessionPartials.length === 0) return

    // Look for small trailing partials
    const trailingPartials = sessionPartials.filter(
      partial => partial.text.length < this.config.smallPartialThreshold
    )

    if (trailingPartials.length > 0) {
      const orphanedSession: OrphanedSession = {
        sessionId: session.sessionId,
        session,
        trailingPartials,
        lastActivityTimestamp: session.lastActivity.getTime(),
        recoveryAttempts: 0
      }

      this.orphanedSessions.set(session.sessionId, orphanedSession)
    }
  }

  /**
   * Start the background worker
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('OrphanDetectionWorker: Attempted to start already running worker')
      return
    }

    this.isRunning = true

    // Start the scan interval
    this.scanInterval = setInterval(() => {
      this.performOrphanScan()
    }, this.config.scanIntervalMs)

    logger.info('OrphanDetectionWorker started', {
      scanIntervalMs: this.config.scanIntervalMs
    })

    this.emit('workerStarted')
  }

  /**
   * Stop the background worker
   */
  public stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }

    logger.info('OrphanDetectionWorker stopped')
    this.emit('workerStopped')
  }

  /**
   * Perform a scan for orphaned transcription results
   * This is the main detection loop that runs every 2 seconds
   */
  private async performOrphanScan(): Promise<void> {
    if (!this.isRunning) return

    const scanStartTime = Date.now()
    this.stats.totalScansPerformed++

    try {
      // Get current partial results
      const partialResults = this.client.getPartialResults()
      const currentSessions = this.sessionManager.getAllSessions()

      // Scan for stuck partials
      await this.scanForStuckPartials(partialResults)

      // Scan for sessions with trailing partials
      await this.scanForTrailingPartials(currentSessions)

      // Attempt recovery for existing orphans
      await this.attemptOrphanRecovery()

      this.stats.lastScanTimestamp = scanStartTime

      if (this.config.enableDetailedLogging) {
        logger.debug('OrphanDetectionWorker: Scan completed', {
          scanDuration: Date.now() - scanStartTime,
          partialsScanned: partialResults.length,
          sessionsScanned: currentSessions.length,
          orphanedPartials: this.orphanedPartials.size,
          orphanedSessions: this.orphanedSessions.size
        })
      }

      this.emit('scanCompleted', {...this.stats})
    } catch (error) {
      logger.error('OrphanDetectionWorker: Error during scan', {
        error: error instanceof Error ? error.message : String(error),
        scanDuration: Date.now() - scanStartTime
      })
    }
  }

  /**
   * Scan for partials that haven't been updated in > partialTimeoutMs
   */
  private async scanForStuckPartials(partialResults: TranscriptionResult[]): Promise<void> {
    const currentTime = Date.now()

    for (const result of partialResults) {
      if (!result.isPartial) continue

      const timeSinceUpdate = currentTime - result.timestamp

      // Check if this partial is stuck
      if (timeSinceUpdate > this.config.partialTimeoutMs) {
        const existingOrphan = this.orphanedPartials.get(result.id)

        if (!existingOrphan) {
          // New orphaned partial detected
          const orphan: OrphanedPartial = {
            id: result.id,
            result,
            lastUpdateTimestamp: result.timestamp,
            recoveryAttempts: 0,
            sessionId: result.sessionId,
            orphanType: 'stuck_partial'
          }

          this.orphanedPartials.set(result.id, orphan)
          this.stats.totalOrphansDetected++
          this.stats.stuckPartialsDetected++

          logger.info('OrphanDetectionWorker: Stuck partial detected', {
            resultId: result.id,
            sessionId: result.sessionId,
            textLength: result.text.length,
            timeSinceUpdate
          })

          if (this.config.enableTelemetry) {
            this.emit('orphanDetected', orphan)
          }
        }
      }
    }
  }

  /**
   * Scan for sessions with small trailing partials that haven't been finalized
   */
  private async scanForTrailingPartials(sessions: SessionData[]): Promise<void> {
    const currentTime = Date.now()

    for (const session of sessions) {
      const timeSinceActivity = currentTime - session.lastActivity.getTime()

      if (timeSinceActivity > this.config.sessionTimeoutMs) {
        const sessionPartials = this.client
          .getPartialResults()
          .filter(result => result.sessionId === session.sessionId)

        const trailingPartials = sessionPartials.filter(
          partial =>
            partial.text.length < this.config.smallPartialThreshold &&
            currentTime - partial.timestamp > this.config.sessionTimeoutMs
        )

        if (trailingPartials.length > 0 && !this.orphanedSessions.has(session.sessionId)) {
          // New session with trailing partials detected
          const orphan: OrphanedSession = {
            sessionId: session.sessionId,
            session,
            trailingPartials,
            lastActivityTimestamp: session.lastActivity.getTime(),
            recoveryAttempts: 0
          }

          this.orphanedSessions.set(session.sessionId, orphan)
          this.stats.totalOrphansDetected++
          this.stats.trailingPartialsDetected++

          logger.info('OrphanDetectionWorker: Session with trailing partials detected', {
            sessionId: session.sessionId,
            trailingPartialCount: trailingPartials.length,
            timeSinceActivity
          })

          if (this.config.enableTelemetry) {
            this.emit('orphanDetected', orphan)
          }
        }
      }
    }
  }

  /**
   * Attempt recovery for all currently tracked orphans
   */
  private async attemptOrphanRecovery(): Promise<void> {
    // Recover stuck partials
    for (const [id, orphan] of this.orphanedPartials.entries()) {
      if (orphan.recoveryAttempts < this.config.maxRecoveryAttempts) {
        await this.recoverStuckPartial(orphan)
      } else {
        // Max attempts reached, remove from tracking
        this.orphanedPartials.delete(id)
        logger.warn('OrphanDetectionWorker: Max recovery attempts reached for stuck partial', {
          resultId: id,
          attempts: orphan.recoveryAttempts
        })
      }
    }

    // Recover sessions with trailing partials
    for (const [sessionId, orphan] of this.orphanedSessions.entries()) {
      if (orphan.recoveryAttempts < this.config.maxRecoveryAttempts) {
        await this.recoverTrailingPartials(orphan)
      } else {
        // Max attempts reached, remove from tracking
        this.orphanedSessions.delete(sessionId)
        logger.warn('OrphanDetectionWorker: Max recovery attempts reached for session', {
          sessionId,
          attempts: orphan.recoveryAttempts
        })
      }
    }
  }

  /**
   * Attempt to recover a stuck partial by forcing finalization
   */
  private async recoverStuckPartial(orphan: OrphanedPartial): Promise<void> {
    const recoveryStartTime = Date.now()
    orphan.recoveryAttempts++

    try {
      logger.info('OrphanDetectionWorker: Attempting recovery for stuck partial', {
        resultId: orphan.id,
        sessionId: orphan.sessionId,
        attempt: orphan.recoveryAttempts,
        textLength: orphan.result.text.length
      })

      if (this.config.enableTelemetry) {
        this.emit('recoveryAttempted', orphan, 'forced_flush')
      }

      // Try to force finalization by converting partial to final
      const finalResult: TranscriptionResult = {
        ...orphan.result,
        isFinal: true,
        isPartial: false,
        metadata: {
          ...orphan.result.metadata,
          convertedFromPartial: true,
          recoveryMethod: 'orphan_detection_worker',
          recoveryAttempt: orphan.recoveryAttempts
        }
      }

      // Emit the final result through the client
      this.client.emit('finalTranscriptionResult', finalResult)

      // Record successful recovery
      const recoveryTime = Date.now() - recoveryStartTime
      this.recoveryTimes.push(recoveryTime)
      this.stats.totalRecoveriesSucceeded++
      this.updateAverageRecoveryTime()

      // Remove from orphan tracking
      this.orphanedPartials.delete(orphan.id)

      logger.info('OrphanDetectionWorker: Successfully recovered stuck partial', {
        resultId: orphan.id,
        recoveryTime,
        attempt: orphan.recoveryAttempts
      })

      if (this.config.enableTelemetry) {
        this.emit('recoverySucceeded', orphan, finalResult)
      }
    } catch (error) {
      const recoveryTime = Date.now() - recoveryStartTime
      this.stats.totalRecoveriesFailed++

      logger.error('OrphanDetectionWorker: Failed to recover stuck partial', {
        resultId: orphan.id,
        attempt: orphan.recoveryAttempts,
        error: error instanceof Error ? error.message : String(error),
        recoveryTime
      })

      if (this.config.enableTelemetry) {
        this.emit(
          'recoveryFailed',
          orphan,
          error instanceof Error ? error : new Error(String(error))
        )
      }
    }
  }

  /**
   * Attempt to recover sessions with trailing partials
   */
  private async recoverTrailingPartials(orphan: OrphanedSession): Promise<void> {
    const recoveryStartTime = Date.now()
    orphan.recoveryAttempts++

    try {
      logger.info('OrphanDetectionWorker: Attempting recovery for trailing partials', {
        sessionId: orphan.sessionId,
        partialCount: orphan.trailingPartials.length,
        attempt: orphan.recoveryAttempts
      })

      if (this.config.enableTelemetry) {
        this.emit('recoveryAttempted', orphan, 'session_finalization')
      }

      // Convert all trailing partials to final results
      for (const partial of orphan.trailingPartials) {
        const finalResult: TranscriptionResult = {
          ...partial,
          isFinal: true,
          isPartial: false,
          metadata: {
            ...partial.metadata,
            convertedFromPartial: true,
            recoveryMethod: 'orphan_detection_worker',
            recoveryAttempt: orphan.recoveryAttempts,
            sessionFinalization: true
          }
        }

        // Emit the final result
        this.client.emit('finalTranscriptionResult', finalResult)
      }

      // Record successful recovery
      const recoveryTime = Date.now() - recoveryStartTime
      this.recoveryTimes.push(recoveryTime)
      this.stats.totalRecoveriesSucceeded++
      this.updateAverageRecoveryTime()

      // Remove from orphan tracking
      this.orphanedSessions.delete(orphan.sessionId)

      logger.info('OrphanDetectionWorker: Successfully recovered trailing partials', {
        sessionId: orphan.sessionId,
        partialCount: orphan.trailingPartials.length,
        recoveryTime,
        attempt: orphan.recoveryAttempts
      })

      if (this.config.enableTelemetry) {
        this.emit('recoverySucceeded', orphan)
      }
    } catch (error) {
      const recoveryTime = Date.now() - recoveryStartTime
      this.stats.totalRecoveriesFailed++

      logger.error('OrphanDetectionWorker: Failed to recover trailing partials', {
        sessionId: orphan.sessionId,
        attempt: orphan.recoveryAttempts,
        error: error instanceof Error ? error.message : String(error),
        recoveryTime
      })

      if (this.config.enableTelemetry) {
        this.emit(
          'recoveryFailed',
          orphan,
          error instanceof Error ? error : new Error(String(error))
        )
      }
    }
  }

  /**
   * Update the average recovery time statistic
   */
  private updateAverageRecoveryTime(): void {
    if (this.recoveryTimes.length === 0) {
      this.stats.averageRecoveryTime = 0
      return
    }

    const total = this.recoveryTimes.reduce((sum, time) => sum + time, 0)
    this.stats.averageRecoveryTime = total / this.recoveryTimes.length

    // Keep only last 100 recovery times to prevent memory growth
    if (this.recoveryTimes.length > 100) {
      this.recoveryTimes = this.recoveryTimes.slice(-100)
    }
  }

  /**
   * Update worker configuration
   */
  public updateConfig(updates: Partial<OrphanDetectionConfig>): void {
    const oldConfig = {...this.config}
    this.config = {...this.config, ...updates}

    logger.info('OrphanDetectionWorker: Configuration updated', {
      oldConfig: {
        scanIntervalMs: oldConfig.scanIntervalMs,
        partialTimeoutMs: oldConfig.partialTimeoutMs,
        sessionTimeoutMs: oldConfig.sessionTimeoutMs
      },
      newConfig: {
        scanIntervalMs: this.config.scanIntervalMs,
        partialTimeoutMs: this.config.partialTimeoutMs,
        sessionTimeoutMs: this.config.sessionTimeoutMs
      }
    })

    // Restart interval if scan interval changed and worker is running
    if (
      updates.scanIntervalMs &&
      this.isRunning &&
      updates.scanIntervalMs !== oldConfig.scanIntervalMs
    ) {
      if (this.scanInterval) {
        clearInterval(this.scanInterval)
      }
      this.scanInterval = setInterval(() => {
        this.performOrphanScan()
      }, this.config.scanIntervalMs)
    }
  }

  /**
   * Get current recovery statistics
   */
  public getStats(): OrphanRecoveryStats {
    return {...this.stats}
  }

  /**
   * Get current orphaned items count
   */
  public getOrphanCounts(): {orphanedPartials: number; orphanedSessions: number} {
    return {
      orphanedPartials: this.orphanedPartials.size,
      orphanedSessions: this.orphanedSessions.size
    }
  }

  /**
   * Check if the worker is currently running
   */
  public isActive(): boolean {
    return this.isRunning
  }

  /**
   * Force a manual scan (useful for testing)
   */
  public async forceScan(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Worker must be started before forcing a scan')
    }

    await this.performOrphanScan()
  }

  /**
   * Clear all orphan tracking (useful for testing or reset)
   */
  public clearOrphanTracking(): void {
    this.orphanedPartials.clear()
    this.orphanedSessions.clear()

    logger.info('OrphanDetectionWorker: Cleared all orphan tracking')
  }

  /**
   * Graceful shutdown
   */
  public async destroy(): Promise<void> {
    this.stop()
    this.clearOrphanTracking()
    this.removeAllListeners()

    logger.info('OrphanDetectionWorker: Destroyed')
  }
}

export {OrphanDetectionWorker}
