import winston from 'winston'
import {createLoggerConfig, LoggerConfig} from './logger-config'

/**
 * Context interface for structured logging
 */
export interface LogContext {
  requestId?: string
  userId?: string
  sessionId?: string
  component?: string
  operation?: string
  duration?: number
  statusCode?: number
  error?: Error | string
  errorName?: string
  errorMessage?: string
  event?: string
  connectionId?: string
  method?: string
  path?: string
  severity?: string
  userAgent?: string
  ip?: string
  metadata?: Record<string, unknown>
}

/**
 * Logger class with enhanced functionality
 */
export class AppLogger {
  private logger: winston.Logger
  private context: LogContext = {}

  constructor(config?: Partial<LoggerConfig>) {
    this.logger = winston.createLogger(createLoggerConfig(config))
  }

  /**
   * Set persistent context that will be included in all log messages
   */
  setContext(context: LogContext): void {
    this.context = {...this.context, ...context}
  }

  /**
   * Clear all context
   */
  clearContext(): void {
    this.context = {}
  }

  /**
   * Get current context
   */
  getContext(): LogContext {
    return {...this.context}
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): AppLogger {
    const childLogger = new AppLogger()
    childLogger.logger = this.logger
    childLogger.context = {...this.context, ...context}
    return childLogger
  }

  /**
   * Log with custom level
   */
  log(level: string, message: string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    this.logger.log(level, message, logContext)
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    if (error) {
      logContext.error = error instanceof Error ? error.stack : error
      if (error instanceof Error) {
        logContext.errorName = error.name
        logContext.errorMessage = error.message
      }
    }
    this.logger.error(message, logContext)
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    this.logger.warn(message, logContext)
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    this.logger.info(message, logContext)
  }

  /**
   * HTTP level logging
   */
  http(message: string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    this.logger.log('http', message, logContext)
  }

  /**
   * Verbose level logging
   */
  verbose(message: string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    this.logger.verbose(message, logContext)
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    this.logger.debug(message, logContext)
  }

  /**
   * Trace level logging (most verbose)
   */
  trace(message: string, context?: LogContext): void {
    const logContext = {...this.context, ...context}
    this.logger.log('trace', message, logContext)
  }

  /**
   * Performance logging helper
   */
  timing(operation: string, duration: number, context?: LogContext): void {
    const logContext = {...this.context, ...context, operation, duration}
    this.logger.info(`Performance: ${operation} completed in ${duration}ms`, logContext)
  }

  /**
   * WebSocket connection logging helper
   */
  websocket(event: string, connectionId: string, context?: LogContext): void {
    const logContext = {
      ...this.context,
      ...context,
      component: 'websocket',
      connectionId,
      event
    }
    this.logger.info(`WebSocket ${event}`, logContext)
  }

  /**
   * Transcription logging helper
   */
  transcription(event: string, context?: LogContext): void {
    const logContext = {
      ...this.context,
      ...context,
      component: 'transcription',
      event
    }
    this.logger.info(`Transcription ${event}`, logContext)
  }

  /**
   * API request logging helper
   */
  apiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void {
    const logContext = {
      ...this.context,
      ...context,
      component: 'api',
      method,
      path,
      statusCode,
      duration
    }
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    this.logger.log(level, `${method} ${path} ${statusCode} - ${duration}ms`, logContext)
  }

  /**
   * Security event logging
   */
  security(event: string, context?: LogContext): void {
    const logContext = {
      ...this.context,
      ...context,
      component: 'security',
      event,
      severity: 'high'
    }
    this.logger.warn(`Security: ${event}`, logContext)
  }

  /**
   * Structured startup logging
   */
  startup(message: string, context?: LogContext): void {
    const logContext = {
      ...this.context,
      ...context,
      component: 'startup'
    }
    this.logger.info(`Startup: ${message}`, logContext)
  }

  /**
   * Structured shutdown logging
   */
  shutdown(message: string, context?: LogContext): void {
    const logContext = {
      ...this.context,
      ...context,
      component: 'shutdown'
    }
    this.logger.info(`Shutdown: ${message}`, logContext)
  }

  /**
   * Get the underlying winston logger (for advanced usage)
   */
  getWinstonLogger(): winston.Logger {
    return this.logger
  }
}

// Create and export the default logger instance
export const logger = new AppLogger()

// Export helper functions for common logging patterns
export const createLogger = (context?: LogContext): AppLogger => {
  const appLogger = new AppLogger()
  if (context) {
    appLogger.setContext(context)
  }
  return appLogger
}

// Performance logging helper
export const measurePerformance = <T>(
  operation: string,
  fn: () => T | Promise<T>,
  context?: LogContext
): T | Promise<T> => {
  const start = Date.now()

  const logResult = (result: T) => {
    const duration = Date.now() - start
    logger.timing(operation, duration, context)
    return result
  }

  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.then(logResult).catch(error => {
        const duration = Date.now() - start
        logger.error(`Performance: ${operation} failed after ${duration}ms`, error, context)
        throw error
      })
    } else {
      return logResult(result)
    }
  } catch (error) {
    const duration = Date.now() - start
    logger.error(`Performance: ${operation} failed after ${duration}ms`, error as Error, context)
    throw error
  }
}

// Express-like middleware types
interface RequestWithLogger {
  headers: Record<string, string>
  method: string
  path: string
  ip?: string
  connection?: {remoteAddress?: string}
  logger?: AppLogger
}

interface ResponseWithEvents {
  statusCode: number
  on: (event: string, callback: () => void) => void
}

type NextFunction = () => void

// Express middleware for request logging
export const requestLoggingMiddleware = (
  req: RequestWithLogger,
  res: ResponseWithEvents,
  next: NextFunction
) => {
  const start = Date.now()
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(2)

  req.logger = logger.child({requestId, component: 'api'})

  res.on('finish', () => {
    const duration = Date.now() - start
    if (req.logger) {
      req.logger.apiRequest(req.method, req.path, res.statusCode, duration, {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection?.remoteAddress
      })
    }
  })

  next()
}

export default logger
