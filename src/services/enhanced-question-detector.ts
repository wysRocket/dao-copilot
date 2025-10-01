/**
 * Advanced Intent Classification Integration Layer
 *
 * This integration layer seamlessly incorporates the Advanced Intent Classification System
 * into the existing transcription pipeline while maintaining full backward compatibility
 * with the current QuestionDetector interface.
 *
 * Features:
 * - Drop-in replacement for QuestionDetector with enhanced capabilities
 * - Backward compatibility with existing TranscriptionQuestionPipeline
 * - Advanced NLP-based intent classification with confidence scoring
 * - Context-aware resolution using conversation history
 * - Multi-intent detection and embedded question recognition
 * - Performance optimization with caching and batching
 * - Comprehensive error handling and fallback mechanisms
 * - Real-time processing with <50ms target latency
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

// Import our advanced components
import {
  AdvancedIntentClassifier,
  IntentClassificationResult,
  AdvancedClassificationConfig
} from './advanced-intent-classifier'
import {TrainingDataManager, TrainingDataConfig} from './training-data-manager'
import {ContextManager, ContextManagerConfig} from './context-manager'

// Import interfaces from existing system for compatibility
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

/**
 * Enhanced configuration that extends the original while adding new capabilities
 */
export interface EnhancedQuestionDetectionConfig extends QuestionDetectionConfig {
  // Advanced classification settings
  enableAdvancedClassification: boolean
  enableMultiIntentDetection: boolean
  enableContextAwareResolution: boolean

  // Training data management
  enableContinuousLearning: boolean
  trainingDataConfig?: Partial<TrainingDataConfig>

  // Context management
  contextManagerConfig?: Partial<ContextManagerConfig>

  // Performance and reliability
  enableFallbackMode: boolean
  fallbackThreshold: number
  maxRetryAttempts: number

  // Integration settings
  logPerformanceMetrics: boolean
  enableDetailedAnalytics: boolean
}

/**
 * Enhanced question analysis that extends the original with advanced capabilities
 */
export interface EnhancedQuestionAnalysis extends QuestionAnalysis {
  // Advanced classification results
  multiIntents?: IntentClassificationResult[]
  embeddedQuestions?: string[]
  contextScore?: number
  originalIntentConfidence?: number

  // Processing information
  processingPath: 'advanced' | 'fallback' | 'hybrid'
  advancedFeatures: {
    contextResolution: boolean
    multiIntentDetection: boolean
    embeddedQuestionDetection: boolean
  }

  // Performance metrics
  performanceMetrics?: {
    classificationTime: number
    contextResolutionTime: number
    totalProcessingTime: number
  }
}

/**
 * Enhanced detection metrics with advanced system tracking
 */
export interface EnhancedDetectionMetrics extends DetectionMetrics {
  // Advanced system metrics
  advancedClassifications: number
  fallbackClassifications: number
  contextResolutions: number
  multiIntentDetections: number
  embeddedQuestionDetections: number

  // Performance metrics
  averageAdvancedProcessingTime: number
  averageFallbackProcessingTime: number
  cacheEfficiencyRate: number

  // Quality metrics
  confidenceDistribution: {
    high: number // > 0.8
    medium: number // 0.6 - 0.8
    low: number // < 0.6
  }
}

/**
 * Enhanced Question Detector with Advanced Intent Classification
 *
 * This class provides a drop-in replacement for the original QuestionDetector
 * while adding advanced NLP-based intent classification capabilities.
 * It maintains full API compatibility for seamless integration.
 */
export class EnhancedQuestionDetector extends EventEmitter {
  private config: EnhancedQuestionDetectionConfig
  private metrics: EnhancedDetectionMetrics
  private cache: Map<string, EnhancedQuestionAnalysis>
  private context: QuestionContext
  private isInitialized = false

  // Advanced components
  private advancedClassifier: AdvancedIntentClassifier | null = null
  private trainingDataManager: TrainingDataManager | null = null
  private contextManager: ContextManager | null = null

  // Fallback system (original QuestionDetector functionality)
  private fallbackPatterns: Map<string, {weight: number; type: QuestionType}>
  private auxiliaryPatterns: Map<string, {weight: number; type: QuestionType}>
  private questionIndicators: Set<string>

  // Performance tracking
  private performanceTimer: Map<string, number> = new Map()
  private batchQueue: string[] = []
  private processingTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<EnhancedQuestionDetectionConfig> = {}) {
    super()

    // Initialize with backward-compatible defaults plus new features
    this.config = {
      // Original config options
      confidenceThreshold: 0.7,
      minQuestionLength: 3,
      maxAnalysisDelay: 50,
      enablePatternMatching: true,
      enableSemanticAnalysis: true,
      enableContextAnalysis: true,
      enableQuestionClassification: true,
      classificationDepth: 'detailed',
      enableCaching: true,
      cacheSize: 1000,
      enableBatching: false,
      batchSize: 5,

      // Enhanced config options
      enableAdvancedClassification: true,
      enableMultiIntentDetection: true,
      enableContextAwareResolution: true,
      enableContinuousLearning: false, // Disabled by default for stability
      enableFallbackMode: true,
      fallbackThreshold: 0.5,
      maxRetryAttempts: 2,
      logPerformanceMetrics: true,
      enableDetailedAnalytics: false,

      // Sub-component configs
      trainingDataConfig: {
        enableDataCollection: false,
        datasetSize: 1000,
        enableAugmentation: true,
        augmentationStrength: 'medium'
      },

      contextManagerConfig: {
        maxContextWindow: 10,
        enableFollowUpDetection: true,
        enableEntityTracking: true,
        contextDecayFactor: 0.9
      },

      ...config
    }

    // Initialize enhanced metrics
    this.metrics = {
      // Original metrics
      totalAnalyzed: 0,
      questionsDetected: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      patternMatchHits: 0,
      semanticAnalysisHits: 0,
      cacheHits: 0,
      errorCount: 0,

      // Enhanced metrics
      advancedClassifications: 0,
      fallbackClassifications: 0,
      contextResolutions: 0,
      multiIntentDetections: 0,
      embeddedQuestionDetections: 0,
      averageAdvancedProcessingTime: 0,
      averageFallbackProcessingTime: 0,
      cacheEfficiencyRate: 0,
      confidenceDistribution: {high: 0, medium: 0, low: 0}
    }

    this.cache = new Map()
    this.context = {
      previousQuestions: [],
      conversationHistory: [],
      relatedEntities: []
    }

    // Initialize fallback patterns
    this.fallbackPatterns = new Map()
    this.auxiliaryPatterns = new Map()
    this.questionIndicators = new Set()

    logger.info('EnhancedQuestionDetector initialized with advanced capabilities', {
      enableAdvancedClassification: this.config.enableAdvancedClassification,
      enableContextAwareResolution: this.config.enableContextAwareResolution,
      enableFallbackMode: this.config.enableFallbackMode
    })
  }

  /**
   * Initialize the enhanced question detector
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.debug('EnhancedQuestionDetector already initialized')
        return
      }

      const initStartTime = performance.now()

      // Initialize fallback patterns first (fast)
      this.initializeFallbackPatterns()

      // Initialize advanced components in parallel where possible
      const initPromises: Promise<void>[] = []

      // Initialize Advanced Intent Classifier
      if (this.config.enableAdvancedClassification) {
        this.advancedClassifier = new AdvancedIntentClassifier({
          confidenceThreshold: this.config.confidenceThreshold,
          enableCaching: this.config.enableCaching,
          cacheSize: this.config.cacheSize,
          enableMultiIntentDetection: this.config.enableMultiIntentDetection,
          maxProcessingTime: this.config.maxAnalysisDelay
        })

        initPromises.push(this.advancedClassifier.initialize())
      }

      // Initialize Context Manager
      if (this.config.enableContextAwareResolution) {
        this.contextManager = new ContextManager(this.config.contextManagerConfig || {})
        initPromises.push(this.contextManager.initialize())
      }

      // Initialize Training Data Manager (if continuous learning is enabled)
      if (this.config.enableContinuousLearning) {
        this.trainingDataManager = new TrainingDataManager(this.config.trainingDataConfig || {})
        initPromises.push(this.trainingDataManager.initialize())
      }

      // Wait for all components to initialize
      await Promise.all(initPromises)

      // Set up event listeners for advanced components
      this.setupAdvancedEventListeners()

      this.isInitialized = true

      const initTime = performance.now() - initStartTime

      logger.info('EnhancedQuestionDetector initialization complete', {
        initializationTime: `${initTime.toFixed(2)}ms`,
        advancedClassifier: !!this.advancedClassifier,
        contextManager: !!this.contextManager,
        trainingDataManager: !!this.trainingDataManager
      })

      this.emit('initialized', {initializationTime: initTime})
    } catch (error) {
      logger.error('Failed to initialize EnhancedQuestionDetector', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // If advanced initialization fails, ensure fallback mode is available
      if (!this.config.enableFallbackMode) {
        throw error
      }

      logger.warn('Advanced initialization failed, falling back to basic mode')
      this.isInitialized = true
      this.emit('initialized', {fallbackMode: true})
    }
  }

  /**
   * Main detection method - maintains compatibility with original QuestionDetector
   */
  async detectQuestion(text: string, useContext = false): Promise<EnhancedQuestionAnalysis | null> {
    if (!this.isInitialized) {
      throw new Error('EnhancedQuestionDetector must be initialized before use')
    }

    if (!text || text.trim().length < this.config.minQuestionLength) {
      return null
    }

    const startTime = performance.now()
    const conversationId = 'transcription-pipeline' // Default conversation ID

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(text)
      if (this.config.enableCaching && this.cache.has(cacheKey)) {
        this.metrics.cacheHits++
        const cachedResult = this.cache.get(cacheKey)!
        this.updateMetrics(performance.now() - startTime, cachedResult.confidence, 'cache')
        return cachedResult
      }

      let analysis: EnhancedQuestionAnalysis | null = null

      // Try advanced classification first
      if (this.config.enableAdvancedClassification && this.advancedClassifier) {
        try {
          analysis = await this.performAdvancedClassification(text, useContext, conversationId)

          if (analysis && analysis.confidence >= this.config.confidenceThreshold) {
            this.metrics.advancedClassifications++
            analysis.processingPath = 'advanced'
          } else if (
            this.config.enableFallbackMode &&
            analysis &&
            analysis.confidence >= this.config.fallbackThreshold
          ) {
            // Hybrid approach: enhance fallback with advanced insights
            const fallbackAnalysis = await this.performFallbackClassification(text)
            if (fallbackAnalysis) {
              analysis = this.combineClassificationResults(analysis, fallbackAnalysis)
              analysis.processingPath = 'hybrid'
            }
          } else {
            analysis = null // Below fallback threshold
          }
        } catch (advancedError) {
          logger.warn('Advanced classification failed, falling back to basic detection', {
            error: advancedError instanceof Error ? advancedError.message : 'Unknown error',
            text: sanitizeLogMessage(text)
          })

          if (this.config.enableFallbackMode) {
            analysis = await this.performFallbackClassification(text)
            if (analysis) {
              analysis.processingPath = 'fallback'
            }
          }
        }
      } else {
        // Use fallback classification only
        analysis = await this.performFallbackClassification(text)
        if (analysis) {
          analysis.processingPath = 'fallback'
        }
      }

      // Cache successful results
      if (this.config.enableCaching && analysis) {
        this.cacheResult(cacheKey, analysis)
      }

      // Update context if question detected
      if (analysis && analysis.isQuestion) {
        this.updateContext(text, analysis)
      }

      // Update metrics
      const processingTime = performance.now() - startTime
      this.updateMetrics(
        processingTime,
        analysis?.confidence || 0,
        analysis?.processingPath || 'none'
      )

      // Collect training data if enabled
      if (this.config.enableContinuousLearning && this.trainingDataManager && analysis) {
        await this.collectTrainingData(text, analysis)
      }

      // Emit events for monitoring
      this.emit('question_analyzed', {
        text: sanitizeLogMessage(text),
        analysis,
        processingTime,
        processingPath: analysis?.processingPath || 'none'
      })

      return analysis
    } catch (error) {
      this.metrics.errorCount++
      logger.error('Error in question detection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        text: sanitizeLogMessage(text)
      })

      return null
    }
  }

  /**
   * Perform advanced classification using the AdvancedIntentClassifier and ContextManager
   */
  private async performAdvancedClassification(
    text: string,
    useContext: boolean,
    conversationId: string
  ): Promise<EnhancedQuestionAnalysis | null> {
    if (!this.advancedClassifier) {
      throw new Error('Advanced classifier not available')
    }

    const classificationStart = performance.now()

    // Get initial classification
    const classificationResult = await this.advancedClassifier.classifyIntent(text)

    if (!classificationResult.isQuestion) {
      return null
    }

    const classificationTime = performance.now() - classificationStart
    let contextResolutionTime = 0
    let contextScore = 0

    // Apply context-aware resolution if enabled and requested
    if (useContext && this.config.enableContextAwareResolution && this.contextManager) {
      const contextStart = performance.now()

      try {
        const contextResolution = await this.contextManager.resolveIntentWithContext(
          conversationId,
          text,
          classificationResult.primaryIntent.intent,
          classificationResult.primaryIntent.confidence,
          classificationResult.entities
        )

        // Update classification with context-enhanced results
        classificationResult.primaryIntent.intent = contextResolution.resolvedIntent
        classificationResult.primaryIntent.confidence = Math.max(
          classificationResult.primaryIntent.confidence,
          contextResolution.confidence
        )

        contextScore = contextResolution.contextScore || 0

        if (contextResolution.isFollowUp) {
          this.metrics.contextResolutions++
        }
      } catch (contextError) {
        logger.debug('Context resolution failed, continuing without context', {
          error: contextError instanceof Error ? contextError.message : 'Unknown error'
        })
      }

      contextResolutionTime = performance.now() - contextStart
    }

    // Convert to enhanced analysis format
    const analysis: EnhancedQuestionAnalysis = {
      isQuestion: true,
      confidence: classificationResult.primaryIntent.confidence,
      questionType: this.mapIntentToQuestionType(classificationResult.primaryIntent.intent),
      subType: classificationResult.primaryIntent.intent,
      patterns: this.convertPatternsToDetectedPatterns(classificationResult.matchedPatterns),
      entities: this.convertEntitiesToLegacyFormat(classificationResult.entities),
      intent: this.convertToQuestionIntent(classificationResult.primaryIntent),
      complexity: classificationResult.complexity,
      requiresContext: classificationResult.requiresContext,
      timestamp: Date.now(),

      // Enhanced properties
      multiIntents:
        classificationResult.multipleIntents?.length > 1
          ? classificationResult.multipleIntents
          : undefined,
      embeddedQuestions:
        classificationResult.embeddedQuestions?.length > 0
          ? classificationResult.embeddedQuestions
          : undefined,
      contextScore,
      originalIntentConfidence: classificationResult.primaryIntent.confidence,
      processingPath: 'advanced',

      advancedFeatures: {
        contextResolution: contextScore > 0,
        multiIntentDetection: (classificationResult.multipleIntents?.length || 0) > 1,
        embeddedQuestionDetection: (classificationResult.embeddedQuestions?.length || 0) > 0
      },

      performanceMetrics: {
        classificationTime,
        contextResolutionTime,
        totalProcessingTime: classificationTime + contextResolutionTime
      }
    }

    // Update metrics for advanced features
    if (analysis.multiIntents && analysis.multiIntents.length > 1) {
      this.metrics.multiIntentDetections++
    }

    if (analysis.embeddedQuestions && analysis.embeddedQuestions.length > 0) {
      this.metrics.embeddedQuestionDetections++
    }

    return analysis
  }

  /**
   * Perform fallback classification using traditional patterns
   */
  private async performFallbackClassification(
    text: string
  ): Promise<EnhancedQuestionAnalysis | null> {
    const cleanText = this.preprocessText(text)
    const patterns: DetectedPattern[] = []
    const entities: Entity[] = []

    let confidence = 0
    let questionType: QuestionType = 'conversational'

    // Pattern-based detection (from original implementation)
    const patternResults = this.detectPatterns(cleanText)
    patterns.push(...patternResults.patterns)
    confidence = Math.max(confidence, patternResults.confidence)

    if (patternResults.confidence > this.config.confidenceThreshold) {
      questionType = patternResults.type
      this.metrics.patternMatchHits++
    }

    // Simple semantic analysis
    if (this.config.enableSemanticAnalysis) {
      const semanticResults = this.performSemanticAnalysis(cleanText)
      confidence = Math.max(confidence, semanticResults.confidence)
      entities.push(...semanticResults.entities)

      if (semanticResults.confidence > this.config.confidenceThreshold) {
        if (semanticResults.type !== 'conversational') {
          questionType = semanticResults.type
        }
        this.metrics.semanticAnalysisHits++
      }
    }

    if (confidence < this.config.confidenceThreshold) {
      return null
    }

    this.metrics.fallbackClassifications++

    return {
      isQuestion: true,
      confidence,
      questionType,
      patterns,
      entities,
      intent: this.determineIntent(cleanText, questionType, entities),
      complexity: this.determineComplexity(cleanText, patterns, entities),
      requiresContext: this.requiresContext(cleanText, questionType),
      timestamp: Date.now(),
      processingPath: 'fallback',
      advancedFeatures: {
        contextResolution: false,
        multiIntentDetection: false,
        embeddedQuestionDetection: false
      }
    }
  }

  /**
   * Combine advanced and fallback classification results
   */
  private combineClassificationResults(
    advanced: EnhancedQuestionAnalysis,
    fallback: EnhancedQuestionAnalysis
  ): EnhancedQuestionAnalysis {
    return {
      ...advanced,
      confidence: Math.max(advanced.confidence, fallback.confidence),
      patterns: [...(advanced.patterns || []), ...(fallback.patterns || [])],
      entities: [...(advanced.entities || []), ...(fallback.entities || [])],
      processingPath: 'hybrid'
    }
  }

  /**
   * Set up event listeners for advanced components
   */
  private setupAdvancedEventListeners(): void {
    if (this.advancedClassifier) {
      this.advancedClassifier.on('classification_complete', data => {
        this.emit('advanced_classification', data)
      })

      this.advancedClassifier.on('performance_warning', data => {
        logger.warn('Advanced classifier performance warning', data)
      })
    }

    if (this.contextManager) {
      this.contextManager.on('context_updated', data => {
        this.emit('context_updated', data)
      })

      this.contextManager.on('follow_up_detected', data => {
        this.emit('follow_up_detected', data)
      })
    }

    if (this.trainingDataManager) {
      this.trainingDataManager.on('training_data_collected', data => {
        this.emit('training_data_collected', data)
      })
    }
  }

  /**
   * Collect training data for continuous learning
   */
  private async collectTrainingData(
    text: string,
    analysis: EnhancedQuestionAnalysis
  ): Promise<void> {
    if (!this.trainingDataManager) return

    try {
      await this.trainingDataManager.addTrainingExample({
        text,
        intent: analysis.subType || analysis.questionType,
        confidence: analysis.confidence,
        entities: analysis.entities?.map(e => ({type: e.type, value: e.text})) || [],
        context: {
          isFollowUp: analysis.contextScore ? analysis.contextScore > 0 : false,
          previousQuestions: this.context.previousQuestions.slice(-3)
        }
      })
    } catch (error) {
      logger.debug('Failed to collect training data', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Utility methods for format conversion

  private mapIntentToQuestionType(intent: string): QuestionType {
    const intentMap: Record<string, QuestionType> = {
      information_seeking: 'factual',
      instruction_request: 'procedural',
      explanation_request: 'causal',
      clarification_request: 'conversational',
      confirmation_seeking: 'confirmatory',
      comparison_request: 'comparative',
      troubleshooting: 'procedural',
      opinion_request: 'conversational',
      definition_request: 'factual',
      example_request: 'procedural',
      status_inquiry: 'factual',
      multiple_intents: 'complex'
    }

    return intentMap[intent] || 'conversational'
  }

  private convertPatternsToDetectedPatterns(patterns: string[]): DetectedPattern[] {
    return patterns.map((pattern, index) => ({
      type: 'interrogative' as const,
      pattern,
      position: index,
      confidence: 0.8,
      weight: 0.8
    }))
  }

  private convertEntitiesToLegacyFormat(
    entities: Array<{type: string; value: string; confidence: number}>
  ): Entity[] {
    return entities.map((entity, index) => ({
      text: entity.value,
      type: entity.type as Entity['type'],
      position: index,
      confidence: entity.confidence
    }))
  }

  private convertToQuestionIntent(intent: {intent: string; confidence: number}): QuestionIntent {
    const primaryMap: Record<string, QuestionIntent['primary']> = {
      information_seeking: 'information_seeking',
      clarification_request: 'clarification',
      confirmation_seeking: 'confirmation',
      instruction_request: 'instruction',
      opinion_request: 'opinion'
    }

    return {
      primary: primaryMap[intent.intent] || 'information_seeking',
      urgency: 'medium',
      scope: 'general'
    }
  }

  // Fallback methods (from original QuestionDetector)

  private initializeFallbackPatterns(): void {
    // Interrogative patterns
    const interrogatives = [
      {pattern: 'who', weight: 1.0, type: 'factual' as QuestionType},
      {pattern: 'what', weight: 1.0, type: 'factual' as QuestionType},
      {pattern: 'when', weight: 1.0, type: 'factual' as QuestionType},
      {pattern: 'where', weight: 1.0, type: 'factual' as QuestionType},
      {pattern: 'why', weight: 1.0, type: 'causal' as QuestionType},
      {pattern: 'how', weight: 1.0, type: 'procedural' as QuestionType},
      {pattern: 'which', weight: 0.9, type: 'comparative' as QuestionType}
    ]

    interrogatives.forEach(({pattern, weight, type}) => {
      this.fallbackPatterns.set(pattern, {weight, type})
    })

    // Auxiliary patterns
    const auxiliaries = [
      {pattern: 'do', weight: 0.8, type: 'confirmatory' as QuestionType},
      {pattern: 'does', weight: 0.8, type: 'confirmatory' as QuestionType},
      {pattern: 'can', weight: 0.9, type: 'confirmatory' as QuestionType},
      {pattern: 'could', weight: 0.9, type: 'hypothetical' as QuestionType},
      {pattern: 'will', weight: 0.8, type: 'confirmatory' as QuestionType},
      {pattern: 'would', weight: 0.9, type: 'hypothetical' as QuestionType},
      {pattern: 'is', weight: 0.7, type: 'confirmatory' as QuestionType},
      {pattern: 'are', weight: 0.7, type: 'confirmatory' as QuestionType}
    ]

    auxiliaries.forEach(({pattern, weight, type}) => {
      this.auxiliaryPatterns.set(pattern, {weight, type})
    })
  }

  private detectPatterns(text: string): {
    patterns: DetectedPattern[]
    confidence: number
    type: QuestionType
  } {
    const patterns: DetectedPattern[] = []
    let maxConfidence = 0
    let dominantType: QuestionType = 'conversational'

    const words = text.toLowerCase().split(/\\s+/)
    const firstWord = words[0]
    const lastChar = text.trim().slice(-1)

    // Check for question mark
    if (lastChar === '?') {
      patterns.push({
        type: 'interrogative',
        pattern: '?',
        position: text.length - 1,
        confidence: 0.95,
        weight: 1.0
      })
      maxConfidence = 0.95
    }

    // Check interrogative words
    const interrogativeInfo = this.fallbackPatterns.get(firstWord)
    if (interrogativeInfo) {
      patterns.push({
        type: 'interrogative',
        pattern: firstWord,
        position: 0,
        confidence: 0.9 * interrogativeInfo.weight,
        weight: interrogativeInfo.weight
      })
      maxConfidence = Math.max(maxConfidence, 0.9 * interrogativeInfo.weight)
      dominantType = interrogativeInfo.type
    }

    // Check auxiliary verbs
    const auxiliaryInfo = this.auxiliaryPatterns.get(firstWord)
    if (auxiliaryInfo) {
      patterns.push({
        type: 'auxiliary',
        pattern: firstWord,
        position: 0,
        confidence: 0.85 * auxiliaryInfo.weight,
        weight: auxiliaryInfo.weight
      })
      maxConfidence = Math.max(maxConfidence, 0.85 * auxiliaryInfo.weight)
      if (dominantType === 'conversational') {
        dominantType = auxiliaryInfo.type
      }
    }

    return {patterns, confidence: maxConfidence, type: dominantType}
  }

  private performSemanticAnalysis(text: string): {
    confidence: number
    type: QuestionType
    entities: Entity[]
  } {
    const entities = this.extractEntities(text)

    let confidence = 0
    let type: QuestionType = 'conversational'

    const proceduralKeywords = ['how', 'steps', 'process', 'method', 'way']
    const causalKeywords = ['why', 'because', 'reason', 'cause']
    const comparativeKeywords = ['better', 'worse', 'compare', 'which', 'best']

    if (proceduralKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
      confidence += 0.3
      type = 'procedural'
    }

    if (causalKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
      confidence += 0.3
      type = 'causal'
    }

    if (comparativeKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
      confidence += 0.3
      type = 'comparative'
    }

    confidence += entities.length * 0.1

    return {confidence: Math.min(confidence, 1.0), type, entities}
  }

  private extractEntities(text: string): Entity[] {
    const entities: Entity[] = []

    const patterns = {
      time: /\\b(\\d{1,2}:\\d{2}|today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b/gi,
      number: /\\b\\d+(\\.\\d+)?\\b/g
    }

    Object.entries(patterns).forEach(([type, pattern]) => {
      let match
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type: type as Entity['type'],
          position: match.index,
          confidence: 0.7
        })
      }
    })

    return entities
  }

  private determineIntent(text: string, type: QuestionType, entities: Entity[]): QuestionIntent {
    const words = text.toLowerCase()

    let primary: QuestionIntent['primary'] = 'information_seeking'

    if (['confirmatory'].includes(type) || words.includes('right') || words.includes('correct')) {
      primary = 'confirmation'
    } else if (words.includes('how') && (words.includes('do') || words.includes('make'))) {
      primary = 'instruction'
    }

    return {
      primary,
      urgency: 'medium',
      scope: entities.length > 0 ? 'specific' : 'general'
    }
  }

  private determineComplexity(
    text: string,
    patterns: DetectedPattern[],
    entities: Entity[]
  ): 'simple' | 'moderate' | 'complex' {
    const words = text.split(/\\s+/).length
    const sentences = text.split(/[.!?]+/).length

    let score = 0
    if (words > 15) score += 1
    if (sentences > 1) score += 1
    if (entities.length > 2) score += 1
    if (patterns.length > 2) score += 1

    return score >= 3 ? 'complex' : score >= 2 ? 'moderate' : 'simple'
  }

  private requiresContext(text: string, type: QuestionType): boolean {
    const contextIndicators = ['this', 'that', 'it', 'they', 'them']
    return (
      contextIndicators.some(indicator => text.toLowerCase().includes(indicator)) ||
      ['comparative', 'complex'].includes(type)
    )
  }

  private preprocessText(text: string): string {
    return text
      .trim()
      .replace(/\\s+/g, ' ')
      .replace(/[^\\w\\s?!.,;:]/g, '')
  }

  // Cache and context management methods

  private generateCacheKey(text: string): string {
    return Buffer.from(text.toLowerCase().trim()).toString('base64').slice(0, 32)
  }

  private cacheResult(key: string, analysis: EnhancedQuestionAnalysis): void {
    if (this.cache.size >= this.config.cacheSize) {
      const oldestKeys = Array.from(this.cache.keys()).slice(
        0,
        Math.floor(this.config.cacheSize * 0.2)
      )
      oldestKeys.forEach(k => this.cache.delete(k))
    }

    this.cache.set(key, analysis)
  }

  private updateContext(text: string, analysis: EnhancedQuestionAnalysis): void {
    this.context.previousQuestions.push(text)

    if (this.context.previousQuestions.length > 10) {
      this.context.previousQuestions = this.context.previousQuestions.slice(-10)
    }

    if (analysis.entities) {
      analysis.entities.forEach(entity => {
        const existing = this.context.relatedEntities.find(
          e => e.text === entity.text && e.type === entity.type
        )
        if (!existing) {
          this.context.relatedEntities.push(entity)
        }
      })
    }

    if (this.context.relatedEntities.length > 50) {
      this.context.relatedEntities = this.context.relatedEntities.slice(-50)
    }
  }

  private updateMetrics(processingTime: number, confidence: number, processingPath: string): void {
    this.metrics.totalAnalyzed++

    // Update confidence distribution
    if (confidence > 0.8) {
      this.metrics.confidenceDistribution.high++
    } else if (confidence > 0.6) {
      this.metrics.confidenceDistribution.medium++
    } else {
      this.metrics.confidenceDistribution.low++
    }

    // Update processing time averages
    const alpha = 0.1
    this.metrics.averageProcessingTime =
      alpha * processingTime + (1 - alpha) * this.metrics.averageProcessingTime
    this.metrics.averageConfidence =
      alpha * confidence + (1 - alpha) * this.metrics.averageConfidence

    // Update path-specific metrics
    if (processingPath === 'advanced') {
      this.metrics.averageAdvancedProcessingTime =
        alpha * processingTime + (1 - alpha) * this.metrics.averageAdvancedProcessingTime
    } else if (processingPath === 'fallback') {
      this.metrics.averageFallbackProcessingTime =
        alpha * processingTime + (1 - alpha) * this.metrics.averageFallbackProcessingTime
    }

    // Update cache efficiency
    if (this.cache.size > 0) {
      this.metrics.cacheEfficiencyRate = this.metrics.cacheHits / this.metrics.totalAnalyzed
    }
  }

  // Public API methods for compatibility

  /**
   * Batch process multiple texts (maintains compatibility)
   */
  async detectQuestionsBatch(texts: string[]): Promise<(EnhancedQuestionAnalysis | null)[]> {
    return Promise.all(texts.map(text => this.detectQuestion(text)))
  }

  /**
   * Update configuration (maintains compatibility)
   */
  updateConfig(newConfig: Partial<EnhancedQuestionDetectionConfig>): void {
    this.config = {...this.config, ...newConfig}

    // Update advanced components if available
    if (this.advancedClassifier && newConfig.confidenceThreshold !== undefined) {
      this.advancedClassifier.updateConfig({confidenceThreshold: newConfig.confidenceThreshold})
    }

    if (this.contextManager && newConfig.contextManagerConfig) {
      this.contextManager.updateConfig(newConfig.contextManagerConfig)
    }

    // Clear cache if cache settings changed
    if (newConfig.cacheSize !== undefined || newConfig.enableCaching !== undefined) {
      this.cache.clear()
    }

    logger.info('EnhancedQuestionDetector configuration updated')
    this.emit('config_updated', this.config)
  }

  /**
   * Get current metrics (enhanced)
   */
  getMetrics(): EnhancedDetectionMetrics {
    return {...this.metrics}
  }

  /**
   * Get current context (maintains compatibility)
   */
  getContext(): QuestionContext {
    return {
      previousQuestions: [...this.context.previousQuestions],
      conversationHistory: [...this.context.conversationHistory],
      currentTopic: this.context.currentTopic,
      relatedEntities: [...this.context.relatedEntities],
      temporalContext: this.context.temporalContext
    }
  }

  /**
   * Clear context (maintains compatibility)
   */
  clearContext(): void {
    this.context = {
      previousQuestions: [],
      conversationHistory: [],
      relatedEntities: []
    }

    // Clear advanced component contexts
    if (this.contextManager) {
      this.contextManager.clearContext?.()
    }

    if (this.advancedClassifier) {
      this.advancedClassifier.clearCache?.()
    }

    logger.info('EnhancedQuestionDetector context cleared')
    this.emit('context_cleared')
  }

  /**
   * Clear cache (maintains compatibility)
   */
  clearCache(): void {
    this.cache.clear()
    this.metrics.cacheHits = 0

    if (this.advancedClassifier) {
      this.advancedClassifier.clearCache?.()
    }

    logger.info('EnhancedQuestionDetector cache cleared')
    this.emit('cache_cleared')
  }

  /**
   * Export analysis data (enhanced)
   */
  exportAnalysisData(): {
    config: EnhancedQuestionDetectionConfig
    metrics: EnhancedDetectionMetrics
    context: QuestionContext
    advancedComponents: {
      advancedClassifier: boolean
      contextManager: boolean
      trainingDataManager: boolean
    }
  } {
    return {
      config: this.config,
      metrics: this.getMetrics(),
      context: this.getContext(),
      advancedComponents: {
        advancedClassifier: !!this.advancedClassifier,
        contextManager: !!this.contextManager,
        trainingDataManager: !!this.trainingDataManager
      }
    }
  }

  /**
   * Get system status and health information
   */
  getSystemStatus(): {
    isInitialized: boolean
    advancedModeEnabled: boolean
    fallbackModeEnabled: boolean
    activeComponents: string[]
    performanceMetrics: {
      averageProcessingTime: number
      cacheHitRate: number
      errorRate: number
      confidenceDistribution: typeof this.metrics.confidenceDistribution
    }
  } {
    const totalRequests = this.metrics.totalAnalyzed

    return {
      isInitialized: this.isInitialized,
      advancedModeEnabled: this.config.enableAdvancedClassification && !!this.advancedClassifier,
      fallbackModeEnabled: this.config.enableFallbackMode,
      activeComponents: [
        this.advancedClassifier ? 'AdvancedIntentClassifier' : null,
        this.contextManager ? 'ContextManager' : null,
        this.trainingDataManager ? 'TrainingDataManager' : null,
        'FallbackDetection'
      ].filter(Boolean) as string[],

      performanceMetrics: {
        averageProcessingTime: this.metrics.averageProcessingTime,
        cacheHitRate: totalRequests > 0 ? this.metrics.cacheHits / totalRequests : 0,
        errorRate: totalRequests > 0 ? this.metrics.errorCount / totalRequests : 0,
        confidenceDistribution: this.metrics.confidenceDistribution
      }
    }
  }

  /**
   * Destroy and cleanup (enhanced)
   */
  destroy(): void {
    // Clear timers
    if (this.processingTimer) {
      clearTimeout(this.processingTimer)
      this.processingTimer = null
    }

    // Destroy advanced components
    if (this.advancedClassifier) {
      this.advancedClassifier.destroy?.()
    }

    if (this.contextManager) {
      this.contextManager.destroy?.()
    }

    if (this.trainingDataManager) {
      this.trainingDataManager.destroy?.()
    }

    // Clear cache and context
    this.cache.clear()
    this.clearContext()

    // Remove all listeners
    this.removeAllListeners()

    this.isInitialized = false

    logger.info('EnhancedQuestionDetector destroyed')
  }
}

// Export for backward compatibility
export {EnhancedQuestionDetector as QuestionDetector}
export default EnhancedQuestionDetector
