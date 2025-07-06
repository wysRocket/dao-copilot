/**
 * Centralized Configuration Management System
 *
 * This module provides a centralized configuration system with validation,
 * environment variable loading, and type safety for the DAO Copilot application.
 */

import dotenv from 'dotenv'
import Joi from 'joi'
import {TranscriptionMode} from '../services/gemini-live-integration'

// Load environment variables from .env file
dotenv.config()

/**
 * Complete application configuration interface
 */
export interface ApplicationConfig {
  // Environment
  nodeEnv: string
  port: number

  // Gemini Configuration
  gemini: {
    apiKey: string
    model: string
    websocketEnabled: boolean
    transcriptionMode: TranscriptionMode
    websocketUrl: string
    fallbackToBatch: boolean
    realTimeThreshold: number
    connectionTimeout: number
    reconnectionEnabled: boolean
    maxReconnectionAttempts: number
    reconnectionDelay: number
  }

  // Proxy Configuration
  proxy: {
    url: string
    websocketEnabled: boolean
    fallbackEnabled: boolean
    authToken?: string
  }

  // Fallback Services Configuration
  fallback: {
    googleCloud: {
      enabled: boolean
      apiKey?: string
      endpoint?: string
    }
    whisper: {
      enabled: boolean
      apiKey?: string
      endpoint?: string
    }
    azureSpeech: {
      enabled: boolean
      apiKey?: string
      endpoint?: string
      region?: string
    }
  }

  // Security Configuration
  security: {
    enableCors: boolean
    corsOrigin: string[]
    enableRateLimit: boolean
    rateLimitWindow: number
    rateLimitMax: number
  }

  // Logging Configuration
  logging: {
    level: string
    enableConsole: boolean
    enableFile: boolean
    fileLocation?: string
    enableSanitization: boolean
  }

  // Feature Flags
  features: {
    enableTelemetry: boolean
    enableExperimentalFeatures: boolean
    enableDebugMode: boolean
  }
}

/**
 * Configuration validation schema using Joi
 */
const configSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),

  // Gemini Configuration (Required)
  GEMINI_API_KEY: Joi.string().required().min(20).messages({
    'string.base': 'GEMINI_API_KEY must be a string',
    'string.empty': 'GEMINI_API_KEY is required',
    'string.min': 'GEMINI_API_KEY appears to be too short',
    'any.required': 'GEMINI_API_KEY is required. Please set your Google API key.'
  }),
  GEMINI_MODEL: Joi.string()
    .valid('gemini-live-2.5-flash-preview', 'gemini-1.5-flash', 'gemini-1.5-pro')
    .default('gemini-live-2.5-flash-preview'),
  GEMINI_WEBSOCKET_ENABLED: Joi.boolean().default(true),
  GEMINI_TRANSCRIPTION_MODE: Joi.string().valid('websocket', 'batch', 'hybrid').default('hybrid'),
  GEMINI_WEBSOCKET_URL: Joi.string()
    .uri({scheme: ['wss', 'ws']})
    .default(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
    ),
  GEMINI_FALLBACK_TO_BATCH: Joi.boolean().default(true),
  GEMINI_REALTIME_THRESHOLD: Joi.number().min(1000).max(60000).default(3000),
  GEMINI_CONNECTION_TIMEOUT: Joi.number().min(5000).max(120000).default(30000),
  GEMINI_RECONNECTION_ENABLED: Joi.boolean().default(true),
  GEMINI_MAX_RECONNECTION_ATTEMPTS: Joi.number().min(1).max(20).default(5),
  GEMINI_RECONNECTION_DELAY: Joi.number().min(100).max(10000).default(1000),

  // Proxy Configuration
  PROXY_URL: Joi.string()
    .uri({scheme: ['http', 'https']})
    .default('http://localhost:3001'),
  PROXY_WEBSOCKET_ENABLED: Joi.boolean().default(true),
  PROXY_FALLBACK_ENABLED: Joi.boolean().default(true),
  PROXY_AUTH_TOKEN: Joi.string().optional(),

  // Fallback Services
  GOOGLE_CLOUD_API_KEY: Joi.string().optional(),
  GOOGLE_CLOUD_ENDPOINT: Joi.string().uri().optional(),
  WHISPER_API_KEY: Joi.string().optional(),
  WHISPER_ENDPOINT: Joi.string().uri().optional(),
  AZURE_SPEECH_API_KEY: Joi.string().optional(),
  AZURE_SPEECH_ENDPOINT: Joi.string().uri().optional(),
  AZURE_SPEECH_REGION: Joi.string().optional(),

  // Security
  ENABLE_CORS: Joi.boolean().default(true),
  CORS_ORIGIN: Joi.string().default('*'),
  ENABLE_RATE_LIMIT: Joi.boolean().default(true),
  RATE_LIMIT_WINDOW: Joi.number().min(1000).default(900000), // 15 minutes
  RATE_LIMIT_MAX: Joi.number().min(1).default(100),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_ENABLE_CONSOLE: Joi.boolean().default(true),
  LOG_ENABLE_FILE: Joi.boolean().default(false),
  LOG_FILE_LOCATION: Joi.string().optional(),
  LOG_ENABLE_SANITIZATION: Joi.boolean().default(true),

  // Feature Flags
  ENABLE_TELEMETRY: Joi.boolean().default(false),
  ENABLE_EXPERIMENTAL_FEATURES: Joi.boolean().default(false),
  ENABLE_DEBUG_MODE: Joi.boolean().default(false)
}).unknown() // Allow unknown environment variables

/**
 * Parse transcription mode from string with validation
 */
function parseTranscriptionMode(mode: string): TranscriptionMode {
  switch (mode.toLowerCase()) {
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
      throw new Error(`Invalid transcription mode: ${mode}`)
  }
}

/**
 * Parse CORS origins from string
 */
function parseCorsOrigins(origins: string): string[] {
  if (origins === '*') return ['*']
  return origins.split(',').map(origin => origin.trim())
}

/**
 * Validate configuration and return typed config object
 */
export function validateAndGetConfig(): ApplicationConfig {
  const {error, value: validatedEnv} = configSchema.validate(process.env, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  })

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join('\n')
    throw new Error(`Configuration validation failed:\n${errorMessage}`)
  }

  // Transform validated environment variables into typed configuration
  const config: ApplicationConfig = {
    // Environment
    nodeEnv: validatedEnv.NODE_ENV,
    port: validatedEnv.PORT,

    // Gemini Configuration
    gemini: {
      apiKey: validatedEnv.GEMINI_API_KEY,
      model: validatedEnv.GEMINI_MODEL,
      websocketEnabled: validatedEnv.GEMINI_WEBSOCKET_ENABLED,
      transcriptionMode: parseTranscriptionMode(validatedEnv.GEMINI_TRANSCRIPTION_MODE),
      websocketUrl: validatedEnv.GEMINI_WEBSOCKET_URL,
      fallbackToBatch: validatedEnv.GEMINI_FALLBACK_TO_BATCH,
      realTimeThreshold: validatedEnv.GEMINI_REALTIME_THRESHOLD,
      connectionTimeout: validatedEnv.GEMINI_CONNECTION_TIMEOUT,
      reconnectionEnabled: validatedEnv.GEMINI_RECONNECTION_ENABLED,
      maxReconnectionAttempts: validatedEnv.GEMINI_MAX_RECONNECTION_ATTEMPTS,
      reconnectionDelay: validatedEnv.GEMINI_RECONNECTION_DELAY
    },

    // Proxy Configuration
    proxy: {
      url: validatedEnv.PROXY_URL,
      websocketEnabled: validatedEnv.PROXY_WEBSOCKET_ENABLED,
      fallbackEnabled: validatedEnv.PROXY_FALLBACK_ENABLED,
      authToken: validatedEnv.PROXY_AUTH_TOKEN
    },

    // Fallback Services Configuration
    fallback: {
      googleCloud: {
        enabled: !!validatedEnv.GOOGLE_CLOUD_API_KEY,
        apiKey: validatedEnv.GOOGLE_CLOUD_API_KEY,
        endpoint: validatedEnv.GOOGLE_CLOUD_ENDPOINT
      },
      whisper: {
        enabled: !!validatedEnv.WHISPER_API_KEY,
        apiKey: validatedEnv.WHISPER_API_KEY,
        endpoint: validatedEnv.WHISPER_ENDPOINT
      },
      azureSpeech: {
        enabled: !!validatedEnv.AZURE_SPEECH_API_KEY,
        apiKey: validatedEnv.AZURE_SPEECH_API_KEY,
        endpoint: validatedEnv.AZURE_SPEECH_ENDPOINT,
        region: validatedEnv.AZURE_SPEECH_REGION
      }
    },

    // Security Configuration
    security: {
      enableCors: validatedEnv.ENABLE_CORS,
      corsOrigin: parseCorsOrigins(validatedEnv.CORS_ORIGIN),
      enableRateLimit: validatedEnv.ENABLE_RATE_LIMIT,
      rateLimitWindow: validatedEnv.RATE_LIMIT_WINDOW,
      rateLimitMax: validatedEnv.RATE_LIMIT_MAX
    },

    // Logging Configuration
    logging: {
      level: validatedEnv.LOG_LEVEL,
      enableConsole: validatedEnv.LOG_ENABLE_CONSOLE,
      enableFile: validatedEnv.LOG_ENABLE_FILE,
      fileLocation: validatedEnv.LOG_FILE_LOCATION,
      enableSanitization: validatedEnv.LOG_ENABLE_SANITIZATION
    },

    // Feature Flags
    features: {
      enableTelemetry: validatedEnv.ENABLE_TELEMETRY,
      enableExperimentalFeatures: validatedEnv.ENABLE_EXPERIMENTAL_FEATURES,
      enableDebugMode: validatedEnv.ENABLE_DEBUG_MODE
    }
  }

  return config
}

/**
 * Global configuration instance
 */
export const CONFIG = validateAndGetConfig()

/**
 * Configuration summary for debugging
 */
export function getConfigSummary(): string {
  return `
Application Configuration Summary:
=================================
Environment: ${CONFIG.nodeEnv}
Port: ${CONFIG.port}

Gemini Configuration:
- API Key: ${CONFIG.gemini.apiKey ? '***' + CONFIG.gemini.apiKey.slice(-4) : 'NOT SET'}
- Model: ${CONFIG.gemini.model}
- WebSocket Enabled: ${CONFIG.gemini.websocketEnabled}
- Transcription Mode: ${CONFIG.gemini.transcriptionMode}
- Fallback to Batch: ${CONFIG.gemini.fallbackToBatch}
- Real-time Threshold: ${CONFIG.gemini.realTimeThreshold}ms
- Connection Timeout: ${CONFIG.gemini.connectionTimeout}ms

Proxy Configuration:
- URL: ${CONFIG.proxy.url}
- WebSocket Enabled: ${CONFIG.proxy.websocketEnabled}
- Fallback Enabled: ${CONFIG.proxy.fallbackEnabled}
- Auth Token: ${CONFIG.proxy.authToken ? '***' + CONFIG.proxy.authToken.slice(-3) : 'NOT SET'}

Fallback Services:
- Google Cloud: ${CONFIG.fallback.googleCloud.enabled ? 'Enabled' : 'Disabled'}
- Whisper: ${CONFIG.fallback.whisper.enabled ? 'Enabled' : 'Disabled'}
- Azure Speech: ${CONFIG.fallback.azureSpeech.enabled ? 'Enabled' : 'Disabled'}

Security:
- CORS Enabled: ${CONFIG.security.enableCors}
- Rate Limiting: ${CONFIG.security.enableRateLimit}

Logging:
- Level: ${CONFIG.logging.level}
- Console: ${CONFIG.logging.enableConsole}
- File: ${CONFIG.logging.enableFile}

Feature Flags:
- Telemetry: ${CONFIG.features.enableTelemetry}
- Experimental Features: ${CONFIG.features.enableExperimentalFeatures}
- Debug Mode: ${CONFIG.features.enableDebugMode}
`.trim()
}

/**
 * Validate configuration on application startup
 */
export function validateConfigOnStartup(): void {
  try {
    validateAndGetConfig()
    console.log('✅ Configuration validation passed')

    if (CONFIG.features.enableDebugMode) {
      console.log('\n' + getConfigSummary())
    }
  } catch (error) {
    console.error('❌ Configuration validation failed:')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/**
 * Get configuration for specific service
 */
export const getGeminiConfig = () => CONFIG.gemini
export const getProxyConfig = () => CONFIG.proxy
export const getFallbackConfig = () => CONFIG.fallback
export const getSecurityConfig = () => CONFIG.security
export const getLoggingConfig = () => CONFIG.logging
export const getFeatureFlags = () => CONFIG.features

/**
 * Check if a feature flag is enabled
 */
export const isFeatureEnabled = (feature: keyof ApplicationConfig['features']): boolean => {
  return CONFIG.features[feature]
}

/**
 * Check if we're in development mode
 */
export const isDevelopment = (): boolean => CONFIG.nodeEnv === 'development'

/**
 * Check if we're in production mode
 */
export const isProduction = (): boolean => CONFIG.nodeEnv === 'production'

/**
 * Check if we're in test mode
 */
export const isTest = (): boolean => CONFIG.nodeEnv === 'test'

export default CONFIG
