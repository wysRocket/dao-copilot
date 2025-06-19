/**
 * Tests for Enhanced Audio Recording Service
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  EnhancedAudioRecordingService,
  RecordingMode,
  DEFAULT_RECORDING_CONFIG
} from '../../services/enhanced-audio-recording'
import {GeminiLiveIntegrationService} from '../../services/gemini-live-integration'
import {take} from 'rxjs/operators'

// Type interfaces for testing
interface BufferHealthMetrics {
  utilizationPercentage: number
  latency: number
  throughput: number
  dropRate: number
}

// Mock dependencies
vi.mock('../../services/real-time-audio-streaming', () => ({
  createRealTimeAudioStreaming: vi.fn(() => {
    const mockStreaming = {
      initialize: vi.fn(() => Promise.resolve()),
      startStreaming: vi.fn(() => Promise.resolve()),
      stopStreaming: vi.fn(() => Promise.resolve()),
      cleanup: vi.fn(() => Promise.resolve()),
      updateConfig: vi.fn(),
      getConfig: vi.fn(() => ({bufferSize: 4096})),
      on: vi.fn(),
      emit: vi.fn()
    }
    return mockStreaming
  })
}))

vi.mock('../../services/audio_capture', () => ({
  audio_stream: vi.fn(() => {
    // Return a proper RxJS-like observable
    return {
      pipe: vi.fn(() => ({
        subscribe: vi.fn(observer => {
          // Simulate successful audio streaming
          setTimeout(() => {
            if (observer && observer.next) {
              observer.next([1, 2, 3, 4, 5]) // Mock audio chunk
            }
          }, 5)

          return {
            unsubscribe: vi.fn()
          }
        })
      }))
    }
  })
}))

// Mock window.transcriptionAPI
Object.defineProperty(global, 'window', {
  value: {
    transcriptionAPI: {
      transcribeAudio: vi.fn(() =>
        Promise.resolve({
          text: 'Test transcription',
          confidence: 0.95,
          duration: 1000
        })
      )
    }
  },
  writable: true
})

describe('EnhancedAudioRecordingService', () => {
  let service: EnhancedAudioRecordingService
  let mockIntegrationService: GeminiLiveIntegrationService

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock integration service
    mockIntegrationService = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    } as unknown as GeminiLiveIntegrationService

    service = new EnhancedAudioRecordingService()
  })

  afterEach(async () => {
    await service.destroy()
  })

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = service.getConfig()
      expect(config).toEqual(DEFAULT_RECORDING_CONFIG)
    })

    it('should allow configuration updates', () => {
      const updates = {
        mode: RecordingMode.REALTIME,
        bufferSize: 8192,
        adaptiveBuffering: false
      }

      service.updateConfig(updates)
      const config = service.getConfig()

      expect(config.mode).toBe(RecordingMode.REALTIME)
      expect(config.bufferSize).toBe(8192)
      expect(config.adaptiveBuffering).toBe(false)
    })

    it('should update state when mode changes', () => {
      service.updateConfig({mode: RecordingMode.INTERVAL})
      const state = service.getState()
      expect(state.mode).toBe(RecordingMode.INTERVAL)
    })
  })

  describe('Initialization', () => {
    it('should initialize without integration service', async () => {
      await service.initialize()
      const state = service.getState()
      expect(state.status).toBe('Ready to record')
    })

    it('should initialize with integration service', async () => {
      await service.initialize(mockIntegrationService)
      const state = service.getState()
      expect(state.status).toBe('Ready to record')
    })

    it('should initialize real-time streaming when enabled', async () => {
      const customService = new EnhancedAudioRecordingService({
        enableRealTimeStreaming: true
      })

      await customService.initialize(mockIntegrationService)

      // Should have set up streaming
      const config = customService.getConfig()
      expect(config.enableRealTimeStreaming).toBe(true)

      await customService.destroy()
    })
  })

  describe('Recording States', () => {
    beforeEach(async () => {
      await service.initialize(mockIntegrationService)
    })

    it('should provide initial state', () => {
      const state = service.getState()

      expect(state).toMatchObject({
        isRecording: false,
        isTranscribing: false,
        isStreaming: false,
        recordingTime: 0,
        status: 'Ready to record',
        mode: RecordingMode.HYBRID,
        bufferHealth: 1.0
      })
    })

    it('should emit state changes through observable', async () => {
      const stateObservable = service.getStateObservable()

      // Start recording and wait for state change
      const statePromise = new Promise<void>(resolve => {
        stateObservable.pipe(take(2)).subscribe(state => {
          if (state.isRecording) {
            expect(state.isRecording).toBe(true)
            expect(state.status).toContain('Recording')
            resolve()
          }
        })
      })

      await service.startRecording()
      await statePromise
    })

    it('should prevent starting recording when already recording', async () => {
      await service.startRecording()
      const firstState = service.getState()
      expect(firstState.isRecording).toBe(true)

      // Try to start again
      await service.startRecording()
      const secondState = service.getState()
      expect(secondState.isRecording).toBe(true) // Should still be recording

      await service.stopRecording()
    })
  })

  describe('Recording Modes', () => {
    beforeEach(async () => {
      await service.initialize(mockIntegrationService)
    })

    it('should handle interval mode recording', async () => {
      service.updateConfig({mode: RecordingMode.INTERVAL})

      await service.startRecording()
      const state = service.getState()

      expect(state.isRecording).toBe(true)
      expect(state.mode).toBe(RecordingMode.INTERVAL)
      expect(state.status).toContain('interval mode')

      await service.stopRecording()
    })

    it('should handle real-time mode recording', async () => {
      service.updateConfig({
        mode: RecordingMode.REALTIME,
        enableRealTimeStreaming: true
      })

      await service.startRecording()
      const state = service.getState()

      expect(state.isRecording).toBe(true)
      expect(state.mode).toBe(RecordingMode.REALTIME)

      await service.stopRecording()
    })

    it('should handle hybrid mode recording', async () => {
      service.updateConfig({mode: RecordingMode.HYBRID})

      await service.startRecording()
      const state = service.getState()

      expect(state.isRecording).toBe(true)
      expect(state.mode).toBe(RecordingMode.HYBRID)
      expect(state.status).toContain('hybrid mode')

      await service.stopRecording()
    })
  })

  describe('Adaptive Buffering', () => {
    beforeEach(async () => {
      await service.initialize(mockIntegrationService)
    })

    it('should support adaptive buffering configuration', () => {
      service.updateConfig({adaptiveBuffering: true})
      const config = service.getConfig()
      expect(config.adaptiveBuffering).toBe(true)
    })

    it('should handle buffer health calculation', () => {
      const customService = new EnhancedAudioRecordingService({
        adaptiveBuffering: true
      })

      // Access private method for testing
      const calculateBufferHealth = (
        customService as unknown as {
          calculateBufferHealth: (metrics: BufferHealthMetrics) => number
        }
      ).calculateBufferHealth

      const goodMetrics = {
        utilizationPercentage: 75,
        latency: 50,
        throughput: 95,
        dropRate: 0
      }

      const health = calculateBufferHealth.call(customService, goodMetrics)
      expect(health).toBeGreaterThan(0.8)
    })
  })

  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.initialize(mockIntegrationService)
    })

    it('should handle recording errors gracefully', async () => {
      // Mock an error scenario
      const originalAudioStream = await import('../../services/audio_capture')
      originalAudioStream.audio_stream = vi.fn(() => {
        throw new Error('Audio capture failed')
      })

      await service.startRecording()

      // Service should handle the error and update state
      const state = service.getState()
      expect(state.status).toContain('error')
    })

    it('should fallback to interval mode on streaming errors', () => {
      const customService = new EnhancedAudioRecordingService({
        mode: RecordingMode.REALTIME
      })

      // Simulate streaming error
      const handleStreamingError = (
        customService as unknown as {handleStreamingError: (error: Error) => void}
      ).handleStreamingError
      handleStreamingError.call(customService, new Error('Streaming failed'))

      const state = customService.getState()
      expect(state.mode).toBe(RecordingMode.INTERVAL)
      expect(state.status).toContain('Fallback to interval mode')
    })
  })

  describe('Transcription Handling', () => {
    beforeEach(async () => {
      await service.initialize(mockIntegrationService)
    })

    it('should call transcription callback when provided', async () => {
      const transcriptionCallback = vi.fn()

      await service.startRecording(transcriptionCallback)

      // Simulate audio processing
      const processAudioChunk = (
        service as unknown as {
          processAudioChunk: (
            audioData: number[][],
            transcriptionCallback?: (result: {
              text: string
              confidence?: number
              duration?: number
            }) => void
          ) => Promise<{text: string; confidence?: number; duration?: number} | null>
        }
      ).processAudioChunk
      await processAudioChunk.call(service, [[1, 2, 3, 4, 5]], transcriptionCallback)

      expect(transcriptionCallback).toHaveBeenCalled()

      await service.stopRecording()
    })

    it('should handle empty audio chunks gracefully', async () => {
      const transcriptionCallback = vi.fn()

      await service.startRecording(transcriptionCallback)

      // Process empty chunks
      const processAudioChunk = (
        service as unknown as {
          processAudioChunk: (
            audioData: Float32Array[],
            transcriptionCallback: (text: string) => void
          ) => Promise<string | null>
        }
      ).processAudioChunk
      const result = await processAudioChunk.call(service, [], transcriptionCallback)

      expect(result).toBeNull()
      expect(transcriptionCallback).not.toHaveBeenCalled()

      await service.stopRecording()
    })
  })

  describe('Service Lifecycle', () => {
    it('should toggle recording state correctly', async () => {
      // Use interval mode to avoid real-time streaming complications
      service.updateConfig({mode: RecordingMode.INTERVAL, enableRealTimeStreaming: false})

      expect(service.getState().isRecording).toBe(false)

      await service.toggleRecording()
      // Give more time for async operations
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(service.getState().isRecording).toBe(true)

      await service.toggleRecording()
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(service.getState().isRecording).toBe(false)
    })

    it('should cleanup resources on destroy', async () => {
      // Use interval mode to avoid real-time streaming complications
      service.updateConfig({mode: RecordingMode.INTERVAL, enableRealTimeStreaming: false})
      await service.startRecording()

      // Give more time for recording to start
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(service.getState().isRecording).toBe(true)

      await service.destroy()

      // Should have stopped recording and cleaned up
      const finalState = service.getState()
      expect(finalState.isRecording).toBe(false)
    })

    it('should handle multiple destroy calls gracefully', async () => {
      await service.initialize(mockIntegrationService)

      await service.destroy()
      await service.destroy() // Should not throw

      expect(service.getState().isRecording).toBe(false)
    })
  })

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await service.initialize(mockIntegrationService)
    })

    it('should track recording time', async () => {
      await service.startRecording()

      // Wait a bit to simulate time passing
      await new Promise(resolve => setTimeout(resolve, 100))

      const state = service.getState()
      expect(state.recordingTime).toBeGreaterThanOrEqual(0)

      await service.stopRecording()
    })

    it('should provide streaming metrics when available', () => {
      const customService = new EnhancedAudioRecordingService({
        enableRealTimeStreaming: true
      })

      // Simulate streaming metrics update
      const updateStreamingMetrics = (
        customService as unknown as {
          updateStreamingMetrics: (metrics: {
            bufferedDuration: number
            droppedFrames: number
            averageLatency: number
            bufferUnderruns: number
            networkThrottling: boolean
            vadActive: boolean
          }) => void
        }
      ).updateStreamingMetrics

      const metrics = {
        bufferedDuration: 500,
        droppedFrames: 5,
        averageLatency: 100,
        bufferUnderruns: 0,
        networkThrottling: false,
        vadActive: true
      }

      updateStreamingMetrics.call(customService, metrics)

      const state = customService.getState()
      expect(state.streamingMetrics).toBeDefined()
      expect(state.streamingMetrics?.latency).toBe(100) // averageLatency maps to latency
      expect(state.streamingMetrics?.droppedFrames).toBe(5)
      expect(state.streamingMetrics?.bytesStreamed).toBe(500) // bufferedDuration maps to bytesStreamed
    })
  })
})
