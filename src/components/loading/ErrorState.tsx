/**
 * ErrorState Component
 *
 * Visual indicators for failed operations with retry mechanisms,
 * error categorization, and user-friendly error messages.
 */

import React from 'react'
import {cn} from '../../utils/tailwind'

export type ErrorType =
  | 'network'
  | 'timeout'
  | 'server'
  | 'validation'
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'unknown'

export interface ErrorStateProps {
  /** Error type for categorization */
  type: ErrorType
  /** Primary error message */
  message: string
  /** Technical error details (optional) */
  details?: string
  /** Stack trace or error code (optional) */
  code?: string
  /** Retry callback function */
  onRetry?: () => void | Promise<void>
  /** Dismiss callback function */
  onDismiss?: () => void
  /** Show retry button */
  showRetry?: boolean
  /** Show dismiss button */
  showDismiss?: boolean
  /** Custom retry button text */
  retryText?: string
  /** Compact mode */
  compact?: boolean
  /** Custom CSS class */
  className?: string
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  type,
  message,
  details,
  code,
  onRetry,
  onDismiss,
  showRetry = true,
  showDismiss = false,
  retryText = 'Try Again',
  compact = false,
  className
}) => {
  const [isRetrying, setIsRetrying] = React.useState(false)

  // Error type configurations
  const errorConfig = {
    network: {
      title: 'Connection Error',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.22v6m0 7.56v6M2.22 12h6m7.56 0h6"
          />
        </svg>
      ),
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-200 dark:border-orange-800/50',
      buttonColor: 'bg-orange-600 hover:bg-orange-700 text-white'
    },
    timeout: {
      title: 'Request Timeout',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      border: 'border-yellow-200 dark:border-yellow-800/50',
      buttonColor: 'bg-yellow-600 hover:bg-yellow-700 text-white'
    },
    server: {
      title: 'Server Error',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
          />
        </svg>
      ),
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800/50',
      buttonColor: 'bg-red-600 hover:bg-red-700 text-white'
    },
    validation: {
      title: 'Validation Error',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      ),
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800/50',
      buttonColor: 'bg-amber-600 hover:bg-amber-700 text-white'
    },
    auth: {
      title: 'Authentication Error',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      ),
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      border: 'border-purple-200 dark:border-purple-800/50',
      buttonColor: 'bg-purple-600 hover:bg-purple-700 text-white'
    },
    rate_limit: {
      title: 'Rate Limited',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/30',
      border: 'border-indigo-200 dark:border-indigo-800/50',
      buttonColor: 'bg-indigo-600 hover:bg-indigo-700 text-white'
    },
    not_found: {
      title: 'Not Found',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      ),
      color: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-50 dark:bg-gray-950/30',
      border: 'border-gray-200 dark:border-gray-800/50',
      buttonColor: 'bg-gray-600 hover:bg-gray-700 text-white'
    },
    unknown: {
      title: 'Unknown Error',
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      color: 'text-slate-600 dark:text-slate-400',
      bg: 'bg-slate-50 dark:bg-slate-950/30',
      border: 'border-slate-200 dark:border-slate-800/50',
      buttonColor: 'bg-slate-600 hover:bg-slate-700 text-white'
    }
  }

  const config = errorConfig[type]

  const handleRetry = async () => {
    if (!onRetry || isRetrying) return

    setIsRetrying(true)
    try {
      await onRetry()
    } catch (error) {
      console.error('Retry failed:', error)
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border backdrop-blur-sm',
        config.bg,
        config.border,
        compact ? 'p-3' : 'p-4',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('mt-0.5 flex-shrink-0', config.color)}>{config.icon}</div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Title and message */}
          <div className="mb-1">
            <h4 className={cn('font-medium', compact ? 'text-sm' : 'text-base', config.color)}>
              {config.title}
            </h4>
            <p
              className={cn(
                'mt-1',
                compact ? 'text-xs' : 'text-sm',
                'text-gray-900 dark:text-gray-100'
              )}
            >
              {message}
            </p>
          </div>

          {/* Details */}
          {details && (
            <div
              className={cn(
                'mt-2 rounded p-2',
                'bg-white/50 dark:bg-black/20',
                'border border-gray-200 dark:border-gray-700'
              )}
            >
              <p
                className={cn(
                  compact ? 'text-xs' : 'text-sm',
                  'text-gray-700 dark:text-gray-300',
                  'font-mono'
                )}
              >
                {details}
              </p>
            </div>
          )}

          {/* Error code */}
          {code && (
            <div className="mt-2">
              <span
                className={cn(
                  'inline-block rounded px-2 py-1 font-mono text-xs',
                  'bg-gray-100 dark:bg-gray-800',
                  'text-gray-600 dark:text-gray-400'
                )}
              >
                Error: {code}
              </span>
            </div>
          )}

          {/* Actions */}
          {(showRetry || showDismiss) && (
            <div className="mt-3 flex items-center gap-2">
              {showRetry && onRetry && (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium',
                    'transition-colors duration-200',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    config.buttonColor
                  )}
                >
                  {isRetrying ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Retrying...
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      {retryText}
                    </>
                  )}
                </button>
              )}

              {showDismiss && onDismiss && (
                <button
                  onClick={onDismiss}
                  className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors duration-200 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ErrorBoundary Component
 *
 * React error boundary for catching and displaying unexpected errors
 */
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Custom fallback component */
  fallback?: React.ComponentType<{error: Error; retry: () => void}>
  /** Error callback */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {hasError: false}
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {hasError: true, error}
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  retry = () => {
    this.setState({hasError: false, error: undefined})
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return <FallbackComponent error={this.state.error} retry={this.retry} />
      }

      return (
        <ErrorState
          type="unknown"
          message="Something went wrong"
          details={this.state.error.message}
          code={this.state.error.name}
          onRetry={this.retry}
          showRetry={true}
        />
      )
    }

    return this.props.children
  }
}

/**
 * useErrorHandler Hook
 *
 * Hook for consistent error handling across components
 */
export const useErrorHandler = () => {
  const [error, setError] = React.useState<{
    type: ErrorType
    message: string
    details?: string
    code?: string
  } | null>(null)

  const handleError = React.useCallback(
    (error: Error | string, type: ErrorType = 'unknown', details?: string) => {
      if (typeof error === 'string') {
        setError({type, message: error, details})
      } else {
        setError({
          type,
          message: error.message || 'An unexpected error occurred',
          details: details || error.stack,
          code: error.name
        })
      }
    },
    []
  )

  const clearError = React.useCallback(() => {
    setError(null)
  }, [])

  return {
    error,
    handleError,
    clearError,
    hasError: error !== null
  }
}

export default ErrorState
