/**
 * FSM Telemetry and Logging System
 * Comprehensive telemetry, logging, and visualization for transcript state transitions
 */

import {logger} from '../../services/gemini-logger'
import {
  TranscriptState,
  TransitionReason,
  TranscriptUtterance,
  FSMTransition,
  TransitionRejection
} from './TranscriptStates'

export enum TelemetryLevel {
  OFF = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5
}

export interface FSMTelemetryConfig {
  level: TelemetryLevel
  enableConsoleOutput: boolean
  enableMetrics: boolean
  enableVisualization: boolean
  enablePerformanceTracking: boolean
  logTransitions: boolean
  logPartialUpdates: boolean
  logErrors: boolean
  logCleanup: boolean
  metricsFlushIntervalMs: number
}

export const DEFAULT_TELEMETRY_CONFIG: FSMTelemetryConfig = {
  level: TelemetryLevel.INFO,
  enableConsoleOutput: true,
  enableMetrics: true,
  enableVisualization: false,
  enablePerformanceTracking: true,
  logTransitions: true,
  logPartialUpdates: false, // Can be verbose
  logErrors: true,
  logCleanup: true,
  metricsFlushIntervalMs: 30000 // 30 seconds
}

export interface TelemetryMetrics {
  totalTransitions: number
  successfulTransitions: number
  rejectedTransitions: number
  transitionsByState: Record<TranscriptState, number>
  transitionsByReason: Record<TransitionReason, number>
  averageTransitionTime: number
  maxTransitionTime: number
  minTransitionTime: number
  errorCount: number
  partialUpdateCount: number
  cleanupOperations: number
  lastFlush: number
}

export interface StateTransitionVisualization {
  from: TranscriptState
  to: TranscriptState
  count: number
  avgLatency?: number
  successRate: number
}

export class FSMTelemetry {
  private config: FSMTelemetryConfig
  private metrics: TelemetryMetrics
  private metricsFlushTimer: NodeJS.Timeout | null = null
  private performanceTimers: Map<string, number> = new Map()

  constructor(config: Partial<FSMTelemetryConfig> = {}) {
    this.config = {...DEFAULT_TELEMETRY_CONFIG, ...config}
    this.metrics = this.initializeMetrics()

    if (this.config.enableMetrics) {
      this.startMetricsFlush()
    }
  }

  private initializeMetrics(): TelemetryMetrics {
    const transitionsByState = {} as Record<TranscriptState, number>
    const transitionsByReason = {} as Record<TransitionReason, number>

    // Initialize all state counters
    Object.values(TranscriptState).forEach(state => {
      transitionsByState[state] = 0
    })

    // Initialize all reason counters
    Object.values(TransitionReason).forEach(reason => {
      transitionsByReason[reason] = 0
    })

    return {
      totalTransitions: 0,
      successfulTransitions: 0,
      rejectedTransitions: 0,
      transitionsByState,
      transitionsByReason,
      averageTransitionTime: 0,
      maxTransitionTime: 0,
      minTransitionTime: Infinity,
      errorCount: 0,
      partialUpdateCount: 0,
      cleanupOperations: 0,
      lastFlush: Date.now()
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<FSMTelemetryConfig>): void {
    const oldConfig = {...this.config}
    this.config = {...this.config, ...newConfig}

    // Restart metrics flush if interval changed
    if (oldConfig.metricsFlushIntervalMs !== this.config.metricsFlushIntervalMs) {
      this.stopMetricsFlush()
      if (this.config.enableMetrics) {
        this.startMetricsFlush()
      }
    }
  }

  /**
   * Log a successful state transition
   */
  logTransition(transition: FSMTransition, utterance?: TranscriptUtterance): void {
    if (this.config.level < TelemetryLevel.INFO) return

    this.metrics.totalTransitions++
    this.metrics.successfulTransitions++
    this.metrics.transitionsByState[transition.to]++
    this.metrics.transitionsByReason[transition.reason]++

    // Track performance metrics
    if (transition.latencyMs !== undefined) {
      this.updateLatencyMetrics(transition.latencyMs)
    }

    if (this.config.logTransitions) {
      const context = {
        utteranceId: transition.utteranceId,
        from: transition.from,
        to: transition.to,
        reason: transition.reason,
        latencyMs: transition.latencyMs,
        textLength: utterance?.textDraft?.length || 0,
        confidence: utterance?.confidence
      }

      if (this.config.enableConsoleOutput && this.config.level >= TelemetryLevel.INFO) {
        logger.info(`[FSM] Transition: ${transition.from} → ${transition.to}`, context)
      }
    }
  }

  /**
   * Log a rejected transition
   */
  logRejection(rejection: TransitionRejection): void {
    if (this.config.level < TelemetryLevel.WARN) return

    this.metrics.rejectedTransitions++

    const context = {
      utteranceId: rejection.utteranceId,
      from: rejection.from,
      attemptedTo: rejection.attemptedTo,
      reason: rejection.reason,
      cause: rejection.cause
    }

    if (this.config.enableConsoleOutput) {
      logger.warn(
        `[FSM] Transition rejected: ${rejection.from} → ${rejection.attemptedTo} (${rejection.cause})`,
        context
      )
    }
  }

  /**
   * Log partial update
   */
  logPartialUpdate(utteranceId: string, textLength: number, confidence?: number): void {
    if (this.config.level < TelemetryLevel.DEBUG || !this.config.logPartialUpdates) return

    this.metrics.partialUpdateCount++

    if (this.config.enableConsoleOutput) {
      logger.debug(`[FSM] Partial update: ${utteranceId}`, {
        textLength,
        confidence,
        totalPartials: this.metrics.partialUpdateCount
      })
    }
  }

  /**
   * Log an error
   */
  logError(error: string, context?: Record<string, unknown>): void {
    if (this.config.level < TelemetryLevel.ERROR || !this.config.logErrors) return

    this.metrics.errorCount++

    if (this.config.enableConsoleOutput) {
      logger.error(`[FSM] Error: ${error}`, context)
    }
  }

  /**
   * Log cleanup operations
   */
  logCleanup(removedCount: number, remainingCount: number, type: 'utterances' | 'history'): void {
    if (this.config.level < TelemetryLevel.INFO || !this.config.logCleanup) return

    this.metrics.cleanupOperations++

    if (this.config.enableConsoleOutput) {
      logger.info(`[FSM] Cleanup: Removed ${removedCount} ${type}, ${remainingCount} remaining`)
    }
  }

  /**
   * Start performance timer
   */
  startPerformanceTimer(id: string): void {
    if (!this.config.enablePerformanceTracking) return
    this.performanceTimers.set(id, performance?.now?.() || Date.now())
  }

  /**
   * End performance timer and log result
   */
  endPerformanceTimer(
    id: string,
    operation: string,
    context?: Record<string, unknown>
  ): number | undefined {
    if (!this.config.enablePerformanceTracking) return

    const startTime = this.performanceTimers.get(id)
    if (!startTime) return

    const endTime = performance?.now?.() || Date.now()
    const duration = endTime - startTime
    this.performanceTimers.delete(id)

    if (this.config.level >= TelemetryLevel.DEBUG && this.config.enableConsoleOutput) {
      logger.debug(`[FSM] Performance: ${operation} took ${duration.toFixed(2)}ms`, context)
    }

    return duration
  }

  /**
   * Generate visualization data for state transitions
   */
  generateVisualization(): StateTransitionVisualization[] {
    if (!this.config.enableVisualization) return []

    const visualizations: StateTransitionVisualization[] = []
    const states = Object.values(TranscriptState)

    // Create visualization data for each state transition pattern
    for (const from of states) {
      for (const to of states) {
        const fromCount = this.metrics.transitionsByState[from] || 0
        const toCount = this.metrics.transitionsByState[to] || 0

        if (fromCount > 0 && toCount > 0) {
          visualizations.push({
            from,
            to,
            count: Math.min(fromCount, toCount),
            avgLatency: this.metrics.averageTransitionTime,
            successRate: this.calculateSuccessRate()
          })
        }
      }
    }

    return visualizations.sort((a, b) => b.count - a.count)
  }

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<TelemetryMetrics> {
    return {...this.metrics}
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics()
  }

  /**
   * Generate telemetry summary report
   */
  generateReport(): string {
    const report = []
    const now = Date.now()
    const uptime = now - (this.metrics.lastFlush || now)

    report.push('=== FSM Telemetry Report ===')
    report.push(`Uptime: ${Math.round(uptime / 1000)}s`)
    report.push(`Total Transitions: ${this.metrics.totalTransitions}`)
    report.push(`Success Rate: ${this.getOverallSuccessRate().toFixed(1)}%`)
    report.push(`Average Transition Time: ${this.metrics.averageTransitionTime.toFixed(2)}ms`)
    report.push(`Errors: ${this.metrics.errorCount}`)
    report.push(`Partial Updates: ${this.metrics.partialUpdateCount}`)

    report.push('\\nState Distribution:')
    Object.entries(this.metrics.transitionsByState).forEach(([state, count]) => {
      if (count > 0) {
        report.push(`  ${state}: ${count}`)
      }
    })

    report.push('\\nTransition Reasons:')
    Object.entries(this.metrics.transitionsByReason).forEach(([reason, count]) => {
      if (count > 0) {
        report.push(`  ${reason}: ${count}`)
      }
    })

    return report.join('\\n')
  }

  /**
   * Destroy telemetry system
   */
  destroy(): void {
    this.stopMetricsFlush()
    this.performanceTimers.clear()
    this.resetMetrics()
  }

  // Private methods

  private updateLatencyMetrics(latencyMs: number): void {
    if (latencyMs < this.metrics.minTransitionTime) {
      this.metrics.minTransitionTime = latencyMs
    }
    if (latencyMs > this.metrics.maxTransitionTime) {
      this.metrics.maxTransitionTime = latencyMs
    }

    // Update rolling average
    const totalTime = this.metrics.averageTransitionTime * (this.metrics.successfulTransitions - 1)
    this.metrics.averageTransitionTime =
      (totalTime + latencyMs) / this.metrics.successfulTransitions
  }

  private calculateSuccessRate(/* from: TranscriptState, to: TranscriptState */): number {
    const total = this.metrics.totalTransitions
    const successful = this.metrics.successfulTransitions
    return total > 0 ? (successful / total) * 100 : 100
  }

  private getOverallSuccessRate(): number {
    const total = this.metrics.totalTransitions + this.metrics.rejectedTransitions
    return total > 0 ? (this.metrics.successfulTransitions / total) * 100 : 100
  }

  private startMetricsFlush(): void {
    this.metricsFlushTimer = setInterval(() => {
      if (this.config.level >= TelemetryLevel.DEBUG && this.config.enableConsoleOutput) {
        logger.debug('[FSM] Metrics flush', {
          totalTransitions: this.metrics.totalTransitions,
          successRate: this.getOverallSuccessRate().toFixed(1) + '%',
          errors: this.metrics.errorCount
        })
      }
      this.metrics.lastFlush = Date.now()
    }, this.config.metricsFlushIntervalMs)
  }

  private stopMetricsFlush(): void {
    if (this.metricsFlushTimer) {
      clearInterval(this.metricsFlushTimer)
      this.metricsFlushTimer = null
    }
  }
}

// Global FSM telemetry instance
export const fsmTelemetry = new FSMTelemetry()
