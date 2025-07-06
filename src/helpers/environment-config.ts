// Environment configuration helper for the main process
// This file helps ensure API keys are properly loaded in Electron's main process
// Uses the centralized configuration system for consistency

import {CONFIG, validateConfigOnStartup, getConfigSummary} from './centralized-config'

/**
 * Load environment variables from various sources
 * This is especially important in Electron where environment variables
 * might not be automatically loaded in the main process
 */
export async function loadEnvironmentConfig(): Promise<void> {
  try {
    // Validate configuration on startup
    validateConfigOnStartup()
    console.log('✅ Environment configuration loaded successfully')
  } catch (error) {
    console.error('❌ Failed to load environment configuration:', error)
    throw error
  }
}

/**
 * Get the Google API key from the centralized configuration
 */
export function getGoogleApiKey(): string | undefined {
  return CONFIG.gemini.apiKey
}

/**
 * Check if we're running in a browser environment (renderer process)
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.navigator !== 'undefined'
}

/**
 * Check if we're running in Node.js environment (main process)
 */
export function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

/**
 * Check if Web Audio API is available
 */
export function isWebAudioAvailable(): boolean {
  if (typeof window === 'undefined') return false

  return (
    typeof window.AudioContext !== 'undefined' ||
    typeof (window as {webkitAudioContext?: unknown}).webkitAudioContext !== 'undefined'
  )
}

/**
 * Check if MediaDevices API is available
 */
export function isMediaDevicesAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia !== 'undefined'
  )
}

/**
 * Check if audio capture is supported in current environment
 */
export function isAudioCaptureSupported(): boolean {
  return isBrowserEnvironment() && isWebAudioAvailable() && isMediaDevicesAvailable()
}

/**
 * Validate that required environment variables are present
 */
export function validateEnvironmentConfig(): boolean {
  try {
    const apiKey = getGoogleApiKey()

    if (!apiKey) {
      console.error('❌ Google API Key is missing!')
      console.error('Please set the required API key as an environment variable.')
      console.error('Refer to the documentation for the list of supported variable names.')
      console.error('')
      console.error('Example: export GEMINI_API_KEY="your-api-key-here"')
      return false
    }

    console.log('✅ Google API Key found and loaded')

    // Log configuration summary if in debug mode
    if (CONFIG.features.enableDebugMode) {
      console.log('\n' + getConfigSummary())
    }

    return true
  } catch (error) {
    console.error('❌ Configuration validation failed:', error)
    return false
  }
}

// Re-export centralized configuration for backwards compatibility
export {CONFIG} from './centralized-config'
