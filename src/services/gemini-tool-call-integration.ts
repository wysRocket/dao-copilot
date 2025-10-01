/**
 * Gemini Live API Tool Call Integration Service
 *
 * This service provides a complete integration of the Gemini Live API with
 * tool calling capabilities, specifically designed for the AI answering machine
 * system with Google Search functionality.
 */

import {EventEmitter} from 'events'
import {
  ToolEnabledGeminiLiveWebSocketClient,
  type ToolEnabledGeminiLiveConfig
} from './tool-enabled-gemini-websocket.js'
import {ToolCallHandler} from './tool-call-handler.js'
import {QuestionDetector} from './question-detector.js'
import {TranscriptionQuestionPipeline} from './transcription-question-pipeline.js'
import {MultiPartQuestionProcessor} from './multi-part-question-processor.js'
import {logger} from './gemini-logger.js'
import {
  ResponseModality,
  ConnectionState,
  type ParsedGeminiResponse
} from './gemini-live-websocket.js'

// Configuration interface for the complete integration
export interface GeminiToolCallIntegrationConfig {
  // Gemini Live API configuration
  gemini: {
    apiKey: string
    model?: string
    systemInstruction?: string
    responseModalities?: ResponseModality[]
  }

  // Google Search API configuration
  googleSearch: {
    apiKey: string
    searchEngineId: string
    enableCaching?: boolean
    cacheTtlSeconds?: number
    maxResultsPerQuery?: number
    timeout?: number
  }

  // Question detection configuration
  questionDetection?: {
    enabled?: boolean
    minConfidence?: number
    bufferTimeMs?: number
    enableContextProcessing?: boolean
    conversationHistoryLimit?: number
  }

  // Tool calling behavior configuration
  toolCalling?: {
    autoExecute?: boolean
    maxConcurrentCalls?: number
    callTimeout?: number
    retryFailedCalls?: boolean
    maxRetries?: number
  }
}

// Events emitted by the integration service
export interface GeminiToolCallIntegrationEvents {
  // Connection events
  connected: () => void
  disconnected: () => void
  error: (error: Error) => void

  // Conversation events
  transcription: (data: {text: string; confidence: number; isFinal: boolean}) => void
  response: (data: {text: string; source: string; timestamp: number}) => void
  audioResponse: (data: {audioData: string; timestamp: number}) => void

  // Question detection events
  questionDetected: (data: {
    text: string
    questionType: string
    confidence: number
    isMultiPart: boolean
  }) => void

  // Tool call events
  toolCallRequested: (data: {id: string; name: string; parameters: any; timestamp: number}) => void
  toolCallStarted: (data: {id: string; name: string; parameters: any}) => void
  toolCallCompleted: (data: {
    id: string
    name: string
    success: boolean
    result?: any
    error?: string
    executionTime: number
  }) => void

  // Search events
  searchStarted: (data: {query: string; timestamp: number}) => void
  searchCompleted: (data: {
    query: string
    resultCount: number
    responseTime: number
    cacheHit: boolean
  }) => void
  searchFailed: (data: {query: string; error: string; timestamp: number}) => void
}

declare interface GeminiToolCallIntegrationService {
  on<K extends keyof GeminiToolCallIntegrationEvents>(
    event: K,
    listener: GeminiToolCallIntegrationEvents[K]
  ): this
  emit<K extends keyof GeminiToolCallIntegrationEvents>(
    event: K,
    ...args: Parameters<GeminiToolCallIntegrationEvents[K]>
  ): boolean
}

/**
 * Complete Gemini Live API Tool Call Integration Service
 */
class GeminiToolCallIntegrationService extends EventEmitter {
  private websocketClient: ToolEnabledGeminiLiveWebSocketClient
  private toolCallHandler: ToolCallHandler
  private questionDetector: QuestionDetector
  private transcriptionPipeline: TranscriptionQuestionPipeline
  private multiPartProcessor: MultiPartQuestionProcessor
  private config: GeminiToolCallIntegrationConfig

  // State management
  private conversationHistory: Array<{
    type: 'user' | 'model' | 'tool'
    content: string
    timestamp: number
    metadata?: any
  }> = []

  private activeToolCalls = new Map<
    string,
    {
      id: string
      name: string
      parameters: any
      startTime: number
      retryCount: number
    }
  >()

  private isProcessingQuestion = false

  constructor(config: GeminiToolCallIntegrationConfig) {
    super()
    this.config = config

    this.initializeServices()
    this.setupEventHandlers()
  }

  /**
   * Initialize all required services
   */
  private initializeServices(): void {
    // Initialize tool call handler
    this.toolCallHandler = new ToolCallHandler({
      apiKey: this.config.googleSearch.apiKey,
      searchEngineId: this.config.googleSearch.searchEngineId,
      enableCaching: this.config.googleSearch.enableCaching ?? true,
      cacheTtlSeconds: this.config.googleSearch.cacheTtlSeconds ?? 1800,
      maxRetries: 3,
      timeout: this.config.googleSearch.timeout ?? 10000,
      security: {
        sanitizeQueries: true,
        maxQueryLength: 2048
      }
    })

    // Initialize question detector
    this.questionDetector = new QuestionDetector()

    // Initialize multi-part question processor
    this.multiPartProcessor = new MultiPartQuestionProcessor()

    // Initialize transcription question pipeline
    this.transcriptionPipeline = new TranscriptionQuestionPipeline({
      questionDetector: this.questionDetector,
      bufferTimeMs: this.config.questionDetection?.bufferTimeMs ?? 1500,
      minConfidence: this.config.questionDetection?.minConfidence ?? 0.7,
      enableContextProcessing: this.config.questionDetection?.enableContextProcessing ?? true,
      conversationHistoryLimit: this.config.questionDetection?.conversationHistoryLimit ?? 20
    })

    // Create enhanced Gemini Live client with tool definitions
    const geminiConfig: ToolEnabledGeminiLiveConfig = {
      apiKey: this.config.gemini.apiKey,
      model: this.config.gemini.model ?? 'gemini-live-2.5-flash-preview',
      responseModalities: this.config.gemini.responseModalities ?? [ResponseModality.TEXT],
      systemInstruction: this.createSystemInstruction(),
      tools: this.createToolDefinitions()
    }

    this.websocketClient = new ToolEnabledGeminiLiveWebSocketClient(geminiConfig)

    logger.info('Gemini tool call integration services initialized successfully')
  }

  /**
   * Create comprehensive system instruction
   */
  private createSystemInstruction(): string {
    const baseInstruction =
      this.config.gemini.systemInstruction ??
      'You are an intelligent AI assistant with access to real-time search capabilities.'

    return `${baseInstruction}

TOOL USAGE GUIDELINES:
1. **Google Search Tool**: Use the google_search function when users ask questions that require:
   - Current information or recent events
   - Specific facts, statistics, or data
   - Product information, prices, or availability  
   - News, weather, or time-sensitive information
   - Research topics or detailed explanations

2. **When to Search**:
   - Questions starting with "what is", "how much", "when did", "where is"
   - Requests for current/latest information
   - Factual queries that benefit from multiple sources
   - Technical questions requiring up-to-date information

3. **When NOT to Search**:
   - Personal opinions or preferences
   - Creative tasks (stories, poems, jokes)
   - Math calculations or logical reasoning
   - General knowledge that doesn't change frequently
   - Questions about yourself or capabilities

4. **Search Best Practices**:
   - Extract key terms from the user's question
   - Use specific, focused search queries
   - Request 5-8 results for comprehensive answers
   - Integrate search results naturally into your response
   - Always cite or reference sources when using search information

5. **Response Guidelines**:
   - Provide direct, helpful answers
   - Include relevant details from search results
   - Maintain a conversational, friendly tone
   - Acknowledge if a search fails and provide alternative help

Always prioritize being helpful, accurate, and informative while using tools appropriately.`
  }

  /**
   * Create tool definitions for Gemini API
   */
  private createToolDefinitions() {
    return [
      {
        name: 'google_search',
        description:
          'Search the web using Google Custom Search API to find current, accurate information and answer questions',
        parameters: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description:
                "The search query extracted from the user's question. Should be clear, specific, and focused on key terms."
            },
            num_results: {
              type: 'number',
              description: 'Number of search results to return. Default is 5, maximum is 10.'
            }
          },
          required: ['query']
        }
      }
    ]
  }

  /**
   * Setup event handlers for all services
   */
  private setupEventHandlers(): void {
    // WebSocket client events
    this.websocketClient.on('connected', () => {
      logger.info('Gemini Live API connected with tool calling support')
      this.emit('connected')
    })

    this.websocketClient.on('disconnected', () => {
      logger.info('Gemini Live API disconnected')
      this.emit('disconnected')
    })

    this.websocketClient.on('error', error => {
      logger.error('Gemini Live API error', {error})
      this.emit('error', error)
    })

    this.websocketClient.on('message', this.handleGeminiMessage.bind(this))

    // Tool call handler events
    this.toolCallHandler.on('searchStart', data => {
      logger.info('Search started', {query: data.query})
      this.emit('searchStarted', {query: data.query, timestamp: Date.now()})
    })

    this.toolCallHandler.on('searchComplete', data => {
      logger.info('Search completed', {query: data.query, resultCount: data.resultCount})
      this.emit('searchCompleted', {
        query: data.query,
        resultCount: data.resultCount,
        responseTime: data.responseTime,
        cacheHit: data.cacheHit || false
      })
    })

    this.toolCallHandler.on('searchError', data => {
      logger.error('Search failed', {query: data.query, error: data.error})
      this.emit('searchFailed', {
        query: data.query,
        error: data.error,
        timestamp: Date.now()
      })
    })

    // Transcription pipeline events
    this.transcriptionPipeline.on('questionDetected', this.handleQuestionDetected.bind(this))

    logger.info('Event handlers configured for all services')
  }

  /**
   * Handle messages from Gemini Live API
   */
  private async handleGeminiMessage(message: ParsedGeminiResponse): Promise<void> {
    try {
      switch (message.type) {
        case 'text':
          if (message.content) {
            this.addToConversationHistory('model', message.content)
            this.emit('response', {
              text: message.content,
              source: 'gemini',
              timestamp: Date.now()
            })
          }
          break

        case 'audio':
          if (message.audioData) {
            this.emit('audioResponse', {
              audioData: message.audioData,
              timestamp: Date.now()
            })
          }
          break

        case 'tool_call':
          if (message.toolCall) {
            await this.handleToolCallRequest({
              id: message.toolCall.id || this.generateId(),
              name: message.toolCall.name,
              parameters: message.toolCall.parameters || {},
              timestamp: Date.now()
            })
          }
          break

        default:
          logger.debug('Unhandled message type', {type: message.type})
      }
    } catch (error) {
      logger.error('Error handling Gemini message', {
        error: error instanceof Error ? error.message : String(error),
        messageType: message.type
      })
    }
  }

  /**
   * Handle tool call requests from Gemini
   */
  private async handleToolCallRequest(request: {
    id: string
    name: string
    parameters: any
    timestamp: number
  }): Promise<void> {
    logger.info('Tool call requested', {
      id: request.id,
      name: request.name,
      parameters: request.parameters
    })

    this.emit('toolCallRequested', request)

    // Track active tool call
    this.activeToolCalls.set(request.id, {
      id: request.id,
      name: request.name,
      parameters: request.parameters,
      startTime: Date.now(),
      retryCount: 0
    })

    // Auto-execute if configured
    if (this.config.toolCalling?.autoExecute !== false) {
      await this.executeToolCall(request)
    }
  }

  /**
   * Execute a tool call
   */
  private async executeToolCall(request: {
    id: string
    name: string
    parameters: any
  }): Promise<void> {
    const startTime = Date.now()

    this.emit('toolCallStarted', {
      id: request.id,
      name: request.name,
      parameters: request.parameters
    })

    try {
      let result: any
      let success = true
      let error: string | undefined

      switch (request.name) {
        case 'google_search':
          const query = request.parameters.query as string
          const numResults = Math.min(request.parameters.num_results || 5, 10)

          logger.info('Executing Google search', {query, numResults})

          const searchResult = await this.toolCallHandler.executeGoogleSearch(query, {
            num: numResults,
            safe: 'active'
          })

          if (searchResult.success && searchResult.results) {
            result = {
              query,
              results: searchResult.results.map(r => ({
                title: r.title,
                snippet: r.snippet,
                link: r.link
              })),
              totalResults: searchResult.results.length,
              searchTime: searchResult.metadata?.responseTime || 0
            }

            // Add formatted results to conversation history
            const formattedResults = this.formatSearchResults(query, searchResult.results)
            this.addToConversationHistory('tool', formattedResults)
          } else {
            success = false
            error = searchResult.error || 'Google search failed'
            result = {query, results: [], error}
          }
          break

        default:
          success = false
          error = `Unknown tool: ${request.name}`
          result = {error}
      }

      const executionTime = Date.now() - startTime

      // Send result back to Gemini
      await this.websocketClient.sendToolCallResponse(request.id, request.name, result)

      // Clean up active tool call
      this.activeToolCalls.delete(request.id)

      this.emit('toolCallCompleted', {
        id: request.id,
        name: request.name,
        success,
        result,
        error,
        executionTime
      })

      logger.info('Tool call completed', {
        id: request.id,
        name: request.name,
        success,
        executionTime
      })
    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Attempt retry if configured
      const activeCall = this.activeToolCalls.get(request.id)
      const maxRetries = this.config.toolCalling?.maxRetries ?? 2

      if (
        activeCall &&
        activeCall.retryCount < maxRetries &&
        this.config.toolCalling?.retryFailedCalls
      ) {
        activeCall.retryCount++
        logger.warn('Retrying failed tool call', {
          id: request.id,
          retryCount: activeCall.retryCount,
          maxRetries
        })

        // Retry after brief delay
        setTimeout(() => this.executeToolCall(request), 1000)
        return
      }

      // Send error response to Gemini
      await this.websocketClient.sendToolCallResponse(request.id, request.name, {
        error: errorMessage
      })

      this.activeToolCalls.delete(request.id)

      this.emit('toolCallCompleted', {
        id: request.id,
        name: request.name,
        success: false,
        error: errorMessage,
        executionTime
      })

      logger.error('Tool call failed', {
        id: request.id,
        name: request.name,
        error: errorMessage
      })
    }
  }

  /**
   * Handle detected questions from transcription pipeline
   */
  private async handleQuestionDetected(event: {
    text: string
    questionType: string
    confidence: number
  }): Promise<void> {
    if (this.isProcessingQuestion) {
      logger.debug('Already processing a question, skipping', {text: event.text.substring(0, 50)})
      return
    }

    this.isProcessingQuestion = true

    try {
      logger.info('Question detected in transcription', {
        text: event.text.substring(0, 100) + '...',
        type: event.questionType,
        confidence: event.confidence
      })

      // Check if this is a multi-part question
      const conversationContext = this.conversationHistory.slice(-5)
      const multiPartResult = await this.multiPartProcessor.processQuestion(
        event.text,
        conversationContext
      )

      if (multiPartResult.isMultiPart) {
        logger.info('Multi-part question detected', {
          strategy: multiPartResult.processingStrategy,
          partCount: multiPartResult.parts.length
        })

        // Process each part separately
        for (const part of multiPartResult.parts) {
          await this.sendText(part.question)
          // Brief pause between parts
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } else {
        // Send single question to Gemini
        await this.sendText(event.text)
      }

      this.emit('questionDetected', {
        text: event.text,
        questionType: event.questionType,
        confidence: event.confidence,
        isMultiPart: multiPartResult.isMultiPart
      })
    } catch (error) {
      logger.error('Error handling detected question', {
        error: error instanceof Error ? error.message : String(error),
        text: event.text.substring(0, 50)
      })
    } finally {
      this.isProcessingQuestion = false
    }
  }

  /**
   * Format search results for conversation history
   */
  private formatSearchResults(
    query: string,
    results: Array<{title: string; snippet: string; link: string}>
  ): string {
    const formattedResults = results
      .slice(0, 5)
      .map(
        (result, index) => `${index + 1}. ${result.title}\n   ${result.snippet}\n   ${result.link}`
      )
      .join('\n\n')

    return `Search results for "${query}":\n\n${formattedResults}`
  }

  /**
   * Add entry to conversation history
   */
  private addToConversationHistory(
    type: 'user' | 'model' | 'tool',
    content: string,
    metadata?: any
  ): void {
    this.conversationHistory.push({
      type,
      content,
      timestamp: Date.now(),
      metadata
    })

    // Keep history manageable
    if (this.conversationHistory.length > 100) {
      this.conversationHistory = this.conversationHistory.slice(-50)
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Public API methods

  /**
   * Connect to Gemini Live API
   */
  async connect(): Promise<void> {
    logger.info('Connecting to Gemini Live API with tool calling support')
    await this.websocketClient.connect()
  }

  /**
   * Disconnect from Gemini Live API
   */
  async disconnect(): Promise<void> {
    logger.info('Disconnecting from Gemini Live API')
    await this.websocketClient.disconnect()
  }

  /**
   * Process audio transcription
   */
  async processTranscription(data: {
    transcript: string
    isFinal: boolean
    confidence: number
  }): Promise<void> {
    // Add to conversation history
    if (data.isFinal) {
      this.addToConversationHistory('user', data.transcript, {
        confidence: data.confidence,
        source: 'transcription'
      })
    }

    // Process through question detection pipeline
    this.transcriptionPipeline.processTranscript({
      transcript: data.transcript,
      isFinal: data.isFinal,
      confidence: data.confidence
    })

    this.emit('transcription', {
      text: data.transcript,
      confidence: data.confidence,
      isFinal: data.isFinal
    })
  }

  /**
   * Send text message to Gemini
   */
  async sendText(text: string): Promise<void> {
    this.addToConversationHistory('user', text, {source: 'direct_input'})
    await this.websocketClient.sendRealtimeInput({text})
  }

  /**
   * Send audio to Gemini
   */
  async sendAudio(audioData: string, mimeType = 'audio/pcm'): Promise<void> {
    await this.websocketClient.sendRealtimeInput({
      audio: {data: audioData, mimeType}
    })
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): Array<{
    type: string
    content: string
    timestamp: number
    metadata?: any
  }> {
    return [...this.conversationHistory]
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return this.websocketClient.getConnectionState()
  }

  /**
   * Get active tool calls
   */
  getActiveToolCalls(): Array<{id: string; name: string; startTime: number; retryCount: number}> {
    return Array.from(this.activeToolCalls.values())
  }

  /**
   * Get integration statistics
   */
  getStatistics() {
    const toolCallHistory = this.conversationHistory.filter(entry => entry.type === 'tool')
    const toolCallCount = this.activeToolCalls.size
    const quotaStatus = this.toolCallHandler.getQuotaStatus()
    const cacheStats = this.toolCallHandler.getCacheStats()

    return {
      conversationHistory: this.conversationHistory.length,
      toolCallHistory: toolCallHistory.length,
      activeToolCalls: toolCallCount,
      quota: quotaStatus,
      cache: cacheStats
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    logger.info('Destroying Gemini tool call integration service')

    if (this.websocketClient) {
      this.websocketClient.disconnect()
    }

    if (this.toolCallHandler) {
      this.toolCallHandler.destroy()
    }

    if (this.transcriptionPipeline) {
      this.transcriptionPipeline.destroy()
    }

    this.removeAllListeners()
    this.conversationHistory = []
    this.activeToolCalls.clear()
  }
}

export default GeminiToolCallIntegrationService
