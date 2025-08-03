/**
 * Browser-safe environment variable utilities
 * Provides cross-platform access to environment variables for both Node.js and browser environments
 */

/**
 * Safely get an environment variable with optional fallback
 * Works in both Node.js and browser environments
 */
export function getEnvVar(key: string, fallback?: string): string | undefined {
  // In Node.js environment (main process)
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback
  }
  
  // In browser environment, check for Vite environment variables
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).process?.env) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).process.env[key] || fallback
    }
  } catch {
    // Ignore errors accessing window.process
  }
  
  return fallback
}

/**
 * Get environment variable with multiple fallback options
 */
export function getEnvVarWithFallbacks(keys: string[], defaultValue?: string): string | undefined {
  for (const key of keys) {
    const value = getEnvVar(key)
    if (value && value.trim() && value !== 'your_api_key_here') {
      return value
    }
  }
  return defaultValue
}

/**
 * Get Google API keys from various environment variable patterns
 */
export function getGoogleApiKeys(): {
  primary?: string
  secondary?: string
  vite?: string
  generativeAi?: string
} {
  return {
    primary: getEnvVar('GOOGLE_API_KEY'),
    secondary: getEnvVar('GEMINI_API_KEY'),
    vite: getEnvVar('VITE_GOOGLE_API_KEY'),
    generativeAi: getEnvVar('GOOGLE_GENERATIVE_AI_API_KEY')
  }
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return getEnvVar('NODE_ENV') === 'test' || getEnvVar('VITEST') === 'true'
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return getEnvVar('NODE_ENV') === 'development' || getEnvVar('DEBUG') === 'true'
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return getEnvVar('NODE_ENV') === 'production'
}

/**
 * Get the first available API key from the standard Google API key environment variables
 */
export function getFirstAvailableGoogleApiKey(): string | undefined {
  const keys = getGoogleApiKeys()
  return keys.primary || keys.secondary || keys.vite || keys.generativeAi
}
