/**
 * Integration test for Stack Overflow Fix Verification
 * 
 * This test simulates real-world usage scenarios to verify that our
 * stack overflow fixes work correctly in production-like conditions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  TranscriptionStateManager,
  resetTranscriptionStateManager 
} from '../../state/TranscriptionStateManager'
import { 
  TranscriptionError,
  TranscriptionErrorReporter 
} from '../../services/transcription-errors'

// Use a constant for the source since the exact enum causes import issues
const WEBSOCKET_SOURCE = 'websocket-gemini'

describe('Stack Overflow Fix Integration Tests', () => {
  let stateManager: TranscriptionStateManager

  beforeEach(() => {
    // Reset error reporter and state manager
    TranscriptionErrorReporter.reset()
    resetTranscriptionStateManager()
    stateManager = new TranscriptionStateManager()
  })

  afterEach(() => {
    if (stateManager) {
      stateManager.destroy()
    }
    resetTranscriptionStateManager()
    vi.clearAllMocks()
  })

  describe('Real-world Scenarios', () => {
    it('should handle rapid transcription updates without stack overflow', async () => {
      // Simulate rapid transcription updates that could cause recursion
      const transcriptionText = 'This is a test transcription that gets updated rapidly'
      let updateCount = 0
      const maxUpdates = 50

      // Add a listener that tracks updates
      const listener = vi.fn((type) => {
        updateCount++
        
        // This would normally cause issues in recursive scenarios
        if (updateCount < maxUpdates && type === 'streaming-updated') {
          // Don't trigger more updates to avoid recursion
          // The state manager should handle this gracefully
        }
      })

      stateManager.subscribe(listener)

      // Start streaming
      stateManager.startStreaming({
        id: 'test-stream',
        text: '',
        timestamp: Date.now(),
        confidence: 0.8,
        source: TranscriptionSource.WEBSOCKET_GEMINI
      })

      // Rapidly update the streaming text
      for (let i = 0; i < 20; i++) {
        stateManager.updateStreaming(`${transcriptionText} ${i}`, true)
        // Small delay to simulate real-world timing
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Complete the streaming
      stateManager.updateStreaming(transcriptionText + ' final', false)

      // Verify that updates were handled correctly
      expect(updateCount).toBeGreaterThan(0)
      expect(updateCount).toBeLessThan(100) // Should not have exploded into infinite updates

      const finalState = stateManager.getState()
      expect(finalState.static.transcripts).toHaveLength(1)
      expect(finalState.static.transcripts[0].text).toContain('final')
    })

    it('should prevent listener recursion in completion callbacks', async () => {
      let callbackCount = 0
      const maxCallbacks = 5

      // Add a completion callback that could potentially cause recursion
      const unsubscribe = stateManager.onStreamingComplete(() => {
        callbackCount++
        
        if (callbackCount < maxCallbacks) {
          // This should not trigger infinite recursion
          try {
            stateManager.startStreaming({
              id: `callback-stream-${callbackCount}`,
              text: `Callback text ${callbackCount}`,
              timestamp: Date.now(),
              confidence: 0.9,
              source: TranscriptionSource.WEBSOCKET_GEMINI
            })
          } catch (error) {
            // This is expected if recursion protection is working
            console.log('Recursion protection triggered:', String(error))
          }
        }
      })

      // Start and complete a streaming session
      stateManager.startStreaming({
        id: 'test-callback-stream',
        text: 'Initial text',
        timestamp: Date.now(),
        confidence: 0.8,
        source: 'websocket-gemini' as any
      })

      stateManager.completeStreaming()

      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify that callbacks were executed but didn't cause infinite recursion
      expect(callbackCount).toBeGreaterThan(0)
      expect(callbackCount).toBeLessThanOrEqual(maxCallbacks)

      // Should have some transcripts but not an infinite number
      const finalState = stateManager.getState()
      expect(finalState.static.transcripts.length).toBeLessThan(10)

      unsubscribe()
    })

    it('should handle multiple simultaneous streaming sessions gracefully', async () => {
      // Try to start multiple streaming sessions simultaneously
      // The state manager should prevent this and handle it gracefully
      
      const sessions = [
        {
          id: 'session-1',
          text: 'First session',
          timestamp: Date.now(),
          confidence: 0.8,
          source: 'websocket-gemini' as any
        },
        {
          id: 'session-2', 
          text: 'Second session',
          timestamp: Date.now() + 1,
          confidence: 0.9,
          source: 'websocket-gemini' as any
        },
        {
          id: 'session-3',
          text: 'Third session', 
          timestamp: Date.now() + 2,
          confidence: 0.7,
          source: 'websocket-gemini' as any
        }
      ]

      // Start all sessions rapidly
      const promises = sessions.map(async (session, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 10))
        stateManager.startStreaming(session)
        return session
      })

      await Promise.all(promises)

      // Wait for state to settle
      await new Promise(resolve => setTimeout(resolve, 100))

      const state = stateManager.getState()
      
      // Should only have one active streaming session
      expect(state.streaming.current).toBeDefined()
      
      // Complete the active session
      stateManager.completeStreaming()

      // Should have completed successfully without crashes
      const finalState = stateManager.getState()
      expect(finalState.streaming.current).toBeNull()
      expect(finalState.static.transcripts.length).toBeGreaterThan(0)
    })

    it('should maintain performance under stress conditions', async () => {
      const startTime = performance.now()
      
      // Create a stress test with many operations
      for (let i = 0; i < 10; i++) {
        // Start streaming
        stateManager.startStreaming({
          id: `stress-test-${i}`,
          text: `Stress test message ${i}`,
          timestamp: Date.now() + i,
          confidence: 0.8,
          source: 'websocket-gemini' as any
        })

        // Rapidly update
        for (let j = 0; j < 5; j++) {
          stateManager.updateStreaming(`Stress test message ${i} update ${j}`, true)
        }

        // Complete
        stateManager.updateStreaming(`Stress test message ${i} final`, false)

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 5))
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000)

      // Should have the expected number of transcripts
      const finalState = stateManager.getState()
      expect(finalState.static.transcripts).toHaveLength(10)
      
      // All transcripts should contain "final"
      finalState.static.transcripts.forEach(transcript => {
        expect(transcript.text).toContain('final')
      })
    })

    it('should handle error conditions without crashing', async () => {
      const errorListener = vi.fn()
      stateManager.subscribe(errorListener)

      // Try to update streaming when no stream is active
      stateManager.updateStreaming('Invalid update', false)

      // Try to complete streaming when no stream is active
      stateManager.completeStreaming()

      // Add some transcripts
      for (let i = 0; i < 5; i++) {
        stateManager.addTranscript({
          id: `transcript-${i}`,
          text: `Transcript ${i}`,
          timestamp: Date.now() + i,
          confidence: 0.8
        })
      }

      // Clear transcripts
      stateManager.clearTranscripts()

      // Try operations on destroyed state manager
      const tempStateManager = new TranscriptionStateManager()
      tempStateManager.destroy()
      
      // These should not crash
      tempStateManager.startStreaming({
        id: 'destroyed-stream',
        text: 'Should not work',
        timestamp: Date.now(),
        confidence: 0.8,
        source: 'websocket-gemini' as any
      })

      // Verify that the main state manager is still functional
      const state = stateManager.getState()
      expect(state.static.transcripts).toHaveLength(0) // Should be cleared
      expect(state.streaming.current).toBeNull()
    })
  })

  describe('Memory Management', () => {
    it('should not leak memory with many transcriptions', () => {
      const initialMemory = stateManager.getMemoryUsage()
      
      // Add many transcripts
      for (let i = 0; i < 100; i++) {
        stateManager.addTranscript({
          id: `memory-test-${i}`,
          text: `Memory test transcript ${i}`.repeat(10), // Make it larger
          timestamp: Date.now() + i,
          confidence: 0.8
        })
      }

      const memoryAfterAdding = stateManager.getMemoryUsage()
      expect(memoryAfterAdding.transcriptCount).toBe(100)
      expect(memoryAfterAdding.estimatedSize).toBeGreaterThan(initialMemory.estimatedSize)

      // Clear transcripts
      stateManager.clearTranscripts()

      const memoryAfterClearing = stateManager.getMemoryUsage()
      expect(memoryAfterClearing.transcriptCount).toBe(0)
      expect(memoryAfterClearing.estimatedSize).toBeLessThan(memoryAfterAdding.estimatedSize)
    })

    it('should provide accurate performance metrics', async () => {
      // Reset metrics
      stateManager.resetPerformanceMetrics()

      let initialMetrics = stateManager.getPerformanceMetrics()
      expect(initialMetrics.updateCount).toBe(0)

      // Perform some operations
      for (let i = 0; i < 10; i++) {
        stateManager.startStreaming({
          id: `perf-test-${i}`,
          text: `Performance test ${i}`,
          timestamp: Date.now() + i,
          confidence: 0.8,
          source: 'websocket-gemini' as any
        })
        
        stateManager.updateStreaming(`Performance test ${i} updated`, false)
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      const finalMetrics = stateManager.getPerformanceMetrics()
      expect(finalMetrics.updateCount).toBeGreaterThan(0)
      expect(finalMetrics.averageUpdateTime).toBeGreaterThan(0)
      expect(finalMetrics.lastUpdateTime).toBeGreaterThan(0)
    })
  })

  describe('Error Integration', () => {
    it('should integrate with TranscriptionError system', () => {
      // Verify that error types are available
      expect(TranscriptionError).toBeDefined()
      expect(TranscriptionErrorReporter).toBeDefined()

      // Test error reporting integration
      const initialStats = TranscriptionErrorReporter.getErrorStats()
      expect(Object.keys(initialStats)).toHaveLength(0)

      // The state manager should work independently of error reporting
      stateManager.addTranscript({
        id: 'error-integration-test',
        text: 'Error integration test',
        timestamp: Date.now(),
        confidence: 0.8
      })

      const state = stateManager.getState()
      expect(state.static.transcripts).toHaveLength(1)
    })
  })
})

describe('Compatibility Tests', () => {
  it('should maintain backward compatibility with existing code', () => {
    const stateManager = new TranscriptionStateManager()
    
    // Test that existing methods still work
    expect(typeof stateManager.getState).toBe('function')
    expect(typeof stateManager.subscribe).toBe('function')
    expect(typeof stateManager.startStreaming).toBe('function')
    expect(typeof stateManager.updateStreaming).toBe('function')
    expect(typeof stateManager.completeStreaming).toBe('function')
    expect(typeof stateManager.addTranscript).toBe('function')
    expect(typeof stateManager.clearTranscripts).toBe('function')
    expect(typeof stateManager.setRecordingState).toBe('function')
    expect(typeof stateManager.setProcessingState).toBe('function')

    // Test that state structure is as expected
    const state = stateManager.getState()
    expect(state).toHaveProperty('streaming')
    expect(state).toHaveProperty('static')
    expect(state).toHaveProperty('meta')
    expect(state).toHaveProperty('recording')
    expect(state).toHaveProperty('connection')

    stateManager.destroy()
  })
})
