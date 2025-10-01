/**
 * Feature Flag Management System for Transcription Loss Prevention
 *
 * Provides centralized, dynamic configuration management for all critical parameters
 * used by the orphan detection, gap detection, and recovery systems. Supports
 * runtime updates without application restart.
 *
 * Features:
 * - Type-safe configuration definitions
 * - Dynamic runtime updates with validation
 * - Event-driven configuration change notifications
 * - Fallback values and validation rules
 * - JSON persistence and loading
 * - Environment variable overrides
 * - Configuration history and rollback
 */

import {EventEmitter} from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'

// ================================================================
// Configuration Type Definitions
// ================================================================

/**
 * Orphan Detection Configuration
 * Controls behavior of OrphanDetectionWorker
 */
export interface OrphanDetectionConfig {
  /** How often to scan for orphans (milliseconds) */
  scanIntervalMs: number
  /** When to consider a partial as stuck (milliseconds) */
  stuckThresholdMs: number
  /** When to consider small partials as trailing (milliseconds) */
  trailingTimeoutMs: number
  /** Minimum character count to not be considered trailing */
  trailingMinChars: number
  /** Maximum orphans to process per scan */
  maxOrphansPerScan: number
  /** Enable aggressive orphan detection */
  aggressiveDetection: boolean
  /** Enable orphan detection worker */
  enabled: boolean
}

/**
 * Gap Detection Configuration
 * Controls behavior of GapDetector
 */
export interface GapDetectionConfig {
  /** Minimum gap in timestamps to trigger detection (milliseconds) */
  timestampGapThresholdMs: number
  /** Maximum acceptable silence period (milliseconds) */
  maxSilencePeriodMs: number
  /** Minimum audio duration to analyze (milliseconds) */
  minAudioDurationMs: number
  /** Speech detection confidence threshold (0.0 - 1.0) */
  speechConfidenceThreshold: number
  /** Audio alignment tolerance (milliseconds) */
  audioAlignmentToleranceMs: number
  /** Enable advanced speech pattern analysis */
  enableSpeechPatternAnalysis: boolean
  /** Enable audio alignment detection */
  enableAudioAlignment: boolean
  /** Enable gap detection */
  enabled: boolean
}

/**
 * Recovery Management Configuration
 * Controls behavior of RecoveryManager
 */
export interface RecoveryConfig {
  /** Maximum recovery attempts per issue */
  maxRecoveryAttempts: number
  /** Timeout for individual recovery operations (milliseconds) */
  recoveryTimeoutMs: number
  /** Delay between recovery attempts (milliseconds) */
  retryDelayMs: number
  /** Enable exponential backoff for retries */
  exponentialBackoff: boolean
  /** Maximum backoff delay (milliseconds) */
  maxBackoffDelayMs: number
  /** Enable context reconstruction recovery */
  enableContextReconstruction: boolean
  /** Enable session restart recovery */
  enableSessionRestart: boolean
  /** Enable forced finalization recovery */
  enableForcedFinalization: boolean
  /** Enable recovery operations */
  enabled: boolean
}

/**
 * Telemetry Configuration
 * Controls behavior of TelemetryCoordinator
 */
export interface TelemetryConfig {
  /** Maximum events to keep in memory */
  maxEventHistory: number
  /** How often to aggregate statistics (milliseconds) */
  aggregationIntervalMs: number
  /** How often to export telemetry data (milliseconds) */
  exportIntervalMs: number
  /** Minimum log level for events */
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'critical'
  /** Enable debug event logging */
  enableDebugEvents: boolean
  /** Enable performance metrics collection */
  enablePerformanceMetrics: boolean
  /** Enable automatic reporting */
  enableAutoReporting: boolean
  /** Enable telemetry collection */
  enabled: boolean
}

/**
 * Complete Feature Flag Configuration
 * Combines all subsystem configurations
 */
export interface FeatureFlagConfig {
  orphanDetection: OrphanDetectionConfig
  gapDetection: GapDetectionConfig
  recovery: RecoveryConfig
  telemetry: TelemetryConfig
  /** Global feature flag system settings */
  system: {
    /** Enable configuration auto-save */
    autoSave: boolean
    /** Configuration file save interval (milliseconds) */
    saveIntervalMs: number
    /** Enable configuration validation */
    enableValidation: boolean
    /** Enable environment variable overrides */
    enableEnvOverrides: boolean
    /** Configuration file path */
    configFilePath: string
  }
}

// ================================================================
// Default Configuration Values
// ================================================================

export const DEFAULT_ORPHAN_DETECTION_CONFIG: OrphanDetectionConfig = {
  scanIntervalMs: 2000,
  stuckThresholdMs: 4000,
  trailingTimeoutMs: 3000,
  trailingMinChars: 150,
  maxOrphansPerScan: 10,
  aggressiveDetection: false,
  enabled: true
}

export const DEFAULT_GAP_DETECTION_CONFIG: GapDetectionConfig = {
  timestampGapThresholdMs: 1500,
  maxSilencePeriodMs: 2000,
  minAudioDurationMs: 500,
  speechConfidenceThreshold: 0.7,
  audioAlignmentToleranceMs: 300,
  enableSpeechPatternAnalysis: true,
  enableAudioAlignment: true,
  enabled: true
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRecoveryAttempts: 3,
  recoveryTimeoutMs: 5000,
  retryDelayMs: 1000,
  exponentialBackoff: true,
  maxBackoffDelayMs: 8000,
  enableContextReconstruction: true,
  enableSessionRestart: true,
  enableForcedFinalization: true,
  enabled: true
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  maxEventHistory: 1000,
  aggregationIntervalMs: 30000,
  exportIntervalMs: 300000,
  logLevel: 'info',
  enableDebugEvents: false,
  enablePerformanceMetrics: true,
  enableAutoReporting: true,
  enabled: true
}

export const DEFAULT_FEATURE_FLAG_CONFIG: FeatureFlagConfig = {
  orphanDetection: DEFAULT_ORPHAN_DETECTION_CONFIG,
  gapDetection: DEFAULT_GAP_DETECTION_CONFIG,
  recovery: DEFAULT_RECOVERY_CONFIG,
  telemetry: DEFAULT_TELEMETRY_CONFIG,
  system: {
    autoSave: true,
    saveIntervalMs: 60000,
    enableValidation: true,
    enableEnvOverrides: true,
    configFilePath: './config/feature-flags.json'
  }
}

// ================================================================
// Validation Rules
// ================================================================

export interface ValidationRule<T> {
  field: keyof T
  validate: (value: unknown) => boolean
  errorMessage: string
  transform?: (value: unknown) => unknown
}

export const ORPHAN_DETECTION_VALIDATION: ValidationRule<OrphanDetectionConfig>[] = [
  {
    field: 'scanIntervalMs',
    validate: v => typeof v === 'number' && v >= 1000 && v <= 60000,
    errorMessage: 'scanIntervalMs must be between 1000 and 60000 milliseconds'
  },
  {
    field: 'stuckThresholdMs',
    validate: v => typeof v === 'number' && v >= 1000 && v <= 30000,
    errorMessage: 'stuckThresholdMs must be between 1000 and 30000 milliseconds'
  },
  {
    field: 'trailingTimeoutMs',
    validate: v => typeof v === 'number' && v >= 1000 && v <= 15000,
    errorMessage: 'trailingTimeoutMs must be between 1000 and 15000 milliseconds'
  },
  {
    field: 'trailingMinChars',
    validate: v => typeof v === 'number' && v >= 10 && v <= 1000,
    errorMessage: 'trailingMinChars must be between 10 and 1000 characters'
  },
  {
    field: 'maxOrphansPerScan',
    validate: v => typeof v === 'number' && v >= 1 && v <= 100,
    errorMessage: 'maxOrphansPerScan must be between 1 and 100'
  }
]

export const GAP_DETECTION_VALIDATION: ValidationRule<GapDetectionConfig>[] = [
  {
    field: 'timestampGapThresholdMs',
    validate: v => typeof v === 'number' && v >= 500 && v <= 10000,
    errorMessage: 'timestampGapThresholdMs must be between 500 and 10000 milliseconds'
  },
  {
    field: 'maxSilencePeriodMs',
    validate: v => typeof v === 'number' && v >= 1000 && v <= 30000,
    errorMessage: 'maxSilencePeriodMs must be between 1000 and 30000 milliseconds'
  },
  {
    field: 'minAudioDurationMs',
    validate: v => typeof v === 'number' && v >= 100 && v <= 5000,
    errorMessage: 'minAudioDurationMs must be between 100 and 5000 milliseconds'
  },
  {
    field: 'speechConfidenceThreshold',
    validate: v => typeof v === 'number' && v >= 0.1 && v <= 1.0,
    errorMessage: 'speechConfidenceThreshold must be between 0.1 and 1.0'
  },
  {
    field: 'audioAlignmentToleranceMs',
    validate: v => typeof v === 'number' && v >= 50 && v <= 2000,
    errorMessage: 'audioAlignmentToleranceMs must be between 50 and 2000 milliseconds'
  }
]

export const RECOVERY_VALIDATION: ValidationRule<RecoveryConfig>[] = [
  {
    field: 'maxRecoveryAttempts',
    validate: v => typeof v === 'number' && v >= 1 && v <= 10,
    errorMessage: 'maxRecoveryAttempts must be between 1 and 10'
  },
  {
    field: 'recoveryTimeoutMs',
    validate: v => typeof v === 'number' && v >= 1000 && v <= 30000,
    errorMessage: 'recoveryTimeoutMs must be between 1000 and 30000 milliseconds'
  },
  {
    field: 'retryDelayMs',
    validate: v => typeof v === 'number' && v >= 100 && v <= 10000,
    errorMessage: 'retryDelayMs must be between 100 and 10000 milliseconds'
  },
  {
    field: 'maxBackoffDelayMs',
    validate: v => typeof v === 'number' && v >= 1000 && v <= 60000,
    errorMessage: 'maxBackoffDelayMs must be between 1000 and 60000 milliseconds'
  }
]

export const TELEMETRY_VALIDATION: ValidationRule<TelemetryConfig>[] = [
  {
    field: 'maxEventHistory',
    validate: v => typeof v === 'number' && v >= 100 && v <= 10000,
    errorMessage: 'maxEventHistory must be between 100 and 10000'
  },
  {
    field: 'aggregationIntervalMs',
    validate: v => typeof v === 'number' && v >= 5000 && v <= 300000,
    errorMessage: 'aggregationIntervalMs must be between 5000 and 300000 milliseconds'
  },
  {
    field: 'exportIntervalMs',
    validate: v => typeof v === 'number' && v >= 60000 && v <= 3600000,
    errorMessage: 'exportIntervalMs must be between 60000 and 3600000 milliseconds'
  },
  {
    field: 'logLevel',
    validate: v => ['debug', 'info', 'warn', 'error', 'critical'].includes(v),
    errorMessage: 'logLevel must be one of: debug, info, warn, error, critical'
  }
]

// ================================================================
// Feature Flag Manager Events
// ================================================================

export interface FeatureFlagEvents {
  'config:updated': (section: keyof FeatureFlagConfig, config: unknown) => void
  'config:validated': (section: keyof FeatureFlagConfig, isValid: boolean, errors: string[]) => void
  'config:saved': (filePath: string, config: FeatureFlagConfig) => void
  'config:loaded': (filePath: string, config: FeatureFlagConfig) => void
  'config:error': (error: Error, context: string) => void
  'env:override': (key: string, value: unknown, originalValue: unknown) => void
}

// ================================================================
// Feature Flag Manager Implementation
// ================================================================

export class FeatureFlagManager extends EventEmitter {
  private config: FeatureFlagConfig
  private configHistory: FeatureFlagConfig[] = []
  private saveTimer?: NodeJS.Timeout
  private isInitialized = false
  private readonly maxHistorySize = 10

  constructor(initialConfig?: Partial<FeatureFlagConfig>) {
    super()
    this.config = this.mergeConfigs(DEFAULT_FEATURE_FLAG_CONFIG, initialConfig || {})
  }

  // ================================================================
  // Initialization and Lifecycle
  // ================================================================

  /**
   * Initialize the feature flag manager
   */
  async initialize(): Promise<void> {
    try {
      // Load configuration from file if it exists
      await this.loadConfig()

      // Apply environment variable overrides
      if (this.config.system.enableEnvOverrides) {
        this.applyEnvironmentOverrides()
      }

      // Start auto-save timer if enabled
      if (this.config.system.autoSave) {
        this.startAutoSave()
      }

      this.isInitialized = true
      console.log('FeatureFlagManager: Initialized successfully')
    } catch (error) {
      console.error('FeatureFlagManager: Failed to initialize:', error)
      this.emit('config:error', error as Error, 'initialization')
      throw error
    }
  }

  /**
   * Shutdown the feature flag manager
   */
  async shutdown(): Promise<void> {
    try {
      // Save current configuration
      if (this.config.system.autoSave) {
        await this.saveConfig()
      }

      // Clear auto-save timer
      if (this.saveTimer) {
        clearInterval(this.saveTimer)
        this.saveTimer = undefined
      }

      this.isInitialized = false
      console.log('FeatureFlagManager: Shut down successfully')
    } catch (error) {
      console.error('FeatureFlagManager: Error during shutdown:', error)
      this.emit('config:error', error as Error, 'shutdown')
    }
  }

  // ================================================================
  // Configuration Access Methods
  // ================================================================

  /**
   * Get complete configuration
   */
  getConfig(): FeatureFlagConfig {
    return JSON.parse(JSON.stringify(this.config))
  }

  /**
   * Get orphan detection configuration
   */
  getOrphanDetectionConfig(): OrphanDetectionConfig {
    return JSON.parse(JSON.stringify(this.config.orphanDetection))
  }

  /**
   * Get gap detection configuration
   */
  getGapDetectionConfig(): GapDetectionConfig {
    return JSON.parse(JSON.stringify(this.config.gapDetection))
  }

  /**
   * Get recovery configuration
   */
  getRecoveryConfig(): RecoveryConfig {
    return JSON.parse(JSON.stringify(this.config.recovery))
  }

  /**
   * Get telemetry configuration
   */
  getTelemetryConfig(): TelemetryConfig {
    return JSON.parse(JSON.stringify(this.config.telemetry))
  }

  // ================================================================
  // Configuration Update Methods
  // ================================================================

  /**
   * Update orphan detection configuration
   */
  async updateOrphanDetectionConfig(updates: Partial<OrphanDetectionConfig>): Promise<void> {
    const newConfig = {...this.config.orphanDetection, ...updates}

    if (this.config.system.enableValidation) {
      const validationResult = this.validateConfig('orphanDetection', newConfig)
      if (!validationResult.isValid) {
        throw new Error(
          `Orphan detection config validation failed: ${validationResult.errors.join(', ')}`
        )
      }
    }

    this.addToHistory()
    this.config.orphanDetection = newConfig
    this.emit('config:updated', 'orphanDetection', newConfig)

    if (this.config.system.autoSave) {
      await this.saveConfig()
    }
  }

  /**
   * Update gap detection configuration
   */
  async updateGapDetectionConfig(updates: Partial<GapDetectionConfig>): Promise<void> {
    const newConfig = {...this.config.gapDetection, ...updates}

    if (this.config.system.enableValidation) {
      const validationResult = this.validateConfig('gapDetection', newConfig)
      if (!validationResult.isValid) {
        throw new Error(
          `Gap detection config validation failed: ${validationResult.errors.join(', ')}`
        )
      }
    }

    this.addToHistory()
    this.config.gapDetection = newConfig
    this.emit('config:updated', 'gapDetection', newConfig)

    if (this.config.system.autoSave) {
      await this.saveConfig()
    }
  }

  /**
   * Update recovery configuration
   */
  async updateRecoveryConfig(updates: Partial<RecoveryConfig>): Promise<void> {
    const newConfig = {...this.config.recovery, ...updates}

    if (this.config.system.enableValidation) {
      const validationResult = this.validateConfig('recovery', newConfig)
      if (!validationResult.isValid) {
        throw new Error(`Recovery config validation failed: ${validationResult.errors.join(', ')}`)
      }
    }

    this.addToHistory()
    this.config.recovery = newConfig
    this.emit('config:updated', 'recovery', newConfig)

    if (this.config.system.autoSave) {
      await this.saveConfig()
    }
  }

  /**
   * Update telemetry configuration
   */
  async updateTelemetryConfig(updates: Partial<TelemetryConfig>): Promise<void> {
    const newConfig = {...this.config.telemetry, ...updates}

    if (this.config.system.enableValidation) {
      const validationResult = this.validateConfig('telemetry', newConfig)
      if (!validationResult.isValid) {
        throw new Error(`Telemetry config validation failed: ${validationResult.errors.join(', ')}`)
      }
    }

    this.addToHistory()
    this.config.telemetry = newConfig
    this.emit('config:updated', 'telemetry', newConfig)

    if (this.config.system.autoSave) {
      await this.saveConfig()
    }
  }

  /**
   * Bulk update configuration
   */
  async updateConfig(updates: Partial<FeatureFlagConfig>): Promise<void> {
    const newConfig = this.mergeConfigs(this.config, updates)

    if (this.config.system.enableValidation) {
      const allValidationResults = this.validateAllConfigs(newConfig)
      const hasErrors = Object.values(allValidationResults).some(result => !result.isValid)

      if (hasErrors) {
        const allErrors = Object.entries(allValidationResults)
          .filter(([, result]) => !result.isValid)
          .map(([section, result]) => `${section}: ${result.errors.join(', ')}`)
          .join('; ')
        throw new Error(`Configuration validation failed: ${allErrors}`)
      }
    }

    this.addToHistory()
    this.config = newConfig

    // Emit events for all updated sections
    if (updates.orphanDetection) {
      this.emit('config:updated', 'orphanDetection', newConfig.orphanDetection)
    }
    if (updates.gapDetection) {
      this.emit('config:updated', 'gapDetection', newConfig.gapDetection)
    }
    if (updates.recovery) {
      this.emit('config:updated', 'recovery', newConfig.recovery)
    }
    if (updates.telemetry) {
      this.emit('config:updated', 'telemetry', newConfig.telemetry)
    }

    if (this.config.system.autoSave) {
      await this.saveConfig()
    }
  }

  // ================================================================
  // Configuration Persistence
  // ================================================================

  /**
   * Save configuration to file
   */
  async saveConfig(): Promise<void> {
    try {
      const configDir = path.dirname(this.config.system.configFilePath)

      // Ensure config directory exists
      try {
        await fs.mkdir(configDir, {recursive: true})
      } catch {
        // Directory might already exist, ignore error
      }

      // Save configuration with pretty formatting
      const configJson = JSON.stringify(this.config, null, 2)
      await fs.writeFile(this.config.system.configFilePath, configJson, 'utf-8')

      this.emit('config:saved', this.config.system.configFilePath, this.config)
      console.log(`FeatureFlagManager: Configuration saved to ${this.config.system.configFilePath}`)
    } catch (error) {
      console.error('FeatureFlagManager: Failed to save configuration:', error)
      this.emit('config:error', error as Error, 'save')
      throw error
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<void> {
    try {
      const configExists = await fs.access(this.config.system.configFilePath).then(
        () => true,
        () => false
      )

      if (!configExists) {
        console.log(
          `FeatureFlagManager: No config file found at ${this.config.system.configFilePath}, using defaults`
        )
        return
      }

      const configData = await fs.readFile(this.config.system.configFilePath, 'utf-8')
      const loadedConfig = JSON.parse(configData)

      // Merge with defaults to ensure all required fields are present
      this.config = this.mergeConfigs(DEFAULT_FEATURE_FLAG_CONFIG, loadedConfig)

      this.emit('config:loaded', this.config.system.configFilePath, this.config)
      console.log(
        `FeatureFlagManager: Configuration loaded from ${this.config.system.configFilePath}`
      )
    } catch (error) {
      console.error('FeatureFlagManager: Failed to load configuration:', error)
      this.emit('config:error', error as Error, 'load')
      // Don't throw here - fall back to defaults
    }
  }

  // ================================================================
  // Environment Variable Overrides
  // ================================================================

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(): void {
    const envMappings: Record<string, [keyof FeatureFlagConfig, string, (v: string) => unknown]> = {
      // Orphan Detection
      ORPHAN_SCAN_INTERVAL_MS: ['orphanDetection', 'scanIntervalMs', parseInt],
      ORPHAN_STUCK_THRESHOLD_MS: ['orphanDetection', 'stuckThresholdMs', parseInt],
      ORPHAN_TRAILING_TIMEOUT_MS: ['orphanDetection', 'trailingTimeoutMs', parseInt],
      ORPHAN_TRAILING_MIN_CHARS: ['orphanDetection', 'trailingMinChars', parseInt],
      ORPHAN_MAX_PER_SCAN: ['orphanDetection', 'maxOrphansPerScan', parseInt],
      ORPHAN_AGGRESSIVE_DETECTION: [
        'orphanDetection',
        'aggressiveDetection',
        (v: string) => v.toLowerCase() === 'true'
      ],
      ORPHAN_DETECTION_ENABLED: [
        'orphanDetection',
        'enabled',
        (v: string) => v.toLowerCase() === 'true'
      ],

      // Gap Detection
      GAP_TIMESTAMP_THRESHOLD_MS: ['gapDetection', 'timestampGapThresholdMs', parseInt],
      GAP_MAX_SILENCE_MS: ['gapDetection', 'maxSilencePeriodMs', parseInt],
      GAP_MIN_AUDIO_MS: ['gapDetection', 'minAudioDurationMs', parseInt],
      GAP_SPEECH_CONFIDENCE: ['gapDetection', 'speechConfidenceThreshold', parseFloat],
      GAP_AUDIO_TOLERANCE_MS: ['gapDetection', 'audioAlignmentToleranceMs', parseInt],
      GAP_SPEECH_ANALYSIS_ENABLED: [
        'gapDetection',
        'enableSpeechPatternAnalysis',
        (v: string) => v.toLowerCase() === 'true'
      ],
      GAP_AUDIO_ALIGNMENT_ENABLED: [
        'gapDetection',
        'enableAudioAlignment',
        (v: string) => v.toLowerCase() === 'true'
      ],
      GAP_DETECTION_ENABLED: ['gapDetection', 'enabled', (v: string) => v.toLowerCase() === 'true'],

      // Recovery
      RECOVERY_MAX_ATTEMPTS: ['recovery', 'maxRecoveryAttempts', parseInt],
      RECOVERY_TIMEOUT_MS: ['recovery', 'recoveryTimeoutMs', parseInt],
      RECOVERY_RETRY_DELAY_MS: ['recovery', 'retryDelayMs', parseInt],
      RECOVERY_EXPONENTIAL_BACKOFF: [
        'recovery',
        'exponentialBackoff',
        (v: string) => v.toLowerCase() === 'true'
      ],
      RECOVERY_MAX_BACKOFF_MS: ['recovery', 'maxBackoffDelayMs', parseInt],
      RECOVERY_CONTEXT_RECONSTRUCTION: [
        'recovery',
        'enableContextReconstruction',
        (v: string) => v.toLowerCase() === 'true'
      ],
      RECOVERY_SESSION_RESTART: [
        'recovery',
        'enableSessionRestart',
        (v: string) => v.toLowerCase() === 'true'
      ],
      RECOVERY_FORCED_FINALIZATION: [
        'recovery',
        'enableForcedFinalization',
        (v: string) => v.toLowerCase() === 'true'
      ],
      RECOVERY_ENABLED: ['recovery', 'enabled', (v: string) => v.toLowerCase() === 'true'],

      // Telemetry
      TELEMETRY_MAX_EVENTS: ['telemetry', 'maxEventHistory', parseInt],
      TELEMETRY_AGGREGATION_MS: ['telemetry', 'aggregationIntervalMs', parseInt],
      TELEMETRY_EXPORT_MS: ['telemetry', 'exportIntervalMs', parseInt],
      TELEMETRY_LOG_LEVEL: ['telemetry', 'logLevel', String],
      TELEMETRY_DEBUG_EVENTS: [
        'telemetry',
        'enableDebugEvents',
        (v: string) => v.toLowerCase() === 'true'
      ],
      TELEMETRY_PERFORMANCE_METRICS: [
        'telemetry',
        'enablePerformanceMetrics',
        (v: string) => v.toLowerCase() === 'true'
      ],
      TELEMETRY_AUTO_REPORTING: [
        'telemetry',
        'enableAutoReporting',
        (v: string) => v.toLowerCase() === 'true'
      ],
      TELEMETRY_ENABLED: ['telemetry', 'enabled', (v: string) => v.toLowerCase() === 'true']
    }

    for (const [envKey, [section, field, transform]] of Object.entries(envMappings)) {
      const envValue = process.env[envKey]
      if (envValue !== undefined) {
        try {
          const configSection = this.config[section] as Record<string, unknown>
          const originalValue = configSection[field]
          const transformedValue = transform(envValue)
          configSection[field] = transformedValue
          this.emit('env:override', `${String(section)}.${field}`, transformedValue, originalValue)
          console.log(
            `FeatureFlagManager: Applied env override ${envKey}: ${originalValue} -> ${transformedValue}`
          )
        } catch (error) {
          console.error(`FeatureFlagManager: Failed to apply env override ${envKey}:`, error)
        }
      }
    }
  }

  // ================================================================
  // Validation Methods
  // ================================================================

  /**
   * Validate configuration section
   */
  private validateConfig(section: string, config: unknown): {isValid: boolean; errors: string[]} {
    const validationRules = this.getValidationRules(section)
    const errors: string[] = []

    for (const rule of validationRules) {
      const value = (config as Record<string, unknown>)[rule.field]
      if (!rule.validate(value)) {
        errors.push(rule.errorMessage)
      }
    }

    const isValid = errors.length === 0
    this.emit('config:validated', section as keyof FeatureFlagConfig, isValid, errors)

    return {isValid, errors}
  }

  /**
   * Validate all configuration sections
   */
  private validateAllConfigs(
    config: FeatureFlagConfig
  ): Record<string, {isValid: boolean; errors: string[]}> {
    return {
      orphanDetection: this.validateConfig('orphanDetection', config.orphanDetection),
      gapDetection: this.validateConfig('gapDetection', config.gapDetection),
      recovery: this.validateConfig('recovery', config.recovery),
      telemetry: this.validateConfig('telemetry', config.telemetry)
    }
  }

  /**
   * Get validation rules for a configuration section
   */
  private getValidationRules(section: string): ValidationRule<unknown>[] {
    switch (section) {
      case 'orphanDetection':
        return ORPHAN_DETECTION_VALIDATION
      case 'gapDetection':
        return GAP_DETECTION_VALIDATION
      case 'recovery':
        return RECOVERY_VALIDATION
      case 'telemetry':
        return TELEMETRY_VALIDATION
      default:
        return []
    }
  }

  // ================================================================
  // History Management
  // ================================================================

  /**
   * Add current configuration to history
   */
  private addToHistory(): void {
    this.configHistory.push(JSON.parse(JSON.stringify(this.config)))

    // Maintain history size limit
    if (this.configHistory.length > this.maxHistorySize) {
      this.configHistory.shift()
    }
  }

  /**
   * Get configuration history
   */
  getConfigHistory(): FeatureFlagConfig[] {
    return JSON.parse(JSON.stringify(this.configHistory))
  }

  /**
   * Rollback to previous configuration
   */
  async rollbackConfig(steps = 1): Promise<void> {
    if (this.configHistory.length < steps) {
      throw new Error(
        `Cannot rollback ${steps} steps, only ${this.configHistory.length} configurations in history`
      )
    }

    const targetIndex = this.configHistory.length - steps
    const targetConfig = this.configHistory[targetIndex]

    this.config = JSON.parse(JSON.stringify(targetConfig))

    // Remove rolled-back configurations from history
    this.configHistory = this.configHistory.slice(0, targetIndex)

    // Emit events for all sections
    this.emit('config:updated', 'orphanDetection', this.config.orphanDetection)
    this.emit('config:updated', 'gapDetection', this.config.gapDetection)
    this.emit('config:updated', 'recovery', this.config.recovery)
    this.emit('config:updated', 'telemetry', this.config.telemetry)

    if (this.config.system.autoSave) {
      await this.saveConfig()
    }

    console.log(`FeatureFlagManager: Rolled back configuration ${steps} step(s)`)
  }

  // ================================================================
  // Auto-Save Management
  // ================================================================

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer)
    }

    this.saveTimer = setInterval(async () => {
      try {
        await this.saveConfig()
      } catch (error) {
        console.error('FeatureFlagManager: Auto-save failed:', error)
      }
    }, this.config.system.saveIntervalMs)
  }

  // ================================================================
  // Utility Methods
  // ================================================================

  /**
   * Deep merge configuration objects
   */
  private mergeConfigs(
    target: FeatureFlagConfig,
    source: Partial<FeatureFlagConfig>
  ): FeatureFlagConfig {
    const result = JSON.parse(JSON.stringify(target))

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = (source as Record<string, unknown>)[key]
        if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
          result[key] = {...result[key], ...sourceValue}
        } else if (sourceValue !== undefined) {
          result[key] = sourceValue
        }
      }
    }

    return result
  }

  /**
   * Get system information
   */
  getSystemInfo() {
    return {
      isInitialized: this.isInitialized,
      configFilePath: this.config.system.configFilePath,
      autoSaveEnabled: this.config.system.autoSave,
      validationEnabled: this.config.system.enableValidation,
      envOverridesEnabled: this.config.system.enableEnvOverrides,
      historySize: this.configHistory.length,
      maxHistorySize: this.maxHistorySize
    }
  }
}

// ================================================================
// Singleton Instance
// ================================================================

let featureFlagManagerInstance: FeatureFlagManager | null = null

/**
 * Get singleton instance of FeatureFlagManager
 */
export function getFeatureFlagManager(): FeatureFlagManager {
  if (!featureFlagManagerInstance) {
    featureFlagManagerInstance = new FeatureFlagManager()
  }
  return featureFlagManagerInstance
}

/**
 * Initialize singleton instance with custom config
 */
export async function initializeFeatureFlagManager(
  config?: Partial<FeatureFlagConfig>
): Promise<FeatureFlagManager> {
  if (featureFlagManagerInstance) {
    await featureFlagManagerInstance.shutdown()
  }

  featureFlagManagerInstance = new FeatureFlagManager(config)
  await featureFlagManagerInstance.initialize()

  return featureFlagManagerInstance
}

/**
 * Shutdown singleton instance
 */
export async function shutdownFeatureFlagManager(): Promise<void> {
  if (featureFlagManagerInstance) {
    await featureFlagManagerInstance.shutdown()
    featureFlagManagerInstance = null
  }
}
