/**
 * TranscriptionEventMiddleware - Connects WebSocket IPC events to unified TranscriptionStateManager
 *
 * This middleware replaces the direct IPC → MultiWindowContext → useSharedState flow
 * with a unified approach: IPC → TranscriptionEventMiddleware → TranscriptionStateManager
 *
 * This ensures WebSocket transcriptions properly trigger the streaming renderer
 * through the unified state system instead of bypassing it.
 *
 * Features:
 * - Renderer-safe IPC handling with mock implementation
 * - Smart source detection and routing (WebSocket vs Static)
 * - Streaming state management with progress tracking
 * - Error handling and recovery
 * - Testing simulation capabilities
 */

// State management
import {getTranscriptionStateManager} from '../state/TranscriptionStateManager'

// Services and utilities
import {TranscriptionSource} from '../services/TranscriptionSourceManager'
import {isWebSocketTranscription, validateWebSocketSource} from '../utils/transcription-detection'

// WebSocket diagnostics
import {
  getWebSocketDiagnostics,
  logWebSocketTiming,
  startWebSocketTiming,
  endWebSocketTiming
} from '../utils/websocket-diagnostics'

// Check if we're in a renderer process
const isRenderer = typeof window !== 'undefined'

// Mock IPC interface for renderer safety
interface MockIPC {
  on: (channel: string, listener: (...args: unknown[]) => void) => void
  removeAllListeners: (channel: string) => void
}

// Create a safe mock IPC for renderer environments
const createMockIPC = (): MockIPC => ({
  on: () => {
    // No-op for renderer environments
  },
  removeAllListeners: () => {
    // No-op for renderer environments
  }
})

// Get IPC safely - completely disable for renderer to avoid any bundling issues
const getIPC = (): MockIPC => {
  // Always return mock in renderer environment to prevent any electron imports
  if (isRenderer) {
    console.log(
      '🔗 TranscriptionEventMiddleware: Running in renderer mode with simulation-only IPC'
    )
    return createMockIPC()
  }

  // This should never execute in renderer, but keeping for main process compatibility
  console.warn('🔗 TranscriptionEventMiddleware: Running in non-renderer environment')
  return createMockIPC()
}

/**
 * Raw IPC transcription data format
 */
interface IPCTranscriptionData {
  text: string
  timestamp?: number
  confidence?: number
  source?: string
  isPartial?: boolean
  metadata?: Record<string, unknown>
}

/**
 * TranscriptionEventMiddleware handles routing IPC transcription events
 * to the unified TranscriptionStateManager
 */
export class TranscriptionEventMiddleware {
  private stateManager = getTranscriptionStateManager()
  private initialized = false
  private eventBuffer: Map<string, IPCTranscriptionData> = new Map()
  private bufferTimeout: NodeJS.Timeout | null = null
  private readonly BUFFER_TIMEOUT_MS = 50 // Debounce rapid updates

  /**
   * Initialize the middleware and set up IPC listeners
   */
  initialize(): void {
    if (this.initialized) {
      console.warn('TranscriptionEventMiddleware already initialized')
      return
    }

    console.log('🔗 TranscriptionEventMiddleware: Initializing IPC listeners')

    // Listen for transcription events from main process
    this.setupIPCListeners()

    this.initialized = true
    console.log('✅ TranscriptionEventMiddleware: Initialized successfully')
  }

  /**
   * Clean up IPC listeners and resources
   */
  destroy(): void {
    if (!this.initialized) return

    console.log('🔗 TranscriptionEventMiddleware: Cleaning up IPC listeners')

    // Clear buffer timeout
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout)
      this.bufferTimeout = null
    }

    // Clear event buffer
    this.eventBuffer.clear()

    // Remove IPC listeners safely
    const ipc = getIPC()
    if (ipc) {
      ipc.removeAllListeners('transcription-result')
      ipc.removeAllListeners('transcription-partial')
      ipc.removeAllListeners('transcription-complete')
      ipc.removeAllListeners('transcription-error')
      ipc.removeAllListeners('TRANSCRIPTION_TRANSCRIBE_CHANNEL')
    } else {
      console.warn('🔗 TranscriptionEventMiddleware: No IPC available for cleanup')
    }

    this.initialized = false
    console.log('✅ TranscriptionEventMiddleware: Cleaned up successfully')
  }

  /**
   * Set up IPC event listeners for transcription events
   */
  private setupIPCListeners(): void {
    const ipc = getIPC()

    if (!ipc) {
      console.warn('🔗 TranscriptionEventMiddleware: No IPC available, running in simulation mode')
      return
    }

    // Main transcription result events
    ipc.on('transcription-result', (...args: unknown[]) => {
      const data = args[1] as IPCTranscriptionData
      console.log(
        '🔗 TranscriptionEventMiddleware: Received transcription-result:',
        data.text?.substring(0, 50) + '...'
      )
      this.handleTranscriptionEvent(data, 'final')
    })

    // Partial transcription events (streaming) - with buffering for rapid updates
    ipc.on('transcription-partial', (...args: unknown[]) => {
      const data = args[1] as IPCTranscriptionData
      console.log(
        '🔗 TranscriptionEventMiddleware: Received transcription-partial:',
        data.text?.substring(0, 50) + '...'
      )
      this.bufferPartialEvent(data)
    })

    // Transcription completion events
    ipc.on('transcription-complete', (...args: unknown[]) => {
      const data = args[1] as IPCTranscriptionData
      console.log(
        '🔗 TranscriptionEventMiddleware: Received transcription-complete:',
        data.text?.substring(0, 50) + '...'
      )
      this.handleTranscriptionEvent(data, 'complete')
    })

    // Transcription error events
    ipc.on('transcription-error', (...args: unknown[]) => {
      const error = args[1] as {message: string; source?: string}
      console.error('🔗 TranscriptionEventMiddleware: Received transcription-error:', error)
      this.handleTranscriptionError(error)
    })

    // Legacy transcription channel (for backward compatibility)
    ipc.on('TRANSCRIPTION_TRANSCRIBE_CHANNEL', (...args: unknown[]) => {
      const data = args[1] as IPCTranscriptionData
      console.log(
        '🔗 TranscriptionEventMiddleware: Received legacy transcription:',
        data.text?.substring(0, 50) + '...'
      )
      this.handleTranscriptionEvent(data, 'legacy')
    })
  }

  /**
   * Buffer partial events to avoid overwhelming the state manager with rapid updates
   */
  private bufferPartialEvent(data: IPCTranscriptionData): void {
    const sourceKey = data.source || 'unknown'
    this.eventBuffer.set(sourceKey, data)

    // Clear existing timeout
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout)
    }

    // Set new timeout to process buffered events
    this.bufferTimeout = setTimeout(() => {
      this.processBufferedEvents()
    }, this.BUFFER_TIMEOUT_MS)
  }

  /**
   * Process all buffered partial events
   */
  private processBufferedEvents(): void {
    for (const data of this.eventBuffer.values()) {
      this.handleTranscriptionEvent(data, 'partial')
    }
    this.eventBuffer.clear()
    this.bufferTimeout = null
  }

  /**
   * Handle incoming transcription events and route to appropriate state manager method
   */
  private handleTranscriptionEvent(
    data: IPCTranscriptionData,
    eventType: 'final' | 'partial' | 'complete' | 'legacy'
  ): void {
    const eventId = `ipc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`

    // Start timing for IPC event processing
    startWebSocketTiming(`ipc-event-${eventId}`, {
      eventType,
      isPartial: data.isPartial,
      source: data.source,
      textLength: data.text?.length || 0
    })

    try {
      // Validate and normalize the transcription data
      startWebSocketTiming(`ipc-normalize-${eventId}`)
      const normalizedData = this.normalizeTranscriptionData(data)
      endWebSocketTiming(`ipc-normalize-${eventId}`)

      if (!normalizedData) {
        console.warn('🔗 TranscriptionEventMiddleware: Invalid transcription data, skipping')
        endWebSocketTiming(`ipc-event-${eventId}`)
        return
      }

      // Determine if this is a WebSocket transcription
      startWebSocketTiming(`ipc-source-detection-${eventId}`)
      const isWebSocket = isWebSocketTranscription(normalizedData.source)
      endWebSocketTiming(`ipc-source-detection-${eventId}`)

      console.log('🔗 TranscriptionEventMiddleware: Processing transcription:', {
        source: normalizedData.source,
        isWebSocket,
        isPartial: normalizedData.isPartial,
        eventType,
        textLength: normalizedData.text.length,
        eventId
      })

      if (isWebSocket) {
        // Route WebSocket transcriptions to streaming state
        startWebSocketTiming(`ipc-websocket-routing-${eventId}`)
        this.handleWebSocketTranscription(normalizedData, eventType)
        endWebSocketTiming(`ipc-websocket-routing-${eventId}`)
      } else {
        // Route non-WebSocket transcriptions to static state
        startWebSocketTiming(`ipc-static-routing-${eventId}`)
        this.handleStaticTranscription(normalizedData)
        endWebSocketTiming(`ipc-static-routing-${eventId}`)
      }

      // Complete event processing timing
      const totalEventTime = endWebSocketTiming(`ipc-event-${eventId}`)
      logWebSocketTiming('ipc-event-processed', totalEventTime, {
        eventId,
        eventType,
        isWebSocket,
        textLength: normalizedData.text.length
      })
    } catch (error) {
      endWebSocketTiming(`ipc-event-${eventId}`)
      logWebSocketTiming('ipc-event-error', 0, {
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      console.error('🔗 TranscriptionEventMiddleware: Error handling transcription event:', error)
    }
  }

  /**
   * Handle WebSocket transcriptions - route to streaming state
   */
  private handleWebSocketTranscription(data: IPCTranscriptionData, eventType: string): void {
    const wsHandlingId = `ws-handling-${Date.now()}`
    startWebSocketTiming(wsHandlingId, {eventType, isPartial: data.isPartial})

    const validation = validateWebSocketSource(data.source, {
      timestamp: data.timestamp,
      isPartial: data.isPartial,
      confidence: data.confidence,
      metadata: data.metadata
    })

    if (!validation.isValid) {
      console.warn(
        '🔗 TranscriptionEventMiddleware: WebSocket validation failed:',
        validation.reasons
      )
    }

    const transcriptionWithSource = {
      id: this.generateTranscriptionId(),
      text: data.text,
      timestamp: data.timestamp || Date.now(),
      confidence: data.confidence,
      source: this.mapSourceToEnum(data.source || 'websocket'),
      isPartial: data.isPartial || false
    }

    // Start state management timing
    startWebSocketTiming(`state-update-${wsHandlingId}`)

    if (data.isPartial || eventType === 'partial') {
      // Start or update streaming transcription
      if (this.stateManager.getState().streaming.isActive) {
        console.log('🔗 TranscriptionEventMiddleware: Updating existing stream')
        this.stateManager.updateStreaming(data.text, data.isPartial)
      } else {
        console.log('🔗 TranscriptionEventMiddleware: Starting new stream')
        this.stateManager.startStreaming(transcriptionWithSource)
      }
    } else {
      // Complete transcription
      if (this.stateManager.getState().streaming.isActive) {
        // Check if this is a turn completion signal
        if (data.metadata?.isTurnComplete) {
          console.log(
            '🔗 TranscriptionEventMiddleware: Turn completion signal received - completing stream'
          )
          this.stateManager.completeStreaming()
        } else {
          console.log('🔗 TranscriptionEventMiddleware: Completing stream with final text')
          this.stateManager.updateStreaming(data.text, false)
          setTimeout(() => {
            this.stateManager.completeStreaming()
          }, 100) // Small delay to show final text
        }
      } else {
        // If no active stream but we get a completion signal, ignore it
        if (data.metadata?.isTurnComplete) {
          console.log(
            '🔗 TranscriptionEventMiddleware: Turn completion signal received but no active stream'
          )
        } else {
          console.log('🔗 TranscriptionEventMiddleware: Starting and immediately completing stream')
          this.stateManager.startStreaming(transcriptionWithSource)
          setTimeout(() => {
            this.stateManager.completeStreaming()
          }, 1000) // Show streaming briefly before completing
        }
      }
    }

    // Complete state management timing
    const stateUpdateTime = endWebSocketTiming(`state-update-${wsHandlingId}`)
    const totalWsHandlingTime = endWebSocketTiming(wsHandlingId)

    logWebSocketTiming('websocket-transcription-handled', totalWsHandlingTime, {
      eventType,
      isPartial: data.isPartial,
      stateUpdateTime,
      textLength: data.text.length
    })
  }

  /**
   * Handle static transcriptions - add directly to transcript list
   */
  private handleStaticTranscription(data: IPCTranscriptionData): void {
    const transcriptResult = {
      id: this.generateTranscriptionId(),
      text: data.text,
      confidence: data.confidence || 0,
      timestamp: data.timestamp || Date.now(),
      duration: 0,
      startTime: 0,
      endTime: 0,
      source: data.source
    }

    console.log('🔗 TranscriptionEventMiddleware: Adding static transcript')
    this.stateManager.addTranscript(transcriptResult)
  }

  /**
   * Handle transcription errors
   */
  private handleTranscriptionError(error: {message: string; source?: string}): void {
    console.error('🔗 TranscriptionEventMiddleware: Transcription error:', error.message)

    // If there's an active stream, complete it due to error
    if (this.stateManager.getState().streaming.isActive) {
      console.log('🔗 TranscriptionEventMiddleware: Completing stream due to error')
      this.stateManager.completeStreaming()
    }

    // Could emit error events or show user notifications here
    // For now, just log the error
  }

  /**
   * Normalize and validate transcription data
   */
  private normalizeTranscriptionData(data: IPCTranscriptionData): IPCTranscriptionData | null {
    // Special case for turn completion signals
    if (data?.metadata?.isTurnComplete && !data.isPartial) {
      return {
        text: '', // Empty text for completion
        timestamp: data.timestamp || Date.now(),
        confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
        source: data.source || 'unknown',
        isPartial: false,
        metadata: {
          ...data.metadata,
          isTurnComplete: true
        }
      }
    }

    // Basic validation
    if (!data || !data.text || typeof data.text !== 'string') {
      return null
    }

    // Trim and validate text length
    const trimmedText = data.text.trim()
    if (trimmedText.length === 0) {
      return null
    }

    return {
      text: trimmedText,
      timestamp: data.timestamp || Date.now(),
      confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
      source: data.source || 'unknown',
      isPartial: Boolean(data.isPartial),
      metadata: data.metadata || {}
    }
  }

  /**
   * Map string sources to TranscriptionSource enum
   */
  private mapSourceToEnum(source: string): TranscriptionSource {
    const normalizedSource = source.toLowerCase().replace(/[-_]/g, '')

    // WebSocket sources
    if (normalizedSource.includes('websocketgemini') || normalizedSource.includes('gemini')) {
      return TranscriptionSource.WEBSOCKET_GEMINI
    }
    if (normalizedSource.includes('websocketproxy')) {
      return TranscriptionSource.WEBSOCKET_PROXY
    }
    if (normalizedSource.includes('websocketpartial')) {
      return TranscriptionSource.WEBSOCKET_PARTIAL
    }
    if (normalizedSource.includes('websockettext')) {
      return TranscriptionSource.WEBSOCKET_TEXT
    }
    if (normalizedSource.includes('websocketturn')) {
      return TranscriptionSource.WEBSOCKET_TURN_COMPLETE
    }
    if (normalizedSource.includes('websocket')) {
      return TranscriptionSource.WEBSOCKET
    }

    // Streaming sources
    if (normalizedSource.includes('streaming')) {
      return TranscriptionSource.STREAMING
    }

    // Default fallback
    return TranscriptionSource.BATCH
  }

  /**
   * Generate unique transcription ID
   */
  private generateTranscriptionId(): string {
    return `transcription-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get current state manager for external access
   */
  getStateManager() {
    return this.stateManager
  }

  /**
   * Manual trigger for testing
   */
  simulateTranscription(
    text: string,
    source: string = 'websocket-gemini',
    isPartial: boolean = false
  ): void {
    this.handleTranscriptionEvent(
      {
        text,
        timestamp: Date.now(),
        confidence: 0.95,
        source,
        isPartial,
        metadata: {simulated: true}
      },
      isPartial ? 'partial' : 'final'
    )
  }
}

/**
 * Singleton instance
 */
let transcriptionEventMiddleware: TranscriptionEventMiddleware | null = null

/**
 * Get or create the singleton TranscriptionEventMiddleware instance
 */
export function getTranscriptionEventMiddleware(): TranscriptionEventMiddleware {
  if (!transcriptionEventMiddleware) {
    transcriptionEventMiddleware = new TranscriptionEventMiddleware()
  }
  return transcriptionEventMiddleware
}

/**
 * Initialize the transcription event middleware
 * Call this once during app startup
 */
export function initializeTranscriptionEventMiddleware(): TranscriptionEventMiddleware {
  const middleware = getTranscriptionEventMiddleware()
  middleware.initialize()
  return middleware
}

/**
 * Clean up the transcription event middleware
 * Call this during app shutdown
 */
export function destroyTranscriptionEventMiddleware(): void {
  if (transcriptionEventMiddleware) {
    transcriptionEventMiddleware.destroy()
    transcriptionEventMiddleware = null
  }
}
