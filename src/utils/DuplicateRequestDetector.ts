/**
 * Duplicate Request Detection System for WebSocket Transcription
 *
 * This system prevents cascade failures from duplicate or rapidly repeated transcription
 * requests by implementing intelligent deduplication, throttling, and cooling periods.
 * Integrates with EmergencyCircuitBreaker for comprehensive protection.
 */

import crypto from 'crypto'

interface AudioMetadata {
  format?: string
  sampleRate?: number
  channels?: number
  timestamp?: number
  sourceType?: string
  clientId?: string
}

interface RequestMetadata {
  id: string
  contentHash: string
  timestamp: number
  requestCount: number
  lastSeen: number
  sourceType: string
  sourceId?: string
  audioFormat?: string
  audioLength?: number
  clientId?: string
}

interface RequestPattern {
  hash: string
  frequency: number
  intervals: number[]
  firstSeen: number
  lastSeen: number
  averageInterval: number
  isThrottled: boolean
  cooldownUntil?: number
}

interface ThrottleConfig {
  maxRequestsPerWindow: number
  windowSizeMs: number
  cooldownPeriodMs: number
  duplicateWindowMs: number
  patternDetectionWindow: number
  maxPatternHistory: number
}

interface DuplicateRequestConfig {
  enableDuplicateDetection: boolean
  enableThrottling: boolean
  enablePatternAnalysis: boolean
  cleanupIntervalMs: number
  maxRegistrySize: number
  memoryCleanupThreshold: number
}

/**
 * Advanced Request Registry with Pattern Recognition and Memory Management
 */
export class RequestRegistry {
  private requests = new Map<string, RequestMetadata>()
  private patterns = new Map<string, RequestPattern>()
  private throttleConfig: ThrottleConfig
  private config: DuplicateRequestConfig
  private cleanupTimer?: NodeJS.Timeout
  private readonly HASH_ALGORITHM = 'sha256'

  constructor(
    throttleConfig: Partial<ThrottleConfig> = {},
    config: Partial<DuplicateRequestConfig> = {}
  ) {
    this.throttleConfig = {
      maxRequestsPerWindow: 10,
      windowSizeMs: 5000,
      cooldownPeriodMs: 30000,
      duplicateWindowMs: 2000,
      patternDetectionWindow: 60000,
      maxPatternHistory: 100,
      ...throttleConfig
    }

    this.config = {
      enableDuplicateDetection: true,
      enableThrottling: true,
      enablePatternAnalysis: true,
      cleanupIntervalMs: 300000, // 5 minutes
      maxRegistrySize: 10000,
      memoryCleanupThreshold: 8000,
      ...config
    }

    this.startCleanupTimer()
  }

  /**
   * Generate unique content hash for request deduplication
   */
  private generateContentHash(
    audioData: ArrayBuffer | Buffer,
    metadata: AudioMetadata = {}
  ): string {
    const hash = crypto.createHash(this.HASH_ALGORITHM)

    // Hash audio data
    if (audioData instanceof ArrayBuffer) {
      hash.update(Buffer.from(audioData))
    } else {
      hash.update(audioData)
    }

    // Include relevant metadata in hash
    const metadataString = JSON.stringify({
      format: metadata.format || 'unknown',
      sampleRate: metadata.sampleRate,
      channels: metadata.channels,
      timestamp: Math.floor((metadata.timestamp || Date.now()) / 1000) // Round to seconds
    })

    hash.update(metadataString)
    return hash.digest('hex')
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if request is a duplicate within the detection window
   */
  isDuplicate(contentHash: string, sourceId?: string): boolean {
    if (!this.config.enableDuplicateDetection) return false

    const now = Date.now()
    const windowStart = now - this.throttleConfig.duplicateWindowMs

    // Check for exact duplicate within window
    for (const [, request] of this.requests) {
      if (
        request.contentHash === contentHash &&
        request.lastSeen >= windowStart &&
        (sourceId ? request.sourceId === sourceId : true)
      ) {
        console.warn(
          `🔄 DUPLICATE: Request with hash ${contentHash.slice(0, 8)}... detected within ${this.throttleConfig.duplicateWindowMs}ms window`
        )
        return true
      }
    }

    return false
  }

  /**
   * Check if request should be throttled
   */
  isThrottled(contentHash: string, sourceId?: string): boolean {
    if (!this.config.enableThrottling) return false

    const now = Date.now()
    const pattern = this.patterns.get(contentHash)

    // Check if pattern is in cooldown
    if (pattern?.cooldownUntil && now < pattern.cooldownUntil) {
      console.warn(
        `🚫 THROTTLED: Request pattern ${contentHash.slice(0, 8)}... in cooldown until ${new Date(pattern.cooldownUntil).toISOString()}`
      )
      return true
    }

    // Check request frequency
    const windowStart = now - this.throttleConfig.windowSizeMs
    const recentRequests = Array.from(this.requests.values()).filter(
      req =>
        req.contentHash === contentHash &&
        req.lastSeen >= windowStart &&
        (sourceId ? req.sourceId === sourceId : true)
    )

    if (recentRequests.length >= this.throttleConfig.maxRequestsPerWindow) {
      console.warn(
        `⚠️ THROTTLING: Too many requests (${recentRequests.length}/${this.throttleConfig.maxRequestsPerWindow}) for pattern ${contentHash.slice(0, 8)}... in ${this.throttleConfig.windowSizeMs}ms window`
      )
      this.activateThrottle(contentHash)
      return true
    }

    return false
  }

  /**
   * Register a new request and perform duplicate/throttle checks
   */
  registerRequest(
    audioData: ArrayBuffer | Buffer,
    metadata: AudioMetadata = {},
    sourceId?: string
  ): {
    isAllowed: boolean
    isDuplicate: boolean
    isThrottled: boolean
    requestId?: string
    reason?: string
  } {
    try {
      const contentHash = this.generateContentHash(audioData, metadata)
      const now = Date.now()

      // Check for duplicates
      const isDuplicate = this.isDuplicate(contentHash, sourceId)
      if (isDuplicate) {
        return {
          isAllowed: false,
          isDuplicate: true,
          isThrottled: false,
          reason: 'Duplicate request detected'
        }
      }

      // Check for throttling
      const isThrottled = this.isThrottled(contentHash, sourceId)
      if (isThrottled) {
        return {
          isAllowed: false,
          isDuplicate: false,
          isThrottled: true,
          reason: 'Request throttled due to high frequency'
        }
      }

      // Register the request
      const requestId = this.generateRequestId()
      const request: RequestMetadata = {
        id: requestId,
        contentHash,
        timestamp: now,
        requestCount: 1,
        lastSeen: now,
        sourceType: metadata.sourceType || 'unknown',
        sourceId,
        audioFormat: metadata.format,
        audioLength: audioData.byteLength,
        clientId: metadata.clientId
      }

      // Update existing request or create new one
      const existingKey = Array.from(this.requests.keys()).find(
        key => this.requests.get(key)?.contentHash === contentHash
      )

      if (existingKey) {
        const existing = this.requests.get(existingKey)!
        existing.requestCount++
        existing.lastSeen = now
      } else {
        this.requests.set(requestId, request)
      }

      // Update pattern tracking
      if (this.config.enablePatternAnalysis) {
        this.updatePatternTracking(contentHash, now)
      }

      // Trigger cleanup if registry is getting large
      if (this.requests.size > this.config.memoryCleanupThreshold) {
        this.performMemoryCleanup()
      }

      console.info(
        `✅ REQUEST: Registered ${requestId} (hash: ${contentHash.slice(0, 8)}..., size: ${audioData.byteLength} bytes)`
      )

      return {
        isAllowed: true,
        isDuplicate: false,
        isThrottled: false,
        requestId
      }
    } catch (error) {
      console.error('🚨 ERROR: Failed to register request:', error)
      return {
        isAllowed: false,
        isDuplicate: false,
        isThrottled: false,
        reason: `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Update pattern tracking for frequency analysis
   */
  private updatePatternTracking(contentHash: string, timestamp: number): void {
    let pattern = this.patterns.get(contentHash)

    if (!pattern) {
      pattern = {
        hash: contentHash,
        frequency: 1,
        intervals: [],
        firstSeen: timestamp,
        lastSeen: timestamp,
        averageInterval: 0,
        isThrottled: false
      }
      this.patterns.set(contentHash, pattern)
    } else {
      const interval = timestamp - pattern.lastSeen
      pattern.intervals.push(interval)
      pattern.frequency++
      pattern.lastSeen = timestamp

      // Keep only recent intervals
      if (pattern.intervals.length > this.throttleConfig.maxPatternHistory) {
        pattern.intervals = pattern.intervals.slice(-this.throttleConfig.maxPatternHistory)
      }

      // Calculate average interval
      if (pattern.intervals.length > 0) {
        pattern.averageInterval =
          pattern.intervals.reduce((a, b) => a + b, 0) / pattern.intervals.length
      }
    }
  }

  /**
   * Activate throttling for a pattern
   */
  private activateThrottle(contentHash: string): void {
    const pattern = this.patterns.get(contentHash)
    if (pattern) {
      pattern.isThrottled = true
      pattern.cooldownUntil = Date.now() + this.throttleConfig.cooldownPeriodMs
      console.warn(
        `🚫 PATTERN THROTTLED: ${contentHash.slice(0, 8)}... until ${new Date(pattern.cooldownUntil).toISOString()}`
      )
    }
  }

  /**
   * Clean up old requests and patterns
   */
  private performMemoryCleanup(): void {
    const now = Date.now()
    const cleanupAge = this.throttleConfig.windowSizeMs * 3 // Clean items older than 3x window size

    let requestsRemoved = 0
    let patternsRemoved = 0

    // Clean old requests
    for (const [id, request] of this.requests) {
      if (now - request.lastSeen > cleanupAge) {
        this.requests.delete(id)
        requestsRemoved++
      }
    }

    // Clean old patterns
    for (const [hash, pattern] of this.patterns) {
      if (now - pattern.lastSeen > cleanupAge && !pattern.isThrottled) {
        this.patterns.delete(hash)
        patternsRemoved++
      }
    }

    console.info(
      `🧹 CLEANUP: Removed ${requestsRemoved} old requests and ${patternsRemoved} old patterns`
    )
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performMemoryCleanup()
    }, this.config.cleanupIntervalMs)
  }

  /**
   * Stop cleanup timer and clean up resources
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    this.requests.clear()
    this.patterns.clear()
  }

  /**
   * Get registry statistics for monitoring
   */
  getStatistics(): {
    totalRequests: number
    uniquePatterns: number
    throttledPatterns: number
    memoryUsage: {
      requestsCount: number
      patternsCount: number
      estimatedSizeKB: number
    }
    recentActivity: {
      last5Minutes: number
      lastHour: number
      duplicatesBlocked: number
      throttledRequests: number
    }
  } {
    const now = Date.now()
    const last5Min = now - 300000
    const lastHour = now - 3600000

    const recentRequests = Array.from(this.requests.values())
    const last5MinRequests = recentRequests.filter(r => r.lastSeen >= last5Min).length
    const lastHourRequests = recentRequests.filter(r => r.lastSeen >= lastHour).length

    const throttledPatterns = Array.from(this.patterns.values()).filter(p => p.isThrottled).length

    // Estimate memory usage (rough calculation)
    const avgRequestSize = 200 // bytes per request metadata
    const avgPatternSize = 150 // bytes per pattern metadata
    const estimatedSizeKB = Math.round(
      (this.requests.size * avgRequestSize + this.patterns.size * avgPatternSize) / 1024
    )

    return {
      totalRequests: this.requests.size,
      uniquePatterns: this.patterns.size,
      throttledPatterns,
      memoryUsage: {
        requestsCount: this.requests.size,
        patternsCount: this.patterns.size,
        estimatedSizeKB
      },
      recentActivity: {
        last5Minutes: last5MinRequests,
        lastHour: lastHourRequests,
        duplicatesBlocked: 0, // Could be tracked separately
        throttledRequests: 0 // Could be tracked separately
      }
    }
  }

  /**
   * Get detailed pattern analysis
   */
  getPatternAnalysis(): Array<{
    hash: string
    frequency: number
    averageInterval: number
    isThrottled: boolean
    cooldownUntil?: number
    riskLevel: 'low' | 'medium' | 'high'
  }> {
    const analysis = Array.from(this.patterns.values()).map(pattern => {
      let riskLevel: 'low' | 'medium' | 'high' = 'low'

      if (pattern.frequency > 20 || pattern.averageInterval < 1000) {
        riskLevel = 'high'
      } else if (pattern.frequency > 10 || pattern.averageInterval < 2000) {
        riskLevel = 'medium'
      }

      return {
        hash: pattern.hash.slice(0, 8) + '...',
        frequency: pattern.frequency,
        averageInterval: Math.round(pattern.averageInterval),
        isThrottled: pattern.isThrottled,
        cooldownUntil: pattern.cooldownUntil,
        riskLevel
      }
    })

    return analysis.sort((a, b) => b.frequency - a.frequency)
  }
}

/**
 * Singleton Duplicate Request Detector for global access
 */
export class DuplicateRequestDetector {
  private static instance?: DuplicateRequestDetector
  private registry: RequestRegistry
  private isEnabled = true

  constructor(throttleConfig?: Partial<ThrottleConfig>, config?: Partial<DuplicateRequestConfig>) {
    this.registry = new RequestRegistry(throttleConfig, config)
  }

  static getInstance(
    throttleConfig?: Partial<ThrottleConfig>,
    config?: Partial<DuplicateRequestConfig>
  ): DuplicateRequestDetector {
    if (!this.instance) {
      this.instance = new DuplicateRequestDetector(throttleConfig, config)
    }
    return this.instance
  }

  /**
   * Check and register transcription request
   */
  checkRequest(
    audioData: ArrayBuffer | Buffer,
    metadata: AudioMetadata = {},
    sourceId?: string
  ): {
    isAllowed: boolean
    isDuplicate: boolean
    isThrottled: boolean
    requestId?: string
    reason?: string
  } {
    if (!this.isEnabled) {
      return {
        isAllowed: true,
        isDuplicate: false,
        isThrottled: false,
        requestId: `disabled_${Date.now()}`
      }
    }

    return this.registry.registerRequest(audioData, metadata, sourceId)
  }

  /**
   * Enable/disable duplicate detection
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    console.info(`🎛️ Duplicate detection ${enabled ? 'ENABLED' : 'DISABLED'}`)
  }

  /**
   * Get current statistics
   */
  getStatistics() {
    return this.registry.getStatistics()
  }

  /**
   * Get pattern analysis
   */
  getPatternAnalysis() {
    return this.registry.getPatternAnalysis()
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.registry.dispose()
    DuplicateRequestDetector.instance = undefined
  }
}

export default DuplicateRequestDetector
