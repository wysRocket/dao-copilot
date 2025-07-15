import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {renderHook, act} from '@testing-library/react'
import {
  getTranscriptionStateManager,
  TranscriptionStateManager
} from '../../state/TranscriptionStateManager'
import useTranscriptionState, {
  useStreamingState,
  useStaticTranscripts,
  useRecordingState
} from '../../hooks/useTranscriptionState'
import {
  TranscriptionWithSource,
  TranscriptionSource
} from '../../services/TranscriptionSourceManager'

describe('Unified Transcription State Management', () => {
  let stateManager: TranscriptionStateManager

  beforeEach(() => {
    // Get fresh state manager for each test
    stateManager = getTranscriptionStateManager()
    stateManager.clearTranscripts()
    stateManager.clearStreaming()
    stateManager.setRecordingState(false, 0, 'Ready')
  })

  afterEach(() => {
    // Clean up after each test
    stateManager.clearTranscripts()
    stateManager.clearStreaming()
    vi.clearAllMocks()
  })

  describe('TranscriptionStateManager', () => {
    it('should initialize with default state', () => {
      const state = stateManager.getState()

      expect(state.streaming.isActive).toBe(false)
      expect(state.streaming.current).toBeNull()
      expect(state.streaming.progress).toBe(0)
      expect(state.streaming.mode).toBe('character')

      expect(state.static.transcripts).toEqual([])
      expect(state.static.isLoading).toBe(false)

      expect(state.recording.isRecording).toBe(false)
      expect(state.recording.isProcessing).toBe(false)
      expect(state.recording.recordingTime).toBe(0)
      expect(state.recording.status).toBe('Ready')

      expect(state.meta.totalCount).toBe(0)
    })

    it('should handle streaming lifecycle', () => {
      const mockTranscription: TranscriptionWithSource = {
        id: 'test-id-1',
        text: 'Hello world',
        isPartial: true,
        source: TranscriptionSource.WEBSOCKET_GEMINI,
        timestamp: Date.now()
      }

      // Start streaming
      stateManager.startStreaming(mockTranscription)

      let state = stateManager.getState()
      expect(state.streaming.isActive).toBe(true)
      expect(state.streaming.current?.text).toBe('Hello world')
      expect(state.streaming.current?.isPartial).toBe(true)

      // Update streaming
      stateManager.updateStreaming('Hello world from', true)

      state = stateManager.getState()
      expect(state.streaming.current?.text).toBe('Hello world from')
      expect(state.streaming.current?.isPartial).toBe(true)

      // Complete streaming
      stateManager.completeStreaming()

      state = stateManager.getState()
      expect(state.streaming.isActive).toBe(false)
      expect(state.static.transcripts).toHaveLength(1)
      expect(state.static.transcripts[0].text).toBe('Hello world from')
      expect(state.meta.totalCount).toBe(1)
    })

    it('should manage static transcripts', () => {
      const transcript = {
        id: 'test-transcript-1',
        text: 'Test transcript',
        timestamp: Date.now(),
        confidence: 0.95,
        source: 'websocket-test'
      }

      stateManager.addTranscript(transcript)

      const state = stateManager.getState()
      expect(state.static.transcripts).toHaveLength(1)
      expect(state.static.transcripts[0].text).toBe('Test transcript')
      expect(state.meta.totalCount).toBe(1)
    })

    it('should handle state subscriptions', () => {
      const mockListener = vi.fn()

      const unsubscribe = stateManager.subscribe(mockListener)

      stateManager.setRecordingState(true, 100, 'Recording')

      expect(mockListener).toHaveBeenCalledWith('recording-changed', expect.any(Object))

      unsubscribe()

      stateManager.setRecordingState(false, 0, 'Ready')

      // Should not be called after unsubscribe
      expect(mockListener).toHaveBeenCalledTimes(1)
    })

    it('should handle streaming completion callbacks', () => {
      const mockCallback = vi.fn()

      const unsubscribe = stateManager.onStreamingComplete(mockCallback)

      const mockTranscription: TranscriptionWithSource = {
        id: 'test-completion',
        text: 'Test completion',
        isPartial: false,
        source: TranscriptionSource.WEBSOCKET_GEMINI,
        timestamp: Date.now()
      }

      stateManager.startStreaming(mockTranscription)
      stateManager.completeStreaming()

      expect(mockCallback).toHaveBeenCalledTimes(1)

      unsubscribe()
    })

    it('should perform garbage collection', () => {
      // Add many transcripts to trigger garbage collection
      for (let i = 0; i < 1100; i++) {
        stateManager.addTranscript({
          id: `transcript-${i}`,
          text: `Transcript ${i}`,
          timestamp: Date.now() - (1100 - i) * 1000, // Older timestamps first
          confidence: 0.95,
          source: 'websocket-test'
        })
      }

      const stateBeforeGC = stateManager.getState()
      expect(stateBeforeGC.static.transcripts.length).toBe(1100)

      stateManager.performGarbageCollection()

      const stateAfterGC = stateManager.getState()
      expect(stateAfterGC.static.transcripts.length).toBe(800) // Should keep only 80% of 1000 (target: 800)
    })
  })

  describe('useTranscriptionState hook', () => {
    it('should provide state and actions', () => {
      const {result} = renderHook(() => useTranscriptionState())

      expect(result.current.isStreamingActive).toBe(false)
      expect(result.current.transcripts).toEqual([])
      expect(result.current.isRecording).toBe(false)
      expect(typeof result.current.startStreaming).toBe('function')
      expect(typeof result.current.addTranscript).toBe('function')
      expect(typeof result.current.setRecordingState).toBe('function')
    })

    it('should update when state changes', () => {
      const {result} = renderHook(() => useTranscriptionState())

      act(() => {
        result.current.setRecordingState(true, 100, 'Recording')
      })

      expect(result.current.isRecording).toBe(true)
      expect(result.current.recordingTime).toBe(100)
      expect(result.current.recordingStatus).toBe('Recording')
    })

    it('should handle streaming actions', () => {
      const {result} = renderHook(() => useTranscriptionState())

      const mockTranscription: TranscriptionWithSource = {
        id: 'streaming-test',
        text: 'Streaming test',
        isPartial: true,
        source: TranscriptionSource.WEBSOCKET_GEMINI,
        timestamp: Date.now()
      }

      act(() => {
        result.current.startStreaming(mockTranscription)
      })

      expect(result.current.isStreamingActive).toBe(true)
      expect(result.current.currentStreamingText).toBe('Streaming test')

      act(() => {
        result.current.updateStreaming('Streaming test updated', true) // Keep as partial to test streaming state
      })

      expect(result.current.currentStreamingText).toBe('Streaming test updated')
      expect(result.current.isCurrentTextPartial).toBe(true)

      // Now complete the streaming
      act(() => {
        result.current.updateStreaming('Streaming test final', false)
      })

      // After completion, streaming text should be empty but should be in static transcripts
      expect(result.current.currentStreamingText).toBe('')
      expect(result.current.transcripts.length).toBe(1)
      expect(result.current.transcripts[0].text).toBe('Streaming test final')

      act(() => {
        result.current.completeStreaming()
      })

      expect(result.current.isStreamingActive).toBe(false)
      expect(result.current.transcripts).toHaveLength(1)
    })
  })

  describe('Specialized hooks', () => {
    it('useStreamingState should provide only streaming-related state', () => {
      const {result} = renderHook(() => useStreamingState())

      expect(result.current.isStreamingActive).toBe(false)
      expect(result.current.currentStreamingText).toBe('')
      expect(typeof result.current.startStreaming).toBe('function')
      expect(typeof result.current.updateStreaming).toBe('function')
      expect(typeof result.current.completeStreaming).toBe('function')

      // Should not have transcript-related properties
      expect('transcripts' in result.current).toBe(false)
      expect('isRecording' in result.current).toBe(false)
    })

    it('useStaticTranscripts should provide only transcript-related state', () => {
      const {result} = renderHook(() => useStaticTranscripts())

      expect(result.current.transcripts).toEqual([])
      expect(result.current.transcriptCount).toBe(0)
      expect(typeof result.current.addTranscript).toBe('function')
      expect(typeof result.current.clearTranscripts).toBe('function')

      // Should not have streaming-related properties
      expect('isStreamingActive' in result.current).toBe(false)
      expect('isRecording' in result.current).toBe(false)
    })

    it('useRecordingState should provide only recording-related state', () => {
      const {result} = renderHook(() => useRecordingState())

      expect(result.current.isRecording).toBe(false)
      expect(result.current.isProcessing).toBe(false)
      expect(typeof result.current.setRecordingState).toBe('function')
      expect(typeof result.current.setProcessingState).toBe('function')

      // Should not have streaming or transcript properties
      expect('isStreamingActive' in result.current).toBe(false)
      expect('transcripts' in result.current).toBe(false)
    })
  })

  describe('Performance characteristics', () => {
    it('should handle rapid state updates efficiently', () => {
      const {result} = renderHook(() => useTranscriptionState())

      // First start streaming
      act(() => {
        const initialTranscription: TranscriptionWithSource = {
          id: 'rapid-test',
          text: 'Initial text',
          isPartial: true,
          source: TranscriptionSource.WEBSOCKET_GEMINI,
          timestamp: Date.now()
        }
        result.current.startStreaming(initialTranscription)
      })

      const start = performance.now()

      act(() => {
        // Simulate rapid streaming updates
        for (let i = 0; i < 100; i++) {
          result.current.updateStreaming(`Text update ${i}`, true)
        }
      })

      const end = performance.now()
      const duration = end - start

      // Should complete rapid updates in reasonable time (less than 100ms)
      expect(duration).toBeLessThan(100)
      expect(result.current.currentStreamingText).toBe('Text update 99')
    })

    it('should provide memory usage information', () => {
      const {result} = renderHook(() => useTranscriptionState())

      const memoryUsage = result.current.getMemoryUsage()

      expect(memoryUsage).toHaveProperty('transcriptCount')
      expect(memoryUsage).toHaveProperty('estimatedSize')
      expect(typeof memoryUsage.transcriptCount).toBe('number')
      expect(typeof memoryUsage.estimatedSize).toBe('number')
    })
  })
})
