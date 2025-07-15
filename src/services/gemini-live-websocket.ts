/**
 * Gemini Live API WebSocket Client
 * Handles real-time bidirectional communication with Google's Gemini Live API
 */

import EventEmitter from 'eventemitter3'
import {GeminiMessageHandler, MessageType, MessagePriority} from './gemini-message-handler'
import {GeminiErrorHandler, ErrorType, type GeminiError} from './gemini-error-handler'
import {logger} from './gemini-logger'
import {sanitizeLogMessage, safeLogger} from './log-sanitizer'
import ReconnectionManager, {
  ReconnectionStrategy,
  type ReconnectionConfig
} from './gemini-reconnection-manager'
import {WebSocketHeartbeatMonitor, HeartbeatStatus} from './websocket-heartbeat-monitor'
import GeminiSessionManager, {type SessionData} from './gemini-session-manager'

// Model configuration constants
export const GEMINI_LIVE_MODEL = 'gemini-live-2.5-flash-preview'
// Default API version for Gemini Live API (use config.apiVersion to override)
export const GEMINI_LIVE_API_VERSION = 'v1beta'

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export enum ResponseModality {
  TEXT = 'TEXT',
  AUDIO = 'AUDIO'
}

// Server error interface for proper typing
interface ServerErrorData {
  code?: string | number
  message?: string
  details?: unknown
  type?: string
}

// Enhanced data models for gemini-live-2.5-flash-preview responses
export interface ParsedGeminiResponse {
  type:
    | 'text'
    | 'audio'
    | 'tool_call'
    | 'error'
    | 'setup_complete'
    | 'turn_complete'
    | 'tool_call_cancellation'
    | 'go_away'
    | 'session_resumption_update'
  content: string | ArrayBuffer | null
  metadata: {
    messageId?: string
    timestamp: number
    confidence?: number
    isPartial?: boolean
    modelTurn?: boolean
    inputTranscription?: boolean
    turnId?: string
    // v1beta specific metadata
    toolCallIds?: string[]
    timeLeft?: {
      seconds: number
      nanos: number
    }
    sessionHandle?: string
    resumable?: boolean
  }
  toolCall?: {
    name: string
    parameters: Record<string, unknown>
    id: string
  }
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  // v1beta specific response types
  toolCallCancellation?: {
    ids: string[]
  }
  goAway?: {
    timeLeft?: {
      seconds: number
      nanos: number
    }
  }
  sessionResumptionUpdate?: {
    newHandle: string
    resumable: boolean
  }
}

export interface AudioResponseData {
  data: string // Base64 encoded audio
  format: string
  sampleRate?: number
  channels?: number
}

export interface TextResponseData {
  text: string
  isPartial?: boolean
  partIndex?: number
  totalParts?: number
}

export interface ToolCallResponseData {
  functionCall: {
    name: string
    args: Record<string, unknown>
  }
  id: string
}

export interface TurnCompleteData {
  turnId?: string
  modelTurn?: boolean
  inputTokens?: number
  outputTokens?: number
}

export interface GeminiLiveConfig {
  apiKey: string
  model?: string
  responseModalities?: ResponseModality[]
  systemInstruction?: string
  reconnectAttempts?: number
  heartbeatInterval?: number
  connectionTimeout?: number
  reconnectionStrategy?: ReconnectionStrategy
  reconnectionConfig?: Partial<ReconnectionConfig>
  websocketBaseUrl?: string
  maxQueueSize?: number
  apiVersion?: string // API version to use (defaults to 'v1beta')
  // Generation configuration options for fine-tuning responses
  generationConfig?: {
    candidateCount?: number
    maxOutputTokens?: number
    temperature?: number
    topP?: number
    topK?: number
    presencePenalty?: number
    frequencyPenalty?: number
  }
}

export interface AudioData {
  data: string // Base64 encoded audio
  mimeType: string
}

export interface RealtimeInput {
  audio?: AudioData
  text?: string
  audioStreamEnd?: boolean
}

// Enhanced message queue system for reliability
export interface QueuedMessage {
  id: string
  input: RealtimeInput
  timestamp: number
  retryCount: number
  maxRetries: number
  priority: QueuePriority
  timeout: number
  resolve?: (value?: void) => void
  reject?: (error: Error) => void
}

export interface MessageSendOptions {
  priority?: QueuePriority
  maxRetries?: number
  timeout?: number
  expectResponse?: boolean
}

// Message priorities for queue management
export enum QueuePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
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
    generationConfig?: {
      candidateCount?: number
      maxOutputTokens?: number
      temperature?: number
      topP?: number
      topK?: number
      presencePenalty?: number
      frequencyPenalty?: number
      responseModalities?: ResponseModality[]
      speechConfig?: {
        voiceConfig?: {
          prebuiltVoiceConfig?: {
            voiceName?: string
          }
        }
      }
      mediaResolution?: object
    }
    systemInstruction?: {
      parts: Array<{
        text: string
      }>
    }
    tools?: Array<object>
  }
}

export interface GeminiLiveApiResponse {
  text?: string
  // Other potential fields based on Gemini Live API documentation
}

/**
 * Enhanced message parser for gemini-live-2.5-flash-preview model
 * Handles various response formats including text, audio, and tool calls
 */
export class Gemini2FlashMessageParser {
  /**
   * Parse a raw message from the Gemini Live API
   */
  static parseResponse(rawMessage: unknown): ParsedGeminiResponse {
    const timestamp = Date.now()

    // Handle string messages (likely JSON)
    if (typeof rawMessage === 'string') {
      try {
        return this.parseResponse(JSON.parse(rawMessage))
      } catch {
        return {
          type: 'error',
          content: null,
          metadata: {timestamp},
          error: {
            code: 'PARSE_ERROR',
            message: 'Failed to parse JSON message',
            details: {originalMessage: rawMessage}
          }
        }
      }
    }

    // Handle non-object messages
    if (!rawMessage || typeof rawMessage !== 'object') {
      return {
        type: 'error',
        content: null,
        metadata: {timestamp},
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Message must be a valid object',
          details: {receivedType: typeof rawMessage}
        }
      }
    }

    const message = rawMessage as Record<string, unknown>

    // Handle server content (text responses)
    if (message.serverContent && typeof message.serverContent === 'object') {
      return this.parseServerContent(message.serverContent as Record<string, unknown>, timestamp)
    }

    // Handle model turn responses
    if (message.modelTurn && typeof message.modelTurn === 'object') {
      return this.parseModelTurn(message.modelTurn as Record<string, unknown>, timestamp)
    }

    // Handle audio data responses
    if (message.realtimeInput && typeof message.realtimeInput === 'object') {
      return this.parseRealtimeInput(message.realtimeInput as Record<string, unknown>, timestamp)
    }

    // Handle turn complete responses
    if (message.turnComplete !== undefined) {
      return this.parseTurnComplete(message.turnComplete, timestamp)
    }

    // Handle setup complete responses
    if (message.setupComplete && typeof message.setupComplete === 'object') {
      return this.parseSetupComplete(message.setupComplete as Record<string, unknown>, timestamp)
    }

    // Handle tool call responses
    if (message.toolCall && typeof message.toolCall === 'object') {
      return this.parseToolCall(message.toolCall as Record<string, unknown>, timestamp)
    }

    // Handle tool call cancellation responses (v1beta)
    if (message.toolCallCancellation && typeof message.toolCallCancellation === 'object') {
      return this.parseToolCallCancellation(
        message.toolCallCancellation as Record<string, unknown>,
        timestamp
      )
    }

    // Handle go away responses (v1beta)
    if (message.goAway && typeof message.goAway === 'object') {
      return this.parseGoAway(message.goAway as Record<string, unknown>, timestamp)
    }

    // Handle session resumption updates (v1beta)
    if (message.sessionResumptionUpdate && typeof message.sessionResumptionUpdate === 'object') {
      return this.parseSessionResumptionUpdate(
        message.sessionResumptionUpdate as Record<string, unknown>,
        timestamp
      )
    }

    // Handle error responses
    if (message.error && typeof message.error === 'object') {
      return this.parseError(message.error as Record<string, unknown>, timestamp)
    }

    // Default fallback for unknown message types
    return {
      type: 'text',
      content: JSON.stringify(message),
      metadata: {
        timestamp,
        messageId: (message.id as string) || undefined
      }
    }
  }

  /**
   * Parse server content messages (text responses)
   */
  private static parseServerContent(
    serverContent: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined
    const turnComplete = serverContent.turnComplete as boolean | undefined
    const inputTranscription = serverContent.inputTranscription as
      | Record<string, unknown>
      | undefined

    // Check for input transcription first (for speech-to-text)
    if (inputTranscription && typeof inputTranscription.text === 'string') {
      return {
        type: 'text',
        content: inputTranscription.text,
        metadata: {
          timestamp,
          inputTranscription: true,
          isPartial: !turnComplete,
          confidence:
            typeof inputTranscription.confidence === 'number'
              ? inputTranscription.confidence
              : undefined
        }
      }
    }

    if (modelTurn && Array.isArray(modelTurn.parts)) {
      // Extract text from parts
      const textParts = modelTurn.parts
        .map((part: Record<string, unknown>) => part.text)
        .filter((text: unknown): text is string => typeof text === 'string')

      const content = textParts.join(' ')

      return {
        type: 'text',
        content,
        metadata: {
          timestamp,
          modelTurn: true,
          isPartial: !turnComplete,
          turnId: (modelTurn.turnId as string) || undefined
        }
      }
    }

    return {
      type: 'text',
      content: '',
      metadata: {timestamp, modelTurn: true}
    }
  }

  /**
   * Parse model turn messages
   */
  private static parseModelTurn(
    modelTurn: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    if (Array.isArray(modelTurn.parts)) {
      const textContent = modelTurn.parts
        .map((part: Record<string, unknown>) => part.text)
        .filter((text: unknown): text is string => typeof text === 'string')
        .join(' ')

      return {
        type: 'text',
        content: textContent,
        metadata: {
          timestamp,
          modelTurn: true,
          turnId: (modelTurn.turnId as string) || undefined
        }
      }
    }

    return {
      type: 'text',
      content: '',
      metadata: {timestamp, modelTurn: true}
    }
  }

  /**
   * Parse realtime input messages (audio)
   */
  private static parseRealtimeInput(
    realtimeInput: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    if (Array.isArray(realtimeInput.mediaChunks)) {
      for (const chunk of realtimeInput.mediaChunks) {
        if (chunk.mimeType && chunk.mimeType.startsWith('audio/')) {
          return {
            type: 'audio',
            content: (chunk.data as string) || null,
            metadata: {
              timestamp,
              messageId: (realtimeInput.id as string) || undefined
            }
          }
        }
      }
    }

    return {
      type: 'audio',
      content: null,
      metadata: {timestamp}
    }
  }

  /**
   * Parse turn complete messages
   */
  private static parseTurnComplete(turnComplete: unknown, timestamp: number): ParsedGeminiResponse {
    return {
      type: 'turn_complete',
      content: null,
      metadata: {
        timestamp,
        turnId:
          typeof turnComplete === 'object' && turnComplete
            ? ((turnComplete as Record<string, unknown>).turnId as string) || undefined
            : undefined
      }
    }
  }

  /**
   * Parse setup complete messages
   */
  private static parseSetupComplete(
    setupComplete: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    return {
      type: 'setup_complete',
      content: null,
      metadata: {
        timestamp,
        messageId: (setupComplete.id as string) || undefined
      }
    }
  }

  /**
   * Parse tool call messages
   */
  private static parseToolCall(
    toolCall: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const functionCall = toolCall.functionCall as Record<string, unknown> | undefined

    if (functionCall) {
      return {
        type: 'tool_call',
        content: null,
        metadata: {timestamp},
        toolCall: {
          name: (functionCall.name as string) || '',
          parameters: (functionCall.args as Record<string, unknown>) || {},
          id: (toolCall.id as string) || ''
        }
      }
    }

    return {
      type: 'tool_call',
      content: null,
      metadata: {timestamp},
      toolCall: {
        name: '',
        parameters: {},
        id: ''
      }
    }
  }

  /**
   * Parse error messages
   */
  private static parseError(
    error: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    return {
      type: 'error',
      content: null,
      metadata: {timestamp},
      error: {
        code: (error.code as string) || 'UNKNOWN_ERROR',
        message: (error.message as string) || 'An unknown error occurred',
        details: (error.details as Record<string, unknown>) || {}
      }
    }
  }

  /**
   * Parse tool call cancellation messages (v1beta)
   */
  private static parseToolCallCancellation(
    toolCallCancellation: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const ids = (toolCallCancellation.ids as string[]) || []

    return {
      type: 'tool_call_cancellation',
      content: null,
      metadata: {
        timestamp,
        messageId: `cancellation_${timestamp}`,
        toolCallIds: ids
      },
      toolCallCancellation: {
        ids
      }
    }
  }

  /**
   * Parse go away messages (v1beta)
   */
  private static parseGoAway(
    goAway: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const timeLeft = goAway.timeLeft as Record<string, unknown> | undefined

    return {
      type: 'go_away',
      content: null,
      metadata: {
        timestamp,
        messageId: `goaway_${timestamp}`,
        timeLeft: timeLeft
          ? {
              seconds: (timeLeft.seconds as number) || 0,
              nanos: (timeLeft.nanos as number) || 0
            }
          : undefined
      },
      goAway: {
        timeLeft: timeLeft
          ? {
              seconds: (timeLeft.seconds as number) || 0,
              nanos: (timeLeft.nanos as number) || 0
            }
          : undefined
      }
    }
  }

  /**
   * Parse session resumption update messages (v1beta)
   */
  private static parseSessionResumptionUpdate(
    sessionResumptionUpdate: Record<string, unknown>,
    timestamp: number
  ): ParsedGeminiResponse {
    const newHandle = (sessionResumptionUpdate.newHandle as string) || ''
    const resumable = (sessionResumptionUpdate.resumable as boolean) || false

    return {
      type: 'session_resumption_update',
      content: null,
      metadata: {
        timestamp,
        messageId: `session_update_${timestamp}`,
        sessionHandle: newHandle,
        resumable
      },
      sessionResumptionUpdate: {
        newHandle,
        resumable
      }
    }
  }

  /**
   * Validate that a parsed response is well-formed
   */
  static validateResponse(response: ParsedGeminiResponse): {isValid: boolean; errors: string[]} {
    const errors: string[] = []

    // Check required fields
    if (!response.type) {
      errors.push('Response must have a type')
    }

    if (!response.metadata || !response.metadata.timestamp) {
      errors.push('Response must have metadata with timestamp')
    }

    // Type-specific validation
    switch (response.type) {
      case 'text':
        if (typeof response.content !== 'string') {
          errors.push('Text response must have string content')
        }
        break

      case 'audio':
        if (response.content !== null && typeof response.content !== 'string') {
          errors.push('Audio response content must be string (base64) or null')
        }
        break

      case 'tool_call':
        if (!response.toolCall || !response.toolCall.name) {
          errors.push('Tool call response must have toolCall with name')
        }
        break

      case 'error':
        if (!response.error || !response.error.code || !response.error.message) {
          errors.push('Error response must have error object with code and message')
        }
        break

      case 'tool_call_cancellation':
        if (!response.toolCallCancellation || !Array.isArray(response.toolCallCancellation.ids)) {
          errors.push(
            'Tool call cancellation response must have toolCallCancellation with ids array'
          )
        }
        break

      case 'go_away':
        if (!response.goAway) {
          errors.push('Go away response must have goAway object')
        }
        break

      case 'session_resumption_update':
        if (
          !response.sessionResumptionUpdate ||
          typeof response.sessionResumptionUpdate.newHandle !== 'string' ||
          typeof response.sessionResumptionUpdate.resumable !== 'boolean'
        ) {
          errors.push(
            'Session resumption update response must have sessionResumptionUpdate with newHandle and resumable'
          )
        }
        break
    }

    return {
      isValid: errors.length === 0,
      errors
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
  private messageQueue: Map<QueuePriority, QueuedMessage[]> = new Map()
  private pendingMessages: Map<string, QueuedMessage> = new Map()
  private maxQueueSize: number
  private messageIdCounter = 0
  private retryTimers: Map<string, NodeJS.Timeout> = new Map()
  private isClosingIntentionally = false
  private messageHandler: GeminiMessageHandler
  private errorHandler: GeminiErrorHandler
  private reconnectionManager: ReconnectionManager
  private heartbeatMonitor: WebSocketHeartbeatMonitor
  private sessionManager: GeminiSessionManager
  private currentSession: SessionData | null = null
  private isSetupComplete = false // Track setup completion to prevent audio before acknowledgment

  /**
   * Validate configuration for v1beta compatibility
   */
  private validateConfig(config: GeminiLiveConfig): void {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new Error('Valid API key is required for Gemini Live API')
    }

    // Validate API key format (basic validation)
    if (!config.apiKey.startsWith('AIza') || config.apiKey.length < 35) {
      throw new Error(
        'Invalid API key format. Google AI API keys should start with "AIza" and be at least 35 characters long'
      )
    }

    // Validate model if provided
    if (config.model && !config.model.includes('gemini')) {
      logger.warn(
        'Model name does not contain "gemini", please verify it is a valid Gemini Live model',
        {
          providedModel: config.model
        }
      )
    }

    // Validate WebSocket URL if provided
    if (config.websocketBaseUrl) {
      try {
        const url = new URL(config.websocketBaseUrl)
        if (!url.protocol.startsWith('wss')) {
          throw new Error('WebSocket URL must use secure protocol (wss://)')
        }
        if (!url.hostname.includes('googleapis.com')) {
          logger.warn('Custom WebSocket URL does not use googleapis.com domain', {
            hostname: url.hostname
          })
        }
      } catch (error) {
        throw new Error(
          `Invalid WebSocket URL: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    // Validate numeric configurations
    if (
      config.reconnectAttempts !== undefined &&
      (config.reconnectAttempts < 0 || config.reconnectAttempts > 20)
    ) {
      throw new Error('Reconnect attempts must be between 0 and 20')
    }

    if (
      config.heartbeatInterval !== undefined &&
      (config.heartbeatInterval < 5000 || config.heartbeatInterval > 300000)
    ) {
      throw new Error('Heartbeat interval must be between 5 seconds and 5 minutes')
    }

    if (
      config.connectionTimeout !== undefined &&
      (config.connectionTimeout < 1000 || config.connectionTimeout > 60000)
    ) {
      throw new Error('Connection timeout must be between 1 second and 1 minute')
    }

    if (
      config.maxQueueSize !== undefined &&
      (config.maxQueueSize < 10 || config.maxQueueSize > 1000)
    ) {
      throw new Error('Max queue size must be between 10 and 1000')
    }

    logger.debug('Configuration validation passed', {
      model: config.model || GEMINI_LIVE_MODEL,
      hasApiKey: !!config.apiKey,
      reconnectAttempts: config.reconnectAttempts,
      heartbeatInterval: config.heartbeatInterval,
      connectionTimeout: config.connectionTimeout
    })
  }

  constructor(config: GeminiLiveConfig) {
    super()

    // Validate configuration before proceeding
    this.validateConfig(config)

    this.config = {
      model: GEMINI_LIVE_MODEL,
      responseModalities: [ResponseModality.TEXT],
      systemInstruction: 'You are a helpful assistant and answer in a friendly tone.',
      reconnectAttempts: 5,
      heartbeatInterval: 30000, // 30 seconds
      connectionTimeout: 10000, // 10 seconds
      maxQueueSize: 100, // Limit message queue size to prevent memory issues
      apiVersion: 'v1beta', // Default to v1beta as per Google documentation
      ...config
    }
    this.maxReconnectAttempts = this.config.reconnectAttempts!
    this.heartbeatInterval = this.config.heartbeatInterval!
    this.connectionTimeout = this.config.connectionTimeout!
    this.maxQueueSize = this.config.maxQueueSize!

    // Initialize priority-based message queues
    Object.values(QueuePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.messageQueue.set(priority, [])
      }
    })

    // Initialize message handler
    this.messageHandler = new GeminiMessageHandler()
    this.setupMessageHandler()

    // Initialize error handler
    this.errorHandler = new GeminiErrorHandler({
      maxErrorHistory: 100,
      logLevel: process.env.NODE_ENV === 'development' ? 4 : 2 // DEBUG in dev, INFO in prod
    })
    this.setupErrorHandlerEvents()
    this.setupEnhancedEventHandling()

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
    this.sessionManager = new GeminiSessionManager({
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      maxInactiveDuration: 30 * 60 * 1000, // 30 minutes
      persistenceEnabled: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      maxSessionHistory: 10
    })
    this.setupSessionManagerEvents()

    logger.info('GeminiLiveWebSocketClient initialized', {
      model: this.config.model,
      heartbeatInterval: this.heartbeatInterval,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectionStrategy: this.config.reconnectionStrategy || ReconnectionStrategy.EXPONENTIAL
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
        this.ws.onopen = () => {
          clearTimeout(timeoutId)
          logger.info('WebSocket connected to Gemini Live API', {
            connectionState: this.connectionState,
            attempts: this.reconnectAttempts
          })
          this.setConnectionState(ConnectionState.CONNECTED)
          this.reconnectAttempts = 0

          // Reset setup completion flag for new connection
          this.isSetupComplete = false

          // Don't start heartbeat for Gemini Live API (it doesn't support custom ping messages)
          // this.startHeartbeat()

          // Don't process message queue until setup is complete
          // this.processMessageQueue()

          // Create or resume session
          this.handleSessionConnection()

          // Send initial setup message
          this.sendSetupMessage()

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
   * Build WebSocket URL for Gemini Live API with configurable version
   */
  private buildWebSocketUrl(): string {
    try {
      // Ensure API key is still valid (in case it was modified after construction)
      if (!this.config.apiKey || typeof this.config.apiKey !== 'string') {
        throw new Error('API key is required to build WebSocket URL')
      }

      // Use configured API version or default to v1beta (as per Google documentation)
      const apiVersion = this.config.apiVersion || 'v1beta'

      // Build the base URL with configurable API version
      const baseUrl =
        this.config.websocketBaseUrl ||
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent`

      // Validate the base URL format
      const urlObj = new URL(baseUrl)
      if (!urlObj.protocol.startsWith('wss')) {
        throw new Error('WebSocket URL must use secure protocol (wss://)')
      }

      // Create query parameters for authentication
      const params = new URLSearchParams({
        key: this.config.apiKey
      })

      const finalUrl = `${baseUrl}?${params.toString()}`

      logger.debug('Built WebSocket URL for Gemini Live API', {
        baseUrl: baseUrl.substring(0, 50) + '...',
        hasApiKey: !!this.config.apiKey,
        apiVersion: apiVersion
      })

      return finalUrl
    } catch (error) {
      logger.error('Failed to build WebSocket URL', {
        error: error instanceof Error ? error.message : 'Unknown error',
        hasApiKey: !!this.config.apiKey,
        apiVersion: this.config.apiVersion || 'v1beta'
      })
      throw new Error(
        `Failed to build WebSocket URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Send realtime input (audio or text) to the API with enhanced queueing and retry
   */
  async sendRealtimeInput(input: RealtimeInput, options: MessageSendOptions = {}): Promise<void> {
    // Check circuit breaker before attempting to send
    if (!this.errorHandler.canProceed()) {
      const circuitBreakerState = this.errorHandler.getCircuitBreakerStatus()
      logger.warn('Circuit breaker is open, blocking message send', {
        state: circuitBreakerState.state,
        failureCount: circuitBreakerState.failureCount
      })

      const error = this.errorHandler.handleError(
        new Error('Circuit breaker is open - too many recent failures'),
        {
          connectionState: this.connectionState,
          circuitBreakerState: circuitBreakerState.state
        },
        {
          type: ErrorType.CIRCUIT_BREAKER,
          retryable: false
        }
      )
      throw error
    }

    // If not connected, queue the message with priority
    if (this.connectionState !== ConnectionState.CONNECTED) {
      return this.queueMessage(input, options)
    }

    return this.sendMessageDirectly(input, options)
  }

  /**
   * Send client content with turn completion signal to trigger model response
   * Updated format for v1beta API compatibility
   */
  async sendTurnCompletion(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    // For v1beta API, use clientContent structure with turnComplete
    const turnCompletionMessage = JSON.stringify({
      clientContent: {
        turnComplete: true
      }
    })

    logger.debug('Sending turn completion signal to trigger model response', {
      messageLength: turnCompletionMessage.length
    })

    this.ws.send(turnCompletionMessage)
  }

  /**
   * Queue a message with priority-based system
   */
  private queueMessage(input: RealtimeInput, options: MessageSendOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const priority = options.priority || QueuePriority.NORMAL
      const messageId = this.generateMessageId()

      const queuedMessage: QueuedMessage = {
        id: messageId,
        input,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        priority,
        timeout: options.timeout || 30000,
        resolve: options.expectResponse ? resolve : undefined,
        reject
      }

      // Check total queue size across all priorities
      const totalQueueSize = this.getTotalQueueSize()

      logger.debug('Queueing message due to connection state', {
        connectionState: this.connectionState,
        totalQueueSize,
        priority,
        messageId
      })

      // Implement queue size limit to prevent memory issues
      if (totalQueueSize >= this.maxQueueSize) {
        logger.warn('Message queue full, dropping oldest low-priority message', {
          totalQueueSize,
          maxQueueSize: this.maxQueueSize
        })
        this.dropOldestMessage()
      }

      // Add to appropriate priority queue
      const queue = this.messageQueue.get(priority)
      if (queue) {
        queue.push(queuedMessage)

        // Store for tracking if expecting response
        if (options.expectResponse) {
          this.pendingMessages.set(messageId, queuedMessage)
        }

        this.emit('messageQueued', {
          messageId,
          priority,
          totalQueueSize: this.getTotalQueueSize(),
          inputType: input.audio ? 'audio' : 'text'
        })

        if (!options.expectResponse) {
          resolve()
        }
      } else {
        reject(new Error(`Invalid priority: ${priority}`))
      }
    })
  }

  /**
   * Send message directly over WebSocket
   */
  private async sendMessageDirectly(
    input: RealtimeInput,
    options: MessageSendOptions = {}
  ): Promise<void> {
    if (!this.ws) {
      const error = this.errorHandler.handleError(
        new Error('WebSocket not initialized'),
        {connectionState: this.connectionState},
        {type: ErrorType.WEBSOCKET, retryable: false}
      )
      throw error
    }

    // CRITICAL: Prevent audio messages from being sent before setup is complete
    if (input.audio && !this.isSetupComplete) {
      const error = this.errorHandler.handleError(
        new Error('Cannot send audio data before setup response is received from Gemini Live API'),
        {setupComplete: this.isSetupComplete, hasAudio: !!input.audio},
        {type: ErrorType.API, retryable: false}
      )
      throw error
    }

    try {
      // Build the correct Gemini Live API message format (using camelCase for v1beta API)
      let message: string

      if (input.audioStreamEnd) {
        // For audioStreamEnd, send it as a direct field, not in mediaChunks
        message = JSON.stringify({
          realtimeInput: {
            audioStreamEnd: true
          }
        })
      } else if (input.text) {
        // Send text message to establish transcription context - this may help the model understand our intent
        logger.debug('Sending text message to establish transcription context', {
          textContent: input.text.substring(0, 50) + '...'
        })
        message = JSON.stringify({
          realtimeInput: {
            text: input.text
          }
        })
      } else {
        // For regular media chunks (audio only)
        message = JSON.stringify({
          realtimeInput: {
            mediaChunks: this.buildMediaChunks(input)
          }
        })
      }

      logger.debug('Sending message to Gemini Live API', {
        messageLength: message.length,
        inputType: input.audioStreamEnd ? 'audioStreamEnd' : input.audio ? 'audio' : 'text',
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state
      })

      this.ws.send(message)
      this.emit('messageSent', input)

      // Record successful operation for circuit breaker
      this.errorHandler.recordSuccess()

      // Track message in session
      if (this.currentSession) {
        this.sessionManager.recordMessage('sent', this.currentSession.sessionId)
        this.sessionManager.updateActivity(this.currentSession.sessionId)
      }

      // Also queue through message handler for future integration
      this.messageHandler.queueMessage(input, MessageType.CLIENT_CONTENT, MessagePriority.HIGH)
    } catch (error) {
      // Record failure for circuit breaker
      this.errorHandler.recordFailure()

      const geminiError = this.errorHandler.handleError(
        error,
        {
          input: {
            hasAudio: !!input.audio,
            hasText: !!input.text,
            textLength: input.text?.length
          },
          connectionState: this.connectionState,
          timestamp: new Date(),
          sessionId: this.currentSession?.sessionId
        },
        {
          type: ErrorType.API,
          retryable: true
        }
      )

      logger.error('Failed to send realtime input', {
        errorId: geminiError.id,
        message: geminiError.message,
        errorType: geminiError.type,
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state
      })

      // Attempt automatic recovery for retryable errors
      if (geminiError.retryable && this.errorHandler.canProceed()) {
        try {
          logger.info('Attempting automatic retry for failed message send', {
            errorType: geminiError.type,
            retryAttempt: 1
          })

          // Simple retry after short delay
          await new Promise(resolve => setTimeout(resolve, 1000))
          await this.sendMessageDirectly(input, options)

          logger.info('Automatic retry successful')
          return
        } catch (retryError) {
          logger.error('Automatic retry failed', {
            originalError: geminiError.type,
            retryError: retryError instanceof Error ? retryError.message : String(retryError)
          })

          // If we have options for queued message retry, use that mechanism
          if (options.maxRetries && options.maxRetries > 1) {
            const messageId = this.generateMessageId()
            const queuedMessage: QueuedMessage = {
              id: messageId,
              input,
              timestamp: Date.now(),
              retryCount: 1, // Already attempted once
              maxRetries: options.maxRetries,
              priority: options.priority || QueuePriority.NORMAL,
              timeout: options.timeout || 30000,
              resolve: undefined,
              reject: error => {
                throw error
              }
            }

            logger.info('Initiating enhanced retry mechanism', {
              messageId,
              maxRetries: options.maxRetries,
              currentAttempt: 1
            })

            await this.retryMessage(queuedMessage)
            return
          }
        }
      }

      throw geminiError
    }
  }

  /**
   * Build media chunks from realtime input for Gemini Live API (using snake_case field names)
   */
  private buildMediaChunks(input: RealtimeInput): Array<Record<string, unknown>> {
    const chunks: Array<Record<string, unknown>> = []

    if (input.text) {
      chunks.push({
        data: input.text,
        mimeType: 'text/plain' // Use camelCase for v1beta API
      })
    }

    if (input.audio) {
      chunks.push({
        data: input.audio.data,
        mimeType: input.audio.mimeType // Use camelCase for v1beta API
      })
    }

    return chunks
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Record successful message receipt for circuit breaker
      this.errorHandler.recordSuccess()

      // Handle both string and binary data
      if (typeof event.data === 'string') {
        this.processMessageData(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        // Convert ArrayBuffer to string
        const messageData = new TextDecoder().decode(event.data)
        this.processMessageData(messageData)
      } else if (event.data instanceof Blob) {
        // For Blob data, convert to text asynchronously
        event.data
          .text()
          .then(text => {
            this.processMessageData(text)
          })
          .catch(error => {
            logger.error('Failed to convert Blob message to text', {
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          })
        return
      } else {
        logger.error('Received unsupported message data type', {
          dataType: typeof event.data,
          constructor: event.data.constructor.name
        })
        throw new Error(`Unsupported message data type: ${typeof event.data}`)
      }
    } catch (error) {
      const parseError = this.errorHandler.handleError(
        error instanceof Error ? error : new Error('Unknown message parsing error'),
        {error: error instanceof Error ? error.message : 'Unknown error'},
        {type: ErrorType.PARSE_ERROR, retryable: false}
      )

      logger.error('Failed to handle WebSocket message', {
        errorId: parseError.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Consolidated message processing logic
   */
  private processMessageData(messageData: string): void {
    try {
      // Parse the raw message first with additional safety
      const rawMessage = JSON.parse(messageData)

      // DEBUG: Log all raw messages to diagnose transcription response issues
      logger.debug('Raw WebSocket message received', {
        messageData: messageData.substring(0, 500), // Truncate for logging
        hasSetupComplete: !!rawMessage.setupComplete,
        hasServerContent: !!rawMessage.serverContent,
        hasModelTurn: !!rawMessage.serverContent?.modelTurn,
        hasTurnComplete: !!(rawMessage.serverContent?.turnComplete || rawMessage.turnComplete),
        messageKeys: Object.keys(rawMessage || {}),
        currentSetupState: this.isSetupComplete
      })

      // Log ALL message types for debugging
      console.log('WebSocket message received:', {
        messageKeys: Object.keys(rawMessage || {}),
        hasServerContent: !!rawMessage.serverContent,
        hasModelTurn: !!rawMessage.serverContent?.modelTurn,
        fullMessage: JSON.stringify(rawMessage, null, 2).substring(0, 1000)
      })

      // Check if heartbeat monitor can handle this message
      if (this.heartbeatMonitor.handleMessage(rawMessage)) {
        // Message was handled by heartbeat monitor (pong response)
        logger.debug('Message handled by heartbeat monitor')
        return
      }

      // Use enhanced message parser for gemini-live-2.5-flash-preview
      const geminiResponse = Gemini2FlashMessageParser.parseResponse(rawMessage)
      const validation = Gemini2FlashMessageParser.validateResponse(geminiResponse)

      logger.debug('Received and parsed WebSocket message', {
        messageType: geminiResponse.type,
        isValid: validation.isValid,
        messageId: geminiResponse.metadata.messageId,
        errors: validation.errors,
        isPartial: geminiResponse.metadata.isPartial,
        modelTurn: geminiResponse.metadata.modelTurn,
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state
      })

      // ENHANCED DEBUG: Log what we're getting vs what we expect
      console.log('WebSocket transcription: Raw message received:', {
        original: geminiResponse,
        type: geminiResponse.type,
        metadata: geminiResponse.metadata,
        payload: geminiResponse,
        isValid: validation.isValid,
        errors: validation.errors
      })

      // Handle validation errors
      if (!validation.isValid) {
        const parseError = this.errorHandler.handleError(
          new Error(`Message validation failed: ${validation.errors.join(', ')}`),
          {
            messageType: geminiResponse.type,
            validationErrors: validation.errors,
            rawMessage: JSON.stringify(rawMessage).substring(0, 500) // Truncate for logging
          },
          {
            type: ErrorType.PARSE_ERROR,
            retryable: false
          }
        )

        logger.warn('Invalid message received from Gemini Live API', {
          errorId: parseError.id,
          errors: validation.errors,
          messageType: geminiResponse.type
        })

        return
      }

      // Process the valid response
      this.handleValidResponse(geminiResponse)
    } catch (error) {
      const parseError = this.errorHandler.handleError(
        error instanceof Error ? error : new Error('Unknown message processing error'),
        {error: error instanceof Error ? error.message : 'Unknown error'},
        {type: ErrorType.PARSE_ERROR, retryable: false}
      )

      logger.error('Failed to process message data', {
        errorId: parseError.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Handle valid parsed response
   */
  private handleValidResponse(geminiResponse: ParsedGeminiResponse): void {
    // Check for server-side errors in the message
    if (geminiResponse.type === 'error' && geminiResponse.error) {
      const serverError = this.errorHandler.handleError(
        new Error(`Server error: ${geminiResponse.error.message || 'Unknown server error'}`),
        {
          serverErrorCode: geminiResponse.error.code,
          serverErrorDetails: geminiResponse.error.details,
          sessionId: this.currentSession?.sessionId
        },
        {
          type: this.classifyServerError(geminiResponse.error),
          retryable: this.isServerErrorRetryable(geminiResponse.error)
        }
      )

      logger.error('Received server error from Gemini Live API', {
        errorId: serverError.id,
        serverError: geminiResponse.error,
        sessionId: this.currentSession?.sessionId
      })

      this.emit('geminiError', {
        ...geminiResponse.error,
        handledError: serverError
      })

      if (this.shouldReconnectOnServerError(geminiResponse.error)) {
        this.handleServerErrorRecovery(serverError)
      }
      return
    }

    // Process the message with the original handler for backwards compatibility
    const messageText = JSON.stringify(geminiResponse)
    const processed = this.messageHandler.processIncomingMessage(messageText)

    // Emit both formats for different consumers
    this.emit('message', processed)
    this.emit('geminiResponse', geminiResponse)

    // Track message received in session
    if (this.currentSession) {
      this.sessionManager.recordMessage('received', this.currentSession.sessionId)
      this.sessionManager.updateActivity(this.currentSession.sessionId)

      if (geminiResponse.type === 'turn_complete') {
        this.sessionManager.recordTurn(this.currentSession.sessionId)
      }
    }

    // Emit specific events based on enhanced message type
    switch (geminiResponse.type) {
      case 'text':
        this.emit('textResponse', {
          content: geminiResponse.content,
          metadata: geminiResponse.metadata,
          isPartial: geminiResponse.metadata.isPartial
        })

        // Also emit transcriptionUpdate for backward compatibility with transcription services
        this.emit('transcriptionUpdate', {
          text: geminiResponse.content,
          confidence: geminiResponse.metadata.confidence,
          isFinal: !geminiResponse.metadata.isPartial
        })

        logger.debug('Emitted transcription events', {
          textLength:
            typeof geminiResponse.content === 'string' ? geminiResponse.content.length : 0,
          isPartial: geminiResponse.metadata.isPartial,
          confidence: geminiResponse.metadata.confidence,
          isFinal: !geminiResponse.metadata.isPartial
        })
        break
      case 'audio':
        this.emit('audioResponse', {
          content: geminiResponse.content,
          metadata: geminiResponse.metadata
        })
        break
      case 'tool_call':
        this.emit('toolCall', geminiResponse.toolCall)
        break
      case 'turn_complete':
        this.emit('turnComplete', {
          turnId: geminiResponse.metadata.turnId,
          metadata: geminiResponse.metadata
        })
        break
      case 'setup_complete':
        // CRITICAL: Set setup complete flag immediately upon receiving the message
        this.isSetupComplete = true
        logger.info('Setup complete message received - marking as complete')

        this.emit('setupComplete', {
          metadata: geminiResponse.metadata
        })
        break
      case 'tool_call_cancellation':
        this.emit('toolCallCancellation', {
          ids: geminiResponse.toolCallCancellation?.ids || [],
          metadata: geminiResponse.metadata
        })
        break
      case 'go_away':
        this.emit('goAway', {
          timeLeft: geminiResponse.goAway?.timeLeft,
          metadata: geminiResponse.metadata
        })
        // Handle graceful disconnect when server requests go away
        this.handleGoAwayMessage(geminiResponse.goAway?.timeLeft)
        break
      case 'session_resumption_update':
        this.emit('sessionResumptionUpdate', {
          newHandle: geminiResponse.sessionResumptionUpdate?.newHandle || '',
          resumable: geminiResponse.sessionResumptionUpdate?.resumable || false,
          metadata: geminiResponse.metadata
        })
        // Update session manager with new resumption data
        this.handleSessionResumptionUpdate(geminiResponse.sessionResumptionUpdate)
        break
      default:
        logger.debug('Unhandled enhanced message type', {
          type: geminiResponse.type,
          messageId: geminiResponse.metadata.messageId
        })
    }
  }

  // Helper methods for enhanced message queue management
  private generateMessageId(): string {
    return `msg_${++this.messageIdCounter}_${Date.now()}`
  }

  private getTotalQueueSize(): number {
    let total = 0
    for (const queue of this.messageQueue.values()) {
      total += queue.length
    }
    return total
  }

  private dropOldestMessage(): void {
    // Find the oldest message across all priority queues
    let oldestMessage: QueuedMessage | null = null
    let oldestPriority: QueuePriority = QueuePriority.LOW
    let oldestIndex = -1

    for (const [priority, queue] of this.messageQueue.entries()) {
      if (queue.length > 0) {
        const message = queue[0]
        if (!oldestMessage || message.timestamp < oldestMessage.timestamp) {
          oldestMessage = message
          oldestPriority = priority
          oldestIndex = 0
        }
      }
    }

    if (oldestMessage) {
      const queue = this.messageQueue.get(oldestPriority)
      if (queue) {
        queue.splice(oldestIndex, 1)
        logger.debug('Dropped oldest message from queue', {
          messageId: oldestMessage.id,
          priority: oldestPriority,
          messageAge: Date.now() - oldestMessage.timestamp
        })
      }
    }
  }

  /**
   * Retry failed message with exponential backoff
   */
  private async retryMessage(queuedMessage: QueuedMessage): Promise<void> {
    if (queuedMessage.retryCount >= queuedMessage.maxRetries) {
      logger.warn('Message retry limit exceeded', {
        messageId: queuedMessage.id,
        retryCount: queuedMessage.retryCount,
        maxRetries: queuedMessage.maxRetries
      })

      if (queuedMessage.reject) {
        queuedMessage.reject(
          new Error(`Message retry limit exceeded after ${queuedMessage.retryCount} attempts`)
        )
      }
      return
    }

    queuedMessage.retryCount++

    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    const delay = Math.min(1000 * Math.pow(2, queuedMessage.retryCount - 1), 30000) // Max 30s

    logger.debug('Scheduling message retry', {
      messageId: queuedMessage.id,
      retryCount: queuedMessage.retryCount,
      delayMs: delay
    })

    const retryTimer = setTimeout(async () => {
      // Safely convert and validate the message ID before using it as a Map key
      const safeMessageId = this.sanitizeMapKey(queuedMessage.id)
      this.retryTimers.delete(safeMessageId)

      try {
        await this.sendMessageDirectly(queuedMessage.input, {
          priority: queuedMessage.priority,
          maxRetries: queuedMessage.maxRetries,
          timeout: queuedMessage.timeout,
          expectResponse: !!queuedMessage.resolve
        })

        // Success - resolve original promise
        if (queuedMessage.resolve) {
          queuedMessage.resolve()
        }

        // Remove from pending messages with safe key
        this.pendingMessages.delete(safeMessageId)

        logger.debug('Message retry successful', {
          messageId: queuedMessage.id,
          retryCount: queuedMessage.retryCount
        })
      } catch (error) {
        logger.warn('Message retry failed', {
          messageId: queuedMessage.id,
          retryCount: queuedMessage.retryCount,
          error: error instanceof Error ? error.message : String(error)
        })

        // Try again if we haven't hit the limit
        await this.retryMessage(queuedMessage)
      }
    }, delay)

    // Use safe key for storing the timer
    const safeTimerKey = this.sanitizeMapKey(queuedMessage.id)
    this.retryTimers.set(safeTimerKey, retryTimer)
  }

  /**
   * Enhanced WebSocket lifecycle event handling
   */
  private setupEnhancedEventHandling(): void {
    // Connection opened event
    this.on('connected', () => {
      logger.info(
        'WebSocket connection established, waiting for setup before processing queued messages',
        {
          totalQueueSize: this.getTotalQueueSize(),
          circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state
        }
      )

      // Don't process messages here - wait for setup complete
      // this.processMessageQueue()

      // Reset circuit breaker on successful connection
      this.errorHandler.recordSuccess()
    })

    // Connection closed event
    this.on('disconnected', (reason: string) => {
      logger.warn('WebSocket connection closed', {
        reason,
        totalQueueSize: this.getTotalQueueSize(),
        pendingMessages: this.pendingMessages.size
      })

      // Cancel all pending retry timers
      for (const [messageId, timer] of this.retryTimers.entries()) {
        clearTimeout(timer)
        logger.debug('Cancelled retry timer for message', {messageId})
      }
      this.retryTimers.clear()
    })

    // Error event
    this.on('error', (error: GeminiError) => {
      logger.error('WebSocket error occurred', {
        errorId: error.id,
        type: error.type,
        message: error.message,
        retryable: error.retryable
      })
    })

    // Message sent event
    this.on('messageSent', (input: RealtimeInput) => {
      this.emit('queueUpdate', {
        action: 'sent',
        totalQueueSize: this.getTotalQueueSize(),
        pendingMessages: this.pendingMessages.size,
        inputType: input.audio ? 'audio' : 'text'
      })
    })

    // Message queued event
    this.on(
      'messageQueued',
      (data: {
        messageId: string
        priority: QueuePriority
        totalQueueSize: number
        inputType: string
      }) => {
        this.emit('queueUpdate', {
          action: 'queued',
          ...data
        })
      }
    )

    // Circuit breaker state change event
    this.errorHandler.on('circuitBreakerStateChange', (state: string) => {
      logger.info('Circuit breaker state changed', {
        newState: state,
        statistics: this.errorHandler.getStatistics()
      })

      this.emit('circuitBreakerStateChange', state)
    })
  }

  /**
   * Process queued messages when connection is established with priority-based handling
   */
  private processMessageQueue(): void {
    const priorities = [
      QueuePriority.CRITICAL,
      QueuePriority.HIGH,
      QueuePriority.NORMAL,
      QueuePriority.LOW
    ]

    for (const priority of priorities) {
      const queue = this.messageQueue.get(priority)
      if (!queue) continue

      while (queue.length > 0) {
        const queuedMessage = queue.shift()
        if (queuedMessage) {
          logger.debug('Processing queued message', {
            messageId: queuedMessage.id,
            priority,
            retryCount: queuedMessage.retryCount,
            queueAge: Date.now() - queuedMessage.timestamp
          })

          // Send the message directly, bypassing queue logic since we're already processing
          this.sendMessageDirectly(queuedMessage.input, {
            priority: queuedMessage.priority,
            maxRetries: queuedMessage.maxRetries,
            timeout: queuedMessage.timeout,
            expectResponse: !!queuedMessage.resolve
          })
            .then(() => {
              // Resolve the original promise if it was expecting a response
              if (queuedMessage.resolve) {
                queuedMessage.resolve(undefined)
              }
            })
            .catch(error => {
              // Reject the original promise
              if (queuedMessage.reject) {
                queuedMessage.reject(error)
              }
            })
        }
      }
    }
  }

  /**
   * Set up heartbeat monitor event listeners
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
      // Convert Error to GeminiError with enhanced classification
      geminiError = this.errorHandler.handleError(
        error,
        {
          connectionState: this.connectionState,
          reconnectAttempts: this.reconnectAttempts,
          timestamp: new Date(),
          sessionId: this.currentSession?.sessionId
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
      connectionState: this.connectionState,
      circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state,
      canProceed: this.errorHandler.canProceed()
    })

    // Track error in session if we have one
    if (this.currentSession) {
      this.sessionManager.markSessionError(
        `${geminiError.type}: ${geminiError.message}`,
        this.currentSession.sessionId
      )
    }

    this.setConnectionState(ConnectionState.ERROR)
    this.stopHeartbeat()
    this.emit('error', geminiError)

    // Check circuit breaker before attempting recovery
    if (!this.isClosingIntentionally && this.errorHandler.canProceed()) {
      this.handleErrorRecovery(geminiError)
    } else if (!this.errorHandler.canProceed()) {
      logger.warn('Circuit breaker is open, blocking recovery attempts', {
        circuitBreakerState: this.errorHandler.getCircuitBreakerStatus().state,
        errorType: geminiError.type
      })
      this.emit('circuitBreakerOpen', {
        state: this.errorHandler.getCircuitBreakerStatus().state,
        lastError: geminiError
      })
    }
  }

  /**
   * Handle error recovery with enhanced strategies
   */
  private async handleErrorRecovery(error: GeminiError): Promise<void> {
    try {
      // Record the failure in circuit breaker
      this.errorHandler.recordFailure()

      // Attempt recovery based on error type and configured strategy
      if (error.retryable) {
        const recoveryResult = await this.errorHandler.handleErrorWithRecovery(
          error,
          {
            connectionState: this.connectionState,
            reconnectAttempts: this.reconnectAttempts,
            timestamp: new Date(),
            sessionId: this.currentSession?.sessionId
          },
          {
            type: error.type,
            retryable: true,
            attemptRecovery: true,
            maxRetries: 3
          }
        )

        if (recoveryResult.recovered) {
          logger.info('Error recovery successful', {
            errorType: error.type,
            recoveryStats: this.errorHandler.getStatistics()
          })
          this.errorHandler.recordSuccess()

          // Attempt to reconnect after successful recovery
          try {
            await this.connect()
            logger.info('Reconnection successful after recovery')
          } catch (connectError) {
            logger.error('Reconnection failed after recovery', {
              error: connectError instanceof Error ? connectError.message : String(connectError)
            })
            throw connectError
          }
        } else {
          // Recovery failed, let reconnection manager handle it
          const shouldReconnect = this.reconnectionManager.onConnectionLost(
            `Error: ${error.message}`
          )

          if (shouldReconnect) {
            this.setConnectionState(ConnectionState.RECONNECTING)
            this.reconnectionManager.startReconnection(() => this.connect())
          }
        }
      } else {
        logger.error('Error is not retryable, no recovery attempted', {
          errorType: error.type,
          message: error.message
        })
      }
    } catch (recoveryError) {
      logger.error('Error during recovery process', {
        originalError: error.type,
        recoveryError:
          recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      })

      // Fall back to basic reconnection logic
      const shouldReconnect = this.reconnectionManager.onConnectionLost(
        `Recovery failed: ${error.message}`
      )

      if (shouldReconnect) {
        this.setConnectionState(ConnectionState.RECONNECTING)
        this.reconnectionManager.startReconnection(() => this.connect())
      }
    }
  }

  /**
   * Handle session connection - create new session or resume existing one
   */
  private handleSessionConnection(): void {
    try {
      // Try to resume most recent session first if this is a reconnection
      const resumableSessions = this.sessionManager.getResumableSessions()

      if (resumableSessions.length > 0 && this.reconnectAttempts > 0) {
        // This is a reconnection, try to resume the most recent session
        const latestSession = resumableSessions[0]

        // Validate session before resumption
        if (this.validateSessionForResumption(latestSession)) {
          const resumedSession = this.sessionManager.resumeSession(latestSession.sessionId)

          if (resumedSession) {
            this.currentSession = resumedSession
            this.sessionManager.recordConnectionEvent('resumed', 'websocket_reconnected')

            logger.info('Resumed previous session successfully', {
              sessionId: resumedSession.sessionId,
              messageCount: resumedSession.messageCount,
              turnCount: resumedSession.turnCount,
              lastActivity: resumedSession.lastActivity,
              connectionAttempt: this.reconnectAttempts
            })

            // Emit session resumed event
            this.emit('sessionResumed', resumedSession)
            return
          }
        } else {
          logger.warn('Latest session failed validation for resumption', {
            sessionId: latestSession.sessionId,
            status: latestSession.status,
            lastActivity: latestSession.lastActivity
          })
        }
      }

      // Create new session if no resumable session or resumption failed
      const sessionConfig = {
        model: this.config.model || GEMINI_LIVE_MODEL,
        responseModalities: this.config.responseModalities || [ResponseModality.TEXT],
        systemInstruction: this.config.systemInstruction
      }

      this.currentSession = this.sessionManager.createSession(
        this.config.model || GEMINI_LIVE_MODEL,
        sessionConfig
      )

      logger.info('Created new session', {
        sessionId: this.currentSession.sessionId,
        modelId: this.currentSession.modelId
      })
    } catch (error) {
      logger.error('Failed to handle session connection', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      // Continue without session management - don't fail the connection
    }
  }

  /**
   * Validate session for resumption
   */
  private validateSessionForResumption(session: SessionData): boolean {
    try {
      // Check if session is in a resumable state
      if (session.status !== 'suspended') {
        logger.debug('Session not in suspended state', {
          sessionId: session.sessionId,
          status: session.status
        })
        return false
      }

      // Check if session model matches current config
      if (session.modelId !== this.config.model) {
        logger.debug('Session model mismatch', {
          sessionId: session.sessionId,
          sessionModel: session.modelId,
          currentModel: this.config.model
        })
        return false
      }

      // Check if session is not too old (within last 24 hours)
      const now = Date.now()
      const sessionAge = now - session.createdAt.getTime()
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours

      if (sessionAge > maxAge) {
        logger.debug('Session too old for resumption', {
          sessionId: session.sessionId,
          sessionAge: sessionAge,
          maxAge: maxAge
        })
        return false
      }

      // Check if session was not inactive for too long (within last 30 minutes)
      const inactivityTime = now - session.lastActivity.getTime()
      const maxInactivity = 30 * 60 * 1000 // 30 minutes

      if (inactivityTime > maxInactivity) {
        logger.debug('Session inactive too long for resumption', {
          sessionId: session.sessionId,
          inactivityTime: inactivityTime,
          maxInactivity: maxInactivity
        })
        return false
      }

      logger.debug('Session validation passed for resumption', {
        sessionId: session.sessionId,
        sessionAge: sessionAge,
        inactivityTime: inactivityTime
      })

      return true
    } catch (error) {
      logger.error('Error validating session for resumption', {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Handle session disconnection - suspend current session
   */
  private handleSessionDisconnection(reason: string): void {
    if (this.currentSession) {
      try {
        this.sessionManager.suspendSession(reason, this.currentSession.sessionId)
        this.sessionManager.recordConnectionEvent('disconnected', reason)

        logger.info('Session suspended due to disconnection', {
          sessionId: this.currentSession.sessionId,
          reason
        })
      } catch (error) {
        logger.error('Failed to handle session disconnection', {
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId: this.currentSession?.sessionId
        })
      }
    }
  }

  /**
   * Handle connection close events
   */
  private handleConnectionClose(event: CloseEvent): void {
    this.setConnectionState(ConnectionState.DISCONNECTED)
    this.stopHeartbeat()

    // Handle session disconnection
    const reason = `WebSocket closed: ${event.code} - ${event.reason}`
    this.handleSessionDisconnection(reason)

    this.emit('disconnected', event)

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
   * Check if WebSocket setup is complete and ready to send audio data
   */
  isSetupCompleted(): boolean {
    return this.isSetupComplete
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
   * Get current session information
   */
  getCurrentSession(): SessionData | null {
    return this.currentSession
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return this.sessionManager.getSessionStats()
  }

  /**
   * Get resumable sessions
   */
  getResumableSessions(): SessionData[] {
    return this.sessionManager.getResumableSessions()
  }

  /**
   * Manually suspend current session
   */
  suspendCurrentSession(reason: string = 'manual'): void {
    if (this.currentSession) {
      this.sessionManager.suspendSession(reason, this.currentSession.sessionId)
    }
  }

  /**
   * Manually resume a specific session
   */
  resumeSpecificSession(sessionId: string): boolean {
    const resumedSession = this.sessionManager.resumeSession(sessionId)
    if (resumedSession) {
      this.currentSession = resumedSession
      logger.info('Manually resumed session', {
        sessionId: resumedSession.sessionId,
        messageCount: resumedSession.messageCount,
        turnCount: resumedSession.turnCount
      })
      return true
    }
    return false
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessionManager.clearAllSessions()
    this.currentSession = null
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
    this.sessionManager.destroy()

    // Clear message queues
    for (const queue of this.messageQueue.values()) {
      queue.length = 0
    }

    // Clear pending messages and retry timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer)
    }
    this.retryTimers.clear()
    this.pendingMessages.clear()

    // Clear current session reference
    this.currentSession = null

    // Remove all listeners
    this.removeAllListeners()
  }

  /**
   * Get comprehensive queue and connection statistics
   */
  getQueueStatistics() {
    const queueStats: Record<string, number> = {}
    for (const [priority, queue] of this.messageQueue.entries()) {
      queueStats[priority] = queue.length
    }

    return {
      connectionState: this.connectionState,
      totalQueuedMessages: this.getTotalQueueSize(),
      messagesByPriority: queueStats,
      pendingMessages: this.pendingMessages.size,
      activeRetryTimers: this.retryTimers.size,
      circuitBreakerState: this.errorHandler.getCircuitBreakerStatus(),
      errorStatistics: this.errorHandler.getStatistics(),
      sessionInfo: this.currentSession
        ? {
            sessionId: this.currentSession.sessionId,
            createdAt: this.currentSession.createdAt,
            lastActivity: this.currentSession.lastActivity
          }
        : null
    }
  }

  /**
   * Set up message handler event listeners
   */
  private setupMessageHandler(): void {
    this.messageHandler.on('message:received', (message: GeminiLiveApiResponse) => {
      this.emit('serverContent', message)
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
   * Set up session manager event listeners
   */
  private setupSessionManagerEvents(): void {
    this.sessionManager.on('sessionCreated', (session: SessionData) => {
      logger.info('Session created', {
        sessionId: session.sessionId,
        modelId: session.modelId
      })
      this.emit('sessionCreated', session)
    })

    this.sessionManager.on('sessionResumed', (session: SessionData) => {
      logger.info('Session resumed', {
        sessionId: session.sessionId,
        messageCount: session.messageCount,
        turnCount: session.turnCount
      })
      this.emit('sessionResumed', session)
    })

    this.sessionManager.on('sessionSuspended', (session: SessionData) => {
      logger.info('Session suspended', {
        sessionId: session.sessionId
      })
      this.emit('sessionSuspended', session)
    })

    this.sessionManager.on('sessionError', (data: {session: SessionData; error: string}) => {
      logger.error('Session error occurred', {
        sessionId: data.session.sessionId,
        error: data.error
      })
      this.emit('sessionError', data)
    })
  }

  /**
   * Create a properly formatted setup message for Gemini Live API v1beta
   * Following the official BidiGenerateContentSetup structure
   */
  private createSetupMessage(): SetupMessage {
    const setupMessage: SetupMessage = {
      setup: {
        model: `models/${this.config.model}`,
        generationConfig: {
          responseModalities: this.config.responseModalities || [ResponseModality.TEXT],
          // Use configured values or defaults optimized for speech transcription
          candidateCount: this.config.generationConfig?.candidateCount ?? 1, // Single response for transcription
          maxOutputTokens: this.config.generationConfig?.maxOutputTokens ?? 8192, // Sufficient for transcription responses
          temperature: this.config.generationConfig?.temperature ?? 0.1, // Low temperature for consistent transcription
          topP: this.config.generationConfig?.topP ?? 0.95, // Focused but not overly restrictive
          ...(this.config.generationConfig?.topK && {topK: this.config.generationConfig.topK}),
          ...(this.config.generationConfig?.presencePenalty && {
            presencePenalty: this.config.generationConfig.presencePenalty
          }),
          ...(this.config.generationConfig?.frequencyPenalty && {
            frequencyPenalty: this.config.generationConfig.frequencyPenalty
          })
          // Note: speechConfig removed as it's not needed for speech-to-text transcription
          // The speechConfig with voiceName is only needed for text-to-speech generation
        }
        // Note: inputAudioTranscription removed - not part of v1beta setup message format
      }
    }

    // Add system instruction if provided
    if (this.config.systemInstruction) {
      setupMessage.setup.systemInstruction = {
        parts: [{text: this.config.systemInstruction}]
      }
    }

    return setupMessage
  }

  /**
   * Send initial setup message to Gemini Live API v1beta
   */
  private async sendSetupMessage(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const setupMessage = this.createSetupMessage()

    // Include session ID if we have a current session (for resumption)
    if (this.currentSession) {
      // Add session context to the setup message
      logger.info('Including session context in setup message', {
        sessionId: this.currentSession.sessionId,
        messageCount: this.currentSession.messageCount,
        turnCount: this.currentSession.turnCount
      })

      // Note: The Gemini Live API doesn't have a direct session ID field in setup,
      // but we track this internally for session continuity
      this.sessionManager.recordConnectionEvent('connected', 'setup_message_sent')
    }

    // Validate setup message structure and content
    this.validateSetupMessage(setupMessage)

    try {
      const message = JSON.stringify(setupMessage)

      logger.info('Sending setup message to Gemini Live API', {
        model: this.config.model,
        responseModalities: this.config.responseModalities,
        hasSystemInstruction: !!this.config.systemInstruction,
        hasActiveSession: !!this.currentSession,
        sessionId: this.currentSession?.sessionId
      })

      this.ws.send(message)
      this.emit('setupMessageSent', setupMessage)

      // CRITICAL: Wait for setup response before allowing audio messages
      await this.waitForSetupResponse()

      // Update session with setup message sent
      if (this.currentSession) {
        this.sessionManager.updateActivity(this.currentSession.sessionId)
      }
    } catch (error) {
      const geminiError = this.errorHandler.handleError(
        error,
        {setupMessage},
        {type: ErrorType.API, retryable: false}
      )
      logger.error('Failed to send setup message', {
        errorId: geminiError.id,
        message: geminiError.message,
        sessionId: this.currentSession?.sessionId
      })

      // Mark session as having an error if setup fails
      if (this.currentSession) {
        this.sessionManager.markSessionError(`Setup message failed: ${geminiError.message}`)
      }

      throw geminiError
    }
  }

  /**
   * Validate setup message configuration
   */
  /**
   * Validate setup message for v1beta API compatibility
   * Enhanced validation following official Google documentation
   */
  private validateSetupMessage(setupMessage: SetupMessage): void {
    if (!setupMessage.setup.model) {
      throw new Error('Setup message must include a model specification')
    }

    if (!setupMessage.setup.model.startsWith('models/')) {
      throw new Error('Model specification must start with "models/" for v1beta API')
    }

    // Validate the model name contains expected patterns for Gemini Live
    const modelName = setupMessage.setup.model.replace('models/', '')
    if (!modelName.includes('gemini')) {
      logger.warn(
        'Model name does not contain "gemini", this may not be a valid Gemini Live model',
        {
          model: modelName
        }
      )
    }

    if (!setupMessage.setup.generationConfig?.responseModalities?.length) {
      throw new Error('Setup message must specify at least one response modality')
    }

    const validModalities = Object.values(ResponseModality)
    const invalidModalities = setupMessage.setup.generationConfig.responseModalities.filter(
      (modality: string) => !validModalities.includes(modality as ResponseModality)
    )

    if (invalidModalities.length > 0) {
      throw new Error(
        `Invalid response modalities: ${invalidModalities.join(', ')}. Valid options: ${validModalities.join(', ')}`
      )
    }

    // Validate generation config parameters
    const genConfig = setupMessage.setup.generationConfig
    if (
      genConfig.candidateCount !== undefined &&
      (genConfig.candidateCount < 1 || genConfig.candidateCount > 8)
    ) {
      throw new Error('candidateCount must be between 1 and 8')
    }

    if (
      genConfig.maxOutputTokens !== undefined &&
      (genConfig.maxOutputTokens < 1 || genConfig.maxOutputTokens > 32768)
    ) {
      throw new Error('maxOutputTokens must be between 1 and 32768')
    }

    if (
      genConfig.temperature !== undefined &&
      (genConfig.temperature < 0 || genConfig.temperature > 2)
    ) {
      throw new Error('temperature must be between 0.0 and 2.0')
    }

    if (genConfig.topP !== undefined && (genConfig.topP < 0 || genConfig.topP > 1)) {
      throw new Error('topP must be between 0.0 and 1.0')
    }

    if (genConfig.topK !== undefined && (genConfig.topK < 1 || genConfig.topK > 2048)) {
      throw new Error('topK must be between 1 and 2048')
    }

    // Validate system instruction format if provided
    if (setupMessage.setup.systemInstruction) {
      if (
        !setupMessage.setup.systemInstruction.parts ||
        !Array.isArray(setupMessage.setup.systemInstruction.parts)
      ) {
        throw new Error('System instruction must have a "parts" array')
      }

      if (setupMessage.setup.systemInstruction.parts.length === 0) {
        throw new Error('System instruction parts array cannot be empty')
      }

      for (const part of setupMessage.setup.systemInstruction.parts) {
        if (!part.text || typeof part.text !== 'string') {
          throw new Error(
            'Each system instruction part must have a "text" field with string content'
          )
        }
      }
    }

    logger.debug('Setup message validation passed for v1beta API', {
      model: setupMessage.setup.model,
      responseModalities: setupMessage.setup.generationConfig.responseModalities,
      hasSystemInstruction: !!setupMessage.setup.systemInstruction,
      generationConfig: {
        candidateCount: genConfig.candidateCount,
        maxOutputTokens: genConfig.maxOutputTokens,
        temperature: genConfig.temperature,
        topP: genConfig.topP
      }
    })
  }

  /**
   * Wait for setup response from Gemini Live API before sending audio
   * This is critical for proper protocol flow - must wait for server acknowledgment
   */
  private async waitForSetupResponse(): Promise<void> {
    // If setup is already complete, resolve immediately
    if (this.isSetupComplete) {
      logger.info('Setup already complete - audio can be sent immediately')
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        reject(new Error('Timeout waiting for setup response from Gemini Live API'))
      }, 15000) // Increased timeout to 15 seconds for better reliability

      // Listen for the setupComplete event from the main message handler
      const onSetupComplete = () => {
        logger.info('Setup complete event received - audio can now be sent')
        this.isSetupComplete = true

        // Now that setup is complete, process any queued messages
        this.processMessageQueue()

        clearTimeout(timeout)
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        resolve()
      }

      const onError = () => {
        clearTimeout(timeout)
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        reject(new Error('WebSocket error while waiting for setup response'))
      }

      const onClose = () => {
        clearTimeout(timeout)
        this.off('setupComplete', onSetupComplete)
        this.off('error', onError)
        this.off('close', onClose)
        reject(new Error('WebSocket closed while waiting for setup response'))
      }

      // Check if setup is complete before adding listeners (race condition protection)
      if (this.isSetupComplete) {
        clearTimeout(timeout)
        logger.info('Setup completed during listener setup - resolving immediately')
        resolve()
        return
      }

      // Listen for events instead of parsing messages directly
      this.on('setupComplete', onSetupComplete)
      this.on('error', onError)
      this.on('close', onClose)
    })
  }

  // ===== Response Modality Configuration Methods =====

  /**
   * Configure response modalities for the WebSocket connection
   */
  configureResponseModalities(modalities: ResponseModality[]): void {
    if (!modalities || modalities.length === 0) {
      throw new Error('At least one response modality must be specified')
    }

    // Validate modalities
    const validModalities = Object.values(ResponseModality)
    const invalidModalities = modalities.filter(modality => !validModalities.includes(modality))

    if (invalidModalities.length > 0) {
      throw new Error(
        `Invalid response modalities: ${invalidModalities.join(', ')}. Valid options: ${validModalities.join(', ')}`
      )
    }

    this.config.responseModalities = modalities

    logger.info('Response modalities configured', {
      modalities: modalities,
      previousModalities: this.config.responseModalities
    })
  }

  /**
   * Get currently configured response modalities
   */
  getResponseModalities(): ResponseModality[] {
    return this.config.responseModalities || [ResponseModality.TEXT]
  }

  /**
   * Check if a specific response modality is enabled
   */
  isModalityEnabled(modality: ResponseModality): boolean {
    const currentModalities = this.getResponseModalities()
    return currentModalities.includes(modality)
  }

  /**
   * Enable audio response modality (adds AUDIO to existing modalities)
   */
  enableAudioModality(): void {
    const currentModalities = this.getResponseModalities()
    if (!currentModalities.includes(ResponseModality.AUDIO)) {
      this.configureResponseModalities([...currentModalities, ResponseModality.AUDIO])
    }
  }

  /**
   * Disable audio response modality (removes AUDIO from modalities)
   */
  disableAudioModality(): void {
    const currentModalities = this.getResponseModalities()
    const filteredModalities = currentModalities.filter(
      modality => modality !== ResponseModality.AUDIO
    )

    // Ensure at least TEXT remains
    if (filteredModalities.length === 0) {
      this.configureResponseModalities([ResponseModality.TEXT])
    } else {
      this.configureResponseModalities(filteredModalities)
    }
  }

  /**
   * Reset to text-only modality
   */
  resetToTextOnly(): void {
    this.configureResponseModalities([ResponseModality.TEXT])
  }

  /**
   * Enable multimodal responses (both TEXT and AUDIO)
   */
  enableMultimodalResponses(): void {
    this.configureResponseModalities([ResponseModality.TEXT, ResponseModality.AUDIO])
  }

  /**
   * Get response modality configuration summary
   */
  getModalityConfiguration(): {
    enabled: ResponseModality[]
    textEnabled: boolean
    audioEnabled: boolean
    isMultimodal: boolean
  } {
    const enabled = this.getResponseModalities()
    return {
      enabled,
      textEnabled: enabled.includes(ResponseModality.TEXT),
      audioEnabled: enabled.includes(ResponseModality.AUDIO),
      isMultimodal: enabled.length > 1
    }
  }

  // ===== Enhanced Message Parsing Methods =====

  /**
   * Parse a response using the enhanced gemini-live-2.5-flash-preview parser
   */
  parseGeminiResponse(rawMessage: unknown): ParsedGeminiResponse {
    return Gemini2FlashMessageParser.parseResponse(rawMessage)
  }

  /**
   * Validate a parsed Gemini response
   */
  validateGeminiResponse(response: ParsedGeminiResponse): {isValid: boolean; errors: string[]} {
    return Gemini2FlashMessageParser.validateResponse(response)
  }

  /**
   * Get parsing statistics and metrics
   */
  getParsingMetrics(): {
    totalMessagesParsed: number
    validMessages: number
    invalidMessages: number
    messageTypeDistribution: Record<string, number>
    errorDistribution: Record<string, number>
  } {
    // This would need to be tracked over time - for now return basic structure
    return {
      totalMessagesParsed: 0,
      validMessages: 0,
      invalidMessages: 0,
      messageTypeDistribution: {},
      errorDistribution: {}
    }
  }

  // ===== Server Error Classification and Recovery Methods =====

  /**
   * Classify server errors to appropriate ErrorType for v1beta API
   */
  private classifyServerError(serverError: ServerErrorData): ErrorType {
    if (!serverError || !serverError.code) {
      return ErrorType.API
    }

    const errorCode = String(serverError.code).toLowerCase()
    const errorMessage = String(serverError.message || '').toLowerCase()

    // Authentication errors (enhanced for v1beta)
    if (
      errorCode.includes('auth') ||
      errorCode.includes('unauthenticated') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid api key') ||
      errorMessage.includes('authentication failed') ||
      errorCode === '401' ||
      errorCode === '16' // gRPC UNAUTHENTICATED
    ) {
      return ErrorType.AUTHENTICATION
    }

    // Permission denied (v1beta specific)
    if (
      errorCode.includes('permission') ||
      errorMessage.includes('permission denied') ||
      errorMessage.includes('access denied') ||
      errorCode === '403' ||
      errorCode === '7' // gRPC PERMISSION_DENIED
    ) {
      return ErrorType.AUTHENTICATION
    }

    // Rate limiting (enhanced for v1beta)
    if (
      errorCode.includes('rate') ||
      errorCode.includes('throttle') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorCode === '429' ||
      errorCode === '8' // gRPC RESOURCE_EXHAUSTED
    ) {
      return ErrorType.RATE_LIMIT
    }

    // Quota exceeded (enhanced for v1beta)
    if (
      errorCode.includes('quota') ||
      errorCode.includes('limit') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('limit exceeded') ||
      errorMessage.includes('billing') ||
      errorCode === '403'
    ) {
      return ErrorType.QUOTA_EXCEEDED
    }

    // Service unavailable (enhanced for v1beta)
    if (
      errorCode.includes('unavailable') ||
      errorCode.includes('internal') ||
      errorMessage.includes('unavailable') ||
      errorMessage.includes('internal error') ||
      errorMessage.includes('server error') ||
      errorCode === '503' ||
      errorCode === '500' ||
      errorCode === '14' || // gRPC UNAVAILABLE
      errorCode === '13' // gRPC INTERNAL
    ) {
      return ErrorType.SERVICE_UNAVAILABLE
    }

    // Model-specific errors
    if (
      errorCode.includes('model') ||
      errorMessage.includes('model') ||
      errorMessage.includes('invalid model')
    ) {
      return ErrorType.MODEL_ERROR
    }

    // Session errors
    if (errorCode.includes('session') || errorMessage.includes('session')) {
      return ErrorType.SESSION_ERROR
    }

    // Validation errors
    if (
      errorCode.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorCode === '400'
    ) {
      return ErrorType.VALIDATION
    }

    // Default to API error
    return ErrorType.API
  }

  /**
   * Determine if a server error is retryable
   */
  private isServerErrorRetryable(serverError: ServerErrorData): boolean {
    if (!serverError) {
      return false
    }

    const errorType = this.classifyServerError(serverError)

    // Non-retryable error types
    const nonRetryableTypes = [
      ErrorType.AUTHENTICATION,
      ErrorType.VALIDATION,
      ErrorType.MODEL_ERROR,
      ErrorType.QUOTA_EXCEEDED // Usually permanent until quota resets
    ]

    return !nonRetryableTypes.includes(errorType)
  }

  /**
   * Determine if we should attempt reconnection for a server error
   */
  private shouldReconnectOnServerError(serverError: ServerErrorData): boolean {
    if (!serverError) {
      return false
    }

    const errorType = this.classifyServerError(serverError)

    // Reconnect for network-related and temporary service errors
    const reconnectableTypes = [
      ErrorType.NETWORK,
      ErrorType.SERVICE_UNAVAILABLE,
      ErrorType.SESSION_ERROR,
      ErrorType.WEBSOCKET
    ]

    return reconnectableTypes.includes(errorType)
  }

  /**
   * Handle server error recovery without async in handleMessage
   */
  private handleServerErrorRecovery(serverError: GeminiError): void {
    // Use setTimeout to avoid async issues in handleMessage
    setTimeout(async () => {
      try {
        await this.handleErrorRecovery(serverError)
      } catch (recoveryError) {
        logger.error('Server error recovery failed', {
          originalError: serverError.type,
          recoveryError:
            recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
        })
      }
    }, 0)
  }

  /**
   * Safely sanitize input for use as Map keys to prevent NoSQL injection
   */
  private sanitizeMapKey(input: unknown): string {
    if (input === null || input === undefined) {
      return 'null'
    }

    // Convert to string and sanitize
    const str = String(input)

    // Remove potentially harmful characters and limit length
    return str
      .replace(/[^\w\-_.:]/g, '_') // Keep only alphanumeric, hyphens, underscores, dots, and colons
      .substring(0, 100) // Limit length to prevent excessive memory usage
      .trim()
  }

  /**
   * Handle go away message from server (v1beta)
   */
  private handleGoAwayMessage(timeLeft?: {seconds: number; nanos: number}): void {
    logger.info('Server sent go away message', {
      timeLeft,
      sessionId: this.currentSession?.sessionId
    })

    if (timeLeft) {
      const totalMs = timeLeft.seconds * 1000 + timeLeft.nanos / 1_000_000
      logger.info(`Server will disconnect in ${totalMs}ms`)

      // Schedule graceful disconnect before server forces it
      setTimeout(
        () => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.info('Gracefully closing connection before server timeout')
            this.disconnect()
          }
        },
        Math.max(0, totalMs - 1000)
      ) // Disconnect 1 second before server timeout
    } else {
      // No time specified, disconnect immediately
      logger.info('Immediate disconnect requested by server')
      this.disconnect()
    }
  }

  /**
   * Handle session resumption update (v1beta)
   */
  private handleSessionResumptionUpdate(update?: {newHandle: string; resumable: boolean}): void {
    if (!update || !this.currentSession) {
      logger.debug('No session resumption update or current session to update')
      return
    }

    logger.info('Received session resumption update', {
      sessionId: this.currentSession.sessionId,
      newHandle: update.newHandle ? 'present' : 'empty',
      resumable: update.resumable
    })

    // Update session manager with new resumption capabilities
    if (update.newHandle && update.resumable) {
      // Store the session handle for potential resumption
      // Note: This would need SessionData interface extension for full implementation
      this.sessionManager.recordConnectionEvent('connected', 'resumption_handle_received')

      // Store resumption info in a separate structure for now
      logger.info('Session resumption enabled', {
        sessionId: this.currentSession.sessionId,
        hasHandle: true
      })
    } else if (!update.resumable) {
      // Session is no longer resumable
      this.sessionManager.recordConnectionEvent('disconnected', 'resumption_handle_invalidated')

      logger.info('Session resumption disabled', {
        sessionId: this.currentSession.sessionId
      })
    }
  }
}

// Default export for easy importing
export default GeminiLiveWebSocketClient
