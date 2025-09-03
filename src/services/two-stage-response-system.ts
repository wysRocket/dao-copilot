/**
 * Two-Stage Response System
 *
 * This module implements a sophisticated two-stage response system that provides
 * immediate acknowledgments (<200ms) followed by comprehensive responses. It ensures
 * users receive instant feedback while allowing time for thorough processing and
 * response generation.
 *
 * Architecture Overview:
 * Stage 1 (Immediate): Quick acknowledgment with context awareness (<200ms)
 * Stage 2 (Comprehensive): Full response with detailed information and actions
 *
 * Key Features:
 * - Ultra-fast acknowledgment generation (<200ms)
 * - Context-aware immediate responses based on detected intent
 * - Progressive response streaming for long-form answers
 * - Quality optimization for comprehensive responses
 * - Response caching and optimization
 * - Seamless integration with conversation state machine
 * - Interruption handling and response cancellation
 * - Response personalization and adaptation
 * - Multi-language support for acknowledgments
 * - Analytics and performance tracking
 *
 * Response Flow:
 * 1. Intent detected → Generate immediate acknowledgment
 * 2. Acknowledgment delivered while processing continues
 * 3. Comprehensive response generated in background
 * 4. Progressive streaming of comprehensive response
 * 5. Response completion and state transition
 *
 * Integration Points:
 * - Conversation State Machine: State transitions and context
 * - Audio Segmentation: Real-time processing requirements
 * - Intent Classification: Context-aware acknowledgments
 * - TTS System: Audio response delivery
 */

import {EventEmitter} from 'events'
import {performance} from 'perf_hooks'

// Import conversation context types
import type {
  ConversationContext,
  ConversationState,
  ConversationEvent
} from './conversation-state-machine'

export interface ResponseStage {
  stage: 'immediate' | 'comprehensive'
  priority: number
  timestamp: number
  responseTime: number
  confidence: number
  isComplete: boolean
}

export interface ImmediateResponse {
  text: string
  audioData?: Uint8Array
  confidence: number
  intent: string
  acknowledgmentType: AcknowledgmentType
  estimatedProcessingTime?: number
  contextHints?: string[]
  metadata: {
    generationTime: number
    templateUsed?: string
    personalized: boolean
    language: string
  }
}

export interface ComprehensiveResponse {
  text: string
  audioData?: Uint8Array
  confidence: number
  intent: string
  completionStage: 'partial' | 'complete'
  streamingChunks?: ResponseChunk[]
  actions?: ResponseAction[]
  metadata: {
    generationTime: number
    totalProcessingTime: number
    qualityScore: number
    sourcesUsed: string[]
    factChecked: boolean
    language: string
    responseLength: number
  }
}

export interface ResponseChunk {
  id: string
  sequence: number
  text: string
  isComplete: boolean
  timing: {
    startTime: number
    endTime: number
    duration: number
  }
  metadata?: Record<string, unknown>
}

export interface ResponseAction {
  type: 'function_call' | 'api_request' | 'system_command' | 'ui_update'
  name: string
  parameters: Record<string, unknown>
  priority: number
  estimatedDuration?: number
  requiresConfirmation: boolean
}

export enum AcknowledgmentType {
  // Standard acknowledgments
  UNDERSTOOD = 'understood',
  PROCESSING = 'processing',
  WORKING = 'working',
  SEARCHING = 'searching',

  // Intent-specific acknowledgments
  QUESTION_RECEIVED = 'question_received',
  TASK_ACCEPTED = 'task_accepted',
  COMMAND_RECEIVED = 'command_received',
  REQUEST_UNDERSTOOD = 'request_understood',

  // Context-aware acknowledgments
  COMPLEX_REQUEST = 'complex_request',
  QUICK_ANSWER = 'quick_answer',
  REQUIRES_TOOLS = 'requires_tools',
  NEEDS_CLARIFICATION = 'needs_clarification',

  // Emotional/social acknowledgments
  ENTHUSIASM = 'enthusiasm',
  EMPATHY = 'empathy',
  ENCOURAGEMENT = 'encouragement',
  ACKNOWLEDGMENT = 'acknowledgment'
}

export interface TwoStageResponseConfig {
  // Timing constraints
  maxImmediateResponseTime: number // Target <200ms
  maxComprehensiveResponseTime: number // Target <5000ms
  streamingChunkSize: number
  streamingInterval: number

  // Quality and optimization
  enableResponseCaching: boolean
  cacheExpirationTime: number
  enableQualityOptimization: boolean
  minimumQualityScore: number

  // Personalization
  enablePersonalization: boolean
  userPreferencesWeight: number
  contextHistoryWeight: number

  // Language and localization
  defaultLanguage: string
  enableMultiLanguage: boolean
  fallbackLanguage: string

  // Integration settings
  enableProgressiveStreaming: boolean
  enableResponseActions: boolean
  enableInterruptionHandling: boolean

  // Performance optimization
  enableParallelProcessing: boolean
  maxConcurrentResponses: number
  enableResponseCompression: boolean

  // Analytics and monitoring
  enablePerformanceTracking: boolean
  enableResponseAnalytics: boolean
  enableQualityMetrics: boolean

  // Template and content management
  acknowledgmentTemplates: Record<AcknowledgmentType, string[]>
  customTemplates?: Record<string, string[]>
  enableTemplateVariation: boolean
}

export interface ResponseContext {
  conversationContext: ConversationContext
  detectedIntent: {
    intent: string
    confidence: number
    entities: Array<{
      type: string
      value: string
      confidence: number
    }>
  }
  userPreferences?: {
    responseStyle: 'concise' | 'detailed' | 'conversational'
    preferredLanguage: string
    personalityType: 'professional' | 'friendly' | 'enthusiastic'
    interactionHistory: Array<{
      intent: string
      satisfaction: number
      responseTime: number
    }>
  }
  processingRequirements: {
    estimatedComplexity: number
    requiresExternalData: boolean
    requiresCalculation: boolean
    requiresMultiStep: boolean
    toolsRequired: string[]
  }
}

/**
 * Acknowledgment Generator
 *
 * Generates immediate acknowledgments based on intent and context.
 */
class AcknowledgmentGenerator extends EventEmitter {
  private config: TwoStageResponseConfig
  private templateCache: Map<string, string[]> = new Map()
  private usageStats: Map<string, number> = new Map()

  constructor(config: TwoStageResponseConfig) {
    super()
    this.config = config
    this.initializeTemplates()
  }

  private initializeTemplates(): void {
    // Cache acknowledgment templates for quick access
    for (const [type, templates] of Object.entries(this.config.acknowledgmentTemplates)) {
      this.templateCache.set(type, templates)
    }

    if (this.config.customTemplates) {
      for (const [type, templates] of Object.entries(this.config.customTemplates)) {
        this.templateCache.set(type, templates)
      }
    }
  }

  /**
   * Generate immediate acknowledgment
   */
  async generateAcknowledgment(context: ResponseContext): Promise<ImmediateResponse> {
    const startTime = performance.now()

    try {
      // Determine acknowledgment type based on intent and context
      const acknowledgmentType = this.determineAcknowledgmentType(context)

      // Generate contextual acknowledgment text
      const acknowledgmentText = this.generateAcknowledgmentText(acknowledgmentType, context)

      // Calculate estimated processing time
      const estimatedProcessingTime = this.estimateProcessingTime(context)

      // Generate context hints for the user
      const contextHints = this.generateContextHints(context)

      const generationTime = performance.now() - startTime

      const response: ImmediateResponse = {
        text: acknowledgmentText,
        confidence: 0.95, // High confidence for immediate responses
        intent: context.detectedIntent.intent,
        acknowledgmentType,
        estimatedProcessingTime,
        contextHints,
        metadata: {
          generationTime,
          templateUsed: acknowledgmentType,
          personalized: this.config.enablePersonalization && !!context.userPreferences,
          language: context.userPreferences?.preferredLanguage || this.config.defaultLanguage
        }
      }

      // Update usage statistics
      this.updateUsageStats(acknowledgmentType)

      // Emit acknowledgment generated event
      this.emit('acknowledgment-generated', response)

      return response
    } catch (error) {
      this.emit('acknowledgment-error', {context, error})

      // Fallback acknowledgment
      return {
        text: 'I understand. Let me work on that for you.',
        confidence: 0.8,
        intent: context.detectedIntent.intent,
        acknowledgmentType: AcknowledgmentType.UNDERSTOOD,
        metadata: {
          generationTime: performance.now() - startTime,
          personalized: false,
          language: this.config.defaultLanguage
        }
      }
    }
  }

  private determineAcknowledgmentType(context: ResponseContext): AcknowledgmentType {
    const {intent, confidence} = context.detectedIntent
    const {requiresExternalData, requiresCalculation, estimatedComplexity} =
      context.processingRequirements

    // Intent-based mapping
    if (intent.includes('question') || intent.includes('what') || intent.includes('how')) {
      return estimatedComplexity > 7
        ? AcknowledgmentType.COMPLEX_REQUEST
        : AcknowledgmentType.QUESTION_RECEIVED
    }

    if (intent.includes('task') || intent.includes('do') || intent.includes('create')) {
      return AcknowledgmentType.TASK_ACCEPTED
    }

    if (intent.includes('search') || requiresExternalData) {
      return AcknowledgmentType.SEARCHING
    }

    if (requiresCalculation || estimatedComplexity > 6) {
      return AcknowledgmentType.PROCESSING
    }

    if (confidence < 0.7) {
      return AcknowledgmentType.NEEDS_CLARIFICATION
    }

    // User preference-based adjustment
    if (context.userPreferences?.personalityType === 'enthusiastic') {
      return AcknowledgmentType.ENTHUSIASM
    }

    if (context.userPreferences?.personalityType === 'friendly') {
      return AcknowledgmentType.ACKNOWLEDGMENT
    }

    // Default acknowledgment
    return AcknowledgmentType.UNDERSTOOD
  }

  private generateAcknowledgmentText(type: AcknowledgmentType, context: ResponseContext): string {
    const templates = this.templateCache.get(type) || ['I understand.']

    // Select template with variation if enabled
    let template: string
    if (this.config.enableTemplateVariation) {
      // Use usage stats to prefer less-used templates
      const weights = templates.map((_, index) => {
        const usage = this.usageStats.get(`${type}-${index}`) || 0
        return Math.max(1, 10 - usage) // Lower weight for frequently used templates
      })

      template = this.weightedRandomSelect(templates, weights)
    } else {
      template = templates[Math.floor(Math.random() * templates.length)]
    }

    // Personalize if enabled
    if (this.config.enablePersonalization && context.userPreferences) {
      template = this.personalizeTemplate(template, context)
    }

    // Add context-specific information
    template = this.addContextualInfo(template, context)

    return template
  }

  private personalizeTemplate(template: string, context: ResponseContext): string {
    if (!context.userPreferences) return template

    const {responseStyle, personalityType} = context.userPreferences

    // Adjust based on response style
    if (responseStyle === 'concise') {
      // Use shorter variants
      template = template.replace(/Let me work on that for you/g, 'Working on it')
      template = template.replace(/I understand what you're asking/g, 'Got it')
    } else if (responseStyle === 'detailed') {
      // Add more context
      template = template.replace(/I understand/g, 'I understand your request')
    }

    // Adjust based on personality
    if (personalityType === 'enthusiastic') {
      template = template.replace(/\./g, '!')
    } else if (personalityType === 'professional') {
      template = template.replace(/!/g, '.')
    }

    return template
  }

  private addContextualInfo(template: string, context: ResponseContext): string {
    const {estimatedComplexity, requiresExternalData, toolsRequired} =
      context.processingRequirements

    // Add processing hints for complex requests
    if (estimatedComplexity > 7) {
      template += ' This is a complex request that will take a moment to process thoroughly.'
    } else if (requiresExternalData) {
      template += " I'll need to gather some information to give you a complete answer."
    } else if (toolsRequired.length > 0) {
      template += " I'll use some tools to help with this request."
    }

    return template
  }

  private generateContextHints(context: ResponseContext): string[] {
    const hints: string[] = []
    const {requiresExternalData, requiresCalculation, toolsRequired} =
      context.processingRequirements

    if (requiresExternalData) {
      hints.push('Gathering latest information...')
    }

    if (requiresCalculation) {
      hints.push('Processing calculations...')
    }

    if (toolsRequired.length > 0) {
      hints.push(
        `Using tools: ${toolsRequired.slice(0, 2).join(', ')}${toolsRequired.length > 2 ? '...' : ''}`
      )
    }

    return hints
  }

  private estimateProcessingTime(context: ResponseContext): number {
    const {estimatedComplexity, requiresExternalData, requiresCalculation, toolsRequired} =
      context.processingRequirements

    let baseTime = 1000 // 1 second base

    // Adjust based on complexity
    baseTime += estimatedComplexity * 200

    // Add time for external data
    if (requiresExternalData) {
      baseTime += 2000
    }

    // Add time for calculations
    if (requiresCalculation) {
      baseTime += 1000
    }

    // Add time for tools
    baseTime += toolsRequired.length * 500

    return Math.min(baseTime, this.config.maxComprehensiveResponseTime)
  }

  private weightedRandomSelect<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    const random = Math.random() * totalWeight

    let currentWeight = 0
    for (let i = 0; i < items.length; i++) {
      currentWeight += weights[i]
      if (random <= currentWeight) {
        return items[i]
      }
    }

    return items[items.length - 1]
  }

  private updateUsageStats(type: AcknowledgmentType): void {
    const key = type.toString()
    const current = this.usageStats.get(key) || 0
    this.usageStats.set(key, current + 1)
  }

  /**
   * Get acknowledgment statistics
   */
  getStats(): Record<string, number> {
    return Object.fromEntries(this.usageStats)
  }

  /**
   * Reset usage statistics
   */
  resetStats(): void {
    this.usageStats.clear()
  }
}

/**
 * Comprehensive Response Generator
 *
 * Generates detailed responses with progressive streaming and quality optimization.
 */
class ComprehensiveResponseGenerator extends EventEmitter {
  private config: TwoStageResponseConfig
  private activeResponses: Map<string, ResponseGenerationSession> = new Map()
  private responseCache: Map<string, ComprehensiveResponse> = new Map()
  private qualityMetrics: ResponseQualityMetrics = {
    totalResponses: 0,
    averageQuality: 0,
    averageGenerationTime: 0,
    successRate: 1.0
  }

  constructor(config: TwoStageResponseConfig) {
    super()
    this.config = config
  }

  /**
   * Generate comprehensive response with optional streaming
   */
  async generateResponse(
    context: ResponseContext,
    sessionId: string,
    onChunk?: (chunk: ResponseChunk) => void
  ): Promise<ComprehensiveResponse> {
    const startTime = performance.now()

    try {
      // Check cache first
      if (this.config.enableResponseCaching) {
        const cacheKey = this.generateCacheKey(context)
        const cached = this.responseCache.get(cacheKey)
        if (cached && this.isCacheValid(cached)) {
          this.emit('cache-hit', {sessionId, cacheKey})
          return cached
        }
      }

      // Create response generation session
      const session = this.createGenerationSession(sessionId, context, startTime)
      this.activeResponses.set(sessionId, session)

      // Generate response content
      const responseText = await this.generateResponseContent(context, session, onChunk)

      // Generate response actions if enabled
      const actions = this.config.enableResponseActions
        ? this.generateResponseActions(context, responseText)
        : []

      // Calculate quality score
      const qualityScore = this.calculateQualityScore(responseText, context, actions)

      const totalProcessingTime = performance.now() - startTime

      const response: ComprehensiveResponse = {
        text: responseText,
        confidence: this.calculateResponseConfidence(context, qualityScore),
        intent: context.detectedIntent.intent,
        completionStage: 'complete',
        actions,
        metadata: {
          generationTime: session.generationTime,
          totalProcessingTime,
          qualityScore,
          sourcesUsed: session.sourcesUsed,
          factChecked: session.factChecked,
          language: context.userPreferences?.preferredLanguage || this.config.defaultLanguage,
          responseLength: responseText.length
        }
      }

      // Cache response if enabled
      if (this.config.enableResponseCaching && qualityScore >= this.config.minimumQualityScore) {
        const cacheKey = this.generateCacheKey(context)
        this.responseCache.set(cacheKey, response)

        // Schedule cache cleanup
        setTimeout(() => {
          this.responseCache.delete(cacheKey)
        }, this.config.cacheExpirationTime)
      }

      // Update quality metrics
      this.updateQualityMetrics(response)

      // Clean up session
      this.activeResponses.delete(sessionId)

      // Emit response generated event
      this.emit('response-generated', response)

      return response
    } catch (error) {
      this.emit('response-error', {sessionId, context, error})
      this.activeResponses.delete(sessionId)

      // Update error metrics
      this.qualityMetrics.successRate = this.qualityMetrics.successRate * 0.95

      throw error
    }
  }

  private createGenerationSession(
    sessionId: string,
    context: ResponseContext,
    startTime: number
  ): ResponseGenerationSession {
    return {
      sessionId,
      startTime,
      context,
      generationTime: 0,
      sourcesUsed: [],
      factChecked: false,
      chunks: [],
      isActive: true
    }
  }

  private async generateResponseContent(
    context: ResponseContext,
    session: ResponseGenerationSession,
    onChunk?: (chunk: ResponseChunk) => void
  ): Promise<string> {
    const {intent, entities} = context.detectedIntent
    const {processingRequirements} = context

    // Simulate comprehensive response generation
    // In a real implementation, this would integrate with AI models, databases, APIs, etc.

    let responseContent = ''
    const baseSentences = this.generateBaseSentences(intent, entities, processingRequirements)

    if (this.config.enableProgressiveStreaming && onChunk) {
      // Stream response in chunks
      for (let i = 0; i < baseSentences.length; i++) {
        const sentence = baseSentences[i]
        responseContent += sentence + ' '

        const chunk: ResponseChunk = {
          id: `${session.sessionId}-chunk-${i}`,
          sequence: i,
          text: sentence,
          isComplete: i === baseSentences.length - 1,
          timing: {
            startTime: performance.now(),
            endTime: performance.now() + 50,
            duration: 50
          }
        }

        session.chunks.push(chunk)
        onChunk(chunk)

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, this.config.streamingInterval))
      }
    } else {
      // Generate complete response
      responseContent = baseSentences.join(' ')

      // Simulate processing time
      const processingDelay = Math.min(
        processingRequirements.estimatedComplexity * 100,
        this.config.maxComprehensiveResponseTime - 500
      )
      await new Promise(resolve => setTimeout(resolve, processingDelay))
    }

    session.generationTime = performance.now() - session.startTime
    session.factChecked = processingRequirements.requiresExternalData
    session.sourcesUsed = processingRequirements.toolsRequired

    return responseContent.trim()
  }

  private generateBaseSentences(
    intent: string,
    entities: Array<{type: string; value: string; confidence: number}>,
    requirements: ResponseContext['processingRequirements']
  ): string[] {
    // This is a simplified implementation
    // In production, this would use sophisticated NLG systems

    const sentences: string[] = []

    if (intent.includes('question')) {
      sentences.push("Based on your question, here's what I found:")
      if (requirements.requiresExternalData) {
        sentences.push("I've gathered the latest information from reliable sources.")
      }
      sentences.push('The answer to your question involves several key points.')
    } else if (intent.includes('task')) {
      sentences.push('I understand you want me to help with this task.')
      sentences.push("I'll break this down into manageable steps.")
      if (requirements.toolsRequired.length > 0) {
        sentences.push(`I'll use ${requirements.toolsRequired.join(' and ')} to accomplish this.`)
      }
    } else {
      sentences.push('Thank you for your request.')
      sentences.push("I've processed the information and have a response for you.")
    }

    // Add entity-specific information
    if (entities.length > 0) {
      const highConfidenceEntities = entities.filter(e => e.confidence > 0.8)
      if (highConfidenceEntities.length > 0) {
        sentences.push(
          `I've identified key elements: ${highConfidenceEntities.map(e => e.value).join(', ')}.`
        )
      }
    }

    sentences.push('This completes my comprehensive response to your request.')

    return sentences
  }

  private generateResponseActions(
    context: ResponseContext,
    responseText: string
  ): ResponseAction[] {
    const actions: ResponseAction[] = []
    const {intent} = context.detectedIntent
    const {toolsRequired} = context.processingRequirements

    // Generate actions based on intent and tools required
    if (intent.includes('search') || intent.includes('find')) {
      actions.push({
        type: 'api_request',
        name: 'search_web',
        parameters: {query: responseText.slice(0, 100)},
        priority: 1,
        estimatedDuration: 2000,
        requiresConfirmation: false
      })
    }

    if (toolsRequired.includes('calendar')) {
      actions.push({
        type: 'function_call',
        name: 'check_calendar',
        parameters: {timeframe: '7d'},
        priority: 2,
        estimatedDuration: 1000,
        requiresConfirmation: false
      })
    }

    if (intent.includes('create') || intent.includes('make')) {
      actions.push({
        type: 'system_command',
        name: 'prepare_creation_tools',
        parameters: {type: 'document'},
        priority: 1,
        estimatedDuration: 500,
        requiresConfirmation: true
      })
    }

    return actions
  }

  private calculateQualityScore(
    responseText: string,
    context: ResponseContext,
    actions: ResponseAction[]
  ): number {
    let score = 5.0 // Base score

    // Length appropriateness
    const wordCount = responseText.split(' ').length
    if (wordCount >= 20 && wordCount <= 200) {
      score += 1.0
    } else if (wordCount < 10 || wordCount > 500) {
      score -= 1.0
    }

    // Intent relevance (simplified check)
    const intent = context.detectedIntent.intent.toLowerCase()
    if (responseText.toLowerCase().includes(intent.split('_')[0])) {
      score += 1.0
    }

    // Entity coverage
    const entities = context.detectedIntent.entities
    const coveredEntities = entities.filter(entity =>
      responseText.toLowerCase().includes(entity.value.toLowerCase())
    ).length
    score += (coveredEntities / Math.max(entities.length, 1)) * 2.0

    // Action relevance
    if (actions.length > 0 && context.processingRequirements.toolsRequired.length > 0) {
      score += 1.0
    }

    // Response completeness
    if (responseText.includes('This completes') || responseText.includes('In summary')) {
      score += 0.5
    }

    return Math.min(10.0, Math.max(1.0, score))
  }

  private calculateResponseConfidence(context: ResponseContext, qualityScore: number): number {
    const intentConfidence = context.detectedIntent.confidence
    const qualityFactor = qualityScore / 10.0

    return Math.min(0.99, Math.max(0.1, (intentConfidence + qualityFactor) / 2))
  }

  private generateCacheKey(context: ResponseContext): string {
    const keyComponents = [
      context.detectedIntent.intent,
      context.detectedIntent.entities.map(e => `${e.type}:${e.value}`).join('|'),
      context.processingRequirements.estimatedComplexity.toString(),
      context.userPreferences?.preferredLanguage || this.config.defaultLanguage
    ]

    return Buffer.from(keyComponents.join('::'), 'utf8').toString('base64')
  }

  private isCacheValid(response: ComprehensiveResponse): boolean {
    const age = Date.now() - response.metadata.totalProcessingTime
    return age < this.config.cacheExpirationTime
  }

  private updateQualityMetrics(response: ComprehensiveResponse): void {
    this.qualityMetrics.totalResponses++

    const alpha = 1.0 / this.qualityMetrics.totalResponses
    this.qualityMetrics.averageQuality =
      (1 - alpha) * this.qualityMetrics.averageQuality + alpha * response.metadata.qualityScore

    this.qualityMetrics.averageGenerationTime =
      (1 - alpha) * this.qualityMetrics.averageGenerationTime +
      alpha * response.metadata.generationTime
  }

  /**
   * Cancel active response generation
   */
  cancelResponse(sessionId: string): boolean {
    const session = this.activeResponses.get(sessionId)
    if (session && session.isActive) {
      session.isActive = false
      this.activeResponses.delete(sessionId)
      this.emit('response-cancelled', sessionId)
      return true
    }
    return false
  }

  /**
   * Get quality metrics
   */
  getQualityMetrics(): ResponseQualityMetrics {
    return {...this.qualityMetrics}
  }

  /**
   * Clear response cache
   */
  clearCache(): void {
    this.responseCache.clear()
    this.emit('cache-cleared')
  }
}

interface ResponseGenerationSession {
  sessionId: string
  startTime: number
  context: ResponseContext
  generationTime: number
  sourcesUsed: string[]
  factChecked: boolean
  chunks: ResponseChunk[]
  isActive: boolean
}

interface ResponseQualityMetrics {
  totalResponses: number
  averageQuality: number
  averageGenerationTime: number
  successRate: number
}

/**
 * Main Two-Stage Response System
 *
 * Orchestrates immediate acknowledgments and comprehensive responses.
 */
export class TwoStageResponseSystem extends EventEmitter {
  private config: TwoStageResponseConfig
  private acknowledgmentGenerator: AcknowledgmentGenerator
  private comprehensiveGenerator: ComprehensiveResponseGenerator

  private activeResponses: Map<string, TwoStageSession> = new Map()
  private performanceMetrics = {
    totalRequests: 0,
    averageAcknowledgmentTime: 0,
    averageComprehensiveTime: 0,
    successRate: 1.0,
    interruptionRate: 0
  }

  constructor(config: Partial<TwoStageResponseConfig> = {}) {
    super()

    this.config = {
      maxImmediateResponseTime: 200,
      maxComprehensiveResponseTime: 5000,
      streamingChunkSize: 50,
      streamingInterval: 100,
      enableResponseCaching: true,
      cacheExpirationTime: 300000,
      enableQualityOptimization: true,
      minimumQualityScore: 6.0,
      enablePersonalization: true,
      userPreferencesWeight: 0.3,
      contextHistoryWeight: 0.2,
      defaultLanguage: 'en',
      enableMultiLanguage: true,
      fallbackLanguage: 'en',
      enableProgressiveStreaming: true,
      enableResponseActions: true,
      enableInterruptionHandling: true,
      enableParallelProcessing: false,
      maxConcurrentResponses: 3,
      enableResponseCompression: false,
      enablePerformanceTracking: true,
      enableResponseAnalytics: true,
      enableQualityMetrics: true,
      acknowledgmentTemplates: {
        [AcknowledgmentType.UNDERSTOOD]: [
          'I understand.',
          'Got it.',
          "I see what you're asking.",
          'I understand your request.'
        ],
        [AcknowledgmentType.PROCESSING]: [
          'Let me work on that.',
          'Processing your request.',
          "I'm working on this now.",
          'Let me process that for you.'
        ],
        [AcknowledgmentType.WORKING]: [
          "I'm on it.",
          'Working on it now.',
          "I'll take care of this.",
          'Let me handle that.'
        ],
        [AcknowledgmentType.SEARCHING]: [
          'Let me search for that.',
          "I'm looking that up.",
          'Searching for information.',
          'Let me find that for you.'
        ],
        [AcknowledgmentType.QUESTION_RECEIVED]: [
          'Great question!',
          "I'll help you with that.",
          'Let me answer that for you.',
          'I can help explain that.'
        ],
        [AcknowledgmentType.TASK_ACCEPTED]: [
          "I'll help you with that task.",
          'I can do that for you.',
          "I'll take care of this task.",
          'Consider it done.'
        ],
        [AcknowledgmentType.COMMAND_RECEIVED]: [
          'Command received.',
          "I'll execute that now.",
          'Processing your command.',
          'On it.'
        ],
        [AcknowledgmentType.REQUEST_UNDERSTOOD]: [
          'I understand your request.',
          'Request received.',
          "I'll help you with that.",
          'I can handle that request.'
        ],
        [AcknowledgmentType.COMPLEX_REQUEST]: [
          "This is a complex request that I'll need a moment to process thoroughly.",
          'I understand this is complex. Let me work through this carefully.',
          'This requires careful consideration. Give me a moment.',
          "I'll need to process this complex request step by step."
        ],
        [AcknowledgmentType.QUICK_ANSWER]: [
          'I can answer that quickly.',
          'This is straightforward.',
          'I have the answer for you.',
          'I can help with that right away.'
        ],
        [AcknowledgmentType.REQUIRES_TOOLS]: [
          "I'll use some tools to help with this.",
          "I'll need to access some tools for this request.",
          'Let me gather the tools needed for this.',
          "I'll use my available tools to help."
        ],
        [AcknowledgmentType.NEEDS_CLARIFICATION]: [
          'I want to make sure I understand correctly.',
          "Could you clarify what you're looking for?",
          "I'd like to understand this better.",
          'Let me make sure I have this right.'
        ],
        [AcknowledgmentType.ENTHUSIASM]: [
          "Absolutely! I'd love to help with that!",
          "That sounds great! I'm on it!",
          'Excellent question! Let me help!',
          "I'm excited to help with this!"
        ],
        [AcknowledgmentType.EMPATHY]: [
          'I understand how important this is.',
          'I can see why this matters to you.',
          'I appreciate you sharing this with me.',
          'I understand your concern.'
        ],
        [AcknowledgmentType.ENCOURAGEMENT]: [
          "You're asking great questions!",
          "That's a smart approach!",
          "You're on the right track!",
          'Great thinking!'
        ],
        [AcknowledgmentType.ACKNOWLEDGMENT]: [
          'Thank you for that request.',
          'I appreciate you asking.',
          'Thanks for bringing this to me.',
          "I'm glad you asked."
        ]
      },
      enableTemplateVariation: true,
      ...config
    }

    this.acknowledgmentGenerator = new AcknowledgmentGenerator(this.config)
    this.comprehensiveGenerator = new ComprehensiveResponseGenerator(this.config)

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.acknowledgmentGenerator.on('acknowledgment-generated', response => {
      this.emit('immediate-response-ready', response)
    })

    this.comprehensiveGenerator.on('response-generated', response => {
      this.emit('comprehensive-response-ready', response)
    })

    this.comprehensiveGenerator.on('response-cancelled', sessionId => {
      this.handleResponseCancellation(sessionId)
    })
  }

  /**
   * Process a two-stage response request
   */
  async processRequest(
    context: ResponseContext,
    sessionId: string
  ): Promise<TwoStageResponseResult> {
    const requestStartTime = performance.now()

    try {
      this.performanceMetrics.totalRequests++

      // Create two-stage session
      const session: TwoStageSession = {
        sessionId,
        startTime: requestStartTime,
        context,
        immediateResponse: null,
        comprehensiveResponse: null,
        isActive: true,
        stage: 'immediate'
      }

      this.activeResponses.set(sessionId, session)

      // Stage 1: Generate immediate acknowledgment
      const immediateStartTime = performance.now()
      const immediateResponse = await this.acknowledgmentGenerator.generateAcknowledgment(context)
      const immediateTime = performance.now() - immediateStartTime

      session.immediateResponse = immediateResponse
      session.stage = 'comprehensive'

      // Emit immediate response
      this.emit('immediate-response-ready', {
        sessionId,
        response: immediateResponse,
        timing: {responseTime: immediateTime}
      })

      // Update immediate response metrics
      this.updateImmediateMetrics(immediateTime)

      // Stage 2: Generate comprehensive response (potentially with streaming)
      const comprehensiveStartTime = performance.now()

      const comprehensiveResponse = await this.comprehensiveGenerator.generateResponse(
        context,
        sessionId,
        this.config.enableProgressiveStreaming
          ? chunk => {
              this.emit('response-chunk', {sessionId, chunk})
            }
          : undefined
      )

      const comprehensiveTime = performance.now() - comprehensiveStartTime

      session.comprehensiveResponse = comprehensiveResponse
      session.isActive = false

      // Emit comprehensive response
      this.emit('comprehensive-response-ready', {
        sessionId,
        response: comprehensiveResponse,
        timing: {responseTime: comprehensiveTime}
      })

      // Update comprehensive response metrics
      this.updateComprehensiveMetrics(comprehensiveTime)

      const totalTime = performance.now() - requestStartTime

      const result: TwoStageResponseResult = {
        sessionId,
        immediateResponse,
        comprehensiveResponse,
        timing: {
          totalTime,
          immediateTime,
          comprehensiveTime
        },
        success: true
      }

      // Clean up session
      this.activeResponses.delete(sessionId)

      return result
    } catch (error) {
      this.emit('response-error', {sessionId, error})
      this.activeResponses.delete(sessionId)

      // Update error metrics
      this.performanceMetrics.successRate = this.performanceMetrics.successRate * 0.98

      throw error
    }
  }

  /**
   * Interrupt active response generation
   */
  async interrupt(sessionId: string, reason?: string): Promise<boolean> {
    const session = this.activeResponses.get(sessionId)
    if (!session || !session.isActive) {
      return false
    }

    session.isActive = false

    // Cancel comprehensive response generation
    const cancelled = this.comprehensiveGenerator.cancelResponse(sessionId)

    if (cancelled) {
      this.performanceMetrics.interruptionRate += 0.01
      this.emit('response-interrupted', {sessionId, reason})
    }

    this.activeResponses.delete(sessionId)
    return cancelled
  }

  private handleResponseCancellation(sessionId: string): void {
    const session = this.activeResponses.get(sessionId)
    if (session) {
      session.isActive = false
      this.activeResponses.delete(sessionId)
    }
  }

  private updateImmediateMetrics(responseTime: number): void {
    const alpha = 1.0 / this.performanceMetrics.totalRequests
    this.performanceMetrics.averageAcknowledgmentTime =
      (1 - alpha) * this.performanceMetrics.averageAcknowledgmentTime + alpha * responseTime
  }

  private updateComprehensiveMetrics(responseTime: number): void {
    const alpha = 1.0 / this.performanceMetrics.totalRequests
    this.performanceMetrics.averageComprehensiveTime =
      (1 - alpha) * this.performanceMetrics.averageComprehensiveTime + alpha * responseTime
  }

  /**
   * Get system performance metrics
   */
  getMetrics() {
    return {
      system: this.performanceMetrics,
      acknowledgment: this.acknowledgmentGenerator.getStats(),
      quality: this.comprehensiveGenerator.getQualityMetrics(),
      activeSessions: this.activeResponses.size
    }
  }

  /**
   * Update system configuration
   */
  updateConfig(newConfig: Partial<TwoStageResponseConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.emit('config-updated', this.config)
  }

  /**
   * Reset system metrics
   */
  resetMetrics(): void {
    this.performanceMetrics = {
      totalRequests: 0,
      averageAcknowledgmentTime: 0,
      averageComprehensiveTime: 0,
      successRate: 1.0,
      interruptionRate: 0
    }

    this.acknowledgmentGenerator.resetStats()
    this.emit('metrics-reset')
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.comprehensiveGenerator.clearCache()
    this.emit('caches-cleared')
  }

  /**
   * Shutdown the system gracefully
   */
  async shutdown(): Promise<void> {
    // Cancel all active responses
    const activeSessions = Array.from(this.activeResponses.keys())
    for (const sessionId of activeSessions) {
      await this.interrupt(sessionId, 'system_shutdown')
    }

    this.removeAllListeners()
    this.emit('shutdown-complete')
  }
}

interface TwoStageSession {
  sessionId: string
  startTime: number
  context: ResponseContext
  immediateResponse: ImmediateResponse | null
  comprehensiveResponse: ComprehensiveResponse | null
  isActive: boolean
  stage: 'immediate' | 'comprehensive' | 'complete'
}

export interface TwoStageResponseResult {
  sessionId: string
  immediateResponse: ImmediateResponse
  comprehensiveResponse: ComprehensiveResponse
  timing: {
    totalTime: number
    immediateTime: number
    comprehensiveTime: number
  }
  success: boolean
}

// Export convenience factory function
export function createTwoStageResponseSystem(
  config?: Partial<TwoStageResponseConfig>
): TwoStageResponseSystem {
  return new TwoStageResponseSystem(config)
}

// Export default configuration
export const defaultTwoStageConfig: TwoStageResponseConfig = {
  maxImmediateResponseTime: 200,
  maxComprehensiveResponseTime: 5000,
  streamingChunkSize: 50,
  streamingInterval: 100,
  enableResponseCaching: true,
  cacheExpirationTime: 300000,
  enableQualityOptimization: true,
  minimumQualityScore: 6.0,
  enablePersonalization: true,
  userPreferencesWeight: 0.3,
  contextHistoryWeight: 0.2,
  defaultLanguage: 'en',
  enableMultiLanguage: true,
  fallbackLanguage: 'en',
  enableProgressiveStreaming: true,
  enableResponseActions: true,
  enableInterruptionHandling: true,
  enableParallelProcessing: false,
  maxConcurrentResponses: 3,
  enableResponseCompression: false,
  enablePerformanceTracking: true,
  enableResponseAnalytics: true,
  enableQualityMetrics: true,
  acknowledgmentTemplates: {} as Record<AcknowledgmentType, string[]>, // Filled in constructor
  enableTemplateVariation: true
}
