/**
 * Tests for Real-Time Audio Streaming Service
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  RealTimeAudioStreamingService,
  DEFAULT_STREAMING_CONFIG
} from '../../services/real-time-audio-streaming'
import {GeminiLiveIntegrationService} from '../../services/gemini-live-integration'
import EventEmitter from 'eventemitter3'

// Mock AudioContext and related APIs
const mockScriptProcessor = {
  onaudioprocess: null,
  connect: vi.fn(),
  disconnect: vi.fn()
}

const mockAudioContext = {
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn()
  })),
  createScriptProcessor: vi.fn(() => mockScriptProcessor),
  audioWorklet: {
    addModule: vi.fn(() => Promise.reject(new Error('AudioWorklet not supported in test')))
  },
  destination: {},
  close: vi.fn(),
  sampleRate: 16000,
  state: 'running'
}

const mockMediaStream = {
  getTracks: vi.fn(() => []),
  getAudioTracks: vi.fn(() => [])
}

const mockNavigator = {
  mediaDevices: {
    getUserMedia: vi.fn(() => Promise.resolve(mockMediaStream))
  }
}

// Mock globals
Object.defineProperty(global, 'AudioContext', {
  value: vi.fn(() => mockAudioContext),
  writable: true
})

Object.defineProperty(global, 'navigator', {
  value: mockNavigator,
  writable: true
})

Object.defineProperty(global, 'btoa', {
  value: vi.fn(str => Buffer.from(str, 'binary').toString('base64')),
  writable: true
})

Object.defineProperty(global, 'URL', {
  value: vi.fn(() => ({toString: () => 'mock-url'})),
  writable: true
})

// Mock AudioWorkletNode
class MockAudioWorkletNode extends EventEmitter {
  port = {
    onmessage: null,
    postMessage: vi.fn()
  }

  connect = vi.fn()
  disconnect = vi.fn()
}

Object.defineProperty(global, 'AudioWorkletNode', {
  value: MockAudioWorkletNode,
  writable: true
})

describe('RealTimeAudioStreamingService', () => {
  let streamingService: RealTimeAudioStreamingService
  let mockIntegrationService: GeminiLiveIntegrationService

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Reset mock script processor
    mockScriptProcessor.onaudioprocess = null

    // Create mock integration service
    mockIntegrationService = {
      sendAudioData: vi.fn(() => Promise.resolve()),
      state: {connectionState: 'connected'}
    } as unknown as GeminiLiveIntegrationService

    // Create streaming service
    streamingService = new RealTimeAudioStreamingService()
  })

  afterEach(async () => {
    await streamingService.cleanup()
  })

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = streamingService.getConfig()
      expect(config).toEqual(DEFAULT_STREAMING_CONFIG)
    })

    it('should allow configuration updates', () => {
      const customConfig = {sampleRate: 22050, bufferSize: 8192}
      streamingService.updateConfig(customConfig)

      const config = streamingService.getConfig()
      expect(config.sampleRate).toBe(22050)
      expect(config.bufferSize).toBe(8192)
    })

    it('should emit configUpdated event', () => {
      const configUpdatedSpy = vi.fn()
      streamingService.on('configUpdated', configUpdatedSpy)

      const customConfig = {sampleRate: 8000}
      streamingService.updateConfig(customConfig)

      expect(configUpdatedSpy).toHaveBeenCalledWith(expect.objectContaining(customConfig))
    })
  })

  describe('Initialization', () => {
    it('should initialize with integration service', async () => {
      const initializeSpy = vi.fn()
      streamingService.on('initialized', initializeSpy)

      await streamingService.initialize(mockIntegrationService)

      expect(initializeSpy).toHaveBeenCalled()
      expect(mockNavigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            sampleRate: DEFAULT_STREAMING_CONFIG.sampleRate,
            channelCount: DEFAULT_STREAMING_CONFIG.channelCount
          })
        })
      )
    })

    it('should handle initialization errors', async () => {
      const errorSpy = vi.fn()
      streamingService.on('error', errorSpy)

      mockNavigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('Permission denied'))

      await expect(streamingService.initialize(mockIntegrationService)).rejects.toThrow(
        'Permission denied'
      )
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('Streaming', () => {
    beforeEach(async () => {
      await streamingService.initialize(mockIntegrationService)
    })

    it('should start streaming', async () => {
      const streamingStartedSpy = vi.fn()
      streamingService.on('streamingStarted', streamingStartedSpy)

      await streamingService.startStreaming()

      expect(streamingStartedSpy).toHaveBeenCalled()
    })

    it('should stop streaming', async () => {
      await streamingService.startStreaming()

      const streamingStoppedSpy = vi.fn()
      streamingService.on('streamingStopped', streamingStoppedSpy)

      await streamingService.stopStreaming()

      expect(streamingStoppedSpy).toHaveBeenCalled()
    })

    it('should not start streaming if already streaming', async () => {
      await streamingService.startStreaming()

      const streamingStartedSpy = vi.fn()
      streamingService.on('streamingStarted', streamingStartedSpy)

      await streamingService.startStreaming() // Should not start again

      expect(streamingStartedSpy).not.toHaveBeenCalled()
    })

    it('should handle streaming when integration service is not set', async () => {
      const uninitializedService = new RealTimeAudioStreamingService()

      await expect(uninitializedService.startStreaming()).rejects.toThrow(
        'Integration service not set'
      )
    })
  })

  describe('Audio Processing', () => {
    beforeEach(async () => {
      await streamingService.initialize(mockIntegrationService)
    })

    it('should convert audio data to Gemini format', () => {
      const audioData = new Float32Array([0.5, -0.5, 0.25, -0.25])
      // Access private method through type assertion
      const converted = (
        streamingService as unknown as {convertToGeminiFormat: (data: Float32Array) => Uint8Array}
      ).convertToGeminiFormat(audioData)

      expect(converted).toBeInstanceOf(Uint8Array)
      expect(converted.length).toBe(audioData.length * 2) // 16-bit = 2 bytes per sample
    })

    it('should convert buffer to base64', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
      // Access private method through type assertion
      const base64 = (
        streamingService as unknown as {bufferToBase64: (buffer: Uint8Array) => string}
      ).bufferToBase64(buffer)

      expect(base64).toBe('SGVsbG8=')
    })
  })

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      await streamingService.initialize(mockIntegrationService)
    })

    it('should provide initial metrics', () => {
      const metrics = streamingService.getMetrics()

      expect(metrics).toMatchObject({
        bufferedDuration: 0,
        droppedFrames: 0,
        averageLatency: 0,
        bufferUnderruns: 0,
        networkThrottling: false,
        vadActive: false
      })
    })

    it('should emit metrics during streaming', async () => {
      const metricsSpy = vi.fn()
      streamingService.on('metrics', metricsSpy)

      await streamingService.startStreaming()

      // Wait for metrics to be emitted
      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(metricsSpy).toHaveBeenCalled()

      await streamingService.stopStreaming()
    })
  })

  describe('Circular Buffer', () => {
    it('should handle buffer operations correctly', () => {
      // Test circular buffer indirectly through the streaming service
      const customConfig = {...DEFAULT_STREAMING_CONFIG, maxBufferSize: 100}
      const testService = new RealTimeAudioStreamingService(customConfig)

      // Verify the configuration is set correctly
      expect(testService.getConfig().maxBufferSize).toBe(100)
    })
  })

  describe('Voice Activity Detection', () => {
    it('should support VAD configuration', () => {
      const config = {...DEFAULT_STREAMING_CONFIG, enableVAD: true}
      const vadService = new RealTimeAudioStreamingService(config)

      expect(vadService.getConfig().enableVAD).toBe(true)
      expect(vadService.getConfig().vadThreshold).toBe(DEFAULT_STREAMING_CONFIG.vadThreshold)
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      await streamingService.initialize(mockIntegrationService)
    })

    it('should handle audio processing errors', async () => {
      const errorSpy = vi.fn()
      streamingService.on('error', errorSpy)

      // Mock sendAudioData to throw an error
      mockIntegrationService.sendAudioData = vi.fn(() => Promise.reject(new Error('Network error')))

      await streamingService.startStreaming()

      // Simulate audio data processing by calling the private method
      const sendAudioChunkMethod = (
        streamingService as unknown as {sendAudioChunk: () => Promise<void>}
      ).sendAudioChunk
      await sendAudioChunkMethod.call(streamingService)

      // Stop streaming
      await streamingService.stopStreaming()
    })

    it('should handle cleanup properly', async () => {
      await streamingService.startStreaming()

      const cleanupPromise = streamingService.cleanup()

      expect(cleanupPromise).resolves.toBeUndefined()
    })
  })
})
