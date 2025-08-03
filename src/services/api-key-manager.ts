/**
 * API Key Manager
 * Handles API key rotation, quota tracking, and error recovery for Google Gemini API
 */

import {logger} from './gemini-logger'
import { getEnvVar } from '../utils/env-utils'

export interface ApiKeyInfo {
  key: string
  name: string
  quotaExceeded: boolean
  lastError?: Date
  errorCount: number
  successCount: number
  lastUsed?: Date
}

export interface QuotaError {
  code: number | string
  message: string
  timestamp: Date
  keyUsed: string
}

export class ApiKeyManager {
  private apiKeys: Map<string, ApiKeyInfo> = new Map()
  private currentKeyIndex: number = 0
  private quotaErrorThreshold: number = 3 // Mark key as quota exceeded after 3 consecutive quota errors
  private backoffTime: number = 60000 // 1 minute initial backoff for quota exceeded keys
  private maxBackoffTime: number = 3600000 // 1 hour max backoff

  constructor() {
    this.initializeApiKeys()
  }

  /**
   * Validate API key format for Google AI APIs
   */
  private isValidApiKey(key: string): boolean {
    if (!key || typeof key !== 'string') {
      return false
    }
    
    const trimmedKey = key.trim()
    
    // Google AI API keys should start with "AIza" and be at least 35 characters long
    return trimmedKey.startsWith('AIza') && trimmedKey.length >= 35
  }

  /**
   * Initialize available API keys from environment variables
   */
  private initializeApiKeys(): void {
    logger.info('Starting API key initialization...')
    
    const keyMappings = [
      {env: 'GOOGLE_API_KEY', name: 'Primary Google API Key'},
      {env: 'VITE_GOOGLE_API_KEY', name: 'Secondary Google API Key'},
      {env: 'GOOGLE_GENERATIVE_AI_API_KEY', name: 'Generative AI Key'},
      {env: 'GEMINI_API_KEY', name: 'Gemini API Key'}
    ]

    keyMappings.forEach(({env, name}) => {
      const key = getEnvVar(env)
      logger.info(`Checking ${env}: ${key ? `found (${key.substring(0, 8)}...)` : 'not found'}`)
      
      if (key && key.trim() && key !== 'your_api_key_here') {
        // Validate API key format before adding to rotation
        if (this.isValidApiKey(key)) {
          this.apiKeys.set(key, {
            key,
            name,
            quotaExceeded: false,
            errorCount: 0,
            successCount: 0
          })
          logger.info(`Initialized API key: ${name} (${key.substring(0, 8)}...)`)
        } else {
          logger.warn(`Skipped ${env} - invalid API key format. Google AI API keys should start with "AIza" and be at least 35 characters long`)
        }
      } else {
        logger.warn(`Skipped ${env} - ${!key ? 'not found' : key === 'your_api_key_here' ? 'placeholder value' : 'empty'}`)
      }
    })

    logger.info(`API key initialization complete. Found ${this.apiKeys.size} valid keys.`)

    if (this.apiKeys.size === 0) {
      logger.warn('No valid Google API keys found in environment variables. WebSocket features will be disabled.')
      logger.warn('To enable WebSocket features, set one of the following environment variables:')
      logger.warn('- GOOGLE_API_KEY')
      logger.warn('- VITE_GOOGLE_API_KEY') 
      logger.warn('- GOOGLE_GENERATIVE_AI_API_KEY')
      logger.warn('- GEMINI_API_KEY')
      return // Don't throw error, just continue without keys
    }

    logger.info(`Initialized ${this.apiKeys.size} API keys for rotation`)
  }

  /**
   * Get the next available API key for use
   */
  public getNextApiKey(): string {
    // Check if we have any keys at all
    if (this.apiKeys.size === 0) {
      throw new Error('No API keys configured. Please set a Google API key in environment variables.')
    }

    const availableKeys = this.getAvailableKeys()

    if (availableKeys.length === 0) {
      // All keys are quota exceeded, try the one with the oldest error
      const oldestErrorKey = this.getKeyWithOldestError()
      if (oldestErrorKey) {
        logger.warn('All keys quota exceeded, trying oldest error key', {
          keyName: oldestErrorKey.name,
          lastError: oldestErrorKey.lastError
        })
        return oldestErrorKey.key
      }
      throw new Error('No API keys available - all keys have exceeded quota')
    }

    // Rotate to next available key
    this.currentKeyIndex = (this.currentKeyIndex + 1) % availableKeys.length
    const selectedKey = availableKeys[this.currentKeyIndex]

    // Update last used timestamp
    selectedKey.lastUsed = new Date()

    logger.info(`Selected API key for use: ${selectedKey.name}`)
    return selectedKey.key
  }

  /**
   * Get available keys (not quota exceeded or within backoff period)
   */
  private getAvailableKeys(): ApiKeyInfo[] {
    const now = new Date()
    return Array.from(this.apiKeys.values()).filter(keyInfo => {
      if (!keyInfo.quotaExceeded) return true

      // Check if backoff period has passed
      if (keyInfo.lastError) {
        const backoffTime = this.calculateBackoffTime(keyInfo.errorCount)
        const timeSinceError = now.getTime() - keyInfo.lastError.getTime()
        if (timeSinceError > backoffTime) {
          // Reset quota exceeded status after backoff
          keyInfo.quotaExceeded = false
          keyInfo.errorCount = 0
          logger.info(`Reset quota status for key: ${keyInfo.name}`)
          return true
        }
      }

      return false
    })
  }

  /**
   * Get the key with the oldest error for fallback
   */
  private getKeyWithOldestError(): ApiKeyInfo | null {
    let oldestKey: ApiKeyInfo | null = null
    let oldestTime = new Date()

    for (const keyInfo of this.apiKeys.values()) {
      if (keyInfo.lastError && keyInfo.lastError < oldestTime) {
        oldestTime = keyInfo.lastError
        oldestKey = keyInfo
      }
    }

    return oldestKey
  }

  /**
   * Calculate backoff time based on error count
   */
  private calculateBackoffTime(errorCount: number): number {
    const backoff = this.backoffTime * Math.pow(2, errorCount - 1)
    return Math.min(backoff, this.maxBackoffTime)
  }

  /**
   * Report successful API key usage
   */
  public reportSuccess(apiKey: string): void {
    const keyInfo = this.findKeyInfo(apiKey)
    if (keyInfo) {
      keyInfo.successCount++
      keyInfo.errorCount = 0 // Reset error count on success
      keyInfo.quotaExceeded = false // Reset quota exceeded status on success

      logger.debug(`Reported success for API key: ${keyInfo.name}`, {
        successCount: keyInfo.successCount
      })
    }
  }

  /**
   * Report API key error and handle quota exceeded scenarios
   */
  public reportError(apiKey: string, error: {code?: number | string; message?: string}): void {
    const keyInfo = this.findKeyInfo(apiKey)
    if (!keyInfo) return

    keyInfo.errorCount++
    keyInfo.lastError = new Date()

    const isQuotaError = this.isQuotaExceededError(error)

    if (isQuotaError) {
      keyInfo.quotaExceeded = true
      logger.warn(`API key quota exceeded: ${keyInfo.name}`, {
        errorCode: error.code,
        errorMessage: error.message,
        errorCount: keyInfo.errorCount
      })
    } else if (keyInfo.errorCount >= this.quotaErrorThreshold) {
      keyInfo.quotaExceeded = true
      logger.warn(
        `API key marked as quota exceeded after ${this.quotaErrorThreshold} errors: ${keyInfo.name}`
      )
    }

    // Log quota error for tracking
    this.logQuotaError({
      code: error.code || 'unknown',
      message: error.message || 'Unknown error',
      timestamp: new Date(),
      keyUsed: keyInfo.name
    })
  }

  /**
   * Check if error indicates quota exceeded
   */
  private isQuotaExceededError(error: {code?: number | string; message?: string}): boolean {
    // WebSocket close code 1011 indicates quota exceeded
    if (error.code === 1011) return true

    // HTTP status codes for quota exceeded
    if (error.code === 429 || error.code === '429') return true

    // Check error message for quota-related keywords
    const message = (error.message || '').toLowerCase()
    const quotaKeywords = [
      'quota exceeded',
      'rate limit',
      'too many requests',
      'billing',
      'usage limit'
    ]

    return quotaKeywords.some(keyword => message.includes(keyword))
  }

  /**
   * Find key info by API key value
   */
  private findKeyInfo(apiKey: string): ApiKeyInfo | undefined {
    return this.apiKeys.get(apiKey)
  }

  /**
   * Log quota error for monitoring
   */
  private logQuotaError(quotaError: QuotaError): void {
    logger.error('Quota error logged', quotaError)
  }

  /**
   * Get current status of all API keys
   */
  public getKeyStatus(): {
    keyName: string
    available: boolean
    errorCount: number
    lastError?: Date
  }[] {
    return Array.from(this.apiKeys.values()).map(keyInfo => ({
      keyName: keyInfo.name,
      available: !keyInfo.quotaExceeded,
      errorCount: keyInfo.errorCount,
      lastError: keyInfo.lastError
    }))
  }

  /**
   * Force reset all quota exceeded flags (for manual recovery)
   */
  public resetAllQuotaFlags(): void {
    for (const keyInfo of this.apiKeys.values()) {
      keyInfo.quotaExceeded = false
      keyInfo.errorCount = 0
    }
    logger.info('Reset quota exceeded flags for all API keys')
  }

  /**
   * Get the primary API key (for backward compatibility)
   */
  public getPrimaryApiKey(): string {
    // Try to get the first available key
    const availableKeys = this.getAvailableKeys()
    if (availableKeys.length > 0) {
      return availableKeys[0].key
    }

    // Fallback to any key if none available
    const firstKey = Array.from(this.apiKeys.values())[0]
    if (firstKey) {
      return firstKey.key
    }

    throw new Error('No API keys available')
  }

  /**
   * Check if any valid API keys are available
   */
  public hasValidKeys(): boolean {
    return this.apiKeys.size > 0
  }

  /**
   * Check if the API key manager is properly configured
   */
  public isConfigured(): boolean {
    return this.hasValidKeys()
  }
}

// Singleton instance - lazy initialization to ensure environment is loaded first
let apiKeyManagerInstance: ApiKeyManager | null = null

/**
 * Get the global API key manager instance with lazy initialization
 * This ensures the environment is loaded before initialization
 */
export function getApiKeyManager(): ApiKeyManager {
  if (!apiKeyManagerInstance) {
    apiKeyManagerInstance = new ApiKeyManager()
  }
  return apiKeyManagerInstance
}

/**
 * Force initialization of the API key manager
 * Call this after environment variables are loaded
 */
export function initializeApiKeyManager(): ApiKeyManager {
  if (apiKeyManagerInstance) {
    console.log('API key manager already initialized')
  } else {
    console.log('Initializing API key manager after environment load...')
    apiKeyManagerInstance = new ApiKeyManager()
  }
  return apiKeyManagerInstance
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getApiKeyManager() instead
 */
export const apiKeyManager = new Proxy({} as ApiKeyManager, {
  get(target, prop) {
    return getApiKeyManager()[prop as keyof ApiKeyManager]
  }
})
