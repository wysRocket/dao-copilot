import {TranscriptionWithSource, TranscriptionSource} from '../services/TranscriptionSourceManager'

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
  maxStaticTranscripts: 10000, // Increased from 1000
  memoryThreshold: 500 * 1024 * 1024, // 500MB (increased from 50MB)
  enableGarbageCollection: false // Disabled by default
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
  private totalUpdateTime = 0 // For calculating averages
  private updateThrottleTimeout: NodeJS.Timeout | null = null
  private readonly UPDATE_THROTTLE_MS = 50 // Throttle updates to max 20 FPS

  constructor(config: Partial<StateTransitionConfig> = {}) {
    this.state = {...DEFAULT_STATE}
    this.config = {...DEFAULT_CONFIG, ...config}

    // Load transcripts from localStorage if available
    try {
      const saved = localStorage.getItem('dao-copilot.transcripts')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          this.state.static.transcripts = parsed
        }
      }
    } catch (e) {
      console.warn('TranscriptionStateManager: Failed to load transcripts from localStorage', e)
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
  /**
   * Update streaming transcription text
   */
  updateStreaming(text: string, isPartial: boolean = true): void {
    if (!this.state.streaming.current) {
      console.warn('TranscriptionStateManager: Cannot update streaming - no active stream')
      return
    }

    // Use throttled updates for partial text updates to prevent excessive re-renders
    if (isPartial) {
      this.throttledStateUpdate(() => {
        if (this.state.streaming.current) {
          this.state.streaming.current = {
            ...this.state.streaming.current,
            text,
            isPartial,
            timestamp: Date.now()
          }

          // Simple heuristic: progress based on text stability
          this.state.streaming.progress = Math.min(0.9, text.length / 100)
        }
      }, 'streaming-updated')
    } else {
      // Immediate updates for final text
      this.state.streaming.current = {
        ...this.state.streaming.current,
        text,
        isPartial,
        timestamp: Date.now()
      }

      this.state.streaming.progress = 1
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
      return
    }

    const completedTranscription = this.state.streaming.current

    // Add to static transcripts
    const staticTranscript: TranscriptionResult = {
      id: `${completedTranscription.id}-${completedTranscription.timestamp}`,
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
    const oneHourAgo = now - (60 * 60 * 1000)
    const oneDayAgo = now - (24 * 60 * 60 * 1000)
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000)

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
  private calculateTranscriptPriority(transcript: any, currentTime: number): number {
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
    if (transcript.audioUrl) {
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

    const uniqueTranscripts: any[] = []
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
    return commonWords.length * 2 / (words1.length + words2.length)
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
        transcript.compressed = true
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
      if (streamAge > 5 * 60 * 1000) { // 5 minutes
        console.log('[GC] Cleaning up orphaned streaming state')
        this.clearStreamingState()
      }
    }
  }

  /**
   * Save transcripts to localStorage with error handling
   */
  private saveToLocalStorage(): void {
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
      console.log(`[GC] Emergency cleanup successful, kept ${keepCount}/${originalLength} transcripts`)
    } catch (e) {
      console.error('[GC] Emergency cleanup failed, clearing all transcripts from localStorage')
      localStorage.removeItem('dao-copilot.transcripts')
    }
  }

  /**
   * Detect memory pressure and trigger appropriate responses
   */
  private detectMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const memoryInfo = (performance as Performance & { 
      memory?: { 
        usedJSHeapSize: number
        jsHeapSizeLimit: number
      } 
    }).memory

    if (!memoryInfo) return 'low'

    const usagePercent = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100
    const transcriptMemory = this.state.meta.memoryUsage.estimatedSize

    if (usagePercent > 90 || transcriptMemory > 100 * 1024 * 1024) { // 100MB
      return 'critical'
    } else if (usagePercent > 75 || transcriptMemory > 50 * 1024 * 1024) { // 50MB
      return 'high'
    } else if (usagePercent > 50 || transcriptMemory > 25 * 1024 * 1024) { // 25MB
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
        this.config.maxStaticTranscripts = Math.max(10, Math.floor(this.config.maxStaticTranscripts * 0.3))
        this.performGarbageCollection()
        break
        
      case 'high':
        console.warn('[Memory] High memory pressure detected')
        this.config.maxStaticTranscripts = Math.max(20, Math.floor(this.config.maxStaticTranscripts * 0.5))
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
    const memoryInfo = (performance as Performance & { 
      memory?: { 
        usedJSHeapSize: number
        jsHeapSizeLimit: number
      } 
    }).memory

    let storageUsed = 0
    try {
      const stored = localStorage.getItem('dao-copilot.transcripts')
      if (stored) {
        storageUsed = new Blob([stored]).size
      }
    } catch (e) {
      // Ignore storage access errors
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
      console.error('TranscriptionStateManager: transcripts is not an array, resetting to empty array')
      this.state.static.transcripts = []
    }
    this.state.static.transcripts = this.state.static.transcripts.concat(transcript)
    this.state.static.lastUpdate = Date.now()
    this.updateMetadata()
    // Persist transcripts to localStorage
    try {
      localStorage.setItem('dao-copilot.transcripts', JSON.stringify(this.state.static.transcripts))
    } catch (e) {
      console.warn('TranscriptionStateManager: Failed to save transcripts to localStorage', e)
    }
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
      this.performanceMetrics.averageUpdateTime = this.totalUpdateTime / this.performanceMetrics.updateCount
      this.performanceMetrics.maxUpdateTime = Math.max(this.performanceMetrics.maxUpdateTime, updateDuration)
      this.performanceMetrics.lastUpdateTime = endTime
      
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
    setInterval(() => {
      this.handleMemoryPressure()
    }, 5 * 60 * 1000)

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
