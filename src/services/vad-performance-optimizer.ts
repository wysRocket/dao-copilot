/**
 * VAD Performance Optimizer
 * 
 * Provides utilities to optimize Voice Activity Detection performance and sensitivity
 * for different acoustic environments and use cases.
 * 
 * Features:
 * - Automatic threshold calibration
 * - Performance benchmarking
 * - Environment-specific optimization
 * - Real-time sensitivity adjustment
 */

import {EventEmitter} from 'events'
import {VADManager, VADConfig, VADEvent, VADMetrics} from './voice-activity-detector'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

export interface OptimizationProfile {
  name: string
  environment: 'quiet' | 'normal' | 'noisy' | 'very_noisy'
  config: Partial<VADConfig>
  expectedPerformance: {
    maxLatency: number // ms
    minAccuracy: number // 0.0 to 1.0
    falsePositiveRate: number // 0.0 to 1.0
    falseNegativeRate: number // 0.0 to 1.0
  }
}

export interface PerformanceMetrics {
  averageLatency: number
  maxLatency: number
  minLatency: number
  accuracy: number
  falsePositiveRate: number
  falseNegativeRate: number
  throughput: number // chunks per second
  cpuUsage: number // percentage estimate
  memoryUsage: number // MB estimate
}

export interface OptimizationResult {
  profile: OptimizationProfile
  originalConfig: VADConfig
  optimizedConfig: VADConfig
  performanceImprovement: {
    latencyReduction: number // percentage
    accuracyImprovement: number // percentage
    throughputIncrease: number // percentage
  }
  recommendations: string[]
}

export interface CalibrationSession {
  sessionId: string
  startTime: number
  environment: string
  testSamples: TestSample[]
  currentConfig: VADConfig
  metrics: PerformanceMetrics
  isActive: boolean
}

export interface TestSample {
  audioData: Float32Array
  timestamp: number
  expectedResult: 'speech' | 'silence'
  vadResult?: VADEvent
  isCorrect?: boolean
  latency?: number
}

/**
 * VAD Performance Optimizer
 * Provides intelligent optimization of VAD parameters for different environments
 */
export class VADPerformanceOptimizer extends EventEmitter {
  private vadManager: VADManager
  private optimizationProfiles: Map<string, OptimizationProfile>
  private currentCalibration: CalibrationSession | null = null
  private performanceHistory: PerformanceMetrics[] = []
  private isOptimizing = false

  // Performance monitoring
  private latencyMeasurements: number[] = []
  private accuracyMeasurements: number[] = []
  private startTime: number = 0
  private processedSamples = 0

  constructor(vadManager: VADManager) {
    super()
    this.vadManager = vadManager
    this.optimizationProfiles = new Map()
    
    this.initializeDefaultProfiles()
    
    logger.info('VADPerformanceOptimizer initialized')
  }

  /**
   * Initialize default optimization profiles for different environments
   */
  private initializeDefaultProfiles(): void {
    // Quiet environment (office, studio)
    this.optimizationProfiles.set('quiet', {
      name: 'Quiet Environment',
      environment: 'quiet',
      config: {
        threshold: 0.2, // Lower threshold for quiet environments
        minSpeechDuration: 200, // Faster response
        maxSilenceDuration: 1500,
        windowSize: 20, // Smaller window for faster processing
        hopLength: 8,
        enableBatchProcessing: true,
        batchSize: 8, // Smaller batches
        maxProcessingDelay: 30
      },
      expectedPerformance: {
        maxLatency: 50,
        minAccuracy: 0.95,
        falsePositiveRate: 0.02,
        falseNegativeRate: 0.03
      }
    })

    // Normal environment (home, small office)
    this.optimizationProfiles.set('normal', {
      name: 'Normal Environment',
      environment: 'normal',
      config: {
        threshold: 0.3, // Standard threshold
        minSpeechDuration: 300,
        maxSilenceDuration: 2000,
        windowSize: 25,
        hopLength: 10,
        enableBatchProcessing: true,
        batchSize: 10,
        maxProcessingDelay: 50
      },
      expectedPerformance: {
        maxLatency: 80,
        minAccuracy: 0.90,
        falsePositiveRate: 0.05,
        falseNegativeRate: 0.05
      }
    })

    // Noisy environment (open office, cafe)
    this.optimizationProfiles.set('noisy', {
      name: 'Noisy Environment',
      environment: 'noisy',
      config: {
        threshold: 0.45, // Higher threshold to avoid false positives
        minSpeechDuration: 400,
        maxSilenceDuration: 2500,
        windowSize: 30, // Larger window for better noise resilience
        hopLength: 12,
        enableBatchProcessing: true,
        batchSize: 12,
        maxProcessingDelay: 70,
        interruptionThreshold: 0.7 // Higher threshold for interruptions
      },
      expectedPerformance: {
        maxLatency: 120,
        minAccuracy: 0.85,
        falsePositiveRate: 0.08,
        falseNegativeRate: 0.07
      }
    })

    // Very noisy environment (street, construction)
    this.optimizationProfiles.set('very_noisy', {
      name: 'Very Noisy Environment',
      environment: 'very_noisy',
      config: {
        threshold: 0.6, // Very high threshold
        minSpeechDuration: 500, // Longer confirmation time
        maxSilenceDuration: 3000,
        windowSize: 40, // Larger analysis window
        hopLength: 15,
        enableBatchProcessing: true,
        batchSize: 15,
        maxProcessingDelay: 100,
        interruptionThreshold: 0.8,
        gracePeriodMs: 800 // Longer grace period
      },
      expectedPerformance: {
        maxLatency: 150,
        minAccuracy: 0.80,
        falsePositiveRate: 0.10,
        falseNegativeRate: 0.10
      }
    })

    logger.debug('Initialized default optimization profiles', {
      profileCount: this.optimizationProfiles.size
    })
  }

  /**
   * Start automatic optimization for a specific environment
   */
  async optimizeForEnvironment(
    environmentType: 'quiet' | 'normal' | 'noisy' | 'very_noisy',
    testDurationMs: number = 30000
  ): Promise<OptimizationResult> {
    if (this.isOptimizing) {
      throw new Error('Optimization already in progress')
    }

    this.isOptimizing = true
    this.startTime = Date.now()
    this.processedSamples = 0
    this.latencyMeasurements = []
    this.accuracyMeasurements = []

    try {
      logger.info('Starting VAD optimization', {
        environment: environmentType,
        duration: testDurationMs
      })

      const profile = this.optimizationProfiles.get(environmentType)
      if (!profile) {
        throw new Error(`Unknown environment type: ${environmentType}`)
      }

      // Get original configuration
      const originalConfig = {...this.vadManager.getState()}
      const originalMetrics = await this.measurePerformance(5000) // 5 second baseline

      // Apply profile configuration
      this.vadManager.updateConfig(profile.config)
      await this.waitForStabilization(2000) // 2 second stabilization

      // Measure optimized performance
      const optimizedMetrics = await this.measurePerformance(testDurationMs)

      // Calculate improvement
      const performanceImprovement = {
        latencyReduction: ((originalMetrics.averageLatency - optimizedMetrics.averageLatency) / originalMetrics.averageLatency) * 100,
        accuracyImprovement: ((optimizedMetrics.accuracy - originalMetrics.accuracy) / originalMetrics.accuracy) * 100,
        throughputIncrease: ((optimizedMetrics.throughput - originalMetrics.throughput) / originalMetrics.throughput) * 100
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(profile, optimizedMetrics)

      const result: OptimizationResult = {
        profile,
        originalConfig: originalConfig as VADConfig,
        optimizedConfig: profile.config as VADConfig,
        performanceImprovement,
        recommendations
      }

      logger.info('VAD optimization completed', {
        environment: environmentType,
        latencyReduction: performanceImprovement.latencyReduction.toFixed(2),
        accuracyImprovement: performanceImprovement.accuracyImprovement.toFixed(2),
        throughputIncrease: performanceImprovement.throughputIncrease.toFixed(2)
      })

      this.emit('optimization_completed', result)
      return result

    } catch (error) {
      logger.error('VAD optimization failed', {
        environment: environmentType,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    } finally {
      this.isOptimizing = false
    }
  }

  /**
   * Start real-time calibration session
   */
  async startCalibration(environment: string): Promise<string> {
    if (this.currentCalibration?.isActive) {
      throw new Error('Calibration session already active')
    }

    const sessionId = `cal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    this.currentCalibration = {
      sessionId,
      startTime: Date.now(),
      environment,
      testSamples: [],
      currentConfig: {...this.vadManager.getState()} as VADConfig,
      metrics: {
        averageLatency: 0,
        maxLatency: 0,
        minLatency: Infinity,
        accuracy: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        throughput: 0,
        cpuUsage: 0,
        memoryUsage: 0
      },
      isActive: true
    }

    logger.info('Started VAD calibration session', {
      sessionId,
      environment
    })

    this.emit('calibration_started', {
      sessionId,
      environment
    })

    return sessionId
  }

  /**
   * Add test sample to calibration
   */
  addCalibrationSample(
    audioData: Float32Array, 
    expectedResult: 'speech' | 'silence'
  ): void {
    if (!this.currentCalibration?.isActive) {
      throw new Error('No active calibration session')
    }

    const timestamp = Date.now()
    const startTime = performance.now()

    // Process through VAD
    const vadResult = this.vadManager.processAudioChunk(audioData, timestamp)
    const latency = performance.now() - startTime

    // Determine if VAD result is correct
    const isCorrect = this.evaluateVADResult(vadResult, expectedResult)

    const testSample: TestSample = {
      audioData,
      timestamp,
      expectedResult,
      vadResult: vadResult || undefined,
      isCorrect,
      latency
    }

    this.currentCalibration.testSamples.push(testSample)
    
    // Update metrics in real-time
    this.updateCalibrationMetrics(testSample)

    this.emit('calibration_sample_added', {
      sessionId: this.currentCalibration.sessionId,
      sampleCount: this.currentCalibration.testSamples.length,
      isCorrect,
      latency
    })
  }

  /**
   * Complete calibration and get optimized configuration
   */
  async completeCalibration(): Promise<{
    sessionId: string
    optimizedConfig: Partial<VADConfig>
    metrics: PerformanceMetrics
    recommendations: string[]
  }> {
    if (!this.currentCalibration?.isActive) {
      throw new Error('No active calibration session')
    }

    const session = this.currentCalibration
    session.isActive = false

    // Analyze calibration data and generate optimized configuration
    const optimizedConfig = this.analyzeCalibrationData(session)
    const recommendations = this.generateCalibrationRecommendations(session, optimizedConfig)

    logger.info('Completed VAD calibration', {
      sessionId: session.sessionId,
      sampleCount: session.testSamples.length,
      accuracy: session.metrics.accuracy,
      averageLatency: session.metrics.averageLatency
    })

    const result = {
      sessionId: session.sessionId,
      optimizedConfig,
      metrics: session.metrics,
      recommendations
    }

    this.emit('calibration_completed', result)
    this.currentCalibration = null

    return result
  }

  /**
   * Measure VAD performance over a specific duration
   */
  private async measurePerformance(durationMs: number): Promise<PerformanceMetrics> {
    return new Promise((resolve) => {
      const measurements = {
        latencies: [] as number[],
        accuracyResults: [] as boolean[],
        startTime: Date.now(),
        sampleCount: 0
      }

      const measurementHandler = (event: VADEvent) => {
        const latency = Date.now() - event.timestamp
        measurements.latencies.push(latency)
        measurements.sampleCount++
      }

      // Listen to VAD events for measurements
      this.vadManager.on('speech_start', measurementHandler)
      this.vadManager.on('speech_end', measurementHandler)
      this.vadManager.on('silence_detected', measurementHandler)

      setTimeout(() => {
        // Remove event listeners
        this.vadManager.off('speech_start', measurementHandler)
        this.vadManager.off('speech_end', measurementHandler)
        this.vadManager.off('silence_detected', measurementHandler)

        // Calculate metrics
        const latencies = measurements.latencies
        const duration = Date.now() - measurements.startTime

        const metrics: PerformanceMetrics = {
          averageLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
          maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
          minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
          accuracy: 0.85, // Placeholder - would need ground truth data
          falsePositiveRate: 0.05, // Placeholder
          falseNegativeRate: 0.10, // Placeholder
          throughput: (measurements.sampleCount / duration) * 1000, // samples per second
          cpuUsage: this.estimateCPUUsage(latencies),
          memoryUsage: this.estimateMemoryUsage()
        }

        resolve(metrics)
      }, durationMs)
    })
  }

  /**
   * Wait for VAD system to stabilize after configuration change
   */
  private async waitForStabilization(durationMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, durationMs))
  }

  /**
   * Evaluate if VAD result matches expected result
   */
  private evaluateVADResult(vadResult: VADEvent | null, expected: 'speech' | 'silence'): boolean {
    if (!vadResult) {
      return expected === 'silence'
    }

    switch (vadResult.type) {
      case 'speech_start':
      case 'interruption_detected':
        return expected === 'speech'
      case 'speech_end':
      case 'silence_detected':
        return expected === 'silence'
      default:
        return false
    }
  }

  /**
   * Update calibration metrics with new sample
   */
  private updateCalibrationMetrics(sample: TestSample): void {
    if (!this.currentCalibration) return

    const session = this.currentCalibration
    const samples = session.testSamples

    // Update latency metrics
    if (sample.latency !== undefined) {
      const latencies = samples.map(s => s.latency).filter(l => l !== undefined) as number[]
      session.metrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
      session.metrics.maxLatency = Math.max(...latencies)
      session.metrics.minLatency = Math.min(...latencies)
    }

    // Update accuracy metrics
    const correctSamples = samples.filter(s => s.isCorrect).length
    const totalSamples = samples.length
    session.metrics.accuracy = totalSamples > 0 ? correctSamples / totalSamples : 0

    // Calculate false positive/negative rates
    const speechSamples = samples.filter(s => s.expectedResult === 'speech')
    const silenceSamples = samples.filter(s => s.expectedResult === 'silence')
    
    if (speechSamples.length > 0) {
      const missedSpeech = speechSamples.filter(s => !s.isCorrect).length
      session.metrics.falseNegativeRate = missedSpeech / speechSamples.length
    }

    if (silenceSamples.length > 0) {
      const falseAlarms = silenceSamples.filter(s => !s.isCorrect).length
      session.metrics.falsePositiveRate = falseAlarms / silenceSamples.length
    }

    // Update throughput
    const duration = Date.now() - session.startTime
    session.metrics.throughput = (totalSamples / duration) * 1000 // samples per second
  }

  /**
   * Analyze calibration data and generate optimized configuration
   */
  private analyzeCalibrationData(session: CalibrationSession): Partial<VADConfig> {
    const samples = session.testSamples
    const metrics = session.metrics

    const optimizedConfig: Partial<VADConfig> = {}

    // Adjust threshold based on accuracy
    if (metrics.falsePositiveRate > 0.1) {
      // Too many false positives - increase threshold
      optimizedConfig.threshold = Math.min((session.currentConfig.threshold || 0.3) * 1.2, 0.8)
    } else if (metrics.falseNegativeRate > 0.1) {
      // Too many false negatives - decrease threshold
      optimizedConfig.threshold = Math.max((session.currentConfig.threshold || 0.3) * 0.8, 0.1)
    }

    // Adjust timing based on latency
    if (metrics.averageLatency > 100) {
      // High latency - optimize for speed
      optimizedConfig.windowSize = Math.max((session.currentConfig.windowSize || 25) * 0.8, 15)
      optimizedConfig.hopLength = Math.max((session.currentConfig.hopLength || 10) * 0.8, 5)
      optimizedConfig.batchSize = Math.max((session.currentConfig.batchSize || 10) - 2, 5)
    }

    // Adjust batch processing based on throughput
    if (metrics.throughput < 50) { // Less than 50 samples per second
      optimizedConfig.enableBatchProcessing = false
    } else {
      optimizedConfig.enableBatchProcessing = true
      optimizedConfig.batchSize = Math.min((session.currentConfig.batchSize || 10) + 2, 20)
    }

    return optimizedConfig
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    profile: OptimizationProfile, 
    metrics: PerformanceMetrics
  ): string[] {
    const recommendations: string[] = []

    // Latency recommendations
    if (metrics.averageLatency > profile.expectedPerformance.maxLatency) {
      recommendations.push(`Consider reducing window size or batch size to improve latency (current: ${metrics.averageLatency.toFixed(1)}ms, target: ${profile.expectedPerformance.maxLatency}ms)`)
    }

    // Accuracy recommendations
    if (metrics.accuracy < profile.expectedPerformance.minAccuracy) {
      recommendations.push(`Accuracy below target (current: ${(metrics.accuracy * 100).toFixed(1)}%, target: ${(profile.expectedPerformance.minAccuracy * 100).toFixed(1)}%)`)
    }

    // Performance recommendations
    if (metrics.cpuUsage > 50) {
      recommendations.push(`High CPU usage detected (${metrics.cpuUsage.toFixed(1)}%) - consider enabling batch processing or increasing processing delays`)
    }

    if (metrics.throughput < 100) {
      recommendations.push(`Low throughput detected (${metrics.throughput.toFixed(1)} samples/sec) - consider optimizing processing pipeline`)
    }

    // Environment-specific recommendations
    switch (profile.environment) {
      case 'quiet':
        recommendations.push('In quiet environments, consider lowering threshold for better sensitivity')
        break
      case 'noisy':
        recommendations.push('In noisy environments, consider increasing minimum speech duration to reduce false positives')
        break
      case 'very_noisy':
        recommendations.push('In very noisy environments, consider implementing additional noise filtering')
        break
    }

    return recommendations
  }

  /**
   * Generate calibration-based recommendations
   */
  private generateCalibrationRecommendations(
    session: CalibrationSession,
    optimizedConfig: Partial<VADConfig>
  ): string[] {
    const recommendations: string[] = []
    const metrics = session.metrics

    if (metrics.falsePositiveRate > 0.1) {
      recommendations.push('High false positive rate detected - consider increasing threshold or minimum speech duration')
    }

    if (metrics.falseNegativeRate > 0.1) {
      recommendations.push('High false negative rate detected - consider decreasing threshold or improving audio preprocessing')
    }

    if (metrics.averageLatency > 80) {
      recommendations.push('High average latency - consider optimizing processing pipeline or reducing analysis window size')
    }

    if (session.testSamples.length < 50) {
      recommendations.push('Limited test samples - consider running longer calibration sessions for more accurate results')
    }

    return recommendations
  }

  /**
   * Estimate CPU usage based on latency measurements
   */
  private estimateCPUUsage(latencies: number[]): number {
    if (latencies.length === 0) return 0

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
    // Simple estimation: higher latency generally indicates higher CPU usage
    // This is a rough approximation and would be more accurate with actual CPU monitoring
    return Math.min((avgLatency / 100) * 30, 100) // Scale latency to estimated CPU percentage
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Simple estimation based on buffer sizes and processing complexity
    // In a real implementation, this would monitor actual memory usage
    return 15 + Math.random() * 10 // Estimated 15-25 MB base usage
  }

  /**
   * Get available optimization profiles
   */
  getOptimizationProfiles(): OptimizationProfile[] {
    return Array.from(this.optimizationProfiles.values())
  }

  /**
   * Get current calibration session info
   */
  getCurrentCalibration(): CalibrationSession | null {
    return this.currentCalibration
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(): PerformanceMetrics[] {
    return [...this.performanceHistory]
  }

  /**
   * Apply optimization profile
   */
  applyOptimizationProfile(profileName: string): boolean {
    const profile = this.optimizationProfiles.get(profileName)
    if (!profile) {
      logger.warn('Unknown optimization profile', { profileName })
      return false
    }

    this.vadManager.updateConfig(profile.config)
    
    logger.info('Applied optimization profile', {
      profileName: profile.name,
      environment: profile.environment
    })

    this.emit('profile_applied', {
      profileName,
      config: profile.config
    })

    return true
  }

  /**
   * Create custom optimization profile
   */
  createCustomProfile(
    name: string,
    environment: 'quiet' | 'normal' | 'noisy' | 'very_noisy',
    config: Partial<VADConfig>,
    expectedPerformance: OptimizationProfile['expectedPerformance']
  ): void {
    const profile: OptimizationProfile = {
      name,
      environment,
      config,
      expectedPerformance
    }

    this.optimizationProfiles.set(name, profile)
    
    logger.info('Created custom optimization profile', { name, environment })
    
    this.emit('profile_created', { name, profile })
  }

  /**
   * Export optimization results
   */
  exportOptimizationData(): {
    profiles: OptimizationProfile[]
    performanceHistory: PerformanceMetrics[]
    currentConfig: VADConfig | null
  } {
    return {
      profiles: this.getOptimizationProfiles(),
      performanceHistory: this.getPerformanceHistory(),
      currentConfig: this.vadManager.getState() as VADConfig | null
    }
  }
}

export default VADPerformanceOptimizer