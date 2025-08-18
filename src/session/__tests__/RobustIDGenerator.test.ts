/**
 * RobustIDGenerator Test Suite
 *
 * Comprehensive tests for robust ID generation with offline support,
 * collision resistance, synchronization, and various generation methods.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  RobustIDGenerator,
  IDGenerationMethod,
  NetworkState,
  ValidationLevel,
  getRobustIDGenerator,
  initializeRobustIDGenerator
} from '../RobustIDGenerator'

// Mock dependencies
vi.mock('../services/gemini-logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// Mock crypto for consistent testing
vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mocked_hash_value')
  })),
  randomBytes: vi.fn(size => Buffer.alloc(size, 0x42))
}))

describe('RobustIDGenerator', () => {
  let generator: RobustIDGenerator

  beforeEach(async () => {
    vi.clearAllMocks()

    generator = new RobustIDGenerator({
      telemetryEnabled: false,
      networkMonitoringEnabled: false,
      syncEnabled: false,
      preGenerateIds: false
    })

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterEach(async () => {
    await generator.destroy()
  })

  describe('ID Generation Methods', () => {
    it('should generate timestamp-based IDs', async () => {
      const id = await generator.generateID({
        method: IDGenerationMethod.TIMESTAMP_BASED,
        length: 32
      })

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(20) // Minimum expected length
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
    })

    it('should generate UUID v4 IDs', async () => {
      const id = await generator.generateID({
        method: IDGenerationMethod.UUID_V4
      })

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      // UUID v4 without hyphens
      expect(id).toMatch(/^[a-f0-9]{32}$/)
    })

    it('should generate secure random IDs', async () => {
      const id = await generator.generateID({
        method: IDGenerationMethod.SECURE_RANDOM,
        length: 24
      })

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThanOrEqual(20) // Accounting for checksum
    })

    it('should generate hybrid IDs', async () => {
      const id = await generator.generateID({
        method: IDGenerationMethod.HYBRID,
        length: 32
      })

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThanOrEqual(32)
    })

    it('should generate NanoID-style IDs', async () => {
      const id = await generator.generateID({
        method: IDGenerationMethod.NANOID,
        length: 21
      })

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should generate custom IDs', async () => {
      const id = await generator.generateID({
        method: IDGenerationMethod.CUSTOM,
        length: 32,
        metadata: {type: 'test', priority: 'high'}
      })

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThanOrEqual(32)
    })
  })

  describe('ID Uniqueness and Collision Detection', () => {
    it('should generate unique IDs consistently', async () => {
      const ids = new Set<string>()
      const count = 100

      for (let i = 0; i < count; i++) {
        const id = await generator.generateID()
        expect(ids.has(id)).toBe(false) // Should be unique
        ids.add(id)
      }

      expect(ids.size).toBe(count)
    })

    it('should handle collision detection and retry', async () => {
      const collisionGenerator = new RobustIDGenerator({
        collisionDetectionEnabled: true,
        maxCollisionRetries: 3,
        telemetryEnabled: false
      })

      // Pre-fill cache to simulate collision
      const existingId = await collisionGenerator.generateID()
      expect(collisionGenerator.hasID(existingId)).toBe(true)

      // This should generate a different ID even with same parameters
      const newId = await collisionGenerator.generateID({
        method: IDGenerationMethod.TIMESTAMP_BASED
      })

      expect(newId).toBeTruthy()
      expect(newId).not.toBe(existingId)

      await collisionGenerator.destroy()
    })
  })

  describe('Batch Generation', () => {
    it('should generate multiple IDs in batch', async () => {
      const batchGenerator = new RobustIDGenerator({
        batchGeneration: true,
        batchSize: 5,
        telemetryEnabled: false
      })

      const ids = await batchGenerator.generateBatch(10)

      expect(ids).toHaveLength(10)
      expect(new Set(ids).size).toBe(10) // All unique

      for (const id of ids) {
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
      }

      await batchGenerator.destroy()
    })

    it('should generate individual IDs when batch is disabled', async () => {
      const individualGenerator = new RobustIDGenerator({
        batchGeneration: false,
        telemetryEnabled: false
      })

      const ids = await individualGenerator.generateBatch(5)

      expect(ids).toHaveLength(5)
      expect(new Set(ids).size).toBe(5) // All unique

      await individualGenerator.destroy()
    })
  })

  describe('Prefix and Suffix Support', () => {
    it('should apply prefix and suffix', async () => {
      const id = await generator.generateID({
        prefix: 'test_',
        suffix: '_end',
        length: 16
      })

      expect(id.startsWith('test_')).toBe(true)
      expect(id.endsWith('_end') || id.match(/_end_[a-f0-9]{4}$/)).toBeTruthy() // Allow checksum
    })

    it('should use configured default prefix and suffix', async () => {
      const prefixGenerator = new RobustIDGenerator({
        prefix: 'pre_',
        suffix: '_suf',
        telemetryEnabled: false
      })

      const id = await prefixGenerator.generateID()

      expect(id.startsWith('pre_')).toBe(true)
      expect(id.includes('_suf')).toBe(true)

      await prefixGenerator.destroy()
    })
  })

  describe('Validation', () => {
    it('should validate IDs at different levels', async () => {
      const strictGenerator = new RobustIDGenerator({
        validationLevel: ValidationLevel.STRICT,
        checksumEnabled: true,
        telemetryEnabled: false
      })

      const id = await strictGenerator.generateID()

      expect(id).toBeTruthy()
      expect(id.length).toBeGreaterThan(8)

      await strictGenerator.destroy()
    })

    it('should validate with basic level', async () => {
      const basicGenerator = new RobustIDGenerator({
        validationLevel: ValidationLevel.BASIC,
        checksumEnabled: false,
        telemetryEnabled: false
      })

      const id = await basicGenerator.generateID()

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')

      await basicGenerator.destroy()
    })

    it('should validate checksums when enabled', async () => {
      const checksumGenerator = new RobustIDGenerator({
        checksumEnabled: true,
        validationLevel: ValidationLevel.STANDARD,
        telemetryEnabled: false
      })

      const id = await checksumGenerator.generateID()

      // Should have checksum suffix
      expect(id).toMatch(/_[a-f0-9]{4}$/)

      await checksumGenerator.destroy()
    })
  })

  describe('Caching', () => {
    it('should cache generated IDs', async () => {
      const cachingGenerator = new RobustIDGenerator({
        cacheEnabled: true,
        telemetryEnabled: false
      })

      const id = await cachingGenerator.generateID({
        sessionId: 'test_session',
        metadata: {test: true}
      })

      expect(cachingGenerator.hasID(id)).toBe(true)

      const entry = cachingGenerator.getIDEntry(id)
      expect(entry).toBeTruthy()
      expect(entry?.sessionId).toBe('test_session')
      expect(entry?.metadata.test).toBe(true)

      await cachingGenerator.destroy()
    })

    it('should enforce cache size limits', async () => {
      const smallCacheGenerator = new RobustIDGenerator({
        cacheEnabled: true,
        cacheSize: 5,
        telemetryEnabled: false
      })

      // Generate more IDs than cache limit
      const ids: string[] = []
      for (let i = 0; i < 10; i++) {
        const id = await smallCacheGenerator.generateID()
        ids.push(id)
      }

      const stats = smallCacheGenerator.getStatistics()
      expect(stats.cacheSize).toBeLessThanOrEqual(5)

      await smallCacheGenerator.destroy()
    })

    it('should remove IDs from cache', async () => {
      const id = await generator.generateID()

      expect(generator.hasID(id)).toBe(true)
      expect(generator.removeFromCache(id)).toBe(true)
      expect(generator.hasID(id)).toBe(false)
      expect(generator.removeFromCache(id)).toBe(false) // Already removed
    })

    it('should clear entire cache', async () => {
      // Generate some IDs
      for (let i = 0; i < 5; i++) {
        await generator.generateID()
      }

      let stats = generator.getStatistics()
      expect(stats.cacheSize).toBeGreaterThan(0)

      generator.clearCache()

      stats = generator.getStatistics()
      expect(stats.cacheSize).toBe(0)
    })
  })

  describe('Device Fingerprinting', () => {
    it('should generate device fingerprint', () => {
      const fingerprint = generator.getDeviceFingerprint()

      expect(fingerprint).toBeTruthy()
      expect(fingerprint.platform).toBeTruthy()
      expect(fingerprint.arch).toBeTruthy()
      expect(fingerprint.nodeVersion).toBeTruthy()
      expect(fingerprint.hash).toBeTruthy()
      expect(typeof fingerprint.processId).toBe('number')
    })

    it('should include consistent device information', () => {
      const fp1 = generator.getDeviceFingerprint()
      const fp2 = generator.getDeviceFingerprint()

      expect(fp1.hash).toBe(fp2.hash)
      expect(fp1.platform).toBe(fp2.platform)
      expect(fp1.arch).toBe(fp2.arch)
    })
  })

  describe('Network State Management', () => {
    it('should track network state', () => {
      const networkState = generator.getNetworkState()
      expect(Object.values(NetworkState)).toContain(networkState)
    })

    it('should emit network state changes', () => {
      const stateChangeHandler = vi.fn()
      generator.on('network:state:changed', stateChangeHandler)

      // Simulate network state change (this is difficult to test without mocking internals)
      // For now, we'll just verify the event is wired up correctly
      expect(generator.listenerCount('network:state:changed')).toBe(1)
    })
  })

  describe('Statistics and Monitoring', () => {
    it('should track generation statistics', async () => {
      const initialStats = generator.getStatistics()

      await generator.generateID()
      await generator.generateID({method: IDGenerationMethod.UUID_V4})
      await generator.generateID({method: IDGenerationMethod.SECURE_RANDOM})

      const finalStats = generator.getStatistics()

      expect(finalStats.totalGenerated).toBeGreaterThan(initialStats.totalGenerated)
      expect(finalStats.methodUsage[IDGenerationMethod.UUID_V4]).toBeGreaterThan(0)
      expect(finalStats.methodUsage[IDGenerationMethod.SECURE_RANDOM]).toBeGreaterThan(0)
      expect(finalStats.averageGenerationTime).toBeGreaterThan(0)
      expect(finalStats.lastGenerationTime).toBeGreaterThan(0)
    })

    it('should track cache statistics', async () => {
      await generator.generateID()
      await generator.generateID()

      const stats = generator.getStatistics()
      expect(stats.cacheSize).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle destruction gracefully', async () => {
      const id = await generator.generateID()
      expect(id).toBeTruthy()

      await generator.destroy()

      await expect(generator.generateID()).rejects.toThrow('IDGenerator has been destroyed')
    })

    it('should handle invalid generation methods', async () => {
      await expect(
        generator.generateID({
          method: 'invalid_method' as IDGenerationMethod
        })
      ).rejects.toThrow('Unsupported ID generation method')
    })

    it('should emit error events', () => {
      const errorHandler = vi.fn()
      generator.on('error', errorHandler)

      // Verify error event handling is set up
      expect(generator.listenerCount('error')).toBe(1)
    })
  })

  describe('Event Emission', () => {
    it('should emit ID generation events', async () => {
      const generatedHandler = vi.fn()
      const cachedHandler = vi.fn()

      generator.on('id:generated', generatedHandler)
      generator.on('id:cached', cachedHandler)

      const id = await generator.generateID({
        sessionId: 'test_session',
        metadata: {test: true}
      })

      expect(generatedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          sessionId: 'test_session',
          metadata: expect.objectContaining({test: true})
        })
      )

      expect(cachedHandler).toHaveBeenCalled()
    })

    it('should emit initialization events', () => {
      const initHandler = vi.fn()

      const newGenerator = new RobustIDGenerator({
        telemetryEnabled: false
      })

      newGenerator.on('initialized', initHandler)

      // Wait for initialization
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(initHandler).toHaveBeenCalled()
          newGenerator.destroy()
          resolve()
        }, 200)
      })
    })
  })

  describe('Offline Support', () => {
    it('should work in offline mode', async () => {
      const offlineGenerator = new RobustIDGenerator({
        offlineEnabled: true,
        networkMonitoringEnabled: false,
        telemetryEnabled: false
      })

      const id = await offlineGenerator.generateID()

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')

      await offlineGenerator.destroy()
    })

    it('should pre-generate offline ID pool', async () => {
      const poolGenerator = new RobustIDGenerator({
        offlineEnabled: true,
        preGenerateIds: true,
        offlineIdPool: 10,
        telemetryEnabled: false,
        networkMonitoringEnabled: false
      })

      // Wait for pool population
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify the generator is working (indirect test of pool)
      const id = await poolGenerator.generateID()
      expect(id).toBeTruthy()

      await poolGenerator.destroy()
    })
  })

  describe('Configuration Options', () => {
    it('should respect crypto security settings', async () => {
      const secureGenerator = new RobustIDGenerator({
        cryptoSecure: true,
        entropySource: 'crypto',
        telemetryEnabled: false
      })

      const insecureGenerator = new RobustIDGenerator({
        cryptoSecure: false,
        entropySource: 'math',
        telemetryEnabled: false
      })

      const secureId = await secureGenerator.generateID()
      const insecureId = await insecureGenerator.generateID()

      expect(secureId).toBeTruthy()
      expect(insecureId).toBeTruthy()

      await secureGenerator.destroy()
      await insecureGenerator.destroy()
    })

    it('should handle different validation levels', async () => {
      const paranoidGenerator = new RobustIDGenerator({
        validationLevel: ValidationLevel.PARANOID,
        checksumEnabled: true,
        telemetryEnabled: false
      })

      const id = await paranoidGenerator.generateID()
      expect(id).toBeTruthy()

      await paranoidGenerator.destroy()
    })
  })
})

describe('Global IDGenerator Management', () => {
  afterEach(async () => {
    try {
      const generator = getRobustIDGenerator()
      await generator.destroy()
    } catch {
      // Ignore if not initialized
    }
  })

  it('should throw error when not initialized', () => {
    expect(() => getRobustIDGenerator()).toThrow('RobustIDGenerator not initialized')
  })

  it('should return same instance after initialization', () => {
    const generator1 = getRobustIDGenerator({telemetryEnabled: false})
    const generator2 = getRobustIDGenerator()
    expect(generator1).toBe(generator2)
  })

  it('should replace instance with new initialization', () => {
    const generator1 = getRobustIDGenerator({telemetryEnabled: false})
    const generator2 = initializeRobustIDGenerator({telemetryEnabled: false, idLength: 64})
    expect(generator1).not.toBe(generator2)

    const generator3 = getRobustIDGenerator()
    expect(generator2).toBe(generator3)
  })
})

describe('Integration Scenarios', () => {
  let generator: RobustIDGenerator

  beforeEach(() => {
    generator = new RobustIDGenerator({
      telemetryEnabled: false,
      cacheEnabled: true,
      collisionDetectionEnabled: true
    })
  })

  afterEach(async () => {
    await generator.destroy()
  })

  it('should handle high-volume ID generation', async () => {
    const ids = new Set<string>()
    const count = 1000

    const startTime = performance.now()

    const promises = Array(count)
      .fill(0)
      .map(() => generator.generateID())
    const results = await Promise.all(promises)

    const endTime = performance.now()
    const totalTime = endTime - startTime

    expect(results).toHaveLength(count)

    for (const id of results) {
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }

    expect(ids.size).toBe(count)
    expect(totalTime).toBeLessThan(10000) // Should complete in under 10 seconds

    const stats = generator.getStatistics()
    expect(stats.totalGenerated).toBeGreaterThanOrEqual(count)
  })

  it('should maintain uniqueness across different sessions', async () => {
    const sessionIds = ['session_1', 'session_2', 'session_3']
    const idsPerSession = 50
    const allIds = new Set<string>()

    for (const sessionId of sessionIds) {
      for (let i = 0; i < idsPerSession; i++) {
        const id = await generator.generateID({
          sessionId,
          metadata: {sessionIndex: i}
        })

        expect(allIds.has(id)).toBe(false)
        allIds.add(id)
      }
    }

    expect(allIds.size).toBe(sessionIds.length * idsPerSession)
  })

  it('should handle mixed generation methods', async () => {
    const methods = [
      IDGenerationMethod.TIMESTAMP_BASED,
      IDGenerationMethod.UUID_V4,
      IDGenerationMethod.SECURE_RANDOM,
      IDGenerationMethod.HYBRID,
      IDGenerationMethod.NANOID
    ]

    const results: string[] = []

    for (const method of methods) {
      for (let i = 0; i < 20; i++) {
        const id = await generator.generateID({method})
        results.push(id)
      }
    }

    // All should be unique
    expect(new Set(results).size).toBe(results.length)

    // Check statistics
    const stats = generator.getStatistics()
    for (const method of methods) {
      expect(stats.methodUsage[method]).toBe(20)
    }
  })
})
