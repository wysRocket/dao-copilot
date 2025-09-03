/**
 * StatusMessage Component
 *
 * Real-time status indicators for ongoing operations like "Searching Google...",
 * "Analyzing content...", etc. Shows current operation status with progress context.
 */

import React from 'react'
import {cn} from '../../utils/tailwind'
import {TypingIndicator} from './TypingIndicator'
import {ProgressBar} from './ProgressBar'

export interface StatusMessageProps {
  /** Current operation status message */
  message: string
  /** Operation type for styling */
  type?: 'search' | 'analysis' | 'generation' | 'processing' | 'network' | 'default'
  /** Show progress indicator */
  showProgress?: boolean
  /** Progress value (0-100) for determinate progress */
  progress?: number
  /** Show typing indicator */
  showTyping?: boolean
  /** Additional details or context */
  details?: string
  /** Custom icon element */
  icon?: React.ReactNode
  /** Compact mode */
  compact?: boolean
  /** Duration estimate */
  estimatedTime?: string
  /** Custom CSS class */
  className?: string
  /** Inline style for animations */
  style?: React.CSSProperties
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
  message,
  type = 'default',
  showProgress = false,
  progress,
  showTyping = false,
  details,
  icon,
  compact = false,
  estimatedTime,
  className,
  style: inlineStyle
}) => {
  // Type-based styling
  const typeStyles = {
    search: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800/50',
      text: 'text-blue-900 dark:text-blue-100',
      accent: 'text-blue-600 dark:text-blue-400'
    },
    analysis: {
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      border: 'border-purple-200 dark:border-purple-800/50',
      text: 'text-purple-900 dark:text-purple-100',
      accent: 'text-purple-600 dark:text-purple-400'
    },
    generation: {
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-200 dark:border-green-800/50',
      text: 'text-green-900 dark:text-green-100',
      accent: 'text-green-600 dark:text-green-400'
    },
    processing: {
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-200 dark:border-orange-800/50',
      text: 'text-orange-900 dark:text-orange-100',
      accent: 'text-orange-600 dark:text-orange-400'
    },
    network: {
      bg: 'bg-indigo-50 dark:bg-indigo-950/30',
      border: 'border-indigo-200 dark:border-indigo-800/50',
      text: 'text-indigo-900 dark:text-indigo-100',
      accent: 'text-indigo-600 dark:text-indigo-400'
    },
    default: {
      bg: 'bg-gray-50 dark:bg-gray-900/30',
      border: 'border-gray-200 dark:border-gray-700/50',
      text: 'text-gray-900 dark:text-gray-100',
      accent: 'text-gray-600 dark:text-gray-400'
    }
  }

  const style = typeStyles[type]

  // Default icons for each type
  const defaultIcons = {
    search: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
    analysis: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    generation: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    processing: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
    network: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    ),
    default: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    )
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border backdrop-blur-sm',
        style.bg,
        style.border,
        compact ? 'p-3' : 'p-4',
        'animate-message-appear',
        className
      )}
      role="status"
      aria-live="polite"
      style={inlineStyle}
    >
      <div className={cn('flex items-start gap-3', compact && 'gap-2')}>
        {/* Icon */}
        <div className={cn('mt-0.5 flex-shrink-0', style.accent)}>{icon || defaultIcons[type]}</div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Main message */}
          <div
            className={cn(
              'flex items-center gap-2',
              compact ? 'text-sm' : 'text-base',
              style.text,
              'font-medium'
            )}
          >
            <span>{message}</span>
            {showTyping && <TypingIndicator size="sm" speed="normal" className="ml-1" />}
          </div>

          {/* Details */}
          {details && (
            <div className={cn('mt-1', compact ? 'text-xs' : 'text-sm', style.accent)}>
              {details}
            </div>
          )}

          {/* Progress bar */}
          {showProgress && (
            <div className="mt-2">
              <ProgressBar
                progress={progress}
                size="sm"
                className="bg-white/50 dark:bg-gray-800/50"
                variant={
                  type === 'search'
                    ? 'primary'
                    : type === 'analysis'
                      ? 'primary'
                      : type === 'generation'
                        ? 'success'
                        : type === 'processing'
                          ? 'warning'
                          : type === 'network'
                            ? 'primary'
                            : 'primary'
                }
              />
            </div>
          )}

          {/* Estimated time */}
          {estimatedTime && (
            <div className={cn('mt-1 text-xs', style.accent)}>Estimated time: {estimatedTime}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * StatusMessageStack Component
 *
 * Stack multiple status messages for concurrent operations
 */
export interface StatusMessageStackProps {
  /** Array of status message props */
  messages: Omit<StatusMessageProps, 'className'>[]
  /** Custom CSS class */
  className?: string
  /** Maximum visible messages */
  maxVisible?: number
  /** Show collapse indicator when messages exceed maxVisible */
  showCollapse?: boolean
}

export const StatusMessageStack: React.FC<StatusMessageStackProps> = ({
  messages,
  className,
  maxVisible = 3,
  showCollapse = true
}) => {
  const visibleMessages = messages.slice(0, maxVisible)
  const hiddenCount = Math.max(0, messages.length - maxVisible)

  return (
    <div className={cn('space-y-2', className)}>
      {visibleMessages.map((messageProps, index) => (
        <StatusMessage
          key={index}
          {...messageProps}
          compact={messages.length > 1}
          className="animate-message-appear"
          style={{animationDelay: `${index * 0.1}s`} as React.CSSProperties}
        />
      ))}

      {hiddenCount > 0 && showCollapse && (
        <div className="text-center">
          <button className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
            +{hiddenCount} more operation{hiddenCount > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * StatusMessageProvider Component
 *
 * Context provider for managing global status messages
 */
interface StatusMessageContextValue {
  messages: StatusMessageProps[]
  addMessage: (message: Omit<StatusMessageProps, 'key'>) => string
  updateMessage: (id: string, updates: Partial<StatusMessageProps>) => void
  removeMessage: (id: string) => void
  clearMessages: () => void
}

const StatusMessageContext = React.createContext<StatusMessageContextValue | null>(null)

export const StatusMessageProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [messages, setMessages] = React.useState<(StatusMessageProps & {id: string})[]>([])

  const addMessage = React.useCallback((message: Omit<StatusMessageProps, 'key'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    setMessages(prev => [...prev, {...message, id}])
    return id
  }, [])

  const updateMessage = React.useCallback((id: string, updates: Partial<StatusMessageProps>) => {
    setMessages(prev => prev.map(msg => (msg.id === id ? {...msg, ...updates} : msg)))
  }, [])

  const removeMessage = React.useCallback((id: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== id))
  }, [])

  const clearMessages = React.useCallback(() => {
    setMessages([])
  }, [])

  const value: StatusMessageContextValue = {
    messages,
    addMessage,
    updateMessage,
    removeMessage,
    clearMessages
  }

  return <StatusMessageContext.Provider value={value}>{children}</StatusMessageContext.Provider>
}

export const useStatusMessages = () => {
  const context = React.useContext(StatusMessageContext)
  if (!context) {
    throw new Error('useStatusMessages must be used within a StatusMessageProvider')
  }
  return context
}

export default StatusMessage
