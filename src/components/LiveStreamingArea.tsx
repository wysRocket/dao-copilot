/**
 * LiveStreamingArea - Dedicated component for live streaming transcription display
 *
 * This component provides a visually separated area for live streaming transcriptions
 * with distinct styling, animations, and status indicators.
 */

import React, {useEffect, useState, useRef} from 'react'
import {cn} from '../utils/tailwind'
import GlassBox from './GlassBox'
import StreamingTextRenderer from './StreamingTextRenderer'
import AccessibleStreamingText from './AccessibleStreamingText'
import TranscriptionStatusIndicator from './TranscriptionStatusIndicator'

export interface LiveStreamingAreaProps {
  // Streaming content
  streamingText: string
  isStreamingActive: boolean
  isStreamingPartial: boolean
  streamingMode: 'character' | 'word' | 'instant'

  // Source information
  streamingSource?: string
  confidence?: number

  // Callbacks
  onStreamingComplete?: () => void
  onClearStreaming?: () => void

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
  showSourceBadge?: boolean
  showConfidenceScore?: boolean
  animate?: boolean
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

const LiveStreamingArea: React.FC<LiveStreamingAreaProps> = ({
  streamingText,
  isStreamingActive,
  isStreamingPartial,
  streamingMode,
  streamingSource = 'unknown',
  confidence,
  onStreamingComplete,
  onClearStreaming,
  accessibilityConfig = {
    enabled: true,
    announceChanges: true,
    verboseStatus: false,
    enableKeyboardControls: true,
    announcementPriority: 'medium'
  },
  className,
  showSourceBadge = true,
  showConfidenceScore = true,
  animate = true
}) => {
  const [isVisible, setIsVisible] = useState(!!streamingText || isStreamingActive)
  const [isExpanded, setIsExpanded] = useState(!!streamingText || isStreamingActive)
  const containerRef = useRef<HTMLDivElement>(null)
  const [animationPhase, setAnimationPhase] = useState<
    'entering' | 'active' | 'completing' | 'exiting'
  >('entering')

  // Get source display information
  const sourceInfo = SOURCE_DISPLAY_MAP[streamingSource] || SOURCE_DISPLAY_MAP.unknown

  // Handle visibility based on streaming state
  useEffect(() => {
    if (isStreamingActive) {
      setIsVisible(true)
      setAnimationPhase('entering')
      setTimeout(() => {
        setIsExpanded(true)
        setAnimationPhase('active')
      }, 400) // Wait for entering animation to complete
    } else if (isVisible && streamingText) {
      // Start completion sequence
      setAnimationPhase('completing')
      setTimeout(() => {
        setAnimationPhase('exiting')
        setTimeout(() => {
          setIsExpanded(false)
          setIsVisible(false)
          onStreamingComplete?.()
        }, 600) // Wait for exiting animation to complete
      }, 2000) // Show completed state for 2 seconds
    }
  }, [isStreamingActive, isVisible, streamingText, onStreamingComplete])

  // Handle streaming completion with enhanced animation
  const handleStreamingComplete = () => {
    if (animationPhase === 'active') {
      setAnimationPhase('completing')
      // Announce completion to screen reader
      if (accessibilityConfig.announceChanges) {
        const announcement = `Transcription completed: ${streamingText.slice(0, 50)}${streamingText.length > 50 ? '...' : ''}`
        // This would need to be connected to the accessibility manager
        console.log('Accessibility announcement:', announcement)
      }
    }
  }

  // Don't render if not visible and no streaming text
  if (!isVisible && !streamingText) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'live-streaming-area transition-all duration-300 ease-in-out',
        {
          'scale-95 transform opacity-0': !isExpanded && animationPhase === 'entering',
          'scale-100 transform opacity-100': isExpanded && animationPhase === 'active',
          'streaming-entering': animationPhase === 'entering' && animate,
          'streaming-completing': animationPhase === 'completing' && animate,
          'streaming-exiting': animationPhase === 'exiting' && animate
        },
        className
      )}
      role="region"
      aria-label="Live transcription area"
      aria-live={accessibilityConfig.announceChanges ? 'polite' : 'off'}
    >
      <GlassBox
        variant="light"
        cornerRadius={16}
        className={cn(
          'live-streaming-container glass-enhanced relative overflow-hidden',
          'focus-visible-enhanced border transition-all duration-500',
          {
            'streaming-header-mobile': true, // Responsive class
            'border-blue-400/40 shadow-lg shadow-blue-400/20':
              animationPhase === 'active' && animate,
            'border-green-400/40 shadow-lg shadow-green-400/20':
              animationPhase === 'completing' && animate,
            'border-gray-300/20 shadow-none': !animate || animationPhase === 'exiting'
          }
        )}
        style={{
          minHeight: '120px',
          maxHeight: isExpanded ? '200px' : '60px',
          background:
            animationPhase === 'completing'
              ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%)'
              : animationPhase === 'active'
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%)'
                : 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
        }}
      >
        {/* Animated border effect */}
        {animate && animationPhase === 'active' && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 rounded-[16px] opacity-50"
              style={{
                background: `linear-gradient(45deg, transparent 30%, ${sourceInfo.color}40 50%, transparent 70%)`,
                animation: 'shimmer 2s ease-in-out infinite'
              }}
            />
          </div>
        )}

        {/* Header with status and source info */}
        <div
          className={cn(
            'flex items-center justify-between p-3 pb-2',
            'sm:flex-col sm:items-start sm:space-y-2 sm:space-x-0 md:flex-row',
            'streaming-header-mobile'
          )}
        >
          <div className="flex flex-wrap items-center space-x-3">
            {/* Enhanced status indicator */}
            <TranscriptionStatusIndicator
              isConnected={true}
              isTranscribing={animationPhase === 'active'}
              isProcessing={animationPhase === 'entering'}
              isPaused={false}
              confidence={confidence}
              animated={animate}
              compact={true}
              showConfidence={showConfidenceScore}
              accessibilityEnabled={accessibilityConfig.enabled}
            />

            {/* Source badge */}
            {showSourceBadge && (
              <div
                className="flex items-center space-x-1 rounded-full px-2 py-1 text-xs font-medium backdrop-blur-sm"
                style={{
                  backgroundColor: `${sourceInfo.color}20`,
                  color: sourceInfo.color,
                  border: `1px solid ${sourceInfo.color}40`
                }}
              >
                <span aria-hidden="true">{sourceInfo.icon}</span>
                <span>{sourceInfo.label}</span>
              </div>
            )}
          </div>

          {/* Actions and info */}
          <div
            className={cn(
              'flex items-center space-x-2',
              'sm:w-full sm:justify-between md:w-auto md:justify-end'
            )}
          >
            {/* Enhanced confidence score */}
            {showConfidenceScore && confidence !== undefined && confidence > 0 && (
              <div className={cn('flex items-center space-x-1', 'streaming-confidence-mobile')}>
                <div
                  className={cn(
                    'rounded border px-2 py-1 text-xs backdrop-blur-sm transition-all duration-300',
                    'glass-button focus-visible-enhanced'
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
                  title={`Confidence: ${Math.round(confidence * 100)}% - ${
                    confidence >= 0.8 ? 'Excellent' : confidence >= 0.6 ? 'Good' : 'Poor'
                  }`}
                >
                  <span className="font-medium">{Math.round(confidence * 100)}%</span>
                  <span className="ml-1 text-xs opacity-75">
                    {confidence >= 0.8 ? '●●●' : confidence >= 0.6 ? '●●○' : '●○○'}
                  </span>
                </div>
              </div>
            )}

            {/* Activity indicator for long transcriptions */}
            {streamingText && streamingText.length > 100 && animationPhase === 'active' && (
              <div
                className="animate-pulse rounded border px-2 py-1 text-xs backdrop-blur-sm"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  color: '#3b82f6'
                }}
                title="Long transcription in progress"
              >
                <span className="font-medium">{streamingText.length}</span>
                <span className="ml-1 opacity-75">chars</span>
              </div>
            )}

            {/* Clear button */}
            {onClearStreaming && (
              <button
                onClick={onClearStreaming}
                className={cn(
                  'glass-button focus-visible-enhanced rounded p-1',
                  'transition-all duration-200 hover:scale-110'
                )}
                style={{color: 'var(--text-muted)'}}
                aria-label="Clear streaming transcription"
                title="Clear streaming transcription"
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

        {/* Streaming content area */}
        <div className={cn('px-3 pb-3', 'streaming-content-mobile')}>
          <div
            className={cn(
              'flex min-h-[60px] items-start justify-start transition-all duration-500',
              'glass-enhanced rounded-lg p-3',
              {
                'streaming-text-completing': animationPhase === 'completing' && animate
              }
            )}
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            {streamingText ? (
              accessibilityConfig.enabled ? (
                <AccessibleStreamingText
                  text={streamingText}
                  isPartial={isStreamingPartial}
                  mode={streamingMode}
                  onAnimationComplete={handleStreamingComplete}
                  showCursor={true}
                  highlightCorrections={true}
                  ariaLabel="Live streaming transcription"
                  announceChanges={accessibilityConfig.announceChanges}
                  announcementPriority={accessibilityConfig.announcementPriority}
                  enableKeyboardControls={accessibilityConfig.enableKeyboardControls}
                  verboseStatus={accessibilityConfig.verboseStatus}
                  partialStyle={{
                    color: 'var(--text-secondary)',
                    opacity: 0.9,
                    fontStyle: 'italic'
                  }}
                  finalStyle={{
                    color: 'var(--text-primary)',
                    opacity: 1,
                    fontWeight: '500'
                  }}
                  correctionStyle={{
                    backgroundColor: 'rgba(255, 215, 0, 0.3)',
                    borderRadius: '3px',
                    padding: '2px 4px',
                    boxShadow: '0 0 8px rgba(255, 215, 0, 0.4)'
                  }}
                />
              ) : (
                <StreamingTextRenderer
                  text={streamingText}
                  isPartial={isStreamingPartial}
                  mode={streamingMode}
                  onAnimationComplete={handleStreamingComplete}
                  showCursor={true}
                  highlightCorrections={true}
                  enableTypewriterEffects={true}
                  partialStyle={{
                    color: 'var(--text-secondary)',
                    opacity: 0.9,
                    fontStyle: 'italic'
                  }}
                  finalStyle={{
                    color: 'var(--text-primary)',
                    opacity: 1,
                    fontWeight: '500'
                  }}
                  correctionStyle={{
                    backgroundColor: 'rgba(255, 215, 0, 0.3)',
                    borderRadius: '3px',
                    padding: '2px 4px',
                    boxShadow: '0 0 8px rgba(255, 215, 0, 0.4)'
                  }}
                />
              )
            ) : (
              <div className="flex items-center text-sm" style={{color: 'var(--text-muted)'}}>
                <div className="mr-2 animate-pulse">●</div>
                Waiting for transcription...
              </div>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        {animate && animationPhase === 'active' && (
          <div className="absolute right-0 bottom-0 left-0 h-0.5 overflow-hidden rounded-b-[16px]">
            <div className="streaming-progress-bar h-full" />
          </div>
        )}
      </GlassBox>
    </div>
  )
}

export default LiveStreamingArea
