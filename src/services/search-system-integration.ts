/**
 * Comprehensive System Integration Module
 *
 * This module integrates all search-related components with the existing
 * DAO Copilot system, providing a unified interface and comprehensive
 * error handling, monitoring, and system coordination.
 */

import {EventEmitter} from 'events'
import {GeminiSearchTools, GeminiSearchConfig} from './gemini-search-tools'
import OptimizedSearchIntegration, {OptimizedSearchConfig} from './optimized-search-integration'
import {
  ErrorClassifier,
  RetryHandler,
  CircuitBreaker,
  HealthMonitor,
  SearchStateManager,
  SearchIntentClassifier,
  SystemIntegrationConfig,
  ClassifiedError
} from './error-handling-integration'

/**
 * System Integration Events
 */
export interface SystemEvents {
  'search:initiated': {query: string; context?: Record<string, unknown>}
  'search:completed': {query: string; results: unknown[]; processingTime: number}
  'search:error': {query: string; error: ClassifiedError}
  'search:optimized': {originalQuery: string; optimizedQuery: string; score: number}
  'system:healthy': {status: unknown}
  'system:unhealthy': {issues: string[]}
  'circuit:opened': {component: string; reason: string}
  'circuit:closed': {component: string}
  'retry:attempted': {operation: string; attempt: number; maxAttempts: number}
  'fallback:activated': {component: string; reason: string}
}

/**
 * Master System Integration Configuration
 */
export interface MasterIntegrationConfig {
  // Component configurations
  geminiSearch: GeminiSearchConfig
  optimizedSearch: OptimizedSearchConfig
  systemIntegration: SystemIntegrationConfig

  // Global settings
  enableAllComponents: boolean
  enableErrorRecovery: boolean
  enablePerformanceMonitoring: boolean
  enableSystemIntegration: boolean

  // Environment settings
  environment: 'development' | 'staging' | 'production'
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

/**
 * System Component Status
 */
export interface ComponentStatus {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline'
  lastCheck: number
  errors: number
  uptime: number
  metrics?: Record<string, unknown>
}

/**
 * Search Operation Result
 */
export interface SearchOperationResult {
  success: boolean
  results?: unknown[]
  error?: ClassifiedError
  metadata: {
    query: string
    processingTime: number
    retriesAttempted: number
    fallbackUsed: boolean
    optimizationApplied: boolean
    timestamp: number
    correlationId: string
  }
}

/**
 * Comprehensive Search System Integration
 */
export class SearchSystemIntegration extends EventEmitter {
  private config: MasterIntegrationConfig

  // Core components
  private geminiSearchTools?: GeminiSearchTools
  private optimizedSearch?: OptimizedSearchIntegration

  // Error handling and monitoring
  private retryHandler: RetryHandler
  private circuitBreaker: CircuitBreaker
  private healthMonitor: HealthMonitor
  private searchStateManager: SearchStateManager
  private intentClassifier: SearchIntentClassifier

  // System state
  private components = new Map<string, ComponentStatus>()
  private operationCounter = 0
  private startTime: number

  constructor(config: MasterIntegrationConfig) {
    super()

    this.config = config
    this.startTime = Date.now()

    // Initialize error handling components
    this.retryHandler = new RetryHandler(config.systemIntegration.retryConfig)
    this.circuitBreaker = new CircuitBreaker(config.systemIntegration.circuitBreakerConfig)
    this.healthMonitor = new HealthMonitor(config.systemIntegration.healthCheckConfig)
    this.searchStateManager = new SearchStateManager()
    this.intentClassifier = new SearchIntentClassifier()

    // Initialize search components if enabled
    if (config.enableAllComponents) {
      this.initializeComponents()
    }

    // Set up event handlers
    this.setupEventHandlers()

    // Start system monitoring
    if (config.enablePerformanceMonitoring) {
      this.startSystemMonitoring()
    }
  }

  /**
   * Initialize search components
   */
  private async initializeComponents(): Promise<void> {
    try {
      // Initialize Gemini Search Tools
      this.geminiSearchTools = new GeminiSearchTools(this.config.geminiSearch)
      this.registerComponent('geminiSearch', 'healthy')

      // Initialize Optimized Search Integration
      this.optimizedSearch = new OptimizedSearchIntegration(this.config.optimizedSearch)
      this.registerComponent('optimizedSearch', 'healthy')

      this.emit('system:initialized', {
        components: Array.from(this.components.keys()),
        timestamp: Date.now()
      })
    } catch (error) {
      const classifiedError = ErrorClassifier.classify(
        error instanceof Error ? error : new Error(String(error)),
        'component_initialization',
        'initialize_components',
        'SearchSystemIntegration'
      )

      this.emit('system:initializationError', {error: classifiedError})
      throw error
    }
  }

  /**
   * Perform intelligent search with full system integration
   */
  async search(
    query: string,
    options?: {
      enableOptimization?: boolean
      enableFallback?: boolean
      maxResults?: number
      timeout?: number
      context?: Record<string, unknown>
    }
  ): Promise<SearchOperationResult> {
    const correlationId = this.generateCorrelationId()
    const startTime = Date.now()

    try {
      // Classify search intent
      const intentClassification = this.intentClassifier.classifySearchIntent(query)

      // Emit search initiated event
      await this.searchStateManager.handleSearchInitiated(query, {
        ...options?.context,
        intent: intentClassification,
        correlationId
      })

      this.emit('search:initiated', {query, context: options?.context})

      // Execute search with comprehensive error handling
      const searchResult = await this.executeSearchWithErrorHandling(query, options, correlationId)

      // Handle successful search
      await this.searchStateManager.handleSearchCompleted(
        searchResult.results || [],
        Date.now() - startTime
      )

      this.emit('search:completed', {
        query,
        results: searchResult.results || [],
        processingTime: Date.now() - startTime
      })

      // Record operation metrics
      this.healthMonitor.recordOperation(Date.now() - startTime, true)

      return {
        success: true,
        results: searchResult.results,
        metadata: {
          query,
          processingTime: Date.now() - startTime,
          retriesAttempted: searchResult.retriesAttempted || 0,
          fallbackUsed: searchResult.fallbackUsed || false,
          optimizationApplied: searchResult.optimizationApplied || false,
          timestamp: Date.now(),
          correlationId
        }
      }
    } catch (error) {
      const classifiedError = ErrorClassifier.classify(
        error instanceof Error ? error : new Error(String(error)),
        'search_operation',
        'search',
        'SearchSystemIntegration'
      )

      // Handle search error
      await this.searchStateManager.handleSearchError(classifiedError)
      this.emit('search:error', {query, error: classifiedError})

      // Record failed operation
      this.healthMonitor.recordOperation(Date.now() - startTime, false)

      return {
        success: false,
        error: classifiedError,
        metadata: {
          query,
          processingTime: Date.now() - startTime,
          retriesAttempted: 0,
          fallbackUsed: false,
          optimizationApplied: false,
          timestamp: Date.now(),
          correlationId
        }
      }
    }
  }

  /**
   * Execute search with comprehensive error handling
   */
  private async executeSearchWithErrorHandling(
    query: string,
    options?: {
      enableOptimization?: boolean
      enableFallback?: boolean
      maxResults?: number
      timeout?: number
    },
    correlationId?: string
  ): Promise<{
    results?: unknown[]
    retriesAttempted?: number
    fallbackUsed?: boolean
    optimizationApplied?: boolean
  }> {
    const retriesAttempted = 0
    let fallbackUsed = false
    let optimizationApplied = false

    // Primary search strategy: Use optimized search if available and enabled
    if (this.optimizedSearch && options?.enableOptimization !== false) {
      try {
        const result = await this.circuitBreaker.execute(async () => {
          return await this.retryHandler.execute(
            async () => {
              const searchResult = await this.optimizedSearch!.optimizedSearch(query, {
                maxResults: options?.maxResults || 10,
                useOptimization: true
              })

              optimizationApplied = searchResult.optimization.optimizationScore > 0.5

              if (optimizationApplied) {
                this.emit('search:optimized', {
                  originalQuery: query,
                  optimizedQuery: searchResult.optimization.optimizedQuery,
                  score: searchResult.optimization.optimizationScore
                })
              }

              return {results: searchResult.results}
            },
            `optimized_search_${correlationId}`,
            error =>
              ErrorClassifier.classify(error, 'optimized_search', 'search', 'OptimizedSearch')
          )
        }, `optimized_search_${correlationId}`)

        return {
          results: result.results,
          retriesAttempted,
          fallbackUsed,
          optimizationApplied
        }
      } catch (error) {
        // If optimized search fails and fallback is enabled, continue to fallback
        if (!options?.enableFallback) {
          throw error
        }
      }
    }

    // Fallback strategy: Use basic Gemini Search Tools
    if (this.geminiSearchTools && options?.enableFallback !== false) {
      fallbackUsed = true
      this.emit('fallback:activated', {
        component: 'GeminiSearchTools',
        reason: 'OptimizedSearch unavailable or failed'
      })

      const result = await this.circuitBreaker.execute(async () => {
        return await this.retryHandler.execute(
          async () => {
            const searchResult = await this.geminiSearchTools!.google_search({
              query,
              max_results: options?.maxResults || 10
            })

            return {results: searchResult.results}
          },
          `fallback_search_${correlationId}`,
          error => ErrorClassifier.classify(error, 'fallback_search', 'search', 'GeminiSearchTools')
        )
      }, `fallback_search_${correlationId}`)

      return {
        results: result.results,
        retriesAttempted,
        fallbackUsed,
        optimizationApplied
      }
    }

    throw new Error('No search components available or all components failed')
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    return {
      overall: this.isSystemHealthy(),
      uptime: Date.now() - this.startTime,
      components: Object.fromEntries(this.components),
      health: this.healthMonitor.getHealthStatus(),
      circuitBreaker: this.circuitBreaker.getStatus(),
      searchContext: this.searchStateManager.getCurrentContext(),
      operationsCount: this.operationCounter,
      timestamp: Date.now()
    }
  }

  /**
   * Check if system is healthy
   */
  private isSystemHealthy(): boolean {
    const healthStatus = this.healthMonitor.getHealthStatus()
    const componentHealth = Array.from(this.components.values()).every(
      component => component.status === 'healthy' || component.status === 'degraded'
    )

    return healthStatus.healthy && componentHealth
  }

  /**
   * Register component status
   */
  private registerComponent(name: string, status: ComponentStatus['status']): void {
    this.components.set(name, {
      name,
      status,
      lastCheck: Date.now(),
      errors: 0,
      uptime: Date.now() - this.startTime
    })
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Circuit breaker events
    this.circuitBreaker.on('stateChange', data => {
      if (data.state === 'open') {
        this.emit('circuit:opened', {
          component: 'SearchComponents',
          reason: `Circuit breaker opened after ${data.failureCount} failures`
        })
      } else if (data.state === 'closed') {
        this.emit('circuit:closed', {
          component: 'SearchComponents'
        })
      }
    })

    // Health monitor events
    this.healthMonitor.on('alert', alert => {
      this.emit('system:unhealthy', {
        issues: [`${alert.type}: ${alert.value} exceeds threshold ${alert.threshold}`]
      })
    })

    this.healthMonitor.on('healthCheck', status => {
      this.emit('system:healthy', {status})
    })

    // Search state events
    this.searchStateManager.on('stateChange', event => {
      // Forward state changes as system events
      this.emit('search:stateChange', event)
    })
  }

  /**
   * Start system monitoring
   */
  private startSystemMonitoring(): void {
    // Monitor component health every 30 seconds
    setInterval(() => {
      this.monitorComponentHealth()
    }, 30000)
  }

  /**
   * Monitor component health
   */
  private monitorComponentHealth(): void {
    for (const [, component] of this.components) {
      // Update component status based on recent activity
      const timeSinceLastCheck = Date.now() - component.lastCheck

      if (timeSinceLastCheck > 60000) {
        // 1 minute
        component.status = 'degraded'
      } else if (timeSinceLastCheck > 300000) {
        // 5 minutes
        component.status = 'unhealthy'
      }

      component.uptime = Date.now() - this.startTime
    }
  }

  /**
   * Generate correlation ID for tracking
   */
  private generateCorrelationId(): string {
    this.operationCounter++
    return `search-${Date.now()}-${this.operationCounter}-${Math.random().toString(36).substr(2, 6)}`
  }

  /**
   * Update system configuration
   */
  updateConfiguration(updates: Partial<MasterIntegrationConfig>): void {
    Object.assign(this.config, updates)

    // Apply configuration updates to components
    if (updates.optimizedSearch && this.optimizedSearch) {
      this.optimizedSearch.updateConfig(updates.optimizedSearch)
    }

    this.emit('system:configUpdated', {updates, timestamp: Date.now()})
  }

  /**
   * Reset all components
   */
  reset(): void {
    this.circuitBreaker.reset()

    if (this.optimizedSearch) {
      this.optimizedSearch.clearCaches()
    }

    // Reset component statuses
    for (const component of this.components.values()) {
      component.errors = 0
      component.status = 'healthy'
      component.lastCheck = Date.now()
    }

    this.emit('system:reset', {timestamp: Date.now()})
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      // Clean up resources
      if (this.optimizedSearch) {
        this.optimizedSearch.cleanup()
      }

      // Remove all listeners
      this.removeAllListeners()
      this.circuitBreaker.removeAllListeners()
      this.healthMonitor.removeAllListeners()
      this.searchStateManager.removeAllListeners()

      this.emit('system:shutdown', {timestamp: Date.now()})
    } catch (error) {
      const classifiedError = ErrorClassifier.classify(
        error instanceof Error ? error : new Error(String(error)),
        'system_shutdown',
        'shutdown',
        'SearchSystemIntegration'
      )

      this.emit('system:shutdownError', {error: classifiedError})
      throw error
    }
  }
}

export default SearchSystemIntegration
