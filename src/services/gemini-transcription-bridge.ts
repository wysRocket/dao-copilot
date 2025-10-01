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
  // Diagnostics history
  private partialHistory: Array<{len: number; ts: number; sample: string; isFinal: boolean}> = []
  private lastLength = 0
  private growthResets = 0

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

    // Listen for chat responses (search results and model responses)
    this.client.on('chatResponse', (data: TextResponseData) => {
      this.handleChatResponse(data)
    })

    // Listen for turn completion events
    this.client.on('turnComplete', (data: {metadata?: Record<string, unknown>}) => {
      this.handleTurnComplete(data)
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
    this.client.removeAllListeners('turnComplete')
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

    // Diagnostics capture for finals / modelTurn style messages
    const len = (data.content || '').length
    this.recordLength(len, !!data.isPartial)

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

    // Diagnostics capture for partial updates
    const len = (data.text || '').length
    this.recordLength(len, !data.isFinal)

    if (this.config.enableLogging) {
      logger.debug('Bridge: Forwarded transcription update', {
        textLength: transcriptionEvent.text.length,
        isPartial: transcriptionEvent.isPartial,
        isFinal: data.isFinal
      })
    }
  }

  /**
   * Handle turn completion from WebSocket client
   */
  private handleTurnComplete(data: {metadata?: Record<string, unknown>}): void {
    // Send a final event to trigger completion in the state manager
    const completionEvent: TranscriptionEvent = {
      text: '', // Empty text for completion signal
      timestamp: Date.now(),
      source: 'websocket-gemini',
      isPartial: false, // Final event
      metadata: {
        ...data.metadata,
        isTurnComplete: true
      }
    }

    this.forwardToMiddleware(completionEvent)

    if (this.config.enableLogging) {
      logger.debug('Bridge: Forwarded turn completion event')
    }
  }

  /**
   * Handle chat responses (search results and model responses)
   */
  private handleChatResponse(data: TextResponseData): void {
    if (!this.config.enableEventForwarding) return

    // For chat responses, we emit a different event to route to Chat tab
    const chatEvent = {
      text: data.content || '',
      timestamp: Date.now(),
      confidence: data.metadata?.confidence || 0.95,
      source: 'chat-response',
      metadata: {
        type: 'chat_response',
        ...data.metadata
      }
    }

    // Emit chat-specific event instead of going through transcription middleware
    this.emit('chatResponse', chatEvent)

    if (this.config.enableLogging) {
      logger.debug('Bridge: Forwarded chat response', {
        textLength: chatEvent.text.length,
        source: chatEvent.source
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
   * Record length progression for diagnostics.
   */
  private recordLength(len: number, isPartial: boolean): void {
    const now = Date.now()
    // Detect reset (length shrinks significantly)
    if (len < this.lastLength * 0.5 && len < this.lastLength - 10) {
      this.growthResets++
      console.debug('[BridgeDiagnostics] Detected length reset', {
        previous: this.lastLength,
        current: len,
        resets: this.growthResets
      })
    }
    this.lastLength = len
    this.partialHistory.push({
      len,
      ts: now,
      sample: (isPartial ? 'P:' : 'F:') + String(len),
      isFinal: !isPartial
    })
    if (this.partialHistory.length > 300) this.partialHistory.shift()
  }

  /** Return diagnostics snapshot */
  getDiagnostics(): {
    lastLength: number
    resets: number
    history: Array<{len: number; ts: number; isFinal: boolean}>
  } {
    return {
      lastLength: this.lastLength,
      resets: this.growthResets,
      history: this.partialHistory.map(h => ({len: h.len, ts: h.ts, isFinal: h.isFinal}))
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
