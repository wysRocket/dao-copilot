import React, {useState} from 'react'
import {cn} from '@/utils/tailwind'
import {usePerformance} from '../hooks/usePerformance'
import {WindowButton} from './ui/window-button'
import {WindowStatus} from './ui/window-status'

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
    if (value < thresholds[0]) return 'text-green-500'
    if (value < thresholds[1]) return 'text-yellow-500'
    return 'text-red-500'
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
      <div className={cn('flex items-center space-x-2 text-xs', className)}>
        <div className="flex items-center space-x-1">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              metrics?.renderTime
                ? getPerformanceColor(metrics.renderTime, [16, 33])
                : 'bg-gray-400'
            )}
          ></div>
          <span>Perf</span>
        </div>

        {memoryUsage && <span>{formatBytes(memoryUsage.used)}</span>}

        <WindowButton
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsExpanded(!isExpanded)}
          title="Toggle performance dashboard"
        >
          📊
        </WindowButton>

        {isExpanded && (
          <div className="bg-background absolute top-8 right-0 z-50 min-w-64 rounded-lg border p-4 shadow-lg">
            <PerformanceDashboard className="w-full" compact={false} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Performance Monitor</h3>
        <div className="flex space-x-1">
          <WindowButton
            variant="ghost"
            size="icon-sm"
            onClick={runCleanup}
            title="Run memory cleanup"
          >
            🧹
          </WindowButton>
          <WindowButton
            variant="ghost"
            size="icon-sm"
            onClick={downloadReport}
            title="Download performance report"
          >
            📁
          </WindowButton>
        </div>
      </div>

      {/* Current Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Windows:</span>
              <span className="font-mono">{metrics.windowCount}</span>
            </div>

            <div className="flex justify-between">
              <span>Render Time:</span>
              <span className={cn('font-mono', getPerformanceColor(metrics.renderTime, [16, 33]))}>
                {formatTime(metrics.renderTime)}
              </span>
            </div>

            <div className="flex justify-between">
              <span>IPC Latency:</span>
              <span className={cn('font-mono', getPerformanceColor(metrics.ipcLatency, [50, 100]))}>
                {formatTime(metrics.ipcLatency)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {memoryUsage && (
              <>
                <div className="flex justify-between">
                  <span>Memory Used:</span>
                  <span className="font-mono">{formatBytes(memoryUsage.used)}</span>
                </div>

                <div className="flex justify-between">
                  <span>Memory Total:</span>
                  <span className="font-mono">{formatBytes(memoryUsage.total)}</span>
                </div>

                <div className="h-1.5 w-full rounded-full bg-gray-200">
                  <div
                    className="h-1.5 rounded-full bg-blue-500"
                    style={{width: `${(memoryUsage.used / memoryUsage.total) * 100}%`}}
                  ></div>
                </div>
              </>
            )}

            <div className="flex justify-between">
              <span>State Updates:</span>
              <span className="font-mono">{metrics.stateUpdates}</span>
            </div>
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
              <div key={index} className="flex items-start text-xs text-yellow-600">
                <span className="mr-1">⚠️</span>
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Window Status */}
      <div className="border-t pt-3">
        <WindowStatus showWindowInfo showRecordingStatus showTranscriptCount compact />
      </div>
    </div>
  )
}
