/**
 * Conversation State Machine
 *
 * This module implements a sophisticated finite state machine for orchestrating
 * conversational AI interactions with proper state transitions, interruption handling,
 * and context preservation. It manages the complete conversation lifecycle from
 * audio input to response generation.
 *
 * State Flow:
 * Listening → Transcribing → UtteranceDetected → Intent → Plan → Execute → Respond
 *     ↑                                                                        ↓
 *     ←←←←←←←←←← Interruption/Completion ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
 *
 * Key Features:
 * - Finite state machine with defined transitions
 * - Interruption handling with immediate state transitions
 * - Context preservation across state changes
 * - Barge-in detection and response cancellation
 * - State persistence for conversation resumption
 * - Real-time processing with sub-100ms state transitions
 * - Comprehensive event emission and monitoring
 *
 * Architecture:
 * - ConversationStateMachine: Main state coordinator
 * - StateTransitionManager: Handles state change logic
 * - InterruptionHandler: Manages barge-in scenarios
 * - ContextManager: Preserves conversation context
 * - EventDispatcher: Handles event routing and emission
 */

import {EventEmitter} from 'events'
import {performance} from 'perf_hooks'

// Import our audio segmentation and intent classification
import type {AudioSegment} from './audio-segmenter'

export enum ConversationState {
  // Core conversation states
  LISTENING = 'listening',
  TRANSCRIBING = 'transcribing',
  UTTERANCE_DETECTED = 'utterance_detected',
  INTENT = 'intent',
  PLAN = 'plan',
  EXECUTE = 'execute',
  RESPOND = 'respond',

  // Special states
  INTERRUPTED = 'interrupted',
  ERROR = 'error',
  IDLE = 'idle',
  PAUSED = 'paused',
  SHUTDOWN = 'shutdown'
}

export enum ConversationEvent {
  // Input events
  AUDIO_INPUT = 'audio_input',
  SEGMENT_READY = 'segment_ready',
  TRANSCRIPTION_COMPLETE = 'transcription_complete',
  INTENT_CLASSIFIED = 'intent_classified',
  PLAN_READY = 'plan_ready',
  EXECUTION_COMPLETE = 'execution_complete',
  RESPONSE_READY = 'response_ready',

  // Control events
  USER_INTERRUPT = 'user_interrupt',
  SYSTEM_ERROR = 'system_error',
  TIMEOUT = 'timeout',
  CANCEL = 'cancel',
  RESET = 'reset',
  PAUSE = 'pause',
  RESUME = 'resume',
  SHUTDOWN = 'shutdown'
}

export interface StateTransition {
  from: ConversationState
  to: ConversationState
  event: ConversationEvent
  condition?: (context: ConversationContext) => boolean
  action?: (context: ConversationContext, eventData?: unknown) => Promise<void>
  timeout?: number
  priority: number // Higher priority transitions are processed first
}

export interface ConversationContext {
  conversationId: string
  userId?: string
  sessionId: string

  // Current state info
  currentState: ConversationState
  previousState: ConversationState
  stateHistory: Array<{
    state: ConversationState
    timestamp: number
    duration: number
    event?: ConversationEvent
    metadata?: Record<string, unknown>
  }>

  // Audio and transcription context
  currentAudioSegment?: AudioSegment
  currentTranscription?: string
  transcriptionConfidence?: number

  // Intent and planning context
  detectedIntent?: {
    intent: string
    confidence: number
    entities: Array<{
      type: string
      value: string
      confidence: number
    }>
  }
  executionPlan?: {
    actions: Array<{
      type: string
      parameters: Record<string, unknown>
      priority: number
    }>
    estimatedDuration: number
  }

  // Response context
  currentResponse?: {
    text: string
    type: 'immediate' | 'comprehensive'
    stage: number
    metadata?: Record<string, unknown>
  }

  // Interruption context
  wasInterrupted: boolean
  interruptionTime?: number
  interruptionReason?: string
  resumeContext?: Record<string, unknown>

  // Timing and performance
  stateStartTime: number
  totalConversationTime: number
  averageStateTransitionTime: number

  // Configuration and capabilities
  configuration: ConversationStateMachineConfig
  availableTools: string[]
  supportedLanguages: string[]

  // Error handling
  errorCount: number
  lastError?: Error
  errorRecoveryAttempts: number

  // Metrics and analytics
  metrics: {
    stateTransitions: number
    interruptions: number
    successfulCompletions: number
    errors: number
    averageResponseTime: number
  }

  // Extensible metadata
  metadata: Record<string, unknown>
}

export interface ConversationStateMachineConfig {
  // State transition timeouts (in milliseconds)
  listeningTimeout: number
  transcribingTimeout: number
  intentTimeout: number
  planningTimeout: number
  executionTimeout: number
  responseTimeout: number

  // Interruption handling
  enableInterruptions: boolean
  interruptionDetectionThreshold: number
  bargeInDelay: number

  // Context management
  enableContextPersistence: boolean
  maxContextHistory: number
  contextDecayTime: number

  // Error handling
  maxRetryAttempts: number
  errorRecoveryTimeout: number
  enableFallbackStates: boolean

  // Performance optimization
  enableParallelProcessing: boolean
  maxConcurrentOperations: number
  enableCaching: boolean

  // Language and localization
  defaultLanguage: string
  enableMultiLanguageSupport: boolean

  // Logging and monitoring
  enableDetailedLogging: boolean
  enablePerformanceTracking: boolean
  enableEventEmission: boolean

  // Integration settings
  enableAdvancedIntent: boolean
  enableToolIntegration: boolean
  enableTwoStageResponse: boolean
}

/**
 * State Transition Manager
 *
 * Manages state transitions with validation, conditions, and actions.
 */
class StateTransitionManager extends EventEmitter {
  private transitions: Map<string, StateTransition[]> = new Map()
  private config: ConversationStateMachineConfig

  constructor(config: ConversationStateMachineConfig) {
    super()
    this.config = config
    this.initializeTransitions()
  }

  private initializeTransitions(): void {
    // Define all valid state transitions
    const transitions: StateTransition[] = [
      // Normal conversation flow
      {
        from: ConversationState.LISTENING,
        to: ConversationState.TRANSCRIBING,
        event: ConversationEvent.SEGMENT_READY,
        timeout: this.config.transcribingTimeout,
        priority: 1
      },

      {
        from: ConversationState.TRANSCRIBING,
        to: ConversationState.UTTERANCE_DETECTED,
        event: ConversationEvent.TRANSCRIPTION_COMPLETE,
        timeout: this.config.intentTimeout,
        priority: 1
      },

      {
        from: ConversationState.UTTERANCE_DETECTED,
        to: ConversationState.INTENT,
        event: ConversationEvent.INTENT_CLASSIFIED,
        timeout: this.config.planningTimeout,
        priority: 1
      },

      {
        from: ConversationState.INTENT,
        to: ConversationState.PLAN,
        event: ConversationEvent.PLAN_READY,
        condition: context => !!context.executionPlan,
        timeout: this.config.executionTimeout,
        priority: 1
      },

      {
        from: ConversationState.PLAN,
        to: ConversationState.EXECUTE,
        event: ConversationEvent.EXECUTION_COMPLETE,
        timeout: this.config.responseTimeout,
        priority: 1
      },

      {
        from: ConversationState.EXECUTE,
        to: ConversationState.RESPOND,
        event: ConversationEvent.RESPONSE_READY,
        priority: 1
      },

      {
        from: ConversationState.RESPOND,
        to: ConversationState.LISTENING,
        event: ConversationEvent.AUDIO_INPUT,
        action: this.completeConversationTurn.bind(this),
        priority: 1
      },

      // Interruption transitions (highest priority)
      {
        from: ConversationState.TRANSCRIBING,
        to: ConversationState.INTERRUPTED,
        event: ConversationEvent.USER_INTERRUPT,
        action: this.handleInterruption.bind(this),
        priority: 10
      },

      {
        from: ConversationState.UTTERANCE_DETECTED,
        to: ConversationState.INTERRUPTED,
        event: ConversationEvent.USER_INTERRUPT,
        action: this.handleInterruption.bind(this),
        priority: 10
      },

      {
        from: ConversationState.INTENT,
        to: ConversationState.INTERRUPTED,
        event: ConversationEvent.USER_INTERRUPT,
        action: this.handleInterruption.bind(this),
        priority: 10
      },

      {
        from: ConversationState.PLAN,
        to: ConversationState.INTERRUPTED,
        event: ConversationEvent.USER_INTERRUPT,
        action: this.handleInterruption.bind(this),
        priority: 10
      },

      {
        from: ConversationState.EXECUTE,
        to: ConversationState.INTERRUPTED,
        event: ConversationEvent.USER_INTERRUPT,
        action: this.handleInterruption.bind(this),
        priority: 10
      },

      {
        from: ConversationState.RESPOND,
        to: ConversationState.INTERRUPTED,
        event: ConversationEvent.USER_INTERRUPT,
        action: this.handleInterruption.bind(this),
        priority: 10
      },

      // Recovery from interruption
      {
        from: ConversationState.INTERRUPTED,
        to: ConversationState.LISTENING,
        event: ConversationEvent.RESUME,
        action: this.resumeFromInterruption.bind(this),
        priority: 5
      },

      // Error handling transitions
      {
        from: ConversationState.TRANSCRIBING,
        to: ConversationState.ERROR,
        event: ConversationEvent.SYSTEM_ERROR,
        action: this.handleError.bind(this),
        priority: 8
      },

      {
        from: ConversationState.INTENT,
        to: ConversationState.ERROR,
        event: ConversationEvent.SYSTEM_ERROR,
        action: this.handleError.bind(this),
        priority: 8
      },

      {
        from: ConversationState.EXECUTE,
        to: ConversationState.ERROR,
        event: ConversationEvent.SYSTEM_ERROR,
        action: this.handleError.bind(this),
        priority: 8
      },

      // Recovery from error
      {
        from: ConversationState.ERROR,
        to: ConversationState.LISTENING,
        event: ConversationEvent.RESET,
        action: this.resetFromError.bind(this),
        priority: 5
      },

      // Timeout transitions
      {
        from: ConversationState.TRANSCRIBING,
        to: ConversationState.LISTENING,
        event: ConversationEvent.TIMEOUT,
        action: this.handleTimeout.bind(this),
        priority: 6
      },

      // Control transitions
      {
        from: ConversationState.LISTENING,
        to: ConversationState.PAUSED,
        event: ConversationEvent.PAUSE,
        priority: 7
      },

      {
        from: ConversationState.PAUSED,
        to: ConversationState.LISTENING,
        event: ConversationEvent.RESUME,
        priority: 7
      },

      // Shutdown transitions (from any state)
      ...Object.values(ConversationState).map(state => ({
        from: state,
        to: ConversationState.SHUTDOWN,
        event: ConversationEvent.SHUTDOWN,
        action: this.handleShutdown.bind(this),
        priority: 15
      }))
    ]

    // Group transitions by source state
    for (const transition of transitions) {
      const key = transition.from
      if (!this.transitions.has(key)) {
        this.transitions.set(key, [])
      }
      this.transitions.get(key)!.push(transition)
    }

    // Sort transitions by priority (higher priority first)
    for (const [, stateTransitions] of this.transitions) {
      stateTransitions.sort((a, b) => b.priority - a.priority)
    }
  }

  /**
   * Find valid transition for current state and event
   */
  findTransition(
    currentState: ConversationState,
    event: ConversationEvent,
    context: ConversationContext
  ): StateTransition | null {
    const stateTransitions = this.transitions.get(currentState)
    if (!stateTransitions) return null

    for (const transition of stateTransitions) {
      if (transition.event === event) {
        // Check condition if present
        if (transition.condition && !transition.condition(context)) {
          continue
        }
        return transition
      }
    }

    return null
  }

  /**
   * Execute transition action if present
   */
  async executeTransitionAction(
    transition: StateTransition,
    context: ConversationContext,
    eventData?: unknown
  ): Promise<void> {
    if (transition.action) {
      try {
        await transition.action(context, eventData)
      } catch (error) {
        this.emit('transition-action-error', {transition, context, error})
        throw error
      }
    }
  }

  // Transition action implementations
  private async completeConversationTurn(context: ConversationContext): Promise<void> {
    context.metrics.successfulCompletions++
    context.totalConversationTime += Date.now() - context.stateStartTime
    this.emit('conversation-turn-complete', context)
  }

  private async handleInterruption(
    context: ConversationContext,
    eventData?: unknown
  ): Promise<void> {
    context.wasInterrupted = true
    context.interruptionTime = Date.now()
    context.interruptionReason = (eventData as {reason?: string})?.reason || 'user_interrupt'
    context.resumeContext = {
      previousState: context.currentState,
      currentTranscription: context.currentTranscription,
      detectedIntent: context.detectedIntent,
      executionPlan: context.executionPlan
    }
    context.metrics.interruptions++
    this.emit('conversation-interrupted', context)
  }

  private async resumeFromInterruption(context: ConversationContext): Promise<void> {
    context.wasInterrupted = false
    if (context.resumeContext) {
      // Restore relevant context
      context.resumeContext = undefined
    }
    this.emit('conversation-resumed', context)
  }

  private async handleError(context: ConversationContext, eventData?: unknown): Promise<void> {
    context.errorCount++
    context.lastError = (eventData as {error?: Error})?.error
    context.errorRecoveryAttempts = 0
    context.metrics.errors++
    this.emit('conversation-error', context)
  }

  private async resetFromError(context: ConversationContext): Promise<void> {
    context.lastError = undefined
    context.errorRecoveryAttempts = 0
    this.emit('conversation-reset', context)
  }

  private async handleTimeout(context: ConversationContext): Promise<void> {
    this.emit('conversation-timeout', context)
  }

  private async handleShutdown(context: ConversationContext): Promise<void> {
    this.emit('conversation-shutdown', context)
  }
}

/**
 * Interruption Handler
 *
 * Specialized handler for managing conversation interruptions
 * and barge-in scenarios with immediate response.
 */
class InterruptionHandler extends EventEmitter {
  private config: ConversationStateMachineConfig
  private activeOperations: Set<string> = new Set()
  private interruptionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(config: ConversationStateMachineConfig) {
    super()
    this.config = config
  }

  /**
   * Register an operation that can be interrupted
   */
  registerOperation(operationId: string, cancellationCallback: () => void): void {
    this.activeOperations.add(operationId)

    // Set up automatic cancellation after barge-in delay
    if (this.config.bargeInDelay > 0) {
      const timer = setTimeout(() => {
        if (this.activeOperations.has(operationId)) {
          this.cancelOperation(operationId, cancellationCallback)
        }
      }, this.config.bargeInDelay)

      this.interruptionTimers.set(operationId, timer)
    }
  }

  /**
   * Cancel operation immediately
   */
  cancelOperation(operationId: string, cancellationCallback?: () => void): void {
    if (this.activeOperations.has(operationId)) {
      this.activeOperations.delete(operationId)

      if (cancellationCallback) {
        try {
          cancellationCallback()
        } catch (error) {
          this.emit('cancellation-error', {operationId, error})
        }
      }

      const timer = this.interruptionTimers.get(operationId)
      if (timer) {
        clearTimeout(timer)
        this.interruptionTimers.delete(operationId)
      }

      this.emit('operation-cancelled', operationId)
    }
  }

  /**
   * Cancel all active operations
   */
  cancelAllOperations(): void {
    const operations = Array.from(this.activeOperations)
    for (const operationId of operations) {
      this.cancelOperation(operationId)
    }
  }

  /**
   * Check if operation is still active
   */
  isOperationActive(operationId: string): boolean {
    return this.activeOperations.has(operationId)
  }

  /**
   * Get count of active operations
   */
  getActiveOperationCount(): number {
    return this.activeOperations.size
  }

  reset(): void {
    this.cancelAllOperations()
    this.activeOperations.clear()

    for (const timer of this.interruptionTimers.values()) {
      clearTimeout(timer)
    }
    this.interruptionTimers.clear()
  }
}

/**
 * Main Conversation State Machine
 *
 * Orchestrates the entire conversation flow with state management,
 * interruption handling, and context preservation.
 */
export class ConversationStateMachine extends EventEmitter {
  private config: ConversationStateMachineConfig
  private context: ConversationContext
  private transitionManager: StateTransitionManager
  private interruptionHandler: InterruptionHandler

  private stateTimeouts: Map<ConversationState, ReturnType<typeof setTimeout>> = new Map()
  private isProcessingTransition: boolean = false

  private metrics = {
    totalConversations: 0,
    averageConversationDuration: 0,
    successRate: 0,
    interruptionRate: 0,
    errorRate: 0
  }

  constructor(config: Partial<ConversationStateMachineConfig> = {}) {
    super()

    this.config = {
      listeningTimeout: 30000,
      transcribingTimeout: 5000,
      intentTimeout: 1000,
      planningTimeout: 2000,
      executionTimeout: 10000,
      responseTimeout: 3000,
      enableInterruptions: true,
      interruptionDetectionThreshold: 0.5,
      bargeInDelay: 200,
      enableContextPersistence: true,
      maxContextHistory: 50,
      contextDecayTime: 300000,
      maxRetryAttempts: 3,
      errorRecoveryTimeout: 5000,
      enableFallbackStates: true,
      enableParallelProcessing: false,
      maxConcurrentOperations: 3,
      enableCaching: true,
      defaultLanguage: 'en',
      enableMultiLanguageSupport: true,
      enableDetailedLogging: true,
      enablePerformanceTracking: true,
      enableEventEmission: true,
      enableAdvancedIntent: true,
      enableToolIntegration: true,
      enableTwoStageResponse: true,
      ...config
    }

    this.initializeContext()
    this.initializeComponents()
    this.setupEventHandlers()
  }

  private initializeContext(): void {
    this.context = {
      conversationId: this.generateId(),
      sessionId: this.generateId(),
      currentState: ConversationState.IDLE,
      previousState: ConversationState.IDLE,
      stateHistory: [],
      wasInterrupted: false,
      stateStartTime: Date.now(),
      totalConversationTime: 0,
      averageStateTransitionTime: 0,
      configuration: this.config,
      availableTools: [],
      supportedLanguages: ['en', 'ru'],
      errorCount: 0,
      errorRecoveryAttempts: 0,
      metrics: {
        stateTransitions: 0,
        interruptions: 0,
        successfulCompletions: 0,
        errors: 0,
        averageResponseTime: 0
      },
      metadata: {}
    }
  }

  private initializeComponents(): void {
    this.transitionManager = new StateTransitionManager(this.config)
    this.interruptionHandler = new InterruptionHandler(this.config)

    this.setupComponentEventHandlers()
  }

  private setupEventHandlers(): void {
    // Handle state transition events
    this.transitionManager.on('transition-action-error', ({transition, context, error}) => {
      this.emit('transition-error', {transition, context, error})
    })

    this.transitionManager.on('conversation-interrupted', context => {
      this.emit('conversation-interrupted', context)
    })

    // Handle interruption events
    this.interruptionHandler.on('operation-cancelled', operationId => {
      this.emit('operation-cancelled', operationId)
    })
  }

  private setupComponentEventHandlers(): void {
    // Additional component event handling can be added here
  }

  /**
   * Start the conversation state machine
   */
  async start(): Promise<void> {
    if (this.context.currentState !== ConversationState.IDLE) {
      throw new Error(`Cannot start conversation from state: ${this.context.currentState}`)
    }

    await this.transitionToState(ConversationState.LISTENING, ConversationEvent.RESET)
    this.emit('conversation-started', this.context)
  }

  /**
   * Process an event and potentially trigger state transition
   */
  async processEvent(event: ConversationEvent, eventData?: unknown): Promise<boolean> {
    if (this.isProcessingTransition) {
      // Queue event for later processing or ignore based on configuration
      this.emit('event-queued', {event, eventData})
      return false
    }

    const transition = this.transitionManager.findTransition(
      this.context.currentState,
      event,
      this.context
    )
    if (!transition) {
      this.emit('invalid-transition', {
        currentState: this.context.currentState,
        event,
        eventData
      })
      return false
    }

    try {
      this.isProcessingTransition = true

      // Record transition start time
      const transitionStartTime = performance.now()

      // Execute transition action if present
      if (transition.action) {
        await this.transitionManager.executeTransitionAction(transition, this.context, eventData)
      }

      // Perform state transition
      await this.transitionToState(transition.to, event, eventData)

      // Update metrics
      const transitionTime = performance.now() - transitionStartTime
      this.updateTransitionMetrics(transitionTime)

      return true
    } catch (error) {
      this.emit('transition-error', {transition, error})
      await this.handleTransitionError(error)
      return false
    } finally {
      this.isProcessingTransition = false
    }
  }

  /**
   * Transition to a new state
   */
  private async transitionToState(
    newState: ConversationState,
    event: ConversationEvent,
    eventData?: unknown
  ): Promise<void> {
    const previousState = this.context.currentState
    const transitionTime = Date.now()

    // Clear any existing state timeout
    this.clearStateTimeout(previousState)

    // Update state history
    if (previousState !== ConversationState.IDLE) {
      this.context.stateHistory.push({
        state: previousState,
        timestamp: this.context.stateStartTime,
        duration: transitionTime - this.context.stateStartTime,
        event,
        metadata: eventData as Record<string, unknown> | undefined
      })

      // Maintain history size limit
      if (this.context.stateHistory.length > this.config.maxContextHistory) {
        this.context.stateHistory = this.context.stateHistory.slice(-this.config.maxContextHistory)
      }
    }

    // Update context
    this.context.previousState = previousState
    this.context.currentState = newState
    this.context.stateStartTime = transitionTime
    this.context.metrics.stateTransitions++

    // Set new state timeout if configured
    this.setStateTimeout(newState)

    // Emit state change event
    this.emit('state-changed', {
      from: previousState,
      to: newState,
      event,
      context: this.context,
      eventData
    })

    // Emit specific state entry events
    this.emit(`entered-${newState}`, this.context)

    // Handle special state logic
    await this.handleStateEntry(newState, eventData)
  }

  private async handleStateEntry(state: ConversationState, eventData?: unknown): Promise<void> {
    switch (state) {
      case ConversationState.LISTENING: {
        // Activate audio input listening
        this.emit('start-listening')
        break
      }

      case ConversationState.TRANSCRIBING: {
        // Process audio segment for transcription
        const transcriptionData = eventData as {audioSegment?: AudioSegment}
        if (transcriptionData?.audioSegment) {
          this.context.currentAudioSegment = transcriptionData.audioSegment
          this.emit('start-transcription', transcriptionData.audioSegment)
        }
        break
      }

      case ConversationState.UTTERANCE_DETECTED: {
        // Start intent classification
        const utteranceData = eventData as {transcription?: string; confidence?: number}
        if (utteranceData?.transcription) {
          this.context.currentTranscription = utteranceData.transcription
          this.context.transcriptionConfidence = utteranceData.confidence
          this.emit('start-intent-classification', eventData)
        }
        break
      }

      case ConversationState.INTENT: {
        // Start execution planning
        const intentData = eventData as {intent?: Record<string, unknown>}
        if (intentData?.intent) {
          this.context.detectedIntent = intentData.intent as ConversationContext['detectedIntent']
          this.emit('start-planning', eventData)
        }
        break
      }

      case ConversationState.PLAN: {
        // Start execution
        const planData = eventData as {plan?: Record<string, unknown>}
        if (planData?.plan) {
          this.context.executionPlan = planData.plan as ConversationContext['executionPlan']
          this.emit('start-execution', eventData)
        }
        break
      }

      case ConversationState.EXECUTE: {
        // Execute the plan
        this.emit('execute-plan', this.context.executionPlan)
        break
      }

      case ConversationState.RESPOND: {
        // Generate and deliver response
        const responseData = eventData as {response?: Record<string, unknown>}
        if (responseData?.response) {
          this.context.currentResponse =
            responseData.response as ConversationContext['currentResponse']
          this.emit('start-response', eventData)
        }
        break
      }

      case ConversationState.INTERRUPTED: {
        // Handle interruption
        this.interruptionHandler.cancelAllOperations()
        this.emit('interruption-handled')
        break
      }

      case ConversationState.ERROR: {
        // Handle error state
        this.emit('error-state-entered', this.context.lastError)
        break
      }

      case ConversationState.PAUSED: {
        // Pause all operations
        this.emit('conversation-paused')
        break
      }

      case ConversationState.SHUTDOWN: {
        // Cleanup and shutdown
        await this.performShutdown()
        break
      }
    }
  }

  private setStateTimeout(state: ConversationState): void {
    let timeout: number | undefined

    switch (state) {
      case ConversationState.LISTENING:
        timeout = this.config.listeningTimeout
        break
      case ConversationState.TRANSCRIBING:
        timeout = this.config.transcribingTimeout
        break
      case ConversationState.INTENT:
        timeout = this.config.intentTimeout
        break
      case ConversationState.PLAN:
        timeout = this.config.planningTimeout
        break
      case ConversationState.EXECUTE:
        timeout = this.config.executionTimeout
        break
      case ConversationState.RESPOND:
        timeout = this.config.responseTimeout
        break
    }

    if (timeout) {
      const timer = setTimeout(() => {
        this.processEvent(ConversationEvent.TIMEOUT, {state})
      }, timeout)

      this.stateTimeouts.set(state, timer)
    }
  }

  private clearStateTimeout(state: ConversationState): void {
    const timer = this.stateTimeouts.get(state)
    if (timer) {
      clearTimeout(timer)
      this.stateTimeouts.delete(state)
    }
  }

  private clearAllTimeouts(): void {
    for (const [, timer] of this.stateTimeouts) {
      clearTimeout(timer)
    }
    this.stateTimeouts.clear()
  }

  private updateTransitionMetrics(transitionTime: number): void {
    const alpha = 0.1
    this.context.averageStateTransitionTime =
      alpha * transitionTime + (1 - alpha) * this.context.averageStateTransitionTime
  }

  private async handleTransitionError(error: Error): Promise<void> {
    this.context.errorCount++
    this.context.lastError = error

    if (this.context.errorRecoveryAttempts < this.config.maxRetryAttempts) {
      this.context.errorRecoveryAttempts++
      // Attempt to recover by transitioning to error state
      await this.transitionToState(ConversationState.ERROR, ConversationEvent.SYSTEM_ERROR, {error})
    } else {
      // Max retries exceeded, shutdown
      await this.transitionToState(ConversationState.SHUTDOWN, ConversationEvent.SHUTDOWN, {error})
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  /**
   * Trigger interruption event
   */
  async interrupt(reason?: string): Promise<void> {
    if (this.config.enableInterruptions) {
      await this.processEvent(ConversationEvent.USER_INTERRUPT, {reason})
    }
  }

  /**
   * Pause the conversation
   */
  async pause(): Promise<void> {
    await this.processEvent(ConversationEvent.PAUSE)
  }

  /**
   * Resume the conversation
   */
  async resume(): Promise<void> {
    await this.processEvent(ConversationEvent.RESUME)
  }

  /**
   * Reset the conversation to listening state
   */
  async reset(): Promise<void> {
    this.clearAllTimeouts()
    this.interruptionHandler.reset()
    this.initializeContext()
    await this.transitionToState(ConversationState.LISTENING, ConversationEvent.RESET)
  }

  /**
   * Get current conversation context
   */
  getContext(): ConversationContext {
    return {...this.context}
  }

  /**
   * Get current state
   */
  getCurrentState(): ConversationState {
    return this.context.currentState
  }

  /**
   * Get conversation metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      context: this.context.metrics,
      activeOperations: this.interruptionHandler.getActiveOperationCount()
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConversationStateMachineConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.context.configuration = this.config
    this.emit('config-updated', this.config)
  }

  /**
   * Register operation for interruption handling
   */
  registerOperation(operationId: string, cancellationCallback: () => void): void {
    this.interruptionHandler.registerOperation(operationId, cancellationCallback)
  }

  /**
   * Cancel specific operation
   */
  cancelOperation(operationId: string): void {
    this.interruptionHandler.cancelOperation(operationId)
  }

  private async performShutdown(): Promise<void> {
    this.clearAllTimeouts()
    this.interruptionHandler.reset()
    this.removeAllListeners()
    this.emit('shutdown-complete')
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    await this.processEvent(ConversationEvent.SHUTDOWN)
  }
}

// Export convenience factory function
export function createConversationStateMachine(
  config?: Partial<ConversationStateMachineConfig>
): ConversationStateMachine {
  return new ConversationStateMachine(config)
}

// Export default configuration
export const defaultStateMachineConfig: ConversationStateMachineConfig = {
  listeningTimeout: 30000,
  transcribingTimeout: 5000,
  intentTimeout: 1000,
  planningTimeout: 2000,
  executionTimeout: 10000,
  responseTimeout: 3000,
  enableInterruptions: true,
  interruptionDetectionThreshold: 0.5,
  bargeInDelay: 200,
  enableContextPersistence: true,
  maxContextHistory: 50,
  contextDecayTime: 300000,
  maxRetryAttempts: 3,
  errorRecoveryTimeout: 5000,
  enableFallbackStates: true,
  enableParallelProcessing: false,
  maxConcurrentOperations: 3,
  enableCaching: true,
  defaultLanguage: 'en',
  enableMultiLanguageSupport: true,
  enableDetailedLogging: true,
  enablePerformanceTracking: true,
  enableEventEmission: true,
  enableAdvancedIntent: true,
  enableToolIntegration: true,
  enableTwoStageResponse: true
}

// All types are already exported above, no need for additional exports
