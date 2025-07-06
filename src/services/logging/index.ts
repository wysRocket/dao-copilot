export {
  AppLogger,
  logger,
  createLogger,
  measurePerformance,
  requestLoggingMiddleware
} from './logger'
export type {LogContext} from './logger'
export {createLoggerConfig, logLevels, logColors} from './logger-config'
export type {LoggerConfig} from './logger-config'

// Re-export for convenience
import {logger} from './logger'
export default logger
