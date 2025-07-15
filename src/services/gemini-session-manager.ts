/**
 * Gemini Live API Session Manager
 * Handles session tracking, persistence, and resumption for WebSocket connections
 */

import EventEmitter from 'eventemitter3'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

export interface SessionData {
  sessionId: string
  modelId: string
  createdAt: Date
  lastActivity: Date
  status: SessionStatus
  config: {
    model: string
    responseModalities: string[]
    systemInstruction?: string
  }
  connectionHistory: ConnectionEvent[]
  messageCount: number
  turnCount: number
}

export interface ConnectionEvent {
  timestamp: Date
  event: 'connected' | 'disconnected' | 'error' | 'resumed'
  reason?: string
  duration?: number
}

export enum SessionStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
  ERROR = 'error'
}

export interface SessionConfig {
  sessionTimeout: number // in milliseconds
  maxInactiveDuration: number // in milliseconds
  persistenceEnabled: boolean
  cleanupInterval: number // in milliseconds
  maxSessionHistory: number
}

/**
 * Manages Gemini Live API sessions with persistence and resumption capabilities
 */
export class GeminiSessionManager extends EventEmitter {
  private sessions: Map<string, SessionData> = new Map()
  private currentSession: SessionData | null = null
  private config: SessionConfig
  private cleanupTimer: NodeJS.Timeout | null = null
  private storageKey = 'gemini_sessions'

  constructor(config: Partial<SessionConfig> = {}) {
    super()

    this.config = {
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      maxInactiveDuration: 30 * 60 * 1000, // 30 minutes
      persistenceEnabled: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      maxSessionHistory: 10,
      ...config
    }

    this.initializeCleanup()
    this.loadPersistedSessions()
  }

  /**
   * Create a new session
   */
  createSession(modelId: string, sessionConfig: SessionData['config']): SessionData {
    const sessionId = this.generateSessionId()

    const session: SessionData = {
      sessionId,
      modelId,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: SessionStatus.ACTIVE,
      config: sessionConfig,
      connectionHistory: [
        {
          timestamp: new Date(),
          event: 'connected'
        }
      ],
      messageCount: 0,
      turnCount: 0
    }

    this.sessions.set(sessionId, session)
    this.currentSession = session

    logger.info('New session created', {
      sessionId: sanitizeLogMessage(sessionId),
      modelId: sanitizeLogMessage(modelId),
      config: sessionConfig
    })

    this.persistSessions()
    this.emit('sessionCreated', session)

    return session
  }

  /**
   * Get current active session
   */
  getCurrentSession(): SessionData | null {
    return this.currentSession
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionData | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * Resume an existing session
   */
  resumeSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId)

    if (!session) {
      logger.warn('Attempted to resume non-existent session', {
        sessionId: sanitizeLogMessage(sessionId)
      })
      return null
    }

    if (this.isSessionExpired(session)) {
      logger.warn('Attempted to resume expired session', {
        sessionId: sanitizeLogMessage(sessionId),
        lastActivity: session.lastActivity,
        expiredFor: Date.now() - session.lastActivity.getTime()
      })
      session.status = SessionStatus.EXPIRED
      this.persistSessions()
      return null
    }

    // Update session state for resumption
    session.status = SessionStatus.ACTIVE
    session.lastActivity = new Date()
    session.connectionHistory.push({
      timestamp: new Date(),
      event: 'resumed'
    })

    this.currentSession = session

    logger.info('Session resumed', {
      sessionId: sanitizeLogMessage(sessionId),
      messageCount: session.messageCount,
      turnCount: session.turnCount,
      inactiveDuration: Date.now() - session.lastActivity.getTime()
    })

    this.persistSessions()
    this.emit('sessionResumed', session)

    return session
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId?: string): void {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession

    if (session) {
      session.lastActivity = new Date()
      this.persistSessions()
    }
  }

  /**
   * Record a message sent/received in the session
   */
  recordMessage(type: 'sent' | 'received', sessionId?: string): void {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession

    if (session) {
      session.messageCount++
      session.lastActivity = new Date()
      this.persistSessions()

      this.emit('messageRecorded', {
        sessionId: session.sessionId,
        type,
        messageCount: session.messageCount
      })
    }
  }

  /**
   * Record a conversation turn completion
   */
  recordTurn(sessionId?: string): void {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession

    if (session) {
      session.turnCount++
      session.lastActivity = new Date()
      this.persistSessions()

      this.emit('turnRecorded', {
        sessionId: session.sessionId,
        turnCount: session.turnCount
      })
    }
  }

  /**
   * Record a connection event
   */
  recordConnectionEvent(
    event: ConnectionEvent['event'],
    reason?: string,
    duration?: number,
    sessionId?: string
  ): void {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession

    if (session) {
      session.connectionHistory.push({
        timestamp: new Date(),
        event,
        reason,
        duration
      })

      // Update session status based on event
      switch (event) {
        case 'disconnected':
        case 'error':
          session.status = SessionStatus.SUSPENDED
          break
        case 'connected':
        case 'resumed':
          session.status = SessionStatus.ACTIVE
          break
      }

      session.lastActivity = new Date()
      this.persistSessions()

      this.emit('connectionEventRecorded', {
        sessionId: session.sessionId,
        event,
        reason,
        duration
      })
    }
  }

  /**
   * Suspend current session
   */
  suspendSession(reason?: string, sessionId?: string): void {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession

    if (session) {
      session.status = SessionStatus.SUSPENDED
      this.recordConnectionEvent('disconnected', reason, undefined, sessionId)

      logger.info('Session suspended', {
        sessionId: sanitizeLogMessage(session.sessionId),
        reason: sanitizeLogMessage(reason || 'manual')
      })

      this.emit('sessionSuspended', session)
    }
  }

  /**
   * Mark session as having an error
   */
  markSessionError(error: string, sessionId?: string): void {
    const session = sessionId ? this.sessions.get(sessionId) : this.currentSession

    if (session) {
      session.status = SessionStatus.ERROR
      this.recordConnectionEvent('error', error, undefined, sessionId)

      logger.error('Session marked with error', {
        sessionId: sanitizeLogMessage(session.sessionId),
        error: sanitizeLogMessage(error)
      })

      this.emit('sessionError', {session, error})
    }
  }

  /**
   * Get sessions that can be resumed
   */
  getResumableSessions(): SessionData[] {
    const resumable: SessionData[] = []

    for (const session of this.sessions.values()) {
      if (session.status === SessionStatus.SUSPENDED && !this.isSessionExpired(session)) {
        resumable.push(session)
      }
    }

    return resumable.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    let cleanedCount = 0

    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        session.status = SessionStatus.EXPIRED
        this.sessions.delete(sessionId)
        cleanedCount++

        logger.debug('Expired session cleaned up', {
          sessionId: sanitizeLogMessage(sessionId),
          lastActivity: session.lastActivity
        })
      }
    }

    // Also limit the number of sessions we keep
    if (this.sessions.size > this.config.maxSessionHistory) {
      const sessionArray = Array.from(this.sessions.entries()).sort(
        ([, a], [, b]) => b.lastActivity.getTime() - a.lastActivity.getTime()
      )

      const toRemove = sessionArray.slice(this.config.maxSessionHistory)
      toRemove.forEach(([sessionId]) => {
        this.sessions.delete(sessionId)
        cleanedCount++
      })
    }

    if (cleanedCount > 0) {
      this.persistSessions()
      this.emit('sessionsCleanedUp', cleanedCount)
    }

    return cleanedCount
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    total: number
    active: number
    suspended: number
    expired: number
    error: number
    resumable: number
  } {
    const stats = {
      total: this.sessions.size,
      active: 0,
      suspended: 0,
      expired: 0,
      error: 0,
      resumable: 0
    }

    for (const session of this.sessions.values()) {
      switch (session.status) {
        case SessionStatus.ACTIVE:
          stats.active++
          break
        case SessionStatus.SUSPENDED:
          stats.suspended++
          if (!this.isSessionExpired(session)) {
            stats.resumable++
          }
          break
        case SessionStatus.EXPIRED:
          stats.expired++
          break
        case SessionStatus.ERROR:
          stats.error++
          break
      }
    }

    return stats
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    const count = this.sessions.size
    this.sessions.clear()
    this.currentSession = null
    this.persistSessions()

    logger.info('All sessions cleared', {count})
    this.emit('allSessionsCleared', count)
  }

  /**
   * Destroy the session manager
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    this.clearAllSessions()
    this.removeAllListeners()

    logger.debug('Session manager destroyed')
  }

  /**
   * Check if a session is expired
   */
  private isSessionExpired(session: SessionData): boolean {
    const now = Date.now()
    const sessionAge = now - session.createdAt.getTime()
    const inactivityTime = now - session.lastActivity.getTime()

    return (
      sessionAge > this.config.sessionTimeout || inactivityTime > this.config.maxInactiveDuration
    )
  }

  /**
   * Generate a unique session ID using cryptographically secure random values
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36)

    // Use cryptographically secure random generation
    let random: string
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      // Browser environment
      const array = new Uint8Array(6)
      crypto.getRandomValues(array)
      random = Array.from(array, byte => byte.toString(36)).join('')
    } else if (typeof require !== 'undefined') {
      // Node.js environment
      try {
        const cryptoNode = require('crypto')
        random = cryptoNode.randomBytes(6).toString('hex')
      } catch {
        // Fallback for environments without crypto module
        random = Date.now().toString(36) + '_' + process.hrtime.bigint().toString(36)
      }
    } else {
      // Fallback using high-resolution timestamp
      random = Date.now().toString(36) + '_' + performance.now().toString(36).replace('.', '')
    }

    return `gemini_${timestamp}_${random}`
  }

  /**
   * Initialize cleanup timer
   */
  private initializeCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions()
    }, this.config.cleanupInterval)
  }

  /**
   * Load sessions from persistent storage
   */
  private loadPersistedSessions(): void {
    if (!this.config.persistenceEnabled) return

    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKey)
        if (stored) {
          let data: SessionData[]

          try {
            data = JSON.parse(stored)
          } catch (parseError) {
            logger.error(
              'Failed to parse persisted sessions from localStorage. Data might be corrupted.',
              {
                error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
                storageKey: this.storageKey
              }
            )
            // Clear the corrupted data
            localStorage.removeItem(this.storageKey)
            return
          }

          // Validate that data is an array
          if (!Array.isArray(data)) {
            logger.warn('Persisted session data is not an array, clearing corrupted data', {
              dataType: typeof data,
              storageKey: this.storageKey
            })
            localStorage.removeItem(this.storageKey)
            return
          }

          for (const sessionData of data) {
            try {
              // Validate session data structure
              if (!sessionData || typeof sessionData !== 'object' || !sessionData.sessionId) {
                logger.warn('Skipping invalid session data', {sessionData})
                continue
              }

              // Convert date strings back to Date objects
              sessionData.createdAt = new Date(sessionData.createdAt)
              sessionData.lastActivity = new Date(sessionData.lastActivity)

              // Process connection history with proper type checking
              if (Array.isArray(sessionData.connectionHistory)) {
                sessionData.connectionHistory = sessionData.connectionHistory.map(
                  (event: unknown) => {
                    if (typeof event === 'object' && event !== null) {
                      const eventObj = event as Record<string, unknown>
                      return {
                        timestamp: new Date(eventObj.timestamp as string),
                        event: eventObj.event as ConnectionEvent['event'],
                        reason: eventObj.reason as string | undefined,
                        duration: eventObj.duration as number | undefined
                      }
                    }
                    return event
                  }
                ) as ConnectionEvent[]
              } else {
                sessionData.connectionHistory = []
              }

              this.sessions.set(sessionData.sessionId, sessionData)
            } catch (sessionError) {
              logger.warn('Error processing persisted session, skipping', {
                sessionId: sessionData?.sessionId,
                error: sessionError instanceof Error ? sessionError.message : 'Unknown error'
              })
            }
          }

          logger.debug('Loaded persisted sessions', {count: this.sessions.size})
        }
      }
    } catch (error) {
      logger.error('Failed to load persisted sessions', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Persist sessions to storage
   */
  private persistSessions(): void {
    if (!this.config.persistenceEnabled) return

    try {
      if (typeof localStorage !== 'undefined') {
        const data = Array.from(this.sessions.values())
        localStorage.setItem(this.storageKey, JSON.stringify(data))
      }
    } catch (error) {
      logger.error('Failed to persist sessions', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

export default GeminiSessionManager
