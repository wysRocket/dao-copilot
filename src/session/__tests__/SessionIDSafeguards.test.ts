/**
 * SessionIDSafeguards Test Suite
 *
 * Comprehensive tests for ID validation, collision detection, orphan handling,
 * and cleanup mechanisms.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  SessionIDSafeguards,
  IDValidationResult,
  IDStatus,
  getSessionIDSafeguards,
  initializeSessionIDSafeguards
} from '../SessionIDSafeguards'

// Mock dependencies
vi.mock('../../services/gemini-logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

describe('SessionIDSafeguards', () => {
  let safeguards: SessionIDSafeguards

  beforeEach(() => {
    vi.clearAllMocks()
    safeguards = new SessionIDSafeguards({
      idExpirationTime: 30000, // 30 seconds for testing
      maxIdUsageCount: 10, // Low limit for testing
      orphanDetectionInterval: 1000, // 1 second
      cleanupOrphanedPartials: true,
      maxOrphanAge: 5000, // 5 seconds
      telemetryEnabled: true
    })
  })

  afterEach(async () => {
    await safeguards.destroy()
  })

  describe('ID Validation and Registration', () => {
    it('should validate and register a valid session ID', () => {
      const sessionId = 'session_12345_abcdef'
      const result = safeguards.validateAndRegisterID(sessionId, 'session')

      expect(result).toBe(IDValidationResult.VALID)
      expect(safeguards.isValidID(sessionId)).toBe(true)

      const metadata = safeguards.getIDMetadata(sessionId)
      expect(metadata).toBeTruthy()
      expect(metadata?.id).toBe(sessionId)
      expect(metadata?.type).toBe('session')
      expect(metadata?.status).toBe(IDStatus.ACTIVE)
    })

    it('should validate and register a valid transcript ID', () => {
      const sessionId = 'session_12345_abcdef'
      const transcriptId = 'transcript_67890_fedcba'

      // Register session first
      safeguards.validateAndRegisterID(sessionId, 'session')

      // Register transcript
      const result = safeguards.validateAndRegisterID(transcriptId, 'transcript', sessionId)

      expect(result).toBe(IDValidationResult.VALID)
      expect(safeguards.isValidID(transcriptId)).toBe(true)

      const metadata = safeguards.getIDMetadata(transcriptId)
      expect(metadata?.sessionId).toBe(sessionId)
    })

    it('should reject invalid ID formats', () => {
      const invalidIds = [
        '', // Empty
        'abc', // Too short
        'invalid@id', // Invalid characters
        'noprefix_12345', // No valid prefix
        '12345' // No prefix at all
      ]

      for (const invalidId of invalidIds) {
        const result = safeguards.validateAndRegisterID(invalidId, 'session')
        expect(result).toBe(IDValidationResult.INVALID_FORMAT)
        expect(safeguards.isValidID(invalidId)).toBe(false)
      }
    })

    it('should detect ID collisions', () => {
      const sessionId = 'session_12345_abcdef'
      const collisionHandler = vi.fn()

      safeguards.on('id:collision', collisionHandler)

      // First registration should succeed
      let result = safeguards.validateAndRegisterID(sessionId, 'session')
      expect(result).toBe(IDValidationResult.VALID)

      // Second registration should detect collision
      result = safeguards.validateAndRegisterID(sessionId, 'session')
      expect(result).toBe(IDValidationResult.COLLISION)
      expect(collisionHandler).toHaveBeenCalled()
    })

    it('should detect ID reuse after completion', () => {
      const sessionId = 'session_12345_abcdef'
      const reuseHandler = vi.fn()

      safeguards.on('id:reuse', reuseHandler)

      // Register and complete ID
      safeguards.validateAndRegisterID(sessionId, 'session')
      safeguards.markIDCompleted(sessionId)

      // Attempt to reuse should be detected
      const result = safeguards.validateAndRegisterID(sessionId, 'session')
      expect(result).toBe(IDValidationResult.REUSED)
      expect(reuseHandler).toHaveBeenCalled()
    })

    it('should detect session mismatches', () => {
      const sessionId1 = 'session_12345_abcdef'
      const sessionId2 = 'session_67890_fedcba'
      const transcriptId = 'transcript_11111_22222'
      const mismatchHandler = vi.fn()

      safeguards.on('id:mismatch', mismatchHandler)

      // Register transcript with first session
      safeguards.validateAndRegisterID(sessionId1, 'session')
      safeguards.validateAndRegisterID(transcriptId, 'transcript', sessionId1)

      // Attempt to register same transcript with different session
      const result = safeguards.validateAndRegisterID(transcriptId, 'transcript', sessionId2)
      expect(result).toBe(IDValidationResult.MISMATCH)
      expect(mismatchHandler).toHaveBeenCalledWith(transcriptId, sessionId1, sessionId2)
    })
  })

  describe('ID Usage Tracking', () => {
    let sessionId: string

    beforeEach(() => {
      sessionId = 'session_12345_abcdef'
      safeguards.validateAndRegisterID(sessionId, 'session')
    })

    it('should track ID usage count', () => {
      const initialMetadata = safeguards.getIDMetadata(sessionId)!
      expect(initialMetadata.usageCount).toBe(1)

      // Update usage several times
      for (let i = 0; i < 5; i++) {
        expect(safeguards.updateIDUsage(sessionId)).toBe(true)
      }

      const updatedMetadata = safeguards.getIDMetadata(sessionId)!
      expect(updatedMetadata.usageCount).toBe(6)
      expect(updatedMetadata.lastUsedAt).toBeGreaterThan(initialMetadata.lastUsedAt)
    })

    it('should reject usage beyond limits', () => {
      // Exhaust usage limit
      for (let i = 1; i < 10; i++) {
        expect(safeguards.updateIDUsage(sessionId)).toBe(true)
      }

      // Next usage should fail
      expect(safeguards.updateIDUsage(sessionId)).toBe(false)

      const metadata = safeguards.getIDMetadata(sessionId)!
      expect(metadata.status).toBe(IDStatus.INVALID)
    })

    it('should mark IDs as completed', () => {
      expect(safeguards.markIDCompleted(sessionId)).toBe(true)

      const metadata = safeguards.getIDMetadata(sessionId)!
      expect(metadata.status).toBe(IDStatus.COMPLETED)
    })

    it('should handle operations on non-existent IDs', () => {
      const nonExistentId = 'session_nonexistent_id'

      expect(safeguards.updateIDUsage(nonExistentId)).toBe(false)
      expect(safeguards.markIDCompleted(nonExistentId)).toBe(false)
      expect(safeguards.isValidID(nonExistentId)).toBe(false)
      expect(safeguards.getIDMetadata(nonExistentId)).toBeUndefined()
    })
  })

  describe('Orphan Detection and Cleanup', () => {
    let sessionId: string
    let transcriptIds: string[]

    beforeEach(() => {
      sessionId = 'session_12345_abcdef'
      transcriptIds = ['transcript_11111_aaaaa', 'transcript_22222_bbbbb', 'transcript_33333_ccccc']

      safeguards.validateAndRegisterID(sessionId, 'session')

      for (const transcriptId of transcriptIds) {
        safeguards.validateAndRegisterID(transcriptId, 'transcript', sessionId)
      }
    })

    it('should detect orphaned partials when session is missing', async () => {
      const orphanHandler = vi.fn()
      safeguards.on('orphan:detected', orphanHandler)

      // Remove session from registry (simulate session loss)
      const sessionMetadata = safeguards.getIDMetadata(sessionId)!
      ;(safeguards as any).idRegistry.delete(sessionId)

      const orphans = safeguards.detectOrphanedPartials()

      expect(orphans.length).toBe(3)
      expect(orphans.every(o => o.reason === 'session_mismatch')).toBe(true)
      expect(orphanHandler).toHaveBeenCalledWith(orphans)
    })

    it('should detect orphaned partials when session expires', async () => {
      // Fast-forward time to expire session
      const sessionMetadata = safeguards.getIDMetadata(sessionId)!
      sessionMetadata.expiresAt = performance.now() - 1000 // Expired 1 second ago

      const orphans = safeguards.detectOrphanedPartials()

      expect(orphans.length).toBe(3)
      expect(orphans.every(o => o.reason === 'session_expired')).toBe(true)
    })

    it('should detect orphaned partials due to ID reuse', () => {
      // Exhaust usage limit for one transcript
      const transcriptId = transcriptIds[0]
      for (let i = 1; i < 10; i++) {
        safeguards.updateIDUsage(transcriptId)
      }
      safeguards.updateIDUsage(transcriptId) // This should make it invalid

      const orphans = safeguards.detectOrphanedPartials()

      expect(orphans.length).toBe(1)
      expect(orphans[0].transcriptId).toBe(transcriptId)
      expect(orphans[0].reason).toBe('id_reuse')
    })

    it('should clean up old orphaned partials', async () => {
      const cleanedHandler = vi.fn()
      safeguards.on('orphan:cleaned', cleanedHandler)

      // Create orphans
      ;(safeguards as any).idRegistry.delete(sessionId) // Simulate session loss
      safeguards.detectOrphanedPartials()

      // Fast-forward time to age orphans
      const orphanedPartials = safeguards.getOrphanedPartials()
      for (const orphan of orphanedPartials) {
        orphan.timestamp = performance.now() - 6000 // 6 seconds ago
      }

      const cleanedCount = safeguards.cleanupOrphanedPartials()

      expect(cleanedCount).toBe(3)
      expect(cleanedHandler).toHaveBeenCalledWith(3)
      expect(safeguards.getOrphanedPartials()).toHaveLength(0)
    })

    it('should not clean up recent orphaned partials', () => {
      // Create orphans
      ;(safeguards as any).idRegistry.delete(sessionId)
      safeguards.detectOrphanedPartials()

      // Orphans are recent, should not be cleaned
      const cleanedCount = safeguards.cleanupOrphanedPartials()

      expect(cleanedCount).toBe(0)
      expect(safeguards.getOrphanedPartials()).toHaveLength(3)
    })
  })

  describe('Parent-Child Relationships', () => {
    it('should track parent-child relationships', () => {
      const sessionId = 'session_12345_abcdef'
      const transcriptId = 'transcript_67890_fedcba'
      const utteranceId = 'utterance_11111_22222'

      safeguards.validateAndRegisterID(sessionId, 'session')
      safeguards.validateAndRegisterID(transcriptId, 'transcript', sessionId)
      safeguards.validateAndRegisterID(utteranceId, 'utterance', sessionId, transcriptId)

      const transcriptMetadata = safeguards.getIDMetadata(transcriptId)!
      expect(transcriptMetadata.childIds.has(utteranceId)).toBe(true)

      const utteranceMetadata = safeguards.getIDMetadata(utteranceId)!
      expect(utteranceMetadata.parentId).toBe(transcriptId)
    })
  })

  describe('Statistics and Monitoring', () => {
    beforeEach(() => {
      // Create test data
      const sessionIds = ['session_1_a', 'session_2_b', 'session_3_c']
      const transcriptIds = ['transcript_1_x', 'transcript_2_y']

      for (const sessionId of sessionIds) {
        safeguards.validateAndRegisterID(sessionId, 'session')
      }

      for (const transcriptId of transcriptIds) {
        safeguards.validateAndRegisterID(transcriptId, 'transcript', sessionIds[0])
      }

      // Complete one session
      safeguards.markIDCompleted(sessionIds[0])

      // Expire one session
      const expiredSession = safeguards.getIDMetadata(sessionIds[1])!
      expiredSession.expiresAt = performance.now() - 1000
    })

    it('should provide accurate statistics', () => {
      const stats = safeguards.getStatistics()

      expect(stats.totalIds).toBe(5) // 3 sessions + 2 transcripts
      expect(stats.completedIds).toBe(1) // One completed session
      expect(stats.activeIds).toBe(3) // 2 active sessions + 1 active transcript (transcript associated with completed session still active)
      expect(stats.expiredIds).toBe(1) // One expired session
    })

    it('should track orphaned partials in statistics', () => {
      // Create orphans by removing a session
      const sessionId = 'session_1_a'
      ;(safeguards as any).idRegistry.delete(sessionId)
      safeguards.detectOrphanedPartials()

      const stats = safeguards.getStatistics()
      expect(stats.orphanedIds).toBe(2) // 2 transcript orphans
    })
  })

  describe('Event Handling', () => {
    it('should emit validation events', () => {
      const validatedHandler = vi.fn()
      const failedHandler = vi.fn()

      safeguards.on('id:validated', validatedHandler)
      safeguards.on('validation:failed', failedHandler)

      // Valid ID
      const validId = 'session_12345_abcdef'
      safeguards.validateAndRegisterID(validId, 'session')
      expect(validatedHandler).toHaveBeenCalledWith(validId, IDValidationResult.VALID)

      // Invalid ID
      const invalidId = 'invalid'
      safeguards.validateAndRegisterID(invalidId, 'session')
      expect(failedHandler).toHaveBeenCalledWith(invalidId, expect.any(String))
    })

    it('should emit expiry events', () => {
      const expiredHandler = vi.fn()
      safeguards.on('id:expired', expiredHandler)

      const sessionId = 'session_12345_abcdef'
      safeguards.validateAndRegisterID(sessionId, 'session')

      // Expire the ID
      const metadata = safeguards.getIDMetadata(sessionId)!
      metadata.expiresAt = performance.now() - 1000

      // Attempt to register again should detect expiry
      safeguards.validateAndRegisterID(sessionId, 'session')
      expect(expiredHandler).toHaveBeenCalled()
    })
  })

  describe('Checksum Validation', () => {
    it('should generate unique checksums for different IDs', () => {
      const sessionId1 = 'session_12345_abcdef'
      const sessionId2 = 'session_67890_fedcba'

      safeguards.validateAndRegisterID(sessionId1, 'session')
      safeguards.validateAndRegisterID(sessionId2, 'session')

      const metadata1 = safeguards.getIDMetadata(sessionId1)!
      const metadata2 = safeguards.getIDMetadata(sessionId2)!

      expect(metadata1.checksum).toBeTruthy()
      expect(metadata2.checksum).toBeTruthy()
      expect(metadata1.checksum).not.toBe(metadata2.checksum)
    })
  })

  describe('Source Detection', () => {
    it('should detect online IDs', () => {
      const onlineId = 'session_12345_a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      safeguards.validateAndRegisterID(onlineId, 'session')

      const metadata = safeguards.getIDMetadata(onlineId)!
      expect(metadata.source).toBe('online')
    })

    it('should detect offline IDs', () => {
      const offlineId = 'session_12345_randomstring'
      safeguards.validateAndRegisterID(offlineId, 'session')

      const metadata = safeguards.getIDMetadata(offlineId)!
      expect(metadata.source).toBe('offline')
    })

    it('should detect recovered IDs', () => {
      const recoveredId = 'session_recovered_12345_abcdef'
      safeguards.validateAndRegisterID(recoveredId, 'session')

      const metadata = safeguards.getIDMetadata(recoveredId)!
      expect(metadata.source).toBe('recovered')
    })
  })
})

describe('Global SessionIDSafeguards', () => {
  afterEach(async () => {
    const safeguards = getSessionIDSafeguards()
    await safeguards.destroy()
  })

  it('should return the same instance', () => {
    const safeguards1 = getSessionIDSafeguards()
    const safeguards2 = getSessionIDSafeguards()
    expect(safeguards1).toBe(safeguards2)
  })

  it('should initialize new instance when requested', () => {
    const safeguards1 = getSessionIDSafeguards()
    const safeguards2 = initializeSessionIDSafeguards({telemetryEnabled: false})
    expect(safeguards1).not.toBe(safeguards2)

    const safeguards3 = getSessionIDSafeguards()
    expect(safeguards2).toBe(safeguards3)
  })

  it('should validate IDs using global instance', () => {
    const safeguards = getSessionIDSafeguards()
    const sessionId = 'session_global_test'
    const result = safeguards.validateAndRegisterID(sessionId, 'session')
    expect(result).toBe(IDValidationResult.VALID)
  })
})

describe('Concurrent Operations', () => {
  let safeguards: SessionIDSafeguards

  beforeEach(() => {
    safeguards = new SessionIDSafeguards({
      telemetryEnabled: false,
      maxIdUsageCount: 1000
    })
  })

  afterEach(async () => {
    await safeguards.destroy()
  })

  it('should handle concurrent ID validation', async () => {
    const sessionIds = Array.from({length: 100}, (_, i) => `session_${i}_test`)

    const promises = sessionIds.map(id =>
      Promise.resolve(safeguards.validateAndRegisterID(id, 'session'))
    )

    const results = await Promise.all(promises)
    expect(results.every(result => result === IDValidationResult.VALID)).toBe(true)

    const stats = safeguards.getStatistics()
    expect(stats.totalIds).toBe(100)
    expect(stats.activeIds).toBe(100)
  })

  it('should handle concurrent usage updates', async () => {
    const sessionId = 'session_concurrent_usage'
    safeguards.validateAndRegisterID(sessionId, 'session')

    const promises = Array.from({length: 50}, () =>
      Promise.resolve(safeguards.updateIDUsage(sessionId))
    )

    const results = await Promise.all(promises)
    expect(results.every(result => result === true)).toBe(true)

    const metadata = safeguards.getIDMetadata(sessionId)!
    expect(metadata.usageCount).toBe(51) // Initial + 50 updates
  })
})

describe('Edge Cases and Error Conditions', () => {
  let safeguards: SessionIDSafeguards

  beforeEach(() => {
    safeguards = new SessionIDSafeguards({
      telemetryEnabled: false,
      idExpirationTime: 100 // Very short expiration for testing
    })
  })

  afterEach(async () => {
    await safeguards.destroy()
  })

  it('should handle rapid expiration', async () => {
    const sessionId = 'session_rapid_expire'

    // Register ID
    let result = safeguards.validateAndRegisterID(sessionId, 'session')
    expect(result).toBe(IDValidationResult.VALID)

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150))

    // Should detect as expired
    result = safeguards.validateAndRegisterID(sessionId, 'session')
    expect(result).toBe(IDValidationResult.EXPIRED)
  })

  it('should handle malformed input gracefully', () => {
    const malformedInputs = [null, undefined, 123, {}, [], () => {}]

    for (const input of malformedInputs) {
      expect(() => {
        safeguards.validateAndRegisterID(input as any, 'session')
      }).not.toThrow() // Should handle gracefully, not crash
    }
  })

  it('should handle cleanup after destruction', async () => {
    const sessionId = 'session_destruction_test'
    safeguards.validateAndRegisterID(sessionId, 'session')

    await safeguards.destroy()

    // Operations after destruction should not cause errors
    expect(safeguards.getStatistics().totalIds).toBe(0)
    expect(safeguards.getOrphanedPartials()).toEqual([])
  })
})
