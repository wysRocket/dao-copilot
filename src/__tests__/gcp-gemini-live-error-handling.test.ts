/**
 * Comprehensive Error Handling Tests for GCP Gemini Live Client
 * Tests circuit breaker, recovery strategies, error classification, and monitoring
 */

import {jest} from '@jest/globals'
import {EventEmitter} from 'events'
import {GCPGeminiLiveClient} from '../services/gcp-gemini-live-client'
import {ErrorType, RecoveryStrategy, CircuitBreakerState} from '../services/gemini-error-handler'

// Mock dependencies
jest.mock('../services/gcp-sdk-manager', () => ({
  gcpSDK: {
    initialize: jest.fn().mockResolvedValue({
      status: {initialized: true},
      authResult: {method: 'api_key'}
    }),
    createLiveSession: jest.fn().mockResolvedValue({
      id: 'test-session-123',
      close: jest.fn()
    })
  }
}))

jest.mock('../services/gemini-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

jest.mock('../services/audio-format-converter', () => ({
  createAudioFormatConverter: jest.fn().mockResolvedValue({
    destroy: jest.fn()
  })
}))

jest.mock('../services/real-time-audio-streaming', () => ({
  createRealTimeAudioStreaming: jest.fn().mockResolvedValue({
    cleanup: jest.fn()
  })
}))

describe('GCP Gemini Live Client - Error Handling', () => {
  let client: GCPGeminiLiveClient

  beforeEach(() => {
    jest.clearAllMocks()
    client = new GCPGeminiLiveClient({
      authentication: {
        apiKey: 'test-api-key'
      },
      errorHandling: {
        enableAutoRecovery: true,
        maxRetries: 3,
        circuitBreaker: {
          failureThreshold: 5,
          timeout: 60000,
          monitoringPeriod: 300000
        }
      }
    })
  })

  afterEach(async () => {
    await client.destroy()
  })

  describe('Circuit Breaker Functionality', () => {
    test('should provide circuit breaker status', () => {
      const status = client.getCircuitBreakerStatus()

      expect(status).toHaveProperty('state')
      expect(status).toHaveProperty('failureCount')
      expect(status).toHaveProperty('successCount')
      expect(status.state).toBe(CircuitBreakerState.CLOSED)
      expect(status.failureCount).toBe(0)
    })

    test('should allow manual circuit breaker reset', () => {
      // Reset circuit breaker
      client.resetCircuitBreaker()

      const status = client.getCircuitBreakerStatus()
      expect(status.state).toBe(CircuitBreakerState.CLOSED)
      expect(status.failureCount).toBe(0)
    })

    test('should emit circuit breaker state change events', done => {
      client.on('circuit-breaker:state-change', status => {
        expect(status).toHaveProperty('state')
        expect(status).toHaveProperty('failureCount')
        done()
      })

      // Simulate circuit breaker state change by triggering multiple errors
      // This would normally happen through the error handler's circuit breaker logic
      const errorHandler = (client as any).errorHandler
      for (let i = 0; i < 6; i++) {
        errorHandler.recordFailure()
      }
    })
  })

  describe('Error Statistics and Monitoring', () => {
    test('should provide comprehensive error statistics', () => {
      const stats = client.getErrorStats()

      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('byType')
      expect(stats).toHaveProperty('retryable')
      expect(stats).toHaveProperty('nonRetryable')
      expect(stats).toHaveProperty('recovered')
      expect(stats.total).toBe(0)
    })

    test('should track recent errors', async () => {
      // Simulate an error
      const testError = new Error('Test network error')
      client.emit('error', testError)

      // Wait for error processing
      await new Promise(resolve => setTimeout(resolve, 10))

      const recentErrors = client.getRecentErrors(10)
      expect(Array.isArray(recentErrors)).toBe(true)
    })

    test('should provide error handling statistics', () => {
      const stats = client.getErrorHandlingStats()

      expect(stats).toHaveProperty('totalErrors')
      expect(stats).toHaveProperty('errorsByType')
      expect(stats).toHaveProperty('circuitBreaker')
      expect(stats).toHaveProperty('recovery')
      expect(stats).toHaveProperty('clientMetrics')
    })
  })

  describe('Recovery Management', () => {
    test('should track active recovery processes', () => {
      const activeRecoveries = client.getActiveRecoveries()
      expect(Array.isArray(activeRecoveries)).toBe(true)
      expect(activeRecoveries.length).toBe(0)
    })

    test('should allow canceling all recovery processes', () => {
      const cancelledCount = client.cancelAllRecoveries()
      expect(typeof cancelledCount).toBe('number')
      expect(cancelledCount).toBeGreaterThanOrEqual(0)
    })

    test('should allow configuring error recovery strategies', () => {
      expect(() => {
        client.configureErrorRecovery(ErrorType.NETWORK, RecoveryStrategy.EXPONENTIAL_BACKOFF, {
          maxAttempts: 5,
          baseDelay: 2000,
          maxDelay: 60000,
          backoffMultiplier: 2
        })
      }).not.toThrow()
    })
  })

  describe('Configuration Management', () => {
    test('should allow enabling/disabling auto recovery', () => {
      expect(() => {
        client.setAutoRecoveryEnabled(false)
      }).not.toThrow()

      expect(() => {
        client.setAutoRecoveryEnabled(true)
      }).not.toThrow()
    })

    test('should allow setting max retries', () => {
      expect(() => {
        client.setMaxRetries(5)
      }).not.toThrow()
    })
  })

  describe('Error Data Export', () => {
    test('should export error logs as JSON', () => {
      const errorLogs = client.exportErrorLogs()
      expect(typeof errorLogs).toBe('string')
      expect(() => JSON.parse(errorLogs)).not.toThrow()
    })

    test('should export all logs as JSON', () => {
      const allLogs = client.exportAllLogs()
      expect(typeof allLogs).toBe('string')
      expect(() => JSON.parse(allLogs)).not.toThrow()
    })

    test('should clear error history', () => {
      expect(() => {
        client.clearErrorHistory()
      }).not.toThrow()

      const stats = client.getErrorStats()
      expect(stats.total).toBe(0)
    })
  })

  describe('Error Classification and Handling', () => {
    test('should handle initialization errors with recovery', async () => {
      const mockSdkManager = (client as any).sdkManager
      mockSdkManager.initialize.mockRejectedValueOnce(new Error('Network timeout'))

      const errorHandler = jest.fn()
      client.on('error', errorHandler)

      await expect(client.initialize()).rejects.toThrow()
      expect(errorHandler).toHaveBeenCalled()
    })

    test('should handle connection errors with circuit breaker', async () => {
      // Mock SDK to be initialized
      const mockSdkManager = (client as any).sdkManager
      mockSdkManager.initialize.mockResolvedValueOnce({
        status: {initialized: true},
        authResult: {method: 'api_key'}
      })

      // Initialize first
      await client.initialize()

      // Mock connection failure
      mockSdkManager.createLiveSession.mockRejectedValueOnce(new Error('Connection refused'))

      const errorHandler = jest.fn()
      client.on('error', errorHandler)

      await expect(client.connect()).rejects.toThrow()
      expect(errorHandler).toHaveBeenCalled()
    })

    test('should emit recovery events', done => {
      let eventsReceived = 0
      const expectedEvents = ['recovery:attempt', 'recovery:success', 'recovery:failed']

      expectedEvents.forEach(eventName => {
        client.on(eventName, () => {
          eventsReceived++
          if (eventsReceived === expectedEvents.length) {
            done()
          }
        })
      })

      // Simulate recovery events through the error handler
      const errorHandler = (client as any).errorHandler
      errorHandler.emit('recovery:attempt', {recovery: {errorId: 'test'}, attempt: 1})
      errorHandler.emit('recovery:success', {error: {id: 'test'}, recovery: {strategy: 'test'}})
      errorHandler.emit('recovery:failed', {error: {id: 'test'}, recovery: {strategy: 'test'}})
    })
  })

  describe('Error-Specific Event Handling', () => {
    test('should emit specific error type events', done => {
      client.on('error:network', geminiError => {
        expect(geminiError).toHaveProperty('type', ErrorType.NETWORK)
        expect(geminiError).toHaveProperty('message')
        done()
      })

      // Simulate a network error through the error handler
      const errorHandler = (client as any).errorHandler
      const networkError = {
        id: 'test-error-1',
        type: ErrorType.NETWORK,
        message: 'Network connection failed',
        timestamp: Date.now(),
        retryable: true
      }
      errorHandler.emit('error', networkError)
    })

    test('should handle unrecoverable errors', done => {
      client.on('error:unrecoverable', geminiError => {
        expect(geminiError).toHaveProperty('retryable', false)
        done()
      })

      // Simulate an unrecoverable error
      const testError = new Error('Authentication failed')
      client.emit('error', testError)
    })
  })

  describe('Connection Timeout and Circuit Breaker Integration', () => {
    test('should prevent operations when circuit breaker is open', async () => {
      // Force circuit breaker to open state
      const errorHandler = (client as any).errorHandler
      for (let i = 0; i < 6; i++) {
        errorHandler.recordFailure()
      }

      // Attempt to connect - should fail due to circuit breaker
      await expect(client.connect()).rejects.toThrow('circuit breaker is open')
    })

    test('should handle timeout errors appropriately', async () => {
      const mockSdkManager = (client as any).sdkManager

      // Mock SDK initialization to succeed
      mockSdkManager.initialize.mockResolvedValueOnce({
        status: {initialized: true},
        authResult: {method: 'api_key'}
      })

      await client.initialize()

      // Mock a long-running connection that times out
      mockSdkManager.createLiveSession.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 100)
        })
      })

      const errorHandler = jest.fn()
      client.on('error', errorHandler)

      await expect(client.connect()).rejects.toThrow()
      expect(errorHandler).toHaveBeenCalled()
    })
  })

  describe('Cleanup and Resource Management', () => {
    test('should properly clean up error handler on destroy', async () => {
      const errorHandler = (client as any).errorHandler
      const destroySpy = jest.spyOn(errorHandler, 'destroy')
      const cancelRecoveriesSpy = jest.spyOn(errorHandler, 'cancelAllRecoveries')

      await client.destroy()

      expect(cancelRecoveriesSpy).toHaveBeenCalled()
      expect(destroySpy).toHaveBeenCalled()
    })

    test('should handle destroy errors gracefully', async () => {
      const errorHandler = (client as any).errorHandler
      errorHandler.destroy.mockImplementationOnce(() => {
        throw new Error('Cleanup error')
      })

      // Should not throw even if error handler cleanup fails
      await expect(client.destroy()).resolves.not.toThrow()
    })
  })
})
