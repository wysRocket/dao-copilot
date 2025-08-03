import {TranscriptionWithSource, TranscriptionSource} from '../services/TranscriptionSourceManager'
import {isTest} from '../utils/env-utils'
import { getStorageProvider, type StorageProvider } from '../utils/storage-provider'
import { EmergencyCircuitBreaker } from '../utils/EmergencyCircuitBreaker'

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
  compressed?: boolean // Added for garbage collection
}

/**
 * Streaming transcription with progress tracking
 */
export interface StreamingTranscription extends TranscriptionWithSource {
  progress: number // 0-1 for animation completion
  isPartial: boolean
}

/**
 * WebSocket connection state tracking
 */
export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  quality: 'excellent' | 'good' | 'poor' | 'unstable'
  lastError?: {
    message: string
    type: 'quota' | 'auth' | 'network' | 'unknown'
    timestamp: number
    code?: string
  }
  retry: {
    isRetrying: boolean
    attemptCount: number
    maxAttempts: number
    nextAttemptIn: number // milliseconds
    nextAttemptAt: number // timestamp
    strategy: 'exponential' | 'linear' | 'fibonacci' | 'custom'
    currentDelay: number
  }
  metrics: {
    uptime: number
    downtime: number
    totalConnections: number
    failedConnections: number
    lastConnectedAt?: number
    lastDisconnectedAt?: number
    averageConnectionDuration: number
  }
  quota: {
    isQuotaExceeded: boolean
    availableKeys: number
    totalKeys: number
    quotaResetEstimate?: number // timestamp
    lastQuotaError?: number // timestamp
  }
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
  connection: ConnectionState
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
  | 'connection-status-changed'
  | 'connection-error'
  | 'connection-retry-started'
  | 'connection-retry-updated'
  | 'connection-metrics-updated'
  | 'quota-status-changed'

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
 * Default configuration with performance optimizations
 */
const DEFAULT_CONFIG: StateTransitionConfig = {
  autoCompleteStreaming: true,
  streamingTimeout: 15000, // Reduced from 30 seconds to prevent accumulation
  maxStaticTranscripts: 1000, // Reduced from 10000 for better performance
  memoryThreshold: 50 * 1024 * 1024, // Reduced from 500MB to 50MB for stability
  enableGarbageCollection: true // Enabled by default to prevent memory leaks
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
  },
  connection: {
    status: 'disconnected',
    quality: 'good',
    retry: {
      isRetrying: false,
      attemptCount: 0,
      maxAttempts: 10,
      nextAttemptIn: 0,
      nextAttemptAt: 0,
      strategy: 'exponential',
      currentDelay: 1000
    },
    metrics: {
      uptime: 0,
      downtime: 0,
      totalConnections: 0,
      failedConnections: 0,
      averageConnectionDuration: 0
    },
    quota: {
      isQuotaExceeded: false,
      availableKeys: 0,
      totalKeys: 0
    }
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
  private isNotifyingListeners = false // Prevent listener notification recursion
  private isInEmergencyRecovery = false // Prevent multiple emergency recoveries running simultaneously
  private performanceMetrics: PerformanceMetrics = {
    updateCount: 0,
    averageUpdateTime: 0,
    maxUpdateTime: 0,
    throttledUpdates: 0,
    lastUpdateTime: 0
  }
  private totalUpdateTime = 0 // For calculating averages
  private updateThrottleTimeout: NodeJS.Timeout | null = null
  private readonly UPDATE_THROTTLE_MS = 100 // Increased from 50ms to reduce update frequency
  private storageProvider: StorageProvider // Cross-environment storage abstraction

  constructor(config: Partial<StateTransitionConfig> = {}) {
    this.state = {...DEFAULT_STATE}
    this.config = {...DEFAULT_CONFIG, ...config}

    // Initialize cross-environment storage provider
    this.storageProvider = getStorageProvider()

    // Load transcripts from storage if available (cross-environment support)
    // Note: This is fire-and-forget to avoid making constructor async
    this.loadTranscriptsFromStorage().catch(error => {
      console.warn('TranscriptionStateManager: Failed to load transcripts during initialization', error)
    })

    // Initialize garbage collection if enabled
    if (this.config.enableGarbageCollection) {
      this.startGarbageCollection()
    }
  }

  /**
   * Load transcripts from storage with cross-environment support
   */
  private async loadTranscriptsFromStorage(): Promise<void> {
    try {
      const saved = await this.storageProvider.get('dao-copilot.transcripts')
      if (saved && typeof saved === 'object') {
        const data = saved as { transcripts?: unknown; metadata?: unknown }
        if (Array.isArray(data.transcripts)) {
          this.state.static.transcripts = data.transcripts
          console.log(`TranscriptionStateManager: Loaded ${data.transcripts.length} transcripts from ${this.storageProvider.getProviderType()} storage`)
        } else if (Array.isArray(saved)) {
          // Handle legacy format (direct array)
          this.state.static.transcripts = saved
          console.log(`TranscriptionStateManager: Loaded ${saved.length} transcripts from legacy format`)
        }
      }
    } catch (error) {
      console.warn('TranscriptionStateManager: Failed to load transcripts from storage', error)
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
   * Check if transcription service is available (circuit breaker closed)
   */
  isTranscriptionServiceAvailable(): boolean {
    try {
      const breaker = EmergencyCircuitBreaker.getInstance()
      
      // Get the breaker status without consuming a guard call
      // We'll check the emergency status instead of calling emergencyCallGuard
      const status = breaker.getEmergencyStatus()
      const transcriptionBreakerStatus = status['transcription-ipc-handler'] as any
      
      // Check if the breaker is open for transcription
      const isAvailable = !transcriptionBreakerStatus?.isOpen
      
      if (!isAvailable) {
        console.warn('🚨 TranscriptionStateManager: Transcription service unavailable - circuit breaker is OPEN')
      }
      
      return isAvailable
    } catch (error) {
      console.error('❌ Error checking transcription service availability:', error)
      return false
    }
  }

  /**
   * Start streaming transcription with enhanced recursion protection
   */
  /**
   * Start streaming transcription with enhanced recursion protection
   */
  startStreaming(transcription: TranscriptionWithSource): void {
    // 🛡️ Check if transcription service is available before starting
    if (!this.isTranscriptionServiceAvailable()) {
      console.warn('🚨 TranscriptionStateManager: Cannot start streaming - service unavailable')
      return
    }

    // 🛡️ Enhanced protection against multiple simultaneous streaming sessions
    if (this.state.streaming.isActive && this.state.streaming.current) {
      const currentStreamAge = Date.now() - this.state.streaming.current.timestamp
      
      // Only allow new stream if current is very old (likely stale)
      if (currentStreamAge < 5000) { // 5 seconds
        console.warn('TranscriptionStateManager: Ignoring new stream - active session too recent')
        return
      }
      
      console.warn('TranscriptionStateManager: Replacing stale streaming session')
      this.clearStreaming()
    }

    const streamingTranscription: StreamingTranscription = {
      ...transcription,
      progress: 0,
      isPartial: transcription.isPartial !== undefined ? transcription.isPartial : true // Preserve original isPartial value
    }

    this.state.streaming.current = streamingTranscription
    this.state.streaming.isActive = true
    this.state.streaming.progress = 0

    // Set up auto-completion timeout with shorter duration to prevent accumulation
    if (this.config.autoCompleteStreaming) {
      this.streamingTimeoutId = setTimeout(() => {
        console.log('TranscriptionStateManager: Auto-completing streaming due to timeout')
        this.completeStreaming()
      }, Math.min(this.config.streamingTimeout, 15000)) // Max 15 seconds
    }

    this.notifyListeners('streaming-started')
  }

  /**
   * Update streaming transcription
   */
  /**
   * Update streaming transcription text with enhanced throttling
   */
  updateStreaming(text: string, isPartial: boolean = true): void {
    if (!this.state.streaming.current) {
      console.warn('TranscriptionStateManager: Cannot update streaming - no active stream')
      return
    }

    // Rate limiting for partial updates to prevent spam
    const now = Date.now()
    const timeSinceLastUpdate = now - this.state.streaming.current.timestamp
    
    if (isPartial && timeSinceLastUpdate < 100) { // 100ms minimum between partial updates
      console.debug(`TranscriptionStateManager: Skipping partial update - too frequent (${timeSinceLastUpdate}ms ago)`)
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
            timestamp: now
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
        timestamp: now
      }

      this.state.streaming.progress = 1
      this.notifyListeners('streaming-updated')

      // For final text, delay auto-completion to allow viewing
      if (this.config.autoCompleteStreaming) {
        // Clear any existing timeout
        if (this.streamingTimeoutId) {
          clearTimeout(this.streamingTimeoutId)
          this.streamingTimeoutId = null
        }
        
        // Set a short delay before completing final transcriptions
        // This allows users to see the final result before it moves to static transcripts
        this.streamingTimeoutId = setTimeout(() => {
          console.log('TranscriptionStateManager: Auto-completing final streaming transcription after display delay')
          this.completeStreaming()
        }, 2000) // Reduced to 2 seconds to prevent accumulation
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

    // Execute completion callbacks before clearing state with safety protection
    const callbacks = [...this.state.streaming.completionCallbacks] // Create copy to avoid modification during iteration
    this.state.streaming.completionCallbacks = [] // Clear callbacks immediately to prevent re-execution
    
    callbacks.forEach((callback, index) => {
      try {
        // Add timeout protection for callbacks
        const callbackTimeout = setTimeout(() => {
          console.warn(`⚠️ TranscriptionStateManager: Completion callback ${index} timeout - possible hang detected`)
        }, 3000) // 3 second timeout
        
        callback()
        clearTimeout(callbackTimeout)
      } catch (error) {
        console.error(`Error executing streaming completion callback ${index}:`, error)
        // Don't re-throw to prevent one bad callback from breaking the others
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
    
    // Persist the cleared state to storage
    this.saveToStorage().catch(error => {
      console.warn('TranscriptionStateManager: Failed to save cleared transcripts to storage', error)
    })
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
   * Update connection status
   */
  setConnectionStatus(
    status: ConnectionState['status'],
    quality?: ConnectionState['quality']
  ): void {
    const previousStatus = this.state.connection.status
    this.state.connection.status = status
    
    if (quality) {
      this.state.connection.quality = quality
    }

    // Update metrics based on status change
    const now = Date.now()
    if (status === 'connected' && previousStatus !== 'connected') {
      this.state.connection.metrics.totalConnections++
      this.state.connection.metrics.lastConnectedAt = now
    } else if (status === 'disconnected' && previousStatus === 'connected') {
      this.state.connection.metrics.lastDisconnectedAt = now
      if (this.state.connection.metrics.lastConnectedAt) {
        const duration = now - this.state.connection.metrics.lastConnectedAt
        this.state.connection.metrics.uptime += duration
        this.state.connection.metrics.averageConnectionDuration = 
          this.state.connection.metrics.uptime / this.state.connection.metrics.totalConnections
      }
    }

    this.notifyListeners('connection-status-changed')
  }

  /**
   * Set connection error
   */
  setConnectionError(
    message: string,
    type: 'quota' | 'auth' | 'network' | 'unknown',
    code?: string
  ): void {
    this.state.connection.lastError = {
      message,
      type,
      timestamp: Date.now(),
      code
    }

    if (type === 'quota') {
      this.state.connection.quota.isQuotaExceeded = true
      this.state.connection.quota.lastQuotaError = Date.now()
      this.notifyListeners('quota-status-changed')
    }

    this.state.connection.metrics.failedConnections++
    this.notifyListeners('connection-error')
  }

  /**
   * Update retry state
   */
  setRetryState(
    isRetrying: boolean,
    attemptCount: number = 0,
    nextAttemptIn: number = 0,
    currentDelay: number = 1000,
    strategy: ConnectionState['retry']['strategy'] = 'exponential'
  ): void {
    this.state.connection.retry = {
      isRetrying,
      attemptCount,
      maxAttempts: this.state.connection.retry.maxAttempts,
      nextAttemptIn,
      nextAttemptAt: nextAttemptIn > 0 ? Date.now() + nextAttemptIn : 0,
      strategy,
      currentDelay
    }

    if (isRetrying) {
      this.notifyListeners('connection-retry-started')
    } else {
      this.notifyListeners('connection-retry-updated')
    }
  }

  /**
   * Update quota status
   */
  setQuotaStatus(
    isQuotaExceeded: boolean,
    availableKeys: number,
    totalKeys: number,
    quotaResetEstimate?: number
  ): void {
    this.state.connection.quota = {
      isQuotaExceeded,
      availableKeys,
      totalKeys,
      quotaResetEstimate,
      lastQuotaError: this.state.connection.quota.lastQuotaError
    }

    this.notifyListeners('quota-status-changed')
  }

  /**
   * Update connection metrics
   */
  updateConnectionMetrics(metrics: Partial<ConnectionState['metrics']>): void {
    this.state.connection.metrics = {
      ...this.state.connection.metrics,
      ...metrics
    }

    this.notifyListeners('connection-metrics-updated')
  }

  /**
   * Get connection state
   */
  getConnectionState(): Readonly<ConnectionState> {
    return {...this.state.connection}
  }

  /**
   * Clear connection error
   */
  clearConnectionError(): void {
    this.state.connection.lastError = undefined
  }

  /**
   * Reset quota exceeded status
   */
  resetQuotaStatus(): void {
    this.state.connection.quota.isQuotaExceeded = false
    this.state.connection.quota.lastQuotaError = undefined
    this.notifyListeners('quota-status-changed')
  }

  /**
   * Handle quota exceeded scenario with intelligent recovery
   */
  handleQuotaExceeded(resetEstimate?: number): void {
    const now = Date.now()
    
    // Set quota exceeded state
    this.state.connection.quota.isQuotaExceeded = true
    this.state.connection.quota.lastQuotaError = now
    this.state.connection.quota.quotaResetEstimate = resetEstimate || (now + 60000) // Default to 1 minute
    
    // Stop any active recording/processing to reduce API usage
    this.setRecordingState(false, 0, 'Quota Exceeded - Service Paused')
    this.setProcessingState(false)
    
    // Clear any active streaming to prevent accumulation
    this.clearStreaming()
    
    // Set connection to failed state
    this.setConnectionStatus('failed', 'poor')
    
    // Notify listeners
    this.notifyListeners('quota-status-changed')
    
    // Schedule automatic retry based on reset estimate
    const retryDelay = Math.max(60000, (resetEstimate || (now + 60000)) - now) // At least 1 minute
    
    console.warn(`🚨 Quota exceeded. Scheduling retry in ${Math.round(retryDelay / 1000)} seconds...`)
    
    setTimeout(() => {
      console.log('🔄 Attempting to reset quota status after waiting period...')
      this.resetQuotaStatus()
      this.setConnectionStatus('disconnected', 'good')
    }, retryDelay)
  }

  /**
   * Check if service is available considering quota status
   */
  isServiceAvailable(): boolean {
    const isCircuitBreakerOpen = !this.isTranscriptionServiceAvailable()
    const isQuotaExceeded = this.state.connection.quota.isQuotaExceeded
    
    if (isQuotaExceeded) {
      const quotaResetTime = this.state.connection.quota.quotaResetEstimate
      if (quotaResetTime && Date.now() > quotaResetTime) {
        // Quota should have reset, try to clear the status
        console.log('🔄 Quota reset time passed, clearing quota exceeded status')
        this.resetQuotaStatus()
        return true
      }
      return false
    }
    
    return !isCircuitBreakerOpen
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

    // Save to storage after cleanup (fire-and-forget to avoid blocking GC)
    this.saveToStorage().catch(error => {
      console.warn('[GC] Failed to save transcripts after garbage collection', error)
    })

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
    const oneHourAgo = now - 60 * 60 * 1000
    const oneDayAgo = now - 24 * 60 * 60 * 1000
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

    // Prioritize keeping recent, high-confidence, or long transcripts
    const prioritizedTranscripts = transcripts
      .map(transcript => ({
        transcript,
        priority: this.calculateTranscriptPriority(transcript, now)
      }))
      .sort((a, b) => b.priority - a.priority)

    let targetCount = maxStaticTranscripts

    // Determine target count based on cleanup triggers
    if (estimatedSize > memoryThreshold * 1.5) {
      // High memory pressure: reduce to 60%
      targetCount = Math.floor(maxStaticTranscripts * 0.6)
    } else if (estimatedSize > memoryThreshold || transcripts.length > maxStaticTranscripts) {
      // Memory pressure or count exceeded: reduce to 80%
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
      for (const existingText of Array.from(seenTexts)) {
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
      if (streamAge > 5 * 60 * 1000) {
        // 5 minutes
        console.log('[GC] Cleaning up orphaned streaming state')
        this.clearStreamingState()
      }
    }
  }

  /**
   * Save transcripts to storage with error handling (cross-environment support)
   */
  private async saveToStorage(): Promise<void> {
    try {
      const data = {
        transcripts: this.state.static.transcripts,
        metadata: {
          lastSaved: Date.now(),
          version: '1.0',
          storageProvider: this.storageProvider.getProviderType()
        }
      }
      await this.storageProvider.set('dao-copilot.transcripts', data)
    } catch (error) {
      console.warn('[GC] Failed to save transcripts to storage:', error)

      // Handle storage quota exceeded (applies to various storage types)
      if (this.isStorageQuotaError(error)) {
        await this.handleStorageQuotaExceeded()
      }
    }
  }

  /**
   * Check if error indicates storage quota exceeded
   */
  private isStorageQuotaError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      return true
    }
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      return errorMessage.includes('quota') || 
             errorMessage.includes('storage') || 
             errorMessage.includes('space') ||
             errorMessage.includes('full')
    }
    return false
  }

  /**
   * Handle storage quota exceeded by aggressive cleanup
   */
  private async handleStorageQuotaExceeded(): Promise<void> {
    console.warn('[GC] Storage quota exceeded, performing aggressive cleanup')

    const originalLength = this.state.static.transcripts.length

    // Keep only the most recent 20% of transcripts
    const keepCount = Math.max(10, Math.floor(originalLength * 0.2))
    this.state.static.transcripts = this.state.static.transcripts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, keepCount)

    this.updateMetadata()

    // Try saving again with emergency cleanup flag
    try {
      const data = {
        transcripts: this.state.static.transcripts,
        metadata: {
          lastSaved: Date.now(),
          version: '1.0',
          emergencyCleanup: true,
          storageProvider: this.storageProvider.getProviderType()
        }
      }
      await this.storageProvider.set('dao-copilot.transcripts', data)
      console.log(
        `[GC] Emergency cleanup successful, kept ${keepCount}/${originalLength} transcripts`
      )
    } catch (error) {
      console.error('[GC] Emergency cleanup failed, clearing all transcripts from storage')
      try {
        await this.storageProvider.remove('dao-copilot.transcripts')
      } catch (clearError) {
        console.error('[GC] Failed to clear transcripts storage', clearError)
      }
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
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('dao-copilot.transcripts')
        if (stored) {
          storageUsed = new Blob([stored]).size
        }
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
   * Emergency recovery - resets circuit breakers and clears problematic state
   */
  emergencyRecovery(): void {
    // 🛡️ Prevent multiple emergency recoveries running simultaneously
    if (this.isInEmergencyRecovery) {
      console.warn('⚠️ Emergency recovery already in progress - skipping duplicate call')
      return
    }
    
    this.isInEmergencyRecovery = true
    console.warn('🚨 TranscriptionStateManager: Performing emergency recovery')
    
    try {
      // 🚨 PRIORITY 1: Reset the circuit breaker FIRST to allow new transcriptions
      const breaker = EmergencyCircuitBreaker.getInstance()
      breaker.emergencyReset()
      console.log('✅ Circuit breaker reset - transcription service now available')
      
      // 🚨 PRIORITY 2: Clear any pending timeouts that might cause re-triggers
      if (this.streamingTimeoutId) {
        clearTimeout(this.streamingTimeoutId)
        this.streamingTimeoutId = null
      }
      
      if (this.updateThrottleTimeout) {
        clearTimeout(this.updateThrottleTimeout)
        this.updateThrottleTimeout = null
      }
      
      // 🚨 PRIORITY 3: Clear any problematic streaming state WITHOUT triggering listeners yet
      this.state.streaming.current = null
      this.state.streaming.isActive = false
      this.state.streaming.progress = 0
      this.state.streaming.completionCallbacks = []
      
      // 🚨 PRIORITY 4: Reset recording and processing state WITHOUT triggering listeners yet
      this.state.recording.isRecording = false
      this.state.recording.isProcessing = false
      this.state.recording.recordingTime = 0
      this.state.recording.status = 'Emergency Stop - Ready'
      
      // 🚨 PRIORITY 5: Reset connection state to prevent quota errors
      this.state.connection.status = 'disconnected'
      this.state.connection.quota.isQuotaExceeded = false
      this.state.connection.lastError = undefined
      this.state.connection.retry.isRetrying = false
      this.state.connection.retry.attemptCount = 0
      
      // 🚨 PRIORITY 6: Reset performance metrics to clear any overflow counters
      this.resetPerformanceMetrics()
      
      // 🚨 PRIORITY 7: Clear problematic listeners (keep safe ones)
      const safeListeners = Array.from(this.listeners).filter(listener => {
        try {
          // Test if listener can be called safely
          return typeof listener === 'function'
        } catch {
          return false
        }
      })
      
      this.listeners.clear()
      safeListeners.forEach(listener => this.listeners.add(listener))
      
      // 🚨 FORCE COMPLETE: Mark any pending emergency calls as complete
      breaker.emergencyCallComplete('transcribeAudio')
      breaker.emergencyCallComplete('transcribeAudioViaWebSocket')
      breaker.emergencyCallComplete('performTranscription')
      breaker.emergencyCallComplete('transcription-ipc-handler')
      
      // 🚨 PRIORITY 8: Use a single delayed notification to prevent throttling conflicts
      setTimeout(() => {
        try {
          this.notifyListeners('connection-status-changed')
          setTimeout(() => this.notifyListeners('recording-changed'), 50)
          setTimeout(() => this.notifyListeners('processing-changed'), 100)
        } catch (notifyError) {
          console.warn('⚠️ Error during emergency recovery notification:', notifyError)
        }
        
        // Mark recovery as complete
        this.isInEmergencyRecovery = false
      }, 100)
      
      console.log('✅ Emergency recovery completed - transcription system fully restored')
    } catch (error) {
      console.error('❌ Emergency recovery failed:', error)
      this.isInEmergencyRecovery = false
      
      // Last resort: try to force reset the circuit breaker even if other steps failed
      try {
        const breaker = EmergencyCircuitBreaker.getInstance()
        breaker.emergencyReset()
        console.log('✅ Emergency fallback: Circuit breaker force-reset completed')
      } catch (resetError) {
        console.error('❌ Even emergency fallback failed:', resetError)
      }
    }
  }

  /**
   * Get emergency status for debugging
   */
  getEmergencyStatus(): {
    circuitBreaker: Record<string, unknown>
    transcriptionState: {
      isStreaming: boolean
      streamingAge?: number
      pendingTimeouts: number
      listenerCount: number
      isNotifying: boolean
    }
    performance: PerformanceMetrics
  } {
    const breaker = EmergencyCircuitBreaker.getInstance()
    
    return {
      circuitBreaker: breaker.getEmergencyStatus(),
      transcriptionState: {
        isStreaming: this.state.streaming.isActive,
        streamingAge: this.state.streaming.current 
          ? Date.now() - this.state.streaming.current.timestamp 
          : undefined,
        pendingTimeouts: [this.streamingTimeoutId, this.updateThrottleTimeout].filter(Boolean).length,
        listenerCount: this.listeners.size,
        isNotifying: this.isNotifyingListeners
      },
      performance: this.getPerformanceMetrics()
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    // Reset emergency recovery state
    this.isInEmergencyRecovery = false
    
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
    this.state.static.transcripts = this.state.static.transcripts.concat(transcript)
    this.state.static.lastUpdate = Date.now()
    this.updateMetadata()
    
    // Persist transcripts to storage (cross-environment support)
    this.saveToStorage().catch(error => {
      console.warn('TranscriptionStateManager: Failed to save transcripts to storage', error)
    })
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
   * Throttled state update to prevent excessive re-renders with enhanced protection
   */
  private throttledStateUpdate(updateFn: () => void, type: StateChangeType): void {
    const startTime = performance.now()

    // For testing environments, execute synchronously to allow immediate updates
    const isTestEnvironment = isTest()
    
    if (isTestEnvironment) {
      // Execute immediately in test environment
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
      
      return
    }

    // Enhanced throttling with recursion protection
    const now = Date.now()
    const timeSinceLastUpdate = now - this.performanceMetrics.lastUpdateTime
    
    // If we're updating too frequently, skip this update
    if (timeSinceLastUpdate < this.UPDATE_THROTTLE_MS && this.updateThrottleTimeout) {
      this.performanceMetrics.throttledUpdates++
      console.warn(`TranscriptionStateManager: Throttling update ${type} - too frequent (${timeSinceLastUpdate}ms ago)`)
      return
    }

    // Clear existing timeout
    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout)
    }

    // Use requestAnimationFrame for better performance instead of setTimeout
    this.updateThrottleTimeout = setTimeout(() => {
      try {
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

        this.updateThrottleTimeout = null
      } catch (error) {
        console.error(`Error in throttled state update for ${type}:`, error)
        this.updateThrottleTimeout = null
      }
    }, Math.max(this.UPDATE_THROTTLE_MS, 16)) // Minimum 16ms for 60 FPS
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
    // 🛡️ Prevent listener notification recursion with enhanced detection
    if (this.isNotifyingListeners) {
      console.warn(`TranscriptionStateManager: Skipping listener notification for ${type} - already notifying to prevent recursion`)
      return
    }
    
    // 🚨 EMERGENCY RECOVERY: Allow critical emergency operations to bypass throttling
    const isCriticalOperation = type === 'recording-changed' || type === 'processing-changed' || type === 'connection-status-changed'
    
    // Additional protection: limit notification frequency to prevent spam (but allow emergency operations)
    const now = Date.now()
    const timeSinceLastNotification = now - this.performanceMetrics.lastUpdateTime
    if (!isCriticalOperation && timeSinceLastNotification < 16) { // ~60 FPS limit
      console.warn(`TranscriptionStateManager: Throttling notification for ${type} - too frequent (${timeSinceLastNotification}ms ago)`)
      return
    }
    
    this.isNotifyingListeners = true
    this.performanceMetrics.lastUpdateTime = now
    
    try {
      const state = this.getState()
      
      // Create a safe copy of listeners to prevent modification during iteration
      const safeListeners = Array.from(this.listeners)
      
      safeListeners.forEach((listener, index) => {
        try {
          // Use immediate execution without timeout for better performance
          listener(type, state)
        } catch (error) {
          console.error(`Error in state change listener ${index} for type ${type}:`, error)
          // Remove problematic listeners to prevent future issues
          if (error instanceof RangeError && error.message.includes('stack')) {
            console.warn(`Removing listener ${index} due to stack overflow risk`)
            this.listeners.delete(listener)
          }
        }
      })
    } finally {
      this.isNotifyingListeners = false
    }
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
 * Emergency recovery function - can be called from console
 */
export function emergencyRecoverTranscription(): void {
  console.warn('🚨 GLOBAL: Performing emergency transcription recovery')
  const manager = getTranscriptionStateManager()
  manager.emergencyRecovery()
}

/**
 * Advanced emergency reset - completely reset the transcription system
 * Call this from browser console: window.emergencyResetTranscriptionSystem()
 */
export function emergencyResetTranscriptionSystem(): void {
  console.warn('🚨 GLOBAL: Performing complete transcription system reset')
  
  try {
    // Step 1: Reset the circuit breaker
    const breaker = EmergencyCircuitBreaker.getInstance()
    breaker.emergencyReset()
    
    // Step 2: Reset the transcription state manager
    const manager = getTranscriptionStateManager()
    manager.emergencyRecovery()
    
    // Step 3: Stop any ongoing audio recording
    if (typeof window !== 'undefined' && window.electronWindow?.broadcast) {
      window.electronWindow.broadcast('recording-state-changed', false)
    }
    
    // Step 4: Clear any pending intervals/timeouts globally (conservative approach)
    if (typeof window !== 'undefined') {
      // Only clear a reasonable range of timeouts/intervals to avoid disrupting other parts of the app
      // This is a conservative approach that targets likely transcription-related timers
      const maxClearRange = 1000 // Limit to first 1000 IDs to avoid clearing system timers
      
      try {
        // Clear timeouts in a reasonable range
        for (let i = 1; i <= maxClearRange; i++) {
          clearTimeout(i)
        }
        
        // Clear intervals in a reasonable range  
        for (let i = 1; i <= maxClearRange; i++) {
          clearInterval(i)
        }
        
        console.log('🧹 Cleared timeout/interval IDs 1-1000 for transcription cleanup')
      } catch (error) {
        console.warn('⚠️ Error during timeout/interval cleanup:', error)
      }
    }
    
    // Step 5: Reset any global transcription counters
    if (typeof window !== 'undefined') {
      // Reset any enhanced audio recording state if available
      try {
        const enhancedRecording = (window as any).enhancedAudioRecording
        if (enhancedRecording && typeof enhancedRecording.emergencyReset === 'function') {
          enhancedRecording.emergencyReset()
        }
      } catch (e) {
        console.warn('Could not reset enhanced audio recording:', e)
      }
    }
    
    console.log('✅ Complete transcription system reset completed')
    console.log('🎯 System should now be in a clean state. Try recording again.')
  } catch (error) {
    console.error('❌ Emergency system reset failed:', error)
  }
}

/**
 * Emergency stop all transcription activity - can be called from console
 */
export function emergencyStopTranscription(): void {
  console.warn('🚨 GLOBAL: Emergency stopping all transcription activity')
  const manager = getTranscriptionStateManager()
  
  // Immediately stop recording and processing
  manager.setRecordingState(false, 0, 'Emergency Stop')
  manager.setProcessingState(false)
  
  // Clear any active streaming
  manager.clearStreaming()
  
  // Reset circuit breaker
  const breaker = EmergencyCircuitBreaker.getInstance()
  breaker.emergencyReset()
  
  console.log('✅ Emergency stop completed - all transcription activity halted')
}

/**
 * Check if transcription service is available - can be called from console
 */
export function isTranscriptionServiceAvailable(): boolean {
  const manager = getTranscriptionStateManager()
  return manager.isTranscriptionServiceAvailable()
}

/**
 * Test transcription display - can be called from console
 */
export function testTranscriptionDisplay(): void {
  console.log('🧪 Testing transcription display...')
  const manager = getTranscriptionStateManager()
  
  // Add a test transcript
  const testTranscript: TranscriptionResult = {
    id: `test-${Date.now()}`,
    text: 'This is a test transcription to verify the display is working correctly.',
    timestamp: Date.now(),
    confidence: 0.95,
    source: 'test'
  }
  
  manager.addTranscript(testTranscript)
  console.log('✅ Test transcript added. Check the Assistant window for display.')
  
  // Also test streaming
    setTimeout(() => {
      console.log('🧪 Testing streaming transcription...')
      manager.startStreaming({
        id: `test-stream-${Date.now()}`,
        text: 'This is a test streaming transcription...',
        timestamp: Date.now(),
        confidence: 0.9,
        source: TranscriptionSource.STREAMING,
        isPartial: true
      })
      
      setTimeout(() => {
        manager.updateStreaming('This is a test streaming transcription that updates in real-time!', false)
      }, 1000)
  }, 2000)
}

/**
 * Advanced diagnostic test to simulate complete recording workflow with broadcasts
 * Call this from browser console: window.testRecordingWorkflow()
 */
export function testRecordingWorkflow(): void {
  console.log('🔬 Testing complete recording workflow...')
  
  // Test broadcasting recording start with safety checks
  if (typeof window !== 'undefined' && window.electronWindow?.broadcast) {
    console.log('🔬 Step 1: Broadcasting recording-state-changed: true')
    window.electronWindow.broadcast('recording-state-changed', true)
    
    // Step 2: Send initial streaming message
    setTimeout(() => {
      console.log('🔬 Step 2: Broadcasting initial streaming message')
      window.electronWindow.broadcast('streaming-transcription', {
        text: 'Recording started - listening for audio...',
        isFinal: false,
        isPartial: true,
        source: 'test-workflow-start',
        confidence: 1.0,
        timestamp: Date.now()
      })
      
      // Step 3: Simulate partial transcription
      setTimeout(() => {
        console.log('🔬 Step 3: Broadcasting partial transcription')
        window.electronWindow.broadcast('streaming-transcription', {
          text: 'Hello this is a test',
          isFinal: false,
          isPartial: true,
          source: 'test-workflow-partial',
          confidence: 0.8,
          timestamp: Date.now()
        })
        
        // Step 4: Simulate final transcription
        setTimeout(() => {
          console.log('🔬 Step 4: Broadcasting final transcription')
          window.electronWindow.broadcast('streaming-transcription', {
            text: 'Hello this is a test transcription message for debugging the Assistant display.',
            isFinal: true,
            isPartial: false,
            source: 'test-workflow-final',
            confidence: 0.95,
            timestamp: Date.now()
          })
          
          // Step 5: Stop recording
          setTimeout(() => {
            console.log('🔬 Step 5: Broadcasting recording-state-changed: false')
            window.electronWindow.broadcast('recording-state-changed', false)
            console.log('✅ Complete workflow test finished - check Assistant window')
          }, 1000)
        }, 1500)
      }, 1000)
    }, 500)
  } else {
    console.error('❌ No broadcast function available for workflow test')
  }
}

/**
 * Get emergency status - can be called from console for debugging
 */
export function getEmergencyTranscriptionStatus(): unknown {
  const manager = getTranscriptionStateManager()
  return manager.getEmergencyStatus()
}

/**
 * Get current quota status - can be called from console for debugging
 */
export function getQuotaStatus(): {
  isQuotaExceeded: boolean
  lastQuotaError?: number
  quotaResetEstimate?: number
  timeUntilReset?: number
  serviceAvailable: boolean
} {
  const manager = getTranscriptionStateManager()
  const state = manager.getState()
  const quota = state.connection.quota
  
  const timeUntilReset = quota.quotaResetEstimate 
    ? Math.max(0, quota.quotaResetEstimate - Date.now())
    : undefined
  
  return {
    isQuotaExceeded: quota.isQuotaExceeded,
    lastQuotaError: quota.lastQuotaError,
    quotaResetEstimate: quota.quotaResetEstimate,
    timeUntilReset,
    serviceAvailable: manager.isServiceAvailable()
  }
}

/**
 * Force quota reset - can be called from console to manually clear quota status
 */
export function forceQuotaReset(): void {
  console.log('🔄 Forcing quota reset...')
  const manager = getTranscriptionStateManager()
  manager.resetQuotaStatus()
  manager.setConnectionStatus('disconnected', 'good')
  console.log('✅ Quota status reset. Service should be available now.')
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

// Export global emergency functions for console access
if (typeof window !== 'undefined') {
  // Ensure window object is properly accessible before setting properties
  try {
    (window as any).emergencyRecoverTranscription = emergencyRecoverTranscription
    ;(window as any).emergencyResetTranscriptionSystem = emergencyResetTranscriptionSystem
    ;(window as any).emergencyStopTranscription = emergencyStopTranscription
    ;(window as any).isTranscriptionServiceAvailable = isTranscriptionServiceAvailable
    ;(window as any).testTranscriptionDisplay = testTranscriptionDisplay
    ;(window as any).testRecordingWorkflow = testRecordingWorkflow
    ;(window as any).getEmergencyTranscriptionStatus = getEmergencyTranscriptionStatus
    ;(window as any).getQuotaStatus = getQuotaStatus
    ;(window as any).forceQuotaReset = forceQuotaReset
  } catch (error) {
    console.warn('TranscriptionStateManager: Failed to export global functions to window:', error)
  }
}
