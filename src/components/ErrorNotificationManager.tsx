import React, { useState, useCallback } from 'react'
import ErrorNotification, { ErrorNotificationData, ErrorCategory } from './ErrorNotification'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'

export interface ErrorNotificationManagerProps {
  maxErrors?: number
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  className?: string
  onManagerReady?: (addError: (category: ErrorCategory, error: Error | string, details?: string) => void) => void
}

// Predefined error templates for common WebSocket/API issues
const createErrorTemplate = (
  category: ErrorCategory,
  error: Error | string,
  details?: string
): Omit<ErrorNotificationData, 'id' | 'timestamp'> => {
  const errorMessage = typeof error === 'string' ? error : error.message
  
  switch (category) {
    case 'quota_exceeded':
      return {
        category,
        title: 'API Quota Exceeded',
        message: 'Your API usage has reached the daily limit. Consider upgrading your plan or wait for quota reset.',
        details,
        severity: 'high',
        dismissible: true,
        autoHide: false,
        actions: [
          {
            label: 'Check Quota Status',
            type: 'primary',
            action: () => console.log('Opening quota dashboard'),
            icon: '📊'
          },
          {
            label: 'Upgrade Plan',
            type: 'secondary',
            action: () => console.log('Opening upgrade page'),
            icon: '⬆️'
          }
        ]
      }

    case 'network_error':
      return {
        category,
        title: 'Network Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection.',
        details: errorMessage,
        severity: 'medium',
        dismissible: true,
        autoHide: true,
        duration: 10,
        actions: [
          {
            label: 'Retry Connection',
            type: 'primary',
            action: () => console.log('Retrying connection'),
            icon: '🔄'
          },
          {
            label: 'Check Network',
            type: 'secondary',
            action: () => console.log('Opening network diagnostics'),
            icon: '🌐'
          }
        ]
      }

    case 'authentication_failed':
      return {
        category,
        title: 'Authentication Failed',
        message: 'Your API key is invalid or has expired. Please check your credentials.',
        details: errorMessage,
        severity: 'critical',
        dismissible: true,
        autoHide: false,
        actions: [
          {
            label: 'Update API Key',
            type: 'primary',
            action: () => console.log('Opening API key settings'),
            icon: '🔑'
          },
          {
            label: 'View Documentation',
            type: 'secondary',
            action: () => console.log('Opening authentication docs'),
            icon: '📚'
          }
        ]
      }

    case 'websocket_error':
      return {
        category,
        title: 'WebSocket Connection Failed',
        message: 'Failed to establish real-time connection. The service may be temporarily unavailable.',
        details: errorMessage,
        severity: 'medium',
        dismissible: true,
        autoHide: true,
        duration: 15,
        actions: [
          {
            label: 'Reconnect',
            type: 'primary',
            action: () => console.log('Attempting reconnection'),
            icon: '🔌'
          },
          {
            label: 'Use Polling Mode',
            type: 'secondary',
            action: () => console.log('Switching to polling mode'),
            icon: '🔄'
          }
        ]
      }

    case 'rate_limited':
      return {
        category,
        title: 'Rate Limit Exceeded',
        message: 'Too many requests sent in a short time. Please wait before making more requests.',
        details,
        severity: 'medium',
        dismissible: true,
        autoHide: true,
        duration: 30,
        actions: [
          {
            label: 'Wait and Retry',
            type: 'primary',
            action: () => console.log('Waiting for rate limit reset'),
            icon: '⏱️'
          }
        ]
      }

    case 'permission_denied':
      return {
        category,
        title: 'Permission Denied',
        message: 'You do not have permission to access this feature. Contact your administrator.',
        details: errorMessage,
        severity: 'high',
        dismissible: true,
        autoHide: false,
        actions: [
          {
            label: 'Contact Support',
            type: 'primary',
            action: () => console.log('Opening support contact'),
            icon: '📞'
          }
        ]
      }

    case 'server_error':
      return {
        category,
        title: 'Server Error',
        message: 'The server encountered an error processing your request. Please try again later.',
        details: errorMessage,
        severity: 'high',
        dismissible: true,
        autoHide: true,
        duration: 20,
        actions: [
          {
            label: 'Retry Request',
            type: 'primary',
            action: () => console.log('Retrying request'),
            icon: '🔄'
          },
          {
            label: 'Report Issue',
            type: 'secondary',
            action: () => console.log('Reporting server error'),
            icon: '🐛'
          }
        ]
      }

    case 'timeout':
      return {
        category,
        title: 'Request Timeout',
        message: 'The request took too long to complete. Please try again.',
        details: errorMessage,
        severity: 'medium',
        dismissible: true,
        autoHide: true,
        duration: 10,
        actions: [
          {
            label: 'Retry',
            type: 'primary',
            action: () => console.log('Retrying timed out request'),
            icon: '🔄'
          }
        ]
      }

    default:
      return {
        category: 'unknown',
        title: 'Unknown Error',
        message: errorMessage || 'An unexpected error occurred. Please try again.',
        details,
        severity: 'medium',
        dismissible: true,
        autoHide: true,
        duration: 15,
        actions: [
          {
            label: 'Retry',
            type: 'primary',
            action: () => console.log('Retrying after unknown error'),
            icon: '🔄'
          }
        ]
      }
  }
}

const ErrorNotificationManager: React.FC<ErrorNotificationManagerProps> = ({
  maxErrors = 5,
  position = 'top-right',
  className = '',
  onManagerReady
}) => {
  const [errors, setErrors] = useState<ErrorNotificationData[]>([])
  const { state } = useTranscriptionStateContext()

  // Generate unique error ID
  const generateErrorId = useCallback(() => {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  // Add new error notification
  const addError = useCallback((
    category: ErrorCategory,
    error: Error | string,
    details?: string
  ) => {
    const template = createErrorTemplate(category, error, details)
    const newError: ErrorNotificationData = {
      ...template,
      id: generateErrorId(),
      timestamp: new Date()
    }

    setErrors(prev => {
      const updated = [newError, ...prev]
      return updated.slice(0, maxErrors) // Keep only max errors
    })
  }, [generateErrorId, maxErrors])

  // Expose addError function to parent
  React.useEffect(() => {
    onManagerReady?.(addError)
  }, [addError, onManagerReady])

  // Remove error notification
  const removeError = useCallback((errorId: string) => {
    setErrors(prev => prev.filter(error => error.id !== errorId))
  }, [])

  // Handle error actions
  const handleErrorAction = useCallback((errorId: string, actionIndex: number) => {
    const error = errors.find(e => e.id === errorId)
    if (error && error.actions?.[actionIndex]) {
      error.actions[actionIndex].action()
    }
  }, [errors])

  // Listen for connection errors and auto-create notifications
  React.useEffect(() => {
    if (state.connection?.error) {
      // Determine error category based on error type
      let category: ErrorCategory = 'unknown'
      const errorMsg = state.connection.error.toLowerCase()

      if (errorMsg.includes('quota') || errorMsg.includes('limit exceeded')) {
        category = 'quota_exceeded'
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        category = 'network_error'
      } else if (errorMsg.includes('auth') || errorMsg.includes('unauthorized')) {
        category = 'authentication_failed'
      } else if (errorMsg.includes('websocket') || errorMsg.includes('ws')) {
        category = 'websocket_error'
      } else if (errorMsg.includes('rate limit')) {
        category = 'rate_limited'
      } else if (errorMsg.includes('permission') || errorMsg.includes('forbidden')) {
        category = 'permission_denied'
      } else if (errorMsg.includes('server') || errorMsg.includes('internal')) {
        category = 'server_error'
      } else if (errorMsg.includes('timeout')) {
        category = 'timeout'
      }

      addError(category, state.connection.error)
    }
  }, [state.connection?.error, addError])

  // Position classes
  const positionClasses = {
    'top-right': 'fixed top-4 right-4 z-50',
    'top-left': 'fixed top-4 left-4 z-50',
    'bottom-right': 'fixed bottom-4 right-4 z-50',
    'bottom-left': 'fixed bottom-4 left-4 z-50'
  }

  return (
    <div className={`${positionClasses[position]} ${className}`}>
      <div className="flex flex-col gap-2 max-w-md">
        {errors.map(error => (
          <ErrorNotification
            key={error.id}
            error={error}
            onDismiss={removeError}
            onAction={handleErrorAction}
          />
        ))}
      </div>
    </div>
  )
}

// Hook for easy error notification usage
export const useErrorNotifications = () => {
  const managerRef = React.useRef<{
    addError: (category: ErrorCategory, error: Error | string, details?: string) => void
  } | null>(null)

  const addError = useCallback((
    category: ErrorCategory,
    error: Error | string,
    details?: string
  ) => {
    managerRef.current?.addError(category, error, details)
  }, [])

  return { addError, managerRef }
}

export default ErrorNotificationManager
