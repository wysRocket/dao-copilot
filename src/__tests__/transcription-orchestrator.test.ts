/**
 * Tests for Transcription Orchestrator
 *
 * Comprehensive test suite for the fallback orchestration system
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {TranscriptionOrchestrator} from '../services/transcription-orchestrator'
import {TranscriptionPerformanceOptimizer} from '../services/transcription-performance-optimizer'
import {BatchTranscriptionService} from '../services/batch-transcription-service'
import {WebSocketConnectionPool} from '../services/websocket-connection-pool'

// Mock the logger
vi.mock('../services/gemini-logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// Mock the circuit breaker
vi.mock('opossum', () => {
  return {
    default: class MockCircuitBreaker {
      constructor(fn: Function, options: any) {
        this.fn = fn
        this.options = options
      }

      async fire(...args: any[]) {
        return this.fn(...args)
      }

      on(event: string, handler: Function) {
        // Mock event handling
      }

      get opened() {
        return false
      }
      get halfOpen() {
        return false
      }
      get stats() {
        return {}
      }
      close() {}
    }
  }
})

describe('TranscriptionOrchestrator', () => {
  let orchestrator: TranscriptionOrchestrator
  let mockPrimaryService: any
  let mockBatchService: any
  let mockConnectionPool: any

  beforeEach(() => {
    // Create mock services
    mockPrimaryService = {
      transcribe: vi.fn(),
      getMetrics: vi.fn(() => ({
        totalRequests: 0,
        successfulRequests: 0,
        averageResponseTime: 0
      }))
    }

    mockBatchService = {
      transcribeFile: vi.fn()
    }

    mockConnectionPool = {
      getConnection: vi.fn(),
      releaseConnection: vi.fn()
    }

    // Create orchestrator with mocked services
    orchestrator = new TranscriptionOrchestrator(
      {
        enableFallback: true,
        fallbackProvider: 'google-cloud',
        circuitBreakerTimeout: 1000,
        errorThresholdPercentage: 50,
        healthCheckInterval: 1000
      },
      mockPrimaryService as any,
      mockBatchService as any,
      mockConnectionPool as any
    )
  })

  afterEach(async () => {
    await orchestrator.cleanup()
  })

  describe('Basic Transcription', () => {
    it('should transcribe using primary service when available', async () => {
      const mockResult = {
        text: 'Hello world',
        confidence: 0.95,
        duration: 2.5,
        words: []
      }

      mockPrimaryService.transcribe.mockResolvedValue(mockResult)

      const request = {
        audioData: Buffer.from('audio-data'),
        options: {
          model: 'gemini-live-2.5-flash-preview'
        }
      }

      const result = await orchestrator.transcribe(request)

      expect(result).toEqual(mockResult)
      expect(mockPrimaryService.transcribe).toHaveBeenCalledTimes(1)
    })

    it('should fallback to secondary service when primary fails', async () => {
      mockPrimaryService.transcribe.mockRejectedValue(new Error('Primary service failed'))

      const request = {
        audioData: Buffer.from('audio-data'),
        options: {
          model: 'gemini-live-2.5-flash-preview'
        }
      }

      const result = await orchestrator.transcribe(request)

      expect(result.text).toContain('[FALLBACK]')
      expect(result.text).toContain('Google Cloud Speech')
      expect(mockPrimaryService.transcribe).toHaveBeenCalledTimes(1)
    })

    it('should fail when both primary and fallback services fail', async () => {
      mockPrimaryService.transcribe.mockRejectedValue(new Error('Primary failed'))

      // Create orchestrator with disabled fallback
      const noFallbackOrchestrator = new TranscriptionOrchestrator(
        {
          enableFallback: false
        },
        mockPrimaryService as any,
        mockBatchService as any,
        mockConnectionPool as any
      )

      const request = {
        audioData: Buffer.from('audio-data')
      }

      await expect(noFallbackOrchestrator.transcribe(request)).rejects.toThrow('Primary failed')

      await noFallbackOrchestrator.cleanup()
    })
  })

  describe('Circuit Breaker Behavior', () => {
    it('should handle circuit breaker events', async () => {
      const eventSpy = vi.fn()
      orchestrator.on('circuit-breaker-opened', eventSpy)

      // This would be triggered by the actual circuit breaker
      orchestrator.emit('circuit-breaker-opened', {service: 'primary'})

      expect(eventSpy).toHaveBeenCalledWith({service: 'primary'})
    })

    it('should reset circuit breakers on demand', async () => {
      const resetSpy = vi.fn()
      orchestrator.on('circuit-breakers-reset', resetSpy)

      await orchestrator.resetCircuitBreakers()

      expect(resetSpy).toHaveBeenCalled()
    })
  })

  describe('Request Queue Management', () => {
    it('should queue requests when at capacity', async () => {
      const mockResult = {
        text: 'Queued response',
        confidence: 0.9,
        duration: 1.0,
        words: []
      }

      mockPrimaryService.transcribe.mockResolvedValue(mockResult)

      // Create orchestrator with low capacity
      const limitedOrchestrator = new TranscriptionOrchestrator(
        {
          maxConcurrentRequests: 1,
          enableFallback: false
        },
        mockPrimaryService as any,
        mockBatchService as any,
        mockConnectionPool as any
      )

      const request = {
        audioData: Buffer.from('audio-data')
      }

      // Start multiple requests
      const promises = [
        limitedOrchestrator.transcribe(request),
        limitedOrchestrator.transcribe(request)
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual(mockResult)
      expect(results[1]).toEqual(mockResult)

      await limitedOrchestrator.cleanup()
    })

    it('should reject requests when queue is full', async () => {
      // Create orchestrator with very limited capacity
      const restrictedOrchestrator = new TranscriptionOrchestrator(
        {
          maxConcurrentRequests: 1,
          requestQueueSize: 1,
          enableFallback: false
        },
        mockPrimaryService as any,
        mockBatchService as any,
        mockConnectionPool as any
      )

      // Mock a slow transcription
      mockPrimaryService.transcribe.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  text: 'Slow response',
                  confidence: 0.9,
                  duration: 1.0,
                  words: []
                }),
              100
            )
          )
      )

      const request = {
        audioData: Buffer.from('audio-data')
      }

      // Start requests to fill capacity + queue + overflow
      const promises = [
        restrictedOrchestrator.transcribe(request), // Processing
        restrictedOrchestrator.transcribe(request), // Queued
        restrictedOrchestrator.transcribe(request) // Should be rejected
      ]

      // The third request should be rejected
      await expect(promises[2]).rejects.toThrow('Request queue is full')

      await restrictedOrchestrator.cleanup()
    })
  })

  describe('Health Monitoring', () => {
    it('should provide health status', () => {
      const health = orchestrator.getHealthStatus()

      expect(health).toHaveProperty('primary')
      expect(health).toHaveProperty('fallback')
      expect(health.primary).toHaveProperty('isHealthy')
      expect(health.fallback).toHaveProperty('isHealthy')
    })

    it('should provide metrics', () => {
      const metrics = orchestrator.getMetrics()

      expect(metrics).toHaveProperty('totalRequests')
      expect(metrics).toHaveProperty('successfulRequests')
      expect(metrics).toHaveProperty('failedRequests')
      expect(metrics).toHaveProperty('fallbackRequests')
      expect(metrics).toHaveProperty('averageResponseTime')
    })

    it('should emit health check events', done => {
      orchestrator.on('health-check-completed', data => {
        expect(data).toHaveProperty('primary')
        expect(data).toHaveProperty('fallback')
        expect(data).toHaveProperty('timestamp')
        done()
      })

      // Trigger a health check manually
      orchestrator.emit('health-check-completed', {
        primary: {isHealthy: true},
        fallback: {isHealthy: true},
        timestamp: Date.now()
      })
    })
  })

  describe('Result Validation', () => {
    it('should validate transcription results', async () => {
      const lowConfidenceResult = {
        text: 'Low confidence result',
        confidence: 0.3, // Below default threshold of 0.7
        duration: 1.0,
        words: []
      }

      mockPrimaryService.transcribe.mockResolvedValue(lowConfidenceResult)

      const validatingOrchestrator = new TranscriptionOrchestrator(
        {
          validateResults: true,
          confidenceThreshold: 0.7,
          enableFallback: true,
          fallbackProvider: 'google-cloud'
        },
        mockPrimaryService as any,
        mockBatchService as any,
        mockConnectionPool as any
      )

      const request = {
        audioData: Buffer.from('audio-data')
      }

      const result = await validatingOrchestrator.transcribe(request)

      // Should fallback due to low confidence
      expect(result.text).toContain('[FALLBACK]')

      await validatingOrchestrator.cleanup()
    })

    it('should handle missing confidence scores', async () => {
      const noConfidenceResult = {
        text: 'Result without confidence',
        duration: 1.0,
        words: []
        // Missing confidence property
      }

      mockPrimaryService.transcribe.mockResolvedValue(noConfidenceResult)

      const request = {
        audioData: Buffer.from('audio-data')
      }

      const result = await orchestrator.transcribe(request)

      expect(result).toEqual(noConfidenceResult)
    })
  })

  describe('Different Fallback Providers', () => {
    it('should use Whisper fallback', async () => {
      const whisperOrchestrator = new TranscriptionOrchestrator(
        {
          enableFallback: true,
          fallbackProvider: 'whisper'
        },
        mockPrimaryService as any,
        mockBatchService as any,
        mockConnectionPool as any
      )

      mockPrimaryService.transcribe.mockRejectedValue(new Error('Primary failed'))

      const request = {
        audioData: Buffer.from('audio-data')
      }

      const result = await whisperOrchestrator.transcribe(request)

      expect(result.text).toContain('Whisper')

      await whisperOrchestrator.cleanup()
    })

    it('should use Azure Speech fallback', async () => {
      const azureOrchestrator = new TranscriptionOrchestrator(
        {
          enableFallback: true,
          fallbackProvider: 'azure-speech'
        },
        mockPrimaryService as any,
        mockBatchService as any,
        mockConnectionPool as any
      )

      mockPrimaryService.transcribe.mockRejectedValue(new Error('Primary failed'))

      const request = {
        audioData: Buffer.from('audio-data')
      }

      const result = await azureOrchestrator.transcribe(request)

      expect(result.text).toContain('Azure Speech')

      await azureOrchestrator.cleanup()
    })

    it('should handle unsupported fallback provider', async () => {
      const invalidOrchestrator = new TranscriptionOrchestrator(
        {
          enableFallback: true,
          fallbackProvider: 'invalid-provider' as any
        },
        mockPrimaryService as any,
        mockBatchService as any,
        mockConnectionPool as any
      )

      mockPrimaryService.transcribe.mockRejectedValue(new Error('Primary failed'))

      const request = {
        audioData: Buffer.from('audio-data')
      }

      await expect(invalidOrchestrator.transcribe(request)).rejects.toThrow(
        'Unsupported fallback provider: invalid-provider'
      )

      await invalidOrchestrator.cleanup()
    })
  })

  describe('Stress Testing', () => {
    it('should handle multiple concurrent requests', async () => {
      const concurrentResult = {
        text: 'Concurrent response',
        confidence: 0.95,
        duration: 1.0,
        words: []
      }

      mockPrimaryService.transcribe.mockResolvedValue(concurrentResult)

      const request = {
        audioData: Buffer.from('audio-data')
      }

      // Create many concurrent requests
      const promises = Array(10)
        .fill(null)
        .map(() => orchestrator.transcribe(request))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result).toEqual(concurrentResult)
      })
    })

    it('should recover from extended failures', async () => {
      let failureCount = 0
      const maxFailures = 3

      mockPrimaryService.transcribe.mockImplementation(() => {
        if (failureCount < maxFailures) {
          failureCount++
          return Promise.reject(new Error(`Failure ${failureCount}`))
        }
        return Promise.resolve({
          text: 'Recovery successful',
          confidence: 0.95,
          duration: 1.0,
          words: []
        })
      })

      const request = {
        audioData: Buffer.from('audio-data')
      }

      // First few requests should use fallback
      const fallbackResults = await Promise.all([
        orchestrator.transcribe(request),
        orchestrator.transcribe(request),
        orchestrator.transcribe(request)
      ])

      fallbackResults.forEach(result => {
        expect(result.text).toContain('[FALLBACK]')
      })

      // Next request should succeed with primary
      const recoveryResult = await orchestrator.transcribe(request)
      expect(recoveryResult.text).toBe('Recovery successful')
    })
  })
})
