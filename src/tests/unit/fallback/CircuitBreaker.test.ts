/**
 * Unit tests for CircuitBreaker class
 *
 * Tests circuit breaker pattern implementation, state transitions,
 * failure thresholds, recovery mechanisms, and UI integration
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  AdvancedCircuitBreaker,
  CircuitBreakerManager
} from '../../../fallback/CircuitBreaker'

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker

  beforeEach(() => {
    vi.useFakeTimers()
    circuitBreaker = new CircuitBreaker()
  })

  afterEach(() => {
    vi.restoreAllTimers()
  })

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      expect(circuitBreaker.isCallAllowed()).toBe(true)
    })

    it('should have empty metrics initially', () => {
      const metrics = circuitBreaker.getMetrics()

      expect(metrics.totalCalls).toBe(0)
      expect(metrics.successfulCalls).toBe(0)
      expect(metrics.failedCalls).toBe(0)
      expect(metrics.rejectedCalls).toBe(0)
      expect(metrics.consecutiveFailures).toBe(0)
      expect(metrics.consecutiveSuccesses).toBe(0)
    })
  })

  describe('successful operations', () => {
    it('should execute successful operations normally', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      const result = await circuitBreaker.execute(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
    })

    it('should track successful calls in metrics', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      await circuitBreaker.execute(operation)
      await circuitBreaker.execute(operation)

      const metrics = circuitBreaker.getMetrics()
      expect(metrics.totalCalls).toBe(2)
      expect(metrics.successfulCalls).toBe(2)
      expect(metrics.failedCalls).toBe(0)
    })
  })

  describe('failure handling', () => {
    it('should remain CLOSED for failures below threshold', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      // Fail 4 times (below default threshold of 5)
      for (let i = 0; i < 4; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      expect(circuitBreaker.isCallAllowed()).toBe(true)
    })

    it('should open circuit after reaching failure threshold', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      // Fail 5 times (default threshold)
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
      expect(circuitBreaker.isCallAllowed()).toBe(false)
    })

    it('should track failure metrics correctly', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')
      }

      const metrics = circuitBreaker.getMetrics()
      expect(metrics.totalCalls).toBe(3)
      expect(metrics.successfulCalls).toBe(0)
      expect(metrics.failedCalls).toBe(3)
      expect(metrics.consecutiveFailures).toBe(3)
    })
  })

  describe('OPEN state behavior', () => {
    beforeEach(async () => {
      // Force circuit to OPEN state
      const operation = vi.fn().mockRejectedValue(new Error('failure'))
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')
      }
    })

    it('should reject calls immediately when OPEN', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(CircuitBreakerOpenError)

      expect(operation).not.toHaveBeenCalled()
      expect(circuitBreaker.getMetrics().rejectedCalls).toBe(1)
    })

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      // Advance time past recovery timeout (30 seconds default)
      vi.advanceTimersByTime(31000)

      await circuitBreaker.execute(operation)

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN)
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should not allow calls before recovery timeout', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      // Advance time but not past recovery timeout
      vi.advanceTimersByTime(20000)

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(CircuitBreakerOpenError)
      expect(operation).not.toHaveBeenCalled()
    })
  })

  describe('HALF_OPEN state behavior', () => {
    beforeEach(async () => {
      // Force circuit to HALF_OPEN state
      const failOperation = vi.fn().mockRejectedValue(new Error('failure'))
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(failOperation)).rejects.toThrow('failure')
      }
      vi.advanceTimersByTime(31000) // Past recovery timeout
    })

    it('should close circuit after enough successes', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      // Execute 3 successful operations (default success threshold)
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation)
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
    })

    it('should reopen circuit on any failure', async () => {
      const successOperation = vi.fn().mockResolvedValue('success')
      const failOperation = vi.fn().mockRejectedValue(new Error('failure'))

      // One success, then failure
      await circuitBreaker.execute(successOperation)
      await expect(circuitBreaker.execute(failOperation)).rejects.toThrow('failure')

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
    })
  })

  describe('health status', () => {
    it('should provide comprehensive health information', () => {
      const health = circuitBreaker.getHealthStatus()

      expect(health.state).toBe(CircuitBreakerState.CLOSED)
      expect(health.isHealthy).toBe(true)
      expect(health.failureRate).toBe(0)
      expect(health.consecutiveFailures).toBe(0)
      expect(health.nextRetryTime).toBeNull()
    })

    it('should calculate failure rate correctly', async () => {
      const successOperation = vi.fn().mockResolvedValue('success')
      const failOperation = vi.fn().mockRejectedValue(new Error('failure'))

      await circuitBreaker.execute(successOperation)
      await expect(circuitBreaker.execute(failOperation)).rejects.toThrow('failure')

      const health = circuitBreaker.getHealthStatus()
      expect(health.failureRate).toBeCloseTo(0.5) // 1 failure out of 2 calls
    })

    it('should provide next retry time when OPEN', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      // Force circuit open
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')
      }

      const health = circuitBreaker.getHealthStatus()
      expect(health.nextRetryTime).toBeGreaterThan(Date.now())
    })
  })

  describe('manual control', () => {
    it('should allow manual reset', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      // Force circuit open
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)

      circuitBreaker.reset()

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      expect(circuitBreaker.isCallAllowed()).toBe(true)
    })

    it('should allow forcing circuit open', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)

      circuitBreaker.forceOpen()

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
      expect(circuitBreaker.isCallAllowed()).toBe(false)
    })
  })

  describe('configuration', () => {
    it('should use custom failure threshold', async () => {
      const customCircuit = new CircuitBreaker({failureThreshold: 3})
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      // Should open after 3 failures instead of default 5
      for (let i = 0; i < 3; i++) {
        await expect(customCircuit.execute(operation)).rejects.toThrow('failure')
      }

      expect(customCircuit.getState()).toBe(CircuitBreakerState.OPEN)
    })

    it('should use custom recovery timeout', async () => {
      const customCircuit = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeoutMs: 10000 // 10 seconds
      })
      const failOperation = vi.fn().mockRejectedValue(new Error('failure'))
      const successOperation = vi.fn().mockResolvedValue('success')

      // Force circuit open
      for (let i = 0; i < 2; i++) {
        await expect(customCircuit.execute(failOperation)).rejects.toThrow('failure')
      }

      // Should still be closed before timeout
      vi.advanceTimersByTime(9000)
      await expect(customCircuit.execute(successOperation)).rejects.toThrow(CircuitBreakerOpenError)

      // Should allow calls after timeout
      vi.advanceTimersByTime(2000)
      await customCircuit.execute(successOperation)
      expect(customCircuit.getState()).toBe(CircuitBreakerState.HALF_OPEN)
    })

    it('should call degraded mode callback when opening', async () => {
      const degradedCallback = vi.fn()
      const customCircuit = new CircuitBreaker({
        failureThreshold: 2,
        degradedModeCallback
      })
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      for (let i = 0; i < 2; i++) {
        await expect(customCircuit.execute(operation)).rejects.toThrow('failure')
      }

      expect(degradedCallback).toHaveBeenCalledTimes(1)
    })

    it('should call recovered callback when closing', async () => {
      const recoveredCallback = vi.fn()
      const customCircuit = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        recoveredCallback
      })

      const failOperation = vi.fn().mockRejectedValue(new Error('failure'))
      const successOperation = vi.fn().mockResolvedValue('success')

      // Force open
      for (let i = 0; i < 2; i++) {
        await expect(customCircuit.execute(failOperation)).rejects.toThrow('failure')
      }

      // Recover
      vi.advanceTimersByTime(31000)
      for (let i = 0; i < 2; i++) {
        await customCircuit.execute(successOperation)
      }

      expect(recoveredCallback).toHaveBeenCalledTimes(1)
    })
  })
})

describe('AdvancedCircuitBreaker', () => {
  let circuitBreaker: AdvancedCircuitBreaker

  beforeEach(() => {
    vi.useFakeTimers()
    circuitBreaker = new AdvancedCircuitBreaker({
      monitoringWindowMs: 60000 // 1 minute
    })
  })

  afterEach(() => {
    vi.restoreAllTimers()
  })

  describe('error type tracking', () => {
    it('should track different error types', async () => {
      const networkError = new Error('network failed')
      networkError.name = 'NetworkError'

      const timeoutError = new Error('timeout occurred')
      timeoutError.name = 'TimeoutError'

      const networkOp = vi.fn().mockRejectedValue(networkError)
      const timeoutOp = vi.fn().mockRejectedValue(timeoutError)

      await expect(circuitBreaker.execute(networkOp)).rejects.toThrow('network failed')
      await expect(circuitBreaker.execute(networkOp)).rejects.toThrow('network failed')
      await expect(circuitBreaker.execute(timeoutOp)).rejects.toThrow('timeout occurred')

      const errorStats = circuitBreaker.getErrorTypeStats()
      expect(errorStats.get('NetworkError')).toBe(2)
      expect(errorStats.get('TimeoutError')).toBe(1)
    })

    it('should identify significant error types', async () => {
      const networkError = new Error('network failed')
      networkError.name = 'NetworkError'
      const networkOp = vi.fn().mockRejectedValue(networkError)

      // Generate 3 network errors (60% of default 5 threshold)
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(networkOp)).rejects.toThrow('network failed')
      }

      expect(circuitBreaker.isErrorTypeSignificant('NetworkError')).toBe(true)
      expect(circuitBreaker.isErrorTypeSignificant('TimeoutError')).toBe(false)
    })
  })

  describe('windowed failure rate', () => {
    it('should calculate failure rate within monitoring window', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      // Generate some failures
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')
        vi.advanceTimersByTime(10000) // 10 seconds between failures
      }

      const windowedRate = circuitBreaker.getWindowedFailureRate()
      expect(windowedRate).toBeGreaterThan(0)
    })

    it('should exclude old failures outside monitoring window', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'))

      // Generate old failure
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure')

      // Move past monitoring window
      vi.advanceTimersByTime(70000) // 70 seconds > 60 second window

      const windowedRate = circuitBreaker.getWindowedFailureRate()
      expect(windowedRate).toBe(0) // Old failure should be excluded
    })
  })
})

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new CircuitBreakerManager()
  })

  afterEach(() => {
    vi.restoreAllTimers()
  })

  describe('service management', () => {
    it('should create circuit breakers for different services', () => {
      const webSocketCB = manager.getCircuitBreaker('websocket')
      const httpCB = manager.getCircuitBreaker('http')

      expect(webSocketCB).toBeDefined()
      expect(httpCB).toBeDefined()
      expect(webSocketCB).not.toBe(httpCB)
    })

    it('should return same circuit breaker for same service name', () => {
      const cb1 = manager.getCircuitBreaker('websocket')
      const cb2 = manager.getCircuitBreaker('websocket')

      expect(cb1).toBe(cb2)
    })

    it('should execute operations with service-specific circuit breakers', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      const result = await manager.execute('websocket', operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
    })
  })

  describe('system health monitoring', () => {
    it('should track overall system health', async () => {
      const failOperation = vi.fn().mockRejectedValue(new Error('failure'))

      // Force one service to fail
      for (let i = 0; i < 5; i++) {
        await expect(manager.execute('websocket', failOperation)).rejects.toThrow('failure')
      }

      const systemHealth = manager.getSystemHealth()

      expect(systemHealth.totalCircuits).toBe(1)
      expect(systemHealth.openCircuits).toBe(1)
      expect(systemHealth.healthyCircuits).toBe(0)
      expect(systemHealth.isDegraded).toBe(true)
      expect(systemHealth.overallHealth).toBe(0)
    })

    it('should handle multiple services', async () => {
      const successOp = vi.fn().mockResolvedValue('success')
      const failOp = vi.fn().mockRejectedValue(new Error('failure'))

      // One healthy service
      await manager.execute('http', successOp)

      // One failing service
      for (let i = 0; i < 5; i++) {
        await expect(manager.execute('websocket', failOp)).rejects.toThrow('failure')
      }

      const systemHealth = manager.getSystemHealth()

      expect(systemHealth.totalCircuits).toBe(2)
      expect(systemHealth.openCircuits).toBe(1)
      expect(systemHealth.healthyCircuits).toBe(1)
      expect(systemHealth.overallHealth).toBe(0.5)
      expect(systemHealth.isDegraded).toBe(true)
    })

    it('should reset all circuit breakers', async () => {
      const failOperation = vi.fn().mockRejectedValue(new Error('failure'))

      // Force multiple services to fail
      for (let i = 0; i < 5; i++) {
        await expect(manager.execute('websocket', failOperation)).rejects.toThrow('failure')
        await expect(manager.execute('http', failOperation)).rejects.toThrow('failure')
      }

      expect(manager.getSystemHealth().openCircuits).toBe(2)

      manager.resetAll()

      expect(manager.getSystemHealth().openCircuits).toBe(0)
      expect(manager.getSystemHealth().overallHealth).toBe(1)
    })
  })

  describe('status collection', () => {
    it('should collect all circuit breaker statuses', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      await manager.execute('websocket', operation)
      await manager.execute('http', operation)

      const statuses = manager.getAllStatuses()

      expect(statuses.size).toBe(2)
      expect(statuses.has('websocket')).toBe(true)
      expect(statuses.has('http')).toBe(true)

      const wsStatus = statuses.get('websocket')!
      expect(wsStatus.state).toBe(CircuitBreakerState.CLOSED)
      expect(wsStatus.isHealthy).toBe(true)
    })
  })
})
