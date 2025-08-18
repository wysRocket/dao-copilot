import {EventEmitter} from 'events'
import {
  ErrorHandler,
  ClassifiedError,
  ErrorCategory,
  ErrorSeverity,
  ErrorContext
} from './ErrorHandler'
import {ErrorRecoveryStrategies} from './ErrorRecoveryStrategies'

/**
 * Interface for error log entries stored in the WAL
 */
interface ErrorLogEntry {
  id: string
  timestamp: number
  error: ClassifiedError
  context: ErrorContext
  recoveryAttempted: boolean
  recoverySuccess?: boolean
  retryCount: number
  lastRetryTimestamp?: number
  silentFailure: boolean
  metadata: {
    sessionId: string
    operation: string
    userAgent: string
    stackTrace?: string
    additionalContext?: Record<string, unknown>
  }
}

/**
 * Interface for retroactive recovery result
 */
interface RetroactiveRecoveryResult {
  success: boolean
  recoveredErrors: number
  failedRecoveries: number
  skippedErrors: number
  processedErrors: ErrorLogEntry[]
  errors: string[]
  totalProcessingTime: number
}

/**
 * Configuration for retroactive error recovery
 */
interface RetroactiveRecoveryConfig {
  maxRetroactiveHours: number // How far back to look for errors
  maxErrorsPerBatch: number // Maximum errors to process in one batch
  retryIntervalMs: number // Interval between retry attempts
  maxRetryAttempts: number // Maximum retry attempts for retroactive recovery
  silentFailureThreshold: number // Time threshold to consider failure "silent"
  enableWalIntegration: boolean // Enable WAL persistence integration
  recoveryPriorities: ErrorCategory[] // Priority order for recovery attempts
}

/**
 * Default configuration for retroactive recovery
 */
const DEFAULT_RETROACTIVE_CONFIG: RetroactiveRecoveryConfig = {
  maxRetroactiveHours: 24,
  maxErrorsPerBatch: 50,
  retryIntervalMs: 5000,
  maxRetryAttempts: 3,
  silentFailureThreshold: 30000, // 30 seconds
  enableWalIntegration: true,
  recoveryPriorities: [
    ErrorCategory.TRANSCRIPTION,
    ErrorCategory.DATA_INTEGRITY,
    ErrorCategory.WEBSOCKET,
    ErrorCategory.NETWORK,
    ErrorCategory.API,
    ErrorCategory.AUTH,
    ErrorCategory.RESOURCE,
    ErrorCategory.SYSTEM
  ]
}

/**
 * Retroactive Error Recovery System
 *
 * Identifies and attempts to recover from errors that previously aborted silently.
 * Integrates with WAL persistence layer to replay and recover from past errors.
 */
export class RetroactiveErrorRecovery extends EventEmitter {
  private config: RetroactiveRecoveryConfig
  private errorHandler: ErrorHandler
  private recoveryStrategies: ErrorRecoveryStrategies
  private walStorage: Map<string, ErrorLogEntry> = new Map() // Simulated WAL storage
  private isProcessing: boolean = false
  private recoveryStats = {
    totalRetroactiveRecoveries: 0,
    successfulRetroactiveRecoveries: 0,
    failedRetroactiveRecoveries: 0,
    silentFailuresDetected: 0,
    walEntriesProcessed: 0
  }

  constructor(
    errorHandler: ErrorHandler,
    recoveryStrategies: ErrorRecoveryStrategies,
    config: Partial<RetroactiveRecoveryConfig> = {}
  ) {
    super()
    this.config = {...DEFAULT_RETROACTIVE_CONFIG, ...config}
    this.errorHandler = errorHandler
    this.recoveryStrategies = recoveryStrategies

    // Listen for new errors to store in WAL
    this.errorHandler.on('errorClassified', this.handleNewError.bind(this))

    // Listen for recovery events to update WAL entries
    this.recoveryStrategies.on('recoveryCompleted', this.handleRecoveryCompletion.bind(this))
  }

  /**
   * Execute retroactive error recovery
   * Scans WAL for silent failures and attempts recovery
   */
  async executeRetroactiveRecovery(): Promise<RetroactiveRecoveryResult> {
    if (this.isProcessing) {
      throw new Error('Retroactive recovery is already in progress')
    }

    const startTime = Date.now()
    this.isProcessing = true

    this.emit('retroactiveRecoveryStarted', {
      timestamp: startTime,
      config: this.config
    })

    try {
      // Step 1: Scan WAL for silent failures
      const silentFailures = await this.scanForSilentFailures()

      this.emit('silentFailuresDetected', {
        count: silentFailures.length,
        failures: silentFailures
      })

      // Step 2: Prioritize errors for recovery
      const prioritizedErrors = this.prioritizeErrorsForRecovery(silentFailures)

      // Step 3: Batch process recovery attempts
      const result = await this.batchProcessRetroactiveRecovery(prioritizedErrors)

      // Step 4: Update statistics
      this.updateRetroactiveStats(result)

      const totalProcessingTime = Date.now() - startTime
      const finalResult: RetroactiveRecoveryResult = {
        ...result,
        totalProcessingTime
      }

      this.emit('retroactiveRecoveryCompleted', finalResult)

      return finalResult
    } catch (error) {
      this.emit('retroactiveRecoveryFailed', {
        error: error.message,
        timestamp: Date.now()
      })
      throw error
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Scan WAL storage for silent failures within the configured time window
   */
  private async scanForSilentFailures(): Promise<ErrorLogEntry[]> {
    const cutoffTime = Date.now() - this.config.maxRetroactiveHours * 60 * 60 * 1000
    const silentFailures: ErrorLogEntry[] = []

    for (const [, entry] of this.walStorage) {
      // Check if error is within time window
      if (entry.timestamp < cutoffTime) {
        continue
      }

      // Check if this is a silent failure
      if (this.isSilentFailure(entry)) {
        silentFailures.push(entry)
      }
    }

    this.recoveryStats.silentFailuresDetected += silentFailures.length

    this.emit('walScanCompleted', {
      totalEntries: this.walStorage.size,
      silentFailures: silentFailures.length,
      cutoffTime
    })

    return silentFailures
  }

  /**
   * Determine if an error entry represents a silent failure
   */
  private isSilentFailure(entry: ErrorLogEntry): boolean {
    // Already marked as silent failure
    if (entry.silentFailure) {
      return true
    }

    // Never attempted recovery
    if (!entry.recoveryAttempted) {
      return true
    }

    // Recovery failed and hasn't been retried recently
    if (entry.recoveryAttempted && !entry.recoverySuccess) {
      const timeSinceLastRetry = Date.now() - (entry.lastRetryTimestamp || entry.timestamp)
      return timeSinceLastRetry > this.config.silentFailureThreshold
    }

    // High-severity errors that should have been recovered but weren't
    if (entry.error.severity === ErrorSeverity.CRITICAL && !entry.recoverySuccess) {
      return true
    }

    // Transcription errors that failed silently (critical for this project)
    if (entry.error.category === ErrorCategory.TRANSCRIPTION && !entry.recoverySuccess) {
      return true
    }

    return false
  }

  /**
   * Prioritize errors for recovery based on category and severity
   */
  private prioritizeErrorsForRecovery(errors: ErrorLogEntry[]): ErrorLogEntry[] {
    return errors.sort((a, b) => {
      // First priority: Category based on config
      const aPriority = this.config.recoveryPriorities.indexOf(a.error.category)
      const bPriority = this.config.recoveryPriorities.indexOf(b.error.category)

      if (aPriority !== bPriority) {
        return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority)
      }

      // Second priority: Error severity
      const severityOrder = {
        [ErrorSeverity.CRITICAL]: 0,
        [ErrorSeverity.HIGH]: 1,
        [ErrorSeverity.MEDIUM]: 2,
        [ErrorSeverity.LOW]: 3
      }

      const aSeverity = severityOrder[a.error.severity] || 4
      const bSeverity = severityOrder[b.error.severity] || 4

      if (aSeverity !== bSeverity) {
        return aSeverity - bSeverity
      }

      // Third priority: Error timestamp (older first)
      return a.timestamp - b.timestamp
    })
  }

  /**
   * Process retroactive recovery in batches
   */
  private async batchProcessRetroactiveRecovery(
    errors: ErrorLogEntry[]
  ): Promise<Omit<RetroactiveRecoveryResult, 'totalProcessingTime'>> {
    let recoveredErrors = 0
    let failedRecoveries = 0
    let skippedErrors = 0
    const processedErrors: ErrorLogEntry[] = []
    const errorMessages: string[] = []

    // Process in batches
    for (let i = 0; i < errors.length; i += this.config.maxErrorsPerBatch) {
      const batch = errors.slice(i, i + this.config.maxErrorsPerBatch)

      this.emit('batchProcessingStarted', {
        batchNumber: Math.floor(i / this.config.maxErrorsPerBatch) + 1,
        batchSize: batch.length,
        remainingErrors: errors.length - i - batch.length
      })

      for (const errorEntry of batch) {
        try {
          // Check if we should skip this error
          if (errorEntry.retryCount >= this.config.maxRetryAttempts) {
            skippedErrors++
            continue
          }

          // Attempt retroactive recovery
          const recoveryResult = await this.attemptRetroactiveRecovery(errorEntry)

          if (recoveryResult.success) {
            recoveredErrors++
            this.updateWalEntry(errorEntry.id, {
              recoveryAttempted: true,
              recoverySuccess: true,
              retryCount: errorEntry.retryCount + 1,
              lastRetryTimestamp: Date.now(),
              silentFailure: false
            })
          } else {
            failedRecoveries++
            this.updateWalEntry(errorEntry.id, {
              recoveryAttempted: true,
              recoverySuccess: false,
              retryCount: errorEntry.retryCount + 1,
              lastRetryTimestamp: Date.now()
            })
            errorMessages.push(
              `Recovery failed for error ${errorEntry.id}: ${recoveryResult.reason}`
            )
          }

          processedErrors.push(errorEntry)

          // Add delay between recovery attempts
          if (batch.indexOf(errorEntry) < batch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, this.config.retryIntervalMs))
          }
        } catch (error) {
          failedRecoveries++
          errorMessages.push(
            `Exception during retroactive recovery of ${errorEntry.id}: ${error.message}`
          )

          this.updateWalEntry(errorEntry.id, {
            retryCount: errorEntry.retryCount + 1,
            lastRetryTimestamp: Date.now()
          })
        }
      }

      this.emit('batchProcessingCompleted', {
        batchNumber: Math.floor(i / this.config.maxErrorsPerBatch) + 1,
        recoveredInBatch: batch.filter(
          e => processedErrors.includes(e) && this.walStorage.get(e.id)?.recoverySuccess
        ).length,
        failedInBatch: batch.filter(
          e => processedErrors.includes(e) && !this.walStorage.get(e.id)?.recoverySuccess
        ).length
      })
    }

    return {
      success: recoveredErrors > 0 || failedRecoveries === 0,
      recoveredErrors,
      failedRecoveries,
      skippedErrors,
      processedErrors,
      errors: errorMessages
    }
  }

  /**
   * Attempt retroactive recovery for a specific error
   */
  private async attemptRetroactiveRecovery(errorEntry: ErrorLogEntry): Promise<{
    success: boolean
    reason?: string
    strategy?: string
  }> {
    this.emit('retroactiveRecoveryAttempt', {
      errorId: errorEntry.id,
      category: errorEntry.error.category,
      timestamp: errorEntry.timestamp,
      retryCount: errorEntry.retryCount + 1
    })

    try {
      // Create a fresh context for retroactive recovery
      const retroactiveContext: ErrorContext = {
        ...errorEntry.context,
        operation: `retroactive_${errorEntry.context.operation}`,
        timestamp: Date.now(),
        isRetroactiveRecovery: true,
        originalTimestamp: errorEntry.timestamp,
        retryCount: errorEntry.retryCount + 1
      }

      // Execute recovery using the recovery strategies
      const recoveryResult = await this.recoveryStrategies.executeRecovery(
        errorEntry.error,
        retroactiveContext
      )

      this.emit('retroactiveRecoveryResult', {
        errorId: errorEntry.id,
        success: recoveryResult.success,
        strategy: recoveryResult.strategy,
        actions: recoveryResult.actions,
        duration: recoveryResult.duration
      })

      return {
        success: recoveryResult.success,
        reason: recoveryResult.reason,
        strategy: recoveryResult.strategy
      }
    } catch (error) {
      this.emit('retroactiveRecoveryError', {
        errorId: errorEntry.id,
        error: error.message,
        timestamp: Date.now()
      })

      return {
        success: false,
        reason: `Retroactive recovery failed: ${error.message}`
      }
    }
  }

  /**
   * Handle new error classification events and store in WAL
   */
  private handleNewError(classifiedError: ClassifiedError, context: ErrorContext): void {
    if (!this.config.enableWalIntegration) {
      return
    }

    const errorEntry: ErrorLogEntry = {
      id: this.generateErrorId(classifiedError, context),
      timestamp: Date.now(),
      error: classifiedError,
      context,
      recoveryAttempted: false,
      retryCount: 0,
      silentFailure: false,
      metadata: {
        sessionId: context.sessionId || 'unknown',
        operation: context.operation || 'unknown',
        userAgent: context.userAgent || 'unknown',
        stackTrace: classifiedError.originalError.stack,
        additionalContext: context.additionalContext
      }
    }

    this.walStorage.set(errorEntry.id, errorEntry)
    this.recoveryStats.walEntriesProcessed++

    this.emit('errorStoredInWal', {
      errorId: errorEntry.id,
      category: classifiedError.category,
      severity: classifiedError.severity
    })
  }

  /**
   * Handle recovery completion events and update WAL entries
   */
  private handleRecoveryCompletion(recoveryResult: {
    success: boolean
    error?: ClassifiedError
    context?: ErrorContext
    strategy?: string
  }): void {
    if (!this.config.enableWalIntegration || !recoveryResult.context) {
      return
    }

    const errorId = this.generateErrorId(recoveryResult.error, recoveryResult.context)
    const existingEntry = this.walStorage.get(errorId)

    if (existingEntry) {
      this.updateWalEntry(errorId, {
        recoveryAttempted: true,
        recoverySuccess: recoveryResult.success,
        lastRetryTimestamp: Date.now()
      })
    }
  }

  /**
   * Update WAL entry with new information
   */
  private updateWalEntry(errorId: string, updates: Partial<ErrorLogEntry>): void {
    const entry = this.walStorage.get(errorId)
    if (entry) {
      this.walStorage.set(errorId, {...entry, ...updates})

      this.emit('walEntryUpdated', {
        errorId,
        updates
      })
    }
  }

  /**
   * Generate unique error ID for WAL storage
   */
  private generateErrorId(error: ClassifiedError, context: ErrorContext): string {
    const contextHash = Buffer.from(
      JSON.stringify({
        operation: context.operation,
        sessionId: context.sessionId,
        timestamp: context.timestamp
      })
    )
      .toString('base64')
      .slice(0, 8)

    const errorHash = Buffer.from(
      JSON.stringify({
        category: error.category,
        message: error.originalError.message,
        stack: error.originalError.stack?.slice(0, 100)
      })
    )
      .toString('base64')
      .slice(0, 8)

    return `${error.category}_${contextHash}_${errorHash}`
  }

  /**
   * Update retroactive recovery statistics
   */
  private updateRetroactiveStats(
    result: Omit<RetroactiveRecoveryResult, 'totalProcessingTime'>
  ): void {
    this.recoveryStats.totalRetroactiveRecoveries +=
      result.recoveredErrors + result.failedRecoveries
    this.recoveryStats.successfulRetroactiveRecoveries += result.recoveredErrors
    this.recoveryStats.failedRetroactiveRecoveries += result.failedRecoveries
  }

  /**
   * Get retroactive recovery statistics
   */
  getRetroactiveStats(): typeof this.recoveryStats {
    return {...this.recoveryStats}
  }

  /**
   * Get WAL storage information
   */
  getWalInfo(): {
    totalEntries: number
    silentFailures: number
    unrecoveredErrors: number
    oldestEntry?: Date
    newestEntry?: Date
  } {
    const entries = Array.from(this.walStorage.values())
    const silentFailures = entries.filter(e => this.isSilentFailure(e)).length
    const unrecoveredErrors = entries.filter(e => !e.recoverySuccess).length

    const timestamps = entries.map(e => e.timestamp)
    const oldestTimestamp = Math.min(...timestamps)
    const newestTimestamp = Math.max(...timestamps)

    return {
      totalEntries: this.walStorage.size,
      silentFailures,
      unrecoveredErrors,
      oldestEntry: timestamps.length > 0 ? new Date(oldestTimestamp) : undefined,
      newestEntry: timestamps.length > 0 ? new Date(newestTimestamp) : undefined
    }
  }

  /**
   * Clean up old WAL entries beyond retention period
   */
  async cleanupOldWalEntries(): Promise<{
    removedEntries: number
    remainingEntries: number
  }> {
    const cutoffTime = Date.now() - this.config.maxRetroactiveHours * 60 * 60 * 1000 * 7 // Keep 7x retention period
    let removedCount = 0

    for (const [id, entry] of this.walStorage) {
      if (entry.timestamp < cutoffTime) {
        this.walStorage.delete(id)
        removedCount++
      }
    }

    this.emit('walCleanupCompleted', {
      removedEntries: removedCount,
      remainingEntries: this.walStorage.size,
      cutoffTime: new Date(cutoffTime)
    })

    return {
      removedEntries: removedCount,
      remainingEntries: this.walStorage.size
    }
  }

  /**
   * Force scan and recovery for specific error categories
   */
  async recoverErrorCategory(category: ErrorCategory): Promise<RetroactiveRecoveryResult> {
    const categoryErrors = Array.from(this.walStorage.values()).filter(
      entry => entry.error.category === category && this.isSilentFailure(entry)
    )

    if (categoryErrors.length === 0) {
      return {
        success: true,
        recoveredErrors: 0,
        failedRecoveries: 0,
        skippedErrors: 0,
        processedErrors: [],
        errors: [],
        totalProcessingTime: 0
      }
    }

    const prioritizedErrors = this.prioritizeErrorsForRecovery(categoryErrors)
    const startTime = Date.now()

    this.emit('categoryRecoveryStarted', {
      category,
      errorCount: categoryErrors.length
    })

    const result = await this.batchProcessRetroactiveRecovery(prioritizedErrors)

    const finalResult: RetroactiveRecoveryResult = {
      ...result,
      totalProcessingTime: Date.now() - startTime
    }

    this.emit('categoryRecoveryCompleted', {
      category,
      result: finalResult
    })

    return finalResult
  }

  /**
   * Reset all statistics and optionally clear WAL
   */
  resetStats(clearWal: boolean = false): void {
    this.recoveryStats = {
      totalRetroactiveRecoveries: 0,
      successfulRetroactiveRecoveries: 0,
      failedRetroactiveRecoveries: 0,
      silentFailuresDetected: 0,
      walEntriesProcessed: 0
    }

    if (clearWal) {
      this.walStorage.clear()
      this.emit('walCleared', {timestamp: Date.now()})
    }

    this.emit('statsReset', {
      timestamp: Date.now(),
      walCleared: clearWal
    })
  }

  /**
   * Destroy the retroactive recovery system and clean up resources
   */
  destroy(): void {
    this.walStorage.clear()
    this.removeAllListeners()
    this.isProcessing = false

    this.emit('destroyed', {timestamp: Date.now()})
  }
}
