/**
 * Status Indicator Component
 *
 * Subtle status indicator for ongoing connection status display.
 * Provides minimal visual feedback about system health and connection state
 * without being intrusive. Designed to be embedded in status bars or corners.
 */

import React, {useEffect, useState, useCallback} from 'react'
import {cn} from '@/utils/tailwind'
import {statusNotifier, StatusEvent, StatusEventType} from './StatusNotifier'

export interface StatusIndicatorProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  position?:
    | 'inline'
    | 'fixed-top-right'
    | 'fixed-bottom-right'
    | 'fixed-top-left'
    | 'fixed-bottom-left'
  showLabel?: boolean
  showTooltip?: boolean
  animated?: boolean
}

export interface IndicatorState {
  status: 'healthy' | 'degraded' | 'warning' | 'error' | 'unknown'
  message: string
  details?: string
  lastUpdate: number
  eventCount: number
}

const STATUS_MESSAGES = {
  healthy: 'All systems operational',
  degraded: 'Some services degraded',
  warning: 'Service issues detected',
  error: 'Critical service errors',
  unknown: 'Status unknown'
}

const DEFAULT_STATE: IndicatorState = {
  status: 'healthy',
  message: STATUS_MESSAGES.healthy,
  lastUpdate: Date.now(),
  eventCount: 0
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  className,
  size = 'md',
  position = 'inline',
  showLabel = false,
  showTooltip = true,
  animated = true
}) => {
  const [state, setState] = useState<IndicatorState>(DEFAULT_STATE)
  const [isHovered, setIsHovered] = useState(false)

  // Handle status events and determine overall system health
  const handleStatusEvent = useCallback((event: StatusEvent) => {
    setState(prev => {
      const newState = {...prev}
      newState.lastUpdate = event.timestamp
      newState.eventCount += 1

      // Determine status based on event type
      switch (event.type) {
        case StatusEventType.CIRCUIT_BREAKER_OPENED:
        case StatusEventType.SYSTEM_DEGRADED:
          newState.status = 'error'
          newState.message = 'Service issues detected'
          newState.details = `${event.source}: ${event.type.replace(/_/g, ' ')}`
          break

        case StatusEventType.CIRCUIT_BREAKER_HALF_OPEN:
        case StatusEventType.CONNECTION_QUALITY_CHANGED:
          newState.status = 'warning'
          newState.message = 'Testing service recovery'
          newState.details = `${event.source}: Recovery in progress`
          break

        case StatusEventType.CIRCUIT_BREAKER_CLOSED:
        case StatusEventType.SYSTEM_RECOVERED:
        case StatusEventType.FALLBACK_RECOVERED:
          newState.status = 'healthy'
          newState.message = STATUS_MESSAGES.healthy
          newState.details = `${event.source}: Recovered`
          break

        case StatusEventType.FALLBACK_ACTIVATED:
          newState.status = 'degraded'
          newState.message = 'Using backup services'
          newState.details = `${event.source}: Fallback active`
          break

        default:
          // Don't change status for unknown events
          break
      }

      return newState
    })
  }, [])

  // Subscribe to status events
  useEffect(() => {
    statusNotifier.addEventListener(handleStatusEvent)
    return () => statusNotifier.removeEventListener(handleStatusEvent)
  }, [handleStatusEvent])

  // Auto-recover from degraded states after no events for a while
  useEffect(() => {
    if (state.status === 'healthy') return

    const timeout = setTimeout(() => {
      setState(prev => {
        // Only auto-recover if no recent events
        const timeSinceLastUpdate = Date.now() - prev.lastUpdate
        if (timeSinceLastUpdate > 30000) {
          // 30 seconds
          return {
            ...prev,
            status: 'healthy',
            message: STATUS_MESSAGES.healthy,
            details: 'Auto-recovered after no recent issues'
          }
        }
        return prev
      })
    }, 35000) // Check after 35 seconds

    return () => clearTimeout(timeout)
  }, [state.lastUpdate, state.status])

  const getSizeStyles = (size: 'sm' | 'md' | 'lg') => {
    switch (size) {
      case 'sm':
        return 'w-2 h-2'
      case 'lg':
        return 'w-4 h-4'
      case 'md':
      default:
        return 'w-3 h-3'
    }
  }

  const getStatusColor = (status: IndicatorState['status']) => {
    const baseClasses = 'rounded-full transition-colors duration-300'

    switch (status) {
      case 'healthy':
        return cn(baseClasses, 'bg-green-500 dark:bg-green-400')
      case 'degraded':
        return cn(baseClasses, 'bg-blue-500 dark:bg-blue-400')
      case 'warning':
        return cn(baseClasses, 'bg-yellow-500 dark:bg-yellow-400')
      case 'error':
        return cn(baseClasses, 'bg-red-500 dark:bg-red-400')
      case 'unknown':
      default:
        return cn(baseClasses, 'bg-gray-500 dark:bg-gray-400')
    }
  }

  const getPositionStyles = (position: StatusIndicatorProps['position']) => {
    switch (position) {
      case 'fixed-top-right':
        return 'fixed top-4 right-4 z-40'
      case 'fixed-bottom-right':
        return 'fixed bottom-4 right-4 z-40'
      case 'fixed-top-left':
        return 'fixed top-4 left-4 z-40'
      case 'fixed-bottom-left':
        return 'fixed bottom-4 left-4 z-40'
      case 'inline':
      default:
        return 'inline-flex'
    }
  }

  const getLabelTextSize = (size: 'sm' | 'md' | 'lg') => {
    switch (size) {
      case 'sm':
        return 'text-xs'
      case 'lg':
        return 'text-sm'
      case 'md':
      default:
        return 'text-xs'
    }
  }

  const shouldShowPulse = animated && (state.status === 'warning' || state.status === 'error')

  const tooltipContent = showTooltip ? (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 transform rounded bg-black px-2 py-1 text-xs whitespace-nowrap text-white dark:bg-white dark:text-black">
      <div className="font-medium">{state.message}</div>
      {state.details && <div className="text-xs opacity-75">{state.details}</div>}
      <div className="text-xs opacity-50">
        Updated: {new Date(state.lastUpdate).toLocaleTimeString()}
      </div>
      {/* Tooltip arrow */}
      <div className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 transform border-t-2 border-r-2 border-l-2 border-transparent border-t-black dark:border-t-white"></div>
    </div>
  ) : null

  return (
    <div
      className={cn(
        'items-center gap-2',
        getPositionStyles(position),
        position.startsWith('fixed')
          ? 'bg-background/80 rounded-full p-2 shadow-lg backdrop-blur-sm'
          : '',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Status dot with optional animation */}
      <div className="relative flex items-center">
        <div
          className={cn(
            getSizeStyles(size),
            getStatusColor(state.status),
            shouldShowPulse && 'animate-pulse'
          )}
          role="status"
          aria-label={`System status: ${state.status}`}
        />

        {/* Tooltip on hover */}
        {showTooltip && isHovered && tooltipContent}

        {/* Event count indicator for rapid changes */}
        {animated && state.eventCount > 5 && state.status !== 'healthy' && (
          <div
            className={cn(
              'absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white',
              size === 'sm'
                ? 'h-3 w-3 text-xs'
                : size === 'lg'
                  ? 'h-4 w-4 text-xs'
                  : 'h-3 w-3 text-xs'
            )}
          >
            {state.eventCount > 99 ? '!' : state.eventCount}
          </div>
        )}
      </div>

      {/* Optional label */}
      {showLabel && (
        <span className={cn('text-muted-foreground', getLabelTextSize(size))}>{state.message}</span>
      )}
    </div>
  )
}

export default StatusIndicator
