import {TranscriptionWithSource, TranscriptionSource} from '../services/TranscriptionSourceManager'

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
  streamingTimeout: 30000, // 30 seconds
  maxStaticTranscripts: 1000,
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

  constructor(config: Partial<StateTransitionConfig> = {}) {
    this.state = {...DEFAULT_STATE}
    this.config = {...DEFAULT_CONFIG, ...config}

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
    // Complete any active streaming first
    if (this.state.streaming.isActive) {
      this.completeStreaming()
    }

    const streamingTranscription: StreamingTranscription = {
      ...transcription,
      progress: 0,
      isPartial: true
    }

    this.state.streaming.current = streamingTranscription
    this.state.streaming.isActive = true
    this.state.streaming.progress = 0

    // Set up auto-completion timeout
    if (this.config.autoCompleteStreaming) {
      this.streamingTimeoutId = setTimeout(() => {
        this.completeStreaming()
      }, this.config.streamingTimeout)
    }

    this.notifyListeners('streaming-started')
  }

  /**
   * Update streaming transcription
   */
  updateStreaming(text: string, isPartial: boolean = true): void {
    if (!this.state.streaming.current) {
      console.warn('TranscriptionStateManager: Cannot update streaming - no active stream')
      return
    }

    // Update current streaming transcription
    this.state.streaming.current = {
      ...this.state.streaming.current,
      text,
      isPartial,
      timestamp: Date.now()
    }

    // Calculate progress (rough estimation based on text length changes)
    if (!isPartial) {
      this.state.streaming.progress = 1
    } else {
      // Simple heuristic: progress based on text stability
      this.state.streaming.progress = Math.min(0.9, text.length / 100)
    }

    this.notifyListeners('streaming-updated')

    // Auto-complete if text is final
    if (!isPartial && this.config.autoCompleteStreaming) {
      this.completeStreaming()
    }
  }

  /**
   * Complete streaming and move to static transcripts
   */
  completeStreaming(): void {
    if (!this.state.streaming.current) {
      return
    }

    const completedTranscription = this.state.streaming.current

    // Add to static transcripts
    const staticTranscript: TranscriptionResult = {
      id: completedTranscription.id,
      text: completedTranscription.text,
      timestamp: completedTranscription.timestamp,
      confidence: completedTranscription.confidence,
      source: this.sourceToString(completedTranscription.source)
    }

    this.addStaticTranscript(staticTranscript)

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
  performGarbageCollection(): void {
    const {maxStaticTranscripts, memoryThreshold} = this.config
    const {transcripts} = this.state.static
    const {estimatedSize} = this.state.meta.memoryUsage

    // Remove old transcripts if we exceed limits
    if (transcripts.length > maxStaticTranscripts || estimatedSize > memoryThreshold) {
      const targetCount = Math.floor(maxStaticTranscripts * 0.8) // Keep 80% of max

      if (transcripts.length > targetCount) {
        // Remove oldest transcripts first
        const transcriptsToKeep = transcripts
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, targetCount)

        this.state.static.transcripts = transcriptsToKeep
        this.updateMetadata()

        console.log(
          `TranscriptionStateManager: Garbage collected ${transcripts.length - targetCount} old transcripts`
        )
      }
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
    this.state.static.transcripts.push(transcript)
    this.state.static.lastUpdate = Date.now()
    this.updateMetadata()
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
    // Run garbage collection every 5 minutes
    this.garbageCollectionIntervalId = setInterval(
      () => {
        this.performGarbageCollection()
      },
      5 * 60 * 1000
    )
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
