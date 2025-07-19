/**
 * Gemini Transcription Bridge
 *
 * Bridges the Gemini Live WebSocket client with the TranscriptionEventMiddleware
 * to ensure proper event flow and state management integration.
 */

import {EventEmitter} from 'events'
import GeminiLiveWebSocketClient from './gemini-live-websocket'
import {getTranscriptionEventMiddleware} from '../middleware/TranscriptionEventMiddleware'
import {logger} from './gemini-logger'

export interface TranscriptionEvent {
  text: string
  timestamp: number
  confidence?: number
  source: string
  isPartial: boolean
  metadata?: Record<string, unknown>
}

export interface TextResponseData {
  content: string
  metadata?: {
    confidence?: number
    isPartial?: boolean
    [key: string]: unknown
  }
  isPartial?: boolean
}

export interface TranscriptionUpdateData {
  text: string
  confidence?: number
  isFinal?: boolean
}

export interface ErrorData {
  message?: string
  [key: string]: unknown
}

export interface BridgeConfig {
  enableEventForwarding: boolean
  enableLogging: boolean
  bufferTimeout: number
}

/**
 * Bridges Gemini WebSocket events to TranscriptionEventMiddleware
 */
export class GeminiTranscriptionBridge extends EventEmitter {
  private client: GeminiLiveWebSocketClient | null = null
  private middleware = getTranscriptionEventMiddleware()
  private config: BridgeConfig
  private isConnected = false

  constructor(config: Partial<BridgeConfig> = {}) {
    super()

    this.config = {
      enableEventForwarding: true,
      enableLogging: true,
      bufferTimeout: 100,
      ...config
    }
  }

  /**
   * Connect the bridge to a WebSocket client
   */
  connect(client: GeminiLiveWebSocketClient): void {
    if (this.client) {
      this.disconnect()
    }

    this.client = client
    this.setupEventListeners()
    this.isConnected = true

    if (this.config.enableLogging) {
      logger.info('Gemini transcription bridge connected')
    }
  }

  /**
   * Disconnect the bridge
   */
  disconnect(): void {
    if (this.client && this.isConnected) {
      this.removeEventListeners()
      this.client = null
      this.isConnected = false

      if (this.config.enableLogging) {
        logger.info('Gemini transcription bridge disconnected')
      }
    }
  }

  /**
   * Set up event listeners for WebSocket client
   */
  private setupEventListeners(): void {
    if (!this.client) return

    // Listen for text responses (completed transcriptions)
    this.client.on('textResponse', (data: TextResponseData) => {
      this.handleTextResponse(data)
    })

    // Listen for transcription updates (partial transcriptions)
    this.client.on('transcriptionUpdate', (data: TranscriptionUpdateData) => {
      this.handleTranscriptionUpdate(data)
    })

    // Listen for connection events
    this.client.on('connected', () => {
      this.emit('bridgeConnected')
      if (this.config.enableLogging) {
        logger.debug('Bridge: WebSocket connected')
      }
    })

    this.client.on('disconnected', () => {
      this.emit('bridgeDisconnected')
      if (this.config.enableLogging) {
        logger.debug('Bridge: WebSocket disconnected')
      }
    })

    // Listen for errors
    this.client.on('error', (error: ErrorData) => {
      this.handleError(error)
    })
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    if (!this.client) return

    this.client.removeAllListeners('textResponse')
    this.client.removeAllListeners('transcriptionUpdate')
    this.client.removeAllListeners('connected')
    this.client.removeAllListeners('disconnected')
    this.client.removeAllListeners('error')
  }

  /**
   * Handle completed text responses
   */
  private handleTextResponse(data: TextResponseData): void {
    if (!this.config.enableEventForwarding) return

    const transcriptionEvent: TranscriptionEvent = {
      text: data.content || '',
      timestamp: Date.now(),
      confidence: data.metadata?.confidence || 0.95,
      source: 'websocket-gemini',
      isPartial: data.isPartial || false,
      metadata: {
        type: 'text_response',
        ...data.metadata
      }
    }

    this.forwardToMiddleware(transcriptionEvent)

    if (this.config.enableLogging) {
      logger.debug('Bridge: Forwarded text response', {
        textLength: transcriptionEvent.text.length,
        isPartial: transcriptionEvent.isPartial
      })
    }
  }

  /**
   * Handle transcription updates (partial results)
   */
  private handleTranscriptionUpdate(data: TranscriptionUpdateData): void {
    if (!this.config.enableEventForwarding) return

    const transcriptionEvent: TranscriptionEvent = {
      text: data.text || '',
      timestamp: Date.now(),
      confidence: data.confidence || 0.8,
      source: 'websocket-gemini-partial',
      isPartial: !data.isFinal,
      metadata: {
        type: 'transcription_update',
        isFinal: data.isFinal
      }
    }

    this.forwardToMiddleware(transcriptionEvent)

    if (this.config.enableLogging) {
      logger.debug('Bridge: Forwarded transcription update', {
        textLength: transcriptionEvent.text.length,
        isPartial: transcriptionEvent.isPartial,
        isFinal: data.isFinal
      })
    }
  }

  /**
   * Handle errors from WebSocket client
   */
  private handleError(error: ErrorData): void {
    const errorEvent = {
      message: error.message || 'Unknown WebSocket error',
      source: 'websocket-gemini',
      timestamp: Date.now()
    }

    this.emit('bridgeError', errorEvent)

    if (this.config.enableLogging) {
      logger.error('Bridge: WebSocket error', {
        error: errorEvent.message
      })
    }
  }

  /**
   * Forward transcription event to middleware
   */
  private forwardToMiddleware(event: TranscriptionEvent): void {
    try {
      // Use the middleware's simulation method to inject the event
      this.middleware.simulateTranscription(event.text, event.source, event.isPartial)

      this.emit('eventForwarded', event)
    } catch (error) {
      logger.error('Bridge: Failed to forward event to middleware', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Get bridge status
   */
  getStatus(): {
    isConnected: boolean
    hasClient: boolean
    config: BridgeConfig
  } {
    return {
      isConnected: this.isConnected,
      hasClient: this.client !== null,
      config: this.config
    }
  }

  /**
   * Update bridge configuration
   */
  updateConfig(newConfig: Partial<BridgeConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.emit('configUpdated', this.config)
  }
}

/**
 * Global bridge instance
 */
let globalBridge: GeminiTranscriptionBridge | null = null

/**
 * Get or create the global bridge instance
 */
export function getGeminiTranscriptionBridge(): GeminiTranscriptionBridge {
  if (!globalBridge) {
    globalBridge = new GeminiTranscriptionBridge()
  }
  return globalBridge
}

/**
 * Initialize bridge with WebSocket client
 */
export function initializeGeminiTranscriptionBridge(
  client: GeminiLiveWebSocketClient
): GeminiTranscriptionBridge {
  const bridge = getGeminiTranscriptionBridge()
  bridge.connect(client)
  return bridge
}

/**
 * Destroy the global bridge
 */
export function destroyGeminiTranscriptionBridge(): void {
  if (globalBridge) {
    globalBridge.disconnect()
    globalBridge = null
  }
}

export default GeminiTranscriptionBridge
