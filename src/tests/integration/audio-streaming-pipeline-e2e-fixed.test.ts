/**
 * End-to-End tests for AudioStreamingPipeline
 * Tests the complete audio streaming flow with real-world scenarios
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {AudioStreamingPipeline} from '../../services/audio-streaming-pipeline'
import type {AudioPipelineConfig} from '../../services/audio-streaming-pipeline'

// Mock modules
vi.mock('../../services/gemini-live-websocket')
vi.mock('../../services/real-time-audio-streaming')
vi.mock('../../services/audio-worker-manager')
vi.mock('../../services/audio-format-converter')

// Mock implementations
const createMockWebSocketClient = () => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  sendRealtimeInput: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn()
})

const createMockAudioFormatConverter = () => ({
  processChunks: vi.fn().mockImplementation(async (chunks: Float32Array[]) => {
    const totalSamples = chunks.reduce((sum: number, chunk: Float32Array) => sum + chunk.length, 0)
    return {
      data: new ArrayBuffer(totalSamples * 2),
      format: 'pcm16',
      sampleRate: 16000
    }
  }),
  destroy: vi.fn().mockResolvedValue(undefined)
})

const createMockAudioWorkerManager = () => ({
  processAudio: vi.fn().mockImplementation(async (data: Float32Array) => data),
  destroy: vi.fn().mockResolvedValue(undefined)
})

interface MockAudioService {
  startStreaming: ReturnType<typeof vi.fn>
  stopStreaming: ReturnType<typeof vi.fn>
  cleanup: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  _triggerAudioChunk: (chunk: Float32Array) => void
  _triggerError: (error: Error) => void
  _getEventListeners: (event: string) => ((...args: unknown[]) => void)[]
}

const createMockAudioStreaming = (): MockAudioService => {
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
        eventListeners['audioChunk'].forEach(listener =>
          listener({
            data: chunk,
            timestamp: Date.now(),
            sampleRate: 16000,
            channels: 1
          })
        )
      }
    },
    _triggerError: (error: Error) => {
      if (eventListeners['error']) {
        eventListeners['error'].forEach(listener => listener(error))
      }
    },
    _getEventListeners: (event: string) => eventListeners[event] || []
  }
}

// Set up module mocks
vi.mock('../../services/gemini-live-websocket', () => ({
  GeminiLiveWebSocketClient: vi.fn().mockImplementation(() => createMockWebSocketClient())
}))

vi.mock('../../services/real-time-audio-streaming', () => ({
  createRealTimeAudioStreaming: vi.fn(() => createMockAudioStreaming())
}))

vi.mock('../../services/audio-worker-manager', () => ({
  AudioWorkerManager: vi.fn().mockImplementation(() => createMockAudioWorkerManager())
}))

vi.mock('../../services/audio-format-converter', () => ({
  AudioFormatConverter: vi.fn().mockImplementation(() => createMockAudioFormatConverter())
}))

describe('AudioStreamingPipeline E2E Tests', () => {
  let pipeline: AudioStreamingPipeline
  let mockAudioService: MockAudioService

  const defaultConfig: AudioPipelineConfig = {
    audio: {
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16
    },
    websocket: {
      apiKey: 'test-key',
      model: 'gemini-live-2.5-flash-preview'
    },
    processing: {
      useWebWorkers: false,
      batchSize: 4096,
      bufferSize: 8192
    }
  }

  const createMockAudioData = (durationSeconds: number): Float32Array => {
    const sampleRate = 16000
    const samples = Math.floor(sampleRate * durationSeconds)
    const audioData = new Float32Array(samples)

    // Generate sine wave for testing
    for (let i = 0; i < samples; i++) {
      audioData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
    }

    return audioData
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    pipeline = new AudioStreamingPipeline(defaultConfig)

    // Create fresh mock for each test
    mockAudioService = createMockAudioStreaming()

    // Mock the factory function to return our specific mock
    const {createRealTimeAudioStreaming} = await import('../../services/real-time-audio-streaming')
    vi.mocked(createRealTimeAudioStreaming).mockReturnValue(mockAudioService as any)
  })

  afterEach(async () => {
    if (pipeline) {
      await pipeline.stopStreaming()
      await pipeline.destroy()
    }
  })

  describe('Pipeline Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(pipeline).toBeDefined()
      expect(pipeline.isStreamingActive()).toBe(false)
    })

    it('should validate configuration on initialization', () => {
      expect(() => {
        new AudioStreamingPipeline({
          ...defaultConfig,
          audio: {...defaultConfig.audio, sampleRate: -1}
        })
      }).toThrow('Invalid sample rate')
    })

    it('should return current configuration', () => {
      const config = pipeline.getConfiguration()
      expect(config).toEqual(defaultConfig)
    })
  })

  describe('Streaming Lifecycle', () => {
    it('should start and stop streaming successfully', async () => {
      expect(pipeline.isStreamingActive()).toBe(false)

      await pipeline.startStreaming()
      expect(pipeline.isStreamingActive()).toBe(true)
      expect(mockAudioService.startStreaming).toHaveBeenCalled()

      await pipeline.stopStreaming()
      expect(pipeline.isStreamingActive()).toBe(false)
      expect(mockAudioService.stopStreaming).toHaveBeenCalled()
    })

    it('should handle multiple start calls gracefully', async () => {
      await pipeline.startStreaming()
      await pipeline.startStreaming() // Should not throw

      expect(mockAudioService.startStreaming).toHaveBeenCalledTimes(1)
    })

    it('should handle stop when not started', async () => {
      await pipeline.stopStreaming() // Should not throw
      expect(mockAudioService.stopStreaming).not.toHaveBeenCalled()
    })
  })

  describe('Audio Processing Flow', () => {
    it('should process audio chunks through the pipeline', async () => {
      await pipeline.startStreaming()

      const audioData = createMockAudioData(0.1) // 100ms of audio

      // Trigger audio chunk processing
      mockAudioService._triggerAudioChunk(audioData)

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100))

      const metrics = pipeline.getMetrics()
      expect(metrics.chunksProcessed).toBeGreaterThan(0)
    })

    it('should handle audio processing errors gracefully', async () => {
      await pipeline.startStreaming()

      const errorHandler = vi.fn()
      pipeline.on('error', errorHandler)

      // Trigger an error in audio processing
      const testError = new Error('Audio processing failed')
      mockAudioService._triggerError(testError)

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Audio processing failed')
        })
      )
    })

    it('should maintain performance metrics', async () => {
      await pipeline.startStreaming()

      const audioData = createMockAudioData(0.1)
      mockAudioService._triggerAudioChunk(audioData)

      await new Promise(resolve => setTimeout(resolve, 100))

      const metrics = pipeline.getMetrics()
      expect(metrics).toHaveProperty('chunksProcessed')
      expect(metrics).toHaveProperty('bytesProcessed')
      expect(metrics).toHaveProperty('averageLatency')
      expect(metrics).toHaveProperty('errorCount')
    })
  })

  describe('Event Handling', () => {
    it('should emit chunkProcessed events', async () => {
      const chunkHandler = vi.fn()
      pipeline.on('chunkProcessed', chunkHandler)

      await pipeline.startStreaming()

      const audioData = createMockAudioData(0.1)
      mockAudioService._triggerAudioChunk(audioData)

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(chunkHandler).toHaveBeenCalled()
    })

    it('should handle event listener removal', () => {
      const handler = vi.fn()
      pipeline.on('chunkProcessed', handler)
      pipeline.off('chunkProcessed', handler)

      // Trigger event - should not call handler
      pipeline.emit('chunkProcessed', {size: 1024, timestamp: Date.now()})
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('WebSocket Integration', () => {
    it('should integrate with WebSocket client for real-time transmission', async () => {
      await pipeline.startStreaming()

      const audioData = createMockAudioData(0.1)
      mockAudioService._triggerAudioChunk(audioData)

      await new Promise(resolve => setTimeout(resolve, 100))

      // WebSocket client should receive processed audio data
      const {GeminiLiveWebSocketClient} = await import('../../services/gemini-live-websocket')
      const mockWebSocketConstructor = vi.mocked(GeminiLiveWebSocketClient)
      const mockWebSocketInstance = mockWebSocketConstructor.mock.results[0]?.value

      if (mockWebSocketInstance) {
        expect(mockWebSocketInstance.sendRealtimeInput).toHaveBeenCalled()
      }
    })
  })

  describe('Worker Integration', () => {
    it('should use Web Workers when enabled', async () => {
      const workerConfig: AudioPipelineConfig = {
        ...defaultConfig,
        processing: {
          ...defaultConfig.processing,
          useWebWorkers: true
        }
      }

      const workerPipeline = new AudioStreamingPipeline(workerConfig)
      await workerPipeline.startStreaming()

      const audioData = createMockAudioData(0.1)
      mockAudioService._triggerAudioChunk(audioData)

      await new Promise(resolve => setTimeout(resolve, 100))

      const {AudioWorkerManager} = await import('../../services/audio-worker-manager')
      const mockWorkerConstructor = vi.mocked(AudioWorkerManager)
      expect(mockWorkerConstructor).toHaveBeenCalled()

      await workerPipeline.destroy()
    })
  })

  describe('Performance Optimization', () => {
    it('should handle high-frequency audio chunks efficiently', async () => {
      await pipeline.startStreaming()

      const startTime = Date.now()
      const audioData = createMockAudioData(0.01) // 10ms chunks

      // Simulate rapid audio chunks
      for (let i = 0; i < 50; i++) {
        mockAudioService._triggerAudioChunk(audioData)
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      const endTime = Date.now()
      const totalTime = endTime - startTime

      // Should process efficiently (less than 500ms for 50 chunks)
      expect(totalTime).toBeLessThan(500)

      const metrics = pipeline.getMetrics()
      expect(metrics.chunksProcessed).toBeGreaterThan(0)
    })

    it('should maintain low latency under load', async () => {
      const lowLatencyConfig: AudioPipelineConfig = {
        ...defaultConfig,
        processing: {
          ...defaultConfig.processing,
          batchSize: 1024, // Smaller batch for lower latency
          bufferSize: 2048
        }
      }

      const lowLatencyPipeline = new AudioStreamingPipeline(lowLatencyConfig)
      await lowLatencyPipeline.startStreaming()

      const chunkHandler = vi.fn()
      lowLatencyPipeline.on('chunkProcessed', chunkHandler)

      const audioData = createMockAudioData(0.05) // 50ms chunk
      mockAudioService._triggerAudioChunk(audioData)

      await new Promise(resolve => setTimeout(resolve, 100))

      const metrics = lowLatencyPipeline.getMetrics()
      expect(metrics.averageLatency).toBeLessThan(100) // Less than 100ms average latency

      await lowLatencyPipeline.destroy()
    })
  })

  describe('Error Recovery', () => {
    it('should recover from temporary WebSocket errors', async () => {
      await pipeline.startStreaming()

      const errorHandler = vi.fn()
      pipeline.on('error', errorHandler)

      // Simulate WebSocket error
      const wsError = new Error('WebSocket connection failed')
      mockAudioService._triggerError(wsError)

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should continue processing after error
      const audioData = createMockAudioData(0.1)
      mockAudioService._triggerAudioChunk(audioData)

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(errorHandler).toHaveBeenCalled()
      expect(pipeline.isStreamingActive()).toBe(true) // Should still be active
    })

    it('should handle audio service failures gracefully', async () => {
      await pipeline.startStreaming()

      const errorHandler = vi.fn()
      pipeline.on('error', errorHandler)

      // Simulate audio service failure
      mockAudioService.startStreaming.mockRejectedValueOnce(new Error('Audio service failed'))

      // Try to restart
      await pipeline.stopStreaming()
      await expect(pipeline.startStreaming()).rejects.toThrow()

      expect(errorHandler).toHaveBeenCalled()
    })
  })

  describe('Resource Management', () => {
    it('should clean up resources on destroy', async () => {
      await pipeline.startStreaming()

      const audioData = createMockAudioData(0.1)
      mockAudioService._triggerAudioChunk(audioData)

      await pipeline.destroy()

      expect(mockAudioService.cleanup).toHaveBeenCalled()
      expect(pipeline.isStreamingActive()).toBe(false)
    })

    it('should handle multiple destroy calls safely', async () => {
      await pipeline.startStreaming()
      await pipeline.destroy()
      await pipeline.destroy() // Should not throw

      expect(mockAudioService.cleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe('Configuration Validation', () => {
    it('should validate audio configuration parameters', () => {
      expect(() => {
        new AudioStreamingPipeline({
          ...defaultConfig,
          audio: {...defaultConfig.audio, channels: 0}
        })
      }).toThrow('Invalid channels')
    })

    it('should validate processing configuration', () => {
      expect(() => {
        new AudioStreamingPipeline({
          ...defaultConfig,
          processing: {...defaultConfig.processing, batchSize: 0}
        })
      }).toThrow('Invalid batch size')
    })

    it('should validate WebSocket configuration', () => {
      expect(() => {
        new AudioStreamingPipeline({
          ...defaultConfig,
          websocket: {...defaultConfig.websocket, apiKey: ''}
        })
      }).toThrow('API key is required')
    })
  })
})
