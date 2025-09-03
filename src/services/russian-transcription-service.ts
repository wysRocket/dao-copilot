/**
 * Russian Transcription Service - Enhanced Integration
 *
 * This service integrates all enhanced Russian transcription components:
 * - RussianAudioPreprocessor (with clarity enhancement and phoneme optimization)
 * - MixedLanguageDetector (for mixed Russian-English segments)
 * - GrammarPatternCorrector (for grammar pattern fixes)
 * - RussianTranscriptionCorrector (comprehensive text corrections)
 *
 * Provides a unified, production-ready transcription pipeline optimized for Russian speech.
 */

import {Buffer} from 'buffer'
import {
  RussianAudioPreprocessor,
  createRussianAudioPreprocessor,
  AudioMetrics
} from './russian-audio-preprocessor'
import {
  RussianTranscriptionCorrector,
  createRussianTranscriptionCorrector,
  CorrectionResult
} from './russian-transcription-corrector'
import {
  OptimizedTranscriptionService,
  OptimizedTranscriptionConfig,
  TranscriptionResult
} from './optimized-transcription-service'
import {GeminiLiveConfig} from './gemini-live-websocket'

export interface RussianTranscriptionConfig {
  // Audio preprocessing options
  audioPreprocessor?: {
    enabled: boolean
    sampleRate?: number
    channels?: number
    bitDepth?: number
    noiseReductionLevel?: number
    normalizationLevel?: number
    enableBandpassFilter?: boolean
    enableRussianPhonemeOptimization?: boolean
    enableSpeechEnhancement?: boolean
  }

  // Text correction options
  textCorrector?: {
    enabled: boolean
    enableProperNameCorrection?: boolean
    enableTechnicalTermCorrection?: boolean
    enableContextualSpelling?: boolean
    enableGrammarCorrection?: boolean
    enableCommonPatternFixes?: boolean
    confidenceThreshold?: number
  }

  // Underlying transcription service configuration
  geminiConfig: GeminiLiveConfig
  poolConfig?: OptimizedTranscriptionConfig['poolConfig']

  // Performance options
  enablePartialStreaming?: boolean
  partialUpdateInterval?: number
  enablePersistentConnections?: boolean
  enableConnectionWarmup?: boolean

  // Quality assurance options
  enableQualityValidation?: boolean
  minConfidenceThreshold?: number
  maxProcessingTimeMs?: number

  // Monitoring and debugging
  enableMetrics?: boolean
  enableDebugLogging?: boolean
}

export interface RussianTranscriptionResult {
  // Core transcription data
  requestId: string
  originalText: string
  correctedText: string
  confidence: number

  // Processing metrics
  totalProcessingTime: number
  audioProcessingTime: number
  transcriptionTime: number
  correctionTime: number

  // Audio analysis
  audioMetrics: AudioMetrics
  audioProcessingSteps: string[]

  // Text corrections
  corrections: CorrectionResult['corrections']
  correctionConfidence: number

  // Quality indicators
  qualityScore: number
  hasRussianFrequencies: boolean
  mixedLanguageDetected: boolean

  // Connection info
  connectionId?: string
  isPartial: boolean
  isFinal: boolean
}

export interface RussianTranscriptionMetrics {
  totalTranscriptions: number
  averageProcessingTime: number
  averageQualityScore: number
  averageConfidence: number

  audioProcessingMetrics: {
    averageAudioProcessingTime: number
    russianFrequenciesDetectedRate: number
    silentAudioRate: number
    processingStepsDistribution: Record<string, number>
  }

  correctionMetrics: {
    averageCorrectionTime: number
    averageCorrectionsPerText: number
    correctionTypeDistribution: Record<string, number>
    mixedLanguageDetectionRate: number
  }

  errorMetrics: {
    audioProcessingErrors: number
    transcriptionErrors: number
    correctionErrors: number
    totalErrorRate: number
  }
}

/**
 * Comprehensive Russian Transcription Service
 * Integrates enhanced audio preprocessing with comprehensive text correction
 */
export class RussianTranscriptionService {
  private config: RussianTranscriptionConfig
  private audioPreprocessor: RussianAudioPreprocessor
  private textCorrector: RussianTranscriptionCorrector
  private transcriptionService: OptimizedTranscriptionService

  private metrics: RussianTranscriptionMetrics = {
    totalTranscriptions: 0,
    averageProcessingTime: 0,
    averageQualityScore: 0,
    averageConfidence: 0,
    audioProcessingMetrics: {
      averageAudioProcessingTime: 0,
      russianFrequenciesDetectedRate: 0,
      silentAudioRate: 0,
      processingStepsDistribution: {}
    },
    correctionMetrics: {
      averageCorrectionTime: 0,
      averageCorrectionsPerText: 0,
      correctionTypeDistribution: {},
      mixedLanguageDetectionRate: 0
    },
    errorMetrics: {
      audioProcessingErrors: 0,
      transcriptionErrors: 0,
      correctionErrors: 0,
      totalErrorRate: 0
    }
  }

  private processingTimes: number[] = []
  private qualityScores: number[] = []
  private confidenceScores: number[] = []

  constructor(config: RussianTranscriptionConfig) {
    this.config = {
      // Default audio preprocessing configuration
      audioPreprocessor: {
        enabled: true,
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        noiseReductionLevel: 0.4, // Higher for Russian environments
        normalizationLevel: -3,
        enableBandpassFilter: true,
        enableRussianPhonemeOptimization: true,
        enableSpeechEnhancement: true,
        ...config.audioPreprocessor
      },

      // Default text correction configuration
      textCorrector: {
        enabled: true,
        enableProperNameCorrection: true,
        enableTechnicalTermCorrection: true,
        enableContextualSpelling: true,
        enableGrammarCorrection: true,
        enableCommonPatternFixes: true,
        confidenceThreshold: 0.7,
        ...config.textCorrector
      },

      // Default service configuration
      enablePartialStreaming: true,
      partialUpdateInterval: 50,
      enablePersistentConnections: true,
      enableConnectionWarmup: true,
      enableQualityValidation: true,
      minConfidenceThreshold: 0.6,
      maxProcessingTimeMs: 10000, // 10 seconds max
      enableMetrics: true,
      enableDebugLogging: false,

      ...config
    }

    // Initialize audio preprocessor with Russian-optimized settings
    this.audioPreprocessor = createRussianAudioPreprocessor(this.config.audioPreprocessor)

    // Initialize text corrector with enhanced pattern matching
    this.textCorrector = createRussianTranscriptionCorrector(this.config.textCorrector)

    // Initialize underlying transcription service
    const optimizedConfig: OptimizedTranscriptionConfig = {
      geminiConfig: this.config.geminiConfig,
      poolConfig: this.config.poolConfig,
      enablePartialStreaming: this.config.enablePartialStreaming,
      partialUpdateInterval: this.config.partialUpdateInterval,
      enablePersistentConnections: this.config.enablePersistentConnections,
      enableConnectionWarmup: this.config.enableConnectionWarmup
    }

    this.transcriptionService = new OptimizedTranscriptionService(optimizedConfig)

    this.setupTranscriptionServiceEvents()

    this.log('🇷🇺 Russian Transcription Service initialized with enhanced pipeline', {
      audioPreprocessingEnabled: this.config.audioPreprocessor?.enabled,
      textCorrectionEnabled: this.config.textCorrector?.enabled,
      partialStreamingEnabled: this.config.enablePartialStreaming,
      qualityValidationEnabled: this.config.enableQualityValidation
    })
  }

  /**
   * Initialize the service and all underlying components
   */
  async initialize(): Promise<void> {
    const startTime = Date.now()

    try {
      this.log('🚀 Initializing Russian Transcription Service...')

      // Initialize the underlying optimized transcription service
      await this.transcriptionService.initialize()

      this.log('✅ Russian Transcription Service initialized successfully', {
        initializationTime: Date.now() - startTime,
        components: {
          audioPreprocessor: 'Enhanced with Russian phoneme optimization',
          textCorrector: 'Enhanced with mixed language detection and grammar patterns',
          transcriptionService: 'Optimized with connection pooling'
        }
      })
    } catch (error) {
      this.log('❌ Failed to initialize Russian Transcription Service', {error})
      throw error
    }
  }

  /**
   * Main transcription method with full Russian enhancement pipeline
   */
  async transcribe(
    audioBuffer: Buffer,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<RussianTranscriptionResult> {
    const overallStartTime = Date.now()
    const requestId = `russian_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    this.log('🎯 Starting Russian transcription', {
      requestId,
      audioSize: audioBuffer.length,
      priority
    })

    try {
      // Step 1: Audio preprocessing with Russian optimizations
      let audioProcessingTime = 0
      let processedAudioBuffer = audioBuffer
      let audioMetrics: AudioMetrics
      let audioProcessingSteps: string[] = []

      if (this.config.audioPreprocessor?.enabled) {
        const audioStartTime = Date.now()

        try {
          const audioResult = await this.audioPreprocessor.process(audioBuffer)
          processedAudioBuffer = audioResult.processedAudio
          audioMetrics = audioResult.metrics
          audioProcessingSteps = audioResult.applied
          audioProcessingTime = Date.now() - audioStartTime

          this.log('🎵 Audio preprocessing completed', {
            requestId,
            processingTime: audioProcessingTime,
            stepsApplied: audioProcessingSteps.length,
            russianFrequenciesDetected: audioResult.metrics.containsRussianFrequencies
          })
        } catch (error) {
          this.metrics.errorMetrics.audioProcessingErrors++
          this.log('⚠️ Audio preprocessing failed, using original audio', {requestId, error})

          // Fallback: use original audio with basic metrics
          processedAudioBuffer = audioBuffer
          audioMetrics = {
            totalBytes: audioBuffer.length,
            nonZeroBytes: audioBuffer.length,
            maxAmplitude: 0,
            avgAmplitude: 0,
            dynamicRange: 0,
            signalToNoiseRatio: 0,
            isSilent: audioBuffer.length === 0,
            containsRussianFrequencies: false
          }
          audioProcessingSteps = ['fallback']
          audioProcessingTime = Date.now() - audioStartTime
        }
      } else {
        // Audio preprocessing disabled
        audioMetrics = {
          totalBytes: audioBuffer.length,
          nonZeroBytes: audioBuffer.length,
          maxAmplitude: 0,
          avgAmplitude: 0,
          dynamicRange: 0,
          signalToNoiseRatio: 0,
          isSilent: audioBuffer.length === 0,
          containsRussianFrequencies: false
        }
        audioProcessingSteps = ['disabled']
      }

      // Step 2: Core transcription using optimized service
      const transcriptionStartTime = Date.now()
      let transcriptionResult: TranscriptionResult

      try {
        // Convert processed audio to base64 for transcription service
        const audioData = {
          data: processedAudioBuffer.toString('base64'),
          mimeType: 'audio/pcm;rate=16000;channels=1;encoding=signed-integer;bits=16'
        }

        transcriptionResult = await this.transcriptionService.transcribeAudio(audioData, priority)

        this.log('🎤 Core transcription completed', {
          requestId,
          transcriptionId: transcriptionResult.requestId,
          textLength: transcriptionResult.text.length,
          processingTime: transcriptionResult.processingTime
        })
      } catch (error) {
        this.metrics.errorMetrics.transcriptionErrors++
        throw new Error(
          `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }

      const transcriptionTime = Date.now() - transcriptionStartTime

      // Step 3: Text correction with Russian enhancements
      let correctionTime = 0
      let correctionResult: CorrectionResult
      let mixedLanguageDetected = false

      if (this.config.textCorrector?.enabled && transcriptionResult.text.trim().length > 0) {
        const correctionStartTime = Date.now()

        try {
          correctionResult = await this.textCorrector.correct(transcriptionResult.text)
          correctionTime = Date.now() - correctionStartTime

          // Detect mixed language patterns
          mixedLanguageDetected = correctionResult.corrections.some(
            c =>
              c.reason.toLowerCase().includes('mixed language') ||
              c.reason.toLowerCase().includes('english')
          )

          this.log('📝 Text correction completed', {
            requestId,
            originalLength: transcriptionResult.text.length,
            correctedLength: correctionResult.correctedText.length,
            correctionsApplied: correctionResult.corrections.length,
            correctionTime,
            mixedLanguageDetected
          })
        } catch (error) {
          this.metrics.errorMetrics.correctionErrors++
          this.log('⚠️ Text correction failed, using original text', {requestId, error})

          // Fallback: use original transcription
          correctionResult = {
            originalText: transcriptionResult.text,
            correctedText: transcriptionResult.text,
            corrections: [],
            confidence: transcriptionResult.confidence || 0.5,
            processingTimeMs: 0
          }
          correctionTime = Date.now() - correctionStartTime
        }
      } else {
        // Text correction disabled or empty text
        correctionResult = {
          originalText: transcriptionResult.text,
          correctedText: transcriptionResult.text,
          corrections: [],
          confidence: transcriptionResult.confidence || 0.5,
          processingTimeMs: 0
        }
      }

      // Step 4: Calculate quality metrics and final result
      const totalProcessingTime = Date.now() - overallStartTime
      const qualityScore = this.calculateQualityScore(
        audioMetrics,
        transcriptionResult,
        correctionResult
      )

      const result: RussianTranscriptionResult = {
        requestId,
        originalText: transcriptionResult.text,
        correctedText: correctionResult.correctedText,
        confidence: Math.min(transcriptionResult.confidence || 0.5, correctionResult.confidence),

        // Processing metrics
        totalProcessingTime,
        audioProcessingTime,
        transcriptionTime,
        correctionTime,

        // Audio analysis
        audioMetrics,
        audioProcessingSteps,

        // Text corrections
        corrections: correctionResult.corrections,
        correctionConfidence: correctionResult.confidence,

        // Quality indicators
        qualityScore,
        hasRussianFrequencies: audioMetrics.containsRussianFrequencies,
        mixedLanguageDetected,

        // Connection info
        connectionId: transcriptionResult.connectionId,
        isPartial: transcriptionResult.isPartial,
        isFinal: transcriptionResult.isFinal
      }

      // Step 5: Quality validation
      if (this.config.enableQualityValidation) {
        this.validateResult(result)
      }

      // Step 6: Update metrics
      if (this.config.enableMetrics) {
        this.updateMetrics(result)
      }

      this.log('✅ Russian transcription completed successfully', {
        requestId,
        totalTime: totalProcessingTime,
        qualityScore,
        textLength: result.correctedText.length,
        correctionsApplied: result.corrections.length
      })

      return result
    } catch (error) {
      this.log('❌ Russian transcription failed', {requestId, error})

      // Return error result
      return {
        requestId,
        originalText: '',
        correctedText: '',
        confidence: 0,
        totalProcessingTime: Date.now() - overallStartTime,
        audioProcessingTime: 0,
        transcriptionTime: 0,
        correctionTime: 0,
        audioMetrics: {
          totalBytes: audioBuffer.length,
          nonZeroBytes: 0,
          maxAmplitude: 0,
          avgAmplitude: 0,
          dynamicRange: 0,
          signalToNoiseRatio: 0,
          isSilent: true,
          containsRussianFrequencies: false
        },
        audioProcessingSteps: ['error'],
        corrections: [],
        correctionConfidence: 0,
        qualityScore: 0,
        hasRussianFrequencies: false,
        mixedLanguageDetected: false,
        isPartial: false,
        isFinal: true
      }
    }
  }

  /**
   * Calculate comprehensive quality score for the transcription
   */
  private calculateQualityScore(
    audioMetrics: AudioMetrics,
    transcriptionResult: TranscriptionResult,
    correctionResult: CorrectionResult
  ): number {
    let qualityScore = 0
    let factorCount = 0

    // Audio quality factors (30% of score)
    if (!audioMetrics.isSilent) {
      qualityScore +=
        audioMetrics.signalToNoiseRatio > 10 ? 0.3 : (audioMetrics.signalToNoiseRatio / 10) * 0.3
      factorCount++
    }

    if (audioMetrics.containsRussianFrequencies) {
      qualityScore += 0.2 // Bonus for Russian frequency detection
      factorCount++
    }

    if (audioMetrics.dynamicRange > 1000) {
      qualityScore += 0.1 // Good dynamic range
      factorCount++
    }

    // Transcription confidence factors (40% of score)
    if (transcriptionResult.confidence) {
      qualityScore += transcriptionResult.confidence * 0.4
      factorCount++
    }

    // Text quality factors (30% of score)
    const textLength = correctionResult.correctedText.length
    if (textLength > 0) {
      // Length factor (reasonable text length)
      const lengthFactor = Math.min(1.0, textLength / 100) * 0.1
      qualityScore += lengthFactor
      factorCount++

      // Correction ratio (fewer corrections = higher quality)
      const correctionRatio = correctionResult.corrections.length / Math.max(1, textLength / 10)
      const correctionFactor = Math.max(0, 0.2 - correctionRatio * 0.05)
      qualityScore += correctionFactor
      factorCount++
    }

    // Text correction confidence (10% of score)
    qualityScore += correctionResult.confidence * 0.1
    factorCount++

    // Normalize to 0-1 range
    return factorCount > 0 ? Math.min(1.0, qualityScore) : 0
  }

  /**
   * Validate transcription result quality
   */
  private validateResult(result: RussianTranscriptionResult): void {
    const issues: string[] = []

    // Check minimum confidence threshold
    if (result.confidence < (this.config.minConfidenceThreshold || 0.6)) {
      issues.push(`Low confidence: ${result.confidence.toFixed(2)}`)
    }

    // Check processing time
    if (result.totalProcessingTime > (this.config.maxProcessingTimeMs || 10000)) {
      issues.push(`Long processing time: ${result.totalProcessingTime}ms`)
    }

    // Check for silent audio
    if (result.audioMetrics.isSilent) {
      issues.push('Silent audio detected')
    }

    // Check for empty results
    if (result.correctedText.trim().length === 0) {
      issues.push('Empty transcription result')
    }

    // Log validation issues
    if (issues.length > 0) {
      this.log('⚠️ Quality validation issues detected', {
        requestId: result.requestId,
        issues,
        qualityScore: result.qualityScore
      })
    }
  }

  /**
   * Update service metrics
   */
  private updateMetrics(result: RussianTranscriptionResult): void {
    this.metrics.totalTranscriptions++

    // Processing time metrics
    this.processingTimes.push(result.totalProcessingTime)
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift()
    }
    this.metrics.averageProcessingTime =
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length

    // Quality score metrics
    this.qualityScores.push(result.qualityScore)
    if (this.qualityScores.length > 100) {
      this.qualityScores.shift()
    }
    this.metrics.averageQualityScore =
      this.qualityScores.reduce((sum, score) => sum + score, 0) / this.qualityScores.length

    // Confidence metrics
    this.confidenceScores.push(result.confidence)
    if (this.confidenceScores.length > 100) {
      this.confidenceScores.shift()
    }
    this.metrics.averageConfidence =
      this.confidenceScores.reduce((sum, conf) => sum + conf, 0) / this.confidenceScores.length

    // Audio processing metrics
    this.metrics.audioProcessingMetrics.averageAudioProcessingTime =
      (this.metrics.audioProcessingMetrics.averageAudioProcessingTime *
        (this.metrics.totalTranscriptions - 1) +
        result.audioProcessingTime) /
      this.metrics.totalTranscriptions

    if (result.hasRussianFrequencies) {
      this.metrics.audioProcessingMetrics.russianFrequenciesDetectedRate =
        (this.metrics.audioProcessingMetrics.russianFrequenciesDetectedRate *
          (this.metrics.totalTranscriptions - 1) +
          1) /
        this.metrics.totalTranscriptions
    }

    if (result.audioMetrics.isSilent) {
      this.metrics.audioProcessingMetrics.silentAudioRate =
        (this.metrics.audioProcessingMetrics.silentAudioRate *
          (this.metrics.totalTranscriptions - 1) +
          1) /
        this.metrics.totalTranscriptions
    }

    // Processing steps distribution
    result.audioProcessingSteps.forEach(step => {
      this.metrics.audioProcessingMetrics.processingStepsDistribution[step] =
        (this.metrics.audioProcessingMetrics.processingStepsDistribution[step] || 0) + 1
    })

    // Correction metrics
    this.metrics.correctionMetrics.averageCorrectionTime =
      (this.metrics.correctionMetrics.averageCorrectionTime *
        (this.metrics.totalTranscriptions - 1) +
        result.correctionTime) /
      this.metrics.totalTranscriptions

    this.metrics.correctionMetrics.averageCorrectionsPerText =
      (this.metrics.correctionMetrics.averageCorrectionsPerText *
        (this.metrics.totalTranscriptions - 1) +
        result.corrections.length) /
      this.metrics.totalTranscriptions

    if (result.mixedLanguageDetected) {
      this.metrics.correctionMetrics.mixedLanguageDetectionRate =
        (this.metrics.correctionMetrics.mixedLanguageDetectionRate *
          (this.metrics.totalTranscriptions - 1) +
          1) /
        this.metrics.totalTranscriptions
    }

    // Correction type distribution
    result.corrections.forEach(correction => {
      this.metrics.correctionMetrics.correctionTypeDistribution[correction.type] =
        (this.metrics.correctionMetrics.correctionTypeDistribution[correction.type] || 0) + 1
    })

    // Error rate
    const totalErrors =
      this.metrics.errorMetrics.audioProcessingErrors +
      this.metrics.errorMetrics.transcriptionErrors +
      this.metrics.errorMetrics.correctionErrors
    this.metrics.errorMetrics.totalErrorRate = totalErrors / this.metrics.totalTranscriptions
  }

  /**
   * Setup event forwarding from transcription service
   */
  private setupTranscriptionServiceEvents(): void {
    this.transcriptionService.on('partialResult', result => {
      this.log('📝 Partial transcription result', {text: result.text})
    })

    this.transcriptionService.on('serviceInitialized', data => {
      this.log('✅ Underlying transcription service initialized', data)
    })

    this.transcriptionService.on('connectionCreated', data => {
      this.log('🔗 New transcription connection created', data)
    })
  }

  /**
   * Get comprehensive service metrics
   */
  getMetrics(): RussianTranscriptionMetrics & {
    underlyingServiceMetrics: ReturnType<OptimizedTranscriptionService['getMetrics']>
    audioPreprocessorStats: ReturnType<RussianAudioPreprocessor['getConfig']>
    textCorrectorStats: ReturnType<RussianTranscriptionCorrector['getStats']>
  } {
    return {
      ...this.metrics,
      underlyingServiceMetrics: this.transcriptionService.getMetrics(),
      audioPreprocessorStats: this.audioPreprocessor.getConfig(),
      textCorrectorStats: this.textCorrector.getStats()
    }
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig: Partial<RussianTranscriptionConfig>): void {
    this.config = {...this.config, ...newConfig}

    // Update component configurations
    if (newConfig.audioPreprocessor) {
      this.audioPreprocessor.updateConfig(newConfig.audioPreprocessor)
    }

    if (newConfig.textCorrector) {
      this.textCorrector.updateConfig(newConfig.textCorrector)
    }

    this.log('🔧 Russian Transcription Service configuration updated', newConfig)
  }

  /**
   * Add custom corrections to the text corrector
   */
  addCustomCorrections(corrections: Map<string, string>): void {
    this.textCorrector.addCustomCorrections(corrections)
    this.log('📚 Added custom corrections', {count: corrections.size})
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    this.log('🛑 Shutting down Russian Transcription Service...')

    try {
      await this.transcriptionService.shutdown()

      this.log('✅ Russian Transcription Service shutdown completed', {
        finalMetrics: {
          totalTranscriptions: this.metrics.totalTranscriptions,
          averageQualityScore: this.metrics.averageQualityScore,
          averageProcessingTime: this.metrics.averageProcessingTime
        }
      })
    } catch (error) {
      this.log('❌ Error during shutdown', {error})
    }
  }

  /**
   * Logging helper
   */
  private log(message: string, data?: unknown): void {
    if (this.config.enableDebugLogging) {
      console.log(`[RussianTranscriptionService] ${message}`, data || '')
    } else if (message.includes('❌') || message.includes('⚠️')) {
      // Always log errors and warnings
      console.warn(`[RussianTranscriptionService] ${message}`, data || '')
    } else if (message.includes('✅') || message.includes('🚀')) {
      // Always log important success messages
      console.log(`[RussianTranscriptionService] ${message}`, data || '')
    }
  }
}

/**
 * Factory function to create Russian Transcription Service with production-ready defaults
 */
export function createRussianTranscriptionService(
  geminiConfig: GeminiLiveConfig,
  customConfig: Partial<RussianTranscriptionConfig> = {}
): RussianTranscriptionService {
  const productionDefaults: Partial<RussianTranscriptionConfig> = {
    // Audio preprocessing optimized for Russian
    audioPreprocessor: {
      enabled: true,
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      noiseReductionLevel: 0.4, // Higher noise reduction for Russian environments
      normalizationLevel: -3,
      enableBandpassFilter: true,
      enableRussianPhonemeOptimization: true,
      enableSpeechEnhancement: true
    },

    // Text correction optimized for Russian production errors
    textCorrector: {
      enabled: true,
      enableProperNameCorrection: true,
      enableTechnicalTermCorrection: true,
      enableContextualSpelling: true,
      enableGrammarCorrection: true,
      enableCommonPatternFixes: true,
      confidenceThreshold: 0.7
    },

    // Performance settings for production
    enablePartialStreaming: true,
    partialUpdateInterval: 100, // 100ms for responsive UI
    enablePersistentConnections: true,
    enableConnectionWarmup: true,

    // Quality assurance for production
    enableQualityValidation: true,
    minConfidenceThreshold: 0.6,
    maxProcessingTimeMs: 15000, // 15 seconds max for production

    // Monitoring
    enableMetrics: true,
    enableDebugLogging: false // Disable debug logging in production
  }

  const finalConfig: RussianTranscriptionConfig = {
    geminiConfig,
    ...productionDefaults,
    ...customConfig
  }

  return new RussianTranscriptionService(finalConfig)
}

export default RussianTranscriptionService
