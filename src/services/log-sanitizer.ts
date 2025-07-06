/**
 * Log sanitization utilities to prevent log injection attacks and protect sensitive data
 */

/**
 * Sanitize a log message by removing or encoding potentially harmful characters
 * Prevents log injection by removing/encoding newlines, carriage returns, and control characters
 * Also redacts sensitive information like API keys, tokens, etc.
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
      message = JSON.stringify(sanitizeLogObject(input))
    } catch {
      message = '[Object object]'
    }
  } else {
    message = String(input)
  }

  // Redact sensitive information first
  message = redactSensitiveData(message)

  // Remove or replace potentially harmful characters
  return (
    message
      .replace(/[\r\n]+/g, ' ') // Replace newlines and carriage returns with spaces
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      // eslint-disable-next-line no-control-regex
      .replace(/\u0000/g, '') // Remove null bytes
      .trim()
      .substring(0, 1000)
  ) // Limit length to prevent excessive log entries
}

/**
 * Redact sensitive data patterns from text
 */
function redactSensitiveData(text: string): string {
  const sensitivePatterns = [
    // API Keys (20+ character alphanumeric strings)
    {pattern: /\b[A-Za-z0-9]{20,}\b/g, replacement: '[API_KEY_REDACTED]'},
    // JWT Tokens
    {
      pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      replacement: '[JWT_TOKEN_REDACTED]'
    },
    // Authorization headers
    {pattern: /authorization[:\s]*[^\s\n\r,}]+/gi, replacement: 'authorization: [REDACTED]'},
    // Bearer tokens
    {pattern: /bearer\s+[^\s\n\r,}]+/gi, replacement: 'bearer [REDACTED]'},
    // Email addresses (partial redaction)
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: (match: string) => {
        const [local, domain] = match.split('@')
        return `${local.substring(0, 2)}***@${domain}`
      }
    },
    // Phone numbers
    {pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: 'XXX-XXX-XXXX'},
    // Credit card numbers (basic pattern)
    {pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: 'XXXX-XXXX-XXXX-XXXX'}
  ]

  let sanitized = text

  sensitivePatterns.forEach(({pattern, replacement}) => {
    if (typeof replacement === 'function') {
      sanitized = sanitized.replace(pattern, replacement)
    } else {
      sanitized = sanitized.replace(pattern, replacement)
    }
  })

  return sanitized
}

/**
 * Sanitize an object by removing or masking sensitive fields
 */
export function sanitizeLogObject(obj: unknown, maxDepth = 3): unknown {
  if (maxDepth <= 0) {
    return '[Max depth reached]'
  }

  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'string') {
    return redactSensitiveData(obj)
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj
  }

  if (obj instanceof Date) {
    return obj.toISOString()
  }

  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: redactSensitiveData(obj.message),
      stack: obj.stack ? redactSensitiveData(obj.stack) : undefined
    }
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeLogObject(item, maxDepth - 1))
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = sanitizeLogObject(value, maxDepth - 1)
      }
    }

    return sanitized
  }

  return obj
}

/**
 * Check if a field name indicates sensitive information
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerKey = fieldName.toLowerCase()
  const sensitiveFields = [
    'password',
    'secret',
    'token',
    'key',
    'auth',
    'authorization',
    'credential',
    'private',
    'apikey',
    'api_key',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'sessionid',
    'session_id',
    'cookie',
    'ssn',
    'social_security',
    'credit_card',
    'creditcard',
    'cvv',
    'pin',
    'oauth',
    'bearer'
  ]

  return sensitiveFields.some(
    sensitive =>
      lowerKey.includes(sensitive) || lowerKey.endsWith(sensitive) || lowerKey.startsWith(sensitive)
  )
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
    this.isDevelopment = process.env.NODE_ENV === 'development'
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
