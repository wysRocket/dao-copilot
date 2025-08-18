/**
 * Unit tests for ConnectionMonitor
 * Tests WebSocket interruption detection under various failure scenarios
 */

import {describe, it, expect, beforeEach, afterEach, vi, Mock} from 'vitest'
import {EventEmitter} from 'events'
import ConnectionMonitor from '../../network/ConnectionMonitor'

// Mock WebSocket with proper typing
class MockWebSocket extends EventEmitter implements Partial<WebSocket> {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState: number = MockWebSocket.CLOSED
  url: string = 'wss://test.com'

  constructor() {
    super()
  }

  send = vi.fn()
  close = vi.fn()

  // Simulate connection opening
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.emit('open')
  }

  // Simulate connection closing
  simulateClose(code = 1000, reason = 'Normal closure') {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', {code, reason, wasClean: code === 1000})
  }

  // Simulate connection error
  simulateError(error?: Error) {
    this.emit('error', error || new Error('Connection error'))
  }

  // Simulate incoming message
  simulateMessage(data: unknown) {
    this.emit('message', {data: typeof data === 'string' ? data : JSON.stringify(data)})
  }

  // Simulate pong response
  simulatePong(pingId: string) {
    this.simulateMessage({pong: pingId})
  }

  // Add other required WebSocket properties/methods as stubs
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  dispatchEvent = vi.fn()
}

describe('ConnectionMonitor', () => {
  let monitor: ConnectionMonitor
  let mockWebSocket: MockWebSocket

  beforeEach(() => {
    vi.useFakeTimers()
    monitor = new ConnectionMonitor({
      heartbeatInterval: 1000,
      timeoutThreshold: 2000,
      silentFailureThreshold: 5000,
      qualityCheckInterval: 500,
      enableMetricsCollection: true
    })
    mockWebSocket = new MockWebSocket()
  })

  afterEach(() => {
    monitor.stopMonitoring()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultMonitor = new ConnectionMonitor()
      expect(defaultMonitor.isConnected()).toBe(false)
      expect(defaultMonitor.isHealthy()).toBe(false)
      expect(defaultMonitor.getQuality()).toBe(0)
    })

    it('should accept custom configuration', () => {
      const customMonitor = new ConnectionMonitor({
        heartbeatInterval: 5000,
        timeoutThreshold: 10000
      })

      expect(customMonitor).toBeDefined()
    })

    it('should initialize metrics to zero', () => {
      const metrics = monitor.getMetrics()
      expect(metrics.connectionQuality).toBe(0)
      expect(metrics.averageLatency).toBe(0)
      expect(metrics.interruptionCount).toBe(0)
      expect(metrics.lastInterruption).toBeNull()
    })
  })

  describe('Connection Monitoring', () => {
    it('should start monitoring WebSocket connection', () => {
      const monitoringStartedSpy = vi.fn()
      monitor.on('monitoring_started', monitoringStartedSpy)

      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)

      expect(monitoringStartedSpy).toHaveBeenCalled()
    })

    it('should detect connection establishment', () => {
      const connectionEstablishedSpy = vi.fn()
      monitor.on('connection_established', connectionEstablishedSpy)

      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()

      expect(connectionEstablishedSpy).toHaveBeenCalled()
      expect(monitor.isConnected()).toBe(true)
      expect(monitor.isHealthy()).toBe(true)
    })

    it('should stop monitoring and clean up timers', () => {
      const monitoringStoppedSpy = vi.fn()
      monitor.on('monitoring_stopped', monitoringStoppedSpy)

      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      monitor.stopMonitoring()

      expect(monitoringStoppedSpy).toHaveBeenCalled()
    })

    it('should handle multiple start/stop cycles', () => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      monitor.stopMonitoring()
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      monitor.stopMonitoring()

      // Should not throw or cause issues
      expect(monitor.isConnected()).toBe(false)
    })
  })

  describe('Interruption Detection', () => {
    beforeEach(() => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()
    })

    it('should detect connection close interruption', () => {
      const interruptionSpy = vi.fn()
      monitor.on('connection_interrupted', interruptionSpy)

      mockWebSocket.simulateClose(1006, 'Abnormal closure')

      expect(interruptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'disconnect',
          reason: 'Abnormal closure',
          errorCode: 1006,
          canRecover: true
        })
      )
      expect(monitor.isConnected()).toBe(false)
    })

    it('should detect connection error interruption', () => {
      const interruptionSpy = vi.fn()
      monitor.on('connection_interrupted', interruptionSpy)

      mockWebSocket.simulateError(new Error('Connection failed'))

      expect(interruptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          reason: 'WebSocket error occurred',
          canRecover: true
        })
      )
      expect(monitor.isHealthy()).toBe(false)
    })

    it('should detect silent failure', () => {
      const interruptionSpy = vi.fn()
      monitor.on('connection_interrupted', interruptionSpy)

      // Fast forward time to trigger silent failure detection
      vi.advanceTimersByTime(6000) // Beyond silentFailureThreshold

      expect(interruptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'silent_failure',
          reason: 'No activity detected within threshold'
        })
      )
    })

    it('should emit recovery_needed for recoverable errors', () => {
      const recoverySpy = vi.fn()
      monitor.on('recovery_needed', recoverySpy)

      mockWebSocket.simulateClose(1006) // Recoverable

      expect(recoverySpy).toHaveBeenCalled()
    })
  })

  describe('Heartbeat Mechanism', () => {
    beforeEach(() => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()
    })

    it('should send ping messages at configured intervals', () => {
      vi.advanceTimersByTime(1000) // heartbeatInterval

      expect(mockWebSocket.send).toHaveBeenCalledWith(expect.stringContaining('"ping"'))
    })

    it('should handle pong responses and calculate latency', () => {
      const heartbeatSuccessSpy = vi.fn()
      monitor.on('heartbeat_success', heartbeatSuccessSpy)

      // Trigger ping
      vi.advanceTimersByTime(1000)

      // Extract ping ID from the sent message
      const sentMessage = (mockWebSocket.send as Mock).mock.calls[0][0]
      const pingData = JSON.parse(sentMessage)
      const pingId = pingData.ping

      // Simulate pong response after some delay
      vi.advanceTimersByTime(100)
      mockWebSocket.simulatePong(pingId)

      expect(heartbeatSuccessSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          latency: expect.any(Number)
        })
      )
    })

    it('should detect ping timeouts', () => {
      const timeoutSpy = vi.fn()
      monitor.on('heartbeat_timeout', timeoutSpy)

      // Trigger ping
      vi.advanceTimersByTime(1000)

      // Advance past timeout threshold without pong
      vi.advanceTimersByTime(3000)

      expect(timeoutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          consecutiveTimeouts: 1
        })
      )
    })

    it('should handle multiple consecutive timeouts', () => {
      const interruptionSpy = vi.fn()
      monitor.on('connection_interrupted', interruptionSpy)

      // Trigger 3 consecutive timeouts
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000) // Trigger ping
        vi.advanceTimersByTime(3000) // Trigger timeout
      }

      expect(interruptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'timeout',
          canRecover: false
        })
      )
      expect(monitor.isHealthy()).toBe(false)
    })

    it('should reset consecutive timeouts after successful pong', () => {
      const timeoutSpy = vi.fn()
      monitor.on('heartbeat_timeout', timeoutSpy)

      // First timeout
      vi.advanceTimersByTime(1000)
      vi.advanceTimersByTime(3000)
      expect(timeoutSpy).toHaveBeenCalledTimes(1)

      // Successful heartbeat
      vi.advanceTimersByTime(1000)
      const sentMessage = (mockWebSocket.send as Mock).mock.calls[1][0]
      const pingData = JSON.parse(sentMessage)
      mockWebSocket.simulatePong(pingData.ping)

      // Should reset consecutive timeouts
      const state = monitor.getState()
      expect(state.isHealthy).toBe(true)
    })
  })

  describe('Connection Quality', () => {
    beforeEach(() => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()
    })

    it('should start with full quality score', () => {
      expect(monitor.getQuality()).toBe(1.0)
    })

    it('should decrease quality with high latency', () => {
      // Send ping and respond with high latency
      vi.advanceTimersByTime(1000)
      const sentMessage = (mockWebSocket.send as Mock).mock.calls[0][0]
      const pingData = JSON.parse(sentMessage)

      // Simulate high latency
      vi.advanceTimersByTime(3000) // 3 second latency
      mockWebSocket.simulatePong(pingData.ping)

      // Quality should decrease
      expect(monitor.getQuality()).toBeLessThan(1.0)
    })

    it('should decrease quality with consecutive timeouts', () => {
      const initialQuality = monitor.getQuality()

      // Cause a timeout
      vi.advanceTimersByTime(1000)
      vi.advanceTimersByTime(3000)

      expect(monitor.getQuality()).toBeLessThan(initialQuality)
    })

    it('should emit health_changed event when health status changes', () => {
      const healthChangedSpy = vi.fn()
      monitor.on('health_changed', healthChangedSpy)

      // Cause multiple timeouts to make unhealthy
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000)
        vi.advanceTimersByTime(3000)
      }

      expect(healthChangedSpy).toHaveBeenCalled()
    })
  })

  describe('Metrics Collection', () => {
    beforeEach(() => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()
    })

    it('should track interruption count', () => {
      mockWebSocket.simulateError()
      mockWebSocket.simulateClose()

      const metrics = monitor.getMetrics()
      expect(metrics.interruptionCount).toBe(2)
    })

    it('should record last interruption timestamp', () => {
      const beforeInterruption = new Date()
      mockWebSocket.simulateError()

      const metrics = monitor.getMetrics()
      expect(metrics.lastInterruption).toBeInstanceOf(Date)
      expect(metrics.lastInterruption!.getTime()).toBeGreaterThanOrEqual(
        beforeInterruption.getTime()
      )
    })

    it('should calculate average latency', () => {
      // Send multiple pings with different latencies
      const latencies = [100, 200, 300]

      for (const latency of latencies) {
        vi.advanceTimersByTime(1000)
        const sentMessage = (mockWebSocket.send as Mock).mock.calls.slice(-1)[0][0]
        const pingData = JSON.parse(sentMessage)

        vi.advanceTimersByTime(latency)
        mockWebSocket.simulatePong(pingData.ping)
      }

      const metrics = monitor.getMetrics()
      expect(metrics.averageLatency).toBeGreaterThan(0)
    })

    it('should maintain interruption history', () => {
      mockWebSocket.simulateError()
      mockWebSocket.simulateClose(1006)

      const history = monitor.getInterruptionHistory()
      expect(history).toHaveLength(2)
      expect(history[0].type).toBe('error')
      expect(history[1].type).toBe('disconnect')
    })

    it('should limit history size', () => {
      const smallMonitor = new ConnectionMonitor({maxHistorySize: 2})
      smallMonitor.startMonitoring(mockWebSocket as unknown as WebSocket)

      // Cause more interruptions than history size
      for (let i = 0; i < 5; i++) {
        mockWebSocket.simulateError()
      }

      const history = smallMonitor.getInterruptionHistory()
      expect(history).toHaveLength(2)

      smallMonitor.stopMonitoring()
    })
  })

  describe('Message Handling', () => {
    beforeEach(() => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()
    })

    it('should reset silent failure timer on message receipt', () => {
      const interruptionSpy = vi.fn()
      monitor.on('connection_interrupted', interruptionSpy)

      // Advance time partway to silent failure
      vi.advanceTimersByTime(3000)

      // Receive a message
      mockWebSocket.simulateMessage({type: 'test'})

      // Advance remaining time - should not trigger silent failure
      vi.advanceTimersByTime(3000)

      expect(interruptionSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({type: 'silent_failure'})
      )
    })

    it('should update lastSeen timestamp on message receipt', () => {
      const beforeMessage = new Date()
      mockWebSocket.simulateMessage({test: 'data'})

      const state = monitor.getState()
      expect(state.lastSeen).toBeInstanceOf(Date)
      expect(state.lastSeen!.getTime()).toBeGreaterThanOrEqual(beforeMessage.getTime())
    })
  })

  describe('Configuration Updates', () => {
    it('should allow configuration updates', () => {
      monitor.updateConfig({
        heartbeatInterval: 2000,
        timeoutThreshold: 4000
      })

      // Configuration should be updated
      // This is primarily tested through behavior changes
    })

    it('should restart monitoring when configuration changes', () => {
      const monitoringStoppedSpy = vi.fn()
      const monitoringStartedSpy = vi.fn()

      monitor.on('monitoring_stopped', monitoringStoppedSpy)
      monitor.on('monitoring_started', monitoringStartedSpy)

      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      monitor.updateConfig({heartbeatInterval: 2000})

      expect(monitoringStoppedSpy).toHaveBeenCalled()
      expect(monitoringStartedSpy).toHaveBeenCalledTimes(2) // Initial start + restart
    })
  })

  describe('Manual Operations', () => {
    beforeEach(() => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()
    })

    it('should allow forcing health check', () => {
      const healthCheckSpy = vi.fn()
      monitor.on('health_check_forced', healthCheckSpy)

      monitor.forceHealthCheck()

      expect(healthCheckSpy).toHaveBeenCalled()
      expect(mockWebSocket.send).toHaveBeenCalled() // Should send ping
    })

    it('should reset metrics when requested', () => {
      // Create some metrics
      mockWebSocket.simulateError()
      vi.advanceTimersByTime(1000)

      const metricsResetSpy = vi.fn()
      monitor.on('metrics_reset', metricsResetSpy)

      monitor.resetMetrics()

      const metrics = monitor.getMetrics()
      expect(metrics.interruptionCount).toBe(0)
      expect(metrics.averageLatency).toBe(0)
      expect(metricsResetSpy).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle WebSocket not ready for sending', () => {
      mockWebSocket.readyState = MockWebSocket.CLOSED
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)

      // Should not throw when trying to send ping
      vi.advanceTimersByTime(1000)
      expect(() => vi.advanceTimersByTime(100)).not.toThrow()
    })

    it('should handle malformed pong messages', () => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()

      // Send malformed message
      mockWebSocket.simulateMessage('invalid json')

      // Should not crash
      expect(monitor.isHealthy()).toBe(true)
    })

    it('should handle pong for unknown ping', () => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateOpen()

      // Send pong for unknown ping ID
      mockWebSocket.simulatePong('unknown_ping_id')

      // Should not crash
      expect(monitor.isHealthy()).toBe(true)
    })
  })

  describe('State Management', () => {
    it('should provide current state snapshot', () => {
      const state = monitor.getState()

      expect(state).toHaveProperty('isConnected')
      expect(state).toHaveProperty('isHealthy')
      expect(state).toHaveProperty('lastSeen')
      expect(state).toHaveProperty('quality')
    })

    it('should provide metrics snapshot', () => {
      const metrics = monitor.getMetrics()

      expect(metrics).toHaveProperty('connectionQuality')
      expect(metrics).toHaveProperty('averageLatency')
      expect(metrics).toHaveProperty('interruptionCount')
    })

    it('should provide interruption history snapshot', () => {
      monitor.startMonitoring(mockWebSocket as unknown as WebSocket)
      mockWebSocket.simulateError()

      const history = monitor.getInterruptionHistory()
      expect(Array.isArray(history)).toBe(true)
      expect(history.length).toBe(1)
    })
  })
})
