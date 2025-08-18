/**
 * Provider Quality Comparison and Switching Demo
 *
 * Comprehensive demonstration of the provider quality comparison service
 * and intelligent switching strategies for Ukrainian/mixed language scenarios.
 */

import {EventEmitter} from 'events'
import {
  ProviderQualityComparisonService,
  createProviderQualityComparisonService,
  type ComparisonConfig,
  type TranscriptionSample,
  type ComparisonResult,
  type ProviderQualityScore,
  type QualityRecommendation
} from '../services/ProviderQualityComparisonService'
import {
  ProviderSwitchingStrategyService,
  createProviderSwitchingStrategyService,
  type SwitchingContext,
  UKRAINIAN_SWITCHING_CONFIG,
  DEFAULT_SWITCHING_CONFIG,
  AGGRESSIVE_SWITCHING_CONFIG
} from '../services/ProviderSwitchingStrategyService'

/**
 * Mock transcription provider for demo purposes
 */
class MockTranscriptionProvider {
  constructor(
    public id: string,
    public name: string,
    private baseQuality: number,
    private baseLatency: number,
    private ukrainianBonus: number = 0
  ) {}

  async transcribe(
    audio: ArrayBuffer,
    options?: {language?: string}
  ): Promise<{
    text: string
    confidence: number
    language: string
    processing_time: number
  }> {
    // Simulate processing time
    const processingTime = this.baseLatency + Math.random() * 500
    await new Promise(resolve => setTimeout(resolve, processingTime))

    // Simulate quality based on language
    let confidence = this.baseQuality
    if (options?.language === 'uk') {
      confidence += this.ukrainianBonus
    }

    // Add some randomness
    confidence += (Math.random() - 0.5) * 0.2
    confidence = Math.max(0, Math.min(1, confidence))

    return {
      text: this.generateMockText(options?.language || 'en'),
      confidence,
      language: options?.language || 'en',
      processing_time: processingTime
    }
  }

  private generateMockText(language: string): string {
    const texts = {
      en: 'Hello, this is a sample English transcription.',
      uk: 'Привіт, це зразок української транскрипції.',
      mixed: 'Hello, це mixed language example з декількома languages.'
    }
    return texts[language as keyof typeof texts] || texts.en
  }
}

/**
 * Demo class showcasing provider quality comparison and switching
 */
export class ProviderQualityComparisonDemo extends EventEmitter {
  private comparisonService: ProviderQualityComparisonService
  private switchingService: ProviderSwitchingStrategyService
  private providers: Map<string, MockTranscriptionProvider> = new Map()
  private currentProvider = 'openai'
  private sessionData: Array<Record<string, unknown>> = []

  constructor() {
    super()

    // Initialize comparison service
    const comparisonConfig: ComparisonConfig = {
      updateInterval: 5000,
      historySize: 50,
      enableTrendAnalysis: true,
      confidenceWeights: {
        accuracy: 0.4,
        consistency: 0.2,
        latency: 0.2,
        errorRate: 0.2
      },
      languageSpecificWeights: {
        uk: {accuracy: 0.5, consistency: 0.3, latency: 0.1, errorRate: 0.1},
        en: {accuracy: 0.3, consistency: 0.2, latency: 0.3, errorRate: 0.2}
      }
    }

    this.comparisonService = createProviderQualityComparisonService(comparisonConfig)

    // Initialize switching service
    this.switchingService = createProviderSwitchingStrategyService(UKRAINIAN_SWITCHING_CONFIG)

    this.setupProviders()
    this.setupEventListeners()
  }

  /**
   * Initialize demo
   */
  public async initialize(): Promise<void> {
    console.log('\n🔧 Initializing Provider Quality Comparison Demo...\n')

    try {
      await this.comparisonService.initialize()
      await this.switchingService.initialize()

      console.log('✅ Services initialized successfully')
      console.log(`📊 Providers configured: ${Array.from(this.providers.keys()).join(', ')}`)
      console.log(`🎯 Current provider: ${this.currentProvider}`)
      console.log('🌐 Optimized for Ukrainian/English mixed scenarios\n')

      this.emit('initialized')
    } catch (error) {
      console.error('❌ Initialization failed:', error)
      throw error
    }
  }

  /**
   * Run basic comparison demo
   */
  public async runBasicComparison(): Promise<void> {
    console.log('\n📋 Running Basic Provider Comparison...\n')

    // Generate test samples
    const testSamples = this.generateTestSamples()

    // Process samples with each provider
    for (const sample of testSamples) {
      for (const [providerId, provider] of this.providers) {
        try {
          const result = await provider.transcribe(
            new ArrayBuffer(0), // Mock audio buffer
            {language: sample.detectedLanguage}
          )

          // Submit to comparison service
          await this.comparisonService.submitTranscription(providerId, {
            ...sample,
            confidence: result.confidence,
            processingTime: result.processing_time,
            providerResult: result.text
          })

          console.log(
            `${this.getProviderIcon(providerId)} ${providerId}: ${result.confidence.toFixed(3)} confidence (${result.processing_time.toFixed(0)}ms)`
          )
        } catch (error) {
          console.error(`❌ ${providerId} failed:`, error)
        }
      }
      console.log('')
    }

    // Get comparison results
    const comparison = await this.comparisonService.compareProviders()
    this.displayComparisonResults(comparison)
  }

  /**
   * Run intelligent switching demo
   */
  public async runIntelligentSwitching(): Promise<void> {
    console.log('\n🔄 Running Intelligent Provider Switching Demo...\n')

    const scenarios = [
      {
        language: 'en',
        errorCount: 0,
        networkConditions: 'good' as const,
        description: 'English - Good conditions'
      },
      {
        language: 'uk',
        errorCount: 0,
        networkConditions: 'good' as const,
        description: 'Ukrainian - Good conditions'
      },
      {
        language: 'uk',
        errorCount: 3,
        networkConditions: 'fair' as const,
        description: 'Ukrainian - Some errors'
      },
      {
        language: 'mixed',
        errorCount: 1,
        networkConditions: 'poor' as const,
        description: 'Mixed language - Poor network'
      },
      {
        language: 'uk',
        errorCount: 6,
        networkConditions: 'good' as const,
        description: 'Ukrainian - High error rate'
      }
    ]

    for (const scenario of scenarios) {
      console.log(`\n🎭 Scenario: ${scenario.description}`)

      // Generate samples for this scenario
      const samples = this.generateScenarioSamples(scenario.language, 3)

      // Process samples to build comparison data
      for (const sample of samples) {
        for (const [providerId, provider] of this.providers) {
          const result = await provider.transcribe(new ArrayBuffer(0), {
            language: sample.detectedLanguage
          })

          await this.comparisonService.submitTranscription(providerId, {
            ...sample,
            confidence: result.confidence,
            processingTime: result.processing_time,
            providerResult: result.text
          })
        }
      }

      // Get comparison and evaluate switching
      const comparison = await this.comparisonService.compareProviders()
      const switchingContext: SwitchingContext = {
        currentProvider: this.currentProvider,
        activeLanguage: scenario.language,
        errorCount: scenario.errorCount,
        networkConditions: scenario.networkConditions
      }

      const decision = this.switchingService.evaluateSwitching(comparison, switchingContext)

      console.log(
        `📊 Best provider: ${comparison.bestProvider} (${comparison.allProviders[0].overallScore.toFixed(3)} score)`
      )
      console.log(`🤔 Switch decision: ${decision.shouldSwitch ? '✅ YES' : '❌ NO'}`)
      console.log(`💭 Reason: ${decision.reason}`)
      console.log(`🎯 Target: ${decision.targetProvider}`)
      console.log(`⚡ Urgency: ${decision.urgency}`)

      if (decision.shouldSwitch) {
        const switchResult = await this.switchingService.executeSwitch(decision, switchingContext)
        if (switchResult.success) {
          this.currentProvider = switchResult.newProvider
          console.log(`🔄 Successfully switched to: ${switchResult.newProvider}`)
        } else {
          console.log(`❌ Switch failed: ${switchResult.error}`)
        }
      }
    }
  }

  /**
   * Run strategy comparison demo
   */
  public async runStrategyComparison(): Promise<void> {
    console.log('\n⚔️ Running Strategy Comparison Demo...\n')

    const strategies = [
      {
        name: 'Conservative',
        config: {...DEFAULT_SWITCHING_CONFIG, strategy: 'conservative' as const}
      },
      {name: 'Balanced', config: DEFAULT_SWITCHING_CONFIG},
      {name: 'Aggressive', config: AGGRESSIVE_SWITCHING_CONFIG},
      {name: 'Ukrainian-Optimized', config: UKRAINIAN_SWITCHING_CONFIG}
    ]

    // Test scenario
    const testContext: SwitchingContext = {
      currentProvider: this.currentProvider,
      activeLanguage: 'uk',
      errorCount: 2,
      networkConditions: 'fair'
    }

    // Generate comparison data
    const testSamples = this.generateTestSamples()
    for (const sample of testSamples) {
      for (const [providerId, provider] of this.providers) {
        const result = await provider.transcribe(new ArrayBuffer(0), {
          language: sample.detectedLanguage
        })

        await this.comparisonService.submitTranscription(providerId, {
          ...sample,
          confidence: result.confidence,
          processingTime: result.processing_time,
          providerResult: result.text
        })
      }
    }

    const comparison = await this.comparisonService.compareProviders()

    console.log('📊 Comparison Data:')
    console.log(`   Current: ${testContext.currentProvider}`)
    console.log(
      `   Best: ${comparison.bestProvider} (${comparison.allProviders[0].overallScore.toFixed(3)} score)`
    )
    console.log(
      `   Quality gap: ${((comparison.allProviders[0].overallScore - (comparison.allProviders.find(p => p.providerId === testContext.currentProvider)?.overallScore || 0)) * 100).toFixed(1)}%\n`
    )

    for (const strategy of strategies) {
      const strategyService = createProviderSwitchingStrategyService(strategy.config)
      await strategyService.initialize()

      const decision = strategyService.evaluateSwitching(comparison, testContext)

      console.log(
        `${strategy.name.padEnd(20)} | ${decision.shouldSwitch ? '✅ SWITCH' : '❌ STAY'} | ${decision.reason}`
      )

      strategyService.cleanup()
    }
  }

  /**
   * Run real-time monitoring demo
   */
  public async runRealtimeMonitoring(): Promise<void> {
    console.log('\n📡 Running Real-time Monitoring Demo...\n')
    console.log('Monitoring provider performance for 30 seconds...\n')

    const monitoringDuration = 30000 // 30 seconds
    const sampleInterval = 2000 // Every 2 seconds

    const startTime = Date.now()
    const monitoring = setInterval(async () => {
      // Generate a random sample
      const sample = this.generateRandomSample()

      // Process with current provider
      const provider = this.providers.get(this.currentProvider)!
      const result = await provider.transcribe(new ArrayBuffer(0), {
        language: sample.detectedLanguage
      })

      await this.comparisonService.submitTranscription(this.currentProvider, {
        ...sample,
        confidence: result.confidence,
        processingTime: result.processing_time,
        providerResult: result.text
      })

      // Get real-time comparison
      const comparison = await this.comparisonService.compareProviders()
      const switchingContext: SwitchingContext = {
        currentProvider: this.currentProvider,
        activeLanguage: sample.detectedLanguage,
        sessionDuration: Date.now() - startTime
      }

      const decision = this.switchingService.evaluateSwitching(comparison, switchingContext)

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(
        `[${elapsed}s] ${this.currentProvider} | Score: ${(comparison.allProviders.find(p => p.providerId === this.currentProvider)?.overallScore || 0).toFixed(3)} | ${sample.detectedLanguage} | ${decision.shouldSwitch ? '🔄 Evaluating switch' : '✅ Staying'}`
      )

      if (decision.shouldSwitch && decision.urgency !== 'low') {
        const switchResult = await this.switchingService.executeSwitch(decision, switchingContext)
        if (switchResult.success) {
          this.currentProvider = switchResult.newProvider
          console.log(`   ↳ 🔄 Switched to: ${switchResult.newProvider} (${decision.reason})`)
        }
      }
    }, sampleInterval)

    // Stop monitoring after duration
    setTimeout(() => {
      clearInterval(monitoring)
      console.log('\n📊 Monitoring completed. Final statistics:')
      this.displayFinalStatistics()
    }, monitoringDuration)

    // Wait for monitoring to complete
    await new Promise(resolve => setTimeout(resolve, monitoringDuration + 1000))
  }

  /**
   * Display comparison results
   */
  private displayComparisonResults(comparison: ComparisonResult): void {
    console.log('📊 Provider Comparison Results:\n')

    comparison.allProviders.forEach((provider: ProviderQualityScore, index: number) => {
      const rank = index + 1
      const badge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`

      console.log(
        `${badge} ${provider.providerId.padEnd(12)} | Overall: ${provider.overallScore.toFixed(3)} | Acc: ${provider.metrics.accuracy.value.toFixed(3)} | Lat: ${provider.metrics.latency.value.toFixed(0)}ms`
      )

      // Show language scores
      const ukScore = provider.languageScores.uk || 0
      const enScore = provider.languageScores.en || 0
      console.log(`   Languages: UK ${ukScore.toFixed(3)} | EN ${enScore.toFixed(3)}`)
    })

    console.log(`\n🎯 Recommendation: ${comparison.bestProvider}`)
    console.log(`📈 Confidence: ${(comparison.confidence * 100).toFixed(1)}%`)

    if (comparison.recommendations && comparison.recommendations.length > 0) {
      console.log('\n💡 Recommendations:')
      comparison.recommendations.forEach((rec: QualityRecommendation) => {
        console.log(`   • ${rec.message}`)
      })
    }
  }

  /**
   * Display final statistics
   */
  private displayFinalStatistics(): void {
    const stats = this.switchingService.getSwitchingStatistics()

    console.log(`   Total switches: ${stats.totalSwitches}`)
    console.log(`   Success rate: ${(stats.successRate * 100).toFixed(1)}%`)
    console.log(`   Average improvement: ${(stats.averageImprovement * 100).toFixed(1)}%`)
    console.log(`   Switching trend: ${stats.recentTrend}`)

    if (Object.keys(stats.switchReasons).length > 0) {
      console.log('\n   Switch reasons:')
      Object.entries(stats.switchReasons).forEach(([reason, count]) => {
        console.log(`     • ${reason}: ${count}`)
      })
    }
  }

  // Helper methods

  private setupProviders(): void {
    // Create mock providers with different characteristics
    this.providers.set(
      'openai',
      new MockTranscriptionProvider('openai', 'OpenAI Whisper', 0.85, 1200, 0.02)
    )
    this.providers.set(
      'google',
      new MockTranscriptionProvider('google', 'Google Speech', 0.82, 800, 0.08)
    )
    this.providers.set(
      'azure',
      new MockTranscriptionProvider('azure', 'Azure Speech', 0.8, 1000, 0.01)
    )
    this.providers.set(
      'amazon',
      new MockTranscriptionProvider('amazon', 'Amazon Transcribe', 0.78, 1500, 0.03)
    )
  }

  private setupEventListeners(): void {
    this.switchingService.on('switching:completed', data => {
      console.log(`🔄 Provider switched: ${data.from} → ${data.to}`)
    })

    this.switchingService.on('switching:error', data => {
      console.error(`❌ Switch error: ${data.from} → ${data.to}: ${data.error}`)
    })

    this.comparisonService.on('provider:performance_change', data => {
      if (data.change === 'degraded') {
        console.warn(`⚠️ Performance degradation detected for ${data.providerId}`)
      }
    })
  }

  private generateTestSamples(): TranscriptionSample[] {
    return [
      {
        originalText: 'Hello, this is a test.',
        detectedLanguage: 'en',
        audioFeatures: {duration: 2.5, quality: 'good', noiseLevel: 0.1},
        contextInfo: {domain: 'general', userPreference: 'accuracy'},
        timestamp: Date.now()
      },
      {
        originalText: 'Привіт, це тестове повідомлення.',
        detectedLanguage: 'uk',
        audioFeatures: {duration: 3.0, quality: 'fair', noiseLevel: 0.2},
        contextInfo: {domain: 'general', userPreference: 'speed'},
        timestamp: Date.now()
      },
      {
        originalText: 'Hello, як справи? This is mixed language.',
        detectedLanguage: 'mixed',
        audioFeatures: {duration: 3.5, quality: 'good', noiseLevel: 0.15},
        contextInfo: {domain: 'casual', userPreference: 'balanced'},
        timestamp: Date.now()
      }
    ]
  }

  private generateScenarioSamples(language: string, count: number): TranscriptionSample[] {
    const samples: TranscriptionSample[] = []

    for (let i = 0; i < count; i++) {
      samples.push({
        originalText: this.getTextForLanguage(language),
        detectedLanguage: language,
        audioFeatures: {
          duration: 2 + Math.random() * 3,
          quality: Math.random() > 0.3 ? 'good' : 'fair',
          noiseLevel: Math.random() * 0.3
        },
        contextInfo: {
          domain: 'general',
          userPreference: Math.random() > 0.5 ? 'accuracy' : 'speed'
        },
        timestamp: Date.now() + i * 1000
      })
    }

    return samples
  }

  private generateRandomSample(): TranscriptionSample {
    const languages = ['en', 'uk', 'mixed']
    const language = languages[Math.floor(Math.random() * languages.length)]

    return {
      originalText: this.getTextForLanguage(language),
      detectedLanguage: language,
      audioFeatures: {
        duration: 2 + Math.random() * 3,
        quality: Math.random() > 0.2 ? 'good' : 'fair',
        noiseLevel: Math.random() * 0.4
      },
      contextInfo: {
        domain: 'general',
        userPreference: Math.random() > 0.5 ? 'accuracy' : 'speed'
      },
      timestamp: Date.now()
    }
  }

  private getTextForLanguage(language: string): string {
    const texts = {
      en: [
        'This is a sample English sentence.',
        'How are you doing today?',
        'The weather is quite nice outside.'
      ],
      uk: ['Це зразок української мови.', 'Як справи сьогодні?', 'Погода надворі досить гарна.'],
      mixed: [
        'Hello, як справи today?',
        'This is змішана мова example.',
        'Привіт, how are you doing?'
      ]
    }

    const textArray = texts[language as keyof typeof texts] || texts.en
    return textArray[Math.floor(Math.random() * textArray.length)]
  }

  private getProviderIcon(providerId: string): string {
    const icons = {
      openai: '🤖',
      google: '🔍',
      azure: '☁️',
      amazon: '📦'
    }
    return icons[providerId as keyof typeof icons] || '🔧'
  }

  /**
   * Cleanup demo resources
   */
  public async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up demo resources...')

    this.comparisonService.cleanup()
    this.switchingService.cleanup()
    this.providers.clear()
    this.sessionData = []

    console.log('✅ Demo cleanup completed\n')
  }

  /**
   * Run complete demo suite
   */
  public async runCompleteDemo(): Promise<void> {
    try {
      await this.initialize()

      console.log('🚀 Starting complete Provider Quality Comparison Demo...\n')
      console.log('='.repeat(60))

      await this.runBasicComparison()
      await new Promise(resolve => setTimeout(resolve, 2000))

      await this.runIntelligentSwitching()
      await new Promise(resolve => setTimeout(resolve, 2000))

      await this.runStrategyComparison()
      await new Promise(resolve => setTimeout(resolve, 2000))

      await this.runRealtimeMonitoring()

      console.log('\n' + '='.repeat(60))
      console.log('🎉 Complete demo finished successfully!')
    } catch (error) {
      console.error('❌ Demo failed:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }
}

/**
 * Quick demo function for testing
 */
export async function runQuickDemo(): Promise<void> {
  console.log('🎬 Starting Quick Provider Quality Comparison Demo...\n')

  const demo = new ProviderQualityComparisonDemo()

  try {
    await demo.initialize()
    await demo.runBasicComparison()
    console.log('\n✅ Quick demo completed successfully!')
  } catch (error) {
    console.error('❌ Quick demo failed:', error)
  } finally {
    await demo.cleanup()
  }
}

// Export main demo class
export default ProviderQualityComparisonDemo

// Self-executing demo when run directly
if (require.main === module) {
  const demo = new ProviderQualityComparisonDemo()
  demo.runCompleteDemo().catch(console.error)
}
