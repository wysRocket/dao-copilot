/**
 * Log sanitization utilities to prevent log injection attacks
 */
import {isDevelopmentEnvironment} from '../utils/env'

/**
 * Sanitize a log message by removing or encoding potentially harmful characters
 * Prevents log injection by removing/encoding newlines, carriage returns, and control characters
 */
export function sanitizeLogMessage(input: unknown): string {
  if (input === null || input === undefined) {
    return 'null'
  }

  // Convert to string safely
  let message: string
  if (typeof input === 'string') {
    message = input
  } else if (input instanceof Error) {
    message = input.message
  } else if (typeof input === 'object') {
    try {
      message = JSON.stringify(input)
    } catch {
      message = '[Object object]'
    }
  } else {
    message = String(input)
  }

  // Remove or replace potentially harmful characters
  return (
    message
      .replace(/[\r\n]+/g, ' ') // Replace newlines and carriage returns with spaces
      // eslint-disable-next-line no-control-regex -- we intentionally strip control characters to harden logs
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters, including null bytes
      .trim()
      .substring(0, 1000)
  ) // Limit length to prevent excessive log entries
}

/**
 * Sanitize multiple values for logging
 */
export function sanitizeLogValues(...values: unknown[]): string[] {
  return values.map(sanitizeLogMessage)
}

/**
 * Create a safe log entry with sanitized values
 */
export function createSafeLogEntry(template: string, ...values: unknown[]): string {
  const sanitizedValues = sanitizeLogValues(...values)
  return template.replace(/%s/g, () => sanitizedValues.shift() || '')
}

/**
 * Environment-aware logger that can be disabled in production
 */
export class SafeLogger {
  private isDevelopment: boolean

  constructor() {
    this.isDevelopment = isDevelopmentEnvironment()
  }

  log(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.log(sanitizeLogMessage(message), ...sanitizeLogValues(...args))
    }
  }

  error(message: string, ...args: unknown[]): void {
    console.error(sanitizeLogMessage(message), ...sanitizeLogValues(...args))
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.warn(sanitizeLogMessage(message), ...sanitizeLogValues(...args))
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.debug(sanitizeLogMessage(message), ...sanitizeLogValues(...args))
    }
  }
}

export const safeLogger = new SafeLogger()
