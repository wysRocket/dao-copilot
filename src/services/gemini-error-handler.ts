/**
 * Error Handling and Logging System for Gemini Live API
 * Comprehensive error management, classification, and logging
 */

import EventEmitter from 'eventemitter3'

export enum ErrorType {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  API = 'api',
  WEBSOCKET = 'websocket',
  VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown'
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
  lastError?: GeminiError
  lastOccurrence: number
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
    lastOccurrence: 0
  }

  private maxErrorHistory = 1000
  private maxLogHistory = 5000
  private logLevel: LogLevel = LogLevel.INFO
  private errorIdCounter = 0
  private logIdCounter = 0

  constructor(options?: {maxErrorHistory?: number; maxLogHistory?: number; logLevel?: LogLevel}) {
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

    // Network errors
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
      message.includes('token')
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
    if (message.includes('rate limit') || message.includes('quota') || message.includes('429')) {
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
    if (type === ErrorType.AUTHENTICATION || type === ErrorType.VALIDATION) {
      return false
    }

    // Non-retryable messages
    const nonRetryablePatterns = [
      'invalid api key',
      'unauthorized',
      'forbidden',
      'bad request',
      'invalid request',
      'malformed'
    ]

    if (nonRetryablePatterns.some(pattern => message.includes(pattern))) {
      return false
    }

    // Retryable by default for network, timeout, and rate limit errors
    return [
      ErrorType.NETWORK,
      ErrorType.WEBSOCKET,
      ErrorType.TIMEOUT,
      ErrorType.RATE_LIMIT,
      ErrorType.UNKNOWN
    ].includes(type)
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
   * Destroy and clean up
   */
  destroy(): void {
    this.clearErrors()
    this.clearLogs()
    this.removeAllListeners()
  }
}

export default GeminiErrorHandler
