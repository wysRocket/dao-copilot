/**
 * Test suite for AudioStreamingPipeline
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'

// Mock dependencies with factory functions
vi.mock('../../services/gemini-live-websocket', () => ({
  GeminiLiveWebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendRealtimeInput: vi.fn().mockResolvedValue(undefined)
  }))
}))

vi.mock('../../services/real-time-audio-streaming', () => ({
  createRealTimeAudioStreaming: vi.fn().mockReturnValue({
    startStreaming: vi.fn().mockResolvedValue(undefined),
    stopStreaming: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  })
}))

vi.mock('../../services/audio-format-converter', () => ({
  AudioFormatConverter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    convert: vi.fn().mockResolvedValue({
      data: new ArrayBuffer(1024),
      format: 'pcm16',
      sampleRate: 16000,
      channels: 1,
      duration: 100,
      timestamp: Date.now()
    })
  }))
}))

vi.mock('../../services/audio-worker-manager', () => ({
  AudioWorkerManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    processChunks: vi.fn().mockResolvedValue({
      data: new ArrayBuffer(1024),
      format: 'pcm16',
      sampleRate: 16000
    }),
    destroy: vi.fn().mockResolvedValue(undefined)
  }))
}))

import {
  AudioStreamingPipeline,
  createAudioStreamingPipeline
} from '../../services/audio-streaming-pipeline'
import type {AudioPipelineConfig} from '../../services/audio-streaming-pipeline'

describe('AudioStreamingPipeline', () => {
  let pipeline: AudioStreamingPipeline
  let config: AudioPipelineConfig

  beforeEach(() => {
    vi.clearAllMocks()

    config = {
      websocket: {
        apiKey: 'test-api-key',
        model: 'gemini-live-2.5-flash-preview',
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

  describe('constructor', () => {
    it('should create pipeline with valid configuration', () => {
      expect(pipeline).toBeInstanceOf(AudioStreamingPipeline)
      expect(pipeline.isStreamingActive()).toBe(false)
    })

    it('should initialize with correct default metrics', () => {
      const metrics = pipeline.getMetrics()
      expect(metrics).toEqual({
        chunksProcessed: 0,
        bytesStreamed: 0,
        averageLatency: 0,
        errorCount: 0,
        isActive: false
      })
    })
  })

  describe('initialize', () => {
    it('should initialize all services successfully', async () => {
      await pipeline.initialize()

      expect(mockFormatConverter.initialize).toHaveBeenCalled()
      expect(mockWorkerManager.initialize).toHaveBeenCalledWith({
        inputFormat: {
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        },
        outputFormat: {
          format: 'pcm16',
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        },
        enableCompression: false,
        qualityLevel: 8,
        lowLatencyMode: true
      })
      expect(mockWebSocketClient.connect).toHaveBeenCalled()
    })

    it('should handle initialization errors', async () => {
      mockWebSocketClient.connect.mockRejectedValue(new Error('Connection failed'))

      await expect(pipeline.initialize()).rejects.toThrow('Connection failed')
    })

    it('should emit initialized event on success', async () => {
      const initSpy = vi.fn()
      pipeline.on('initialized', initSpy)

      await pipeline.initialize()

      expect(initSpy).toHaveBeenCalled()
    })
  })

  describe('startStreaming', () => {
    beforeEach(async () => {
      await pipeline.initialize()
    })

    it('should start streaming successfully', async () => {
      await pipeline.startStreaming()

      expect(mockAudioStreaming.on).toHaveBeenCalledWith('audioChunk', expect.any(Function))
      expect(mockAudioStreaming.on).toHaveBeenCalledWith('error', expect.any(Function))
      expect(mockAudioStreaming.startStreaming).toHaveBeenCalled()
      expect(pipeline.isStreamingActive()).toBe(true)
    })

    it('should emit streamingStarted event', async () => {
      const startSpy = vi.fn()
      pipeline.on('streamingStarted', startSpy)

      await pipeline.startStreaming()

      expect(startSpy).toHaveBeenCalled()
    })

    it('should not start if already active', async () => {
      await pipeline.startStreaming()
      mockAudioStreaming.startStreaming.mockClear()

      await pipeline.startStreaming()

      expect(mockAudioStreaming.startStreaming).not.toHaveBeenCalled()
    })

    it('should handle streaming start errors', async () => {
      mockAudioStreaming.startStreaming.mockRejectedValue(new Error('Start failed'))

      await expect(pipeline.startStreaming()).rejects.toThrow('Start failed')
      expect(pipeline.isStreamingActive()).toBe(false)
    })
  })

  describe('stopStreaming', () => {
    beforeEach(async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()
    })

    it('should stop streaming successfully', async () => {
      await pipeline.stopStreaming()

      expect(mockAudioStreaming.stopStreaming).toHaveBeenCalled()
      expect(pipeline.isStreamingActive()).toBe(false)
    })

    it('should emit streamingStopped event', async () => {
      const stopSpy = vi.fn()
      pipeline.on('streamingStopped', stopSpy)

      await pipeline.stopStreaming()

      expect(stopSpy).toHaveBeenCalled()
    })

    it('should handle stop when not active', async () => {
      await pipeline.stopStreaming()
      mockAudioStreaming.stopStreaming.mockClear()

      await pipeline.stopStreaming()

      expect(mockAudioStreaming.stopStreaming).not.toHaveBeenCalled()
    })
  })

  describe('audio chunk processing', () => {
    let chunkHandler: (chunk: {
      data: Float32Array
      timestamp: number
      sampleRate: number
      channels: number
    }) => Promise<void>

    beforeEach(async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()

      // Get the chunk handler that was registered
      const onCalls = mockAudioStreaming.on.mock.calls
      const audioChunkCall = onCalls.find(call => call[0] === 'audioChunk')
      chunkHandler = audioChunkCall![1]
    })

    it('should process audio chunk successfully', async () => {
      const mockChunk = {
        data: new Float32Array([0.1, 0.2, 0.3]),
        timestamp: Date.now(),
        sampleRate: 16000,
        channels: 1
      }

      await chunkHandler(mockChunk)

      expect(mockFormatConverter.convert).toHaveBeenCalledWith(mockChunk.data, mockChunk.timestamp)
      expect(mockWorkerManager.processChunks).toHaveBeenCalledWith([mockChunk.data], {
        normalize: true,
        removeNoise: false,
        enableVAD: true
      })
      expect(mockWebSocketClient.sendRealtimeInput).toHaveBeenCalledWith({
        audio: {
          data: expect.any(String), // base64 string
          mimeType: 'audio/pcm'
        }
      })
    })

    it('should handle worker processing errors with fallback', async () => {
      mockWorkerManager.processChunks.mockRejectedValue(new Error('Worker failed'))
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const mockChunk = {
        data: new Float32Array([0.1, 0.2, 0.3]),
        timestamp: Date.now(),
        sampleRate: 16000,
        channels: 1
      }

      await chunkHandler(mockChunk)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Worker processing failed, using direct processing:',
        expect.any(Error)
      )
      expect(mockWebSocketClient.sendRealtimeInput).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should update metrics after processing', async () => {
      const mockChunk = {
        data: new Float32Array([0.1, 0.2, 0.3]),
        timestamp: Date.now(),
        sampleRate: 16000,
        channels: 1
      }

      await chunkHandler(mockChunk)

      const metrics = pipeline.getMetrics()
      expect(metrics.chunksProcessed).toBe(1)
      expect(metrics.bytesStreamed).toBeGreaterThan(0)
      expect(metrics.averageLatency).toBeGreaterThan(0)
    })

    it('should emit chunkProcessed event', async () => {
      const chunkSpy = vi.fn()
      pipeline.on('chunkProcessed', chunkSpy)

      const mockChunk = {
        data: new Float32Array([0.1, 0.2, 0.3]),
        timestamp: Date.now(),
        sampleRate: 16000,
        channels: 1
      }

      await chunkHandler(mockChunk)

      expect(chunkSpy).toHaveBeenCalledWith({
        chunkId: mockChunk.timestamp,
        size: expect.any(Number),
        latency: expect.any(Number)
      })
    })

    it('should handle processing errors and update error count', async () => {
      mockFormatConverter.convert.mockRejectedValue(new Error('Conversion failed'))
      const errorSpy = vi.fn()
      pipeline.on('error', errorSpy)

      const mockChunk = {
        data: new Float32Array([0.1, 0.2, 0.3]),
        timestamp: Date.now(),
        sampleRate: 16000,
        channels: 1
      }

      await chunkHandler(mockChunk)

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error))
      expect(pipeline.getMetrics().errorCount).toBe(1)
    })
  })

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()

      await pipeline.cleanup()

      expect(mockAudioStreaming.cleanup).toHaveBeenCalled()
      expect(mockWorkerManager.destroy).toHaveBeenCalled()
      expect(mockWebSocketClient.disconnect).toHaveBeenCalled()
    })

    it('should emit cleaned event', async () => {
      const cleanedSpy = vi.fn()
      pipeline.on('cleaned', cleanedSpy)

      await pipeline.cleanup()

      expect(cleanedSpy).toHaveBeenCalled()
    })

    it('should handle cleanup errors', async () => {
      mockWebSocketClient.disconnect.mockRejectedValue(new Error('Disconnect failed'))

      await expect(pipeline.cleanup()).rejects.toThrow('Disconnect failed')
    })
  })

  describe('factory function', () => {
    it('should create pipeline with partial config', () => {
      const partialConfig: Partial<AudioPipelineConfig> = {
        websocket: {
          apiKey: 'test-key',
          model: 'gemini-live-2.5-flash-preview',
          enableReconnect: true
        }
      }

      const factoryPipeline = createAudioStreamingPipeline(partialConfig)

      expect(factoryPipeline).toBeInstanceOf(AudioStreamingPipeline)
    })

    it('should merge with default configuration', () => {
      const partialConfig: Partial<AudioPipelineConfig> = {
        websocket: {
          apiKey: 'test-key',
          model: 'gemini-live-2.5-flash-preview',
          enableReconnect: true
        },
        audio: {
          sampleRate: 22050,
          channels: 1,
          bitDepth: 16
        }
      }

      const factoryPipeline = createAudioStreamingPipeline(partialConfig)

      // The pipeline should work with merged config
      expect(factoryPipeline).toBeInstanceOf(AudioStreamingPipeline)
    })
  })

  describe('configuration without workers', () => {
    it('should work without worker manager', async () => {
      const configWithoutWorkers = {
        ...config,
        processing: {
          ...config.processing,
          enableWorkers: false
        }
      }

      const pipelineWithoutWorkers = new AudioStreamingPipeline(configWithoutWorkers)
      await pipelineWithoutWorkers.initialize()

      // Should initialize without worker manager
      expect(mockWorkerManager.initialize).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle streaming errors from audio service', async () => {
      await pipeline.initialize()
      await pipeline.startStreaming()

      const errorSpy = vi.fn()
      pipeline.on('error', errorSpy)

      // Get the error handler that was registered
      const onCalls = mockAudioStreaming.on.mock.calls
      const errorCall = onCalls.find(call => call[0] === 'error')
      const errorHandler = errorCall![1]

      const testError = new Error('Streaming error')
      errorHandler(testError)

      expect(errorSpy).toHaveBeenCalledWith(testError)
      expect(pipeline.getMetrics().errorCount).toBe(1)
    })
  })
})
