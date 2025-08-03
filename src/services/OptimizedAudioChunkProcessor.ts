/**
 * Memory-Optimized Audio Chunk Processor
 * 
 * Enhanced version with object pooling, typed arrays, and advanced memory management
 * to prevent stack overflow and minimize garbage collection pressure.
 */

import { AudioChunkProcessor, type AudioChunk, type ProcessingOptions, type ProcessingResult } from './AudioChunkProcessor'

/**
 * Object Pool for reusing AudioChunk objects to reduce GC pressure
 */
class AudioChunkPool {
  private pool: AudioChunk[] = []
  private readonly maxPoolSize: number

  constructor(maxPoolSize = 20) {
    this.maxPoolSize = maxPoolSize
  }

  /**
   * Get an AudioChunk from the pool or create a new one
   */
  acquire(): AudioChunk {
    if (this.pool.length > 0) {
      return this.pool.pop()!
    }

    return {
      data: Buffer.alloc(0),
      index: 0,
      isLast: false,
      timestamp: 0
    }
  }

  /**
   * Return an AudioChunk to the pool for reuse
   */
  release(chunk: AudioChunk): void {
    if (this.pool.length < this.maxPoolSize) {
      // Reset chunk data for reuse
      chunk.index = 0
      chunk.isLast = false
      chunk.timestamp = 0
      // Don't reset data Buffer - will be overwritten when reused

      this.pool.push(chunk)
    }
    // If pool is full, let object be garbage collected
  }

  /**
   * Clear the pool and release all objects
   */
  clear(): void {
    this.pool = []
  }

  /**
   * Get current pool status
   */
  getStatus(): { available: number; maxSize: number } {
    return {
      available: this.pool.length,
      maxSize: this.maxPoolSize
    }
  }
}

/**
 * Typed Array Buffer Pool for efficient audio data handling
 */
class TypedArrayPool {
  private float32Pool: Float32Array[] = []
  private uint8Pool: Uint8Array[] = []
  private readonly maxPoolSize: number

  constructor(maxPoolSize = 15) {
    this.maxPoolSize = maxPoolSize
  }

  /**
   * Get a Float32Array from pool or create new one
   */
  acquireFloat32Array(size: number): Float32Array {
    for (let i = 0; i < this.float32Pool.length; i++) {
      const array = this.float32Pool[i]
      if (array.length >= size) {
        this.float32Pool.splice(i, 1)
        return array.subarray(0, size)
      }
    }

    return new Float32Array(size)
  }

  /**
   * Get a Uint8Array from pool or create new one
   */
  acquireUint8Array(size: number): Uint8Array {
    for (let i = 0; i < this.uint8Pool.length; i++) {
      const array = this.uint8Pool[i]
      if (array.length >= size) {
        this.uint8Pool.splice(i, 1)
        return array.subarray(0, size)
      }
    }

    return new Uint8Array(size)
  }

  /**
   * Return Float32Array to pool
   */
  releaseFloat32Array(array: Float32Array): void {
    if (this.float32Pool.length < this.maxPoolSize) {
      // Clear the array before returning to pool
      array.fill(0)
      this.float32Pool.push(array)
    }
  }

  /**
   * Return Uint8Array to pool
   */
  releaseUint8Array(array: Uint8Array): void {
    if (this.uint8Pool.length < this.maxPoolSize) {
      // Clear the array before returning to pool
      array.fill(0)
      this.uint8Pool.push(array)
    }
  }

  /**
   * Clear all pools
   */
  clear(): void {
    this.float32Pool = []
    this.uint8Pool = []
  }

  /**
   * Get pool status
   */
  getStatus(): {
    float32Available: number
    uint8Available: number
    maxSize: number
  } {
    return {
      float32Available: this.float32Pool.length,
      uint8Available: this.uint8Pool.length,
      maxSize: this.maxPoolSize
    }
  }
}

/**
 * Memory monitoring utilities
 */
interface MemoryStats {
  heapUsed: number
  heapTotal: number
  external: number
  rss?: number
  timestamp: number
}

class MemoryMonitor {
  private memoryHistory: MemoryStats[] = []
  private readonly maxHistorySize = 50

  /**
   * Capture current memory usage
   */
  captureMemoryStats(): MemoryStats {
    const stats: MemoryStats = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      timestamp: Date.now()
    }

    // Try to get Node.js memory usage if available
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const nodeMemory = process.memoryUsage()
      stats.heapUsed = nodeMemory.heapUsed
      stats.heapTotal = nodeMemory.heapTotal
      stats.external = nodeMemory.external
      stats.rss = nodeMemory.rss
    } else if (typeof performance !== 'undefined' && (performance as any).memory) {
      // Browser memory API (Chrome)
      const browserMemory = (performance as any).memory
      stats.heapUsed = browserMemory.usedJSHeapSize
      stats.heapTotal = browserMemory.totalJSHeapSize
    }

    // Store in history
    this.memoryHistory.push(stats)
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift()
    }

    return stats
  }

  /**
   * Get memory usage trend
   */
  getMemoryTrend(): {
    current: MemoryStats
    peak: MemoryStats
    average: number
    trend: 'increasing' | 'decreasing' | 'stable'
  } {
    if (this.memoryHistory.length === 0) {
      const current = this.captureMemoryStats()
      return {
        current,
        peak: current,
        average: current.heapUsed,
        trend: 'stable'
      }
    }

    const current = this.memoryHistory[this.memoryHistory.length - 1]
    const peak = this.memoryHistory.reduce(
      (max, stats) => (stats.heapUsed > max.heapUsed ? stats : max),
      this.memoryHistory[0]
    )

    const average = this.memoryHistory.reduce((sum, stats) => sum + stats.heapUsed, 0) / this.memoryHistory.length

    // Calculate trend from last 5 readings
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
    if (this.memoryHistory.length >= 5) {
      const recent = this.memoryHistory.slice(-5)
      const first = recent[0].heapUsed
      const last = recent[recent.length - 1].heapUsed
      const change = (last - first) / first

      if (change > 0.1) trend = 'increasing'
      else if (change < -0.1) trend = 'decreasing'
    }

    return { current, peak, average, trend }
  }

  /**
   * Clear memory history
   */
  clear(): void {
    this.memoryHistory = []
  }
}

/**
 * Enhanced Memory-Optimized Audio Chunk Processor
 */
export class OptimizedAudioChunkProcessor extends AudioChunkProcessor {
  private chunkPool: AudioChunkPool
  private typedArrayPool: TypedArrayPool
  private memoryMonitor: MemoryMonitor
  private enableMemoryOptimizations: boolean

  constructor(options: Partial<ProcessingOptions & { enableMemoryOptimizations?: boolean }> = {}) {
    // Use more conservative settings for memory optimization
    const optimizedOptions = {
      chunkSize: 16 * 1024, // Smaller chunks (16KB) to reduce memory peaks
      maxConcurrentChunks: 2, // Lower concurrency for memory conservation
      ...options
    }

    super(optimizedOptions)

    this.enableMemoryOptimizations = options.enableMemoryOptimizations ?? true
    this.chunkPool = new AudioChunkPool(15)
    this.typedArrayPool = new TypedArrayPool(10)
    this.memoryMonitor = new MemoryMonitor()

    // Start memory monitoring
    this.startMemoryMonitoring()
  }

  /**
   * Process audio with memory optimizations
   */
  async processAudio(
    audioData: Buffer,
    processChunk: (chunk: AudioChunk) => Promise<{ text: string; confidence: number }>
  ): Promise<ProcessingResult & { memoryStats?: MemoryStats }> {
    const startMemory = this.memoryMonitor.captureMemoryStats()

    try {
      // Convert Buffer to typed array for better performance
      const optimizedAudioData = this.enableMemoryOptimizations
        ? this.convertToOptimizedFormat(audioData)
        : audioData

      const result = await super.processAudio(optimizedAudioData, processChunk)

      const endMemory = this.memoryMonitor.captureMemoryStats()

      return {
        ...result,
        memoryStats: {
          ...endMemory,
          memoryDelta: endMemory.heapUsed - startMemory.heapUsed
        }
      }
    } finally {
      // Cleanup pools after processing
      this.cleanup()
    }
  }

  /**
   * Convert Buffer to optimized typed array format
   */
  private convertToOptimizedFormat(audioData: Buffer): Buffer {
    if (!this.enableMemoryOptimizations) {
      return audioData
    }

    // For audio processing, we can use Uint8Array for raw PCM data
    const typedArray = this.typedArrayPool.acquireUint8Array(audioData.length)
    
    // Copy data to typed array
    for (let i = 0; i < audioData.length; i++) {
      typedArray[i] = audioData[i]
    }

    // Convert back to Buffer but with optimized memory layout
    const optimizedBuffer = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)

    // Return typed array to pool
    this.typedArrayPool.releaseUint8Array(typedArray)

    return optimizedBuffer
  }

  /**
   * Create optimized chunks using object pooling
   */
  protected createChunksOptimized(audioData: Buffer): AudioChunk[] {
    const chunks: AudioChunk[] = []
    const chunkSize = this.getChunkSize()
    const totalChunks = Math.ceil(audioData.length / chunkSize)

    for (let i = 0; i < totalChunks; i++) {
      const startPos = i * chunkSize
      const endPos = Math.min(startPos + chunkSize, audioData.length)
      
      // Use pooled chunk object
      const chunk = this.chunkPool.acquire()
      chunk.data = audioData.subarray(startPos, endPos)
      chunk.index = i
      chunk.isLast = i === totalChunks - 1
      chunk.timestamp = Date.now()

      chunks.push(chunk)
    }

    return chunks
  }

  /**
   * Cleanup with pool management
   */
  protected cleanup(): void {
    super.cleanup()

    // Return objects to pools
    this.chunkPool.clear()
    this.typedArrayPool.clear()

    // Force garbage collection if available (Node.js)
    if (typeof global !== 'undefined' && global.gc) {
      global.gc()
    }
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    // Capture initial memory state
    this.memoryMonitor.captureMemoryStats()
  }

  /**
   * Get memory optimization status
   */
  getMemoryStatus(): {
    monitoring: ReturnType<MemoryMonitor['getMemoryTrend']>
    pools: {
      chunks: ReturnType<AudioChunkPool['getStatus']>
      typedArrays: ReturnType<TypedArrayPool['getStatus']>
    }
    optimizations: {
      enabled: boolean
      poolsActive: boolean
    }
  } {
    return {
      monitoring: this.memoryMonitor.getMemoryTrend(),
      pools: {
        chunks: this.chunkPool.getStatus(),
        typedArrays: this.typedArrayPool.getStatus()
      },
      optimizations: {
        enabled: this.enableMemoryOptimizations,
        poolsActive: true
      }
    }
  }

  /**
   * Get chunk size (protected method accessor)
   */
  private getChunkSize(): number {
    // Access the protected options from parent class
    return (this as any).options.chunkSize
  }
}

/**
 * Factory function for optimized processor
 */
export function createOptimizedAudioChunkProcessor(
  options?: Partial<ProcessingOptions & { enableMemoryOptimizations?: boolean }>
): OptimizedAudioChunkProcessor {
  return new OptimizedAudioChunkProcessor(options)
}

/**
 * Memory profiling utilities
 */
export class MemoryProfiler {
  private profiles: Map<string, MemoryStats[]> = new Map()

  /**
   * Start profiling a named operation
   */
  startProfile(name: string): void {
    if (!this.profiles.has(name)) {
      this.profiles.set(name, [])
    }

    const monitor = new MemoryMonitor()
    const stats = monitor.captureMemoryStats()
    this.profiles.get(name)!.push(stats)
  }

  /**
   * End profiling and return memory delta
   */
  endProfile(name: string): { delta: number; duration: number } | null {
    const profile = this.profiles.get(name)
    if (!profile || profile.length === 0) {
      return null
    }

    const monitor = new MemoryMonitor()
    const endStats = monitor.captureMemoryStats()
    const startStats = profile[profile.length - 1]

    return {
      delta: endStats.heapUsed - startStats.heapUsed,
      duration: endStats.timestamp - startStats.timestamp
    }
  }

  /**
   * Get all profiles
   */
  getAllProfiles(): Map<string, MemoryStats[]> {
    return new Map(this.profiles)
  }

  /**
   * Clear all profiles
   */
  clear(): void {
    this.profiles.clear()
  }
}

/**
 * Export types for external use
 */
export type { MemoryStats }
export { AudioChunkPool, TypedArrayPool, MemoryMonitor }
