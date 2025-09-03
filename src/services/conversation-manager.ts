/**
 * Conversation Manager
 * 
 * Handles interruption logic and conversation flow for Gemini Live API VAD integration.
 * Coordinates between VAD detection, model responses, and user interruptions.
 * 
 * Based on Google Gemini Live API v2 interruption handling:
 * https://ai.google.dev/gemini-api/docs/live-guide#interruptions
 */

import {EventEmitter} from 'events'
import {VADManager, VADEvent, VADState} from './voice-activity-detector'
import {GeminiLiveWebSocketClient} from './gemini-live-websocket'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

export interface ConversationConfig {
  // Interruption settings
  enableInterruptions: boolean
  interruptionCooldownMs: number
  maxInterruptionsPerMinute: number
  
  // Response management
  pauseOnInterruption: boolean
  resumeAfterSilence: boolean
  silenceThresholdMs: number
  
  // Conversation flow
  enableTurnTaking: boolean
  turnTimeoutMs: number
  maxResponseWaitMs: number
  
  // Audio buffering
  bufferInterruptedAudio: boolean
  maxBufferSizeMs: number
}

export interface ConversationState {
  isUserTurn: boolean
  isModelTurn: boolean
  isInterrupted: boolean
  interruptionCount: number
  lastInterruptionTime: number
  currentTurnId: string | null
  conversationStartTime: number
  totalTurns: number
}

export interface InterruptionEvent {
  type: 'interruption_detected' | 'interruption_processed' | 'conversation_resumed' | 'turn_changed'
  timestamp: number
  confidence: number
  turnId?: string
  metadata?: {
    interruptionCount?: number
    pausedResponse?: boolean
    bufferedAudio?: boolean
    cooldownRemaining?: number
  }
}

export interface TurnContext {
  turnId: string
  startTime: number
  endTime?: number
  isUserTurn: boolean
  isComplete: boolean
  wasInterrupted: boolean
  audioBuffer?: Float32Array[]
  transcriptionText?: string
}

/**
 * Manages conversation flow, interruptions, and turn-taking for VAD-enabled Gemini Live API
 */
export class ConversationManager extends EventEmitter {
  private vadManager: VADManager
  private websocketClient: GeminiLiveWebSocketClient
  private config: ConversationConfig
  private state: ConversationState
  
  // Turn management
  private currentTurn: TurnContext | null = null
  private turnHistory: TurnContext[] = []
  private turnIdCounter = 0
  
  // Interruption management
  private interruptionCooldownTimer: NodeJS.Timeout | null = null
  private interruptionLimiter: {count: number; resetTime: number} = {count: 0, resetTime: 0}
  private pendingResumption: NodeJS.Timeout | null = null
  
  // Audio buffering for interrupted content
  private audioBuffer: Float32Array[] = []
  private bufferStartTime: number | null = null
  
  // Response state management
  private isAwaitingResponse = false
  private responseTimeout: NodeJS.Timeout | null = null

  constructor(
    vadManager: VADManager,
    websocketClient: GeminiLiveWebSocketClient,
    config: Partial<ConversationConfig> = {}
  ) {
    super()
    
    this.vadManager = vadManager
    this.websocketClient = websocketClient
    
    this.config = {
      enableInterruptions: true,
      interruptionCooldownMs: 1000, // 1 second cooldown
      maxInterruptionsPerMinute: 10,
      pauseOnInterruption: true,
      resumeAfterSilence: true,
      silenceThresholdMs: 2000, // 2 seconds of silence
      enableTurnTaking: true,
      turnTimeoutMs: 30000, // 30 second turn timeout
      maxResponseWaitMs: 10000, // 10 seconds max wait for response
      bufferInterruptedAudio: true,
      maxBufferSizeMs: 5000, // 5 seconds of buffered audio
      ...config
    }
    
    this.state = {
      isUserTurn: false,
      isModelTurn: false,
      isInterrupted: false,
      interruptionCount: 0,
      lastInterruptionTime: 0,
      currentTurnId: null,
      conversationStartTime: Date.now(),
      totalTurns: 0
    }
    
    this.setupEventHandlers()
    
    logger.info('ConversationManager initialized', {
      enableInterruptions: this.config.enableInterruptions,
      enableTurnTaking: this.config.enableTurnTaking,
      interruptionCooldown: this.config.interruptionCooldownMs
    })
  }

  /**
   * Set up event handlers for VAD and WebSocket events
   */
  private setupEventHandlers(): void {
    // VAD event handlers
    this.vadManager.on('speech_start', (event: VADEvent) => {
      this.handleSpeechStart(event)
    })
    
    this.vadManager.on('speech_end', (event: VADEvent) => {
      this.handleSpeechEnd(event)
    })
    
    this.vadManager.on('interruption_detected', (event: VADEvent) => {
      this.handleInterruption(event)
    })
    
    this.vadManager.on('silence_detected', (event: VADEvent) => {
      this.handleSilence(event)
    })
    
    // WebSocket event handlers
    this.websocketClient.on('textResponse', (response) => {
      this.handleModelResponse(response)
    })
    
    this.websocketClient.on('turnComplete', (turnData) => {
      this.handleTurnComplete(turnData)
    })
    
    this.websocketClient.on('setupComplete', () => {
      this.handleSetupComplete()
    })
    
    this.websocketClient.on('error', (error) => {
      this.handleWebSocketError(error)
    })
    
    logger.debug('ConversationManager event handlers set up')
  }

  /**
   * Handle speech start event from VAD
   */
  private handleSpeechStart(event: VADEvent): void {
    logger.debug('Speech start detected', {
      confidence: event.confidence,
      canInterrupt: event.metadata?.canInterrupt,
      isModelTurn: this.state.isModelTurn
    })
    
    // Check if this should trigger an interruption
    if (this.state.isModelTurn && event.metadata?.canInterrupt && this.canInterrupt()) {
      this.processInterruption(event)
    } else if (!this.state.isUserTurn && !this.state.isModelTurn) {
      // Start a new user turn
      this.startUserTurn(event)
    }
    
    // Update VAD manager about model speaking state
    this.vadManager.setModelSpeaking(this.state.isModelTurn)
  }

  /**
   * Handle speech end event from VAD
   */
  private handleSpeechEnd(event: VADEvent): void {
    logger.debug('Speech end detected', {
      confidence: event.confidence,
      duration: event.metadata?.duration,
      isUserTurn: this.state.isUserTurn
    })
    
    if (this.state.isUserTurn && this.currentTurn) {
      // Complete user turn
      this.completeUserTurn(event)
    }
  }

  /**
   * Handle interruption detected event
   */
  private handleInterruption(event: VADEvent): void {
    if (!this.canInterrupt()) {
      logger.debug('Interruption ignored - cooldown active or limit exceeded')
      return
    }
    
    logger.info('Processing interruption', {
      confidence: event.confidence,
      interruptionCount: this.state.interruptionCount + 1
    })
    
    this.processInterruption(event)
  }

  /**
   * Handle silence detected event
   */
  private handleSilence(event: VADEvent): void {
    logger.debug('Silence detected', {
      duration: event.metadata?.silenceDuration
    })
    
    // Check if we should resume after interruption
    if (this.state.isInterrupted && this.config.resumeAfterSilence) {
      const silenceDuration = event.metadata?.silenceDuration || 0
      if (silenceDuration >= this.config.silenceThresholdMs) {
        this.resumeConversation(event)
      }
    }
    
    // Check for turn timeout
    if (this.state.isUserTurn && this.currentTurn) {
      const turnDuration = event.timestamp - this.currentTurn.startTime
      if (turnDuration >= this.config.turnTimeoutMs) {
        logger.debug('User turn timeout, completing turn')
        this.completeUserTurn(event)
      }
    }
  }

  /**
   * Handle model response from WebSocket
   */
  private handleModelResponse(response: any): void {
    logger.debug('Model response received', {
      isPartial: response.isPartial,
      contentLength: response.content?.length || 0,
      isModelTurn: this.state.isModelTurn
    })
    
    // Start model turn if not already started
    if (!this.state.isModelTurn && !response.isPartial) {
      this.startModelTurn()
    }
    
    // Clear response timeout
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
      this.responseTimeout = null
    }
    
    this.isAwaitingResponse = false
    
    // Update VAD manager about model speaking
    this.vadManager.setModelSpeaking(true)
    
    // Emit response event for UI updates
    this.emit('model_response', {
      content: response.content,
      isPartial: response.isPartial,
      turnId: this.currentTurn?.turnId,
      timestamp: Date.now()
    })
  }

  /**
   * Handle turn complete from WebSocket
   */
  private handleTurnComplete(turnData: any): void {
    logger.debug('Turn complete received', {
      turnId: turnData.turnId,
      isModelTurn: this.state.isModelTurn
    })
    
    if (this.state.isModelTurn) {
      this.completeModelTurn(turnData)
    }
    
    // Update VAD manager about model not speaking
    this.vadManager.setModelSpeaking(false)
  }

  /**
   * Handle WebSocket setup complete
   */
  private handleSetupComplete(): void {
    logger.info('WebSocket setup complete - conversation ready')
    this.emit('conversation_ready')
  }

  /**
   * Handle WebSocket errors
   */
  private handleWebSocketError(error: any): void {
    logger.error('WebSocket error in conversation', {
      error: error.message || 'Unknown error'
    })
    
    // Reset conversation state on error
    this.resetConversationState()
    
    this.emit('conversation_error', error)
  }

  /**
   * Start a new user turn
   */
  private startUserTurn(event: VADEvent): void {
    const turnId = this.generateTurnId()
    
    this.currentTurn = {
      turnId,
      startTime: event.timestamp,
      isUserTurn: true,
      isComplete: false,
      wasInterrupted: false,
      audioBuffer: []
    }
    
    this.state.isUserTurn = true
    this.state.isModelTurn = false
    this.state.currentTurnId = turnId
    this.state.totalTurns++
    
    logger.info('User turn started', {turnId, confidence: event.confidence})
    
    this.emit('turn_started', {
      type: 'turn_changed',
      timestamp: event.timestamp,
      confidence: event.confidence,
      turnId,
      metadata: {
        isUserTurn: true
      }
    })
  }

  /**
   * Complete user turn
   */
  private completeUserTurn(event: VADEvent): void {
    if (!this.currentTurn || !this.state.isUserTurn) {
      return
    }
    
    this.currentTurn.endTime = event.timestamp
    this.currentTurn.isComplete = true
    
    // Add to turn history
    this.turnHistory.push({...this.currentTurn})
    
    // Send turn completion to WebSocket
    this.websocketClient.sendTurnCompletion()
    
    this.state.isUserTurn = false
    this.isAwaitingResponse = true
    
    // Set response timeout
    this.responseTimeout = setTimeout(() => {
      logger.warn('Response timeout - no model response received')
      this.handleResponseTimeout()
    }, this.config.maxResponseWaitMs)
    
    logger.info('User turn completed', {
      turnId: this.currentTurn.turnId,
      duration: event.timestamp - this.currentTurn.startTime
    })
    
    this.emit('turn_completed', {
      type: 'turn_changed',
      timestamp: event.timestamp,
      confidence: event.confidence,
      turnId: this.currentTurn.turnId,
      metadata: {
        isUserTurn: false,
        duration: this.currentTurn.endTime! - this.currentTurn.startTime
      }
    })
    
    this.currentTurn = null
  }

  /**
   * Start model turn
   */
  private startModelTurn(): void {
    const turnId = this.generateTurnId()
    
    this.currentTurn = {
      turnId,
      startTime: Date.now(),
      isUserTurn: false,
      isComplete: false,
      wasInterrupted: false
    }
    
    this.state.isModelTurn = true
    this.state.isUserTurn = false
    this.state.currentTurnId = turnId
    this.state.totalTurns++
    
    logger.info('Model turn started', {turnId})
    
    this.emit('turn_started', {
      type: 'turn_changed',
      timestamp: Date.now(),
      confidence: 1.0,
      turnId,
      metadata: {
        isUserTurn: false
      }
    })
  }

  /**
   * Complete model turn
   */
  private completeModelTurn(turnData: any): void {
    if (!this.currentTurn || !this.state.isModelTurn) {
      return
    }
    
    this.currentTurn.endTime = Date.now()
    this.currentTurn.isComplete = true
    
    // Add to turn history
    this.turnHistory.push({...this.currentTurn})
    
    this.state.isModelTurn = false
    
    logger.info('Model turn completed', {
      turnId: this.currentTurn.turnId,
      duration: this.currentTurn.endTime - this.currentTurn.startTime
    })
    
    this.emit('turn_completed', {
      type: 'turn_changed',
      timestamp: Date.now(),
      confidence: 1.0,
      turnId: this.currentTurn.turnId,
      metadata: {
        isUserTurn: false,
        duration: this.currentTurn.endTime - this.currentTurn.startTime
      }
    })
    
    this.currentTurn = null
  }

  /**
   * Process interruption
   */
  private processInterruption(event: VADEvent): void {
    logger.info('Processing interruption', {
      confidence: event.confidence,
      currentTurn: this.currentTurn?.turnId
    })
    
    // Update interruption state
    this.state.isInterrupted = true
    this.state.interruptionCount++
    this.state.lastInterruptionTime = event.timestamp
    
    // Update rate limiter
    this.updateInterruptionLimiter()
    
    // Handle current model turn interruption
    if (this.state.isModelTurn && this.currentTurn) {
      this.currentTurn.wasInterrupted = true
      
      if (this.config.pauseOnInterruption) {
        // Send interruption signal to WebSocket
        this.sendInterruptionSignal()
      }
    }
    
    // Start interruption cooldown
    this.startInterruptionCooldown()
    
    // Start new user turn for the interruption
    this.startUserTurn(event)
    
    this.emit('interruption_processed', {
      type: 'interruption_processed',
      timestamp: event.timestamp,
      confidence: event.confidence,
      turnId: this.currentTurn?.turnId,
      metadata: {
        interruptionCount: this.state.interruptionCount,
        pausedResponse: this.config.pauseOnInterruption
      }
    })
  }

  /**
   * Resume conversation after interruption
   */
  private resumeConversation(event: VADEvent): void {
    logger.info('Resuming conversation after interruption')
    
    this.state.isInterrupted = false
    
    // Clear any pending resumption
    if (this.pendingResumption) {
      clearTimeout(this.pendingResumption)
      this.pendingResumption = null
    }
    
    this.emit('conversation_resumed', {
      type: 'conversation_resumed',
      timestamp: event.timestamp,
      confidence: event.confidence,
      metadata: {
        interruptionCount: this.state.interruptionCount
      }
    })
  }

  /**
   * Send interruption signal to WebSocket
   */
  private sendInterruptionSignal(): void {
    try {
      // Send a signal to pause/interrupt the current model response
      // This would depend on the specific Gemini Live API interruption protocol
      logger.debug('Sending interruption signal to WebSocket')
      
      // For now, we emit an event that the WebSocket client can handle
      this.emit('send_interruption', {
        timestamp: Date.now(),
        turnId: this.currentTurn?.turnId
      })
    } catch (error) {
      logger.error('Failed to send interruption signal', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Check if interruption is allowed
   */
  private canInterrupt(): boolean {
    if (!this.config.enableInterruptions) {
      return false
    }
    
    // Check cooldown
    const now = Date.now()
    const timeSinceLastInterruption = now - this.state.lastInterruptionTime
    if (timeSinceLastInterruption < this.config.interruptionCooldownMs) {
      return false
    }
    
    // Check rate limit
    if (this.interruptionLimiter.resetTime > now && 
        this.interruptionLimiter.count >= this.config.maxInterruptionsPerMinute) {
      return false
    }
    
    return true
  }

  /**
   * Update interruption rate limiter
   */
  private updateInterruptionLimiter(): void {
    const now = Date.now()
    const oneMinute = 60 * 1000
    
    // Reset counter if more than a minute has passed
    if (now > this.interruptionLimiter.resetTime) {
      this.interruptionLimiter.count = 0
      this.interruptionLimiter.resetTime = now + oneMinute
    }
    
    this.interruptionLimiter.count++
  }

  /**
   * Start interruption cooldown timer
   */
  private startInterruptionCooldown(): void {
    if (this.interruptionCooldownTimer) {
      clearTimeout(this.interruptionCooldownTimer)
    }
    
    this.interruptionCooldownTimer = setTimeout(() => {
      logger.debug('Interruption cooldown expired')
      this.interruptionCooldownTimer = null
    }, this.config.interruptionCooldownMs)
  }

  /**
   * Handle response timeout
   */
  private handleResponseTimeout(): void {
    logger.warn('Response timeout - resetting conversation state')
    
    this.isAwaitingResponse = false
    this.responseTimeout = null
    
    // Reset state to allow new conversation
    this.resetConversationState()
    
    this.emit('response_timeout')
  }

  /**
   * Reset conversation state
   */
  private resetConversationState(): void {
    this.state.isUserTurn = false
    this.state.isModelTurn = false
    this.state.isInterrupted = false
    this.state.currentTurnId = null
    
    if (this.currentTurn) {
      this.currentTurn.isComplete = true
      this.turnHistory.push({...this.currentTurn})
      this.currentTurn = null
    }
    
    // Clear timers
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
      this.responseTimeout = null
    }
    
    if (this.pendingResumption) {
      clearTimeout(this.pendingResumption)
      this.pendingResumption = null
    }
    
    // Update VAD manager
    this.vadManager.setModelSpeaking(false)
    
    logger.debug('Conversation state reset')
  }

  /**
   * Generate unique turn ID
   */
  private generateTurnId(): string {
    return `turn_${++this.turnIdCounter}_${Date.now()}`
  }

  /**
   * Get current conversation state
   */
  getState(): ConversationState {
    return {...this.state}
  }

  /**
   * Get turn history
   */
  getTurnHistory(): TurnContext[] {
    return [...this.turnHistory]
  }

  /**
   * Get current turn
   */
  getCurrentTurn(): TurnContext | null {
    return this.currentTurn ? {...this.currentTurn} : null
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConversationConfig>): void {
    this.config = {...this.config, ...newConfig}
    
    logger.info('ConversationManager configuration updated', {
      enableInterruptions: this.config.enableInterruptions,
      interruptionCooldown: this.config.interruptionCooldownMs
    })
    
    this.emit('config_updated', this.config)
  }

  /**
   * Start conversation manager
   */
  start(): void {
    logger.info('ConversationManager started')
    this.state.conversationStartTime = Date.now()
    this.emit('started')
  }

  /**
   * Stop conversation manager
   */
  stop(): void {
    // Clear all timers
    if (this.interruptionCooldownTimer) {
      clearTimeout(this.interruptionCooldownTimer)
      this.interruptionCooldownTimer = null
    }
    
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
      this.responseTimeout = null
    }
    
    if (this.pendingResumption) {
      clearTimeout(this.pendingResumption)
      this.pendingResumption = null
    }
    
    // Reset state
    this.resetConversationState()
    
    logger.info('ConversationManager stopped')
    this.emit('stopped')
  }

  /**
   * Destroy conversation manager and cleanup resources
   */
  destroy(): void {
    this.stop()
    this.removeAllListeners()
    this.turnHistory = []
    this.audioBuffer = []
    
    logger.info('ConversationManager destroyed')
  }
}

export default ConversationManager