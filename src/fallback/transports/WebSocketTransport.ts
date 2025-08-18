/**
 * WebSocket Transport Implementation
 *
 * Primary transport layer for Gemini Live WebSocket connections with schema failure handling.
 * Integrates with existing GeminiLiveWebSocketClient to provide fallback-aware connectivity.
 */

import {TransportStrategy, AudioSendOptions, TranscriptionResult} from '../FallbackManager'
import {logger} from '../../services/gemini-logger'
import {EventEmitter} from 'events'

export interface WebSocketTransportConfig {
  maxReconnectAttempts: number
  reconnectDelayMs: number
  heartbeatIntervalMs: number
  schemaVariantRetryLimit: number
  connectionTimeoutMs: number
}

export interface WebSocketTransportMetrics {
  connectionAttempts: number
  successfulConnections: number
  schemaFailures: number
  currentSchemaVariant: number
  lastConnectionTime: Date | null
  averageLatency: number
  bytesTransmitted: number
  bytesReceived: number
}

const DEFAULT_CONFIG: WebSocketTransportConfig = {
  maxReconnectAttempts: 3,
  reconnectDelayMs: 1000,
  heartbeatIntervalMs: 30000,
  schemaVariantRetryLimit: 4, // Try variants 13-16
  connectionTimeoutMs: 10000
}

/**
 * WebSocket transport implementation handling schema failures and fallback triggers
 */
export class WebSocketTransport extends EventEmitter implements TransportStrategy {
  readonly name: string = 'websocket'
  readonly priority: number = 1 // Highest priority transport

  private config: WebSocketTransportConfig
  private ws: WebSocket | null = null
  private isConnected: boolean = false
  private isHealthy: boolean = false
  private reconnectAttempts: number = 0
  private currentSchemaVariant: number = 13 // Start with variant 13
  private schemaVariantFailures: number = 0
  private heartbeatTimer: NodeJS.Timeout | null = null
  private connectionTimer: NodeJS.Timeout | null = null
  private metrics: WebSocketTransportMetrics

  constructor(config: Partial<WebSocketTransportConfig> = {}) {
    super()
    this.config = {...DEFAULT_CONFIG, ...config}
    this.metrics = this.initializeMetrics()
  }

  private initializeMetrics(): WebSocketTransportMetrics {
    return {
      connectionAttempts: 0,
      successfulConnections: 0,
      schemaFailures: 0,
      currentSchemaVariant: this.currentSchemaVariant,
      lastConnectionTime: null,
      averageLatency: 0,
      bytesTransmitted: 0,
      bytesReceived: 0
    }
  }

  /**
   * Check if transport is available
   */
  isAvailable(): boolean {
    return true // WebSocket is generally available in browser and Node.js
  }

  /**
   * Send audio data through WebSocket
   */
  async sendAudio(audioData: Buffer, options?: AudioSendOptions): Promise<TranscriptionResult> {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket not connected')
    }

    try {
      const audioMessage = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: options?.mimeType || 'audio/pcm',
              data: audioData.toString('base64')
            }
          ]
        }
      }

      const success = await this.sendMessage(audioMessage)
      if (!success) {
        throw new Error('Failed to send audio message')
      }

      // For WebSocket, we return a placeholder result since actual transcription comes async
      return {
        text: '', // Will be populated when transcription arrives
        confidence: undefined,
        source: 'websocket' as const
      }
    } catch (error) {
      logger.error('WebSocketTransport: Failed to send audio:', {error: String(error)})
      throw error
    }
  }

  /**
   * Send turn completion signal
   */
  async sendTurnComplete(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket not connected')
    }

    try {
      const turnCompleteMessage = {
        clientContent: {
          turnComplete: true
        }
      }

      const success = await this.sendMessage(turnCompleteMessage)
      if (!success) {
        throw new Error('Failed to send turn complete message')
      }
    } catch (error) {
      logger.error('WebSocketTransport: Failed to send turn complete:', {error: String(error)})
      throw error
    }
  }

  /**
   * Destroy transport and clean up resources
   */
  async destroy(): Promise<void> {
    logger.info('WebSocketTransport: Destroying transport')
    await this.disconnect()
    this.removeAllListeners()
  }
  async initialize(): Promise<void> {
    logger.info('WebSocketTransport: Initializing WebSocket transport')

    try {
      await this.connect()
    } catch (error) {
      logger.error('WebSocketTransport: Failed to initialize:', {error: String(error)})
      throw error
    }
  }

  /**
   * Connect to WebSocket endpoint with schema variant handling
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.metrics.connectionAttempts++

      try {
        // Use dynamic endpoint construction based on schema variant
        const wsUrl = this.buildWebSocketUrl()
        logger.info(
          `WebSocketTransport: Connecting with schema variant ${this.currentSchemaVariant}`
        )

        this.ws = new WebSocket(wsUrl)

        // Set connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            logger.warn('WebSocketTransport: Connection timeout')
            this.ws.close()
            reject(new Error('Connection timeout'))
          }
        }, this.config.connectionTimeoutMs)

        this.ws.onopen = () => {
          this.handleConnectionOpen()
          if (this.connectionTimer) {
            clearTimeout(this.connectionTimer)
            this.connectionTimer = null
          }
          resolve()
        }

        this.ws.onmessage = event => {
          this.handleMessage(event)
        }

        this.ws.onclose = event => {
          this.handleConnectionClose(event)
        }

        this.ws.onerror = error => {
          this.handleConnectionError(error)
          if (this.connectionTimer) {
            clearTimeout(this.connectionTimer)
            this.connectionTimer = null
          }
          reject(error)
        }
      } catch (error) {
        logger.error('WebSocketTransport: Connection setup failed:', {error: String(error)})
        reject(error)
      }
    })
  }

  /**
   * Build WebSocket URL with current schema variant
   */
  private buildWebSocketUrl(): string {
    // This should integrate with the existing gemini-live-websocket.ts URL construction
    // For now, using a placeholder URL structure
    const baseUrl =
      process.env.GEMINI_WEBSOCKET_URL ||
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.StreamGenerateContent'
    const apiKey = process.env.GOOGLE_API_KEY || ''

    return `${baseUrl}?key=${apiKey}&variant=${this.currentSchemaVariant}`
  }

  /**
   * Handle successful connection
   */
  private handleConnectionOpen(): void {
    logger.info('WebSocketTransport: Connection established successfully')
    this.isConnected = true
    this.isHealthy = true
    this.reconnectAttempts = 0
    this.schemaVariantFailures = 0
    this.metrics.successfulConnections++
    this.metrics.lastConnectionTime = new Date()

    // Start heartbeat
    this.startHeartbeat()

    // Emit connection success
    this.emit('connected')
    this.emit('healthChange', {isHealthy: true, quality: 1.0})
  }

  /**
   * Handle incoming messages with schema error detection
   */
  private handleMessage(event: MessageEvent): void {
    try {
      this.metrics.bytesReceived += event.data.length

      const data = JSON.parse(event.data)

      // Check for schema-related errors (specifically 1007 "Invalid JSON payload")
      if (this.isSchemaError(data)) {
        this.handleSchemaFailure(data)
        return
      }

      // Forward valid messages to the application
      this.emit('message', data)
    } catch (error) {
      logger.error('WebSocketTransport: Message parsing failed:', {error: String(error)})
      this.emit('error', error)
    }
  }

  /**
   * Check if message indicates a schema error
   */
  private isSchemaError(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) {
      return false
    }

    const errorObj = data as Record<string, unknown>

    // Check for 1007 WebSocket close codes or specific error patterns
    if (errorObj.error && typeof errorObj.error === 'object' && errorObj.error !== null) {
      const error = errorObj.error as Record<string, unknown>
      if (
        error.code === 1007 ||
        (typeof error.message === 'string' &&
          (error.message.includes('Invalid JSON payload') ||
            error.message.includes('clientContent') ||
            error.message.includes('contents') ||
            error.message.includes('parts')))
      ) {
        return true
      }
    }

    // Additional schema error patterns based on observed failures
    if (
      errorObj.type === 'error' &&
      typeof errorObj.details === 'string' &&
      errorObj.details.includes('schema')
    ) {
      return true
    }

    return false
  }

  /**
   * Handle schema failure with variant progression
   */
  private handleSchemaFailure(errorData: unknown): void {
    logger.warn(`WebSocketTransport: Schema failure on variant ${this.currentSchemaVariant}:`, {
      errorData
    })

    this.metrics.schemaFailures++
    this.schemaVariantFailures++

    // Try next schema variant if available
    if (
      this.currentSchemaVariant < 16 &&
      this.schemaVariantFailures < this.config.schemaVariantRetryLimit
    ) {
      this.currentSchemaVariant++
      this.metrics.currentSchemaVariant = this.currentSchemaVariant

      logger.info(`WebSocketTransport: Retrying with schema variant ${this.currentSchemaVariant}`)

      // Close current connection and retry with new variant
      this.disconnect()
      setTimeout(() => {
        this.initialize().catch(error => {
          logger.error('WebSocketTransport: Variant retry failed:', error)
          this.emit('schemaExhausted', {variant: this.currentSchemaVariant, error: errorData})
        })
      }, this.config.reconnectDelayMs)
    } else {
      // All schema variants exhausted - trigger transport fallback
      logger.error('WebSocketTransport: All schema variants exhausted')
      this.isHealthy = false
      this.emit('schemaExhausted', {
        variant: this.currentSchemaVariant,
        error: errorData,
        totalFailures: this.schemaVariantFailures
      })
      this.emit('healthChange', {isHealthy: false, quality: 0.0})
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(event: CloseEvent): void {
    logger.info(
      `WebSocketTransport: Connection closed - Code: ${event.code}, Reason: ${event.reason}`
    )

    this.isConnected = false
    this.stopHeartbeat()

    // Check if this is a 1007 close code (Invalid JSON payload)
    if (event.code === 1007) {
      this.handleSchemaFailure({code: event.code, reason: event.reason})
    } else {
      this.emit('disconnected', {code: event.code, reason: event.reason})
    }
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: Event): void {
    logger.error('WebSocketTransport: Connection error:', {error: error.type || 'Unknown error'})
    this.isConnected = false
    this.isHealthy = false
    this.emit('error', error)
    this.emit('healthChange', {isHealthy: false, quality: 0.0})
  }

  /**
   * Send message through WebSocket
   */
  async sendMessage(data: Record<string, unknown>): Promise<boolean> {
    if (!this.isConnected || !this.ws) {
      logger.warn('WebSocketTransport: Cannot send message - not connected')
      return false
    }

    try {
      const message = JSON.stringify(data)
      this.ws.send(message)
      this.metrics.bytesTransmitted += message.length
      return true
    } catch (error) {
      logger.error('WebSocketTransport: Failed to send message:', {error: String(error)})
      this.emit('error', error)
      return false
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws) {
        // Send a heartbeat message instead of ping (WebSocket ping not available in browser)
        try {
          this.ws.send(JSON.stringify({type: 'heartbeat', timestamp: Date.now()}))
        } catch (error) {
          logger.warn('WebSocketTransport: Heartbeat failed:', {error: String(error)})
          this.isHealthy = false
          this.emit('healthChange', {isHealthy: false, quality: 0.5})
        }
      }
    }, this.config.heartbeatIntervalMs)
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Disconnect WebSocket transport
   */
  async disconnect(): Promise<void> {
    logger.info('WebSocketTransport: Disconnecting')

    this.stopHeartbeat()

    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Normal closure')
      this.ws = null
    }

    this.isConnected = false
    this.isHealthy = false
    this.emit('disconnected', {code: 1000, reason: 'Normal closure'})
  }

  /**
   * Check if transport is healthy
   */
  isTransportHealthy(): boolean {
    return this.isHealthy && this.isConnected
  }

  /**
   * Get transport quality score (0.0 to 1.0)
   */
  getQualityScore(): number {
    if (!this.isConnected) {
      return 0.0
    }

    if (!this.isHealthy) {
      return 0.2
    }

    // Calculate quality based on success rate and schema failures
    const successRate =
      this.metrics.connectionAttempts > 0
        ? this.metrics.successfulConnections / this.metrics.connectionAttempts
        : 0

    const schemaFailureRate =
      this.metrics.schemaFailures / Math.max(this.metrics.connectionAttempts, 1)

    return Math.max(0.0, Math.min(1.0, successRate * (1.0 - schemaFailureRate * 0.5)))
  }

  /**
   * Get transport metrics
   */
  getMetrics(): WebSocketTransportMetrics {
    return {...this.metrics}
  }

  /**
   * Reset transport state
   */
  async reset(): Promise<void> {
    logger.info('WebSocketTransport: Resetting transport state')

    await this.disconnect()

    // Reset counters but preserve metrics for analysis
    this.reconnectAttempts = 0
    this.currentSchemaVariant = 13
    this.schemaVariantFailures = 0
  }

  /**
   * Get transport type identifier
   */
  getTransportType(): string {
    return 'websocket'
  }
}

export default WebSocketTransport
