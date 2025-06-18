/**
 * Audio Format Converter Service
 *
 * Handles real-time audio format conversion for streaming to Gemini Live API.
 * Supports multiple audio formats and optimizes for minimal latency.
 */

// Audio format types supported
export enum AudioFormat {
  PCM16 = 'pcm16',
  OPUS = 'opus',
  AAC = 'aac',
  MP3 = 'mp3'
}

// Audio conversion configuration
export interface AudioConversionConfig {
  inputFormat: {
    sampleRate: number
    channels: number
    bitDepth: number
  }
  outputFormat: {
    format: AudioFormat
    sampleRate: number
    channels: number
    bitDepth: number
    bitrate?: number // For compressed formats
  }
  enableCompression: boolean
  qualityLevel: number // 0-10, higher is better quality
  lowLatencyMode: boolean
}

// Conversion result with metadata
export interface ConversionResult {
  data: ArrayBuffer
  format: AudioFormat
  sampleRate: number
  channels: number
  duration: number
  timestamp: number
  compressionRatio?: number
}

// Default configuration optimized for Gemini Live API
export const DEFAULT_CONVERSION_CONFIG: AudioConversionConfig = {
  inputFormat: {
    sampleRate: 48000,
    channels: 1,
    bitDepth: 32 // Float32 from Web Audio API
  },
  outputFormat: {
    format: AudioFormat.PCM16,
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16
  },
  enableCompression: false,
  qualityLevel: 8,
  lowLatencyMode: true
}

/**
 * Audio Format Converter Service
 * Provides real-time audio format conversion with minimal latency
 */
export class AudioFormatConverter {
  private config: AudioConversionConfig
  private resampler: AudioResampler | null = null
  private compressor: AudioCompressor | null = null
  private conversionWorker: Worker | null = null
  private isInitialized = false

  constructor(config: Partial<AudioConversionConfig> = {}) {
    this.config = {...DEFAULT_CONVERSION_CONFIG, ...config}
  }

  /**
   * Initialize the converter with Web Workers for performance
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Initialize resampler if needed
      if (this.needsResampling()) {
        this.resampler = new AudioResampler(
          this.config.inputFormat.sampleRate,
          this.config.outputFormat.sampleRate
        )
      }

      // Initialize compressor if enabled
      if (this.config.enableCompression && this.config.outputFormat.format !== AudioFormat.PCM16) {
        this.compressor = new AudioCompressor(
          this.config.outputFormat.format,
          this.config.qualityLevel
        )
        await this.compressor.initialize()
      }

      // Initialize Web Worker for intensive operations if not in low latency mode
      if (!this.config.lowLatencyMode) {
        this.conversionWorker = new Worker(
          new URL('./workers/audio-conversion-worker.js', import.meta.url)
        )
      }

      this.isInitialized = true
    } catch (error) {
      throw new Error(
        `Failed to initialize audio converter: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Convert audio data from input format to output format
   */
  async convert(
    audioData: Float32Array,
    timestamp: number = Date.now()
  ): Promise<ConversionResult> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    let processedData = audioData
    let currentSampleRate = this.config.inputFormat.sampleRate

    try {
      // Step 1: Resample if needed
      if (this.resampler && this.needsResampling()) {
        processedData = this.resampler.process(processedData)
        currentSampleRate = this.config.outputFormat.sampleRate
      }

      // Step 2: Convert bit depth (Float32 to target format)
      const convertedData = this.convertBitDepth(
        processedData,
        this.config.inputFormat.bitDepth,
        this.config.outputFormat.bitDepth
      )

      // Step 3: Apply compression if enabled
      let outputData: ArrayBuffer
      let compressionRatio: number | undefined

      if (this.compressor && this.config.enableCompression) {
        const compressed = await this.compressor.compress(convertedData)
        outputData = compressed.data
        compressionRatio = compressed.compressionRatio
      } else {
        // Convert to ArrayBuffer
        outputData = this.floatArrayToArrayBuffer(convertedData)
      }

      // Calculate duration
      const duration = (processedData.length / currentSampleRate) * 1000 // in milliseconds

      return {
        data: outputData,
        format: this.config.outputFormat.format,
        sampleRate: currentSampleRate,
        channels: this.config.outputFormat.channels,
        duration,
        timestamp,
        compressionRatio
      }
    } catch (error) {
      throw new Error(
        `Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Convert multiple channels to mono (if needed)
   */
  private convertToMono(audioData: Float32Array, inputChannels: number): Float32Array {
    if (inputChannels === 1) return audioData

    const monoLength = audioData.length / inputChannels
    const monoData = new Float32Array(monoLength)

    for (let i = 0; i < monoLength; i++) {
      let sum = 0
      for (let channel = 0; channel < inputChannels; channel++) {
        sum += audioData[i * inputChannels + channel]
      }
      monoData[i] = sum / inputChannels
    }

    return monoData
  }

  /**
   * Convert bit depth from Float32 to target format
   */
  private convertBitDepth(
    data: Float32Array,
    inputBits: number,
    outputBits: number
  ): Float32Array | Int16Array {
    if (inputBits === 32 && outputBits === 16) {
      // Convert Float32 to Int16
      const int16Data = new Int16Array(data.length)
      for (let i = 0; i < data.length; i++) {
        // Clamp and scale to Int16 range
        const sample = Math.max(-1, Math.min(1, data[i]))
        int16Data[i] = sample * 0x7fff
      }
      return int16Data
    }

    // For other conversions or same bit depth, return as-is
    return data
  }

  /**
   * Convert typed array to ArrayBuffer
   */
  private floatArrayToArrayBuffer(data: Float32Array | Int16Array): ArrayBuffer {
    if (data.buffer instanceof ArrayBuffer) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    }
    // Fallback for SharedArrayBuffer
    const arrayBuffer = new ArrayBuffer(data.byteLength)
    new Uint8Array(arrayBuffer).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    return arrayBuffer
  }

  /**
   * Check if resampling is needed
   */
  private needsResampling(): boolean {
    return this.config.inputFormat.sampleRate !== this.config.outputFormat.sampleRate
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioConversionConfig {
    return {...this.config}
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AudioConversionConfig>): void {
    this.config = {...this.config, ...updates}
    // Reinitialize if needed
    this.isInitialized = false
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.conversionWorker) {
      this.conversionWorker.terminate()
      this.conversionWorker = null
    }

    if (this.compressor) {
      await this.compressor.destroy()
      this.compressor = null
    }

    this.resampler = null
    this.isInitialized = false
  }
}

/**
 * Audio Resampler for sample rate conversion
 */
class AudioResampler {
  private inputSampleRate: number
  private outputSampleRate: number
  private ratio: number
  private buffer: Float32Array = new Float32Array(0)

  constructor(inputSampleRate: number, outputSampleRate: number) {
    this.inputSampleRate = inputSampleRate
    this.outputSampleRate = outputSampleRate
    this.ratio = outputSampleRate / inputSampleRate
  }

  /**
   * Process audio data for resampling using linear interpolation
   */
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

/**
 * Audio Compressor for various formats
 */
class AudioCompressor {
  private format: AudioFormat
  private qualityLevel: number
  private encoder: unknown = null // Will be initialized based on format

  constructor(format: AudioFormat, qualityLevel: number) {
    this.format = format
    this.qualityLevel = qualityLevel
  }

  async initialize(): Promise<void> {
    // Initialize encoder based on format
    switch (this.format) {
      case AudioFormat.OPUS:
        // For now, just return PCM - Opus encoding would require additional libraries
        console.warn('Opus encoding not implemented, falling back to PCM')
        break
      case AudioFormat.AAC:
        console.warn('AAC encoding not implemented, falling back to PCM')
        break
      case AudioFormat.MP3:
        console.warn('MP3 encoding not implemented, falling back to PCM')
        break
      default:
        // PCM - no compression needed
        break
    }
  }

  async compress(
    data: Float32Array | Int16Array
  ): Promise<{data: ArrayBuffer; compressionRatio: number}> {
    // For now, return uncompressed data
    // In a real implementation, this would use the appropriate encoder
    let arrayBuffer: ArrayBuffer

    if (data.buffer instanceof ArrayBuffer) {
      arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    } else {
      // Handle SharedArrayBuffer case
      arrayBuffer = new ArrayBuffer(data.byteLength)
      new Uint8Array(arrayBuffer).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    }

    return {
      data: arrayBuffer,
      compressionRatio: 1.0 // No compression
    }
  }

  async destroy(): Promise<void> {
    this.encoder = null
  }
}

/**
 * Create and configure an audio format converter
 */
export function createAudioFormatConverter(
  config?: Partial<AudioConversionConfig>
): AudioFormatConverter {
  return new AudioFormatConverter(config)
}

/**
 * Utility function to detect optimal format for target platform
 */
export function getOptimalAudioFormat(): AudioFormat {
  // For Gemini Live API, PCM16 is the preferred format
  return AudioFormat.PCM16
}

/**
 * Utility function to validate audio format configuration
 */
export function validateAudioConfig(config: AudioConversionConfig): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (config.inputFormat.sampleRate <= 0) {
    errors.push('Input sample rate must be positive')
  }

  if (config.outputFormat.sampleRate <= 0) {
    errors.push('Output sample rate must be positive')
  }

  if (config.inputFormat.channels < 1 || config.inputFormat.channels > 8) {
    errors.push('Input channels must be between 1 and 8')
  }

  if (config.outputFormat.channels < 1 || config.outputFormat.channels > 8) {
    errors.push('Output channels must be between 1 and 8')
  }

  if (config.qualityLevel < 0 || config.qualityLevel > 10) {
    errors.push('Quality level must be between 0 and 10')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
