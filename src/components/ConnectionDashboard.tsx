/**
 * Enhanced WebSocket Connection Dashboard
 * Comprehensive connection status display with retry progress, quota monitoring, and performance metrics
 * Integrates with TranscriptionStateManager connection state
 */

import React, {useEffect, useState} from 'react'
import {cn} from '@/utils/tailwind'
import {getTranscriptionStateManager, ConnectionState, StateChangeType, TranscriptionState} from '../state/TranscriptionStateManager'

// Simple time formatting utility
const formatTimeAgo = (timestamp: number) => {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const formatTimeUntil = (timestamp: number) => {
  const now = Date.now()
  const diff = timestamp - now
  
  if (diff <= 0) return 'now'
  if (diff < 60000) return `in ${Math.ceil(diff / 1000)}s`
  if (diff < 3600000) return `in ${Math.ceil(diff / 60000)}m`
  if (diff < 86400000) return `in ${Math.ceil(diff / 3600000)}h`
  return `in ${Math.ceil(diff / 86400000)}d`
}

export interface ConnectionDashboardProps {
  className?: string
  compact?: boolean
  showRetryProgress?: boolean
  showQuotaStatus?: boolean
  showMetrics?: boolean
  showControls?: boolean
}

export const ConnectionDashboard: React.FC<ConnectionDashboardProps> = ({
  className,
  compact = false,
  showRetryProgress = true,
  showQuotaStatus = true,
  showMetrics = true,
  showControls = false
}) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const stateManager = getTranscriptionStateManager()
    const initialState = stateManager.getState()
    setConnectionState(initialState.connection)

    // Subscribe to connection state changes
    const unsubscribe = stateManager.subscribe((type: StateChangeType, state: TranscriptionState) => {
      if (type.startsWith('connection-') || type.startsWith('quota-')) {
        setConnectionState(state.connection)
        setIsVisible(true)
        
        // Auto-hide after successful connection if compact
        if (compact && state.connection.status === 'connected' && !state.connection.lastError) {
          setTimeout(() => setIsVisible(false), 3000)
        }
      }
    })

    return unsubscribe
  }, [compact])

  if (!connectionState || (compact && !isVisible && connectionState.status === 'connected')) {
    return null
  }

  const getStatusIcon = (status: ConnectionState['status']) => {
    switch (status) {
      case 'connected':
        return '🟢'
      case 'connecting':
        return '🟡'
      case 'reconnecting':
        return '🔄'
      case 'failed':
        return '🔴'
      case 'disconnected':
      default:
        return '⚪'
    }
  }

  const getStatusText = (status: ConnectionState['status']) => {
    switch (status) {
      case 'connected':
        return 'Connected to Gemini Live'
      case 'connecting':
        return 'Connecting to Gemini Live...'
      case 'reconnecting':
        return 'Reconnecting...'
      case 'failed':
        return 'Connection Failed'
      case 'disconnected':
      default:
        return 'Disconnected'
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

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getRetryProgress = () => {
    if (!connectionState.retry.isRetrying) return 0
    const totalDelay = connectionState.retry.currentDelay
    const remaining = connectionState.retry.nextAttemptIn
    return ((totalDelay - remaining) / totalDelay) * 100
  }

  if (compact) {
    return (
      <div className={cn(
        'flex items-center space-x-2 px-3 py-1 rounded-md bg-white/10 backdrop-blur-sm border border-white/20',
        className
      )}>
        <span className="text-lg">{getStatusIcon(connectionState.status)}</span>
        <span className="text-sm font-medium">
          {getStatusText(connectionState.status)}
        </span>
        
        {connectionState.retry.isRetrying && (
          <div className="flex items-center space-x-1">
            <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-1000"
                style={{ width: `${getRetryProgress()}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {Math.ceil(connectionState.retry.nextAttemptIn / 1000)}s
            </span>
          </div>
        )}
        
        {connectionState.lastError && (
          <span className="text-xs text-red-500 truncate max-w-32">
            {connectionState.lastError.message}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      'p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{getStatusIcon(connectionState.status)}</span>
          <div>
            <h3 className="font-semibold text-lg">{getStatusText(connectionState.status)}</h3>
            <p className={cn('text-sm', getQualityColor(connectionState.quality))}>
              Quality: {connectionState.quality}
            </p>
          </div>
        </div>
        
        {showControls && (
          <div className="flex space-x-2">
            <button className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600">
              Reconnect
            </button>
            <button className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {connectionState.lastError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-start space-x-2">
            <span className="text-red-500">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {connectionState.lastError.type.toUpperCase()} Error
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                {connectionState.lastError.message}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">
                {formatTimeAgo(connectionState.lastError.timestamp)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Retry Progress */}
      {showRetryProgress && connectionState.retry.isRetrying && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Retry Attempt {connectionState.retry.attemptCount} of {connectionState.retry.maxAttempts}
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-400">
              {formatDuration(connectionState.retry.nextAttemptIn)} remaining
            </span>
          </div>
          
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${getRetryProgress()}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Strategy: {connectionState.retry.strategy}</span>
            <span>Delay: {formatDuration(connectionState.retry.currentDelay)}</span>
          </div>
        </div>
      )}

      {/* Quota Status */}
      {showQuotaStatus && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">API Quota Status</span>
            <span className={cn('text-xs px-2 py-1 rounded', 
              connectionState.quota.isQuotaExceeded 
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            )}>
              {connectionState.quota.isQuotaExceeded ? 'Quota Exceeded' : 'Available'}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Available Keys:</span>
              <span className="ml-2 font-mono">
                {connectionState.quota.availableKeys}/{connectionState.quota.totalKeys}
              </span>
            </div>
            
            {connectionState.quota.quotaResetEstimate && (
              <div>
                <span className="text-muted-foreground">Reset:</span>
                <span className="ml-2 font-mono text-xs">
                  {formatTimeUntil(connectionState.quota.quotaResetEstimate)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection Metrics */}
      {showMetrics && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Uptime:</span>
              <span className="font-mono">{formatDuration(connectionState.metrics.uptime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connections:</span>
              <span className="font-mono">{connectionState.metrics.totalConnections}</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Failed:</span>
              <span className="font-mono">{connectionState.metrics.failedConnections}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Duration:</span>
              <span className="font-mono">{formatDuration(connectionState.metrics.averageConnectionDuration)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionDashboard
