/**
 * Backward Compatibility Layer for Gemini Live API Integration
 *
 * This module provides backward compatibility utilities to ensure that existing
 * code using the old HTTP-based transcription services continues to work
 * seamlessly with the new WebSocket-enabled implementation.
 */

import {TranscriptionMode} from '../types/gemini-types'
import type {TranscriptionOptions} from './main-stt-transcription'
import type {ProxyTranscriptionOptions} from './proxy-stt-transcription'

/**
 * Legacy environment variable mappings
 */
const LEGACY_ENV_MAPPINGS = {
  // Old variable names -> New variable names
  GOOGLE_API_KEY: 'GOOGLE_API_KEY',
  VITE_GOOGLE_API_KEY: 'VITE_GOOGLE_API_KEY',
  GOOGLE_GENERATIVE_AI_API_KEY: 'GOOGLE_GENERATIVE_AI_API_KEY',
  GEMINI_API_KEY: 'GEMINI_API_KEY',

  // Legacy specific mappings
  GEMINI_BATCH_MODE: 'GEMINI_TRANSCRIPTION_MODE',
  DISABLE_WEBSOCKET: 'GEMINI_WEBSOCKET_ENABLED',
  PROXY_FALLBACK: 'GEMINI_FALLBACK_TO_BATCH'
} as const

/**
 * Legacy configuration structure (pre-WebSocket)
 */
export interface LegacyTranscriptionOptions {
  apiKey?: string
  modelName?: string
  proxyUrl?: string
  timeout?: number
  retries?: number
  // These were common in older implementations
  batchMode?: boolean
  useProxy?: boolean
  fallbackEnabled?: boolean
  // Allow additional string-keyed properties for flexibility
  [key: string]: unknown
}

/**
 * Configuration migration result
 */
export interface MigrationResult {
  newConfig: TranscriptionOptions | ProxyTranscriptionOptions
  warnings: string[]
  deprecations: string[]
  isLegacy: boolean
}

/**
 * Detect if configuration uses legacy patterns
 */
export function detectLegacyUsage(options: Record<string, unknown>): boolean {
  if (!options || typeof options !== 'object') return false

  const legacyKeys = ['batchMode', 'useProxy', 'fallbackEnabled', 'timeout', 'retries']

  return legacyKeys.some(key => key in options)
}

/**
 * Migrate legacy environment variables to new format
 */
export function migrateLegacyEnvironment(): {
  migrated: Record<string, string>
  warnings: string[]
} {
  const migrated: Record<string, string> = {}
  const warnings: string[] = []

  // Handle legacy environment variables
  if (process.env.GEMINI_BATCH_MODE) {
    const batchMode = process.env.GEMINI_BATCH_MODE?.toLowerCase()
    if (batchMode === 'true' || batchMode === '1') {
      migrated.GEMINI_TRANSCRIPTION_MODE = TranscriptionMode.BATCH
    } else {
      migrated.GEMINI_TRANSCRIPTION_MODE = TranscriptionMode.HYBRID
    }
    warnings.push('GEMINI_BATCH_MODE is deprecated. Use GEMINI_TRANSCRIPTION_MODE instead.')
  }

  if (process.env.DISABLE_WEBSOCKET) {
    const disabled = process.env.DISABLE_WEBSOCKET?.toLowerCase()
    migrated.GEMINI_WEBSOCKET_ENABLED = disabled === 'true' || disabled === '1' ? 'false' : 'true'
    warnings.push('DISABLE_WEBSOCKET is deprecated. Use GEMINI_WEBSOCKET_ENABLED=false instead.')
  }

  if (process.env.PROXY_FALLBACK) {
    migrated.GEMINI_FALLBACK_TO_BATCH = process.env.PROXY_FALLBACK
    warnings.push('PROXY_FALLBACK is deprecated. Use GEMINI_FALLBACK_TO_BATCH instead.')
  }

  return {migrated, warnings}
}

/**
 * Migrate legacy configuration to new format
 */
export function migrateLegacyConfig(
  legacyConfig: LegacyTranscriptionOptions,
  isProxy = false
): MigrationResult {
  const warnings: string[] = []
  const deprecations: string[] = []
  const isLegacy = detectLegacyUsage(legacyConfig)

  // Start with basic configuration
  const newConfig: Partial<TranscriptionOptions & ProxyTranscriptionOptions> = {
    apiKey: legacyConfig.apiKey,
    modelName: legacyConfig.modelName
  }

  if (isProxy) {
    newConfig.proxyUrl = legacyConfig.proxyUrl
  }

  // Migrate legacy options
  if ('batchMode' in legacyConfig) {
    deprecations.push(
      'The "batchMode" option is deprecated. Use "mode: TranscriptionMode.BATCH" instead.'
    )
    newConfig.mode = legacyConfig.batchMode ? TranscriptionMode.BATCH : TranscriptionMode.HYBRID
  }

  if ('useProxy' in legacyConfig && legacyConfig.useProxy) {
    warnings.push('The "useProxy" option is no longer needed. Proxy functionality is now built-in.')
  }

  if ('fallbackEnabled' in legacyConfig) {
    deprecations.push('The "fallbackEnabled" option is deprecated. Use "fallbackToBatch" instead.')
    newConfig.fallbackToBatch = legacyConfig.fallbackEnabled
  }

  if ('timeout' in legacyConfig) {
    warnings.push('The "timeout" option is now handled automatically by the WebSocket client.')
  }

  if ('retries' in legacyConfig) {
    warnings.push('The "retries" option is now handled automatically by the reconnection manager.')
  }

  // Apply environment migration
  const envMigration = migrateLegacyEnvironment()
  warnings.push(...envMigration.warnings)

  return {
    newConfig,
    warnings,
    deprecations,
    isLegacy
  }
}

/**
 * Wrapper for legacy transcription function calls
 * Maintains exact backward compatibility with pre-WebSocket implementations
 */
export function createLegacyWrapper<T extends (...args: unknown[]) => unknown>(
  modernFunction: T,
  functionName: string
): T {
  return ((...args: Parameters<T>) => {
    // Detect if this looks like a legacy call
    const options = args[1] as LegacyTranscriptionOptions // Second parameter is usually options
    const migration = migrateLegacyConfig(options || {})

    if (migration.isLegacy) {
      // Log deprecation warnings in development
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[DEPRECATION] ${functionName}: Some options you're using are deprecated.`)
        migration.deprecations.forEach(dep => console.warn(`  - ${dep}`))
        migration.warnings.forEach(warn => console.warn(`  - ${warn}`))
      }

      // Replace the options with migrated config
      args[1] = migration.newConfig as Parameters<T>[1]
    }

    return modernFunction(...args)
  }) as T
}

/**
 * Check if the current usage pattern is legacy
 */
export function isLegacyUsagePattern(): boolean {
  // Check environment variables
  const legacyEnvVars = ['GEMINI_BATCH_MODE', 'DISABLE_WEBSOCKET', 'PROXY_FALLBACK']

  return legacyEnvVars.some(envVar => process.env[envVar] !== undefined)
}

/**
 * Generate migration guide for current configuration
 */
export function generateMigrationGuide(currentConfig?: LegacyTranscriptionOptions): string {
  const envMigration = migrateLegacyEnvironment()
  const configMigration = currentConfig ? migrateLegacyConfig(currentConfig) : null

  let guide = '# Gemini Live API Migration Guide\n\n'

  if (envMigration.warnings.length > 0) {
    guide += '## Environment Variables\n'
    envMigration.warnings.forEach(warning => {
      guide += `- ${warning}\n`
    })
    guide += '\n'
  }

  if (configMigration && configMigration.deprecations.length > 0) {
    guide += '## Configuration Options\n'
    configMigration.deprecations.forEach(deprecation => {
      guide += `- ${deprecation}\n`
    })
    guide += '\n'
  }

  guide += '## New Features Available\n'
  guide += '- Real-time WebSocket transcription with `mode: TranscriptionMode.WEBSOCKET`\n'
  guide += '- Intelligent hybrid mode with `mode: TranscriptionMode.HYBRID` (default)\n'
  guide += '- Automatic fallback and error recovery\n'
  guide += '- Connection quality monitoring\n'
  guide += '- Improved error handling and logging\n\n'

  guide += '## Example Migration\n'
  guide += '```typescript\n'
  guide += '// Old usage\n'
  guide += 'transcribeAudio(buffer, { apiKey, batchMode: true })\n\n'
  guide += '// New usage\n'
  guide += 'transcribeAudio(buffer, { apiKey, mode: TranscriptionMode.BATCH })\n'
  guide += '```\n'

  return guide
}

/**
 * Compatibility status checker
 */
export interface CompatibilityStatus {
  isCompatible: boolean
  hasLegacyUsage: boolean
  recommendations: string[]
  errors: string[]
}

/**
 * Check overall compatibility status
 */
export async function checkCompatibilityStatus(): Promise<CompatibilityStatus> {
  const status: CompatibilityStatus = {
    isCompatible: true,
    hasLegacyUsage: false,
    recommendations: [],
    errors: []
  }

  // Check for legacy environment usage
  if (isLegacyUsagePattern()) {
    status.hasLegacyUsage = true
    status.recommendations.push('Consider migrating legacy environment variables to new format')
  }

  // Check for required dependencies
  try {
    await import('./gemini-live-integration')
  } catch {
    status.isCompatible = false
    status.errors.push(
      'Gemini Live Integration service not found. Please ensure it is properly installed.'
    )
  }

  // Check API key availability
  const hasApiKey = !!(
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  )

  if (!hasApiKey) {
    status.errors.push('No Google API key found in environment variables')
  }

  return status
}

/**
 * Legacy function aliases for backward compatibility
 * These maintain the exact same signatures as the original functions
 */
export const LegacyAliases = {
  // Maintain old function names if they existed
  transcribeAudioLegacy: 'transcribeAudio',
  proxyTranscribeLegacy: 'transcribeAudioViaProxy',

  // Configuration helpers
  createLegacyConfig: (options: LegacyTranscriptionOptions) => {
    const migration = migrateLegacyConfig(options)
    return migration.newConfig
  },

  // Environment helpers
  setupLegacyEnvironment: () => {
    const migration = migrateLegacyEnvironment()

    // Apply migrated environment variables
    Object.entries(migration.migrated).forEach(([key, value]) => {
      if (!process.env[key]) {
        process.env[key] = value
      }
    })

    return migration
  }
}

/**
 * Default export with all compatibility utilities
 */
export default {
  detectLegacyUsage,
  migrateLegacyEnvironment,
  migrateLegacyConfig,
  createLegacyWrapper,
  isLegacyUsagePattern,
  generateMigrationGuide,
  checkCompatibilityStatus,
  LegacyAliases,

  // Constants
  LEGACY_ENV_MAPPINGS,
  TranscriptionMode
}
