import {TranscriptionWithSource, TranscriptionSource} from '../services/TranscriptionSourceManager'
import {
  generateTranscriptId,
  areTranscriptsDuplicate,
  sanitizeTranscript,
  processTranscriptsWithMetrics
} from '../utils/transcript-deduplication'

// WebSocket diagnostics
import {
  logWebSocketTiming,
  startWebSocketTiming,
  endWebSocketTiming
} from '../utils/websocket-diagnostics'

// Performance optimizations
import {
  getPerformanceManager,
  type PerformanceMode,
  type TranscriptionPerformanceManager,
  type PerformanceMonitor
} from '../utils/performance-config'
import {
  PerformanceDebouncer,
  AdaptiveThrottle,
  MemoryEfficientQueue,
  FrameRateLimiter
} from '../utils/performance-debounce'

// Performance profiling
import {markPerformance, PERFORMANCE_MARKERS} from '../utils/performance-profiler'

/**
 * Performance monitoring utilities for transcription system
 */
interface PerformanceMetrics {
  updateCount: number
  averageUpdateTime: number
  maxUpdateTime: number
  throttledUpdates: number
  lastUpdateTime: number
}

/**
 * Core transcription result interface
 */
export interface TranscriptionResult {
  id: string
  text: string
  timestamp: number
  confidence?: number
  source?: string
  duration?: number
  startTime?: number
  endTime?: number
}

/**
 * Streaming transcription with progress tracking
 */
export interface StreamingTranscription extends TranscriptionWithSource {
  progress: number // 0-1 for animation completion
  isPartial: boolean
}

/**
 * Complete transcription state structure
 */
export interface TranscriptionState {
  streaming: {
    current: StreamingTranscription | null
    isActive: boolean
    progress: number
    mode: 'character' | 'word' | 'instant'
    completionCallbacks: Array<() => void>
  }
  static: {
    transcripts: TranscriptionResult[]
    isLoading: boolean
    lastUpdate: number
  }
  meta: {
    totalCount: number
    sessionStartTime: number
    memoryUsage: {
      transcriptCount: number
      estimatedSize: number // bytes
    }
  }
  recording: {
    isRecording: boolean
    isProcessing: boolean
    recordingTime: number
    status: string
  }
}

/**
 * State change event types
 */
export type StateChangeType =
  | 'streaming-started'
  | 'streaming-updated'
  | 'streaming-completed'
  | 'transcript-added'
  | 'transcript-batch-update'
  | 'transcripts-cleared'
  | 'recording-changed'
  | 'processing-changed'

/**
 * State change listener interface
 */
export interface StateChangeListener {
  (type: StateChangeType, state: TranscriptionState): void
}

/**
 * State transition configuration
 */
export interface StateTransitionConfig {
  autoCompleteStreaming: boolean
  streamingTimeout: number // ms
  maxStaticTranscripts: number
  memoryThreshold: number // bytes
  enableGarbageCollection: boolean
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: StateTransitionConfig = {
  autoCompleteStreaming: true,
  streamingTimeout: 3000, // 3 seconds for real-time responsiveness
  maxStaticTranscripts: 500,
  memoryThreshold: 50 * 1024 * 1024, // 50MB
  enableGarbageCollection: true
}

/**
 * Default state
 */
const DEFAULT_STATE: TranscriptionState = {
  streaming: {
    current: null,
    isActive: false,
    progress: 0,
    mode: 'character',
    completionCallbacks: []
  },
  static: {
    transcripts: [],
    isLoading: false,
    lastUpdate: 0
  },
  meta: {
    totalCount: 0,
    sessionStartTime: Date.now(),
    memoryUsage: {
      transcriptCount: 0,
      estimatedSize: 0
    }
  },
  recording: {
    isRecording: false,
    isProcessing: false,
    recordingTime: 0,
    status: 'Ready'
  }
}

/**
 * Unified Transcription State Manager
 *
 * Single source of truth for all transcription-related state with:
 * - Clear separation between streaming and static content
 * - Proper state lifecycle management
 * - Performance optimization and memory management
 * - Event-driven architecture for efficient updates
 */
export class TranscriptionStateManager {
  private state: TranscriptionState
  private listeners: Set<StateChangeListener> = new Set()
  private config: StateTransitionConfig
  private streamingTimeoutId: NodeJS.Timeout | null = null
  private garbageCollectionIntervalId: NodeJS.Timeout | null = null
  private performanceMetrics: PerformanceMetrics = {
    updateCount: 0,
    averageUpdateTime: 0,
    maxUpdateTime: 0,
    throttledUpdates: 0,
    lastUpdateTime: 0
  }
  // Accumulation helpers to prevent loss of earlier partial segments when model restarts or fragments
  private streamingAccumulatedText: string = ''
  private streamingLastPartial: string = ''
  // Keep historical partial snapshots to guard against model regressions / truncations
  private streamingSnapshots: string[] = []
  // Stable ID used for all partial updates (so UI replaces rather than appends multiples)
  private stableStreamingId: string | null = null
  // Raw partials sequence for diagnostics (capped)
  private streamingRawPartials: string[] = []
  // Feature flag for regression guard (disabled by default after observing excessive skips)
  private enableRegressionGuard = false
  private totalUpdateTime = 0 // For calculating averages
  private updateThrottleTimeout: NodeJS.Timeout | null = null
  private readonly UPDATE_THROTTLE_MS = 0 // Disable throttling for immediate real-time updates

  // Enhanced performance optimization components
  private performanceManager: TranscriptionPerformanceManager
  private updateDebouncer: PerformanceDebouncer<TranscriptionResult>
  private throttler: AdaptiveThrottle<() => void>
  private updateQueue: MemoryEfficientQueue<TranscriptionResult>
  private frameLimiter: FrameRateLimiter

  constructor(config: Partial<StateTransitionConfig> = {}) {
    this.state = {...DEFAULT_STATE}
    this.config = {...DEFAULT_CONFIG, ...config}

    // Initialize performance components
    this.performanceManager = getPerformanceManager()
    this.updateQueue = new MemoryEfficientQueue<TranscriptionResult>(
      this.performanceManager.getConfig().maxTranscriptHistory,
      0.8
    )

    // Initialize debouncer for batch processing
    this.updateDebouncer = new PerformanceDebouncer<TranscriptionResult>(
      batch => this.processBatchedUpdates(batch),
      this.performanceManager.getConfig().debounceMs,
      {maxWait: 500},
      this.performanceManager.getConfig().maxBatchSize,
      this.performanceManager.getConfig().batchWindowMs
    )

    // Initialize adaptive throttler
    this.throttler = new AdaptiveThrottle<() => void>(
      callback => callback(),
      this.performanceManager.getConfig().throttleMs,
      () =>
        this.performanceManager.getThrottleDelay() / this.performanceManager.getConfig().throttleMs
    )

    // Initialize frame rate limiter
    this.frameLimiter = new FrameRateLimiter(60) // Start with 60 FPS

    // Load transcripts from localStorage if available
    if (this.isLocalStorageAvailable()) {
      try {
        const saved = localStorage.getItem('dao-copilot.transcripts')
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) {
            console.log('🔍 TranscriptionStateManager: Loaded transcripts from localStorage:', {
              count: parsed.length,
              samples: parsed.slice(-3).map(t => ({
                id: t.id,
                text: t.text?.slice(0, 30) + '...',
                timestamp: t.timestamp
              }))
            })
            this.state.static.transcripts = parsed
          }
        } else {
          console.log('🔍 TranscriptionStateManager: No transcripts found in localStorage')
        }
      } catch (e) {
        console.warn('TranscriptionStateManager: Failed to load transcripts from localStorage', e)
      }
    }

    // Initialize garbage collection if enabled
    if (this.config.enableGarbageCollection) {
      this.startGarbageCollection()
    }
  }

  /**
   * Get current state (readonly)
   */
  getState(): Readonly<TranscriptionState> {
    return {...this.state}
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener)

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Start streaming transcription
   */
  startStreaming(transcription: TranscriptionWithSource): void {
    // Mark transcription initialization start
    markPerformance(PERFORMANCE_MARKERS.TRANSCRIPTION_INIT_START)

    const streamingId = `streaming-start-${Date.now()}`
    startWebSocketTiming(streamingId, {
      transcriptionId: transcription.id,
      source: transcription.source,
      textLength: transcription.text.length
    })

    // Complete any active streaming first
    if (this.state.streaming.isActive) {
      this.completeStreaming()
    }

    const streamingTranscription: StreamingTranscription = {
      ...transcription,
      progress: 0,
      isPartial: true
    }

    // Establish a stable ID for this streaming session (prefer incoming id else generate deterministic one)
    this.stableStreamingId = streamingTranscription.id || `stream_${Date.now()}`
    streamingTranscription.id = this.stableStreamingId

    this.state.streaming.current = streamingTranscription
    this.state.streaming.isActive = true
    this.state.streaming.progress = 0

    // Initialize accumulation buffers
    this.streamingAccumulatedText = transcription.text || ''
    this.streamingLastPartial = transcription.text || ''
    this.streamingSnapshots = transcription.text ? [transcription.text] : []

    // Mark transcription system as ready
    markPerformance(PERFORMANCE_MARKERS.TRANSCRIPTION_READY)

    // Set up auto-completion timeout
    if (this.config.autoCompleteStreaming) {
      this.streamingTimeoutId = setTimeout(() => {
        this.completeStreaming()
      }, this.config.streamingTimeout)
    }

    const startTime = endWebSocketTiming(streamingId)
    logWebSocketTiming('streaming-started', startTime, {
      transcriptionId: transcription.id,
      textLength: transcription.text.length
    })

    this.notifyListeners('streaming-started')
  }

  /**
   * Update streaming transcription
   */
  /**
   * Update streaming transcription text
   */
  updateStreaming(text: string, isPartial: boolean = true): void {
    if (!this.state.streaming.current) {
      console.warn('TranscriptionStateManager: Cannot update streaming - no active stream')
      return
    }

    const updateId = `streaming-update-${Date.now()}`
    startWebSocketTiming(updateId, {
      isPartial,
      textLength: text.length,
      previousLength: this.state.streaming.current.text.length
    })

    // Optimize for real-time rendering: update state immediately, throttle notifications
    if (isPartial) {
      const newClean = text.trim()
      if (newClean.length === 0) {
        const updateTime = endWebSocketTiming(updateId)
        logWebSocketTiming('streaming-updated-partial', updateTime, {
          textLength: 0,
          throttled: false
        })
        return
      }

      // IMPORTANT: Reset the auto-complete timeout on every partial activity so an active
      // speaking session isn't force-completed after the initial fixed window (default 3s).
      // Previously we only scheduled the timeout at startStreaming which caused the stream to
      // auto-complete even while new partials were still arriving (observed as "stops after a few chunks").
      if (this.config.autoCompleteStreaming) {
        if (this.streamingTimeoutId) clearTimeout(this.streamingTimeoutId)
        this.streamingTimeoutId = setTimeout(() => {
          console.debug('[StreamingTimeout] Auto-completing stream after inactivity window', {
            timeoutMs: this.config.streamingTimeout,
            accumulatedLength: this.streamingAccumulatedText.length
          })
          this.completeStreaming()
        }, this.config.streamingTimeout)
      }

      const prevPartial = this.streamingLastPartial
      let accumulated = this.streamingAccumulatedText
      // Collect raw partials for diagnostics
      this.streamingRawPartials.push(newClean)
      if (this.streamingRawPartials.length > 200) this.streamingRawPartials.shift()

      // Optional regression guard (currently disabled by default). If enabled, only skip when
      // there's a drastic shrink (>60% reduction) AND newClean is a subset of accumulated.
      if (this.enableRegressionGuard && accumulated.length > 40) {
        const shrinkRatio = newClean.length / Math.max(prevPartial.length, 1)
        if (shrinkRatio < 0.4 && accumulated.includes(newClean)) {
          console.debug('[RegressionGuard] Skipping suspected truncation fragment', {
            accumulatedLen: accumulated.length,
            prevLen: prevPartial.length,
            newLen: newClean.length,
            newClean
          })
          const updateTime = endWebSocketTiming(updateId)
          logWebSocketTiming('streaming-updated-partial-skipped-regression', updateTime, {
            textLength: accumulated.length,
            throttled: false
          })
          return
        }
      }

      // Helper: find overlap between end of accumulated and start of newClean
      const findOverlap = (a: string, b: string): number => {
        const max = Math.min(a.length, b.length)
        for (let len = max; len > 0; len--) {
          if (a.endsWith(b.slice(0, len))) return len
        }
        return 0
      }

      const hasWordOverlap = (a: string, b: string): boolean => {
        const tail = a.split(/\s+/).slice(-4).join(' ')
        return b.includes(tail) || a.includes(b)
      }

      if (!accumulated) {
        accumulated = newClean
      } else if (newClean.startsWith(prevPartial) && newClean.length >= prevPartial.length) {
        // Model is giving expanding prefix - treat newClean as the full current accumulated segment
        accumulated = accumulated.endsWith(prevPartial)
          ? accumulated.slice(0, accumulated.length - prevPartial.length) + newClean
          : newClean.length > accumulated.length
            ? newClean
            : accumulated
      } else if (
        prevPartial &&
        (prevPartial.startsWith(newClean) || !hasWordOverlap(prevPartial, newClean))
      ) {
        // Reset or new fragment: append previous partial if not already fully captured
        if (!accumulated.endsWith(prevPartial)) {
          accumulated += (accumulated ? ' ' : '') + prevPartial
        }
        if (!accumulated.endsWith(newClean) && !accumulated.includes(newClean)) {
          accumulated += (accumulated ? ' ' : '') + newClean
        }
      } else {
        // Overlap case: merge intelligently
        const overlap = findOverlap(accumulated, newClean)
        accumulated += newClean.slice(overlap)
      }

      // De-duplicate accidental double spaces
      accumulated = accumulated.replace(/\s{2,}/g, ' ').trim()

      this.streamingAccumulatedText = accumulated
      this.streamingLastPartial = newClean
      if (
        this.streamingSnapshots.length === 0 ||
        this.streamingSnapshots[this.streamingSnapshots.length - 1] !== accumulated
      ) {
        this.streamingSnapshots.push(accumulated)
        // Cap snapshots to prevent unbounded memory (keep last 50)
        if (this.streamingSnapshots.length > 50) this.streamingSnapshots.shift()
      }

      if (this.state.streaming.current) {
        this.state.streaming.current = {
          ...this.state.streaming.current,
          // Use accumulated combined text for display to avoid losing earlier fragments
          text: accumulated,
          isPartial: true,
          timestamp: Date.now()
        }
        this.state.streaming.progress = Math.min(0.9, accumulated.length / 120)
      }

      // Persist combined partial
      try {
        import('../state/transcript-state').then(({useTranscriptStore}) => {
          useTranscriptStore.getState().addPartialEntry({
            text: accumulated,
            id:
              this.stableStreamingId || this.state.streaming.current?.id || `partial_${Date.now()}`
          })
        })
      } catch (error) {
        console.error('Failed to persist accumulated partial transcription:', error)
      }

      // Lightweight telemetry (can be replaced with unified telemetry system)
      if (accumulated.length % 200 === 0) {
        console.debug(
          '[AccumulationTelemetry] length',
          accumulated.length,
          'snapshots',
          this.streamingSnapshots.length
        )
        console.debug(
          '[AccumulationTelemetry] rawPartials(count,last5)',
          this.streamingRawPartials.length,
          this.streamingRawPartials.slice(-5)
        )
      }

      const updateTime = endWebSocketTiming(updateId)
      logWebSocketTiming('streaming-updated-partial', updateTime, {
        textLength: accumulated.length,
        throttled: false
      })
      this.notifyListeners('streaming-updated')
    } else {
      // Immediate updates for final text
      const finalClean = text.trim()
      // Prefer accumulated if it contains more content
      const chosen =
        this.streamingAccumulatedText.length > finalClean.length
          ? this.streamingAccumulatedText
          : finalClean
      this.state.streaming.current = {
        ...this.state.streaming.current,
        text: chosen,
        isPartial: false,
        timestamp: Date.now()
      }

      this.state.streaming.progress = 1

      // CRITICAL FIX: Persist final transcriptions to transcript store
      if (chosen.length > 0) {
        try {
          import('../state/transcript-state').then(({useTranscriptStore}) => {
            useTranscriptStore.getState().addFinalEntry({
              text: chosen,
              id:
                this.stableStreamingId || this.state.streaming.current?.id || `final_${Date.now()}`
            })
          })
        } catch (error) {
          console.error('Failed to persist final transcription:', error)
        }
      }

      const updateTime = endWebSocketTiming(updateId)
      logWebSocketTiming('streaming-updated-final', updateTime, {
        textLength: text.length,
        throttled: false
      })

      this.notifyListeners('streaming-updated')

      // Auto-complete if text is final
      if (this.config.autoCompleteStreaming) {
        this.completeStreaming()
      }
    }
  }

  /**
   * Complete streaming and move to static transcripts
   */
  completeStreaming(): void {
    if (!this.state.streaming.current) {
      console.log('🔍 completeStreaming: No current streaming transcript to complete')
      return
    }

    const completedTranscription = this.state.streaming.current

    console.log('🔍 completeStreaming: Completing streaming transcript:', {
      originalId: completedTranscription.id,
      text: completedTranscription.text.slice(0, 50) + '...',
      timestamp: completedTranscription.timestamp,
      source: completedTranscription.source
    })

    // Create static transcript with enhanced ID generation
    // Prefer accumulated text if it captured more segments than the current final snapshot
    const finalText =
      this.streamingAccumulatedText.length > completedTranscription.text.length
        ? this.streamingAccumulatedText
        : completedTranscription.text

    const staticTranscriptBase = {
      text: finalText,
      timestamp: completedTranscription.timestamp,
      confidence: completedTranscription.confidence,
      source: this.sourceToString(completedTranscription.source)
    }

    // Use enhanced ID generation
    const transcriptWithId: TranscriptionResult = {
      ...staticTranscriptBase,
      id: generateTranscriptId(staticTranscriptBase)
    }

    console.log(
      '🔍 completeStreaming: Created static transcript with enhanced ID:',
      transcriptWithId.id
    )

    this.addStaticTranscript(transcriptWithId)

    // Execute completion callbacks before clearing state
    this.state.streaming.completionCallbacks.forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.error('Error executing streaming completion callback:', error)
      }
    })

    // Clear streaming state
    this.clearStreamingState()
    this.streamingAccumulatedText = ''
    this.streamingLastPartial = ''
    this.streamingSnapshots = []
    this.stableStreamingId = null

    this.notifyListeners('streaming-completed')
  }

  /**
   * Clear current streaming state
   */
  clearStreaming(): void {
    this.clearStreamingState()
    this.notifyListeners('streaming-completed')
  }

  /**
   * Add static transcript
   */
  addTranscript(transcript: TranscriptionResult): void {
    console.log('🔍 addTranscript: Public method called with:', {
      id: transcript.id,
      text: transcript.text.slice(0, 50) + '...',
      timestamp: transcript.timestamp,
      source: transcript.source
    })
    this.addStaticTranscript(transcript)
    this.notifyListeners('transcript-added')
  }

  /**
   * Clear all transcripts
   */
  clearTranscripts(): void {
    this.state.static.transcripts = []
    this.state.static.lastUpdate = Date.now()
    this.updateMetadata()
    this.notifyListeners('transcripts-cleared')
  }

  /**
   * Set recording state
   */
  setRecordingState(
    isRecording: boolean,
    recordingTime: number = 0,
    status: string = 'Ready'
  ): void {
    this.state.recording.isRecording = isRecording
    this.state.recording.recordingTime = recordingTime
    this.state.recording.status = status
    this.notifyListeners('recording-changed')
  }

  /**
   * Set processing state
   */
  setProcessingState(isProcessing: boolean): void {
    this.state.recording.isProcessing = isProcessing
    this.notifyListeners('processing-changed')
  }

  /**
   * Set streaming mode
   */
  setStreamingMode(mode: 'character' | 'word' | 'instant'): void {
    this.state.streaming.mode = mode
  }

  /**
   * Add streaming completion callback
   */
  onStreamingComplete(callback: () => void): () => void {
    this.state.streaming.completionCallbacks.push(callback)

    // Return unsubscribe function
    return () => {
      const index = this.state.streaming.completionCallbacks.indexOf(callback)
      if (index > -1) {
        this.state.streaming.completionCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryUsage(): {transcriptCount: number; estimatedSize: number} {
    return {...this.state.meta.memoryUsage}
  }

  /**
   * Force garbage collection
   */
  /**
   * Perform enhanced deduplication using the advanced algorithm
   */
  private performEnhancedDeduplication(): void {
    const startTime = performance.now()
    const originalCount = this.state.static.transcripts.length

    console.log('[Enhanced Dedup] Starting enhanced deduplication...', {
      transcriptCount: originalCount
    })

    // Use the enhanced deduplication utility with metrics
    const {transcripts: deduplicatedTranscripts, metrics} = processTranscriptsWithMetrics(
      this.state.static.transcripts,
      {
        checkIds: true,
        checkContentAndTimestamp: true,
        checkFuzzyContent: false, // Keep disabled for performance
        fuzzyThreshold: 0.9,
        timeWindow: 5000
      }
    )

    // Update state if duplicates were found
    if (metrics.duplicatesFound > 0) {
      this.state.static.transcripts = deduplicatedTranscripts
      this.updateMetadata()

      console.log('[Enhanced Dedup] Deduplication completed:', {
        originalCount,
        finalCount: deduplicatedTranscripts.length,
        duplicatesRemoved: metrics.duplicatesFound,
        processingTimeMs: metrics.processingTimeMs.toFixed(2),
        overallTimeMs: (performance.now() - startTime).toFixed(2)
      })

      // Persist the cleaned data
      this.saveToLocalStorage()
    } else {
      console.log('[Enhanced Dedup] No duplicates found, skipping update')
    }
  }

  /**
   * Advanced garbage collection with multiple cleanup strategies
   */
  performGarbageCollection(): void {
    const startTime = performance.now()
    const initialMemory = this.state.meta.memoryUsage.estimatedSize

    console.log('[GC] Starting garbage collection...', {
      transcripts: this.state.static.transcripts.length,
      estimatedMemory: `${(initialMemory / 1024 / 1024).toFixed(2)}MB`
    })

    // Strategy 1: Remove old transcripts based on count and memory thresholds
    this.cleanupOldTranscripts()

    // Strategy 2: Remove duplicate or similar transcripts
    this.deduplicateTranscripts()

    // Strategy 3: Compress long transcripts
    this.compressLongTranscripts()

    // Strategy 4: Clean up orphaned streaming state
    this.cleanupOrphanedState()

    // Update metadata after all cleanup
    this.updateMetadata()

    // Save to localStorage after cleanup
    this.saveToLocalStorage()

    const endTime = performance.now()
    const finalMemory = this.state.meta.memoryUsage.estimatedSize
    const memorySaved = initialMemory - finalMemory

    console.log('[GC] Garbage collection completed', {
      duration: `${(endTime - startTime).toFixed(2)}ms`,
      memorySaved: `${(memorySaved / 1024 / 1024).toFixed(2)}MB`,
      finalTranscripts: this.state.static.transcripts.length,
      finalMemory: `${(finalMemory / 1024 / 1024).toFixed(2)}MB`
    })
  }

  /**
   * Clean up old transcripts based on various criteria
   */
  private cleanupOldTranscripts(): void {
    const {maxStaticTranscripts, memoryThreshold} = this.config
    const {transcripts} = this.state.static
    const {estimatedSize} = this.state.meta.memoryUsage

    if (transcripts.length <= maxStaticTranscripts && estimatedSize <= memoryThreshold) {
      return // No cleanup needed
    }

    const now = Date.now()

    // Prioritize keeping recent, high-confidence, or long transcripts
    const prioritizedTranscripts = transcripts
      .map(transcript => ({
        transcript,
        priority: this.calculateTranscriptPriority(transcript, now)
      }))
      .sort((a, b) => b.priority - a.priority)

    let targetCount = maxStaticTranscripts

    // If memory pressure is high, be more aggressive
    if (estimatedSize > memoryThreshold * 1.5) {
      targetCount = Math.floor(maxStaticTranscripts * 0.6)
    } else if (estimatedSize > memoryThreshold) {
      targetCount = Math.floor(maxStaticTranscripts * 0.8)
    }

    const transcriptsToKeep = prioritizedTranscripts
      .slice(0, targetCount)
      .map(item => item.transcript)

    this.state.static.transcripts = transcriptsToKeep
  }

  /**
   * Calculate priority score for transcript retention
   */
  private calculateTranscriptPriority(
    transcript: TranscriptionResult,
    currentTime: number
  ): number {
    let priority = 0

    // Recent transcripts get higher priority
    const age = currentTime - transcript.timestamp
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 1 week
    priority += Math.max(0, (maxAge - age) / maxAge) * 40

    // High confidence gets higher priority
    if (transcript.confidence) {
      priority += transcript.confidence * 30
    }

    // Longer transcripts (more content) get higher priority
    const textLength = transcript.text ? transcript.text.length : 0
    priority += Math.min(textLength / 100, 20) // Cap at 20 points

    // Transcripts with audio get higher priority (they're complete)
    if ('audioUrl' in transcript) {
      priority += 10
    }

    return priority
  }

  /**
   * Remove duplicate or very similar transcripts
   */
  private deduplicateTranscripts(): void {
    const transcripts = this.state.static.transcripts
    if (transcripts.length < 2) return

    const uniqueTranscripts: TranscriptionResult[] = []
    const seenTexts = new Set<string>()

    for (const transcript of transcripts) {
      const text = transcript.text?.toLowerCase().trim()
      if (!text) continue

      // Check for exact duplicates
      if (seenTexts.has(text)) {
        continue
      }

      // Check for very similar transcripts (>90% similarity)
      let isSimilar = false
      for (const existingText of seenTexts) {
        if (this.calculateTextSimilarity(text, existingText) > 0.9) {
          isSimilar = true
          break
        }
      }

      if (!isSimilar) {
        uniqueTranscripts.push(transcript)
        seenTexts.add(text)
      }
    }

    const duplicatesRemoved = transcripts.length - uniqueTranscripts.length
    if (duplicatesRemoved > 0) {
      console.log(`[GC] Removed ${duplicatesRemoved} duplicate/similar transcripts`)
      this.state.static.transcripts = uniqueTranscripts
    }
  }

  /**
   * Calculate text similarity using simple algorithm
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.split(/\s+/)
    const words2 = text2.split(/\s+/)

    if (words1.length === 0 && words2.length === 0) return 1
    if (words1.length === 0 || words2.length === 0) return 0

    const commonWords = words1.filter(word => words2.includes(word))
    return (commonWords.length * 2) / (words1.length + words2.length)
  }

  /**
   * Compress long transcripts to save memory
   */
  private compressLongTranscripts(): void {
    const maxLength = 2000 // Characters
    const transcripts = this.state.static.transcripts

    let compressedCount = 0

    for (const transcript of transcripts) {
      if (transcript.text && transcript.text.length > maxLength) {
        // Keep beginning and end, truncate middle
        const beginning = transcript.text.slice(0, maxLength * 0.3)
        const ending = transcript.text.slice(-maxLength * 0.3)
        const compressed = `${beginning}... [truncated ${transcript.text.length - maxLength} characters] ...${ending}`

        transcript.text = compressed
        Object.assign(transcript, {compressed: true})
        compressedCount++
      }
    }

    if (compressedCount > 0) {
      console.log(`[GC] Compressed ${compressedCount} long transcripts`)
    }
  }

  /**
   * Clean up orphaned streaming state
   */
  private cleanupOrphanedState(): void {
    // Clear stale streaming state if no active streaming for more than 5 minutes
    if (this.state.streaming.current && !this.state.streaming.isActive) {
      const streamAge = Date.now() - this.state.streaming.current.timestamp
      if (streamAge > 5 * 60 * 1000) {
        // 5 minutes
        console.log('[GC] Cleaning up orphaned streaming state')
        this.clearStreamingState()
      }
    }
  }

  /**
   * Check if localStorage is available (not available in main process)
   */
  private isLocalStorageAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
    } catch {
      return false
    }
  }

  /**
   * Save transcripts to localStorage with error handling
   */
  private saveToLocalStorage(): void {
    // Skip localStorage operations in main process
    if (!this.isLocalStorageAvailable()) {
      return
    }

    try {
      const data = {
        transcripts: this.state.static.transcripts,
        metadata: {
          lastSaved: Date.now(),
          version: '1.0'
        }
      }
      localStorage.setItem('dao-copilot.transcripts', JSON.stringify(data))
    } catch (e) {
      console.warn('[GC] Failed to save transcripts to localStorage:', e)

      // If localStorage is full, try to free up space
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        this.handleStorageQuotaExceeded()
      }
    }
  }

  /**
   * Handle localStorage quota exceeded by aggressive cleanup
   */
  private handleStorageQuotaExceeded(): void {
    console.warn('[GC] localStorage quota exceeded, performing aggressive cleanup')

    if (!this.isLocalStorageAvailable()) {
      return
    }

    const originalLength = this.state.static.transcripts.length

    // Keep only the most recent 20% of transcripts
    const keepCount = Math.max(10, Math.floor(originalLength * 0.2))
    this.state.static.transcripts = this.state.static.transcripts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, keepCount)

    this.updateMetadata()

    // Try saving again
    try {
      const data = {
        transcripts: this.state.static.transcripts,
        metadata: {
          lastSaved: Date.now(),
          version: '1.0',
          emergencyCleanup: true
        }
      }
      localStorage.setItem('dao-copilot.transcripts', JSON.stringify(data))
      console.log(
        `[GC] Emergency cleanup successful, kept ${keepCount}/${originalLength} transcripts`
      )
    } catch {
      console.error('[GC] Emergency cleanup failed, clearing all transcripts from localStorage')
      localStorage.removeItem('dao-copilot.transcripts')
    }
  }

  /**
   * Detect memory pressure and trigger appropriate responses
   */
  private detectMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const memoryInfo = (
      performance as Performance & {
        memory?: {
          usedJSHeapSize: number
          jsHeapSizeLimit: number
        }
      }
    ).memory

    if (!memoryInfo) return 'low'

    const usagePercent = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100
    const transcriptMemory = this.state.meta.memoryUsage.estimatedSize

    if (usagePercent > 90 || transcriptMemory > 100 * 1024 * 1024) {
      // 100MB
      return 'critical'
    } else if (usagePercent > 75 || transcriptMemory > 50 * 1024 * 1024) {
      // 50MB
      return 'high'
    } else if (usagePercent > 50 || transcriptMemory > 25 * 1024 * 1024) {
      // 25MB
      return 'medium'
    }

    return 'low'
  }

  /**
   * Handle memory pressure with appropriate strategies
   */
  handleMemoryPressure(): void {
    const pressure = this.detectMemoryPressure()

    switch (pressure) {
      case 'critical':
        console.warn('[Memory] Critical memory pressure detected')
        this.config.maxStaticTranscripts = Math.max(
          10,
          Math.floor(this.config.maxStaticTranscripts * 0.3)
        )
        this.performGarbageCollection()
        break

      case 'high':
        console.warn('[Memory] High memory pressure detected')
        this.config.maxStaticTranscripts = Math.max(
          20,
          Math.floor(this.config.maxStaticTranscripts * 0.5)
        )
        this.performGarbageCollection()
        break

      case 'medium':
        console.log('[Memory] Medium memory pressure detected')
        this.performGarbageCollection()
        break

      case 'low':
      default:
        // No action needed
        break
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    transcriptCount: number
    estimatedSize: number
    memoryPressure: 'low' | 'medium' | 'high' | 'critical'
    jsHeapUsed?: number
    jsHeapLimit?: number
    storageUsed?: number
  } {
    const memoryInfo = (
      performance as Performance & {
        memory?: {
          usedJSHeapSize: number
          jsHeapSizeLimit: number
        }
      }
    ).memory

    let storageUsed = 0
    if (this.isLocalStorageAvailable()) {
      try {
        const stored = localStorage.getItem('dao-copilot.transcripts')
        if (stored) {
          storageUsed = new Blob([stored]).size
        }
      } catch {
        // Ignore storage access errors
      }
    }

    return {
      transcriptCount: this.state.static.transcripts.length,
      estimatedSize: this.state.meta.memoryUsage.estimatedSize,
      memoryPressure: this.detectMemoryPressure(),
      jsHeapUsed: memoryInfo?.usedJSHeapSize,
      jsHeapLimit: memoryInfo?.jsHeapSizeLimit,
      storageUsed
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    // Clear timeouts
    if (this.streamingTimeoutId) {
      clearTimeout(this.streamingTimeoutId)
      this.streamingTimeoutId = null
    }

    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout)
      this.updateThrottleTimeout = null
    }

    if (this.garbageCollectionIntervalId) {
      clearInterval(this.garbageCollectionIntervalId)
      this.garbageCollectionIntervalId = null
    }

    // Clear listeners
    this.listeners.clear()

    // Clear state
    this.clearStreamingState()
    this.state.static.transcripts = []
    this.updateMetadata()
  }

  // Private methods

  private clearStreamingState(): void {
    if (this.streamingTimeoutId) {
      clearTimeout(this.streamingTimeoutId)
      this.streamingTimeoutId = null
    }

    this.state.streaming.current = null
    this.state.streaming.isActive = false
    this.state.streaming.progress = 0
    this.state.streaming.completionCallbacks = []
  }

  private addStaticTranscript(transcript: TranscriptionResult): void {
    if (!Array.isArray(this.state.static.transcripts)) {
      console.error(
        'TranscriptionStateManager: transcripts is not an array, resetting to empty array'
      )
      this.state.static.transcripts = []
    }

    // Sanitize and validate the input transcript
    const sanitizedTranscript = sanitizeTranscript(transcript)
    if (!sanitizedTranscript) {
      console.warn('TranscriptionStateManager: Invalid transcript data, skipping:', transcript)
      return
    }

    // Ensure transcript has a proper ID
    const transcriptWithId: TranscriptionResult = {
      ...sanitizedTranscript,
      id: sanitizedTranscript.id || generateTranscriptId(sanitizedTranscript)
    }

    // Enhanced debugging: Log every attempt to add a transcript
    console.log('🔍 TranscriptionStateManager: Attempting to add transcript:', {
      id: transcriptWithId.id,
      text: transcriptWithId.text.slice(0, 50) + '...',
      timestamp: transcriptWithId.timestamp,
      source: transcriptWithId.source,
      currentTranscriptCount: this.state.static.transcripts.length
    })

    // Use enhanced duplicate detection
    const isDuplicate = this.state.static.transcripts.some(existingTranscript =>
      areTranscriptsDuplicate(transcriptWithId, existingTranscript, {
        checkIds: true,
        checkContentAndTimestamp: true,
        checkFuzzyContent: false, // Disabled for performance
        fuzzyThreshold: 0.9,
        timeWindow: 5000
      })
    )

    // Only add if not a duplicate
    if (isDuplicate) {
      console.log(
        '🚫 TranscriptionStateManager: Duplicate transcript detected (enhanced), skipping:',
        {
          id: transcriptWithId.id,
          text: transcriptWithId.text.slice(0, 50) + '...',
          timestamp: transcriptWithId.timestamp
        }
      )
      return // Exit early without adding or notifying
    }

    console.log('✅ TranscriptionStateManager: Adding new transcript (enhanced validation):', {
      id: transcriptWithId.id,
      newTotal: this.state.static.transcripts.length + 1
    })

    // Add the transcript
    this.state.static.transcripts = this.state.static.transcripts.concat(transcriptWithId)
    this.state.static.lastUpdate = Date.now()
    this.updateMetadata()

    // Perform periodic deduplication with metrics
    if (this.state.static.transcripts.length % 10 === 0) {
      this.performEnhancedDeduplication()
    }

    // Notify listeners of the state change
    this.notifyListeners('transcript-added')

    // Persist transcripts to localStorage
    this.saveToLocalStorage()
  }

  private updateMetadata(): void {
    const transcripts = this.state.static.transcripts

    this.state.meta.totalCount = transcripts.length
    this.state.meta.memoryUsage.transcriptCount = transcripts.length

    // Rough memory estimation (characters * 2 bytes + object overhead)
    this.state.meta.memoryUsage.estimatedSize = transcripts.reduce((total, transcript) => {
      return total + transcript.text.length * 2 + 200 // 200 bytes overhead per object
    }, 0)
  }

  private sourceToString(source: TranscriptionSource): string {
    switch (source) {
      case TranscriptionSource.WEBSOCKET_GEMINI:
        return 'websocket-gemini'
      case TranscriptionSource.STREAMING:
        return 'streaming'
      case TranscriptionSource.BATCH:
        return 'batch'
      default:
        return 'unknown'
    }
  }

  /**
   * Throttled state update to prevent excessive re-renders
   */
  private throttledStateUpdate(updateFn: () => void, type: StateChangeType): void {
    const startTime = performance.now()

    // Clear existing timeout
    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout)
      this.performanceMetrics.throttledUpdates++
    }

    this.updateThrottleTimeout = setTimeout(() => {
      updateFn()
      this.notifyListeners(type)

      // Update performance metrics
      const endTime = performance.now()
      const updateDuration = endTime - startTime

      this.performanceMetrics.updateCount++
      this.totalUpdateTime += updateDuration
      this.performanceMetrics.averageUpdateTime =
        this.totalUpdateTime / this.performanceMetrics.updateCount
      this.performanceMetrics.maxUpdateTime = Math.max(
        this.performanceMetrics.maxUpdateTime,
        updateDuration
      )
      this.performanceMetrics.lastUpdateTime = endTime

      this.updateThrottleTimeout = null
    }, this.UPDATE_THROTTLE_MS)
  }

  /**
   * Process batched updates for better performance
   */
  private processBatchedUpdates(batch: TranscriptionResult[]): void {
    if (batch.length === 0) return

    const startTime = performance.now()
    this.performanceManager.recordFrameTime()

    // Sort batch by timestamp to maintain order
    const sortedBatch = batch.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    // Process each item in the batch
    for (const transcript of sortedBatch) {
      this.updateQueue.enqueue(transcript)
    }

    // Apply batched updates to state
    this.applyQueuedUpdates()

    const endTime = performance.now()
    this.updatePerformanceMetricsInternal(endTime - startTime)
  }

  /**
   * Apply queued updates to state efficiently
   */
  private applyQueuedUpdates(): void {
    const config = this.performanceManager.getConfig()

    // Limit processing to prevent blocking
    let processedCount = 0
    const maxProcessPerFrame = config.maxBatchSize * 2

    while (!this.updateQueue.isEmpty() && processedCount < maxProcessPerFrame) {
      const transcript = this.updateQueue.dequeue()
      if (transcript) {
        // Apply update directly to state without individual notifications
        this.addTranscriptDirectly(transcript)
        processedCount++
      }
    }

    // Single notification for all updates
    if (processedCount > 0) {
      this.notifyListeners('transcript-batch-update')
    }
  }

  /**
   * Add transcript directly to state without notification
   */
  private addTranscriptDirectly(transcript: TranscriptionResult): void {
    try {
      const processedTranscript = sanitizeTranscript(transcript)
      if (!processedTranscript) return

      // Add to static transcripts
      this.state.static.transcripts.push(processedTranscript)

      // Update performance metrics
      this.performanceMetrics.updateCount++

      // Persist to localStorage if enabled
      this.saveToLocalStorage()
    } catch (error) {
      console.error('Failed to add transcript directly:', error)
    }
  }

  /**
   * Update internal performance metrics
   */
  private updatePerformanceMetricsInternal(updateTime: number): void {
    this.totalUpdateTime += updateTime
    this.performanceMetrics.updateCount++
    this.performanceMetrics.averageUpdateTime =
      this.totalUpdateTime / this.performanceMetrics.updateCount
    this.performanceMetrics.maxUpdateTime = Math.max(
      this.performanceMetrics.maxUpdateTime,
      updateTime
    )
    this.performanceMetrics.lastUpdateTime = Date.now()
  }

  /**
   * Enhanced performance mode configuration
   */
  setPerformanceMode(mode: PerformanceMode): void {
    this.performanceManager.setMode(mode)
    const config = this.performanceManager.getConfig()

    // Update frame limiter
    const targetFPS = mode === 'high-fidelity' ? 60 : mode === 'balanced' ? 30 : 15
    this.frameLimiter.setTargetFPS(targetFPS)

    // Update queue size
    this.updateQueue = new MemoryEfficientQueue<TranscriptionResult>(
      config.maxTranscriptHistory,
      0.8
    )

    console.log(`TranscriptionStateManager: Performance mode set to ${mode}`)
  }

  /**
   * Get current performance mode and metrics
   */
  getPerformanceStatus(): {
    mode: PerformanceMode
    internalMetrics: PerformanceMetrics
    performanceMetrics: PerformanceMonitor
    config: ReturnType<TranscriptionPerformanceManager['getConfig']>
  } {
    return {
      mode: this.performanceManager.getConfig().enableRealTimeUpdates
        ? 'high-fidelity'
        : 'performance',
      internalMetrics: this.getPerformanceMetrics(),
      performanceMetrics: this.performanceManager.getMetrics(),
      config: this.performanceManager.getConfig()
    }
  }

  /**
   * Diagnostic info for debugging losses.
   */
  getStreamingDiagnostics(): {
    accumulatedLength: number
    lastPartial: string
    snapshots: number
    rawPartialsCount: number
    lastRawPartials: string[]
    stableId: string | null
    regressionGuardEnabled: boolean
  } {
    return {
      accumulatedLength: this.streamingAccumulatedText.length,
      lastPartial: this.streamingLastPartial,
      snapshots: this.streamingSnapshots.length,
      rawPartialsCount: this.streamingRawPartials.length,
      lastRawPartials: this.streamingRawPartials.slice(-10),
      stableId: this.stableStreamingId,
      regressionGuardEnabled: this.enableRegressionGuard
    }
  }

  /** Enable / disable regression guard dynamically */
  setRegressionGuard(enabled: boolean): void {
    this.enableRegressionGuard = enabled
    console.debug('[Diagnostics] Regression guard set to', enabled)
  }

  /**
   * Throttled notification to listeners without updating state
   * Used for real-time partial updates where state is updated immediately
   */
  private throttledNotification(callback: () => void, type: StateChangeType): void {
    // Clear existing timeout
    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout)
      this.performanceMetrics.throttledUpdates++
    }

    this.updateThrottleTimeout = setTimeout(() => {
      callback()
      this.notifyListeners(type)
      this.updateThrottleTimeout = null
    }, this.UPDATE_THROTTLE_MS)
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      updateCount: this.performanceMetrics.updateCount,
      averageUpdateTime: this.performanceMetrics.averageUpdateTime,
      maxUpdateTime: this.performanceMetrics.maxUpdateTime,
      throttledUpdates: this.performanceMetrics.throttledUpdates,
      lastUpdateTime: this.performanceMetrics.lastUpdateTime
    }
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics.updateCount = 0
    this.totalUpdateTime = 0
    this.performanceMetrics.averageUpdateTime = 0
    this.performanceMetrics.maxUpdateTime = 0
    this.performanceMetrics.throttledUpdates = 0
    this.performanceMetrics.lastUpdateTime = 0
  }

  private notifyListeners(type: StateChangeType): void {
    this.listeners.forEach(listener => {
      try {
        listener(type, this.getState())
      } catch (error) {
        console.error('Error in state change listener:', error)
      }
    })
  }

  private startGarbageCollection(): void {
    // Run garbage collection every 30 minutes (instead of 5 minutes)
    this.garbageCollectionIntervalId = setInterval(
      () => {
        this.performGarbageCollection()
      },
      30 * 60 * 1000
    )

    // Also run memory pressure monitoring every 5 minutes
    setInterval(
      () => {
        this.handleMemoryPressure()
      },
      5 * 60 * 1000
    )

    // Initial memory pressure check
    setTimeout(() => {
      this.handleMemoryPressure()
    }, 10000) // 10 seconds after startup
  }
}

// Singleton instance
let globalStateManager: TranscriptionStateManager | null = null

/**
 * Get the global transcription state manager instance
 */
export function getTranscriptionStateManager(): TranscriptionStateManager {
  if (!globalStateManager) {
    globalStateManager = new TranscriptionStateManager()
  }
  return globalStateManager
}

/**
 * Reset the global state manager (useful for testing)
 */
export function resetTranscriptionStateManager(): void {
  if (globalStateManager) {
    globalStateManager.destroy()
    globalStateManager = null
  }
}
