import React, {useState, useEffect} from 'react'
import {cn} from '@/utils/tailwind'
import {usePerformance} from '../hooks/usePerformance'
import {usePerformanceTracker} from '../utils/performance-monitoring'
import {WindowStatus} from './ui/window-status'
import GlassBox from './GlassBox'
import GlassButton from './GlassButton'

export interface PerformanceDashboardProps {
  className?: string
  compact?: boolean
  autoRefresh?: boolean
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  className,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showWebVitals, setShowWebVitals] = useState(false)

  // Original performance hook
  const {
    metrics,
    averageMetrics,
    getMemoryUsage,
    runCleanup,
    getOptimizationSuggestions,
    generateReport
  } = usePerformance()

  // New comprehensive performance monitoring
  const {tracker, metrics: webVitalsMetrics} = usePerformanceTracker({
    enableTracking: true,
    enableCoreWebVitals: true,
    enableGlassMetrics: true,
    measurementInterval: 5000
  })

  const memoryUsage = getMemoryUsage()
  const suggestions = getOptimizationSuggestions()

  // Generate enhanced performance report
  const downloadEnhancedReport = () => {
    const originalReport = generateReport()
    const enhancedReport = {
      ...originalReport,
      webVitals: webVitalsMetrics,
      glassComponents: tracker.getComponentMetrics(),
      recommendations: tracker.generateReport(),
      timestamp: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(enhancedReport, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `enhanced-performance-report-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatTime = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const getPerformanceColor = (value: number, thresholds: [number, number]) => {
    if (value < thresholds[0]) return 'text-green-600 dark:text-green-400'
    if (value < thresholds[1]) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  // Use enhanced report generation
  useEffect(() => {
    return () => tracker.dispose()
  }, [tracker])

  if (compact) {
    return (
      <div
        className={cn('app-region-no-drag flex items-center space-x-2 text-xs', className)}
        style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
      >
        <div className="flex items-center space-x-1">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              metrics?.renderTime
                ? getPerformanceColor(metrics.renderTime, [16, 33])
                : 'bg-muted-foreground/50'
            )}
          ></div>
          <span>Perf</span>
        </div>

        {memoryUsage && <span>{formatBytes(memoryUsage.used)}</span>}

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          title="Toggle performance dashboard"
          className="app-region-no-drag flex h-10 w-10 items-center justify-center rounded-lg text-sm transition-all duration-200 hover:scale-105 active:scale-95"
          style={
            {
              WebkitAppRegion: 'no-drag',
              background: 'var(--glass-light)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 10,
              cursor: 'pointer',
              pointerEvents: 'auto'
            } as React.CSSProperties
          }
        >
          📊
        </button>

        {isExpanded && (
          <div
            className="absolute right-0 top-8 z-50 min-w-64"
            style={{
              // Optimize rendering for expanded dashboard
              transform: 'translateZ(0)',
              willChange: 'transform, opacity'
            }}
          >
            <GlassBox
              variant="medium"
              cornerRadius={12}
              className="p-4 shadow-lg"
              style={{
                // Hardware acceleration for smooth transitions
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden'
              }}
            >
              <PerformanceDashboard className="w-full" compact={false} />
            </GlassBox>
          </div>
        )}
      </div>
    )
  }

  return (
    <GlassBox
      variant="light"
      cornerRadius={8}
      className={cn('app-region-no-drag', className)}
      style={
        {
          WebkitAppRegion: 'no-drag',
          // Optimize rendering performance
          transform: 'translateZ(0)',
          willChange: 'auto',
          backfaceVisibility: 'hidden'
        } as React.CSSProperties
      }
    >
      <div className="space-y-4 p-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium" style={{color: 'var(--text-primary)'}}>
            Performance Monitor
          </h3>
          <div className="flex space-x-1">
            <GlassButton onClick={runCleanup} title="Run memory cleanup" variant="light" size="sm">
              🧹
            </GlassButton>
            <GlassButton
              onClick={downloadEnhancedReport}
              title="Download enhanced performance report"
              variant="light"
              size="sm"
            >
              📁
            </GlassButton>
            <GlassButton
              onClick={() => setShowWebVitals(!showWebVitals)}
              title="Toggle Web Vitals"
              variant="light"
              size="sm"
            >
              📊
            </GlassButton>
          </div>
        </div>

        {/* Current Metrics */}
        {metrics && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <GlassBox variant="light" className="space-y-2 p-2">
                <div className="flex justify-between">
                  <span style={{color: 'var(--text-secondary)'}}>Windows:</span>
                  <span className="font-mono" style={{color: 'var(--text-primary)'}}>
                    {metrics.windowCount}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span style={{color: 'var(--text-secondary)'}}>Render Time:</span>
                  <span
                    className={cn('font-mono', getPerformanceColor(metrics.renderTime, [16, 33]))}
                  >
                    {formatTime(metrics.renderTime)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span style={{color: 'var(--text-secondary)'}}>IPC Latency:</span>
                  <span
                    className={cn('font-mono', getPerformanceColor(metrics.ipcLatency, [50, 100]))}
                  >
                    {formatTime(metrics.ipcLatency)}
                  </span>
                </div>
              </GlassBox>

              <GlassBox variant="light" className="space-y-2 p-2">
                {memoryUsage && (
                  <>
                    <div className="flex justify-between">
                      <span style={{color: 'var(--text-secondary)'}}>Memory Used:</span>
                      <span className="font-mono" style={{color: 'var(--text-primary)'}}>
                        {formatBytes(memoryUsage.used)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span style={{color: 'var(--text-secondary)'}}>Memory Total:</span>
                      <span className="font-mono" style={{color: 'var(--text-primary)'}}>
                        {formatBytes(memoryUsage.total)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div
                        className="bg-muted h-1.5 w-full rounded-full"
                        style={{
                          // Optimize progress bar container
                          transform: 'translateZ(0)',
                          willChange: 'auto'
                        }}
                      >
                        <div
                          className="bg-primary h-1.5 rounded-full"
                          style={{
                            width: `${(memoryUsage.used / memoryUsage.total) * 100}%`,
                            // Use transform instead of width transition for better performance
                            transform: 'translateZ(0)',
                            willChange: 'transform',
                            transition: 'transform 0.3s ease-out'
                          }}
                        ></div>
                      </div>
                      <div className="text-center text-xs" style={{color: 'var(--text-muted)'}}>
                        {((memoryUsage.used / memoryUsage.total) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-between">
                  <span style={{color: 'var(--text-secondary)'}}>State Updates:</span>
                  <span className="font-mono" style={{color: 'var(--text-primary)'}}>
                    {metrics.stateUpdates}
                  </span>
                </div>
              </GlassBox>
            </div>
          </div>
        )}

        {/* Web Vitals Metrics */}
        {showWebVitals && (
          <div className="border-t pt-3">
            <div className="text-muted-foreground mb-2 text-xs">Core Web Vitals:</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {webVitalsMetrics.fcp && (
                <div className="flex justify-between">
                  <span>FCP:</span>
                  <span
                    className={cn(
                      'font-mono',
                      getPerformanceColor(webVitalsMetrics.fcp, [1800, 3000])
                    )}
                  >
                    {formatTime(webVitalsMetrics.fcp)}
                  </span>
                </div>
              )}
              {webVitalsMetrics.lcp && (
                <div className="flex justify-between">
                  <span>LCP:</span>
                  <span
                    className={cn(
                      'font-mono',
                      getPerformanceColor(webVitalsMetrics.lcp, [2500, 4000])
                    )}
                  >
                    {formatTime(webVitalsMetrics.lcp)}
                  </span>
                </div>
              )}
              {webVitalsMetrics.cls !== undefined && (
                <div className="flex justify-between">
                  <span>CLS:</span>
                  <span
                    className={cn(
                      'font-mono',
                      getPerformanceColor(webVitalsMetrics.cls, [0.1, 0.25])
                    )}
                  >
                    {webVitalsMetrics.cls.toFixed(3)}
                  </span>
                </div>
              )}
              {webVitalsMetrics.fid && (
                <div className="flex justify-between">
                  <span>FID:</span>
                  <span
                    className={cn(
                      'font-mono',
                      getPerformanceColor(webVitalsMetrics.fid, [100, 300])
                    )}
                  >
                    {formatTime(webVitalsMetrics.fid)}
                  </span>
                </div>
              )}
              {webVitalsMetrics.glassRenderTime && (
                <div className="flex justify-between">
                  <span>Glass Render:</span>
                  <span
                    className={cn(
                      'font-mono',
                      getPerformanceColor(webVitalsMetrics.glassRenderTime, [16, 33])
                    )}
                  >
                    {formatTime(webVitalsMetrics.glassRenderTime)}
                  </span>
                </div>
              )}
              {webVitalsMetrics.glassComponentCount && (
                <div className="flex justify-between">
                  <span>Glass Components:</span>
                  <span className="font-mono" style={{color: 'var(--text-primary)'}}>
                    {webVitalsMetrics.glassComponentCount}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Averages */}
        {Object.keys(averageMetrics).length > 0 && (
          <div className="border-t pt-3">
            <div className="text-muted-foreground mb-2 text-xs">1-minute averages:</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {averageMetrics.renderTime && (
                <div className="flex justify-between">
                  <span>Avg Render:</span>
                  <span className="font-mono">{formatTime(averageMetrics.renderTime)}</span>
                </div>
              )}
              {averageMetrics.ipcLatency && (
                <div className="flex justify-between">
                  <span>Avg IPC:</span>
                  <span className="font-mono">{formatTime(averageMetrics.ipcLatency)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Optimization Suggestions */}
        {suggestions.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-muted-foreground mb-2 text-xs">Suggestions:</div>
            <div className="space-y-1">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-start text-xs text-yellow-600 dark:text-yellow-400"
                >
                  <span className="mr-1">⚠️</span>
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Window Status */}
        <div className="border-t pt-3" style={{borderColor: 'var(--border-primary)'}}>
          <WindowStatus showWindowInfo showRecordingStatus showTranscriptCount compact />
        </div>
      </div>
    </GlassBox>
  )
}
