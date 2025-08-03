/**
 * Telemetry Dashboard Component
 * Real-time monitoring dashboard for WebSocket transcription protection systems
 */

import React, {useState, useEffect, useCallback} from 'react'
import {UnifiedTelemetrySystem, DashboardData} from '../services/UnifiedTelemetrySystem'

// Extend Window interface for console commands
declare global {
  interface Window {
    runTranscriptionDiagnostics?: () => Promise<unknown>
    resetCircuitBreakers?: () => boolean
    checkCircuitBreakerStatus?: () => unknown
    runProtectionSystemTests?: () => Promise<void>
    exportTelemetryData?: () => void
  }
}

interface TelemetryDashboardProps {
  className?: string
  autoRefresh?: boolean
  refreshInterval?: number
  maxEvents?: number
}

const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 5000,
  maxEvents = 20
}) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const updateDashboard = useCallback(() => {
    try {
      const telemetry = UnifiedTelemetrySystem.getInstance()
      const data = telemetry.getDashboardData()
      setDashboardData(data)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial load
    updateDashboard()

    // Setup auto-refresh
    if (autoRefresh) {
      const intervalId = setInterval(updateDashboard, refreshInterval)
      return () => clearInterval(intervalId)
    }
  }, [updateDashboard, autoRefresh, refreshInterval])

  const formatUptime = (uptime: number): string => {
    const minutes = Math.floor(uptime / 1000 / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    return `${minutes}m`
  }

  const getHealthColor = (health: number): string => {
    if (health >= 80) return 'text-green-500'
    if (health >= 60) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getSeverityIcon = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return '🚨'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return '📊'
    }
  }

  if (isLoading) {
    return (
      <div className={`telemetry-dashboard loading ${className}`}>
        <div className="flex items-center justify-center p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading telemetry data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`telemetry-dashboard error ${className}`}>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center">
            <span className="mr-2 text-xl text-red-500">❌</span>
            <div>
              <h3 className="font-medium text-red-800">Telemetry Error</h3>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
          <button
            onClick={updateDashboard}
            className="mt-3 rounded bg-red-100 px-3 py-1 text-sm text-red-800 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!dashboardData) return null

  const {metrics, events, alerts} = dashboardData

  return (
    <div className={`telemetry-dashboard ${className}`}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">📊 Telemetry Dashboard</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Last updated: {lastUpdate?.toLocaleTimeString()}
          </span>
          <button
            onClick={updateDashboard}
            className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Request Metrics */}
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-600">🔢 Request Metrics</h3>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Total:</span>
              <span className="font-mono text-sm">{metrics.totalRequests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Success Rate:</span>
              <span className="font-mono text-sm text-green-600">
                {metrics.totalRequests > 0
                  ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Error Rate:</span>
              <span className="font-mono text-sm text-red-600">
                {metrics.errorRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Avg Response:</span>
              <span className="font-mono text-sm">{metrics.averageResponseTime.toFixed(0)}ms</span>
            </div>
          </div>
        </div>

        {/* Protection Status */}
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-600">🛡️ Protection Status</h3>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Circuit Breaker Trips:</span>
              <span className="font-mono text-sm text-orange-600">
                {metrics.circuitBreakerTrips}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Duplicates Blocked:</span>
              <span className="font-mono text-sm text-blue-600">
                {metrics.duplicateRequestsBlocked}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Stack Overflows:</span>
              <span className="font-mono text-sm text-red-600">
                {metrics.stackOverflowsPrevented}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Total Events:</span>
              <span className="font-mono text-sm">{metrics.totalProtectionEvents}</span>
            </div>
          </div>
        </div>

        {/* System Health */}
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-600">⚡ System Health</h3>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Connection Health:</span>
              <span className={`font-mono text-sm ${getHealthColor(metrics.connectionHealth)}`}>
                {metrics.connectionHealth.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Memory Usage:</span>
              <span className="font-mono text-sm">{metrics.memoryUsage.toFixed(1)} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Requests/Min:</span>
              <span className="font-mono text-sm">{metrics.requestsPerMinute}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Errors/Min:</span>
              <span className="font-mono text-sm text-red-600">{metrics.errorsPerMinute}</span>
            </div>
          </div>
        </div>

        {/* Uptime */}
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-600">⏱️ System Uptime</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{formatUptime(metrics.uptime)}</div>
            <div className="mt-1 text-xs text-gray-500">
              Running since {new Date(Date.now() - metrics.uptime).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-lg font-medium text-gray-800">📰 Recent Events</h3>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {events.slice(0, maxEvents).map(event => (
              <div key={event.id} className="flex items-start gap-2 text-sm">
                <span className="text-lg">{event.emoji || getSeverityIcon(event.severity)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-gray-800">{event.message}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()} • {event.category}
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="py-4 text-center text-gray-500">No recent events</div>
            )}
          </div>
        </div>

        {/* Active Alerts */}
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-lg font-medium text-gray-800">🚨 Alert Status</h3>
          <div className="space-y-2">
            {alerts
              .filter(alert => alert.enabled)
              .map(alert => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between rounded bg-gray-50 p-2"
                >
                  <div>
                    <div className="text-sm font-medium">{alert.name}</div>
                    <div className="text-xs text-gray-500">{alert.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        alert.severity === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : alert.severity === 'high'
                            ? 'bg-orange-100 text-orange-800'
                            : alert.severity === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-xs text-gray-500">
                      {alert.lastTriggered
                        ? new Date(alert.lastTriggered).toLocaleTimeString()
                        : 'Never'}
                    </span>
                  </div>
                </div>
              ))}
            {alerts.filter(alert => alert.enabled).length === 0 && (
              <div className="py-4 text-center text-gray-500">✅ No active alerts</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 rounded-lg bg-gray-50 p-4">
        <h3 className="mb-3 text-lg font-medium text-gray-800">🎮 Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.runTranscriptionDiagnostics?.()}
            className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
          >
            🔍 Run Diagnostics
          </button>
          <button
            onClick={() => window.resetCircuitBreakers?.()}
            className="rounded bg-orange-500 px-3 py-1 text-sm text-white hover:bg-orange-600"
          >
            🔄 Reset Circuit Breakers
          </button>
          <button
            onClick={() => window.checkCircuitBreakerStatus?.()}
            className="rounded bg-green-500 px-3 py-1 text-sm text-white hover:bg-green-600"
          >
            📊 Check Status
          </button>
          <button
            onClick={() => window.runProtectionSystemTests?.()}
            className="rounded bg-purple-500 px-3 py-1 text-sm text-white hover:bg-purple-600"
          >
            🧪 Run Tests
          </button>
          <button
            onClick={() => window.exportTelemetryData?.()}
            className="rounded bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
          >
            📤 Export Data
          </button>
        </div>
      </div>
    </div>
  )
}

export default TelemetryDashboard

// Hook for using telemetry data in other components
export const useTelemetryData = (refreshInterval: number = 5000) => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const updateData = () => {
      try {
        const telemetry = UnifiedTelemetrySystem.getInstance()
        const dashboardData = telemetry.getDashboardData()
        setData(dashboardData)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load telemetry data')
      } finally {
        setLoading(false)
      }
    }

    updateData()
    const intervalId = setInterval(updateData, refreshInterval)

    return () => clearInterval(intervalId)
  }, [refreshInterval])

  return {data, loading, error}
}
