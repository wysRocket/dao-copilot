/**
 * WebSocket Connection Status Component
 * Displays real-time connection status and quality metrics for Gemini Live API
 */

import React, {useEffect, useState} from 'react'
import {cn} from '@/utils/tailwind'
import GeminiLiveWebSocketClient, {ConnectionState} from '../services/gemini-live-websocket'
import {ConnectionMetrics, ConnectionQuality} from '../services/gemini-reconnection-manager'

export interface WebSocketConnectionStatusProps {
  className?: string
  client?: GeminiLiveWebSocketClient
  showQuality?: boolean
  showMetrics?: boolean
  compact?: boolean
  showControls?: boolean
}

interface ConnectionStatusState {
  state: ConnectionState
  quality: ConnectionQuality | null
  isReconnecting: boolean
  reconnectionAttempts: number
  nextReconnectDelay: number
  metrics?: ConnectionMetrics
}

export const WebSocketConnectionStatus: React.FC<WebSocketConnectionStatusProps> = ({
  className,
  client,
  showQuality = true,
  showMetrics = false,
  compact = false,
  showControls = false
}) => {
  const [status, setStatus] = useState<ConnectionStatusState>({
    state: ConnectionState.DISCONNECTED,
    quality: null,
    isReconnecting: false,
    reconnectionAttempts: 0,
    nextReconnectDelay: 0
  })

  useEffect(() => {
    if (!client) return

    // Connection state handlers
    const handleConnected = () => {
      setStatus(prev => ({
        ...prev,
        state: ConnectionState.CONNECTED,
        isReconnecting: false,
        reconnectionAttempts: 0
      }))
    }

    const handleDisconnected = () => {
      setStatus(prev => ({
        ...prev,
        state: ConnectionState.DISCONNECTED
      }))
    }

    const handleConnecting = () => {
      setStatus(prev => ({
        ...prev,
        state: ConnectionState.CONNECTING
      }))
    }

    const handleReconnecting = () => {
      setStatus(prev => ({
        ...prev,
        state: ConnectionState.RECONNECTING,
        isReconnecting: true
      }))
    }

    // Quality and metrics handlers
    const handleQualityUpdate = (quality: ConnectionQuality, metrics: ConnectionMetrics) => {
      setStatus(prev => ({
        ...prev,
        quality,
        metrics
      }))
    }

    const handleReconnectionProgress = (attempts: number, delay: number) => {
      setStatus(prev => ({
        ...prev,
        reconnectionAttempts: attempts,
        nextReconnectDelay: delay
      }))
    }

    // Register event listeners
    client.on('connected', handleConnected)
    client.on('disconnected', handleDisconnected)
    client.on('connecting', handleConnecting)
    client.on('reconnecting', handleReconnecting)
    client.on('qualityUpdate', handleQualityUpdate)
    client.on('reconnectionProgress', handleReconnectionProgress)

    // Initialize with current state
    if (client.isConnected()) {
      setStatus(prev => ({...prev, state: ConnectionState.CONNECTED}))
    }

    return () => {
      client.off('connected', handleConnected)
      client.off('disconnected', handleDisconnected)
      client.off('connecting', handleConnecting)
      client.off('reconnecting', handleReconnecting)
      client.off('qualityUpdate', handleQualityUpdate)
      client.off('reconnectionProgress', handleReconnectionProgress)
    }
  }, [client])

  const getStatusColor = (state: ConnectionState) => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return 'bg-green-600 dark:bg-green-400'
      case ConnectionState.CONNECTING:
        return 'bg-yellow-600 dark:bg-yellow-400'
      case ConnectionState.RECONNECTING:
        return 'bg-orange-600 dark:bg-orange-400'
      case ConnectionState.DISCONNECTED:
      default:
        return 'bg-red-600 dark:bg-red-400'
    }
  }

  const getQualityColor = (quality: ConnectionQuality | null) => {
    if (!quality) return 'text-muted-foreground'
    switch (quality) {
      case ConnectionQuality.EXCELLENT:
        return 'text-green-600 dark:text-green-400'
      case ConnectionQuality.GOOD:
        return 'text-blue-600 dark:text-blue-400'
      case ConnectionQuality.POOR:
        return 'text-yellow-600 dark:text-yellow-400'
      case ConnectionQuality.UNSTABLE:
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusText = (state: ConnectionState) => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return 'Connected'
      case ConnectionState.CONNECTING:
        return 'Connecting'
      case ConnectionState.RECONNECTING:
        return 'Reconnecting'
      case ConnectionState.DISCONNECTED:
      default:
        return 'Disconnected'
    }
  }

  const getQualityIcon = (quality: ConnectionQuality | null) => {
    if (!quality) return '❓'
    switch (quality) {
      case ConnectionQuality.EXCELLENT:
        return '📶'
      case ConnectionQuality.GOOD:
        return '📡'
      case ConnectionQuality.POOR:
        return '📳'
      case ConnectionQuality.UNSTABLE:
        return '⚠️'
      default:
        return '❓'
    }
  }

  const handleConnect = () => {
    if (client && !client.isConnected()) {
      client.connect()
    }
  }

  const handleDisconnect = () => {
    if (client && client.isConnected()) {
      client.disconnect()
    }
  }

  if (compact) {
    return (
      <div className={cn('text-muted-foreground flex items-center space-x-2 text-xs', className)}>
        <div
          className={cn('h-1.5 w-1.5 rounded-full', getStatusColor(status.state), {
            'animate-pulse': status.state === ConnectionState.CONNECTING || status.isReconnecting
          })}
        />
        {showQuality && status.quality && <span className={getQualityIcon(status.quality)}></span>}
        {status.isReconnecting && status.reconnectionAttempts > 0 && (
          <span className="font-mono">{status.reconnectionAttempts}</span>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div
            className={cn('h-2 w-2 rounded-full', getStatusColor(status.state), {
              'animate-pulse': status.state === ConnectionState.CONNECTING || status.isReconnecting
            })}
          />
          <span className="text-sm font-medium">{getStatusText(status.state)}</span>
          {status.isReconnecting && (
            <span className="text-muted-foreground text-xs">
              (Attempt {status.reconnectionAttempts})
            </span>
          )}
        </div>

        {showControls && (
          <div className="flex items-center space-x-1">
            <button
              onClick={handleConnect}
              disabled={
                status.state === ConnectionState.CONNECTED ||
                status.state === ConnectionState.CONNECTING
              }
              className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect
            </button>
            <button
              onClick={handleDisconnect}
              disabled={status.state === ConnectionState.DISCONNECTED}
              className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Connection Quality */}
      {showQuality && status.quality && (
        <div className="flex items-center space-x-2 text-sm">
          <span>{getQualityIcon(status.quality)}</span>
          <span className={cn('capitalize', getQualityColor(status.quality))}>
            {status.quality.toLowerCase()}
          </span>
          <span className="text-muted-foreground">quality</span>
        </div>
      )}

      {/* Reconnection Progress */}
      {status.isReconnecting && status.nextReconnectDelay > 0 && (
        <div className="text-muted-foreground text-xs">
          Next attempt in {Math.ceil(status.nextReconnectDelay / 1000)}s
        </div>
      )}

      {/* Connection Metrics */}
      {showMetrics && status.metrics && (
        <div className="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-medium">Success:</span>{' '}
            {status.metrics.successfulConnections || 0}
          </div>
          <div>
            <span className="font-medium">Failed:</span> {status.metrics.failedConnections || 0}
          </div>
          <div>
            <span className="font-medium">Uptime:</span>{' '}
            {Math.floor((status.metrics.totalUptime || 0) / 1000)}s
          </div>
          <div>
            <span className="font-medium">Avg Duration:</span>{' '}
            {Math.floor((status.metrics.averageConnectionDuration || 0) / 1000)}s
          </div>
        </div>
      )}
    </div>
  )
}

export default WebSocketConnectionStatus
