/**
 * Advanced debouncing and batching utilities for high-performance transcription
 */

export interface BatchItem<T> {
  data: T
  timestamp: number
  priority: number
}

export interface DebounceOptions {
  maxWait?: number
  leading?: boolean
  trailing?: boolean
}

/**
 * Enhanced debounce function with batching support
 */
export class PerformanceDebouncer<T> {
  private timeoutId: NodeJS.Timeout | null = null
  private lastCallTime = 0
  private lastInvokeTime = 0
  private batch: BatchItem<T>[] = []
  private maxBatchSize: number
  private batchWindowMs: number

  constructor(
    private func: (batch: T[]) => void,
    private delay: number,
    private options: DebounceOptions = {},
    maxBatchSize = 10,
    batchWindowMs = 100
  ) {
    this.maxBatchSize = maxBatchSize
    this.batchWindowMs = batchWindowMs
  }

  /**
   * Add item to debounced batch
   */
  add(data: T, priority = 0): void {
    const now = Date.now()
    this.lastCallTime = now

    // Add to batch
    this.batch.push({
      data,
      timestamp: now,
      priority
    })

    // Sort by priority (higher first)
    this.batch.sort((a, b) => b.priority - a.priority)

    // Trim batch if too large
    if (this.batch.length > this.maxBatchSize) {
      this.batch = this.batch.slice(0, this.maxBatchSize)
    }

    // Should invoke immediately if leading edge
    if (this.options.leading && this.shouldInvokeLeading(now)) {
      this.invokeFunction()
      return
    }

    // Force invoke if batch is full or window expired
    if (this.shouldForceInvoke(now)) {
      this.invokeFunction()
      return
    }

    // Schedule normal debounced invoke
    this.scheduleInvoke()
  }

  /**
   * Force immediate execution
   */
  flush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    if (this.batch.length > 0) {
      this.invokeFunction()
    }
  }

  /**
   * Cancel pending execution
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    this.batch = []
  }

  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.batch.length
  }

  private shouldInvokeLeading(now: number): boolean {
    return this.lastInvokeTime === 0 || now - this.lastInvokeTime >= this.delay
  }

  private shouldForceInvoke(now: number): boolean {
    return (
      this.batch.length >= this.maxBatchSize ||
      (this.batch.length > 0 && now - this.batch[0].timestamp >= this.batchWindowMs)
    )
  }

  private scheduleInvoke(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }

    const now = Date.now()
    const timeSinceLastCall = now - this.lastCallTime
    const timeSinceLastInvoke = now - this.lastInvokeTime
    const timeToWait = this.delay - timeSinceLastCall

    if (timeToWait <= 0) {
      this.invokeFunction()
    } else if (this.options.maxWait) {
      const timeUntilMaxWait = this.options.maxWait - timeSinceLastInvoke
      const finalWait = Math.min(timeToWait, timeUntilMaxWait)
      this.timeoutId = setTimeout(() => this.invokeFunction(), finalWait)
    } else {
      this.timeoutId = setTimeout(() => this.invokeFunction(), timeToWait)
    }
  }

  private invokeFunction(): void {
    this.lastInvokeTime = Date.now()

    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }

    if (this.batch.length === 0) {
      return
    }

    const batchToProcess = this.batch.map(item => item.data)
    this.batch = []

    this.func(batchToProcess)
  }
}

/**
 * Throttle function with adaptive timing
 */
export class AdaptiveThrottle<T> {
  private lastExecuted = 0
  private adaptiveDelay: number

  constructor(
    private func: (data: T) => void,
    private baseDelay: number,
    private getAdaptiveMultiplier: () => number = () => 1
  ) {
    this.adaptiveDelay = baseDelay
  }

  execute(data: T): boolean {
    const now = Date.now()
    const multiplier = this.getAdaptiveMultiplier()
    this.adaptiveDelay = this.baseDelay * multiplier

    if (now - this.lastExecuted >= this.adaptiveDelay) {
      this.lastExecuted = now
      this.func(data)
      return true
    }
    return false
  }

  canExecute(): boolean {
    const now = Date.now()
    return now - this.lastExecuted >= this.adaptiveDelay
  }

  getNextExecutionTime(): number {
    return this.lastExecuted + this.adaptiveDelay
  }
}

/**
 * Memory-efficient queue with automatic cleanup
 */
export class MemoryEfficientQueue<T> {
  private items: T[] = []
  private maxSize: number
  private cleanupThreshold: number

  constructor(maxSize = 1000, cleanupThreshold = 0.8) {
    this.maxSize = maxSize
    this.cleanupThreshold = cleanupThreshold
  }

  enqueue(item: T): void {
    this.items.push(item)

    if (this.items.length > this.maxSize * this.cleanupThreshold) {
      this.cleanup()
    }
  }

  dequeue(): T | undefined {
    return this.items.shift()
  }

  peek(): T | undefined {
    return this.items[0]
  }

  size(): number {
    return this.items.length
  }

  clear(): void {
    this.items = []
  }

  isEmpty(): boolean {
    return this.items.length === 0
  }

  getItems(): T[] {
    return [...this.items]
  }

  private cleanup(): void {
    // Remove oldest 20% of items
    const removeCount = Math.floor(this.items.length * 0.2)
    this.items.splice(0, removeCount)
  }
}

/**
 * Frame rate limiter for smooth animations
 */
export class FrameRateLimiter {
  private lastFrameTime = 0
  private targetFrameTime: number

  constructor(targetFPS = 60) {
    this.targetFrameTime = 1000 / targetFPS
  }

  shouldRender(): boolean {
    const now = Date.now()
    if (now - this.lastFrameTime >= this.targetFrameTime) {
      this.lastFrameTime = now
      return true
    }
    return false
  }

  setTargetFPS(fps: number): void {
    this.targetFrameTime = 1000 / fps
  }

  getTimeUntilNextFrame(): number {
    const now = Date.now()
    const elapsed = now - this.lastFrameTime
    return Math.max(0, this.targetFrameTime - elapsed)
  }
}
