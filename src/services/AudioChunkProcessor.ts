/**
 * Memory-Efficient Audio Chunk Processor
 * 
 * Replaces recursive audio processing patterns with iterative approach
 * to prevent stack overflow errors during WebSocket transcription.
 * 
 * Key Features:
 * - Iterative processing instead of recursive function calls
 * - Memory-efficient chunk streaming
 * - Controlled concurrency to prevent resource exhaustion
 * - Proper error handling without stack accumulation
 * - Event-driven architecture with cleanup
 */

import { EventEmitter } from 'events'

export interface AudioChunk {
  data: Buffer
  index: number
  isLast: boolean
  timestamp: number
}

export interface ProcessingOptions {
  chunkSize: number
  maxConcurrentChunks: number
  processingDelay: number
  retryAttempts: number
  retryDelay: number
}

export interface ProcessingResult {
  text: string
  confidence: number
  duration: number
  chunksProcessed: number
  errors: string[]
}

export interface ProcessingError {
  chunkIndex: number
  error: Error
  timestamp: number
  retryAttempt: number
}

/**
 * Iterative Audio Chunk Processor
 * 
 * Processes audio data in manageable chunks using iterative approach
 * instead of recursive function calls to prevent stack overflow.
 */
export class AudioChunkProcessor extends EventEmitter {
  private readonly options: ProcessingOptions
  private isProcessing = false
  private processingQueue: AudioChunk[] = []
  private activeChunks = new Map<number, Promise<void>>()
  private results: Array<{ text: string; confidence: number }> = []
  private errors: ProcessingError[] = []
  private startTime = 0

  constructor(options: Partial<ProcessingOptions> = {}) {
    super()
    
    this.options = {
      chunkSize: 32 * 1024, // 32KB chunks for optimal WebSocket performance
      maxConcurrentChunks: 3, // Limit concurrent processing to prevent memory spikes
      processingDelay: 100, // 100ms delay between chunks for throttling
      retryAttempts: 2, // Limited retries to prevent infinite loops
      retryDelay: 1000, // 1 second between retries
      ...options
    }

    // Set max listeners to prevent memory leaks
    this.setMaxListeners(this.options.maxConcurrentChunks * 2)
  }

  /**
   * Process audio data iteratively without recursion
   * 
   * @param audioData Raw audio buffer to process
   * @param processChunk Function to process individual chunks
   * @returns Promise<ProcessingResult>
   */
  async processAudio(
    audioData: Buffer,
    processChunk: (chunk: AudioChunk) => Promise<{ text: string; confidence: number }>
  ): Promise<ProcessingResult> {
    if (this.isProcessing) {
      throw new Error('AudioChunkProcessor is already processing audio')
    }

    this.isProcessing = true
    this.startTime = Date.now()
    this.results = []
    this.errors = []
    this.processingQueue = []
    this.activeChunks.clear()

    try {
      // Split audio into chunks iteratively
      const chunks = this.createChunks(audioData)
      console.log(`AudioChunkProcessor: Created ${chunks.length} chunks for processing`)

      // Process chunks iteratively with controlled concurrency
      await this.processChunksIteratively(chunks, processChunk)

      // Aggregate results
      const finalResult = this.aggregateResults()
      
      console.log(`AudioChunkProcessor: Completed processing ${chunks.length} chunks in ${finalResult.duration}ms`)
      
      return finalResult

    } finally {
      this.cleanup()
    }
  }

  /**
   * Create audio chunks iteratively without recursion
   */
  private createChunks(audioData: Buffer): AudioChunk[] {
    const chunks: AudioChunk[] = []
    const totalChunks = Math.ceil(audioData.length / this.options.chunkSize)

    // Iterative chunk creation (not recursive)
    for (let i = 0; i < totalChunks; i++) {
      const startPos = i * this.options.chunkSize
      const endPos = Math.min(startPos + this.options.chunkSize, audioData.length)
      const chunkData = audioData.subarray(startPos, endPos)

      chunks.push({
        data: chunkData,
        index: i,
        isLast: i === totalChunks - 1,
        timestamp: Date.now()
      })
    }

    return chunks
  }

  /**
   * Process chunks iteratively with controlled concurrency
   * Uses iterative approach instead of recursive function calls
   */
  private async processChunksIteratively(
    chunks: AudioChunk[],
    processChunk: (chunk: AudioChunk) => Promise<{ text: string; confidence: number }>
  ): Promise<void> {
    let processedCount = 0
    let chunkIndex = 0

    // Iterative processing loop (not recursive)
    while (processedCount < chunks.length) {
      // Start new chunks up to concurrency limit
      while (
        this.activeChunks.size < this.options.maxConcurrentChunks &&
        chunkIndex < chunks.length
      ) {
        const chunk = chunks[chunkIndex]
        const processingPromise = this.processChunkWithRetry(chunk, processChunk)
        
        this.activeChunks.set(chunk.index, processingPromise)
        chunkIndex++

        // Add delay between starting chunks to prevent resource spikes
        if (chunkIndex < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, this.options.processingDelay))
        }
      }

      // Wait for at least one chunk to complete
      if (this.activeChunks.size > 0) {
        await Promise.race(Array.from(this.activeChunks.values()))
        
        // Clean up completed chunks
        for (const [index, promise] of this.activeChunks) {
          try {
            // Check if promise is resolved without blocking
            const isResolved = await Promise.race([
              promise.then(() => true),
              new Promise<boolean>(resolve => setTimeout(() => resolve(false), 0))
            ])

            if (isResolved) {
              this.activeChunks.delete(index)
              processedCount++
            }
          } catch {
            // Promise rejected, remove it
            this.activeChunks.delete(index)
            processedCount++
          }
        }
      }
    }

    // Wait for all remaining chunks to complete
    if (this.activeChunks.size > 0) {
      await Promise.allSettled(Array.from(this.activeChunks.values()))
    }
  }

  /**
   * Process individual chunk with retry logic (iterative, not recursive)
   */
  private async processChunkWithRetry(
    chunk: AudioChunk,
    processChunk: (chunk: AudioChunk) => Promise<{ text: string; confidence: number }>
  ): Promise<void> {
    let lastError: Error | null = null

    // Iterative retry loop (not recursive)
    for (let attempt = 0; attempt <= this.options.retryAttempts; attempt++) {
      try {
        this.emit('chunkStart', chunk.index, attempt)
        
        const result = await processChunk(chunk)
        
        // Store result in order
        this.results[chunk.index] = result
        
        this.emit('chunkComplete', chunk.index, result)
        return

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        this.errors.push({
          chunkIndex: chunk.index,
          error: lastError,
          timestamp: Date.now(),
          retryAttempt: attempt
        })

        this.emit('chunkError', chunk.index, lastError, attempt)

        // If not the last attempt, wait before retrying
        if (attempt < this.options.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay))
        }
      }
    }

    // All retries failed, emit final error
    this.emit('chunkFailed', chunk.index, lastError)
  }

  /**
   * Aggregate processing results
   */
  private aggregateResults(): ProcessingResult {
    // Filter out empty/null results
    const validResults = this.results.filter(result => result && result.text)

    // Combine text results
    const combinedText = validResults
      .map(result => result.text.trim())
      .filter(text => text.length > 0)
      .join(' ')

    // Calculate average confidence
    const avgConfidence = validResults.length > 0
      ? validResults.reduce((sum, result) => sum + result.confidence, 0) / validResults.length
      : 0

    return {
      text: combinedText,
      confidence: avgConfidence,
      duration: Date.now() - this.startTime,
      chunksProcessed: validResults.length,
      errors: this.errors.map(err => `Chunk ${err.chunkIndex}: ${err.error.message}`)
    }
  }

  /**
   * Cleanup resources and reset state
   */
  private cleanup(): void {
    this.isProcessing = false
    this.activeChunks.clear()
    this.processingQueue = []
    this.removeAllListeners()
  }

  /**
   * Cancel ongoing processing
   */
  async cancelProcessing(): Promise<void> {
    if (!this.isProcessing) {
      return
    }

    console.log('AudioChunkProcessor: Cancelling processing...')
    
    // Wait for active chunks to complete or timeout
    const timeout = 5000 // 5 second timeout
    const timeoutPromise = new Promise<void>(resolve => 
      setTimeout(() => resolve(), timeout)
    )

    await Promise.race([
      Promise.allSettled(Array.from(this.activeChunks.values())),
      timeoutPromise
    ])

    this.cleanup()
    this.emit('cancelled')
  }

  /**
   * Get current processing status
   */
  getStatus(): {
    isProcessing: boolean
    activeChunks: number
    completedChunks: number
    errors: number
    duration: number
  } {
    return {
      isProcessing: this.isProcessing,
      activeChunks: this.activeChunks.size,
      completedChunks: this.results.filter(r => r).length,
      errors: this.errors.length,
      duration: this.startTime > 0 ? Date.now() - this.startTime : 0
    }
  }
}

/**
 * Factory function to create AudioChunkProcessor with default options
 */
export function createAudioChunkProcessor(options?: Partial<ProcessingOptions>): AudioChunkProcessor {
  return new AudioChunkProcessor(options)
}

/**
 * Utility function to validate audio data before processing
 */
export function validateAudioData(audioData: Buffer): { isValid: boolean; error?: string } {
  if (!audioData || audioData.length === 0) {
    return { isValid: false, error: 'Audio data is empty or null' }
  }

  if (audioData.length < 1024) {
    return { isValid: false, error: 'Audio data is too small (minimum 1KB required)' }
  }

  // Check for basic audio content
  const nonZeroBytes = audioData.filter(byte => byte !== 0).length
  if (nonZeroBytes / audioData.length < 0.1) {
    return { isValid: false, error: 'Audio data appears to be mostly silent' }
  }

  return { isValid: true }
}
