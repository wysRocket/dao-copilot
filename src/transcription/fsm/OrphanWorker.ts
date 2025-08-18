/**
 * OrphanWorker - Edge Case Handler for Transcript Lifecycle
 *
 * Detects and handles transcripts that become "orphaned" or stuck in various states.
 * Integrates with the TranscriptFSM to provide robust recovery mechanisms.
 *
 * Key responsibilities:
 * - Detect transcripts stuck in awaiting-final state
 * - Handle late-arriving partials after finalization
 * - Implement timeout-based transitions for stalled states
 * - Provide recovery mechanisms for orphaned transcripts
 * - Log and track edge cases for system improvement
 */

import {TranscriptFSMCore} from './TranscriptFSM'
import {TranscriptState} from './TranscriptStates'
import {GeminiLogger} from '../../services/gemini-logger'

export interface OrphanDetectionConfig {
  /** Maximum time in awaiting-final state before considered stuck (ms) */
  awaitingFinalTimeout: number
  /** Maximum time since last activity before considered stale (ms) */
  staleTimeout: number
  /** How often to check for orphaned transcripts (ms) */
  checkInterval: number
  /** Maximum number of late partials to accept per transcript */
  maxLatePartials: number
  /** Time window after finalization to accept late partials (ms) */
  latePartialGracePeriod: number
  /** Enable automatic recovery attempts */
  enableAutoRecovery: boolean
  /** Maximum recovery attempts per transcript */
  maxRecoveryAttempts: number
}

export interface OrphanedTranscript {
  id: string
  currentState: TranscriptState
  lastActivity: number
  stuckDuration: number
  recoveryAttempts: number
  latePartialsReceived: number
  metadata: {
    originalText?: string
    lastPartialText?: string
    finalizedAt?: number
    source?: string
    errorHistory: string[]
  }
}

export interface OrphanWorkerStats {
  totalOrphansDetected: number
  successfulRecoveries: number
  failedRecoveries: number
  latePartialsHandled: number
  timeoutsTriggered: number
  currentOrphanCount: number
  averageRecoveryTime: number
  mostCommonOrphanState: TranscriptState | null
}

export interface OrphanRecoveryResult {
  success: boolean
  action: 'timeout' | 'force-finalize' | 'cleanup' | 'ignore-late-partial'
  message: string
  newState?: TranscriptState
}

export const DEFAULT_ORPHAN_CONFIG: OrphanDetectionConfig = {
  awaitingFinalTimeout: 30000, // 30 seconds
  staleTimeout: 60000, // 1 minute
  checkInterval: 10000, // 10 seconds
  maxLatePartials: 3, // Accept up to 3 late partials
  latePartialGracePeriod: 5000, // 5 seconds after finalization
  enableAutoRecovery: true,
  maxRecoveryAttempts: 3
}

/**
 * OrphanWorker handles edge cases in transcript lifecycle management
 */
export class OrphanWorker {
  private config: OrphanDetectionConfig
  private logger: GeminiLogger
  private trackedTranscripts: Map<string, OrphanedTranscript> = new Map()
  private checkTimer: NodeJS.Timeout | null = null
  private stats: OrphanWorkerStats = {
    totalOrphansDetected: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    latePartialsHandled: 0,
    timeoutsTriggered: 0,
    currentOrphanCount: 0,
    averageRecoveryTime: 0,
    mostCommonOrphanState: null
  }
  private recoveryTimes: number[] = []

  constructor(config: Partial<OrphanDetectionConfig> = {}) {
    this.config = {...DEFAULT_ORPHAN_CONFIG, ...config}

    // Use minimal logger configuration to avoid blocking module load
    this.logger = new GeminiLogger({
      level: 2, // LogLevel.INFO
      enableConsole: true,
      enableFile: false, // Disable file logging to prevent blocking
      includeTimestamp: true,
      includeLevel: true,
      includeContext: true
    })

    this.logger.log(2, 'OrphanWorker initialized', {
      config: this.config,
      component: 'OrphanWorker'
    })
  }

  /**
   * Start monitoring for orphaned transcripts
   */
  public startMonitoring(): void {
    if (this.checkTimer) {
      this.logger.warn('OrphanWorker monitoring already started', {component: 'OrphanWorker'})
      return
    }

    this.checkTimer = setInterval(() => {
      this.performOrphanCheck()
    }, this.config.checkInterval)

    this.logger.info('OrphanWorker monitoring started', {
      checkInterval: this.config.checkInterval,
      component: 'OrphanWorker'
    })
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }

    this.logger.info('OrphanWorker monitoring stopped', {component: 'OrphanWorker'})
  }

  /**
   * Track utterances for potential orphan detection
   */
  public trackUtterance(utteranceId: string, fsm: TranscriptFSMCore): void {
    const utterance = fsm.getUtterance(utteranceId)
    if (!utterance) {
      this.logger.warn('Cannot track non-existent utterance', {
        utteranceId,
        component: 'OrphanWorker'
      })
      return
    }

    const currentState = utterance.state
    const lastActivity = utterance.updatedAt

    if (this.trackedTranscripts.has(utteranceId)) {
      // Update existing tracked transcript
      const tracked = this.trackedTranscripts.get(utteranceId)!
      tracked.currentState = currentState
      tracked.lastActivity = lastActivity
    } else {
      // Add new tracked transcript
      this.trackedTranscripts.set(utteranceId, {
        id: utteranceId,
        currentState,
        lastActivity,
        stuckDuration: 0,
        recoveryAttempts: 0,
        latePartialsReceived: 0,
        metadata: {
          originalText: utterance.textDraft,
          source: 'tracked',
          errorHistory: []
        }
      })
    }

    this.logger.debug('Utterance tracked for orphan detection', {
      utteranceId,
      state: currentState,
      component: 'OrphanWorker'
    })
  }

  /**
   * Handle a late-arriving partial after transcript finalization
   */
  public handleLatePartial(
    transcriptId: string,
    partialText: string /* fsm: TranscriptFSMCore */
  ): OrphanRecoveryResult {
    const tracked = this.trackedTranscripts.get(transcriptId)

    if (!tracked) {
      // Not tracking this transcript, ignore
      return {
        success: true,
        action: 'ignore-late-partial',
        message: 'Late partial ignored - transcript not tracked'
      }
    }

    tracked.latePartialsReceived++
    this.stats.latePartialsHandled++

    // Check if within grace period
    const finalizedAt = tracked.metadata.finalizedAt
    if (finalizedAt && Date.now() - finalizedAt > this.config.latePartialGracePeriod) {
      this.logger.warn('Late partial received outside grace period', {
        transcriptId,
        partialText: partialText.substring(0, 50),
        timeSinceFinalization: Date.now() - finalizedAt,
        gracePeriod: this.config.latePartialGracePeriod,
        component: 'OrphanWorker'
      })

      return {
        success: true,
        action: 'ignore-late-partial',
        message: 'Late partial ignored - outside grace period'
      }
    }

    // Check if too many late partials
    if (tracked.latePartialsReceived > this.config.maxLatePartials) {
      this.logger.warn('Too many late partials received', {
        transcriptId,
        latePartialsReceived: tracked.latePartialsReceived,
        maxAllowed: this.config.maxLatePartials,
        component: 'OrphanWorker'
      })

      return {
        success: true,
        action: 'ignore-late-partial',
        message: 'Late partial ignored - too many late partials'
      }
    }

    // Attempt to apply the late partial
    try {
      tracked.metadata.lastPartialText = partialText
      tracked.lastActivity = Date.now()

      this.logger.info('Late partial accepted and applied', {
        transcriptId,
        partialText: partialText.substring(0, 50),
        latePartialsCount: tracked.latePartialsReceived,
        component: 'OrphanWorker'
      })

      return {
        success: true,
        action: 'ignore-late-partial',
        message: 'Late partial accepted and logged'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      tracked.metadata.errorHistory.push(`Late partial error: ${errorMessage}`)

      this.logger.error('Failed to apply late partial', {
        transcriptId,
        error: errorMessage,
        component: 'OrphanWorker'
      })

      return {
        success: false,
        action: 'ignore-late-partial',
        message: `Failed to apply late partial: ${errorMessage}`
      }
    }
  }

  /**
   * Attempt to recover an orphaned transcript
   */
  public async recoverOrphanedTranscript(
    transcriptId: string,
    fsm: TranscriptFSMCore
  ): Promise<OrphanRecoveryResult> {
    const tracked = this.trackedTranscripts.get(transcriptId)
    if (!tracked) {
      return {
        success: false,
        action: 'cleanup',
        message: 'Transcript not tracked for recovery'
      }
    }

    tracked.recoveryAttempts++
    const recoveryStartTime = Date.now()

    this.logger.info('Attempting orphan recovery', {
      transcriptId,
      currentState: tracked.currentState,
      stuckDuration: tracked.stuckDuration,
      recoveryAttempt: tracked.recoveryAttempts,
      component: 'OrphanWorker'
    })

    try {
      let result: OrphanRecoveryResult

      // Choose recovery strategy based on state
      switch (tracked.currentState) {
        case TranscriptState.AWAITING_FINAL:
          result = await this.recoverAwaitingFinal(transcriptId, fsm, tracked)
          break

        case TranscriptState.STREAMING_ACTIVE:
          result = await this.recoverStaleActive(transcriptId, fsm, tracked)
          break

        default: // Handle any error states or unknown states
          result = await this.recoverFromError(transcriptId, fsm, tracked)
          break
      }

      // Track recovery metrics
      if (result.success) {
        this.stats.successfulRecoveries++
        const recoveryTime = Date.now() - recoveryStartTime
        this.recoveryTimes.push(recoveryTime)
        this.updateAverageRecoveryTime()
      } else {
        this.stats.failedRecoveries++
        tracked.metadata.errorHistory.push(`Recovery failed: ${result.message}`)
      }

      return result
    } catch (error) {
      this.stats.failedRecoveries++
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      tracked.metadata.errorHistory.push(`Recovery exception: ${errorMessage}`)

      this.logger.error('Exception during orphan recovery', {
        transcriptId,
        error: errorMessage,
        component: 'OrphanWorker'
      })

      return {
        success: false,
        action: 'cleanup',
        message: `Recovery exception: ${errorMessage}`
      }
    }
  }

  /**
   * Remove a transcript from tracking (when properly finalized)
   */
  public untrackTranscript(transcriptId: string): void {
    if (this.trackedTranscripts.delete(transcriptId)) {
      this.stats.currentOrphanCount = this.trackedTranscripts.size
      this.logger.trace('Transcript untracked', {
        transcriptId,
        component: 'OrphanWorker'
      })
    }
  }

  /**
   * Get current statistics
   */
  public getStats(): OrphanWorkerStats {
    return {...this.stats}
  }

  /**
   * Get list of currently tracked orphaned transcripts
   */
  public getOrphanedTranscripts(): OrphanedTranscript[] {
    return Array.from(this.trackedTranscripts.values())
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<OrphanDetectionConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.logger.info('OrphanWorker configuration updated', {
      config: this.config,
      component: 'OrphanWorker'
    })
  }

  /**
   * Destroy and cleanup
   */
  public destroy(): void {
    this.stopMonitoring()
    this.trackedTranscripts.clear()

    this.logger.info('OrphanWorker destroyed', {
      finalStats: this.stats,
      component: 'OrphanWorker'
    })
  }

  // Private methods

  private performOrphanCheck(): void {
    const now = Date.now()
    const orphansDetected: string[] = []

    for (const [transcriptId, tracked] of this.trackedTranscripts.entries()) {
      const timeSinceActivity = now - tracked.lastActivity
      tracked.stuckDuration = timeSinceActivity

      // Check for various orphan conditions
      const isAwaitingFinalTimeout =
        tracked.currentState === TranscriptState.AWAITING_FINAL &&
        timeSinceActivity > this.config.awaitingFinalTimeout

      const isStale = timeSinceActivity > this.config.staleTimeout

      if (isAwaitingFinalTimeout || isStale) {
        orphansDetected.push(transcriptId)
        this.stats.totalOrphansDetected++
      }
    }

    this.stats.currentOrphanCount = orphansDetected.length

    if (orphansDetected.length > 0) {
      this.logger.warn('Orphaned transcripts detected', {
        orphanIds: orphansDetected,
        totalOrphans: orphansDetected.length,
        component: 'OrphanWorker'
      })

      // Trigger auto-recovery if enabled
      if (this.config.enableAutoRecovery) {
        this.handleDetectedOrphans(orphansDetected)
      }
    }

    // Update most common orphan state
    this.updateMostCommonOrphanState()
  }

  private async handleDetectedOrphans(orphanIds: string[]): Promise<void> {
    for (const transcriptId of orphanIds) {
      const tracked = this.trackedTranscripts.get(transcriptId)
      if (!tracked || tracked.recoveryAttempts >= this.config.maxRecoveryAttempts) {
        continue
      }

      // In a real implementation, we'd need access to the FSM instance
      // For now, we'll log the detection and let external code handle recovery
      this.logger.info('Auto-recovery needed', {
        transcriptId,
        currentState: tracked.currentState,
        stuckDuration: tracked.stuckDuration,
        component: 'OrphanWorker'
      })
    }
  }

  private async recoverAwaitingFinal(
    transcriptId: string,
    fsm: TranscriptFSMCore,
    tracked: OrphanedTranscript
  ): Promise<OrphanRecoveryResult> {
    // Force finalize with current text
    try {
      const utterance = fsm.getUtterance(transcriptId)
      const currentText =
        utterance?.textDraft ||
        tracked.metadata.lastPartialText ||
        tracked.metadata.originalText ||
        ''

      this.logger.info('Force finalizing stuck transcript', {
        transcriptId,
        text: currentText.substring(0, 50),
        component: 'OrphanWorker'
      })

      // Attempt to force transition to finalized
      const success = fsm.applyFinal(transcriptId, currentText)

      if (success) {
        tracked.metadata.finalizedAt = Date.now()
        this.stats.timeoutsTriggered++

        return {
          success: true,
          action: 'force-finalize',
          message: 'Successfully force finalized stuck transcript',
          newState: TranscriptState.FINALIZED
        }
      } else {
        return {
          success: false,
          action: 'force-finalize',
          message: 'Failed to force finalize transcript'
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        action: 'force-finalize',
        message: `Force finalize failed: ${errorMessage}`
      }
    }
  }

  private async recoverStaleActive(
    transcriptId: string,
    fsm: TranscriptFSMCore,
    tracked: OrphanedTranscript
  ): Promise<OrphanRecoveryResult> {
    // Transition stale active transcript to awaiting final
    try {
      this.logger.info('Transitioning stale active transcript', {
        transcriptId,
        component: 'OrphanWorker'
      })

      const success = fsm.markEndOfSpeech(transcriptId)

      if (success) {
        tracked.currentState = TranscriptState.AWAITING_FINAL
        tracked.lastActivity = Date.now()

        return {
          success: true,
          action: 'timeout',
          message: 'Transitioned stale active to awaiting final',
          newState: TranscriptState.AWAITING_FINAL
        }
      } else {
        return {
          success: false,
          action: 'timeout',
          message: 'Failed to transition stale active transcript'
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        action: 'timeout',
        message: `Stale active recovery failed: ${errorMessage}`
      }
    }
  }

  private async recoverFromError(
    transcriptId: string,
    fsm: TranscriptFSMCore,
    tracked: OrphanedTranscript
  ): Promise<OrphanRecoveryResult> {
    // Clean up error state transcript
    try {
      this.logger.info('Cleaning up error state transcript', {
        transcriptId,
        errorHistory: tracked.metadata.errorHistory,
        component: 'OrphanWorker'
      })

      // Abort the specific utterance instead of cleaning up entire FSM
      const success = fsm.abortUtterance(transcriptId, 'error')
      this.untrackTranscript(transcriptId)

      return {
        success: success,
        action: 'cleanup',
        message: success ? 'Cleaned up error state transcript' : 'Failed to abort utterance',
        newState: success ? TranscriptState.ABORTED : undefined
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        action: 'cleanup',
        message: `Error cleanup failed: ${errorMessage}`
      }
    }
  }

  private updateAverageRecoveryTime(): void {
    if (this.recoveryTimes.length > 0) {
      const sum = this.recoveryTimes.reduce((a, b) => a + b, 0)
      this.stats.averageRecoveryTime = sum / this.recoveryTimes.length
    }

    // Keep only recent recovery times (last 100)
    if (this.recoveryTimes.length > 100) {
      this.recoveryTimes = this.recoveryTimes.slice(-100)
    }
  }

  private updateMostCommonOrphanState(): void {
    const stateCounts = new Map<TranscriptState, number>()

    for (const tracked of this.trackedTranscripts.values()) {
      const count = stateCounts.get(tracked.currentState) || 0
      stateCounts.set(tracked.currentState, count + 1)
    }

    let mostCommonState: TranscriptState | null = null
    let maxCount = 0

    for (const [state, count] of stateCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        mostCommonState = state
      }
    }

    this.stats.mostCommonOrphanState = mostCommonState
  }
}

// Global instance for application-wide orphan detection (lazy initialization)
let _globalOrphanWorker: OrphanWorker | null = null
export const GlobalOrphanWorker = {
  start: () => {
    if (!_globalOrphanWorker) {
      _globalOrphanWorker = new OrphanWorker()
    }
    _globalOrphanWorker.startMonitoring()
  },
  stop: () => {
    if (_globalOrphanWorker) {
      _globalOrphanWorker.stopMonitoring()
    }
  },
  getInstance: () => {
    if (!_globalOrphanWorker) {
      _globalOrphanWorker = new OrphanWorker()
    }
    return _globalOrphanWorker
  }
}

export default OrphanWorker
