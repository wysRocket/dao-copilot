import {useState, useEffect, useRef, useCallback} from 'react'
import {getTranscriptionStateManager} from '../state/TranscriptionStateManager'

export interface PerformanceMetrics {
  updateCount: number
  averageUpdateTime: number
  maxUpdateTime: number
  throttledUpdates: number
  lastUpdateTime: number
}

export interface RenderMetrics {
  renderCount: number
  averageRenderTime: number
  maxRenderTime: number
  lastRenderTime: number
}

export interface MemoryMetrics {
  heapUsed: number
  heapTotal: number
  memoryUsagePercent: number
  estimatedTranscriptMemory: number
}

export interface ComponentPerformanceData {
  transcriptionMetrics: PerformanceMetrics
  renderMetrics: RenderMetrics
  memoryMetrics: MemoryMetrics
  frameRate: number
  isHighLoad: boolean
}

/**
 * Hook for real-time performance monitoring of transcription and rendering
 * Integrates with TranscriptionStateManager performance metrics
 */
export function usePerformanceMonitoring(
  componentName?: string,
  enabled: boolean = process.env.NODE_ENV === 'development'
) {
  const [performanceData, setPerformanceData] = useState<ComponentPerformanceData>({
    transcriptionMetrics: {
      updateCount: 0,
      averageUpdateTime: 0,
      maxUpdateTime: 0,
      throttledUpdates: 0,
      lastUpdateTime: 0
    },
    renderMetrics: {
      renderCount: 0,
      averageRenderTime: 0,
      maxRenderTime: 0,
      lastRenderTime: 0
    },
    memoryMetrics: {
      heapUsed: 0,
      heapTotal: 0,
      memoryUsagePercent: 0,
      estimatedTranscriptMemory: 0
    },
    frameRate: 60,
    isHighLoad: false
  })

  const renderStartTimeRef = useRef<number>(0)
  const renderTimesRef = useRef<number[]>([])
  const frameTimesRef = useRef<number[]>([])
  const lastFrameTimeRef = useRef<number>(0)
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Track component render performance
   */
  const trackRender = useCallback(() => {
    if (!enabled) return

    const renderTime = performance.now()

    if (renderStartTimeRef.current > 0) {
      const renderDuration = renderTime - renderStartTimeRef.current
      renderTimesRef.current.push(renderDuration)

      // Keep only last 100 render times for memory efficiency
      if (renderTimesRef.current.length > 100) {
        renderTimesRef.current = renderTimesRef.current.slice(-100)
      }
    }

    renderStartTimeRef.current = renderTime
  }, [enabled])

  /**
   * Calculate frame rate based on render intervals
   */
  const calculateFrameRate = useCallback((): number => {
    const now = performance.now()

    if (lastFrameTimeRef.current > 0) {
      const frameTime = now - lastFrameTimeRef.current
      frameTimesRef.current.push(frameTime)

      // Keep only last 60 frame times (1 second at 60fps)
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current = frameTimesRef.current.slice(-60)
      }
    }

    lastFrameTimeRef.current = now

    // Calculate average frame rate
    if (frameTimesRef.current.length > 0) {
      const avgFrameTime =
        frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
      return 1000 / avgFrameTime // Convert to FPS
    }

    return 60 // Default assumption
  }, [])

  /**
   * Get memory usage information
   */
  const getMemoryMetrics = useCallback((): MemoryMetrics => {
    // Type assertion for Chrome's memory API
    const memoryInfo = (
      performance as Performance & {
        memory?: {
          usedJSHeapSize: number
          totalJSHeapSize: number
          jsHeapSizeLimit: number
        }
      }
    ).memory

    if (memoryInfo) {
      const heapUsed = memoryInfo.usedJSHeapSize
      const heapTotal = memoryInfo.totalJSHeapSize
      const heapLimit = memoryInfo.jsHeapSizeLimit

      return {
        heapUsed,
        heapTotal,
        memoryUsagePercent: (heapUsed / heapLimit) * 100,
        estimatedTranscriptMemory: Math.max(0, heapUsed - 50 * 1024 * 1024) // Estimate transcript memory above 50MB baseline
      }
    }

    return {
      heapUsed: 0,
      heapTotal: 0,
      memoryUsagePercent: 0,
      estimatedTranscriptMemory: 0
    }
  }, [])

  /**
   * Update performance metrics
   */
  const updateMetrics = useCallback(() => {
    if (!enabled) return

    const stateManager = getTranscriptionStateManager()
    const transcriptionMetrics = stateManager.getPerformanceMetrics()

    // Calculate render metrics
    const renderTimes = renderTimesRef.current
    const renderMetrics: RenderMetrics = {
      renderCount: renderTimes.length,
      averageRenderTime:
        renderTimes.length > 0 ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length : 0,
      maxRenderTime: renderTimes.length > 0 ? Math.max(...renderTimes) : 0,
      lastRenderTime: renderTimes.length > 0 ? renderTimes[renderTimes.length - 1] : 0
    }

    const memoryMetrics = getMemoryMetrics()
    const frameRate = calculateFrameRate()

    // Determine if system is under high load
    const isHighLoad =
      transcriptionMetrics.averageUpdateTime > 50 || // Updates taking too long
      renderMetrics.averageRenderTime > 16.67 || // Renders taking longer than 60fps budget
      frameRate < 30 || // Low frame rate
      memoryMetrics.memoryUsagePercent > 80 || // High memory usage
      transcriptionMetrics.throttledUpdates > transcriptionMetrics.updateCount * 0.3 // Too many throttled updates

    setPerformanceData({
      transcriptionMetrics,
      renderMetrics,
      memoryMetrics,
      frameRate,
      isHighLoad
    })
  }, [enabled, getMemoryMetrics, calculateFrameRate])

  /**
   * Reset performance metrics
   */
  const resetMetrics = useCallback(() => {
    if (!enabled) return

    const stateManager = getTranscriptionStateManager()
    stateManager.resetPerformanceMetrics()

    renderTimesRef.current = []
    frameTimesRef.current = []
    renderStartTimeRef.current = 0
    lastFrameTimeRef.current = 0

    setPerformanceData({
      transcriptionMetrics: {
        updateCount: 0,
        averageUpdateTime: 0,
        maxUpdateTime: 0,
        throttledUpdates: 0,
        lastUpdateTime: 0
      },
      renderMetrics: {
        renderCount: 0,
        averageRenderTime: 0,
        maxRenderTime: 0,
        lastRenderTime: 0
      },
      memoryMetrics: {
        heapUsed: 0,
        heapTotal: 0,
        memoryUsagePercent: 0,
        estimatedTranscriptMemory: 0
      },
      frameRate: 60,
      isHighLoad: false
    })
  }, [enabled])

  /**
   * Log performance warning if system is under high load
   */
  const logPerformanceWarning = useCallback(() => {
    if (!enabled || !performanceData.isHighLoad) return

    const warnings = []

    if (performanceData.transcriptionMetrics.averageUpdateTime > 50) {
      warnings.push(
        `High transcription update time: ${performanceData.transcriptionMetrics.averageUpdateTime.toFixed(2)}ms`
      )
    }

    if (performanceData.renderMetrics.averageRenderTime > 16.67) {
      warnings.push(
        `High render time: ${performanceData.renderMetrics.averageRenderTime.toFixed(2)}ms`
      )
    }

    if (performanceData.frameRate < 30) {
      warnings.push(`Low frame rate: ${performanceData.frameRate.toFixed(1)}fps`)
    }

    if (performanceData.memoryMetrics.memoryUsagePercent > 80) {
      warnings.push(
        `High memory usage: ${performanceData.memoryMetrics.memoryUsagePercent.toFixed(1)}%`
      )
    }

    if (warnings.length > 0) {
      console.warn(
        `[Performance Monitor${componentName ? ` - ${componentName}` : ''}]:`,
        warnings.join(', ')
      )
    }
  }, [enabled, performanceData, componentName])

  // Set up performance monitoring interval
  useEffect(() => {
    if (!enabled) return

    monitoringIntervalRef.current = setInterval(updateMetrics, 1000) // Update every second

    return () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current)
      }
    }
  }, [enabled, updateMetrics])

  // Track renders automatically
  useEffect(() => {
    trackRender()
  })

  // Log performance warnings
  useEffect(() => {
    logPerformanceWarning()
  }, [logPerformanceWarning])

  if (!enabled) {
    return {
      performanceData: null,
      trackRender: () => {},
      resetMetrics: () => {},
      updateMetrics: () => {}
    }
  }

  return {
    performanceData,
    trackRender,
    resetMetrics,
    updateMetrics
  }
}

/**
 * Hook for simple performance monitoring without automatic updates
 * Useful for one-off performance measurements
 */
export function useSimplePerformanceMonitoring(componentName?: string) {
  const startTimeRef = useRef<number>(0)

  const startMeasurement = useCallback(() => {
    startTimeRef.current = performance.now()
  }, [])

  const endMeasurement = useCallback(
    (label?: string) => {
      if (startTimeRef.current === 0) {
        console.warn('[Performance Monitor]: No measurement started')
        return 0
      }

      const duration = performance.now() - startTimeRef.current
      startTimeRef.current = 0

      if (process.env.NODE_ENV === 'development') {
        const fullLabel = [componentName, label].filter(Boolean).join(' - ')
        console.log(
          `[Performance Monitor${fullLabel ? ` - ${fullLabel}` : ''}]: ${duration.toFixed(2)}ms`
        )
      }

      return duration
    },
    [componentName]
  )

  return {
    startMeasurement,
    endMeasurement
  }
}
