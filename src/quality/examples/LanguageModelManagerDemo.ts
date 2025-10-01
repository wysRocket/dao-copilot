/**
 * Language Model Manager Demo
 *
 * Comprehensive demonstration of the Language Model Manager and
 * Model Selection Strategy services for Ukrainian/mixed language scenarios.
 */

import {EventEmitter} from 'events'
import {
  LanguageModelManager,
  createLanguageModelManager,
  type ModelSelectionCriteria,
  UKRAINIAN_OPTIMIZED_CONFIG,
  DEFAULT_MODEL_MANAGER_CONFIG
} from '../services/LanguageModelManager'
import {
  ModelSelectionStrategyService,
  createModelSelectionStrategyService,
  type SelectionContext,
  UKRAINIAN_STRATEGY_CONFIG,
  DEFAULT_STRATEGY_CONFIG
} from '../services/ModelSelectionStrategyService'

/**
 * Demo class showcasing language model management and selection
 */
export class LanguageModelManagerDemo extends EventEmitter {
  private modelManager: LanguageModelManager
  private strategyService: ModelSelectionStrategyService
  private demoMetrics: {
    selectionsCount: number
    avgSelectionTime: number
    successfulSelections: number
    strategySwitches: number
    modelsLoaded: number
  } = {
    selectionsCount: 0,
    avgSelectionTime: 0,
    successfulSelections: 0,
    strategySwitches: 0,
    modelsLoaded: 0
  }

  constructor(optimizeForUkrainian = true) {
    super()

    // Initialize services with appropriate configurations
    const modelConfig = optimizeForUkrainian
      ? UKRAINIAN_OPTIMIZED_CONFIG
      : DEFAULT_MODEL_MANAGER_CONFIG
    const strategyConfig = optimizeForUkrainian
      ? UKRAINIAN_STRATEGY_CONFIG
      : DEFAULT_STRATEGY_CONFIG

    this.modelManager = createLanguageModelManager(modelConfig)
    this.strategyService = createModelSelectionStrategyService(strategyConfig)

    this.setupEventListeners()
  }

  /**
   * Initialize demo
   */
  public async initialize(): Promise<void> {
    console.log('\n🔧 Initializing Language Model Manager Demo...\n')

    try {
      await this.modelManager.initialize()
      await this.strategyService.initialize()

      console.log('✅ Services initialized successfully')
      console.log('🌐 Optimized for Ukrainian/English mixed scenarios')
      console.log(`📊 Available models: ${this.modelManager.getAvailableModels().length}`)
      console.log(
        `🎯 Available strategies: ${this.strategyService.getAvailableStrategies().length}\n`
      )

      this.emit('initialized')
    } catch (error) {
      console.error('❌ Initialization failed:', error)
      throw error
    }
  }

  /**
   * Run basic model selection demo
   */
  public async runBasicSelection(): Promise<void> {
    console.log('\n🎯 Running Basic Model Selection Demo...\n')

    const testScenarios: Array<{
      name: string
      criteria: ModelSelectionCriteria
      context: SelectionContext
    }> = [
      {
        name: 'Pure Ukrainian',
        criteria: {
          detectedLanguage: 'uk',
          confidence: 0.95,
          accuracyPriority: 0.8,
          latencyPriority: 0.2
        },
        context: {
          sessionLanguages: ['uk'],
          primaryLanguage: 'uk',
          recentPerformance: {},
          userFeedback: {},
          audioQuality: 'good',
          backgroundNoise: 'low',
          speakerCharacteristics: 'single',
          availableMemory: 8192,
          cpuUsage: 0.3,
          networkQuality: 'good',
          realTimeRequired: false,
          domain: 'general',
          terminology: 'simple',
          expectedLength: 'medium'
        }
      },
      {
        name: 'Pure English',
        criteria: {
          detectedLanguage: 'en',
          confidence: 0.92,
          accuracyPriority: 0.6,
          latencyPriority: 0.7,
          realTimeRequired: true
        },
        context: {
          sessionLanguages: ['en'],
          primaryLanguage: 'en',
          recentPerformance: {},
          userFeedback: {},
          audioQuality: 'excellent',
          backgroundNoise: 'low',
          speakerCharacteristics: 'single',
          availableMemory: 4096,
          cpuUsage: 0.6,
          networkQuality: 'excellent',
          realTimeRequired: true,
          domain: 'business',
          terminology: 'complex',
          expectedLength: 'short'
        }
      },
      {
        name: 'Mixed Ukrainian-English',
        criteria: {
          detectedLanguage: 'uk',
          confidence: 0.75,
          mixedLanguages: ['uk', 'en'],
          accuracyPriority: 0.9,
          latencyPriority: 0.3
        },
        context: {
          sessionLanguages: ['uk', 'en'],
          primaryLanguage: 'uk',
          recentPerformance: {},
          userFeedback: {},
          audioQuality: 'fair',
          backgroundNoise: 'medium',
          speakerCharacteristics: 'multiple',
          availableMemory: 12288,
          cpuUsage: 0.4,
          networkQuality: 'good',
          realTimeRequired: false,
          domain: 'technical',
          terminology: 'mixed',
          expectedLength: 'long'
        }
      }
    ]

    for (const scenario of testScenarios) {
      console.log(`\n📝 Scenario: ${scenario.name}`)
      console.log(
        `   Language: ${scenario.criteria.detectedLanguage}${scenario.criteria.mixedLanguages ? ` + ${scenario.criteria.mixedLanguages.join(', ')}` : ''}`
      )
      console.log(
        `   Context: ${scenario.context.audioQuality} audio, ${scenario.context.domain} domain`
      )

      const startTime = Date.now()

      try {
        // Get available models
        const availableModels = this.modelManager.getAvailableModels()

        // Select best model using strategy service
        const analysis = await this.strategyService.selectModel(
          availableModels,
          scenario.criteria,
          scenario.context
        )

        const selectionTime = Date.now() - startTime

        // Load the selected model if needed
        if (!analysis.selectedModel.isLoaded) {
          console.log(`   🔄 Loading model: ${analysis.selectedModel.name}...`)
          await this.modelManager.loadModel(analysis.selectedModel.id)
          this.demoMetrics.modelsLoaded++
        }

        // Display results
        console.log(`   ✅ Selected: ${analysis.selectedModel.name}`)
        console.log(`   🎯 Confidence: ${(analysis.confidence * 100).toFixed(1)}%`)
        console.log(`   ⏱️  Selection time: ${selectionTime}ms`)
        console.log(
          `   📊 Expected accuracy: ${(analysis.expectedOutcome.accuracy * 100).toFixed(1)}%`
        )
        console.log(`   ⚡ Expected latency: ${analysis.expectedOutcome.latency.toFixed(0)}ms`)

        // Show top reasoning
        if (analysis.reasoning.length > 0) {
          const topReason = analysis.reasoning[0]
          console.log(
            `   💭 Main factor: ${topReason.factor} (${(topReason.score * 100).toFixed(1)}%)`
          )
        }

        // Show risks if any
        if (analysis.risks.length > 0) {
          console.log(`   ⚠️  Risks: ${analysis.risks.slice(0, 2).join(', ')}`)
        }

        // Update metrics
        this.demoMetrics.selectionsCount++
        this.demoMetrics.avgSelectionTime = (this.demoMetrics.avgSelectionTime + selectionTime) / 2
        this.demoMetrics.successfulSelections++
      } catch (error) {
        console.error(`   ❌ Selection failed: ${error}`)
      }
    }
  }

  /**
   * Run strategy comparison demo
   */
  public async runStrategyComparison(): Promise<void> {
    console.log('\n⚔️ Running Strategy Comparison Demo...\n')

    const testCriteria: ModelSelectionCriteria = {
      detectedLanguage: 'uk',
      confidence: 0.8,
      mixedLanguages: ['uk', 'en'],
      accuracyPriority: 0.7,
      latencyPriority: 0.5,
      audioQuality: 'good'
    }

    const testContext: SelectionContext = {
      sessionLanguages: ['uk', 'en'],
      primaryLanguage: 'uk',
      recentPerformance: {},
      userFeedback: {},
      audioQuality: 'good',
      backgroundNoise: 'low',
      speakerCharacteristics: 'single',
      availableMemory: 8192,
      cpuUsage: 0.4,
      networkQuality: 'good',
      realTimeRequired: false,
      domain: 'general',
      terminology: 'mixed',
      expectedLength: 'medium'
    }

    const strategies = this.strategyService.getAvailableStrategies()
    const availableModels = this.modelManager.getAvailableModels()

    console.log('📊 Comparison Scenario:')
    console.log(`   Language: Ukrainian + English mixed`)
    console.log(`   Audio Quality: Good`)
    console.log(`   Domain: General\n`)

    for (const strategy of strategies) {
      if (!strategy.enabled) continue

      console.log(`🎯 Testing Strategy: ${strategy.name}`)

      // Switch to this strategy
      this.strategyService.switchStrategy(strategy.id)
      this.demoMetrics.strategySwitches++

      const startTime = Date.now()

      try {
        const analysis = await this.strategyService.selectModel(
          availableModels,
          testCriteria,
          testContext
        )

        const selectionTime = Date.now() - startTime

        console.log(`   Model: ${analysis.selectedModel.name}`)
        console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`)
        console.log(
          `   Expected Accuracy: ${(analysis.expectedOutcome.accuracy * 100).toFixed(1)}%`
        )
        console.log(`   Expected Latency: ${analysis.expectedOutcome.latency.toFixed(0)}ms`)
        console.log(`   Selection Time: ${selectionTime}ms`)

        // Show key reasoning
        const keyReasons = analysis.reasoning
          .sort((a, b) => b.weight * b.score - a.weight * a.score)
          .slice(0, 2)

        console.log(
          `   Key Factors: ${keyReasons.map(r => `${r.factor} (${(r.score * 100).toFixed(0)}%)`).join(', ')}`
        )
      } catch (error) {
        console.error(`   ❌ Strategy failed: ${error}`)
      }

      console.log('')
    }
  }

  /**
   * Run adaptive learning demo
   */
  public async runAdaptiveLearning(): Promise<void> {
    console.log('\n🧠 Running Adaptive Learning Demo...\n')
    console.log('Simulating model performance feedback over time...\n')

    // Switch to adaptive strategy
    this.strategyService.switchStrategy('balanced')

    const availableModels = this.modelManager.getAvailableModels()
    const scenarios = [
      {language: 'uk', accuracy: 0.92, latency: 1800},
      {language: 'en', accuracy: 0.95, latency: 1600},
      {language: 'uk', accuracy: 0.88, latency: 2200}, // Performance drop
      {language: 'uk', accuracy: 0.9, latency: 2000},
      {language: 'en', accuracy: 0.94, latency: 1700}
    ]

    for (const [index, scenario] of scenarios.entries()) {
      console.log(`📊 Round ${index + 1}: ${scenario.language.toUpperCase()} transcription`)

      // Select model
      const criteria: ModelSelectionCriteria = {
        detectedLanguage: scenario.language,
        confidence: 0.85,
        accuracyPriority: 0.7,
        latencyPriority: 0.3
      }

      const analysis = await this.strategyService.selectModel(availableModels, criteria)
      console.log(`   Selected: ${analysis.selectedModel.name}`)

      // Simulate performance feedback
      const performanceMetrics = {
        accuracy: scenario.accuracy,
        latency: scenario.latency,
        memoryEfficiency: 0.8,
        cpuUsage: 0.5,
        loadingTime: 2000,
        languageAccuracy: {[scenario.language]: scenario.accuracy},
        mixedLanguagePerformance: 0.8,
        recentPerformance: {
          accuracy: [scenario.accuracy],
          latency: [scenario.latency],
          timestamps: [Date.now()]
        }
      }

      // Update model performance
      this.strategyService.updateModelPerformance(analysis.selectedModel.id, performanceMetrics)
      this.modelManager.updateModelPerformance(analysis.selectedModel.id, performanceMetrics)

      console.log(`   Actual Accuracy: ${(scenario.accuracy * 100).toFixed(1)}%`)
      console.log(`   Actual Latency: ${scenario.latency.toFixed(0)}ms`)

      // Check for performance drops
      if (scenario.accuracy < 0.9) {
        console.log(`   ⚠️  Performance below threshold - adaptive learning triggered`)
      }

      console.log('')
    }

    // Show strategy performance
    const strategyPerf = this.strategyService.getStrategyPerformance()
    console.log('📈 Strategy Performance Summary:')
    console.log(`   Total Selections: ${strategyPerf.totalSelections}`)
    console.log(`   Average Accuracy: ${(strategyPerf.averageAccuracy * 100).toFixed(1)}%`)
    console.log(`   Average Latency: ${strategyPerf.averageLatency.toFixed(0)}ms`)
    console.log(`   Success Rate: ${(strategyPerf.successRate * 100).toFixed(1)}%`)
    console.log(`   Recent Trend: ${strategyPerf.recentTrend}`)

    if (strategyPerf.recommendations.length > 0) {
      console.log(`   Recommendations: ${strategyPerf.recommendations.slice(0, 2).join(', ')}`)
    }
  }

  /**
   * Run resource management demo
   */
  public async runResourceManagement(): Promise<void> {
    console.log('\n🗂️ Running Resource Management Demo...\n')

    // Load multiple models to demonstrate memory management
    const availableModels = this.modelManager.getAvailableModels()
    const modelsToLoad = availableModels.slice(0, 3) // Try to load first 3 models

    console.log('Loading multiple models to test memory management...\n')

    for (const model of modelsToLoad) {
      try {
        console.log(`🔄 Loading: ${model.name} (${model.memoryUsage || 0}MB)`)
        await this.modelManager.loadModel(model.id)

        // Show current system stats
        const stats = this.modelManager.getSystemStatistics()
        console.log(`   Memory Usage: ${stats.memoryUsage}MB / 8192MB available`)
        console.log(`   Loaded Models: ${stats.loadedModels}`)
      } catch (error) {
        console.log(`   ❌ Loading failed: ${error}`)
      }

      console.log('')
    }

    // Show final system statistics
    const finalStats = this.modelManager.getSystemStatistics()
    console.log('📊 Final System Statistics:')
    console.log(`   Total Memory Usage: ${finalStats.memoryUsage}MB`)
    console.log(`   Loaded Models: ${finalStats.loadedModels}/${finalStats.availableModels}`)
    console.log(
      `   Performance Tracking: ${finalStats.performanceTracking ? 'Enabled' : 'Disabled'}`
    )

    if (finalStats.recentActivity.length > 0) {
      console.log('\n   Recent Model Activity:')
      finalStats.recentActivity.slice(0, 3).forEach((activity, index) => {
        const timeAgo = Math.floor((Date.now() - activity.lastUsed) / 1000)
        console.log(`     ${index + 1}. ${activity.modelId} (${timeAgo}s ago)`)
      })
    }
  }

  /**
   * Run Ukrainian-specific optimization demo
   */
  public async runUkrainianOptimization(): Promise<void> {
    console.log('\n🇺🇦 Running Ukrainian Optimization Demo...\n')

    // Test different Ukrainian scenarios
    const ukrainianScenarios = [
      {
        name: 'Standard Ukrainian',
        criteria: {
          detectedLanguage: 'uk',
          confidence: 0.95,
          domain: 'general'
        },
        context: {audioQuality: 'good' as const, domain: 'general' as const}
      },
      {
        name: 'Business Ukrainian with English terms',
        criteria: {
          detectedLanguage: 'uk',
          confidence: 0.8,
          mixedLanguages: ['uk', 'en'],
          domain: 'business'
        },
        context: {
          audioQuality: 'fair' as const,
          domain: 'business' as const,
          terminology: 'complex' as const
        }
      },
      {
        name: 'Technical Ukrainian with transliteration',
        criteria: {
          detectedLanguage: 'uk',
          confidence: 0.7,
          domain: 'technical'
        },
        context: {
          audioQuality: 'fair' as const,
          domain: 'technical' as const,
          terminology: 'complex' as const
        }
      }
    ]

    // Switch to Ukrainian-optimized strategy
    const strategies = this.strategyService.getAvailableStrategies()
    const ukrainianStrategy = strategies.find(s => s.id === 'ukrainian_optimized')

    if (ukrainianStrategy) {
      this.strategyService.switchStrategy(ukrainianStrategy.id)
      console.log(`🎯 Using strategy: ${ukrainianStrategy.name}\n`)
    }

    const availableModels = this.modelManager.getAvailableModels()

    for (const scenario of ukrainianScenarios) {
      console.log(`📝 Scenario: ${scenario.name}`)

      // Build full context
      const fullContext: SelectionContext = {
        sessionLanguages: [
          scenario.criteria.detectedLanguage,
          ...(scenario.criteria.mixedLanguages || [])
        ],
        primaryLanguage: scenario.criteria.detectedLanguage,
        recentPerformance: {},
        userFeedback: {},
        audioQuality: scenario.context.audioQuality,
        backgroundNoise: 'low',
        speakerCharacteristics: 'single',
        availableMemory: 8192,
        cpuUsage: 0.4,
        networkQuality: 'good',
        realTimeRequired: false,
        domain: scenario.context.domain,
        terminology: scenario.context.terminology || 'mixed',
        expectedLength: 'medium'
      }

      try {
        const analysis = await this.strategyService.selectModel(
          availableModels,
          scenario.criteria,
          fullContext
        )

        console.log(`   ✅ Selected: ${analysis.selectedModel.name}`)
        console.log(`   🎯 Confidence: ${(analysis.confidence * 100).toFixed(1)}%`)

        // Check for Ukrainian-specific features
        const model = analysis.selectedModel
        const ukrainianFeatures = []

        if (model.language === 'uk') {
          ukrainianFeatures.push('Native Ukrainian')
        }
        if (model.configuration.ukrainianDialect) {
          ukrainianFeatures.push(`${model.configuration.ukrainianDialect} dialect`)
        }
        if (model.configuration.cyrillicNormalization) {
          ukrainianFeatures.push('Cyrillic normalization')
        }
        if (model.configuration.transliterationSupport) {
          ukrainianFeatures.push('Transliteration support')
        }
        if (model.configuration.languageSwitchingEnabled) {
          ukrainianFeatures.push('Mixed language support')
        }

        if (ukrainianFeatures.length > 0) {
          console.log(`   🇺🇦 Ukrainian features: ${ukrainianFeatures.join(', ')}`)
        }

        // Show Ukrainian-specific performance
        if (model.performance.languageAccuracy.uk) {
          console.log(
            `   📊 Ukrainian accuracy: ${(model.performance.languageAccuracy.uk * 100).toFixed(1)}%`
          )
        }

        if (model.performance.mixedLanguagePerformance && scenario.criteria.mixedLanguages) {
          console.log(
            `   🔄 Mixed language performance: ${(model.performance.mixedLanguagePerformance * 100).toFixed(1)}%`
          )
        }
      } catch (error) {
        console.error(`   ❌ Selection failed: ${error}`)
      }

      console.log('')
    }
  }

  /**
   * Display demo summary
   */
  private displayDemoSummary(): void {
    console.log('\n' + '='.repeat(60))
    console.log('📊 Demo Summary')
    console.log('='.repeat(60))

    console.log(`Total Model Selections: ${this.demoMetrics.selectionsCount}`)
    console.log(`Successful Selections: ${this.demoMetrics.successfulSelections}`)
    console.log(`Average Selection Time: ${this.demoMetrics.avgSelectionTime.toFixed(1)}ms`)
    console.log(`Strategy Switches: ${this.demoMetrics.strategySwitches}`)
    console.log(`Models Loaded: ${this.demoMetrics.modelsLoaded}`)

    const successRate =
      this.demoMetrics.selectionsCount > 0
        ? (
            (this.demoMetrics.successfulSelections / this.demoMetrics.selectionsCount) *
            100
          ).toFixed(1)
        : '0'
    console.log(`Success Rate: ${successRate}%`)

    // System statistics
    const stats = this.modelManager.getSystemStatistics()
    console.log(`\nSystem Statistics:`)
    console.log(`  Memory Usage: ${stats.memoryUsage}MB`)
    console.log(`  Loaded Models: ${stats.loadedModels}/${stats.availableModels}`)
    console.log(`  Performance Tracking: ${stats.performanceTracking ? 'Enabled' : 'Disabled'}`)
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.modelManager.on('model:loaded', data => {
      console.log(`✅ Model loaded: ${data.model.name} (${data.loadTime}ms)`)
    })

    this.modelManager.on('model:unloaded', data => {
      console.log(`🗑️ Model unloaded: ${data.model.name}`)
    })

    this.strategyService.on('strategy:switched', data => {
      console.log(`🔄 Strategy switched: ${data.from} → ${data.to}`)
    })

    this.strategyService.on('adaptive:performance_drop', data => {
      console.log(
        `⚠️ Performance drop detected for ${data.modelId}: ${(data.averageAccuracy * 100).toFixed(1)}%`
      )
    })

    this.strategyService.on('strategy:adapted', data => {
      console.log(`🧠 Strategy adapted: ${data.strategyId} (${data.reason})`)
    })
  }

  /**
   * Cleanup demo resources
   */
  public async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up demo resources...')

    await this.modelManager.cleanup()
    this.strategyService.cleanup()

    console.log('✅ Demo cleanup completed\n')
  }

  /**
   * Run complete demo suite
   */
  public async runCompleteDemo(): Promise<void> {
    try {
      await this.initialize()

      console.log('🚀 Starting complete Language Model Manager Demo...')
      console.log('='.repeat(60))

      await this.runBasicSelection()
      await new Promise(resolve => setTimeout(resolve, 1000))

      await this.runStrategyComparison()
      await new Promise(resolve => setTimeout(resolve, 1000))

      await this.runAdaptiveLearning()
      await new Promise(resolve => setTimeout(resolve, 1000))

      await this.runResourceManagement()
      await new Promise(resolve => setTimeout(resolve, 1000))

      await this.runUkrainianOptimization()

      this.displayDemoSummary()
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
  console.log('🎬 Starting Quick Language Model Manager Demo...\n')

  const demo = new LanguageModelManagerDemo(true) // Ukrainian optimized

  try {
    await demo.initialize()
    await demo.runBasicSelection()
    console.log('\n✅ Quick demo completed successfully!')
  } catch (error) {
    console.error('❌ Quick demo failed:', error)
  } finally {
    await demo.cleanup()
  }
}

// Export main demo class
export default LanguageModelManagerDemo

// Self-executing demo when run directly
if (require.main === module) {
  const demo = new LanguageModelManagerDemo()
  demo.runCompleteDemo().catch(console.error)
}
