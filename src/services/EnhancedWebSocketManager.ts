/**
 * Enhanced WebSocket Manager for Answer Display
 * 
 * Provides robust WebSocket connection management with automatic reconnection,
 * message queuing, performance monitoring, and comprehensive error handling.
 */

import { EventEmitter } from 'events'

export interface WebSocketConfig {
  url: string
  protocols?: string[]
  
  // Reconnection settings
  maxReconnectAttempts: number
  reconnectInterval: number
  maxReconnectInterval: number
  reconnectDecay: number
  
  // Connection settings
  connectionTimeout: number
  heartbeatInterval: number
  
  // Message settings
  maxQueueSize: number
  maxMessageSize: number
  
  // Performance settings
  enableCompression: boolean
  batchMessages: boolean
  batchTimeout: number
}

export interface WebSocketMessage {
  id: string
  type: string
  data: any
  timestamp: number
  priority?: 'low' | 'normal' | 'high'
  retry?: boolean
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  reconnectCount: number
  lastError?: Error
  connectionTime?: number
  lastPingTime?: number
  latency?: number
}

export type WebSocketEventMap = {
  'connection-state-change': (state: ConnectionState) => void
  'message': (message: WebSocketMessage) => void
  'error': (error: Error) => void
  'reconnect-attempt': (attempt: number, maxAttempts: number) => void
  'reconnect-success': () => void
  'reconnect-failed': () => void
  'message-queued': (message: WebSocketMessage) => void
  'message-sent': (message: WebSocketMessage) => void
  'performance-metrics': (metrics: any) => void
}

class EnhancedWebSocketManager extends EventEmitter {
  private config: WebSocketConfig
  private ws: WebSocket | null = null
  private connectionState: ConnectionState
  private messageQueue: WebSocketMessage[] = []
  private pendingMessages: Map<string, WebSocketMessage> = new Map()
  
  // Timers and intervals
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private connectionTimer: NodeJS.Timeout | null = null
  private batchTimer: NodeJS.Timeout | null = null
  
  // Performance tracking
  private sentMessageCount = 0
  private receivedMessageCount = 0
  private bytesSent = 0
  private bytesReceived = 0
  private startTime = Date.now()

  constructor(config: Partial<WebSocketConfig> = {}) {
    super()
    
    this.config = {
      url: '',
      maxReconnectAttempts: 5,
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      reconnectDecay: 1.5,
      connectionTimeout: 10000,
      heartbeatInterval: 30000,
      maxQueueSize: 100,
      maxMessageSize: 1024 * 1024, // 1MB
      enableCompression: true,
      batchMessages: false,
      batchTimeout: 100,
      ...config
    }
    
    this.connectionState = {
      status: 'disconnected',
      reconnectCount: 0
    }
  }

  // Public API
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState.status === 'connected' || this.connectionState.status === 'connecting') {
        resolve()
        return
      }

      this.updateConnectionState({ status: 'connecting', lastError: undefined })
      
      try {
        // Create WebSocket with optional protocols
        this.ws = new WebSocket(this.config.url, this.config.protocols)
        
        // Set up connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close()
            reject(new Error('Connection timeout'))
          }
        }, this.config.connectionTimeout)

        // WebSocket event handlers
        this.ws.onopen = () => {
          this.handleOpen()
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event)
        }

        this.ws.onclose = (event) => {
          this.handleClose(event)
        }

        this.ws.onerror = (event) => {
          const error = new Error(`WebSocket error: ${event.type}`)
          this.handleError(error)
          reject(error)
        }

      } catch (error) {
        const wsError = error instanceof Error ? error : new Error('Failed to create WebSocket')
        this.handleError(wsError)
        reject(wsError)
      }
    })
  }

  disconnect(): void {
    this.clearTimers()
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect')
      this.ws = null
    }
    
    this.updateConnectionState({ status: 'disconnected', reconnectCount: 0 })
  }

  sendMessage(type: string, data: any, options: Partial<WebSocketMessage> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const message: WebSocketMessage = {
        id: this.generateMessageId(),
        type,
        data,
        timestamp: Date.now(),
        priority: 'normal',
        retry: true,
        ...options
      }

      // Check message size
      const messageSize = JSON.stringify(message).length
      if (messageSize > this.config.maxMessageSize) {
        reject(new Error(`Message too large: ${messageSize} bytes`))
        return
      }

      // If connected, send immediately
      if (this.connectionState.status === 'connected' && this.ws) {
        this.doSendMessage(message)
        resolve()
      } else {
        // Queue message for later
        this.queueMessage(message)
        this.emit('message-queued', message)
        resolve()
      }
    })
  }

  getConnectionState(): ConnectionState {
    return { ...this.connectionState }
  }

  getQueueSize(): number {
    return this.messageQueue.length
  }

  getPerformanceMetrics() {
    const now = Date.now()
    const uptime = now - this.startTime
    
    return {
      uptime,
      sentMessageCount: this.sentMessageCount,
      receivedMessageCount: this.receivedMessageCount,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      messagesPerSecond: this.sentMessageCount / (uptime / 1000),
      averageMessageSize: this.bytesSent / Math.max(1, this.sentMessageCount),
      queueSize: this.messageQueue.length,
      pendingMessages: this.pendingMessages.size,
      connectionState: this.connectionState
    }
  }

  // Private methods
  private handleOpen(): void {
    this.clearTimers()
    
    this.updateConnectionState({
      status: 'connected',
      connectionTime: Date.now(),
      reconnectCount: 0
    })
    
    this.startHeartbeat()
    this.flushMessageQueue()
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage
      
      this.bytesReceived += event.data.length
      this.receivedMessageCount++
      
      // Handle heartbeat responses
      if (message.type === 'pong') {
        this.handlePong(message)
        return
      }
      
      // Remove from pending messages if it's a response
      if (message.id && this.pendingMessages.has(message.id)) {
        this.pendingMessages.delete(message.id)
      }
      
      this.emit('message', message)
      
    } catch (error) {
      const parseError = new Error(`Failed to parse message: ${event.data}`)
      this.handleError(parseError)
    }
  }

  private handleClose(event: CloseEvent): void {
    this.clearTimers()
    this.ws = null
    
    const wasConnected = this.connectionState.status === 'connected'
    
    // Determine if we should attempt reconnection
    const shouldReconnect = 
      event.code !== 1000 && // Not a normal closure
      event.code !== 1001 && // Not going away
      this.connectionState.reconnectCount < this.config.maxReconnectAttempts
    
    if (shouldReconnect && wasConnected) {
      this.attemptReconnection()
    } else {
      this.updateConnectionState({
        status: 'disconnected',
        lastError: new Error(`WebSocket closed: ${event.code} ${event.reason}`)
      })
    }
  }

  private handleError(error: Error): void {
    this.updateConnectionState({
      status: 'error',
      lastError: error
    })
    
    this.emit('error', error)
  }

  private attemptReconnection(): void {
    const attempt = this.connectionState.reconnectCount + 1
    
    this.updateConnectionState({
      status: 'reconnecting',
      reconnectCount: attempt
    })
    
    this.emit('reconnect-attempt', attempt, this.config.maxReconnectAttempts)
    
    // Calculate backoff delay
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(this.config.reconnectDecay, attempt - 1),
      this.config.maxReconnectInterval
    )
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect()
        this.emit('reconnect-success')
      } catch (error) {
        if (attempt >= this.config.maxReconnectAttempts) {
          this.updateConnectionState({
            status: 'error',
            lastError: new Error('Max reconnection attempts exceeded')
          })
          this.emit('reconnect-failed')
        } else {
          // Try again
          this.attemptReconnection()
        }
      }
    }, delay)
  }

  private doSendMessage(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }
    
    try {
      const messageString = JSON.stringify(message)
      this.ws.send(messageString)
      
      this.bytesSent += messageString.length
      this.sentMessageCount++
      
      // Track pending messages that expect responses
      if (message.retry) {
        this.pendingMessages.set(message.id, message)
      }
      
      this.emit('message-sent', message)
      
    } catch (error) {
      const sendError = error instanceof Error ? error : new Error('Send failed')
      this.handleError(sendError)
      throw sendError
    }
  }

  private queueMessage(message: WebSocketMessage): void {
    // Check queue size limit
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      // Remove oldest low priority messages first
      const lowPriorityIndex = this.messageQueue.findIndex(m => m.priority === 'low')
      if (lowPriorityIndex >= 0) {
        this.messageQueue.splice(lowPriorityIndex, 1)
      } else {
        // Remove oldest message
        this.messageQueue.shift()
      }
    }
    
    // Insert message based on priority
    if (message.priority === 'high') {
      this.messageQueue.unshift(message)
    } else {
      this.messageQueue.push(message)
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.connectionState.status === 'connected') {
      const message = this.messageQueue.shift()!
      
      try {
        this.doSendMessage(message)
      } catch (error) {
        // Re-queue message if send failed
        this.messageQueue.unshift(message)
        break
      }
    }
  }

  private startHeartbeat(): void {
    if (this.config.heartbeatInterval <= 0) return
    
    this.heartbeatTimer = setInterval(() => {
      if (this.connectionState.status === 'connected') {
        const pingMessage: WebSocketMessage = {
          id: this.generateMessageId(),
          type: 'ping',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
          priority: 'high',
          retry: false
        }
        
        this.updateConnectionState({ lastPingTime: Date.now() })
        
        try {
          this.doSendMessage(pingMessage)
        } catch (error) {
          // Heartbeat failed, connection might be broken
          this.handleError(new Error('Heartbeat failed'))
        }
      }
    }, this.config.heartbeatInterval)
  }

  private handlePong(message: WebSocketMessage): void {
    if (this.connectionState.lastPingTime) {
      const latency = Date.now() - this.connectionState.lastPingTime
      this.updateConnectionState({ latency })
    }
  }

  private updateConnectionState(updates: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates }
    this.emit('connection-state-change', this.connectionState)
  }

  private generateMessageId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }

  // Cleanup
  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
    this.messageQueue = []
    this.pendingMessages.clear()
  }
}

export default EnhancedWebSocketManager