/**
 * Loading Components Index
 *
 * Centralized exports for all loading-related components and utilities.
 */

// Core Components
export {
  TypingIndicator,
  TypingDots,
  type TypingIndicatorProps,
  type TypingDotsProps
} from './TypingIndicator'

export {
  ProgressBar,
  LinearProgress,
  CircularProgress,
  type ProgressBarProps,
  type LinearProgressProps,
  type CircularProgressProps
} from './ProgressBar'

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonGrid,
  SkeletonMessage,
  type SkeletonProps,
  type SkeletonTextProps,
  type SkeletonCardProps,
  type SkeletonGridProps,
  type SkeletonMessageProps
} from './SkeletonScreen'

export {
  StatusMessage,
  StatusMessageStack,
  StatusMessageProvider,
  useStatusMessages,
  type StatusMessageProps,
  type StatusMessageStackProps
} from './StatusMessage'

export {
  LoadingStateProvider,
  useLoadingState,
  useLoadingOperation,
  operationToStatusMessage,
  type LoadingOperation,
  type LoadingOperationType,
  type LoadingState
} from './LoadingStateManager'

export {
  ErrorState,
  ErrorBoundary,
  useErrorHandler,
  type ErrorType,
  type ErrorStateProps,
  type ErrorBoundaryProps
} from './ErrorState'

// Integration Components
export {
  ChatLoadingOverlay,
  ChatLoadingPanel,
  SearchResultsLoading,
  ChatMessageLoading,
  FunctionCallLoading,
  GlobalErrorDisplay,
  ChatLoadingProvider,
  useChatLoading,
  type ChatLoadingOverlayProps,
  type ChatLoadingPanelProps,
  type SearchResultsLoadingProps,
  type ChatMessageLoadingProps,
  type FunctionCallLoadingProps,
  type GlobalErrorDisplayProps,
  type ChatLoadingProviderProps
} from './ChatLoadingIntegration'

// Re-export default components for convenience
export {default as TypingIndicatorDefault} from './TypingIndicator'
export {default as ProgressBarDefault} from './ProgressBar'
export {default as SkeletonDefault} from './SkeletonScreen'
export {default as StatusMessageDefault} from './StatusMessage'
export {default as LoadingStateManagerDefault} from './LoadingStateManager'
export {default as ErrorStateDefault} from './ErrorState'
export {default as ChatLoadingIntegrationDefault} from './ChatLoadingIntegration'
