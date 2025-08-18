/**
 * Connection Monitor for WebSocket Interruption Detection
 *
 * Detects and responds to WebSocket connection interruptions in real-time,
 * including disconnections, timeouts, and silent failures.
 */

import {EventEmitter} from 'events'
import {logger} from '../services/gemini-logger'

export interface ConnectionMetrics {
  connectionQuality: number // 0-1 score
  averageLatency: number // milliseconds
  packetLoss: number // 0-1 percentage
  interruptionCount: number
  lastInterruption: Date | null
  connectionDuration: number // milliseconds
  reconnectionCount: number
  maxInterruptionDuration: number // milliseconds
  averageInterruptionDuration: number // milliseconds
}

export interface ConnectionInterruption {
  type: 'disconnect' | 'timeout' | 'error' | 'silent_failure'
  timestamp: Date
  duration?: number // milliseconds
  reason?: string
  errorCode?: number
  canRecover: boolean
}

export interface ConnectionState {
  isConnected: boolean
  isHealthy: boolean
  lastSeen: Date | null
  connectionStart: Date | null
  currentLatency: number
  quality: number // 0-1 score
}

export interface ConnectionMonitorConfig {
  heartbeatInterval: number // milliseconds
  timeoutThreshold: number // milliseconds
  silentFailureThreshold: number // milliseconds
  qualityCheckInterval: number // milliseconds
  maxReconnectionDelay: number // milliseconds
  latencyThreshold: number // milliseconds for poor connection
  enableMetricsCollection: boolean
  maxHistorySize: number
}

const DEFAULT_CONFIG: ConnectionMonitorConfig = {
  heartbeatInterval: 10000, // 10 seconds
  timeoutThreshold: 15000, // 15 seconds
  silentFailureThreshold: 30000, // 30 seconds
  qualityCheckInterval: 5000, // 5 seconds
  maxReconnectionDelay: 60000, // 1 minute
  latencyThreshold: 2000, // 2 seconds
  enableMetricsCollection: true,
  maxHistorySize: 100
}

/**
 * Monitors WebSocket connections for interruptions and health issues
 */
export class ConnectionMonitor extends EventEmitter {
  private config: ConnectionMonitorConfig
  private ws: WebSocket | null = null
  private state: ConnectionState
  private metrics: ConnectionMetrics
  private interruptionHistory: ConnectionInterruption[] = []

  // Timers and intervals
  private heartbeatTimer: NodeJS.Timeout | null = null
  private timeoutTimer: NodeJS.Timeout | null = null
  private qualityCheckTimer: NodeJS.Timeout | null = null
  private silentFailureTimer: NodeJS.Timeout | null = null

  // Heartbeat tracking
  private pendingPings: Map<string, Date> = new Map()
  private lastPingTime: Date | null = null
  private lastPongTime: Date | null = null
  private consecutiveTimeouts = 0
  private isMonitoring = false

  constructor(config: Partial<ConnectionMonitorConfig> = {}) {
    super()
    this.config = {...DEFAULT_CONFIG, ...config}

    this.state = {
      isConnected: false,
      isHealthy: false,
      lastSeen: null,
      connectionStart: null,
      currentLatency: 0,
      quality: 1.0
    }

    this.metrics = {
      connectionQuality: 1.0,
      averageLatency: 0,
      packetLoss: 0,
      interruptionCount: 0,
      lastInterruption: null,
      connectionDuration: 0,
      reconnectionCount: 0,
      maxInterruptionDuration: 0,
      averageInterruptionDuration: 0
    }

    logger.info('ConnectionMonitor initialized', {
      config: this.config
    })
  }

  /**
   * Start monitoring a WebSocket connection
   */
  startMonitoring(webSocket: WebSocket): void {
    if (this.isMonitoring) {
      this.stopMonitoring()
    }

    this.ws = webSocket
    this.isMonitoring = true
    this.state.connectionStart = new Date()
    this.state.isConnected = webSocket.readyState === WebSocket.OPEN

    // Set up WebSocket event listeners
    this.setupWebSocketListeners()

    // Start monitoring loops
    this.startHeartbeat()
    this.startQualityCheck()
    this.startSilentFailureDetection()

    logger.info('Started monitoring WebSocket connection', {
      readyState: webSocket.readyState,
      url: webSocket.url
    })

    this.emit('monitoring_started', {timestamp: new Date()})
  }

  /**
   * Stop monitoring the current connection
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false
    this.clearAllTimers()
    this.cleanupWebSocketListeners()

    // Update metrics
    if (this.state.connectionStart) {
      this.metrics.connectionDuration = Date.now() - this.state.connectionStart.getTime()
    }

    logger.info('Stopped monitoring WebSocket connection', {
      connectionDuration: this.metrics.connectionDuration,
      interruptionCount: this.metrics.interruptionCount
    })

    this.emit('monitoring_stopped', {
      timestamp: new Date(),
      metrics: this.getMetrics()
    })
  }

  /**
   * Set up WebSocket event listeners for interruption detection
   */
  private setupWebSocketListeners(): void {
    if (!this.ws) return

    this.ws.addEventListener('open', this.handleConnectionOpen.bind(this))
    this.ws.addEventListener('close', this.handleConnectionClose.bind(this))
    this.ws.addEventListener('error', this.handleConnectionError.bind(this))
    this.ws.addEventListener('message', this.handleMessage.bind(this))
  }

  /**
   * Clean up WebSocket event listeners
   */
  private cleanupWebSocketListeners(): void {
    if (!this.ws) return

    this.ws.removeEventListener('open', this.handleConnectionOpen.bind(this))
    this.ws.removeEventListener('close', this.handleConnectionClose.bind(this))
    this.ws.removeEventListener('error', this.handleConnectionError.bind(this))
    this.ws.removeEventListener('message', this.handleMessage.bind(this))
  }

  /**
   * Handle WebSocket connection open event
   */
  private handleConnectionOpen(): void {
    this.state.isConnected = true
    this.state.isHealthy = true
    this.state.connectionStart = new Date()
    this.state.lastSeen = new Date()
    this.consecutiveTimeouts = 0

    logger.info('WebSocket connection opened')
    this.emit('connection_established', {timestamp: new Date()})

    // Reset silent failure timer
    this.resetSilentFailureTimer()
  }

  /**
   * Handle WebSocket connection close event
   */
  private handleConnectionClose(event: CloseEvent): void {
    const interruption: ConnectionInterruption = {
      type: 'disconnect',
      timestamp: new Date(),
      reason: event.reason || 'Unknown',
      errorCode: event.code,
      canRecover: this.isRecoverableCloseCode(event.code)
    }

    this.recordInterruption(interruption)
    this.state.isConnected = false
    this.state.isHealthy = false

    logger.warn('WebSocket connection closed', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    })

    this.emit('connection_interrupted', interruption)

    if (interruption.canRecover) {
      this.emit('recovery_needed', interruption)
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleConnectionError(event: Event): void {
    const interruption: ConnectionInterruption = {
      type: 'error',
      timestamp: new Date(),
      reason: 'WebSocket error occurred',
      canRecover: true // Most WebSocket errors are recoverable
    }

    this.recordInterruption(interruption)
    this.state.isHealthy = false

    logger.error('WebSocket error occurred', {event})

    this.emit('connection_interrupted', interruption)
    this.emit('recovery_needed', interruption)
  }

  /**
   * Handle incoming WebSocket messages for heartbeat detection
   */
  private handleMessage(event: MessageEvent): void {
    this.state.lastSeen = new Date()
    this.resetSilentFailureTimer()

    // Try to parse and check for pong responses
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data

      if (data && data.pong) {
        this.handlePongReceived(data.pong)
      }
    } catch {
      // Not a JSON message or doesn't contain pong - ignore
    }

    // Update quality based on message activity
    this.updateConnectionQuality()
  }

  /**
   * Start heartbeat mechanism to detect silent failures
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    this.heartbeatTimer = setInterval(() => {
      this.sendPing()
    }, this.config.heartbeatInterval)
  }

  /**
   * Send ping message to detect connection health
   */
  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const pingId = `ping_${Date.now()}`
    const pingTime = new Date()

    this.pendingPings.set(pingId, pingTime)
    this.lastPingTime = pingTime

    // Send ping message
    try {
      this.ws.send(JSON.stringify({ping: pingId}))

      // Set timeout for this ping
      setTimeout(() => {
        if (this.pendingPings.has(pingId)) {
          this.handlePingTimeout(pingId)
        }
      }, this.config.timeoutThreshold)
    } catch (error) {
      logger.error('Failed to send ping', {error})
      this.handlePingTimeout(pingId)
    }
  }

  /**
   * Handle pong response received
   */
  private handlePongReceived(pongId: string): void {
    const pongTime = new Date()
    this.lastPongTime = pongTime

    if (this.pendingPings.has(pongId)) {
      const pingTime = this.pendingPings.get(pongId)!
      const latency = pongTime.getTime() - pingTime.getTime()

      this.state.currentLatency = latency
      this.updateAverageLatency(latency)
      this.consecutiveTimeouts = 0

      this.pendingPings.delete(pongId)

      logger.debug('Pong received', {
        pongId,
        latency,
        consecutiveTimeouts: this.consecutiveTimeouts
      })

      this.emit('heartbeat_success', {latency, timestamp: pongTime})

      // Update connection quality after successful pong
      this.updateConnectionQuality()
    }
  }

  /**
   * Handle ping timeout
   */
  private handlePingTimeout(pingId: string): void {
    if (!this.pendingPings.has(pingId)) {
      return // Already handled
    }

    this.pendingPings.delete(pingId)
    this.consecutiveTimeouts++

    const interruption: ConnectionInterruption = {
      type: 'timeout',
      timestamp: new Date(),
      reason: `Ping timeout (${this.consecutiveTimeouts} consecutive)`,
      canRecover: this.consecutiveTimeouts < 3
    }

    this.recordInterruption(interruption)

    logger.warn('Ping timeout detected', {
      pingId,
      consecutiveTimeouts: this.consecutiveTimeouts
    })

    this.emit('heartbeat_timeout', {
      pingId,
      consecutiveTimeouts: this.consecutiveTimeouts
    })

    if (this.consecutiveTimeouts >= 3) {
      this.state.isHealthy = false
      this.emit('connection_interrupted', interruption)
      this.emit('recovery_needed', interruption)
    }
  }

  /**
   * Start quality monitoring
   */
  private startQualityCheck(): void {
    if (this.qualityCheckTimer) {
      clearInterval(this.qualityCheckTimer)
    }

    this.qualityCheckTimer = setInterval(() => {
      this.updateConnectionQuality()
    }, this.config.qualityCheckInterval)
  }

  /**
   * Update connection quality score
   */
  private updateConnectionQuality(): void {
    let quality = 1.0

    // Factor in latency (lower is better)
    if (this.state.currentLatency > this.config.latencyThreshold) {
      quality *= Math.max(0.1, 1 - this.state.currentLatency / (this.config.latencyThreshold * 2))
    }

    // Factor in consecutive timeouts
    if (this.consecutiveTimeouts > 0) {
      quality *= Math.max(0.1, 1 - this.consecutiveTimeouts * 0.3)
    }

    // Factor in recent interruptions
    const recentInterruptions = this.getRecentInterruptions(60000) // Last minute
    if (recentInterruptions.length > 0) {
      quality *= Math.max(0.1, 1 - recentInterruptions.length * 0.2)
    }

    this.state.quality = quality
    this.metrics.connectionQuality = quality

    // Update health status based on quality
    const wasHealthy = this.state.isHealthy
    this.state.isHealthy = quality > 0.5 && this.state.isConnected

    if (wasHealthy !== this.state.isHealthy) {
      this.emit('health_changed', {
        isHealthy: this.state.isHealthy,
        quality: quality,
        timestamp: new Date()
      })
    }
  }

  /**
   * Start silent failure detection
   */
  private startSilentFailureDetection(): void {
    this.resetSilentFailureTimer()
  }

  /**
   * Reset silent failure timer
   */
  private resetSilentFailureTimer(): void {
    if (this.silentFailureTimer) {
      clearTimeout(this.silentFailureTimer)
    }

    this.silentFailureTimer = setTimeout(() => {
      this.handleSilentFailure()
    }, this.config.silentFailureThreshold)
  }

  /**
   * Handle detected silent failure
   */
  private handleSilentFailure(): void {
    const interruption: ConnectionInterruption = {
      type: 'silent_failure',
      timestamp: new Date(),
      reason: 'No activity detected within threshold',
      canRecover: true
    }

    this.recordInterruption(interruption)
    this.state.isHealthy = false

    logger.warn('Silent failure detected', {
      threshold: this.config.silentFailureThreshold,
      lastSeen: this.state.lastSeen
    })

    this.emit('connection_interrupted', interruption)
    this.emit('recovery_needed', interruption)
  }

  /**
   * Record an interruption in history and update metrics
   */
  private recordInterruption(interruption: ConnectionInterruption): void {
    // Add to history
    this.interruptionHistory.push(interruption)

    // Trim history if needed
    if (this.interruptionHistory.length > this.config.maxHistorySize) {
      this.interruptionHistory.shift()
    }

    // Update metrics
    this.metrics.interruptionCount++
    this.metrics.lastInterruption = interruption.timestamp

    if (interruption.duration) {
      this.metrics.maxInterruptionDuration = Math.max(
        this.metrics.maxInterruptionDuration,
        interruption.duration
      )

      // Update average interruption duration
      const totalDuration = this.interruptionHistory
        .filter(i => i.duration)
        .reduce((sum, i) => sum + (i.duration || 0), 0)
      const countWithDuration = this.interruptionHistory.filter(i => i.duration).length

      if (countWithDuration > 0) {
        this.metrics.averageInterruptionDuration = totalDuration / countWithDuration
      }
    }
  }

  /**
   * Update average latency metric
   */
  private updateAverageLatency(newLatency: number): void {
    // Simple moving average
    const alpha = 0.1 // Smoothing factor
    this.metrics.averageLatency = this.metrics.averageLatency * (1 - alpha) + newLatency * alpha
  }

  /**
   * Get recent interruptions within a time window
   */
  private getRecentInterruptions(windowMs: number): ConnectionInterruption[] {
    const cutoff = new Date(Date.now() - windowMs)
    return this.interruptionHistory.filter(interruption => interruption.timestamp >= cutoff)
  }

  /**
   * Check if a close code indicates a recoverable error
   */
  private isRecoverableCloseCode(code: number): boolean {
    const recoverableCodes = [
      1006, // Abnormal closure
      1011, // Server error
      1012, // Service restart
      1013, // Try again later
      1014 // Bad gateway
    ]

    const nonRecoverableCodes = [
      1002, // Protocol error
      1003, // Unsupported data
      1007, // Invalid frame payload data
      1008, // Policy violation
      1009, // Message too big
      1010 // Mandatory extension
    ]

    if (nonRecoverableCodes.includes(code)) {
      return false
    }

    if (recoverableCodes.includes(code)) {
      return true
    }

    // Default: network-related codes (1000-1999) are generally recoverable
    return code >= 1000 && code < 2000
  }

  /**
   * Clear all timers
   */
  private clearAllTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }

    if (this.qualityCheckTimer) {
      clearInterval(this.qualityCheckTimer)
      this.qualityCheckTimer = null
    }

    if (this.silentFailureTimer) {
      clearTimeout(this.silentFailureTimer)
      this.silentFailureTimer = null
    }

    // Clear all pending pings
    this.pendingPings.clear()
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return {...this.state}
  }

  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    // Update connection duration if still connected
    if (this.state.connectionStart && this.state.isConnected) {
      this.metrics.connectionDuration = Date.now() - this.state.connectionStart.getTime()
    }

    return {...this.metrics}
  }

  /**
   * Get interruption history
   */
  getInterruptionHistory(): ConnectionInterruption[] {
    return [...this.interruptionHistory]
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.state.isHealthy
  }

  /**
   * Check if connection is connected
   */
  isConnected(): boolean {
    return this.state.isConnected
  }

  /**
   * Get current connection quality score (0-1)
   */
  getQuality(): number {
    return this.state.quality
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConnectionMonitorConfig>): void {
    const oldConfig = this.config
    this.config = {...this.config, ...newConfig}

    logger.info('ConnectionMonitor configuration updated', {
      oldConfig,
      newConfig: this.config
    })

    // Restart monitoring if needed
    if (this.isMonitoring && this.ws) {
      this.stopMonitoring()
      this.startMonitoring(this.ws)
    }
  }

  /**
   * Reset all metrics and history
   */
  resetMetrics(): void {
    this.metrics = {
      connectionQuality: 0,
      averageLatency: 0,
      packetLoss: 0,
      interruptionCount: 0,
      lastInterruption: null,
      connectionDuration: 0,
      reconnectionCount: 0,
      maxInterruptionDuration: 0,
      averageInterruptionDuration: 0
    }

    this.interruptionHistory = []
    this.consecutiveTimeouts = 0

    logger.info('ConnectionMonitor metrics reset')

    this.emit('metrics_reset', {timestamp: new Date()})
  }

  /**
   * Force a health check
   */
  forceHealthCheck(): void {
    this.updateConnectionQuality()
    this.sendPing()

    this.emit('health_check_forced', {
      timestamp: new Date(),
      quality: this.state.quality,
      isHealthy: this.state.isHealthy
    })
  }
}

export default ConnectionMonitor
