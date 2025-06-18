/**
 * Gemini Live Connection Indicator
 * Simple, compact indicator for WebSocket connection status
 */

import React from 'react'
import {cn} from '@/utils/tailwind'
import {ConnectionState} from '../services/gemini-live-websocket'
import {ConnectionQuality} from '../services/gemini-reconnection-manager'

export interface GeminiConnectionIndicatorProps {
  className?: string
  state: ConnectionState
  quality?: ConnectionQuality | null
  isReconnecting?: boolean
  reconnectionAttempts?: number
  showLabel?: boolean
}

export const GeminiConnectionIndicator: React.FC<GeminiConnectionIndicatorProps> = ({
  className,
  state,
  quality,
  isReconnecting = false,
  reconnectionAttempts = 0,
  showLabel = true
}) => {
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
        return 'bg-gray-600 dark:bg-gray-400'
    }
  }

  const getStatusText = (state: ConnectionState) => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return 'Gemini Live'
      case ConnectionState.CONNECTING:
        return 'Connecting...'
      case ConnectionState.RECONNECTING:
        return 'Reconnecting...'
      case ConnectionState.DISCONNECTED:
      default:
        return 'Offline'
    }
  }

  const getQualityIcon = (quality: ConnectionQuality) => {
    switch (quality) {
      case ConnectionQuality.EXCELLENT:
        return '●●●'
      case ConnectionQuality.GOOD:
        return '●●○'
      case ConnectionQuality.POOR:
        return '●○○'
      case ConnectionQuality.UNSTABLE:
        return '⚠'
      default:
        return '○○○'
    }
  }

  const shouldAnimate = state === ConnectionState.CONNECTING || 
                       state === ConnectionState.RECONNECTING || 
                       isReconnecting

  return (
    <div className={cn('flex items-center space-x-2 text-xs', className)}>
      <div
        className={cn(
          'h-2 w-2 rounded-full',
          getStatusColor(state),
          {
            'animate-pulse': shouldAnimate
          }
        )}
      />
      
      {showLabel && (
        <span className="text-muted-foreground">
          {getStatusText(state)}
          {isReconnecting && reconnectionAttempts > 0 && (
            <span className="ml-1 font-mono">({reconnectionAttempts})</span>
          )}
        </span>
      )}
      
      {quality && (
        <span 
          className="font-mono text-xs opacity-60"
          title={`Connection quality: ${quality.toLowerCase()}`}
        >
          {getQualityIcon(quality)}
        </span>
      )}
    </div>
  )
}

export default GeminiConnectionIndicator
