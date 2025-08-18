/**
 * WalRecoveryManager - Crash Recovery System for Write-Ahead Log
 *
 * Provides comprehensive crash recovery capabilities for the transcription system:
 * - Automatic recovery on application startup
 * - WAL file parsing and validation with error tolerance
 * - Session state reconstruction from partial data
 * - Recovery metrics and detailed logging
 * - Integration with ring buffer and persistence manager
 * - Conflict resolution for overlapping transcripts
 */

import {promises as fs} from 'fs'
import {join, dirname} from 'path'
import {EventEmitter} from 'events'

import {
  WalEntry,
  WalEntryType,
  WalUtteranceInsert,
  WalUtteranceUpdate,
  WalUtteranceDelete,
  WalSessionCreate,
  WalSessionDelete,
  WalCheckpoint,
  WalFlush,
  WalRotation,
  WalRecoveryStart,
  WalRecoveryEnd
} from './WalEntry'
import {WalDecoder, WalDecodeError} from './WalDecoder'
import {TranscriptUtterance, TranscriptState} from '../transcription/fsm/TranscriptStates'

/**
 * Recovery operation result
 */
export enum RecoveryResult {
  SUCCESS = 'success',
  PARTIAL_SUCCESS = 'partial_success',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * Recovery mode
 */
export enum RecoveryMode {
  FULL = 'full', // Recover all data, including partial sessions
  CONSERVATIVE = 'conservative', // Only recover complete, verified sessions
  FAST = 'fast', // Quick recovery, skip detailed validation
  REPAIR = 'repair' // Attempt to repair corrupted data
}

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  // Basic settings
  walDirectory: string // WAL files directory
  mode: RecoveryMode // Recovery mode
  maxRecoveryTimeMs: number // Maximum time to spend on recovery

  // File processing
  maxFilesToProcess: number // Maximum number of WAL files to process
  processInParallel: boolean // Process files in parallel
  validateChecksums: boolean // Validate CRC32 checksums

  // Session recovery
  recoverPartialSessions: boolean // Recover incomplete sessions
  markUncertainEntries: boolean // Mark uncertain entries for retry
  conflictResolution: 'newest' | 'oldest' | 'merge' // How to handle conflicts

  // Error handling
  skipCorruptedFiles: boolean // Skip files that can't be parsed
  maxCorruptionTolerance: number // Max % of corrupted entries to tolerate
  continueOnError: boolean // Continue recovery even after errors

  // Performance
  batchSize: number // Batch size for processing entries
  memoryLimitMB: number // Memory limit for recovery operations

  // Logging and metrics
  detailedLogging: boolean // Enable detailed recovery logging
  generateMetrics: boolean // Generate recovery performance metrics
  auditTrail: boolean // Generate audit trail for compliance
}

/**
 * Default recovery configuration
 */
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  walDirectory: './.wal',
  mode: RecoveryMode.FULL,
  maxRecoveryTimeMs: 30000, // 30 seconds

  maxFilesToProcess: 50,
  processInParallel: true,
  validateChecksums: true,

  recoverPartialSessions: true,
  markUncertainEntries: true,
  conflictResolution: 'newest',

  skipCorruptedFiles: true,
  maxCorruptionTolerance: 0.1, // 10%
  continueOnError: true,

  batchSize: 100,
  memoryLimitMB: 256,

  detailedLogging: true,
  generateMetrics: true,
  auditTrail: false
}

/**
 * Recovered session information
 */
export interface RecoveredSession {
  sessionId: string
  utterances: TranscriptUtterance[]
  metadata?: Record<string, unknown>
  recoveryTimestamp: number
  uncertainEntries: string[] // IDs of entries that need verification
  conflictCount: number
  isComplete: boolean // True if session appears complete
  lastActivity: number // Timestamp of last activity
}

/**
 * Recovery statistics
 */
export interface RecoveryStats {
  // Timing
  startTime: number
  endTime: number
  totalDurationMs: number

  // Files processed
  filesFound: number
  filesProcessed: number
  filesSkipped: number
  filesCorrupted: number

  // Entries processed
  totalEntries: number
  entriesProcessed: number
  entriesSkipped: number
  entriesCorrupted: number

  // Sessions recovered
  sessionsFound: number
  sessionsRecovered: number
  sessionsPartial: number
  sessionsFailed: number

  // Data recovered
  utterancesRecovered: number
  uncertainEntries: number
  conflictsResolved: number

  // Performance
  avgFileProcessingMs: number
  avgEntriesPerSecond: number
  memoryUsedMB: number

  // Errors
  errors: string[]
  warnings: string[]
}

/**
 * Recovery context (tracks recovery state)
 */
interface RecoveryContext {
  recoveryId: string
  startTime: number
  config: RecoveryConfig
  stats: RecoveryStats
  sessions: Map<string, RecoveredSession>
  checkpoints: WalCheckpoint[]
  lastProcessedFile?: string
  isAborted: boolean
}

/**
 * WAL Recovery Manager
 *
 * Manages the complete recovery process from WAL files after crashes.
 */
export class WalRecoveryManager extends EventEmitter {
  private config: RecoveryConfig
  private decoder: WalDecoder
  private isRecovering: boolean = false

  constructor(config: Partial<RecoveryConfig> = {}) {
    super()

    this.config = {...DEFAULT_RECOVERY_CONFIG, ...config}
    this.decoder = new WalDecoder()
  }

  /**
   * Perform complete recovery from WAL files
   */
  async performRecovery(): Promise<{
    result: RecoveryResult
    sessions: RecoveredSession[]
    stats: RecoveryStats
  }> {
    if (this.isRecovering) {
      throw new Error('Recovery already in progress')
    }

    const context = this.createRecoveryContext()
    this.isRecovering = true

    try {
      this.emit('recoveryStarted', {recoveryId: context.recoveryId, config: this.config})

      // Phase 1: Discover and validate WAL files
      await this.discoverWalFiles(context)

      // Phase 2: Process WAL files and extract entries
      await this.processWalFiles(context)

      // Phase 3: Reconstruct sessions from entries
      await this.reconstructSessions(context)

      // Phase 4: Resolve conflicts and validate data
      await this.resolveConflictsAndValidate(context)

      // Phase 5: Generate final results
      const result = this.generateRecoveryResult(context)

      this.emit('recoveryCompleted', {
        recoveryId: context.recoveryId,
        result: result.result,
        stats: result.stats
      })

      return result
    } catch (error) {
      context.stats.errors.push(`Recovery failed: ${error}`)
      this.emit('recoveryFailed', {
        recoveryId: context.recoveryId,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        result: RecoveryResult.FAILED,
        sessions: [],
        stats: this.finalizeStats(context)
      }
    } finally {
      this.isRecovering = false
    }
  }

  /**
   * Quick recovery check - just validate WAL files exist and are readable
   */
  async quickHealthCheck(): Promise<{healthy: boolean; fileCount: number; lastWrite?: number}> {
    try {
      const files = await this.getWalFiles()
      if (files.length === 0) {
        return {healthy: true, fileCount: 0}
      }

      // Check if files are readable
      let lastWrite = 0
      for (const file of files.slice(0, 3)) {
        // Check first 3 files only
        const stats = await fs.stat(file.path)
        lastWrite = Math.max(lastWrite, stats.mtimeMs)

        // Try to read first few bytes
        const handle = await fs.open(file.path, 'r')
        try {
          const buffer = Buffer.alloc(64)
          await handle.read(buffer, 0, 64, 0)
        } finally {
          await handle.close()
        }
      }

      return {healthy: true, fileCount: files.length, lastWrite}
    } catch (error) {
      return {healthy: false, fileCount: 0}
    }
  }

  /**
   * Get recovery statistics for the last operation
   */
  getLastRecoveryStats(): RecoveryStats | null {
    // This would be stored in instance variable after recovery
    return null
  }

  /**
   * Update recovery configuration
   */
  updateConfig(config: Partial<RecoveryConfig>): void {
    this.config = {...this.config, ...config}
  }

  /**
   * Get current configuration
   */
  getConfig(): RecoveryConfig {
    return {...this.config}
  }

  // Private methods

  /**
   * Create recovery context
   */
  private createRecoveryContext(): RecoveryContext {
    const recoveryId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      recoveryId,
      startTime: Date.now(),
      config: this.config,
      stats: {
        startTime: Date.now(),
        endTime: 0,
        totalDurationMs: 0,
        filesFound: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        filesCorrupted: 0,
        totalEntries: 0,
        entriesProcessed: 0,
        entriesSkipped: 0,
        entriesCorrupted: 0,
        sessionsFound: 0,
        sessionsRecovered: 0,
        sessionsPartial: 0,
        sessionsFailed: 0,
        utterancesRecovered: 0,
        uncertainEntries: 0,
        conflictsResolved: 0,
        avgFileProcessingMs: 0,
        avgEntriesPerSecond: 0,
        memoryUsedMB: 0,
        errors: [],
        warnings: []
      },
      sessions: new Map(),
      checkpoints: [],
      isAborted: false
    }
  }

  /**
   * Discover available WAL files
   */
  private async discoverWalFiles(context: RecoveryContext): Promise<void> {
    const files = await this.getWalFiles()
    context.stats.filesFound = files.length

    this.emit('filesDiscovered', {
      recoveryId: context.recoveryId,
      fileCount: files.length,
      files: files.slice(0, 10) // First 10 for logging
    })

    if (files.length === 0) {
      context.stats.warnings.push('No WAL files found for recovery')
    }
  }

  /**
   * Process all WAL files
   */
  private async processWalFiles(context: RecoveryContext): Promise<void> {
    const files = await this.getWalFiles()
    const filesToProcess = files.slice(0, this.config.maxFilesToProcess)

    if (this.config.processInParallel) {
      await this.processFilesInParallel(context, filesToProcess)
    } else {
      await this.processFilesSequentially(context, filesToProcess)
    }
  }

  /**
   * Process files in parallel
   */
  private async processFilesInParallel(
    context: RecoveryContext,
    files: Array<{path: string; name: string; size: number; modified: number}>
  ): Promise<void> {
    const batchSize = Math.min(5, files.length) // Process up to 5 files at once

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      const promises = batch.map(file => this.processWalFile(context, file))

      await Promise.allSettled(promises)

      // Check if we should abort (time limit exceeded)
      if (Date.now() - context.startTime > this.config.maxRecoveryTimeMs) {
        context.stats.warnings.push('Recovery time limit exceeded, stopping file processing')
        context.isAborted = true
        break
      }
    }
  }

  /**
   * Process files sequentially
   */
  private async processFilesSequentially(
    context: RecoveryContext,
    files: Array<{path: string; name: string; size: number; modified: number}>
  ): Promise<void> {
    for (const file of files) {
      try {
        await this.processWalFile(context, file)
        context.lastProcessedFile = file.name

        // Check if we should abort
        if (Date.now() - context.startTime > this.config.maxRecoveryTimeMs) {
          context.stats.warnings.push('Recovery time limit exceeded, stopping file processing')
          context.isAborted = true
          break
        }
      } catch (error) {
        if (!this.config.continueOnError) {
          throw error
        }
      }
    }
  }

  /**
   * Process a single WAL file
   */
  private async processWalFile(
    context: RecoveryContext,
    file: {path: string; name: string; size: number; modified: number}
  ): Promise<void> {
    const startTime = Date.now()

    try {
      const buffer = await fs.readFile(file.path)
      context.stats.totalEntries += await this.processWalBuffer(context, buffer, file.name)
      context.stats.filesProcessed++
    } catch (error) {
      context.stats.filesCorrupted++

      if (this.config.skipCorruptedFiles) {
        context.stats.warnings.push(`Skipping corrupted file ${file.name}: ${error}`)
        context.stats.filesSkipped++
      } else {
        context.stats.errors.push(`Failed to process file ${file.name}: ${error}`)
        throw error
      }
    }

    // Update timing statistics
    const processingTime = Date.now() - startTime
    const processedCount = context.stats.filesProcessed + context.stats.filesSkipped
    if (processedCount > 0) {
      context.stats.avgFileProcessingMs =
        (context.stats.avgFileProcessingMs * (processedCount - 1) + processingTime) / processedCount
    }

    this.emit('fileProcessed', {
      recoveryId: context.recoveryId,
      fileName: file.name,
      processingTimeMs: processingTime,
      entriesFound: context.stats.totalEntries
    })
  }

  /**
   * Process WAL buffer and extract entries
   */
  private async processWalBuffer(
    context: RecoveryContext,
    buffer: Buffer,
    fileName: string
  ): Promise<number> {
    let entriesFound = 0

    try {
      for (const entry of this.decoder.streamDecode(buffer)) {
        entriesFound++

        try {
          await this.processWalEntry(context, entry, fileName)
          context.stats.entriesProcessed++
        } catch (error) {
          context.stats.entriesCorrupted++

          if (this.config.continueOnError) {
            context.stats.warnings.push(`Skipping corrupted entry in ${fileName}: ${error}`)
          } else {
            throw error
          }
        }

        // Check memory limits
        if (this.config.memoryLimitMB > 0) {
          const memUsage = process.memoryUsage()
          const memUsageMB = memUsage.heapUsed / (1024 * 1024)

          if (memUsageMB > this.config.memoryLimitMB) {
            context.stats.warnings.push(
              `Memory limit exceeded (${memUsageMB}MB > ${this.config.memoryLimitMB}MB), processing may be slower`
            )
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to decode WAL buffer from ${fileName}: ${error}`)
    }

    return entriesFound
  }

  /**
   * Process a single WAL entry
   */
  private async processWalEntry(
    context: RecoveryContext,
    entry: WalEntry,
    fileName: string
  ): Promise<void> {
    switch (entry.type) {
      case WalEntryType.UTTERANCE_INSERT:
        this.processUtteranceInsert(context, entry as WalUtteranceInsert)
        break

      case WalEntryType.UTTERANCE_UPDATE:
        this.processUtteranceUpdate(context, entry as WalUtteranceUpdate)
        break

      case WalEntryType.UTTERANCE_DELETE:
        this.processUtteranceDelete(context, entry as WalUtteranceDelete)
        break

      case WalEntryType.SESSION_CREATE:
        this.processSessionCreate(context, entry as WalSessionCreate)
        break

      case WalEntryType.SESSION_DELETE:
        this.processSessionDelete(context, entry as WalSessionDelete)
        break

      case WalEntryType.CHECKPOINT:
        this.processCheckpoint(context, entry as WalCheckpoint)
        break

      case WalEntryType.FLUSH:
        this.processFlush(context, entry as WalFlush)
        break

      case WalEntryType.ROTATION:
        this.processRotation(context, entry as WalRotation)
        break

      case WalEntryType.RECOVERY_START:
        this.processRecoveryStart(context, entry as WalRecoveryStart)
        break

      case WalEntryType.RECOVERY_END:
        this.processRecoveryEnd(context, entry as WalRecoveryEnd)
        break

      default:
        context.stats.warnings.push(`Unknown WAL entry type: ${entry.type} in ${fileName}`)
    }
  }

  /**
   * Process utterance insert entry
   */
  private processUtteranceInsert(context: RecoveryContext, entry: WalUtteranceInsert): void {
    const session = this.getOrCreateSession(context, entry.payload.sessionId)
    const utterance = entry.payload.utterance

    // Check for conflicts (same utterance ID)
    const existingIndex = session.utterances.findIndex(u => u.id === utterance.id)

    if (existingIndex >= 0) {
      // Handle conflict based on configuration
      this.handleUtteranceConflict(context, session, existingIndex, utterance, 'insert')
    } else {
      session.utterances.push({...utterance})
    }

    session.lastActivity = Math.max(session.lastActivity, entry.timestamp)
  }

  /**
   * Process utterance update entry
   */
  private processUtteranceUpdate(context: RecoveryContext, entry: WalUtteranceUpdate): void {
    const session = this.getOrCreateSession(context, entry.payload.sessionId)
    const utteranceIndex = session.utterances.findIndex(u => u.id === entry.payload.utteranceId)

    if (utteranceIndex >= 0) {
      // Apply updates
      const utterance = session.utterances[utteranceIndex]
      Object.assign(utterance, entry.payload.updates)

      // Mark as potentially uncertain if we don't have the previous state
      if (!entry.payload.previousState && this.config.markUncertainEntries) {
        if (!session.uncertainEntries.includes(entry.payload.utteranceId)) {
          session.uncertainEntries.push(entry.payload.utteranceId)
        }
      }
    } else {
      // Utterance not found - mark as uncertain
      if (this.config.markUncertainEntries) {
        session.uncertainEntries.push(entry.payload.utteranceId)
      }
      context.stats.warnings.push(
        `Update for non-existent utterance ${entry.payload.utteranceId} in session ${entry.payload.sessionId}`
      )
    }

    session.lastActivity = Math.max(session.lastActivity, entry.timestamp)
  }

  /**
   * Process utterance delete entry
   */
  private processUtteranceDelete(context: RecoveryContext, entry: WalUtteranceDelete): void {
    const session = this.getOrCreateSession(context, entry.payload.sessionId)
    const utteranceIndex = session.utterances.findIndex(u => u.id === entry.payload.utteranceId)

    if (utteranceIndex >= 0) {
      session.utterances.splice(utteranceIndex, 1)

      // Remove from uncertain entries if present
      const uncertainIndex = session.uncertainEntries.indexOf(entry.payload.utteranceId)
      if (uncertainIndex >= 0) {
        session.uncertainEntries.splice(uncertainIndex, 1)
      }
    }

    session.lastActivity = Math.max(session.lastActivity, entry.timestamp)
  }

  /**
   * Process session create entry
   */
  private processSessionCreate(context: RecoveryContext, entry: WalSessionCreate): void {
    if (context.sessions.has(entry.payload.sessionId)) {
      context.stats.warnings.push(`Duplicate session creation for ${entry.payload.sessionId}`)
      return
    }

    const session: RecoveredSession = {
      sessionId: entry.payload.sessionId,
      utterances: [],
      metadata: entry.payload.metadata,
      recoveryTimestamp: Date.now(),
      uncertainEntries: [],
      conflictCount: 0,
      isComplete: false,
      lastActivity: entry.timestamp
    }

    context.sessions.set(entry.payload.sessionId, session)
    context.stats.sessionsFound++
  }

  /**
   * Process session delete entry
   */
  private processSessionDelete(context: RecoveryContext, entry: WalSessionDelete): void {
    const session = context.sessions.get(entry.payload.sessionId)
    if (session) {
      context.sessions.delete(entry.payload.sessionId)
      context.stats.warnings.push(
        `Session ${entry.payload.sessionId} was deleted, removing from recovery`
      )
    }
  }

  /**
   * Process checkpoint entry
   */
  private processCheckpoint(context: RecoveryContext, entry: WalCheckpoint): void {
    context.checkpoints.push(entry)
    // Checkpoints help determine completeness of recovery
  }

  /**
   * Process flush, rotation, and recovery entries (informational)
   */
  private processFlush(context: RecoveryContext, entry: WalFlush): void {
    // Informational - helps understand WAL state
  }

  private processRotation(context: RecoveryContext, entry: WalRotation): void {
    // File rotation information
  }

  private processRecoveryStart(context: RecoveryContext, entry: WalRecoveryStart): void {
    // Previous recovery information
  }

  private processRecoveryEnd(context: RecoveryContext, entry: WalRecoveryEnd): void {
    // Previous recovery completion
  }

  /**
   * Get or create session for recovery
   */
  private getOrCreateSession(context: RecoveryContext, sessionId: string): RecoveredSession {
    let session = context.sessions.get(sessionId)

    if (!session) {
      session = {
        sessionId,
        utterances: [],
        recoveryTimestamp: Date.now(),
        uncertainEntries: [],
        conflictCount: 0,
        isComplete: false,
        lastActivity: Date.now()
      }

      context.sessions.set(sessionId, session)
      context.stats.sessionsFound++
    }

    return session
  }

  /**
   * Handle conflicts between utterances
   */
  private handleUtteranceConflict(
    context: RecoveryContext,
    session: RecoveredSession,
    existingIndex: number,
    newUtterance: TranscriptUtterance,
    operation: string
  ): void {
    session.conflictCount++
    context.stats.conflictsResolved++

    const existing = session.utterances[existingIndex]

    switch (this.config.conflictResolution) {
      case 'newest':
        // Keep the newer timestamp
        if (newUtterance.timestamp > existing.timestamp) {
          session.utterances[existingIndex] = {...newUtterance}
        }
        break

      case 'oldest':
        // Keep the older timestamp
        if (newUtterance.timestamp < existing.timestamp) {
          session.utterances[existingIndex] = {...newUtterance}
        }
        break

      case 'merge':
        // Merge utterances, preferring non-empty values
        const merged = {...existing}
        for (const [key, value] of Object.entries(newUtterance)) {
          if (
            value &&
            (!existing[key as keyof TranscriptUtterance] ||
              value !== existing[key as keyof TranscriptUtterance])
          ) {
            ;(merged as any)[key] = value
          }
        }
        session.utterances[existingIndex] = merged
        break
    }

    // Mark as uncertain due to conflict
    if (this.config.markUncertainEntries && !session.uncertainEntries.includes(newUtterance.id)) {
      session.uncertainEntries.push(newUtterance.id)
    }
  }

  /**
   * Reconstruct sessions from processed entries
   */
  private async reconstructSessions(context: RecoveryContext): Promise<void> {
    for (const session of context.sessions.values()) {
      // Sort utterances by timestamp
      session.utterances.sort((a, b) => a.timestamp - b.timestamp)

      // Determine if session appears complete
      session.isComplete = this.assessSessionCompleteness(session)

      // Update statistics
      if (session.isComplete) {
        context.stats.sessionsRecovered++
      } else {
        context.stats.sessionsPartial++
      }

      context.stats.utterancesRecovered += session.utterances.length
      context.stats.uncertainEntries += session.uncertainEntries.length
    }

    this.emit('sessionsReconstructed', {
      recoveryId: context.recoveryId,
      sessionCount: context.sessions.size,
      utteranceCount: context.stats.utterancesRecovered
    })
  }

  /**
   * Assess if a session appears complete
   */
  private assessSessionCompleteness(session: RecoveredSession): boolean {
    if (session.utterances.length === 0) {
      return false
    }

    // Check if we have recent activity
    const timeSinceLastActivity = Date.now() - session.lastActivity
    if (timeSinceLastActivity < 60000) {
      // Less than 1 minute ago
      return false // Might still be active
    }

    // Check if final utterances are marked as final
    const recentUtterances = session.utterances.slice(-5)
    const hasFinalUtterance = recentUtterances.some(
      u => u.state === TranscriptState.FINAL || u.state === TranscriptState.COMPLETED
    )

    return hasFinalUtterance
  }

  /**
   * Resolve conflicts and validate data
   */
  private async resolveConflictsAndValidate(context: RecoveryContext): Promise<void> {
    for (const session of context.sessions.values()) {
      // Additional validation could go here
      // For now, just count sessions that failed validation

      if (session.uncertainEntries.length > session.utterances.length * 0.5) {
        // More than 50% uncertain entries - mark as failed
        context.stats.sessionsFailed++
        context.stats.sessionsRecovered--
      }
    }
  }

  /**
   * Generate final recovery result
   */
  private generateRecoveryResult(context: RecoveryContext): {
    result: RecoveryResult
    sessions: RecoveredSession[]
    stats: RecoveryStats
  } {
    const stats = this.finalizeStats(context)
    const sessions = Array.from(context.sessions.values())

    // Determine overall result
    let result: RecoveryResult

    if (context.isAborted) {
      result = RecoveryResult.PARTIAL_SUCCESS
    } else if (stats.sessionsRecovered === 0 && stats.errors.length > 0) {
      result = RecoveryResult.FAILED
    } else if (stats.sessionsRecovered > 0 && stats.errors.length === 0) {
      result = RecoveryResult.SUCCESS
    } else if (stats.sessionsRecovered > 0) {
      result = RecoveryResult.PARTIAL_SUCCESS
    } else {
      result = RecoveryResult.SKIPPED
    }

    return {result, sessions, stats}
  }

  /**
   * Finalize statistics
   */
  private finalizeStats(context: RecoveryContext): RecoveryStats {
    const stats = context.stats
    stats.endTime = Date.now()
    stats.totalDurationMs = stats.endTime - stats.startTime

    // Calculate averages
    if (stats.totalDurationMs > 0) {
      stats.avgEntriesPerSecond = (stats.entriesProcessed * 1000) / stats.totalDurationMs
    }

    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage()
      stats.memoryUsedMB = memUsage.heapUsed / (1024 * 1024)
    }

    return stats
  }

  /**
   * Get list of available WAL files
   */
  private async getWalFiles(): Promise<
    Array<{path: string; name: string; size: number; modified: number}>
  > {
    try {
      const files = await fs.readdir(this.config.walDirectory)
      const walFiles: Array<{path: string; name: string; size: number; modified: number}> = []

      for (const fileName of files) {
        if (fileName.endsWith('.log') && fileName.startsWith('wal_')) {
          const filePath = join(this.config.walDirectory, fileName)
          try {
            const stats = await fs.stat(filePath)
            walFiles.push({
              path: filePath,
              name: fileName,
              size: stats.size,
              modified: stats.mtimeMs
            })
          } catch (error) {
            // Skip files we can't stat
          }
        }
      }

      // Sort by modification time (newest first)
      return walFiles.sort((a, b) => b.modified - a.modified)
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []
      }
      throw error
    }
  }
}

export default WalRecoveryManager
