/**
 * End-to-End Test Suite for Audio Streaming Pipeline
 *
 * Comprehensive tests for the complete audio streaming to WebSocket flow,
 * including performance monitoring, error handling, and optimization validation.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  AudioStreamingPipeline,
  createAudioStreamingPipeline
} from '../../services/audio-streaming-pipeline'
import type {AudioPipelineConfig} from '../../services/audio-streaming-pipeline'

// Performance monitoring utilities
class PerformanceMonitor {
  private metrics: {
    startTime: number
    endTime?: number
    memoryStart: number
    memoryEnd?: number
    cpuStart: number
    cpuEnd?: number
  } = {
    startTime: 0,
    memoryStart: 0,
    cpuStart: 0
  }

  start(): void {
    this.metrics.startTime = performance.now()
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.metrics.memoryStart = process.memoryUsage().heapUsed
    }
    this.metrics.cpuStart = performance.now()
  }

  stop(): void {
    this.metrics.endTime = performance.now()
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.metrics.memoryEnd = process.memoryUsage().heapUsed
    }
    this.metrics.cpuEnd = performance.now()
  }

  getResults() {
    return {
      duration: this.metrics.endTime ? this.metrics.endTime - this.metrics.startTime : 0,
      memoryDelta: this.metrics.memoryEnd ? this.metrics.memoryEnd - this.metrics.memoryStart : 0,
      cpuTime: this.metrics.cpuEnd ? this.metrics.cpuEnd - this.metrics.cpuStart : 0
    }
  }
}

// Mock implementations for E2E testing
const createMockAudioData = (duration: number, sampleRate: number = 16000): Float32Array => {
  const samples = Math.floor(duration * sampleRate)
  const audioData = new Float32Array(samples)

  // Generate sine wave audio data for realistic testing
  for (let i = 0; i < samples; i++) {
    audioData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5 // 440Hz tone
  }

  return audioData
}

const createMockWebSocketClient = () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  sendRealtimeInput: vi.fn().mockImplementation(async () => {
    // Simulate realistic WebSocket latency
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20))
    return Promise.resolve()
  }),
  isConnected: vi.fn().mockReturnValue(true)
})

const createMockFormatConverter = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  convert: vi.fn().mockImplementation(async (data, timestamp) => {
    // Simulate conversion processing time
    await new Promise(resolve => setTimeout(resolve, 1 + Math.random() * 3))

    return {
      data: new ArrayBuffer(data.length * 2), // PCM16 = 2 bytes per sample
      format: 'pcm16',
      sampleRate: 16000,
      channels: 1,
      duration: (data.length / 16000) * 1000, // duration in ms
      timestamp
    }
  })
})

const createMockWorkerManager = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  processChunks: vi.fn().mockImplementation(async chunks => {
    // Simulate worker processing time
    await new Promise(resolve => setTimeout(resolve, 2 + Math.random() * 5))

    const totalSamples = chunks.reduce((sum: number, chunk: Float32Array) => sum + chunk.length, 0)
    return {
      data: new ArrayBuffer(totalSamples * 2),
      format: 'pcm16',
      sampleRate: 16000
    }
  }),
  destroy: vi.fn().mockResolvedValue(undefined)
})

const createMockAudioStreaming = () => {
  const eventListeners: {[key: string]: ((...args: unknown[]) => void)[]} = {}

  return {
    startStreaming: vi.fn().mockResolvedValue(undefined),
    stopStreaming: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((event: string, listener: (...args: unknown[]) => void) => {
      if (!eventListeners[event]) {
        eventListeners[event] = []
      }
      eventListeners[event].push(listener)
    }),
    off: vi.fn(),
    emit: vi.fn().mockImplementation((event: string, ...args: unknown[]) => {
      if (eventListeners[event]) {
        eventListeners[event].forEach(listener => listener(...args))
      }
    }),
    // Helper for testing
    _triggerAudioChunk: (chunk: Float32Array) => {
      if (eventListeners['audioChunk']) {
        eventListeners['audioChunk'].forEach(listener => listener(chunk))
      }
    },
    _triggerError: (error: Error) => {
      if (eventListeners['error']) {
        eventListeners['error'].forEach(listener => listener(error))
      }
    }
  }
}

// Mock the dependencies for E2E testing
vi.mock('../../services/gemini-live-websocket', () => ({
  GeminiLiveWebSocketClient: vi.fn(() => createMockWebSocketClient())
}))

vi.mock('../../services/real-time-audio-streaming', () => ({
  createRealTimeAudioStreaming: vi.fn(() => createMockAudioStreaming())
}))

vi.mock('../../services/audio-format-converter', () => ({
  AudioFormatConverter: vi.fn(() => createMockFormatConverter())
}))

vi.mock('../../services/audio-worker-manager', () => ({
  AudioWorkerManager: vi.fn(() => createMockWorkerManager())
}))

describe('AudioStreamingPipeline - End-to-End Tests', () => {
  let pipeline: AudioStreamingPipeline
  let config: AudioPipelineConfig
  let performanceMonitor: PerformanceMonitor

  beforeEach(() => {
    vi.clearAllMocks()
    performanceMonitor = new PerformanceMonitor()

    config = {
      websocket: {
        apiKey: 'test-api-key-e2e',
        model: 'gemini-2.0-flash-exp',
        enableReconnect: true
      },
      audio: {
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
      },
      processing: {
        enableWorkers: true,
        bufferSize: 4096,
        enableVAD: true,
        vadThreshold: 0.01
      }
    }

    pipeline = new AudioStreamingPipeline(config)
  })

  afterEach(async () => {
    try {
      if (pipeline.isStreamingActive()) {
        await pipeline.stopStreaming()
      }
      await pipeline.cleanup()
    } catch {
      // Ignore cleanup errors in tests
    }
  })

  describe('Complete Pipeline Flow', () => {
    it('should initialize and stream audio end-to-end', async () => {
      performanceMonitor.start()

      // Initialize pipeline
      await pipeline.initialize()
      expect(pipeline.isStreamingActive()).toBe(false)

      // Start streaming
      await pipeline.startStreaming()
      expect(pipeline.isStreamingActive()).toBe(true)

      // Simulate audio chunks
      const mockAudioService = createMockAudioStreaming()
      const audioData = createMockAudioData(0.1) // 100ms of audio

      const chunkPromises: Promise<void>[] = []

      // Process multiple chunks to simulate real streaming
      for (let i = 0; i < 5; i++) {
        const chunk = {
          data: audioData,
          timestamp: Date.now() + i * 100,
          sampleRate: 16000,
          channels: 1
        }
        mockAudioService._triggerAudioChunk(chunk.data)
      }

      // Wait for all chunks to be processed
      await Promise.all(chunkPromises)

      // Verify metrics
      const metrics = pipeline.getMetrics()
      expect(metrics.chunksProcessed).toBe(5)
      expect(metrics.bytesStreamed).toBeGreaterThan(0)
      expect(metrics.averageLatency).toBeGreaterThan(0)
      expect(metrics.isActive).toBe(true)

      // Stop streaming
      await pipeline.stopStreaming()
      expect(pipeline.isStreamingActive()).toBe(false)

      performanceMonitor.stop()
      const perfResults = performanceMonitor.getResults()

      // Performance assertions
      expect(perfResults.duration).toBeLessThan(5000) // Should complete within 5 seconds

      console.log('E2E Performance Results:', {
        duration: `${perfResults.duration.toFixed(2)}ms`,
        chunksProcessed: metrics.chunksProcessed,
        averageLatency: `${metrics.averageLatency.toFixed(2)}ms`,
        bytesStreamed: metrics.bytesStreamed
      })
    }, 10000) // 10 second timeout for E2E test

    it('should handle high-throughput audio streaming', async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()

      const mockAudioService = vi
        .mocked(await import('../../services/real-time-audio-streaming'))
        .createRealTimeAudioStreaming()
      const chunkHandler = mockAudioService.on.mock.calls.find(
        call => call[0] === 'audioChunk'
      )?.[1]

      performanceMonitor.start()

      // Simulate high-frequency audio chunks (10ms intervals)
      const audioData = createMockAudioData(0.01) // 10ms chunks
      const numberOfChunks = 100 // 1 second of audio at 10ms intervals

      const chunkPromises: Promise<void>[] = []

      if (chunkHandler) {
        for (let i = 0; i < numberOfChunks; i++) {
          const chunk = {
            data: audioData,
            timestamp: Date.now() + i * 10,
            sampleRate: 16000,
            channels: 1
          }
          chunkPromises.push(chunkHandler(chunk))
        }
      }

      await Promise.all(chunkPromises)
      performanceMonitor.stop()

      const metrics = pipeline.getMetrics()
      const perfResults = performanceMonitor.getResults()

      // High-throughput performance assertions
      expect(metrics.chunksProcessed).toBe(numberOfChunks)
      expect(metrics.averageLatency).toBeLessThan(50) // Average latency should be under 50ms
      expect(perfResults.duration).toBeLessThan(3000) // Should process within 3 seconds

      console.log('High-Throughput Performance:', {
        chunksPerSecond: (numberOfChunks / (perfResults.duration / 1000)).toFixed(2),
        averageLatency: `${metrics.averageLatency.toFixed(2)}ms`,
        totalDuration: `${perfResults.duration.toFixed(2)}ms`
      })
    }, 15000)

    it('should maintain performance under error conditions', async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()

      const mockAudioService = vi
        .mocked(await import('../../services/real-time-audio-streaming'))
        .createRealTimeAudioStreaming()
      const chunkHandler = mockAudioService.on.mock.calls.find(
        call => call[0] === 'audioChunk'
      )?.[1]
      const errorHandler = mockAudioService.on.mock.calls.find(call => call[0] === 'error')?.[1]

      const errorSpy = vi.fn()
      pipeline.on('error', errorSpy)

      // Process some normal chunks
      const normalAudioData = createMockAudioData(0.05)

      if (chunkHandler) {
        // Process 3 normal chunks
        for (let i = 0; i < 3; i++) {
          await chunkHandler({
            data: normalAudioData,
            timestamp: Date.now() + i * 50,
            sampleRate: 16000,
            channels: 1
          })
        }

        // Trigger an error
        if (errorHandler) {
          errorHandler(new Error('Simulated streaming error'))
        }

        // Process more chunks after error
        for (let i = 3; i < 6; i++) {
          await chunkHandler({
            data: normalAudioData,
            timestamp: Date.now() + i * 50,
            sampleRate: 16000,
            channels: 1
          })
        }
      }

      const metrics = pipeline.getMetrics()

      // Verify error handling
      expect(errorSpy).toHaveBeenCalled()
      expect(metrics.errorCount).toBe(1)
      expect(metrics.chunksProcessed).toBe(6) // Should continue processing after error
      expect(pipeline.isStreamingActive()).toBe(true) // Should remain active
    })
  })

  describe('Performance Optimization Validation', () => {
    it('should optimize memory usage during streaming', async () => {
      await pipeline.initialize()

      const initialMetrics = pipeline.getMetrics()
      const memoryBefore = typeof process !== 'undefined' ? process.memoryUsage?.()?.heapUsed : 0

      await pipeline.startStreaming()

      const mockAudioService = vi
        .mocked(await import('../../services/real-time-audio-streaming'))
        .createRealTimeAudioStreaming()
      const chunkHandler = mockAudioService.on.mock.calls.find(
        call => call[0] === 'audioChunk'
      )?.[1]

      // Stream for extended period
      const audioData = createMockAudioData(0.02) // 20ms chunks

      if (chunkHandler) {
        for (let i = 0; i < 50; i++) {
          await chunkHandler({
            data: audioData,
            timestamp: Date.now() + i * 20,
            sampleRate: 16000,
            channels: 1
          })
        }
      }

      const finalMetrics = pipeline.getMetrics()
      const memoryAfter = typeof process !== 'undefined' ? process.memoryUsage?.()?.heapUsed : 0

      // Memory optimization assertions
      expect(finalMetrics.chunksProcessed).toBe(50)

      if (memoryBefore && memoryAfter) {
        const memoryIncrease = memoryAfter - memoryBefore
        const memoryPerChunk = memoryIncrease / finalMetrics.chunksProcessed

        // Memory usage should be reasonable per chunk
        expect(memoryPerChunk).toBeLessThan(1024 * 100) // Less than 100KB per chunk

        console.log('Memory Usage Analysis:', {
          initialMemory: `${(memoryBefore / 1024 / 1024).toFixed(2)}MB`,
          finalMemory: `${(memoryAfter / 1024 / 1024).toFixed(2)}MB`,
          memoryPerChunk: `${(memoryPerChunk / 1024).toFixed(2)}KB`
        })
      }
    })

    it('should maintain low latency under load', async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()

      const mockAudioService = vi
        .mocked(await import('../../services/real-time-audio-streaming'))
        .createRealTimeAudioStreaming()
      const chunkHandler = mockAudioService.on.mock.calls.find(
        call => call[0] === 'audioChunk'
      )?.[1]

      const latencyMeasurements: number[] = []

      pipeline.on('chunkProcessed', (data: any) => {
        latencyMeasurements.push(data.latency)
      })

      // Process chunks with varying sizes
      const chunkSizes = [0.01, 0.02, 0.05, 0.1] // 10ms, 20ms, 50ms, 100ms

      if (chunkHandler) {
        for (const size of chunkSizes) {
          const audioData = createMockAudioData(size)
          for (let i = 0; i < 5; i++) {
            await chunkHandler({
              data: audioData,
              timestamp: Date.now(),
              sampleRate: 16000,
              channels: 1
            })
          }
        }
      }

      // Latency analysis
      const averageLatency =
        latencyMeasurements.reduce((sum, lat) => sum + lat, 0) / latencyMeasurements.length
      const maxLatency = Math.max(...latencyMeasurements)
      const minLatency = Math.min(...latencyMeasurements)

      // Latency optimization assertions
      expect(averageLatency).toBeLessThan(100) // Average latency under 100ms
      expect(maxLatency).toBeLessThan(200) // Maximum latency under 200ms
      expect(minLatency).toBeGreaterThan(0) // All chunks should have some processing time

      console.log('Latency Analysis:', {
        average: `${averageLatency.toFixed(2)}ms`,
        min: `${minLatency.toFixed(2)}ms`,
        max: `${maxLatency.toFixed(2)}ms`,
        samples: latencyMeasurements.length
      })
    })
  })

  describe('Error Recovery and Resilience', () => {
    it('should recover from WebSocket connection failures', async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()

      const mockWebSocket = vi
        .mocked(await import('../../services/gemini-live-websocket'))
        .GeminiLiveWebSocketClient()

      // Simulate WebSocket failure
      mockWebSocket.sendRealtimeInput.mockRejectedValueOnce(new Error('WebSocket connection lost'))

      const mockAudioService = vi
        .mocked(await import('../../services/real-time-audio-streaming'))
        .createRealTimeAudioStreaming()
      const chunkHandler = mockAudioService.on.mock.calls.find(
        call => call[0] === 'audioChunk'
      )?.[1]

      const errorSpy = vi.fn()
      pipeline.on('error', errorSpy)

      if (chunkHandler) {
        // First chunk should fail
        await chunkHandler({
          data: createMockAudioData(0.05),
          timestamp: Date.now(),
          sampleRate: 16000,
          channels: 1
        })

        // Restore WebSocket connection
        mockWebSocket.sendRealtimeInput.mockResolvedValue(undefined)

        // Second chunk should succeed
        await chunkHandler({
          data: createMockAudioData(0.05),
          timestamp: Date.now() + 100,
          sampleRate: 16000,
          channels: 1
        })
      }

      const metrics = pipeline.getMetrics()

      // Recovery assertions
      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
      expect(metrics.errorCount).toBe(1)
      expect(metrics.chunksProcessed).toBe(2)
      expect(pipeline.isStreamingActive()).toBe(true)
    })

    it('should handle worker failures gracefully', async () => {
      // Configure pipeline with workers enabled
      const workerConfig = {...config, processing: {...config.processing, enableWorkers: true}}
      const workerPipeline = new AudioStreamingPipeline(workerConfig)

      await workerPipeline.initialize()
      await workerPipeline.startStreaming()

      const mockWorkerManager = vi
        .mocked(await import('../../services/audio-worker-manager'))
        .AudioWorkerManager()

      // Simulate worker failure
      mockWorkerManager.processChunks.mockRejectedValueOnce(new Error('Worker crashed'))

      const mockAudioService = vi
        .mocked(await import('../../services/real-time-audio-streaming'))
        .createRealTimeAudioStreaming()
      const chunkHandler = mockAudioService.on.mock.calls.find(
        call => call[0] === 'audioChunk'
      )?.[1]

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      if (chunkHandler) {
        // Process chunk with worker failure
        await chunkHandler({
          data: createMockAudioData(0.05),
          timestamp: Date.now(),
          sampleRate: 16000,
          channels: 1
        })
      }

      const metrics = workerPipeline.getMetrics()

      // Graceful degradation assertions
      expect(consoleSpy).toHaveBeenCalledWith(
        'Worker processing failed, using direct processing:',
        expect.any(Error)
      )
      expect(metrics.chunksProcessed).toBe(1)
      expect(workerPipeline.isStreamingActive()).toBe(true)

      consoleSpy.mockRestore()
      await workerPipeline.cleanup()
    })
  })

  describe('Configuration and Factory Testing', () => {
    it('should work with minimal configuration', async () => {
      const minimalPipeline = createAudioStreamingPipeline({
        websocket: {
          apiKey: 'minimal-test-key',
          model: 'gemini-2.0-flash-exp',
          enableReconnect: false
        }
      })

      await minimalPipeline.initialize()
      expect(minimalPipeline.isStreamingActive()).toBe(false)

      await minimalPipeline.startStreaming()
      expect(minimalPipeline.isStreamingActive()).toBe(true)

      await minimalPipeline.cleanup()
    })

    it('should optimize for low-latency configuration', async () => {
      const lowLatencyConfig: AudioPipelineConfig = {
        websocket: {
          apiKey: 'low-latency-test',
          model: 'gemini-2.0-flash-exp',
          enableReconnect: true
        },
        audio: {
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        },
        processing: {
          enableWorkers: false, // Disable workers for lower latency
          bufferSize: 1024, // Smaller buffer
          enableVAD: false, // Disable VAD for lower latency
          vadThreshold: 0.1
        }
      }

      const lowLatencyPipeline = new AudioStreamingPipeline(lowLatencyConfig)

      await lowLatencyPipeline.initialize()
      await lowLatencyPipeline.startStreaming()

      const mockAudioService = vi
        .mocked(await import('../../services/real-time-audio-streaming'))
        .createRealTimeAudioStreaming()
      const chunkHandler = mockAudioService.on.mock.calls.find(
        call => call[0] === 'audioChunk'
      )?.[1]

      const latencyMeasurements: number[] = []
      lowLatencyPipeline.on('chunkProcessed', (data: any) => {
        latencyMeasurements.push(data.latency)
      })

      if (chunkHandler) {
        for (let i = 0; i < 10; i++) {
          await chunkHandler({
            data: createMockAudioData(0.01), // 10ms chunks for low latency
            timestamp: Date.now() + i * 10,
            sampleRate: 16000,
            channels: 1
          })
        }
      }

      const averageLatency =
        latencyMeasurements.reduce((sum, lat) => sum + lat, 0) / latencyMeasurements.length

      // Low latency assertions
      expect(averageLatency).toBeLessThan(50) // Should be under 50ms for low-latency config

      await lowLatencyPipeline.cleanup()
    })
  })
})
