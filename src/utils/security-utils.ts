/**
 * Security utilities for input sanitization and validation
 */

/**
 * Sanitizes input for safe logging to prevent log injection attacks
 */
export function sanitizeForLogging(input: unknown): string {
  if (input === null || input === undefined) {
    return 'null'
  }

  let str = String(input)

  // Remove potential log injection patterns
  str = str
    .replace(/[\r\n\t]/g, ' ') // Replace newlines/tabs with spaces
    .replace(/\${[^}]*}/g, '[TEMPLATE]') // Remove potential template injection
    .replace(/javascript:/gi, '[JS:]') // Remove javascript: URLs
    .replace(/data:/gi, '[DATA:]') // Remove data: URLs
    .trim()

  // Remove ANSI escape sequences manually
  const ansiRegex = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[a-zA-Z]', 'g')
  str = str.replace(ansiRegex, '')

  // Remove other control characters manually
  let cleaned = ''
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i)
    // Keep printable characters and spaces
    if (charCode >= 32 && charCode <= 126) {
      cleaned += str[i]
    } else if (charCode === 9 || charCode === 10 || charCode === 13) {
      cleaned += ' ' // Convert remaining whitespace to spaces
    }
  }
  str = cleaned

  // Truncate very long strings to prevent log spam
  if (str.length > 500) {
    str = str.substring(0, 497) + '...'
  }

  return str
}

/**
 * Sanitizes sensitive information from logs
 */
export function sanitizeSensitiveInfo(input: unknown): string {
  let str = sanitizeForLogging(input)

  // Mask potential API keys, tokens, and sensitive data
  str = str
    .replace(/\b[A-Za-z0-9]{32,}\b/g, '[REDACTED_TOKEN]') // Long alphanumeric strings (likely tokens)
    .replace(/\bsk-[A-Za-z0-9]+/g, '[REDACTED_API_KEY]') // OpenAI-style keys
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]') // Bearer tokens
    .replace(/\bAuthorization:\s*[^\s]+/gi, 'Authorization: [REDACTED]') // Auth headers
    .replace(/\bapi_key[=:]\s*[^\s&]+/gi, 'api_key=[REDACTED]') // API key parameters
    .replace(/\bpassword[=:]\s*[^\s&]+/gi, 'password=[REDACTED]') // Passwords
    .replace(/\bsecret[=:]\s*[^\s&]+/gi, 'secret=[REDACTED]') // Secrets
    .replace(/\btoken[=:]\s*[^\s&]+/gi, 'token=[REDACTED]') // Generic tokens

  return str
}

/**
 * Validates session ID format to prevent injection
 */
export function validateSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== 'string') {
    return false
  }

  // Session IDs should be UUIDs or similar safe formats
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const safeIdRegex = /^[a-zA-Z0-9_-]{8,128}$/ // Alphanumeric with hyphens/underscores

  return uuidRegex.test(sessionId) || safeIdRegex.test(sessionId)
}

/**
 * Validates and sanitizes message content
 */
export function validateMessageContent(content: unknown): string | null {
  if (!content || typeof content !== 'string') {
    return null
  }

  // Check for reasonable length
  if (content.length > 10000) {
    return null
  }

  // Basic sanitization while preserving legitimate content
  let sanitized = ''
  for (let i = 0; i < content.length; i++) {
    const charCode = content.charCodeAt(i)
    // Keep printable characters and common whitespace (tab=9, newline=10, carriage return=13)
    if (
      (charCode >= 32 && charCode <= 126) ||
      charCode === 9 ||
      charCode === 10 ||
      charCode === 13
    ) {
      sanitized += content[i]
    }
  }
  sanitized = sanitized.trim()

  return sanitized.length > 0 ? sanitized : null
}

/**
 * Validates buffer size to prevent overrun
 */
export function validateBufferSize(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  maxSize: number = 1024 * 1024
): boolean {
  if (!buffer) {
    return false
  }

  let size: number
  if (buffer instanceof ArrayBuffer) {
    size = buffer.byteLength
  } else if (Buffer.isBuffer(buffer)) {
    size = buffer.length
  } else {
    size = buffer.length
  }

  return size > 0 && size <= maxSize
}

/**
 * Safe buffer copying with bounds checking
 */
export function safeBufferCopy(
  source: ArrayBuffer | Buffer | Uint8Array,
  offset: number = 0,
  length?: number
): Uint8Array {
  if (!source) {
    throw new Error('Source buffer is required')
  }

  let sourceSize: number
  if (source instanceof ArrayBuffer) {
    sourceSize = source.byteLength
  } else if (Buffer.isBuffer(source)) {
    sourceSize = source.length
  } else {
    sourceSize = source.length
  }

  if (offset < 0 || offset >= sourceSize) {
    throw new Error(`Invalid offset: ${offset}. Buffer size: ${sourceSize}`)
  }

  const copyLength =
    length !== undefined ? Math.min(length, sourceSize - offset) : sourceSize - offset

  if (copyLength <= 0) {
    return new Uint8Array(0)
  }

  // Validate the copy won't exceed reasonable limits
  if (copyLength > 10 * 1024 * 1024) {
    // 10MB limit
    throw new Error(`Copy size too large: ${copyLength} bytes`)
  }

  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source.slice(offset, offset + copyLength))
  } else if (Buffer.isBuffer(source)) {
    return new Uint8Array(source.subarray(offset, offset + copyLength))
  } else {
    return source.slice(offset, offset + copyLength)
  }
}
