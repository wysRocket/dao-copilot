/**
 * Connection Status Banner Component
 *
 * Displays connection state banners for degraded modes and service issues.
 * Integrates with the existing StatusNotifier system to provide user feedback
 * for WebSocket failures, transport fallbacks, and service degradation.
 */

import React, {useEffect, useState, useCallback} from 'react'
import {cn} from '@/utils/tailwind'
import {statusNotifier, StatusEvent, StatusEventType, NotificationType} from './StatusNotifier'

export interface ConnectionStatusBannerProps {
  className?: string
  position?: 'top' | 'bottom'
  persistent?: boolean
  showCloseButton?: boolean
  autoHideDelayMs?: number
  onClose?: () => void
}

export interface ConnectionStatusState {
  isVisible: boolean
  type: NotificationType
  title: string
  message: string
  details?: string
  actions?: BannerAction[]
  canDismiss: boolean
  timestamp: number
}

export interface BannerAction {
  label: string
  action: () => void
  style: 'primary' | 'secondary' | 'danger'
  loading?: boolean
}

const DEFAULT_MESSAGES = {
  [StatusEventType.CIRCUIT_BREAKER_OPENED]: {
    title: 'Service Temporarily Unavailable',
    message: 'Experiencing connection issues. Switching to backup mode.',
    type: NotificationType.ERROR
  },
  [StatusEventType.CIRCUIT_BREAKER_HALF_OPEN]: {
    title: 'Testing Service Recovery',
    message: 'Attempting to restore primary connection...',
    type: NotificationType.WARNING
  },
  [StatusEventType.CIRCUIT_BREAKER_CLOSED]: {
    title: 'Service Restored',
    message: 'Primary connection is now operating normally.',
    type: NotificationType.SUCCESS
  },
  [StatusEventType.SYSTEM_DEGRADED]: {
    title: 'System Performance Degraded',
    message: 'Some services are experiencing issues. Functionality may be limited.',
    type: NotificationType.WARNING
  },
  [StatusEventType.SYSTEM_RECOVERED]: {
    title: 'All Systems Operational',
    message: 'Full functionality has been restored.',
    type: NotificationType.SUCCESS
  },
  [StatusEventType.FALLBACK_ACTIVATED]: {
    title: 'Backup Mode Active',
    message: 'Using alternative connection method for continued service.',
    type: NotificationType.INFO
  },
  [StatusEventType.FALLBACK_RECOVERED]: {
    title: 'Primary Service Restored',
    message: 'Switched back to primary connection method.',
    type: NotificationType.SUCCESS
  },
  [StatusEventType.CONNECTION_QUALITY_CHANGED]: {
    title: 'Connection Quality Changed',
    message: 'Network conditions have changed.',
    type: NotificationType.INFO
  }
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({
  className,
  position = 'top',
  persistent = false,
  showCloseButton = true,
  autoHideDelayMs = 5000,
  onClose
}) => {
  const [status, setStatus] = useState<ConnectionStatusState>({
    isVisible: false,
    type: NotificationType.INFO,
    title: '',
    message: '',
    canDismiss: true,
    timestamp: Date.now()
  })

  const [isManuallyHidden, setIsManuallyHidden] = useState(false)
  const [retryLoading, setRetryLoading] = useState(false)

  // Handle status events from the StatusNotifier
  const handleStatusEvent = useCallback(
    (event: StatusEvent) => {
      const messageConfig = DEFAULT_MESSAGES[event.type]
      if (!messageConfig) return

      // Don't show if manually hidden recently (within 30 seconds)
      if (isManuallyHidden && Date.now() - status.timestamp < 30000) {
        return
      }

      const newStatus: ConnectionStatusState = {
        isVisible: true,
        type: messageConfig.type,
        title: messageConfig.title,
        message: messageConfig.message,
        canDismiss: !persistent,
        timestamp: event.timestamp,
        details: event.data ? JSON.stringify(event.data, null, 2) : undefined
      }

      // Add contextual actions based on event type
      switch (event.type) {
        case StatusEventType.CIRCUIT_BREAKER_OPENED:
          newStatus.actions = [
            {
              label: 'Retry Now',
              action: () => handleRetry(event.source),
              style: 'primary',
              loading: retryLoading
            },
            {
              label: 'View Details',
              action: () => showDetails(event),
              style: 'secondary'
            }
          ]
          break

        case StatusEventType.SYSTEM_DEGRADED:
          newStatus.actions = [
            {
              label: 'Check Status',
              action: () => showSystemStatus(),
              style: 'secondary'
            }
          ]
          break

        case StatusEventType.FALLBACK_ACTIVATED:
          if (event.data && typeof event.data === 'object' && 'fallbackService' in event.data) {
            newStatus.message = `Switched to ${event.data.fallbackService} for continued service.`
          }
          break
      }

      setStatus(newStatus)
      setIsManuallyHidden(false)

      // Auto-hide for success/info messages if not persistent
      if (
        !persistent &&
        (messageConfig.type === NotificationType.SUCCESS ||
          messageConfig.type === NotificationType.INFO)
      ) {
        setTimeout(() => {
          setStatus(prev => ({...prev, isVisible: false}))
        }, autoHideDelayMs)
      }
    },
    [persistent, autoHideDelayMs, isManuallyHidden, status.timestamp, retryLoading]
  )

  // Handle retry action
  const handleRetry = useCallback(async (serviceName: string) => {
    setRetryLoading(true)

    // Emit a manual retry event
    statusNotifier.emitEvent(StatusEventType.CIRCUIT_BREAKER_HALF_OPEN, serviceName, {manual: true})

    // Simulate retry delay
    setTimeout(() => {
      setRetryLoading(false)
    }, 2000)
  }, [])

  // Show details in console (could be enhanced to show modal)
  const showDetails = useCallback((event: StatusEvent) => {
    console.group('Connection Status Details')
    console.log('Event Type:', event.type)
    console.log('Source:', event.source)
    console.log('Timestamp:', new Date(event.timestamp).toLocaleString())
    console.log('Data:', event.data)
    console.groupEnd()
  }, [])

  // Show system status (placeholder - could integrate with monitoring dashboard)
  const showSystemStatus = useCallback(() => {
    console.log('System status check requested')
    // This could open a system status modal or redirect to a status page
  }, [])

  // Handle close action
  const handleClose = useCallback(() => {
    setStatus(prev => ({...prev, isVisible: false}))
    setIsManuallyHidden(true)
    onClose?.()
  }, [onClose])

  // Subscribe to status events
  useEffect(() => {
    statusNotifier.addEventListener(handleStatusEvent)
    return () => statusNotifier.removeEventListener(handleStatusEvent)
  }, [handleStatusEvent])

  if (!status.isVisible) {
    return null
  }

  const getTypeStyles = (type: NotificationType): string => {
    const baseStyles = 'border-l-4'

    switch (type) {
      case NotificationType.ERROR:
        return cn(
          baseStyles,
          'bg-red-50 dark:bg-red-950/50 border-l-red-500 text-red-900 dark:text-red-100'
        )
      case NotificationType.WARNING:
        return cn(
          baseStyles,
          'bg-yellow-50 dark:bg-yellow-950/50 border-l-yellow-500 text-yellow-900 dark:text-yellow-100'
        )
      case NotificationType.SUCCESS:
        return cn(
          baseStyles,
          'bg-green-50 dark:bg-green-950/50 border-l-green-500 text-green-900 dark:text-green-100'
        )
      case NotificationType.INFO:
      default:
        return cn(
          baseStyles,
          'bg-blue-50 dark:bg-blue-950/50 border-l-blue-500 text-blue-900 dark:text-blue-100'
        )
    }
  }

  const getTypeIcon = (type: NotificationType): string => {
    switch (type) {
      case NotificationType.ERROR:
        return '⚠️'
      case NotificationType.WARNING:
        return '⚡'
      case NotificationType.SUCCESS:
        return '✅'
      case NotificationType.INFO:
      default:
        return 'ℹ️'
    }
  }

  const positionStyles = position === 'top' ? 'top-0 left-0 right-0' : 'bottom-0 left-0 right-0'

  return (
    <div
      className={cn(
        'animate-in slide-in-from-top-2 fixed z-50 duration-300',
        positionStyles,
        className
      )}
    >
      <div
        className={cn(
          'mx-4 my-2 rounded-lg shadow-lg backdrop-blur-sm',
          'border-border/50 border',
          getTypeStyles(status.type)
        )}
      >
        <div className="flex items-start gap-3 p-4">
          {/* Icon */}
          <div className="flex-shrink-0 pt-0.5">
            <span className="text-lg" role="img" aria-label={status.type}>
              {getTypeIcon(status.type)}
            </span>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm leading-5 font-medium">{status.title}</h3>
            <p className="mt-1 text-sm opacity-90">{status.message}</p>

            {/* Actions */}
            {status.actions && status.actions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {status.actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.action}
                    disabled={action.loading}
                    className={cn(
                      'inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium',
                      'transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none',
                      action.loading && 'cursor-not-allowed opacity-75',
                      action.style === 'primary' &&
                        'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
                      action.style === 'secondary' &&
                        'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-secondary',
                      action.style === 'danger' &&
                        'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive'
                    )}
                  >
                    {action.loading && (
                      <svg
                        className="mr-1.5 -ml-0.5 h-3 w-3 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    )}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Close Button */}
          {showCloseButton && status.canDismiss && (
            <button
              onClick={handleClose}
              className={cn(
                'flex-shrink-0 rounded-md p-1 transition-colors',
                'hover:bg-black/5 dark:hover:bg-white/5',
                'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none'
              )}
              aria-label="Dismiss notification"
            >
              <svg
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConnectionStatusBanner
