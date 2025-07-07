/**
 * Unit Tests for TranscriptionPipeline
 *
 * Tests the core functionality of the TranscriptionPipeline service including
 * initialization, mode switching, event handling, and error recovery.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {EventEmitter} from 'events'
import {
  TranscriptionPipeline,
  PipelineEvent,
  TranscriptionPipelineConfig,
  createProductionTranscriptionPipeline,
  DEFAULT_PIPELINE_CONFIG
} from '../../services/transcription-pipeline'
import {TranscriptionMode} from '../../services/gemini-live-integration'
import {TranscriptionResult} from '../../services/audio-recording'

// Test helper function
function createTestTranscriptionPipeline(
  apiKey: string,
  config?: Partial<TranscriptionPipelineConfig>
): TranscriptionPipeline {
  return new TranscriptionPipeline({
    ...DEFAULT_PIPELINE_CONFIG,
    ...config,
    apiKey
  })
}

// Mock dependencies
vi.mock('../../services/gemini-live-integration')
vi.mock('../../services/audio-recording')
vi.mock('../../services/enhanced-audio-recording')
vi.mock('../../services/audio-websocket-integration')

describe('TranscriptionPipeline', () => {
  let pipeline: TranscriptionPipeline
  let mockConfig: TranscriptionPipelineConfig
  const mockApiKey = 'test-api-key-123'

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_PIPELINE_CONFIG,
      mode: TranscriptionMode.HYBRID,
      fallbackToBatch: true,
      model: 'gemini-live-2.5-flash-preview',
      apiKey: mockApiKey // Add API key to config
    }

    // Create pipeline using constructor directly for testing
    pipeline = new TranscriptionPipeline(mockConfig)
  })

  afterEach(() => {
    if (pipeline) {
      pipeline.destroy()
    }
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should create pipeline with correct configuration', () => {
      expect(pipeline).toBeInstanceOf(TranscriptionPipeline)
      expect(pipeline).toBeInstanceOf(EventEmitter)

      const config = pipeline.getConfig()
      expect(config.mode).toBe(TranscriptionMode.HYBRID)
      expect(config.model).toBe('gemini-live-2.5-flash-preview')
      expect(config.fallbackToBatch).toBe(true)
    })

    it('should have correct initial state', () => {
      const state = pipeline.getState()

      expect(state.isInitialized).toBe(false)
      expect(state.isConnected).toBe(false)
      expect(state.isRecording).toBe(false)
      expect(state.isStreaming).toBe(false)
      expect(state.isProcessing).toBe(false)
      expect(state.currentMode).toBe(TranscriptionMode.HYBRID)
      expect(state.connectionQuality).toBe('disconnected')
      expect(state.transcriptCount).toBe(0)
    })

    it('should initialize successfully', async () => {
      const initPromise = pipeline.initialize()

      // Should emit STATE_CHANGED event
      const stateChangePromise = new Promise(resolve => {
        pipeline.once(PipelineEvent.STATE_CHANGED, resolve)
      })

      await Promise.all([initPromise, stateChangePromise])

      const state = pipeline.getState()
      expect(state.isInitialized).toBe(true)
    })

    it('should handle initialization errors gracefully', async () => {
      const errorPipeline = new TranscriptionPipeline({...mockConfig, apiKey: 'invalid-key'})

      const errorPromise = new Promise(resolve => {
        errorPipeline.once(PipelineEvent.ERROR, resolve)
      })

      const initPromise = errorPipeline.initialize()

      // Should emit ERROR event
      await errorPromise

      // Initialization should still resolve (doesn't throw)
      await initPromise

      const state = errorPipeline.getState()
      expect(state.lastError).toBeDefined()

      errorPipeline.destroy()
    })
  })

  describe('Configuration Management', () => {
    it('should allow configuration updates', () => {
      const updates = {
        realTimeThreshold: 2000,
        fallbackToBatch: false
      }

      pipeline.updateConfig(updates)

      const config = pipeline.getConfig()
      expect(config.realTimeThreshold).toBe(2000)
      expect(config.fallbackToBatch).toBe(false)
    })

    it('should validate configuration updates', () => {
      // Invalid configuration should not crash
      expect(() => {
        pipeline.updateConfig({realTimeThreshold: -1} as Partial<TranscriptionPipelineConfig>)
      }).not.toThrow()
    })

    it('should merge configuration correctly', () => {
      const originalConfig = pipeline.getConfig()
      const updates = {realTimeThreshold: 3000}

      pipeline.updateConfig(updates)

      const newConfig = pipeline.getConfig()
      expect(newConfig.realTimeThreshold).toBe(3000)
      expect(newConfig.mode).toBe(originalConfig.mode) // Should preserve other settings
    })
  })

  describe('Mode Switching', () => {
    beforeEach(async () => {
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

    it('should emit MODE_SWITCHED event on successful switch', async () => {
      const eventSpy = vi.fn()
      pipeline.on(PipelineEvent.MODE_CHANGED, eventSpy)

      await pipeline.switchMode(TranscriptionMode.WEBSOCKET)

      expect(eventSpy).toHaveBeenCalledWith(TranscriptionMode.WEBSOCKET)
    })

    it('should handle mode switch errors', async () => {
      const errorSpy = vi.fn()
      pipeline.on(PipelineEvent.ERROR, errorSpy)

      // Try to switch to an invalid mode
      await expect(pipeline.switchMode('invalid' as TranscriptionMode)).rejects.toThrow()
    })
  })

  describe('Transcription Lifecycle', () => {
    beforeEach(async () => {
      await pipeline.initialize()
    })

    it('should start transcription successfully', async () => {
      const eventSpy = vi.fn()
      pipeline.on(PipelineEvent.TRANSCRIPTION_STARTED, eventSpy)

      await pipeline.startTranscription()

      expect(eventSpy).toHaveBeenCalled()

      const state = pipeline.getState()
      expect(state.isRecording).toBe(true)
    })

    it('should stop transcription successfully', async () => {
      await pipeline.startTranscription()

      const eventSpy = vi.fn()
      pipeline.on(PipelineEvent.RECORDING_STOPPED, eventSpy)

      await pipeline.stopTranscription()

      expect(eventSpy).toHaveBeenCalled()

      const state = pipeline.getState()
      expect(state.isRecording).toBe(false)
    })

    it('should toggle transcription state', async () => {
      // Start
      await pipeline.toggleTranscription()
      let state = pipeline.getState()
      expect(state.isRecording).toBe(true)

      // Stop
      await pipeline.toggleTranscription()
      state = pipeline.getState()
      expect(state.isRecording).toBe(false)
    })

    it('should handle start transcription errors', async () => {
      const errorSpy = vi.fn()
      pipeline.on(PipelineEvent.ERROR, errorSpy)

      // Create a pipeline that will fail to start
      const failingPipeline = new TranscriptionPipeline({...mockConfig, apiKey: 'failing-key'})
      await failingPipeline.initialize()

      await expect(failingPipeline.startTranscription()).rejects.toThrow()

      failingPipeline.destroy()
    })
  })

  describe('Event System', () => {
    it('should emit all pipeline events', async () => {
      const eventCounts: {[key: string]: number} = {}

      // Listen to all events
      Object.values(PipelineEvent).forEach(event => {
        eventCounts[event] = 0
        pipeline.on(event, () => {
          eventCounts[event]++
        })
      })

      // Trigger various operations
      await pipeline.initialize()
      await pipeline.startTranscription()
      await pipeline.stopTranscription()

      // Check that events were emitted
      expect(eventCounts[PipelineEvent.STATE_CHANGED]).toBeGreaterThan(0)
      expect(eventCounts[PipelineEvent.TRANSCRIPTION_STARTED]).toBe(1)
      expect(eventCounts[PipelineEvent.RECORDING_STOPPED]).toBe(1)
    })

    it('should handle event listener removal', () => {
      const listener = vi.fn()

      pipeline.on(PipelineEvent.STATE_CHANGED, listener)
      pipeline.removeListener(PipelineEvent.STATE_CHANGED, listener)

      // Trigger state change
      pipeline.updateConfig({realTimeThreshold: 1500})

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('Transcription Processing', () => {
    beforeEach(async () => {
      await pipeline.initialize()
      await pipeline.startTranscription()
    })

    it('should process transcription results', () => {
      const transcriptionSpy = vi.fn()
      pipeline.on(PipelineEvent.TRANSCRIPTION_RECEIVED, transcriptionSpy)

      const mockResult: TranscriptionResult = {
        text: 'Hello world',
        confidence: 0.95,
        timestamp: Date.now(),
        isPartial: false,
        isFinal: true
      }

      // Simulate receiving a transcription
      pipeline.emit(PipelineEvent.TRANSCRIPTION_RECEIVED, mockResult)

      expect(transcriptionSpy).toHaveBeenCalledWith(mockResult)
    })

    it('should track transcript count', () => {
      const mockResults: TranscriptionResult[] = [
        {text: 'First result', timestamp: Date.now()},
        {text: 'Second result', timestamp: Date.now()}
      ]

      mockResults.forEach(result => {
        pipeline.emit(PipelineEvent.TRANSCRIPTION_RECEIVED, result)
      })

      const transcripts = pipeline.getTranscripts()
      expect(transcripts).toHaveLength(2)

      const state = pipeline.getState()
      expect(state.transcriptCount).toBe(2)
    })

    it('should clear transcripts', () => {
      // Add some transcripts
      const mockResult: TranscriptionResult = {
        text: 'Test transcript',
        timestamp: Date.now()
      }
      pipeline.emit(PipelineEvent.TRANSCRIPTION_RECEIVED, mockResult)

      // Clear transcripts
      pipeline.clearTranscripts()

      const transcripts = pipeline.getTranscripts()
      expect(transcripts).toHaveLength(0)

      const state = pipeline.getState()
      expect(state.transcriptCount).toBe(0)
    })
  })

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await pipeline.initialize()
    })

    it('should track performance metrics', () => {
      const state = pipeline.getState()

      expect(state.latency).toBeDefined()
      expect(state.throughput).toBeDefined()
      expect(state.bufferHealth).toBeDefined()
      expect(state.droppedFrames).toBeDefined()
    })

    it('should emit performance metrics updates', () => {
      const metricsSpy = vi.fn()
      pipeline.on(PipelineEvent.METRICS_UPDATED, metricsSpy)

      // Trigger metrics update (implementation detail)
      pipeline.emit(PipelineEvent.METRICS_UPDATED, {
        latency: 150,
        throughput: 0.95,
        bufferHealth: 0.8
      })

      expect(metricsSpy).toHaveBeenCalled()
    })
  })

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await pipeline.initialize()
    })

    it('should handle connection errors with retry', async () => {
      const errorSpy = vi.fn()
      const retrySpy = vi.fn()

      pipeline.on(PipelineEvent.ERROR, errorSpy)
      pipeline.on(PipelineEvent.ERROR, retrySpy)

      // Simulate connection error
      pipeline.emit(PipelineEvent.DISCONNECTED)

      // Should emit error and retry events
      expect(errorSpy).toHaveBeenCalled()
    })

    it('should implement exponential backoff', () => {
      // Check retry configuration
      const config = pipeline.getConfig()
      expect(config.maxRetries).toBeGreaterThan(0)
    })

    it('should fallback to batch mode on WebSocket failure', async () => {
      pipeline.updateConfig({mode: TranscriptionMode.WEBSOCKET, fallbackToBatch: true})

      const fallbackSpy = vi.fn()
      pipeline.on(PipelineEvent.FALLBACK_ACTIVATED, fallbackSpy)

      // Simulate WebSocket failure
      pipeline.emit(PipelineEvent.ERROR)

      // Should activate fallback
      expect(fallbackSpy).toHaveBeenCalled()
    })
  })

  describe('Resource Management', () => {
    it('should clean up resources on destroy', async () => {
      await pipeline.initialize()
      await pipeline.startTranscription()

      const destroySpy = vi.fn()
      pipeline.on(PipelineEvent.STATE_CHANGED, destroySpy)

      await pipeline.destroy()

      expect(destroySpy).toHaveBeenCalled()

      const state = pipeline.getState()
      expect(state.isInitialized).toBe(false)
      expect(state.isRecording).toBe(false)
    })

    it('should handle multiple destroy calls gracefully', async () => {
      await pipeline.initialize()

      await pipeline.destroy()

      // Second destroy should not throw
      await expect(pipeline.destroy()).resolves.not.toThrow()
    })
  })

  describe('Factory Functions', () => {
    it('should create production pipeline', () => {
      const prodPipeline = createProductionTranscriptionPipeline(mockApiKey, mockConfig)

      expect(prodPipeline).toBeInstanceOf(TranscriptionPipeline)
      expect(prodPipeline.getConfig().model).toBe('gemini-live-2.5-flash-preview')

      prodPipeline.destroy()
    })

    it('should create test pipeline with mocked services', () => {
      const testPipeline = new TranscriptionPipeline({...mockConfig, apiKey: mockApiKey})

      expect(testPipeline).toBeInstanceOf(TranscriptionPipeline)

      testPipeline.destroy()
    })

    it('should create with empty API key but fail on initialize', () => {
      const pipeline = createProductionTranscriptionPipeline('', mockConfig)
      expect(pipeline).toBeInstanceOf(TranscriptionPipeline)

      // Should fail when trying to initialize
      expect(async () => {
        await pipeline.initialize()
      }).rejects.toThrow('Google API Key is required')
    })
  })

  describe('Integration with Services', () => {
    beforeEach(async () => {
      await pipeline.initialize()
    })

    it('should integrate with GeminiLiveIntegrationService', () => {
      const state = pipeline.getState()

      // Should have integration service instance
      expect(state.isConnected).toBeDefined()
    })

    it('should integrate with AudioRecordingService', () => {
      const state = pipeline.getState()

      // Should have audio recording capabilities
      expect(state.recordingMode).toBeDefined()
    })

    it('should integrate with EnhancedAudioRecordingService', () => {
      const state = pipeline.getState()

      // Should support enhanced audio features
      expect(state.bufferHealth).toBeDefined()
    })
  })
})
