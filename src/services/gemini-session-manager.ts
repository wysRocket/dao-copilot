/**
 * Gemini Live API Session Manager
 * Handles session lifecycle, state management, and configuration for Gemini Live API
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'
import {GeminiErrorHandler, ErrorType, type GeminiError} from './gemini-error-handler'

/**
 * Session lifecycle states
 */
export enum SessionState {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  PAUSED = 'paused',
  RESUMING = 'resuming',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated',
  ERROR = 'error'
}

/**
 * Session configuration interface
 */
export interface SessionConfig {
  model: string
  responseModalities: string[]
  systemInstruction?: string
  language?: string
  audioSettings?: AudioSessionSettings
  resumptionEnabled: boolean
  sessionTimeout?: number // in milliseconds
  maxConversationHistory?: number // max turns to keep
  generateSessionId?: boolean // whether to generate a client-side session ID
}

/**
 * Audio settings for the session
 */
export interface AudioSessionSettings {
  sampleRate?: number
  encoding?: string
  channels?: number
  bitDepth?: number
  enableVAD?: boolean // Voice Activity Detection
  silenceThreshold?: number
}

/**
 * Session context for resumption
 */
export interface SessionContext {
  conversationHistory: ConversationTurn[]
  lastMessageId?: string
  lastServerTurnId?: string
  sessionStartTime: Date
  lastActivityTime: Date
  totalMessages: number
  totalTurns: number
  resumptionContext?: SessionResumptionContext
}

/**
 * Context needed for session resumption after disconnection
 */
export interface SessionResumptionContext {
  lastKnownMessageId?: string
  lastServerResponseId?: string
  connectionLostAt: Date
  reconnectionAttempts: number
  conversationCheckpoint: ConversationTurn[]
  sessionMetadata: {
    modelConfig: string
    responseModalities: string[]
    systemInstruction?: string
  }
  wasUnexpectedDisconnection: boolean
}

/**
 * Conversation turn for history tracking
 */
export interface ConversationTurn {
  id: string
  timestamp: Date
  role: 'user' | 'model'
  content: {
    text?: string
    audio?: {
      mimeType: string
      duration?: number
    }
  }
  turnComplete: boolean
}

/**
 * Session statistics and health information
 */
export interface SessionStats {
  sessionId: string
  state: SessionState
  uptime: number // in milliseconds
  totalMessages: number
  totalTurns: number
  lastActivityTime: Date
  averageResponseTime?: number
  errorCount: number
  resumptionCount: number
}

/**
 * Session creation result
 */
export interface SessionCreationResult {
  success: boolean
  sessionId: string
  config: SessionConfig
  error?: GeminiError
}

/**
 * Session resumption result
 */
export interface SessionResumptionResult {
  success: boolean
  sessionId: string
  contextRestored: boolean
  error?: GeminiError
}

/**
 * Setup message interface for Gemini Live API
 */
export interface SessionSetupMessage {
  setup: {
    model: string
    generationConfig: {
      responseModalities: string[]
    }
    sessionResumption: boolean
    systemInstruction?: {
      parts: Array<{text: string}>
    }
    sessionId?: string
  }
}

/**
 * Custom error types for session management
 */
export enum SessionErrorType {
  INVALID_CONFIG = 'invalid_config',
  CREATION_FAILED = 'creation_failed',
  RESUMPTION_FAILED = 'resumption_failed',
  TERMINATION_FAILED = 'termination_failed',
  INVALID_STATE = 'invalid_state',
  TIMEOUT = 'timeout',
  CONTEXT_LOSS = 'context_loss',
  CONNECTION_LOST = 'connection_lost',
  RESUMPTION_TIMEOUT = 'resumption_timeout',
  CONTEXT_MISMATCH = 'context_mismatch',
  SERVER_REJECTION = 'server_rejection',
  MAX_RETRIES_EXCEEDED = 'max_retries_exceeded',
  CONFIGURATION_CONFLICT = 'configuration_conflict'
}

/**
 * Session-specific error interface
 */
export interface SessionError extends GeminiError {
  sessionId?: string
  sessionState?: SessionState
  sessionErrorType: SessionErrorType
}

/**
 * Session Manager class for comprehensive session lifecycle management
 */
export class SessionManager extends EventEmitter {
  private sessionId: string | null = null
  private state: SessionState = SessionState.TERMINATED
  private config: SessionConfig
  private context: SessionContext
  private errorHandler: GeminiErrorHandler
  private stats: SessionStats
  private sessionTimer: NodeJS.Timeout | null = null
  private responseTimeTracker: Map<string, number> = new Map()
  private readonly maxHistorySize: number

  constructor(config: SessionConfig, errorHandler?: GeminiErrorHandler) {
    super()

    // Validate and set configuration
    this.config = this.validateAndNormalizeConfig(config)
    this.maxHistorySize = this.config.maxConversationHistory || 100

    // Initialize error handler
    this.errorHandler =
      errorHandler ||
      new GeminiErrorHandler({
        maxErrorHistory: 50,
        logLevel: 4 // DEBUG level for session management
      })

    // Initialize session context
    this.context = {
      conversationHistory: [],
      sessionStartTime: new Date(),
      lastActivityTime: new Date(),
      totalMessages: 0,
      totalTurns: 0
    }

    // Initialize session statistics
    this.stats = {
      sessionId: '',
      state: this.state,
      uptime: 0,
      totalMessages: 0,
      totalTurns: 0,
      lastActivityTime: new Date(),
      errorCount: 0,
      resumptionCount: 0
    }

    logger.info('SessionManager initialized', {
      model: this.config.model,
      responseModalities: this.config.responseModalities,
      resumptionEnabled: this.config.resumptionEnabled,
      maxHistorySize: this.maxHistorySize
    })
  }

  /**
   * Create a new session with the configured settings
   */
  async createSession(): Promise<SessionCreationResult> {
    if (this.state !== SessionState.TERMINATED) {
      const error = this.createSessionError(
        SessionErrorType.INVALID_STATE,
        `Cannot create session: current state is ${this.state}`,
        'Session must be terminated before creating a new one'
      )
      return {
        success: false,
        sessionId: '',
        config: this.config,
        error
      }
    }

    this.setState(SessionState.INITIALIZING)

    try {
      // Generate session ID if configured to do so
      if (this.config.generateSessionId) {
        this.sessionId = this.generateSessionId()
      }

      // Reset context and stats for new session
      this.resetSessionContext()
      this.resetSessionStats()

      // Update stats with new session ID
      this.stats.sessionId = this.sessionId || 'server-generated'

      logger.info('Session creation initiated', {
        sessionId: this.sessionId,
        model: this.config.model,
        responseModalities: this.config.responseModalities
      })

      // Session will be marked as ACTIVE when setup message is successfully sent
      // and confirmed by the server

      this.emit('sessionCreating', {
        sessionId: this.sessionId,
        config: this.config
      })

      return {
        success: true,
        sessionId: this.sessionId || 'pending',
        config: this.config
      }
    } catch (error) {
      const sessionError = this.createSessionError(
        SessionErrorType.CREATION_FAILED,
        error instanceof Error ? error.message : 'Unknown session creation error',
        'Failed to create session'
      )

      this.setState(SessionState.ERROR)
      this.stats.errorCount++

      logger.error('Session creation failed', {
        sessionId: this.sessionId,
        error: sessionError.message,
        errorId: sessionError.id
      })

      this.emit('sessionCreationFailed', sessionError)

      return {
        success: false,
        sessionId: this.sessionId || '',
        config: this.config,
        error: sessionError
      }
    }
  }

  /**
   * Configure session parameters (can be called during INITIALIZING or ACTIVE states)
   */
  async configureSession(newConfig: Partial<SessionConfig>): Promise<boolean> {
    if (this.state === SessionState.TERMINATED || this.state === SessionState.ERROR) {
      const error = this.createSessionError(
        SessionErrorType.INVALID_STATE,
        `Cannot configure session: current state is ${this.state}`,
        'Session must be active or initializing to configure'
      )
      this.emit('sessionError', error)
      return false
    }

    try {
      // Validate the new configuration
      const mergedConfig = {...this.config, ...newConfig}
      const validatedConfig = this.validateAndNormalizeConfig(mergedConfig)

      // Update configuration
      this.config = validatedConfig

      logger.info('Session configuration updated', {
        sessionId: this.sessionId,
        changes: sanitizeLogMessage(JSON.stringify(newConfig))
      })

      this.emit('sessionConfigured', {
        sessionId: this.sessionId,
        config: this.config,
        changes: newConfig
      })

      return true
    } catch (error) {
      const sessionError = this.createSessionError(
        SessionErrorType.INVALID_CONFIG,
        error instanceof Error ? error.message : 'Configuration validation failed',
        'Failed to configure session'
      )

      this.stats.errorCount++

      logger.error('Session configuration failed', {
        sessionId: this.sessionId,
        error: sessionError.message,
        errorId: sessionError.id
      })

      this.emit('sessionError', sessionError)
      return false
    }
  }

  /**
   * Resume a session after disconnection or server reset
   */
  async resumeSession(previousSessionId?: string): Promise<SessionResumptionResult> {
    if (this.state === SessionState.ACTIVE) {
      const error = this.createSessionError(
        SessionErrorType.INVALID_STATE,
        'Session is already active',
        'Cannot resume an active session'
      )
      return {
        success: false,
        sessionId: this.sessionId || '',
        contextRestored: false,
        error
      }
    }

    this.setState(SessionState.RESUMING)

    try {
      // Use provided session ID or current session ID
      const targetSessionId = previousSessionId || this.sessionId

      if (!targetSessionId) {
        throw new Error('No session ID available for resumption')
      }

      this.sessionId = targetSessionId
      this.stats.sessionId = targetSessionId
      this.stats.resumptionCount++

      logger.info('Session resumption initiated', {
        sessionId: this.sessionId,
        hasContext: this.context.conversationHistory.length > 0,
        previousTurns: this.context.totalTurns
      })

      // Context restoration is handled when the server confirms resumption
      // For now, we assume context is preserved locally
      const contextRestored = this.context.conversationHistory.length > 0

      this.emit('sessionResuming', {
        sessionId: this.sessionId,
        contextRestored,
        conversationTurns: this.context.totalTurns
      })

      return {
        success: true,
        sessionId: this.sessionId,
        contextRestored
      }
    } catch (error) {
      const sessionError = this.createSessionError(
        SessionErrorType.RESUMPTION_FAILED,
        error instanceof Error ? error.message : 'Unknown resumption error',
        'Failed to resume session'
      )

      this.setState(SessionState.ERROR)
      this.stats.errorCount++

      logger.error('Session resumption failed', {
        sessionId: this.sessionId,
        error: sessionError.message,
        errorId: sessionError.id
      })

      this.emit('sessionResumptionFailed', sessionError)

      return {
        success: false,
        sessionId: this.sessionId || '',
        contextRestored: false,
        error: sessionError
      }
    }
  }

  /**
   * Prepare resumption context for unexpected disconnection
   */
  prepareResumptionContext(connectionLostAt?: Date): SessionResumptionContext {
    const now = connectionLostAt || new Date()

    // Create a checkpoint of the conversation at this point
    const conversationCheckpoint = [...this.context.conversationHistory]

    const resumptionContext: SessionResumptionContext = {
      lastKnownMessageId: this.context.lastMessageId,
      lastServerResponseId: this.context.lastServerTurnId,
      connectionLostAt: now,
      reconnectionAttempts: 0,
      conversationCheckpoint,
      sessionMetadata: {
        modelConfig: this.config.model,
        responseModalities: this.config.responseModalities,
        systemInstruction: this.config.systemInstruction
      },
      wasUnexpectedDisconnection: true
    }

    // Store the resumption context
    this.context.resumptionContext = resumptionContext

    logger.info('Resumption context prepared', {
      sessionId: this.sessionId,
      connectionLostAt: now,
      conversationTurns: conversationCheckpoint.length,
      lastMessageId: resumptionContext.lastKnownMessageId
    })

    return resumptionContext
  }

  /**
   * Check if session needs resumption (e.g., after unexpected disconnection)
   */
  needsResumption(): boolean {
    return !!(
      this.context.resumptionContext?.wasUnexpectedDisconnection &&
      this.state !== SessionState.ACTIVE &&
      this.state !== SessionState.TERMINATED
    )
  }

  /**
   * Get resumption readiness status
   */
  getResumptionStatus(): {
    canResume: boolean
    reason?: string
    context?: SessionResumptionContext
  } {
    if (!this.sessionId) {
      return {canResume: false, reason: 'No session ID available'}
    }

    if (this.state === SessionState.TERMINATED) {
      return {canResume: false, reason: 'Session is terminated'}
    }

    if (this.state === SessionState.ACTIVE) {
      return {canResume: false, reason: 'Session is already active'}
    }

    if (!this.context.resumptionContext) {
      return {canResume: false, reason: 'No resumption context available'}
    }

    // Check if too much time has passed
    const timeSinceDisconnection =
      Date.now() - this.context.resumptionContext.connectionLostAt.getTime()
    const maxResumptionTime = this.config.sessionTimeout || 300000 // 5 minutes default

    if (timeSinceDisconnection > maxResumptionTime) {
      return {
        canResume: false,
        reason: `Too much time passed since disconnection (${timeSinceDisconnection}ms > ${maxResumptionTime}ms)`
      }
    }

    return {
      canResume: true,
      context: this.context.resumptionContext
    }
  }

  /**
   * Enhanced resumeSession with automatic context detection
   */
  async resumeSessionWithContext(
    previousSessionId?: string,
    forceResume = false
  ): Promise<SessionResumptionResult> {
    const resumptionStatus = this.getResumptionStatus()

    if (!forceResume && !resumptionStatus.canResume) {
      const error = this.createSessionError(
        SessionErrorType.INVALID_STATE,
        resumptionStatus.reason || 'Session cannot be resumed',
        'Session resumption not possible'
      )
      return {
        success: false,
        sessionId: this.sessionId || '',
        contextRestored: false,
        error
      }
    }

    // Increment reconnection attempts
    if (this.context.resumptionContext) {
      this.context.resumptionContext.reconnectionAttempts++
    }

    logger.info('Starting session resumption with context', {
      sessionId: this.sessionId,
      previousSessionId,
      forceResume,
      reconnectionAttempts: this.context.resumptionContext?.reconnectionAttempts || 0
    })

    // Use the standard resumeSession method
    const result = await this.resumeSession(previousSessionId)

    // If successful, restore additional context
    if (result.success && this.context.resumptionContext) {
      // Mark as no longer needing resumption
      this.context.resumptionContext.wasUnexpectedDisconnection = false

      logger.info('Session resumption with context completed', {
        sessionId: result.sessionId,
        contextRestored: result.contextRestored,
        reconnectionAttempts: this.context.resumptionContext.reconnectionAttempts
      })

      this.emit('sessionResumedWithContext', {
        sessionId: result.sessionId,
        resumptionContext: this.context.resumptionContext,
        contextRestored: result.contextRestored
      })
    }

    return result
  }

  /**
   * Handle unexpected disconnection and prepare for resumption
   */
  handleUnexpectedDisconnection(reason?: string): SessionResumptionContext {
    if (this.state === SessionState.TERMINATED) {
      logger.warn('Handling disconnection but session already terminated', {
        sessionId: this.sessionId,
        reason
      })
    }

    const previousState = this.state
    this.setState(SessionState.ERROR)

    // Prepare resumption context
    const resumptionContext = this.prepareResumptionContext()

    // Track the error
    this.stats.errorCount++

    const disconnectionError = this.createSessionError(
      SessionErrorType.CONNECTION_LOST,
      reason || 'Unexpected disconnection occurred',
      'Connection to server was lost unexpectedly'
    )

    logger.error('Unexpected disconnection handled', {
      sessionId: this.sessionId,
      previousState,
      reason,
      errorId: disconnectionError.id,
      conversationTurns: resumptionContext.conversationCheckpoint.length
    })

    this.emit('sessionConnectionLost', {
      sessionId: this.sessionId,
      reason: reason || 'Unknown',
      resumptionContext,
      error: disconnectionError,
      canResume: this.needsResumption()
    })

    return resumptionContext
  }

  /**
   * Handle resumption failure with retry logic
   */
  async handleResumptionFailure(error: Error, canRetry = true): Promise<void> {
    const resumptionContext = this.context.resumptionContext

    if (!resumptionContext) {
      logger.error('Resumption failure without context', {
        sessionId: this.sessionId,
        error: error.message
      })
      return
    }

    resumptionContext.reconnectionAttempts++

    const sessionError = this.createSessionError(
      SessionErrorType.RESUMPTION_FAILED,
      error.message,
      `Session resumption failed (attempt ${resumptionContext.reconnectionAttempts})`
    )

    logger.error('Session resumption failure', {
      sessionId: this.sessionId,
      attempt: resumptionContext.reconnectionAttempts,
      error: sessionError.message,
      errorId: sessionError.id,
      canRetry
    })

    // Check if we've exceeded max retries
    const maxRetries = 3 // configurable
    if (resumptionContext.reconnectionAttempts >= maxRetries) {
      const maxRetriesError = this.createSessionError(
        SessionErrorType.MAX_RETRIES_EXCEEDED,
        `Maximum resumption attempts exceeded (${maxRetries})`,
        'Session cannot be resumed due to repeated failures'
      )

      this.setState(SessionState.TERMINATED)
      this.emit('sessionResumptionAbandoned', {
        sessionId: this.sessionId,
        error: maxRetriesError,
        totalAttempts: resumptionContext.reconnectionAttempts
      })

      return
    }

    if (canRetry) {
      this.emit('sessionResumptionRetry', {
        sessionId: this.sessionId,
        attempt: resumptionContext.reconnectionAttempts,
        error: sessionError,
        nextRetryIn: this.calculateRetryDelay(resumptionContext.reconnectionAttempts)
      })
    } else {
      this.emit('sessionResumptionFailed', sessionError)
    }
  }

  /**
   * Calculate exponential backoff delay for retry attempts
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000 // 1 second
    const maxDelay = 30000 // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay
    return Math.floor(delay + jitter)
  }

  /**
   * Clear resumption context (call when session is properly active)
   */
  clearResumptionContext(): void {
    if (this.context.resumptionContext) {
      logger.debug('Clearing resumption context', {
        sessionId: this.sessionId,
        reconnectionAttempts: this.context.resumptionContext.reconnectionAttempts
      })

      this.context.resumptionContext = undefined
    }
  }

  /**
   * Terminate the current session and clean up resources
   */
  async terminateSession(): Promise<boolean> {
    if (this.state === SessionState.TERMINATED) {
      logger.debug('Session already terminated', {sessionId: this.sessionId})
      return true
    }

    this.setState(SessionState.TERMINATING)

    try {
      logger.info('Session termination initiated', {
        sessionId: this.sessionId,
        totalMessages: this.stats.totalMessages,
        uptime: this.calculateUptime()
      })

      // Clear session timer
      if (this.sessionTimer) {
        clearTimeout(this.sessionTimer)
        this.sessionTimer = null
      }

      // Update final stats
      this.stats.uptime = this.calculateUptime()

      this.emit('sessionTerminating', {
        sessionId: this.sessionId,
        stats: this.getSessionStats()
      })

      // Mark as terminated
      this.setState(SessionState.TERMINATED)

      logger.info('Session terminated successfully', {
        sessionId: this.sessionId,
        finalStats: this.stats
      })

      this.emit('sessionTerminated', {
        sessionId: this.sessionId,
        stats: this.getSessionStats()
      })

      return true
    } catch (error) {
      const sessionError = this.createSessionError(
        SessionErrorType.TERMINATION_FAILED,
        error instanceof Error ? error.message : 'Unknown termination error',
        'Failed to terminate session cleanly'
      )

      this.setState(SessionState.ERROR)
      this.stats.errorCount++

      logger.error('Session termination failed', {
        sessionId: this.sessionId,
        error: sessionError.message,
        errorId: sessionError.id
      })

      this.emit('sessionError', sessionError)
      return false
    }
  }

  /**
   * Mark session as active (called when setup is confirmed by server)
   */
  markSessionActive(serverSessionId?: string): void {
    if (this.state !== SessionState.INITIALIZING && this.state !== SessionState.RESUMING) {
      logger.warn('Unexpected session activation', {
        currentState: this.state,
        sessionId: this.sessionId
      })
    }

    // Use server-provided session ID if available
    if (serverSessionId) {
      this.sessionId = serverSessionId
      this.stats.sessionId = serverSessionId
    }

    this.setState(SessionState.ACTIVE)
    this.context.sessionStartTime = new Date()
    this.updateLastActivity()

    // Set session timeout if configured
    if (this.config.sessionTimeout) {
      this.sessionTimer = setTimeout(() => {
        this.handleSessionTimeout()
      }, this.config.sessionTimeout)
    }

    logger.info('Session marked as active', {
      sessionId: this.sessionId,
      responseModalities: this.config.responseModalities
    })

    this.emit('sessionActive', {
      sessionId: this.sessionId,
      config: this.config
    })
  }

  /**
   * Pause the session (when connection is lost but resumable)
   */
  pauseSession(): void {
    if (this.state === SessionState.ACTIVE) {
      this.setState(SessionState.PAUSED)

      logger.info('Session paused', {
        sessionId: this.sessionId,
        reason: 'Connection lost'
      })

      this.emit('sessionPaused', {
        sessionId: this.sessionId,
        context: this.getSessionContext()
      })
    }
  }

  /**
   * Add a conversation turn to the session context
   */
  addConversationTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): void {
    const fullTurn: ConversationTurn = {
      id: this.generateTurnId(),
      timestamp: new Date(),
      ...turn
    }

    this.context.conversationHistory.push(fullTurn)
    this.context.totalTurns++
    this.stats.totalTurns++

    // Trim history if it exceeds max size
    if (this.context.conversationHistory.length > this.maxHistorySize) {
      const removed = this.context.conversationHistory.splice(
        0,
        this.context.conversationHistory.length - this.maxHistorySize
      )
      logger.debug('Trimmed conversation history', {
        sessionId: this.sessionId,
        removedTurns: removed.length,
        remainingTurns: this.context.conversationHistory.length
      })
    }

    this.updateLastActivity()

    this.emit('conversationTurn', {
      sessionId: this.sessionId,
      turn: fullTurn,
      totalTurns: this.context.totalTurns
    })
  }

  /**
   * Track message sent/received for statistics
   */
  trackMessage(messageId: string, isOutgoing: boolean): void {
    this.context.totalMessages++
    this.stats.totalMessages++

    if (isOutgoing) {
      // Start tracking response time
      this.responseTimeTracker.set(messageId, Date.now())
    } else {
      // Calculate response time if we have a matching outgoing message
      if (this.responseTimeTracker.has(messageId)) {
        const responseTime = Date.now() - this.responseTimeTracker.get(messageId)!
        this.responseTimeTracker.delete(messageId)
        this.updateAverageResponseTime(responseTime)
      }
    }

    this.updateLastActivity()

    this.emit('messageTracked', {
      sessionId: this.sessionId,
      messageId,
      isOutgoing,
      totalMessages: this.stats.totalMessages
    })
  }

  /**
   * Get current session state
   */
  getSessionState(): SessionState {
    return this.state
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId
  }

  /**
   * Get session configuration
   */
  getSessionConfig(): SessionConfig {
    return {...this.config}
  }

  /**
   * Get session context for resumption
   */
  getSessionContext(): SessionContext {
    return {
      ...this.context,
      conversationHistory: [...this.context.conversationHistory]
    }
  }

  /**
   * Get session statistics and health information
   */
  getSessionStats(): SessionStats {
    return {
      ...this.stats,
      uptime: this.calculateUptime(),
      state: this.state
    }
  }

  /**
   * Check if session is in a healthy state
   */
  isSessionHealthy(): boolean {
    const now = Date.now()
    const timeSinceLastActivity = now - this.context.lastActivityTime.getTime()
    const timeout = this.config.sessionTimeout || 300000 // 5 minutes default

    return (
      this.state === SessionState.ACTIVE &&
      timeSinceLastActivity < timeout &&
      this.stats.errorCount < 10
    ) // Arbitrary threshold
  }

  /**
   * Get session setup message for WebSocket
   */
  getSetupMessage(): SessionSetupMessage {
    const setupMessage: SessionSetupMessage = {
      setup: {
        model: `models/${this.config.model}`,
        generationConfig: {
          responseModalities: this.config.responseModalities
        },
        sessionResumption: this.config.resumptionEnabled
      }
    }

    // Add system instruction if configured
    if (this.config.systemInstruction) {
      setupMessage.setup.systemInstruction = {
        parts: [{text: this.config.systemInstruction}]
      }
    }

    // Add session ID if we have one
    if (this.sessionId && this.config.generateSessionId) {
      setupMessage.setup.sessionId = this.sessionId
    }

    return setupMessage
  }

  /**
   * Handle session timeout
   */
  private handleSessionTimeout(): void {
    logger.warn('Session timeout detected', {
      sessionId: this.sessionId,
      timeout: this.config.sessionTimeout
    })

    const error = this.createSessionError(
      SessionErrorType.TIMEOUT,
      'Session timed out due to inactivity',
      'Session exceeded maximum allowed inactive time'
    )

    this.setState(SessionState.ERROR)
    this.stats.errorCount++

    this.emit('sessionTimeout', {
      sessionId: this.sessionId,
      error
    })
  }

  /**
   * Validate and normalize session configuration
   */
  private validateAndNormalizeConfig(config: SessionConfig): SessionConfig {
    if (!config.model) {
      throw new Error('Session model is required')
    }

    if (!config.responseModalities || config.responseModalities.length === 0) {
      throw new Error('At least one response modality is required')
    }

    // Validate model name
    if (!config.model.includes('gemini')) {
      throw new Error('Model must be a Gemini model')
    }

    // Validate response modalities
    const validModalities = ['TEXT', 'AUDIO']
    for (const modality of config.responseModalities) {
      if (!validModalities.includes(modality.toUpperCase())) {
        throw new Error(`Invalid response modality: ${modality}`)
      }
    }

    // Normalize and set defaults
    return {
      model: config.model,
      responseModalities: config.responseModalities.map(m => m.toUpperCase()),
      systemInstruction: config.systemInstruction,
      language: config.language || 'en',
      audioSettings: config.audioSettings || {
        sampleRate: 16000,
        encoding: 'pcm',
        channels: 1,
        bitDepth: 16
      },
      resumptionEnabled: config.resumptionEnabled !== false, // Default to true
      sessionTimeout: config.sessionTimeout || 1800000, // 30 minutes default
      maxConversationHistory: config.maxConversationHistory || 100,
      generateSessionId: config.generateSessionId !== false // Default to true
    }
  }

  /**
   * Set session state and emit state change event
   */
  private setState(newState: SessionState): void {
    if (this.state !== newState) {
      const previousState = this.state
      this.state = newState
      this.stats.state = newState

      logger.debug('Session state changed', {
        sessionId: this.sessionId,
        previousState,
        newState
      })

      this.emit('sessionStateChange', {
        sessionId: this.sessionId,
        previousState,
        newState
      })
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 15)
    return `session_${timestamp}_${random}`
  }

  /**
   * Generate a unique turn ID
   */
  private generateTurnId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    return `turn_${timestamp}_${random}`
  }

  /**
   * Reset session context for new session
   */
  private resetSessionContext(): void {
    this.context = {
      conversationHistory: [],
      sessionStartTime: new Date(),
      lastActivityTime: new Date(),
      totalMessages: 0,
      totalTurns: 0
    }
  }

  /**
   * Reset session statistics for new session
   */
  private resetSessionStats(): void {
    this.stats = {
      sessionId: this.sessionId || '',
      state: this.state,
      uptime: 0,
      totalMessages: 0,
      totalTurns: 0,
      lastActivityTime: new Date(),
      errorCount: 0,
      resumptionCount: 0
    }

    // Clear response time tracking
    this.responseTimeTracker.clear()
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    this.context.lastActivityTime = new Date()
    this.stats.lastActivityTime = new Date()
  }

  /**
   * Calculate session uptime in milliseconds
   */
  private calculateUptime(): number {
    return Date.now() - this.context.sessionStartTime.getTime()
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(responseTime: number): void {
    if (this.stats.averageResponseTime === undefined) {
      this.stats.averageResponseTime = responseTime
    } else {
      // Simple moving average with weight towards recent responses
      this.stats.averageResponseTime = this.stats.averageResponseTime * 0.8 + responseTime * 0.2
    }
  }

  /**
   * Create a session-specific error
   */
  private createSessionError(
    sessionErrorType: SessionErrorType,
    message: string,
    userMessage: string
  ): SessionError {
    const baseError = this.errorHandler.handleError(
      new Error(message),
      {
        sessionId: this.sessionId,
        sessionState: this.state,
        sessionErrorType
      },
      {
        type: ErrorType.API,
        retryable: sessionErrorType !== SessionErrorType.INVALID_CONFIG
      }
    )

    return {
      ...baseError,
      sessionId: this.sessionId || undefined,
      sessionState: this.state,
      sessionErrorType,
      userMessage
    } as SessionError
  }

  /**
   * Cleanup and destroy the session manager
   */
  async destroy(): Promise<void> {
    if (this.state !== SessionState.TERMINATED) {
      await this.terminateSession()
    }

    // Clear all timers
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }

    // Clear tracking maps
    this.responseTimeTracker.clear()

    // Remove all listeners
    this.removeAllListeners()

    logger.info('SessionManager destroyed', {
      sessionId: this.sessionId
    })
  }
}

/**
 * Factory function for creating SessionManager instances
 */
export function createSessionManager(
  config: SessionConfig,
  errorHandler?: GeminiErrorHandler
): SessionManager {
  return new SessionManager(config, errorHandler)
}

/**
 * Default session configurations for common use cases
 */
export const DefaultSessionConfigs = {
  /**
   * Real-time audio conversation
   */
  audioConversation: (): SessionConfig => ({
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: ['AUDIO'],
    systemInstruction: 'You are a helpful voice assistant. Respond naturally and conversationally.',
    language: 'en',
    audioSettings: {
      sampleRate: 16000,
      encoding: 'pcm',
      channels: 1,
      bitDepth: 16,
      enableVAD: true
    },
    resumptionEnabled: true,
    sessionTimeout: 1800000, // 30 minutes
    maxConversationHistory: 50,
    generateSessionId: true
  }),

  /**
   * Text-based conversation
   */
  textConversation: (): SessionConfig => ({
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: ['TEXT'],
    systemInstruction: 'You are a helpful text-based assistant.',
    language: 'en',
    resumptionEnabled: true,
    sessionTimeout: 3600000, // 1 hour
    maxConversationHistory: 100,
    generateSessionId: true
  }),

  /**
   * Multimodal conversation (text and audio)
   */
  multimodalConversation: (): SessionConfig => ({
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: ['TEXT', 'AUDIO'],
    systemInstruction: 'You are a helpful assistant that can respond with both text and audio.',
    language: 'en',
    audioSettings: {
      sampleRate: 16000,
      encoding: 'pcm',
      channels: 1,
      bitDepth: 16
    },
    resumptionEnabled: true,
    sessionTimeout: 1800000, // 30 minutes
    maxConversationHistory: 75,
    generateSessionId: true
  })
}
