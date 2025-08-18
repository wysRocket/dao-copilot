/**
 * Provider Quality Comparison Service
 *
 * Evaluates and compares transcription quality between different providers
 * based on multiple metrics including confidence scores, accuracy, latency,
 * and language-specific performance. Provides real-time scoring and
 * recommendations for optimal provider selection.
 */

import {EventEmitter} from 'events'

// Quality comparison types
export interface QualityMetric {
  name: string
  value: number
  weight: number
  timestamp: number
  context?: Record<string, unknown>
}

export interface ProviderQualityScore {
  providerId: string
  providerName: string
  overallScore: number
  metrics: {
    confidence: QualityMetric
    accuracy: QualityMetric
    latency: QualityMetric
    consistency: QualityMetric
    languageSupport: QualityMetric
  }
  languageScores: Record<string, number>
  recentPerformance: {
    samples: number
    averageScore: number
    trend: 'improving' | 'declining' | 'stable'
    errorRate: number
  }
  lastUpdated: number
}

export interface ComparisonResult {
  bestProvider: string
  scoreGap: number
  recommendations: QualityRecommendation[]
  allProviders: ProviderQualityScore[]
  comparisonTimestamp: number
  confidence: number
}

export interface QualityRecommendation {
  type: 'switch' | 'optimize' | 'monitor' | 'warning'
  message: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  providerId: string
  expectedImprovement?: number
  actionRequired?: string
}

export interface TranscriptionSample {
  providerId: string
  text: string
  confidence: number
  language: string
  processingTime: number
  audioLength: number
  metadata?: Record<string, unknown>
  timestamp: number
}

export interface QualityComparisonConfig {
  // Metric weights for scoring
  metricWeights: {
    confidence: number
    accuracy: number
    latency: number
    consistency: number
    languageSupport: number
  }

  // Quality thresholds
  thresholds: {
    minimumScore: number
    switchingThreshold: number
    criticalThreshold: number
    samplesForComparison: number
  }

  // Language-specific settings
  languageConfig: {
    primaryLanguages: string[]
    mixedLanguageSupport: boolean
    ukrainianOptimization: boolean
  }

  // Performance settings
  performance: {
    maxHistorySize: number
    comparisonInterval: number
    learningRate: number
    enableAdaptiveWeights: boolean
  }

  // Features
  features: {
    enableRealTimeComparison: boolean
    enableTrendAnalysis: boolean
    enableLanguageSpecificScoring: boolean
    enableAutomaticSwitching: boolean
  }
}

/**
 * Provider Quality Comparison Service
 */
export class ProviderQualityComparisonService extends EventEmitter {
  private config: QualityComparisonConfig
  private providerScores = new Map<string, ProviderQualityScore>()
  private transcriptionHistory: TranscriptionSample[] = []
  private comparisonTimer: NodeJS.Timeout | null = null
  private isInitialized = false

  constructor(config: QualityComparisonConfig) {
    super()
    this.config = config
  }

  /**
   * Initialize the comparison service
   */
  public async initialize(): Promise<void> {
    try {
      // Set up periodic comparison if real-time is enabled
      if (this.config.features.enableRealTimeComparison) {
        this.startPeriodicComparison()
      }

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      this.emit('initialization:error', error)
      throw new Error(`Failed to initialize quality comparison service: ${error}`)
    }
  }

  /**
   * Register a transcription provider for quality tracking
   */
  public registerProvider(providerId: string, providerName: string): void {
    if (this.providerScores.has(providerId)) {
      return // Already registered
    }

    const initialScore: ProviderQualityScore = {
      providerId,
      providerName,
      overallScore: 0,
      metrics: {
        confidence: {
          name: 'confidence',
          value: 0,
          weight: this.config.metricWeights.confidence,
          timestamp: Date.now()
        },
        accuracy: {
          name: 'accuracy',
          value: 0,
          weight: this.config.metricWeights.accuracy,
          timestamp: Date.now()
        },
        latency: {
          name: 'latency',
          value: 0,
          weight: this.config.metricWeights.latency,
          timestamp: Date.now()
        },
        consistency: {
          name: 'consistency',
          value: 0,
          weight: this.config.metricWeights.consistency,
          timestamp: Date.now()
        },
        languageSupport: {
          name: 'languageSupport',
          value: 0,
          weight: this.config.metricWeights.languageSupport,
          timestamp: Date.now()
        }
      },
      languageScores: {},
      recentPerformance: {
        samples: 0,
        averageScore: 0,
        trend: 'stable',
        errorRate: 0
      },
      lastUpdated: Date.now()
    }

    this.providerScores.set(providerId, initialScore)
    this.emit('provider:registered', {providerId, providerName})
  }

  /**
   * Record a transcription sample for quality analysis
   */
  public recordTranscription(sample: TranscriptionSample): void {
    // Add to history
    this.transcriptionHistory.push(sample)

    // Limit history size
    if (this.transcriptionHistory.length > this.config.performance.maxHistorySize) {
      this.transcriptionHistory.shift()
    }

    // Update provider scores
    this.updateProviderScore(sample)

    this.emit('sample:recorded', sample)
  }

  /**
   * Compare all registered providers and return the best one
   */
  public async compareProviders(context?: {
    language?: string
    audioType?: 'live' | 'recorded'
    qualityPriority?: 'speed' | 'accuracy' | 'balanced'
  }): Promise<ComparisonResult> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const providers = Array.from(this.providerScores.values())

    if (providers.length === 0) {
      throw new Error('No providers registered for comparison')
    }

    // Apply context-specific adjustments
    const adjustedProviders = this.applyContextualAdjustments(providers, context)

    // Sort by overall score
    adjustedProviders.sort((a, b) => b.overallScore - a.overallScore)

    const bestProvider = adjustedProviders[0]
    const secondBest = adjustedProviders[1]

    const scoreGap = secondBest ? bestProvider.overallScore - secondBest.overallScore : 1.0
    const confidence = this.calculateComparisonConfidence(adjustedProviders)

    // Generate recommendations
    const recommendations = this.generateRecommendations(adjustedProviders, context)

    const result: ComparisonResult = {
      bestProvider: bestProvider.providerId,
      scoreGap,
      recommendations,
      allProviders: adjustedProviders,
      comparisonTimestamp: Date.now(),
      confidence
    }

    this.emit('comparison:completed', result)
    return result
  }

  /**
   * Get quality score for a specific provider
   */
  public getProviderScore(providerId: string): ProviderQualityScore | null {
    return this.providerScores.get(providerId) || null
  }

  /**
   * Get quality scores for all providers
   */
  public getAllProviderScores(): ProviderQualityScore[] {
    return Array.from(this.providerScores.values())
  }

  /**
   * Get quality trends for providers
   */
  public getQualityTrends(timeWindow?: number): Record<
    string,
    {
      providerId: string
      trend: 'improving' | 'declining' | 'stable'
      changeRate: number
      confidence: number
    }
  > {
    const windowMs = timeWindow || 24 * 60 * 60 * 1000 // 24 hours default
    const cutoffTime = Date.now() - windowMs

    const trends: Record<string, any> = {}

    for (const [providerId, score] of this.providerScores) {
      const recentSamples = this.transcriptionHistory
        .filter(s => s.providerId === providerId && s.timestamp > cutoffTime)
        .sort((a, b) => a.timestamp - b.timestamp)

      if (recentSamples.length < 3) {
        trends[providerId] = {
          providerId,
          trend: 'stable',
          changeRate: 0,
          confidence: 0.1
        }
        continue
      }

      // Calculate trend using linear regression on quality scores
      const trendAnalysis = this.calculateTrend(recentSamples)

      trends[providerId] = {
        providerId,
        trend: trendAnalysis.trend,
        changeRate: trendAnalysis.changeRate,
        confidence: trendAnalysis.confidence
      }
    }

    return trends
  }

  /**
   * Get performance comparison for specific language
   */
  public getLanguagePerformance(language: string): Record<
    string,
    {
      providerId: string
      score: number
      samples: number
      averageConfidence: number
      averageLatency: number
    }
  > {
    const languagePerformance: Record<string, any> = {}

    for (const [providerId, score] of this.providerScores) {
      const languageSamples = this.transcriptionHistory.filter(
        s => s.providerId === providerId && s.language === language
      )

      if (languageSamples.length === 0) {
        languagePerformance[providerId] = {
          providerId,
          score: 0,
          samples: 0,
          averageConfidence: 0,
          averageLatency: Infinity
        }
        continue
      }

      const avgConfidence =
        languageSamples.reduce((sum, s) => sum + s.confidence, 0) / languageSamples.length
      const avgLatency =
        languageSamples.reduce((sum, s) => sum + s.processingTime, 0) / languageSamples.length
      const languageScore = score.languageScores[language] || 0

      languagePerformance[providerId] = {
        providerId,
        score: languageScore,
        samples: languageSamples.length,
        averageConfidence: avgConfidence,
        averageLatency: avgLatency
      }
    }

    return languagePerformance
  }

  /**
   * Update configuration
   */
  public updateConfiguration(newConfig: Partial<QualityComparisonConfig>): void {
    this.config = {...this.config, ...newConfig}

    // Restart periodic comparison if interval changed
    if (newConfig.performance?.comparisonInterval) {
      this.stopPeriodicComparison()
      if (this.config.features.enableRealTimeComparison) {
        this.startPeriodicComparison()
      }
    }

    this.emit('configuration:updated', this.config)
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopPeriodicComparison()
    this.providerScores.clear()
    this.transcriptionHistory = []
    this.isInitialized = false
    this.removeAllListeners()
  }

  // Private helper methods

  private updateProviderScore(sample: TranscriptionSample): void {
    const score = this.providerScores.get(sample.providerId)
    if (!score) {
      return // Provider not registered
    }

    const now = Date.now()

    // Calculate quality metrics from sample
    const qualityScore = this.calculateQualityScore(sample)

    // Update metrics with exponential moving average
    const learningRate = this.config.performance.learningRate

    score.metrics.confidence.value = this.updateMovingAverage(
      score.metrics.confidence.value,
      sample.confidence,
      learningRate
    )

    score.metrics.accuracy.value = this.updateMovingAverage(
      score.metrics.accuracy.value,
      qualityScore.accuracy,
      learningRate
    )

    score.metrics.latency.value = this.updateMovingAverage(
      score.metrics.latency.value,
      1 - Math.min(sample.processingTime / 5000, 1), // Normalize latency to 0-1 (5s = 0)
      learningRate
    )

    score.metrics.consistency.value = this.updateMovingAverage(
      score.metrics.consistency.value,
      qualityScore.consistency,
      learningRate
    )

    // Update language-specific score
    if (!score.languageScores[sample.language]) {
      score.languageScores[sample.language] = sample.confidence
    } else {
      score.languageScores[sample.language] = this.updateMovingAverage(
        score.languageScores[sample.language],
        sample.confidence,
        learningRate
      )
    }

    // Update language support score based on supported languages
    score.metrics.languageSupport.value = Object.keys(score.languageScores).length / 10 // Normalize by max expected languages

    // Calculate overall score
    score.overallScore = this.calculateOverallScore(score.metrics)

    // Update recent performance
    score.recentPerformance.samples++
    score.recentPerformance.averageScore = this.updateMovingAverage(
      score.recentPerformance.averageScore,
      score.overallScore,
      learningRate
    )

    // Update trend analysis
    if (this.config.features.enableTrendAnalysis) {
      score.recentPerformance.trend = this.analyzeTrend(sample.providerId)
    }

    score.lastUpdated = now

    this.emit('score:updated', {providerId: sample.providerId, score})
  }

  private calculateQualityScore(sample: TranscriptionSample): {
    accuracy: number
    consistency: number
  } {
    // For now, use confidence as a proxy for accuracy
    // In a real implementation, this could involve reference text comparison
    const accuracy = sample.confidence

    // Calculate consistency based on provider's historical performance
    const providerHistory = this.transcriptionHistory
      .filter(s => s.providerId === sample.providerId)
      .slice(-10) // Last 10 samples

    let consistency = 1.0
    if (providerHistory.length > 1) {
      const confidences = providerHistory.map(s => s.confidence)
      const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      const variance =
        confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length
      const stdDev = Math.sqrt(variance)

      // Lower standard deviation = higher consistency
      consistency = Math.max(0, 1 - stdDev * 2) // Normalize
    }

    return {accuracy, consistency}
  }

  private calculateOverallScore(metrics: ProviderQualityScore['metrics']): number {
    let totalScore = 0
    let totalWeight = 0

    Object.values(metrics).forEach(metric => {
      totalScore += metric.value * metric.weight
      totalWeight += metric.weight
    })

    return totalWeight > 0 ? totalScore / totalWeight : 0
  }

  private updateMovingAverage(current: number, newValue: number, learningRate: number): number {
    return current + learningRate * (newValue - current)
  }

  private applyContextualAdjustments(
    providers: ProviderQualityScore[],
    context?: Record<string, unknown>
  ): ProviderQualityScore[] {
    if (!context) return providers

    return providers.map(provider => {
      const adjusted = {...provider}

      // Language-specific adjustments
      if (context.language && provider.languageScores[context.language as string]) {
        const languageMultiplier =
          1 + (provider.languageScores[context.language as string] - 0.5) * 0.2
        adjusted.overallScore *= Math.max(0.5, Math.min(1.5, languageMultiplier))
      }

      // Quality priority adjustments
      if (context.qualityPriority) {
        switch (context.qualityPriority) {
          case 'speed':
            adjusted.overallScore *= 1 + provider.metrics.latency.value * 0.3
            break
          case 'accuracy':
            adjusted.overallScore *= 1 + provider.metrics.accuracy.value * 0.3
            break
        }
      }

      return adjusted
    })
  }

  private generateRecommendations(
    providers: ProviderQualityScore[],
    context?: Record<string, unknown>
  ): QualityRecommendation[] {
    const recommendations: QualityRecommendation[] = []

    if (providers.length < 2) {
      return recommendations
    }

    const best = providers[0]
    const secondBest = providers[1]
    const scoreGap = best.overallScore - secondBest.overallScore

    // Recommend switching if gap is significant
    if (scoreGap > this.config.thresholds.switchingThreshold) {
      recommendations.push({
        type: 'switch',
        message: `Consider switching to ${best.providerName} for better quality (${(scoreGap * 100).toFixed(1)}% improvement)`,
        priority: scoreGap > 0.2 ? 'high' : 'medium',
        providerId: best.providerId,
        expectedImprovement: scoreGap,
        actionRequired: 'Update provider configuration'
      })
    }

    // Warn about low-performing providers
    providers.forEach(provider => {
      if (provider.overallScore < this.config.thresholds.criticalThreshold) {
        recommendations.push({
          type: 'warning',
          message: `${provider.providerName} quality is below critical threshold (${(provider.overallScore * 100).toFixed(1)}%)`,
          priority: 'critical',
          providerId: provider.providerId,
          actionRequired: 'Review provider configuration or consider replacement'
        })
      }
    })

    return recommendations
  }

  private calculateComparisonConfidence(providers: ProviderQualityScore[]): number {
    if (providers.length < 2) return 0.5

    const sampleCounts = providers.map(p => p.recentPerformance.samples)
    const minSamples = Math.min(...sampleCounts)
    const maxSamples = Math.max(...sampleCounts)

    // Confidence based on sample size and score stability
    const sampleConfidence = Math.min(minSamples / this.config.thresholds.samplesForComparison, 1)
    const stabilityConfidence = maxSamples > 0 ? minSamples / maxSamples : 0

    return (sampleConfidence + stabilityConfidence) / 2
  }

  private analyzeTrend(providerId: string): 'improving' | 'declining' | 'stable' {
    const recentSamples = this.transcriptionHistory
      .filter(s => s.providerId === providerId)
      .slice(-10) // Last 10 samples

    if (recentSamples.length < 3) return 'stable'

    const trendAnalysis = this.calculateTrend(recentSamples)
    return trendAnalysis.trend
  }

  private calculateTrend(samples: TranscriptionSample[]): {
    trend: 'improving' | 'declining' | 'stable'
    changeRate: number
    confidence: number
  } {
    if (samples.length < 3) {
      return {trend: 'stable', changeRate: 0, confidence: 0}
    }

    // Simple linear regression on confidence scores over time
    const n = samples.length
    const sumX = samples.reduce((sum, _, i) => sum + i, 0)
    const sumY = samples.reduce((sum, s) => sum + s.confidence, 0)
    const sumXY = samples.reduce((sum, s, i) => sum + i * s.confidence, 0)
    const sumXX = samples.reduce((sum, _, i) => sum + i * i, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const confidence = Math.min(samples.length / 10, 1) // More samples = higher confidence

    let trend: 'improving' | 'declining' | 'stable'
    if (Math.abs(slope) < 0.01) {
      trend = 'stable'
    } else if (slope > 0) {
      trend = 'improving'
    } else {
      trend = 'declining'
    }

    return {
      trend,
      changeRate: Math.abs(slope),
      confidence
    }
  }

  private startPeriodicComparison(): void {
    if (this.comparisonTimer) return

    this.comparisonTimer = setInterval(() => {
      this.compareProviders().catch(error => {
        this.emit('comparison:error', error)
      })
    }, this.config.performance.comparisonInterval)
  }

  private stopPeriodicComparison(): void {
    if (this.comparisonTimer) {
      clearInterval(this.comparisonTimer)
      this.comparisonTimer = null
    }
  }
}

// Factory function
export function createProviderQualityComparisonService(
  config: QualityComparisonConfig
): ProviderQualityComparisonService {
  return new ProviderQualityComparisonService(config)
}

// Default configuration
export const DEFAULT_QUALITY_COMPARISON_CONFIG: QualityComparisonConfig = {
  metricWeights: {
    confidence: 0.3,
    accuracy: 0.3,
    latency: 0.2,
    consistency: 0.1,
    languageSupport: 0.1
  },
  thresholds: {
    minimumScore: 0.6,
    switchingThreshold: 0.15,
    criticalThreshold: 0.4,
    samplesForComparison: 5
  },
  languageConfig: {
    primaryLanguages: ['uk', 'en', 'ru'],
    mixedLanguageSupport: true,
    ukrainianOptimization: true
  },
  performance: {
    maxHistorySize: 1000,
    comparisonInterval: 30000, // 30 seconds
    learningRate: 0.1,
    enableAdaptiveWeights: true
  },
  features: {
    enableRealTimeComparison: true,
    enableTrendAnalysis: true,
    enableLanguageSpecificScoring: true,
    enableAutomaticSwitching: true
  }
}

// Ukrainian-optimized configuration
export const UKRAINIAN_OPTIMIZED_COMPARISON_CONFIG: QualityComparisonConfig = {
  ...DEFAULT_QUALITY_COMPARISON_CONFIG,
  metricWeights: {
    confidence: 0.25,
    accuracy: 0.35, // Higher weight on accuracy for Ukrainian
    latency: 0.15,
    consistency: 0.15,
    languageSupport: 0.1
  },
  thresholds: {
    minimumScore: 0.7, // Higher minimum for Ukrainian quality
    switchingThreshold: 0.12,
    criticalThreshold: 0.5,
    samplesForComparison: 3 // Faster switching for Ukrainian
  },
  languageConfig: {
    primaryLanguages: ['uk', 'en', 'ru'],
    mixedLanguageSupport: true,
    ukrainianOptimization: true
  }
}
