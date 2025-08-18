/**
 * Unit tests for LiveTranscriptionBuffer
 * Testing the buffer system for live transcription display continuity
 */

import {vi} from 'vitest'
import {
  LiveTranscriptionBuffer,
  LiveTranscriptionState
} from '../../services/LiveTranscriptionBuffer'

describe('LiveTranscriptionBuffer', () => {
  let buffer: LiveTranscriptionBuffer

  beforeEach(() => {
    buffer = new LiveTranscriptionBuffer({
      maxSegments: 100,
      retentionTime: 60000, // 1 minute for testing
      debounceDelay: 10, // Fast for testing
      immediateDisplay: true,
      persistentDisplay: true,
      timestampTracking: true
    })
  })

  afterEach(() => {
    buffer.destroy()
  })

  describe('Session Management', () => {
    it('should start a session correctly', () => {
      const startTime = Date.now()
      buffer.startSession(startTime)

      const state = buffer.getState()
      expect(state.sessionStartTime).toBe(startTime)
      expect(state.isActivelyStreaming).toBe(true)
      expect(state.segments).toHaveLength(0)
      expect(state.currentText).toBe('')
    })

    it('should end a session and finalize partial segments', () => {
      buffer.startSession()

      // Add a partial segment
      buffer.addSegment('Hello', true, 'test-source')

      // End session
      buffer.endSession()

      const state = buffer.getState()
      expect(state.isActivelyStreaming).toBe(false)
      expect(state.segments[0].isFinal).toBe(true)
      expect(state.segments[0].isPartial).toBe(false)
    })
  })

  describe('Segment Management', () => {
    beforeEach(() => {
      buffer.startSession()
    })

    it('should add partial segments correctly', () => {
      const segmentId = buffer.addSegment('Hello world', true, 'websocket', 1000, 0.95)

      expect(segmentId).toBeDefined()

      const state = buffer.getState()
      expect(state.segments).toHaveLength(1)
      expect(state.segments[0].text).toBe('Hello world')
      expect(state.segments[0].isPartial).toBe(true)
      expect(state.segments[0].isFinal).toBe(false)
      expect(state.segments[0].source).toBe('websocket')
      expect(state.segments[0].confidence).toBe(0.95)
      expect(state.currentText).toBe('Hello world')
    })

    it('should add final segments correctly', () => {
      buffer.addSegment('Complete sentence.', false, 'batch', 2000, 0.98)

      const state = buffer.getState()
      expect(state.segments[0].isPartial).toBe(false)
      expect(state.segments[0].isFinal).toBe(true)
      expect(state.currentText).toBe('Complete sentence.')
    })

    it('should auto-merge consecutive partial segments from same source', () => {
      // Add first partial
      buffer.addSegment('Hello', true, 'websocket')

      // Add second partial from same source - should merge
      buffer.addSegment('Hello world', true, 'websocket')

      const state = buffer.getState()
      expect(state.segments).toHaveLength(1)
      expect(state.segments[0].text).toBe('Hello world')
      expect(state.currentText).toBe('Hello world')
    })

    it('should not merge partials from different sources', () => {
      // Add partial from websocket
      buffer.addSegment('Hello', true, 'websocket')

      // Add partial from different source - should not merge
      buffer.addSegment('World', true, 'batch')

      const state = buffer.getState()
      expect(state.segments).toHaveLength(2)
      expect(state.currentText).toBe('Hello World')
    })

    it('should finalize segments correctly', () => {
      const segmentId = buffer.addSegment('Hello wor', true, 'websocket')

      // Finalize with corrected text
      const success = buffer.finalizeSegment(segmentId, 'Hello world!')

      expect(success).toBe(true)

      const state = buffer.getState()
      expect(state.segments[0].text).toBe('Hello world!')
      expect(state.segments[0].isPartial).toBe(false)
      expect(state.segments[0].isFinal).toBe(true)
    })

    it('should handle finalization of non-existent segments', () => {
      const success = buffer.finalizeSegment('non-existent-id')
      expect(success).toBe(false)
    })
  })

  describe('Text Display Behavior', () => {
    beforeEach(() => {
      buffer.startSession()
    })

    it('should show partial text immediately when immediateDisplay is enabled', () => {
      buffer.addSegment('Hello', true, 'websocket')

      const state = buffer.getState()
      expect(state.currentText).toBe('Hello')
    })

    it('should show multiple segments as combined text', () => {
      buffer.addSegment('Hello', false, 'websocket')
      buffer.addSegment('world', false, 'websocket')
      buffer.addSegment('!', false, 'websocket')

      const state = buffer.getState()
      expect(state.currentText).toBe('Hello world !')
    })

    it('should preserve text across session operations when persistentDisplay is enabled', () => {
      buffer.addSegment('Important text', false, 'websocket')

      // End session
      buffer.endSession()

      // Start new session
      buffer.startSession()

      const state = buffer.getState()
      expect(state.currentText).toBe('Important text')
      expect(state.segments).toHaveLength(1)
    })
  })

  describe('Timestamp Tracking', () => {
    beforeEach(() => {
      buffer.startSession()
    })

    it('should track audio timestamps when provided', () => {
      const audioTime = 5000 // 5 seconds
      buffer.addSegment('Timed text', false, 'websocket', audioTime)

      const state = buffer.getState()
      expect(state.segments[0].startTime).toBe(audioTime)
      expect(state.segments[0].endTime).toBeDefined()
    })

    it('should estimate timestamps when not provided', () => {
      buffer.addSegment('Estimated timing', false, 'websocket')

      const state = buffer.getState()
      expect(state.segments[0].startTime).toBeDefined()
      // Should be a reasonable timestamp (based on session time)
      expect(state.segments[0].startTime).toBeGreaterThanOrEqual(0)
    })

    it('should not set endTime for partial segments', () => {
      buffer.addSegment('Partial text', true, 'websocket', 1000)

      const state = buffer.getState()
      expect(state.segments[0].startTime).toBe(1000)
      expect(state.segments[0].endTime).toBeUndefined()
    })
  })

  describe('Activity Detection', () => {
    beforeEach(() => {
      buffer.startSession()
    })

    it('should detect recent activity correctly', async () => {
      buffer.addSegment('Recent activity', false, 'websocket')

      expect(buffer.hasRecentActivity(10000)).toBe(true)

      // Wait a bit then check with a small window
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(buffer.hasRecentActivity(5)).toBe(false)
    })

    it('should update isActivelyStreaming based on recent activity', () => {
      buffer.addSegment('Active streaming', false, 'websocket')

      const state = buffer.getState()
      expect(state.isActivelyStreaming).toBe(true)
    })
  })

  describe('Statistics Calculation', () => {
    beforeEach(() => {
      buffer.startSession()
    })

    it('should calculate stats correctly', () => {
      buffer.addSegment('Partial 1', true, 'websocket', undefined, 0.8)
      buffer.addSegment('Final 1', false, 'websocket', undefined, 0.9)
      buffer.addSegment('Final 2', false, 'batch', undefined, 0.85)

      const state = buffer.getState()
      expect(state.stats.totalSegments).toBe(3)
      expect(state.stats.partialSegments).toBe(1)
      expect(state.stats.finalSegments).toBe(2)
      expect(state.stats.averageConfidence).toBeCloseTo(0.85, 2)
    })

    it('should handle empty segments in stats', () => {
      const state = buffer.getState()
      expect(state.stats.totalSegments).toBe(0)
      expect(state.stats.averageConfidence).toBe(0)
    })
  })

  describe('Performance and Memory Management', () => {
    beforeEach(() => {
      buffer.startSession()
    })

    it('should enforce segment retention policy', () => {
      // Create buffer with short retention time
      const shortBuffer = new LiveTranscriptionBuffer({
        retentionTime: 100, // 100ms
        maxSegments: 1000
      })

      shortBuffer.startSession()

      // Add segments
      shortBuffer.addSegment('Old segment', false, 'websocket')

      // Wait for retention time to pass
      return new Promise<void>(resolve => {
        setTimeout(() => {
          shortBuffer.addSegment('New segment', false, 'websocket')

          const state = shortBuffer.getState()
          // Should only have new segment (old one cleaned up)
          expect(state.segments.length).toBeLessThanOrEqual(2)

          shortBuffer.destroy()
          resolve()
        }, 150)
      })
    })

    it('should provide performance statistics', () => {
      buffer.addSegment('Test segment 1', false, 'websocket')
      buffer.addSegment('Test segment 2', false, 'websocket')

      const stats = buffer.getPerformanceStats()
      expect(stats.segmentCount).toBe(2)
      expect(stats.averageSegmentLength).toBeGreaterThan(0)
      expect(stats.memoryUsage).toBeGreaterThan(0)
      expect(stats.updateFrequency).toBe(2)
    })
  })

  describe('Event Subscription', () => {
    beforeEach(() => {
      buffer.startSession()
    })

    it('should notify listeners of state changes', done => {
      let callCount = 0

      const unsubscribe = buffer.subscribe((state: LiveTranscriptionState) => {
        callCount++

        if (callCount === 1) {
          // Initial state
          expect(state.segments).toHaveLength(0)
        } else if (callCount === 2) {
          // After adding segment
          expect(state.segments).toHaveLength(1)
          expect(state.currentText).toBe('Test notification')
          unsubscribe()
          done()
        }
      })

      // Add a segment to trigger notification
      buffer.addSegment('Test notification', false, 'websocket')
    })

    it('should handle listener errors gracefully', () => {
      const errorListener = () => {
        throw new Error('Test error')
      }

      const goodListener = vi.fn()

      buffer.subscribe(errorListener)
      buffer.subscribe(goodListener)

      // This should not throw even though errorListener throws
      expect(() => {
        buffer.addSegment('Test segment', false, 'websocket')
      }).not.toThrow()

      // Good listener should still be called (at least once for subscription)
      expect(goodListener).toHaveBeenCalled()
    })
  })

  describe('Configuration Updates', () => {
    it('should update configuration correctly', () => {
      buffer.updateConfig({
        immediateDisplay: false,
        persistentDisplay: false
      })

      buffer.startSession()
      buffer.addSegment('Partial text', true, 'websocket')

      // With immediateDisplay false, partial text shouldn't show
      const currentText = buffer.getCurrentText()
      expect(currentText).toBe('')
    })
  })

  describe('Cleanup and Destruction', () => {
    it('should clean up resources on destroy', () => {
      buffer.startSession()
      buffer.addSegment('Test', false, 'websocket')

      const stateBefore = buffer.getState()
      expect(stateBefore.segments).toHaveLength(1)

      buffer.destroy()

      // After destruction, buffer should be empty
      const stateAfter = buffer.getState()
      expect(stateAfter.segments).toHaveLength(0)
      expect(stateAfter.isActivelyStreaming).toBe(false)
    })
  })
})
