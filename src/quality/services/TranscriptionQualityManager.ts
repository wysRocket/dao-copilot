/**
 * Transcription Quality Manager
 *
 * Central orchestrator for transcription quality improvement system.
 * Coordinates language detection, quality assessment, and provider management
 * to deliver optimal transcription quality for mixed-language environments.
 */

import {EventEmitter} from 'events'
import {LanguageDetectionService, createLanguageDetectionService} from './LanguageDetectionService'
import {ContextDetectionService} from './ContextDetectionService'
import {QualityAssessmentService, createQualityAssessmentService} from './QualityAssessmentService'
import type {
  LanguageDetectionConfig,
  LanguageDetectionResult,
  MixedLanguageDetectionResult,
  ContextLanguageFeatures,
  LanguageDefinition,
  DEFAULT_SUPPORTED_LANGUAGES
} from '../types/LanguageTypes'
import type {
  QualityAssessmentConfig,
  QualityAssessmentResult,
  TranscriptionSample,
  QualityMetrics,
  ProviderQualityProfile,
  QualitySuggestion
} from './QualityAssessmentService'

/**
 * Provider interface for transcription services
 */
export interface TranscriptionProvider {
  id: string
  name: string
  supportedLanguages: string[]
  capabilities: {
    realtime: boolean
    mixedLanguage: boolean
    confidence: boolean
    alternatives: boolean
  }
  transcribe(audio: ArrayBuffer, options: TranscriptionOptions): Promise<TranscriptionResult>
  getConfiguration(): Record<string, unknown>
  updateConfiguration(config: Record<string, unknown>): void
}

export interface TranscriptionOptions {
  language?: string
  enableMixedLanguage?: boolean
  confidence?: boolean
  alternatives?: boolean
  timeout?: number
  quality?: 'low' | 'medium' | 'high'
}

export interface TranscriptionResult {
  text: string
  confidence: number
  language: string
  alternatives?: Array<{text: string; confidence: number}>
  processingTime: number
  metadata?: Record<string, unknown>
}

/**
 * Quality Manager configuration
 */
export interface QualityManagerConfig {
  languageDetection: Partial<LanguageDetectionConfig>
  qualityAssessment: Partial<QualityAssessmentConfig>
  providers: {
    defaultProvider: string
    enableAutoSwitching: boolean
    switchThreshold: number
    fallbackProvider?: string
  }
  optimization: {
    enableContinuousLearning: boolean
    adaptiveQuality: boolean
    contextAwareness: boolean
    performanceMonitoring: boolean
  }
}

const DEFAULT_QUALITY_MANAGER_CONFIG: QualityManagerConfig = {
  languageDetection: {},
  qualityAssessment: {},
  providers: {
    defaultProvider: 'gemini-live',
    enableAutoSwitching: true,
    switchThreshold: 0.15,
    fallbackProvider: 'websocket'
  },
  optimization: {
    enableContinuousLearning: true,
    adaptiveQuality: true,
    contextAwareness: true,
    performanceMonitoring: true
  }
}

/**
 * Main Quality Manager class
 */
export class TranscriptionQualityManager extends EventEmitter {
  private config: QualityManagerConfig
  private languageDetectionService: LanguageDetectionService
  private contextDetectionService: ContextDetectionService
  private qualityAssessmentService: QualityAssessmentService
  private providers = new Map<string, TranscriptionProvider>()
  private currentProvider: string
  private context: ContextLanguageFeatures | null = null
  private qualityHistory: QualityAssessmentResult[] = []
  private isInitialized = false

  constructor(
    config: Partial<QualityManagerConfig> = {},
    supportedLanguages?: LanguageDefinition[]
  ) {
    super()

    this.config = {...DEFAULT_QUALITY_MANAGER_CONFIG, ...config}
    this.currentProvider = this.config.providers.defaultProvider

    // Initialize services
    this.languageDetectionService = createLanguageDetectionService(
      this.config.languageDetection,
      supportedLanguages
    )

    this.contextDetectionService = new ContextDetectionService()
    this.qualityAssessmentService = createQualityAssessmentService(this.config.qualityAssessment)

    // Set up event listeners
    this.setupEventListeners()
  }

  /**
   * Initialize the quality manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Initialize context detection service
      await this.contextDetectionService.initialize()

      // Gather initial context
      if (this.config.optimization.contextAwareness) {
        this.context = await this.contextDetectionService.gatherContext()
      }

      // Start continuous language detection if enabled
      const continuousOptions = {
        updateInterval: 2000,
        bufferSize: 50
      }
      this.languageDetectionService.startContinuousDetection(continuousOptions)

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      this.emit('initialization:error', error)
      throw error
    }
  }

  /**
   * Register a transcription provider
   */
  public registerProvider(provider: TranscriptionProvider): void {
    this.providers.set(provider.id, provider)
    this.emit('provider:registered', provider.id)
  }

  /**
   * Unregister a transcription provider
   */
  public unregisterProvider(providerId: string): void {
    this.providers.delete(providerId)
    if (this.currentProvider === providerId) {
      this.currentProvider =
        this.config.providers.fallbackProvider || Array.from(this.providers.keys())[0]
    }
    this.emit('provider:unregistered', providerId)
  }

  /**
   * Enhanced transcription with quality optimization
   */
  public async transcribeWithQuality(
    audio: ArrayBuffer,
    options: TranscriptionOptions = {}
  ): Promise<{
    result: TranscriptionResult
    qualityAssessment: QualityAssessmentResult
    languageDetection: LanguageDetectionResult | MixedLanguageDetectionResult
  }> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const startTime = performance.now()

    try {
      // Step 1: Language detection
      const languageDetection = await this.detectLanguageFromAudio(audio, options)
      const detectedLanguage = this.extractPrimaryLanguage(languageDetection)

      // Step 2: Select optimal provider
      const providerId = await this.selectOptimalProvider(detectedLanguage, options)
      const provider = this.providers.get(providerId)

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`)
      }

      // Step 3: Prepare transcription options
      const enhancedOptions = await this.enhanceTranscriptionOptions(
        options,
        detectedLanguage,
        languageDetection
      )

      // Step 4: Perform transcription
      const transcriptionResult = await provider.transcribe(audio, enhancedOptions)

      // Step 5: Quality assessment
      const sample: TranscriptionSample = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: transcriptionResult.text,
        language: detectedLanguage,
        providerId,
        confidence: transcriptionResult.confidence,
        processingTime: transcriptionResult.processingTime,
        audioLength: this.estimateAudioLength(audio),
        timestamp: Date.now(),
        metadata: transcriptionResult.metadata || {}
      }

      const qualityAssessment = await this.qualityAssessmentService.assessQuality(sample)

      // Step 6: Handle quality-based optimizations
      await this.handleQualityOptimizations(qualityAssessment, audio, options)

      // Step 7: Update context and learning
      if (this.config.optimization.enableContinuousLearning) {
        await this.updateLearning(languageDetection, qualityAssessment)
      }

      // Store quality history
      this.qualityHistory.push(qualityAssessment)
      this.trimQualityHistory()

      const totalTime = performance.now() - startTime
      this.emit('transcription:completed', {
        result: transcriptionResult,
        qualityAssessment,
        languageDetection,
        totalProcessingTime: totalTime
      })

      return {
        result: transcriptionResult,
        qualityAssessment,
        languageDetection
      }
    } catch (error) {
      this.emit('transcription:error', error, {audio, options})
      throw error
    }
  }

  /**
   * Get quality insights and recommendations
   */
  public getQualityInsights(): {
    currentProvider: string
    providerProfiles: ProviderQualityProfile[]
    recentQuality: QualityMetrics | null
    recommendations: QualitySuggestion[]
    languageTrends: Record<string, {trend: string; change: number}>
  } {
    const providerProfiles = Array.from(this.providers.keys())
      .map(id => this.qualityAssessmentService.getProviderStatistics(id))
      .filter(Boolean) as ProviderQualityProfile[]

    const recentQuality =
      this.qualityHistory.length > 0
        ? this.qualityHistory[this.qualityHistory.length - 1].metrics
        : null

    const recommendations = this.generateSystemRecommendations()

    const languageTrends: Record<string, {trend: string; change: number}> = {}
    const supportedLanguages = this.languageDetectionService.getSupportedLanguages()

    supportedLanguages.forEach(lang => {
      const trend = this.qualityAssessmentService.getQualityTrend(this.currentProvider, lang.code)
      languageTrends[lang.code] = trend
    })

    return {
      currentProvider: this.currentProvider,
      providerProfiles,
      recentQuality,
      recommendations,
      languageTrends
    }
  }

  /**
   * Force provider switch
   */
  public async switchProvider(newProviderId: string, reason?: string): Promise<void> {
    if (!this.providers.has(newProviderId)) {
      throw new Error(`Provider ${newProviderId} not registered`)
    }

    const oldProvider = this.currentProvider
    this.currentProvider = newProviderId

    this.emit('provider:switched', {
      from: oldProvider,
      to: newProviderId,
      reason: reason || 'Manual switch'
    })
  }

  /**
   * Get current system status
   */
  public getSystemStatus(): {
    isInitialized: boolean
    currentProvider: string
    registeredProviders: string[]
    languageDetectionActive: boolean
    qualityMonitoringActive: boolean
    recentPerformance: {
      averageQuality: number
      averageLatency: number
      errorRate: number
    }
  } {
    const recentResults = this.qualityHistory.slice(-20)
    const averageQuality =
      recentResults.length > 0
        ? recentResults.reduce((sum, r) => sum + r.metrics.overall, 0) / recentResults.length
        : 0

    const averageLatency =
      recentResults.length > 0
        ? recentResults.reduce((sum, r) => sum + r.metrics.latency * 1000, 0) / recentResults.length
        : 0

    const errors = recentResults.filter(r => r.metrics.overall < 0.5).length
    const errorRate = recentResults.length > 0 ? errors / recentResults.length : 0

    return {
      isInitialized: this.isInitialized,
      currentProvider: this.currentProvider,
      registeredProviders: Array.from(this.providers.keys()),
      languageDetectionActive: true, // Simplified - would check actual status
      qualityMonitoringActive: true, // Simplified - would check actual status
      recentPerformance: {
        averageQuality,
        averageLatency,
        errorRate
      }
    }
  }

  /**
   * Export system data for analysis
   */
  public exportSystemData(): {
    configuration: QualityManagerConfig
    qualityHistory: QualityAssessmentResult[]
    providerProfiles: ProviderQualityProfile[]
    languageDetectionMetrics: unknown
  } {
    const qualityData = this.qualityAssessmentService.exportQualityData()
    const languageMetrics = this.languageDetectionService.getPerformanceMetrics()

    return {
      configuration: this.config,
      qualityHistory: this.qualityHistory,
      providerProfiles: qualityData.profiles,
      languageDetectionMetrics: languageMetrics
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.languageDetectionService.cleanup()
    this.qualityAssessmentService.clearHistory()
    this.providers.clear()
    this.removeAllListeners()
    this.isInitialized = false
  }

  // Private implementation methods

  private setupEventListeners(): void {
    // Language detection events
    this.languageDetectionService.on('detection:switch', (oldLang, newLang, confidence) => {
      this.emit('language:switched', {oldLang, newLang, confidence})

      // Update context
      if (this.context) {
        this.contextDetectionService.updateSessionContext(newLang, confidence)
      }
    })

    // Quality assessment events
    this.qualityAssessmentService.on('quality:provider_switch_recommended', result => {
      if (this.config.providers.enableAutoSwitching) {
        this.handleAutomaticProviderSwitch(result)
      }
    })
  }

  private async detectLanguageFromAudio(
    audio: ArrayBuffer,
    options: TranscriptionOptions
  ): Promise<LanguageDetectionResult | MixedLanguageDetectionResult> {
    if (options.language) {
      // If language is explicitly specified, create a synthetic result
      return {
        language: options.language,
        confidence: 1.0,
        source: 'user_specified',
        timestamp: Date.now(),
        features: {},
        alternatives: [],
        metadata: {userSpecified: true}
      } as LanguageDetectionResult
    }

    // Use context-aware detection
    if (this.context && this.config.optimization.contextAwareness) {
      const contextResult = await this.languageDetectionService.detectFromContext(this.context)

      // If context provides high confidence, use it
      if (contextResult.confidence > 0.8) {
        return contextResult
      }
    }

    // Perform audio-based detection
    try {
      return await this.languageDetectionService.detectFromAudio(audio)
    } catch {
      // Fallback to context or default
      if (this.context) {
        return await this.languageDetectionService.detectFromContext(this.context)
      } else {
        // Return default language
        return {
          language: 'en',
          confidence: 0.5,
          source: 'default',
          timestamp: Date.now(),
          features: {},
          alternatives: [],
          metadata: {fallback: true}
        } as LanguageDetectionResult
      }
    }
  }

  private extractPrimaryLanguage(
    detection: LanguageDetectionResult | MixedLanguageDetectionResult
  ): string {
    if ('primaryLanguage' in detection) {
      return detection.primaryLanguage
    }
    return detection.language
  }

  private async selectOptimalProvider(
    language: string,
    options: TranscriptionOptions
  ): Promise<string> {
    // If auto-switching is disabled, use current provider
    if (!this.config.providers.enableAutoSwitching) {
      return this.currentProvider
    }

    // Get best provider for language
    const bestProvider = this.qualityAssessmentService.getBestProviderForLanguage(language)

    if (bestProvider && this.providers.has(bestProvider)) {
      // Check if we should switch from current provider
      const shouldSwitch = this.qualityAssessmentService.shouldSwitchProvider(
        this.currentProvider,
        language
      )

      if (shouldSwitch.shouldSwitch && shouldSwitch.recommendedProvider === bestProvider) {
        return bestProvider
      }
    }

    // Return current provider if no better option
    return this.currentProvider
  }

  private async enhanceTranscriptionOptions(
    originalOptions: TranscriptionOptions,
    detectedLanguage: string,
    languageDetection: LanguageDetectionResult | MixedLanguageDetectionResult
  ): Promise<TranscriptionOptions> {
    const enhancedOptions: TranscriptionOptions = {
      ...originalOptions,
      language: detectedLanguage
    }

    // Enable mixed language if detected
    if ('isPrimaryLanguage' in languageDetection && !languageDetection.isPrimaryLanguage) {
      enhancedOptions.enableMixedLanguage = true
    }

    // Adjust quality based on previous performance
    if (this.config.optimization.adaptiveQuality) {
      const recentQuality = this.getRecentQualityForLanguage(detectedLanguage)
      if (recentQuality && recentQuality < 0.7) {
        enhancedOptions.quality = 'high'
        enhancedOptions.timeout = (enhancedOptions.timeout || 5000) * 1.5
      }
    }

    return enhancedOptions
  }

  private async handleQualityOptimizations(
    qualityAssessment: QualityAssessmentResult,
    audio: ArrayBuffer,
    options: TranscriptionOptions
  ): Promise<void> {
    // Handle high-priority suggestions
    const highPrioritySuggestions = qualityAssessment.suggestions.filter(s => s.priority === 'high')

    for (const suggestion of highPrioritySuggestions) {
      switch (suggestion.type) {
        case 'provider_switch':
          if (this.config.providers.enableAutoSwitching) {
            const newProvider = suggestion.implementation.parameters.newProvider as string
            await this.switchProvider(newProvider, suggestion.description)
          }
          break

        case 'retry':
          // Could implement retry logic here
          this.emit('quality:retry_suggested', {
            suggestion,
            originalAssessment: qualityAssessment
          })
          break
      }
    }
  }

  private async updateLearning(
    languageDetection: LanguageDetectionResult | MixedLanguageDetectionResult,
    qualityAssessment: QualityAssessmentResult
  ): Promise<void> {
    // Update context with session information
    const primaryLanguage = this.extractPrimaryLanguage(languageDetection)
    this.contextDetectionService.updateSessionContext(
      primaryLanguage,
      qualityAssessment.metrics.confidence
    )

    // Update language detection service (if it has learning capabilities)
    // This would depend on the specific implementation
  }

  private async handleAutomaticProviderSwitch(
    qualityAssessment: QualityAssessmentResult
  ): Promise<void> {
    const switchSuggestion = qualityAssessment.suggestions.find(s => s.type === 'provider_switch')

    if (switchSuggestion) {
      const newProvider = switchSuggestion.implementation.parameters.newProvider as string
      try {
        await this.switchProvider(newProvider, switchSuggestion.description)
      } catch (error) {
        this.emit('provider:switch_failed', error, switchSuggestion)
      }
    }
  }

  private generateSystemRecommendations(): QualitySuggestion[] {
    const recommendations: QualitySuggestion[] = []

    // Analyze recent quality trends
    if (this.qualityHistory.length >= 5) {
      const recent = this.qualityHistory.slice(-5)
      const avgQuality = recent.reduce((sum, r) => sum + r.metrics.overall, 0) / recent.length

      if (avgQuality < 0.6) {
        recommendations.push({
          type: 'configuration',
          priority: 'high',
          description:
            'Overall transcription quality is low. Consider reviewing provider settings or audio quality.',
          expectedImprovement: 0.2,
          implementation: {
            action: 'reviewConfiguration',
            parameters: {focus: 'quality_improvement'}
          }
        })
      }
    }

    // Check provider diversity
    const providers = new Set(this.qualityHistory.slice(-10).map(r => r.providerId))
    if (providers.size === 1 && this.providers.size > 1) {
      recommendations.push({
        type: 'configuration',
        priority: 'medium',
        description: 'Consider enabling automatic provider switching to optimize quality.',
        expectedImprovement: 0.1,
        implementation: {
          action: 'enableAutoSwitching',
          parameters: {threshold: this.config.providers.switchThreshold}
        }
      })
    }

    return recommendations
  }

  private getRecentQualityForLanguage(language: string): number | null {
    const recentResults = this.qualityHistory.filter(r => r.language === language).slice(-5)

    if (recentResults.length === 0) return null

    return recentResults.reduce((sum, r) => sum + r.metrics.overall, 0) / recentResults.length
  }

  private trimQualityHistory(): void {
    const maxHistory = 100
    if (this.qualityHistory.length > maxHistory) {
      this.qualityHistory = this.qualityHistory.slice(-maxHistory)
    }
  }

  private estimateAudioLength(audio: ArrayBuffer): number {
    // Simplified estimation - in production would analyze audio headers
    // Assume 16kHz, 16-bit mono audio
    const bytesPerSample = 2
    const sampleRate = 16000
    const samples = audio.byteLength / bytesPerSample
    return (samples / sampleRate) * 1000 // Return milliseconds
  }
}

// Export factory function
export function createTranscriptionQualityManager(
  config?: Partial<QualityManagerConfig>,
  supportedLanguages?: LanguageDefinition[]
): TranscriptionQualityManager {
  return new TranscriptionQualityManager(config, supportedLanguages)
}
