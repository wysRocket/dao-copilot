import React, {useEffect, useRef, useCallback, useMemo} from 'react'

// Local hooks and utilities
import {cn} from '../utils/tailwind'
import {useTypewriterEffect, TypewriterConfig} from '../hooks/useTypewriterEffect'
import {
  optimizeForAnimations,
  removeAnimationOptimizations,
  IntersectionObserverManager
} from '../utils/performance-optimization'

// Components and contexts
import {
  StreamingStateIndicator,
  useStreamingStateManager,
  type StreamingState
} from './StreamingStateIndicator'

// Styles
import '../styles/streaming-text-renderer.css'

/**
 * Streaming text renderer modes
 */
export type StreamingMode = 'character' | 'word' | 'instant'

/**
 * Props for the StreamingTextRenderer component
 */
export interface StreamingTextRendererProps {
  /** The text content to display */
  text: string
  /** Whether the text is partial (still being updated) */
  isPartial?: boolean
  /** Animation mode for text rendering */
  mode?: StreamingMode
  /** Animation speed in characters per second (character mode) or words per second (word mode) */
  animationSpeed?: number
  /** Additional CSS classes */
  className?: string
  /** Callback when animation completes */
  onAnimationComplete?: () => void
  /** Callback when text is updated */
  onTextUpdate?: (text: string, isPartial: boolean) => void
  /** Whether to show a blinking cursor during animation */
  showCursor?: boolean
  /** Whether to enable text formatting (bold, italic, etc.) */
  enableFormatting?: boolean
  /** Whether to highlight corrections */
  highlightCorrections?: boolean
  /** Whether to enable advanced typewriter effects */
  enableTypewriterEffects?: boolean
  /** Configuration for typewriter effects */
  typewriterConfig?: TypewriterConfig
  /** Whether to enable sound effects */
  enableSounds?: boolean
  /** Custom cursor character */
  cursorChar?: string
  /** Show streaming state indicator */
  showStateIndicator?: boolean
  /** Custom streaming state (overrides automatic detection) */
  customState?: StreamingState
  /** Callback when state changes */
  onStateChange?: (state: StreamingState) => void
  /** Custom styling for different text states */
  partialStyle?: React.CSSProperties
  finalStyle?: React.CSSProperties
  correctionStyle?: React.CSSProperties
}

/**
 * StreamingTextRenderer component that handles character-by-character and word-by-word
 * streaming with configurable animation modes and visual effects.
 */
export const StreamingTextRenderer: React.FC<StreamingTextRendererProps> = ({
  text,
  isPartial = false,
  animationSpeed = 30,
  className,
  onAnimationComplete,
  onTextUpdate,
  showCursor = true,
  enableFormatting = false,
  highlightCorrections = true,
  enableTypewriterEffects = false,
  typewriterConfig = {},
  enableSounds = false,
  cursorChar = '|',
  showStateIndicator = false,
  customState,
  onStateChange,
  partialStyle,
  finalStyle,
  correctionStyle
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const isVisibleRef = useRef<boolean>(true)
  const intersectionObserverRef = useRef<IntersectionObserverManager | null>(null)

  // Use props directly - no context dependency needed
  const currentStreamingText = text || ''
  const isCurrentTextPartial = isPartial
  const isStreamingActive = !!text && text.trim().length > 0

  // Map context state to expected interface for compatibility
  // PRIORITY: Use context text if it has real content, then prop text, then fallback
  const hasRealContextText =
    currentStreamingText &&
    currentStreamingText.length > 3 &&
    !currentStreamingText.includes('Live streaming active') &&
    !currentStreamingText.includes('...') &&
    currentStreamingText.trim().length > 0

  const hasRealPropText =
    text &&
    text.length > 3 &&
    !text.includes('Live streaming active') &&
    !text.includes('...') &&
    text.trim().length > 0

  // Prioritize real content from context first, then props
  const effectiveDisplayText = hasRealContextText
    ? currentStreamingText
    : hasRealPropText
      ? text
      : currentStreamingText || text || ''

  const streamingState = {
    displayedText: effectiveDisplayText,
    targetText: text,
    isPartial: isCurrentTextPartial !== undefined ? isCurrentTextPartial : isPartial,
    isAnimating: isStreamingActive,
    hasCorrection: false, // Context doesn't track corrections yet
    connectionState: (isStreamingActive ? 'connected' : 'disconnected') as
      | 'connected'
      | 'disconnected'
      | 'connecting'
      | 'error'
  }

  // Memoized streaming controls to prevent recreation on every render
  const streamingControls = useMemo(
    () => ({
      updateText: (newText: string, partial: boolean = false) => {
        // Functionality moved to parent component via props
        onTextUpdate?.(newText, partial)
      },
      clearText: () => {
        // Functionality moved to parent component
        onAnimationComplete?.()
      },
      completeAnimation: () => {
        // Functionality moved to parent component
        onAnimationComplete?.()
      }
    }),
    [onTextUpdate, onAnimationComplete]
  )

  // Memoized typewriter configuration
  const memoizedTypewriterConfig = useMemo(
    () => ({
      speed: animationSpeed,
      showCursor: false, // We'll handle cursor separately
      pauseAtPunctuation: true,
      variableSpeed: true,
      enableSounds: enableSounds,
      ...typewriterConfig
    }),
    [animationSpeed, enableSounds, typewriterConfig]
  )

  // Use typewriter effects for enhanced animation
  const typewriterState = useTypewriterEffect(
    enableTypewriterEffects ? streamingState.displayedText : '',
    memoizedTypewriterConfig
  )

  // Manage streaming state indicators
  const stateManager = useStreamingStateManager()

  // Memoized current state calculation
  const currentState = useMemo(() => {
    if (customState) return customState

    if (streamingState.connectionState === 'disconnected') return 'disconnected'
    if (streamingState.connectionState === 'connecting') return 'connecting'
    if (streamingState.connectionState === 'error') return 'error'
    if (streamingState.isAnimating) return 'receiving'
    if (streamingState.hasCorrection) return 'processing'
    if (streamingState.isPartial) return 'processing'
    if (streamingState.displayedText.length > 0) return 'complete'
    return 'listening'
  }, [customState, streamingState])

  // Setup intersection observer for performance optimization
  useEffect(() => {
    if (!containerRef.current) return

    intersectionObserverRef.current = new IntersectionObserverManager({
      threshold: 0.1,
      rootMargin: '50px'
    })

    intersectionObserverRef.current.observe(containerRef.current, isVisible => {
      isVisibleRef.current = isVisible

      // Optimize animations when not visible
      if (!isVisible && containerRef.current) {
        removeAnimationOptimizations(containerRef.current)
      } else if (isVisible && containerRef.current) {
        optimizeForAnimations(containerRef.current)
      }
    })

    return () => {
      intersectionObserverRef.current?.disconnect()
    }
  }, [])

  // Update state manager when state changes
  useEffect(() => {
    stateManager.updateState(currentState)
    onStateChange?.(currentState)
  }, [currentState, stateManager, onStateChange])

  // Update text when props change
  useEffect(() => {
    streamingControls.updateText(text, isPartial)
  }, [text, isPartial, streamingControls])

  /**
   * Get the text to display based on mode and typewriter effects
   * Memoized for performance optimization
   */
  const displayText = useMemo(() => {
    // Use typewriter effects if enabled
    if (enableTypewriterEffects && typewriterState) {
      return typewriterState.displayedText
    }

    // For non-typewriter modes, just return the displayed text
    // The streaming hook handles the animation internally
    return streamingState.displayedText
  }, [streamingState.displayedText, enableTypewriterEffects, typewriterState])

  /**
   * Process text for formatting if enabled
   * Memoized to avoid re-processing on every render
   */
  const processedText = useMemo((): React.ReactNode => {
    if (!enableFormatting) {
      return displayText
    }

    // Simple markdown-like formatting
    const segments: React.ReactNode[] = []
    let currentIndex = 0

    // Bold formatting **text**
    const boldRegex = /\*\*(.*?)\*\*/g
    let boldMatch

    while ((boldMatch = boldRegex.exec(displayText)) !== null) {
      // Add text before the match
      if (boldMatch.index > currentIndex) {
        segments.push(displayText.slice(currentIndex, boldMatch.index))
      }

      // Add bold text
      segments.push(<strong key={`bold-${boldMatch.index}`}>{boldMatch[1]}</strong>)

      currentIndex = boldMatch.index + boldMatch[0].length
    }

    // Add remaining text
    if (currentIndex < displayText.length) {
      segments.push(displayText.slice(currentIndex))
    }

    return segments.length > 0 ? segments : displayText
  }, [enableFormatting, displayText])

  /**
   * Get appropriate styles based on text state
   */
  const getTextStyles = useCallback((): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      transition: 'all 0.3s ease',
      wordWrap: 'break-word',
      whiteSpace: 'pre-wrap'
    }

    if (streamingState.hasCorrection && highlightCorrections) {
      return {
        ...baseStyles,
        ...correctionStyle,
        animation: 'flash-highlight 0.5s ease-out'
      }
    }

    if (streamingState.isPartial) {
      return {
        ...baseStyles,
        ...partialStyle
      }
    }

    return {
      ...baseStyles,
      ...finalStyle
    }
  }, [
    streamingState.hasCorrection,
    streamingState.isPartial,
    highlightCorrections,
    correctionStyle,
    partialStyle,
    finalStyle
  ])

  /**
   * Get CSS classes for text state
   */
  const getTextClasses = useCallback((): string => {
    const classes = ['streaming-text-content']

    if (streamingState.hasCorrection && highlightCorrections) {
      classes.push('streaming-text-correction')
    } else if (streamingState.isPartial) {
      classes.push('streaming-text-partial')
      if (streamingState.isAnimating) {
        classes.push('active')
      }
    } else if (streamingState.displayedText.length > 0) {
      classes.push('streaming-text-final')
    }

    return classes.join(' ')
  }, [
    streamingState.hasCorrection,
    streamingState.isPartial,
    streamingState.isAnimating,
    streamingState.displayedText.length,
    highlightCorrections
  ])

  /**
   * Render the animated cursor
   */
  const renderCursor = useCallback((): React.ReactNode => {
    if (!showCursor || !streamingState.isAnimating) {
      return null
    }

    return (
      <span
        className="streaming-cursor"
        style={{
          animation: 'blink 1s linear infinite',
          color: 'var(--text-accent)',
          marginLeft: '1px'
        }}
      >
        {cursorChar}
      </span>
    )
  }, [showCursor, streamingState.isAnimating, cursorChar])

  /**
   * Handle keyboard accessibility
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' && streamingState.isAnimating) {
        streamingControls.completeAnimation()
      }
    },
    [streamingState.isAnimating, streamingControls]
  )

  // Get the text to display and process formatting
  const textStyles = getTextStyles()
  const textClasses = getTextClasses()

  return (
    <div
      ref={containerRef}
      className={cn('streaming-text-renderer', 'relative inline-block w-full', className)}
      style={textStyles}
      role="log"
      aria-live={streamingState.isPartial ? 'polite' : 'off'}
      aria-label="Streaming text content"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Streaming state indicator */}
      {showStateIndicator && (
        <div className="streaming-state-container mb-2">
          <StreamingStateIndicator
            state={stateManager.state}
            connectionQuality={stateManager.connectionQuality}
            message={stateManager.message}
            size="small"
          />
        </div>
      )}

      {/* Status indicator for partial/final state */}
      {streamingState.displayedText.length > 0 && (
        <div className="mb-2">
          <div
            className={cn(
              'transcript-status-indicator',
              streamingState.isPartial ? 'transcript-status-partial' : 'transcript-status-final'
            )}
          >
            <div className="status-dot" aria-hidden="true" />
            <span>{streamingState.isPartial ? 'Live' : 'Complete'}</span>
          </div>
        </div>
      )}

      {/* Main text content */}
      <span className={textClasses}>
        {processedText}
        {/* Show typewriter cursor if enabled and active */}
        {enableTypewriterEffects && typewriterState?.showCursor && (
          <span
            className="typewriter-cursor"
            style={{
              borderRight: '2px solid currentColor',
              marginLeft: '1px',
              animation: 'blink 1s infinite'
            }}
          >
            |
          </span>
        )}
      </span>

      {/* Animated cursor */}
      {renderCursor()}

      {/* Screen reader announcements */}
      <span className="sr-only" aria-live="polite">
        {streamingState.isPartial ? 'Receiving text...' : 'Text complete'}
      </span>
    </div>
  )
}

/**
 * Memoized version of StreamingTextRenderer for performance optimization
 */
export const MemoizedStreamingTextRenderer = React.memo(StreamingTextRenderer)

export default StreamingTextRenderer
