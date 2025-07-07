/**
 * Test Suite for Enhanced WebSocket Connection Establishment - Fixed Version
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  WebSocketConnectionEstablisher,
  type ConnectionConfig
} from '../../services/websocket-connection-establisher'
import {GeminiErrorHandler} from '../../services/gemini-error-handler'

// Mock WebSocket with proper constants
const mockWebSocketConstants = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
}

// Helper to create proper mock Event objects
const createMockEvent = (): Event =>
  ({
    bubbles: false,
    cancelBubble: false,
    cancelable: false,
    composed: false,
    currentTarget: null,
    defaultPrevented: false,
    eventPhase: 0,
    isTrusted: false,
    returnValue: true,
    srcElement: null,
    target: null,
    timeStamp: Date.now(),
    type: 'open',
    initEvent: vi.fn(),
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
    composedPath: vi.fn(() => []),
    AT_TARGET: 2,
    BUBBLING_PHASE: 3,
    CAPTURING_PHASE: 1,
    NONE: 0
  }) as Event

const createMockCloseEvent = (code: number, reason: string, wasClean: boolean): CloseEvent =>
  ({
    ...createMockEvent(),
    type: 'close',
    code,
    reason,
    wasClean
  }) as CloseEvent

const createMockErrorEvent = (message?: string): Event =>
  ({
    ...createMockEvent(),
    type: 'error',
    message: message || 'Connection error'
  }) as Event

// Mock WebSocket class
const createMockWebSocket = (initialState = mockWebSocketConstants.CONNECTING) => ({
  ...mockWebSocketConstants,
  readyState: initialState,
  protocol: '',
  extensions: '',
  url: '',
  onopen: null as ((event: Event) => void) | null,
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  onclose: null as ((event: CloseEvent) => void) | null,
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
})

describe('WebSocketConnectionEstablisher', () => {
  let establisher: WebSocketConnectionEstablisher
  let errorHandler: GeminiErrorHandler
  let defaultConfig: ConnectionConfig
  let mockWebSocket: ReturnType<typeof createMockWebSocket>

  beforeEach(() => {
    vi.clearAllMocks()

    // Create error handler with proper event listener to prevent uncaught errors
    errorHandler = new GeminiErrorHandler()
    errorHandler.on('error', () => {
      // Handle errors silently in tests
    })

    defaultConfig = {
      apiKey: 'test-api-key',
      endpoint: 'wss://example.com/ws',
      model: 'gemini-live-2.5-flash-preview',
      connectionTimeout: 5000,
      handshakeTimeout: 2000
    }

    // Create fresh mock WebSocket for each test
    mockWebSocket = createMockWebSocket()

    // Mock global WebSocket with constants
    global.WebSocket = vi
      .fn()
      .mockImplementation(() => mockWebSocket) as unknown as typeof WebSocket
    Object.assign(global.WebSocket, mockWebSocketConstants)

    establisher = new WebSocketConnectionEstablisher(defaultConfig, errorHandler)
  })

  afterEach(async () => {
    await establisher.cleanup()
    errorHandler.removeAllListeners()
  })

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      expect(establisher).toBeInstanceOf(WebSocketConnectionEstablisher)
      expect(establisher.getActiveConnectionCount()).toBe(0)
    })

    it('should merge provided configuration with defaults', () => {
      const customConfig = {
        ...defaultConfig,
        connectionTimeout: 10000,
        retryAttempts: 5
      }

      const customEstablisher = new WebSocketConnectionEstablisher(customConfig, errorHandler)
      expect(customEstablisher).toBeInstanceOf(WebSocketConnectionEstablisher)
    })
  })

  describe('Configuration Validation', () => {
    it('should validate required API key', async () => {
      const invalidConfig = {...defaultConfig, apiKey: ''}
      const invalidEstablisher = new WebSocketConnectionEstablisher(invalidConfig, errorHandler)

      const result = await invalidEstablisher.establishConnection()

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('API key is required')
    })

    it('should validate endpoint', async () => {
      const invalidConfig = {...defaultConfig, endpoint: ''}
      const invalidEstablisher = new WebSocketConnectionEstablisher(invalidConfig, errorHandler)

      const result = await invalidEstablisher.establishConnection()

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('endpoint is required')
    })

    it('should validate timeout values', async () => {
      const invalidConfig = {...defaultConfig, connectionTimeout: 500}
      const invalidEstablisher = new WebSocketConnectionEstablisher(invalidConfig, errorHandler)

      const result = await invalidEstablisher.establishConnection()

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('timeout must be at least')
    })

    it('should validate TLS configuration', async () => {
      const invalidConfig = {
        ...defaultConfig,
        tlsConfig: {cert: 'test-cert'}
      }
      const invalidEstablisher = new WebSocketConnectionEstablisher(invalidConfig, errorHandler)

      const result = await invalidEstablisher.establishConnection()

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('requires corresponding private key')
    })
  })

  describe('Connection Establishment', () => {
    it('should establish connection successfully', async () => {
      // Setup successful connection simulation
      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      const result = await establisher.establishConnection()

      expect(result.success).toBe(true)
      expect(result.websocket).toBeDefined()
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('key=test-api-key'),
        undefined
      )
    })

    it('should handle connection timeout', async () => {
      const timeoutEstablisher = new WebSocketConnectionEstablisher(
        {
          ...defaultConfig,
          connectionTimeout: 1000
        },
        errorHandler
      )

      // Don't trigger onopen to simulate timeout
      const result = await timeoutEstablisher.establishConnection()

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('timeout')
    })

    it('should handle WebSocket errors', async () => {
      setTimeout(() => {
        if (mockWebSocket.onerror) mockWebSocket.onerror(createMockErrorEvent('Connection failed'))
      }, 10)

      const result = await establisher.establishConnection()

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('WebSocket connection error')
    })

    it('should handle connection close during establishment', async () => {
      setTimeout(() => {
        if (mockWebSocket.onclose)
          mockWebSocket.onclose(createMockCloseEvent(1006, 'Connection dropped', false))
      }, 10)

      const result = await establisher.establishConnection()

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('WebSocket closed during connection')
    })
  })

  describe('Authentication Methods', () => {
    it('should build URL with API key authentication', async () => {
      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      const result = await establisher.establishConnection()

      expect(result.success).toBe(true)
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('key=test-api-key'),
        undefined
      )
    })

    it('should handle OAuth authentication', async () => {
      const oauthConfig = {
        ...defaultConfig,
        authConfig: {
          method: 'oauth' as const,
          credentials: {accessToken: 'oauth-token'}
        }
      }
      const oauthEstablisher = new WebSocketConnectionEstablisher(oauthConfig, errorHandler)

      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      const result = await oauthEstablisher.establishConnection()

      expect(result.success).toBe(true)
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('access_token=oauth-token'),
        undefined
      )
    })

    it('should handle JWT authentication', async () => {
      const jwtConfig = {
        ...defaultConfig,
        authConfig: {
          method: 'jwt' as const,
          credentials: {token: 'jwt-token'}
        }
      }
      const jwtEstablisher = new WebSocketConnectionEstablisher(jwtConfig, errorHandler)

      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      const result = await jwtEstablisher.establishConnection()

      expect(result.success).toBe(true)
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('jwt=jwt-token'),
        undefined
      )
    })
  })

  describe('Connection Management', () => {
    it('should track active connections', async () => {
      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      expect(establisher.getActiveConnectionCount()).toBe(0)

      await establisher.establishConnection()

      expect(establisher.getActiveConnectionCount()).toBe(1)
    })

    it('should provide connection metrics', async () => {
      const connectionId = 'test-connection-id'

      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      const result = await establisher.establishConnection(connectionId)

      expect(result.success).toBe(true)
      expect(result.metrics).toBeDefined()
      expect(typeof result.metrics.connectionStartTime).toBe('number')

      const metrics = establisher.getConnectionMetrics(connectionId)
      expect(metrics).toBeDefined()
      expect(typeof metrics!.connectionStartTime).toBe('number')
    })
  })

  describe('Error Handling', () => {
    it('should emit connection events', async () => {
      const attemptStartedSpy = vi.fn()
      const connectionEstablishedSpy = vi.fn()
      const connectionFailedSpy = vi.fn()

      establisher.on('connectionAttemptStarted', attemptStartedSpy)
      establisher.on('connectionEstablished', connectionEstablishedSpy)
      establisher.on('connectionFailed', connectionFailedSpy)

      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      const result = await establisher.establishConnection()

      expect(result.success).toBe(true)
      expect(attemptStartedSpy).toHaveBeenCalled()
      expect(connectionEstablishedSpy).toHaveBeenCalled()
      expect(connectionFailedSpy).not.toHaveBeenCalled()
    })
  })

  describe('Cleanup', () => {
    it('should clean up all resources', async () => {
      setTimeout(() => {
        mockWebSocket.readyState = mockWebSocketConstants.OPEN
        if (mockWebSocket.onopen) mockWebSocket.onopen(createMockEvent())
      }, 10)

      await establisher.establishConnection()
      expect(establisher.getActiveConnectionCount()).toBe(1)

      await establisher.cleanup()
      expect(establisher.getActiveConnectionCount()).toBe(0)
    })
  })
})
