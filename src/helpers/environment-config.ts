// Environment configuration helper for the main process
// This file helps ensure API keys are properly loaded in Electron's main process

import {validateApiKeys, isProduction, features} from '../utils/environment'
import {readRuntimeEnv} from '../utils/env'

/**
 * Load environment variables from various sources
 * This is especially important in Electron where environment variables
 * might not be automatically loaded in the main process
 */
export async function loadEnvironmentConfig(): Promise<void> {
  // In development, you might want to load from a .env file
  try {
    // Try to load dotenv if available (for development)
    const dotenv = await import('dotenv')
    dotenv.config()

    if (features.consoleLogging) {
      console.log('Environment variables loaded from .env file')
    }
  } catch {
    // dotenv is not installed or .env file doesn't exist
    if (features.consoleLogging) {
      console.log('No .env file found or dotenv not installed, using system environment variables')
    }
  }

  // Validate API keys for production
  if (isProduction && !validateApiKeys()) {
    throw new Error('Missing required API keys for production deployment')
  }

  // Log available API key sources (without revealing the actual keys)
  if (features.consoleLogging) {
    const apiKeySources = [
      'GOOGLE_API_KEY',
      'VITE_GOOGLE_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'GEMINI_API_KEY'
    ]

    console.log('Checking for API keys in environment:')
    apiKeySources.forEach(key => {
      const value = readRuntimeEnv(key, {allowEmpty: true})
      if (value) {
        console.log(`✓ ${key}: ${value.substring(0, 8)}...`)
      } else {
        console.log(`✗ ${key}: not found`)
      }
    })
  }
}

/**
 * Get the Google API key from various possible environment variables
 */
export function getGoogleApiKey(): string | undefined {
  const apiKey = readRuntimeEnv('GOOGLE_API_KEY', {
    fallbackKeys: ['VITE_GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY']
  })

  if (!apiKey && typeof window !== 'undefined' && typeof process === 'undefined') {
    console.warn('Running in browser environment - environment variables not available')
  }

  return apiKey
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
  const apiKey = getGoogleApiKey()

  if (!apiKey) {
    console.error('❌ Google API Key is missing!')
    console.error('Please set the required API key as an environment variable.')
    console.error('Refer to the documentation for the list of supported variable names.')
    console.error('')
    console.error('Example: export API_KEY="your-api-key-here"')
    return false
  }

  console.log('✅ Google API Key found and loaded')
  return true
}
