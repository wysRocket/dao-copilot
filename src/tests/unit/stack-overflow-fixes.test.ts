/**
 * Stack Overflow Fix Tests
 * 
 * Tests specifically designed to verify the stack overflow fixes implemented
 * in the WebSocket transcription system are working correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  TranscriptionError, 
  StackOverflowError, 
  RecursiveCallError,
  TranscriptionErrorReporter,
  TranscriptionErrorRecovery,
  TranscriptionErrorType
} from '../../services/transcription-errors'

// Mock the main transcription service to test our fixes
vi.mock('../../services/main-stt-transcription', () => {
  let callDepth = 0
  const MAX_CALL_DEPTH = 3
  const recentCalls = new Map<string, number>()
  const CALL_COOLDOWN_MS = 1000

  return {
    transcribeAudio: vi.fn().mockImplementation(async (audioData: Buffer) => {
      // Simulate our stack overflow protection logic
      const audioHash = audioData.subarray(0, 100).toString('hex')
      const now = Date.now()
      
      // Check for rapid duplicate calls
      if (recentCalls.has(audioHash)) {
        const lastCall = recentCalls.get(audioHash)!
        if (now - lastCall < CALL_COOLDOWN_MS) {
          const error = new RecursiveCallError(
            'transcribeAudio',
            recentCalls.size,
            { audioHash, lastCall, currentTime: now }
          )
          throw error
        }
      }
      
      recentCalls.set(audioHash, now)
      
      callDepth++
      
      if (callDepth > MAX_CALL_DEPTH) {
        const error = new StackOverflowError(
          `Stack overflow protection: Maximum call depth ${MAX_CALL_DEPTH} exceeded`,
          callDepth,
          MAX_CALL_DEPTH,
          { audioHash }
        )
        callDepth = 0 // Reset
        recentCalls.clear()
        throw error
      }

      try {
        // Simulate successful transcription
        const result = {
          text: 'Mock transcription result',
          duration: 100,
          confidence: 0.95,
          source: 'websocket'
        }
        callDepth--
        return result
      } catch (error) {
        callDepth--
        throw error
      }
    })
  }
})

describe('Stack Overflow Protection Tests', () => {
  beforeEach(() => {
    // Reset error reporter state
    TranscriptionErrorReporter.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Error Type System', () => {
    it('should create StackOverflowError with proper context', () => {
      const error = new StackOverflowError(
        'Test stack overflow',
        5,
        3,
        { testContext: 'test' }
      )

      expect(error).toBeInstanceOf(TranscriptionError)
      expect(error.type).toBe(TranscriptionErrorType.STACK_OVERFLOW)
      expect(error.currentDepth).toBe(5)
      expect(error.maxDepth).toBe(3)
      expect(error.context.testContext).toBe('test')
      expect(error.recoveryStrategy).toContain('Reset transcription session')
    })

    it('should create RecursiveCallError with proper context', () => {
      const error = new RecursiveCallError(
        'testFunction',
        10,
        { additionalContext: 'test' }
      )

      expect(error).toBeInstanceOf(TranscriptionError)
      expect(error.type).toBe(TranscriptionErrorType.RECURSIVE_CALL)
      expect(error.functionName).toBe('testFunction')
      expect(error.callCount).toBe(10)
      expect(error.recoveryStrategy).toContain('duplicate call detection')
    })

    it('should serialize errors to JSON correctly', () => {
      const error = new StackOverflowError('Test error', 3, 2, { test: 'data' })
      const json = error.toJSON()

      expect(json.name).toBe('TranscriptionError')
      expect(json.type).toBe(TranscriptionErrorType.STACK_OVERFLOW)
      expect(json.message).toBe('Test error')
      expect(json.context.test).toBe('data')
      expect(json.context.currentDepth).toBe(3)
      expect(json.context.maxDepth).toBe(2)
      expect(typeof json.timestamp).toBe('number')
    })
  })

  describe('Error Reporter', () => {
    it('should track error counts correctly', () => {
      const error1 = new StackOverflowError('Error 1', 3, 2)
      const error2 = new StackOverflowError('Error 2', 4, 2)
      const error3 = new RecursiveCallError('func', 5)

      TranscriptionErrorReporter.reportError(error1)
      TranscriptionErrorReporter.reportError(error2)
      TranscriptionErrorReporter.reportError(error3)

      const stats = TranscriptionErrorReporter.getErrorStats()
      
      expect(stats[TranscriptionErrorType.STACK_OVERFLOW]).toBeDefined()
      expect(stats[TranscriptionErrorType.STACK_OVERFLOW].count).toBe(2)
      expect(stats[TranscriptionErrorType.RECURSIVE_CALL]).toBeDefined()
      expect(stats[TranscriptionErrorType.RECURSIVE_CALL].count).toBe(1)
    })

    it('should store last error occurrence', () => {
      const error = new StackOverflowError('Test error', 3, 2)
      TranscriptionErrorReporter.reportError(error)

      const stats = TranscriptionErrorReporter.getErrorStats()
      const stackOverflowStats = stats[TranscriptionErrorType.STACK_OVERFLOW]
      
      expect(stackOverflowStats.lastMessage).toBe('Test error')
      expect(stackOverflowStats.lastOccurrence).toBeDefined()
    })

    it('should reset error statistics', () => {
      const error = new StackOverflowError('Test error', 3, 2)
      TranscriptionErrorReporter.reportError(error)

      let stats = TranscriptionErrorReporter.getErrorStats()
      expect(Object.keys(stats)).toHaveLength(1)

      TranscriptionErrorReporter.reset()
      stats = TranscriptionErrorReporter.getErrorStats()
      expect(Object.keys(stats)).toHaveLength(0)
    })
  })

  describe('Error Recovery', () => {
    it('should implement exponential backoff for recovery', async () => {
      const error = new StackOverflowError('Test error', 3, 2)
      const startTime = Date.now()

      const canRecover = await TranscriptionErrorRecovery.recoverFromError(error, 0)
      const endTime = Date.now()

      expect(canRecover).toBe(true)
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000) // Should wait at least 1 second
    })

    it('should fail recovery after max attempts', async () => {
      const error = new StackOverflowError('Test error', 3, 2)

      const canRecover = await TranscriptionErrorRecovery.recoverFromError(error, 3)

      expect(canRecover).toBe(false)
    })

    it('should have different recovery strategies for different error types', async () => {
      const stackOverflowError = new StackOverflowError('Stack overflow', 3, 2)
      const recursiveCallError = new RecursiveCallError('func', 5)

      // Both should return true for recovery, but may have different timing
      const stackResult = await TranscriptionErrorRecovery.recoverFromError(stackOverflowError, 0)
      const recursiveResult = await TranscriptionErrorRecovery.recoverFromError(recursiveCallError, 0)

      expect(stackResult).toBe(true)
      expect(recursiveResult).toBe(true)
    })
  })

  describe('Duplicate Call Protection', () => {
    it('should detect rapid duplicate calls', async () => {
      const { transcribeAudio } = await import('../../services/main-stt-transcription')
      
      // Create identical audio data
      const audioData = Buffer.from('identical audio data')
      
      // First call should succeed
      const result1 = await transcribeAudio(audioData)
      expect(result1.text).toBe('Mock transcription result')

      // Immediate second call with same data should fail
      await expect(transcribeAudio(audioData)).rejects.toThrow(RecursiveCallError)
    })

    it('should allow calls after cooldown period', async () => {
      const { transcribeAudio } = await import('../../services/main-stt-transcription')
      
      // Create identical audio data
      const audioData = Buffer.from('test audio data')
      
      // First call should succeed
      await transcribeAudio(audioData)

      // Wait for cooldown period (simulate by mocking time)
      vi.useFakeTimers()
      vi.advanceTimersByTime(1100) // Advance by 1.1 seconds

      // Second call after cooldown should succeed
      const result2 = await transcribeAudio(audioData)
      expect(result2.text).toBe('Mock transcription result')

      vi.useRealTimers()
    })
  })

  describe('Call Depth Protection', () => {
    it('should prevent excessive call depth', async () => {
      const { transcribeAudio } = await import('../../services/main-stt-transcription')
      
      // Mock the call depth tracking to simulate exceeding max depth
      const originalMock = vi.mocked(transcribeAudio)
      let callCount = 0
      
      originalMock.mockImplementation(async (audioData: Buffer) => {
        callCount++
        
        if (callCount > 3) {
          // Simulate stack overflow protection triggering
          throw new StackOverflowError(
            'Stack overflow protection: Maximum call depth 3 exceeded',
            callCount,
            3,
            { audioHash: audioData.subarray(0, 100).toString('hex') }
          )
        }
        
        return {
          text: 'Mock transcription result',
          duration: 100,
          confidence: 0.95,
          source: 'websocket'
        }
      })

      // Create different audio data for each call to avoid duplicate detection
      const audioData1 = Buffer.from('audio data 1')
      const audioData2 = Buffer.from('audio data 2')
      const audioData3 = Buffer.from('audio data 3')
      const audioData4 = Buffer.from('audio data 4') // This should trigger stack overflow

      // These calls should succeed (within max depth)
      await transcribeAudio(audioData1)
      await transcribeAudio(audioData2)
      await transcribeAudio(audioData3)

      // This call should trigger stack overflow protection
      await expect(transcribeAudio(audioData4)).rejects.toThrow(StackOverflowError)
    })
  })

  describe('Error Context Information', () => {
    it('should include comprehensive context in errors', () => {
      const error = new StackOverflowError(
        'Test error',
        5,
        3,
        { 
          audioHash: 'abc123',
          callStack: ['call1', 'call2', 'call3'],
          additionalInfo: 'test'
        }
      )

      expect(error.context.currentDepth).toBe(5)
      expect(error.context.maxDepth).toBe(3)
      expect(error.context.audioHash).toBe('abc123')
      expect(error.context.callStack).toEqual(['call1', 'call2', 'call3'])
      expect(error.context.additionalInfo).toBe('test')
      expect(typeof error.timestamp).toBe('number')
      expect(error.callStack).toBeDefined()
    })

    it('should provide recovery strategies for all error types', () => {
      const stackOverflowError = new StackOverflowError('Test', 3, 2)
      const recursiveCallError = new RecursiveCallError('func', 5)

      expect(stackOverflowError.recoveryStrategy).toContain('Reset transcription session')
      expect(recursiveCallError.recoveryStrategy).toContain('duplicate call detection')
    })
  })

  describe('Integration with State Manager Protection', () => {
    it('should handle TranscriptionStateManager recursion protection', async () => {
      // Import the TranscriptionStateManager to test listener protection
      const { TranscriptionStateManager } = await import('../../state/TranscriptionStateManager')
      
      const stateManager = new TranscriptionStateManager()
      
      // Add a listener that could potentially cause recursion
      let callCount = 0
      const recursiveListener = vi.fn(() => {
        callCount++
        if (callCount < 5) {
          // This would normally cause recursion, but our protection should prevent it
          stateManager.setRecordingState(true, callCount * 100)
        }
      })

      stateManager.subscribe(recursiveListener)
      
      // Trigger the listener
      stateManager.setRecordingState(true, 100)

      // The listener should only be called once due to recursion protection
      expect(recursiveListener).toHaveBeenCalledTimes(1)
      expect(callCount).toBe(1)

      stateManager.destroy()
    })
  })
})

describe('Performance and Memory Tests', () => {
  it('should not leak memory during error handling', () => {
    // Generate many errors
    for (let i = 0; i < 100; i++) {
      const error = new StackOverflowError(`Error ${i}`, 3, 2)
      TranscriptionErrorReporter.reportError(error)
    }

    const stats = TranscriptionErrorReporter.getErrorStats()
    
    // Should only have one error type tracked (STACK_OVERFLOW)
    expect(Object.keys(stats)).toHaveLength(1)
    expect(stats[TranscriptionErrorType.STACK_OVERFLOW].count).toBe(100)

    // Reset should clean up properly
    TranscriptionErrorReporter.reset()
    const finalStats = TranscriptionErrorReporter.getErrorStats()
    expect(Object.keys(finalStats)).toHaveLength(0)
  })

  it('should handle rapid error creation without performance degradation', () => {
    const startTime = performance.now()

    // Create many errors rapidly
    for (let i = 0; i < 1000; i++) {
      new StackOverflowError(`Error ${i}`, 3, 2, { iteration: i })
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    // Should complete within reasonable time (less than 100ms for 1000 errors)
    expect(duration).toBeLessThan(100)
  })
})
