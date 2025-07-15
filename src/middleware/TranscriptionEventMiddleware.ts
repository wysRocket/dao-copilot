/**
 * TranscriptionEventMiddleware - Connects WebSocket IPC events to unified TranscriptionStateManager
 * 
 * This middleware replaces the direct IPC → MultiWindowContext → useSharedState flow
 * with a unified approach: IPC → TranscriptionEventMiddleware → TranscriptionStateManager
 * 
 * This ensures WebSocket transcriptions properly trigger the streaming renderer
 * through the unified state system instead of bypassing it.
 */

import { ipcRenderer } from 'electron'
import { getTranscriptionStateManager } from '../state/TranscriptionStateManager'
import { TranscriptionSource } from '../services/TranscriptionSourceManager'
import { isWebSocketTranscription, validateWebSocketSource } from '../utils/transcription-detection'

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
   * Clean up IPC listeners
   */
  destroy(): void {
    if (!this.initialized) return
    
    console.log('🔗 TranscriptionEventMiddleware: Cleaning up IPC listeners')
    
    // Remove IPC listeners
    ipcRenderer.removeAllListeners('transcription-result')
    ipcRenderer.removeAllListeners('transcription-partial')
    ipcRenderer.removeAllListeners('transcription-complete')
    ipcRenderer.removeAllListeners('transcription-error')
    
    this.initialized = false
    console.log('✅ TranscriptionEventMiddleware: Cleaned up successfully')
  }
  
  /**
   * Set up IPC event listeners for transcription events
   */
  private setupIPCListeners(): void {
    // Main transcription result events
    ipcRenderer.on('transcription-result', (event, data: IPCTranscriptionData) => {
      console.log('🔗 TranscriptionEventMiddleware: Received transcription-result:', data.text?.substring(0, 50) + '...')
      this.handleTranscriptionEvent(data, 'final')
    })
    
    // Partial transcription events (streaming)
    ipcRenderer.on('transcription-partial', (event, data: IPCTranscriptionData) => {
      console.log('🔗 TranscriptionEventMiddleware: Received transcription-partial:', data.text?.substring(0, 50) + '...')
      this.handleTranscriptionEvent(data, 'partial')
    })
    
    // Transcription completion events
    ipcRenderer.on('transcription-complete', (event, data: IPCTranscriptionData) => {
      console.log('🔗 TranscriptionEventMiddleware: Received transcription-complete:', data.text?.substring(0, 50) + '...')
      this.handleTranscriptionEvent(data, 'complete')
    })
    
    // Transcription error events
    ipcRenderer.on('transcription-error', (event, error: { message: string; source?: string }) => {
      console.error('🔗 TranscriptionEventMiddleware: Received transcription-error:', error)
      this.handleTranscriptionError(error)
    })
    
    // Legacy transcription channel (for backward compatibility)
    ipcRenderer.on('TRANSCRIPTION_TRANSCRIBE_CHANNEL', (event, data: IPCTranscriptionData) => {
      console.log('🔗 TranscriptionEventMiddleware: Received legacy transcription:', data.text?.substring(0, 50) + '...')
      this.handleTranscriptionEvent(data, 'legacy')
    })
  }
  
  /**
   * Handle incoming transcription events and route to appropriate state manager method
   */
  private handleTranscriptionEvent(data: IPCTranscriptionData, eventType: 'final' | 'partial' | 'complete' | 'legacy'): void {
    try {
      // Validate and normalize the transcription data
      const normalizedData = this.normalizeTranscriptionData(data)
      
      if (!normalizedData) {
        console.warn('🔗 TranscriptionEventMiddleware: Invalid transcription data, skipping')
        return
      }
      
      // Determine if this is a WebSocket transcription
      const isWebSocket = isWebSocketTranscription(normalizedData.source)
      
      console.log('🔗 TranscriptionEventMiddleware: Processing transcription:', {
        source: normalizedData.source,
        isWebSocket,
        isPartial: normalizedData.isPartial,
        eventType,
        textLength: normalizedData.text.length
      })
      
      if (isWebSocket) {
        // Route WebSocket transcriptions to streaming state
        this.handleWebSocketTranscription(normalizedData, eventType)
      } else {
        // Route non-WebSocket transcriptions to static state
        this.handleStaticTranscription(normalizedData)
      }
      
    } catch (error) {
      console.error('🔗 TranscriptionEventMiddleware: Error handling transcription event:', error)
    }
  }
  
  /**
   * Handle WebSocket transcriptions - route to streaming state
   */
  private handleWebSocketTranscription(data: IPCTranscriptionData, eventType: string): void {
    const validation = validateWebSocketSource(data.source, {
      timestamp: data.timestamp,
      isPartial: data.isPartial,
      confidence: data.confidence,
      metadata: data.metadata
    })
    
    if (!validation.isValid) {
      console.warn('🔗 TranscriptionEventMiddleware: WebSocket validation failed:', validation.reasons)
    }
    
    const transcriptionWithSource = {
      id: this.generateTranscriptionId(),
      text: data.text,
      timestamp: data.timestamp || Date.now(),
      confidence: data.confidence,
      source: this.mapSourceToEnum(data.source || 'websocket'),
      isPartial: data.isPartial || false
    }
    
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
        console.log('🔗 TranscriptionEventMiddleware: Completing stream with final text')
        this.stateManager.updateStreaming(data.text, false)
        setTimeout(() => {
          this.stateManager.completeStreaming()
        }, 100) // Small delay to show final text
      } else {
        console.log('🔗 TranscriptionEventMiddleware: Starting and immediately completing stream')
        this.stateManager.startStreaming(transcriptionWithSource)
        setTimeout(() => {
          this.stateManager.completeStreaming()
        }, 1000) // Show streaming briefly before completing
      }
    }
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
  private handleTranscriptionError(error: { message: string; source?: string }): void {
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
  simulateTranscription(text: string, source: string = 'websocket-gemini', isPartial: boolean = false): void {
    console.log('🔗 TranscriptionEventMiddleware: Simulating transcription for testing')
    this.handleTranscriptionEvent({
      text,
      timestamp: Date.now(),
      confidence: 0.95,
      source,
      isPartial,
      metadata: { simulated: true }
    }, isPartial ? 'partial' : 'final')
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
