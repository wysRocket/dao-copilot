/**
 * Enhanced Transcription Pipeline - Multi-Language Quality Improvement
 *
 * This service integrates all Russian/Ukrainian language processing components
 * to significantly improve transcription accuracy for mixed-language content
 */

import {EventEmitter} from 'events'
import {MixedLanguageDetector, LanguageSegment} from './mixed-language-detector'
import {GrammarPatternCorrector} from './grammar-pattern-corrector'
import {RussianPostProcessor} from './russian-post-processor'
import {RussianEndpointer} from './russian-endpointer'

export interface TranscriptionQualityConfig {
  enableMixedLanguageDetection: boolean
  enableGrammarCorrection: boolean
  enableRussianPostProcessing: boolean
  enableUkrainianSupport: boolean
  confidenceThreshold: number
  processingTimeout: number
  enableDebugLogging: boolean
}

export interface TranscriptionInput {
  text: string
  confidence?: number
  timestamp?: number
  audioData?: ArrayBuffer
  language?: string
  source: 'websocket' | 'api' | 'manual'
}

export interface EnhancedTranscriptionResult {
  originalText: string
  processedText: string
  confidence: number
  detectedLanguages: string[]
  appliedCorrections: Array<{
    type: 'grammar' | 'language' | 'post-processing' | 'endpointing'
    description: string
    before: string
    after: string
  }>
  processingTime: number
  qualityScore: number
  metadata: {
    mixedLanguageDetected: boolean
    primaryLanguage: string
    segments: LanguageSegment[]
    audioProcessed: boolean
  }
}

export class EnhancedTranscriptionPipeline extends EventEmitter {
  private config: TranscriptionQualityConfig
  private mixedLanguageDetector: MixedLanguageDetector
  private grammarCorrector: GrammarPatternCorrector
  private russianPostProcessor: RussianPostProcessor
  private russianEndpointer: RussianEndpointer
  private isInitialized = false

  // Performance metrics
  private processingStats = {
    totalProcessed: 0,
    averageProcessingTime: 0,
    qualityImprovementRate: 0,
    correctionsApplied: 0
  }

  constructor(config: Partial<TranscriptionQualityConfig> = {}) {
    super()

    this.config = {
      enableMixedLanguageDetection: config.enableMixedLanguageDetection ?? true,
      enableGrammarCorrection: config.enableGrammarCorrection ?? true,
      enableRussianPostProcessing: config.enableRussianPostProcessing ?? true,
      enableUkrainianSupport: config.enableUkrainianSupport ?? true,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      processingTimeout: config.processingTimeout ?? 5000,
      enableDebugLogging: config.enableDebugLogging ?? false
    }

    this.initializeComponents()
  }

  private initializeComponents(): void {
    // Initialize Mixed Language Detector with enhanced Ukrainian support
    this.mixedLanguageDetector = new MixedLanguageDetector({
      confidenceThreshold: this.config.confidenceThreshold,
      enableCaching: true,
      cacheSize: 50,
      enableRussianToEnglishTranslation: true,
      enableEnglishToRussianTranslation: true,
      logDetections: this.config.enableDebugLogging
    })

    // Initialize Grammar Pattern Corrector with Ukrainian patterns
    this.grammarCorrector = new GrammarPatternCorrector({
      enableCaseCorrection: true,
      enableVerbFormCorrection: true,
      enableWordOrderCorrection: true,
      enablePrepositionCorrection: true,
      enableConjunctionCorrection: true,
      enableParticleCorrection: true,
      enablePunctuationCorrection: true,
      enableSentenceStructureCorrection: true,
      confidenceThreshold: this.config.confidenceThreshold,
      maxCorrectionsPerSentence: 10
    })

    // Initialize Russian Post Processor (works for Ukrainian too due to Cyrillic)
    this.russianPostProcessor = new RussianPostProcessor({
      enableCyrillicNormalization: true,
      enableTextSegmentation: true,
      enableAbbreviationExpansion: true,
      enableMixedLanguageDetection: this.config.enableMixedLanguageDetection,
      enableGrammarCorrection: this.config.enableGrammarCorrection,
      confidenceThreshold: this.config.confidenceThreshold
    })

    // Initialize Russian Endpointer for audio processing
    this.russianEndpointer = new RussianEndpointer({
      russianVadEnabled: true,
      russianVadSensitivity: 0.7,
      russianMinSpeechDuration: 250,
      russianMinSilenceDuration: 200,
      enableFillerDetection: true,
      enableStressedSyllableDetection: true,
      enableRussianProsody: true,
      russianFillers: ['эм', 'ну', 'это', 'типа', 'как бы', 'вот'],
      russianHesitations: ['а', 'э', 'мм', 'хм'],
      fillerConfidenceThreshold: 0.6
    })

    this.isInitialized = true
    this.log('Enhanced Transcription Pipeline initialized with multi-language support')
  }

  /**
   * Process transcription with comprehensive quality improvements
   */
  async processTranscription(input: TranscriptionInput): Promise<EnhancedTranscriptionResult> {
    if (!this.isInitialized) {
      throw new Error('Enhanced Transcription Pipeline not initialized')
    }

    const startTime = performance.now()
    const originalText = input.text.trim()

    if (!originalText) {
      return this.createEmptyResult(originalText)
    }

    this.log(`Processing transcription: "${originalText.substring(0, 100)}..."`)

    try {
      let processedText = originalText
      let confidence = input.confidence || 0.8
      const appliedCorrections: EnhancedTranscriptionResult['appliedCorrections'] = []
      let detectedLanguages: string[] = []
      let segments: LanguageSegment[] = []
      let mixedLanguageDetected = false
      let audioProcessed = false

      // Step 1: Mixed Language Detection
      if (this.config.enableMixedLanguageDetection) {
        const detectionResult = await this.mixedLanguageDetector.detectSegments(processedText)
        segments = detectionResult.segments
        detectedLanguages = [...new Set(segments.map(s => s.language))]
        mixedLanguageDetected = detectionResult.mixedLanguageFound

        if (detectionResult.processedText !== processedText) {
          appliedCorrections.push({
            type: 'language',
            description: 'Mixed language detection and normalization',
            before: processedText,
            after: detectionResult.processedText
          })
          processedText = detectionResult.processedText
        }

        this.log(
          `Detected languages: ${detectedLanguages.join(', ')}, Mixed: ${mixedLanguageDetected}`
        )
      }

      // Step 2: Grammar Pattern Correction
      if (this.config.enableGrammarCorrection) {
        const correctionResult = await this.grammarCorrector.correct(processedText)

        if (correctionResult.correctedText !== processedText) {
          for (const correction of correctionResult.corrections) {
            appliedCorrections.push({
              type: 'grammar',
              description: `Grammar correction: ${correction.category}`,
              before: correction.original,
              after: correction.corrected
            })
          }
          processedText = correctionResult.correctedText
        }

        this.log(`Applied ${correctionResult.corrections.length} grammar corrections`)
      }

      // Step 3: Russian/Ukrainian Post Processing
      if (
        this.config.enableRussianPostProcessing &&
        (detectedLanguages.includes('russian') || detectedLanguages.includes('ukrainian'))
      ) {
        const postProcessResult = await this.russianPostProcessor.processText(processedText)

        if (postProcessResult.processedText !== processedText) {
          for (const normalization of postProcessResult.normalizations) {
            appliedCorrections.push({
              type: 'post-processing',
              description: `Post-processing: ${normalization.type}`,
              before: normalization.original,
              after: normalization.normalized
            })
          }
          processedText = postProcessResult.processedText
        }

        this.log(`Applied ${postProcessResult.normalizations.length} post-processing operations`)
      }

      // Step 4: Audio Endpointing (if audio data available)
      if (
        input.audioData &&
        detectedLanguages.some(lang => ['russian', 'ukrainian'].includes(lang))
      ) {
        try {
          const endpointResult = await this.russianEndpointer.processAudio(input.audioData)

          // Use Russian endpoint results to improve transcription confidence
          if (endpointResult.isRussianSpeech && endpointResult.russianConfidence > 0.7) {
            appliedCorrections.push({
              type: 'endpointing',
              description: `Audio analysis detected Russian speech (confidence: ${endpointResult.russianConfidence.toFixed(2)})`,
              before: `Original confidence: ${input.confidence || 0.8}`,
              after: `Enhanced confidence: ${endpointResult.russianConfidence}`
            })

            // Enhance confidence based on Russian speech detection
            confidence = Math.max(confidence, endpointResult.russianConfidence)
            audioProcessed = true
          }
        } catch (error) {
          this.log(`Audio processing failed: ${error}`, 'warn')
        }
      }

      // Calculate quality metrics
      const processingTime = performance.now() - startTime
      const qualityScore = this.calculateQualityScore(
        originalText,
        processedText,
        appliedCorrections
      )

      // Update statistics
      this.updateStats(processingTime, qualityScore, appliedCorrections.length)

      const result: EnhancedTranscriptionResult = {
        originalText,
        processedText,
        confidence: Math.min(1.0, confidence + qualityScore * 0.2),
        detectedLanguages,
        appliedCorrections,
        processingTime,
        qualityScore,
        metadata: {
          mixedLanguageDetected,
          primaryLanguage: detectedLanguages[0] || 'unknown',
          segments,
          audioProcessed
        }
      }

      this.log(
        `Processing completed in ${processingTime.toFixed(2)}ms, Quality: ${qualityScore.toFixed(2)}`
      )
      this.emit('transcription_processed', result)

      return result
    } catch (error) {
      this.log(`Processing failed: ${error}`, 'error')
      this.emit('processing_error', {input, error})

      // Return original text with minimal processing
      return {
        originalText,
        processedText: originalText,
        confidence: input.confidence || 0.5,
        detectedLanguages: ['unknown'],
        appliedCorrections: [],
        processingTime: performance.now() - startTime,
        qualityScore: 0.5,
        metadata: {
          mixedLanguageDetected: false,
          primaryLanguage: 'unknown',
          segments: [],
          audioProcessed: false
        }
      }
    }
  }

  /**
   * Calculate quality improvement score
   */
  private calculateQualityScore(
    original: string,
    processed: string,
    corrections: Array<{
      type: 'grammar' | 'language' | 'post-processing' | 'endpointing'
      description: string
      before: string
      after: string
    }>
  ): number {
    if (original === processed) return 0.7 // No changes but processed

    let score = 0.5 // Base score

    // More corrections generally indicate more improvement
    score += Math.min(0.3, corrections.length * 0.05)

    // Length normalization (longer processed text often means expansion of abbreviations, etc.)
    if (processed.length > original.length) {
      score += Math.min(0.1, ((processed.length - original.length) / original.length) * 0.5)
    }

    // Grammar and language corrections are high value
    const highValueCorrections = corrections.filter(
      c => c.type === 'grammar' || c.type === 'language'
    ).length
    score += Math.min(0.15, highValueCorrections * 0.03)

    return Math.min(1.0, score)
  }

  /**
   * Update processing statistics
   */
  private updateStats(processingTime: number, qualityScore: number, correctionCount: number): void {
    this.processingStats.totalProcessed++

    // Rolling average for processing time
    this.processingStats.averageProcessingTime =
      (this.processingStats.averageProcessingTime * (this.processingStats.totalProcessed - 1) +
        processingTime) /
      this.processingStats.totalProcessed

    // Rolling average for quality improvement
    this.processingStats.qualityImprovementRate =
      (this.processingStats.qualityImprovementRate * (this.processingStats.totalProcessed - 1) +
        qualityScore) /
      this.processingStats.totalProcessed

    this.processingStats.correctionsApplied += correctionCount
  }

  /**
   * Create empty result for invalid input
   */
  private createEmptyResult(originalText: string): EnhancedTranscriptionResult {
    return {
      originalText,
      processedText: originalText,
      confidence: 0,
      detectedLanguages: [],
      appliedCorrections: [],
      processingTime: 0,
      qualityScore: 0,
      metadata: {
        mixedLanguageDetected: false,
        primaryLanguage: 'unknown',
        segments: [],
        audioProcessed: false
      }
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): typeof this.processingStats {
    return {...this.processingStats}
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TranscriptionQualityConfig>): void {
    Object.assign(this.config, newConfig)
    this.emit('config_updated', this.config)
  }

  /**
   * Logging utility
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.config.enableDebugLogging && level === 'info') return

    const prefix = '[EnhancedTranscriptionPipeline]'
    switch (level) {
      case 'warn':
        console.warn(`${prefix} ${message}`)
        break
      case 'error':
        console.error(`${prefix} ${message}`)
        break
      default:
        console.log(`${prefix} ${message}`)
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.removeAllListeners()
    this.isInitialized = false
  }
}

/**
 * Factory function to create configured pipeline
 */
export function createEnhancedTranscriptionPipeline(
  config: Partial<TranscriptionQualityConfig> = {}
): EnhancedTranscriptionPipeline {
  return new EnhancedTranscriptionPipeline(config)
}

/**
 * Standalone utility for quick quality enhancement
 */
export async function enhanceTranscription(
  text: string,
  options: Partial<TranscriptionQualityConfig> = {}
): Promise<string> {
  const pipeline = createEnhancedTranscriptionPipeline(options)
  try {
    const result = await pipeline.processTranscription({
      text,
      source: 'manual'
    })
    return result.processedText
  } finally {
    pipeline.destroy()
  }
}
