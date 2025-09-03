/**
 * Optimized Transcript State Management
 * Fine-grained state management with automatic updates and performance optimizations
 */

import {create} from 'zustand'
import {subscribeWithSelector} from 'zustand/middleware'
import {
  TranscriptEntry,
  TranscriptChunk,
  OptimizedTranscriptProcessor,
  ProcessingStats
} from '../services/optimized-transcript-processor'
// FSM integration (incremental adoption)
import {TranscriptFSM} from '../transcription/fsm'
import {TranscriptionFlags} from '../config/transcription-flags'
import {GlobalOrphanWorker} from '../transcription/fsm/OrphanWorker'
// Persistence middleware
import {persistTranscriptState, enableCrossTabSync} from './transcript-persistence'

export interface SearchOptions {
  caseSensitive?: boolean
  maxResults?: number
  timeRange?: {start: number; end: number}
}

export interface BufferStats {
  size: number
  utilization: number
  oldestEntry: number
  newestEntry: number
  finalEntries: number
  partialEntries: number
}

export interface TranscriptDisplayState {
  // Core transcript data
  recentEntries: TranscriptEntry[]
  chunks: TranscriptChunk[]
  searchResults: TranscriptEntry[]

  // UI state
  isStreaming: boolean
  selectedEntryId?: string
  searchQuery: string
  viewMode: 'continuous' | 'chunked' | 'search'

  // Performance metrics
  processingStats: ProcessingStats & {bufferStats: BufferStats}
  lastUpdateTime: number

  // Display options
  showPartialResults: boolean
  showConfidenceScores: boolean
  autoScroll: boolean
  maxDisplayEntries: number

  // Filtering
  timeRange?: {start: number; end: number}
  minConfidence?: number
  speakerFilter?: string
}

export interface TranscriptActions {
  // Entry management
  addEntry: (entry: TranscriptEntry) => void
  addPartialEntry: (result: {text: string; confidence?: number; id?: string}) => void
  addFinalEntry: (result: {text: string; confidence?: number; id?: string}) => void
  addBatch: (entries: TranscriptEntry[]) => void
  updateEntry: (id: string, updates: Partial<TranscriptEntry>) => void
  removeEntry: (id: string) => void

  // Search and filtering
  setSearchQuery: (query: string) => void
  performSearch: (query: string, options?: SearchOptions) => void
  clearSearch: () => void
  setTimeRange: (start: number, end: number) => void
  clearTimeRange: () => void
  setMinConfidence: (confidence: number) => void
  setSpeakerFilter: (speakerId: string) => void

  // UI actions
  setViewMode: (mode: 'continuous' | 'chunked' | 'search') => void
  setSelectedEntry: (id?: string) => void
  togglePartialResults: () => void
  toggleConfidenceScores: () => void
  toggleAutoScroll: () => void
  setMaxDisplayEntries: (count: number) => void

  // Streaming control
  startStreaming: () => void
  stopStreaming: () => void

  // Performance actions
  refreshData: () => void
  optimizeMemory: () => void

  // Internal state management
  _updateStats: (stats: ProcessingStats & {bufferStats: BufferStats}) => void
  _setRecentEntries: (entries: TranscriptEntry[]) => void
  _setChunks: (chunks: TranscriptChunk[]) => void
}

export type TranscriptStore = TranscriptDisplayState & TranscriptActions

/**
 * High-performance Zustand store for transcript state management
 */
export const useTranscriptStore = create<TranscriptStore>()(
  subscribeWithSelector(
    persistTranscriptState((set, get) => ({
      // Initial state
      recentEntries: [],
      chunks: [],
      searchResults: [],
      isStreaming: false,
      searchQuery: '',
      viewMode: 'continuous',
      processingStats: {
        totalEntries: 0,
        averageProcessingTime: 0,
        bufferUtilization: 0,
        compressionRatio: 0,
        memoryUsage: 0,
        throughput: 0,
        bufferStats: {
          size: 0,
          utilization: 0,
          oldestEntry: 0,
          newestEntry: 0,
          finalEntries: 0,
          partialEntries: 0
        }
      },
      lastUpdateTime: Date.now(),
      showPartialResults: true,
      showConfidenceScores: false,
      autoScroll: true,
      // Increased to reduce perceived loss in UI when many segments accumulate quickly
      maxDisplayEntries: 500,

      // Entry management actions
      addEntry: (entry: TranscriptEntry) => {
        const processor = TranscriptStateManager.getInstance().getProcessor()
        processor.addEntry(entry)
        // State will be updated via processor events
      },

      addPartialEntry: (result: {text: string; confidence?: number; id?: string}) => {
        if (!result.text?.trim()) return

        const state = get()
        const entryId =
          result.id || `partial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        // Check if this partial entry already exists
        const existingEntryIndex = state.recentEntries.findIndex(entry => entry.id === entryId)

        if (existingEntryIndex !== -1) {
          // Update existing partial entry
          console.log(`Updating existing partial entry: ${entryId}`)
          set(state => ({
            recentEntries: state.recentEntries.map((entry, index) =>
              index === existingEntryIndex
                ? {
                    ...entry,
                    text: result.text.trim(),
                    confidence: result.confidence || entry.confidence,
                    timestamp: Date.now()
                  }
                : entry
            ),
            lastUpdateTime: Date.now()
          }))
        } else {
          // Create new partial entry directly in state (avoid async processor latency)
          console.log(
            `Adding new partial entry directly: ${entryId}, text: "${result.text.trim()}"`
          )
          const entry: TranscriptEntry = {
            id: entryId,
            text: result.text.trim(),
            confidence: result.confidence,
            timestamp: Date.now(),
            isPartial: true,
            isFinal: false
          }
          set(state => ({
            recentEntries: [...state.recentEntries, entry].slice(-state.maxDisplayEntries),
            lastUpdateTime: Date.now()
          }))
          if (TranscriptionFlags.ENABLE_FSM) {
            // Mirror into FSM (create or update utterance) behind feature flag
            try {
              const existing = TranscriptFSM.getUtterance(entryId)
              if (!existing) {
                TranscriptFSM.createUtterance({
                  sessionId: 'default',
                  firstPartial: {text: entry.text, confidence: entry.confidence}
                })
              } else {
                TranscriptFSM.applyPartial(entryId, entry.text, entry.confidence)
              }
            } catch (e) {
              console.debug('FSM mirror partial failed (non-fatal):', e)
            }
          }
        }
      },

      addFinalEntry: (result: {text: string; confidence?: number; id?: string}) => {
        if (!result.text?.trim()) return

        const state = get()

        // IMPROVED: More precise partial entry removal to prevent losing unrelated transcriptions
        const partialEntriesToRemove = state.recentEntries.filter(entry => {
          if (!entry.isPartial) return false

          // Only remove if there's a very specific match (same ID or very similar text)
          if (result.id && entry.id === result.id) return true

          // More conservative text matching - only exact matches or very close prefixes
          const resultText = result.text.trim()
          const entryText = entry.text.trim()

          // Exact match
          if (entryText === resultText) return true

          // Entry is a clear prefix of result (within 20% length difference)
          if (
            resultText.startsWith(entryText) &&
            resultText.length - entryText.length <= entryText.length * 0.2
          ) {
            return true
          }

          return false
        })

        // Remove the matching partial entries
        if (partialEntriesToRemove.length > 0) {
          console.log(
            `Removing ${partialEntriesToRemove.length} related partial entries for final transcription: "${result.text.trim()}"`
          )
          set(state => ({
            recentEntries: state.recentEntries.filter(
              entry => !partialEntriesToRemove.some(partial => partial.id === entry.id)
            ),
            lastUpdateTime: Date.now()
          }))
        }

        // Light final dedup: only remove exact same id or exact same text duplicates
        try {
          const normalizedFinalText = result.text.trim()
          const finalsToRemove = state.recentEntries.filter(entry => {
            if (!entry.isFinal) return false
            if (result.id && entry.id === result.id) return true
            const t = (entry.text || '').trim()
            return t === normalizedFinalText // exact match only
          })
          if (finalsToRemove.length > 0) {
            console.log(
              `Removing ${finalsToRemove.length} exact duplicate finals before adding new final entry`
            )
            set(state => ({
              recentEntries: state.recentEntries.filter(
                entry => !finalsToRemove.some(f => f.id === entry.id)
              ),
              lastUpdateTime: Date.now()
            }))
          }
        } catch (e) {
          console.debug('addFinalEntry light dedup error (non-fatal):', e)
        }

        console.log(`Adding final entry: "${result.text.trim()}"`)
        const entry: TranscriptEntry = {
          id: result.id || `final_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          text: result.text.trim(),
          confidence: result.confidence,
          timestamp: Date.now(),
          isPartial: false,
          isFinal: true
        }

        get().addEntry(entry)
        if (TranscriptionFlags.ENABLE_FSM) {
          // Mirror finalize into FSM behind feature flag
          try {
            const utteranceId = result.id || entry.id
            const existing = TranscriptFSM.getUtterance(utteranceId)
            if (!existing) {
              const createdId = TranscriptFSM.createUtterance({sessionId: 'default'})
              TranscriptFSM.applyPartial(createdId, entry.text, entry.confidence)
              TranscriptFSM.applyFinal(createdId, entry.text, entry.confidence)
            } else {
              TranscriptFSM.applyFinal(utteranceId, entry.text, entry.confidence)
            }
          } catch (e) {
            console.debug('FSM mirror final failed (non-fatal):', e)
          }
        }
      },

      addBatch: (entries: TranscriptEntry[]) => {
        const processor = TranscriptStateManager.getInstance().getProcessor()
        processor.addBatch(entries)
        // State will be updated via processor events
      },

      updateEntry: (id: string, updates: Partial<TranscriptEntry>) => {
        set(state => ({
          recentEntries: state.recentEntries.map(entry =>
            entry.id === id ? {...entry, ...updates} : entry
          ),
          lastUpdateTime: Date.now()
        }))
      },

      removeEntry: (id: string) => {
        set(state => ({
          recentEntries: state.recentEntries.filter(entry => entry.id !== id),
          chunks: state.chunks.map(chunk => ({
            ...chunk,
            entries: chunk.entries.filter(entry => entry.id !== id)
          })),
          lastUpdateTime: Date.now()
        }))
      },

      // Search and filtering actions
      setSearchQuery: (query: string) => {
        set({searchQuery: query})
      },

      performSearch: (query: string, options?: SearchOptions) => {
        const processor = TranscriptStateManager.getInstance().getProcessor()
        const results = processor.searchTranscript(query, options)

        set({
          searchQuery: query,
          searchResults: results,
          viewMode: 'search',
          lastUpdateTime: Date.now()
        })
      },

      clearSearch: () => {
        set({
          searchQuery: '',
          searchResults: [],
          viewMode: 'continuous',
          lastUpdateTime: Date.now()
        })
      },

      setTimeRange: (start: number, end: number) => {
        set({timeRange: {start, end}, lastUpdateTime: Date.now()})
        // Refresh data with new time range
        get().refreshData()
      },

      clearTimeRange: () => {
        set({timeRange: undefined, lastUpdateTime: Date.now()})
        get().refreshData()
      },

      setMinConfidence: (confidence: number) => {
        set({minConfidence: confidence, lastUpdateTime: Date.now()})
      },

      setSpeakerFilter: (speakerId: string) => {
        set({speakerFilter: speakerId, lastUpdateTime: Date.now()})
      },

      // UI actions
      setViewMode: (mode: 'continuous' | 'chunked' | 'search') => {
        set({viewMode: mode, lastUpdateTime: Date.now()})

        if (mode === 'chunked') {
          // Generate chunks when switching to chunked view
          const processor = TranscriptStateManager.getInstance().getProcessor()
          const chunks = processor.generateChunks(get().maxDisplayEntries / 5)
          set({chunks})
        }
      },

      setSelectedEntry: (id?: string) => {
        set({selectedEntryId: id})
      },

      togglePartialResults: () => {
        set(state => ({
          showPartialResults: !state.showPartialResults,
          lastUpdateTime: Date.now()
        }))
        get().refreshData()
      },

      toggleConfidenceScores: () => {
        set(state => ({
          showConfidenceScores: !state.showConfidenceScores
        }))
      },

      toggleAutoScroll: () => {
        set(state => ({autoScroll: !state.autoScroll}))
      },

      setMaxDisplayEntries: (count: number) => {
        set({maxDisplayEntries: count, lastUpdateTime: Date.now()})
        get().refreshData()
      },

      // Streaming control
      startStreaming: () => {
        set({isStreaming: true, lastUpdateTime: Date.now()})
      },

      stopStreaming: () => {
        set({isStreaming: false, lastUpdateTime: Date.now()})
      },

      // Performance actions
      refreshData: () => {
        const processor = TranscriptStateManager.getInstance().getProcessor()
        const state = get()

        // Get recent entries with filtering
        let entries = processor.getRecentEntries(state.maxDisplayEntries, !state.showPartialResults)

        // De-duplicate entries by ID while preserving order and preferring finals/newer items
        if (entries.length > 1) {
          const idToIndex = new Map<string, number>()
          const deduped: TranscriptEntry[] = []

          for (const entry of entries) {
            const existingIndex = idToIndex.get(entry.id)
            if (existingIndex === undefined) {
              idToIndex.set(entry.id, deduped.length)
              deduped.push(entry)
            } else {
              const prev = deduped[existingIndex]
              // Prefer final over partial; otherwise prefer the newer timestamp
              const choose =
                (entry.isFinal && !prev.isFinal) ||
                (entry.isFinal === prev.isFinal && (entry.timestamp || 0) >= (prev.timestamp || 0))
                  ? entry
                  : prev
              deduped[existingIndex] = choose
            }
          }

          entries = deduped
        }

        // Apply confidence filter
        if (state.minConfidence !== undefined) {
          entries = entries.filter(
            entry => !entry.confidence || entry.confidence >= state.minConfidence!
          )
        }

        // Apply speaker filter
        if (state.speakerFilter) {
          entries = entries.filter(entry => entry.speakerId === state.speakerFilter)
        }

        // Update state
        set({
          recentEntries: entries,
          lastUpdateTime: Date.now()
        })

        // Generate chunks if in chunked mode
        if (state.viewMode === 'chunked') {
          const chunks = processor.generateChunks(state.maxDisplayEntries / 5)
          set({chunks})
        }
      },

      optimizeMemory: () => {
        // Trigger garbage collection and optimization

        // Clear old search results
        set({searchResults: []})

        // Refresh with current settings to clean up stale data
        get().refreshData()

        console.log('Memory optimization completed')
      },

      // Internal state management (used by processor events)
      _updateStats: (stats: ProcessingStats & {bufferStats: BufferStats}) => {
        set({processingStats: stats, lastUpdateTime: Date.now()})
      },

      _setRecentEntries: (entries: TranscriptEntry[]) => {
        set({recentEntries: entries, lastUpdateTime: Date.now()})
      },

      _setChunks: (chunks: TranscriptChunk[]) => {
        set({chunks, lastUpdateTime: Date.now()})
      }
    }))
  )
)

// Initialize cross-tab synchronization
enableCrossTabSync(useTranscriptStore)

/**
 * Singleton manager for transcript processing and state synchronization
 */
export class TranscriptStateManager {
  private static instance: TranscriptStateManager | null = null
  private processor: OptimizedTranscriptProcessor
  private updateInterval: NodeJS.Timeout | null = null
  private isInitialized = false

  private constructor() {
    // Initialize processor with increased settings to prevent data loss
    this.processor = new OptimizedTranscriptProcessor({
      maxSize: 5000, // Increased from 1000 to 5000 entries to prevent overflow
      chunkSize: 50, // Process in chunks of 50
      retentionTime: 60 * 60 * 1000, // Increased to 60 minutes retention
      enableCompression: true
    })

    this.setupProcessorEvents()
    this.startStateUpdater()
    this.isInitialized = true
  }

  public static getInstance(): TranscriptStateManager {
    if (!TranscriptStateManager.instance) {
      TranscriptStateManager.instance = new TranscriptStateManager()
    }
    return TranscriptStateManager.instance
  }

  public getProcessor(): OptimizedTranscriptProcessor {
    return this.processor
  }

  public isReady(): boolean {
    return this.isInitialized
  }

  /**
   * Setup processor event listeners to sync with state store
   */
  private setupProcessorEvents(): void {
    // Update stats when processing occurs
    this.processor.on('statsUpdated', stats => {
      useTranscriptStore.getState()._updateStats(stats)
    })

    // Refresh entries when new ones are processed
    this.processor.on('entryProcessed', () => {
      // Throttle updates to avoid excessive re-renders
      this.scheduleStateRefresh()
    })

    // Handle batch processing
    this.processor.on('batchProcessed', data => {
      console.log(`Processed batch of ${data.count} entries in ${data.processingTime}ms`)
      this.scheduleStateRefresh()
    })

    // Handle processing errors
    this.processor.on('processingError', error => {
      console.error('Transcript processing error:', error)
    })
  }

  private refreshScheduled = false

  /**
   * Schedule a state refresh (optimized to prevent lost updates while maintaining performance)
   */
  private scheduleStateRefresh(): void {
    if (this.refreshScheduled) return

    this.refreshScheduled = true

    // IMPROVED: Use immediate execution for critical updates, throttle for performance only
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        try {
          useTranscriptStore.getState().refreshData()
        } catch (error) {
          console.error('Failed to refresh transcript state:', error)
        } finally {
          this.refreshScheduled = false
        }
      })
    } else {
      // Fallback for non-browser environments - immediate execution to prevent lost updates
      setTimeout(() => {
        try {
          useTranscriptStore.getState().refreshData()
        } catch (error) {
          console.error('Failed to refresh transcript state:', error)
        } finally {
          this.refreshScheduled = false
        }
      }, 0) // Changed from 16ms to 0ms for immediate execution
    }
  }

  /**
   * Start periodic state updates
   */
  private startStateUpdater(): void {
    this.updateInterval = setInterval(() => {
      const stats = this.processor.getStats()
      useTranscriptStore.getState()._updateStats(stats)
    }, 1000) // Update stats every second
  }

  /**
   * Add a partial entry for real-time streaming
   */
  public addPartialEntry(
    result: Partial<{
      text: string
      transcript: string
      confidence: number
      speaker: string
      timestamp: number
      duration: number
      startTime: number
      endTime: number
      language: string
      source: string
      metadata: Record<string, unknown>
    }>
  ): void {
    const partialEntry = this.createEntryFromResult(result, true, false)
    useTranscriptStore.getState().addPartialEntry(partialEntry)
  }

  /**
   * Add a final entry for completed transcription
   */
  public addFinalEntry(
    result: Partial<{
      text: string
      transcript: string
      confidence: number
      speaker: string
      timestamp: number
      duration: number
      startTime: number
      endTime: number
      language: string
      source: string
      metadata: Record<string, unknown>
    }>
  ): void {
    const finalEntry = this.createEntryFromResult(result, false, true)
    useTranscriptStore.getState().addFinalEntry(finalEntry)
  }

  /**
   * Create a TranscriptEntry from transcription result
   */
  private createEntryFromResult(
    result: Partial<{
      text: string
      transcript: string
      confidence: number
      speaker: string
      timestamp: number
      duration: number
      startTime: number
      endTime: number
      language: string
      source: string
      metadata: Record<string, unknown>
    }>,
    isPartial: boolean,
    isFinal: boolean
  ): TranscriptEntry {
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: result.text || result.transcript || '',
      timestamp: result.timestamp || Date.now(),
      confidence: result.confidence || 1.0,
      speakerId: result.speaker,
      isPartial,
      isFinal,
      metadata: {
        duration: result.duration,
        language: result.language || 'en',
        processingTime: Date.now() - (result.timestamp || Date.now()),
        ...(result.metadata || {})
      }
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    this.processor.destroy()
    this.isInitialized = false
    TranscriptStateManager.instance = null
  }
}

// Export commonly used selectors for performance optimization
export const transcriptSelectors = {
  // Memoized selectors for React components
  recentEntries: (state: TranscriptStore) => state.recentEntries,
  filteredEntries: (state: TranscriptStore) => {
    let entries = state.recentEntries

    if (!state.showPartialResults) {
      entries = entries.filter(entry => entry.isFinal)
    }

    if (state.minConfidence !== undefined) {
      entries = entries.filter(
        entry => !entry.confidence || entry.confidence >= state.minConfidence!
      )
    }

    return entries
  },
  currentChunk: (state: TranscriptStore) => {
    return state.chunks.length > 0 ? state.chunks[state.chunks.length - 1] : null
  },
  processingMetrics: (state: TranscriptStore) => ({
    throughput: state.processingStats.throughput,
    averageProcessingTime: state.processingStats.averageProcessingTime,
    bufferUtilization: state.processingStats.bufferUtilization
  }),
  uiState: (state: TranscriptStore) => ({
    viewMode: state.viewMode,
    isStreaming: state.isStreaming,
    showPartialResults: state.showPartialResults,
    autoScroll: state.autoScroll
  })
}

// Initialize the state manager
TranscriptStateManager.getInstance()

// Bootstrap feature-flagged background workers (side-effect module init)
if (TranscriptionFlags.ENABLE_ORPHAN_WORKER) {
  try {
    GlobalOrphanWorker.start()
    console.debug('[TranscriptionFlags] OrphanWorker started')
  } catch (e) {
    console.warn('[TranscriptionFlags] Failed to start OrphanWorker', e)
  }
}
