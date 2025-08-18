/**
 * Session Recovery and Telemetry System
 *
 * Provides comprehensive session recovery capabilities with telemetry tracking,
 * analytics, and monitoring for session health and recovery operations.
 */

import {EventEmitter} from 'events'
import {SessionManager, SessionState} from './SessionManager'
import {SessionIDSafeguards} from './SessionIDSafeguards'
import {SessionBoundaryDetector} from './SessionBoundaryDetector'
import {RobustIDGenerator} from './RobustIDGenerator'

// Recovery Strategy Options
export enum RecoveryStrategy {
  RESUME_EXISTING = 'resume_existing',
  CREATE_NEW = 'create_new',
  MERGE_SESSIONS = 'merge_sessions',
  SELECTIVE_RECOVERY = 'selective_recovery',
  COMPLETE_RESTART = 'complete_restart'
}

// Telemetry Event Types
export enum TelemetryEventType {
  SESSION_STARTED = 'session_started',
  SESSION_STOPPED = 'session_stopped',
  SESSION_FAILED = 'session_failed',
  SESSION_RECOVERED = 'session_recovered',
  SESSION_ERROR = 'session_error',
  RECOVERY_INITIATED = 'recovery_initiated',
  RECOVERY_COMPLETED = 'recovery_completed',
  RECOVERY_FAILED = 'recovery_failed',
  CHECKPOINT_CREATED = 'checkpoint_created',
  CHECKPOINT_RESTORED = 'checkpoint_restored',
  TELEMETRY_UPDATED = 'telemetry_updated'
}

// Session Recovery Configuration
interface RecoveryConfig {
  enabled: boolean
  maxRecoveryAttempts: number
  recoveryTimeoutMs: number
  checkpointIntervalMs: number
  analyticsEnabled: boolean
  telemetryRetentionMs: number
  validateRecoveredData: boolean
  checksumValidation: boolean
  autoRecovery: boolean
  backgroundTasks: boolean
}

// Session Checkpoint for Recovery
interface SessionCheckpoint {
  sessionId: string
  timestamp: number
  state: {
    isActive: boolean
    startTime: number
    endTime?: number
    transcriptLength: number
    errorCount: number
    lastActivity: number
  }
  partialTranscripts: Record<string, string>
  metadata: Record<string, unknown>
  recovery: {
    attempts: number
    processingQueue: unknown[]
    lastRecovery?: number
  }
}

// Recovery Analysis Result
interface RecoveryAnalysis {
  sessionId: string
  recommended: RecoveryStrategy
  confidence: number
  factors: {
    sessionAge: number
    errorRate: number
    transcriptLength: number
    lastActivity: number
    recoveryHistory: number
  }
  alternatives: RecoveryStrategy[]
  data: Record<string, unknown>
}

// Telemetry Event Record
interface TelemetryEvent {
  type: TelemetryEventType
  sessionId: string
  timestamp: number
  data: Record<string, unknown>
  severity: 'info' | 'warning' | 'error' | 'critical'
  component: string
}

// Analytics Data Structure
interface AnalyticsData {
  totalSessions: number
  activeSessions: number
  completedSessions: number
  failedSessions: number
  recoveryAttempts: number
  successfulRecoveries: number
  failedRecoveries: number
  averageSessionDuration: number
  errorRate: number
  sessionSuccessRate: number
  recoverySuccessRate: number
  lastUpdated: number
}

// Events for external consumption
interface SessionErrorEvent extends CustomEvent {
  detail: {
    sessionId: string
    error: Error | string
  }
}

declare global {
  interface WindowEventMap {
    'session-error': SessionErrorEvent
    'session-created': CustomEvent<{sessionId: string}>
    'session-started': CustomEvent<{sessionId: string}>
    'session-stopped': CustomEvent<{sessionId: string}>
    'session-failed': CustomEvent<{sessionId: string; error: string}>
    'id-collision': CustomEvent<{sessionId: string; collisionData: unknown}>
    'orphan-detected': CustomEvent<{sessionId: string}>
    'boundary-detected': CustomEvent<{sessionId: string; boundaryData: unknown}>
  }
}

/**
 * Main Session Recovery and Telemetry System
 */
export class SessionRecoveryTelemetry extends EventEmitter {
  private sessionManager: SessionManager | null = null
  private sessionIDSafeguards: SessionIDSafeguards | null = null
  private sessionBoundaryDetector: SessionBoundaryDetector | null = null
  private robustIDGenerator: RobustIDGenerator | null = null

  private config: RecoveryConfig
  private checkpoints: Map<string, SessionCheckpoint> = new Map()
  private telemetryEvents: TelemetryEvent[] = []
  private analytics: AnalyticsData
  private recoveryInProgress: Set<string> = new Set()
  private backgroundTasks: Set<NodeJS.Timeout> = new Set()

  // Health monitoring
  private healthScore: number = 1.0
  private lastHealthCheck: number = 0

  constructor(config: Partial<RecoveryConfig> = {}) {
    super()

    this.config = {
      enabled: true,
      maxRecoveryAttempts: 3,
      recoveryTimeoutMs: 30000,
      checkpointIntervalMs: 10000,
      analyticsEnabled: true,
      telemetryRetentionMs: 86400000, // 24 hours
      validateRecoveredData: true,
      checksumValidation: true,
      autoRecovery: true,
      backgroundTasks: true,
      ...config
    }

    this.analytics = {
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      failedSessions: 0,
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageSessionDuration: 0,
      errorRate: 0,
      sessionSuccessRate: 0,
      recoverySuccessRate: 0,
      lastUpdated: Date.now()
    }

    if (this.config.backgroundTasks) {
      this.startBackgroundTasks()
    }
  }

  /**
   * Initialize the recovery system with session components
   */
  public async initialize(
    sessionManager: SessionManager,
    sessionIDSafeguards: SessionIDSafeguards,
    sessionBoundaryDetector: SessionBoundaryDetector,
    robustIDGenerator: RobustIDGenerator
  ): Promise<void> {
    this.sessionManager = sessionManager
    this.sessionIDSafeguards = sessionIDSafeguards
    this.sessionBoundaryDetector = sessionBoundaryDetector
    this.robustIDGenerator = robustIDGenerator

    if (typeof window !== 'undefined') {
      this.setupEventListeners()
    }

    this.recordTelemetryEvent(
      TelemetryEventType.TELEMETRY_UPDATED,
      {action: 'system_initialized', config: this.config},
      'info',
      'recovery-system'
    )
  }

  /**
   * Set up event listeners for session management components
   */
  private setupEventListeners(): void {
    // Session Manager events
    window.addEventListener('session-created', this.handleSessionCreated)
    window.addEventListener('session-started', this.handleSessionStarted)
    window.addEventListener('session-stopped', this.handleSessionStopped)
    window.addEventListener('session-failed', this.handleSessionFailed)
    window.addEventListener('session-error', this.handleSessionError)

    // Session ID Safeguards events
    window.addEventListener('id-collision', this.handleIDCollision)
    window.addEventListener('orphan-detected', this.handleOrphanDetected)

    // Session Boundary Detector events
    window.addEventListener('boundary-detected', this.handleBoundaryDetected)
  }

  /**
   * Event Handlers
   */
  private handleSessionCreated = (event: CustomEvent<{sessionId: string}>): void => {
    const {sessionId} = event.detail
    const data = {sessionId, timestamp: Date.now()}

    this.recordTelemetryEvent(TelemetryEventType.SESSION_STARTED, data, 'info', 'session-manager')

    this.createCheckpoint(sessionId)
    this.updateAnalytics('session_created', data)
  }

  private handleSessionStarted = (event: CustomEvent<{sessionId: string}>): void => {
    const {sessionId} = event.detail
    const data = {sessionId, timestamp: Date.now()}

    this.recordTelemetryEvent(TelemetryEventType.SESSION_STARTED, data, 'info', 'session-manager')
    this.updateAnalytics('session_started', data)
  }

  private handleSessionStopped = (event: CustomEvent<{sessionId: string}>): void => {
    const {sessionId} = event.detail
    const data = {sessionId, timestamp: Date.now()}

    this.recordTelemetryEvent(TelemetryEventType.SESSION_STOPPED, data, 'info', 'session-manager')
    this.updateAnalytics('session_stopped', data)
  }

  private handleSessionFailed = (event: CustomEvent<{sessionId: string; error: string}>): void => {
    const {sessionId, error} = event.detail
    const data = {sessionId, error, timestamp: Date.now()}

    this.recordTelemetryEvent(TelemetryEventType.SESSION_FAILED, data, 'error', 'session-manager')
    this.updateAnalytics('session_failed', data)

    if (this.config.autoRecovery) {
      this.scheduleRecovery(sessionId, 'failure')
    }
  }

  private handleSessionError = (event: SessionErrorEvent): void => {
    const {sessionId, error} = event.detail

    this.recordTelemetryEvent(
      TelemetryEventType.SESSION_ERROR,
      {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      },
      'error',
      'session-manager'
    )

    this.scheduleRecovery(sessionId, 'error')
  }

  private handleIDCollision = (
    event: CustomEvent<{sessionId: string; collisionData: unknown}>
  ): void => {
    const {sessionId, collisionData} = event.detail
    const data = {sessionId, collisionData, timestamp: Date.now()}

    this.recordTelemetryEvent(TelemetryEventType.SESSION_ERROR, data, 'warning', 'id-safeguards')
    this.updateAnalytics('id_collision', data)
  }

  private handleOrphanDetected = (event: CustomEvent<{sessionId: string}>): void => {
    const {sessionId} = event.detail
    const data = {sessionId, timestamp: Date.now()}

    this.recordTelemetryEvent(TelemetryEventType.SESSION_ERROR, data, 'warning', 'id-safeguards')
    this.updateAnalytics('orphan_detected', data)
  }

  private handleBoundaryDetected = (
    event: CustomEvent<{sessionId: string; boundaryData: unknown}>
  ): void => {
    const {sessionId, boundaryData} = event.detail
    const data = {sessionId, boundaryData, timestamp: Date.now()}

    this.recordTelemetryEvent(TelemetryEventType.SESSION_ERROR, data, 'info', 'boundary-detector')
    this.updateAnalytics('boundary_detected', data)
  }

  /**
   * Create checkpoint for session recovery
   */
  private async createCheckpoint(sessionId: string): Promise<void> {
    if (!this.sessionManager) return

    try {
      const session = this.sessionManager.getSession(sessionId)
      if (!session) return

      const checkpoint: SessionCheckpoint = {
        sessionId,
        timestamp: Date.now(),
        state: {
          isActive: session.state === SessionState.ACTIVE,
          startTime: session.startedAt || session.createdAt,
          endTime: session.endedAt,
          transcriptLength: session.transcriptIds.size,
          errorCount: session.errorAt ? 1 : 0,
          lastActivity: session.updatedAt
        },
        partialTranscripts: {},
        metadata: {sessionState: session.state, checkpoints: session.checkpoints},
        recovery: {
          attempts: 0,
          processingQueue: [],
          lastRecovery: undefined
        }
      }

      this.checkpoints.set(sessionId, checkpoint)

      this.recordTelemetryEvent(
        TelemetryEventType.CHECKPOINT_CREATED,
        {sessionId, timestamp: checkpoint.timestamp},
        'info',
        'recovery-system'
      )
    } catch (error) {
      this.recordTelemetryEvent(
        TelemetryEventType.RECOVERY_FAILED,
        {sessionId, error: error instanceof Error ? error.message : String(error)},
        'error',
        'recovery-system'
      )
    }
  }

  /**
   * Schedule recovery for a failed session
   */
  private async scheduleRecovery(sessionId: string, trigger: string): Promise<void> {
    if (!this.config.enabled || this.recoveryInProgress.has(sessionId)) {
      return
    }

    this.recoveryInProgress.add(sessionId)

    try {
      const analysis = await this.analyzeRecoveryOptions(sessionId)
      await this.executeRecovery(sessionId, analysis.recommended)

      this.recordTelemetryEvent(
        TelemetryEventType.RECOVERY_COMPLETED,
        {sessionId, strategy: analysis.recommended, trigger},
        'info',
        'recovery-system'
      )

      this.updateAnalytics('recovery_completed', {sessionId, strategy: analysis.recommended})
    } catch (error) {
      this.recordTelemetryEvent(
        TelemetryEventType.RECOVERY_FAILED,
        {sessionId, trigger, error: error instanceof Error ? error.message : String(error)},
        'error',
        'recovery-system'
      )

      this.updateAnalytics('recovery_failed', {sessionId, trigger})
    } finally {
      this.recoveryInProgress.delete(sessionId)
    }
  }

  /**
   * Analyze recovery options for a session
   */
  private async analyzeRecoveryOptions(sessionId: string): Promise<RecoveryAnalysis> {
    const checkpoint = this.checkpoints.get(sessionId)

    const analysis: RecoveryAnalysis = {
      sessionId,
      recommended: RecoveryStrategy.CREATE_NEW,
      confidence: 0.5,
      factors: {
        sessionAge: 0,
        errorRate: 0,
        transcriptLength: 0,
        lastActivity: 0,
        recoveryHistory: 0
      },
      alternatives: [RecoveryStrategy.COMPLETE_RESTART],
      data: {}
    }

    if (checkpoint) {
      const now = Date.now()
      analysis.factors.sessionAge = now - checkpoint.timestamp
      analysis.factors.transcriptLength = checkpoint.state.transcriptLength
      analysis.factors.lastActivity = now - checkpoint.state.lastActivity
      analysis.factors.recoveryHistory = checkpoint.recovery.attempts

      // Determine best recovery strategy
      if (analysis.factors.sessionAge < 60000 && checkpoint.state.transcriptLength > 0) {
        analysis.recommended = RecoveryStrategy.RESUME_EXISTING
        analysis.confidence = 0.8
        analysis.alternatives = [RecoveryStrategy.SELECTIVE_RECOVERY, RecoveryStrategy.CREATE_NEW]
      } else if (checkpoint.state.transcriptLength > 100) {
        analysis.recommended = RecoveryStrategy.SELECTIVE_RECOVERY
        analysis.confidence = 0.7
        analysis.alternatives = [RecoveryStrategy.MERGE_SESSIONS, RecoveryStrategy.CREATE_NEW]
      }
    }

    return analysis
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecovery(sessionId: string, strategy: RecoveryStrategy): Promise<void> {
    if (!this.sessionManager) {
      throw new Error('SessionManager not initialized')
    }

    this.recordTelemetryEvent(
      TelemetryEventType.RECOVERY_INITIATED,
      {sessionId, strategy},
      'info',
      'recovery-system'
    )

    switch (strategy) {
      case RecoveryStrategy.RESUME_EXISTING:
        await this.resumeExistingSession(sessionId)
        break

      case RecoveryStrategy.CREATE_NEW:
        await this.createNewSession(sessionId)
        break

      case RecoveryStrategy.SELECTIVE_RECOVERY:
        await this.selectiveRecovery(sessionId)
        break

      case RecoveryStrategy.MERGE_SESSIONS:
        await this.mergeSessions(sessionId)
        break

      case RecoveryStrategy.COMPLETE_RESTART:
        await this.completeRestart(sessionId)
        break

      default:
        throw new Error(`Unknown recovery strategy: ${strategy}`)
    }
  }

  /**
   * Recovery strategy implementations
   */
  private async resumeExistingSession(sessionId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(sessionId)
    if (!checkpoint || !this.sessionManager) return

    // Try to restore from checkpoint
    const newSessionId = this.sessionManager.createSession()

    this.recordTelemetryEvent(
      TelemetryEventType.SESSION_RECOVERED,
      {originalSessionId: sessionId, newSessionId},
      'info',
      'recovery-system'
    )
  }

  private async createNewSession(sessionId: string): Promise<void> {
    if (!this.sessionManager) return

    const newSessionId = this.sessionManager.createSession()

    this.recordTelemetryEvent(
      TelemetryEventType.SESSION_RECOVERED,
      {originalSessionId: sessionId, newSessionId, strategy: 'create_new'},
      'info',
      'recovery-system'
    )
  }

  private async selectiveRecovery(sessionId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(sessionId)
    if (!checkpoint || !this.sessionManager) return

    const newSessionId = this.sessionManager.createSession()

    // Implement selective data recovery logic here
    this.recordTelemetryEvent(
      TelemetryEventType.SESSION_RECOVERED,
      {originalSessionId: sessionId, newSessionId, strategy: 'selective'},
      'info',
      'recovery-system'
    )
  }

  private async mergeSessions(sessionId: string): Promise<void> {
    if (!this.sessionManager) return

    const newSessionId = this.sessionManager.createSession()

    this.recordTelemetryEvent(
      TelemetryEventType.SESSION_RECOVERED,
      {originalSessionId: sessionId, newSessionId, strategy: 'merge'},
      'info',
      'recovery-system'
    )
  }

  private async completeRestart(sessionId: string): Promise<void> {
    if (!this.sessionManager) return

    // Clear all checkpoints and start fresh
    this.checkpoints.delete(sessionId)
    const newSessionId = this.sessionManager.createSession()

    this.recordTelemetryEvent(
      TelemetryEventType.SESSION_RECOVERED,
      {originalSessionId: sessionId, newSessionId, strategy: 'complete_restart'},
      'info',
      'recovery-system'
    )
  }

  /**
   * Record telemetry event
   */
  private recordTelemetryEvent(
    type: TelemetryEventType,
    data: Record<string, unknown>,
    severity: 'info' | 'warning' | 'error' | 'critical',
    component: string
  ): void {
    const event: TelemetryEvent = {
      type,
      sessionId: (data.sessionId as string) || 'unknown',
      timestamp: Date.now(),
      data,
      severity,
      component
    }

    this.telemetryEvents.push(event)

    // Keep telemetry events within retention period
    const cutoff = Date.now() - this.config.telemetryRetentionMs
    this.telemetryEvents = this.telemetryEvents.filter(e => e.timestamp > cutoff)

    this.emit('telemetry', event)
  }

  /**
   * Update analytics with new data
   */
  private updateAnalytics(eventType: string, data: Record<string, unknown>): void {
    if (!this.config.analyticsEnabled) return

    switch (eventType) {
      case 'session_created':
        this.analytics.totalSessions++
        this.analytics.activeSessions++
        break

      case 'session_stopped':
        this.analytics.activeSessions = Math.max(0, this.analytics.activeSessions - 1)
        this.analytics.completedSessions++
        break

      case 'session_failed':
        this.analytics.activeSessions = Math.max(0, this.analytics.activeSessions - 1)
        this.analytics.failedSessions++
        break

      case 'recovery_attempted':
        this.analytics.recoveryAttempts++
        break

      case 'recovery_completed':
        this.analytics.successfulRecoveries++
        break

      case 'recovery_failed':
        this.analytics.failedRecoveries++
        break

      default:
        // Generic event tracking
        if (data.error) {
          this.analytics.errorRate = this.analytics.errorRate * 0.9 + 0.1
        } else {
          this.analytics.errorRate = this.analytics.errorRate * 0.95
        }
        break
    }

    // Update calculated rates
    if (this.analytics.totalSessions > 0) {
      this.analytics.sessionSuccessRate =
        this.analytics.completedSessions / this.analytics.totalSessions
    }

    if (this.analytics.recoveryAttempts > 0) {
      this.analytics.recoverySuccessRate =
        this.analytics.successfulRecoveries / this.analytics.recoveryAttempts
    }

    this.analytics.lastUpdated = Date.now()
  }

  /**
   * Start background monitoring tasks
   */
  private startBackgroundTasks(): void {
    // Checkpoint creation task
    const checkpointTask = setInterval(() => {
      this.createPeriodicCheckpoints()
    }, this.config.checkpointIntervalMs)
    this.backgroundTasks.add(checkpointTask)

    // Health monitoring task
    const healthTask = setInterval(() => {
      this.updateHealthScore()
    }, 30000) // Every 30 seconds
    this.backgroundTasks.add(healthTask)

    // Cleanup task
    const cleanupTask = setInterval(() => {
      this.performCleanup()
    }, 300000) // Every 5 minutes
    this.backgroundTasks.add(cleanupTask)
  }

  /**
   * Create periodic checkpoints for all active sessions
   */
  private async createPeriodicCheckpoints(): Promise<void> {
    if (!this.sessionManager) return

    try {
      const activeSessions = this.sessionManager.getActiveSessions()

      for (const session of activeSessions) {
        await this.createCheckpoint(session.sessionId)
      }
    } catch (error) {
      this.recordTelemetryEvent(
        TelemetryEventType.RECOVERY_FAILED,
        {
          error: error instanceof Error ? error.message : String(error),
          action: 'periodic_checkpoint'
        },
        'warning',
        'recovery-system'
      )
    }
  }

  /**
   * Update system health score
   */
  private updateHealthScore(): void {
    const now = Date.now()

    let score = 1.0

    // Factor in error rate
    score -= this.analytics.errorRate * 0.3

    // Factor in recovery success rate
    if (this.analytics.recoveryAttempts > 0) {
      score = score * (0.7 + 0.3 * this.analytics.recoverySuccessRate)
    }

    // Factor in session success rate
    if (this.analytics.totalSessions > 0) {
      score = score * (0.8 + 0.2 * this.analytics.sessionSuccessRate)
    }

    this.healthScore = Math.max(0, Math.min(1, score))
    this.lastHealthCheck = now

    if (this.healthScore < 0.7) {
      this.recordTelemetryEvent(
        TelemetryEventType.TELEMETRY_UPDATED,
        {healthScore: this.healthScore, status: 'degraded'},
        'warning',
        'recovery-system'
      )
    }
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(): void {
    const cutoff = Date.now() - this.config.telemetryRetentionMs

    // Clean up old checkpoints
    for (const [sessionId, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.timestamp < cutoff) {
        this.checkpoints.delete(sessionId)
      }
    }

    // Clean up old telemetry events (already done in recordTelemetryEvent)
  }

  /**
   * Public API Methods
   */

  /**
   * Get current analytics data
   */
  public getAnalytics(): AnalyticsData {
    return {...this.analytics}
  }

  /**
   * Get recent telemetry events
   */
  public getTelemetryEvents(limit: number = 100): TelemetryEvent[] {
    return this.telemetryEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
  }

  /**
   * Get system health score
   */
  public getHealthScore(): number {
    return this.healthScore
  }

  /**
   * Get recovery status for a session
   */
  public getRecoveryStatus(sessionId: string): {
    inProgress: boolean
    checkpoint: SessionCheckpoint | null
    lastAttempt: number | null
  } {
    return {
      inProgress: this.recoveryInProgress.has(sessionId),
      checkpoint: this.checkpoints.get(sessionId) || null,
      lastAttempt: this.checkpoints.get(sessionId)?.recovery.lastRecovery || null
    }
  }

  /**
   * Manually trigger recovery for a session
   */
  public async triggerRecovery(sessionId: string, strategy?: RecoveryStrategy): Promise<void> {
    if (strategy) {
      await this.executeRecovery(sessionId, strategy)
    } else {
      await this.scheduleRecovery(sessionId, 'manual')
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<RecoveryConfig>): void {
    this.config = {...this.config, ...newConfig}

    this.recordTelemetryEvent(
      TelemetryEventType.TELEMETRY_UPDATED,
      {action: 'config_updated', newConfig},
      'info',
      'recovery-system'
    )
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    // Clear background tasks
    for (const task of this.backgroundTasks) {
      clearInterval(task)
    }
    this.backgroundTasks.clear()

    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('session-created', this.handleSessionCreated)
      window.removeEventListener('session-started', this.handleSessionStarted)
      window.removeEventListener('session-stopped', this.handleSessionStopped)
      window.removeEventListener('session-failed', this.handleSessionFailed)
      window.removeEventListener('session-error', this.handleSessionError)
      window.removeEventListener('id-collision', this.handleIDCollision)
      window.removeEventListener('orphan-detected', this.handleOrphanDetected)
      window.removeEventListener('boundary-detected', this.handleBoundaryDetected)
    }

    this.recordTelemetryEvent(
      TelemetryEventType.TELEMETRY_UPDATED,
      {action: 'system_shutdown'},
      'info',
      'recovery-system'
    )

    // Remove all listeners
    this.removeAllListeners()
  }
}
