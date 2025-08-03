/**
 * Optimized Streaming Text Renderer
 * High-performance component for real-time transcription display with minimal re-renders
 */

import React, {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  memo,
  useState
} from 'react'
import {cn} from '../utils/tailwind'

export interface OptimizedStreamingRendererProps {
  /** The text content to display */
  text: string
  /** Whether the text is partial (still being updated) */
  isPartial?: boolean
  /** Whether to show streaming animations */
  enableAnimations?: boolean
  /** Custom CSS classes */
  className?: string
  /** Callback when text updates complete */
  onUpdateComplete?: (text: string) => void
  /** Whether to show a blinking cursor */
  showCursor?: boolean
  /** Animation speed for text updates (ms per character) */
  animationSpeed?: number
  /** Maximum text length to prevent performance issues */
  maxLength?: number
  /** Whether to enable virtual scrolling for long text */
  enableVirtualScrolling?: boolean
  /** Language hint for proper text rendering */
  language?: string
  /** Custom styling for different states */
  styles?: {
    partial?: React.CSSProperties
    final?: React.CSSProperties
    container?: React.CSSProperties
  }
}

/**
 * Text chunk for optimized rendering
 */
interface TextChunk {
  id: string
  content: string
  isNew: boolean
  timestamp: number
}

/**
 * Performance monitoring hook
 */
const usePerformanceMonitor = (componentName: string) => {
  const renderCountRef = useRef(0)
  const lastRenderTimeRef = useRef(Date.now())
  
  useEffect(() => {
    renderCountRef.current++
    const now = Date.now()
    const timeSinceLastRender = now - lastRenderTimeRef.current
    lastRenderTimeRef.current = now
    
    // Log performance warnings for excessive re-renders
    if (renderCountRef.current > 10 && timeSinceLastRender < 100) {
      console.warn(`${componentName}: High frequency re-renders detected`, {
        renderCount: renderCountRef.current,
        timeSinceLastRender
      })
    }
  })
  
  return {
    renderCount: renderCountRef.current,
    resetCount: () => { renderCountRef.current = 0 }
  }
}

/**
 * Optimized text chunking for minimal DOM updates
 */
const useTextChunking = (text: string, maxChunkSize: number = 50) => {
  return useMemo(() => {
    if (!text) return []
    
    const chunks: TextChunk[] = []
    let currentIndex = 0
    let chunkId = 0
    
    while (currentIndex < text.length) {
      const chunkEnd = Math.min(currentIndex + maxChunkSize, text.length)
      const chunkContent = text.slice(currentIndex, chunkEnd)
      
      chunks.push({
        id: `chunk-${chunkId}`,
        content: chunkContent,
        isNew: false, // Will be managed by parent component
        timestamp: Date.now()
      })
      
      currentIndex = chunkEnd
      chunkId++
    }
    
    return chunks
  }, [text, maxChunkSize])
}

/**
 * Props for streaming cursor component
 */
interface StreamingCursorProps {
  show: boolean
  isAnimated: boolean
  character?: string
  color?: string
}

/**
 * Props for text chunk renderer
 */
interface TextChunkRendererProps {
  chunk: TextChunk
  isPartial: boolean
  styles?: React.CSSProperties
  language?: string
  className?: string
}

/**
 * Optimized streaming cursor component
 */
// eslint-disable-next-line react/prop-types
const StreamingCursor = memo<StreamingCursorProps>(({ show, isAnimated, character = '|', color = 'currentColor' }) => {
  if (!show) return null
  
  return (
    <span
      className={cn(
        'streaming-cursor inline-block',
        isAnimated ? 'animate-pulse' : ''
      )}
      style={{
        color,
        marginLeft: '1px',
        animation: isAnimated ? 'cursor-blink 1s infinite' : 'none'
      }}
      aria-hidden="true"
    >
      {character}
    </span>
  )
})

StreamingCursor.displayName = 'StreamingCursor'

/**
 * Memoized text chunk component
 */
/* eslint-disable react/prop-types */
const TextChunkRenderer = memo<TextChunkRendererProps>(({ chunk, isPartial, styles, language, className }) => {
  return (
    <span
      key={chunk.id}
      className={cn('text-chunk', isPartial ? 'partial' : 'final', className)}
      style={styles}
      lang={language}
      data-chunk-id={chunk.id}
    >
      {chunk.content}
    </span>
  )
})
/* eslint-enable react/prop-types */

TextChunkRenderer.displayName = 'TextChunkRenderer'

/**
 * Main optimized streaming renderer component
 */
export const OptimizedStreamingRenderer: React.FC<OptimizedStreamingRendererProps> = ({
  text,
  isPartial = false,
  enableAnimations = true,
  className,
  onUpdateComplete,
  showCursor = true,
  animationSpeed = 50,
  maxLength = 10000,
  enableVirtualScrolling = false,
  language,
  styles = {}
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousTextRef = useRef('')
  const [displayedText, setDisplayedText] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const performanceMonitor = usePerformanceMonitor('OptimizedStreamingRenderer')
  
  // Memoized text chunks for efficient rendering
  const textChunks = useTextChunking(displayedText)
  
  // Truncate text if it exceeds max length
  const truncatedText = useMemo(() => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }, [text, maxLength])
  
  // Optimized text update animation
  const animateTextUpdate = useCallback(() => {
    const targetText = truncatedText
    const currentText = displayedText
    
    if (currentText === targetText) {
      setIsAnimating(false)
      onUpdateComplete?.(targetText)
      return
    }
    
    if (!enableAnimations) {
      setDisplayedText(targetText)
      setIsAnimating(false)
      onUpdateComplete?.(targetText)
      return
    }
    
    // Animate character by character for smooth streaming effect
    const nextLength = Math.min(currentText.length + 1, targetText.length)
    const nextText = targetText.slice(0, nextLength)
    
    setDisplayedText(nextText)
    
    if (nextText !== targetText) {
      setIsAnimating(true)
      animationFrameRef.current = requestAnimationFrame(() => {
        setTimeout(animateTextUpdate, animationSpeed)
      })
    } else {
      setIsAnimating(false)
      onUpdateComplete?.(targetText)
    }
  }, [truncatedText, displayedText, enableAnimations, animationSpeed, onUpdateComplete])
  
  // Update displayed text when input text changes
  useEffect(() => {
    if (previousTextRef.current !== truncatedText) {
      previousTextRef.current = truncatedText
      
      // Cancel any ongoing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      
      // Start new animation or update immediately
      animateTextUpdate()
    }
  }, [truncatedText, animateTextUpdate])
  
  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])
  
  // Optimized style computation
  const containerStyles = useMemo((): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      wordWrap: 'break-word',
      whiteSpace: 'pre-wrap',
      lineHeight: '1.5',
      transition: enableAnimations ? 'opacity 0.3s ease' : 'none',
      ...styles.container
    }
    
    if (isPartial) {
      return {
        ...baseStyles,
        opacity: 0.9,
        fontStyle: 'italic',
        color: 'var(--text-secondary)',
        ...styles.partial
      }
    }
    
    return {
      ...baseStyles,
      opacity: 1,
      color: 'var(--text-primary)',
      ...styles.final
    }
  }, [isPartial, enableAnimations, styles])
  
  // Memoized accessibility attributes
  const accessibilityProps = useMemo(() => ({
    role: 'log' as const,
    'aria-live': (isPartial ? 'polite' : 'off') as 'polite' | 'off',
    'aria-label': 'Streaming transcription text',
    'aria-busy': isAnimating
  }), [isPartial, isAnimating])
  
  // Render text chunks or simple text based on length
  const renderContent = useCallback(() => {
    if (enableVirtualScrolling && textChunks.length > 20) {
      // For very long text, use virtual scrolling
      const visibleChunks = textChunks.slice(-20) // Show last 20 chunks
      
      return (
        <>
          {visibleChunks.length < textChunks.length && (
            <div 
              className="text-truncation-indicator text-xs opacity-50 mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              ... ({textChunks.length - visibleChunks.length} more chunks)
            </div>
          )}
          {visibleChunks.map(chunk => (
            <TextChunkRenderer
              key={chunk.id}
              chunk={chunk}
              isPartial={isPartial}
              language={language}
            />
          ))}
        </>
      )
    }
    
    // For normal text length, render directly for better performance
    return displayedText
  }, [displayedText, textChunks, enableVirtualScrolling, isPartial, language])
  
  return (
    <div
      ref={containerRef}
      className={cn(
        'optimized-streaming-renderer',
        'relative inline-block w-full',
        {
          'streaming-animating': isAnimating,
          'streaming-partial': isPartial,
          'streaming-final': !isPartial
        },
        className
      )}
      style={containerStyles}
      {...accessibilityProps}
    >
      {/* Main text content */}
      <span className="streaming-text-content">
        {renderContent()}
      </span>
      
      {/* Streaming cursor */}
      <StreamingCursor
        show={showCursor && (isAnimating || isPartial)}
        isAnimated={enableAnimations}
        color={isPartial ? 'var(--text-secondary)' : 'var(--text-accent)'}
      />
      
      {/* Performance debug info (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs opacity-30 absolute -bottom-4 right-0">
          Renders: {performanceMonitor.renderCount}
        </div>
      )}
      
      {/* Screen reader status */}
      <span className="sr-only" aria-live="polite">
        {isAnimating ? 'Receiving text...' : isPartial ? 'Text updated' : 'Text complete'}
      </span>
    </div>
  )
}

/**
 * Highly memoized version with shallow comparison
 */
export const MemoizedOptimizedStreamingRenderer = memo(
  OptimizedStreamingRenderer,
  (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
      prevProps.text === nextProps.text &&
      prevProps.isPartial === nextProps.isPartial &&
      prevProps.enableAnimations === nextProps.enableAnimations &&
      prevProps.showCursor === nextProps.showCursor &&
      prevProps.className === nextProps.className &&
      prevProps.language === nextProps.language
    )
  }
)

MemoizedOptimizedStreamingRenderer.displayName = 'MemoizedOptimizedStreamingRenderer'

/**
 * Hook for managing streaming text state with optimized updates
 */
export const useOptimizedStreamingText = (
  initialText: string = '',
  updateThrottleMs: number = 50
) => {
  const [text, setText] = useState(initialText)
  const [isPartial, setIsPartial] = useState(false)
  const updateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  
  const updateText = useCallback((newText: string, partial: boolean = false) => {
    // Throttle updates to prevent excessive re-renders
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }
    
    updateTimeoutRef.current = setTimeout(() => {
      setText(newText)
      setIsPartial(partial)
    }, updateThrottleMs)
  }, [updateThrottleMs])
  
  const clearText = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }
    setText('')
    setIsPartial(false)
  }, [])
  
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [])
  
  return {
    text,
    isPartial,
    updateText,
    clearText,
    setText: (newText: string) => updateText(newText, false),
    setPartialText: (newText: string) => updateText(newText, true)
  }
}

export default OptimizedStreamingRenderer
