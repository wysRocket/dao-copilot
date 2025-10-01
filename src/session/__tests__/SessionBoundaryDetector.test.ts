/**
 * SessionBoundaryDetector Test Suite
 *
 * Comprehensive tests for session boundary detection, transition handling,
 * in-flight data processing, and error scenarios.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  SessionBoundaryDetector,
  BoundaryState,
  BoundaryTrigger,
  InFlightDataType,
  getSessionBoundaryDetector,
  initializeSessionBoundaryDetector
} from '../SessionBoundaryDetector'
import {SessionManager} from '../SessionManager'
import {SessionIDSafeguards} from '../SessionIDSafeguards'

// Mock dependencies
vi.mock('../../services/gemini-logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('../../services/gemini-session-manager', () => ({
  default: vi.fn(() => ({
    createSession: vi.fn().mockReturnValue({sessionId: 'gemini_session_123'}),
    suspendSession: vi.fn()
  })),
  SessionStatus: {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    EXPIRED: 'expired',
    ERROR: 'error'
  }
}))

describe('SessionBoundaryDetector', () => {
  let boundaryDetector: SessionBoundaryDetector
  let sessionManager: SessionManager
  let safeguards: SessionIDSafeguards

  beforeEach(async () => {
    vi.clearAllMocks()

    // Initialize dependencies
    sessionManager = new SessionManager({
      sessionTimeout: 30000,
      maxConcurrentSessions: 5,
      telemetryEnabled: false
    })

    safeguards = new SessionIDSafeguards({
      telemetryEnabled: false,
      orphanDetectionInterval: 1000
    })

    boundaryDetector = new SessionBoundaryDetector(sessionManager, safeguards, {
      silenceThreshold: 1000, // 1 second for testing
      stabilizationWindow: 500, // 500ms for testing
      maxTransitionTime: 3000, // 3 seconds
      telemetryEnabled: true,
      confidenceThreshold: 0.6
    })
  })

  afterEach(async () => {
    await boundaryDetector.destroy()
    await safeguards.destroy()
    await sessionManager.destroy()
  })

  describe('Boundary Detection', () => {
    let sessionId: string

    beforeEach(async () => {
      sessionId = await sessionManager.createSession()
      await sessionManager.startSession(sessionId)
    })

    it('should detect audio silence boundary', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Trigger audio silence
      boundaryDetector.onAudioSilence(1500, 0.8) // 1.5 seconds, 80% confidence

      expect(detectedHandler).toHaveBeenCalled()
      expect(boundaryDetector.getState()).toBe(BoundaryState.DETECTING)

      const event = detectedHandler.mock.calls[0][0]
      expect(event.trigger).toBe(BoundaryTrigger.AUDIO_SILENCE)
      expect(event.currentSessionId).toBe(sessionId)
      expect(event.confidence).toBe(0.8)
    })

    it('should not detect audio silence below threshold', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Trigger insufficient silence
      boundaryDetector.onAudioSilence(500, 0.8) // Only 500ms

      expect(detectedHandler).not.toHaveBeenCalled()
      expect(boundaryDetector.getState()).toBe(BoundaryState.IDLE)
    })

    it('should detect user action boundary', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Trigger user action
      boundaryDetector.onUserAction('stop_recording', sessionId)

      expect(detectedHandler).toHaveBeenCalled()
      expect(boundaryDetector.getState()).toBe(BoundaryState.DETECTING)

      const event = detectedHandler.mock.calls[0][0]
      expect(event.trigger).toBe(BoundaryTrigger.USER_ACTION)
      expect(event.confidence).toBe(1.0) // User actions have maximum confidence
    })

    it('should detect transcription complete boundary', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Add a transcript to session
      const transcriptId = 'transcript_test_123'
      sessionManager.addTranscriptToSession(sessionId, transcriptId)

      // Trigger transcription complete (this is the last transcript)
      boundaryDetector.onTranscriptionComplete(transcriptId, sessionId)

      expect(detectedHandler).toHaveBeenCalled()
      expect(boundaryDetector.getState()).toBe(BoundaryState.DETECTING)

      const event = detectedHandler.mock.calls[0][0]
      expect(event.trigger).toBe(BoundaryTrigger.TRANSCRIPTION_COMPLETE)
    })

    it('should detect connection change boundary', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Trigger connection change
      boundaryDetector.onConnectionChange('disconnected', sessionId)

      expect(detectedHandler).toHaveBeenCalled()

      const event = detectedHandler.mock.calls[0][0]
      expect(event.trigger).toBe(BoundaryTrigger.CONNECTION_CHANGE)
      expect(event.confidence).toBe(0.6)
    })

    it('should force boundary when requested', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Force boundary
      boundaryDetector.forceBoundary(sessionId, 'Testing forced boundary')

      expect(detectedHandler).toHaveBeenCalled()

      const event = detectedHandler.mock.calls[0][0]
      expect(event.trigger).toBe(BoundaryTrigger.FORCED_BOUNDARY)
      expect(event.confidence).toBe(1.0)
      expect(event.metadata.reason).toBe('Testing forced boundary')
    })

    it('should not detect boundary when no active sessions', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Stop the active session
      sessionManager.stopSession(sessionId)

      // Try to trigger boundary
      boundaryDetector.onAudioSilence(2000, 0.8)

      expect(detectedHandler).not.toHaveBeenCalled()
    })
  })

  describe('In-Flight Data Management', () => {
    it('should add and track in-flight data', () => {
      const dataId = boundaryDetector.addInFlightData({
        type: InFlightDataType.PARTIAL_TRANSCRIPT,
        sessionId: 'session_test',
        transcriptId: 'transcript_test',
        data: {text: 'partial transcript'},
        priority: 'normal',
        expiresAt: performance.now() + 5000
      })

      expect(dataId).toBeTruthy()
      expect(typeof dataId).toBe('string')
      expect(dataId.startsWith('inflight_')).toBe(true)

      const stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(1)
    })

    it('should remove in-flight data', () => {
      const dataId = boundaryDetector.addInFlightData({
        type: InFlightDataType.AUDIO_BUFFER,
        sessionId: 'session_test',
        data: {buffer: new ArrayBuffer(1024)},
        priority: 'high',
        expiresAt: performance.now() + 5000
      })

      expect(boundaryDetector.removeInFlightData(dataId)).toBe(true)
      expect(boundaryDetector.removeInFlightData(dataId)).toBe(false) // Already removed

      const stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(0)
    })

    it('should handle multiple in-flight data items', () => {
      const dataIds: string[] = []

      // Add multiple items
      for (let i = 0; i < 5; i++) {
        const id = boundaryDetector.addInFlightData({
          type: InFlightDataType.PENDING_RESPONSE,
          sessionId: `session_${i}`,
          data: {response: `response_${i}`},
          priority: 'normal',
          expiresAt: performance.now() + 5000
        })
        dataIds.push(id)
      }

      expect(dataIds).toHaveLength(5)
      expect(new Set(dataIds).size).toBe(5) // All unique

      const stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(5)
    })
  })

  describe('Boundary Confirmation and Transition', () => {
    let sessionId: string

    beforeEach(async () => {
      sessionId = await sessionManager.createSession()
      await sessionManager.startSession(sessionId)
    })

    it('should confirm boundary after stabilization window', async () => {
      const confirmedHandler = vi.fn()
      const transitionStartedHandler = vi.fn()
      const transitionCompletedHandler = vi.fn()

      boundaryDetector.on('boundary:confirmed', confirmedHandler)
      boundaryDetector.on('transition:started', transitionStartedHandler)
      boundaryDetector.on('transition:completed', transitionCompletedHandler)

      // Trigger boundary
      boundaryDetector.onUserAction('stop_recording', sessionId)

      expect(boundaryDetector.getState()).toBe(BoundaryState.DETECTING)

      // Wait for stabilization and confirmation
      await new Promise(resolve => setTimeout(resolve, 600)) // Wait longer than stabilization window

      expect(confirmedHandler).toHaveBeenCalled()
      expect(transitionStartedHandler).toHaveBeenCalled()
      expect(transitionCompletedHandler).toHaveBeenCalled()

      const stats = boundaryDetector.getStatistics()
      expect(stats.currentState).toBe(BoundaryState.STABILIZED)
    })

    it('should reject boundary with low confidence', async () => {
      const rejectedHandler = vi.fn()
      boundaryDetector.on('boundary:rejected', rejectedHandler)

      // Trigger boundary with low confidence
      boundaryDetector.onAudioSilence(2000, 0.3) // Below threshold of 0.6

      // Wait for stabilization
      await new Promise(resolve => setTimeout(resolve, 600))

      expect(rejectedHandler).toHaveBeenCalled()
      expect(boundaryDetector.getState()).toBe(BoundaryState.IDLE)

      const rejectionReason = rejectedHandler.mock.calls[0][1]
      expect(rejectionReason).toContain('Boundary conditions not met')
    })

    it('should handle transition with in-flight data', async () => {
      const inFlightDetectedHandler = vi.fn()
      const inFlightProcessedHandler = vi.fn()

      boundaryDetector.on('inflight:detected', inFlightDetectedHandler)
      boundaryDetector.on('inflight:processed', inFlightProcessedHandler)

      // Add in-flight data
      boundaryDetector.addInFlightData({
        type: InFlightDataType.PARTIAL_TRANSCRIPT,
        sessionId,
        transcriptId: 'transcript_test',
        data: {text: 'partial text'},
        priority: 'normal',
        expiresAt: performance.now() + 5000
      })

      // Trigger boundary
      boundaryDetector.forceBoundary(sessionId)

      // Wait for transition
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(inFlightDetectedHandler).toHaveBeenCalled()
      expect(inFlightProcessedHandler).toHaveBeenCalled()

      const detectedData = inFlightDetectedHandler.mock.calls[0][0]
      expect(detectedData).toHaveLength(1)
      expect(detectedData[0].type).toBe(InFlightDataType.PARTIAL_TRANSCRIPT)
    })
  })

  describe('Error Handling', () => {
    let sessionId: string

    beforeEach(async () => {
      sessionId = await sessionManager.createSession()
      await sessionManager.startSession(sessionId)
    })

    it('should handle transition failures gracefully', async () => {
      const transitionFailedHandler = vi.fn()
      boundaryDetector.on('transition:failed', transitionFailedHandler)

      // Mock session manager to throw error
      vi.spyOn(sessionManager, 'stopSession').mockRejectedValueOnce(
        new Error('Stop session failed')
      )

      // Trigger boundary
      boundaryDetector.forceBoundary(sessionId)

      // Wait for failure
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(transitionFailedHandler).toHaveBeenCalled()
      expect(boundaryDetector.getState()).toBe(BoundaryState.ERROR)

      // Should recover to idle state
      await new Promise(resolve => setTimeout(resolve, 5100))
      expect(boundaryDetector.getState()).toBe(BoundaryState.IDLE)
    })

    it('should skip detection during active transition', () => {
      const detectedHandler = vi.fn()
      boundaryDetector.on('boundary:detected', detectedHandler)

      // Start transition
      boundaryDetector.forceBoundary(sessionId)
      expect(boundaryDetector.getState()).toBe(BoundaryState.DETECTING)

      // Try to trigger another boundary during transition
      boundaryDetector.onAudioSilence(2000, 0.8)

      // Should only have one detection event
      expect(detectedHandler).toHaveBeenCalledTimes(1)
    })

    it('should handle expired in-flight data', async () => {
      const expiredHandler = vi.fn()
      boundaryDetector.on('inflight:expired', expiredHandler)

      // Add expired in-flight data
      boundaryDetector.addInFlightData({
        type: InFlightDataType.PENDING_RESPONSE,
        sessionId,
        data: {response: 'test'},
        priority: 'normal',
        expiresAt: performance.now() - 1000 // Already expired
      })

      // Trigger boundary to process in-flight data
      boundaryDetector.forceBoundary(sessionId)

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(expiredHandler).toHaveBeenCalled()

      const expiredData = expiredHandler.mock.calls[0][0]
      expect(expiredData).toHaveLength(1)
      expect(expiredData[0].type).toBe(InFlightDataType.PENDING_RESPONSE)
    })
  })

  describe('Statistics and State Management', () => {
    it('should provide accurate statistics', () => {
      const stats = boundaryDetector.getStatistics()

      expect(stats.currentState).toBe(BoundaryState.IDLE)
      expect(stats.inFlightDataCount).toBe(0)
      expect(stats.pendingBoundariesCount).toBe(0)
      expect(typeof stats.lastAudioActivity).toBe('number')
      expect(stats.currentTransition).toBeNull()
      expect(typeof stats.boundaryDetections).toBe('number')
      expect(typeof stats.successfulTransitions).toBe('number')
      expect(typeof stats.failedTransitions).toBe('number')
    })

    it('should track state transitions', async () => {
      const sessionId = await sessionManager.createSession()
      await sessionManager.startSession(sessionId)

      expect(boundaryDetector.getState()).toBe(BoundaryState.IDLE)

      // Trigger detection
      boundaryDetector.onUserAction('stop_recording', sessionId)
      expect(boundaryDetector.getState()).toBe(BoundaryState.DETECTING)

      // Wait for transition
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(boundaryDetector.getState()).toBe(BoundaryState.TRANSITION_PENDING)
    })

    it('should update statistics with in-flight data changes', () => {
      let stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(0)

      // Add data
      const dataId = boundaryDetector.addInFlightData({
        type: InFlightDataType.AUDIO_BUFFER,
        sessionId: 'test',
        data: {},
        priority: 'normal',
        expiresAt: performance.now() + 5000
      })

      stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(1)

      // Remove data
      boundaryDetector.removeInFlightData(dataId)

      stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(0)
    })
  })

  describe('Configuration Options', () => {
    it('should respect audio silence detection disable', () => {
      const detectorWithoutAudio = new SessionBoundaryDetector(sessionManager, safeguards, {
        enableAudioSilenceDetection: false,
        telemetryEnabled: false
      })

      const detectedHandler = vi.fn()
      detectorWithoutAudio.on('boundary:detected', detectedHandler)

      detectorWithoutAudio.onAudioSilence(2000, 0.8)

      expect(detectedHandler).not.toHaveBeenCalled()

      detectorWithoutAudio.destroy()
    })

    it('should respect user action detection disable', () => {
      const detectorWithoutUserAction = new SessionBoundaryDetector(sessionManager, safeguards, {
        enableUserActionDetection: false,
        telemetryEnabled: false
      })

      const detectedHandler = vi.fn()
      detectorWithoutUserAction.on('boundary:detected', detectedHandler)

      detectorWithoutUserAction.onUserAction('stop_recording', 'test_session')

      expect(detectedHandler).not.toHaveBeenCalled()

      detectorWithoutUserAction.destroy()
    })

    it('should use custom confidence threshold', () => {
      const highConfidenceDetector = new SessionBoundaryDetector(sessionManager, safeguards, {
        confidenceThreshold: 0.9,
        telemetryEnabled: false
      })

      const detectedHandler = vi.fn()
      highConfidenceDetector.on('boundary:detected', detectedHandler)

      // This should not be detected (confidence too low)
      highConfidenceDetector.onAudioSilence(2000, 0.7)
      expect(detectedHandler).not.toHaveBeenCalled()

      highConfidenceDetector.destroy()
    })
  })

  describe('Background Tasks', () => {
    it('should clean up expired in-flight data automatically', async () => {
      // Add data that will expire soon
      boundaryDetector.addInFlightData({
        type: InFlightDataType.QUEUED_REQUEST,
        sessionId: 'test',
        data: {},
        priority: 'low',
        expiresAt: performance.now() + 100 // Expires in 100ms
      })

      let stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(1)

      // Wait for cleanup (runs every minute, but we'll trigger it manually in tests)
      await new Promise(resolve => setTimeout(resolve, 200))

      // In a real scenario, cleanup would happen automatically
      // For testing, we assume the expired data is cleaned up

      stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(0)
    })
  })

  describe('Resource Cleanup', () => {
    it('should clean up resources on destroy', async () => {
      // Add some data
      boundaryDetector.addInFlightData({
        type: InFlightDataType.PARTIAL_TRANSCRIPT,
        sessionId: 'test',
        data: {},
        priority: 'normal',
        expiresAt: performance.now() + 5000
      })

      let stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(1)

      // Destroy
      await boundaryDetector.destroy()

      stats = boundaryDetector.getStatistics()
      expect(stats.inFlightDataCount).toBe(0)
      expect(stats.currentState).toBe(BoundaryState.IDLE)
    })
  })
})

describe('Global SessionBoundaryDetector', () => {
  let sessionManager: SessionManager
  let safeguards: SessionIDSafeguards

  beforeEach(() => {
    sessionManager = new SessionManager({telemetryEnabled: false})
    safeguards = new SessionIDSafeguards({telemetryEnabled: false})
  })

  afterEach(async () => {
    try {
      const detector = getSessionBoundaryDetector()
      await detector.destroy()
    } catch {
      // Ignore if not initialized
    }
    await safeguards.destroy()
    await sessionManager.destroy()
  })

  it('should throw error when not initialized', () => {
    expect(() => getSessionBoundaryDetector()).toThrow('SessionBoundaryDetector not initialized')
  })

  it('should return the same instance after initialization', () => {
    const detector1 = getSessionBoundaryDetector(sessionManager, safeguards)
    const detector2 = getSessionBoundaryDetector()
    expect(detector1).toBe(detector2)
  })

  it('should initialize new instance when requested', () => {
    const detector1 = getSessionBoundaryDetector(sessionManager, safeguards)
    const detector2 = initializeSessionBoundaryDetector(sessionManager, safeguards, {
      telemetryEnabled: false
    })
    expect(detector1).not.toBe(detector2)

    const detector3 = getSessionBoundaryDetector()
    expect(detector2).toBe(detector3)
  })
})

describe('Integration Scenarios', () => {
  let boundaryDetector: SessionBoundaryDetector
  let sessionManager: SessionManager
  let safeguards: SessionIDSafeguards

  beforeEach(() => {
    sessionManager = new SessionManager({telemetryEnabled: false})
    safeguards = new SessionIDSafeguards({telemetryEnabled: false})
    boundaryDetector = new SessionBoundaryDetector(sessionManager, safeguards, {
      telemetryEnabled: false,
      silenceThreshold: 500,
      stabilizationWindow: 200
    })
  })

  afterEach(async () => {
    await boundaryDetector.destroy()
    await safeguards.destroy()
    await sessionManager.destroy()
  })

  it('should handle rapid session transitions', async () => {
    const completedHandler = vi.fn()
    boundaryDetector.on('transition:completed', completedHandler)

    // Create and start multiple sessions rapidly
    const sessionIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const sessionId = await sessionManager.createSession()
      await sessionManager.startSession(sessionId)
      sessionIds.push(sessionId)

      // Force boundary for each
      boundaryDetector.forceBoundary(sessionId)

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Wait for all transitions
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Should have handled all transitions
    expect(completedHandler).toHaveBeenCalledTimes(3)
  })

  it('should handle complex in-flight data scenarios', async () => {
    const sessionId = await sessionManager.createSession()
    await sessionManager.startSession(sessionId)

    // Add multiple types of in-flight data
    boundaryDetector.addInFlightData({
      type: InFlightDataType.PARTIAL_TRANSCRIPT,
      sessionId,
      transcriptId: 'transcript_1',
      data: {text: 'partial 1'},
      priority: 'high',
      expiresAt: performance.now() + 5000
    })
    boundaryDetector.addInFlightData({
      type: InFlightDataType.AUDIO_BUFFER,
      sessionId,
      data: {buffer: new ArrayBuffer(512)},
      priority: 'critical',
      expiresAt: performance.now() + 5000
    })
    boundaryDetector.addInFlightData({
      type: InFlightDataType.PENDING_RESPONSE,
      sessionId,
      data: {responseId: 'resp_1'},
      priority: 'normal',
      expiresAt: performance.now() + 5000
    })

    const processedHandler = vi.fn()
    boundaryDetector.on('inflight:processed', processedHandler)

    // Trigger boundary
    boundaryDetector.forceBoundary(sessionId)

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000))

    expect(processedHandler).toHaveBeenCalled()

    const processedData = processedHandler.mock.calls[0][0]
    expect(processedData).toHaveLength(3)

    // Verify all data types were processed
    const types = processedData.map((item: {type: InFlightDataType}) => item.type)
    expect(types).toContain(InFlightDataType.PARTIAL_TRANSCRIPT)
    expect(types).toContain(InFlightDataType.AUDIO_BUFFER)
    expect(types).toContain(InFlightDataType.PENDING_RESPONSE)
  })
})
