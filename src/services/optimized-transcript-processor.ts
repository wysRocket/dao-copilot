/**
 * Optimized Transcript Processing System
 * Implements efficient data structures and state management for high-performance transcript handling
 */

import {EventEmitter} from 'events'

export interface TranscriptEntry {
  id: string
  text: string
  confidence?: number
  timestamp: number
  isPartial: boolean
  isFinal: boolean
  speakerId?: string
  metadata?: {
    duration?: number
    wordCount?: number
    language?: string
    processingTime?: number
  }
}

export interface TranscriptChunk {
  id: string
  entries: TranscriptEntry[]
  startTime: number
  endTime: number
  totalWords: number
  averageConfidence: number
}

export interface CircularBufferConfig {
  maxSize: number
  chunkSize: number
  retentionTime: number // milliseconds
  enableCompression: boolean
}

export interface ProcessingStats {
  totalEntries: number
  averageProcessingTime: number
  bufferUtilization: number
  compressionRatio: number
  memoryUsage: number
  throughput: number // entries per second
}

/**
 * High-performance circular buffer for transcript data
 * Optimized for memory efficiency and fast access patterns
 */
export class TranscriptCircularBuffer {
  private buffer: TranscriptEntry[]
  private head = 0
  private tail = 0
  private size = 0
  private readonly maxSize: number
  private readonly enableCompression: boolean
  private retentionTime: number
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(config: CircularBufferConfig) {
    this.maxSize = config.maxSize
    this.enableCompression = config.enableCompression
    this.retentionTime = config.retentionTime
    this.buffer = new Array(this.maxSize)

    // Start cleanup timer for expired entries
    this.startCleanupTimer()
  }

  /**
   * Add new transcript entry with automatic overflow handling
   */
  add(entry: TranscriptEntry): void {
    // Add timestamp if not present
    if (!entry.timestamp) {
      entry.timestamp = Date.now()
    }

    // Compress text if enabled and entry is final
    if (this.enableCompression && entry.isFinal) {
      entry.text = this.compressText(entry.text)
    }

    // Handle buffer overflow
    if (this.size === this.maxSize) {
      this.removeOldest()
    }

    this.buffer[this.tail] = entry
    this.tail = (this.tail + 1) % this.maxSize
    this.size++
  }

  /**
   * Get recent entries with optional filtering
   */
  getRecent(count: number, filter?: (entry: TranscriptEntry) => boolean): TranscriptEntry[] {
    const result: TranscriptEntry[] = []
    let collected = 0

    for (let i = 0; i < this.size && collected < count; i++) {
      const index = (this.tail - 1 - i + this.maxSize) % this.maxSize
      const entry = this.buffer[index]

      if (entry && (!filter || filter(entry))) {
        result.push(entry)
        collected++
      }
    }

    return result.reverse() // Return in chronological order
  }

  /**
   * Get all final entries within time range
   */
  getFinalEntriesInRange(startTime: number, endTime: number): TranscriptEntry[] {
    const result: TranscriptEntry[] = []

    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.maxSize
      const entry = this.buffer[index]

      if (entry && entry.isFinal && entry.timestamp >= startTime && entry.timestamp <= endTime) {
        result.push(entry)
      }
    }

    return result
  }

  /**
   * Search entries by text content
   */
  search(query: string, caseSensitive = false): TranscriptEntry[] {
    const searchTerm = caseSensitive ? query : query.toLowerCase()
    const result: TranscriptEntry[] = []

    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.maxSize
      const entry = this.buffer[index]

      if (entry) {
        const text = caseSensitive ? entry.text : entry.text.toLowerCase()
        if (text.includes(searchTerm)) {
          result.push(entry)
        }
      }
    }

    return result
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    size: number
    utilization: number
    oldestEntry: number
    newestEntry: number
    finalEntries: number
    partialEntries: number
  } {
    let finalCount = 0
    let partialCount = 0
    let oldestTimestamp = Date.now()
    let newestTimestamp = 0

    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.maxSize
      const entry = this.buffer[index]

      if (entry) {
        if (entry.isFinal) finalCount++
        else partialCount++

        oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp)
        newestTimestamp = Math.max(newestTimestamp, entry.timestamp)
      }
    }

    return {
      size: this.size,
      utilization: (this.size / this.maxSize) * 100,
      oldestEntry: oldestTimestamp,
      newestEntry: newestTimestamp,
      finalEntries: finalCount,
      partialEntries: partialCount
    }
  }

  /**
   * Clear expired entries based on retention time
   */
  private cleanupExpiredEntries(): void {
    const cutoffTime = Date.now() - this.retentionTime
    let removed = 0

    while (this.size > 0) {
      const entry = this.buffer[this.head]
      if (entry && entry.timestamp < cutoffTime) {
        this.removeOldest()
        removed++
      } else {
        break
      }
    }

    if (removed > 0) {
      console.log(`Cleaned up ${removed} expired transcript entries`)
    }
  }

  private removeOldest(): void {
    if (this.size > 0) {
      this.buffer[this.head] = null as any
      this.head = (this.head + 1) % this.maxSize
      this.size--
    }
  }

  private compressText(text: string): string {
    // Simple text compression - remove extra spaces and normalize
    return text.replace(/\s+/g, ' ').trim()
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries()
    }, 30000) // Cleanup every 30 seconds
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.buffer = []
    this.size = 0
  }
}

/**
 * Advanced transcript processor with chunk management and performance optimization
 */
export class OptimizedTranscriptProcessor extends EventEmitter {
  private circularBuffer: TranscriptCircularBuffer
  private processingQueue: TranscriptEntry[] = []
  private processingTimer: NodeJS.Timeout | null = null
  private isProcessing = false
  private stats: ProcessingStats = {
    totalEntries: 0,
    averageProcessingTime: 0,
    bufferUtilization: 0,
    compressionRatio: 0,
    memoryUsage: 0,
    throughput: 0
  }
  private processingTimes: number[] = []
  private lastThroughputUpdate = Date.now()
  private entriesInLastSecond = 0

  constructor(bufferConfig: CircularBufferConfig) {
    super()

    this.circularBuffer = new TranscriptCircularBuffer(bufferConfig)
    this.startProcessingLoop()
    this.startStatsUpdater()
  }

  /**
   * Add transcript entry for processing
   */
  addEntry(entry: TranscriptEntry): void {
    // Validate entry
    if (!entry.id || !entry.text) {
      console.warn('Invalid transcript entry rejected:', entry)
      return
    }

    // Add to processing queue
    this.processingQueue.push({
      ...entry,
      timestamp: entry.timestamp || Date.now()
    })

    // Trigger immediate processing for high-priority entries
    if (entry.isFinal || this.processingQueue.length > 10) {
      this.processQueue()
    }

    this.emit('entryQueued', entry)
  }

  /**
   * Process a batch of transcript entries
   */
  addBatch(entries: TranscriptEntry[]): void {
    const validEntries = entries.filter(entry => entry.id && entry.text)

    if (validEntries.length !== entries.length) {
      console.warn(`Rejected ${entries.length - validEntries.length} invalid entries`)
    }

    this.processingQueue.push(
      ...validEntries.map(entry => ({
        ...entry,
        timestamp: entry.timestamp || Date.now()
      }))
    )

    this.processQueue()
    this.emit('batchQueued', {count: validEntries.length})
  }

  /**
   * Get recent transcript entries
   */
  getRecentEntries(count = 50, onlyFinal = false): TranscriptEntry[] {
    const filter = onlyFinal ? (entry: TranscriptEntry) => entry.isFinal : undefined
    return this.circularBuffer.getRecent(count, filter)
  }

  /**
   * Get transcript text for a time range
   */
  getTranscriptText(startTime: number, endTime: number, separator = ' '): string {
    const entries = this.circularBuffer.getFinalEntriesInRange(startTime, endTime)
    return entries.map(entry => entry.text).join(separator)
  }

  /**
   * Search transcript content
   */
  searchTranscript(
    query: string,
    options?: {
      caseSensitive?: boolean
      maxResults?: number
      timeRange?: {start: number; end: number}
    }
  ): TranscriptEntry[] {
    let results = this.circularBuffer.search(query, options?.caseSensitive)

    // Apply time range filter
    if (options?.timeRange) {
      results = results.filter(
        entry =>
          entry.timestamp >= options.timeRange!.start && entry.timestamp <= options.timeRange!.end
      )
    }

    // Limit results
    if (options?.maxResults) {
      results = results.slice(0, options.maxResults)
    }

    return results
  }

  /**
   * Generate transcript chunks for efficient rendering
   */
  generateChunks(chunkSize = 100): TranscriptChunk[] {
    const recentEntries = this.circularBuffer.getRecent(1000, entry => entry.isFinal)
    const chunks: TranscriptChunk[] = []

    for (let i = 0; i < recentEntries.length; i += chunkSize) {
      const chunkEntries = recentEntries.slice(i, i + chunkSize)

      if (chunkEntries.length > 0) {
        const chunk: TranscriptChunk = {
          id: `chunk_${Math.floor(i / chunkSize)}`,
          entries: chunkEntries,
          startTime: chunkEntries[0].timestamp,
          endTime: chunkEntries[chunkEntries.length - 1].timestamp,
          totalWords: chunkEntries.reduce((sum, entry) => sum + entry.text.split(' ').length, 0),
          averageConfidence:
            chunkEntries.reduce((sum, entry) => sum + (entry.confidence || 0), 0) /
            chunkEntries.length
        }

        chunks.push(chunk)
      }
    }

    return chunks
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats & {bufferStats: any} {
    return {
      ...this.stats,
      bufferStats: this.circularBuffer.getStats()
    }
  }

  /**
   * Process queued entries in batches
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return
    }

    this.isProcessing = true
    const startTime = Date.now()

    try {
      // Process entries in batches
      const batchSize = Math.min(20, this.processingQueue.length)
      const batch = this.processingQueue.splice(0, batchSize)

      for (const entry of batch) {
        // Add processing metadata
        entry.metadata = {
          ...entry.metadata,
          processingTime: Date.now() - entry.timestamp,
          wordCount: entry.text.split(' ').length
        }

        // Add to circular buffer
        this.circularBuffer.add(entry)
        this.stats.totalEntries++
        this.entriesInLastSecond++

        // Emit processed entry
        this.emit('entryProcessed', entry)
      }

      // Update processing time statistics
      const processingTime = Date.now() - startTime
      this.processingTimes.push(processingTime)

      // Keep only last 100 processing times for rolling average
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift()
      }

      this.stats.averageProcessingTime =
        this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length

      this.emit('batchProcessed', {
        count: batch.length,
        processingTime,
        queueLength: this.processingQueue.length
      })
    } catch (error) {
      console.error('Error processing transcript queue:', error)
      this.emit('processingError', error)
    } finally {
      this.isProcessing = false

      // Continue processing if queue not empty
      if (this.processingQueue.length > 0) {
        setTimeout(() => this.processQueue(), 10)
      }
    }
  }

  /**
   * Start the processing loop
   */
  private startProcessingLoop(): void {
    this.processingTimer = setInterval(() => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        this.processQueue()
      }
    }, 100) // Process every 100ms
  }

  /**
   * Update statistics periodically
   */
  private startStatsUpdater(): void {
    setInterval(() => {
      const bufferStats = this.circularBuffer.getStats()

      // Update buffer utilization
      this.stats.bufferUtilization = bufferStats.utilization

      // Update throughput (entries per second)
      const now = Date.now()
      if (now - this.lastThroughputUpdate >= 1000) {
        this.stats.throughput = this.entriesInLastSecond
        this.entriesInLastSecond = 0
        this.lastThroughputUpdate = now
      }

      // Estimate memory usage (rough calculation)
      this.stats.memoryUsage = bufferStats.size * 200 // ~200 bytes per entry estimate

      this.emit('statsUpdated', this.stats)
    }, 1000) // Update every second
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer)
      this.processingTimer = null
    }

    this.circularBuffer.destroy()
    this.processingQueue = []
    this.emit('destroyed')
  }
}
