/**
 * Comprehensive WebSocket Diagnostics and Logging System
 * Provides detailed monitoring, logging, and status tracking for WebSocket connections
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

export interface ConnectionMetrics {
  connectionId: string
  startTime: number
  endTime?: number
  totalConnections: number
  successfulConnections: number
  failedConnections: number
  reconnectionAttempts: number
  totalReconnections: number
  averageConnectionTime: number
  lastConnectionLatency: number
  bytesReceived: number
  bytesSent: number
  messagesReceived: number
  messagesSent: number
  errorsCount: number
  lastError?: string
  lastErrorTimestamp?: number
  uptime: number
  heartbeatsSent: number
  heartbeatsReceived: number
  connectionDrops: number
}

export interface WebSocketEvent {
  id: string
  connectionId: string
  timestamp: number
  type: 'connection' | 'message' | 'error' | 'heartbeat' | 'close' | 'custom'
  event: string
  data?: any
  duration?: number
  level: 'info' | 'warn' | 'error' | 'debug'
}

export interface ConnectionStatusInfo {
  state: string
  connectionId: string
  connected: boolean
  uptime: number
  lastActivity: number
  metrics: ConnectionMetrics
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    score: number // 0-100
    issues: string[]
    lastCheck: number
  }
  performance: {
    latency: number
    throughput: number
    errorRate: number
    reliability: number
  }
}

/**
 * WebSocket Diagnostics Logger with structured logging and metrics collection
 */
export class WebSocketDiagnosticsLogger extends EventEmitter {
  private connectionId: string
  private events: WebSocketEvent[] = []
  private metrics: ConnectionMetrics
  private maxEventHistory = 1000
  private healthCheckInterval = 30000 // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout
  private dashboardUpdateInterval = 5000 // 5 seconds
  private dashboardTimer?: NodeJS.Timeout

  constructor(connectionId?: string) {
    super()
    this.connectionId = connectionId || this.generateConnectionId()
    this.metrics = this.initializeMetrics()
    this.startHealthMonitoring()
    this.startDashboardUpdates()
  }

  private generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  private initializeMetrics(): ConnectionMetrics {
    return {
      connectionId: this.connectionId,
      startTime: Date.now(),
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      reconnectionAttempts: 0,
      totalReconnections: 0,
      averageConnectionTime: 0,
      lastConnectionLatency: 0,
      bytesReceived: 0,
      bytesSent: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errorsCount: 0,
      uptime: 0,
      heartbeatsSent: 0,
      heartbeatsReceived: 0,
      connectionDrops: 0
    }
  }

  /**
   * Log a WebSocket event with detailed context
   */
  logEvent(
    event: string,
    type: WebSocketEvent['type'] = 'custom',
    level: WebSocketEvent['level'] = 'info',
    data?: any,
    duration?: number
  ): string {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

    const wsEvent: WebSocketEvent = {
      id: eventId,
      connectionId: this.connectionId,
      timestamp: Date.now(),
      type,
      event,
      data: this.sanitizeEventData(data),
      duration,
      level
    }

    this.events.push(wsEvent)

    // Trim event history if it gets too large
    if (this.events.length > this.maxEventHistory) {
      this.events = this.events.slice(-this.maxEventHistory)
    }

    // Log to console/external logging
    this.logToConsole(wsEvent)

    // Emit event for real-time monitoring
    this.emit('diagnosticEvent', wsEvent)

    return eventId
  }

  private sanitizeEventData(data: any): any {
    if (!data) return undefined

    try {
      // Deep clone and sanitize sensitive information
      const sanitized = JSON.parse(JSON.stringify(data))

      // Remove sensitive fields
      if (sanitized.apiKey) {
        sanitized.apiKey = '[REDACTED]'
      }
      if (sanitized.token) {
        sanitized.token = '[REDACTED]'
      }
      if (sanitized.authorization) {
        sanitized.authorization = '[REDACTED]'
      }

      // Limit data size for logging
      const serialized = JSON.stringify(sanitized)
      if (serialized.length > 1000) {
        return {
          truncated: true,
          size: serialized.length,
          preview: serialized.substring(0, 500) + '...'
        }
      }

      return sanitized
    } catch (error) {
      return {error: 'Failed to serialize event data', type: typeof data}
    }
  }

  private logToConsole(event: WebSocketEvent): void {
    const logMessage = `[WS-${this.connectionId.substring(0, 8)}] ${event.event}`
    const logData = {
      eventId: event.id,
      timestamp: new Date(event.timestamp).toISOString(),
      duration: event.duration,
      data: event.data
    }

    switch (event.level) {
      case 'error':
        logger.error(logMessage, logData)
        break
      case 'warn':
        logger.warn(logMessage, logData)
        break
      case 'debug':
        logger.debug(logMessage, logData)
        break
      default:
        logger.info(logMessage, logData)
    }
  }

  /**
   * Connection lifecycle event logging
   */
  onConnectionStart(): string {
    this.metrics.totalConnections++
    const startTime = Date.now()

    return this.logEvent('connection_start', 'connection', 'info', {
      attempt: this.metrics.totalConnections,
      timestamp: startTime
    })
  }

  onConnectionEstablished(latency?: number): string {
    this.metrics.successfulConnections++
    if (latency !== undefined) {
      this.metrics.lastConnectionLatency = latency
      this.updateAverageConnectionTime(latency)
    }

    return this.logEvent(
      'connection_established',
      'connection',
      'info',
      {
        latency,
        successRate:
          ((this.metrics.successfulConnections / this.metrics.totalConnections) * 100).toFixed(2) +
          '%'
      },
      latency
    )
  }

  onConnectionFailed(error: any): string {
    this.metrics.failedConnections++
    this.metrics.errorsCount++
    this.metrics.lastError = sanitizeLogMessage(error?.message || 'Unknown error')
    this.metrics.lastErrorTimestamp = Date.now()

    return this.logEvent('connection_failed', 'connection', 'error', {
      error: this.metrics.lastError,
      failureRate:
        ((this.metrics.failedConnections / this.metrics.totalConnections) * 100).toFixed(2) + '%'
    })
  }

  onConnectionClosed(code: number, reason: string, wasClean: boolean): string {
    if (!wasClean) {
      this.metrics.connectionDrops++
    }
    this.metrics.endTime = Date.now()

    return this.logEvent('connection_closed', 'connection', 'info', {
      code,
      reason: sanitizeLogMessage(reason),
      wasClean,
      connectionDrops: this.metrics.connectionDrops,
      duration: this.getConnectionDuration()
    })
  }

  onReconnectionAttempt(attempt: number, delay: number): string {
    this.metrics.reconnectionAttempts++

    return this.logEvent('reconnection_attempt', 'connection', 'info', {
      attempt,
      delay,
      totalAttempts: this.metrics.reconnectionAttempts
    })
  }

  onReconnectionSuccess(): string {
    this.metrics.totalReconnections++

    return this.logEvent('reconnection_success', 'connection', 'info', {
      totalReconnections: this.metrics.totalReconnections
    })
  }

  /**
   * Message event logging
   */
  onMessageSent(message: any, size: number): string {
    this.metrics.messagesSent++
    this.metrics.bytesSent += size

    return this.logEvent('message_sent', 'message', 'debug', {
      messageType: message?.type || 'unknown',
      size,
      totalMessages: this.metrics.messagesSent,
      totalBytes: this.metrics.bytesSent
    })
  }

  onMessageReceived(message: any, size: number): string {
    this.metrics.messagesReceived++
    this.metrics.bytesReceived += size

    return this.logEvent('message_received', 'message', 'debug', {
      messageType: message?.type || 'unknown',
      size,
      totalMessages: this.metrics.messagesReceived,
      totalBytes: this.metrics.bytesReceived
    })
  }

  onMessageError(error: any, message?: any): string {
    this.metrics.errorsCount++

    return this.logEvent('message_error', 'message', 'error', {
      error: sanitizeLogMessage(error?.message || 'Unknown message error'),
      messageType: message?.type
    })
  }

  /**
   * Heartbeat event logging
   */
  onHeartbeatSent(): string {
    this.metrics.heartbeatsSent++

    return this.logEvent('heartbeat_sent', 'heartbeat', 'debug', {
      totalSent: this.metrics.heartbeatsSent
    })
  }

  onHeartbeatReceived(latency?: number): string {
    this.metrics.heartbeatsReceived++

    return this.logEvent('heartbeat_received', 'heartbeat', 'debug', {
      latency,
      totalReceived: this.metrics.heartbeatsReceived,
      responseRate:
        ((this.metrics.heartbeatsReceived / this.metrics.heartbeatsSent) * 100).toFixed(2) + '%'
    })
  }

  onHeartbeatTimeout(): string {
    return this.logEvent('heartbeat_timeout', 'heartbeat', 'warn', {
      missedHeartbeats: this.metrics.heartbeatsSent - this.metrics.heartbeatsReceived
    })
  }

  /**
   * Error event logging
   */
  onError(error: any, context?: string): string {
    this.metrics.errorsCount++
    this.metrics.lastError = sanitizeLogMessage(error?.message || 'Unknown error')
    this.metrics.lastErrorTimestamp = Date.now()

    return this.logEvent('error_occurred', 'error', 'error', {
      error: this.metrics.lastError,
      context: context ? sanitizeLogMessage(context) : undefined,
      totalErrors: this.metrics.errorsCount
    })
  }

  /**
   * Get current connection metrics
   */
  getMetrics(): ConnectionMetrics {
    this.metrics.uptime = this.getConnectionDuration()
    return {...this.metrics}
  }

  /**
   * Get connection status with health assessment
   */
  getConnectionStatus(): ConnectionStatusInfo {
    const metrics = this.getMetrics()
    const health = this.assessConnectionHealth()
    const performance = this.calculatePerformanceMetrics()

    return {
      state: 'connected', // This should be updated by the client
      connectionId: this.connectionId,
      connected: true, // This should be updated by the client
      uptime: metrics.uptime,
      lastActivity: Date.now(),
      metrics,
      health,
      performance
    }
  }

  private assessConnectionHealth(): ConnectionStatusInfo['health'] {
    const issues: string[] = []
    let score = 100

    // Check error rate
    const errorRate = this.getErrorRate()
    if (errorRate > 0.1) {
      // > 10% error rate
      issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`)
      score -= 30
    } else if (errorRate > 0.05) {
      // > 5% error rate
      issues.push(`Elevated error rate: ${(errorRate * 100).toFixed(1)}%`)
      score -= 15
    }

    // Check connection stability
    if (this.metrics.connectionDrops > 3) {
      issues.push(`Frequent connection drops: ${this.metrics.connectionDrops}`)
      score -= 20
    }

    // Check heartbeat response rate
    const heartbeatRate =
      this.metrics.heartbeatsSent > 0
        ? this.metrics.heartbeatsReceived / this.metrics.heartbeatsSent
        : 1
    if (heartbeatRate < 0.8) {
      // < 80% heartbeat response rate
      issues.push(`Poor heartbeat response rate: ${(heartbeatRate * 100).toFixed(1)}%`)
      score -= 25
    }

    // Check recent errors
    if (this.metrics.lastErrorTimestamp && Date.now() - this.metrics.lastErrorTimestamp < 60000) {
      issues.push('Recent error detected')
      score -= 10
    }

    score = Math.max(0, score)

    let status: 'healthy' | 'degraded' | 'unhealthy'
    if (score >= 80) {
      status = 'healthy'
    } else if (score >= 50) {
      status = 'degraded'
    } else {
      status = 'unhealthy'
    }

    return {
      status,
      score,
      issues,
      lastCheck: Date.now()
    }
  }

  private calculatePerformanceMetrics(): ConnectionStatusInfo['performance'] {
    const latency = this.metrics.lastConnectionLatency || 0
    const throughput = this.getThroughput()
    const errorRate = this.getErrorRate()
    const reliability = this.getReliabilityScore()

    return {
      latency,
      throughput,
      errorRate,
      reliability
    }
  }

  private getErrorRate(): number {
    const totalMessages = this.metrics.messagesSent + this.metrics.messagesReceived
    return totalMessages > 0 ? this.metrics.errorsCount / totalMessages : 0
  }

  private getThroughput(): number {
    const durationSeconds = this.getConnectionDuration() / 1000
    return durationSeconds > 0
      ? (this.metrics.messagesReceived + this.metrics.messagesSent) / durationSeconds
      : 0
  }

  private getReliabilityScore(): number {
    const totalAttempts = this.metrics.totalConnections
    const successRate = totalAttempts > 0 ? this.metrics.successfulConnections / totalAttempts : 0

    // Factor in connection drops
    const stabilityFactor = Math.max(0, 1 - this.metrics.connectionDrops * 0.1)

    return successRate * stabilityFactor * 100
  }

  private getConnectionDuration(): number {
    const endTime = this.metrics.endTime || Date.now()
    return endTime - this.metrics.startTime
  }

  private updateAverageConnectionTime(latency: number): void {
    const totalLatency =
      this.metrics.averageConnectionTime * (this.metrics.successfulConnections - 1) + latency
    this.metrics.averageConnectionTime = totalLatency / this.metrics.successfulConnections
  }

  /**
   * Search and filter events
   */
  getEvents(filter?: {
    type?: WebSocketEvent['type']
    level?: WebSocketEvent['level']
    since?: number
    limit?: number
  }): WebSocketEvent[] {
    let filtered = [...this.events]

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter(event => event.type === filter.type)
      }
      if (filter.level) {
        filtered = filtered.filter(event => event.level === filter.level)
      }
      if (filter.since) {
        filtered = filtered.filter(event => event.timestamp >= filter.since!)
      }
      if (filter.limit) {
        filtered = filtered.slice(-filter.limit)
      }
    }

    return filtered
  }

  /**
   * Get recent errors
   */
  getRecentErrors(since: number = Date.now() - 300000): WebSocketEvent[] {
    // Last 5 minutes
    return this.getEvents({
      level: 'error',
      since
    })
  }

  /**
   * Export diagnostics data for analysis
   */
  exportDiagnostics(): {
    connectionId: string
    metrics: ConnectionMetrics
    status: ConnectionStatusInfo
    recentEvents: WebSocketEvent[]
    recentErrors: WebSocketEvent[]
  } {
    return {
      connectionId: this.connectionId,
      metrics: this.getMetrics(),
      status: this.getConnectionStatus(),
      recentEvents: this.getEvents({limit: 50}),
      recentErrors: this.getRecentErrors()
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      const status = this.getConnectionStatus()
      this.emit('healthCheck', status)

      // Log health issues
      if (status.health.status !== 'healthy') {
        this.logEvent('health_check_warning', 'custom', 'warn', {
          healthStatus: status.health.status,
          score: status.health.score,
          issues: status.health.issues
        })
      }
    }, this.healthCheckInterval)
  }

  /**
   * Start dashboard updates
   */
  private startDashboardUpdates(): void {
    this.dashboardTimer = setInterval(() => {
      const status = this.getConnectionStatus()
      this.emit('dashboardUpdate', status)
    }, this.dashboardUpdateInterval)
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }

    if (this.dashboardTimer) {
      clearInterval(this.dashboardTimer)
      this.dashboardTimer = undefined
    }

    this.removeAllListeners()
    this.events.length = 0
  }
}

/**
 * Real-time Connection Status Dashboard
 * Provides a simple UI for monitoring WebSocket connection status
 */
export class WebSocketStatusDashboard {
  private diagnostics: WebSocketDiagnosticsLogger
  private updateInterval = 1000 // 1 second
  private updateTimer?: NodeJS.Timeout
  private isActive = false

  constructor(diagnostics: WebSocketDiagnosticsLogger) {
    this.diagnostics = diagnostics

    // Listen for diagnostic events
    this.diagnostics.on('dashboardUpdate', this.handleStatusUpdate.bind(this))
    this.diagnostics.on('diagnosticEvent', this.handleDiagnosticEvent.bind(this))
  }

  /**
   * Start the dashboard (in a browser environment, this would create DOM elements)
   */
  start(): void {
    if (this.isActive) return

    this.isActive = true
    console.log('🔧 WebSocket Status Dashboard Started')
    console.log('📊 Use dashboard.getStatus() to view current status')
    console.log('📈 Use dashboard.getMetrics() to view detailed metrics')

    this.updateTimer = setInterval(() => {
      this.displayStatus()
    }, this.updateInterval)
  }

  /**
   * Stop the dashboard
   */
  stop(): void {
    if (!this.isActive) return

    this.isActive = false
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = undefined
    }

    console.log('🔧 WebSocket Status Dashboard Stopped')
  }

  private handleStatusUpdate(status: ConnectionStatusInfo): void {
    // In a real UI, this would update DOM elements
    // For now, we'll emit the status for consumption by other components
    if (status.health.status !== 'healthy') {
      console.warn('⚠️  WebSocket Health Issue:', status.health.issues.join(', '))
    }
  }

  private handleDiagnosticEvent(event: WebSocketEvent): void {
    // Real-time event handling for the dashboard
    if (event.level === 'error') {
      console.error(`🚨 WebSocket Error: ${event.event}`, event.data)
    }
  }

  private displayStatus(): void {
    const status = this.diagnostics.getConnectionStatus()

    // Simple console-based status display
    const healthIcon = this.getHealthIcon(status.health.status)
    const uptimeFormatted = this.formatDuration(status.uptime)

    // Only log significant status changes to avoid spam
    const shouldLog =
      status.health.status !== 'healthy' || status.metrics.errorsCount > 0 || Math.random() < 0.01 // 1% chance for periodic updates

    if (shouldLog) {
      console.log(
        `${healthIcon} WebSocket Status: ${status.health.status.toUpperCase()} (Score: ${status.health.score}/100) | Uptime: ${uptimeFormatted} | Errors: ${status.metrics.errorsCount}`
      )
    }
  }

  private getHealthIcon(status: string): string {
    switch (status) {
      case 'healthy':
        return '✅'
      case 'degraded':
        return '⚠️'
      case 'unhealthy':
        return '❌'
      default:
        return '❓'
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * Get current status for external consumption
   */
  getStatus(): ConnectionStatusInfo {
    return this.diagnostics.getConnectionStatus()
  }

  /**
   * Get detailed metrics for external consumption
   */
  getMetrics(): ConnectionMetrics {
    return this.diagnostics.getMetrics()
  }

  /**
   * Get recent events for troubleshooting
   */
  getRecentEvents(limit: number = 20): WebSocketEvent[] {
    return this.diagnostics.getEvents({limit})
  }

  /**
   * Export all diagnostic data
   */
  exportDiagnostics(): any {
    return this.diagnostics.exportDiagnostics()
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop()
    this.diagnostics.removeAllListeners()
  }
}

export default WebSocketDiagnosticsLogger
