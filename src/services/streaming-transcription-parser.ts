/**
 * Enhanced Streaming Transcription Parser for Gemini Live API
 * Specialized parser for handling real-time transcription responses with proper text extraction
 */

import {EventEmitter} from 'events'

export enum TranscriptionState {
  PARTIAL = 'partial',
  FINAL = 'final',
  ERROR = 'error',
  PENDING = 'pending'
}

export interface StreamingTranscriptionResult {
  text: string
  state: TranscriptionState
  confidence?: number
  timestamp: number
  language?: string
  isComplete: boolean
  chunkId?: string
  sessionId?: string
  metadata?: {
    duration?: number
    audioLength?: number
    processingTime?: number
    [key: string]: unknown
  }
}

export interface TextAccumulationState {
  fullText: string
  currentChunk: string
  chunkCount: number
  lastUpdate: number
  isComplete: boolean
  confidence: number
}

/**
 * Text Accumulator for managing streaming transcription state
 */
class TextAccumulator {
  private state: TextAccumulationState = {
    fullText: '',
    currentChunk: '',
    chunkCount: 0,
    lastUpdate: Date.now(),
    isComplete: false,
    confidence: 0
  }

  /**
   * Add a new text chunk to the accumulator
   */
  addChunk(text: string, isFinal: boolean = false, confidence?: number): TextAccumulationState {
    const now = Date.now()
    
    // Clean and normalize the text
    const cleanedText = this.cleanText(text)
    
    if (cleanedText) {
      // Update the state
      this.state.currentChunk = cleanedText
      this.state.chunkCount++
      this.state.lastUpdate = now
      this.state.isComplete = isFinal
      
      if (confidence !== undefined) {
        this.state.confidence = confidence
      }

      // Append to full text with proper spacing
      if (this.state.fullText && cleanedText) {
        // Check if we need a space (for proper word separation)
        const needsSpace = !this.state.fullText.endsWith(' ') && 
                          !cleanedText.startsWith(' ') &&
                          !this.isPunctuation(cleanedText.charAt(0))
        
        this.state.fullText += (needsSpace ? ' ' : '') + cleanedText
      } else if (cleanedText) {
        this.state.fullText = cleanedText
      }
    }

    return {...this.state}
  }

  /**
   * Clean and normalize text for display
   */
  private cleanText(text: string): string {
    if (!text || typeof text !== 'string') return ''
    
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
  }

  /**
   * Check if character is punctuation
   */
  private isPunctuation(char: string): boolean {
    return /[.,!?;:'"()-]/.test(char)
  }

  /**
   * Reset the accumulator
   */
  reset(): void {
    this.state = {
      fullText: '',
      currentChunk: '',
      chunkCount: 0,
      lastUpdate: Date.now(),
      isComplete: false,
      confidence: 0
    }
  }

  /**
   * Get current state
   */
  getState(): TextAccumulationState {
    return {...this.state}
  }

  /**
   * Mark as complete
   */
  markComplete(): TextAccumulationState {
    this.state.isComplete = true
    this.state.lastUpdate = Date.now()
    return {...this.state}
  }
}

/**
 * Enhanced Streaming Transcription Parser
 */
export class StreamingTranscriptionParser extends EventEmitter {
  private textAccumulator: TextAccumulator
  private sessionId: string
  private lastProcessedMessage: string = ''
  private messageHistory: Array<{text: string, timestamp: number, state: TranscriptionState}> = []
  private languageDetector: Map<string, number> = new Map()

  constructor(sessionId?: string) {
    super()
    this.sessionId = sessionId || `session_${Date.now()}`
    this.textAccumulator = new TextAccumulator()
  }

  /**
   * Parse incoming WebSocket message for transcription content
   */
  parseMessage(rawMessage: unknown): StreamingTranscriptionResult | null {
    try {
      const message = this.normalizeMessage(rawMessage)
      
      if (!message) {
        return null
      }

      // Extract transcription content using multiple strategies
      const textContent = this.extractTranscriptionText(message)
      
      if (!textContent) {
        return null
      }

      const {text, isFinal, confidence, metadata} = textContent

      // Detect state based on content and message structure
      const state = this.determineTranscriptionState(message, isFinal)
      
      // Update text accumulator
      const accumulatedState = this.textAccumulator.addChunk(text, isFinal, confidence)
      
      // Detect language if possible
      const language = this.detectLanguage(text)
      
      // Create result
      const result: StreamingTranscriptionResult = {
        text: accumulatedState.fullText, // Return full accumulated text
        state,
        confidence: confidence || accumulatedState.confidence,
        timestamp: Date.now(),
        language,
        isComplete: isFinal || state === TranscriptionState.FINAL,
        chunkId: this.generateChunkId(),
        sessionId: this.sessionId,
        metadata: {
          duration: typeof metadata?.duration === 'number' ? metadata.duration : undefined,
          audioLength: typeof metadata?.audioLength === 'number' ? metadata.audioLength : undefined,
          processingTime: Date.now() - (typeof metadata?.startTime === 'number' ? metadata.startTime : Date.now()),
          chunkText: text, // Individual chunk for debugging
          chunkCount: accumulatedState.chunkCount,
          ...metadata
        }
      }

      // Add to history
      this.addToHistory(text, state)

      // Emit events
      this.emit('transcriptionResult', result)
      
      if (isFinal) {
        this.emit('transcriptionComplete', result)
      } else {
        this.emit('transcriptionPartial', result)
      }

      return result

    } catch (error) {
      console.error('Error parsing streaming transcription message:', error)
      
      const errorResult: StreamingTranscriptionResult = {
        text: '',
        state: TranscriptionState.ERROR,
        timestamp: Date.now(),
        isComplete: false,
        sessionId: this.sessionId,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown parsing error'
        }
      }

      this.emit('transcriptionError', errorResult, error)
      return errorResult
    }
  }

  /**
   * Normalize message to a consistent format
   */
  private normalizeMessage(rawMessage: unknown): Record<string, unknown> | null {
    if (!rawMessage) return null

    // Handle string messages (JSON)
    if (typeof rawMessage === 'string') {
      try {
        return JSON.parse(rawMessage)
      } catch {
        return null
      }
    }

    // Handle object messages
    if (typeof rawMessage === 'object' && rawMessage !== null) {
      return rawMessage as Record<string, unknown>
    }

    return null
  }

  /**
   * Extract transcription text using multiple strategies
   */
  private extractTranscriptionText(message: Record<string, unknown>): {
    text: string
    isFinal: boolean
    confidence?: number
    metadata?: Record<string, unknown>
  } | null {
    
    // Strategy 1: Direct server_content extraction
    if (message.server_content) {
      return this.extractFromServerContent(message.server_content)
    }

    // Strategy 2: Model turn extraction
    if (message.model_turn) {
      return this.extractFromModelTurn(message.model_turn)
    }

    // Strategy 3: Direct text fields
    if (message.text) {
      return {
        text: String(message.text),
        isFinal: Boolean(message.isFinal || message.is_final || message.complete),
        confidence: typeof message.confidence === 'number' ? message.confidence : undefined,
        metadata: message.metadata as Record<string, unknown>
      }
    }

    // Strategy 4: Nested content extraction
    if (message.content) {
      return this.extractFromContent(message.content)
    }

    // Strategy 5: Alternative field names
    const alternativeFields = ['transcription', 'transcript', 'message', 'data']
    for (const field of alternativeFields) {
      if (message[field]) {
        const fieldValue = message[field]
        if (typeof fieldValue === 'string') {
          return {
            text: fieldValue,
            isFinal: Boolean(message.isFinal || message.is_final),
            confidence: typeof message.confidence === 'number' ? message.confidence : undefined
          }
        } else if (typeof fieldValue === 'object' && fieldValue !== null) {
          const nested = this.extractTranscriptionText(fieldValue as Record<string, unknown>)
          if (nested) return nested
        }
      }
    }

    return null
  }

  /**
   * Extract from server_content field (Gemini Live API format)
   */
  private extractFromServerContent(serverContent: unknown): {
    text: string
    isFinal: boolean
    confidence?: number
    metadata?: Record<string, unknown>
  } | null {
    
    if (typeof serverContent !== 'object' || !serverContent) return null
    
    const content = serverContent as Record<string, unknown>

    // Check for model_turn within server_content
    if (content.model_turn) {
      return this.extractFromModelTurn(content.model_turn)
    }

    // Check for parts array
    if (Array.isArray(content.parts)) {
      const textParts = content.parts
        .filter((part: unknown): part is Record<string, unknown> => 
          typeof part === 'object' && part !== null)
        .map((part: Record<string, unknown>) => part.text)
        .filter((text: unknown): text is string => typeof text === 'string')
        .join(' ')

      if (textParts) {
        return {
          text: textParts,
          isFinal: Boolean(content.turn_complete || content.isFinal),
          confidence: typeof content.confidence === 'number' ? content.confidence : undefined,
          metadata: content.metadata as Record<string, unknown>
        }
      }
    }

    // Direct text extraction
    if (typeof content.text === 'string') {
      return {
        text: content.text,
        isFinal: Boolean(content.turn_complete || content.isFinal),
        confidence: typeof content.confidence === 'number' ? content.confidence : undefined
      }
    }

    return null
  }

  /**
   * Extract from model_turn field
   */
  private extractFromModelTurn(modelTurn: unknown): {
    text: string
    isFinal: boolean
    confidence?: number
    metadata?: Record<string, unknown>
  } | null {
    
    if (typeof modelTurn !== 'object' || !modelTurn) return null
    
    const turn = modelTurn as Record<string, unknown>

    // Check for parts array in model turn
    if (Array.isArray(turn.parts)) {
      const textParts = turn.parts
        .filter((part: unknown): part is Record<string, unknown> => 
          typeof part === 'object' && part !== null)
        .map((part: Record<string, unknown>) => {
          // Handle different text field names
          return part.text || part.content || part.transcript
        })
        .filter((text: unknown): text is string => typeof text === 'string' && text.trim().length > 0)
        .join(' ')

      if (textParts) {
        return {
          text: textParts,
          isFinal: Boolean(turn.turn_complete || turn.isFinal),
          confidence: typeof turn.confidence === 'number' ? turn.confidence : undefined,
          metadata: turn.metadata as Record<string, unknown>
        }
      }
    }

    // Direct text in model turn
    if (typeof turn.text === 'string') {
      return {
        text: turn.text,
        isFinal: Boolean(turn.turn_complete || turn.isFinal),
        confidence: typeof turn.confidence === 'number' ? turn.confidence : undefined
      }
    }

    return null
  }

  /**
   * Extract from generic content field
   */
  private extractFromContent(content: unknown): {
    text: string
    isFinal: boolean
    confidence?: number
    metadata?: Record<string, unknown>
  } | null {
    
    if (typeof content === 'string') {
      return {
        text: content,
        isFinal: false, // Assume partial unless specified
        confidence: undefined
      }
    }

    if (typeof content === 'object' && content !== null) {
      return this.extractTranscriptionText(content as Record<string, unknown>)
    }

    return null
  }

  /**
   * Determine transcription state from message structure
   */
  private determineTranscriptionState(message: Record<string, unknown>, isFinal?: boolean): TranscriptionState {
    // Check for explicit error indicators
    if (message.error || message.status === 'error') {
      return TranscriptionState.ERROR
    }

    // Check for completion indicators
    if (isFinal || message.turn_complete || message.complete || message.isFinal) {
      return TranscriptionState.FINAL
    }

    // Check for partial indicators
    if (message.partial || message.streaming || message.interim) {
      return TranscriptionState.PARTIAL
    }

    // Default to partial for streaming content
    return TranscriptionState.PARTIAL
  }

  /**
   * Simple language detection based on character patterns
   */
  private detectLanguage(text: string): string | undefined {
    if (!text) return undefined

    // Detect Cyrillic script (Russian/Ukrainian/etc.)
    if (/[\u0400-\u04FF]/.test(text)) {
      // More specific detection for Ukrainian vs Russian
      if (/[іїєґ]/.test(text)) {
        this.updateLanguageStats('uk') // Ukrainian
        return 'uk'
      } else {
        this.updateLanguageStats('ru') // Russian
        return 'ru'
      }
    }

    // Detect Latin script
    if (/[a-zA-Z]/.test(text)) {
      this.updateLanguageStats('en') // Default to English for Latin script
      return 'en'
    }

    // Detect other scripts as needed
    return undefined
  }

  /**
   * Update language statistics
   */
  private updateLanguageStats(language: string): void {
    const currentCount = this.languageDetector.get(language) || 0
    this.languageDetector.set(language, currentCount + 1)
  }

  /**
   * Get dominant language from session
   */
  getDominantLanguage(): string | undefined {
    let maxCount = 0
    let dominantLanguage: string | undefined

    for (const [language, count] of this.languageDetector) {
      if (count > maxCount) {
        maxCount = count
        dominantLanguage = language
      }
    }

    return dominantLanguage
  }

  /**
   * Add message to history
   */
  private addToHistory(text: string, state: TranscriptionState): void {
    this.messageHistory.push({
      text,
      timestamp: Date.now(),
      state
    })

    // Keep history manageable
    if (this.messageHistory.length > 100) {
      this.messageHistory.shift()
    }
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(): string {
    return `chunk_${this.sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get accumulated text state
   */
  getAccumulatedText(): TextAccumulationState {
    return this.textAccumulator.getState()
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.textAccumulator.reset()
    this.messageHistory = []
    this.languageDetector.clear()
    this.lastProcessedMessage = ''
    this.emit('reset')
  }

  /**
   * Mark current session as complete
   */
  complete(): StreamingTranscriptionResult | null {
    const state = this.textAccumulator.markComplete()
    
    if (state.fullText) {
      const result: StreamingTranscriptionResult = {
        text: state.fullText,
        state: TranscriptionState.FINAL,
        confidence: state.confidence,
        timestamp: Date.now(),
        language: this.getDominantLanguage(),
        isComplete: true,
        sessionId: this.sessionId,
        metadata: {
          totalChunks: state.chunkCount,
          sessionDuration: Date.now() - (this.messageHistory[0]?.timestamp || Date.now())
        }
      }

      this.emit('transcriptionComplete', result)
      return result
    }

    return null
  }

  /**
   * Get message history
   */
  getHistory(): Array<{text: string, timestamp: number, state: TranscriptionState}> {
    return [...this.messageHistory]
  }

  /**
   * Get language statistics
   */
  getLanguageStats(): Map<string, number> {
    return new Map(this.languageDetector)
  }
}

export default StreamingTranscriptionParser
