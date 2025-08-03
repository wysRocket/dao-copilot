import React, { useState, useEffect } from 'react'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

// Error types for categorization
export type ErrorCategory = 
  | 'quota_exceeded'
  | 'network_error'
  | 'authentication_failed'
  | 'websocket_error'
  | 'api_error'
  | 'permission_denied'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'unknown'

// Error notification data structure
export interface ErrorNotificationData {
  id: string
  category: ErrorCategory
  title: string
  message: string
  details?: string
  timestamp: Date
  dismissible: boolean
  actions?: ErrorAction[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  autoHide?: boolean
  duration?: number
}

// Action buttons for errors
export interface ErrorAction {
  label: string
  type: 'primary' | 'secondary' | 'warning' | 'destructive'
  action: () => void
  icon?: string
}

export interface ErrorNotificationProps {
  error: ErrorNotificationData
  onDismiss?: (errorId: string) => void
  onAction?: (errorId: string, actionIndex: number) => void
  className?: string
}

// Get appropriate icon for error category
const getErrorIcon = (category: ErrorCategory): string => {
  const icons = {
    quota_exceeded: '📊',
    network_error: '🌐',
    authentication_failed: '🔐',
    websocket_error: '🔌',
    api_error: '⚠️',
    permission_denied: '🚫',
    rate_limited: '⏱️',
    server_error: '🖥️',
    timeout: '⏰',
    unknown: '❓'
  }
  return icons[category] || '❓'
}

// Get severity color classes
const getSeverityColors = (severity: ErrorNotificationData['severity']) => {
  const colors = {
    low: 'border-blue-400/30 bg-blue-900/20 text-blue-100',
    medium: 'border-yellow-400/30 bg-yellow-900/20 text-yellow-100',
    high: 'border-orange-400/30 bg-orange-900/20 text-orange-100',
    critical: 'border-red-400/30 bg-red-900/20 text-red-100'
  }
  return colors[severity]
}

// Error notification component
const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  error,
  onDismiss,
  onAction,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(true)
  const [timeLeft, setTimeLeft] = useState(error.duration || 0)

  // Auto-hide timer
  useEffect(() => {
    if (error.autoHide && error.duration) {
      const interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsVisible(false)
            setTimeout(() => onDismiss?.(error.id), 300)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [error.autoHide, error.duration, error.id, onDismiss])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => onDismiss?.(error.id), 300)
  }

  const handleAction = (actionIndex: number) => {
    onAction?.(error.id, actionIndex)
  }

  const formatTimeLeft = (seconds: number): string => {
    if (seconds <= 0) return ''
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
  }

  if (!isVisible) return null

  return (
    <div className={`transform transition-all duration-300 ${
      isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    } ${className}`}>
      <GlassCard className={`p-4 ${getSeverityColors(error.severity)} border-l-4`}>
        <div className="flex items-start gap-3">
          {/* Error Icon */}
          <div className="text-2xl flex-shrink-0 mt-1">
            {getErrorIcon(error.category)}
          </div>

          {/* Error Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-semibold text-sm mb-1">
                  {error.title}
                </h4>
                <p className="text-sm opacity-90 leading-relaxed">
                  {error.message}
                </p>
              </div>

              {/* Auto-hide timer */}
              {error.autoHide && timeLeft > 0 && (
                <div className="text-xs opacity-70 flex-shrink-0">
                  {formatTimeLeft(timeLeft)}
                </div>
              )}
            </div>

            {/* Error Details */}
            {error.details && (
              <details className="mt-2">
                <summary className="text-xs opacity-70 cursor-pointer hover:opacity-90 transition-opacity">
                  Technical Details
                </summary>
                <div className="mt-1 p-2 bg-black/20 rounded text-xs font-mono opacity-80">
                  {error.details}
                </div>
              </details>
            )}

            {/* Actions */}
            {error.actions && error.actions.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {error.actions.map((action, index) => {
                  const buttonTypes = {
                    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
                    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
                    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
                    destructive: 'bg-red-600 hover:bg-red-700 text-white'
                  }

                  return (
                    <GlassButton
                      key={index}
                      onClick={() => handleAction(index)}
                      className={`text-xs px-3 py-1 ${buttonTypes[action.type]}`}
                    >
                      {action.icon && <span className="mr-1">{action.icon}</span>}
                      {action.label}
                    </GlassButton>
                  )
                })}
              </div>
            )}
          </div>

          {/* Dismiss Button */}
          {error.dismissible && (
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center text-sm opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          )}
        </div>

        {/* Timestamp */}
        <div className="mt-2 text-xs opacity-50">
          {error.timestamp.toLocaleTimeString()}
        </div>
      </GlassCard>
    </div>
  )
}

export default ErrorNotification
