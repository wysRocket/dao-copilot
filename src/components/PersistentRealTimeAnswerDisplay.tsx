/**
 * Persistent Real-time Answer Display Component
 *
 * This component uses the shared AnswerDisplayProvider context to maintain
 * answer display state across page navigation in the assistant window.
 *
 * Features:
 * - Persistent state across page navigation
 * - Shared display manager instance
 * - Real-time answer streaming with typewriter effects
 * - Search progress indicators
 * - Source display and credibility scores
 * - Confidence indicators
 */

import React, {useEffect, useState, useRef, useCallback, useMemo} from 'react'
import {cn} from '../utils/tailwind'
import {useAnswerDisplay} from '../contexts/AnswerDisplayProvider'
import {AnswerDisplay, SearchState} from '../services/AnswerDisplayManager'
import {StreamingTextRenderer} from './StreamingTextRenderer'
import {StreamingStateIndicator} from './StreamingStateIndicator'
import {WebSocketConnectionStatus} from './WebSocketConnectionStatus'
import GlassCard from './GlassCard'
import {GlassButton} from './GlassButton'

// Styles
import '../styles/answer-display.css'

export interface PersistentRealTimeAnswerDisplayProps {
  /** Whether to show the component */
  show: boolean
  /** Question to answer - will only trigger new display if different from current */
  question?: string
  /** Custom CSS classes */
  className?: string
  /** Callback when answer is completed */
  onAnswerComplete?: (answer: AnswerDisplay) => void
  /** Callback when search state changes */
  onSearchStateChange?: (state: SearchState) => void
  /** Callback when display is cleared */
  onDisplayCleared?: () => void
  /** Enable compact mode */
  compact?: boolean
  /** Show debug information */
  showDebug?: boolean
  /** Enable controls (clear, restart, etc.) */
  showControls?: boolean
  /** Custom theme */
  theme?: 'light' | 'dark' | 'glass'
  /** Force start new display even if question is the same */
  forceNew?: boolean
}

/**
 * Persistent Real-time Answer Display Component
 */
export const PersistentRealTimeAnswerDisplay: React.FC<PersistentRealTimeAnswerDisplayProps> = ({
  show,
  question,
  className,
  onAnswerComplete,
  onSearchStateChange,
  onDisplayCleared,
  compact = false,
  showDebug = false,
  showControls = false,
  theme = 'glass',
  forceNew = false
}) => {
  // Use shared context
  const {
    currentDisplay,
    searchState,
    isStreaming,
    isInitialized,
    connectionStatus,
    error,
    startAnswerDisplay,
    clearCurrentDisplay
  } = useAnswerDisplay()

  const [localState, setLocalState] = useState({
    isVisible: show,
    animationSpeed: 30,
    showSources: true,
    showConfidence: true,
    autoScroll: true,
    lastQuestionStarted: ''
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const answerTextRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (localState.autoScroll && answerTextRef.current) {
      answerTextRef.current.scrollTop = answerTextRef.current.scrollHeight
    }
  }, [currentDisplay?.answerText, localState.autoScroll])

  // Start answer display when question changes
  useEffect(() => {
    if (
      question &&
      isInitialized &&
      (forceNew || question !== localState.lastQuestionStarted) &&
      (forceNew || !currentDisplay || currentDisplay.questionText !== question)
    ) {
      const questionId = `q-${Date.now()}`

      // Start new answer display
      startAnswerDisplay(questionId, question)
        .then(() => {
          setLocalState(prev => ({
            ...prev,
            lastQuestionStarted: question
          }))
        })
        .catch(error => {
          console.error('Failed to start answer display:', error)
        })
    }
  }, [
    question,
    isInitialized,
    forceNew,
    currentDisplay?.questionText,
    localState.lastQuestionStarted,
    startAnswerDisplay
  ])

  // Handle component visibility
  useEffect(() => {
    setLocalState(prev => ({...prev, isVisible: show}))
  }, [show])

  // Notify parent components of state changes
  useEffect(() => {
    if (currentDisplay && onAnswerComplete && currentDisplay.isComplete) {
      onAnswerComplete(currentDisplay)
    }
  }, [currentDisplay, onAnswerComplete])

  useEffect(() => {
    if (searchState && onSearchStateChange) {
      onSearchStateChange(searchState)
    }
  }, [searchState, onSearchStateChange])

  // Handle clear display
  const handleClearDisplay = useCallback(() => {
    clearCurrentDisplay()
    onDisplayCleared?.()
    setLocalState(prev => ({...prev, lastQuestionStarted: ''}))
  }, [clearCurrentDisplay, onDisplayCleared])

  // Handle restart display
  const handleRestartDisplay = useCallback(() => {
    if (question) {
      clearCurrentDisplay()
      setTimeout(() => {
        const questionId = `q-${Date.now()}`
        startAnswerDisplay(questionId, question).then(() => {
          setLocalState(prev => ({
            ...prev,
            lastQuestionStarted: question
          }))
        })
      }, 100)
    }
  }, [question, clearCurrentDisplay, startAnswerDisplay])

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!searchState) return 0
    return Math.min(100, Math.max(0, searchState.progress))
  }, [searchState])

  // Format confidence as percentage
  const confidencePercentage = useMemo(() => {
    if (!currentDisplay) return 0
    return Math.round(currentDisplay.confidence)
  }, [currentDisplay?.confidence])

  // Theme-based styling
  const themeClasses = useMemo(() => {
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

  // Don't render if not visible or not initialized
  if (!localState.isVisible) {
    return null
  }

  // Show initialization or error state
  if (!isInitialized) {
    return (
      <div
        className={cn(
          'real-time-answer-display-loading',
          'flex flex-col items-center justify-center p-8',
          themeClasses,
          'rounded-lg border',
          className
        )}
      >
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-400"></div>
        <p className="text-sm opacity-70">Initializing Answer Display...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn(
          'real-time-answer-display-error',
          'flex flex-col items-center justify-center p-8',
          'border-red-500/30 bg-red-900/20 text-red-300',
          'rounded-lg border',
          className
        )}
      >
        <p className="mb-2 text-sm font-medium">Failed to initialize Answer Display</p>
        <p className="text-xs opacity-70">{error}</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'persistent-real-time-answer-display',
        'flex flex-col',
        compact ? 'space-y-2' : 'space-y-4',
        themeClasses,
        'rounded-lg border p-4',
        'transition-all duration-300',
        className
      )}
      role="region"
      aria-label="Persistent Real-time AI Answer Display"
      data-testid="persistent-answer-display"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <StreamingStateIndicator
            state={
              isStreaming
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
          {currentDisplay && (
            <span className="text-sm opacity-70">
              {currentDisplay.questionText.length > 50
                ? `${currentDisplay.questionText.substring(0, 50)}...`
                : currentDisplay.questionText}
            </span>
          )}
        </div>

        {showControls && (
          <div className="flex items-center space-x-2">
            <GlassButton
              onClick={handleClearDisplay}
              className="text-xs"
              disabled={!currentDisplay}
            >
              Clear
            </GlassButton>
            <GlassButton onClick={handleRestartDisplay} className="text-xs" disabled={!question}>
              Restart
            </GlassButton>
          </div>
        )}
      </div>

      {/* Search Progress */}
      {searchState && searchState.isSearching && (
        <GlassCard className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Searching...</span>
            <span className="text-xs opacity-70">{progressPercentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{width: `${progressPercentage}%`}}
              role="progressbar"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          {searchState.currentSource && (
            <p className="mt-1 text-xs opacity-60">Searching: {searchState.currentSource}</p>
          )}
          <p className="text-xs opacity-60">
            Found {searchState.sourcesFound} of {searchState.totalSources} sources
          </p>
        </GlassCard>
      )}

      {/* Answer Display */}
      {currentDisplay && currentDisplay.answerText && (
        <GlassCard className="flex-1">
          <div
            ref={answerTextRef}
            className={cn(
              'answer-text-container',
              'overflow-y-auto',
              compact ? 'max-h-40' : 'max-h-96',
              'space-y-2 p-4'
            )}
          >
            <StreamingTextRenderer
              text={currentDisplay.answerText}
              isPartial={currentDisplay.isPartial}
              animationSpeed={localState.animationSpeed}
              enableTypewriterEffects={true}
              showCursor={currentDisplay.isPartial}
              className="text-base leading-relaxed"
              onAnimationComplete={() => {
                if (showDebug) {
                  console.log('Answer animation completed')
                }
              }}
            />

            {/* Confidence Badge */}
            {localState.showConfidence && currentDisplay.confidence > 0 && (
              <div className="mt-3 flex items-center space-x-2">
                <span className="text-xs opacity-70">Confidence:</span>
                <div className="flex items-center space-x-1">
                  <div className="h-2 w-16 rounded-full bg-white/10">
                    <div
                      className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        confidencePercentage >= 80
                          ? 'bg-green-500'
                          : confidencePercentage >= 60
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      )}
                      style={{width: `${confidencePercentage}%`}}
                    />
                  </div>
                  <span className="text-xs font-medium">{confidencePercentage}%</span>
                </div>
              </div>
            )}

            {/* Sources */}
            {localState.showSources &&
              currentDisplay.sources &&
              currentDisplay.sources.length > 0 && (
                <div className="sources-section mt-4 border-t border-white/10 pt-3">
                  <h4 className="mb-2 text-sm font-medium opacity-80">Sources:</h4>
                  <div className="max-h-32 space-y-2 overflow-y-auto">
                    {currentDisplay.sources.slice(0, 3).map((source, index) => (
                      <div
                        key={`${source.url}-${index}`}
                        className="flex items-start space-x-2 text-xs"
                      >
                        <span className="flex-shrink-0 opacity-60">{index + 1}.</span>
                        <div className="flex-1">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-blue-400 underline hover:text-blue-300"
                            title={source.title}
                          >
                            {source.title}
                          </a>
                          {source.snippet && (
                            <p className="mt-1 line-clamp-2 opacity-60">
                              {source.snippet.substring(0, 120)}...
                            </p>
                          )}
                        </div>
                        {source.credibilityScore && (
                          <span className="flex-shrink-0 text-xs opacity-60">
                            {Math.round(source.credibilityScore * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                    {currentDisplay.sources.length > 3 && (
                      <p className="pt-2 text-center text-xs opacity-50">
                        +{currentDisplay.sources.length - 3} more sources
                      </p>
                    )}
                  </div>
                </div>
              )}
          </div>
        </GlassCard>
      )}

      {/* Debug Information */}
      {showDebug && (
        <GlassCard className="p-3">
          <details className="text-xs">
            <summary className="mb-2 cursor-pointer opacity-70">
              Debug Information (Persistent)
            </summary>
            <div className="space-y-1 font-mono opacity-60">
              <div>Initialized: {isInitialized ? 'Yes' : 'No'}</div>
              <div>Streaming: {isStreaming ? 'Yes' : 'No'}</div>
              <div>Connection: {connectionStatus}</div>
              <div>Has Display: {currentDisplay ? 'Yes' : 'No'}</div>
              <div>Last Question: {localState.lastQuestionStarted || 'None'}</div>
              {currentDisplay && (
                <>
                  <div>Display ID: {currentDisplay.id}</div>
                  <div>Question ID: {currentDisplay.questionId}</div>
                  <div>Is Complete: {currentDisplay.isComplete ? 'Yes' : 'No'}</div>
                </>
              )}
              {error && <div className="text-red-400">Error: {error}</div>}
            </div>
          </details>
        </GlassCard>
      )}

      {/* Connection Status */}
      {connectionStatus !== 'connected' && (
        <div className="py-2 text-center">
          <WebSocketConnectionStatus
            showMetrics={showDebug}
            compact={true}
            className="justify-center"
          />
        </div>
      )}

      {/* Empty State */}
      {!currentDisplay && !searchState?.isSearching && !isStreaming && (
        <div className="py-8 text-center">
          <div className="opacity-60">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-sm">Ready to answer your questions</p>
            <p className="mt-1 text-xs">State persists across page navigation</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default PersistentRealTimeAnswerDisplay
