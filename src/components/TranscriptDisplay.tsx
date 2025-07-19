import React, {useEffect, useRef, useState} from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import GlassBox from './GlassBox'
import VirtualizedTranscript from './VirtualizedTranscript'
import LiveStreamingArea from './LiveStreamingArea'
import {TextStreamBuffer} from '../services/TextStreamBuffer'
import {useAutoScroll} from '../hooks/useAutoScroll'
import {NewContentIndicator, ScrollControls} from './AutoScrollComponents'
import {useAccessibility} from '../hooks/useAccessibility'
import {cn} from '../utils/tailwind'

interface TranscriptDisplayProps {
  transcripts: TranscriptionResult[]
  isProcessing?: boolean
  // Auto-scroll configuration
  autoScrollConfig?: {
    enabled?: boolean
    showControls?: boolean
    showNewContentIndicator?: boolean
    bottomThreshold?: number
    smooth?: boolean
  }
  // Legacy props for backward compatibility
  autoScroll?: boolean
  showScrollToBottom?: boolean
  // New streaming props
  enableStreaming?: boolean
  streamingText?: string
  isStreamingPartial?: boolean
  isStreamingActive?: boolean
  streamingMode?: 'character' | 'word' | 'instant'
  onStreamingComplete?: () => void
  // Accessibility props
  accessibilityConfig?: {
    enabled?: boolean
    announceChanges?: boolean
    verboseStatus?: boolean
    enableKeyboardControls?: boolean
    announcementPriority?: 'low' | 'medium' | 'high'
  }
  // Callbacks
  onScrollStateChange?: (state: {
    isAutoScrolling: boolean
    hasNewContent: boolean
    scrollPercentage: number
  }) => void
}

const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  transcripts,
  isProcessing = false,
  autoScrollConfig = {},
  // Legacy props (for backward compatibility)
  autoScroll = true,
  showScrollToBottom = true,
  enableStreaming = false,
  streamingText = '',
  isStreamingPartial = false,
  isStreamingActive = false,
  streamingMode = 'character',
  onStreamingComplete,
  // Accessibility configuration
  accessibilityConfig = {},
  onScrollStateChange
}) => {
  // Accessibility configuration with defaults
  const mergedAccessibilityConfig = {
    enabled: accessibilityConfig.enabled ?? true,
    announceChanges: accessibilityConfig.announceChanges ?? true,
    verboseStatus: accessibilityConfig.verboseStatus ?? false,
    enableKeyboardControls: accessibilityConfig.enableKeyboardControls ?? true,
    announcementPriority: accessibilityConfig.announcementPriority ?? 'medium',
    ...accessibilityConfig
  }

  // Accessibility hook
  const accessibility = useAccessibility({
    autoDetect: true,
    enableKeyboardHandling: mergedAccessibilityConfig.enableKeyboardControls,
    enableFocusManagement: true
  })
  // Legacy to new config mapping
  const mergedAutoScrollConfig = {
    enabled: autoScrollConfig.enabled ?? autoScroll,
    showControls: autoScrollConfig.showControls ?? showScrollToBottom,
    showNewContentIndicator: autoScrollConfig.showNewContentIndicator ?? true,
    bottomThreshold: autoScrollConfig.bottomThreshold ?? 50,
    smooth: autoScrollConfig.smooth ?? true,
    ...autoScrollConfig
  }

  // Auto-scroll hook
  const {
    state: autoScrollState,
    controls: autoScrollControls,
    containerRef,
    onNewContent
  } = useAutoScroll(mergedAutoScrollConfig)

  // Legacy scroll ref for compatibility
  const scrollRef = containerRef
  const [newMessageIndices, setNewMessageIndices] = useState<Set<number>>(new Set())
  const prevTranscriptCount = useRef(transcripts.length)
  const streamBufferRef = useRef<TextStreamBuffer | null>(null)

  // Notify parent of scroll state changes
  useEffect(() => {
    if (onScrollStateChange) {
      onScrollStateChange({
        isAutoScrolling: autoScrollState.isAutoScrolling,
        hasNewContent: autoScrollState.hasNewContent,
        scrollPercentage: autoScrollState.scrollPercentage
      })
    }
  }, [
    autoScrollState.isAutoScrolling,
    autoScrollState.hasNewContent,
    autoScrollState.scrollPercentage,
    onScrollStateChange
  ])

  // Initialize streaming buffer
  useEffect(() => {
    if (enableStreaming && !streamBufferRef.current) {
      streamBufferRef.current = new TextStreamBuffer({
        debounceDelay: 100,
        autoFlush: true,
        enableCorrectionDetection: true
      })
    }

    return () => {
      if (streamBufferRef.current) {
        streamBufferRef.current.destroy()
        streamBufferRef.current = null
      }
    }
  }, [enableStreaming])

  // Handle new messages and trigger auto-scroll
  useEffect(() => {
    if (transcripts.length > prevTranscriptCount.current) {
      // Mark new messages for animation
      const newIndices = new Set<number>()
      for (let i = prevTranscriptCount.current; i < transcripts.length; i++) {
        newIndices.add(i)
      }
      setNewMessageIndices(newIndices)

      // Trigger new content notification for auto-scroll
      onNewContent()

      // Announce new transcripts to screen readers
      if (mergedAccessibilityConfig.announceChanges) {
        const newTranscriptCount = transcripts.length - prevTranscriptCount.current
        const announcement =
          newTranscriptCount === 1
            ? 'New transcript added'
            : `${newTranscriptCount} new transcripts added`
        accessibility.announce(announcement, 'low')
      }

      // Clear animation flags after animation completes
      setTimeout(() => {
        setNewMessageIndices(new Set())
      }, 500)
    }

    prevTranscriptCount.current = transcripts.length
  }, [transcripts.length, onNewContent, mergedAccessibilityConfig.announceChanges, accessibility])

  return (
    <div className="mx-auto mt-4 w-full max-w-4xl">
      <h3
        className="mb-3 text-center text-lg font-semibold"
        style={{color: 'var(--text-primary)'}}
        id="transcript-heading"
      >
        Live Transcript
      </h3>

      <div className="relative">
        <GlassBox variant="medium" cornerRadius={12} className="overflow-hidden">
          <div
            ref={scrollRef}
            className={cn(
              'max-h-[400px] min-h-[200px] overflow-y-auto p-4',
              'transcript-scroll glass-container'
            )}
            role="log"
            aria-labelledby="transcript-heading"
            aria-live={enableStreaming && streamingText ? 'polite' : 'off'}
            aria-relevant="additions text"
            tabIndex={mergedAccessibilityConfig.enableKeyboardControls ? 0 : -1}
            onKeyDown={e => {
              if (mergedAccessibilityConfig.enableKeyboardControls) {
                // Handle keyboard navigation
                if (e.key === 'Home') {
                  e.preventDefault()
                  autoScrollControls.scrollToTop()
                } else if (e.key === 'End') {
                  e.preventDefault()
                  autoScrollControls.scrollToBottom()
                } else if (e.key === ' ') {
                  e.preventDefault()
                  autoScrollControls.toggleAutoScroll()
                  accessibility.announce(
                    `Auto-scroll ${autoScrollState.isAutoScrolling ? 'disabled' : 'enabled'}`,
                    'medium'
                  )
                }
              }
            }}
          >
            {transcripts.length === 0 && !isProcessing ? (
              <div
                className="flex h-full min-h-[150px] flex-col items-center justify-center text-center"
                role="status"
                aria-label="No transcriptions available"
              >
                <div
                  className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed"
                  style={{
                    borderColor: 'var(--border-secondary)',
                    color: 'var(--text-muted)'
                  }}
                  aria-hidden="true"
                >
                  🎤
                </div>
                <p className="text-sm italic" style={{color: 'var(--text-muted)'}}>
                  No transcriptions yet. Start recording to see results.
                </p>
              </div>
            ) : (
              <>
                <VirtualizedTranscript
                  transcripts={transcripts}
                  newMessageIndices={newMessageIndices}
                  maxVisibleMessages={100}
                />

                {/* Live streaming text display */}
                {enableStreaming && (isStreamingActive || streamingText) && (
                  <div
                    className="border-opacity-20 mt-4 border-t pt-4"
                    style={{borderColor: 'var(--border-secondary)'}}
                  >
                    <LiveStreamingArea
                      streamingText={streamingText}
                      isStreamingActive={isStreamingActive}
                      isStreamingPartial={isStreamingPartial}
                      streamingMode={streamingMode}
                      streamingSource="microphone"
                      confidence={0.85} // Default confidence, should come from props
                      accessibilityConfig={mergedAccessibilityConfig}
                      onStreamingComplete={onStreamingComplete}
                      onClearStreaming={() => onStreamingComplete?.()}
                      animate={true}
                      showSourceBadge={true}
                      showConfidenceScore={true}
                      className="w-full"
                    />
                  </div>
                )}

                {isProcessing && (
                  <div className="flex items-center justify-center p-4">
                    <GlassBox variant="light" className="px-4 py-2">
                      <div
                        className="flex items-center space-x-3"
                        role="status"
                        aria-label="Processing audio"
                      >
                        <div
                          className="h-4 w-4 animate-spin rounded-full border-2 border-b-transparent"
                          style={{borderColor: 'var(--text-accent)'}}
                          aria-hidden="true"
                        ></div>
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

        {/* New Content Indicator */}
        {mergedAutoScrollConfig.showNewContentIndicator && (
          <NewContentIndicator
            visible={autoScrollState.hasNewContent}
            onClick={() => {
              autoScrollControls.scrollToBottom()
              if (mergedAccessibilityConfig.announceChanges) {
                accessibility.announce('Scrolled to new content', 'low')
              }
            }}
            variant="floating"
            animation="bounce"
            aria-label="New content available, click to scroll to bottom"
          />
        )}

        {/* Scroll Controls */}
        {mergedAutoScrollConfig.showControls && (
          <ScrollControls
            isAutoScrolling={autoScrollState.isAutoScrolling}
            hasNewContent={autoScrollState.hasNewContent}
            scrollPercentage={autoScrollState.scrollPercentage}
            isScrollable={autoScrollState.isScrollable}
            onToggleAutoScroll={() => {
              autoScrollControls.toggleAutoScroll()
              if (mergedAccessibilityConfig.announceChanges) {
                const newState = !autoScrollState.isAutoScrolling
                accessibility.announce(`Auto-scroll ${newState ? 'enabled' : 'disabled'}`, 'medium')
              }
            }}
            onScrollToTop={() => {
              autoScrollControls.scrollToTop()
              if (mergedAccessibilityConfig.announceChanges) {
                accessibility.announce('Scrolled to top', 'low')
              }
            }}
            onScrollToBottom={() => {
              autoScrollControls.scrollToBottom()
              if (mergedAccessibilityConfig.announceChanges) {
                accessibility.announce('Scrolled to bottom', 'low')
              }
            }}
            position="floating"
          />
        )}
      </div>
    </div>
  )
}

export default TranscriptDisplay
