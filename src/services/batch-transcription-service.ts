/**
 * Batch Transcription Service
 *
 * High-performance batch transcription service with parallel processing,
 * caching, audio normalization, and comprehensive error handling.
 */

import {promises as fs} from 'fs'
import {join} from 'path'
import {GoogleGenAI} from '@google/genai'
import {createHash} from 'crypto'
import {TranscriptionMode} from './gemini-live-integration'
import {transcribeAudio, TranscriptionResult} from './main-stt-transcription'
import {ProxyTranscriptionResult} from './proxy-stt-transcription'
import {AudioFormatConverter} from './audio-format-converter'
import {createAudioChunker} from './audio-chunker'

export interface BatchTranscriptionConfig {
  // Core Configuration
  maxConcurrentFiles: number
  maxConcurrentChunks: number
  chunkSizeMs: number
  cacheEnabled: boolean
  cacheDirectory: string

  // Performance Settings
  useParallelProcessing: boolean
  enableCompression: boolean
  enableAudioNormalization: boolean
  enableVoiceActivityDetection: boolean

  // Model Configuration
  primaryModel: string
  fallbackModel: string
  useWebSocketForShortFiles: boolean
  shortFileThresholdMs: number

  // Quality Settings
  targetSampleRate: number
  targetChannels: number
  targetBitDepth: number

  // Retry and Error Handling
  maxRetries: number
  retryDelayMs: number
  timeoutMs: number

  // Output Settings
  outputFormat: 'json' | 'text' | 'srt' | 'vtt'
  includeTimestamps: boolean
  includeConfidenceScores: boolean
}

export interface BatchTranscriptionResult {
  success: boolean
  filePath: string
  originalSize: number
  processedSize: number
  duration: number
  transcription?: TranscriptionResult | ProxyTranscriptionResult
  error?: string
  metadata: {
    chunks: number
    fromCache: boolean
    processingTime: number
    model: string
    audioFormat: {
      originalSampleRate: number
      originalChannels: number
      processedSampleRate: number
      processedChannels: number
    }
  }
}

export interface BatchJobResult {
  jobId: string
  totalFiles: number
  successfulFiles: number
  failedFiles: number
  totalDuration: number
  results: BatchTranscriptionResult[]
  startTime: number
  endTime: number
  performance: {
    averageFileProcessingTime: number
    throughputFilesPerSecond: number
    cacheHitRate: number
    parallelismEfficiency: number
  }
}

/**
 * Audio file cache for storing transcription results
 */
class TranscriptionCache {
  private cacheDir: string

  constructor(cacheDirectory: string) {
    this.cacheDir = cacheDirectory
  }

  /**
   * Generate cache key for an audio file
   */
  async generateCacheKey(filePath: string): Promise<string> {
    const stats = await fs.stat(filePath)
    const fileHash = createHash('sha256')
    fileHash.update(filePath)
    fileHash.update(stats.mtime.toISOString())
    fileHash.update(stats.size.toString())
    return fileHash.digest('hex')
  }

  /**
   * Get cached transcription result
   */
  async get(cacheKey: string): Promise<TranscriptionResult | null> {
    try {
      const cacheFilePath = join(this.cacheDir, `${cacheKey}.json`)
      const cacheData = await fs.readFile(cacheFilePath, 'utf-8')
      return JSON.parse(cacheData)
    } catch {
      return null
    }
  }

  /**
   * Store transcription result in cache
   */
  async set(cacheKey: string, result: TranscriptionResult): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, {recursive: true})
      const cacheFilePath = join(this.cacheDir, `${cacheKey}.json`)
      await fs.writeFile(cacheFilePath, JSON.stringify(result, null, 2))
    } catch (error) {
      console.warn('Failed to cache transcription result:', error)
    }
  }

  /**
   * Clear cache
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir)
      await Promise.all(files.map(file => fs.unlink(join(this.cacheDir, file))))
    } catch (error) {
      console.warn('Failed to clear cache:', error)
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number
    totalSize: number
    oldestEntry: Date | null
    newestEntry: Date | null
  }> {
    try {
      const files = await fs.readdir(this.cacheDir)
      const stats = await Promise.all(
        files.map(async file => {
          const filePath = join(this.cacheDir, file)
          const stat = await fs.stat(filePath)
          return {size: stat.size, mtime: stat.mtime}
        })
      )

      return {
        totalEntries: files.length,
        totalSize: stats.reduce((sum, stat) => sum + stat.size, 0),
        oldestEntry:
          stats.length > 0 ? new Date(Math.min(...stats.map(s => s.mtime.getTime()))) : null,
        newestEntry:
          stats.length > 0 ? new Date(Math.max(...stats.map(s => s.mtime.getTime()))) : null
      }
    } catch {
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null
      }
    }
  }
}

/**
 * Audio normalizer for consistent quality processing
 */
class AudioNormalizer {
  private config: BatchTranscriptionConfig

  constructor(config: BatchTranscriptionConfig) {
    this.config = config
  }

  /**
   * Normalize audio file for optimal transcription
   */
  async normalizeAudio(
    inputPath: string,
    outputPath: string
  ): Promise<{
    originalSize: number
    processedSize: number
    originalFormat: {sampleRate: number; channels: number; bitDepth: number}
    processedFormat: {sampleRate: number; channels: number; bitDepth: number}
  }> {
    const converter = new AudioFormatConverter()

    // Get original file stats
    const originalStats = await fs.stat(inputPath)
    const originalSize = originalStats.size

    // Analyze original format
    const audioBuffer = await fs.readFile(inputPath)
    const originalFormat = await converter.analyzeAudioFormat(audioBuffer)

    // Convert to optimal format for transcription
    const normalizedBuffer = await converter.convertToFormat(audioBuffer, {
      sampleRate: this.config.targetSampleRate,
      channels: this.config.targetChannels,
      bitDepth: this.config.targetBitDepth,
      format: 'wav'
    })

    // Write normalized audio
    await fs.writeFile(outputPath, normalizedBuffer)
    const processedStats = await fs.stat(outputPath)

    return {
      originalSize,
      processedSize: processedStats.size,
      originalFormat: {
        sampleRate: originalFormat.sampleRate || 44100,
        channels: originalFormat.channels || 2,
        bitDepth: originalFormat.bitDepth || 16
      },
      processedFormat: {
        sampleRate: this.config.targetSampleRate,
        channels: this.config.targetChannels,
        bitDepth: this.config.targetBitDepth
      }
    }
  }
}

/**
 * Main batch transcription service
 */
export class BatchTranscriptionService {
  private config: BatchTranscriptionConfig
  private cache: TranscriptionCache
  private normalizer: AudioNormalizer
  private genAI: GoogleGenAI

  constructor(config: Partial<BatchTranscriptionConfig> = {}) {
    this.config = {
      // Default configuration
      maxConcurrentFiles: 3,
      maxConcurrentChunks: 5,
      chunkSizeMs: 30000, // 30 seconds
      cacheEnabled: true,
      cacheDirectory: './transcription-cache',

      useParallelProcessing: true,
      enableCompression: false,
      enableAudioNormalization: true,
      enableVoiceActivityDetection: false,

      primaryModel: 'gemini-live-2.5-flash-preview',
      fallbackModel: 'gemini-live-2.5-flash-preview',
      useWebSocketForShortFiles: true,
      shortFileThresholdMs: 30000, // 30 seconds

      targetSampleRate: 16000,
      targetChannels: 1,
      targetBitDepth: 16,

      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 60000,

      outputFormat: 'json',
      includeTimestamps: true,
      includeConfidenceScores: true,

      ...config
    }

    this.cache = new TranscriptionCache(this.config.cacheDirectory)
    this.normalizer = new AudioNormalizer(this.config)

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('Google API Key is required for batch transcription')
    }
    this.genAI = new GoogleGenAI({apiKey})
  }

  /**
   * Transcribe multiple audio files in batch
   */
  async transcribeBatch(audioFiles: string[]): Promise<BatchJobResult> {
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const startTime = Date.now()

    console.log(`Starting batch transcription job: ${jobId}`)
    console.log(
      `Processing ${audioFiles.length} files with max concurrency: ${this.config.maxConcurrentFiles}`
    )

    const results: BatchTranscriptionResult[] = []
    let successfulFiles = 0
    let failedFiles = 0

    if (this.config.useParallelProcessing) {
      // Process files in parallel with concurrency limit
      const processPromises = audioFiles.map(async filePath => {
        try {
          const result = await this.transcribeFile(filePath)
          if (result.success) {
            successfulFiles++
          } else {
            failedFiles++
          }
          results.push(result)
        } catch (error) {
          failedFiles++
          results.push({
            success: false,
            filePath,
            originalSize: 0,
            processedSize: 0,
            duration: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              chunks: 0,
              fromCache: false,
              processingTime: 0,
              model: this.config.primaryModel,
              audioFormat: {
                originalSampleRate: 0,
                originalChannels: 0,
                processedSampleRate: 0,
                processedChannels: 0
              }
            }
          })
        }
      })

      // Execute with concurrency limit
      await this.executeConcurrently(processPromises, this.config.maxConcurrentFiles)
    } else {
      // Process files sequentially
      for (const filePath of audioFiles) {
        try {
          const result = await this.transcribeFile(filePath)
          if (result.success) {
            successfulFiles++
          } else {
            failedFiles++
          }
          results.push(result)
        } catch (error) {
          failedFiles++
          results.push({
            success: false,
            filePath,
            originalSize: 0,
            processedSize: 0,
            duration: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              chunks: 0,
              fromCache: false,
              processingTime: 0,
              model: this.config.primaryModel,
              audioFormat: {
                originalSampleRate: 0,
                originalChannels: 0,
                processedSampleRate: 0,
                processedChannels: 0
              }
            }
          })
        }
      }
    }

    const endTime = Date.now()
    const totalDuration = endTime - startTime

    // Calculate performance metrics
    const cacheHits = results.filter(r => r.metadata.fromCache).length
    const cacheHitRate = results.length > 0 ? cacheHits / results.length : 0
    const averageFileProcessingTime =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.metadata.processingTime, 0) / results.length
        : 0
    const throughputFilesPerSecond = totalDuration > 0 ? (results.length / totalDuration) * 1000 : 0

    // Calculate parallelism efficiency (actual vs theoretical max)
    const theoreticalMinTime = Math.max(...results.map(r => r.metadata.processingTime))
    const parallelismEfficiency = theoreticalMinTime > 0 ? theoreticalMinTime / totalDuration : 0

    return {
      jobId,
      totalFiles: audioFiles.length,
      successfulFiles,
      failedFiles,
      totalDuration,
      results,
      startTime,
      endTime,
      performance: {
        averageFileProcessingTime,
        throughputFilesPerSecond,
        cacheHitRate,
        parallelismEfficiency
      }
    }
  }

  /**
   * Transcribe a single audio file
   */
  async transcribeFile(filePath: string): Promise<BatchTranscriptionResult> {
    const fileStartTime = Date.now()
    console.log(`Processing file: ${filePath}`)

    try {
      // Get original file stats
      const originalStats = await fs.stat(filePath)
      const originalSize = originalStats.size

      // Check cache if enabled
      let cacheKey: string | null = null
      if (this.config.cacheEnabled) {
        cacheKey = await this.cache.generateCacheKey(filePath)
        const cachedResult = await this.cache.get(cacheKey)

        if (cachedResult) {
          console.log(`Cache hit for file: ${filePath}`)
          return {
            success: true,
            filePath,
            originalSize,
            processedSize: originalSize,
            duration: 0,
            transcription: cachedResult,
            metadata: {
              chunks: 1,
              fromCache: true,
              processingTime: Date.now() - fileStartTime,
              model: cachedResult.source || this.config.primaryModel,
              audioFormat: {
                originalSampleRate: 0,
                originalChannels: 0,
                processedSampleRate: this.config.targetSampleRate,
                processedChannels: this.config.targetChannels
              }
            }
          }
        }
      }

      // Determine processing strategy based on file size and configuration
      const audioBuffer = await fs.readFile(filePath)
      const estimatedDurationMs = this.estimateAudioDuration(audioBuffer)

      let transcriptionResult: TranscriptionResult | ProxyTranscriptionResult
      let audioFormat = {
        originalSampleRate: 44100,
        originalChannels: 2,
        processedSampleRate: this.config.targetSampleRate,
        processedChannels: this.config.targetChannels
      }

      if (
        this.config.useWebSocketForShortFiles &&
        estimatedDurationMs <= this.config.shortFileThresholdMs
      ) {
        // Use WebSocket for short files
        console.log(`Using WebSocket for short file: ${filePath} (${estimatedDurationMs}ms)`)
        transcriptionResult = await this.transcribeWithRetry(() =>
          transcribeAudio(audioBuffer, {
            modelName: this.config.primaryModel,
            mode: TranscriptionMode.WEBSOCKET,
            enableWebSocket: true,
            fallbackToBatch: true
          })
        )
      } else if (estimatedDurationMs <= this.config.chunkSizeMs) {
        // Process entire file as single chunk
        console.log(`Processing as single chunk: ${filePath}`)

        let processedBuffer = audioBuffer
        let processedSize = originalSize

        if (this.config.enableAudioNormalization) {
          const tempPath = `${filePath}.normalized.wav`
          const normalizationResult = await this.normalizer.normalizeAudio(filePath, tempPath)
          processedBuffer = await fs.readFile(tempPath)
          processedSize = normalizationResult.processedSize
          audioFormat = {
            originalSampleRate: normalizationResult.originalFormat.sampleRate,
            originalChannels: normalizationResult.originalFormat.channels,
            processedSampleRate: normalizationResult.processedFormat.sampleRate,
            processedChannels: normalizationResult.processedFormat.channels
          }

          // Clean up temp file
          await fs.unlink(tempPath).catch(() => {})
        }

        transcriptionResult = await this.transcribeWithRetry(() =>
          transcribeAudio(processedBuffer, {
            modelName: this.config.primaryModel,
            mode: TranscriptionMode.BATCH,
            enableWebSocket: false
          })
        )
      } else {
        // Process large file in chunks
        console.log(`Processing large file in chunks: ${filePath}`)
        transcriptionResult = await this.transcribeFileInChunks(filePath, audioBuffer)
      }

      // Cache result if enabled
      if (this.config.cacheEnabled && cacheKey && transcriptionResult) {
        await this.cache.set(cacheKey, transcriptionResult as TranscriptionResult)
      }

      const processingTime = Date.now() - fileStartTime
      console.log(`Completed processing: ${filePath} in ${processingTime}ms`)

      return {
        success: true,
        filePath,
        originalSize,
        processedSize: originalSize, // TODO: Update with actual processed size
        duration: transcriptionResult.duration,
        transcription: transcriptionResult,
        metadata: {
          chunks: 1, // TODO: Update with actual chunk count
          fromCache: false,
          processingTime,
          model: transcriptionResult.source || this.config.primaryModel,
          audioFormat
        }
      }
    } catch (error) {
      const processingTime = Date.now() - fileStartTime
      console.error(`Failed to process file: ${filePath}`, error)

      return {
        success: false,
        filePath,
        originalSize: 0,
        processedSize: 0,
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          chunks: 0,
          fromCache: false,
          processingTime,
          model: this.config.primaryModel,
          audioFormat: {
            originalSampleRate: 0,
            originalChannels: 0,
            processedSampleRate: 0,
            processedChannels: 0
          }
        }
      }
    }
  }

  /**
   * Process large files in chunks
   */
  private async transcribeFileInChunks(
    filePath: string,
    audioBuffer: Buffer
  ): Promise<TranscriptionResult> {
    console.log(`Chunking large file: ${filePath}`)

    const chunker = createAudioChunker({
      chunkSize: Math.floor((this.config.chunkSizeMs * this.config.targetSampleRate) / 1000),
      sampleRate: this.config.targetSampleRate,
      channels: this.config.targetChannels,
      format: 'float32',
      enableStreaming: false
    })

    chunker.loadBuffer(audioBuffer.buffer as ArrayBuffer)

    const chunks: string[] = []
    const chunkPromises: Promise<TranscriptionResult>[] = []
    let chunkIndex = 0

    // Process chunks with concurrency limit
    for await (const chunk of chunker.chunks()) {
      const chunkBuffer = Buffer.from(chunk.chunk)

      const chunkPromise = this.transcribeWithRetry(() =>
        transcribeAudio(chunkBuffer, {
          modelName: this.config.primaryModel,
          mode: TranscriptionMode.BATCH,
          enableWebSocket: false
        })
      )

      chunkPromises.push(chunkPromise)
      chunkIndex++

      // Process chunks in batches to avoid overwhelming the API
      if (chunkPromises.length >= this.config.maxConcurrentChunks) {
        const results = await Promise.all(chunkPromises)
        chunks.push(...results.map(r => r.text))
        chunkPromises.length = 0
      }
    }

    // Process remaining chunks
    if (chunkPromises.length > 0) {
      const results = await Promise.all(chunkPromises)
      chunks.push(...results.map(r => r.text))
    }

    // Combine chunk results
    const combinedText = chunks.join(' ').trim()
    const totalDuration = chunks.length * 1000 // Rough estimate

    return {
      text: combinedText,
      duration: totalDuration,
      source: 'batch-chunked'
    }
  }

  /**
   * Execute promises with concurrency limit
   */
  private async executeConcurrently<T>(promises: Promise<T>[], concurrency: number): Promise<T[]> {
    const results: T[] = []
    const executing: Promise<void>[] = []

    for (const promise of promises) {
      const p = promise.then(result => {
        results.push(result)
      })

      executing.push(p)

      if (executing.length >= concurrency) {
        await Promise.race(executing)
        executing.splice(
          executing.findIndex(p => p),
          1
        )
      }
    }

    await Promise.all(executing)
    return results
  }

  /**
   * Retry wrapper for transcription with exponential backoff
   */
  private async transcribeWithRetry<T>(transcribeFn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await transcribeFn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        if (attempt === this.config.maxRetries) {
          break
        }

        const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1)
        console.warn(
          `Transcription attempt ${attempt} failed, retrying in ${delay}ms:`,
          lastError.message
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }

  /**
   * Estimate audio duration from buffer
   */
  private estimateAudioDuration(audioBuffer: Buffer): number {
    // Rough estimation based on common audio formats
    // For WAV: duration ≈ (file_size - header_size) / (sample_rate * channels * bytes_per_sample)
    const assumedSampleRate = 44100
    const assumedChannels = 2
    const assumedBytesPerSample = 2
    const headerSize = 44 // WAV header size

    const dataSize = Math.max(0, audioBuffer.length - headerSize)
    const samples = dataSize / (assumedChannels * assumedBytesPerSample)
    const durationSeconds = samples / assumedSampleRate

    return durationSeconds * 1000 // Convert to milliseconds
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return this.cache.getStats()
  }

  /**
   * Clear transcription cache
   */
  async clearCache() {
    return this.cache.clear()
  }

  /**
   * Export batch results to different formats
   */
  async exportResults(results: BatchJobResult, outputPath: string): Promise<void> {
    switch (this.config.outputFormat) {
      case 'json':
        await fs.writeFile(outputPath, JSON.stringify(results, null, 2))
        break

      case 'text': {
        const textResults = results.results
          .filter(r => r.success && r.transcription)
          .map(r => `${r.filePath}: ${r.transcription!.text}`)
          .join('\n\n')
        await fs.writeFile(outputPath, textResults)
        break
      }

      case 'srt':
        // TODO: Implement SRT format with timestamps
        throw new Error('SRT format not yet implemented')

      case 'vtt':
        // TODO: Implement VTT format with timestamps
        throw new Error('VTT format not yet implemented')

      default:
        throw new Error(`Unsupported output format: ${this.config.outputFormat}`)
    }
  }
}

/**
 * Factory function for creating batch transcription service
 */
export function createBatchTranscriptionService(
  config: Partial<BatchTranscriptionConfig> = {}
): BatchTranscriptionService {
  return new BatchTranscriptionService(config)
}

/**
 * Quick batch transcription function for simple use cases
 */
export async function transcribeBatchFiles(
  audioFiles: string[],
  options: Partial<BatchTranscriptionConfig> = {}
): Promise<BatchJobResult> {
  const service = createBatchTranscriptionService(options)
  return service.transcribeBatch(audioFiles)
}
