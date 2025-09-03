/**
 * Optimized Question Detection and Classification System
 *
 * High-performance question detection system optimized for real-time processing.
 * Features significant performance improvements over the base QuestionDetector:
 *
 * Performance Optimizations:
 * - Pre-compiled regex patterns with priority-based matching
 * - LRU cache with smart key normalization and compression
 * - Optimized entity recognition with cached patterns
 * - Parallel processing support for batch operations
 * - Adaptive performance thresholds and monitoring
 * - Memory-efficient text processing and storage
 * - Fast-path detection for common question patterns
 *
 * Target Performance: <25ms average processing time, >80% cache hit rate
 */

import {EventEmitter} from 'events'
import {LRUCache} from 'lru-cache'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'
import {
  QuestionDetectionConfig,
  QuestionAnalysis,
  DetectedPattern,
  Entity,
  QuestionIntent,
  QuestionType,
  QuestionContext,
  DetectionMetrics
} from './question-detector'

interface OptimizedQuestionDetectionConfig extends QuestionDetectionConfig {
  // Performance optimizations
  enableFastPath: boolean
  fastPathThreshold: number // confidence threshold for fast path detection

  // Advanced caching
  cacheCompressionEnabled: boolean
  cachePrecomputePatterns: boolean

  // Concurrent processing
  enableConcurrentProcessing: boolean
  maxConcurrentOperations: number

  // Adaptive thresholds
  enableAdaptiveThresholds: boolean
  performanceTargetMs: number

  // Memory optimization
  enableMemoryOptimization: boolean
  maxEntityCacheSize: number
}

interface PerformanceMetrics extends DetectionMetrics {
  fastPathHits: number
  concurrentOperations: number
  memoryUsageBytes: number
  adaptiveAdjustments: number
  patternMatchTime: number
  semanticAnalysisTime: number
  cacheCompressionRatio: number
}

interface PrecompiledPattern {
  regex: RegExp
  type: QuestionType
  weight: number
  priority: number
  fastPath: boolean
}

interface CachedEntity {
  text: string
  type: Entity['type']
  confidence: number
  lastUsed: number
}

interface NormalizedCacheKey {
  key: string
  normalized: string
  hash: number
}

/**
 * High-Performance Question Detection Engine
 * Optimized for real-time audio transcription processing
 */
export class OptimizedQuestionDetector extends EventEmitter {
  private config: OptimizedQuestionDetectionConfig
  private metrics: PerformanceMetrics
  private cache: LRUCache<string, QuestionAnalysis>
  private context: QuestionContext
  private isInitialized = false

  // Pre-compiled patterns for maximum performance
  private fastPathPatterns: PrecompiledPattern[]
  private detailedPatterns: PrecompiledPattern[]
  private entityPatterns: Map<Entity['type'], RegExp[]>
  private entityCache: LRUCache<string, CachedEntity[]>

  // Performance monitoring
  private performanceTargets: {
    processingTime: number
    cacheHitRate: number
    accuracy: number
  }

  // Concurrent processing support
  private activeOperations = 0
  private operationQueue: Array<{
    text: string
    resolve: (result: QuestionAnalysis | null) => void
    reject: (error: Error) => void
  }> = []

  // Memory optimization
  private textBuffers: Map<number, string> = new Map()
  private compressionEnabled: boolean

  constructor(config: Partial<OptimizedQuestionDetectionConfig> = {}) {
    super()

    this.config = {
      // Base configuration
      confidenceThreshold: 0.7,
      minQuestionLength: 3,
      maxAnalysisDelay: 25, // Reduced from 50ms
      enablePatternMatching: true,
      enableSemanticAnalysis: true,
      enableContextAnalysis: false, // Disabled by default for performance
      enableQuestionClassification: true,
      classificationDepth: 'detailed',
      enableCaching: true,
      cacheSize: 2000, // Increased cache size
      enableBatching: true, // Enabled by default
      batchSize: 5,

      // Performance optimizations
      enableFastPath: true,
      fastPathThreshold: 0.85,
      cacheCompressionEnabled: true,
      cachePrecomputePatterns: true,
      enableConcurrentProcessing: true,
      maxConcurrentOperations: 3,
      enableAdaptiveThresholds: true,
      performanceTargetMs: 25,
      enableMemoryOptimization: true,
      maxEntityCacheSize: 500,

      ...config
    }

    this.compressionEnabled = this.config.cacheCompressionEnabled

    // Initialize performance metrics
    this.metrics = {
      totalAnalyzed: 0,
      questionsDetected: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      patternMatchHits: 0,
      semanticAnalysisHits: 0,
      cacheHits: 0,
      errorCount: 0,
      fastPathHits: 0,
      concurrentOperations: 0,
      memoryUsageBytes: 0,
      adaptiveAdjustments: 0,
      patternMatchTime: 0,
      semanticAnalysisTime: 0,
      cacheCompressionRatio: 0
    }

    this.performanceTargets = {
      processingTime: this.config.performanceTargetMs,
      cacheHitRate: 0.8,
      accuracy: 0.95
    }

    // Initialize optimized caches
    this.cache = new LRUCache({
      max: this.config.cacheSize,
      ttl: 1000 * 60 * 30, // 30 minutes TTL
      updateAgeOnGet: true,
      allowStale: false
    })

    this.entityCache = new LRUCache({
      max: this.config.maxEntityCacheSize,
      ttl: 1000 * 60 * 10, // 10 minutes TTL
      updateAgeOnGet: true
    })

    // Initialize arrays for patterns
    this.fastPathPatterns = []
    this.detailedPatterns = []
    this.entityPatterns = new Map()

    this.context = {
      previousQuestions: [],
      conversationHistory: [],
      relatedEntities: []
    }

    logger.info('OptimizedQuestionDetector initialized', {
      performanceTarget: this.config.performanceTargetMs,
      enableFastPath: this.config.enableFastPath,
      cacheSize: this.config.cacheSize,
      enableConcurrentProcessing: this.config.enableConcurrentProcessing
    })
  }

  /**
   * Initialize the optimized question detector
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.debug('OptimizedQuestionDetector already initialized')
        return
      }

      const startTime = performance.now()

      // Initialize pre-compiled patterns
      await this.initializeOptimizedPatterns()

      // Initialize entity recognition patterns
      await this.initializeEntityRecognition()

      // Pre-warm caches if enabled
      if (this.config.cachePrecomputePatterns) {
        await this.precomputeCommonPatterns()
      }

      this.isInitialized = true

      const initTime = performance.now() - startTime

      logger.info('OptimizedQuestionDetector initialization complete', {
        initializationTime: `${initTime.toFixed(2)}ms`,
        fastPathPatterns: this.fastPathPatterns.length,
        detailedPatterns: this.detailedPatterns.length,
        entityPatterns: Array.from(this.entityPatterns.keys()).length,
        precomputedCache: this.cache.size
      })

      this.emit('initialized', {
        initTime,
        patternCount: this.fastPathPatterns.length + this.detailedPatterns.length,
        cachePrewarmed: this.cache.size > 0
      })
    } catch (error) {
      logger.error('Failed to initialize OptimizedQuestionDetector', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * High-performance question detection with multiple optimization paths
   */
  async detectQuestion(text: string, useContext = false): Promise<QuestionAnalysis | null> {
    if (!this.isInitialized) {
      throw new Error('OptimizedQuestionDetector must be initialized before use')
    }

    if (!text || text.trim().length < this.config.minQuestionLength) {
      return null
    }

    // Check if we can handle this request (concurrency control)
    if (
      this.config.enableConcurrentProcessing &&
      this.activeOperations >= this.config.maxConcurrentOperations
    ) {
      return this.queueOperation(text, useContext)
    }

    this.activeOperations++
    this.metrics.concurrentOperations = Math.max(
      this.metrics.concurrentOperations,
      this.activeOperations
    )

    const startTime = performance.now()

    try {
      // Generate optimized cache key
      const cacheKey = this.generateOptimizedCacheKey(text)

      // Check cache first
      if (this.config.enableCaching && this.cache.has(cacheKey.key)) {
        this.metrics.cacheHits++
        const cachedResult = this.cache.get(cacheKey.key)!
        this.updateMetrics(performance.now() - startTime, cachedResult.confidence)
        return cachedResult
      }

      // Try fast path detection first
      let analysis: QuestionAnalysis | null = null

      if (this.config.enableFastPath) {
        analysis = await this.tryFastPathDetection(text)
        if (analysis && analysis.confidence >= this.config.fastPathThreshold) {
          this.metrics.fastPathHits++
          this.cacheOptimizedResult(cacheKey.key, analysis)
          this.updateMetrics(performance.now() - startTime, analysis.confidence)
          return analysis
        }
      }

      // Fall back to detailed analysis
      analysis = await this.performDetailedAnalysis(text, useContext)

      // Cache the result
      if (this.config.enableCaching && analysis) {
        this.cacheOptimizedResult(cacheKey.key, analysis)
      }

      // Update context if question detected
      if (analysis && analysis.isQuestion) {
        this.updateOptimizedContext(text, analysis)
      }

      this.updateMetrics(performance.now() - startTime, analysis?.confidence || 0)

      // Adapt thresholds if enabled
      if (this.config.enableAdaptiveThresholds) {
        this.adaptPerformanceThresholds(performance.now() - startTime)
      }

      this.emit('question_analyzed', {
        text,
        analysis,
        processingTime: performance.now() - startTime,
        fastPathUsed: false,
        cacheHit: false
      })

      return analysis
    } catch (error) {
      this.metrics.errorCount++
      logger.error('Error in optimized question detection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        textLength: text.length
      })
      return null
    } finally {
      this.activeOperations--
      this.processOperationQueue()
    }
  }

  /**
   * Fast path detection for common question patterns
   */
  private async tryFastPathDetection(text: string): Promise<QuestionAnalysis | null> {
    const startTime = performance.now()
    const cleanText = this.optimizedPreprocessing(text)

    try {
      // Check fast path patterns in priority order
      for (const pattern of this.fastPathPatterns) {
        if (pattern.regex.test(cleanText)) {
          const analysis: QuestionAnalysis = {
            isQuestion: true,
            confidence: 0.85 + pattern.weight * 0.1, // Boost confidence for fast path
            questionType: pattern.type,
            patterns: [
              {
                type: 'interrogative',
                pattern: pattern.regex.source,
                position: 0,
                confidence: pattern.weight,
                weight: pattern.weight
              }
            ],
            entities: [], // Skip entity extraction for fast path
            intent: this.quickIntentDetection(cleanText, pattern.type),
            complexity: this.quickComplexityAssessment(cleanText),
            requiresContext: this.quickContextAssessment(cleanText),
            timestamp: Date.now()
          }

          this.metrics.patternMatchTime += performance.now() - startTime
          return analysis
        }
      }

      return null
    } catch (error) {
      logger.error('Error in fast path detection', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  /**
   * Detailed analysis with full feature extraction
   */
  private async performDetailedAnalysis(
    text: string,
    useContext: boolean
  ): Promise<QuestionAnalysis | null> {
    const cleanText = this.optimizedPreprocessing(text)
    const patterns: DetectedPattern[] = []
    const entities: Entity[] = []

    let confidence = 0
    let questionType: QuestionType = 'conversational'
    let isQuestion = false

    // 1. Optimized pattern detection
    if (this.config.enablePatternMatching) {
      const patternStartTime = performance.now()
      const patternResults = await this.optimizedPatternDetection(cleanText)
      this.metrics.patternMatchTime += performance.now() - patternStartTime

      patterns.push(...patternResults.patterns)
      confidence = Math.max(confidence, patternResults.confidence)

      if (patternResults.confidence > this.config.confidenceThreshold) {
        isQuestion = true
        questionType = patternResults.type
        this.metrics.patternMatchHits++
      }
    }

    // 2. Optimized semantic analysis
    if (this.config.enableSemanticAnalysis) {
      const semanticStartTime = performance.now()
      const semanticResults = await this.optimizedSemanticAnalysis(cleanText)
      this.metrics.semanticAnalysisTime += performance.now() - semanticStartTime

      confidence = Math.max(confidence, semanticResults.confidence)
      entities.push(...semanticResults.entities)

      if (semanticResults.confidence > this.config.confidenceThreshold) {
        isQuestion = true
        if (semanticResults.type !== 'conversational') {
          questionType = semanticResults.type
        }
        this.metrics.semanticAnalysisHits++
      }
    }

    // 3. Context analysis (if enabled and requested)
    if (this.config.enableContextAnalysis && useContext) {
      const contextResults = this.analyzeOptimizedContext(cleanText)
      confidence = Math.max(confidence, contextResults.confidence)

      if (contextResults.isQuestion) {
        isQuestion = true
      }
    }

    // Final analysis
    if (!isQuestion || confidence < this.config.confidenceThreshold) {
      return null
    }

    const analysis: QuestionAnalysis = {
      isQuestion,
      confidence,
      questionType,
      patterns,
      entities,
      intent: this.optimizedIntentDetection(cleanText, questionType, entities),
      complexity: this.optimizedComplexityAssessment(cleanText, patterns, entities),
      requiresContext: this.optimizedContextRequirement(cleanText, questionType),
      timestamp: Date.now()
    }

    // Add detailed classification if enabled
    if (this.config.enableQuestionClassification && this.config.classificationDepth !== 'basic') {
      analysis.subType = this.optimizedSubtypeClassification(cleanText, questionType, entities)
    }

    this.metrics.questionsDetected++
    return analysis
  }

  /**
   * Initialize pre-compiled patterns for maximum performance
   */
  private async initializeOptimizedPatterns(): Promise<void> {
    // Fast path patterns (high confidence, common patterns)
    const fastPathDefinitions = [
      {
        pattern: /^(who|what|when|where|why|how)\s+/i,
        type: 'factual' as QuestionType,
        weight: 1.0,
        priority: 1
      },
      {pattern: /\?$/, type: 'conversational' as QuestionType, weight: 0.95, priority: 2},
      {
        pattern: /^(do|does|did|can|could|will|would|should)\s+/i,
        type: 'confirmatory' as QuestionType,
        weight: 0.9,
        priority: 3
      },
      {
        pattern: /^(is|are|am|was|were)\s+/i,
        type: 'confirmatory' as QuestionType,
        weight: 0.85,
        priority: 4
      }
    ]

    this.fastPathPatterns = fastPathDefinitions.map(def => ({
      regex: def.pattern,
      type: def.type,
      weight: def.weight,
      priority: def.priority,
      fastPath: true
    }))

    // Detailed patterns (more comprehensive, lower priority)
    const detailedDefinitions = [
      {
        pattern: /\b(explain|describe|tell me about|what is|what are)\b/i,
        type: 'factual' as QuestionType,
        weight: 0.8
      },
      {
        pattern: /\b(how to|how do|how can|steps to)\b/i,
        type: 'procedural' as QuestionType,
        weight: 0.85
      },
      {pattern: /\b(why|reason|because|cause)\b.*\?/i, type: 'causal' as QuestionType, weight: 0.8},
      {
        pattern: /\b(which|better|best|prefer|choose)\b/i,
        type: 'comparative' as QuestionType,
        weight: 0.75
      },
      {
        pattern: /\b(what if|suppose|imagine|hypothetically)\b/i,
        type: 'hypothetical' as QuestionType,
        weight: 0.7
      },
      {
        pattern: /\b(isn't|aren't|don't|doesn't|right|correct)\s*(it|you|that|this)\?/i,
        type: 'confirmatory' as QuestionType,
        weight: 0.8
      }
    ]

    this.detailedPatterns = detailedDefinitions.map((def, index) => ({
      regex: def.pattern,
      type: def.type,
      weight: def.weight,
      priority: index + 10, // Lower priority than fast path
      fastPath: false
    }))

    // Sort by priority for optimal matching order
    this.fastPathPatterns.sort((a, b) => a.priority - b.priority)
    this.detailedPatterns.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Initialize optimized entity recognition patterns
   */
  private async initializeEntityRecognition(): Promise<void> {
    this.entityPatterns.set('person', [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
      /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+\b/g
    ])

    this.entityPatterns.set('time', [
      /\b\d{1,2}:\d{2}(\s*(am|pm))?\b/gi,
      /\b(today|tomorrow|yesterday|now|later|soon)\b/gi,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi
    ])

    this.entityPatterns.set('number', [
      /\b\d+(\.\d+)?(%|percent|dollars?|cents?|miles?|kilometers?|pounds?|kilograms?)?\b/g,
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/gi
    ])

    this.entityPatterns.set('location', [
      /\b(in|at|from|to|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/g // City, State
    ])
  }

  /**
   * Pre-compute analysis for common patterns
   */
  private async precomputeCommonPatterns(): Promise<void> {
    const commonQuestions = [
      'What is this?',
      'How does it work?',
      'Why is this happening?',
      'When will it be ready?',
      'Who is responsible?',
      'Where can I find it?',
      'Can you help me?',
      'Is this correct?',
      'Do you understand?',
      'What time is it?'
    ]

    for (const question of commonQuestions) {
      const cacheKey = this.generateOptimizedCacheKey(question)
      if (!this.cache.has(cacheKey.key)) {
        // Perform analysis and cache result
        const analysis = await this.performDetailedAnalysis(question, false)
        if (analysis) {
          this.cache.set(cacheKey.key, analysis)
        }
      }
    }

    logger.debug('Pre-computed common patterns', {
      cacheSize: this.cache.size,
      precomputedQuestions: commonQuestions.length
    })
  }

  /**
   * Generate optimized cache key with normalization and compression
   */
  private generateOptimizedCacheKey(text: string): NormalizedCacheKey {
    // Normalize text for better cache hits
    const normalized = text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s?!.]/g, '') // Remove special characters except basic punctuation

    // Generate hash for very long texts
    let key = normalized
    if (normalized.length > 100) {
      key = this.simpleHash(normalized).toString()
    }

    return {
      key: this.compressionEnabled ? this.compressString(key) : key,
      normalized,
      hash: this.simpleHash(normalized)
    }
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Compress string for cache storage
   */
  private compressString(str: string): string {
    if (!this.compressionEnabled || str.length < 50) {
      return str
    }

    // Simple compression: remove common words and normalize
    const compressed = str
      .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    this.metrics.cacheCompressionRatio = compressed.length / str.length
    return compressed
  }

  /**
   * Optimized preprocessing with minimal overhead
   */
  private optimizedPreprocessing(text: string): string {
    return text.trim().replace(/\s+/g, ' ') // Normalize whitespace only
  }

  /**
   * Optimized pattern detection with early termination
   */
  private async optimizedPatternDetection(text: string): Promise<{
    patterns: DetectedPattern[]
    confidence: number
    type: QuestionType
  }> {
    const patterns: DetectedPattern[] = []
    let maxConfidence = 0
    let dominantType: QuestionType = 'conversational'

    // Check detailed patterns with early termination
    for (const pattern of this.detailedPatterns) {
      const match = text.match(pattern.regex)
      if (match) {
        const confidence = pattern.weight
        patterns.push({
          type: 'interrogative',
          pattern: pattern.regex.source,
          position: match.index || 0,
          confidence,
          weight: pattern.weight
        })

        if (confidence > maxConfidence) {
          maxConfidence = confidence
          dominantType = pattern.type

          // Early termination if we have high confidence
          if (confidence >= 0.9) {
            break
          }
        }
      }
    }

    return {
      patterns,
      confidence: maxConfidence,
      type: dominantType
    }
  }

  /**
   * Optimized semantic analysis with entity caching
   */
  private async optimizedSemanticAnalysis(text: string): Promise<{
    confidence: number
    type: QuestionType
    entities: Entity[]
  }> {
    // Check entity cache first
    const entityCacheKey = this.simpleHash(text).toString()
    let entities: Entity[] = []

    if (this.entityCache.has(entityCacheKey)) {
      const cachedEntities = this.entityCache.get(entityCacheKey) || []
      entities = cachedEntities.map(ce => ({
        text: ce.text,
        type: ce.type,
        position: text.indexOf(ce.text),
        confidence: ce.confidence
      }))
    } else {
      entities = this.optimizedEntityExtraction(text)

      // Cache entities
      const cachedEntities: CachedEntity[] = entities.map(entity => ({
        text: entity.text,
        type: entity.type,
        confidence: entity.confidence,
        lastUsed: Date.now()
      }))
      this.entityCache.set(entityCacheKey, cachedEntities)
    }

    // Quick semantic analysis based on keywords and entities
    const words = text.toLowerCase()
    let confidence = 0
    let type: QuestionType = 'conversational'

    // Use pre-defined keyword lists for fast classification
    const keywordChecks = [
      {
        keywords: ['information', 'details', 'facts', 'explain', 'describe'],
        type: 'factual' as QuestionType,
        boost: 0.3
      },
      {
        keywords: ['how', 'steps', 'process', 'method'],
        type: 'procedural' as QuestionType,
        boost: 0.4
      },
      {
        keywords: ['why', 'reason', 'cause', 'because'],
        type: 'causal' as QuestionType,
        boost: 0.35
      },
      {
        keywords: ['better', 'worse', 'compare', 'which', 'best'],
        type: 'comparative' as QuestionType,
        boost: 0.3
      }
    ]

    for (const check of keywordChecks) {
      const matches = check.keywords.filter(keyword => words.includes(keyword))
      if (matches.length > 0) {
        const keywordConfidence = Math.min(0.8, matches.length * check.boost)
        if (keywordConfidence > confidence) {
          confidence = keywordConfidence
          type = check.type
        }
      }
    }

    // Boost confidence based on entity presence
    if (entities.length > 0) {
      confidence = Math.min(0.9, confidence + entities.length * 0.1)
    }

    return {
      confidence,
      type,
      entities
    }
  }

  /**
   * Optimized entity extraction with cached patterns
   */
  private optimizedEntityExtraction(text: string): Entity[] {
    const entities: Entity[] = []

    for (const [entityType, patterns] of this.entityPatterns.entries()) {
      for (const pattern of patterns) {
        let match
        const regex = new RegExp(pattern.source, pattern.flags)
        while ((match = regex.exec(text)) !== null) {
          entities.push({
            text: match[0],
            type: entityType,
            position: match.index,
            confidence: 0.8
          })

          // Prevent infinite loop for global patterns
          if (!pattern.global) break
        }
      }
    }

    return entities
  }

  /**
   * Quick intent detection for fast path
   */
  private quickIntentDetection(text: string, type: QuestionType): QuestionIntent {
    const words = text.toLowerCase()

    let primary: QuestionIntent['primary'] = 'information_seeking'
    if (['confirmatory'].includes(type)) primary = 'confirmation'
    else if (words.includes('how')) primary = 'instruction'

    let urgency: QuestionIntent['urgency'] = 'medium'
    if (['urgent', 'quickly', 'now'].some(word => words.includes(word))) urgency = 'high'

    return {primary, urgency, scope: 'general'}
  }

  /**
   * Quick complexity assessment
   */
  private quickComplexityAssessment(text: string): 'simple' | 'moderate' | 'complex' {
    const words = text.split(/\s+/).length
    const conjunctions = (text.match(/\b(and|or|but|however)\b/gi) || []).length

    if (words > 20 || conjunctions > 1) return 'complex'
    if (words > 10 || conjunctions > 0) return 'moderate'
    return 'simple'
  }

  /**
   * Quick context assessment
   */
  private quickContextAssessment(text: string): boolean {
    const contextWords = ['this', 'that', 'it', 'they', 'here', 'there']
    return contextWords.some(word => text.toLowerCase().includes(word))
  }

  /**
   * Queue operation for concurrent processing
   */
  private async queueOperation(
    text: string,
    useContext: boolean
  ): Promise<QuestionAnalysis | null> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push({text, resolve, reject})

      // Process queue if it gets too long
      if (this.operationQueue.length > 10) {
        this.processOperationQueue()
      }
    })
  }

  /**
   * Process queued operations
   */
  private processOperationQueue(): void {
    if (
      this.operationQueue.length === 0 ||
      this.activeOperations >= this.config.maxConcurrentOperations
    ) {
      return
    }

    const operation = this.operationQueue.shift()
    if (operation) {
      this.detectQuestion(operation.text, false).then(operation.resolve).catch(operation.reject)
    }
  }

  /**
   * Adapt performance thresholds based on actual performance
   */
  private adaptPerformanceThresholds(actualTime: number): void {
    if (!this.config.enableAdaptiveThresholds) return

    const targetTime = this.performanceTargets.processingTime
    const tolerance = targetTime * 0.2 // 20% tolerance

    if (actualTime > targetTime + tolerance) {
      // Performance is slower than target, adapt thresholds
      this.config.confidenceThreshold = Math.min(0.9, this.config.confidenceThreshold + 0.05)
      this.config.fastPathThreshold = Math.min(0.95, this.config.fastPathThreshold + 0.02)
      this.metrics.adaptiveAdjustments++

      logger.debug('Adapted performance thresholds', {
        actualTime: actualTime.toFixed(2),
        targetTime: targetTime.toFixed(2),
        newConfidenceThreshold: this.config.confidenceThreshold,
        newFastPathThreshold: this.config.fastPathThreshold
      })
    } else if (actualTime < targetTime - tolerance && this.metrics.totalAnalyzed > 100) {
      // Performance is better than target, we can relax thresholds for better accuracy
      this.config.confidenceThreshold = Math.max(0.5, this.config.confidenceThreshold - 0.02)
      this.config.fastPathThreshold = Math.max(0.8, this.config.fastPathThreshold - 0.01)
    }
  }

  /**
   * Cache result with optimization
   */
  private cacheOptimizedResult(key: string, analysis: QuestionAnalysis): void {
    this.cache.set(key, analysis)

    // Update memory usage approximation
    this.metrics.memoryUsageBytes = this.cache.size * 500 // Rough estimate
  }

  /**
   * Update optimized context
   */
  private updateOptimizedContext(text: string, analysis: QuestionAnalysis): void {
    this.context.previousQuestions.push(text)

    // Keep only recent questions for memory efficiency
    if (this.context.previousQuestions.length > 5) {
      this.context.previousQuestions = this.context.previousQuestions.slice(-5)
    }

    // Update entities efficiently
    analysis.entities.forEach(entity => {
      if (
        !this.context.relatedEntities.find(e => e.text === entity.text && e.type === entity.type)
      ) {
        this.context.relatedEntities.push(entity)
      }
    })

    // Limit entity context size
    if (this.context.relatedEntities.length > 20) {
      this.context.relatedEntities = this.context.relatedEntities.slice(-20)
    }
  }

  /**
   * Optimized context analysis
   */
  private analyzeOptimizedContext(text: string): {confidence: number; isQuestion: boolean} {
    const recentQuestions = this.context.previousQuestions.slice(-2)
    let confidence = 0

    if (recentQuestions.length >= 1) {
      confidence += 0.1
    }

    const followUpIndicators = ['also', 'and', 'but', 'however', 'additionally']
    if (followUpIndicators.some(indicator => text.toLowerCase().includes(indicator))) {
      confidence += 0.2
    }

    return {confidence, isQuestion: confidence > 0.2}
  }

  /**
   * Optimized intent detection
   */
  private optimizedIntentDetection(
    text: string,
    type: QuestionType,
    entities: Entity[]
  ): QuestionIntent {
    const words = text.toLowerCase()

    let primary: QuestionIntent['primary'] = 'information_seeking'
    if (
      ['confirmatory'].includes(type) ||
      ['right', 'correct', 'true'].some(w => words.includes(w))
    ) {
      primary = 'confirmation'
    } else if (words.includes('how') && ['do', 'make', 'create'].some(w => words.includes(w))) {
      primary = 'instruction'
    } else if (['opinion', 'think', 'believe', 'feel'].some(w => words.includes(w))) {
      primary = 'opinion'
    } else if (['explain', 'clarify', 'mean'].some(w => words.includes(w))) {
      primary = 'clarification'
    }

    let urgency: QuestionIntent['urgency'] = 'medium'
    if (['urgent', 'quickly', 'now', 'immediately', 'asap'].some(w => words.includes(w))) {
      urgency = 'high'
    } else if (
      ['sometime', 'eventually', 'later', 'when you can'].some(phrase => words.includes(phrase))
    ) {
      urgency = 'low'
    }

    let scope: QuestionIntent['scope'] = 'general'
    if (
      entities.length > 0 ||
      ['specific', 'exactly', 'precisely', 'particular'].some(w => words.includes(w))
    ) {
      scope = 'specific'
    } else if (
      ['context', 'situation', 'case', 'regarding', 'about'].some(w => words.includes(w))
    ) {
      scope = 'contextual'
    }

    return {primary, urgency, scope}
  }

  /**
   * Optimized complexity assessment
   */
  private optimizedComplexityAssessment(
    text: string,
    patterns: DetectedPattern[],
    entities: Entity[]
  ): 'simple' | 'moderate' | 'complex' {
    const words = text.split(/\s+/).length
    const sentences = (text.match(/[.!?]+/g) || []).length
    const conjunctions = (
      text.match(/\b(and|or|but|however|moreover|furthermore|additionally)\b/gi) || []
    ).length

    let score = 0
    if (words > 15) score += 1
    if (sentences > 1) score += 1
    if (conjunctions > 0) score += conjunctions
    if (entities.length > 2) score += 1
    if (patterns.length > 2) score += 1

    if (score >= 4) return 'complex'
    if (score >= 2) return 'moderate'
    return 'simple'
  }

  /**
   * Optimized context requirement assessment
   */
  private optimizedContextRequirement(text: string, type: QuestionType): boolean {
    const contextWords = [
      'this',
      'that',
      'it',
      'they',
      'them',
      'here',
      'there',
      'above',
      'below',
      'previous',
      'earlier',
      'mentioned'
    ]
    const hasContextWords = contextWords.some(word => text.toLowerCase().includes(word))

    return hasContextWords || ['comparative', 'complex'].includes(type)
  }

  /**
   * Optimized subtype classification
   */
  private optimizedSubtypeClassification(
    text: string,
    type: QuestionType,
    entities: Entity[]
  ): string {
    const words = text.toLowerCase()

    switch (type) {
      case 'factual':
        if (entities.some(e => e.type === 'person')) return 'biographical'
        if (entities.some(e => e.type === 'location')) return 'geographical'
        if (entities.some(e => e.type === 'time')) return 'temporal'
        if (entities.some(e => e.type === 'number')) return 'quantitative'
        return 'general_factual'

      case 'procedural':
        if (['install', 'setup', 'configure'].some(w => words.includes(w))) return 'installation'
        if (['fix', 'repair', 'troubleshoot', 'debug'].some(w => words.includes(w)))
          return 'troubleshooting'
        if (['make', 'create', 'build', 'construct'].some(w => words.includes(w))) return 'creation'
        return 'general_procedural'

      case 'causal':
        if (['happen', 'occur', 'take place'].some(w => words.includes(w))) return 'event_causation'
        if (['work', 'function', 'operate'].some(w => words.includes(w)))
          return 'functional_causation'
        return 'general_causation'

      case 'comparative':
        if (['better', 'best', 'superior', 'worse', 'worst'].some(w => words.includes(w)))
          return 'qualitative_comparison'
        if (['difference', 'differ', 'distinguish'].some(w => words.includes(w)))
          return 'differential_comparison'
        return 'general_comparison'

      default:
        return 'standard'
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(processingTime: number, confidence: number): void {
    this.metrics.totalAnalyzed++

    // Update running averages
    const alpha = 0.1 // smoothing factor
    this.metrics.averageProcessingTime =
      alpha * processingTime + (1 - alpha) * this.metrics.averageProcessingTime
    this.metrics.averageConfidence =
      alpha * confidence + (1 - alpha) * this.metrics.averageConfidence
  }

  /**
   * Get enhanced performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return {...this.metrics}
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    averageProcessingTime: number
    cacheHitRate: number
    fastPathHitRate: number
    throughputPerSecond: number
    memoryUsageKB: number
    adaptiveAdjustments: number
  } {
    const cacheHitRate =
      this.metrics.totalAnalyzed > 0 ? this.metrics.cacheHits / this.metrics.totalAnalyzed : 0
    const fastPathHitRate =
      this.metrics.totalAnalyzed > 0 ? this.metrics.fastPathHits / this.metrics.totalAnalyzed : 0
    const throughputPerSecond =
      this.metrics.averageProcessingTime > 0 ? 1000 / this.metrics.averageProcessingTime : 0

    return {
      averageProcessingTime: this.metrics.averageProcessingTime,
      cacheHitRate,
      fastPathHitRate,
      throughputPerSecond,
      memoryUsageKB: this.metrics.memoryUsageBytes / 1024,
      adaptiveAdjustments: this.metrics.adaptiveAdjustments
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    size: number
    hitRate: number
    compressionRatio: number
    memoryUsage: number
  } {
    return {
      size: this.cache.size,
      hitRate:
        this.metrics.totalAnalyzed > 0 ? this.metrics.cacheHits / this.metrics.totalAnalyzed : 0,
      compressionRatio: this.metrics.cacheCompressionRatio,
      memoryUsage: this.metrics.memoryUsageBytes
    }
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalAnalyzed: 0,
      questionsDetected: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      patternMatchHits: 0,
      semanticAnalysisHits: 0,
      cacheHits: 0,
      errorCount: 0,
      fastPathHits: 0,
      concurrentOperations: 0,
      memoryUsageBytes: 0,
      adaptiveAdjustments: 0,
      patternMatchTime: 0,
      semanticAnalysisTime: 0,
      cacheCompressionRatio: 0
    }
  }

  /**
   * Update configuration with performance considerations
   */
  updateConfig(newConfig: Partial<OptimizedQuestionDetectionConfig>): void {
    const oldConfig = {...this.config}
    this.config = {...this.config, ...newConfig}

    // Clear cache if relevant settings changed
    if (
      newConfig.cacheSize !== undefined ||
      newConfig.enableCaching !== undefined ||
      newConfig.cacheCompressionEnabled !== undefined
    ) {
      this.cache.clear()
    }

    // Reinitialize patterns if pattern settings changed
    if (
      newConfig.enablePatternMatching !== undefined ||
      newConfig.fastPathThreshold !== undefined
    ) {
      this.initializeOptimizedPatterns()
    }

    logger.info('OptimizedQuestionDetector configuration updated', {
      performanceTarget: this.config.performanceTargetMs,
      enableFastPath: this.config.enableFastPath,
      cacheSize: this.config.cacheSize
    })

    this.emit('config_updated', this.config)
  }

  /**
   * Destroy and cleanup with optimization
   */
  destroy(): void {
    // Clear all caches
    this.cache.clear()
    this.entityCache.clear()

    // Clear text buffers
    this.textBuffers.clear()

    // Clear operation queue
    this.operationQueue.forEach(op => op.reject(new Error('Detector destroyed')))
    this.operationQueue = []

    // Clear context
    this.context.previousQuestions = []
    this.context.conversationHistory = []
    this.context.relatedEntities = []

    // Remove all listeners
    this.removeAllListeners()

    this.isInitialized = false

    logger.info('OptimizedQuestionDetector destroyed')
  }
}

export default OptimizedQuestionDetector
