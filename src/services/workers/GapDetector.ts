/**
 * Gap Detection System
 *
 * Detects gaps in transcription using audio alignment heuristics and timestamp analysis.
 * Identifies potential missed segments in real-time transcription.
 *
 * Task 5.2 - Implement GapDetector class
 */

import {EventEmitter} from 'events'
import {logger} from '../gemini-logger'
import {TranscriptionResult} from '../gcp-gemini-live-client'

/**
 * Configuration for gap detection behavior
 */
export interface GapDetectionConfig {
  /** Minimum gap duration in ms to be considered significant (default: 2000) */
  minimumGapDurationMs: number
  /** Maximum acceptable silence before considering it a gap (default: 1500) */
  maxSilenceDurationMs: number
  /** Minimum speech confidence threshold (default: 0.7) */
  speechConfidenceThreshold: number
  /** Maximum timestamp drift allowed before gap detection (default: 3000) */
  maxTimestampDriftMs: number
  /** Window size for analyzing speech patterns (default: 10) */
  speechAnalysisWindowSize: number
  /** Minimum text length to be considered valid speech (default: 10) */
  minimumSpeechLength: number
  /** Enable audio alignment heuristics (default: true) */
  enableAudioAlignment: boolean
  /** Enable detailed logging for gap analysis (default: false) */
  enableDetailedLogging: boolean
  /** Detection sensitivity: 'low' | 'medium' | 'high' (default: 'medium') */
  detectionSensitivity: 'low' | 'medium' | 'high'
}

/**
 * Default configuration values
 */
export const DEFAULT_GAP_CONFIG: GapDetectionConfig = {
  minimumGapDurationMs: 2000,
  maxSilenceDurationMs: 1500,
  speechConfidenceThreshold: 0.7,
  maxTimestampDriftMs: 3000,
  speechAnalysisWindowSize: 10,
  minimumSpeechLength: 10,
  enableAudioAlignment: true,
  enableDetailedLogging: false,
  detectionSensitivity: 'medium'
}

/**
 * Information about a detected gap
 */
export interface DetectedGap {
  /** Unique identifier for the gap */
  id: string
  /** Start timestamp of the gap */
  startTimestamp: number
  /** End timestamp of the gap */
  endTimestamp: number
  /** Duration of the gap in milliseconds */
  durationMs: number
  /** Type of gap detected */
  gapType: 'silence_gap' | 'timestamp_drift' | 'missing_segment' | 'speech_interruption'
  /** Confidence score for gap detection (0-1) */
  confidence: number
  /** Audio context before the gap */
  contextBefore?: TranscriptionResult
  /** Audio context after the gap */
  contextAfter?: TranscriptionResult
  /** Expected text/speech indicators */
  expectedSpeechIndicators: SpeechIndicator[]
  /** Recovery recommendations */
  recoveryRecommendations: string[]
  /** Additional metadata */
  metadata: {
    speechPattern?: SpeechPattern
    audioSignals?: AudioSignal[]
    alignmentScore?: number
    detectionMethod: string
    sessionId?: string
  }
}

/**
 * Speech pattern analysis data
 */
export interface SpeechPattern {
  /** Average speech pace (words per minute) */
  averagePace: number
  /** Speech rhythm consistency score */
  rhythmConsistency: number
  /** Pause patterns detected */
  pausePatterns: PausePattern[]
  /** Energy levels during speech */
  energyLevels: number[]
  /** Frequency distribution characteristics */
  frequencyProfile: FrequencyProfile
}

/**
 * Pause pattern in speech
 */
export interface PausePattern {
  /** Duration of the pause */
  durationMs: number
  /** Type of pause detected */
  type: 'natural' | 'unnatural' | 'silence' | 'interruption'
  /** Confidence that this is a significant pause */
  confidence: number
}

/**
 * Frequency analysis profile
 */
export interface FrequencyProfile {
  /** Dominant frequency ranges */
  dominantRanges: FrequencyRange[]
  /** Overall speech energy */
  speechEnergy: number
  /** Background noise level */
  noiseLevel: number
}

/**
 * Frequency range data
 */
export interface FrequencyRange {
  /** Lower bound frequency in Hz */
  minHz: number
  /** Upper bound frequency in Hz */
  maxHz: number
  /** Energy level in this range */
  energy: number
}

/**
 * Audio signal analysis
 */
export interface AudioSignal {
  /** Timestamp of the signal */
  timestamp: number
  /** Signal type */
  type: 'silence' | 'speech' | 'noise' | 'artifact'
  /** Signal strength (0-1) */
  strength: number
  /** Duration in milliseconds */
  durationMs: number
  /** Confidence in signal classification */
  confidence: number
}

/**
 * Speech indicator for expected content
 */
export interface SpeechIndicator {
  /** Type of indicator */
  type: 'partial_word' | 'incomplete_sentence' | 'expected_continuation' | 'speech_pattern'
  /** Confidence that speech should continue */
  confidence: number
  /** Expected content or pattern */
  expectedContent?: string
  /** Linguistic context */
  linguisticContext: string
}

/**
 * Gap detection statistics
 */
export interface GapDetectionStats {
  /** Total gaps detected */
  totalGapsDetected: number
  /** Gaps by type */
  gapsByType: Record<string, number>
  /** Average gap duration */
  averageGapDuration: number
  /** Total analysis time */
  totalAnalysisTime: number
  /** Average detection confidence */
  averageConfidence: number
  /** False positive estimates */
  estimatedFalsePositives: number
  /** Last analysis timestamp */
  lastAnalysisTimestamp: number
  /** Processing performance metrics */
  performanceMetrics: {
    averageAnalysisTime: number
    peakAnalysisTime: number
    totalTranscriptsAnalyzed: number
  }
}

/**
 * Events emitted by the GapDetector
 */
export interface GapDetectionEvents {
  /** Emitted when a gap is detected */
  gapDetected: (gap: DetectedGap) => void
  /** Emitted when gap analysis completes */
  analysisCompleted: (stats: GapDetectionStats) => void
  /** Emitted when speech pattern changes */
  speechPatternChanged: (pattern: SpeechPattern) => void
  /** Emitted when audio alignment is calculated */
  alignmentCalculated: (score: number, context: string) => void
}

/**
 * GapDetector - Detects gaps in transcription using audio alignment heuristics
 *
 * This system analyzes transcription results to identify potential gaps where
 * audio content may have been missed. It uses multiple detection strategies:
 *
 * 1. Timestamp analysis - looks for unusual gaps in transcription timestamps
 * 2. Speech pattern analysis - detects interruptions in natural speech flow
 * 3. Audio signal analysis - identifies silence vs missing content
 * 4. Contextual analysis - looks for incomplete sentences/thoughts
 */
class GapDetector extends EventEmitter {
  private config: GapDetectionConfig

  // Transcription analysis data
  private transcriptionHistory: TranscriptionResult[] = []
  private speechPatternHistory: SpeechPattern[] = []
  private detectedGaps: Map<string, DetectedGap> = new Map()

  // Analysis state
  private currentSpeechPattern: SpeechPattern | null = null
  private lastAnalysisTimestamp: number = 0
  private analysisInProgress: boolean = false

  // Statistics tracking
  private stats: GapDetectionStats = {
    totalGapsDetected: 0,
    gapsByType: {},
    averageGapDuration: 0,
    totalAnalysisTime: 0,
    averageConfidence: 0,
    estimatedFalsePositives: 0,
    lastAnalysisTimestamp: 0,
    performanceMetrics: {
      averageAnalysisTime: 0,
      peakAnalysisTime: 0,
      totalTranscriptsAnalyzed: 0
    }
  }

  private gapDurations: number[] = []
  private confidenceScores: number[] = []
  private analysisTimes: number[] = []

  constructor(config: Partial<GapDetectionConfig> = {}) {
    super()

    this.config = {...DEFAULT_GAP_CONFIG, ...config}
    this.adjustConfigForSensitivity()

    logger.info('GapDetector initialized', {
      minimumGapDurationMs: this.config.minimumGapDurationMs,
      detectionSensitivity: this.config.detectionSensitivity,
      audioAlignment: this.config.enableAudioAlignment
    })
  }

  /**
   * Adjust configuration parameters based on sensitivity level
   */
  private adjustConfigForSensitivity(): void {
    switch (this.config.detectionSensitivity) {
      case 'low':
        this.config.minimumGapDurationMs = Math.max(this.config.minimumGapDurationMs, 3000)
        this.config.speechConfidenceThreshold = 0.8
        this.config.maxTimestampDriftMs = 4000
        break
      case 'high':
        this.config.minimumGapDurationMs = Math.min(this.config.minimumGapDurationMs, 1000)
        this.config.speechConfidenceThreshold = 0.6
        this.config.maxTimestampDriftMs = 2000
        break
      case 'medium':
      default:
        // Use default values
        break
    }
  }

  /**
   * Analyze transcription results for potential gaps
   */
  public async analyzeTranscriptions(
    transcriptions: TranscriptionResult[]
  ): Promise<DetectedGap[]> {
    if (this.analysisInProgress) {
      logger.debug('GapDetector: Analysis already in progress, queuing request')
      return []
    }

    this.analysisInProgress = true
    const analysisStartTime = Date.now()

    try {
      // Update transcription history
      this.updateTranscriptionHistory(transcriptions)

      // Perform gap detection analysis
      const detectedGaps: DetectedGap[] = []

      // Multiple detection strategies
      detectedGaps.push(...(await this.detectTimestampGaps(transcriptions)))
      detectedGaps.push(...(await this.detectSpeechPatternGaps(transcriptions)))

      if (this.config.enableAudioAlignment) {
        detectedGaps.push(...(await this.detectAudioAlignmentGaps(transcriptions)))

        // Analyze expected continuation based on context
        if (transcriptions.length >= 2) {
          const expectedIndicators = this.analyzeExpectedContinuation(
            transcriptions[transcriptions.length - 2]
          )
          if (expectedIndicators.length > 0) {
            // Could create additional gaps based on expected continuation
          }
        }
      }

      // Post-process and validate gaps
      const validatedGaps = await this.validateDetectedGaps(detectedGaps)

      // Update statistics
      this.updateStatistics(validatedGaps, analysisStartTime)

      // Store detected gaps
      validatedGaps.forEach(gap => {
        this.detectedGaps.set(gap.id, gap)
      })

      if (this.config.enableDetailedLogging) {
        logger.debug('GapDetector: Analysis completed', {
          transcriptionsAnalyzed: transcriptions.length,
          gapsDetected: validatedGaps.length,
          analysisDuration: Date.now() - analysisStartTime
        })
      }

      this.emit('analysisCompleted', {...this.stats})

      return validatedGaps
    } catch (error) {
      logger.error('GapDetector: Analysis failed', {
        error: error instanceof Error ? error.message : String(error),
        analysisDuration: Date.now() - analysisStartTime
      })
      return []
    } finally {
      this.analysisInProgress = false
    }
  }

  /**
   * Update transcription history for analysis
   */
  private updateTranscriptionHistory(transcriptions: TranscriptionResult[]): void {
    // Add new transcriptions to history
    transcriptions.forEach(transcript => {
      // Avoid duplicates
      if (!this.transcriptionHistory.some(existing => existing.id === transcript.id)) {
        this.transcriptionHistory.push(transcript)
      }
    })

    // Keep history manageable (last 100 transcriptions)
    if (this.transcriptionHistory.length > 100) {
      this.transcriptionHistory = this.transcriptionHistory
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-100)
    }

    // Update speech pattern analysis
    this.updateSpeechPatternAnalysis()
  }

  /**
   * Detect gaps based on timestamp analysis
   */
  private async detectTimestampGaps(transcriptions: TranscriptionResult[]): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = []
    const sortedTranscriptions = transcriptions
      .filter(t => t.isFinal)
      .sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 1; i < sortedTranscriptions.length; i++) {
      const current = sortedTranscriptions[i]
      const previous = sortedTranscriptions[i - 1]

      const timeDiff = current.timestamp - previous.timestamp

      // Check for significant timestamp gaps
      if (timeDiff > this.config.minimumGapDurationMs) {
        // Estimate if this is likely a real gap vs natural pause
        const confidence = this.calculateTimestampGapConfidence(previous, current, timeDiff)

        if (confidence > 0.5) {
          const gap: DetectedGap = {
            id: `timestamp_gap_${previous.id}_${current.id}`,
            startTimestamp: previous.timestamp + (previous.metadata?.duration || 0),
            endTimestamp: current.timestamp,
            durationMs: timeDiff,
            gapType: timeDiff > this.config.maxTimestampDriftMs ? 'timestamp_drift' : 'silence_gap',
            confidence,
            contextBefore: previous,
            contextAfter: current,
            expectedSpeechIndicators: this.generateSpeechIndicators(previous, current),
            recoveryRecommendations: this.generateRecoveryRecommendations(
              'timestamp_gap',
              timeDiff
            ),
            metadata: {
              detectionMethod: 'timestamp_analysis',
              sessionId: current.sessionId,
              alignmentScore: this.calculateBasicAlignment(previous, current)
            }
          }

          gaps.push(gap)
        }
      }
    }

    return gaps
  }

  /**
   * Detect gaps based on speech pattern analysis
   */
  private async detectSpeechPatternGaps(
    transcriptions: TranscriptionResult[]
  ): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = []
    const recentTranscriptions = transcriptions
      .filter(t => t.isFinal)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-this.config.speechAnalysisWindowSize)

    if (recentTranscriptions.length < 3) {
      return gaps // Need minimum data for pattern analysis
    }

    // Analyze speech patterns within the window
    const speechPattern = this.analyzeSpeechPattern(recentTranscriptions)

    // Look for pattern interruptions
    for (let i = 1; i < recentTranscriptions.length - 1; i++) {
      const prev = recentTranscriptions[i - 1]
      const current = recentTranscriptions[i]
      const next = recentTranscriptions[i + 1]

      // Check for speech flow interruptions
      const interruption = this.detectSpeechInterruption(prev, current, next, speechPattern)

      if (interruption && interruption.confidence > 0.6) {
        const gap: DetectedGap = {
          id: `speech_gap_${current.id}`,
          startTimestamp: current.timestamp,
          endTimestamp: next.timestamp,
          durationMs: next.timestamp - current.timestamp,
          gapType: 'speech_interruption',
          confidence: interruption.confidence,
          contextBefore: current,
          contextAfter: next,
          expectedSpeechIndicators: interruption.indicators,
          recoveryRecommendations: this.generateRecoveryRecommendations(
            'speech_pattern',
            interruption.severity
          ),
          metadata: {
            speechPattern,
            detectionMethod: 'speech_pattern_analysis',
            sessionId: current.sessionId
          }
        }

        gaps.push(gap)
      }
    }

    return gaps
  }

  /**
   * Detect gaps based on audio alignment heuristics
   */
  private async detectAudioAlignmentGaps(
    transcriptions: TranscriptionResult[]
  ): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = []

    // This is a heuristic approach since we don't have direct audio data
    // We analyze transcription characteristics that suggest audio misalignment

    const finalTranscriptions = transcriptions
      .filter(t => t.isFinal)
      .sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 1; i < finalTranscriptions.length; i++) {
      const current = finalTranscriptions[i]
      const previous = finalTranscriptions[i - 1]

      // Check for signs of missed audio segments
      const alignmentIssues = this.detectAudioAlignmentIssues(previous, current)

      if (alignmentIssues.length > 0) {
        const maxConfidence = Math.max(...alignmentIssues.map(issue => issue.confidence))

        if (maxConfidence > 0.7) {
          const gap: DetectedGap = {
            id: `alignment_gap_${previous.id}_${current.id}`,
            startTimestamp: previous.timestamp + (previous.metadata?.duration || 0),
            endTimestamp: current.timestamp,
            durationMs: current.timestamp - previous.timestamp,
            gapType: 'missing_segment',
            confidence: maxConfidence,
            contextBefore: previous,
            contextAfter: current,
            expectedSpeechIndicators: this.analyzeExpectedContinuation(previous, current),
            recoveryRecommendations: this.generateRecoveryRecommendations(
              'audio_alignment',
              maxConfidence
            ),
            metadata: {
              audioSignals: alignmentIssues.map(issue => ({
                timestamp: issue.timestamp,
                type: issue.type as AudioSignal['type'],
                strength: issue.confidence,
                durationMs: issue.duration || 0,
                confidence: issue.confidence
              })),
              alignmentScore: this.calculateDetailedAlignment(previous, current),
              detectionMethod: 'audio_alignment_heuristics',
              sessionId: current.sessionId
            }
          }

          gaps.push(gap)
        }
      }
    }

    return gaps
  }

  /**
   * Calculate confidence for timestamp-based gap detection
   */
  private calculateTimestampGapConfidence(
    previous: TranscriptionResult,
    current: TranscriptionResult,
    timeDiff: number
  ): number {
    let confidence = 0

    // Factor 1: Gap duration relative to normal speech
    const normalizedGapDuration = timeDiff / this.config.minimumGapDurationMs
    confidence += Math.min(normalizedGapDuration * 0.3, 0.4)

    // Factor 2: Text context analysis
    const textContextScore = this.analyzeTextContext(previous, current)
    confidence += textContextScore * 0.3

    // Factor 3: Speech pattern consistency
    if (this.currentSpeechPattern) {
      const patternScore = this.evaluatePatternConsistency(timeDiff)
      confidence += patternScore * 0.2
    }

    // Factor 4: Historical gap patterns
    const historicalScore = this.evaluateHistoricalPatterns(timeDiff)
    confidence += historicalScore * 0.1

    return Math.min(confidence, 1.0)
  }

  /**
   * Analyze speech pattern from recent transcriptions
   */
  private analyzeSpeechPattern(transcriptions: TranscriptionResult[]): SpeechPattern {
    const textLengths = transcriptions.map(t => t.text.length)
    const timeDifferences = []

    for (let i = 1; i < transcriptions.length; i++) {
      timeDifferences.push(transcriptions[i].timestamp - transcriptions[i - 1].timestamp)
    }

    const averageTextLength = textLengths.reduce((a, b) => a + b, 0) / textLengths.length
    const averageTimeDiff = timeDifferences.reduce((a, b) => a + b, 0) / timeDifferences.length

    // Estimate words per minute (rough approximation)
    const averageWords = averageTextLength / 5 // ~5 chars per word
    const averagePace = (averageWords / averageTimeDiff) * 60000 // words per minute

    // Analyze rhythm consistency
    const rhythmConsistency = this.calculateRhythmConsistency(timeDifferences)

    // Detect pause patterns
    const pausePatterns = this.detectPausePatterns(timeDifferences)

    // Create frequency profile (simulated from text characteristics)
    const frequencyProfile = this.createFrequencyProfile(transcriptions)

    return {
      averagePace: Math.max(averagePace, 0),
      rhythmConsistency,
      pausePatterns,
      energyLevels: transcriptions.map(t => t.confidence || 0.5),
      frequencyProfile
    }
  }

  /**
   * Detect speech interruption patterns
   */
  private detectSpeechInterruption(
    prev: TranscriptionResult,
    current: TranscriptionResult,
    next: TranscriptionResult,
    pattern: SpeechPattern
  ): {confidence: number; indicators: SpeechIndicator[]; severity: number} | null {
    const prevToCurrentGap = current.timestamp - prev.timestamp

    // Look for unusual patterns in speech flow
    let confidence = 0
    let severity = 0
    const indicators: SpeechIndicator[] = []

    // Check for abnormal timing patterns
    const expectedTiming =
      pattern.averagePace > 0
        ? (60000 / pattern.averagePace) * current.text.split(' ').length
        : 1000
    const timingDeviation = Math.abs(prevToCurrentGap - expectedTiming) / expectedTiming

    if (timingDeviation > 0.5) {
      confidence += 0.3
      severity += timingDeviation
    }

    // Check for incomplete sentences or thoughts
    if (this.isIncompleteThought(current.text)) {
      confidence += 0.4
      severity += 1
      indicators.push({
        type: 'incomplete_sentence',
        confidence: 0.8,
        expectedContent: this.predictContinuation(current.text),
        linguisticContext: 'sentence_completion'
      })
    }

    // Check for partial words
    if (this.hasPartialWords(current.text)) {
      confidence += 0.3
      indicators.push({
        type: 'partial_word',
        confidence: 0.9,
        linguisticContext: 'word_completion'
      })
    }

    return confidence > 0.6 ? {confidence: Math.min(confidence, 1), indicators, severity} : null
  }

  /**
   * Detect audio alignment issues using heuristics
   */
  private detectAudioAlignmentIssues(
    previous: TranscriptionResult,
    current: TranscriptionResult
  ): Array<{timestamp: number; type: string; confidence: number; duration?: number}> {
    const issues = []
    const timeDiff = current.timestamp - previous.timestamp

    // Issue 1: Abrupt confidence drops
    if ((previous.confidence || 1) > 0.8 && (current.confidence || 1) < 0.5) {
      issues.push({
        timestamp: previous.timestamp,
        type: 'confidence_drop',
        confidence: 0.8,
        duration: timeDiff
      })
    }

    // Issue 2: Unusual text length variations
    const expectedLength = this.estimateExpectedTextLength(previous, timeDiff)
    const actualLength = current.text.length
    const lengthRatio = actualLength / Math.max(expectedLength, 1)

    if (lengthRatio < 0.3) {
      issues.push({
        timestamp: current.timestamp,
        type: 'text_length_anomaly',
        confidence: Math.min((1 - lengthRatio) * 1.5, 1),
        duration: timeDiff
      })
    }

    // Issue 3: Speech coherence breaks
    const coherenceScore = this.calculateSpeechCoherence(previous.text, current.text)
    if (coherenceScore < 0.4) {
      issues.push({
        timestamp: (previous.timestamp + current.timestamp) / 2,
        type: 'coherence_break',
        confidence: 1 - coherenceScore,
        duration: timeDiff / 2
      })
    }

    return issues
  }

  /**
   * Generate speech indicators for expected content
   */
  private generateSpeechIndicators(
    contextBefore: TranscriptionResult,
    contextAfter: TranscriptionResult
  ): SpeechIndicator[] {
    const indicators: SpeechIndicator[] = []

    // Check for incomplete sentences
    if (this.isIncompleteThought(contextBefore.text)) {
      indicators.push({
        type: 'expected_continuation',
        confidence: 0.8,
        expectedContent: this.predictContinuation(contextBefore.text),
        linguisticContext: 'sentence_completion'
      })
    }

    // Check for speech pattern expectations
    const expectedPattern = this.analyzeExpectedSpeechPattern(contextBefore, contextAfter)
    if (expectedPattern) {
      indicators.push({
        type: 'speech_pattern',
        confidence: 0.7,
        linguisticContext: 'pattern_continuation'
      })
    }

    return indicators
  }

  /**
   * Generate recovery recommendations based on gap type
   */
  private generateRecoveryRecommendations(gapType: string, severity: number): string[] {
    const recommendations: string[] = []

    switch (gapType) {
      case 'timestamp_gap':
        recommendations.push('Retry transcription for the gap period')
        recommendations.push('Check audio buffer for missing segments')
        if (severity > 5000) {
          recommendations.push('Consider manual review of audio')
        }
        break

      case 'speech_pattern':
        recommendations.push('Analyze context for speech continuation')
        recommendations.push('Apply linguistic completion heuristics')
        if (severity > 1) {
          recommendations.push('Request user confirmation for gap content')
        }
        break

      case 'audio_alignment':
        recommendations.push('Re-process audio segment with different parameters')
        recommendations.push('Check for audio quality issues in the segment')
        recommendations.push('Apply noise reduction if needed')
        break

      default:
        recommendations.push('Generic gap recovery procedure')
        recommendations.push('Manual review recommended')
    }

    return recommendations
  }

  /**
   * Validate detected gaps to reduce false positives
   */
  private async validateDetectedGaps(gaps: DetectedGap[]): Promise<DetectedGap[]> {
    const validatedGaps: DetectedGap[] = []

    for (const gap of gaps) {
      let validationScore = gap.confidence

      // Validation 1: Cross-reference with other detection methods
      const similarGaps = gaps.filter(
        g => g.id !== gap.id && Math.abs(g.startTimestamp - gap.startTimestamp) < 1000
      )

      if (similarGaps.length > 0) {
        validationScore += 0.2 // Multiple methods detected similar gap
      }

      // Validation 2: Historical pattern matching
      const historicalMatch = this.matchHistoricalPatterns(gap)
      validationScore *= historicalMatch

      // Validation 3: Duration reasonableness
      if (gap.durationMs < this.config.minimumGapDurationMs * 0.5) {
        validationScore *= 0.6 // Penalize very short gaps
      }

      // Final confidence threshold
      if (validationScore > 0.7) {
        gap.confidence = validationScore
        validatedGaps.push(gap)
      }
    }

    return validatedGaps
  }

  // Helper methods for analysis

  private updateSpeechPatternAnalysis(): void {
    if (this.transcriptionHistory.length >= this.config.speechAnalysisWindowSize) {
      const recentTranscriptions = this.transcriptionHistory.slice(
        -this.config.speechAnalysisWindowSize
      )
      this.currentSpeechPattern = this.analyzeSpeechPattern(recentTranscriptions)

      this.emit('speechPatternChanged', this.currentSpeechPattern)
    }
  }

  private analyzeTextContext(prev: TranscriptionResult, current: TranscriptionResult): number {
    // Analyze semantic continuity between transcriptions
    const prevWords = prev.text.trim().split(/\s+/)
    const currentWords = current.text.trim().split(/\s+/)

    if (prevWords.length === 0 || currentWords.length === 0) return 0

    // Check for sentence boundaries
    const endsWithPunctuation = /[.!?]$/.test(prev.text.trim())
    const startsWithCapital = /^[A-Z]/.test(current.text.trim())

    if (endsWithPunctuation && startsWithCapital) {
      return 0.2 // Natural sentence boundary
    }

    // Check for incomplete thoughts
    if (this.isIncompleteThought(prev.text) || this.hasPartialWords(prev.text)) {
      return 0.8 // Likely missing content
    }

    return 0.4 // Moderate probability of missing content
  }

  private evaluatePatternConsistency(timeDiff: number): number {
    if (!this.currentSpeechPattern) return 0

    // Compare against established rhythm
    const expectedTiming = 60000 / this.currentSpeechPattern.averagePace
    const deviation = Math.abs(timeDiff - expectedTiming) / expectedTiming

    return Math.max(0, 1 - deviation)
  }

  private evaluateHistoricalPatterns(timeDiff: number): number {
    // Analyze against previously detected gaps
    const historicalGaps = Array.from(this.detectedGaps.values())

    if (historicalGaps.length === 0) return 0.5

    const similarGaps = historicalGaps.filter(gap => Math.abs(gap.durationMs - timeDiff) < 1000)

    return Math.min(similarGaps.length / historicalGaps.length, 1)
  }

  private calculateRhythmConsistency(timeDiffs: number[]): number {
    if (timeDiffs.length < 2) return 1

    const mean = timeDiffs.reduce((a, b) => a + b) / timeDiffs.length
    const variance =
      timeDiffs.reduce((sum, diff) => sum + Math.pow(diff - mean, 2), 0) / timeDiffs.length
    const stdDev = Math.sqrt(variance)

    // Normalize by mean to get coefficient of variation
    const cv = stdDev / mean

    // Convert to consistency score (0-1, higher is more consistent)
    return Math.max(0, 1 - cv)
  }

  private detectPausePatterns(timeDiffs: number[]): PausePattern[] {
    const patterns: PausePattern[] = []

    timeDiffs.forEach(diff => {
      let type: PausePattern['type'] = 'natural'
      let confidence = 0.5

      if (diff > this.config.maxSilenceDurationMs) {
        type = 'unnatural'
        confidence = 0.8
      } else if (diff < 100) {
        type = 'interruption'
        confidence = 0.7
      }

      patterns.push({
        durationMs: diff,
        type,
        confidence
      })
    })

    return patterns
  }

  private createFrequencyProfile(transcriptions: TranscriptionResult[]): FrequencyProfile {
    // Simulate frequency analysis based on text characteristics
    const avgConfidence =
      transcriptions.reduce((sum, t) => sum + (t.confidence || 0.5), 0) / transcriptions.length

    return {
      dominantRanges: [
        {minHz: 300, maxHz: 3400, energy: avgConfidence},
        {minHz: 3400, maxHz: 8000, energy: avgConfidence * 0.7}
      ],
      speechEnergy: avgConfidence,
      noiseLevel: 1 - avgConfidence
    }
  }

  private isIncompleteThought(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) return false

    // Check for incomplete sentences
    const endsWithPunctuation = /[.!?]$/.test(trimmed)
    const hasConjunction = /\b(and|but|or|because|since|when|while|if)\s*$/.test(trimmed)
    const hasPreposition = /\b(in|on|at|by|for|with|about)\s*$/.test(trimmed)

    return !endsWithPunctuation || hasConjunction || hasPreposition
  }

  private hasPartialWords(text: string): boolean {
    const words = text.trim().split(/\s+/)
    const lastWord = words[words.length - 1]

    // Check for truncated words (very short or unusual patterns)
    if (
      lastWord &&
      lastWord.length < 3 &&
      !/^(a|I|is|to|in|on|at|of|up|we|he|it)$/.test(lastWord)
    ) {
      return true
    }

    return false
  }

  private predictContinuation(text: string): string {
    // Simple prediction based on common patterns
    const trimmed = text.trim()

    if (trimmed.endsWith(' and')) return '... [continuation expected]'
    if (trimmed.endsWith(' but')) return '... [contrast expected]'
    if (trimmed.endsWith(' because')) return '... [reason expected]'
    if (trimmed.endsWith(' when')) return '... [time context expected]'

    return '... [completion expected]'
  }

  private analyzeExpectedSpeechPattern(
    before: TranscriptionResult,
    after: TranscriptionResult
  ): boolean {
    // Analyze if the gap between before and after suggests missing speech
    const timeDiff = after.timestamp - before.timestamp
    const textContextScore = this.analyzeTextContext(before, after)

    return timeDiff > this.config.minimumGapDurationMs && textContextScore > 0.6
  }

  private analyzeExpectedContinuation(prev: TranscriptionResult): SpeechIndicator[] {
    const indicators: SpeechIndicator[] = []

    // Analyze linguistic context for expected continuation
    if (this.isIncompleteThought(prev.text)) {
      indicators.push({
        type: 'expected_continuation',
        confidence: 0.85,
        expectedContent: this.predictContinuation(prev.text),
        linguisticContext: 'incomplete_sentence'
      })
    }

    return indicators
  }

  private calculateBasicAlignment(prev: TranscriptionResult, current: TranscriptionResult): number {
    const timeDiff = current.timestamp - prev.timestamp
    const textLength = current.text.length

    // Basic heuristic: alignment score based on text density per time
    const density = textLength / Math.max(timeDiff, 1)

    // Normalize against expected speech density (rough approximation)
    const expectedDensity = 0.01 // ~1 character per 100ms

    return Math.min(density / expectedDensity, 1)
  }

  private calculateDetailedAlignment(
    prev: TranscriptionResult,
    current: TranscriptionResult
  ): number {
    let score = this.calculateBasicAlignment(prev, current)

    // Adjust for confidence levels
    const avgConfidence = ((prev.confidence || 0.5) + (current.confidence || 0.5)) / 2
    score *= avgConfidence

    // Adjust for text coherence
    const coherence = this.calculateSpeechCoherence(prev.text, current.text)
    score *= (coherence + 1) / 2 // Normalize to 0.5-1 range

    return score
  }

  private estimateExpectedTextLength(previous: TranscriptionResult, timeDiff: number): number {
    // Estimate based on speaking rate and time difference
    const avgWordsPerMs = 0.002 // ~120 words per minute
    const expectedWords = timeDiff * avgWordsPerMs

    return expectedWords * 5 // ~5 characters per word
  }

  private calculateSpeechCoherence(prevText: string, currentText: string): number {
    // Simple coherence analysis based on word overlap and context
    const prevWords = new Set(prevText.toLowerCase().split(/\s+/))
    const currentWords = new Set(currentText.toLowerCase().split(/\s+/))

    // Calculate Jaccard similarity
    const intersection = new Set([...prevWords].filter(x => currentWords.has(x)))
    const union = new Set([...prevWords, ...currentWords])

    const jaccard = intersection.size / union.size

    // Adjust for typical speech patterns
    return Math.min(jaccard * 2, 1)
  }

  private matchHistoricalPatterns(gap: DetectedGap): number {
    const historicalGaps = Array.from(this.detectedGaps.values())

    if (historicalGaps.length === 0) return 1

    // Look for similar patterns in historical data
    const similarGaps = historicalGaps.filter(
      historical =>
        historical.gapType === gap.gapType &&
        Math.abs(historical.durationMs - gap.durationMs) < gap.durationMs * 0.3
    )

    // Return confidence modifier based on historical accuracy
    return similarGaps.length > 0 ? 1.1 : 0.9
  }

  /**
   * Update statistics after analysis
   */
  private updateStatistics(gaps: DetectedGap[], analysisStartTime: number): void {
    const analysisTime = Date.now() - analysisStartTime
    this.analysisTimes.push(analysisTime)

    this.stats.totalGapsDetected += gaps.length
    this.stats.totalAnalysisTime += analysisTime
    this.stats.lastAnalysisTimestamp = Date.now()
    this.stats.performanceMetrics.totalTranscriptsAnalyzed++

    // Update gaps by type
    gaps.forEach(gap => {
      this.stats.gapsByType[gap.gapType] = (this.stats.gapsByType[gap.gapType] || 0) + 1
      this.gapDurations.push(gap.durationMs)
      this.confidenceScores.push(gap.confidence)
    })

    // Update averages
    if (this.gapDurations.length > 0) {
      this.stats.averageGapDuration =
        this.gapDurations.reduce((a, b) => a + b) / this.gapDurations.length
    }

    if (this.confidenceScores.length > 0) {
      this.stats.averageConfidence =
        this.confidenceScores.reduce((a, b) => a + b) / this.confidenceScores.length
    }

    if (this.analysisTimes.length > 0) {
      this.stats.performanceMetrics.averageAnalysisTime =
        this.analysisTimes.reduce((a, b) => a + b) / this.analysisTimes.length
      this.stats.performanceMetrics.peakAnalysisTime = Math.max(...this.analysisTimes)
    }

    // Estimate false positives (simple heuristic)
    this.stats.estimatedFalsePositives = Math.floor(
      this.stats.totalGapsDetected * (1 - this.stats.averageConfidence)
    )

    // Keep arrays manageable
    if (this.gapDurations.length > 100) {
      this.gapDurations = this.gapDurations.slice(-100)
    }
    if (this.confidenceScores.length > 100) {
      this.confidenceScores = this.confidenceScores.slice(-100)
    }
    if (this.analysisTimes.length > 50) {
      this.analysisTimes = this.analysisTimes.slice(-50)
    }
  }

  /**
   * Public API methods
   */

  /**
   * Get current detection statistics
   */
  public getStatistics(): GapDetectionStats {
    return {...this.stats}
  }

  /**
   * Get all detected gaps
   */
  public getDetectedGaps(): DetectedGap[] {
    return Array.from(this.detectedGaps.values())
  }

  /**
   * Get gaps by type
   */
  public getGapsByType(gapType: DetectedGap['gapType']): DetectedGap[] {
    return Array.from(this.detectedGaps.values()).filter(gap => gap.gapType === gapType)
  }

  /**
   * Clear detected gaps history
   */
  public clearGapsHistory(): void {
    this.detectedGaps.clear()
    this.stats.totalGapsDetected = 0
    this.stats.gapsByType = {}

    logger.info('GapDetector: Cleared gaps history')
  }

  /**
   * Update detector configuration
   */
  public updateConfig(updates: Partial<GapDetectionConfig>): void {
    this.config = {...this.config, ...updates}
    this.adjustConfigForSensitivity()

    logger.info('GapDetector: Configuration updated', {
      detectionSensitivity: this.config.detectionSensitivity,
      minimumGapDurationMs: this.config.minimumGapDurationMs
    })
  }

  /**
   * Get current configuration
   */
  public getConfig(): GapDetectionConfig {
    return {...this.config}
  }

  /**
   * Check if analysis is currently in progress
   */
  public isAnalyzing(): boolean {
    return this.analysisInProgress
  }

  /**
   * Get current speech pattern
   */
  public getCurrentSpeechPattern(): SpeechPattern | null {
    return this.currentSpeechPattern
  }

  /**
   * Reset all internal state
   */
  public reset(): void {
    this.transcriptionHistory = []
    this.speechPatternHistory = []
    this.detectedGaps.clear()
    this.currentSpeechPattern = null
    this.lastAnalysisTimestamp = 0
    this.analysisInProgress = false

    // Reset statistics
    this.stats = {
      totalGapsDetected: 0,
      gapsByType: {},
      averageGapDuration: 0,
      totalAnalysisTime: 0,
      averageConfidence: 0,
      estimatedFalsePositives: 0,
      lastAnalysisTimestamp: 0,
      performanceMetrics: {
        averageAnalysisTime: 0,
        peakAnalysisTime: 0,
        totalTranscriptsAnalyzed: 0
      }
    }

    this.gapDurations = []
    this.confidenceScores = []
    this.analysisTimes = []

    logger.info('GapDetector: Reset completed')
  }
}

export {GapDetector}
