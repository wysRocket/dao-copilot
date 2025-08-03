import React, {useEffect, useRef, useState, useCallback} from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import GlassBox from './GlassBox'
import VirtualizedTranscript from './VirtualizedTranscript'
import {FastTranscriptionDisplay} from './FastTranscriptionDisplay'  // 🚀 PERFORMANCE FIX
import {useWebSocketStreaming, WebSocketStreamingConfig} from '../hooks/useWebSocketStreaming'
import {cn} from '../utils/tailwind'

interface EnhancedTranscriptDisplayProps {
  transcripts: TranscriptionResult[]
  isProcessing?: boolean
  autoScroll?: boolean
  showScrollToBottom?: boolean
  // WebSocket streaming props
  enableStreaming?: boolean
  websocketUrl?: string
  streamingConfig?: WebSocketStreamingConfig
  onStreamingStateChange?: (connected: boolean) => void
  onStreamingError?: (error: string) => void
}

/**
 * Enhanced TranscriptDisplay component with WebSocket streaming support
 *
 * This component combines traditional batch transcription display with
 * real-time WebSocket streaming capabilities for live transcription.
 */
export const EnhancedTranscriptDisplay: React.FC<EnhancedTranscriptDisplayProps> = ({
  transcripts,
  isProcessing = false,
  autoScroll = true,
  showScrollToBottom = true,
  enableStreaming = false,
  websocketUrl,
  streamingConfig,
  onStreamingStateChange,
  onStreamingError
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [newMessageIndices, setNewMessageIndices] = useState<Set<number>>(new Set())
  const prevTranscriptCount = useRef(transcripts.length)

  // WebSocket streaming integration
  const [streamingState, streamingControls] = useWebSocketStreaming({
    animationSpeed: 40,
    enableAnimation: true,
    animationMode: 'character',
    autoReconnect: true,
    maxReconnectAttempts: 3,
    ...streamingConfig
  })

  // Auto-connect to WebSocket when enabled
  useEffect(() => {
    if (enableStreaming && websocketUrl && streamingState.connectionState === 'disconnected') {
      streamingControls.connect(websocketUrl).catch(error => {
        console.error('Failed to connect to WebSocket:', error)
        onStreamingError?.(error.message)
      })
    } else if (!enableStreaming && streamingState.connectionState !== 'disconnected') {
      streamingControls.disconnect()
    }
  }, [
    enableStreaming,
    websocketUrl,
    streamingState.connectionState,
    streamingControls,
    onStreamingError
  ])

  // Notify parent of streaming state changes
  useEffect(() => {
    const isConnected = streamingState.connectionState === 'connected'
    onStreamingStateChange?.(isConnected)
  }, [streamingState.connectionState, onStreamingStateChange])

  // Handle streaming errors
  useEffect(() => {
    if (streamingState.lastError) {
      onStreamingError?.(streamingState.lastError)
    }
  }, [streamingState.lastError, onStreamingError])

  // Handle auto-scroll and new message detection for traditional transcripts
  useEffect(() => {
    if (transcripts.length > prevTranscriptCount.current) {
      // Mark new messages for animation
      const newIndices = new Set<number>()
      for (let i = prevTranscriptCount.current; i < transcripts.length; i++) {
        newIndices.add(i)
      }
      setNewMessageIndices(newIndices)

      // Auto-scroll to bottom if enabled
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }

      // Clear animation flags after animation completes
      setTimeout(() => {
        setNewMessageIndices(new Set())
      }, 500)
    }

    prevTranscriptCount.current = transcripts.length
  }, [transcripts.length, autoScroll])

  // Handle scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement || !showScrollToBottom) return

    const handleScroll = () => {
      const {scrollTop, scrollHeight, clientHeight} = scrollElement
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      const hasContent = transcripts.length > 0 || Boolean(streamingState.streamingText)
      setShowScrollButton(!isNearBottom && hasContent)
    }

    scrollElement.addEventListener('scroll', handleScroll)
    handleScroll() // Initial check

    return () => scrollElement.removeEventListener('scroll', handleScroll)
  }, [transcripts.length, streamingState.streamingText, showScrollToBottom])

  // Auto-scroll when streaming text updates
  useEffect(() => {
    if (autoScroll && scrollRef.current && streamingState.streamingText) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [streamingState.streamingText, autoScroll])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [])

  /**
   * Get connection status indicator
   */
  const renderConnectionStatus = useCallback(() => {
    if (!enableStreaming) return null

    const getStatusColor = () => {
      switch (streamingState.connectionState) {
        case 'connected':
          return 'var(--success-color, #00aa00)'
        case 'connecting':
        case 'reconnecting':
          return 'var(--warning-color, #ffaa00)'
        case 'error':
          return 'var(--error-color, #ff0000)'
        default:
          return 'var(--text-muted)'
      }
    }

    const getStatusText = () => {
      switch (streamingState.connectionState) {
        case 'connected':
          return 'Live'
        case 'connecting':
          return 'Connecting'
        case 'reconnecting':
          return 'Reconnecting'
        case 'error':
          return 'Error'
        default:
          return 'Offline'
      }
    }

    return (
      <div className="mb-2 flex items-center space-x-2">
        <div
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: getStatusColor(),
            animation:
              streamingState.connectionState === 'connecting' ||
              streamingState.connectionState === 'reconnecting'
                ? 'pulse 1.5s ease-in-out infinite'
                : 'none'
          }}
        />
        <span className="text-xs" style={{color: getStatusColor()}}>
          {getStatusText()}
        </span>
        {streamingState.connectionQuality !== 'good' && (
          <span className="text-xs opacity-60" style={{color: 'var(--text-muted)'}}>
            ({streamingState.connectionQuality})
          </span>
        )}
      </div>
    )
  }, [enableStreaming, streamingState])

  /**
   * Render streaming statistics (for debugging/development)
   */
  const renderStreamingStats = useCallback(() => {
    if (!enableStreaming || process.env.NODE_ENV === 'production') return null

    return (
      <div className="mt-2 text-xs opacity-50" style={{color: 'var(--text-muted)'}}>
        Messages: {streamingState.messageStats.total} | Partial:{' '}
        {streamingState.messageStats.partial} | Final: {streamingState.messageStats.final} |
        Corrections: {streamingState.messageStats.corrections}
      </div>
    )
  }, [enableStreaming, streamingState.messageStats])

  return (
    <div className="mx-auto mt-4 w-full max-w-4xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-center text-lg font-semibold" style={{color: 'var(--text-primary)'}}>
          Live Transcript
        </h3>
        {renderConnectionStatus()}
      </div>

      <div className="relative">
        <GlassBox variant="medium" cornerRadius={12} className="overflow-hidden">
          <div
            ref={scrollRef}
            className={cn(
              'max-h-[400px] min-h-[200px] overflow-y-auto p-4',
              'transcript-scroll glass-container'
            )}
          >
            {transcripts.length === 0 && !isProcessing && !streamingState.streamingText ? (
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
                  {enableStreaming
                    ? 'Ready for live transcription. Start speaking...'
                    : 'No transcriptions yet. Start recording to see results.'}
                </p>
              </div>
            ) : (
              <>
                {/* Traditional batch transcripts */}
                {transcripts.length > 0 && (
                  <VirtualizedTranscript
                    transcripts={transcripts}
                    newMessageIndices={newMessageIndices}
                    maxVisibleMessages={100}
                  />
                )}

                {/* Live streaming text display */}
                {enableStreaming && streamingState.streamingText && (
                  <div
                    className={cn(
                      'streaming-text-section',
                      transcripts.length > 0 ? 'mt-4 border-t border-opacity-20 pt-4' : ''
                    )}
                    style={{
                      borderColor: 'var(--border-secondary)'
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs opacity-60" style={{color: 'var(--text-muted)'}}>
                        Live Transcription:
                      </div>
                      {streamingState.isAnimating && (
                        <div className="text-xs opacity-60" style={{color: 'var(--text-accent)'}}>
                          Streaming...
                        </div>
                      )}
                    </div>

                    {/* 🚀 PERFORMANCE FIX: Replace complex StreamingTextRenderer with FastTranscriptionDisplay */}
                    <FastTranscriptionDisplay 
                      text={streamingState.streamingText}
                      isPartial={streamingState.isPartial}
                    />

                    {renderStreamingStats()}
                  </div>
                )}

                {/* Processing indicator */}
                {isProcessing && (
                  <div className="flex items-center justify-center p-4">
                    <GlassBox variant="light" className="px-4 py-2">
                      <div className="flex items-center space-x-3">
                        <div
                          className="h-4 w-4 animate-spin rounded-full border-2 border-b-transparent"
                          style={{borderColor: 'var(--text-accent)'}}
                        />
                        <span className="text-sm" style={{color: 'var(--text-secondary)'}}>
                          Processing audio...
                        </span>
                      </div>
                    </GlassBox>
                  </div>
                )}
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
              'hover:scale-110 active:scale-95'
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
    </div>
  )
}

export default EnhancedTranscriptDisplay
