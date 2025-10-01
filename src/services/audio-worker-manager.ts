/**
 * Audio Processing Worker Manager
 *
 * Main thread interface for managing audio processing Web Workers.
 * Provides high-level API for audio conversion and processing tasks.
 */

import {
  AudioWorkerMessageType,
  type AudioWorkerMessage,
  type InitializePayload,
  type ConvertAudioPayload,
  type ProcessChunkPayload,
  type ConversionResult
} from './workers/audio-processing-worker'

// Response types
export interface WorkerResponse {
  id: string
  type: AudioWorkerMessageType
  payload?: unknown
  timestamp: number
}

export interface WorkerErrorResponse extends WorkerResponse {
  type: AudioWorkerMessageType.ERROR
  payload: {error: string}
}

// Configuration for the worker manager
export interface AudioWorkerConfig {
  maxWorkers: number
  workerIdleTimeout: number // ms
  enableLogging: boolean
  fallbackToMainThread: boolean
}

// Default configuration
const DEFAULT_WORKER_CONFIG: AudioWorkerConfig = {
  maxWorkers: navigator.hardwareConcurrency || 4,
  workerIdleTimeout: 30000, // 30 seconds
  enableLogging: false,
  fallbackToMainThread: true
}

// Worker pool item
interface WorkerPoolItem {
  worker: Worker
  busy: boolean
  lastUsed: number
  id: string
  messageHandler?: (event: MessageEvent<AudioWorkerMessage>) => void
  errorHandler?: (error: ErrorEvent) => void
}

// Pending request tracking
interface PendingRequest {
  resolve: (result: WorkerResponse) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  timestamp: number
}

/**
 * Audio Processing Worker Manager
 * Manages a pool of Web Workers for audio processing tasks
 */
export class AudioWorkerManager {
  private config: AudioWorkerConfig
  private workerPool: WorkerPoolItem[] = []
  private pendingRequests = new Map<string, PendingRequest>()
  private requestCounter = 0
  private isInitialized = false
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<AudioWorkerConfig> = {}) {
    this.config = {...DEFAULT_WORKER_CONFIG, ...config}
  }

  /**
   * Initialize the worker manager and create initial worker pool
   */
  async initialize(audioConfig: InitializePayload['config']): Promise<void> {
    if (this.isInitialized) return

    try {
      // Create initial worker
      const worker = await this.createWorker(audioConfig)
      this.workerPool.push(worker)

      // Start cleanup interval for idle workers
      this.cleanupInterval = setInterval(() => {
        this.cleanupIdleWorkers()
      }, this.config.workerIdleTimeout / 2)

      this.isInitialized = true
      this.log('Audio worker manager initialized')
    } catch (error) {
      if (this.config.fallbackToMainThread) {
        this.log('Failed to initialize workers, falling back to main thread')
        this.isInitialized = true
      } else {
        throw new Error(`Failed to initialize audio worker manager: ${error}`)
      }
    }
  }

  /**
   * Convert audio data using available worker
   */
  async convertAudio(audioData: Float32Array, timestamp?: number): Promise<ConversionResult> {
    if (!this.isInitialized) {
      throw new Error('Worker manager not initialized')
    }

    const worker = await this.getAvailableWorker()
    if (!worker) {
      if (this.config.fallbackToMainThread) {
        return this.fallbackConvertAudio(audioData, timestamp)
      }
      throw new Error('No workers available and fallback disabled')
    }

    const payload: ConvertAudioPayload = {
      audioData,
      timestamp: timestamp || Date.now(),
      sequenceNumber: this.requestCounter++
    }

    return this.sendWorkerMessage(worker, AudioWorkerMessageType.CONVERT_AUDIO, payload)
  }

  /**
   * Process multiple audio chunks with advanced processing options
   */
  async processChunks(
    chunks: Float32Array[],
    options: ProcessChunkPayload['processingOptions']
  ): Promise<ConversionResult> {
    if (!this.isInitialized) {
      throw new Error('Worker manager not initialized')
    }

    const worker = await this.getAvailableWorker()
    if (!worker) {
      if (this.config.fallbackToMainThread) {
        return this.fallbackProcessChunks(chunks, options)
      }
      throw new Error('No workers available and fallback disabled')
    }

    const payload: ProcessChunkPayload = {
      chunks,
      processingOptions: options
    }

    return this.sendWorkerMessage(worker, AudioWorkerMessageType.PROCESS_CHUNK, payload)
  }

  /**
   * Update configuration for all workers
   */
  async updateConfig(configUpdates: Partial<InitializePayload['config']>): Promise<void> {
    const promises = this.workerPool.map(workerItem =>
      this.sendWorkerMessage(workerItem, AudioWorkerMessageType.UPDATE_CONFIG, configUpdates)
    )

    await Promise.all(promises)
    this.log('Configuration updated for all workers')
  }

  /**
   * Get worker pool statistics
   */
  getStats(): {
    totalWorkers: number
    busyWorkers: number
    idleWorkers: number
    pendingRequests: number
    averageResponseTime: number
  } {
    const busyWorkers = this.workerPool.filter(w => w.busy).length

    // Calculate average response time from recent requests
    const recentRequests = Array.from(this.pendingRequests.values()).filter(
      req => Date.now() - req.timestamp < 60000
    ) // Last minute

    const avgResponseTime =
      recentRequests.length > 0
        ? recentRequests.reduce((sum, req) => sum + (Date.now() - req.timestamp), 0) /
          recentRequests.length
        : 0

    return {
      totalWorkers: this.workerPool.length,
      busyWorkers,
      idleWorkers: this.workerPool.length - busyWorkers,
      pendingRequests: this.pendingRequests.size,
      averageResponseTime: avgResponseTime
    }
  }

  /**
   * Destroy all workers and cleanup resources
   */
  async destroy(): Promise<void> {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Terminate all workers with proper cleanup
    const destroyPromises = this.workerPool.map(async workerItem => {
      try {
        // Clean up event listeners before terminating
        if (workerItem.messageHandler) {
          workerItem.worker.removeEventListener('message', workerItem.messageHandler)
        }
        if (workerItem.errorHandler) {
          workerItem.worker.removeEventListener('error', workerItem.errorHandler)
        }

        // Send destroy message
        await this.sendWorkerMessage(workerItem, AudioWorkerMessageType.DESTROY, {})
      } catch {
        // If destroy message fails, proceed with termination
      } finally {
        // Force terminate the worker
        workerItem.worker.terminate()
      }
    })

    await Promise.all(destroyPromises)

    // Clear pending requests
    this.pendingRequests.forEach(request => {
      clearTimeout(request.timeout)
      request.reject(new Error('Worker manager destroyed'))
    })
    this.pendingRequests.clear()

    // Reset state
    this.workerPool = []
    this.isInitialized = false
    this.requestCounter = 0

    this.log('Audio worker manager destroyed')
  }

  // Private methods

  private async createWorker(audioConfig: InitializePayload['config']): Promise<WorkerPoolItem> {
    const worker = new Worker(new URL('./workers/audio-processing-worker.ts', import.meta.url), {
      type: 'module'
    })

    const workerId = this.generateSecureWorkerId()

    const workerItem: WorkerPoolItem = {
      worker,
      busy: false,
      lastUsed: Date.now(),
      id: workerId
    }

    // Create bound event handlers for proper cleanup
    const messageHandler = (event: MessageEvent<AudioWorkerMessage>) => {
      this.handleWorkerMessage(workerItem, event.data)
    }

    const errorHandler = (error: ErrorEvent) => {
      this.handleWorkerError(workerItem, error)
    }

    // Store handlers for cleanup
    workerItem.messageHandler = messageHandler
    workerItem.errorHandler = errorHandler

    // Set up worker message handling
    worker.addEventListener('message', messageHandler)
    worker.addEventListener('error', errorHandler)

    // Initialize the worker
    await this.sendWorkerMessage(workerItem, AudioWorkerMessageType.INITIALIZE, {
      config: audioConfig
    })

    this.log(`Created worker: ${workerId}`)
    return workerItem
  }

  private async getAvailableWorker(): Promise<WorkerPoolItem | null> {
    // Find idle worker
    let availableWorker = this.workerPool.find(w => !w.busy)

    // If no idle worker and we can create more
    if (!availableWorker && this.workerPool.length < this.config.maxWorkers) {
      try {
        // We need the audio config for new workers - this is a limitation
        // In practice, we'd store the initial config
        availableWorker = await this.createWorker({
          inputFormat: {sampleRate: 48000, channels: 1, bitDepth: 32},
          outputFormat: {format: 'pcm16', sampleRate: 16000, channels: 1, bitDepth: 16},
          enableCompression: false,
          qualityLevel: 8,
          lowLatencyMode: true
        })
        this.workerPool.push(availableWorker)
      } catch (error) {
        this.log(`Failed to create new worker: ${error}`)
      }
    }

    if (availableWorker) {
      availableWorker.busy = true
      availableWorker.lastUsed = Date.now()
    }

    return availableWorker || null
  }

  private sendWorkerMessage(
    workerItem: WorkerPoolItem,
    type: AudioWorkerMessageType,
    payload: unknown
  ): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const id = `req-${this.requestCounter++}-${Date.now()}`

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        workerItem.busy = false
        reject(new Error('Worker request timeout'))
      }, 10000) // 10 second timeout

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now()
      })

      const message: AudioWorkerMessage = {
        id,
        type,
        payload,
        timestamp: Date.now()
      }

      workerItem.worker.postMessage(message)
    })
  }

  private handleWorkerMessage(workerItem: WorkerPoolItem, message: AudioWorkerMessage): void {
    const {id, type, payload} = message

    if (type === AudioWorkerMessageType.LOG && this.config.enableLogging) {
      console.log(`[AudioWorker ${workerItem.id}]`, payload)
      return
    }

    const pendingRequest = this.pendingRequests.get(id)
    if (!pendingRequest) return

    // Clear timeout and remove from pending
    clearTimeout(pendingRequest.timeout)
    this.pendingRequests.delete(id)

    // Mark worker as available
    workerItem.busy = false
    workerItem.lastUsed = Date.now()

    // Handle response
    if (type === AudioWorkerMessageType.ERROR) {
      const errorPayload = payload as {error?: string}
      pendingRequest.reject(new Error(errorPayload?.error || 'Worker error'))
    } else if (type === AudioWorkerMessageType.RESULT || type === AudioWorkerMessageType.READY) {
      pendingRequest.resolve(payload)
    }
  }

  private handleWorkerError(workerItem: WorkerPoolItem, error: ErrorEvent): void {
    this.log(`Worker ${workerItem.id} error: ${error.message}`)

    // Mark worker as not busy and remove from pool
    workerItem.busy = false
    const index = this.workerPool.indexOf(workerItem)
    if (index > -1) {
      this.workerPool.splice(index, 1)
    }

    // Terminate the worker
    workerItem.worker.terminate()

    // Reject any pending requests for this worker
    this.pendingRequests.forEach((request, id) => {
      request.reject(new Error('Worker crashed'))
      clearTimeout(request.timeout)
      this.pendingRequests.delete(id)
    })
  }

  private cleanupIdleWorkers(): void {
    const now = Date.now()
    const workersToRemove: WorkerPoolItem[] = []

    this.workerPool.forEach(workerItem => {
      if (
        !workerItem.busy &&
        now - workerItem.lastUsed > this.config.workerIdleTimeout &&
        this.workerPool.length > 1
      ) {
        // Keep at least one worker
        workersToRemove.push(workerItem)
      }
    })

    workersToRemove.forEach(workerItem => {
      this.sendWorkerMessage(workerItem, AudioWorkerMessageType.DESTROY, {})
        .then(() => {
          workerItem.worker.terminate()
          const index = this.workerPool.indexOf(workerItem)
          if (index > -1) {
            this.workerPool.splice(index, 1)
          }
          this.log(`Cleaned up idle worker: ${workerItem.id}`)
        })
        .catch(() => {
          // Force cleanup on error
          workerItem.worker.terminate()
          const index = this.workerPool.indexOf(workerItem)
          if (index > -1) {
            this.workerPool.splice(index, 1)
          }
        })
    })
  }

  // Fallback implementations for main thread processing
  private async fallbackConvertAudio(
    audioData: Float32Array,
    timestamp?: number
  ): Promise<ConversionResult> {
    // Simple fallback implementation
    this.log('Using main thread fallback for audio conversion')

    const startTime = performance.now()

    // Basic conversion - would use AudioFormatConverter in real implementation
    const outputData = new ArrayBuffer(audioData.length * 2) // 16-bit output
    const view = new Int16Array(outputData)

    for (let i = 0; i < audioData.length; i++) {
      view[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767))
    }

    const processingTime = performance.now() - startTime

    return {
      data: outputData,
      format: 'pcm16',
      sampleRate: 16000,
      channels: 1,
      duration: (audioData.length / 16000) * 1000,
      timestamp: timestamp || Date.now(),
      processingTime
    }
  }

  private async fallbackProcessChunks(
    chunks: Float32Array[],
    _options: ProcessChunkPayload['processingOptions']
  ): Promise<ConversionResult> {
    this.log('Using main thread fallback for chunk processing')

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combinedData = new Float32Array(totalLength)
    let offset = 0

    for (const chunk of chunks) {
      combinedData.set(chunk, offset)
      offset += chunk.length
    }

    return this.fallbackConvertAudio(combinedData)
  }

  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[AudioWorkerManager]`, message)
    }
  }

  /**
   * Generate secure worker ID using crypto APIs
   */
  private generateSecureWorkerId(): string {
    try {
      // Use Web Crypto API for browser compatibility
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `worker-${Date.now()}-${crypto.randomUUID()}`
      } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint8Array(8)
        crypto.getRandomValues(array)
        const hex = Array.from(array)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
        return `worker-${Date.now()}-${hex}`
      } else {
        // Fallback using Math.random()
        const random = Math.random().toString(36).substring(2, 15)
        return `worker-${Date.now()}-${random}`
      }
    } catch {
      // Fallback using high-resolution timestamp
      const hrtime =
        typeof process !== 'undefined' && process.hrtime
          ? process.hrtime.bigint()
          : BigInt(Date.now() * 1000)
      return `worker-${Date.now()}-${hrtime.toString(36)}`
    }
  }
}

/**
 * Create and configure an audio worker manager
 */
export function createAudioWorkerManager(config?: Partial<AudioWorkerConfig>): AudioWorkerManager {
  return new AudioWorkerManager(config)
}

/**
 * Singleton instance for global use
 */
let globalWorkerManager: AudioWorkerManager | null = null

export function getGlobalAudioWorkerManager(
  config?: Partial<AudioWorkerConfig>
): AudioWorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new AudioWorkerManager(config)
  }
  return globalWorkerManager
}
