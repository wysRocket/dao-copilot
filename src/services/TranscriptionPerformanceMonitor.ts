/**
 * Transcription Performance Monitor
 *
 * This service provides comprehensive performance monitoring for transcription rendering,
 * including memory usage tracking, render time analysis, and performance optimization suggestions.
 */

export interface PerformanceSnapshot {
  timestamp: number
  renderTime: number
  memoryUsage: number
  segmentCount: number
  visibleSegments: number
  frameRate: number
  cpuUsage?: number
}

export interface PerformanceAlert {
  id: string
  type: 'warning' | 'critical'
  category: 'memory' | 'performance' | 'responsiveness'
  message: string
  suggestion: string
  timestamp: number
  data?: Record<string, unknown>
}

export interface PerformanceStats {
  averageRenderTime: number
  peakRenderTime: number
  averageMemoryUsage: number
  peakMemoryUsage: number
  averageFrameRate: number
  minFrameRate: number
  totalRenders: number
  alertHistory: PerformanceAlert[]
}

export interface PerformanceThresholds {
  maxRenderTime: number // milliseconds
  maxMemoryUsage: number // MB
  minFrameRate: number // FPS
  memoryGrowthRate: number // MB/minute
  renderTimeVariance: number // Standard deviation threshold
}

export class TranscriptionPerformanceMonitor {
  private snapshots: PerformanceSnapshot[] = []
  private alerts: PerformanceAlert[] = []
  private thresholds: PerformanceThresholds
  private isMonitoring: boolean = false
  private monitoringInterval?: NodeJS.Timeout
  private frameRateCounter: number = 0
  private lastFrameTime: number = 0
  private nextAlertId: number = 1

  private readonly defaultThresholds: PerformanceThresholds = {
    maxRenderTime: 16, // 60 FPS target
    maxMemoryUsage: 100, // 100 MB
    minFrameRate: 30, // 30 FPS minimum
    memoryGrowthRate: 10, // 10 MB/minute
    renderTimeVariance: 5 // 5ms standard deviation
  }

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    this.thresholds = {...this.defaultThresholds, ...thresholds}
  }

  /**
   * Start performance monitoring
   */
  public startMonitoring(intervalMs: number = 1000): void {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.snapshots = []
    this.alerts = []
    this.frameRateCounter = 0
    this.lastFrameTime = performance.now()

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics()
    }, intervalMs)
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) return

    this.isMonitoring = false
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }
  }

  /**
   * Record a render performance snapshot
   */
  public recordRender(renderTime: number, segmentCount: number, visibleSegments: number): void {
    if (!this.isMonitoring) return

    const now = performance.now()
    const timeSinceLastFrame = now - this.lastFrameTime
    const frameRate = timeSinceLastFrame > 0 ? 1000 / timeSinceLastFrame : 0

    const snapshot: PerformanceSnapshot = {
      timestamp: now,
      renderTime,
      memoryUsage: this.estimateMemoryUsage(segmentCount),
      segmentCount,
      visibleSegments,
      frameRate
    }

    this.snapshots.push(snapshot)
    this.lastFrameTime = now
    this.frameRateCounter++

    // Keep only last 1000 snapshots to prevent memory bloat
    if (this.snapshots.length > 1000) {
      this.snapshots.shift()
    }

    // Check for performance issues
    this.checkPerformanceThresholds(snapshot)
  }

  /**
   * Get current performance statistics
   */
  public getStats(): PerformanceStats {
    if (this.snapshots.length === 0) {
      return {
        averageRenderTime: 0,
        peakRenderTime: 0,
        averageMemoryUsage: 0,
        peakMemoryUsage: 0,
        averageFrameRate: 0,
        minFrameRate: 0,
        totalRenders: 0,
        alertHistory: []
      }
    }

    const renderTimes = this.snapshots.map(s => s.renderTime)
    const memoryUsages = this.snapshots.map(s => s.memoryUsage)
    const frameRates = this.snapshots.map(s => s.frameRate).filter(fr => fr > 0)

    return {
      averageRenderTime: this.average(renderTimes),
      peakRenderTime: Math.max(...renderTimes),
      averageMemoryUsage: this.average(memoryUsages),
      peakMemoryUsage: Math.max(...memoryUsages),
      averageFrameRate: frameRates.length > 0 ? this.average(frameRates) : 0,
      minFrameRate: frameRates.length > 0 ? Math.min(...frameRates) : 0,
      totalRenders: this.snapshots.length,
      alertHistory: [...this.alerts]
    }
  }

  /**
   * Get recent performance snapshots
   */
  public getRecentSnapshots(count: number = 50): PerformanceSnapshot[] {
    return this.snapshots.slice(-count)
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): PerformanceAlert[] {
    const fiveMinutesAgo = performance.now() - 5 * 60 * 1000
    return this.alerts.filter(alert => alert.timestamp > fiveMinutesAgo)
  }

  /**
   * Clear all alerts
   */
  public clearAlerts(): void {
    this.alerts = []
  }

  /**
   * Update performance thresholds
   */
  public updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = {...this.thresholds, ...newThresholds}
  }

  /**
   * Get performance recommendations
   */
  public getRecommendations(): string[] {
    const stats = this.getStats()
    const recommendations: string[] = []

    if (stats.averageRenderTime > this.thresholds.maxRenderTime) {
      recommendations.push('Consider enabling virtual scrolling to improve render performance')
      recommendations.push('Reduce the number of visible segments or increase update throttling')
    }

    if (stats.peakMemoryUsage > this.thresholds.maxMemoryUsage) {
      recommendations.push('Enable garbage collection to limit memory usage')
      recommendations.push('Reduce segment retention time or maximum visible segments')
    }

    if (stats.averageFrameRate < this.thresholds.minFrameRate) {
      recommendations.push('Increase update throttle delay to reduce render frequency')
      recommendations.push('Consider using Web Workers for heavy processing tasks')
    }

    const renderTimeVariance = this.calculateVariance(this.snapshots.map(s => s.renderTime))
    if (renderTimeVariance > this.thresholds.renderTimeVariance) {
      recommendations.push(
        'Render times are inconsistent - consider profiling for performance bottlenecks'
      )
    }

    if (this.detectMemoryGrowth() > this.thresholds.memoryGrowthRate) {
      recommendations.push(
        'Memory usage is growing - check for memory leaks in transcription processing'
      )
    }

    return recommendations
  }

  /**
   * Generate performance report
   */
  public generateReport(): {
    summary: PerformanceStats
    recommendations: string[]
    alerts: PerformanceAlert[]
    trends: {
      renderTimeTrend: 'improving' | 'stable' | 'degrading'
      memoryTrend: 'stable' | 'growing' | 'degrading'
      frameRateTrend: 'improving' | 'stable' | 'degrading'
    }
  } {
    const summary = this.getStats()
    const recommendations = this.getRecommendations()
    const alerts = this.getActiveAlerts()

    // Analyze trends
    const recentSnapshots = this.getRecentSnapshots(20)
    const olderSnapshots = this.snapshots.slice(-40, -20)

    const trends = {
      renderTimeTrend: this.analyzeTrend(
        olderSnapshots.map(s => s.renderTime),
        recentSnapshots.map(s => s.renderTime)
      ),
      memoryTrend: this.analyzeMemoryTrend(
        olderSnapshots.map(s => s.memoryUsage),
        recentSnapshots.map(s => s.memoryUsage)
      ),
      frameRateTrend: this.analyzeTrend(
        olderSnapshots.map(s => s.frameRate),
        recentSnapshots.map(s => s.frameRate)
      )
    }

    return {
      summary,
      recommendations,
      alerts,
      trends
    }
  }

  // Private helper methods

  private collectSystemMetrics(): void {
    if (typeof window !== 'undefined' && 'performance' in window) {
      // Collect additional system metrics if available
      const memory = (performance as any).memory
      if (memory) {
        // Browser memory info is available
      }
    }
  }

  private estimateMemoryUsage(segmentCount: number): number {
    // Rough estimate: each segment uses approximately 0.5KB
    // Plus overhead for React components and DOM elements
    const segmentMemory = segmentCount * 0.5 // KB
    const reactOverhead = segmentCount * 0.2 // KB for React components
    const domOverhead = segmentCount * 0.3 // KB for DOM elements

    return (segmentMemory + reactOverhead + domOverhead) / 1024 // Convert to MB
  }

  private checkPerformanceThresholds(snapshot: PerformanceSnapshot): void {
    // Check render time
    if (snapshot.renderTime > this.thresholds.maxRenderTime) {
      this.createAlert(
        'critical',
        'performance',
        `Render time exceeded threshold: ${snapshot.renderTime.toFixed(2)}ms`,
        'Consider enabling virtual scrolling or reducing visible segments',
        {renderTime: snapshot.renderTime, threshold: this.thresholds.maxRenderTime}
      )
    }

    // Check memory usage
    if (snapshot.memoryUsage > this.thresholds.maxMemoryUsage) {
      this.createAlert(
        'warning',
        'memory',
        `Memory usage exceeded threshold: ${snapshot.memoryUsage.toFixed(2)}MB`,
        'Enable garbage collection or reduce segment retention',
        {memoryUsage: snapshot.memoryUsage, threshold: this.thresholds.maxMemoryUsage}
      )
    }

    // Check frame rate
    if (snapshot.frameRate > 0 && snapshot.frameRate < this.thresholds.minFrameRate) {
      this.createAlert(
        'warning',
        'responsiveness',
        `Frame rate below threshold: ${snapshot.frameRate.toFixed(1)} FPS`,
        'Increase update throttle delay or optimize rendering',
        {frameRate: snapshot.frameRate, threshold: this.thresholds.minFrameRate}
      )
    }
  }

  private createAlert(
    type: PerformanceAlert['type'],
    category: PerformanceAlert['category'],
    message: string,
    suggestion: string,
    data?: Record<string, unknown>
  ): void {
    const alert: PerformanceAlert = {
      id: `alert-${this.nextAlertId++}`,
      type,
      category,
      message,
      suggestion,
      timestamp: performance.now(),
      data
    }

    this.alerts.push(alert)

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift()
    }
  }

  private average(numbers: number[]): number {
    return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0
  }

  private calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) return 0

    const avg = this.average(numbers)
    const squaredDifferences = numbers.map(num => Math.pow(num - avg, 2))
    return Math.sqrt(this.average(squaredDifferences))
  }

  private detectMemoryGrowth(): number {
    if (this.snapshots.length < 10) return 0

    const recent = this.snapshots.slice(-5)
    const older = this.snapshots.slice(-10, -5)

    const recentAvg = this.average(recent.map(s => s.memoryUsage))
    const olderAvg = this.average(older.map(s => s.memoryUsage))

    const growthRate = recentAvg - olderAvg
    const timeSpan = (recent[recent.length - 1].timestamp - older[0].timestamp) / 1000 / 60 // minutes

    return timeSpan > 0 ? growthRate / timeSpan : 0 // MB per minute
  }

  private analyzeTrend(older: number[], recent: number[]): 'improving' | 'stable' | 'degrading' {
    if (older.length === 0 || recent.length === 0) return 'stable'

    const olderAvg = this.average(older)
    const recentAvg = this.average(recent)
    const difference = recentAvg - olderAvg
    const threshold = olderAvg * 0.1 // 10% change threshold

    if (Math.abs(difference) < threshold) return 'stable'

    // For render time and memory: lower is better
    // For frame rate: higher is better
    return difference < 0 ? 'improving' : 'degrading'
  }

  private analyzeMemoryTrend(
    older: number[],
    recent: number[]
  ): 'stable' | 'growing' | 'degrading' {
    if (older.length === 0 || recent.length === 0) return 'stable'

    const olderAvg = this.average(older)
    const recentAvg = this.average(recent)
    const difference = recentAvg - olderAvg
    const threshold = olderAvg * 0.1 // 10% change threshold

    if (Math.abs(difference) < threshold) return 'stable'

    // For memory: growing means increasing usage
    return difference > 0 ? 'growing' : 'degrading'
  }
}

export default TranscriptionPerformanceMonitor
