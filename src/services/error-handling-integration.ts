/**
 * Advanced Error Handling and System Integration Module
 *
 * This module provides comprehensive error handling, retry mechanisms, and system
 * integration for the Google Search Tool Integration with Gemini Live API.
 *
 * Features:
 * - Robust error handling with categorization and recovery strategies
 * - Retry mechanisms with exponential backoff and circuit breaker patterns
 * - Comprehensive logging and monitoring
 * - Integration with ConversationStateMachine
 * - Intent classification for search-related operations
 * - Health monitoring and system diagnostics
 */

import {EventEmitter} from 'events'
import {GeminiSearchTools} from './gemini-search-tools'
import {OptimizedSearchIntegration} from './optimized-search-integration'
import {ConversationStateMachine} from './conversation-state-machine'

// ============================================================================
// ERROR CLASSIFICATION AND TYPES
// ============================================================================

/**
 * Error Categories for systematic handling
 */
export enum ErrorCategory {
  NETWORK_ERROR = 'network_error',
  API_ERROR = 'api_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  VALIDATION_ERROR = 'validation_error',
  CONFIGURATION_ERROR = 'configuration_error',
  PROCESSING_ERROR = 'processing_error',
  TIMEOUT_ERROR = 'timeout_error',
  SYSTEM_ERROR = 'system_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Error Severity Levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Recovery Strategy Types
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  FAIL = 'fail',
  CIRCUIT_BREAK = 'circuit_break'
}

/**
 * Classified Error Interface
 */
export interface ClassifiedError {
  originalError: Error
  category: ErrorCategory
  severity: ErrorSeverity
  recoveryStrategy: RecoveryStrategy
  retryable: boolean
  metadata: {
    timestamp: number
    context: string
    operation: string
    component: string
    correlationId: string
  }
}

/**
 * Retry Configuration
 */
export interface RetryConfig {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  exponentialBase: number
  jitterEnabled: boolean
  timeoutMs: number
}

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeoutMs: number
  monitoringWindowMs: number
  minimumThroughput: number
}

/**
 * Health Check Configuration
 */
export interface HealthCheckConfig {
  intervalMs: number
  timeoutMs: number
  enableDeepChecks: boolean
  alertThresholds: {
    errorRate: number
    responseTime: number
    memory: number
    cpu: number
  }
}

/**
 * System Integration Configuration
 */
export interface SystemIntegrationConfig {
  enableConversationStateIntegration: boolean
  enableIntentClassification: boolean
  enableHealthMonitoring: boolean
  enableMetrics: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  retryConfig: RetryConfig
  circuitBreakerConfig: CircuitBreakerConfig
  healthCheckConfig: HealthCheckConfig
}

// ============================================================================
// ERROR CLASSIFIER
// ============================================================================

/**
 * Error Classification System
 * Analyzes errors and determines appropriate handling strategies
 */
export class ErrorClassifier {
  /**
   * Classify an error and determine handling strategy
   */
  static classify(
    error: Error,
    context: string,
    operation: string,
    component: string
  ): ClassifiedError {
    const correlationId = this.generateCorrelationId()

    let category = ErrorCategory.UNKNOWN_ERROR
    let severity = ErrorSeverity.MEDIUM
    let recoveryStrategy = RecoveryStrategy.RETRY
    let retryable = true

    const errorMessage = error.message.toLowerCase()
    const errorName = error.name.toLowerCase()

    // Network errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorName.includes('timeout')
    ) {
      category = ErrorCategory.NETWORK_ERROR
      severity = ErrorSeverity.HIGH
      recoveryStrategy = RecoveryStrategy.RETRY
      retryable = true
    }

    // API errors
    else if (errorMessage.includes('api') || errorMessage.includes('http')) {
      category = ErrorCategory.API_ERROR

      if (
        errorMessage.includes('401') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('api key')
      ) {
        category = ErrorCategory.AUTHENTICATION_ERROR
        severity = ErrorSeverity.CRITICAL
        recoveryStrategy = RecoveryStrategy.FAIL
        retryable = false
      } else if (
        errorMessage.includes('429') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('quota')
      ) {
        category = ErrorCategory.RATE_LIMIT_ERROR
        severity = ErrorSeverity.HIGH
        recoveryStrategy = RecoveryStrategy.RETRY
        retryable = true
      } else if (errorMessage.includes('400') || errorMessage.includes('bad request')) {
        category = ErrorCategory.VALIDATION_ERROR
        severity = ErrorSeverity.MEDIUM
        recoveryStrategy = RecoveryStrategy.SKIP
        retryable = false
      } else if (errorMessage.includes('500') || errorMessage.includes('internal server')) {
        severity = ErrorSeverity.HIGH
        recoveryStrategy = RecoveryStrategy.RETRY
        retryable = true
      }
    }

    // Timeout errors
    else if (errorMessage.includes('timeout') || errorName.includes('timeout')) {
      category = ErrorCategory.TIMEOUT_ERROR
      severity = ErrorSeverity.HIGH
      recoveryStrategy = RecoveryStrategy.RETRY
      retryable = true
    }

    // Validation errors
    else if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('validation') ||
      errorMessage.includes('required') ||
      errorMessage.includes('missing')
    ) {
      category = ErrorCategory.VALIDATION_ERROR
      severity = ErrorSeverity.LOW
      recoveryStrategy = RecoveryStrategy.SKIP
      retryable = false
    }

    // Configuration errors
    else if (
      errorMessage.includes('config') ||
      errorMessage.includes('setting') ||
      errorMessage.includes('environment')
    ) {
      category = ErrorCategory.CONFIGURATION_ERROR
      severity = ErrorSeverity.CRITICAL
      recoveryStrategy = RecoveryStrategy.FAIL
      retryable = false
    }

    // Processing errors
    else if (
      errorMessage.includes('process') ||
      errorMessage.includes('parse') ||
      errorMessage.includes('transform')
    ) {
      category = ErrorCategory.PROCESSING_ERROR
      severity = ErrorSeverity.MEDIUM
      recoveryStrategy = RecoveryStrategy.FALLBACK
      retryable = true
    }

    return {
      originalError: error,
      category,
      severity,
      recoveryStrategy,
      retryable,
      metadata: {
        timestamp: Date.now(),
        context,
        operation,
        component,
        correlationId
      }
    }
  }

  /**
   * Generate unique correlation ID for error tracking
   */
  private static generateCorrelationId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// ============================================================================
// RETRY HANDLER
// ============================================================================

/**
 * Advanced Retry Handler with Exponential Backoff
 */
export class RetryHandler {
  private config: RetryConfig

  constructor(config: RetryConfig) {
    this.config = config
  }

  /**
   * Execute operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: string,
    classifier?: (error: Error) => ClassifiedError
  ): Promise<T> {
    let lastError: Error | null = null
    let attempt = 0

    while (attempt < this.config.maxAttempts) {
      try {
        // Add timeout wrapper
        return await this.withTimeout(operation(), this.config.timeoutMs)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        attempt++

        // Classify error to determine if retry is appropriate
        if (classifier) {
          const classified = classifier(lastError)
          if (!classified.retryable || classified.recoveryStrategy !== RecoveryStrategy.RETRY) {
            throw lastError
          }
        }

        // Don't wait after last attempt
        if (attempt >= this.config.maxAttempts) {
          break
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt)
        await this.sleep(delay)
      }
    }

    throw new Error(
      `Operation failed after ${this.config.maxAttempts} attempts. Last error: ${lastError?.message}`
    )
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.config.baseDelayMs * Math.pow(this.config.exponentialBase, attempt - 1)
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs)

    if (this.config.jitterEnabled) {
      // Add up to 25% jitter to prevent thundering herd
      const jitter = cappedDelay * 0.25 * Math.random()
      return cappedDelay + jitter
    }

    return cappedDelay
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Wrap operation with timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId))
    })
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Circuit Breaker State
 */
enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state = CircuitBreakerState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0
  private successCount = 0
  private config: CircuitBreakerConfig

  constructor(config: CircuitBreakerConfig) {
    super()
    this.config = config
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>, context: string): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.config.resetTimeoutMs) {
        throw new Error(`Circuit breaker is OPEN - ${context}`)
      }

      // Transition to half-open
      this.state = CircuitBreakerState.HALF_OPEN
      this.emit('stateChange', {state: this.state, context})
    }

    try {
      const result = await operation()

      // Record success
      this.onSuccess()
      return result
    } catch (error) {
      // Record failure
      this.onFailure()
      throw error
    }
  }

  /**
   * Record successful operation
   */
  private onSuccess(): void {
    this.successCount++

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Transition back to closed
      this.state = CircuitBreakerState.CLOSED
      this.failureCount = 0
      this.emit('stateChange', {state: this.state})
    }
  }

  /**
   * Record failed operation
   */
  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN
      this.emit('stateChange', {state: this.state, failureCount: this.failureCount})
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    }
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
    this.emit('reset')
  }
}

// ============================================================================
// SYSTEM HEALTH MONITOR
// ============================================================================

/**
 * System Health Monitoring
 */
export class HealthMonitor extends EventEmitter {
  private config: HealthCheckConfig
  private healthStatus = new Map<string, boolean>()
  private lastHealthCheck = 0
  private metrics = {
    totalRequests: 0,
    totalErrors: 0,
    averageResponseTime: 0,
    memoryUsage: 0,
    cpuUsage: 0
  }

  constructor(config: HealthCheckConfig) {
    super()
    this.config = config
    this.startMonitoring()
  }

  /**
   * Start health monitoring
   */
  private startMonitoring(): void {
    setInterval(async () => {
      await this.performHealthCheck()
    }, this.config.intervalMs)
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<void> {
    const startTime = Date.now()

    try {
      // Basic system checks
      await this.checkSystemHealth()

      // Deep checks if enabled
      if (this.config.enableDeepChecks) {
        await this.performDeepHealthCheck()
      }

      this.lastHealthCheck = Date.now()
      this.emit('healthCheck', {
        status: 'healthy',
        duration: Date.now() - startTime,
        timestamp: this.lastHealthCheck
      })
    } catch (error) {
      this.emit('healthCheckFailed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Basic system health checks
   */
  private async checkSystemHealth(): Promise<void> {
    // Memory usage check
    const memoryUsage = process.memoryUsage()
    this.metrics.memoryUsage = memoryUsage.heapUsed / 1024 / 1024 // MB

    if (this.metrics.memoryUsage > this.config.alertThresholds.memory) {
      this.emit('alert', {
        type: 'high_memory_usage',
        value: this.metrics.memoryUsage,
        threshold: this.config.alertThresholds.memory
      })
    }

    // Error rate check
    const errorRate = this.metrics.totalErrors / Math.max(1, this.metrics.totalRequests)
    if (errorRate > this.config.alertThresholds.errorRate) {
      this.emit('alert', {
        type: 'high_error_rate',
        value: errorRate,
        threshold: this.config.alertThresholds.errorRate
      })
    }
  }

  /**
   * Deep health checks
   */
  private async performDeepHealthCheck(): Promise<void> {
    // Can be extended with specific component health checks
    // For example: database connectivity, external API availability, etc.
  }

  /**
   * Record operation metrics
   */
  recordOperation(duration: number, success: boolean): void {
    this.metrics.totalRequests++
    if (!success) {
      this.metrics.totalErrors++
    }

    // Update average response time
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration) /
      this.metrics.totalRequests
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      healthy: this.lastHealthCheck > Date.now() - this.config.intervalMs * 2,
      lastCheck: this.lastHealthCheck,
      metrics: {...this.metrics},
      componentHealth: Object.fromEntries(this.healthStatus)
    }
  }
}

// ============================================================================
// CONVERSATION STATE INTEGRATION
// ============================================================================

/**
 * Search-related conversation states
 */
export enum SearchState {
  SEARCH_INITIATED = 'search_initiated',
  SEARCH_IN_PROGRESS = 'search_in_progress',
  SEARCH_COMPLETED = 'search_completed',
  SEARCH_ERROR = 'search_error',
  SEARCH_OPTIMIZATION = 'search_optimization'
}

/**
 * Extended Conversation State Machine Integration
 */
export class SearchStateManager extends EventEmitter {
  private conversationState?: ConversationStateMachine
  private currentSearchContext: Map<string, unknown> = new Map()

  constructor(conversationState?: ConversationStateMachine) {
    super()
    this.conversationState = conversationState
    this.setupStateHandlers()
  }

  /**
   * Set up state transition handlers
   */
  private setupStateHandlers(): void {
    if (!this.conversationState) return

    // Register search-related states if ConversationStateMachine supports it
    // This would need to be implemented based on the actual ConversationStateMachine interface
  }

  /**
   * Handle search initiation
   */
  async handleSearchInitiated(query: string, context?: Record<string, unknown>): Promise<void> {
    this.currentSearchContext.set('query', query)
    this.currentSearchContext.set('startTime', Date.now())
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        this.currentSearchContext.set(key, value)
      }
    }

    this.emit('stateChange', {
      state: SearchState.SEARCH_INITIATED,
      query,
      context
    })
  }

  /**
   * Handle search completion
   */
  async handleSearchCompleted(results: unknown[], processingTime: number): Promise<void> {
    this.currentSearchContext.set('results', results)
    this.currentSearchContext.set('processingTime', processingTime)
    this.currentSearchContext.set('endTime', Date.now())

    this.emit('stateChange', {
      state: SearchState.SEARCH_COMPLETED,
      results,
      processingTime
    })
  }

  /**
   * Handle search error
   */
  async handleSearchError(error: ClassifiedError): Promise<void> {
    this.currentSearchContext.set('error', error)
    this.currentSearchContext.set('endTime', Date.now())

    this.emit('stateChange', {
      state: SearchState.SEARCH_ERROR,
      error
    })
  }

  /**
   * Get current search context
   */
  getCurrentContext(): Record<string, unknown> {
    return Object.fromEntries(this.currentSearchContext)
  }
}

// ============================================================================
// INTENT CLASSIFICATION EXTENSION
// ============================================================================

/**
 * Search-related intent types
 */
export enum SearchIntent {
  WEB_SEARCH = 'web_search',
  INFORMATION_LOOKUP = 'information_lookup',
  RESEARCH_QUERY = 'research_query',
  NEWS_SEARCH = 'news_search',
  PRODUCT_SEARCH = 'product_search',
  LOCATION_SEARCH = 'location_search',
  TECHNICAL_HELP = 'technical_help'
}

/**
 * Enhanced Intent Classification for Search Operations
 */
export class SearchIntentClassifier {
  private searchKeywords = new Map([
    [SearchIntent.WEB_SEARCH, ['search', 'find', 'look up', 'google']],
    [SearchIntent.INFORMATION_LOOKUP, ['what is', 'define', 'explain', 'tell me about']],
    [SearchIntent.RESEARCH_QUERY, ['research', 'analyze', 'compare', 'study']],
    [SearchIntent.NEWS_SEARCH, ['news', 'latest', 'recent', 'current events']],
    [SearchIntent.PRODUCT_SEARCH, ['buy', 'product', 'price', 'review', 'compare']],
    [SearchIntent.LOCATION_SEARCH, ['where is', 'location', 'address', 'directions']],
    [SearchIntent.TECHNICAL_HELP, ['how to', 'tutorial', 'guide', 'help', 'troubleshoot']]
  ])

  /**
   * Classify search intent
   */
  classifySearchIntent(query: string): {
    intent: SearchIntent
    confidence: number
    keywords: string[]
  } {
    const lowercaseQuery = query.toLowerCase()
    const scores = new Map<SearchIntent, number>()

    // Score each intent based on keyword matches
    for (const [intent, keywords] of this.searchKeywords) {
      let score = 0
      const matchedKeywords: string[] = []

      for (const keyword of keywords) {
        if (lowercaseQuery.includes(keyword)) {
          score += keyword.length // Longer keywords get higher scores
          matchedKeywords.push(keyword)
        }
      }

      if (score > 0) {
        scores.set(intent, score)
      }
    }

    // Find the best match
    let bestIntent = SearchIntent.WEB_SEARCH
    let bestScore = 0
    let bestKeywords: string[] = []

    for (const [intent, score] of scores) {
      if (score > bestScore) {
        bestIntent = intent
        bestScore = score
        bestKeywords = this.searchKeywords.get(intent) || []
      }
    }

    // Calculate confidence based on score relative to query length
    const confidence = Math.min(bestScore / query.length, 1.0)

    return {
      intent: bestIntent,
      confidence,
      keywords: bestKeywords
    }
  }
}

export default {
  ErrorClassifier,
  RetryHandler,
  CircuitBreaker,
  HealthMonitor,
  SearchStateManager,
  SearchIntentClassifier
}
