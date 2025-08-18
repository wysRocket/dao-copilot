/**
 * Model Selection Strategy Service
 *
 * Implements intelligent model selection strategies based on language detection,
 * quality metrics, performance requirements, and contextual factors.
 * Provides dynamic adaptation and learning capabilities.
 */

import {EventEmitter} from 'events'
import type {
  LanguageModel,
  ModelSelectionCriteria,
  ModelPerformanceMetrics
} from './LanguageModelManager'

// Strategy types and interfaces
export interface SelectionStrategy {
  id: string
  name: string
  description: string
  priority: number
  enabled: boolean
  configuration: StrategyConfiguration
}

export interface StrategyConfiguration {
  weights: {
    accuracy: number
    latency: number
    memoryUsage: number
    providerReliability: number
    languageSpecificity: number
    mixedLanguageSupport: number
  }

  thresholds: {
    minimumAccuracy: number
    maximumLatency: number
    memoryLimit: number
    confidenceThreshold: number
  }

  preferences: {
    favorSpecializedModels: boolean
    enableFallback: boolean
    adaptiveWeighting: boolean
    contextAwareness: boolean
  }

  ukrainianOptimizations: {
    enabled: boolean
    dialectPreference: 'standard' | 'western' | 'eastern' | 'southern' | 'auto'
    transliterationSupport: boolean
    mixedLanguageBonus: number
  }
}

export interface SelectionContext {
  // Current session context
  sessionLanguages: string[]
  primaryLanguage: string
  recentPerformance: Record<string, number>
  userFeedback: Record<string, number>

  // Audio context
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent'
  backgroundNoise: 'low' | 'medium' | 'high'
  speakerCharacteristics: 'single' | 'multiple' | 'unknown'

  // System context
  availableMemory: number
  cpuUsage: number
  networkQuality: 'poor' | 'fair' | 'good' | 'excellent'
  realTimeRequired: boolean

  // Domain context
  domain: 'general' | 'business' | 'medical' | 'legal' | 'technical' | 'casual'
  terminology: 'simple' | 'complex' | 'mixed'
  expectedLength: 'short' | 'medium' | 'long'
}

export interface SelectionAnalysis {
  selectedModel: LanguageModel
  confidence: number
  reasoning: SelectionReasoning[]
  alternatives: Array<{
    model: LanguageModel
    score: number
    reason: string
  }>
  expectedOutcome: {
    accuracy: number
    latency: number
    memoryUsage: number
    reliability: number
  }
  risks: string[]
  recommendations: string[]
}

export interface SelectionReasoning {
  factor: string
  weight: number
  score: number
  description: string
  impact: 'positive' | 'negative' | 'neutral'
}

export interface AdaptiveLearning {
  enabled: boolean
  learningRate: number
  historySize: number
  adaptationTriggers: {
    performanceDropThreshold: number
    feedbackThreshold: number
    contextChangeThreshold: number
  }
}

export interface ModelSelectionStrategyConfig {
  // Default strategy settings
  defaultStrategy: string
  enableMultiStrategy: boolean
  strategySelectionCriteria: 'performance' | 'context' | 'user_preference' | 'adaptive'

  // Adaptive learning
  adaptiveLearning: AdaptiveLearning

  // Performance monitoring
  enablePerformanceTracking: boolean
  performanceWindowSize: number
  performanceUpdateThreshold: number

  // Fallback handling
  fallbackStrategy: 'best_available' | 'generic' | 'user_choice'
  fallbackTimeout: number
  maxFallbackAttempts: number

  // Context awareness
  contextSensitivity: number // 0-1
  enableContextualAdaptation: boolean
  contextHistorySize: number

  // Ukrainian-specific settings
  ukrainianOptimization: {
    enabled: boolean
    prioritizeNativeModels: boolean
    dialectAwareness: boolean
    transliterationFallback: boolean
  }
}

/**
 * Model Selection Strategy Service
 */
export class ModelSelectionStrategyService extends EventEmitter {
  private config: ModelSelectionStrategyConfig
  private strategies: Map<string, SelectionStrategy> = new Map()
  private currentStrategy: string
  private performanceHistory: Map<
    string,
    Array<{timestamp: number; metrics: ModelPerformanceMetrics}>
  > = new Map()
  private contextHistory: SelectionContext[] = []
  private selectionHistory: Array<{
    timestamp: number
    context: SelectionContext
    selection: SelectionAnalysis
    actualPerformance?: ModelPerformanceMetrics
  }> = []
  private isInitialized = false

  constructor(config: ModelSelectionStrategyConfig) {
    super()
    this.config = config
    this.currentStrategy = config.defaultStrategy
  }

  /**
   * Initialize the Model Selection Strategy Service
   */
  public async initialize(): Promise<void> {
    try {
      console.log('🧠 Initializing Model Selection Strategy Service...')

      // Initialize default strategies
      this.initializeDefaultStrategies()

      // Load historical data if adaptive learning is enabled
      if (this.config.adaptiveLearning.enabled) {
        await this.loadHistoricalData()
      }

      this.isInitialized = true
      this.emit('initialized')

      console.log(
        `✅ Model Selection Strategy Service initialized with ${this.strategies.size} strategies`
      )
    } catch (error) {
      this.emit('initialization:error', error)
      throw new Error(`Failed to initialize Model Selection Strategy Service: ${error}`)
    }
  }

  /**
   * Select the best model using the current strategy
   */
  public async selectModel(
    availableModels: LanguageModel[],
    criteria: ModelSelectionCriteria,
    context?: SelectionContext
  ): Promise<SelectionAnalysis> {
    if (!this.isInitialized) {
      throw new Error('Model Selection Strategy Service not initialized')
    }

    if (availableModels.length === 0) {
      throw new Error('No available models provided')
    }

    console.log(`🎯 Selecting model using strategy: ${this.currentStrategy}`)

    // Get current strategy
    const strategy = this.strategies.get(this.currentStrategy)
    if (!strategy) {
      throw new Error(`Strategy ${this.currentStrategy} not found`)
    }

    // Build enhanced context
    const enhancedContext = this.buildEnhancedContext(criteria, context)

    // Apply selection strategy
    const analysis = await this.applySelectionStrategy(
      availableModels,
      criteria,
      enhancedContext,
      strategy
    )

    // Record selection
    this.recordSelection(enhancedContext, analysis)

    // Update context history
    this.updateContextHistory(enhancedContext)

    this.emit('model:selected', analysis)
    return analysis
  }

  /**
   * Update model performance and adapt strategies
   */
  public updateModelPerformance(modelId: string, performance: ModelPerformanceMetrics): void {
    if (!this.performanceHistory.has(modelId)) {
      this.performanceHistory.set(modelId, [])
    }

    const history = this.performanceHistory.get(modelId)!
    history.push({
      timestamp: Date.now(),
      metrics: performance
    })

    // Limit history size
    const maxSize = this.config.performanceWindowSize || 100
    if (history.length > maxSize) {
      history.splice(0, history.length - maxSize)
    }

    // Trigger adaptive learning if enabled
    if (this.config.adaptiveLearning.enabled) {
      this.triggerAdaptiveLearning(modelId, performance)
    }

    this.emit('performance:updated', {modelId, performance})
  }

  /**
   * Add or update a selection strategy
   */
  public addStrategy(strategy: SelectionStrategy): void {
    this.strategies.set(strategy.id, strategy)
    this.emit('strategy:added', strategy)
  }

  /**
   * Switch to a different strategy
   */
  public switchStrategy(strategyId: string): void {
    if (!this.strategies.has(strategyId)) {
      throw new Error(`Strategy ${strategyId} not found`)
    }

    const previousStrategy = this.currentStrategy
    this.currentStrategy = strategyId

    this.emit('strategy:switched', {
      from: previousStrategy,
      to: strategyId
    })

    console.log(`🔄 Switched to strategy: ${strategyId}`)
  }

  /**
   * Get strategy performance analysis
   */
  public getStrategyPerformance(strategyId?: string): {
    strategy: string
    totalSelections: number
    averageAccuracy: number
    averageLatency: number
    successRate: number
    recentTrend: 'improving' | 'stable' | 'declining'
    recommendations: string[]
  } {
    const targetStrategy = strategyId || this.currentStrategy

    const strategySelections = this.selectionHistory.filter(
      entry => entry.selection.selectedModel.id.includes(targetStrategy) // Simplified check
    )

    if (strategySelections.length === 0) {
      return {
        strategy: targetStrategy,
        totalSelections: 0,
        averageAccuracy: 0,
        averageLatency: 0,
        successRate: 0,
        recentTrend: 'stable',
        recommendations: ['Strategy has not been used yet']
      }
    }

    const accuracies = strategySelections
      .filter(s => s.actualPerformance)
      .map(s => s.actualPerformance!.accuracy)

    const latencies = strategySelections
      .filter(s => s.actualPerformance)
      .map(s => s.actualPerformance!.latency)

    const averageAccuracy =
      accuracies.length > 0 ? accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length : 0

    const averageLatency =
      latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0

    const successRate =
      strategySelections.filter(s => s.actualPerformance && s.actualPerformance.accuracy > 0.8)
        .length / strategySelections.length

    const recentTrend = this.calculateRecentTrend(strategySelections)
    const recommendations = this.generateStrategyRecommendations(targetStrategy, strategySelections)

    return {
      strategy: targetStrategy,
      totalSelections: strategySelections.length,
      averageAccuracy,
      averageLatency,
      successRate,
      recentTrend,
      recommendations
    }
  }

  /**
   * Get all available strategies
   */
  public getAvailableStrategies(): SelectionStrategy[] {
    return Array.from(this.strategies.values())
  }

  /**
   * Get current strategy details
   */
  public getCurrentStrategy(): SelectionStrategy {
    const strategy = this.strategies.get(this.currentStrategy)
    if (!strategy) {
      throw new Error(`Current strategy ${this.currentStrategy} not found`)
    }
    return strategy
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    console.log('🧹 Cleaning up Model Selection Strategy Service...')

    this.strategies.clear()
    this.performanceHistory.clear()
    this.contextHistory = []
    this.selectionHistory = []

    this.isInitialized = false
    this.removeAllListeners()

    console.log('✅ Model Selection Strategy Service cleanup completed')
  }

  // Private helper methods

  private buildEnhancedContext(
    criteria: ModelSelectionCriteria,
    context?: SelectionContext
  ): SelectionContext {
    const defaultContext: SelectionContext = {
      sessionLanguages: [criteria.detectedLanguage, ...(criteria.mixedLanguages || [])],
      primaryLanguage: criteria.detectedLanguage,
      recentPerformance: {},
      userFeedback: {},
      audioQuality: criteria.audioQuality || 'good',
      backgroundNoise: 'medium',
      speakerCharacteristics: 'unknown',
      availableMemory: 8192,
      cpuUsage: 0.5,
      networkQuality: 'good',
      realTimeRequired: criteria.realTimeRequired || false,
      domain: criteria.domain || 'general',
      terminology: 'mixed',
      expectedLength: 'medium'
    }

    return {...defaultContext, ...context}
  }

  private async applySelectionStrategy(
    availableModels: LanguageModel[],
    criteria: ModelSelectionCriteria,
    context: SelectionContext,
    strategy: SelectionStrategy
  ): Promise<SelectionAnalysis> {
    // Score all models
    const modelScores = await Promise.all(
      availableModels.map(async model => ({
        model,
        score: await this.calculateModelScore(model, criteria, context, strategy),
        reasoning: this.generateModelReasoning(model, criteria, context, strategy)
      }))
    )

    // Sort by score
    modelScores.sort((a, b) => b.score - a.score)

    const selectedModel = modelScores[0].model
    const confidence = this.calculateSelectionConfidence(modelScores[0].score, modelScores)

    // Build analysis
    const analysis: SelectionAnalysis = {
      selectedModel,
      confidence,
      reasoning: modelScores[0].reasoning,
      alternatives: modelScores.slice(1, 4).map(ms => ({
        model: ms.model,
        score: ms.score,
        reason: this.summarizeReasoning(ms.reasoning)
      })),
      expectedOutcome: this.calculateExpectedOutcome(selectedModel, criteria, context),
      risks: this.identifyRisks(selectedModel, criteria, context),
      recommendations: this.generateRecommendations(selectedModel, criteria, context)
    }

    return analysis
  }

  private async calculateModelScore(
    model: LanguageModel,
    criteria: ModelSelectionCriteria,
    context: SelectionContext,
    strategy: SelectionStrategy
  ): Promise<number> {
    let score = 0
    const weights = strategy.configuration.weights

    // Language compatibility score
    const languageScore = this.calculateLanguageCompatibility(model, criteria)
    score += languageScore * weights.languageSpecificity

    // Performance score
    const performanceScore = this.calculatePerformanceScore(model, context)
    score += performanceScore * weights.accuracy

    // Latency score
    const latencyScore = 1 - Math.min(1, model.performance.latency / 5000)
    score += latencyScore * weights.latency

    // Memory efficiency score
    const memoryScore = model.performance.memoryEfficiency
    score += memoryScore * weights.memoryUsage

    // Provider reliability score
    const reliabilityScore = await this.calculateProviderReliability(model.provider)
    score += reliabilityScore * weights.providerReliability

    // Mixed language support score
    if (criteria.mixedLanguages && criteria.mixedLanguages.length > 1) {
      const mixedScore = model.performance.mixedLanguagePerformance
      score += mixedScore * weights.mixedLanguageSupport
    }

    // Apply Ukrainian optimizations if enabled
    if (
      strategy.configuration.ukrainianOptimizations.enabled &&
      criteria.detectedLanguage === 'uk'
    ) {
      score += this.applyUkrainianOptimizations(
        model,
        strategy.configuration.ukrainianOptimizations
      )
    }

    // Apply contextual adjustments
    score = this.applyContextualAdjustments(score, model, context, strategy)

    return Math.max(0, Math.min(1, score))
  }

  private calculateLanguageCompatibility(
    model: LanguageModel,
    criteria: ModelSelectionCriteria
  ): number {
    // Direct language match
    if (model.language === criteria.detectedLanguage) {
      return 1.0
    }

    // Mixed language support
    if (criteria.mixedLanguages && model.configuration.languageSwitchingEnabled) {
      const supportedLangs = criteria.mixedLanguages.filter(
        lang => model.language === lang || model.performance.languageAccuracy[lang] > 0
      )
      return supportedLangs.length / criteria.mixedLanguages.length
    }

    // Universal/generic models
    if (model.language === 'universal' || model.language === 'mixed') {
      return 0.7
    }

    // Language family compatibility (simplified)
    if (
      (criteria.detectedLanguage === 'uk' && model.language === 'ru') ||
      (criteria.detectedLanguage === 'en' && model.language === 'universal')
    ) {
      return 0.5
    }

    return 0.1 // Minimal compatibility
  }

  private calculatePerformanceScore(model: LanguageModel, context: SelectionContext): number {
    let score = model.performance.accuracy

    // Adjust based on historical performance
    const history = this.performanceHistory.get(model.id)
    if (history && history.length > 0) {
      const recentPerformance = history.slice(-5) // Last 5 entries
      const avgRecentAccuracy =
        recentPerformance.reduce((sum, entry) => sum + entry.metrics.accuracy, 0) /
        recentPerformance.length

      // Weight recent performance more heavily
      score = score * 0.3 + avgRecentAccuracy * 0.7
    }

    // Adjust for context
    if (context.audioQuality === 'poor') {
      score *= 0.8
    } else if (context.audioQuality === 'excellent') {
      score *= 1.1
    }

    if (context.backgroundNoise === 'high') {
      score *= 0.7
    }

    return Math.min(1, score)
  }

  private async calculateProviderReliability(provider: string): Promise<number> {
    // In a real implementation, this would check provider status, uptime, etc.
    const reliabilityMap: Record<string, number> = {
      openai: 0.95,
      google: 0.92,
      azure: 0.9,
      amazon: 0.88,
      custom: 0.75
    }

    return reliabilityMap[provider] || 0.7
  }

  private applyUkrainianOptimizations(
    model: LanguageModel,
    optimizations: StrategyConfiguration['ukrainianOptimizations']
  ): number {
    let bonus = 0

    // Native Ukrainian models get a bonus
    if (model.language === 'uk' && optimizations.prioritizeNativeModels) {
      bonus += 0.1
    }

    // Dialect-aware models get a bonus
    if (model.configuration.ukrainianDialect && optimizations.dialectAwareness) {
      bonus += 0.05
    }

    // Transliteration support
    if (model.configuration.transliterationSupport && optimizations.transliterationFallback) {
      bonus += 0.03
    }

    // Mixed language bonus
    if (model.configuration.languageSwitchingEnabled) {
      bonus += optimizations.mixedLanguageBonus
    }

    return bonus
  }

  private applyContextualAdjustments(
    score: number,
    model: LanguageModel,
    context: SelectionContext,
    strategy: SelectionStrategy
  ): number {
    if (!strategy.configuration.preferences.contextAwareness) {
      return score
    }

    let adjustment = 1.0

    // Real-time requirements
    if (context.realTimeRequired && model.performance.latency > 2000) {
      adjustment *= 0.8
    }

    // Memory constraints
    if (context.availableMemory < (model.memoryUsage || 0)) {
      adjustment *= 0.3
    }

    // Network quality impact
    if (context.networkQuality === 'poor' && model.provider === 'google') {
      adjustment *= 0.7 // Cloud-based providers affected more
    }

    // Domain specialization
    if (model.configuration.domainAdaptation === context.domain) {
      adjustment *= 1.2
    }

    return score * adjustment
  }

  private generateModelReasoning(
    model: LanguageModel,
    criteria: ModelSelectionCriteria,
    context: SelectionContext,
    strategy: SelectionStrategy
  ): SelectionReasoning[] {
    const reasoning: SelectionReasoning[] = []

    // Language compatibility
    const langCompatibility = this.calculateLanguageCompatibility(model, criteria)
    reasoning.push({
      factor: 'Language Compatibility',
      weight: strategy.configuration.weights.languageSpecificity,
      score: langCompatibility,
      description: `${(langCompatibility * 100).toFixed(1)}% compatibility with detected language(s)`,
      impact:
        langCompatibility > 0.8 ? 'positive' : langCompatibility > 0.5 ? 'neutral' : 'negative'
    })

    // Performance
    reasoning.push({
      factor: 'Model Performance',
      weight: strategy.configuration.weights.accuracy,
      score: model.performance.accuracy,
      description: `${(model.performance.accuracy * 100).toFixed(1)}% accuracy based on historical data`,
      impact:
        model.performance.accuracy > 0.9
          ? 'positive'
          : model.performance.accuracy > 0.7
            ? 'neutral'
            : 'negative'
    })

    // Latency
    const latencyScore = 1 - Math.min(1, model.performance.latency / 5000)
    reasoning.push({
      factor: 'Response Time',
      weight: strategy.configuration.weights.latency,
      score: latencyScore,
      description: `${model.performance.latency.toFixed(0)}ms average latency`,
      impact:
        model.performance.latency < 1500
          ? 'positive'
          : model.performance.latency < 3000
            ? 'neutral'
            : 'negative'
    })

    return reasoning
  }

  private calculateSelectionConfidence(
    topScore: number,
    allScores: Array<{score: number}>
  ): number {
    if (allScores.length === 1) return 0.9

    const secondBestScore = allScores[1].score
    const gap = topScore - secondBestScore

    // Higher gap means higher confidence
    const gapConfidence = Math.min(1, gap * 2)

    // Absolute score confidence
    const scoreConfidence = topScore

    // Combined confidence
    return (gapConfidence + scoreConfidence) / 2
  }

  private calculateExpectedOutcome(
    model: LanguageModel,
    criteria: ModelSelectionCriteria,
    context: SelectionContext
  ): SelectionAnalysis['expectedOutcome'] {
    return {
      accuracy:
        model.performance.accuracy *
        (context.audioQuality === 'excellent' ? 1.1 : context.audioQuality === 'poor' ? 0.8 : 1.0),
      latency: model.performance.latency * (context.networkQuality === 'poor' ? 1.5 : 1.0),
      memoryUsage: model.memoryUsage || 0,
      reliability: 0.9 // Simplified
    }
  }

  private identifyRisks(
    model: LanguageModel,
    criteria: ModelSelectionCriteria,
    context: SelectionContext
  ): string[] {
    const risks: string[] = []

    if (model.performance.accuracy < 0.8) {
      risks.push('Low accuracy model may produce poor transcription quality')
    }

    if (model.performance.latency > 3000) {
      risks.push('High latency may impact real-time applications')
    }

    if ((model.memoryUsage || 0) > context.availableMemory) {
      risks.push('Model may exceed available memory limits')
    }

    if (
      model.language !== criteria.detectedLanguage &&
      !model.configuration.languageSwitchingEnabled
    ) {
      risks.push('Language mismatch may reduce transcription accuracy')
    }

    return risks
  }

  private generateRecommendations(
    model: LanguageModel,
    criteria: ModelSelectionCriteria,
    context: SelectionContext
  ): string[] {
    const recommendations: string[] = []

    if (context.audioQuality === 'poor') {
      recommendations.push('Consider improving audio quality for better results')
    }

    if (criteria.mixedLanguages && criteria.mixedLanguages.length > 2) {
      recommendations.push('Monitor quality closely with multiple mixed languages')
    }

    if (model.performance.latency > 2000 && context.realTimeRequired) {
      recommendations.push('Consider preloading models for better real-time performance')
    }

    return recommendations
  }

  private summarizeReasoning(reasoning: SelectionReasoning[]): string {
    const mainFactors = reasoning
      .sort((a, b) => b.weight * b.score - a.weight * a.score)
      .slice(0, 2)
      .map(r => r.factor.toLowerCase())

    return `Strong ${mainFactors.join(' and ')}`
  }

  private recordSelection(context: SelectionContext, analysis: SelectionAnalysis): void {
    this.selectionHistory.push({
      timestamp: Date.now(),
      context,
      selection: analysis
    })

    // Limit history size
    if (this.selectionHistory.length > 1000) {
      this.selectionHistory.shift()
    }
  }

  private updateContextHistory(context: SelectionContext): void {
    this.contextHistory.push(context)

    // Limit context history size
    const maxSize = this.config.contextHistorySize || 50
    if (this.contextHistory.length > maxSize) {
      this.contextHistory.shift()
    }
  }

  private triggerAdaptiveLearning(modelId: string, performance: ModelPerformanceMetrics): void {
    // Simplified adaptive learning implementation
    const config = this.config.adaptiveLearning

    const history = this.performanceHistory.get(modelId)
    if (!history || history.length < 5) return

    const recentPerf = history.slice(-5).map(h => h.metrics.accuracy)
    const avgRecent = recentPerf.reduce((sum, acc) => sum + acc, 0) / recentPerf.length

    // Check for performance drops
    if (avgRecent < config.adaptationTriggers.performanceDropThreshold) {
      this.emit('adaptive:performance_drop', {modelId, averageAccuracy: avgRecent})

      // Potentially adjust strategy weights or switch strategies
      this.adaptStrategyWeights(modelId, performance)
    }
  }

  private adaptStrategyWeights(modelId: string, performance: ModelPerformanceMetrics): void {
    const currentStrategy = this.strategies.get(this.currentStrategy)
    if (!currentStrategy) return

    // Simple adaptation: increase accuracy weight if accuracy is dropping
    if (performance.accuracy < 0.8) {
      currentStrategy.configuration.weights.accuracy *= 1.1
      currentStrategy.configuration.weights.latency *= 0.9

      // Normalize weights
      this.normalizeStrategyWeights(currentStrategy)

      this.emit('strategy:adapted', {strategyId: currentStrategy.id, reason: 'accuracy_drop'})
    }
  }

  private normalizeStrategyWeights(strategy: SelectionStrategy): void {
    const weights = strategy.configuration.weights
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0)

    ;(Object.keys(weights) as Array<keyof typeof weights>).forEach(key => {
      weights[key] /= total
    })
  }

  private calculateRecentTrend(
    selections: typeof this.selectionHistory
  ): 'improving' | 'stable' | 'declining' {
    if (selections.length < 4) return 'stable'

    const recent = selections.slice(-4)
    const accuracies = recent
      .filter(s => s.actualPerformance)
      .map(s => s.actualPerformance!.accuracy)

    if (accuracies.length < 2) return 'stable'

    const trend = accuracies[accuracies.length - 1] - accuracies[0]

    if (trend > 0.05) return 'improving'
    if (trend < -0.05) return 'declining'
    return 'stable'
  }

  private generateStrategyRecommendations(
    strategyId: string,
    selections: typeof this.selectionHistory
  ): string[] {
    const recommendations: string[] = []

    const accuracies = selections
      .filter(s => s.actualPerformance)
      .map(s => s.actualPerformance!.accuracy)

    const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length

    if (avgAccuracy < 0.8) {
      recommendations.push('Consider increasing accuracy weight in strategy configuration')
    }

    const highLatencyCount = selections.filter(
      s => s.actualPerformance && s.actualPerformance.latency > 3000
    ).length

    if (highLatencyCount > selections.length * 0.3) {
      recommendations.push('Consider prioritizing latency in model selection')
    }

    return recommendations
  }

  private async loadHistoricalData(): Promise<void> {
    // In a real implementation, this would load from persistent storage
    console.log('📚 Loading historical performance data...')
  }

  private initializeDefaultStrategies(): void {
    // Accuracy-first strategy
    this.strategies.set('accuracy_first', {
      id: 'accuracy_first',
      name: 'Accuracy First',
      description: 'Prioritizes transcription accuracy above all else',
      priority: 10,
      enabled: true,
      configuration: {
        weights: {
          accuracy: 0.5,
          latency: 0.1,
          memoryUsage: 0.1,
          providerReliability: 0.1,
          languageSpecificity: 0.15,
          mixedLanguageSupport: 0.05
        },
        thresholds: {
          minimumAccuracy: 0.85,
          maximumLatency: 10000,
          memoryLimit: 16384,
          confidenceThreshold: 0.7
        },
        preferences: {
          favorSpecializedModels: true,
          enableFallback: true,
          adaptiveWeighting: false,
          contextAwareness: true
        },
        ukrainianOptimizations: {
          enabled: true,
          dialectPreference: 'auto',
          transliterationSupport: true,
          mixedLanguageBonus: 0.1
        }
      }
    })

    // Speed-first strategy
    this.strategies.set('speed_first', {
      id: 'speed_first',
      name: 'Speed First',
      description: 'Optimizes for lowest latency and fastest response',
      priority: 8,
      enabled: true,
      configuration: {
        weights: {
          accuracy: 0.2,
          latency: 0.4,
          memoryUsage: 0.15,
          providerReliability: 0.1,
          languageSpecificity: 0.1,
          mixedLanguageSupport: 0.05
        },
        thresholds: {
          minimumAccuracy: 0.7,
          maximumLatency: 2000,
          memoryLimit: 8192,
          confidenceThreshold: 0.6
        },
        preferences: {
          favorSpecializedModels: false,
          enableFallback: true,
          adaptiveWeighting: false,
          contextAwareness: true
        },
        ukrainianOptimizations: {
          enabled: false,
          dialectPreference: 'standard',
          transliterationSupport: false,
          mixedLanguageBonus: 0.02
        }
      }
    })

    // Balanced strategy (default)
    this.strategies.set('balanced', {
      id: 'balanced',
      name: 'Balanced',
      description: 'Balances accuracy, speed, and resource usage',
      priority: 9,
      enabled: true,
      configuration: {
        weights: {
          accuracy: 0.3,
          latency: 0.25,
          memoryUsage: 0.15,
          providerReliability: 0.1,
          languageSpecificity: 0.15,
          mixedLanguageSupport: 0.05
        },
        thresholds: {
          minimumAccuracy: 0.8,
          maximumLatency: 5000,
          memoryLimit: 12288,
          confidenceThreshold: 0.65
        },
        preferences: {
          favorSpecializedModels: true,
          enableFallback: true,
          adaptiveWeighting: true,
          contextAwareness: true
        },
        ukrainianOptimizations: {
          enabled: true,
          dialectPreference: 'auto',
          transliterationSupport: true,
          mixedLanguageBonus: 0.05
        }
      }
    })

    // Ukrainian-optimized strategy
    this.strategies.set('ukrainian_optimized', {
      id: 'ukrainian_optimized',
      name: 'Ukrainian Optimized',
      description: 'Specifically optimized for Ukrainian and mixed Ukrainian/English scenarios',
      priority: 11,
      enabled: true,
      configuration: {
        weights: {
          accuracy: 0.35,
          latency: 0.2,
          memoryUsage: 0.1,
          providerReliability: 0.1,
          languageSpecificity: 0.2,
          mixedLanguageSupport: 0.05
        },
        thresholds: {
          minimumAccuracy: 0.82,
          maximumLatency: 4000,
          memoryLimit: 14336,
          confidenceThreshold: 0.7
        },
        preferences: {
          favorSpecializedModels: true,
          enableFallback: true,
          adaptiveWeighting: true,
          contextAwareness: true
        },
        ukrainianOptimizations: {
          enabled: true,
          dialectPreference: 'auto',
          transliterationSupport: true,
          mixedLanguageBonus: 0.15
        }
      }
    })

    console.log(`🎯 Initialized ${this.strategies.size} selection strategies`)
  }
}

// Factory function
export function createModelSelectionStrategyService(
  config: ModelSelectionStrategyConfig
): ModelSelectionStrategyService {
  return new ModelSelectionStrategyService(config)
}

// Default configuration
export const DEFAULT_STRATEGY_CONFIG: ModelSelectionStrategyConfig = {
  defaultStrategy: 'balanced',
  enableMultiStrategy: true,
  strategySelectionCriteria: 'adaptive',

  adaptiveLearning: {
    enabled: true,
    learningRate: 0.1,
    historySize: 100,
    adaptationTriggers: {
      performanceDropThreshold: 0.75,
      feedbackThreshold: 0.6,
      contextChangeThreshold: 0.3
    }
  },

  enablePerformanceTracking: true,
  performanceWindowSize: 50,
  performanceUpdateThreshold: 0.05,

  fallbackStrategy: 'best_available',
  fallbackTimeout: 10000,
  maxFallbackAttempts: 3,

  contextSensitivity: 0.8,
  enableContextualAdaptation: true,
  contextHistorySize: 30,

  ukrainianOptimization: {
    enabled: true,
    prioritizeNativeModels: true,
    dialectAwareness: true,
    transliterationFallback: true
  }
}

export const UKRAINIAN_STRATEGY_CONFIG: ModelSelectionStrategyConfig = {
  ...DEFAULT_STRATEGY_CONFIG,
  defaultStrategy: 'ukrainian_optimized',
  contextSensitivity: 0.9,
  ukrainianOptimization: {
    enabled: true,
    prioritizeNativeModels: true,
    dialectAwareness: true,
    transliterationFallback: true
  },
  adaptiveLearning: {
    ...DEFAULT_STRATEGY_CONFIG.adaptiveLearning,
    learningRate: 0.15
  }
}
