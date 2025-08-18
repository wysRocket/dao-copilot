/**
 * Enhanced buffer system for live transcription display continuity
 *
 * This service ensures that:
 * 1. Text appears from the first second of recording
 * 2. Text never disappears during the session
 * 3. Partial and final results are properly managed
 * 4. Timestamps are tracked for continuity
 * 5. Performance is optimized for real-time display
 */
import {TextStreamBuffer} from './TextStreamBuffer'

export interface TranscriptionSegment {
  id: string
  text: string
  isPartial: boolean
  isFinal: boolean
  timestamp: number
  startTime?: number // Audio position when segment started
  endTime?: number // Audio position when segment ended
  confidence?: number
  source: string
  metadata?: {
    correctionOf?: string // ID of segment this corrects
    duration?: number
    wordCount?: number
    [key: string]: unknown
  }
}

export interface LiveTranscriptionState {
  segments: TranscriptionSegment[]
  currentText: string
  isActivelyStreaming: boolean
  lastUpdateTime: number
  sessionStartTime: number
  totalDuration: number
  stats: {
    totalSegments: number
    partialSegments: number
    finalSegments: number
    corrections: number
    averageConfidence: number
  }
}

export interface LiveTranscriptionBufferConfig {
  maxSegments?: number
  retentionTime?: number // How long to keep segments (ms)
  debounceDelay?: number
  autoMergePartials?: boolean // Merge consecutive partial segments
  immediateDisplay?: boolean // Show text immediately when streaming starts
  persistentDisplay?: boolean // Never clear text during session
  timestampTracking?: boolean // Track audio timestamps
}

export type TranscriptionBufferListener = (state: LiveTranscriptionState) => void

/**
 * LiveTranscriptionBuffer provides persistent, continuous transcription display
 * ensuring text never disappears and appears immediately when recording starts
 */
export class LiveTranscriptionBuffer {
  private segments: TranscriptionSegment[] = []
  private textBuffer: TextStreamBuffer
  private listeners: Set<TranscriptionBufferListener> = new Set()
  private config: Required<LiveTranscriptionBufferConfig>
  private sessionStartTime: number = 0
  private lastUpdateTime: number = 0
  private isActive: boolean = false
  private segmentIdCounter: number = 0
  private updateTimer: NodeJS.Timeout | null = null

  constructor(config: LiveTranscriptionBufferConfig = {}) {
    this.config = {
      maxSegments: 5000,
      retentionTime: 3600000, // 1 hour
      debounceDelay: 50, // Fast updates for live feel
      autoMergePartials: true,
      immediateDisplay: true,
      persistentDisplay: true,
      timestampTracking: true,
      ...config
    }

    // Initialize the underlying text buffer with our config
    this.textBuffer = new TextStreamBuffer({
      maxChunks: this.config.maxSegments,
      debounceDelay: this.config.debounceDelay,
      autoFlush: true,
      enableCorrectionDetection: true
    })

    // Subscribe to text buffer events
    this.textBuffer.subscribe('textUpdate', this.handleTextUpdate.bind(this))
    this.textBuffer.subscribe('correctionDetected', this.handleCorrection.bind(this))
  }

  /**
   * Start a new transcription session
   */
  public startSession(audioStartTime?: number): void {
    console.log('🔴 LiveTranscriptionBuffer: Starting new session')

    this.sessionStartTime = audioStartTime || Date.now()
    this.lastUpdateTime = this.sessionStartTime
    this.isActive = true

    // If immediate display is enabled and we don't have persistent display,
    // we still keep any existing text but mark the new session
    if (!this.config.persistentDisplay) {
      this.segments = []
    }

    this.notifyListeners()
  }

  /**
   * Add a transcription segment (partial or final)
   */
  public addSegment(
    text: string,
    isPartial: boolean,
    source: string = 'unknown',
    audioTimestamp?: number,
    confidence?: number,
    metadata?: TranscriptionSegment['metadata']
  ): string {
    const now = Date.now()
    const segmentId = this.generateSegmentId()

    // Calculate audio position if timestamp tracking is enabled
    let startTime: number | undefined
    let endTime: number | undefined

    if (this.config.timestampTracking) {
      if (audioTimestamp !== undefined) {
        startTime = audioTimestamp
      } else {
        // Estimate based on session time
        startTime = now - this.sessionStartTime
      }

      if (!isPartial) {
        endTime = startTime + text.length * 50 // Rough estimate: 50ms per character
      }
    }

    const segment: TranscriptionSegment = {
      id: segmentId,
      text,
      isPartial,
      isFinal: !isPartial,
      timestamp: now,
      startTime,
      endTime,
      confidence,
      source,
      metadata
    }

    // Handle auto-merging of partial segments
    if (this.config.autoMergePartials && isPartial && this.segments.length > 0) {
      const lastSegment = this.segments[this.segments.length - 1]

      if (lastSegment.isPartial && lastSegment.source === source) {
        // Update the last partial segment instead of adding a new one
        lastSegment.text = text
        lastSegment.timestamp = now
        lastSegment.confidence = confidence
        lastSegment.metadata = {...lastSegment.metadata, ...metadata}

        // Add to text buffer for UI updates
        this.textBuffer.addText(text, isPartial)
        this.lastUpdateTime = now

        return lastSegment.id
      }
    }

    // Add new segment
    this.segments.push(segment)

    // Add to text buffer for UI updates
    this.textBuffer.addText(text, isPartial)

    // Update state
    this.lastUpdateTime = now

    // Clean up old segments if needed
    this.enforceRetentionPolicy()

    console.log(
      `🔴 LiveTranscriptionBuffer: Added segment (${isPartial ? 'partial' : 'final'}):`,
      text.substring(0, 50) + '...'
    )

    return segmentId
  }

  /**
   * Mark a partial segment as final
   */
  public finalizeSegment(segmentId: string, finalText?: string): boolean {
    const segment = this.segments.find(s => s.id === segmentId)

    if (!segment) {
      console.warn('LiveTranscriptionBuffer: Cannot finalize segment - not found:', segmentId)
      return false
    }

    segment.isPartial = false
    segment.isFinal = true

    if (finalText) {
      segment.text = finalText
    }

    segment.timestamp = Date.now()

    if (this.config.timestampTracking && segment.startTime !== undefined) {
      segment.endTime = segment.startTime + segment.text.length * 50
    }

    // Update text buffer
    this.textBuffer.addText(segment.text, false)

    console.log(
      '🔴 LiveTranscriptionBuffer: Finalized segment:',
      segment.text.substring(0, 50) + '...'
    )

    return true
  }

  /**
   * Get the complete current text
   */
  public getCurrentText(): string {
    if (this.config.immediateDisplay || this.segments.length === 0) {
      // Return all text immediately
      return this.segments
        .map(segment => segment.text)
        .join(' ')
        .trim()
    }

    // Only show final segments if immediate display is disabled
    return this.segments
      .filter(segment => segment.isFinal)
      .map(segment => segment.text)
      .join(' ')
      .trim()
  }

  /**
   * Get current transcription state
   */
  public getState(): LiveTranscriptionState {
    const currentText = this.getCurrentText()
    const stats = this.calculateStats()

    return {
      segments: [...this.segments], // Return copy
      currentText,
      isActivelyStreaming: this.isActive && this.hasRecentActivity(),
      lastUpdateTime: this.lastUpdateTime,
      sessionStartTime: this.sessionStartTime,
      totalDuration: Date.now() - this.sessionStartTime,
      stats
    }
  }

  /**
   * Check if there's been recent transcription activity
   */
  public hasRecentActivity(timeWindow: number = 5000): boolean {
    return Date.now() - this.lastUpdateTime < timeWindow
  }

  /**
   * Clear all segments (only if persistent display is disabled)
   */
  public clear(): void {
    if (this.config.persistentDisplay) {
      console.warn('LiveTranscriptionBuffer: Cannot clear - persistent display is enabled')
      return
    }

    console.log('🔴 LiveTranscriptionBuffer: Clearing all segments')
    this.segments = []
    this.textBuffer.clear()
    this.lastUpdateTime = Date.now()
    this.notifyListeners()
  }

  /**
   * End the current session but keep text if persistent display is enabled
   */
  public endSession(): void {
    console.log('🔴 LiveTranscriptionBuffer: Ending session')

    this.isActive = false

    // Finalize any remaining partial segments
    this.segments.forEach(segment => {
      if (segment.isPartial) {
        segment.isPartial = false
        segment.isFinal = true
      }
    })

    this.notifyListeners()
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: TranscriptionBufferListener): () => void {
    this.listeners.add(listener)

    // Immediately send current state to new listener
    try {
      listener(this.getState())
    } catch (error) {
      console.error('Error in LiveTranscriptionBuffer listener during subscribe:', error)
    }

    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<LiveTranscriptionBufferConfig>): void {
    this.config = {...this.config, ...newConfig}

    // Update underlying text buffer config
    this.textBuffer.updateConfig({
      debounceDelay: this.config.debounceDelay,
      maxChunks: this.config.maxSegments
    })
  }

  /**
   * Get performance statistics
   */
  public getPerformanceStats(): {
    segmentCount: number
    averageSegmentLength: number
    memoryUsage: number
    updateFrequency: number
  } {
    const segmentCount = this.segments.length
    const totalChars = this.segments.reduce((sum, s) => sum + s.text.length, 0)
    const averageSegmentLength = segmentCount > 0 ? totalChars / segmentCount : 0

    // Estimate memory usage (rough calculation)
    const memoryUsage = totalChars * 2 + segmentCount * 200 // 2 bytes per char + overhead

    // Calculate update frequency over last minute
    const oneMinuteAgo = Date.now() - 60000
    const recentSegments = this.segments.filter(s => s.timestamp > oneMinuteAgo)
    const updateFrequency = recentSegments.length

    return {
      segmentCount,
      averageSegmentLength,
      memoryUsage,
      updateFrequency
    }
  }

  /**
   * Destroy the buffer and cleanup resources
   */
  public destroy(): void {
    console.log('🔴 LiveTranscriptionBuffer: Destroying')

    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
    }

    this.textBuffer.destroy()
    this.segments = []
    this.listeners.clear()
    this.isActive = false
  }

  // Private methods

  private generateSegmentId(): string {
    return `segment_${++this.segmentIdCounter}_${Date.now()}`
  }

  private handleTextUpdate(_text: string, _isPartial: boolean, _metadata?: unknown): void {
    // This is called when the underlying text buffer updates
    // We use this to trigger UI updates with debouncing
    this.scheduleUpdate()
  }

  private handleCorrection(text: string, _isPartial: boolean, _metadata?: unknown): void {
    console.log('🔴 LiveTranscriptionBuffer: Correction detected:', text.substring(0, 30) + '...')

    // Handle text corrections by updating the most recent segment
    if (this.segments.length > 0) {
      const lastSegment = this.segments[this.segments.length - 1]
      if (lastSegment.isPartial) {
        // Mark as correction
        lastSegment.metadata = {
          ...lastSegment.metadata,
          correctionOf: lastSegment.text
        }
        lastSegment.text = text
        lastSegment.timestamp = Date.now()
      }
    }

    this.scheduleUpdate()
  }

  private scheduleUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer)
    }

    this.updateTimer = setTimeout(() => {
      this.notifyListeners()
    }, this.config.debounceDelay)
  }

  private notifyListeners(): void {
    const state = this.getState()
    this.listeners.forEach(listener => {
      try {
        listener(state)
      } catch (error) {
        console.error('Error in LiveTranscriptionBuffer listener:', error)
      }
    })
  }

  private calculateStats(): LiveTranscriptionState['stats'] {
    const totalSegments = this.segments.length
    const partialSegments = this.segments.filter(s => s.isPartial).length
    const finalSegments = this.segments.filter(s => s.isFinal).length
    const corrections = this.segments.filter(s => s.metadata?.correctionOf).length

    const confidenceValues = this.segments
      .map(s => s.confidence)
      .filter(c => typeof c === 'number') as number[]

    const averageConfidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
        : 0

    return {
      totalSegments,
      partialSegments,
      finalSegments,
      corrections,
      averageConfidence
    }
  }

  private enforceRetentionPolicy(): void {
    if (this.config.retentionTime <= 0) return

    const cutoffTime = Date.now() - this.config.retentionTime
    const initialLength = this.segments.length

    // Only remove old segments if they're final (keep recent partials)
    this.segments = this.segments.filter(segment => {
      if (segment.timestamp > cutoffTime) return true
      if (segment.isPartial) return true // Always keep partials
      return false
    })

    // Also enforce max segments limit
    while (this.segments.length > this.config.maxSegments) {
      // Remove the oldest final segment
      const oldestFinalIndex = this.segments.findIndex(s => s.isFinal)
      if (oldestFinalIndex >= 0) {
        this.segments.splice(oldestFinalIndex, 1)
      } else {
        break // Only final segments left
      }
    }

    if (this.segments.length < initialLength) {
      console.log(
        `🔴 LiveTranscriptionBuffer: Cleaned up ${initialLength - this.segments.length} old segments`
      )
    }
  }
}

export default LiveTranscriptionBuffer
