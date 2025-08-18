/**
 * Secure random utilities for generating cryptographically secure IDs and tokens
 */

/**
 * Generates a cryptographically secure random UUID using Web Crypto API
 * Falls back to timestamp-based ID if crypto is not available
 */
export function generateSecureId(prefix = ''): string {
  try {
    // Use Web Crypto API for secure randomness
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return prefix ? `${prefix}-${crypto.randomUUID()}` : crypto.randomUUID()
    }

    // Fallback for environments without crypto.randomUUID
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint32Array(4)
      crypto.getRandomValues(array)
      const hex = Array.from(array)
        .map(x => x.toString(16).padStart(8, '0'))
        .join('')
      const uuid = [
        hex.substr(0, 8),
        hex.substr(8, 4),
        hex.substr(12, 4),
        hex.substr(16, 4),
        hex.substr(20, 12)
      ].join('-')
      return prefix ? `${prefix}-${uuid}` : uuid
    }
  } catch (error) {
    console.warn('Secure random generation failed, falling back to timestamp-based ID:', error)
  }

  // Ultimate fallback (not cryptographically secure, but better than Math.random)
  const timestamp = Date.now().toString(36)
  const counter = ((generateSecureId as unknown as {counter?: number}).counter || 0) + 1
  ;(generateSecureId as unknown as {counter: number}).counter = counter
  const id = `${timestamp}-${counter.toString(36)}`
  return prefix ? `${prefix}-${id}` : id
}

/**
 * Generates a secure session ID
 */
export function generateSessionId(): string {
  return generateSecureId('session')
}

/**
 * Generates a secure ping ID for WebSocket heartbeat
 */
export function generatePingId(): string {
  return generateSecureId('ping')
}

/**
 * Generates a secure log entry ID
 */
export function generateLogId(): string {
  return generateSecureId('log')
}

/**
 * Generates a secure transcription session ID
 */
export function generateTranscriptionId(): string {
  return generateSecureId('transcription')
}
