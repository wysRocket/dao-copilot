import {EventEmitter} from 'events'
import {
  ErrorHandler,
  ClassifiedError,
  ErrorCategory,
  ErrorSeverity,
  ErrorContext
} from './ErrorHandler'
import {ErrorRecoveryStrategies} from './ErrorRecoveryStrategies'
import {RetroactiveErrorRecovery} from './RetroactiveErrorRecovery'

/**
 * Error metrics for telemetry tracking
 */
interface ErrorMetrics {
  timestamp: number
  category: ErrorCategory
  severity: ErrorSeverity
  operation: string
  sessionId: string
  recoveryAttempted: boolean
  recoverySuccess: boolean
  recoveryDuration?: number
  errorCode?: string
  userAgent: string
  metadata: Record<string, unknown>
}

/**
 * Aggregated error statistics for analysis
 */
interface ErrorStatistics {
  totalErrors: number
  errorsByCategory: Map<ErrorCategory, number>
  errorsBySeverity: Map<ErrorSeverity, number>
  errorsByOperation: Map<string, number>
  recoverySuccessRate: number
  averageRecoveryTime: number
  silentFailureRate: number
  criticalErrorRate: number
  timeWindow: {
    start: number
    end: number
    durationMs: number
  }
}

/**
 * Error pattern detection result
 */
interface ErrorPattern {
  type: 'spike' | 'trend' | 'recurring' | 'cascade' | 'anomaly'
  category: ErrorCategory
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  frequency: number
  firstOccurrence: number
  lastOccurrence: number
  affectedOperations: string[]
  suggestedAction: string
  confidence: number
}

/**
 * Real-time alert configuration
 */
interface AlertRule {
  id: string
  name: string
  type: 'threshold' | 'rate' | 'pattern' | 'anomaly'
  category?: ErrorCategory
  severity?: ErrorSeverity
  threshold: number
  timeWindowMs: number
  enabled: boolean
  actions: AlertAction[]
}

/**
 * Alert action types
 */
interface AlertAction {
  type: 'log' | 'notify' | 'email' | 'webhook' | 'auto-recover'
  config: Record<string, unknown>
}

/**
 * Telemetry dashboard data structure
 */
interface TelemetryDashboard {
  overview: {
    totalErrors: number
    activeAlerts: number
    systemHealth: 'healthy' | 'warning' | 'critical'
    uptime: number
    lastUpdated: number
  }
  errorRates: {
    current: number
    average: number
    peak: number
    trend: 'up' | 'down' | 'stable'
  }
  topErrors: Array<{
    category: ErrorCategory
    count: number
    percentage: number
    trend: 'up' | 'down' | 'stable'
  }>
  recoveryMetrics: {
    successRate: number
    averageTime: number
    totalAttempts: number
    retroactiveRecoveries: number
  }
  patterns: ErrorPattern[]
  alerts: Array<{
    id: string
    type: string
    message: string
    severity: string
    timestamp: number
    acknowledged: boolean
  }>
}

/**
 * Configuration for the telemetry system
 */
interface TelemetryConfig {
  enableRealTimeMonitoring: boolean
  metricsRetentionDays: number
  aggregationIntervalMs: number
  patternDetectionEnabled: boolean
  alertingEnabled: boolean
  dashboardUpdateIntervalMs: number
  maxMetricsInMemory: number
  exportToFile: boolean
  exportInterval: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

/**
 * Default telemetry configuration
 */
const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enableRealTimeMonitoring: true,
  metricsRetentionDays: 7,
  aggregationIntervalMs: 60000, // 1 minute
  patternDetectionEnabled: true,
  alertingEnabled: true,
  dashboardUpdateIntervalMs: 5000, // 5 seconds
  maxMetricsInMemory: 10000,
  exportToFile: false,
  exportInterval: 3600000, // 1 hour
  logLevel: 'info'
}

/**
 * Active alert structure
 */
interface ActiveAlert {
  id: string
  name: string
  type: string
  message: string
  severity: string
  timestamp: number
  acknowledged: boolean
  rule: AlertRule
}

/**
 * Error Telemetry System
 *
 * Comprehensive error tracking, analysis, and monitoring system that provides:
 * - Real-time error rate monitoring
 * - Pattern detection and anomaly identification
 * - Recovery success tracking
 * - Dashboard and reporting capabilities
 * - Intelligent alerting system
 */
export class ErrorTelemetrySystem extends EventEmitter {
  private config: TelemetryConfig
  private errorHandler: ErrorHandler
  private recoveryStrategies: ErrorRecoveryStrategies
  private retroactiveRecovery: RetroactiveErrorRecovery

  // Metrics storage
  private metrics: ErrorMetrics[] = []
  private aggregatedStats: Map<number, ErrorStatistics> = new Map()
  private detectedPatterns: ErrorPattern[] = []
  private alertRules: Map<string, AlertRule> = new Map()
  private activeAlerts: Map<string, ActiveAlert> = new Map()

  // Real-time monitoring
  private monitoringInterval?: NodeJS.Timeout
  private dashboardUpdateInterval?: NodeJS.Timeout
  private patternDetectionInterval?: NodeJS.Timeout

  // Dashboard state
  private currentDashboard: TelemetryDashboard

  // System state
  private isMonitoring: boolean = false
  private systemStartTime: number = Date.now()

  constructor(
    errorHandler: ErrorHandler,
    recoveryStrategies: ErrorRecoveryStrategies,
    retroactiveRecovery: RetroactiveErrorRecovery,
    config: Partial<TelemetryConfig> = {}
  ) {
    super()
    this.config = {...DEFAULT_TELEMETRY_CONFIG, ...config}
    this.errorHandler = errorHandler
    this.recoveryStrategies = recoveryStrategies
    this.retroactiveRecovery = retroactiveRecovery

    this.currentDashboard = this.initializeDashboard()
    this.setupDefaultAlertRules()
    this.setupEventListeners()

    if (this.config.enableRealTimeMonitoring) {
      this.startMonitoring()
    }
  }

  /**
   * Initialize the telemetry dashboard with default values
   */
  private initializeDashboard(): TelemetryDashboard {
    return {
      overview: {
        totalErrors: 0,
        activeAlerts: 0,
        systemHealth: 'healthy',
        uptime: 0,
        lastUpdated: Date.now()
      },
      errorRates: {
        current: 0,
        average: 0,
        peak: 0,
        trend: 'stable'
      },
      topErrors: [],
      recoveryMetrics: {
        successRate: 0,
        averageTime: 0,
        totalAttempts: 0,
        retroactiveRecoveries: 0
      },
      patterns: [],
      alerts: []
    }
  }

  /**
   * Setup default alert rules for common error scenarios
   */
  private setupDefaultAlertRules(): void {
    // High error rate alert
    this.addAlertRule({
      id: 'high_error_rate',
      name: 'High Error Rate',
      type: 'rate',
      threshold: 10, // 10 errors per minute
      timeWindowMs: 60000,
      enabled: true,
      actions: [
        {type: 'log', config: {level: 'error'}},
        {type: 'notify', config: {message: 'High error rate detected'}}
      ]
    })

    // Critical error alert
    this.addAlertRule({
      id: 'critical_errors',
      name: 'Critical Errors',
      type: 'threshold',
      severity: ErrorSeverity.CRITICAL,
      threshold: 1, // Any critical error
      timeWindowMs: 300000, // 5 minutes
      enabled: true,
      actions: [
        {type: 'log', config: {level: 'error'}},
        {type: 'notify', config: {message: 'Critical error detected'}},
        {type: 'auto-recover', config: {immediate: true}}
      ]
    })

    // Transcription failure pattern alert
    this.addAlertRule({
      id: 'transcription_failures',
      name: 'Transcription Failures',
      type: 'pattern',
      category: ErrorCategory.TRANSCRIPTION,
      threshold: 3, // 3 failures in time window
      timeWindowMs: 180000, // 3 minutes
      enabled: true,
      actions: [
        {type: 'log', config: {level: 'warn'}},
        {type: 'notify', config: {message: 'Transcription failure pattern detected'}}
      ]
    })

    // Recovery failure alert
    this.addAlertRule({
      id: 'recovery_failures',
      name: 'Recovery Failures',
      type: 'threshold',
      threshold: 5, // 5 failed recoveries
      timeWindowMs: 600000, // 10 minutes
      enabled: true,
      actions: [
        {type: 'log', config: {level: 'error'}},
        {type: 'notify', config: {message: 'Multiple recovery failures detected'}}
      ]
    })
  }

  /**
   * Setup event listeners for error tracking
   */
  private setupEventListeners(): void {
    // Listen for classified errors
    this.errorHandler.on('errorClassified', this.handleErrorClassified.bind(this))

    // Listen for recovery events
    this.recoveryStrategies.on('recoveryStarted', this.handleRecoveryStarted.bind(this))
    this.recoveryStrategies.on('recoveryCompleted', this.handleRecoveryCompleted.bind(this))

    // Listen for retroactive recovery events
    this.retroactiveRecovery.on(
      'retroactiveRecoveryCompleted',
      this.handleRetroactiveRecoveryCompleted.bind(this)
    )
    this.retroactiveRecovery.on(
      'silentFailuresDetected',
      this.handleSilentFailuresDetected.bind(this)
    )
  }

  /**
   * Start real-time monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true

    // Start metrics aggregation
    this.monitoringInterval = setInterval(() => {
      this.aggregateMetrics()
      this.checkAlertRules()
      this.cleanupOldMetrics()
    }, this.config.aggregationIntervalMs)

    // Start dashboard updates
    this.dashboardUpdateInterval = setInterval(() => {
      this.updateDashboard()
    }, this.config.dashboardUpdateIntervalMs)

    // Start pattern detection
    if (this.config.patternDetectionEnabled) {
      this.patternDetectionInterval = setInterval(() => {
        this.detectErrorPatterns()
      }, this.config.aggregationIntervalMs * 5) // Run less frequently
    }

    this.emit('monitoringStarted', {
      timestamp: Date.now(),
      config: this.config
    })
  }

  /**
   * Stop real-time monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }

    if (this.dashboardUpdateInterval) {
      clearInterval(this.dashboardUpdateInterval)
      this.dashboardUpdateInterval = undefined
    }

    if (this.patternDetectionInterval) {
      clearInterval(this.patternDetectionInterval)
      this.patternDetectionInterval = undefined
    }

    this.emit('monitoringStopped', {timestamp: Date.now()})
  }

  /**
   * Handle new error classification events
   */
  private handleErrorClassified(error: ClassifiedError, context: ErrorContext): void {
    const metric: ErrorMetrics = {
      timestamp: Date.now(),
      category: error.category,
      severity: error.severity,
      operation: context.operation || 'unknown',
      sessionId: context.sessionId || 'unknown',
      recoveryAttempted: false,
      recoverySuccess: false,
      errorCode: error.metadata?.errorCode as string,
      userAgent: context.userAgent || 'unknown',
      metadata: {
        confidence: error.confidence,
        ...error.metadata,
        ...context.additionalContext
      }
    }

    this.addMetric(metric)
    this.emit('errorTracked', metric)
  }

  /**
   * Handle recovery started events
   */
  private handleRecoveryStarted(event: {category: ErrorCategory; context: ErrorContext}): void {
    // Update existing metric to mark recovery attempt
    const recentMetrics = this.getRecentMetrics(5000) // Last 5 seconds
    const matchingMetric = recentMetrics.find(
      m => m.category === event.category && m.sessionId === event.context.sessionId
    )

    if (matchingMetric) {
      matchingMetric.recoveryAttempted = true
    }
  }

  /**
   * Handle recovery completed events
   */
  private handleRecoveryCompleted(event: {
    success: boolean
    category: ErrorCategory
    duration?: number
    context: ErrorContext
  }): void {
    // Update existing metric with recovery result
    const recentMetrics = this.getRecentMetrics(10000) // Last 10 seconds
    const matchingMetric = recentMetrics.find(
      m =>
        m.category === event.category &&
        m.sessionId === event.context.sessionId &&
        m.recoveryAttempted
    )

    if (matchingMetric) {
      matchingMetric.recoverySuccess = event.success
      matchingMetric.recoveryDuration = event.duration
    }

    this.emit('recoveryTracked', {
      category: event.category,
      success: event.success,
      duration: event.duration
    })
  }

  /**
   * Handle retroactive recovery completion
   */
  private handleRetroactiveRecoveryCompleted(result: {
    recoveredErrors: number
    failedRecoveries: number
  }): void {
    this.emit('retroactiveRecoveryTracked', {
      recovered: result.recoveredErrors,
      failed: result.failedRecoveries,
      timestamp: Date.now()
    })
  }

  /**
   * Handle silent failure detection
   */
  private handleSilentFailuresDetected(event: {count: number}): void {
    this.emit('silentFailuresTracked', {
      count: event.count,
      timestamp: Date.now()
    })
  }

  /**
   * Add a metric to the tracking system
   */
  private addMetric(metric: ErrorMetrics): void {
    this.metrics.push(metric)

    // Maintain memory limits
    if (this.metrics.length > this.config.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.config.maxMetricsInMemory)
    }

    this.logTelemetryEvent('metric_added', metric)
  }

  /**
   * Get recent metrics within specified time window
   */
  private getRecentMetrics(timeWindowMs: number): ErrorMetrics[] {
    const cutoff = Date.now() - timeWindowMs
    return this.metrics.filter(m => m.timestamp >= cutoff)
  }

  /**
   * Aggregate metrics for analysis
   */
  private aggregateMetrics(): void {
    const now = Date.now()
    const timeWindow = this.config.aggregationIntervalMs
    const windowStart = Math.floor(now / timeWindow) * timeWindow

    const windowMetrics = this.metrics.filter(
      m => m.timestamp >= windowStart && m.timestamp < windowStart + timeWindow
    )

    if (windowMetrics.length === 0) {
      return
    }

    const stats: ErrorStatistics = {
      totalErrors: windowMetrics.length,
      errorsByCategory: new Map(),
      errorsBySeverity: new Map(),
      errorsByOperation: new Map(),
      recoverySuccessRate: 0,
      averageRecoveryTime: 0,
      silentFailureRate: 0,
      criticalErrorRate: 0,
      timeWindow: {
        start: windowStart,
        end: windowStart + timeWindow,
        durationMs: timeWindow
      }
    }

    // Aggregate by category
    windowMetrics.forEach(metric => {
      const categoryCount = stats.errorsByCategory.get(metric.category) || 0
      stats.errorsByCategory.set(metric.category, categoryCount + 1)

      const severityCount = stats.errorsBySeverity.get(metric.severity) || 0
      stats.errorsBySeverity.set(metric.severity, severityCount + 1)

      const operationCount = stats.errorsByOperation.get(metric.operation) || 0
      stats.errorsByOperation.set(metric.operation, operationCount + 1)
    })

    // Calculate recovery success rate
    const recoveryAttempts = windowMetrics.filter(m => m.recoveryAttempted)
    const successfulRecoveries = recoveryAttempts.filter(m => m.recoverySuccess)
    stats.recoverySuccessRate =
      recoveryAttempts.length > 0 ? successfulRecoveries.length / recoveryAttempts.length : 0

    // Calculate average recovery time
    const recoveryTimes = successfulRecoveries
      .filter(m => m.recoveryDuration !== undefined)
      .map(m => m.recoveryDuration!)
    stats.averageRecoveryTime =
      recoveryTimes.length > 0
        ? recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length
        : 0

    // Calculate rates
    stats.criticalErrorRate =
      (stats.errorsBySeverity.get(ErrorSeverity.CRITICAL) || 0) / stats.totalErrors
    stats.silentFailureRate =
      windowMetrics.filter(m => !m.recoveryAttempted || !m.recoverySuccess).length /
      stats.totalErrors

    this.aggregatedStats.set(windowStart, stats)
    this.emit('metricsAggregated', stats)
  }

  /**
   * Detect error patterns and anomalies
   */
  private detectErrorPatterns(): void {
    const patterns: ErrorPattern[] = []
    const recentWindow = 10 * 60 * 1000 // 10 minutes
    const recentMetrics = this.getRecentMetrics(recentWindow)

    if (recentMetrics.length === 0) {
      return
    }

    // Detect error spikes
    patterns.push(...this.detectErrorSpikes(recentMetrics))

    // Detect recurring patterns
    patterns.push(...this.detectRecurringPatterns(recentMetrics))

    // Detect cascading failures
    patterns.push(...this.detectCascadingFailures(recentMetrics))

    // Detect anomalies
    patterns.push(...this.detectAnomalies())

    // Update detected patterns
    this.detectedPatterns = patterns

    if (patterns.length > 0) {
      this.emit('patternsDetected', patterns)
    }
  }

  /**
   * Detect error spikes
   */
  private detectErrorSpikes(metrics: ErrorMetrics[]): ErrorPattern[] {
    const patterns: ErrorPattern[] = []
    const categories = Array.from(new Set(metrics.map(m => m.category)))

    for (const category of categories) {
      const categoryMetrics = metrics.filter(m => m.category === category)
      const rate = categoryMetrics.length / (10 * 60) // Errors per second over 10 minutes

      if (rate > 0.1) {
        // More than 0.1 errors per second
        patterns.push({
          type: 'spike',
          category,
          severity: rate > 0.5 ? 'critical' : rate > 0.2 ? 'high' : 'medium',
          description: `Error spike detected in ${category} category (${rate.toFixed(2)} errors/sec)`,
          frequency: categoryMetrics.length,
          firstOccurrence: Math.min(...categoryMetrics.map(m => m.timestamp)),
          lastOccurrence: Math.max(...categoryMetrics.map(m => m.timestamp)),
          affectedOperations: Array.from(new Set(categoryMetrics.map(m => m.operation))),
          suggestedAction: 'Investigate root cause and consider enabling circuit breaker',
          confidence: Math.min(rate * 10, 1) // Higher rate = higher confidence
        })
      }
    }

    return patterns
  }

  /**
   * Detect recurring error patterns
   */
  private detectRecurringPatterns(metrics: ErrorMetrics[]): ErrorPattern[] {
    const patterns: ErrorPattern[] = []
    const operations = Array.from(new Set(metrics.map(m => m.operation)))

    for (const operation of operations) {
      const operationMetrics = metrics.filter(m => m.operation === operation)
      const intervals: number[] = []

      // Calculate intervals between errors
      for (let i = 1; i < operationMetrics.length; i++) {
        intervals.push(operationMetrics[i].timestamp - operationMetrics[i - 1].timestamp)
      }

      if (intervals.length >= 3) {
        const avgInterval =
          intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
        const variance =
          intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) /
          intervals.length
        const stdDev = Math.sqrt(variance)

        // If intervals are relatively consistent (low variance), it's a recurring pattern
        if (stdDev / avgInterval < 0.3) {
          // Coefficient of variation < 0.3
          patterns.push({
            type: 'recurring',
            category: operationMetrics[0].category,
            severity: avgInterval < 60000 ? 'high' : 'medium', // Less than 1 minute is high severity
            description: `Recurring error pattern in ${operation} (every ${(avgInterval / 1000).toFixed(1)}s)`,
            frequency: operationMetrics.length,
            firstOccurrence: operationMetrics[0].timestamp,
            lastOccurrence: operationMetrics[operationMetrics.length - 1].timestamp,
            affectedOperations: [operation],
            suggestedAction: 'Investigate underlying systemic issue causing regular failures',
            confidence: Math.max(0.5, 1 - stdDev / avgInterval)
          })
        }
      }
    }

    return patterns
  }

  /**
   * Detect cascading failures
   */
  private detectCascadingFailures(metrics: ErrorMetrics[]): ErrorPattern[] {
    const patterns: ErrorPattern[] = []
    const timeWindow = 30000 // 30 second window

    // Group metrics by time windows
    const windows = new Map<number, ErrorMetrics[]>()
    metrics.forEach(metric => {
      const windowKey = Math.floor(metric.timestamp / timeWindow)
      if (!windows.has(windowKey)) {
        windows.set(windowKey, [])
      }
      windows.get(windowKey)!.push(metric)
    })

    // Look for windows with multiple error categories
    for (const [, windowMetrics] of windows) {
      const categories = new Set(windowMetrics.map(m => m.category))

      if (categories.size >= 3 && windowMetrics.length >= 5) {
        // Multiple categories, multiple errors
        const operations = new Set(windowMetrics.map(m => m.operation))

        patterns.push({
          type: 'cascade',
          category: windowMetrics[0].category, // Primary category
          severity: 'high',
          description: `Cascading failure detected: ${categories.size} error categories, ${windowMetrics.length} errors in ${timeWindow / 1000}s`,
          frequency: windowMetrics.length,
          firstOccurrence: Math.min(...windowMetrics.map(m => m.timestamp)),
          lastOccurrence: Math.max(...windowMetrics.map(m => m.timestamp)),
          affectedOperations: Array.from(operations),
          suggestedAction: 'Implement circuit breaker and investigate system-wide dependencies',
          confidence: Math.min(categories.size / 5, 1) // More categories = higher confidence
        })
      }
    }

    return patterns
  }

  /**
   * Detect anomalies in error patterns
   */
  private detectAnomalies(): ErrorPattern[] {
    const patterns: ErrorPattern[] = []
    const currentWindow = this.getRecentMetrics(60000) // Last minute
    const previousWindow = this.metrics.filter(
      m => m.timestamp >= Date.now() - 120000 && m.timestamp < Date.now() - 60000
    ) // Previous minute

    if (previousWindow.length === 0) {
      return patterns
    }

    const currentRate = currentWindow.length
    const previousRate = previousWindow.length
    const rateIncrease = (currentRate - previousRate) / previousRate

    // Detect significant rate anomalies
    if (rateIncrease > 2 && currentRate > 5) {
      // 200% increase and at least 5 errors
      patterns.push({
        type: 'anomaly',
        category: ErrorCategory.SYSTEM, // General system anomaly
        severity: rateIncrease > 5 ? 'critical' : 'high',
        description: `Error rate anomaly: ${(rateIncrease * 100).toFixed(0)}% increase (${previousRate} → ${currentRate})`,
        frequency: currentRate,
        firstOccurrence: Math.min(...currentWindow.map(m => m.timestamp)),
        lastOccurrence: Math.max(...currentWindow.map(m => m.timestamp)),
        affectedOperations: Array.from(new Set(currentWindow.map(m => m.operation))),
        suggestedAction: 'Investigate sudden change in system behavior or external factors',
        confidence: Math.min(rateIncrease / 10, 1)
      })
    }

    return patterns
  }

  /**
   * Check alert rules and trigger alerts
   */
  private checkAlertRules(): void {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) {
        continue
      }

      const shouldAlert = this.evaluateAlertRule(rule)
      const existingAlert = this.activeAlerts.has(ruleId)

      if (shouldAlert && !existingAlert) {
        this.triggerAlert(rule)
      } else if (!shouldAlert && existingAlert) {
        this.resolveAlert(ruleId)
      }
    }
  }

  /**
   * Evaluate if an alert rule should trigger
   */
  private evaluateAlertRule(rule: AlertRule): boolean {
    const recentMetrics = this.getRecentMetrics(rule.timeWindowMs)
    let relevantMetrics = recentMetrics

    // Filter by category if specified
    if (rule.category) {
      relevantMetrics = relevantMetrics.filter(m => m.category === rule.category)
    }

    // Filter by severity if specified
    if (rule.severity) {
      relevantMetrics = relevantMetrics.filter(m => m.severity === rule.severity)
    }

    switch (rule.type) {
      case 'threshold':
        return relevantMetrics.length >= rule.threshold

      case 'rate': {
        const rate = relevantMetrics.length / (rule.timeWindowMs / 60000) // Per minute
        return rate >= rule.threshold
      }

      case 'pattern':
        // Check for pattern-specific conditions
        return relevantMetrics.length >= rule.threshold

      case 'anomaly': {
        // Compare with historical averages
        const historicalAvg = this.getHistoricalAverage(rule.category, rule.timeWindowMs)
        return relevantMetrics.length >= historicalAvg * rule.threshold
      }

      default:
        return false
    }
  }

  /**
   * Get historical average for anomaly detection
   */
  private getHistoricalAverage(category?: ErrorCategory, timeWindowMs?: number): number {
    const historicalPeriod = 24 * 60 * 60 * 1000 // 24 hours
    const historicalMetrics = this.metrics.filter(
      m => m.timestamp >= Date.now() - historicalPeriod && (!category || m.category === category)
    )

    if (historicalMetrics.length === 0) {
      return 0
    }

    // Calculate average per time window
    const windowCount = Math.floor(historicalPeriod / (timeWindowMs || 60000))
    return historicalMetrics.length / windowCount
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule): void {
    const alert = {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      message: `Alert: ${rule.name} triggered`,
      severity: this.getAlertSeverity(rule),
      timestamp: Date.now(),
      acknowledged: false,
      rule
    }

    this.activeAlerts.set(rule.id, alert)

    // Execute alert actions
    rule.actions.forEach(action => {
      this.executeAlertAction(action, alert)
    })

    this.emit('alertTriggered', alert)
  }

  /**
   * Resolve an alert
   */
  private resolveAlert(ruleId: string): void {
    const alert = this.activeAlerts.get(ruleId)
    if (alert) {
      this.activeAlerts.delete(ruleId)
      this.emit('alertResolved', {
        id: ruleId,
        name: alert.name,
        duration: Date.now() - alert.timestamp
      })
    }
  }

  /**
   * Get alert severity based on rule configuration
   */
  private getAlertSeverity(rule: AlertRule): string {
    if (rule.severity === ErrorSeverity.CRITICAL) {
      return 'critical'
    } else if (rule.type === 'anomaly' || rule.threshold > 10) {
      return 'high'
    } else {
      return 'medium'
    }
  }

  /**
   * Execute alert action
   */
  private executeAlertAction(action: AlertAction, alert: ActiveAlert): void {
    switch (action.type) {
      case 'log':
        this.logTelemetryEvent('alert', {
          alert: alert.name,
          level: action.config.level || 'warn'
        })
        break

      case 'notify':
        this.emit('notification', {
          message: action.config.message || alert.message,
          severity: alert.severity,
          alert
        })
        break

      case 'auto-recover':
        if (action.config.immediate) {
          this.emit('autoRecoveryRequested', {
            alert,
            immediate: true
          })
        }
        break

      default:
        this.logTelemetryEvent('unknown_action', {action: action.type})
    }
  }

  /**
   * Update dashboard with current metrics
   */
  private updateDashboard(): void {
    const now = Date.now()
    const recentMetrics = this.getRecentMetrics(60000) // Last minute
    const hourlyMetrics = this.getRecentMetrics(3600000) // Last hour

    // Update overview
    this.currentDashboard.overview = {
      totalErrors: this.metrics.length,
      activeAlerts: this.activeAlerts.size,
      systemHealth: this.calculateSystemHealth(),
      uptime: now - this.systemStartTime,
      lastUpdated: now
    }

    // Update error rates
    const currentRate = recentMetrics.length
    const hourlyRate = hourlyMetrics.length / 60 // Per minute
    const peakRate = this.calculatePeakRate()

    this.currentDashboard.errorRates = {
      current: currentRate,
      average: hourlyRate,
      peak: peakRate,
      trend: this.calculateRateTrend()
    }

    // Update top errors
    this.currentDashboard.topErrors = this.calculateTopErrors()

    // Update recovery metrics
    const recoveryStats = this.recoveryStrategies.getRecoveryStatistics()
    const retroactiveStats = this.retroactiveRecovery.getRetroactiveStats()

    this.currentDashboard.recoveryMetrics = {
      successRate:
        recoveryStats.totalRecoveries > 0
          ? recoveryStats.successfulRecoveries / recoveryStats.totalRecoveries
          : 0,
      averageTime: this.calculateAverageRecoveryTime(),
      totalAttempts: recoveryStats.totalRecoveries,
      retroactiveRecoveries: retroactiveStats.successfulRetroactiveRecoveries
    }

    // Update patterns and alerts
    this.currentDashboard.patterns = this.detectedPatterns
    this.currentDashboard.alerts = Array.from(this.activeAlerts.values())

    this.emit('dashboardUpdated', this.currentDashboard)
  }

  /**
   * Calculate system health status
   */
  private calculateSystemHealth(): 'healthy' | 'warning' | 'critical' {
    const recentCriticalErrors = this.getRecentMetrics(300000) // 5 minutes
      .filter(m => m.severity === ErrorSeverity.CRITICAL).length

    const recoverySuccessRate = this.currentDashboard.recoveryMetrics?.successRate || 0

    if (recentCriticalErrors > 0 || recoverySuccessRate < 0.5) {
      return 'critical'
    } else if (this.activeAlerts.size > 0 || recoverySuccessRate < 0.8) {
      return 'warning'
    } else {
      return 'healthy'
    }
  }

  /**
   * Calculate peak error rate
   */
  private calculatePeakRate(): number {
    const windows = new Map<number, number>()
    const windowSize = 60000 // 1 minute windows

    this.getRecentMetrics(3600000).forEach(metric => {
      // Last hour
      const windowKey = Math.floor(metric.timestamp / windowSize)
      windows.set(windowKey, (windows.get(windowKey) || 0) + 1)
    })

    return Math.max(...Array.from(windows.values()), 0)
  }

  /**
   * Calculate rate trend
   */
  private calculateRateTrend(): 'up' | 'down' | 'stable' {
    const currentRate = this.getRecentMetrics(60000).length
    const previousRate = this.metrics.filter(
      m => m.timestamp >= Date.now() - 120000 && m.timestamp < Date.now() - 60000
    ).length

    const change = currentRate - previousRate
    const threshold = Math.max(previousRate * 0.2, 2) // 20% change or 2 errors

    if (change > threshold) return 'up'
    if (change < -threshold) return 'down'
    return 'stable'
  }

  /**
   * Calculate top error categories
   */
  private calculateTopErrors(): Array<{
    category: ErrorCategory
    count: number
    percentage: number
    trend: 'up' | 'down' | 'stable'
  }> {
    const hourlyMetrics = this.getRecentMetrics(3600000)
    const categoryCounts = new Map<ErrorCategory, number>()

    hourlyMetrics.forEach(metric => {
      categoryCounts.set(metric.category, (categoryCounts.get(metric.category) || 0) + 1)
    })

    const total = hourlyMetrics.length

    return Array.from(categoryCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({
        category,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        trend: this.calculateCategoryTrend(category)
      }))
  }

  /**
   * Calculate trend for specific error category
   */
  private calculateCategoryTrend(category: ErrorCategory): 'up' | 'down' | 'stable' {
    const currentHour = this.getRecentMetrics(3600000).filter(m => m.category === category).length
    const previousHour = this.metrics.filter(
      m =>
        m.timestamp >= Date.now() - 7200000 &&
        m.timestamp < Date.now() - 3600000 &&
        m.category === category
    ).length

    const change = currentHour - previousHour
    const threshold = Math.max(previousHour * 0.3, 1)

    if (change > threshold) return 'up'
    if (change < -threshold) return 'down'
    return 'stable'
  }

  /**
   * Calculate average recovery time
   */
  private calculateAverageRecoveryTime(): number {
    const recentRecoveries = this.getRecentMetrics(3600000).filter(
      m => m.recoveryAttempted && m.recoverySuccess && m.recoveryDuration
    )

    if (recentRecoveries.length === 0) {
      return 0
    }

    const totalTime = recentRecoveries.reduce((sum, m) => sum + (m.recoveryDuration || 0), 0)
    return totalTime / recentRecoveries.length
  }

  /**
   * Clean up old metrics to manage memory
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.config.metricsRetentionDays * 24 * 60 * 60 * 1000
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff)

    // Clean up aggregated stats
    for (const [timestamp] of this.aggregatedStats) {
      if (timestamp < cutoff) {
        this.aggregatedStats.delete(timestamp)
      }
    }
  }

  /**
   * Add new alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule)
    this.emit('alertRuleAdded', rule)
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const existed = this.alertRules.delete(ruleId)
    if (existed) {
      this.resolveAlert(ruleId) // Resolve any active alerts
      this.emit('alertRuleRemoved', ruleId)
    }
    return existed
  }

  /**
   * Get current dashboard state
   */
  getDashboard(): TelemetryDashboard {
    return {...this.currentDashboard}
  }

  /**
   * Get telemetry statistics
   */
  getStatistics(): {
    totalMetrics: number
    metricsRetentionPeriod: number
    activeAlertRules: number
    activeAlerts: number
    detectedPatterns: number
    monitoringStatus: boolean
  } {
    return {
      totalMetrics: this.metrics.length,
      metricsRetentionPeriod: this.config.metricsRetentionDays,
      activeAlertRules: this.alertRules.size,
      activeAlerts: this.activeAlerts.size,
      detectedPatterns: this.detectedPatterns.length,
      monitoringStatus: this.isMonitoring
    }
  }

  /**
   * Export metrics to file or external system
   */
  async exportMetrics(format: 'json' | 'csv' = 'json'): Promise<string> {
    const data = {
      metadata: {
        exportTime: Date.now(),
        totalMetrics: this.metrics.length,
        timeRange: {
          start: Math.min(...this.metrics.map(m => m.timestamp)),
          end: Math.max(...this.metrics.map(m => m.timestamp))
        }
      },
      metrics: this.metrics,
      aggregatedStats: Array.from(this.aggregatedStats.entries()).map(([timestamp, stats]) => ({
        timestamp,
        ...stats,
        errorsByCategory: Array.from(stats.errorsByCategory.entries()),
        errorsBySeverity: Array.from(stats.errorsBySeverity.entries()),
        errorsByOperation: Array.from(stats.errorsByOperation.entries())
      })),
      patterns: this.detectedPatterns
    }

    if (format === 'json') {
      return JSON.stringify(data, null, 2)
    } else {
      // Simplified CSV export for metrics
      const csvLines = [
        'timestamp,category,severity,operation,sessionId,recoveryAttempted,recoverySuccess,recoveryDuration',
        ...this.metrics.map(
          m =>
            `${m.timestamp},${m.category},${m.severity},${m.operation},${m.sessionId},${m.recoveryAttempted},${m.recoverySuccess},${m.recoveryDuration || ''}`
        )
      ]
      return csvLines.join('\n')
    }
  }

  /**
   * Log telemetry events
   */
  private logTelemetryEvent(event: string, data: Record<string, unknown>): void {
    if (this.config.logLevel === 'debug') {
      this.emit('telemetryLog', {
        level: 'debug',
        event,
        data,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Destroy the telemetry system and clean up resources
   */
  destroy(): void {
    this.stopMonitoring()
    this.metrics = []
    this.aggregatedStats.clear()
    this.detectedPatterns = []
    this.alertRules.clear()
    this.activeAlerts.clear()
    this.removeAllListeners()

    this.emit('destroyed', {timestamp: Date.now()})
  }
}
