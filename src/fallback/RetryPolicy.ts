/**
 * Exponential Backoff Retry Policy
 *
 * Implements retry logic with exponential backoff for handling transient failures
 * in network operations. Includes jitter to prevent thundering herd problems.
 */

export interface RetryContext {
  attemptNumber: number
  lastError: Error | null
  totalElapsedTime: number
  startTime: number
  operationId: string
}

export interface RetryPolicyConfig {
  baseDelayMs: number
  maxDelayMs: number
  maxAttempts: number
  jitterFactor: number
  timeoutMs: number
  retryableErrors?: Set<string>
}

export class RetryPolicy {
  private readonly config: RetryPolicyConfig
  private readonly activeRetries = new Map<string, RetryContext>()

  private static readonly DEFAULT_CONFIG: RetryPolicyConfig = {
    baseDelayMs: 250,
    maxDelayMs: 5000,
    maxAttempts: 5,
    jitterFactor: 0.1,
    timeoutMs: 30000,
    retryableErrors: new Set([
      'NETWORK_ERROR',
      'TIMEOUT',
      'WEBSOCKET_CLOSED',
      'CONNECTION_LOST',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE'
    ])
  }

  constructor(config: Partial<RetryPolicyConfig> = {}) {
    this.config = {...RetryPolicy.DEFAULT_CONFIG, ...config}
  }

  /**
   * Calculates the delay for the next retry attempt using exponential backoff with jitter
   */
  calculateDelay(attemptNumber: number): number {
    // Exponential backoff: baseDelay * 2^(attemptNumber - 1)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attemptNumber - 1)

    // Apply max delay cap
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs)

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() - 0.5)

    return Math.max(0, cappedDelay + jitter)
  }

  /**
   * Determines if an error should be retried
   */
  shouldRetry(error: Error, attemptNumber: number, elapsedTime: number): boolean {
    // Check if we've exceeded max attempts
    if (attemptNumber >= this.config.maxAttempts) {
      return false
    }

    // Check if we've exceeded total timeout
    if (elapsedTime >= this.config.timeoutMs) {
      return false
    }

    // Check if error is retryable
    if (this.config.retryableErrors) {
      const errorType = this.getErrorType(error)
      return this.config.retryableErrors.has(errorType)
    }

    return true
  }

  /**
   * Creates a new retry context for an operation
   */
  createContext(operationId: string): RetryContext {
    const context: RetryContext = {
      attemptNumber: 1,
      lastError: null,
      totalElapsedTime: 0,
      startTime: Date.now(),
      operationId
    }

    this.activeRetries.set(operationId, context)
    return context
  }

  /**
   * Updates retry context after a failed attempt
   */
  updateContext(operationId: string, error: Error): RetryContext | null {
    const context = this.activeRetries.get(operationId)
    if (!context) {
      return null
    }

    const now = Date.now()
    context.attemptNumber++
    context.lastError = error
    context.totalElapsedTime = now - context.startTime

    return context
  }

  /**
   * Removes retry context (called when operation succeeds or permanently fails)
   */
  clearContext(operationId: string): void {
    this.activeRetries.delete(operationId)
  }

  /**
   * Gets current retry context for an operation
   */
  getContext(operationId: string): RetryContext | null {
    return this.activeRetries.get(operationId) || null
  }

  /**
   * Executes an operation with retry logic
   */
  async execute<T>(operation: () => Promise<T>, operationId?: string): Promise<T> {
    const id = operationId || `retry-${Date.now()}-${Math.random()}`
    const context = this.createContext(id)

    try {
      return await this.executeWithContext(operation, context)
    } finally {
      this.clearContext(id)
    }
  }

  private async executeWithContext<T>(
    operation: () => Promise<T>,
    context: RetryContext
  ): Promise<T> {
    while (true) {
      try {
        const result = await operation()
        return result
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))

        // Update context with error
        this.updateContext(context.operationId, err)

        // Check if we should retry
        if (!this.shouldRetry(err, context.attemptNumber, context.totalElapsedTime)) {
          throw new RetryExhaustedError(
            `Retry attempts exhausted for operation ${context.operationId}`,
            context,
            err
          )
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(context.attemptNumber - 1)
        await this.sleep(delay)
      }
    }
  }

  /**
   * Creates a retry-aware promise that can be cancelled
   */
  createRetryablePromise<T>(operation: () => Promise<T>, operationId: string): RetryablePromise<T> {
    return new RetryablePromise(this, operation, operationId)
  }

  /**
   * Gets statistics about current retry operations
   */
  getRetryStatistics(): RetryStatistics {
    const contexts = Array.from(this.activeRetries.values())

    return {
      activeRetries: contexts.length,
      totalAttempts: contexts.reduce((sum, ctx) => sum + ctx.attemptNumber, 0),
      averageElapsedTime:
        contexts.length > 0
          ? contexts.reduce((sum, ctx) => sum + ctx.totalElapsedTime, 0) / contexts.length
          : 0,
      operationIds: contexts.map(ctx => ctx.operationId)
    }
  }

  private getErrorType(error: Error): string {
    // Extract error type from error message or name
    if (error.name) {
      return error.name.toUpperCase()
    }

    if (error.message.includes('network')) {
      return 'NETWORK_ERROR'
    }

    if (error.message.includes('timeout')) {
      return 'TIMEOUT'
    }

    if (error.message.includes('websocket')) {
      return 'WEBSOCKET_CLOSED'
    }

    return 'UNKNOWN_ERROR'
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Custom error thrown when retry attempts are exhausted
 */
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly context: RetryContext,
    public readonly lastError: Error
  ) {
    super(message)
    this.name = 'RetryExhaustedError'
  }
}

/**
 * Promise wrapper that provides retry capabilities with cancellation
 */
export class RetryablePromise<T> {
  private cancelled = false
  private readonly promise: Promise<T>

  constructor(
    private readonly retryPolicy: RetryPolicy,
    private readonly operation: () => Promise<T>,
    private readonly operationId: string
  ) {
    this.promise = this.executeWithRetry()
  }

  async execute(): Promise<T> {
    return this.promise
  }

  cancel(): void {
    this.cancelled = true
    this.retryPolicy.clearContext(this.operationId)
  }

  private async executeWithRetry(): Promise<T> {
    const context = this.retryPolicy.createContext(this.operationId)

    while (!this.cancelled) {
      try {
        const result = await this.operation()
        return result
      } catch (error) {
        if (this.cancelled) {
          throw new Error(`Operation ${this.operationId} was cancelled`)
        }

        const err = error instanceof Error ? error : new Error(String(error))

        // Update context with error
        this.retryPolicy.updateContext(this.operationId, err)

        // Check if we should retry
        if (!this.retryPolicy.shouldRetry(err, context.attemptNumber, context.totalElapsedTime)) {
          throw new RetryExhaustedError(
            `Retry attempts exhausted for operation ${this.operationId}`,
            context,
            err
          )
        }

        // Calculate delay and wait
        const delay = this.retryPolicy.calculateDelay(context.attemptNumber - 1)
        await this.sleep(delay)

        if (this.cancelled) {
          throw new Error(`Operation ${this.operationId} was cancelled during retry delay`)
        }
      }
    }

    throw new Error(`Operation ${this.operationId} was cancelled`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Statistics about retry operations
 */
export interface RetryStatistics {
  activeRetries: number
  totalAttempts: number
  averageElapsedTime: number
  operationIds: string[]
}

/**
 * Predefined retry policies for common scenarios
 */
export class RetryPolicies {
  static readonly NETWORK_OPERATIONS = new RetryPolicy({
    baseDelayMs: 250,
    maxDelayMs: 5000,
    maxAttempts: 5,
    jitterFactor: 0.1,
    timeoutMs: 30000
  })

  static readonly WEBSOCKET_RECONNECTION = new RetryPolicy({
    baseDelayMs: 500,
    maxDelayMs: 10000,
    maxAttempts: 10,
    jitterFactor: 0.2,
    timeoutMs: 60000
  })

  static readonly TRANSCRIPTION_RECOVERY = new RetryPolicy({
    baseDelayMs: 100,
    maxDelayMs: 2000,
    maxAttempts: 3,
    jitterFactor: 0.1,
    timeoutMs: 10000
  })

  static readonly BATCH_API_CALLS = new RetryPolicy({
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    maxAttempts: 7,
    jitterFactor: 0.15,
    timeoutMs: 120000
  })
}
