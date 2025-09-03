/**
 * Intent Classification Integration System
 *
 * Seamlessly integrates Task 1's Advanced Intent Classification System with the
 * real-time voice processing pipeline, enabling unified voice assistant capabilities
 * with intelligent intent understanding, context-aware responses, and natural
 * conversational flow.
 */

import {EventEmitter} from 'events'

/**
 * Unified Voice Processing Pipeline
 *
 * Orchestrates the complete flow from audio input to intelligent response:
 * 1. Advanced Audio Segmentation (Task 2.1)
 * 2. Intent Classification (Task 1)
 * 3. Conversation State Management (Task 2.2)
 * 4. Two-Stage Response Generation (Task 2.3)
 * 5. Streaming TTS Output (Task 2.4)
 */
export class UnifiedVoiceProcessingPipeline extends EventEmitter {
  constructor(config = {}) {
    super()

    this.config = {
      // Audio Processing Configuration
      audioSegmentation: {
        vadThreshold: 0.3,
        minSegmentMs: 300,
        maxSegmentMs: 8000,
        silenceMs: 500,
        stabilityWindowMs: 150
      },

      // Intent Classification Configuration
      intentClassification: {
        confidenceThreshold: 0.7,
        maxContextTurns: 5,
        enableMultiIntent: true,
        contextWindowMs: 30000,
        fallbackStrategy: 'clarification'
      },

      // Response Generation Configuration
      responseGeneration: {
        acknowledgmentLatencyMs: 200,
        maxResponseLatencyMs: 1500,
        enableStreaming: true,
        contextIntegration: true,
        adaptiveComplexity: true
      },

      // TTS Configuration
      streamingTTS: {
        maxLatencyMs: 150,
        enableInterruption: true,
        bufferSizeMs: 500,
        fadeOutMs: 100,
        voiceAdaptation: true
      },

      // Integration Configuration
      pipeline: {
        enableParallelProcessing: true,
        optimizeLatency: true,
        contextPersistence: true,
        errorRecovery: 'graceful',
        metrics: true
      },

      ...config
    }

    // Component references
    this.audioSegmenter = null
    this.intentClassifier = null
    this.conversationStateMachine = null
    this.twoStageResponseSystem = null
    this.streamingTTSSystem = null

    // Pipeline state
    this.state = {
      isActive: false,
      currentSession: null,
      processingQueue: new Map(),
      contextHistory: [],
      metrics: {
        totalInteractions: 0,
        averageLatency: 0,
        intentAccuracy: 0,
        responseRelevancy: 0,
        userSatisfaction: 0,
        systemPerformance: {
          audioProcessingLatency: 0,
          intentClassificationLatency: 0,
          responseGenerationLatency: 0,
          ttsLatency: 0,
          endToEndLatency: 0
        }
      }
    }

    // Integration handlers
    this.integrationHandlers = new Map()
    this.setupIntegrationHandlers()
  }

  /**
   * Initialize all voice processing components
   */
  async initialize() {
    try {
      this.emit('pipeline:initializing')

      // Initialize core components in dependency order
      await this.initializeAudioSegmenter()
      await this.initializeIntentClassifier()
      await this.initializeConversationStateMachine()
      await this.initializeTwoStageResponseSystem()
      await this.initializeStreamingTTSSystem()

      // Setup component interconnections
      this.setupComponentIntegration()

      // Initialize session management
      this.initializeSessionManagement()

      this.state.isActive = true
      this.emit('pipeline:initialized')

      return true
    } catch (error) {
      this.emit('pipeline:initialization-error', error)
      throw new Error(`Pipeline initialization failed: ${error.message}`)
    }
  }

  async initializeAudioSegmenter() {
    // Mock Advanced Audio Segmenter initialization
    this.audioSegmenter = {
      config: this.config.audioSegmentation,
      isActive: true,
      currentSegment: null,

      async processAudioStream(audioData) {
        const startTime = performance.now()

        // Simulate VAD and segmentation
        const hasVoiceActivity = Math.random() > 0.3

        if (hasVoiceActivity) {
          const segment = {
            id: `segment_${Date.now()}`,
            audio: audioData,
            confidence: Math.random() * 0.4 + 0.6,
            timestamp: Date.now(),
            duration: Math.random() * 2000 + 500,
            isComplete: Math.random() > 0.3,
            stability: Math.random() * 0.3 + 0.7
          }

          const processingTime = performance.now() - startTime

          return {segment, processingTime}
        }

        return {segment: null, processingTime: performance.now() - startTime}
      },

      on: (event, handler) => {
        // Event handling simulation
      }
    }
  }

  async initializeIntentClassifier() {
    // Mock Intent Classification System initialization
    this.intentClassifier = {
      config: this.config.intentClassification,
      isActive: true,
      contextBuffer: [],

      async classifyIntent(text, context = {}) {
        const startTime = performance.now()

        // Simulate ML-based intent classification
        const intents = [
          'question',
          'command',
          'request',
          'information',
          'clarification',
          'confirmation',
          'greeting',
          'farewell',
          'help',
          'navigation',
          'search',
          'task_execution'
        ]

        const primaryIntent = intents[Math.floor(Math.random() * intents.length)]
        const confidence = Math.random() * 0.4 + 0.6

        const result = {
          primaryIntent,
          confidence,
          entities: this.extractEntities(text),
          context: this.analyzeContext(context),
          multiTurnContext: this.getMultiTurnContext(),
          timestamp: Date.now(),
          processingTime: performance.now() - startTime
        }

        // Update context buffer
        this.contextBuffer.push({
          text,
          intent: primaryIntent,
          confidence,
          timestamp: Date.now()
        })

        // Keep context window manageable
        if (this.contextBuffer.length > this.config.intentClassification.maxContextTurns) {
          this.contextBuffer.shift()
        }

        return result
      },

      extractEntities(text) {
        // Mock entity extraction
        const entities = []
        if (text.includes('time')) entities.push({type: 'temporal', value: 'now'})
        if (text.includes('weather')) entities.push({type: 'query_type', value: 'weather'})
        if (text.includes('help')) entities.push({type: 'assistance', value: 'general'})
        return entities
      },

      analyzeContext(context) {
        return {
          conversationState: context.state || 'active',
          userEmotion: context.emotion || 'neutral',
          urgency: context.urgency || 'normal',
          topicContinuity: context.topic ? 'continuing' : 'new'
        }
      },

      getMultiTurnContext() {
        return this.contextBuffer.slice(-3).map(ctx => ({
          intent: ctx.intent,
          confidence: ctx.confidence,
          recency: Date.now() - ctx.timestamp
        }))
      }
    }
  }

  async initializeConversationStateMachine() {
    // Mock Conversation State Machine initialization
    this.conversationStateMachine = {
      config: this.config.pipeline,
      currentState: 'idle',
      stateHistory: [],
      context: {},

      async transitionToState(newState, context = {}) {
        const startTime = performance.now()

        const previousState = this.currentState
        this.currentState = newState

        this.stateHistory.push({
          from: previousState,
          to: newState,
          timestamp: Date.now(),
          context: {...context},
          transitionTime: performance.now() - startTime
        })

        // Keep state history manageable
        if (this.stateHistory.length > 50) {
          this.stateHistory.shift()
        }

        this.context = {...this.context, ...context}

        return {
          previousState,
          currentState: newState,
          transitionTime: performance.now() - startTime,
          context: this.context
        }
      },

      getCurrentState() {
        return {
          state: this.currentState,
          context: this.context,
          stateHistory: this.stateHistory.slice(-5)
        }
      },

      canInterrupt() {
        return ['speaking', 'processing'].includes(this.currentState)
      }
    }
  }

  async initializeTwoStageResponseSystem() {
    // Mock Two-Stage Response System initialization
    this.twoStageResponseSystem = {
      config: this.config.responseGeneration,
      activeResponses: new Map(),

      async generateResponse(intent, context = {}) {
        const startTime = performance.now()
        const responseId = `response_${Date.now()}`

        // Stage 1: Immediate acknowledgment
        const acknowledgment = this.generateAcknowledgment(intent, context)
        const ackTime = performance.now() - startTime

        // Stage 2: Comprehensive response (can stream)
        setTimeout(
          async () => {
            const comprehensiveResponse = await this.generateComprehensiveResponse(intent, context)
            const totalTime = performance.now() - startTime

            this.activeResponses.set(responseId, {
              acknowledgment,
              comprehensiveResponse,
              startTime,
              acknowledgmentTime: ackTime,
              totalTime,
              intent,
              context
            })
          },
          Math.random() * 300 + 100
        ) // 100-400ms delay for comprehensive response

        return {
          responseId,
          acknowledgment,
          acknowledgmentTime: ackTime,
          isStreaming: this.config.responseGeneration.enableStreaming
        }
      },

      generateAcknowledgment(intent, context) {
        const acknowledgments = {
          question: [
            'I understand your question',
            'Let me help you with that',
            'Sure, let me look that up'
          ],
          command: ["I'll take care of that", 'Processing your request', 'Working on it now'],
          request: ['I can help with that', 'Let me handle that for you', 'On it'],
          information: ['I see', 'Noted', 'Got it'],
          clarification: ['Let me clarify that', "I'll explain", 'Sure, let me break that down'],
          help: ["I'm here to help", 'Happy to assist', 'Let me guide you']
        }

        const options = acknowledgments[intent.primaryIntent] || [
          'I understand',
          'Processing',
          'One moment'
        ]
        return options[Math.floor(Math.random() * options.length)]
      },

      async generateComprehensiveResponse(intent, context) {
        // Simulate response generation based on intent and context
        await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100))

        const responses = {
          question: "Based on your question, here's what I found...",
          command: "I've completed your request. Here are the results...",
          request: "Here's what you requested...",
          information: "Thank you for that information. Here's my response...",
          clarification: 'To clarify that point...',
          help: "I can help you with that. Here's how..."
        }

        return (
          responses[intent.primaryIntent] || "I've processed your request and here's my response..."
        )
      }
    }
  }

  async initializeStreamingTTSSystem() {
    // Mock Streaming TTS System initialization
    this.streamingTTSSystem = {
      config: this.config.streamingTTS,
      activeStreams: new Map(),

      async streamResponse(text, options = {}) {
        const startTime = performance.now()
        const streamId = `stream_${Date.now()}`

        const stream = {
          id: streamId,
          text,
          startTime,
          status: 'initializing',
          chunks: [],
          canInterrupt: true,
          resumePoint: null
        }

        this.activeStreams.set(streamId, stream)

        // Simulate streaming synthesis
        setTimeout(
          async () => {
            stream.status = 'streaming'

            // Generate audio chunks
            const chunkCount = Math.max(1, Math.ceil(text.split(' ').length / 8))
            for (let i = 0; i < chunkCount; i++) {
              const chunk = {
                id: `${streamId}_chunk_${i}`,
                duration: 200,
                isLast: i === chunkCount - 1
              }

              stream.chunks.push(chunk)

              // Simulate chunk processing time
              await new Promise(resolve => setTimeout(resolve, 50))
            }

            stream.status = 'completed'
            stream.endTime = performance.now()
          },
          Math.random() * 100 + 50
        )

        return {
          streamId,
          startLatency: performance.now() - startTime,
          estimatedDuration: text.split(' ').length * 60 // ~60ms per word
        }
      },

      interruptStream(streamId) {
        const stream = this.activeStreams.get(streamId)
        if (!stream || !stream.canInterrupt) return false

        stream.status = 'interrupted'
        stream.resumePoint = stream.chunks.length
        stream.interruptTime = performance.now()

        return true
      },

      resumeStream(streamId) {
        const stream = this.activeStreams.get(streamId)
        if (!stream || stream.status !== 'interrupted') return false

        stream.status = 'streaming'
        return true
      }
    }
  }

  setupComponentIntegration() {
    // Audio Segmentation → Intent Classification
    this.integrationHandlers.set('audio-to-intent', async audioSegment => {
      try {
        // Convert audio to text (mock)
        const transcript = this.mockSpeechToText(audioSegment.audio)

        // Classify intent
        const intentResult = await this.intentClassifier.classifyIntent(
          transcript,
          this.conversationStateMachine.getCurrentState()
        )

        this.emit('intent:classified', {
          audioSegment,
          transcript,
          intentResult,
          timestamp: Date.now()
        })

        return intentResult
      } catch (error) {
        this.emit('integration:error', {component: 'audio-to-intent', error})
        throw error
      }
    })

    // Intent Classification → Conversation State
    this.integrationHandlers.set('intent-to-state', async intentResult => {
      try {
        const newState = this.determineStateFromIntent(intentResult)

        const stateTransition = await this.conversationStateMachine.transitionToState(newState, {
          intent: intentResult,
          timestamp: Date.now()
        })

        this.emit('state:transitioned', {
          intentResult,
          stateTransition,
          timestamp: Date.now()
        })

        return stateTransition
      } catch (error) {
        this.emit('integration:error', {component: 'intent-to-state', error})
        throw error
      }
    })

    // State + Intent → Response Generation
    this.integrationHandlers.set(
      'state-intent-to-response',
      async (stateTransition, intentResult) => {
        try {
          const responseContext = {
            state: stateTransition.currentState,
            intent: intentResult,
            conversationHistory: this.state.contextHistory.slice(-3),
            userContext: stateTransition.context
          }

          const responseResult = await this.twoStageResponseSystem.generateResponse(
            intentResult,
            responseContext
          )

          this.emit('response:generated', {
            intentResult,
            stateTransition,
            responseResult,
            timestamp: Date.now()
          })

          return responseResult
        } catch (error) {
          this.emit('integration:error', {component: 'state-intent-to-response', error})
          throw error
        }
      }
    )

    // Response → TTS Streaming
    this.integrationHandlers.set('response-to-tts', async responseResult => {
      try {
        // Stream acknowledgment first
        const ackStream = await this.streamingTTSSystem.streamResponse(
          responseResult.acknowledgment,
          {priority: 'high', voice: 'friendly'}
        )

        this.emit('tts:acknowledgment-started', {
          responseResult,
          ackStream,
          timestamp: Date.now()
        })

        // Stream comprehensive response when ready
        setTimeout(async () => {
          const response = this.twoStageResponseSystem.activeResponses.get(
            responseResult.responseId
          )
          if (response && response.comprehensiveResponse) {
            const mainStream = await this.streamingTTSSystem.streamResponse(
              response.comprehensiveResponse,
              {priority: 'normal', voice: 'neutral'}
            )

            this.emit('tts:response-started', {
              responseResult,
              response,
              mainStream,
              timestamp: Date.now()
            })
          }
        }, 300)

        return ackStream
      } catch (error) {
        this.emit('integration:error', {component: 'response-to-tts', error})
        throw error
      }
    })
  }

  setupIntegrationHandlers() {
    // Pipeline event handlers for seamless integration
    this.on('audio:segment-ready', async audioSegment => {
      try {
        const intentResult = await this.integrationHandlers.get('audio-to-intent')(audioSegment)
        const stateTransition = await this.integrationHandlers.get('intent-to-state')(intentResult)
        const responseResult = await this.integrationHandlers.get('state-intent-to-response')(
          stateTransition,
          intentResult
        )
        const ttsStream = await this.integrationHandlers.get('response-to-tts')(responseResult)

        // Update metrics
        this.updatePipelineMetrics({
          audioSegment,
          intentResult,
          stateTransition,
          responseResult,
          ttsStream
        })

        this.emit('pipeline:interaction-complete', {
          audioSegment,
          intentResult,
          stateTransition,
          responseResult,
          ttsStream,
          timestamp: Date.now()
        })
      } catch (error) {
        this.emit('pipeline:interaction-error', error)
        this.handlePipelineError(error)
      }
    })

    // User interruption handling
    this.on('user:interrupt', async (context = {}) => {
      try {
        // Interrupt current TTS if active
        const activeStreams = Array.from(this.streamingTTSSystem.activeStreams.keys())
        for (const streamId of activeStreams) {
          this.streamingTTSSystem.interruptStream(streamId)
        }

        // Transition conversation state
        await this.conversationStateMachine.transitionToState('interrupted', {
          reason: 'user_interrupt',
          timestamp: Date.now(),
          ...context
        })

        this.emit('pipeline:interrupted', {
          interruptedStreams: activeStreams,
          timestamp: Date.now()
        })
      } catch (error) {
        this.emit('pipeline:interrupt-error', error)
      }
    })

    // Resume handling after interruption
    this.on('user:resume', async (context = {}) => {
      try {
        // Resume interrupted streams if appropriate
        const interruptedStreams = Array.from(
          this.streamingTTSSystem.activeStreams.entries()
        ).filter(([_, stream]) => stream.status === 'interrupted')

        for (const [streamId, stream] of interruptedStreams) {
          if (this.shouldResumeStream(stream, context)) {
            this.streamingTTSSystem.resumeStream(streamId)
          }
        }

        // Transition back to active state
        await this.conversationStateMachine.transitionToState('active', {
          reason: 'user_resume',
          timestamp: Date.now(),
          ...context
        })

        this.emit('pipeline:resumed', {
          resumedStreams: interruptedStreams.map(([id]) => id),
          timestamp: Date.now()
        })
      } catch (error) {
        this.emit('pipeline:resume-error', error)
      }
    })
  }

  initializeSessionManagement() {
    this.state.currentSession = {
      id: `session_${Date.now()}`,
      startTime: Date.now(),
      interactions: [],
      context: {},
      metrics: {
        totalInteractions: 0,
        averageLatency: 0,
        satisfactionScore: 0
      }
    }
  }

  // Processing methods
  async processAudioInput(audioData) {
    try {
      const segmentResult = await this.audioSegmenter.processAudioStream(audioData)

      if (segmentResult.segment && segmentResult.segment.isComplete) {
        this.emit('audio:segment-ready', segmentResult.segment)
      }

      return segmentResult
    } catch (error) {
      this.emit('audio:processing-error', error)
      throw error
    }
  }

  async handleUserInterrupt() {
    this.emit('user:interrupt')
  }

  async handleUserResume(context = {}) {
    this.emit('user:resume', context)
  }

  // Helper methods
  mockSpeechToText(audioData) {
    const sampleTexts = [
      "What's the weather like today?",
      'Can you help me with this task?',
      'How do I set up the system?',
      'Thank you for your assistance',
      'I need more information about this',
      'Could you clarify that point?',
      'What are my options here?',
      'That sounds good to me'
    ]
    return sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
  }

  determineStateFromIntent(intentResult) {
    const intentToStateMap = {
      question: 'processing_query',
      command: 'executing_command',
      request: 'fulfilling_request',
      information: 'acknowledging_info',
      clarification: 'providing_clarification',
      confirmation: 'confirming_action',
      greeting: 'greeting',
      farewell: 'farewell',
      help: 'providing_help'
    }

    return intentToStateMap[intentResult.primaryIntent] || 'processing'
  }

  shouldResumeStream(stream, context) {
    // Logic to determine if a stream should be resumed
    const timeSinceInterrupt = Date.now() - (stream.interruptTime || 0)
    return timeSinceInterrupt < 5000 && context.resumeIntent !== 'skip'
  }

  updatePipelineMetrics(data) {
    const session = this.state.currentSession
    session.interactions.push({
      timestamp: Date.now(),
      audioLatency: data.audioSegment?.processingTime || 0,
      intentLatency: data.intentResult?.processingTime || 0,
      stateTransitionLatency: data.stateTransition?.transitionTime || 0,
      responseLatency: data.responseResult?.acknowledgmentTime || 0,
      ttsLatency: data.ttsStream?.startLatency || 0
    })

    session.metrics.totalInteractions++

    // Calculate running averages
    const interactions = session.interactions
    if (interactions.length > 0) {
      const totalLatency = interactions.reduce(
        (sum, i) =>
          sum +
          i.audioLatency +
          i.intentLatency +
          i.stateTransitionLatency +
          i.responseLatency +
          i.ttsLatency,
        0
      )
      session.metrics.averageLatency = totalLatency / interactions.length
    }

    this.state.metrics = {
      ...this.state.metrics,
      totalInteractions: session.metrics.totalInteractions,
      averageLatency: session.metrics.averageLatency
    }
  }

  handlePipelineError(error) {
    console.error('Pipeline error:', error)

    // Implement graceful error recovery
    if (this.config.pipeline.errorRecovery === 'graceful') {
      // Try to maintain conversation state and provide fallback response
      this.conversationStateMachine.transitionToState('error_recovery', {
        error: error.message,
        timestamp: Date.now()
      })
    }
  }

  // Public API methods
  async startVoiceInteraction(audioData) {
    if (!this.state.isActive) {
      throw new Error('Pipeline not initialized')
    }

    return await this.processAudioInput(audioData)
  }

  async interrupt() {
    await this.handleUserInterrupt()
  }

  async resume(context = {}) {
    await this.handleUserResume(context)
  }

  getSystemStatus() {
    return {
      isActive: this.state.isActive,
      currentSession: this.state.currentSession,
      metrics: this.state.metrics,
      components: {
        audioSegmenter: this.audioSegmenter?.isActive || false,
        intentClassifier: this.intentClassifier?.isActive || false,
        conversationStateMachine: this.conversationStateMachine?.currentState || 'unknown',
        twoStageResponseSystem: this.twoStageResponseSystem ? true : false,
        streamingTTSSystem: this.streamingTTSSystem ? true : false
      }
    }
  }

  async shutdown() {
    try {
      this.emit('pipeline:shutting-down')

      // Stop all active streams
      if (this.streamingTTSSystem) {
        for (const streamId of this.streamingTTSSystem.activeStreams.keys()) {
          this.streamingTTSSystem.interruptStream(streamId)
        }
      }

      // Clear processing queue
      this.state.processingQueue.clear()

      // Reset state
      this.state.isActive = false
      this.state.currentSession = null

      this.emit('pipeline:shutdown')

      return true
    } catch (error) {
      this.emit('pipeline:shutdown-error', error)
      throw error
    }
  }
}

/**
 * Voice Assistant Integration Manager
 *
 * High-level interface for the complete voice assistant system,
 * managing the unified pipeline and providing user-friendly APIs.
 */
export class VoiceAssistantIntegrationManager extends EventEmitter {
  constructor(config = {}) {
    super()

    this.config = {
      // High-level configuration
      assistant: {
        name: 'DAO Copilot Voice Assistant',
        personality: 'helpful',
        responseStyle: 'conversational',
        adaptivePersonality: true,
        contextAwareness: 'high'
      },

      // Performance targets
      performance: {
        maxEndToEndLatencyMs: 2000,
        targetAcknowledgmentMs: 200,
        targetResponseMs: 1500,
        maxConcurrentSessions: 5,
        memoryLimitMB: 512
      },

      // Integration features
      features: {
        voiceWakeword: false,
        continuousListening: true,
        backgroundProcessing: true,
        multiLanguage: false,
        emotionDetection: true,
        contextPersistence: true,
        learningAdaptation: false
      },

      ...config
    }

    this.pipeline = new UnifiedVoiceProcessingPipeline(config)
    this.sessions = new Map()
    this.isInitialized = false

    this.setupPipelineEventHandling()
  }

  async initialize() {
    try {
      console.log(`Initializing ${this.config.assistant.name}...`)

      await this.pipeline.initialize()

      this.isInitialized = true
      this.emit('assistant:ready')

      console.log('✅ Voice Assistant Integration System ready!')

      return true
    } catch (error) {
      this.emit('assistant:initialization-error', error)
      throw error
    }
  }

  setupPipelineEventHandling() {
    // Forward important pipeline events
    this.pipeline.on('pipeline:interaction-complete', data => {
      this.emit('assistant:interaction-complete', {
        sessionId: this.pipeline.state.currentSession?.id,
        ...data
      })
    })

    this.pipeline.on('pipeline:interrupted', data => {
      this.emit('assistant:interrupted', data)
    })

    this.pipeline.on('pipeline:resumed', data => {
      this.emit('assistant:resumed', data)
    })

    this.pipeline.on('intent:classified', data => {
      this.emit('assistant:intent-understood', {
        intent: data.intentResult.primaryIntent,
        confidence: data.intentResult.confidence,
        entities: data.intentResult.entities
      })
    })

    this.pipeline.on('response:generated', data => {
      this.emit('assistant:response-ready', {
        acknowledgment: data.responseResult.acknowledgment,
        isStreaming: data.responseResult.isStreaming
      })
    })

    this.pipeline.on('tts:acknowledgment-started', data => {
      this.emit('assistant:speaking', {
        type: 'acknowledgment',
        streamId: data.ackStream.streamId
      })
    })

    this.pipeline.on('tts:response-started', data => {
      this.emit('assistant:speaking', {
        type: 'response',
        streamId: data.mainStream.streamId
      })
    })
  }

  // Public API
  async processVoiceInput(audioData) {
    if (!this.isInitialized) {
      throw new Error('Voice Assistant not initialized')
    }

    return await this.pipeline.startVoiceInteraction(audioData)
  }

  async interrupt() {
    if (!this.isInitialized) return false

    await this.pipeline.interrupt()
    return true
  }

  async resume(context = {}) {
    if (!this.isInitialized) return false

    await this.pipeline.resume(context)
    return true
  }

  getAssistantStatus() {
    return {
      name: this.config.assistant.name,
      isReady: this.isInitialized,
      pipeline: this.pipeline.getSystemStatus(),
      sessions: Array.from(this.sessions.keys()),
      features: this.config.features
    }
  }

  async shutdown() {
    try {
      await this.pipeline.shutdown()
      this.sessions.clear()
      this.isInitialized = false
      this.emit('assistant:shutdown')
      return true
    } catch (error) {
      this.emit('assistant:shutdown-error', error)
      throw error
    }
  }
}

// Export for integration testing
export default {
  UnifiedVoiceProcessingPipeline,
  VoiceAssistantIntegrationManager
}
