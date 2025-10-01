/**
 * Text chunk interface for buffering streaming text updates
 */
export interface TextChunk {
  /** Unique identifier for the chunk */
  id: string
  /** Text content of the chunk */
  text: string
  /** Whether the chunk is partial (still being updated) */
  isPartial: boolean
  /** Timestamp when the chunk was created */
  timestamp: number
  /** Whether this chunk corrects previous text */
  correction?: boolean
  /** Position where this chunk should be inserted */
  position?: number
  /** Type of chunk update */
  type?: 'append' | 'replace' | 'insert' | 'delete'
}

/**
 * Configuration options for TextStreamBuffer
 */
export interface TextStreamBufferConfig {
  /** Maximum number of chunks to keep in memory */
  maxChunks?: number
  /** Debounce delay for flushing in milliseconds */
  debounceDelay?: number
  /** Whether to automatically merge consecutive chunks */
  autoMerge?: boolean
  /** Whether to enable correction detection */
  enableCorrections?: boolean
}

/**
 * Text stream buffer event types
 */
export type TextStreamBufferEvent = 'update' | 'flush' | 'clear' | 'correction'

/**
 * Event listener function type
 */
export type TextStreamBufferListener = (
  text: string,
  isPartial: boolean,
  chunks: TextChunk[]
) => void

/**
 * TextStreamBuffer class for handling rapid text updates and managing streaming text state efficiently
 *
 * This buffer system manages incoming text chunks and optimizes rendering performance by:
 * - Buffering rapid text updates to prevent UI thrashing
 * - Implementing debouncing for smooth text transitions
 * - Handling text corrections and replacements efficiently
 * - Managing partial vs final text states
 * - Supporting text chunk reordering and merging
 * - Implementing memory-efficient storage for long streams
 */
export class TextStreamBuffer {
  private buffer: TextChunk[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private listeners: Map<TextStreamBufferEvent, TextStreamBufferListener[]> = new Map()
  private config: Required<TextStreamBufferConfig>
  private lastFlushTime: number = 0
  private mergedText: string = ''
  private isPartialState: boolean = false

  constructor(config: TextStreamBufferConfig = {}) {
    this.config = {
      maxChunks: 1000,
      debounceDelay: 50,
      autoMerge: true,
      enableCorrections: true,
      ...config
    }

    // Initialize event listener maps
    this.listeners.set('update', [])
    this.listeners.set('flush', [])
    this.listeners.set('clear', [])
    this.listeners.set('correction', [])
  }

  /**
   * Add a text chunk to the buffer
   */
  public addChunk(chunk: TextChunk): void {
    // Validate chunk
    if (!chunk.id || typeof chunk.text !== 'string') {
      console.warn('Invalid text chunk provided to buffer')
      return
    }

    // Handle corrections if enabled
    if (this.config.enableCorrections && chunk.correction) {
      this.handleCorrection(chunk)
    } else {
      this.addChunkToBuffer(chunk)
    }

    // Auto-merge if enabled
    if (this.config.autoMerge) {
      this.mergeConsecutiveChunks()
    }

    // Emit update event
    this.emit('update', this.mergedText, this.isPartialState, [...this.buffer])

    // Debounced flush
    this.debouncedFlush()
  }

  /**
   * Add chunk to buffer with memory management
   */
  private addChunkToBuffer(chunk: TextChunk): void {
    this.buffer.push(chunk)
    this.updatePartialState(chunk.isPartial)

    // Manage memory by removing old chunks if we exceed maxChunks
    if (this.buffer.length > this.config.maxChunks) {
      const removedChunks = this.buffer.splice(0, this.buffer.length - this.config.maxChunks)
      console.debug(`Removed ${removedChunks.length} old chunks from buffer`)
    }

    // Update merged text
    this.updateMergedText()
  }

  /**
   * Handle text corrections
   */
  private handleCorrection(correctionChunk: TextChunk): void {
    // Find chunks to correct based on timestamp or position
    const correctionTime = correctionChunk.timestamp

    // Remove chunks that came after the correction point
    this.buffer = this.buffer.filter(chunk => chunk.timestamp < correctionTime || chunk.correction)

    // Add the correction chunk
    this.addChunkToBuffer(correctionChunk)

    // Emit correction event
    this.emit('correction', this.mergedText, this.isPartialState, [...this.buffer])
  }

  /**
   * Merge consecutive chunks with similar timestamps
   */
  private mergeConsecutiveChunks(): void {
    if (this.buffer.length < 2) return

    const mergedBuffer: TextChunk[] = []
    let currentChunk = this.buffer[0]

    for (let i = 1; i < this.buffer.length; i++) {
      const nextChunk = this.buffer[i]

      // Check if chunks can be merged (within 100ms and same partial state)
      if (
        nextChunk.timestamp - currentChunk.timestamp < 100 &&
        currentChunk.isPartial === nextChunk.isPartial &&
        !nextChunk.correction
      ) {
        // Merge chunks
        currentChunk = {
          ...currentChunk,
          text: currentChunk.text + ' ' + nextChunk.text,
          timestamp: nextChunk.timestamp
        }
      } else {
        mergedBuffer.push(currentChunk)
        currentChunk = nextChunk
      }
    }

    mergedBuffer.push(currentChunk)
    this.buffer = mergedBuffer
  }

  /**
   * Update the merged text from all chunks
   */
  private updateMergedText(): void {
    this.mergedText = this.buffer
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(chunk => chunk.text)
      .join(' ')
      .trim()
  }

  /**
   * Update partial state based on chunks
   */
  private updatePartialState(isPartial: boolean): void {
    this.isPartialState = isPartial || this.buffer.some(chunk => chunk.isPartial)
  }

  /**
   * Debounced flush to prevent excessive updates
   */
  private debouncedFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.flush()
    }, this.config.debounceDelay)
  }

  /**
   * Flush the buffer and return the merged text
   */
  public flush(): string {
    this.lastFlushTime = Date.now()

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Emit flush event
    this.emit('flush', this.mergedText, this.isPartialState, [...this.buffer])

    return this.mergedText
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
    this.mergedText = ''
    this.isPartialState = false
    this.lastFlushTime = 0

    // Emit clear event
    this.emit('clear', '', false, [])
  }

  /**
   * Get the current merged text
   */
  public getText(): string {
    return this.mergedText
  }

  /**
   * Get the current partial state
   */
  public isPartial(): boolean {
    return this.isPartialState
  }

  /**
   * Get all chunks in the buffer
   */
  public getChunks(): TextChunk[] {
    return [...this.buffer]
  }

  /**
   * Get buffer statistics
   */
  public getStats() {
    return {
      chunkCount: this.buffer.length,
      totalTextLength: this.mergedText.length,
      isPartial: this.isPartialState,
      lastFlushTime: this.lastFlushTime,
      oldestChunk: this.buffer.length > 0 ? this.buffer[0].timestamp : null,
      newestChunk: this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].timestamp : null
    }
  }

  /**
   * Subscribe to buffer events
   */
  public subscribe(event: TextStreamBufferEvent, listener: TextStreamBufferListener): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.push(listener)
    }
  }

  /**
   * Unsubscribe from buffer events
   */
  public unsubscribe(event: TextStreamBufferEvent, listener: TextStreamBufferListener): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      const index = eventListeners.indexOf(listener)
      if (index > -1) {
        eventListeners.splice(index, 1)
      }
    }
  }

  /**
   * Emit events to listeners
   */
  private emit(
    event: TextStreamBufferEvent,
    text: string,
    isPartial: boolean,
    chunks: TextChunk[]
  ): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(text, isPartial, chunks)
        } catch (error) {
          console.error(`Error in TextStreamBuffer event listener for ${event}:`, error)
        }
      })
    }
  }

  /**
   * Dispose of the buffer and clean up resources
   */
  public dispose(): void {
    this.clear()
    this.listeners.clear()
  }
}

export default TextStreamBuffer
