/**
 * Performance Monitoring System for Glass Components
 *
 * Provides comprehensive performance tracking and analysis for glassmorphism components including:
 * - Custom performance marks and measures using Performance API
 * - User-centric performance metrics (FCP, LCP, CLS)
 * - Glass component-specific performance tracking
 * - Real-time performance dashboard capabilities
 * - Production performance data collection
 */

import {useEffect, useRef, useState, useCallback} from 'react'

// Layout Shift Entry interface
interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
}

// First Input Entry interface
interface FirstInputEntry extends PerformanceEntry {
  processingStart: number
}

// Performance with memory interface
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}

// Performance metric types
export interface PerformanceMetrics {
  // Core Web Vitals
  fcp?: number // First Contentful Paint
  lcp?: number // Largest Contentful Paint
  cls?: number // Cumulative Layout Shift
  fid?: number // First Input Delay

  // Glass-specific metrics
  glassRenderTime?: number
  glassAnimationFPS?: number
  glassComponentCount?: number
  glassMemoryUsage?: number

  // Page-specific metrics
  pageLoadTime?: number
  timeToInteractive?: number
  totalBlockingTime?: number

  // Custom metrics
  customMetrics?: Record<string, number>
}

export interface GlassComponentMetrics {
  componentName: string
  renderTime: number
  memoryDelta: number
  animationFPS: number
  rerenderCount: number
  lastMeasured: number
}

export interface PerformanceConfig {
  enableTracking: boolean
  enableAutomaticMeasures: boolean
  enableCoreWebVitals: boolean
  enableGlassMetrics: boolean
  enablePageMetrics: boolean
  enableProductionMode: boolean
  measurementInterval: number
  maxHistorySize: number
  reportingEndpoint?: string
  debugMode: boolean
}

// Default configuration
const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enableTracking: true,
  enableAutomaticMeasures: true,
  enableCoreWebVitals: true,
  enableGlassMetrics: true,
  enablePageMetrics: true,
  enableProductionMode: false,
  measurementInterval: 5000, // 5 seconds
  maxHistorySize: 100,
  debugMode: process.env.NODE_ENV === 'development'
}

// Glass component performance tracker
export class GlassPerformanceTracker {
  private config: PerformanceConfig
  private metrics: PerformanceMetrics = {}
  private componentMetrics: Map<string, GlassComponentMetrics> = new Map()
  private metricsHistory: PerformanceMetrics[] = []
  private observers: Map<string, PerformanceObserver> = new Map()
  private measurementTimers: Map<string, NodeJS.Timeout> = new Map()
  private layoutShiftScore = 0

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {...DEFAULT_PERFORMANCE_CONFIG, ...config}

    if (this.config.enableTracking) {
      this.initializeTracking()
    }
  }

  private initializeTracking() {
    if (typeof window === 'undefined' || !('performance' in window)) {
      return
    }

    this.setupCoreWebVitals()
    this.setupGlassMetrics()
    this.setupPageMetrics()
    this.startAutomaticMeasurement()
  }

  private setupCoreWebVitals() {
    if (!this.config.enableCoreWebVitals) return

    // First Contentful Paint (FCP)
    this.observePerformanceEntries('paint', entries => {
      const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint')
      if (fcpEntry) {
        this.metrics.fcp = fcpEntry.startTime
        this.logMetric('FCP', fcpEntry.startTime)
      }
    })

    // Largest Contentful Paint (LCP)
    this.observePerformanceEntries('largest-contentful-paint', entries => {
      const lastEntry = entries[entries.length - 1]
      if (lastEntry) {
        this.metrics.lcp = lastEntry.startTime
        this.logMetric('LCP', lastEntry.startTime)
      }
    })

    // Cumulative Layout Shift (CLS)
    this.observePerformanceEntries('layout-shift', entries => {
      for (const entry of entries) {
        const layoutEntry = entry as LayoutShiftEntry
        // Only count layout shifts that don't have recent user input
        if (!layoutEntry.hadRecentInput) {
          this.layoutShiftScore += layoutEntry.value
        }
      }
      this.metrics.cls = this.layoutShiftScore
      this.logMetric('CLS', this.layoutShiftScore)
    })

    // First Input Delay (FID)
    this.observePerformanceEntries('first-input', entries => {
      const firstInput = entries[0] as FirstInputEntry
      if (firstInput) {
        this.metrics.fid = firstInput.processingStart - firstInput.startTime
        this.logMetric('FID', this.metrics.fid)
      }
    })
  }

  private setupGlassMetrics() {
    if (!this.config.enableGlassMetrics) return

    // Monitor glass component performance
    this.observePerformanceEntries('measure', entries => {
      for (const entry of entries) {
        if (entry.name.startsWith('glass-')) {
          const componentName = entry.name.replace('glass-', '').replace('-render', '')
          const existingMetrics = this.componentMetrics.get(componentName)

          if (existingMetrics) {
            existingMetrics.renderTime = entry.duration
            existingMetrics.lastMeasured = Date.now()
            existingMetrics.rerenderCount++
          } else {
            this.componentMetrics.set(componentName, {
              componentName,
              renderTime: entry.duration,
              memoryDelta: 0,
              animationFPS: 60,
              rerenderCount: 1,
              lastMeasured: Date.now()
            })
          }

          this.logMetric(`Glass Component: ${componentName}`, entry.duration)
        }
      }
    })
  }

  private setupPageMetrics() {
    if (!this.config.enablePageMetrics) return

    // Page load time
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming
      if (navigation) {
        this.metrics.pageLoadTime = navigation.loadEventEnd - navigation.fetchStart
        this.metrics.timeToInteractive = navigation.domInteractive - navigation.fetchStart
        this.logMetric('Page Load Time', this.metrics.pageLoadTime)
        this.logMetric('Time to Interactive', this.metrics.timeToInteractive)
      }
    })
  }

  private observePerformanceEntries(
    entryType: string,
    callback: (entries: PerformanceEntry[]) => void
  ) {
    if (!PerformanceObserver.supportedEntryTypes?.includes(entryType)) {
      console.warn(`Performance entry type "${entryType}" is not supported`)
      return
    }

    const observer = new PerformanceObserver(list => {
      callback(list.getEntries())
    })

    try {
      observer.observe({type: entryType, buffered: true})
      this.observers.set(entryType, observer)
    } catch (error) {
      console.warn(`Failed to observe performance entries for "${entryType}":`, error)
    }
  }

  private startAutomaticMeasurement() {
    if (!this.config.enableAutomaticMeasures) return

    const timer = setInterval(() => {
      this.collectCurrentMetrics()
      this.updateMetricsHistory()

      if (this.config.enableProductionMode && this.config.reportingEndpoint) {
        this.reportMetricsToServer()
      }
    }, this.config.measurementInterval)

    this.measurementTimers.set('automatic', timer)
  }

  private collectCurrentMetrics() {
    // Update glass-specific metrics
    let totalRenderTime = 0
    let componentCount = 0

    for (const metrics of this.componentMetrics.values()) {
      totalRenderTime += metrics.renderTime
      componentCount++
    }

    this.metrics.glassRenderTime = componentCount > 0 ? totalRenderTime / componentCount : 0
    this.metrics.glassComponentCount = componentCount

    // Update memory usage if available
    if ('memory' in performance) {
      const memory = (performance as PerformanceWithMemory).memory
      if (memory) {
        this.metrics.glassMemoryUsage = memory.usedJSHeapSize / (1024 * 1024) // MB
      }
    }
  }

  private updateMetricsHistory() {
    const currentMetrics = {...this.metrics, timestamp: Date.now()}
    this.metricsHistory.push(currentMetrics)

    // Maintain max history size
    if (this.metricsHistory.length > this.config.maxHistorySize) {
      this.metricsHistory.shift()
    }
  }

  private async reportMetricsToServer() {
    if (!this.config.reportingEndpoint) return

    try {
      await fetch(this.config.reportingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          metrics: this.metrics,
          componentMetrics: Array.from(this.componentMetrics.values()),
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          page: window.location.pathname
        })
      })
    } catch (error) {
      console.warn('Failed to report performance metrics:', error)
    }
  }

  private logMetric(name: string, value: number) {
    if (this.config.debugMode) {
      console.log(`Performance Metric - ${name}: ${value.toFixed(2)}ms`)
    }
  }

  // Public API methods
  public mark(name: string) {
    if (typeof performance !== 'undefined') {
      performance.mark(name)
    }
  }

  public measure(name: string, startMark?: string, endMark?: string) {
    if (typeof performance !== 'undefined') {
      try {
        if (startMark && endMark) {
          performance.measure(name, startMark, endMark)
        } else if (startMark) {
          performance.measure(name, startMark)
        } else {
          performance.measure(name)
        }
      } catch (error) {
        console.warn(`Failed to create performance measure "${name}":`, error)
      }
    }
  }

  public measureGlassComponent(componentName: string, renderFunction: () => void) {
    const startMark = `glass-${componentName}-start`
    const endMark = `glass-${componentName}-end`
    const measureName = `glass-${componentName}-render`

    this.mark(startMark)
    renderFunction()
    this.mark(endMark)
    this.measure(measureName, startMark, endMark)
  }

  public getMetrics(): PerformanceMetrics {
    return {...this.metrics}
  }

  public getComponentMetrics(): GlassComponentMetrics[] {
    return Array.from(this.componentMetrics.values())
  }

  public getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metricsHistory]
  }

  public addCustomMetric(name: string, value: number) {
    if (!this.metrics.customMetrics) {
      this.metrics.customMetrics = {}
    }
    this.metrics.customMetrics[name] = value
    this.logMetric(`Custom: ${name}`, value)
  }

  public generateReport(): string {
    const report = {
      summary: this.metrics,
      components: this.getComponentMetrics(),
      history: this.metricsHistory.slice(-10), // Last 10 measurements
      recommendations: this.generateRecommendations()
    }

    return JSON.stringify(report, null, 2)
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = []

    if (this.metrics.lcp && this.metrics.lcp > 2500) {
      recommendations.push('LCP is above 2.5s - consider optimizing largest content element')
    }

    if (this.metrics.cls && this.metrics.cls > 0.1) {
      recommendations.push('CLS is above 0.1 - review layout stability in glass components')
    }

    if (this.metrics.fid && this.metrics.fid > 100) {
      recommendations.push('FID is above 100ms - consider reducing JavaScript execution time')
    }

    if (this.metrics.glassRenderTime && this.metrics.glassRenderTime > 16) {
      recommendations.push(
        'Glass components render time is above 16ms - consider optimizing glass effects'
      )
    }

    return recommendations
  }

  public dispose() {
    // Clean up observers
    for (const observer of this.observers.values()) {
      observer.disconnect()
    }
    this.observers.clear()

    // Clear timers
    for (const timer of this.measurementTimers.values()) {
      clearInterval(timer)
    }
    this.measurementTimers.clear()

    // Clear data
    this.componentMetrics.clear()
    this.metricsHistory.length = 0
  }
}

// React hooks for performance monitoring
export function usePerformanceTracker(config?: Partial<PerformanceConfig>) {
  const [tracker] = useState(() => new GlassPerformanceTracker(config))
  const [metrics, setMetrics] = useState<PerformanceMetrics>({})

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(tracker.getMetrics())
    }

    const interval = setInterval(updateMetrics, config?.measurementInterval || 5000)
    updateMetrics() // Initial update

    return () => {
      clearInterval(interval)
      tracker.dispose()
    }
  }, [tracker, config?.measurementInterval])

  return {tracker, metrics}
}

export function useGlassComponentPerformance(componentName: string) {
  const [tracker] = useState(() => new GlassPerformanceTracker())
  const renderCountRef = useRef(0)

  const measureRender = useCallback(
    (renderFunction: () => void) => {
      renderCountRef.current++
      tracker.measureGlassComponent(`${componentName}-${renderCountRef.current}`, renderFunction)
    },
    [tracker, componentName]
  )

  const markStart = useCallback(
    (operation: string) => {
      tracker.mark(`${componentName}-${operation}-start`)
    },
    [tracker, componentName]
  )

  const markEnd = useCallback(
    (operation: string) => {
      tracker.mark(`${componentName}-${operation}-end`)
      tracker.measure(
        `${componentName}-${operation}`,
        `${componentName}-${operation}-start`,
        `${componentName}-${operation}-end`
      )
    },
    [tracker, componentName]
  )

  useEffect(() => {
    return () => tracker.dispose()
  }, [tracker])

  return {measureRender, markStart, markEnd, tracker}
}

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const tracker = new GlassPerformanceTracker()

    const updateMetrics = () => {
      setMetrics(tracker.getMetrics())
      setIsLoading(false)
    }

    // Wait for initial metrics to be collected
    setTimeout(updateMetrics, 1000)

    const interval = setInterval(updateMetrics, 5000)

    return () => {
      clearInterval(interval)
      tracker.dispose()
    }
  }, [])

  return {metrics, isLoading}
}

// Global performance tracker instance
let globalTracker: GlassPerformanceTracker | null = null

export function getGlobalPerformanceTracker(
  config?: Partial<PerformanceConfig>
): GlassPerformanceTracker {
  if (!globalTracker) {
    globalTracker = new GlassPerformanceTracker(config)
  }
  return globalTracker
}

export function disposeGlobalPerformanceTracker() {
  if (globalTracker) {
    globalTracker.dispose()
    globalTracker = null
  }
}

// Performance monitoring utilities
export const PerformanceUtils = {
  // Create a performance mark with glass component prefix
  markGlassOperation: (componentName: string, operation: string) => {
    if (typeof performance !== 'undefined') {
      performance.mark(`glass-${componentName}-${operation}`)
    }
  },

  // Measure time between two glass operation marks
  measureGlassOperation: (componentName: string, operation: string) => {
    if (typeof performance !== 'undefined') {
      try {
        performance.measure(
          `glass-${componentName}-${operation}-duration`,
          `glass-${componentName}-${operation}-start`,
          `glass-${componentName}-${operation}-end`
        )
      } catch (error) {
        console.warn(`Failed to measure glass operation ${componentName}-${operation}:`, error)
      }
    }
  },

  // Get performance metrics for a specific time period
  getMetricsForTimeRange: (startTime: number, endTime: number) => {
    if (typeof performance === 'undefined') return []

    return performance
      .getEntriesByType('measure')
      .filter(entry => entry.startTime >= startTime && entry.startTime <= endTime)
  },

  // Clear all glass-related performance marks and measures
  clearGlassMetrics: () => {
    if (typeof performance !== 'undefined') {
      const entries = performance
        .getEntriesByType('mark')
        .concat(performance.getEntriesByType('measure'))
        .filter(entry => entry.name.startsWith('glass-'))

      entries.forEach(entry => {
        try {
          performance.clearMarks(entry.name)
          performance.clearMeasures(entry.name)
        } catch {
          // Ignore errors - some browsers don't support clearing individual marks
        }
      })
    }
  }
}

export default GlassPerformanceTracker
