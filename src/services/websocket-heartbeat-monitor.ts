/**
 * WebSocket Heartbeat Monitor
 * Provides robust heartbeat monitoring for WebSocket connections with health tracking,
 * missed heartbeat detection, and automatic recovery triggers.
 */

import EventEmitter from 'eventemitter3'
import {logger} from './gemini-logger'

export interface HeartbeatConfig {
  /** Interval between heartbeat pings (ms) */
  interval: number
  /** Timeout for waiting pong response (ms) */
  timeout: number
  /** Maximum consecutive missed heartbeats before marking connection unhealthy */
  maxMissedBeats: number
  /** Whether to use native WebSocket ping/pong or application-level messages */
  useNativePing: boolean
  /** Custom heartbeat message for application-level pings */
  customPingMessage?: Record<string, unknown>
  /** Whether to enable detailed health metrics tracking */
  enableMetrics: boolean
}

export interface HeartbeatMetrics {
  /** Total heartbeats sent */
  totalSent: number
  /** Total pong responses received */
  totalReceived: number
  /** Consecutive missed heartbeats */
  consecutiveMissed: number
  /** Average response time (ms) */
  averageResponseTime: number
  /** Last successful heartbeat timestamp */
  lastSuccessfulHeartbeat: number
  /** Connection uptime since last successful heartbeat */
  connectionUptime: number
  /** Health score (0-1, where 1 is perfect health) */
  healthScore: number
}

export enum HeartbeatStatus {
  STOPPED = 'stopped',
  MONITORING = 'monitoring',
  WAITING_PONG = 'waiting_pong',
  UNHEALTHY = 'unhealthy',
  FAILED = 'failed'
}

export interface HeartbeatEvent {
  timestamp: number
  type: 'ping_sent' | 'pong_received' | 'timeout' | 'missed_beat' | 'health_change'
  responseTime?: number
  consecutiveMissed?: number
  healthScore?: number
}

/**
 * WebSocket Heartbeat Monitor
 * Provides comprehensive heartbeat monitoring with health tracking and recovery triggers
 */
export class WebSocketHeartbeatMonitor extends EventEmitter {
  private config: HeartbeatConfig
  private status: HeartbeatStatus = HeartbeatStatus.STOPPED
  private metrics: HeartbeatMetrics
  private heartbeatTimer: NodeJS.Timeout | null = null
  private pongTimer: NodeJS.Timeout | null = null
  private websocket: WebSocket | null = null
  private pendingPings: Map<string, number> = new Map()
  private responseTimes: number[] = []
  private lastPingId: string | null = null
  private startTime: number = 0

  constructor(config: Partial<HeartbeatConfig> = {}) {
    super()

    this.config = {
      interval: 30000, // 30 seconds
      timeout: 5000, // 5 seconds
      maxMissedBeats: 3,
      useNativePing: false, // Gemini Live doesn't support native ping/pong
      enableMetrics: true,
      customPingMessage: {ping: Date.now()},
      ...config
    }

    this.metrics = {
      totalSent: 0,
      totalReceived: 0,
      consecutiveMissed: 0,
      averageResponseTime: 0,
      lastSuccessfulHeartbeat: 0,
      connectionUptime: 0,
      healthScore: 1.0
    }

    logger.info('WebSocketHeartbeatMonitor initialized', {
      interval: this.config.interval,
      timeout: this.config.timeout,
      maxMissedBeats: this.config.maxMissedBeats,
      useNativePing: this.config.useNativePing
    })
  }

  /**
   * Start heartbeat monitoring for a WebSocket connection
   */
  start(websocket: WebSocket): void {
    if (this.status === HeartbeatStatus.MONITORING) {
      logger.warn('Heartbeat monitor already running, stopping first')
      this.stop()
    }

    this.websocket = websocket
    this.status = HeartbeatStatus.MONITORING
    this.startTime = Date.now()
    this.resetMetrics()

    // Setup WebSocket event listeners for pong responses
    if (this.config.useNativePing) {
      this.setupNativePingPong()
    }

    this.scheduleNextHeartbeat()

    logger.info('Heartbeat monitoring started', {
      useNativePing: this.config.useNativePing,
      interval: this.config.interval
    })

    this.emit('started', {
      timestamp: Date.now(),
      config: this.config
    })
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    this.clearTimers()
    this.status = HeartbeatStatus.STOPPED
    this.websocket = null
    this.pendingPings.clear()
    this.lastPingId = null

    logger.info('Heartbeat monitoring stopped', {
      finalMetrics: this.config.enableMetrics ? this.metrics : null
    })

    this.emit('stopped', {
      timestamp: Date.now(),
      metrics: this.config.enableMetrics ? this.metrics : null
    })
  }

  /**
   * Handle incoming message that might be a pong response
   */
  handleMessage(message: Record<string, unknown>): boolean {
    if (!this.config.useNativePing && this.isPongMessage(message)) {
      this.handlePongReceived(message)
      return true
    }
    return false
  }

  /**
   * Get current heartbeat metrics
   */
  getMetrics(): HeartbeatMetrics {
    if (this.config.enableMetrics) {
      this.updateConnectionUptime()
      return {...this.metrics}
    }
    return {} as HeartbeatMetrics
  }

  /**
   * Get current heartbeat status
   */
  getStatus(): HeartbeatStatus {
    return this.status
  }

  /**
   * Check if connection is healthy based on current metrics
   */
  isHealthy(): boolean {
    return (
      this.status === HeartbeatStatus.MONITORING &&
      this.metrics.consecutiveMissed < this.config.maxMissedBeats &&
      this.metrics.healthScore > 0.5
    )
  }

  /**
   * Schedule the next heartbeat
   */
  private scheduleNextHeartbeat(): void {
    if (this.status !== HeartbeatStatus.MONITORING) {
      return
    }

    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat()
    }, this.config.interval)
  }

  /**
   * Send heartbeat ping
   */
  private sendHeartbeat(): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send heartbeat: WebSocket not connected')
      this.handleConnectionProblem('websocket_not_connected')
      return
    }

    const pingId = this.generatePingId()
    const timestamp = Date.now()

    try {
      if (this.config.useNativePing) {
        // Use native WebSocket ping (not supported by all browsers/servers)
        // Note: This requires a Node.js WebSocket implementation that supports ping
        const ws = this.websocket as any // eslint-disable-line @typescript-eslint/no-explicit-any
        if (ws.ping && typeof ws.ping === 'function') {
          ws.ping(pingId)
        } else {
          throw new Error('Native ping not supported by this WebSocket implementation')
        }
      } else {
        // Use application-level ping
        const pingMessage = {
          ...this.config.customPingMessage,
          id: pingId,
          timestamp
        }
        this.websocket.send(JSON.stringify(pingMessage))
      }

      this.lastPingId = pingId
      this.pendingPings.set(pingId, timestamp)
      this.status = HeartbeatStatus.WAITING_PONG

      if (this.config.enableMetrics) {
        this.metrics.totalSent++
      }

      // Set timeout for pong response
      this.pongTimer = setTimeout(() => {
        this.handlePongTimeout(pingId)
      }, this.config.timeout)

      logger.debug('Heartbeat sent', {
        pingId,
        useNativePing: this.config.useNativePing,
        pendingPings: this.pendingPings.size
      })

      this.emitEvent({
        type: 'ping_sent',
        timestamp
      })
    } catch (error) {
      logger.error('Failed to send heartbeat', {
        error: error instanceof Error ? error.message : 'Unknown error',
        websocketState: this.websocket?.readyState
      })
      this.handleConnectionProblem('send_failed', error as Error)
    }
  }

  /**
   * Handle pong response received
   */
  private handlePongReceived(message: Record<string, unknown>): void {
    const timestamp = Date.now()
    let pingId: string | null = null
    let responseTime: number = 0

    // Extract ping ID from pong message
    if (typeof message.id === 'string' && this.pendingPings.has(message.id)) {
      pingId = message.id
      const pingTimestamp = this.pendingPings.get(pingId)!
      responseTime = timestamp - pingTimestamp
      this.pendingPings.delete(pingId)
    } else if (this.lastPingId && this.pendingPings.has(this.lastPingId)) {
      // Fallback: assume this pong is for the last ping
      pingId = this.lastPingId
      const pingTimestamp = this.pendingPings.get(pingId)!
      responseTime = timestamp - pingTimestamp
      this.pendingPings.delete(pingId)
    }

    if (pingId) {
      // Clear pong timeout
      if (this.pongTimer) {
        clearTimeout(this.pongTimer)
        this.pongTimer = null
      }

      // Update metrics
      if (this.config.enableMetrics) {
        this.metrics.totalReceived++
        this.metrics.consecutiveMissed = 0
        this.metrics.lastSuccessfulHeartbeat = timestamp
        this.updateResponseTime(responseTime)
        this.updateHealthScore()
      }

      this.status = HeartbeatStatus.MONITORING

      logger.debug('Pong received', {
        pingId,
        responseTime,
        healthScore: this.metrics.healthScore
      })

      this.emitEvent({
        type: 'pong_received',
        timestamp,
        responseTime,
        consecutiveMissed: this.metrics.consecutiveMissed,
        healthScore: this.metrics.healthScore
      })

      // Schedule next heartbeat
      this.scheduleNextHeartbeat()
    } else {
      logger.warn('Received pong with no matching ping', {message})
    }
  }

  /**
   * Handle pong timeout
   */
  private handlePongTimeout(pingId: string): void {
    const timestamp = Date.now()

    // Remove the timed-out ping
    this.pendingPings.delete(pingId)

    if (this.config.enableMetrics) {
      this.metrics.consecutiveMissed++
      this.updateHealthScore()
    }

    logger.warn('Heartbeat timeout', {
      pingId,
      consecutiveMissed: this.metrics.consecutiveMissed,
      maxMissedBeats: this.config.maxMissedBeats,
      healthScore: this.metrics.healthScore
    })

    this.emitEvent({
      type: 'timeout',
      timestamp,
      consecutiveMissed: this.metrics.consecutiveMissed,
      healthScore: this.metrics.healthScore
    })

    if (this.metrics.consecutiveMissed >= this.config.maxMissedBeats) {
      this.handleConnectionUnhealthy()
    } else {
      // Continue monitoring but mark as missed
      this.status = HeartbeatStatus.MONITORING
      this.emitEvent({
        type: 'missed_beat',
        timestamp,
        consecutiveMissed: this.metrics.consecutiveMissed
      })
      this.scheduleNextHeartbeat()
    }
  }

  /**
   * Handle unhealthy connection
   */
  private handleConnectionUnhealthy(): void {
    this.status = HeartbeatStatus.UNHEALTHY

    logger.error('Connection marked as unhealthy', {
      consecutiveMissed: this.metrics.consecutiveMissed,
      maxMissedBeats: this.config.maxMissedBeats,
      healthScore: this.metrics.healthScore
    })

    this.emit('unhealthy', {
      timestamp: Date.now(),
      consecutiveMissed: this.metrics.consecutiveMissed,
      metrics: this.config.enableMetrics ? this.metrics : null,
      reason: 'consecutive_missed_heartbeats'
    })

    // Stop further monitoring until manually restarted
    this.clearTimers()
  }

  /**
   * Handle general connection problems
   */
  private handleConnectionProblem(reason: string, error?: Error): void {
    this.status = HeartbeatStatus.FAILED

    logger.error('Heartbeat monitoring failed', {
      reason,
      error: error?.message,
      metrics: this.config.enableMetrics ? this.metrics : null
    })

    this.emit('failed', {
      timestamp: Date.now(),
      reason,
      error: error?.message,
      metrics: this.config.enableMetrics ? this.metrics : null
    })

    this.clearTimers()
  }

  /**
   * Setup native WebSocket ping/pong (if supported)
   */
  private setupNativePingPong(): void {
    if (!this.websocket) return

    // Note: Native ping/pong is not widely supported in browsers
    // This is mainly for Node.js WebSocket implementations
    const ws = this.websocket as any // eslint-disable-line @typescript-eslint/no-explicit-any
    if (ws.on && typeof ws.on === 'function') {
      ws.on('pong', (data: Buffer) => {
        const message = {id: data.toString()}
        this.handlePongReceived(message)
      })
    }
  }

  /**
   * Check if a message is a pong response
   */
  private isPongMessage(message: Record<string, unknown>): boolean {
    // Check for common pong message patterns
    return (
      message &&
      (message.pong !== undefined ||
        message.type === 'pong' ||
        (typeof message.id === 'string' && this.pendingPings.has(message.id)))
    )
  }

  /**
   * Generate unique ping ID
   */
  private generatePingId(): string {
    return `ping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Update response time metrics
   */
  private updateResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime)

    // Keep only recent response times (last 10)
    if (this.responseTimes.length > 10) {
      this.responseTimes.shift()
    }

    // Calculate average
    this.metrics.averageResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
  }

  /**
   * Update health score based on current metrics
   */
  private updateHealthScore(): void {
    if (!this.config.enableMetrics) return

    // Health score factors:
    // - Consecutive missed beats (most important)
    // - Response time consistency
    // - Overall success rate

    const missedFactor = Math.max(
      0,
      1 - this.metrics.consecutiveMissed / this.config.maxMissedBeats
    )
    const successRate =
      this.metrics.totalSent > 0 ? this.metrics.totalReceived / this.metrics.totalSent : 1

    // Response time factor (penalize high response times)
    const avgResponseTime = this.metrics.averageResponseTime
    const responseFactor =
      avgResponseTime > 0 ? Math.max(0.1, 1 - avgResponseTime / (this.config.timeout * 2)) : 1

    this.metrics.healthScore = missedFactor * 0.5 + successRate * 0.3 + responseFactor * 0.2

    // Emit health change event if significant change
    const previousEvent = this.listenerCount('health_changed') > 0
    if (previousEvent) {
      this.emitEvent({
        type: 'health_change',
        timestamp: Date.now(),
        healthScore: this.metrics.healthScore,
        consecutiveMissed: this.metrics.consecutiveMissed
      })
    }
  }

  /**
   * Update connection uptime
   */
  private updateConnectionUptime(): void {
    if (this.startTime > 0) {
      this.metrics.connectionUptime = Date.now() - this.startTime
    }
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): void {
    this.metrics = {
      totalSent: 0,
      totalReceived: 0,
      consecutiveMissed: 0,
      averageResponseTime: 0,
      lastSuccessfulHeartbeat: 0,
      connectionUptime: 0,
      healthScore: 1.0
    }
    this.responseTimes = []
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  /**
   * Emit heartbeat event
   */
  private emitEvent(event: HeartbeatEvent): void {
    this.emit('heartbeat_event', event)

    // Also emit specific event types
    switch (event.type) {
      case 'ping_sent':
        this.emit('ping_sent', event)
        break
      case 'pong_received':
        this.emit('pong_received', event)
        break
      case 'timeout':
        this.emit('timeout', event)
        break
      case 'missed_beat':
        this.emit('missed_beat', event)
        break
      case 'health_change':
        this.emit('health_changed', event)
        break
    }
  }

  /**
   * Get configuration
   */
  getConfig(): HeartbeatConfig {
    return {...this.config}
  }

  /**
   * Update configuration (requires restart to take effect)
   */
  updateConfig(newConfig: Partial<HeartbeatConfig>): void {
    this.config = {...this.config, ...newConfig}

    logger.info('Heartbeat configuration updated', {
      newConfig,
      requiresRestart: this.status === HeartbeatStatus.MONITORING
    })

    this.emit('config_updated', {
      timestamp: Date.now(),
      config: this.config
    })
  }
}

export default WebSocketHeartbeatMonitor
