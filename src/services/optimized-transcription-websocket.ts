/**
 * Optimized WebSocket Service for Low-Latency Transcription
 * Implements advanced WebSocket optimizations for YouTube-like performance
 */

import {EventEmitter} from 'events'
import {transcriptionBenchmark} from '../utils/transcription-performance-benchmark'

export interface OptimizedWebSocketConfig {
  url: string
  apiKey: string
  reconnectAttempts?: number
  reconnectDelay?: number
  heartbeatInterval?: number
  connectionTimeout?: number
  enableCompression?: boolean
  enableBinaryTransmission?: boolean
  poolSize?: number
  latencyOptimization?: 'interactive' | 'balanced' | 'playback'
}

export interface TranscriptionMessage {
  type: 'setup' | 'audio' | 'text' | 'error' | 'heartbeat'
  data?: any
  timestamp?: number
  messageId?: string
}

export interface ConnectionMetrics {
  connectionTime: number
  firstResponseTime: number
  averageLatency: number
  messagesPerSecond: number
  errorRate: number
}

export enum WebSocketState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export class OptimizedTranscriptionWebSocket extends EventEmitter {
  private config: Required<OptimizedWebSocketConfig>
  private connectionPool: WebSocket[] = []
  private activeConnection: WebSocket | null = null
  private state: WebSocketState = WebSocketState.DISCONNECTED
  private reconnectAttempts = 0
  private heartbeatTimer: NodeJS.Timeout | null = null
  private connectionTimer: NodeJS.Timeout | null = null
  private messageQueue: TranscriptionMessage[] = []
  private metrics: ConnectionMetrics = {
    connectionTime: 0,
    firstResponseTime: 0,
    averageLatency: 0,
    messagesPerSecond: 0,
    errorRate: 0
  }
  private latencyTracker: number[] = []
  private messageCount = 0
  private errorCount = 0
  private startTime = 0

  constructor(config: OptimizedWebSocketConfig) {
    super()

    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      enableCompression: true,
      enableBinaryTransmission: true,
      poolSize: 3,
      latencyOptimization: 'interactive',
      ...config
    }

    // Pre-warm connection pool for instant connections
    this.initializeConnectionPool()
  }

  /**
   * Initialize connection pool for instant access
   */
  private async initializeConnectionPool(): Promise<void> {
    console.log('🏊 Initializing WebSocket connection pool...')

    for (let i = 0; i < this.config.poolSize; i++) {
      try {
        const connection = await this.createOptimizedConnection()
        if (connection.readyState === WebSocket.OPEN) {
          this.connectionPool.push(connection)
        }
      } catch (error) {
        console.warn(`Failed to create pooled connection ${i + 1}:`, error)
      }
    }

    console.log(`✅ Connection pool initialized with ${this.connectionPool.length} connections`)
  }

  /**
   * Create an optimized WebSocket connection
   */
  private createOptimizedConnection(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      transcriptionBenchmark.markWebSocketConnectionStart()

      const wsUrl = this.buildOptimizedUrl()
      const connection = new WebSocket(wsUrl, this.getOptimizedProtocols())

      // Optimize binary data handling
      if (this.config.enableBinaryTransmission) {
        connection.binaryType = 'arraybuffer'
      }

      const connectionTimeout = setTimeout(() => {
        connection.close()
        reject(new Error('Connection timeout'))
      }, this.config.connectionTimeout)

      connection.onopen = () => {
        clearTimeout(connectionTimeout)
        transcriptionBenchmark.markWebSocketConnected()

        console.log('🔌 Optimized WebSocket connection established')
        resolve(connection)
      }

      connection.onerror = error => {
        clearTimeout(connectionTimeout)
        this.errorCount++
        reject(error)
      }

      connection.onclose = () => {
        clearTimeout(connectionTimeout)
      }
    })
  }

  /**
   * Build optimized WebSocket URL with compression and performance hints
   */
  private buildOptimizedUrl(): string {
    const baseUrl = this.config.url
    const params = new URLSearchParams({
      key: this.config.apiKey,
      // Enable compression if supported
      ...(this.config.enableCompression && {compression: 'deflate'}),
      // Performance hints
      latency: this.config.latencyOptimization,
      // Request smaller response chunks for faster processing
      chunk_size: '1024',
      // Enable streaming for real-time responses
      stream: 'true'
    })

    return `${baseUrl}?${params.toString()}`
  }

  /**
   * Get optimized WebSocket protocols
   */
  private getOptimizedProtocols(): string[] {
    const protocols: string[] = []

    if (this.config.enableCompression) {
      protocols.push('permessage-deflate')
    }

    // Add custom protocol for transcription optimization
    protocols.push('transcription-v1')

    return protocols
  }

  /**
   * Connect using connection pool for instant connection
   */
  async connect(): Promise<void> {
    if (this.state === WebSocketState.CONNECTED) {
      console.log('Already connected')
      return
    }

    this.state = WebSocketState.CONNECTING
    this.startTime = performance.now()

    try {
      // Try to get a connection from the pool first
      if (this.connectionPool.length > 0) {
        console.log('🚀 Using pooled connection for instant connect')
        this.activeConnection = this.connectionPool.shift()!
        this.setupConnectionHandlers(this.activeConnection)
        this.onConnectionEstablished()
      } else {
        // Create new connection if pool is empty
        console.log('⚡ Creating new optimized connection')
        this.activeConnection = await this.createOptimizedConnection()
        this.setupConnectionHandlers(this.activeConnection)
        this.onConnectionEstablished()
      }

      // Replenish the pool in the background
      this.replenishConnectionPool()
    } catch (error) {
      this.state = WebSocketState.ERROR
      this.emit('error', error)

      if (this.reconnectAttempts < this.config.reconnectAttempts) {
        console.log(
          `🔄 Reconnection attempt ${this.reconnectAttempts + 1}/${this.config.reconnectAttempts}`
        )
        setTimeout(() => this.reconnect(), this.config.reconnectDelay)
      }
    }
  }

  /**
   * Setup optimized connection event handlers
   */
  private setupConnectionHandlers(connection: WebSocket): void {
    connection.onmessage = event => this.handleOptimizedMessage(event)
    connection.onerror = error => this.handleConnectionError(error)
    connection.onclose = event => this.handleConnectionClose(event)
  }

  /**
   * Handle connection establishment
   */
  private onConnectionEstablished(): void {
    this.state = WebSocketState.CONNECTED
    this.reconnectAttempts = 0
    this.metrics.connectionTime = performance.now() - this.startTime

    console.log(`✅ Connected in ${this.metrics.connectionTime.toFixed(2)}ms`)

    // Start heartbeat to keep connection alive
    this.startHeartbeat()

    // Send initial setup message
    this.sendInitialSetup()

    // Process any queued messages
    this.processMessageQueue()

    this.emit('connected', this.metrics)
  }

  /**
   * Handle optimized message processing
   */
  private handleOptimizedMessage(event: MessageEvent): void {
    const receiveTime = performance.now()
    this.messageCount++

    // Mark first response for benchmarking
    if (this.messageCount === 1) {
      transcriptionBenchmark.markFirstResponseReceived()
      this.metrics.firstResponseTime = receiveTime - this.startTime
      console.log(`🎯 First response in ${this.metrics.firstResponseTime.toFixed(2)}ms`)
    }

    try {
      let data

      // Handle binary data efficiently
      if (event.data instanceof ArrayBuffer) {
        data = this.processBinaryMessage(event.data)
      } else {
        data = JSON.parse(event.data)
      }

      // Track latency for performance metrics
      if (data.timestamp) {
        const latency = receiveTime - data.timestamp
        this.latencyTracker.push(latency)
        this.updateLatencyMetrics()
      }

      // Process different message types efficiently
      this.processTranscriptionMessage(data, receiveTime)
    } catch (error) {
      console.error('Error processing message:', error)
      this.errorCount++
    }
  }

  /**
   * Process binary messages for optimal performance
   */
  private processBinaryMessage(buffer: ArrayBuffer): any {
    // Implement efficient binary message processing
    // This could include audio data or compressed text
    const view = new DataView(buffer)
    const messageType = view.getUint8(0)

    switch (messageType) {
      case 1: // Audio data
        return {
          type: 'audio',
          data: buffer.slice(1),
          timestamp: performance.now()
        }
      case 2: // Compressed text
        const textData = new TextDecoder().decode(buffer.slice(1))
        return JSON.parse(textData)
      default:
        throw new Error(`Unknown binary message type: ${messageType}`)
    }
  }

  /**
   * Process transcription messages with optimized handling
   */
  private processTranscriptionMessage(data: any, receiveTime: number): void {
    transcriptionBenchmark.markTranscriptionReceived()

    switch (data.type) {
      case 'transcription':
        this.emit('transcription', {
          text: data.text,
          confidence: data.confidence,
          isPartial: data.isPartial,
          timestamp: receiveTime
        })
        break

      case 'setup_complete':
        console.log('🎉 Setup complete, ready for transcription')
        this.emit('ready')
        break

      case 'error':
        console.error('Server error:', data.error)
        this.emit('error', data.error)
        break

      default:
        this.emit('message', data)
    }
  }

  /**
   * Send optimized audio data
   */
  sendAudioData(audioData: Float32Array | ArrayBuffer): void {
    if (this.state !== WebSocketState.CONNECTED || !this.activeConnection) {
      this.queueMessage({
        type: 'audio',
        data: audioData,
        timestamp: performance.now()
      })
      return
    }

    const message = this.createOptimizedAudioMessage(audioData)
    this.sendOptimizedMessage(message)
  }

  /**
   * Create optimized audio message
   */
  private createOptimizedAudioMessage(audioData: Float32Array | ArrayBuffer): ArrayBuffer | string {
    if (this.config.enableBinaryTransmission) {
      // Send as optimized binary data
      const buffer = audioData instanceof ArrayBuffer ? audioData : audioData.buffer
      const messageBuffer = new ArrayBuffer(buffer.byteLength + 1)
      const view = new DataView(messageBuffer)

      // Message type indicator (1 = audio)
      view.setUint8(0, 1)

      // Copy audio data
      new Uint8Array(messageBuffer, 1).set(new Uint8Array(buffer))

      return messageBuffer
    } else {
      // Fallback to JSON with base64 encoding
      const base64Data = btoa(
        String.fromCharCode(
          ...new Uint8Array(audioData instanceof ArrayBuffer ? audioData : audioData.buffer)
        )
      )

      return JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm',
              data: base64Data
            }
          ]
        },
        timestamp: performance.now()
      })
    }
  }

  /**
   * Send message with optimization
   */
  private sendOptimizedMessage(message: ArrayBuffer | string): void {
    if (!this.activeConnection || this.activeConnection.readyState !== WebSocket.OPEN) {
      console.warn('Connection not ready, queuing message')
      return
    }

    try {
      this.activeConnection.send(message)
      transcriptionBenchmark.markFirstMessageSent()
    } catch (error) {
      console.error('Failed to send message:', error)
      this.emit('error', error)
    }
  }

  /**
   * Send initial setup message with optimizations
   */
  private sendInitialSetup(): void {
    const setupMessage = {
      setup: {
        model: 'models/gemini-2.0-flash-thinking-exp',
        generationConfig: {
          responseModalities: ['TEXT'],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}}
          },
          // Optimize for low latency
          candidateCount: 1,
          maxOutputTokens: 1024,
          temperature: 0.1
        },
        systemInstruction: {
          parts: [
            {
              text: 'You are a real-time transcription assistant. Respond with short, accurate transcriptions as quickly as possible.'
            }
          ]
        }
      },
      timestamp: performance.now()
    }

    this.sendOptimizedMessage(JSON.stringify(setupMessage))
  }

  /**
   * Replenish connection pool in background
   */
  private async replenishConnectionPool(): Promise<void> {
    while (this.connectionPool.length < this.config.poolSize) {
      try {
        const connection = await this.createOptimizedConnection()
        this.connectionPool.push(connection)
      } catch (error) {
        console.warn('Failed to replenish connection pool:', error)
        break
      }
    }
  }

  /**
   * Queue messages when connection is not ready
   */
  private queueMessage(message: TranscriptionMessage): void {
    this.messageQueue.push(message)

    // Limit queue size to prevent memory issues
    if (this.messageQueue.length > 100) {
      this.messageQueue.shift()
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!

      if (message.type === 'audio') {
        this.sendAudioData(message.data)
      }
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.activeConnection?.readyState === WebSocket.OPEN) {
        this.sendOptimizedMessage(
          JSON.stringify({
            type: 'heartbeat',
            timestamp: performance.now()
          })
        )
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(): void {
    if (this.latencyTracker.length > 0) {
      this.metrics.averageLatency =
        this.latencyTracker.reduce((a, b) => a + b, 0) / this.latencyTracker.length

      // Keep only recent latency measurements
      if (this.latencyTracker.length > 100) {
        this.latencyTracker = this.latencyTracker.slice(-50)
      }
    }

    // Calculate messages per second
    const elapsedSeconds = (performance.now() - this.startTime) / 1000
    this.metrics.messagesPerSecond = this.messageCount / elapsedSeconds

    // Calculate error rate
    this.metrics.errorRate = this.messageCount > 0 ? this.errorCount / this.messageCount : 0
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Event): void {
    console.error('WebSocket error:', error)
    this.errorCount++
    this.emit('error', error)
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(event: CloseEvent): void {
    console.log('Connection closed:', event.code, event.reason)
    this.state = WebSocketState.DISCONNECTED
    this.activeConnection = null

    this.stopHeartbeat()

    // Attempt reconnection if not intentionally closed
    if (event.code !== 1000 && this.reconnectAttempts < this.config.reconnectAttempts) {
      this.reconnect()
    }

    this.emit('disconnected', event)
  }

  /**
   * Reconnect with exponential backoff
   */
  private reconnect(): void {
    this.reconnectAttempts++
    this.state = WebSocketState.RECONNECTING

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    setTimeout(() => {
      console.log(`🔄 Reconnecting (attempt ${this.reconnectAttempts})...`)
      this.connect()
    }, delay)
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Get current connection metrics
   */
  getMetrics(): ConnectionMetrics {
    this.updateLatencyMetrics()
    return {...this.metrics}
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.state
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.state = WebSocketState.DISCONNECTED

    // Close active connection
    if (this.activeConnection) {
      this.activeConnection.close(1000, 'Client disconnect')
      this.activeConnection = null
    }

    // Close all pooled connections
    this.connectionPool.forEach(connection => {
      connection.close(1000, 'Pool cleanup')
    })
    this.connectionPool = []

    this.stopHeartbeat()

    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }

    console.log('🔌 WebSocket disconnected and cleaned up')
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
  }
}
