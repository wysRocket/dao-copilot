/**
 * Performance-Optimized Transcription Renderer
 *
 * This component provides efficient rendering for continuous transcription updates
 * using techniques like virtual scrolling, memoization, and optimized DOM updates.
 *
 * Key Features:
 * 1. Virtual scrolling for large transcription datasets
 * 2. Memoized rendering to prevent unnecessary re-renders
 * 3. Chunk-based text rendering for smooth updates
 * 4. Performance monitoring and metrics
 * 5. Configurable rendering strategies
 */

import React, {memo, useMemo, useCallback, useRef, useEffect, useState} from 'react'
import {TranscriptionSegment} from '../services/LiveTranscriptionBuffer'

export interface PerformanceConfig {
  // Virtual scrolling settings
  virtualScrolling: boolean
  containerHeight: number
  itemHeight: number
  overscan: number // Number of items to render outside viewport

  // Rendering optimization
  renderBatchSize: number // Number of segments to render in each batch
  updateThrottle: number // Milliseconds to throttle updates
  maxVisibleSegments: number // Maximum segments to keep in DOM

  // Performance monitoring
  enableProfiling: boolean
  logPerformanceMetrics: boolean

  // Memory management
  enableGarbageCollection: boolean
  gcThreshold: number // Number of segments before triggering cleanup
}

export interface PerformanceMetrics {
  renderTime: number
  updateFrequency: number
  memoryUsage: number
  visibleSegments: number
  totalSegments: number
  averageRenderTime: number
  peakMemoryUsage: number
  lastRenderTimestamp: number
}

export interface PerformanceOptimizedTranscriptionRendererProps {
  segments: TranscriptionSegment[]
  currentText: string
  isStreaming: boolean
  config?: Partial<PerformanceConfig>
  onPerformanceMetrics?: (metrics: PerformanceMetrics) => void
  className?: string
  autoScroll?: boolean
  highlightPartial?: boolean
}

const defaultConfig: PerformanceConfig = {
  virtualScrolling: true,
  containerHeight: 400,
  itemHeight: 30,
  overscan: 5,
  renderBatchSize: 10,
  updateThrottle: 16, // ~60 FPS
  maxVisibleSegments: 100,
  enableProfiling: true,
  logPerformanceMetrics: false,
  enableGarbageCollection: true,
  gcThreshold: 200
}

/**
 * Memoized segment renderer to prevent unnecessary re-renders
 */
const SegmentItem = memo<{
  segment: TranscriptionSegment
  isPartial: boolean
  highlightPartial: boolean
  index: number
}>(({segment, isPartial, highlightPartial, index}) => {
  const segmentClass = useMemo(() => {
    let classes = 'transcription-segment'
    if (isPartial && highlightPartial) {
      classes += ' partial-segment'
    }
    if (segment.isFinal) {
      classes += ' final-segment'
    }
    return classes
  }, [isPartial, highlightPartial, segment.isFinal])

  return (
    <div
      className={segmentClass}
      data-segment-id={segment.id}
      data-index={index}
      style={{minHeight: '30px', padding: '4px 8px'}}
    >
      {segment.text}
      {segment.confidence && (
        <span className="confidence-score" style={{opacity: 0.6, fontSize: '0.8em'}}>
          {' '}
          ({Math.round(segment.confidence * 100)}%)
        </span>
      )}
    </div>
  )
})

SegmentItem.displayName = 'SegmentItem'

/**
 * Virtual scrolling container for efficient rendering of large segment lists
 */
const VirtualScrollContainer = memo<{
  segments: TranscriptionSegment[]
  containerHeight: number
  itemHeight: number
  overscan: number
  highlightPartial: boolean
  onScroll?: (scrollTop: number) => void
}>(({segments, containerHeight, itemHeight, overscan, highlightPartial, onScroll}) => {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop
      setScrollTop(newScrollTop)
      onScroll?.(newScrollTop)
    },
    [onScroll]
  )

  const {visibleItems, totalHeight, offsetY} = useMemo(() => {
    const visibleHeight = containerHeight
    const startIndex = Math.floor(scrollTop / itemHeight)
    const endIndex = Math.min(
      startIndex + Math.ceil(visibleHeight / itemHeight) + overscan,
      segments.length
    )

    const visibleStartIndex = Math.max(0, startIndex - overscan)
    const visibleItems = segments.slice(visibleStartIndex, endIndex)

    return {
      visibleItems,
      totalHeight: segments.length * itemHeight,
      offsetY: visibleStartIndex * itemHeight
    }
  }, [segments, scrollTop, containerHeight, itemHeight, overscan])

  return (
    <div
      ref={containerRef}
      style={{height: containerHeight, overflow: 'auto'}}
      onScroll={handleScroll}
    >
      <div style={{height: totalHeight, position: 'relative'}}>
        <div style={{transform: `translateY(${offsetY}px)`}}>
          {visibleItems.map((segment, index) => (
            <SegmentItem
              key={segment.id}
              segment={segment}
              isPartial={segment.isPartial}
              highlightPartial={highlightPartial}
              index={index}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

VirtualScrollContainer.displayName = 'VirtualScrollContainer'

/**
 * Performance monitoring hook
 */
function usePerformanceMonitoring(
  config: PerformanceConfig,
  onMetrics?: (metrics: PerformanceMetrics) => void
) {
  const metricsRef = useRef<PerformanceMetrics>({
    renderTime: 0,
    updateFrequency: 0,
    memoryUsage: 0,
    visibleSegments: 0,
    totalSegments: 0,
    averageRenderTime: 0,
    peakMemoryUsage: 0,
    lastRenderTimestamp: 0
  })

  const renderTimesRef = useRef<number[]>([])
  const lastUpdateRef = useRef(0)

  const recordRender = useCallback(
    (renderTime: number, visibleSegments: number, totalSegments: number) => {
      if (!config.enableProfiling) return

      const now = performance.now()
      const timeSinceLastUpdate = now - lastUpdateRef.current

      renderTimesRef.current.push(renderTime)
      if (renderTimesRef.current.length > 100) {
        renderTimesRef.current.shift()
      }

      const averageRenderTime =
        renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length
      const updateFrequency = timeSinceLastUpdate > 0 ? 1000 / timeSinceLastUpdate : 0

      // Estimate memory usage (approximate)
      const memoryUsage = totalSegments * 0.5 // Rough estimate: 0.5KB per segment

      const metrics: PerformanceMetrics = {
        renderTime,
        updateFrequency,
        memoryUsage,
        visibleSegments,
        totalSegments,
        averageRenderTime,
        peakMemoryUsage: Math.max(metricsRef.current.peakMemoryUsage, memoryUsage),
        lastRenderTimestamp: now
      }

      metricsRef.current = metrics
      lastUpdateRef.current = now

      if (config.logPerformanceMetrics) {
        console.log('Transcription Render Metrics:', metrics)
      }

      onMetrics?.(metrics)
    },
    [config.enableProfiling, config.logPerformanceMetrics, onMetrics]
  )

  return {recordRender, getMetrics: () => metricsRef.current}
}

/**
 * Main performance-optimized transcription renderer
 */
export const PerformanceOptimizedTranscriptionRenderer: React.FC<
  PerformanceOptimizedTranscriptionRendererProps
> = ({
  segments,
  currentText,
  isStreaming,
  config: userConfig = {},
  onPerformanceMetrics,
  className = '',
  autoScroll = true,
  highlightPartial = true
}) => {
  const config = useMemo(() => ({...defaultConfig, ...userConfig}), [userConfig])
  const containerRef = useRef<HTMLDivElement>(null)
  const {recordRender} = usePerformanceMonitoring(config, onPerformanceMetrics)

  // Throttled segments to prevent excessive re-renders
  const [throttledSegments, setThrottledSegments] = useState(segments)
  const lastUpdateRef = useRef(0)

  // Throttle segment updates
  useEffect(() => {
    const now = performance.now()
    if (now - lastUpdateRef.current >= config.updateThrottle) {
      setThrottledSegments(segments)
      lastUpdateRef.current = now
    } else {
      const timer = setTimeout(() => {
        setThrottledSegments(segments)
        lastUpdateRef.current = performance.now()
      }, config.updateThrottle)
      return () => clearTimeout(timer)
    }
  }, [segments, config.updateThrottle])

  // Limit visible segments for performance
  const optimizedSegments = useMemo(() => {
    if (config.enableGarbageCollection && throttledSegments.length > config.gcThreshold) {
      // Keep most recent segments within the limit
      const startIndex = Math.max(0, throttledSegments.length - config.maxVisibleSegments)
      return throttledSegments.slice(startIndex)
    }
    return throttledSegments
  }, [
    throttledSegments,
    config.enableGarbageCollection,
    config.gcThreshold,
    config.maxVisibleSegments
  ])

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (autoScroll && containerRef.current && isStreaming) {
      const container = containerRef.current
      const shouldScroll =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 50

      if (shouldScroll) {
        container.scrollTop = container.scrollHeight
      }
    }
  }, [optimizedSegments, autoScroll, isStreaming])

  // Record render performance
  useEffect(() => {
    const renderStart = performance.now()

    // Use requestAnimationFrame to measure actual render time
    requestAnimationFrame(() => {
      const renderTime = performance.now() - renderStart
      recordRender(renderTime, optimizedSegments.length, segments.length)
    })
  }, [optimizedSegments, segments.length, recordRender])

  const containerClass = useMemo(() => {
    return `performance-optimized-transcription ${className}`.trim()
  }, [className])

  if (config.virtualScrolling && optimizedSegments.length > 20) {
    return (
      <div className={containerClass} ref={containerRef}>
        <VirtualScrollContainer
          segments={optimizedSegments}
          containerHeight={config.containerHeight}
          itemHeight={config.itemHeight}
          overscan={config.overscan}
          highlightPartial={highlightPartial}
        />
        {currentText && isStreaming && (
          <div
            className="current-streaming-text"
            style={{
              padding: '8px',
              backgroundColor: 'rgba(0,123,255,0.1)',
              borderLeft: '3px solid #007bff'
            }}
          >
            {currentText}
          </div>
        )}
      </div>
    )
  }

  // Standard rendering for smaller datasets
  return (
    <div
      className={containerClass}
      ref={containerRef}
      style={{
        maxHeight: config.containerHeight,
        overflowY: 'auto',
        padding: '8px'
      }}
    >
      {optimizedSegments.map((segment, index) => (
        <SegmentItem
          key={segment.id}
          segment={segment}
          isPartial={segment.isPartial}
          highlightPartial={highlightPartial}
          index={index}
        />
      ))}
      {currentText && isStreaming && (
        <div
          className="current-streaming-text"
          style={{
            padding: '8px',
            backgroundColor: 'rgba(0,123,255,0.1)',
            borderLeft: '3px solid #007bff',
            marginTop: '8px'
          }}
        >
          {currentText}
        </div>
      )}
    </div>
  )
}

export default PerformanceOptimizedTranscriptionRenderer
