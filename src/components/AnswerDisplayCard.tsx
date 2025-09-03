/**
 * Answer Display Card Component
 *
 * A simple card component that shows the current answer display state
 * from the shared AnswerDisplayProvider context. This can be used on
 * any page to show the persistent answer state.
 */

import React from 'react'
import {cn} from '../utils/tailwind'
import {useAnswerDisplayState} from '../contexts/AnswerDisplayProvider'
import {StreamingTextRenderer} from './StreamingTextRenderer'
import {StreamingStateIndicator} from './StreamingStateIndicator'
import GlassCard from './GlassCard'

interface AnswerDisplayCardProps {
  /** Custom CSS classes */
  className?: string
  /** Enable compact mode */
  compact?: boolean
  /** Show debug information */
  showDebug?: boolean
  /** Custom theme */
  theme?: 'light' | 'dark' | 'glass'
  /** Maximum height for the answer text */
  maxHeight?: string
  /** Show only if there's an active answer */
  showOnlyWithAnswer?: boolean
}

export const AnswerDisplayCard: React.FC<AnswerDisplayCardProps> = ({
  className,
  compact = false,
  showDebug = false,
  theme = 'glass',
  maxHeight = 'max-h-64',
  showOnlyWithAnswer = false
}) => {
  const {currentDisplay, searchState, isStreaming, isInitialized, connectionStatus, error} =
    useAnswerDisplayState()

  // Don't show if not initialized or if showOnlyWithAnswer is true and no display
  if (!isInitialized || (showOnlyWithAnswer && !currentDisplay)) {
    return null
  }

  // Theme-based styling
  const themeClasses = React.useMemo(() => {
    switch (theme) {
      case 'dark':
        return 'bg-gray-900 text-white border-gray-700'
      case 'light':
        return 'bg-white text-gray-900 border-gray-300'
      case 'glass':
      default:
        return 'glass-morphism text-white border-white/20'
    }
  }, [theme])

  // Calculate progress percentage
  const progressPercentage = React.useMemo(() => {
    if (!searchState) return 0
    return Math.min(100, Math.max(0, searchState.progress))
  }, [searchState])

  // Format confidence as percentage
  const confidencePercentage = React.useMemo(() => {
    if (!currentDisplay) return 0
    return Math.round(currentDisplay.confidence)
  }, [currentDisplay?.confidence])

  return (
    <GlassCard
      className={cn(
        'answer-display-card',
        'flex flex-col',
        compact ? 'space-y-2 p-3' : 'space-y-4 p-4',
        themeClasses,
        className
      )}
    >
      {/* Header with status indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <StreamingStateIndicator
            state={
              error
                ? 'error'
                : isStreaming
                  ? 'receiving'
                  : searchState?.isSearching
                    ? 'processing'
                    : currentDisplay?.isComplete
                      ? 'complete'
                      : 'listening'
            }
            showDetails={!compact}
            size={compact ? 'small' : 'medium'}
          />
          <div className="flex-1">
            {currentDisplay && (
              <div>
                <p className="text-sm font-medium">
                  {currentDisplay.questionText.length > 60
                    ? `${currentDisplay.questionText.substring(0, 60)}...`
                    : currentDisplay.questionText}
                </p>
                {!compact && (
                  <p className="text-xs opacity-60">
                    {new Date(currentDisplay.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}
            {!currentDisplay && !error && (
              <p className="text-sm opacity-70">
                {connectionStatus === 'connected'
                  ? 'Ready for questions'
                  : `Status: ${connectionStatus}`}
              </p>
            )}
            {error && <p className="text-sm text-red-400">Error: {error}</p>}
          </div>
        </div>

        {/* Connection status badge */}
        <div
          className={cn(
            'flex items-center space-x-1 rounded-full px-2 py-1 text-xs',
            connectionStatus === 'connected'
              ? 'bg-green-500/20 text-green-400'
              : connectionStatus === 'error'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
          )}
        >
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              connectionStatus === 'connected'
                ? 'bg-green-400'
                : connectionStatus === 'error'
                  ? 'bg-red-400'
                  : 'animate-pulse bg-yellow-400'
            )}
          />
          <span className="capitalize">{connectionStatus}</span>
        </div>
      </div>

      {/* Search Progress */}
      {searchState && searchState.isSearching && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Searching...</span>
            <span className="text-xs opacity-70">{progressPercentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{width: `${progressPercentage}%`}}
            />
          </div>
          {searchState.currentSource && !compact && (
            <p className="text-xs opacity-60">Searching: {searchState.currentSource}</p>
          )}
        </div>
      )}

      {/* Answer Display */}
      {currentDisplay && currentDisplay.answerText && (
        <div className="flex-1">
          <div
            className={cn(
              'overflow-y-auto rounded-lg bg-white/5 p-3',
              maxHeight,
              compact ? 'text-sm' : 'text-base'
            )}
          >
            <StreamingTextRenderer
              text={currentDisplay.answerText}
              isPartial={currentDisplay.isPartial}
              animationSpeed={40}
              enableTypewriterEffects={true}
              showCursor={currentDisplay.isPartial}
              className="leading-relaxed"
            />

            {/* Confidence and Sources (non-compact) */}
            {!compact && (
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                {/* Confidence Badge */}
                {currentDisplay.confidence > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-70">Confidence:</span>
                    <div className="flex items-center space-x-2">
                      <div className="h-1.5 w-12 rounded-full bg-white/10">
                        <div
                          className={cn(
                            'h-1.5 rounded-full transition-all duration-300',
                            confidencePercentage >= 80
                              ? 'bg-green-500'
                              : confidencePercentage >= 60
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          )}
                          style={{width: `${confidencePercentage}%`}}
                        />
                      </div>
                      <span className="font-medium">{confidencePercentage}%</span>
                    </div>
                  </div>
                )}

                {/* Sources Count */}
                {currentDisplay.sources && currentDisplay.sources.length > 0 && (
                  <div className="flex items-center justify-between text-xs opacity-70">
                    <span>Sources:</span>
                    <span>{currentDisplay.sources.length} found</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug Information */}
      {showDebug && (
        <details className="text-xs opacity-60">
          <summary className="mb-2 cursor-pointer">Debug Info</summary>
          <div className="space-y-1 font-mono">
            <div>Initialized: {isInitialized ? 'Yes' : 'No'}</div>
            <div>Streaming: {isStreaming ? 'Yes' : 'No'}</div>
            <div>Connection: {connectionStatus}</div>
            <div>Has Display: {currentDisplay ? 'Yes' : 'No'}</div>
            {currentDisplay && (
              <>
                <div>Display ID: {currentDisplay.id}</div>
                <div>Complete: {currentDisplay.isComplete ? 'Yes' : 'No'}</div>
              </>
            )}
          </div>
        </details>
      )}

      {/* Empty State */}
      {!currentDisplay && !searchState?.isSearching && !isStreaming && !error && (
        <div className="py-6 text-center opacity-60">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-sm">No active conversation</p>
          <p className="mt-1 text-xs">Ask a question on the Chat page</p>
        </div>
      )}
    </GlassCard>
  )
}

export default AnswerDisplayCard
