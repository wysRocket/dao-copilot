/**
 * Unit tests for centralized configuration management system
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {validateAndGetConfig, getConfigSummary} from '../../helpers/centralized-config'
import {TranscriptionMode} from '../../services/gemini-live-integration'

describe('Centralized Configuration Management', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = {...process.env}
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('Configuration Validation', () => {
    it('should validate with valid configuration', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'gemini-live-2.5-flash-preview',
        GEMINI_WEBSOCKET_ENABLED: 'true',
        GEMINI_TRANSCRIPTION_MODE: 'hybrid'
      }

      expect(() => validateAndGetConfig()).not.toThrow()
    })

    it('should throw error when GEMINI_API_KEY is missing', () => {
      process.env = {}

      expect(() => validateAndGetConfig()).toThrow(/GEMINI_API_KEY is required/)
    })

    it('should throw error when GEMINI_API_KEY is too short', () => {
      process.env = {
        GEMINI_API_KEY: 'short'
      }

      expect(() => validateAndGetConfig()).toThrow(/appears to be too short/)
    })

    it('should use default values when optional configs are missing', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars'
      }

      const config = validateAndGetConfig()

      expect(config.gemini.model).toBe('gemini-live-2.5-flash-preview')
      expect(config.gemini.websocketEnabled).toBe(true)
      expect(config.gemini.transcriptionMode).toBe(TranscriptionMode.HYBRID)
      expect(config.gemini.fallbackToBatch).toBe(true)
      expect(config.gemini.realTimeThreshold).toBe(3000)
    })

    it('should validate websocket URL format', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_WEBSOCKET_URL: 'invalid-url'
      }

      expect(() => validateAndGetConfig()).toThrow()
    })

    it('should validate timeout values', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_REALTIME_THRESHOLD: '500', // Too low
        GEMINI_CONNECTION_TIMEOUT: '1000' // Too low
      }

      expect(() => validateAndGetConfig()).toThrow()
    })

    it('should validate transcription mode', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_TRANSCRIPTION_MODE: 'websocket'
      }

      const config = validateAndGetConfig()
      expect(config.gemini.transcriptionMode).toBe(TranscriptionMode.WEBSOCKET)
    })

    it('should validate transcription mode - batch', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_TRANSCRIPTION_MODE: 'batch'
      }

      const config = validateAndGetConfig()
      expect(config.gemini.transcriptionMode).toBe(TranscriptionMode.BATCH)
    })

    it('should validate transcription mode - hybrid', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_TRANSCRIPTION_MODE: 'hybrid'
      }

      const config = validateAndGetConfig()
      expect(config.gemini.transcriptionMode).toBe(TranscriptionMode.HYBRID)
    })
  })

  describe('Configuration Values', () => {
    it('should correctly parse boolean values', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_WEBSOCKET_ENABLED: 'false',
        GEMINI_FALLBACK_TO_BATCH: 'false',
        GEMINI_RECONNECTION_ENABLED: 'false'
      }

      const config = validateAndGetConfig()

      expect(config.gemini.websocketEnabled).toBe(false)
      expect(config.gemini.fallbackToBatch).toBe(false)
      expect(config.gemini.reconnectionEnabled).toBe(false)
    })

    it('should correctly parse numeric values', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_REALTIME_THRESHOLD: '5000',
        GEMINI_CONNECTION_TIMEOUT: '45000',
        GEMINI_MAX_RECONNECTION_ATTEMPTS: '10',
        GEMINI_RECONNECTION_DELAY: '2000'
      }

      const config = validateAndGetConfig()

      expect(config.gemini.realTimeThreshold).toBe(5000)
      expect(config.gemini.connectionTimeout).toBe(45000)
      expect(config.gemini.maxReconnectionAttempts).toBe(10)
      expect(config.gemini.reconnectionDelay).toBe(2000)
    })

    it('should handle proxy configuration', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        PROXY_URL: 'http://proxy.example.com:8080',
        PROXY_WEBSOCKET_ENABLED: 'false',
        PROXY_FALLBACK_ENABLED: 'false',
        PROXY_AUTH_TOKEN: 'proxy-token-123'
      }

      const config = validateAndGetConfig()

      expect(config.proxy.url).toBe('http://proxy.example.com:8080')
      expect(config.proxy.websocketEnabled).toBe(false)
      expect(config.proxy.fallbackEnabled).toBe(false)
      expect(config.proxy.authToken).toBe('proxy-token-123')
    })

    it('should handle fallback service configuration', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GOOGLE_CLOUD_API_KEY: 'gc-key-123',
        WHISPER_API_KEY: 'whisper-key-123',
        AZURE_SPEECH_API_KEY: 'azure-key-123',
        AZURE_SPEECH_REGION: 'westus2'
      }

      const config = validateAndGetConfig()

      expect(config.fallback.googleCloud.enabled).toBe(true)
      expect(config.fallback.googleCloud.apiKey).toBe('gc-key-123')
      expect(config.fallback.whisper.enabled).toBe(true)
      expect(config.fallback.whisper.apiKey).toBe('whisper-key-123')
      expect(config.fallback.azureSpeech.enabled).toBe(true)
      expect(config.fallback.azureSpeech.apiKey).toBe('azure-key-123')
      expect(config.fallback.azureSpeech.region).toBe('westus2')
    })
  })

  describe('Environment Specific Tests', () => {
    it('should handle development environment', () => {
      process.env = {
        NODE_ENV: 'development',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars'
      }

      const config = validateAndGetConfig()
      expect(config.nodeEnv).toBe('development')
    })

    it('should handle production environment', () => {
      process.env = {
        NODE_ENV: 'production',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars'
      }

      const config = validateAndGetConfig()
      expect(config.nodeEnv).toBe('production')
    })

    it('should handle test environment', () => {
      process.env = {
        NODE_ENV: 'test',
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars'
      }

      const config = validateAndGetConfig()
      expect(config.nodeEnv).toBe('test')
    })

    it('should default to development environment', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars'
      }

      const config = validateAndGetConfig()
      expect(config.nodeEnv).toBe('development')
    })
  })

  describe('Security Configuration', () => {
    it('should handle CORS configuration', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_CORS: 'false',
        CORS_ORIGIN: 'https://example.com,https://app.example.com'
      }

      const config = validateAndGetConfig()

      expect(config.security.enableCors).toBe(false)
      expect(config.security.corsOrigin).toEqual(['https://example.com', 'https://app.example.com'])
    })

    it('should handle wildcard CORS origin', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        CORS_ORIGIN: '*'
      }

      const config = validateAndGetConfig()
      expect(config.security.corsOrigin).toEqual(['*'])
    })

    it('should handle rate limiting configuration', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_RATE_LIMIT: 'false',
        RATE_LIMIT_WINDOW: '1800000', // 30 minutes
        RATE_LIMIT_MAX: '200'
      }

      const config = validateAndGetConfig()

      expect(config.security.enableRateLimit).toBe(false)
      expect(config.security.rateLimitWindow).toBe(1800000)
      expect(config.security.rateLimitMax).toBe(200)
    })
  })

  describe('Feature Flags', () => {
    it('should handle feature flags', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        ENABLE_TELEMETRY: 'true',
        ENABLE_EXPERIMENTAL_FEATURES: 'true',
        ENABLE_DEBUG_MODE: 'true'
      }

      const config = validateAndGetConfig()

      expect(config.features.enableTelemetry).toBe(true)
      expect(config.features.enableExperimentalFeatures).toBe(true)
      expect(config.features.enableDebugMode).toBe(true)
    })

    it('should default feature flags to false', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars'
      }

      const config = validateAndGetConfig()

      expect(config.features.enableTelemetry).toBe(false)
      expect(config.features.enableExperimentalFeatures).toBe(false)
      expect(config.features.enableDebugMode).toBe(false)
    })
  })

  describe('Configuration Summary', () => {
    it('should generate configuration summary', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'gemini-live-2.5-flash-preview'
      }

      // Generate config to ensure it's valid
      validateAndGetConfig()

      const summary = getConfigSummary()

      expect(summary).toContain('Application Configuration Summary')
      expect(summary).toContain('gemini-live-2.5-flash-preview')
      expect(summary).toContain('development')
    })
  })

  describe('Error Handling', () => {
    it('should provide detailed error messages for validation failures', () => {
      process.env = {
        GEMINI_API_KEY: 'short', // Too short
        GEMINI_REALTIME_THRESHOLD: '100', // Too low
        GEMINI_CONNECTION_TIMEOUT: '1000' // Too low
      }

      let errorMessage = ''
      try {
        validateAndGetConfig()
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error)
      }

      expect(errorMessage).toContain('Configuration validation failed')
      expect(errorMessage).toContain('appears to be too short')
    })

    it('should handle invalid model names gracefully', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'invalid-model'
      }

      expect(() => validateAndGetConfig()).toThrow()
    })

    it('should handle invalid transcription modes', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_TRANSCRIPTION_MODE: 'invalid-mode'
      }

      expect(() => validateAndGetConfig()).toThrow()
    })
  })

  describe('Model Configuration', () => {
    it('should default to gemini-live-2.5-flash-preview model', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars'
      }

      const config = validateAndGetConfig()
      expect(config.gemini.model).toBe('gemini-live-2.5-flash-preview')
    })

    it('should accept valid model names', () => {
      const validModels = ['gemini-live-2.5-flash-preview', 'gemini-1.5-flash', 'gemini-1.5-pro']

      for (const model of validModels) {
        process.env = {
          GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
          GEMINI_MODEL: model
        }

        const config = validateAndGetConfig()
        expect(config.gemini.model).toBe(model)
      }
    })

    it('should reject invalid model names', () => {
      process.env = {
        GEMINI_API_KEY: 'test-api-key-minimum-20-chars',
        GEMINI_MODEL: 'invalid-model-name'
      }

      expect(() => validateAndGetConfig()).toThrow()
    })
  })
})
