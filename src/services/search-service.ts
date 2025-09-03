/**
 * Intelligent Search Service
 * 
 * This module provides an advanced search service that builds on the Enhanced Tool Call Handler
 * and Interruptible Tool Call Handler to deliver intelligent search capabilities with query
 * optimization, result ranking, and comprehensive answer synthesis support.
 * 
 * Features:
 * - Advanced query optimization using NLP techniques
 * - Result ranking with relevance and credibility scoring
 * - Integration with caching and fallback systems
 * - Support for VAD interruption handling
 * - Performance monitoring and analytics
 * - Query expansion and semantic enhancement
 * - Multi-source result aggregation
 */

import { EventEmitter } from 'events'
import { InterruptibleToolCallHandler } from './interruptible-tool-call-handler'
import { QueryExpansionService, ExpandedQuery } from './query-expansion-service'
import { SourceCredibilityService, CredibilityScore } from './source-credibility-service'
import { logger } from './gemini-logger'
import * as natural from 'natural'

// Types and interfaces
interface SearchQuery {
  originalQuestion: string
  optimizedQuery: string
  queryType: 'factual' | 'conceptual' | 'comparison' | 'temporal' | 'procedural'
  intent: 'information' | 'definition' | 'explanation' | 'instructions' | 'news'
  entities: string[]
  keywords: string[]
  context?: {
    conversationId?: string
    previousQueries?: string[]
    userProfile?: any
  }
}

interface SearchResult {
  title: string
  snippet: string
  link: string
  displayLink: string
  source: 'google' | 'bing' | 'duckduckgo' | 'cache' | 'offline'
  timestamp: number
  
  // Metadata
  metadata?: {
    pageRank?: number
    domainAuthority?: number
    publishedDate?: string
    author?: string
    contentType?: string
    language?: string
  }
}

interface RankedResult extends SearchResult {
  relevanceScore: number
  credibilityScore: number
  freshnessScore: number
  combinedScore: number
  rankPosition: number
  
  // Analysis metadata
  analysis?: {
    keywordMatches: number
    semanticSimilarity: number
    entityMatches: number
    contextRelevance: number
    sourceReputation: number
  }
  
  // Detailed credibility assessment from SourceCredibilityService
  detailedCredibility?: CredibilityScore
}

interface SearchMetrics {
  queryProcessingTime: number
  searchExecutionTime: number
  rankingTime: number
  totalResults: number
  relevantResults: number
  averageRelevanceScore: number
  cacheHitRate: number
  sourceDistribution: Record<string, number>
}

/**
 * Query Optimizer for intelligent query enhancement
 */
class QueryOptimizer {
  private stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'what', 'when', 'where', 'who', 'why', 'how'
  ])
  
  private questionWords = new Set([
    'what', 'when', 'where', 'who', 'why', 'how', 'which', 'whose'
  ])
  
  private stemmer = natural.PorterStemmer
  private tokenizer = new natural.WordTokenizer()
  private queryExpansionService: QueryExpansionService
  private sourceCredibilityService?: SourceCredibilityService
  
  constructor(queryExpansionService: QueryExpansionService, sourceCredibilityService?: SourceCredibilityService) {
    this.queryExpansionService = queryExpansionService
    this.sourceCredibilityService = sourceCredibilityService
  }
  
  /**
   * Optimize a search query for better results
   */
  async optimizeQuery(originalQuestion: string, context?: any): Promise<SearchQuery> {
    logger.debug('Optimizing search query', { originalQuestion })
    
    // Basic processing
    const tokens = this.tokenizer.tokenize(originalQuestion.toLowerCase()) || []
    const entities = this.extractEntities(originalQuestion)
    const queryType = this.classifyQueryType(originalQuestion)
    const intent = this.inferIntent(originalQuestion, queryType)
    
    // Remove stop words and extract keywords
    const keywords = tokens
      .filter(token => !this.stopWords.has(token) && token.length > 2)
      .map(token => this.stemmer.stem(token))
    
    // Build base optimized query
    let optimizedQuery = this.buildOptimizedQuery(originalQuestion, tokens, entities, queryType)
    
    // Apply query expansion if service is available
    try {
      const conversationHistory = context?.previousQueries || []
      const expandedResult = await this.queryExpansionService.expandQuery(
        optimizedQuery,
        conversationHistory
      )
      
      if (expandedResult.confidenceScore > 0.6) {
        optimizedQuery = expandedResult.expandedQuery
        logger.debug('Query expansion applied', {
          original: optimizedQuery,
          expanded: expandedResult.expandedQuery,
          confidence: expandedResult.confidenceScore,
          strategy: expandedResult.strategy
        })
      }
    } catch (error) {
      logger.warn('Query expansion failed, using base optimization', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
    
    const searchQuery: SearchQuery = {
      originalQuestion,
      optimizedQuery,
      queryType,
      intent,
      entities,
      keywords,
      context
    }
    
    logger.debug('Query optimization complete', {
      originalLength: originalQuestion.length,
      optimizedLength: optimizedQuery.length,
      queryType,
      intent,
      entitiesCount: entities.length,
      keywordsCount: keywords.length
    })
    
    return searchQuery
  }
  
  /**
   * Extract named entities from the question
   */
  private extractEntities(question: string): string[] {
    const entities: string[] = []
    
    // Simple entity extraction patterns
    const patterns = [
      // Dates and times
      /\b(\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
      // Proper nouns (capitalized words)
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
      // Numbers and measurements
      /\b\d+(?:\.\d+)?\s*(?:percent|%|degrees|miles|kilometers|kg|pounds|dollars|\$)\b/gi,
      // Technical terms and acronyms
      /\b[A-Z]{2,}\b/g
    ]
    
    patterns.forEach(pattern => {
      const matches = question.match(pattern)
      if (matches) {
        entities.push(...matches.map(match => match.trim()))
      }
    })
    
    return [...new Set(entities)] // Remove duplicates
  }
  
  /**
   * Classify the type of query
   */
  private classifyQueryType(question: string): SearchQuery['queryType'] {
    const lowerQuestion = question.toLowerCase()
    
    if (lowerQuestion.includes('what is') || lowerQuestion.includes('define') || lowerQuestion.includes('meaning')) {
      return 'factual'
    }
    
    if (lowerQuestion.includes('how to') || lowerQuestion.includes('instructions') || lowerQuestion.includes('steps')) {
      return 'procedural'
    }
    
    if (lowerQuestion.includes('vs') || lowerQuestion.includes('versus') || lowerQuestion.includes('difference') || lowerQuestion.includes('compare')) {
      return 'comparison'
    }
    
    if (lowerQuestion.includes('when') || lowerQuestion.includes('time') || lowerQuestion.includes('date') || lowerQuestion.includes('history')) {
      return 'temporal'
    }
    
    if (lowerQuestion.includes('explain') || lowerQuestion.includes('why') || lowerQuestion.includes('reason')) {
      return 'conceptual'
    }
    
    return 'factual' // Default
  }
  
  /**
   * Infer the search intent
   */
  private inferIntent(question: string, queryType: SearchQuery['queryType']): SearchQuery['intent'] {
    const lowerQuestion = question.toLowerCase()
    
    if (lowerQuestion.includes('news') || lowerQuestion.includes('latest') || lowerQuestion.includes('recent')) {
      return 'news'
    }
    
    if (queryType === 'procedural') {
      return 'instructions'
    }
    
    if (lowerQuestion.includes('define') || lowerQuestion.includes('what is') || lowerQuestion.includes('meaning')) {
      return 'definition'
    }
    
    if (lowerQuestion.includes('explain') || lowerQuestion.includes('why') || lowerQuestion.includes('how')) {
      return 'explanation'
    }
    
    return 'information' // Default
  }
  
  /**
   * Build the optimized search query
   */
  private buildOptimizedQuery(originalQuestion: string, tokens: string[], entities: string[], queryType: SearchQuery['queryType']): string {
    let optimizedQuery = originalQuestion
    
    // Remove question words that don't add search value
    const searchTokens = tokens.filter(token => 
      !this.questionWords.has(token) || 
      ['how', 'why', 'when', 'where'].includes(token) // Keep some question words
    )
    
    // Add search operators based on query type
    if (queryType === 'temporal') {
      optimizedQuery += ' time:recent'
    } else if (queryType === 'comparison') {
      optimizedQuery += ' comparison vs'
    } else if (queryType === 'procedural') {
      optimizedQuery += ' tutorial guide steps'
    }
    
    // Add important entities as quoted phrases
    const importantEntities = entities.filter(entity => entity.length > 3)
    if (importantEntities.length > 0) {
      const quotedEntities = importantEntities.slice(0, 2).map(entity => `"${entity}"`).join(' ')
      optimizedQuery = `${quotedEntities} ${optimizedQuery}`
    }
    
    return optimizedQuery.trim()
  }
}

/**
 * Result Ranker for intelligent result scoring and ranking
 */
class ResultRanker {
  private domainScores = new Map<string, number>([
    // High credibility domains
    ['wikipedia.org', 0.95],
    ['britannica.com', 0.9],
    ['gov', 0.9], // .gov domains
    ['edu', 0.85], // .edu domains
    ['nature.com', 0.9],
    ['science.org', 0.9],
    ['reuters.com', 0.85],
    ['bbc.com', 0.8],
    ['cnn.com', 0.75],
    ['nytimes.com', 0.8],
    
    // Medium credibility
    ['stackoverflow.com', 0.8],
    ['github.com', 0.75],
    ['medium.com', 0.6],
    ['reddit.com', 0.5],
    
    // Lower credibility (but may have good information)
    ['quora.com', 0.5],
    ['yahoo.com', 0.4],
    ['about.com', 0.4]
  ])
  
  private sourceCredibilityService?: SourceCredibilityService
  
  constructor(sourceCredibilityService?: SourceCredibilityService) {
    this.sourceCredibilityService = sourceCredibilityService
  }
  
  /**
   * Rank search results based on multiple factors
   */
  rankResults(results: SearchResult[], searchQuery: SearchQuery): RankedResult[] {
    logger.debug('Ranking search results', {
      resultCount: results.length,
      queryType: searchQuery.queryType,
      intent: searchQuery.intent
    })
    
    const rankedResults: RankedResult[] = results.map((result, index) => {
      const relevanceScore = this.calculateRelevanceScore(result, searchQuery)
      
      // Get credibility score and detailed assessment
      let credibilityScore = 0.5
      let detailedCredibility: CredibilityScore | undefined
      
      if (this.sourceCredibilityService) {
        try {
          detailedCredibility = this.sourceCredibilityService.calculateCredibilityScore(
            result.title,
            result.snippet,
            result.link,
            result.displayLink
          )
          credibilityScore = detailedCredibility.overallScore
        } catch (error) {
          logger.warn('SourceCredibilityService error, using fallback', { error })
          credibilityScore = this.calculateCredibilityScore(result)
        }
      } else {
        credibilityScore = this.calculateCredibilityScore(result)
      }
      
      const freshnessScore = this.calculateFreshnessScore(result, searchQuery.intent)
      
      // Combined score with weighted factors
      const combinedScore = (
        relevanceScore * 0.5 +
        credibilityScore * 0.3 +
        freshnessScore * 0.2
      )
      
      const rankedResult: RankedResult = {
        ...result,
        relevanceScore,
        credibilityScore,
        freshnessScore,
        combinedScore,
        rankPosition: index + 1, // Will be updated after sorting
        analysis: {
          keywordMatches: this.countKeywordMatches(result, searchQuery.keywords),
          semanticSimilarity: this.calculateSemanticSimilarity(result, searchQuery),
          entityMatches: this.countEntityMatches(result, searchQuery.entities),
          contextRelevance: this.calculateContextRelevance(result, searchQuery),
          sourceReputation: this.getSourceReputation(result.displayLink)
        },
        detailedCredibility
      }
      
      return rankedResult
    })
    
    // Sort by combined score (highest first)
    rankedResults.sort((a, b) => b.combinedScore - a.combinedScore)
    
    // Update rank positions
    rankedResults.forEach((result, index) => {
      result.rankPosition = index + 1
    })
    
    logger.debug('Result ranking complete', {
      topScore: rankedResults[0]?.combinedScore,
      averageScore: rankedResults.reduce((sum, r) => sum + r.combinedScore, 0) / rankedResults.length
    })
    
    return rankedResults
  }
  
  /**
   * Calculate relevance score based on content matching
   */
  private calculateRelevanceScore(result: SearchResult, searchQuery: SearchQuery): number {
    const titleRelevance = this.calculateTextRelevance(result.title, searchQuery)
    const snippetRelevance = this.calculateTextRelevance(result.snippet, searchQuery)
    
    // Weight title higher than snippet
    return (titleRelevance * 0.6 + snippetRelevance * 0.4)
  }
  
  /**
   * Calculate text relevance using keyword matching and TF-IDF-like scoring
   */
  private calculateTextRelevance(text: string, searchQuery: SearchQuery): number {
    const lowerText = text.toLowerCase()
    let score = 0
    
    // Keyword matching
    const keywordMatches = searchQuery.keywords.filter(keyword => 
      lowerText.includes(keyword.toLowerCase())
    ).length
    
    score += (keywordMatches / Math.max(searchQuery.keywords.length, 1)) * 0.4
    
    // Entity matching (weighted higher)
    const entityMatches = searchQuery.entities.filter(entity =>
      lowerText.includes(entity.toLowerCase())
    ).length
    
    score += (entityMatches / Math.max(searchQuery.entities.length, 1)) * 0.6
    
    // Original question relevance
    const questionTokens = searchQuery.originalQuestion.toLowerCase().split(/\s+/)
    const questionMatches = questionTokens.filter(token =>
      token.length > 3 && lowerText.includes(token)
    ).length
    
    score += (questionMatches / Math.max(questionTokens.length, 1)) * 0.3
    
    return Math.min(score, 1.0) // Cap at 1.0
  }
  
  /**
   * Calculate credibility score using SourceCredibilityService or fallback
   */
  private calculateCredibilityScore(result: SearchResult): number {
    // Try using SourceCredibilityService first
    if (this.sourceCredibilityService) {
      try {
        const credibilityScore = this.sourceCredibilityService.calculateCredibilityScore(
          result.title,
          result.snippet,
          result.link,
          result.displayLink
        )
        return credibilityScore.overallScore
      } catch (error) {
        logger.warn('SourceCredibilityService error, using fallback', { error })
      }
    }
    
    // Fallback to domain-based scoring
    let score = 0.5 // Base score
    
    // Domain-based scoring
    const domain = this.extractDomain(result.displayLink)
    const domainScore = this.getDomainCredibilityScore(domain)
    score = Math.max(score, domainScore)
    
    // URL structure analysis
    if (result.link.includes('/wiki/')) score += 0.1 // Wikipedia articles
    if (result.link.includes('https://')) score += 0.05 // HTTPS bonus
    if (result.link.includes('.gov/') || result.link.includes('.edu/')) score += 0.15
    if (result.link.includes('blog') || result.link.includes('opinion')) score -= 0.1
    
    // Content quality indicators
    if (result.snippet.length > 100) score += 0.05 // Substantial content
    if (result.title.length > 10 && result.title.length < 100) score += 0.05 // Good title length
    
    return Math.min(score, 1.0)
  }
  
  /**
   * Calculate freshness score based on recency preferences
   */
  private calculateFreshnessScore(result: SearchResult, intent: SearchQuery['intent']): number {
    const ageInMs = Date.now() - result.timestamp
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24)
    
    let score = 1.0
    
    if (intent === 'news') {
      // News queries prefer very fresh content
      if (ageInDays < 1) score = 1.0
      else if (ageInDays < 7) score = 0.8
      else if (ageInDays < 30) score = 0.5
      else score = 0.2
    } else if (intent === 'information' || intent === 'explanation') {
      // Information queries are less sensitive to age
      if (ageInDays < 30) score = 1.0
      else if (ageInDays < 180) score = 0.9
      else if (ageInDays < 365) score = 0.8
      else score = 0.7
    } else {
      // Definition and instruction queries are least sensitive to age
      score = 0.8 // Constant score
    }
    
    return score
  }
  
  private countKeywordMatches(result: SearchResult, keywords: string[]): number {
    const text = `${result.title} ${result.snippet}`.toLowerCase()
    return keywords.filter(keyword => text.includes(keyword.toLowerCase())).length
  }
  
  private calculateSemanticSimilarity(result: SearchResult, searchQuery: SearchQuery): number {
    // Simplified semantic similarity - in production, use embeddings
    const resultText = `${result.title} ${result.snippet}`.toLowerCase()
    const queryText = searchQuery.originalQuestion.toLowerCase()
    
    const resultTokens = new Set(resultText.split(/\s+/))
    const queryTokens = new Set(queryText.split(/\s+/))
    
    const intersection = new Set([...resultTokens].filter(x => queryTokens.has(x)))
    const union = new Set([...resultTokens, ...queryTokens])
    
    return intersection.size / union.size // Jaccard similarity
  }
  
  private countEntityMatches(result: SearchResult, entities: string[]): number {
    const text = `${result.title} ${result.snippet}`.toLowerCase()
    return entities.filter(entity => text.includes(entity.toLowerCase())).length
  }
  
  private calculateContextRelevance(result: SearchResult, searchQuery: SearchQuery): number {
    // Context relevance based on query type and intent
    let score = 0.5
    
    const resultText = `${result.title} ${result.snippet}`.toLowerCase()
    
    if (searchQuery.queryType === 'procedural' && resultText.includes('how to')) score += 0.3
    if (searchQuery.queryType === 'factual' && resultText.includes('definition')) score += 0.2
    if (searchQuery.queryType === 'comparison' && resultText.includes('vs')) score += 0.3
    if (searchQuery.intent === 'news' && resultText.includes('news')) score += 0.2
    
    return Math.min(score, 1.0)
  }
  
  private getSourceReputation(displayLink: string): number {
    const domain = this.extractDomain(displayLink)
    return this.getDomainCredibilityScore(domain)
  }
  
  private extractDomain(url: string): string {
    try {
      const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      return hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  }
  
  private getDomainCredibilityScore(domain: string): number {
    // Check exact matches first
    if (this.domainScores.has(domain)) {
      return this.domainScores.get(domain)!
    }
    
    // Check TLD-based scoring
    if (domain.endsWith('.gov')) return 0.9
    if (domain.endsWith('.edu')) return 0.85
    if (domain.endsWith('.org')) return 0.7
    if (domain.endsWith('.com')) return 0.6
    
    return 0.5 // Default score
  }
}

/**
 * Main SearchService class
 */
export class SearchService extends EventEmitter {
  private toolCallHandler: InterruptibleToolCallHandler
  private queryOptimizer: QueryOptimizer
  private resultRanker: ResultRanker
  private queryExpansionService: QueryExpansionService
  private sourceCredibilityService?: SourceCredibilityService
  private isInitialized = false
  
  // Configuration
  private config = {
    maxResults: 10,
    minRelevanceScore: 0.3,
    enableQueryExpansion: true,
    enableResultCaching: true,
    searchTimeout: 10000, // 10 seconds
    retryAttempts: 3
  }
  
  // Metrics tracking
  private metrics = {
    totalSearches: 0,
    successfulSearches: 0,
    averageResponseTime: 0,
    cacheHitRate: 0,
    lastSearchTime: 0
  }

  constructor(
    toolCallHandler: InterruptibleToolCallHandler,
    sourceCredibilityService?: SourceCredibilityService
  ) {
    super()
    
    this.toolCallHandler = toolCallHandler
    this.sourceCredibilityService = sourceCredibilityService
    this.queryExpansionService = new QueryExpansionService({
      strategies: ['hybrid'],
      maxExpansionTerms: 5,
      enableCaching: true,
      enableAdaptiveLearning: true
    })
    this.queryOptimizer = new QueryOptimizer(this.queryExpansionService, this.sourceCredibilityService)
    this.resultRanker = new ResultRanker(this.sourceCredibilityService)
    
    this.setupEventHandlers()
    
    logger.info('SearchService initialized', { config: this.config })
  }
  
  /**
   * Initialize the search service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    
    await this.toolCallHandler.initialize()
    await this.queryExpansionService.initialize()
    
    // Initialize source credibility service if available
    if (this.sourceCredibilityService) {
      await this.sourceCredibilityService.initialize()
    }
    
    this.isInitialized = true
    
    logger.info('SearchService fully initialized')
    this.emit('initialized')
  }
  
  /**
   * Execute an intelligent search for a given question
   */
  async executeSearch(question: string, context?: any): Promise<{
    results: RankedResult[]
    searchQuery: SearchQuery
    metrics: SearchMetrics
  }> {
    if (!this.isInitialized) {
      throw new Error('SearchService not initialized. Call initialize() first.')
    }
    
    const startTime = performance.now()
    this.metrics.totalSearches++
    
    try {
      logger.info('Executing intelligent search', { question, contextExists: !!context })
      
      // Step 1: Optimize the query
      const queryStartTime = performance.now()
      const searchQuery = await this.queryOptimizer.optimizeQuery(question, context)
      const queryProcessingTime = performance.now() - queryStartTime
      
      this.emit('query_optimized', { originalQuestion: question, searchQuery })
      
      // Step 2: Execute the search using our robust infrastructure
      const searchStartTime = performance.now()
      const searchResponse = await this.toolCallHandler.executeInterruptibleToolCall({
        tool: 'google_search',
        parameters: {
          query: searchQuery.optimizedQuery,
          limit: this.config.maxResults,
          type: searchQuery.queryType
        },
        context: {
          conversationId: context?.conversationId,
          userId: context?.userId,
          sessionId: context?.sessionId,
          previousQueries: context?.previousQueries
        },
        interruption: {
          priority: this.determinePriority(searchQuery),
          allowInterruptions: true,
          maxInterruptions: 2,
          saveStateOnInterrupt: true,
          resumeTimeout: 15000
        },
        vadMonitoring: {
          enabled: true,
          sensitivity: 0.7,
          silenceTimeout: 3000
        }
      })
      
      const searchExecutionTime = performance.now() - searchStartTime
      
      if (!searchResponse.success) {
        throw new Error(`Search failed: ${searchResponse.error?.message || 'Unknown error'}`)
      }
      
      this.emit('search_executed', {
        searchQuery,
        resultCount: searchResponse.results?.length || 0,
        source: searchResponse.source,
        executionTime: searchExecutionTime
      })
      
      // Step 3: Rank the results
      const rankingStartTime = performance.now()
      const rankedResults = this.resultRanker.rankResults(
        searchResponse.results || [],
        searchQuery
      )
      const rankingTime = performance.now() - rankingStartTime
      
      // Step 4: Filter by minimum relevance score
      const filteredResults = rankedResults.filter(
        result => result.relevanceScore >= this.config.minRelevanceScore
      )
      
      // Step 5: Calculate metrics
      const totalTime = performance.now() - startTime
      const searchMetrics: SearchMetrics = {
        queryProcessingTime,
        searchExecutionTime,
        rankingTime,
        totalResults: rankedResults.length,
        relevantResults: filteredResults.length,
        averageRelevanceScore: filteredResults.reduce((sum, r) => sum + r.relevanceScore, 0) / Math.max(filteredResults.length, 1),
        cacheHitRate: searchResponse.source === 'cache' ? 1 : 0,
        sourceDistribution: this.calculateSourceDistribution(filteredResults)
      }
      
      // Update global metrics
      this.metrics.successfulSearches++
      this.metrics.averageResponseTime = (
        (this.metrics.averageResponseTime * (this.metrics.totalSearches - 1) + totalTime) /
        this.metrics.totalSearches
      )
      this.metrics.lastSearchTime = totalTime
      
      logger.info('Intelligent search complete', {
        totalTime: totalTime.toFixed(2),
        resultCount: filteredResults.length,
        averageRelevance: searchMetrics.averageRelevanceScore.toFixed(3),
        source: searchResponse.source
      })
      
      this.emit('search_complete', {
        searchQuery,
        resultCount: filteredResults.length,
        metrics: searchMetrics,
        totalTime
      })
      
      return {
        results: filteredResults,
        searchQuery,
        metrics: searchMetrics
      }
      
    } catch (error) {
      const totalTime = performance.now() - startTime
      
      logger.error('Search execution failed', {
        question,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: totalTime
      })
      
      this.emit('search_error', {
        question,
        error: error instanceof Error ? error : new Error('Unknown error'),
        executionTime: totalTime
      })
      
      throw error
    }
  }
  
  /**
   * Get comprehensive search service metrics
   */
  getMetrics(): typeof this.metrics & { toolCallMetrics: any } {
    return {
      ...this.metrics,
      toolCallMetrics: this.toolCallHandler.getComprehensiveMetrics(),
      successRate: this.metrics.totalSearches > 0 ? this.metrics.successfulSearches / this.metrics.totalSearches : 0
    }
  }
  
  /**
   * Update service configuration
   */
  updateConfig(updates: Partial<typeof this.config>): void {
    Object.assign(this.config, updates)
    
    logger.info('SearchService configuration updated', updates)
    this.emit('config_updated', updates)
  }
  
  /**
   * Shutdown the search service
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down SearchService')
    
    await this.toolCallHandler.shutdown()
    await this.queryExpansionService.shutdown()
    
    // Shutdown source credibility service if available
    if (this.sourceCredibilityService) {
      await this.sourceCredibilityService.shutdown()
    }
    
    this.removeAllListeners()
    
    logger.info('SearchService shutdown complete')
  }
  
  // Private methods
  
  private determinePriority(searchQuery: SearchQuery): any {
    // Determine priority based on query characteristics
    if (searchQuery.intent === 'news' || searchQuery.queryType === 'temporal') {
      return 'HIGH' // Time-sensitive queries
    }
    
    if (searchQuery.queryType === 'procedural') {
      return 'MEDIUM' // How-to queries are important
    }
    
    return 'LOW' // Default for most informational queries
  }
  
  private calculateSourceDistribution(results: RankedResult[]): Record<string, number> {
    const distribution: Record<string, number> = {}
    
    results.forEach(result => {
      distribution[result.source] = (distribution[result.source] || 0) + 1
    })
    
    return distribution
  }
  
  private setupEventHandlers(): void {
    // Forward relevant events from the tool call handler
    this.toolCallHandler.on('vad_interruption', (data) => {
      this.emit('search_interrupted', data)
    })
    
    this.toolCallHandler.on('vad_resumption', (data) => {
      this.emit('search_resumed', data)
    })
    
    this.toolCallHandler.on('enhanced_tool_call_success', (data) => {
      this.emit('tool_call_success', data)
    })
    
    this.toolCallHandler.on('enhanced_tool_call_error', (data) => {
      this.emit('tool_call_error', data)
    })
  }
}

export default SearchService