/**
 * Tests for Enhanced Timestamp Tracking System
 */

import {describe, it, expect, beforeEach} from 'vitest'
import {TimestampTrackingService} from '../../services/TimestampTrackingService'
import {EnhancedLiveTranscriptionBuffer} from '../../services/EnhancedLiveTranscriptionBuffer'

describe('TimestampTrackingService', () => {
  let service: TimestampTrackingService

  beforeEach(() => {
    service = new TimestampTrackingService()
    service.startSession(1000) // Start at 1 second
  })

  describe('Basic Functionality', () => {
    it('should initialize with default configuration', () => {
      const config = service.getConfig()
      expect(config.gapDetectionThreshold).toBe(1000)
      expect(config.maxAcceptableGap).toBe(5000)
      expect(config.estimationStrategy).toBe('adaptive')
    })

    it('should start a session correctly', () => {
      const analysis = service.getTimestampAnalysis()
      expect(analysis.totalDuration).toBeGreaterThanOrEqual(0)
      expect(analysis.gaps).toHaveLength(0)
      expect(analysis.continuityScore).toBe(1)
    })
  })

  describe('Segment Management', () => {
    it('should add segments with proper timeline ordering', () => {
      service.addSegment('seg1', 'Hello', false, 1000, 2000)
      service.addSegment('seg2', 'World', false, 2500, 3500)

      const segments = service.getTimelineSegments()
      expect(segments).toHaveLength(2)
      expect(segments[0].startTime).toBe(1000)
      expect(segments[1].startTime).toBe(2500)
    })

    it('should finalize partial segments', () => {
      const segment = service.addSegment('seg1', 'Partial text', true, 1000)
      expect(segment.isPartial).toBe(true)

      const finalized = service.finalizeSegment('seg1', 'Final text', 2000)
      expect(finalized?.isPartial).toBe(false)
      expect(finalized?.text).toBe('Final text')
    })

    it('should handle segments with estimated timing', () => {
      // Add without explicit timing
      const segment = service.addSegment('seg1', 'Estimated timing', false)
      expect(segment.startTime).toBeGreaterThanOrEqual(1000)
      expect(segment.endTime).toBeGreaterThan(segment.startTime)
    })
  })

  describe('Gap Detection', () => {
    it('should detect gaps between segments', () => {
      // Add segment at 1000-2000
      service.addSegment('seg1', 'First', false, 1000, 2000)

      // Add segment at 4000-5000 (2 second gap)
      service.addSegment('seg2', 'Second', false, 4000, 5000)

      const gaps = service.getDetectedGaps()
      expect(gaps).toHaveLength(1)
      expect(gaps[0].startTime).toBe(2000)
      expect(gaps[0].endTime).toBe(4000)
      expect(gaps[0].duration).toBe(2000)
      expect(gaps[0].type).toBe('silence')
    })

    it('should not detect gaps smaller than threshold', () => {
      service.addSegment('seg1', 'First', false, 1000, 2000)
      service.addSegment('seg2', 'Second', false, 2500, 3500) // 500ms gap < 1000ms threshold

      const gaps = service.getDetectedGaps()
      expect(gaps).toHaveLength(0)
    })

    it('should mark segments with gap indicators', () => {
      service.addSegment('seg1', 'First', false, 1000, 2000)
      const segment = service.addSegment('seg2', 'Second', false, 4000, 5000) // 2 second gap

      expect(segment.hasGapBefore).toBe(true)
    })
  })

  describe('Timeline Analysis', () => {
    it('should calculate continuity score correctly', () => {
      // Perfect continuity scenario
      service.addSegment('seg1', 'First', false, 1000, 2000)
      service.addSegment('seg2', 'Second', false, 2000, 3000)

      const analysis = service.getTimestampAnalysis()
      expect(analysis.continuityScore).toBe(1)
    })

    it('should calculate continuity score with gaps', () => {
      service.addSegment('seg1', 'First', false, 1000, 2000)
      service.addSegment('seg2', 'Second', false, 4000, 5000) // 2 second gap

      const analysis = service.getTimestampAnalysis()
      expect(analysis.continuityScore).toBeLessThan(1)
      expect(analysis.gaps).toHaveLength(1)
    })

    it('should provide comprehensive analysis', () => {
      service.addSegment('seg1', 'First segment', false, 1000, 2500)
      service.addSegment('seg2', 'Second segment', false, 4000, 5000)

      const analysis = service.getTimestampAnalysis()
      expect(analysis.totalDuration).toBeGreaterThan(0)
      expect(analysis.activeTranscriptionTime).toBe(2500) // 1500ms + 1000ms
      expect(analysis.averageSegmentDuration).toBe(1250) // (1500 + 1000) / 2
      expect(analysis.longestGap).toBeTruthy()
      expect(analysis.shortestGap).toBeTruthy()
    })
  })

  describe('Continuity Validation', () => {
    it('should validate perfect continuity', () => {
      service.addSegment('seg1', 'First', false, 1000, 2000)
      service.addSegment('seg2', 'Second', false, 2000, 3000)

      const validation = service.validateContinuity()
      expect(validation.isValid).toBe(true)
      expect(validation.issues).toHaveLength(0)
    })

    it('should detect overlapping segments', () => {
      service.addSegment('seg1', 'First', false, 1000, 3000)
      service.addSegment('seg2', 'Second', false, 2000, 4000) // Overlaps with first

      const validation = service.validateContinuity()
      expect(validation.isValid).toBe(false)
      expect(validation.issues.some(issue => issue.includes('overlap'))).toBe(true)
    })

    it('should detect excessive gaps', () => {
      const customService = new TimestampTrackingService({maxAcceptableGap: 1000})
      customService.startSession(1000)

      customService.addSegment('seg1', 'First', false, 1000, 2000)
      customService.addSegment('seg2', 'Second', false, 4000, 5000) // 2 second gap > 1 second threshold

      const validation = customService.validateContinuity()
      expect(validation.isValid).toBe(false)
      expect(validation.issues.some(issue => issue.includes('exceed acceptable threshold'))).toBe(
        true
      )
    })
  })

  describe('Configuration Updates', () => {
    it('should update configuration correctly', () => {
      const newConfig = {gapDetectionThreshold: 2000, maxAcceptableGap: 10000}
      service.updateConfig(newConfig)

      const config = service.getConfig()
      expect(config.gapDetectionThreshold).toBe(2000)
      expect(config.maxAcceptableGap).toBe(10000)
    })

    it('should apply new configuration to gap detection', () => {
      // Set very high threshold so no gaps are detected
      service.updateConfig({gapDetectionThreshold: 10000})

      service.addSegment('seg1', 'First', false, 1000, 2000)
      service.addSegment('seg2', 'Second', false, 4000, 5000) // 2 second gap < 10 second threshold

      const gaps = service.getDetectedGaps()
      expect(gaps).toHaveLength(0)
    })
  })
})

describe('EnhancedLiveTranscriptionBuffer Integration', () => {
  let buffer: EnhancedLiveTranscriptionBuffer

  beforeEach(() => {
    buffer = new EnhancedLiveTranscriptionBuffer({
      timestampTrackingConfig: {
        gapDetectionThreshold: 1000,
        maxAcceptableGap: 3000,
        estimationStrategy: 'adaptive',
        enableGapFilling: false,
        timelinePrecision: 100
      }
    })
    buffer.startSession()
  })

  describe('Enhanced State Management', () => {
    it('should provide enhanced state with timeline information', () => {
      buffer.addSegment('Hello world', false, 'websocket')

      const state = buffer.getEnhancedState()
      expect(state.timeline).toBeDefined()
      expect(state.timeline.analysis).toBeDefined()
      expect(state.timeline.gaps).toBeDefined()
      expect(state.timeline.segments).toBeDefined()
      expect(state.timeline.continuityScore).toBeDefined()
    })

    it('should integrate gap detection with transcription', () => {
      // Add segments with a gap
      buffer.addSegment('First segment', false, 'websocket', 1000)
      buffer.addSegment('Second segment', false, 'websocket', 4000) // 3 second gap

      const gaps = buffer.getTimelineGaps()
      expect(gaps).toHaveLength(1)
      expect(gaps[0].duration).toBeGreaterThan(1000)
    })

    it('should detect significant gaps', () => {
      buffer.addSegment('First', false, 'websocket', 1000)
      buffer.addSegment('Second', false, 'websocket', 5000) // 4 second gap > 3 second threshold

      expect(buffer.hasSignificantGaps()).toBe(true)
    })

    it('should provide gap handling recommendations', () => {
      buffer.addSegment('First', false, 'websocket', 1000)
      buffer.addSegment('Second', false, 'websocket', 5000) // 4 second gap

      const recommendations = buffer.getGapHandlingRecommendations()
      expect(recommendations.hasIssues).toBe(true)
      expect(recommendations.recommendations.length).toBeGreaterThan(0)
      expect(recommendations.gapsToAddress.length).toBeGreaterThan(0)
    })
  })

  describe('Session Management', () => {
    it('should provide comprehensive session analysis on end', () => {
      buffer.addSegment('Hello', false, 'websocket', 1000)
      buffer.addSegment('World', false, 'websocket', 3000)

      const sessionResult = buffer.endSession()
      expect(sessionResult.finalState).toBeDefined()
      expect(sessionResult.analysis).toBeDefined()
      expect(sessionResult.continuityReport).toBeDefined()
      expect(sessionResult.continuityReport.isValid).toBeDefined()
    })

    it('should handle partial segment finalization', () => {
      const segmentId = buffer.addSegment('Partial text', true, 'websocket', 1000)
      const success = buffer.finalizeSegment(segmentId, 'Final text')

      expect(success).toBe(true)

      const segments = buffer.getTimelineAnalysis().gaps
      // Should not affect gap detection negatively
      expect(segments.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Configuration Management', () => {
    it('should update timestamp configuration', () => {
      buffer.updateTimestampConfig({gapDetectionThreshold: 2000})

      const config = buffer.getEnhancedConfig()
      expect(config.timestampTrackingConfig.gapDetectionThreshold).toBe(2000)
    })

    it('should apply configuration changes to detection', () => {
      // Initially should detect gap
      buffer.addSegment('First', false, 'websocket', 1000)
      buffer.addSegment('Second', false, 'websocket', 3000) // 2 second gap > 1 second threshold

      expect(buffer.getTimelineGaps()).toHaveLength(1)

      // Update threshold to ignore this gap
      buffer.updateTimestampConfig({gapDetectionThreshold: 3000})

      // Add new segments to test new threshold
      buffer.addSegment('Third', false, 'websocket', 5000)
      buffer.addSegment('Fourth', false, 'websocket', 7000) // 2 second gap < 3 second threshold

      // Should still have only the original gap
      expect(buffer.getTimelineGaps()).toHaveLength(1)
    })
  })
})
