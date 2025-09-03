/**
 * Real-time Answer Display Component
 * 
 * A React component that integrates with the AnswerDisplayManager and WebSocket
 * infrastructure to provide real-time AI answer streaming and search state updates.
 * 
 * Features:
 * - Real-time answer streaming with typewriter effects
 * - Search progress indicators
 * - Source display and credibility scores
 * - Confidence indicators
 * - Responsive design with accessibility support
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { cn } from '../utils/tailwind'
import { AnswerDisplayManager, AnswerDisplay, SearchState, AnswerDisplayConfig } from '../services/AnswerDisplayManager'
import { AnswerStreamingManager } from '../services/AnswerStreamingManager'
import { UltraFastWebSocketManager } from '../services/UltraFastWebSocketManager'
import { StreamingTextRenderer } from './StreamingTextRenderer'
import { StreamingStateIndicator } from './StreamingStateIndicator'
import { WebSocketConnectionStatus } from './WebSocketConnectionStatus'
import GlassCard from './GlassCard'
import { GlassButton } from './GlassButton'

// Styles
import '../styles/answer-display.css'

export interface RealTimeAnswerDisplayProps {
  /** Whether to show the component */
  show: boolean
  /** Question to answer */
  question?: string
  /** Configuration for the answer display */
  config?: Partial<AnswerDisplayConfig>
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
  /** Initial question ID if continuing existing session */
  initialQuestionId?: string
}

interface ComponentState {
  displayManager: AnswerDisplayManager | null
  currentDisplay: AnswerDisplay | null
  searchState: SearchState | null
  isInitialized: boolean
  isStreaming: boolean
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'
  error: string | null
  lastUpdateTime: number
}

/**
 * Hook for managing the Answer Display system
 */
const useAnswerDisplay = (config: Partial<AnswerDisplayConfig> = {}) => {
  const [state, setState] = useState<ComponentState>({
    displayManager: null,
    currentDisplay: null,
    searchState: null,
    isInitialized: false,
    isStreaming: false,
    connectionStatus: 'disconnected',
    error: null,
    lastUpdateTime: Date.now()
  })

  const answerStreamingManagerRef = useRef<AnswerStreamingManager | null>(null)
  const webSocketManagerRef = useRef<UltraFastWebSocketManager | null>(null)

  const initializeManagers = useCallback(async () => {
    try {
      // Initialize WebSocket manager if not exists
      if (!webSocketManagerRef.current) {
        webSocketManagerRef.current = new UltraFastWebSocketManager({
          maxConnections: 3,
          heartbeatInterval: 30000
        })
      }

      // Initialize Answer streaming manager if not exists
      if (!answerStreamingManagerRef.current) {
        answerStreamingManagerRef.current = new AnswerStreamingManager(
          webSocketManagerRef.current,
          {
            streamingMode: 'character',
            maxConcurrentStreams: 2
          }
        )
      }

      // Initialize display manager
      const displayManager = new AnswerDisplayManager(
        answerStreamingManagerRef.current,
        webSocketManagerRef.current,
        {
          enableTypewriterEffect: true,
          typewriterSpeed: 30,
          showSearchProgress: true,
          showConfidence: true,
          showSources: true,
          updateThrottleMs: 100,
          enableDebugLogging: config.enableDebugLogging || false,
          ...config
        }
      )

      setState(prev => ({
        ...prev,
        displayManager,
        isInitialized: true,
        connectionStatus: 'connected'
      }))

      return displayManager
    } catch (error) {
      console.error('Failed to initialize answer display managers:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Initialization failed',
        connectionStatus: 'error'
      }))
      return null
    }
  }, [config])

  const cleanup = useCallback(() => {
    if (state.displayManager) {
      state.displayManager.destroy()
    }
    if (answerStreamingManagerRef.current) {
      answerStreamingManagerRef.current.destroy()
      answerStreamingManagerRef.current = null
    }
    if (webSocketManagerRef.current) {
      // WebSocket manager cleanup - check if disconnect method exists
      const wsManager = webSocketManagerRef.current as unknown as { disconnect?: () => void }
      if (wsManager.disconnect) {
        wsManager.disconnect()
      }
      webSocketManagerRef.current = null
    }
    setState(prev => ({
      ...prev,
      displayManager: null,
      isInitialized: false,
      connectionStatus: 'disconnected'
    }))
  }, [state.displayManager])

  useEffect(() => {
    initializeManagers()
    return cleanup
  }, [])

  return { 
    state, 
    setState, 
    initializeManagers, 
    cleanup, 
    performanceMonitor, 
    webSocketOptimized 
  }
}

/**
 * Real-time Answer Display Component
 */
export const RealTimeAnswerDisplay: React.FC<RealTimeAnswerDisplayProps> = ({
  show,
  question,
  config = {},
  className,
  onAnswerComplete,
  onSearchStateChange,
  onDisplayCleared,
  compact = false,
  showDebug = false,
  showControls = false,
  theme = 'glass',
  initialQuestionId
}) => {
  const { state, setState } = useAnswerDisplay(config)
  const [localState, setLocalState] = useState({
    isVisible: show,
    animationSpeed: 30,
    showSources: true,
    showConfidence: true,
    autoScroll: true
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const answerTextRef = useRef<HTMLDivElement>(null)

  // Setup event listeners for display manager
  useEffect(() => {
    if (!state.displayManager) return

    const displayManager = state.displayManager

    const handleDisplayStarted = (display: AnswerDisplay) => {
      setLocalState(prev => ({ ...prev, isVisible: true }))
      setState(prev => ({
        ...prev,
        currentDisplay: display,
        lastUpdateTime: Date.now()
      }))
    }

    const handlePartialAnswerUpdated = (display: AnswerDisplay) => {
      setState(prev => ({
        ...prev,
        currentDisplay: display,
        isStreaming: true,
        lastUpdateTime: Date.now()
      }))
    }

    const handleSearchStateUpdated = (searchState: SearchState) => {
      setState(prev => ({
        ...prev,
        searchState,
        lastUpdateTime: Date.now()
      }))
      onSearchStateChange?.(searchState)
    }

    const handleAnswerCompleted = (display: AnswerDisplay) => {
      setState(prev => ({
        ...prev,
        currentDisplay: display,
        isStreaming: false,
        lastUpdateTime: Date.now()
      }))
      onAnswerComplete?.(display)
    }

    const handleDisplayCleared = () => {
      setState(prev => ({
        ...prev,
        currentDisplay: null,
        searchState: null,
        isStreaming: false,
        lastUpdateTime: Date.now()
      }))
      onDisplayCleared?.()
    }

    const handleStreamingStarted = () => {
      setState(prev => ({
        ...prev,
        isStreaming: true
      }))
    }

    const handleStreamingCompleted = () => {
      setState(prev => ({
        ...prev,
        isStreaming: false
      }))
    }

    // Register event listeners
    displayManager.on('display-started', handleDisplayStarted)
    displayManager.on('partial-answer-updated', handlePartialAnswerUpdated)
    displayManager.on('search-state-updated', handleSearchStateUpdated)
    displayManager.on('answer-completed', handleAnswerCompleted)
    displayManager.on('display-cleared', handleDisplayCleared)
    displayManager.on('streaming-started', handleStreamingStarted)
    displayManager.on('streaming-completed', handleStreamingCompleted)

    return () => {
      displayManager.off('display-started', handleDisplayStarted)
      displayManager.off('partial-answer-updated', handlePartialAnswerUpdated)
      displayManager.off('search-state-updated', handleSearchStateUpdated)
      displayManager.off('answer-completed', handleAnswerCompleted)
      displayManager.off('display-cleared', handleDisplayCleared)
      displayManager.off('streaming-started', handleStreamingStarted)
      displayManager.off('streaming-completed', handleStreamingCompleted)
    }
  }, [state.displayManager, onAnswerComplete, onSearchStateChange, onDisplayCleared])

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (localState.autoScroll && answerTextRef.current) {
      answerTextRef.current.scrollTop = answerTextRef.current.scrollHeight
    }
  }, [state.currentDisplay?.answerText, localState.autoScroll])

  // Start answer display when question changes
  useEffect(() => {
    if (question && state.displayManager && state.isInitialized) {
      const questionId = initialQuestionId || `q-${Date.now()}`
      state.displayManager.startAnswerDisplay(questionId, question)
    }
  }, [question, state.displayManager, state.isInitialized, initialQuestionId])

  // Handle component visibility
  useEffect(() => {
    setLocalState(prev => ({ ...prev, isVisible: show }))
  }, [show])

  // Handle clear display
  const handleClearDisplay = useCallback(() => {
    if (state.displayManager) {
      state.displayManager.clearCurrentDisplay()
    }
  }, [state.displayManager])

  // Handle restart display
  const handleRestartDisplay = useCallback(() => {
    if (question && state.displayManager) {
      state.displayManager.clearCurrentDisplay()
      setTimeout(() => {
        const questionId = `q-${Date.now()}`
        state.displayManager!.startAnswerDisplay(questionId, question)
      }, 100)
    }
  }, [question, state.displayManager])

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!state.searchState) return 0
    return Math.min(100, Math.max(0, state.searchState.progress))
  }, [state.searchState])

  // Format confidence as percentage
  const confidencePercentage = useMemo(() => {
    if (!state.currentDisplay) return 0
    return Math.round(state.currentDisplay.confidence)
  }, [state.currentDisplay?.confidence])

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

  if (!localState.isVisible) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'real-time-answer-display',
        'flex flex-col',
        compact ? 'space-y-2' : 'space-y-4',
        themeClasses,
        'rounded-lg border p-4',
        'transition-all duration-300',
        className
      )}
      role="region"
      aria-label="Real-time AI Answer Display"
      data-testid="answer-display"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <StreamingStateIndicator
            state={
              state.isStreaming 
                ? 'receiving' 
                : state.searchState?.isSearching 
                  ? 'processing' 
                  : state.currentDisplay?.isComplete 
                    ? 'complete' 
                    : 'listening'
            }
            showDetails={!compact}
            size={compact ? 'small' : 'medium'}
          />
          {state.currentDisplay && (
            <span className="text-sm opacity-70">
              {state.currentDisplay.questionText.length > 50 
                ? `${state.currentDisplay.questionText.substring(0, 50)}...`
                : state.currentDisplay.questionText
              }
            </span>
          )}
        </div>
        
        {showControls && (
          <div className="flex items-center space-x-2">
            <GlassButton
              onClick={handleClearDisplay}
              className="text-xs"
              disabled={!state.currentDisplay}
            >
              Clear
            </GlassButton>
            <GlassButton
              onClick={handleRestartDisplay}
              className="text-xs"
              disabled={!question}
            >
              Restart
            </GlassButton>
          </div>
        )}
      </div>

      {/* Search Progress */}
      {state.searchState && state.searchState.isSearching && (
        <GlassCard className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Searching...</span>
            <span className="text-xs opacity-70">
              {progressPercentage}%
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
              role="progressbar"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          {state.searchState.currentSource && (
            <p className="text-xs opacity-60 mt-1">
              Searching: {state.searchState.currentSource}
            </p>
          )}
          <p className="text-xs opacity-60">
            Found {state.searchState.sourcesFound} of {state.searchState.totalSources} sources
          </p>
        </GlassCard>
      )}

      {/* Answer Display */}
      {state.currentDisplay && state.currentDisplay.answerText && (
        <GlassCard className="flex-1">
          <div
            ref={answerTextRef}
            className={cn(
              'answer-text-container',
              'overflow-y-auto',
              compact ? 'max-h-40' : 'max-h-96',
              'p-4 space-y-2'
            )}
          >
            <StreamingTextRenderer
              text={state.currentDisplay.answerText}
              isPartial={state.currentDisplay.isPartial}
              animationSpeed={localState.animationSpeed}
              enableTypewriterEffects={config.enableTypewriterEffect !== false}
              showCursor={state.currentDisplay.isPartial}
              className="text-base leading-relaxed"
              onAnimationComplete={() => {
                if (showDebug) {
                  console.log('Answer animation completed')
                }
              }}
            />

            {/* Confidence Badge */}
            {localState.showConfidence && state.currentDisplay.confidence > 0 && (
              <div className="flex items-center space-x-2 mt-3">
                <span className="text-xs opacity-70">Confidence:</span>
                <div className="flex items-center space-x-1">
                  <div className="w-16 bg-white/10 rounded-full h-2">
                    <div
                      className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        confidencePercentage >= 80 
                          ? 'bg-green-500' 
                          : confidencePercentage >= 60 
                            ? 'bg-yellow-500' 
                            : 'bg-red-500'
                      )}
                      style={{ width: `${confidencePercentage}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">
                    {confidencePercentage}%
                  </span>
                </div>
              </div>
            )}

            {/* Sources */}
            {localState.showSources && state.currentDisplay.sources && state.currentDisplay.sources.length > 0 && (
              <div className="sources-section mt-4 pt-3 border-t border-white/10">
                <h4 className="text-sm font-medium mb-2 opacity-80">Sources:</h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {state.currentDisplay.sources.slice(0, 3).map((source, index) => (
                    <div
                      key={`${source.url}-${index}`}
                      className="flex items-start space-x-2 text-xs"
                    >
                      <span className="opacity-60 flex-shrink-0">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline block truncate"
                          title={source.title}
                        >
                          {source.title}
                        </a>
                        {source.snippet && (
                          <p className="opacity-60 mt-1 line-clamp-2">
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
                  {state.currentDisplay.sources.length > 3 && (
                    <p className="text-xs opacity-50 text-center pt-2">
                      +{state.currentDisplay.sources.length - 3} more sources
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Debug Information */}
      {showDebug && state.displayManager && (
        <GlassCard className="p-3">
          <details className="text-xs">
            <summary className="cursor-pointer opacity-70 mb-2">
              Debug Information
            </summary>
            <div className="space-y-1 font-mono opacity-60">
              <div>Initialized: {state.isInitialized ? 'Yes' : 'No'}</div>
              <div>Streaming: {state.isStreaming ? 'Yes' : 'No'}</div>
              <div>Connection: {state.connectionStatus}</div>
              <div>Last Update: {new Date(state.lastUpdateTime).toLocaleTimeString()}</div>
              {state.currentDisplay && (
                <div>Display ID: {state.currentDisplay.id}</div>
              )}
              {state.error && (
                <div className="text-red-400">Error: {state.error}</div>
              )}
            </div>
          </details>
        </GlassCard>
      )}

      {/* Connection Status */}
      {state.connectionStatus !== 'connected' && (
        <div className="text-center py-2">
          <WebSocketConnectionStatus
            showMetrics={showDebug}
            compact={true}
            className="justify-center"
          />
        </div>
      )}
    </div>
  )
}

export default RealTimeAnswerDisplay