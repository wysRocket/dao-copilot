/**
 * Represents a chunk of text in the streaming buffer
 */
export interface TextChunk {
  /** Unique identifier for the chunk */
  id: string
  /** Text content of the chunk */
  text: string
  /** Whether this chunk represents partial or final text */
  isPartial: boolean
  /** Timestamp when the chunk was created */
  timestamp: number
  /** Whether this chunk is a correction of previous text */
  correction?: boolean
  /** Optional metadata for the chunk */
  metadata?: {
    source?: string
    confidence?: number
    duration?: number
    [key: string]: unknown
  }
}

/**
 * Configuration options for TextStreamBuffer
 */
export interface TextStreamBufferConfig {
  /** Maximum number of chunks to keep in memory */
  maxChunks?: number
  /** Debounce delay for flushing chunks in milliseconds */
  debounceDelay?: number
  /** Whether to auto-flush chunks after debounce delay */
  autoFlush?: boolean
  /** Maximum age of chunks before they're considered stale (ms) */
  maxChunkAge?: number
  /** Whether to enable correction detection */
  enableCorrectionDetection?: boolean
}

/**
 * Listener function type for text buffer events
 */
export type TextBufferListener = (
  text: string,
  isPartial: boolean,
  metadata?: TextChunk['metadata']
) => void

/**
 * Event types for the text buffer
 */
export type TextBufferEventType =
  | 'textUpdate'
  | 'chunkAdded'
  | 'chunkRemoved'
  | 'bufferCleared'
  | 'correctionDetected'

/**
 * TextStreamBuffer class for handling rapid text updates and managing streaming text state efficiently.
 *
 * This class provides:
 * - Efficient buffering of text chunks to prevent UI thrashing
 * - Debouncing for smooth text transitions
 * - Text correction detection and handling
 * - Memory management for long streams
 * - Event-based notifications for text updates
 */
export class TextStreamBuffer {
  private buffer: TextChunk[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private listeners: Map<TextBufferEventType, TextBufferListener[]> = new Map()
  private config: Required<TextStreamBufferConfig>
  private lastFlushedText: string = ''
  private chunkIdCounter: number = 0

  constructor(config: TextStreamBufferConfig = {}) {
    this.config = {
      maxChunks: 1000,
      debounceDelay: 100,
      autoFlush: true,
      maxChunkAge: 300000, // 5 minutes
      enableCorrectionDetection: true,
      ...config
    }

    // Initialize event listener maps
    this.listeners.set('textUpdate', [])
    this.listeners.set('chunkAdded', [])
    this.listeners.set('chunkRemoved', [])
    this.listeners.set('bufferCleared', [])
    this.listeners.set('correctionDetected', [])

    // Set up periodic cleanup
    this.scheduleCleanup()
  }

  /**
   * Add a text chunk to the buffer
   */
  public addChunk(
    text: string,
    isPartial: boolean = false,
    metadata?: TextChunk['metadata']
  ): string {
    const chunk: TextChunk = {
      id: this.generateChunkId(),
      text,
      isPartial,
      timestamp: Date.now(),
      metadata
    }

    // Detect corrections if enabled
    if (this.config.enableCorrectionDetection && this.buffer.length > 0) {
      const lastChunk = this.buffer[this.buffer.length - 1]
      if (this.detectCorrection(lastChunk.text, text)) {
        chunk.correction = true
        this.emit('correctionDetected', text, isPartial, {
          ...metadata,
          correctedFrom: lastChunk.text
        })
      }
    }

    // Add chunk to buffer
    this.buffer.push(chunk)
    this.emit('chunkAdded', text, isPartial, metadata)

    // Manage buffer size
    this.enforceMaxChunks()

    // Auto-flush if enabled
    if (this.config.autoFlush) {
      this.scheduleFlush()
    }

    return chunk.id
  }

  /**
   * Add a raw text chunk with automatic ID generation
   */
  public addText(text: string, isPartial: boolean = false): string {
    return this.addChunk(text, isPartial)
  }

  /**
   * Flush the buffer and return the combined text
   */
  public flush(): string {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    const combinedText = this.combineChunks()
    const isPartial = this.buffer.some(chunk => chunk.isPartial)
    const metadata = this.getCombinedMetadata()

    // Only emit if text has changed
    if (combinedText !== this.lastFlushedText) {
      this.lastFlushedText = combinedText
      this.emit('textUpdate', combinedText, isPartial, metadata)
    }

    return combinedText
  }

  /**
   * Clear all chunks from the buffer
   */
  public clear(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.buffer = []
    this.lastFlushedText = ''
    this.emit('bufferCleared', '', false)
  }

  /**
   * Get the current combined text without flushing
   */
  public getCurrentText(): string {
    return this.combineChunks()
  }

  /**
   * Get the current buffer status
   */
  public getStatus(): {
    chunkCount: number
    hasPartialChunks: boolean
    hasCorrections: boolean
    oldestChunkAge: number
    totalTextLength: number
  } {
    const now = Date.now()
    const hasPartialChunks = this.buffer.some(chunk => chunk.isPartial)
    const hasCorrections = this.buffer.some(chunk => chunk.correction)
    const oldestChunkAge = this.buffer.length > 0 ? now - this.buffer[0].timestamp : 0
    const totalTextLength = this.combineChunks().length

    return {
      chunkCount: this.buffer.length,
      hasPartialChunks,
      hasCorrections,
      oldestChunkAge,
      totalTextLength
    }
  }

  /**
   * Subscribe to buffer events
   */
  public subscribe(eventType: TextBufferEventType, listener: TextBufferListener): () => void {
    const listeners = this.listeners.get(eventType) || []
    listeners.push(listener)
    this.listeners.set(eventType, listeners)

    // Return unsubscribe function
    return () => {
      const currentListeners = this.listeners.get(eventType) || []
      const index = currentListeners.indexOf(listener)
      if (index > -1) {
        currentListeners.splice(index, 1)
      }
    }
  }

  /**
   * Remove a specific chunk by ID
   */
  public removeChunk(chunkId: string): boolean {
    const index = this.buffer.findIndex(chunk => chunk.id === chunkId)
    if (index > -1) {
      const removedChunk = this.buffer.splice(index, 1)[0]
      this.emit('chunkRemoved', removedChunk.text, removedChunk.isPartial, removedChunk.metadata)
      return true
    }
    return false
  }

  /**
   * Get chunks within a specific time range
   */
  public getChunksInRange(startTime: number, endTime: number): TextChunk[] {
    return this.buffer.filter(chunk => chunk.timestamp >= startTime && chunk.timestamp <= endTime)
  }

  /**
   * Update buffer configuration
   */
  public updateConfig(newConfig: Partial<TextStreamBufferConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  /**
   * Destroy the buffer and cleanup resources
   */
  public destroy(): void {
    this.clear()
    this.listeners.clear()
  }

  // Private methods

  private generateChunkId(): string {
    return `chunk_${++this.chunkIdCounter}_${Date.now()}`
  }

  private combineChunks(): string {
    return this.buffer.map(chunk => chunk.text).join('')
  }

  private getCombinedMetadata(): TextChunk['metadata'] {
    if (this.buffer.length === 0) return undefined

    // Combine metadata from all chunks
    const metadata: TextChunk['metadata'] = {
      chunkCount: this.buffer.length,
      totalDuration: this.buffer.reduce((sum, chunk) => sum + (chunk.metadata?.duration || 0), 0),
      sources: [...new Set(this.buffer.map(chunk => chunk.metadata?.source).filter(Boolean))],
      averageConfidence: this.calculateAverageConfidence()
    }

    return metadata
  }

  private calculateAverageConfidence(): number | undefined {
    const confidenceValues = this.buffer
      .map(chunk => chunk.metadata?.confidence)
      .filter(confidence => typeof confidence === 'number') as number[]

    if (confidenceValues.length === 0) return undefined

    return (
      confidenceValues.reduce((sum, confidence) => sum + confidence, 0) / confidenceValues.length
    )
  }

  private detectCorrection(previousText: string, newText: string): boolean {
    if (previousText.length === 0 || newText.length === 0) return false

    // Simple correction detection: check if the beginning of the text changed
    const minLength = Math.min(previousText.length, newText.length)
    const commonPrefixLength = this.getCommonPrefixLength(previousText, newText)

    // Consider it a correction if less than 80% of the text is the same at the beginning
    return commonPrefixLength / minLength < 0.8
  }

  private getCommonPrefixLength(str1: string, str2: string): number {
    let i = 0
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
      i++
    }
    return i
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.flush()
    }, this.config.debounceDelay)
  }

  private enforceMaxChunks(): void {
    while (this.buffer.length > this.config.maxChunks) {
      const removedChunk = this.buffer.shift()
      if (removedChunk) {
        this.emit('chunkRemoved', removedChunk.text, removedChunk.isPartial, removedChunk.metadata)
      }
    }
  }

  private scheduleCleanup(): void {
    setInterval(() => {
      this.cleanupStaleChunks()
    }, 60000) // Clean up every minute
  }

  private cleanupStaleChunks(): void {
    const now = Date.now()
    const initialLength = this.buffer.length

    this.buffer = this.buffer.filter(chunk => {
      const age = now - chunk.timestamp
      if (age > this.config.maxChunkAge) {
        this.emit('chunkRemoved', chunk.text, chunk.isPartial, chunk.metadata)
        return false
      }
      return true
    })

    // If we removed chunks, flush the buffer
    if (this.buffer.length < initialLength && this.config.autoFlush) {
      this.flush()
    }
  }

  private emit(
    eventType: TextBufferEventType,
    text: string,
    isPartial: boolean,
    metadata?: TextChunk['metadata']
  ): void {
    const listeners = this.listeners.get(eventType) || []
    listeners.forEach(listener => {
      try {
        listener(text, isPartial, metadata)
      } catch (error) {
        console.error(`Error in TextStreamBuffer listener for ${eventType}:`, error)
      }
    })
  }
}

export default TextStreamBuffer
