/**
 * WebSocket Health Monitor
 *
 * Comprehensive health monitoring and diagnostics for WebSocket connections
 * with real-time status tracking, performance metrics, and alerting.
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {WebSocketDiagnostics} from './websocket-diagnostics'
import {LogSanitizer} from './log-sanitizer'

export interface HealthMetrics {
  // Connection health
  connectionState: 'healthy' | 'degraded' | 'critical' | 'disconnected'
  connectionUptime: number
  connectionStability: number // 0-100 score

  // Performance metrics
  latency: {
    current: number
    average: number
    min: number
    max: number
    samples: number[]
  }

  // Message statistics
  messageStats: {
    sent: number
    received: number
    errors: number
    queued: number
    dropped: number
    avgProcessingTime: number
  }

  // Error tracking
  errorStats: {
    total: number
    recent: number // last 5 minutes
    types: Record<string, number>
    severity: Record<'low' | 'medium' | 'high' | 'critical', number>
  }

  // Resource usage
  resourceUsage: {
    memoryUsage: number
    cpuUsage: number
    networkBandwidth: number
    queueSize: number
  }

  // Quality indicators
  qualityScore: number // 0-100 overall health score
  recommendations: string[]
}

export interface HealthThresholds {
  latency: {
    warning: number
    critical: number
  }
  errorRate: {
    warning: number // errors per minute
    critical: number
  }
  connectionStability: {
    warning: number // percentage
    critical: number
  }
  queueSize: {
    warning: number
    critical: number
  }
  memoryUsage: {
    warning: number // MB
    critical: number
  }
}

export interface HealthAlert {
  id: string
  timestamp: number
  severity: 'info' | 'warning' | 'error' | 'critical'
  category: 'connection' | 'performance' | 'error' | 'resource'
  message: string
  metrics: Partial<HealthMetrics>
  acknowledged: boolean
  resolvedAt?: number
}

export interface HealthCheckResult {
  healthy: boolean
  score: number
  issues: Array<{
    category: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    value?: number
    threshold?: number
  }>
  metrics: HealthMetrics
  recommendations: string[]
}

/**
 * WebSocket Health Monitor
 */
export class WebSocketHealthMonitor extends EventEmitter {
  private websocket: WebSocket | null = null
  private diagnostics: WebSocketDiagnostics
  private sanitizer: LogSanitizer
  private isMonitoring = false
  private monitoringInterval: NodeJS.Timeout | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null

  // Health tracking
  private connectionStartTime = 0
  private lastPingTime = 0
  private latencySamples: number[] = []
  private errorCounts = new Map<string, number>()
  private messageStats = {
    sent: 0,
    received: 0,
    errors: 0,
    queued: 0,
    dropped: 0,
    processingTimes: [] as number[]
  }

  // Alert management
  private alerts = new Map<string, HealthAlert>()
  private alertCounter = 0

  // Configuration
  private thresholds: HealthThresholds = {
    latency: {
      warning: 500, // 500ms
      critical: 2000 // 2 seconds
    },
    errorRate: {
      warning: 5, // 5 errors per minute
      critical: 15 // 15 errors per minute
    },
    connectionStability: {
      warning: 95, // 95%
      critical: 85 // 85%
    },
    queueSize: {
      warning: 50,
      critical: 100
    },
    memoryUsage: {
      warning: 100, // 100MB
      critical: 200 // 200MB
    }
  }

  private readonly maxLatencySamples = 100
  private readonly maxProcessingTimeSamples = 100
  private readonly alertRetentionTime = 24 * 60 * 60 * 1000 // 24 hours

  constructor(diagnostics?: WebSocketDiagnostics) {
    super()

    this.diagnostics = diagnostics || new WebSocketDiagnostics()
    this.sanitizer = new LogSanitizer({
      enableSanitization: true,
      redactKeys: ['apiKey', 'token', 'auth', 'password'],
      maxDepth: 10
    })

    logger.info('WebSocket Health Monitor initialized')
  }

  /**
   * Start monitoring a WebSocket connection
   */
  startMonitoring(
    websocket: WebSocket,
    options?: {
      healthCheckInterval?: number
      monitoringInterval?: number
      thresholds?: Partial<HealthThresholds>
    }
  ): void {
    if (this.isMonitoring) {
      this.stopMonitoring()
    }

    this.websocket = websocket
    this.isMonitoring = true
    this.connectionStartTime = Date.now()

    // Update thresholds if provided
    if (options?.thresholds) {
      this.updateThresholds(options.thresholds)
    }

    // Set up WebSocket event listeners
    this.setupWebSocketListeners()

    // Start monitoring intervals
    const healthCheckInterval = options?.healthCheckInterval || 30000 // 30 seconds
    const monitoringInterval = options?.monitoringInterval || 5000 // 5 seconds

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, healthCheckInterval)

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
    }, monitoringInterval)

    logger.info('WebSocket health monitoring started', {
      healthCheckInterval,
      monitoringInterval,
      thresholds: this.sanitizer.sanitize(this.thresholds)
    })

    this.emit('monitoringStarted', {
      timestamp: Date.now(),
      websocketState: websocket.readyState
    })
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    if (this.websocket) {
      this.removeWebSocketListeners()
      this.websocket = null
    }

    logger.info('WebSocket health monitoring stopped')
    this.emit('monitoringStopped', {timestamp: Date.now()})
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthCheckResult {
    if (!this.isMonitoring || !this.websocket) {
      return {
        healthy: false,
        score: 0,
        issues: [
          {
            category: 'connection',
            severity: 'critical',
            message: 'WebSocket not connected or monitoring not started'
          }
        ],
        metrics: this.buildHealthMetrics(),
        recommendations: ['Establish WebSocket connection', 'Start health monitoring']
      }
    }

    return this.performHealthCheck()
  }

  /**
   * Get current metrics
   */
  getMetrics(): HealthMetrics {
    return this.buildHealthMetrics()
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.acknowledged)
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId)
    if (alert) {
      alert.acknowledged = true
      this.emit('alertAcknowledged', alert)
      return true
    }
    return false
  }

  /**
   * Update health thresholds
   */
  updateThresholds(thresholds: Partial<HealthThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds
    }

    logger.info('Health monitoring thresholds updated', {
      thresholds: this.sanitizer.sanitize(this.thresholds)
    })
  }

  /**
   * Perform comprehensive health check
   */
  private performHealthCheck(): HealthCheckResult {
    const metrics = this.buildHealthMetrics()
    const issues: HealthCheckResult['issues'] = []
    const recommendations: string[] = []

    // Check connection state
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      issues.push({
        category: 'connection',
        severity: 'critical',
        message: 'WebSocket connection is not open'
      })
      recommendations.push('Restart WebSocket connection')
    }

    // Check latency
    const currentLatency = metrics.latency.current
    if (currentLatency > this.thresholds.latency.critical) {
      issues.push({
        category: 'performance',
        severity: 'critical',
        message: `High latency detected: ${currentLatency}ms`,
        value: currentLatency,
        threshold: this.thresholds.latency.critical
      })
      recommendations.push('Check network connectivity', 'Consider connection optimization')
    } else if (currentLatency > this.thresholds.latency.warning) {
      issues.push({
        category: 'performance',
        severity: 'medium',
        message: `Elevated latency: ${currentLatency}ms`,
        value: currentLatency,
        threshold: this.thresholds.latency.warning
      })
      recommendations.push('Monitor network performance')
    }

    // Check error rate
    const recentErrors = metrics.errorStats.recent
    if (recentErrors > this.thresholds.errorRate.critical) {
      issues.push({
        category: 'error',
        severity: 'critical',
        message: `High error rate: ${recentErrors} errors/min`,
        value: recentErrors,
        threshold: this.thresholds.errorRate.critical
      })
      recommendations.push('Investigate error causes', 'Check API limits')
    } else if (recentErrors > this.thresholds.errorRate.warning) {
      issues.push({
        category: 'error',
        severity: 'medium',
        message: `Elevated error rate: ${recentErrors} errors/min`,
        value: recentErrors,
        threshold: this.thresholds.errorRate.warning
      })
      recommendations.push('Monitor error patterns')
    }

    // Check connection stability
    const stability = metrics.connectionStability
    if (stability < this.thresholds.connectionStability.critical) {
      issues.push({
        category: 'connection',
        severity: 'critical',
        message: `Low connection stability: ${stability}%`,
        value: stability,
        threshold: this.thresholds.connectionStability.critical
      })
      recommendations.push('Check connection configuration', 'Implement connection pooling')
    } else if (stability < this.thresholds.connectionStability.warning) {
      issues.push({
        category: 'connection',
        severity: 'medium',
        message: `Reduced connection stability: ${stability}%`,
        value: stability,
        threshold: this.thresholds.connectionStability.warning
      })
      recommendations.push('Monitor connection patterns')
    }

    // Check queue size
    const queueSize = metrics.resourceUsage.queueSize
    if (queueSize > this.thresholds.queueSize.critical) {
      issues.push({
        category: 'resource',
        severity: 'critical',
        message: `Queue size critical: ${queueSize}`,
        value: queueSize,
        threshold: this.thresholds.queueSize.critical
      })
      recommendations.push('Increase message processing rate', 'Check for bottlenecks')
    } else if (queueSize > this.thresholds.queueSize.warning) {
      issues.push({
        category: 'resource',
        severity: 'medium',
        message: `Queue size elevated: ${queueSize}`,
        value: queueSize,
        threshold: this.thresholds.queueSize.warning
      })
      recommendations.push('Monitor queue growth')
    }

    // Calculate overall health score
    const maxScore = 100
    let score = maxScore

    issues.forEach(issue => {
      switch (issue.severity) {
        case 'critical':
          score -= 25
          break
        case 'high':
          score -= 15
          break
        case 'medium':
          score -= 10
          break
        case 'low':
          score -= 5
          break
      }
    })

    score = Math.max(0, score)
    const healthy = score >= 70 && issues.every(issue => issue.severity !== 'critical')

    // Generate alerts for new issues
    this.generateAlerts(issues)

    const result: HealthCheckResult = {
      healthy,
      score,
      issues,
      metrics,
      recommendations: [...new Set(recommendations)]
    }

    this.emit('healthCheck', result)

    logger.debug('Health check completed', {
      healthy,
      score,
      issueCount: issues.length,
      criticalIssues: issues.filter(i => i.severity === 'critical').length
    })

    return result
  }

  /**
   * Collect performance and resource metrics
   */
  private collectMetrics(): void {
    if (!this.websocket || !this.isMonitoring) {
      return
    }

    // Measure latency with ping
    this.measureLatency()

    // Clean up old data
    this.cleanupOldData()

    // Emit metrics update
    this.emit('metricsUpdated', this.buildHealthMetrics())
  }

  /**
   * Measure connection latency
   */
  private measureLatency(): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return
    }

    const pingStart = Date.now()
    this.lastPingTime = pingStart

    // Send a small ping message
    try {
      this.websocket.send(
        JSON.stringify({
          type: 'ping',
          timestamp: pingStart
        })
      )
    } catch (error) {
      logger.warn('Failed to send ping for latency measurement', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Build comprehensive health metrics
   */
  private buildHealthMetrics(): HealthMetrics {
    const now = Date.now()

    // Calculate latency statistics
    const latencyStats = this.calculateLatencyStats()

    // Calculate error statistics
    const errorStats = this.calculateErrorStats()

    // Calculate connection stability
    const stability = this.calculateConnectionStability()

    // Calculate resource usage (mock values - implement actual measurement as needed)
    const resourceUsage = {
      memoryUsage: process.memoryUsage?.()?.heapUsed / 1024 / 1024 || 0, // MB
      cpuUsage: 0, // Would need actual CPU monitoring
      networkBandwidth: 0, // Would need actual network monitoring
      queueSize: this.messageStats.queued
    }

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(latencyStats, errorStats, stability)

    // Generate recommendations
    const recommendations = this.generateRecommendations()

    return {
      connectionState: this.determineConnectionState(),
      connectionUptime: this.connectionStartTime ? now - this.connectionStartTime : 0,
      connectionStability: stability,
      latency: latencyStats,
      messageStats: {
        sent: this.messageStats.sent,
        received: this.messageStats.received,
        errors: this.messageStats.errors,
        queued: this.messageStats.queued,
        dropped: this.messageStats.dropped,
        avgProcessingTime: this.calculateAverageProcessingTime()
      },
      errorStats,
      resourceUsage,
      qualityScore,
      recommendations
    }
  }

  /**
   * Calculate latency statistics
   */
  private calculateLatencyStats() {
    if (this.latencySamples.length === 0) {
      return {
        current: 0,
        average: 0,
        min: 0,
        max: 0,
        samples: []
      }
    }

    const samples = [...this.latencySamples]
    const current = samples[samples.length - 1] || 0
    const average = samples.reduce((sum, val) => sum + val, 0) / samples.length
    const min = Math.min(...samples)
    const max = Math.max(...samples)

    return {
      current,
      average: Math.round(average),
      min,
      max,
      samples
    }
  }

  /**
   * Calculate error statistics
   */
  private calculateErrorStats() {
    let total = 0
    let recent = 0
    const types: Record<string, number> = {}
    const severity = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    }

    this.errorCounts.forEach((count, errorType) => {
      total += count
      types[errorType] = count

      // For simplicity, categorize errors by type
      if (errorType.includes('timeout') || errorType.includes('network')) {
        severity.medium += count
      } else if (errorType.includes('auth') || errorType.includes('forbidden')) {
        severity.high += count
      } else if (errorType.includes('fatal') || errorType.includes('critical')) {
        severity.critical += count
      } else {
        severity.low += count
      }
    })

    // Estimate recent errors (simplified)
    recent = Math.floor(total * 0.1) // Assume 10% of errors are recent

    return {
      total,
      recent,
      types,
      severity
    }
  }

  /**
   * Calculate connection stability percentage
   */
  private calculateConnectionStability(): number {
    if (!this.connectionStartTime) {
      return 0
    }

    const totalErrors = this.messageStats.errors
    const totalMessages = this.messageStats.sent + this.messageStats.received

    if (totalMessages === 0) {
      return 100
    }

    const errorRate = totalErrors / totalMessages
    const stability = Math.max(0, 100 - errorRate * 100)

    return Math.round(stability)
  }

  /**
   * Calculate overall quality score
   */
  private calculateQualityScore(
    latencyStats: ReturnType<typeof this.calculateLatencyStats>,
    errorStats: ReturnType<typeof this.calculateErrorStats>,
    stability: number
  ): number {
    let score = 100

    // Latency impact (30% weight)
    const latencyScore = Math.max(0, 100 - latencyStats.average / 10)
    score = score * 0.7 + latencyScore * 0.3

    // Error rate impact (25% weight)
    const errorRate =
      errorStats.total / Math.max(1, this.messageStats.sent + this.messageStats.received)
    const errorScore = Math.max(0, 100 - errorRate * 100)
    score = score * 0.75 + errorScore * 0.25

    // Stability impact (45% weight)
    score = score * 0.55 + stability * 0.45

    return Math.round(Math.max(0, Math.min(100, score)))
  }

  /**
   * Determine current connection state
   */
  private determineConnectionState(): HealthMetrics['connectionState'] {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return 'disconnected'
    }

    const latency = this.latencySamples[this.latencySamples.length - 1] || 0
    const errorRate = this.messageStats.errors / Math.max(1, this.messageStats.sent)

    if (latency > this.thresholds.latency.critical || errorRate > 0.1) {
      return 'critical'
    } else if (latency > this.thresholds.latency.warning || errorRate > 0.05) {
      return 'degraded'
    } else {
      return 'healthy'
    }
  }

  /**
   * Generate health recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = []
    const metrics = this.buildHealthMetrics()

    if (metrics.latency.average > this.thresholds.latency.warning) {
      recommendations.push('Consider using a CDN or edge server closer to your location')
    }

    if (metrics.errorStats.total > 10) {
      recommendations.push('Review error logs to identify common failure patterns')
    }

    if (metrics.connectionStability < 95) {
      recommendations.push('Implement exponential backoff for reconnection attempts')
    }

    if (metrics.resourceUsage.queueSize > 20) {
      recommendations.push('Increase message processing rate or implement queue sharding')
    }

    if (metrics.qualityScore < 80) {
      recommendations.push('Enable detailed logging to identify performance bottlenecks')
    }

    return recommendations
  }

  /**
   * Calculate average processing time
   */
  private calculateAverageProcessingTime(): number {
    if (this.messageStats.processingTimes.length === 0) {
      return 0
    }

    const sum = this.messageStats.processingTimes.reduce((acc, time) => acc + time, 0)
    return Math.round(sum / this.messageStats.processingTimes.length)
  }

  /**
   * Generate alerts for health issues
   */
  private generateAlerts(issues: HealthCheckResult['issues']): void {
    issues.forEach(issue => {
      if (issue.severity === 'critical' || issue.severity === 'high') {
        const alertId = `health_${++this.alertCounter}_${Date.now()}`
        const alert: HealthAlert = {
          id: alertId,
          timestamp: Date.now(),
          severity: issue.severity === 'critical' ? 'critical' : 'error',
          category: issue.category as HealthAlert['category'],
          message: issue.message,
          metrics: this.buildHealthMetrics(),
          acknowledged: false
        }

        this.alerts.set(alertId, alert)
        this.emit('healthAlert', alert)

        logger.warn('Health alert generated', {
          alertId,
          severity: alert.severity,
          category: alert.category,
          message: alert.message
        })
      }
    })
  }

  /**
   * Set up WebSocket event listeners
   */
  private setupWebSocketListeners(): void {
    if (!this.websocket) return

    this.websocket.addEventListener('message', this.handleMessage.bind(this))
    this.websocket.addEventListener('error', this.handleError.bind(this))
    this.websocket.addEventListener('close', this.handleClose.bind(this))
  }

  /**
   * Remove WebSocket event listeners
   */
  private removeWebSocketListeners(): void {
    if (!this.websocket) return

    this.websocket.removeEventListener('message', this.handleMessage.bind(this))
    this.websocket.removeEventListener('error', this.handleError.bind(this))
    this.websocket.removeEventListener('close', this.handleClose.bind(this))
  }

  /**
   * Handle WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    this.messageStats.received++

    try {
      const data = JSON.parse(event.data)

      // Handle pong responses for latency measurement
      if (data.type === 'pong' && data.timestamp) {
        const latency = Date.now() - data.timestamp
        this.addLatencySample(latency)
      }
    } catch {
      // Not a JSON message or pong response
    }
  }

  /**
   * Handle WebSocket errors
   */
  private handleError(): void {
    this.messageStats.errors++

    const errorType = 'websocket_error'
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1)
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent): void {
    const errorType = `close_${event.code}`
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1)
  }

  /**
   * Add latency sample
   */
  private addLatencySample(latency: number): void {
    this.latencySamples.push(latency)

    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift()
    }
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const now = Date.now()

    // Clean up old alerts
    for (const [alertId, alert] of this.alerts.entries()) {
      if (now - alert.timestamp > this.alertRetentionTime) {
        this.alerts.delete(alertId)
      }
    }

    // Clean up old processing times
    if (this.messageStats.processingTimes.length > this.maxProcessingTimeSamples) {
      this.messageStats.processingTimes = this.messageStats.processingTimes.slice(
        -this.maxProcessingTimeSamples
      )
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopMonitoring()
    this.alerts.clear()
    this.errorCounts.clear()
    this.latencySamples.length = 0
    this.messageStats.processingTimes.length = 0
    this.removeAllListeners()

    logger.info('WebSocket Health Monitor cleaned up')
  }
}

// Export factory function
export function createHealthMonitor(diagnostics?: WebSocketDiagnostics): WebSocketHealthMonitor {
  return new WebSocketHealthMonitor(diagnostics)
}
