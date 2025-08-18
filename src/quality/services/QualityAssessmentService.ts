/**
 * Transcription Quality Assessment Service
 *
 * Evaluates transcription quality using various metrics including:
 * - Text quality analysis (grammar, coherence, completeness)
 * - Language detection accuracy
 * - Provider performance comparison
 * - Real-time quality scoring
 * - Quality-based provider switching recommendations
 */

import {EventEmitter} from 'events'

/**
 * Quality assessment metrics and types
 */
export interface QualityMetrics {
  overall: number // 0-1 overall quality score
  accuracy: number // Transcription accuracy estimate
  fluency: number // Text fluency and naturalness
  completeness: number // Completeness of transcription
  confidence: number // Provider confidence score
  latency: number // Response time in ms
  stability: number // Consistency across time
}

export interface ProviderQualityProfile {
  providerId: string
  providerName: string
  languageSupport: Record<string, QualityMetrics>
  overallRating: number
  reliabilityScore: number
  averageLatency: number
  errorRate: number
  lastUpdated: number
}

export interface QualityAssessmentResult {
  transcriptionId: string
  providerId: string
  language: string
  metrics: QualityMetrics
  issues: QualityIssue[]
  suggestions: QualitySuggestion[]
  timestamp: number
}

export interface QualityIssue {
  type: 'accuracy' | 'fluency' | 'completeness' | 'language' | 'technical'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  location?: {start: number; end: number}
  suggestedFix?: string
}

export interface QualitySuggestion {
  type: 'provider_switch' | 'language_adjustment' | 'configuration' | 'retry'
  priority: 'low' | 'medium' | 'high'
  description: string
  expectedImprovement: number // 0-1 expected quality improvement
  implementation: {
    action: string
    parameters: Record<string, any>
  }
}

export interface TranscriptionSample {
  id: string
  text: string
  language: string
  providerId: string
  confidence: number
  processingTime: number
  audioLength: number
  timestamp: number
  metadata: Record<string, any>
}

/**
 * Configuration for quality assessment
 */
export interface QualityAssessmentConfig {
  enabledMetrics: {
    accuracy: boolean
    fluency: boolean
    completeness: boolean
    latency: boolean
  }
  thresholds: {
    minAccuracy: number
    minFluency: number
    minCompleteness: number
    maxLatency: number
    providerSwitchThreshold: number
  }
  sampling: {
    assessmentInterval: number // ms
    historySize: number
    qualityWindowSize: number
  }
  comparison: {
    enableProviderComparison: boolean
    comparisonSampleSize: number
    qualityDecayFactor: number
  }
}

const DEFAULT_QUALITY_CONFIG: QualityAssessmentConfig = {
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
    providerSwitchThreshold: 0.15 // Switch if alternative is 15% better
  },
  sampling: {
    assessmentInterval: 5000,
    historySize: 100,
    qualityWindowSize: 20
  },
  comparison: {
    enableProviderComparison: true,
    comparisonSampleSize: 10,
    qualityDecayFactor: 0.95
  }
}

/**
 * Main Quality Assessment Service
 */
export class QualityAssessmentService extends EventEmitter {
  private config: QualityAssessmentConfig
  private providerProfiles = new Map<string, ProviderQualityProfile>()
  private sampleHistory: TranscriptionSample[] = []
  private qualityHistory: QualityAssessmentResult[] = []

  constructor(config: Partial<QualityAssessmentConfig> = {}) {
    super()
    this.config = {...DEFAULT_QUALITY_CONFIG, ...config}
  }

  /**
   * Assess quality of a transcription result
   */
  public async assessQuality(sample: TranscriptionSample): Promise<QualityAssessmentResult> {
    const startTime = performance.now()

    try {
      // Add sample to history
      this.addSampleToHistory(sample)

      // Calculate quality metrics
      const metrics = await this.calculateQualityMetrics(sample)

      // Identify quality issues
      const issues = await this.identifyQualityIssues(sample, metrics)

      // Generate suggestions
      const suggestions = await this.generateQualitySuggestions(sample, metrics, issues)

      const result: QualityAssessmentResult = {
        transcriptionId: sample.id,
        providerId: sample.providerId,
        language: sample.language,
        metrics,
        issues,
        suggestions,
        timestamp: Date.now()
      }

      // Add to quality history
      this.addQualityResult(result)

      // Update provider profile
      this.updateProviderProfile(sample.providerId, sample.language, metrics)

      // Emit quality assessment event
      this.emit('quality:assessed', result)

      // Check for provider switch recommendations
      if (suggestions.some(s => s.type === 'provider_switch' && s.priority === 'high')) {
        this.emit('quality:provider_switch_recommended', result)
      }

      return result
    } catch (error) {
      this.emit('quality:error', error, sample)
      throw error
    }
  }

  /**
   * Compare quality across providers for a given language
   */
  public compareProviderQuality(language: string): ProviderQualityProfile[] {
    const profiles = Array.from(this.providerProfiles.values())
      .filter(profile => profile.languageSupport[language])
      .sort((a, b) => {
        const aQuality = a.languageSupport[language]?.overall || 0
        const bQuality = b.languageSupport[language]?.overall || 0
        return bQuality - aQuality
      })

    return profiles
  }

  /**
   * Get best provider recommendation for a language
   */
  public getBestProviderForLanguage(language: string): string | null {
    const profiles = this.compareProviderQuality(language)
    return profiles.length > 0 ? profiles[0].providerId : null
  }

  /**
   * Check if provider should be switched based on quality
   */
  public shouldSwitchProvider(
    currentProviderId: string,
    language: string
  ): {shouldSwitch: boolean; recommendedProvider?: string; reason?: string} {
    const currentProfile = this.providerProfiles.get(currentProviderId)
    if (!currentProfile) {
      return {shouldSwitch: false}
    }

    const currentQuality = currentProfile.languageSupport[language]?.overall || 0
    const alternatives = this.compareProviderQuality(language).filter(
      profile => profile.providerId !== currentProviderId
    )

    if (alternatives.length === 0) {
      return {shouldSwitch: false}
    }

    const bestAlternative = alternatives[0]
    const bestQuality = bestAlternative.languageSupport[language]?.overall || 0
    const improvement = bestQuality - currentQuality

    if (improvement > this.config.thresholds.providerSwitchThreshold) {
      return {
        shouldSwitch: true,
        recommendedProvider: bestAlternative.providerId,
        reason: `Quality improvement: ${(improvement * 100).toFixed(1)}%`
      }
    }

    // Check for reliability issues
    if (
      currentProfile.errorRate > 0.1 &&
      bestAlternative.errorRate < currentProfile.errorRate * 0.5
    ) {
      return {
        shouldSwitch: true,
        recommendedProvider: bestAlternative.providerId,
        reason: `Reliability improvement: Error rate ${(bestAlternative.errorRate * 100).toFixed(1)}% vs ${(currentProfile.errorRate * 100).toFixed(1)}%`
      }
    }

    return {shouldSwitch: false}
  }

  /**
   * Get recent quality trend for a provider and language
   */
  public getQualityTrend(
    providerId: string,
    language: string,
    windowSize: number = 10
  ): {trend: 'improving' | 'declining' | 'stable'; change: number} {
    const recentResults = this.qualityHistory
      .filter(result => result.providerId === providerId && result.language === language)
      .slice(-windowSize * 2) // Get enough data for comparison
      .sort((a, b) => a.timestamp - b.timestamp)

    if (recentResults.length < 4) {
      return {trend: 'stable', change: 0}
    }

    const firstHalf = recentResults.slice(0, Math.floor(recentResults.length / 2))
    const secondHalf = recentResults.slice(Math.floor(recentResults.length / 2))

    const firstAvg = firstHalf.reduce((sum, r) => sum + r.metrics.overall, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((sum, r) => sum + r.metrics.overall, 0) / secondHalf.length

    const change = secondAvg - firstAvg
    const threshold = 0.05 // 5% change threshold

    if (change > threshold) {
      return {trend: 'improving', change}
    } else if (change < -threshold) {
      return {trend: 'declining', change}
    } else {
      return {trend: 'stable', change}
    }
  }

  /**
   * Get quality statistics for a provider
   */
  public getProviderStatistics(providerId: string): ProviderQualityProfile | null {
    return this.providerProfiles.get(providerId) || null
  }

  /**
   * Clear quality history (useful for testing or reset)
   */
  public clearHistory(): void {
    this.sampleHistory = []
    this.qualityHistory = []
    this.providerProfiles.clear()
  }

  /**
   * Export quality data for analysis
   */
  public exportQualityData(): {
    samples: TranscriptionSample[]
    assessments: QualityAssessmentResult[]
    profiles: ProviderQualityProfile[]
  } {
    return {
      samples: [...this.sampleHistory],
      assessments: [...this.qualityHistory],
      profiles: Array.from(this.providerProfiles.values())
    }
  }

  // Private implementation methods

  private async calculateQualityMetrics(sample: TranscriptionSample): Promise<QualityMetrics> {
    const metrics: Partial<QualityMetrics> = {}

    // Accuracy assessment (based on confidence and text analysis)
    if (this.config.enabledMetrics.accuracy) {
      metrics.accuracy = this.assessAccuracy(sample)
    }

    // Fluency assessment
    if (this.config.enabledMetrics.fluency) {
      metrics.fluency = this.assessFluency(sample)
    }

    // Completeness assessment
    if (this.config.enabledMetrics.completeness) {
      metrics.completeness = this.assessCompleteness(sample)
    }

    // Latency assessment
    if (this.config.enabledMetrics.latency) {
      const latencyScore = Math.max(
        0,
        1 - sample.processingTime / this.config.thresholds.maxLatency
      )
      metrics.latency = latencyScore
    }

    // Provider confidence
    metrics.confidence = sample.confidence

    // Stability (based on recent history)
    metrics.stability = this.assessStability(sample)

    // Calculate overall score (weighted average)
    const weights = {
      accuracy: 0.3,
      fluency: 0.2,
      completeness: 0.25,
      confidence: 0.15,
      latency: 0.05,
      stability: 0.05
    }

    metrics.overall = Object.entries(weights).reduce((sum, [metric, weight]) => {
      const value = metrics[metric as keyof QualityMetrics] || 0
      return sum + value * weight
    }, 0)

    return metrics as QualityMetrics
  }

  private assessAccuracy(sample: TranscriptionSample): number {
    let score = sample.confidence // Base on provider confidence

    // Penalize obvious errors
    const text = sample.text.toLowerCase()
    let penalties = 0

    // Check for common transcription errors
    const errorPatterns = [
      /\b\d+[a-z]+\b/g, // Numbers with letters (e.g., "5th" transcribed as "5 th")
      /[a-z]\d+[a-z]/g, // Letters mixed with numbers inappropriately
      /\b[a-z]\s[a-z]\s[a-z]\b/g, // Single letters spaced out (likely spelling errors)
      /[^\w\s,.!?;:()\-'"]/g // Unusual characters that shouldn't be in speech
    ]

    errorPatterns.forEach(pattern => {
      const matches = text.match(pattern)
      if (matches) {
        penalties += matches.length * 0.05
      }
    })

    // Check for language consistency
    const hasMultipleScripts = this.detectMultipleScripts(text)
    if (hasMultipleScripts && sample.language !== 'mixed') {
      penalties += 0.1
    }

    return Math.max(0, score - penalties)
  }

  private assessFluency(sample: TranscriptionSample): number {
    const text = sample.text
    let score = 1.0

    // Check sentence structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    if (sentences.length === 0) return 0.3

    // Average sentence length (too short or too long indicates issues)
    const avgSentenceLength = text.split(/\s+/).length / sentences.length
    if (avgSentenceLength < 3 || avgSentenceLength > 50) {
      score -= 0.2
    }

    // Check for repeated words or phrases
    const words = text.toLowerCase().split(/\s+/)
    const repeatedWords = this.findRepeatedElements(words)
    score -= Math.min(0.3, repeatedWords * 0.1)

    // Check for incomplete sentences
    const incompleteRatio = this.getIncompleteSentenceRatio(text)
    score -= incompleteRatio * 0.2

    // Punctuation consistency
    const punctuationScore = this.assessPunctuation(text)
    score = (score + punctuationScore) / 2

    return Math.max(0, Math.min(1, score))
  }

  private assessCompleteness(sample: TranscriptionSample): number {
    const expectedLength = this.estimateExpectedLength(sample.audioLength)
    const actualLength = sample.text.split(/\s+/).length

    // Calculate length ratio
    const lengthRatio = Math.min(1, actualLength / expectedLength)

    // Check for truncation indicators
    let truncationPenalty = 0
    const truncationPatterns = [
      /\.\.\.$/, // Ends with ellipsis
      /\-$/, // Ends with dash
      /\w$/ // Ends abruptly without punctuation
    ]

    if (truncationPatterns.some(pattern => pattern.test(sample.text))) {
      truncationPenalty = 0.1
    }

    // Check for silence indicators
    const silenceIndicators = ['[silence]', '[pause]', '[inaudible]', '...']
    const silenceCount = silenceIndicators.reduce((count, indicator) => {
      return (
        count +
        (sample.text.toLowerCase().match(new RegExp(indicator.toLowerCase(), 'g')) || []).length
      )
    }, 0)

    const silencePenalty = Math.min(0.3, silenceCount * 0.1)

    return Math.max(0, lengthRatio - truncationPenalty - silencePenalty)
  }

  private assessStability(sample: TranscriptionSample): number {
    const recentSamples = this.sampleHistory
      .filter(s => s.providerId === sample.providerId && s.language === sample.language)
      .slice(-this.config.sampling.qualityWindowSize)

    if (recentSamples.length < 3) {
      return 0.5 // Not enough data
    }

    // Calculate variance in quality metrics
    const confidences = recentSamples.map(s => s.confidence)
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    const variance =
      confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length
    const stability = Math.max(0, 1 - variance * 2)

    return stability
  }

  private async identifyQualityIssues(
    sample: TranscriptionSample,
    metrics: QualityMetrics
  ): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = []

    // Accuracy issues
    if (metrics.accuracy < this.config.thresholds.minAccuracy) {
      issues.push({
        type: 'accuracy',
        severity: metrics.accuracy < 0.5 ? 'critical' : 'high',
        description: `Low transcription accuracy (${(metrics.accuracy * 100).toFixed(1)}%)`,
        suggestedFix:
          'Consider switching to a different transcription provider or adjusting audio quality'
      })
    }

    // Fluency issues
    if (metrics.fluency < this.config.thresholds.minFluency) {
      issues.push({
        type: 'fluency',
        severity: metrics.fluency < 0.4 ? 'high' : 'medium',
        description: `Poor text fluency (${(metrics.fluency * 100).toFixed(1)}%)`,
        suggestedFix: 'Text may benefit from post-processing or language model correction'
      })
    }

    // Completeness issues
    if (metrics.completeness < this.config.thresholds.minCompleteness) {
      issues.push({
        type: 'completeness',
        severity: metrics.completeness < 0.5 ? 'high' : 'medium',
        description: `Incomplete transcription (${(metrics.completeness * 100).toFixed(1)}% complete)`,
        suggestedFix: 'Audio may be too long, poor quality, or contain unsupported content'
      })
    }

    // Latency issues
    if (sample.processingTime > this.config.thresholds.maxLatency) {
      issues.push({
        type: 'technical',
        severity: sample.processingTime > this.config.thresholds.maxLatency * 2 ? 'high' : 'medium',
        description: `High processing latency (${sample.processingTime}ms)`,
        suggestedFix:
          'Consider using a faster transcription provider or optimizing audio processing'
      })
    }

    // Language detection issues
    const hasLanguageInconsistency = this.detectLanguageInconsistency(sample)
    if (hasLanguageInconsistency) {
      issues.push({
        type: 'language',
        severity: 'medium',
        description: 'Detected inconsistent language use in transcription',
        suggestedFix: 'Enable mixed-language detection or verify correct language setting'
      })
    }

    return issues
  }

  private async generateQualitySuggestions(
    sample: TranscriptionSample,
    metrics: QualityMetrics,
    issues: QualityIssue[]
  ): Promise<QualitySuggestion[]> {
    const suggestions: QualitySuggestion[] = []

    // Provider switch suggestion
    const switchRecommendation = this.shouldSwitchProvider(sample.providerId, sample.language)
    if (switchRecommendation.shouldSwitch) {
      suggestions.push({
        type: 'provider_switch',
        priority: metrics.overall < 0.6 ? 'high' : 'medium',
        description: `Switch to ${switchRecommendation.recommendedProvider}: ${switchRecommendation.reason}`,
        expectedImprovement: this.config.thresholds.providerSwitchThreshold,
        implementation: {
          action: 'switchProvider',
          parameters: {
            newProvider: switchRecommendation.recommendedProvider,
            reason: switchRecommendation.reason
          }
        }
      })
    }

    // Language adjustment suggestion
    if (issues.some(issue => issue.type === 'language')) {
      suggestions.push({
        type: 'language_adjustment',
        priority: 'medium',
        description: 'Enable mixed-language detection for better accuracy',
        expectedImprovement: 0.1,
        implementation: {
          action: 'enableMixedLanguageDetection',
          parameters: {language: sample.language}
        }
      })
    }

    // Retry suggestion for poor quality
    if (metrics.overall < 0.4 && sample.processingTime < this.config.thresholds.maxLatency) {
      suggestions.push({
        type: 'retry',
        priority: 'high',
        description: 'Retry transcription with enhanced settings due to poor quality',
        expectedImprovement: 0.2,
        implementation: {
          action: 'retryTranscription',
          parameters: {
            enhancedMode: true,
            timeout: this.config.thresholds.maxLatency * 2
          }
        }
      })
    }

    // Configuration suggestions
    if (issues.some(issue => issue.type === 'technical')) {
      suggestions.push({
        type: 'configuration',
        priority: 'low',
        description: 'Optimize transcription settings for better performance',
        expectedImprovement: 0.05,
        implementation: {
          action: 'optimizeConfiguration',
          parameters: {
            reduceLatency: true,
            adjustQuality: false
          }
        }
      })
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = {high: 3, medium: 2, low: 1}
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }

  // Helper methods

  private addSampleToHistory(sample: TranscriptionSample): void {
    this.sampleHistory.push(sample)

    // Trim history if too large
    if (this.sampleHistory.length > this.config.sampling.historySize) {
      this.sampleHistory = this.sampleHistory.slice(-this.config.sampling.historySize)
    }
  }

  private addQualityResult(result: QualityAssessmentResult): void {
    this.qualityHistory.push(result)

    // Trim history if too large
    if (this.qualityHistory.length > this.config.sampling.historySize) {
      this.qualityHistory = this.qualityHistory.slice(-this.config.sampling.historySize)
    }
  }

  private updateProviderProfile(
    providerId: string,
    language: string,
    metrics: QualityMetrics
  ): void {
    let profile = this.providerProfiles.get(providerId)

    if (!profile) {
      profile = {
        providerId,
        providerName: providerId,
        languageSupport: {},
        overallRating: metrics.overall,
        reliabilityScore: metrics.stability,
        averageLatency: 0,
        errorRate: 0,
        lastUpdated: Date.now()
      }
      this.providerProfiles.set(providerId, profile)
    }

    // Update language-specific metrics with exponential moving average
    const decay = this.config.comparison.qualityDecayFactor
    const existing = profile.languageSupport[language]

    if (existing) {
      profile.languageSupport[language] = {
        overall: existing.overall * decay + metrics.overall * (1 - decay),
        accuracy: existing.accuracy * decay + metrics.accuracy * (1 - decay),
        fluency: existing.fluency * decay + metrics.fluency * (1 - decay),
        completeness: existing.completeness * decay + metrics.completeness * (1 - decay),
        confidence: existing.confidence * decay + metrics.confidence * (1 - decay),
        latency: existing.latency * decay + metrics.latency * (1 - decay),
        stability: existing.stability * decay + metrics.stability * (1 - decay)
      }
    } else {
      profile.languageSupport[language] = {...metrics}
    }

    // Update overall profile metrics
    const allLanguageMetrics = Object.values(profile.languageSupport)
    profile.overallRating =
      allLanguageMetrics.reduce((sum, m) => sum + m.overall, 0) / allLanguageMetrics.length
    profile.reliabilityScore =
      allLanguageMetrics.reduce((sum, m) => sum + m.stability, 0) / allLanguageMetrics.length
    profile.lastUpdated = Date.now()
  }

  private detectMultipleScripts(text: string): boolean {
    const scripts = new Set<string>()

    for (const char of text) {
      const code = char.charCodeAt(0)

      if (code >= 0x0400 && code <= 0x04ff) scripts.add('cyrillic')
      else if (code >= 0x0041 && code <= 0x007a) scripts.add('latin')
      else if (code >= 0x4e00 && code <= 0x9fff) scripts.add('chinese')
      else if (code >= 0x0590 && code <= 0x05ff) scripts.add('hebrew')
      else if (code >= 0x0600 && code <= 0x06ff) scripts.add('arabic')
    }

    return scripts.size > 1
  }

  private findRepeatedElements(array: string[]): number {
    const counts = new Map<string, number>()
    let repeats = 0

    for (const item of array) {
      const count = counts.get(item) || 0
      counts.set(item, count + 1)
      if (count === 1) repeats++ // First repeat
    }

    return repeats / array.length
  }

  private getIncompleteSentenceRatio(text: string): number {
    const sentences = text.split(/[.!?]+/)
    const incomplete = sentences.filter(s => {
      const trimmed = s.trim()
      return trimmed.length > 0 && trimmed.length < 3
    }).length

    return sentences.length > 0 ? incomplete / sentences.length : 0
  }

  private assessPunctuation(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    if (sentences.length === 0) return 0

    const properlyPunctuated = text.match(/[.!?]/g)?.length || 0
    const expectedPunctuation = sentences.length

    return Math.min(1, properlyPunctuated / expectedPunctuation)
  }

  private estimateExpectedLength(audioLengthMs: number): number {
    // Estimate words per minute based on language (simplified)
    const wordsPerMinute = 150 // Average speaking rate
    const minutes = audioLengthMs / (1000 * 60)
    return Math.round(minutes * wordsPerMinute)
  }

  private detectLanguageInconsistency(sample: TranscriptionSample): boolean {
    // Simple heuristic: if text contains multiple scripts but language is specific
    const hasMultipleScripts = this.detectMultipleScripts(sample.text)
    return hasMultipleScripts && sample.language !== 'mixed' && !sample.language.includes('-')
  }
}

// Export factory function
export function createQualityAssessmentService(
  config?: Partial<QualityAssessmentConfig>
): QualityAssessmentService {
  return new QualityAssessmentService(config)
}
