/**
 * Enhanced WebSocket Client with Metrics Integration
 * 
 * Extends the existing enhanced WebSocket client with comprehensive metrics collection
 */

import { 
  EnhancedGeminiLiveWebSocketClient 
} from './enhanced-gemini-websocket'
import { GeminiLiveConfig } from './gemini-live-websocket'
import { 
  webSocketMetrics, 
  ConnectionType, 
  MessageType,
  WebSocketMetricsCollector 
} from './metrics/websocket-metrics'
import { logger } from './logging'
import { trace } from './telemetry'

/**
 * Metrics-enabled WebSocket Client
 */
export class MetricsEnabledWebSocketClient extends EnhancedGeminiLiveWebSocketClient {
  private metrics: WebSocketMetricsCollector
  private metricsConnectionId: string
  private metricsConnectionStartTime: number = 0

  constructor(config: GeminiLiveConfig & {enableDiagnostics?: boolean; enableDashboard?: boolean}) {
    super(config)
    this.metrics = webSocketMetrics
    this.metricsConnectionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Set up metrics event listeners
    this.setupMetricsListeners()
    
    logger.info('Metrics-enabled WebSocket client initialized', {
      metadata: { connectionId: this.metricsConnectionId }
    })
  }

  /**
   * Setup metrics event listeners
   */
  private setupMetricsListeners(): void {
    // Connection events
    this.on('connecting', () => {
      this.metricsConnectionStartTime = Date.now()
      this.metrics.recordConnectionAttempt(this.metricsConnectionId, ConnectionType.ENHANCED)
    })

    this.on('open', () => {
      const latencyMs = Date.now() - this.metricsConnectionStartTime
      this.metrics.recordConnectionSuccess(this.metricsConnectionId, ConnectionType.ENHANCED, latencyMs)
    })

    this.on('error', (error: Error) => {
      this.metrics.recordConnectionFailure(this.metricsConnectionId, error, ConnectionType.ENHANCED)
    })

    this.on('close', (code: number, reason: string) => {
      this.metrics.recordConnectionClose(this.metricsConnectionId, code, reason, ConnectionType.ENHANCED)
    })

    // Message events
    this.on('message', (message: Record<string, unknown>) => {
      const messageSize = JSON.stringify(message).length
      const messageType = this.getMessageType(message)
      this.metrics.recordMessageReceived(this.metricsConnectionId, messageType, messageSize)
    })

    // Reconnection events
    this.on('reconnect_attempt', (attempt: number) => {
      this.metrics.recordReconnectionAttempt(this.metricsConnectionId, attempt, false)
    })

    this.on('reconnect_success', (attempt: number) => {
      this.metrics.recordReconnectionAttempt(this.metricsConnectionId, attempt, true)
    })

    logger.debug('Metrics event listeners setup completed', {
      metadata: { connectionId: this.metricsConnectionId }
    })
  }

  /**
   * Get message type from message content
   */
  private getMessageType(message: Record<string, unknown>): MessageType {
    if (message.realtimeInput && typeof message.realtimeInput === 'object') {
      const realtimeInput = message.realtimeInput as Record<string, unknown>
      if (realtimeInput.audioData) {
        return MessageType.AUDIO
      } else if (realtimeInput.textInput) {
        return MessageType.TEXT
      }
    }
    
    if (message.type === 'control' || message.control) {
      return MessageType.CONTROL
    } else if (message.type === 'heartbeat' || message.heartbeat) {
      return MessageType.HEARTBEAT
    } else if (message.error) {
      return MessageType.ERROR
    }
    
    return MessageType.BINARY
  }

  /**
   * Enhanced sendRealtimeInput with metrics
   */
  async sendRealtimeInput(input: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<void> {
    const tracer = trace.getTracer('websocket-metrics')
    const span = tracer.startSpan('websocket_send_message')
    const startTime = Date.now()

    // Extract priority from options or default to medium
    const priority = (options.priority as string) || 'medium'

    try {
      // Record message being sent
      const messageSize = JSON.stringify(input).length
      const messageType = this.getMessageType(input)
      
      this.metrics.recordMessageSent(this.metricsConnectionId, messageType, messageSize, priority)

      // Track processing time
      await this.metrics.trackOperation(
        'send_realtime_input',
        messageType,
        async () => {
          // Use any to bypass type checking for now
          await super.sendRealtimeInput(input as unknown as any, options as unknown as any)
        }
      )

      span.addEvent('message_sent_successfully', {
        messageType,
        messageSize,
        priority,
        connectionId: this.metricsConnectionId
      })

    } catch (error) {
      const messageType = this.getMessageType(input)
      this.metrics.recordMessageFailure(
        this.metricsConnectionId, 
        messageType, 
        error instanceof Error ? error.constructor.name : 'UnknownError'
      )

      span.recordException(error as Error)
      span.setStatus({ code: 2, message: 'Message send failed' })
      
      logger.error('Failed to send realtime input with metrics', error as Error, {
        metadata: { 
          connectionId: this.metricsConnectionId,
          messageType,
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
        }
      })
      throw error
    } finally {
      const duration = Date.now() - startTime
      span.setAttribute('duration_ms', duration)
      span.end()
    }
  }

  /**
   * Enhanced connect with metrics
   */
  async connect(): Promise<void> {
    const tracer = trace.getTracer('websocket-metrics')
    const span = tracer.startSpan('websocket_connect')
    
    try {
      span.addEvent('connection_attempt_started', {
        connectionId: this.metricsConnectionId,
        timestamp: Date.now()
      })

      await super.connect()
      
      span.addEvent('connection_established', {
        connectionId: this.metricsConnectionId,
        latency: Date.now() - this.metricsConnectionStartTime
      })

    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({ code: 2, message: 'Connection failed' })
      throw error
    } finally {
      span.end()
    }
  }

  /**
   * Enhanced disconnect with metrics cleanup
   */
  async disconnect(): Promise<void> {
    const tracer = trace.getTracer('websocket-metrics')
    const span = tracer.startSpan('websocket_disconnect')
    
    try {
      span.addEvent('disconnect_initiated', {
        connectionId: this.metricsConnectionId
      })

      await super.disconnect()
      
      // Clean up metrics tracking for this connection
      this.metrics.cleanupConnection(this.metricsConnectionId)
      
      span.addEvent('disconnect_completed', {
        connectionId: this.metricsConnectionId
      })

    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({ code: 2, message: 'Disconnect failed' })
      throw error
    } finally {
      span.end()
    }
  }

  /**
   * Update message queue size metrics
   */
  private updateQueueMetrics(): void {
    try {
      // Since we don't have access to queue sizes from parent class,
      // we'll implement this as a placeholder for future enhancement
      logger.debug('Queue metrics update requested', {
        metadata: { connectionId: this.metricsConnectionId }
      })
    } catch (error) {
      logger.warn('Failed to update queue metrics', {
        metadata: { 
          connectionId: this.metricsConnectionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  }

  /**
   * Get current connection ID for external monitoring
   */
  getConnectionId(): string {
    return this.metricsConnectionId
  }

  /**
   * Get metrics summary for this connection
   */
  getMetricsConnectionSummary(): {
    connectionId: string
    connectionStartTime: number
    currentTime: number
    connectionDuration: number
  } {
    return {
      connectionId: this.metricsConnectionId,
      connectionStartTime: this.metricsConnectionStartTime,
      currentTime: Date.now(),
      connectionDuration: this.metricsConnectionStartTime > 0 ? Date.now() - this.metricsConnectionStartTime : 0
    }
  }

  /**
   * Record custom metric event
   */
  recordCustomMetric(
    metricName: string, 
    value: number, 
    labels: Record<string, string> = {}
  ): void {
    logger.debug('Custom metric recorded', {
      metadata: {
        metricName,
        value,
        labels,
        connectionId: this.metricsConnectionId
      }
    })
  }

  /**
   * Override cleanup to include metrics cleanup
   */
  async cleanup(): Promise<void> {
    try {
      // Call parent cleanup if it exists
      if (typeof (this as any).client?.cleanup === 'function') {
        await (this as any).client.cleanup()
      }
    } catch (error) {
      logger.warn('Parent cleanup failed', {
        metadata: { 
          connectionId: this.metricsConnectionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
    
    // Clean up metrics
    this.metrics.cleanupConnection(this.metricsConnectionId)
    
    logger.debug('Metrics-enabled WebSocket client cleanup completed', {
      metadata: { connectionId: this.metricsConnectionId }
    })
  }
}

/**
 * Factory function to create metrics-enabled WebSocket client
 */
export function createMetricsEnabledWebSocketClient(
  config: GeminiLiveConfig & {enableDiagnostics?: boolean; enableDashboard?: boolean}
): MetricsEnabledWebSocketClient {
  return new MetricsEnabledWebSocketClient(config)
}

/**
 * Export types for external use
 */
export {
  ConnectionType,
  MessageType,
  WebSocketMetricsCollector
} from './metrics/websocket-metrics'
