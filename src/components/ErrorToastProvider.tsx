import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import ErrorNotificationManager from './ErrorNotificationManager'
import type { ErrorCategory } from './ErrorNotification'

interface ErrorToastContextType {
  showError: (category: ErrorCategory, error: Error | string, details?: string) => void
  showQuickError: (message: string, category?: ErrorCategory) => void
  showNetworkError: (error: Error | string) => void
  showAuthError: (error: Error | string) => void
  showQuotaError: (error: Error | string) => void
  showWebSocketError: (error: Error | string) => void
}

const ErrorToastContext = createContext<ErrorToastContextType | null>(null)

interface ErrorToastProviderProps {
  children: ReactNode
  maxErrors?: number
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

export const ErrorToastProvider: React.FC<ErrorToastProviderProps> = ({
  children,
  maxErrors = 5,
  position = 'top-right'
}) => {
  const [addErrorFunction, setAddErrorFunction] = useState<((category: ErrorCategory, error: Error | string, details?: string) => void) | null>(null)

  const showError = useCallback((
    category: ErrorCategory,
    error: Error | string,
    details?: string
  ) => {
    addErrorFunction?.(category, error, details)
  }, [addErrorFunction])

  const showQuickError = useCallback((
    message: string,
    category: ErrorCategory = 'unknown'
  ) => {
    addErrorFunction?.(category, message)
  }, [addErrorFunction])

  const showNetworkError = useCallback((error: Error | string) => {
    addErrorFunction?.('network_error', error)
  }, [addErrorFunction])

  const showAuthError = useCallback((error: Error | string) => {
    addErrorFunction?.('authentication_failed', error)
  }, [addErrorFunction])

  const showQuotaError = useCallback((error: Error | string) => {
    addErrorFunction?.('quota_exceeded', error)
  }, [addErrorFunction])

  const showWebSocketError = useCallback((error: Error | string) => {
    addErrorFunction?.('websocket_error', error)
  }, [addErrorFunction])

  const contextValue: ErrorToastContextType = {
    showError,
    showQuickError,
    showNetworkError,
    showAuthError,
    showQuotaError,
    showWebSocketError
  }

  return (
    <ErrorToastContext.Provider value={contextValue}>
      {children}
      <ErrorNotificationManager
        maxErrors={maxErrors}
        position={position}
        onManagerReady={setAddErrorFunction}
      />
    </ErrorToastContext.Provider>
  )
}

export const useErrorToast = (): ErrorToastContextType => {
  const context = useContext(ErrorToastContext)
  if (!context) {
    throw new Error('useErrorToast must be used within an ErrorToastProvider')
  }
  return context
}

// Convenience hooks for specific error types
export const useNetworkErrorToast = () => {
  const { showNetworkError } = useErrorToast()
  return showNetworkError
}

export const useAuthErrorToast = () => {
  const { showAuthError } = useErrorToast()
  return showAuthError
}

export const useQuotaErrorToast = () => {
  const { showQuotaError } = useErrorToast()
  return showQuotaError
}

export const useWebSocketErrorToast = () => {
  const { showWebSocketError } = useErrorToast()
  return showWebSocketError
}

export default ErrorToastProvider
