/**
 * Gemini Live API WebSocket Client
 * Handles real-time bidirectional communication with Google's Gemini Live API
 */

import {EventEmitter} from 'events'
import {
  GeminiMessageHandler,
  MessageType,
  MessagePriority,
  type ProcessedMessage
} from './gemini-message-handler'
import {GeminiErrorHandler, ErrorType, type GeminiError} from './gemini-error-handler'
import {logger} from './gemini-logger'
import {sanitizeLogMessage, safeLogger} from './log-sanitizer'
import ReconnectionManager, {
  ReconnectionStrategy,
  type ReconnectionConfig
} from './gemini-reconnection-manager'
import {WebSocketHeartbeatMonitor, HeartbeatStatus} from './websocket-heartbeat-monitor'
import {
  SessionManager,
  type SessionConfig,
  type SessionError,
  type ConversationTurn,
  type SessionStats
} from './gemini-session-manager'

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export interface GeminiLiveConfig {
  apiKey: string
  model?: string
  responseModalities?: string[]
  systemInstruction?: string
  reconnectAttempts?: number
  heartbeatInterval?: number
  connectionTimeout?: number
  reconnectionStrategy?: ReconnectionStrategy
  reconnectionConfig?: Partial<ReconnectionConfig>
  websocketBaseUrl?: string
  maxQueueSize?: number
}

export interface AudioData {
  data: string // Base64 encoded audio
  mimeType: string
}

export interface RealtimeInput {
  audio?: AudioData
  text?: string
}

export interface GeminiMessage {
  serverContent?: {
    turnComplete?: boolean
    modelTurn?: {
      parts?: Array<{
        text?: string
        inlineData?: {
          mimeType: string
          data: string
        }
      }>
    }
  }
  data?: string
}

export interface SetupMessage {
  setup: {
    model: string
    generationConfig: {
      responseModalities: string[]
    }
    sessionResumption: boolean
    systemInstruction?: {
      parts: Array<{text: string}>
    }
  }
}

/**
 * WebSocket Connection Management for Gemini Live API
 */
export class GeminiLiveWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: GeminiLiveConfig
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED
  private reconnectAttempts = 0
  private maxReconnectAttempts: number
  private heartbeatInterval: number
  private connectionTimeout: number
  private reconnectTimer: NodeJS.Timeout | null = null
  private messageQueue: RealtimeInput[] = []
  private maxQueueSize: number
  private isClosingIntentionally = false
  private messageHandler: GeminiMessageHandler
  private errorHandler: GeminiErrorHandler
  private reconnectionManager: ReconnectionManager
  private heartbeatMonitor: WebSocketHeartbeatMonitor
  private sessionManager: SessionManager | null = null

  constructor(config: GeminiLiveConfig) {
    super()
    this.config = {
      model: 'gemini-live-2.5-flash-preview', // Updated to use the correct model for Live API
      responseModalities: ['TEXT', 'AUDIO'], // Support both text and audio responses
      systemInstruction: 'You are a helpful assistant and answer in a friendly tone.',
      reconnectAttempts: 5,
      heartbeatInterval: 30000, // 30 seconds
      connectionTimeout: 10000, // 10 seconds
      maxQueueSize: 100, // Limit message queue size to prevent memory issues
      ...config
    }
    this.maxReconnectAttempts = this.config.reconnectAttempts!
    this.heartbeatInterval = this.config.heartbeatInterval!
    this.connectionTimeout = this.config.connectionTimeout!
    this.maxQueueSize = this.config.maxQueueSize!

    // Initialize message handler
    this.messageHandler = new GeminiMessageHandler()
    this.setupMessageHandlerEvents()

    // Initialize error handler
    this.errorHandler = new GeminiErrorHandler({
      maxErrorHistory: 100,
      logLevel: process.env.NODE_ENV === 'development' ? 4 : 2 // DEBUG in dev, INFO in prod
    })
    this.setupErrorHandlerEvents()

    // Initialize reconnection manager
    this.reconnectionManager = new ReconnectionManager(
      {
        maxAttempts: this.maxReconnectAttempts,
        strategy: this.config.reconnectionStrategy || ReconnectionStrategy.EXPONENTIAL,
        baseDelay: 1000,
        maxDelay: 30000,
        jitterEnabled: true,
        jitterRange: 0.1,
        qualityThreshold: 0.8,
        unstableConnectionThreshold: 3,
        backoffMultiplier: 2,
        ...this.config.reconnectionConfig
      },
      this.errorHandler
    )
    this.setupReconnectionManagerEvents()

    // Initialize heartbeat monitor
    this.heartbeatMonitor = new WebSocketHeartbeatMonitor({
      interval: this.heartbeatInterval,
      timeout: 5000, // 5 second pong timeout
      maxMissedBeats: 3,
      useNativePing: false, // Gemini Live uses application-level heartbeat
      enableMetrics: true,
      customPingMessage: {ping: true}
    })
    this.setupHeartbeatMonitorEvents()

    // Initialize session manager
    this.initializeSessionManager()

    logger.info('GeminiLiveWebSocketClient initialized', {
      model: this.config.model,
      heartbeatInterval: this.heartbeatInterval,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectionStrategy: this.config.reconnectionStrategy || ReconnectionStrategy.EXPONENTIAL
    })
  }

  /**
   * Initialize the session manager with proper configuration
   */
  private initializeSessionManager(): void {
    const sessionConfig: SessionConfig = {
      model: this.config.model || 'gemini-live-2.5-flash-preview',
      systemInstruction:
        this.config.systemInstruction ||
        'You are a helpful assistant and answer in a friendly tone.',
      responseModalities: this.config.responseModalities || ['TEXT', 'AUDIO'],
      resumptionEnabled: true,
      sessionTimeout: 300000, // 5 minutes
      maxConversationHistory: 100,
      generateSessionId: true,
      audioSettings: {
        sampleRate: 24000,
        encoding: 'pcm16',
        channels: 1,
        bitDepth: 16,
        enableVAD: true,
        silenceThreshold: 0.5
      }
    }

    this.sessionManager = new SessionManager(sessionConfig, this.errorHandler)
    this.setupSessionManagerEvents()

    logger.info('Session manager initialized', {
      model: sessionConfig.model,
      hasSystemInstruction: !!sessionConfig.systemInstruction,
      responseModalities: sessionConfig.responseModalities
    })
  }

  /**
   * Set up event handlers for the session manager
   */
  private setupSessionManagerEvents(): void {
    if (!this.sessionManager) return

    this.sessionManager.on('sessionCreated', (sessionId: string) => {
      logger.info('Session created', {sessionId})
      this.emit('sessionCreated', sessionId)
    })

    this.sessionManager.on('sessionResumed', (sessionId: string) => {
      logger.info('Session resumed', {sessionId})
      this.emit('sessionResumed', sessionId)
    })

    this.sessionManager.on('sessionTerminated', (sessionId: string) => {
      logger.info('Session terminated', {sessionId})
      this.emit('sessionTerminated', sessionId)
    })

    this.sessionManager.on('sessionError', (error: SessionError) => {
      logger.error('Session error occurred', {error: error.message})
      this.emit('sessionError', error)
    })

    this.sessionManager.on('conversationTurnAdded', (turn: ConversationTurn) => {
      logger.debug('Conversation turn added', {turnId: turn.id, role: turn.role})
      this.emit('conversationTurnAdded', turn)
    })
  }

  /**
   * Establish WebSocket connection to Gemini Live API
   */
  async connect(): Promise<void> {
    if (
      this.connectionState === ConnectionState.CONNECTED ||
      this.connectionState === ConnectionState.CONNECTING
    ) {
      safeLogger.log('Already connected or connecting')
      return
    }

    this.setConnectionState(ConnectionState.CONNECTING)
    this.isClosingIntentionally = false

    try {
      // Construct WebSocket URL for Gemini Live API
      const wsUrl = this.buildWebSocketUrl()

      safeLogger.log('Connecting to Gemini Live API')

      this.ws = new WebSocket(wsUrl)

      // Set up connection timeout
      const timeoutId = setTimeout(() => {
        if (this.connectionState === ConnectionState.CONNECTING) {
          const timeoutError = this.errorHandler.handleError(
            new Error('Connection timeout'),
            {timeout: this.connectionTimeout},
            {type: ErrorType.TIMEOUT, retryable: true}
          )
          this.handleConnectionError(timeoutError)
        }
      }, this.connectionTimeout)

      if (this.ws) {
        this.ws.onopen = async () => {
          clearTimeout(timeoutId)
          logger.info('WebSocket connected to Gemini Live API', {
            connectionState: this.connectionState,
            attempts: this.reconnectAttempts,
            model: this.config.model
          })
          this.setConnectionState(ConnectionState.CONNECTED)
          this.reconnectAttempts = 0

          // Handle session resumption or new session creation
          if (this.sessionManager?.needsResumption()) {
            await this.handleSessionResumption()
          } else {
            // Send setup message to configure the model and session
            await this.sendSetupMessage()
          }

          this.startHeartbeat()
          this.processMessageQueue()

          // Notify reconnection manager of successful connection
          this.reconnectionManager.onConnectionEstablished()

          this.emit('connected')
        }

        this.ws.onmessage = event => {
          this.handleMessage(event)
        }

        this.ws.onerror = () => {
          clearTimeout(timeoutId)
          // Use generic error message to prevent log injection
          safeLogger.error('WebSocket error occurred')
          this.handleConnectionError(new Error('WebSocket connection error'))
        }

        this.ws.onclose = event => {
          clearTimeout(timeoutId)
          logger.info('WebSocket connection closed', {
            code: event.code,
            reason: sanitizeLogMessage(event.reason),
            wasClean: event.wasClean,
            intentional: this.isClosingIntentionally
          })
          this.handleConnectionClose(event)
        }
      }
    } catch (error) {
      logger.error('Failed to establish WebSocket connection', {
        error: error instanceof Error ? sanitizeLogMessage(error.message) : 'Unknown error',
        config: {
          model: this.config.model,
          reconnectAttempts: this.reconnectAttempts
        }
      })
      this.handleConnectionError(error as Error)
    }
  }

  /**
   * Handle session resumption after reconnection
   */
  private async handleSessionResumption(): Promise<void> {
    if (!this.sessionManager) {
      logger.error('Cannot handle session resumption: Session manager not available')
      return
    }

    try {
      const resumptionStatus = this.sessionManager.getResumptionStatus()

      if (!resumptionStatus.canResume) {
        logger.warn('Session resumption not possible, creating new session', {
          reason: resumptionStatus.reason
        })
        await this.sendSetupMessage()
        return
      }

      logger.info('Attempting session resumption', {
        sessionId: this.sessionManager.getSessionId(),
        reconnectionAttempts: resumptionStatus.context?.reconnectionAttempts || 0
      })

      const result = await this.sessionManager.resumeSessionWithContext()

      if (result.success) {
        // Generate setup message for resumed session
        const setupMessage = this.sessionManager.getSetupMessage()

        if (setupMessage && this.ws) {
          const messageString = JSON.stringify(setupMessage)
          this.ws.send(messageString)

          logger.info('Setup message sent for resumed session', {
            sessionId: result.sessionId,
            contextRestored: result.contextRestored
          })

          this.emit('setupMessageSent', setupMessage)
          this.emit('sessionResumed', result.sessionId)
        }
      } else {
        logger.error('Session resumption failed, creating new session', {
          error: result.error?.message,
          sessionId: result.sessionId
        })

        if (this.sessionManager) {
          const errorToHandle = result.error
            ? new Error(result.error.message)
            : new Error('Resumption failed')

          await this.sessionManager.handleResumptionFailure(errorToHandle, true)
        }

        // Fall back to creating new session
        await this.sendSetupMessage()
      }
    } catch (error) {
      logger.error('Exception during session resumption', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      if (this.sessionManager) {
        await this.sessionManager.handleResumptionFailure(
          error instanceof Error ? error : new Error('Unknown resumption error'),
          false
        )
      }

      // Fall back to creating new session
      await this.sendSetupMessage()
    }
  }

  /**
   * Build WebSocket URL for Gemini Live API
   */
  private buildWebSocketUrl(): string {
    const baseUrl =
      this.config.websocketBaseUrl ||
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'
    const params = new URLSearchParams({
      key: this.config.apiKey
    })
    return `${baseUrl}?${params.toString()}`
  }

  /**
   * Send realtime input (audio or text) to the API
   */
  async sendRealtimeInput(input: RealtimeInput): Promise<void> {
    if (this.connectionState !== ConnectionState.CONNECTED) {
      logger.debug('Connection not ready, queueing message', {
        connectionState: this.connectionState,
        queueSize: this.messageQueue.length
      })

      // Implement queue size limit to prevent memory issues
      if (this.messageQueue.length >= this.maxQueueSize) {
        logger.warn('Message queue full, dropping oldest message', {
          queueSize: this.messageQueue.length,
          maxQueueSize: this.maxQueueSize
        })
        this.messageQueue.shift() // Remove oldest message
      }

      this.messageQueue.push(input)
      return
    }

    if (!this.ws) {
      const error = this.errorHandler.handleError(
        new Error('WebSocket not initialized'),
        {connectionState: this.connectionState},
        {type: ErrorType.WEBSOCKET, retryable: false}
      )
      throw error
    }

    try {
      // For now, send directly but also process through message handler for validation
      const message = JSON.stringify({
        client_content: {
          turns: [
            {
              role: 'user',
              parts: this.buildMessageParts(input)
            }
          ],
          turn_complete: true
        }
      })

      logger.debug('Sending message to Gemini Live API', {
        messageLength: message.length,
        messagePreview: sanitizeLogMessage(message.substring(0, 200)),
        inputType: input.audio ? 'audio' : 'text'
      })

      this.ws.send(message)
      this.emit('messageSent', input)

      // Also queue through message handler for future integration
      this.messageHandler.queueMessage(input, MessageType.CLIENT_CONTENT, MessagePriority.HIGH)
    } catch (error) {
      const geminiError = this.errorHandler.handleError(
        error,
        {
          input: {
            hasAudio: !!input.audio,
            hasText: !!input.text,
            textLength: input.text?.length
          }
        },
        {
          type: ErrorType.API,
          retryable: true
        }
      )
      logger.error('Failed to send realtime input', {
        errorId: geminiError.id,
        message: geminiError.message
      })
      throw geminiError
    }
  }

  /**
   * Build message parts from realtime input
   */
  private buildMessageParts(input: RealtimeInput): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = []

    if (input.text) {
      parts.push({text: input.text})
    }

    if (input.audio) {
      parts.push({
        inline_data: {
          mime_type: input.audio.mimeType,
          data: input.audio.data
        }
      })
    }

    return parts
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Validate that we have string data before parsing
      if (typeof event.data !== 'string') {
        throw new Error('Received non-string message data')
      }

      // Parse the raw message first with additional safety
      const rawMessage = JSON.parse(event.data as string)

      // Check if heartbeat monitor can handle this message
      if (this.heartbeatMonitor.handleMessage(rawMessage)) {
        // Message was handled by heartbeat monitor (pong response)
        logger.debug('Message handled by heartbeat monitor')
        return
      }

      // Use message handler to process incoming message
      const processed = this.messageHandler.processIncomingMessage(event.data)

      logger.debug('Received WebSocket message', {
        messageType: processed.type,
        isValid: processed.isValid,
        messageId: processed.metadata.id,
        errors: processed.errors
      })

      // Emit the processed message for subscribers
      this.emit('message', processed)

      // If the message is valid, emit specific events based on type
      if (processed.isValid) {
        switch (processed.type) {
          case MessageType.SERVER_CONTENT:
            this.emit('serverContent', processed.payload)
            break
          case MessageType.MODEL_TURN:
            this.emit('modelTurn', processed.payload)
            break
          case MessageType.TURN_COMPLETE:
            this.emit('turnComplete', processed.payload)
            break
          case MessageType.AUDIO_DATA:
            this.emit('audioData', processed.payload)
            break
          case MessageType.PONG:
            this.emit('pong', processed.payload)
            break
          case MessageType.SETUP_COMPLETE:
            this.emit('setupComplete', processed.payload)
            this.handleSetupComplete(processed.payload).catch(error => {
              logger.error('Failed to handle setup completion', {error: error.message})
            })
            break
          case MessageType.ERROR:
            this.emit('apiError', processed.payload)
            break
        }
      } else {
        safeLogger.warn('Invalid message received', processed.errors)
        this.emit('invalidMessage', processed)
      }
    } catch (error) {
      safeLogger.error(
        'Failed to process message',
        error instanceof Error ? error.message : 'Unknown error'
      )
      this.emit('error', error)
    }
  }

  /**
   * Process queued messages when connection is established
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      if (message) {
        this.sendRealtimeInput(message)
      }
    }
  }

  /**
   * Setup heartbeat monitor event listeners
   */
  private setupHeartbeatMonitorEvents(): void {
    this.heartbeatMonitor.on('unhealthy', event => {
      logger.warn('Heartbeat monitor detected unhealthy connection', {
        consecutiveMissed: event.consecutiveMissed,
        reason: event.reason
      })

      // Trigger reconnection through reconnection manager
      const error = this.errorHandler.handleError(
        new Error('Heartbeat monitoring detected unhealthy connection'),
        {consecutiveMissed: event.consecutiveMissed},
        {type: ErrorType.NETWORK, retryable: true}
      )
      this.handleConnectionError(error)
    })

    this.heartbeatMonitor.on('failed', event => {
      logger.error('Heartbeat monitor failed', {
        reason: event.reason,
        error: event.error
      })

      // Treat as connection failure
      const error = this.errorHandler.handleError(
        new Error(`Heartbeat monitor failed: ${event.reason}`),
        {originalError: event.error},
        {type: ErrorType.NETWORK, retryable: true}
      )
      this.handleConnectionError(error)
    })

    this.heartbeatMonitor.on('health_changed', event => {
      logger.debug('Connection health changed', {
        healthScore: event.healthScore,
        consecutiveMissed: event.consecutiveMissed
      })

      // Emit health status for UI updates
      this.emit('health_changed', {
        healthScore: event.healthScore,
        isHealthy: this.heartbeatMonitor.isHealthy(),
        metrics: this.heartbeatMonitor.getMetrics()
      })
    })

    this.heartbeatMonitor.on('pong_received', () => {
      // Update reconnection manager - heartbeat successful indicates healthy connection
      // (ReconnectionManager doesn't have onConnectionHealthy, so we just log)
      logger.debug('Heartbeat pong received - connection healthy')
    })
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.ws) {
      this.heartbeatMonitor.start(this.ws)
      logger.debug('Heartbeat monitoring started')
    }
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    this.heartbeatMonitor.stop()
    logger.debug('Heartbeat monitoring stopped')
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error | GeminiError): void {
    let geminiError: GeminiError

    if ('id' in error && 'type' in error) {
      // Already a GeminiError
      geminiError = error as GeminiError
    } else {
      // Convert Error to GeminiError
      geminiError = this.errorHandler.handleError(
        error,
        {
          connectionState: this.connectionState,
          reconnectAttempts: this.reconnectAttempts
        },
        {
          type: ErrorType.NETWORK,
          retryable: true
        }
      )
    }

    logger.error('Connection error occurred', {
      errorId: geminiError.id,
      type: geminiError.type,
      message: geminiError.message,
      retryable: geminiError.retryable,
      connectionState: this.connectionState
    })

    this.setConnectionState(ConnectionState.ERROR)
    this.stopHeartbeat()
    this.emit('error', geminiError)

    if (!this.isClosingIntentionally && geminiError.retryable) {
      // Let reconnection manager decide if we should reconnect
      const shouldReconnect = this.reconnectionManager.onConnectionLost(
        `Error: ${geminiError.message}`
      )

      if (shouldReconnect) {
        this.setConnectionState(ConnectionState.RECONNECTING)
        this.reconnectionManager.startReconnection(() => this.connect())
      }
    }
  }

  /**
   * Handle connection close events
   */
  private handleConnectionClose(event: CloseEvent): void {
    this.setConnectionState(ConnectionState.DISCONNECTED)
    this.stopHeartbeat()
    this.emit('disconnected', event)

    // Handle session disconnection if session manager is available
    if (this.sessionManager && !this.isClosingIntentionally) {
      const reason = `WebSocket closed: ${event.code} - ${event.reason}`
      const resumptionContext = this.sessionManager.handleUnexpectedDisconnection(reason)

      logger.info('Session prepared for resumption after disconnection', {
        sessionId: this.sessionManager.getSessionId(),
        reason,
        canResume: this.sessionManager.needsResumption(),
        reconnectionAttempts: resumptionContext.reconnectionAttempts
      })
    }

    if (!this.isClosingIntentionally) {
      // Let reconnection manager decide if we should reconnect
      const shouldReconnect = this.reconnectionManager.onConnectionLost(
        `WebSocket closed: ${event.code} - ${event.reason}`
      )

      if (shouldReconnect) {
        this.setConnectionState(ConnectionState.RECONNECTING)
        this.reconnectionManager.startReconnection(() => this.connect())
      }
    }
  }

  /**
   * Set up reconnection manager event listeners
   */
  private setupReconnectionManagerEvents(): void {
    this.reconnectionManager.on('connectionEstablished', data => {
      logger.info('Reconnection manager: connection established', data)
      this.emit('connectionQualityUpdate', data.metrics.connectionQuality)
    })

    this.reconnectionManager.on('connectionLost', data => {
      logger.warn('Reconnection manager: connection lost', {
        reason: data.reason,
        shouldReconnect: data.shouldReconnect
      })
      this.emit('connectionQualityUpdate', data.metrics.connectionQuality)
    })

    this.reconnectionManager.on('reconnectionStarted', data => {
      logger.info('Reconnection manager: reconnection started', {
        attempt: data.attempt,
        delay: data.delay
      })
      this.emit('reconnectionStarted', data)
    })

    this.reconnectionManager.on('reconnectionAttempt', data => {
      logger.info('Reconnection manager: attempting reconnection', {
        attempt: data.attempt
      })
      this.emit('reconnectionAttempt', data)
    })

    this.reconnectionManager.on('reconnectionFailed', data => {
      logger.warn('Reconnection manager: reconnection failed', {
        attempt: data.attempt,
        error: data.error.message
      })
      this.emit('reconnectionFailed', data)
    })

    this.reconnectionManager.on('maxAttemptsReached', data => {
      logger.error('Reconnection manager: maximum attempts reached', {
        attempts: data.attempts,
        totalTime: data.totalTime
      })
      this.emit('maxReconnectAttemptsReached', data)
    })

    this.reconnectionManager.on('countdownUpdate', data => {
      this.emit('reconnectionCountdown', data)
    })

    this.reconnectionManager.on('reconnectionStopped', () => {
      logger.info('Reconnection manager: reconnection stopped')
      this.emit('reconnectionStopped')
    })
  }

  /**
   * Set connection state and emit state change event
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const previousState = this.connectionState
      this.connectionState = state
      safeLogger.log(
        'Connection state changed',
        `${sanitizeLogMessage(previousState)} -> ${sanitizeLogMessage(state)}`
      )
      this.emit('stateChange', state, previousState)
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  /**
   * Check if connection is active
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED
  }

  /**
   * Gracefully close the WebSocket connection
   */
  async disconnect(): Promise<void> {
    logger.info('Closing WebSocket connection', {
      currentState: this.connectionState,
      intentional: true
    })

    this.isClosingIntentionally = true

    // Stop reconnection manager
    this.reconnectionManager.stopReconnection()

    // Clear timers
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Client disconnect')
    }

    this.setConnectionState(ConnectionState.DISCONNECTED)
    this.emit('closed')
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return this.errorHandler.getStats()
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit?: number) {
    return this.errorHandler.getRecentErrors(limit)
  }

  /**
   * Get connection metrics from reconnection manager
   */
  getConnectionMetrics() {
    return this.reconnectionManager.getMetrics()
  }

  /**
   * Get reconnection state
   */
  getReconnectionState() {
    return this.reconnectionManager.getState()
  }

  /**
   * Get connection history
   */
  getConnectionHistory() {
    return this.reconnectionManager.getConnectionHistory()
  }

  /**
   * Update reconnection configuration
   */
  updateReconnectionConfig(config: Partial<ReconnectionConfig>) {
    this.reconnectionManager.updateConfig(config)
  }

  /**
   * Reset connection metrics and history
   */
  resetConnectionMetrics() {
    this.reconnectionManager.reset()
  }

  /**
   * Get heartbeat monitor status
   */
  getHeartbeatStatus(): HeartbeatStatus {
    return this.heartbeatMonitor.getStatus()
  }

  /**
   * Get heartbeat metrics
   */
  getHeartbeatMetrics() {
    return this.heartbeatMonitor.getMetrics()
  }

  /**
   * Check if connection is healthy according to heartbeat monitor
   */
  isConnectionHealthy(): boolean {
    return this.heartbeatMonitor.isHealthy()
  }

  /**
   * Update heartbeat monitor configuration
   */
  updateHeartbeatConfig(config: Parameters<typeof this.heartbeatMonitor.updateConfig>[0]) {
    this.heartbeatMonitor.updateConfig(config)
  }

  /**
   * Cleanup and destroy all resources
   */
  async destroy(): Promise<void> {
    logger.info('Destroying GeminiLiveWebSocketClient')

    // Disconnect if connected
    if (this.isConnected()) {
      await this.disconnect()
    }

    // Cleanup handlers
    this.messageHandler.destroy()
    this.errorHandler.destroy()
    this.reconnectionManager.destroy()
    this.heartbeatMonitor.stop()

    // Clear message queue
    this.messageQueue.length = 0

    // Remove all listeners
    this.removeAllListeners()

    logger.info('GeminiLiveWebSocketClient destroyed')
  }

  /**
   * Set up message handler event listeners
   */
  private setupMessageHandlerEvents(): void {
    this.messageHandler.on('message:processed', (processed: ProcessedMessage) => {
      this.emit('transcription', processed)
    })

    this.messageHandler.on('message:error', (error: Error) => {
      this.emit('error', error)
    })

    this.messageHandler.on('message:sent', (messageId: string) => {
      this.emit('messageSent', messageId)
    })
  }

  /**
   * Set up error handler event listeners
   */
  private setupErrorHandlerEvents(): void {
    this.errorHandler.on('error', (error: GeminiError) => {
      logger.error('WebSocket error occurred', {
        errorId: error.id,
        type: error.type,
        message: error.message,
        retryable: error.retryable
      })
      this.emit('error', error)
    })

    this.errorHandler.on('error:network', (error: GeminiError) => {
      logger.warn('Network error detected, may trigger reconnection', {
        errorId: error.id,
        message: error.message
      })
      this.emit('networkError', error)
    })

    this.errorHandler.on('error:websocket', (error: GeminiError) => {
      logger.error('WebSocket-specific error', {
        errorId: error.id,
        message: error.message
      })
      this.emit('websocketError', error)
    })
  }

  /**
   * Handle setup completion from the server
   */
  private async handleSetupComplete(_payload: unknown): Promise<void> {
    if (!this.sessionManager) {
      logger.warn('Setup complete received but session manager not available')
      return
    }

    try {
      // Configure the session as active since setup is complete
      const configSuccess = await this.sessionManager.configureSession({})

      if (!configSuccess) {
        logger.warn('Session configuration was not successful')
        return
      }

      // Clear any resumption context since session is now properly active
      this.sessionManager.clearResumptionContext()

      logger.info('Session setup completed and configured', {
        sessionId: this.sessionManager.getSessionId(),
        sessionState: this.sessionManager.getSessionState()
      })

      this.emit('sessionConfigured', {
        sessionId: this.sessionManager.getSessionId(),
        state: this.sessionManager.getSessionState()
      })
    } catch (error) {
      logger.error('Failed to configure session after setup completion', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      const sessionError = this.errorHandler.handleError(
        error,
        {context: 'setup_completion'},
        {type: ErrorType.API, retryable: false}
      )

      this.emit('sessionError', sessionError)
    }
  }

  /**
   * Send the setup message required by the Gemini Live API
   * This configures the model and response modalities using the SessionManager
   */
  private async sendSetupMessage(): Promise<void> {
    if (!this.ws || this.connectionState !== ConnectionState.CONNECTED) {
      logger.warn('Cannot send setup message: WebSocket not connected')
      return
    }

    if (!this.sessionManager) {
      logger.error('Cannot send setup message: Session manager not initialized')
      return
    }

    try {
      // Create a new session using the SessionManager
      const sessionResult = await this.sessionManager.createSession()

      if (!sessionResult.success) {
        logger.error('Failed to create session', {
          error: sessionResult.error?.message,
          errorId: sessionResult.error?.id
        })
        this.emit('sessionCreationFailed', sessionResult.error)
        return
      }

      // Generate the setup message through SessionManager
      const setupMessage = this.sessionManager.getSetupMessage()

      if (!setupMessage) {
        logger.error('Failed to generate setup message')
        return
      }

      const messageString = JSON.stringify(setupMessage)
      this.ws.send(messageString)

      logger.info('Setup message sent to Gemini Live API', {
        sessionId: sessionResult.sessionId,
        model: this.config.model,
        responseModalities: this.config.responseModalities,
        hasSystemInstruction: !!this.config.systemInstruction
      })

      this.emit('setupMessageSent', setupMessage)
      this.emit('sessionCreated', sessionResult.sessionId)
    } catch (error) {
      const geminiError = this.errorHandler.handleError(
        error,
        {setupMessageContext: 'session_creation'},
        {type: ErrorType.API, retryable: true}
      )

      logger.error('Failed to send setup message with session management', {
        error: geminiError.message,
        errorId: geminiError.id
      })

      this.emit('sessionCreationFailed', geminiError)
      this.emit('error', geminiError)
    }
  }

  /**
   * Get the current session ID if a session is active
   */
  public getSessionId(): string | null {
    return this.sessionManager?.getSessionId() || null
  }

  /**
   * Get the current session state
   */
  public getSessionState(): string | null {
    return this.sessionManager?.getSessionState() || null
  }

  /**
   * Resume a previous session by ID
   */
  public async resumeSession(sessionId: string): Promise<boolean> {
    if (!this.sessionManager) {
      logger.error('Cannot resume session: Session manager not initialized')
      return false
    }

    try {
      const result = await this.sessionManager.resumeSession(sessionId)
      return result.success
    } catch (error) {
      logger.error('Failed to resume session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Terminate the current session
   */
  public async terminateSession(): Promise<boolean> {
    if (!this.sessionManager) {
      logger.warn('Cannot terminate session: Session manager not initialized')
      return false
    }

    try {
      return await this.sessionManager.terminateSession()
    } catch (error) {
      logger.error('Failed to terminate session', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Get session statistics
   */
  public getSessionStats(): SessionStats | null {
    return this.sessionManager?.getSessionStats() || null
  }

  /**
   * Check if session manager is available
   */
  public hasSessionManager(): boolean {
    return this.sessionManager !== null
  }

  /**
   * Validate session integrity and health
   */
  public async validateSessionHealth(): Promise<{
    isHealthy: boolean
    issues: string[]
    canResume: boolean
  }> {
    const issues: string[] = []

    // Check WebSocket connection
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      issues.push('WebSocket connection not open')
    }

    // Check session manager
    if (!this.sessionManager) {
      issues.push('Session manager not initialized')
      return {isHealthy: false, issues, canResume: false}
    }

    // Check session state
    const sessionState = this.sessionManager.getSessionState()
    if (!sessionState || sessionState === 'terminated') {
      issues.push('No active session or session terminated')
    }

    // Check for resumption needs
    const needsResumption = this.sessionManager.needsResumption()
    if (needsResumption) {
      issues.push('Session requires resumption')
    }

    // Check connection stability from stats
    const stats = this.sessionManager.getSessionStats()
    if (stats && stats.resumptionCount > 3) {
      issues.push('High resumption count indicates connection instability')
    }

    const isHealthy = issues.length === 0
    const canResume = needsResumption // Use needsResumption as indicator for resumability

    return {isHealthy, issues, canResume}
  }

  /**
   * Get comprehensive session diagnostics
   */
  public getSessionDiagnostics(): {
    connectionState: string
    sessionState: string | null
    sessionId: string | null
    needsResumption: boolean
    canResume: boolean
    lastActivity: Date | null
    errorCount: number
    stats: SessionStats | null
  } {
    const stats = this.sessionManager?.getSessionStats() || null
    const needsResumption = this.sessionManager?.needsResumption() || false

    return {
      connectionState: this.ws
        ? ['connecting', 'open', 'closing', 'closed'][this.ws.readyState] || 'unknown'
        : 'no_connection',
      sessionState: this.sessionManager?.getSessionState() || null,
      sessionId: this.sessionManager?.getSessionId() || null,
      needsResumption,
      canResume: needsResumption, // Use needsResumption as indicator
      lastActivity: stats?.lastActivityTime || null,
      errorCount: stats?.errorCount || 0,
      stats
    }
  }

  /**
   * Force session cleanup and reset
   */
  public async forceSessionReset(): Promise<void> {
    logger.info('Forcing session reset and cleanup')

    try {
      // Terminate current session if exists
      if (this.sessionManager) {
        await this.sessionManager.terminateSession()
      }

      // Close WebSocket connection
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Force reset')
      }

      // Clear any pending timers or intervals
      this.clearConnectionHandlers()

      // Emit reset event
      this.emit('sessionReset')

      logger.info('Session reset completed successfully')
    } catch (error) {
      logger.error('Error during forced session reset', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Clear connection handlers and cleanup resources
   */
  private clearConnectionHandlers(): void {
    // Clear any reconnection timers if they exist
    // Note: Specific timer cleanup would depend on implementation details
    // This is a placeholder for cleanup logic
  }
}

// Default export for easy importing
export default GeminiLiveWebSocketClient
