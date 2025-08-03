/**
 * Simple WebSocket Transcription Handler
 * 
 * This replaces the complex parsing and error handling that was causing
 * empty transcription results despite successful WebSocket connections.
 * 
 * Focus: Get text from WebSocket to display as quickly and reliably as possible.
 */

import { EventEmitter } from 'events'

export interface SimpleTranscriptionResult {
  text: string
  isPartial: boolean
  confidence?: number
  timestamp: number
}

/**
 * Simple WebSocket message handler for transcription
 * 
 * This handler focuses on:
 * - Extracting text from WebSocket messages reliably
 * - Minimal processing to avoid dropping messages
 * - Direct event emission for immediate display
 */
export class SimpleWebSocketTranscriptionHandler extends EventEmitter {
  private sessionId: string
  private isActive: boolean = false
  private lastText: string = ''
  
  constructor(sessionId?: string) {
    super()
    this.sessionId = sessionId || `simple_${Date.now()}`
  }
  
  /**
   * Start the transcription session
   */
  start() {
    this.isActive = true
    this.lastText = ''
    console.log('🎤 Simple transcription handler started:', this.sessionId)
  }
  
  /**
   * Stop the transcription session
   */
  stop() {
    this.isActive = false
    console.log('🛑 Simple transcription handler stopped:', this.sessionId)
  }
  
  /**
   * Process WebSocket message with minimal complexity
   * 
   * This method tries multiple common message formats from Gemini Live API:
   * 1. Direct text content
   * 2. server_content format  
   * 3. model_turn format
   * 4. inputTranscription format
   */
  processMessage(message: unknown): SimpleTranscriptionResult | null {
    if (!this.isActive) {
      return null
    }
    
    try {
      // Type guard for message object
      const msg = message as Record<string, unknown>
      
      // Log raw message for debugging
      console.log('📥 Simple handler processing message:', {
        type: typeof message,
        hasContent: !!(msg?.content),
        hasText: !!(msg?.text),
        hasServerContent: !!(msg?.server_content),
        hasModelTurn: !!(msg?.model_turn),
        hasInputTranscription: !!(msg?.inputTranscription),
        messageKeys: message && typeof message === 'object' ? Object.keys(message) : [],
        fullMessage: JSON.stringify(message, null, 2).slice(0, 500) // First 500 chars
      })
      
      let extractedText = ''
      let isPartial = false
      let confidence = 0.8
      
      // Try different message formats
      if (typeof message === 'string') {
        // Direct string message
        extractedText = message.trim()
      } else if (msg?.content && typeof msg.content === 'string') {
        // Direct content property
        extractedText = msg.content.trim()
        isPartial = !!(msg.isPartial || msg.partial)
        confidence = typeof msg.confidence === 'number' ? msg.confidence : 0.8
      } else if (msg?.text && typeof msg.text === 'string') {
        // Direct text property
        extractedText = msg.text.trim()
        isPartial = !!(msg.isPartial || msg.partial)
        confidence = typeof msg.confidence === 'number' ? msg.confidence : 0.8
      } else if (msg?.server_content) {
        // Gemini Live API server_content format
        const serverContent = msg.server_content as Record<string, unknown>
        const modelTurn = serverContent.model_turn as Record<string, unknown>
        if (modelTurn?.parts && Array.isArray(modelTurn.parts)) {
          for (const part of modelTurn.parts) {
            const partObj = part as Record<string, unknown>
            if (partObj.text && typeof partObj.text === 'string') {
              extractedText += partObj.text
            }
          }
        }
        isPartial = !serverContent.turn_complete
      } else if (msg?.model_turn) {
        // Direct model_turn format
        const modelTurn = msg.model_turn as Record<string, unknown>
        if (modelTurn.parts && Array.isArray(modelTurn.parts)) {
          for (const part of modelTurn.parts) {
            const partObj = part as Record<string, unknown>
            if (partObj.text && typeof partObj.text === 'string') {
              extractedText += partObj.text
            }
          }
        }
        isPartial = !msg.turn_complete
      } else if (msg?.inputTranscription && typeof msg.inputTranscription === 'string') {
        // Input transcription format
        extractedText = msg.inputTranscription.trim()
        isPartial = msg.inputTranscriptionState === 'partial'
      }
      
      // Clean up extracted text
      extractedText = extractedText.trim()
      
      if (!extractedText) {
        console.log('⚠️ No text extracted from message')
        return null
      }
      
      console.log('✅ Text extracted successfully:', {
        text: extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : ''),
        fullText: extractedText,
        textLength: extractedText.length,
        isPartial,
        confidence,
        isNewText: extractedText !== this.lastText
      })
      
      // Create result
      const result: SimpleTranscriptionResult = {
        text: extractedText,
        isPartial,
        confidence,
        timestamp: Date.now()
      }
      
      // Update last text for comparison
      if (!isPartial || extractedText.length > this.lastText.length) {
        this.lastText = extractedText
      }
      
      // Emit immediately for display
      this.emit('transcription', result)
      
      return result
      
    } catch (error) {
      console.error('❌ Error processing message in simple handler:', error)
      console.error('Message that caused error:', message)
      return null
    }
  }
  
  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId
  }
  
  /**
   * Get the last processed text
   */
  getLastText(): string {
    return this.lastText
  }
  
  /**
   * Reset the handler state
   */
  reset() {
    this.lastText = ''
    this.removeAllListeners()
    console.log('🔄 Simple transcription handler reset:', this.sessionId)
  }
}

/**
 * Create a simple handler instance
 */
export const createSimpleTranscriptionHandler = (sessionId?: string) => {
  return new SimpleWebSocketTranscriptionHandler(sessionId)
}

export default SimpleWebSocketTranscriptionHandler
