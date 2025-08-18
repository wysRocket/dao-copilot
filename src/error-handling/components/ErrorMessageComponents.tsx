import React, {useState, useEffect, useCallback, useMemo} from 'react'
import type {LocalizedErrorMessage, ErrorSeverity, SupportedLocale} from '../UserErrorMessageSystem'

/**
 * Props for individual error message component
 */
interface ErrorMessageProps {
  message: LocalizedErrorMessage
  onDismiss: (errorId: string) => void
  onActionTaken: (errorId: string, action: string) => void
  onHelpLinkClick: (errorId: string, url: string) => void
  onRating: (errorId: string, rating: number) => void
  showTechnicalDetails?: boolean
  compact?: boolean
  className?: string
}

/**
 * Individual error message component
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onDismiss,
  onActionTaken,
  onHelpLinkClick,
  onRating,
  showTechnicalDetails = false,
  compact = false,
  className = ''
}) => {
  const [showDetails, setShowDetails] = useState(false)
  const [userRating, setUserRating] = useState<number | null>(null)

  const getSeverityColor = (severity: ErrorSeverity): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-500 text-red-800'
      case 'high':
        return 'bg-orange-100 border-orange-500 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 border-yellow-500 text-yellow-800'
      case 'low':
        return 'bg-blue-100 border-blue-500 text-blue-800'
      default:
        return 'bg-gray-100 border-gray-500 text-gray-800'
    }
  }

  const getSeverityIcon = (severity: ErrorSeverity): string => {
    switch (severity) {
      case 'critical':
        return '🚨'
      case 'high':
        return '⚠️'
      case 'medium':
        return '⚡'
      case 'low':
        return 'ℹ️'
      default:
        return '❓'
    }
  }

  const handleActionClick = (action: string) => {
    onActionTaken(message.errorId, action)
  }

  const handleHelpClick = (url: string) => {
    onHelpLinkClick(message.errorId, url)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleRatingClick = (rating: number) => {
    setUserRating(rating)
    onRating(message.errorId, rating)
  }

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString()
  }

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between border-l-4 p-2 ${getSeverityColor(message.severity)} ${className}`}
      >
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getSeverityIcon(message.severity)}</span>
          <span className="text-sm font-medium">{message.message}</span>
        </div>
        <button
          onClick={() => onDismiss(message.errorId)}
          className="text-gray-400 hover:text-gray-600 focus:outline-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div
      className={`border-l-4 ${getSeverityColor(message.severity)} mb-4 rounded-r-lg p-4 shadow-md ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">{getSeverityIcon(message.severity)}</span>
          <div>
            <div className="text-lg font-semibold">{message.message}</div>
            <div className="mt-1 text-sm text-gray-600">
              {formatTimestamp(message.timestamp)}
              {message.actionRequired && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                  Action Required
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => onDismiss(message.errorId)}
          className="text-gray-400 hover:text-gray-600 focus:outline-none"
          aria-label="Dismiss error message"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Description */}
      {message.description && (
        <div className="mt-3 text-sm text-gray-700">{message.description}</div>
      )}

      {/* Technical Details (expandable) */}
      {showTechnicalDetails && message.technicalDetails && (
        <div className="mt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-600 hover:text-blue-800 focus:underline focus:outline-none"
          >
            {showDetails ? 'Hide' : 'Show'} Technical Details
          </button>
          {showDetails && (
            <div className="mt-2 rounded border bg-gray-50 p-3 font-mono text-sm text-gray-800">
              {message.technicalDetails}
            </div>
          )}
        </div>
      )}

      {/* Suggested Actions */}
      {message.suggestedActions.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-gray-900">Suggested Actions:</h4>
          <div className="space-y-2">
            {message.suggestedActions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleActionClick(action)}
                className="block w-full rounded border border-gray-300 bg-white p-2 text-left text-sm hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                • {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Help Links */}
      {message.helpLinks.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-gray-900">Help & Support:</h4>
          <div className="space-x-4">
            {message.helpLinks.map((link, index) => (
              <button
                key={index}
                onClick={() => handleHelpClick(link.url)}
                className="text-sm text-blue-600 underline hover:text-blue-800 focus:outline-none"
              >
                {link.text} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Was this message helpful?</span>
          <div className="flex space-x-1">
            {[1, 2, 3, 4, 5].map(rating => (
              <button
                key={rating}
                onClick={() => handleRatingClick(rating)}
                className={`focus:outline-none ${
                  userRating && rating <= userRating
                    ? 'text-yellow-500'
                    : 'text-gray-300 hover:text-yellow-400'
                }`}
                aria-label={`Rate ${rating} stars`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Props for error message container component
 */
interface ErrorMessageContainerProps {
  messages: LocalizedErrorMessage[]
  onDismiss: (errorId: string) => void
  onActionTaken: (errorId: string, action: string) => void
  onHelpLinkClick: (errorId: string, url: string) => void
  onRating: (errorId: string, rating: number) => void
  onClearAll: () => void
  maxMessages?: number
  showTechnicalDetails?: boolean
  compact?: boolean
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center'
  className?: string
}

/**
 * Container component for multiple error messages
 */
export const ErrorMessageContainer: React.FC<ErrorMessageContainerProps> = ({
  messages,
  onDismiss,
  onActionTaken,
  onHelpLinkClick,
  onRating,
  onClearAll,
  maxMessages = 5,
  showTechnicalDetails = false,
  compact = false,
  position = 'top-right',
  className = ''
}) => {
  const [filter, setFilter] = useState<'all' | ErrorSeverity>('all')

  const getPositionClasses = (): string => {
    switch (position) {
      case 'top-right':
        return 'fixed top-4 right-4 z-50'
      case 'top-left':
        return 'fixed top-4 left-4 z-50'
      case 'bottom-right':
        return 'fixed bottom-4 right-4 z-50'
      case 'bottom-left':
        return 'fixed bottom-4 left-4 z-50'
      case 'center':
        return 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50'
      default:
        return 'relative'
    }
  }

  const filteredMessages = useMemo(() => {
    const filtered = filter === 'all' ? messages : messages.filter(msg => msg.severity === filter)

    return filtered.slice(0, maxMessages)
  }, [messages, filter, maxMessages])

  const severityCounts = useMemo(() => {
    return messages.reduce(
      (counts, msg) => {
        counts[msg.severity] = (counts[msg.severity] || 0) + 1
        return counts
      },
      {} as Record<ErrorSeverity, number>
    )
  }, [messages])

  if (messages.length === 0) {
    return null
  }

  return (
    <div className={`${getPositionClasses()} max-h-screen w-96 overflow-y-auto ${className}`}>
      {/* Header */}
      {!compact && (
        <div className="rounded-t-lg border bg-white p-3 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              System Messages ({messages.length})
            </h3>
            <button
              onClick={onClearAll}
              className="text-sm text-red-600 hover:text-red-800 focus:outline-none"
            >
              Clear All
            </button>
          </div>

          {/* Filter buttons */}
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`rounded px-2 py-1 text-xs ${
                filter === 'all' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
              }`}
            >
              All ({messages.length})
            </button>
            {(['critical', 'high', 'medium', 'low'] as ErrorSeverity[]).map(
              severity =>
                severityCounts[severity] > 0 && (
                  <button
                    key={severity}
                    onClick={() => setFilter(severity)}
                    className={`rounded px-2 py-1 text-xs capitalize ${
                      filter === severity
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {severity} ({severityCounts[severity]})
                  </button>
                )
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        className={`space-y-2 ${compact ? '' : 'rounded-b-lg border-x border-b bg-white p-3 shadow-md'}`}
      >
        {filteredMessages.map(message => (
          <ErrorMessage
            key={message.errorId}
            message={message}
            onDismiss={onDismiss}
            onActionTaken={onActionTaken}
            onHelpLinkClick={onHelpLinkClick}
            onRating={onRating}
            showTechnicalDetails={showTechnicalDetails}
            compact={compact}
          />
        ))}
      </div>

      {/* Show more indicator */}
      {messages.length > maxMessages && (
        <div className="border-t bg-gray-50 p-2 text-center text-sm text-gray-600">
          Showing {maxMessages} of {messages.length} messages
        </div>
      )}
    </div>
  )
}

/**
 * Hook for managing error messages in React components
 */
export const useErrorMessages = () => {
  const [messages, setMessages] = useState<LocalizedErrorMessage[]>([])

  const addMessage = useCallback((message: LocalizedErrorMessage) => {
    setMessages(prev => [message, ...prev])
  }, [])

  const dismissMessage = useCallback((errorId: string) => {
    setMessages(prev => prev.filter(msg => msg.errorId !== errorId))
  }, [])

  const clearAllMessages = useCallback(() => {
    setMessages([])
  }, [])

  const getMessagesBySeverity = useCallback(
    (severity: ErrorSeverity) => {
      return messages.filter(msg => msg.severity === severity)
    },
    [messages]
  )

  const getActionRequiredMessages = useCallback(() => {
    return messages.filter(msg => msg.actionRequired)
  }, [messages])

  return {
    messages,
    addMessage,
    dismissMessage,
    clearAllMessages,
    getMessagesBySeverity,
    getActionRequiredMessages,
    hasMessages: messages.length > 0,
    messageCount: messages.length
  }
}

/**
 * Props for error toast component
 */
interface ErrorToastProps {
  message: LocalizedErrorMessage
  onDismiss: (errorId: string) => void
  onActionTaken: (errorId: string, action: string) => void
  duration?: number
  position?: 'top' | 'bottom'
}

/**
 * Toast-style error message component
 */
export const ErrorToast: React.FC<ErrorToastProps> = ({
  message,
  onDismiss,
  onActionTaken,
  duration = 5000,
  position = 'top'
}) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (!message.actionRequired && duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => onDismiss(message.errorId), 300) // Allow for fade out animation
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [message.errorRequired, message.errorId, duration, onDismiss])

  const getSeverityClasses = (severity: ErrorSeverity): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600 text-white'
      case 'high':
        return 'bg-orange-600 text-white'
      case 'medium':
        return 'bg-yellow-600 text-white'
      case 'low':
        return 'bg-blue-600 text-white'
      default:
        return 'bg-gray-600 text-white'
    }
  }

  const positionClasses = position === 'top' ? 'top-4' : 'bottom-4'

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 transform ${positionClasses} z-50 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <div
        className={`${getSeverityClasses(message.severity)} max-w-md rounded-lg px-4 py-3 shadow-lg`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2">
            <span className="text-lg">{message.severity === 'critical' ? '🚨' : '⚠️'}</span>
            <div>
              <div className="font-medium">{message.message}</div>
              {message.suggestedActions.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => onActionTaken(message.errorId, message.suggestedActions[0])}
                    className="text-sm underline hover:no-underline"
                  >
                    {message.suggestedActions[0]}
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => onDismiss(message.errorId)}
            className="ml-4 text-white hover:text-gray-200 focus:outline-none"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Props for error banner component
 */
interface ErrorBannerProps {
  message: LocalizedErrorMessage
  onDismiss: (errorId: string) => void
  onActionTaken: (errorId: string, action: string) => void
  position?: 'top' | 'bottom'
  fullWidth?: boolean
}

/**
 * Banner-style error message component
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onDismiss,
  onActionTaken,
  position = 'top',
  fullWidth = true
}) => {
  const getSeverityClasses = (severity: ErrorSeverity): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600 text-white border-red-700'
      case 'high':
        return 'bg-orange-600 text-white border-orange-700'
      case 'medium':
        return 'bg-yellow-600 text-white border-yellow-700'
      case 'low':
        return 'bg-blue-600 text-white border-blue-700'
      default:
        return 'bg-gray-600 text-white border-gray-700'
    }
  }

  const positionClasses = position === 'top' ? 'top-0' : 'bottom-0'
  const widthClasses = fullWidth ? 'left-0 right-0' : 'left-4 right-4 rounded-lg'

  return (
    <div className={`fixed ${positionClasses} ${widthClasses} z-40`}>
      <div className={`${getSeverityClasses(message.severity)} border-b-2 px-4 py-3`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xl">{message.severity === 'critical' ? '🚨' : '⚠️'}</span>
            <div>
              <div className="font-medium">{message.message}</div>
              {message.suggestedActions.length > 0 && (
                <button
                  onClick={() => onActionTaken(message.errorId, message.suggestedActions[0])}
                  className="mt-1 text-sm underline hover:no-underline"
                >
                  {message.suggestedActions[0]}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => onDismiss(message.errorId)}
            className="text-white hover:text-gray-200 focus:outline-none"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// Export all components and hooks
export {
  ErrorMessage,
  ErrorMessageContainer,
  ErrorToast,
  ErrorBanner,
  useErrorMessages,
  type ErrorMessageProps,
  type ErrorMessageContainerProps,
  type ErrorToastProps,
  type ErrorBannerProps
}
