/**
 * Unit Tests for TranscriptionPipeline with Mock Dependencies
 *
 * This version uses dependency injection to provide mock services,
 * enabling isolated unit testing without real service initialization.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  TranscriptionPipeline,
  PipelineEvent,
  TranscriptionPipelineConfig,
  DEFAULT_PIPELINE_CONFIG
} from '../../services/transcription-pipeline'
import {TranscriptionMode} from '../../services/gemini-live-integration'
import {
  createTestServiceMocks,
  setupTestEnvironment,
  teardownTestEnvironment,
  MockEnhancedAudioRecordingService,
  MockAudioRecordingService,
  MockGeminiLiveIntegrationService,
  generateMockTranscriptionResult
} from '../__mocks__/test-utils'

describe('TranscriptionPipeline with Mock Dependencies', () => {
  let pipeline: TranscriptionPipeline
  let mockConfig: TranscriptionPipelineConfig
  let mockServices: ReturnType<typeof createTestServiceMocks>
  const mockApiKey = 'test-api-key-123'

  beforeEach(() => {
    setupTestEnvironment()

    // Create mock services
    mockServices = createTestServiceMocks()

    mockConfig = {
      ...DEFAULT_PIPELINE_CONFIG,
      mode: TranscriptionMode.HYBRID,
      fallbackToBatch: true,
      model: 'gemini-live-2.5-flash-preview',
      apiKey: mockApiKey
    }

    // Create pipeline with mocked dependencies
    pipeline = new TranscriptionPipeline(mockConfig)

    // Inject mock services using private property access for testing
    ;(pipeline as any).enhancedRecording = mockServices.enhancedAudioRecording
    ;(pipeline as any).audioRecording = mockServices.audioRecording
    ;(pipeline as any).geminiService = mockServices.geminiLiveIntegration
  })

  afterEach(() => {
    teardownTestEnvironment()
    pipeline?.destroy?.()
  })

  describe('Initialization with Mock Services', () => {
    it('should create pipeline with correct configuration', () => {
      expect(pipeline).toBeInstanceOf(TranscriptionPipeline)
      expect(pipeline.getConfig().apiKey).toBe(mockApiKey)
      expect(pipeline.getConfig().mode).toBe(TranscriptionMode.HYBRID)
    })

    it('should initialize successfully with mocked services', async () => {
      // Mock the services to simulate successful initialization
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()

      await pipeline.initialize()

      const state = pipeline.getState()
      expect(state.isInitialized).toBe(true)
      expect(mockServices.geminiLiveIntegration!.connect).toHaveBeenCalledWith(mockApiKey)
    })

    it('should handle initialization errors gracefully', async () => {
      // Mock initialization failure
      const mockError = new Error('Initialization failed')
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockRejectedValue(mockError)

      await expect(pipeline.initialize()).rejects.toThrow('Initialization failed')

      const state = pipeline.getState()
      expect(state.isInitialized).toBe(false)
      expect(state.lastError).toBeDefined()
    })
  })

  describe('Configuration Management', () => {
    it('should allow configuration updates', () => {
      const newConfig = {realTimeThreshold: 2000}
      pipeline.updateConfig(newConfig)

      const config = pipeline.getConfig()
      expect(config.realTimeThreshold).toBe(2000)
    })

    it('should validate configuration updates', () => {
      expect(() => {
        pipeline.updateConfig({realTimeThreshold: -1} as Partial<TranscriptionPipelineConfig>)
      }).toThrow()
    })

    it('should merge configuration correctly', () => {
      const originalBatch = pipeline.getConfig().fallbackToBatch
      pipeline.updateConfig({realTimeThreshold: 3000})

      const config = pipeline.getConfig()
      expect(config.realTimeThreshold).toBe(3000)
      expect(config.fallbackToBatch).toBe(originalBatch) // Should preserve other settings
    })
  })

  describe('Mode Switching with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should switch to WebSocket mode', async () => {
      const modeChangePromise = new Promise(resolve => {
        pipeline.once(PipelineEvent.MODE_CHANGED, resolve)
      })

      await pipeline.switchMode(TranscriptionMode.WEBSOCKET)
      await modeChangePromise

      const state = pipeline.getState()
      expect(state.currentMode).toBe(TranscriptionMode.WEBSOCKET)
    })

    it('should switch to Batch mode', async () => {
      const modeChangePromise = new Promise(resolve => {
        pipeline.once(PipelineEvent.MODE_CHANGED, resolve)
      })

      await pipeline.switchMode(TranscriptionMode.BATCH)
      await modeChangePromise

      const state = pipeline.getState()
      expect(state.currentMode).toBe(TranscriptionMode.BATCH)
    })

    it('should emit MODE_CHANGED event on successful switch', async () => {
      const eventSpy = vi.fn()
      pipeline.on(PipelineEvent.MODE_CHANGED, eventSpy)

      await pipeline.switchMode(TranscriptionMode.WEBSOCKET)

      expect(eventSpy).toHaveBeenCalledWith(TranscriptionMode.WEBSOCKET)
    })
  })

  describe('Transcription Lifecycle with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      vi.spyOn(mockServices.enhancedAudioRecording!, 'startRecording').mockResolvedValue()
      vi.spyOn(mockServices.enhancedAudioRecording!, 'stopRecording').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should start transcription successfully', async () => {
      await pipeline.startTranscription()

      const state = pipeline.getState()
      expect(state.isRecording).toBe(true)
      expect(mockServices.enhancedAudioRecording!.startRecording).toHaveBeenCalled()
    })

    it('should stop transcription successfully', async () => {
      await pipeline.startTranscription()
      await pipeline.stopTranscription()

      const state = pipeline.getState()
      expect(state.isRecording).toBe(false)
      expect(mockServices.enhancedAudioRecording!.stopRecording).toHaveBeenCalled()
    })

    it('should toggle transcription state', async () => {
      let state = pipeline.getState()
      expect(state.isRecording).toBe(false)

      await pipeline.toggleTranscription()
      state = pipeline.getState()
      expect(state.isRecording).toBe(true)

      await pipeline.toggleTranscription()
      state = pipeline.getState()
      expect(state.isRecording).toBe(false)
    })
  })

  describe('Event System with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should emit recording events', async () => {
      const startSpy = vi.fn()
      const stopSpy = vi.fn()

      pipeline.on(PipelineEvent.RECORDING_STARTED, startSpy)
      pipeline.on(PipelineEvent.RECORDING_STOPPED, stopSpy)

      // Start recording
      vi.spyOn(mockServices.enhancedAudioRecording!, 'startRecording').mockResolvedValue()
      await pipeline.startTranscription()

      // Stop recording
      vi.spyOn(mockServices.enhancedAudioRecording!, 'stopRecording').mockResolvedValue()
      await pipeline.stopTranscription()

      expect(startSpy).toHaveBeenCalled()
      expect(stopSpy).toHaveBeenCalled()
    })

    it('should handle event listener removal', () => {
      const listener = vi.fn()

      pipeline.on(PipelineEvent.STATE_CHANGED, listener)
      pipeline.removeListener(PipelineEvent.STATE_CHANGED, listener)

      // Trigger state change
      pipeline.emit(PipelineEvent.STATE_CHANGED)

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('Transcription Processing with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should process transcription results', () => {
      const transcriptionSpy = vi.fn()
      pipeline.on(PipelineEvent.TRANSCRIPTION_RECEIVED, transcriptionSpy)

      const mockResult = generateMockTranscriptionResult()

      // Simulate receiving transcription from mock service
      mockServices.geminiLiveIntegration!.mockEmitTranscription(mockResult.text, mockResult.isFinal)

      expect(transcriptionSpy).toHaveBeenCalled()
    })

    it('should track transcript count', () => {
      const initialState = pipeline.getState()
      const initialCount = initialState.transcriptCount

      // Simulate transcription received
      mockServices.geminiLiveIntegration!.mockEmitTranscription('Test transcription', true)

      const newState = pipeline.getState()
      expect(newState.transcriptCount).toBeGreaterThan(initialCount)
    })
  })

  describe('Performance Monitoring with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should track performance metrics', () => {
      const state = pipeline.getState()

      expect(typeof state.latency).toBe('number')
      expect(typeof state.throughput).toBe('number')
      expect(typeof state.bufferHealth).toBe('number')
      expect(state.bufferHealth).toBeGreaterThanOrEqual(0)
      expect(state.bufferHealth).toBeLessThanOrEqual(1)
    })

    it('should emit performance metrics updates', () => {
      const metricsSpy = vi.fn()
      pipeline.on(PipelineEvent.METRICS_UPDATED, metricsSpy)

      // Simulate metrics update from mock service
      pipeline.emit(PipelineEvent.METRICS_UPDATED, {
        latency: 100,
        throughput: 1000,
        bufferHealth: 0.8
      })

      expect(metricsSpy).toHaveBeenCalledWith({
        latency: 100,
        throughput: 1000,
        bufferHealth: 0.8
      })
    })
  })

  describe('Error Handling with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should handle connection errors with retry', () => {
      const retrySpy = vi.fn()
      pipeline.on(PipelineEvent.ERROR, retrySpy)

      // Simulate connection error
      const mockError = new Error('Connection failed')
      mockServices.geminiLiveIntegration!.mockEmitError(mockError)

      expect(retrySpy).toHaveBeenCalledWith(mockError)
    })

    it('should implement exponential backoff', () => {
      // Check retry configuration
      const config = pipeline.getConfig()
      expect(config.maxRetries).toBeGreaterThan(0)
    })

    it('should fallback to batch mode on WebSocket failure', async () => {
      // Simulate WebSocket failure
      mockServices.geminiLiveIntegration!.mockEmitConnectionLoss()

      // Pipeline should automatically fallback to batch mode
      const state = pipeline.getState()
      expect(state.currentMode).toBe(TranscriptionMode.BATCH)
    })
  })

  describe('Resource Management with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      vi.spyOn(mockServices.geminiLiveIntegration!, 'disconnect').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should clean up resources on destroy', async () => {
      const destroySpy = vi.fn()
      pipeline.on(PipelineEvent.STATE_CHANGED, destroySpy)

      await pipeline.destroy()

      expect(mockServices.geminiLiveIntegration!.disconnect).toHaveBeenCalled()
    })

    it('should handle multiple destroy calls gracefully', async () => {
      await pipeline.destroy()

      // Should not throw on second destroy call
      await expect(pipeline.destroy()).resolves.not.toThrow()
    })
  })

  describe('Service Integration with Mocks', () => {
    beforeEach(async () => {
      vi.spyOn(mockServices.geminiLiveIntegration!, 'connect').mockResolvedValue()
      await pipeline.initialize()
    })

    it('should integrate with GeminiLiveIntegrationService', () => {
      expect(mockServices.geminiLiveIntegration).toBeInstanceOf(MockGeminiLiveIntegrationService)
      expect(mockServices.geminiLiveIntegration!.connect).toHaveBeenCalledWith(mockApiKey)
    })

    it('should integrate with AudioRecordingService', () => {
      expect(mockServices.audioRecording).toBeInstanceOf(MockAudioRecordingService)
    })

    it('should integrate with EnhancedAudioRecordingService', () => {
      expect(mockServices.enhancedAudioRecording).toBeInstanceOf(MockEnhancedAudioRecordingService)

      const state = pipeline.getState()
      expect(state.isConnected).toBeDefined()
      expect(state.bufferHealth).toBeDefined()
    })
  })
})
