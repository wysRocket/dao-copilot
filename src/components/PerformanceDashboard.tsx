import React, {useState} from 'react'
import {cn} from '@/utils/tailwind'
import {usePerformanceMonitoring} from '../hooks/usePerformanceMonitoring'
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
  const {performanceData, resetMetrics} = usePerformanceMonitoring('PerformanceDashboard', true)

  // Handle case when performance monitoring is disabled
  if (!performanceData) {
    return (
      <div className={cn('app-region-no-drag text-xs text-gray-500', className)}>
        Performance monitoring disabled
      </div>
    )
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

  const downloadReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      performanceData,
      system: {
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      }
    }
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
              performanceData.renderMetrics.averageRenderTime > 0
                ? getPerformanceColor(performanceData.renderMetrics.averageRenderTime, [16, 33])
                : 'bg-muted-foreground/50'
            )}
          ></div>
          <span>Perf</span>
        </div>

        {performanceData.memoryMetrics.heapUsed > 0 && (
          <span>{formatBytes(performanceData.memoryMetrics.heapUsed)}</span>
        )}

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
              fontSize: '12px'
            } as React.CSSProperties
          }
        >
          📊
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn('app-region-no-drag flex flex-col space-y-4 p-6', className)}
      style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-lg font-semibold">Performance Dashboard</h2>
        <div className="flex space-x-2">
          <GlassButton onClick={resetMetrics} title="Reset metrics" variant="light" size="sm">
            Reset
          </GlassButton>
          <GlassButton
            onClick={downloadReport}
            title="Download performance report"
            variant="light"
            size="sm"
          >
            Export
          </GlassButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Transcription Performance */}
        <GlassBox className="p-4">
          <h3 className="text-muted-foreground mb-3 text-sm font-medium">
            Transcription Performance
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Updates</span>
              <span className="font-mono text-xs">
                {performanceData.transcriptionMetrics.updateCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Avg Update Time</span>
              <span
                className={cn(
                  'font-mono text-xs',
                  getPerformanceColor(
                    performanceData.transcriptionMetrics.averageUpdateTime,
                    [16, 33]
                  )
                )}
              >
                {formatTime(performanceData.transcriptionMetrics.averageUpdateTime)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Max Update Time</span>
              <span
                className={cn(
                  'font-mono text-xs',
                  getPerformanceColor(performanceData.transcriptionMetrics.maxUpdateTime, [50, 100])
                )}
              >
                {formatTime(performanceData.transcriptionMetrics.maxUpdateTime)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Throttled Updates</span>
              <span className="font-mono text-xs">
                {performanceData.transcriptionMetrics.throttledUpdates}
              </span>
            </div>
          </div>
        </GlassBox>

        {/* Memory Usage */}
        <GlassBox className="p-4">
          <h3 className="text-muted-foreground mb-3 text-sm font-medium">Memory Usage</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Heap Used</span>
              <span className="font-mono text-xs">
                {formatBytes(performanceData.memoryMetrics.heapUsed)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Heap Total</span>
              <span className="font-mono text-xs">
                {formatBytes(performanceData.memoryMetrics.heapTotal)}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Usage</span>
                <span className="font-mono text-xs">
                  {performanceData.memoryMetrics.memoryUsagePercent.toFixed(1)}%
                </span>
              </div>
              <div className="bg-muted h-2 w-full rounded-full">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    performanceData.memoryMetrics.memoryUsagePercent > 80
                      ? 'bg-red-500'
                      : performanceData.memoryMetrics.memoryUsagePercent > 60
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  )}
                  style={{
                    width: `${Math.min(100, performanceData.memoryMetrics.memoryUsagePercent)}%`
                  }}
                />
              </div>
            </div>
          </div>
        </GlassBox>

        {/* Render Performance */}
        <GlassBox className="p-4">
          <h3 className="text-muted-foreground mb-3 text-sm font-medium">Render Performance</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Render Count</span>
              <span className="font-mono text-xs">{performanceData.renderMetrics.renderCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Avg Render Time</span>
              <span
                className={cn(
                  'font-mono text-xs',
                  getPerformanceColor(performanceData.renderMetrics.averageRenderTime, [16, 33])
                )}
              >
                {formatTime(performanceData.renderMetrics.averageRenderTime)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Frame Rate</span>
              <span
                className={cn(
                  'font-mono text-xs',
                  getPerformanceColor(60 - performanceData.frameRate, [10, 30])
                )}
              >
                {performanceData.frameRate.toFixed(1)} FPS
              </span>
            </div>
          </div>
        </GlassBox>

        {/* System Status */}
        <GlassBox className="p-4">
          <h3 className="text-muted-foreground mb-3 text-sm font-medium">System Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Performance Status</span>
              <span
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium',
                  performanceData.isHighLoad
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                )}
              >
                {performanceData.isHighLoad ? 'High Load' : 'Normal'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Last Update</span>
              <span className="font-mono text-xs">
                {performanceData.transcriptionMetrics.lastUpdateTime > 0
                  ? `${((Date.now() - performanceData.transcriptionMetrics.lastUpdateTime) / 1000).toFixed(1)}s ago`
                  : 'Never'}
              </span>
            </div>
          </div>
        </GlassBox>
      </div>

      <WindowStatus />
    </div>
  )
}
