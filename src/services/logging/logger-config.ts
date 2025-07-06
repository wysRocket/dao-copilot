import winston, {LoggerOptions} from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import {hostname} from 'os'
import {CONFIG} from '../../helpers/centralized-config'

export interface LoggerConfig {
  level: string
  service: string
  environment: string
  enableFileLogging: boolean
  enableConsoleLogging: boolean
  enableColors: boolean
  maxFiles: string
  maxSize: string
  logDirectory: string
}

/**
 * Default logger configuration based on environment
 */
const getDefaultConfig = (): LoggerConfig => ({
  level: CONFIG.nodeEnv === 'production' ? 'info' : 'debug',
  service: 'dao-copilot',
  environment: CONFIG.nodeEnv,
  enableFileLogging: CONFIG.nodeEnv !== 'test',
  enableConsoleLogging: true,
  enableColors: CONFIG.nodeEnv !== 'production',
  maxFiles: '7d', // Keep logs for 7 days
  maxSize: '20m', // Max 20MB per file
  logDirectory: 'logs'
})

/**
 * Custom log levels with priorities
 */
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  trace: 6
}

/**
 * Color configuration for console output
 */
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  trace: 'gray'
}

/**
 * Production format - structured JSON logging
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss.SSS'}),
  winston.format.errors({stack: true}),
  winston.format.json()
)

/**
 * Development format - colorized console output
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({format: 'HH:mm:ss'}),
  winston.format.errors({stack: true}),
  winston.format.colorize({all: true}),
  winston.format.printf(({timestamp, level, message, service, ...meta}) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : ''
    return `[${timestamp}] [${service}] ${level}: ${message}${metaStr}`
  })
)

/**
 * Test format - minimal output for testing
 */
const testFormat = winston.format.combine(
  winston.format.timestamp({format: 'HH:mm:ss'}),
  winston.format.errors({stack: true}),
  winston.format.printf(({timestamp, level, message, service}) => {
    return `[${timestamp}] [${service}] ${level}: ${message}`
  })
)

/**
 * Create winston logger configuration
 */
export const createLoggerConfig = (customConfig?: Partial<LoggerConfig>): LoggerOptions => {
  const config = {...getDefaultConfig(), ...customConfig}

  // Set up winston colors and levels
  winston.addColors(logColors)

  const transports: winston.transport[] = []

  // Console transport
  if (config.enableConsoleLogging) {
    transports.push(
      new winston.transports.Console({
        format:
          config.environment === 'production'
            ? productionFormat
            : config.environment === 'test'
              ? testFormat
              : developmentFormat
      })
    )
  }

  // File transports (only if file logging is enabled)
  if (config.enableFileLogging) {
    // Error log - only errors
    transports.push(
      new DailyRotateFile({
        filename: `${config.logDirectory}/error-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: config.maxFiles,
        maxSize: config.maxSize,
        format: productionFormat,
        handleExceptions: true,
        handleRejections: true
      })
    )

    // Combined log - all levels
    transports.push(
      new DailyRotateFile({
        filename: `${config.logDirectory}/combined-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxFiles: config.maxFiles,
        maxSize: config.maxSize,
        format: productionFormat
      })
    )

    // Debug log - debug and trace levels only (for development)
    if (config.environment !== 'production') {
      transports.push(
        new DailyRotateFile({
          filename: `${config.logDirectory}/debug-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          level: 'debug',
          maxFiles: '3d', // Keep debug logs for 3 days only
          maxSize: config.maxSize,
          format: productionFormat
        })
      )
    }
  }

  return {
    level: config.level,
    levels: logLevels,
    defaultMeta: {
      service: config.service,
      environment: config.environment,
      pid: process.pid,
      hostname: hostname()
    },
    transports,
    exitOnError: false,
    handleExceptions: true,
    handleRejections: true
  }
}

export {logLevels, logColors}
