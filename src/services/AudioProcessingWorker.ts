/**
 * Audio Processing Web Worker
 * 
 * Offloads heavy audio processing tasks to prevent blocking the main thread
 * and reduce memory pressure on the main execution context.
 */

// Web Worker interface for audio processing
export interface AudioWorkerMessage {
  type: 'process' | 'cancel' | 'status'
  id: string
  data?: {
    audioData?: ArrayBuffer
    options?: Record<string, unknown>
    chunkIndex?: number
  }
}

export interface AudioWorkerResponse {
  type: 'result' | 'error' | 'progress' | 'status'
  id: string
  data?: {
    text?: string
    confidence?: number
    progress?: number
    error?: string
    status?: {
      isProcessing: boolean
      timestamp: number
    }
  }
}

/**
 * Web Worker Manager for Audio Processing
 * 
 * Manages multiple worker threads for parallel audio processing
 * while maintaining memory efficiency and preventing stack overflow.
 */
export class AudioProcessingWorkerManager {
  private workers: Worker[] = []
  private workerTasks: Map<string, { 
    worker: Worker
    resolve: (value: { text: string; confidence: number }) => void
    reject: (reason?: unknown) => void 
  }> = new Map()
  private maxWorkers: number
  private workerIndex = 0
  private isInitialized = false

  constructor(maxWorkers = 2) {
    this.maxWorkers = Math.min(maxWorkers, navigator.hardwareConcurrency || 2)
  }

  /**
   * Initialize worker pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Create worker pool
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = await this.createWorker()
        this.workers.push(worker)
      }

      this.isInitialized = true
      console.log(`AudioProcessingWorkerManager: Initialized ${this.workers.length} workers`)

    } catch (error) {
      console.warn('AudioProcessingWorkerManager: Failed to initialize workers, falling back to main thread:', error)
      // Fallback: work without workers
      this.isInitialized = false
    }
  }

  /**
   * Create a single audio processing worker
   */
  private async createWorker(): Promise<Worker> {
    // In a real implementation, this would load a separate worker script file
    // For now, we'll create an inline worker with the processing logic
    const workerScript = `
      // Audio processing worker script
      let isProcessing = false;
      
      self.onmessage = function(e) {
        const { type, id, data } = e.data;
        
        switch (type) {
          case 'process':
            processAudioChunk(id, data);
            break;
          case 'cancel':
            cancelProcessing(id);
            break;
          case 'status':
            sendStatus(id);
            break;
        }
      };
      
      async function processAudioChunk(id, data) {
        try {
          isProcessing = true;
          
          // Send progress update
          self.postMessage({
            type: 'progress',
            id: id,
            data: { progress: 0 }
          });
          
          // Simulate audio processing with the actual data
          const audioData = new Uint8Array(data.audioData);
          const options = data.options || {};
          const chunkIndex = data.chunkIndex || 0;
          
          // Simulate processing time based on data size
          const processingTime = Math.min(audioData.length / 1000, 2000); // Max 2 seconds
          
          // Simulate processing in chunks to allow for cancellation
          for (let i = 0; i < 10; i++) {
            if (!isProcessing) {
              throw new Error('Processing cancelled');
            }
            
            await new Promise(resolve => setTimeout(resolve, processingTime / 10));
            
            self.postMessage({
              type: 'progress',
              id: id,
              data: { progress: (i + 1) * 10 }
            });
          }
          
          // Mock transcription result based on chunk data
          const mockText = \`Processed chunk \${chunkIndex} with \${audioData.length} bytes\`;
          const mockConfidence = 0.75 + Math.random() * 0.2; // Random confidence between 0.75-0.95
          
          // Send result
          self.postMessage({
            type: 'result',
            id: id,
            data: {
              text: mockText,
              confidence: mockConfidence
            }
          });
          
        } catch (error) {
          self.postMessage({
            type: 'error',
            id: id,
            data: { error: error.message }
          });
        } finally {
          isProcessing = false;
        }
      }
      
      function cancelProcessing(id) {
        isProcessing = false;
        self.postMessage({
          type: 'result',
          id: id,
          data: { text: '', confidence: 0, cancelled: true }
        });
      }
      
      function sendStatus(id) {
        self.postMessage({
          type: 'status',
          id: id,
          data: {
            status: {
              isProcessing: isProcessing,
              timestamp: Date.now()
            }
          }
        });
      }
    `

    const blob = new Blob([workerScript], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    const worker = new Worker(workerUrl)

    // Set up error handling
    worker.onerror = (error) => {
      console.error('Worker error:', error)
    }

    return worker
  }

  /**
   * Process audio chunk using worker
   */
  async processAudioChunk(
    audioData: ArrayBuffer,
    options: Record<string, unknown> = {},
    chunkIndex = 0
  ): Promise<{ text: string; confidence: number }> {
    if (!this.isInitialized) {
      // Fallback to main thread processing
      return this.processAudioChunkMainThread(audioData, options, chunkIndex)
    }

    // Get next available worker
    const worker = this.getNextWorker()
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2)}`

    return new Promise((resolve, reject) => {
      // Store task for cleanup
      this.workerTasks.set(taskId, { worker, resolve, reject })

      // Set up message handler for this task
      const messageHandler = (e: MessageEvent<AudioWorkerResponse>) => {
        const { type, id, data } = e.data

        if (id !== taskId) {
          return // Not our task
        }

        switch (type) {
          case 'result':
            worker.removeEventListener('message', messageHandler)
            this.workerTasks.delete(taskId)
            
            if (data?.text !== undefined) {
              resolve({
                text: data.text,
                confidence: data.confidence || 0
              })
            } else {
              reject(new Error('Invalid result from worker'))
            }
            break

          case 'error':
            worker.removeEventListener('message', messageHandler)
            this.workerTasks.delete(taskId)
            reject(new Error(data?.error || 'Worker processing failed'))
            break

          case 'progress':
            // Could emit progress events here if needed
            console.log(`Worker progress for chunk ${chunkIndex}: ${data?.progress}%`)
            break
        }
      }

      worker.addEventListener('message', messageHandler)

      // Send processing task to worker
      const message: AudioWorkerMessage = {
        type: 'process',
        id: taskId,
        data: {
          audioData,
          options,
          chunkIndex
        }
      }

      worker.postMessage(message)

      // Set timeout for worker task
      setTimeout(() => {
        if (this.workerTasks.has(taskId)) {
          worker.removeEventListener('message', messageHandler)
          this.workerTasks.delete(taskId)
          reject(new Error('Worker task timeout'))
        }
      }, 30000) // 30 second timeout
    })
  }

  /**
   * Fallback processing on main thread
   */
  private async processAudioChunkMainThread(
    audioData: ArrayBuffer,
    _options: Record<string, unknown>,
    chunkIndex: number
  ): Promise<{ text: string; confidence: number }> {
    // Simulate processing without blocking
    await new Promise(resolve => setTimeout(resolve, 100))

    return {
      text: `Fallback processed chunk ${chunkIndex} with ${audioData.byteLength} bytes`,
      confidence: 0.7
    }
  }

  /**
   * Get next worker in round-robin fashion
   */
  private getNextWorker(): Worker {
    const worker = this.workers[this.workerIndex]
    this.workerIndex = (this.workerIndex + 1) % this.workers.length
    return worker
  }

  /**
   * Cancel all pending tasks
   */
  async cancelAllTasks(): Promise<void> {
    const cancelPromises: Promise<void>[] = []

    for (const [taskId, { worker }] of this.workerTasks) {
      const cancelPromise = new Promise<void>((resolve) => {
        const messageHandler = (e: MessageEvent<AudioWorkerResponse>) => {
          if (e.data.id === taskId && e.data.type === 'result') {
            worker.removeEventListener('message', messageHandler)
            resolve()
          }
        }

        worker.addEventListener('message', messageHandler)
        worker.postMessage({ type: 'cancel', id: taskId })

        // Timeout for cancellation
        setTimeout(() => {
          worker.removeEventListener('message', messageHandler)
          resolve()
        }, 5000)
      })

      cancelPromises.push(cancelPromise)
    }

    await Promise.allSettled(cancelPromises)
    this.workerTasks.clear()
  }

  /**
   * Destroy worker manager and cleanup resources
   */
  async destroy(): Promise<void> {
    // Cancel all pending tasks
    await this.cancelAllTasks()

    // Terminate all workers
    for (const worker of this.workers) {
      worker.terminate()
    }

    this.workers = []
    this.workerTasks.clear()
    this.isInitialized = false

    console.log('AudioProcessingWorkerManager: Destroyed')
  }

  /**
   * Get manager status
   */
  getStatus(): {
    isInitialized: boolean
    workerCount: number
    activeTasks: number
    maxWorkers: number
  } {
    return {
      isInitialized: this.isInitialized,
      workerCount: this.workers.length,
      activeTasks: this.workerTasks.size,
      maxWorkers: this.maxWorkers
    }
  }
}

/**
 * Worker-Enhanced Audio Chunk Processor
 * 
 * Integrates Web Workers with the optimized audio chunk processor
 * for maximum performance and memory efficiency.
 */
export class WorkerEnhancedAudioProcessor {
  private workerManager: AudioProcessingWorkerManager
  private isUsingWorkers: boolean

  constructor(maxWorkers = 2, enableWorkers = true) {
    this.workerManager = new AudioProcessingWorkerManager(maxWorkers)
    this.isUsingWorkers = enableWorkers && typeof Worker !== 'undefined'
  }

  /**
   * Initialize the processor
   */
  async initialize(): Promise<void> {
    if (this.isUsingWorkers) {
      try {
        await this.workerManager.initialize()
        console.log('WorkerEnhancedAudioProcessor: Workers initialized')
      } catch (error) {
        console.warn('WorkerEnhancedAudioProcessor: Failed to initialize workers, using main thread:', error)
        this.isUsingWorkers = false
      }
    }
  }

  /**
   * Process audio chunk with optional worker offloading
   */
  async processChunk(
    audioData: Buffer,
    chunkIndex: number,
    options: Record<string, unknown> = {}
  ): Promise<{ text: string; confidence: number }> {
    if (this.isUsingWorkers) {
      // Convert Buffer to ArrayBuffer for worker
      const arrayBuffer = audioData.buffer.slice(
        audioData.byteOffset,
        audioData.byteOffset + audioData.byteLength
      ) as ArrayBuffer

      return this.workerManager.processAudioChunk(arrayBuffer, options, chunkIndex)
    } else {
      // Fallback to main thread processing
      return this.processChunkMainThread(audioData, chunkIndex)
    }
  }

  /**
   * Main thread processing fallback
   */
  private async processChunkMainThread(
    audioData: Buffer,
    chunkIndex: number
  ): Promise<{ text: string; confidence: number }> {
    // Simulate processing with yield to event loop
    await new Promise(resolve => setTimeout(resolve, 50))

    return {
      text: `Main thread processed chunk ${chunkIndex} (${audioData.length} bytes)`,
      confidence: 0.8
    }
  }

  /**
   * Cancel all processing
   */
  async cancel(): Promise<void> {
    if (this.isUsingWorkers) {
      await this.workerManager.cancelAllTasks()
    }
  }

  /**
   * Cleanup and destroy resources
   */
  async destroy(): Promise<void> {
    await this.workerManager.destroy()
  }

  /**
   * Get processor status
   */
  getStatus(): {
    usingWorkers: boolean
    workerManager: ReturnType<AudioProcessingWorkerManager['getStatus']>
  } {
    return {
      usingWorkers: this.isUsingWorkers,
      workerManager: this.workerManager.getStatus()
    }
  }
}

/**
 * Factory function for worker-enhanced processor
 */
export function createWorkerEnhancedProcessor(
  maxWorkers = 2,
  enableWorkers = true
): WorkerEnhancedAudioProcessor {
  return new WorkerEnhancedAudioProcessor(maxWorkers, enableWorkers)
}
