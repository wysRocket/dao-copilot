/**
 * Circuit Breaker Pattern Implementation
 *
 * Implements the circuit breaker pattern to prevent repeated failures and provide
 * graceful degradation. Includes Open, Half-Open, and Closed states with configurable
 * failure thresholds and recovery mechanisms.
 */

export enum CircuitBreakerState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing fast, not allowing calls
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures before opening circuit
  recoveryTimeoutMs: number // Time to wait before attempting recovery
  successThreshold: number // Number of successes needed to close circuit in half-open state
  monitoringWindowMs: number // Time window for failure tracking
  degradedModeCallback?: () => void // Callback when entering degraded mode
  recoveredCallback?: () => void // Callback when recovering
}

export interface CircuitBreakerMetrics {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  rejectedCalls: number
  state: CircuitBreakerState
  lastStateChange: number
  consecutiveFailures: number
  consecutiveSuccesses: number
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED
  private failureCount = 0
  private successCount = 0
  private lastFailureTime = 0
  private lastStateChangeTime = Date.now()
  private metrics: CircuitBreakerMetrics
  private readonly config: CircuitBreakerConfig

  private static readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000, // 30 seconds
    successThreshold: 3,
    monitoringWindowMs: 60000 // 1 minute
  }

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {...CircuitBreaker.DEFAULT_CONFIG, ...config}
    this.metrics = this.initializeMetrics()
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        this.transitionToHalfOpen()
      } else {
        this.metrics.rejectedCalls++
        throw new CircuitBreakerOpenError('Circuit breaker is OPEN - operation rejected')
      }
    }

    this.metrics.totalCalls++

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {...this.metrics}
  }

  /**
   * Check if circuit breaker allows calls
   */
  isCallAllowed(): boolean {
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true
      case CircuitBreakerState.HALF_OPEN:
        return true
      case CircuitBreakerState.OPEN:
        return this.shouldAttemptRecovery()
    }
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
    this.lastStateChangeTime = Date.now()
    this.updateMetrics()
  }

  /**
   * Force circuit breaker to OPEN state
   */
  forceOpen(): void {
    this.transitionToOpen()
  }

  /**
   * Get health status of the circuit breaker
   */
  getHealthStatus(): CircuitBreakerHealthStatus {
    const now = Date.now()
    const timeSinceLastFailure = now - this.lastFailureTime
    const timeSinceLastStateChange = now - this.lastStateChangeTime

    return {
      state: this.state,
      isHealthy: this.state === CircuitBreakerState.CLOSED && this.failureCount === 0,
      failureRate: this.calculateFailureRate(),
      consecutiveFailures: this.failureCount,
      timeSinceLastFailure,
      timeSinceLastStateChange,
      nextRetryTime:
        this.state === CircuitBreakerState.OPEN
          ? this.lastStateChangeTime + this.config.recoveryTimeoutMs
          : null
    }
  }

  private onSuccess(): void {
    this.metrics.successfulCalls++

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        this.resetFailureCount()
        break

      case CircuitBreakerState.HALF_OPEN:
        this.successCount++
        if (this.successCount >= this.config.successThreshold) {
          this.transitionToClosed()
        }
        break
    }
  }

  private onFailure(error: Error): void {
    this.metrics.failedCalls++
    this.failureCount++
    this.lastFailureTime = Date.now()

    // Log error for debugging (could be enhanced with logging service)
    console.debug('Circuit breaker failure:', error.message)

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        if (this.failureCount >= this.config.failureThreshold) {
          this.transitionToOpen()
        }
        break

      case CircuitBreakerState.HALF_OPEN:
        this.transitionToOpen()
        break
    }
  }

  private shouldAttemptRecovery(): boolean {
    const now = Date.now()
    const timeSinceOpen = now - this.lastStateChangeTime
    return timeSinceOpen >= this.config.recoveryTimeoutMs
  }

  private transitionToClosed(): void {
    this.state = CircuitBreakerState.CLOSED
    this.resetFailureCount()
    this.resetSuccessCount()
    this.lastStateChangeTime = Date.now()
    this.updateMetrics()

    if (this.config.recoveredCallback) {
      this.config.recoveredCallback()
    }
  }

  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN
    this.resetSuccessCount()
    this.lastStateChangeTime = Date.now()
    this.updateMetrics()

    if (this.config.degradedModeCallback) {
      this.config.degradedModeCallback()
    }
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN
    this.resetSuccessCount()
    this.lastStateChangeTime = Date.now()
    this.updateMetrics()
  }

  private resetFailureCount(): void {
    this.failureCount = 0
    this.lastFailureTime = 0
  }

  private resetSuccessCount(): void {
    this.successCount = 0
  }

  private calculateFailureRate(): number {
    const totalCalls = this.metrics.totalCalls
    if (totalCalls === 0) return 0
    return this.metrics.failedCalls / totalCalls
  }

  private updateMetrics(): void {
    this.metrics.state = this.state
    this.metrics.lastStateChange = this.lastStateChangeTime
    this.metrics.consecutiveFailures = this.failureCount
    this.metrics.consecutiveSuccesses = this.successCount
  }

  private initializeMetrics(): CircuitBreakerMetrics {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      state: this.state,
      lastStateChange: this.lastStateChangeTime,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0
    }
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitBreakerOpenError'
  }
}

/**
 * Health status information for the circuit breaker
 */
export interface CircuitBreakerHealthStatus {
  state: CircuitBreakerState
  isHealthy: boolean
  failureRate: number
  consecutiveFailures: number
  timeSinceLastFailure: number
  timeSinceLastStateChange: number
  nextRetryTime: number | null
}

/**
 * Advanced Circuit Breaker with additional features
 */
export class AdvancedCircuitBreaker extends CircuitBreaker {
  private errorTypeCounters = new Map<string, number>()
  private timeWindowFailures: number[] = []
  private advancedConfig: CircuitBreakerConfig

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    super(config)
    this.advancedConfig = {...CircuitBreaker['DEFAULT_CONFIG'], ...config}
  }

  /**
   * Track error types for analysis
   */
  protected onFailure(error: Error): void {
    super['onFailure'](error)

    // Track error types
    const errorType = error.name || 'UnknownError'
    this.errorTypeCounters.set(errorType, (this.errorTypeCounters.get(errorType) || 0) + 1)

    // Track failures in time window
    const now = Date.now()
    this.timeWindowFailures.push(now)

    // Clean old failures outside the monitoring window
    const windowStart = now - this.advancedConfig.monitoringWindowMs
    this.timeWindowFailures = this.timeWindowFailures.filter(time => time >= windowStart)
  }

  /**
   * Get error type statistics
   */
  getErrorTypeStats(): Map<string, number> {
    return new Map(this.errorTypeCounters)
  }

  /**
   * Get failure rate within monitoring window
   */
  getWindowedFailureRate(): number {
    const now = Date.now()
    const windowStart = now - this.advancedConfig.monitoringWindowMs
    const recentFailures = this.timeWindowFailures.filter(time => time >= windowStart)

    // Estimate total calls in window (this could be improved with actual call tracking)
    const totalCalls = Math.max(recentFailures.length, this.getMetrics().totalCalls)

    return totalCalls > 0 ? recentFailures.length / totalCalls : 0
  }

  /**
   * Check if specific error type should trip the circuit
   */
  isErrorTypeSignificant(errorType: string): boolean {
    const count = this.errorTypeCounters.get(errorType) || 0
    const threshold = Math.floor(this.advancedConfig.failureThreshold * 0.6) // 60% of threshold
    return count >= threshold
  }
}

/**
 * Circuit Breaker Manager for multiple services
 */
export class CircuitBreakerManager {
  private circuitBreakers = new Map<string, CircuitBreaker>()
  private readonly defaultConfig: CircuitBreakerConfig

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = {...CircuitBreaker['DEFAULT_CONFIG'], ...defaultConfig}
  }

  /**
   * Get or create a circuit breaker for a service
   */
  getCircuitBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      const finalConfig = config ? {...this.defaultConfig, ...config} : this.defaultConfig
      this.circuitBreakers.set(serviceName, new CircuitBreaker(finalConfig))
    }
    return this.circuitBreakers.get(serviceName)!
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    serviceName: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(serviceName, config)
    return circuitBreaker.execute(operation)
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllStatuses(): Map<string, CircuitBreakerHealthStatus> {
    const statuses = new Map<string, CircuitBreakerHealthStatus>()
    this.circuitBreakers.forEach((cb, name) => {
      statuses.set(name, cb.getHealthStatus())
    })
    return statuses
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.circuitBreakers.forEach(cb => cb.reset())
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): SystemHealthStatus {
    const statuses = this.getAllStatuses()
    const totalCircuits = statuses.size
    let healthyCircuits = 0
    let openCircuits = 0
    let halfOpenCircuits = 0

    statuses.forEach(status => {
      if (status.isHealthy) healthyCircuits++
      if (status.state === CircuitBreakerState.OPEN) openCircuits++
      if (status.state === CircuitBreakerState.HALF_OPEN) halfOpenCircuits++
    })

    return {
      totalCircuits,
      healthyCircuits,
      openCircuits,
      halfOpenCircuits,
      overallHealth: totalCircuits > 0 ? healthyCircuits / totalCircuits : 1,
      isDegraded: openCircuits > 0
    }
  }
}

export interface SystemHealthStatus {
  totalCircuits: number
  healthyCircuits: number
  openCircuits: number
  halfOpenCircuits: number
  overallHealth: number // 0-1 scale
  isDegraded: boolean
}
