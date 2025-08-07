/**
 * Optimized Live Transcription Display Components
 * High-performance React components with memoization and efficient rendering
 */

import React, {memo, useMemo, useCallback, useState, useEffect, useRef} from 'react'
import {useTranscriptStore, transcriptSelectors} from '../state/transcript-state'
import {TranscriptEntry, TranscriptChunk} from '../services/optimized-transcript-processor'

// Performance monitoring hook
const useRenderPerformance = (componentName: string) => {
  const renderCount = useRef(0)
  const lastRenderTime = useRef(performance.now())

  useEffect(() => {
    renderCount.current++
    const currentTime = performance.now()
    const timeSinceLastRender = currentTime - lastRenderTime.current

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[${componentName}] Render #${renderCount.current}, Time since last: ${timeSinceLastRender.toFixed(2)}ms`
      )
    }

    lastRenderTime.current = currentTime
  })

  return renderCount.current
}

// Memoized transcript entry component
interface TranscriptEntryProps {
  entry: TranscriptEntry
  isSelected?: boolean
  showConfidence?: boolean
  onSelect?: (id: string) => void
  onContextMenu?: (entry: TranscriptEntry, event: React.MouseEvent) => void
}

export const OptimizedTranscriptEntry = memo<TranscriptEntryProps>(
  ({entry, isSelected = false, showConfidence = false, onSelect, onContextMenu}) => {
    useRenderPerformance(`TranscriptEntry-${entry.id}`)

    const handleClick = useCallback(() => {
      onSelect?.(entry.id)
    }, [onSelect, entry.id])

    const handleContextMenu = useCallback(
      (event: React.MouseEvent) => {
        event.preventDefault()
        onContextMenu?.(entry, event)
      },
      [onContextMenu, entry]
    )

    const entryClasses = useMemo(() => {
      const baseClasses = 'transcript-entry px-3 py-2 border-l-2 transition-all duration-200'
      const statusClasses = entry.isFinal
        ? 'border-green-400 bg-white'
        : 'border-yellow-400 bg-yellow-50 animate-pulse'
      const selectionClasses = isSelected ? 'ring-2 ring-blue-400 bg-blue-50' : 'hover:bg-gray-50'

      return `${baseClasses} ${statusClasses} ${selectionClasses}`
    }, [entry.isFinal, isSelected])

    const timestamp = useMemo(() => {
      return new Date(entry.timestamp).toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }, [entry.timestamp])

    const confidenceColor = useMemo(() => {
      if (!entry.confidence) return 'text-gray-400'
      if (entry.confidence > 0.8) return 'text-green-600'
      if (entry.confidence > 0.6) return 'text-yellow-600'
      return 'text-red-600'
    }, [entry.confidence])

    return (
      <div
        className={entryClasses}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        aria-selected={isSelected}
        data-entry-id={entry.id}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm break-words text-gray-900">{entry.text}</p>
            {entry.speakerId && (
              <span className="mt-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                {entry.speakerId}
              </span>
            )}
          </div>

          <div className="ml-3 flex flex-col items-end text-xs text-gray-500">
            <span>{timestamp}</span>
            {showConfidence && entry.confidence && (
              <span className={`mt-1 font-medium ${confidenceColor}`}>
                {Math.round(entry.confidence * 100)}%
              </span>
            )}
            {!entry.isFinal && <span className="mt-1 font-medium text-yellow-600">Partial</span>}
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison for optimal re-rendering
    return (
      prevProps.entry.id === nextProps.entry.id &&
      prevProps.entry.text === nextProps.entry.text &&
      prevProps.entry.isFinal === nextProps.entry.isFinal &&
      prevProps.entry.confidence === nextProps.entry.confidence &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.showConfidence === nextProps.showConfidence
    )
  }
)

OptimizedTranscriptEntry.displayName = 'OptimizedTranscriptEntry'

// Virtualized transcript list for handling large datasets
interface VirtualizedTranscriptListProps {
  entries: TranscriptEntry[]
  itemHeight: number
  containerHeight: number
  showConfidence?: boolean
  onEntrySelect?: (id: string) => void
  onEntryContextMenu?: (entry: TranscriptEntry, event: React.MouseEvent) => void
}

export const VirtualizedTranscriptList = memo<VirtualizedTranscriptListProps>(
  ({
    entries,
    itemHeight = 80,
    containerHeight = 400,
    showConfidence = false,
    onEntrySelect,
    onEntryContextMenu
  }) => {
    useRenderPerformance('VirtualizedTranscriptList')

    const [scrollTop, setScrollTop] = useState(0)
    const selectedEntryId = useTranscriptStore(state => state.selectedEntryId)
    const autoScroll = useTranscriptStore(state => state.autoScroll)
    const containerRef = useRef<HTMLDivElement>(null)

    // Calculate visible range
    const visibleRange = useMemo(() => {
      const startIndex = Math.floor(scrollTop / itemHeight)
      const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / itemHeight) + 2,
        entries.length
      )
      return {startIndex: Math.max(0, startIndex - 1), endIndex}
    }, [scrollTop, itemHeight, containerHeight, entries.length])

    // Get visible entries
    const visibleEntries = useMemo(() => {
      return entries.slice(visibleRange.startIndex, visibleRange.endIndex)
    }, [entries, visibleRange.startIndex, visibleRange.endIndex])

    // Handle scroll
    const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(event.currentTarget.scrollTop)
    }, [])

    // Auto-scroll to bottom for new entries (disabled to prevent scrolling interruptions)
    useEffect(() => {
      // Auto-scroll disabled - let users manually control scrolling
      // if (autoScroll && containerRef.current) {
      //   const container = containerRef.current
      //   const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100
      //
      //   if (isNearBottom) {
      //     container.scrollTop = container.scrollHeight
      //   }
      // }
    }, [entries.length, autoScroll])

    // Total height calculation
    const totalHeight = entries.length * itemHeight
    const offsetY = visibleRange.startIndex * itemHeight

    return (
      <div
        ref={containerRef}
        className="transcript-list overflow-auto rounded-lg border bg-white"
        style={{height: containerHeight}}
        onScroll={handleScroll}
      >
        <div style={{height: totalHeight, position: 'relative'}}>
          <div style={{transform: `translateY(${offsetY}px)`}}>
            {visibleEntries.map((entry, index) => (
              <div
                key={entry.id}
                style={{
                  height: itemHeight,
                  position: 'relative'
                }}
              >
                <OptimizedTranscriptEntry
                  entry={entry}
                  isSelected={entry.id === selectedEntryId}
                  showConfidence={showConfidence}
                  onSelect={onEntrySelect}
                  onContextMenu={onEntryContextMenu}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
)

VirtualizedTranscriptList.displayName = 'VirtualizedTranscriptList'

// Performance metrics display component
export const TranscriptPerformanceMetrics = memo(() => {
  useRenderPerformance('TranscriptPerformanceMetrics')

  const metrics = useTranscriptStore(transcriptSelectors.processingMetrics)

  const formatMetric = useCallback((value: number, unit: string) => {
    return `${value.toFixed(1)}${unit}`
  }, [])

  return (
    <div className="performance-metrics grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
      <div className="metric text-center">
        <div className="text-2xl font-bold text-blue-600">
          {formatMetric(metrics.throughput, '/s')}
        </div>
        <div className="text-sm text-gray-600">Throughput</div>
      </div>
      <div className="metric text-center">
        <div className="text-2xl font-bold text-green-600">
          {formatMetric(metrics.averageProcessingTime, 'ms')}
        </div>
        <div className="text-sm text-gray-600">Avg Processing</div>
      </div>
      <div className="metric text-center">
        <div className="text-2xl font-bold text-purple-600">
          {formatMetric(metrics.bufferUtilization, '%')}
        </div>
        <div className="text-sm text-gray-600">Buffer Usage</div>
      </div>
    </div>
  )
})

TranscriptPerformanceMetrics.displayName = 'TranscriptPerformanceMetrics'

// Chunked transcript view for better organization
interface ChunkedTranscriptViewProps {
  chunks: TranscriptChunk[]
  onChunkSelect?: (chunkId: string) => void
}

export const ChunkedTranscriptView = memo<ChunkedTranscriptViewProps>(({chunks, onChunkSelect}) => {
  useRenderPerformance('ChunkedTranscriptView')

  const renderChunk = useCallback(
    (chunk: TranscriptChunk) => {
      const duration = chunk.endTime - chunk.startTime
      const wordsPerMinute = chunk.totalWords > 0 ? (chunk.totalWords / duration) * 60000 : 0

      return (
        <div
          key={chunk.id}
          className="chunk mb-4 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          onClick={() => onChunkSelect?.(chunk.id)}
        >
          <div className="chunk-header mb-3 flex items-center justify-between">
            <div className="chunk-info text-sm text-gray-600">
              <span>{chunk.entries.length} entries • </span>
              <span>{chunk.totalWords} words • </span>
              <span>{Math.round(wordsPerMinute)} WPM</span>
            </div>
            <div className="chunk-time text-sm text-gray-500">
              {new Date(chunk.startTime).toLocaleTimeString([], {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>

          <div className="chunk-content">
            {chunk.entries.map(entry => (
              <span key={entry.id} className="entry-text">
                {entry.text}{' '}
              </span>
            ))}
          </div>

          {chunk.averageConfidence > 0 && (
            <div className="chunk-footer mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>Confidence: {Math.round(chunk.averageConfidence * 100)}%</span>
            </div>
          )}
        </div>
      )
    },
    [onChunkSelect]
  )

  return <div className="chunked-transcript-view">{chunks.map(renderChunk)}</div>
})

ChunkedTranscriptView.displayName = 'ChunkedTranscriptView'

// Main optimized transcript display with all features
interface OptimizedTranscriptDisplayProps {
  className?: string
  height?: number
  enableVirtualization?: boolean
}

export const OptimizedTranscriptDisplay = memo<OptimizedTranscriptDisplayProps>(
  ({className = '', height = 500, enableVirtualization = true}) => {
    useRenderPerformance('OptimizedTranscriptDisplay')

    // State selectors (optimized with custom selectors)
    const viewMode = useTranscriptStore(state => state.viewMode)
    const showConfidenceScores = useTranscriptStore(state => state.showConfidenceScores)
    const filteredEntries = useTranscriptStore(transcriptSelectors.filteredEntries)
    const chunks = useTranscriptStore(state => state.chunks)
    const searchResults = useTranscriptStore(state => state.searchResults)
    const isStreaming = useTranscriptStore(state => state.isStreaming)

    // Actions
    const setSelectedEntry = useTranscriptStore(state => state.setSelectedEntry)
    const setViewMode = useTranscriptStore(state => state.setViewMode)

    const handleEntrySelect = useCallback(
      (id: string) => {
        setSelectedEntry(id)
      },
      [setSelectedEntry]
    )

    const handleEntryContextMenu = useCallback(
      (entry: TranscriptEntry, event: React.MouseEvent) => {
        // Context menu logic here
        console.log('Context menu for entry:', entry.id, event)
      },
      []
    )

    const handleChunkSelect = useCallback((chunkId: string) => {
      console.log('Chunk selected:', chunkId)
    }, [])

    // View mode selector
    const viewSelector = useMemo(
      () => (
        <div className="view-selector mb-4 flex space-x-2">
          <button
            className={`rounded px-3 py-1 text-sm transition-colors ${
              viewMode === 'continuous'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            onClick={() => setViewMode('continuous')}
          >
            Continuous
          </button>
          <button
            className={`rounded px-3 py-1 text-sm transition-colors ${
              viewMode === 'chunked'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            onClick={() => setViewMode('chunked')}
          >
            Chunked
          </button>
          <button
            className={`rounded px-3 py-1 text-sm transition-colors ${
              viewMode === 'search'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            onClick={() => setViewMode('search')}
          >
            Search
          </button>
        </div>
      ),
      [viewMode, setViewMode]
    )

    // Streaming indicator
    const streamingIndicator = useMemo(
      () =>
        isStreaming && (
          <div className="streaming-indicator mb-4 flex items-center space-x-2 rounded border border-green-200 bg-green-50 p-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
            <span className="text-sm text-green-700">Live transcription active</span>
          </div>
        ),
      [isStreaming]
    )

    // Render content based on view mode
    const renderContent = useMemo(() => {
      switch (viewMode) {
        case 'chunked':
          return <ChunkedTranscriptView chunks={chunks} onChunkSelect={handleChunkSelect} />

        case 'search':
          return enableVirtualization ? (
            <VirtualizedTranscriptList
              entries={searchResults}
              itemHeight={80}
              containerHeight={height - 100}
              showConfidence={showConfidenceScores}
              onEntrySelect={handleEntrySelect}
              onEntryContextMenu={handleEntryContextMenu}
            />
          ) : (
            <div className="simple-list space-y-2">
              {searchResults.map(entry => (
                <OptimizedTranscriptEntry
                  key={entry.id}
                  entry={entry}
                  showConfidence={showConfidenceScores}
                  onSelect={handleEntrySelect}
                  onContextMenu={handleEntryContextMenu}
                />
              ))}
            </div>
          )

        case 'continuous':
        default:
          return enableVirtualization ? (
            <VirtualizedTranscriptList
              entries={filteredEntries}
              itemHeight={80}
              containerHeight={height - 100}
              showConfidence={showConfidenceScores}
              onEntrySelect={handleEntrySelect}
              onEntryContextMenu={handleEntryContextMenu}
            />
          ) : (
            <div className="simple-list max-h-96 space-y-2 overflow-auto">
              {filteredEntries.map(entry => (
                <OptimizedTranscriptEntry
                  key={entry.id}
                  entry={entry}
                  showConfidence={showConfidenceScores}
                  onSelect={handleEntrySelect}
                  onContextMenu={handleEntryContextMenu}
                />
              ))}
            </div>
          )
      }
    }, [
      viewMode,
      chunks,
      searchResults,
      filteredEntries,
      enableVirtualization,
      height,
      showConfidenceScores,
      handleEntrySelect,
      handleEntryContextMenu,
      handleChunkSelect
    ])

    return (
      <div className={`optimized-transcript-display ${className}`}>
        {streamingIndicator}
        {viewSelector}
        {renderContent}
      </div>
    )
  }
)

OptimizedTranscriptDisplay.displayName = 'OptimizedTranscriptDisplay'
