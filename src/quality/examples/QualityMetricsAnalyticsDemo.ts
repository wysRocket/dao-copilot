/**
 * Quality Metrics Collection and Analytics Demo
 *
 * Comprehensive demonstration of real-time quality metrics collection,
 * analytics processing, and feedback loop optimization for Ukrainian/mixed
 * language transcription scenarios.
 */

import {EventEmitter} from 'events'
import {
  QualityMetricsCollector,
  createQualityMetricsCollector,
  type TranscriptionQualitySample,
  type QualityMetricsAggregation,
  UKRAINIAN_QUALITY_COLLECTOR_CONFIG
} from '../services/QualityMetricsCollector'
import {
  AnalyticsEngine,
  createAnalyticsEngine,
  type AnalyticsInsight,
  type QualityReport,
  UKRAINIAN_ANALYTICS_CONFIG
} from '../services/AnalyticsEngine'

/**
 * Demo class showcasing quality metrics collection and analytics
 */
export class QualityMetricsAnalyticsDemo extends EventEmitter {
  private collector: QualityMetricsCollector
  private analyticsEngine: AnalyticsEngine
  private isRunning = false
  private simulationTimer: NodeJS.Timeout | null = null

  private demoMetrics = {
    samplesGenerated: 0,
    insightsGenerated: 0,
    reportsGenerated: 0,
    feedbackLoops: 0,
    startTime: 0
  }

  constructor(optimizeForUkrainian = true) {
    super()

    // Initialize with Ukrainian-optimized configurations
    const collectorConfig = optimizeForUkrainian ? UKRAINIAN_QUALITY_COLLECTOR_CONFIG : undefined
    const analyticsConfig = optimizeForUkrainian ? UKRAINIAN_ANALYTICS_CONFIG : undefined

    this.collector = createQualityMetricsCollector(collectorConfig)
    this.analyticsEngine = createAnalyticsEngine(analyticsConfig)

    this.setupEventHandlers()
  }

  /**
   * Initialize the demo
   */
  public async initialize(): Promise<void> {
    console.log('\n🔧 Initializing Quality Metrics Analytics Demo...\n')

    try {
      await this.collector.initialize()
      await this.analyticsEngine.initialize()

      console.log('✅ Demo initialized successfully')
      console.log('📊 Real-time quality metrics collection enabled')
      console.log('🧠 Advanced analytics engine running')
      console.log('🇺🇦 Ukrainian language optimization active\n')

      this.demoMetrics.startTime = Date.now()
      this.emit('demo:initialized')
    } catch (error) {
      console.error('❌ Demo initialization failed:', error)
      throw error
    }
  }

  /**
   * Run live metrics collection demo
   */
  public async runLiveCollectionDemo(): Promise<void> {
    console.log('\n📈 Running Live Metrics Collection Demo...\n')
    console.log('Simulating real-time transcription quality data collection...\n')

    this.isRunning = true

    // Simulate various transcription scenarios
    const scenarios = [
      {
        name: 'Pure Ukrainian',
        language: 'uk',
        audioQuality: 'good' as const,
        provider: 'google-speech'
      },
      {
        name: 'Pure English',
        language: 'en',
        audioQuality: 'excellent' as const,
        provider: 'azure-speech'
      },
      {
        name: 'Mixed UA-EN',
        language: 'uk',
        audioQuality: 'fair' as const,
        provider: 'google-speech',
        mixed: true
      },
      {name: 'Poor Audio UA', language: 'uk', audioQuality: 'poor' as const, provider: 'whisper'},
      {
        name: 'Technical EN',
        language: 'en',
        audioQuality: 'good' as const,
        provider: 'google-speech',
        domain: 'technical'
      }
    ]

    let sampleCount = 0
    const maxSamples = 50

    // Start simulation
    this.simulationTimer = setInterval(() => {
      if (sampleCount >= maxSamples || !this.isRunning) {
        if (this.simulationTimer) {
          clearInterval(this.simulationTimer)
          this.simulationTimer = null
        }
        this.isRunning = false
        console.log('\n✅ Live collection demo completed')
        this.emit('demo:live_collection_complete')
        return
      }

      // Pick random scenario
      const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]

      // Generate realistic sample data
      const sample = this.generateRealisticSample(scenario)

      // Collect the sample
      this.collector.collectSample(sample)

      // Show progress
      if (sampleCount % 10 === 0) {
        console.log(`📊 Collected ${sampleCount + 1}/${maxSamples} samples...`)
        this.displayRecentMetrics()
      }

      sampleCount++
      this.demoMetrics.samplesGenerated++
    }, 200) // Collect every 200ms

    // Wait for completion
    return new Promise(resolve => {
      this.once('demo:live_collection_complete', resolve)
    })
  }

  /**
   * Run analytics processing demo
   */
  public async runAnalyticsDemo(): Promise<void> {
    console.log('\n🧠 Running Analytics Processing Demo...\n')

    // Get collected samples
    const endTime = Date.now()
    const startTime = endTime - 10 * 60 * 1000 // Last 10 minutes
    const samples = this.collector.getMetrics(startTime, endTime)

    if (samples.length === 0) {
      console.log('⚠️ No samples available for analysis. Running live collection first...')
      await this.runLiveCollectionDemo()
      return this.runAnalyticsDemo()
    }

    console.log(`🔍 Analyzing ${samples.length} quality samples...`)

    // Generate aggregations
    const aggregations = [
      this.collector.getAggregatedMetrics(300), // 5 minutes
      this.collector.getAggregatedMetrics(600), // 10 minutes
      this.collector.getAggregatedMetrics(1800, 'uk') // 30 minutes Ukrainian
    ].filter(Boolean) as QualityMetricsAggregation[]

    // Run analytics
    const insights = await this.analyticsEngine.analyzeMetrics(samples, aggregations)

    console.log(`\n✅ Analysis complete: ${insights.length} insights generated\n`)

    // Display insights by category
    this.displayInsightsByCategory(insights)

    // Generate visualizations
    console.log('\n📊 Generating Visualizations...\n')

    const visualizations = [
      this.analyticsEngine.generateVisualization('accuracy_over_time', samples),
      this.analyticsEngine.generateVisualization('provider_comparison', samples),
      this.analyticsEngine.generateVisualization('language_performance', samples),
      this.analyticsEngine.generateVisualization('ukrainian_analysis', samples)
    ]

    visualizations.forEach(viz => {
      console.log(`📈 ${viz.title}`)
      console.log(`   ${viz.description}`)
      console.log(`   Data points: ${viz.data.length}`)

      // Show top 3 data points for demo
      viz.data.slice(0, 3).forEach(point => {
        console.log(
          `     ${point.x}: ${typeof point.y === 'number' ? point.y.toFixed(1) : point.y}${viz.yAxis.unit || ''}`
        )
      })
      console.log('')
    })

    this.demoMetrics.insightsGenerated += insights.length
    this.emit('demo:analytics_complete', {insightCount: insights.length})
  }

  /**
   * Run comprehensive quality report demo
   */
  public async runQualityReportDemo(): Promise<void> {
    console.log('\n📋 Running Quality Report Generation Demo...\n')

    const endTime = Date.now()
    const startTime = endTime - 15 * 60 * 1000 // Last 15 minutes
    const samples = this.collector.getMetrics(startTime, endTime)

    if (samples.length === 0) {
      console.log('⚠️ No samples available for reporting. Running collection first...')
      await this.runLiveCollectionDemo()
      return this.runQualityReportDemo()
    }

    console.log(`📋 Generating comprehensive quality report for ${samples.length} samples...\n`)

    const aggregations = [
      this.collector.getAggregatedMetrics(900) // 15 minutes
    ].filter(Boolean) as QualityMetricsAggregation[]

    // Generate report
    const report = this.analyticsEngine.generateQualityReport(samples, aggregations, {
      start: startTime,
      end: endTime
    })

    // Display report summary
    console.log('📊 Quality Report Summary:')
    console.log('='.repeat(50))
    console.log(`Report ID: ${report.id}`)
    console.log(
      `Time Range: ${new Date(report.timeRange.start).toLocaleTimeString()} - ${new Date(report.timeRange.end).toLocaleTimeString()}`
    )
    console.log(`Duration: ${(report.timeRange.duration / 1000 / 60).toFixed(1)} minutes`)
    console.log(`Overall Health: ${report.summary.overallHealth.toUpperCase()}`)
    console.log('')

    // Key metrics
    console.log('🎯 Key Metrics:')
    console.log(
      `   Average Accuracy: ${(report.summary.keyMetrics.averageAccuracy * 100).toFixed(1)}%`
    )
    console.log(`   Average Latency: ${report.summary.keyMetrics.averageLatency.toFixed(0)}ms`)
    console.log(`   Reliability: ${(report.summary.keyMetrics.reliability * 100).toFixed(1)}%`)
    if (report.summary.keyMetrics.ukrainianPerformance) {
      console.log(
        `   Ukrainian Performance: ${(report.summary.keyMetrics.ukrainianPerformance * 100).toFixed(1)}%`
      )
    }
    console.log('')

    // Top issues
    if (report.summary.topIssues.length > 0) {
      console.log('⚠️ Top Issues:')
      report.summary.topIssues.slice(0, 3).forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`)
      })
      console.log('')
    }

    // Top recommendations
    if (report.summary.topRecommendations.length > 0) {
      console.log('💡 Top Recommendations:')
      report.summary.topRecommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`)
      })
      console.log('')
    }

    // Provider comparison
    console.log('🏆 Provider Performance Ranking:')
    report.providerComparison.slice(0, 3).forEach(provider => {
      console.log(
        `   ${provider.rank}. ${provider.providerId} (Score: ${(provider.score * 100).toFixed(1)})`
      )
      console.log(`      Strengths: ${provider.strengths.slice(0, 2).join(', ')}`)
      if (provider.weaknesses.length > 0) {
        console.log(`      Weaknesses: ${provider.weaknesses.slice(0, 2).join(', ')}`)
      }
      if (provider.ukrainianSuitability) {
        console.log(
          `      Ukrainian Suitability: ${(provider.ukrainianSuitability * 100).toFixed(1)}%`
        )
      }
    })
    console.log('')

    // Ukrainian analysis
    if (report.ukrainianAnalysis) {
      console.log('🇺🇦 Ukrainian Language Analysis:')
      console.log(
        `   Pure Ukrainian Performance: ${(report.ukrainianAnalysis.pureUkrainianPerformance * 100).toFixed(1)}%`
      )
      console.log(
        `   Mixed Language Performance: ${(report.ukrainianAnalysis.mixedLanguagePerformance * 100).toFixed(1)}%`
      )
      console.log(
        `   Cyrillic Quality: ${(report.ukrainianAnalysis.cyrillicQuality * 100).toFixed(1)}%`
      )
      console.log(
        `   Dialect Handling: ${(report.ukrainianAnalysis.dialectHandling * 100).toFixed(1)}%`
      )

      if (report.ukrainianAnalysis.commonIssues.length > 0) {
        console.log(
          `   Common Issues: ${report.ukrainianAnalysis.commonIssues.slice(0, 2).join(', ')}`
        )
      }
      console.log('')
    }

    console.log('✅ Quality report generated successfully')

    this.demoMetrics.reportsGenerated++
    this.emit('demo:report_complete', {reportId: report.id})
  }

  /**
   * Run feedback loop optimization demo
   */
  public async runFeedbackLoopDemo(): Promise<void> {
    console.log('\n🔄 Running Feedback Loop Optimization Demo...\n')
    console.log('Simulating adaptive quality improvement based on analytics feedback...\n')

    const iterations = 5

    for (let i = 1; i <= iterations; i++) {
      console.log(`🔄 Feedback Loop Iteration ${i}/${iterations}`)

      // Simulate getting feedback from analytics
      const samples = this.collector.getMetrics(Date.now() - 60000, Date.now()) // Last minute

      if (samples.length > 0) {
        // Analyze current performance
        const insights = await this.analyticsEngine.analyzeMetrics(samples, [])

        // Process critical insights for feedback
        const criticalInsights = insights.filter(insight => insight.severity === 'critical')
        const warnings = insights.filter(insight => insight.severity === 'warning')

        console.log(
          `   📊 Analysis: ${insights.length} insights (${criticalInsights.length} critical, ${warnings.length} warnings)`
        )

        if (criticalInsights.length > 0) {
          console.log(`   🚨 Critical Issue Detected: ${criticalInsights[0].title}`)
          console.log(`   🔧 Applying Feedback: ${criticalInsights[0].recommendations[0]}`)

          // Simulate applying feedback (would trigger actual system changes)
          this.simulateFeedbackApplication(criticalInsights[0])
        } else if (warnings.length > 0) {
          console.log(`   ⚠️ Warning: ${warnings[0].title}`)
          console.log(`   💡 Suggestion: ${warnings[0].recommendations[0]}`)
        } else {
          console.log('   ✅ No critical issues - system performing well')
        }
      } else {
        console.log('   📊 Generating new samples for analysis...')

        // Generate some samples for next iteration
        for (let j = 0; j < 5; j++) {
          const sample = this.generateRealisticSample({
            name: 'Feedback Test',
            language: 'uk',
            audioQuality: 'good',
            provider: 'google-speech'
          })
          this.collector.collectSample(sample)
        }
      }

      this.demoMetrics.feedbackLoops++
      console.log('')

      // Brief pause between iterations
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.log('✅ Feedback loop optimization demo completed')
    this.emit('demo:feedback_complete')
  }

  /**
   * Run Ukrainian-specific optimization demo
   */
  public async runUkrainianOptimizationDemo(): Promise<void> {
    console.log('\n🇺🇦 Running Ukrainian-Specific Optimization Demo...\n')

    // Generate Ukrainian-specific scenarios
    const ukrainianScenarios = [
      {name: 'Standard Ukrainian', dialect: 'central', purity: 'pure'},
      {name: 'Western Ukrainian', dialect: 'western', purity: 'pure'},
      {name: 'Business Ukrainian-English', dialect: 'central', purity: 'mixed'},
      {name: 'Technical Ukrainian-English', dialect: 'central', purity: 'mixed'},
      {name: 'Casual Ukrainian-English', dialect: 'southern', purity: 'mixed'}
    ]

    console.log('Generating Ukrainian-specific transcription samples...\n')

    // Generate samples for each scenario
    for (const scenario of ukrainianScenarios) {
      console.log(`📝 Scenario: ${scenario.name}`)

      for (let i = 0; i < 8; i++) {
        const sample = this.generateUkrainianSpecificSample(scenario)
        this.collector.collectSample(sample)
      }

      console.log(`   Generated 8 samples`)
    }

    console.log('\n🔍 Analyzing Ukrainian-specific performance...\n')

    // Get Ukrainian metrics
    const ukrainianMetrics = this.collector.getUkrainianMetrics()

    console.log('🇺🇦 Ukrainian Performance Analysis:')
    console.log('='.repeat(40))

    if (ukrainianMetrics.pureUkrainian) {
      console.log(
        `Pure Ukrainian Accuracy: ${(ukrainianMetrics.pureUkrainian.averageAccuracy * 100).toFixed(1)}%`
      )
      console.log(`Pure Ukrainian Samples: ${ukrainianMetrics.pureUkrainian.totalSamples}`)
    }

    if (ukrainianMetrics.mixedLanguage) {
      console.log(
        `Mixed Language Accuracy: ${(ukrainianMetrics.mixedLanguage.averageAccuracy * 100).toFixed(1)}%`
      )
      console.log(`Mixed Language Samples: ${ukrainianMetrics.mixedLanguage.totalSamples}`)
    }

    console.log('\nSpecialized Metrics:')
    console.log(
      `Cyrillic Accuracy: ${(ukrainianMetrics.overall.cyrillicAccuracy * 100).toFixed(1)}%`
    )
    console.log(
      `Dialect Recognition: ${(ukrainianMetrics.overall.dialectRecognition * 100).toFixed(1)}%`
    )
    console.log(
      `Transliteration Quality: ${(ukrainianMetrics.overall.transliterationQuality * 100).toFixed(1)}%`
    )
    console.log(
      `Mixed Language Handling: ${(ukrainianMetrics.overall.mixedLanguageHandling * 100).toFixed(1)}%`
    )

    // Generate Ukrainian-specific insights
    const allSamples = this.collector.getMetrics(Date.now() - 300000, Date.now())
    const ukrainianSamples = allSamples.filter(s => s.detectedLanguages.primaryLanguage === 'uk')

    if (ukrainianSamples.length > 0) {
      console.log('\n💡 Ukrainian-Specific Insights:')

      const insights = await this.analyticsEngine.analyzeMetrics(ukrainianSamples, [])
      const ukrainianInsights = insights.filter(i => i.type === 'ukrainian')

      if (ukrainianInsights.length > 0) {
        ukrainianInsights.slice(0, 3).forEach(insight => {
          console.log(`   • ${insight.title}`)
          console.log(`     ${insight.description}`)
          console.log(`     Recommendation: ${insight.recommendations[0]}`)
          console.log('')
        })
      } else {
        console.log('   ✅ No significant Ukrainian-specific issues detected')
      }
    }

    console.log('✅ Ukrainian optimization analysis completed')
    this.emit('demo:ukrainian_complete')
  }

  /**
   * Display demo summary and statistics
   */
  public displayDemoSummary(): void {
    console.log('\n' + '='.repeat(60))
    console.log('📊 Quality Metrics Analytics Demo Summary')
    console.log('='.repeat(60))

    const uptime = Date.now() - this.demoMetrics.startTime

    console.log(`Demo Duration: ${(uptime / 1000).toFixed(1)} seconds`)
    console.log(`Samples Generated: ${this.demoMetrics.samplesGenerated}`)
    console.log(`Insights Generated: ${this.demoMetrics.insightsGenerated}`)
    console.log(`Reports Generated: ${this.demoMetrics.reportsGenerated}`)
    console.log(`Feedback Loops: ${this.demoMetrics.feedbackLoops}`)

    // Collector statistics
    const collectorStats = this.collector.getCollectorStatistics()
    console.log('\nCollector Statistics:')
    console.log(`  Total Samples Collected: ${collectorStats.totalSamples}`)
    console.log(`  Samples in Memory: ${collectorStats.samplesInMemory}`)
    console.log(`  Memory Usage: ${collectorStats.memoryUsage.toFixed(1)}MB`)
    console.log(`  Aggregations Generated: ${collectorStats.aggregationsGenerated}`)

    // Analytics statistics
    const analyticsStats = this.analyticsEngine.getAnalyticsStatistics()
    console.log('\nAnalytics Statistics:')
    console.log(`  Total Analyses: ${analyticsStats.totalAnalyses}`)
    console.log(`  Insights Generated: ${analyticsStats.insightsGenerated}`)
    console.log(`  Reports Generated: ${analyticsStats.reportsGenerated}`)
    console.log(`  Average Analysis Duration: ${analyticsStats.analysisDuration}ms`)

    // Recent provider comparison
    const recentSamples = this.collector.getMetrics(Date.now() - 300000, Date.now())
    if (recentSamples.length > 0) {
      const providerComparison = this.collector.getProviderComparison(300)

      console.log('\nProvider Performance (Last 5 minutes):')
      providerComparison.slice(0, 3).forEach(provider => {
        console.log(
          `  ${provider.providerId}: ${(provider.metrics.accuracy * 100).toFixed(1)}% accuracy, ${provider.metrics.latency.toFixed(0)}ms latency (${provider.sampleCount} samples)`
        )
      })
    }

    console.log('\n✅ Demo completed successfully!')
  }

  /**
   * Run complete demo suite
   */
  public async runCompleteDemo(): Promise<void> {
    try {
      await this.initialize()

      console.log('🚀 Starting Complete Quality Metrics Analytics Demo...')
      console.log('='.repeat(60))

      await this.runLiveCollectionDemo()
      await new Promise(resolve => setTimeout(resolve, 2000))

      await this.runAnalyticsDemo()
      await new Promise(resolve => setTimeout(resolve, 2000))

      await this.runQualityReportDemo()
      await new Promise(resolve => setTimeout(resolve, 2000))

      await this.runFeedbackLoopDemo()
      await new Promise(resolve => setTimeout(resolve, 2000))

      await this.runUkrainianOptimizationDemo()

      this.displayDemoSummary()
    } catch (error) {
      console.error('❌ Demo failed:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  /**
   * Cleanup demo resources
   */
  public async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up demo resources...')

    this.isRunning = false

    if (this.simulationTimer) {
      clearInterval(this.simulationTimer)
      this.simulationTimer = null
    }

    this.collector.cleanup()
    this.analyticsEngine.cleanup()

    console.log('✅ Demo cleanup completed\n')
  }

  // Private helper methods

  private setupEventHandlers(): void {
    this.collector.on('sample:collected', data => {
      this.emit('sample:collected', data)
    })

    this.collector.on('quality:critical_issues', data => {
      console.log(
        `🚨 Critical quality issue detected in session ${data.sessionId}: ${data.issues.join(', ')}`
      )
    })

    this.analyticsEngine.on('analysis:complete', data => {
      this.emit('analysis:complete', data)
    })

    this.analyticsEngine.on('report:generated', data => {
      this.emit('report:generated', data)
    })
  }

  private generateRealisticSample(scenario: {
    name: string
    language: string
    audioQuality: 'poor' | 'fair' | 'good' | 'excellent'
    provider: string
    mixed?: boolean
    domain?: string
  }): TranscriptionQualitySample {
    const baseAccuracy = this.getBaseAccuracy(scenario.audioQuality, scenario.language)
    const latencyBase = this.getBaseLatency(scenario.provider, scenario.audioQuality)

    // Add some realistic variation
    const accuracy = Math.max(0, Math.min(1, baseAccuracy + (Math.random() - 0.5) * 0.2))
    const latency = Math.max(500, latencyBase + (Math.random() - 0.5) * 1000)
    const confidence = Math.max(0, Math.min(1, accuracy + (Math.random() - 0.5) * 0.3))

    return {
      sessionId: `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      providerId: scenario.provider,
      timestamp: Date.now(),

      audioQuality: scenario.audioQuality,
      audioLength: Math.random() * 30 + 5, // 5-35 seconds
      backgroundNoise:
        scenario.audioQuality === 'poor'
          ? 'high'
          : scenario.audioQuality === 'fair'
            ? 'medium'
            : 'low',
      speakerCount: Math.random() > 0.8 ? 2 : 1,

      detectedLanguages: {
        primaryLanguage: scenario.language,
        detectedLanguages: scenario.mixed ? [scenario.language, 'en'] : [scenario.language],
        confidence: Math.max(0.6, Math.min(1, confidence + 0.1)),
        scores: {[scenario.language]: confidence}
      },
      expectedLanguage: scenario.language,
      languageDetectionAccuracy: Math.max(0.7, Math.min(1, confidence + 0.05)),

      transcriptionText: `Sample transcription for ${scenario.name}`,
      confidenceScore: confidence,
      processingLatency: latency,

      accuracy,
      wordErrorRate: Math.max(0, (1 - accuracy) * 0.8),
      characterErrorRate: Math.max(0, (1 - accuracy) * 0.6),
      fluencyScore: Math.max(0.5, accuracy + (Math.random() - 0.5) * 0.1),
      completenessScore: Math.max(0.6, accuracy + (Math.random() - 0.5) * 0.1),

      // Ukrainian-specific metrics
      cyrillicAccuracy: scenario.language === 'uk' ? Math.max(0.6, accuracy - 0.1) : undefined,
      transliterationQuality:
        scenario.language === 'uk' && scenario.mixed ? Math.max(0.5, accuracy - 0.2) : undefined,
      mixedLanguageHandling: scenario.mixed ? Math.max(0.5, accuracy - 0.15) : undefined,
      dialectRecognition: scenario.language === 'uk' ? Math.max(0.6, accuracy - 0.05) : undefined,

      memoryUsage: Math.random() * 512 + 256,
      cpuUsage: Math.random() * 0.8 + 0.2,
      networkLatency: Math.random() * 200 + 50,

      userRating: Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : undefined
    }
  }

  private generateUkrainianSpecificSample(scenario: {
    name: string
    dialect: string
    purity: 'pure' | 'mixed'
  }): TranscriptionQualitySample {
    const baseAccuracy = scenario.purity === 'pure' ? 0.85 : 0.75
    const dialectBonus =
      scenario.dialect === 'central' ? 0.05 : scenario.dialect === 'western' ? 0.02 : 0

    const accuracy = Math.max(
      0.6,
      Math.min(1, baseAccuracy + dialectBonus + (Math.random() - 0.5) * 0.15)
    )

    return {
      sessionId: `ukrainian_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      providerId: 'ukrainian-optimized-provider',
      timestamp: Date.now(),

      audioQuality: 'good',
      audioLength: Math.random() * 20 + 10,
      backgroundNoise: 'low',
      speakerCount: 1,

      detectedLanguages: {
        primaryLanguage: 'uk',
        detectedLanguages: scenario.purity === 'mixed' ? ['uk', 'en'] : ['uk'],
        confidence: accuracy + 0.1,
        scores: {uk: accuracy + 0.1, ...(scenario.purity === 'mixed' ? {en: 0.3} : {})}
      },
      expectedLanguage: 'uk',
      languageDetectionAccuracy: Math.max(0.8, accuracy + 0.05),

      transcriptionText: `Ukrainian ${scenario.dialect} dialect sample`,
      confidenceScore: accuracy,
      processingLatency: Math.random() * 1000 + 1500,

      accuracy,
      wordErrorRate: (1 - accuracy) * 0.7,
      characterErrorRate: (1 - accuracy) * 0.5,
      fluencyScore: accuracy + (Math.random() - 0.5) * 0.1,
      completenessScore: accuracy + (Math.random() - 0.5) * 0.1,

      // Enhanced Ukrainian metrics
      cyrillicAccuracy: Math.max(0.7, accuracy + (Math.random() - 0.5) * 0.1),
      transliterationQuality:
        scenario.purity === 'mixed' ? Math.max(0.6, accuracy - 0.1) : undefined,
      mixedLanguageHandling:
        scenario.purity === 'mixed' ? Math.max(0.6, accuracy - 0.05) : undefined,
      dialectRecognition: Math.max(0.65, accuracy + (scenario.dialect === 'central' ? 0.1 : 0)),

      memoryUsage: Math.random() * 384 + 128,
      cpuUsage: Math.random() * 0.6 + 0.3,
      networkLatency: Math.random() * 150 + 75
    }
  }

  private getBaseAccuracy(audioQuality: string, language: string): number {
    const qualityMultiplier = {
      poor: 0.6,
      fair: 0.75,
      good: 0.85,
      excellent: 0.92
    }

    const languageMultiplier = {
      en: 1.0,
      uk: 0.9, // Ukrainian is more challenging
      ru: 0.88,
      de: 0.85
    }

    return (
      (qualityMultiplier[audioQuality as keyof typeof qualityMultiplier] || 0.8) *
      (languageMultiplier[language as keyof typeof languageMultiplier] || 0.8)
    )
  }

  private getBaseLatency(provider: string, audioQuality: string): number {
    const providerBase = {
      'google-speech': 1800,
      'azure-speech': 2200,
      whisper: 3500,
      'ukrainian-optimized-provider': 2000
    }

    const qualityPenalty = {
      poor: 800,
      fair: 400,
      good: 0,
      excellent: -200
    }

    return (
      (providerBase[provider as keyof typeof providerBase] || 2000) +
      (qualityPenalty[audioQuality as keyof typeof qualityPenalty] || 0)
    )
  }

  private displayRecentMetrics(): void {
    const stats = this.collector.getCollectorStatistics()
    const recent = this.collector.getMetrics(Date.now() - 30000, Date.now()) // Last 30 seconds

    if (recent.length > 0) {
      const avgAccuracy = recent.reduce((sum, s) => sum + (s.accuracy || 0), 0) / recent.length
      const avgLatency = recent.reduce((sum, s) => sum + s.processingLatency, 0) / recent.length

      console.log(
        `   Recent metrics: ${(avgAccuracy * 100).toFixed(1)}% accuracy, ${avgLatency.toFixed(0)}ms latency`
      )
    }
  }

  private displayInsightsByCategory(insights: AnalyticsInsight[]): void {
    const categories = ['critical', 'warning', 'info']

    categories.forEach(severity => {
      const categoryInsights = insights.filter(i => i.severity === severity)
      if (categoryInsights.length > 0) {
        console.log(
          `${severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'} ${severity.toUpperCase()} Issues (${categoryInsights.length}):`
        )

        categoryInsights.slice(0, 3).forEach(insight => {
          console.log(`   • ${insight.title}`)
          console.log(`     ${insight.description}`)
          if (insight.recommendations.length > 0) {
            console.log(`     💡 ${insight.recommendations[0]}`)
          }
        })
        console.log('')
      }
    })
  }

  private simulateFeedbackApplication(insight: AnalyticsInsight): void {
    // Simulate applying feedback to improve system performance
    console.log('     🔄 Feedback applied - simulating system improvement')

    // In a real system, this would trigger actual changes like:
    // - Switching to better performing providers
    // - Adjusting quality thresholds
    // - Updating language models
    // - Modifying processing parameters
  }
}

/**
 * Quick demo function for testing
 */
export async function runQuickQualityDemo(): Promise<void> {
  console.log('🎬 Starting Quick Quality Metrics Demo...\n')

  const demo = new QualityMetricsAnalyticsDemo(true) // Ukrainian optimized

  try {
    await demo.initialize()
    await demo.runLiveCollectionDemo()
    await demo.runAnalyticsDemo()
    console.log('\n✅ Quick quality demo completed successfully!')
  } catch (error) {
    console.error('❌ Quick demo failed:', error)
  } finally {
    await demo.cleanup()
  }
}

// Export main demo class
export default QualityMetricsAnalyticsDemo

// Self-executing demo when run directly
if (require.main === module) {
  const demo = new QualityMetricsAnalyticsDemo()
  demo.runCompleteDemo().catch(console.error)
}
