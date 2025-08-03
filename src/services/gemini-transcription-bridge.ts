/**
 * Gemini Transcription Bridge
 *
 * Bridges the Gemini Live WebSocket client with the TranscriptionEventMiddleware
 * to ensure proper event flow and state management integration.
 */

import {EventEmitter} from 'events'
import GeminiLiveWebSocketClient from './gemini-live-websocket'
import {
  getTranscriptionEventMiddleware,
  TranscriptionEventMiddleware
} from '../middleware/TranscriptionEventMiddleware'
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
  private middleware: TranscriptionEventMiddleware
  private isConnected = false
  private config: BridgeConfig = {
    enableEventForwarding: true, // Re-enable for WebSocket transcription
    enableLogging: true,
    bufferTimeout: 100
  }

  // 🛡️ Circuit breaker to prevent feedback loops
  private isForwardingEvent = false
  private lastForwardTime = 0
  private lastEventSignature = '' // Track last event to prevent duplicates
  private readonly FORWARD_THROTTLE_MS = 25 // Reduced from 50ms to allow proper streaming updates

  // 🚨 Emergency circuit breaker for stack overflow detection
  private emergencyStop = false
  private errorCount = 0
  private readonly MAX_ERRORS_BEFORE_STOP = 3

  constructor() {
    super()
    this.middleware = getTranscriptionEventMiddleware()
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
    if (!this.config.enableEventForwarding || this.emergencyStop) return

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
    if (!this.config.enableEventForwarding || this.emergencyStop) return

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
    // � Emergency stop if stack overflow detected
    if (this.emergencyStop) {
      console.error('🚨 Bridge: Emergency stop active - all event forwarding disabled')
      return
    }

    // �🛡️ Circuit breaker to prevent feedback loops
    if (this.isForwardingEvent) {
      console.warn('🚨 Bridge: Skipping event forward to prevent feedback loop')
      this.errorCount++
      if (this.errorCount >= this.MAX_ERRORS_BEFORE_STOP) {
        this.activateEmergencyStop()
      }
      return
    }

    const now = Date.now()
    if (now - this.lastForwardTime < this.FORWARD_THROTTLE_MS) {
      console.warn('🚨 Bridge: Throttling event forward to prevent excessive activity')
      return
    }

    // Check for identical consecutive events to prevent loops
    const eventSignature = `${event.text.slice(0, 50)}-${event.isPartial}-${event.source}`
    if (this.lastEventSignature === eventSignature) {
      console.warn('🚨 Bridge: Duplicate event detected - skipping to prevent loop')
      return
    }

    try {
      this.isForwardingEvent = true
      this.lastForwardTime = now
      this.lastEventSignature = eventSignature

      // CRITICAL FIX: Use simulateTranscription which exists in the middleware
      console.log('🔗 Bridge: Forwarding event via simulateTranscription')

      // Use the existing simulateTranscription method
      this.middleware.simulateTranscription(event.text, event.source, event.isPartial)

      this.emit('eventForwarded', event)

      // Reset error count on successful forward
      this.errorCount = 0
    } catch (error) {
      this.errorCount++

      // Check for stack overflow specifically
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('Maximum call stack size exceeded')) {
        console.error('🚨 Bridge: Stack overflow detected - activating emergency stop')
        this.activateEmergencyStop()
      }

      if (this.errorCount >= this.MAX_ERRORS_BEFORE_STOP) {
        this.activateEmergencyStop()
      }

      logger.error('Bridge: Failed to forward event to middleware', {
        error: errorMessage,
        errorCount: this.errorCount
      })
    } finally {
      this.isForwardingEvent = false
    }
  }

  /**
   * Activate emergency stop to prevent all further event processing
   */
  private activateEmergencyStop(): void {
    this.emergencyStop = true
    console.error('🚨 Bridge: EMERGENCY STOP ACTIVATED - Bridge disabled due to errors')
    this.emit('emergencyStop', {
      reason: 'Multiple errors or stack overflow detected',
      errorCount: this.errorCount,
      timestamp: Date.now()
    })
  }

  /**
   * Get bridge status
   */
  getStatus(): {
    isConnected: boolean
    hasClient: boolean
    config: BridgeConfig
    emergencyStop: boolean
    errorCount: number
  } {
    return {
      isConnected: this.isConnected,
      hasClient: this.client !== null,
      config: this.config,
      emergencyStop: this.emergencyStop,
      errorCount: this.errorCount
    }
  }

  /**
   * Reset emergency stop (use with caution)
   */
  resetEmergencyStop(): void {
    this.emergencyStop = false
    this.errorCount = 0
    console.log('🔄 Bridge: Emergency stop reset - bridge re-enabled')
    this.emit('emergencyStopReset', {
      timestamp: Date.now()
    })
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
