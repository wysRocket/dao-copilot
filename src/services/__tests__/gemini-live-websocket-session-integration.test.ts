/**
 * Integration tests for GeminiLiveWebSocketClient with SessionManager
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import GeminiLiveWebSocketClient from '../gemini-live-websocket'
import {SessionManager} from '../gemini-session-manager'

// Mock WebSocket
const mockWebSocketInstance = {
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  readyState: 1,
  url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
  onopen: vi.fn(),
  onmessage: vi.fn(),
  onerror: vi.fn(),
  onclose: vi.fn()
}

const MockWebSocket = vi.fn(() => mockWebSocketInstance)
MockWebSocket.CONNECTING = 0
MockWebSocket.OPEN = 1
MockWebSocket.CLOSING = 2
MockWebSocket.CLOSED = 3

global.WebSocket = MockWebSocket as unknown as typeof WebSocket

// Mock SessionManager
const mockSessionManagerInstance = {
  createSession: vi.fn(),
  configureSession: vi.fn(),
  resumeSession: vi.fn(),
  terminateSession: vi.fn(),
  getSetupMessage: vi.fn(),
  getSessionId: vi.fn(),
  getSessionState: vi.fn(),
  getSessionStats: vi.fn(),
  on: vi.fn(),
  emit: vi.fn()
}

vi.mock('../gemini-session-manager', () => ({
  SessionManager: vi.fn(() => mockSessionManagerInstance),
  SessionState: {
    INITIALIZING: 'initializing',
    ACTIVE: 'active',
    PAUSED: 'paused',
    RESUMING: 'resuming',
    TERMINATING: 'terminating',
    TERMINATED: 'terminated',
    ERROR: 'error'
  }
}))

// Mock other dependencies
vi.mock('../gemini-error-handler', () => ({
  GeminiErrorHandler: vi.fn(() => ({
    handleError: vi.fn(error => error),
    on: vi.fn()
  }))
}))

vi.mock('../gemini-message-handler', () => ({
  GeminiMessageHandler: vi.fn(() => ({
    processIncomingMessage: vi.fn(() => ({
      type: 'SETUP_COMPLETE',
      isValid: true,
      payload: {success: true},
      metadata: {id: 'test-id'},
      errors: []
    }))
  }))
}))

vi.mock('../gemini-reconnection-manager', () => ({
  default: vi.fn(() => ({
    onConnectionEstablished: vi.fn(),
    on: vi.fn()
  }))
}))

vi.mock('../websocket-heartbeat-monitor', () => ({
  WebSocketHeartbeatMonitor: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    handleMessage: vi.fn(() => false),
    getStatus: vi.fn(() => 'HEALTHY'),
    on: vi.fn()
  }))
}))

vi.mock('../gemini-logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../log-sanitizer', () => ({
  sanitizeLogMessage: vi.fn(msg => msg),
  safeLogger: {
    log: vi.fn(),
    error: vi.fn()
  }
}))

describe('GeminiLiveWebSocketClient Session Integration', () => {
  let client: GeminiLiveWebSocketClient

  beforeEach(() => {
    vi.clearAllMocks()

    client = new GeminiLiveWebSocketClient({
      apiKey: 'test-api-key',
      model: 'gemini-live-2.5-flash-preview'
    })
  })

  describe('SessionManager Integration', () => {
    it('should initialize session manager during construction', () => {
      expect(SessionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-live-2.5-flash-preview',
          resumptionEnabled: true,
          responseModalities: ['TEXT', 'AUDIO']
        }),
        expect.any(Object) // error handler
      )
    })

    it('should have session manager available', () => {
      expect(client.hasSessionManager()).toBe(true)
    })

    it('should return session ID when available', () => {
      mockSessionManagerInstance.getSessionId.mockReturnValue('test-session-123')

      const sessionId = client.getSessionId()
      expect(sessionId).toBe('test-session-123')
      expect(mockSessionManagerInstance.getSessionId).toHaveBeenCalled()
    })

    it('should return session state when available', () => {
      mockSessionManagerInstance.getSessionState.mockReturnValue('active')

      const state = client.getSessionState()
      expect(state).toBe('active')
      expect(mockSessionManagerInstance.getSessionState).toHaveBeenCalled()
    })

    it('should return session stats when available', () => {
      const mockStats = {
        sessionId: 'test-session-123',
        state: 'active',
        uptime: 30000,
        totalMessages: 5,
        totalTurns: 2,
        lastActivityTime: new Date(),
        errorCount: 0,
        resumptionCount: 0
      }

      mockSessionManagerInstance.getSessionStats.mockReturnValue(mockStats)

      const stats = client.getSessionStats()
      expect(stats).toEqual(mockStats)
      expect(mockSessionManagerInstance.getSessionStats).toHaveBeenCalled()
    })
  })

  describe('Session Operations', () => {
    it('should resume session successfully', async () => {
      mockSessionManagerInstance.resumeSession.mockResolvedValue({success: true})

      const result = await client.resumeSession('old-session-123')

      expect(result).toBe(true)
      expect(mockSessionManagerInstance.resumeSession).toHaveBeenCalledWith('old-session-123')
    })

    it('should handle resume session failure', async () => {
      mockSessionManagerInstance.resumeSession.mockRejectedValue(new Error('Resume failed'))

      const result = await client.resumeSession('invalid-session')

      expect(result).toBe(false)
    })

    it('should terminate session successfully', async () => {
      mockSessionManagerInstance.terminateSession.mockResolvedValue(true)

      const result = await client.terminateSession()

      expect(result).toBe(true)
      expect(mockSessionManagerInstance.terminateSession).toHaveBeenCalled()
    })

    it('should handle terminate session failure', async () => {
      mockSessionManagerInstance.terminateSession.mockRejectedValue(new Error('Terminate failed'))

      const result = await client.terminateSession()

      expect(result).toBe(false)
    })
  })

  describe('Setup Message Integration', () => {
    beforeEach(() => {
      mockSessionManagerInstance.createSession.mockResolvedValue({
        success: true,
        sessionId: 'setup-session-123'
      })

      mockSessionManagerInstance.getSetupMessage.mockReturnValue({
        setup: {
          model: 'models/gemini-live-2.5-flash-preview',
          generationConfig: {
            responseModalities: ['TEXT', 'AUDIO']
          }
        }
      })
    })

    it('should create session and send setup message on connection', async () => {
      // Start connection
      await client.connect()

      // Simulate connection success
      if (mockWebSocketInstance.onopen) {
        await mockWebSocketInstance.onopen({})
      }

      // Verify session creation and setup message
      expect(mockSessionManagerInstance.createSession).toHaveBeenCalled()
      expect(mockSessionManagerInstance.getSetupMessage).toHaveBeenCalled()
      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
        JSON.stringify({
          setup: {
            model: 'models/gemini-live-2.5-flash-preview',
            generationConfig: {
              responseModalities: ['TEXT', 'AUDIO']
            }
          }
        })
      )
    })
  })
})
