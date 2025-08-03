/**
 * Audio Processing Utilities
 * Additional optimizations for audio handling and processing
 */

export interface AudioOptimizationOptions {
  enableSilenceDetection: boolean
  enableAdaptiveChunking: boolean
  enableMemoryOptimization: boolean
  maxBufferSize: number
  chunkSize: number
}

/**
 * Adaptive audio chunking based on content analysis
 */
export class AdaptiveAudioChunker {
  private readonly defaultChunkSize: number
  private readonly maxChunkSize: number
  private readonly minChunkSize: number

  constructor(
    options: {
      defaultChunkSize?: number
      maxChunkSize?: number
      minChunkSize?: number
    } = {}
  ) {
    this.defaultChunkSize = options.defaultChunkSize || 32 * 1024 // 32KB
    this.maxChunkSize = options.maxChunkSize || 64 * 1024 // 64KB
    this.minChunkSize = options.minChunkSize || 8 * 1024 // 8KB
  }

  /**
   * Calculate optimal chunk size based on audio characteristics
   */
  public calculateOptimalChunkSize(
    audioBuffer: Buffer,
    audioMetrics: {
      maxAmplitude: number
      avgAmplitude: number
      isSilent: boolean
    }
  ): number {
    // For silent audio, use smaller chunks to reduce overhead
    if (audioMetrics.isSilent) {
      return this.minChunkSize
    }

    // For high-amplitude audio (loud speech), use larger chunks for efficiency
    if (audioMetrics.maxAmplitude > 20000) {
      return this.maxChunkSize
    }

    // For moderate audio, scale chunk size based on average amplitude
    const amplitudeRatio = audioMetrics.avgAmplitude / 10000 // Normalize to 0-2+ range
    const scaleFactor = Math.min(Math.max(amplitudeRatio, 0.5), 2.0) // Clamp to 0.5-2.0

    const adaptiveSize = Math.round(this.defaultChunkSize * scaleFactor)
    return Math.min(Math.max(adaptiveSize, this.minChunkSize), this.maxChunkSize)
  }

  /**
   * Create optimized chunks from audio buffer
   */
  public createOptimizedChunks(audioBuffer: Buffer, optimalChunkSize: number): Buffer[] {
    const chunks: Buffer[] = []
    const totalLength = audioBuffer.length

    for (let offset = 0; offset < totalLength; offset += optimalChunkSize) {
      const remainingBytes = totalLength - offset
      const chunkSize = Math.min(optimalChunkSize, remainingBytes)

      // Create chunk without copying entire buffer - more memory efficient
      const chunk = audioBuffer.subarray(offset, offset + chunkSize)
      chunks.push(chunk)
    }

    return chunks
  }
}

/**
 * Audio buffer pool for memory optimization
 */
export class AudioBufferPool {
  private static instance: AudioBufferPool | null = null
  private availableBuffers: Map<number, Buffer[]> = new Map()
  private readonly maxPoolSize = 10
  private readonly supportedSizes = [8192, 16384, 32768, 65536] // Common chunk sizes

  private constructor() {}

  public static getInstance(): AudioBufferPool {
    if (!AudioBufferPool.instance) {
      AudioBufferPool.instance = new AudioBufferPool()
    }
    return AudioBufferPool.instance
  }

  /**
   * Get a buffer from the pool or create new one
   */
  public getBuffer(size: number): Buffer {
    // Round up to nearest supported size
    const poolSize = this.supportedSizes.find(s => s >= size) || size
    const pool = this.availableBuffers.get(poolSize) || []

    if (pool.length > 0) {
      const buffer = pool.pop()!
      console.log(`📦 Reusing buffer from pool: ${poolSize} bytes`)
      return buffer.subarray(0, size) // Return only the needed portion
    }

    console.log(`🔧 Creating new buffer: ${size} bytes`)
    return Buffer.allocUnsafe(size)
  }

  /**
   * Return a buffer to the pool for reuse
   */
  public returnBuffer(buffer: Buffer): void {
    const size = buffer.length
    const poolSize = this.supportedSizes.find(s => s >= size)

    if (!poolSize) return // Don't pool unusual sizes

    let pool = this.availableBuffers.get(poolSize)
    if (!pool) {
      pool = []
      this.availableBuffers.set(poolSize, pool)
    }

    if (pool.length < this.maxPoolSize) {
      pool.push(buffer)
      console.log(`♻️ Returned buffer to pool: ${poolSize} bytes (pool size: ${pool.length})`)
    }
  }

  /**
   * Clear all pooled buffers
   */
  public clearPool(): void {
    const totalBuffers = Array.from(this.availableBuffers.values()).reduce(
      (sum, pool) => sum + pool.length,
      0
    )

    this.availableBuffers.clear()
    console.log(`🧹 Cleared audio buffer pool: ${totalBuffers} buffers freed`)
  }

  /**
   * Get pool statistics
   */
  public getPoolStats(): {
    totalBuffers: number
    poolSizes: Record<number, number>
    memoryUsage: number
  } {
    let totalBuffers = 0
    let memoryUsage = 0
    const poolSizes: Record<number, number> = {}

    for (const [size, pool] of this.availableBuffers) {
      poolSizes[size] = pool.length
      totalBuffers += pool.length
      memoryUsage += size * pool.length
    }

    return {totalBuffers, poolSizes, memoryUsage}
  }
}

/**
 * Audio processing performance tracker
 */
export class AudioProcessingTracker {
  private processingTimes: number[] = []
  private readonly maxHistory = 50

  /**
   * Track audio processing time
   */
  public trackProcessing<T>(name: string, fn: () => T): T {
    const startTime = Date.now()

    try {
      const result = fn()
      const duration = Date.now() - startTime

      this.processingTimes.push(duration)
      if (this.processingTimes.length > this.maxHistory) {
        this.processingTimes.shift()
      }

      console.log(`⏱️ Audio processing [${name}]: ${duration}ms`)

      if (duration > 1000) {
        console.warn(`⚠️ Slow audio processing [${name}]: ${duration}ms`)
      }

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`❌ Audio processing error [${name}]: ${duration}ms`, error)
      throw error
    }
  }

  /**
   * Get processing statistics
   */
  public getStats(): {
    averageTime: number
    minTime: number
    maxTime: number
    totalOperations: number
  } {
    if (this.processingTimes.length === 0) {
      return {averageTime: 0, minTime: 0, maxTime: 0, totalOperations: 0}
    }

    const avg = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
    const min = Math.min(...this.processingTimes)
    const max = Math.max(...this.processingTimes)

    return {
      averageTime: Math.round(avg),
      minTime: min,
      maxTime: max,
      totalOperations: this.processingTimes.length
    }
  }

  /**
   * Clear processing history
   */
  public clear(): void {
    this.processingTimes = []
    console.log('🧹 Cleared audio processing history')
  }
}

// Export singleton instances
export const adaptiveChunker = new AdaptiveAudioChunker()
export const audioBufferPool = AudioBufferPool.getInstance()
export const audioTracker = new AudioProcessingTracker()

export default {
  AdaptiveAudioChunker,
  AudioBufferPool,
  AudioProcessingTracker,
  adaptiveChunker,
  audioBufferPool,
  audioTracker
}
