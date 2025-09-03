/**
 * Tool Orchestration Patterns for Advanced Google Search Integration
 *
 * This module implements sophisticated orchestration patterns to coordinate
 * search tool interactions, providing flexible and extensible search workflows
 * for the Gemini Live API integration.
 *
 * Patterns Implemented:
 * - Chain of Responsibility: Processing search requests through multiple handlers
 * - Mediator: Coordinating interactions between search components
 * - Strategy: Different search strategies based on query type and context
 */

import {EventEmitter} from 'events'
import {GeminiSearchTools, GoogleSearchFunction} from './gemini-search-tools'
import {SearchResult} from './tool-call-handler'

// ============================================================================
// STRATEGY PATTERN INTERFACES AND IMPLEMENTATIONS
// ============================================================================

/**
 * Search Strategy Interface
 * Defines the contract for different search strategies
 */
export interface SearchStrategy {
  name: string
  description: string
  canHandle(query: string, context?: SearchContext): boolean
  execute(
    query: string,
    options: SearchOptions,
    context?: SearchContext
  ): Promise<SearchStrategyResult>
  getPriority(): number
}

/**
 * Search Context Interface
 * Provides contextual information for search operations
 */
export interface SearchContext {
  userIntent?: string
  conversationHistory?: string[]
  preferredLanguage?: string
  geolocation?: string
  domainPreferences?: string[]
  timeConstraints?: {
    maxResponseTime: number
    priority: 'speed' | 'quality' | 'comprehensive'
  }
  resultFormat?: 'summary' | 'detailed' | 'citations'
}

/**
 * Search Options Interface
 * Configuration options for search execution
 */
export interface SearchOptions {
  maxResults?: number
  includePageContent?: boolean
  generateSummary?: boolean
  language?: string
  country?: string
  timeout?: number
  cacheEnabled?: boolean
}

/**
 * Search Strategy Result Interface
 */
export interface SearchStrategyResult {
  strategy: string
  searchResults?: SearchResult[]
  summary?: string
  keyPoints?: string[]
  citations?: string[]
  additionalData?: Record<string, unknown>
  confidence: number
  processingTime: number
  success: boolean
  error?: string
}

/**
 * Basic Web Search Strategy
 * Handles general web search queries
 */
export class BasicWebSearchStrategy implements SearchStrategy {
  name = 'basic-web-search'
  description = 'General purpose web search for factual information and basic queries'

  constructor(private searchTools: GeminiSearchTools) {}

  canHandle(query: string): boolean {
    // Handle general queries that don't fit specific patterns
    return query.length > 0 && query.length < 200
  }

  getPriority(): number {
    return 1 // Lowest priority - fallback strategy
  }

  async execute(
    query: string,
    options: SearchOptions,
    context?: SearchContext
  ): Promise<SearchStrategyResult> {
    const startTime = Date.now()

    try {
      // Execute basic search
      const searchParams: GoogleSearchFunction = {
        query,
        country: options.country || context?.geolocation,
        language: options.language || context?.preferredLanguage,
        max_results: options.maxResults || 5
      }

      const searchResult = await this.searchTools.google_search(searchParams)

      if (!searchResult.success) {
        throw new Error(searchResult.error || 'Search failed')
      }

      const results = searchResult.results || []
      let summary = ''
      let keyPoints: string[] = []
      let citations: string[] = []

      // Generate summary if requested
      if (options.generateSummary && results.length > 0) {
        const summaryResult = await this.searchTools.summarize_results({
          items: results,
          question: query,
          max_length: 300
        })

        if (summaryResult.success) {
          summary = summaryResult.summary
          keyPoints = summaryResult.keyPoints
          citations = summaryResult.citations
        }
      }

      return {
        strategy: this.name,
        searchResults: results,
        summary,
        keyPoints,
        citations,
        confidence: 0.7,
        processingTime: Date.now() - startTime,
        success: true
      }
    } catch (error) {
      return {
        strategy: this.name,
        confidence: 0,
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

/**
 * Question-Answering Search Strategy
 * Optimized for question-based queries requiring comprehensive answers
 */
export class QuestionAnsweringStrategy implements SearchStrategy {
  name = 'question-answering'
  description = 'Specialized search for questions requiring comprehensive, structured answers'

  constructor(private searchTools: GeminiSearchTools) {}

  canHandle(query: string, context?: SearchContext): boolean {
    const questionWords = [
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'is',
      'are',
      'can',
      'does',
      'do'
    ]
    const queryLower = query.toLowerCase()

    return (
      questionWords.some(word => queryLower.startsWith(word)) ||
      query.includes('?') ||
      context?.userIntent === 'question'
    )
  }

  getPriority(): number {
    return 3 // High priority for questions
  }

  async execute(
    query: string,
    options: SearchOptions,
    context?: SearchContext
  ): Promise<SearchStrategyResult> {
    const startTime = Date.now()

    try {
      // Enhanced search for questions
      const searchParams: GoogleSearchFunction = {
        query: `${query} explanation guide tutorial`,
        country: options.country || context?.geolocation,
        language: options.language || context?.preferredLanguage,
        max_results: Math.min(options.maxResults || 8, 10)
      }

      const searchResult = await this.searchTools.google_search(searchParams)

      if (!searchResult.success) {
        throw new Error(searchResult.error || 'Search failed')
      }

      const results = searchResult.results || []

      // Always generate comprehensive summary for questions
      let summary = ''
      let keyPoints: string[] = []
      let citations: string[] = []

      if (results.length > 0) {
        const summaryResult = await this.searchTools.summarize_results({
          items: results,
          question: query,
          max_length: 500, // Longer summary for questions
          focus_areas: ['explanation', 'steps', 'examples', 'key concepts']
        })

        if (summaryResult.success) {
          summary = summaryResult.summary
          keyPoints = summaryResult.keyPoints
          citations = summaryResult.citations
        }
      }

      return {
        strategy: this.name,
        searchResults: results,
        summary,
        keyPoints,
        citations,
        confidence: 0.9,
        processingTime: Date.now() - startTime,
        success: true
      }
    } catch (error) {
      return {
        strategy: this.name,
        confidence: 0,
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

/**
 * Deep Research Strategy
 * For complex topics requiring multi-source analysis and page content
 */
export class DeepResearchStrategy implements SearchStrategy {
  name = 'deep-research'
  description =
    'Comprehensive research strategy with page content analysis and multi-source synthesis'

  constructor(private searchTools: GeminiSearchTools) {}

  canHandle(query: string, context?: SearchContext): boolean {
    const researchIndicators = [
      'research',
      'analysis',
      'detailed',
      'comprehensive',
      'study',
      'report'
    ]
    const queryLower = query.toLowerCase()

    return (
      researchIndicators.some(indicator => queryLower.includes(indicator)) ||
      query.length > 100 ||
      context?.resultFormat === 'detailed' ||
      context?.timeConstraints?.priority === 'comprehensive'
    )
  }

  getPriority(): number {
    return 2 // Medium-high priority for research
  }

  async execute(
    query: string,
    options: SearchOptions,
    context?: SearchContext
  ): Promise<SearchStrategyResult> {
    const startTime = Date.now()

    try {
      // Comprehensive search with multiple queries
      const mainSearchParams: GoogleSearchFunction = {
        query,
        country: options.country || context?.geolocation,
        language: options.language || context?.preferredLanguage,
        max_results: Math.min(options.maxResults || 7, 10)
      }

      const searchResult = await this.searchTools.google_search(mainSearchParams)

      if (!searchResult.success) {
        throw new Error(searchResult.error || 'Search failed')
      }

      let results = searchResult.results || []

      // Fetch page content for top results if enabled
      if (options.includePageContent && results.length > 0) {
        const fetchPromises = results.slice(0, 3).map(async result => {
          try {
            const pageContent = await this.searchTools.fetch_page({
              url: result.link,
              timeout: 8000,
              include_metadata: true
            })

            if (pageContent.success) {
              // Enhance result with page content
              return {
                ...result,
                pageContent: pageContent.content.substring(0, 2000), // Limit content
                fullTitle: pageContent.title
              }
            }
          } catch {
            // Ignore fetch errors for individual pages
          }
          return result
        })

        const enhancedResults = await Promise.all(fetchPromises)
        results = enhancedResults
      }

      // Generate comprehensive summary
      let summary = ''
      let keyPoints: string[] = []
      let citations: string[] = []

      if (results.length > 0) {
        const summaryResult = await this.searchTools.summarize_results({
          items: results,
          question: query,
          max_length: 800, // Longer summary for research
          focus_areas: ['key findings', 'methodology', 'conclusions', 'evidence', 'analysis']
        })

        if (summaryResult.success) {
          summary = summaryResult.summary
          keyPoints = summaryResult.keyPoints
          citations = summaryResult.citations
        }
      }

      return {
        strategy: this.name,
        searchResults: results,
        summary,
        keyPoints,
        citations,
        confidence: 0.85,
        processingTime: Date.now() - startTime,
        success: true
      }
    } catch (error) {
      return {
        strategy: this.name,
        confidence: 0,
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

// ============================================================================
// CHAIN OF RESPONSIBILITY PATTERN
// ============================================================================

/**
 * Search Request Handler Interface
 * Defines the contract for handlers in the chain of responsibility
 */
export interface SearchRequestHandler {
  setNext(handler: SearchRequestHandler): SearchRequestHandler
  handle(request: SearchRequest): Promise<SearchHandlerResult>
}

/**
 * Search Request Interface
 */
export interface SearchRequest {
  query: string
  options: SearchOptions
  context?: SearchContext
  metadata: {
    requestId: string
    timestamp: number
    priority: number
  }
}

/**
 * Search Handler Result Interface
 */
export interface SearchHandlerResult {
  handled: boolean
  result?: SearchStrategyResult
  error?: string
  handlerName: string
  processingTime: number
  nextAction?: 'continue' | 'stop' | 'retry'
}

/**
 * Abstract Search Handler
 * Base class for implementing chain of responsibility handlers
 */
export abstract class AbstractSearchHandler implements SearchRequestHandler {
  protected nextHandler?: SearchRequestHandler

  setNext(handler: SearchRequestHandler): SearchRequestHandler {
    this.nextHandler = handler
    return handler
  }

  async handle(request: SearchRequest): Promise<SearchHandlerResult> {
    const canHandle = await this.canHandle(request)

    if (canHandle) {
      return await this.doHandle(request)
    } else if (this.nextHandler) {
      return await this.nextHandler.handle(request)
    }

    return {
      handled: false,
      handlerName: this.constructor.name,
      processingTime: 0,
      error: 'No handler could process this request'
    }
  }

  protected abstract canHandle(request: SearchRequest): Promise<boolean>
  protected abstract doHandle(request: SearchRequest): Promise<SearchHandlerResult>
}

/**
 * Validation Handler
 * Validates search requests before processing
 */
export class ValidationHandler extends AbstractSearchHandler {
  protected async canHandle(): Promise<boolean> {
    return true // Always validate
  }

  protected async doHandle(request: SearchRequest): Promise<SearchHandlerResult> {
    const startTime = Date.now()

    try {
      // Validate query
      if (
        !request.query ||
        typeof request.query !== 'string' ||
        request.query.trim().length === 0
      ) {
        return {
          handled: true,
          handlerName: 'ValidationHandler',
          processingTime: Date.now() - startTime,
          error: 'Query is required and must be a non-empty string',
          nextAction: 'stop'
        }
      }

      // Validate query length
      if (request.query.length > 1000) {
        return {
          handled: true,
          handlerName: 'ValidationHandler',
          processingTime: Date.now() - startTime,
          error: 'Query exceeds maximum length of 1000 characters',
          nextAction: 'stop'
        }
      }

      // Validate options
      if (
        request.options.maxResults &&
        (request.options.maxResults < 1 || request.options.maxResults > 20)
      ) {
        return {
          handled: true,
          handlerName: 'ValidationHandler',
          processingTime: Date.now() - startTime,
          error: 'maxResults must be between 1 and 20',
          nextAction: 'stop'
        }
      }

      // Continue to next handler
      if (this.nextHandler) {
        return await this.nextHandler.handle(request)
      }

      return {
        handled: true,
        handlerName: 'ValidationHandler',
        processingTime: Date.now() - startTime,
        nextAction: 'continue'
      }
    } catch (error) {
      return {
        handled: true,
        handlerName: 'ValidationHandler',
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Validation error',
        nextAction: 'stop'
      }
    }
  }
}

/**
 * Cache Handler
 * Checks cache for existing results
 */
export class CacheHandler extends AbstractSearchHandler {
  private cache = new Map<string, SearchStrategyResult>()
  private cacheTimeout = 5 * 60 * 1000 // 5 minutes

  protected async canHandle(request: SearchRequest): Promise<boolean> {
    return request.options.cacheEnabled !== false // Default to true
  }

  protected async doHandle(request: SearchRequest): Promise<SearchHandlerResult> {
    const startTime = Date.now()

    try {
      const cacheKey = this.generateCacheKey(request)
      const cached = this.cache.get(cacheKey)

      if (cached && Date.now() - cached.processingTime < this.cacheTimeout) {
        return {
          handled: true,
          result: {
            ...cached,
            processingTime: Date.now() - startTime
          },
          handlerName: 'CacheHandler',
          processingTime: Date.now() - startTime,
          nextAction: 'stop'
        }
      }

      // Continue to next handler and cache result
      if (this.nextHandler) {
        const result = await this.nextHandler.handle(request)

        if (result.handled && result.result && result.result.success) {
          this.cache.set(cacheKey, result.result)
        }

        return result
      }

      return {
        handled: false,
        handlerName: 'CacheHandler',
        processingTime: Date.now() - startTime
      }
    } catch (error) {
      return {
        handled: true,
        handlerName: 'CacheHandler',
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Cache error',
        nextAction: 'continue'
      }
    }
  }

  private generateCacheKey(request: SearchRequest): string {
    return `${request.query}:${JSON.stringify(request.options)}:${JSON.stringify(request.context)}`
  }

  clearCache(): void {
    this.cache.clear()
  }
}

/**
 * Execution Handler
 * Executes search strategies based on request characteristics
 */
export class ExecutionHandler extends AbstractSearchHandler {
  private strategies: SearchStrategy[] = []

  constructor(searchTools: GeminiSearchTools) {
    super()

    // Initialize strategies
    this.strategies = [
      new DeepResearchStrategy(searchTools),
      new QuestionAnsweringStrategy(searchTools),
      new BasicWebSearchStrategy(searchTools)
    ]

    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority())
  }

  protected async canHandle(): Promise<boolean> {
    return true // Always handle execution
  }

  protected async doHandle(request: SearchRequest): Promise<SearchHandlerResult> {
    const startTime = Date.now()

    try {
      // Find best strategy for this request
      const strategy = this.selectStrategy(request.query, request.context)

      if (!strategy) {
        return {
          handled: true,
          handlerName: 'ExecutionHandler',
          processingTime: Date.now() - startTime,
          error: 'No suitable search strategy found',
          nextAction: 'stop'
        }
      }

      // Execute the strategy
      const result = await strategy.execute(request.query, request.options, request.context)

      return {
        handled: true,
        result,
        handlerName: 'ExecutionHandler',
        processingTime: Date.now() - startTime,
        nextAction: 'stop'
      }
    } catch (error) {
      return {
        handled: true,
        handlerName: 'ExecutionHandler',
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Execution error',
        nextAction: 'stop'
      }
    }
  }

  private selectStrategy(query: string, context?: SearchContext): SearchStrategy | null {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(query, context)) {
        return strategy
      }
    }
    return null
  }

  addStrategy(strategy: SearchStrategy): void {
    this.strategies.push(strategy)
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority())
  }
}

// ============================================================================
// MEDIATOR PATTERN
// ============================================================================

/**
 * Search Mediator Interface
 * Defines the contract for coordinating search component interactions
 */
export interface SearchMediatorInterface {
  executeSearch(request: SearchRequest): Promise<SearchMediatorResult>
  addComponent(component: SearchComponent): void
  removeComponent(component: SearchComponent): void
  notify(sender: SearchComponent, event: string, data?: Record<string, unknown>): void
}

/**
 * Search Component Interface
 * Defines components that can participate in mediated interactions
 */
export interface SearchComponent {
  name: string
  setMediator(mediator: SearchMediatorInterface): void
  handleNotification(event: string, data?: Record<string, unknown>): Promise<void>
}

/**
 * Search Mediator Result Interface
 */
export interface SearchMediatorResult {
  success: boolean
  result?: SearchStrategyResult
  error?: string
  metadata: {
    requestId: string
    processingTime: number
    componentsInvolved: string[]
    handlerChain: string[]
  }
}

/**
 * Concrete Search Mediator
 * Coordinates interactions between search components using patterns
 */
export class SearchMediator extends EventEmitter implements SearchMediatorInterface {
  private components = new Map<string, SearchComponent>()
  private handlerChain?: SearchRequestHandler

  constructor(private searchTools: GeminiSearchTools) {
    super()
    this.setupHandlerChain()
  }

  private setupHandlerChain(): void {
    const validationHandler = new ValidationHandler()
    const cacheHandler = new CacheHandler()
    const executionHandler = new ExecutionHandler(this.searchTools)

    // Build the chain: Validation -> Cache -> Execution
    validationHandler.setNext(cacheHandler).setNext(executionHandler)

    this.handlerChain = validationHandler
  }

  async executeSearch(request: SearchRequest): Promise<SearchMediatorResult> {
    const startTime = Date.now()
    const handlerChain: string[] = []

    try {
      // Notify components about search start
      await this.notifyAll('searchStarted', {request})

      // Process through handler chain
      if (!this.handlerChain) {
        throw new Error('Handler chain not initialized')
      }

      const handlerResult = await this.handlerChain.handle(request)
      handlerChain.push(handlerResult.handlerName)

      if (!handlerResult.handled || !handlerResult.result) {
        throw new Error(handlerResult.error || 'Search request not handled')
      }

      const result = handlerResult.result

      // Notify components about search completion
      await this.notifyAll('searchCompleted', {request, result})

      this.emit('searchCompleted', {
        requestId: request.metadata.requestId,
        success: true,
        result,
        processingTime: Date.now() - startTime
      })

      return {
        success: true,
        result,
        metadata: {
          requestId: request.metadata.requestId,
          processingTime: Date.now() - startTime,
          componentsInvolved: Array.from(this.components.keys()),
          handlerChain
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Notify components about search error
      await this.notifyAll('searchError', {request, error: errorMessage})

      this.emit('searchError', {
        requestId: request.metadata.requestId,
        error: errorMessage,
        processingTime: Date.now() - startTime
      })

      return {
        success: false,
        error: errorMessage,
        metadata: {
          requestId: request.metadata.requestId,
          processingTime: Date.now() - startTime,
          componentsInvolved: Array.from(this.components.keys()),
          handlerChain
        }
      }
    }
  }

  addComponent(component: SearchComponent): void {
    this.components.set(component.name, component)
    component.setMediator(this)
    this.emit('componentAdded', {name: component.name})
  }

  removeComponent(component: SearchComponent): void {
    this.components.delete(component.name)
    this.emit('componentRemoved', {name: component.name})
  }

  notify(sender: SearchComponent, event: string, data?: Record<string, unknown>): void {
    this.emit('componentNotification', {sender: sender.name, event, data})
  }

  private async notifyAll(event: string, data?: Record<string, unknown>): Promise<void> {
    const notifications = Array.from(this.components.values()).map(component =>
      component.handleNotification(event, data)
    )

    await Promise.allSettled(notifications)
  }

  // Utility methods
  clearCache(): void {
    const cacheHandler = this.findCacheHandler(this.handlerChain)
    if (cacheHandler) {
      ;(cacheHandler as CacheHandler).clearCache()
    }
  }

  private findCacheHandler(handler?: SearchRequestHandler): CacheHandler | null {
    if (handler instanceof CacheHandler) {
      return handler
    }
    return null
  }

  getComponents(): string[] {
    return Array.from(this.components.keys())
  }

  updateConfiguration(config: Record<string, unknown>): void {
    this.setupHandlerChain() // Rebuild chain with new config
    this.emit('configurationUpdated', config)
  }
}

// ============================================================================
// EXAMPLE SEARCH COMPONENTS
// ============================================================================

/**
 * Analytics Component
 * Tracks search patterns and performance metrics
 */
export class AnalyticsComponent implements SearchComponent {
  name = 'analytics'
  private mediator?: SearchMediatorInterface
  private metrics = {
    totalSearches: 0,
    averageResponseTime: 0,
    successRate: 0,
    popularQueries: new Map<string, number>()
  }

  setMediator(mediator: SearchMediatorInterface): void {
    this.mediator = mediator
  }

  async handleNotification(event: string, data?: Record<string, unknown>): Promise<void> {
    switch (event) {
      case 'searchStarted':
        this.trackSearchStart(data)
        break
      case 'searchCompleted':
        this.trackSearchCompletion(data)
        break
      case 'searchError':
        this.trackSearchError()
        break
    }
  }

  private trackSearchStart(data?: Record<string, unknown>): void {
    this.metrics.totalSearches++
    if (data?.request && typeof (data.request as Record<string, unknown>).query === 'string') {
      const query = ((data.request as Record<string, unknown>).query as string).toLowerCase()
      this.metrics.popularQueries.set(query, (this.metrics.popularQueries.get(query) || 0) + 1)
    }
  }

  private trackSearchCompletion(data?: Record<string, unknown>): void {
    // Update success rate and response time
    if (
      data?.result &&
      typeof (data.result as Record<string, unknown>).processingTime === 'number'
    ) {
      const processingTime = (data.result as Record<string, unknown>).processingTime as number
      this.metrics.averageResponseTime = (this.metrics.averageResponseTime + processingTime) / 2
    }
  }

  private trackSearchError(): void {
    // Track error rates
  }

  getMetrics() {
    return {...this.metrics}
  }
}

/**
 * Logging Component
 * Provides comprehensive logging for search operations
 */
export class LoggingComponent implements SearchComponent {
  name = 'logging'
  private mediator?: SearchMediatorInterface

  setMediator(mediator: SearchMediatorInterface): void {
    this.mediator = mediator
  }

  async handleNotification(event: string, data?: Record<string, unknown>): Promise<void> {
    const timestamp = new Date().toISOString()

    switch (event) {
      case 'searchStarted':
        console.log(`[${timestamp}] SEARCH STARTED`, {
          data: data || {}
        })
        break
      case 'searchCompleted':
        console.log(`[${timestamp}] SEARCH COMPLETED`, {
          data: data || {}
        })
        break
      case 'searchError':
        console.error(`[${timestamp}] SEARCH ERROR`, {
          data: data || {}
        })
        break
    }
  }
}

export default SearchMediator
