/**
 * Language Model Manager
 *
 * Manages language-specific transcription models and their configuration.
 * Provides dynamic model loading, unloading, and selection based on
 * detected languages and quality metrics.
 */

import {EventEmitter} from 'events'

// Model types and interfaces
export interface LanguageModel {
  id: string
  name: string
  language: string
  version: string
  modelType: 'general' | 'specialized' | 'fine-tuned' | 'hybrid'
  provider: string
  configuration: ModelConfiguration
  performance: ModelPerformanceMetrics
  lastUpdated: number
  isLoaded: boolean
  memoryUsage?: number // MB
  loadTime?: number // ms
}

export interface ModelConfiguration {
  // Audio processing settings
  sampleRate: number
  audioFormat: 'wav' | 'mp3' | 'opus' | 'flac'
  channels: number
  bitDepth: number

  // Language-specific settings
  vocabulary?: string[]
  customPhrases?: string[]
  domainAdaptation?: 'general' | 'business' | 'medical' | 'legal' | 'technical'
  speakerAdaptation?: boolean

  // Processing parameters
  beamSize?: number
  temperature?: number
  repetitionPenalty?: number
  lengthPenalty?: number

  // Ukrainian-specific settings
  ukrainianDialect?: 'standard' | 'western' | 'eastern' | 'southern'
  cyrillicNormalization?: boolean
  transliterationSupport?: boolean

  // Mixed language settings
  languageSwitchingEnabled?: boolean
  codeBlendingThreshold?: number
  translationFallback?: boolean
}

export interface ModelPerformanceMetrics {
  accuracy: number
  latency: number
  memoryEfficiency: number
  cpuUsage: number
  loadingTime: number

  // Language-specific performance
  languageAccuracy: Record<string, number>
  mixedLanguagePerformance: number
  domainSpecificAccuracy?: Record<string, number>

  // Quality metrics over time
  recentPerformance: {
    accuracy: number[]
    latency: number[]
    timestamps: number[]
  }
}

export interface ModelSelectionCriteria {
  detectedLanguage: string
  confidence: number
  mixedLanguages?: string[]
  domain?: string
  audioQuality?: 'poor' | 'fair' | 'good' | 'excellent'
  realTimeRequired?: boolean
  accuracyPriority?: number // 0-1 (1 = highest priority)
  latencyPriority?: number // 0-1 (1 = lowest latency required)
  memoryConstraints?: boolean
  userPreference?: string
}

export interface ModelSelectionResult {
  selectedModel: LanguageModel
  confidence: number
  reason: string
  alternativeModels: LanguageModel[]
  expectedPerformance: {
    accuracy: number
    latency: number
    memoryUsage: number
  }
  loadingRequired: boolean
  estimatedLoadTime: number
}

export interface ModelLoadingProgress {
  modelId: string
  stage: 'downloading' | 'extracting' | 'initializing' | 'verifying' | 'complete' | 'error'
  progress: number // 0-1
  message: string
  timeRemaining?: number // seconds
  error?: string
}

export interface LanguageModelManagerConfig {
  // Model storage settings
  modelCacheDirectory: string
  maxCachedModels: number
  maxMemoryUsage: number // MB
  modelRetentionTime: number // ms

  // Loading settings
  enablePreloading: boolean
  preloadPrimaryLanguages: string[]
  loadingTimeout: number // ms
  maxConcurrentLoads: number

  // Selection strategy
  selectionStrategy: 'accuracy_first' | 'speed_first' | 'balanced' | 'adaptive'
  ukrainianOptimization: boolean
  mixedLanguageSupport: boolean
  fallbackStrategy: 'generic' | 'best_available' | 'provider_default'

  // Performance monitoring
  enablePerformanceTracking: boolean
  performanceUpdateInterval: number // ms
  enableAdaptiveLearning: boolean
  modelUpdateThreshold: number // Performance improvement threshold

  // Provider integration
  enabledProviders: string[]
  providerPriority: string[]
  enableModelSharing: boolean
}

/**
 * Language Model Manager Service
 */
export class LanguageModelManager extends EventEmitter {
  private config: LanguageModelManagerConfig
  private availableModels: Map<string, LanguageModel> = new Map()
  private loadedModels: Map<string, LanguageModel> = new Map()
  private loadingQueue: Map<string, Promise<void>> = new Map()
  private performanceHistory: Map<string, ModelPerformanceMetrics> = new Map()
  private lastUsedTimes: Map<string, number> = new Map()
  private memoryUsage = 0
  private isInitialized = false

  constructor(config: LanguageModelManagerConfig) {
    super()
    this.config = config
  }

  /**
   * Initialize the Language Model Manager
   */
  public async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing Language Model Manager...')

      // Load available model configurations
      await this.loadModelCatalog()

      // Setup performance monitoring
      if (this.config.enablePerformanceTracking) {
        this.startPerformanceMonitoring()
      }

      // Preload primary language models if enabled
      if (this.config.enablePreloading) {
        await this.preloadPrimaryModels()
      }

      this.isInitialized = true
      this.emit('initialized')

      console.log(
        `✅ Language Model Manager initialized with ${this.availableModels.size} available models`
      )
    } catch (error) {
      this.emit('initialization:error', error)
      throw new Error(`Failed to initialize Language Model Manager: ${error}`)
    }
  }

  /**
   * Get the best model for given selection criteria
   */
  public async selectModel(criteria: ModelSelectionCriteria): Promise<ModelSelectionResult> {
    if (!this.isInitialized) {
      throw new Error('Language Model Manager not initialized')
    }

    console.log(`🔍 Selecting model for language: ${criteria.detectedLanguage}`)

    // Get candidate models
    const candidates = this.getCandidateModels(criteria)

    if (candidates.length === 0) {
      throw new Error(`No available models for language: ${criteria.detectedLanguage}`)
    }

    // Apply selection strategy
    const selectedModel = this.applySelectionStrategy(candidates, criteria)

    // Calculate expected performance
    const expectedPerformance = this.calculateExpectedPerformance(selectedModel, criteria)

    // Check if model needs to be loaded
    const loadingRequired = !selectedModel.isLoaded
    const estimatedLoadTime = loadingRequired ? selectedModel.performance.loadingTime || 2000 : 0

    // Prepare alternative models
    const alternativeModels = candidates.filter(m => m.id !== selectedModel.id).slice(0, 3)

    const result: ModelSelectionResult = {
      selectedModel,
      confidence: this.calculateSelectionConfidence(selectedModel, criteria),
      reason: this.generateSelectionReason(selectedModel, criteria),
      alternativeModels,
      expectedPerformance,
      loadingRequired,
      estimatedLoadTime
    }

    this.emit('model:selected', result)
    return result
  }

  /**
   * Load a specific model
   */
  public async loadModel(modelId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Language Model Manager not initialized')
    }

    // Check if already loaded
    if (this.loadedModels.has(modelId)) {
      console.log(`✅ Model ${modelId} already loaded`)
      return
    }

    // Check if already loading
    if (this.loadingQueue.has(modelId)) {
      console.log(`⏳ Model ${modelId} already loading, waiting...`)
      await this.loadingQueue.get(modelId)
      return
    }

    // Get model configuration
    const model = this.availableModels.get(modelId)
    if (!model) {
      throw new Error(`Model ${modelId} not found in catalog`)
    }

    // Check memory constraints
    if (this.memoryUsage + (model.memoryUsage || 0) > this.config.maxMemoryUsage) {
      await this.freeMemoryForModel(model)
    }

    // Start loading process
    const loadingPromise = this.performModelLoading(model)
    this.loadingQueue.set(modelId, loadingPromise)

    try {
      await loadingPromise
      console.log(`✅ Model ${modelId} loaded successfully`)
    } finally {
      this.loadingQueue.delete(modelId)
    }
  }

  /**
   * Unload a specific model
   */
  public async unloadModel(modelId: string): Promise<void> {
    const model = this.loadedModels.get(modelId)
    if (!model) {
      console.log(`⚠️ Model ${modelId} not loaded`)
      return
    }

    try {
      this.emit('model:unloading', {modelId, model})

      // Perform actual unloading (provider-specific)
      await this.performModelUnloading(model)

      // Update state
      model.isLoaded = false
      this.loadedModels.delete(modelId)
      this.memoryUsage -= model.memoryUsage || 0

      this.emit('model:unloaded', {modelId, model})
      console.log(`🗑️ Model ${modelId} unloaded`)
    } catch (error) {
      this.emit('model:unload_error', {modelId, error})
      throw new Error(`Failed to unload model ${modelId}: ${error}`)
    }
  }

  /**
   * Get model performance metrics
   */
  public getModelPerformance(modelId: string): ModelPerformanceMetrics | null {
    return this.performanceHistory.get(modelId) || null
  }

  /**
   * Update model performance metrics
   */
  public updateModelPerformance(modelId: string, metrics: Partial<ModelPerformanceMetrics>): void {
    const existingMetrics = this.performanceHistory.get(modelId) || this.createDefaultMetrics()

    // Update metrics
    const updatedMetrics: ModelPerformanceMetrics = {
      ...existingMetrics,
      ...metrics,
      recentPerformance: {
        accuracy: [
          ...(existingMetrics.recentPerformance?.accuracy || []),
          metrics.accuracy || 0
        ].slice(-20),
        latency: [
          ...(existingMetrics.recentPerformance?.latency || []),
          metrics.latency || 0
        ].slice(-20),
        timestamps: [...(existingMetrics.recentPerformance?.timestamps || []), Date.now()].slice(
          -20
        )
      }
    }

    this.performanceHistory.set(modelId, updatedMetrics)

    // Update model in available models
    const model = this.availableModels.get(modelId)
    if (model) {
      model.performance = updatedMetrics
    }

    this.emit('performance:updated', {modelId, metrics: updatedMetrics})
  }

  /**
   * Get all loaded models
   */
  public getLoadedModels(): LanguageModel[] {
    return Array.from(this.loadedModels.values())
  }

  /**
   * Get all available models
   */
  public getAvailableModels(): LanguageModel[] {
    return Array.from(this.availableModels.values())
  }

  /**
   * Get models for specific language
   */
  public getModelsForLanguage(language: string): LanguageModel[] {
    return Array.from(this.availableModels.values()).filter(
      model =>
        model.language === language ||
        model.language === 'mixed' ||
        model.configuration.languageSwitchingEnabled
    )
  }

  /**
   * Get system statistics
   */
  public getSystemStatistics(): {
    memoryUsage: number
    loadedModels: number
    availableModels: number
    performanceTracking: boolean
    recentActivity: Array<{modelId: string; lastUsed: number}>
  } {
    const recentActivity = Array.from(this.lastUsedTimes.entries())
      .map(([modelId, lastUsed]) => ({modelId, lastUsed}))
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 10)

    return {
      memoryUsage: this.memoryUsage,
      loadedModels: this.loadedModels.size,
      availableModels: this.availableModels.size,
      performanceTracking: this.config.enablePerformanceTracking,
      recentActivity
    }
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Language Model Manager...')

    // Unload all models
    const unloadPromises = Array.from(this.loadedModels.keys()).map(id => this.unloadModel(id))
    await Promise.allSettled(unloadPromises)

    // Clear data structures
    this.availableModels.clear()
    this.loadedModels.clear()
    this.loadingQueue.clear()
    this.performanceHistory.clear()
    this.lastUsedTimes.clear()

    this.memoryUsage = 0
    this.isInitialized = false

    this.removeAllListeners()
    console.log('✅ Language Model Manager cleanup completed')
  }

  // Private helper methods

  private async loadModelCatalog(): Promise<void> {
    // Load model configurations (in a real implementation, this would load from files/database)
    const modelConfigurations = this.getDefaultModelConfigurations()

    for (const config of modelConfigurations) {
      this.availableModels.set(config.id, config)
    }

    console.log(`📚 Loaded ${modelConfigurations.length} model configurations`)
  }

  private getCandidateModels(criteria: ModelSelectionCriteria): LanguageModel[] {
    const candidates: LanguageModel[] = []

    for (const model of this.availableModels.values()) {
      // Check language compatibility
      if (this.isModelCompatible(model, criteria)) {
        candidates.push(model)
      }
    }

    // Sort by relevance
    return candidates.sort(
      (a, b) =>
        this.calculateModelRelevance(b, criteria) - this.calculateModelRelevance(a, criteria)
    )
  }

  private isModelCompatible(model: LanguageModel, criteria: ModelSelectionCriteria): boolean {
    // Direct language match
    if (model.language === criteria.detectedLanguage) return true

    // Mixed language support
    if (criteria.mixedLanguages && model.configuration.languageSwitchingEnabled) {
      return criteria.mixedLanguages.some(
        lang => model.language === lang || model.language === 'mixed'
      )
    }

    // Generic/universal models
    if (model.language === 'universal' || model.language === 'mixed') return true

    return false
  }

  private calculateModelRelevance(model: LanguageModel, criteria: ModelSelectionCriteria): number {
    let score = 0

    // Language match bonus
    if (model.language === criteria.detectedLanguage) {
      score += 1.0
    } else if (model.language === 'mixed' && criteria.mixedLanguages) {
      score += 0.8
    }

    // Performance score
    score += model.performance.accuracy * 0.5
    score += (1 - model.performance.latency / 5000) * 0.3 // Normalize latency

    // Specialized model bonus
    if (model.modelType === 'specialized' || model.modelType === 'fine-tuned') {
      score += 0.2
    }

    // Ukrainian optimization bonus
    if (criteria.detectedLanguage === 'uk' && model.configuration.ukrainianDialect) {
      score += 0.3
    }

    return score
  }

  private applySelectionStrategy(
    candidates: LanguageModel[],
    criteria: ModelSelectionCriteria
  ): LanguageModel {
    if (candidates.length === 0) {
      throw new Error('No candidate models available')
    }

    switch (this.config.selectionStrategy) {
      case 'accuracy_first':
        return candidates.sort((a, b) => b.performance.accuracy - a.performance.accuracy)[0]

      case 'speed_first':
        return candidates.sort((a, b) => a.performance.latency - b.performance.latency)[0]

      case 'balanced':
        return candidates.sort((a, b) => {
          const scoreA = a.performance.accuracy * 0.6 + (1 - a.performance.latency / 5000) * 0.4
          const scoreB = b.performance.accuracy * 0.6 + (1 - b.performance.latency / 5000) * 0.4
          return scoreB - scoreA
        })[0]

      case 'adaptive':
        // Use criteria priorities if available
        const accuracyWeight = criteria.accuracyPriority || 0.5
        const latencyWeight = criteria.latencyPriority || 0.5

        return candidates.sort((a, b) => {
          const scoreA =
            a.performance.accuracy * accuracyWeight +
            (1 - a.performance.latency / 5000) * latencyWeight
          const scoreB =
            b.performance.accuracy * accuracyWeight +
            (1 - b.performance.latency / 5000) * latencyWeight
          return scoreB - scoreA
        })[0]

      default:
        return candidates[0]
    }
  }

  private calculateExpectedPerformance(
    model: LanguageModel,
    criteria: ModelSelectionCriteria
  ): {accuracy: number; latency: number; memoryUsage: number} {
    let accuracy = model.performance.accuracy
    let latency = model.performance.latency

    // Adjust for language-specific performance
    if (model.performance.languageAccuracy[criteria.detectedLanguage]) {
      accuracy = model.performance.languageAccuracy[criteria.detectedLanguage]
    }

    // Adjust for mixed language scenarios
    if (criteria.mixedLanguages && criteria.mixedLanguages.length > 1) {
      accuracy *= model.performance.mixedLanguagePerformance
      latency *= 1.1 // Slight latency increase for mixed languages
    }

    // Adjust for audio quality
    if (criteria.audioQuality === 'poor') {
      accuracy *= 0.8
      latency *= 1.2
    } else if (criteria.audioQuality === 'excellent') {
      accuracy *= 1.1
      latency *= 0.9
    }

    return {
      accuracy: Math.min(1.0, accuracy),
      latency: Math.max(100, latency),
      memoryUsage: model.memoryUsage || 0
    }
  }

  private calculateSelectionConfidence(
    model: LanguageModel,
    criteria: ModelSelectionCriteria
  ): number {
    let confidence = 0.5 // Base confidence

    // Language match increases confidence
    if (model.language === criteria.detectedLanguage) {
      confidence += 0.3
    }

    // High model performance increases confidence
    if (model.performance.accuracy > 0.9) {
      confidence += 0.2
    }

    // Specialized models increase confidence
    if (model.modelType === 'specialized' || model.modelType === 'fine-tuned') {
      confidence += 0.1
    }

    // Detection confidence affects selection confidence
    confidence *= criteria.confidence

    return Math.min(1.0, confidence)
  }

  private generateSelectionReason(model: LanguageModel, criteria: ModelSelectionCriteria): string {
    const reasons: string[] = []

    if (model.language === criteria.detectedLanguage) {
      reasons.push(`Direct language match (${criteria.detectedLanguage})`)
    }

    if (model.performance.accuracy > 0.9) {
      reasons.push(`High accuracy (${(model.performance.accuracy * 100).toFixed(1)}%)`)
    }

    if (model.modelType === 'specialized') {
      reasons.push('Specialized model for language')
    }

    if (model.configuration.ukrainianDialect && criteria.detectedLanguage === 'uk') {
      reasons.push('Ukrainian dialect optimization')
    }

    if (reasons.length === 0) {
      reasons.push(`Best available model for strategy: ${this.config.selectionStrategy}`)
    }

    return reasons.join(', ')
  }

  private async performModelLoading(model: LanguageModel): Promise<void> {
    const startTime = Date.now()

    try {
      this.emit('model:loading', {
        modelId: model.id,
        stage: 'initializing',
        progress: 0,
        message: 'Starting model loading...'
      })

      // Simulate loading stages (in real implementation, this would do actual loading)
      const stages = [
        {stage: 'downloading', message: 'Downloading model files...', duration: 1000},
        {stage: 'extracting', message: 'Extracting model data...', duration: 500},
        {stage: 'initializing', message: 'Initializing model...', duration: 800},
        {stage: 'verifying', message: 'Verifying model integrity...', duration: 300}
      ]

      let totalProgress = 0

      for (const [index, stageInfo] of stages.entries()) {
        this.emit('model:loading', {
          modelId: model.id,
          stage: stageInfo.stage as any,
          progress: totalProgress,
          message: stageInfo.message
        })

        // Simulate stage duration
        await new Promise(resolve => setTimeout(resolve, stageInfo.duration))

        totalProgress = (index + 1) / stages.length
      }

      // Mark as loaded
      model.isLoaded = true
      model.loadTime = Date.now() - startTime
      this.loadedModels.set(model.id, model)
      this.memoryUsage += model.memoryUsage || 0
      this.lastUsedTimes.set(model.id, Date.now())

      this.emit('model:loading', {
        modelId: model.id,
        stage: 'complete',
        progress: 1.0,
        message: 'Model loaded successfully'
      })

      this.emit('model:loaded', {model, loadTime: model.loadTime})
    } catch (error) {
      this.emit('model:loading', {
        modelId: model.id,
        stage: 'error',
        progress: 0,
        message: 'Model loading failed',
        error: `${error}`
      })

      throw error
    }
  }

  private async performModelUnloading(model: LanguageModel): Promise<void> {
    // Simulate unloading process
    await new Promise(resolve => setTimeout(resolve, 200))

    // In a real implementation, this would call provider-specific unloading
    console.log(`Unloading model ${model.id}...`)
  }

  private async freeMemoryForModel(newModel: LanguageModel): Promise<void> {
    const requiredMemory = newModel.memoryUsage || 0
    const availableMemory = this.config.maxMemoryUsage - this.memoryUsage

    if (availableMemory >= requiredMemory) {
      return // No need to free memory
    }

    // Find models to unload (LRU strategy)
    const sortedModels = Array.from(this.loadedModels.values()).sort(
      (a, b) => (this.lastUsedTimes.get(a.id) || 0) - (this.lastUsedTimes.get(b.id) || 0)
    )

    let freedMemory = 0
    const modelsToUnload: string[] = []

    for (const model of sortedModels) {
      modelsToUnload.push(model.id)
      freedMemory += model.memoryUsage || 0

      if (freedMemory >= requiredMemory) {
        break
      }
    }

    // Unload selected models
    for (const modelId of modelsToUnload) {
      await this.unloadModel(modelId)
    }

    console.log(`🗑️ Freed ${freedMemory}MB of memory by unloading ${modelsToUnload.length} models`)
  }

  private async preloadPrimaryModels(): Promise<void> {
    console.log('🔄 Preloading primary language models...')

    const preloadPromises = this.config.preloadPrimaryLanguages.map(async language => {
      const models = this.getModelsForLanguage(language)
      if (models.length > 0) {
        try {
          await this.loadModel(models[0].id)
        } catch (error) {
          console.warn(`⚠️ Failed to preload model for ${language}:`, error)
        }
      }
    })

    await Promise.allSettled(preloadPromises)
    console.log(
      `✅ Preloading completed for languages: ${this.config.preloadPrimaryLanguages.join(', ')}`
    )
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.emit('performance:monitoring', {
        memoryUsage: this.memoryUsage,
        loadedModels: this.loadedModels.size,
        recentActivity: Array.from(this.lastUsedTimes.entries())
      })
    }, this.config.performanceUpdateInterval)
  }

  private createDefaultMetrics(): ModelPerformanceMetrics {
    return {
      accuracy: 0.7,
      latency: 2000,
      memoryEfficiency: 0.8,
      cpuUsage: 0.5,
      loadingTime: 2000,
      languageAccuracy: {},
      mixedLanguagePerformance: 0.6,
      recentPerformance: {
        accuracy: [],
        latency: [],
        timestamps: []
      }
    }
  }

  private getDefaultModelConfigurations(): LanguageModel[] {
    return [
      // OpenAI Whisper models
      {
        id: 'whisper-large-v3-uk',
        name: 'Whisper Large v3 (Ukrainian)',
        language: 'uk',
        version: '3.0',
        modelType: 'specialized',
        provider: 'openai',
        configuration: {
          sampleRate: 16000,
          audioFormat: 'wav',
          channels: 1,
          bitDepth: 16,
          ukrainianDialect: 'standard',
          cyrillicNormalization: true,
          languageSwitchingEnabled: true
        },
        performance: {
          accuracy: 0.92,
          latency: 1800,
          memoryEfficiency: 0.7,
          cpuUsage: 0.6,
          loadingTime: 3000,
          languageAccuracy: {uk: 0.94, en: 0.88},
          mixedLanguagePerformance: 0.87,
          recentPerformance: {accuracy: [], latency: [], timestamps: []}
        },
        lastUpdated: Date.now(),
        isLoaded: false,
        memoryUsage: 2800
      },

      // Google Speech models
      {
        id: 'google-enhanced-uk',
        name: 'Google Enhanced Ukrainian',
        language: 'uk',
        version: '1.0',
        modelType: 'fine-tuned',
        provider: 'google',
        configuration: {
          sampleRate: 16000,
          audioFormat: 'wav',
          channels: 1,
          bitDepth: 16,
          ukrainianDialect: 'western',
          languageSwitchingEnabled: true,
          transliterationSupport: true
        },
        performance: {
          accuracy: 0.89,
          latency: 1200,
          memoryEfficiency: 0.8,
          cpuUsage: 0.4,
          loadingTime: 1500,
          languageAccuracy: {uk: 0.91, en: 0.85},
          mixedLanguagePerformance: 0.83,
          recentPerformance: {accuracy: [], latency: [], timestamps: []}
        },
        lastUpdated: Date.now(),
        isLoaded: false,
        memoryUsage: 1800
      },

      // English models
      {
        id: 'whisper-large-v3-en',
        name: 'Whisper Large v3 (English)',
        language: 'en',
        version: '3.0',
        modelType: 'specialized',
        provider: 'openai',
        configuration: {
          sampleRate: 16000,
          audioFormat: 'wav',
          channels: 1,
          bitDepth: 16,
          languageSwitchingEnabled: true
        },
        performance: {
          accuracy: 0.95,
          latency: 1600,
          memoryEfficiency: 0.7,
          cpuUsage: 0.5,
          loadingTime: 2800,
          languageAccuracy: {en: 0.96, uk: 0.78},
          mixedLanguagePerformance: 0.82,
          recentPerformance: {accuracy: [], latency: [], timestamps: []}
        },
        lastUpdated: Date.now(),
        isLoaded: false,
        memoryUsage: 2800
      },

      // Mixed language model
      {
        id: 'mixed-language-transformer',
        name: 'Mixed Language Transformer',
        language: 'mixed',
        version: '2.1',
        modelType: 'hybrid',
        provider: 'custom',
        configuration: {
          sampleRate: 16000,
          audioFormat: 'wav',
          channels: 1,
          bitDepth: 16,
          languageSwitchingEnabled: true,
          codeBlendingThreshold: 0.3,
          translationFallback: true
        },
        performance: {
          accuracy: 0.85,
          latency: 2200,
          memoryEfficiency: 0.6,
          cpuUsage: 0.7,
          loadingTime: 4000,
          languageAccuracy: {uk: 0.87, en: 0.89, mixed: 0.85},
          mixedLanguagePerformance: 0.91,
          recentPerformance: {accuracy: [], latency: [], timestamps: []}
        },
        lastUpdated: Date.now(),
        isLoaded: false,
        memoryUsage: 3200
      }
    ]
  }
}

// Factory function
export function createLanguageModelManager(
  config: LanguageModelManagerConfig
): LanguageModelManager {
  return new LanguageModelManager(config)
}

// Default configuration
export const DEFAULT_MODEL_MANAGER_CONFIG: LanguageModelManagerConfig = {
  modelCacheDirectory: './models',
  maxCachedModels: 5,
  maxMemoryUsage: 8192, // 8GB
  modelRetentionTime: 24 * 60 * 60 * 1000, // 24 hours

  enablePreloading: true,
  preloadPrimaryLanguages: ['uk', 'en'],
  loadingTimeout: 30000, // 30 seconds
  maxConcurrentLoads: 2,

  selectionStrategy: 'balanced',
  ukrainianOptimization: true,
  mixedLanguageSupport: true,
  fallbackStrategy: 'best_available',

  enablePerformanceTracking: true,
  performanceUpdateInterval: 60000, // 1 minute
  enableAdaptiveLearning: true,
  modelUpdateThreshold: 0.05,

  enabledProviders: ['openai', 'google', 'azure', 'custom'],
  providerPriority: ['openai', 'google', 'azure', 'custom'],
  enableModelSharing: false
}

export const UKRAINIAN_OPTIMIZED_CONFIG: LanguageModelManagerConfig = {
  ...DEFAULT_MODEL_MANAGER_CONFIG,
  preloadPrimaryLanguages: ['uk', 'en', 'mixed'],
  selectionStrategy: 'adaptive',
  ukrainianOptimization: true,
  mixedLanguageSupport: true,
  maxMemoryUsage: 12288, // 12GB for Ukrainian models
  enableAdaptiveLearning: true
}
