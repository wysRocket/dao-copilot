/**
 * Advanced Search Fallback System
 * 
 * This system provides multiple fallback mechanisms when the primary Google Search API
 * is unavailable, including alternative search providers, offline knowledge bases,
 * and intelligent response generation.
 * 
 * Features:
 * - Multiple search provider fallbacks (Bing, DuckDuckGo, etc.)
 * - Offline knowledge base with common queries
 * - Intelligent response synthesis
 * - Provider health monitoring and failover
 * - Response quality assessment
 * - Graceful degradation strategies
 */

import { EventEmitter } from 'events'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { logger } from './gemini-logger'
import { SearchCacheSystem } from './search-cache-system'

// Types and interfaces
interface SearchProvider {
  name: string
  endpoint: string
  enabled: boolean
  priority: number // Lower numbers = higher priority
  rateLimit: number // Requests per minute
  timeout: number
  retryAttempts: number
  healthCheckUrl?: string
  apiKey?: string
  headers?: Record<string, string>
}

interface ProviderHealth {
  name: string
  isHealthy: boolean
  lastCheck: number
  responseTime: number
  successRate: number
  consecutiveFailures: number
  lastError?: string
}

interface SearchRequest {
  query: string
  maxResults?: number
  safeSearch?: boolean
  language?: string
  region?: string
  freshness?: 'day' | 'week' | 'month'
}

interface FallbackSearchResult {
  title: string
  url: string
  snippet: string
  provider: string
  confidence: number // 0-1 quality score
  timestamp: number
  cached?: boolean
}

interface FallbackSearchResponse {
  query: string
  results: FallbackSearchResult[]
  totalResults: number
  provider: string
  searchTime: number
  source: 'primary' | 'fallback' | 'offline' | 'synthetic'
  confidence: number
  timestamp: number
}

interface OfflineKnowledgeEntry {
  keywords: string[]
  response: {
    title: string
    content: string
    sources: string[]
    confidence: number
    lastUpdated: number
  }
  category: string
  priority: number
}

interface FallbackConfig {
  // Provider configuration
  providers: SearchProvider[]
  
  // Health monitoring
  healthCheckInterval: number
  healthCheckTimeout: number
  minSuccessRate: number
  maxConsecutiveFailures: number
  
  // Fallback behavior
  enableOfflineKnowledge: boolean
  enableSyntheticResponses: boolean
  fallbackTimeout: number
  maxFallbackAttempts: number
  
  // Quality thresholds
  minimumConfidence: number
  resultRelevanceThreshold: number
  
  // Performance
  concurrentProviderLimit: number
  cacheFallbackResults: boolean
}

/**
 * Provider Health Monitor
 */
class ProviderHealthMonitor extends EventEmitter {
  private healthStatus = new Map<string, ProviderHealth>()
  private monitoringInterval?: NodeJS.Timeout

  constructor(private providers: SearchProvider[], private config: FallbackConfig) {
    super()
    
    // Initialize health status
    providers.forEach(provider => {
      this.healthStatus.set(provider.name, {
        name: provider.name,
        isHealthy: true,
        lastCheck: 0,
        responseTime: 0,
        successRate: 1.0,
        consecutiveFailures: 0
      })
    })
  }

  startMonitoring(): void {
    if (this.monitoringInterval) return
    
    this.monitoringInterval = setInterval(() => {
      this.performHealthChecks()
    }, this.config.healthCheckInterval)
    
    // Initial health check
    setTimeout(() => this.performHealthChecks(), 1000)
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }
  }

  getHealthyProviders(): SearchProvider[] {
    return this.providers.filter(provider => {
      const health = this.healthStatus.get(provider.name)
      return health?.isHealthy && provider.enabled
    }).sort((a, b) => a.priority - b.priority)
  }

  recordProviderResult(providerName: string, success: boolean, responseTime: number, error?: string): void {
    const health = this.healthStatus.get(providerName)
    if (!health) return

    const now = Date.now()
    
    // Update response time (rolling average)
    health.responseTime = health.responseTime > 0 
      ? (health.responseTime * 0.8 + responseTime * 0.2)
      : responseTime
    
    if (success) {
      health.consecutiveFailures = 0
      health.successRate = Math.min(1.0, health.successRate * 0.95 + 0.05)
      
      if (!health.isHealthy && health.successRate > this.config.minSuccessRate) {
        health.isHealthy = true
        this.emit('provider_recovered', { provider: providerName })
        logger.info('Provider recovered', { provider: providerName, successRate: health.successRate })
      }
    } else {
      health.consecutiveFailures++
      health.successRate = Math.max(0.0, health.successRate * 0.95)
      health.lastError = error
      
      if (health.isHealthy && 
          (health.consecutiveFailures >= this.config.maxConsecutiveFailures ||
           health.successRate < this.config.minSuccessRate)) {
        health.isHealthy = false
        this.emit('provider_unhealthy', { provider: providerName, error })
        logger.warn('Provider marked unhealthy', { 
          provider: providerName, 
          consecutiveFailures: health.consecutiveFailures,
          successRate: health.successRate
        })
      }
    }
    
    health.lastCheck = now
    this.healthStatus.set(providerName, health)
  }

  getProviderHealth(providerName: string): ProviderHealth | undefined {
    return this.healthStatus.get(providerName)
  }

  getAllHealth(): ProviderHealth[] {
    return Array.from(this.healthStatus.values())
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = this.providers.map(async (provider) => {
      if (!provider.healthCheckUrl || !provider.enabled) return
      
      const startTime = performance.now()
      try {
        await axios.get(provider.healthCheckUrl, {
          timeout: this.config.healthCheckTimeout,
          headers: provider.headers
        })
        
        const responseTime = performance.now() - startTime
        this.recordProviderResult(provider.name, true, responseTime)
        
      } catch (error) {
        const responseTime = performance.now() - startTime
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.recordProviderResult(provider.name, false, responseTime, errorMessage)
      }
    })
    
    await Promise.allSettled(healthCheckPromises)
  }
}

/**
 * Offline Knowledge Base Manager
 */
class OfflineKnowledgeManager {
  private knowledgeBase = new Map<string, OfflineKnowledgeEntry>()

  constructor() {
    this.initializeKnowledgeBase()
  }

  search(query: string): FallbackSearchResult[] {
    const queryWords = query.toLowerCase().split(/\s+/)
    const matches: Array<{ entry: OfflineKnowledgeEntry, score: number }> = []
    
    for (const [key, entry] of this.knowledgeBase.entries()) {
      let score = 0
      
      // Calculate relevance score
      for (const keyword of entry.keywords) {
        for (const word of queryWords) {
          if (keyword.toLowerCase().includes(word.toLowerCase()) ||
              word.toLowerCase().includes(keyword.toLowerCase())) {
            score += 1 / (1 + Math.abs(keyword.length - word.length) * 0.1)
          }
        }
      }
      
      if (score > 0) {
        matches.push({ entry, score })
      }
    }
    
    // Sort by score and priority
    matches.sort((a, b) => 
      (b.score * b.entry.priority) - (a.score * a.entry.priority)
    )
    
    return matches.slice(0, 5).map(match => ({
      title: match.entry.response.title,
      url: `offline://knowledge/${match.entry.category}`,
      snippet: match.entry.response.content.substring(0, 200) + '...',
      provider: 'offline_knowledge',
      confidence: Math.min(0.8, match.score * match.entry.response.confidence),
      timestamp: Date.now(),
      cached: true
    }))
  }

  private initializeKnowledgeBase(): void {
    // Common knowledge entries for offline fallback
    const entries: OfflineKnowledgeEntry[] = [
      {
        keywords: ['time', 'current time', 'what time', 'clock'],
        response: {
          title: 'Current Time',
          content: `The current time is ${new Date().toLocaleTimeString()}. Please note this is based on your system time.`,
          sources: ['system'],
          confidence: 0.9,
          lastUpdated: Date.now()
        },
        category: 'time',
        priority: 1.0
      },
      {
        keywords: ['date', 'today', 'current date', 'what day'],
        response: {
          title: 'Current Date',
          content: `Today is ${new Date().toLocaleDateString()}. The current day is ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.`,
          sources: ['system'],
          confidence: 0.9,
          lastUpdated: Date.now()
        },
        category: 'time',
        priority: 1.0
      },
      {
        keywords: ['help', 'how to use', 'instructions', 'guide'],
        response: {
          title: 'How to Use This System',
          content: 'This is an AI answering machine. You can ask questions and I will try to help you find answers. If search services are unavailable, I will provide answers from my knowledge base.',
          sources: ['system'],
          confidence: 0.8,
          lastUpdated: Date.now()
        },
        category: 'help',
        priority: 0.8
      },
      {
        keywords: ['weather', 'temperature', 'forecast', 'rain', 'sunny'],
        response: {
          title: 'Weather Information',
          content: 'I would need to access current weather services to provide accurate weather information. Please specify your location and I can try to help when online services are available.',
          sources: ['offline'],
          confidence: 0.5,
          lastUpdated: Date.now()
        },
        category: 'weather',
        priority: 0.6
      },
      {
        keywords: ['calculate', 'math', 'arithmetic', 'compute'],
        response: {
          title: 'Mathematical Calculations',
          content: 'I can help with basic mathematical calculations. Please provide the specific calculation you need help with.',
          sources: ['system'],
          confidence: 0.7,
          lastUpdated: Date.now()
        },
        category: 'math',
        priority: 0.7
      }
    ]
    
    entries.forEach(entry => {
      const key = entry.keywords.join('|').toLowerCase()
      this.knowledgeBase.set(key, entry)
    })
    
    logger.info('Offline knowledge base initialized', { 
      entries: entries.length,
      categories: [...new Set(entries.map(e => e.category))]
    })
  }
}

/**
 * Advanced Search Fallback System
 */
export class SearchFallbackSystem extends EventEmitter {
  private config: FallbackConfig
  private healthMonitor: ProviderHealthMonitor
  private offlineKnowledge: OfflineKnowledgeManager
  private cacheSystem?: SearchCacheSystem
  private httpClient: AxiosInstance
  private isInitialized = false
  
  // Performance tracking
  private metrics = {
    totalRequests: 0,
    primarySuccess: 0,
    fallbackSuccess: 0,
    offlineResponse: 0,
    syntheticResponse: 0,
    totalFailures: 0,
    averageResponseTime: 0
  }

  constructor(config: Partial<FallbackConfig> = {}, cacheSystem?: SearchCacheSystem) {
    super()
    
    this.config = {
      // Default providers configuration
      providers: [
        {
          name: 'bing',
          endpoint: 'https://api.bing.microsoft.com/v7.0/search',
          enabled: false, // Requires API key
          priority: 1,
          rateLimit: 1000,
          timeout: 5000,
          retryAttempts: 2,
          healthCheckUrl: 'https://www.bing.com'
        },
        {
          name: 'duckduckgo',
          endpoint: 'https://api.duckduckgo.com',
          enabled: true, // No API key required
          priority: 2,
          rateLimit: 100,
          timeout: 3000,
          retryAttempts: 1,
          healthCheckUrl: 'https://duckduckgo.com'
        }
      ],
      
      healthCheckInterval: 60000, // 1 minute
      healthCheckTimeout: 5000,
      minSuccessRate: 0.7,
      maxConsecutiveFailures: 3,
      
      enableOfflineKnowledge: true,
      enableSyntheticResponses: true,
      fallbackTimeout: 10000,
      maxFallbackAttempts: 3,
      
      minimumConfidence: 0.3,
      resultRelevanceThreshold: 0.5,
      
      concurrentProviderLimit: 2,
      cacheFallbackResults: true,
      
      ...config
    }
    
    this.healthMonitor = new ProviderHealthMonitor(this.config.providers, this.config)
    this.offlineKnowledge = new OfflineKnowledgeManager()
    this.cacheSystem = cacheSystem
    
    this.httpClient = axios.create({
      timeout: this.config.fallbackTimeout
    })
    
    this.setupEventHandlers()
    
    logger.info('SearchFallbackSystem initialized', {
      providersCount: this.config.providers.length,
      enabledProviders: this.config.providers.filter(p => p.enabled).length,
      offlineKnowledgeEnabled: this.config.enableOfflineKnowledge
    })
  }

  /**
   * Initialize the fallback system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Start health monitoring
      this.healthMonitor.startMonitoring()
      
      this.isInitialized = true
      
      logger.info('SearchFallbackSystem initialization complete')
      this.emit('system_initialized')
      
    } catch (error) {
      logger.error('Failed to initialize SearchFallbackSystem', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Perform search with fallback mechanisms
   */
  async search(request: SearchRequest): Promise<FallbackSearchResponse | null> {
    const startTime = performance.now()
    this.metrics.totalRequests++
    
    try {
      // Try cache first if available
      if (this.cacheSystem) {
        const cachedResult = await this.cacheSystem.get(request.query, { allowFallback: false })
        if (cachedResult) {
          logger.debug('Returning cached result for fallback search', { 
            query: request.query.substring(0, 50) 
          })
          return this.convertCachedResult(cachedResult)
        }
      }
      
      // Try healthy providers in priority order
      const healthyProviders = this.healthMonitor.getHealthyProviders()
      
      if (healthyProviders.length > 0) {
        const result = await this.tryProviders(healthyProviders, request)
        if (result) {
          this.metrics.fallbackSuccess++
          this.recordMetrics(performance.now() - startTime)
          
          // Cache successful results
          if (this.cacheSystem && this.config.cacheFallbackResults) {
            await this.cacheSystem.set(request.query, this.convertToSearchResponse(result))
          }
          
          logger.info('Fallback search successful', {
            query: request.query.substring(0, 50),
            provider: result.provider,
            resultCount: result.results.length
          })
          
          return result
        }
      }
      
      // Try offline knowledge base
      if (this.config.enableOfflineKnowledge) {
        const offlineResults = this.offlineKnowledge.search(request.query)
        if (offlineResults.length > 0) {
          this.metrics.offlineResponse++
          this.recordMetrics(performance.now() - startTime)
          
          const response: FallbackSearchResponse = {
            query: request.query,
            results: offlineResults,
            totalResults: offlineResults.length,
            provider: 'offline_knowledge',
            searchTime: performance.now() - startTime,
            source: 'offline',
            confidence: Math.max(...offlineResults.map(r => r.confidence)),
            timestamp: Date.now()
          }
          
          logger.info('Offline knowledge response provided', {
            query: request.query.substring(0, 50),
            resultCount: offlineResults.length
          })
          
          this.emit('offline_response', { query: request.query, resultCount: offlineResults.length })
          return response
        }
      }
      
      // Generate synthetic response as last resort
      if (this.config.enableSyntheticResponses) {
        const syntheticResult = this.generateSyntheticResponse(request)
        if (syntheticResult) {
          this.metrics.syntheticResponse++
          this.recordMetrics(performance.now() - startTime)
          
          logger.info('Synthetic response generated', {
            query: request.query.substring(0, 50)
          })
          
          this.emit('synthetic_response', { query: request.query })
          return syntheticResult
        }
      }
      
      // All fallbacks failed
      this.metrics.totalFailures++
      this.recordMetrics(performance.now() - startTime)
      
      logger.warn('All fallback mechanisms failed', {
        query: request.query.substring(0, 50),
        healthyProviders: healthyProviders.length
      })
      
      this.emit('all_fallbacks_failed', { query: request.query })
      return null
      
    } catch (error) {
      this.metrics.totalFailures++
      this.recordMetrics(performance.now() - startTime)
      
      logger.error('Error in fallback search', {
        query: request.query.substring(0, 50),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return null
    }
  }

  /**
   * Get system performance metrics
   */
  getMetrics() {
    const healthyProviders = this.healthMonitor.getHealthyProviders().length
    const totalProviders = this.config.providers.length
    
    return {
      ...this.metrics,
      healthyProviders,
      totalProviders,
      providerHealth: this.healthMonitor.getAllHealth(),
      successRate: this.metrics.totalRequests > 0 
        ? (this.metrics.primarySuccess + this.metrics.fallbackSuccess) / this.metrics.totalRequests 
        : 0,
      fallbackUtilization: {
        fallback: this.metrics.fallbackSuccess,
        offline: this.metrics.offlineResponse,
        synthetic: this.metrics.syntheticResponse,
        failures: this.metrics.totalFailures
      }
    }
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerName: string, updates: Partial<SearchProvider>): void {
    const provider = this.config.providers.find(p => p.name === providerName)
    if (provider) {
      Object.assign(provider, updates)
      logger.info('Provider configuration updated', { provider: providerName, updates })
      this.emit('provider_config_updated', { provider: providerName, updates })
    }
  }

  /**
   * Shutdown the fallback system
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down SearchFallbackSystem')
    
    try {
      // Stop health monitoring
      this.healthMonitor.stopMonitoring()
      
      // Generate final metrics
      const finalMetrics = this.getMetrics()
      this.emit('final_metrics', finalMetrics)
      
      // Clear resources
      this.removeAllListeners()
      this.healthMonitor.removeAllListeners()
      
      logger.info('SearchFallbackSystem shutdown complete', finalMetrics)
      
    } catch (error) {
      logger.error('Error during SearchFallbackSystem shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // Private methods

  private async tryProviders(providers: SearchProvider[], request: SearchRequest): Promise<FallbackSearchResponse | null> {
    const concurrentLimit = Math.min(this.config.concurrentProviderLimit, providers.length)
    
    for (let i = 0; i < providers.length; i += concurrentLimit) {
      const batch = providers.slice(i, i + concurrentLimit)
      const promises = batch.map(provider => this.tryProvider(provider, request))
      
      const results = await Promise.allSettled(promises)
      
      // Return first successful result
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          return result.value
        }
      }
    }
    
    return null
  }

  private async tryProvider(provider: SearchProvider, request: SearchRequest): Promise<FallbackSearchResponse | null> {
    const startTime = performance.now()
    
    try {
      let response
      
      // Provider-specific implementations
      switch (provider.name) {
        case 'bing':
          response = await this.searchBing(provider, request)
          break
        case 'duckduckgo':
          response = await this.searchDuckDuckGo(provider, request)
          break
        default:
          throw new Error(`Unknown provider: ${provider.name}`)
      }
      
      const responseTime = performance.now() - startTime
      this.healthMonitor.recordProviderResult(provider.name, true, responseTime)
      
      return response
      
    } catch (error) {
      const responseTime = performance.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      this.healthMonitor.recordProviderResult(provider.name, false, responseTime, errorMessage)
      
      logger.debug('Provider search failed', {
        provider: provider.name,
        query: request.query.substring(0, 50),
        error: errorMessage
      })
      
      return null
    }
  }

  private async searchBing(provider: SearchProvider, request: SearchRequest): Promise<FallbackSearchResponse | null> {
    if (!provider.apiKey) {
      throw new Error('Bing API key not configured')
    }
    
    const response = await this.httpClient.get(provider.endpoint, {
      headers: {
        'Ocp-Apim-Subscription-Key': provider.apiKey,
        ...provider.headers
      },
      params: {
        q: request.query,
        count: request.maxResults || 10,
        safeSearch: request.safeSearch ? 'strict' : 'off'
      },
      timeout: provider.timeout
    })
    
    return this.parseBingResponse(response.data, request.query, provider.name)
  }

  private async searchDuckDuckGo(provider: SearchProvider, request: SearchRequest): Promise<FallbackSearchResponse | null> {
    // DuckDuckGo Instant Answer API (limited but free)
    const response = await this.httpClient.get(`${provider.endpoint}/`, {
      params: {
        q: request.query,
        format: 'json',
        no_html: '1',
        skip_disambig: '1'
      },
      timeout: provider.timeout
    })
    
    return this.parseDuckDuckGoResponse(response.data, request.query, provider.name)
  }

  private parseBingResponse(data: any, query: string, provider: string): FallbackSearchResponse {
    const results: FallbackSearchResult[] = (data.webPages?.value || []).map((item: any) => ({
      title: item.name || 'No title',
      url: item.url,
      snippet: item.snippet || 'No description available',
      provider,
      confidence: 0.8, // Bing generally high quality
      timestamp: Date.now()
    }))
    
    return {
      query,
      results,
      totalResults: data.webPages?.totalEstimatedMatches || results.length,
      provider,
      searchTime: 0,
      source: 'fallback',
      confidence: results.length > 0 ? 0.8 : 0,
      timestamp: Date.now()
    }
  }

  private parseDuckDuckGoResponse(data: any, query: string, provider: string): FallbackSearchResponse {
    const results: FallbackSearchResult[] = []
    
    // DuckDuckGo instant answer
    if (data.Abstract) {
      results.push({
        title: data.Heading || 'DuckDuckGo Result',
        url: data.AbstractURL || 'https://duckduckgo.com',
        snippet: data.Abstract,
        provider,
        confidence: 0.7,
        timestamp: Date.now()
      })
    }
    
    // Related topics
    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 3).forEach((topic: any) => {
        if (topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related Topic',
            url: topic.FirstURL || 'https://duckduckgo.com',
            snippet: topic.Text,
            provider,
            confidence: 0.6,
            timestamp: Date.now()
          })
        }
      })
    }
    
    return {
      query,
      results,
      totalResults: results.length,
      provider,
      searchTime: 0,
      source: 'fallback',
      confidence: results.length > 0 ? 0.6 : 0,
      timestamp: Date.now()
    }
  }

  private generateSyntheticResponse(request: SearchRequest): FallbackSearchResponse | null {
    // Generate a helpful synthetic response when all other methods fail
    const response: FallbackSearchResponse = {
      query: request.query,
      results: [{
        title: 'Search Currently Unavailable',
        url: 'about:offline',
        snippet: `I apologize, but I'm unable to search for "${request.query}" at the moment due to search service limitations. Please try again later or rephrase your question.`,
        provider: 'synthetic',
        confidence: 0.3,
        timestamp: Date.now()
      }],
      totalResults: 1,
      provider: 'synthetic',
      searchTime: 0,
      source: 'synthetic',
      confidence: 0.3,
      timestamp: Date.now()
    }
    
    return response
  }

  private convertCachedResult(cached: any): FallbackSearchResponse {
    return {
      ...cached,
      source: 'fallback',
      provider: 'cache'
    }
  }

  private convertToSearchResponse(fallbackResponse: FallbackSearchResponse): any {
    return {
      query: fallbackResponse.query,
      results: fallbackResponse.results,
      totalResults: fallbackResponse.totalResults,
      searchTime: fallbackResponse.searchTime,
      source: 'fallback',
      cacheHit: false,
      timestamp: fallbackResponse.timestamp
    }
  }

  private recordMetrics(responseTime: number): void {
    const totalRequests = this.metrics.totalRequests
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests
  }

  private setupEventHandlers(): void {
    this.healthMonitor.on('provider_unhealthy', (data) => {
      this.emit('provider_unhealthy', data)
    })
    
    this.healthMonitor.on('provider_recovered', (data) => {
      this.emit('provider_recovered', data)
    })
  }
}

export default SearchFallbackSystem