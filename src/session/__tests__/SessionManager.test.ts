/**
 * SessionManager Test Suite
 *
 * Comprehensive tests for session lifecycle management, ID generation,
 * concurrent sessions, and error scenarios.
 */

import {describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll} from 'vitest'
import {
  SessionManager,
  SessionState,
  SessionBoundary,
  getSessionManager,
  initializeSessionManager
} from '../SessionManager'

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

describe('SessionManager', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    sessionManager = new SessionManager({
      sessionTimeout: 30000, // 30 seconds for testing
      boundaryDetectionWindow: 1000,
      idCollisionRetries: 3,
      telemetryEnabled: true,
      checkpointInterval: 5000,
      maxConcurrentSessions: 3
    })
  })

  afterEach(async () => {
    await sessionManager.destroy()
  })

  describe('Session Creation', () => {
    it('should create a new session with unique ID', async () => {
      const sessionId = await sessionManager.createSession()

      expect(sessionId).toBeTruthy()
      expect(typeof sessionId).toBe('string')

      const session = sessionManager.getSession(sessionId)
      expect(session).toBeTruthy()
      expect(session?.state).toBe(SessionState.INACTIVE)
      expect(session?.sessionId).toBe(sessionId)
    })

    it('should create multiple unique sessions', async () => {
      const sessionId1 = await sessionManager.createSession()
      const sessionId2 = await sessionManager.createSession()
      const sessionId3 = await sessionManager.createSession()

      expect(sessionId1).not.toBe(sessionId2)
      expect(sessionId2).not.toBe(sessionId3)
      expect(sessionId1).not.toBe(sessionId3)

      expect(sessionManager.getAllSessions().size).toBe(3)
    })

    it('should enforce concurrent session limits', async () => {
      // Create and start maximum sessions
      const sessions: string[] = []
      for (let i = 0; i < 3; i++) {
        const sessionId = await sessionManager.createSession()
        await sessionManager.startSession(sessionId)
        sessions.push(sessionId)
      }

      // Attempt to create one more session should succeed (creation doesn't count as active)
      const extraSessionId = await sessionManager.createSession()
      expect(extraSessionId).toBeTruthy()

      // But starting it should fail due to active limit
      await expect(sessionManager.startSession(extraSessionId)).rejects.toThrow(
        'Maximum concurrent sessions limit reached'
      )
    })

    it('should emit session creation events', async () => {
      const createdHandler = vi.fn()
      sessionManager.on('session:created', createdHandler)

      const sessionId = await sessionManager.createSession()

      expect(createdHandler).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          sessionId,
          state: SessionState.INACTIVE
        })
      )
    })
  })

  describe('Session Lifecycle', () => {
    let sessionId: string

    beforeEach(async () => {
      sessionId = await sessionManager.createSession()
    })

    it('should start an inactive session', async () => {
      const startedHandler = vi.fn()
      const boundaryHandler = vi.fn()

      sessionManager.on('session:started', startedHandler)
      sessionManager.on('session:boundary', boundaryHandler)

      await sessionManager.startSession(sessionId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.state).toBe(SessionState.ACTIVE)
      expect(session?.startedAt).toBeTruthy()

      expect(startedHandler).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          state: SessionState.ACTIVE
        })
      )

      expect(boundaryHandler).toHaveBeenCalledWith(
        sessionId,
        SessionBoundary.SESSION_START,
        expect.any(Object)
      )
    })

    it('should pause an active session', async () => {
      await sessionManager.startSession(sessionId)

      const pausedHandler = vi.fn()
      sessionManager.on('session:paused', pausedHandler)

      await sessionManager.pauseSession(sessionId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.state).toBe(SessionState.PAUSED)
      expect(session?.pausedAt).toBeTruthy()

      expect(pausedHandler).toHaveBeenCalled()
    })

    it('should resume a paused session', async () => {
      await sessionManager.startSession(sessionId)
      await sessionManager.pauseSession(sessionId)

      const resumedHandler = vi.fn()
      sessionManager.on('session:resumed', resumedHandler)

      await sessionManager.resumeSession(sessionId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.state).toBe(SessionState.ACTIVE)
      expect(session?.resumedAt).toBeTruthy()

      expect(resumedHandler).toHaveBeenCalled()
    })

    it('should stop an active session', async () => {
      await sessionManager.startSession(sessionId)

      const stoppedHandler = vi.fn()
      sessionManager.on('session:stopped', stoppedHandler)

      await sessionManager.stopSession(sessionId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.state).toBe(SessionState.STOPPED)
      expect(session?.endedAt).toBeTruthy()

      expect(stoppedHandler).toHaveBeenCalled()
    })

    it('should handle invalid state transitions', async () => {
      // Try to pause inactive session
      await expect(sessionManager.pauseSession(sessionId)).rejects.toThrow(
        'Cannot pause session in state: inactive'
      )

      // Try to resume inactive session
      await expect(sessionManager.resumeSession(sessionId)).rejects.toThrow(
        'Cannot resume session in state: inactive'
      )

      // Start session
      await sessionManager.startSession(sessionId)

      // Try to start already active session
      await expect(sessionManager.startSession(sessionId)).rejects.toThrow(
        'Cannot start session in state: active'
      )
    })
  })

  describe('Transcript Management', () => {
    let sessionId: string

    beforeEach(async () => {
      sessionId = await sessionManager.createSession()
      await sessionManager.startSession(sessionId)
    })

    it('should add transcripts to session', () => {
      const transcriptId = 'transcript_123'
      const addedHandler = vi.fn()

      sessionManager.on('session:transcript_added', addedHandler)
      sessionManager.addTranscriptToSession(sessionId, transcriptId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.transcriptIds.has(transcriptId)).toBe(true)
      expect(session?.telemetry.totalTranscripts).toBe(1)
      expect(session?.telemetry.activeTranscripts).toBe(1)

      expect(addedHandler).toHaveBeenCalledWith(sessionId, transcriptId)
    })

    it('should complete transcripts in session', () => {
      const transcriptId = 'transcript_123'
      const completedHandler = vi.fn()

      sessionManager.on('session:transcript_completed', completedHandler)
      sessionManager.addTranscriptToSession(sessionId, transcriptId)
      sessionManager.completeTranscriptInSession(sessionId, transcriptId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.telemetry.completedTranscripts).toBe(1)
      expect(session?.telemetry.activeTranscripts).toBe(0)

      expect(completedHandler).toHaveBeenCalledWith(sessionId, transcriptId)
    })

    it('should handle orphaned transcripts on session stop', async () => {
      const transcriptId1 = 'transcript_1'
      const transcriptId2 = 'transcript_2'
      const orphanedHandler = vi.fn()

      sessionManager.on('session:transcript_orphaned', orphanedHandler)

      sessionManager.addTranscriptToSession(sessionId, transcriptId1)
      sessionManager.addTranscriptToSession(sessionId, transcriptId2)

      await sessionManager.stopSession(sessionId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.telemetry.orphanedTranscripts).toBe(2)

      expect(orphanedHandler).toHaveBeenCalledTimes(2)
      expect(orphanedHandler).toHaveBeenCalledWith(sessionId, transcriptId1)
      expect(orphanedHandler).toHaveBeenCalledWith(sessionId, transcriptId2)
    })

    it('should not add duplicate transcripts', () => {
      const transcriptId = 'transcript_123'

      sessionManager.addTranscriptToSession(sessionId, transcriptId)
      sessionManager.addTranscriptToSession(sessionId, transcriptId) // Duplicate

      const session = sessionManager.getSession(sessionId)
      expect(session?.telemetry.totalTranscripts).toBe(1)
      expect(session?.telemetry.activeTranscripts).toBe(1)
    })
  })

  describe('ID Generation', () => {
    it('should generate unique transcript IDs', () => {
      const ids = new Set()
      const count = 1000

      for (let i = 0; i < count; i++) {
        const id = sessionManager.generateId('transcript')
        expect(ids.has(id)).toBe(false)
        ids.add(id)
      }

      expect(ids.size).toBe(count)
    })

    it('should generate IDs with specified prefix', () => {
      const id1 = sessionManager.generateId('test')
      const id2 = sessionManager.generateId('example')

      expect(id1.startsWith('test_')).toBe(true)
      expect(id2.startsWith('example_')).toBe(true)
    })

    it('should generate IDs without prefix', () => {
      const id = sessionManager.generateId()
      expect(id.startsWith('transcript_')).toBe(true)
    })

    it('should handle ID collision during session creation', async () => {
      const collisionHandler = vi.fn()
      sessionManager.on('id:collision_detected', collisionHandler)

      // Mock generateId to return same ID twice, then unique
      const originalGenerateId = sessionManager.generateId
      let callCount = 0

      vi.spyOn(sessionManager, 'generateId').mockImplementation(prefix => {
        callCount++
        if (callCount <= 2) {
          return 'session_duplicate_id'
        }
        return originalGenerateId.call(sessionManager, prefix)
      })

      const sessionId1 = await sessionManager.createSession()
      const sessionId2 = await sessionManager.createSession()

      expect(sessionId1).toBe('session_duplicate_id')
      expect(sessionId2).not.toBe('session_duplicate_id')
      expect(collisionHandler).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle errors during session start', async () => {
      const sessionId = await sessionManager.createSession()
      const errorHandler = vi.fn()

      sessionManager.on('session:error', errorHandler)

      // Mock GeminiSessionManager to throw error
      const geminiSessionManager = (sessionManager as any).geminiSessionManager
      vi.spyOn(geminiSessionManager, 'createSession').mockImplementation(() => {
        throw new Error('Gemini connection failed')
      })

      await expect(sessionManager.startSession(sessionId)).rejects.toThrow(
        'Gemini connection failed'
      )

      const session = sessionManager.getSession(sessionId)
      expect(session?.state).toBe(SessionState.ERROR)
      expect(session?.errorAt).toBeTruthy()

      expect(errorHandler).toHaveBeenCalledWith(sessionId, expect.any(Error), expect.any(Object))
    })

    it('should handle operations on non-existent sessions', async () => {
      const nonExistentId = 'non_existent_session'

      await expect(sessionManager.startSession(nonExistentId)).rejects.toThrow('Session not found')
      await expect(sessionManager.pauseSession(nonExistentId)).rejects.toThrow('Session not found')
      await expect(sessionManager.resumeSession(nonExistentId)).rejects.toThrow('Session not found')
      await expect(sessionManager.stopSession(nonExistentId)).rejects.toThrow('Session not found')

      expect(() => sessionManager.addTranscriptToSession(nonExistentId, 'transcript_123')).toThrow(
        'Session not found'
      )
      expect(() =>
        sessionManager.completeTranscriptInSession(nonExistentId, 'transcript_123')
      ).toThrow('Session not found')
    })
  })

  describe('Session Queries', () => {
    let sessions: string[]

    beforeEach(async () => {
      sessions = []
      for (let i = 0; i < 3; i++) {
        const sessionId = await sessionManager.createSession()
        sessions.push(sessionId)
      }

      // Start some sessions
      await sessionManager.startSession(sessions[0])
      await sessionManager.startSession(sessions[1])
    })

    it('should get specific session', () => {
      const session = sessionManager.getSession(sessions[0])
      expect(session).toBeTruthy()
      expect(session?.sessionId).toBe(sessions[0])
      expect(session?.state).toBe(SessionState.ACTIVE)
    })

    it('should get all sessions', () => {
      const allSessions = sessionManager.getAllSessions()
      expect(allSessions.size).toBe(3)
      expect(allSessions.has(sessions[0])).toBe(true)
      expect(allSessions.has(sessions[1])).toBe(true)
      expect(allSessions.has(sessions[2])).toBe(true)
    })

    it('should get active sessions only', () => {
      const activeSessions = sessionManager.getActiveSessions()
      expect(activeSessions).toHaveLength(2)
      expect(activeSessions.some(s => s.sessionId === sessions[0])).toBe(true)
      expect(activeSessions.some(s => s.sessionId === sessions[1])).toBe(true)
      expect(activeSessions.some(s => s.sessionId === sessions[2])).toBe(false)
    })

    it('should return undefined for non-existent session', () => {
      const session = sessionManager.getSession('non_existent')
      expect(session).toBeUndefined()
    })
  })

  describe('Checkpointing', () => {
    let sessionId: string

    beforeEach(async () => {
      sessionId = await sessionManager.createSession()
      await sessionManager.startSession(sessionId)
    })

    it('should create checkpoints during session lifecycle', async () => {
      await sessionManager.pauseSession(sessionId)
      await sessionManager.resumeSession(sessionId)

      const session = sessionManager.getSession(sessionId)
      expect(session?.checkpoints.length).toBeGreaterThan(0)

      const checkpoints = session?.checkpoints || []
      expect(checkpoints.some(cp => cp.boundaryMarker === 'Session started')).toBe(true)
      expect(checkpoints.some(cp => cp.boundaryMarker === 'Session pausing')).toBe(true)
      expect(checkpoints.some(cp => cp.boundaryMarker === 'Session resumed')).toBe(true)
    })

    it('should limit checkpoint history', async () => {
      // Create many checkpoints
      for (let i = 0; i < 15; i++) {
        await (sessionManager as any).createCheckpoint(sessionId, `Checkpoint ${i}`)
      }

      const session = sessionManager.getSession(sessionId)
      expect(session?.checkpoints.length).toBeLessThanOrEqual(10) // Max checkpoints
    })
  })

  describe('Cleanup and Destruction', () => {
    it('should cleanup expired sessions', async () => {
      const expiredManager = new SessionManager({
        sessionTimeout: 100, // 100ms for quick expiry
        telemetryEnabled: false
      })

      const sessionId = await expiredManager.createSession()
      await expiredManager.startSession(sessionId)

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150))

      // Trigger cleanup
      await (expiredManager as any).cleanupExpiredSessions()

      const session = expiredManager.getSession(sessionId)
      expect(session?.state).toBe(SessionState.STOPPED)

      await expiredManager.destroy()
    })

    it('should destroy all sessions on cleanup', async () => {
      const sessions: string[] = []
      for (let i = 0; i < 3; i++) {
        const sessionId = await sessionManager.createSession()
        await sessionManager.startSession(sessionId)
        sessions.push(sessionId)
      }

      expect(sessionManager.getAllSessions().size).toBe(3)
      expect(sessionManager.getActiveSessions().length).toBe(3)

      await sessionManager.destroy()

      expect(sessionManager.getAllSessions().size).toBe(0)
      expect(sessionManager.getActiveSessions().length).toBe(0)
    })
  })
})

describe('Global SessionManager', () => {
  afterAll(async () => {
    const manager = getSessionManager()
    await manager.destroy()
  })

  it('should return the same instance', () => {
    const manager1 = getSessionManager()
    const manager2 = getSessionManager()
    expect(manager1).toBe(manager2)
  })

  it('should initialize new instance when requested', () => {
    const manager1 = getSessionManager()
    const manager2 = initializeSessionManager({telemetryEnabled: false})
    expect(manager1).not.toBe(manager2)

    const manager3 = getSessionManager()
    expect(manager2).toBe(manager3)
  })

  it('should create session using global manager', async () => {
    const manager = getSessionManager()
    const sessionId = await manager.createSession()
    expect(sessionId).toBeTruthy()
  })
})

describe('Concurrent Operations', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    sessionManager = new SessionManager({
      maxConcurrentSessions: 5,
      idCollisionRetries: 10,
      telemetryEnabled: false
    })
  })

  afterEach(async () => {
    await sessionManager.destroy()
  })

  it('should handle concurrent session creation', async () => {
    const promises = Array.from({length: 10}, () => sessionManager.createSession())
    const sessionIds = await Promise.all(promises)

    expect(sessionIds).toHaveLength(10)
    expect(new Set(sessionIds).size).toBe(10) // All unique
  })

  it('should handle concurrent ID generation', () => {
    const promises = Array.from({length: 1000}, () => Promise.resolve(sessionManager.generateId()))

    return Promise.all(promises).then(ids => {
      expect(new Set(ids).size).toBe(1000) // All unique
    })
  })

  it('should handle concurrent session operations', async () => {
    const sessionIds = await Promise.all(
      Array.from({length: 3}, () => sessionManager.createSession())
    )

    // Start all sessions concurrently
    await Promise.all(sessionIds.map(id => sessionManager.startSession(id)))

    // Pause and resume concurrently
    await Promise.all(sessionIds.map(id => sessionManager.pauseSession(id)))
    await Promise.all(sessionIds.map(id => sessionManager.resumeSession(id)))

    // Stop all sessions
    await Promise.all(sessionIds.map(id => sessionManager.stopSession(id)))

    const finalStates = sessionIds.map(id => sessionManager.getSession(id)?.state)
    expect(finalStates.every(state => state === SessionState.STOPPED)).toBe(true)
  })
})

describe('Edge Cases and Boundary Conditions', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    sessionManager = new SessionManager({telemetryEnabled: false})
  })

  afterEach(async () => {
    await sessionManager.destroy()
  })

  it('should handle rapid session creation and destruction', async () => {
    const iterations = 50
    const sessionIds: string[] = []

    for (let i = 0; i < iterations; i++) {
      const sessionId = await sessionManager.createSession()
      sessionIds.push(sessionId)

      if (i % 10 === 0) {
        // Occasionally start and stop sessions
        await sessionManager.startSession(sessionId)
        await sessionManager.stopSession(sessionId)
      }
    }

    expect(sessionIds).toHaveLength(iterations)
    expect(new Set(sessionIds).size).toBe(iterations)
  })

  it('should handle session operations after manager destruction', async () => {
    const sessionId = await sessionManager.createSession()
    await sessionManager.startSession(sessionId)

    await sessionManager.destroy()

    // Operations after destruction should fail gracefully
    const session = sessionManager.getSession(sessionId)
    expect(session).toBeUndefined()

    await expect(sessionManager.createSession()).rejects.toThrow()
  })

  it('should handle empty and invalid inputs', () => {
    expect(() => sessionManager.generateId('')).not.toThrow()
    expect(() => sessionManager.addTranscriptToSession('invalid', 'transcript')).toThrow()
    expect(sessionManager.getSession('')).toBeUndefined()
    expect(sessionManager.getActiveSessions()).toEqual([])
  })
})
