/**
 * Loading Integration Components
 *
 * Unified components that integrate all loading states for easy use in ChatPage.
 * Provides pre-configured loading states for common chat operations.
 */

import React from 'react'
import {StatusMessage, StatusMessageStack, StatusMessageProps} from './StatusMessage'
import {SkeletonGrid, SkeletonMessage} from './SkeletonScreen'
import {ErrorState, ErrorType} from './ErrorState'
import {useLoadingState, operationToStatusMessage} from './LoadingStateManager'
import {cn} from '../../utils/tailwind'

/**
 * ChatLoadingOverlay Component
 *
 * Full-screen overlay that shows all active loading operations
 */
export interface ChatLoadingOverlayProps {
  /** Show overlay */
  show: boolean
  /** Maximum number of visible status messages */
  maxVisible?: number
  /** Custom CSS class */
  className?: string
}

export const ChatLoadingOverlay: React.FC<ChatLoadingOverlayProps> = ({
  show,
  maxVisible = 3,
  className
}) => {
  const {state} = useLoadingState()

  if (!show || state.operations.length === 0) {
    return null
  }

  // Convert operations to status messages
  const statusMessages = state.operations.map(operationToStatusMessage)

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-black/20 backdrop-blur-sm',
        'flex items-center justify-center p-4',
        'transition-opacity duration-300',
        className
      )}
    >
      <div className="w-full max-w-md">
        <StatusMessageStack messages={statusMessages} maxVisible={maxVisible} showCollapse={true} />
      </div>
    </div>
  )
}

/**
 * ChatLoadingPanel Component
 *
 * Inline panel for showing loading states within the chat interface
 */
export interface ChatLoadingPanelProps {
  /** Custom CSS class */
  className?: string
  /** Maximum visible operations */
  maxVisible?: number
}

export const ChatLoadingPanel: React.FC<ChatLoadingPanelProps> = ({className, maxVisible = 2}) => {
  const {state} = useLoadingState()

  if (state.operations.length === 0) {
    return null
  }

  // Show priority operation first, then others
  const sortedOperations = [...state.operations].sort((a, b) => {
    if (state.priorityOperation?.id === a.id) return -1
    if (state.priorityOperation?.id === b.id) return 1

    const priorityWeight = {high: 3, medium: 2, low: 1}
    return priorityWeight[b.priority] - priorityWeight[a.priority]
  })

  const visibleOperations = sortedOperations.slice(0, maxVisible)
  const statusMessages = visibleOperations.map(operationToStatusMessage)

  return (
    <div className={cn('w-full', className)}>
      <StatusMessageStack
        messages={statusMessages}
        maxVisible={maxVisible}
        showCollapse={true}
        className="space-y-2"
      />
    </div>
  )
}

/**
 * SearchResultsLoading Component
 *
 * Skeleton for search results while searching
 */
export interface SearchResultsLoadingProps {
  /** Number of skeleton cards */
  count?: number
  /** Show search status */
  showStatus?: boolean
  /** Search query for status message */
  query?: string
  /** Custom CSS class */
  className?: string
}

export const SearchResultsLoading: React.FC<SearchResultsLoadingProps> = ({
  count = 3,
  showStatus = true,
  query,
  className
}) => {
  return (
    <div className={cn('w-full space-y-4', className)}>
      {showStatus && (
        <StatusMessage
          type="search"
          message={query ? `Searching for "${query}"...` : 'Searching...'}
          showTyping={true}
          compact={false}
        />
      )}
      <SkeletonGrid count={count} showHeader={false} compact={true} />
    </div>
  )
}

/**
 * ChatMessageLoading Component
 *
 * Loading state for AI response generation
 */
export interface ChatMessageLoadingProps {
  /** Current generation stage */
  stage?: 'thinking' | 'searching' | 'analyzing' | 'generating'
  /** Show avatar */
  showAvatar?: boolean
  /** Custom CSS class */
  className?: string
}

export const ChatMessageLoading: React.FC<ChatMessageLoadingProps> = ({
  stage = 'thinking',
  showAvatar = true,
  className
}) => {
  const getStatusMessage = (): StatusMessageProps => {
    switch (stage) {
      case 'searching':
        return {
          type: 'search',
          message: 'Searching for information...',
          showTyping: true,
          estimatedTime: '5-10 seconds'
        }
      case 'analyzing':
        return {
          type: 'analysis',
          message: 'Analyzing search results...',
          showProgress: true,
          progress: undefined, // Indeterminate
          estimatedTime: '3-5 seconds'
        }
      case 'generating':
        return {
          type: 'generation',
          message: 'Generating response...',
          showTyping: true,
          estimatedTime: '2-5 seconds'
        }
      default:
        return {
          type: 'default',
          message: 'AI is thinking...',
          showTyping: true
        }
    }
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="flex gap-3 p-4">
        {showAvatar && (
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-600" />
        )}
        <div className="flex-1 space-y-3">
          <StatusMessage {...getStatusMessage()} compact={true} />
          <SkeletonMessage type="ai" showAvatar={false} />
        </div>
      </div>
    </div>
  )
}

/**
 * FunctionCallLoading Component
 *
 * Loading state for function call execution
 */
export interface FunctionCallLoadingProps {
  /** Function being called */
  functionName: string
  /** Function arguments (optional, for display) */
  args?: Record<string, unknown>
  /** Show progress bar */
  showProgress?: boolean
  /** Progress value */
  progress?: number
  /** Custom CSS class */
  className?: string
}

export const FunctionCallLoading: React.FC<FunctionCallLoadingProps> = ({
  functionName,
  args,
  showProgress = false,
  progress,
  className
}) => {
  const getFunctionType = (name: string): StatusMessageProps['type'] => {
    if (name.includes('search') || name.includes('google')) return 'search'
    if (name.includes('analyze') || name.includes('process')) return 'analysis'
    if (name.includes('generate') || name.includes('create')) return 'generation'
    if (name.includes('file') || name.includes('read') || name.includes('write'))
      return 'processing'
    return 'network'
  }

  const formatFunctionName = (name: string) => {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }

  const getEstimatedTime = (name: string) => {
    if (name.includes('search')) return '3-8 seconds'
    if (name.includes('analyze')) return '5-15 seconds'
    if (name.includes('generate')) return '2-10 seconds'
    if (name.includes('file')) return '1-3 seconds'
    return '2-5 seconds'
  }

  return (
    <div className={cn('w-full', className)}>
      <StatusMessage
        type={getFunctionType(functionName)}
        message={`Calling ${formatFunctionName(functionName)}...`}
        details={args ? `Arguments: ${Object.keys(args).join(', ')}` : undefined}
        showProgress={showProgress}
        progress={progress}
        showTyping={!showProgress}
        estimatedTime={getEstimatedTime(functionName)}
        compact={false}
      />
    </div>
  )
}

/**
 * GlobalErrorDisplay Component
 *
 * Display for global errors that affect the entire chat
 */
export interface GlobalErrorDisplayProps {
  /** Error details */
  error: {
    type: ErrorType
    message: string
    details?: string
    code?: string
  } | null
  /** Retry callback */
  onRetry?: () => void
  /** Dismiss callback */
  onDismiss?: () => void
  /** Custom CSS class */
  className?: string
}

export const GlobalErrorDisplay: React.FC<GlobalErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  className
}) => {
  if (!error) return null

  return (
    <div className={cn('w-full', className)}>
      <ErrorState
        type={error.type}
        message={error.message}
        details={error.details}
        code={error.code}
        onRetry={onRetry}
        onDismiss={onDismiss}
        showRetry={!!onRetry}
        showDismiss={!!onDismiss}
      />
    </div>
  )
}

/**
 * ChatLoadingProvider Component
 *
 * Wrapper that provides all loading contexts and common loading states
 */
export interface ChatLoadingProviderProps {
  children: React.ReactNode
}

export const ChatLoadingProvider: React.FC<ChatLoadingProviderProps> = ({children}) => {
  // This component serves as a convenience wrapper
  // The actual LoadingStateProvider should be used at a higher level
  return <>{children}</>
}

/**
 * Custom hook for common chat loading patterns
 */
export const useChatLoading = () => {
  const loadingState = useLoadingState()

  const startSearch = React.useCallback(
    (query: string) => {
      return loadingState.startOperation({
        type: 'search',
        message: `Searching for "${query}"...`,
        priority: 'high',
        estimatedTime: '5-10 seconds'
      })
    },
    [loadingState]
  )

  const startAnalysis = React.useCallback(
    (content: string) => {
      return loadingState.startOperation({
        type: 'analysis',
        message: 'Analyzing content...',
        details: `Processing: ${content.slice(0, 50)}...`,
        priority: 'medium',
        estimatedTime: '3-8 seconds'
      })
    },
    [loadingState]
  )

  const startGeneration = React.useCallback(
    (prompt: string) => {
      return loadingState.startOperation({
        type: 'generation',
        message: 'Generating response...',
        details: `Prompt: ${prompt.slice(0, 50)}...`,
        priority: 'high',
        estimatedTime: '2-10 seconds'
      })
    },
    [loadingState]
  )

  const startFunctionCall = React.useCallback(
    (functionName: string, args?: Record<string, unknown>) => {
      const getFunctionType = (name: string) => {
        if (name.includes('search')) return 'search'
        if (name.includes('analyze')) return 'analysis'
        if (name.includes('generate')) return 'generation'
        if (name.includes('file')) return 'processing'
        return 'network'
      }

      return loadingState.startOperation({
        type: getFunctionType(functionName),
        message: `Calling ${functionName}...`,
        details: args ? `Args: ${Object.keys(args).join(', ')}` : undefined,
        priority: 'medium',
        metadata: {functionName, args}
      })
    },
    [loadingState]
  )

  return {
    ...loadingState,
    startSearch,
    startAnalysis,
    startGeneration,
    startFunctionCall
  }
}

export {
  // Re-export core components for convenience
  StatusMessage,
  StatusMessageStack,
  SkeletonGrid,
  SkeletonMessage,
  ErrorState
}

export default ChatLoadingPanel
