import React, {lazy, Suspense, ComponentType} from 'react'

// Loading fallback component
const ComponentLoader = ({message = 'Loading...'}: {message?: string}) => (
  <div className="flex items-center justify-center p-8">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
    <span className="ml-3 text-sm text-gray-600">{message}</span>
  </div>
)

// Generic lazy loading wrapper
export function withLazyLoading<T extends Record<string, unknown>>(
  importFn: () => Promise<{default: ComponentType<T>}>,
  loadingMessage?: string
): ComponentType<T> {
  const LazyComponent = lazy(importFn)

  return function WrappedComponent(props: T) {
    return (
      <Suspense fallback={<ComponentLoader message={loadingMessage} />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
}

// Export pre-configured lazy components for the largest components
export const LazySearchResultCard = withLazyLoading(
  () => import('../components/SearchResultCard'),
  'Loading search results...'
)

export const LazyChatPage = withLazyLoading(
  () => import('../pages/assistant/ChatPage'),
  'Loading chat interface...'
)

export const LazyUltraFastTranscriptionTestPage = withLazyLoading(
  () => import('../pages/UltraFastTranscriptionTestPage'),
  'Loading transcription test...'
)

export const LazyRealTimeAnswerDisplay = withLazyLoading(
  () => import('../components/RealTimeAnswerDisplay'),
  'Loading answer display...'
)

export const LazyTransitionSystem = withLazyLoading(
  () => import('../components/TransitionSystem'),
  'Loading transition system...'
)

export const LazyUltraFastTranscription = withLazyLoading(
  () => import('../components/UltraFastTranscription'),
  'Loading transcription...'
)

export const LazyUnifiedLiveStreamingDisplay = withLazyLoading(
  () => import('../components/UnifiedLiveStreamingDisplay'),
  'Loading streaming display...'
)

export const LazyTranscriptsPage = withLazyLoading(
  () => import('../pages/assistant/TranscriptsPage'),
  'Loading transcripts...'
)

export const LazyPerformanceTestComponent = withLazyLoading(
  () => import('../components/PerformanceTestComponent'),
  'Loading performance test...'
)

// Export individual lazy components for direct use if needed
export {
  LazySearchResultCard,
  LazyChatPage,
  LazyUltraFastTranscriptionTestPage,
  LazyRealTimeAnswerDisplay,
  LazyTransitionSystem,
  LazyUltraFastTranscription,
  LazyUnifiedLiveStreamingDisplay,
  LazyTranscriptsPage,
  LazyPerformanceTestComponent
}
