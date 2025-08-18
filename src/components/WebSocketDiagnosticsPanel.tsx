/**
 * WebSocket Diagnostics Panel
 *
 * Real-time diagnostic information display for WebSocket transcription performance
 * Shows timing metrics, connection status, and latency information
 */

import React, {useState, useEffect} from 'react'
import {
  getWebSocketDiagnostics,
  WebSocketMetrics,
  DiagnosticEvent
} from '../utils/websocket-diagnostics'

interface DiagnosticsPanelProps {
  isVisible?: boolean
  onToggle?: () => void
  showDetailed?: boolean
}

export function WebSocketDiagnosticsPanel({
  isVisible = false,
  onToggle,
  showDetailed = false
}: DiagnosticsPanelProps) {
  const [metrics, setMetrics] = useState<WebSocketMetrics | null>(null)
  const [recentEvents, setRecentEvents] = useState<DiagnosticEvent[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    if (!isVisible) return

    const diagnostics = getWebSocketDiagnostics()

    const updateDiagnostics = () => {
      setMetrics(diagnostics.getMetrics())
      setRecentEvents(diagnostics.getRecentEvents(10))
      setLastUpdate(new Date())
    }

    // Initial update
    updateDiagnostics()

    // Update every 100ms when visible
    const interval = setInterval(updateDiagnostics, 100)

    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-16 bottom-4 z-[10001] h-8 w-12 cursor-pointer rounded border border-gray-600 bg-black/80 font-mono text-xs text-green-400 hover:bg-black/90"
        title="Show WebSocket Diagnostics (Ctrl+Shift+D)"
      >
        📊 WS
      </button>
    )
  }

  const getNetworkConditionColor = (condition: string) => {
    switch (condition) {
      case 'excellent':
        return 'text-green-400'
      case 'good':
        return 'text-yellow-400'
      case 'poor':
        return 'text-orange-400'
      case 'critical':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const getNetworkConditionIcon = (condition: string) => {
    switch (condition) {
      case 'excellent':
        return '🟢'
      case 'good':
        return '🟡'
      case 'poor':
        return '🟠'
      case 'critical':
        return '🔴'
      default:
        return '⚪'
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-[10000] max-h-96 w-80 overflow-y-auto rounded border border-gray-600 bg-black/95 p-3 font-mono text-xs text-green-400">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between font-bold text-green-400">
        <span>WebSocket Diagnostics</span>
        <button onClick={onToggle} className="text-lg leading-none text-gray-400 hover:text-white">
          ×
        </button>
      </div>

      {metrics && (
        <>
          {/* Connection Metrics */}
          <div className="mb-3">
            <div className="mb-1 text-yellow-400">Connection:</div>
            <div>Time: {metrics.connectionTime.toFixed(2)}ms</div>
            <div>Retries: {metrics.connectionRetries}</div>
            <div className={getNetworkConditionColor(metrics.networkCondition)}>
              Network: {getNetworkConditionIcon(metrics.networkCondition)}{' '}
              {metrics.networkCondition}
            </div>
          </div>

          {/* Message Metrics */}
          <div className="mb-3">
            <div className="mb-1 text-yellow-400">Messages:</div>
            <div>Total: {metrics.totalMessages}</div>
            <div>Missed: {metrics.missedMessages}</div>
            <div>Avg Latency: {metrics.averageLatency.toFixed(2)}ms</div>
            <div>Max Latency: {metrics.maxLatency.toFixed(2)}ms</div>
            {metrics.minLatency !== Infinity && (
              <div>Min Latency: {metrics.minLatency.toFixed(2)}ms</div>
            )}
          </div>

          {/* Recent Events */}
          <div className="mb-3">
            <div className="mb-1 text-yellow-400">Recent Events:</div>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {recentEvents
                .slice(0, 5)
                .reverse()
                .map((event, index) => (
                  <div key={index} className="text-gray-300">
                    <span className="text-cyan-400">{event.event}</span>
                    {event.duration && event.duration > 0 && (
                      <span className="ml-2 text-white">{event.duration.toFixed(1)}ms</span>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* Detailed Information */}
          {showDetailed && (
            <div className="mb-3">
              <div className="mb-1 text-yellow-400">Detailed:</div>
              <div>Last Heartbeat: {new Date(metrics.lastHeartbeat).toLocaleTimeString()}</div>
              <div>Receive Rate: {metrics.messageReceiveToDisplayTime.length}/s</div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 border-t border-gray-700 pt-2 text-xs text-gray-500">
            <div>Press Ctrl+Shift+D to toggle</div>
            <div>Last: {lastUpdate.toLocaleTimeString()}</div>
          </div>
        </>
      )}

      {!metrics && <div className="text-gray-400">Loading diagnostics...</div>}
    </div>
  )
}

export default WebSocketDiagnosticsPanel
