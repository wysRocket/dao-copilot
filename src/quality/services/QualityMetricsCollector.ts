/**
 * Quality Metrics Collector
 *
 * Real-time quality metrics collection system for transcription services.
 * Specialized for Ukrainian/mixed language scenarios with comprehensive
 * analytics and performance tracking.
 */

import {EventEmitter} from 'events'
import type {LanguageDetectionResult} from './LanguageDetectionService'

/**
 * Quality metric data point
 */
export interface QualityMetricPoint {
  timestamp: number
  sessionId: string
  providerId: string
  metric: string
  value: number
  metadata: Record<string, unknown>
}

/**
 * Transcription quality sample
 */
export interface TranscriptionQualitySample {
  sessionId: string
  providerId: string
  timestamp: number

  // Input characteristics
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent'
  audioLength: number // in seconds
  backgroundNoise: 'high' | 'medium' | 'low'
  speakerCount: number

  // Language detection results
  detectedLanguages: LanguageDetectionResult
  expectedLanguage: string
  languageDetectionAccuracy: number

  // Transcription results
  transcriptionText: string
  confidenceScore: number
  processingLatency: number

  // Quality metrics
  accuracy?: number // If reference text available
  wordErrorRate?: number
  characterErrorRate?: number
  fluencyScore?: number
  completenessScore?: number

  // Ukrainian-specific metrics
  cyrillicAccuracy?: number
  transliterationQuality?: number
  mixedLanguageHandling?: number
  dialectRecognition?: number

  // System metrics
  memoryUsage: number
  cpuUsage: number
  networkLatency: number

  // User feedback (if available)
  userRating?: number // 1-5 scale
  userCorrected?: boolean
  correctionText?: string
}

/**
 * Aggregated quality metrics
 */
export interface QualityMetricsAggregation {
  timeRange: {
    start: number
    end: number
    duration: number
  }

  // Overall metrics
  totalSamples: number
  averageAccuracy: number
  averageLatency: number
  averageConfidence: number
  errorRate: number

  // Language-specific metrics
  languageMetrics: Record<
    string,
    {
      sampleCount: number
      averageAccuracy: number
      averageConfidence: number
      detectionAccuracy: number
    }
  >

  // Provider performance
  providerMetrics: Record<
    string,
    {
      sampleCount: number
      averageAccuracy: number
      averageLatency: number
      reliability: number
      ukrainianPerformance?: number
    }
  >

  // Quality trends
  trends: {
    accuracy: 'improving' | 'declining' | 'stable'
    latency: 'improving' | 'declining' | 'stable'
    reliability: 'improving' | 'declining' | 'stable'
  }

  // Ukrainian-specific aggregations
  ukrainianMetrics?: {
    pureUkrainianAccuracy: number
    mixedLanguageAccuracy: number
    cyrillicHandling: number
    dialectSupport: number
  }
}

/**
 * Configuration for quality metrics collection
 */
export interface QualityCollectorConfig {
  // Collection settings
  enableRealTimeCollection: boolean
  samplingRate: number // 0-1, fraction of samples to collect
  batchSize: number
  flushInterval: number // milliseconds

  // Storage settings
  maxSamplesInMemory: number
  persistToDisk: boolean
  diskStoragePath?: string

  // Analytics settings
  enableAggregation: boolean
  aggregationInterval: number // milliseconds
  aggregationWindows: number[] // in seconds, e.g., [60, 300, 3600]

  // Ukrainian optimization
  ukrainianSpecificMetrics: boolean
  dialectAnalysis: boolean
  cyrillicNormalizationTracking: boolean

  // Performance settings
  enableAsyncProcessing: boolean
  maxMemoryUsage: number // MB

  // Privacy settings
  excludeTranscriptionText: boolean
  anonymizeMetadata: boolean
}

/**
 * Default configuration for quality metrics collection
 */
export const DEFAULT_QUALITY_COLLECTOR_CONFIG: QualityCollectorConfig = {
  enableRealTimeCollection: true,
  samplingRate: 1.0,
  batchSize: 100,
  flushInterval: 10000,

  maxSamplesInMemory: 10000,
  persistToDisk: true,

  enableAggregation: true,
  aggregationInterval: 60000,
  aggregationWindows: [60, 300, 3600, 86400],

  ukrainianSpecificMetrics: true,
  dialectAnalysis: true,
  cyrillicNormalizationTracking: true,

  enableAsyncProcessing: true,
  maxMemoryUsage: 256,

  excludeTranscriptionText: false,
  anonymizeMetadata: false
}

/**
 * Configuration optimized for Ukrainian transcription quality tracking
 */
export const UKRAINIAN_QUALITY_COLLECTOR_CONFIG: QualityCollectorConfig = {
  ...DEFAULT_QUALITY_COLLECTOR_CONFIG,

  // Enhanced sampling for Ukrainian scenarios
  samplingRate: 1.0,
  batchSize: 50,
  flushInterval: 5000,

  // Ukrainian-specific features
  ukrainianSpecificMetrics: true,
  dialectAnalysis: true,
  cyrillicNormalizationTracking: true,

  // More frequent aggregation for real-time optimization
  aggregationInterval: 30000,
  aggregationWindows: [30, 60, 300, 1800, 7200, 86400]
}

/**
 * Real-time quality metrics collector
 */
export class QualityMetricsCollector extends EventEmitter {
  private config: QualityCollectorConfig
  private samples: TranscriptionQualitySample[] = []
  private metricPoints: QualityMetricPoint[] = []
  private aggregations: Map<string, QualityMetricsAggregation> = new Map()

  private flushTimer: NodeJS.Timeout | null = null
  private aggregationTimer: NodeJS.Timeout | null = null

  private collectionMetrics = {
    totalSamplesCollected: 0,
    totalMetricPoints: 0,
    collectionStartTime: 0,
    lastFlushTime: 0,
    memoryUsage: 0
  }

  constructor(config: Partial<QualityCollectorConfig> = {}) {
    super()
    this.config = {...DEFAULT_QUALITY_COLLECTOR_CONFIG, ...config}
    this.collectionMetrics.collectionStartTime = Date.now()
  }

  /**
   * Initialize the quality metrics collector
   */
  public async initialize(): Promise<void> {
    console.log('🔧 Initializing Quality Metrics Collector...')

    // Start periodic flushing
    if (this.config.flushInterval > 0) {
      this.startPeriodicFlush()
    }

    // Start aggregation if enabled
    if (this.config.enableAggregation) {
      this.startPeriodicAggregation()
    }

    console.log('✅ Quality Metrics Collector initialized')
    console.log(`📊 Sampling rate: ${(this.config.samplingRate * 100).toFixed(1)}%`)
    console.log(
      `🇺🇦 Ukrainian metrics: ${this.config.ukrainianSpecificMetrics ? 'Enabled' : 'Disabled'}`
    )

    this.emit('collector:initialized')
  }

  /**
   * Collect a quality sample from transcription result
   */
  public collectSample(sample: TranscriptionQualitySample): void {
    // Apply sampling rate
    if (Math.random() > this.config.samplingRate) {
      return
    }

    // Add timestamp if not present
    if (!sample.timestamp) {
      sample.timestamp = Date.now()
    }

    // Store sample
    this.samples.push(sample)
    this.collectionMetrics.totalSamplesCollected++

    // Extract individual metric points
    this.extractMetricPoints(sample)

    // Check memory limits
    this.enforceMemoryLimits()

    // Emit sample collected event
    this.emit('sample:collected', {
      sessionId: sample.sessionId,
      providerId: sample.providerId,
      accuracy: sample.accuracy,
      latency: sample.processingLatency
    })

    // Real-time analysis for critical issues
    this.checkForCriticalIssues(sample)
  }

  /**
   * Collect a specific quality metric point
   */
  public collectMetric(
    sessionId: string,
    providerId: string,
    metric: string,
    value: number,
    metadata: Record<string, unknown> = {}
  ): void {
    const point: QualityMetricPoint = {
      timestamp: Date.now(),
      sessionId,
      providerId,
      metric,
      value,
      metadata
    }

    this.metricPoints.push(point)
    this.collectionMetrics.totalMetricPoints++

    this.emit('metric:collected', point)
  }

  /**
   * Get quality metrics for a specific time range
   */
  public getMetrics(
    startTime: number,
    endTime: number,
    providerId?: string,
    language?: string
  ): TranscriptionQualitySample[] {
    let filteredSamples = this.samples.filter(
      sample => sample.timestamp >= startTime && sample.timestamp <= endTime
    )

    if (providerId) {
      filteredSamples = filteredSamples.filter(sample => sample.providerId === providerId)
    }

    if (language) {
      filteredSamples = filteredSamples.filter(
        sample => sample.detectedLanguages.primaryLanguage === language
      )
    }

    return filteredSamples
  }

  /**
   * Get aggregated quality metrics
   */
  public getAggregatedMetrics(
    windowSize: number = 3600,
    language?: string
  ): QualityMetricsAggregation | null {
    const key = `${windowSize}${language ? `_${language}` : ''}`
    return this.aggregations.get(key) || null
  }

  /**
   * Get Ukrainian-specific quality metrics
   */
  public getUkrainianMetrics(timeRange?: {start: number; end: number}): {
    pureUkrainian: QualityMetricsAggregation | null
    mixedLanguage: QualityMetricsAggregation | null
    overall: {
      cyrillicAccuracy: number
      dialectRecognition: number
      transliterationQuality: number
      mixedLanguageHandling: number
    }
  } {
    let samples = this.samples

    if (timeRange) {
      samples = samples.filter(s => s.timestamp >= timeRange.start && s.timestamp <= timeRange.end)
    }

    // Filter for Ukrainian samples
    const ukrainianSamples = samples.filter(s => s.detectedLanguages.primaryLanguage === 'uk')

    const pureUkrainianSamples = ukrainianSamples.filter(
      s => s.detectedLanguages.detectedLanguages.length === 1
    )

    const mixedLanguageSamples = ukrainianSamples.filter(
      s => s.detectedLanguages.detectedLanguages.length > 1
    )

    // Calculate overall Ukrainian metrics
    const overall = {
      cyrillicAccuracy: this.calculateAverageMetric(ukrainianSamples, 'cyrillicAccuracy'),
      dialectRecognition: this.calculateAverageMetric(ukrainianSamples, 'dialectRecognition'),
      transliterationQuality: this.calculateAverageMetric(
        ukrainianSamples,
        'transliterationQuality'
      ),
      mixedLanguageHandling: this.calculateAverageMetric(
        mixedLanguageSamples,
        'mixedLanguageHandling'
      )
    }

    return {
      pureUkrainian:
        pureUkrainianSamples.length > 0 ? this.aggregateSamples(pureUkrainianSamples) : null,
      mixedLanguage:
        mixedLanguageSamples.length > 0 ? this.aggregateSamples(mixedLanguageSamples) : null,
      overall
    }
  }

  /**
   * Get provider performance comparison
   */
  public getProviderComparison(timeWindow: number = 3600): Array<{
    providerId: string
    metrics: {
      accuracy: number
      latency: number
      reliability: number
      ukrainianPerformance?: number
    }
    sampleCount: number
    trend: 'improving' | 'declining' | 'stable'
  }> {
    const cutoff = Date.now() - timeWindow * 1000
    const recentSamples = this.samples.filter(s => s.timestamp >= cutoff)

    // Group by provider
    const providerGroups = new Map<string, TranscriptionQualitySample[]>()
    recentSamples.forEach(sample => {
      if (!providerGroups.has(sample.providerId)) {
        providerGroups.set(sample.providerId, [])
      }
      providerGroups.get(sample.providerId)!.push(sample)
    })

    const results: Array<{
      providerId: string
      metrics: {
        accuracy: number
        latency: number
        reliability: number
        ukrainianPerformance?: number
      }
      sampleCount: number
      trend: 'improving' | 'declining' | 'stable'
    }> = []

    for (const [providerId, samples] of providerGroups.entries()) {
      const accuracy = this.calculateAverageMetric(samples, 'accuracy')
      const latency = samples.reduce((sum, s) => sum + s.processingLatency, 0) / samples.length
      const reliability = this.calculateReliability(samples)
      const ukrainianSamples = samples.filter(s => s.detectedLanguages.primaryLanguage === 'uk')
      const ukrainianPerformance =
        ukrainianSamples.length > 0
          ? this.calculateAverageMetric(ukrainianSamples, 'accuracy')
          : undefined

      // Calculate trend
      const trend = this.calculateTrend(samples)

      results.push({
        providerId,
        metrics: {
          accuracy,
          latency,
          reliability,
          ukrainianPerformance
        },
        sampleCount: samples.length,
        trend
      })
    }

    return results.sort((a, b) => b.metrics.accuracy - a.metrics.accuracy)
  }

  /**
   * Get collector statistics
   */
  public getCollectorStatistics() {
    const uptime = Date.now() - this.collectionMetrics.collectionStartTime
    const memoryUsage = this.calculateMemoryUsage()

    return {
      uptime,
      totalSamples: this.collectionMetrics.totalSamplesCollected,
      totalMetricPoints: this.collectionMetrics.totalMetricPoints,
      samplesInMemory: this.samples.length,
      metricPointsInMemory: this.metricPoints.length,
      memoryUsage,
      config: this.config,
      aggregationsGenerated: this.aggregations.size,
      lastFlushTime: this.collectionMetrics.lastFlushTime
    }
  }

  /**
   * Export metrics data for external analysis
   */
  public exportMetrics(format: 'json' | 'csv' = 'json', timeRange?: {start: number; end: number}) {
    let samples = this.samples

    if (timeRange) {
      samples = samples.filter(s => s.timestamp >= timeRange.start && s.timestamp <= timeRange.end)
    }

    if (format === 'json') {
      return JSON.stringify(
        {
          metadata: {
            exportTime: Date.now(),
            sampleCount: samples.length,
            timeRange: timeRange || {
              start: samples[0]?.timestamp,
              end: samples[samples.length - 1]?.timestamp
            }
          },
          samples,
          aggregations: Array.from(this.aggregations.entries())
        },
        null,
        2
      )
    } else {
      // CSV format
      const headers = [
        'timestamp',
        'sessionId',
        'providerId',
        'audioQuality',
        'detectedLanguage',
        'confidence',
        'latency',
        'accuracy',
        'wordErrorRate',
        'memoryUsage'
      ]

      const csvRows = [headers.join(',')]

      samples.forEach(sample => {
        const row = [
          sample.timestamp,
          sample.sessionId,
          sample.providerId,
          sample.audioQuality,
          sample.detectedLanguages.primaryLanguage,
          sample.confidenceScore,
          sample.processingLatency,
          sample.accuracy || '',
          sample.wordErrorRate || '',
          sample.memoryUsage
        ]
        csvRows.push(row.join(','))
      })

      return csvRows.join('\n')
    }
  }

  /**
   * Clear all collected metrics
   */
  public clearMetrics(): void {
    const clearedSamples = this.samples.length
    const clearedPoints = this.metricPoints.length

    this.samples = []
    this.metricPoints = []
    this.aggregations.clear()

    this.emit('metrics:cleared', {
      samplesCleared: clearedSamples,
      pointsCleared: clearedPoints
    })
  }

  /**
   * Cleanup collector resources
   */
  public cleanup(): void {
    console.log('🧹 Cleaning up Quality Metrics Collector...')

    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer)
      this.aggregationTimer = null
    }

    // Final flush
    this.flushMetrics()

    console.log('✅ Quality Metrics Collector cleanup completed')
    this.emit('collector:cleanup')
  }

  // Private methods

  private extractMetricPoints(sample: TranscriptionQualitySample): void {
    const baseMetadata = {
      sessionId: sample.sessionId,
      audioQuality: sample.audioQuality,
      detectedLanguage: sample.detectedLanguages.primaryLanguage
    }

    // Extract key metrics as individual points
    const metrics = [
      {name: 'accuracy', value: sample.accuracy},
      {name: 'confidence', value: sample.confidenceScore},
      {name: 'latency', value: sample.processingLatency},
      {name: 'memory_usage', value: sample.memoryUsage},
      {name: 'language_detection_accuracy', value: sample.languageDetectionAccuracy},
      {name: 'word_error_rate', value: sample.wordErrorRate},
      {name: 'cyrillic_accuracy', value: sample.cyrillicAccuracy},
      {name: 'mixed_language_handling', value: sample.mixedLanguageHandling}
    ]

    metrics.forEach(metric => {
      if (metric.value !== undefined && metric.value !== null) {
        this.collectMetric(
          sample.sessionId,
          sample.providerId,
          metric.name,
          metric.value,
          baseMetadata
        )
      }
    })
  }

  private enforceMemoryLimits(): void {
    if (this.samples.length > this.config.maxSamplesInMemory) {
      const excess = this.samples.length - this.config.maxSamplesInMemory
      const removed = this.samples.splice(0, excess)

      this.emit('memory:limit_enforced', {
        samplesRemoved: removed.length,
        remainingSamples: this.samples.length
      })
    }

    // Update memory usage
    this.collectionMetrics.memoryUsage = this.calculateMemoryUsage()
  }

  private calculateMemoryUsage(): number {
    // Rough estimate in MB
    const sampleSize = JSON.stringify(this.samples[0] || {}).length
    const pointSize = JSON.stringify(this.metricPoints[0] || {}).length

    const samplesMemory = (this.samples.length * sampleSize) / (1024 * 1024)
    const pointsMemory = (this.metricPoints.length * pointSize) / (1024 * 1024)

    return samplesMemory + pointsMemory
  }

  private checkForCriticalIssues(sample: TranscriptionQualitySample): void {
    // Check for critical quality issues
    const issues: string[] = []

    if (sample.accuracy && sample.accuracy < 0.5) {
      issues.push('critically_low_accuracy')
    }

    if (sample.processingLatency > 10000) {
      issues.push('excessive_latency')
    }

    if (sample.confidenceScore < 0.3) {
      issues.push('low_confidence')
    }

    if (sample.languageDetectionAccuracy < 0.6) {
      issues.push('poor_language_detection')
    }

    if (issues.length > 0) {
      this.emit('quality:critical_issues', {
        sessionId: sample.sessionId,
        providerId: sample.providerId,
        issues,
        sample
      })
    }
  }

  private calculateAverageMetric(
    samples: TranscriptionQualitySample[],
    metricName: keyof TranscriptionQualitySample
  ): number {
    const validSamples = samples.filter(
      s =>
        s[metricName] !== undefined && s[metricName] !== null && typeof s[metricName] === 'number'
    )

    if (validSamples.length === 0) return 0

    const sum = validSamples.reduce((total, sample) => total + (sample[metricName] as number), 0)

    return sum / validSamples.length
  }

  private calculateReliability(samples: TranscriptionQualitySample[]): number {
    const totalSamples = samples.length
    const successfulSamples = samples.filter(
      s => (s.accuracy || 0) > 0.7 && s.processingLatency < 5000
    ).length

    return totalSamples > 0 ? successfulSamples / totalSamples : 0
  }

  private calculateTrend(
    samples: TranscriptionQualitySample[]
  ): 'improving' | 'declining' | 'stable' {
    if (samples.length < 10) return 'stable'

    // Sort by timestamp
    const sorted = samples.sort((a, b) => a.timestamp - b.timestamp)
    const midPoint = Math.floor(sorted.length / 2)

    const firstHalf = sorted.slice(0, midPoint)
    const secondHalf = sorted.slice(midPoint)

    const firstHalfAccuracy = this.calculateAverageMetric(firstHalf, 'accuracy')
    const secondHalfAccuracy = this.calculateAverageMetric(secondHalf, 'accuracy')

    const change = secondHalfAccuracy - firstHalfAccuracy

    if (change > 0.05) return 'improving'
    if (change < -0.05) return 'declining'
    return 'stable'
  }

  private aggregateSamples(samples: TranscriptionQualitySample[]): QualityMetricsAggregation {
    if (samples.length === 0) {
      return this.createEmptyAggregation()
    }

    const timestamps = samples.map(s => s.timestamp)
    const timeRange = {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps),
      duration: Math.max(...timestamps) - Math.min(...timestamps)
    }

    // Language metrics
    const languageGroups = new Map<string, TranscriptionQualitySample[]>()
    samples.forEach(sample => {
      const lang = sample.detectedLanguages.primaryLanguage
      if (!languageGroups.has(lang)) {
        languageGroups.set(lang, [])
      }
      languageGroups.get(lang)!.push(sample)
    })

    const languageMetrics: Record<
      string,
      {
        sampleCount: number
        averageAccuracy: number
        averageConfidence: number
        detectionAccuracy: number
      }
    > = {}
    for (const [lang, langSamples] of languageGroups.entries()) {
      languageMetrics[lang] = {
        sampleCount: langSamples.length,
        averageAccuracy: this.calculateAverageMetric(langSamples, 'accuracy'),
        averageConfidence:
          langSamples.reduce((sum, s) => sum + s.confidenceScore, 0) / langSamples.length,
        detectionAccuracy: this.calculateAverageMetric(langSamples, 'languageDetectionAccuracy')
      }
    }

    // Provider metrics
    const providerGroups = new Map<string, TranscriptionQualitySample[]>()
    samples.forEach(sample => {
      if (!providerGroups.has(sample.providerId)) {
        providerGroups.set(sample.providerId, [])
      }
      providerGroups.get(sample.providerId)!.push(sample)
    })

    const providerMetrics: Record<
      string,
      {
        sampleCount: number
        averageAccuracy: number
        averageLatency: number
        reliability: number
        ukrainianPerformance?: number
      }
    > = {}
    for (const [provider, provSamples] of providerGroups.entries()) {
      const ukrainianSamples = provSamples.filter(s => s.detectedLanguages.primaryLanguage === 'uk')

      providerMetrics[provider] = {
        sampleCount: provSamples.length,
        averageAccuracy: this.calculateAverageMetric(provSamples, 'accuracy'),
        averageLatency:
          provSamples.reduce((sum, s) => sum + s.processingLatency, 0) / provSamples.length,
        reliability: this.calculateReliability(provSamples),
        ukrainianPerformance:
          ukrainianSamples.length > 0
            ? this.calculateAverageMetric(ukrainianSamples, 'accuracy')
            : undefined
      }
    }

    // Ukrainian metrics
    const ukrainianSamples = samples.filter(s => s.detectedLanguages.primaryLanguage === 'uk')
    const mixedSamples = ukrainianSamples.filter(
      s => s.detectedLanguages.detectedLanguages.length > 1
    )
    const pureSamples = ukrainianSamples.filter(
      s => s.detectedLanguages.detectedLanguages.length === 1
    )

    return {
      timeRange,
      totalSamples: samples.length,
      averageAccuracy: this.calculateAverageMetric(samples, 'accuracy'),
      averageLatency: samples.reduce((sum, s) => sum + s.processingLatency, 0) / samples.length,
      averageConfidence: samples.reduce((sum, s) => sum + s.confidenceScore, 0) / samples.length,
      errorRate: 1 - this.calculateReliability(samples),

      languageMetrics,
      providerMetrics,

      trends: {
        accuracy: this.calculateTrend(samples),
        latency: 'stable', // Simplified for now
        reliability: 'stable'
      },

      ukrainianMetrics:
        ukrainianSamples.length > 0
          ? {
              pureUkrainianAccuracy: this.calculateAverageMetric(pureSamples, 'accuracy'),
              mixedLanguageAccuracy: this.calculateAverageMetric(mixedSamples, 'accuracy'),
              cyrillicHandling: this.calculateAverageMetric(ukrainianSamples, 'cyrillicAccuracy'),
              dialectSupport: this.calculateAverageMetric(ukrainianSamples, 'dialectRecognition')
            }
          : undefined
    }
  }

  private createEmptyAggregation(): QualityMetricsAggregation {
    return {
      timeRange: {start: 0, end: 0, duration: 0},
      totalSamples: 0,
      averageAccuracy: 0,
      averageLatency: 0,
      averageConfidence: 0,
      errorRate: 0,
      languageMetrics: {},
      providerMetrics: {},
      trends: {
        accuracy: 'stable',
        latency: 'stable',
        reliability: 'stable'
      }
    }
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushMetrics()
    }, this.config.flushInterval)
  }

  private startPeriodicAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.generateAggregations()
    }, this.config.aggregationInterval)
  }

  private flushMetrics(): void {
    if (this.config.persistToDisk && this.samples.length > 0) {
      // In a real implementation, this would write to disk
      this.collectionMetrics.lastFlushTime = Date.now()

      this.emit('metrics:flushed', {
        sampleCount: this.samples.length,
        pointCount: this.metricPoints.length,
        timestamp: this.collectionMetrics.lastFlushTime
      })
    }
  }

  private generateAggregations(): void {
    const now = Date.now()

    for (const windowSize of this.config.aggregationWindows) {
      const cutoff = now - windowSize * 1000
      const recentSamples = this.samples.filter(s => s.timestamp >= cutoff)

      if (recentSamples.length > 0) {
        const aggregation = this.aggregateSamples(recentSamples)
        this.aggregations.set(`${windowSize}`, aggregation)

        // Language-specific aggregations
        const languages = Array.from(
          new Set(recentSamples.map(s => s.detectedLanguages.primaryLanguage))
        )
        for (const language of languages) {
          const languageSamples = recentSamples.filter(
            s => s.detectedLanguages.primaryLanguage === language
          )
          if (languageSamples.length > 5) {
            // Only if sufficient samples
            const languageAggregation = this.aggregateSamples(languageSamples)
            this.aggregations.set(`${windowSize}_${language}`, languageAggregation)
          }
        }
      }
    }

    this.emit('aggregations:updated', {
      windowSizes: this.config.aggregationWindows,
      timestamp: now
    })
  }
}

/**
 * Factory function to create quality metrics collector
 */
export function createQualityMetricsCollector(
  config: Partial<QualityCollectorConfig> = {}
): QualityMetricsCollector {
  return new QualityMetricsCollector(config)
}

export default QualityMetricsCollector
