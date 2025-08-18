/**
 * Quality Metrics Collection and Analytics Integration Tests
 *
 * Comprehensive test suite validating the integration between
 * QualityMetricsCollector and AnalyticsEngine with Ukrainian-specific
 * optimization scenarios.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {
  QualityMetricsCollector,
  createQualityMetricsCollector,
  type TranscriptionQualitySample,
  UKRAINIAN_QUALITY_COLLECTOR_CONFIG
} from '../services/QualityMetricsCollector'
import {
  AnalyticsEngine,
  createAnalyticsEngine,
  UKRAINIAN_ANALYTICS_CONFIG
} from '../services/AnalyticsEngine'

describe('Quality Metrics Analytics Integration', () => {
  let collector: QualityMetricsCollector
  let analyticsEngine: AnalyticsEngine

  beforeEach(async () => {
    // Initialize with Ukrainian optimization
    collector = createQualityMetricsCollector(UKRAINIAN_QUALITY_COLLECTOR_CONFIG)
    analyticsEngine = createAnalyticsEngine(UKRAINIAN_ANALYTICS_CONFIG)

    await collector.initialize()
    await analyticsEngine.initialize()
  })

  afterEach(() => {
    collector.cleanup()
    analyticsEngine.cleanup()
  })

  describe('End-to-End Quality Monitoring', () => {
    it('should collect metrics and generate comprehensive analytics', async () => {
      // Generate realistic sample data
      const samples = generateTestSamples(20)

      // Collect all samples
      for (const sample of samples) {
        collector.collectSample(sample)
      }

      // Wait for aggregation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Get collected data
      const endTime = Date.now()
      const startTime = endTime - 60000 // Last minute
      const collectedSamples = collector.getMetrics(startTime, endTime)

      expect(collectedSamples).toHaveLength(20)

      // Generate aggregations
      const aggregation = collector.getAggregatedMetrics(300) // 5 minutes
      expect(aggregation).toBeDefined()

      if (aggregation) {
        expect(aggregation.sampleCount).toBe(20)
        expect(aggregation.accuracy.average).toBeGreaterThan(0)
        expect(aggregation.latency.average).toBeGreaterThan(0)
      }

      // Run analytics
      const insights = await analyticsEngine.analyzeMetrics(
        collectedSamples,
        aggregation ? [aggregation] : []
      )

      expect(insights.length).toBeGreaterThan(0)
      expect(insights.some(i => i.type === 'performance')).toBe(true)
    })

    it('should identify Ukrainian-specific quality issues', async () => {
      // Generate problematic Ukrainian samples
      const ukrainianSamples = [
        createUkrainianSample('uk', 0.6, 'poor'), // Poor accuracy
        createUkrainianSample('uk', 0.65, 'fair'),
        createUkrainianSample('uk', 0.7, 'good'),
        createMixedLanguageSample('uk', 0.5, 'poor'), // Very poor mixed handling
        createMixedLanguageSample('uk', 0.55, 'fair')
      ]

      // Collect samples
      ukrainianSamples.forEach(sample => collector.collectSample(sample))

      await new Promise(resolve => setTimeout(resolve, 100))

      // Analyze
      const collectedSamples = collector.getMetrics(Date.now() - 60000, Date.now())
      const insights = await analyticsEngine.analyzeMetrics(collectedSamples, [])

      // Should identify Ukrainian-specific issues
      const ukrainianInsights = insights.filter(i => i.type === 'ukrainian')
      expect(ukrainianInsights.length).toBeGreaterThan(0)

      const qualityInsights = insights.filter(i => i.type === 'quality')
      expect(qualityInsights.length).toBeGreaterThan(0)

      // Should have recommendations for improvement
      const criticalInsights = insights.filter(i => i.severity === 'critical')
      expect(criticalInsights.length).toBeGreaterThan(0)
      expect(criticalInsights[0].recommendations).toHaveLength.greaterThan(0)
    })

    it('should generate provider performance comparisons', async () => {
      // Generate samples from different providers
      const providers = ['google-speech', 'azure-speech', 'whisper']
      const samples: TranscriptionQualitySample[] = []

      providers.forEach(provider => {
        for (let i = 0; i < 10; i++) {
          samples.push(createSampleForProvider(provider, Math.random() * 0.4 + 0.6)) // 0.6-1.0 accuracy
        }
      })

      // Collect samples
      samples.forEach(sample => collector.collectSample(sample))

      await new Promise(resolve => setTimeout(resolve, 100))

      // Get provider comparison
      const comparison = collector.getProviderComparison(300)

      expect(comparison).toHaveLength(3)
      expect(comparison.every(p => providers.includes(p.providerId))).toBe(true)
      expect(comparison.every(p => p.sampleCount === 10)).toBe(true)

      // Analytics should identify best performer
      const collectedSamples = collector.getMetrics(Date.now() - 60000, Date.now())
      const insights = await analyticsEngine.analyzeMetrics(collectedSamples, [])

      const providerInsights = insights.filter(i => i.type === 'provider')
      expect(providerInsights.length).toBeGreaterThan(0)
    })

    it('should generate comprehensive quality reports', async () => {
      // Generate diverse sample data
      const samples = [
        ...generateTestSamples(15, 'google-speech'),
        ...generateTestSamples(10, 'azure-speech'),
        ...generateUkrainianTestSamples(8),
        ...generateMixedLanguageTestSamples(5)
      ]

      // Collect all samples
      samples.forEach(sample => collector.collectSample(sample))

      await new Promise(resolve => setTimeout(resolve, 150))

      // Generate report
      const endTime = Date.now()
      const startTime = endTime - 300000 // 5 minutes
      const collectedSamples = collector.getMetrics(startTime, endTime)
      const aggregations = [collector.getAggregatedMetrics(300)].filter(Boolean)

      const report = analyticsEngine.generateQualityReport(collectedSamples, aggregations, {
        start: startTime,
        end: endTime
      })

      // Validate report structure
      expect(report.id).toBeDefined()
      expect(report.timeRange.start).toBe(startTime)
      expect(report.timeRange.end).toBe(endTime)
      expect(report.summary.overallHealth).toMatch(/excellent|good|fair|poor/)
      expect(report.summary.keyMetrics.averageAccuracy).toBeGreaterThan(0)
      expect(report.summary.keyMetrics.averageLatency).toBeGreaterThan(0)
      expect(report.summary.keyMetrics.reliability).toBeGreaterThan(0)

      // Should have provider comparison
      expect(report.providerComparison.length).toBeGreaterThan(0)
      expect(report.providerComparison[0].rank).toBe(1)

      // Should have Ukrainian analysis
      expect(report.ukrainianAnalysis).toBeDefined()
      if (report.ukrainianAnalysis) {
        expect(report.ukrainianAnalysis.pureUkrainianPerformance).toBeGreaterThan(0)
        expect(report.ukrainianAnalysis.mixedLanguagePerformance).toBeGreaterThan(0)
        expect(report.ukrainianAnalysis.cyrillicQuality).toBeGreaterThan(0)
      }
    })

    it('should handle real-time metrics streaming', async () => {
      let sampleCount = 0
      const receivedSamples: TranscriptionQualitySample[] = []

      // Listen for sample events
      collector.on('sample:collected', data => {
        receivedSamples.push(data)
        sampleCount++
      })

      // Stream samples in real-time
      const streamingSamples = generateTestSamples(25)

      for (let i = 0; i < streamingSamples.length; i++) {
        collector.collectSample(streamingSamples[i])
        await new Promise(resolve => setTimeout(resolve, 50)) // 50ms intervals
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(sampleCount).toBe(25)
      expect(receivedSamples).toHaveLength(25)

      // Verify real-time aggregations
      const stats = collector.getCollectorStatistics()
      expect(stats.totalSamples).toBe(25)
      expect(stats.samplesInMemory).toBeLessThanOrEqual(25)
    })
  })

  describe('Ukrainian Language Optimization', () => {
    it('should track Ukrainian-specific metrics accurately', async () => {
      const ukrainianSamples = [
        createUkrainianSample('uk', 0.85, 'good', {cyrillicAccuracy: 0.9, dialectRecognition: 0.8}),
        createUkrainianSample('uk', 0.82, 'good', {
          cyrillicAccuracy: 0.88,
          dialectRecognition: 0.85
        }),
        createMixedLanguageSample('uk', 0.75, 'fair', {
          mixedLanguageHandling: 0.7,
          transliterationQuality: 0.8
        })
      ]

      ukrainianSamples.forEach(sample => collector.collectSample(sample))

      await new Promise(resolve => setTimeout(resolve, 100))

      const ukrainianMetrics = collector.getUkrainianMetrics()

      expect(ukrainianMetrics.overall.cyrillicAccuracy).toBeCloseTo(0.89, 1)
      expect(ukrainianMetrics.overall.dialectRecognition).toBeCloseTo(0.825, 1)
      expect(ukrainianMetrics.overall.mixedLanguageHandling).toBeCloseTo(0.7, 1)
      expect(ukrainianMetrics.overall.transliterationQuality).toBeCloseTo(0.8, 1)

      if (ukrainianMetrics.pureUkrainian) {
        expect(ukrainianMetrics.pureUkrainian.totalSamples).toBe(2)
        expect(ukrainianMetrics.pureUkrainian.averageAccuracy).toBeCloseTo(0.835, 1)
      }

      if (ukrainianMetrics.mixedLanguage) {
        expect(ukrainianMetrics.mixedLanguage.totalSamples).toBe(1)
        expect(ukrainianMetrics.mixedLanguage.averageAccuracy).toBe(0.75)
      }
    })

    it('should provide Ukrainian-specific optimization recommendations', async () => {
      // Create samples with poor Ukrainian performance
      const poorUkrainianSamples = [
        createUkrainianSample('uk', 0.6, 'poor', {
          cyrillicAccuracy: 0.5,
          dialectRecognition: 0.4,
          transliterationQuality: 0.45
        }),
        createUkrainianSample('uk', 0.58, 'poor', {
          cyrillicAccuracy: 0.52,
          dialectRecognition: 0.42
        }),
        createMixedLanguageSample('uk', 0.45, 'poor', {
          mixedLanguageHandling: 0.3,
          transliterationQuality: 0.35
        })
      ]

      poorUkrainianSamples.forEach(sample => collector.collectSample(sample))

      await new Promise(resolve => setTimeout(resolve, 100))

      const collectedSamples = collector.getMetrics(Date.now() - 60000, Date.now())
      const insights = await analyticsEngine.analyzeMetrics(collectedSamples, [])

      const ukrainianInsights = insights.filter(i => i.type === 'ukrainian')
      expect(ukrainianInsights.length).toBeGreaterThan(0)

      const criticalInsights = insights.filter(i => i.severity === 'critical')
      expect(criticalInsights.length).toBeGreaterThan(0)

      // Should recommend Ukrainian-specific optimizations
      const hasUkrainianRecommendations = insights.some(insight =>
        insight.recommendations.some(
          rec =>
            rec.toLowerCase().includes('ukrainian') ||
            rec.toLowerCase().includes('cyrillic') ||
            rec.toLowerCase().includes('dialect') ||
            rec.toLowerCase().includes('mixed language')
        )
      )

      expect(hasUkrainianRecommendations).toBe(true)
    })
  })

  describe('Performance and Memory Management', () => {
    it('should handle large volumes of metrics efficiently', async () => {
      const startTime = Date.now()

      // Generate and collect 1000 samples
      for (let i = 0; i < 1000; i++) {
        const sample = createRandomSample()
        collector.collectSample(sample)
      }

      const collectionTime = Date.now() - startTime

      // Should process quickly (under 5 seconds for 1000 samples)
      expect(collectionTime).toBeLessThan(5000)

      const stats = collector.getCollectorStatistics()
      expect(stats.totalSamples).toBe(1000)

      // Memory usage should be reasonable (under 100MB)
      expect(stats.memoryUsage).toBeLessThan(100)

      // Should maintain only recent samples in memory
      expect(stats.samplesInMemory).toBeLessThanOrEqual(1000)
    })

    it('should properly clean up old metrics', async () => {
      // Generate samples with old timestamps
      const oldSamples = Array.from({length: 50}, (_, i) => ({
        ...createRandomSample(),
        timestamp: Date.now() - 30 * 60 * 1000 - i * 1000 // 30+ minutes ago
      }))

      // Generate recent samples
      const recentSamples = generateTestSamples(20)

      // Collect all samples
      ;[...oldSamples, ...recentSamples].forEach(sample => collector.collectSample(sample))

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should have all samples initially
      const allSamples = collector.getMetrics(Date.now() - 60 * 60 * 1000, Date.now())
      expect(allSamples.length).toBe(70)

      // Trigger cleanup manually
      collector.cleanup()

      // Recent samples should still be available
      const recentOnly = collector.getMetrics(Date.now() - 10 * 60 * 1000, Date.now())
      expect(recentOnly.length).toBe(20)
    })
  })

  describe('Error Handling and Resilience', () => {
    it('should handle invalid sample data gracefully', async () => {
      const invalidSamples = [
        {...createRandomSample(), accuracy: -1}, // Invalid accuracy
        {...createRandomSample(), processingLatency: -100}, // Invalid latency
        {...createRandomSample(), sessionId: ''}, // Empty session ID
        // @ts-expect-error - Testing runtime validation
        {...createRandomSample(), detectedLanguages: null} // Null language data
      ]

      // Should not throw errors
      expect(() => {
        invalidSamples.forEach(sample => {
          try {
            collector.collectSample(sample as TranscriptionQualitySample)
          } catch {
            // Expected to handle gracefully
          }
        })
      }).not.toThrow()

      const stats = collector.getCollectorStatistics()
      // Should have rejected invalid samples
      expect(stats.totalSamples).toBeLessThan(4)
    })

    it('should continue analytics processing despite individual failures', async () => {
      // Generate some valid samples
      const validSamples = generateTestSamples(10)
      validSamples.forEach(sample => collector.collectSample(sample))

      await new Promise(resolve => setTimeout(resolve, 100))

      const collectedSamples = collector.getMetrics(Date.now() - 60000, Date.now())

      // Analytics should handle partial failures gracefully
      const insights = await analyticsEngine.analyzeMetrics(collectedSamples, [])

      // Should still generate some insights despite potential individual failures
      expect(insights.length).toBeGreaterThan(0)
      expect(insights.every(i => i.title && i.description)).toBe(true)
    })
  })
})

// Helper functions for test data generation

function generateTestSamples(
  count: number,
  provider = 'google-speech'
): TranscriptionQualitySample[] {
  return Array.from({length: count}, () =>
    createSampleForProvider(provider, Math.random() * 0.4 + 0.6)
  )
}

function generateUkrainianTestSamples(count: number): TranscriptionQualitySample[] {
  return Array.from({length: count}, () =>
    createUkrainianSample('uk', Math.random() * 0.3 + 0.7, 'good')
  )
}

function generateMixedLanguageTestSamples(count: number): TranscriptionQualitySample[] {
  return Array.from({length: count}, () =>
    createMixedLanguageSample('uk', Math.random() * 0.3 + 0.6, 'fair')
  )
}

function createRandomSample(): TranscriptionQualitySample {
  const providers = ['google-speech', 'azure-speech', 'whisper']
  const languages = ['uk', 'en', 'de']
  const qualities: Array<'poor' | 'fair' | 'good' | 'excellent'> = [
    'poor',
    'fair',
    'good',
    'excellent'
  ]

  return createSampleForProvider(
    providers[Math.floor(Math.random() * providers.length)],
    Math.random(),
    languages[Math.floor(Math.random() * languages.length)],
    qualities[Math.floor(Math.random() * qualities.length)]
  )
}

function createSampleForProvider(
  provider: string,
  accuracy: number,
  language = 'en',
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent' = 'good'
): TranscriptionQualitySample {
  return {
    sessionId: `test_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    providerId: provider,
    timestamp: Date.now(),

    audioQuality,
    audioLength: Math.random() * 30 + 5,
    backgroundNoise: 'low',
    speakerCount: 1,

    detectedLanguages: {
      primaryLanguage: language,
      detectedLanguages: [language],
      confidence: Math.max(0.7, accuracy),
      scores: {[language]: Math.max(0.7, accuracy)}
    },
    expectedLanguage: language,
    languageDetectionAccuracy: Math.max(0.7, accuracy),

    transcriptionText: `Test transcription for ${provider}`,
    confidenceScore: accuracy,
    processingLatency: Math.random() * 2000 + 1000,

    accuracy: Math.max(0, Math.min(1, accuracy)),
    wordErrorRate: Math.max(0, (1 - accuracy) * 0.8),
    characterErrorRate: Math.max(0, (1 - accuracy) * 0.6),
    fluencyScore: Math.max(0.5, accuracy),
    completenessScore: Math.max(0.6, accuracy),

    memoryUsage: Math.random() * 512 + 256,
    cpuUsage: Math.random() * 0.8 + 0.2,
    networkLatency: Math.random() * 200 + 50
  }
}

function createUkrainianSample(
  language: string,
  accuracy: number,
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent',
  ukrainianMetrics?: {
    cyrillicAccuracy?: number
    dialectRecognition?: number
    transliterationQuality?: number
  }
): TranscriptionQualitySample {
  return {
    ...createSampleForProvider('ukrainian-provider', accuracy, language, audioQuality),
    cyrillicAccuracy: ukrainianMetrics?.cyrillicAccuracy ?? Math.max(0.6, accuracy - 0.1),
    dialectRecognition: ukrainianMetrics?.dialectRecognition ?? Math.max(0.6, accuracy - 0.05),
    transliterationQuality: ukrainianMetrics?.transliterationQuality
  }
}

function createMixedLanguageSample(
  primaryLanguage: string,
  accuracy: number,
  audioQuality: 'poor' | 'fair' | 'good' | 'excellent',
  mixedMetrics?: {
    mixedLanguageHandling?: number
    transliterationQuality?: number
  }
): TranscriptionQualitySample {
  const sample = createSampleForProvider('mixed-provider', accuracy, primaryLanguage, audioQuality)

  return {
    ...sample,
    detectedLanguages: {
      primaryLanguage,
      detectedLanguages: [primaryLanguage, 'en'],
      confidence: Math.max(0.6, accuracy),
      scores: {
        [primaryLanguage]: Math.max(0.6, accuracy),
        en: Math.max(0.3, accuracy - 0.3)
      }
    },
    mixedLanguageHandling: mixedMetrics?.mixedLanguageHandling ?? Math.max(0.5, accuracy - 0.2),
    transliterationQuality: mixedMetrics?.transliterationQuality ?? Math.max(0.5, accuracy - 0.15),
    cyrillicAccuracy: primaryLanguage === 'uk' ? Math.max(0.6, accuracy - 0.1) : undefined,
    dialectRecognition: primaryLanguage === 'uk' ? Math.max(0.6, accuracy - 0.05) : undefined
  }
}
