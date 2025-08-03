/**
 * Streaming Pipeline with Built-in Backpressure Support
 * 
 * Implements ReadableStream and WritableStream APIs to create a proper
 * streaming pipeline with backpressure handling for WebSocket audio processing.
 * 
 * This integrates with the WebSocketBackpressureController to provide
 * a complete flow control solution.
 */

import { WebSocketBackpressureController, type BackpressureConfig } from './WebSocketBackpressureController'

/**
 * Audio stream chunk interface
 */
export interface AudioStreamChunk {
  audioData: Buffer | ArrayBuffer | Uint8Array
  chunkIndex: number
  timestamp: number
  isLast: boolean
  metadata?: {
    confidence?: number
    source?: string
    originalSize?: number
  }
}

/**
 * Stream processor function type
 */
export type StreamProcessor = (chunk: AudioStreamChunk) => Promise<{
  text: string
  confidence: number
}>

/**
 * Stream configuration options
 */
export interface StreamConfig {
  backpressureConfig?: Partial<BackpressureConfig>
  chunkSize?: number
  maxConcurrentStreams?: number
  streamTimeout?: number
  enableMetrics?: boolean
}

/**
 * Default stream configuration
 */
const DEFAULT_STREAM_CONFIG: Required<StreamConfig> = {
  backpressureConfig: {},
  chunkSize: 32 * 1024, // 32KB chunks
  maxConcurrentStreams: 3,
  streamTimeout: 30000, // 30 seconds
  enableMetrics: true
}

/**
 * Audio Processing Readable Stream
 * 
 * Provides a ReadableStream interface for audio chunk processing
 * with built-in backpressure support.
 */
export class AudioProcessingReadableStream extends ReadableStream<AudioStreamChunk> {
  private controller: ReadableStreamDefaultController<AudioStreamChunk> | null = null
  private backpressureController: WebSocketBackpressureController
  private isActive = false
  private chunkCounter = 0

  constructor(
    private processor: StreamProcessor,
    private config: StreamConfig = {}
  ) {
    const mergedConfig = { ...DEFAULT_STREAM_CONFIG, ...config }

    // Initialize backpressure controller
    const backpressureConfig = {
      maxBufferSize: 30, // Smaller buffer for streaming
      maxBufferMemory: 5 * 1024 * 1024, // 5MB for streaming
      processingDelay: 50, // Faster processing for streaming
      adaptiveDelay: true,
      ...mergedConfig.backpressureConfig
    }

    super({
      start: (controller) => {
        this.controller = controller
        this.isActive = true
        console.log('AudioProcessingReadableStream: Started')
      },

      pull: async () => {
        // This is called when the consumer is ready for more data
        // The actual data pushing is handled by the enqueue method
      },

      cancel: (reason) => {
        console.log('AudioProcessingReadableStream: Cancelled:', reason)
        this.cleanup()
      }
    })

    this.backpressureController = new WebSocketBackpressureController(backpressureConfig)

    // Set up backpressure event handlers
    this.setupBackpressureHandlers()
  }

  /**
   * Add audio chunk to the stream
   */
  async enqueueAudioChunk(
    audioData: Buffer | ArrayBuffer | Uint8Array,
    isLast: boolean = false,
    metadata?: AudioStreamChunk['metadata']
  ): Promise<boolean> {
    if (!this.isActive || !this.controller) {
      return false
    }

    const chunk: AudioStreamChunk = {
      audioData,
      chunkIndex: this.chunkCounter++,
      timestamp: Date.now(),
      isLast,
      metadata
    }

    // Try to enqueue with backpressure control
    const estimatedSize = this.getChunkSize(audioData)
    const enqueued = await this.backpressureController.enqueue(
      audioData,
      estimatedSize,
      {
        chunkIndex: chunk.chunkIndex,
        isLast: chunk.isLast,
        confidence: metadata?.confidence
      }
    )

    if (enqueued) {
      // Process the chunk and push to stream
      this.processAndPush(chunk)
    }

    return enqueued
  }

  /**
   * Process chunk and push result to stream
   */
  private async processAndPush(chunk: AudioStreamChunk): Promise<void> {
    try {
      // Process the audio chunk
      const result = await this.processor(chunk)

      // Create enhanced chunk with processing result
      const enhancedChunk: AudioStreamChunk = {
        ...chunk,
        metadata: {
          ...chunk.metadata,
          confidence: result.confidence
        }
      }

      // Push to stream if controller is available
      if (this.controller && this.isActive) {
        this.controller.enqueue(enhancedChunk)

        // Close stream if this is the last chunk
        if (chunk.isLast) {
          this.controller.close()
          this.cleanup()
        }
      }

    } catch (error) {
      console.error('AudioProcessingReadableStream: Processing error:', error)
      
      if (this.controller && this.isActive) {
        this.controller.error(error)
      }
      
      this.cleanup()
    }
  }

  /**
   * Set up backpressure event handlers
   */
  private setupBackpressureHandlers(): void {
    this.backpressureController.addEventListener('backpressure-activated', (event) => {
      console.log('AudioProcessingReadableStream: Backpressure activated', event.data)
    })

    this.backpressureController.addEventListener('backpressure-deactivated', (event) => {
      console.log('AudioProcessingReadableStream: Backpressure deactivated', event.data)
    })

    this.backpressureController.addEventListener('circuit-opened', (event) => {
      console.warn('AudioProcessingReadableStream: Circuit breaker opened', event.data)
      
      if (this.controller && this.isActive) {
        this.controller.error(new Error('Circuit breaker opened due to processing errors'))
      }
    })
  }

  /**
   * Get estimated size of audio chunk
   */
  private getChunkSize(audioData: Buffer | ArrayBuffer | Uint8Array): number {
    if (audioData instanceof Buffer) {
      return audioData.length
    } else if (audioData instanceof ArrayBuffer) {
      return audioData.byteLength
    } else if (audioData instanceof Uint8Array) {
      return audioData.byteLength
    }
    return 1024 // Default estimate
  }

  /**
   * Get stream metrics
   */
  getMetrics(): {
    chunksProcessed: number
    isActive: boolean
    backpressureMetrics: ReturnType<WebSocketBackpressureController['getMetrics']>
  } {
    return {
      chunksProcessed: this.chunkCounter,
      isActive: this.isActive,
      backpressureMetrics: this.backpressureController.getMetrics()
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.isActive = false
    this.controller = null
    this.backpressureController.destroy()
  }
}

/**
 * Audio Processing Writable Stream
 * 
 * Provides a WritableStream interface for consuming processed audio chunks
 * with backpressure support.
 */
export class AudioProcessingWritableStream extends WritableStream<AudioStreamChunk> {
  private backpressureController: WebSocketBackpressureController
  private processedChunks: AudioStreamChunk[] = []
  private onChunkProcessed?: (chunk: AudioStreamChunk) => void

  constructor(
    private config: StreamConfig = {},
    onChunkProcessed?: (chunk: AudioStreamChunk) => void
  ) {
    const mergedConfig = { ...DEFAULT_STREAM_CONFIG, ...config }
    
    super({
      start: () => {
        console.log('AudioProcessingWritableStream: Started')
      },

      write: async (chunk) => {
        await this.processChunk(chunk)
      },

      close: () => {
        console.log('AudioProcessingWritableStream: Closed')
        this.cleanup()
      },

      abort: (reason) => {
        console.log('AudioProcessingWritableStream: Aborted:', reason)
        this.cleanup()
      }
    })

    this.onChunkProcessed = onChunkProcessed

    // Initialize backpressure controller for output processing
    this.backpressureController = new WebSocketBackpressureController({
      maxBufferSize: 20,
      maxBufferMemory: 2 * 1024 * 1024, // 2MB for output
      processingDelay: 25, // Fast output processing
      ...mergedConfig.backpressureConfig
    })
  }

  /**
   * Process incoming chunk
   */
  private async processChunk(chunk: AudioStreamChunk): Promise<void> {
    // Add to processed chunks with backpressure control
    const chunkData = new Uint8Array(0) // Placeholder for chunk serialization
    const enqueued = await this.backpressureController.enqueue(chunkData, 1024)

    if (enqueued) {
      this.processedChunks.push(chunk)

      // Notify listener if provided
      if (this.onChunkProcessed) {
        try {
          this.onChunkProcessed(chunk)
        } catch (error) {
          console.error('AudioProcessingWritableStream: Error in chunk processed callback:', error)
        }
      }

      console.log(`AudioProcessingWritableStream: Processed chunk ${chunk.chunkIndex}`, {
        isLast: chunk.isLast,
        confidence: chunk.metadata?.confidence
      })
    } else {
      throw new Error('Backpressure: Unable to process chunk due to buffer overflow')
    }
  }

  /**
   * Get processed chunks
   */
  getProcessedChunks(): AudioStreamChunk[] {
    return [...this.processedChunks]
  }

  /**
   * Get processing metrics
   */
  getMetrics(): {
    chunksWritten: number
    backpressureMetrics: ReturnType<WebSocketBackpressureController['getMetrics']>
  } {
    return {
      chunksWritten: this.processedChunks.length,
      backpressureMetrics: this.backpressureController.getMetrics()
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.backpressureController.destroy()
  }
}

/**
 * Transform Stream for Audio Processing Pipeline
 * 
 * Combines ReadableStream and WritableStream to create a complete
 * processing pipeline with backpressure support.
 */
export class AudioProcessingTransformStream extends TransformStream<ArrayBuffer, AudioStreamChunk> {
  private chunkIndex = 0
  private backpressureController: WebSocketBackpressureController

  constructor(
    private processor: StreamProcessor,
    private config: StreamConfig = {}
  ) {
    const mergedConfig = { ...DEFAULT_STREAM_CONFIG, ...config }

    super({
      start: () => {
        console.log('AudioProcessingTransformStream: Started')
      },

      transform: async (chunk, controller) => {
        await this.transformChunk(chunk, controller)
      },

      flush: async () => {
        console.log('AudioProcessingTransformStream: Flushing')
        // Process any remaining data
      }
    })

    this.backpressureController = new WebSocketBackpressureController({
      maxBufferSize: 25,
      maxBufferMemory: 3 * 1024 * 1024, // 3MB for transform
      processingDelay: 75,
      ...mergedConfig.backpressureConfig
    })
  }

  /**
   * Transform audio chunk
   */
  private async transformChunk(
    chunk: ArrayBuffer,
    controller: TransformStreamDefaultController<AudioStreamChunk>
  ): Promise<void> {
    // Check backpressure before processing
    const enqueued = await this.backpressureController.enqueue(chunk, chunk.byteLength)

    if (!enqueued) {
      throw new Error('Transform stream backpressure: Cannot process chunk')
    }

    try {
      // Create audio stream chunk
      const audioChunk: AudioStreamChunk = {
        audioData: chunk,
        chunkIndex: this.chunkIndex++,
        timestamp: Date.now(),
        isLast: false // Will be determined by stream end
      }

      // Process the chunk
      const result = await this.processor(audioChunk)

      // Add processing result to metadata
      audioChunk.metadata = {
        confidence: result.confidence,
        originalSize: chunk.byteLength
      }

      // Enqueue the processed chunk
      controller.enqueue(audioChunk)

    } catch (error) {
      console.error('AudioProcessingTransformStream: Transform error:', error)
      controller.error(error)
    }
  }

  /**
   * Get transform metrics
   */
  getMetrics(): {
    chunksTransformed: number
    backpressureMetrics: ReturnType<WebSocketBackpressureController['getMetrics']>
  } {
    return {
      chunksTransformed: this.chunkIndex,
      backpressureMetrics: this.backpressureController.getMetrics()
    }
  }
}

/**
 * Factory function to create a complete audio processing pipeline
 */
export function createAudioProcessingPipeline(
  processor: StreamProcessor,
  config: StreamConfig = {}
): {
  readable: AudioProcessingReadableStream
  writable: AudioProcessingWritableStream
  transform: AudioProcessingTransformStream
} {
  return {
    readable: new AudioProcessingReadableStream(processor, config),
    writable: new AudioProcessingWritableStream(config),
    transform: new AudioProcessingTransformStream(processor, config)
  }
}

/**
 * Utility function to pipe audio data through the processing pipeline
 */
export async function processAudioStream(
  audioData: Buffer,
  processor: StreamProcessor,
  config: StreamConfig = {}
): Promise<AudioStreamChunk[]> {
  const results: AudioStreamChunk[] = []
  const pipeline = createAudioProcessingPipeline(processor, config)

  // Set up result collection
  const writer = pipeline.writable.getWriter()
  const reader = pipeline.readable.getReader()

  try {
    // Process audio in chunks
    const chunkSize = config.chunkSize || 32 * 1024
    const chunks = Math.ceil(audioData.length / chunkSize)

    // Start reading processed chunks
    const readPromise = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          results.push(value)
          await writer.write(value)
        }
      } catch (error) {
        console.error('Error reading from pipeline:', error)
      }
    })()

    // Feed audio chunks to readable stream
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, audioData.length)
      const chunk = audioData.subarray(start, end)
      const isLast = i === chunks - 1

      const success = await pipeline.readable.enqueueAudioChunk(chunk, isLast)
      if (!success) {
        throw new Error(`Failed to enqueue chunk ${i} due to backpressure`)
      }
    }

    // Wait for all processing to complete
    await readPromise
    await writer.close()

    return results

  } catch (error) {
    console.error('Audio stream processing error:', error)
    throw error
  } finally {
    // Cleanup
    reader.releaseLock()
    writer.releaseLock()
  }
}

/**
 * Export all interfaces for external use
 */
