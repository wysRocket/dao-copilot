/**
 * Performance Configuration for Live Transcription
 * Provides configurable performance settings and modes for optimal rendering
 */

// Chrome-specific memory API interface
interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface PerformanceWithMemory extends Performance {
  memory?: MemoryInfo
}

export type PerformanceMode = 'high-fidelity' | 'balanced' | 'performance'

export interface PerformanceConfig {
  // Update timing configuration
  throttleMs: number
  debounceMs: number
  maxBatchSize: number
  batchWindowMs: number

  // Memory management
  maxMemoryThresholdMB: number
  cleanupIntervalMs: number
  maxTranscriptHistory: number

  // Rendering optimizations
  enableVirtualization: boolean
  virtualWindowSize: number
  maxVisibleChars: number

  // Feature flags
  enableRealTimeUpdates: boolean
  enableVisualIndicators: boolean
  enableMemoryMonitoring: boolean
  enablePerformanceMetrics: boolean

  // Adaptive performance
  enableAdaptiveMode: boolean
  fpsThreshold: number
  memoryPressureThreshold: number
}

export const PERFORMANCE_PRESETS: Record<PerformanceMode, PerformanceConfig> = {
  'high-fidelity': {
    throttleMs: 0, // No throttling for immediate updates
    debounceMs: 0,
    maxBatchSize: 1,
    batchWindowMs: 0, // No batching for immediate updates
    maxMemoryThresholdMB: 100,
    cleanupIntervalMs: 30000, // 30s
    maxTranscriptHistory: 1000,
    enableVirtualization: true,
    virtualWindowSize: 50,
    maxVisibleChars: 50000,
    enableRealTimeUpdates: true,
    enableVisualIndicators: true,
    enableMemoryMonitoring: true,
    enablePerformanceMetrics: true,
    enableAdaptiveMode: false,
    fpsThreshold: 30,
    memoryPressureThreshold: 75
  },

  balanced: {
    throttleMs: 16, // 60 FPS for smooth rendering
    debounceMs: 0, // No debouncing for immediate response
    maxBatchSize: 1, // Single item processing for immediate updates
    batchWindowMs: 0, // No batching window for immediate processing
    maxMemoryThresholdMB: 75,
    cleanupIntervalMs: 20000, // 20s
    maxTranscriptHistory: 500,
    enableVirtualization: true,
    virtualWindowSize: 30,
    maxVisibleChars: 30000,
    enableRealTimeUpdates: true,
    enableVisualIndicators: true,
    enableMemoryMonitoring: true,
    enablePerformanceMetrics: true,
    enableAdaptiveMode: true,
    fpsThreshold: 20,
    memoryPressureThreshold: 60
  },

  performance: {
    throttleMs: 200, // 5 FPS
    debounceMs: 300,
    maxBatchSize: 10,
    batchWindowMs: 200,
    maxMemoryThresholdMB: 50,
    cleanupIntervalMs: 10000, // 10s
    maxTranscriptHistory: 200,
    enableVirtualization: true,
    virtualWindowSize: 20,
    maxVisibleChars: 15000,
    enableRealTimeUpdates: false,
    enableVisualIndicators: false,
    enableMemoryMonitoring: true,
    enablePerformanceMetrics: false,
    enableAdaptiveMode: true,
    fpsThreshold: 15,
    memoryPressureThreshold: 40
  }
}

export interface PerformanceMonitor {
  fps: number
  memoryUsageMB: number
  updateLatency: number
  droppedFrames: number
  lastUpdateTimestamp: number
}

export interface AdaptiveSettings {
  currentMode: PerformanceMode
  autoAdjustEnabled: boolean
  degradationLevel: number // 0-1, 0 = no degradation
  lastAdjustment: number
}

/**
 * Performance Manager for Live Transcription
 * Handles automatic performance adaptation and monitoring
 */
export class TranscriptionPerformanceManager {
  private config: PerformanceConfig
  private monitor: PerformanceMonitor
  private adaptive: AdaptiveSettings
  private frameTimeHistory: number[] = []
  private memoryCleanupTimer: NodeJS.Timeout | null = null
  private adaptiveCheckTimer: NodeJS.Timeout | null = null

  constructor(initialMode: PerformanceMode = 'high-fidelity') {
    this.config = {...PERFORMANCE_PRESETS[initialMode]}
    this.monitor = {
      fps: 0,
      memoryUsageMB: 0,
      updateLatency: 0,
      droppedFrames: 0,
      lastUpdateTimestamp: 0
    }
    this.adaptive = {
      currentMode: initialMode,
      autoAdjustEnabled: this.config.enableAdaptiveMode,
      degradationLevel: 0,
      lastAdjustment: Date.now()
    }

    this.startMonitoring()
  }

  /**
   * Update performance configuration
   */
  setMode(mode: PerformanceMode): void {
    this.config = {...PERFORMANCE_PRESETS[mode]}
    this.adaptive.currentMode = mode
    this.adaptive.autoAdjustEnabled = this.config.enableAdaptiveMode
    console.log(`Performance mode changed to: ${mode}`)
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceConfig {
    return {...this.config}
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMonitor {
    return {...this.monitor}
  }

  /**
   * Record frame timing for FPS calculation
   */
  recordFrameTime(): void {
    const now = performance.now()
    if (this.monitor.lastUpdateTimestamp > 0) {
      const frameTime = now - this.monitor.lastUpdateTimestamp
      this.frameTimeHistory.push(frameTime)

      // Keep only last 60 frame times for rolling average
      if (this.frameTimeHistory.length > 60) {
        this.frameTimeHistory.shift()
      }

      // Calculate FPS
      const avgFrameTime =
        this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length
      this.monitor.fps = 1000 / avgFrameTime
      this.monitor.updateLatency = avgFrameTime
    }

    this.monitor.lastUpdateTimestamp = now
  }

  /**
   * Update memory usage statistics
   */
  updateMemoryUsage(): void {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const perfWithMemory = performance as PerformanceWithMemory
      if (perfWithMemory.memory && perfWithMemory.memory.usedJSHeapSize) {
        this.monitor.memoryUsageMB = perfWithMemory.memory.usedJSHeapSize / (1024 * 1024)
      }
    }
  }

  /**
   * Check if should batch updates based on current config
   */
  shouldBatchUpdate(queueSize: number): boolean {
    return this.config.maxBatchSize > 1 && queueSize < this.config.maxBatchSize
  }

  /**
   * Get appropriate throttle delay based on current performance
   */
  getThrottleDelay(): number {
    if (!this.adaptive.autoAdjustEnabled) {
      return this.config.throttleMs
    }

    // Adaptive throttling based on current FPS and memory pressure
    let multiplier = 1 + this.adaptive.degradationLevel

    if (this.monitor.fps < this.config.fpsThreshold) {
      multiplier *= 1.5 // Increase throttling if FPS is low
    }

    if (this.monitor.memoryUsageMB > this.config.memoryPressureThreshold) {
      multiplier *= 1.3 // Increase throttling if memory pressure is high
    }

    return Math.min(this.config.throttleMs * multiplier, 1000) // Cap at 1 second
  }

  /**
   * Get debounce delay for batching rapid updates
   */
  getDebounceDelay(): number {
    return this.config.debounceMs
  }

  /**
   * Check if should trigger memory cleanup
   */
  shouldCleanupMemory(): boolean {
    return this.monitor.memoryUsageMB > this.config.maxMemoryThresholdMB
  }

  /**
   * Check if feature is enabled based on current config
   */
  isFeatureEnabled(feature: keyof PerformanceConfig): boolean {
    return Boolean(this.config[feature])
  }

  /**
   * Start performance monitoring and adaptive adjustments
   */
  private startMonitoring(): void {
    // Memory cleanup timer
    if (this.config.enableMemoryMonitoring) {
      this.memoryCleanupTimer = setInterval(() => {
        this.updateMemoryUsage()

        if (this.shouldCleanupMemory() && typeof window !== 'undefined' && window.gc) {
          // Trigger garbage collection if available (development only)
          window.gc()
        }
      }, this.config.cleanupIntervalMs)
    }

    // Adaptive performance adjustments
    if (this.config.enableAdaptiveMode) {
      this.adaptiveCheckTimer = setInterval(() => {
        this.adjustPerformanceIfNeeded()
      }, 5000) // Check every 5 seconds
    }
  }

  /**
   * Automatically adjust performance based on current metrics
   */
  private adjustPerformanceIfNeeded(): void {
    const now = Date.now()

    // Don't adjust too frequently
    if (now - this.adaptive.lastAdjustment < 10000) {
      return
    }

    let shouldDegrade = false
    let shouldImprove = false

    // Check if we need to degrade performance
    if (this.monitor.fps < this.config.fpsThreshold * 0.8) {
      shouldDegrade = true
    }

    if (this.monitor.memoryUsageMB > this.config.memoryPressureThreshold) {
      shouldDegrade = true
    }

    // Check if we can improve performance
    if (
      this.monitor.fps > this.config.fpsThreshold * 1.2 &&
      this.monitor.memoryUsageMB < this.config.memoryPressureThreshold * 0.8
    ) {
      shouldImprove = true
    }

    if (shouldDegrade && this.adaptive.degradationLevel < 1) {
      this.adaptive.degradationLevel = Math.min(1, this.adaptive.degradationLevel + 0.2)
      this.adaptive.lastAdjustment = now
      console.log(`Performance degraded to level: ${this.adaptive.degradationLevel}`)
    } else if (shouldImprove && this.adaptive.degradationLevel > 0) {
      this.adaptive.degradationLevel = Math.max(0, this.adaptive.degradationLevel - 0.1)
      this.adaptive.lastAdjustment = now
      console.log(`Performance improved to level: ${this.adaptive.degradationLevel}`)
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer)
      this.memoryCleanupTimer = null
    }

    if (this.adaptiveCheckTimer) {
      clearInterval(this.adaptiveCheckTimer)
      this.adaptiveCheckTimer = null
    }
  }
}

/**
 * Global performance manager instance
 */
let globalPerformanceManager: TranscriptionPerformanceManager | null = null

export function getPerformanceManager(): TranscriptionPerformanceManager {
  if (!globalPerformanceManager) {
    globalPerformanceManager = new TranscriptionPerformanceManager()
  }
  return globalPerformanceManager
}

export function setPerformanceMode(mode: PerformanceMode): void {
  getPerformanceManager().setMode(mode)
}
