/**
 * Enhanced LiveStreamingArea with persistent text display
 *
 * This version ensures:
 * 1. Text appears immediately when recording starts
 * 2. Text never disappears during the session
 * 3. Smooth transitions without text loss
 * 4. Proper integration with LiveTranscriptionBuffer
 */

import React, {useEffect, useState, useRef} from 'react'
import {cn} from '../utils/tailwind'
import GlassBox from './GlassBox'
import StreamingTextRenderer from './StreamingTextRenderer'
import AccessibleStreamingText from './AccessibleStreamingText'
import TranscriptionStatusIndicator from './TranscriptionStatusIndicator'
import useLiveTranscription from '../hooks/useLiveTranscription'

export interface EnhancedLiveStreamingAreaProps {
  // Control props
  isRecording: boolean

  // Source information
  streamingSource?: string

  // Callbacks for integration with existing system
  onStreamingComplete?: (text: string) => void
  onTextUpdate?: (text: string, isPartial: boolean) => void

  // Configuration
  config?: {
    immediateDisplay?: boolean
    persistentDisplay?: boolean
    maxDisplayLength?: number
    showSourceBadge?: boolean
    showConfidenceScore?: boolean
    enableAnimations?: boolean
  }

  // Accessibility
  accessibilityConfig?: {
    enabled: boolean
    announceChanges: boolean
    verboseStatus: boolean
    enableKeyboardControls: boolean
    announcementPriority: 'low' | 'medium' | 'high'
  }

  // Styling
  className?: string
}

/**
 * Source type mapping for visual indicators
 */
const SOURCE_DISPLAY_MAP: Record<string, {label: string; color: string; icon: string}> = {
  'websocket-gemini': {label: 'Gemini Live', color: 'var(--success-color)', icon: '🔴'},
  websocket: {label: 'WebSocket', color: 'var(--primary-color)', icon: '⚡'},
  'websocket-proxy': {label: 'Proxy Stream', color: 'var(--warning-color)', icon: '🔄'},
  streaming: {label: 'Live Stream', color: 'var(--info-color)', icon: '📡'},
  batch: {label: 'Batch', color: 'var(--text-muted)', icon: '📄'},
  unknown: {label: 'Unknown', color: 'var(--text-muted)', icon: '❓'}
}

const EnhancedLiveStreamingArea: React.FC<EnhancedLiveStreamingAreaProps> = ({
  isRecording,
  streamingSource = 'websocket-gemini',
  onStreamingComplete,
  onTextUpdate,
  config = {},
  accessibilityConfig = {
    enabled: true,
    announceChanges: true,
    verboseStatus: false,
    enableKeyboardControls: true,
    announcementPriority: 'medium'
  },
  className
}) => {
  // Default configuration
  const {
    immediateDisplay = true,
    persistentDisplay = true,
    maxDisplayLength = 2000,
    showSourceBadge = true,
    showConfidenceScore = true,
    enableAnimations = true
  } = config

  // Initialize live transcription hook
  const {
    currentText,
    isActivelyStreaming,
    hasRecentActivity,
    state,
    performanceStats,
    startSession,
    endSession,
    addSegment
  } = useLiveTranscription({
    immediateDisplay,
    persistentDisplay,
    timestampTracking: true,
    autoMergePartials: true,
    maxSegments: 1000,
    retentionTime: 3600000, // 1 hour
    debounceDelay: 50 // Fast updates for responsive feel
  })

  // UI state
  const [displayText, setDisplayText] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const [displayPhase, setDisplayPhase] = useState<'idle' | 'starting' | 'active' | 'ending'>(
    'idle'
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const wasRecordingRef = useRef(false)

  // Get source display information
  const sourceInfo = SOURCE_DISPLAY_MAP[streamingSource] || SOURCE_DISPLAY_MAP.unknown

  // Handle recording state changes
  useEffect(() => {
    if (isRecording && !wasRecordingRef.current) {
      console.log('🔴 EnhancedLiveStreamingArea: Starting recording session')

      // Start transcription session
      startSession()
      setDisplayPhase('starting')
      setIsVisible(true)

      // Quick transition to active state
      setTimeout(() => {
        setDisplayPhase('active')
      }, 100)

      wasRecordingRef.current = true
    } else if (!isRecording && wasRecordingRef.current) {
      console.log('🔴 EnhancedLiveStreamingArea: Ending recording session')

      // End session but keep text visible if persistent display is enabled
      endSession()

      if (!persistentDisplay) {
        setDisplayPhase('ending')
        setTimeout(() => {
          setIsVisible(false)
          setDisplayPhase('idle')
        }, 1000)
      }

      wasRecordingRef.current = false
    }
  }, [isRecording, startSession, endSession, persistentDisplay])

  // Update display text from buffer
  useEffect(() => {
    const newDisplayText =
      currentText.length > maxDisplayLength
        ? '...' + currentText.slice(-(maxDisplayLength - 3))
        : currentText

    setDisplayText(newDisplayText)

    // Notify parent of text updates
    if (onTextUpdate && currentText !== displayText) {
      onTextUpdate(
        currentText,
        state.segments.some(s => s.isPartial)
      )
    }

    // If we have text and aren't visible yet, show the component
    if (currentText && !isVisible) {
      setIsVisible(true)
      setDisplayPhase('active')
    }
  }, [currentText, maxDisplayLength, onTextUpdate, displayText, state.segments, isVisible])

  // Handle streaming completion
  useEffect(() => {
    if (!isActivelyStreaming && currentText && onStreamingComplete) {
      console.log('🔴 EnhancedLiveStreamingArea: Streaming completed, notifying parent')
      onStreamingComplete(currentText)
    }
  }, [isActivelyStreaming, currentText, onStreamingComplete])

  // Integration point for external transcription data
  const handleExternalTranscription = (text: string, isPartial: boolean, source?: string) => {
    console.log('🔴 EnhancedLiveStreamingArea: Received external transcription:', {
      text: text.substring(0, 50) + '...',
      isPartial,
      source
    })

    addSegment(
      text,
      isPartial,
      source || streamingSource,
      undefined, // audioTimestamp - will be estimated
      undefined, // confidence - not provided
      {external: true}
    )
  }

  // Expose method for external integration
  useEffect(() => {
    // This could be used by parent components to inject transcription data
    const element = containerRef.current as HTMLElement | null
    element?.setAttribute?.('data-handler', 'live-transcription')
    if (element) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(element as any).handleTranscription = handleExternalTranscription
    }
  }, [addSegment, streamingSource])

  // Don't render if not visible and no persistent display
  if (!isVisible && !persistentDisplay) {
    return null
  }

  // Determine if we should show content
  const shouldShowContent = isVisible || (persistentDisplay && displayText)

  if (!shouldShowContent) {
    return null
  }

  const isCurrentlyActive = displayPhase === 'active' && (isActivelyStreaming || hasRecentActivity)

  return (
    <div
      ref={containerRef}
      className={cn(
        'enhanced-live-streaming-area transition-all duration-300 ease-in-out',
        {
          'scale-95 opacity-0': displayPhase === 'starting' && enableAnimations,
          'scale-100 opacity-100': displayPhase === 'active',
          'scale-98 opacity-80': displayPhase === 'ending' && enableAnimations
        },
        className
      )}
      role="region"
      aria-label="Live transcription display"
      aria-live={accessibilityConfig.announceChanges ? 'polite' : 'off'}
      data-testid="enhanced-live-streaming-area"
    >
      <GlassBox
        variant="light"
        cornerRadius={16}
        className={cn(
          'live-streaming-container relative overflow-hidden',
          'focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2',
          'border transition-all duration-300',
          {
            'border-blue-400/40 shadow-lg shadow-blue-400/20':
              isCurrentlyActive && enableAnimations,
            'border-green-400/30 shadow-md shadow-green-400/10':
              !isCurrentlyActive && displayText && enableAnimations,
            'border-gray-300/20': !enableAnimations
          }
        )}
        style={{
          minHeight: '80px',
          maxHeight: displayText ? '400px' : '80px',
          background:
            isCurrentlyActive && enableAnimations
              ? `linear-gradient(135deg, ${sourceInfo.color}08 0%, ${sourceInfo.color}03 100%)`
              : 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
        }}
      >
        {/* Animated border effect for active streaming */}
        {enableAnimations && isCurrentlyActive && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 rounded-[16px] opacity-30"
              style={{
                background: `linear-gradient(45deg, transparent 30%, ${sourceInfo.color}20 50%, transparent 70%)`,
                animation: 'shimmer 3s ease-in-out infinite'
              }}
            />
          </div>
        )}

        {/* Header with status and source info */}
        <div className="flex items-center justify-between p-3 pb-2">
          <div className="flex items-center space-x-3">
            {/* Status indicator */}
            <TranscriptionStatusIndicator
              isConnected={true}
              isTranscribing={isCurrentlyActive}
              isProcessing={displayPhase === 'starting'}
              isPaused={false}
            />

            {/* Source badge */}
            {showSourceBadge && (
              <div
                className={cn(
                  'flex items-center space-x-1 rounded-full px-2 py-1 text-xs font-medium',
                  'border border-white/20 bg-white/10 backdrop-blur-sm',
                  'transition-all duration-200'
                )}
                style={{
                  color: sourceInfo.color,
                  borderColor: `${sourceInfo.color}30`
                }}
              >
                <span>{sourceInfo.icon}</span>
                <span>{sourceInfo.label}</span>
              </div>
            )}
          </div>

          {/* Performance stats */}
          {showConfidenceScore && performanceStats.segmentCount > 0 && (
            <div className="flex items-center space-x-2 text-xs text-white/60">
              <span>Segments: {performanceStats.segmentCount}</span>
              {state.stats.averageConfidence > 0 && (
                <span>Conf: {(state.stats.averageConfidence * 100).toFixed(0)}%</span>
              )}
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="px-3 pb-3">
          {displayText ? (
            <div className="space-y-2">
              {/* Main transcription display */}
              <div className="min-h-[40px]">
                <StreamingTextRenderer
                  text={displayText}
                  isPartial={state.segments.some(s => s.isPartial)}
                  mode="word" // Use word mode for smoother display
                  className="leading-relaxed text-white/90"
                  enableTypewriterEffects={enableAnimations}
                  showCursor={isCurrentlyActive}
                />
              </div>

              {/* Accessibility support */}
              {accessibilityConfig.enabled && (
                <AccessibleStreamingText
                  text={displayText}
                  isPartial={state.segments.some(s => s.isPartial)}
                  announceChanges={accessibilityConfig.announceChanges}
                  verboseStatus={accessibilityConfig.verboseStatus}
                  announcementPriority={accessibilityConfig.announcementPriority}
                />
              )}

              {/* Status text for empty state */}
              {!displayText && isRecording && displayPhase === 'starting' && (
                <div className="py-2 text-center text-sm text-white/50 italic">
                  Waiting for transcription...
                </div>
              )}
            </div>
          ) : (
            // Empty state
            <div className="py-4 text-center text-sm text-white/40">
              {isRecording ? 'Starting transcription...' : 'No transcription data'}
            </div>
          )}
        </div>

        {/* Bottom status bar */}
        {displayText && (
          <div className="px-3 pb-2">
            <div className="flex items-center justify-between text-xs text-white/40">
              <span>
                {state.stats.totalSegments} segments • {Math.round(state.totalDuration / 1000)}s
              </span>
              <span>{isCurrentlyActive ? 'Live' : 'Complete'}</span>
            </div>
          </div>
        )}
      </GlassBox>
    </div>
  )
}

export default EnhancedLiveStreamingArea
