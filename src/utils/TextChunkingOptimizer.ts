/**
 * Text Chunking Optimizer
 * 
 * Efficiently processes streaming text for optimal rendering performance
 * Implements intelligent chunking, diff algorithms, and memory optimization
 */

export interface TextChunk {
  id: string
  text: string
  startIndex: number
  endIndex: number
  isComplete: boolean
  timestamp: number
  hash?: string
}

export interface TextDiff {
  type: 'insert' | 'delete' | 'replace' | 'retain'
  position: number
  length: number
  text?: string
  oldText?: string
}

export interface ChunkingOptions {
  maxChunkSize: number
  minChunkSize: number
  preferWordBoundaries: boolean
  enableHashing: boolean
  enableDiffOptimization: boolean
}

export interface ChunkingMetrics {
  totalChunks: number
  averageChunkSize: number
  maxChunkSize: number
  totalMemoryUsed: number
  diffOperations: number
  cacheHits: number
  cacheMisses: number
}

const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  maxChunkSize: 1000, // Maximum characters per chunk
  minChunkSize: 50,   // Minimum characters per chunk
  preferWordBoundaries: true,
  enableHashing: true,
  enableDiffOptimization: true
}

/**
 * TextChunkingOptimizer class for efficient text processing
 */
export class TextChunkingOptimizer {
  private chunks: Map<string, TextChunk> = new Map()
  private chunkOrder: string[] = []
  private options: ChunkingOptions
  private metrics: ChunkingMetrics
  private textCache: Map<string, string> = new Map()
  private diffCache: Map<string, TextDiff[]> = new Map()

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = { ...DEFAULT_CHUNKING_OPTIONS, ...options }
    this.metrics = {
      totalChunks: 0,
      averageChunkSize: 0,
      maxChunkSize: 0,
      totalMemoryUsed: 0,
      diffOperations: 0,
      cacheHits: 0,
      cacheMisses: 0
    }
  }

  /**
   * Process streaming text and return optimized chunks
   */
  processStreamingText(text: string, isComplete: boolean = false): TextChunk[] {
    const timestamp = Date.now()
    const textHash = this.options.enableHashing ? this.hashText(text) : undefined

    // Check cache first
    if (this.options.enableDiffOptimization && textHash) {
      const cached = this.textCache.get(textHash)
      if (cached) {
        this.metrics.cacheHits++
        return this.getChunksFromCache(cached, timestamp, isComplete)
      }
      this.metrics.cacheMisses++
    }

    // Clear existing chunks if starting fresh
    if (this.chunks.size === 0 || this.shouldResetChunks(text)) {
      this.clearChunks()
    }

    const newChunks = this.createOptimalChunks(text, timestamp, isComplete)
    
    // Update cache
    if (this.options.enableHashing && textHash) {
      this.textCache.set(textHash, text)
    }

    this.updateMetrics()
    return newChunks
  }

  /**
   * Get differences between current text and new text
   */
  getDifferences(oldText: string, newText: string): TextDiff[] {
    const cacheKey = `${this.hashText(oldText)}-${this.hashText(newText)}`
    
    if (this.options.enableDiffOptimization && this.diffCache.has(cacheKey)) {
      this.metrics.cacheHits++
      return this.diffCache.get(cacheKey)!
    }

    this.metrics.cacheMisses++
    const diffs = this.computeTextDifferences(oldText, newText)
    
    if (this.options.enableDiffOptimization) {
      // Only cache small diffs to prevent memory bloat
      if (diffs.length < 10) {
        this.diffCache.set(cacheKey, diffs)
      }
    }

    this.metrics.diffOperations++
    return diffs
  }

  /**
   * Apply differences to existing chunks for incremental updates
   */
  applyDifferences(diffs: TextDiff[]): TextChunk[] {
    const updatedChunks: TextChunk[] = []
    let currentPosition = 0

    for (const diff of diffs) {
      switch (diff.type) {
        case 'retain':
          // Keep existing chunks in this range
          this.retainChunksInRange(currentPosition, currentPosition + diff.length, updatedChunks)
          currentPosition += diff.length
          break

        case 'insert':
          // Insert new text and create chunks
          if (diff.text) {
            const insertChunks = this.createOptimalChunks(
              diff.text,
              Date.now(),
              false,
              currentPosition
            )
            updatedChunks.push(...insertChunks)
          }
          break

        case 'delete':
          // Remove chunks in this range
          this.removeChunksInRange(currentPosition, currentPosition + diff.length)
          break

        case 'replace':
          // Replace chunks in this range
          this.removeChunksInRange(currentPosition, currentPosition + diff.length)
          if (diff.text) {
            const replaceChunks = this.createOptimalChunks(
              diff.text,
              Date.now(),
              false,
              currentPosition
            )
            updatedChunks.push(...replaceChunks)
          }
          currentPosition += diff.length
          break
      }
    }

    this.reorderChunks()
    return this.getAllChunks()
  }

  /**
   * Get all current chunks in order
   */
  getAllChunks(): TextChunk[] {
    return this.chunkOrder.map(id => this.chunks.get(id)).filter(Boolean) as TextChunk[]
  }

  /**
   * Get chunks for a specific text range
   */
  getChunksInRange(startIndex: number, endIndex: number): TextChunk[] {
    return this.getAllChunks().filter(chunk => 
      chunk.startIndex < endIndex && chunk.endIndex > startIndex
    )
  }

  /**
   * Clear all chunks and reset state
   */
  clearChunks(): void {
    this.chunks.clear()
    this.chunkOrder = []
    this.updateMetrics()
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): ChunkingMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalChunks: 0,
      averageChunkSize: 0,
      maxChunkSize: 0,
      totalMemoryUsed: 0,
      diffOperations: 0,
      cacheHits: 0,
      cacheMisses: 0
    }
  }

  /**
   * Optimize memory usage by clearing old caches
   */
  optimizeMemory(maxCacheSize: number = 100): void {
    // Clear old text cache entries
    if (this.textCache.size > maxCacheSize) {
      const entries = Array.from(this.textCache.entries())
      const toDelete = entries.slice(0, entries.length - maxCacheSize)
      toDelete.forEach(([key]) => this.textCache.delete(key))
    }

    // Clear old diff cache entries
    if (this.diffCache.size > maxCacheSize) {
      const entries = Array.from(this.diffCache.entries())
      const toDelete = entries.slice(0, entries.length - maxCacheSize)
      toDelete.forEach(([key]) => this.diffCache.delete(key))
    }
  }

  // Private methods

  private createOptimalChunks(
    text: string,
    timestamp: number,
    isComplete: boolean,
    startOffset: number = 0
  ): TextChunk[] {
    const chunks: TextChunk[] = []
    let currentIndex = 0

    while (currentIndex < text.length) {
      const chunkSize = this.calculateOptimalChunkSize(text, currentIndex)
      const chunkEnd = Math.min(currentIndex + chunkSize, text.length)
      
      // Adjust to word boundaries if enabled
      const adjustedEnd = this.options.preferWordBoundaries 
        ? this.adjustToWordBoundary(text, chunkEnd, currentIndex)
        : chunkEnd

      const chunkText = text.slice(currentIndex, adjustedEnd)
      const chunkId = this.generateChunkId(startOffset + currentIndex, adjustedEnd)
      
      const chunk: TextChunk = {
        id: chunkId,
        text: chunkText,
        startIndex: startOffset + currentIndex,
        endIndex: startOffset + adjustedEnd,
        isComplete: isComplete && adjustedEnd === text.length,
        timestamp,
        hash: this.options.enableHashing ? this.hashText(chunkText) : undefined
      }

      this.chunks.set(chunkId, chunk)
      this.chunkOrder.push(chunkId)
      chunks.push(chunk)

      currentIndex = adjustedEnd
    }

    return chunks
  }

  private calculateOptimalChunkSize(text: string, currentIndex: number): number {
    const remainingLength = text.length - currentIndex
    
    // Use minimum chunk size for small remaining text
    if (remainingLength <= this.options.minChunkSize) {
      return remainingLength
    }

    // Use maximum chunk size as baseline
    let chunkSize = this.options.maxChunkSize

    // Adjust based on text characteristics
    const textSlice = text.slice(currentIndex, currentIndex + chunkSize)
    
    // Prefer breaking at sentence boundaries
    const lastSentenceEnd = Math.max(
      textSlice.lastIndexOf('.'),
      textSlice.lastIndexOf('!'),
      textSlice.lastIndexOf('?')
    )

    if (lastSentenceEnd > this.options.minChunkSize) {
      chunkSize = lastSentenceEnd + 1
    }

    return Math.max(this.options.minChunkSize, chunkSize)
  }

  private adjustToWordBoundary(text: string, end: number, start: number): number {
    // Don't adjust if we're at the text end
    if (end >= text.length) return end

    // Don't adjust if we're already at a word boundary
    if (text[end] === ' ' || text[end] === '\n') return end

    // Look backward for a word boundary
    let adjustedEnd = end
    while (adjustedEnd > start && text[adjustedEnd] !== ' ' && text[adjustedEnd] !== '\n') {
      adjustedEnd--
    }

    // If we couldn't find a word boundary, use original end
    if (adjustedEnd <= start) {
      return end
    }

    return adjustedEnd
  }

  private shouldResetChunks(text: string): boolean {
    // Reset if text is significantly different from current chunks
    const currentText = this.getAllChunks().map(chunk => chunk.text).join('')
    
    // If new text is much shorter, likely a reset
    if (text.length < currentText.length * 0.5) {
      return true
    }

    // If text doesn't start with current text, likely a reset
    if (currentText.length > 0 && !text.startsWith(currentText.slice(0, Math.min(100, currentText.length)))) {
      return true
    }

    return false
  }

  private computeTextDifferences(oldText: string, newText: string): TextDiff[] {
    const diffs: TextDiff[] = []
    
    // Simple diff algorithm - can be enhanced with more sophisticated algorithms
    let oldIndex = 0
    let newIndex = 0

    while (oldIndex < oldText.length || newIndex < newText.length) {
      if (oldIndex >= oldText.length) {
        // Insert remaining new text
        diffs.push({
          type: 'insert',
          position: oldIndex,
          length: newText.length - newIndex,
          text: newText.slice(newIndex)
        })
        break
      }

      if (newIndex >= newText.length) {
        // Delete remaining old text
        diffs.push({
          type: 'delete',
          position: oldIndex,
          length: oldText.length - oldIndex,
          oldText: oldText.slice(oldIndex)
        })
        break
      }

      if (oldText[oldIndex] === newText[newIndex]) {
        // Characters match, find length of matching sequence
        let matchLength = 0
        while (
          oldIndex + matchLength < oldText.length &&
          newIndex + matchLength < newText.length &&
          oldText[oldIndex + matchLength] === newText[newIndex + matchLength]
        ) {
          matchLength++
        }

        diffs.push({
          type: 'retain',
          position: oldIndex,
          length: matchLength
        })

        oldIndex += matchLength
        newIndex += matchLength
      } else {
        // Characters differ, find the next matching point
        const nextMatch = this.findNextMatch(oldText, newText, oldIndex, newIndex)
        
        if (nextMatch) {
          if (nextMatch.oldIndex > oldIndex && nextMatch.newIndex > newIndex) {
            // Replace operation
            diffs.push({
              type: 'replace',
              position: oldIndex,
              length: nextMatch.oldIndex - oldIndex,
              text: newText.slice(newIndex, nextMatch.newIndex),
              oldText: oldText.slice(oldIndex, nextMatch.oldIndex)
            })
          } else if (nextMatch.oldIndex > oldIndex) {
            // Delete operation
            diffs.push({
              type: 'delete',
              position: oldIndex,
              length: nextMatch.oldIndex - oldIndex,
              oldText: oldText.slice(oldIndex, nextMatch.oldIndex)
            })
          } else if (nextMatch.newIndex > newIndex) {
            // Insert operation
            diffs.push({
              type: 'insert',
              position: oldIndex,
              length: nextMatch.newIndex - newIndex,
              text: newText.slice(newIndex, nextMatch.newIndex)
            })
          }

          oldIndex = nextMatch.oldIndex
          newIndex = nextMatch.newIndex
        } else {
          // No more matches, handle remaining text
          if (oldText.length - oldIndex > 0) {
            diffs.push({
              type: 'delete',
              position: oldIndex,
              length: oldText.length - oldIndex,
              oldText: oldText.slice(oldIndex)
            })
          }
          if (newText.length - newIndex > 0) {
            diffs.push({
              type: 'insert',
              position: oldIndex,
              length: newText.length - newIndex,
              text: newText.slice(newIndex)
            })
          }
          break
        }
      }
    }

    return diffs
  }

  private findNextMatch(
    oldText: string,
    newText: string,
    oldStart: number,
    newStart: number,
    minMatchLength: number = 3
  ): { oldIndex: number; newIndex: number } | null {
    for (let oldIndex = oldStart; oldIndex < oldText.length - minMatchLength; oldIndex++) {
      for (let newIndex = newStart; newIndex < newText.length - minMatchLength; newIndex++) {
        if (this.textsMatch(oldText, newText, oldIndex, newIndex, minMatchLength)) {
          return { oldIndex, newIndex }
        }
      }
    }
    return null
  }

  private textsMatch(
    oldText: string,
    newText: string,
    oldIndex: number,
    newIndex: number,
    length: number
  ): boolean {
    for (let i = 0; i < length; i++) {
      if (oldText[oldIndex + i] !== newText[newIndex + i]) {
        return false
      }
    }
    return true
  }

  private retainChunksInRange(startIndex: number, endIndex: number, targetArray: TextChunk[]): void {
    const chunksInRange = this.getChunksInRange(startIndex, endIndex)
    targetArray.push(...chunksInRange)
  }

  private removeChunksInRange(startIndex: number, endIndex: number): void {
    const chunksToRemove = this.getChunksInRange(startIndex, endIndex)
    chunksToRemove.forEach(chunk => {
      this.chunks.delete(chunk.id)
      const orderIndex = this.chunkOrder.indexOf(chunk.id)
      if (orderIndex >= 0) {
        this.chunkOrder.splice(orderIndex, 1)
      }
    })
  }

  private reorderChunks(): void {
    const allChunks = Array.from(this.chunks.values())
    allChunks.sort((a, b) => a.startIndex - b.startIndex)
    this.chunkOrder = allChunks.map(chunk => chunk.id)
  }

  private getChunksFromCache(text: string, timestamp: number, isComplete: boolean): TextChunk[] {
    // This is a simplified cache retrieval - in practice, you might want more sophisticated caching
    return this.createOptimalChunks(text, timestamp, isComplete)
  }

  private generateChunkId(startIndex: number, endIndex: number): string {
    return `chunk_${startIndex}_${endIndex}_${Date.now()}`
  }

  private hashText(text: string): string {
    // Simple hash function - can be replaced with more robust hashing
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(16)
  }

  private updateMetrics(): void {
    const chunks = this.getAllChunks()
    this.metrics.totalChunks = chunks.length
    
    if (chunks.length > 0) {
      const chunkSizes = chunks.map(chunk => chunk.text.length)
      this.metrics.averageChunkSize = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length
      this.metrics.maxChunkSize = Math.max(...chunkSizes)
    }

    // Estimate memory usage
    this.metrics.totalMemoryUsed = this.estimateMemoryUsage()
  }

  private estimateMemoryUsage(): number {
    let totalSize = 0
    
    // Estimate chunk storage
    this.chunks.forEach(chunk => {
      totalSize += chunk.text.length * 2 // Assuming 2 bytes per character
      totalSize += 200 // Overhead for chunk object
    })

    // Estimate cache storage
    this.textCache.forEach((value, key) => {
      totalSize += key.length * 2 + value.length * 2
    })

    this.diffCache.forEach((diffs, key) => {
      totalSize += key.length * 2
      totalSize += diffs.length * 100 // Rough estimate for diff objects
    })

    return totalSize
  }
}

// Utility functions

/**
 * Create a text chunking optimizer with sensible defaults for streaming transcription
 */
export function createStreamingTextOptimizer(): TextChunkingOptimizer {
  return new TextChunkingOptimizer({
    maxChunkSize: 500,     // Smaller chunks for responsive streaming
    minChunkSize: 20,      // Allow small chunks for real-time updates
    preferWordBoundaries: true,
    enableHashing: true,
    enableDiffOptimization: true
  })
}

/**
 * Create a text chunking optimizer optimized for large document processing
 */
export function createDocumentTextOptimizer(): TextChunkingOptimizer {
  return new TextChunkingOptimizer({
    maxChunkSize: 2000,    // Larger chunks for documents
    minChunkSize: 100,     // Reasonable minimum for readability
    preferWordBoundaries: true,
    enableHashing: true,
    enableDiffOptimization: false // Disable for large documents
  })
}

/**
 * Utility function to merge multiple text chunks into a single string
 */
export function mergeChunks(chunks: TextChunk[]): string {
  return chunks
    .sort((a, b) => a.startIndex - b.startIndex)
    .map(chunk => chunk.text)
    .join('')
}

/**
 * Utility function to find chunks containing specific text positions
 */
export function findChunksAtPosition(chunks: TextChunk[], position: number): TextChunk[] {
  return chunks.filter(chunk => 
    position >= chunk.startIndex && position < chunk.endIndex
  )
}
