/**
 * React Performance Monitor
 * Comprehensive performance tracking and optimization suite
 */

import React from 'react'
import { useRenderTracker, useMemoryMonitor, usePerformanceBoundary } from '../hooks/performance-hooks'

interface PerformanceMetrics {
  renderCount: number
  renderTime: number
  memoryUsage: number
  fpsAverage: number
  bundleSize?: number
  componentCount: number
  rerenderReasons: string[]
}

interface ComponentPerfData {
  name: string
  renderTime: number
  renderCount: number
  lastRender: number
  memoryDelta: number
}

export class ReactPerformanceMonitor {
  private static instance: ReactPerformanceMonitor
  private metrics: Map<string, ComponentPerfData> = new Map()
  private observers: Array<(metrics: PerformanceMetrics) => void> = []
  private startTime = performance.now()
  private frameCount = 0
  private lastFrameTime = performance.now()

  static getInstance(): ReactPerformanceMonitor {
    if (!ReactPerformanceMonitor.instance) {
      ReactPerformanceMonitor.instance = new ReactPerformanceMonitor()
    }
    return ReactPerformanceMonitor.instance
  }

  // Track component render performance
  trackComponent(name: string, renderTime: number): void {
    const existing = this.metrics.get(name)
    const now = performance.now()

    this.metrics.set(name, {
      name,
      renderTime,
      renderCount: existing ? existing.renderCount + 1 : 1,
      lastRender: now,
      memoryDelta: this.getMemoryUsage() - (existing?.memoryDelta || this.getMemoryUsage())
    })

    this.updateFPS()
    this.notifyObservers()
  }

  // Get memory usage
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024 // MB
    }
    return 0
  }

  // Update FPS calculation
  private updateFPS(): void {
    this.frameCount++
    const now = performance.now()
    
    if (now - this.lastFrameTime >= 1000) {
      const fps = this.frameCount / ((now - this.lastFrameTime) / 1000)
      this.lastFrameTime = now
      this.frameCount = 0
    }
  }

  // Get current performance metrics
  getMetrics(): PerformanceMetrics {
    const components = Array.from(this.metrics.values())
    const totalRenderTime = components.reduce((sum, comp) => sum + comp.renderTime, 0)
    const totalRenderCount = components.reduce((sum, comp) => sum + comp.renderCount, 0)
    const memoryUsage = this.getMemoryUsage()

    return {
      renderCount: totalRenderCount,
      renderTime: totalRenderTime,
      memoryUsage,
      fpsAverage: this.calculateAverageFPS(),
      componentCount: components.length,
      rerenderReasons: this.identifyRerenderReasons(components)
    }
  }

  // Calculate average FPS
  private calculateAverageFPS(): number {
    const elapsed = (performance.now() - this.startTime) / 1000
    return elapsed > 0 ? this.frameCount / elapsed : 0
  }

  // Identify potential rerender reasons
  private identifyRerenderReasons(components: ComponentPerfData[]): string[] {
    const reasons: string[] = []

    components.forEach(comp => {
      if (comp.renderCount > 10 && comp.renderTime > 16) {
        reasons.push(`${comp.name}: Frequent rerenders (${comp.renderCount})`)
      }
      if (comp.renderTime > 50) {
        reasons.push(`${comp.name}: Slow render (${comp.renderTime.toFixed(1)}ms)`)
      }
      if (comp.memoryDelta > 5) {
        reasons.push(`${comp.name}: High memory usage (+${comp.memoryDelta.toFixed(1)}MB)`)
      }
    })

    return reasons
  }

  // Subscribe to performance updates
  subscribe(callback: (metrics: PerformanceMetrics) => void): () => void {
    this.observers.push(callback)
    return () => {
      const index = this.observers.indexOf(callback)
      if (index > -1) {
        this.observers.splice(index, 1)
      }
    }
  }

  // Notify all observers
  private notifyObservers(): void {
    const metrics = this.getMetrics()
    this.observers.forEach(callback => callback(metrics))
  }

  // Reset metrics
  reset(): void {
    this.metrics.clear()
    this.frameCount = 0
    this.startTime = performance.now()
    this.lastFrameTime = performance.now()
  }

  // Get component-specific metrics
  getComponentMetrics(name: string): ComponentPerfData | undefined {
    return this.metrics.get(name)
  }

  // Get top problematic components
  getProblematicComponents(limit = 5): ComponentPerfData[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => (b.renderTime * b.renderCount) - (a.renderTime * a.renderCount))
      .slice(0, limit)
  }
}

// React hook for performance monitoring
export const usePerformanceMonitor = (componentName: string) => {
  const monitor = ReactPerformanceMonitor.getInstance()
  const renderTracker = useRenderTracker()
  const memoryMonitor = useMemoryMonitor()

  React.useEffect(() => {
    monitor.trackComponent(componentName, renderTracker.lastRenderTime)
  }, [componentName, renderTracker.lastRenderTime, monitor])

  const [metrics, setMetrics] = React.useState<PerformanceMetrics>(monitor.getMetrics())

  React.useEffect(() => {
    return monitor.subscribe(setMetrics)
  }, [monitor])

  return {
    metrics,
    componentMetrics: monitor.getComponentMetrics(componentName),
    problematicComponents: monitor.getProblematicComponents(),
    memoryUsage: memoryMonitor.memoryUsage,
    isMemoryHigh: memoryMonitor.isMemoryHigh,
    renderCount: renderTracker.renderCount,
    lastRenderTime: renderTracker.lastRenderTime
  }
}

// Performance dashboard component
export const PerformanceDashboard: React.FC<{ 
  enabled?: boolean
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}> = ({ 
  enabled = process.env.NODE_ENV === 'development',
  position = 'bottom-right'
}) => {
  const monitor = usePerformanceMonitor('PerformanceDashboard')
  const [isExpanded, setIsExpanded] = React.useState(false)

  usePerformanceBoundary({
    maxRenderTime: 100,
    onSlowRender: (renderTime) => {
      console.warn(`Performance Dashboard slow render: ${renderTime}ms`)
    }
  })

  if (!enabled) return null

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  }

  const { metrics, problematicComponents } = monitor

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      <div className="bg-black bg-opacity-90 text-white rounded-lg shadow-lg overflow-hidden">
        {/* Collapsed view */}
        {!isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="p-3 hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs font-mono">
                {metrics.fpsAverage.toFixed(0)} FPS
              </span>
              <span className="text-xs text-gray-400">
                {metrics.memoryUsage.toFixed(1)}MB
              </span>
            </div>
          </button>
        )}

        {/* Expanded view */}
        {isExpanded && (
          <div className="p-4 w-80">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold">Performance Monitor</h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Overall metrics */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-800 p-2 rounded">
                  <div className="text-gray-400">FPS</div>
                  <div className="font-mono text-lg">
                    {metrics.fpsAverage.toFixed(0)}
                  </div>
                </div>
                <div className="bg-gray-800 p-2 rounded">
                  <div className="text-gray-400">Memory</div>
                  <div className="font-mono text-lg">
                    {metrics.memoryUsage.toFixed(1)}MB
                  </div>
                </div>
                <div className="bg-gray-800 p-2 rounded">
                  <div className="text-gray-400">Components</div>
                  <div className="font-mono text-lg">
                    {metrics.componentCount}
                  </div>
                </div>
                <div className="bg-gray-800 p-2 rounded">
                  <div className="text-gray-400">Renders</div>
                  <div className="font-mono text-lg">
                    {metrics.renderCount}
                  </div>
                </div>
              </div>

              {/* Problematic components */}
              {problematicComponents.length > 0 && (
                <div>
                  <div className="text-red-400 font-semibold mb-2">
                    Performance Issues
                  </div>
                  <div className="space-y-1">
                    {problematicComponents.slice(0, 3).map((comp) => (
                      <div key={comp.name} className="bg-red-900 bg-opacity-50 p-2 rounded">
                        <div className="font-semibold">{comp.name}</div>
                        <div className="text-gray-300">
                          {comp.renderTime.toFixed(1)}ms × {comp.renderCount}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rerender reasons */}
              {metrics.rerenderReasons.length > 0 && (
                <div>
                  <div className="text-yellow-400 font-semibold mb-2">
                    Optimization Opportunities
                  </div>
                  <div className="space-y-1">
                    {metrics.rerenderReasons.slice(0, 3).map((reason, index) => (
                      <div key={index} className="text-yellow-200 text-xs">
                        • {reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 border-t border-gray-700">
                <button
                  onClick={() => ReactPerformanceMonitor.getInstance().reset()}
                  className="w-full px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                >
                  Reset Metrics
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// HOC for automatic performance monitoring
export function withPerformanceMonitoring<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const name = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Unknown'
  
  const MonitoredComponent: React.FC<P> = (props) => {
    usePerformanceMonitor(name)
    
    return React.createElement(WrappedComponent, props)
  }

  MonitoredComponent.displayName = `withPerformanceMonitoring(${name})`
  
  return MonitoredComponent
}
