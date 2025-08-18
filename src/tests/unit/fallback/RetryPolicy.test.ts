/**
 * Unit tests for RetryPolicy class
 *
 * Tests retry mechanisms, exponential backoff, jitter, and error handling
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {RetryPolicy, RetryExhaustedError, RetryPolicies} from '../../../fallback/RetryPolicy'

describe('RetryPolicy', () => {
  let retryPolicy: RetryPolicy

  beforeEach(() => {
    vi.useFakeTimers()
    retryPolicy = new RetryPolicy()
  })

  afterEach(() => {
    vi.restoreAllTimers()
  })

  describe('calculateDelay', () => {
    it('should calculate exponential backoff delays correctly', () => {
      const policy = new RetryPolicy({baseDelayMs: 100, maxDelayMs: 5000})

      // First attempt: 100ms
      const delay1 = policy.calculateDelay(1)
      expect(delay1).toBeGreaterThanOrEqual(90) // With jitter
      expect(delay1).toBeLessThanOrEqual(110)

      // Second attempt: 200ms
      const delay2 = policy.calculateDelay(2)
      expect(delay2).toBeGreaterThanOrEqual(180)
      expect(delay2).toBeLessThanOrEqual(220)

      // Third attempt: 400ms
      const delay3 = policy.calculateDelay(3)
      expect(delay3).toBeGreaterThanOrEqual(360)
      expect(delay3).toBeLessThanOrEqual(440)
    })

    it('should respect maxDelayMs cap', () => {
      const policy = new RetryPolicy({baseDelayMs: 1000, maxDelayMs: 2000})

      const delay = policy.calculateDelay(10) // Would be 1000 * 2^9 = 512000ms without cap
      expect(delay).toBeLessThanOrEqual(2200) // Max delay + jitter tolerance
    })

    it('should add jitter to prevent thundering herd', () => {
      const policy = new RetryPolicy({baseDelayMs: 1000, jitterFactor: 0.2})

      const delays = Array.from({length: 10}, () => policy.calculateDelay(1))
      const uniqueDelays = new Set(delays)

      // Should have different values due to jitter
      expect(uniqueDelays.size).toBeGreaterThan(1)

      // All delays should be within jitter bounds
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(800) // 1000 - 20%
        expect(delay).toBeLessThanOrEqual(1200) // 1000 + 20%
      })
    })

    it('should never return negative delays', () => {
      const policy = new RetryPolicy({baseDelayMs: 10, jitterFactor: 2.0}) // Large jitter

      const delay = policy.calculateDelay(1)
      expect(delay).toBeGreaterThanOrEqual(0)
    })
  })

  describe('shouldRetry', () => {
    it('should not retry after max attempts exceeded', () => {
      const policy = new RetryPolicy({maxAttempts: 3})
      const error = new Error('Test error')

      expect(policy.shouldRetry(error, 1, 1000)).toBe(true)
      expect(policy.shouldRetry(error, 2, 1000)).toBe(true)
      expect(policy.shouldRetry(error, 3, 1000)).toBe(false)
      expect(policy.shouldRetry(error, 4, 1000)).toBe(false)
    })

    it('should not retry after timeout exceeded', () => {
      const policy = new RetryPolicy({timeoutMs: 5000, maxAttempts: 10})
      const error = new Error('Test error')

      expect(policy.shouldRetry(error, 1, 4000)).toBe(true)
      expect(policy.shouldRetry(error, 1, 5000)).toBe(false)
      expect(policy.shouldRetry(error, 1, 6000)).toBe(false)
    })

    it('should only retry retryable errors', () => {
      const retryableErrors = new Set(['NETWORK_ERROR', 'TIMEOUT'])
      const policy = new RetryPolicy({retryableErrors})

      const networkError = new Error('network error')
      networkError.name = 'NETWORK_ERROR'

      const criticalError = new Error('critical error')
      criticalError.name = 'CRITICAL_ERROR'

      expect(policy.shouldRetry(networkError, 1, 1000)).toBe(true)
      expect(policy.shouldRetry(criticalError, 1, 1000)).toBe(false)
    })

    it('should detect error types from error message', () => {
      const policy = new RetryPolicy()

      const networkError = new Error('network connection failed')
      const timeoutError = new Error('operation timeout occurred')
      const websocketError = new Error('websocket connection closed')

      expect(policy.shouldRetry(networkError, 1, 1000)).toBe(true)
      expect(policy.shouldRetry(timeoutError, 1, 1000)).toBe(true)
      expect(policy.shouldRetry(websocketError, 1, 1000)).toBe(true)
    })
  })

  describe('context management', () => {
    it('should create and manage retry contexts', () => {
      const operationId = 'test-operation'

      const context = retryPolicy.createContext(operationId)

      expect(context).toBeDefined()
      expect(context.operationId).toBe(operationId)
      expect(context.attemptNumber).toBe(1)
      expect(context.lastError).toBeNull()
      expect(context.totalElapsedTime).toBe(0)
      expect(context.startTime).toBeGreaterThan(0)

      expect(retryPolicy.getContext(operationId)).toBe(context)
    })

    it('should update context after failed attempts', () => {
      const operationId = 'test-operation'
      const error = new Error('Test error')

      retryPolicy.createContext(operationId)

      // Simulate time passing
      vi.advanceTimersByTime(1000)

      const updatedContext = retryPolicy.updateContext(operationId, error)

      expect(updatedContext).toBeDefined()
      expect(updatedContext!.attemptNumber).toBe(2)
      expect(updatedContext!.lastError).toBe(error)
      expect(updatedContext!.totalElapsedTime).toBeGreaterThan(0)
    })

    it('should clear contexts properly', () => {
      const operationId = 'test-operation'

      retryPolicy.createContext(operationId)
      expect(retryPolicy.getContext(operationId)).toBeDefined()

      retryPolicy.clearContext(operationId)
      expect(retryPolicy.getContext(operationId)).toBeNull()
    })
  })

  describe('execute', () => {
    it('should succeed on first attempt for successful operations', async () => {
      const successfulOperation = vi.fn().mockResolvedValue('success')

      const result = await retryPolicy.execute(successfulOperation)

      expect(result).toBe('success')
      expect(successfulOperation).toHaveBeenCalledTimes(1)
    })

    it('should retry failed operations according to policy', async () => {
      const failingOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success')

      const promise = retryPolicy.execute(failingOperation)

      // Advance timers to allow retries
      vi.runAllTimers()

      const result = await promise

      expect(result).toBe('success')
      expect(failingOperation).toHaveBeenCalledTimes(3)
    })

    it('should throw RetryExhaustedError after max attempts', async () => {
      const alwaysFailingOperation = vi.fn().mockRejectedValue(new Error('network error'))

      const policy = new RetryPolicy({maxAttempts: 2})

      const promise = policy.execute(alwaysFailingOperation)

      // Advance timers to allow retries
      vi.runAllTimers()

      await expect(promise).rejects.toThrow(RetryExhaustedError)
      expect(alwaysFailingOperation).toHaveBeenCalledTimes(2)
    })

    it('should respect timeout limits', async () => {
      const slowFailingOperation = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        throw new Error('network error')
      })

      const policy = new RetryPolicy({timeoutMs: 2000, maxAttempts: 10})

      const promise = policy.execute(slowFailingOperation)

      // Advance timers beyond timeout
      vi.advanceTimersByTime(3000)

      await expect(promise).rejects.toThrow(RetryExhaustedError)
    })

    it('should apply exponential backoff between retries', async () => {
      const timestamps: number[] = []
      const failingOperation = vi.fn().mockImplementation(async () => {
        timestamps.push(Date.now())
        throw new Error('network error')
      })

      const policy = new RetryPolicy({
        baseDelayMs: 100,
        maxAttempts: 3,
        jitterFactor: 0 // No jitter for predictable testing
      })

      const promise = policy.execute(failingOperation)

      vi.runAllTimers()

      await expect(promise).rejects.toThrow(RetryExhaustedError)

      // Check that delays increase exponentially
      expect(timestamps.length).toBe(3)
      const delay1 = timestamps[1] - timestamps[0]
      const delay2 = timestamps[2] - timestamps[1]

      expect(delay1).toBeGreaterThanOrEqual(100)
      expect(delay2).toBeGreaterThanOrEqual(200)
    })
  })

  describe('RetryablePromise', () => {
    it('should execute operation with retry logic', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success')

      const retryablePromise = retryPolicy.createRetryablePromise(operation, 'test-op')

      vi.runAllTimers()

      const result = await retryablePromise.execute()

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should support cancellation', async () => {
      const longRunningOperation = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5000))
        return 'success'
      })

      const retryablePromise = retryPolicy.createRetryablePromise(longRunningOperation, 'test-op')

      // Cancel after 1 second
      setTimeout(() => retryablePromise.cancel(), 1000)

      vi.runAllTimers()

      await expect(retryablePromise.execute()).rejects.toThrow('was cancelled')
    })
  })

  describe('retry statistics', () => {
    it('should track retry statistics correctly', () => {
      retryPolicy.createContext('op-1')
      retryPolicy.createContext('op-2')
      retryPolicy.updateContext('op-1', new Error('error'))

      const stats = retryPolicy.getRetryStatistics()

      expect(stats.activeRetries).toBe(2)
      expect(stats.totalAttempts).toBe(3) // op-1: 2 attempts, op-2: 1 attempt
      expect(stats.operationIds).toEqual(expect.arrayContaining(['op-1', 'op-2']))
    })

    it('should calculate average elapsed time correctly', () => {
      retryPolicy.createContext('op-1')
      vi.advanceTimersByTime(1000)
      retryPolicy.createContext('op-2')
      vi.advanceTimersByTime(500)
      retryPolicy.updateContext('op-1', new Error('error'))
      retryPolicy.updateContext('op-2', new Error('error'))

      const stats = retryPolicy.getRetryStatistics()

      expect(stats.averageElapsedTime).toBeCloseTo(1000, -1) // ~1000ms average
    })
  })

  describe('predefined policies', () => {
    it('should have NETWORK_OPERATIONS policy configured correctly', () => {
      const policy = RetryPolicies.NETWORK_OPERATIONS

      const delay1 = policy.calculateDelay(1)
      const delay2 = policy.calculateDelay(2)

      expect(delay1).toBeGreaterThanOrEqual(200)
      expect(delay1).toBeLessThanOrEqual(300)
      expect(delay2).toBeGreaterThanOrEqual(400)
      expect(delay2).toBeLessThanOrEqual(600)
    })

    it('should have WEBSOCKET_RECONNECTION policy with longer delays', () => {
      const policy = RetryPolicies.WEBSOCKET_RECONNECTION

      const delay1 = policy.calculateDelay(1)

      expect(delay1).toBeGreaterThanOrEqual(400)
      expect(delay1).toBeLessThanOrEqual(600)
    })

    it('should have TRANSCRIPTION_RECOVERY policy with fast retries', () => {
      const policy = RetryPolicies.TRANSCRIPTION_RECOVERY

      const delay1 = policy.calculateDelay(1)

      expect(delay1).toBeGreaterThanOrEqual(80)
      expect(delay1).toBeLessThanOrEqual(120)
    })

    it('should have BATCH_API_CALLS policy with long delays', () => {
      const policy = RetryPolicies.BATCH_API_CALLS

      const delay1 = policy.calculateDelay(1)

      expect(delay1).toBeGreaterThanOrEqual(800)
      expect(delay1).toBeLessThanOrEqual(1200)
    })
  })

  describe('error handling edge cases', () => {
    it('should handle non-Error objects as errors', async () => {
      const operation = vi.fn().mockRejectedValue('string error')

      await expect(retryPolicy.execute(operation)).rejects.toThrow(RetryExhaustedError)
    })

    it('should handle undefined context updates gracefully', () => {
      const result = retryPolicy.updateContext('non-existent', new Error('test'))
      expect(result).toBeNull()
    })

    it('should handle missing error names gracefully', async () => {
      const errorWithoutName = {message: 'network failure'}
      const operation = vi.fn().mockRejectedValue(errorWithoutName)

      // Should still work by detecting error type from message
      const promise = retryPolicy.execute(operation)
      vi.runAllTimers()

      await expect(promise).rejects.toThrow(RetryExhaustedError)
      expect(operation).toHaveBeenCalledTimes(5) // Default max attempts
    })
  })

  describe('timing precision', () => {
    it('should track elapsed time accurately', () => {
      const operationId = 'timing-test'
      const startTime = Date.now()

      retryPolicy.createContext(operationId)

      vi.advanceTimersByTime(2500)

      const updatedContext = retryPolicy.updateContext(operationId, new Error('test'))

      expect(updatedContext!.totalElapsedTime).toBeCloseTo(2500, -1)
      expect(updatedContext!.startTime).toBe(startTime)
    })

    it('should maintain timing consistency across multiple updates', () => {
      const operationId = 'multi-timing-test'

      retryPolicy.createContext(operationId)

      vi.advanceTimersByTime(1000)
      const update1 = retryPolicy.updateContext(operationId, new Error('test'))

      vi.advanceTimersByTime(1500)
      const update2 = retryPolicy.updateContext(operationId, new Error('test'))

      expect(update1!.totalElapsedTime).toBeCloseTo(1000, -1)
      expect(update2!.totalElapsedTime).toBeCloseTo(2500, -1)
      expect(update2!.attemptNumber).toBe(3)
    })
  })
})
