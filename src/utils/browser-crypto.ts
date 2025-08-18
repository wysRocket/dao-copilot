/**
 * Browser-compatible crypto utilities
 * Provides a consistent API for both Node.js and browser environments
 */

// Check if we're in browser environment
const isBrowser = typeof window !== 'undefined'

export class BrowserCrypto {
  /**
   * Generate a random UUID
   */
  static randomUUID(): string {
    if (isBrowser && 'crypto' in window && 'randomUUID' in window.crypto) {
      return window.crypto.randomUUID()
    }

    // For Node.js environment, we'll use fallback since require() causes bundler issues
    // Manual UUID v4 generation as fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  /**
   * Generate random bytes
   */
  static randomBytes(size: number): Uint8Array {
    if (isBrowser && 'crypto' in window && 'getRandomValues' in window.crypto) {
      const bytes = new Uint8Array(size)
      window.crypto.getRandomValues(bytes)
      return bytes
    }

    // For Node.js, use fallback since require() causes bundler issues
    // Fallback using Math.random
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
    return bytes
  }

  /**
   * Convert bytes to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Generate random hex string
   */
  static randomHex(length: number): string {
    const bytes = this.randomBytes(Math.ceil(length / 2))
    const hex = this.bytesToHex(bytes)
    return hex.substring(0, length)
  }
}
