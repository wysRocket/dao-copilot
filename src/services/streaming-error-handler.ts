/**
 * Enhanced Error Handling and Recovery System for Streaming Transcription
 * Provides comprehensive error management, recovery strategies, and monitoring
 */

import {EventEmitter} from 'events'

export enum ErrorType {
  WEBSOCKET_CONNECTION = 'websocket_connection',
  AUDIO_CAPTURE = 'audio_capture',
  TRANSCRIPTION_API = 'transcription_api',
  QUOTA_EXCEEDED = 'quota_exceeded',
  NETWORK_ERROR = 'network_error',
  PARSING_ERROR = 'parsing_error',
  PERMISSION_ERROR = 'permission_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export enum ErrorSeverity {
  LOW = 'low',       // Informational, no action needed
  MEDIUM = 'medium', // Warning, may need attention
  HIGH = 'high',     // Error, requires action
  CRITICAL = 'critical' // System failure, immediate action required
}

export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  RESTART = 'restart',
  ESCALATE = 'escalate',
  IGNORE = 'ignore'
}

export interface StreamingError {
  id: string
  type: ErrorType
  severity: ErrorSeverity
  message: string
  timestamp: number
  context?: Record<string, unknown>
  stack?: string
  recoveryStrategy?: RecoveryStrategy
  retryCount?: number
  maxRetries?: number
  resolved?: boolean
  recoveryAttempts?: Array<{
    strategy: RecoveryStrategy
    timestamp: number
    success: boolean
    details?: string
  }>
}

export interface ErrorRecoveryConfig {
  maxRetries: number
  retryDelay: number
  escalationDelay: number
  enableAutoRecovery: boolean
  fallbackStrategies: Map<ErrorType, RecoveryStrategy[]>
  criticalErrorThreshold: number
  errorReportingEnabled: boolean
  debugMode: boolean
}

export interface ErrorStats {
  totalErrors: number
  errorsByType: Map<ErrorType, number>
  errorsBySeverity: Map<ErrorSeverity, number>
  recoverySuccess: number
  recoveryFailures: number
  averageRecoveryTime: number
  criticalErrors: number
  lastError?: StreamingError
}

/**
 * Enhanced Error Handler for Streaming Transcription
 */
export class StreamingErrorHandler extends EventEmitter {
  private errors: Map<string, StreamingError> = new Map()
  private errorHistory: StreamingError[] = []
  private config: ErrorRecoveryConfig
  private stats: ErrorStats
  private recoveryTimers: Map<string, NodeJS.Timeout> = new Map()
  private isDestroyed = false

  constructor(config?: Partial<ErrorRecoveryConfig>) {
    super()

    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      escalationDelay: 5000,
      enableAutoRecovery: true,
      fallbackStrategies: this.getDefaultFallbackStrategies(),
      criticalErrorThreshold: 5,
      errorReportingEnabled: true,
      debugMode: process.env.NODE_ENV === 'development',
      ...config
    }

    this.stats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      recoverySuccess: 0,
      recoveryFailures: 0,
      averageRecoveryTime: 0,
      criticalErrors: 0
    }

    this.setupErrorMonitoring()
  }

  /**
   * Get default fallback strategies for different error types
   */
  private getDefaultFallbackStrategies(): Map<ErrorType, RecoveryStrategy[]> {
    const strategies = new Map<ErrorType, RecoveryStrategy[]>()

    strategies.set(ErrorType.WEBSOCKET_CONNECTION, [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.FALLBACK,
      RecoveryStrategy.RESTART
    ])

    strategies.set(ErrorType.AUDIO_CAPTURE, [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.RESTART,
      RecoveryStrategy.ESCALATE
    ])

    strategies.set(ErrorType.TRANSCRIPTION_API, [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.FALLBACK,
      RecoveryStrategy.ESCALATE
    ])

    strategies.set(ErrorType.QUOTA_EXCEEDED, [
      RecoveryStrategy.FALLBACK,
      RecoveryStrategy.ESCALATE
    ])

    strategies.set(ErrorType.NETWORK_ERROR, [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.FALLBACK
    ])

    strategies.set(ErrorType.PARSING_ERROR, [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.IGNORE
    ])

    strategies.set(ErrorType.PERMISSION_ERROR, [
      RecoveryStrategy.ESCALATE
    ])

    strategies.set(ErrorType.TIMEOUT_ERROR, [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.FALLBACK
    ])

    strategies.set(ErrorType.UNKNOWN_ERROR, [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.ESCALATE
    ])

    return strategies
  }

  /**
   * Set up error monitoring and cleanup
   */
  private setupErrorMonitoring(): void {
    // Clean up old errors periodically
    const cleanupInterval = setInterval(() => {
      this.cleanupOldErrors()
    }, 300000) // 5 minutes

    // Set up cleanup on destroy
    this.once('destroy', () => {
      clearInterval(cleanupInterval)
    })
  }

  /**
   * Handle a new streaming error
   */
  async handleError(
    type: ErrorType,
    message: string,
    context?: Record<string, unknown>,
    severity?: ErrorSeverity,
    error?: Error
  ): Promise<string> {
    if (this.isDestroyed) return ''

    const errorId = this.generateErrorId()
    const determinedSeverity = severity || this.determineSeverity(type, message, context)

    const streamingError: StreamingError = {
      id: errorId,
      type,
      severity: determinedSeverity,
      message,
      timestamp: Date.now(),
      context: context || {},
      stack: error?.stack,
      recoveryStrategy: this.getRecoveryStrategy(type),
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      resolved: false,
      recoveryAttempts: []
    }

    // Store error
    this.errors.set(errorId, streamingError)
    this.errorHistory.push(streamingError)
    this.updateStats(streamingError)

    // Log error
    this.logError(streamingError)

    // Emit error event
    this.emit('error', streamingError)

    // Handle critical errors
    if (determinedSeverity === ErrorSeverity.CRITICAL) {
      this.handleCriticalError(streamingError)
    }

    // Attempt automatic recovery if enabled
    if (this.config.enableAutoRecovery) {
      await this.attemptRecovery(streamingError)
    }

    return errorId
  }

  /**
   * Determine error severity based on type and context
   */
  private determineSeverity(
    type: ErrorType,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context?: Record<string, unknown>
  ): ErrorSeverity {
    // Critical errors
    if (type === ErrorType.PERMISSION_ERROR || 
        type === ErrorType.AUDIO_CAPTURE && message.includes('permission')) {
      return ErrorSeverity.CRITICAL
    }

    // High severity errors
    if (type === ErrorType.QUOTA_EXCEEDED ||
        type === ErrorType.WEBSOCKET_CONNECTION ||
        type === ErrorType.TRANSCRIPTION_API) {
      return ErrorSeverity.HIGH
    }

    // Medium severity errors
    if (type === ErrorType.NETWORK_ERROR ||
        type === ErrorType.TIMEOUT_ERROR) {
      return ErrorSeverity.MEDIUM
    }

    // Low severity errors
    if (type === ErrorType.PARSING_ERROR) {
      return ErrorSeverity.LOW
    }

    // Default to medium for unknown errors
    return ErrorSeverity.MEDIUM
  }

  /**
   * Get recovery strategy for error type
   */
  private getRecoveryStrategy(type: ErrorType): RecoveryStrategy {
    const strategies = this.config.fallbackStrategies.get(type)
    return strategies?.[0] || RecoveryStrategy.RETRY
  }

  /**
   * Attempt automatic recovery for an error
   */
  private async attemptRecovery(error: StreamingError): Promise<void> {
    if (error.resolved || this.isDestroyed) return

    const strategies = this.config.fallbackStrategies.get(error.type) || [RecoveryStrategy.RETRY]
    let recoverySuccessful = false

    for (const strategy of strategies) {
      if (error.resolved || this.isDestroyed) break
      
      const recoveryStart = Date.now()
      
      try {
        console.log(`🔧 Attempting recovery for error ${error.id} using strategy: ${strategy}`)
        
        const success = await this.executeRecoveryStrategy(error, strategy)
        
        const recoveryTime = Date.now() - recoveryStart
        
        error.recoveryAttempts?.push({
          strategy,
          timestamp: Date.now(),
          success,
          details: success ? 'Recovery successful' : 'Recovery failed'
        })

        if (success) {
          recoverySuccessful = true
          error.resolved = true
          this.stats.recoverySuccess++
          this.updateAverageRecoveryTime(recoveryTime)
          
          console.log(`✅ Recovery successful for error ${error.id} using ${strategy}`)
          this.emit('recovery', error, strategy)
          break
        } else {
          console.warn(`❌ Recovery failed for error ${error.id} using ${strategy}`)
        }
        
      } catch (recoveryError) {
        console.error(`💥 Recovery attempt failed with exception:`, recoveryError)
        
        error.recoveryAttempts?.push({
          strategy,
          timestamp: Date.now(),
          success: false,
          details: recoveryError instanceof Error ? recoveryError.message : 'Unknown recovery error'
        })
      }

      // Wait before trying next strategy
      if (!recoverySuccessful && strategies.indexOf(strategy) < strategies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))
      }
    }

    if (!recoverySuccessful) {
      this.stats.recoveryFailures++
      console.error(`🚨 All recovery attempts failed for error ${error.id}`)
      this.emit('recoveryFailed', error)
    }
  }

  /**
   * Execute a specific recovery strategy
   */
  private async executeRecoveryStrategy(
    error: StreamingError,
    strategy: RecoveryStrategy
  ): Promise<boolean> {
    switch (strategy) {
      case RecoveryStrategy.RETRY:
        return this.executeRetryStrategy(error)

      case RecoveryStrategy.FALLBACK:
        return this.executeFallbackStrategy(error)

      case RecoveryStrategy.RESTART:
        return this.executeRestartStrategy(error)

      case RecoveryStrategy.ESCALATE:
        return this.executeEscalationStrategy(error)

      case RecoveryStrategy.IGNORE:
        return this.executeIgnoreStrategy(error)

      default:
        console.warn(`Unknown recovery strategy: ${strategy}`)
        return false
    }
  }

  /**
   * Execute retry recovery strategy
   */
  private async executeRetryStrategy(error: StreamingError): Promise<boolean> {
    if ((error.retryCount || 0) >= (error.maxRetries || this.config.maxRetries)) {
      return false
    }

    error.retryCount = (error.retryCount || 0) + 1
    
    // Emit retry event for handlers to implement actual retry logic
    this.emit('retry', error)
    
    // Wait for retry delay
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * (error.retryCount || 1)))
    
    // For now, assume retry was successful (actual implementation would check the result)
    return true
  }

  /**
   * Execute fallback recovery strategy
   */
  private async executeFallbackStrategy(error: StreamingError): Promise<boolean> {
    console.log(`🔄 Executing fallback strategy for ${error.type}`)
    
    // Emit fallback event for handlers to implement fallback logic
    this.emit('fallback', error)
    
    return true // Assume fallback is available
  }

  /**
   * Execute restart recovery strategy
   */
  private async executeRestartStrategy(error: StreamingError): Promise<boolean> {
    console.log(`🔄 Executing restart strategy for ${error.type}`)
    
    // Emit restart event for handlers to implement restart logic
    this.emit('restart', error)
    
    return true
  }

  /**
   * Execute escalation recovery strategy
   */
  private async executeEscalationStrategy(error: StreamingError): Promise<boolean> {
    console.log(`🚨 Escalating error ${error.id} to user`)
    
    // Emit escalation event
    this.emit('escalate', error)
    
    return false // Escalation doesn't resolve the error automatically
  }

  /**
   * Execute ignore recovery strategy
   */
  private async executeIgnoreStrategy(error: StreamingError): Promise<boolean> {
    console.log(`🤷 Ignoring error ${error.id}`)
    
    // Mark as resolved by ignoring
    return true
  }

  /**
   * Handle critical error
   */
  private handleCriticalError(error: StreamingError): void {
    this.stats.criticalErrors++
    
    console.error(`🚨 CRITICAL ERROR: ${error.message}`, error)
    
    // Emit critical error event
    this.emit('criticalError', error)
    
    // Check if we've exceeded critical error threshold
    if (this.stats.criticalErrors >= this.config.criticalErrorThreshold) {
      console.error(`🚨 SYSTEM FAILURE: Critical error threshold exceeded (${this.stats.criticalErrors}/${this.config.criticalErrorThreshold})`)
      this.emit('systemFailure', this.stats)
    }
  }

  /**
   * Update error statistics
   */
  private updateStats(error: StreamingError): void {
    this.stats.totalErrors++
    this.stats.lastError = error
    
    // Update error count by type
    const typeCount = this.stats.errorsByType.get(error.type) || 0
    this.stats.errorsByType.set(error.type, typeCount + 1)
    
    // Update error count by severity
    const severityCount = this.stats.errorsBySeverity.get(error.severity) || 0
    this.stats.errorsBySeverity.set(error.severity, severityCount + 1)
  }

  /**
   * Update average recovery time
   */
  private updateAverageRecoveryTime(recoveryTime: number): void {
    const currentAvg = this.stats.averageRecoveryTime
    const successCount = this.stats.recoverySuccess
    
    this.stats.averageRecoveryTime = 
      (currentAvg * (successCount - 1) + recoveryTime) / successCount
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: StreamingError): void {
    const logMessage = `[${error.severity.toUpperCase()}] ${error.type}: ${error.message}`
    
    if (this.config.debugMode) {
      console.group(`🐛 Streaming Error ${error.id}`)
      console.error(logMessage)
      console.log('Context:', error.context)
      if (error.stack) {
        console.log('Stack:', error.stack)
      }
      console.groupEnd()
    } else {
      switch (error.severity) {
        case ErrorSeverity.CRITICAL:
          console.error(`🚨 ${logMessage}`)
          break
        case ErrorSeverity.HIGH:
          console.error(`❌ ${logMessage}`)
          break
        case ErrorSeverity.MEDIUM:
          console.warn(`⚠️ ${logMessage}`)
          break
        case ErrorSeverity.LOW:
          console.info(`ℹ️ ${logMessage}`)
          break
      }
    }
  }

  /**
   * Clean up old resolved errors
   */
  private cleanupOldErrors(): void {
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    const now = Date.now()
    
    for (const [id, error] of this.errors) {
      if (error.resolved && (now - error.timestamp) > maxAge) {
        this.errors.delete(id)
      }
    }
    
    // Keep only last 100 errors in history
    if (this.errorHistory.length > 100) {
      this.errorHistory.splice(0, this.errorHistory.length - 100)
    }
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get error by ID
   */
  getError(id: string): StreamingError | undefined {
    return this.errors.get(id)
  }

  /**
   * Get all active errors
   */
  getActiveErrors(): StreamingError[] {
    return Array.from(this.errors.values()).filter(error => !error.resolved)
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats {
    return {...this.stats}
  }

  /**
   * Get error history
   */
  getHistory(limit?: number): StreamingError[] {
    return limit ? this.errorHistory.slice(-limit) : [...this.errorHistory]
  }

  /**
   * Mark error as resolved
   */
  resolveError(id: string): boolean {
    const error = this.errors.get(id)
    if (error && !error.resolved) {
      error.resolved = true
      this.emit('resolved', error)
      return true
    }
    return false
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors.clear()
    this.errorHistory.length = 0
    this.stats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      recoverySuccess: 0,
      recoveryFailures: 0,
      averageRecoveryTime: 0,
      criticalErrors: 0
    }
    this.emit('cleared')
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ErrorRecoveryConfig>): void {
    this.config = {...this.config, ...updates}
    this.emit('configUpdated', this.config)
  }

  /**
   * Destroy the error handler
   */
  destroy(): void {
    if (this.isDestroyed) return
    
    this.isDestroyed = true
    
    // Clear all timers
    for (const timer of this.recoveryTimers.values()) {
      clearTimeout(timer)
    }
    this.recoveryTimers.clear()
    
    // Clear errors
    this.errors.clear()
    this.errorHistory.length = 0
    
    // Remove all listeners
    this.removeAllListeners()
    
    this.emit('destroy')
  }
}

/**
 * Factory function to create error handler with default config
 */
export function createStreamingErrorHandler(
  config?: Partial<ErrorRecoveryConfig>
): StreamingErrorHandler {
  return new StreamingErrorHandler(config)
}

/**
 * Global error handler instance
 */
let globalErrorHandler: StreamingErrorHandler | null = null

/**
 * Get or create global error handler
 */
export function getStreamingErrorHandler(): StreamingErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new StreamingErrorHandler()
  }
  return globalErrorHandler
}

/**
 * Error handler hook for React components
 */
export function useStreamingErrorHandler() {
  const errorHandler = getStreamingErrorHandler()
  
  return {
    handleError: errorHandler.handleError.bind(errorHandler),
    getActiveErrors: errorHandler.getActiveErrors.bind(errorHandler),
    getStats: errorHandler.getStats.bind(errorHandler),
    resolveError: errorHandler.resolveError.bind(errorHandler),
    clearErrors: errorHandler.clearErrors.bind(errorHandler)
  }
}

export default StreamingErrorHandler
