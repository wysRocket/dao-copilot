/**
 * Error Handling and Logging System for Gemini Live API
 * Comprehensive error management, classification, and logging
 */

import {EventEmitter} from 'events'

export enum ErrorType {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  API = 'api',
  WEBSOCKET = 'websocket',
  VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  CONNECTION_REFUSED = 'connection_refused',
  SSL_ERROR = 'ssl_error',
  DNS_ERROR = 'dns_error',
  MODEL_ERROR = 'model_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  PARSE_ERROR = 'parse_error',
  SESSION_ERROR = 'session_error',
  CIRCUIT_BREAKER = 'circuit_breaker',
  UNKNOWN = 'unknown'
}

export enum CircuitBreakerState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Circuit is open, requests are blocked
  HALF_OPEN = 'half_open' // Testing if service has recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures before opening circuit
  successThreshold: number // Number of successes needed to close circuit
  timeout: number // How long to wait before trying again (ms)
  monitoringPeriod: number // Period to monitor for failures (ms)
}

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface GeminiError {
  id: string
  type: ErrorType
  code?: string
  message: string
  details?: unknown
  timestamp: number
  context?: Record<string, unknown>
  stack?: string
  retryable: boolean
  retryCount?: number
  maxRetries?: number
}

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: number
  context?: Record<string, unknown>
  error?: GeminiError
  metadata?: Record<string, unknown>
}

export interface ErrorStats {
  total: number
  byType: Record<ErrorType, number>
  byCode: Record<string, number>
  retryable: number
  nonRetryable: number
  recovered: number
  lastError?: GeminiError
  lastOccurrence: number
  circuitBreakerTrips: number
}

export enum RecoveryStrategy {
  IMMEDIATE = 'immediate',
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  LINEAR_BACKOFF = 'linear_backoff',
  CIRCUIT_BREAKER = 'circuit_breaker',
  FALLBACK = 'fallback',
  NONE = 'none'
}

export interface RecoveryConfig {
  strategy: RecoveryStrategy
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  fallbackFunction?: () => Promise<unknown>
}

export interface ErrorRecovery {
  errorId: string
  strategy: RecoveryStrategy
  attempt: number
  startTime: number
  lastAttemptTime: number
  isRecovering: boolean
  recovered: boolean
}

/**
 * Comprehensive Error Handler for Gemini Live API
 */
export class GeminiErrorHandler extends EventEmitter {
  private errors: GeminiError[] = []
  private logs: LogEntry[] = []
  private stats: ErrorStats = {
    total: 0,
    byType: {} as Record<ErrorType, number>,
    byCode: {},
    retryable: 0,
    nonRetryable: 0,
    recovered: 0,
    lastOccurrence: 0,
    circuitBreakerTrips: 0
  }

  private maxErrorHistory = 1000
  private maxLogHistory = 5000
  private logLevel: LogLevel = LogLevel.INFO
  private errorIdCounter = 0
  private logIdCounter = 0

  // Circuit breaker implementation
  private circuitBreaker: {
    state: CircuitBreakerState
    failureCount: number
    successCount: number
    lastFailureTime: number
    config: CircuitBreakerConfig
  }

  // Recovery mechanisms
  private activeRecoveries: Map<string, ErrorRecovery> = new Map()
  private recoveryConfigs: Map<ErrorType, RecoveryConfig> = new Map()

  constructor(options?: {
    maxErrorHistory?: number
    maxLogHistory?: number
    logLevel?: LogLevel
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  }) {
    super()

    if (options) {
      this.maxErrorHistory = options.maxErrorHistory ?? this.maxErrorHistory
      this.maxLogHistory = options.maxLogHistory ?? this.maxLogHistory
      this.logLevel = options.logLevel ?? this.logLevel
    }

    // Initialize error type counters
    Object.values(ErrorType).forEach(type => {
      this.stats.byType[type] = 0
    })

    // Initialize circuit breaker
    this.circuitBreaker = {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      config: {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000, // 1 minute
        monitoringPeriod: 300000, // 5 minutes
        ...options?.circuitBreakerConfig
      }
    }

    // Initialize default recovery strategies
    this.initializeDefaultRecoveryStrategies()
  }

  /**
   * Initialize default recovery strategies for different error types
   */
  private initializeDefaultRecoveryStrategies(): void {
    // Network errors: exponential backoff
    this.recoveryConfigs.set(ErrorType.NETWORK, {
      strategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
      maxAttempts: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2
    })

    // WebSocket errors: circuit breaker pattern
    this.recoveryConfigs.set(ErrorType.WEBSOCKET, {
      strategy: RecoveryStrategy.CIRCUIT_BREAKER,
      maxAttempts: 3,
      baseDelay: 5000,
      maxDelay: 60000,
      backoffMultiplier: 2
    })

    // Timeout errors: linear backoff
    this.recoveryConfigs.set(ErrorType.TIMEOUT, {
      strategy: RecoveryStrategy.LINEAR_BACKOFF,
      maxAttempts: 3,
      baseDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 1.5
    })

    // Rate limit errors: exponential backoff with longer delays
    this.recoveryConfigs.set(ErrorType.RATE_LIMIT, {
      strategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
      maxAttempts: 5,
      baseDelay: 5000,
      maxDelay: 300000, // 5 minutes
      backoffMultiplier: 2
    })

    // Service unavailable: circuit breaker
    this.recoveryConfigs.set(ErrorType.SERVICE_UNAVAILABLE, {
      strategy: RecoveryStrategy.CIRCUIT_BREAKER,
      maxAttempts: 3,
      baseDelay: 10000,
      maxDelay: 120000,
      backoffMultiplier: 2
    })

    // Authentication errors: no recovery (immediate failure)
    this.recoveryConfigs.set(ErrorType.AUTHENTICATION, {
      strategy: RecoveryStrategy.NONE,
      maxAttempts: 0,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1
    })

    // Validation errors: no recovery
    this.recoveryConfigs.set(ErrorType.VALIDATION, {
      strategy: RecoveryStrategy.NONE,
      maxAttempts: 0,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1
    })
  }

  /**
   * Check circuit breaker state before allowing operation
   */
  canProceed(): boolean {
    const now = Date.now()

    switch (this.circuitBreaker.state) {
      case CircuitBreakerState.CLOSED:
        return true

      case CircuitBreakerState.OPEN:
        // Check if timeout has passed
        if (now - this.circuitBreaker.lastFailureTime >= this.circuitBreaker.config.timeout) {
          this.circuitBreaker.state = CircuitBreakerState.HALF_OPEN
          this.circuitBreaker.successCount = 0
          this.info('Circuit breaker moved to HALF_OPEN state')
          return true
        }
        return false

      case CircuitBreakerState.HALF_OPEN:
        return true

      default:
        return false
    }
  }

  /**
   * Record success for circuit breaker
   */
  recordSuccess(): void {
    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreaker.successCount++

      if (this.circuitBreaker.successCount >= this.circuitBreaker.config.successThreshold) {
        this.circuitBreaker.state = CircuitBreakerState.CLOSED
        this.circuitBreaker.failureCount = 0
        this.info('Circuit breaker closed after successful recovery')
      }
    }
  }

  /**
   * Record failure for circuit breaker
   */
  recordFailure(): void {
    this.circuitBreaker.failureCount++
    this.circuitBreaker.lastFailureTime = Date.now()

    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      // Failed during testing, go back to open
      this.circuitBreaker.state = CircuitBreakerState.OPEN
      this.stats.circuitBreakerTrips++
      this.warn('Circuit breaker opened after failed recovery attempt')
    } else if (
      this.circuitBreaker.state === CircuitBreakerState.CLOSED &&
      this.circuitBreaker.failureCount >= this.circuitBreaker.config.failureThreshold
    ) {
      // Too many failures, open the circuit
      this.circuitBreaker.state = CircuitBreakerState.OPEN
      this.stats.circuitBreakerTrips++
      this.warn(`Circuit breaker opened after ${this.circuitBreaker.failureCount} failures`)
    }
  }

  /**
   * Start recovery process for an error
   */
  async startRecovery(error: GeminiError): Promise<boolean> {
    const config = this.recoveryConfigs.get(error.type)

    if (!config || config.strategy === RecoveryStrategy.NONE) {
      this.debug(`No recovery strategy for error type ${error.type}`)
      return false
    }

    const recovery: ErrorRecovery = {
      errorId: error.id,
      strategy: config.strategy,
      attempt: 0,
      startTime: Date.now(),
      lastAttemptTime: Date.now(),
      isRecovering: true,
      recovered: false
    }

    this.activeRecoveries.set(error.id, recovery)
    this.info(`Starting recovery for error ${error.id} using strategy ${config.strategy}`)

    try {
      const recovered = await this.executeRecoveryStrategy(recovery, config)

      if (recovered) {
        this.stats.recovered++
        this.info(`Successfully recovered from error ${error.id}`)
        this.emit('recovery:success', {error, recovery})
      } else {
        this.warn(`Failed to recover from error ${error.id}`)
        this.emit('recovery:failed', {error, recovery})
      }

      this.activeRecoveries.delete(error.id)
      return recovered
    } catch (recoveryError) {
      this.error(`Recovery process failed for error ${error.id}`, {recoveryError})
      this.activeRecoveries.delete(error.id)
      return false
    }
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(
    recovery: ErrorRecovery,
    config: RecoveryConfig
  ): Promise<boolean> {
    switch (config.strategy) {
      case RecoveryStrategy.IMMEDIATE:
        return this.immediateRecovery(recovery, config)

      case RecoveryStrategy.EXPONENTIAL_BACKOFF:
        return this.exponentialBackoffRecovery(recovery, config)

      case RecoveryStrategy.LINEAR_BACKOFF:
        return this.linearBackoffRecovery(recovery, config)

      case RecoveryStrategy.CIRCUIT_BREAKER:
        return this.circuitBreakerRecovery(recovery, config)

      case RecoveryStrategy.FALLBACK:
        return this.fallbackRecovery(recovery, config)

      default:
        return false
    }
  }

  /**
   * Immediate recovery attempt
   */
  private async immediateRecovery(
    recovery: ErrorRecovery,
    config: RecoveryConfig
  ): Promise<boolean> {
    recovery.attempt++
    recovery.lastAttemptTime = Date.now()

    if (recovery.attempt > config.maxAttempts) {
      return false
    }

    // Emit recovery attempt event
    this.emit('recovery:attempt', {recovery, attempt: recovery.attempt})

    // For immediate recovery, we just signal that retry can happen
    return true
  }

  /**
   * Exponential backoff recovery
   */
  private async exponentialBackoffRecovery(
    recovery: ErrorRecovery,
    config: RecoveryConfig
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      recovery.attempt = attempt
      recovery.lastAttemptTime = Date.now()

      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      )

      this.debug(`Recovery attempt ${attempt} for ${recovery.errorId}, waiting ${delay}ms`)

      await this.sleep(delay)

      // Emit recovery attempt event
      this.emit('recovery:attempt', {recovery, attempt, delay})

      // Test if service is available (this would be implemented by the calling service)
      const testResult = await this.testServiceAvailability()

      if (testResult) {
        recovery.recovered = true
        return true
      }
    }

    return false
  }

  /**
   * Linear backoff recovery
   */
  private async linearBackoffRecovery(
    recovery: ErrorRecovery,
    config: RecoveryConfig
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      recovery.attempt = attempt
      recovery.lastAttemptTime = Date.now()

      const delay = Math.min(config.baseDelay * attempt, config.maxDelay)

      this.debug(`Linear recovery attempt ${attempt} for ${recovery.errorId}, waiting ${delay}ms`)

      await this.sleep(delay)

      // Emit recovery attempt event
      this.emit('recovery:attempt', {recovery, attempt, delay})

      const testResult = await this.testServiceAvailability()

      if (testResult) {
        recovery.recovered = true
        return true
      }
    }

    return false
  }

  /**
   * Circuit breaker recovery
   */
  private async circuitBreakerRecovery(
    recovery: ErrorRecovery,
    config: RecoveryConfig
  ): Promise<boolean> {
    // Circuit breaker recovery is handled by the canProceed/recordSuccess/recordFailure methods
    // This method just waits for the circuit to allow operations again

    const maxWaitTime = config.maxDelay
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      if (this.canProceed()) {
        recovery.recovered = true
        return true
      }

      await this.sleep(1000) // Check every second
    }

    return false
  }

  /**
   * Fallback recovery using provided function
   */
  private async fallbackRecovery(
    recovery: ErrorRecovery,
    config: RecoveryConfig
  ): Promise<boolean> {
    if (!config.fallbackFunction) {
      return false
    }

    try {
      recovery.attempt++
      recovery.lastAttemptTime = Date.now()

      await config.fallbackFunction()
      recovery.recovered = true
      return true
    } catch (error) {
      this.debug(`Fallback recovery failed for ${recovery.errorId}`, {error})
      return false
    }
  }

  /**
   * Test service availability with actual health check
   */
  private async testServiceAvailability(): Promise<boolean> {
    try {
      // Test with a minimal API call to check if the service is actually available
      const testTimeout = 5000 // 5 second timeout for health check

      // Create a basic test request to verify service availability
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), testTimeout)

      try {
        // Use a simple HTTP HEAD request to check if the API endpoint is responding
        const testUrl = 'https://generativelanguage.googleapis.com/v1beta/models'
        const response = await fetch(testUrl, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'dao-copilot-health-check/1.0'
          }
        })

        clearTimeout(timeoutId)

        // Consider the service available if we get any response (even 401/403 indicates service is up)
        return response.status < 500
      } catch (fetchError) {
        clearTimeout(timeoutId)

        // If it's an abort error due to timeout, service is likely down
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return false
        }

        // Network errors suggest service unavailability
        if (fetchError instanceof TypeError) {
          return false
        }

        // Other errors might still indicate the service is reachable
        return true
      }
    } catch {
      // If we can't even make the test request, assume service is down
      return false
    }
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Handle and classify an error
   */
  handleError(
    error: Error | unknown,
    context?: Record<string, unknown>,
    options?: {
      type?: ErrorType
      code?: string
      retryable?: boolean
      maxRetries?: number
    }
  ): GeminiError {
    const geminiError = this.classifyError(error, context, options)

    // Add to error history
    this.addError(geminiError)

    // Log the error
    this.error(geminiError.message, {
      error: geminiError,
      context: geminiError.context
    })

    // Emit error event
    this.emit('error', geminiError)

    // Emit specific error type events
    this.emit(`error:${geminiError.type}`, geminiError)

    return geminiError
  }

  /**
   * Classify and create a GeminiError from various error types
   */
  private classifyError(
    error: Error | unknown,
    context?: Record<string, unknown>,
    options?: {
      type?: ErrorType
      code?: string
      retryable?: boolean
      maxRetries?: number
    }
  ): GeminiError {
    let type = options?.type || ErrorType.UNKNOWN
    let message = 'Unknown error occurred'
    let code = options?.code
    let retryable = options?.retryable ?? true
    let stack: string | undefined

    if (error instanceof Error) {
      message = error.message
      stack = error.stack

      // Auto-classify based on error message/type
      if (!options?.type) {
        type = this.autoClassifyError(error)
      }

      // Auto-determine retryability
      if (options?.retryable === undefined) {
        retryable = this.isRetryableError(error, type)
      }
    } else if (typeof error === 'string') {
      message = error
    } else if (error && typeof error === 'object') {
      const errorObj = error as Record<string, unknown>
      message = (errorObj.message as string) || 'Object error'
      code = (errorObj.code as string) || code
      stack = errorObj.stack as string
    }

    return {
      id: this.generateErrorId(),
      type,
      code,
      message,
      details: error,
      timestamp: Date.now(),
      context,
      stack,
      retryable,
      retryCount: 0,
      maxRetries: options?.maxRetries || (retryable ? 3 : 0)
    }
  }

  /**
   * Auto-classify error based on error properties
   */
  private autoClassifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()

    // Connection refused errors
    if (
      message.includes('connection refused') ||
      message.includes('econnrefused') ||
      message.includes('connect_error')
    ) {
      return ErrorType.CONNECTION_REFUSED
    }

    // SSL/TLS errors
    if (
      message.includes('ssl') ||
      message.includes('tls') ||
      message.includes('certificate') ||
      message.includes('handshake')
    ) {
      return ErrorType.SSL_ERROR
    }

    // DNS errors
    if (
      message.includes('dns') ||
      message.includes('enotfound') ||
      message.includes('name resolution')
    ) {
      return ErrorType.DNS_ERROR
    }

    // Model-specific errors
    if (
      message.includes('model not found') ||
      message.includes('invalid model') ||
      message.includes('gemini-') ||
      message.includes('model unavailable')
    ) {
      return ErrorType.MODEL_ERROR
    }

    // Quota exceeded errors
    if (
      message.includes('quota exceeded') ||
      message.includes('usage limit') ||
      message.includes('billing')
    ) {
      return ErrorType.QUOTA_EXCEEDED
    }

    // Service unavailable errors
    if (
      message.includes('service unavailable') ||
      message.includes('503') ||
      message.includes('server overloaded') ||
      message.includes('temporarily unavailable')
    ) {
      return ErrorType.SERVICE_UNAVAILABLE
    }

    // Parse errors
    if (
      message.includes('parse') ||
      message.includes('json') ||
      message.includes('malformed') ||
      message.includes('syntax error')
    ) {
      return ErrorType.PARSE_ERROR
    }

    // Session errors
    if (
      message.includes('session') ||
      message.includes('session expired') ||
      message.includes('session invalid')
    ) {
      return ErrorType.SESSION_ERROR
    }

    // Network errors (broader category)
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      name.includes('networkerror')
    ) {
      return ErrorType.NETWORK
    }

    // WebSocket errors
    if (
      message.includes('websocket') ||
      message.includes('ws://') ||
      message.includes('wss://') ||
      name.includes('websocketerror')
    ) {
      return ErrorType.WEBSOCKET
    }

    // Authentication errors
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('token') ||
      message.includes('401')
    ) {
      return ErrorType.AUTHENTICATION
    }

    // API errors
    if (
      message.includes('api') ||
      message.includes('400') ||
      message.includes('500') ||
      message.includes('bad request')
    ) {
      return ErrorType.API
    }

    // Validation errors
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return ErrorType.VALIDATION
    }

    // Rate limit errors
    if (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('429') ||
      message.includes('too many requests')
    ) {
      return ErrorType.RATE_LIMIT
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.TIMEOUT
    }

    return ErrorType.UNKNOWN
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: Error, type: ErrorType): boolean {
    const message = error.message.toLowerCase()

    // Non-retryable error types
    if (
      [
        ErrorType.AUTHENTICATION,
        ErrorType.VALIDATION,
        ErrorType.PARSE_ERROR,
        ErrorType.MODEL_ERROR,
        ErrorType.QUOTA_EXCEEDED
      ].includes(type)
    ) {
      return false
    }

    // Non-retryable messages
    const nonRetryablePatterns = [
      'invalid api key',
      'unauthorized',
      'forbidden',
      'bad request',
      'invalid request',
      'malformed',
      'quota exceeded',
      'billing',
      'model not found'
    ]

    if (nonRetryablePatterns.some(pattern => message.includes(pattern))) {
      return false
    }

    // Retryable error types
    const retryableTypes = [
      ErrorType.NETWORK,
      ErrorType.WEBSOCKET,
      ErrorType.TIMEOUT,
      ErrorType.RATE_LIMIT,
      ErrorType.CONNECTION_REFUSED,
      ErrorType.SSL_ERROR,
      ErrorType.DNS_ERROR,
      ErrorType.SERVICE_UNAVAILABLE,
      ErrorType.SESSION_ERROR,
      ErrorType.UNKNOWN
    ]

    return retryableTypes.includes(type)
  }

  /**
   * Add error to history and update statistics
   */
  private addError(error: GeminiError): void {
    this.errors.push(error)

    // Maintain history size
    if (this.errors.length > this.maxErrorHistory) {
      this.errors.shift()
    }

    // Update statistics
    this.stats.total++
    this.stats.byType[error.type]++

    if (error.code) {
      this.stats.byCode[error.code] = (this.stats.byCode[error.code] || 0) + 1
    }

    if (error.retryable) {
      this.stats.retryable++
    } else {
      this.stats.nonRetryable++
    }

    this.stats.lastError = error
    this.stats.lastOccurrence = error.timestamp
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context)
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * Log a trace message
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, context)
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): void {
    if (level > this.logLevel) {
      return // Skip if below log level
    }

    const entry: LogEntry = {
      id: this.generateLogId(),
      level,
      message,
      timestamp: Date.now(),
      context,
      metadata
    }

    this.logs.push(entry)

    // Maintain log history size
    if (this.logs.length > this.maxLogHistory) {
      this.logs.shift()
    }

    // Emit log event
    this.emit('log', entry)
    this.emit(`log:${LogLevel[level].toLowerCase()}`, entry)

    // Console output for development
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      this.outputToConsole(entry)
    }
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const levelName = LogLevel[entry.level]
    const prefix = `[${timestamp}] [${levelName}] [Gemini]`

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.context || '')
        break
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.context || '')
        break
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.context || '')
        break
      case LogLevel.DEBUG:
      case LogLevel.TRACE:
        console.debug(prefix, entry.message, entry.context || '')
        break
    }
  }

  /**
   * Check if an error should be retried
   */
  shouldRetry(error: GeminiError): boolean {
    if (!error.retryable) {
      return false
    }

    const retryCount = error.retryCount || 0
    const maxRetries = error.maxRetries || 3

    return retryCount < maxRetries
  }

  /**
   * Increment retry count for an error
   */
  incrementRetryCount(error: GeminiError): GeminiError {
    return {
      ...error,
      retryCount: (error.retryCount || 0) + 1
    }
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats {
    return {...this.stats}
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit?: number): GeminiError[] {
    return limit ? this.errors.slice(-limit) : [...this.errors]
  }

  /**
   * Get recent logs
   */
  getRecentLogs(limit?: number, level?: LogLevel): LogEntry[] {
    let logs = this.logs

    if (level !== undefined) {
      logs = logs.filter(log => log.level <= level)
    }

    return limit ? logs.slice(-limit) : [...logs]
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.errors.length = 0
    this.stats.total = 0
    Object.keys(this.stats.byType).forEach(type => {
      this.stats.byType[type as ErrorType] = 0
    })
    this.stats.byCode = {}
    this.stats.retryable = 0
    this.stats.nonRetryable = 0
    this.stats.recovered = 0
    this.stats.circuitBreakerTrips = 0
    this.stats.lastError = undefined
    this.stats.lastOccurrence = 0
  }

  /**
   * Clear log history
   */
  clearLogs(): void {
    this.logs.length = 0
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  // ===== Circuit Breaker Public API =====

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: CircuitBreakerState
    failureCount: number
    successCount: number
    lastFailureTime: number
    config: CircuitBreakerConfig
  } {
    return {...this.circuitBreaker}
  }

  /**
   * Reset circuit breaker to closed state
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.state = CircuitBreakerState.CLOSED
    this.circuitBreaker.failureCount = 0
    this.circuitBreaker.successCount = 0
    this.circuitBreaker.lastFailureTime = 0
    this.info('Circuit breaker manually reset to CLOSED state')
  }

  /**
   * Configure circuit breaker parameters
   */
  configureCircuitBreaker(config: Partial<CircuitBreakerConfig>): void {
    this.circuitBreaker.config = {
      ...this.circuitBreaker.config,
      ...config
    }
    this.info('Circuit breaker configuration updated', {config: this.circuitBreaker.config})
  }

  // ===== Recovery Management Public API =====

  /**
   * Configure recovery strategy for a specific error type
   */
  configureRecoveryStrategy(errorType: ErrorType, config: RecoveryConfig): void {
    this.recoveryConfigs.set(errorType, config)
    this.info(`Recovery strategy configured for ${errorType}`, {config})
  }

  /**
   * Get active recovery processes
   */
  getActiveRecoveries(): ErrorRecovery[] {
    return Array.from(this.activeRecoveries.values())
  }

  /**
   * Cancel recovery process for a specific error
   */
  cancelRecovery(errorId: string): boolean {
    if (this.activeRecoveries.has(errorId)) {
      this.activeRecoveries.delete(errorId)
      this.info(`Recovery cancelled for error ${errorId}`)
      return true
    }
    return false
  }

  /**
   * Cancel all active recovery processes
   */
  cancelAllRecoveries(): number {
    const count = this.activeRecoveries.size
    this.activeRecoveries.clear()
    this.info(`Cancelled ${count} active recovery processes`)
    return count
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalRecoveries: number
    activeRecoveries: number
    successfulRecoveries: number
    averageRecoveryTime: number
  } {
    return {
      totalRecoveries: this.stats.recovered,
      activeRecoveries: this.activeRecoveries.size,
      successfulRecoveries: this.stats.recovered,
      averageRecoveryTime: 0 // Would need to track timing data
    }
  }

  /**
   * Set custom service availability test function
   */
  setServiceAvailabilityTest(testFunction: () => Promise<boolean>): void {
    // Override the default test function
    this.testServiceAvailability = testFunction
  }

  // ===== Enhanced Error Handling Methods =====

  /**
   * Handle error with automatic recovery attempt
   */
  async handleErrorWithRecovery(
    error: Error | unknown,
    context?: Record<string, unknown>,
    options?: {
      type?: ErrorType
      code?: string
      retryable?: boolean
      maxRetries?: number
      attemptRecovery?: boolean
    }
  ): Promise<{error: GeminiError; recovered: boolean}> {
    // First, handle the error normally
    this.recordFailure() // Update circuit breaker
    const geminiError = this.handleError(error, context, options)

    let recovered = false

    // Attempt recovery if requested and error is retryable
    if (options?.attemptRecovery !== false && geminiError.retryable) {
      try {
        recovered = await this.startRecovery(geminiError)

        if (recovered) {
          this.recordSuccess() // Update circuit breaker
        }
      } catch (recoveryError) {
        this.error('Recovery attempt failed', {
          originalError: geminiError,
          recoveryError
        })
      }
    }

    return {error: geminiError, recovered}
  }

  /**
   * Create error-specific recovery configuration
   */
  createRecoveryConfig(
    strategy: RecoveryStrategy,
    maxAttempts: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 30000,
    backoffMultiplier: number = 2,
    fallbackFunction?: () => Promise<unknown>
  ): RecoveryConfig {
    return {
      strategy,
      maxAttempts,
      baseDelay,
      maxDelay,
      backoffMultiplier,
      fallbackFunction
    }
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${++this.errorIdCounter}`
  }

  /**
   * Generate unique log ID
   */
  private generateLogId(): string {
    return `log_${Date.now()}_${++this.logIdCounter}`
  }

  /**
   * Export logs as JSON
   */
  exportLogs(level?: LogLevel): string {
    const logs = this.getRecentLogs(undefined, level)
    return JSON.stringify(logs, null, 2)
  }

  /**
   * Export errors as JSON
   */
  exportErrors(): string {
    return JSON.stringify(this.errors, null, 2)
  }

  /**
   * Get comprehensive statistics about error handling and recovery
   */
  getStatistics(): {
    totalErrors: number
    errorsByType: Record<string, number>
    recoveryAttempts: number
    successfulRecoveries: number
    circuitBreakerTrips: number
    activeRecoveries: number
  } {
    const errorsByType: Record<string, number> = {}

    // Count errors by type
    this.errors.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
    })

    return {
      totalErrors: this.errors.length,
      errorsByType,
      recoveryAttempts: this.activeRecoveries.size,
      successfulRecoveries: this.circuitBreaker.successCount,
      circuitBreakerTrips: this.circuitBreaker.failureCount,
      activeRecoveries: this.activeRecoveries.size
    }
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.clearErrors()
    this.clearLogs()
    this.removeAllListeners()
  }
}

export default GeminiErrorHandler
