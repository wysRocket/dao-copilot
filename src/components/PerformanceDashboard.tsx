import React, {useState} from 'react'
import {cn} from '@/utils/tailwind'
import {usePerformance} from '../hooks/usePerformance'
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
  const {
    metrics,
    averageMetrics,
    getMemoryUsage,
    runCleanup,
    getOptimizationSuggestions,
    generateReport
  } = usePerformance()

  const memoryUsage = getMemoryUsage()
  const suggestions = getOptimizationSuggestions()

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

  const downloadReport = () => {
    const report = generateReport()
    const blob = new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `performance-report-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

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
          <div className="absolute top-8 right-0 z-50 min-w-64">
            <GlassBox variant="medium" cornerRadius={12} className="p-4 shadow-lg">
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
      style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
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
              onClick={downloadReport}
              title="Download performance report"
              variant="light"
              size="sm"
            >
              📁
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
                      <div className="bg-muted h-1.5 w-full rounded-full">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{width: `${(memoryUsage.used / memoryUsage.total) * 100}%`}}
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
