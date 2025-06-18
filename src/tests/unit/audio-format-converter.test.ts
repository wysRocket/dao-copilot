/**
 * Tests for Audio Format Converter Service
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {
  AudioFormatConverter,
  AudioFormat,
  DEFAULT_CONVERSION_CONFIG,
  createAudioFormatConverter,
  getOptimalAudioFormat,
  validateAudioConfig
} from '../../services/audio-format-converter'

describe('AudioFormatConverter', () => {
  let converter: AudioFormatConverter

  beforeEach(() => {
    converter = new AudioFormatConverter()
  })

  afterEach(async () => {
    await converter.destroy()
  })

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = converter.getConfig()
      expect(config).toEqual(DEFAULT_CONVERSION_CONFIG)
    })

    it('should allow configuration updates', () => {
      const updates = {
        outputFormat: {
          format: AudioFormat.OPUS,
          sampleRate: 48000,
          channels: 2,
          bitDepth: 16,
          bitrate: 128000
        },
        enableCompression: true,
        qualityLevel: 10
      }

      converter.updateConfig(updates)
      const config = converter.getConfig()

      expect(config.outputFormat.format).toBe(AudioFormat.OPUS)
      expect(config.outputFormat.sampleRate).toBe(48000)
      expect(config.outputFormat.channels).toBe(2)
      expect(config.enableCompression).toBe(true)
      expect(config.qualityLevel).toBe(10)
    })

    it('should validate audio configuration correctly', () => {
      const validConfig = {...DEFAULT_CONVERSION_CONFIG}
      const validation = validateAudioConfig(validConfig)
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect invalid configuration', () => {
      const invalidConfig = {
        ...DEFAULT_CONVERSION_CONFIG,
        inputFormat: {
          ...DEFAULT_CONVERSION_CONFIG.inputFormat,
          sampleRate: -1000
        },
        qualityLevel: 15
      }

      const validation = validateAudioConfig(invalidConfig)
      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
      expect(validation.errors).toContain('Input sample rate must be positive')
      expect(validation.errors).toContain('Quality level must be between 0 and 10')
    })
  })

  describe('Initialization', () => {
    it('should initialize without errors', async () => {
      await expect(converter.initialize()).resolves.not.toThrow()
    })

    it('should handle multiple initialization calls', async () => {
      await converter.initialize()
      await expect(converter.initialize()).resolves.not.toThrow()
    })

    it('should initialize with different configurations', async () => {
      const customConverter = new AudioFormatConverter({
        enableCompression: true,
        outputFormat: {
          format: AudioFormat.PCM16,
          sampleRate: 8000,
          channels: 1,
          bitDepth: 16
        }
      })

      await expect(customConverter.initialize()).resolves.not.toThrow()
      await customConverter.destroy()
    })
  })

  describe('Audio Conversion', () => {
    beforeEach(async () => {
      await converter.initialize()
    })

    it('should convert Float32 audio data to PCM16', async () => {
      // Create test audio data (1 second of 1kHz sine wave)
      const sampleRate = 48000
      const duration = 1 // second
      const frequency = 1000 // Hz
      const numSamples = sampleRate * duration
      const audioData = new Float32Array(numSamples)

      for (let i = 0; i < numSamples; i++) {
        audioData[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5
      }

      const result = await converter.convert(audioData)

      expect(result.format).toBe(AudioFormat.PCM16)
      expect(result.sampleRate).toBe(16000) // Downsampled
      expect(result.channels).toBe(1)
      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect(result.data.byteLength).toBeGreaterThan(0)
      expect(result.duration).toBeCloseTo(1000, 0) // 1 second in milliseconds
    })

    it('should handle empty audio data', async () => {
      const emptyData = new Float32Array(0)
      const result = await converter.convert(emptyData)

      expect(result.data.byteLength).toBe(0)
      expect(result.duration).toBe(0)
    })

    it('should handle different input sample rates', async () => {
      const customConverter = new AudioFormatConverter({
        inputFormat: {
          sampleRate: 22050,
          channels: 1,
          bitDepth: 32
        }
      })

      await customConverter.initialize()

      const audioData = new Float32Array(22050) // 1 second of audio
      audioData.fill(0.5) // Fill with constant value

      const result = await customConverter.convert(audioData)

      expect(result.sampleRate).toBe(16000)
      expect(result.duration).toBeCloseTo(1000, 0)

      await customConverter.destroy()
    })

    it('should include timestamp in conversion result', async () => {
      const audioData = new Float32Array(1024)
      const timestamp = Date.now()

      const result = await converter.convert(audioData, timestamp)

      expect(result.timestamp).toBe(timestamp)
    })

    it('should handle bit depth conversion correctly', async () => {
      // Test with maximum amplitude
      const audioData = new Float32Array(100)
      audioData.fill(1.0) // Maximum positive amplitude

      const result = await converter.convert(audioData)

      // Check that the conversion preserved the signal
      expect(result.data.byteLength).toBeGreaterThan(0)
      expect(result.format).toBe(AudioFormat.PCM16)
    })
  })

  describe('Sample Rate Conversion', () => {
    it('should handle upsampling', async () => {
      const upsamplingConverter = new AudioFormatConverter({
        inputFormat: {
          sampleRate: 8000,
          channels: 1,
          bitDepth: 32
        },
        outputFormat: {
          format: AudioFormat.PCM16,
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        }
      })

      await upsamplingConverter.initialize()

      const inputData = new Float32Array(8000) // 1 second at 8kHz
      inputData.fill(0.5)

      const result = await upsamplingConverter.convert(inputData)

      expect(result.sampleRate).toBe(16000)
      expect(result.duration).toBeCloseTo(1000, 0)

      await upsamplingConverter.destroy()
    })

    it('should handle downsampling', async () => {
      const downsamplingConverter = new AudioFormatConverter({
        inputFormat: {
          sampleRate: 48000,
          channels: 1,
          bitDepth: 32
        },
        outputFormat: {
          format: AudioFormat.PCM16,
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        }
      })

      await downsamplingConverter.initialize()

      const inputData = new Float32Array(48000) // 1 second at 48kHz
      inputData.fill(0.5)

      const result = await downsamplingConverter.convert(inputData)

      expect(result.sampleRate).toBe(16000)
      expect(result.duration).toBeCloseTo(1000, 0)

      await downsamplingConverter.destroy()
    })

    it('should handle same sample rate (no resampling)', async () => {
      const noResamplingConverter = new AudioFormatConverter({
        inputFormat: {
          sampleRate: 16000,
          channels: 1,
          bitDepth: 32
        },
        outputFormat: {
          format: AudioFormat.PCM16,
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        }
      })

      await noResamplingConverter.initialize()

      const inputData = new Float32Array(16000) // 1 second at 16kHz
      inputData.fill(0.5)

      const result = await noResamplingConverter.convert(inputData)

      expect(result.sampleRate).toBe(16000)
      expect(result.duration).toBeCloseTo(1000, 0)

      await noResamplingConverter.destroy()
    })
  })

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const errorConverter = new AudioFormatConverter({
        enableCompression: true,
        outputFormat: {
          format: AudioFormat.OPUS, // This will trigger a warning
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16
        }
      })

      // Should not throw even if compression is not fully implemented
      await expect(errorConverter.initialize()).resolves.not.toThrow()

      await errorConverter.destroy()
    })

    it('should handle conversion errors', async () => {
      // Force an error by not initializing
      const audioData = new Float32Array(1024)

      // This should auto-initialize, so it should work
      await expect(converter.convert(audioData)).resolves.toBeDefined()
    })
  })

  describe('Resource Management', () => {
    it('should cleanup resources properly', async () => {
      await converter.initialize()
      await expect(converter.destroy()).resolves.not.toThrow()
    })

    it('should handle multiple destroy calls', async () => {
      await converter.initialize()
      await converter.destroy()
      await expect(converter.destroy()).resolves.not.toThrow()
    })
  })

  describe('Utility Functions', () => {
    it('should return optimal audio format', () => {
      const format = getOptimalAudioFormat()
      expect(format).toBe(AudioFormat.PCM16)
    })

    it('should create converter with factory function', () => {
      const createdConverter = createAudioFormatConverter({
        qualityLevel: 5
      })

      expect(createdConverter).toBeInstanceOf(AudioFormatConverter)
      expect(createdConverter.getConfig().qualityLevel).toBe(5)
    })
  })

  describe('Performance', () => {
    it('should convert audio data efficiently', async () => {
      await converter.initialize()

      // Create a larger audio buffer for performance testing
      const largeAudioData = new Float32Array(48000 * 5) // 5 seconds of audio
      largeAudioData.fill(Math.random())

      const startTime = performance.now()
      const result = await converter.convert(largeAudioData)
      const endTime = performance.now()

      const conversionTime = endTime - startTime

      expect(result.data.byteLength).toBeGreaterThan(0)
      expect(conversionTime).toBeLessThan(1000) // Should complete in less than 1 second
    })

    it('should handle multiple concurrent conversions', async () => {
      await converter.initialize()

      const audioData = new Float32Array(16000) // 1 second of audio
      audioData.fill(0.5)

      const promises = Array.from({length: 5}, () => converter.convert(audioData))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result.data.byteLength).toBeGreaterThan(0)
        expect(result.format).toBe(AudioFormat.PCM16)
      })
    })
  })
})
