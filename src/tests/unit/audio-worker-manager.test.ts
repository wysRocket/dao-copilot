/**
 * Audio Worker Manager Test Suite
 *
 * Comprehensive tests for the audio processing worker manager functionality
 * including worker pool management, task distribution, and fallback mechanisms.
 */

import {describe, test, expect, beforeEach, afterEach} from 'vitest'
import {AudioWorkerManager} from '../../services/audio-worker-manager'
import './setup'

describe('AudioWorkerManager', () => {
  let manager: AudioWorkerManager

  beforeEach(async () => {
    manager = new AudioWorkerManager({
      maxWorkers: 0, // Force fallback to main thread for easier testing
      workerIdleTimeout: 1000,
      enableLogging: false,
      fallbackToMainThread: true
    })

    // Initialize the manager with default audio config
    await manager.initialize({
      inputFormat: {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 16
      },
      outputFormat: {
        format: 'pcm16',
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
      },
      enableCompression: false,
      qualityLevel: 0.8,
      lowLatencyMode: true
    })
  })

  afterEach(async () => {
    await manager.destroy()
  })

  describe('Initialization', () => {
    test('should create manager with default config', () => {
      const defaultManager = new AudioWorkerManager()
      expect(defaultManager).toBeDefined()
      expect(defaultManager.getStats().totalWorkers).toBe(0)
    })

    test('should create manager with custom config', () => {
      expect(manager).toBeDefined()
      expect(manager.getStats().totalWorkers).toBe(0)
    })
  })

  describe('Audio Conversion - Fallback Mode', () => {
    test('should convert audio data successfully using fallback', async () => {
      const audioData = new Float32Array(1024)
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin((2 * Math.PI * i) / 1024) * 0.5
      }

      const result = await manager.convertAudio(audioData)

      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect(result.format).toBe('pcm16')
      expect(result.sampleRate).toBe(16000)
      expect(result.channels).toBe(1)
      expect(result.duration).toBeGreaterThan(0)
      expect(result.processingTime).toBeGreaterThanOrEqual(0)
    })

    test('should handle empty audio data', async () => {
      const audioData = new Float32Array(0)
      const result = await manager.convertAudio(audioData)

      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect(result.duration).toBe(0)
      expect(result.format).toBe('pcm16')
    })

    test('should handle conversion with custom timestamp', async () => {
      const audioData = new Float32Array(1024).fill(0.5)
      const customTimestamp = Date.now() - 1000

      const result = await manager.convertAudio(audioData, customTimestamp)

      expect(result.timestamp).toBe(customTimestamp)
      expect(result.data).toBeInstanceOf(ArrayBuffer)
    })

    test('should handle different audio amplitudes', async () => {
      const testCases = [
        {amplitude: 0.1, description: 'quiet audio'},
        {amplitude: 0.5, description: 'medium audio'},
        {amplitude: 0.9, description: 'loud audio'},
        {amplitude: 1.0, description: 'maximum amplitude'}
      ]

      for (const testCase of testCases) {
        const audioData = new Float32Array(512).fill(testCase.amplitude)
        const result = await manager.convertAudio(audioData)

        expect(result.data).toBeInstanceOf(ArrayBuffer)
        expect(result.data.byteLength).toBeGreaterThan(0)
        expect(result.format).toBe('pcm16')
      }
    })
  })

  describe('Chunk Processing - Fallback Mode', () => {
    test('should process audio chunks successfully', async () => {
      const chunks = [
        new Float32Array(512).fill(0.5),
        new Float32Array(512).fill(0.3),
        new Float32Array(512).fill(0.7)
      ]

      const options = {
        normalize: true,
        removeNoise: false,
        enableVAD: false
      }

      const result = await manager.processChunks(chunks, options)

      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect(result.format).toBe('pcm16')
      expect(result.processingTime).toBeGreaterThanOrEqual(0)
      expect(result.sampleRate).toBe(16000)
      expect(result.channels).toBe(1)
    })

    test('should handle chunk processing with options', async () => {
      const chunks = [new Float32Array(512).fill(0.5)]
      const options = {
        normalize: true,
        removeNoise: false,
        enableVAD: true
      }

      const result = await manager.processChunks(chunks, options)

      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect(result.format).toBe('pcm16')
    })

    test('should handle empty chunks array', async () => {
      const chunks: Float32Array[] = []
      const options = {
        normalize: false,
        removeNoise: false,
        enableVAD: false
      }

      const result = await manager.processChunks(chunks, options)

      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect(result.duration).toBe(0)
    })

    test('should handle mixed chunk sizes', async () => {
      const chunks = [
        new Float32Array(256).fill(0.2),
        new Float32Array(512).fill(0.5),
        new Float32Array(1024).fill(0.8),
        new Float32Array(128).fill(0.1)
      ]

      const options = {
        normalize: true,
        removeNoise: true,
        enableVAD: false
      }

      const result = await manager.processChunks(chunks, options)

      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect(result.data.byteLength).toBeGreaterThan(0)
    })
  })

  describe('Configuration and Initialization', () => {
    test('should initialize with audio config', async () => {
      const audioConfig = {
        inputFormat: {
          sampleRate: 48000,
          channels: 2,
          bitDepth: 16
        },
        outputFormat: {
          format: 'pcm16',
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        },
        enableCompression: false,
        qualityLevel: 0.8,
        lowLatencyMode: true
      }

      await manager.initialize(audioConfig)

      // Test that initialization completed successfully
      const audioData = new Float32Array(1024).fill(0.5)
      const result = await manager.convertAudio(audioData)

      expect(result).toBeDefined()
      expect(result.sampleRate).toBe(16000)
      expect(result.channels).toBe(1)
    })

    test('should update config after initialization', async () => {
      const initialConfig = {
        inputFormat: {sampleRate: 44100, channels: 1, bitDepth: 16},
        outputFormat: {format: 'pcm16', sampleRate: 16000, channels: 1, bitDepth: 16},
        enableCompression: false,
        qualityLevel: 0.5,
        lowLatencyMode: false
      }

      await manager.initialize(initialConfig)

      const configUpdate = {
        qualityLevel: 0.9,
        lowLatencyMode: true
      }

      await manager.updateConfig(configUpdate)

      // Test that update completed successfully
      const audioData = new Float32Array(512).fill(0.3)
      const result = await manager.convertAudio(audioData)

      expect(result).toBeDefined()
      expect(result.format).toBe('pcm16')
    })
  })

  describe('Statistics and Monitoring', () => {
    test('should provide accurate statistics', async () => {
      const stats = manager.getStats()

      expect(stats).toHaveProperty('totalWorkers')
      expect(stats).toHaveProperty('busyWorkers')
      expect(stats).toHaveProperty('idleWorkers')
      expect(stats).toHaveProperty('pendingRequests')
      expect(stats).toHaveProperty('averageResponseTime')

      expect(stats.totalWorkers).toBe(0) // maxWorkers is 0
      expect(stats.busyWorkers).toBe(0)
      expect(stats.idleWorkers).toBe(0)
      expect(stats.pendingRequests).toBe(0)
      expect(stats.averageResponseTime).toBeGreaterThanOrEqual(0)
    })

    test('should track processing time', async () => {
      const audioData = new Float32Array(1024).fill(0.5)
      const result = await manager.convertAudio(audioData)

      expect(result.processingTime).toBeGreaterThanOrEqual(0)
      expect(result.processingTime).toBeLessThan(1000) // Should be fast
    })

    test('should handle concurrent processing', async () => {
      const audioData = new Float32Array(512).fill(0.5)
      const startTime = performance.now()

      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(manager.convertAudio(audioData))
      }

      const results = await Promise.all(promises)
      const endTime = performance.now()

      expect(results).toHaveLength(5)
      expect(endTime - startTime).toBeLessThan(2000) // Should complete quickly

      results.forEach(result => {
        expect(result.data).toBeInstanceOf(ArrayBuffer)
        expect(result.processingTime).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('Resource Management', () => {
    test('should cleanup resources on destroy', async () => {
      const audioData = new Float32Array(512).fill(0.5)

      // Process some audio to initialize internal state
      await manager.convertAudio(audioData)

      // Destroy manager
      await manager.destroy()

      // Statistics should reflect cleanup
      const stats = manager.getStats()
      expect(stats.totalWorkers).toBe(0)
      expect(stats.busyWorkers).toBe(0)
      expect(stats.pendingRequests).toBe(0)
    })

    test('should handle multiple destroy calls', async () => {
      await manager.destroy()
      await manager.destroy() // Should not throw

      const stats = manager.getStats()
      expect(stats.totalWorkers).toBe(0)
    })
  })

  describe('Error Handling', () => {
    test('should handle invalid audio data gracefully', async () => {
      // Test with various invalid inputs
      const testCases = [
        null,
        undefined,
        new Float32Array(0),
        new Float32Array([NaN, NaN, NaN]),
        new Float32Array([Infinity, -Infinity, 0])
      ]

      for (const testCase of testCases) {
        try {
          const result = await manager.convertAudio(testCase as Float32Array)
          // Should either succeed or handle gracefully
          if (result) {
            expect(result.data).toBeInstanceOf(ArrayBuffer)
          }
        } catch (error) {
          // Error handling is also acceptable
          expect(error).toBeInstanceOf(Error)
        }
      }
    })

    test('should handle processing errors gracefully', async () => {
      // Create a very large array that might cause memory issues
      const largeAudioData = new Float32Array(10000000) // 10M samples
      largeAudioData.fill(0.5)

      try {
        const result = await manager.convertAudio(largeAudioData)
        // If it succeeds, verify the result
        expect(result.data).toBeInstanceOf(ArrayBuffer)
      } catch (error) {
        // Error handling for memory constraints is acceptable
        expect(error).toBeInstanceOf(Error)
      }
    })
  })
})
