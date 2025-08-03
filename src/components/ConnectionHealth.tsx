/**
 * Connection Health Component
 * Displays connection quality metrics and performance indicators
 */

import React, {useEffect, useState} from 'react'
import {cn} from '@/utils/tailwind'
import {getTranscriptionStateManager, ConnectionState, StateChangeType, TranscriptionState} from '../state/TranscriptionStateManager'

export interface ConnectionHealthProps {
  className?: string
  showMetrics?: boolean
  compact?: boolean
}

export const ConnectionHealth: React.FC<ConnectionHealthProps> = ({
  className,
  showMetrics = true,
  compact = false
}) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>()

  useEffect(() => {
    const stateManager = getTranscriptionStateManager()
    const initialState = stateManager.getState()
    setConnectionState(initialState.connection)

    // Subscribe to connection state changes
    const unsubscribe = stateManager.subscribe((type: StateChangeType, state: TranscriptionState) => {
      if (type === 'connection-status-changed' || type === 'connection-metrics-updated') {
        setConnectionState(state.connection)
      }
    })

    return unsubscribe
  }, [])

  if (!connectionState) {
    return null
  }

  const getQualityIcon = (quality: ConnectionState['quality']) => {
    switch (quality) {
      case 'excellent':
        return '🟢'
      case 'good':
        return '🔵'
      case 'poor':
        return '🟡'
      case 'unstable':
        return '🔴'
      default:
        return '⚪'
    }
  }

  const getQualityColor = (quality: ConnectionState['quality']) => {
    switch (quality) {
      case 'excellent':
        return 'text-green-600 dark:text-green-400'
      case 'good':
        return 'text-blue-600 dark:text-blue-400'
      case 'poor':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'unstable':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getQualityBgColor = (quality: ConnectionState['quality']) => {
    switch (quality) {
      case 'excellent':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'good':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      case 'poor':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      case 'unstable':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      default:
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
    return `${(ms / 3600000).toFixed(1)}h`
  }

  const getSuccessRate = () => {
    const total = connectionState.metrics.totalConnections
    const failed = connectionState.metrics.failedConnections
    if (total === 0) return 100
    return ((total - failed) / total) * 100
  }

  const getQualityDescription = (quality: ConnectionState['quality']) => {
    switch (quality) {
      case 'excellent':
        return 'Connection is stable with optimal performance'
      case 'good':
        return 'Connection is stable with good performance'
      case 'poor':
        return 'Connection has some issues but is functional'
      case 'unstable':
        return 'Connection is experiencing significant issues'
      default:
        return 'Connection quality unknown'
    }
  }

  if (compact) {
    return (
      <div className={cn(
        'flex items-center space-x-2 px-2 py-1 rounded border',
        getQualityBgColor(connectionState.quality),
        className
      )}>
        <span className="text-sm">{getQualityIcon(connectionState.quality)}</span>
        <span className={cn('text-sm font-medium', getQualityColor(connectionState.quality))}>
          {connectionState.quality}
        </span>
        {showMetrics && (
          <span className="text-xs text-muted-foreground">
            {getSuccessRate().toFixed(0)}%
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      'p-4 border rounded-lg',
      getQualityBgColor(connectionState.quality),
      className
    )}>
      {/* Header */}
      <div className="flex items-center space-x-3 mb-4">
        <span className="text-2xl">{getQualityIcon(connectionState.quality)}</span>
        <div>
          <h3 className={cn('font-semibold text-lg', getQualityColor(connectionState.quality))}>
            {connectionState.quality.charAt(0).toUpperCase() + connectionState.quality.slice(1)} Quality
          </h3>
          <p className="text-sm text-muted-foreground">
            {getQualityDescription(connectionState.quality)}
          </p>
        </div>
      </div>

      {/* Quality Metrics */}
      {showMetrics && (
        <div className="space-y-3">
          {/* Success Rate */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Success Rate</span>
              <span className="font-mono">{getSuccessRate().toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${getSuccessRate()}%` }}
              />
            </div>
          </div>

          {/* Connection Stats */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Connections:</span>
                <span className="font-mono">{connectionState.metrics.totalConnections}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failed:</span>
                <span className="font-mono text-red-600 dark:text-red-400">
                  {connectionState.metrics.failedConnections}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime:</span>
                <span className="font-mono">{formatDuration(connectionState.metrics.uptime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Duration:</span>
                <span className="font-mono">{formatDuration(connectionState.metrics.averageConnectionDuration)}</span>
              </div>
            </div>
          </div>

          {/* Connection Times */}
          {(connectionState.metrics.lastConnectedAt || connectionState.metrics.lastDisconnectedAt) && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {connectionState.metrics.lastConnectedAt && (
                  <div>
                    <span className="text-muted-foreground block">Last Connected:</span>
                    <span className="font-mono text-xs">
                      {new Date(connectionState.metrics.lastConnectedAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                
                {connectionState.metrics.lastDisconnectedAt && (
                  <div>
                    <span className="text-muted-foreground block">Last Disconnected:</span>
                    <span className="font-mono text-xs">
                      {new Date(connectionState.metrics.lastDisconnectedAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quality Recommendations */}
          {connectionState.quality === 'poor' || connectionState.quality === 'unstable' && (
            <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                💡 Improve Connection Quality:
              </p>
              <ul className="text-yellow-700 dark:text-yellow-300 text-xs space-y-1">
                <li>• Check network stability and bandwidth</li>
                <li>• Verify API key validity and quota limits</li>
                <li>• Consider switching to a different network</li>
                {connectionState.quality === 'unstable' && (
                  <li>• Try reconnecting or restarting the application</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ConnectionHealth
