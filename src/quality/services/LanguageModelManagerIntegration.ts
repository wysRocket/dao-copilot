/**
 * Language Model Manager Integration
 *
 * Integration layer connecting the Language Model Manager and Selection Strategy
 * services with the existing TranscriptionManager for seamless quality improvement.
 */

import {EventEmitter} from 'events'
import {
  LanguageModelManager,
  createLanguageModelManager,
  type ModelSelectionCriteria,
  type ModelPerformanceMetrics,
  UKRAINIAN_OPTIMIZED_CONFIG
} from './LanguageModelManager'
import {
  ModelSelectionStrategyService,
  createModelSelectionStrategyService,
  type SelectionContext,
  UKRAINIAN_STRATEGY_CONFIG
} from './ModelSelectionStrategyService'
import type {LanguageDetectionResult} from '../services/LanguageDetectionService'

/**
 * Interface for transcription provider that works with the integration
 */
export interface IntegratedTranscriptionProvider {
  id: string
  name: string
  isLoaded?: boolean
  configuration?: {
    languageModel?: string
    modelId?: string
    supportedLanguages?: string[]
    ukrainianSupport?: boolean
    mixedLanguageSupport?: boolean
  }
  performance?: {
    accuracy?: number
    latency?: number
    languageAccuracy?: Record<string, number>
    recentResults?: Array<{
      timestamp: number
      accuracy: number
      latency: number
      language: string
    }>
  }
}

/**
 * Transcription context passed from the main system
 */
export interface TranscriptionContext {
  sessionId: string
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent'
  backgroundNoise: 'high' | 'medium' | 'low'
  domain: 'general' | 'business' | 'technical' | 'medical'
  expectedLanguages: string[]
  realTimeRequired: boolean
  systemMetrics: {
    availableMemory: number
    cpuUsage: number
    networkQuality: 'poor' | 'fair' | 'good' | 'excellent'
  }
}

/**
 * Result from model selection integration
 */
export interface ModelSelectionIntegrationResult {
  recommendedProvider: IntegratedTranscriptionProvider
  selectedModel: {
    id: string
    name: string
    configuration: Record<string, unknown>
  }
  confidence: number
  expectedOutcome: {
    accuracy: number
    latency: number
    memoryUsage: number
  }
  reasoning: string[]
  alternatives: Array<{
    provider: IntegratedTranscriptionProvider
    score: number
    reason: string
  }>
  requiresModelSwitch: boolean
  loadingTime?: number
}

/**
 * Integration service connecting Language Model Manager with Transcription system
 */
export class LanguageModelManagerIntegration extends EventEmitter {
  private modelManager: LanguageModelManager
  private strategyService: ModelSelectionStrategyService
  private providers: Map<string, IntegratedTranscriptionProvider> = new Map()
  private currentProvider: string | null = null
  private performanceHistory: Map<string, ModelPerformanceMetrics[]> = new Map()
  private integrationMetrics = {
    selections: 0,
    switches: 0,
    loadingTime: 0,
    averageAccuracy: 0,
    ukrainianOptimizations: 0
  }

  constructor() {
    super()

    // Initialize with Ukrainian optimization by default
    this.modelManager = createLanguageModelManager(UKRAINIAN_OPTIMIZED_CONFIG)
    this.strategyService = createModelSelectionStrategyService(UKRAINIAN_STRATEGY_CONFIG)

    this.setupEventHandlers()
  }

  /**
   * Initialize the integration
   */
  public async initialize(): Promise<void> {
    await this.modelManager.initialize()
    await this.strategyService.initialize()

    // Set up adaptive learning
    this.strategyService.enableAdaptiveLearning()

    this.emit('integration:initialized')
  }

  /**
   * Register transcription providers with the integration
   */
  public registerProvider(provider: IntegratedTranscriptionProvider): void {
    this.providers.set(provider.id, provider)

    // Convert provider to model format for the model manager
    const model = {
      id: provider.id,
      name: provider.name,
      type: 'transcription_provider' as const,
      language: provider.configuration?.supportedLanguages?.[0] || 'auto',
      isLoaded: provider.isLoaded || false,
      memoryUsage: 512, // Default estimate
      configuration: {
        supportedLanguages: provider.configuration?.supportedLanguages || [],
        ukrainianSupport: provider.configuration?.ukrainianSupport || false,
        mixedLanguageSupport: provider.configuration?.mixedLanguageSupport || false,
        ...provider.configuration
      },
      performance: {
        accuracy: provider.performance?.accuracy || 0.8,
        latency: provider.performance?.latency || 2000,
        memoryEfficiency: 0.8,
        cpuUsage: 0.5,
        loadingTime: 3000,
        languageAccuracy: provider.performance?.languageAccuracy || {},
        mixedLanguagePerformance: 0.75,
        recentPerformance: {
          accuracy: provider.performance?.recentResults?.map(r => r.accuracy) || [],
          latency: provider.performance?.recentResults?.map(r => r.latency) || [],
          timestamps: provider.performance?.recentResults?.map(r => r.timestamp) || []
        }
      }
    }

    this.modelManager.registerModel(model)
    this.emit('provider:registered', {providerId: provider.id})
  }

  /**
   * Select optimal provider and model based on language detection and context
   */
  public async selectOptimalProvider(
    languageDetection: LanguageDetectionResult,
    context: TranscriptionContext
  ): Promise<ModelSelectionIntegrationResult> {
    const startTime = Date.now()

    // Build selection criteria from language detection
    const criteria: ModelSelectionCriteria = {
      detectedLanguage: languageDetection.primaryLanguage,
      confidence: languageDetection.confidence,
      mixedLanguages:
        languageDetection.detectedLanguages.length > 1
          ? languageDetection.detectedLanguages
          : undefined,
      accuracyPriority: this.calculateAccuracyPriority(context),
      latencyPriority: this.calculateLatencyPriority(context),
      realTimeRequired: context.realTimeRequired,
      audioQuality: context.audioQuality,
      domain: context.domain
    }

    // Build selection context
    const selectionContext: SelectionContext = {
      sessionLanguages: context.expectedLanguages,
      primaryLanguage: languageDetection.primaryLanguage,
      recentPerformance: this.buildRecentPerformance(),
      userFeedback: {},
      audioQuality: context.audioQuality,
      backgroundNoise: context.backgroundNoise,
      speakerCharacteristics: 'single', // Default assumption
      availableMemory: context.systemMetrics.availableMemory,
      cpuUsage: context.systemMetrics.cpuUsage,
      networkQuality: context.systemMetrics.networkQuality,
      realTimeRequired: context.realTimeRequired,
      domain: context.domain,
      terminology: 'mixed',
      expectedLength: 'medium'
    }

    // Get available models (providers)
    const availableModels = this.modelManager.getAvailableModels()

    // Select optimal model using strategy service
    const analysis = await this.strategyService.selectModel(
      availableModels,
      criteria,
      selectionContext
    )

    const selectionTime = Date.now() - startTime

    // Get corresponding provider
    const selectedProvider = this.providers.get(analysis.selectedModel.id)
    if (!selectedProvider) {
      throw new Error(`Provider not found for model: ${analysis.selectedModel.id}`)
    }

    // Check if model switch is needed
    const requiresModelSwitch = this.currentProvider !== analysis.selectedModel.id
    let loadingTime = 0

    // Load model if needed
    if (requiresModelSwitch && !analysis.selectedModel.isLoaded) {
      const loadStart = Date.now()
      await this.modelManager.loadModel(analysis.selectedModel.id)
      loadingTime = Date.now() - loadStart

      this.integrationMetrics.loadingTime += loadingTime
    }

    // Update current provider
    if (requiresModelSwitch) {
      this.currentProvider = analysis.selectedModel.id
      this.integrationMetrics.switches++
    }

    // Build alternatives list
    const alternatives = availableModels
      .filter(m => m.id !== analysis.selectedModel.id)
      .slice(0, 3)
      .map(model => {
        const provider = this.providers.get(model.id)
        return {
          provider: provider!,
          score: model.performance.accuracy * 100,
          reason: this.getAlternativeReason(model, criteria)
        }
      })

    // Check for Ukrainian optimizations
    if (
      languageDetection.primaryLanguage === 'uk' ||
      languageDetection.detectedLanguages.includes('uk')
    ) {
      this.integrationMetrics.ukrainianOptimizations++
    }

    // Update metrics
    this.integrationMetrics.selections++
    this.integrationMetrics.averageAccuracy =
      (this.integrationMetrics.averageAccuracy + analysis.expectedOutcome.accuracy) / 2

    const result: ModelSelectionIntegrationResult = {
      recommendedProvider: selectedProvider,
      selectedModel: {
        id: analysis.selectedModel.id,
        name: analysis.selectedModel.name,
        configuration: analysis.selectedModel.configuration
      },
      confidence: analysis.confidence,
      expectedOutcome: {
        accuracy: analysis.expectedOutcome.accuracy,
        latency: analysis.expectedOutcome.latency,
        memoryUsage: analysis.selectedModel.memoryUsage || 512
      },
      reasoning: analysis.reasoning.map(
        r => `${r.factor}: ${(r.score * 100).toFixed(1)}% (weight: ${r.weight})`
      ),
      alternatives,
      requiresModelSwitch,
      loadingTime: loadingTime > 0 ? loadingTime : undefined
    }

    this.emit('provider:selected', {
      providerId: selectedProvider.id,
      selectionTime,
      confidence: analysis.confidence,
      requiresSwitch: requiresModelSwitch
    })

    return result
  }

  /**
   * Update provider performance based on transcription results
   */
  public updateProviderPerformance(
    providerId: string,
    transcriptionResult: {
      accuracy: number
      latency: number
      detectedLanguage: string
      audioQuality: string
      timestamp: number
    }
  ): void {
    const provider = this.providers.get(providerId)
    if (!provider) return

    // Update provider's performance data
    if (!provider.performance) {
      provider.performance = {recentResults: []}
    }

    if (!provider.performance.recentResults) {
      provider.performance.recentResults = []
    }

    // Add new result
    provider.performance.recentResults.push({
      timestamp: transcriptionResult.timestamp,
      accuracy: transcriptionResult.accuracy,
      latency: transcriptionResult.latency,
      language: transcriptionResult.detectedLanguage
    })

    // Keep only recent results (last 10)
    provider.performance.recentResults = provider.performance.recentResults.slice(-10)

    // Update aggregate performance
    const recent = provider.performance.recentResults
    provider.performance.accuracy = recent.reduce((sum, r) => sum + r.accuracy, 0) / recent.length
    provider.performance.latency = recent.reduce((sum, r) => sum + r.latency, 0) / recent.length

    // Update language-specific accuracy
    if (!provider.performance.languageAccuracy) {
      provider.performance.languageAccuracy = {}
    }

    const languageResults = recent.filter(r => r.language === transcriptionResult.detectedLanguage)
    if (languageResults.length > 0) {
      provider.performance.languageAccuracy[transcriptionResult.detectedLanguage] =
        languageResults.reduce((sum, r) => sum + r.accuracy, 0) / languageResults.length
    }

    // Convert to model performance format
    const performanceMetrics: ModelPerformanceMetrics = {
      accuracy: transcriptionResult.accuracy,
      latency: transcriptionResult.latency,
      memoryEfficiency: 0.8, // Default
      cpuUsage: 0.5, // Default
      loadingTime: 2000, // Default
      languageAccuracy: provider.performance.languageAccuracy,
      mixedLanguagePerformance: 0.8, // Default
      recentPerformance: {
        accuracy: recent.map(r => r.accuracy),
        latency: recent.map(r => r.latency),
        timestamps: recent.map(r => r.timestamp)
      }
    }

    // Update both model manager and strategy service
    this.modelManager.updateModelPerformance(providerId, performanceMetrics)
    this.strategyService.updateModelPerformance(providerId, performanceMetrics)

    // Store in history
    if (!this.performanceHistory.has(providerId)) {
      this.performanceHistory.set(providerId, [])
    }
    this.performanceHistory.get(providerId)!.push(performanceMetrics)

    this.emit('performance:updated', {
      providerId,
      accuracy: transcriptionResult.accuracy,
      latency: transcriptionResult.latency
    })
  }

  /**
   * Get current integration statistics
   */
  public getIntegrationStatistics() {
    const modelStats = this.modelManager.getSystemStatistics()
    const strategyPerf = this.strategyService.getStrategyPerformance()

    return {
      providers: {
        total: this.providers.size,
        loaded: Array.from(this.providers.values()).filter(p => p.isLoaded).length,
        current: this.currentProvider
      },
      performance: {
        totalSelections: this.integrationMetrics.selections,
        averageAccuracy: this.integrationMetrics.averageAccuracy,
        totalSwitches: this.integrationMetrics.switches,
        averageLoadingTime:
          this.integrationMetrics.loadingTime / Math.max(this.integrationMetrics.switches, 1),
        ukrainianOptimizations: this.integrationMetrics.ukrainianOptimizations
      },
      system: modelStats,
      strategy: strategyPerf,
      lastUpdate: Date.now()
    }
  }

  /**
   * Get performance history for a provider
   */
  public getProviderPerformanceHistory(providerId: string): ModelPerformanceMetrics[] {
    return this.performanceHistory.get(providerId) || []
  }

  /**
   * Switch to a specific strategy
   */
  public switchStrategy(strategyId: string): void {
    this.strategyService.switchStrategy(strategyId)
  }

  /**
   * Get available strategies
   */
  public getAvailableStrategies() {
    return this.strategyService.getAvailableStrategies()
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    await this.modelManager.cleanup()
    this.strategyService.cleanup()
    this.providers.clear()
    this.performanceHistory.clear()
  }

  // Private helper methods

  private calculateAccuracyPriority(context: TranscriptionContext): number {
    let priority = 0.5 // Base priority

    // Higher accuracy needed for poor audio
    if (context.audioQuality === 'poor') priority += 0.3
    else if (context.audioQuality === 'fair') priority += 0.1

    // Higher accuracy for technical/medical domains
    if (context.domain === 'technical' || context.domain === 'medical') {
      priority += 0.2
    }

    // Lower priority for real-time (speed matters more)
    if (context.realTimeRequired) priority -= 0.2

    return Math.max(0, Math.min(1, priority))
  }

  private calculateLatencyPriority(context: TranscriptionContext): number {
    let priority = 0.5 // Base priority

    // Much higher priority for real-time
    if (context.realTimeRequired) priority += 0.4

    // Higher for good network (can afford some latency)
    if (context.systemMetrics.networkQuality === 'poor') priority += 0.2

    // Lower for batch processing domains
    if (context.domain === 'medical') priority -= 0.1

    return Math.max(0, Math.min(1, priority))
  }

  private buildRecentPerformance(): Record<
    string,
    {accuracy: number; latency: number; timestamp: number}
  > {
    const recent: Record<string, {accuracy: number; latency: number; timestamp: number}> = {}

    for (const [providerId, history] of this.performanceHistory.entries()) {
      if (history.length > 0) {
        const latest = history[history.length - 1]
        recent[providerId] = {
          accuracy: latest.accuracy,
          latency: latest.latency,
          timestamp: Date.now()
        }
      }
    }

    return recent
  }

  private getAlternativeReason(
    model: {
      configuration: {ukrainianSupport?: boolean; mixedLanguageSupport?: boolean}
      performance: {accuracy: number; latency: number}
    },
    criteria: ModelSelectionCriteria
  ): string {
    const reasons = []

    if (model.configuration.ukrainianSupport && criteria.detectedLanguage === 'uk') {
      reasons.push('Ukrainian support')
    }

    if (model.performance.accuracy > 0.9) {
      reasons.push('High accuracy')
    }

    if (model.performance.latency < 1500) {
      reasons.push('Low latency')
    }

    if (model.configuration.mixedLanguageSupport && criteria.mixedLanguages) {
      reasons.push('Mixed language support')
    }

    return reasons.join(', ') || 'General performance'
  }

  private setupEventHandlers(): void {
    this.modelManager.on('model:loaded', data => {
      this.emit('model:loaded', data)
    })

    this.modelManager.on('model:unloaded', data => {
      this.emit('model:unloaded', data)
    })

    this.strategyService.on('strategy:switched', data => {
      this.emit('strategy:switched', data)
    })

    this.strategyService.on('adaptive:performance_drop', data => {
      this.emit('performance:degradation', data)
    })

    this.strategyService.on('strategy:adapted', data => {
      this.emit('strategy:adapted', data)
    })
  }
}

/**
 * Factory function to create integration instance
 */
export function createLanguageModelManagerIntegration(): LanguageModelManagerIntegration {
  return new LanguageModelManagerIntegration()
}

export default LanguageModelManagerIntegration
