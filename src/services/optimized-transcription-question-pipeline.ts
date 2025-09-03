/**
 * Optimized Transcription Question Pipeline
 * 
 * High-performance pipeline for real-time question detection in transcription streams.
 * Replaces the original TranscriptionQuestionPipeline with significant optimizations:
 * 
 * Performance Improvements:
 * - Streaming buffer optimization with adaptive timeout
 * - Efficient text similarity calculation (O(n) vs O(n²))
 * - Concurrent question detection processing
 * - Memory-efficient transcript accumulation
 * - Smart duplicate detection and filtering
 * - Performance monitoring and adaptive thresholds
 * - Integrated with OptimizedQuestionDetector
 * 
 * Target Performance: <50ms total pipeline latency, >100 questions/second throughput
 */

import { EventEmitter } from 'events'
import { OptimizedQuestionDetector } from './optimized-question-detector'
import { logger } from './gemini-logger'
import { sanitizeLogMessage } from './log-sanitizer'
import {
  QuestionAnalysis,
  QuestionDetectionConfig,
  QuestionType,
  QuestionContext
} from './question-detector'

interface TranscriptEntry {
  id: string
  text: string
  timestamp: number
  confidence: number
  isFinal: boolean
  processed: boolean
  questionAnalysis?: QuestionAnalysis | null
}

interface OptimizedPipelineConfig {
  // Buffer optimization
  bufferTimeoutMs: number // Reduced from 1000ms
  maxBufferSize: number
  adaptiveBuffering: boolean
  
  // Performance optimization
  enableConcurrentProcessing: boolean
  maxConcurrentQuestions: number
  enableStreamingAnalysis: boolean
  
  // Text processing optimization
  minTextLength: number
  maxTextLength: number
  duplicateThreshold: number // Similarity threshold for duplicate detection
  enableSmartFiltering: boolean
  
  // Memory optimization
  maxHistorySize: number
  enableMemoryOptimization: boolean
  gcThreshold: number // Garbage collection threshold
  
  // Performance monitoring
  enablePerformanceMonitoring: boolean
  performanceTargetMs: number
  
  // Question detection configuration
  questionDetectionConfig: Partial<QuestionDetectionConfig>
}

interface PipelineMetrics {
  totalTranscripts: number
  processedTranscripts: number
  questionsDetected: number
  averageProcessingTime: number
  bufferEfficiency: number
  duplicatesFiltered: number
  memoryUsageBytes: number
  concurrentOperations: number
  adaptiveAdjustments: number
  throughputPerSecond: number
}

interface StreamingBuffer {
  entries: TranscriptEntry[]
  lastActivity: number
  totalSize: number
  processedCount: number
}

/**
 * High-Performance Transcription Question Detection Pipeline
 * Optimized for real-time audio transcription processing
 */
export class OptimizedTranscriptionQuestionPipeline extends EventEmitter {
  private config: OptimizedPipelineConfig
  private questionDetector: OptimizedQuestionDetector
  private metrics: PipelineMetrics
  private isInitialized = false

  // Streaming buffer management
  private streamingBuffer: StreamingBuffer
  private bufferTimer?: NodeJS.Timeout
  private processingQueue: TranscriptEntry[] = []

  // Performance optimization
  private activeOperations = 0
  private operationPromises = new Map<string, Promise<void>>()
  private textSimilarityCache = new Map<string, number>()

  // Memory management
  private transcriptHistory: TranscriptEntry[] = []
  private lastGarbageCollection = Date.now()

  // Performance monitoring
  private performanceWindow: number[] = []
  private windowSize = 100 // Last 100 operations

  constructor(config: Partial<OptimizedPipelineConfig> = {}) {
    super()

    this.config = {
      // Buffer optimization
      bufferTimeoutMs: 500, // Reduced from 1000ms for better responsiveness
      maxBufferSize: 50,
      adaptiveBuffering: true,
      
      // Performance optimization
      enableConcurrentProcessing: true,
      maxConcurrentQuestions: 5,
      enableStreamingAnalysis: true,
      
      // Text processing optimization
      minTextLength: 3,
      maxTextLength: 1000,
      duplicateThreshold: 0.8, // 80% similarity threshold
      enableSmartFiltering: true,
      
      // Memory optimization
      maxHistorySize: 200,
      enableMemoryOptimization: true,
      gcThreshold: 100, // GC every 100 processed items
      
      // Performance monitoring
      enablePerformanceMonitoring: true,
      performanceTargetMs: 50,
      
      // Question detection configuration
      questionDetectionConfig: {
        confidenceThreshold: 0.7,
        maxAnalysisDelay: 25,
        enableCaching: true,
        cacheSize: 2000,
        enableFastPath: true,
        fastPathThreshold: 0.85,
        enableConcurrentProcessing: true,
        maxConcurrentOperations: 3,
        performanceTargetMs: 25
      },
      
      ...config
    }

    // Initialize metrics
    this.metrics = {
      totalTranscripts: 0,
      processedTranscripts: 0,
      questionsDetected: 0,
      averageProcessingTime: 0,
      bufferEfficiency: 0,
      duplicatesFiltered: 0,
      memoryUsageBytes: 0,
      concurrentOperations: 0,
      adaptiveAdjustments: 0,
      throughputPerSecond: 0
    }

    // Initialize streaming buffer
    this.streamingBuffer = {
      entries: [],
      lastActivity: Date.now(),
      totalSize: 0,
      processedCount: 0
    }

    // Initialize optimized question detector
    this.questionDetector = new OptimizedQuestionDetector(this.config.questionDetectionConfig)

    logger.info('OptimizedTranscriptionQuestionPipeline initialized', {
      bufferTimeout: this.config.bufferTimeoutMs,
      maxConcurrentQuestions: this.config.maxConcurrentQuestions,
      performanceTarget: this.config.performanceTargetMs,
      enableStreamingAnalysis: this.config.enableStreamingAnalysis
    })
  }

  /**
   * Initialize the optimized pipeline
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('OptimizedTranscriptionQuestionPipeline already initialized')
      return
    }

    const startTime = performance.now()

    try {
      // Initialize question detector
      await this.questionDetector.initialize()

      // Set up event listeners
      this.setupEventListeners()

      this.isInitialized = true

      const initTime = performance.now() - startTime
      logger.info('OptimizedTranscriptionQuestionPipeline initialization complete', {
        initializationTime: `${initTime.toFixed(2)}ms`
      })

      this.emit('initialized', { initTime })

    } catch (error) {
      logger.error('Failed to initialize OptimizedTranscriptionQuestionPipeline', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Process incoming transcription with optimized pipeline
   */
  async processTranscription(
    text: string,
    confidence: number = 1.0,
    isFinal: boolean = true,
    transcriptId?: string
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Pipeline must be initialized before processing transcriptions')
    }

    const id = transcriptId || this.generateTranscriptId()
    const timestamp = Date.now()

    // Basic validation
    if (!text || text.trim().length < this.config.minTextLength) {
      return
    }

    // Truncate if too long
    const processedText = text.length > this.config.maxTextLength ? 
      text.substring(0, this.config.maxTextLength) + '...' : text

    const entry: TranscriptEntry = {
      id,
      text: processedText,
      timestamp,
      confidence,
      isFinal,
      processed: false
    }

    this.metrics.totalTranscripts++
    
    // Add to streaming buffer
    this.addToStreamingBuffer(entry)

    // Process immediately if streaming analysis is enabled and conditions are met
    if (this.config.enableStreamingAnalysis && this.shouldProcessImmediately(entry)) {
      this.processStreamingEntry(entry)
    }

    // Update buffer timer
    this.updateBufferTimer()

    this.emit('transcript_received', {
      id: entry.id,
      text: entry.text,
      timestamp: entry.timestamp,
      bufferSize: this.streamingBuffer.entries.length
    })
  }

  /**
   * Add entry to streaming buffer with optimization
   */
  private addToStreamingBuffer(entry: TranscriptEntry): void {
    // Smart filtering: remove duplicates and similar entries
    if (this.config.enableSmartFiltering) {
      const filtered = this.filterDuplicateEntries(entry)
      if (!filtered) {
        this.metrics.duplicatesFiltered++
        return
      }
    }

    this.streamingBuffer.entries.push(entry)
    this.streamingBuffer.lastActivity = Date.now()
    this.streamingBuffer.totalSize += entry.text.length

    // Limit buffer size for memory efficiency
    if (this.streamingBuffer.entries.length > this.config.maxBufferSize) {
      this.streamingBuffer.entries.shift()
    }
  }

  /**
   * Filter duplicate and similar entries
   */
  private filterDuplicateEntries(newEntry: TranscriptEntry): boolean {
    const recentEntries = this.streamingBuffer.entries.slice(-5) // Check last 5 entries
    
    for (const existing of recentEntries) {
      const similarity = this.calculateTextSimilarity(newEntry.text, existing.text)
      if (similarity >= this.config.duplicateThreshold) {
        // Update existing entry if new one is more recent or final
        if (newEntry.isFinal && !existing.isFinal) {
          existing.text = newEntry.text
          existing.confidence = newEntry.confidence
          existing.isFinal = newEntry.isFinal
          existing.timestamp = newEntry.timestamp
        }
        return false // Filter out duplicate
      }
    }
    
    return true // Keep this entry
  }

  /**
   * Optimized text similarity calculation (O(n) vs O(n²))
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0

    // Use cache for repeated comparisons
    const cacheKey = `${text1.length}:${text2.length}:${text1.substring(0, 10)}:${text2.substring(0, 10)}`
    if (this.textSimilarityCache.has(cacheKey)) {
      return this.textSimilarityCache.get(cacheKey)!
    }

    // Quick length-based similarity check
    const lengthDiff = Math.abs(text1.length - text2.length)
    const maxLength = Math.max(text1.length, text2.length)
    if (lengthDiff / maxLength > 0.5) {
      this.textSimilarityCache.set(cacheKey, 0)
      return 0
    }

    // Optimized Jaccard similarity using word sets
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))
    
    const intersection = new Set([...words1].filter(word => words2.has(word)))
    const union = new Set([...words1, ...words2])
    
    const similarity = intersection.size / union.size

    // Cache result (limit cache size)
    if (this.textSimilarityCache.size > 1000) {
      this.textSimilarityCache.clear()
    }
    this.textSimilarityCache.set(cacheKey, similarity)

    return similarity
  }

  /**
   * Check if entry should be processed immediately
   */
  private shouldProcessImmediately(entry: TranscriptEntry): boolean {
    return (
      entry.isFinal ||
      entry.text.includes('?') ||
      entry.confidence > 0.9 ||
      this.activeOperations < this.config.maxConcurrentQuestions
    )
  }

  /**
   * Process streaming entry immediately
   */
  private async processStreamingEntry(entry: TranscriptEntry): Promise<void> {
    if (this.activeOperations >= this.config.maxConcurrentQuestions) {
      this.processingQueue.push(entry)
      return
    }

    this.activeOperations++
    this.metrics.concurrentOperations = Math.max(this.metrics.concurrentOperations, this.activeOperations)

    const operationPromise = this.analyzeQuestionOptimized(entry)
    this.operationPromises.set(entry.id, operationPromise)

    try {
      await operationPromise
    } finally {
      this.activeOperations--
      this.operationPromises.delete(entry.id)
      this.processQueue()
    }
  }

  /**
   * Process queued operations
   */
  private processQueue(): void {
    while (this.processingQueue.length > 0 && 
           this.activeOperations < this.config.maxConcurrentQuestions) {
      const entry = this.processingQueue.shift()
      if (entry && !entry.processed) {
        this.processStreamingEntry(entry)
      }
    }
  }

  /**
   * Update buffer timer with adaptive timeout
   */
  private updateBufferTimer(): void {
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer)
    }

    let timeout = this.config.bufferTimeoutMs

    // Adaptive buffering: reduce timeout if buffer is large or activity is high
    if (this.config.adaptiveBuffering) {
      const bufferRatio = this.streamingBuffer.entries.length / this.config.maxBufferSize
      const activityBoost = Math.min(2.0, this.metrics.throughputPerSecond / 10)
      
      timeout = Math.max(
        100, // Minimum timeout
        timeout * (1 - bufferRatio * 0.5) / (1 + activityBoost * 0.3)
      )
    }

    this.bufferTimer = setTimeout(() => {
      this.processBuffer()
    }, timeout)
  }

  /**
   * Process buffer with optimized batch processing
   */
  private async processBuffer(): Promise<void> {
    if (this.streamingBuffer.entries.length === 0) {
      return
    }

    const startTime = performance.now()
    const entriesToProcess = [...this.streamingBuffer.entries]
    
    // Clear buffer
    this.streamingBuffer.entries = []
    this.streamingBuffer.processedCount += entriesToProcess.length

    logger.debug('Processing transcription buffer', {
      entriesCount: entriesToProcess.length,
      bufferAge: Date.now() - this.streamingBuffer.lastActivity
    })

    // Process entries concurrently with controlled concurrency
    const processingPromises: Promise<void>[] = []
    
    for (const entry of entriesToProcess) {
      if (!entry.processed) {
        if (this.config.enableConcurrentProcessing) {
          processingPromises.push(this.processStreamingEntry(entry))
        } else {
          await this.analyzeQuestionOptimized(entry)
        }
      }
    }

    // Wait for all concurrent operations to complete
    if (processingPromises.length > 0) {
      await Promise.all(processingPromises)
    }

    // Update metrics
    const processingTime = performance.now() - startTime
    this.updatePerformanceMetrics(processingTime, entriesToProcess.length)

    // Memory optimization
    if (this.config.enableMemoryOptimization) {
      this.performMemoryOptimization()
    }

    this.emit('buffer_processed', {
      entriesProcessed: entriesToProcess.length,
      processingTime,
      questionsFound: entriesToProcess.filter(e => e.questionAnalysis?.isQuestion).length
    })
  }

  /**
   * Optimized question analysis
   */
  private async analyzeQuestionOptimized(entry: TranscriptEntry): Promise<void> {
    if (entry.processed) return

    const startTime = performance.now()

    try {
      // Detect question using optimized detector
      const analysis = await this.questionDetector.detectQuestion(entry.text)
      entry.questionAnalysis = analysis
      entry.processed = true

      // Update metrics
      this.metrics.processedTranscripts++
      
      if (analysis?.isQuestion) {
        this.metrics.questionsDetected++
        
        // Add to history
        this.addToHistory(entry)

        // Emit question detected event
        this.emit('question_detected', {
          transcript: {
            id: entry.id,
            text: entry.text,
            timestamp: entry.timestamp,
            confidence: entry.confidence
          },
          analysis,
          processingTime: performance.now() - startTime
        })

        logger.info('Question detected in transcription', sanitizeLogMessage({
          transcriptId: entry.id,
          questionType: analysis.questionType,
          confidence: analysis.confidence.toFixed(2),
          processingTime: `${(performance.now() - startTime).toFixed(2)}ms`,
          text: entry.text.substring(0, 100) + (entry.text.length > 100 ? '...' : '')
        }))
      }

    } catch (error) {
      logger.error('Error analyzing question in transcript', {
        transcriptId: entry.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      entry.processed = true // Mark as processed to avoid retries
    }

    // Update performance window
    const processingTime = performance.now() - startTime
    this.addToPerformanceWindow(processingTime)
  }

  /**
   * Add entry to history with size management
   */
  private addToHistory(entry: TranscriptEntry): void {
    this.transcriptHistory.push(entry)
    
    // Limit history size for memory efficiency
    if (this.transcriptHistory.length > this.config.maxHistorySize) {
      this.transcriptHistory.shift()
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(processingTime: number, entriesProcessed: number): void {
    // Update running average
    const alpha = 0.1 // smoothing factor
    this.metrics.averageProcessingTime = alpha * processingTime + (1 - alpha) * this.metrics.averageProcessingTime

    // Calculate buffer efficiency
    this.metrics.bufferEfficiency = this.streamingBuffer.processedCount > 0 ? 
      this.streamingBuffer.entries.length / this.streamingBuffer.processedCount : 0

    // Calculate throughput
    if (this.performanceWindow.length > 0) {
      const windowSum = this.performanceWindow.reduce((sum, time) => sum + time, 0)
      const avgWindowTime = windowSum / this.performanceWindow.length
      this.metrics.throughputPerSecond = avgWindowTime > 0 ? 1000 / avgWindowTime : 0
    }

    // Estimate memory usage
    this.metrics.memoryUsageBytes = (
      this.streamingBuffer.entries.length * 200 + // Buffer entries
      this.transcriptHistory.length * 300 + // History entries
      this.textSimilarityCache.size * 50 // Cache entries
    )
  }

  /**
   * Add processing time to performance window
   */
  private addToPerformanceWindow(processingTime: number): void {
    this.performanceWindow.push(processingTime)
    
    if (this.performanceWindow.length > this.windowSize) {
      this.performanceWindow.shift()
    }

    // Adaptive adjustment if performance monitoring is enabled
    if (this.config.enablePerformanceMonitoring && 
        this.performanceWindow.length >= this.windowSize) {
      this.checkPerformanceThresholds()
    }
  }

  /**
   * Check and adapt performance thresholds
   */
  private checkPerformanceThresholds(): void {
    const avgTime = this.performanceWindow.reduce((sum, time) => sum + time, 0) / this.performanceWindow.length
    
    if (avgTime > this.config.performanceTargetMs) {
      // Performance is degrading, make adjustments
      this.adaptPerformanceSettings()
      this.metrics.adaptiveAdjustments++
    }
  }

  /**
   * Adapt performance settings based on current metrics
   */
  private adaptPerformanceSettings(): void {
    // Reduce buffer timeout for faster processing
    this.config.bufferTimeoutMs = Math.max(100, this.config.bufferTimeoutMs * 0.9)
    
    // Increase duplicate threshold to filter more aggressively
    this.config.duplicateThreshold = Math.min(0.95, this.config.duplicateThreshold + 0.05)
    
    // Reduce concurrent operations if system is overloaded
    this.config.maxConcurrentQuestions = Math.max(2, this.config.maxConcurrentQuestions - 1)

    logger.debug('Adapted performance settings', {
      newBufferTimeout: this.config.bufferTimeoutMs,
      newDuplicateThreshold: this.config.duplicateThreshold,
      newMaxConcurrent: this.config.maxConcurrentQuestions
    })
  }

  /**
   * Perform memory optimization and garbage collection
   */
  private performMemoryOptimization(): void {
    const now = Date.now()
    
    if (now - this.lastGarbageCollection > this.config.gcThreshold * 1000) {
      // Clear old cache entries
      if (this.textSimilarityCache.size > 500) {
        this.textSimilarityCache.clear()
      }

      // Clean up completed operation promises
      const completedOperations = Array.from(this.operationPromises.entries())
        .filter(([_, promise]) => promise.constructor.name === 'Promise')
      
      for (const [id] of completedOperations) {
        this.operationPromises.delete(id)
      }

      this.lastGarbageCollection = now
      
      logger.debug('Memory optimization completed', {
        cacheSize: this.textSimilarityCache.size,
        activeOperations: this.operationPromises.size,
        historySize: this.transcriptHistory.length
      })
    }
  }

  /**
   * Generate unique transcript ID
   */
  private generateTranscriptId(): string {
    return `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    this.questionDetector.on('question_analyzed', (data) => {
      this.emit('detector_analysis', data)
    })

    this.questionDetector.on('initialized', (data) => {
      this.emit('detector_initialized', data)
    })

    // Clean up on process exit (Node.js only)
    if (typeof process !== 'undefined' && process.on) {
      process.on('beforeExit', () => {
        this.destroy()
      })
    }
    
    // Clean up on browser window unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.destroy()
      })
    }
  }

  /**
   * Get pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return { ...this.metrics }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    averageProcessingTime: number
    questionDetectionRate: number
    bufferEfficiency: number
    throughputPerSecond: number
    memoryUsageKB: number
    concurrentOperations: number
    duplicateFilterRate: number
  } {
    const questionDetectionRate = this.metrics.processedTranscripts > 0 ? 
      this.metrics.questionsDetected / this.metrics.processedTranscripts : 0

    const duplicateFilterRate = this.metrics.totalTranscripts > 0 ?
      this.metrics.duplicatesFiltered / this.metrics.totalTranscripts : 0

    return {
      averageProcessingTime: this.metrics.averageProcessingTime,
      questionDetectionRate,
      bufferEfficiency: this.metrics.bufferEfficiency,
      throughputPerSecond: this.metrics.throughputPerSecond,
      memoryUsageKB: this.metrics.memoryUsageBytes / 1024,
      concurrentOperations: this.metrics.concurrentOperations,
      duplicateFilterRate
    }
  }

  /**
   * Get recent questions from history
   */
  getRecentQuestions(limit: number = 10): Array<{
    id: string
    text: string
    timestamp: number
    analysis: QuestionAnalysis
  }> {
    return this.transcriptHistory
      .filter(entry => entry.questionAnalysis?.isQuestion)
      .slice(-limit)
      .map(entry => ({
        id: entry.id,
        text: entry.text,
        timestamp: entry.timestamp,
        analysis: entry.questionAnalysis!
      }))
  }

  /**
   * Clear history and reset metrics
   */
  reset(): void {
    // Clear buffers and history
    this.streamingBuffer.entries = []
    this.streamingBuffer.processedCount = 0
    this.transcriptHistory = []
    this.processingQueue = []
    
    // Clear caches
    this.textSimilarityCache.clear()
    this.operationPromises.clear()
    
    // Reset metrics
    this.metrics = {
      totalTranscripts: 0,
      processedTranscripts: 0,
      questionsDetected: 0,
      averageProcessingTime: 0,
      bufferEfficiency: 0,
      duplicatesFiltered: 0,
      memoryUsageBytes: 0,
      concurrentOperations: 0,
      adaptiveAdjustments: 0,
      throughputPerSecond: 0
    }

    this.performanceWindow = []
    this.activeOperations = 0

    logger.info('OptimizedTranscriptionQuestionPipeline reset')
    this.emit('reset')
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OptimizedPipelineConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Update question detector config if provided
    if (newConfig.questionDetectionConfig) {
      this.questionDetector.updateConfig(newConfig.questionDetectionConfig)
    }

    logger.info('OptimizedTranscriptionQuestionPipeline configuration updated', {
      bufferTimeout: this.config.bufferTimeoutMs,
      maxConcurrentQuestions: this.config.maxConcurrentQuestions,
      performanceTarget: this.config.performanceTargetMs
    })

    this.emit('config_updated', this.config)
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    // Clear timers
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer)
      this.bufferTimer = undefined
    }

    // Cancel pending operations
    this.operationPromises.forEach((promise, id) => {
      // Note: Can't actually cancel promises, but we mark them as stale
    })
    this.operationPromises.clear()

    // Clear all data structures
    this.streamingBuffer.entries = []
    this.transcriptHistory = []
    this.processingQueue = []
    this.textSimilarityCache.clear()
    this.performanceWindow = []

    // Destroy question detector
    if (this.questionDetector) {
      this.questionDetector.destroy()
    }

    // Remove all event listeners
    this.removeAllListeners()

    this.isInitialized = false

    logger.info('OptimizedTranscriptionQuestionPipeline destroyed')
  }
}

export default OptimizedTranscriptionQuestionPipeline