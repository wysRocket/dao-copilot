import React, {memo, useMemo, useRef, useEffect, useState, useCallback} from 'react'
import {TranscriptionResult} from '../services/main-stt-transcription'
import GlassMessage from './GlassMessage'

interface VirtualizedTranscriptProps {
  transcripts: TranscriptionResult[]
  newMessageIndices: Set<number>
  containerHeight?: number
  itemHeight?: number
  overscan?: number
  enableSmoothing?: boolean
  onScrollToBottom?: () => void
}

interface VirtualItem {
  index: number
  top: number
  height: number
  transcript: TranscriptionResult
  isVisible: boolean
}

interface VirtualizedState {
  scrollTop: number
  containerHeight: number
  visibleStartIndex: number
  visibleEndIndex: number
  totalHeight: number
}

// Memoized transcript message to prevent unnecessary re-renders
const MemoizedGlassMessage = memo(GlassMessage, (prevProps, nextProps) => {
  return (
    prevProps.transcript.text === nextProps.transcript.text &&
    prevProps.transcript.confidence === nextProps.transcript.confidence &&
    prevProps.isNew === nextProps.isNew
  )
})

MemoizedGlassMessage.displayName = 'MemoizedGlassMessage'

/**
 * High-performance virtualized transcript component
 * Only renders visible items with intelligent caching and smooth scrolling
 */
export const VirtualizedTranscript: React.FC<VirtualizedTranscriptProps> = memo(({
  transcripts,
  newMessageIndices,
  containerHeight = 600,
  itemHeight = 80, // Estimated height per transcript
  overscan = 5, // Number of items to render outside visible area
  enableSmoothing = true,
  onScrollToBottom
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [virtualState, setVirtualState] = useState<VirtualizedState>({
    scrollTop: 0,
    containerHeight,
    visibleStartIndex: 0,
    visibleEndIndex: 0,
    totalHeight: 0
  })

  // Cache for measured item heights
  const itemHeights = useRef<Map<number, number>>(new Map())
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  
  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(true)
  const lastScrollTop = useRef(0)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate virtual items with intelligent height estimation
  const virtualItems = useMemo((): VirtualItem[] => {
    const items: VirtualItem[] = []
    let currentTop = 0

    for (let index = 0; index < transcripts.length; index++) {
      const estimatedHeight = itemHeights.current.get(index) || itemHeight
      const isVisible = index >= virtualState.visibleStartIndex && index <= virtualState.visibleEndIndex

      items.push({
        index,
        top: currentTop,
        height: estimatedHeight,
        transcript: transcripts[index],
        isVisible
      })

      currentTop += estimatedHeight
    }

    return items
  }, [transcripts, itemHeight, virtualState.visibleStartIndex, virtualState.visibleEndIndex])

  // Calculate visible range based on scroll position
  const calculateVisibleRange = useCallback((scrollTop: number, containerHeight: number) => {
    let visibleStartIndex = 0
    let visibleEndIndex = 0
    let accumulatedHeight = 0

    // Find start index
    for (let i = 0; i < transcripts.length; i++) {
      const estimatedHeight = itemHeights.current.get(i) || itemHeight
      if (accumulatedHeight + estimatedHeight >= scrollTop) {
        visibleStartIndex = Math.max(0, i - overscan)
        break
      }
      accumulatedHeight += estimatedHeight
    }

    // Find end index
    accumulatedHeight = 0
    for (let i = 0; i < transcripts.length; i++) {
      const estimatedHeight = itemHeights.current.get(i) || itemHeight
      if (accumulatedHeight >= scrollTop + containerHeight + (overscan * itemHeight)) {
        visibleEndIndex = Math.min(transcripts.length - 1, i + overscan)
        break
      }
      accumulatedHeight += estimatedHeight
    }

    if (visibleEndIndex === 0) {
      visibleEndIndex = transcripts.length - 1
    }

    return { visibleStartIndex, visibleEndIndex }
  }, [transcripts.length, itemHeight, overscan])

  // Calculate total height of all items
  const totalHeight = useMemo(() => {
    return virtualItems.reduce((total, item) => total + item.height, 0)
  }, [virtualItems])

  // Handle scroll events with throttling
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop
    const containerHeight = event.currentTarget.clientHeight
    
    // Check if user is scrolling up (disable auto-scroll)
    if (scrollTop < lastScrollTop.current) {
      setAutoScroll(false)
    }
    
    lastScrollTop.current = scrollTop

    // Re-enable auto-scroll if near bottom
    const isNearBottom = scrollTop + containerHeight >= totalHeight - 100
    if (isNearBottom && !autoScroll) {
      setAutoScroll(true)
    }

    const { visibleStartIndex, visibleEndIndex } = calculateVisibleRange(scrollTop, containerHeight)

    setVirtualState(prev => ({
      ...prev,
      scrollTop,
      containerHeight,
      visibleStartIndex,
      visibleEndIndex,
      totalHeight
    }))

    // Debounced scroll to bottom callback
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (isNearBottom && onScrollToBottom) {
        onScrollToBottom()
      }
    }, 100)
  }, [calculateVisibleRange, totalHeight, autoScroll, onScrollToBottom])

  // Measure item heights after render
  const measureItem = useCallback((index: number, element: HTMLDivElement | null) => {
    if (!element) return

    const rect = element.getBoundingClientRect()
    const currentHeight = itemHeights.current.get(index)
    
    if (currentHeight !== rect.height) {
      itemHeights.current.set(index, rect.height)
      itemRefs.current.set(index, element)
      
      // Trigger re-calculation if height changed significantly
      if (Math.abs((currentHeight || itemHeight) - rect.height) > 10) {
        const { visibleStartIndex, visibleEndIndex } = calculateVisibleRange(
          virtualState.scrollTop, 
          virtualState.containerHeight
        )
        
        setVirtualState(prev => ({
          ...prev,
          visibleStartIndex,
          visibleEndIndex
        }))
      }
    }
  }, [itemHeight, calculateVisibleRange, virtualState.scrollTop, virtualState.containerHeight])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && containerRef.current && transcripts.length > 0) {
      const container = containerRef.current
      const shouldScroll = 
        container.scrollTop + container.clientHeight >= container.scrollHeight - 100

      if (shouldScroll) {
        if (enableSmoothing) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          })
        } else {
          container.scrollTop = container.scrollHeight
        }
      }
    }
  }, [transcripts.length, autoScroll, enableSmoothing])

  // Initialize visible range
  useEffect(() => {
    const { visibleStartIndex, visibleEndIndex } = calculateVisibleRange(0, containerHeight)
    setVirtualState(prev => ({
      ...prev,
      visibleStartIndex,
      visibleEndIndex,
      containerHeight,
      totalHeight
    }))
  }, [calculateVisibleRange, containerHeight, totalHeight])

  // Render only visible items
  const visibleItems = useMemo(() => {
    return virtualItems.filter(item => 
      item.index >= virtualState.visibleStartIndex && 
      item.index <= virtualState.visibleEndIndex
    )
  }, [virtualItems, virtualState.visibleStartIndex, virtualState.visibleEndIndex])

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="virtualized-transcript-container overflow-auto"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
      data-testid="virtualized-transcript"
    >
      {/* Virtual spacer for total height */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Render visible items */}
        {visibleItems.map((item) => (
          <div
            key={`transcript-${item.index}-${item.transcript.text.slice(0, 10)}`}
            ref={(el) => measureItem(item.index, el)}
            style={{
              position: 'absolute',
              top: item.top,
              left: 0,
              right: 0,
              minHeight: itemHeight
            }}
            data-index={item.index}
          >
            <MemoizedGlassMessage
              transcript={item.transcript}
              isNew={newMessageIndices.has(item.index)}
            />
          </div>
        ))}
      </div>
      
      {/* Auto-scroll indicator */}
      {!autoScroll && transcripts.length > 0 && (
        <div
          className="fixed bottom-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => {
            if (containerRef.current) {
              containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: 'smooth'
              })
              setAutoScroll(true)
            }
          }}
          style={{ zIndex: 1000 }}
        >
          ↓ Scroll to bottom
        </div>
      )}
    </div>
  )
})

VirtualizedTranscript.displayName = 'VirtualizedTranscript'

// Export performance monitoring wrapper
export const VirtualizedTranscriptWithMonitoring: React.FC<VirtualizedTranscriptProps & {
  enablePerformanceMonitoring?: boolean
}> = memo(({ enablePerformanceMonitoring = false, ...props }) => {
  const [renderTime, setRenderTime] = useState<number>(0)
  const renderStartRef = useRef<number>(0)

  useEffect(() => {
    if (enablePerformanceMonitoring) {
      renderStartRef.current = performance.now()
    }
  })

  useEffect(() => {
    if (enablePerformanceMonitoring && renderStartRef.current > 0) {
      const renderDuration = performance.now() - renderStartRef.current
      setRenderTime(renderDuration)
      
      if (renderDuration > 16) { // More than one frame at 60fps
        console.warn(`VirtualizedTranscript slow render: ${renderDuration.toFixed(2)}ms`)
      }
    }
  })

  return (
    <>
      <VirtualizedTranscript {...props} />
      {enablePerformanceMonitoring && renderTime > 0 && (
        <div className="text-xs text-gray-500 p-1">
          Render: {renderTime.toFixed(1)}ms
        </div>
      )}
    </>
  )
})

VirtualizedTranscriptWithMonitoring.displayName = 'VirtualizedTranscriptWithMonitoring'

export default VirtualizedTranscript
