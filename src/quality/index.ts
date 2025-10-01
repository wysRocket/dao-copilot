/**
 * Quality Services Index
 *
 * Central export point for all transcription quality improvement services.
 * Provides easy access to language detection, quality assessment, and
 * transcription quality management functionality.
 */

// Types and interfaces
export type {
  // Language Detection Types
  LanguageDetectionConfig,
  LanguageDetectionResult,
  MixedLanguageDetectionResult,
  LanguageDefinition,
  AudioLanguageFeatures,
  TextLanguageFeatures,
  ContextLanguageFeatures,
  DetectionOptions,
  ContinuousDetectionOptions,
  AudioTextInput,
  LanguageDetectionSource,
  LanguageDetectionPerformanceMetrics,
  LanguageDetectionAccuracyMetrics,
  ILanguageDetectionService,
  ApplicationContext,
  SessionContext,
  GeographicContext
} from './types/LanguageTypes'

export type {
  // Quality Assessment Types
  QualityMetrics,
  ProviderQualityProfile,
  QualityAssessmentResult,
  QualityIssue,
  QualitySuggestion,
  TranscriptionSample,
  QualityAssessmentConfig
} from './services/QualityAssessmentService'

export type {
  // Quality Manager Types
  TranscriptionProvider,
  TranscriptionOptions,
  TranscriptionResult,
  QualityManagerConfig
} from './services/TranscriptionQualityManager'

export type {
  // Provider Quality Comparison Types
  ComparisonResult,
  ProviderQualityScore,
  QualityRecommendation,
  QualityMetric,
  ComparisonConfig,
  TrendAnalysis
} from './services/ProviderQualityComparisonService'

export type {
  // Provider Switching Strategy Types
  SwitchingDecision,
  SwitchingContext,
  SwitchingRule,
  SwitchingStrategyConfig,
  SwitchingHistory
} from './services/ProviderSwitchingStrategyService'

// Services
export {
  LanguageDetectionService,
  createLanguageDetectionService
} from './services/LanguageDetectionService'

export {ContextDetectionService} from './services/ContextDetectionService'

export {
  QualityAssessmentService,
  createQualityAssessmentService
} from './services/QualityAssessmentService'

export {
  TranscriptionQualityManager,
  createTranscriptionQualityManager
} from './services/TranscriptionQualityManager'

export {
  ProviderQualityComparisonService,
  createProviderQualityComparisonService
} from './services/ProviderQualityComparisonService'

export {
  ProviderSwitchingStrategyService,
  createProviderSwitchingStrategyService,
  DEFAULT_SWITCHING_CONFIG,
  UKRAINIAN_SWITCHING_CONFIG,
  AGGRESSIVE_SWITCHING_CONFIG
} from './services/ProviderSwitchingStrategyService'

// Language Model Manager Services (Task 32.4)
export {
  LanguageModelManager,
  createLanguageModelManager,
  type LanguageModel,
  type ModelSelectionCriteria,
  type ModelPerformanceMetrics,
  type ModelManagerConfig,
  UKRAINIAN_OPTIMIZED_CONFIG as UKRAINIAN_MODEL_CONFIG,
  DEFAULT_MODEL_MANAGER_CONFIG
} from './services/LanguageModelManager'

export {
  ModelSelectionStrategyService,
  createModelSelectionStrategyService,
  type SelectionStrategy,
  type SelectionContext,
  type ModelSelectionResult,
  type StrategyConfig,
  UKRAINIAN_STRATEGY_CONFIG,
  DEFAULT_STRATEGY_CONFIG
} from './services/ModelSelectionStrategyService'

export {
  LanguageModelManagerIntegration,
  createLanguageModelManagerIntegration,
  type IntegratedTranscriptionProvider,
  type TranscriptionContext,
  type ModelSelectionIntegrationResult
} from './services/LanguageModelManagerIntegration'

// Real-time Quality Metrics Collection and Analytics (Task 32.5)
export {
  QualityMetricsCollector,
  createQualityMetricsCollector,
  type TranscriptionQualitySample,
  type QualityMetricsAggregation,
  type UkrainianQualityMetrics,
  type CollectorConfig,
  UKRAINIAN_QUALITY_COLLECTOR_CONFIG
} from './services/QualityMetricsCollector'

export {
  AnalyticsEngine,
  createAnalyticsEngine,
  type AnalyticsInsight,
  type QualityReport,
  type VisualizationData,
  type BenchmarkResult,
  type AnalyticsConfig,
  UKRAINIAN_ANALYTICS_CONFIG
} from './services/AnalyticsEngine'

// Quality Metrics Analytics Demo
export {
  QualityMetricsAnalyticsDemo,
  runQuickQualityDemo as runQuickAnalyticsDemo
} from './examples/QualityMetricsAnalyticsDemo'

// Provider Implementations
export * from './providers'

// Constants and defaults
export {DEFAULT_SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE_DETECTION_CONFIG} from './types/LanguageTypes'

// Utility functions and helpers
export const QualityServiceUtils = {
  /**
   * Create a complete quality system with default configuration
   */
  createDefaultQualitySystem: (customConfig = {}) => {
    const manager = createTranscriptionQualityManager(customConfig)
    return manager
  },

  /**
   * Get recommended configuration for Ukrainian/English mixed environments
   */
  getUkrainianMixedConfig: () => ({
    languageDetection: {
      enabledMethods: ['audio_analysis', 'text_analysis', 'context_analysis'],
      confidenceThresholds: {
        primary: 0.7,
        switching: 0.6,
        mixed: 0.4
      },
      mixedLanguageDetection: {
        enabled: true,
        codeSwitchingThreshold: 0.3,
        segmentationEnabled: true,
        minimumSegmentLength: 100
      }
    },
    qualityAssessment: {
      enabledMetrics: {
        accuracy: true,
        fluency: true,
        completeness: true,
        latency: true
      },
      thresholds: {
        minAccuracy: 0.8,
        minFluency: 0.7,
        minCompleteness: 0.8,
        maxLatency: 2000,
        providerSwitchThreshold: 0.15
      }
    },
    providers: {
      enableAutoSwitching: true,
      switchThreshold: 0.15
    },
    optimization: {
      enableContinuousLearning: true,
      adaptiveQuality: true,
      contextAwareness: true,
      performanceMonitoring: true
    }
  }),

  /**
   * Create language detection service optimized for specific language pairs
   */
  createLanguagePairDetection: (primaryLang: string, secondaryLang: string) => {
    const supportedLanguages = DEFAULT_SUPPORTED_LANGUAGES.filter(
      lang => lang.code === primaryLang || lang.code === secondaryLang
    )

    const config = {
      enabledMethods: ['audio_analysis', 'text_analysis', 'context_analysis'],
      mixedLanguageDetection: {
        enabled: true,
        codeSwitchingThreshold: 0.3
      }
    }

    return createLanguageDetectionService(config, supportedLanguages)
  },

  /**
   * Validate quality system configuration
   */
  validateConfiguration: (config: Record<string, unknown>): {valid: boolean; errors: string[]} => {
    const errors: string[] = []

    // Validate thresholds
    if (config.languageDetection?.confidenceThresholds) {
      const thresholds = config.languageDetection.confidenceThresholds
      if (thresholds.primary < thresholds.switching) {
        errors.push('Primary confidence threshold should be higher than switching threshold')
      }
    }

    if (config.qualityAssessment?.thresholds) {
      const thresholds = config.qualityAssessment.thresholds
      Object.entries(thresholds).forEach(([key, value]) => {
        if (key.startsWith('min') && (value < 0 || value > 1)) {
          errors.push(`${key} should be between 0 and 1`)
        }
      })
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}

/**
 * Quick setup function for common use cases
 */
export const setupQualitySystem = {
  /**
   * Setup for Ukrainian-English mixed environment
   */
  ukrainian: () => {
    const config = QualityServiceUtils.getUkrainianMixedConfig()
    return createTranscriptionQualityManager(config)
  },

  /**
   * Setup for general multilingual environment
   */
  multilingual: (languages: string[] = ['en', 'uk', 'ru', 'de', 'fr', 'es']) => {
    const supportedLanguages = DEFAULT_SUPPORTED_LANGUAGES.filter(lang =>
      languages.includes(lang.code)
    )

    const config = {
      languageDetection: {
        enabledMethods: ['audio_analysis', 'text_analysis', 'context_analysis'],
        mixedLanguageDetection: {enabled: true}
      },
      optimization: {
        enableContinuousLearning: true,
        contextAwareness: true
      }
    }

    return createTranscriptionQualityManager(config, supportedLanguages)
  },

  /**
   * Setup for performance-optimized environment
   */
  performance: () => {
    const config = {
      languageDetection: {
        enabledMethods: ['context_analysis', 'text_analysis'], // Skip slower audio analysis
        performance: {
          enableCaching: true,
          cacheSize: 1000,
          enableParallelProcessing: true
        }
      },
      qualityAssessment: {
        thresholds: {
          maxLatency: 1000 // Stricter latency requirement
        }
      }
    }

    return createTranscriptionQualityManager(config)
  },

  /**
   * Setup for accuracy-optimized environment
   */
  accuracy: () => {
    const config = {
      languageDetection: {
        enabledMethods: ['audio_analysis', 'text_analysis', 'context_analysis'], // All methods
        confidenceThresholds: {
          primary: 0.8, // Higher confidence thresholds
          switching: 0.7,
          mixed: 0.5
        }
      },
      qualityAssessment: {
        thresholds: {
          minAccuracy: 0.9,
          minFluency: 0.8,
          minCompleteness: 0.9,
          providerSwitchThreshold: 0.1 // More aggressive switching
        }
      },
      providers: {
        enableAutoSwitching: true,
        switchThreshold: 0.1
      }
    }

    return createTranscriptionQualityManager(config)
  }
}

// Re-export default configurations for easy access
export const DefaultConfigurations = {
  UKRAINIAN_MIXED: QualityServiceUtils.getUkrainianMixedConfig(),
  PERFORMANCE_OPTIMIZED: setupQualitySystem.performance,
  ACCURACY_OPTIMIZED: setupQualitySystem.accuracy,
  MULTILINGUAL: setupQualitySystem.multilingual
}

/**
 * Version information
 */
export const QUALITY_SYSTEM_VERSION = '1.0.0'
export const SUPPORTED_FEATURES = [
  'multi_modal_language_detection',
  'mixed_language_support',
  'real_time_quality_assessment',
  'provider_quality_comparison',
  'automatic_provider_switching',
  'context_aware_detection',
  'continuous_learning',
  'performance_monitoring'
]

/**
 * Health check utility for quality system
 */
export const healthCheck = {
  async validateSystem(manager: TranscriptionQualityManager): Promise<{
    healthy: boolean
    issues: string[]
    recommendations: string[]
  }> {
    const issues: string[] = []
    const recommendations: string[] = []

    try {
      const status = manager.getSystemStatus()

      if (!status.isInitialized) {
        issues.push('Quality manager not initialized')
      }

      if (status.registeredProviders.length === 0) {
        issues.push('No transcription providers registered')
        recommendations.push('Register at least one transcription provider')
      }

      if (status.recentPerformance.errorRate > 0.2) {
        issues.push(`High error rate: ${(status.recentPerformance.errorRate * 100).toFixed(1)}%`)
        recommendations.push('Review provider configurations or audio input quality')
      }

      if (status.recentPerformance.averageLatency > 3000) {
        issues.push(`High latency: ${status.recentPerformance.averageLatency.toFixed(0)}ms`)
        recommendations.push(
          'Consider optimizing provider settings or switching to faster providers'
        )
      }

      return {
        healthy: issues.length === 0,
        issues,
        recommendations
      }
    } catch (error) {
      return {
        healthy: false,
        issues: [`System check failed: ${error}`],
        recommendations: ['Verify system initialization and configuration']
      }
    }
  }
}
