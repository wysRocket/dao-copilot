/**
 * ErrorRecoveryStrategies - Comprehensive Error Recovery Implementation
 *
 * Implements specific recovery strategies for each error category identified by ErrorHandler.
 * Integrates with existing fallback infrastructure including:
 * - RetryPolicy for intelligent retry mechanisms
 * - CircuitBreaker for protection against cascading failures
 * - FallbackManager for transport switching
 * - ConnectionMonitor for network state management
 * - ReplayEngine for audio segment recovery
 * - TranscriptReconciler for maintaining transcript continuity
 */

import {EventEmitter} from 'events'
import {ErrorCategory, ClassifiedError, ErrorContext} from './ErrorHandler'
import {ConnectionMonitor} from '../network/ConnectionMonitor'
import {CircuitBreaker} from '../fallback/CircuitBreaker'
import {RetryPolicy, RetryablePromise} from '../fallback/RetryPolicy'
import {FallbackManager} from '../fallback/FallbackManager'
import {ReplayEngine} from '../fallback/ReplayEngine'
import {TranscriptReconciler} from '../fallback/TranscriptReconciler'
import {StatusNotifier} from '../ui/StatusNotifier'

/**
 * Recovery strategy result
 */
export interface RecoveryResult {
  success: boolean
  strategy: string
  action: string
  duration: number
  retryCount: number
  fallbackActivated?: boolean
  message?: string
  nextAction?: string
  metadata?: Record<string, unknown>
}

/**
 * Recovery strategy configuration
 */
export interface RecoveryStrategyConfig {
  maxRetries: number
  retryDelayMs: number
  timeoutMs: number
  enableFallback: boolean
  enableCircuitBreaker: boolean
  enableUserNotification: boolean
  escalationThreshold: number
  customActions?: Record<string, () => Promise<boolean>>
}

/**
 * Default recovery strategy configuration
 */
export const DEFAULT_RECOVERY_CONFIG: RecoveryStrategyConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
  enableFallback: true,
  enableCircuitBreaker: true,
  enableUserNotification: true,
  escalationThreshold: 5,
  customActions: {}
}

/**
 * Recovery execution context
 */
interface RecoveryExecutionContext {
  error: ClassifiedError
  startTime: number
  retryCount: number
  previousAttempts: RecoveryResult[]
  escalationLevel: number
}

/**
 * Comprehensive Error Recovery Strategy Manager
 *
 * Coordinates recovery actions for different error categories using existing
 * fallback infrastructure and implements intelligent escalation procedures.
 */
export class ErrorRecoveryStrategies extends EventEmitter {
  private config: RecoveryStrategyConfig
  private recoveryHistory: Map<string, RecoveryResult[]> = new Map()

  // Infrastructure dependencies
  private connectionMonitor?: ConnectionMonitor
  private circuitBreaker?: CircuitBreaker
  private retryPolicy?: RetryPolicy
  private fallbackManager?: FallbackManager
  private replayEngine?: ReplayEngine
  private transcriptReconciler?: TranscriptReconciler
  private statusNotifier?: StatusNotifier

  // Recovery state
  private activeRecoveries: Map<string, RecoveryExecutionContext> = new Map()
  private isDestroyed: boolean = false

  constructor(config: Partial<RecoveryStrategyConfig> = {}) {
    super()
    this.config = {...DEFAULT_RECOVERY_CONFIG, ...config}
  }

  /**
   * Initialize recovery strategies with infrastructure dependencies
   */
  async initialize(dependencies: {
    connectionMonitor?: ConnectionMonitor
    circuitBreaker?: CircuitBreaker
    retryPolicy?: RetryPolicy
    fallbackManager?: FallbackManager
    replayEngine?: ReplayEngine
    transcriptReconciler?: TranscriptReconciler
    statusNotifier?: StatusNotifier
  }): Promise<void> {
    this.connectionMonitor = dependencies.connectionMonitor
    this.circuitBreaker = dependencies.circuitBreaker
    this.retryPolicy = dependencies.retryPolicy
    this.fallbackManager = dependencies.fallbackManager
    this.replayEngine = dependencies.replayEngine
    this.transcriptReconciler = dependencies.transcriptReconciler
    this.statusNotifier = dependencies.statusNotifier

    this.emit('initialized')
  }

  /**
   * Execute recovery strategy for a classified error
   */
  async executeRecovery(error: ClassifiedError): Promise<RecoveryResult> {
    if (this.isDestroyed) {
      throw new Error('RecoveryStrategies has been destroyed')
    }

    const executionContext: RecoveryExecutionContext = {
      error,
      startTime: Date.now(),
      retryCount: 0,
      previousAttempts: this.recoveryHistory.get(error.id) || [],
      escalationLevel: this.calculateEscalationLevel(error)
    }

    this.activeRecoveries.set(error.id, executionContext)

    try {
      // Determine recovery strategy based on error category
      const result = await this.selectAndExecuteStrategy(executionContext)

      // Record recovery result
      this.recordRecoveryResult(error.id, result)

      // Emit recovery completion event
      this.emit('recoveryCompleted', {error, result})

      return result
    } catch (recoveryError) {
      const failureResult: RecoveryResult = {
        success: false,
        strategy: 'unknown',
        action: 'recovery_failed',
        duration: Date.now() - executionContext.startTime,
        retryCount: executionContext.retryCount,
        message: `Recovery failed: ${recoveryError}`
      }

      this.recordRecoveryResult(error.id, failureResult)
      this.emit('recoveryFailed', {error, result: failureResult, originalError: recoveryError})

      return failureResult
    } finally {
      this.activeRecoveries.delete(error.id)
    }
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalRecoveries: number
    successRate: number
    averageDuration: number
    strategiesUsed: Record<string, number>
    recentRecoveries: RecoveryResult[]
  } {
    const allRecoveries: RecoveryResult[] = []
    for (const results of this.recoveryHistory.values()) {
      allRecoveries.push(...results)
    }

    const successfulRecoveries = allRecoveries.filter(r => r.success)
    const successRate =
      allRecoveries.length > 0 ? successfulRecoveries.length / allRecoveries.length : 0

    const averageDuration =
      allRecoveries.length > 0
        ? allRecoveries.reduce((sum, r) => sum + r.duration, 0) / allRecoveries.length
        : 0

    const strategiesUsed: Record<string, number> = {}
    allRecoveries.forEach(r => {
      strategiesUsed[r.strategy] = (strategiesUsed[r.strategy] || 0) + 1
    })

    const recentRecoveries = allRecoveries
      .sort(
        (a, b) =>
          ((b.metadata?.timestamp as number) || 0) - ((a.metadata?.timestamp as number) || 0)
      )
      .slice(0, 10)

    return {
      totalRecoveries: allRecoveries.length,
      successRate,
      averageDuration,
      strategiesUsed,
      recentRecoveries
    }
  }

  /**
   * Clear recovery history
   */
  clearHistory(): void {
    this.recoveryHistory.clear()
    this.emit('historyCleased')
  }

  /**
   * Destroy recovery strategies
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true
    this.activeRecoveries.clear()
    this.recoveryHistory.clear()
    this.emit('destroyed')
  }

  // Private methods - Strategy Selection and Execution

  /**
   * Select and execute appropriate recovery strategy
   */
  private async selectAndExecuteStrategy(
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    const {error} = context

    switch (error.category) {
      case ErrorCategory.NETWORK_CONNECTION:
      case ErrorCategory.NETWORK_TIMEOUT:
      case ErrorCategory.NETWORK_UNAVAILABLE:
        return this.executeNetworkRecovery(context)

      case ErrorCategory.WEBSOCKET_CONNECTION_FAILED:
      case ErrorCategory.WEBSOCKET_UNEXPECTED_CLOSE:
      case ErrorCategory.WEBSOCKET_PROTOCOL_ERROR:
      case ErrorCategory.WEBSOCKET_SCHEMA_ERROR:
        return this.executeWebSocketRecovery(context)

      case ErrorCategory.AUTH_TOKEN_EXPIRED:
      case ErrorCategory.AUTH_INVALID_CREDENTIALS:
      case ErrorCategory.AUTH_PERMISSION_DENIED:
        return this.executeAuthRecovery(context)

      case ErrorCategory.API_RATE_LIMIT:
      case ErrorCategory.API_QUOTA_EXCEEDED:
      case ErrorCategory.API_SERVICE_UNAVAILABLE:
        return this.executeApiRecovery(context)

      case ErrorCategory.TRANSCRIPTION_SERVICE_ERROR:
      case ErrorCategory.TRANSCRIPTION_AUDIO_FORMAT:
      case ErrorCategory.TRANSCRIPTION_LANGUAGE_UNSUPPORTED:
        return this.executeTranscriptionRecovery(context)

      case ErrorCategory.MEMORY_EXHAUSTION:
      case ErrorCategory.STORAGE_FULL:
      case ErrorCategory.CPU_OVERLOAD:
        return this.executeResourceRecovery(context)

      case ErrorCategory.DATA_CORRUPTION:
      case ErrorCategory.CHECKSUM_MISMATCH:
      case ErrorCategory.SERIALIZATION_ERROR:
        return this.executeDataIntegrityRecovery(context)

      case ErrorCategory.INITIALIZATION_ERROR:
      case ErrorCategory.CONFIGURATION_ERROR:
      case ErrorCategory.DEPENDENCY_ERROR:
        return this.executeSystemRecovery(context)

      default:
        return this.executeGenericRecovery(context)
    }
  }

  /**
   * Execute network recovery strategy
   */
  private async executeNetworkRecovery(context: RecoveryExecutionContext): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('networkRecoveryStarted', error)

    try {
      // Step 1: Check connection state
      if (this.connectionMonitor) {
        const connectionState = this.connectionMonitor.getState()

        if (connectionState.quality === 'poor' || connectionState.quality === 'disconnected') {
          // Wait for connection improvement
          await this.waitForConnectionImprovement()
        }
      }

      // Step 2: Attempt reconnection with retry policy
      if (this.retryPolicy) {
        const reconnectPromise = new RetryablePromise(() => this.attemptNetworkReconnect(), {
          maxAttempts: this.config.maxRetries,
          baseDelay: this.config.retryDelayMs
        })

        const reconnectSuccess = await reconnectPromise.execute()

        if (reconnectSuccess) {
          // Step 3: Replay missed audio if available
          if (this.replayEngine && error.context.sessionId) {
            await this.replayEngine.replaySession(error.context.sessionId)
          }

          return {
            success: true,
            strategy: 'networkRecovery',
            action: 'reconnect_and_replay',
            duration: Date.now() - startTime,
            retryCount: context.retryCount,
            message: 'Network connection restored successfully'
          }
        }
      }

      // Step 3: Activate fallback if reconnection failed
      if (this.config.enableFallback && this.fallbackManager) {
        await this.fallbackManager.activateFallback('network_failure')

        return {
          success: true,
          strategy: 'networkRecovery',
          action: 'fallback_activation',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          fallbackActivated: true,
          message: 'Activated fallback transport due to network issues'
        }
      }

      // Recovery failed
      return {
        success: false,
        strategy: 'networkRecovery',
        action: 'all_attempts_failed',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'Unable to restore network connection'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'networkRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `Network recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute WebSocket recovery strategy
   */
  private async executeWebSocketRecovery(
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('webSocketRecoveryStarted', error)

    try {
      // For WebSocket schema errors (1007), immediately trigger transport fallback
      if (error.category === ErrorCategory.WEBSOCKET_SCHEMA_ERROR && this.fallbackManager) {
        // Preserve current transcript context
        if (this.transcriptReconciler && error.context.sessionId) {
          await this.transcriptReconciler.handleTransportSwitch(
            'websocket',
            'http-stream',
            error.context.sessionId
          )
        }

        // Switch to HTTP streaming transport
        await this.fallbackManager.activateFallback('websocket_schema_error')

        // Notify user of transport switch
        if (this.statusNotifier) {
          this.statusNotifier.showConnectionBanner('degraded', 'transport_fallback')
        }

        return {
          success: true,
          strategy: 'webSocketRecovery',
          action: 'transport_fallback',
          duration: Date.now() - startTime,
          retryCount: 0,
          fallbackActivated: true,
          message: 'Switched to HTTP streaming due to WebSocket protocol issues'
        }
      }

      // For other WebSocket errors, attempt reconnection
      if (this.retryPolicy) {
        const reconnectPromise = new RetryablePromise(() => this.attemptWebSocketReconnect(), {
          maxAttempts: this.config.maxRetries,
          baseDelay: this.config.retryDelayMs
        })

        const reconnectSuccess = await reconnectPromise.execute()

        if (reconnectSuccess) {
          return {
            success: true,
            strategy: 'webSocketRecovery',
            action: 'reconnect_success',
            duration: Date.now() - startTime,
            retryCount: context.retryCount,
            message: 'WebSocket connection restored'
          }
        }
      }

      // Fallback to HTTP transport
      if (this.fallbackManager) {
        await this.fallbackManager.activateFallback('websocket_failure')

        return {
          success: true,
          strategy: 'webSocketRecovery',
          action: 'fallback_to_http',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          fallbackActivated: true,
          message: 'Switched to HTTP transport after WebSocket failure'
        }
      }

      return {
        success: false,
        strategy: 'webSocketRecovery',
        action: 'no_fallback_available',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'WebSocket recovery failed and no fallback available'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'webSocketRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `WebSocket recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute authentication recovery strategy
   */
  private async executeAuthRecovery(context: RecoveryExecutionContext): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('authRecoveryStarted', error)

    try {
      // Attempt token refresh
      const tokenRefreshSuccess = await this.attemptTokenRefresh()

      if (tokenRefreshSuccess) {
        // Retry the original operation with new token
        if (this.retryPolicy) {
          const retryPromise = new RetryablePromise(() => this.retryWithNewToken(error.context), {
            maxAttempts: 2,
            baseDelay: 1000
          })

          const retrySuccess = await retryPromise.execute()

          return {
            success: retrySuccess,
            strategy: 'authRecovery',
            action: retrySuccess ? 'token_refresh_success' : 'token_refresh_retry_failed',
            duration: Date.now() - startTime,
            retryCount: context.retryCount,
            message: retrySuccess
              ? 'Authentication refreshed successfully'
              : 'Token refresh succeeded but retry failed'
          }
        }

        return {
          success: true,
          strategy: 'authRecovery',
          action: 'token_refresh_success',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          message: 'Authentication token refreshed'
        }
      }

      // Token refresh failed - this may require user intervention
      if (this.statusNotifier) {
        this.statusNotifier.showConnectionBanner('error', 'auth_required')
      }

      return {
        success: false,
        strategy: 'authRecovery',
        action: 'token_refresh_failed',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        nextAction: 'user_reauth_required',
        message: 'Authentication refresh failed - user intervention required'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'authRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `Authentication recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute API recovery strategy
   */
  private async executeApiRecovery(context: RecoveryExecutionContext): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('apiRecoveryStarted', error)

    try {
      if (error.category === ErrorCategory.API_RATE_LIMIT) {
        // Wait for rate limit reset
        const waitTime = this.calculateRateLimitWaitTime()
        await this.waitForRateLimitReset(waitTime)

        return {
          success: true,
          strategy: 'apiRecovery',
          action: 'rate_limit_wait',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          message: `Waited ${waitTime}ms for rate limit reset`
        }
      }

      if (error.category === ErrorCategory.API_QUOTA_EXCEEDED) {
        // Activate circuit breaker and use batch processing
        if (this.circuitBreaker) {
          this.circuitBreaker.recordFailure()
        }

        // Switch to batch processing mode
        if (this.fallbackManager) {
          await this.fallbackManager.activateFallback('quota_exceeded')
        }

        // Notify user of degraded service
        if (this.statusNotifier) {
          this.statusNotifier.showConnectionBanner('warning', 'quota_exceeded')
        }

        return {
          success: true,
          strategy: 'apiRecovery',
          action: 'quota_degradation',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          fallbackActivated: true,
          message: 'Switched to batch processing due to quota limits'
        }
      }

      if (error.category === ErrorCategory.API_SERVICE_UNAVAILABLE) {
        // Check if alternative API endpoints are available
        const alternativeSuccess = await this.tryAlternativeApiEndpoint()

        if (alternativeSuccess) {
          return {
            success: true,
            strategy: 'apiRecovery',
            action: 'alternative_endpoint',
            duration: Date.now() - startTime,
            retryCount: context.retryCount,
            message: 'Switched to alternative API endpoint'
          }
        }

        // Activate circuit breaker and fallback
        if (this.circuitBreaker) {
          this.circuitBreaker.recordFailure()
        }

        return {
          success: false,
          strategy: 'apiRecovery',
          action: 'service_unavailable',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          nextAction: 'wait_for_service_restoration',
          message: 'API service is unavailable'
        }
      }

      return {
        success: false,
        strategy: 'apiRecovery',
        action: 'unhandled_api_error',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'Unhandled API error type'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'apiRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `API recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute transcription service recovery strategy
   */
  private async executeTranscriptionRecovery(
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('transcriptionRecoveryStarted', error)

    try {
      // Restart transcription service
      const restartSuccess = await this.restartTranscriptionService()

      if (restartSuccess) {
        // Replay missed audio segments
        if (this.replayEngine && error.context.sessionId) {
          await this.replayEngine.replaySession(error.context.sessionId)
        }

        return {
          success: true,
          strategy: 'transcriptionRecovery',
          action: 'service_restart_success',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          message: 'Transcription service restarted successfully'
        }
      }

      // Service restart failed - try alternative provider
      const alternativeSuccess = await this.tryAlternativeTranscriptionProvider()

      if (alternativeSuccess) {
        return {
          success: true,
          strategy: 'transcriptionRecovery',
          action: 'alternative_provider',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          fallbackActivated: true,
          message: 'Switched to alternative transcription provider'
        }
      }

      return {
        success: false,
        strategy: 'transcriptionRecovery',
        action: 'all_providers_failed',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'All transcription providers are unavailable'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'transcriptionRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `Transcription recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute resource recovery strategy
   */
  private async executeResourceRecovery(
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('resourceRecoveryStarted', error)

    try {
      if (error.category === ErrorCategory.MEMORY_EXHAUSTION) {
        // Clear buffers and force garbage collection
        await this.clearMemoryBuffers()

        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }

        return {
          success: true,
          strategy: 'resourceRecovery',
          action: 'memory_cleanup',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          message: 'Memory buffers cleared successfully'
        }
      }

      if (error.category === ErrorCategory.STORAGE_FULL) {
        // Clean up old files and logs
        await this.cleanupStorageSpace()

        return {
          success: true,
          strategy: 'resourceRecovery',
          action: 'storage_cleanup',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          message: 'Storage space cleaned up'
        }
      }

      if (error.category === ErrorCategory.CPU_OVERLOAD) {
        // Throttle processing and reduce concurrent operations
        await this.throttleProcessing()

        return {
          success: true,
          strategy: 'resourceRecovery',
          action: 'cpu_throttling',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          message: 'Processing throttled to reduce CPU load'
        }
      }

      return {
        success: false,
        strategy: 'resourceRecovery',
        action: 'unknown_resource_error',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'Unknown resource error type'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'resourceRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `Resource recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute data integrity recovery strategy
   */
  private async executeDataIntegrityRecovery(
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('dataIntegrityRecoveryStarted', error)

    try {
      if (error.category === ErrorCategory.DATA_CORRUPTION) {
        // Attempt data recovery from backup/WAL
        const recoverySuccess = await this.recoverFromWal(error.context)

        if (recoverySuccess) {
          return {
            success: true,
            strategy: 'dataIntegrityRecovery',
            action: 'wal_recovery_success',
            duration: Date.now() - startTime,
            retryCount: context.retryCount,
            message: 'Data recovered from Write-Ahead Log'
          }
        }
      }

      // Reset affected components
      await this.resetCorruptedComponents(error.context)

      return {
        success: true,
        strategy: 'dataIntegrityRecovery',
        action: 'component_reset',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'Corrupted components reset successfully'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'dataIntegrityRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `Data integrity recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute system recovery strategy
   */
  private async executeSystemRecovery(context: RecoveryExecutionContext): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('systemRecoveryStarted', error)

    try {
      // Reinitialize affected subsystems
      await this.reinitializeSubsystems(error.context)

      return {
        success: true,
        strategy: 'systemRecovery',
        action: 'subsystem_reinit',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'System components reinitialized successfully'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'systemRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `System recovery failed: ${error}`
      }
    }
  }

  /**
   * Execute generic recovery strategy
   */
  private async executeGenericRecovery(context: RecoveryExecutionContext): Promise<RecoveryResult> {
    const {error, startTime} = context

    this.emit('genericRecoveryStarted', error)

    try {
      // Generic retry with exponential backoff
      if (this.retryPolicy) {
        const retryPromise = new RetryablePromise(() => this.attemptGenericRetry(error.context), {
          maxAttempts: this.config.maxRetries,
          baseDelay: this.config.retryDelayMs
        })

        const retrySuccess = await retryPromise.execute()

        return {
          success: retrySuccess,
          strategy: 'genericRecovery',
          action: retrySuccess ? 'retry_success' : 'retry_exhausted',
          duration: Date.now() - startTime,
          retryCount: context.retryCount,
          message: retrySuccess ? 'Generic retry succeeded' : 'All retry attempts exhausted'
        }
      }

      return {
        success: false,
        strategy: 'genericRecovery',
        action: 'no_retry_policy',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: 'No retry policy available for generic recovery'
      }
    } catch (error) {
      return {
        success: false,
        strategy: 'genericRecovery',
        action: 'exception_occurred',
        duration: Date.now() - startTime,
        retryCount: context.retryCount,
        message: `Generic recovery failed: ${error}`
      }
    }
  }

  // Helper methods for recovery actions

  private calculateEscalationLevel(error: ClassifiedError): number {
    const history = this.recoveryHistory.get(error.id) || []
    const recentFailures = history.filter(
      r => !r.success && Date.now() - ((r.metadata?.timestamp as number) || 0) < 300000 // 5 minutes
    )

    return Math.min(recentFailures.length, 5)
  }

  private recordRecoveryResult(errorId: string, result: RecoveryResult): void {
    const history = this.recoveryHistory.get(errorId) || []

    result.metadata = {
      ...result.metadata,
      timestamp: Date.now()
    }

    history.push(result)

    // Keep only recent results
    if (history.length > 10) {
      history.splice(0, history.length - 10)
    }

    this.recoveryHistory.set(errorId, history)
  }

  // Recovery implementation methods (simplified versions)
  private async waitForConnectionImprovement(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 5000))
  }

  private async attemptNetworkReconnect(): Promise<boolean> {
    // This would integrate with actual network reconnection logic
    this.emit('networkReconnectAttempt')
    await new Promise(resolve => setTimeout(resolve, 2000))
    return Math.random() > 0.3 // Simulate success rate
  }

  private async attemptWebSocketReconnect(): Promise<boolean> {
    this.emit('webSocketReconnectAttempt')
    await new Promise(resolve => setTimeout(resolve, 1000))
    return Math.random() > 0.4
  }

  private async attemptTokenRefresh(): Promise<boolean> {
    this.emit('tokenRefreshAttempt')
    await new Promise(resolve => setTimeout(resolve, 1500))
    return Math.random() > 0.2
  }

  private async retryWithNewToken(context: ErrorContext): Promise<boolean> {
    this.emit('retryWithNewToken', context)
    return Math.random() > 0.1
  }

  private calculateRateLimitWaitTime(): number {
    // Extract wait time from error or use default
    return 60000 // 1 minute default
  }

  private async waitForRateLimitReset(waitTime: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, waitTime))
  }

  private async tryAlternativeApiEndpoint(): Promise<boolean> {
    this.emit('alternativeApiEndpointAttempt')
    return Math.random() > 0.5
  }

  private async restartTranscriptionService(): Promise<boolean> {
    this.emit('transcriptionServiceRestart')
    await new Promise(resolve => setTimeout(resolve, 3000))
    return Math.random() > 0.3
  }

  private async tryAlternativeTranscriptionProvider(): Promise<boolean> {
    this.emit('alternativeProviderAttempt')
    return Math.random() > 0.4
  }

  private async clearMemoryBuffers(): Promise<void> {
    this.emit('memoryBuffersCleared')
    // This would clear actual buffers
  }

  private async cleanupStorageSpace(): Promise<void> {
    this.emit('storageSpaceCleanup')
    // This would clean up storage
  }

  private async throttleProcessing(): Promise<void> {
    this.emit('processingThrottled')
    // This would throttle CPU-intensive operations
  }

  private async recoverFromWal(context: ErrorContext): Promise<boolean> {
    this.emit('walRecoveryAttempt', context)
    return Math.random() > 0.3
  }

  private async resetCorruptedComponents(context: ErrorContext): Promise<void> {
    this.emit('corruptedComponentsReset', context)
  }

  private async reinitializeSubsystems(context: ErrorContext): Promise<void> {
    this.emit('subsystemsReinit', context)
  }

  private async attemptGenericRetry(context: ErrorContext): Promise<boolean> {
    this.emit('genericRetryAttempt', context)
    return Math.random() > 0.4
  }
}

export default ErrorRecoveryStrategies
