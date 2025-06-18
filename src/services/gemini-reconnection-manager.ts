/**
 * Advanced Reconnection Logic for Gemini Live API WebSocket
 * Handles network interruptions with intelligent backoff and state recovery
 */

import { EventEmitter } from 'events'
import { logger } from './gemini-logger'
import { GeminiErrorHandler, ErrorType } from './gemini-error-handler'

export enum ReconnectionStrategy {
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
  FIBONACCI = 'fibonacci',
  CUSTOM = 'custom'
}

export enum ConnectionQuality {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  POOR = 'poor',
  UNSTABLE = 'unstable'
}

export interface ReconnectionConfig {
  maxAttempts: number
  strategy: ReconnectionStrategy
  baseDelay: number
  maxDelay: number
  jitterEnabled: boolean
  jitterRange: number
  qualityThreshold: number
  unstableConnectionThreshold: number
  backoffMultiplier: number
  customDelayFunction?: (attempt: number) => number
}

export interface ConnectionMetrics {
  connectionTime: number
  disconnectionTime: number
  totalUptime: number
  totalDowntime: number
  successfulConnections: number
  failedConnections: number
  averageConnectionDuration: number
  connectionQuality: ConnectionQuality
  lastDisconnectReason?: string
  unstableConnectionCount: number
}

export interface ReconnectionState {
  isReconnecting: boolean
  attemptCount: number
  nextAttemptIn: number
  nextAttemptAt: number
  totalReconnectionTime: number
  currentDelay: number
  lastAttemptResult: 'success' | 'failure' | 'pending'
}

/**
 * Advanced Reconnection Manager
 */
export class ReconnectionManager extends EventEmitter {
  private config: ReconnectionConfig
  private metrics: ConnectionMetrics
  private state: ReconnectionState
  private reconnectionTimer: NodeJS.Timeout | null = null
  private errorHandler: GeminiErrorHandler
  private connectionHistory: Array<{ timestamp: number; success: boolean; duration?: number }> = []
  private readonly maxHistorySize = 100

  constructor(config: Partial<ReconnectionConfig>, errorHandler: GeminiErrorHandler) {
    super()
    
    this.config = {
      maxAttempts: 10,
      strategy: ReconnectionStrategy.EXPONENTIAL,
      baseDelay: 1000,
      maxDelay: 30000,
      jitterEnabled: true,
      jitterRange: 0.1,
      qualityThreshold: 0.8,
      unstableConnectionThreshold: 3,
      backoffMultiplier: 2,
      ...config
    }

    this.errorHandler = errorHandler

    this.metrics = {
      connectionTime: 0,
      disconnectionTime: 0,
      totalUptime: 0,
      totalDowntime: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionDuration: 0,
      connectionQuality: ConnectionQuality.GOOD,
      unstableConnectionCount: 0
    }

    this.state = {
      isReconnecting: false,
      attemptCount: 0,
      nextAttemptIn: 0,
      nextAttemptAt: 0,
      totalReconnectionTime: 0,
      currentDelay: this.config.baseDelay,
      lastAttemptResult: 'pending'
    }

    logger.info('ReconnectionManager initialized', {
      strategy: this.config.strategy,
      maxAttempts: this.config.maxAttempts,
      baseDelay: this.config.baseDelay
    })
  }

  /**
   * Record successful connection
   */
  onConnectionEstablished(): void {
    const now = Date.now()
    
    if (this.state.isReconnecting) {
      this.state.totalReconnectionTime += now - this.state.nextAttemptAt + this.state.currentDelay
      logger.info('Reconnection successful', {
        attempts: this.state.attemptCount,
        totalTime: this.state.totalReconnectionTime
      })
    }

    // Reset reconnection state
    this.resetReconnectionState()

    // Update metrics
    this.metrics.connectionTime = now
    this.metrics.successfulConnections++
    
    // Record in history
    this.addToHistory(now, true)
    
    // Calculate connection quality
    this.updateConnectionQuality()

    this.emit('connectionEstablished', {
      metrics: this.getMetrics(),
      wasReconnection: this.state.attemptCount > 0
    })
  }

  /**
   * Record connection loss and determine if reconnection should be attempted
   */
  onConnectionLost(reason?: string): boolean {
    const now = Date.now()
    
    // Calculate uptime if we had a connection
    if (this.metrics.connectionTime > 0) {
      const duration = now - this.metrics.connectionTime
      this.metrics.totalUptime += duration
      this.metrics.averageConnectionDuration = 
        this.metrics.totalUptime / Math.max(this.metrics.successfulConnections, 1)
    }

    this.metrics.disconnectionTime = now
    this.metrics.lastDisconnectReason = reason

    // Record in history
    this.addToHistory(now, false)

    // Check if connection was unstable
    if (this.isConnectionUnstable()) {
      this.metrics.unstableConnectionCount++
      logger.warn('Unstable connection detected', {
        unstableCount: this.metrics.unstableConnectionCount,
        reason
      })
    }

    // Update connection quality
    this.updateConnectionQuality()

    const shouldReconnect = this.shouldAttemptReconnection(reason)
    
    this.emit('connectionLost', {
      reason,
      shouldReconnect,
      metrics: this.getMetrics()
    })

    return shouldReconnect
  }

  /**
   * Start reconnection process
   */
  startReconnection(reconnectFunction: () => Promise<void>): void {
    if (this.state.isReconnecting) {
      logger.debug('Reconnection already in progress')
      return
    }

    if (this.state.attemptCount >= this.config.maxAttempts) {
      logger.error('Maximum reconnection attempts reached', {
        attempts: this.state.attemptCount,
        maxAttempts: this.config.maxAttempts
      })
      
      this.errorHandler.handleError(
        new Error('Maximum reconnection attempts reached'),
        { attempts: this.state.attemptCount },
        { type: ErrorType.NETWORK, retryable: false }
      )
      
      this.emit('maxAttemptsReached', {
        attempts: this.state.attemptCount,
        totalTime: this.state.totalReconnectionTime
      })
      return
    }

    this.state.isReconnecting = true
    this.state.attemptCount++
    this.state.currentDelay = this.calculateDelay()
    this.state.nextAttemptAt = Date.now() + this.state.currentDelay
    this.state.nextAttemptIn = this.state.currentDelay

    logger.info('Starting reconnection attempt', {
      attempt: this.state.attemptCount,
      maxAttempts: this.config.maxAttempts,
      delay: this.state.currentDelay,
      strategy: this.config.strategy
    })

    this.emit('reconnectionStarted', {
      attempt: this.state.attemptCount,
      delay: this.state.currentDelay,
      state: this.getState()
    })

    // Start countdown
    this.startCountdown()

    this.reconnectionTimer = setTimeout(async () => {
      try {
        this.state.lastAttemptResult = 'pending'
        this.emit('reconnectionAttempt', {
          attempt: this.state.attemptCount,
          state: this.getState()
        })

        await reconnectFunction()
        
        // Success is handled by onConnectionEstablished()
        
      } catch (error) {
        this.state.lastAttemptResult = 'failure'
        this.metrics.failedConnections++
        
        const geminiError = this.errorHandler.handleError(error, {
          attempt: this.state.attemptCount,
          strategy: this.config.strategy
        }, {
          type: ErrorType.NETWORK,
          retryable: this.state.attemptCount < this.config.maxAttempts
        })

        logger.warn('Reconnection attempt failed', {
          attempt: this.state.attemptCount,
          error: geminiError.message,
          errorId: geminiError.id
        })

        this.emit('reconnectionFailed', {
          attempt: this.state.attemptCount,
          error: geminiError,
          state: this.getState()
        })

        // Continue with next attempt if not at max
        if (this.state.attemptCount < this.config.maxAttempts) {
          this.startReconnection(reconnectFunction)
        } else {
          this.onConnectionLost('Max attempts reached')
        }
      }
    }, this.state.currentDelay)
  }

  /**
   * Stop reconnection process
   */
  stopReconnection(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer)
      this.reconnectionTimer = null
    }

    if (this.state.isReconnecting) {
      logger.info('Stopping reconnection process', {
        attempt: this.state.attemptCount,
        wasActive: this.state.isReconnecting
      })
    }

    this.resetReconnectionState()
    this.emit('reconnectionStopped')
  }

  /**
   * Calculate delay based on strategy
   */
  private calculateDelay(): number {
    let delay: number

    switch (this.config.strategy) {
      case ReconnectionStrategy.EXPONENTIAL:
        delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, this.state.attemptCount - 1)
        break

      case ReconnectionStrategy.LINEAR:
        delay = this.config.baseDelay * this.state.attemptCount
        break

      case ReconnectionStrategy.FIBONACCI:
        delay = this.config.baseDelay * this.fibonacci(this.state.attemptCount)
        break

      case ReconnectionStrategy.CUSTOM:
        delay = this.config.customDelayFunction?.(this.state.attemptCount) || this.config.baseDelay
        break

      default:
        delay = this.config.baseDelay
    }

    // Apply jitter if enabled
    if (this.config.jitterEnabled) {
      const jitter = delay * this.config.jitterRange * (Math.random() - 0.5) * 2
      delay += jitter
    }

    // Ensure delay is within bounds
    delay = Math.max(0, Math.min(delay, this.config.maxDelay))

    return Math.round(delay)
  }

  /**
   * Calculate Fibonacci number for Fibonacci backoff
   */
  private fibonacci(n: number): number {
    if (n <= 1) return 1
    if (n === 2) return 2
    
    let a = 1, b = 2
    for (let i = 3; i <= n; i++) {
      const temp = a + b
      a = b
      b = temp
    }
    return b
  }

  /**
   * Start countdown timer for next attempt
   */
  private startCountdown(): void {
    const countdownInterval = setInterval(() => {
      this.state.nextAttemptIn = Math.max(0, this.state.nextAttemptAt - Date.now())
      
      this.emit('countdownUpdate', {
        remaining: this.state.nextAttemptIn,
        attempt: this.state.attemptCount
      })

      if (this.state.nextAttemptIn <= 0) {
        clearInterval(countdownInterval)
      }
    }, 100) // Update every 100ms for smooth countdown
  }

  /**
   * Determine if reconnection should be attempted
   */
  private shouldAttemptReconnection(reason?: string): boolean {
    // Don't reconnect if we've reached max attempts
    if (this.state.attemptCount >= this.config.maxAttempts) {
      return false
    }

    // Don't reconnect for certain error types
    const nonRetryableReasons = [
      'unauthorized',
      'forbidden',
      'invalid_api_key',
      'quota_exceeded'
    ]

    if (reason && nonRetryableReasons.some(nr => reason.toLowerCase().includes(nr))) {
      logger.info('Not attempting reconnection due to non-retryable reason', { reason })
      return false
    }

    // Consider connection quality
    if (this.metrics.connectionQuality === ConnectionQuality.UNSTABLE && 
        this.metrics.unstableConnectionCount > this.config.unstableConnectionThreshold) {
      logger.warn('Connection too unstable, postponing reconnection')
      return false
    }

    return true
  }

  /**
   * Check if connection is considered unstable
   */
  private isConnectionUnstable(): boolean {
    if (this.connectionHistory.length < 3) return false

    const recentConnections = this.connectionHistory.slice(-5)
    const recentFailures = recentConnections.filter(c => !c.success).length
    const shortConnections = recentConnections.filter(c => 
      c.success && c.duration && c.duration < 10000 // Less than 10 seconds
    ).length

    return recentFailures >= 3 || shortConnections >= 3
  }

  /**
   * Update connection quality based on recent history
   */
  private updateConnectionQuality(): void {
    if (this.connectionHistory.length < 5) {
      this.metrics.connectionQuality = ConnectionQuality.GOOD
      return
    }

    const recent = this.connectionHistory.slice(-10)
    const successRate = recent.filter(c => c.success).length / recent.length
    const avgDuration = recent
      .filter(c => c.success && c.duration)
      .reduce((sum, c) => sum + (c.duration || 0), 0) / recent.length

    if (successRate >= 0.9 && avgDuration > 60000) {
      this.metrics.connectionQuality = ConnectionQuality.EXCELLENT
    } else if (successRate >= 0.8 && avgDuration > 30000) {
      this.metrics.connectionQuality = ConnectionQuality.GOOD
    } else if (successRate >= 0.6) {
      this.metrics.connectionQuality = ConnectionQuality.POOR
    } else {
      this.metrics.connectionQuality = ConnectionQuality.UNSTABLE
    }
  }

  /**
   * Add entry to connection history
   */
  private addToHistory(timestamp: number, success: boolean, duration?: number): void {
    this.connectionHistory.push({ timestamp, success, duration })
    
    if (this.connectionHistory.length > this.maxHistorySize) {
      this.connectionHistory.shift()
    }
  }

  /**
   * Reset reconnection state
   */
  private resetReconnectionState(): void {
    this.state.isReconnecting = false
    this.state.attemptCount = 0
    this.state.nextAttemptIn = 0
    this.state.nextAttemptAt = 0
    this.state.currentDelay = this.config.baseDelay
    this.state.lastAttemptResult = 'pending'
  }

  /**
   * Get current metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics }
  }

  /**
   * Get current reconnection state
   */
  getState(): ReconnectionState {
    return { ...this.state }
  }

  /**
   * Get connection history
   */
  getConnectionHistory(): Array<{ timestamp: number; success: boolean; duration?: number }> {
    return [...this.connectionHistory]
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ReconnectionConfig>): void {
    this.config = { ...this.config, ...newConfig }
    logger.info('Reconnection configuration updated', newConfig)
    this.emit('configUpdated', this.config)
  }

  /**
   * Reset all metrics and history
   */
  reset(): void {
    this.stopReconnection()
    this.connectionHistory.length = 0
    
    this.metrics = {
      connectionTime: 0,
      disconnectionTime: 0,
      totalUptime: 0,
      totalDowntime: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionDuration: 0,
      connectionQuality: ConnectionQuality.GOOD,
      unstableConnectionCount: 0
    }

    this.resetReconnectionState()
    
    logger.info('ReconnectionManager reset')
    this.emit('reset')
  }

  /**
   * Export metrics and history for analysis
   */
  exportData(): {
    config: ReconnectionConfig
    metrics: ConnectionMetrics
    state: ReconnectionState
    history: Array<{ timestamp: number; success: boolean; duration?: number }>
  } {
    return {
      config: this.config,
      metrics: this.getMetrics(),
      state: this.getState(),
      history: this.getConnectionHistory()
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopReconnection()
    this.removeAllListeners()
    this.connectionHistory.length = 0
    logger.info('ReconnectionManager destroyed')
  }
}

export default ReconnectionManager
