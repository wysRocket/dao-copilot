/**
 * Intelligent Question Answering Controller
 * 
 * This module integrates the QuestionDetector with SearchService and AnswerSynthesizer
 * to provide a complete question detection and answering pipeline. It coordinates
 * the flow from question detection through search execution to answer synthesis.
 * 
 * Features:
 * - Seamless integration between QuestionDetector, SearchService, and AnswerSynthesizer
 * - Intelligent question routing based on question type and complexity
 * - Context-aware answer generation with source credibility assessment
 * - Real-time processing with VAD interruption support
 * - Comprehensive response metadata and confidence scoring
 * - Performance monitoring and analytics across all components
 */

import { EventEmitter } from 'events'
import { QuestionDetector, QuestionAnalysis, QuestionDetectionConfig } from './question-detector'
import { SearchService } from './search-service'
import { AnswerSynthesizer, AnswerRequest, AnswerResponse } from './answer-synthesizer'
import { SourceCredibilityService } from './source-credibility-service'
import { QueryExpansionService } from './query-expansion-service'
import { InterruptibleToolCallHandler } from './interruptible-tool-call-handler'
import { logger } from './gemini-logger'

// Types and interfaces
interface QuestionAnsweringConfig {
  // Component configuration
  questionDetection: Partial<QuestionDetectionConfig>
  
  // Processing settings
  enableContextualAnswering: boolean
  enableSourceCredibility: boolean
  enableQueryExpansion: boolean
  
  // Response settings
  maxSearchResults: number
  answerLength: 'brief' | 'detailed' | 'comprehensive'
  includeSourceMetadata: boolean
  includeConfidenceScores: boolean
  
  // Performance settings
  enableCaching: boolean
  processingTimeout: number // milliseconds
  enableBatchProcessing: boolean
  
  // Quality settings
  minimumConfidence: number // 0-1 for both question detection and answer synthesis
  requireSourceCredibility: boolean
  enableFactChecking: boolean
}

interface ProcessingContext {
  conversationId?: string
  userId?: string
  sessionMetadata?: any
  previousQuestions?: string[]
  currentTopic?: string
  userPreferences?: {
    answerStyle: 'concise' | 'detailed' | 'comprehensive'
    sourcePreference: 'academic' | 'news' | 'general' | 'any'
    confidenceThreshold: number
  }
}

interface QuestionAnsweringResponse {
  // Core response
  answer: string
  confidence: number
  sources: Array<{
    title: string
    url: string
    snippet: string
    credibilityScore?: number
    relevanceScore: number
  }>
  
  // Analysis metadata
  questionAnalysis: QuestionAnalysis
  searchMetadata: {
    query: string
    resultsFound: number
    processingTime: number
    searchStrategy: string
  }
  answerMetadata: {
    synthesisMethod: string
    sourceCount: number
    qualityScore: number
    uncertaintyLevel: number
  }
  
  // Processing information
  processingTime: number
  timestamp: number
  interrupted: boolean
  
  // Quality indicators
  factCheckStatus?: 'verified' | 'uncertain' | 'conflicting' | 'unverified'
  biasAssessment?: {
    biasLevel: 'low' | 'moderate' | 'high'
    biasTypes: string[]
    balanceScore: number
  }
}

interface ProcessingMetrics {
  totalQuestions: number
  questionsDetected: number
  questionsAnswered: number
  averageProcessingTime: number
  averageConfidence: number
  searchSuccessRate: number
  synthesisSuccessRate: number
  interruptionRate: number
  errorRate: number
}

/**
 * Main controller for intelligent question answering
 */
export class QuestionAnsweringController extends EventEmitter {
  private questionDetector: QuestionDetector
  private searchService: SearchService
  private answerSynthesizer: AnswerSynthesizer
  private sourceCredibilityService?: SourceCredibilityService
  private queryExpansionService?: QueryExpansionService
  private toolCallHandler: InterruptibleToolCallHandler
  
  private isInitialized = false
  private config: QuestionAnsweringConfig
  private metrics: ProcessingMetrics
  
  // Processing state
  private activeRequests = new Map<string, {
    startTime: number
    context: ProcessingContext
    abortController: AbortController
  }>()
  
  constructor(
    toolCallHandler: InterruptibleToolCallHandler,
    config: Partial<QuestionAnsweringConfig> = {}
  ) {
    super()
    
    this.toolCallHandler = toolCallHandler
    
    // Default configuration
    this.config = {
      questionDetection: {
        confidenceThreshold: 0.7,
        enableSemanticAnalysis: true,
        enablePatternMatching: true,
        enableContextAnalysis: true
      },
      enableContextualAnswering: true,
      enableSourceCredibility: true,
      enableQueryExpansion: true,
      maxSearchResults: 10,
      answerLength: 'detailed',
      includeSourceMetadata: true,
      includeConfidenceScores: true,
      enableCaching: true,
      processingTimeout: 30000, // 30 seconds
      enableBatchProcessing: false,
      minimumConfidence: 0.6,
      requireSourceCredibility: false,
      enableFactChecking: true,
      ...config
    }\n    \n    // Initialize metrics\n    this.metrics = {\n      totalQuestions: 0,\n      questionsDetected: 0,\n      questionsAnswered: 0,\n      averageProcessingTime: 0,\n      averageConfidence: 0,\n      searchSuccessRate: 0,\n      synthesisSuccessRate: 0,\n      interruptionRate: 0,\n      errorRate: 0\n    }\n    \n    this.initializeComponents()\n    \n    logger.info('QuestionAnsweringController initialized', {\n      config: {\n        enableContextualAnswering: this.config.enableContextualAnswering,\n        enableSourceCredibility: this.config.enableSourceCredibility,\n        answerLength: this.config.answerLength,\n        minimumConfidence: this.config.minimumConfidence\n      }\n    })\n  }\n  \n  /**\n   * Initialize all components\n   */\n  private initializeComponents(): void {\n    // Initialize services\n    if (this.config.enableSourceCredibility) {\n      this.sourceCredibilityService = new SourceCredibilityService()\n    }\n    \n    if (this.config.enableQueryExpansion) {\n      this.queryExpansionService = new QueryExpansionService({\n        strategies: ['hybrid'],\n        maxExpansionTerms: 5,\n        enableCaching: this.config.enableCaching\n      })\n    }\n    \n    // Initialize core components\n    this.questionDetector = new QuestionDetector(this.config.questionDetection)\n    this.searchService = new SearchService(this.toolCallHandler, this.sourceCredibilityService)\n    this.answerSynthesizer = new AnswerSynthesizer({\n      maxSources: this.config.maxSearchResults,\n      answerLength: this.config.answerLength,\n      includeSourceLinks: this.config.includeSourceMetadata,\n      enableFactChecking: this.config.enableFactChecking,\n      minimumConfidence: this.config.minimumConfidence\n    })\n    \n    this.setupEventHandlers()\n  }\n  \n  /**\n   * Setup event handlers for component coordination\n   */\n  private setupEventHandlers(): void {\n    // Question detector events\n    this.questionDetector.on('question_analyzed', (data) => {\n      logger.debug('Question analyzed', {\n        confidence: data.analysis?.confidence,\n        type: data.analysis?.questionType,\n        processingTime: data.processingTime\n      })\n      this.emit('question_analyzed', data)\n    })\n    \n    // Search service events\n    this.searchService.on('search_completed', (data) => {\n      logger.debug('Search completed', {\n        query: data.query,\n        resultsCount: data.results.length,\n        processingTime: data.processingTime\n      })\n      this.emit('search_completed', data)\n    })\n    \n    // Answer synthesizer events\n    this.answerSynthesizer.on('answer_synthesized', (data) => {\n      logger.debug('Answer synthesized', {\n        confidence: data.confidence,\n        sourceCount: data.sourceCount,\n        processingTime: data.processingTime\n      })\n      this.emit('answer_synthesized', data)\n    })\n    \n    // Tool call handler interruption events\n    this.toolCallHandler.on('interrupted', (data) => {\n      logger.info('Processing interrupted', data)\n      this.handleInterruption(data.requestId)\n      this.emit('processing_interrupted', data)\n    })\n  }\n  \n  /**\n   * Initialize the controller and all components\n   */\n  async initialize(): Promise<void> {\n    if (this.isInitialized) return\n    \n    const startTime = performance.now()\n    \n    try {\n      // Initialize components in order\n      await this.toolCallHandler.initialize()\n      \n      if (this.sourceCredibilityService) {\n        await this.sourceCredibilityService.initialize()\n      }\n      \n      if (this.queryExpansionService) {\n        await this.queryExpansionService.initialize()\n      }\n      \n      await this.questionDetector.initialize()\n      await this.searchService.initialize()\n      await this.answerSynthesizer.initialize()\n      \n      this.isInitialized = true\n      \n      const initTime = performance.now() - startTime\n      \n      logger.info('QuestionAnsweringController initialization complete', {\n        initializationTime: initTime.toFixed(2),\n        componentsInitialized: {\n          questionDetector: true,\n          searchService: true,\n          answerSynthesizer: true,\n          sourceCredibility: !!this.sourceCredibilityService,\n          queryExpansion: !!this.queryExpansionService\n        }\n      })\n      \n      this.emit('initialized', { initializationTime: initTime })\n      \n    } catch (error) {\n      logger.error('QuestionAnsweringController initialization failed', {\n        error: error instanceof Error ? error.message : 'Unknown error'\n      })\n      throw error\n    }\n  }\n  \n  /**\n   * Process a potential question and generate an answer if detected\n   */\n  async processQuestion(\n    text: string,\n    context: ProcessingContext = {}\n  ): Promise<QuestionAnsweringResponse | null> {\n    if (!this.isInitialized) {\n      throw new Error('QuestionAnsweringController must be initialized before use')\n    }\n    \n    const requestId = this.generateRequestId()\n    const startTime = performance.now()\n    const abortController = new AbortController()\n    \n    // Track active request\n    this.activeRequests.set(requestId, {\n      startTime,\n      context,\n      abortController\n    })\n    \n    try {\n      this.metrics.totalQuestions++\n      \n      // Step 1: Detect if the text contains a question\n      logger.debug('Starting question detection', { requestId, text: text.substring(0, 100) })\n      \n      const questionAnalysis = await this.questionDetector.detectQuestion(\n        text,\n        this.config.enableContextualAnswering\n      )\n      \n      if (!questionAnalysis || !questionAnalysis.isQuestion) {\n        logger.debug('No question detected', { requestId, confidence: questionAnalysis?.confidence })\n        return null\n      }\n      \n      if (questionAnalysis.confidence < this.config.minimumConfidence) {\n        logger.debug('Question confidence too low', { \n          requestId, \n          confidence: questionAnalysis.confidence,\n          threshold: this.config.minimumConfidence\n        })\n        return null\n      }\n      \n      this.metrics.questionsDetected++\n      \n      // Check for interruption\n      if (abortController.signal.aborted) {\n        throw new Error('Processing interrupted during question detection')\n      }\n      \n      // Step 2: Execute search based on question analysis\n      logger.debug('Executing search', { \n        requestId, \n        questionType: questionAnalysis.questionType,\n        complexity: questionAnalysis.complexity \n      })\n      \n      const searchResult = await this.searchService.executeSearch(\n        text,\n        this.buildSearchContext(questionAnalysis, context)\n      )\n      \n      if (!searchResult.results || searchResult.results.length === 0) {\n        logger.warn('No search results found', { requestId, query: text })\n        // Could return a \"no results\" response instead of null\n        return null\n      }\n      \n      // Check for interruption\n      if (abortController.signal.aborted) {\n        throw new Error('Processing interrupted during search')\n      }\n      \n      // Step 3: Synthesize answer from search results\n      logger.debug('Synthesizing answer', { \n        requestId, \n        resultsCount: searchResult.results.length \n      })\n      \n      const answerRequest: AnswerRequest = {\n        query: text,\n        searchResults: searchResult.results.map(r => ({\n          title: r.title,\n          snippet: r.snippet,\n          url: r.link,\n          source: r.source,\n          relevanceScore: r.relevanceScore || 0.5,\n          credibilityScore: r.credibilityScore || 0.5,\n          metadata: {\n            displayLink: r.displayLink,\n            timestamp: r.timestamp\n          }\n        })),\n        questionType: questionAnalysis.questionType,\n        answerStyle: context.userPreferences?.answerStyle || this.config.answerLength,\n        includeSourceLinks: this.config.includeSourceMetadata,\n        maxSources: this.config.maxSearchResults\n      }\n      \n      const answerResponse = await this.answerSynthesizer.synthesizeAnswer(answerRequest)\n      \n      if (!answerResponse || answerResponse.confidence < this.config.minimumConfidence) {\n        logger.warn('Answer synthesis failed or confidence too low', { \n          requestId, \n          confidence: answerResponse?.confidence,\n          threshold: this.config.minimumConfidence\n        })\n        return null\n      }\n      \n      this.metrics.questionsAnswered++\n      \n      // Step 4: Build comprehensive response\n      const response: QuestionAnsweringResponse = {\n        answer: answerResponse.answer,\n        confidence: Math.min(questionAnalysis.confidence, answerResponse.confidence),\n        sources: answerResponse.sources.map(source => ({\n          title: source.title,\n          url: source.url,\n          snippet: source.snippet,\n          credibilityScore: source.credibilityScore,\n          relevanceScore: source.relevanceScore\n        })),\n        questionAnalysis,\n        searchMetadata: {\n          query: searchResult.query,\n          resultsFound: searchResult.results.length,\n          processingTime: searchResult.processingTime,\n          searchStrategy: searchResult.strategy || 'standard'\n        },\n        answerMetadata: {\n          synthesisMethod: answerResponse.synthesisMethod,\n          sourceCount: answerResponse.sources.length,\n          qualityScore: answerResponse.qualityMetrics?.overallQuality || 0.5,\n          uncertaintyLevel: answerResponse.uncertainty || 0.5\n        },\n        processingTime: performance.now() - startTime,\n        timestamp: Date.now(),\n        interrupted: false\n      }\n      \n      // Add fact checking and bias assessment if enabled\n      if (this.config.enableFactChecking && answerResponse.factCheckResults) {\n        response.factCheckStatus = answerResponse.factCheckResults.overallStatus\n      }\n      \n      if (answerResponse.biasAssessment) {\n        response.biasAssessment = {\n          biasLevel: answerResponse.biasAssessment.overallBias > 0.7 ? 'high' : \n                    answerResponse.biasAssessment.overallBias > 0.3 ? 'moderate' : 'low',\n          biasTypes: answerResponse.biasAssessment.detectedBiases,\n          balanceScore: answerResponse.biasAssessment.balanceScore\n        }\n      }\n      \n      // Update metrics\n      this.updateMetrics(response)\n      \n      logger.info('Question processing complete', {\n        requestId,\n        questionType: questionAnalysis.questionType,\n        confidence: response.confidence,\n        sourceCount: response.sources.length,\n        processingTime: response.processingTime.toFixed(2)\n      })\n      \n      this.emit('question_answered', {\n        requestId,\n        response,\n        processingTime: response.processingTime\n      })\n      \n      return response\n      \n    } catch (error) {\n      this.metrics.errorRate++\n      \n      if (abortController.signal.aborted) {\n        this.metrics.interruptionRate++\n        logger.info('Question processing interrupted', { requestId })\n        \n        return {\n          answer: '',\n          confidence: 0,\n          sources: [],\n          questionAnalysis: questionAnalysis || {\n            isQuestion: false,\n            confidence: 0,\n            questionType: 'conversational',\n            patterns: [],\n            entities: [],\n            intent: { primary: 'information_seeking', urgency: 'medium', scope: 'general' },\n            complexity: 'simple',\n            requiresContext: false,\n            timestamp: Date.now()\n          },\n          searchMetadata: {\n            query: text,\n            resultsFound: 0,\n            processingTime: performance.now() - startTime,\n            searchStrategy: 'interrupted'\n          },\n          answerMetadata: {\n            synthesisMethod: 'interrupted',\n            sourceCount: 0,\n            qualityScore: 0,\n            uncertaintyLevel: 1\n          },\n          processingTime: performance.now() - startTime,\n          timestamp: Date.now(),\n          interrupted: true\n        }\n      }\n      \n      logger.error('Question processing failed', {\n        requestId,\n        error: error instanceof Error ? error.message : 'Unknown error',\n        processingTime: performance.now() - startTime\n      })\n      \n      this.emit('processing_error', {\n        requestId,\n        error,\n        processingTime: performance.now() - startTime\n      })\n      \n      throw error\n      \n    } finally {\n      // Cleanup active request\n      this.activeRequests.delete(requestId)\n    }\n  }\n  \n  /**\n   * Process multiple questions in batch\n   */\n  async processQuestionsBatch(\n    texts: string[],\n    context: ProcessingContext = {}\n  ): Promise<Array<QuestionAnsweringResponse | null>> {\n    if (!this.config.enableBatchProcessing) {\n      return Promise.all(texts.map(text => this.processQuestion(text, context)))\n    }\n    \n    // TODO: Implement optimized batch processing\n    return Promise.all(texts.map(text => this.processQuestion(text, context)))\n  }\n  \n  /**\n   * Build search context from question analysis and processing context\n   */\n  private buildSearchContext(questionAnalysis: QuestionAnalysis, context: ProcessingContext): any {\n    return {\n      conversationId: context.conversationId,\n      questionType: questionAnalysis.questionType,\n      entities: questionAnalysis.entities,\n      complexity: questionAnalysis.complexity,\n      intent: questionAnalysis.intent,\n      previousQuestions: context.previousQuestions,\n      currentTopic: context.currentTopic,\n      userPreferences: context.userPreferences\n    }\n  }\n  \n  /**\n   * Handle processing interruption\n   */\n  private handleInterruption(requestId: string): void {\n    const activeRequest = this.activeRequests.get(requestId)\n    if (activeRequest) {\n      activeRequest.abortController.abort()\n      logger.debug('Request interrupted', { requestId })\n    }\n  }\n  \n  /**\n   * Update performance metrics\n   */\n  private updateMetrics(response: QuestionAnsweringResponse): void {\n    const alpha = 0.1 // Smoothing factor for running averages\n    \n    this.metrics.averageProcessingTime = \n      alpha * response.processingTime + (1 - alpha) * this.metrics.averageProcessingTime\n    \n    this.metrics.averageConfidence = \n      alpha * response.confidence + (1 - alpha) * this.metrics.averageConfidence\n    \n    // Update success rates\n    const totalAttempts = this.metrics.questionsDetected\n    if (totalAttempts > 0) {\n      this.metrics.searchSuccessRate = this.metrics.questionsAnswered / totalAttempts\n      this.metrics.synthesisSuccessRate = this.metrics.questionsAnswered / totalAttempts\n    }\n  }\n  \n  /**\n   * Generate unique request ID\n   */\n  private generateRequestId(): string {\n    return `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`\n  }\n  \n  /**\n   * Get current processing metrics\n   */\n  getMetrics(): ProcessingMetrics {\n    return { ...this.metrics }\n  }\n  \n  /**\n   * Get component metrics\n   */\n  getComponentMetrics(): {\n    questionDetector: any\n    searchService: any\n    answerSynthesizer: any\n    sourceCredibility?: any\n  } {\n    return {\n      questionDetector: this.questionDetector.getMetrics(),\n      searchService: this.searchService.getMetrics(),\n      answerSynthesizer: this.answerSynthesizer.getMetrics(),\n      sourceCredibility: this.sourceCredibilityService?.getMetrics()\n    }\n  }\n  \n  /**\n   * Update configuration\n   */\n  updateConfig(updates: Partial<QuestionAnsweringConfig>): void {\n    Object.assign(this.config, updates)\n    \n    // Update component configurations\n    if (updates.questionDetection) {\n      this.questionDetector.updateConfig(updates.questionDetection)\n    }\n    \n    if (updates.minimumConfidence !== undefined) {\n      this.answerSynthesizer.updateConfig({\n        minimumConfidence: updates.minimumConfidence\n      })\n    }\n    \n    logger.info('QuestionAnsweringController configuration updated', updates)\n    this.emit('config_updated', updates)\n  }\n  \n  /**\n   * Interrupt all active processing\n   */\n  interruptAll(): void {\n    const activeCount = this.activeRequests.size\n    \n    for (const [requestId, request] of this.activeRequests) {\n      request.abortController.abort()\n    }\n    \n    logger.info('Interrupted all active requests', { count: activeCount })\n    this.emit('all_interrupted', { count: activeCount })\n  }\n  \n  /**\n   * Clear all context and caches\n   */\n  clearState(): void {\n    this.questionDetector.clearContext()\n    this.questionDetector.clearCache()\n    \n    // Clear search service cache if available\n    if ('clearCache' in this.searchService) {\n      (this.searchService as any).clearCache()\n    }\n    \n    // Clear answer synthesizer cache if available\n    if ('clearCache' in this.answerSynthesizer) {\n      (this.answerSynthesizer as any).clearCache()\n    }\n    \n    // Reset metrics\n    this.metrics = {\n      totalQuestions: 0,\n      questionsDetected: 0,\n      questionsAnswered: 0,\n      averageProcessingTime: 0,\n      averageConfidence: 0,\n      searchSuccessRate: 0,\n      synthesisSuccessRate: 0,\n      interruptionRate: 0,\n      errorRate: 0\n    }\n    \n    logger.info('QuestionAnsweringController state cleared')\n    this.emit('state_cleared')\n  }\n  \n  /**\n   * Shutdown the controller and all components\n   */\n  async shutdown(): Promise<void> {\n    logger.info('Shutting down QuestionAnsweringController')\n    \n    // Interrupt any active requests\n    this.interruptAll()\n    \n    // Shutdown components\n    if (this.answerSynthesizer) {\n      await this.answerSynthesizer.shutdown()\n    }\n    \n    if (this.searchService) {\n      await this.searchService.shutdown()\n    }\n    \n    if (this.questionDetector) {\n      this.questionDetector.destroy()\n    }\n    \n    if (this.sourceCredibilityService) {\n      await this.sourceCredibilityService.shutdown()\n    }\n    \n    if (this.queryExpansionService) {\n      await this.queryExpansionService.shutdown()\n    }\n    \n    if (this.toolCallHandler) {\n      await this.toolCallHandler.shutdown()\n    }\n    \n    // Clear all data\n    this.activeRequests.clear()\n    this.removeAllListeners()\n    this.isInitialized = false\n    \n    logger.info('QuestionAnsweringController shutdown complete')\n  }\n}\n\nexport default QuestionAnsweringController