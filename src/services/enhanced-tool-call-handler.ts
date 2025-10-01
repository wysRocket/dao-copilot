/**
 * Enhanced Tool Call Handler with Caching and Fallback Support
 * 
 * This system integrates Google Search API with comprehensive caching and fallback
 * mechanisms to ensure reliable search functionality even when primary services
 * are unavailable.
 * 
 * Features:
 * - Primary Google Search API integration
 * - Multi-tier caching (memory + disk)
 * - Multiple fallback search providers
 * - Offline knowledge base
 * - Intelligent result ranking and quality assessment
 * - Performance monitoring and health checks
 * - Graceful degradation and error recovery
 */

import { EventEmitter } from 'events'
import axios, { AxiosInstance, AxiosError } from 'axios'
import { SearchCacheSystem } from './search-cache-system'
import { SearchFallbackSystem } from './search-fallback-system'
import { logger } from './gemini-logger'

// Types and interfaces
interface GoogleSearchConfig {
  apiKey: string
  searchEngineId: string
  baseUrl: string
  timeout: number
  retryAttempts: number
  rateLimit: number // requests per minute
  quotaLimit: number // daily quota
  safeSearch: boolean
}

interface ToolCallRequest {
  tool: string
  parameters: Record<string, any>
  context?: {
    conversationId?: string
    userId?: string
    sessionId?: string
    previousQueries?: string[]
  }
}

interface SearchParameters {
  query: string
  maxResults?: number
  safeSearch?: boolean
  language?: string
  region?: string
  dateRestrict?: string // 'd1', 'w1', 'm1', etc.
  fileType?: string
  siteSearch?: string
  exactTerms?: string
  excludeTerms?: string
}

interface EnhancedSearchResult {
  title: string
  url: string
  snippet: string
  displayUrl?: string
  formattedUrl?: string
  htmlTitle?: string
  htmlSnippet?: string
  cacheId?: string
  pagemap?: any
  
  // Enhanced metadata
  provider: 'google' | 'bing' | 'duckduckgo' | 'offline' | 'cache'
  confidence: number // 0-1 quality/relevance score
  relevanceScore: number // 0-1 relevance to query
  freshness: number // 0-1 how recent the content is
  authority: number // 0-1 domain authority score
  cached: boolean
  timestamp: number
}

interface ToolCallResponse {
  success: boolean
  toolName: string
  executionTime: number
  results?: EnhancedSearchResult[]
  totalResults?: number
  searchQuery?: string
  source: 'primary' | 'cache' | 'fallback' | 'offline'
  confidence: number
  error?: {
    code: string
    message: string
    retryable: boolean
  }
  metadata: {
    quota: {
      used: number
      remaining: number
      resetTime?: number
    }
    performance: {
      apiResponseTime: number
      cacheHitRate: number
      fallbackUsed: boolean
    }
    context: {
      conversationId?: string
      sessionId?: string
      relatedQueries?: string[]
    }
  }
}

interface ToolHandlerConfig {
  google: GoogleSearchConfig
  caching: {
    enabled: boolean
    maxCacheSize: number
    defaultTTL: number
    diskCacheEnabled: boolean
  }
  fallback: {
    enabled: boolean
    providers: string[]
    timeout: number
  }
  performance: {
    maxConcurrentRequests: number
    requestTimeout: number
    retryDelay: number
  }
  quality: {
    minimumConfidence: number
    relevanceThreshold: number
    enableResultRanking: boolean
  }
}

/**
 * Rate Limiter for API calls
 */
class RateLimiter {
  private requests: number[] = []
  private quota: { used: number, limit: number, resetTime: number }

  constructor(private rateLimit: number, private quotaLimit: number) {
    this.quota = {
      used: 0,
      limit: quotaLimit,
      resetTime: this.getNextMidnight()
    }
  }

  canMakeRequest(): boolean {
    const now = Date.now()
    
    // Reset quota if new day
    if (now >= this.quota.resetTime) {
      this.quota.used = 0
      this.quota.resetTime = this.getNextMidnight()
    }
    
    // Check quota limit
    if (this.quota.used >= this.quota.limit) {
      return false
    }
    
    // Clean old requests (older than 1 minute)
    this.requests = this.requests.filter(time => now - time < 60000)
    
    // Check rate limit
    return this.requests.length < this.rateLimit
  }

  recordRequest(): void {
    this.requests.push(Date.now())
    this.quota.used++
  }

  getQuotaInfo() {
    return {
      used: this.quota.used,
      remaining: this.quota.limit - this.quota.used,
      resetTime: this.quota.resetTime
    }
  }

  private getNextMidnight(): number {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.getTime()
  }
}

/**
 * Result Quality Analyzer
 */
class ResultQualityAnalyzer {
  analyzeResult(result: any, query: string): {
    confidence: number
    relevanceScore: number
    freshness: number
    authority: number
  } {
    let confidence = 0.5
    let relevanceScore = 0.5
    let freshness = 0.5
    let authority = 0.5
    
    // Analyze relevance based on title and snippet
    const queryWords = query.toLowerCase().split(/\s+/)
    const text = (result.title + ' ' + result.snippet).toLowerCase()
    
    let matchCount = 0
    for (const word of queryWords) {
      if (text.includes(word)) matchCount++
    }
    relevanceScore = Math.min(1, matchCount / queryWords.length)
    
    // Analyze authority based on URL
    if (result.url) {
      const url = result.url.toLowerCase()
      if (url.includes('wikipedia.org') || 
          url.includes('.edu') || 
          url.includes('.gov')) {
        authority = 0.9
      } else if (url.includes('.org')) {
        authority = 0.7
      } else if (url.includes('.com')) {
        authority = 0.6
      }
    }
    
    // Basic freshness estimation (would be enhanced with actual dates)
    freshness = 0.7 // Default assumption
    
    // Calculate overall confidence
    confidence = (relevanceScore * 0.4 + authority * 0.3 + freshness * 0.3)
    
    return { confidence, relevanceScore, freshness, authority }
  }

  rankResults(results: EnhancedSearchResult[], query: string): EnhancedSearchResult[] {
    return results.sort((a, b) => {
      // Primary sort by confidence
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence
      }
      
      // Secondary sort by relevance
      if (Math.abs(a.relevanceScore - b.relevanceScore) > 0.1) {
        return b.relevanceScore - a.relevanceScore
      }
      
      // Tertiary sort by authority
      return b.authority - a.authority
    })
  }
}

/**
 * Enhanced Tool Call Handler with Caching and Fallback
 */
export class EnhancedToolCallHandler extends EventEmitter {
  private config: ToolHandlerConfig
  private httpClient: AxiosInstance
  private cacheSystem?: SearchCacheSystem
  private fallbackSystem?: SearchFallbackSystem
  private rateLimiter: RateLimiter
  private qualityAnalyzer: ResultQualityAnalyzer
  private isInitialized = false
  
  // Performance tracking
  private metrics = {
    totalRequests: 0,
    googleApiCalls: 0,
    cacheHits: 0,
    fallbackUses: 0,
    averageResponseTime: 0,
    errorCount: 0,
    quotaExceeded: 0
  }
  
  // Request queue for concurrent request management
  private activeRequests = new Set<string>()
  private requestQueue: Array<{ resolve: Function, reject: Function, request: ToolCallRequest }> = []

  constructor(config: Partial<ToolHandlerConfig> = {}) {
    super()
    
    this.config = {
      google: {
        apiKey: process.env.GOOGLE_API_KEY || '',
        searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || '',
        baseUrl: 'https://www.googleapis.com/customsearch/v1',
        timeout: 8000,
        retryAttempts: 2,
        rateLimit: 100, // per minute
        quotaLimit: 10000, // per day
        safeSearch: true,
        ...config.google
      },
      
      caching: {
        enabled: true,
        maxCacheSize: 50 * 1024 * 1024, // 50MB
        defaultTTL: 3600000, // 1 hour
        diskCacheEnabled: true,
        ...config.caching
      },
      
      fallback: {
        enabled: true,
        providers: ['duckduckgo', 'bing'],
        timeout: 10000,
        ...config.fallback
      },
      
      performance: {
        maxConcurrentRequests: 3,
        requestTimeout: 15000,
        retryDelay: 1000,
        ...config.performance
      },
      
      quality: {
        minimumConfidence: 0.3,
        relevanceThreshold: 0.5,
        enableResultRanking: true,
        ...config.quality
      }
    }
    
    this.httpClient = axios.create({
      timeout: this.config.google.timeout,
      headers: {
        'User-Agent': 'DAO-Copilot/1.0'
      }
    })
    
    this.rateLimiter = new RateLimiter(
      this.config.google.rateLimit,
      this.config.google.quotaLimit
    )
    
    this.qualityAnalyzer = new ResultQualityAnalyzer()
    
    this.setupHttpInterceptors()
    
    logger.info('EnhancedToolCallHandler initialized', {
      cachingEnabled: this.config.caching.enabled,
      fallbackEnabled: this.config.fallback.enabled,
      googleApiConfigured: !!this.config.google.apiKey
    })
  }

  /**
   * Initialize the tool handler with caching and fallback systems
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Initialize caching system
      if (this.config.caching.enabled) {
        this.cacheSystem = new SearchCacheSystem({
          maxMemorySize: this.config.caching.maxCacheSize,
          defaultTTL: this.config.caching.defaultTTL,
          enableDiskCache: this.config.caching.diskCacheEnabled
        })
        await this.cacheSystem.initialize()
        logger.info('Cache system initialized')
      }
      
      // Initialize fallback system
      if (this.config.fallback.enabled) {
        this.fallbackSystem = new SearchFallbackSystem({
          providers: [
            {
              name: 'duckduckgo',
              endpoint: 'https://api.duckduckgo.com',
              enabled: true,
              priority: 1,
              rateLimit: 100,
              timeout: 5000,
              retryAttempts: 1
            }
          ],
          fallbackTimeout: this.config.fallback.timeout
        }, this.cacheSystem)
        
        await this.fallbackSystem.initialize()
        logger.info('Fallback system initialized')
      }
      
      this.setupEventHandlers()
      this.isInitialized = true
      
      logger.info('EnhancedToolCallHandler initialization complete')
      this.emit('system_initialized')
      
    } catch (error) {
      logger.error('Failed to initialize EnhancedToolCallHandler', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Execute a tool call with comprehensive error handling and fallbacks
   */
  async executeToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    const startTime = performance.now()
    this.metrics.totalRequests++
    
    try {
      // Validate request
      if (!request.tool || !request.parameters) {
        throw new Error('Invalid tool call request')
      }
      
      // Handle different tool types
      switch (request.tool.toLowerCase()) {
        case 'google_search':
        case 'search':
        case 'web_search':
          return await this.handleSearchRequest(request, startTime)
          
        default:
          throw new Error(`Unsupported tool: ${request.tool}`)
      }
      
    } catch (error) {
      this.metrics.errorCount++
      
      const response: ToolCallResponse = {
        success: false,
        toolName: request.tool,
        executionTime: performance.now() - startTime,
        source: 'primary',
        confidence: 0,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: this.isRetryableError(error)
        },
        metadata: {
          quota: this.rateLimiter.getQuotaInfo(),
          performance: {
            apiResponseTime: 0,
            cacheHitRate: this.getCacheHitRate(),
            fallbackUsed: false
          },
          context: request.context || {}
        }
      }
      
      logger.error('Tool call execution failed', {
        tool: request.tool,
        error: response.error.message
      })
      
      this.emit('tool_call_error', { request, response })
      return response
    }
  }

  /**
   * Get comprehensive system metrics
   */
  getSystemMetrics() {
    const cacheStats = this.cacheSystem?.getStats()
    const fallbackMetrics = this.fallbackSystem?.getMetrics()
    
    return {
      handler: this.metrics,
      cache: cacheStats,
      fallback: fallbackMetrics,
      quota: this.rateLimiter.getQuotaInfo(),
      system: {
        isInitialized: this.isInitialized,
        activeRequests: this.activeRequests.size,
        queuedRequests: this.requestQueue.length
      }
    }
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<ToolHandlerConfig>): void {
    Object.assign(this.config, updates)
    logger.info('Tool handler configuration updated', updates)
    this.emit('config_updated', updates)
  }

  /**
   * Shutdown the tool handler gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down EnhancedToolCallHandler')
    
    try {
      // Wait for active requests to complete (with timeout)
      const shutdownTimeout = 10000 // 10 seconds
      const shutdownStart = Date.now()
      
      while (this.activeRequests.size > 0 && Date.now() - shutdownStart < shutdownTimeout) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Shutdown subsystems
      if (this.cacheSystem) {
        await this.cacheSystem.shutdown()
      }
      
      if (this.fallbackSystem) {
        await this.fallbackSystem.shutdown()
      }
      
      // Generate final metrics
      const finalMetrics = this.getSystemMetrics()
      this.emit('final_metrics', finalMetrics)
      
      // Clear resources
      this.activeRequests.clear()
      this.requestQueue = []
      this.removeAllListeners()
      
      logger.info('EnhancedToolCallHandler shutdown complete', finalMetrics.handler)
      
    } catch (error) {
      logger.error('Error during tool handler shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Private methods

  private async handleSearchRequest(request: ToolCallRequest, startTime: number): Promise<ToolCallResponse> {
    const searchParams = this.parseSearchParameters(request.parameters)
    const requestId = this.generateRequestId(searchParams.query)
    
    // Check for concurrent request limit
    if (this.activeRequests.size >= this.config.performance.maxConcurrentRequests) {
      return await this.queueRequest(request, startTime)
    }
    
    this.activeRequests.add(requestId)
    
    try {
      // Try primary Google Search API
      let results = await this.tryGoogleSearch(searchParams)
      let source: 'primary' | 'cache' | 'fallback' | 'offline' = 'primary'
      let confidence = 0.9
      
      // Try cache if primary failed
      if (!results && this.cacheSystem) {
        const cached = await this.cacheSystem.get(searchParams.query)
        if (cached) {
          results = this.convertCachedResults(cached.results)
          source = 'cache'
          confidence = 0.8
          this.metrics.cacheHits++
        }
      }
      
      // Try fallback if still no results
      if (!results && this.fallbackSystem) {
        const fallbackResponse = await this.fallbackSystem.search({
          query: searchParams.query,
          maxResults: searchParams.maxResults
        })
        
        if (fallbackResponse) {
          results = this.convertFallbackResults(fallbackResponse.results)
          source = 'fallback'
          confidence = fallbackResponse.confidence
          this.metrics.fallbackUses++
        }
      }
      
      const executionTime = performance.now() - startTime
      
      // Apply quality filtering and ranking
      if (results && this.config.quality.enableResultRanking) {
        results = this.qualityAnalyzer.rankResults(results, searchParams.query)
        results = results.filter(r => r.confidence >= this.config.quality.minimumConfidence)
      }
      
      const response: ToolCallResponse = {
        success: !!results && results.length > 0,
        toolName: request.tool,
        executionTime,
        results: results || [],
        totalResults: results?.length || 0,
        searchQuery: searchParams.query,
        source,
        confidence,
        metadata: {
          quota: this.rateLimiter.getQuotaInfo(),
          performance: {
            apiResponseTime: executionTime,
            cacheHitRate: this.getCacheHitRate(),
            fallbackUsed: source === 'fallback'
          },
          context: {
            ...request.context,
            relatedQueries: this.generateRelatedQueries(searchParams.query)
          }
        }
      }
      
      // Cache successful results
      if (results && results.length > 0 && source === 'primary' && this.cacheSystem) {
        await this.cacheSystem.set(searchParams.query, {
          query: searchParams.query,
          results: results.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet
          })),
          totalResults: results.length,
          searchTime: executionTime,
          source: 'api',
          cacheHit: false,
          timestamp: Date.now()
        })
      }
      
      this.recordMetrics(executionTime)
      this.emit('tool_call_success', { request, response })
      
      return response
      
    } finally {
      this.activeRequests.delete(requestId)
      this.processRequestQueue()
    }
  }

  private async tryGoogleSearch(params: SearchParameters): Promise<EnhancedSearchResult[] | null> {
    // Check rate limits and quota
    if (!this.rateLimiter.canMakeRequest()) {
      this.metrics.quotaExceeded++
      logger.warn('Google API rate limit or quota exceeded')
      return null
    }
    
    if (!this.config.google.apiKey || !this.config.google.searchEngineId) {
      logger.warn('Google API credentials not configured')
      return null
    }
    
    const startTime = performance.now()
    
    try {
      const response = await this.httpClient.get(this.config.google.baseUrl, {
        params: {
          key: this.config.google.apiKey,
          cx: this.config.google.searchEngineId,
          q: params.query,
          num: Math.min(params.maxResults || 10, 10),
          safe: this.config.google.safeSearch ? 'active' : 'off',
          ...(params.language && { lr: `lang_${params.language}` }),
          ...(params.region && { gl: params.region }),
          ...(params.dateRestrict && { dateRestrict: params.dateRestrict }),
          ...(params.fileType && { fileType: params.fileType }),
          ...(params.siteSearch && { siteSearch: params.siteSearch }),
          ...(params.exactTerms && { exactTerms: params.exactTerms }),
          ...(params.excludeTerms && { excludeTerms: params.excludeTerms })
        }
      })
      
      this.rateLimiter.recordRequest()
      this.metrics.googleApiCalls++
      
      const apiResponseTime = performance.now() - startTime
      const results = this.parseGoogleResults(response.data, params.query, apiResponseTime)
      
      logger.debug('Google Search API successful', {
        query: params.query.substring(0, 50),
        resultCount: results.length,
        responseTime: `${apiResponseTime.toFixed(2)}ms`
      })
      
      return results
      
    } catch (error) {
      const apiResponseTime = performance.now() - startTime
      
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          this.metrics.quotaExceeded++
          logger.warn('Google API rate limit exceeded')
        } else {
          logger.error('Google Search API error', {
            status: error.response?.status,
            message: error.message,
            query: params.query.substring(0, 50)
          })
        }
      }
      
      return null
    }
  }

  private parseGoogleResults(data: any, query: string, apiResponseTime: number): EnhancedSearchResult[] {
    const items = data.items || []
    
    return items.map((item: any) => {
      const quality = this.qualityAnalyzer.analyzeResult(item, query)
      
      return {
        title: item.title || 'No title',
        url: item.link,
        snippet: item.snippet || 'No description available',
        displayUrl: item.displayLink,
        formattedUrl: item.formattedUrl,
        htmlTitle: item.htmlTitle,
        htmlSnippet: item.htmlSnippet,
        cacheId: item.cacheId,
        pagemap: item.pagemap,
        
        provider: 'google' as const,
        confidence: quality.confidence,
        relevanceScore: quality.relevanceScore,
        freshness: quality.freshness,
        authority: quality.authority,
        cached: false,
        timestamp: Date.now()
      }
    })
  }

  private convertCachedResults(results: any[]): EnhancedSearchResult[] {
    return results.map(result => ({
      ...result,
      provider: 'cache' as const,
      confidence: 0.8,
      relevanceScore: 0.8,
      freshness: 0.6,
      authority: 0.7,
      cached: true,
      timestamp: Date.now()
    }))
  }

  private convertFallbackResults(results: any[]): EnhancedSearchResult[] {
    return results.map(result => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      provider: result.provider as any,
      confidence: result.confidence,
      relevanceScore: result.confidence,
      freshness: 0.5,
      authority: 0.5,
      cached: result.cached || false,
      timestamp: result.timestamp || Date.now()
    }))
  }

  private parseSearchParameters(params: Record<string, any>): SearchParameters {
    return {
      query: params.query || params.q || '',
      maxResults: Math.min(params.maxResults || params.num || 10, 10),
      safeSearch: params.safeSearch ?? this.config.google.safeSearch,
      language: params.language || params.lang,
      region: params.region || params.gl,
      dateRestrict: params.dateRestrict,
      fileType: params.fileType,
      siteSearch: params.siteSearch || params.site,
      exactTerms: params.exactTerms,
      excludeTerms: params.excludeTerms
    }
  }

  private generateRequestId(query: string): string {
    return `req_${Date.now()}_${query.substring(0, 20).replace(/\s+/g, '_')}`
  }

  private async queueRequest(request: ToolCallRequest, startTime: number): Promise<ToolCallResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, request })
      
      // Set timeout for queued request
      setTimeout(() => {
        const index = this.requestQueue.findIndex(item => item.request === request)
        if (index > -1) {
          this.requestQueue.splice(index, 1)
          reject(new Error('Request timeout in queue'))
        }
      }, this.config.performance.requestTimeout)
    })
  }

  private processRequestQueue(): void {
    while (this.requestQueue.length > 0 && 
           this.activeRequests.size < this.config.performance.maxConcurrentRequests) {
      const { resolve, request } = this.requestQueue.shift()!
      
      // Execute queued request
      this.executeToolCall(request)
        .then(resolve)
        .catch(reject => reject)
    }
  }

  private getCacheHitRate(): number {
    const totalRequests = this.metrics.totalRequests
    return totalRequests > 0 ? this.metrics.cacheHits / totalRequests : 0
  }

  private recordMetrics(responseTime: number): void {
    const totalRequests = this.metrics.totalRequests
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests
  }

  private generateRelatedQueries(query: string): string[] {
    // Simple related query generation
    const words = query.toLowerCase().split(/\s+/)
    const related: string[] = []
    
    if (words.length > 1) {
      // Try partial queries
      related.push(words.slice(0, -1).join(' '))
      if (words.length > 2) {
        related.push(words.slice(1).join(' '))
      }
    }
    
    return related.slice(0, 3) // Limit to 3 related queries
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof AxiosError) {
      const status = error.response?.status
      return status ? [429, 502, 503, 504].includes(status) : false
    }
    return false
  }

  private setupHttpInterceptors(): void {
    this.httpClient.interceptors.response.use(
      response => response,
      async error => {
        if (this.isRetryableError(error) && error.config && !error.config._retry) {
          error.config._retry = true
          
          // Wait before retry
          await new Promise(resolve => 
            setTimeout(resolve, this.config.performance.retryDelay)
          )
          
          return this.httpClient.request(error.config)
        }
        return Promise.reject(error)
      }
    )
  }

  private setupEventHandlers(): void {
    if (this.cacheSystem) {
      this.cacheSystem.on('cache_hit', (data) => {
        this.emit('cache_hit', data)
      })
      
      this.cacheSystem.on('cache_miss', (data) => {
        this.emit('cache_miss', data)
      })
    }
    
    if (this.fallbackSystem) {
      this.fallbackSystem.on('fallback_used', (data) => {
        this.emit('fallback_used', data)
      })
      
      this.fallbackSystem.on('provider_unhealthy', (data) => {
        this.emit('provider_unhealthy', data)
      })
    }
  }
}

export default EnhancedToolCallHandler