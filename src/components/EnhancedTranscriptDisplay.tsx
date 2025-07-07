/**
 * Enhanced Transcript Display Component with Real-Time WebSocket Support
 *
 * Displays transcription results from both batch and real-time WebSocket sources,
 * with optimized performance for real-time updates and comprehensive state management.
 */

import React, {useEffect, useRef, useState, useCallback, useMemo} from 'react'
import {TranscriptionResult as BaseTranscriptionResult} from '../services/audio-recording'
import {
  TranscriptionPipeline,
  PipelineEvent,
  PipelineState
} from '../services/transcription-pipeline'
import {TranscriptionMode} from '../services/gemini-live-integration'
import GlassBox from './GlassBox'
import VirtualizedTranscript from './VirtualizedTranscript'
import {cn} from '../utils/tailwind'

// Extended interface to handle both source types
interface ExtendedTranscriptionResult extends BaseTranscriptionResult {
  source?: string
  duration?: number
}

// Type alias for consistency
type TranscriptionResult = ExtendedTranscriptionResult

interface EnhancedTranscriptDisplayProps {
  // Pipeline Integration
  pipeline?: TranscriptionPipeline

  // Legacy Support
  transcripts?: TranscriptionResult[]
  isProcessing?: boolean

  // Display Configuration
  autoScroll?: boolean
  showScrollToBottom?: boolean
  maxVisibleMessages?: number

  // Real-Time Configuration
  enableRealTimeUpdates?: boolean
  debounceInterval?: number
  showConnectionStatus?: boolean
  showModeToggle?: boolean

  // Performance Configuration
  enableVirtualization?: boolean

  // Event Handlers
  onModeChange?: (mode: TranscriptionMode) => void
  onTranscriptionReceived?: (result: TranscriptionResult) => void
  onError?: (error: Error) => void
}

/**
 * Custom hook for managing transcription pipeline state
 */
function useTranscriptionPipeline(pipeline?: TranscriptionPipeline) {
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!pipeline) return

    const handleStateChange = (state: PipelineState) => {
      setPipelineState(state)
      setIsLoading(state.isProcessing)
      setError(state.lastError || null)
    }

    const handleTranscriptionReceived = (result: TranscriptionResult) => {
      setTranscripts(prev => {
        const updated = [...prev, result]
        // Limit history to prevent memory issues
        return updated.length > 1000 ? updated.slice(-500) : updated
      })
    }

    const handleError = (err: Error) => {
      setError(err)
    }

    // Set up event listeners
    pipeline.on(PipelineEvent.STATE_CHANGED, handleStateChange)
    pipeline.on(PipelineEvent.TRANSCRIPTION_RECEIVED, handleTranscriptionReceived)
    pipeline.on(PipelineEvent.ERROR, handleError)

    // Initialize with current state
    setPipelineState(pipeline.getState())
    setTranscripts(pipeline.getTranscripts())

    return () => {
      pipeline.off(PipelineEvent.STATE_CHANGED, handleStateChange)
      pipeline.off(PipelineEvent.TRANSCRIPTION_RECEIVED, handleTranscriptionReceived)
      pipeline.off(PipelineEvent.ERROR, handleError)
    }
  }, [pipeline])

  return {
    pipelineState,
    transcripts,
    isLoading,
    error,
    pipeline
  }
}

/**
 * Custom hook for scroll management with real-time updates
 */
function useSmartScrolling(
  autoScroll: boolean,
  transcripts: TranscriptionResult[],
  showScrollToBottom: boolean
) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const lastScrollTop = useRef(0)

  // Handle scroll detection
  const handleScroll = useCallback(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    const {scrollTop, scrollHeight, clientHeight} = scrollElement
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

    // Detect if user manually scrolled
    if (Math.abs(scrollTop - lastScrollTop.current) > 10) {
      setUserHasScrolled(!isNearBottom)
    }
    lastScrollTop.current = scrollTop

    setShowScrollButton(!isNearBottom && transcripts.length > 0)
  }, [transcripts.length])

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && !userHasScrolled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcripts.length, autoScroll, userHasScrolled])

  // Set up scroll listener
  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement || !showScrollToBottom) return

    scrollElement.addEventListener('scroll', handleScroll)
    handleScroll() // Initial check

    return () => scrollElement.removeEventListener('scroll', handleScroll)
  }, [handleScroll, showScrollToBottom])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
      setUserHasScrolled(false)
    }
  }, [])

  return {
    scrollRef,
    showScrollButton,
    scrollToBottom
  }
}

/**
 * Debounced transcript updates for performance optimization
 */
function useDebouncedTranscripts(
  transcripts: TranscriptionResult[],
  debounceInterval: number,
  enabled: boolean
) {
  const [debouncedTranscripts, setDebouncedTranscripts] = useState(transcripts)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled) {
      setDebouncedTranscripts(transcripts)
      return
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedTranscripts(transcripts)
    }, debounceInterval)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [transcripts, debounceInterval, enabled])

  return debouncedTranscripts
}

const EnhancedTranscriptDisplay: React.FC<EnhancedTranscriptDisplayProps> = ({
  pipeline,
  transcripts: legacyTranscripts = [],
  isProcessing = false,
  autoScroll = true,
  showScrollToBottom = true,
  maxVisibleMessages = 100,
  enableRealTimeUpdates = true,
  debounceInterval = 150,
  showConnectionStatus = true,
  showModeToggle = true,
  enableVirtualization = true,
  onModeChange,
  onTranscriptionReceived,
  onError
}) => {
  // Pipeline state management
  const {
    pipelineState,
    transcripts: pipelineTranscripts,
    isLoading: pipelineLoading,
    error: pipelineError
  } = useTranscriptionPipeline(pipeline)

  // Determine data source (pipeline vs legacy)
  const allTranscripts = useMemo(() => {
    return pipeline ? pipelineTranscripts : legacyTranscripts
  }, [pipeline, pipelineTranscripts, legacyTranscripts])

  const isCurrentlyProcessing = pipeline ? pipelineLoading : isProcessing

  // Performance optimizations
  const debouncedTranscripts = useDebouncedTranscripts(
    allTranscripts,
    debounceInterval,
    enableRealTimeUpdates && !!pipeline
  )

  // Scroll management
  const {scrollRef, showScrollButton, scrollToBottom} = useSmartScrolling(
    autoScroll,
    debouncedTranscripts,
    showScrollToBottom
  )

  // New message animation tracking
  const [newMessageIndices, setNewMessageIndices] = useState<Set<number>>(new Set())
  const prevTranscriptCount = useRef(debouncedTranscripts.length)

  // Handle new messages for animation
  useEffect(() => {
    if (debouncedTranscripts.length > prevTranscriptCount.current) {
      const newIndices = new Set<number>()
      for (let i = prevTranscriptCount.current; i < debouncedTranscripts.length; i++) {
        newIndices.add(i)
      }
      setNewMessageIndices(newIndices)

      // Clear animation flags after animation completes
      setTimeout(() => {
        setNewMessageIndices(new Set())
      }, 500)

      // Call onTranscriptionReceived for new messages
      if (onTranscriptionReceived) {
        for (let i = prevTranscriptCount.current; i < debouncedTranscripts.length; i++) {
          onTranscriptionReceived(debouncedTranscripts[i])
        }
      }
    }

    prevTranscriptCount.current = debouncedTranscripts.length
  }, [debouncedTranscripts.length, onTranscriptionReceived])

  // Error handling
  useEffect(() => {
    if (pipelineError && onError) {
      onError(pipelineError)
    }
  }, [pipelineError, onError])

  // Mode switching
  const handleModeChange = useCallback(
    async (mode: TranscriptionMode) => {
      if (pipeline) {
        try {
          await pipeline.switchMode(mode)
          onModeChange?.(mode)
        } catch (error) {
          console.error('Failed to switch transcription mode:', error)
          onError?.(error as Error)
        }
      }
    },
    [pipeline, onModeChange, onError]
  )

  // Limit visible transcripts for performance
  const visibleTranscripts = useMemo(() => {
    return debouncedTranscripts.slice(-maxVisibleMessages)
  }, [debouncedTranscripts, maxVisibleMessages])

  // Render mode toggle
  const renderModeToggle = () => {
    if (!showModeToggle || !pipeline || !pipelineState) return null

    return (
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{color: 'var(--text-primary)'}}>
          Live Transcript
        </h3>

        <div className="flex items-center space-x-2">
          <select
            value={pipelineState.currentMode}
            onChange={e => handleModeChange(e.target.value as TranscriptionMode)}
            className="rounded border bg-transparent px-2 py-1 text-sm"
            style={{
              borderColor: 'var(--border-secondary)',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--glass-light)'
            }}
          >
            <option value={TranscriptionMode.HYBRID}>Hybrid Mode</option>
            <option value={TranscriptionMode.WEBSOCKET}>Real-Time Only</option>
            <option value={TranscriptionMode.BATCH}>Batch Only</option>
          </select>
        </div>
      </div>
    )
  }

  // Render connection status
  const renderConnectionStatus = () => {
    if (!showConnectionStatus || !pipeline || !pipelineState) return null

    // For now, create a mock WebSocket client representation
    // In a real implementation, you'd pass the actual WebSocket client
    return (
      <div className="mb-2">
        <div className="flex items-center space-x-3 text-sm">
          <div className="flex items-center space-x-2">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                pipelineState.isConnected ? 'bg-green-500' : 'bg-red-500',
                pipelineState.isProcessing && 'animate-pulse'
              )}
            />
            <span style={{color: 'var(--text-primary)'}}>
              {pipelineState.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs" style={{color: 'var(--text-muted)'}}>
            <span>Quality: {pipelineState.connectionQuality}</span>
            <span>Mode: {pipelineState.currentMode}</span>
            {pipelineState.isStreaming && <span>🔴 Streaming</span>}
            {pipelineState.isRecording && <span>🎤 Recording</span>}
          </div>

          {pipelineState.latency > 0 && (
            <div className="text-xs" style={{color: 'var(--text-muted)'}}>
              {pipelineState.latency}ms
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render error state
  const renderError = () => {
    if (!pipelineError) return null

    return (
      <div className="mb-3">
        <GlassBox variant="light" className="border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-center space-x-2">
            <span className="text-red-400">⚠️</span>
            <span className="text-sm text-red-300">Error: {pipelineError.message}</span>
          </div>
        </GlassBox>
      </div>
    )
  }

  // Render empty state
  const renderEmptyState = () => {
    if (visibleTranscripts.length > 0 || isCurrentlyProcessing) return null

    return (
      <div className="flex h-full min-h-[150px] flex-col items-center justify-center text-center">
        <div
          className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed"
          style={{
            borderColor: 'var(--border-secondary)',
            color: 'var(--text-muted)'
          }}
        >
          🎤
        </div>
        <p className="text-sm italic" style={{color: 'var(--text-muted)'}}>
          {pipeline
            ? 'No transcriptions yet. Start recording to see real-time results.'
            : 'No transcriptions yet. Start recording to see results.'}
        </p>
        {pipeline && pipelineState && !pipelineState.isInitialized && (
          <p className="mt-1 text-xs" style={{color: 'var(--text-muted)'}}>
            Initializing transcription pipeline...
          </p>
        )}
      </div>
    )
  }

  // Render processing indicator
  const renderProcessingIndicator = () => {
    if (!isCurrentlyProcessing) return null

    return (
      <div className="flex items-center justify-center p-4">
        <GlassBox variant="light" className="px-4 py-2">
          <div className="flex items-center space-x-3">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-b-transparent"
              style={{borderColor: 'var(--text-accent)'}}
            />
            <span className="text-sm" style={{color: 'var(--text-secondary)'}}>
              {pipeline && pipelineState?.isStreaming
                ? 'Streaming audio...'
                : 'Processing audio...'}
            </span>
          </div>
        </GlassBox>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-4xl">
      {renderModeToggle()}
      {renderConnectionStatus()}
      {renderError()}

      <div className="relative">
        <GlassBox variant="medium" cornerRadius={12} className="overflow-hidden">
          <div
            ref={scrollRef}
            className={cn(
              'max-h-[400px] min-h-[200px] overflow-y-auto p-4',
              'transcript-scroll glass-container'
            )}
          >
            {renderEmptyState()}

            {visibleTranscripts.length > 0 && (
              <>
                {enableVirtualization ? (
                  <VirtualizedTranscript
                    transcripts={visibleTranscripts.map(t => ({
                      ...t,
                      duration: t.duration || 0 // Ensure duration is never undefined
                    }))}
                    newMessageIndices={newMessageIndices}
                    maxVisibleMessages={maxVisibleMessages}
                  />
                ) : (
                  <div className="space-y-3">
                    {visibleTranscripts.map((transcript, index) => (
                      <div
                        key={`${transcript.timestamp || Date.now()}-${index}`}
                        className={cn(
                          'rounded-lg p-3 transition-all duration-300',
                          newMessageIndices.has(index) && 'animate-pulse bg-blue-500/10',
                          'bg-white/5 backdrop-blur-sm'
                        )}
                        style={{
                          borderLeft: '3px solid var(--text-accent)',
                          backgroundColor: newMessageIndices.has(index)
                            ? 'var(--glass-medium)'
                            : 'var(--glass-light)'
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <p
                            className="flex-1 text-sm leading-relaxed"
                            style={{color: 'var(--text-primary)'}}
                          >
                            {transcript.text}
                          </p>

                          <div className="ml-3 flex flex-col items-end space-y-1">
                            {transcript.confidence && (
                              <span
                                className="text-xs"
                                style={{
                                  color:
                                    transcript.confidence > 0.8
                                      ? 'var(--text-success)'
                                      : transcript.confidence > 0.6
                                        ? 'var(--text-warning)'
                                        : 'var(--text-error)'
                                }}
                              >
                                {Math.round(transcript.confidence * 100)}%
                              </span>
                            )}

                            {transcript.source && (
                              <span className="text-xs" style={{color: 'var(--text-muted)'}}>
                                {transcript.source}
                              </span>
                            )}

                            {transcript.duration && (
                              <span className="text-xs" style={{color: 'var(--text-muted)'}}>
                                {transcript.duration}ms
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {renderProcessingIndicator()}
              </>
            )}
          </div>
        </GlassBox>

        {/* Scroll to bottom button */}
        {showScrollButton && showScrollToBottom && (
          <button
            onClick={scrollToBottom}
            className={cn(
              'absolute bottom-4 right-4 rounded-full p-2 transition-all duration-200',
              'hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-95'
            )}
            style={{
              backgroundColor: 'var(--glass-medium)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px var(--glass-shadow)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--glass-heavy)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--glass-medium)'
            }}
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M7 13l3 3 3-3" />
              <path d="M7 6l3 3 3-3" />
            </svg>
          </button>
        )}
      </div>

      {/* Performance debug info (development only) */}
      {process.env.NODE_ENV === 'development' && pipeline && pipelineState && (
        <div className="mt-2 text-xs opacity-50" style={{color: 'var(--text-muted)'}}>
          Pipeline: {pipelineState.transcriptCount} transcripts | Queue:{' '}
          {pipelineState.processingQueue} | Mode: {pipelineState.currentMode} | Latency:{' '}
          {pipelineState.latency}ms | Dropped: {pipelineState.droppedFrames}
        </div>
      )}
    </div>
  )
}

export default EnhancedTranscriptDisplay
