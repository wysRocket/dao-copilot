/**
 * Production configuration and environment management
 */

export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV === 'development'
export const isTest = process.env.NODE_ENV === 'test'

// Production-specific configurations
export const productionConfig = {
  // Disable debug features in production
  enableDebugLogging: false,
  enableDetailedErrors: false,
  enableDevelopmentFeatures: false,

  // Performance optimizations for production
  enableConsoleLogging: false,
  enableMetrics: true,
  enableErrorReporting: true,

  // Security settings for production
  enableCORS: false,
  enableDevTools: false,
  enableAutoReload: false
}

// Development-specific configurations
export const developmentConfig = {
  enableDebugLogging: true,
  enableDetailedErrors: true,
  enableDevelopmentFeatures: true,
  enableConsoleLogging: true,
  enableMetrics: false,
  enableErrorReporting: false,
  enableCORS: true,
  enableDevTools: true,
  enableAutoReload: true
}

// Get current environment configuration
export const getCurrentConfig = () => {
  if (isProduction) return productionConfig
  if (isDevelopment) return developmentConfig
  return developmentConfig // Default to development for safety
}

// Environment-aware feature flags
export const features = {
  get debugLogging() {
    return getCurrentConfig().enableDebugLogging
  },
  get detailedErrors() {
    return getCurrentConfig().enableDetailedErrors
  },
  get developmentFeatures() {
    return getCurrentConfig().enableDevelopmentFeatures
  },
  get consoleLogging() {
    return getCurrentConfig().enableConsoleLogging
  },
  get metrics() {
    return getCurrentConfig().enableMetrics
  },
  get errorReporting() {
    return getCurrentConfig().enableErrorReporting
  }
}

// Secure environment variable access
export const getSecureEnvVar = (key: string, defaultValue: string = ''): string => {
  const value = process.env[key]
  if (!value && isProduction) {
    console.error(`Missing required environment variable: ${key}`)
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value || defaultValue
}

// API key validation for production
export const validateApiKeys = (): boolean => {
  const requiredKeys = ['GOOGLE_API_KEY', 'GEMINI_API_KEY']

  if (isProduction) {
    for (const key of requiredKeys) {
      if (!process.env[key]) {
        console.error(`Missing required API key for production: ${key}`)
        return false
      }
    }
  }

  return true
}

export default {
  isProduction,
  isDevelopment,
  isTest,
  productionConfig,
  developmentConfig,
  getCurrentConfig,
  features,
  getSecureEnvVar,
  validateApiKeys
}
