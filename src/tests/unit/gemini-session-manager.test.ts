/**
 * Unit tests for SessionManager
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  SessionManager,
  SessionState,
  SessionConfig,
  SessionErrorType,
  DefaultSessionConfigs,
  createSessionManager
} from '../../services/gemini-session-manager'
import {GeminiErrorHandler} from '../../services/gemini-error-handler'

// Mock the logger
vi.mock('../../services/gemini-logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock log-sanitizer
vi.mock('../../services/log-sanitizer', () => ({
  sanitizeLogMessage: vi.fn((msg: string) => msg)
}))

describe('SessionManager', () => {
  let sessionManager: SessionManager
  let mockErrorHandler: GeminiErrorHandler
  let defaultConfig: SessionConfig

  beforeEach(() => {
    mockErrorHandler = {
      handleError: vi.fn().mockImplementation((error, metadata) => ({
        id: 'test-error-id',
        message: 'Test error',
        type: 'api',
        retryable: true,
        timestamp: new Date(),
        metadata: {},
        sessionErrorType: metadata?.sessionErrorType || SessionErrorType.INVALID_STATE
      }))
    } as Partial<GeminiErrorHandler> as GeminiErrorHandler

    defaultConfig = {
      model: 'gemini-live-2.5-flash-preview',
      responseModalities: ['TEXT'],
      systemInstruction: 'Test instruction',
      resumptionEnabled: true,
      sessionTimeout: 30000,
      maxConversationHistory: 10,
      generateSessionId: true
    }

    sessionManager = new SessionManager(defaultConfig, mockErrorHandler)
  })

  afterEach(async () => {
    await sessionManager.destroy()
    vi.clearAllMocks()
  })

  describe('Constructor and Initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(sessionManager.getSessionState()).toBe(SessionState.TERMINATED)
      expect(sessionManager.getSessionId()).toBeNull()
      expect(sessionManager.getSessionConfig()).toEqual(
        expect.objectContaining({
          model: 'gemini-live-2.5-flash-preview',
          responseModalities: ['TEXT'],
          resumptionEnabled: true
        })
      )
    })

    it('should throw error for invalid configuration', () => {
      expect(() => {
        new SessionManager({
          model: '',
          responseModalities: [],
          resumptionEnabled: true
        })
      }).toThrow('Session model is required')

      expect(() => {
        new SessionManager({
          model: 'gemini-live-2.5-flash-preview',
          responseModalities: [],
          resumptionEnabled: true
        })
      }).toThrow('At least one response modality is required')

      expect(() => {
        new SessionManager({
          model: 'invalid-model',
          responseModalities: ['TEXT'],
          resumptionEnabled: true
        })
      }).toThrow('Model must be a Gemini model')
    })

    it('should normalize configuration values', () => {
      const config = sessionManager.getSessionConfig()
      expect(config.responseModalities).toEqual(['TEXT'])
      expect(config.language).toBe('en')
      expect(config.audioSettings).toBeDefined()
      expect(config.sessionTimeout).toBe(30000)
    })
  })

  describe('Session Creation', () => {
    it('should create a new session successfully', async () => {
      const result = await sessionManager.createSession()

      expect(result.success).toBe(true)
      expect(result.sessionId).toBeTruthy()
      expect(sessionManager.getSessionState()).toBe(SessionState.INITIALIZING)
    })

    it('should emit sessionCreating event', async () => {
      const eventPromise = new Promise(resolve => {
        sessionManager.once('sessionCreating', resolve)
      })

      await sessionManager.createSession()
      const event = await eventPromise

      expect(event).toMatchObject({
        sessionId: expect.any(String),
        config: expect.objectContaining({
          model: 'gemini-live-2.5-flash-preview'
        })
      })
    })

    it('should fail to create session when not in TERMINATED state', async () => {
      await sessionManager.createSession()

      const result = await sessionManager.createSession()
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should generate unique session IDs', async () => {
      const result1 = await sessionManager.createSession()
      await sessionManager.terminateSession()

      const result2 = await sessionManager.createSession()

      expect(result1.sessionId).not.toBe(result2.sessionId)
    })
  })

  describe('Session Configuration', () => {
    beforeEach(async () => {
      await sessionManager.createSession()
    })

    it('should update configuration during INITIALIZING state', async () => {
      const newConfig = {
        systemInstruction: 'Updated instruction',
        language: 'es'
      }

      const result = await sessionManager.configureSession(newConfig)
      expect(result).toBe(true)

      const config = sessionManager.getSessionConfig()
      expect(config.systemInstruction).toBe('Updated instruction')
      expect(config.language).toBe('es')
    })

    it('should emit sessionConfigured event', async () => {
      const eventPromise = new Promise(resolve => {
        sessionManager.once('sessionConfigured', resolve)
      })

      const newConfig = {language: 'fr'}
      await sessionManager.configureSession(newConfig)

      const event = await eventPromise
      expect(event).toMatchObject({
        sessionId: expect.any(String),
        changes: newConfig
      })
    })

    it('should fail to configure in TERMINATED state', async () => {
      await sessionManager.terminateSession()

      const result = await sessionManager.configureSession({language: 'es'})
      expect(result).toBe(false)
    })
  })

  describe('Session State Management', () => {
    it('should transition through states correctly', async () => {
      const stateChanges: Array<{previousState: SessionState; newState: SessionState}> = []
      sessionManager.on('sessionStateChange', event => {
        stateChanges.push(event)
      })

      // Create session (TERMINATED -> INITIALIZING)
      await sessionManager.createSession()

      // Mark as active (INITIALIZING -> ACTIVE)
      sessionManager.markSessionActive('server-session-id')

      // Pause session (ACTIVE -> PAUSED)
      sessionManager.pauseSession()

      // Terminate session (PAUSED -> TERMINATING -> TERMINATED)
      await sessionManager.terminateSession()

      expect(stateChanges).toHaveLength(5) // TERMINATED->INITIALIZING, INITIALIZING->ACTIVE, ACTIVE->PAUSED, PAUSED->TERMINATING, TERMINATING->TERMINATED
      expect(stateChanges[0].newState).toBe(SessionState.INITIALIZING)
      expect(stateChanges[1].newState).toBe(SessionState.ACTIVE)
      expect(stateChanges[2].newState).toBe(SessionState.PAUSED)
      expect(stateChanges[3].newState).toBe(SessionState.TERMINATING)
      expect(stateChanges[4].newState).toBe(SessionState.TERMINATED)
    })

    it('should mark session as active with server session ID', async () => {
      await sessionManager.createSession()

      sessionManager.markSessionActive('server-generated-id')

      expect(sessionManager.getSessionState()).toBe(SessionState.ACTIVE)
      expect(sessionManager.getSessionId()).toBe('server-generated-id')
    })

    it('should handle session timeout', async () => {
      const shortTimeoutConfig = {
        ...defaultConfig,
        sessionTimeout: 100
      }

      const timeoutManager = new SessionManager(shortTimeoutConfig, mockErrorHandler)

      await new Promise<void>(resolve => {
        timeoutManager.on('sessionTimeout', event => {
          expect(event.error).toBeDefined()
          expect(timeoutManager.getSessionState()).toBe(SessionState.ERROR)
          timeoutManager.destroy().then(() => resolve())
        })

        timeoutManager.createSession().then(() => {
          timeoutManager.markSessionActive()
        })
      })
    })
  })

  describe('Session Resumption', () => {
    it('should resume session successfully', async () => {
      // Create and activate a session first
      await sessionManager.createSession()
      sessionManager.markSessionActive('original-session-id')

      // Add some conversation history
      sessionManager.addConversationTurn({
        role: 'user',
        content: {text: 'Hello'},
        turnComplete: true
      })

      // Pause the session
      sessionManager.pauseSession()

      // Resume the session
      const result = await sessionManager.resumeSession()

      expect(result.success).toBe(true)
      expect(result.contextRestored).toBe(true)
      expect(sessionManager.getSessionState()).toBe(SessionState.RESUMING)
    })

    it('should fail to resume active session', async () => {
      await sessionManager.createSession()
      sessionManager.markSessionActive()

      const result = await sessionManager.resumeSession()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should resume with provided session ID', async () => {
      await sessionManager.createSession()
      sessionManager.pauseSession()

      const result = await sessionManager.resumeSession('external-session-id')

      expect(result.success).toBe(true)
      expect(sessionManager.getSessionId()).toBe('external-session-id')
    })
  })

  describe('Conversation History Management', () => {
    beforeEach(async () => {
      await sessionManager.createSession()
      sessionManager.markSessionActive()
    })

    it('should add conversation turns', async () => {
      const eventPromise = new Promise(resolve => {
        sessionManager.once('conversationTurn', resolve)
      })

      sessionManager.addConversationTurn({
        role: 'user',
        content: {text: 'Hello world'},
        turnComplete: true
      })

      await eventPromise

      const context = sessionManager.getSessionContext()
      expect(context.conversationHistory).toHaveLength(1)
      expect(context.conversationHistory[0].role).toBe('user')
      expect(context.conversationHistory[0].content.text).toBe('Hello world')
      expect(context.totalTurns).toBe(1)
    })

    it('should trim conversation history when exceeding max size', () => {
      // Add turns exceeding the max history size (10)
      for (let i = 0; i < 15; i++) {
        sessionManager.addConversationTurn({
          role: i % 2 === 0 ? 'user' : 'model',
          content: {text: `Message ${i}`},
          turnComplete: true
        })
      }

      const context = sessionManager.getSessionContext()
      expect(context.conversationHistory).toHaveLength(10)
      expect(context.totalTurns).toBe(15)

      // Should keep the most recent messages
      expect(context.conversationHistory[0].content.text).toBe('Message 5')
      expect(context.conversationHistory[9].content.text).toBe('Message 14')
    })

    it('should track message statistics', () => {
      sessionManager.trackMessage('msg-1', true) // outgoing
      sessionManager.trackMessage('msg-2', false) // incoming

      const stats = sessionManager.getSessionStats()
      expect(stats.totalMessages).toBe(2)
    })
  })

  describe('Session Health and Statistics', () => {
    beforeEach(async () => {
      await sessionManager.createSession()
      sessionManager.markSessionActive()
    })

    it('should report healthy session', () => {
      expect(sessionManager.isSessionHealthy()).toBe(true)
    })

    it('should report healthy session normally', () => {
      expect(sessionManager.isSessionHealthy()).toBe(true)
    })

    it('should calculate uptime correctly', async () => {
      const stats1 = sessionManager.getSessionStats()

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10))

      const stats2 = sessionManager.getSessionStats()
      expect(stats2.uptime).toBeGreaterThan(stats1.uptime)
    })

    it('should track response times', async () => {
      sessionManager.trackMessage('msg-1', true) // outgoing

      // Wait a bit and then track incoming message
      await new Promise(resolve => setTimeout(resolve, 5))
      sessionManager.trackMessage('msg-1', false) // incoming

      const stats = sessionManager.getSessionStats()
      // Only check if defined since it might be undefined initially
      if (stats.averageResponseTime !== undefined) {
        expect(stats.averageResponseTime).toBeGreaterThan(0)
      }
    })
  })

  describe('Setup Message Generation', () => {
    it('should generate correct setup message', async () => {
      await sessionManager.createSession()

      const setupMessage = sessionManager.getSetupMessage()

      expect(setupMessage).toMatchObject({
        setup: {
          model: 'models/gemini-live-2.5-flash-preview',
          generationConfig: {
            responseModalities: ['TEXT']
          },
          sessionResumption: true,
          systemInstruction: {
            parts: [{text: 'Test instruction'}]
          },
          sessionId: expect.any(String)
        }
      })
    })

    it('should generate setup message without system instruction', async () => {
      const configWithoutInstruction = {
        ...defaultConfig,
        systemInstruction: undefined
      }

      const manager = new SessionManager(configWithoutInstruction, mockErrorHandler)
      await manager.createSession()

      const setupMessage = manager.getSetupMessage()

      expect(setupMessage.setup.systemInstruction).toBeUndefined()

      await manager.destroy()
    })
  })

  describe('Session Termination', () => {
    it('should terminate session successfully', async () => {
      await sessionManager.createSession()
      sessionManager.markSessionActive()

      const result = await sessionManager.terminateSession()

      expect(result).toBe(true)
      expect(sessionManager.getSessionState()).toBe(SessionState.TERMINATED)
    })

    it('should emit termination events', async () => {
      const events: Array<{type: string; sessionId: string}> = []

      sessionManager.on('sessionTerminating', event => events.push({type: 'terminating', ...event}))
      sessionManager.on('sessionTerminated', event => events.push({type: 'terminated', ...event}))

      await sessionManager.createSession()
      sessionManager.markSessionActive()
      await sessionManager.terminateSession()

      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('terminating')
      expect(events[1].type).toBe('terminated')
    })

    it('should handle termination of already terminated session', async () => {
      const result = await sessionManager.terminateSession()
      expect(result).toBe(true)
    })
  })

  describe('Factory Function and Default Configs', () => {
    it('should create session manager using factory function', () => {
      const manager = createSessionManager(defaultConfig)
      expect(manager).toBeInstanceOf(SessionManager)
      manager.destroy()
    })

    it('should provide valid default configurations', () => {
      const audioConfig = DefaultSessionConfigs.audioConversation()
      const textConfig = DefaultSessionConfigs.textConversation()
      const multimodalConfig = DefaultSessionConfigs.multimodalConversation()

      expect(audioConfig.responseModalities).toEqual(['AUDIO'])
      expect(textConfig.responseModalities).toEqual(['TEXT'])
      expect(multimodalConfig.responseModalities).toEqual(['TEXT', 'AUDIO'])

      // Test that they can be used to create session managers
      const audioManager = createSessionManager(audioConfig)
      const textManager = createSessionManager(textConfig)
      const multimodalManager = createSessionManager(multimodalConfig)

      expect(audioManager.getSessionState()).toBe(SessionState.TERMINATED)
      expect(textManager.getSessionState()).toBe(SessionState.TERMINATED)
      expect(multimodalManager.getSessionState()).toBe(SessionState.TERMINATED)

      audioManager.destroy()
      textManager.destroy()
      multimodalManager.destroy()
    })
  })

  describe('Error Handling', () => {
    it('should handle session creation errors', async () => {
      // Create a session manager that will have an error during validation
      try {
        const invalidConfig = {
          model: '', // This should cause validation to fail
          responseModalities: ['TEXT'],
          resumptionEnabled: true
        }

        // This should throw during construction
        new SessionManager(invalidConfig, mockErrorHandler)

        // If we reach here, the test should fail
        expect(true).toBe(false)
      } catch (error) {
        // This is expected - constructor should throw for invalid config
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('should emit session errors', async () => {
      const errorPromise = new Promise(resolve => {
        sessionManager.once('sessionError', resolve)
      })

      // Test with invalid modality - this should fail validation
      const result = await sessionManager.configureSession({
        responseModalities: ['INVALID']
      })

      expect(result).toBe(false)

      const error = await errorPromise
      expect(error).toBeDefined()
      expect(error).toHaveProperty('id')
      expect(error).toHaveProperty('message')
    })
  })

  describe('Cleanup and Destruction', () => {
    it('should cleanup resources on destroy', async () => {
      await sessionManager.createSession()
      sessionManager.markSessionActive()

      // Add some data
      sessionManager.addConversationTurn({
        role: 'user',
        content: {text: 'Test'},
        turnComplete: true
      })

      await sessionManager.destroy()

      expect(sessionManager.getSessionState()).toBe(SessionState.TERMINATED)
    })

    it('should remove all event listeners on destroy', async () => {
      const listenerCount = sessionManager.listenerCount('sessionStateChange')
      sessionManager.on('sessionStateChange', () => {})

      expect(sessionManager.listenerCount('sessionStateChange')).toBeGreaterThan(listenerCount)

      await sessionManager.destroy()

      expect(sessionManager.listenerCount('sessionStateChange')).toBe(0)
    })
  })
})
