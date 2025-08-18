/**
 * ErrorHandler - Comprehensive Error Detection, Classification, and Recovery
 *
 * A centralized error handling system that:
 * - Detects and classifies errors into specific categories
 * - Integrates with existing fallback infrastructure (CircuitBreaker, RetryPolicy, etc.)
 * - Provides context-aware error recovery strategies
 * - Maintains error telemetry and patterns analysis
 * - Coordinates with UI components for user-facing error messaging
 */

import {EventEmitter} from 'events'
import {ConnectionMonitor} from '../network/ConnectionMonitor'
import {CircuitBreaker} from '../fallback/CircuitBreaker'
import {RetryPolicy} from '../fallback/RetryPolicy'
import {FallbackManager} from '../fallback/FallbackManager'

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  // Network-related errors
  NETWORK_CONNECTION = 'network_connection',
  NETWORK_TIMEOUT = 'network_timeout',
  NETWORK_UNAVAILABLE = 'network_unavailable',

  // Authentication and authorization errors
  AUTH_TOKEN_EXPIRED = 'auth_token_expired',
  AUTH_INVALID_CREDENTIALS = 'auth_invalid_credentials',
  AUTH_PERMISSION_DENIED = 'auth_permission_denied',

  // API and service errors
  API_RATE_LIMIT = 'api_rate_limit',
  API_QUOTA_EXCEEDED = 'api_quota_exceeded',
  API_SERVICE_UNAVAILABLE = 'api_service_unavailable',
  API_INVALID_REQUEST = 'api_invalid_request',

  // WebSocket specific errors
  WEBSOCKET_CONNECTION_FAILED = 'websocket_connection_failed',
  WEBSOCKET_UNEXPECTED_CLOSE = 'websocket_unexpected_close',
  WEBSOCKET_PROTOCOL_ERROR = 'websocket_protocol_error',
  WEBSOCKET_SCHEMA_ERROR = 'websocket_schema_error',

  // Transcription service errors
  TRANSCRIPTION_SERVICE_ERROR = 'transcription_service_error',
  TRANSCRIPTION_AUDIO_FORMAT = 'transcription_audio_format',
  TRANSCRIPTION_LANGUAGE_UNSUPPORTED = 'transcription_language_unsupported',

  // Resource and performance errors
  MEMORY_EXHAUSTION = 'memory_exhaustion',
  STORAGE_FULL = 'storage_full',
  CPU_OVERLOAD = 'cpu_overload',

  // Data integrity errors
  DATA_CORRUPTION = 'data_corruption',
  CHECKSUM_MISMATCH = 'checksum_mismatch',
  SERIALIZATION_ERROR = 'serialization_error',

  // System and application errors
  INITIALIZATION_ERROR = 'initialization_error',
  CONFIGURATION_ERROR = 'configuration_error',
  DEPENDENCY_ERROR = 'dependency_error',

  // Unknown/unclassified errors
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low', // Minor issues that don't affect core functionality
  MEDIUM = 'medium', // Moderate issues with potential workarounds
  HIGH = 'high', // Serious issues affecting functionality
  CRITICAL = 'critical' // Severe issues requiring immediate attention
}

/**
 * Error context information
 */
export interface ErrorContext {
  timestamp: number
  sessionId?: string
  utteranceId?: string
  component: string
  operation: string
  connectionId?: string
  userId?: string
  metadata?: Record<string, unknown>
  stackTrace?: string
  previousErrors?: ClassifiedError[]
}

/**
 * Classified error information
 */
export interface ClassifiedError {
  id: string
  originalError: Error
  category: ErrorCategory
  severity: ErrorSeverity
  context: ErrorContext
  isRetryable: boolean
  suggestedAction: string
  recoveryStrategy?: string
  userMessage?: string
  detectedAt: number
  occurrenceCount: number
}

/**
 * Error detection rules
 */
interface ErrorDetectionRule {
  name: string
  category: ErrorCategory
  severity: ErrorSeverity
  matcher: (error: Error, context: ErrorContext) => boolean
  isRetryable: boolean
  suggestedAction: string
  recoveryStrategy?: string
  userMessageTemplate?: string
}

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  enableTelemetry: boolean
  maxErrorHistory: number
  errorAggregationWindow: number // ms
  retryAttempts: number
  enableUserNotifications: boolean
  enableRecoveryActions: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  customRules?: ErrorDetectionRule[]
}

/**
 * Default error handler configuration
 */
export const DEFAULT_ERROR_HANDLER_CONFIG: ErrorHandlerConfig = {
  enableTelemetry: true,
  maxErrorHistory: 1000,
  errorAggregationWindow: 60000, // 1 minute
  retryAttempts: 3,
  enableUserNotifications: true,
  enableRecoveryActions: true,
  logLevel: 'warn',
  customRules: []
}

/**
 * Error statistics
 */
export interface ErrorStats {
  totalErrors: number
  errorsByCategory: Record<ErrorCategory, number>
  errorsBySeverity: Record<ErrorSeverity, number>
  recentErrors: ClassifiedError[]
  errorRate: number // errors per minute
  recoverySuccessRate: number
  lastError?: ClassifiedError
}

/**
 * Comprehensive Error Handler
 *
 * Central system for detecting, classifying, and coordinating recovery from errors
 * across the transcription pipeline.
 */
export class ErrorHandler extends EventEmitter {
  private config: ErrorHandlerConfig
  private detectionRules: ErrorDetectionRule[]
  private errorHistory: ClassifiedError[] = []
  private errorCounts: Map<string, number> = new Map()
  private lastErrorTime: number = 0

  // Integration with existing infrastructure
  private connectionMonitor?: ConnectionMonitor
  private circuitBreaker?: CircuitBreaker
  private retryPolicy?: RetryPolicy
  private fallbackManager?: FallbackManager

  // State management
  private isInitialized: boolean = false
  private isDestroyed: boolean = false

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    super()

    this.config = {...DEFAULT_ERROR_HANDLER_CONFIG, ...config}
    this.detectionRules = this.createDefaultDetectionRules()

    // Add custom rules if provided
    if (this.config.customRules) {
      this.detectionRules.push(...this.config.customRules)
    }
  }

  /**
   * Initialize the error handler
   */
  async initialize(dependencies?: {
    connectionMonitor?: ConnectionMonitor
    circuitBreaker?: CircuitBreaker
    retryPolicy?: RetryPolicy
    fallbackManager?: FallbackManager
  }): Promise<void> {
    if (this.isInitialized) {
      return
    }

    // Set up infrastructure dependencies
    if (dependencies) {
      this.connectionMonitor = dependencies.connectionMonitor
      this.circuitBreaker = dependencies.circuitBreaker
      this.retryPolicy = dependencies.retryPolicy
      this.fallbackManager = dependencies.fallbackManager
    }

    // Set up error monitoring for dependencies
    this.setupDependencyErrorListeners()

    this.isInitialized = true
    this.emit('initialized')
  }

  /**
   * Detect and classify an error
   */
  async detectAndClassify(error: Error, context: ErrorContext): Promise<ClassifiedError> {
    if (this.isDestroyed) {
      throw new Error('ErrorHandler has been destroyed')
    }

    const errorId = this.generateErrorId(error, context)

    // Check if we've seen this error before
    const occurrenceCount = (this.errorCounts.get(errorId) || 0) + 1
    this.errorCounts.set(errorId, occurrenceCount)

    // Find matching detection rule
    const matchingRule = this.detectionRules.find(rule => rule.matcher(error, context))

    const classifiedError: ClassifiedError = {
      id: errorId,
      originalError: error,
      category: matchingRule?.category || ErrorCategory.UNKNOWN_ERROR,
      severity: matchingRule?.severity || ErrorSeverity.MEDIUM,
      context,
      isRetryable: matchingRule?.isRetryable ?? true,
      suggestedAction: matchingRule?.suggestedAction || 'Log error and continue',
      recoveryStrategy: matchingRule?.recoveryStrategy,
      userMessage: this.generateUserMessage(matchingRule, error),
      detectedAt: Date.now(),
      occurrenceCount
    }

    // Add to error history
    this.addToErrorHistory(classifiedError)

    // Update telemetry
    if (this.config.enableTelemetry) {
      this.updateTelemetry(classifiedError)
    }

    // Emit error detection event
    this.emit('errorDetected', classifiedError)

    // Log the error
    this.logError(classifiedError)

    return classifiedError
  }

  /**
   * Handle a classified error
   */
  async handleError(classifiedError: ClassifiedError): Promise<boolean> {
    try {
      // Emit error handling event
      this.emit('errorHandling', classifiedError)

      // Determine if this error should trigger circuit breaker
      if (this.shouldTriggerCircuitBreaker(classifiedError)) {
        await this.triggerCircuitBreaker(classifiedError)
      }

      // Determine if this error should trigger fallback
      if (this.shouldTriggerFallback(classifiedError)) {
        await this.triggerFallback(classifiedError)
      }

      // Execute recovery strategy if available
      let recoverySuccess = false
      if (this.config.enableRecoveryActions && classifiedError.recoveryStrategy) {
        recoverySuccess = await this.executeRecoveryStrategy(classifiedError)
      }

      // Emit error handled event
      this.emit('errorHandled', {classifiedError, recoverySuccess})

      return recoverySuccess
    } catch (handlingError) {
      this.emit('error', new Error(`Error handling failed: ${handlingError}`))
      return false
    }
  }

  /**
   * Get current error statistics
   */
  getStats(): ErrorStats {
    const now = Date.now()
    const windowStart = now - this.config.errorAggregationWindow
    const recentErrors = this.errorHistory.filter(error => error.detectedAt >= windowStart)

    // Calculate error rate (errors per minute)
    const errorRate = recentErrors.length / (this.config.errorAggregationWindow / 60000)

    // Calculate recovery success rate
    const errorsWithRecovery = this.errorHistory.filter(
      error => error.recoveryStrategy && error.detectedAt >= windowStart
    )
    const successfulRecoveries = errorsWithRecovery.length // Simplified for now
    const recoverySuccessRate =
      errorsWithRecovery.length > 0 ? successfulRecoveries / errorsWithRecovery.length : 0

    // Group by category
    const errorsByCategory = {} as Record<ErrorCategory, number>
    Object.values(ErrorCategory).forEach(category => {
      errorsByCategory[category] = this.errorHistory.filter(
        error => error.category === category
      ).length
    })

    // Group by severity
    const errorsBySeverity = {} as Record<ErrorSeverity, number>
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = this.errorHistory.filter(
        error => error.severity === severity
      ).length
    })

    return {
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      errorsBySeverity,
      recentErrors,
      errorRate,
      recoverySuccessRate,
      lastError: this.errorHistory[this.errorHistory.length - 1]
    }
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: ClassifiedError): boolean {
    return error.isRetryable && error.severity !== ErrorSeverity.CRITICAL
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(error: ClassifiedError): string {
    return error.userMessage || 'An unexpected error occurred. Please try again.'
  }

  /**
   * Add custom detection rule
   */
  addDetectionRule(rule: ErrorDetectionRule): void {
    this.detectionRules.push(rule)
    this.emit('ruleAdded', rule)
  }

  /**
   * Remove detection rule by name
   */
  removeDetectionRule(name: string): boolean {
    const initialLength = this.detectionRules.length
    this.detectionRules = this.detectionRules.filter(rule => rule.name !== name)

    const removed = this.detectionRules.length < initialLength
    if (removed) {
      this.emit('ruleRemoved', name)
    }

    return removed
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory.length = 0
    this.errorCounts.clear()
    this.emit('historyCleared')
  }

  /**
   * Destroy the error handler
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true
    this.clearErrorHistory()
    this.emit('destroyed')
  }

  // Private methods

  /**
   * Create default error detection rules
   */
  private createDefaultDetectionRules(): ErrorDetectionRule[] {
    return [
      // Network errors
      {
        name: 'NetworkConnectionError',
        category: ErrorCategory.NETWORK_CONNECTION,
        severity: ErrorSeverity.HIGH,
        matcher: error =>
          error.message.toLowerCase().includes('network') ||
          error.message.toLowerCase().includes('connection'),
        isRetryable: true,
        suggestedAction: 'Retry with exponential backoff',
        recoveryStrategy: 'networkReconnect',
        userMessageTemplate: 'Connection issue detected. Attempting to reconnect...'
      },

      // WebSocket errors
      {
        name: 'WebSocketSchemaError',
        category: ErrorCategory.WEBSOCKET_SCHEMA_ERROR,
        severity: ErrorSeverity.HIGH,
        matcher: error =>
          error.message.includes('1007') ||
          error.message.toLowerCase().includes('invalid json payload'),
        isRetryable: true,
        suggestedAction: 'Trigger transport fallback',
        recoveryStrategy: 'transportFallback',
        userMessageTemplate: 'Connection protocol issue. Switching to backup connection...'
      },

      // Authentication errors
      {
        name: 'AuthTokenExpired',
        category: ErrorCategory.AUTH_TOKEN_EXPIRED,
        severity: ErrorSeverity.MEDIUM,
        matcher: error =>
          error.message.toLowerCase().includes('token expired') ||
          error.message.toLowerCase().includes('unauthorized'),
        isRetryable: true,
        suggestedAction: 'Refresh authentication token',
        recoveryStrategy: 'tokenRefresh',
        userMessageTemplate: 'Session expired. Refreshing authentication...'
      },

      // API quota errors
      {
        name: 'ApiQuotaExceeded',
        category: ErrorCategory.API_QUOTA_EXCEEDED,
        severity: ErrorSeverity.HIGH,
        matcher: error =>
          error.message.toLowerCase().includes('quota exceeded') ||
          error.message.toLowerCase().includes('rate limit'),
        isRetryable: false,
        suggestedAction: 'Wait for quota reset or upgrade plan',
        userMessageTemplate:
          'Service temporarily unavailable due to usage limits. Please try again later.'
      },

      // Memory/resource errors
      {
        name: 'MemoryExhaustion',
        category: ErrorCategory.MEMORY_EXHAUSTION,
        severity: ErrorSeverity.CRITICAL,
        matcher: error =>
          error.message.toLowerCase().includes('out of memory') || error.name === 'RangeError',
        isRetryable: false,
        suggestedAction: 'Clear buffers and reduce memory usage',
        recoveryStrategy: 'memoryCleanup',
        userMessageTemplate: 'System resource limit reached. Optimizing performance...'
      },

      // Transcription service errors
      {
        name: 'TranscriptionServiceError',
        category: ErrorCategory.TRANSCRIPTION_SERVICE_ERROR,
        severity: ErrorSeverity.MEDIUM,
        matcher: (error, context) =>
          context.component.includes('transcription') || context.component.includes('gemini'),
        isRetryable: true,
        suggestedAction: 'Retry with different configuration',
        recoveryStrategy: 'serviceRestart',
        userMessageTemplate: 'Transcription service issue. Attempting recovery...'
      },

      // General fallback rule
      {
        name: 'UnknownError',
        category: ErrorCategory.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        matcher: () => true, // Catches all unmatched errors
        isRetryable: true,
        suggestedAction: 'Log error and apply general recovery',
        userMessageTemplate: 'An unexpected issue occurred. Our system is working to resolve it.'
      }
    ]
  }

  /**
   * Setup error listeners for infrastructure dependencies
   */
  private setupDependencyErrorListeners(): void {
    if (this.connectionMonitor) {
      this.connectionMonitor.on('connectionError', async error => {
        const context: ErrorContext = {
          timestamp: Date.now(),
          component: 'ConnectionMonitor',
          operation: 'connection_monitoring'
        }

        const classified = await this.detectAndClassify(error, context)
        await this.handleError(classified)
      })
    }

    if (this.circuitBreaker) {
      this.circuitBreaker.on('error', async error => {
        const context: ErrorContext = {
          timestamp: Date.now(),
          component: 'CircuitBreaker',
          operation: 'circuit_protection'
        }

        const classified = await this.detectAndClassify(error, context)
        await this.handleError(classified)
      })
    }
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(error: Error, context: ErrorContext): string {
    const errorSignature = `${error.name}-${error.message}-${context.component}-${context.operation}`
    return Buffer.from(errorSignature).toString('base64').substring(0, 16)
  }

  /**
   * Generate user-friendly message
   */
  private generateUserMessage(rule: ErrorDetectionRule | undefined, error: Error): string {
    if (rule?.userMessageTemplate) {
      return rule.userMessageTemplate
    }

    // Fallback to generic message
    return 'A technical issue occurred. Our system is working to resolve it automatically.'
  }

  /**
   * Add error to history with size management
   */
  private addToErrorHistory(error: ClassifiedError): void {
    this.errorHistory.push(error)

    // Maintain history size limit
    if (this.errorHistory.length > this.config.maxErrorHistory) {
      this.errorHistory.shift()
    }

    this.lastErrorTime = error.detectedAt
  }

  /**
   * Update telemetry data
   */
  private updateTelemetry(error: ClassifiedError): void {
    // This would integrate with actual telemetry system
    // For now, just emit telemetry event
    this.emit('telemetry', {
      type: 'error_detected',
      category: error.category,
      severity: error.severity,
      timestamp: error.detectedAt,
      context: error.context
    })
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: ClassifiedError): void {
    const logLevel = this.getLogLevelForSeverity(error.severity)
    const logMessage = `[${error.category}] ${error.originalError.message}`

    // This would integrate with actual logging system
    console[logLevel](`ErrorHandler: ${logMessage}`, {
      errorId: error.id,
      category: error.category,
      severity: error.severity,
      context: error.context,
      occurrenceCount: error.occurrenceCount
    })
  }

  /**
   * Get appropriate log level for error severity
   */
  private getLogLevelForSeverity(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'info'
      case ErrorSeverity.MEDIUM:
        return 'warn'
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return 'error'
      default:
        return 'warn'
    }
  }

  /**
   * Check if error should trigger circuit breaker
   */
  private shouldTriggerCircuitBreaker(error: ClassifiedError): boolean {
    return (
      error.severity === ErrorSeverity.CRITICAL ||
      error.category === ErrorCategory.API_SERVICE_UNAVAILABLE ||
      error.occurrenceCount >= 5
    )
  }

  /**
   * Trigger circuit breaker
   */
  private async triggerCircuitBreaker(error: ClassifiedError): Promise<void> {
    if (this.circuitBreaker) {
      this.emit('circuitBreakerTriggered', error)
      // CircuitBreaker will handle its own state transitions
    }
  }

  /**
   * Check if error should trigger fallback
   */
  private shouldTriggerFallback(error: ClassifiedError): boolean {
    return (
      error.category === ErrorCategory.WEBSOCKET_SCHEMA_ERROR ||
      error.category === ErrorCategory.NETWORK_CONNECTION ||
      error.category === ErrorCategory.TRANSCRIPTION_SERVICE_ERROR
    )
  }

  /**
   * Trigger fallback mechanism
   */
  private async triggerFallback(error: ClassifiedError): Promise<void> {
    if (this.fallbackManager) {
      this.emit('fallbackTriggered', error)
      // FallbackManager will handle transport switching
    }
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(error: ClassifiedError): Promise<boolean> {
    try {
      switch (error.recoveryStrategy) {
        case 'networkReconnect':
          return await this.executeNetworkReconnect(error)
        case 'transportFallback':
          return await this.executeTransportFallback(error)
        case 'tokenRefresh':
          return await this.executeTokenRefresh(error)
        case 'memoryCleanup':
          return await this.executeMemoryCleanup(error)
        case 'serviceRestart':
          return await this.executeServiceRestart(error)
        default:
          this.emit('unknownRecoveryStrategy', error.recoveryStrategy)
          return false
      }
    } catch (recoveryError) {
      this.emit('recoveryError', {originalError: error, recoveryError})
      return false
    }
  }

  /**
   * Execute network reconnect recovery
   */
  private async executeNetworkReconnect(error: ClassifiedError): Promise<boolean> {
    if (this.connectionMonitor) {
      this.emit('networkReconnectInitiated', error)
      // ConnectionMonitor will handle reconnection
      return true
    }
    return false
  }

  /**
   * Execute transport fallback recovery
   */
  private async executeTransportFallback(error: ClassifiedError): Promise<boolean> {
    if (this.fallbackManager) {
      this.emit('transportFallbackInitiated', error)
      // FallbackManager will handle transport switching
      return true
    }
    return false
  }

  /**
   * Execute token refresh recovery
   */
  private async executeTokenRefresh(error: ClassifiedError): Promise<boolean> {
    this.emit('tokenRefreshInitiated', error)
    // This would integrate with authentication system
    // For now, just emit event for external handling
    return true
  }

  /**
   * Execute memory cleanup recovery
   */
  private async executeMemoryCleanup(error: ClassifiedError): Promise<boolean> {
    this.emit('memoryCleanupInitiated', error)

    // Clear error history to free memory
    if (this.errorHistory.length > 100) {
      this.errorHistory.splice(0, this.errorHistory.length - 100)
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    return true
  }

  /**
   * Execute service restart recovery
   */
  private async executeServiceRestart(error: ClassifiedError): Promise<boolean> {
    this.emit('serviceRestartInitiated', error)
    // This would coordinate with service managers
    // For now, just emit event for external handling
    return true
  }
}

export default ErrorHandler
