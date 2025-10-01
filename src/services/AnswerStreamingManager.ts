/**
 * AnswerStreamingManager
 *
 * Manages real-time streaming of AI answers using the existing WebSocket infrastructure.
 * Integrates with UltraFastWebSocketManager and StreamingTextRenderer for optimal
 * performance and user experience.
 */

import { EventEmitter } from 'events'
import { UltraFastWebSocketManager } from './UltraFastWebSocketManager'
import { getWebSocketRouter, StreamingTarget } from './WebSocketTranscriptionRouter'
import { TranscriptionWithSource } from './TranscriptionSourceManager'

export interface AnswerStream {
  id: string
  questionId: string
  questionText: string
  currentAnswer: string
  isComplete: boolean
  isStreaming: boolean
  startTime: number
  endTime?: number
  metadata: {
    searchQuery?: string
    sourceCount?: number
    confidence?: number
    processingTime?: number
    streamingLatency?: number
  }
}

export interface AnswerStreamChunk {
  streamId: string
  chunkIndex: number
  text: string
  isPartial: boolean
  isComplete: boolean
  timestamp: number
  metadata?: {
    tokensPerSecond?: number
    latency?: number
    confidence?: number
  }
}

export interface AnswerStreamingConfig {
  maxConcurrentStreams: number
  streamTimeout: number
  chunkDelay: number
  enablePerformanceMetrics: boolean
  enableDebugLogging: boolean
  prioritizeOverTranscription: boolean
  maxAnswerLength: number
  streamingMode: 'character' | 'word' | 'chunk'
}

/**
 * AnswerStreamingManager - Handles real-time streaming of AI-generated answers
 */
export class AnswerStreamingManager extends EventEmitter implements StreamingTarget {
  private config: AnswerStreamingConfig
  private webSocketManager: UltraFastWebSocketManager
  private activeStreams = new Map<string, AnswerStream>()
  private streamingQueue: AnswerStream[] = []
  private currentStreamingAnswer: AnswerStream | null = null
  private performanceMetrics = {
    totalAnswersStreamed: 0,
    averageStreamingTime: 0,
    averageLatency: 0,
    totalChunks: 0,
    streamingStartTime: Date.now()
  }

  constructor(
    webSocketManager: UltraFastWebSocketManager,
    config: Partial<AnswerStreamingConfig> = {}
  ) {
    super()

    this.config = {
      maxConcurrentStreams: 1,
      streamTimeout: 30000, // 30 seconds
      chunkDelay: 50, // 50ms between chunks for smooth streaming
      enablePerformanceMetrics: true,
      enableDebugLogging: true,
      prioritizeOverTranscription: true,
      maxAnswerLength: 5000,
      streamingMode: 'chunk',
      ...config
    }

    this.webSocketManager = webSocketManager
    this.setupWebSocketListeners()
    this.registerWithRouter()

    console.log('🤖 AnswerStreamingManager initialized with config:', this.config)
  }

  /**
   * Setup WebSocket event listeners for answer streaming
   */
  private setupWebSocketListeners(): void {
    // Listen for general WebSocket events
    this.webSocketManager.on('connected', this.handleWebSocketConnected.bind(this))
    this.webSocketManager.on('disconnected', this.handleWebSocketDisconnected.bind(this))
    this.webSocketManager.on('error', this.handleWebSocketError.bind(this))

    // Listen for transcription messages that might contain answers
    this.webSocketManager.on('transcription', this.handleAnswerMessage.bind(this))
    this.webSocketManager.on('partial', this.handleAnswerChunk.bind(this))
    this.webSocketManager.on('complete', this.handleAnswerComplete.bind(this))

    if (this.config.enableDebugLogging) {
      console.log('🔌 AnswerStreamingManager: WebSocket listeners configured')
    }
  }

  /**
   * Register with WebSocketTranscriptionRouter for intelligent routing
   */
  private registerWithRouter(): void {
    const router = getWebSocketRouter()
    router.setStreamingTarget(this)

    if (this.config.enableDebugLogging) {
      console.log('🔀 AnswerStreamingManager: Registered with WebSocket router')
    }
  }

  /**
   * StreamingTarget interface implementation
   */
  get isStreamingActive(): boolean {
    return this.currentStreamingAnswer !== null && this.currentStreamingAnswer.isStreaming
  }

  get currentStreamingSource(): string | undefined {
    return this.currentStreamingAnswer?.id
  }

  startStreamingTranscription(transcription: TranscriptionWithSource): void {
    // Convert transcription to answer stream for compatibility
    if (this.config.enableDebugLogging) {
      console.log('🔄 Converting transcription to answer stream:', transcription.text.substring(0, 50))
    }

    const answerStream: AnswerStream = {
      id: `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      questionId: transcription.id || 'unknown',
      questionText: transcription.text,
      currentAnswer: '',
      isComplete: false,
      isStreaming: true,
      startTime: Date.now(),
      metadata: {
        confidence: transcription.confidence,
        processingTime: 0
      }
    }

    // Start the stream directly without answer text (will be received via updates)
    this.startAnswerStreamInternal(answerStream)
  }

  updateStreamingTranscription(transcription: TranscriptionWithSource): void {
    if (this.currentStreamingAnswer) {
      this.currentStreamingAnswer.currentAnswer = transcription.text
      this.emit('answer-updated', this.currentStreamingAnswer)
    }
  }

  completeStreamingTranscription(transcription: TranscriptionWithSource): void {
    if (this.currentStreamingAnswer) {
      this.currentStreamingAnswer.currentAnswer = transcription.text
      this.currentStreamingAnswer.isComplete = true
      this.currentStreamingAnswer.isStreaming = false
      this.currentStreamingAnswer.endTime = Date.now()
      
      this.emit('answer-completed', this.currentStreamingAnswer)
      this.currentStreamingAnswer = null
    }
  }

  /**
   * Start streaming an AI answer
   */
  async startAnswerStream(
    questionId: string,
    questionText: string,
    answerText: string,
    metadata: AnswerStream['metadata'] = {}
  ): Promise<string> {
    const streamId = `answer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const answerStream: AnswerStream = {
      id: streamId,
      questionId,
      questionText,
      currentAnswer: '',
      isComplete: false,
      isStreaming: false,
      startTime: Date.now(),
      metadata: {
        searchQuery: metadata.searchQuery,
        sourceCount: metadata.sourceCount,
        confidence: metadata.confidence || 0.95,
        processingTime: metadata.processingTime || 0,
        ...metadata
      }
    }

    // Handle overload detection
    if (this.activeStreams.size >= this.config.maxConcurrentStreams) {
      if (this.config.enableDebugLogging) {
        console.log(`⏳ Answer stream queued (${this.streamingQueue.length + 1} in queue)`)
      }
      this.streamingQueue.push(answerStream)
      this.activeStreams.set(streamId, answerStream)
      this.emit('stream-queued', answerStream)
      return streamId
    }

    // Start the stream with answer text
    this.startAnswerStreamInternal(answerStream)
    if (answerText) {
      await this.streamAnswerText(streamId, answerText)
    }
    
    return streamId
  }

  /**
   * Internal method to start streaming an answer
   */
  private startAnswerStreamInternal(answerStream: AnswerStream): void {
    this.activeStreams.set(answerStream.id, answerStream)
    this.currentStreamingAnswer = answerStream
    answerStream.isStreaming = true

    if (this.config.enableDebugLogging) {
      console.log(`🚀 Starting answer stream:`, answerStream.id, 'for question:', answerStream.questionText.substring(0, 50))
    }

    // Emit stream started event
    this.emit('stream-started', answerStream)

    // Send WebSocket message to start streaming - use existing transcription type for compatibility
    this.webSocketManager.send({
        action: 'start',
        streamId: answerStream.id,
        questionId: answerStream.questionId,
        questionText: answerStream.questionText,
        metadata: answerStream.metadata
      }, 'transcription')
  }

  /**
   * Stream answer text in chunks
   */
  async streamAnswerText(streamId: string, answerText: string): Promise<void> {
    const answerStream = this.activeStreams.get(streamId)
    if (!answerStream || !answerStream.isStreaming) {
      console.warn(`⚠️ Cannot stream text for inactive stream: ${streamId}`)
      return
    }

    const chunks = this.createTextChunks(answerText, this.config.streamingMode)
    let chunkIndex = 0

    if (this.config.enableDebugLogging) {
      console.log(`📝 Streaming ${chunks.length} chunks for answer:`, streamId)
    }

    for (const chunk of chunks) {
      if (!answerStream.isStreaming) {
        console.log('⏹️ Stream stopped, cancelling chunk streaming')
        break
      }

      const chunkData: AnswerStreamChunk = {
        streamId,
        chunkIndex: chunkIndex++,
        text: chunk,
        isPartial: chunkIndex < chunks.length,
        isComplete: chunkIndex === chunks.length,
        timestamp: Date.now(),
        metadata: {
          tokensPerSecond: this.calculateTokensPerSecond(chunk, Date.now() - answerStream.startTime),
          latency: Date.now() - answerStream.startTime
        }
      }

      // Update current answer
      answerStream.currentAnswer += chunk

      // Send chunk via WebSocket using existing partial message type
      this.webSocketManager.send(
        {
          action: 'chunk',
          streamId,
          chunk: chunkData,
          text: chunk,
          isPartial: chunkData.isPartial
        },
        'partial'
      )

      // Emit chunk event
      this.emit('answer-chunk', chunkData)

      // Update performance metrics
      if (this.config.enablePerformanceMetrics && chunkData.metadata) {
        this.performanceMetrics.totalChunks++
        this.performanceMetrics.averageLatency =
          (this.performanceMetrics.averageLatency + chunkData.metadata.latency) / 2
      }

      // Wait before next chunk for smooth streaming
      if (chunkIndex < chunks.length) {
        await this.delay(this.config.chunkDelay)
      }
    }

    // Complete the stream
    await this.completeAnswerStream(streamId)
  }

  /**
   * Complete an answer stream
   */
  async completeAnswerStream(streamId: string): Promise<void> {
    const answerStream = this.activeStreams.get(streamId)
    if (!answerStream) {
      console.warn(`⚠️ Cannot complete unknown stream: ${streamId}`)
      return
    }

    answerStream.isComplete = true
    answerStream.isStreaming = false
    answerStream.endTime = Date.now()

    if (this.config.enableDebugLogging) {
      console.log(`✅ Answer stream completed:`, streamId, 
        `in ${answerStream.endTime - answerStream.startTime}ms`)
    }

    // Send completion message using existing complete type
    this.webSocketManager.send(
      {
        action: 'complete',
        streamId,
        finalAnswer: answerStream.currentAnswer,
        text: answerStream.currentAnswer,
        metadata: {
          ...answerStream.metadata,
          streamingLatency: answerStream.endTime - answerStream.startTime
        }
      },
      'complete'
    )

    // Emit completion event
    this.emit('stream-completed', answerStream)

    // Update performance metrics
    if (this.config.enablePerformanceMetrics) {
      this.performanceMetrics.totalAnswersStreamed++
      this.performanceMetrics.averageStreamingTime =
        (this.performanceMetrics.averageStreamingTime + (answerStream.endTime - answerStream.startTime)) / 2
    }

    // Clear current streaming answer
    if (this.currentStreamingAnswer?.id === streamId) {
      this.currentStreamingAnswer = null
    }

    // Process next queued stream
    this.processNextQueuedStream()
  }

  /**
   * Process next queued stream
   */
  private processNextQueuedStream(): void {
    if (this.streamingQueue.length === 0 || this.currentStreamingAnswer) {
      return
    }

    const nextStream = this.streamingQueue.shift()!
    this.startAnswerStreamInternal(nextStream)
  }

  /**
   * Create text chunks based on streaming mode
   */
  private createTextChunks(text: string, mode: 'character' | 'word' | 'chunk'): string[] {
    switch (mode) {
      case 'character':
        return text.split('')

      case 'word':
        return text.split(/(\s+)/).filter(chunk => chunk.length > 0)

      case 'chunk':
      default: {
        // Split into reasonable chunks (10-20 characters)
        const chunks: string[] = []
        const words = text.split(' ')
        let currentChunk = ''

        for (const word of words) {
          if (currentChunk.length + word.length + 1 > 20 && currentChunk.length > 0) {
            chunks.push(currentChunk)
            currentChunk = word
          } else {
            currentChunk += (currentChunk.length > 0 ? ' ' : '') + word
          }
        }

        if (currentChunk.length > 0) {
          chunks.push(currentChunk)
        }

        return chunks
      }
    }
  }

  /**
   * Calculate tokens per second
   */
  private calculateTokensPerSecond(text: string, elapsedMs: number): number {
    const tokenCount = text.split(/\s+/).length // Simple token approximation
    const seconds = elapsedMs / 1000
    return seconds > 0 ? tokenCount / seconds : 0
  }

  /**
   * WebSocket event handlers
   */
  private handleAnswerMessage(data: unknown): void {
    if (this.config.enableDebugLogging) {
      console.log('📨 Received answer message:', data)
    }
    this.emit('answer-message', data)
  }

  private handleAnswerChunk(data: unknown): void {
    this.emit('answer-chunk-received', data)
  }

  private handleAnswerComplete(data: unknown): void {
    if (this.config.enableDebugLogging) {
      console.log('✅ Answer complete:', data)
    }
    this.emit('answer-complete-received', data)
  }

  private handleWebSocketConnected(): void {
    console.log('✅ AnswerStreamingManager: WebSocket connected')
    this.emit('websocket-connected')
  }

  private handleWebSocketDisconnected(): void {
    console.log('❌ AnswerStreamingManager: WebSocket disconnected')
    this.emit('websocket-disconnected')

    // Mark all active streams as disconnected
    this.activeStreams.forEach(stream => {
      if (stream.isStreaming) {
        stream.isStreaming = false
      }
    })
  }

  private handleWebSocketError(error: unknown): void {
    console.error('❌ AnswerStreamingManager WebSocket error:', error)
    this.emit('websocket-error', error)
  }

  /**
   * Utility methods
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get active streams
   */
  getActiveStreams(): AnswerStream[] {
    return Array.from(this.activeStreams.values())
  }

  /**
   * Get stream by ID
   */
  getStream(streamId: string): AnswerStream | undefined {
    return this.activeStreams.get(streamId)
  }

  /**
   * Cancel a stream
   */
  cancelStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId)
    if (stream && stream.isStreaming) {
      stream.isStreaming = false
      stream.isComplete = true
      stream.endTime = Date.now()

      this.webSocketManager.send(
        {
          action: 'cancel',
          streamId,
          text: 'Stream cancelled'
        },
        'status'
      )

      this.emit('stream-cancelled', stream)

      if (this.currentStreamingAnswer?.id === streamId) {
        this.currentStreamingAnswer = null
        this.processNextQueuedStream()
      }
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      activeStreams: this.activeStreams.size,
      queuedStreams: this.streamingQueue.length,
      uptime: Date.now() - this.performanceMetrics.streamingStartTime
    }
  }

  /**
   * Clear all streams and reset
   */
  reset(): void {
    this.activeStreams.clear()
    this.streamingQueue = []
    this.currentStreamingAnswer = null

    console.log('🔄 AnswerStreamingManager: Reset completed')
    this.emit('reset')
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.reset()
    this.removeAllListeners()
    console.log('🗑️ AnswerStreamingManager: Destroyed')
  }
}

/**
 * Singleton instance for global access
 */
let answerStreamingManager: AnswerStreamingManager | null = null

export function getAnswerStreamingManager(
  webSocketManager: UltraFastWebSocketManager,
  config?: Partial<AnswerStreamingConfig>
): AnswerStreamingManager {
  if (!answerStreamingManager) {
    answerStreamingManager = new AnswerStreamingManager(webSocketManager, config)
  }
  return answerStreamingManager
}

export function destroyAnswerStreamingManager(): void {
  if (answerStreamingManager) {
    answerStreamingManager.destroy()
    answerStreamingManager = null
  }
}

export default AnswerStreamingManager