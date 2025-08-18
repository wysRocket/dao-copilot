/**
 * Centralized Telemetry System
 *
 * Coordinates and aggregates telemetry from OrphanDetectionWorker, GapDetector, and RecoveryManager.
 * Provides unified metrics, logging, and event emission for the entire transcription loss prevention system.
 *
 * Task 5.4 - Implement telemetry and logging
 */

import {EventEmitter} from 'events'
import {logger} from '../gemini-logger'
import {OrphanDetectionWorker, OrphanDetectionStats, DetectedOrphan} from './OrphanDetectionWorker'
import {GapDetector, GapDetectionStats, DetectedGap, SpeechPattern} from './GapDetector'
import {
  RecoveryManager,
  RecoveryStats,
  RecoveryIssue,
  RecoveryResult,
  RecoveryAttempt
} from './RecoveryManager'

/**
 * Configuration for telemetry collection and reporting
 */
export interface TelemetryConfig {
  /** Enable comprehensive telemetry collection (default: true) */
  enableTelemetry: boolean
  /** Enable detailed performance metrics (default: true) */
  enablePerformanceMetrics: boolean
  /** Enable debug-level telemetry events (default: false) */
  enableDebugEvents: boolean
  /** Telemetry aggregation interval in ms (default: 30000) */
  aggregationIntervalMs: number
  /** Maximum telemetry history to retain (default: 1000) */
  maxTelemetryHistory: number
  /** Enable automatic telemetry reporting (default: true) */
  enableAutoReporting: boolean
  /** Telemetry log level (default: 'info') */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Enable telemetry data export (default: false) */
  enableDataExport: boolean
  /** Export interval for telemetry data in ms (default: 300000) */
  dataExportIntervalMs: number
  /** Maximum aggregated stats to retain (default: 100) */
  maxAggregatedStats: number
}

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enableTelemetry: true,
  enablePerformanceMetrics: true,
  enableDebugEvents: false,
  aggregationIntervalMs: 30000, // 30 seconds
  maxTelemetryHistory: 1000,
  enableAutoReporting: true,
  logLevel: 'info',
  enableDataExport: false,
  dataExportIntervalMs: 300000, // 5 minutes
  maxAggregatedStats: 100
}

/**
 * Comprehensive telemetry event data
 */
export interface TelemetryEvent {
  /** Unique event identifier */
  id: string
  /** Event timestamp */
  timestamp: number
  /** Source component that generated the event */
  source: 'orphan_detector' | 'gap_detector' | 'recovery_manager' | 'telemetry_coordinator'
  /** Event category */
  category: 'detection' | 'recovery' | 'performance' | 'error' | 'system'
  /** Event type */
  eventType: string
  /** Event severity level */
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical'
  /** Event description */
  description: string
  /** Event metadata and context */
  metadata: {
    sessionId?: string
    issueId?: string
    orphanId?: string
    gapId?: string
    recoveryId?: string
    duration?: number
    confidence?: number
    success?: boolean
    errorMessage?: string
    performanceMetrics?: Record<string, number>
    customData?: Record<string, unknown>
  }
}

/**
 * Aggregated telemetry statistics
 */
export interface AggregatedTelemetryStats {
  /** Aggregation timestamp */
  timestamp: number
  /** Aggregation period in milliseconds */
  periodMs: number

  /** Orphan detection statistics */
  orphanDetection: {
    totalOrphansDetected: number
    orphansByType: Record<string, number>
    averageDetectionTime: number
    detectionSuccessRate: number
    averageOrphanAge: number
  }

  /** Gap detection statistics */
  gapDetection: {
    totalGapsDetected: number
    gapsByType: Record<string, number>
    averageAnalysisTime: number
    averageGapDuration: number
    averageConfidence: number
  }

  /** Recovery statistics */
  recovery: {
    totalRecoveryAttempts: number
    successfulRecoveries: number
    failedRecoveries: number
    averageRecoveryTime: number
    strategySuccessRates: Record<string, number>
    averageQualityImprovement: number
  }

  /** System performance statistics */
  performance: {
    totalEvents: number
    eventsPerSecond: number
    averageEventProcessingTime: number
    memoryUsage: number
    cpuUtilization: number
    systemHealth: number
  }

  /** Error statistics */
  errors: {
    totalErrors: number
    errorsByCategory: Record<string, number>
    errorsBySource: Record<string, number>
    criticalErrors: number
    errorRate: number
  }
}

/**
 * Telemetry export data structure
 */
export interface TelemetryExport {
  /** Export timestamp */
  exportTimestamp: number
  /** Export period covered */
  periodStart: number
  /** Export period end */
  periodEnd: number
  /** Configuration at time of export */
  configuration: TelemetryConfig
  /** Raw telemetry events */
  events: TelemetryEvent[]
  /** Aggregated statistics */
  aggregatedStats: AggregatedTelemetryStats[]
  /** Summary metrics */
  summary: {
    totalEvents: number
    uniqueSessions: number
    totalOrphansDetected: number
    totalGapsDetected: number
    totalRecoveryAttempts: number
    overallSuccessRate: number
    systemUptime: number
  }
}

/**
 * Events emitted by the TelemetryCoordinator
 */
export interface TelemetryCoordinatorEvents {
  /** Emitted when a telemetry event is recorded */
  telemetryEvent: (event: TelemetryEvent) => void
  /** Emitted when statistics are aggregated */
  statisticsAggregated: (stats: AggregatedTelemetryStats) => void
  /** Emitted when telemetry data is exported */
  dataExported: (exportData: TelemetryExport) => void
  /** Emitted when a telemetry error occurs */
  telemetryError: (error: string, context: Record<string, unknown>) => void
  /** Emitted for system health updates */
  systemHealthUpdate: (health: number, metrics: Record<string, number>) => void
}

/**
 * TelemetryCoordinator - Centralized telemetry management system
 *
 * This system provides:
 * 1. Unified telemetry collection from all transcription loss prevention components
 * 2. Real-time event processing and aggregation
 * 3. Performance monitoring and system health tracking
 * 4. Automatic telemetry reporting and data export
 * 5. Comprehensive logging integration
 */
export class TelemetryCoordinator extends EventEmitter {
  private config: TelemetryConfig
  private startTime: number = Date.now()

  // Component references
  private orphanDetector: OrphanDetectionWorker | null = null
  private gapDetector: GapDetector | null = null
  private recoveryManager: RecoveryManager | null = null

  // Telemetry data storage
  private telemetryEvents: TelemetryEvent[] = []
  private aggregatedStats: AggregatedTelemetryStats[] = []
  private eventIdCounter: number = 0

  // Aggregation and reporting timers
  private aggregationTimer: NodeJS.Timeout | null = null
  private exportTimer: NodeJS.Timeout | null = null

  // Performance tracking
  private lastAggregationTime: number = 0
  private processingTimes: number[] = []
  private eventCounts: Map<string, number> = new Map()

  constructor(config: Partial<TelemetryConfig> = {}) {
    super()

    this.config = {...DEFAULT_TELEMETRY_CONFIG, ...config}

    if (this.config.enableTelemetry) {
      this.initializeTelemetry()
    }

    logger.info('TelemetryCoordinator initialized', {
      telemetryEnabled: this.config.enableTelemetry,
      aggregationInterval: this.config.aggregationIntervalMs,
      performanceMetrics: this.config.enablePerformanceMetrics
    })
  }

  /**
   * Initialize telemetry collection and processing
   */
  private initializeTelemetry(): void {
    // Start aggregation timer
    if (this.config.enableAutoReporting) {
      this.aggregationTimer = setInterval(() => {
        this.aggregateStatistics()
      }, this.config.aggregationIntervalMs)
    }

    // Start export timer if enabled
    if (this.config.enableDataExport) {
      this.exportTimer = setInterval(() => {
        this.exportTelemetryData()
      }, this.config.dataExportIntervalMs)
    }

    // Record initialization event
    this.recordEvent({
      source: 'telemetry_coordinator',
      category: 'system',
      eventType: 'telemetry_initialized',
      severity: 'info',
      description: 'Telemetry system initialized successfully',
      metadata: {
        configuration: this.config
      }
    })
  }

  /**
   * Register OrphanDetectionWorker for telemetry collection
   */
  public registerOrphanDetector(detector: OrphanDetectionWorker): void {
    this.orphanDetector = detector

    // Subscribe to orphan detection events
    detector.on('orphanDetected', (orphan: DetectedOrphan) => {
      this.recordEvent({
        source: 'orphan_detector',
        category: 'detection',
        eventType: 'orphan_detected',
        severity: 'info',
        description: `Orphan detected: ${orphan.orphanType}`,
        metadata: {
          orphanId: orphan.id,
          sessionId: orphan.sessionId,
          confidence: orphan.confidence,
          orphanType: orphan.orphanType,
          ageMs: orphan.ageMs,
          customData: {
            textLength: orphan.transcriptionResult.text?.length || 0,
            isFinal: orphan.transcriptionResult.isFinal
          }
        }
      })
    })

    detector.on('scanCompleted', (stats: OrphanDetectionStats) => {
      this.recordEvent({
        source: 'orphan_detector',
        category: 'performance',
        eventType: 'scan_completed',
        severity: 'debug',
        description: 'Orphan detection scan completed',
        metadata: {
          duration: stats.lastScanDuration,
          orphansFound: stats.totalOrphansDetected,
          scansCompleted: stats.scansCompleted,
          performanceMetrics: {
            scanDuration: stats.lastScanDuration,
            averageScanTime: stats.averageScanTime,
            peakScanTime: stats.peakScanTime
          }
        }
      })
    })

    detector.on('recoveryAttempted', (orphanId: string, method: string, success: boolean) => {
      this.recordEvent({
        source: 'orphan_detector',
        category: 'recovery',
        eventType: 'recovery_attempted',
        severity: success ? 'info' : 'warn',
        description: `Recovery attempted for orphan ${orphanId} using ${method}`,
        metadata: {
          orphanId,
          success,
          customData: {
            recoveryMethod: method
          }
        }
      })
    })

    logger.info('TelemetryCoordinator: OrphanDetectionWorker registered for telemetry')
  }

  /**
   * Register GapDetector for telemetry collection
   */
  public registerGapDetector(detector: GapDetector): void {
    this.gapDetector = detector

    // Subscribe to gap detection events
    detector.on('gapDetected', (gap: DetectedGap) => {
      this.recordEvent({
        source: 'gap_detector',
        category: 'detection',
        eventType: 'gap_detected',
        severity: 'info',
        description: `Gap detected: ${gap.gapType}`,
        metadata: {
          gapId: gap.id,
          sessionId: gap.metadata.sessionId,
          confidence: gap.confidence,
          duration: gap.durationMs,
          customData: {
            gapType: gap.gapType,
            detectionMethod: gap.metadata.detectionMethod,
            alignmentScore: gap.metadata.alignmentScore
          }
        }
      })
    })

    detector.on('analysisCompleted', (stats: GapDetectionStats) => {
      this.recordEvent({
        source: 'gap_detector',
        category: 'performance',
        eventType: 'analysis_completed',
        severity: 'debug',
        description: 'Gap detection analysis completed',
        metadata: {
          duration: stats.totalAnalysisTime,
          gapsDetected: stats.totalGapsDetected,
          averageConfidence: stats.averageConfidence,
          performanceMetrics: {
            analysisTime: stats.totalAnalysisTime,
            averageTime: stats.performanceMetrics.averageAnalysisTime,
            peakTime: stats.performanceMetrics.peakAnalysisTime,
            transcriptsAnalyzed: stats.performanceMetrics.totalTranscriptsAnalyzed
          }
        }
      })
    })

    detector.on('speechPatternChanged', (pattern: SpeechPattern) => {
      this.recordEvent({
        source: 'gap_detector',
        category: 'detection',
        eventType: 'speech_pattern_changed',
        severity: 'debug',
        description: 'Speech pattern updated',
        metadata: {
          customData: {
            averagePace: pattern.averagePace,
            rhythmConsistency: pattern.rhythmConsistency,
            energyLevels: pattern.energyLevels.length,
            pausePatterns: pattern.pausePatterns.length
          }
        }
      })
    })

    detector.on('alignmentCalculated', (score: number, context: string) => {
      this.recordEvent({
        source: 'gap_detector',
        category: 'performance',
        eventType: 'alignment_calculated',
        severity: 'debug',
        description: 'Audio alignment calculated',
        metadata: {
          customData: {
            alignmentScore: score,
            context
          }
        }
      })
    })

    logger.info('TelemetryCoordinator: GapDetector registered for telemetry')
  }

  /**
   * Register RecoveryManager for telemetry collection
   */
  public registerRecoveryManager(manager: RecoveryManager): void {
    this.recoveryManager = manager

    // Subscribe to recovery events
    manager.on('issueDetected', (issue: RecoveryIssue) => {
      this.recordEvent({
        source: 'recovery_manager',
        category: 'detection',
        eventType: 'issue_detected',
        severity: issue.severity >= 4 ? 'warn' : 'info',
        description: `Recovery issue detected: ${issue.issueType}`,
        metadata: {
          issueId: issue.id,
          sessionId: issue.sessionId,
          confidence: issue.confidence,
          customData: {
            issueType: issue.issueType,
            severity: issue.severity,
            recommendedStrategies: issue.recommendedStrategies
          }
        }
      })
    })

    manager.on('recoveryStarted', (issueId: string, strategy: string) => {
      this.recordEvent({
        source: 'recovery_manager',
        category: 'recovery',
        eventType: 'recovery_started',
        severity: 'info',
        description: `Recovery started for issue ${issueId}`,
        metadata: {
          issueId,
          customData: {
            strategy
          }
        }
      })
    })

    manager.on('recoveryAttemptCompleted', (issueId: string, attempt: RecoveryAttempt) => {
      this.recordEvent({
        source: 'recovery_manager',
        category: 'recovery',
        eventType: 'recovery_attempt_completed',
        severity: attempt.successful ? 'info' : 'warn',
        description: `Recovery attempt ${attempt.successful ? 'succeeded' : 'failed'} for issue ${issueId}`,
        metadata: {
          issueId,
          duration: attempt.durationMs,
          success: attempt.successful,
          confidence: attempt.confidence,
          customData: {
            strategy: attempt.strategy,
            failureReason: attempt.failureReason
          },
          performanceMetrics: {
            processingTime: attempt.metrics.processingTime,
            resourceUsage: attempt.metrics.resourceUsage,
            qualityScore: attempt.metrics.qualityScore
          }
        }
      })
    })

    manager.on('recoveryCompleted', (issueId: string, result: RecoveryResult) => {
      this.recordEvent({
        source: 'recovery_manager',
        category: 'recovery',
        eventType: 'recovery_completed',
        severity: result.successful ? 'info' : 'error',
        description: `Recovery ${result.successful ? 'completed successfully' : 'failed'} for issue ${issueId}`,
        metadata: {
          issueId,
          success: result.successful,
          confidence: result.confidence,
          customData: {
            recoveryType: result.recoveryType,
            recoveredTranscriptions: result.recoveredTranscriptions.length,
            validationScore: result.validation.validationScore
          },
          performanceMetrics: {
            recoveryTime: result.performanceMetrics.recoveryTime,
            resourceUsage: result.performanceMetrics.resourceUsage,
            qualityImprovement: result.performanceMetrics.qualityImprovement
          }
        }
      })
    })

    manager.on('recoveryFailed', (issueId: string, reason: string) => {
      this.recordEvent({
        source: 'recovery_manager',
        category: 'error',
        eventType: 'recovery_failed',
        severity: 'error',
        description: `Recovery failed for issue ${issueId}`,
        metadata: {
          issueId,
          errorMessage: reason,
          success: false
        }
      })
    })

    manager.on('statisticsUpdated', (stats: RecoveryStats) => {
      this.recordEvent({
        source: 'recovery_manager',
        category: 'performance',
        eventType: 'statistics_updated',
        severity: 'debug',
        description: 'Recovery statistics updated',
        metadata: {
          customData: {
            totalProcessed: stats.totalIssuesProcessed,
            successfulRecoveries: stats.successfulRecoveries,
            failedRecoveries: stats.failedRecoveries,
            activeRecoveries: stats.activeRecoveries
          },
          performanceMetrics: {
            averageRecoveryTime: stats.averageRecoveryTime,
            totalRecoveryTime: stats.performanceMetrics.totalRecoveryTime,
            averageQualityImprovement: stats.performanceMetrics.averageQualityImprovement,
            resourceUtilization: stats.performanceMetrics.resourceUtilization
          }
        }
      })
    })

    logger.info('TelemetryCoordinator: RecoveryManager registered for telemetry')
  }

  /**
   * Record a telemetry event
   */
  public recordEvent(eventData: Omit<TelemetryEvent, 'id' | 'timestamp'>): void {
    if (!this.config.enableTelemetry) {
      return
    }

    const processingStartTime = Date.now()

    const event: TelemetryEvent = {
      id: `tel_${this.eventIdCounter++}_${Date.now()}`,
      timestamp: Date.now(),
      ...eventData
    }

    // Store the event
    this.telemetryEvents.push(event)

    // Maintain event history limit
    if (this.telemetryEvents.length > this.config.maxTelemetryHistory) {
      this.telemetryEvents = this.telemetryEvents.slice(-this.config.maxTelemetryHistory)
    }

    // Update event counts
    const eventKey = `${event.source}_${event.eventType}`
    this.eventCounts.set(eventKey, (this.eventCounts.get(eventKey) || 0) + 1)

    // Log the event based on severity and configuration
    this.logEvent(event)

    // Emit the telemetry event
    this.emit('telemetryEvent', event)

    // Track processing time
    if (this.config.enablePerformanceMetrics) {
      const processingTime = Date.now() - processingStartTime
      this.processingTimes.push(processingTime)

      // Keep processing times manageable
      if (this.processingTimes.length > 1000) {
        this.processingTimes = this.processingTimes.slice(-1000)
      }
    }
  }

  /**
   * Log telemetry event based on configuration
   */
  private logEvent(event: TelemetryEvent): void {
    const logLevel =
      event.severity === 'debug'
        ? 'debug'
        : event.severity === 'info'
          ? 'info'
          : event.severity === 'warn'
            ? 'warn'
            : 'error'

    // Check if we should log this event based on configuration
    const shouldLog = this.config.enableDebugEvents || event.severity !== 'debug'

    if (shouldLog && this.shouldLogLevel(logLevel)) {
      const logData = {
        eventId: event.id,
        source: event.source,
        category: event.category,
        eventType: event.eventType,
        ...event.metadata
      }

      logger[logLevel](event.description, logData)
    }
  }

  /**
   * Check if we should log at the given level
   */
  private shouldLogLevel(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error']
    const configLevel = levels.indexOf(this.config.logLevel)
    const eventLevel = levels.indexOf(level)

    return eventLevel >= configLevel
  }

  /**
   * Aggregate statistics from all sources
   */
  public aggregateStatistics(): AggregatedTelemetryStats {
    const now = Date.now()
    const periodMs =
      this.lastAggregationTime > 0
        ? now - this.lastAggregationTime
        : this.config.aggregationIntervalMs
    this.lastAggregationTime = now

    // Get current statistics from components
    const orphanStats = this.orphanDetector?.getStatistics()
    const gapStats = this.gapDetector?.getStatistics()
    const recoveryStats = this.recoveryManager?.getStatistics()

    // Aggregate performance metrics
    const averageEventProcessingTime =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((a, b) => a + b) / this.processingTimes.length
        : 0

    const eventsInPeriod = this.telemetryEvents.filter(e => e.timestamp > now - periodMs)
    const eventsPerSecond = eventsInPeriod.length / (periodMs / 1000)

    // Calculate error statistics
    const errorEvents = eventsInPeriod.filter(e => e.category === 'error' || e.severity === 'error')
    const criticalErrors = errorEvents.filter(e => e.severity === 'critical').length
    const errorsByCategory = this.groupBy(errorEvents, 'category')
    const errorsBySource = this.groupBy(errorEvents, 'source')

    const aggregatedStats: AggregatedTelemetryStats = {
      timestamp: now,
      periodMs,

      orphanDetection: {
        totalOrphansDetected: orphanStats?.totalOrphansDetected || 0,
        orphansByType: orphanStats?.orphansByType || {},
        averageDetectionTime: orphanStats?.averageScanTime || 0,
        detectionSuccessRate: orphanStats
          ? orphanStats.successfulRecoveries / Math.max(orphanStats.totalOrphansDetected, 1)
          : 0,
        averageOrphanAge: orphanStats?.averageOrphanAge || 0
      },

      gapDetection: {
        totalGapsDetected: gapStats?.totalGapsDetected || 0,
        gapsByType: gapStats?.gapsByType || {},
        averageAnalysisTime: gapStats?.performanceMetrics.averageAnalysisTime || 0,
        averageGapDuration: gapStats?.averageGapDuration || 0,
        averageConfidence: gapStats?.averageConfidence || 0
      },

      recovery: {
        totalRecoveryAttempts: recoveryStats?.totalIssuesProcessed || 0,
        successfulRecoveries: recoveryStats?.successfulRecoveries || 0,
        failedRecoveries: recoveryStats?.failedRecoveries || 0,
        averageRecoveryTime: recoveryStats?.averageRecoveryTime || 0,
        strategySuccessRates: recoveryStats?.strategySuccessRates || {},
        averageQualityImprovement: recoveryStats?.performanceMetrics.averageQualityImprovement || 0
      },

      performance: {
        totalEvents: this.telemetryEvents.length,
        eventsPerSecond,
        averageEventProcessingTime,
        memoryUsage: this.getMemoryUsage(),
        cpuUtilization: this.getCPUUtilization(),
        systemHealth: this.calculateSystemHealth()
      },

      errors: {
        totalErrors: errorEvents.length,
        errorsByCategory,
        errorsBySource,
        criticalErrors,
        errorRate: errorEvents.length / Math.max(eventsInPeriod.length, 1)
      }
    }

    // Store aggregated stats
    this.aggregatedStats.push(aggregatedStats)

    // Maintain aggregated stats limit
    if (this.aggregatedStats.length > this.config.maxAggregatedStats) {
      this.aggregatedStats = this.aggregatedStats.slice(-this.config.maxAggregatedStats)
    }

    // Emit aggregated statistics
    this.emit('statisticsAggregated', aggregatedStats)

    // Log aggregated statistics
    if (this.shouldLogLevel('info')) {
      logger.info('Telemetry statistics aggregated', {
        orphansDetected: aggregatedStats.orphanDetection.totalOrphansDetected,
        gapsDetected: aggregatedStats.gapDetection.totalGapsDetected,
        recoveryAttempts: aggregatedStats.recovery.totalRecoveryAttempts,
        successRate:
          aggregatedStats.recovery.successfulRecoveries /
          Math.max(aggregatedStats.recovery.totalRecoveryAttempts, 1),
        systemHealth: aggregatedStats.performance.systemHealth
      })
    }

    return aggregatedStats
  }

  /**
   * Export telemetry data
   */
  public exportTelemetryData(): TelemetryExport {
    const now = Date.now()
    const oldestEvent = this.telemetryEvents.length > 0 ? this.telemetryEvents[0].timestamp : now

    // Calculate unique sessions
    const uniqueSessions = new Set(
      this.telemetryEvents.filter(e => e.metadata.sessionId).map(e => e.metadata.sessionId)
    ).size

    const exportData: TelemetryExport = {
      exportTimestamp: now,
      periodStart: oldestEvent,
      periodEnd: now,
      configuration: {...this.config},
      events: [...this.telemetryEvents],
      aggregatedStats: [...this.aggregatedStats],
      summary: {
        totalEvents: this.telemetryEvents.length,
        uniqueSessions,
        totalOrphansDetected: this.orphanDetector?.getStatistics()?.totalOrphansDetected || 0,
        totalGapsDetected: this.gapDetector?.getStatistics()?.totalGapsDetected || 0,
        totalRecoveryAttempts: this.recoveryManager?.getStatistics()?.totalIssuesProcessed || 0,
        overallSuccessRate: this.calculateOverallSuccessRate(),
        systemUptime: now - this.startTime
      }
    }

    // Emit export event
    this.emit('dataExported', exportData)

    // Log export
    logger.info('Telemetry data exported', {
      eventsExported: exportData.events.length,
      statsExported: exportData.aggregatedStats.length,
      exportPeriod: now - oldestEvent
    })

    return exportData
  }

  /**
   * Helper methods
   */

  private groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce(
      (groups, item) => {
        const groupKey = String(item[key])
        groups[groupKey] = (groups[groupKey] || 0) + 1
        return groups
      },
      {} as Record<string, number>
    )
  }

  private getMemoryUsage(): number {
    // In a browser environment, this would need different implementation
    try {
      const memUsage = process.memoryUsage()
      return memUsage.heapUsed / memUsage.heapTotal
    } catch {
      return 0.5 // Default fallback
    }
  }

  private getCPUUtilization(): number {
    // This would require system-level monitoring in a real implementation
    return 0.3 // Placeholder value
  }

  private calculateSystemHealth(): number {
    // Calculate system health based on various metrics
    let health = 1.0

    // Reduce health based on error rate
    const recentEvents = this.telemetryEvents.filter(e => e.timestamp > Date.now() - 60000) // Last minute
    const errorEvents = recentEvents.filter(
      e => e.severity === 'error' || e.severity === 'critical'
    )
    const errorRate = errorEvents.length / Math.max(recentEvents.length, 1)

    health -= errorRate * 0.5

    // Reduce health based on performance
    const avgProcessingTime =
      this.processingTimes.length > 0
        ? this.processingTimes.slice(-100).reduce((a, b) => a + b) /
          Math.min(this.processingTimes.length, 100)
        : 0

    if (avgProcessingTime > 10) {
      // If processing takes more than 10ms on average
      health -= 0.2
    }

    // Ensure health is between 0 and 1
    return Math.max(0, Math.min(1, health))
  }

  private calculateOverallSuccessRate(): number {
    const orphanStats = this.orphanDetector?.getStatistics()
    const recoveryStats = this.recoveryManager?.getStatistics()

    const totalAttempts =
      (orphanStats?.totalOrphansDetected || 0) + (recoveryStats?.totalIssuesProcessed || 0)
    const totalSuccesses =
      (orphanStats?.successfulRecoveries || 0) + (recoveryStats?.successfulRecoveries || 0)

    return totalAttempts > 0 ? totalSuccesses / totalAttempts : 0
  }

  /**
   * Public API methods
   */

  /**
   * Get current telemetry statistics
   */
  public getCurrentStats(): AggregatedTelemetryStats | null {
    return this.aggregatedStats.length > 0
      ? this.aggregatedStats[this.aggregatedStats.length - 1]
      : null
  }

  /**
   * Get all telemetry events
   */
  public getTelemetryEvents(): TelemetryEvent[] {
    return [...this.telemetryEvents]
  }

  /**
   * Get telemetry events by criteria
   */
  public getEventsByCriteria(criteria: {
    source?: string
    category?: string
    eventType?: string
    severity?: string
    startTime?: number
    endTime?: number
  }): TelemetryEvent[] {
    return this.telemetryEvents.filter(event => {
      if (criteria.source && event.source !== criteria.source) return false
      if (criteria.category && event.category !== criteria.category) return false
      if (criteria.eventType && event.eventType !== criteria.eventType) return false
      if (criteria.severity && event.severity !== criteria.severity) return false
      if (criteria.startTime && event.timestamp < criteria.startTime) return false
      if (criteria.endTime && event.timestamp > criteria.endTime) return false
      return true
    })
  }

  /**
   * Get aggregated statistics history
   */
  public getAggregatedStats(): AggregatedTelemetryStats[] {
    return [...this.aggregatedStats]
  }

  /**
   * Update telemetry configuration
   */
  public updateConfig(updates: Partial<TelemetryConfig>): void {
    const oldConfig = {...this.config}
    this.config = {...this.config, ...updates}

    // Restart timers if intervals changed
    if (oldConfig.aggregationIntervalMs !== this.config.aggregationIntervalMs) {
      this.restartAggregationTimer()
    }

    if (oldConfig.dataExportIntervalMs !== this.config.dataExportIntervalMs) {
      this.restartExportTimer()
    }

    this.recordEvent({
      source: 'telemetry_coordinator',
      category: 'system',
      eventType: 'config_updated',
      severity: 'info',
      description: 'Telemetry configuration updated',
      metadata: {
        customData: {
          oldConfig,
          newConfig: this.config
        }
      }
    })

    logger.info('TelemetryCoordinator: Configuration updated', {
      telemetryEnabled: this.config.enableTelemetry,
      aggregationInterval: this.config.aggregationIntervalMs
    })
  }

  /**
   * Clear telemetry data
   */
  public clearTelemetryData(): void {
    const eventsCleared = this.telemetryEvents.length
    const statsCleared = this.aggregatedStats.length

    this.telemetryEvents = []
    this.aggregatedStats = []
    this.eventCounts.clear()
    this.processingTimes = []

    this.recordEvent({
      source: 'telemetry_coordinator',
      category: 'system',
      eventType: 'data_cleared',
      severity: 'info',
      description: 'Telemetry data cleared',
      metadata: {
        customData: {
          eventsCleared,
          statsCleared
        }
      }
    })

    logger.info('TelemetryCoordinator: Telemetry data cleared', {
      eventsCleared,
      statsCleared
    })
  }

  /**
   * Get system health status
   */
  public getSystemHealth(): {
    health: number
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: Record<string, unknown>
  } {
    const health = this.calculateSystemHealth()

    let status: 'healthy' | 'degraded' | 'unhealthy'
    if (health >= 0.8) status = 'healthy'
    else if (health >= 0.5) status = 'degraded'
    else status = 'unhealthy'

    const recentErrors = this.getEventsByCriteria({
      category: 'error',
      startTime: Date.now() - 300000 // Last 5 minutes
    })

    return {
      health,
      status,
      details: {
        uptime: Date.now() - this.startTime,
        totalEvents: this.telemetryEvents.length,
        recentErrors: recentErrors.length,
        averageProcessingTime:
          this.processingTimes.length > 0
            ? this.processingTimes.reduce((a, b) => a + b) / this.processingTimes.length
            : 0,
        componentsRegistered: {
          orphanDetector: this.orphanDetector !== null,
          gapDetector: this.gapDetector !== null,
          recoveryManager: this.recoveryManager !== null
        }
      }
    }
  }

  private restartAggregationTimer(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer)
    }

    if (this.config.enableAutoReporting) {
      this.aggregationTimer = setInterval(() => {
        this.aggregateStatistics()
      }, this.config.aggregationIntervalMs)
    }
  }

  private restartExportTimer(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer)
    }

    if (this.config.enableDataExport) {
      this.exportTimer = setInterval(() => {
        this.exportTelemetryData()
      }, this.config.dataExportIntervalMs)
    }
  }

  /**
   * Cleanup and shutdown
   */
  public shutdown(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer)
      this.aggregationTimer = null
    }

    if (this.exportTimer) {
      clearInterval(this.exportTimer)
      this.exportTimer = null
    }

    // Final statistics aggregation
    if (this.config.enableTelemetry) {
      this.aggregateStatistics()
    }

    this.recordEvent({
      source: 'telemetry_coordinator',
      category: 'system',
      eventType: 'telemetry_shutdown',
      severity: 'info',
      description: 'Telemetry system shutting down',
      metadata: {
        customData: {
          totalEventsCollected: this.telemetryEvents.length,
          uptime: Date.now() - this.startTime
        }
      }
    })

    logger.info('TelemetryCoordinator: Shutdown completed', {
      totalEvents: this.telemetryEvents.length,
      uptime: Date.now() - this.startTime
    })
  }
}

// Re-export types for external use
export type {TelemetryEvent, AggregatedTelemetryStats, TelemetryExport}
