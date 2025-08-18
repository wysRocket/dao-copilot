/**
 * AudioPreRollBuffer - Circular buffer for retaining 500ms of audio before speech detection
 *
 * This class implements a circular buffer to store the last 500ms of audio data,
 * ensuring that the beginning of speech is not clipped during transcription.
 * Integrates with the existing audio streaming pipeline and supports the standard
 * 16kHz, 16-bit PCM mono audio format used by the Gemini Live API.
 */

import {EventEmitter} from 'events'
import {convertFloat32ToPCM16} from '../services/gemini-audio-utils'
import {AudioChunk} from '../services/real-time-audio-streaming'

/**
 * Configuration for the AudioPreRollBuffer
 */
export interface AudioPreRollBufferConfig {
  preRollDurationMs: number // Duration to retain before speech (default: 500ms)
  sampleRate: number // Audio sample rate (default: 16kHz)
  maxChunks: number // Maximum number of chunks to retain
  enableMetrics: boolean // Enable performance metrics collection
}

/**
 * Default configuration for the pre-roll buffer
 */
export const DEFAULT_PREROLL_CONFIG: AudioPreRollBufferConfig = {
  preRollDurationMs: 500, // 500ms pre-roll as specified in task requirements
  sampleRate: 16000, // Standard 16kHz sample rate for speech
  maxChunks: 50, // Buffer for approximately 5 seconds of chunks
  enableMetrics: true
}

/**
 * Metrics for monitoring pre-roll buffer performance
 */
export interface PreRollBufferMetrics {
  totalChunksAdded: number
  totalChunksRetrieved: number
  averageChunkSize: number
  bufferUtilization: number // Percentage of buffer capacity used
  preRollRetrievals: number
  bufferOverflows: number
  lastFlushTimestamp: number
}

/**
 * Internal buffer entry containing audio data and metadata
 */
interface BufferEntry {
  chunk: AudioChunk
  addedAt: number
}

/**
 * AudioPreRollBuffer class implementing circular buffer for speech onset preservation
 */
export class AudioPreRollBuffer extends EventEmitter {
  private config: AudioPreRollBufferConfig
  private buffer: BufferEntry[]
  private head: number = 0 // Points to the oldest entry
  private tail: number = 0 // Points to the next write position
  private size: number = 0 // Current number of entries
  private capacity: number // Maximum buffer capacity

  // Metrics tracking
  private metrics: PreRollBufferMetrics = {
    totalChunksAdded: 0,
    totalChunksRetrieved: 0,
    averageChunkSize: 0,
    bufferUtilization: 0,
    preRollRetrievals: 0,
    bufferOverflows: 0,
    lastFlushTimestamp: 0
  }

  constructor(config: Partial<AudioPreRollBufferConfig> = {}) {
    super()

    this.config = {...DEFAULT_PREROLL_CONFIG, ...config}

    // Calculate buffer capacity based on pre-roll duration and typical chunk frequency
    // Assuming chunks arrive every ~100ms, we need duration/100 entries plus some buffer
    const chunksNeeded = Math.ceil(this.config.preRollDurationMs / 100)
    this.capacity = Math.max(chunksNeeded * 1.5, this.config.maxChunks)

    this.buffer = new Array(this.capacity)

    this.emit('initialized', {
      preRollDurationMs: this.config.preRollDurationMs,
      capacity: this.capacity,
      sampleRate: this.config.sampleRate
    })
  }

  /**
   * Add an audio chunk to the pre-roll buffer
   */
  addChunk(chunk: AudioChunk): void {
    const entry: BufferEntry = {
      chunk,
      addedAt: Date.now()
    }

    this.buffer[this.tail] = entry
    this.tail = (this.tail + 1) % this.capacity

    // Handle buffer overflow - advance head pointer
    if (this.size === this.capacity) {
      this.head = (this.head + 1) % this.capacity
      this.metrics.bufferOverflows++

      this.emit('bufferOverflow', {
        droppedChunk: this.buffer[this.head],
        timestamp: Date.now()
      })
    } else {
      this.size++
    }

    // Update metrics
    this.metrics.totalChunksAdded++
    this.updateMetrics(chunk)

    this.emit('chunkAdded', {
      sequenceNumber: chunk.sequenceNumber,
      bufferSize: this.size,
      utilization: (this.size / this.capacity) * 100
    })
  }

  /**
   * Retrieve pre-roll audio data based on configured duration
   */
  getPreRollAudio(): AudioChunk[] {
    const now = Date.now()
    const cutoffTime = now - this.config.preRollDurationMs
    const preRollChunks: AudioChunk[] = []

    // Traverse buffer from oldest to newest
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity
      const entry = this.buffer[index]

      if (entry && entry.addedAt >= cutoffTime) {
        preRollChunks.push(entry.chunk)
      }
    }

    this.metrics.preRollRetrievals++
    this.metrics.totalChunksRetrieved += preRollChunks.length

    this.emit('preRollRetrieved', {
      chunksCount: preRollChunks.length,
      durationMs:
        preRollChunks.length > 0
          ? preRollChunks[preRollChunks.length - 1].timestamp - preRollChunks[0].timestamp
          : 0,
      totalSamples: preRollChunks.reduce((sum, chunk) => sum + chunk.data.length, 0)
    })

    return preRollChunks
  }

  /**
   * Retrieve all audio chunks currently in buffer (for debugging/testing)
   */
  getAllBufferedChunks(): AudioChunk[] {
    const allChunks: AudioChunk[] = []

    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity
      const entry = this.buffer[index]
      if (entry) {
        allChunks.push(entry.chunk)
      }
    }

    return allChunks
  }

  /**
   * Convert pre-roll audio to PCM16 format for transmission
   */
  getPreRollAudioAsPCM16(): ArrayBuffer {
    const preRollChunks = this.getPreRollAudio()

    if (preRollChunks.length === 0) {
      return new ArrayBuffer(0)
    }

    // Calculate total samples needed
    const totalSamples = preRollChunks.reduce((sum, chunk) => sum + chunk.data.length, 0)
    const concatenatedAudio = new Float32Array(totalSamples)

    // Concatenate all audio chunks
    let offset = 0
    for (const chunk of preRollChunks) {
      concatenatedAudio.set(chunk.data, offset)
      offset += chunk.data.length
    }

    // Convert to 16-bit PCM format
    return convertFloat32ToPCM16(concatenatedAudio)
  }

  /**
   * Clear the buffer (called when speech is fully processed)
   */
  flush(): void {
    this.head = 0
    this.tail = 0
    this.size = 0
    this.metrics.lastFlushTimestamp = Date.now()

    this.emit('bufferFlushed', {
      timestamp: this.metrics.lastFlushTimestamp
    })
  }

  /**
   * Clear only chunks older than specified duration
   */
  clearOldChunks(maxAgeMs: number = this.config.preRollDurationMs * 2): void {
    const cutoffTime = Date.now() - maxAgeMs
    let removedCount = 0

    // Remove old entries from the head of the buffer
    while (this.size > 0) {
      const headEntry = this.buffer[this.head]
      if (headEntry && headEntry.addedAt < cutoffTime) {
        this.head = (this.head + 1) % this.capacity
        this.size--
        removedCount++
      } else {
        break
      }
    }

    if (removedCount > 0) {
      this.emit('oldChunksCleared', {
        removedCount,
        remainingChunks: this.size,
        cutoffTime
      })
    }
  }

  /**
   * Get current buffer statistics
   */
  getMetrics(): PreRollBufferMetrics {
    this.metrics.bufferUtilization = (this.size / this.capacity) * 100
    return {...this.metrics}
  }

  /**
   * Get buffer status information
   */
  getBufferStatus(): {
    size: number
    capacity: number
    utilization: number
    oldestChunkAge: number
    newestChunkAge: number
  } {
    const now = Date.now()
    let oldestAge = 0
    let newestAge = 0

    if (this.size > 0) {
      const oldestEntry = this.buffer[this.head]
      const newestIndex = this.tail === 0 ? this.capacity - 1 : this.tail - 1
      const newestEntry = this.buffer[newestIndex]

      if (oldestEntry) oldestAge = now - oldestEntry.addedAt
      if (newestEntry) newestAge = now - newestEntry.addedAt
    }

    return {
      size: this.size,
      capacity: this.capacity,
      utilization: (this.size / this.capacity) * 100,
      oldestChunkAge: oldestAge,
      newestChunkAge: newestAge
    }
  }

  /**
   * Update internal metrics when adding chunks
   */
  private updateMetrics(chunk: AudioChunk): void {
    // Update running average of chunk size
    const currentAvg = this.metrics.averageChunkSize
    const count = this.metrics.totalChunksAdded
    this.metrics.averageChunkSize = (currentAvg * (count - 1) + chunk.data.length) / count
  }

  /**
   * Enable or disable metrics collection
   */
  setMetricsEnabled(enabled: boolean): void {
    this.config.enableMetrics = enabled

    if (!enabled) {
      // Reset metrics when disabled
      this.metrics = {
        totalChunksAdded: 0,
        totalChunksRetrieved: 0,
        averageChunkSize: 0,
        bufferUtilization: 0,
        preRollRetrievals: 0,
        bufferOverflows: 0,
        lastFlushTimestamp: 0
      }
    }
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<AudioPreRollBufferConfig>): void {
    const oldConfig = {...this.config}
    this.config = {...this.config, ...newConfig}

    // If pre-roll duration changed significantly, may need to resize buffer
    if (Math.abs(oldConfig.preRollDurationMs - this.config.preRollDurationMs) > 100) {
      const chunksNeeded = Math.ceil(this.config.preRollDurationMs / 100)
      const newCapacity = Math.max(chunksNeeded * 1.5, this.config.maxChunks)

      if (newCapacity !== this.capacity) {
        // For simplicity, flush buffer when resizing
        this.flush()
        this.capacity = newCapacity
        this.buffer = new Array(this.capacity)
      }
    }

    this.emit('configUpdated', {
      oldConfig,
      newConfig: this.config
    })
  }

  /**
   * Destroy the buffer and clean up resources
   */
  destroy(): void {
    this.flush()
    this.removeAllListeners()

    this.emit('destroyed', {
      finalMetrics: this.getMetrics(),
      timestamp: Date.now()
    })
  }
}
