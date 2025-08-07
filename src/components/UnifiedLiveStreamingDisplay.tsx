/**
 * UnifiedLiveStreamingDisplay - Consolidated live streaming transcription component
 *
 * This component combines the best features from LiveStreamingArea and EnhancedLiveStreamingArea:
 * 1. Immediate text display when recording starts
 * 2. Persistent text that never disappears during sessions
 * 3. Enhanced performance with proper cleanup
 * 4. Comprehensive accessibility support
 * 5. Responsive design for all screen sizes
 * 6. Memory-efficient rendering
 */

import React, {useEffect, useState, useRef, useCallback, useMemo} from 'react'
import {cn} from '../utils/tailwind'
import GlassBox from './GlassBox'
import StreamingTextRenderer from './StreamingTextRenderer'
import AccessibleStreamingText from './AccessibleStreamingText'
import TranscriptionStatusIndicator from './TranscriptionStatusIndicator'
import {markPerformance, PERFORMANCE_MARKERS} from '../utils/performance-profiler'

export interface UnifiedLiveStreamingDisplayProps {
  // Core streaming props
  streamingText?: string
  isStreamingActive: boolean
  isStreamingPartial?: boolean
  streamingMode?: 'character' | 'word' | 'instant'

  // Recording state (enhanced mode)
  isRecording?: boolean

  // Source information
  streamingSource?: string
  confidence?: number

  // Callbacks
  onStreamingComplete?: (text?: string) => void
  onTextUpdate?: (text: string, isPartial: boolean) => void
  onClearStreaming?: () => void

  // Configuration
  config?: {
    immediateDisplay?: boolean
    persistentDisplay?: boolean
    maxDisplayLength?: number
    showSourceBadge?: boolean
    showConfidenceScore?: boolean
    enableAnimations?: boolean
    enhanced?: boolean // Enable enhanced features like buffer integration
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
  variant?: 'basic' | 'enhanced'
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
  demo: {label: 'Demo', color: 'var(--warning-color)', icon: '🎬'},
  unknown: {label: 'Unknown', color: 'var(--text-muted)', icon: '❓'}
}

const UnifiedLiveStreamingDisplay: React.FC<UnifiedLiveStreamingDisplayProps> = ({
  streamingText = '',
  isStreamingActive,
  isStreamingPartial = false,
  streamingMode = 'word',
  isRecording,
  streamingSource = 'unknown',
  confidence,
  onStreamingComplete,
  onTextUpdate,
  onClearStreaming,
  config = {},
  accessibilityConfig = {
    enabled: true,
    announceChanges: true,
    verboseStatus: false,
    enableKeyboardControls: true,
    announcementPriority: 'medium'
  },
  className,
  variant = 'basic'
}) => {
  // Default configuration
  const {
    immediateDisplay = true,
    persistentDisplay = variant === 'enhanced',
    maxDisplayLength = 2000,
    showSourceBadge = true,
    showConfidenceScore = true,
    enableAnimations = true,
    enhanced = variant === 'enhanced'
  } = config

  // State management
  const [displayText, setDisplayText] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<
    'idle' | 'entering' | 'active' | 'completing' | 'exiting'
  >('idle')

  // Refs for cleanup and performance
  const containerRef = useRef<HTMLDivElement>(null)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const previousTextRef = useRef('')

  // Memoized source info
  const sourceInfo = useMemo(
    () => SOURCE_DISPLAY_MAP[streamingSource] || SOURCE_DISPLAY_MAP.unknown,
    [streamingSource]
  )

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current)
      completionTimeoutRef.current = null
    }
  }, [])

  // Handle text updates with optimization and performance tracking
  const handleTextUpdate = useCallback(
    (newText: string) => {
      // Track first transcription received
      if (!previousTextRef.current && newText.trim().length > 0) {
        markPerformance(PERFORMANCE_MARKERS.FIRST_TRANSCRIPTION_RECEIVED)
      }

      // Avoid unnecessary updates
      if (newText === previousTextRef.current && newText === displayText) {
        return
      }

      // Truncate if needed
      const processedText =
        newText.length > maxDisplayLength ? '...' + newText.slice(-(maxDisplayLength - 3)) : newText

      setDisplayText(processedText)
      previousTextRef.current = newText

      // Track first transcription display
      if (processedText.trim().length > 0 && !displayText.trim()) {
        markPerformance(PERFORMANCE_MARKERS.FIRST_TRANSCRIPTION_DISPLAY)
      }

      // Notify parent of updates
      if (onTextUpdate && newText !== previousTextRef.current) {
        onTextUpdate(newText, isStreamingPartial)
      }

      // Show component if we have text and immediate display is enabled
      if (processedText && immediateDisplay && !isVisible) {
        setIsVisible(true)
        setAnimationPhase('entering')

        if (enableAnimations && !immediateDisplay) {
          animationTimeoutRef.current = setTimeout(() => {
            setIsExpanded(true)
            setAnimationPhase('active')
          }, 50) // Reduced from 100ms to 50ms for faster entry
        } else {
          // Immediate display for real-time performance
          setIsExpanded(true)
          setAnimationPhase('active')
        }
      }
    },
    [
      displayText,
      maxDisplayLength,
      onTextUpdate,
      isStreamingPartial,
      immediateDisplay,
      isVisible,
      enableAnimations
    ]
  )

  // Handle streaming text prop changes
  useEffect(() => {
    if (streamingText !== undefined) {
      handleTextUpdate(streamingText)
    }
  }, [streamingText, handleTextUpdate])

  // Handle recording state changes (enhanced mode)
  useEffect(() => {
    if (!enhanced || isRecording === undefined) return

    if (isRecording && !isVisible) {
      setIsVisible(true)
      setAnimationPhase('entering')

      if (enableAnimations && !immediateDisplay) {
        animationTimeoutRef.current = setTimeout(() => {
          setIsExpanded(true)
          setAnimationPhase('active')
        }, 50) // Reduced delay for faster response
      } else {
        // Immediate for real-time performance
        setIsExpanded(true)
        setAnimationPhase('active')
      }
    } else if (!isRecording && isVisible && !persistentDisplay) {
      setAnimationPhase('exiting')

      if (enableAnimations && !immediateDisplay) {
        animationTimeoutRef.current = setTimeout(() => {
          setIsExpanded(false)
          setIsVisible(false)
          setAnimationPhase('idle')
        }, 150) // Reduced from 300ms to 150ms
      } else {
        // Immediate for real-time performance
        setIsExpanded(false)
        setIsVisible(false)
        setAnimationPhase('idle')
      }
    }
  }, [isRecording, enhanced, isVisible, persistentDisplay, enableAnimations])

  // Handle streaming state changes
  useEffect(() => {
    if (isStreamingActive && animationPhase !== 'active' && isVisible) {
      setAnimationPhase('active')
    } else if (!isStreamingActive && animationPhase === 'active' && displayText) {
      setAnimationPhase('completing')

      // Auto-complete after delay if not persistent
      if (!persistentDisplay) {
        const completionDelay = immediateDisplay ? 500 : 2000 // Much shorter delay for immediate mode
        completionTimeoutRef.current = setTimeout(() => {
          setAnimationPhase('exiting')

          if (enableAnimations && !immediateDisplay) {
            animationTimeoutRef.current = setTimeout(() => {
              setIsExpanded(false)
              setIsVisible(false)
              setAnimationPhase('idle')
              onStreamingComplete?.(displayText)
            }, 300) // Reduced from 600ms to 300ms
          } else {
            // Immediate for real-time performance
            setIsExpanded(false)
            setIsVisible(false)
            setAnimationPhase('idle')
            onStreamingComplete?.(displayText)
          }
        }, completionDelay)
      } else {
        // Just complete without hiding
        onStreamingComplete?.(displayText)
      }
    }
  }, [
    isStreamingActive,
    animationPhase,
    isVisible,
    displayText,
    persistentDisplay,
    enableAnimations,
    onStreamingComplete
  ])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  // Handle keyboard controls
  useEffect(() => {
    if (!accessibilityConfig.enableKeyboardControls) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'Escape') {
        event.preventDefault()
        onClearStreaming?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [accessibilityConfig.enableKeyboardControls, onClearStreaming])

  // Don't render if not visible
  if (!isVisible && !displayText && !isStreamingActive) {
    return null
  }

  const isCurrentlyActive = isStreamingActive || animationPhase === 'active'
  const shouldShowContent = isVisible || displayText || isStreamingActive

  if (!shouldShowContent) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'unified-live-streaming-display transition-all duration-300 ease-in-out',
        {
          'scale-95 opacity-0': animationPhase === 'entering' && enableAnimations,
          'scale-100 opacity-100': isExpanded,
          'scale-98 opacity-80': animationPhase === 'exiting' && enableAnimations,
          'transform-gpu': enableAnimations // Enable GPU acceleration
        },
        className
      )}
      role="region"
      aria-label="Live transcription display"
      aria-live={accessibilityConfig.announceChanges ? 'polite' : 'off'}
      data-testid="unified-live-streaming-display"
      data-variant={variant}
    >
      <GlassBox
        variant="light"
        cornerRadius={16}
        className={cn(
          'live-streaming-container relative overflow-hidden',
          'focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2',
          'border transition-all duration-500',
          // Responsive classes
          'w-full max-w-full',
          'min-h-[80px] sm:min-h-[100px] md:min-h-[120px]',
          {
            'border-blue-400/40 shadow-lg shadow-blue-400/20':
              isCurrentlyActive && enableAnimations,
            'border-green-400/30 shadow-md shadow-green-400/10':
              animationPhase === 'completing' && enableAnimations,
            'border-gray-300/20': !enableAnimations || animationPhase === 'idle'
          }
        )}
        style={{
          maxHeight: isExpanded ? (displayText ? '400px' : '120px') : '80px',
          background:
            isCurrentlyActive && enableAnimations
              ? `linear-gradient(135deg, ${sourceInfo.color}08 0%, ${sourceInfo.color}03 100%)`
              : animationPhase === 'completing'
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 100%)'
                : 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
        }}
      >
        {/* Animated border effect */}
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
        <div
          className={cn(
            'flex items-center justify-between p-3 pb-2',
            // Responsive header layout
            'flex-col space-y-2 sm:flex-row sm:space-y-0'
          )}
        >
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Status indicator */}
            <TranscriptionStatusIndicator
              isConnected={true}
              isTranscribing={isCurrentlyActive}
              isProcessing={animationPhase === 'entering'}
              isPaused={false}
              confidence={confidence}
              animated={enableAnimations}
              compact={true}
              showConfidence={showConfidenceScore}
              accessibilityEnabled={accessibilityConfig.enabled}
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
                <span aria-hidden="true">{sourceInfo.icon}</span>
                <span>{sourceInfo.label}</span>
              </div>
            )}
          </div>

          {/* Actions and info */}
          <div className="flex items-center space-x-2">
            {/* Confidence score */}
            {showConfidenceScore && confidence !== undefined && confidence > 0 && (
              <div className="flex items-center space-x-1">
                <div
                  className={cn(
                    'rounded border px-2 py-1 text-xs backdrop-blur-sm',
                    'transition-all duration-300'
                  )}
                  style={{
                    backgroundColor:
                      confidence >= 0.8
                        ? 'rgba(16, 185, 129, 0.1)'
                        : confidence >= 0.6
                          ? 'rgba(59, 130, 246, 0.1)'
                          : 'rgba(239, 68, 68, 0.1)',
                    borderColor:
                      confidence >= 0.8
                        ? 'rgba(16, 185, 129, 0.3)'
                        : confidence >= 0.6
                          ? 'rgba(59, 130, 246, 0.3)'
                          : 'rgba(239, 68, 68, 0.3)',
                    color: confidence >= 0.8 ? '#10b981' : confidence >= 0.6 ? '#3b82f6' : '#ef4444'
                  }}
                  title={`Confidence: ${Math.round(confidence * 100)}%`}
                >
                  <span className="font-medium">{Math.round(confidence * 100)}%</span>
                </div>
              </div>
            )}

            {/* Character count for long transcriptions */}
            {displayText && displayText.length > 100 && (
              <div
                className="rounded border px-2 py-1 text-xs backdrop-blur-sm"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  color: '#3b82f6'
                }}
                title="Character count"
              >
                {displayText.length}
              </div>
            )}

            {/* Clear button */}
            {onClearStreaming && displayText && (
              <button
                onClick={onClearStreaming}
                className={cn(
                  'rounded p-1 transition-all duration-200',
                  'hover:bg-white/10 focus:bg-white/10',
                  'focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:outline-none'
                )}
                style={{color: 'var(--text-muted)'}}
                aria-label="Clear streaming transcription"
                title="Clear streaming transcription (Ctrl+Esc)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="px-3 pb-3">
          <div
            className={cn(
              'flex min-h-[40px] items-start justify-start',
              'rounded-lg p-3 transition-all duration-300',
              'border border-white/10 bg-white/5',
              // Responsive text sizing
              'text-sm sm:text-base',
              {
                'border-green-500/20 bg-green-500/10': animationPhase === 'completing'
              }
            )}
          >
            {displayText ? (
              <div className="w-full space-y-2">
                {/* Main text display */}
                {accessibilityConfig.enabled ? (
                  <AccessibleStreamingText
                    text={displayText}
                    isPartial={isStreamingPartial}
                    mode={streamingMode}
                    showCursor={isCurrentlyActive}
                    highlightCorrections={true}
                    ariaLabel="Live streaming transcription"
                    announceChanges={accessibilityConfig.announceChanges}
                    announcementPriority={accessibilityConfig.announcementPriority}
                    enableKeyboardControls={accessibilityConfig.enableKeyboardControls}
                    verboseStatus={accessibilityConfig.verboseStatus}
                    className="leading-relaxed text-white/90"
                  />
                ) : (
                  <StreamingTextRenderer
                    text={displayText}
                    isPartial={isStreamingPartial}
                    mode={streamingMode}
                    showCursor={isCurrentlyActive}
                    highlightCorrections={true}
                    enableTypewriterEffects={enableAnimations}
                    className="leading-relaxed text-white/90"
                  />
                )}
              </div>
            ) : (
              // Empty state
              <div className="flex w-full items-center justify-center py-2">
                <div className="flex items-center space-x-2 text-sm text-white/50">
                  {isStreamingActive || isRecording ? (
                    <>
                      <div className="animate-pulse">●</div>
                      <span>Waiting for transcription...</span>
                    </>
                  ) : (
                    <span>No transcription data</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        {enableAnimations && isCurrentlyActive && (
          <div className="absolute right-0 bottom-0 left-0 h-0.5 overflow-hidden rounded-b-[16px]">
            <div
              className="h-full opacity-60"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${sourceInfo.color} 50%, transparent 100%)`,
                animation: 'progress-shimmer 2s ease-in-out infinite'
              }}
            />
          </div>
        )}
      </GlassBox>
    </div>
  )
}

export default React.memo(UnifiedLiveStreamingDisplay)
