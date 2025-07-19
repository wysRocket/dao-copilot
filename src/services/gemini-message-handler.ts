/**
 * Message Handling System for Gemini Live API
 * Processes incoming and outgoing WebSocket messages with advanced features
 */

import {EventEmitter} from 'events'

export enum MessageType {
  // Outgoing message types
  CLIENT_CONTENT = 'client_content',
  REALTIME_INPUT = 'realtime_input',
  PING = 'ping',
  SETUP = 'setup',

  // Incoming message types
  SERVER_CONTENT = 'server_content',
  MODEL_TURN = 'model_turn',
  TURN_COMPLETE = 'turn_complete',
  AUDIO_DATA = 'audio_data',
  PONG = 'pong',
  ERROR = 'error',
  SETUP_COMPLETE = 'setup_complete'
}

export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

export interface MessageMetadata {
  id: string
  timestamp: number
  type: MessageType
  priority: MessagePriority
  retryCount?: number
  maxRetries?: number
  timeout?: number
}

export interface QueuedMessage {
  data: unknown
  metadata: MessageMetadata
  resolve?: (value: unknown) => void
  reject?: (error: Error) => void
}

export interface ProcessedMessage {
  original: unknown
  type: MessageType
  metadata: MessageMetadata
  payload: unknown
  isValid: boolean
  errors?: string[]
}

export interface MessageStats {
  sent: number
  received: number
  failed: number
  queued: number
  processed: number
  avgProcessingTime: number
  lastActivity: number
}

/**
 * Advanced Message Handler for Gemini Live API
 */
export class GeminiMessageHandler extends EventEmitter {
  private messageQueue: Map<MessagePriority, QueuedMessage[]> = new Map()
  private pendingMessages: Map<string, QueuedMessage> = new Map()
  private messageHistory: ProcessedMessage[] = []
  private stats: MessageStats = {
    sent: 0,
    received: 0,
    failed: 0,
    queued: 0,
    processed: 0,
    avgProcessingTime: 0,
    lastActivity: Date.now()
  }

  private isProcessing = false
  private maxHistorySize = 1000
  private processingInterval: NodeJS.Timeout | null = null
  private messageIdCounter = 0

  constructor() {
    super()

    // Initialize priority queues
    Object.values(MessagePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.messageQueue.set(priority, [])
      }
    })

    // Start message processing
    this.startProcessing()
  }

  /**
   * Queue an outgoing message
   */
  queueMessage(
    data: unknown,
    type: MessageType = MessageType.CLIENT_CONTENT,
    priority: MessagePriority = MessagePriority.NORMAL,
    options?: {
      timeout?: number
      maxRetries?: number
      expectResponse?: boolean
    }
  ): Promise<unknown> {
    const messageId = this.generateMessageId()
    const metadata: MessageMetadata = {
      id: messageId,
      timestamp: Date.now(),
      type,
      priority,
      retryCount: 0,
      maxRetries: options?.maxRetries || 3,
      timeout: options?.timeout || 30000
    }

    return new Promise((resolve, reject) => {
      const queuedMessage: QueuedMessage = {
        data: this.serializeMessage(data, type, metadata),
        metadata,
        resolve: options?.expectResponse ? resolve : undefined,
        reject
      }

      // Add to appropriate priority queue
      const queue = this.messageQueue.get(priority)
      if (queue) {
        queue.push(queuedMessage)
        this.stats.queued++

        if (!options?.expectResponse) {
          // Resolve immediately for fire-and-forget messages
          resolve(messageId)
        } else {
          // Store for response tracking
          this.pendingMessages.set(messageId, queuedMessage)
        }

        this.emit('messageQueued', messageId, type, priority)
      } else {
        reject(new Error(`Invalid priority: ${priority}`))
      }
    })
  }

  /**
   * Process an incoming message
   */
  processIncomingMessage(rawMessage: unknown): ProcessedMessage {
    const startTime = Date.now()

    try {
      const processed = this.deserializeMessage(rawMessage)

      // Update statistics
      this.stats.received++
      this.stats.processed++
      this.updateProcessingTime(Date.now() - startTime)
      this.stats.lastActivity = Date.now()

      // Add to history
      this.addToHistory(processed)

      // Handle response matching
      this.handleResponseMatching(processed)

      // Emit specific events based on message type
      this.emitMessageEvents(processed)

      this.emit('messageProcessed', processed)
      return processed
    } catch (error) {
      this.stats.failed++
      const errorMessage: ProcessedMessage = {
        original: rawMessage,
        type: MessageType.ERROR,
        metadata: {
          id: this.generateMessageId(),
          timestamp: Date.now(),
          type: MessageType.ERROR,
          priority: MessagePriority.HIGH
        },
        payload: null,
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }

      this.emit('messageError', errorMessage, error)
      return errorMessage
    }
  }

  /**
   * Serialize outgoing message
   */
  private serializeMessage(data: unknown, type: MessageType, metadata: MessageMetadata): string {
    const message = {
      id: metadata.id,
      timestamp: metadata.timestamp,
      type,
      ...this.formatMessageByType(data, type)
    }

    return JSON.stringify(message)
  }

  /**
   * Format message based on type
   */
  private formatMessageByType(data: unknown, type: MessageType): Record<string, unknown> {
    // Type guard for safe access to unknown data
    const isObject = (obj: unknown): obj is Record<string, unknown> =>
      typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    const safeData = isObject(data) ? data : {}

    switch (type) {
      case MessageType.CLIENT_CONTENT:
        return {
          client_content: {
            turns: Array.isArray(safeData.turns)
              ? safeData.turns
              : [
                  {
                    role: 'user',
                    parts: safeData.parts || []
                  }
                ],
            turn_complete: safeData.turn_complete !== false
          }
        }

      case MessageType.REALTIME_INPUT:
        return {
          realtime_input: data
        }

      case MessageType.SETUP:
        return {
          setup: {
            model: safeData.model || 'gemini-2.0-flash-live-001',
            response_modalities: safeData.responseModalities || ['AUDIO'],
            system_instruction: safeData.systemInstruction
          }
        }

      case MessageType.PING:
        return {
          ping: {
            timestamp: Date.now()
          }
        }

      default:
        return isObject(data) ? data : {data}
    }
  }

  /**
   * Deserialize incoming message
   */
  private deserializeMessage(rawMessage: unknown): ProcessedMessage {
    let parsed: unknown

    try {
      parsed = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage
    } catch {
      throw new Error('Failed to parse message JSON')
    }

    const messageType = this.detectMessageType(parsed)
    const isObject = (obj: unknown): obj is Record<string, unknown> =>
      typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    const safeParsed = isObject(parsed) ? parsed : {}

    const metadata: MessageMetadata = {
      id: (safeParsed.id as string) || this.generateMessageId(),
      timestamp: (safeParsed.timestamp as number) || Date.now(),
      type: messageType,
      priority: this.getMessagePriority(messageType)
    }

    const payload = this.extractPayload(parsed, messageType)
    const isValid = this.validateMessage(parsed, messageType)

    return {
      original: parsed,
      type: messageType,
      metadata,
      payload,
      isValid,
      errors: isValid ? undefined : this.getValidationErrors(parsed, messageType)
    }
  }

  /**
   * Detect message type from incoming message
   */
  private detectMessageType(message: unknown): MessageType {
    // Type guard for safe property access
    const isObject = (obj: unknown): obj is Record<string, unknown> =>
      typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    if (!isObject(message)) {
      return MessageType.SERVER_CONTENT // Default fallback
    }

    if (message.server_content) return MessageType.SERVER_CONTENT
    if (message.model_turn) return MessageType.MODEL_TURN
    if (message.turn_complete) return MessageType.TURN_COMPLETE
    if (message.data || message.audio_data) return MessageType.AUDIO_DATA
    if (message.pong) return MessageType.PONG
    if (message.setup_complete) return MessageType.SETUP_COMPLETE
    if (message.error) return MessageType.ERROR

    return MessageType.SERVER_CONTENT // Default fallback
  }

  /**
   * Extract payload from message based on type
   */
  private extractPayload(message: unknown, type: MessageType): unknown {
    const isObject = (obj: unknown): obj is Record<string, unknown> =>
      typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    if (!isObject(message)) {
      return message
    }

    switch (type) {
      case MessageType.SERVER_CONTENT:
        return message.server_content || message
      case MessageType.MODEL_TURN:
        return message.model_turn || message
      case MessageType.AUDIO_DATA:
        return message.data || message.audio_data
      case MessageType.PONG:
        return message.pong
      case MessageType.SETUP_COMPLETE:
        return message.setup_complete
      case MessageType.ERROR:
        return message.error
      default:
        return message
    }
  }

  /**
   * Get message priority based on type
   */
  private getMessagePriority(type: MessageType): MessagePriority {
    switch (type) {
      case MessageType.ERROR:
        return MessagePriority.URGENT
      case MessageType.PING:
      case MessageType.PONG:
        return MessagePriority.HIGH
      case MessageType.SETUP:
      case MessageType.SETUP_COMPLETE:
        return MessagePriority.HIGH
      case MessageType.AUDIO_DATA:
        return MessagePriority.NORMAL
      default:
        return MessagePriority.NORMAL
    }
  }

  /**
   * Validate message structure
   */
  private validateMessage(message: unknown, type: MessageType): boolean {
    const isObject = (obj: unknown): obj is Record<string, unknown> =>
      typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    if (!isObject(message)) return false

    switch (type) {
      case MessageType.SERVER_CONTENT:
        return !!message.server_content || !!message.serverContent
      case MessageType.AUDIO_DATA:
        return !!message.data || !!message.audio_data
      case MessageType.ERROR:
        return !!message.error
      default:
        return true // More lenient validation for other types
    }
  }

  /**
   * Get validation errors for invalid messages
   */
  private getValidationErrors(message: unknown, type: MessageType): string[] {
    const errors: string[] = []
    const isObject = (obj: unknown): obj is Record<string, unknown> =>
      typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    if (!isObject(message)) {
      errors.push('Message must be a valid object')
      return errors
    }

    switch (type) {
      case MessageType.SERVER_CONTENT:
        if (!message.server_content && !message.serverContent) {
          errors.push('Missing server_content field')
        }
        break
      case MessageType.AUDIO_DATA:
        if (!message.data && !message.audio_data) {
          errors.push('Missing audio data field')
        }
        break
    }

    return errors
  }

  /**
   * Start message processing loop
   */
  private startProcessing(): void {
    if (this.processingInterval) return

    this.processingInterval = setInterval(() => {
      this.processQueue()
    }, 10) // Process every 10ms for high responsiveness
  }

  /**
   * Process message queue with priority handling
   */
  private processQueue(): void {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      // Process messages by priority (highest first)
      const priorities = [
        MessagePriority.URGENT,
        MessagePriority.HIGH,
        MessagePriority.NORMAL,
        MessagePriority.LOW
      ]

      for (const priority of priorities) {
        const queue = this.messageQueue.get(priority)
        if (queue && queue.length > 0) {
          const message = queue.shift()
          if (message) {
            this.processOutgoingMessage(message)
            break // Process one message per cycle
          }
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process outgoing message
   */
  private processOutgoingMessage(queuedMessage: QueuedMessage): void {
    try {
      this.emit('sendMessage', queuedMessage.data)
      this.stats.sent++
      this.stats.lastActivity = Date.now()

      // Set timeout for expected responses
      if (queuedMessage.resolve) {
        setTimeout(() => {
          if (this.pendingMessages.has(queuedMessage.metadata.id)) {
            this.pendingMessages.delete(queuedMessage.metadata.id)
            queuedMessage.reject?.(new Error('Message timeout'))
          }
        }, queuedMessage.metadata.timeout || 30000)
      }

      this.emit('messageSent', queuedMessage.metadata.id, queuedMessage.metadata.type)
    } catch (error) {
      this.stats.failed++
      queuedMessage.reject?.(error as Error)
      this.emit('messageError', queuedMessage, error)
    }
  }

  /**
   * Handle response matching for pending messages
   */
  private handleResponseMatching(processed: ProcessedMessage): void {
    // Simple response matching - can be enhanced with more sophisticated logic
    const isObject = (obj: unknown): obj is Record<string, unknown> =>
      typeof obj === 'object' && obj !== null && !Array.isArray(obj)

    if (!isObject(processed.original)) {
      return
    }

    const responseId = processed.original.id || processed.original.response_id

    if (responseId && this.pendingMessages.has(responseId as string)) {
      const pendingMessage = this.pendingMessages.get(responseId as string)
      if (pendingMessage?.resolve) {
        pendingMessage.resolve(processed)
        this.pendingMessages.delete(responseId as string)
      }
    }
  }

  /**
   * Emit specific events based on message type
   */
  private emitMessageEvents(processed: ProcessedMessage): void {
    switch (processed.type) {
      case MessageType.SERVER_CONTENT:
        this.emit('serverContent', processed.payload)
        break
      case MessageType.MODEL_TURN:
        this.emit('modelTurn', processed.payload)
        break
      case MessageType.AUDIO_DATA:
        this.emit('audioData', processed.payload)
        break
      case MessageType.TURN_COMPLETE:
        this.emit('turnComplete', processed.payload)
        break
      case MessageType.ERROR:
        this.emit('error', processed.payload)
        break
      case MessageType.PONG:
        this.emit('pong', processed.payload)
        break
    }
  }

  /**
   * Add message to history with size management
   */
  private addToHistory(processed: ProcessedMessage): void {
    this.messageHistory.push(processed)

    // Maintain history size
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift()
    }
  }

  /**
   * Update processing time statistics
   */
  private updateProcessingTime(processingTime: number): void {
    if (this.stats.processed === 1) {
      this.stats.avgProcessingTime = processingTime
    } else {
      this.stats.avgProcessingTime =
        (this.stats.avgProcessingTime * (this.stats.processed - 1) + processingTime) /
        this.stats.processed
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`
  }

  /**
   * Get message statistics
   */
  getStats(): MessageStats {
    return {...this.stats}
  }

  /**
   * Get message history
   */
  getHistory(limit?: number): ProcessedMessage[] {
    return limit ? this.messageHistory.slice(-limit) : [...this.messageHistory]
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {[key in MessagePriority]: number} {
    const status = {} as {[key in MessagePriority]: number}

    this.messageQueue.forEach((queue, priority) => {
      status[priority] = queue.length
    })

    return status
  }

  /**
   * Clear message queue
   */
  clearQueue(priority?: MessagePriority): void {
    if (priority !== undefined) {
      const queue = this.messageQueue.get(priority)
      if (queue) {
        queue.length = 0
      }
    } else {
      this.messageQueue.forEach(queue => {
        queue.length = 0
      })
    }
    this.stats.queued = 0
  }

  /**
   * Stop message processing
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop()
    this.clearQueue()
    this.pendingMessages.clear()
    this.messageHistory.length = 0
    this.removeAllListeners()
  }
}

export default GeminiMessageHandler
