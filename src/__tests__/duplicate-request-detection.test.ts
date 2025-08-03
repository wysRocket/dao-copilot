/**
 * Test suite for Duplicate Request Detection System
 *
 * Tests duplicate detection, throttling, pattern analysis, and integration
 * with the Emergency Circuit Breaker system.
 */

import {describe, test, expect, beforeEach, afterEach} from 'vitest'
import {DuplicateRequestDetector} from '../utils/DuplicateRequestDetector'
import {EmergencyCircuitBreaker} from '../utils/EmergencyCircuitBreaker'

describe('DuplicateRequestDetector', () => {
  let detector: DuplicateRequestDetector

  beforeEach(() => {
    // Create detector with test-friendly configuration
    detector = new DuplicateRequestDetector(
      {
        maxRequestsPerWindow: 3,
        windowSizeMs: 1000,
        cooldownPeriodMs: 2000,
        duplicateWindowMs: 500
      },
      {
        enableDuplicateDetection: true,
        enableThrottling: true,
        enablePatternAnalysis: true
      }
    )
  })

  afterEach(() => {
    detector.dispose()
  })

  test('should allow unique requests', () => {
    const audioData1 = Buffer.from('audio data 1')
    const audioData2 = Buffer.from('audio data 2')

    const result1 = detector.checkRequest(audioData1, {format: 'wav'})
    const result2 = detector.checkRequest(audioData2, {format: 'wav'})

    expect(result1.isAllowed).toBe(true)
    expect(result1.isDuplicate).toBe(false)
    expect(result1.isThrottled).toBe(false)

    expect(result2.isAllowed).toBe(true)
    expect(result2.isDuplicate).toBe(false)
    expect(result2.isThrottled).toBe(false)
  })

  test('should detect duplicate requests within window', () => {
    const audioData = Buffer.from('same audio data')

    const result1 = detector.checkRequest(audioData, {format: 'wav'})
    const result2 = detector.checkRequest(audioData, {format: 'wav'})

    expect(result1.isAllowed).toBe(true)
    expect(result2.isAllowed).toBe(false)
    expect(result2.isDuplicate).toBe(true)
    expect(result2.reason).toContain('Duplicate request detected')
  })

  test('should allow duplicate requests after window expires', async () => {
    const audioData = Buffer.from('audio data for timing test')

    const result1 = detector.checkRequest(audioData, {format: 'wav'})
    expect(result1.isAllowed).toBe(true)

    // Wait for duplicate window to expire
    await new Promise(resolve => setTimeout(resolve, 600))

    const result2 = detector.checkRequest(audioData, {format: 'wav'})
    expect(result2.isAllowed).toBe(true)
    expect(result2.isDuplicate).toBe(false)
  })

  test('should throttle high-frequency requests', () => {
    // Send requests up to the limit
    const results = []
    for (let i = 0; i < 5; i++) {
      const modifiedData = Buffer.from(`rapid request data ${i}`)
      results.push(detector.checkRequest(modifiedData, {format: 'wav'}))
    }

    // First 3 should be allowed
    expect(results[0].isAllowed).toBe(true)
    expect(results[1].isAllowed).toBe(true)
    expect(results[2].isAllowed).toBe(true)

    // Subsequent should be throttled
    expect(results[3].isAllowed).toBe(false)
    expect(results[3].isThrottled).toBe(true)
    expect(results[4].isAllowed).toBe(false)
    expect(results[4].isThrottled).toBe(true)
  })

  test('should provide accurate statistics', () => {
    const audioData1 = Buffer.from('stats test 1')
    const audioData2 = Buffer.from('stats test 2')
    const audioData3 = Buffer.from('stats test 3')

    detector.checkRequest(audioData1)
    detector.checkRequest(audioData2)
    detector.checkRequest(audioData3)

    const stats = detector.getStatistics()

    expect(stats.totalRequests).toBeGreaterThan(0)
    expect(stats.uniquePatterns).toBeGreaterThan(0)
    expect(stats.memoryUsage.requestsCount).toBeGreaterThan(0)
    expect(stats.memoryUsage.estimatedSizeKB).toBeGreaterThan(0)
  })

  test('should analyze patterns correctly', () => {
    // Create several requests with same pattern
    const baseData = Buffer.from('pattern analysis test')

    for (let i = 0; i < 3; i++) {
      detector.checkRequest(baseData, {format: 'wav', timestamp: Date.now() + i * 100})
    }

    const analysis = detector.getPatternAnalysis()

    expect(analysis.length).toBeGreaterThan(0)
    expect(analysis[0].frequency).toBe(3)
    expect(analysis[0].riskLevel).toBe('high') // Due to high frequency
  })

  test('should handle different audio formats correctly', () => {
    const audioData = Buffer.from('format test data')

    const wavResult = detector.checkRequest(audioData, {format: 'wav'})
    const mp3Result = detector.checkRequest(audioData, {format: 'mp3'})

    // Different formats should be treated as different requests
    expect(wavResult.isAllowed).toBe(true)
    expect(mp3Result.isAllowed).toBe(true)
    expect(wavResult.isDuplicate).toBe(false)
    expect(mp3Result.isDuplicate).toBe(false)
  })
})

describe('EmergencyCircuitBreaker Integration', () => {
  let circuitBreaker: EmergencyCircuitBreaker

  beforeEach(() => {
    circuitBreaker = EmergencyCircuitBreaker.getInstance()
  })

  test('should integrate duplicate detection with circuit breaker', () => {
    const audioData = Buffer.from('integration test data')

    // Test transcription call guard
    const result = circuitBreaker.transcriptionCallGuard('testTranscription', audioData, [
      'test',
      'args'
    ])

    expect(result.isAllowed).toBe(true)
    expect(result.isDuplicate).toBe(false)
    expect(result.isThrottled).toBe(false)
    expect(result.isCircuitOpen).toBe(false)
  })

  test('should block duplicate requests through circuit breaker', () => {
    const audioData = Buffer.from('duplicate integration test')

    // First request should be allowed
    const result1 = circuitBreaker.transcriptionCallGuard('testTranscription', audioData)
    expect(result1.isAllowed).toBe(true)

    // Second identical request should be blocked
    const result2 = circuitBreaker.transcriptionCallGuard('testTranscription', audioData)
    expect(result2.isAllowed).toBe(false)
    expect(result2.isDuplicate).toBe(true)
  })

  test('should provide comprehensive protection status', () => {
    const audioData = Buffer.from('status test data')

    // Generate some activity
    circuitBreaker.transcriptionCallGuard('testFunction', audioData)

    const status = circuitBreaker.getProtectionStatus()

    expect(status.circuitBreaker).toBeDefined()
    expect(status.duplicateDetection).toBeDefined()
    expect(status.duplicateDetection.totalRequests).toBeGreaterThan(0)
    expect(status.duplicateDetection.memoryUsage).toBeDefined()
    expect(status.duplicateDetection.recentActivity).toBeDefined()
  })

  test('should handle throttling through circuit breaker', () => {
    // Send multiple rapid requests
    const results = []
    for (let i = 0; i < 25; i++) {
      const modifiedData = Buffer.from(`throttle test ${i}`)
      results.push(circuitBreaker.transcriptionCallGuard('throttleTest', modifiedData))
    }

    // Some should be allowed, others throttled
    const allowedCount = results.filter(r => r.isAllowed).length
    const throttledCount = results.filter(r => r.isThrottled).length

    expect(allowedCount).toBeGreaterThan(0)
    expect(throttledCount).toBeGreaterThan(0)
    expect(allowedCount + throttledCount).toBe(results.length)
  })
})

describe('Memory Management and Performance', () => {
  let detector: DuplicateRequestDetector

  beforeEach(() => {
    detector = new DuplicateRequestDetector(
      {maxRequestsPerWindow: 100, windowSizeMs: 1000},
      {maxRegistrySize: 50, memoryCleanupThreshold: 40}
    )
  })

  afterEach(() => {
    detector.dispose()
  })

  test('should manage memory usage effectively', () => {
    // Generate many requests to trigger cleanup
    for (let i = 0; i < 60; i++) {
      const audioData = Buffer.from(`memory test ${i}`)
      detector.checkRequest(audioData, {timestamp: Date.now()})
    }

    const stats = detector.getStatistics()

    // Memory management should keep the registry size reasonable
    expect(stats.totalRequests).toBeLessThan(60) // Some should be cleaned up
    expect(stats.memoryUsage.estimatedSizeKB).toBeGreaterThan(0)
  })

  test('should handle large audio files efficiently', () => {
    // Create a large audio buffer
    const largeAudioData = Buffer.alloc(1024 * 1024) // 1MB
    largeAudioData.fill('A')

    const startTime = Date.now()
    const result = detector.checkRequest(largeAudioData, {format: 'wav'})
    const processingTime = Date.now() - startTime

    expect(result.isAllowed).toBe(true)
    expect(processingTime).toBeLessThan(1000) // Should process within 1 second
  })

  test('should clean up old data automatically', async () => {
    // Add some data
    for (let i = 0; i < 10; i++) {
      const audioData = Buffer.from(`cleanup test ${i}`)
      detector.checkRequest(audioData)
    }

    // Wait for cleanup interval (this is a simplified test)
    // In real scenario, cleanup happens based on age, not just time
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check that the system is still functional
    const audioData = Buffer.from('post cleanup test')
    const result = detector.checkRequest(audioData)

    expect(result.isAllowed).toBe(true)
  })
})
