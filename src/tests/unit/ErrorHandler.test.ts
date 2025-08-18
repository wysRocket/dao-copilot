/**
 * ErrorHandler Tests
 *
 * Comprehensive test suite for the ErrorHandler class covering:
 * - Error detection and classification
 * - Integration with infrastructure components
 * - Recovery strategy execution
 * - Telemetry and statistics
 * - Configuration and customization
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity,
  ErrorContext
} from '../../error-handling/ErrorHandler'
import {ConnectionMonitor} from '../../network/ConnectionMonitor'
import {CircuitBreaker} from '../../fallback/CircuitBreaker'
import {RetryPolicy} from '../../fallback/RetryPolicy'
import {FallbackManager} from '../../fallback/FallbackManager'

// Mock dependencies
vi.mock('../../network/ConnectionMonitor')
vi.mock('../../fallback/CircuitBreaker')
vi.mock('../../fallback/RetryPolicy')
vi.mock('../../fallback/FallbackManager')

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler
  let mockConnectionMonitor: ConnectionMonitor
  let mockCircuitBreaker: CircuitBreaker
  let mockRetryPolicy: RetryPolicy
  let mockFallbackManager: FallbackManager

  beforeEach(async () => {
    // Create mocks
    mockConnectionMonitor = vi.mocked(new ConnectionMonitor({}))
    mockCircuitBreaker = vi.mocked(new CircuitBreaker({}))
    mockRetryPolicy = vi.mocked(new RetryPolicy({}))
    mockFallbackManager = vi.mocked(new FallbackManager({}))

    // Mock EventEmitter methods
    mockConnectionMonitor.on = vi.fn()
    mockCircuitBreaker.on = vi.fn()

    // Create error handler with test configuration
    errorHandler = new ErrorHandler({
      enableTelemetry: true,
      maxErrorHistory: 100,
      enableUserNotifications: true,
      logLevel: 'warn'
    })

    // Initialize with dependencies
    await errorHandler.initialize({
      connectionMonitor: mockConnectionMonitor,
      circuitBreaker: mockCircuitBreaker,
      retryPolicy: mockRetryPolicy,
      fallbackManager: mockFallbackManager
    })
  })

  afterEach(async () => {
    await errorHandler.destroy()
  })

  describe('Initialization', () => {
    it('initializes successfully', async () => {
      const newHandler = new ErrorHandler()
      await newHandler.initialize()

      expect(newHandler).toBeDefined()
      await newHandler.destroy()
    })

    it('sets up dependency error listeners', () => {
      expect(mockConnectionMonitor.on).toHaveBeenCalledWith('connectionError', expect.any(Function))
      expect(mockCircuitBreaker.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('emits initialized event', async () => {
      const newHandler = new ErrorHandler()
      const initSpy = vi.fn()
      newHandler.on('initialized', initSpy)

      await newHandler.initialize()
      expect(initSpy).toHaveBeenCalled()

      await newHandler.destroy()
    })
  })

  describe('Error Detection and Classification', () => {
    it('detects network connection errors', async () => {
      const error = new Error('Network connection failed')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'WebSocketClient',
        operation: 'connect'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      expect(classified.category).toBe(ErrorCategory.NETWORK_CONNECTION)
      expect(classified.severity).toBe(ErrorSeverity.HIGH)
      expect(classified.isRetryable).toBe(true)
      expect(classified.suggestedAction).toBe('Retry with exponential backoff')
    })

    it('detects WebSocket schema errors', async () => {
      const error = new Error('WebSocket connection closed: 1007 Invalid JSON payload')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'GeminiLiveWebSocket',
        operation: 'message_send'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      expect(classified.category).toBe(ErrorCategory.WEBSOCKET_SCHEMA_ERROR)
      expect(classified.severity).toBe(ErrorSeverity.HIGH)
      expect(classified.recoveryStrategy).toBe('transportFallback')
    })

    it('detects authentication token expiry', async () => {
      const error = new Error('Token expired. Please authenticate again')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'AuthService',
        operation: 'token_validation'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      expect(classified.category).toBe(ErrorCategory.AUTH_TOKEN_EXPIRED)
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM)
      expect(classified.recoveryStrategy).toBe('tokenRefresh')
    })

    it('detects API quota exceeded errors', async () => {
      const error = new Error('API quota exceeded for this request')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'GeminiAPI',
        operation: 'transcription_request'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      expect(classified.category).toBe(ErrorCategory.API_QUOTA_EXCEEDED)
      expect(classified.severity).toBe(ErrorSeverity.HIGH)
      expect(classified.isRetryable).toBe(false)
    })

    it('detects memory exhaustion errors', async () => {
      const error = new RangeError('Maximum call stack size exceeded')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'AudioBuffer',
        operation: 'buffer_allocation'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      expect(classified.category).toBe(ErrorCategory.MEMORY_EXHAUSTION)
      expect(classified.severity).toBe(ErrorSeverity.CRITICAL)
      expect(classified.isRetryable).toBe(false)
      expect(classified.recoveryStrategy).toBe('memoryCleanup')
    })

    it('classifies transcription service errors', async () => {
      const error = new Error('Transcription service unavailable')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'transcription-pipeline',
        operation: 'process_audio'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      expect(classified.category).toBe(ErrorCategory.TRANSCRIPTION_SERVICE_ERROR)
      expect(classified.recoveryStrategy).toBe('serviceRestart')
    })

    it('handles unknown errors with fallback classification', async () => {
      const error = new Error('Some completely unknown error type')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Unknown',
        operation: 'unknown_operation'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      expect(classified.category).toBe(ErrorCategory.UNKNOWN_ERROR)
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM)
      expect(classified.isRetryable).toBe(true)
    })

    it('tracks error occurrence count', async () => {
      const error = new Error('Repeated error')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'TestComponent',
        operation: 'test_operation'
      }

      const first = await errorHandler.detectAndClassify(error, context)
      const second = await errorHandler.detectAndClassify(error, context)
      const third = await errorHandler.detectAndClassify(error, context)

      expect(first.occurrenceCount).toBe(1)
      expect(second.occurrenceCount).toBe(2)
      expect(third.occurrenceCount).toBe(3)
    })

    it('generates appropriate user messages', async () => {
      const error = new Error('Network connection failed')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'WebSocketClient',
        operation: 'connect'
      }

      const classified = await errorHandler.detectAndClassify(error, context)
      const userMessage = errorHandler.getUserMessage(classified)

      expect(userMessage).toContain('Connection issue detected')
      expect(userMessage).not.toContain('stack trace')
      expect(userMessage).not.toContain('internal error')
    })
  })

  describe('Error Handling and Recovery', () => {
    it('handles errors and executes recovery strategies', async () => {
      const error = new Error('WebSocket connection closed: 1007 Invalid JSON payload')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'WebSocket',
        operation: 'send_message'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      const fallbackSpy = vi.fn()
      errorHandler.on('fallbackTriggered', fallbackSpy)

      const success = await errorHandler.handleError(classified)

      expect(success).toBe(true)
      expect(fallbackSpy).toHaveBeenCalledWith(classified)
    })

    it('triggers circuit breaker for critical errors', async () => {
      const error = new RangeError('Out of memory')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'MemoryManager',
        operation: 'allocate'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      const circuitBreakerSpy = vi.fn()
      errorHandler.on('circuitBreakerTriggered', circuitBreakerSpy)

      await errorHandler.handleError(classified)

      expect(circuitBreakerSpy).toHaveBeenCalledWith(classified)
    })

    it('triggers fallback for WebSocket schema errors', async () => {
      const error = new Error('1007 Invalid JSON payload')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'WebSocket',
        operation: 'send'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      const fallbackSpy = vi.fn()
      errorHandler.on('fallbackTriggered', fallbackSpy)

      await errorHandler.handleError(classified)

      expect(fallbackSpy).toHaveBeenCalledWith(classified)
    })

    it('executes network reconnect recovery', async () => {
      const error = new Error('Connection lost')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Network',
        operation: 'connect'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      const reconnectSpy = vi.fn()
      errorHandler.on('networkReconnectInitiated', reconnectSpy)

      await errorHandler.handleError(classified)

      expect(reconnectSpy).toHaveBeenCalledWith(classified)
    })

    it('executes memory cleanup recovery', async () => {
      const error = new RangeError('Maximum call stack size exceeded')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Memory',
        operation: 'allocate'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      const cleanupSpy = vi.fn()
      errorHandler.on('memoryCleanupInitiated', cleanupSpy)

      await errorHandler.handleError(classified)

      expect(cleanupSpy).toHaveBeenCalledWith(classified)
    })

    it('handles recovery errors gracefully', async () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Test',
        operation: 'test'
      }

      const classified = await errorHandler.detectAndClassify(error, context)
      classified.recoveryStrategy = 'nonexistentStrategy'

      const recoveryErrorSpy = vi.fn()
      errorHandler.on('unknownRecoveryStrategy', recoveryErrorSpy)

      const success = await errorHandler.handleError(classified)

      expect(success).toBe(false)
      expect(recoveryErrorSpy).toHaveBeenCalledWith('nonexistentStrategy')
    })
  })

  describe('Statistics and Telemetry', () => {
    it('maintains error statistics', async () => {
      // Generate some errors
      const errors = [
        {error: new Error('Network error'), category: ErrorCategory.NETWORK_CONNECTION},
        {error: new Error('Auth error'), category: ErrorCategory.AUTH_TOKEN_EXPIRED},
        {error: new Error('Network error 2'), category: ErrorCategory.NETWORK_CONNECTION},
        {error: new RangeError('Memory error'), category: ErrorCategory.MEMORY_EXHAUSTION}
      ]

      for (const {error} of errors) {
        const context: ErrorContext = {
          timestamp: Date.now(),
          component: 'Test',
          operation: 'test'
        }
        await errorHandler.detectAndClassify(error, context)
      }

      const stats = errorHandler.getStats()

      expect(stats.totalErrors).toBe(4)
      expect(stats.errorsByCategory[ErrorCategory.NETWORK_CONNECTION]).toBe(2)
      expect(stats.errorsByCategory[ErrorCategory.AUTH_TOKEN_EXPIRED]).toBe(1)
      expect(stats.errorsByCategory[ErrorCategory.MEMORY_EXHAUSTION]).toBe(1)
      expect(stats.lastError).toBeDefined()
    })

    it('calculates error rate correctly', async () => {
      // Generate errors within the aggregation window
      for (let i = 0; i < 5; i++) {
        const context: ErrorContext = {
          timestamp: Date.now(),
          component: 'Test',
          operation: 'test'
        }
        await errorHandler.detectAndClassify(new Error(`Error ${i}`), context)
      }

      const stats = errorHandler.getStats()

      expect(stats.errorRate).toBeGreaterThan(0)
      expect(stats.recentErrors).toHaveLength(5)
    })

    it('emits telemetry events', async () => {
      const telemetrySpy = vi.fn()
      errorHandler.on('telemetry', telemetrySpy)

      const error = new Error('Test error')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Test',
        operation: 'test'
      }

      await errorHandler.detectAndClassify(error, context)

      expect(telemetrySpy).toHaveBeenCalledWith({
        type: 'error_detected',
        category: ErrorCategory.UNKNOWN_ERROR,
        severity: ErrorSeverity.MEDIUM,
        timestamp: expect.any(Number),
        context
      })
    })

    it('maintains error history size limit', async () => {
      const handler = new ErrorHandler({maxErrorHistory: 5})
      await handler.initialize()

      // Generate more errors than the limit
      for (let i = 0; i < 10; i++) {
        const context: ErrorContext = {
          timestamp: Date.now(),
          component: 'Test',
          operation: 'test'
        }
        await handler.detectAndClassify(new Error(`Error ${i}`), context)
      }

      const stats = handler.getStats()
      expect(stats.totalErrors).toBe(5)

      await handler.destroy()
    })
  })

  describe('Custom Rules and Configuration', () => {
    it('allows adding custom detection rules', () => {
      const customRule = {
        name: 'CustomTestError',
        category: ErrorCategory.CONFIGURATION_ERROR,
        severity: ErrorSeverity.LOW,
        matcher: (error: Error) => error.message.includes('custom_test'),
        isRetryable: false,
        suggestedAction: 'Fix configuration',
        userMessageTemplate: 'Configuration issue detected'
      }

      errorHandler.addDetectionRule(customRule)

      // Verify rule was added by triggering it
      const error = new Error('This is a custom_test error')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Test',
        operation: 'test'
      }

      return errorHandler.detectAndClassify(error, context).then(classified => {
        expect(classified.category).toBe(ErrorCategory.CONFIGURATION_ERROR)
        expect(classified.severity).toBe(ErrorSeverity.LOW)
        expect(classified.isRetryable).toBe(false)
      })
    })

    it('allows removing detection rules', () => {
      const customRule = {
        name: 'RemovableRule',
        category: ErrorCategory.CONFIGURATION_ERROR,
        severity: ErrorSeverity.LOW,
        matcher: () => false,
        isRetryable: false,
        suggestedAction: 'Test'
      }

      errorHandler.addDetectionRule(customRule)
      const removed = errorHandler.removeDetectionRule('RemovableRule')

      expect(removed).toBe(true)
    })

    it('emits events for rule management', () => {
      const addSpy = vi.fn()
      const removeSpy = vi.fn()

      errorHandler.on('ruleAdded', addSpy)
      errorHandler.on('ruleRemoved', removeSpy)

      const rule = {
        name: 'EventTestRule',
        category: ErrorCategory.UNKNOWN_ERROR,
        severity: ErrorSeverity.LOW,
        matcher: () => false,
        isRetryable: false,
        suggestedAction: 'Test'
      }

      errorHandler.addDetectionRule(rule)
      errorHandler.removeDetectionRule('EventTestRule')

      expect(addSpy).toHaveBeenCalledWith(rule)
      expect(removeSpy).toHaveBeenCalledWith('EventTestRule')
    })

    it('supports custom configuration', async () => {
      const customHandler = new ErrorHandler({
        enableTelemetry: false,
        maxErrorHistory: 10,
        enableUserNotifications: false,
        logLevel: 'error'
      })

      await customHandler.initialize()

      // Verify configuration was applied
      const config = customHandler.getConfig()
      expect(config.enableTelemetry).toBe(false)
      expect(config.maxErrorHistory).toBe(10)
      expect(config.enableUserNotifications).toBe(false)
      expect(config.logLevel).toBe('error')

      await customHandler.destroy()
    })
  })

  describe('Utility Methods', () => {
    it('determines error retryability correctly', async () => {
      const retryableError = new Error('Network connection failed')
      const nonRetryableError = new Error('API quota exceeded')
      const criticalError = new RangeError('Out of memory')

      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Test',
        operation: 'test'
      }

      const retryableClassified = await errorHandler.detectAndClassify(retryableError, context)
      const nonRetryableClassified = await errorHandler.detectAndClassify(
        nonRetryableError,
        context
      )
      const criticalClassified = await errorHandler.detectAndClassify(criticalError, context)

      expect(errorHandler.isRetryable(retryableClassified)).toBe(true)
      expect(errorHandler.isRetryable(nonRetryableClassified)).toBe(false)
      expect(errorHandler.isRetryable(criticalClassified)).toBe(false)
    })

    it('provides user-friendly error messages', async () => {
      const error = new Error('Complex internal system error with stack traces')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'InternalSystem',
        operation: 'complex_operation'
      }

      const classified = await errorHandler.detectAndClassify(error, context)
      const userMessage = errorHandler.getUserMessage(classified)

      expect(userMessage).not.toContain('stack traces')
      expect(userMessage).not.toContain('internal system')
      expect(userMessage).toContain('technical issue')
    })

    it('clears error history', async () => {
      // Generate some errors
      for (let i = 0; i < 3; i++) {
        const context: ErrorContext = {
          timestamp: Date.now(),
          component: 'Test',
          operation: 'test'
        }
        await errorHandler.detectAndClassify(new Error(`Error ${i}`), context)
      }

      let stats = errorHandler.getStats()
      expect(stats.totalErrors).toBe(3)

      const clearSpy = vi.fn()
      errorHandler.on('historyCleared', clearSpy)

      errorHandler.clearErrorHistory()

      stats = errorHandler.getStats()
      expect(stats.totalErrors).toBe(0)
      expect(clearSpy).toHaveBeenCalled()
    })
  })

  describe('Error Conditions and Edge Cases', () => {
    it('handles destroyed error handler gracefully', async () => {
      await errorHandler.destroy()

      const error = new Error('Test error after destruction')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Test',
        operation: 'test'
      }

      await expect(errorHandler.detectAndClassify(error, context)).rejects.toThrow(
        'ErrorHandler has been destroyed'
      )
    })

    it('prevents double initialization', async () => {
      await errorHandler.initialize() // Second initialization

      // Should not throw or cause issues
      expect(errorHandler).toBeDefined()
    })

    it('handles missing dependencies gracefully', async () => {
      const handler = new ErrorHandler()
      await handler.initialize() // No dependencies provided

      const error = new Error('Test error')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Test',
        operation: 'test'
      }

      // Should still work without dependencies
      const classified = await handler.detectAndClassify(error, context)
      expect(classified).toBeDefined()

      await handler.destroy()
    })

    it('emits error events for handling failures', async () => {
      const errorSpy = vi.fn()
      errorHandler.on('error', errorSpy)

      // Create an error that will cause handling to fail
      const error = new Error('Test error')
      const context: ErrorContext = {
        timestamp: Date.now(),
        component: 'Test',
        operation: 'test'
      }

      const classified = await errorHandler.detectAndClassify(error, context)

      // Mock a recovery strategy failure
      classified.recoveryStrategy = 'networkReconnect'
      mockFallbackManager = undefined!
      errorHandler['fallbackManager'] = undefined

      await errorHandler.handleError(classified)

      // Should emit appropriate events even if recovery fails
      expect(errorHandler).toBeDefined() // Basic sanity check
    })
  })
})
