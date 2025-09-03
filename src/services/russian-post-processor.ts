/**
 * Russian Post-Processor
 *
 * This module implements Task 7.4 requirements for Russian-specific text post-processing,
 * extending text processing capabilities with specialized Russian language features.
 *
 * Features:
 * - Cyrillic text normalization and standardization
 * - Russian-specific text segmentation
 * - Integration with RussianAudioPreprocessor, MixedLanguageDetector, and GrammarPatternCorrector
 * - Russian abbreviations and contractions support
 * - Advanced Russian typography and formatting
 * - Speech-to-text post-processing optimization for Russian
 */

import {MixedLanguageDetector, LanguageSegment} from './mixed-language-detector'
import {GrammarPatternCorrector, GrammarCorrectionDetail} from './grammar-pattern-corrector'

export interface RussianPostProcessorConfig {
  enableCyrillicNormalization: boolean
  enableTextSegmentation: boolean
  enableGrammarCorrection: boolean
  enableMixedLanguageDetection: boolean
  enableAbbreviationExpansion: boolean
  enableTypographyNormalization: boolean
  enableSpeechPatternCorrection: boolean
  confidenceThreshold: number
  maxProcessingTime: number
  preserveOriginalOnFailure: boolean
  logProcessingSteps: boolean
}

export interface ProcessingResult {
  originalText: string
  processedText: string
  languageSegments: LanguageSegment[]
  grammarCorrections: GrammarCorrectionDetail[]
  normalizations: TextNormalization[]
  segmentationInfo: SegmentationInfo
  processingTime: number
  confidence: number
  appliedSteps: string[]
}

export interface TextNormalization {
  type: 'cyrillic' | 'typography' | 'abbreviation' | 'contraction' | 'whitespace'
  original: string
  normalized: string
  position: {start: number; end: number}
  confidence: number
  reason: string
}

export interface SegmentationInfo {
  sentences: SentenceSegment[]
  paragraphs: ParagraphSegment[]
  totalSentences: number
  totalParagraphs: number
  averageSentenceLength: number
}

export interface SentenceSegment {
  text: string
  startIndex: number
  endIndex: number
  type: 'declarative' | 'interrogative' | 'exclamatory' | 'imperative'
  confidence: number
}

export interface ParagraphSegment {
  text: string
  startIndex: number
  endIndex: number
  sentences: SentenceSegment[]
  topicConfidence: number
}

/**
 * Russian Post-Processor class
 * Specialized text processing for Russian language with comprehensive features
 */
export class RussianPostProcessor {
  private config: RussianPostProcessorConfig
  private mixedLanguageDetector: MixedLanguageDetector
  private grammarCorrector: GrammarPatternCorrector

  // Russian-specific patterns and mappings
  private cyrillicNormalizationMap: Map<string, string> = new Map()
  private russianAbbreviations: Map<string, string> = new Map()
  private russianContractions: Map<string, string> = new Map()
  private sentenceEndPatterns: RegExp[] = []
  private paragraphBreakPatterns: RegExp[] = []

  constructor(config: Partial<RussianPostProcessorConfig> = {}) {
    this.config = {
      enableCyrillicNormalization: config.enableCyrillicNormalization ?? true,
      enableTextSegmentation: config.enableTextSegmentation ?? true,
      enableGrammarCorrection: config.enableGrammarCorrection ?? true,
      enableMixedLanguageDetection: config.enableMixedLanguageDetection ?? true,
      enableAbbreviationExpansion: config.enableAbbreviationExpansion ?? true,
      enableTypographyNormalization: config.enableTypographyNormalization ?? true,
      enableSpeechPatternCorrection: config.enableSpeechPatternCorrection ?? true,
      confidenceThreshold: config.confidenceThreshold || 0.7,
      maxProcessingTime: config.maxProcessingTime || 5000, // 5 seconds
      preserveOriginalOnFailure: config.preserveOriginalOnFailure ?? true,
      logProcessingSteps: config.logProcessingSteps ?? false
    }

    // Initialize components
    this.mixedLanguageDetector = new MixedLanguageDetector({
      minConfidenceThreshold: this.config.confidenceThreshold,
      enableRealTimeProcessing: true,
      enableStatisticalAnalysis: true
    })

    this.grammarCorrector = new GrammarPatternCorrector({
      enableCaseCorrection: true,
      enableVerbFormCorrection: true,
      confidenceThreshold: this.config.confidenceThreshold
    })

    this.initializeRussianPatterns()
    console.log('🔄 Russian Post-Processor initialized with comprehensive language support')
  }

  /**
   * Main processing method - orchestrates all Russian-specific post-processing
   */
  async processText(text: string): Promise<ProcessingResult> {
    const startTime = Date.now()
    const originalText = text
    let processedText = text
    const appliedSteps: string[] = []
    const normalizations: TextNormalization[] = []
    let languageSegments: LanguageSegment[] = []
    let grammarCorrections: GrammarCorrectionDetail[] = []
    let segmentationInfo: SegmentationInfo = {
      sentences: [],
      paragraphs: [],
      totalSentences: 0,
      totalParagraphs: 0,
      averageSentenceLength: 0
    }

    try {
      // Step 1: Mixed Language Detection
      if (this.config.enableMixedLanguageDetection) {
        const detectionResult = await this.mixedLanguageDetector.detectSegments(processedText)
        languageSegments = detectionResult.segments
        appliedSteps.push('mixed_language_detection')

        if (this.config.logProcessingSteps) {
          console.log(
            `[RussianPostProcessor] Detected ${languageSegments.length} language segments`
          )
        }
      }

      // Step 2: Cyrillic Text Normalization
      if (this.config.enableCyrillicNormalization) {
        const normalizationResult = await this.normalizeCyrillicText(processedText)
        processedText = normalizationResult.text
        normalizations.push(...normalizationResult.normalizations)
        appliedSteps.push('cyrillic_normalization')
      }

      // Step 3: Typography and Formatting Normalization
      if (this.config.enableTypographyNormalization) {
        const typographyResult = await this.normalizeTypography(processedText)
        processedText = typographyResult.text
        normalizations.push(...typographyResult.normalizations)
        appliedSteps.push('typography_normalization')
      }

      // Step 4: Russian Abbreviations and Contractions
      if (this.config.enableAbbreviationExpansion) {
        const abbreviationResult = await this.expandAbbreviations(processedText)
        processedText = abbreviationResult.text
        normalizations.push(...abbreviationResult.normalizations)
        appliedSteps.push('abbreviation_expansion')
      }

      // Step 5: Speech Pattern Corrections
      if (this.config.enableSpeechPatternCorrection) {
        const speechResult = await this.correctSpeechPatterns(processedText)
        processedText = speechResult.text
        normalizations.push(...speechResult.normalizations)
        appliedSteps.push('speech_pattern_correction')
      }

      // Step 6: Grammar Correction
      if (this.config.enableGrammarCorrection) {
        const grammarResult = await this.grammarCorrector.correct(processedText)
        processedText = grammarResult.correctedText
        grammarCorrections = grammarResult.corrections
        appliedSteps.push('grammar_correction')
      }

      // Step 7: Text Segmentation
      if (this.config.enableTextSegmentation) {
        segmentationInfo = await this.segmentText(processedText)
        appliedSteps.push('text_segmentation')
      }

      // Calculate overall confidence
      const confidence = this.calculateOverallConfidence(
        languageSegments,
        grammarCorrections,
        normalizations
      )

      const processingTime = Date.now() - startTime

      if (this.config.logProcessingSteps) {
        console.log(
          `[RussianPostProcessor] Completed processing in ${processingTime}ms with ${appliedSteps.length} steps`
        )
      }

      return {
        originalText,
        processedText,
        languageSegments,
        grammarCorrections,
        normalizations,
        segmentationInfo,
        processingTime,
        confidence,
        appliedSteps
      }
    } catch (error) {
      console.error('[RussianPostProcessor] Processing error:', error)

      if (this.config.preserveOriginalOnFailure) {
        return {
          originalText,
          processedText: originalText,
          languageSegments: [],
          grammarCorrections: [],
          normalizations: [],
          segmentationInfo: {
            sentences: [],
            paragraphs: [],
            totalSentences: 0,
            totalParagraphs: 0,
            averageSentenceLength: 0
          },
          processingTime: Date.now() - startTime,
          confidence: 0.0,
          appliedSteps: ['error_fallback']
        }
      } else {
        throw error
      }
    }
  }

  /**
   * Initialize Russian-specific patterns and mappings
   */
  private initializeRussianPatterns(): void {
    this.initializeCyrillicNormalization()
    this.initializeAbbreviations()
    this.initializeContractions()
    this.initializeSentencePatterns()
    this.initializeParagraphPatterns()
  }

  /**
   * Initialize Cyrillic character normalization mappings
   */
  private initializeCyrillicNormalization(): void {
    // Homograph normalization (visually similar characters)
    this.cyrillicNormalizationMap.set('А', 'А') // Cyrillic A
    this.cyrillicNormalizationMap.set('a', 'а') // Latin a -> Cyrillic а
    this.cyrillicNormalizationMap.set('A', 'А') // Latin A -> Cyrillic А
    this.cyrillicNormalizationMap.set('B', 'В') // Latin B -> Cyrillic В
    this.cyrillicNormalizationMap.set('E', 'Е') // Latin E -> Cyrillic Е
    this.cyrillicNormalizationMap.set('e', 'е') // Latin e -> Cyrillic е
    this.cyrillicNormalizationMap.set('K', 'К') // Latin K -> Cyrillic К
    this.cyrillicNormalizationMap.set('M', 'М') // Latin M -> Cyrillic М
    this.cyrillicNormalizationMap.set('H', 'Н') // Latin H -> Cyrillic Н
    this.cyrillicNormalizationMap.set('O', 'О') // Latin O -> Cyrillic О
    this.cyrillicNormalizationMap.set('o', 'о') // Latin o -> Cyrillic о
    this.cyrillicNormalizationMap.set('P', 'Р') // Latin P -> Cyrillic Р
    this.cyrillicNormalizationMap.set('p', 'р') // Latin p -> Cyrillic р
    this.cyrillicNormalizationMap.set('C', 'С') // Latin C -> Cyrillic С
    this.cyrillicNormalizationMap.set('c', 'с') // Latin c -> Cyrillic с
    this.cyrillicNormalizationMap.set('T', 'Т') // Latin T -> Cyrillic Т
    this.cyrillicNormalizationMap.set('y', 'у') // Latin y -> Cyrillic у
    this.cyrillicNormalizationMap.set('x', 'х') // Latin x -> Cyrillic х
    this.cyrillicNormalizationMap.set('X', 'Х') // Latin X -> Cyrillic Х

    // Additional normalizations for common transcription errors
    this.cyrillicNormalizationMap.set('ё', 'е') // Optional: ё to е normalization (configurable)
    this.cyrillicNormalizationMap.set('Ё', 'Е') // Optional: Ё to Е normalization
  }

  /**
   * Initialize Russian abbreviations
   */
  private initializeAbbreviations(): void {
    // Common Russian abbreviations
    this.russianAbbreviations.set('г.', 'год')
    this.russianAbbreviations.set('гг.', 'годы')
    this.russianAbbreviations.set('в.', 'век')
    this.russianAbbreviations.set('вв.', 'века')
    this.russianAbbreviations.set('р.', 'рубль')
    this.russianAbbreviations.set('руб.', 'рублей')
    this.russianAbbreviations.set('коп.', 'копеек')
    this.russianAbbreviations.set('тыс.', 'тысяч')
    this.russianAbbreviations.set('млн.', 'миллионов')
    this.russianAbbreviations.set('млрд.', 'миллиардов')
    this.russianAbbreviations.set('км.', 'километров')
    this.russianAbbreviations.set('м.', 'метров')
    this.russianAbbreviations.set('см.', 'сантиметров')
    this.russianAbbreviations.set('мм.', 'миллиметров')
    this.russianAbbreviations.set('кг.', 'килограммов')
    this.russianAbbreviations.set('г.', 'граммов')
    this.russianAbbreviations.set('т.', 'тонн')
    this.russianAbbreviations.set('л.', 'литров')
    this.russianAbbreviations.set('мл.', 'миллилитров')
    this.russianAbbreviations.set('сек.', 'секунд')
    this.russianAbbreviations.set('мин.', 'минут')
    this.russianAbbreviations.set('ч.', 'часов')

    // Titles and honorifics
    this.russianAbbreviations.set('г-н', 'господин')
    this.russianAbbreviations.set('г-жа', 'госпожа')
    this.russianAbbreviations.set('др.', 'доктор')
    this.russianAbbreviations.set('проф.', 'профессор')

    // Geographic abbreviations
    this.russianAbbreviations.set('обл.', 'область')
    this.russianAbbreviations.set('р-н', 'район')
    this.russianAbbreviations.set('ул.', 'улица')
    this.russianAbbreviations.set('пр.', 'проспект')
    this.russianAbbreviations.set('пер.', 'переулок')
    this.russianAbbreviations.set('наб.', 'набережная')
    this.russianAbbreviations.set('пл.', 'площадь')
    this.russianAbbreviations.set('д.', 'дом')
    this.russianAbbreviations.set('кв.', 'квартира')
    this.russianAbbreviations.set('стр.', 'строение')

    // Organizations
    this.russianAbbreviations.set('ООО', 'Общество с ограниченной ответственностью')
    this.russianAbbreviations.set('ЗАО', 'Закрытое акционерное общество')
    this.russianAbbreviations.set('ОАО', 'Открытое акционерное общество')
    this.russianAbbreviations.set('ИП', 'Индивидуальный предприниматель')
  }

  /**
   * Initialize Russian contractions and informal speech patterns
   */
  private initializeContractions(): void {
    // Common Russian contractions in speech
    this.russianContractions.set('не', 'не')
    this.russianContractions.set('ща', 'сейчас')
    this.russianContractions.set('токо', 'только')
    this.russianContractions.set('када', 'когда')
    this.russianContractions.set('шо', 'что')
    this.russianContractions.set('чё', 'что')
    this.russianContractions.set('дык', 'да')
    this.russianContractions.set('ваще', 'вообще')
    this.russianContractions.set('нихрена', 'ничего')
    this.russianContractions.set('хрен', 'ничего')
    this.russianContractions.set('чуток', 'чуть-чуть')
  }

  /**
   * Initialize sentence boundary patterns
   */
  private initializeSentencePatterns(): void {
    // Russian sentence endings
    this.sentenceEndPatterns = [
      /[.!?…]+\s+(?=[А-ЯЁ])/g, // Standard endings followed by capital letter
      /[.!?…]+\s*$/g, // Endings at end of text
      /[.!?…]+\s+(?=["«])/g, // Endings followed by quotes
      /[.!?…]+(?=\s*\n)/g // Endings before newline
    ]
  }

  /**
   * Initialize paragraph break patterns
   */
  private initializeParagraphPatterns(): void {
    // Russian paragraph boundaries
    this.paragraphBreakPatterns = [
      /\n\s*\n/g, // Double newline
      /\.\s*\n\s*(?=[А-ЯЁ])/g, // Period + newline + capital letter
      /[!?…]\s*\n\s*(?=[А-ЯЁ])/g // Exclamation/question + newline + capital
    ]
  }

  /**
   * Normalize Cyrillic text
   */
  private async normalizeCyrillicText(text: string): Promise<{
    text: string
    normalizations: TextNormalization[]
  }> {
    const normalizations: TextNormalization[] = []
    let normalizedText = text

    // Apply character-level normalizations
    for (const [from, to] of this.cyrillicNormalizationMap.entries()) {
      if (from !== to) {
        const regex = new RegExp(from, 'g')
        const matches = [...normalizedText.matchAll(regex)]

        for (const match of matches) {
          if (match.index !== undefined) {
            normalizations.push({
              type: 'cyrillic',
              original: from,
              normalized: to,
              position: {start: match.index, end: match.index + from.length},
              confidence: 0.95,
              reason: `Normalized ${from} to Cyrillic ${to}`
            })
          }
        }

        normalizedText = normalizedText.replace(regex, to)
      }
    }

    // Additional Cyrillic-specific normalizations
    // Remove extra whitespace
    const whitespaceNormalized = normalizedText.replace(/\s+/g, ' ').trim()
    if (whitespaceNormalized !== normalizedText) {
      normalizations.push({
        type: 'whitespace',
        original: normalizedText,
        normalized: whitespaceNormalized,
        position: {start: 0, end: normalizedText.length},
        confidence: 0.9,
        reason: 'Normalized whitespace'
      })
    }

    return {
      text: whitespaceNormalized,
      normalizations
    }
  }

  /**
   * Normalize typography and formatting
   */
  private async normalizeTypography(text: string): Promise<{
    text: string
    normalizations: TextNormalization[]
  }> {
    const normalizations: TextNormalization[] = []
    let normalizedText = text

    // Russian typography rules
    const typographyRules: Array<{pattern: RegExp; replacement: string; reason: string}> = [
      // Russian quotation marks
      {
        pattern: /"([^"]+)"/g,
        replacement: '«$1»',
        reason: 'Use Russian quotation marks'
      },
      // Em dash normalization
      {
        pattern: / - /g,
        replacement: ' — ',
        reason: 'Use proper em dash'
      },
      // Ellipsis normalization
      {
        pattern: /\.\.\./g,
        replacement: '…',
        reason: 'Use proper ellipsis character'
      },
      // Number separation with non-breaking spaces
      {
        pattern: /(\d)\s(\d{3})\b/g,
        replacement: '$1 $2',
        reason: 'Use proper number formatting'
      }
    ]

    for (const rule of typographyRules) {
      const matches = [...normalizedText.matchAll(rule.pattern)]

      for (const match of matches) {
        if (match.index !== undefined) {
          normalizations.push({
            type: 'typography',
            original: match[0],
            normalized: match[0].replace(rule.pattern, rule.replacement),
            position: {start: match.index, end: match.index + match[0].length},
            confidence: 0.85,
            reason: rule.reason
          })
        }
      }

      normalizedText = normalizedText.replace(rule.pattern, rule.replacement)
    }

    return {
      text: normalizedText,
      normalizations
    }
  }

  /**
   * Expand Russian abbreviations
   */
  private async expandAbbreviations(text: string): Promise<{
    text: string
    normalizations: TextNormalization[]
  }> {
    const normalizations: TextNormalization[] = []
    let expandedText = text

    for (const [abbrev, expansion] of this.russianAbbreviations.entries()) {
      const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
      const matches = [...expandedText.matchAll(regex)]

      for (const match of matches) {
        if (match.index !== undefined) {
          normalizations.push({
            type: 'abbreviation',
            original: abbrev,
            normalized: expansion,
            position: {start: match.index, end: match.index + abbrev.length},
            confidence: 0.8,
            reason: `Expanded abbreviation ${abbrev} to ${expansion}`
          })
        }
      }

      expandedText = expandedText.replace(regex, expansion)
    }

    return {
      text: expandedText,
      normalizations
    }
  }

  /**
   * Correct speech patterns and contractions
   */
  private async correctSpeechPatterns(text: string): Promise<{
    text: string
    normalizations: TextNormalization[]
  }> {
    const normalizations: TextNormalization[] = []
    let correctedText = text

    // Apply contraction expansions
    for (const [contraction, expansion] of this.russianContractions.entries()) {
      if (contraction !== expansion) {
        const regex = new RegExp(`\\b${contraction}\\b`, 'gi')
        const matches = [...correctedText.matchAll(regex)]

        for (const match of matches) {
          if (match.index !== undefined) {
            normalizations.push({
              type: 'contraction',
              original: match[0],
              normalized: expansion,
              position: {start: match.index, end: match.index + match[0].length},
              confidence: 0.75,
              reason: `Expanded contraction ${match[0]} to ${expansion}`
            })
          }
        }

        correctedText = correctedText.replace(regex, expansion)
      }
    }

    // Common speech-to-text pattern corrections
    const speechPatterns: Array<{pattern: RegExp; replacement: string; reason: string}> = [
      {
        pattern: /\bэ+м+\b/gi,
        replacement: '',
        reason: 'Removed filler word "эм"'
      },
      {
        pattern: /\bа+х+\b/gi,
        replacement: '',
        reason: 'Removed filler sound "ах"'
      },
      {
        pattern: /\bну+ +/gi,
        replacement: '',
        reason: 'Removed excessive "ну" filler'
      },
      {
        pattern: /\bвот+ +/gi,
        replacement: 'вот ',
        reason: 'Normalized repeated "вот"'
      }
    ]

    for (const pattern of speechPatterns) {
      const matches = [...correctedText.matchAll(pattern.pattern)]

      for (const match of matches) {
        if (match.index !== undefined) {
          normalizations.push({
            type: 'contraction',
            original: match[0],
            normalized: pattern.replacement,
            position: {start: match.index, end: match.index + match[0].length},
            confidence: 0.7,
            reason: pattern.reason
          })
        }
      }

      correctedText = correctedText.replace(pattern.pattern, pattern.replacement)
    }

    return {
      text: correctedText,
      normalizations
    }
  }

  /**
   * Segment text into sentences and paragraphs
   */
  private async segmentText(text: string): Promise<SegmentationInfo> {
    const sentences = this.segmentIntoSentences(text)
    const paragraphs = this.segmentIntoParagraphs(text, sentences)

    const totalSentences = sentences.length
    const totalParagraphs = paragraphs.length
    const averageSentenceLength =
      sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.text.length, 0) / sentences.length
        : 0

    return {
      sentences,
      paragraphs,
      totalSentences,
      totalParagraphs,
      averageSentenceLength
    }
  }

  /**
   * Segment text into sentences
   */
  private segmentIntoSentences(text: string): SentenceSegment[] {
    const sentences: SentenceSegment[] = []

    // Split by sentence boundaries
    const sentenceBoundaries: number[] = []

    for (const pattern of this.sentenceEndPatterns) {
      const matches = [...text.matchAll(pattern)]
      for (const match of matches) {
        if (match.index !== undefined) {
          sentenceBoundaries.push(match.index + match[0].length)
        }
      }
    }

    // Sort boundaries and create segments
    sentenceBoundaries.sort((a, b) => a - b)

    let lastBoundary = 0
    for (const boundary of sentenceBoundaries) {
      if (boundary > lastBoundary) {
        const sentenceText = text.slice(lastBoundary, boundary).trim()
        if (sentenceText.length > 0) {
          sentences.push({
            text: sentenceText,
            startIndex: lastBoundary,
            endIndex: boundary,
            type: this.getSentenceType(sentenceText),
            confidence: 0.8
          })
        }
        lastBoundary = boundary
      }
    }

    // Add final sentence if text doesn't end with punctuation
    if (lastBoundary < text.length) {
      const finalText = text.slice(lastBoundary).trim()
      if (finalText.length > 0) {
        sentences.push({
          text: finalText,
          startIndex: lastBoundary,
          endIndex: text.length,
          type: this.getSentenceType(finalText),
          confidence: 0.7
        })
      }
    }

    return sentences
  }

  /**
   * Determine sentence type
   */
  private getSentenceType(
    sentence: string
  ): 'declarative' | 'interrogative' | 'exclamatory' | 'imperative' {
    const trimmed = sentence.trim()

    if (trimmed.endsWith('?')) return 'interrogative'
    if (trimmed.endsWith('!')) return 'exclamatory'

    // Check for interrogative words in Russian
    const interrogativeWords = [
      'что',
      'кто',
      'где',
      'когда',
      'почему',
      'зачем',
      'как',
      'какой',
      'который'
    ]
    const firstWord = trimmed.split(' ')[0]?.toLowerCase()
    if (interrogativeWords.includes(firstWord)) return 'interrogative'

    // Check for imperative mood indicators
    const imperativePatterns = [
      /^[а-яё]+те\s/i, // verb + те (formal imperative)
      /^[а-яё]+(й|и)\s/i // informal imperative endings
    ]

    for (const pattern of imperativePatterns) {
      if (pattern.test(trimmed)) return 'imperative'
    }

    return 'declarative'
  }

  /**
   * Segment text into paragraphs
   */
  private segmentIntoParagraphs(text: string, sentences: SentenceSegment[]): ParagraphSegment[] {
    const paragraphs: ParagraphSegment[] = []

    // Find paragraph boundaries
    const paragraphBoundaries: number[] = [0]

    for (const pattern of this.paragraphBreakPatterns) {
      const matches = [...text.matchAll(pattern)]
      for (const match of matches) {
        if (match.index !== undefined) {
          paragraphBoundaries.push(match.index + match[0].length)
        }
      }
    }

    paragraphBoundaries.push(text.length)
    paragraphBoundaries.sort((a, b) => a - b)

    // Create paragraph segments
    for (let i = 0; i < paragraphBoundaries.length - 1; i++) {
      const start = paragraphBoundaries[i]
      const end = paragraphBoundaries[i + 1]
      const paragraphText = text.slice(start, end).trim()

      if (paragraphText.length > 0) {
        const paragraphSentences = sentences.filter(s => s.startIndex >= start && s.endIndex <= end)

        paragraphs.push({
          text: paragraphText,
          startIndex: start,
          endIndex: end,
          sentences: paragraphSentences,
          topicConfidence: 0.7
        })
      }
    }

    return paragraphs
  }

  /**
   * Calculate overall processing confidence
   */
  private calculateOverallConfidence(
    languageSegments: LanguageSegment[],
    grammarCorrections: GrammarCorrectionDetail[],
    normalizations: TextNormalization[]
  ): number {
    let totalConfidence = 1.0
    let factors = 1

    // Factor in language detection confidence
    if (languageSegments.length > 0) {
      const avgLanguageConfidence =
        languageSegments.reduce((sum, seg) => sum + seg.confidence, 0) / languageSegments.length
      totalConfidence *= avgLanguageConfidence
      factors++
    }

    // Factor in grammar correction confidence
    if (grammarCorrections.length > 0) {
      const avgGrammarConfidence =
        grammarCorrections.reduce((sum, corr) => sum + (corr.confidence || 0.7), 0) /
        grammarCorrections.length
      totalConfidence *= avgGrammarConfidence
      factors++
    }

    // Factor in normalization confidence
    if (normalizations.length > 0) {
      const avgNormalizationConfidence =
        normalizations.reduce((sum, norm) => sum + norm.confidence, 0) / normalizations.length
      totalConfidence *= avgNormalizationConfidence
      factors++
    }

    // Apply root to prevent over-penalization
    return Math.pow(totalConfidence, 1 / factors)
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RussianPostProcessorConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  /**
   * Get current configuration
   */
  getConfig(): RussianPostProcessorConfig {
    return {...this.config}
  }

  /**
   * Get processing statistics
   */
  getStatistics(): {
    cyrillicNormalizations: number
    abbreviations: number
    contractions: number
    sentencePatterns: number
    paragraphPatterns: number
  } {
    return {
      cyrillicNormalizations: this.cyrillicNormalizationMap.size,
      abbreviations: this.russianAbbreviations.size,
      contractions: this.russianContractions.size,
      sentencePatterns: this.sentenceEndPatterns.length,
      paragraphPatterns: this.paragraphBreakPatterns.length
    }
  }
}

/**
 * Factory function to create a configured Russian Post-Processor
 */
export function createRussianPostProcessor(
  config: Partial<RussianPostProcessorConfig> = {}
): RussianPostProcessor {
  return new RussianPostProcessor(config)
}

/**
 * Utility function for quick Russian text processing
 */
export async function processRussianText(text: string): Promise<string> {
  const processor = createRussianPostProcessor({
    enableCyrillicNormalization: true,
    enableGrammarCorrection: true,
    enableTypographyNormalization: true,
    confidenceThreshold: 0.7
  })

  const result = await processor.processText(text)
  return result.processedText
}
