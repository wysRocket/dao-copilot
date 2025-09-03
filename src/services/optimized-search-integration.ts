/**
 * Query Optimization Integration Module
 *
 * This module integrates the Advanced Query Optimizer with the existing
 * GeminiSearchTools to provide intelligent search optimization.
 */

import {AdvancedQueryOptimizer, QueryOptimizationConfig} from './query-optimization'
import {GeminiSearchTools, GeminiSearchConfig} from './gemini-search-tools'
import {SearchMediator, SearchMediatorResult, SearchRequest} from './search-orchestration'
import {SearchResult} from './tool-call-handler'
import {EventEmitter} from 'events'

/**
 * Integration Configuration
 */
export interface OptimizedSearchConfig {
  geminiApiKey: string
  googleSearchApiKey: string
  customSearchEngineId: string
  queryOptimization: QueryOptimizationConfig
  enableOptimization: boolean
  enableFallback: boolean
  maxRetries: number
  timeout: number
}

/**
 * Search Result with Optimization Metadata
 */
export interface OptimizedSearchResult {
  results: SearchResult[]
  optimization: {
    originalQuery: string
    optimizedQuery: string
    optimizationScore: number
    processingTime: number
    cacheHit: boolean
    fallbackUsed: boolean
  }
  metadata: {
    totalResults: number
    searchTime: number
    source: string
    timestamp: number
  }
}

/**
 * Optimized Search Integration
 * Combines query optimization with search execution
 */
export class OptimizedSearchIntegration extends EventEmitter {
  private queryOptimizer: AdvancedQueryOptimizer
  private searchTools: GeminiSearchTools
  private orchestrator: SearchMediator
  private config: OptimizedSearchConfig

  constructor(config: OptimizedSearchConfig) {
    super()

    this.config = config

    // Initialize components
    this.queryOptimizer = new AdvancedQueryOptimizer(config.queryOptimization)

    const searchConfig: GeminiSearchConfig = {
      googleSearchApiKey: config.googleSearchApiKey,
      customSearchEngineId: config.customSearchEngineId,
      geminiApiKey: config.geminiApiKey,
      geminiModel: 'gemini-2.5-flash',
      enableIntelligentSummarization: true,
      summaryMaxTokens: 500,
      pageContentTimeout: 10000,
      maxPageSize: 1000000,
      userAgent: 'DAO-Copilot/1.0'
    }

    this.searchTools = new GeminiSearchTools(searchConfig)

    this.orchestrator = new SearchMediator(this.searchTools)

    // Set up event forwarding
    this.setupEventForwarding()
  }

  /**
   * Perform optimized search
   */
  async optimizedSearch(
    query: string,
    options?: {
      useOptimization?: boolean
      maxResults?: number
      language?: string
      country?: string
    }
  ): Promise<OptimizedSearchResult> {
    const startTime = Date.now()
    let optimizedQuery = query
    let optimizationScore = 0
    let cacheHit = false
    let fallbackUsed = false

    try {
      // Step 1: Query Optimization (if enabled)
      if (this.config.enableOptimization && options?.useOptimization !== false) {
        const optimization = await this.queryOptimizer.optimizeQuery(query)

        optimizedQuery = optimization.optimizedQuery
        optimizationScore = optimization.optimizationScore

        this.emit('queryOptimized', {
          original: query,
          optimized: optimizedQuery,
          score: optimizationScore,
          analysis: optimization.analysis
        })

        // Use refined query if it has better optimization score
        if (optimization.refinements.length > 0 && optimizationScore < 0.8) {
          const bestRefinement = optimization.refinements[0]
          optimizedQuery = bestRefinement
          optimizationScore += 0.1
        }
      }

      // Step 2: Execute Search
      let searchResults: SearchResult[] = []
      let searchTime = 0
      let source = 'direct'

      try {
        // Create search request
        const searchRequest: SearchRequest = {
          query: optimizedQuery,
          context: {
            userIntent: 'search',
            preferredLanguage: options?.language || 'en',
            timeConstraints: {
              maxResponseTime: this.config.timeout || 30000,
              priority: 'quality'
            }
          },
          options: {
            maxResults: options?.maxResults || 10,
            language: options?.language || 'en',
            country: options?.country || 'us',
            timeout: this.config.timeout || 30000,
            cacheEnabled: true
          },
          metadata: {
            requestId: this.generateRequestId(),
            timestamp: Date.now(),
            priority: 1
          }
        }

        // Use orchestrator for intelligent search execution
        const orchestratedResult: SearchMediatorResult =
          await this.orchestrator.executeSearch(searchRequest)

        if (orchestratedResult.success && orchestratedResult.result) {
          searchResults = orchestratedResult.result.searchResults || []
          searchTime = orchestratedResult.metadata.processingTime
          cacheHit = false // Could be enhanced with cache detection
          source = orchestratedResult.result.strategy
        }
      } catch (searchError) {
        // Fallback to basic search if orchestrator fails
        if (this.config.enableFallback) {
          fallbackUsed = true
          const fallbackResult = await this.searchTools.google_search({
            query: optimizedQuery,
            max_results: options?.maxResults || 10,
            country: options?.country || 'us',
            language: options?.language || 'en'
          })
          searchResults = fallbackResult.results || []
          source = 'fallback'
        } else {
          throw searchError
        }
      }

      // Step 3: Prepare Result
      const result: OptimizedSearchResult = {
        results: searchResults,
        optimization: {
          originalQuery: query,
          optimizedQuery,
          optimizationScore,
          processingTime: Date.now() - startTime,
          cacheHit,
          fallbackUsed
        },
        metadata: {
          totalResults: searchResults.length,
          searchTime,
          source,
          timestamp: Date.now()
        }
      }

      this.emit('searchCompleted', result)
      return result
    } catch (error) {
      this.emit('searchError', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      })

      // Return minimal result on error
      return {
        results: [],
        optimization: {
          originalQuery: query,
          optimizedQuery: query,
          optimizationScore: 0,
          processingTime: Date.now() - startTime,
          cacheHit: false,
          fallbackUsed: false
        },
        metadata: {
          totalResults: 0,
          searchTime: 0,
          source: 'error',
          timestamp: Date.now()
        }
      }
    }
  }

  /**
   * Batch optimized search for multiple queries
   */
  async batchOptimizedSearch(
    queries: string[],
    options?: {
      useOptimization?: boolean
      maxResults?: number
      concurrency?: number
    }
  ): Promise<OptimizedSearchResult[]> {
    const concurrency = options?.concurrency || 3
    const results: OptimizedSearchResult[] = []

    // Process queries in batches to avoid overwhelming APIs
    for (let i = 0; i < queries.length; i += concurrency) {
      const batch = queries.slice(i, i + concurrency)
      const batchPromises = batch.map(query =>
        this.optimizedSearch(query, options).catch(
          () =>
            ({
              results: [],
              optimization: {
                originalQuery: query,
                optimizedQuery: query,
                optimizationScore: 0,
                processingTime: 0,
                cacheHit: false,
                fallbackUsed: false
              },
              metadata: {
                totalResults: 0,
                searchTime: 0,
                source: 'batch_error',
                timestamp: Date.now()
              }
            }) as OptimizedSearchResult
        )
      )

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Small delay between batches to be respectful to APIs
      if (i + concurrency < queries.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    this.emit('batchSearchCompleted', {
      totalQueries: queries.length,
      successCount: results.filter(r => r.results.length > 0).length,
      results
    })

    return results
  }

  /**
   * Get search suggestions based on query optimization
   */
  async getSearchSuggestions(query: string): Promise<{
    suggestions: string[]
    filters: Array<{type: string; value: string; confidence: number}>
    analysis: unknown
  }> {
    try {
      const optimization = await this.queryOptimizer.optimizeQuery(query)

      return {
        suggestions: [
          optimization.optimizedQuery,
          ...optimization.refinements,
          ...optimization.expansionTerms.map(term => `${query} ${term}`)
        ]
          .filter(
            (suggestion, index, array) =>
              suggestion !== query && array.indexOf(suggestion) === index
          )
          .slice(0, 5),
        filters: optimization.suggestedFilters,
        analysis: optimization.analysis
      }
    } catch {
      return {
        suggestions: [],
        filters: [],
        analysis: null
      }
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Set up event forwarding from components
   */
  private setupEventForwarding(): void {
    // Forward query optimizer events
    this.queryOptimizer.on('queryOptimized', data => {
      this.emit('componentEvent', {component: 'optimizer', event: 'queryOptimized', data})
    })

    this.queryOptimizer.on('cacheHit', data => {
      this.emit('componentEvent', {component: 'optimizer', event: 'cacheHit', data})
    })

    this.queryOptimizer.on('optimizationError', data => {
      this.emit('componentEvent', {component: 'optimizer', event: 'error', data})
    })

    // Forward search tools events
    this.searchTools.on('searchStarted', data => {
      this.emit('componentEvent', {component: 'searchTools', event: 'searchStarted', data})
    })

    this.searchTools.on('searchCompleted', data => {
      this.emit('componentEvent', {component: 'searchTools', event: 'searchCompleted', data})
    })

    this.searchTools.on('error', data => {
      this.emit('componentEvent', {component: 'searchTools', event: 'error', data})
    })

    // Forward orchestrator events
    this.orchestrator.on('searchExecuted', data => {
      this.emit('componentEvent', {component: 'orchestrator', event: 'searchExecuted', data})
    })

    this.orchestrator.on('cacheHit', data => {
      this.emit('componentEvent', {component: 'orchestrator', event: 'cacheHit', data})
    })

    this.orchestrator.on('error', data => {
      this.emit('componentEvent', {component: 'orchestrator', event: 'error', data})
    })
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    return {
      optimizer: this.queryOptimizer.getCacheStats(),
      orchestrator: {
        // Basic stats since getAnalytics might not exist
        status: 'active'
      },
      searchTools: {
        status: 'active'
      },
      config: this.config
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<OptimizedSearchConfig>): void {
    Object.assign(this.config, updates)

    if (updates.queryOptimization) {
      this.queryOptimizer.updateConfig(updates.queryOptimization)
    }

    this.emit('configUpdated', this.config)
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.queryOptimizer.clearCache()
    // Note: orchestrator.clearCache() might not exist
    this.emit('cachesCleared')
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.queryOptimizer.removeAllListeners()
    this.searchTools.removeAllListeners()
    this.orchestrator.removeAllListeners()
    this.removeAllListeners()
  }
}

export default OptimizedSearchIntegration
