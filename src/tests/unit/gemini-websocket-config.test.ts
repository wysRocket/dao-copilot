/**
 * Tests for Gemini WebSocket Configuration
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import {
  loadConfigFromEnvironment,
  validateConfig,
  getValidatedConfig,
  setupDevelopmentEnvironment,
  getConfigSummary,
  type GeminiWebSocketConfig
} from '../../helpers/gemini-websocket-config'
import {TranscriptionMode} from '../../services/gemini-live-integration'

describe('Gemini WebSocket Configuration', () => {
  beforeEach(() => {
    // Reset environment variables
    vi.clearAllMocks()
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.GEMINI_WEBSOCKET_ENABLED
    delete process.env.GEMINI_TRANSCRIPTION_MODE
    delete process.env.GEMINI_WEBSOCKET_URL
    delete process.env.GEMINI_FALLBACK_TO_BATCH
    delete process.env.GEMINI_REALTIME_THRESHOLD
    delete process.env.GEMINI_CONNECTION_TIMEOUT
    delete process.env.GEMINI_RECONNECTION_ENABLED
    delete process.env.GEMINI_MAX_RECONNECTION_ATTEMPTS
    delete process.env.GEMINI_RECONNECTION_DELAY
    delete process.env.PROXY_URL
    delete process.env.PROXY_WEBSOCKET_ENABLED
    delete process.env.PROXY_FALLBACK_ENABLED
    delete process.env.PROXY_AUTH_TOKEN
  })

  describe('loadConfigFromEnvironment', () => {
    it('should load default configuration when no environment variables are set', () => {
      const config = loadConfigFromEnvironment()

      expect(config.websocketEnabled).toBe(true)
      expect(config.transcriptionMode).toBe(TranscriptionMode.HYBRID)
      expect(config.fallbackToBatch).toBe(true)
      expect(config.reconnectionEnabled).toBe(true)
      expect(config.proxyWebSocketEnabled).toBe(true)
      expect(config.proxyFallbackEnabled).toBe(true)
      expect(config.apiKey).toBe('')
    })

    it('should load configuration from environment variables', () => {
      process.env.GEMINI_API_KEY = 'test-api-key'
      process.env.GEMINI_WEBSOCKET_ENABLED = 'false'
      process.env.GEMINI_TRANSCRIPTION_MODE = 'batch'
      process.env.GEMINI_REALTIME_THRESHOLD = '5000'
      process.env.GEMINI_CONNECTION_TIMEOUT = '45000'
      process.env.PROXY_URL = 'http://localhost:4000'

      const config = loadConfigFromEnvironment()

      expect(config.apiKey).toBe('test-api-key')
      expect(config.websocketEnabled).toBe(false)
      expect(config.transcriptionMode).toBe(TranscriptionMode.BATCH)
      expect(config.realTimeThreshold).toBe(5000)
      expect(config.connectionTimeout).toBe(45000)
      expect(config.proxyUrl).toBe('http://localhost:4000')
    })

    it('should handle different API key environment variables', () => {
      process.env.GOOGLE_API_KEY = 'google-api-key'
      let config = loadConfigFromEnvironment()
      expect(config.apiKey).toBe('google-api-key')

      delete process.env.GOOGLE_API_KEY
      process.env.VITE_GOOGLE_API_KEY = 'vite-api-key'
      config = loadConfigFromEnvironment()
      expect(config.apiKey).toBe('vite-api-key')
    })

    it('should handle different transcription modes', () => {
      process.env.GEMINI_TRANSCRIPTION_MODE = 'websocket'
      let config = loadConfigFromEnvironment()
      expect(config.transcriptionMode).toBe(TranscriptionMode.WEBSOCKET)

      process.env.GEMINI_TRANSCRIPTION_MODE = 'ws'
      config = loadConfigFromEnvironment()
      expect(config.transcriptionMode).toBe(TranscriptionMode.WEBSOCKET)

      process.env.GEMINI_TRANSCRIPTION_MODE = 'batch'
      config = loadConfigFromEnvironment()
      expect(config.transcriptionMode).toBe(TranscriptionMode.BATCH)

      process.env.GEMINI_TRANSCRIPTION_MODE = 'http'
      config = loadConfigFromEnvironment()
      expect(config.transcriptionMode).toBe(TranscriptionMode.BATCH)

      process.env.GEMINI_TRANSCRIPTION_MODE = 'auto'
      config = loadConfigFromEnvironment()
      expect(config.transcriptionMode).toBe(TranscriptionMode.HYBRID)
    })
  })

  describe('validateConfig', () => {
    const validConfig: GeminiWebSocketConfig = {
      apiKey: 'valid-api-key-with-sufficient-length',
      websocketEnabled: true,
      transcriptionMode: TranscriptionMode.HYBRID,
      websocketUrl: 'wss://example.com/ws',
      fallbackToBatch: true,
      realTimeThreshold: 3000,
      connectionTimeout: 30000,
      reconnectionEnabled: true,
      maxReconnectionAttempts: 5,
      reconnectionDelay: 1000,
      proxyUrl: 'http://localhost:3001',
      proxyWebSocketEnabled: true,
      proxyFallbackEnabled: true
    }

    it('should validate a correct configuration', () => {
      const validation = validateConfig(validConfig)

      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect missing API key', () => {
      const config = {...validConfig, apiKey: ''}
      const validation = validateConfig(config)

      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain(
        'API key is required. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.'
      )
    })

    it('should warn about short API key', () => {
      const config = {...validConfig, apiKey: 'short'}
      const validation = validateConfig(config)

      expect(validation.warnings).toContain(
        'API key appears to be too short. Please verify it is correct.'
      )
    })

    it('should validate WebSocket URL', () => {
      const config = {...validConfig, websocketUrl: 'invalid-url'}
      const validation = validateConfig(config)

      expect(validation.errors).toContain('Invalid WebSocket URL format.')
    })

    it('should warn about insecure WebSocket URL', () => {
      const config = {...validConfig, websocketUrl: 'ws://example.com/ws'}
      const validation = validateConfig(config)

      expect(validation.warnings).toContain(
        'WebSocket URL should use wss:// for secure connections in production.'
      )
    })

    it('should validate timeout values', () => {
      const config = {...validConfig, connectionTimeout: 2000, realTimeThreshold: 500}
      const validation = validateConfig(config)

      expect(validation.warnings).toContain(
        'Connection timeout is very low. Consider using at least 5 seconds.'
      )
      expect(validation.warnings).toContain(
        'Real-time threshold is very low. This may cause excessive WebSocket usage.'
      )
    })

    it('should validate reconnection settings', () => {
      const config = {...validConfig, reconnectionEnabled: true, maxReconnectionAttempts: 0}
      const validation = validateConfig(config)

      expect(validation.errors).toContain(
        'Maximum reconnection attempts must be at least 1 when reconnection is enabled.'
      )
    })

    it('should provide recommendations', () => {
      const config = {
        ...validConfig,
        transcriptionMode: TranscriptionMode.WEBSOCKET,
        fallbackToBatch: false,
        reconnectionEnabled: false,
        proxyFallbackEnabled: false
      }
      const validation = validateConfig(config)

      expect(validation.recommendations).toContain(
        'Consider enabling fallback to batch mode for better reliability.'
      )
      expect(validation.recommendations).toContain(
        'Consider enabling reconnection for better user experience.'
      )
      expect(validation.recommendations).toContain(
        'Consider enabling proxy fallback for environments with restricted network access.'
      )
    })
  })

  describe('setupDevelopmentEnvironment', () => {
    it('should set development defaults when environment variables are not set', () => {
      setupDevelopmentEnvironment()

      expect(process.env.GEMINI_WEBSOCKET_ENABLED).toBe('true')
      expect(process.env.GEMINI_TRANSCRIPTION_MODE).toBe('hybrid')
      expect(process.env.GEMINI_FALLBACK_TO_BATCH).toBe('true')
      expect(process.env.GEMINI_RECONNECTION_ENABLED).toBe('true')
      expect(process.env.PROXY_WEBSOCKET_ENABLED).toBe('true')
      expect(process.env.PROXY_FALLBACK_ENABLED).toBe('true')
    })

    it('should not override existing environment variables', () => {
      process.env.GEMINI_WEBSOCKET_ENABLED = 'false'

      setupDevelopmentEnvironment()

      expect(process.env.GEMINI_WEBSOCKET_ENABLED).toBe('false')
    })
  })

  describe('getValidatedConfig', () => {
    it('should return configuration with validation results', () => {
      process.env.GEMINI_API_KEY = 'test-api-key-with-sufficient-length'

      const result = getValidatedConfig()

      expect(result.config).toBeDefined()
      expect(result.validation).toBeDefined()
      expect(result.config.apiKey).toBe('test-api-key-with-sufficient-length')
    })
  })

  describe('getConfigSummary', () => {
    it('should generate a readable configuration summary', () => {
      const config: GeminiWebSocketConfig = {
        apiKey: 'test-api-key-123456',
        websocketEnabled: true,
        transcriptionMode: TranscriptionMode.HYBRID,
        websocketUrl: 'wss://example.com/ws',
        fallbackToBatch: true,
        realTimeThreshold: 3000,
        connectionTimeout: 30000,
        reconnectionEnabled: true,
        maxReconnectionAttempts: 5,
        reconnectionDelay: 1000,
        proxyUrl: 'http://localhost:3001',
        proxyWebSocketEnabled: true,
        proxyFallbackEnabled: true,
        proxyAuthToken: 'proxy-token-789'
      }

      const summary = getConfigSummary(config)

      expect(summary).toContain('***3456') // Masked API key
      expect(summary).toContain('WebSocket Enabled: true')
      expect(summary).toContain('Transcription Mode: hybrid')
      expect(summary).toContain('***789') // Masked proxy token
    })

    it('should handle missing optional values', () => {
      const config: GeminiWebSocketConfig = {
        apiKey: '',
        websocketEnabled: false,
        transcriptionMode: TranscriptionMode.BATCH,
        websocketUrl: 'wss://example.com/ws',
        fallbackToBatch: false,
        realTimeThreshold: 5000,
        connectionTimeout: 15000,
        reconnectionEnabled: false,
        maxReconnectionAttempts: 3,
        reconnectionDelay: 2000,
        proxyUrl: 'http://localhost:3001',
        proxyWebSocketEnabled: false,
        proxyFallbackEnabled: false
      }

      const summary = getConfigSummary(config)

      expect(summary).toContain('API Key: NOT SET')
      expect(summary).toContain('Proxy Auth Token: NOT SET')
    })
  })
})
