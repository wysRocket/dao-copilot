import {EventEmitter} from 'events'
import {ErrorHandler} from './ErrorHandler'
import {ErrorTelemetrySystem} from './ErrorTelemetrySystem'
import {UserErrorMessageSystem} from './UserErrorMessageSystem'
import type {ErrorCategory, ClassifiedError, ErrorContext} from './UserErrorMessageSystem'
import type {
  LocalizedErrorMessage,
  ErrorDisplayOptions,
  SupportedLocale
} from './UserErrorMessageSystem'

/**
 * Configuration for the error handling integration
 */
export interface ErrorHandlingIntegrationConfig {
  /** Enable automatic user message generation */
  enableAutoMessages: boolean
  /** Default locale for user messages */
  defaultLocale: SupportedLocale
  /** Default display options */
  defaultDisplayOptions: ErrorDisplayOptions
  /** Maximum number of active user messages */
  maxActiveMessages: number
  /** Enable message deduplication */
  enableDeduplication: boolean
  /** Deduplication window in milliseconds */
  deduplicationWindowMs: number
  /** Severity threshold for auto-display */
  autoDisplayThreshold: 'low' | 'medium' | 'high' | 'critical'
  /** Enable analytics tracking */
  enableAnalytics: boolean
  /** Custom message filters */
  messageFilters?: Array<(error: ClassifiedError, context?: ErrorContext) => boolean>
}

/**
 * Message deduplication entry
 */
interface DeduplicationEntry {
  messageHash: string
  firstOccurrence: number
  lastOccurrence: number
  count: number
  lastMessageId: string
}

/**
 * Integration statistics
 */
export interface IntegrationStatistics {
  /** Total errors processed */
  totalErrorsProcessed: number
  /** Total user messages generated */
  totalMessagesGenerated: number
  /** Messages suppressed by filters */
  messagesSuppressed: number
  /** Messages deduplicated */
  messagesDeduplicated: number
  /** Average message generation time */
  avgMessageGenerationTime: number
  /** Messages by severity */
  messagesBySeverity: Record<string, number>
  /** User interaction statistics */
  userInteractionStats: {
    totalDismissals: number
    totalActions: number
    totalRatings: number
    avgRating: number
  }
}

/**
 * Comprehensive integration layer for error handling and user messaging
 */
export class ErrorHandlingIntegration extends EventEmitter {
  private readonly config: ErrorHandlingIntegrationConfig
  private readonly errorHandler: ErrorHandler
  private readonly telemetrySystem: ErrorTelemetrySystem
  private readonly userMessageSystem: UserErrorMessageSystem
  private readonly deduplicationCache: Map<string, DeduplicationEntry>
  private readonly statistics: IntegrationStatistics
  private readonly activeMessages: Set<string>

  constructor(
    errorHandler: ErrorHandler,
    telemetrySystem: ErrorTelemetrySystem,
    userMessageSystem: UserErrorMessageSystem,
    config?: Partial<ErrorHandlingIntegrationConfig>
  ) {
    super()

    this.errorHandler = errorHandler
    this.telemetrySystem = telemetrySystem
    this.userMessageSystem = userMessageSystem

    this.config = {
      enableAutoMessages: true,
      defaultLocale: 'en',
      defaultDisplayOptions: {
        showTechnicalDetails: false,
        maxMessageLength: 500,
        includeSuggestedActions: true,
        includeHelpLinks: true,
        locale: 'en',
        userLevel: 'basic'
      },
      maxActiveMessages: 10,
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000, // 5 minutes
      autoDisplayThreshold: 'medium',
      enableAnalytics: true,
      ...config
    }

    this.deduplicationCache = new Map()
    this.activeMessages = new Set()
    this.statistics = {
      totalErrorsProcessed: 0,
      totalMessagesGenerated: 0,
      messagesSuppressed: 0,
      messagesDeduplicated: 0,
      avgMessageGenerationTime: 0,
      messagesBySeverity: {},
      userInteractionStats: {
        totalDismissals: 0,
        totalActions: 0,
        totalRatings: 0,
        avgRating: 0
      }
    }

    this.setupEventHandlers()
    this.startCleanupTimer()
  }

  /**
   * Set up event handlers for the integrated systems
   */
  private setupEventHandlers(): void {
    // Listen for classified errors from the error handler
    this.errorHandler.on('errorClassified', this.handleClassifiedError.bind(this))

    // Listen for user message events
    this.userMessageSystem.on('messageGenerated', this.handleMessageGenerated.bind(this))
    this.userMessageSystem.on('messageDismissed', this.handleMessageDismissed.bind(this))
    this.userMessageSystem.on('userActionTracked', this.handleUserActionTracked.bind(this))
    this.userMessageSystem.on('userRatingAdded', this.handleUserRatingAdded.bind(this))

    // Listen for telemetry events
    this.telemetrySystem.on('patternDetected', this.handlePatternDetected.bind(this))
    this.telemetrySystem.on('alertTriggered', this.handleAlertTriggered.bind(this))
  }

  /**
   * Handle classified error from error handler
   */
  private async handleClassifiedError(data: {
    error: ClassifiedError
    context?: ErrorContext
  }): Promise<void> {
    const {error, context} = data
    this.statistics.totalErrorsProcessed++

    try {
      // Apply message filters
      if (!this.shouldGenerateMessage(error, context)) {
        this.statistics.messagesSuppressed++
        return
      }

      // Check deduplication
      if (this.config.enableDeduplication && this.isDuplicate(error, context)) {
        this.statistics.messagesDeduplicated++
        return
      }

      // Generate user message if auto-messages are enabled
      if (this.config.enableAutoMessages && this.shouldAutoDisplay(error)) {
        const startTime = performance.now()

        const message = this.userMessageSystem.generateUserMessage(
          error,
          context,
          this.config.defaultDisplayOptions
        )

        const generationTime = performance.now() - startTime
        this.updateMessageGenerationTime(generationTime)

        // Track message by severity
        this.statistics.messagesBySeverity[error.severity] =
          (this.statistics.messagesBySeverity[error.severity] || 0) + 1

        // Emit integration event
        this.emit('userMessageGenerated', {
          error,
          context,
          message,
          generationTime
        })
      }
    } catch (err) {
      console.error('Error in handleClassifiedError:', err)
      this.emit('integrationError', {
        type: 'message_generation_failed',
        originalError: error,
        context,
        integrationError: err
      })
    }
  }

  /**
   * Check if a message should be generated based on filters
   */
  private shouldGenerateMessage(error: ClassifiedError, context?: ErrorContext): boolean {
    // Apply custom filters if configured
    if (this.config.messageFilters) {
      for (const filter of this.config.messageFilters) {
        if (!filter(error, context)) {
          return false
        }
      }
    }

    // Check if we have too many active messages
    if (this.activeMessages.size >= this.config.maxActiveMessages) {
      return false
    }

    return true
  }

  /**
   * Check if error should be auto-displayed based on severity threshold
   */
  private shouldAutoDisplay(error: ClassifiedError): boolean {
    const severityOrder = ['low', 'medium', 'high', 'critical']
    const errorSeverityIndex = severityOrder.indexOf(error.severity)
    const thresholdIndex = severityOrder.indexOf(this.config.autoDisplayThreshold)

    return errorSeverityIndex >= thresholdIndex
  }

  /**
   * Check if error is a duplicate within the deduplication window
   */
  private isDuplicate(error: ClassifiedError, context?: ErrorContext): boolean {
    const messageHash = this.generateMessageHash(error, context)
    const now = Date.now()
    const entry = this.deduplicationCache.get(messageHash)

    if (!entry) {
      // First occurrence
      this.deduplicationCache.set(messageHash, {
        messageHash,
        firstOccurrence: now,
        lastOccurrence: now,
        count: 1,
        lastMessageId: ''
      })
      return false
    }

    // Check if within deduplication window
    if (now - entry.lastOccurrence <= this.config.deduplicationWindowMs) {
      entry.lastOccurrence = now
      entry.count++
      return true
    }

    // Outside window, treat as new occurrence
    entry.firstOccurrence = now
    entry.lastOccurrence = now
    entry.count = 1
    return false
  }

  /**
   * Generate hash for message deduplication
   */
  private generateMessageHash(error: ClassifiedError, context?: ErrorContext): string {
    const hashInput = JSON.stringify({
      type: error.type,
      category: error.category,
      severity: error.severity,
      component: context?.component || 'unknown'
    })

    // Simple hash function
    let hash = 0
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36)
  }

  /**
   * Handle message generation event
   */
  private handleMessageGenerated(message: LocalizedErrorMessage): void {
    this.statistics.totalMessagesGenerated++
    this.activeMessages.add(message.errorId)

    this.emit('messageDisplayed', message)
  }

  /**
   * Handle message dismissal event
   */
  private handleMessageDismissed(data: {errorId: string; message: LocalizedErrorMessage}): void {
    this.statistics.userInteractionStats.totalDismissals++
    this.activeMessages.delete(data.errorId)

    this.emit('messageHidden', data)
  }

  /**
   * Handle user action tracking
   */
  private handleUserActionTracked(data: {errorId: string; action: string}): void {
    this.statistics.userInteractionStats.totalActions++

    this.emit('userActionPerformed', data)
  }

  /**
   * Handle user rating event
   */
  private handleUserRatingAdded(data: {errorId: string; rating: number}): void {
    const stats = this.statistics.userInteractionStats
    stats.totalRatings++
    stats.avgRating =
      (stats.avgRating * (stats.totalRatings - 1) + data.rating) / stats.totalRatings

    this.emit('userFeedbackReceived', data)
  }

  /**
   * Handle detected error patterns from telemetry
   */
  private handlePatternDetected(pattern: Record<string, unknown>): void {
    // Generate high-priority message for significant patterns
    if (pattern.confidence > 0.8 && pattern.type === 'cascading') {
      const syntheticError: ClassifiedError = {
        type: 'CASCADING_FAILURE_DETECTED',
        category: 'system' as ErrorCategory,
        severity: 'critical',
        message: `Cascading failure detected across ${pattern.affectedComponents?.length || 0} components`,
        timestamp: Date.now()
      }

      const context: ErrorContext = {
        component: 'pattern-detector',
        operation: 'pattern-analysis',
        sessionId: 'system',
        metadata: {
          pattern,
          detectedAt: Date.now()
        }
      }

      this.handleClassifiedError({error: syntheticError, context})
    }

    this.emit('patternBasedMessage', {pattern})
  }

  /**
   * Handle alerts from telemetry system
   */
  private handleAlertTriggered(alert: Record<string, unknown>): void {
    // Generate user message for critical alerts
    if (alert.severity === 'high' || alert.severity === 'critical') {
      const syntheticError: ClassifiedError = {
        type: 'SYSTEM_ALERT_TRIGGERED',
        category: 'system' as ErrorCategory,
        severity:
          (alert.severity as string) === 'high' || (alert.severity as string) === 'critical'
            ? (alert.severity as 'high' | 'critical')
            : 'high',
        message: (alert.description as string) || 'System alert triggered',
        timestamp: Date.now()
      }

      const context: ErrorContext = {
        component: 'alert-system',
        operation: 'alert-evaluation',
        sessionId: 'system',
        metadata: {
          alert,
          triggeredAt: Date.now()
        }
      }

      this.handleClassifiedError({error: syntheticError, context})
    }

    this.emit('alertBasedMessage', {alert})
  }

  /**
   * Update average message generation time
   */
  private updateMessageGenerationTime(newTime: number): void {
    const count = this.statistics.totalMessagesGenerated
    this.statistics.avgMessageGenerationTime =
      (this.statistics.avgMessageGenerationTime * (count - 1) + newTime) / count
  }

  /**
   * Manual message generation for specific errors
   */
  async generateMessageForError(
    error: ClassifiedError,
    context?: ErrorContext,
    options?: Partial<ErrorDisplayOptions>
  ): Promise<LocalizedErrorMessage> {
    const displayOptions = {...this.config.defaultDisplayOptions, ...options}

    const message = this.userMessageSystem.generateUserMessage(error, context, displayOptions)

    this.emit('manualMessageGenerated', {
      error,
      context,
      message,
      options: displayOptions
    })

    return message
  }

  /**
   * Add custom message filter
   */
  addMessageFilter(filter: (error: ClassifiedError, context?: ErrorContext) => boolean): void {
    if (!this.config.messageFilters) {
      this.config.messageFilters = []
    }
    this.config.messageFilters.push(filter)

    this.emit('filterAdded', {filter})
  }

  /**
   * Remove all message filters
   */
  clearMessageFilters(): void {
    this.config.messageFilters = []
    this.emit('filtersCleared')
  }

  /**
   * Update display options for future messages
   */
  updateDisplayOptions(options: Partial<ErrorDisplayOptions>): void {
    Object.assign(this.config.defaultDisplayOptions, options)
    this.userMessageSystem.updateDisplayOptions(options)

    this.emit('displayOptionsUpdated', options)
  }

  /**
   * Force display of a message regardless of filters
   */
  forceDisplayMessage(
    error: ClassifiedError,
    context?: ErrorContext,
    options?: Partial<ErrorDisplayOptions>
  ): LocalizedErrorMessage {
    const message = this.userMessageSystem.generateUserMessage(error, context, {
      ...this.config.defaultDisplayOptions,
      ...options
    })

    this.activeMessages.add(message.errorId)

    this.emit('messageForceDisplayed', {
      error,
      context,
      message,
      options
    })

    return message
  }

  /**
   * Get current integration statistics
   */
  getStatistics(): IntegrationStatistics {
    return {...this.statistics}
  }

  /**
   * Get active messages from user message system
   */
  getActiveMessages(): LocalizedErrorMessage[] {
    return this.userMessageSystem.getActiveMessages()
  }

  /**
   * Dismiss all active messages
   */
  dismissAllMessages(): void {
    this.userMessageSystem.clearAllMessages()
    this.activeMessages.clear()

    this.emit('allMessagesDismissed')
  }

  /**
   * Get deduplication statistics
   */
  getDeduplicationStats(): {
    totalEntries: number
    duplicatesSuppressed: number
    avgDuplicateCount: number
  } {
    const entries = Array.from(this.deduplicationCache.values())
    const duplicatesSuppressed = entries.reduce((sum, entry) => sum + (entry.count - 1), 0)
    const avgDuplicateCount =
      entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.count, 0) / entries.length : 0

    return {
      totalEntries: entries.length,
      duplicatesSuppressed,
      avgDuplicateCount
    }
  }

  /**
   * Start cleanup timer for deduplication cache and old messages
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupDeduplicationCache()
      this.userMessageSystem.cleanupCache()
    }, 60000) // Run cleanup every minute
  }

  /**
   * Clean up old deduplication entries
   */
  private cleanupDeduplicationCache(): void {
    const now = Date.now()
    const cutoff = now - this.config.deduplicationWindowMs * 2 // Keep entries for 2x window

    let removedCount = 0
    for (const [hash, entry] of this.deduplicationCache.entries()) {
      if (entry.lastOccurrence < cutoff) {
        this.deduplicationCache.delete(hash)
        removedCount++
      }
    }

    if (removedCount > 0) {
      this.emit('cacheCleanup', {
        type: 'deduplication',
        removedEntries: removedCount,
        remainingEntries: this.deduplicationCache.size
      })
    }
  }

  /**
   * Export comprehensive analytics data
   */
  exportAnalytics(): {
    integration: IntegrationStatistics
    userMessages: Record<string, unknown>
    telemetry: string | null
    deduplication: ReturnType<ErrorHandlingIntegration['getDeduplicationStats']>
  } {
    return {
      integration: this.getStatistics(),
      userMessages: this.userMessageSystem.exportAnalytics(),
      telemetry: this.telemetrySystem.exportData ? this.telemetrySystem.exportData('json') : null,
      deduplication: this.getDeduplicationStats()
    }
  }

  /**
   * Health check for the integration system
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy'
    components: {
      errorHandler: boolean
      telemetrySystem: boolean
      userMessageSystem: boolean
    }
    metrics: {
      messageGenerationRate: number
      averageResponseTime: number
      errorRate: number
    }
  } {
    const components = {
      errorHandler: !!this.errorHandler,
      telemetrySystem: this.telemetrySystem?.isRunning?.() ?? true,
      userMessageSystem: !!this.userMessageSystem
    }

    const allHealthy = Object.values(components).every(status => status)

    const metrics = {
      messageGenerationRate:
        this.statistics.totalMessagesGenerated / Math.max(1, this.statistics.totalErrorsProcessed),
      averageResponseTime: this.statistics.avgMessageGenerationTime,
      errorRate:
        this.statistics.messagesSuppressed / Math.max(1, this.statistics.totalErrorsProcessed)
    }

    const status =
      allHealthy && metrics.averageResponseTime < 100
        ? 'healthy'
        : allHealthy
          ? 'degraded'
          : 'unhealthy'

    return {
      status,
      components,
      metrics
    }
  }
}
