/**
 * Unified Telemetry System for WebSocket Transcription Protection
 * Integrates EmergencyCircuitBreaker, DuplicateRequestDetector, and GeminiErrorHandler
 * Provides comprehensive monitoring, metrics collection, and alerting
 */

import {EventEmitter} from 'events'
import {EmergencyCircuitBreaker} from '../utils/EmergencyCircuitBreaker'
import {DuplicateRequestDetector} from '../utils/DuplicateRequestDetector'
import GeminiErrorHandler, {LogLevel, GeminiError} from './gemini-error-handler'

export interface TelemetryMetrics {
  // Performance metrics
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  currentResponseTime: number

  // Protection metrics
  circuitBreakerTrips: number
  duplicateRequestsBlocked: number
  stackOverflowsPrevented: number
  totalProtectionEvents: number

  // System health metrics
  memoryUsage: number
  cpuUsage: number
  connectionHealth: number
  errorRate: number

  // Temporal metrics
  requestsPerMinute: number
  errorsPerMinute: number
  recoveryTime: number
  uptime: number
}

export interface AlertRule {
  id: string
  name: string
  condition: (metrics: TelemetryMetrics) => boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  enabled: boolean
  cooldownPeriod: number // milliseconds
  lastTriggered?: number
}

export interface TelemetryEvent {
  id: string
  timestamp: number
  type: 'request' | 'error' | 'protection' | 'recovery' | 'system'
  category: string
  message: string
  metadata: Record<string, unknown>
  severity: 'info' | 'warning' | 'error' | 'critical'
  emoji?: string
}

export interface ProtectionStatus {
  circuitBreakers: Record<string, unknown>
  duplicateDetector: Record<string, unknown>
  emergencyBreaker: Record<string, unknown>
}

export interface DashboardData {
  metrics: TelemetryMetrics
  events: TelemetryEvent[]
  alerts: AlertRule[]
  recentErrors: GeminiError[]
  protectionStatus: ProtectionStatus
}

/**
 * Comprehensive telemetry system for WebSocket transcription monitoring
 */
export class UnifiedTelemetrySystem extends EventEmitter {
  private static instance: UnifiedTelemetrySystem

  private metrics: TelemetryMetrics
  private events: TelemetryEvent[] = []
  private alerts: AlertRule[] = []
  private eventIdCounter = 0
  private startTime = Date.now()

  // Integrated components
  private emergencyBreaker: EmergencyCircuitBreaker
  private duplicateDetector: DuplicateRequestDetector
  private errorHandler: GeminiErrorHandler

  // Configuration
  private maxEvents = 1000
  private maxEventAge = 24 * 60 * 60 * 1000 // 24 hours
  private metricsUpdateInterval = 5000 // 5 seconds
  private intervalId?: NodeJS.Timeout

  // Performance tracking
  private requestTimes: number[] = []
  private requestTimestamps: number[] = []
  private errorTimestamps: number[] = []

  private constructor() {
    super()

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      currentResponseTime: 0,
      circuitBreakerTrips: 0,
      duplicateRequestsBlocked: 0,
      stackOverflowsPrevented: 0,
      totalProtectionEvents: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      connectionHealth: 100,
      errorRate: 0,
      requestsPerMinute: 0,
      errorsPerMinute: 0,
      recoveryTime: 0,
      uptime: 0
    }

    // Initialize integrated components
    this.emergencyBreaker = EmergencyCircuitBreaker.getInstance()
    this.duplicateDetector = DuplicateRequestDetector.getInstance()
    this.errorHandler = new GeminiErrorHandler({
      logLevel: LogLevel.INFO,
      maxErrorHistory: 1000
    })

    this.setupIntegrations()
    this.setupDefaultAlerts()
    this.startMetricsCollection()
  }

  public static getInstance(): UnifiedTelemetrySystem {
    if (!UnifiedTelemetrySystem.instance) {
      UnifiedTelemetrySystem.instance = new UnifiedTelemetrySystem()
    }
    return UnifiedTelemetrySystem.instance
  }

  /**
   * Setup integrations with protection systems
   */
  private setupIntegrations(): void {
    // Setup window event listeners for emergency breaker events
    if (typeof window !== 'undefined') {
      window.addEventListener('emergency-circuit-breaker-trip', (event: Event) => {
        const customEvent = event as CustomEvent
        this.metrics.circuitBreakerTrips++
        this.metrics.totalProtectionEvents++

        this.addEvent({
          type: 'protection',
          category: 'circuit_breaker',
          message: `� Circuit breaker opened for ${customEvent.detail?.functionName || 'unknown'}`,
          metadata: customEvent.detail || {},
          severity: 'error',
          emoji: '�'
        })

        this.checkAlerts()
      })
    }

    // Listen to error handler events
    this.errorHandler.on('error', (error: GeminiError) => {
      this.metrics.failedRequests++
      this.errorTimestamps.push(Date.now())

      this.addEvent({
        type: 'error',
        category: error.type,
        message: `❌ ${error.message}`,
        metadata: {error: error.type, code: error.code},
        severity: 'error',
        emoji: '❌'
      })

      this.checkAlerts()
    })

    this.errorHandler.on('recovery:success', (data: unknown) => {
      this.addEvent({
        type: 'recovery',
        category: 'error_recovery',
        message: `✅ Successfully recovered from error`,
        metadata: data as Record<string, unknown>,
        severity: 'info',
        emoji: '✅'
      })
    })
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultAlerts(): void {
    this.alerts = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: metrics => metrics.errorRate > 10,
        severity: 'high',
        description: 'Error rate exceeds 10%',
        enabled: true,
        cooldownPeriod: 60000 // 1 minute
      },
      {
        id: 'circuit_breaker_storm',
        name: 'Circuit Breaker Storm',
        condition: metrics => metrics.circuitBreakerTrips > 5,
        severity: 'critical',
        description: 'Multiple circuit breaker trips detected',
        enabled: true,
        cooldownPeriod: 300000 // 5 minutes
      },
      {
        id: 'stack_overflow_pattern',
        name: 'Stack Overflow Pattern',
        condition: metrics => metrics.stackOverflowsPrevented > 3,
        severity: 'high',
        description: 'Recurring stack overflow attempts',
        enabled: true,
        cooldownPeriod: 120000 // 2 minutes
      },
      {
        id: 'high_duplicate_rate',
        name: 'High Duplicate Request Rate',
        condition: metrics => metrics.duplicateRequestsBlocked > 20,
        severity: 'medium',
        description: 'High number of duplicate requests blocked',
        enabled: true,
        cooldownPeriod: 180000 // 3 minutes
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        condition: metrics => metrics.averageResponseTime > 5000,
        severity: 'medium',
        description: 'Average response time exceeds 5 seconds',
        enabled: true,
        cooldownPeriod: 60000 // 1 minute
      },
      {
        id: 'connection_degradation',
        name: 'Connection Health Degradation',
        condition: metrics => metrics.connectionHealth < 70,
        severity: 'high',
        description: 'Connection health below 70%',
        enabled: true,
        cooldownPeriod: 120000 // 2 minutes
      }
    ]
  }

  /**
   * Start automatic metrics collection
   */
  private startMetricsCollection(): void {
    this.intervalId = setInterval(() => {
      this.updateMetrics()
      this.cleanupOldData()
      this.checkAlerts()
    }, this.metricsUpdateInterval)
  }

  /**
   * Update all metrics
   */
  private updateMetrics(): void {
    const now = Date.now()

    // Update uptime
    this.metrics.uptime = now - this.startTime

    // Calculate temporal metrics
    const oneMinuteAgo = now - 60000
    this.metrics.requestsPerMinute = this.requestTimestamps.filter(t => t > oneMinuteAgo).length
    this.metrics.errorsPerMinute = this.errorTimestamps.filter(t => t > oneMinuteAgo).length

    // Calculate error rate
    if (this.metrics.totalRequests > 0) {
      this.metrics.errorRate = (this.metrics.failedRequests / this.metrics.totalRequests) * 100
    }

    // Calculate average response time
    if (this.requestTimes.length > 0) {
      this.metrics.averageResponseTime =
        this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length
    }

    // Update system metrics (simplified - would need real system monitoring)
    this.updateSystemMetrics()

    // Get protection system status
    this.updateProtectionMetrics()

    // Emit metrics update event
    this.emit('metricsUpdated', this.metrics)
  }

  /**
   * Update system-level metrics
   */
  private updateSystemMetrics(): void {
    // Simplified memory usage calculation
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage()
      this.metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024 // MB
    }

    // Connection health based on recent error patterns
    const recentErrors = this.errorTimestamps.filter(t => Date.now() - t < 300000) // 5 minutes
    this.metrics.connectionHealth = Math.max(0, 100 - recentErrors.length * 5)
  }

  /**
   * Update protection system metrics
   */
  private updateProtectionMetrics(): void {
    // Get duplicate detector statistics
    const detectorStats = this.duplicateDetector.getStatistics()
    this.metrics.duplicateRequestsBlocked = detectorStats.recentActivity.duplicatesBlocked || 0

    // Get emergency breaker status and count tripped breakers
    const trippedBreakers = this.emergencyBreaker.getTrippedBreakers()
    this.metrics.circuitBreakerTrips = trippedBreakers.length
  }

  /**
   * Add a new telemetry event
   */
  private addEvent(eventData: Omit<TelemetryEvent, 'id' | 'timestamp'>): void {
    const event: TelemetryEvent = {
      ...eventData,
      id: `evt_${Date.now()}_${++this.eventIdCounter}`,
      timestamp: Date.now()
    }

    this.events.unshift(event)

    // Maintain event limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents)
    }

    // Emit event
    this.emit('telemetryEvent', event)

    // Console output with emoji
    this.outputEventToConsole(event)
  }

  /**
   * Output event to console with appropriate formatting
   */
  private outputEventToConsole(event: TelemetryEvent): void {
    const timestamp = new Date(event.timestamp).toISOString()
    const emoji = event.emoji || this.getSeverityEmoji(event.severity)
    const prefix = `[${timestamp}] ${emoji}`

    switch (event.severity) {
      case 'critical':
      case 'error':
        console.error(prefix, event.message, event.metadata)
        break
      case 'warning':
        console.warn(prefix, event.message, event.metadata)
        break
      default:
        console.info(prefix, event.message, event.metadata)
        break
    }
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return '📊'
    }
  }

  /**
   * Check all alert rules
   */
  private checkAlerts(): void {
    const now = Date.now()

    this.alerts.forEach(alert => {
      if (!alert.enabled) return

      // Check cooldown period
      if (alert.lastTriggered && now - alert.lastTriggered < alert.cooldownPeriod) {
        return
      }

      // Check condition
      if (alert.condition(this.metrics)) {
        alert.lastTriggered = now

        this.addEvent({
          type: 'system',
          category: 'alert',
          message: `🚨 ALERT: ${alert.name} - ${alert.description}`,
          metadata: {alert: alert.id, severity: alert.severity},
          severity: alert.severity === 'critical' ? 'critical' : 'error',
          emoji: '🚨'
        })

        this.emit('alert', alert, this.metrics)
      }
    })
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const now = Date.now()
    const cutoffTime = now - this.maxEventAge

    // Clean up old events
    this.events = this.events.filter(event => event.timestamp > cutoffTime)

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(t => t > cutoffTime)
    this.errorTimestamps = this.errorTimestamps.filter(t => t > cutoffTime)

    // Keep only recent request times for average calculation
    this.requestTimes = this.requestTimes.slice(-100)
  }

  // ===== Public API =====

  /**
   * Record a request start
   */
  public recordRequestStart(): string {
    this.metrics.totalRequests++
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.requestTimestamps.push(Date.now())
    return requestId
  }

  /**
   * Record a request completion
   */
  public recordRequestSuccess(requestId: string, responseTime: number): void {
    this.metrics.successfulRequests++
    this.metrics.currentResponseTime = responseTime
    this.requestTimes.push(responseTime)

    this.addEvent({
      type: 'request',
      category: 'success',
      message: `✅ Request completed successfully (${responseTime}ms)`,
      metadata: {requestId, responseTime},
      severity: 'info',
      emoji: '✅'
    })
  }

  /**
   * Record a request failure
   */
  public recordRequestFailure(requestId: string, error: Error | string): void {
    this.metrics.failedRequests++
    this.errorTimestamps.push(Date.now())

    // Also handle through error handler
    this.errorHandler.handleError(error, {requestId})
  }

  /**
   * Get current metrics
   */
  public getMetrics(): TelemetryMetrics {
    return {...this.metrics}
  }

  /**
   * Get recent events
   */
  public getRecentEvents(limit?: number): TelemetryEvent[] {
    return limit ? this.events.slice(0, limit) : [...this.events]
  }

  /**
   * Get dashboard data
   */
  public getDashboardData(): DashboardData {
    return {
      metrics: this.getMetrics(),
      events: this.getRecentEvents(50),
      alerts: [...this.alerts],
      recentErrors: this.errorHandler.getRecentErrors(20),
      protectionStatus: {
        circuitBreakers: this.emergencyBreaker.getEmergencyStatus(),
        duplicateDetector: this.duplicateDetector.getStatistics(),
        emergencyBreaker: {
          trippedBreakers: this.emergencyBreaker.getTrippedBreakers(),
          totalBreakers: Object.keys(this.emergencyBreaker.getEmergencyStatus()).length
        }
      }
    }
  }

  /**
   * Add custom alert rule
   */
  public addAlert(alert: Omit<AlertRule, 'id'>): string {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.alerts.push({...alert, id: alertId})
    return alertId
  }

  /**
   * Remove alert rule
   */
  public removeAlert(alertId: string): boolean {
    const index = this.alerts.findIndex(alert => alert.id === alertId)
    if (index !== -1) {
      this.alerts.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Enable/disable alert
   */
  public toggleAlert(alertId: string, enabled: boolean): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (alert) {
      alert.enabled = enabled
      return true
    }
    return false
  }

  /**
   * Reset all metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      currentResponseTime: 0,
      circuitBreakerTrips: 0,
      duplicateRequestsBlocked: 0,
      stackOverflowsPrevented: 0,
      totalProtectionEvents: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      connectionHealth: 100,
      errorRate: 0,
      requestsPerMinute: 0,
      errorsPerMinute: 0,
      recoveryTime: 0,
      uptime: Date.now() - this.startTime
    }

    this.requestTimes = []
    this.requestTimestamps = []
    this.errorTimestamps = []

    this.addEvent({
      type: 'system',
      category: 'reset',
      message: '🔄 Metrics reset manually',
      metadata: {},
      severity: 'info',
      emoji: '🔄'
    })
  }

  /**
   * Export telemetry data
   */
  public exportData(): string {
    return JSON.stringify(
      {
        metrics: this.metrics,
        events: this.events,
        alerts: this.alerts,
        timestamp: Date.now()
      },
      null,
      2
    )
  }

  /**
   * Destroy telemetry system
   */
  public destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    this.removeAllListeners()
    this.events = []
    this.alerts = []

    this.addEvent({
      type: 'system',
      category: 'shutdown',
      message: '🛑 Telemetry system shutdown',
      metadata: {},
      severity: 'info',
      emoji: '🛑'
    })
  }
}

// Export singleton instance
export default UnifiedTelemetrySystem
