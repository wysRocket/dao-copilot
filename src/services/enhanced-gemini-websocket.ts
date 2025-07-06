/**
 * Enhanced Gemini Live WebSocket Client with Integrated Diagnostics
 * Wraps the existing GeminiLiveWebSocketClient to add comprehensive monitoring and debugging
 */

import {EventEmitter} from 'events'
import {
  GeminiLiveWebSocketClient,
  ConnectionState,
  GeminiLiveConfig,
  RealtimeInput,
  MessageSendOptions,
  ParsedGeminiResponse
} from './gemini-live-websocket'
import {
  WebSocketDiagnosticsLogger,
  WebSocketStatusDashboard,
  ConnectionStatusInfo,
  ConnectionMetrics,
  WebSocketEvent
} from './websocket-diagnostics'
import {sanitizeLogMessage} from './log-sanitizer'
import { logger, createLogger, measurePerformance } from './logging'
import type { LogContext } from './logging'
import {
  createConnectionSpan,
  createMessageSpan,
  withSpan,
  addSpanAttributes,
  getTraceContext,
  measureOperation,
  WebSocketAttributes,
  type SpanContext
} from './telemetry'

interface SessionData {
  sessionId?: string
  timestamp?: number
  duration?: number
}

interface DiagnosticFilter {
  type?: 'connection' | 'message' | 'error' | 'heartbeat' | 'close' | 'custom'
  level?: 'info' | 'warn' | 'error' | 'debug'
  since?: number
  limit?: number
}

interface DiagnosticsExport {
  connectionId: string
  metrics: ConnectionMetrics
  status: ConnectionStatusInfo
  recentEvents: WebSocketEvent[]
  recentErrors: WebSocketEvent[]
  clientInfo: {
    connectionState: string
    isConnected: boolean
    lastActivity: number
    queueSize: number
    monitoringEnabled: boolean
  }
}

/**
 * Enhanced WebSocket client with integrated diagnostics and monitoring
 */
export class EnhancedGeminiLiveWebSocketClient extends EventEmitter {
  private client: GeminiLiveWebSocketClient
  private diagnostics: WebSocketDiagnosticsLogger
  private dashboard: WebSocketStatusDashboard
  private connectionStartTime?: number
  private isMonitoringEnabled: boolean = true
  private lastMessageActivity: number = Date.now()
  private wsLogger = createLogger({ component: 'enhanced-websocket-client' })
  private connectionId: string = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  constructor(config: GeminiLiveConfig & {enableDiagnostics?: boolean; enableDashboard?: boolean}) {
    super()

    // Set connection context for all logging
    this.wsLogger.setContext({
      connectionId: this.connectionId,
      component: 'enhanced-websocket-client'
    })

    this.wsLogger.info('Initializing Enhanced Gemini WebSocket Client', {
      metadata: {
        enableDiagnostics: config.enableDiagnostics !== false,
        enableDashboard: config.enableDashboard !== false,
        model: config.model,
        responseModalities: config.responseModalities
      }
    })

    // Initialize the original client
    this.client = new GeminiLiveWebSocketClient(config)

    // Initialize diagnostics system
    this.diagnostics = new WebSocketDiagnosticsLogger()
    this.dashboard = new WebSocketStatusDashboard(this.diagnostics)

    // Enable monitoring by default unless explicitly disabled
    this.isMonitoringEnabled = config.enableDiagnostics !== false

    // Start dashboard if enabled (default: true)
    if (config.enableDashboard !== false) {
      this.dashboard.start()
      this.wsLogger.info('WebSocket dashboard started')
    }

    this.setupClientEventForwarding()
    this.setupDiagnosticIntegration()

    this.diagnostics.logEvent('client_initialized', 'custom', 'info', {
      enableDiagnostics: this.isMonitoringEnabled,
      enableDashboard: config.enableDashboard !== false,
      config: {
        model: config.model,
        responseModalities: config.responseModalities,
        reconnectAttempts: config.reconnectAttempts,
        heartbeatInterval: config.heartbeatInterval
      }
    })

    this.wsLogger.startup('Enhanced WebSocket Client initialized successfully', {
      metadata: {
        connectionId: this.connectionId,
        monitoringEnabled: this.isMonitoringEnabled
      }
    })
  }

  /**
   * Forward all events from the original client while adding diagnostic logging
   */
  private setupClientEventForwarding(): void {
    // Connection events
    this.client.on('connected', () => {
      const latency = this.connectionStartTime ? Date.now() - this.connectionStartTime : undefined
      this.diagnostics.onConnectionEstablished(latency)
      
      this.wsLogger.websocket('connection_established', this.connectionId, {
        duration: latency,
        metadata: { establishmentTime: Date.now() }
      })
      
      this.emit('connected')
    })

    this.client.on('disconnected', (code: number, reason: string) => {
      this.diagnostics.onConnectionClosed(code, reason, code === 1000)
      
      this.wsLogger.websocket('connection_closed', this.connectionId, {
        statusCode: code,
        metadata: { 
          reason: sanitizeLogMessage(reason),
          wasClean: code === 1000,
          closeTime: Date.now()
        }
      })
      
      this.emit('disconnected', code, reason)
    })

    this.client.on('error', (error: Error) => {
      this.diagnostics.onError(error, 'client_error')
      
      this.wsLogger.error('WebSocket client error occurred', error, {
        connectionId: this.connectionId,
        metadata: { 
          errorType: 'client_error',
          timestamp: Date.now()
        }
      })
      
      this.emit('error', error)
    })

    this.client.on('reconnecting', (attempt: number, delay: number) => {
      this.diagnostics.onReconnectionAttempt(attempt, delay)
      
      this.wsLogger.warn('WebSocket reconnection attempt', {
        connectionId: this.connectionId,
        metadata: {
          attempt,
          delay,
          timestamp: Date.now()
        }
      })
      
      this.emit('reconnecting', attempt, delay)
    })

    this.client.on('reconnected', () => {
      this.diagnostics.onReconnectionSuccess()
      
      this.wsLogger.info('WebSocket reconnection successful', {
        connectionId: this.connectionId,
        metadata: { reconnectTime: Date.now() }
      })
      
      this.emit('reconnected')
    })

    // Message events
    this.client.on('message', (message: ParsedGeminiResponse) => {
      this.handleIncomingMessage(message)
      this.emit('message', message)
    })

    this.client.on('sessionStarted', (sessionData: SessionData) => {
      this.diagnostics.logEvent('session_started', 'custom', 'info', {
        sessionId: sessionData?.sessionId,
        timestamp: sessionData?.timestamp
      })
      
      this.wsLogger.info('WebSocket session started', {
        connectionId: this.connectionId,
        sessionId: sessionData?.sessionId,
        metadata: {
          sessionTimestamp: sessionData?.timestamp,
          startTime: Date.now()
        }
      })
      
      this.emit('sessionStarted', sessionData)
    })

    this.client.on('sessionEnded', (sessionData: SessionData) => {
      this.diagnostics.logEvent('session_ended', 'custom', 'info', {
        sessionId: sessionData?.sessionId,
        duration: sessionData?.duration
      })
      
      this.wsLogger.info('WebSocket session ended', {
        connectionId: this.connectionId,
        sessionId: sessionData?.sessionId,
        duration: sessionData?.duration,
        metadata: {
          endTime: Date.now()
        }
      })
      
      this.emit('sessionEnded', sessionData)
    })

    // Setup events
    this.client.on('setupComplete', () => {
      this.diagnostics.logEvent('setup_complete', 'custom', 'info')
      
      this.wsLogger.info('WebSocket setup completed', {
        connectionId: this.connectionId,
        metadata: { setupTime: Date.now() }
      })
      
      this.emit('setupComplete')
    })

    this.client.on('audioEnabled', () => {
      this.diagnostics.logEvent('audio_enabled', 'custom', 'info')
      
      this.wsLogger.info('WebSocket audio enabled', {
        connectionId: this.connectionId,
        metadata: { audioEnabledTime: Date.now() }
      })
      
      this.emit('audioEnabled')
    })

    this.client.on('audioDisabled', () => {
      this.diagnostics.logEvent('audio_disabled', 'custom', 'info')
      
      this.wsLogger.info('WebSocket audio disabled', {
        connectionId: this.connectionId,
        metadata: { audioDisabledTime: Date.now() }
      })
      
      this.emit('audioDisabled')
    })

    // Enhanced events from diagnostics
    this.diagnostics.on('healthCheck', (status: ConnectionStatusInfo) => {
      this.emit('healthCheck', status)
    })

    this.diagnostics.on('dashboardUpdate', (status: ConnectionStatusInfo) => {
      this.emit('dashboardUpdate', status)
    })
  }

  /**
   * Setup diagnostic integration hooks
   */
  private setupDiagnosticIntegration(): void {
    // Monitor connection state changes
    this.client.on(
      'connectionStateChanged',
      (newState: ConnectionState, oldState: ConnectionState) => {
        this.diagnostics.logEvent('connection_state_changed', 'connection', 'info', {
          from: oldState,
          to: newState
        })

        this.wsLogger.info('WebSocket connection state changed', {
          connectionId: this.connectionId,
          metadata: {
            fromState: oldState,
            toState: newState,
            timestamp: Date.now()
          }
        })

        if (newState === ConnectionState.CONNECTING) {
          this.connectionStartTime = Date.now()
          this.diagnostics.onConnectionStart()
          
          this.wsLogger.info('WebSocket connection starting', {
            connectionId: this.connectionId,
            metadata: { connectionStartTime: this.connectionStartTime }
          })
        } else if (
          newState === ConnectionState.CONNECTED &&
          oldState === ConnectionState.CONNECTING
        ) {
          // Connection established - already handled in onConnectionEstablished
        } else if (
          newState === ConnectionState.DISCONNECTED ||
          newState === ConnectionState.ERROR
        ) {
          // Connection lost - already handled in onConnectionClosed/onError
        }
      }
    )

    // Monitor message queue events
    this.client.on('messageQueued', (messageId: string, priority: number) => {
      this.diagnostics.logEvent('message_queued', 'message', 'debug', {
        messageId,
        priority,
        queueSize: this.getQueueSize()
      })
      
      this.wsLogger.debug('Message queued for sending', {
        connectionId: this.connectionId,
        metadata: {
          messageId,
          priority,
          queueSize: this.getQueueSize(),
          timestamp: Date.now()
        }
      })
    })

    this.client.on('messageDequeued', (messageId: string) => {
      this.diagnostics.logEvent('message_dequeued', 'message', 'debug', {
        messageId,
        queueSize: this.getQueueSize()
      })
      
      this.wsLogger.debug('Message dequeued for sending', {
        connectionId: this.connectionId,
        metadata: {
          messageId,
          queueSize: this.getQueueSize(),
          timestamp: Date.now()
        }
      })
    })

    this.client.on('messageFailed', (messageId: string, error: Error, retryCount: number) => {
      this.diagnostics.onMessageError(error, {messageId, retryCount})
      
      this.wsLogger.error('Message sending failed', error, {
        connectionId: this.connectionId,
        metadata: {
          messageId,
          retryCount,
          timestamp: Date.now()
        }
      })
    })

    // Monitor heartbeat events (if applicable)
    this.client.on('heartbeatSent', () => {
      this.diagnostics.onHeartbeatSent()
      
      this.wsLogger.debug('Heartbeat sent', {
        connectionId: this.connectionId,
        metadata: { heartbeatSentTime: Date.now() }
      })
    })

    this.client.on('heartbeatReceived', (latency?: number) => {
      this.diagnostics.onHeartbeatReceived(latency)
      
      this.wsLogger.debug('Heartbeat received', {
        connectionId: this.connectionId,
        duration: latency,
        metadata: { 
          latency,
          heartbeatReceivedTime: Date.now()
        }
      })
    })

    this.client.on('heartbeatTimeout', () => {
      this.diagnostics.onHeartbeatTimeout()
      
      this.wsLogger.warn('Heartbeat timeout detected', {
        connectionId: this.connectionId,
        metadata: { heartbeatTimeoutTime: Date.now() }
      })
    })

    // Monitor circuit breaker events
    this.client.on('circuitBreakerOpened', (errorCount: number) => {
      this.diagnostics.logEvent('circuit_breaker_opened', 'error', 'warn', {
        errorCount,
        timestamp: Date.now()
      })
    })

    this.client.on('circuitBreakerClosed', () => {
      this.diagnostics.logEvent('circuit_breaker_closed', 'custom', 'info', {
        timestamp: Date.now()
      })
    })
  }

  /**
   * Handle incoming messages with diagnostic logging
   */
  private handleIncomingMessage(message: ParsedGeminiResponse): void {
    this.lastMessageActivity = Date.now()

    // Calculate message size (approximate)
    const messageSize = this.estimateMessageSize(message)

    this.diagnostics.onMessageReceived(message, messageSize)

    // Log significant message types with Winston
    if (message.type === 'error') {
      this.diagnostics.logEvent('received_error_message', 'message', 'error', {
        error: message.error,
        messageId: message.metadata?.messageId
      })
      
      this.wsLogger.error('Received error message from WebSocket', new Error(String(message.error)), {
        connectionId: this.connectionId,
        metadata: {
          messageId: message.metadata?.messageId,
          messageSize,
          timestamp: this.lastMessageActivity
        }
      })
    } else if (message.type === 'audio') {
      this.diagnostics.logEvent('received_audio_message', 'message', 'debug', {
        hasContent: !!message.content,
        messageId: message.metadata?.messageId,
        size: messageSize
      })
      
      this.wsLogger.debug('Received audio message from WebSocket', {
        connectionId: this.connectionId,
        metadata: {
          hasContent: !!message.content,
          messageId: message.metadata?.messageId,
          messageSize,
          timestamp: this.lastMessageActivity
        }
      })
    } else if (message.type === 'text') {
      this.diagnostics.logEvent('received_text_message', 'message', 'debug', {
        contentLength: typeof message.content === 'string' ? message.content.length : 0,
        messageId: message.metadata?.messageId
      })
      
      this.wsLogger.debug('Received text message from WebSocket', {
        connectionId: this.connectionId,
        metadata: {
          contentLength: typeof message.content === 'string' ? message.content.length : 0,
          messageId: message.metadata?.messageId,
          messageSize,
          timestamp: this.lastMessageActivity
        }
      })
    } else {
      // Log other message types
      this.wsLogger.debug('Received message from WebSocket', {
        connectionId: this.connectionId,
        metadata: {
          messageType: message.type,
          messageId: message.metadata?.messageId,
          messageSize,
          timestamp: this.lastMessageActivity
        }
      })
    }
  }

  /**
   * Estimate message size in bytes
   */
  private estimateMessageSize(message: ParsedGeminiResponse): number {
    try {
      return new Blob([JSON.stringify(message)]).size
    } catch {
      // Fallback estimation
      const contentSize =
        typeof message.content === 'string'
          ? message.content.length
          : message.content instanceof ArrayBuffer
            ? message.content.byteLength
            : 0
      const metadataSize = JSON.stringify(message.metadata || {}).length
      return contentSize + metadataSize + 100 // Add overhead estimate
    }
  }

  /**
   * Enhanced connect method with diagnostic logging and tracing
   */
  async connect(): Promise<void> {
    const span = createConnectionSpan('connect', {
      connectionId: this.connectionId,
      metadata: { timestamp: Date.now() }
    })

    return withSpan(span, async () => {
      this.diagnostics.logEvent('connect_requested', 'connection', 'info')
      this.wsLogger.info('WebSocket connection requested', {
        connectionId: this.connectionId,
        metadata: { requestTime: Date.now() }
      })

      // Add trace context to logging
      const traceContext = getTraceContext()
      if (traceContext) {
        addSpanAttributes({
          'trace.id': traceContext.traceId,
          'span.id': traceContext.spanId
        })
      }

      await measurePerformance('websocket_connect', async () => {
        await this.client.connect()
      }, { 
        connectionId: this.connectionId,
        metadata: { traceId: traceContext?.traceId }
      })
      
      this.diagnostics.logEvent('connect_successful', 'connection', 'info')
      this.wsLogger.info('WebSocket connection established successfully', {
        connectionId: this.connectionId,
        metadata: { 
          connectTime: Date.now(),
          traceId: traceContext?.traceId 
        }
      })
    }, (error) => {
      this.diagnostics.onConnectionFailed(error)
      this.diagnostics.logEvent('connect_failed', 'connection', 'error', {
        error: sanitizeLogMessage(error instanceof Error ? error.message : String(error))
      })
      
      this.wsLogger.error('WebSocket connection failed', error as Error, {
        connectionId: this.connectionId,
        metadata: { 
          failureTime: Date.now(),
          errorMessage: sanitizeLogMessage(error instanceof Error ? error.message : String(error))
        }
      })
    })
  }

  /**
   * Enhanced disconnect method with diagnostic logging and tracing
   */
  async disconnect(): Promise<void> {
    const span = createConnectionSpan('disconnect', {
      connectionId: this.connectionId,
      metadata: { timestamp: Date.now() }
    })

    return withSpan(span, async () => {
      this.diagnostics.logEvent('disconnect_requested', 'connection', 'info')
      this.wsLogger.info('WebSocket disconnection requested', {
        connectionId: this.connectionId,
        metadata: { requestTime: Date.now() }
      })

      const traceContext = getTraceContext()
      if (traceContext) {
        addSpanAttributes({
          'trace.id': traceContext.traceId,
          'span.id': traceContext.spanId
        })
      }

      await measurePerformance('websocket_disconnect', async () => {
        await this.client.disconnect()
      }, { 
        connectionId: this.connectionId,
        metadata: { traceId: traceContext?.traceId }
      })
      
      this.diagnostics.logEvent('disconnect_successful', 'connection', 'info')
      this.wsLogger.info('WebSocket disconnected successfully', {
        connectionId: this.connectionId,
        metadata: { 
          disconnectTime: Date.now(),
          traceId: traceContext?.traceId 
        }
      })
    }, (error) => {
      this.diagnostics.logEvent('disconnect_failed', 'connection', 'error', {
        error: sanitizeLogMessage(error instanceof Error ? error.message : String(error))
      })
      
      this.wsLogger.error('WebSocket disconnection failed', error as Error, {
        connectionId: this.connectionId,
        metadata: { 
          failureTime: Date.now(),
          errorMessage: sanitizeLogMessage(error instanceof Error ? error.message : String(error))
        }
      })
    })
  }

  /**
   * Enhanced sendRealtimeInput with diagnostic logging and tracing
   */
  async sendRealtimeInput(input: RealtimeInput, options: MessageSendOptions = {}): Promise<void> {
    const messageSize = this.estimateMessageSize(input as unknown as ParsedGeminiResponse)
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const inputType = this.determineInputType(input)

    const span = createMessageSpan('send_realtime_input', inputType, {
      connectionId: this.connectionId,
      messageId,
      metadata: {
        messageSize,
        priority: options.priority || 'normal'
      }
    })

    return withSpan(span, async () => {
      this.diagnostics.onMessageSent(input, messageSize)
      this.diagnostics.logEvent('send_realtime_input', 'message', 'debug', {
        messageId,
        inputType,
        size: messageSize,
        priority: options.priority || 'normal'
      })

      const traceContext = getTraceContext()
      this.wsLogger.debug('Sending realtime input to WebSocket', {
        connectionId: this.connectionId,
        metadata: {
          messageId,
          inputType,
          messageSize,
          priority: options.priority || 'normal',
          timestamp: Date.now(),
          traceId: traceContext?.traceId
        }
      })

      await measureOperation('websocket_send_realtime_input', async () => {
        await this.client.sendRealtimeInput(input, options)
      }, { 
        connectionId: this.connectionId,
        metadata: { messageId, inputType, traceId: traceContext?.traceId }
      })
      
      this.diagnostics.logEvent('send_realtime_input_success', 'message', 'debug', {
        messageId
      })
      
      this.wsLogger.debug('Realtime input sent successfully', {
        connectionId: this.connectionId,
        metadata: { 
          messageId, 
          timestamp: Date.now(),
          traceId: traceContext?.traceId
        }
      })
    }, (error) => {
      this.diagnostics.onMessageError(error, {messageId, inputType})
      this.diagnostics.logEvent('send_realtime_input_failed', 'message', 'error', {
        messageId,
        error: sanitizeLogMessage(error instanceof Error ? error.message : String(error))
      })
      
      this.wsLogger.error('Failed to send realtime input', error as Error, {
        connectionId: this.connectionId,
        metadata: {
          messageId,
          inputType,
          errorMessage: sanitizeLogMessage(error instanceof Error ? error.message : String(error)),
          timestamp: Date.now()
        }
      })
    })
  }

  private determineInputType(input: RealtimeInput): string {
    // Check for audio-related properties in the input
    const inputObj = input as Record<string, unknown>
    return inputObj.mediaChunks || inputObj.audio || inputObj.audioData ? 'audio' : 'text'
  }

  /**
   * Enhanced sendClientContent with diagnostic logging
   */
  async sendClientContent(content: {turnComplete?: boolean; text?: string}): Promise<void> {
    const messageSize = this.estimateMessageSize(content as unknown as ParsedGeminiResponse)
    const messageId = `client_content_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const contentType = content.turnComplete !== undefined ? 'turn_complete' : 
                       content.text !== undefined ? 'text_content' :
                       'unknown'

    this.diagnostics.onMessageSent(content, messageSize)
    this.diagnostics.logEvent('send_client_content', 'message', 'debug', {
      messageId,
      turnComplete: content.turnComplete,
      hasText: !!content.text,
      size: messageSize
    })

    this.wsLogger.debug('Sending client content to WebSocket', {
      connectionId: this.connectionId,
      metadata: {
        messageId,
        contentType,
        messageSize,
        turnComplete: content.turnComplete,
        hasText: !!content.text,
        textLength: content.text?.length,
        timestamp: Date.now()
      }
    })

    try {
      await measurePerformance('websocket_send_client_content', async () => {
        await this.client.sendClientContent(content)
      }, { 
        connectionId: this.connectionId,
        metadata: { messageId, contentType }
      })
      
      this.diagnostics.logEvent('send_client_content_success', 'message', 'debug', {
        messageId
      })
      
      this.wsLogger.debug('Client content sent successfully', {
        connectionId: this.connectionId,
        metadata: { messageId, timestamp: Date.now() }
      })
    } catch (error) {
      this.diagnostics.onMessageError(error, {messageId, type: 'client_content'})
      this.diagnostics.logEvent('send_client_content_failed', 'message', 'error', {
        messageId,
        error: sanitizeLogMessage(error instanceof Error ? error.message : String(error))
      })
      
      this.wsLogger.error('Failed to send client content', error as Error, {
        connectionId: this.connectionId,
        metadata: {
          messageId,
          contentType,
          errorMessage: sanitizeLogMessage(error instanceof Error ? error.message : String(error)),
          timestamp: Date.now()
        }
      })
      
      throw error
    }
  }

  /**
   * Get current connection status with diagnostics
   */
  getConnectionStatus(): ConnectionStatusInfo {
    const status = this.diagnostics.getConnectionStatus()

    // Update status with current client state
    status.state = this.getConnectionState()
    status.connected = this.isConnected()
    status.lastActivity = this.lastMessageActivity

    this.wsLogger.debug('Connection status retrieved', {
      connectionId: this.connectionId,
      metadata: {
        state: status.state,
        connected: status.connected,
        lastActivity: status.lastActivity,
        healthScore: status.health?.score,
        uptime: status.metrics?.uptime,
        timestamp: Date.now()
      }
    })

    return status
  }

  /**
   * Get detailed connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    const metrics = this.diagnostics.getMetrics()
    
    this.wsLogger.debug('Connection metrics retrieved', {
      connectionId: this.connectionId,
      metadata: {
        uptime: metrics.uptime,
        messagesSent: metrics.messagesSent,
        messagesReceived: metrics.messagesReceived,
        bytesSent: metrics.bytesSent,
        bytesReceived: metrics.bytesReceived,
        averageConnectionTime: metrics.averageConnectionTime,
        timestamp: Date.now()
      }
    })
    
    return metrics
  }

  /**
   * Export comprehensive diagnostic data
   */
  exportDiagnostics(): DiagnosticsExport {
    const diagnostics = this.diagnostics.exportDiagnostics()

    const exportData = {
      ...diagnostics,
      clientInfo: {
        connectionState: this.getConnectionState(),
        isConnected: this.isConnected(),
        lastActivity: this.lastMessageActivity,
        queueSize: this.getQueueSize(),
        monitoringEnabled: this.isMonitoringEnabled
      }
    }

    this.wsLogger.info('Comprehensive diagnostic data exported', {
      connectionId: this.connectionId,
      metadata: {
        connectionState: exportData.clientInfo.connectionState,
        isConnected: exportData.clientInfo.isConnected,
        queueSize: exportData.clientInfo.queueSize,
        monitoringEnabled: exportData.clientInfo.monitoringEnabled,
        exportTimestamp: Date.now()
      }
    })

    return exportData
  }

  /**
   * Enable or disable diagnostic monitoring
   */
  setMonitoringEnabled(enabled: boolean): void {
    this.isMonitoringEnabled = enabled

    if (enabled) {
      this.diagnostics.logEvent('monitoring_enabled', 'custom', 'info')
    } else {
      this.diagnostics.logEvent('monitoring_disabled', 'custom', 'info')
    }
  }

  /**
   * Get diagnostic events with filtering
   */
  getDiagnosticEvents(filter?: DiagnosticFilter): WebSocketEvent[] {
    return this.diagnostics.getEvents(filter)
  }

  /**
   * Get recent errors for troubleshooting
   */
  getRecentErrors(since?: number): WebSocketEvent[] {
    return this.diagnostics.getRecentErrors(since)
  }

  // Delegate methods to the original client
  getConnectionState(): string {
    return this.client.getConnectionState?.() || 'unknown'
  }

  isConnected(): boolean {
    return this.client.isConnected?.() || false
  }

  private getQueueSize(): number {
    // This would need to be exposed by the original client
    return 0 // Placeholder
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.diagnostics.logEvent('client_destroying', 'custom', 'info')

    this.dashboard.destroy()
    this.diagnostics.destroy()

    if (this.client.destroy) {
      this.client.destroy()
    }

    this.removeAllListeners()
  }

  // Additional diagnostic methods for external monitoring

  /**
   * Force a health check and return results
   */
  performHealthCheck(): ConnectionStatusInfo {
    const startTime = Date.now()
    const status = this.getConnectionStatus()
    
    this.diagnostics.logEvent('manual_health_check', 'custom', 'info', {
      healthStatus: status.health.status,
      score: status.health.score,
      issues: status.health.issues
    })

    this.wsLogger.info('Manual health check performed', {
      connectionId: this.connectionId,
      metadata: {
        healthStatus: status.health.status,
        healthScore: status.health.score,
        issuesCount: status.health.issues.length,
        performanceMs: Date.now() - startTime,
        timestamp: Date.now()
      }
    })

    return status
  }

  /**
   * Get connection performance summary
   */
  getPerformanceSummary(): {
    uptime: number
    reliability: number
    errorRate: number
    throughput: number
    averageLatency: number
  } {
    const metrics = this.getConnectionMetrics()
    const status = this.getConnectionStatus()

    return {
      uptime: metrics.uptime,
      reliability: status.performance.reliability,
      errorRate: status.performance.errorRate,
      throughput: status.performance.throughput,
      averageLatency: metrics.averageConnectionTime
    }
  }

  /**
   * Start monitoring dashboard (if not already started)
   */
  startDashboard(): void {
    this.dashboard.start()
  }

  /**
   * Stop monitoring dashboard
   */
  stopDashboard(): void {
    this.dashboard.stop()
  }
}

export default EnhancedGeminiLiveWebSocketClient
