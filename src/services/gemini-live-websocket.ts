/**
 * Gemini Live API WebSocket Client
 * Handles real-time bidirectional communication with Google's Gemini Live API
 */

import { EventEmitter } from 'events'
import { GeminiMessageHandler, MessageType, MessagePriority, type ProcessedMessage } from './gemini-message-handler'

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
  private heartbeatTimer: NodeJS.Timeout | null = null
  private connectionTimeout: number
  private reconnectTimer: NodeJS.Timeout | null = null
  private messageQueue: RealtimeInput[] = []
  private isClosingIntentionally = false
  private messageHandler: GeminiMessageHandler

  constructor(config: GeminiLiveConfig) {
    super()
    this.config = {
      model: 'gemini-2.0-flash-live-001',
      responseModalities: ['AUDIO'],
      systemInstruction: 'You are a helpful assistant and answer in a friendly tone.',
      reconnectAttempts: 5,
      heartbeatInterval: 30000, // 30 seconds
      connectionTimeout: 10000, // 10 seconds
      ...config
    }
    this.maxReconnectAttempts = this.config.reconnectAttempts!
    this.heartbeatInterval = this.config.heartbeatInterval!
    this.connectionTimeout = this.config.connectionTimeout!

    // Initialize message handler
    this.messageHandler = new GeminiMessageHandler()
    this.setupMessageHandlerEvents()
  }

  /**
   * Establish WebSocket connection to Gemini Live API
   */
  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED || 
        this.connectionState === ConnectionState.CONNECTING) {
      console.log('Already connected or connecting')
      return
    }

    this.setConnectionState(ConnectionState.CONNECTING)
    this.isClosingIntentionally = false

    try {
      // Construct WebSocket URL for Gemini Live API
      const wsUrl = this.buildWebSocketUrl()
      
      console.log('Connecting to Gemini Live API:', wsUrl)
      this.ws = new WebSocket(wsUrl)

      // Set up connection timeout
      const timeoutId = setTimeout(() => {
        if (this.connectionState === ConnectionState.CONNECTING) {
          console.error('Connection timeout')
          this.handleConnectionError(new Error('Connection timeout'))
        }
      }, this.connectionTimeout)

      this.ws.onopen = () => {
        clearTimeout(timeoutId)
        console.log('WebSocket connected to Gemini Live API')
        this.setConnectionState(ConnectionState.CONNECTED)
        this.reconnectAttempts = 0
        this.startHeartbeat()
        this.processMessageQueue()
        this.emit('connected')
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event)
      }

      this.ws.onerror = (error) => {
        clearTimeout(timeoutId)
        console.error('WebSocket error:', error)
        this.handleConnectionError(new Error('WebSocket connection error'))
      }

      this.ws.onclose = (event) => {
        clearTimeout(timeoutId)
        console.log('WebSocket closed:', event.code, event.reason)
        this.handleConnectionClose(event)
      }

    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error)
      this.handleConnectionError(error as Error)
    }
  }

  /**
   * Build WebSocket URL for Gemini Live API
   */
  private buildWebSocketUrl(): string {
    const baseUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.LiveStreaming'
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
      console.log('Connection not ready, queueing message')
      this.messageQueue.push(input)
      return
    }

    if (!this.ws) {
      console.error('WebSocket not initialized')
      return
    }

    try {
      // For now, send directly but also process through message handler for validation
      const message = JSON.stringify({
        client_content: {
          turns: [{
            role: 'user',
            parts: this.buildMessageParts(input)
          }],
          turn_complete: true
        }
      })

      console.log('Sending message to Gemini Live API:', message.substring(0, 200) + '...')
      this.ws.send(message)
      this.emit('messageSent', input)
      
      // Also queue through message handler for future integration
      this.messageHandler.queueMessage(input, MessageType.CLIENT_CONTENT, MessagePriority.HIGH)
      
    } catch (error) {
      console.error('Failed to send message:', error)
      this.emit('error', error)
    }
  }

  /**
   * Build message parts from realtime input
   */
  private buildMessageParts(input: RealtimeInput): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = []

    if (input.text) {
      parts.push({ text: input.text })
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
      // Use message handler to process incoming message
      const processed = this.messageHandler.processIncomingMessage(event.data)
      
      console.log(`Received message type: ${processed.type}, valid: ${processed.isValid}`)
      
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
            break
          case MessageType.ERROR:
            this.emit('apiError', processed.payload)
            break
        }
      } else {
        console.warn('Invalid message received:', processed.errors)
        this.emit('invalidMessage', processed)
      }

    } catch (error) {
      console.error('Failed to process message:', error)
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
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.connectionState === ConnectionState.CONNECTED && this.ws) {
        try {
          // Send a ping message to keep connection alive
          this.ws.send(JSON.stringify({ ping: Date.now() }))
        } catch (error) {
          console.error('Failed to send heartbeat:', error)
          this.handleConnectionError(error as Error)
        }
      }
    }, this.heartbeatInterval)
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
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    console.error('Connection error:', error)
    this.setConnectionState(ConnectionState.ERROR)
    this.stopHeartbeat()
    this.emit('error', error)

    if (!this.isClosingIntentionally) {
      this.attemptReconnection()
    }
  }

  /**
   * Handle connection close events
   */
  private handleConnectionClose(event: CloseEvent): void {
    this.setConnectionState(ConnectionState.DISCONNECTED)
    this.stopHeartbeat()
    this.emit('disconnected', event)

    if (!this.isClosingIntentionally && event.code !== 1000) {
      this.attemptReconnection()
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      this.emit('maxReconnectAttemptsReached')
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000) // Max 30 seconds
    this.reconnectAttempts++

    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`)
    this.setConnectionState(ConnectionState.RECONNECTING)

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error)
      })
    }, delay)
  }

  /**
   * Set connection state and emit state change event
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const previousState = this.connectionState
      this.connectionState = state
      console.log(`Connection state changed: ${previousState} -> ${state}`)
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
    console.log('Closing WebSocket connection')
    this.isClosingIntentionally = true
    
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
   * Clean up resources
   */
  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
    this.messageQueue = []
  }

  /**
   * Set up event listeners for the message handler
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
}

// Default export for easy importing
export default GeminiLiveWebSocketClient
