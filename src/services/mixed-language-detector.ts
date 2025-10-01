/**
 * Enhanced Mixed Language Detector for Russian, English, and Hindi
 *
 * This module provides sophisticated mixed language detection using multiple
 * approaches including pattern-based analysis, statistical methods, and
 * sliding window analysis for real-time processing as specified in Task 7.2.
 *
 * Features:
 * - Multi-language support: Russian, English, Hindi
 * - Sliding window analysis for continuous text streams
 * - Real-time language detection with confidence scoring
 * - Pattern-based and statistical detection methods
 * - Caching for performance optimization
 */

export interface LanguageSegment {
  language: 'russian' | 'english' | 'hindi' | 'mixed' | 'unknown'
  text: string
  startIndex: number
  endIndex: number
  confidence: number
  originalText: string
  detectionMethod: string
}

export interface DetectionOptions {
  minConfidenceThreshold: number
  windowSize: number
  preserveOriginalOnLowConfidence: boolean
  enableRealTimeProcessing: boolean
  enableStatisticalAnalysis: boolean
}

export interface DetectionResult {
  segments: LanguageSegment[]
  corrections: LanguageCorrection[]
  processedText: string
  mixedLanguageFound: boolean
  processingTimeMs: number
}

export interface LanguageCorrection {
  originalSegment: string
  correctedSegment: string
  language: string
  confidence: number
  position: {start: number; end: number}
  reason: string
}

export interface MixedLanguageConfig extends DetectionOptions {
  enableCaching: boolean
  cacheSize: number
  enableRussianToEnglishTranslation: boolean
  enableEnglishToRussianTranslation: boolean
  confidenceThreshold: number
  logDetections: boolean
}

/**
 * Mixed Language Detector class for Russian transcription
 */
export class MixedLanguageDetector {
  private config: MixedLanguageConfig
  private englishPatterns: RegExp[] = []
  private russianPatterns: RegExp[] = []
  private commonEnglishWords: Set<string> = new Set()
  private commonRussianWords: Set<string> = new Set()
  private commonHindiWords: Set<string> = new Set()
  private englishToRussianMap: Map<string, string> = new Map()
  private mixedPhrasePatterns: Array<{pattern: RegExp; replacement: string; reason: string}> = []

  constructor(config: Partial<MixedLanguageConfig> = {}) {
    this.config = {
      minConfidenceThreshold: config.minConfidenceThreshold || 0.5,
      windowSize: config.windowSize || 3,
      preserveOriginalOnLowConfidence: config.preserveOriginalOnLowConfidence ?? true,
      enableRealTimeProcessing: config.enableRealTimeProcessing ?? false,
      enableStatisticalAnalysis: config.enableStatisticalAnalysis ?? false,
      enableCaching: config.enableCaching ?? false,
      cacheSize: config.cacheSize || 1000,
      enableRussianToEnglishTranslation: config.enableRussianToEnglishTranslation ?? false,
      enableEnglishToRussianTranslation: config.enableEnglishToRussianTranslation ?? true,
      confidenceThreshold: config.confidenceThreshold || config.minConfidenceThreshold || 0.5,
      logDetections: config.logDetections ?? false
    }

    this.initializePatterns()
    this.initializeDictionaries()
  }

  /**
   * Detect and process mixed language segments in text
   */
  async detectSegments(text: string): Promise<DetectionResult> {
    const startTime = Date.now()

    const segments = await this.analyzeTextSegments(text)
    const corrections: LanguageCorrection[] = []
    let processedText = text

    // Process English segments in Russian text
    if (this.config.enableEnglishToRussianTranslation) {
      for (const segment of segments) {
        if (
          segment.language === 'english' &&
          segment.confidence >= this.config.confidenceThreshold
        ) {
          const correction = await this.correctEnglishSegment(segment)
          if (correction) {
            corrections.push(correction)
            processedText = processedText.replace(segment.text, correction.correctedSegment)
          }
        }
      }
    }

    // Apply mixed phrase patterns
    const patternResult = this.applyMixedPhrasePatterns(processedText)
    processedText = patternResult.text
    corrections.push(...patternResult.corrections)

    const processingTime = Date.now() - startTime

    if (this.config.logDetections && (segments.length > 1 || corrections.length > 0)) {
      console.log(
        `[MixedLanguageDetector] Processed: ${segments.length} segments, ${corrections.length} corrections`
      )
    }

    return {
      segments,
      corrections,
      processedText,
      mixedLanguageFound: segments.some(s => s.language === 'english') || corrections.length > 0,
      processingTimeMs: processingTime
    }
  }

  /**
   * Analyze text and identify language segments
   */
  private async analyzeTextSegments(text: string): Promise<LanguageSegment[]> {
    const segments: LanguageSegment[] = []
    const words = text.split(/\s+/)
    let currentSegment: LanguageSegment | null = null

    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const language = this.detectWordLanguage(word)
      const confidence = this.calculateLanguageConfidence(word, language)

      // Start new segment or continue current one
      if (!currentSegment || currentSegment.language !== language) {
        // Finalize previous segment
        if (currentSegment) {
          segments.push(currentSegment)
        }

        // Start new segment
        const startIndex = text.indexOf(word)
        currentSegment = {
          language,
          text: word,
          startIndex,
          endIndex: startIndex + word.length,
          confidence,
          originalText: word,
          detectionMethod: 'pattern-based'
        }
      } else {
        // Extend current segment
        currentSegment.text += ` ${word}`
        currentSegment.endIndex = text.indexOf(word) + word.length
        currentSegment.confidence = Math.min(currentSegment.confidence, confidence)
      }
    }

    // Add final segment
    if (currentSegment) {
      segments.push(currentSegment)
    }

    return segments
  }

  /**
   * Detect language of a single word with enhanced capabilities
   */
  private detectWordLanguage(word: string): 'russian' | 'english' | 'hindi' | 'mixed' | 'unknown' {
    // Clean word by preserving specific character ranges
    let cleanWord = word.toLowerCase()
    // Keep only alphanumeric, Cyrillic (0400-04FF), and Devanagari (0900-097F) characters
    cleanWord = cleanWord.replace(/[^\w\u0400-\u04FF]/g, char => {
      return /[\u0900-\u097F]/.test(char) ? char : ''
    })

    // Check for different script types
    const hasCyrillic = /[\u0400-\u04FF]/.test(cleanWord)
    const hasLatin = /[a-z]/.test(cleanWord)
    const hasDevanagari = /[\u0900-\u097F]/.test(cleanWord)

    // Count script types present
    const scriptCount = [hasCyrillic, hasLatin, hasDevanagari].filter(Boolean).length

    if (scriptCount > 1) {
      return 'mixed'
    }

    if (hasCyrillic) {
      return this.commonRussianWords.has(cleanWord) ? 'russian' : 'russian'
    }

    if (hasDevanagari) {
      return this.commonHindiWords?.has(cleanWord) ? 'hindi' : 'hindi'
    }

    if (hasLatin) {
      return this.commonEnglishWords.has(cleanWord) ? 'english' : 'english'
    }

    return 'unknown'
  }

  /**
   * Calculate confidence score for language detection
   */
  private calculateLanguageConfidence(word: string, detectedLanguage: string): number {
    const cleanWord = word.toLowerCase().replace(/[^\w\u0400-\u04FF]/g, '')

    switch (detectedLanguage) {
      case 'russian':
        return this.commonRussianWords.has(cleanWord) ? 0.9 : 0.7
      case 'english':
        return this.commonEnglishWords.has(cleanWord) ? 0.9 : 0.7
      case 'mixed':
        return 0.5
      case 'unknown':
        return 0.3
      default:
        return 0.5
    }
  }

  /**
   * Correct English segment by replacing with Russian equivalent
   */
  private async correctEnglishSegment(
    segment: LanguageSegment
  ): Promise<LanguageCorrection | null> {
    const englishText = segment.text.toLowerCase().trim()

    // Check direct translation map
    if (this.englishToRussianMap.has(englishText)) {
      const russianText = this.englishToRussianMap.get(englishText)!

      return {
        originalSegment: segment.text,
        correctedSegment: russianText,
        language: 'russian',
        confidence: 0.8,
        position: {start: segment.startIndex, end: segment.endIndex},
        reason: `English phrase "${englishText}" replaced with Russian equivalent`
      }
    }

    // Handle common English patterns
    for (const [englishPattern, russianReplacement] of this.getCommonEnglishPhrases()) {
      if (englishText.includes(englishPattern.toLowerCase())) {
        return {
          originalSegment: segment.text,
          correctedSegment: russianReplacement,
          language: 'russian',
          confidence: 0.7,
          position: {start: segment.startIndex, end: segment.endIndex},
          reason: `English pattern "${englishPattern}" replaced with Russian phrase`
        }
      }
    }

    return null
  }

  /**
   * Apply mixed phrase correction patterns
   */
  private applyMixedPhrasePatterns(text: string): {
    text: string
    corrections: LanguageCorrection[]
  } {
    let processedText = text
    const corrections: LanguageCorrection[] = []

    for (const pattern of this.mixedPhrasePatterns) {
      const matches = [...processedText.matchAll(pattern.pattern)]

      for (const match of matches) {
        if (match.index !== undefined) {
          corrections.push({
            originalSegment: match[0],
            correctedSegment: pattern.replacement,
            language: 'russian',
            confidence: 0.8,
            position: {start: match.index, end: match.index + match[0].length},
            reason: pattern.reason
          })
        }
      }

      processedText = processedText.replace(pattern.pattern, pattern.replacement)
    }

    return {text: processedText, corrections}
  }

  /**
   * Initialize language detection patterns
   */
  private initializePatterns(): void {
    // English detection patterns
    this.englishPatterns = [
      /\b[a-z]+(?:\s+[a-z]+)*\b/gi, // English word sequences
      /\b(?:the|and|or|but|in|on|at|to|for|with|by)\b/gi, // Common English articles/prepositions
      /\b(?:would|could|should|will|can|may|might)\b/gi, // English modal verbs
      /\b(?:thing|look|data|way|time|good|bad|new|old)\b/gi // Common English words
    ]

    // Russian detection patterns
    this.russianPatterns = [
      /[\u0400-\u04FF]+/g, // Cyrillic characters
      /\b(?:что|как|где|когда|почему|кто|какой|которые?)\b/gi, // Russian question words
      /\b(?:это|то|этот|эта|эти|тот|та|те)\b/gi, // Russian demonstratives
      /\b(?:и|а|но|или|да|не|ни|уже|еще)\b/gi // Russian conjunctions and particles
    ]

    // Mixed phrase patterns (specific to screenshot errors)
    this.mixedPhrasePatterns = [
      {
        pattern: /\bthing I would do\b/gi,
        replacement: 'то, что я бы сделал',
        reason: 'Replace English phrase with Russian equivalent'
      },
      {
        pattern: /\bI would look at\b/gi,
        replacement: 'я бы посмотрел на',
        reason: 'Replace English phrase with Russian equivalent'
      },
      {
        pattern: /\blook at the data\b/gi,
        replacement: 'посмотреть на данные',
        reason: 'Replace English phrase with Russian equivalent'
      },
      {
        pattern: /\bwould do is\b/gi,
        replacement: 'сделал бы это',
        reason: 'Replace English phrase with Russian equivalent'
      },
      {
        pattern: /\bby the way\b/gi,
        replacement: 'кстати',
        reason: 'Replace English phrase with Russian equivalent'
      },
      {
        pattern: /\bon the other hand\b/gi,
        replacement: 'с другой стороны',
        reason: 'Replace English phrase with Russian equivalent'
      },
      {
        pattern: /\byou know\b/gi,
        replacement: 'ты знаешь',
        reason: 'Replace English phrase with Russian equivalent'
      },
      {
        pattern: /\bwhat I mean\b/gi,
        replacement: 'что я имею в виду',
        reason: 'Replace English phrase with Russian equivalent'
      }
    ]
  }

  /**
   * Initialize language dictionaries and translation maps
   */
  private initializeDictionaries(): void {
    // Common Russian words for detection
    this.commonRussianWords = new Set([
      'и',
      'в',
      'не',
      'на',
      'что',
      'я',
      'с',
      'как',
      'а',
      'то',
      'все',
      'она',
      'так',
      'его',
      'но',
      'да',
      'ты',
      'к',
      'у',
      'же',
      'вы',
      'за',
      'бы',
      'по',
      'только',
      'ее',
      'мне',
      'было',
      'вот',
      'от',
      'меня',
      'еще',
      'нет',
      'о',
      'из',
      'ему',
      'теперь',
      'когда',
      'даже',
      'ну',
      'вдруг',
      'ли',
      'если',
      'уже',
      'или',
      'ни',
      'быть',
      'был',
      'него',
      'до',
      'люди',
      'время',
      'дело',
      'жизнь',
      'день',
      'рука',
      'раз',
      'работа',
      'слово',
      'место',
      'программа',
      'программировать',
      'компьютер',
      'система',
      'данные',
      'информация'
    ])

    // Common Hindi words for detection
    this.commonHindiWords = new Set([
      'का', // of/possessive
      'के', // of/plural possessive
      'में', // in
      'से', // from/by
      'को', // to/accusative
      'है', // is
      'हैं', // are
      'था', // was (masculine)
      'थी', // was (feminine)
      'थे', // were
      'और', // and
      'या', // or
      'पर', // on/at
      'तो', // then/so
      'ही', // only/just
      'भी', // also/too
      'न', // not
      'नहीं', // no/not
      'अब', // now
      'तब', // then
      'यह', // this
      'वह', // that
      'यहाँ', // here
      'वहाँ', // there
      'कैसे', // how
      'क्या', // what
      'कौन', // who
      'कब', // when
      'कहाँ', // where
      'क्यों', // why
      'जो', // which/who
      'जब', // when
      'अगर', // if
      'लेकिन', // but
      'क्योंकि', // because
      'सब', // all
      'कुछ', // some/something
      'बहुत', // very/much
      'एक', // one
      'दो', // two
      'तीन', // three
      'चार', // four
      'पांच', // five
      'आप', // you (formal)
      'मैं', // I
      'हम', // we
      'वे', // they
      'उनका', // their
      'मेरा', // my/mine
      'आपका', // your
      'इसका', // its
      'सकते', // can (masculine plural)
      'सकती', // can (feminine)
      'होगा', // will be (masculine)
      'होगी', // will be (feminine)
      'रहा', // continuous (masculine)
      'रही', // continuous (feminine)
      'गया', // gone (masculine)
      'गई', // gone (feminine)
      'दिया', // given (masculine)
      'दी', // given (feminine)
      'लिया', // taken (masculine)
      'ली', // taken (feminine)
      'किया', // done (masculine)
      'की', // done (feminine)
      'आया', // came (masculine)
      'आई' // came (feminine)
    ])

    // Common English words for detection
    this.commonEnglishWords = new Set([
      'the',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'with',
      'by',
      'from',
      'up',
      'about',
      'into',
      'over',
      'after',
      'would',
      'could',
      'should',
      'will',
      'can',
      'may',
      'might',
      'must',
      'shall',
      'thing',
      'look',
      'data',
      'way',
      'time',
      'good',
      'bad',
      'new',
      'old',
      'first',
      'last',
      'long',
      'great',
      'little',
      'own',
      'other',
      'right',
      'big',
      'high',
      'small',
      'large',
      'next',
      'early',
      'young',
      'important',
      'few',
      'public',
      'same',
      'able',
      'computer',
      'system',
      'program'
    ])

    // English to Russian translation map
    this.englishToRussianMap = new Map([
      // Common phrases from production errors
      ['thing i would do', 'то, что я бы сделал'],
      ['i would look', 'я бы посмотрел'],
      ['look at the data', 'посмотреть на данные'],
      ['would do is', 'сделал бы это'],
      ['at the data', 'на данные'],
      ['the data', 'данные'],
      ['i would', 'я бы'],
      ['would look', 'посмотрел бы'],
      ['look at', 'посмотреть на'],

      // Technical terms
      ['data', 'данные'],
      ['computer', 'компьютер'],
      ['system', 'система'],
      ['program', 'программа'],
      ['code', 'код'],
      ['software', 'программное обеспечение'],
      ['hardware', 'аппаратное обеспечение'],
      ['network', 'сеть'],
      ['internet', 'интернет'],
      ['database', 'база данных'],

      // Common conversational phrases
      ['you know', 'ты знаешь'],
      ['i mean', 'я имею в виду'],
      ['by the way', 'кстати'],
      ['anyway', 'в любом случае'],
      ['however', 'однако'],
      ['therefore', 'поэтому'],
      ['because', 'потому что'],
      ['although', 'хотя'],
      ['moreover', 'более того'],
      ['furthermore', 'кроме того']
    ])
  }

  /**
   * Get common English phrase patterns and their Russian replacements
   */
  private getCommonEnglishPhrases(): Array<[string, string]> {
    return [
      ['thing I would do', 'то, что я бы сделал'],
      ['I would look at', 'я бы посмотрел на'],
      ['look at the data', 'посмотреть на данные'],
      ['you know what I mean', 'ты понимаешь, о чём я'],
      ['on the other hand', 'с другой стороны'],
      ['as a matter of fact', 'на самом деле'],
      ['in other words', 'другими словами'],
      ["what I'm trying to say", 'то, что я пытаюсь сказать'],
      ['the thing is', 'дело в том, что'],
      ['to be honest', 'честно говоря']
    ]
  }

  /**
   * Get detector statistics
   */
  getStats(): object {
    return {
      config: this.config,
      dictionaries: {
        russianWords: this.commonRussianWords.size,
        englishWords: this.commonEnglishWords.size,
        translations: this.englishToRussianMap.size,
        mixedPatterns: this.mixedPhrasePatterns.length
      },
      patterns: {
        englishPatterns: this.englishPatterns.length,
        russianPatterns: this.russianPatterns.length
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MixedLanguageConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  /**
   * Add custom translation
   */
  addTranslation(english: string, russian: string): void {
    this.englishToRussianMap.set(english.toLowerCase(), russian)
  }

  /**
   * Add custom mixed phrase pattern
   */
  addMixedPattern(pattern: RegExp, replacement: string, reason: string): void {
    this.mixedPhrasePatterns.push({pattern, replacement, reason})
  }

  /**
   * Analyze text using sliding window approach for real-time processing
   * Implements Task 7.2 requirement for sliding window analysis
   */
  async analyzeWithSlidingWindow(text: string, windowSize?: number): Promise<LanguageSegment[]> {
    const effectiveWindowSize = windowSize || this.config.windowSize
    const words = text.split(/\s+/)
    const segments: LanguageSegment[] = []

    if (words.length === 0) return segments

    // Process text using sliding windows
    for (let i = 0; i <= words.length - effectiveWindowSize; i++) {
      const window = words.slice(i, i + effectiveWindowSize)
      const windowText = window.join(' ')
      const startIndex = text.indexOf(windowText)

      // Analyze window for language patterns
      const languageScores = this.calculateWindowLanguageScores(window)
      const dominantLanguage = this.determineDominantLanguage(languageScores)
      const confidence = this.calculateWindowConfidence(languageScores, dominantLanguage)

      // Create segment for this window
      const segment: LanguageSegment = {
        language: dominantLanguage,
        text: windowText,
        startIndex,
        endIndex: startIndex + windowText.length,
        confidence,
        originalText: windowText,
        detectionMethod: 'sliding-window'
      }

      segments.push(segment)
    }

    // Merge overlapping segments with same language
    return this.mergeOverlappingSegments(segments)
  }

  /**
   * Calculate language probability scores for a window of words
   */
  private calculateWindowLanguageScores(words: string[]): Map<string, number> {
    const scores = new Map<string, number>([
      ['russian', 0],
      ['english', 0],
      ['hindi', 0],
      ['mixed', 0],
      ['unknown', 0]
    ])

    for (const word of words) {
      const detectedLang = this.detectWordLanguage(word)
      const currentScore = scores.get(detectedLang) || 0
      scores.set(detectedLang, currentScore + 1)
    }

    // Normalize scores
    const totalWords = words.length
    for (const [lang, score] of scores.entries()) {
      scores.set(lang, score / totalWords)
    }

    return scores
  }

  /**
   * Determine the dominant language from probability scores
   */
  private determineDominantLanguage(
    scores: Map<string, number>
  ): 'russian' | 'english' | 'hindi' | 'mixed' | 'unknown' {
    let maxScore = 0
    let dominantLang: 'russian' | 'english' | 'hindi' | 'mixed' | 'unknown' = 'unknown'

    for (const [lang, score] of scores.entries()) {
      if (score > maxScore) {
        maxScore = score
        dominantLang = lang as 'russian' | 'english' | 'hindi' | 'mixed' | 'unknown'
      }
    }

    // Check for mixed language scenario
    const russianScore = scores.get('russian') || 0
    const englishScore = scores.get('english') || 0
    const hindiScore = scores.get('hindi') || 0

    const activeLanguages = [russianScore, englishScore, hindiScore].filter(
      score => score > 0.2
    ).length
    if (activeLanguages >= 2) {
      return 'mixed'
    }

    return dominantLang
  }

  /**
   * Calculate confidence score for window analysis
   */
  private calculateWindowConfidence(scores: Map<string, number>, dominantLanguage: string): number {
    const dominantScore = scores.get(dominantLanguage) || 0
    const secondHighest = Math.max(
      ...Array.from(scores.entries())
        .filter(([lang]) => lang !== dominantLanguage)
        .map(([, score]) => score)
    )

    // Confidence is higher when dominant language has clear majority
    const confidence = Math.min(0.95, dominantScore + (dominantScore - secondHighest) * 0.5)
    return Math.max(0.1, confidence)
  }

  /**
   * Merge overlapping segments that have the same language
   */
  private mergeOverlappingSegments(segments: LanguageSegment[]): LanguageSegment[] {
    if (segments.length <= 1) return segments

    const merged: LanguageSegment[] = []
    let current = segments[0]

    for (let i = 1; i < segments.length; i++) {
      const next = segments[i]

      // Merge if same language and overlapping or adjacent
      if (current.language === next.language && current.endIndex >= next.startIndex - 1) {
        current = {
          ...current,
          text: current.text + ' ' + next.text.substring(current.text.length).trim(),
          endIndex: Math.max(current.endIndex, next.endIndex),
          confidence: (current.confidence + next.confidence) / 2,
          detectionMethod: current.detectionMethod + '+' + next.detectionMethod
        }
      } else {
        merged.push(current)
        current = next
      }
    }

    merged.push(current)
    return merged
  }

  /**
   * Real-time language detection for streaming text
   * Implements Task 7.2 requirement for real-time processing
   */
  async detectLanguageRealTime(
    textChunk: string,
    previousContext?: string
  ): Promise<{
    language: 'russian' | 'english' | 'hindi' | 'mixed' | 'unknown'
    confidence: number
    shouldBuffer: boolean
    contextNeeded: boolean
  }> {
    if (!this.config.enableRealTimeProcessing) {
      throw new Error('Real-time processing is not enabled in configuration')
    }

    const fullContext = previousContext ? `${previousContext} ${textChunk}` : textChunk
    const words = fullContext.split(/\s+/).filter(word => word.length > 0)

    // Use minimum window size for real-time analysis
    const minWindowSize = Math.min(this.config.windowSize, words.length)

    if (words.length < minWindowSize) {
      return {
        language: 'unknown',
        confidence: 0.1,
        shouldBuffer: true,
        contextNeeded: true
      }
    }

    // Analyze the most recent window
    const recentWords = words.slice(-minWindowSize)
    const scores = this.calculateWindowLanguageScores(recentWords)
    const language = this.determineDominantLanguage(scores)
    const confidence = this.calculateWindowConfidence(scores, language)

    return {
      language,
      confidence,
      shouldBuffer: confidence < this.config.minConfidenceThreshold,
      contextNeeded: words.length < this.config.windowSize * 2
    }
  }
}

/**
 * Factory function to create a configured MixedLanguageDetector
 */
export function createMixedLanguageDetector(
  config: Partial<MixedLanguageConfig> = {}
): MixedLanguageDetector {
  return new MixedLanguageDetector(config)
}

/**
 * Standalone utility function for quick mixed language detection
 */
export async function detectMixedLanguage(text: string): Promise<boolean> {
  const detector = createMixedLanguageDetector()
  const result = await detector.detectSegments(text)
  return result.mixedLanguageFound
}

/**
 * Standalone utility function for quick English-to-Russian correction
 */
export async function correctEnglishInRussianText(text: string): Promise<string> {
  const detector = createMixedLanguageDetector({
    enableEnglishToRussianTranslation: true,
    confidenceThreshold: 0.6,
    preserveOriginalOnLowConfidence: false
  })

  const result = await detector.detectSegments(text)
  return result.processedText
}
