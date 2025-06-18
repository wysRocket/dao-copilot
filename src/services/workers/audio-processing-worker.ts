/**
 * Audio Processing Web Worker
 *
 * Handles intensive audio processing tasks off the main thread including:
 * - Audio format conversion
 * - Sample rate conversion
 * - Buffer management
 * - Real-time audio streaming preparation
 */

// Define message types for communication
export enum AudioWorkerMessageType {
  INITIALIZE = 'initialize',
  CONVERT_AUDIO = 'convert_audio',
  PROCESS_CHUNK = 'process_chunk',
  UPDATE_CONFIG = 'update_config',
  DESTROY = 'destroy',
  ERROR = 'error',
  RESULT = 'result',
  READY = 'ready',
  LOG = 'log'
}

// Message interfaces
export interface AudioWorkerMessage {
  id: string
  type: AudioWorkerMessageType
  payload?: unknown
  timestamp: number
}

export interface InitializePayload {
  config: {
    inputFormat: {
      sampleRate: number
      channels: number
      bitDepth: number
    }
    outputFormat: {
      format: string
      sampleRate: number
      channels: number
      bitDepth: number
      bitrate?: number
    }
    enableCompression: boolean
    qualityLevel: number
    lowLatencyMode: boolean
  }
}

export interface ConvertAudioPayload {
  audioData: Float32Array
  timestamp: number
  sequenceNumber?: number
}

export interface ProcessChunkPayload {
  chunks: Float32Array[]
  processingOptions: {
    normalize: boolean
    removeNoise: boolean
    enableVAD: boolean
  }
}

export interface ConversionResult {
  data: ArrayBuffer
  format: string
  sampleRate: number
  channels: number
  duration: number
  timestamp: number
  sequenceNumber?: number
  compressionRatio?: number
  processingTime: number
}

// Worker implementation
class AudioProcessingWorker {
  private config: InitializePayload['config'] | null = null
  private isInitialized = false
  private resampler: AudioResampler | null = null
  private sequenceCounter = 0

  constructor() {
    // Listen for messages from main thread
    self.addEventListener('message', this.handleMessage.bind(this))

    // Don't log in test environment
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      this.log('Audio processing worker started')
    }
  }

  private handleMessage(event: MessageEvent<AudioWorkerMessage>): void {
    const {id, type, payload} = event.data

    try {
      switch (type) {
        case AudioWorkerMessageType.INITIALIZE:
          this.handleInitialize(id, payload as InitializePayload)
          break
        case AudioWorkerMessageType.CONVERT_AUDIO:
          this.handleConvertAudio(id, payload as ConvertAudioPayload)
          break
        case AudioWorkerMessageType.PROCESS_CHUNK:
          this.handleProcessChunk(id, payload as ProcessChunkPayload)
          break
        case AudioWorkerMessageType.UPDATE_CONFIG:
          this.handleUpdateConfig(id, payload as Partial<InitializePayload['config']>)
          break
        case AudioWorkerMessageType.DESTROY:
          this.handleDestroy(id)
          break
        default:
          this.sendError(id, `Unknown message type: ${type}`)
      }
    } catch (error) {
      this.sendError(
        id,
        `Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private handleInitialize(id: string, payload: InitializePayload): void {
    try {
      this.config = payload.config

      // Initialize resampler if needed
      if (this.needsResampling()) {
        this.resampler = new AudioResampler(
          this.config.inputFormat.sampleRate,
          this.config.outputFormat.sampleRate
        )
      }

      this.isInitialized = true
      this.log('Worker initialized successfully')

      this.sendMessage({
        id,
        type: AudioWorkerMessageType.READY,
        payload: {initialized: true},
        timestamp: Date.now()
      })
    } catch (error) {
      this.sendError(
        id,
        `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private handleConvertAudio(id: string, payload: ConvertAudioPayload): void {
    if (!this.isInitialized || !this.config) {
      this.sendError(id, 'Worker not initialized')
      return
    }

    const startTime = performance.now()

    try {
      let processedData = payload.audioData

      // Step 1: Resample if needed
      if (this.resampler && this.needsResampling()) {
        processedData = this.resampler.process(processedData)
      }

      // Step 2: Convert bit depth
      const convertedData = this.convertBitDepth(
        processedData,
        this.config.inputFormat.bitDepth,
        this.config.outputFormat.bitDepth
      )

      // Step 3: Convert to ArrayBuffer
      const outputData = this.typedArrayToArrayBuffer(convertedData)

      // Calculate duration and processing time
      const duration = (processedData.length / this.config.outputFormat.sampleRate) * 1000
      const processingTime = performance.now() - startTime

      const result: ConversionResult = {
        data: outputData,
        format: this.config.outputFormat.format,
        sampleRate: this.config.outputFormat.sampleRate,
        channels: this.config.outputFormat.channels,
        duration,
        timestamp: payload.timestamp,
        sequenceNumber: payload.sequenceNumber || this.sequenceCounter++,
        processingTime
      }

      this.sendMessage({
        id,
        type: AudioWorkerMessageType.RESULT,
        payload: result,
        timestamp: Date.now()
      })

      this.log(`Converted audio chunk in ${processingTime.toFixed(2)}ms`)
    } catch (error) {
      this.sendError(
        id,
        `Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private handleProcessChunk(id: string, payload: ProcessChunkPayload): void {
    if (!this.isInitialized || !this.config) {
      this.sendError(id, 'Worker not initialized')
      return
    }

    const startTime = performance.now()

    try {
      let processedChunks = payload.chunks

      // Apply processing options
      if (payload.processingOptions.normalize) {
        processedChunks = processedChunks.map(chunk => this.normalizeAudio(chunk))
      }

      if (payload.processingOptions.removeNoise) {
        processedChunks = processedChunks.map(chunk => this.applyNoiseReduction(chunk))
      }

      if (payload.processingOptions.enableVAD) {
        processedChunks = processedChunks.filter(chunk => this.detectVoiceActivity(chunk))
      }

      // Combine chunks into single array
      const totalLength = processedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combinedData = new Float32Array(totalLength)
      let offset = 0

      for (const chunk of processedChunks) {
        combinedData.set(chunk, offset)
        offset += chunk.length
      }

      // Convert the processed data
      this.handleConvertAudio(id, {
        audioData: combinedData,
        timestamp: Date.now(),
        sequenceNumber: this.sequenceCounter++
      })

      const processingTime = performance.now() - startTime
      this.log(`Processed ${processedChunks.length} chunks in ${processingTime.toFixed(2)}ms`)
    } catch (error) {
      this.sendError(
        id,
        `Chunk processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private handleUpdateConfig(id: string, payload: Partial<InitializePayload['config']>): void {
    try {
      if (this.config) {
        this.config = {...this.config, ...payload}

        // Reinitialize resampler if needed
        if (this.config && this.needsResampling()) {
          this.resampler = new AudioResampler(
            this.config.inputFormat.sampleRate,
            this.config.outputFormat.sampleRate
          )
        } else {
          this.resampler = null
        }

        this.log('Configuration updated')
      }

      this.sendMessage({
        id,
        type: AudioWorkerMessageType.RESULT,
        payload: {updated: true},
        timestamp: Date.now()
      })
    } catch (error) {
      this.sendError(
        id,
        `Config update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private handleDestroy(id: string): void {
    try {
      this.config = null
      this.resampler = null
      this.isInitialized = false
      this.sequenceCounter = 0

      this.sendMessage({
        id,
        type: AudioWorkerMessageType.RESULT,
        payload: {destroyed: true},
        timestamp: Date.now()
      })

      this.log('Worker destroyed')
    } catch (error) {
      this.sendError(
        id,
        `Destroy failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  // Audio processing utilities
  private convertBitDepth(
    data: Float32Array,
    inputBits: number,
    outputBits: number
  ): Float32Array | Int16Array {
    if (inputBits === 32 && outputBits === 16) {
      // Convert Float32 to Int16
      const int16Data = new Int16Array(data.length)
      for (let i = 0; i < data.length; i++) {
        const sample = Math.max(-1, Math.min(1, data[i]))
        int16Data[i] = sample * 0x7fff
      }
      return int16Data
    }
    return data
  }

  private normalizeAudio(data: Float32Array): Float32Array {
    // Find peak amplitude
    let peak = 0
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]))
    }

    if (peak === 0) return data

    // Normalize to prevent clipping while maintaining headroom
    const targetPeak = 0.95
    const gain = targetPeak / peak
    const normalizedData = new Float32Array(data.length)

    for (let i = 0; i < data.length; i++) {
      normalizedData[i] = data[i] * gain
    }

    return normalizedData
  }

  private applyNoiseReduction(data: Float32Array): Float32Array {
    // Simple noise gate implementation
    const threshold = 0.01 // -40dB threshold
    const processedData = new Float32Array(data.length)

    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) {
        processedData[i] = data[i]
      } else {
        processedData[i] = 0
      }
    }

    return processedData
  }

  private detectVoiceActivity(data: Float32Array): boolean {
    // Simple energy-based VAD
    let energy = 0
    for (let i = 0; i < data.length; i++) {
      energy += data[i] * data[i]
    }

    const avgEnergy = energy / data.length
    const threshold = 0.001 // Adjust based on requirements

    return avgEnergy > threshold
  }

  private needsResampling(): boolean {
    return (
      this.config !== null &&
      this.config.inputFormat.sampleRate !== this.config.outputFormat.sampleRate
    )
  }

  private typedArrayToArrayBuffer(data: Float32Array | Int16Array): ArrayBuffer {
    if (data.buffer instanceof ArrayBuffer) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    }
    // Fallback for SharedArrayBuffer
    const arrayBuffer = new ArrayBuffer(data.byteLength)
    new Uint8Array(arrayBuffer).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    return arrayBuffer
  }

  private sendMessage(message: AudioWorkerMessage): void {
    // In test environment, avoid postMessage calls
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return
    }

    // Handle different postMessage signatures in different environments
    if (typeof self !== 'undefined' && self.postMessage) {
      try {
        self.postMessage(message)
      } catch (error) {
        console.warn('Failed to postMessage:', error)
      }
    } else if (typeof postMessage !== 'undefined') {
      try {
        postMessage(message)
      } catch (error) {
        console.warn('Failed to postMessage:', error)
      }
    } else {
      console.warn('postMessage not available in this environment')
    }
  }

  private sendError(id: string, errorMessage: string): void {
    this.sendMessage({
      id,
      type: AudioWorkerMessageType.ERROR,
      payload: {error: errorMessage},
      timestamp: Date.now()
    })
  }

  private log(message: string): void {
    this.sendMessage({
      id: 'log',
      type: AudioWorkerMessageType.LOG,
      payload: {message},
      timestamp: Date.now()
    })
  }
}

// Audio Resampler implementation for Web Worker
class AudioResampler {
  private inputSampleRate: number
  private outputSampleRate: number
  private ratio: number

  constructor(inputSampleRate: number, outputSampleRate: number) {
    this.inputSampleRate = inputSampleRate
    this.outputSampleRate = outputSampleRate
    this.ratio = outputSampleRate / inputSampleRate
  }

  process(inputData: Float32Array): Float32Array {
    if (this.ratio === 1) return inputData

    const outputLength = Math.floor(inputData.length * this.ratio)
    const outputData = new Float32Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i / this.ratio
      const sourceIndexFloor = Math.floor(sourceIndex)
      const sourceIndexCeil = Math.min(sourceIndexFloor + 1, inputData.length - 1)
      const fraction = sourceIndex - sourceIndexFloor

      // Linear interpolation
      outputData[i] =
        inputData[sourceIndexFloor] * (1 - fraction) + inputData[sourceIndexCeil] * fraction
    }

    return outputData
  }
}

// Initialize the worker
new AudioProcessingWorker()

// Remove duplicate exports
