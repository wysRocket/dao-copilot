/**
 * Integration tests for configuration management with application services
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {
  validateAndGetConfig,
  getGeminiConfig,
  getProxyConfig,
  getFallbackConfig
} from '../../helpers/centralized-config'
import {loadConfigFromEnvironment} from '../../helpers/gemini-websocket-config'
import {TranscriptionMode} from '../../services/gemini-live-integration'

describe('Configuration Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = {...process.env}
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('Service Configuration Integration', () => {
    it('should provide configuration for Gemini services', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'gemini-live-2.5-flash-preview',
        GEMINI_WEBSOCKET_ENABLED: 'true',
        GEMINI_TRANSCRIPTION_MODE: 'hybrid',
        GEMINI_FALLBACK_TO_BATCH: 'true',
        GEMINI_REALTIME_THRESHOLD: '4000'
      }

      const config = getGeminiConfig()

      expect(config.apiKey).toBe('test-api-key-minimum-20-chars')
      expect(config.model).toBe('gemini-live-2.5-flash-preview')
      expect(config.websocketEnabled).toBe(true)
      expect(config.transcriptionMode).toBe(TranscriptionMode.HYBRID)
      expect(config.fallbackToBatch).toBe(true)
      expect(config.realTimeThreshold).toBe(4000)
    })

    it('should provide configuration for proxy services', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        PROXY_URL: 'http://proxy.test.com:3001',
        PROXY_WEBSOCKET_ENABLED: 'false',
        PROXY_FALLBACK_ENABLED: 'true',
        PROXY_AUTH_TOKEN: 'proxy-test-token'
      }

      const config = getProxyConfig()

      expect(config.url).toBe('http://proxy.test.com:3001')
      expect(config.websocketEnabled).toBe(false)
      expect(config.fallbackEnabled).toBe(true)
      expect(config.authToken).toBe('proxy-test-token')
    })

    it('should provide configuration for fallback services', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GOOGLE_CLOUD_API_KEY: 'gc-test-key',
        GOOGLE_CLOUD_ENDPOINT: 'https://speech.googleapis.com',
        WHISPER_API_KEY: 'whisper-test-key',
        WHISPER_ENDPOINT: 'https://api.openai.com/v1/audio',
        AZURE_SPEECH_API_KEY: 'azure-test-key',
        AZURE_SPEECH_ENDPOINT: 'https://eastus.api.cognitive.microsoft.com',
        AZURE_SPEECH_REGION: 'eastus'
      }

      const config = getFallbackConfig()

      expect(config.googleCloud.enabled).toBe(true)
      expect(config.googleCloud.apiKey).toBe('gc-test-key')
      expect(config.googleCloud.endpoint).toBe('https://speech.googleapis.com')

      expect(config.whisper.enabled).toBe(true)
      expect(config.whisper.apiKey).toBe('whisper-test-key')
      expect(config.whisper.endpoint).toBe('https://api.openai.com/v1/audio')

      expect(config.azureSpeech.enabled).toBe(true)
      expect(config.azureSpeech.apiKey).toBe('azure-test-key')
      expect(config.azureSpeech.endpoint).toBe('https://eastus.api.cognitive.microsoft.com')
      expect(config.azureSpeech.region).toBe('eastus')
    })
  })

  describe('Legacy Configuration Compatibility', () => {
    it('should work with legacy gemini-websocket-config', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'gemini-live-2.5-flash-preview',
        GEMINI_WEBSOCKET_ENABLED: 'true',
        GEMINI_TRANSCRIPTION_MODE: 'websocket'
      }

      // Test that legacy config loading still works
      const legacyConfig = loadConfigFromEnvironment()

      expect(legacyConfig.apiKey).toBe('test-api-key-minimum-20-chars')
      expect(legacyConfig.model).toBe('gemini-live-2.5-flash-preview')
      expect(legacyConfig.websocketEnabled).toBe(true)
      expect(legacyConfig.transcriptionMode).toBe(TranscriptionMode.WEBSOCKET)
    })
  })

  describe('Configuration Updates Propagation', () => {
    it('should reflect environment changes across all services', () => {
      // Initial configuration
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'gemini-1.5-flash',
        GEMINI_TRANSCRIPTION_MODE: 'batch'
      }

      const config1 = validateAndGetConfig()
      expect(config1.gemini.model).toBe('gemini-1.5-flash')
      expect(config1.gemini.transcriptionMode).toBe(TranscriptionMode.BATCH)

      // Update environment (simulating runtime config update)
      process.env.GEMINI_MODEL = 'gemini-live-2.5-flash-preview'
      process.env.GEMINI_TRANSCRIPTION_MODE = 'hybrid'

      // Get new configuration
      const config2 = validateAndGetConfig()
      expect(config2.gemini.model).toBe('gemini-live-2.5-flash-preview')
      expect(config2.gemini.transcriptionMode).toBe(TranscriptionMode.HYBRID)
    })
  })

  describe('Environment-Specific Configuration', () => {
    it('should handle development environment correctly', () => {
      process.env = {
        NODE_ENV: 'development',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_DEBUG_MODE: 'true',
        LOG_LEVEL: 'debug'
      }

      const config = validateAndGetConfig()

      expect(config.nodeEnv).toBe('development')
      expect(config.features.enableDebugMode).toBe(true)
      expect(config.logging.level).toBe('debug')
    })

    it('should handle production environment correctly', () => {
      process.env = {
        NODE_ENV: 'production',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_DEBUG_MODE: 'false',
        LOG_LEVEL: 'error',
        ENABLE_TELEMETRY: 'true'
      }

      const config = validateAndGetConfig()

      expect(config.nodeEnv).toBe('production')
      expect(config.features.enableDebugMode).toBe(false)
      expect(config.logging.level).toBe('error')
      expect(config.features.enableTelemetry).toBe(true)
    })

    it('should handle test environment correctly', () => {
      process.env = {
        NODE_ENV: 'test',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        LOG_LEVEL: 'warn',
        ENABLE_TELEMETRY: 'false'
      }

      const config = validateAndGetConfig()

      expect(config.nodeEnv).toBe('test')
      expect(config.logging.level).toBe('warn')
      expect(config.features.enableTelemetry).toBe(false)
    })
  })

  describe('Security Configuration Integration', () => {
    it('should handle CORS configuration for development', () => {
      process.env = {
        NODE_ENV: 'development',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_CORS: 'true',
        CORS_ORIGIN: 'http://localhost:3000,http://localhost:5173'
      }

      const config = validateAndGetConfig()

      expect(config.security.enableCors).toBe(true)
      expect(config.security.corsOrigin).toEqual(['http://localhost:3000', 'http://localhost:5173'])
    })

    it('should handle CORS configuration for production', () => {
      process.env = {
        NODE_ENV: 'production',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_CORS: 'true',
        CORS_ORIGIN: 'https://app.example.com'
      }

      const config = validateAndGetConfig()

      expect(config.security.enableCors).toBe(true)
      expect(config.security.corsOrigin).toEqual(['https://app.example.com'])
    })

    it('should handle rate limiting configuration', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_RATE_LIMIT: 'true',
        RATE_LIMIT_WINDOW: '600000', // 10 minutes
        RATE_LIMIT_MAX: '50'
      }

      const config = validateAndGetConfig()

      expect(config.security.enableRateLimit).toBe(true)
      expect(config.security.rateLimitWindow).toBe(600000)
      expect(config.security.rateLimitMax).toBe(50)
    })
  })

  describe('Model Configuration Consistency', () => {
    it('should use gemini-live-2.5-flash-preview consistently across all services', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'gemini-live-2.5-flash-preview'
      }

      const config = validateAndGetConfig()
      const geminiConfig = getGeminiConfig()
      const legacyConfig = loadConfigFromEnvironment()

      // All configurations should use the same model
      expect(config.gemini.model).toBe('gemini-live-2.5-flash-preview')
      expect(geminiConfig.model).toBe('gemini-live-2.5-flash-preview')
      expect(legacyConfig.model).toBe('gemini-live-2.5-flash-preview')
    })

    it('should support all valid model configurations', () => {
      const validModels = ['gemini-live-2.5-flash-preview', 'gemini-1.5-flash', 'gemini-1.5-pro']

      for (const model of validModels) {
        process.env = {
          GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
          GEMINI_MODEL: model
        }

        const config = validateAndGetConfig()
        const geminiConfig = getGeminiConfig()
        const legacyConfig = loadConfigFromEnvironment()

        expect(config.gemini.model).toBe(model)
        expect(geminiConfig.model).toBe(model)
        expect(legacyConfig.model).toBe(model)
      }
    })
  })

  describe('Error Handling Integration', () => {
    it('should handle configuration errors gracefully in service integration', () => {
      process.env = {
        GEMINI_API_KEY: 'short', // Invalid
        GEMINI_MODEL: 'invalid-model'
      }

      expect(() => validateAndGetConfig()).toThrow()
      expect(() => getGeminiConfig()).toThrow()
    })

    it('should provide helpful error messages for service configuration', () => {
      process.env = {}

      let errorMessage = ''
      try {
        validateAndGetConfig()
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error)
      }

      expect(errorMessage).toContain('GEMINI_API_KEY is required')
      expect(errorMessage).toContain('Please set your Google API key')
    })
  })
})
