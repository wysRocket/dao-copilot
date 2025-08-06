import React, {useEffect, useRef, useState} from 'react'
import GlassBox from './GlassBox'
import VirtualizedTranscript from './VirtualizedTranscript'
import StreamingTextRenderer from './StreamingTextRenderer'
import {useAutoScroll} from '../hooks/useAutoScroll'
import {NewContentIndicator, ScrollControls} from './AutoScrollComponents'
import {useAccessibility} from '../hooks/useAccessibility'
import {cn} from '../utils/tailwind'
import {useTranscriptionState} from '../hooks/useTranscriptionState'

interface AssistantTranscriptDisplayProps {
  // Auto-scroll configuration
  autoScrollConfig?: {
    enabled?: boolean
    showControls?: boolean
    showNewContentIndicator?: boolean
    bottomThreshold?: number
    smooth?: boolean
  }
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
  // Visual customization for assistant window
  className?: string
  variant?: 'compact' | 'full' | 'minimal'
  showHeader?: boolean
  showStatus?: boolean
}

const AssistantTranscriptDisplay: React.FC<AssistantTranscriptDisplayProps> = ({
  autoScrollConfig = {},
  accessibilityConfig = {},
  onScrollStateChange,
  className = '',
  variant = 'full',
  showHeader = true,
  showStatus = true
}) => {
  // Get unified transcription state
  const {
    transcripts,
    isProcessing,
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    streamingMode
  } = useTranscriptionState()

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

  // Auto-scroll configuration with defaults
  const mergedAutoScrollConfig = {
    enabled: autoScrollConfig.enabled ?? true,
    showControls: autoScrollConfig.showControls ?? variant !== 'minimal',
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

  const [newMessageIndices, setNewMessageIndices] = useState<Set<number>>(new Set())
  const prevTranscriptCount = useRef(transcripts.length)

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

  // Auto-scroll when streaming text updates
  useEffect(() => {
    if (isStreamingActive && currentStreamingText) {
      onNewContent()
    }
  }, [currentStreamingText, isStreamingActive, onNewContent])

  // Calculate dynamic height based on variant
  const getContainerHeight = () => {
    switch (variant) {
      case 'compact':
        return 'max-h-[300px] min-h-[150px]'
      case 'minimal':
        return 'max-h-[200px] min-h-[100px]'
      default:
        return 'max-h-[500px] min-h-[250px]'
    }
  }

  return (
    <div className={cn('w-full', className)}>
      {showHeader && variant !== 'minimal' && (
        <h3
          className="mb-3 text-center text-lg font-semibold"
          style={{color: 'var(--text-primary)'}}
          id="assistant-transcript-heading"
        >
          Live Transcriptions
        </h3>
      )}

      {showStatus && variant === 'full' && (
        <div
          className="mb-4 rounded-lg border p-3"
          style={{
            backgroundColor: 'var(--glass-light)',
            borderColor: 'var(--glass-border)',
            color: 'var(--text-primary)'
          }}
        >
          <div className="text-sm">
            <div className="mb-1">
              <strong>Status:</strong>{' '}
              {isStreamingActive
                ? `Streaming ${isCurrentTextPartial ? '(partial)' : '(final)'}`
                : isProcessing
                  ? 'Processing...'
                  : 'Ready'}
            </div>
            <div className="mb-1">
              <strong>Total Transcripts:</strong> {transcripts.length}
            </div>
            {isStreamingActive && (
              <div className="text-xs" style={{color: 'var(--text-muted)'}}>
                Mode: {streamingMode} | Characters: {currentStreamingText.length}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="relative">
        <GlassBox variant="medium" cornerRadius={12} className="overflow-hidden">
          <div
            ref={containerRef}
            className={cn(
              getContainerHeight(),
              'overflow-y-auto p-4',
              'transcript-scroll glass-container'
            )}
            role="log"
            aria-labelledby="assistant-transcript-heading"
            aria-live={isStreamingActive && currentStreamingText ? 'polite' : 'off'}
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
            {transcripts.length === 0 && !isProcessing && !isStreamingActive ? (
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
                  Waiting for audio input. Start recording to see transcriptions.
                </p>
              </div>
            ) : (
              <>
                {/* Static transcripts */}
                {transcripts.length > 0 && (
                  <VirtualizedTranscript
                    transcripts={transcripts.map(t => ({
                      ...t,
                      duration: t.duration || 0 // Provide default for compatibility
                    }))}
                    newMessageIndices={newMessageIndices}
                    overscan={variant === 'minimal' ? 5 : 10}
                  />
                )}

                {/* Live streaming text display */}
                {isStreamingActive && currentStreamingText && (
                  <div
                    className={cn(
                      transcripts.length > 0 && 'border-opacity-20 mt-4 border-t pt-4',
                      'streaming-text-area'
                    )}
                    style={{borderColor: 'var(--border-secondary)'}}
                  >
                    <StreamingTextRenderer
                      text={currentStreamingText}
                      isPartial={isCurrentTextPartial}
                      mode={streamingMode}
                      className="w-full"
                      showStateIndicator={true}
                      enableTypewriterEffects={false}
                      partialStyle={{
                        background:
                          'linear-gradient(90deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%)',
                        borderLeft: '3px solid rgba(59, 130, 246, 0.6)',
                        paddingLeft: '8px',
                        borderRadius: '4px'
                      }}
                      finalStyle={{
                        background: 'rgba(255, 255, 255, 0.01)',
                        borderLeft: '3px solid rgba(34, 197, 94, 0.6)',
                        paddingLeft: '8px',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                )}

                {/* Processing indicator */}
                {isProcessing && (
                  <div
                    className={cn(
                      (transcripts.length > 0 || isStreamingActive) && 'mt-4',
                      'flex items-center justify-center p-4'
                    )}
                  >
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
        {mergedAutoScrollConfig.showNewContentIndicator && variant !== 'minimal' && (
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
        {mergedAutoScrollConfig.showControls && variant !== 'minimal' && (
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

export default AssistantTranscriptDisplay
