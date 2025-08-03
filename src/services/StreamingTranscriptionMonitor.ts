/**
 * Enhanced Monitoring Integration for Streaming Transcription System
 * 
 * Integrates the new streaming audio processing pipeline with existing
 * monitoring infrastructure, providing comprehensive metrics, alerting,
 * and performance tracking.
 */

import { UnifiedPerformanceService } from '../services/unified-performance'
import type { StreamingTranscriptionEngine, StreamingTranscriptionResult } from './StreamingTranscriptionEngine'
import type { WebSocketBackpressureController, ProcessingMetrics } from './WebSocketBackpressureController'

/**
 * Extended metrics for streaming transcription
 */
export interface StreamingTranscriptionMetrics {
  // Session metrics
  activeSessions: number
  totalSessions: number
  averageSessionDuration: number
  
  // Processing metrics
  chunksProcessed: number
  totalProcessingTime: number
  averageChunkProcessingTime: number
  successRate: number
  errorRate: number
  
  // Memory metrics
  currentMemoryUsage: number
  peakMemoryUsage: number
  memoryEfficiency: number
  objectPoolUtilization: number
  
  // Backpressure metrics
  backpressureActivations: number
  averageBackpressureDuration: number
  circuitBreakerTrips: number
  adaptiveDelayAdjustments: number
  
  // Stream metrics
  streamThroughput: number // chunks/second
  streamLatency: number // ms
  bufferUtilization: number // percentage
  
  // Quality metrics
  averageConfidence: number
  transcriptionAccuracy: number
  processingQuality: 'excellent' | 'good' | 'degraded' | 'poor'
}

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical'

/**
 * Alert configuration
 */
export interface AlertConfig {
  // Memory alerts
  memoryUsageThreshold: number // bytes
  memoryEfficiencyThreshold: number // percentage
  
  // Performance alerts
  processingTimeThreshold: number // ms
  errorRateThreshold: number // percentage
  successRateThreshold: number // percentage
  
  // Backpressure alerts
  backpressureFrequencyThreshold: number // activations per minute
  circuitBreakerThreshold: number // trips per hour
  
  // Quality alerts
  confidenceThreshold: number // minimum confidence
  accuracyThreshold: number // minimum accuracy percentage
}

/**
 * Default alert configuration
 */
const DEFAULT_ALERT_CONFIG: AlertConfig = {
  memoryUsageThreshold: 100 * 1024 * 1024, // 100MB
  memoryEfficiencyThreshold: 70, // 70%
  processingTimeThreshold: 5000, // 5 seconds
  errorRateThreshold: 5, // 5%
  successRateThreshold: 95, // 95%
  backpressureFrequencyThreshold: 10, // 10 per minute
  circuitBreakerThreshold: 3, // 3 per hour
  confidenceThreshold: 0.7, // 70%
  accuracyThreshold: 85 // 85%
}

/**
 * Alert event interface
 */
export interface AlertEvent {
  severity: AlertSeverity
  message: string
  metric: keyof StreamingTranscriptionMetrics
  value: number
  threshold: number
  timestamp: number
  sessionId?: string
}

/**
 * Streaming Transcription Monitor
 * 
 * Comprehensive monitoring system that integrates with existing infrastructure
 * and provides real-time metrics, alerting, and performance tracking.
 */
export class StreamingTranscriptionMonitor {
  private performanceService: UnifiedPerformanceService
  private metrics: StreamingTranscriptionMetrics
  private alertConfig: AlertConfig
  private activeAlerts = new Map<string, AlertEvent>()
  private metricsHistory: StreamingTranscriptionMetrics[] = []
  private alertCallbacks = new Set<(alert: AlertEvent) => void>()
  
  // Session tracking
  private sessionStartTimes = new Map<string, number>()
  private sessionMetrics = new Map<string, Partial<StreamingTranscriptionMetrics>>()
  
  // Performance tracking
  private processingTimes: number[] = []
  private memorySnapshots: number[] = []
  private confidenceScores: number[] = []
  
  constructor(alertConfig: Partial<AlertConfig> = {}) {
    this.performanceService = UnifiedPerformanceService.getInstance()
    this.alertConfig = { ...DEFAULT_ALERT_CONFIG, ...alertConfig }
    
    this.metrics = this.initializeMetrics()
    
    // Set up periodic metrics collection
    this.startMetricsCollection()
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): StreamingTranscriptionMetrics {
    return {
      // Session metrics
      activeSessions: 0,
      totalSessions: 0,
      averageSessionDuration: 0,
      
      // Processing metrics
      chunksProcessed: 0,
      totalProcessingTime: 0,
      averageChunkProcessingTime: 0,
      successRate: 100,
      errorRate: 0,
      
      // Memory metrics
      currentMemoryUsage: 0,
      peakMemoryUsage: 0,
      memoryEfficiency: 100,
      objectPoolUtilization: 0,
      
      // Backpressure metrics
      backpressureActivations: 0,
      averageBackpressureDuration: 0,
      circuitBreakerTrips: 0,
      adaptiveDelayAdjustments: 0,
      
      // Stream metrics
      streamThroughput: 0,
      streamLatency: 0,
      bufferUtilization: 0,
      
      // Quality metrics
      averageConfidence: 0,
      transcriptionAccuracy: 0,
      processingQuality: 'excellent'
    }
  }

  /**
   * Start monitoring a streaming transcription session
   */
  startSessionMonitoring(
    sessionId: string,
    engine: StreamingTranscriptionEngine,
    backpressureController?: WebSocketBackpressureController
  ): void {
    this.sessionStartTimes.set(sessionId, Date.now())
    this.sessionMetrics.set(sessionId, {})
    
    this.metrics.activeSessions++
    this.metrics.totalSessions++
    
    // Set up engine event listeners
    if (backpressureController) {
      this.setupBackpressureMonitoring(sessionId, backpressureController)
    }
    
    console.log(`StreamingTranscriptionMonitor: Started monitoring session ${sessionId}`)
    this.updatePerformanceService()
  }

  /**
   * Stop monitoring a session
   */
  stopSessionMonitoring(sessionId: string): void {
    const startTime = this.sessionStartTimes.get(sessionId)
    if (startTime) {
      const duration = Date.now() - startTime
      this.updateSessionDuration(duration)
      this.sessionStartTimes.delete(sessionId)
    }
    
    this.sessionMetrics.delete(sessionId)
    this.metrics.activeSessions = Math.max(0, this.metrics.activeSessions - 1)
    
    console.log(`StreamingTranscriptionMonitor: Stopped monitoring session ${sessionId}`)
    this.updatePerformanceService()
  }

  /**
   * Record chunk processing metrics
   */
  recordChunkProcessing(
    sessionId: string,
    result: StreamingTranscriptionResult,
    processingTime: number
  ): void {
    this.metrics.chunksProcessed++
    this.metrics.totalProcessingTime += processingTime
    this.metrics.averageChunkProcessingTime = 
      this.metrics.totalProcessingTime / this.metrics.chunksProcessed
    
    // Track processing times for trend analysis
    this.processingTimes.push(processingTime)
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift() // Keep only recent 100 entries
    }
    
    // Track confidence scores
    this.confidenceScores.push(result.confidence)
    if (this.confidenceScores.length > 100) {
      this.confidenceScores.shift()
    }
    
    // Update average confidence
    this.metrics.averageConfidence = 
      this.confidenceScores.reduce((sum, conf) => sum + conf, 0) / this.confidenceScores.length
    
    // Update session metrics
    const sessionMetrics = this.sessionMetrics.get(sessionId) || {}
    sessionMetrics.chunksProcessed = (sessionMetrics.chunksProcessed || 0) + 1
    sessionMetrics.totalProcessingTime = (sessionMetrics.totalProcessingTime || 0) + processingTime
    this.sessionMetrics.set(sessionId, sessionMetrics)
    
    // Check for performance alerts
    this.checkPerformanceAlerts(processingTime, result.confidence)
    
    this.updatePerformanceService()
  }

  /**
   * Record processing error
   */
  recordProcessingError(sessionId: string, error: Error): void {
    const totalOperations = this.metrics.chunksProcessed + 1 // Include this error
    const errorCount = Math.floor(totalOperations * (this.metrics.errorRate / 100)) + 1
    
    this.metrics.errorRate = (errorCount / totalOperations) * 100
    this.metrics.successRate = 100 - this.metrics.errorRate
    
    // Trigger error alert
    this.triggerAlert({
      severity: 'error',
      message: `Processing error in session ${sessionId}: ${error.message}`,
      metric: 'errorRate',
      value: this.metrics.errorRate,
      threshold: this.alertConfig.errorRateThreshold,
      timestamp: Date.now(),
      sessionId
    })
    
    console.error(`StreamingTranscriptionMonitor: Error in session ${sessionId}:`, error)
    this.updatePerformanceService()
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(usage: number, poolUtilization?: number): void {
    this.metrics.currentMemoryUsage = usage
    this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, usage)
    
    if (poolUtilization !== undefined) {
      this.metrics.objectPoolUtilization = poolUtilization
    }
    
    // Track memory snapshots
    this.memorySnapshots.push(usage)
    if (this.memorySnapshots.length > 50) {
      this.memorySnapshots.shift()
    }
    
    // Calculate memory efficiency (lower usage is better)
    const averageUsage = this.memorySnapshots.reduce((sum, mem) => sum + mem, 0) / this.memorySnapshots.length
    this.metrics.memoryEfficiency = Math.max(0, 100 - (averageUsage / (100 * 1024 * 1024)) * 100)
    
    // Check memory alerts
    this.checkMemoryAlerts(usage)
    
    this.updatePerformanceService()
  }

  /**
   * Set up backpressure controller monitoring
   */
  private setupBackpressureMonitoring(
    sessionId: string,
    controller: WebSocketBackpressureController
  ): void {
    // Monitor backpressure events
    controller.addEventListener('backpressure-activated', (event) => {
      this.metrics.backpressureActivations++
      
      this.triggerAlert({
        severity: 'warning',
        message: `Backpressure activated in session ${sessionId}`,
        metric: 'backpressureActivations',
        value: this.metrics.backpressureActivations,
        threshold: this.alertConfig.backpressureFrequencyThreshold,
        timestamp: Date.now(),
        sessionId
      })
    })
    
    controller.addEventListener('circuit-opened', (event) => {
      this.metrics.circuitBreakerTrips++
      
      this.triggerAlert({
        severity: 'critical',
        message: `Circuit breaker opened in session ${sessionId}`,
        metric: 'circuitBreakerTrips',
        value: this.metrics.circuitBreakerTrips,
        threshold: this.alertConfig.circuitBreakerThreshold,
        timestamp: Date.now(),
        sessionId
      })
    })
    
    // Periodically collect backpressure metrics
    const metricsInterval = setInterval(() => {
      if (this.sessionStartTimes.has(sessionId)) {
        const backpressureMetrics = controller.getMetrics()
        this.updateBackpressureMetrics(backpressureMetrics)
      } else {
        clearInterval(metricsInterval)
      }
    }, 1000)
  }

  /**
   * Update backpressure metrics
   */
  private updateBackpressureMetrics(backpressureMetrics: ProcessingMetrics): void {
    this.metrics.streamThroughput = backpressureMetrics.averageProcessingTime > 0 
      ? 1000 / backpressureMetrics.averageProcessingTime 
      : 0
    
    this.metrics.streamLatency = backpressureMetrics.averageProcessingTime
    this.metrics.bufferUtilization = (backpressureMetrics.currentBufferSize / backpressureMetrics.maxBufferSize) * 100
  }

  /**
   * Check performance alerts
   */
  private checkPerformanceAlerts(processingTime: number, confidence: number): void {
    // Processing time alert
    if (processingTime > this.alertConfig.processingTimeThreshold) {
      this.triggerAlert({
        severity: 'warning',
        message: `High processing time: ${processingTime}ms`,
        metric: 'averageChunkProcessingTime',
        value: processingTime,
        threshold: this.alertConfig.processingTimeThreshold,
        timestamp: Date.now()
      })
    }
    
    // Confidence alert
    if (confidence < this.alertConfig.confidenceThreshold) {
      this.triggerAlert({
        severity: 'warning',
        message: `Low confidence score: ${(confidence * 100).toFixed(1)}%`,
        metric: 'averageConfidence',
        value: confidence * 100,
        threshold: this.alertConfig.confidenceThreshold * 100,
        timestamp: Date.now()
      })
    }
    
    // Success rate alert
    if (this.metrics.successRate < this.alertConfig.successRateThreshold) {
      this.triggerAlert({
        severity: 'error',
        message: `Low success rate: ${this.metrics.successRate.toFixed(1)}%`,
        metric: 'successRate',
        value: this.metrics.successRate,
        threshold: this.alertConfig.successRateThreshold,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Check memory alerts
   */
  private checkMemoryAlerts(usage: number): void {
    if (usage > this.alertConfig.memoryUsageThreshold) {
      this.triggerAlert({
        severity: 'warning',
        message: `High memory usage: ${Math.round(usage / 1024 / 1024)}MB`,
        metric: 'currentMemoryUsage',
        value: usage,
        threshold: this.alertConfig.memoryUsageThreshold,
        timestamp: Date.now()
      })
    }
    
    if (this.metrics.memoryEfficiency < this.alertConfig.memoryEfficiencyThreshold) {
      this.triggerAlert({
        severity: 'warning',
        message: `Low memory efficiency: ${this.metrics.memoryEfficiency.toFixed(1)}%`,
        metric: 'memoryEfficiency',
        value: this.metrics.memoryEfficiency,
        threshold: this.alertConfig.memoryEfficiencyThreshold,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: AlertEvent): void {
    const alertKey = `${alert.metric}-${alert.sessionId || 'global'}`
    
    // Deduplicate alerts (don't spam same alert)
    if (this.activeAlerts.has(alertKey)) {
      const existingAlert = this.activeAlerts.get(alertKey)!
      if (Date.now() - existingAlert.timestamp < 60000) { // 1 minute cooldown
        return
      }
    }
    
    this.activeAlerts.set(alertKey, alert)
    
    // Notify alert callbacks
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert)
      } catch (error) {
        console.error('Alert callback error:', error)
      }
    })
    
    console.warn('StreamingTranscriptionMonitor Alert:', alert)
  }

  /**
   * Update session duration metrics
   */
  private updateSessionDuration(duration: number): void {
    const totalDuration = this.metrics.averageSessionDuration * (this.metrics.totalSessions - 1) + duration
    this.metrics.averageSessionDuration = totalDuration / this.metrics.totalSessions
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      // Update processing quality based on current metrics
      this.updateProcessingQuality()
      
      // Store metrics history
      this.metricsHistory.push({ ...this.metrics })
      if (this.metricsHistory.length > 100) {
        this.metricsHistory.shift()
      }
      
      // Update performance service
      this.updatePerformanceService()
    }, 5000) // Every 5 seconds
  }

  /**
   * Update processing quality assessment
   */
  private updateProcessingQuality(): void {
    const score = this.calculateQualityScore()
    
    if (score >= 90) {
      this.metrics.processingQuality = 'excellent'
    } else if (score >= 75) {
      this.metrics.processingQuality = 'good'
    } else if (score >= 60) {
      this.metrics.processingQuality = 'degraded'
    } else {
      this.metrics.processingQuality = 'poor'
    }
  }

  /**
   * Calculate overall quality score
   */
  private calculateQualityScore(): number {
    const weights = {
      successRate: 0.3,
      averageConfidence: 0.25,
      memoryEfficiency: 0.2,
      processingSpeed: 0.15,
      reliability: 0.1
    }
    
    const processingSpeed = this.metrics.averageChunkProcessingTime > 0 
      ? Math.min(100, (1000 / this.metrics.averageChunkProcessingTime) * 10)
      : 100
    
    const reliability = Math.max(0, 100 - this.metrics.circuitBreakerTrips * 10)
    
    const score = 
      this.metrics.successRate * weights.successRate +
      this.metrics.averageConfidence * 100 * weights.averageConfidence +
      this.metrics.memoryEfficiency * weights.memoryEfficiency +
      processingSpeed * weights.processingSpeed +
      reliability * weights.reliability
    
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Update performance service with current metrics
   */
  private updatePerformanceService(): void {
    this.performanceService.addStreamingMetrics({
      activeSessions: this.metrics.activeSessions,
      totalChunksProcessed: this.metrics.chunksProcessed,
      averageProcessingTime: this.metrics.averageChunkProcessingTime,
      successRate: this.metrics.successRate,
      memoryUsage: this.metrics.currentMemoryUsage,
      backpressureActivations: this.metrics.backpressureActivations,
      qualityScore: this.calculateQualityScore()
    })
  }

  /**
   * Add alert callback
   */
  onAlert(callback: (alert: AlertEvent) => void): () => void {
    this.alertCallbacks.add(callback)
    return () => this.alertCallbacks.delete(callback)
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamingTranscriptionMetrics {
    return { ...this.metrics }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(): StreamingTranscriptionMetrics[] {
    return [...this.metricsHistory]
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values())
  }

  /**
   * Clear specific alert
   */
  clearAlert(metric: keyof StreamingTranscriptionMetrics, sessionId?: string): void {
    const alertKey = `${metric}-${sessionId || 'global'}`
    this.activeAlerts.delete(alertKey)
  }

  /**
   * Clear all alerts
   */
  clearAllAlerts(): void {
    this.activeAlerts.clear()
  }

  /**
   * Update alert configuration
   */
  updateAlertConfig(newConfig: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...newConfig }
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics()
    this.sessionStartTimes.clear()
    this.sessionMetrics.clear()
    this.processingTimes.length = 0
    this.memorySnapshots.length = 0
    this.confidenceScores.length = 0
    this.metricsHistory.length = 0
    this.clearAllAlerts()
  }

  /**
   * Generate monitoring report
   */
  generateReport(): {
    overview: StreamingTranscriptionMetrics
    alerts: AlertEvent[]
    recommendations: string[]
    systemHealth: 'excellent' | 'good' | 'degraded' | 'poor'
  } {
    const recommendations: string[] = []
    
    if (this.metrics.errorRate > 2) {
      recommendations.push('Consider investigating error patterns and improving error handling')
    }
    
    if (this.metrics.memoryEfficiency < 80) {
      recommendations.push('Memory usage is high - consider enabling memory optimizations')
    }
    
    if (this.metrics.backpressureActivations > 5) {
      recommendations.push('Frequent backpressure detected - consider adjusting buffer sizes')
    }
    
    if (this.metrics.averageConfidence < 0.8) {
      recommendations.push('Low confidence scores - check audio quality and model performance')
    }
    
    return {
      overview: this.getMetrics(),
      alerts: this.getActiveAlerts(),
      recommendations,
      systemHealth: this.metrics.processingQuality
    }
  }

  /**
   * Cleanup monitoring resources
   */
  destroy(): void {
    this.resetMetrics()
    this.alertCallbacks.clear()
  }
}

/**
 * Export monitoring interfaces
 */
export type { StreamingTranscriptionMetrics, AlertConfig, AlertEvent }
