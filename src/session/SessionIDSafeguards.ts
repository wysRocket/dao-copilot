/**
 * Session ID Safeguards
 *
 * Provides comprehensive safeguards against session ID reuse, collisions, and mismatches
 * to prevent orphaned partials and ensure transcript consistency across the system.
 */

import {EventEmitter} from 'events'
import {logger} from '../services/gemini-logger'
import {performance} from 'perf_hooks'

// ID validation result enumeration
export enum IDValidationResult {
  VALID = 'valid',
  COLLISION = 'collision',
  REUSED = 'reused',
  MISMATCH = 'mismatch',
  INVALID_FORMAT = 'invalid_format',
  EXPIRED = 'expired',
  ORPHANED = 'orphaned'
}

// ID status tracking
export enum IDStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ORPHANED = 'orphaned',
  EXPIRED = 'expired',
  INVALID = 'invalid'
}

// ID metadata interface
export interface IDMetadata {
  id: string
  type: 'session' | 'transcript' | 'utterance'
  status: IDStatus
  createdAt: number
  lastUsedAt: number
  expiresAt: number
  sessionId?: string
  parentId?: string
  childIds: Set<string>
  usageCount: number
  checksum: string
  source: 'online' | 'offline' | 'recovered'
}

// Orphaned partial information
export interface OrphanedPartial {
  transcriptId: string
  sessionId: string
  partialText: string
  timestamp: number
  confidence?: number
  reason: 'session_mismatch' | 'id_reuse' | 'session_expired' | 'unknown'
  recoverable: boolean
}

// Safeguards configuration
export interface SafeguardsConfig {
  idExpirationTime: number // ID expiration time in milliseconds
  maxIdUsageCount: number // Maximum usage count for an ID
  orphanDetectionInterval: number // Interval for orphan detection in milliseconds
  checksumValidation: boolean // Enable checksum validation
  distributedIdTracking: boolean // Enable distributed ID tracking
  cleanupOrphanedPartials: boolean // Automatically cleanup orphaned partials
  maxOrphanAge: number // Maximum age for orphaned partials (ms)
  idFormatValidation: boolean // Enable strict ID format validation
  telemetryEnabled: boolean // Enable safeguards telemetry
}

// Default safeguards configuration
const DEFAULT_SAFEGUARDS_CONFIG: SafeguardsConfig = {
  idExpirationTime: 24 * 60 * 60 * 1000, // 24 hours
  maxIdUsageCount: 1000, // Maximum 1000 uses per ID
  orphanDetectionInterval: 30 * 1000, // Check every 30 seconds
  checksumValidation: true,
  distributedIdTracking: false, // Disabled by default for single-instance
  cleanupOrphanedPartials: true,
  maxOrphanAge: 60 * 60 * 1000, // 1 hour
  idFormatValidation: true,
  telemetryEnabled: true
}

// Safeguards events interface
export interface SafeguardsEvents {
  'id:collision': (attemptedId: string, existingMetadata: IDMetadata) => void
  'id:reuse': (id: string, metadata: IDMetadata) => void
  'id:mismatch': (id: string, expectedSession: string, actualSession: string) => void
  'id:expired': (id: string, metadata: IDMetadata) => void
  'id:orphaned': (orphan: OrphanedPartial) => void
  'id:validated': (id: string, result: IDValidationResult) => void
  'id:recovered': (id: string, metadata: IDMetadata) => void
  'orphan:detected': (orphans: OrphanedPartial[]) => void
  'orphan:cleaned': (cleanedCount: number) => void
  'validation:failed': (id: string, reason: string) => void
}

// Declare the interface for typed event emission
export interface SessionIDSafeguards {
  on<K extends keyof SafeguardsEvents>(event: K, listener: SafeguardsEvents[K]): this
  emit<K extends keyof SafeguardsEvents>(
    event: K,
    ...args: Parameters<SafeguardsEvents[K]>
  ): boolean
}

/**
 * Comprehensive ID safeguards system for preventing orphaned partials
 */
export class SessionIDSafeguards extends EventEmitter {
  private readonly config: SafeguardsConfig
  private readonly idRegistry = new Map<string, IDMetadata>()
  private readonly orphanedPartials = new Map<string, OrphanedPartial>()
  private readonly sessionToTranscripts = new Map<string, Set<string>>()
  private orphanDetectionTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<SafeguardsConfig> = {}) {
    super()
    this.config = {...DEFAULT_SAFEGUARDS_CONFIG, ...config}
    this.startBackgroundTasks()

    logger.info('SessionIDSafeguards initialized', {
      config: this.sanitizeConfigForLogging(this.config)
    })
  }

  /**
   * Validate and register a new ID
   */
  validateAndRegisterID(
    id: string,
    type: 'session' | 'transcript' | 'utterance',
    sessionId?: string,
    parentId?: string
  ): IDValidationResult {
    try {
      // Check ID format if validation is enabled
      if (this.config.idFormatValidation && !this.isValidIDFormat(id)) {
        this.emit('validation:failed', id, 'Invalid ID format')
        return IDValidationResult.INVALID_FORMAT
      }

      // Check for existing ID (collision detection)
      if (this.idRegistry.has(id)) {
        const existing = this.idRegistry.get(id)!

        // Check if ID is being reused
        if (existing.status === IDStatus.COMPLETED) {
          this.emit('id:reuse', id, existing)
          logger.warn('ID reuse detected', {id, existingMetadata: existing})
          return IDValidationResult.REUSED
        }

        // Check if ID is still active (collision)
        if (existing.status === IDStatus.ACTIVE) {
          this.emit('id:collision', id, existing)
          logger.error('ID collision detected', {id, existingMetadata: existing})
          return IDValidationResult.COLLISION
        }

        // Check for session mismatch
        if (sessionId && existing.sessionId && existing.sessionId !== sessionId) {
          this.emit('id:mismatch', id, existing.sessionId, sessionId)
          logger.error('Session ID mismatch detected', {
            id,
            expectedSession: existing.sessionId,
            actualSession: sessionId
          })
          return IDValidationResult.MISMATCH
        }

        // Check if ID has expired
        if (existing.expiresAt < performance.now()) {
          this.emit('id:expired', id, existing)
          logger.warn('Expired ID detected', {id, expiresAt: existing.expiresAt})
          return IDValidationResult.EXPIRED
        }
      }

      // Register the new ID
      const now = performance.now()
      const metadata: IDMetadata = {
        id,
        type,
        status: IDStatus.ACTIVE,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now + this.config.idExpirationTime,
        sessionId,
        parentId,
        childIds: new Set<string>(),
        usageCount: 1,
        checksum: this.generateChecksum(id, type, sessionId),
        source: this.detectIDSource(id)
      }

      this.idRegistry.set(id, metadata)

      // Track session-to-transcript relationships
      if (type === 'transcript' && sessionId) {
        if (!this.sessionToTranscripts.has(sessionId)) {
          this.sessionToTranscripts.set(sessionId, new Set())
        }
        this.sessionToTranscripts.get(sessionId)!.add(id)
      }

      // Update parent-child relationships
      if (parentId && this.idRegistry.has(parentId)) {
        this.idRegistry.get(parentId)!.childIds.add(id)
      }

      if (this.config.telemetryEnabled) {
        this.emit('id:validated', id, IDValidationResult.VALID)
      }

      logger.debug('ID validated and registered', {
        id,
        type,
        sessionId,
        parentId,
        checksum: metadata.checksum
      })

      return IDValidationResult.VALID
    } catch (error) {
      logger.error('ID validation failed', {id, error})
      this.emit('validation:failed', id, `Validation error: ${error}`)
      return IDValidationResult.INVALID_FORMAT
    }
  }

  /**
   * Mark an ID as completed
   */
  markIDCompleted(id: string): boolean {
    const metadata = this.idRegistry.get(id)
    if (!metadata) {
      logger.warn('Attempted to complete non-existent ID', {id})
      return false
    }

    metadata.status = IDStatus.COMPLETED
    metadata.lastUsedAt = performance.now()
    metadata.usageCount++

    logger.debug('ID marked as completed', {id, usageCount: metadata.usageCount})
    return true
  }

  /**
   * Update ID usage
   */
  updateIDUsage(id: string): boolean {
    const metadata = this.idRegistry.get(id)
    if (!metadata) {
      logger.warn('Attempted to update usage for non-existent ID', {id})
      return false
    }

    metadata.lastUsedAt = performance.now()
    metadata.usageCount++

    // Check usage limits
    if (metadata.usageCount > this.config.maxIdUsageCount) {
      logger.warn('ID usage count exceeded', {
        id,
        usageCount: metadata.usageCount,
        maxUsage: this.config.maxIdUsageCount
      })
      metadata.status = IDStatus.INVALID
      return false
    }

    return true
  }

  /**
   * Detect and handle orphaned partials
   */
  detectOrphanedPartials(): OrphanedPartial[] {
    const orphans: OrphanedPartial[] = []
    const now = performance.now()

    // Check for orphaned transcripts due to session mismatches
    for (const [sessionId, transcriptIds] of this.sessionToTranscripts.entries()) {
      const sessionMetadata = this.idRegistry.get(sessionId)

      if (!sessionMetadata) {
        // Session not found - all transcripts are orphaned
        for (const transcriptId of transcriptIds) {
          const orphan = this.createOrphanedPartial(transcriptId, sessionId, 'session_mismatch')
          if (orphan) {
            orphans.push(orphan)
          }
        }
        continue
      }

      // Check if session has expired
      if (sessionMetadata.expiresAt < now) {
        for (const transcriptId of transcriptIds) {
          const orphan = this.createOrphanedPartial(transcriptId, sessionId, 'session_expired')
          if (orphan) {
            orphans.push(orphan)
          }
        }
        continue
      }

      // Check for transcript-specific issues
      for (const transcriptId of transcriptIds) {
        const transcriptMetadata = this.idRegistry.get(transcriptId)

        if (!transcriptMetadata) {
          const orphan = this.createOrphanedPartial(transcriptId, sessionId, 'unknown')
          if (orphan) {
            orphans.push(orphan)
          }
          continue
        }

        // Check for ID reuse
        if (transcriptMetadata.usageCount > this.config.maxIdUsageCount) {
          const orphan = this.createOrphanedPartial(transcriptId, sessionId, 'id_reuse')
          if (orphan) {
            orphans.push(orphan)
          }
        }
      }
    }

    // Store orphaned partials for cleanup
    for (const orphan of orphans) {
      this.orphanedPartials.set(orphan.transcriptId, orphan)
    }

    if (orphans.length > 0) {
      this.emit('orphan:detected', orphans)
      logger.warn('Orphaned partials detected', {
        count: orphans.length,
        orphanIds: orphans.map(o => o.transcriptId)
      })
    }

    return orphans
  }

  /**
   * Clean up orphaned partials
   */
  cleanupOrphanedPartials(): number {
    if (!this.config.cleanupOrphanedPartials) {
      return 0
    }

    const now = performance.now()
    let cleanedCount = 0

    for (const [transcriptId, orphan] of this.orphanedPartials.entries()) {
      const age = now - orphan.timestamp

      if (age > this.config.maxOrphanAge || !orphan.recoverable) {
        // Remove from registry
        this.idRegistry.delete(transcriptId)

        // Remove from session mapping
        if (this.sessionToTranscripts.has(orphan.sessionId)) {
          this.sessionToTranscripts.get(orphan.sessionId)!.delete(transcriptId)
        }

        // Remove from orphaned partials
        this.orphanedPartials.delete(transcriptId)

        cleanedCount++
        logger.debug('Orphaned partial cleaned up', {
          transcriptId,
          sessionId: orphan.sessionId,
          age,
          reason: orphan.reason
        })
      }
    }

    if (cleanedCount > 0) {
      this.emit('orphan:cleaned', cleanedCount)
      logger.info('Orphaned partials cleanup completed', {cleanedCount})
    }

    return cleanedCount
  }

  /**
   * Get safeguards statistics
   */
  getStatistics(): {
    totalIds: number
    activeIds: number
    completedIds: number
    orphanedIds: number
    expiredIds: number
    invalidIds: number
    collisionCount: number
    reuseCount: number
    mismatchCount: number
  } {
    let activeIds = 0
    let completedIds = 0
    let orphanedIds = 0
    let expiredIds = 0
    let invalidIds = 0

    const now = performance.now()

    for (const metadata of this.idRegistry.values()) {
      switch (metadata.status) {
        case IDStatus.ACTIVE:
          if (metadata.expiresAt < now) {
            expiredIds++
          } else {
            activeIds++
          }
          break
        case IDStatus.COMPLETED:
          completedIds++
          break
        case IDStatus.ORPHANED:
          orphanedIds++
          break
        case IDStatus.INVALID:
          invalidIds++
          break
      }
    }

    return {
      totalIds: this.idRegistry.size,
      activeIds,
      completedIds,
      orphanedIds: orphanedIds + this.orphanedPartials.size,
      expiredIds,
      invalidIds,
      collisionCount: this.getEventCount('id:collision'),
      reuseCount: this.getEventCount('id:reuse'),
      mismatchCount: this.getEventCount('id:mismatch')
    }
  }

  /**
   * Get all orphaned partials
   */
  getOrphanedPartials(): OrphanedPartial[] {
    return Array.from(this.orphanedPartials.values())
  }

  /**
   * Get ID metadata
   */
  getIDMetadata(id: string): IDMetadata | undefined {
    return this.idRegistry.get(id)
  }

  /**
   * Check if an ID exists and is valid
   */
  isValidID(id: string): boolean {
    const metadata = this.idRegistry.get(id)
    if (!metadata) {
      return false
    }

    const now = performance.now()
    return (
      metadata.status === IDStatus.ACTIVE &&
      metadata.expiresAt > now &&
      metadata.usageCount <= this.config.maxIdUsageCount
    )
  }

  /**
   * Validate ID format
   */
  private isValidIDFormat(id: string): boolean {
    // Check basic format requirements
    if (!id || typeof id !== 'string' || id.length < 10) {
      return false
    }

    // Check for valid characters (alphanumeric, underscore, hyphen)
    const validCharPattern = /^[a-zA-Z0-9_-]+$/
    if (!validCharPattern.test(id)) {
      return false
    }

    // Check for expected prefixes
    const validPrefixes = ['session_', 'transcript_', 'utterance_']
    const hasValidPrefix = validPrefixes.some(prefix => id.startsWith(prefix))

    return hasValidPrefix
  }

  /**
   * Generate checksum for ID validation
   */
  private generateChecksum(id: string, type: string, sessionId?: string): string {
    const data = `${id}:${type}:${sessionId || ''}:${performance.now()}`

    // Simple hash function for checksum
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36)
  }

  /**
   * Detect ID source (online/offline/recovered)
   */
  private detectIDSource(id: string): 'online' | 'offline' | 'recovered' {
    // Check if ID contains UUID pattern (online)
    if (id.includes('-') && id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/)) {
      return 'online'
    }

    // Check if ID is marked as recovered
    if (id.includes('_recovered_')) {
      return 'recovered'
    }

    // Default to offline
    return 'offline'
  }

  /**
   * Create orphaned partial record
   */
  private createOrphanedPartial(
    transcriptId: string,
    sessionId: string,
    reason: OrphanedPartial['reason']
  ): OrphanedPartial | null {
    const metadata = this.idRegistry.get(transcriptId)

    const orphan: OrphanedPartial = {
      transcriptId,
      sessionId,
      partialText: '', // Will be populated from actual transcript data
      timestamp: performance.now(),
      reason,
      recoverable: reason !== 'id_reuse' && reason !== 'unknown'
    }

    return orphan
  }

  /**
   * Get event count for telemetry
   */
  private getEventCount(eventName: string): number {
    // This would require event counting implementation
    // For now, return 0 as placeholder
    return 0
  }

  /**
   * Start background monitoring tasks
   */
  private startBackgroundTasks(): void {
    // Orphan detection timer
    if (this.config.orphanDetectionInterval > 0) {
      this.orphanDetectionTimer = setInterval(() => {
        this.detectOrphanedPartials()
      }, this.config.orphanDetectionInterval)
    }

    // Cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupOrphanedPartials()
    }, 60000) // Run every minute
  }

  /**
   * Stop background tasks
   */
  private stopBackgroundTasks(): void {
    if (this.orphanDetectionTimer) {
      clearInterval(this.orphanDetectionTimer)
      this.orphanDetectionTimer = null
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Sanitize configuration for logging
   */
  private sanitizeConfigForLogging(config: SafeguardsConfig): Partial<SafeguardsConfig> {
    return {
      idExpirationTime: config.idExpirationTime,
      maxIdUsageCount: config.maxIdUsageCount,
      orphanDetectionInterval: config.orphanDetectionInterval,
      checksumValidation: config.checksumValidation,
      distributedIdTracking: config.distributedIdTracking,
      cleanupOrphanedPartials: config.cleanupOrphanedPartials,
      maxOrphanAge: config.maxOrphanAge,
      idFormatValidation: config.idFormatValidation,
      telemetryEnabled: config.telemetryEnabled
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    this.stopBackgroundTasks()

    // Final cleanup of orphaned partials
    const cleanedCount = this.cleanupOrphanedPartials()

    this.idRegistry.clear()
    this.orphanedPartials.clear()
    this.sessionToTranscripts.clear()

    logger.info('SessionIDSafeguards destroyed', {finalCleanupCount: cleanedCount})
  }
}

// Export singleton instance
let globalSafeguards: SessionIDSafeguards | null = null

/**
 * Get the global SessionIDSafeguards instance
 */
export function getSessionIDSafeguards(config?: Partial<SafeguardsConfig>): SessionIDSafeguards {
  if (!globalSafeguards) {
    globalSafeguards = new SessionIDSafeguards(config)
  }
  return globalSafeguards
}

/**
 * Initialize a new SessionIDSafeguards instance (replaces global if exists)
 */
export function initializeSessionIDSafeguards(
  config?: Partial<SafeguardsConfig>
): SessionIDSafeguards {
  if (globalSafeguards) {
    globalSafeguards.destroy().catch(error => {
      logger.error('Error destroying existing SessionIDSafeguards', {error})
    })
  }
  globalSafeguards = new SessionIDSafeguards(config)
  return globalSafeguards
}

/**
 * Type guard for ID metadata
 */
export function isValidIDMetadata(obj: any): obj is IDMetadata {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.lastUsedAt === 'number' &&
    typeof obj.expiresAt === 'number' &&
    typeof obj.usageCount === 'number' &&
    typeof obj.checksum === 'string' &&
    obj.childIds instanceof Set
  )
}
