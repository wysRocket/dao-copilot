import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import fetch, {Response} from 'node-fetch'
import {
  transcribeAudioViaProxy,
  transcribeAudioViaProxyEnhanced,
  validateProxyConfig,
  getDefaultProxyConfig,
  createProxyTranscriber,
  checkProxyHealth,
  ProxyTranscriptionEnv,
  TranscriptionMode
} from './proxy-stt-transcription'

// Mock fetch
vi.mock('node-fetch')
const mockFetch = vi.mocked(fetch)

// Mock proxy auth token
vi.mock('../helpers/proxy-server', () => ({
  getProxyAuthToken: () => 'mock-auth-token'
}))

describe('Proxy STT Transcription Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment variables
    delete process.env.GOOGLE_API_KEY
    delete process.env.GEMINI_WEBSOCKET_ENABLED
    delete process.env.GEMINI_TRANSCRIPTION_MODE
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockAudioData = Buffer.from('mock-audio-data')
  const mockApiKey = 'test-api-key'

  describe('transcribeAudioViaProxy (legacy)', () => {
    it('should successfully transcribe audio via batch proxy', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{text: 'Hello world'}]
            }
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response)

      const result = await transcribeAudioViaProxy(mockAudioData, {
        apiKey: mockApiKey
      })

      expect(result.text).toBe('Hello world')
      expect(result.duration).toBeGreaterThan(0)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/gemini/models/'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-proxy-auth': 'mock-auth-token',
            'x-transcription-mode': 'batch'
          })
        })
      )
    })

    it('should throw error when API key is missing', async () => {
      await expect(transcribeAudioViaProxy(mockAudioData, {})).rejects.toThrow(
        'Google API Key is required'
      )
    })

    it('should handle proxy server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      } as Response)

      await expect(transcribeAudioViaProxy(mockAudioData, {apiKey: mockApiKey})).rejects.toThrow(
        'Batch proxy transcription failed: 500 Internal Server Error'
      )
    })
  })

  describe('transcribeAudioViaProxyEnhanced', () => {
    beforeEach(() => {
      process.env.GOOGLE_API_KEY = mockApiKey
    })

    it('should use batch mode by default', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{text: 'Batch transcription result'}]
            }
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response)

      const result = await transcribeAudioViaProxyEnhanced(mockAudioData, {
        mode: TranscriptionMode.BATCH
      })

      expect(result.text).toBe('Batch transcription result')
      expect(result.source).toBe('batch-proxy')
    })

    it('should use WebSocket mode when enabled', async () => {
      process.env.GEMINI_WEBSOCKET_ENABLED = 'true'

      const mockWsResponse = {
        text: 'WebSocket transcription result',
        confidence: 0.95
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWsResponse)
      } as Response)

      const result = await transcribeAudioViaProxyEnhanced(mockAudioData, {
        mode: TranscriptionMode.WEBSOCKET,
        enableWebSocket: true
      })

      expect(result.text).toBe('WebSocket transcription result')
      expect(result.source).toBe('websocket-proxy')
      expect(result.confidence).toBe(0.95)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/gemini/websocket/transcribe'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-transcription-mode': 'websocket'
          })
        })
      )
    })

    it('should handle hybrid mode with short audio', async () => {
      process.env.GEMINI_WEBSOCKET_ENABLED = 'true'

      const mockWsResponse = {
        text: 'Short audio WebSocket result',
        confidence: 0.9
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWsResponse)
      } as Response)

      // Create short audio buffer
      const shortAudioData = Buffer.from('short')

      const result = await transcribeAudioViaProxyEnhanced(shortAudioData, {
        mode: TranscriptionMode.HYBRID,
        enableWebSocket: true,
        realTimeThreshold: 1000
      })

      expect(result.text).toBe('Short audio WebSocket result')
      expect(result.source).toBe('websocket-proxy')
    })

    it('should fallback to batch mode when WebSocket fails', async () => {
      process.env.GEMINI_WEBSOCKET_ENABLED = 'true'

      // First call (WebSocket) fails
      mockFetch.mockRejectedValueOnce(new Error('WebSocket connection failed'))

      // Second call (batch) succeeds
      const mockBatchResponse = {
        candidates: [
          {
            content: {
              parts: [{text: 'Fallback batch result'}]
            }
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBatchResponse)
      } as Response)

      const result = await transcribeAudioViaProxyEnhanced(mockAudioData, {
        mode: TranscriptionMode.HYBRID,
        enableWebSocket: true,
        fallbackToBatch: true
      })

      expect(result.text).toBe('Fallback batch result')
      expect(result.source).toBe('batch-proxy')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should throw error for unsupported mode', async () => {
      await expect(
        transcribeAudioViaProxyEnhanced(mockAudioData, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mode: 'invalid-mode' as any
        })
      ).rejects.toThrow('Unsupported transcription mode: invalid-mode')
    })
  })

  describe('Configuration validation', () => {
    it('should validate correct configuration', () => {
      process.env.GOOGLE_API_KEY = mockApiKey

      const validation = validateProxyConfig({
        mode: TranscriptionMode.BATCH,
        proxyUrl: 'http://localhost:8001',
        realTimeThreshold: 3000
      })

      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect missing API key', () => {
      const validation = validateProxyConfig({})

      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain(
        'Google API Key is required but not found in options or environment variables'
      )
    })

    it('should detect invalid proxy URL', () => {
      process.env.GOOGLE_API_KEY = mockApiKey

      const validation = validateProxyConfig({
        proxyUrl: 'invalid-url'
      })

      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Invalid proxy URL: invalid-url')
    })

    it('should detect invalid transcription mode', () => {
      process.env.GOOGLE_API_KEY = mockApiKey

      const validation = validateProxyConfig({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mode: 'invalid' as any
      })

      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Invalid transcription mode: invalid')
    })

    it('should warn about WebSocket configuration mismatch', () => {
      process.env.GOOGLE_API_KEY = mockApiKey
      process.env.GEMINI_WEBSOCKET_ENABLED = 'false'

      const validation = validateProxyConfig({
        mode: TranscriptionMode.WEBSOCKET
      })

      expect(validation.warnings).toContain('WebSocket mode requested but WebSocket is not enabled')
    })
  })

  describe('Default configuration', () => {
    it('should return default configuration from environment', () => {
      process.env.GEMINI_TRANSCRIPTION_MODE = 'websocket'
      process.env.GEMINI_WEBSOCKET_ENABLED = 'true'
      process.env.GEMINI_FALLBACK_TO_BATCH = 'false'
      process.env.GEMINI_REALTIME_THRESHOLD = '5000'
      process.env.PROXY_URL = 'http://custom-proxy:9000'
      process.env.GEMINI_MODEL = 'custom-model'

      const config = getDefaultProxyConfig()

      expect(config.mode).toBe(TranscriptionMode.WEBSOCKET)
      expect(config.enableWebSocket).toBe(true)
      expect(config.fallbackToBatch).toBe(false)
      expect(config.realTimeThreshold).toBe(5000)
      expect(config.proxyUrl).toBe('http://custom-proxy:9000')
      expect(config.modelName).toBe('custom-model')
    })

    it('should use defaults when environment variables are not set', () => {
      const config = getDefaultProxyConfig()

      expect(config.mode).toBe(TranscriptionMode.HYBRID)
      expect(config.enableWebSocket).toBe(true)
      expect(config.fallbackToBatch).toBe(true)
      expect(config.realTimeThreshold).toBe(3000)
      expect(config.proxyUrl).toBe('http://localhost:8001')
      expect(config.modelName).toBe('gemini-2.5-flash-preview-05-20')
    })
  })

  describe('Proxy transcriber factory', () => {
    it('should create configured transcriber function', async () => {
      process.env.GOOGLE_API_KEY = mockApiKey

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{text: 'Factory transcription'}]
            }
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response)

      const transcriber = createProxyTranscriber({
        mode: TranscriptionMode.BATCH,
        modelName: 'custom-model'
      })

      const result = await transcriber(mockAudioData)

      expect(result.text).toBe('Factory transcription')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom-model'),
        expect.any(Object)
      )
    })

    it('should allow override options', async () => {
      process.env.GOOGLE_API_KEY = mockApiKey

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{text: 'Override transcription'}]
            }
          }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response)

      const transcriber = createProxyTranscriber({
        mode: TranscriptionMode.BATCH
      })

      const result = await transcriber(mockAudioData, {
        modelName: 'override-model'
      })

      expect(result.text).toBe('Override transcription')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('override-model'),
        expect.any(Object)
      )
    })
  })

  describe('Proxy health check', () => {
    it('should check proxy health successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true
        } as Response)
        .mockResolvedValueOnce({
          ok: true
        } as Response)

      const health = await checkProxyHealth('http://test-proxy:8000')

      expect(health.isHealthy).toBe(true)
      expect(health.supportsWebSocket).toBe(true)
      expect(health.latency).toBeGreaterThan(0)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-proxy:8000/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-proxy-auth': 'mock-auth-token'
          })
        })
      )
    })

    it('should detect unhealthy proxy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503
      } as Response)

      const health = await checkProxyHealth()

      expect(health.isHealthy).toBe(false)
      expect(health.supportsWebSocket).toBe(false)
      expect(health.error).toContain('Health check failed: 503')
    })

    it('should handle connection errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const health = await checkProxyHealth()

      expect(health.isHealthy).toBe(false)
      expect(health.error).toBe('Connection refused')
    })

    it('should detect WebSocket support correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 404
        } as Response)

      const health = await checkProxyHealth()

      expect(health.isHealthy).toBe(true)
      expect(health.supportsWebSocket).toBe(false)
    })
  })

  describe('Environment configuration helper', () => {
    it('should check if proxy is configured', () => {
      process.env.GOOGLE_API_KEY = mockApiKey

      expect(ProxyTranscriptionEnv.isConfigured()).toBe(true)
    })

    it('should detect missing configuration', () => {
      expect(ProxyTranscriptionEnv.isConfigured()).toBe(false)
    })

    it('should get complete configuration status', () => {
      process.env.GOOGLE_API_KEY = mockApiKey
      process.env.GEMINI_WEBSOCKET_ENABLED = 'true'
      process.env.GEMINI_TRANSCRIPTION_MODE = 'hybrid'

      const status = ProxyTranscriptionEnv.getConfigStatus()

      expect(status.isValid).toBe(true)
      expect(status.environment.hasApiKey).toBe(true)
      expect(status.environment.webSocketEnabled).toBe(true)
      expect(status.environment.transcriptionMode).toBe('hybrid')
    })
  })
})
