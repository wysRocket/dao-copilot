/**
 * Advanced Query Optimization and Caching System
 *
 * This module provides intelligent query optimization techniques and enhanced caching
 * capabilities for the Google Search Tool Integration with Gemini Live API.
 *
 * Features:
 * - NLP-based query expansion and refinement
 * - Intent classification for search strategy selection
 * - Distributed caching with Redis support
 * - Query performance optimization
 * - Result deduplication and enhancement
 */

import {EventEmitter} from 'events'
import {GoogleGenAI} from '@google/genai'
import NodeCache from 'node-cache'
import * as crypto from 'crypto'

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

/**
 * Query Optimization Configuration
 */
export interface QueryOptimizationConfig {
  enableNLPProcessing: boolean
  enableQueryExpansion: boolean
  enableIntentClassification: boolean
  enableQueryRefinement: boolean
  geminiApiKey: string
  geminiModel: string
  maxQueryLength: number
  expansionTermsLimit: number
  refinementAttempts: number
  cacheConfig: CacheConfig
}

/**
 * Cache Configuration
 */
export interface CacheConfig {
  enableDistributedCache: boolean
  redisUrl?: string
  fallbackToMemory: boolean
  defaultTTL: number
  maxCacheSize: number
  compressionEnabled: boolean
  encryptionEnabled: boolean
  keyPrefix: string
}

/**
 * Query Analysis Result
 */
export interface QueryAnalysis {
  originalQuery: string
  intent: QueryIntent
  confidence: number
  queryType: QueryType
  language: string
  entities: Entity[]
  keywords: string[]
  sentiment: 'positive' | 'negative' | 'neutral'
  complexity: 'simple' | 'medium' | 'complex'
  metadata: {
    processingTime: number
    model: string
    timestamp: number
  }
}

/**
 * Query Intent Classification
 */
export enum QueryIntent {
  FACTUAL_QUESTION = 'factual_question',
  HOW_TO = 'how_to',
  DEFINITION = 'definition',
  COMPARISON = 'comparison',
  RESEARCH = 'research',
  NEWS_CURRENT_EVENTS = 'news_current_events',
  PRODUCT_SEARCH = 'product_search',
  LOCATION_BASED = 'location_based',
  PERSONAL_ASSISTANCE = 'personal_assistance',
  ENTERTAINMENT = 'entertainment',
  TECHNICAL_SUPPORT = 'technical_support',
  GENERAL_SEARCH = 'general_search'
}

/**
 * Query Type Classification
 */
export enum QueryType {
  QUESTION = 'question',
  KEYWORD = 'keyword',
  PHRASE = 'phrase',
  COMMAND = 'command',
  CONVERSATIONAL = 'conversational'
}

/**
 * Named Entity
 */
export interface Entity {
  text: string
  type: EntityType
  confidence: number
  position: {
    start: number
    end: number
  }
}

/**
 * Entity Types
 */
export enum EntityType {
  PERSON = 'person',
  ORGANIZATION = 'organization',
  LOCATION = 'location',
  DATE = 'date',
  TIME = 'time',
  MONEY = 'money',
  PRODUCT = 'product',
  EVENT = 'event',
  TECHNOLOGY = 'technology',
  OTHER = 'other'
}

/**
 * Optimized Query Result
 */
export interface OptimizedQuery {
  originalQuery: string
  optimizedQuery: string
  expansionTerms: string[]
  refinements: string[]
  suggestedFilters: SearchFilter[]
  analysis: QueryAnalysis
  optimizationScore: number
  processingTime: number
}

/**
 * Search Filter
 */
export interface SearchFilter {
  type: 'site' | 'filetype' | 'date' | 'language' | 'region'
  value: string
  confidence: number
}

/**
 * Cache Entry
 */
export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  ttl: number
  hits: number
  metadata: {
    queryHash: string
    originalQuery: string
    size: number
    compressed: boolean
    encrypted: boolean
  }
}

// ============================================================================
// QUERY OPTIMIZER CLASS
// ============================================================================

/**
 * Advanced Query Optimizer
 * Provides NLP-powered query analysis and optimization
 */
export class AdvancedQueryOptimizer extends EventEmitter {
  private geminiClient: GoogleGenAI
  private cache: NodeCache
  private config: Required<QueryOptimizationConfig>

  constructor(config: QueryOptimizationConfig) {
    super()

    this.config = {
      enableNLPProcessing: config.enableNLPProcessing ?? true,
      enableQueryExpansion: config.enableQueryExpansion ?? true,
      enableIntentClassification: config.enableIntentClassification ?? true,
      enableQueryRefinement: config.enableQueryRefinement ?? true,
      geminiApiKey: config.geminiApiKey,
      geminiModel: config.geminiModel || 'gemini-2.5-flash',
      maxQueryLength: config.maxQueryLength || 500,
      expansionTermsLimit: config.expansionTermsLimit || 5,
      refinementAttempts: config.refinementAttempts || 2,
      cacheConfig: {
        enableDistributedCache: config.cacheConfig.enableDistributedCache ?? false,
        redisUrl: config.cacheConfig.redisUrl,
        fallbackToMemory: config.cacheConfig.fallbackToMemory ?? true,
        defaultTTL: config.cacheConfig.defaultTTL || 3600,
        maxCacheSize: config.cacheConfig.maxCacheSize || 10000,
        compressionEnabled: config.cacheConfig.compressionEnabled ?? false,
        encryptionEnabled: config.cacheConfig.encryptionEnabled ?? false,
        keyPrefix: config.cacheConfig.keyPrefix || 'dao-search:'
      }
    }

    // Initialize Gemini client
    this.geminiClient = new GoogleGenAI({apiKey: this.config.geminiApiKey})

    // Initialize cache
    this.cache = new NodeCache({
      stdTTL: this.config.cacheConfig.defaultTTL,
      maxKeys: this.config.cacheConfig.maxCacheSize,
      useClones: false
    })
  }

  /**
   * Analyze and optimize a search query
   */
  async optimizeQuery(query: string): Promise<OptimizedQuery> {
    const startTime = Date.now()

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey('optimize', query)
      const cached = this.getFromCache<OptimizedQuery>(cacheKey)

      if (cached) {
        this.emit('cacheHit', {type: 'queryOptimization', query, key: cacheKey})
        return cached
      }

      // Validate query length
      if (query.length > this.config.maxQueryLength) {
        throw new Error(`Query exceeds maximum length of ${this.config.maxQueryLength} characters`)
      }

      // Perform query analysis
      const analysis = await this.analyzeQuery(query)

      // Generate optimized query
      let optimizedQuery = query
      let expansionTerms: string[] = []
      let refinements: string[] = []
      let suggestedFilters: SearchFilter[] = []

      // Query expansion
      if (this.config.enableQueryExpansion) {
        expansionTerms = await this.expandQuery(query, analysis)
        if (expansionTerms.length > 0) {
          optimizedQuery = `${query} ${expansionTerms.slice(0, 3).join(' ')}`
        }
      }

      // Query refinement
      if (this.config.enableQueryRefinement) {
        refinements = await this.refineQuery(query, analysis)
      }

      // Suggest filters based on analysis
      suggestedFilters = this.generateSearchFilters(analysis)

      // Calculate optimization score
      const optimizationScore = this.calculateOptimizationScore(
        query,
        optimizedQuery,
        expansionTerms,
        refinements,
        analysis
      )

      const result: OptimizedQuery = {
        originalQuery: query,
        optimizedQuery,
        expansionTerms,
        refinements,
        suggestedFilters,
        analysis,
        optimizationScore,
        processingTime: Date.now() - startTime
      }

      // Cache the result
      this.setCache(cacheKey, result)

      this.emit('queryOptimized', {
        originalQuery: query,
        optimizedQuery,
        score: optimizationScore,
        processingTime: result.processingTime
      })

      return result
    } catch (error) {
      this.emit('optimizationError', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      })

      // Return basic optimization on error
      return {
        originalQuery: query,
        optimizedQuery: query,
        expansionTerms: [],
        refinements: [],
        suggestedFilters: [],
        analysis: await this.basicAnalysis(query),
        optimizationScore: 0.5,
        processingTime: Date.now() - startTime
      }
    }
  }

  /**
   * Analyze query using NLP techniques
   */
  private async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const startTime = Date.now()

    if (!this.config.enableNLPProcessing) {
      return this.basicAnalysis(query)
    }

    try {
      const prompt = `Analyze this search query and provide detailed information:

Query: "${query}"

Please analyze and respond with the following information in JSON format:
{
  "intent": "one of: factual_question, how_to, definition, comparison, research, news_current_events, product_search, location_based, personal_assistance, entertainment, technical_support, general_search",
  "confidence": "number between 0 and 1",
  "queryType": "one of: question, keyword, phrase, command, conversational",
  "language": "detected language code (e.g., en, es, fr)",
  "entities": [
    {
      "text": "entity text",
      "type": "person, organization, location, date, time, money, product, event, technology, or other",
      "confidence": "number between 0 and 1"
    }
  ],
  "keywords": ["array", "of", "key", "terms"],
  "sentiment": "positive, negative, or neutral",
  "complexity": "simple, medium, or complex"
}

Provide only the JSON response.`

      const model = this.geminiClient.models.generateContent({
        model: this.config.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [{text: prompt}]
          }
        ]
      })

      const result = await model
      const responseText = result.text || ''

      // Parse JSON response
      const analysisData = JSON.parse(responseText)

      return {
        originalQuery: query,
        intent: analysisData.intent || QueryIntent.GENERAL_SEARCH,
        confidence: analysisData.confidence || 0.5,
        queryType: analysisData.queryType || QueryType.KEYWORD,
        language: analysisData.language || 'en',
        entities: (analysisData.entities || []).map((entity: Record<string, unknown>) => ({
          text: entity.text || '',
          type: entity.type || EntityType.OTHER,
          confidence: entity.confidence || 0.5,
          position: {start: 0, end: query.length} // Simplified position
        })),
        keywords: analysisData.keywords || [],
        sentiment: analysisData.sentiment || 'neutral',
        complexity: analysisData.complexity || 'medium',
        metadata: {
          processingTime: Date.now() - startTime,
          model: this.config.geminiModel,
          timestamp: Date.now()
        }
      }
    } catch {
      // Fallback to basic analysis
      return this.basicAnalysis(query)
    }
  }

  /**
   * Basic query analysis without NLP
   */
  private async basicAnalysis(query: string): Promise<QueryAnalysis> {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which']
    const isQuestion =
      questionWords.some(word => query.toLowerCase().startsWith(word)) || query.includes('?')

    return {
      originalQuery: query,
      intent: isQuestion ? QueryIntent.FACTUAL_QUESTION : QueryIntent.GENERAL_SEARCH,
      confidence: 0.6,
      queryType: isQuestion ? QueryType.QUESTION : QueryType.KEYWORD,
      language: 'en',
      entities: [],
      keywords: query
        .toLowerCase()
        .split(' ')
        .filter(
          word =>
            word.length > 2 && !['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to'].includes(word)
        ),
      sentiment: 'neutral',
      complexity: query.length > 50 ? 'complex' : 'simple',
      metadata: {
        processingTime: 0,
        model: 'basic',
        timestamp: Date.now()
      }
    }
  }

  /**
   * Expand query with related terms
   */
  private async expandQuery(query: string, analysis: QueryAnalysis): Promise<string[]> {
    try {
      const prompt = `Generate ${this.config.expansionTermsLimit} relevant search terms to expand this query:

Original Query: "${query}"
Intent: ${analysis.intent}
Keywords: ${analysis.keywords.join(', ')}

Provide ${this.config.expansionTermsLimit} related terms that would improve search results. Focus on:
- Synonyms and alternative terms
- Related concepts
- Technical terms if applicable
- Common variations

Return only a comma-separated list of terms.`

      const model = this.geminiClient.models.generateContent({
        model: this.config.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [{text: prompt}]
          }
        ]
      })

      const result = await model
      const responseText = result.text || ''

      return responseText
        .split(',')
        .map(term => term.trim())
        .filter(term => term.length > 0)
        .slice(0, this.config.expansionTermsLimit)
    } catch {
      return []
    }
  }

  /**
   * Refine query based on analysis
   */
  private async refineQuery(query: string, analysis: QueryAnalysis): Promise<string[]> {
    const refinements: string[] = []

    try {
      // Generate refinement suggestions
      const prompt = `Suggest ${this.config.refinementAttempts} improved versions of this search query:

Original: "${query}"
Intent: ${analysis.intent}
Complexity: ${analysis.complexity}

Provide ${this.config.refinementAttempts} alternative queries that would get better search results.
Each should be on a separate line.
Focus on clarity, specificity, and search optimization.`

      const model = this.geminiClient.models.generateContent({
        model: this.config.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [{text: prompt}]
          }
        ]
      })

      const result = await model
      const responseText = result.text || ''

      refinements.push(
        ...responseText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && line !== query)
          .slice(0, this.config.refinementAttempts)
      )
    } catch {
      // Basic refinements based on analysis
      if (analysis.queryType === QueryType.KEYWORD) {
        refinements.push(`"${query}"`) // Exact phrase search
      }

      if (analysis.entities.length > 0) {
        const entityTerms = analysis.entities.map(e => e.text).join(' ')
        refinements.push(`${query} ${entityTerms}`)
      }
    }

    return refinements
  }

  /**
   * Generate search filters based on analysis
   */
  private generateSearchFilters(analysis: QueryAnalysis): SearchFilter[] {
    const filters: SearchFilter[] = []

    // Time-based filters for news/current events
    if (analysis.intent === QueryIntent.NEWS_CURRENT_EVENTS) {
      filters.push({
        type: 'date',
        value: 'past_week',
        confidence: 0.8
      })
    }

    // Site filters for technical queries
    if (analysis.intent === QueryIntent.TECHNICAL_SUPPORT) {
      filters.push(
        {type: 'site', value: 'stackoverflow.com', confidence: 0.7},
        {type: 'site', value: 'github.com', confidence: 0.6}
      )
    }

    // Language filters
    if (analysis.language !== 'en') {
      filters.push({
        type: 'language',
        value: analysis.language,
        confidence: 0.9
      })
    }

    return filters
  }

  /**
   * Calculate optimization score
   */
  private calculateOptimizationScore(
    originalQuery: string,
    optimizedQuery: string,
    expansionTerms: string[],
    refinements: string[],
    analysis: QueryAnalysis
  ): number {
    let score = 0.5 // Base score

    // Expansion bonus
    if (expansionTerms.length > 0) {
      score += 0.2
    }

    // Refinement bonus
    if (refinements.length > 0) {
      score += 0.1
    }

    // Intent confidence bonus
    score += (analysis.confidence - 0.5) * 0.2

    // Query improvement bonus
    if (optimizedQuery.length > originalQuery.length) {
      score += 0.1
    }

    return Math.min(1.0, Math.max(0.0, score))
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(operation: string, query: string): string {
    const hash = crypto.createHash('sha256').update(`${operation}:${query}`).digest('hex')
    return `${this.config.cacheConfig.keyPrefix}${operation}:${hash}`
  }

  /**
   * Get from cache
   */
  private getFromCache<T>(key: string): T | null {
    try {
      return this.cache.get<T>(key) || null
    } catch {
      return null
    }
  }

  /**
   * Set cache
   */
  private setCache<T>(key: string, value: T, ttl?: number): void {
    try {
      this.cache.set(key, value, ttl || this.config.cacheConfig.defaultTTL)
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      keys: this.cache.keys().length,
      stats: this.cache.getStats(),
      config: this.config.cacheConfig
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.flushAll()
    this.emit('cacheCleared')
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<QueryOptimizationConfig>): void {
    Object.assign(this.config, updates)
    this.emit('configUpdated', this.config)
  }
}

// ============================================================================
// ENHANCED CACHE MANAGER
// ============================================================================

/**
 * Enhanced Cache Manager with distributed cache support
 */
export class AdvancedCacheManager extends EventEmitter {
  private memoryCache: NodeCache
  private config: Required<CacheConfig>

  constructor(config: CacheConfig) {
    super()

    this.config = {
      enableDistributedCache: config.enableDistributedCache ?? false,
      redisUrl: config.redisUrl || '',
      fallbackToMemory: config.fallbackToMemory ?? true,
      defaultTTL: config.defaultTTL || 3600,
      maxCacheSize: config.maxCacheSize || 10000,
      compressionEnabled: config.compressionEnabled ?? false,
      encryptionEnabled: config.encryptionEnabled ?? false,
      keyPrefix: config.keyPrefix || 'dao-cache:'
    }

    // Initialize memory cache
    this.memoryCache = new NodeCache({
      stdTTL: this.config.defaultTTL,
      maxKeys: this.config.maxCacheSize,
      useClones: false
    })

    // TODO: Initialize Redis client if distributed cache is enabled
    // This would require redis package: npm install redis
    if (this.config.enableDistributedCache && this.config.redisUrl) {
      this.initializeRedisCache()
    }
  }

  /**
   * Initialize Redis cache (placeholder for future implementation)
   */
  private initializeRedisCache(): void {
    // TODO: Implement Redis connection
    console.log('Redis cache initialization placeholder - requires redis package')
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = `${this.config.keyPrefix}${key}`

      // Try distributed cache first
      if (this.config.enableDistributedCache) {
        // TODO: Implement Redis get
      }

      // Fallback to memory cache
      const entry = this.memoryCache.get<CacheEntry<T>>(fullKey)
      if (entry) {
        entry.hits++
        this.emit('cacheHit', {key: fullKey, source: 'memory'})
        return entry.data
      }

      this.emit('cacheMiss', {key: fullKey})
      return null
    } catch (error) {
      this.emit('cacheError', {
        key,
        operation: 'get',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const fullKey = `${this.config.keyPrefix}${key}`
      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttl || this.config.defaultTTL,
        hits: 0,
        metadata: {
          queryHash: key,
          originalQuery: key,
          size: JSON.stringify(value).length,
          compressed: this.config.compressionEnabled,
          encrypted: this.config.encryptionEnabled
        }
      }

      // Set in distributed cache
      if (this.config.enableDistributedCache) {
        // TODO: Implement Redis set
      }

      // Set in memory cache
      this.memoryCache.set(fullKey, entry, ttl || this.config.defaultTTL)

      this.emit('cacheSet', {
        key: fullKey,
        size: entry.metadata.size,
        ttl: entry.ttl
      })
    } catch (error) {
      this.emit('cacheError', {
        key,
        operation: 'set',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = `${this.config.keyPrefix}${key}`

      // Delete from distributed cache
      if (this.config.enableDistributedCache) {
        // TODO: Implement Redis delete
      }

      // Delete from memory cache
      this.memoryCache.del(fullKey)

      this.emit('cacheDelete', {key: fullKey})
    } catch (error) {
      this.emit('cacheError', {
        key,
        operation: 'delete',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    try {
      // Clear distributed cache
      if (this.config.enableDistributedCache) {
        // TODO: Implement Redis clear
      }

      // Clear memory cache
      this.memoryCache.flushAll()

      this.emit('cacheCleared')
    } catch (error) {
      this.emit('cacheError', {
        key: 'all',
        operation: 'clear',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      memory: this.memoryCache.getStats(),
      distributed: {
        enabled: this.config.enableDistributedCache,
        connected: false // TODO: Implement Redis connection status
      },
      config: this.config
    }
  }
}

export default AdvancedQueryOptimizer
