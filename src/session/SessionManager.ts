/**
 * Session Manager
 *
 * Provides comprehensive session lifecycle management for the transcription system.
 * Coordinates between the existing GeminiSessionManager and provides higher-level
 * session and ID management with safeguards against orphaned partials.
 */

import {EventEmitter} from 'events'
import {logger} from '../services/gemini-logger'
import GeminiSessionManager, {SessionData, SessionStatus} from '../services/gemini-session-manager'
import {performance} from 'perf_hooks'

// Session state enumeration
export enum SessionState {
  INACTIVE = 'inactive',
  STARTING = 'starting',
  ACTIVE = 'active',
  PAUSING = 'pausing',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  RECOVERING = 'recovering'
}

// Session boundary events
export enum SessionBoundary {
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  SESSION_PAUSE = 'session_pause',
  SESSION_RESUME = 'session_resume',
  SESSION_ERROR = 'session_error'
}

// Session configuration interface
export interface SessionManagerConfig {
  sessionTimeout: number // Maximum session duration (ms)
  boundaryDetectionWindow: number // Time window for boundary detection (ms)
  idCollisionRetries: number // Number of retries for ID collisions
  offlineIdCacheSize: number // Size of offline ID cache
  telemetryEnabled: boolean // Enable session telemetry
  autoRecovery: boolean // Enable automatic session recovery
  checkpointInterval: number // Checkpoint interval for recovery (ms)
  maxConcurrentSessions: number // Maximum concurrent sessions
}

// Default configuration
const DEFAULT_SESSION_CONFIG: SessionManagerConfig = {
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  boundaryDetectionWindow: 2000, // 2 seconds
  idCollisionRetries: 5,
  offlineIdCacheSize: 10000,
  telemetryEnabled: true,
  autoRecovery: true,
  checkpointInterval: 5000, // 5 seconds
  maxConcurrentSessions: 5
}

// Session metadata interface
export interface SessionMetadata {
  sessionId: string
  state: SessionState
  createdAt: number
  updatedAt: number
  startedAt?: number
  endedAt?: number
  pausedAt?: number
  resumedAt?: number
  errorAt?: number
  recoveredAt?: number
  transcriptIds: Set<string>
  checkpoints: SessionCheckpoint[]
  telemetry: SessionTelemetry
}

// Session checkpoint for recovery
export interface SessionCheckpoint {
  timestamp: number
  state: SessionState
  transcriptIds: string[]
  boundaryMarker?: string
  metadata?: Record<string, any>
}

// Session telemetry data
export interface SessionTelemetry {
  totalTranscripts: number
  activeTranscripts: number
  completedTranscripts: number
  orphanedTranscripts: number
  boundaryTransitions: number
  recoveryAttempts: number
  errorEvents: number
  averageTranscriptDuration: number
  lastActivityTime: number
}

// Session events interface
export interface SessionEvents {
  'session:created': (sessionId: string, metadata: SessionMetadata) => void
  'session:started': (sessionId: string, metadata: SessionMetadata) => void
  'session:paused': (sessionId: string, metadata: SessionMetadata) => void
  'session:resumed': (sessionId: string, metadata: SessionMetadata) => void
  'session:stopped': (sessionId: string, metadata: SessionMetadata) => void
  'session:error': (sessionId: string, error: Error, metadata: SessionMetadata) => void
  'session:recovered': (sessionId: string, metadata: SessionMetadata) => void
  'session:boundary': (
    sessionId: string,
    boundary: SessionBoundary,
    metadata: SessionMetadata
  ) => void
  'session:transcript_added': (sessionId: string, transcriptId: string) => void
  'session:transcript_completed': (sessionId: string, transcriptId: string) => void
  'session:transcript_orphaned': (sessionId: string, transcriptId: string) => void
  'id:collision_detected': (attemptedId: string, resolvedId: string) => void
  'id:offline_generated': (sessionId: string, generatedIds: string[]) => void
}

// Declare the interface for typed event emission
export interface SessionManager {
  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): this
  emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): boolean
}

/**
 * Comprehensive session lifecycle manager with advanced ID management
 */
export class SessionManager extends EventEmitter {
  private readonly config: SessionManagerConfig
  private readonly geminiSessionManager: GeminiSessionManager
  private readonly sessions = new Map<string, SessionMetadata>()
  private readonly usedIds = new Set<string>()
  private readonly offlineIdCache = new Set<string>()
  private checkpointTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private isOnline = true

  constructor(config: Partial<SessionManagerConfig> = {}) {
    super()
    this.config = {...DEFAULT_SESSION_CONFIG, ...config}

    // Initialize Gemini session manager
    this.geminiSessionManager = new GeminiSessionManager({
      sessionTimeout: this.config.sessionTimeout,
      maxInactiveDuration: this.config.sessionTimeout / 2,
      persistenceEnabled: true,
      cleanupInterval: 60000, // 1 minute
      maxSessionHistory: 100
    })

    this.setupEventHandlers()
    this.startBackgroundTasks()

    logger.info('SessionManager initialized', {
      config: this.sanitizeConfigForLogging(this.config)
    })
  }

  /**
   * Create a new session with unique ID generation
   */
  async createSession(): Promise<string> {
    try {
      // Check concurrent session limit
      const activeSessions = Array.from(this.sessions.values()).filter(
        session => session.state === SessionState.ACTIVE
      ).length

      if (activeSessions >= this.config.maxConcurrentSessions) {
        throw new Error(
          `Maximum concurrent sessions limit reached: ${this.config.maxConcurrentSessions}`
        )
      }

      const sessionId = await this.generateUniqueSessionId()
      const now = performance.now()

      const metadata: SessionMetadata = {
        sessionId,
        state: SessionState.INACTIVE,
        createdAt: now,
        updatedAt: now,
        transcriptIds: new Set(),
        checkpoints: [],
        telemetry: this.createInitialTelemetry()
      }

      this.sessions.set(sessionId, metadata)
      this.usedIds.add(sessionId)

      if (this.config.telemetryEnabled) {
        this.emit('session:created', sessionId, metadata)
      }

      logger.info('Session created', {sessionId, state: metadata.state})
      return sessionId
    } catch (error) {
      logger.error('Failed to create session', {error})
      throw error
    }
  }

  /**
   * Start an existing session
   */
  async startSession(sessionId: string): Promise<void> {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (metadata.state !== SessionState.INACTIVE && metadata.state !== SessionState.PAUSED) {
      throw new Error(`Cannot start session in state: ${metadata.state}`)
    }

    try {
      await this.transitionSessionState(sessionId, SessionState.STARTING)

      // Start underlying Gemini session
      const geminiSession = this.geminiSessionManager.createSession({
        model: 'gemini-1.5-flash',
        responseModalities: ['AUDIO', 'TEXT'],
        systemInstruction: 'You are a helpful AI assistant focused on accurate transcription.'
      })

      metadata.startedAt = performance.now()
      await this.transitionSessionState(sessionId, SessionState.ACTIVE)

      // Create initial checkpoint
      await this.createCheckpoint(sessionId, 'Session started')

      if (this.config.telemetryEnabled) {
        this.emit('session:started', sessionId, metadata)
        this.emit('session:boundary', sessionId, SessionBoundary.SESSION_START, metadata)
      }

      logger.info('Session started', {sessionId})
    } catch (error) {
      await this.transitionSessionState(sessionId, SessionState.ERROR)
      metadata.errorAt = performance.now()

      logger.error('Failed to start session', {sessionId, error})

      if (this.config.telemetryEnabled) {
        this.emit('session:error', sessionId, error as Error, metadata)
      }

      throw error
    }
  }

  /**
   * Pause an active session
   */
  async pauseSession(sessionId: string): Promise<void> {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (metadata.state !== SessionState.ACTIVE) {
      throw new Error(`Cannot pause session in state: ${metadata.state}`)
    }

    try {
      await this.transitionSessionState(sessionId, SessionState.PAUSING)

      // Create checkpoint before pausing
      await this.createCheckpoint(sessionId, 'Session pausing')

      metadata.pausedAt = performance.now()
      await this.transitionSessionState(sessionId, SessionState.PAUSED)

      if (this.config.telemetryEnabled) {
        this.emit('session:paused', sessionId, metadata)
        this.emit('session:boundary', sessionId, SessionBoundary.SESSION_PAUSE, metadata)
      }

      logger.info('Session paused', {sessionId})
    } catch (error) {
      await this.transitionSessionState(sessionId, SessionState.ERROR)
      metadata.errorAt = performance.now()

      logger.error('Failed to pause session', {sessionId, error})

      if (this.config.telemetryEnabled) {
        this.emit('session:error', sessionId, error as Error, metadata)
      }

      throw error
    }
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<void> {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (metadata.state !== SessionState.PAUSED) {
      throw new Error(`Cannot resume session in state: ${metadata.state}`)
    }

    try {
      metadata.resumedAt = performance.now()
      await this.transitionSessionState(sessionId, SessionState.ACTIVE)

      // Create checkpoint after resuming
      await this.createCheckpoint(sessionId, 'Session resumed')

      if (this.config.telemetryEnabled) {
        this.emit('session:resumed', sessionId, metadata)
        this.emit('session:boundary', sessionId, SessionBoundary.SESSION_RESUME, metadata)
      }

      logger.info('Session resumed', {sessionId})
    } catch (error) {
      await this.transitionSessionState(sessionId, SessionState.ERROR)
      metadata.errorAt = performance.now()

      logger.error('Failed to resume session', {sessionId, error})

      if (this.config.telemetryEnabled) {
        this.emit('session:error', sessionId, error as Error, metadata)
      }

      throw error
    }
  }

  /**
   * Stop a session and finalize all transcripts
   */
  async stopSession(sessionId: string): Promise<void> {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (metadata.state === SessionState.STOPPED) {
      return // Already stopped
    }

    try {
      await this.transitionSessionState(sessionId, SessionState.STOPPING)

      // Create final checkpoint
      await this.createCheckpoint(sessionId, 'Session stopping')

      // Handle any active transcripts
      if (metadata.transcriptIds.size > 0) {
        logger.warn('Session stopping with active transcripts', {
          sessionId,
          activeTranscripts: metadata.transcriptIds.size
        })

        // Mark all remaining transcripts as potentially orphaned
        for (const transcriptId of metadata.transcriptIds) {
          metadata.telemetry.orphanedTranscripts++

          if (this.config.telemetryEnabled) {
            this.emit('session:transcript_orphaned', sessionId, transcriptId)
          }
        }
      }

      metadata.endedAt = performance.now()
      await this.transitionSessionState(sessionId, SessionState.STOPPED)

      // Suspend underlying Gemini session
      this.geminiSessionManager.suspendSession('session_stop', sessionId)

      if (this.config.telemetryEnabled) {
        this.emit('session:stopped', sessionId, metadata)
        this.emit('session:boundary', sessionId, SessionBoundary.SESSION_END, metadata)
      }

      logger.info('Session stopped', {
        sessionId,
        duration: metadata.endedAt - (metadata.startedAt || metadata.createdAt),
        transcriptsCompleted: metadata.telemetry.completedTranscripts,
        transcriptsOrphaned: metadata.telemetry.orphanedTranscripts
      })
    } catch (error) {
      await this.transitionSessionState(sessionId, SessionState.ERROR)
      metadata.errorAt = performance.now()

      logger.error('Failed to stop session', {sessionId, error})

      if (this.config.telemetryEnabled) {
        this.emit('session:error', sessionId, error as Error, metadata)
      }

      throw error
    }
  }

  /**
   * Add a transcript to a session
   */
  addTranscriptToSession(sessionId: string, transcriptId: string): void {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (metadata.transcriptIds.has(transcriptId)) {
      logger.warn('Transcript already exists in session', {sessionId, transcriptId})
      return
    }

    metadata.transcriptIds.add(transcriptId)
    metadata.telemetry.totalTranscripts++
    metadata.telemetry.activeTranscripts++
    metadata.updatedAt = performance.now()

    if (this.config.telemetryEnabled) {
      this.emit('session:transcript_added', sessionId, transcriptId)
    }

    logger.debug('Transcript added to session', {sessionId, transcriptId})
  }

  /**
   * Mark a transcript as completed
   */
  completeTranscriptInSession(sessionId: string, transcriptId: string): void {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (!metadata.transcriptIds.has(transcriptId)) {
      logger.warn('Transcript not found in session', {sessionId, transcriptId})
      return
    }

    metadata.telemetry.activeTranscripts = Math.max(0, metadata.telemetry.activeTranscripts - 1)
    metadata.telemetry.completedTranscripts++
    metadata.updatedAt = performance.now()

    if (this.config.telemetryEnabled) {
      this.emit('session:transcript_completed', sessionId, transcriptId)
    }

    logger.debug('Transcript completed in session', {sessionId, transcriptId})
  }

  /**
   * Generate a unique session ID with collision detection
   */
  private async generateUniqueSessionId(): Promise<string> {
    for (let attempt = 0; attempt <= this.config.idCollisionRetries; attempt++) {
      const id = this.generateId('session')

      if (!this.usedIds.has(id) && !this.sessions.has(id)) {
        return id
      }

      if (this.config.telemetryEnabled && attempt > 0) {
        this.emit('id:collision_detected', id, '')
      }

      logger.warn('Session ID collision detected', {
        attemptedId: id,
        attempt: attempt + 1,
        maxRetries: this.config.idCollisionRetries
      })

      // Add some randomization delay on retries
      if (attempt < this.config.idCollisionRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100))
      }
    }

    throw new Error('Failed to generate unique session ID after maximum retries')
  }

  /**
   * Generate a robust ID that works offline and online
   */
  generateId(prefix = 'transcript'): string {
    // Use high-resolution timestamp for uniqueness
    const timestamp = performance.now().toString(36)
    const randomPart =
      this.isOnline && typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().split('-')[0] // Use first part of UUID when online
        : Math.random().toString(36).substring(2, 15) // Fallback for offline

    const id = `${prefix}_${timestamp}_${randomPart}`

    // Cache ID for offline scenarios
    if (!this.isOnline && this.offlineIdCache.size < this.config.offlineIdCacheSize) {
      this.offlineIdCache.add(id)
    }

    return id
  }

  /**
   * Get session metadata
   */
  getSession(sessionId: string): SessionMetadata | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Map<string, SessionMetadata> {
    return new Map(this.sessions)
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): SessionMetadata[] {
    return Array.from(this.sessions.values()).filter(
      session => session.state === SessionState.ACTIVE
    )
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = performance.now()
    const expiredSessions: string[] = []

    for (const [sessionId, metadata] of this.sessions.entries()) {
      const age = now - metadata.createdAt
      const inactive = now - metadata.updatedAt

      if (age > this.config.sessionTimeout || inactive > this.config.sessionTimeout / 2) {
        expiredSessions.push(sessionId)
      }
    }

    for (const sessionId of expiredSessions) {
      try {
        await this.stopSession(sessionId)
        this.sessions.delete(sessionId)
        logger.info('Expired session cleaned up', {sessionId})
      } catch (error) {
        logger.error('Failed to cleanup expired session', {sessionId, error})
      }
    }
  }

  /**
   * Transition session state with validation
   */
  private async transitionSessionState(sessionId: string, newState: SessionState): Promise<void> {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const oldState = metadata.state
    metadata.state = newState
    metadata.updatedAt = performance.now()

    // Update telemetry
    if (newState === SessionState.ACTIVE) {
      metadata.telemetry.lastActivityTime = metadata.updatedAt
    }

    logger.debug('Session state transition', {
      sessionId,
      oldState,
      newState,
      timestamp: metadata.updatedAt
    })
  }

  /**
   * Create session checkpoint for recovery
   */
  private async createCheckpoint(sessionId: string, marker?: string): Promise<void> {
    const metadata = this.sessions.get(sessionId)
    if (!metadata) {
      return
    }

    const checkpoint: SessionCheckpoint = {
      timestamp: performance.now(),
      state: metadata.state,
      transcriptIds: Array.from(metadata.transcriptIds),
      boundaryMarker: marker,
      metadata: {
        telemetry: {...metadata.telemetry}
      }
    }

    metadata.checkpoints.push(checkpoint)

    // Keep only recent checkpoints to prevent memory bloat
    const maxCheckpoints = 10
    if (metadata.checkpoints.length > maxCheckpoints) {
      metadata.checkpoints.splice(0, metadata.checkpoints.length - maxCheckpoints)
    }

    logger.debug('Session checkpoint created', {
      sessionId,
      marker,
      checkpointCount: metadata.checkpoints.length
    })
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Monitor network connectivity
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true
        logger.info('Network connectivity restored')

        if (this.offlineIdCache.size > 0 && this.config.telemetryEnabled) {
          this.emit('id:offline_generated', 'system', Array.from(this.offlineIdCache))
          this.offlineIdCache.clear()
        }
      })

      window.addEventListener('offline', () => {
        this.isOnline = false
        logger.warn('Network connectivity lost - switching to offline ID generation')
      })
    }
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Checkpoint timer
    if (this.config.checkpointInterval > 0) {
      this.checkpointTimer = setInterval(async () => {
        for (const [sessionId, metadata] of this.sessions.entries()) {
          if (metadata.state === SessionState.ACTIVE) {
            await this.createCheckpoint(sessionId, 'Periodic checkpoint')
          }
        }
      }, this.config.checkpointInterval)
    }

    // Cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        logger.error('Session cleanup failed', {error})
      })
    }, 60000) // Run every minute
  }

  /**
   * Stop background tasks
   */
  private stopBackgroundTasks(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer)
      this.checkpointTimer = null
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Create initial telemetry data
   */
  private createInitialTelemetry(): SessionTelemetry {
    return {
      totalTranscripts: 0,
      activeTranscripts: 0,
      completedTranscripts: 0,
      orphanedTranscripts: 0,
      boundaryTransitions: 0,
      recoveryAttempts: 0,
      errorEvents: 0,
      averageTranscriptDuration: 0,
      lastActivityTime: performance.now()
    }
  }

  /**
   * Sanitize configuration for logging
   */
  private sanitizeConfigForLogging(config: SessionManagerConfig): Partial<SessionManagerConfig> {
    return {
      sessionTimeout: config.sessionTimeout,
      boundaryDetectionWindow: config.boundaryDetectionWindow,
      idCollisionRetries: config.idCollisionRetries,
      telemetryEnabled: config.telemetryEnabled,
      autoRecovery: config.autoRecovery,
      maxConcurrentSessions: config.maxConcurrentSessions
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.stopBackgroundTasks()

    // Stop all active sessions
    for (const sessionId of this.sessions.keys()) {
      try {
        await this.stopSession(sessionId)
      } catch (error) {
        logger.error('Error stopping session during destroy', {sessionId, error})
      }
    }

    this.sessions.clear()
    this.usedIds.clear()
    this.offlineIdCache.clear()

    logger.info('SessionManager destroyed')
  }
}

// Export singleton instance
let globalSessionManager: SessionManager | null = null

/**
 * Get the global SessionManager instance
 */
export function getSessionManager(config?: Partial<SessionManagerConfig>): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager(config)
  }
  return globalSessionManager
}

/**
 * Initialize a new SessionManager instance (replaces global if exists)
 */
export function initializeSessionManager(config?: Partial<SessionManagerConfig>): SessionManager {
  if (globalSessionManager) {
    globalSessionManager.destroy().catch(error => {
      logger.error('Error destroying existing SessionManager', {error})
    })
  }
  globalSessionManager = new SessionManager(config)
  return globalSessionManager
}

/**
 * Type guard for session metadata
 */
export function isValidSessionMetadata(obj: any): obj is SessionMetadata {
  return (
    obj &&
    typeof obj.sessionId === 'string' &&
    typeof obj.state === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.updatedAt === 'number' &&
    obj.transcriptIds instanceof Set &&
    Array.isArray(obj.checkpoints) &&
    typeof obj.telemetry === 'object'
  )
}
