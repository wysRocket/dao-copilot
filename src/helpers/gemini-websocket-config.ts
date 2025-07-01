/**
 * Configuration and Environment Setup for Gemini Live API WebSocket Integration
 *
 * This module provides comprehensive configuration management for the WebSocket-based
 * Gemini Live API integration, including validation, environment setup, and legacy migration.
 */

import {TranscriptionMode} from '../services/gemini-live-integration'
import {
  migrateLegacyEnvironment,
  isLegacyUsagePattern
} from '../services/transcription-compatibility'

export interface GeminiWebSocketConfig {
  // Core Configuration
  apiKey: string
  websocketEnabled: boolean
  transcriptionMode: TranscriptionMode
  websocketUrl: string

  // Fallback and Reliability
  fallbackToBatch: boolean
  realTimeThreshold: number
  connectionTimeout: number

  // Reconnection Settings
  reconnectionEnabled: boolean
  maxReconnectionAttempts: number
  reconnectionDelay: number

  // Proxy Configuration
  proxyUrl: string
  proxyWebSocketEnabled: boolean
  proxyFallbackEnabled: boolean
  proxyAuthToken?: string
}

export interface ConfigValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  recommendations: string[]
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<GeminiWebSocketConfig> = {
  websocketEnabled: true,
  transcriptionMode: TranscriptionMode.HYBRID,
  websocketUrl:
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
  fallbackToBatch: true,
  realTimeThreshold: 3000, // 3 seconds
  connectionTimeout: 30000, // 30 seconds
  reconnectionEnabled: true,
  maxReconnectionAttempts: 5,
  reconnectionDelay: 1000, // 1 second
  proxyUrl: 'http://localhost:3001',
  proxyWebSocketEnabled: true,
  proxyFallbackEnabled: true
}

/**
 * Load configuration from environment variables with legacy migration
 */
export function loadConfigFromEnvironment(): GeminiWebSocketConfig {
  // First, check for and migrate legacy environment variables
  if (isLegacyUsagePattern()) {
    console.warn('[CONFIG] Legacy environment variables detected. Migrating to new format...')
    const migration = migrateLegacyEnvironment()

    // Apply migrated values to process.env
    Object.entries(migration.migrated).forEach(([key, value]) => {
      if (!process.env[key]) {
        process.env[key] = value as string
      }
    })

    // Show warnings
    migration.warnings.forEach((warning: string) => {
      console.warn(`[CONFIG] ${warning}`)
    })
  }

  // Load configuration from environment variables
  const config: GeminiWebSocketConfig = {
    // Core Configuration
    apiKey: getApiKey(),
    websocketEnabled: process.env.GEMINI_WEBSOCKET_ENABLED !== 'false',
    transcriptionMode: parseTranscriptionMode(process.env.GEMINI_TRANSCRIPTION_MODE),
    websocketUrl: process.env.GEMINI_WEBSOCKET_URL || DEFAULT_CONFIG.websocketUrl!,

    // Fallback and Reliability
    fallbackToBatch: process.env.GEMINI_FALLBACK_TO_BATCH !== 'false',
    realTimeThreshold: parseInt(process.env.GEMINI_REALTIME_THRESHOLD || '3000', 10),
    connectionTimeout: parseInt(process.env.GEMINI_CONNECTION_TIMEOUT || '30000', 10),

    // Reconnection Settings
    reconnectionEnabled: process.env.GEMINI_RECONNECTION_ENABLED !== 'false',
    maxReconnectionAttempts: parseInt(process.env.GEMINI_MAX_RECONNECTION_ATTEMPTS || '5', 10),
    reconnectionDelay: parseInt(process.env.GEMINI_RECONNECTION_DELAY || '1000', 10),

    // Proxy Configuration
    proxyUrl: process.env.PROXY_URL || DEFAULT_CONFIG.proxyUrl!,
    proxyWebSocketEnabled: process.env.PROXY_WEBSOCKET_ENABLED !== 'false',
    proxyFallbackEnabled: process.env.PROXY_FALLBACK_ENABLED !== 'false',
    proxyAuthToken: process.env.PROXY_AUTH_TOKEN
  }

  return config
}

/**
 * Get API key from various environment variable patterns
 */
function getApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ''
  )
}

/**
 * Parse transcription mode from string
 */
function parseTranscriptionMode(mode?: string): TranscriptionMode {
  if (!mode) return DEFAULT_CONFIG.transcriptionMode!

  const normalizedMode = mode.toLowerCase()
  switch (normalizedMode) {
    case 'websocket':
    case 'ws':
      return TranscriptionMode.WEBSOCKET
    case 'batch':
    case 'http':
      return TranscriptionMode.BATCH
    case 'hybrid':
    case 'auto':
      return TranscriptionMode.HYBRID
    default:
      console.warn(`[CONFIG] Unknown transcription mode: ${mode}. Using hybrid mode.`)
      return TranscriptionMode.HYBRID
  }
}

/**
 * Validate configuration and provide feedback
 */
export function validateConfig(config: GeminiWebSocketConfig): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const recommendations: string[] = []

  // Validate API Key
  if (!config.apiKey) {
    errors.push('API key is required. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.')
  } else if (config.apiKey.length < 20) {
    warnings.push('API key appears to be too short. Please verify it is correct.')
  }

  // Validate WebSocket URL
  if (config.websocketEnabled && config.websocketUrl) {
    try {
      const url = new URL(config.websocketUrl)
      if (url.protocol === 'ws:') {
        warnings.push('WebSocket URL should use wss:// for secure connections in production.')
      } else if (url.protocol !== 'wss:') {
        errors.push('Invalid WebSocket URL protocol. Use wss:// or ws://')
      }
    } catch {
      errors.push('Invalid WebSocket URL format.')
    }
  }

  // Validate Timeouts
  if (config.connectionTimeout < 5000) {
    warnings.push('Connection timeout is very low. Consider using at least 5 seconds.')
  }

  if (config.realTimeThreshold < 1000) {
    warnings.push('Real-time threshold is very low. This may cause excessive WebSocket usage.')
  }

  // Validate Reconnection Settings
  if (config.reconnectionEnabled) {
    if (config.maxReconnectionAttempts < 1) {
      errors.push('Maximum reconnection attempts must be at least 1 when reconnection is enabled.')
    }

    if (config.reconnectionDelay < 100) {
      warnings.push('Reconnection delay is very low. This may cause server overload.')
    }
  }

  // Validate Proxy Configuration
  if (config.proxyUrl) {
    try {
      const url = new URL(config.proxyUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        errors.push('Invalid proxy URL protocol. Use http:// or https://')
      }
    } catch {
      errors.push('Invalid proxy URL format.')
    }
  }

  // Provide Recommendations
  if (config.transcriptionMode === TranscriptionMode.WEBSOCKET && !config.fallbackToBatch) {
    recommendations.push('Consider enabling fallback to batch mode for better reliability.')
  }

  if (!config.reconnectionEnabled) {
    recommendations.push('Consider enabling reconnection for better user experience.')
  }

  if (config.websocketEnabled && !config.proxyFallbackEnabled) {
    recommendations.push(
      'Consider enabling proxy fallback for environments with restricted network access.'
    )
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recommendations
  }
}

/**
 * Get a complete configuration with validation
 */
export function getValidatedConfig(): {
  config: GeminiWebSocketConfig
  validation: ConfigValidationResult
} {
  const config = loadConfigFromEnvironment()
  const validation = validateConfig(config)

  // Log validation results
  if (!validation.isValid) {
    console.error('[CONFIG] Configuration validation failed:')
    validation.errors.forEach(error => console.error(`  - ${error}`))
  }

  if (validation.warnings.length > 0) {
    console.warn('[CONFIG] Configuration warnings:')
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`))
  }

  if (validation.recommendations.length > 0) {
    console.info('[CONFIG] Configuration recommendations:')
    validation.recommendations.forEach(rec => console.info(`  - ${rec}`))
  }

  return {config, validation}
}

/**
 * Environment setup helper for development
 */
export function setupDevelopmentEnvironment(): void {
  // Set default development values if not already set
  const devDefaults = {
    GEMINI_WEBSOCKET_ENABLED: 'true',
    GEMINI_TRANSCRIPTION_MODE: 'hybrid',
    GEMINI_FALLBACK_TO_BATCH: 'true',
    GEMINI_RECONNECTION_ENABLED: 'true',
    PROXY_WEBSOCKET_ENABLED: 'true',
    PROXY_FALLBACK_ENABLED: 'true'
  }

  Object.entries(devDefaults).forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value
      console.log(`[CONFIG] Set development default: ${key}=${value}`)
    }
  })
}

/**
 * Configuration summary for debugging
 */
export function getConfigSummary(config: GeminiWebSocketConfig): string {
  return `
Gemini Live API Configuration Summary:
=====================================
✓ API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'NOT SET'}
✓ WebSocket Enabled: ${config.websocketEnabled}
✓ Transcription Mode: ${config.transcriptionMode}
✓ WebSocket URL: ${config.websocketUrl}
✓ Fallback to Batch: ${config.fallbackToBatch}
✓ Real-time Threshold: ${config.realTimeThreshold}ms
✓ Connection Timeout: ${config.connectionTimeout}ms
✓ Reconnection Enabled: ${config.reconnectionEnabled}
✓ Max Reconnection Attempts: ${config.maxReconnectionAttempts}
✓ Reconnection Delay: ${config.reconnectionDelay}ms
✓ Proxy URL: ${config.proxyUrl}
✓ Proxy WebSocket Enabled: ${config.proxyWebSocketEnabled}
✓ Proxy Fallback Enabled: ${config.proxyFallbackEnabled}
✓ Proxy Auth Token: ${config.proxyAuthToken ? '***' + config.proxyAuthToken.slice(-3) : 'NOT SET'}
`.trim()
}

// Export default configuration instance
export default {
  load: loadConfigFromEnvironment,
  validate: validateConfig,
  getValidated: getValidatedConfig,
  setupDev: setupDevelopmentEnvironment,
  summary: getConfigSummary,
  defaults: DEFAULT_CONFIG
}
