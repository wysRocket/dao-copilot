/**
 * Audio Chunker
 *
 * Efficient audio chunking utility for streaming large audio files
 * with optimized memory usage and backpressure handling.
 */

export interface AudioChunkerConfig {
  chunkSize: number
  sampleRate: number
  channels: number
  format: 'float32' | 'int16' | 'uint8'
  enableStreaming: boolean
  maxBufferSize?: number
}

export interface AudioChunkResult {
  chunk: ArrayBuffer
  index: number
  timestamp: number
  isLast: boolean
  originalSize: number
  compressedSize: number
}

/**
 * Audio Chunker for efficient processing of large audio files
 */
export class AudioChunker {
  private config: AudioChunkerConfig
  private buffer: ArrayBuffer | null = null
  private position = 0
  private chunkIndex = 0

  constructor(config: AudioChunkerConfig) {
    this.config = {
      maxBufferSize: 32 * 1024 * 1024, // 32MB default
      ...config
    }
  }

  /**
   * Load audio buffer for chunking
   */
  loadBuffer(audioBuffer: ArrayBuffer): void {
    if (this.config.maxBufferSize && audioBuffer.byteLength > this.config.maxBufferSize) {
      throw new Error(
        `Audio buffer too large: ${audioBuffer.byteLength} bytes (max: ${this.config.maxBufferSize})`
      )
    }

    this.buffer = audioBuffer
    this.position = 0
    this.chunkIndex = 0
  }

  /**
   * Get next audio chunk
   */
  getNextChunk(): AudioChunkResult | null {
    if (!this.buffer || this.position >= this.buffer.byteLength) {
      return null
    }

    const remainingBytes = this.buffer.byteLength - this.position
    const chunkSizeBytes = this.config.chunkSize * this.getBytesPerSample()
    const actualChunkSize = Math.min(chunkSizeBytes, remainingBytes)

    // Extract chunk
    const chunk = this.buffer.slice(this.position, this.position + actualChunkSize)
    const isLast = this.position + actualChunkSize >= this.buffer.byteLength

    const result: AudioChunkResult = {
      chunk,
      index: this.chunkIndex++,
      timestamp: (this.position / this.getBytesPerSample() / this.config.sampleRate) * 1000,
      isLast,
      originalSize: actualChunkSize,
      compressedSize: actualChunkSize // No compression by default
    }

    this.position += actualChunkSize
    return result
  }

  /**
   * Get all chunks as an async iterator
   */
  async *chunks(): AsyncIterableIterator<AudioChunkResult> {
    let chunk = this.getNextChunk()
    while (chunk) {
      yield chunk

      // Allow other tasks to run
      if (this.config.enableStreaming) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      chunk = this.getNextChunk()
    }
  }

  /**
   * Get streaming chunks with backpressure control
   */
  async *streamingChunks(options?: {
    maxConcurrentChunks?: number
    delayMs?: number
  }): AsyncIterableIterator<AudioChunkResult> {
    const maxConcurrent = options?.maxConcurrentChunks || 5
    const delay = options?.delayMs || 10

    let activeChunks = 0
    let chunk = this.getNextChunk()

    while (chunk) {
      // Wait if too many chunks are being processed
      while (activeChunks >= maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, delay))
        activeChunks-- // Assume chunks are processed
      }

      activeChunks++
      yield chunk

      chunk = this.getNextChunk()
    }
  }

  /**
   * Reset chunker to beginning
   */
  reset(): void {
    this.position = 0
    this.chunkIndex = 0
  }

  /**
   * Get progress information
   */
  getProgress(): {
    currentPosition: number
    totalSize: number
    percentComplete: number
    chunksProcessed: number
  } {
    const totalSize = this.buffer?.byteLength || 0
    return {
      currentPosition: this.position,
      totalSize,
      percentComplete: totalSize > 0 ? (this.position / totalSize) * 100 : 0,
      chunksProcessed: this.chunkIndex
    }
  }

  /**
   * Get bytes per sample based on format
   */
  private getBytesPerSample(): number {
    switch (this.config.format) {
      case 'float32':
        return 4 * this.config.channels
      case 'int16':
        return 2 * this.config.channels
      case 'uint8':
        return 1 * this.config.channels
      default:
        return 4 * this.config.channels
    }
  }

  /**
   * Estimate memory usage
   */
  estimateMemoryUsage(): {
    bufferSize: number
    chunkSize: number
    estimatedPeakUsage: number
  } {
    const bufferSize = this.buffer?.byteLength || 0
    const chunkSize = this.config.chunkSize * this.getBytesPerSample()
    const estimatedPeakUsage = bufferSize + chunkSize * 2 // Buffer + 2 chunks for processing

    return {
      bufferSize,
      chunkSize,
      estimatedPeakUsage
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.buffer = null
    this.position = 0
    this.chunkIndex = 0
  }
}

/**
 * Optimized audio chunker for real-time streaming
 */
export class RealTimeAudioChunker extends AudioChunker {
  private streamBuffer: ArrayBuffer[] = []
  private isStreaming = false
  private streamController?: ReadableStreamDefaultController<AudioChunkResult>

  /**
   * Start real-time streaming
   */
  startRealTimeStreaming(): ReadableStream<AudioChunkResult> {
    this.isStreaming = true

    return new ReadableStream<AudioChunkResult>({
      start: controller => {
        this.streamController = controller
      },
      cancel: () => {
        this.stopRealTimeStreaming()
      }
    })
  }

  /**
   * Add audio data to streaming buffer
   */
  addStreamData(audioData: ArrayBuffer): void {
    if (!this.isStreaming) {
      return
    }

    this.streamBuffer.push(audioData)
    this.processStreamBuffer()
  }

  /**
   * Process streaming buffer
   */
  private processStreamBuffer(): void {
    while (this.streamBuffer.length > 0 && this.streamController) {
      const data = this.streamBuffer.shift()!
      this.loadBuffer(data)

      const chunk = this.getNextChunk()
      if (chunk) {
        this.streamController.enqueue(chunk)
      }
    }
  }

  /**
   * Stop real-time streaming
   */
  stopRealTimeStreaming(): void {
    this.isStreaming = false
    this.streamBuffer.length = 0

    if (this.streamController) {
      this.streamController.close()
      this.streamController = undefined
    }
  }
}

/**
 * Factory function for creating audio chunkers
 */
export function createAudioChunker(config: Partial<AudioChunkerConfig>): AudioChunker {
  const defaultConfig: AudioChunkerConfig = {
    chunkSize: 4096,
    sampleRate: 16000,
    channels: 1,
    format: 'float32',
    enableStreaming: false,
    maxBufferSize: 32 * 1024 * 1024
  }

  return new AudioChunker({...defaultConfig, ...config})
}

/**
 * Factory function for creating real-time audio chunkers
 */
export function createRealTimeAudioChunker(
  config: Partial<AudioChunkerConfig>
): RealTimeAudioChunker {
  const defaultConfig: AudioChunkerConfig = {
    chunkSize: 1024,
    sampleRate: 16000,
    channels: 1,
    format: 'float32',
    enableStreaming: true,
    maxBufferSize: 4 * 1024 * 1024 // Smaller buffer for real-time
  }

  return new RealTimeAudioChunker({...defaultConfig, ...config})
}
