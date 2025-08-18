/**
 * Batch Transport Implementation
 *
 * Final fallback transport using batch API processing for offline or highly degraded network conditions.
 * Accumulates audio data and processes in batches when other transport methods fail.
 */

import {TransportStrategy, AudioSendOptions, TranscriptionResult} from '../FallbackManager'
import {logger} from '../../services/gemini-logger'
import {EventEmitter} from 'events'

export interface BatchTransportConfig {
  batchSize: number
  maxBatchDelay: number
  maxRetries: number
  retryDelayMs: number
  compressionEnabled: boolean
  persistenceEnabled: boolean
}

export interface BatchTransportMetrics {
  batchCount: number
  totalAudioDuration: number
  averageBatchSize: number
  averageProcessingTime: number
  successfulBatches: number
  failedBatches: number
  compressionRatio: number
}

export interface AudioBatch {
  id: string
  audioChunks: Buffer[]
  totalSize: number
  createdAt: Date
  options: AudioSendOptions[]
}

const DEFAULT_CONFIG: BatchTransportConfig = {
  batchSize: 10 * 1024 * 1024, // 10MB batch size
  maxBatchDelay: 30000, // 30 seconds max delay
  maxRetries: 5,
  retryDelayMs: 5000,
  compressionEnabled: true,
  persistenceEnabled: true
}

/**
 * Batch transport for final fallback processing
 */
export class BatchTransport extends EventEmitter implements TransportStrategy {
  readonly name: string = 'batch'
  readonly priority: number = 3 // Lowest priority transport

  private config: BatchTransportConfig
  private isConnected: boolean = false
  private isHealthy: boolean = false
  private metrics: BatchTransportMetrics
  private currentBatch: AudioBatch | null = null
  private batchTimer: NodeJS.Timeout | null = null
  private audioBuffer: Buffer[] = []
  private pendingBatches: Map<string, AudioBatch> = new Map()

  constructor(config: Partial<BatchTransportConfig> = {}) {
    super()
    this.config = {...DEFAULT_CONFIG, ...config}
    this.metrics = this.initializeMetrics()
  }

  private initializeMetrics(): BatchTransportMetrics {
    return {
      batchCount: 0,
      totalAudioDuration: 0,
      averageBatchSize: 0,
      averageProcessingTime: 0,
      successfulBatches: 0,
      failedBatches: 0,
      compressionRatio: 1.0
    }
  }

  /**
   * Check if transport is available
   */
  isAvailable(): boolean {
    return true // Batch processing is always available as final fallback
  }

  /**
   * Initialize Batch transport
   */
  async initialize(): Promise<void> {
    logger.info('BatchTransport: Initializing batch transport')

    try {
      // Initialize batch processing
      this.startBatchTimer()
      this.isConnected = true
      this.isHealthy = true
      this.emit('connected')
      logger.info('BatchTransport: Batch transport initialized successfully')
    } catch (error) {
      logger.error('BatchTransport: Failed to initialize:', {error: String(error)})
      throw error
    }
  }

  /**
   * Start batch processing timer
   */
  private startBatchTimer(): void {
    if (this.batchTimer) {
      return
    }

    this.batchTimer = setInterval(() => {
      if (this.currentBatch && this.shouldProcessBatch()) {
        this.processBatch(this.currentBatch).catch(error => {
          logger.error('BatchTransport: Batch processing failed:', {error: String(error)})
        })
      }
    }, this.config.maxBatchDelay / 4) // Check every quarter of max delay
  }

  /**
   * Stop batch processing timer
   */
  private stopBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer)
      this.batchTimer = null
    }
  }

  /**
   * Send audio data to batch processing
   */
  async sendAudio(audioData: Buffer, options?: AudioSendOptions): Promise<TranscriptionResult> {
    if (!this.isHealthy) {
      throw new Error('Batch transport is not healthy')
    }

    // Add audio to current batch
    if (!this.currentBatch) {
      this.currentBatch = this.createNewBatch()
    }

    this.currentBatch.audioChunks.push(audioData)
    this.currentBatch.totalSize += audioData.length
    this.currentBatch.options.push(options || {})

    // Process batch if it's full or should be processed
    if (this.shouldProcessBatch()) {
      const result = await this.processBatch(this.currentBatch)
      return result
    }

    // For batch processing, return placeholder result
    // Actual transcription will be emitted via events when batch completes
    return {
      text: '', // Will be populated when batch processing completes
      confidence: undefined,
      source: 'batch' as const,
      sessionId: options?.sessionId
    }
  }

  /**
   * Create new audio batch
   */
  private createNewBatch(): AudioBatch {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      id: batchId,
      audioChunks: [],
      totalSize: 0,
      createdAt: new Date(),
      options: []
    }
  }

  /**
   * Check if current batch should be processed
   */
  private shouldProcessBatch(): boolean {
    if (!this.currentBatch) {
      return false
    }

    // Process if batch size exceeded
    if (this.currentBatch.totalSize >= this.config.batchSize) {
      return true
    }

    // Process if batch age exceeded
    const batchAge = Date.now() - this.currentBatch.createdAt.getTime()
    if (batchAge >= this.config.maxBatchDelay) {
      return true
    }

    return false
  }

  /**
   * Process audio batch
   */
  private async processBatch(batch: AudioBatch): Promise<TranscriptionResult> {
    logger.info(
      `BatchTransport: Processing batch ${batch.id} (${batch.audioChunks.length} chunks, ${batch.totalSize} bytes)`
    )

    const startTime = Date.now()
    this.metrics.batchCount++

    try {
      // Combine all audio chunks
      const combinedAudio = Buffer.concat(batch.audioChunks)

      // Apply compression if enabled
      let processedAudio: Buffer = combinedAudio
      if (this.config.compressionEnabled) {
        processedAudio = Buffer.from(await this.compressAudio(combinedAudio))
        this.updateCompressionRatio(combinedAudio.length, processedAudio.length)
      }

      // Send batch to API
      const transcriptionResult = await this.sendBatchToAPI(processedAudio, batch)

      // Update metrics
      const processingTime = Date.now() - startTime
      this.updateProcessingMetrics(batch.totalSize, processingTime)
      this.metrics.successfulBatches++

      // Clean up current batch and create new one
      this.currentBatch = null

      // Emit batch completion event
      this.emit('batchProcessed', {
        batchId: batch.id,
        result: transcriptionResult,
        processingTime
      })

      return transcriptionResult
    } catch (error) {
      this.metrics.failedBatches++
      logger.error(`BatchTransport: Batch ${batch.id} processing failed:`, {error: String(error)})

      // Move batch to retry queue or handle failure
      this.handleBatchFailure(batch, error)

      throw error
    }
  }

  /**
   * Send batch to transcription API
   */
  private async sendBatchToAPI(
    audioData: Buffer,
    _batch: AudioBatch
  ): Promise<TranscriptionResult> {
    const requestPayload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/pcm',
                data: audioData.toString('base64')
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        candidateCount: 1
      }
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GOOGLE_API_KEY}`
          },
          body: JSON.stringify(requestPayload)
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      // Extract text from API response
      let transcriptionText = ''
      const confidence = 0.7 // Default batch confidence

      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        const parts = result.candidates[0].content.parts || []
        transcriptionText = parts.map((part: {text?: string}) => part.text || '').join('')
      }

      return {
        text: transcriptionText,
        confidence,
        source: 'batch' as const,
        duration: this.estimateAudioDuration(audioData.length)
      }
    } catch (error) {
      logger.error('BatchTransport: API request failed:', {error: String(error)})
      throw error
    }
  }

  /**
   * Compress audio data (placeholder implementation)
   */
  private async compressAudio(audioData: Buffer): Promise<Buffer> {
    // For now, return original data
    // In a real implementation, this would apply audio compression
    logger.debug('BatchTransport: Audio compression not implemented, using original data')
    return audioData
  }

  /**
   * Estimate audio duration based on PCM data size
   */
  private estimateAudioDuration(dataSize: number): number {
    // Assuming 16-bit PCM at 16kHz (2 bytes per sample * 16000 samples/sec)
    const bytesPerSecond = 2 * 16000
    return Math.round((dataSize / bytesPerSecond) * 1000) // Duration in milliseconds
  }

  /**
   * Update compression ratio metric
   */
  private updateCompressionRatio(originalSize: number, compressedSize: number): void {
    const ratio = compressedSize / originalSize
    this.metrics.compressionRatio = (this.metrics.compressionRatio + ratio) / 2
  }

  /**
   * Update processing metrics
   */
  private updateProcessingMetrics(batchSize: number, processingTime: number): void {
    // Update average batch size
    const totalBatches = this.metrics.batchCount
    this.metrics.averageBatchSize =
      (this.metrics.averageBatchSize * (totalBatches - 1) + batchSize) / totalBatches

    // Update average processing time
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime * (totalBatches - 1) + processingTime) / totalBatches
  }

  /**
   * Handle batch processing failure
   */
  private handleBatchFailure(batch: AudioBatch, error: unknown): void {
    logger.warn(`BatchTransport: Handling batch failure for ${batch.id}`)

    // Store failed batch for retry
    this.pendingBatches.set(batch.id, batch)

    // Emit failure event
    this.emit('batchFailed', {
      batchId: batch.id,
      error: String(error),
      retryable: this.isRetryableError(error)
    })
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network errors and 5xx HTTP errors are retryable
      return error.name === 'TypeError' || error.message.includes('HTTP 5')
    }
    return false
  }

  /**
   * Send turn completion signal
   */
  async sendTurnComplete(): Promise<void> {
    // Process any remaining batch immediately
    if (this.currentBatch && this.currentBatch.audioChunks.length > 0) {
      try {
        await this.processBatch(this.currentBatch)
        logger.info('BatchTransport: Final batch processed on turn complete')
      } catch (error) {
        logger.error('BatchTransport: Failed to process final batch:', {error: String(error)})
      }
    }
  }

  /**
   * Disconnect batch transport
   */
  async disconnect(): Promise<void> {
    logger.info('BatchTransport: Disconnecting')

    this.stopBatchTimer()

    // Process any remaining batches
    if (this.currentBatch && this.currentBatch.audioChunks.length > 0) {
      try {
        await this.processBatch(this.currentBatch)
      } catch (error) {
        logger.warn('BatchTransport: Failed to process final batch on disconnect:', {
          error: String(error)
        })
      }
    }

    this.isConnected = false
    this.isHealthy = false
    this.emit('disconnected', {code: 0, reason: 'Manual disconnect'})
  }

  /**
   * Check if transport is healthy
   */
  isTransportHealthy(): boolean {
    return this.isHealthy && this.isConnected
  }

  /**
   * Get transport quality score (0.0 to 1.0)
   */
  getQualityScore(): number {
    if (!this.isConnected) {
      return 0.0
    }

    if (!this.isHealthy) {
      return 0.2
    }

    // Calculate quality based on success rate
    const successRate =
      this.metrics.batchCount > 0 ? this.metrics.successfulBatches / this.metrics.batchCount : 0.5

    // Batch processing is inherently slower and less reliable, so cap at 0.6
    return Math.max(0.2, Math.min(0.6, successRate))
  }

  /**
   * Get transport metrics
   */
  getMetrics(): BatchTransportMetrics {
    return {...this.metrics}
  }

  /**
   * Reset transport state
   */
  async reset(): Promise<void> {
    logger.info('BatchTransport: Resetting transport state')

    await this.disconnect()

    // Clear pending batches
    this.pendingBatches.clear()
    this.audioBuffer = []
    this.currentBatch = null
  }

  /**
   * Destroy transport and clean up resources
   */
  async destroy(): Promise<void> {
    logger.info('BatchTransport: Destroying transport')
    await this.disconnect()
    this.removeAllListeners()
  }

  /**
   * Get transport type identifier
   */
  getTransportType(): string {
    return 'batch'
  }
}

export default BatchTransport
