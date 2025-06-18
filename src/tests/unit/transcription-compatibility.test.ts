import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  detectLegacyUsage,
  migrateLegacyEnvironment,
  migrateLegacyConfig,
  createLegacyWrapper,
  isLegacyUsagePattern,
  generateMigrationGuide,
  checkCompatibilityStatus,
  LegacyAliases,
  type LegacyTranscriptionOptions,
  type MigrationResult
} from '../../services/transcription-compatibility'
import {TranscriptionMode} from '../../services/gemini-live-integration'

describe('Transcription Backward Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear environment variables
    delete process.env.GEMINI_BATCH_MODE
    delete process.env.DISABLE_WEBSOCKET
    delete process.env.PROXY_FALLBACK
    delete process.env.GOOGLE_API_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('detectLegacyUsage', () => {
    it('should detect legacy configuration options', () => {
      const legacyConfig = {
        apiKey: 'test-key',
        batchMode: true,
        useProxy: true,
        fallbackEnabled: false
      }

      expect(detectLegacyUsage(legacyConfig)).toBe(true)
    })

    it('should not detect legacy usage for modern config', () => {
      const modernConfig = {
        apiKey: 'test-key',
        mode: TranscriptionMode.HYBRID,
        enableWebSocket: true
      }

      expect(detectLegacyUsage(modernConfig)).toBe(false)
    })

    it('should handle empty or invalid config', () => {
      expect(detectLegacyUsage({})).toBe(false)
      expect(detectLegacyUsage(null as unknown as LegacyTranscriptionOptions)).toBe(false)
      expect(detectLegacyUsage(undefined as unknown as LegacyTranscriptionOptions)).toBe(false)
    })
  })

  describe('migrateLegacyEnvironment', () => {
    it('should migrate GEMINI_BATCH_MODE to GEMINI_TRANSCRIPTION_MODE', () => {
      process.env.GEMINI_BATCH_MODE = 'true'

      const result = migrateLegacyEnvironment()

      expect(result.migrated.GEMINI_TRANSCRIPTION_MODE).toBe(TranscriptionMode.BATCH)
      expect(result.warnings).toContain(
        'GEMINI_BATCH_MODE is deprecated. Use GEMINI_TRANSCRIPTION_MODE instead.'
      )
    })

    it('should migrate DISABLE_WEBSOCKET to GEMINI_WEBSOCKET_ENABLED', () => {
      process.env.DISABLE_WEBSOCKET = 'true'

      const result = migrateLegacyEnvironment()

      expect(result.migrated.GEMINI_WEBSOCKET_ENABLED).toBe('false')
      expect(result.warnings).toContain(
        'DISABLE_WEBSOCKET is deprecated. Use GEMINI_WEBSOCKET_ENABLED=false instead.'
      )
    })

    it('should migrate PROXY_FALLBACK to GEMINI_FALLBACK_TO_BATCH', () => {
      process.env.PROXY_FALLBACK = 'false'

      const result = migrateLegacyEnvironment()

      expect(result.migrated.GEMINI_FALLBACK_TO_BATCH).toBe('false')
      expect(result.warnings).toContain(
        'PROXY_FALLBACK is deprecated. Use GEMINI_FALLBACK_TO_BATCH instead.'
      )
    })

    it('should return empty result when no legacy environment variables', () => {
      const result = migrateLegacyEnvironment()

      expect(Object.keys(result.migrated)).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('migrateLegacyConfig', () => {
    it('should migrate legacy configuration to modern format', () => {
      const legacyConfig: LegacyTranscriptionOptions = {
        apiKey: 'test-key',
        modelName: 'test-model',
        batchMode: true,
        fallbackEnabled: false,
        useProxy: true,
        timeout: 5000,
        retries: 3
      }

      const result: MigrationResult = migrateLegacyConfig(legacyConfig)

      expect(result.isLegacy).toBe(true)
      expect(result.newConfig.apiKey).toBe('test-key')
      expect(result.newConfig.modelName).toBe('test-model')
      expect(result.newConfig.mode).toBe(TranscriptionMode.BATCH)
      expect(result.newConfig.fallbackToBatch).toBe(false)

      expect(result.deprecations).toContain(
        'The "batchMode" option is deprecated. Use "mode: TranscriptionMode.BATCH" instead.'
      )
      expect(result.deprecations).toContain(
        'The "fallbackEnabled" option is deprecated. Use "fallbackToBatch" instead.'
      )

      expect(result.warnings).toContain(
        'The "useProxy" option is no longer needed. Proxy functionality is now built-in.'
      )
      expect(result.warnings).toContain(
        'The "timeout" option is now handled automatically by the WebSocket client.'
      )
      expect(result.warnings).toContain(
        'The "retries" option is now handled automatically by the reconnection manager.'
      )
    })

    it('should handle proxy configuration migration', () => {
      const legacyConfig: LegacyTranscriptionOptions = {
        apiKey: 'test-key',
        proxyUrl: 'http://localhost:8001'
      }

      const result = migrateLegacyConfig(legacyConfig, true)

      // Check that proxy-related config is preserved
      expect('proxyUrl' in result.newConfig).toBe(true)
      expect((result.newConfig as Record<string, unknown>).proxyUrl).toBe('http://localhost:8001')
    })

    it('should handle modern config without changes', () => {
      const modernConfig: LegacyTranscriptionOptions = {
        apiKey: 'test-key',
        modelName: 'test-model'
      }

      const result = migrateLegacyConfig(modernConfig)

      expect(result.isLegacy).toBe(false)
      expect(result.warnings).toHaveLength(0)
      expect(result.deprecations).toHaveLength(0)
    })
  })

  describe('createLegacyWrapper', () => {
    it('should wrap function and migrate legacy options', () => {
      const originalFunction = vi.fn((...args: unknown[]) => {
        const [, options] = args
        return {text: 'test', duration: 100, ...(options as Record<string, unknown>)}
      })

      const wrappedFunction = createLegacyWrapper(originalFunction, 'testFunction')

      const legacyOptions = {
        apiKey: 'test-key',
        batchMode: true
      }

      wrappedFunction(Buffer.from('test'), legacyOptions)

      // Should have called original function with migrated config
      expect(originalFunction).toHaveBeenCalledWith(
        Buffer.from('test'),
        expect.objectContaining({
          apiKey: 'test-key',
          mode: TranscriptionMode.BATCH
        })
      )
    })

    it('should pass through modern options unchanged', () => {
      const originalFunction = vi.fn((...args: unknown[]) => {
        const [, options] = args
        return {text: 'test', duration: 100, ...(options as Record<string, unknown>)}
      })

      const wrappedFunction = createLegacyWrapper(originalFunction, 'testFunction')

      const modernOptions = {
        apiKey: 'test-key',
        mode: TranscriptionMode.WEBSOCKET
      }

      wrappedFunction(Buffer.from('test'), modernOptions)

      expect(originalFunction).toHaveBeenCalledWith(Buffer.from('test'), modernOptions)
    })
  })

  describe('isLegacyUsagePattern', () => {
    it('should detect legacy environment variables', () => {
      process.env.GEMINI_BATCH_MODE = 'true'

      expect(isLegacyUsagePattern()).toBe(true)
    })

    it('should detect multiple legacy environment variables', () => {
      process.env.DISABLE_WEBSOCKET = 'true'
      process.env.PROXY_FALLBACK = 'false'

      expect(isLegacyUsagePattern()).toBe(true)
    })

    it('should return false when no legacy environment variables', () => {
      expect(isLegacyUsagePattern()).toBe(false)
    })
  })

  describe('generateMigrationGuide', () => {
    it('should generate migration guide for legacy environment variables', () => {
      process.env.GEMINI_BATCH_MODE = 'true'
      process.env.DISABLE_WEBSOCKET = 'true'

      const guide = generateMigrationGuide()

      expect(guide).toContain('# Gemini Live API Migration Guide')
      expect(guide).toContain('## Environment Variables')
      expect(guide).toContain('GEMINI_BATCH_MODE is deprecated')
      expect(guide).toContain('DISABLE_WEBSOCKET is deprecated')
      expect(guide).toContain('## New Features Available')
      expect(guide).toContain('## Example Migration')
    })

    it('should generate migration guide for legacy configuration', () => {
      const legacyConfig: LegacyTranscriptionOptions = {
        batchMode: true,
        fallbackEnabled: false
      }

      const guide = generateMigrationGuide(legacyConfig)

      expect(guide).toContain('## Configuration Options')
      expect(guide).toContain('batchMode" option is deprecated')
      expect(guide).toContain('fallbackEnabled" option is deprecated')
    })

    it('should generate basic guide when no legacy usage', () => {
      const guide = generateMigrationGuide()

      expect(guide).toContain('# Gemini Live API Migration Guide')
      expect(guide).toContain('## New Features Available')
      expect(guide).not.toContain('## Environment Variables')
      expect(guide).not.toContain('## Configuration Options')
    })
  })

  describe('checkCompatibilityStatus', () => {
    it('should check compatibility status successfully', async () => {
      process.env.GOOGLE_API_KEY = 'test-key'

      const status = await checkCompatibilityStatus()

      expect(status.isCompatible).toBe(true)
      expect(status.hasLegacyUsage).toBe(false)
      expect(status.errors).toHaveLength(0)
    })

    it('should detect missing API key', async () => {
      const status = await checkCompatibilityStatus()

      expect(status.errors).toContain('No Google API key found in environment variables')
    })

    it('should detect legacy usage and provide recommendations', async () => {
      process.env.GOOGLE_API_KEY = 'test-key'
      process.env.GEMINI_BATCH_MODE = 'true'

      const status = await checkCompatibilityStatus()

      expect(status.hasLegacyUsage).toBe(true)
      expect(status.recommendations).toContain(
        'Consider migrating legacy environment variables to new format'
      )
    })
  })

  describe('LegacyAliases', () => {
    it('should provide legacy function aliases', () => {
      expect(LegacyAliases.transcribeAudioLegacy).toBe('transcribeAudio')
      expect(LegacyAliases.proxyTranscribeLegacy).toBe('transcribeAudioViaProxy')
    })

    it('should create legacy configuration', () => {
      const legacyOptions: LegacyTranscriptionOptions = {
        apiKey: 'test-key',
        batchMode: true
      }

      const newConfig = LegacyAliases.createLegacyConfig(legacyOptions)

      expect(newConfig.apiKey).toBe('test-key')
      expect(newConfig.mode).toBe(TranscriptionMode.BATCH)
    })

    it('should setup legacy environment', () => {
      process.env.GEMINI_BATCH_MODE = 'true'

      const result = LegacyAliases.setupLegacyEnvironment()

      expect(result.migrated.GEMINI_TRANSCRIPTION_MODE).toBe(TranscriptionMode.BATCH)
      expect(result.warnings).toContain(
        'GEMINI_BATCH_MODE is deprecated. Use GEMINI_TRANSCRIPTION_MODE instead.'
      )
    })
  })

  describe('Integration Tests', () => {
    it('should provide seamless backward compatibility for typical legacy usage', () => {
      // Simulate a legacy user upgrading their code
      process.env.GEMINI_BATCH_MODE = 'true'
      process.env.GOOGLE_API_KEY = 'test-key'

      // Their old configuration
      const oldConfig: LegacyTranscriptionOptions = {
        batchMode: true,
        fallbackEnabled: true,
        timeout: 10000
      }

      // Migration should work seamlessly
      const migration = migrateLegacyConfig(oldConfig)

      expect(migration.newConfig.mode).toBe(TranscriptionMode.BATCH)
      expect(migration.newConfig.fallbackToBatch).toBe(true)
      expect(migration.isLegacy).toBe(true)
      expect(migration.warnings.length).toBeGreaterThan(0)
      expect(migration.deprecations.length).toBeGreaterThan(0)
    })

    it('should handle mixed legacy and modern usage', () => {
      const mixedConfig: LegacyTranscriptionOptions = {
        apiKey: 'test-key',
        mode: TranscriptionMode.HYBRID, // They're partially upgraded
        batchMode: true, // But still using legacy options
        fallbackEnabled: false
      }

      const migration = migrateLegacyConfig(mixedConfig)

      // Should still detect as legacy due to presence of legacy options
      expect(migration.isLegacy).toBe(true)
      expect(migration.newConfig.mode).toBe(TranscriptionMode.BATCH) // Legacy takes precedence
    })
  })
})
