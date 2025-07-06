/**
 * Application Configuration Startup Validator
 *
 * This module provides comprehensive configuration validation that runs at application startup
 * to ensure all required environment variables and configurations are properly set.
 */

import {CONFIG, validateConfigOnStartup, getConfigSummary} from './centralized-config'
import {loadEnvironmentConfig, validateEnvironmentConfig} from './environment-config'
import {logger} from '../services/gemini-logger'

export interface StartupValidationResult {
  success: boolean
  errors: string[]
  warnings: string[]
  configSummary: string
  environment: string
  timestamp: number
}

export interface ValidationOptions {
  strict?: boolean // If true, warnings will be treated as errors
  skipOptionalChecks?: boolean // If true, skip validation of optional configurations
  logResults?: boolean // If true, log validation results to console
}

/**
 * Comprehensive application startup configuration validation
 */
export async function validateApplicationStartup(
  options: ValidationOptions = {}
): Promise<StartupValidationResult> {
  const {strict = false, skipOptionalChecks = false, logResults = true} = options

  const result: StartupValidationResult = {
    success: false,
    errors: [],
    warnings: [],
    configSummary: '',
    environment: CONFIG.nodeEnv,
    timestamp: Date.now()
  }

  try {
    if (logResults) {
      console.log('🔍 Starting application configuration validation...')
    }

    // 1. Load and validate environment configuration
    await loadEnvironmentConfig()

    // 2. Validate centralized configuration
    validateConfigOnStartup()

    // 3. Validate environment-specific configuration
    if (!validateEnvironmentConfig()) {
      result.errors.push('Environment configuration validation failed')
    }

    // 4. Validate required API keys
    validateRequiredApiKeys(result, skipOptionalChecks)

    // 5. Validate model configurations
    validateModelConfigurations(result)

    // 6. Validate network configurations
    validateNetworkConfigurations(result)

    // 7. Validate feature flags
    validateFeatureFlags(result)

    // 8. Environment-specific validations
    validateEnvironmentSpecific(result)

    // 9. Generate configuration summary
    result.configSummary = getConfigSummary()

    // 10. Determine overall success
    result.success = result.errors.length === 0 && (!strict || result.warnings.length === 0)

    if (logResults) {
      logValidationResults(result)
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    result.errors.push(`Configuration validation failed: ${errorMessage}`)

    if (logResults) {
      console.error('❌ Configuration validation failed:', error)
    }

    logger.error('Application startup validation failed', {error, result})
    return result
  }
}

/**
 * Validate required API keys
 */
function validateRequiredApiKeys(result: StartupValidationResult, skipOptional: boolean): void {
  // Required API keys
  if (!CONFIG.gemini.apiKey) {
    result.errors.push('Gemini API key is required but not provided')
  }

  // Optional API keys (only validate if not skipping optional checks)
  if (!skipOptional) {
    if (!CONFIG.fallback.googleCloud.apiKey) {
      result.warnings.push('Google Cloud API key not provided - fallback options may be limited')
    }

    if (!CONFIG.fallback.whisper.apiKey) {
      result.warnings.push('Whisper API key not provided - fallback options may be limited')
    }

    if (!CONFIG.fallback.azureSpeech.apiKey) {
      result.warnings.push('Azure Speech API key not provided - fallback options may be limited')
    }
  }
}

/**
 * Validate model configurations
 */
function validateModelConfigurations(result: StartupValidationResult): void {
  // Validate Gemini model
  const validGeminiModels = ['gemini-live-2.5-flash-preview', 'gemini-1.5-pro', 'gemini-1.5-flash']

  if (!validGeminiModels.includes(CONFIG.gemini.model)) {
    result.warnings.push(
      `Gemini model '${CONFIG.gemini.model}' may not be supported. Recommended: ${validGeminiModels.join(', ')}`
    )
  }

  if (CONFIG.gemini.model !== 'gemini-live-2.5-flash-preview') {
    result.warnings.push(
      `Using model '${CONFIG.gemini.model}' instead of recommended 'gemini-live-2.5-flash-preview'`
    )
  }

  // Validate fallback models
  // Note: fallbackModels not currently in CONFIG interface - would need to be added
  // if (CONFIG.gemini.fallbackModels && CONFIG.gemini.fallbackModels.length === 0) {
  //   result.warnings.push('No fallback models configured - system may fail if primary model is unavailable')
  // }
}

/**
 * Validate network configurations
 */
function validateNetworkConfigurations(result: StartupValidationResult): void {
  // Validate WebSocket URL
  if (CONFIG.gemini.websocketUrl) {
    try {
      new URL(CONFIG.gemini.websocketUrl)
      if (!CONFIG.gemini.websocketUrl.startsWith('wss://')) {
        result.warnings.push('WebSocket URL should use secure connection (wss://)')
      }
    } catch {
      result.errors.push('Invalid WebSocket URL format')
    }
  }

  // Validate API endpoints - using fallback endpoint checks since apiEndpoint not in config
  if (CONFIG.fallback.googleCloud.endpoint) {
    try {
      new URL(CONFIG.fallback.googleCloud.endpoint)
      if (!CONFIG.fallback.googleCloud.endpoint.startsWith('https://')) {
        result.warnings.push('Google Cloud API endpoint should use secure connection (https://)')
      }
    } catch {
      result.errors.push('Invalid Google Cloud API endpoint URL format')
    }
  }

  // Validate proxy configuration
  if (CONFIG.proxy.url) {
    try {
      new URL(CONFIG.proxy.url)
    } catch {
      result.errors.push('Invalid proxy URL format')
    }
  }

  // Validate timeout values
  if (CONFIG.gemini.connectionTimeout < 5000) {
    result.warnings.push('Connection timeout is very low - may cause premature disconnections')
  }

  if (CONFIG.gemini.connectionTimeout > 60000) {
    result.warnings.push('Connection timeout is very high - may delay error detection')
  }
}

/**
 * Validate feature flags
 */
function validateFeatureFlags(result: StartupValidationResult): void {
  // Check for conflicting feature flags
  if (!CONFIG.gemini.websocketEnabled && CONFIG.gemini.transcriptionMode === 'websocket') {
    result.errors.push('WebSocket is disabled but transcription mode is set to websocket')
  }

  // Note: enableBatchMode not in current config - would need to check fallback config
  // if (!CONFIG.features.enableBatchMode && CONFIG.gemini.transcriptionMode === 'batch') {
  //   result.errors.push('Batch mode is disabled but transcription mode is set to batch')
  // }

  // Check for potential performance issues
  if (CONFIG.features.enableDebugMode && CONFIG.nodeEnv === 'production') {
    result.warnings.push('Debug mode is enabled in production - this may impact performance')
  }

  if (CONFIG.features.enableTelemetry && CONFIG.nodeEnv === 'production') {
    result.warnings.push(
      'Performance logging is enabled in production - consider disabling for better performance'
    )
  }
}

/**
 * Environment-specific validations
 */
function validateEnvironmentSpecific(result: StartupValidationResult): void {
  switch (CONFIG.nodeEnv) {
    case 'production':
      validateProductionConfig(result)
      break
    case 'development':
      validateDevelopmentConfig(result)
      break
    case 'test':
      validateTestConfig(result)
      break
    default:
      result.warnings.push(`Unknown environment: ${CONFIG.nodeEnv}`)
  }
}

/**
 * Production environment validations
 */
function validateProductionConfig(result: StartupValidationResult): void {
  if (CONFIG.features.enableDebugMode) {
    result.warnings.push('Debug mode should be disabled in production')
  }

  if (!CONFIG.gemini.apiKey) {
    result.errors.push('API keys must be provided in production')
  }

  if (CONFIG.gemini.maxReconnectionAttempts < 3) {
    result.warnings.push(
      'Reconnection attempts should be higher in production for better reliability'
    )
  }
}

/**
 * Development environment validations
 */
function validateDevelopmentConfig(result: StartupValidationResult): void {
  if (!CONFIG.features.enableDebugMode) {
    result.warnings.push('Debug mode is recommended for development environment')
  }

  if (CONFIG.gemini.connectionTimeout > 30000) {
    result.warnings.push('Long connection timeout in development may slow down debugging')
  }
}

/**
 * Test environment validations
 */
function validateTestConfig(result: StartupValidationResult): void {
  // In test environment, we may want to use mock values
  if (CONFIG.gemini.apiKey === 'test-api-key' || CONFIG.gemini.apiKey === 'mock-key') {
    // This is expected in test environment
  } else if (!CONFIG.gemini.apiKey) {
    result.warnings.push('No API key provided - tests should use mock values')
  }

  // Note: enableExternalRequests not in current config - could check gemini.websocketEnabled
  if (CONFIG.gemini.websocketEnabled) {
    result.warnings.push('External requests should be disabled in test environment')
  }
}

/**
 * Log validation results to console
 */
function logValidationResults(result: StartupValidationResult): void {
  console.log('\n' + '='.repeat(60))
  console.log('📋 APPLICATION CONFIGURATION VALIDATION RESULTS')
  console.log('='.repeat(60))

  console.log(`🌍 Environment: ${result.environment}`)
  console.log(`⏰ Timestamp: ${new Date(result.timestamp).toISOString()}`)
  console.log(`✅ Overall Status: ${result.success ? 'PASSED' : 'FAILED'}`)

  if (result.errors.length > 0) {
    console.log('\n❌ ERRORS:')
    result.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`)
    })
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:')
    result.warnings.forEach((warning, index) => {
      console.log(`   ${index + 1}. ${warning}`)
    })
  }

  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log('\n🎉 No issues found!')
  }

  console.log('\n📊 CONFIGURATION SUMMARY:')
  console.log(result.configSummary)

  console.log('='.repeat(60) + '\n')
}

/**
 * Quick validation for critical startup requirements
 */
export function validateCriticalRequirements(): boolean {
  try {
    // Only check absolutely critical requirements
    return !!(CONFIG.gemini.apiKey && CONFIG.gemini.model)
  } catch {
    return false
  }
}

/**
 * Get validation recommendations based on current configuration
 */
export function getValidationRecommendations(): string[] {
  const recommendations: string[] = []

  if (CONFIG.nodeEnv === 'production') {
    recommendations.push('Consider setting up monitoring and alerting for production environment')
    recommendations.push('Ensure API keys are stored securely and rotated regularly')
  }

  if (CONFIG.gemini.model !== 'gemini-live-2.5-flash-preview') {
    recommendations.push('Consider using the recommended model: gemini-live-2.5-flash-preview')
  }

  // Note: enableFallback not in features - check if fallback config exists
  if (!CONFIG.fallback.googleCloud.apiKey && !CONFIG.fallback.whisper.apiKey) {
    recommendations.push('Enable fallback mechanisms for better reliability')
  }

  if (CONFIG.gemini.maxReconnectionAttempts < 3) {
    recommendations.push('Increase reconnection attempts for better connection stability')
  }

  return recommendations
}

/**
 * Export configuration for external monitoring
 */
export function exportConfigurationStatus(): {
  isValid: boolean
  environment: string
  criticalRequirementsMet: boolean
  lastValidated: number
  version: string
} {
  return {
    isValid: validateCriticalRequirements(),
    environment: CONFIG.nodeEnv,
    criticalRequirementsMet: validateCriticalRequirements(),
    lastValidated: Date.now(),
    version: process.env.npm_package_version || 'unknown'
  }
}
