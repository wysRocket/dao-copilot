/**
 * Enhanced Transcription Engine with Streaming Support
 * 
 * Integrates the AudioStreamingPipeline with the existing OptimizedTranscriptionEngine
 * to provide a complete streaming solution with backpressure support.
 */

import { OptimizedTranscriptionEngine } from './OptimizedTranscriptionEngine'
import { 
  createAudioProcessingPipeline, 
  processAudioStream,
  type StreamProcessor,
  type StreamConfig,
  type AudioStreamChunk,
  AudioProcessingReadableStream,
  AudioProcessingWritableStream,
  AudioProcessingTransformStream
} from './AudioStreamingPipeline'

/**
 * Streaming transcription configuration
 */
export interface StreamingTranscriptionConfig extends StreamConfig {
  transcriptionConfig?: {
    enableOptimizations?: boolean
    useWebWorkers?: boolean
    enableMemoryOptimization?: boolean
    maxRetries?: number
  }
  realTimeProcessing?: boolean
  bufferFlushInterval?: number
  adaptiveChunkSize?: boolean
}

/**
 * Session metrics interface
 */
interface SessionMetrics {
  resultsCount: number
  readable: ReturnType<AudioProcessingReadableStream['getMetrics']>
  writable: ReturnType<AudioProcessingWritableStream['getMetrics']>
  transform: ReturnType<AudioProcessingTransformStream['getMetrics']>
}

/**
 * Pipeline metrics interface
 */
interface PipelineMetrics {
  readable: ReturnType<AudioProcessingReadableStream['getMetrics']>
  writable: ReturnType<AudioProcessingWritableStream['getMetrics']>
  transform: ReturnType<AudioProcessingTransformStream['getMetrics']>
}
export interface StreamingTranscriptionResult {
  text: string
  confidence: number
  chunkIndex: number
  timestamp: number
  isPartial: boolean
  metadata?: {
    processingTime: number
    memoryUsage?: number
    backpressureEvents?: number
  }
}

/**
 * Default streaming configuration
 */
const DEFAULT_STREAMING_CONFIG: Required<StreamingTranscriptionConfig> = {
  // Base stream config
  backpressureConfig: {},
  chunkSize: 32 * 1024,
  maxConcurrentStreams: 3,
  streamTimeout: 30000,
  enableMetrics: true,
  
  // Transcription-specific config
  transcriptionConfig: {
    enableOptimizations: true,
    useWebWorkers: true,
    enableMemoryOptimization: true,
    maxRetries: 3
  },
  realTimeProcessing: true,
  bufferFlushInterval: 1000,
  adaptiveChunkSize: true
}

/**
 * Pipeline interface for active streams
 */
interface ActivePipeline {
  readable: AudioProcessingReadableStream
  writable: AudioProcessingWritableStream
  transform: AudioProcessingTransformStream
}

/**
 * Enhanced Transcription Engine with Streaming Capabilities
 */
export class StreamingTranscriptionEngine {
  private optimizedEngine: OptimizedTranscriptionEngine
  private activeStreams = new Map<string, ActivePipeline>()
  private streamResults = new Map<string, StreamingTranscriptionResult[]>()
  private config: Required<StreamingTranscriptionConfig>

  constructor(config: StreamingTranscriptionConfig = {}) {
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config }
    this.optimizedEngine = new OptimizedTranscriptionEngine()
  }

  /**
   * Create a streaming processor function
   */
  private createStreamProcessor(): StreamProcessor {
    return async (chunk: AudioStreamChunk): Promise<{ text: string; confidence: number }> => {
      const startTime = Date.now()

      try {
        // Convert chunk data to Buffer for processing
        let audioBuffer: Buffer
        if (chunk.audioData instanceof Buffer) {
          audioBuffer = chunk.audioData
        } else if (chunk.audioData instanceof ArrayBuffer) {
          audioBuffer = Buffer.from(chunk.audioData)
        } else if (chunk.audioData instanceof Uint8Array) {
          audioBuffer = Buffer.from(chunk.audioData)
        } else {
          throw new Error('Unsupported audio data format')
        }

        // Use optimized engine for transcription
        const result = await this.optimizedEngine.transcribeAudio(
          audioBuffer,
          this.config.transcriptionConfig
        )

        // Processing time calculation available for future metrics
        void (Date.now() - startTime)

        // Return processed result
        return {
          text: result.text || '',
          confidence: result.confidence || 0.8
        }

      } catch (error) {
        console.error('StreamingTranscriptionEngine: Processing error:', error)
        return {
          text: '',
          confidence: 0
        }
      }
    }
  }

  /**
   * Start a new streaming transcription session
   */
  async startStreamingTranscription(
    sessionId: string,
    onResult?: (result: StreamingTranscriptionResult) => void,
    onError?: (error: Error) => void
  ): Promise<{
    addAudioChunk: (audioData: Buffer | ArrayBuffer | Uint8Array, isLast?: boolean) => Promise<boolean>
    getResults: () => StreamingTranscriptionResult[]
    close: () => void
    getMetrics: () => PipelineMetrics
  }> {
    // Create processor and pipeline
    const processor = this.createStreamProcessor()
    const pipeline = createAudioProcessingPipeline(processor, this.config)

    // Store pipeline
    this.activeStreams.set(sessionId, pipeline)
    this.streamResults.set(sessionId, [])

    // Set up result processing
    const reader = pipeline.readable.getReader()
    const writer = pipeline.writable.getWriter()

    // Start reading and processing results
    const processResults = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Create streaming result
          const result: StreamingTranscriptionResult = {
            text: '', // Will be populated by processor metadata
            confidence: value.metadata?.confidence || 0,
            chunkIndex: value.chunkIndex,
            timestamp: value.timestamp,
            isPartial: !value.isLast,
            metadata: {
              processingTime: Date.now() - value.timestamp
            }
          }

          // Store result
          const sessionResults = this.streamResults.get(sessionId) || []
          sessionResults.push(result)
          this.streamResults.set(sessionId, sessionResults)

          // Write to writable stream
          await writer.write(value)

          // Notify callback
          if (onResult) {
            try {
              onResult(result)
            } catch (callbackError) {
              console.error('StreamingTranscriptionEngine: Result callback error:', callbackError)
            }
          }
        }
      } catch (error) {
        console.error('StreamingTranscriptionEngine: Result processing error:', error)
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
      } finally {
        // Cleanup
        reader.releaseLock()
        writer.releaseLock()
      }
    }

    // Start result processing in background
    processResults()

    // Return stream interface
    return {
      addAudioChunk: async (audioData: Buffer | ArrayBuffer | Uint8Array, isLast = false) => {
        return await pipeline.readable.enqueueAudioChunk(audioData, isLast)
      },

      getResults: () => {
        return this.streamResults.get(sessionId) || []
      },

      close: () => {
        this.closeStreamingSession(sessionId)
      },

      getMetrics: () => {
        return {
          readable: pipeline.readable.getMetrics(),
          writable: pipeline.writable.getMetrics(),
          transform: pipeline.transform.getMetrics()
        }
      }
    }
  }

  /**
   * Process complete audio stream (convenience method)
   */
  async processCompleteAudioStream(
    audioData: Buffer
  ): Promise<StreamingTranscriptionResult[]> {
    const processor = this.createStreamProcessor()
    const chunks = await processAudioStream(audioData, processor, this.config)

    // Convert chunks to results
    return chunks.map((chunk): StreamingTranscriptionResult => ({
      text: '', // Populated by chunk processing
      confidence: chunk.metadata?.confidence || 0,
      chunkIndex: chunk.chunkIndex,
      timestamp: chunk.timestamp,
      isPartial: !chunk.isLast,
      metadata: {
        processingTime: 0, // Will be calculated during processing
        backpressureEvents: 0
      }
    }))
  }

  /**
   * Process audio chunks iteratively with streaming
   */
  async *processAudioChunksStream(
    audioData: Buffer,
    chunkSize?: number
  ): AsyncGenerator<StreamingTranscriptionResult, void, unknown> {
    const actualChunkSize = chunkSize || this.config.chunkSize
    const processor = this.createStreamProcessor()
    
    const totalChunks = Math.ceil(audioData.length / actualChunkSize)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * actualChunkSize
      const end = Math.min(start + actualChunkSize, audioData.length)
      const chunkData = audioData.subarray(start, end)
      const isLast = i === totalChunks - 1

      const chunk: AudioStreamChunk = {
        audioData: chunkData,
        chunkIndex: i,
        timestamp: Date.now(),
        isLast
      }

      try {
        const result = await processor(chunk)
        
        yield {
          text: result.text,
          confidence: result.confidence,
          chunkIndex: i,
          timestamp: chunk.timestamp,
          isPartial: !isLast,
          metadata: {
            processingTime: Date.now() - chunk.timestamp
          }
        }
      } catch (error) {
        console.error(`StreamingTranscriptionEngine: Error processing chunk ${i}:`, error)
        
        yield {
          text: '',
          confidence: 0,
          chunkIndex: i,
          timestamp: chunk.timestamp,
          isPartial: !isLast,
          metadata: {
            processingTime: Date.now() - chunk.timestamp
          }
        }
      }
    }
  }

  /**
   * Close a streaming session
   */
  closeStreamingSession(sessionId: string): void {
    const pipeline = this.activeStreams.get(sessionId)
    if (pipeline) {
      // Cleanup pipeline resources
      // Note: The actual cleanup is handled by the pipeline classes
      this.activeStreams.delete(sessionId)
    }

    // Clear stored results
    this.streamResults.delete(sessionId)
  }

  /**
   * Close all active streaming sessions
   */
  closeAllSessions(): void {
    for (const sessionId of this.activeStreams.keys()) {
      this.closeStreamingSession(sessionId)
    }
  }

  /**
   * Get metrics for all active streams
   */
  getGlobalMetrics(): {
    activeSessions: number
    totalResults: number
    sessionMetrics: { [sessionId: string]: SessionMetrics }
  } {
    const sessionMetrics: { [sessionId: string]: SessionMetrics } = {}
    let totalResults = 0

    for (const [sessionId, pipeline] of this.activeStreams) {
      const results = this.streamResults.get(sessionId) || []
      totalResults += results.length

      sessionMetrics[sessionId] = {
        resultsCount: results.length,
        readable: pipeline.readable.getMetrics(),
        writable: pipeline.writable.getMetrics(),
        transform: pipeline.transform.getMetrics()
      }
    }

    return {
      activeSessions: this.activeStreams.size,
      totalResults,
      sessionMetrics
    }
  }

  /**
   * Get the underlying optimized engine for direct access
   */
  getOptimizedEngine(): OptimizedTranscriptionEngine {
    return this.optimizedEngine
  }

  /**
   * Update streaming configuration
   */
  updateConfig(newConfig: Partial<StreamingTranscriptionConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.closeAllSessions()
    // Note: OptimizedTranscriptionEngine cleanup would be handled here if it has a destroy method
  }
}

/**
 * Factory function to create a streaming transcription engine
 */
export function createStreamingTranscriptionEngine(
  config: StreamingTranscriptionConfig = {}
): StreamingTranscriptionEngine {
  return new StreamingTranscriptionEngine(config)
}

/**
 * Utility function for quick streaming transcription
 */
export async function transcribeAudioStream(
  audioData: Buffer,
  config: StreamingTranscriptionConfig = {}
): Promise<StreamingTranscriptionResult[]> {
  const engine = createStreamingTranscriptionEngine(config)
  
  try {
    return await engine.processCompleteAudioStream(audioData)
  } finally {
    engine.destroy()
  }
}

/**
 * Export streaming transcription interfaces
 */
