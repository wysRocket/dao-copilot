/**
 * WebSocket Heartbeat Monitor Test Suite
 * Core tests for heartbeat monitoring functionality
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, beforeEach, afterEach, vi, MockedFunction} from 'vitest'
import EventEmitter from 'eventemitter3'
import {
  WebSocketHeartbeatMonitor,
  HeartbeatStatus,
  type HeartbeatConfig
} from '../../services/websocket-heartbeat-monitor'

// Mock logger
vi.mock('../../services/gemini-logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN
  public send: MockedFunction<(data: string) => void>
  public ping?: MockedFunction<(data: string) => void>

  constructor() {
    super()
    this.send = vi.fn()
    this.ping = vi.fn()
  }
}

describe('WebSocketHeartbeatMonitor', () => {
  let monitor: WebSocketHeartbeatMonitor
  let mockWebSocket: MockWebSocket
  let config: Partial<HeartbeatConfig>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    config = {
      interval: 1000,
      timeout: 500,
      maxMissedBeats: 3,
      useNativePing: false,
      enableMetrics: true,
      customPingMessage: {ping: true}
    }

    monitor = new WebSocketHeartbeatMonitor(config)
    mockWebSocket = new MockWebSocket()
  })

  afterEach(() => {
    vi.useRealTimers()
    monitor.stop()
  })

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultMonitor = new WebSocketHeartbeatMonitor()
      const actualConfig = defaultMonitor.getConfig()

      expect(actualConfig.interval).toBe(30000)
      expect(actualConfig.timeout).toBe(5000)
      expect(actualConfig.maxMissedBeats).toBe(3)
      expect(actualConfig.useNativePing).toBe(false)
      expect(actualConfig.enableMetrics).toBe(true)
    })

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        interval: 15000,
        maxMissedBeats: 5
      }
      const customMonitor = new WebSocketHeartbeatMonitor(customConfig)
      const actualConfig = customMonitor.getConfig()

      expect(actualConfig.interval).toBe(15000)
      expect(actualConfig.maxMissedBeats).toBe(5)
      expect(actualConfig.timeout).toBe(5000) // default
    })

    it('should update configuration', () => {
      const newConfig = {interval: 2000, timeout: 1000}
      monitor.updateConfig(newConfig)

      const actualConfig = monitor.getConfig()
      expect(actualConfig.interval).toBe(2000)
      expect(actualConfig.timeout).toBe(1000)
    })
  })

  describe('Monitor Lifecycle', () => {
    it('should start monitoring', () => {
      const startSpy = vi.fn()
      monitor.on('started', startSpy)

      monitor.start(mockWebSocket as unknown as WebSocket)

      expect(monitor.getStatus()).toBe(HeartbeatStatus.MONITORING)
      expect(startSpy).toHaveBeenCalled()
    })

    it('should stop monitoring', () => {
      const stopSpy = vi.fn()
      monitor.on('stopped', stopSpy)

      monitor.start(mockWebSocket as unknown as WebSocket)
      monitor.stop()

      expect(monitor.getStatus()).toBe(HeartbeatStatus.STOPPED)
      expect(stopSpy).toHaveBeenCalled()
    })

    it('should reset metrics when starting', () => {
      monitor.start(mockWebSocket as unknown as WebSocket)
      const initialMetrics = monitor.getMetrics()

      expect(initialMetrics.totalSent).toBe(0)
      expect(initialMetrics.totalReceived).toBe(0)
      expect(initialMetrics.consecutiveMissed).toBe(0)
      expect(initialMetrics.healthScore).toBe(1.0)
    })
  })

  describe('Heartbeat Sending', () => {
    beforeEach(() => {
      monitor.start(mockWebSocket as unknown as WebSocket)
    })

    it('should send heartbeat after interval', () => {
      const pingSpy = vi.fn()
      monitor.on('ping_sent', pingSpy)

      vi.advanceTimersByTime(config.interval!)

      expect(mockWebSocket.send).toHaveBeenCalled()
      expect(pingSpy).toHaveBeenCalled()
    })

    it('should send heartbeat with unique ID', () => {
      // Send first ping
      vi.advanceTimersByTime(config.interval!)

      // Mock pong response for first ping to allow next heartbeat
      const sentMessage1 = JSON.parse(mockWebSocket.send.mock.calls[0][0])
      monitor.handleMessage({id: sentMessage1.id, pong: Date.now()})

      // Send second ping
      vi.advanceTimersByTime(config.interval!)

      expect(mockWebSocket.send).toHaveBeenCalledTimes(2)
      const call1 = mockWebSocket.send.mock.calls[0][0]
      const call2 = mockWebSocket.send.mock.calls[1][0]

      const message1 = JSON.parse(call1)
      const message2 = JSON.parse(call2)

      expect(message1.id).toBeDefined()
      expect(message2.id).toBeDefined()
      expect(message1.id).not.toBe(message2.id)
    })

    it('should handle WebSocket closed state', () => {
      const failedSpy = vi.fn()
      monitor.on('failed', failedSpy)

      mockWebSocket.readyState = WebSocket.CLOSED
      vi.advanceTimersByTime(config.interval!)

      expect(failedSpy).toHaveBeenCalled()
    })

    it('should update metrics when sending', () => {
      vi.advanceTimersByTime(config.interval!)

      const metrics = monitor.getMetrics()
      expect(metrics.totalSent).toBe(1)
    })
  })

  describe('Pong Response Handling', () => {
    beforeEach(() => {
      monitor.start(mockWebSocket as unknown as WebSocket)
      vi.advanceTimersByTime(config.interval!) // Send first ping
    })

    it('should handle pong response correctly', () => {
      const pongSpy = vi.fn()
      monitor.on('pong_received', pongSpy)

      // Get the ping ID from the sent message
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0])
      const pongMessage = {id: sentMessage.id, pong: Date.now()}

      const handled = monitor.handleMessage(pongMessage)

      expect(handled).toBe(true)
      expect(pongSpy).toHaveBeenCalled()
    })

    it('should calculate response time', () => {
      const pongSpy = vi.fn()
      monitor.on('pong_received', pongSpy)

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0])

      // Advance time to simulate response delay
      vi.advanceTimersByTime(100)

      const pongMessage = {id: sentMessage.id, pong: Date.now()}
      monitor.handleMessage(pongMessage)

      const event = pongSpy.mock.calls[0][0]
      expect(event.responseTime).toBeGreaterThan(0)
    })

    it('should reset consecutive missed counter on pong', () => {
      // Simulate missed heartbeat first
      vi.advanceTimersByTime(config.timeout! + 100)
      vi.advanceTimersByTime(config.interval!)

      // Now respond to second ping
      const sentMessages = mockWebSocket.send.mock.calls
      const lastMessage = JSON.parse(sentMessages[sentMessages.length - 1][0])
      const pongMessage = {id: lastMessage.id, pong: Date.now()}

      monitor.handleMessage(pongMessage)

      const metrics = monitor.getMetrics()
      expect(metrics.consecutiveMissed).toBe(0)
    })

    it('should ignore pong with unknown ID', () => {
      const pongSpy = vi.fn()
      monitor.on('pong_received', pongSpy)

      // Send a message that doesn't match any pong pattern and has unknown ID
      const unknownPongMessage = {id: 'unknown_id', type: 'other'}
      const handled = monitor.handleMessage(unknownPongMessage)

      expect(handled).toBe(false)
      expect(pongSpy).not.toHaveBeenCalled()
    })
  })

  describe('Timeout Handling', () => {
    beforeEach(() => {
      monitor.start(mockWebSocket as unknown as WebSocket)
      vi.advanceTimersByTime(config.interval!) // Send first ping
    })

    it('should trigger timeout after configured period', () => {
      const timeoutSpy = vi.fn()
      monitor.on('timeout', timeoutSpy)

      vi.advanceTimersByTime(config.timeout! + 100)

      expect(timeoutSpy).toHaveBeenCalled()
    })

    it('should increment consecutive missed counter', () => {
      vi.advanceTimersByTime(config.timeout! + 100)

      const metrics = monitor.getMetrics()
      expect(metrics.consecutiveMissed).toBe(1)
    })

    it('should emit missed_beat event', () => {
      const missedBeatSpy = vi.fn()
      monitor.on('missed_beat', missedBeatSpy)

      vi.advanceTimersByTime(config.timeout! + 100)

      expect(missedBeatSpy).toHaveBeenCalled()
    })

    it('should continue monitoring after single timeout', () => {
      vi.advanceTimersByTime(config.timeout! + 100) // First timeout

      expect(monitor.getStatus()).toBe(HeartbeatStatus.MONITORING)

      // Should schedule next heartbeat
      vi.advanceTimersByTime(config.interval!)
      expect(mockWebSocket.send).toHaveBeenCalledTimes(2)
    })

    it('should mark connection unhealthy after max missed beats', () => {
      const unhealthySpy = vi.fn()
      monitor.on('unhealthy', unhealthySpy)

      // Trigger max missed beats
      for (let i = 0; i < config.maxMissedBeats!; i++) {
        vi.advanceTimersByTime(config.interval!)
        vi.advanceTimersByTime(config.timeout! + 100)
      }

      expect(monitor.getStatus()).toBe(HeartbeatStatus.UNHEALTHY)
      expect(unhealthySpy).toHaveBeenCalled()
    })
  })

  describe('Health Monitoring', () => {
    beforeEach(() => {
      monitor.start(mockWebSocket as unknown as WebSocket)
    })

    it('should start with healthy status', () => {
      expect(monitor.isHealthy()).toBe(true)

      const metrics = monitor.getMetrics()
      expect(metrics.healthScore).toBe(1.0)
    })

    it('should track connection metrics', () => {
      // Send ping
      vi.advanceTimersByTime(config.interval!)

      let metrics = monitor.getMetrics()
      expect(metrics.totalSent).toBe(1)
      expect(metrics.totalReceived).toBe(0)

      // Respond with pong
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0])
      monitor.handleMessage({id: sentMessage.id, pong: Date.now()})

      metrics = monitor.getMetrics()
      expect(metrics.totalReceived).toBe(1)
    })

    it('should update health score based on missed beats', () => {
      // Send ping and let it timeout
      vi.advanceTimersByTime(config.interval!)
      vi.advanceTimersByTime(config.timeout! + 100)

      const metrics = monitor.getMetrics()
      expect(metrics.healthScore).toBeLessThan(1.0)
    })

    it('should become unhealthy with too many missed beats', () => {
      // Miss enough beats to become unhealthy
      for (let i = 0; i < config.maxMissedBeats!; i++) {
        vi.advanceTimersByTime(config.interval!)
        vi.advanceTimersByTime(config.timeout! + 100)
      }

      expect(monitor.isHealthy()).toBe(false)
    })
  })

  describe('Message Detection', () => {
    it('should detect pong messages correctly', () => {
      monitor.start(mockWebSocket as unknown as WebSocket)

      // Test different pong message formats
      expect(monitor.handleMessage({pong: Date.now()})).toBe(true)
      expect(monitor.handleMessage({type: 'pong'})).toBe(true)
      expect(monitor.handleMessage({type: 'data'})).toBe(false)
      expect(monitor.handleMessage({content: 'hello'})).toBe(false)
    })

    it('should handle invalid messages gracefully', () => {
      monitor.start(mockWebSocket as unknown as WebSocket)

      expect(() => {
        monitor.handleMessage({})
        monitor.handleMessage({id: null})
        monitor.handleMessage({type: null})
      }).not.toThrow()
    })
  })

  describe('Event System', () => {
    beforeEach(() => {
      monitor.start(mockWebSocket as unknown as WebSocket)
    })

    it('should emit heartbeat_event for all events', () => {
      const eventSpy = vi.fn()
      monitor.on('heartbeat_event', eventSpy)

      vi.advanceTimersByTime(config.interval!)

      expect(eventSpy).toHaveBeenCalledWith({
        type: 'ping_sent',
        timestamp: expect.any(Number)
      })
    })

    it('should emit specific event types', () => {
      const pingSentSpy = vi.fn()
      const timeoutSpy = vi.fn()

      monitor.on('ping_sent', pingSentSpy)
      monitor.on('timeout', timeoutSpy)

      // Send ping
      vi.advanceTimersByTime(config.interval!)
      expect(pingSentSpy).toHaveBeenCalled()

      // Trigger timeout
      vi.advanceTimersByTime(config.timeout! + 100)
      expect(timeoutSpy).toHaveBeenCalled()
    })

    it('should emit config_updated event', () => {
      const configUpdateSpy = vi.fn()
      monitor.on('config_updated', configUpdateSpy)

      monitor.updateConfig({interval: 2000})

      expect(configUpdateSpy).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle WebSocket send errors', () => {
      const failedSpy = vi.fn()
      monitor.on('failed', failedSpy)

      mockWebSocket.send.mockImplementation(() => {
        throw new Error('Send failed')
      })

      monitor.start(mockWebSocket as unknown as WebSocket)
      vi.advanceTimersByTime(config.interval!)

      expect(failedSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        reason: 'send_failed',
        error: 'Send failed',
        metrics: expect.any(Object)
      })
    })

    it('should handle null WebSocket gracefully', () => {
      expect(() => {
        monitor.start(null as any)
      }).not.toThrow()
    })
  })
})
