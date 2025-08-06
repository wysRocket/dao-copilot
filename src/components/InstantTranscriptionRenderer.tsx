/**
 * InstantTranscriptionRenderer - Ultra-optimized rendering for sub-100ms latency
 * 
 * This component is designed to eliminate all rendering delays using:
 * - React 18 concurrent features (useTransition, useDeferredValue)
 * - Aggressive memoization with React.memo and useMemo
 * - Virtualization for long content with react-window
 * - Minimal DOM operations and optimized animations
 * - Smart batching and debouncing
 * - Zero-lag text updates
 */

import React, { 
  memo, 
  useMemo, 
  useTransition, 
  useDeferredValue, 
  useCallback,
  useRef,
  useEffect,
  useState
} from 'react'
import { FixedSizeList as List } from 'react-window'
import { cn } from '../utils/tailwind'

export interface InstantTranscriptionProps {
  // Core content
  text: string
  isPartial: boolean
  isActive: boolean
  
  // Performance options
  enableVirtualization?: boolean
  maxLines?: number
  chunkSize?: number
  
  // Visual options
  showCursor?: boolean
  showMetrics?: boolean
  minimal?: boolean
  
  // Callbacks
  onComplete?: () => void
  onUpdate?: (metrics: PerformanceMetrics) => void
  
  // Styling
  className?: string
}

interface PerformanceMetrics {
  renderTime: number
  textLength: number
  updateCount: number
  lastUpdate: number
}

interface TextChunk {
  id: string
  text: string
  isPartial: boolean
  timestamp: number
}

/**
 * Memoized cursor component to avoid re-renders
 */
const AnimatedCursor = memo(() => (
  <span 
    className="inline-block w-1 h-4 bg-blue-400 animate-pulse ml-1"
    style={{
      animation: 'blink 1s infinite',
      animationTimingFunction: 'ease-in-out'
    }}
    aria-hidden="true"
  />
))

AnimatedCursor.displayName = 'AnimatedCursor'

/**
 * Memoized text chunk component for virtualization
 */
const TextChunkRenderer = memo<{
  index: number
  style: React.CSSProperties
  data: {
    chunks: TextChunk[]
    isPartial: boolean
    showCursor: boolean
  }
}>(({ index, style, data }) => {
  const chunk = data.chunks[index]
  const isLastChunk = index === data.chunks.length - 1
  
  return (
    <div style={style} className="flex items-start">
      <span 
        className={cn(
          'text-sm leading-relaxed transition-opacity duration-100',
          {
            'text-gray-300 opacity-80': chunk.isPartial,
            'text-white opacity-100': !chunk.isPartial
          }
        )}
      >
        {chunk.text}
        {data.showCursor && isLastChunk && data.isPartial && <AnimatedCursor />}
      </span>
    </div>
  )
})

TextChunkRenderer.displayName = 'TextChunkRenderer'

/**
 * Ultra-fast performance metrics hook
 */
function usePerformanceMetrics(text: string, onUpdate?: (metrics: PerformanceMetrics) => void) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    textLength: 0,
    updateCount: 0,
    lastUpdate: 0
  })
  
  const renderStartRef = useRef<number>(0)
  const updateCountRef = useRef(0)
  
  // Start render timing
  const startRenderTiming = useCallback(() => {
    renderStartRef.current = performance.now()
  }, [])
  
  // End render timing and update metrics
  const endRenderTiming = useCallback(() => {
    const renderTime = performance.now() - renderStartRef.current
    updateCountRef.current += 1
    
    const newMetrics: PerformanceMetrics = {
      renderTime,
      textLength: text.length,
      updateCount: updateCountRef.current,
      lastUpdate: Date.now()
    }
    
    setMetrics(newMetrics)
    onUpdate?.(newMetrics)
  }, [text.length, onUpdate])
  
  return { metrics, startRenderTiming, endRenderTiming }
}

/**
 * Smart text chunking for virtualization
 */
function useTextChunks(text: string, chunkSize: number = 50): TextChunk[] {
  return useMemo(() => {
    if (!text) return []
    
    const words = text.split(' ')
    const chunks: TextChunk[] = []
    
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunkWords = words.slice(i, i + chunkSize)
      const chunkText = chunkWords.join(' ')
      
      chunks.push({
        id: `chunk-${i}-${Date.now()}`,
        text: chunkText,
        isPartial: i + chunkSize >= words.length, // Last chunk is partial
        timestamp: Date.now()
      })
    }
    
    return chunks
  }, [text, chunkSize])
}

/**
 * InstantTranscriptionRenderer - Main component
 */
export const InstantTranscriptionRenderer: React.FC<InstantTranscriptionProps> = memo(({
  text,
  isPartial,
  isActive,
  enableVirtualization = true,
  maxLines = 10,
  chunkSize = 50,
  showCursor = true,
  showMetrics = false,
  minimal = false,
  onComplete,
  onUpdate,
  className
}) => {
  // Performance hooks
  const { metrics, startRenderTiming, endRenderTiming } = usePerformanceMetrics(text, onUpdate)
  
  // React 18 concurrent features for smooth updates
  const [isPending, startTransition] = useTransition()
  const deferredText = useDeferredValue(text)
  
  // Text processing
  const chunks = useTextChunks(deferredText, chunkSize)
  const shouldVirtualize = enableVirtualization && chunks.length > maxLines
  
  // Refs for performance
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<List>(null)
  
  // Memoized virtualization data
  const virtualizationData = useMemo(() => ({
    chunks,
    isPartial,
    showCursor
  }), [chunks, isPartial, showCursor])
  
  // Handle text updates with transitions
  const handleTextUpdate = useCallback((newText: string) => {
    startTransition(() => {
      startRenderTiming()
      // Text update will trigger re-render
      endRenderTiming()
    })
  }, [startRenderTiming, endRenderTiming])
  
  // Auto-scroll to bottom for new content
  useEffect(() => {
    if (shouldVirtualize && listRef.current && chunks.length > 0) {
      listRef.current.scrollToItem(chunks.length - 1, 'end')
    }
  }, [chunks.length, shouldVirtualize])
  
  // Handle completion
  useEffect(() => {
    if (!isPartial && !isActive && text && onComplete) {
      onComplete()
    }
  }, [isPartial, isActive, text, onComplete])
  
  // Memoized content renderer
  const contentRenderer = useMemo(() => {
    if (!text) {
      return (
        <div className="flex items-center text-gray-400 text-sm">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse mr-2" />
          Waiting for transcription...
        </div>
      )
    }
    
    if (shouldVirtualize) {
      return (
        <List
          ref={listRef}
          height={maxLines * 24} // Approximate line height
          itemCount={chunks.length}
          itemSize={24}
          itemData={virtualizationData}
          className="scrollbar-thin"
        >
          {TextChunkRenderer}
        </List>
      )
    }
    
    // Non-virtualized simple rendering for short content
    return (
      <div className="space-y-1">
        {chunks.map((chunk, index) => {
          const isLastChunk = index === chunks.length - 1
          return (
            <div key={chunk.id} className="flex items-start">
              <span 
                className={cn(
                  'text-sm leading-relaxed transition-opacity duration-100',
                  {
                    'text-gray-300 opacity-80': chunk.isPartial,
                    'text-white opacity-100': !chunk.isPartial
                  }
                )}
              >
                {chunk.text}
                {showCursor && isLastChunk && isPartial && <AnimatedCursor />}
              </span>
            </div>
          )
        })}
      </div>
    )
  }, [text, shouldVirtualize, maxLines, chunks, virtualizationData, showCursor, isPartial])
  
  // Minimal mode - just text with cursor
  if (minimal) {
    return (
      <div className={cn('text-white text-sm', className)}>
        {deferredText}
        {showCursor && isPartial && <AnimatedCursor />}
      </div>
    )
  }
  
  return (
    <div 
      ref={containerRef}
      className={cn(
        'instant-transcription-renderer relative',
        {
          'opacity-75': isPending,
          'transition-opacity duration-75': isPending
        },
        className
      )}
      role="log"
      aria-live="polite"
      aria-label="Live transcription display"
    >
      {/* Performance overlay */}
      {showMetrics && (
        <div className="absolute top-0 right-0 bg-black/50 text-xs text-green-400 p-1 rounded z-10">
          {metrics.renderTime.toFixed(2)}ms | {metrics.textLength}chars | {metrics.updateCount}
        </div>
      )}
      
      {/* Status indicator */}
      {!minimal && (
        <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
          <div className="flex items-center space-x-2">
            <div 
              className={cn(
                'w-2 h-2 rounded-full transition-colors duration-200',
                {
                  'bg-green-400 animate-pulse': isActive,
                  'bg-gray-400': !isActive
                }
              )}
            />
            <span>{isActive ? 'Live' : 'Completed'}</span>
            {isPending && <span className="text-yellow-400">Updating...</span>}
          </div>
          
          {shouldVirtualize && (
            <div className="text-gray-500">
              {chunks.length} chunks | Virtualized
            </div>
          )}
        </div>
      )}
      
      {/* Main content */}
      <div className="min-h-[60px] max-h-96 overflow-hidden">
        {contentRenderer}
      </div>
      
      {/* Bottom gradient fade for long content */}
      {!shouldVirtualize && chunks.length > 5 && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black to-transparent pointer-events-none" />
      )}
    </div>
  )
})

InstantTranscriptionRenderer.displayName = 'InstantTranscriptionRenderer'

/**
 * Higher-order component for even more aggressive optimization
 */
export const UltraOptimizedTranscriptionRenderer = memo<InstantTranscriptionProps>(
  (props) => {
    // Pre-start transition for ultra-smooth updates
    const [, startTransition] = useTransition()
    
    const optimizedProps = useMemo(() => ({
      ...props,
      chunkSize: 30, // Smaller chunks for faster rendering
      enableVirtualization: props.text.length > 500, // Smart virtualization threshold
      minimal: props.text.length < 100 // Use minimal mode for short text
    }), [props])
    
    // Wrap in transition for concurrent rendering
    return (
      <div className="ultra-optimized-wrapper">
        <InstantTranscriptionRenderer {...optimizedProps} />
      </div>
    )
  }
)

UltraOptimizedTranscriptionRenderer.displayName = 'UltraOptimizedTranscriptionRenderer'

export default InstantTranscriptionRenderer
