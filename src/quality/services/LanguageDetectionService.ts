/**
 * Advanced Language Detection Service
 *
 * Comprehensive language detection system that combines browser APIs, audio analysis,
 * text analysis, and context analysis for accurate language identification in
 * mixed-language environments with real-time switching capabilities.
 */

import {EventEmitter} from 'events'
import {
  ILanguageDetectionService,
  LanguageDetectionResult,
  MixedLanguageDetectionResult,
  LanguageDetectionConfig,
  DetectionOptions,
  ContinuousDetectionOptions,
  AudioTextInput,
  LanguageDetectionSource,
  LanguageDefinition,
  AudioLanguageFeatures,
  TextLanguageFeatures,
  ContextLanguageFeatures,
  LanguageDetectionPerformanceMetrics,
  LanguageDetectionAccuracyMetrics,
  LanguageDetectionEvents,
  DEFAULT_SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE_DETECTION_CONFIG
} from '../types/LanguageTypes'

/**
 * Audio feature extraction utilities
 */
class AudioFeatureExtractor {
  /**
   * Extract MFCC features from audio buffer
   */
  public static extractMFCC(audioBuffer: ArrayBuffer, sampleRate: number = 16000): number[] {
    // Simplified MFCC extraction - in production would use Web Audio API or libraries
    const floatArray = new Float32Array(audioBuffer)

    // Pre-emphasis filter
    const preEmphasized = this.preEmphasis(floatArray, 0.97)

    // Windowing and FFT (simplified)
    const windowSize = 512
    const hopSize = 256
    const mfccCoeffs: number[] = []

    for (let i = 0; i < preEmphasized.length - windowSize; i += hopSize) {
      const window = preEmphasized.slice(i, i + windowSize)
      const spectrum = this.computeSpectrum(window)
      const melFiltered = this.applyMelFilters(spectrum, sampleRate)
      const mfcc = this.computeDCT(melFiltered.map(x => Math.log(Math.max(x, 1e-10))))
      mfccCoeffs.push(...mfcc.slice(0, 13)) // First 13 coefficients
    }

    return mfccCoeffs
  }

  /**
   * Extract prosody features from audio
   */
  public static extractProsody(
    audioBuffer: ArrayBuffer,
    sampleRate: number = 16000
  ): {
    pitch: {mean: number; variance: number; range: number}
    rhythm: {syllableRate: number; stressPattern: number[]}
    intonation: {contour: number[]; finalPattern: 'rising' | 'falling' | 'level'}
  } {
    const floatArray = new Float32Array(audioBuffer)

    // Simplified pitch extraction using autocorrelation
    const pitchValues = this.extractPitch(floatArray, sampleRate)
    const validPitches = pitchValues.filter(p => p > 0)

    const pitchMean = validPitches.reduce((a, b) => a + b, 0) / validPitches.length || 0
    const pitchVariance =
      validPitches.reduce((acc, val) => acc + Math.pow(val - pitchMean, 2), 0) /
        validPitches.length || 0
    const pitchRange = Math.max(...validPitches) - Math.min(...validPitches) || 0

    // Simplified rhythm detection
    const energyProfile = this.computeEnergyProfile(floatArray)
    const syllableRate = this.estimateSyllableRate(energyProfile, sampleRate)

    // Simplified intonation analysis
    const contour = this.smoothPitchContour(pitchValues)
    const finalPattern = this.analyzeFinalIntonation(contour)

    return {
      pitch: {
        mean: pitchMean,
        variance: pitchVariance,
        range: pitchRange
      },
      rhythm: {
        syllableRate,
        stressPattern: this.detectStressPattern(energyProfile)
      },
      intonation: {
        contour,
        finalPattern
      }
    }
  }

  // Helper methods for audio processing
  private static preEmphasis(signal: Float32Array, alpha: number): Float32Array {
    const result = new Float32Array(signal.length)
    result[0] = signal[0]
    for (let i = 1; i < signal.length; i++) {
      result[i] = signal[i] - alpha * signal[i - 1]
    }
    return result
  }

  private static computeSpectrum(window: Float32Array): number[] {
    // Simplified FFT - in production would use proper FFT implementation
    const spectrum: number[] = []
    const N = window.length

    for (let k = 0; k < N / 2; k++) {
      let real = 0,
        imag = 0
      for (let n = 0; n < N; n++) {
        const angle = (-2 * Math.PI * k * n) / N
        real += window[n] * Math.cos(angle)
        imag += window[n] * Math.sin(angle)
      }
      spectrum[k] = Math.sqrt(real * real + imag * imag)
    }

    return spectrum
  }

  private static applyMelFilters(spectrum: number[], sampleRate: number): number[] {
    const numFilters = 26
    const melFilters: number[] = new Array(numFilters).fill(0)

    // Simplified mel filter bank
    for (let i = 0; i < numFilters; i++) {
      const startMel = 0
      const endMel = 2595 * Math.log10(1 + sampleRate / (2 * 700))
      const melStep = (endMel - startMel) / (numFilters + 1)

      const centerMel = startMel + (i + 1) * melStep
      const centerFreq = 700 * (Math.pow(10, centerMel / 2595) - 1)
      const binIndex = Math.floor((centerFreq * spectrum.length * 2) / sampleRate)

      if (binIndex < spectrum.length) {
        melFilters[i] = spectrum[binIndex]
      }
    }

    return melFilters
  }

  private static computeDCT(values: number[]): number[] {
    const N = values.length
    const dct: number[] = []

    for (let k = 0; k < N; k++) {
      let sum = 0
      for (let n = 0; n < N; n++) {
        sum += values[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N))
      }
      dct[k] = sum
    }

    return dct
  }

  private static extractPitch(signal: Float32Array, sampleRate: number): number[] {
    const pitches: number[] = []
    const windowSize = Math.floor(sampleRate * 0.03) // 30ms windows
    const hopSize = Math.floor(windowSize / 2)

    for (let i = 0; i < signal.length - windowSize; i += hopSize) {
      const window = signal.slice(i, i + windowSize)
      const pitch = this.autocorrelationPitch(window, sampleRate)
      pitches.push(pitch)
    }

    return pitches
  }

  private static autocorrelationPitch(window: Float32Array, sampleRate: number): number {
    const minPitch = 80 // Hz
    const maxPitch = 400 // Hz
    const minPeriod = Math.floor(sampleRate / maxPitch)
    const maxPeriod = Math.floor(sampleRate / minPitch)

    let maxCorr = 0
    let bestPeriod = 0

    for (let period = minPeriod; period <= maxPeriod && period < window.length / 2; period++) {
      let correlation = 0
      for (let i = 0; i < window.length - period; i++) {
        correlation += window[i] * window[i + period]
      }

      if (correlation > maxCorr) {
        maxCorr = correlation
        bestPeriod = period
      }
    }

    return bestPeriod > 0 ? sampleRate / bestPeriod : 0
  }

  private static computeEnergyProfile(signal: Float32Array): number[] {
    const windowSize = 512
    const hopSize = 256
    const energy: number[] = []

    for (let i = 0; i < signal.length - windowSize; i += hopSize) {
      let sum = 0
      for (let j = 0; j < windowSize; j++) {
        sum += signal[i + j] * signal[i + j]
      }
      energy.push(sum / windowSize)
    }

    return energy
  }

  private static estimateSyllableRate(energyProfile: number[], sampleRate: number): number {
    const hopSize = 256
    const timePerFrame = hopSize / sampleRate

    // Simple peak detection for syllable estimation
    let peaks = 0
    const threshold = Math.max(...energyProfile) * 0.3

    for (let i = 1; i < energyProfile.length - 1; i++) {
      if (
        energyProfile[i] > energyProfile[i - 1] &&
        energyProfile[i] > energyProfile[i + 1] &&
        energyProfile[i] > threshold
      ) {
        peaks++
      }
    }

    const totalTime = energyProfile.length * timePerFrame
    return peaks / totalTime // syllables per second
  }

  private static detectStressPattern(energyProfile: number[]): number[] {
    // Simplified stress pattern detection
    const pattern: number[] = []
    const windowSize = 10

    for (let i = 0; i < energyProfile.length - windowSize; i += windowSize) {
      const window = energyProfile.slice(i, i + windowSize)
      const avg = window.reduce((a, b) => a + b, 0) / window.length
      const max = Math.max(...window)
      pattern.push(max / avg) // Stress indicator
    }

    return pattern
  }

  private static smoothPitchContour(pitchValues: number[]): number[] {
    // Simple moving average smoothing
    const windowSize = 3
    const smoothed: number[] = []

    for (let i = 0; i < pitchValues.length; i++) {
      let sum = 0
      let count = 0

      for (
        let j = Math.max(0, i - windowSize);
        j <= Math.min(pitchValues.length - 1, i + windowSize);
        j++
      ) {
        if (pitchValues[j] > 0) {
          sum += pitchValues[j]
          count++
        }
      }

      smoothed[i] = count > 0 ? sum / count : 0
    }

    return smoothed
  }

  private static analyzeFinalIntonation(contour: number[]): 'rising' | 'falling' | 'level' {
    if (contour.length < 3) return 'level'

    const finalPortion = contour.slice(-3)
    const validPortion = finalPortion.filter(p => p > 0)

    if (validPortion.length < 2) return 'level'

    const trend = validPortion[validPortion.length - 1] - validPortion[0]
    const threshold = 10 // Hz

    if (trend > threshold) return 'rising'
    if (trend < -threshold) return 'falling'
    return 'level'
  }
}

/**
 * Text feature extraction utilities
 */
class TextFeatureExtractor {
  /**
   * Extract character-level features from text
   */
  public static extractCharacterFeatures(text: string): TextLanguageFeatures['characterFeatures'] {
    const charDistribution: Record<string, number> = {}
    const unicodeBlocks: Set<string> = new Set()
    const diacritics: Set<string> = new Set()
    let scriptType: TextLanguageFeatures['characterFeatures']['scriptType'] = 'latin'

    for (const char of text) {
      const code = char.charCodeAt(0)

      // Character distribution
      charDistribution[char] = (charDistribution[char] || 0) + 1

      // Unicode block detection
      if (code >= 0x0400 && code <= 0x04ff) {
        unicodeBlocks.add('cyrillic')
        scriptType = 'cyrillic'
      } else if (code >= 0x0590 && code <= 0x05ff) {
        unicodeBlocks.add('hebrew')
        scriptType = 'arabic'
      } else if (code >= 0x0600 && code <= 0x06ff) {
        unicodeBlocks.add('arabic')
        scriptType = 'arabic'
      } else if (code >= 0x4e00 && code <= 0x9fff) {
        unicodeBlocks.add('cjk')
        scriptType = 'chinese'
      } else if (code >= 0x3040 && code <= 0x309f) {
        unicodeBlocks.add('hiragana')
        scriptType = 'japanese'
      } else if (code >= 0x30a0 && code <= 0x30ff) {
        unicodeBlocks.add('katakana')
        scriptType = 'japanese'
      } else if (code >= 0x0900 && code <= 0x097f) {
        unicodeBlocks.add('devanagari')
        scriptType = 'devanagari'
      }

      // Diacritic detection
      if (
        (code >= 0x0300 && code <= 0x036f) || // Combining diacritical marks
        (code >= 0x1ab0 && code <= 0x1aff) || // Combining diacritical marks extended
        (code >= 0x1dc0 && code <= 0x1dff)
      ) {
        // Combining diacritical marks supplement
        diacritics.add(char)
      }
    }

    return {
      scriptType,
      characterDistribution: charDistribution,
      unicodeBlocks: Array.from(unicodeBlocks),
      diacritics: Array.from(diacritics)
    }
  }

  /**
   * Extract linguistic features from text
   */
  public static extractLinguisticFeatures(
    text: string
  ): TextLanguageFeatures['linguisticFeatures'] {
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0)

    // N-gram analysis
    const unigrams: Record<string, number> = {}
    const bigrams: Record<string, number> = {}
    const trigrams: Record<string, number> = {}

    // Character n-grams
    for (let i = 0; i < text.length; i++) {
      // Unigrams
      const char = text[i]
      unigrams[char] = (unigrams[char] || 0) + 1

      // Bigrams
      if (i < text.length - 1) {
        const bigram = text.slice(i, i + 2)
        bigrams[bigram] = (bigrams[bigram] || 0) + 1
      }

      // Trigrams
      if (i < text.length - 2) {
        const trigram = text.slice(i, i + 3)
        trigrams[trigram] = (trigrams[trigram] || 0) + 1
      }
    }

    // Word length distribution
    const wordLengths = words.map(w => w.length)
    const maxLength = Math.max(...wordLengths, 0)
    const lengthDistribution = new Array(maxLength + 1).fill(0)
    wordLengths.forEach(len => lengthDistribution[len]++)

    // Simple morphology analysis
    const prefixes: string[] = []
    const suffixes: string[] = []
    words.forEach(word => {
      if (word.length > 3) {
        prefixes.push(word.slice(0, 2))
        suffixes.push(word.slice(-2))
      }
    })

    return {
      nGrams: {
        unigrams,
        bigrams,
        trigrams
      },
      wordLengthDistribution: lengthDistribution,
      morphologyIndicators: {
        prefixes: [...new Set(prefixes)],
        suffixes: [...new Set(suffixes)],
        inflections: [] // Would require more sophisticated analysis
      },
      syntaxIndicators: {
        wordOrder: 'svo', // Default assumption
        articleUsage: this.countArticles(words),
        caseMarking: this.detectCaseMarking(text)
      }
    }
  }

  /**
   * Extract vocabulary features from text
   */
  public static extractVocabularyFeatures(
    text: string,
    supportedLanguages: LanguageDefinition[]
  ): TextLanguageFeatures['vocabularyFeatures'] {
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0)
    const stopWordMatches: Record<string, number> = {}

    // Check stop word matches for each language
    supportedLanguages.forEach(lang => {
      let matches = 0
      words.forEach(word => {
        if (lang.stopWords.includes(word)) {
          matches++
        }
      })
      stopWordMatches[lang.code] = matches / words.length
    })

    // Function word ratio (approximation)
    const functionWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']
    const functionWordCount = words.filter(word => functionWords.includes(word)).length
    const functionWordRatio = functionWordCount / words.length

    // Lexical diversity (Type-Token Ratio)
    const uniqueWords = new Set(words)
    const lexicalDiversity = uniqueWords.size / words.length

    return {
      stopWordMatches,
      functionWordRatio,
      lexicalDiversity,
      borrowedWords: [] // Would require language-specific dictionaries
    }
  }

  private static countArticles(words: string[]): number {
    const articles = [
      'the',
      'a',
      'an',
      'der',
      'die',
      'das',
      'le',
      'la',
      'les',
      'un',
      'une',
      'el',
      'la',
      'los',
      'las'
    ]
    return words.filter(word => articles.includes(word.toLowerCase())).length / words.length
  }

  private static detectCaseMarking(text: string): boolean {
    // Simplified case marking detection based on character patterns
    const cyrillicCasePattern = /[а-я][А-Я]/
    const latinCasePattern = /[a-z][A-Z]/
    return cyrillicCasePattern.test(text) || latinCasePattern.test(text)
  }
}

/**
 * Main Language Detection Service implementation
 */
export class LanguageDetectionService extends EventEmitter implements ILanguageDetectionService {
  private config: LanguageDetectionConfig
  private supportedLanguages: LanguageDefinition[]
  private continuousSessions = new Map<string, ContinuousDetectionSession>()
  private cache = new Map<string, LanguageDetectionResult>()
  private performanceMetrics: LanguageDetectionPerformanceMetrics
  private accuracyMetrics: LanguageDetectionAccuracyMetrics

  constructor(
    config: Partial<LanguageDetectionConfig> = {},
    supportedLanguages: LanguageDefinition[] = DEFAULT_SUPPORTED_LANGUAGES
  ) {
    super()
    this.config = {...DEFAULT_LANGUAGE_DETECTION_CONFIG, ...config}
    this.supportedLanguages = supportedLanguages
    this.performanceMetrics = this.initializePerformanceMetrics()
    this.accuracyMetrics = this.initializeAccuracyMetrics()
  }

  // Implement ILanguageDetectionService interface methods
  public async detectFromAudio(
    audioData: ArrayBuffer,
    options: DetectionOptions = {}
  ): Promise<LanguageDetectionResult> {
    const startTime = performance.now()

    try {
      if (
        !this.config.audioAnalysis.enabled ||
        !this.config.enabledMethods.includes('audio_analysis')
      ) {
        throw new Error('Audio analysis is disabled')
      }

      // Extract audio features
      const audioFeatures = await this.extractAudioFeatures(audioData)

      // Perform language classification based on audio features
      const result = await this.classifyFromAudioFeatures(audioFeatures, options)

      // Update performance metrics
      const processingTime = performance.now() - startTime
      this.updatePerformanceMetrics(processingTime)

      // Emit event
      this.emit('detection:completed', result)

      return result
    } catch (error) {
      this.emit('detection:error', error as Error, {source: 'audio', options})
      throw error
    }
  }

  public async detectFromText(
    text: string,
    options: DetectionOptions = {}
  ): Promise<LanguageDetectionResult> {
    const startTime = performance.now()

    try {
      if (
        !this.config.textAnalysis.enabled ||
        !this.config.enabledMethods.includes('text_analysis')
      ) {
        throw new Error('Text analysis is disabled')
      }

      if (text.length < this.config.textAnalysis.minTextLength) {
        throw new Error(
          `Text too short (minimum ${this.config.textAnalysis.minTextLength} characters)`
        )
      }

      // Check cache first
      const cacheKey = this.getCacheKey('text', text, options)
      if (this.config.performance.enableCaching && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!
      }

      // Extract text features
      const textFeatures = await this.extractTextFeatures(text)

      // Perform language classification
      const result = await this.classifyFromTextFeatures(textFeatures, text, options)

      // Cache result
      if (this.config.performance.enableCaching) {
        this.addToCache(cacheKey, result)
      }

      // Update performance metrics
      const processingTime = performance.now() - startTime
      this.updatePerformanceMetrics(processingTime)

      // Emit event
      this.emit('detection:completed', result)

      return result
    } catch (error) {
      this.emit('detection:error', error as Error, {source: 'text', text, options})
      throw error
    }
  }

  public async detectFromContext(
    context: ContextLanguageFeatures,
    options: DetectionOptions = {}
  ): Promise<LanguageDetectionResult> {
    const startTime = performance.now()

    try {
      if (
        !this.config.contextAnalysis.enabled ||
        !this.config.enabledMethods.includes('context_analysis')
      ) {
        throw new Error('Context analysis is disabled')
      }

      // Analyze context features
      const result = await this.classifyFromContextFeatures(context, options)

      // Update performance metrics
      const processingTime = performance.now() - startTime
      this.updatePerformanceMetrics(processingTime)

      // Emit event
      this.emit('detection:completed', result)

      return result
    } catch (error) {
      this.emit('detection:error', error as Error, {source: 'context', context, options})
      throw error
    }
  }

  public async detectMixed(
    input: AudioTextInput,
    options: DetectionOptions = {}
  ): Promise<MixedLanguageDetectionResult> {
    const startTime = performance.now()

    try {
      const results: LanguageDetectionResult[] = []

      // Detect from available inputs
      if (input.audio) {
        results.push(await this.detectFromAudio(input.audio, options))
      }

      if (input.text) {
        results.push(await this.detectFromText(input.text, options))
      }

      // Combine results for mixed-language analysis
      const mixedResult = await this.analyzeMixedLanguageResults(results, input, options)

      // Update performance metrics
      const processingTime = performance.now() - startTime
      this.updatePerformanceMetrics(processingTime)

      // Emit event
      this.emit('detection:mixed', mixedResult)

      return mixedResult
    } catch (error) {
      this.emit('detection:error', error as Error, {source: 'mixed', input, options})
      throw error
    }
  }

  // Continuous detection implementation
  public startContinuousDetection(options: ContinuousDetectionOptions = {}): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const session: ContinuousDetectionSession = {
      sessionId,
      options,
      buffer: [],
      lastUpdate: Date.now(),
      currentLanguage: null,
      languageHistory: [],
      isActive: true
    }

    this.continuousSessions.set(sessionId, session)
    return sessionId
  }

  public stopContinuousDetection(sessionId: string): void {
    const session = this.continuousSessions.get(sessionId)
    if (session) {
      session.isActive = false
      this.continuousSessions.delete(sessionId)
    }
  }

  public updateContinuousDetection(sessionId: string, input: AudioTextInput): void {
    const session = this.continuousSessions.get(sessionId)
    if (!session || !session.isActive) {
      return
    }

    // Add input to buffer
    session.buffer.push(input)
    session.lastUpdate = Date.now()

    // Trim buffer if too large
    const maxBufferSize = session.options.bufferSize || 100
    if (session.buffer.length > maxBufferSize) {
      session.buffer = session.buffer.slice(-maxBufferSize)
    }

    // Trigger detection if enough time has passed
    const updateInterval = session.options.updateInterval || 1000
    if (Date.now() - session.lastUpdate >= updateInterval) {
      this.processContinuousSession(session).catch(error => {
        this.emit('detection:error', error, {sessionId})
      })
    }
  }

  // Configuration and management
  public updateConfiguration(config: Partial<LanguageDetectionConfig>): void {
    this.config = {...this.config, ...config}
  }

  public getConfiguration(): LanguageDetectionConfig {
    return {...this.config}
  }

  public getSupportedLanguages(): LanguageDefinition[] {
    return [...this.supportedLanguages]
  }

  // Performance and analytics
  public getPerformanceMetrics(): LanguageDetectionPerformanceMetrics {
    return {...this.performanceMetrics}
  }

  public getAccuracyMetrics(): LanguageDetectionAccuracyMetrics {
    return {...this.accuracyMetrics}
  }

  // Cleanup
  public cleanup(): void {
    this.continuousSessions.clear()
    this.cache.clear()
    this.removeAllListeners()
  }

  // Private implementation methods
  private async extractAudioFeatures(audioData: ArrayBuffer): Promise<AudioLanguageFeatures> {
    const sampleRate = 16000 // Assume standard sample rate

    const spectralFeatures = {
      mfcc: AudioFeatureExtractor.extractMFCC(audioData, sampleRate),
      chroma: [], // Would implement chromagram extraction
      spectralCentroid: 0, // Would implement spectral centroid calculation
      spectralBandwidth: 0,
      spectralRolloff: 0
    }

    const prosodyFeatures = AudioFeatureExtractor.extractProsody(audioData, sampleRate)

    return {
      spectralFeatures,
      prosodyFeatures,
      phonemeFeatures: {
        formants: [], // Would implement formant analysis
        consonantFeatures: [],
        phonemeTransitions: []
      },
      temporalFeatures: {
        pauseDuration: [],
        speechRate: prosodyFeatures.rhythm.syllableRate * 60, // Convert to words per minute
        articulation: prosodyFeatures.rhythm.syllableRate
      }
    }
  }

  private async extractTextFeatures(text: string): Promise<TextLanguageFeatures> {
    return {
      characterFeatures: TextFeatureExtractor.extractCharacterFeatures(text),
      linguisticFeatures: TextFeatureExtractor.extractLinguisticFeatures(text),
      vocabularyFeatures: TextFeatureExtractor.extractVocabularyFeatures(
        text,
        this.supportedLanguages
      )
    }
  }

  private async classifyFromAudioFeatures(
    features: AudioLanguageFeatures,
    options: DetectionOptions
  ): Promise<LanguageDetectionResult> {
    // Simplified classification based on prosodic features
    // In production, this would use trained machine learning models

    const scores: Record<string, number> = {}

    // Score based on pitch characteristics
    const pitchMean = features.prosodyFeatures.pitch.mean
    const syllableRate = features.prosodyFeatures.rhythm.syllableRate

    for (const lang of this.supportedLanguages) {
      let score = 0.5 // Base score

      // Language-specific prosodic patterns (simplified)
      switch (lang.code) {
        case 'en':
          score += pitchMean > 150 && pitchMean < 250 ? 0.2 : -0.1
          score += syllableRate > 2 && syllableRate < 5 ? 0.1 : -0.05
          break
        case 'uk':
          score += pitchMean > 100 && pitchMean < 200 ? 0.2 : -0.1
          score += syllableRate > 1.5 && syllableRate < 4 ? 0.1 : -0.05
          break
        case 'ru':
          score += pitchMean > 120 && pitchMean < 220 ? 0.2 : -0.1
          score += syllableRate > 1.8 && syllableRate < 4.5 ? 0.1 : -0.05
          break
      }

      scores[lang.code] = Math.max(0, Math.min(1, score))
    }

    const bestMatch = Object.entries(scores).reduce((a, b) => (scores[a[0]] > scores[b[0]] ? a : b))

    return {
      language: bestMatch[0],
      confidence: bestMatch[1],
      source: 'audio_analysis',
      timestamp: Date.now(),
      features: {audioFeatures: features},
      alternatives: Object.entries(scores)
        .filter(([lang]) => lang !== bestMatch[0])
        .map(([lang, confidence]) => ({
          language: lang,
          confidence,
          source: 'audio_analysis' as LanguageDetectionSource
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3),
      metadata: {processingMethod: 'prosodic_analysis'}
    }
  }

  private async classifyFromTextFeatures(
    features: TextLanguageFeatures,
    text: string,
    options: DetectionOptions
  ): Promise<LanguageDetectionResult> {
    const scores: Record<string, number> = {}

    // Score based on stop word matches
    const stopWordScores = features.vocabularyFeatures.stopWordMatches

    // Score based on character features
    for (const lang of this.supportedLanguages) {
      let score = stopWordScores[lang.code] || 0

      // Boost score based on script type
      if (lang.script === 'Cyrillic' && features.characterFeatures.scriptType === 'cyrillic') {
        score += 0.3
      } else if (lang.script === 'Latin' && features.characterFeatures.scriptType === 'latin') {
        score += 0.2
      }

      // Character n-gram analysis (simplified)
      const commonChars = Object.keys(features.linguisticFeatures.nGrams.unigrams).slice(0, 10)

      for (const char of commonChars) {
        if (lang.commonWords.some(word => word.includes(char))) {
          score += 0.01
        }
      }

      scores[lang.code] = Math.max(0, Math.min(1, score))
    }

    const bestMatch = Object.entries(scores).reduce((a, b) => (scores[a[0]] > scores[b[0]] ? a : b))

    return {
      language: bestMatch[0],
      confidence: bestMatch[1],
      source: 'text_analysis',
      timestamp: Date.now(),
      features: {textFeatures: features},
      alternatives: Object.entries(scores)
        .filter(([lang]) => lang !== bestMatch[0])
        .map(([lang, confidence]) => ({
          language: lang,
          confidence,
          source: 'text_analysis' as LanguageDetectionSource
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3),
      metadata: {text: text.slice(0, 100)}
    }
  }

  private async classifyFromContextFeatures(
    context: ContextLanguageFeatures,
    options: DetectionOptions
  ): Promise<LanguageDetectionResult> {
    const scores: Record<string, number> = {}

    // Initialize base scores
    for (const lang of this.supportedLanguages) {
      scores[lang.code] = 0.3 // Base probability
    }

    // Browser/system language
    if (context.applicationContext.systemLocale) {
      const systemLang = context.applicationContext.systemLocale.split('-')[0]
      if (scores[systemLang] !== undefined) {
        scores[systemLang] += 0.4
      }
    }

    // Previous session languages
    if (context.sessionContext.previousLanguages.length > 0) {
      const recentLang = context.sessionContext.previousLanguages[0]
      if (scores[recentLang] !== undefined) {
        scores[recentLang] += 0.3
      }
    }

    // Geographic context (if available)
    if (context.geographicContext.country) {
      const countryLangMap: Record<string, string> = {
        US: 'en',
        GB: 'en',
        CA: 'en',
        UA: 'uk',
        RU: 'ru',
        DE: 'de',
        FR: 'fr',
        ES: 'es'
      }

      const countryLang = countryLangMap[context.geographicContext.country]
      if (countryLang && scores[countryLang] !== undefined) {
        scores[countryLang] += 0.2
      }
    }

    // Normalize scores
    const maxScore = Math.max(...Object.values(scores))
    if (maxScore > 0) {
      for (const lang of Object.keys(scores)) {
        scores[lang] = scores[lang] / maxScore
      }
    }

    const bestMatch = Object.entries(scores).reduce((a, b) => (scores[a[0]] > scores[b[0]] ? a : b))

    return {
      language: bestMatch[0],
      confidence: bestMatch[1],
      source: 'context_analysis',
      timestamp: Date.now(),
      features: {contextFeatures: context},
      alternatives: Object.entries(scores)
        .filter(([lang]) => lang !== bestMatch[0])
        .map(([lang, confidence]) => ({
          language: lang,
          confidence,
          source: 'context_analysis' as LanguageDetectionSource
        }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3),
      metadata: {contextSources: Object.keys(context)}
    }
  }

  private async analyzeMixedLanguageResults(
    results: LanguageDetectionResult[],
    input: AudioTextInput,
    options: DetectionOptions
  ): Promise<MixedLanguageDetectionResult> {
    if (results.length === 0) {
      throw new Error('No detection results to analyze')
    }

    // Find primary language (highest confidence)
    const primaryResult = results.reduce((a, b) => (a.confidence > b.confidence ? a : b))

    // Analyze for mixed languages
    const languageConfidences: Record<string, number> = {}
    const allLanguages = new Set<string>()

    results.forEach(result => {
      allLanguages.add(result.language)
      languageConfidences[result.language] = Math.max(
        languageConfidences[result.language] || 0,
        result.confidence
      )

      result.alternatives.forEach(alt => {
        allLanguages.add(alt.language)
        languageConfidences[alt.language] = Math.max(
          languageConfidences[alt.language] || 0,
          alt.confidence
        )
      })
    })

    const isPrimaryLanguage = allLanguages.size === 1
    const sortedLanguages = Object.entries(languageConfidences).sort(([, a], [, b]) => b - a)

    const secondaryLanguages = sortedLanguages
      .slice(1)
      .filter(([, confidence]) => confidence > this.config.confidenceThresholds.mixed)
      .map(([language, confidence]) => ({
        language,
        confidence,
        segments: [] // Would need more sophisticated segmentation
      }))

    // Determine overall pattern
    let overallPattern: MixedLanguageDetectionResult['overallPattern']
    if (isPrimaryLanguage) {
      overallPattern = 'monolingual'
    } else if (secondaryLanguages.length === 1 && secondaryLanguages[0].confidence > 0.7) {
      overallPattern = 'code_switching'
    } else if (secondaryLanguages.length > 0) {
      overallPattern = 'multilingual'
    } else {
      overallPattern = 'mixed_domain'
    }

    // Calculate dominance scores
    const totalConfidence = sortedLanguages.reduce((sum, [, conf]) => sum + conf, 0)
    const dominanceScore: Record<string, number> = {}
    sortedLanguages.forEach(([lang, conf]) => {
      dominanceScore[lang] = totalConfidence > 0 ? conf / totalConfidence : 0
    })

    return {
      isPrimaryLanguage,
      primaryLanguage: primaryResult.language,
      primaryConfidence: primaryResult.confidence,
      secondaryLanguages,
      languageSwitches: [], // Would need temporal analysis
      overallPattern,
      dominanceScore
    }
  }

  private async processContinuousSession(session: ContinuousDetectionSession): Promise<void> {
    if (session.buffer.length === 0) return

    // Get the most recent inputs for analysis
    const recentInputs = session.buffer.slice(-5) // Last 5 inputs

    for (const input of recentInputs) {
      const result = await this.detectMixed(input, session.options)

      // Check for language switch
      if (
        session.currentLanguage &&
        result.primaryLanguage !== session.currentLanguage &&
        result.primaryConfidence > this.config.confidenceThresholds.switching
      ) {
        this.emit(
          'detection:switch',
          session.currentLanguage,
          result.primaryLanguage,
          result.primaryConfidence
        )

        session.languageHistory.push({
          language: session.currentLanguage,
          timestamp: Date.now(),
          confidence: 1.0
        })
      }

      session.currentLanguage = result.primaryLanguage
      this.emit('detection:update', session.sessionId, {
        language: result.primaryLanguage,
        confidence: result.primaryConfidence,
        source: 'mixed_detection',
        timestamp: Date.now(),
        features: {},
        alternatives: [],
        metadata: {sessionId: session.sessionId}
      })
    }
  }

  // Utility methods
  private getCacheKey(type: string, data: string | ArrayBuffer, options: DetectionOptions): string {
    const dataStr = typeof data === 'string' ? data : Array.from(new Uint8Array(data)).join(',')
    return `${type}:${this.hashString(dataStr)}:${JSON.stringify(options)}`
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  private addToCache(key: string, result: LanguageDetectionResult): void {
    if (this.cache.size >= this.config.performance.cacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, result)
  }

  private updatePerformanceMetrics(processingTime: number): void {
    this.performanceMetrics.averageLatency =
      (this.performanceMetrics.averageLatency + processingTime) / 2
    this.performanceMetrics.maxLatency = Math.max(
      this.performanceMetrics.maxLatency,
      processingTime
    )
    this.performanceMetrics.throughput += 1
    this.performanceMetrics.cacheHitRate = this.cache.size / this.config.performance.cacheSize
  }

  private initializePerformanceMetrics(): LanguageDetectionPerformanceMetrics {
    return {
      averageLatency: 0,
      maxLatency: 0,
      throughput: 0,
      cacheHitRate: 0,
      resourceUsage: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkRequests: 0
      },
      errorRate: 0,
      timeoutRate: 0
    }
  }

  private initializeAccuracyMetrics(): LanguageDetectionAccuracyMetrics {
    return {
      overallAccuracy: 0,
      languageSpecificAccuracy: {},
      confidenceCalibration: {
        bins: [],
        accuracy: []
      },
      confusionMatrix: {},
      mixedLanguageAccuracy: {
        primaryLanguageAccuracy: 0,
        switchDetectionAccuracy: 0,
        segmentationAccuracy: 0
      }
    }
  }
}

/**
 * Continuous detection session interface
 */
interface ContinuousDetectionSession {
  sessionId: string
  options: ContinuousDetectionOptions
  buffer: AudioTextInput[]
  lastUpdate: number
  currentLanguage: string | null
  languageHistory: Array<{
    language: string
    timestamp: number
    confidence: number
  }>
  isActive: boolean
}

// Export factory function for easy instantiation
export function createLanguageDetectionService(
  config?: Partial<LanguageDetectionConfig>,
  supportedLanguages?: LanguageDefinition[]
): ILanguageDetectionService {
  return new LanguageDetectionService(config, supportedLanguages)
}
