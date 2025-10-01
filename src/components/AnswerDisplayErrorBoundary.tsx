/**
 * Answer Display Error Boundary
 * 
 * React error boundary specifically designed for the real-time answer display system.
 * Provides graceful error handling with recovery options and error reporting.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { cn } from '../utils/tailwind'
import GlassCard from './GlassCard'
import { GlassButton } from './GlassButton'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  errorId?: string
  retryCount: number
  lastErrorTime?: number
}

interface AnswerDisplayErrorBoundaryProps {
  children: ReactNode
  /** Callback when an error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void
  /** Callback when recovery is attempted */
  onRetry?: (retryCount: number) => void
  /** Maximum number of retry attempts */
  maxRetries?: number
  /** Time window for retry rate limiting (ms) */
  retryTimeWindow?: number
  /** Custom error message */
  fallbackMessage?: string
  /** Whether to show technical error details */
  showErrorDetails?: boolean
  /** Custom CSS classes */
  className?: string
}

class AnswerDisplayErrorBoundary extends Component<
  AnswerDisplayErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryTimeoutId: NodeJS.Timeout | null = null

  constructor(props: AnswerDisplayErrorBoundaryProps) {
    super(props)
    
    this.state = {
      hasError: false,
      retryCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate unique error ID for tracking
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return {
      hasError: true,
      error,
      errorId,
      lastErrorTime: Date.now()
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props
    const { errorId } = this.state

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 Answer Display Error')
      console.error('Error:', error)
      console.error('Error Info:', errorInfo)
      console.error('Component Stack:', errorInfo.componentStack)
      console.groupEnd()
    }

    // Update state with error information
    this.setState({
      error,
      errorInfo
    })

    // Call error callback if provided
    if (onError && errorId) {
      onError(error, errorInfo, errorId)
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId)
    }
  }

  handleRetry = () => {
    const { maxRetries = 3, retryTimeWindow = 60000, onRetry } = this.props
    const { retryCount, lastErrorTime } = this.state
    const now = Date.now()

    // Check if we're within retry limits
    if (retryCount >= maxRetries) {
      return
    }

    // Check if we're within the time window
    if (lastErrorTime && now - lastErrorTime < retryTimeWindow) {
      // Add progressive delay for retries
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
      
      this.retryTimeoutId = setTimeout(() => {
        this.setState(prevState => ({
          hasError: false,
          error: undefined,
          errorInfo: undefined,
          errorId: undefined,
          retryCount: prevState.retryCount + 1
        }))
        
        if (onRetry) {
          onRetry(retryCount + 1)
        }
      }, delay)
    } else {
      // Reset retry count if enough time has passed
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        errorId: undefined,
        retryCount: 0
      })
      
      if (onRetry) {
        onRetry(1)
      }
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  renderErrorMessage() {
    const { error } = this.state
    const { fallbackMessage } = this.props

    if (fallbackMessage) {
      return fallbackMessage
    }

    if (error?.name === 'ChunkLoadError' || error?.message?.includes('Loading chunk')) {
      return 'A new version of the application is available. Please refresh the page.'
    }

    if (error?.name === 'NetworkError' || error?.message?.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection and try again.'
    }

    if (error?.name === 'WebSocketError' || error?.message?.includes('WebSocket')) {
      return 'Real-time connection failed. Attempting to reconnect...'
    }

    return 'Something went wrong while displaying the answer. You can try again or refresh the page.'
  }

  render() {
    const { 
      children, 
      maxRetries = 3, 
      showErrorDetails = false,
      className 
    } = this.props
    
    const { 
      hasError, 
      error, 
      errorInfo, 
      errorId, 
      retryCount 
    } = this.state

    if (!hasError) {
      return children
    }

    const canRetry = retryCount < maxRetries
    const errorMessage = this.renderErrorMessage()

    return (
      <div className={cn('w-full', className)}>
        <GlassCard className="p-6 border border-red-200 bg-red-50 bg-opacity-20">
          <div className="flex items-start space-x-3">
            {/* Error Icon */}
            <div className="flex-shrink-0">
              <svg 
                className="w-6 h-6 text-red-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" 
                />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              {/* Error Title */}
              <h3 className="text-sm font-medium text-red-800 mb-2">
                Answer Display Error
              </h3>

              {/* Error Message */}
              <p className="text-sm text-red-700 mb-4">
                {errorMessage}
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {canRetry && (
                  <GlassButton
                    onClick={this.handleRetry}
                    size="sm"
                    variant="primary"
                    className="text-xs"
                  >
                    Try Again {retryCount > 0 && `(${retryCount}/${maxRetries})`}
                  </GlassButton>
                )}
                
                <GlassButton
                  onClick={this.handleReload}
                  size="sm"
                  variant="secondary"
                  className="text-xs"
                >
                  Refresh Page
                </GlassButton>
              </div>

              {/* Error Details (Development/Debug) */}
              {showErrorDetails && error && (
                <details className="mt-4 text-xs">
                  <summary className="cursor-pointer text-red-600 hover:text-red-800 font-medium">
                    Technical Details
                  </summary>
                  <div className="mt-2 p-2 bg-red-100 bg-opacity-50 rounded border">
                    <div className="mb-2">
                      <span className="font-medium">Error ID:</span> {errorId}
                    </div>
                    <div className="mb-2">
                      <span className="font-medium">Error Type:</span> {error.name}
                    </div>
                    <div className="mb-2">
                      <span className="font-medium">Message:</span> {error.message}
                    </div>
                    {errorInfo?.componentStack && (
                      <div>
                        <span className="font-medium">Component Stack:</span>
                        <pre className="mt-1 text-xs whitespace-pre-wrap">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }
}

export default AnswerDisplayErrorBoundary

// Higher-order component for easy wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<AnswerDisplayErrorBoundaryProps, 'children'>
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <AnswerDisplayErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </AnswerDisplayErrorBoundary>
    )
  }
}