/**
 * Transcription Question Bridge
 * 
 * Critical missing component that connects live transcription with question detection and answer generation.
 * This bridge monitors real-time transcription streams, detects questions automatically,
 * and triggers the AI answering pipeline to d      logger.debug('Processing transcription event', {
        id: event.id,
        text: sanitizeLogMessage(event.text.substring(0, 100)),
        confidence: event.confidence.toFixed(2),
        isFinal: event.isFinal,
        source: event.source
      })
    }

    try {ults in the Chat tab.
 * 
 * Addresses the disconnect between:
 * - TranscriptsPage (showing "?" in transcription)
 * - ChatPage (showing empty state)
 * - Question detection pipeline (not connected to live stream)
 * 
 * Performance optimized for real-time processing <100ms pipeline latency.
 */

import {EventEmitter} from 'events'
import OptimizedTranscriptionQuestionPipeline from './optimized-transcription-question-pipeline'
import {AnswerDisplayManager, AnswerDisplay} from './AnswerDisplayManager'
import {AnswerStreamingManager} from './AnswerStreamingManager'
import {UltraFastWebSocketManager} from './UltraFastWebSocketManager'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

export interface TranscriptionEvent {
  id: string
  text: string
  confidence: number
  isFinal: boolean
  timestamp: number
  source: 'websocket' | 'streaming' | 'manual'
}

export interface QuestionDetectedEvent {
  transcriptionId: string
  question: string
  questionType: string
  confidence: number
  timestamp: number
  context?: string
}

export interface AnswerGeneratedEvent {
  questionId: string
  question: string
  answer: AnswerDisplay
  processingTime: number
  timestamp: number
}

interface BridgeConfig {
  // Question detection settings
  questionConfidenceThreshold: number
  questionMinLength: number
  contextBufferSize: number

  // Answer generation settings
  autoGenerateAnswers: boolean
  answerTimeoutMs: number
  maxConcurrentAnswers: number

  // Performance settings
  bufferTimeoutMs: number
  enableRealTimeProcessing: boolean
  maxProcessingTimeMs: number

  // Debug settings
  enableDebugLogging: boolean
  logTranscriptionEvents: boolean
}

interface BridgeMetrics {
  transcriptionsProcessed: number
  questionsDetected: number
  answersGenerated: number
  averageQuestionDetectionTime: number
  averageAnswerGenerationTime: number
  activeAnswerRequests: number
  errorCount: number
  successRate: number
}

/**
 * Bridge that connects live transcription to question detection and answer generation
 */
export class TranscriptionQuestionBridge extends EventEmitter {
  private config: BridgeConfig
  private metrics: BridgeMetrics
  private isInitialized = false
  private isActive = false

  // Core components
  private questionPipeline: OptimizedTranscriptionQuestionPipeline
  private answerManager: AnswerDisplayManager

  // Context management
  private transcriptionBuffer: TranscriptionEvent[] = []
  private contextBuffer: string[] = []
  private activeQuestions = new Map<string, QuestionDetectedEvent>()
  private pendingAnswers = new Map<string, Promise<AnswerDisplay>>()

  // Performance tracking
  private processingTimes: number[] = []
  private lastProcessingTime = 0

  constructor(config: Partial<BridgeConfig> = {}) {
    super()

    this.config = {
      // Question detection settings
      questionConfidenceThreshold: 0.7,
      questionMinLength: 5,
      contextBufferSize: 5,

      // Answer generation settings
      autoGenerateAnswers: true,
      answerTimeoutMs: 30000, // 30 seconds
      maxConcurrentAnswers: 3,

      // Performance settings
      bufferTimeoutMs: 500,
      enableRealTimeProcessing: true,
      maxProcessingTimeMs: 100,

      // Debug settings
      enableDebugLogging: false,
      logTranscriptionEvents: true,

      ...config
    }

    this.metrics = {
      transcriptionsProcessed: 0,
      questionsDetected: 0,
      answersGenerated: 0,
      averageQuestionDetectionTime: 0,
      averageAnswerGenerationTime: 0,
      activeAnswerRequests: 0,
      errorCount: 0,
      successRate: 0
    }

    // Initialize core components
    this.questionPipeline = new OptimizedTranscriptionQuestionPipeline({
      bufferTimeoutMs: this.config.bufferTimeoutMs,
      enableConcurrentProcessing: true,
      maxConcurrentQuestions: this.config.maxConcurrentAnswers,
      performanceTargetMs: this.config.maxProcessingTimeMs / 2, // Question detection should be faster
      questionDetectionConfig: {
        confidenceThreshold: this.config.questionConfidenceThreshold,
        maxAnalysisDelay: 50,
        enableFastPath: true,
        fastPathThreshold: 0.8,
        enableCaching: true
      }
    })

    // Initialize UltraFastWebSocketManager and AnswerStreamingManager for AnswerDisplayManager
    const webSocketManager = new UltraFastWebSocketManager()
    const answerStreamingManager = new AnswerStreamingManager(webSocketManager, {
      maxConcurrentStreams: config.maxConcurrentAnswers || 3,
      streamTimeout: config.answerTimeoutMs || 30000,
      chunkDelay: 100,
      enablePerformanceMetrics: true,
      enableDebugLogging: config.enableDebugLogging || false
    })

    // Create AnswerDisplayManager with correct parameters
    this.answerManager = new AnswerDisplayManager(answerStreamingManager, webSocketManager, {
      maxHistorySize: config.maxConcurrentAnswers || 10,
      showSearchProgress: true,
      showConfidence: true,
      showSources: true,
      showMetadata: config.enableDebugLogging || false,
      enableTypewriterEffect: true,
      typewriterSpeed: 50,
      updateThrottleMs: 100,
      enableDebugLogging: config.enableDebugLogging || false
    })

    this.setupEventListeners()

    logger.info('TranscriptionQuestionBridge initialized', {
      autoGenerateAnswers: this.config.autoGenerateAnswers,
      questionThreshold: this.config.questionConfidenceThreshold,
      maxConcurrent: this.config.maxConcurrentAnswers,
      enableRealTime: this.config.enableRealTimeProcessing
    })
  }

  /**
   * Initialize the bridge and all components
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('TranscriptionQuestionBridge already initialized')
      return
    }

    const startTime = performance.now()

    try {
      // Initialize question detection pipeline
      await this.questionPipeline.initialize()

      // AnswerDisplayManager doesn't have initialize() method - ready after construction

      this.isInitialized = true
      const initTime = performance.now() - startTime

      logger.info('TranscriptionQuestionBridge initialization complete', {
        initializationTime: `${initTime.toFixed(2)}ms`
      })

      this.emit('initialized', {initTime})
    } catch (error) {
      logger.error('Failed to initialize TranscriptionQuestionBridge', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Start processing transcription events
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bridge must be initialized before starting')
    }

    if (this.isActive) {
      logger.debug('TranscriptionQuestionBridge already active')
      return
    }

    this.isActive = true

    logger.info('TranscriptionQuestionBridge started - monitoring live transcription for questions')
    this.emit('started')
  }

  /**
   * Stop processing transcription events
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      logger.debug('TranscriptionQuestionBridge already inactive')
      return
    }

    this.isActive = false

    // Cancel pending answer requests
    for (const [questionId] of this.pendingAnswers) {
      try {
        // Note: Can't actually cancel promises, but we can ignore their results
        logger.debug('Cancelling pending answer request', {questionId})
      } catch (error) {
        logger.warn('Error cancelling answer request', {
          questionId,
          error: error instanceof Error ? error.message : 'Unknown'
        })
      }
    }
    this.pendingAnswers.clear()

    logger.info('TranscriptionQuestionBridge stopped')
    this.emit('stopped')
  }

  /**
   * Process incoming transcription event - main entry point
   */
  async processTranscription(event: TranscriptionEvent): Promise<void> {
    if (!this.isActive) {
      if (this.config.enableDebugLogging) {
        logger.debug('Ignoring transcription - bridge inactive', {
          text: event.text.substring(0, 50)
        })
      }
      return
    }

    const startTime = performance.now()
    this.metrics.transcriptionsProcessed++

    if (this.config.logTranscriptionEvents) {
      logger.debug('Processing transcription event', {
        id: event.id,
        text: sanitizeLogMessage(event.text.substring(0, 100)),
        confidence: event.confidence.toFixed(2),
        isFinal: event.isFinal,
        source: event.source
      })
    }

    try {
      // Add to buffer for context
      this.updateTranscriptionBuffer(event)

      // Only process final transcriptions for question detection
      // (partial transcriptions would create too much noise)
      if (event.isFinal && event.text.trim().length >= this.config.questionMinLength) {
        // Send to question detection pipeline
        await this.questionPipeline.processTranscription(
          event.text,
          event.confidence,
          event.isFinal,
          event.id
        )
      }

      const processingTime = performance.now() - startTime
      this.updatePerformanceMetrics(processingTime)

      this.emit('transcription_processed', {
        event,
        processingTime
      })
    } catch (error) {
      this.metrics.errorCount++
      logger.error('Error processing transcription event', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('processing_error', {
        event,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Update transcription buffer for context
   */
  private updateTranscriptionBuffer(event: TranscriptionEvent): void {
    // Add to buffer
    this.transcriptionBuffer.push(event)

    // Maintain buffer size
    if (this.transcriptionBuffer.length > this.config.contextBufferSize * 2) {
      this.transcriptionBuffer = this.transcriptionBuffer.slice(-this.config.contextBufferSize)
    }

    // Update context buffer with final transcriptions
    if (event.isFinal) {
      this.contextBuffer.push(event.text)

      // Maintain context buffer size
      if (this.contextBuffer.length > this.config.contextBufferSize) {
        this.contextBuffer = this.contextBuffer.slice(-this.config.contextBufferSize)
      }
    }
  }

  /**
   * Setup event listeners for component integration
   */
  private setupEventListeners(): void {
    // Question detection events
    this.questionPipeline.on('question_detected', async data => {
      await this.handleQuestionDetected(data)
    })

    this.questionPipeline.on('buffer_processed', data => {
      this.emit('pipeline_processed', data)
    })

    this.questionPipeline.on('initialized', () => {
      this.emit('pipeline_initialized')
    })

    // Answer generation events
    this.answerManager.on('answer_generated', data => {
      this.handleAnswerGenerated(data)
    })

    this.answerManager.on('answer_streaming', data => {
      this.emit('answer_streaming', data)
    })

    this.answerManager.on('answer_error', data => {
      this.handleAnswerError(data)
    })
  }

  /**
   * Handle question detected event and trigger answer generation
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleQuestionDetected(data: any): Promise<void> {
    const startTime = performance.now()

    try {
      const questionEvent: QuestionDetectedEvent = {
        transcriptionId: data.transcript.id,
        question: data.transcript.text,
        questionType: data.analysis.questionType,
        confidence: data.analysis.confidence,
        timestamp: Date.now(),
        context: this.generateQuestionContext(data.transcript.text)
      }

      this.metrics.questionsDetected++
      this.activeQuestions.set(questionEvent.transcriptionId, questionEvent)

      logger.info('Question detected in live transcription', {
        transcriptionId: questionEvent.transcriptionId,
        question: sanitizeLogMessage(questionEvent.question.substring(0, 100)),
        questionType: questionEvent.questionType,
        confidence: questionEvent.confidence.toFixed(2),
        detectionTime: `${(performance.now() - startTime).toFixed(2)}ms`
      })

      // Emit question detected event for UI updates
      this.emit('question_detected', questionEvent)

      // Automatically generate answer if enabled
      if (
        this.config.autoGenerateAnswers &&
        questionEvent.confidence >= this.config.questionConfidenceThreshold &&
        this.pendingAnswers.size < this.config.maxConcurrentAnswers
      ) {
        await this.generateAnswer(questionEvent)
      }

      const questionDetectionTime = performance.now() - startTime
      this.updateQuestionDetectionMetrics(questionDetectionTime)
    } catch (error) {
      this.metrics.errorCount++
      logger.error('Error handling question detected event', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Generate answer for detected question
   */
  private async generateAnswer(questionEvent: QuestionDetectedEvent): Promise<void> {
    const questionId = `question_${questionEvent.transcriptionId}_${Date.now()}`

    if (this.pendingAnswers.has(questionId)) {
      logger.debug('Answer already being generated for question', {questionId})
      return
    }

    const startTime = performance.now()
    this.metrics.activeAnswerRequests++

    logger.info('Generating answer for detected question', {
      questionId,
      question: sanitizeLogMessage(questionEvent.question.substring(0, 100)),
      questionType: questionEvent.questionType,
      context: sanitizeLogMessage(questionEvent.context?.substring(0, 50) || '')
    })

    try {
      // Create answer request - startAnswerDisplay returns string (display ID), not AnswerDisplay
      const displayId = this.answerManager.startAnswerDisplay(questionId, questionEvent.question, {
        query: questionEvent.question,
        isSearching: true,
        status: 'searching' as const,
        progress: 0,
        sourcesFound: 0,
        totalSources: 0,
        timeElapsed: 0,
        metadata: {
          searchStartTime: Date.now(),
          lastUpdate: Date.now(),
          searchMethod: 'hybrid' as const
        }
      })

      // Store the display ID promise instead of answer promise
      const displayPromise = Promise.resolve(displayId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.pendingAnswers.set(questionId, displayPromise as any)

      // Wait for answer display to be created
      const answer = await displayPromise

      // Remove from pending
      this.pendingAnswers.delete(questionId)
      this.metrics.activeAnswerRequests--

      const answerGenerationTime = performance.now() - startTime
      this.updateAnswerGenerationMetrics(answerGenerationTime)

      const answerEvent: AnswerGeneratedEvent = {
        questionId,
        question: questionEvent.question,
        answer: {
          id: answer, // Display ID returned from startAnswerDisplay
          questionId,
          questionText: questionEvent.question,
          answerText: '',
          isPartial: true,
          isComplete: false,
          confidence: questionEvent.confidence,
          sources: [],
          timestamp: Date.now(),
          searchState: {
            query: questionEvent.question,
            isSearching: true,
            status: 'searching' as const,
            progress: 0,
            sourcesFound: 0,
            totalSources: 0,
            timeElapsed: answerGenerationTime
          },
          metadata: {
            sourceCount: 0
          }
        } as AnswerDisplay,
        processingTime: answerGenerationTime,
        timestamp: Date.now()
      }

      this.metrics.answersGenerated++

      logger.info('Answer generated for detected question', {
        questionId,
        displayId: sanitizeLogMessage(answer),
        generationTime: `${answerGenerationTime.toFixed(2)}ms`,
        questionLength: questionEvent.question.length
      })

      // Emit answer generated event for UI updates
      this.emit('answer_generated', answerEvent)
    } catch (error) {
      this.pendingAnswers.delete(questionId)
      this.metrics.activeAnswerRequests--
      this.metrics.errorCount++

      logger.error('Error generating answer for question', {
        questionId,
        question: questionEvent.question.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('answer_error', {
        questionId,
        question: questionEvent.question,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Generate context for question based on recent transcriptions
   */
  private generateQuestionContext(question: string): string {
    const recentContext = this.contextBuffer.slice(-3) // Last 3 transcriptions
    const context = recentContext.join(' ').substring(0, 500) // Limit context size

    return context ? `Recent context: ${context}\n\nCurrent question: ${question}` : question
  }

  /**
   * Handle answer generated event
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleAnswerGenerated(data: any): void {
    logger.debug('Answer generated', {
      displayId: data.displayId,
      answerLength: data.answer?.answerText?.length || 0
    })

    // Forward to UI components
    this.emit('answer_ready', data)
  }

  /**
   * Handle answer generation error
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleAnswerError(data: any): void {
    logger.warn('Answer generation error', {
      displayId: data.displayId,
      error: data.error
    })

    this.emit('answer_error', data)
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(processingTime: number): void {
    this.processingTimes.push(processingTime)

    // Keep only recent processing times
    if (this.processingTimes.length > 100) {
      this.processingTimes = this.processingTimes.slice(-50)
    }

    this.lastProcessingTime = processingTime
  }

  /**
   * Update question detection metrics
   */
  private updateQuestionDetectionMetrics(detectionTime: number): void {
    const alpha = 0.1 // smoothing factor
    this.metrics.averageQuestionDetectionTime =
      alpha * detectionTime + (1 - alpha) * this.metrics.averageQuestionDetectionTime
  }

  /**
   * Update answer generation metrics
   */
  private updateAnswerGenerationMetrics(generationTime: number): void {
    const alpha = 0.1 // smoothing factor
    this.metrics.averageAnswerGenerationTime =
      alpha * generationTime + (1 - alpha) * this.metrics.averageAnswerGenerationTime

    // Update success rate
    const totalAttempts = this.metrics.questionsDetected
    this.metrics.successRate = totalAttempts > 0 ? this.metrics.answersGenerated / totalAttempts : 0
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): BridgeMetrics {
    return {...this.metrics}
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalProcessed: number
    questionDetectionRate: number
    answerSuccessRate: number
    averageLatency: number
    activeRequests: number
    errorRate: number
  } {
    const questionDetectionRate =
      this.metrics.transcriptionsProcessed > 0
        ? this.metrics.questionsDetected / this.metrics.transcriptionsProcessed
        : 0

    const errorRate =
      this.metrics.transcriptionsProcessed > 0
        ? this.metrics.errorCount / this.metrics.transcriptionsProcessed
        : 0

    const averageLatency =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length
        : 0

    return {
      totalProcessed: this.metrics.transcriptionsProcessed,
      questionDetectionRate,
      answerSuccessRate: this.metrics.successRate,
      averageLatency,
      activeRequests: this.metrics.activeAnswerRequests,
      errorRate
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      transcriptionsProcessed: 0,
      questionsDetected: 0,
      answersGenerated: 0,
      averageQuestionDetectionTime: 0,
      averageAnswerGenerationTime: 0,
      activeAnswerRequests: 0,
      errorCount: 0,
      successRate: 0
    }

    this.processingTimes = []
    logger.info('TranscriptionQuestionBridge metrics reset')
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BridgeConfig>): void {
    this.config = {...this.config, ...newConfig}

    // Update component configurations if needed
    if (
      newConfig.questionConfidenceThreshold !== undefined ||
      newConfig.maxProcessingTimeMs !== undefined
    ) {
      this.questionPipeline.updateConfig({
        performanceTargetMs: this.config.maxProcessingTimeMs / 2,
        questionDetectionConfig: {
          confidenceThreshold: this.config.questionConfidenceThreshold
        }
      })
    }

    logger.info('TranscriptionQuestionBridge configuration updated', {
      autoGenerateAnswers: this.config.autoGenerateAnswers,
      questionThreshold: this.config.questionConfidenceThreshold,
      maxConcurrent: this.config.maxConcurrentAnswers
    })

    this.emit('config_updated', this.config)
  }

  /**
   * Get current active questions
   */
  getActiveQuestions(): QuestionDetectedEvent[] {
    return Array.from(this.activeQuestions.values())
  }

  /**
   * Get recent context
   */
  getRecentContext(): string[] {
    return [...this.contextBuffer]
  }

  /**
   * Manually trigger question processing (for testing/debugging)
   */
  async processQuestionText(text: string): Promise<QuestionDetectedEvent | null> {
    if (!this.isActive) {
      throw new Error('Bridge is not active')
    }

    const mockEvent: TranscriptionEvent = {
      id: `manual_${Date.now()}`,
      text,
      confidence: 1.0,
      isFinal: true,
      timestamp: Date.now(),
      source: 'manual'
    }

    await this.processTranscription(mockEvent)

    // Return the question if it was detected
    return this.activeQuestions.get(mockEvent.id) || null
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    // Stop processing
    this.stop()

    // Clear buffers
    this.transcriptionBuffer = []
    this.contextBuffer = []
    this.activeQuestions.clear()
    this.pendingAnswers.clear()
    this.processingTimes = []

    // Destroy components
    if (this.questionPipeline) {
      this.questionPipeline.destroy()
    }

    if (this.answerManager) {
      this.answerManager.destroy()
    }

    // Remove all listeners
    this.removeAllListeners()

    this.isInitialized = false
    this.isActive = false

    logger.info('TranscriptionQuestionBridge destroyed')
  }
}

export default TranscriptionQuestionBridge
