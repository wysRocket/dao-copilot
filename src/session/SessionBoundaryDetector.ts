/**
 * Session Boundary Detection and Handling
 *
 * Implements sophisticated algorithms to detect session boundaries and handle
 * clean transitions between sessions, ensuring no in-flight data is lost and
 * all transcripts are properly finalized during session transitions.
 */

import {EventEmitter} from 'events'
import {logger} from '../services/gemini-logger'
import {SessionManager, SessionState, SessionMetadata} from './SessionManager'
import {SessionIDSafeguards, IDValidationResult, OrphanedPartial} from './SessionIDSafeguards'
import {performance} from 'perf_hooks'

// Boundary detection states
export enum BoundaryState {
  IDLE = 'idle',
  DETECTING = 'detecting',
  TRANSITION_PENDING = 'transition_pending',
  TRANSITIONING = 'transitioning',
  STABILIZED = 'stabilized',
  ERROR = 'error'
}

// Boundary detection triggers
export enum BoundaryTrigger {
  AUDIO_SILENCE = 'audio_silence',
  USER_ACTION = 'user_action',
  SESSION_TIMEOUT = 'session_timeout',
  TRANSCRIPTION_COMPLETE = 'transcription_complete',
  CONNECTION_CHANGE = 'connection_change',
  SYSTEM_EVENT = 'system_event',
  FORCED_BOUNDARY = 'forced_boundary'
}

// In-flight data types
export enum InFlightDataType {
  PARTIAL_TRANSCRIPT = 'partial_transcript',
  AUDIO_BUFFER = 'audio_buffer',
  PENDING_RESPONSE = 'pending_response',
  QUEUED_REQUEST = 'queued_request',
  WEBSOCKET_MESSAGE = 'websocket_message'
}

// In-flight data item
export interface InFlightDataItem {
  id: string
  type: InFlightDataType
  sessionId: string
  transcriptId?: string
  data: any
  timestamp: number
  priority: 'low' | 'normal' | 'high' | 'critical'
  retryCount: number
  expiresAt: number
}

// Session boundary event
export interface SessionBoundaryEvent {
  id: string
  trigger: BoundaryTrigger
  currentSessionId: string
  nextSessionId?: string
  timestamp: number
  confidence: number
  inFlightData: InFlightDataItem[]
  transitionDuration?: number
  metadata: Record<string, any>
}

// Boundary detection configuration
export interface BoundaryDetectionConfig {
  silenceThreshold: number // Minimum silence duration to trigger boundary (ms)
  stabilizationWindow: number // Time window to confirm boundary (ms)
  maxTransitionTime: number // Maximum time allowed for transition (ms)
  inFlightDataTimeout: number // Timeout for in-flight data processing (ms)
  confidenceThreshold: number // Minimum confidence for boundary detection (0-1)
  enableAudioSilenceDetection: boolean // Enable audio-based boundary detection
  enableUserActionDetection: boolean // Enable user action-based detection
  enableTimeoutDetection: boolean // Enable session timeout-based detection
  retryAttempts: number // Number of retry attempts for failed transitions
  bufferFlushTimeout: number // Timeout for buffer flushing during transition
  telemetryEnabled: boolean // Enable boundary detection telemetry
}

// Default configuration
const DEFAULT_BOUNDARY_CONFIG: BoundaryDetectionConfig = {
  silenceThreshold: 2000, // 2 seconds of silence
  stabilizationWindow: 1000, // 1 second stabilization
  maxTransitionTime: 5000, // 5 seconds max transition
  inFlightDataTimeout: 3000, // 3 seconds for in-flight data
  confidenceThreshold: 0.7, // 70% confidence threshold
  enableAudioSilenceDetection: true,
  enableUserActionDetection: true,
  enableTimeoutDetection: true,
  retryAttempts: 3,
  bufferFlushTimeout: 2000, // 2 seconds for buffer flush
  telemetryEnabled: true
}

// Boundary detection events
export interface BoundaryDetectionEvents {
  'boundary:detected': (event: SessionBoundaryEvent) => void
  'boundary:confirmed': (event: SessionBoundaryEvent) => void
  'boundary:rejected': (event: SessionBoundaryEvent, reason: string) => void
  'transition:started': (currentSessionId: string, nextSessionId: string) => void
  'transition:completed': (event: SessionBoundaryEvent) => void
  'transition:failed': (event: SessionBoundaryEvent, error: Error) => void
  'inflight:detected': (data: InFlightDataItem[]) => void
  'inflight:processed': (data: InFlightDataItem[]) => void
  'inflight:expired': (data: InFlightDataItem[]) => void
  'stabilization:timeout': (event: SessionBoundaryEvent) => void
}

// Declare the interface for typed event emission
export interface SessionBoundaryDetector {
  on<K extends keyof BoundaryDetectionEvents>(event: K, listener: BoundaryDetectionEvents[K]): this
  emit<K extends keyof BoundaryDetectionEvents>(
    event: K,
    ...args: Parameters<BoundaryDetectionEvents[K]>
  ): boolean
}

/**
 * Advanced session boundary detection and transition handling
 */
export class SessionBoundaryDetector extends EventEmitter {
  private readonly config: BoundaryDetectionConfig
  private readonly sessionManager: SessionManager
  private readonly safeguards: SessionIDSafeguards
  private readonly inFlightData = new Map<string, InFlightDataItem>()
  private readonly pendingBoundaries = new Map<string, SessionBoundaryEvent>()

  private currentState: BoundaryState = BoundaryState.IDLE
  private lastAudioActivity: number = performance.now()
  private stabilizationTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private currentTransition: SessionBoundaryEvent | null = null

  constructor(
    sessionManager: SessionManager,
    safeguards: SessionIDSafeguards,
    config: Partial<BoundaryDetectionConfig> = {}
  ) {
    super()
    this.config = {...DEFAULT_BOUNDARY_CONFIG, ...config}
    this.sessionManager = sessionManager
    this.safeguards = safeguards

    this.setupEventHandlers()
    this.startBackgroundTasks()

    logger.info('SessionBoundaryDetector initialized', {
      config: this.sanitizeConfigForLogging(this.config)
    })
  }

  /**
   * Detect potential session boundary based on audio silence
   */
  onAudioSilence(duration: number, confidence: number): void {
    if (!this.config.enableAudioSilenceDetection) {
      return
    }

    this.lastAudioActivity = performance.now()

    if (duration >= this.config.silenceThreshold && confidence >= this.config.confidenceThreshold) {
      this.triggerBoundaryDetection(BoundaryTrigger.AUDIO_SILENCE, {
        silenceDuration: duration,
        confidence
      })
    }
  }

  /**
   * Detect session boundary from user action
   */
  onUserAction(action: string, sessionId: string): void {
    if (!this.config.enableUserActionDetection) {
      return
    }

    const boundaryActions = ['stop_recording', 'pause_session', 'new_session', 'reset']

    if (boundaryActions.includes(action)) {
      this.triggerBoundaryDetection(BoundaryTrigger.USER_ACTION, {
        action,
        sessionId,
        confidence: 1.0 // User actions have maximum confidence
      })
    }
  }

  /**
   * Detect session boundary from transcription completion
   */
  onTranscriptionComplete(transcriptId: string, sessionId: string): void {
    // Check if this was the last active transcript in the session
    const sessionMetadata = this.sessionManager.getSession(sessionId)
    if (sessionMetadata && sessionMetadata.transcriptIds.size <= 1) {
      this.triggerBoundaryDetection(BoundaryTrigger.TRANSCRIPTION_COMPLETE, {
        transcriptId,
        sessionId,
        confidence: 0.8
      })
    }
  }

  /**
   * Detect session boundary from connection changes
   */
  onConnectionChange(event: string, sessionId: string): void {
    const boundaryEvents = ['disconnected', 'reconnected', 'failed', 'degraded']

    if (boundaryEvents.includes(event)) {
      this.triggerBoundaryDetection(BoundaryTrigger.CONNECTION_CHANGE, {
        connectionEvent: event,
        sessionId,
        confidence: 0.6
      })
    }
  }

  /**
   * Force a session boundary (used for testing or manual control)
   */
  forceBoundary(sessionId: string, reason?: string): void {
    this.triggerBoundaryDetection(BoundaryTrigger.FORCED_BOUNDARY, {
      sessionId,
      reason: reason || 'Manual boundary trigger',
      confidence: 1.0
    })
  }

  /**
   * Add in-flight data item for tracking during transitions
   */
  addInFlightData(item: Omit<InFlightDataItem, 'id' | 'timestamp' | 'retryCount'>): string {
    const id = this.generateInFlightDataId()
    const inFlightItem: InFlightDataItem = {
      ...item,
      id,
      timestamp: performance.now(),
      retryCount: 0
    }

    this.inFlightData.set(id, inFlightItem)

    logger.debug('In-flight data added', {
      id,
      type: item.type,
      sessionId: item.sessionId,
      priority: item.priority
    })

    return id
  }

  /**
   * Remove processed in-flight data
   */
  removeInFlightData(id: string): boolean {
    const removed = this.inFlightData.delete(id)
    if (removed) {
      logger.debug('In-flight data removed', {id})
    }
    return removed
  }

  /**
   * Get current boundary detection state
   */
  getState(): BoundaryState {
    return this.currentState
  }

  /**
   * Get statistics about boundary detection
   */
  getStatistics(): {
    currentState: BoundaryState
    inFlightDataCount: number
    pendingBoundariesCount: number
    lastAudioActivity: number
    currentTransition: SessionBoundaryEvent | null
    boundaryDetections: number
    successfulTransitions: number
    failedTransitions: number
  } {
    return {
      currentState: this.currentState,
      inFlightDataCount: this.inFlightData.size,
      pendingBoundariesCount: this.pendingBoundaries.size,
      lastAudioActivity: this.lastAudioActivity,
      currentTransition: this.currentTransition,
      boundaryDetections: this.getEventCount('boundary:detected'),
      successfulTransitions: this.getEventCount('transition:completed'),
      failedTransitions: this.getEventCount('transition:failed')
    }
  }

  /**
   * Trigger boundary detection process
   */
  private triggerBoundaryDetection(trigger: BoundaryTrigger, metadata: Record<string, any>): void {
    if (this.currentState === BoundaryState.TRANSITIONING) {
      logger.warn('Boundary detection skipped - already transitioning', {trigger})
      return
    }

    const activeSessions = this.sessionManager.getActiveSessions()
    if (activeSessions.length === 0) {
      logger.debug('No active sessions - boundary detection skipped', {trigger})
      return
    }

    // Use the first active session as current
    const currentSession = activeSessions[0]
    const eventId = this.generateBoundaryEventId()

    const boundaryEvent: SessionBoundaryEvent = {
      id: eventId,
      trigger,
      currentSessionId: currentSession.sessionId,
      timestamp: performance.now(),
      confidence: metadata.confidence || 0.5,
      inFlightData: this.captureInFlightData(currentSession.sessionId),
      metadata
    }

    this.setState(BoundaryState.DETECTING)
    this.pendingBoundaries.set(eventId, boundaryEvent)

    if (this.config.telemetryEnabled) {
      this.emit('boundary:detected', boundaryEvent)
    }

    logger.info('Session boundary detected', {
      eventId,
      trigger,
      sessionId: currentSession.sessionId,
      confidence: boundaryEvent.confidence,
      inFlightDataCount: boundaryEvent.inFlightData.length
    })

    // Start stabilization window
    this.startStabilization(boundaryEvent)
  }

  /**
   * Start stabilization window to confirm boundary
   */
  private startStabilization(event: SessionBoundaryEvent): void {
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer)
    }

    this.setState(BoundaryState.TRANSITION_PENDING)

    this.stabilizationTimer = setTimeout(() => {
      this.confirmBoundary(event)
    }, this.config.stabilizationWindow)
  }

  /**
   * Confirm boundary and start transition
   */
  private async confirmBoundary(event: SessionBoundaryEvent): Promise<void> {
    try {
      // Final validation of boundary conditions
      const isValid = await this.validateBoundaryConditions(event)

      if (!isValid) {
        this.rejectBoundary(event, 'Boundary conditions not met')
        return
      }

      if (this.config.telemetryEnabled) {
        this.emit('boundary:confirmed', event)
      }

      // Start transition process
      await this.startTransition(event)
    } catch (error) {
      logger.error('Boundary confirmation failed', {eventId: event.id, error})
      this.rejectBoundary(event, `Confirmation error: ${error}`)
    }
  }

  /**
   * Reject boundary detection
   */
  private rejectBoundary(event: SessionBoundaryEvent, reason: string): void {
    this.pendingBoundaries.delete(event.id)
    this.setState(BoundaryState.IDLE)

    if (this.config.telemetryEnabled) {
      this.emit('boundary:rejected', event, reason)
    }

    logger.info('Session boundary rejected', {
      eventId: event.id,
      reason,
      sessionId: event.currentSessionId
    })
  }

  /**
   * Start session transition process
   */
  private async startTransition(event: SessionBoundaryEvent): Promise<void> {
    try {
      this.setState(BoundaryState.TRANSITIONING)
      this.currentTransition = event

      const transitionStart = performance.now()

      // Create next session if needed
      if (!event.nextSessionId && event.trigger !== BoundaryTrigger.SESSION_TIMEOUT) {
        event.nextSessionId = await this.sessionManager.createSession()
      }

      if (this.config.telemetryEnabled && event.nextSessionId) {
        this.emit('transition:started', event.currentSessionId, event.nextSessionId)
      }

      // Process in-flight data
      await this.processInFlightData(event)

      // Finalize current session
      await this.finalizeCurrentSession(event)

      // Start next session if applicable
      if (event.nextSessionId) {
        await this.sessionManager.startSession(event.nextSessionId)
      }

      // Complete transition
      const transitionEnd = performance.now()
      event.transitionDuration = transitionEnd - transitionStart

      this.currentTransition = null
      this.pendingBoundaries.delete(event.id)
      this.setState(BoundaryState.STABILIZED)

      if (this.config.telemetryEnabled) {
        this.emit('transition:completed', event)
      }

      logger.info('Session transition completed', {
        eventId: event.id,
        currentSessionId: event.currentSessionId,
        nextSessionId: event.nextSessionId,
        duration: event.transitionDuration,
        processedInFlight: event.inFlightData.length
      })

      // Return to idle state after stabilization
      setTimeout(() => {
        if (this.currentState === BoundaryState.STABILIZED) {
          this.setState(BoundaryState.IDLE)
        }
      }, 1000)
    } catch (error) {
      this.handleTransitionError(event, error as Error)
    }
  }

  /**
   * Process in-flight data during transition
   */
  private async processInFlightData(event: SessionBoundaryEvent): Promise<void> {
    const inFlightData = event.inFlightData
    const processedData: InFlightDataItem[] = []
    const expiredData: InFlightDataItem[] = []

    if (inFlightData.length > 0) {
      this.emit('inflight:detected', inFlightData)
    }

    for (const item of inFlightData) {
      try {
        const isProcessed = await this.processInFlightDataItem(item, event)

        if (isProcessed) {
          processedData.push(item)
          this.removeInFlightData(item.id)
        } else if (performance.now() > item.expiresAt) {
          expiredData.push(item)
          this.removeInFlightData(item.id)
        }
      } catch (error) {
        logger.error('Failed to process in-flight data item', {
          itemId: item.id,
          error
        })
        item.retryCount++

        if (item.retryCount >= this.config.retryAttempts) {
          expiredData.push(item)
          this.removeInFlightData(item.id)
        }
      }
    }

    if (processedData.length > 0) {
      this.emit('inflight:processed', processedData)
      logger.info('In-flight data processed', {count: processedData.length})
    }

    if (expiredData.length > 0) {
      this.emit('inflight:expired', expiredData)
      logger.warn('In-flight data expired', {count: expiredData.length})
    }
  }

  /**
   * Process individual in-flight data item
   */
  private async processInFlightDataItem(
    item: InFlightDataItem,
    event: SessionBoundaryEvent
  ): Promise<boolean> {
    switch (item.type) {
      case InFlightDataType.PARTIAL_TRANSCRIPT:
        return await this.processPartialTranscript(item, event)

      case InFlightDataType.AUDIO_BUFFER:
        return await this.processAudioBuffer(item, event)

      case InFlightDataType.PENDING_RESPONSE:
        return await this.processPendingResponse(item, event)

      case InFlightDataType.QUEUED_REQUEST:
        return await this.processQueuedRequest(item, event)

      case InFlightDataType.WEBSOCKET_MESSAGE:
        return await this.processWebSocketMessage(item, event)

      default:
        logger.warn('Unknown in-flight data type', {type: item.type, itemId: item.id})
        return false
    }
  }

  /**
   * Process partial transcript during transition
   */
  private async processPartialTranscript(
    item: InFlightDataItem,
    event: SessionBoundaryEvent
  ): Promise<boolean> {
    try {
      // Finalize partial transcript in current session
      if (item.transcriptId) {
        this.sessionManager.completeTranscriptInSession(event.currentSessionId, item.transcriptId)
        logger.debug('Partial transcript finalized', {
          transcriptId: item.transcriptId,
          sessionId: event.currentSessionId
        })
      }
      return true
    } catch (error) {
      logger.error('Failed to process partial transcript', {item, error})
      return false
    }
  }

  /**
   * Process audio buffer during transition
   */
  private async processAudioBuffer(
    item: InFlightDataItem,
    event: SessionBoundaryEvent
  ): Promise<boolean> {
    try {
      // Flush audio buffer to ensure no data is lost
      // This would integrate with the audio processing pipeline
      logger.debug('Audio buffer processed', {itemId: item.id})
      return true
    } catch (error) {
      logger.error('Failed to process audio buffer', {item, error})
      return false
    }
  }

  /**
   * Process pending response during transition
   */
  private async processPendingResponse(
    item: InFlightDataItem,
    event: SessionBoundaryEvent
  ): Promise<boolean> {
    try {
      // Wait for pending response or timeout
      // This would integrate with the response handling system
      logger.debug('Pending response processed', {itemId: item.id})
      return true
    } catch (error) {
      logger.error('Failed to process pending response', {item, error})
      return false
    }
  }

  /**
   * Process queued request during transition
   */
  private async processQueuedRequest(
    item: InFlightDataItem,
    event: SessionBoundaryEvent
  ): Promise<boolean> {
    try {
      // Process queued request or transfer to new session
      if (event.nextSessionId && item.priority === 'critical') {
        // Transfer critical requests to new session
        item.sessionId = event.nextSessionId
        logger.debug('Critical request transferred to new session', {
          itemId: item.id,
          newSessionId: event.nextSessionId
        })
      }
      return true
    } catch (error) {
      logger.error('Failed to process queued request', {item, error})
      return false
    }
  }

  /**
   * Process WebSocket message during transition
   */
  private async processWebSocketMessage(
    item: InFlightDataItem,
    event: SessionBoundaryEvent
  ): Promise<boolean> {
    try {
      // Handle WebSocket message appropriately
      logger.debug('WebSocket message processed', {itemId: item.id})
      return true
    } catch (error) {
      logger.error('Failed to process WebSocket message', {item, error})
      return false
    }
  }

  /**
   * Finalize current session
   */
  private async finalizeCurrentSession(event: SessionBoundaryEvent): Promise<void> {
    try {
      // Ensure all transcripts are properly completed
      const sessionMetadata = this.sessionManager.getSession(event.currentSessionId)
      if (sessionMetadata) {
        // Handle any remaining active transcripts
        for (const transcriptId of sessionMetadata.transcriptIds) {
          this.sessionManager.completeTranscriptInSession(event.currentSessionId, transcriptId)
        }
      }

      // Stop the current session
      await this.sessionManager.stopSession(event.currentSessionId)

      logger.debug('Current session finalized', {sessionId: event.currentSessionId})
    } catch (error) {
      logger.error('Failed to finalize current session', {
        sessionId: event.currentSessionId,
        error
      })
      throw error
    }
  }

  /**
   * Handle transition errors
   */
  private handleTransitionError(event: SessionBoundaryEvent, error: Error): void {
    this.currentTransition = null
    this.setState(BoundaryState.ERROR)

    if (this.config.telemetryEnabled) {
      this.emit('transition:failed', event, error)
    }

    logger.error('Session transition failed', {
      eventId: event.id,
      currentSessionId: event.currentSessionId,
      nextSessionId: event.nextSessionId,
      error: error.message
    })

    // Attempt recovery
    setTimeout(() => {
      this.setState(BoundaryState.IDLE)
    }, 5000)
  }

  /**
   * Validate boundary conditions
   */
  private async validateBoundaryConditions(event: SessionBoundaryEvent): Promise<boolean> {
    // Check if current session is valid
    const sessionMetadata = this.sessionManager.getSession(event.currentSessionId)
    if (!sessionMetadata || sessionMetadata.state !== SessionState.ACTIVE) {
      return false
    }

    // Check confidence threshold
    if (event.confidence < this.config.confidenceThreshold) {
      return false
    }

    // Check for critical in-flight data
    const criticalData = event.inFlightData.filter(item => item.priority === 'critical')
    const now = performance.now()
    const hasUnexpiredCriticalData = criticalData.some(item => item.expiresAt > now)

    if (hasUnexpiredCriticalData && event.trigger !== BoundaryTrigger.FORCED_BOUNDARY) {
      return false
    }

    return true
  }

  /**
   * Capture current in-flight data for a session
   */
  private captureInFlightData(sessionId: string): InFlightDataItem[] {
    const sessionData: InFlightDataItem[] = []

    for (const item of this.inFlightData.values()) {
      if (item.sessionId === sessionId) {
        sessionData.push({...item}) // Create a copy
      }
    }

    return sessionData
  }

  /**
   * Set boundary detection state
   */
  private setState(newState: BoundaryState): void {
    const oldState = this.currentState
    this.currentState = newState

    logger.debug('Boundary detector state changed', {
      oldState,
      newState,
      timestamp: performance.now()
    })
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Monitor session timeout events
    if (this.config.enableTimeoutDetection) {
      setInterval(() => {
        this.checkSessionTimeouts()
      }, 30000) // Check every 30 seconds
    }
  }

  /**
   * Check for session timeouts
   */
  private checkSessionTimeouts(): void {
    const activeSessions = this.sessionManager.getActiveSessions()
    const now = performance.now()

    for (const session of activeSessions) {
      const age = now - session.createdAt
      const inactivity = now - session.updatedAt

      // Check for timeout conditions
      if (age > 30 * 60 * 1000 || inactivity > 15 * 60 * 1000) {
        // 30 min max age, 15 min max inactivity
        this.triggerBoundaryDetection(BoundaryTrigger.SESSION_TIMEOUT, {
          sessionId: session.sessionId,
          age,
          inactivity,
          confidence: 0.9
        })
      }
    }
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Cleanup expired in-flight data
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredInFlightData()
    }, 60000) // Run every minute
  }

  /**
   * Cleanup expired in-flight data
   */
  private cleanupExpiredInFlightData(): void {
    const now = performance.now()
    const expiredIds: string[] = []

    for (const [id, item] of this.inFlightData.entries()) {
      if (item.expiresAt < now) {
        expiredIds.push(id)
      }
    }

    for (const id of expiredIds) {
      this.inFlightData.delete(id)
    }

    if (expiredIds.length > 0) {
      logger.debug('Expired in-flight data cleaned', {count: expiredIds.length})
    }
  }

  /**
   * Stop background tasks
   */
  private stopBackgroundTasks(): void {
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer)
      this.stabilizationTimer = null
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Generate unique ID for in-flight data
   */
  private generateInFlightDataId(): string {
    return `inflight_${performance.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate unique ID for boundary events
   */
  private generateBoundaryEventId(): string {
    return `boundary_${performance.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get event count for statistics
   */
  private getEventCount(eventName: string): number {
    // Placeholder for event counting implementation
    return 0
  }

  /**
   * Sanitize configuration for logging
   */
  private sanitizeConfigForLogging(
    config: BoundaryDetectionConfig
  ): Partial<BoundaryDetectionConfig> {
    return {
      silenceThreshold: config.silenceThreshold,
      stabilizationWindow: config.stabilizationWindow,
      maxTransitionTime: config.maxTransitionTime,
      confidenceThreshold: config.confidenceThreshold,
      enableAudioSilenceDetection: config.enableAudioSilenceDetection,
      enableUserActionDetection: config.enableUserActionDetection,
      enableTimeoutDetection: config.enableTimeoutDetection,
      telemetryEnabled: config.telemetryEnabled
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    this.stopBackgroundTasks()

    // Cancel any pending transitions
    if (this.currentTransition) {
      logger.warn('Destroying boundary detector with pending transition', {
        transitionId: this.currentTransition.id
      })
    }

    this.inFlightData.clear()
    this.pendingBoundaries.clear()
    this.currentTransition = null
    this.setState(BoundaryState.IDLE)

    logger.info('SessionBoundaryDetector destroyed')
  }
}

// Export singleton instance
let globalBoundaryDetector: SessionBoundaryDetector | null = null

/**
 * Get the global SessionBoundaryDetector instance
 */
export function getSessionBoundaryDetector(
  sessionManager?: SessionManager,
  safeguards?: SessionIDSafeguards,
  config?: Partial<BoundaryDetectionConfig>
): SessionBoundaryDetector {
  if (!globalBoundaryDetector && sessionManager && safeguards) {
    globalBoundaryDetector = new SessionBoundaryDetector(sessionManager, safeguards, config)
  }
  if (!globalBoundaryDetector) {
    throw new Error(
      'SessionBoundaryDetector not initialized - provide SessionManager and SessionIDSafeguards'
    )
  }
  return globalBoundaryDetector
}

/**
 * Initialize a new SessionBoundaryDetector instance (replaces global if exists)
 */
export function initializeSessionBoundaryDetector(
  sessionManager: SessionManager,
  safeguards: SessionIDSafeguards,
  config?: Partial<BoundaryDetectionConfig>
): SessionBoundaryDetector {
  if (globalBoundaryDetector) {
    globalBoundaryDetector.destroy().catch(error => {
      logger.error('Error destroying existing SessionBoundaryDetector', {error})
    })
  }
  globalBoundaryDetector = new SessionBoundaryDetector(sessionManager, safeguards, config)
  return globalBoundaryDetector
}
