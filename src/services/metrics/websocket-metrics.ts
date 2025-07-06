/**
 * WebSocket Metrics Collector
 * 
 * Integrates Prometheus metrics with WebSocket operations
 */

import {
  wsActiveConnections,
  wsConnectionAttempts,
  wsConnectionDuration,
  wsConnectionLatency,
  wsReconnectionAttempts,
  wsMessagesSent,
  wsMessagesReceived,
  wsMessageQueueSize,
  wsMessageProcessingTime,
  wsMessageSize,
  wsMessageFailures,
  errorsByCategory,
  circuitBreakerState,
  healthCheckResults,
  commonLabels,
  safeIncrement,
  safeSetGauge,
  safeObserve
} from './prometheus-metrics'
import { logger } from '../logging'

/**
 * WebSocket connection types
 */
export enum ConnectionType {
  GEMINI_LIVE = 'gemini_live',
  STANDARD = 'standard',
  ENHANCED = 'enhanced'
}

/**
 * Message types for metrics
 */
export enum MessageType {
  TEXT = 'text',
  AUDIO = 'audio',
  BINARY = 'binary',
  CONTROL = 'control',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error'
}

/**
 * WebSocket Metrics Collector Class
 */
export class WebSocketMetricsCollector {
  private connectionStartTimes: Map<string, number> = new Map()
  private activeConnections: Set<string> = new Set()
  private messageQueues: Map<string, number> = new Map()

  constructor() {
    logger.info('WebSocket metrics collector initialized')
  }

  /**
   * Record connection attempt
   */
  recordConnectionAttempt(
    connectionId: string,
    connectionType: ConnectionType = ConnectionType.ENHANCED
  ): void {
    this.connectionStartTimes.set(connectionId, Date.now())
    
    safeIncrement(wsConnectionAttempts, {
      result: 'attempted',
      environment: commonLabels.environment
    })

    logger.debug('Connection attempt recorded', {
      metadata: { connectionId, connectionType }
    })
  }

  /**
   * Record successful connection
   */
  recordConnectionSuccess(
    connectionId: string,
    connectionType: ConnectionType = ConnectionType.ENHANCED,
    latencyMs?: number
  ): void {
    this.activeConnections.add(connectionId)
    
    // Update active connections gauge
    safeSetGauge(wsActiveConnections, {
      connection_type: connectionType,
      environment: commonLabels.environment
    }, this.activeConnections.size)

    // Record successful attempt
    safeIncrement(wsConnectionAttempts, {
      result: 'success',
      environment: commonLabels.environment
    })

    // Record connection latency if provided
    if (latencyMs !== undefined) {
      safeObserve(wsConnectionLatency, {
        connection_type: connectionType,
        environment: commonLabels.environment
      }, latencyMs / 1000) // Convert to seconds
    }

    logger.debug('Connection success recorded', {
      metadata: { 
        connectionId, 
        connectionType, 
        latencyMs,
        activeConnections: this.activeConnections.size
      }
    })
  }

  /**
   * Record connection failure
   */
  recordConnectionFailure(
    connectionId: string,
    error: Error,
    connectionType: ConnectionType = ConnectionType.ENHANCED
  ): void {
    // Remove from tracking
    this.connectionStartTimes.delete(connectionId)
    
    // Record failed attempt
    safeIncrement(wsConnectionAttempts, {
      result: 'failure',
      environment: commonLabels.environment
    })

    // Record error
    safeIncrement(errorsByCategory, {
      category: 'connection',
      severity: 'error',
      component: 'websocket',
      environment: commonLabels.environment
    })

    logger.debug('Connection failure recorded', {
      metadata: { 
        connectionId, 
        connectionType,
        error: error.message
      }
    })
  }

  /**
   * Record connection close
   */
  recordConnectionClose(
    connectionId: string,
    code: number,
    reason: string,
    connectionType: ConnectionType = ConnectionType.ENHANCED
  ): void {
    const startTime = this.connectionStartTimes.get(connectionId)
    this.activeConnections.delete(connectionId)
    this.connectionStartTimes.delete(connectionId)

    // Update active connections
    safeSetGauge(wsActiveConnections, {
      connection_type: connectionType,
      environment: commonLabels.environment
    }, this.activeConnections.size)

    // Record connection duration if we have start time
    if (startTime) {
      const durationSeconds = (Date.now() - startTime) / 1000
      safeObserve(wsConnectionDuration, {
        connection_type: connectionType,
        environment: commonLabels.environment
      }, durationSeconds)
    }

    // Record error if abnormal close
    if (code !== 1000 && code !== 1001) {
      safeIncrement(errorsByCategory, {
        category: 'connection',
        severity: 'warn',
        component: 'websocket',
        environment: commonLabels.environment
      })
    }

    logger.debug('Connection close recorded', {
      metadata: { 
        connectionId, 
        connectionType,
        code,
        reason,
        duration: startTime ? (Date.now() - startTime) / 1000 : undefined
      }
    })
  }

  /**
   * Record reconnection attempt
   */
  recordReconnectionAttempt(
    connectionId: string,
    attempt: number,
    success: boolean
  ): void {
    safeIncrement(wsReconnectionAttempts, {
      result: success ? 'success' : 'failure',
      environment: commonLabels.environment
    })

    logger.debug('Reconnection attempt recorded', {
      metadata: { connectionId, attempt, success }
    })
  }

  /**
   * Record message sent
   */
  recordMessageSent(
    connectionId: string,
    messageType: MessageType,
    sizeBytes: number,
    priority: string = 'normal'
  ): void {
    safeIncrement(wsMessagesSent, {
      message_type: messageType,
      priority,
      environment: commonLabels.environment
    })

    safeObserve(wsMessageSize, {
      message_type: messageType,
      direction: 'outbound',
      environment: commonLabels.environment
    }, sizeBytes)

    logger.debug('Message sent recorded', {
      metadata: { connectionId, messageType, sizeBytes, priority }
    })
  }

  /**
   * Record message received
   */
  recordMessageReceived(
    connectionId: string,
    messageType: MessageType,
    sizeBytes: number
  ): void {
    safeIncrement(wsMessagesReceived, {
      message_type: messageType,
      environment: commonLabels.environment
    })

    safeObserve(wsMessageSize, {
      message_type: messageType,
      direction: 'inbound',
      environment: commonLabels.environment
    }, sizeBytes)

    logger.debug('Message received recorded', {
      metadata: { connectionId, messageType, sizeBytes }
    })
  }

  /**
   * Record message processing time
   */
  recordMessageProcessingTime(
    messageType: MessageType,
    operation: string,
    durationMs: number
  ): void {
    safeObserve(wsMessageProcessingTime, {
      message_type: messageType,
      operation,
      environment: commonLabels.environment
    }, durationMs / 1000) // Convert to seconds

    logger.debug('Message processing time recorded', {
      metadata: { messageType, operation, durationMs }
    })
  }

  /**
   * Record message failure
   */
  recordMessageFailure(
    connectionId: string,
    messageType: MessageType,
    errorType: string,
    retryCount: number = 0
  ): void {
    safeIncrement(wsMessageFailures, {
      message_type: messageType,
      error_type: errorType,
      retry_count: retryCount.toString(),
      environment: commonLabels.environment
    })

    safeIncrement(errorsByCategory, {
      category: 'message',
      severity: retryCount > 2 ? 'error' : 'warn',
      component: 'websocket',
      environment: commonLabels.environment
    })

    logger.debug('Message failure recorded', {
      metadata: { connectionId, messageType, errorType, retryCount }
    })
  }

  /**
   * Update message queue size
   */
  updateMessageQueueSize(
    connectionId: string,
    priority: string,
    size: number
  ): void {
    const queueKey = `${connectionId}:${priority}`
    this.messageQueues.set(queueKey, size)

    safeSetGauge(wsMessageQueueSize, {
      priority,
      connection_id: connectionId,
      environment: commonLabels.environment
    }, size)

    logger.debug('Message queue size updated', {
      metadata: { connectionId, priority, size }
    })
  }

  /**
   * Record circuit breaker state change
   */
  recordCircuitBreakerState(
    service: string,
    state: 'closed' | 'open' | 'half-open'
  ): void {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2
    
    safeSetGauge(circuitBreakerState, {
      service,
      environment: commonLabels.environment
    }, stateValue)

    logger.debug('Circuit breaker state recorded', {
      metadata: { service, state, stateValue }
    })
  }

  /**
   * Record health check result
   */
  recordHealthCheck(
    component: string,
    checkType: string,
    score: number
  ): void {
    safeSetGauge(healthCheckResults, {
      component,
      check_type: checkType,
      environment: commonLabels.environment
    }, score)

    logger.debug('Health check recorded', {
      metadata: { component, checkType, score }
    })
  }

  /**
   * Track operation duration with automatic metrics recording
   */
  async trackOperation<T>(
    operation: string,
    messageType: MessageType,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now()
    try {
      const result = await fn()
      const durationMs = Date.now() - startTime
      this.recordMessageProcessingTime(messageType, operation, durationMs)
      return result
    } catch (error) {
      const durationMs = Date.now() - startTime
      this.recordMessageProcessingTime(messageType, `${operation}_failed`, durationMs)
      throw error
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(): {
    activeConnections: number
    totalMessageQueues: number
    connectionIds: string[]
  } {
    return {
      activeConnections: this.activeConnections.size,
      totalMessageQueues: this.messageQueues.size,
      connectionIds: Array.from(this.activeConnections)
    }
  }

  /**
   * Reset connection tracking (useful for testing)
   */
  reset(): void {
    this.connectionStartTimes.clear()
    this.activeConnections.clear()
    this.messageQueues.clear()
    
    // Reset active connections gauge
    safeSetGauge(wsActiveConnections, {
      connection_type: ConnectionType.ENHANCED,
      environment: commonLabels.environment
    }, 0)

    logger.debug('WebSocket metrics collector reset')
  }

  /**
   * Cleanup connection tracking for a specific connection
   */
  cleanupConnection(connectionId: string): void {
    this.connectionStartTimes.delete(connectionId)
    this.activeConnections.delete(connectionId)
    
    // Clean up message queues for this connection
    const keysToDelete = Array.from(this.messageQueues.keys())
      .filter(key => key.startsWith(`${connectionId}:`))
    
    keysToDelete.forEach(key => {
      this.messageQueues.delete(key)
    })

    logger.debug('Connection tracking cleaned up', {
      metadata: { connectionId, queuesRemoved: keysToDelete.length }
    })
  }
}

// Export singleton instance
export const webSocketMetrics = new WebSocketMetricsCollector()
