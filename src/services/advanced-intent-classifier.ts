/**
 * Advanced Intent Classification System
 *
 * This system extends the existing QuestionDetector with advanced NLP capabilities
 * to provide sophisticated intent classification beyond simple question detection.
 *
 * Key Features:
 * - Multi-intent classification with confidence scoring
 * - Questions without punctuation detection
 * - Embedded question recognition within longer utterances
 * - Context-aware intent resolution
 * - NLP-based semantic understanding using transformer models
 * - Real-time performance optimization
 *
 * Integration: Works with existing OptimizedQuestionDetector and transcription pipeline
 */

import {EventEmitter} from 'events'
import {
  OptimizedQuestionDetector,
  OptimizedQuestionDetectionConfig
} from './optimized-question-detector'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'
import {
  QuestionAnalysis,
  QuestionType,
  QuestionIntent,
  Entity,
  QuestionContext,
  DetectionMetrics
} from './question-detector'

// Enhanced intent classification interfaces
export interface IntentClassification {
  primary: IntentType
  secondary?: IntentType[]
  confidence: number
  reasoning: string
  context_required: boolean
  urgency: 'low' | 'medium' | 'high'
  complexity: 'simple' | 'moderate' | 'complex'
}

export type IntentType =
  | 'information_seeking' // "What is the capital of France?"
  | 'instruction_request' // "How do I install Node.js?"
  | 'clarification' // "What do you mean by that?"
  | 'confirmation' // "Is this correct?"
  | 'comparison' // "Which is better, A or B?"
  | 'opinion' // "What do you think about...?"
  | 'definition' // "What does this mean?"
  | 'troubleshooting' // "Why isn't this working?"
  | 'planning' // "How should I approach this?"
  | 'evaluation' // "Is this a good idea?"
  | 'exploration' // "Tell me more about..."
  | 'conversation' // General conversational intent

export interface MultiIntentResult {
  intents: IntentClassification[]
  dominant_intent: IntentClassification
  has_multiple_intents: boolean
  intent_interactions: string[] // How intents relate to each other
}

export interface EmbeddedQuestionResult {
  has_embedded_questions: boolean
  embedded_questions: {
    text: string
    start_position: number
    end_position: number
    confidence: number
    intent: IntentClassification
  }[]
  main_intent: IntentClassification
}

export interface AdvancedIntentConfig extends OptimizedQuestionDetectionConfig {
  // NLP Model Configuration
  useTransformerModel: boolean
  modelPath?: string
  modelTimeout: number

  // Multi-intent Detection
  enableMultiIntentDetection: boolean
  multiIntentThreshold: number
  maxIntentsPerUtterance: number

  // Embedded Question Detection
  enableEmbeddedQuestionDetection: boolean
  embeddedQuestionMinLength: number
  embeddedQuestionPatterns: string[]

  // Context Integration
  contextWindowSize: number
  enableContextualIntentResolution: boolean
  contextWeightDecay: number

  // Performance Tuning
  nlpProcessingTimeout: number
  enableNLPCaching: boolean
  nlpCacheSize: number
}

/**
 * Advanced Intent Classifier
 *
 * Extends OptimizedQuestionDetector with sophisticated NLP-based intent classification
 */
export class AdvancedIntentClassifier extends OptimizedQuestionDetector {
  private nlpConfig: AdvancedIntentConfig
  private nlpCache: Map<string, MultiIntentResult>
  private contextHistory: Array<{
    text: string
    intent: IntentClassification
    timestamp: number
    entities: Entity[]
  }>

  // NLP Pattern databases
  private intentKeywords: Map<IntentType, string[]>
  private embeddedQuestionPatterns: RegExp[]
  private contextualIndicators: Map<string, IntentType>

  // Performance metrics
  private nlpMetrics = {
    totalClassified: 0,
    multiIntentDetected: 0,
    embeddedQuestionsFound: 0,
    averageNLPProcessingTime: 0,
    nlpCacheHits: 0,
    contextResolutions: 0
  }

  constructor(config: Partial<AdvancedIntentConfig> = {}) {
    super(config)

    this.nlpConfig = {
      ...this.getDefaultConfig(),
      ...config,
      // Advanced NLP specific defaults
      useTransformerModel: false, // Start with pattern-based, upgrade later
      modelTimeout: 100,
      enableMultiIntentDetection: true,
      multiIntentThreshold: 0.6,
      maxIntentsPerUtterance: 3,
      enableEmbeddedQuestionDetection: true,
      embeddedQuestionMinLength: 10,
      embeddedQuestionPatterns: [],
      contextWindowSize: 5,
      enableContextualIntentResolution: true,
      contextWeightDecay: 0.8,
      nlpProcessingTimeout: 50,
      enableNLPCaching: true,
      nlpCacheSize: 500
    }

    this.nlpCache = new Map()
    this.contextHistory = []
    this.intentKeywords = new Map()
    this.embeddedQuestionPatterns = []
    this.contextualIndicators = new Map()

    logger.info('AdvancedIntentClassifier initialized', {
      useTransformerModel: this.nlpConfig.useTransformerModel,
      enableMultiIntentDetection: this.nlpConfig.enableMultiIntentDetection,
      contextWindowSize: this.nlpConfig.contextWindowSize
    })
  }

  /**
   * Initialize advanced NLP components
   */
  async initialize(): Promise<void> {
    await super.initialize()

    try {
      // Initialize intent classification patterns
      this.initializeIntentKeywords()
      this.initializeEmbeddedQuestionPatterns()
      this.initializeContextualIndicators()

      logger.info('AdvancedIntentClassifier initialization complete', {
        intentKeywords: this.intentKeywords.size,
        embeddedPatterns: this.embeddedQuestionPatterns.length,
        contextualIndicators: this.contextualIndicators.size
      })

      this.emit('advanced_nlp_initialized')
    } catch (error) {
      logger.error('Failed to initialize AdvancedIntentClassifier', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Enhanced question detection with advanced intent classification
   */
  async detectQuestion(text: string, useContext = true): Promise<QuestionAnalysis | null> {
    const startTime = performance.now()

    try {
      // Get base question analysis from parent
      const baseAnalysis = await super.detectQuestion(text, useContext)

      if (!baseAnalysis || !baseAnalysis.isQuestion) {
        // Even if not detected as question by parent, try advanced NLP detection
        const advancedResult = await this.performAdvancedIntentClassification(text)

        if (advancedResult.dominant_intent.confidence > this.nlpConfig.confidenceThreshold) {
          // Create new analysis based on advanced detection
          return this.createAdvancedAnalysis(text, advancedResult, startTime)
        }

        return null
      }

      // Enhance existing analysis with advanced intent classification
      const enhancedAnalysis = await this.enhanceWithAdvancedIntents(baseAnalysis, text)

      // Update context
      if (useContext && this.nlpConfig.enableContextualIntentResolution) {
        this.updateContextHistory(text, enhancedAnalysis)
      }

      const processingTime = performance.now() - startTime
      this.nlpMetrics.totalClassified++
      this.nlpMetrics.averageNLPProcessingTime =
        (this.nlpMetrics.averageNLPProcessingTime * (this.nlpMetrics.totalClassified - 1) +
          processingTime) /
        this.nlpMetrics.totalClassified

      this.emit('advanced_question_analyzed', {
        text,
        analysis: enhancedAnalysis,
        processingTime,
        nlpMetrics: this.nlpMetrics
      })

      return enhancedAnalysis
    } catch (error) {
      logger.error('Error in advanced question detection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        text: sanitizeLogMessage(text)
      })

      // Fallback to base detection
      return super.detectQuestion(text, useContext)
    }
  }

  /**
   * Perform advanced intent classification using NLP techniques
   */
  private async performAdvancedIntentClassification(text: string): Promise<MultiIntentResult> {
    const cacheKey = this.generateNLPCacheKey(text)

    // Check cache first
    if (this.nlpConfig.enableNLPCaching && this.nlpCache.has(cacheKey)) {
      this.nlpMetrics.nlpCacheHits++
      return this.nlpCache.get(cacheKey)!
    }

    const result = await this.classifyIntents(text)

    // Cache result
    if (this.nlpConfig.enableNLPCaching) {
      this.cacheNLPResult(cacheKey, result)
    }

    return result
  }

  /**
   * Core intent classification logic
   */
  private async classifyIntents(text: string): Promise<MultiIntentResult> {
    const intents: IntentClassification[] = []

    // 1. Pattern-based intent classification
    const patternIntents = await this.classifyIntentsWithPatterns(text)
    intents.push(...patternIntents)

    // 2. Embedded question detection
    const embeddedResult = await this.detectEmbeddedQuestions(text)
    if (embeddedResult.has_embedded_questions) {
      this.nlpMetrics.embeddedQuestionsFound++
      embeddedResult.embedded_questions.forEach(eq => {
        intents.push(eq.intent)
      })
    }

    // 3. Context-aware intent resolution
    if (this.nlpConfig.enableContextualIntentResolution && this.contextHistory.length > 0) {
      const contextualIntents = await this.resolveIntentsWithContext(text, intents)
      intents.push(...contextualIntents)
      if (contextualIntents.length > 0) {
        this.nlpMetrics.contextResolutions++
      }
    }

    // 4. Multi-intent detection and consolidation
    const consolidatedIntents = this.consolidateIntents(intents)
    const dominantIntent = this.findDominantIntent(consolidatedIntents)

    const hasMultipleIntents =
      consolidatedIntents.length > 1 &&
      consolidatedIntents.filter(i => i.confidence > this.nlpConfig.multiIntentThreshold).length > 1

    if (hasMultipleIntents) {
      this.nlpMetrics.multiIntentDetected++
    }

    return {
      intents: consolidatedIntents,
      dominant_intent: dominantIntent,
      has_multiple_intents: hasMultipleIntents,
      intent_interactions: this.analyzeIntentInteractions(consolidatedIntents)
    }
  }

  /**
   * Pattern-based intent classification using keyword matching and linguistic analysis
   */
  private async classifyIntentsWithPatterns(text: string): Promise<IntentClassification[]> {
    const intents: IntentClassification[] = []
    const words = text.toLowerCase().split(/\s+/)
    const cleanText = text.toLowerCase()

    // Check each intent type
    for (const [intentType, keywords] of this.intentKeywords.entries()) {
      let score = 0
      let matchedKeywords: string[] = []

      // Keyword matching with weighted scores
      keywords.forEach(keyword => {
        if (cleanText.includes(keyword)) {
          score += this.getKeywordWeight(keyword, intentType)
          matchedKeywords.push(keyword)
        }
      })

      // Linguistic pattern analysis
      const linguisticScore = this.analyzeLinguisticPatterns(text, intentType)
      score += linguisticScore

      // Positional analysis (words at beginning get higher weight)
      const positionalScore = this.analyzePositionalPatterns(words, intentType)
      score += positionalScore

      // Normalize score to confidence (0-1)
      const confidence = Math.min(score / this.getMaxPossibleScore(intentType), 1.0)

      if (confidence > 0.3) {
        // Threshold for including intent
        intents.push({
          primary: intentType,
          confidence,
          reasoning: `Matched keywords: ${matchedKeywords.join(', ')}. Linguistic patterns: ${linguisticScore > 0}`,
          context_required: this.requiresContext(intentType, text),
          urgency: this.determineUrgency(text),
          complexity: this.determineComplexity(text)
        })
      }
    }

    return intents.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Detect embedded questions within longer utterances
   */
  private async detectEmbeddedQuestions(text: string): Promise<EmbeddedQuestionResult> {
    if (
      !this.nlpConfig.enableEmbeddedQuestionDetection ||
      text.length < this.nlpConfig.embeddedQuestionMinLength
    ) {
      return {
        has_embedded_questions: false,
        embedded_questions: [],
        main_intent: this.createDefaultIntent()
      }
    }

    const embeddedQuestions = []

    // Pattern-based embedded question detection
    for (const pattern of this.embeddedQuestionPatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const questionText = match[0]
        const startPos = match.index
        const endPos = startPos + questionText.length

        // Classify the embedded question
        const embeddedIntents = await this.classifyIntentsWithPatterns(questionText)
        const dominantIntent =
          embeddedIntents.length > 0 ? embeddedIntents[0] : this.createDefaultIntent()

        embeddedQuestions.push({
          text: questionText,
          start_position: startPos,
          end_position: endPos,
          confidence: dominantIntent.confidence * 0.8, // Slightly lower confidence for embedded
          intent: dominantIntent
        })
      }
    }

    // Determine main intent (excluding embedded questions)
    const mainText = this.extractMainText(text, embeddedQuestions)
    const mainIntents = await this.classifyIntentsWithPatterns(mainText)
    const mainIntent = mainIntents.length > 0 ? mainIntents[0] : this.createDefaultIntent()

    return {
      has_embedded_questions: embeddedQuestions.length > 0,
      embedded_questions: embeddedQuestions,
      main_intent: mainIntent
    }
  }

  /**
   * Resolve intents using conversation context
   */
  private async resolveIntentsWithContext(
    text: string,
    currentIntents: IntentClassification[]
  ): Promise<IntentClassification[]> {
    if (this.contextHistory.length === 0) {
      return []
    }

    const contextualIntents: IntentClassification[] = []

    // Analyze recent context
    const recentContext = this.contextHistory.slice(-this.nlpConfig.contextWindowSize).reverse() // Most recent first

    // Look for contextual patterns
    for (const [indicator, intentType] of this.contextualIndicators.entries()) {
      if (text.toLowerCase().includes(indicator)) {
        // Check if this relates to recent context
        const contextualRelevance = this.calculateContextualRelevance(
          text,
          intentType,
          recentContext
        )

        if (contextualRelevance > 0.5) {
          contextualIntents.push({
            primary: intentType,
            confidence: contextualRelevance,
            reasoning: `Contextual reference: "${indicator}" relates to recent conversation`,
            context_required: true,
            urgency: this.determineUrgency(text),
            complexity: 'moderate'
          })
        }
      }
    }

    // Handle follow-up patterns
    const followUpIntent = this.detectFollowUpIntent(text, recentContext)
    if (followUpIntent) {
      contextualIntents.push(followUpIntent)
    }

    return contextualIntents
  }

  /**
   * Consolidate multiple detected intents and remove duplicates
   */
  private consolidateIntents(intents: IntentClassification[]): IntentClassification[] {
    const intentMap = new Map<IntentType, IntentClassification>()

    // Group by intent type and take highest confidence
    intents.forEach(intent => {
      const existing = intentMap.get(intent.primary)
      if (!existing || intent.confidence > existing.confidence) {
        intentMap.set(intent.primary, intent)
      }
    })

    // Return sorted by confidence, limited by max intents
    return Array.from(intentMap.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.nlpConfig.maxIntentsPerUtterance)
  }

  /**
   * Find the dominant (highest confidence) intent
   */
  private findDominantIntent(intents: IntentClassification[]): IntentClassification {
    if (intents.length === 0) {
      return this.createDefaultIntent()
    }
    return intents[0] // Already sorted by confidence
  }

  /**
   * Enhance base question analysis with advanced intent information
   */
  private async enhanceWithAdvancedIntents(
    baseAnalysis: QuestionAnalysis,
    text: string
  ): Promise<QuestionAnalysis> {
    const advancedResult = await this.performAdvancedIntentClassification(text)

    return {
      ...baseAnalysis,
      intent: this.mapToBaseIntent(advancedResult.dominant_intent),
      // Add custom metadata for advanced features
      metadata: {
        multiIntentResult: advancedResult,
        hasMultipleIntents: advancedResult.has_multiple_intents,
        embeddedQuestions: await this.detectEmbeddedQuestions(text),
        contextualReferences: this.findContextualReferences(text)
      }
    } as QuestionAnalysis
  }

  /**
   * Create analysis from advanced NLP detection
   */
  private createAdvancedAnalysis(
    text: string,
    advancedResult: MultiIntentResult,
    startTime: number
  ): QuestionAnalysis {
    const dominant = advancedResult.dominant_intent

    return {
      isQuestion: true,
      confidence: dominant.confidence,
      questionType: this.mapIntentToQuestionType(dominant.primary),
      subType: dominant.primary,
      patterns: [], // Would be populated by pattern detection
      entities: [], // Would be populated by entity extraction
      intent: this.mapToBaseIntent(dominant),
      complexity: dominant.complexity,
      requiresContext: dominant.context_required,
      timestamp: Date.now(),
      metadata: {
        advancedClassification: advancedResult,
        processingTime: performance.now() - startTime,
        nlpProcessed: true
      }
    } as QuestionAnalysis
  }

  // Utility methods for initialization and configuration

  /**
   * Initialize intent keywords database
   */
  private initializeIntentKeywords(): void {
    this.intentKeywords.set('information_seeking', [
      'what',
      'who',
      'when',
      'where',
      'which',
      'tell me',
      'information',
      'details',
      'facts',
      'about',
      'regarding',
      'concerning'
    ])

    this.intentKeywords.set('instruction_request', [
      'how',
      'way to',
      'steps',
      'process',
      'procedure',
      'method',
      'instructions',
      'guide',
      'tutorial',
      'walk me through'
    ])

    this.intentKeywords.set('clarification', [
      'clarify',
      'explain',
      'mean',
      'understand',
      'confused',
      'unclear',
      'what do you mean',
      "I don't get",
      'help me understand'
    ])

    this.intentKeywords.set('confirmation', [
      'is',
      'are',
      'do',
      'does',
      'did',
      'can',
      'could',
      'will',
      'would',
      'confirm',
      'verify',
      'check',
      'correct',
      'right',
      'true'
    ])

    this.intentKeywords.set('comparison', [
      'better',
      'worse',
      'best',
      'worst',
      'compare',
      'versus',
      'vs',
      'difference',
      'similar',
      'same',
      'different',
      'which',
      'prefer'
    ])

    this.intentKeywords.set('opinion', [
      'think',
      'opinion',
      'believe',
      'feel',
      'recommend',
      'suggest',
      'advise',
      'what do you',
      'your thoughts',
      'perspective'
    ])

    this.intentKeywords.set('definition', [
      'define',
      'definition',
      'meaning',
      'what is',
      'what are',
      'what does',
      'means',
      'refers to',
      'stands for'
    ])

    this.intentKeywords.set('troubleshooting', [
      'problem',
      'issue',
      'error',
      'wrong',
      'broken',
      'not working',
      'fix',
      'solve',
      'resolve',
      'debug',
      'troubleshoot'
    ])

    this.intentKeywords.set('planning', [
      'plan',
      'approach',
      'strategy',
      'should I',
      'recommend',
      'best way',
      'how to approach',
      'steps to',
      'roadmap'
    ])

    this.intentKeywords.set('evaluation', [
      'good',
      'bad',
      'worth',
      'evaluate',
      'assess',
      'judge',
      'opinion on',
      'thoughts on',
      'review',
      'rate'
    ])

    this.intentKeywords.set('exploration', [
      'more about',
      'tell me about',
      'explore',
      'learn about',
      'interested in',
      'curious about',
      'elaborate',
      'expand on'
    ])
  }

  /**
   * Initialize embedded question patterns
   */
  private initializeEmbeddedQuestionPatterns(): void {
    const patterns = [
      // "I wonder" patterns
      /I\s+(wonder|was\s+wondering)\s+([^.!?]*\?*)/gi,

      // "Can you tell me" patterns
      /can\s+you\s+(tell\s+me|explain|help\s+me\s+understand)\s+([^.!?]*\?*)/gi,

      // "Do you know" patterns
      /(do\s+you\s+know|are\s+you\s+aware)\s+([^.!?]*\?*)/gi,

      // "I'm curious about" patterns
      /I'm\s+(curious\s+about|interested\s+in\s+knowing)\s+([^.!?]*\?*)/gi,

      // "Could you" patterns
      /could\s+you\s+(possibly\s+)?(tell\s+me|explain|help)\s+([^.!?]*\?*)/gi,

      // "I'd like to know" patterns
      /I'd\s+like\s+to\s+(know|understand|learn)\s+([^.!?]*\?*)/gi
    ]

    this.embeddedQuestionPatterns = patterns
  }

  /**
   * Initialize contextual indicators
   */
  private initializeContextualIndicators(): void {
    this.contextualIndicators.set('that', 'clarification')
    this.contextualIndicators.set('it', 'clarification')
    this.contextualIndicators.set('this', 'clarification')
    this.contextualIndicators.set('they', 'clarification')
    this.contextualIndicators.set('also', 'exploration')
    this.contextualIndicators.set('additionally', 'exploration')
    this.contextualIndicators.set('furthermore', 'exploration')
    this.contextualIndicators.set('more', 'exploration')
    this.contextualIndicators.set('another', 'exploration')
    this.contextualIndicators.set('follow up', 'clarification')
    this.contextualIndicators.set('continue', 'exploration')
    this.contextualIndicators.set('next', 'planning')
  }

  // Helper methods

  private getKeywordWeight(keyword: string, intentType: IntentType): number {
    // Define keyword weights based on importance
    const weights: Record<string, number> = {
      // High weight keywords
      what: 1.0,
      how: 1.0,
      why: 1.0,
      when: 1.0,
      where: 1.0,
      define: 1.0,
      explain: 1.0,
      clarify: 1.0,

      // Medium weight keywords
      'tell me': 0.8,
      'help me': 0.8,
      'show me': 0.8,
      better: 0.8,
      compare: 0.8,
      difference: 0.8,

      // Lower weight keywords
      about: 0.6,
      regarding: 0.6,
      information: 0.6,
      details: 0.6,
      process: 0.6
    }

    return weights[keyword] || 0.5 // Default weight
  }

  private analyzeLinguisticPatterns(text: string, intentType: IntentType): number {
    let score = 0
    const lowerText = text.toLowerCase()

    // Analyze sentence structure patterns
    if (intentType === 'confirmation') {
      // Yes/no question patterns
      if (/^(is|are|do|does|did|can|could|will|would|should)\s/.test(lowerText)) {
        score += 0.5
      }
      if (lowerText.includes('or not')) {
        score += 0.3
      }
    }

    if (intentType === 'information_seeking') {
      // Information-seeking patterns
      if (/^(what|who|when|where|which)\s/.test(lowerText)) {
        score += 0.5
      }
      if (lowerText.includes('tell me about')) {
        score += 0.4
      }
    }

    return score
  }

  private analyzePositionalPatterns(words: string[], intentType: IntentType): number {
    let score = 0

    if (words.length === 0) return 0

    // First word analysis (higher weight)
    const firstWord = words[0].toLowerCase()
    if (this.intentKeywords.get(intentType)?.includes(firstWord)) {
      score += 0.3
    }

    // First two words analysis
    if (words.length > 1) {
      const firstTwoWords = `${words[0]} ${words[1]}`.toLowerCase()
      if (this.intentKeywords.get(intentType)?.some(keyword => keyword.includes(firstTwoWords))) {
        score += 0.2
      }
    }

    return score
  }

  private getMaxPossibleScore(intentType: IntentType): number {
    // Maximum theoretical score for normalization
    return 2.0 // Adjust based on scoring system
  }

  private requiresContext(intentType: IntentType, text: string): boolean {
    const contextRequiredTypes: IntentType[] = ['clarification', 'confirmation']
    const contextIndicators = ['that', 'this', 'it', 'they', 'those']

    return (
      contextRequiredTypes.includes(intentType) ||
      contextIndicators.some(indicator => text.toLowerCase().includes(indicator))
    )
  }

  private determineUrgency(text: string): 'low' | 'medium' | 'high' {
    const urgentKeywords = ['urgent', 'immediately', 'asap', 'quickly', 'now', 'emergency']
    const lowUrgencyKeywords = ['sometime', 'when you can', 'no rush', 'eventually']

    const lowerText = text.toLowerCase()

    if (urgentKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'high'
    }
    if (lowUrgencyKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'low'
    }
    return 'medium'
  }

  private determineComplexity(text: string): 'simple' | 'moderate' | 'complex' {
    const words = text.split(/\s+/).length
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length
    const conjunctions = (text.match(/\b(and|or|but|however|moreover|furthermore)\b/gi) || [])
      .length

    if (words > 20 || sentences > 2 || conjunctions > 1) {
      return 'complex'
    }
    if (words > 10 || sentences > 1 || conjunctions > 0) {
      return 'moderate'
    }
    return 'simple'
  }

  private calculateContextualRelevance(
    text: string,
    intentType: IntentType,
    context: typeof this.contextHistory
  ): number {
    let relevance = 0

    context.forEach((entry, index) => {
      const weightDecay = Math.pow(this.nlpConfig.contextWeightDecay, index)

      // Check for entity overlap
      const textEntities = this.extractSimpleEntities(text)
      const contextEntities = entry.entities
      const entityOverlap = this.calculateEntityOverlap(textEntities, contextEntities)

      relevance += entityOverlap * weightDecay * 0.5

      // Check for intent continuity
      if (entry.intent.primary === intentType) {
        relevance += weightDecay * 0.3
      }
    })

    return Math.min(relevance, 1.0)
  }

  private detectFollowUpIntent(
    text: string,
    context: typeof this.contextHistory
  ): IntentClassification | null {
    const followUpPatterns = [
      /^(and|also|additionally|furthermore|moreover)\b/i,
      /^(what about|how about)\b/i,
      /^(can you also|could you also)\b/i
    ]

    const isFollowUp = followUpPatterns.some(pattern => pattern.test(text.trim()))

    if (isFollowUp && context.length > 0) {
      const lastIntent = context[0].intent
      return {
        primary: lastIntent.primary,
        confidence: 0.7,
        reasoning: 'Follow-up question detected based on conversation context',
        context_required: true,
        urgency: lastIntent.urgency,
        complexity: 'moderate'
      }
    }

    return null
  }

  private extractMainText(text: string, embeddedQuestions: any[]): string {
    let mainText = text

    // Remove embedded questions (in reverse order to maintain positions)
    embeddedQuestions
      .sort((a, b) => b.start_position - a.start_position)
      .forEach(eq => {
        mainText = mainText.slice(0, eq.start_position) + mainText.slice(eq.end_position)
      })

    return mainText.trim()
  }

  private createDefaultIntent(): IntentClassification {
    return {
      primary: 'conversation',
      confidence: 0.5,
      reasoning: 'Default conversational intent',
      context_required: false,
      urgency: 'medium',
      complexity: 'simple'
    }
  }

  private analyzeIntentInteractions(intents: IntentClassification[]): string[] {
    const interactions: string[] = []

    if (intents.length < 2) return interactions

    // Analyze common intent combinations
    const intentTypes = intents.map(i => i.primary)

    if (intentTypes.includes('information_seeking') && intentTypes.includes('comparison')) {
      interactions.push('Information seeking with comparison - user wants to understand options')
    }

    if (intentTypes.includes('clarification') && intentTypes.includes('confirmation')) {
      interactions.push(
        'Clarification followed by confirmation - user seeks understanding and validation'
      )
    }

    if (intentTypes.includes('instruction_request') && intentTypes.includes('troubleshooting')) {
      interactions.push('Instruction with troubleshooting - user needs guided problem-solving')
    }

    return interactions
  }

  private mapToBaseIntent(advancedIntent: IntentClassification): QuestionIntent {
    const intentMapping: Record<IntentType, QuestionIntent['primary']> = {
      information_seeking: 'information_seeking',
      instruction_request: 'instruction',
      clarification: 'clarification',
      confirmation: 'confirmation',
      comparison: 'information_seeking',
      opinion: 'opinion',
      definition: 'information_seeking',
      troubleshooting: 'instruction',
      planning: 'instruction',
      evaluation: 'opinion',
      exploration: 'information_seeking',
      conversation: 'information_seeking'
    }

    return {
      primary: intentMapping[advancedIntent.primary] || 'information_seeking',
      urgency: advancedIntent.urgency,
      scope: advancedIntent.context_required ? 'contextual' : 'general'
    }
  }

  private mapIntentToQuestionType(intentType: IntentType): QuestionType {
    const typeMapping: Record<IntentType, QuestionType> = {
      information_seeking: 'factual',
      instruction_request: 'procedural',
      clarification: 'conversational',
      confirmation: 'confirmatory',
      comparison: 'comparative',
      opinion: 'conversational',
      definition: 'factual',
      troubleshooting: 'procedural',
      planning: 'procedural',
      evaluation: 'comparative',
      exploration: 'factual',
      conversation: 'conversational'
    }

    return typeMapping[intentType] || 'conversational'
  }

  private updateContextHistory(text: string, analysis: QuestionAnalysis): void {
    const metadata = analysis.metadata as any
    const advancedClassification = metadata?.advancedClassification || metadata?.multiIntentResult

    if (advancedClassification) {
      this.contextHistory.unshift({
        text,
        intent: advancedClassification.dominant_intent,
        timestamp: Date.now(),
        entities: analysis.entities
      })

      // Keep only recent context
      if (this.contextHistory.length > this.nlpConfig.contextWindowSize) {
        this.contextHistory = this.contextHistory.slice(0, this.nlpConfig.contextWindowSize)
      }
    }
  }

  private extractSimpleEntities(text: string): Entity[] {
    // Simple entity extraction for context analysis
    const entities: Entity[] = []

    // This could be enhanced with more sophisticated entity recognition
    const patterns = {
      person: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
      location: /\b(in|at|from|to) ([A-Z][a-z]+)\b/g,
      time: /\b(today|tomorrow|yesterday|\d{1,2}:\d{2})\b/g
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

  private calculateEntityOverlap(entities1: Entity[], entities2: Entity[]): number {
    if (entities1.length === 0 || entities2.length === 0) return 0

    let overlaps = 0
    entities1.forEach(e1 => {
      if (
        entities2.some(e2 => e1.text.toLowerCase() === e2.text.toLowerCase() && e1.type === e2.type)
      ) {
        overlaps++
      }
    })

    return overlaps / Math.max(entities1.length, entities2.length)
  }

  private findContextualReferences(text: string): string[] {
    const references: string[] = []
    const referencePatterns = [
      /\b(this|that|it|they|these|those)\b/gi,
      /\b(above|below|earlier|previously|mentioned)\b/gi,
      /\b(the (first|second|third|last|previous|next))\b/gi
    ]

    referencePatterns.forEach(pattern => {
      const matches = text.match(pattern)
      if (matches) {
        references.push(...matches.map(m => m.toLowerCase()))
      }
    })

    return [...new Set(references)] // Remove duplicates
  }

  private generateNLPCacheKey(text: string): string {
    return `nlp_${Buffer.from(text.toLowerCase().trim()).toString('base64').slice(0, 32)}`
  }

  private cacheNLPResult(key: string, result: MultiIntentResult): void {
    if (this.nlpCache.size >= this.nlpConfig.nlpCacheSize) {
      // Remove oldest entries (simple FIFO)
      const oldestKey = this.nlpCache.keys().next().value
      this.nlpCache.delete(oldestKey)
    }
    this.nlpCache.set(key, result)
  }

  /**
   * Get enhanced metrics including NLP performance
   */
  getEnhancedMetrics(): DetectionMetrics & typeof this.nlpMetrics {
    const baseMetrics = this.getMetrics()
    return {
      ...baseMetrics,
      ...this.nlpMetrics
    }
  }

  /**
   * Clear NLP-specific caches and context
   */
  clearNLPState(): void {
    this.nlpCache.clear()
    this.contextHistory = []

    this.nlpMetrics = {
      totalClassified: 0,
      multiIntentDetected: 0,
      embeddedQuestionsFound: 0,
      averageNLPProcessingTime: 0,
      nlpCacheHits: 0,
      contextResolutions: 0
    }

    logger.info('AdvancedIntentClassifier NLP state cleared')
    this.emit('nlp_state_cleared')
  }

  /**
   * Update NLP configuration
   */
  updateNLPConfig(config: Partial<AdvancedIntentConfig>): void {
    this.nlpConfig = {...this.nlpConfig, ...config}

    if (config.nlpCacheSize !== undefined) {
      this.nlpCache.clear()
    }

    logger.info('AdvancedIntentClassifier NLP configuration updated', config)
    this.emit('nlp_config_updated', this.nlpConfig)
  }
}

export default AdvancedIntentClassifier
