/**
 * Enhanced Transcription Configuration Manager
 *
 * Provides centralized configuration management for the enhanced transcription system.
 * Supports runtime configuration updates, validation, and persistence.
 */

import {EnhancedRouterConfiguration} from './EnhancedTranscriptionRouter'

export interface TranscriptionDisplayConfig {
  // Display behavior
  showPartialResults: boolean
  retainFinalizedText: boolean
  autoScroll: boolean
  fadeInAnimation: boolean

  // Buffer settings
  maxTextLength: number
  maxSegments: number
  segmentRetentionDuration: number // milliseconds

  // Visual settings
  fontSize: number
  lineHeight: number
  textColor: string
  backgroundColor: string
  highlightColor: string

  // Accessibility
  enableScreenReader: boolean
  enableHighContrast: boolean
  enableReducedMotion: boolean
}

export interface TranscriptionBehaviorConfig {
  // Text processing
  enableTextCorrection: boolean
  enablePunctuation: boolean
  enableCapitalization: boolean
  filterProfanity: boolean

  // Timing
  partialResultDelay: number // milliseconds before showing partial results
  finalizationDelay: number // milliseconds before finalizing text
  gapTolerance: number // maximum gap before starting new segment

  // Quality settings
  minimumConfidence: number // 0-1, minimum confidence to display
  enableConfidenceIndicators: boolean
  enableQualityFiltering: boolean
}

export interface TranscriptionIntegrationConfig {
  // Router settings
  enableEnhancedRouter: boolean
  routerDebugMode: boolean
  fallbackToLegacy: boolean

  // WebSocket settings
  enableWebSocketPriority: boolean
  enableAutoRouting: boolean
  queueNonWebSocketStreaming: boolean
  maxQueueSize: number

  // Service integration
  transcriptionService: 'gemini' | 'whisper' | 'auto'
  enableMultiWindowSync: boolean
  enableTelemetry: boolean
}

export interface CompleteTranscriptionConfig {
  display: TranscriptionDisplayConfig
  behavior: TranscriptionBehaviorConfig
  integration: TranscriptionIntegrationConfig
  router: EnhancedRouterConfiguration
}

export class TranscriptionConfigManager {
  private config: CompleteTranscriptionConfig
  private listeners: Array<(config: CompleteTranscriptionConfig) => void> = []
  private storageKey = 'enhanced-transcription-config'

  constructor(initialConfig?: Partial<CompleteTranscriptionConfig>) {
    this.config = this.mergeWithDefaults(initialConfig || {})
    this.loadFromStorage()
  }

  /**
   * Get default configuration
   */
  private getDefaults(): CompleteTranscriptionConfig {
    return {
      display: {
        showPartialResults: true,
        retainFinalizedText: true,
        autoScroll: true,
        fadeInAnimation: true,
        maxTextLength: 10000,
        maxSegments: 1000,
        segmentRetentionDuration: 300000, // 5 minutes
        fontSize: 16,
        lineHeight: 1.5,
        textColor: '#000000',
        backgroundColor: '#ffffff',
        highlightColor: '#0066cc',
        enableScreenReader: true,
        enableHighContrast: false,
        enableReducedMotion: false
      },
      behavior: {
        enableTextCorrection: true,
        enablePunctuation: true,
        enableCapitalization: true,
        filterProfanity: false,
        partialResultDelay: 100,
        finalizationDelay: 2000,
        gapTolerance: 3000,
        minimumConfidence: 0.6,
        enableConfidenceIndicators: true,
        enableQualityFiltering: true
      },
      integration: {
        enableEnhancedRouter: true,
        routerDebugMode: false,
        fallbackToLegacy: true,
        enableWebSocketPriority: true,
        enableAutoRouting: true,
        queueNonWebSocketStreaming: true,
        maxQueueSize: 10,
        transcriptionService: 'auto',
        enableMultiWindowSync: true,
        enableTelemetry: true
      },
      router: {
        // Base router config
        enableWebSocketPriority: true,
        enableAutoRouting: true,
        fallbackToStatic: true,
        queueNonWebSocketStreaming: true,
        maxQueueSize: 10,
        routingDebugMode: false,

        // Enhanced features
        enablePerformanceOptimization: true,
        enableTimestampTracking: true,
        enableGapDetection: true,
        enableVirtualScrolling: true,
        enablePerformanceMonitoring: true,

        // Buffer configuration
        maxBufferSize: 1000,
        segmentRetentionTime: 300000,
        partialResultTimeout: 5000,

        // Performance thresholds
        maxRenderTime: 16,
        maxMemoryUsage: 100,
        minFrameRate: 30,

        // Gap detection settings
        gapDetectionThreshold: 1000,
        maxAcceptableGap: 5000,
        enableAdaptiveGapDetection: true,

        // Integration settings
        fallbackToLegacyRenderer: true,
        enableHybridMode: true,
        legacyCompatibilityMode: false
      }
    }
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(
    userConfig: Partial<CompleteTranscriptionConfig>
  ): CompleteTranscriptionConfig {
    const defaults = this.getDefaults()

    return {
      display: {...defaults.display, ...userConfig.display},
      behavior: {...defaults.behavior, ...userConfig.behavior},
      integration: {...defaults.integration, ...userConfig.integration},
      router: {...defaults.router, ...userConfig.router}
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): CompleteTranscriptionConfig {
    return JSON.parse(JSON.stringify(this.config)) // Deep clone
  }

  /**
   * Get specific section of configuration
   */
  getDisplayConfig(): TranscriptionDisplayConfig {
    return {...this.config.display}
  }

  getBehaviorConfig(): TranscriptionBehaviorConfig {
    return {...this.config.behavior}
  }

  getIntegrationConfig(): TranscriptionIntegrationConfig {
    return {...this.config.integration}
  }

  getRouterConfig(): EnhancedRouterConfiguration {
    return {...this.config.router}
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CompleteTranscriptionConfig>): void {
    const newConfig = this.mergeWithDefaults({
      ...this.config,
      ...updates
    })

    if (this.validateConfig(newConfig)) {
      this.config = newConfig
      this.saveToStorage()
      this.notifyListeners()
    } else {
      throw new Error('Invalid configuration provided')
    }
  }

  /**
   * Update specific configuration section
   */
  updateDisplayConfig(updates: Partial<TranscriptionDisplayConfig>): void {
    this.updateConfig({
      display: {...this.config.display, ...updates}
    })
  }

  updateBehaviorConfig(updates: Partial<TranscriptionBehaviorConfig>): void {
    this.updateConfig({
      behavior: {...this.config.behavior, ...updates}
    })
  }

  updateIntegrationConfig(updates: Partial<TranscriptionIntegrationConfig>): void {
    this.updateConfig({
      integration: {...this.config.integration, ...updates}
    })
  }

  updateRouterConfig(updates: Partial<EnhancedRouterConfiguration>): void {
    this.updateConfig({
      router: {...this.config.router, ...updates}
    })
  }

  /**
   * Reset to defaults
   */
  resetToDefaults(): void {
    this.config = this.getDefaults()
    this.saveToStorage()
    this.notifyListeners()
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: CompleteTranscriptionConfig): boolean {
    try {
      // Validate display config
      if (config.display.fontSize < 8 || config.display.fontSize > 72) return false
      if (config.display.lineHeight < 1 || config.display.lineHeight > 3) return false
      if (config.display.maxSegments < 1 || config.display.maxSegments > 10000) return false

      // Validate behavior config
      if (config.behavior.minimumConfidence < 0 || config.behavior.minimumConfidence > 1)
        return false
      if (config.behavior.partialResultDelay < 0 || config.behavior.partialResultDelay > 5000)
        return false
      if (config.behavior.finalizationDelay < 0 || config.behavior.finalizationDelay > 30000)
        return false

      // Validate router config
      if (config.router.maxBufferSize < 1 || config.router.maxBufferSize > 10000) return false
      if (config.router.maxRenderTime < 1 || config.router.maxRenderTime > 1000) return false
      if (config.router.maxMemoryUsage < 1 || config.router.maxMemoryUsage > 1000) return false

      return true
    } catch (error) {
      console.error('Configuration validation error:', error)
      return false
    }
  }

  /**
   * Add configuration change listener
   */
  addListener(listener: (config: CompleteTranscriptionConfig) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Remove configuration change listener
   */
  removeListener(listener: (config: CompleteTranscriptionConfig) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * Notify all listeners of configuration changes
   */
  private notifyListeners(): void {
    const configCopy = this.getConfig()
    this.listeners.forEach(listener => {
      try {
        listener(configCopy)
      } catch (error) {
        console.error('Error in configuration listener:', error)
      }
    })
  }

  /**
   * Save configuration to localStorage
   */
  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.config))
      }
    } catch (error) {
      console.error('Failed to save configuration to storage:', error)
    }
  }

  /**
   * Load configuration from localStorage
   */
  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKey)
        if (stored) {
          const parsedConfig = JSON.parse(stored)
          if (this.validateConfig(parsedConfig)) {
            this.config = parsedConfig
          }
        }
      }
    } catch (error) {
      console.error('Failed to load configuration from storage:', error)
    }
  }

  /**
   * Export configuration as JSON
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2)
  }

  /**
   * Import configuration from JSON
   */
  importConfig(configJson: string): void {
    try {
      const imported = JSON.parse(configJson)
      if (this.validateConfig(imported)) {
        this.config = imported
        this.saveToStorage()
        this.notifyListeners()
      } else {
        throw new Error('Invalid configuration format')
      }
    } catch (error) {
      throw new Error(
        `Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get configuration schema for documentation
   */
  getConfigSchema(): object {
    return {
      display: {
        showPartialResults: 'boolean - Show partial transcription results as they arrive',
        retainFinalizedText: 'boolean - Keep finalized text visible',
        autoScroll: 'boolean - Automatically scroll to show new text',
        fadeInAnimation: 'boolean - Animate new text appearance',
        maxTextLength: 'number - Maximum characters to display',
        maxSegments: 'number - Maximum transcription segments to keep',
        segmentRetentionDuration: 'number - How long to keep segments (ms)',
        fontSize: 'number - Text font size (8-72)',
        lineHeight: 'number - Text line height (1-3)',
        textColor: 'string - Text color (hex)',
        backgroundColor: 'string - Background color (hex)',
        highlightColor: 'string - Highlight color (hex)',
        enableScreenReader: 'boolean - Screen reader support',
        enableHighContrast: 'boolean - High contrast mode',
        enableReducedMotion: 'boolean - Reduced motion for accessibility'
      },
      behavior: {
        enableTextCorrection: 'boolean - Enable automatic text correction',
        enablePunctuation: 'boolean - Add punctuation automatically',
        enableCapitalization: 'boolean - Capitalize sentences',
        filterProfanity: 'boolean - Filter inappropriate content',
        partialResultDelay: 'number - Delay before showing partial results (ms)',
        finalizationDelay: 'number - Delay before finalizing text (ms)',
        gapTolerance: 'number - Maximum gap before new segment (ms)',
        minimumConfidence: 'number - Minimum confidence to display (0-1)',
        enableConfidenceIndicators: 'boolean - Show confidence indicators',
        enableQualityFiltering: 'boolean - Filter low-quality results'
      },
      integration: {
        enableEnhancedRouter: 'boolean - Use enhanced transcription router',
        routerDebugMode: 'boolean - Enable router debugging',
        fallbackToLegacy: 'boolean - Fallback to legacy system',
        enableWebSocketPriority: 'boolean - Prioritize WebSocket transcriptions',
        enableAutoRouting: 'boolean - Automatic routing decisions',
        queueNonWebSocketStreaming: 'boolean - Queue non-WebSocket streams',
        maxQueueSize: 'number - Maximum queue size',
        transcriptionService: 'string - Service to use (gemini/whisper/auto)',
        enableMultiWindowSync: 'boolean - Sync across windows',
        enableTelemetry: 'boolean - Enable usage telemetry'
      },
      router: 'object - Enhanced router configuration (see EnhancedRouterConfiguration)'
    }
  }
}

// Global configuration manager instance
let globalConfigManager: TranscriptionConfigManager | null = null

/**
 * Get the global configuration manager instance
 */
export function getTranscriptionConfig(
  initialConfig?: Partial<CompleteTranscriptionConfig>
): TranscriptionConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new TranscriptionConfigManager(initialConfig)
  }
  return globalConfigManager
}

/**
 * Reset the global configuration manager (useful for testing)
 */
export function resetTranscriptionConfig(): void {
  globalConfigManager = null
}
