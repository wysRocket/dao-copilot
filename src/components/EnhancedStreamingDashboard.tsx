/**
 * Enhanced Streaming Transcription Dashboard
 * 
 * Comprehensive monitoring dashboard for the streaming transcription system
 * with real-time metrics, alerts, and performance visualization.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { UnifiedPerformanceService, type StreamingPerformanceMetrics } from '../services/unified-performance'
import type { 
  StreamingTranscriptionMonitor, 
  StreamingTranscriptionMetrics, 
  AlertEvent 
} from '../services/StreamingTranscriptionMonitor'

interface DashboardProps {
  monitor?: StreamingTranscriptionMonitor
  refreshInterval?: number
  enableAlerts?: boolean
}

interface PerformanceReport {
  transcription: ReturnType<UnifiedPerformanceService['getPerformanceStats']>
  streaming: ReturnType<UnifiedPerformanceService['getStreamingStats']>
  overall: {
    systemHealth: 'excellent' | 'good' | 'degraded' | 'poor'
    recommendations: string[]
  }
}

interface DashboardState {
  metrics: StreamingTranscriptionMetrics | null
  alerts: AlertEvent[]
  isLoading: boolean
  lastUpdate: number
  performanceReport: PerformanceReport | null
}

/**
 * Format bytes to human readable format
 */
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format processing time to human readable format
 */
const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Get color for metric value based on thresholds
 */
const getMetricColor = (value: number, goodThreshold: number, warningThreshold: number): string => {
  if (value >= goodThreshold) return 'text-green-600'
  if (value >= warningThreshold) return 'text-yellow-600'
  return 'text-red-600'
}

/**
 * Alert severity to color mapping
 */
const getAlertColor = (severity: 'info' | 'warning' | 'error' | 'critical'): string => {
  switch (severity) {
    case 'info': return 'bg-blue-100 border-blue-500 text-blue-700'
    case 'warning': return 'bg-yellow-100 border-yellow-500 text-yellow-700'
    case 'error': return 'bg-red-100 border-red-500 text-red-700'
    case 'critical': return 'bg-red-200 border-red-600 text-red-800'
    default: return 'bg-gray-100 border-gray-500 text-gray-700'
  }
}

export const EnhancedStreamingDashboard: React.FC<DashboardProps> = ({
  monitor,
  refreshInterval = 2000,
  enableAlerts = true
}) => {
  const [state, setState] = useState<DashboardState>({
    metrics: null,
    alerts: [],
    isLoading: false,
    lastUpdate: 0,
    performanceReport: null
  })

  const alertSoundRef = useRef<HTMLAudioElement>(null)
  const performanceService = UnifiedPerformanceService.getInstance()

  /**
   * Load current metrics and alerts
   */
  const loadMetrics = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      let metrics: StreamingTranscriptionMetrics | null = null
      let alerts: AlertEvent[] = []

      if (monitor) {
        metrics = monitor.getMetrics()
        alerts = monitor.getActiveAlerts()
      }

      // Get performance report
      const performanceReport = performanceService.getCombinedPerformanceReport()

      setState(prev => ({
        ...prev,
        metrics,
        alerts,
        lastUpdate: Date.now(),
        performanceReport,
        isLoading: false
      }))

      // Play alert sound for critical alerts
      if (enableAlerts && alerts.some(alert => alert.severity === 'critical')) {
        alertSoundRef.current?.play().catch(() => {
          // Ignore audio play errors
        })
      }

    } catch (error) {
      console.error('Failed to load metrics:', error)
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [monitor, performanceService, enableAlerts])

  /**
   * Clear specific alert
   */
  const clearAlert = useCallback((alert: AlertEvent) => {
    if (monitor) {
      monitor.clearAlert(alert.metric, alert.sessionId)
      loadMetrics() // Refresh
    }
  }, [monitor, loadMetrics])

  /**
   * Clear all alerts
   */
  const clearAllAlerts = useCallback(() => {
    if (monitor) {
      monitor.clearAllAlerts()
      loadMetrics() // Refresh
    }
  }, [monitor, loadMetrics])

  /**
   * Reset all metrics
   */
  const resetMetrics = useCallback(() => {
    if (monitor) {
      monitor.resetMetrics()
      performanceService.clearMetrics()
      loadMetrics() // Refresh
    }
  }, [monitor, performanceService, loadMetrics])

  // Set up auto-refresh
  useEffect(() => {
    const interval = setInterval(loadMetrics, refreshInterval)
    loadMetrics() // Initial load

    return () => clearInterval(interval)
  }, [loadMetrics, refreshInterval])

  // Set up alert monitoring
  useEffect(() => {
    if (monitor && enableAlerts) {
      const unsubscribe = monitor.onAlert((alert) => {
        console.log('Dashboard received alert:', alert)
        loadMetrics() // Refresh on new alert
      })
      return unsubscribe
    }
  }, [monitor, enableAlerts, loadMetrics])

  const { metrics, alerts, isLoading, lastUpdate, performanceReport } = state

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      {/* Audio element for alert sounds */}
      <audio ref={alertSoundRef} preload="auto">
        <source src="/alert-sound.mp3" type="audio/mpeg" />
      </audio>

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Streaming Transcription Dashboard
        </h2>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">
            Last updated: {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'Never'}
          </span>
          {isLoading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          )}
          <button
            onClick={loadMetrics}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Refresh
          </button>
          <button
            onClick={resetMetrics}
            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-gray-800">
              Active Alerts ({alerts.length})
            </h3>
            <button
              onClick={clearAllAlerts}
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              Clear All
            </button>
          </div>
          <div className="space-y-2">
            {alerts.map((alert, index) => (
              <div
                key={`${alert.metric}-${alert.timestamp}-${index}`}
                className={`p-3 rounded border-l-4 ${getAlertColor(alert.severity)}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold uppercase text-xs">
                      {alert.severity}
                    </div>
                    <div className="text-sm">{alert.message}</div>
                    <div className="text-xs opacity-75 mt-1">
                      Value: {typeof alert.value === 'number' ? alert.value.toFixed(2) : alert.value} | 
                      Threshold: {typeof alert.threshold === 'number' ? alert.threshold.toFixed(2) : alert.threshold} |
                      Time: {new Date(alert.timestamp).toLocaleTimeString()}
                      {alert.sessionId && ` | Session: ${alert.sessionId}`}
                    </div>
                  </div>
                  <button
                    onClick={() => clearAlert(alert)}
                    className="text-xs bg-white bg-opacity-50 hover:bg-opacity-75 rounded px-2 py-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Dashboard */}
      {metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Session Metrics */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold mb-3 text-gray-800">Session Metrics</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Active Sessions:</span>
                <span className={`font-bold ${getMetricColor(metrics.activeSessions, 1, 0)}`}>
                  {metrics.activeSessions}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Sessions:</span>
                <span className="font-bold text-gray-800">{metrics.totalSessions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Duration:</span>
                <span className="font-bold text-gray-800">
                  {formatTime(metrics.averageSessionDuration)}
                </span>
              </div>
            </div>
          </div>

          {/* Processing Metrics */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold mb-3 text-gray-800">Processing Metrics</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Chunks Processed:</span>
                <span className="font-bold text-gray-800">{metrics.chunksProcessed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Processing Time:</span>
                <span className={`font-bold ${getMetricColor(5000 - metrics.averageChunkProcessingTime, 4000, 2000)}`}>
                  {formatTime(metrics.averageChunkProcessingTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Success Rate:</span>
                <span className={`font-bold ${getMetricColor(metrics.successRate, 95, 90)}`}>
                  {metrics.successRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Error Rate:</span>
                <span className={`font-bold ${getMetricColor(100 - metrics.errorRate, 95, 90)}`}>
                  {metrics.errorRate.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Memory Metrics */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold mb-3 text-gray-800">Memory Metrics</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Current Usage:</span>
                <span className={`font-bold ${getMetricColor(100*1024*1024 - metrics.currentMemoryUsage, 50*1024*1024, 25*1024*1024)}`}>
                  {formatBytes(metrics.currentMemoryUsage)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Peak Usage:</span>
                <span className="font-bold text-gray-800">
                  {formatBytes(metrics.peakMemoryUsage)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Efficiency:</span>
                <span className={`font-bold ${getMetricColor(metrics.memoryEfficiency, 80, 60)}`}>
                  {metrics.memoryEfficiency.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pool Utilization:</span>
                <span className={`font-bold ${getMetricColor(100 - metrics.objectPoolUtilization, 20, 50)}`}>
                  {metrics.objectPoolUtilization.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Stream Performance */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold mb-3 text-gray-800">Stream Performance</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Throughput:</span>
                <span className={`font-bold ${getMetricColor(metrics.streamThroughput, 10, 5)}`}>
                  {metrics.streamThroughput.toFixed(1)} chunks/sec
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Latency:</span>
                <span className={`font-bold ${getMetricColor(1000 - metrics.streamLatency, 800, 500)}`}>
                  {formatTime(metrics.streamLatency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Buffer Usage:</span>
                <span className={`font-bold ${getMetricColor(100 - metrics.bufferUtilization, 70, 50)}`}>
                  {metrics.bufferUtilization.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Backpressure Metrics */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold mb-3 text-gray-800">Backpressure Control</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Activations:</span>
                <span className={`font-bold ${getMetricColor(100 - metrics.backpressureActivations, 90, 70)}`}>
                  {metrics.backpressureActivations}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Duration:</span>
                <span className="font-bold text-gray-800">
                  {formatTime(metrics.averageBackpressureDuration)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Circuit Breaker:</span>
                <span className={`font-bold ${getMetricColor(10 - metrics.circuitBreakerTrips, 8, 5)}`}>
                  {metrics.circuitBreakerTrips} trips
                </span>
              </div>
            </div>
          </div>

          {/* Quality Metrics */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-lg font-semibold mb-3 text-gray-800">Quality Metrics</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Confidence:</span>
                <span className={`font-bold ${getMetricColor(metrics.averageConfidence * 100, 85, 70)}`}>
                  {(metrics.averageConfidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Accuracy:</span>
                <span className={`font-bold ${getMetricColor(metrics.transcriptionAccuracy, 90, 80)}`}>
                  {metrics.transcriptionAccuracy.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Processing Quality:</span>
                <span className={`font-bold ${
                  metrics.processingQuality === 'excellent' ? 'text-green-600' :
                  metrics.processingQuality === 'good' ? 'text-blue-600' :
                  metrics.processingQuality === 'degraded' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {metrics.processingQuality.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-gray-500">
            {monitor ? 'No metrics available yet. Start a transcription session to see metrics.' : 'No monitor provided.'}
          </div>
        </div>
      )}

      {/* Performance Report Summary */}
      {performanceReport && (
        <div className="mt-6 bg-gray-50 p-4 rounded-lg">
          <h4 className="text-lg font-semibold mb-3 text-gray-800">System Health Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Overall System Health:</span>
                <span className={`font-bold ${
                  performanceReport.overall.systemHealth === 'excellent' ? 'text-green-600' :
                  performanceReport.overall.systemHealth === 'good' ? 'text-blue-600' :
                  performanceReport.overall.systemHealth === 'degraded' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {performanceReport.overall.systemHealth.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Streaming Quality Score:</span>
                <span className="font-bold text-gray-800">
                  {performanceReport.streaming.averageQualityScore.toFixed(1)}/100
                </span>
              </div>
            </div>
            <div>
              <h5 className="text-sm font-semibold text-gray-700 mb-2">Recommendations:</h5>
              <div className="text-xs text-gray-600 space-y-1">
                {performanceReport.overall.recommendations.slice(0, 3).map((rec: string, index: number) => (
                  <div key={index} className="flex items-start">
                    <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mt-1 mr-2 flex-shrink-0"></span>
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EnhancedStreamingDashboard
