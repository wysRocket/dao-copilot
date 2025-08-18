/**
 * ConfidenceTypes - Type definitions for Confidence-Based Selection System
 *
 * Defines comprehensive types for evaluating and selecting between competing
 * transcript versions based on confidence scores, linguistic consistency,
 * and multiple quality metrics for optimal transcription accuracy.
 */

import {TranscriptSegment} from './HashTypes'

// ================================================================
// Core Confidence Types
// ================================================================

/**
 * Different sources of confidence scores
 */
export type ConfidenceSource =
  | 'speech_recognition' // ASR engine confidence
  | 'language_model' // LM confidence in text
  | 'acoustic_model' // Acoustic confidence
  | 'linguistic_analysis' // Grammar/consistency confidence
  | 'temporal_consistency' // Time alignment confidence
  | 'speaker_consistency' // Speaker identification confidence
  | 'context_coherence' // Contextual coherence confidence
  | 'composite' // Combined confidence score

/**
 * Granularity levels for confidence evaluation
 */
export type ConfidenceGranularity =
  | 'segment' // Entire transcript segment
  | 'sentence' // Individual sentences
  | 'phrase' // Phrase-level chunks
  | 'word' // Individual words
  | 'phoneme' // Phoneme-level (most granular)

/**
 * Quality factors used in confidence evaluation
 */
export type QualityFactor =
  | 'audio_quality' // Audio signal quality
  | 'speech_clarity' // Speaker clarity
  | 'background_noise' // Noise levels
  | 'speaking_rate' // Speech rate consistency
  | 'linguistic_fluency' // Language fluency
  | 'vocabulary_complexity' // Word complexity
  | 'context_consistency' // Contextual coherence
  | 'temporal_alignment' // Time alignment accuracy

// ================================================================
// Confidence Data Structures
// ================================================================

/**
 * Detailed confidence information for a text unit
 */
export interface ConfidenceScore {
  readonly source: ConfidenceSource
  readonly granularity: ConfidenceGranularity
  readonly value: number // 0.0 to 1.0
  readonly computedAt: number

  // Score breakdown
  readonly rawScore: number // Original confidence before normalization
  readonly normalizedScore: number // Normalized to 0-1 range
  readonly adjustedScore: number // Adjusted based on quality factors

  // Metadata
  readonly qualityFactors: Map<QualityFactor, number>
  readonly reliability: number // How reliable is this confidence score
  readonly sampleSize?: number // Number of samples used to compute score
  readonly variance?: number // Score variance/uncertainty
}

/**
 * Confidence information for a word or phrase
 */
export interface WordConfidence {
  readonly text: string
  readonly startTime: number
  readonly endTime: number
  readonly position: number // Position within segment

  // Confidence scores
  readonly primaryConfidence: ConfidenceScore
  readonly alternativeConfidences: ConfidenceScore[]
  readonly compositeConfidence: number // Combined confidence

  // Linguistic analysis
  readonly partOfSpeech?: string
  readonly isOutOfVocabulary: boolean
  readonly phoneticTranscription?: string
  readonly alternativeTranscriptions: string[]

  // Context information
  readonly contextScore: number // How well it fits context
  readonly neighborInfluence: number // Influence of neighboring words
}

/**
 * Confidence information for a transcript segment
 */
export interface SegmentConfidence {
  readonly segment: TranscriptSegment
  readonly overallConfidence: number
  readonly confidenceSources: ConfidenceScore[]
  readonly wordConfidences: WordConfidence[]

  // Quality metrics
  readonly acousticQuality: number
  readonly linguisticCoherence: number
  readonly temporalConsistency: number
  readonly speakerConsistency: number

  // Statistical measures
  readonly averageWordConfidence: number
  readonly confidenceVariance: number
  readonly lowConfidenceWordCount: number
  readonly highConfidenceWordCount: number

  // Metadata
  readonly analysisTimestamp: number
  readonly analysisVersion: string
}

/**
 * Comparison between two competing segment versions
 */
export interface ConfidenceComparison {
  readonly segmentA: SegmentConfidence
  readonly segmentB: SegmentConfidence
  readonly comparisonId: string
  readonly comparedAt: number

  // Overall comparison
  readonly overallWinner: 'A' | 'B' | 'tie'
  readonly confidenceDifference: number
  readonly recommendedChoice: 'A' | 'B' | 'merge' | 'manual_review'

  // Detailed analysis
  readonly factorAnalysis: Map<QualityFactor, ConfidenceFactorComparison>
  readonly wordLevelComparisons: WordLevelComparison[]
  readonly linguisticAnalysis: LinguisticConsistencyAnalysis

  // Decision support
  readonly decisionConfidence: number
  readonly riskAssessment: ConfidenceRiskAssessment
  readonly alternativeRecommendations: string[]
}

/**
 * Factor-specific comparison between segments
 */
export interface ConfidenceFactorComparison {
  readonly factor: QualityFactor
  readonly scoreA: number
  readonly scoreB: number
  readonly winner: 'A' | 'B' | 'tie'
  readonly significance: number // How significant is the difference
  readonly weight: number // Factor weight in overall decision
  readonly explanation: string
}

/**
 * Word-level comparison between competing versions
 */
export interface WordLevelComparison {
  readonly position: number
  readonly wordA?: WordConfidence
  readonly wordB?: WordConfidence
  readonly comparisonResult: 'A_better' | 'B_better' | 'equivalent' | 'both_poor'
  readonly confidenceDelta: number
  readonly contextualFit: 'A_better' | 'B_better' | 'equivalent'
  readonly recommendedChoice: string // The actual word/phrase to use
}

/**
 * Linguistic consistency analysis for transcript quality
 */
export interface LinguisticConsistencyAnalysis {
  readonly grammarScore: number
  readonly vocabularyConsistency: number
  readonly semanticCoherence: number
  readonly syntacticCorrectness: number
  readonly discourseCoherence: number

  // Specific issues detected
  readonly grammarIssues: GrammarIssue[]
  readonly vocabularyIssues: VocabularyIssue[]
  readonly coherenceBreaks: CoherenceBreak[]

  // Overall assessment
  readonly overallLinguisticScore: number
  readonly linguisticQualityRating: 'poor' | 'fair' | 'good' | 'excellent'
}

/**
 * Grammar issue detection
 */
export interface GrammarIssue {
  readonly type:
    | 'subject_verb_disagreement'
    | 'tense_inconsistency'
    | 'article_error'
    | 'word_order'
    | 'other'
  readonly position: number
  readonly problematicText: string
  readonly suggestion?: string
  readonly confidence: number
  readonly severity: 'low' | 'medium' | 'high'
}

/**
 * Vocabulary consistency issue
 */
export interface VocabularyIssue {
  readonly type:
    | 'out_of_vocabulary'
    | 'domain_mismatch'
    | 'formality_inconsistency'
    | 'repetition_error'
  readonly position: number
  readonly word: string
  readonly expectedWord?: string
  readonly confidence: number
  readonly contextScore: number
}

/**
 * Coherence break in discourse
 */
export interface CoherenceBreak {
  readonly type:
    | 'topic_shift'
    | 'logical_inconsistency'
    | 'reference_error'
    | 'temporal_inconsistency'
  readonly position: number
  readonly description: string
  readonly severity: 'minor' | 'moderate' | 'major'
  readonly suggestedFix?: string
}

// ================================================================
// Selection Algorithm Types
// ================================================================

/**
 * Configuration for confidence-based selection
 */
export interface ConfidenceSelectorConfig {
  // Selection thresholds
  readonly thresholds: {
    readonly minAcceptableConfidence: number // Minimum confidence to accept
    readonly significantDifferenceThreshold: number // Minimum difference to prefer one over another
    readonly highConfidenceThreshold: number // Threshold for high confidence
    readonly lowConfidenceThreshold: number // Threshold for low confidence
    readonly manualReviewThreshold: number // When to flag for manual review
  }

  // Factor weights
  readonly factorWeights: {
    readonly overallConfidence: number
    readonly acousticQuality: number
    readonly linguisticCoherence: number
    readonly temporalConsistency: number
    readonly speakerConsistency: number
    readonly contextCoherence: number
  }

  // Word-level analysis
  readonly wordAnalysis: {
    readonly enableWordLevelComparison: boolean
    readonly wordConfidenceWeight: number
    readonly contextualFitWeight: number
    readonly oovPenalty: number // Out-of-vocabulary penalty
    readonly neighborInfluenceRadius: number // How many neighboring words to consider
  }

  // Linguistic analysis
  readonly linguisticAnalysis: {
    readonly enableGrammarChecking: boolean
    readonly enableVocabularyConsistency: boolean
    readonly enableCoherenceAnalysis: boolean
    readonly grammarWeight: number
    readonly vocabularyWeight: number
    readonly coherenceWeight: number
  }

  // Performance settings
  readonly performance: {
    readonly maxConcurrentComparisons: number
    readonly analysisTimeoutMs: number
    readonly enableCaching: boolean
    readonly cacheExpirationMs: number
    readonly enableBatchProcessing: boolean
    readonly batchSize: number
  }

  // Integration settings
  readonly integration: {
    readonly emitDetailedEvents: boolean
    readonly logAllDecisions: boolean
    readonly preserveAlternatives: boolean
    readonly enableRollback: boolean
  }
}

/**
 * Result of confidence-based selection
 */
export interface ConfidenceSelectionResult {
  readonly candidates: SegmentConfidence[]
  readonly selectedSegment: SegmentConfidence
  readonly alternativeSegments: SegmentConfidence[]
  readonly selectionReason: string

  // Analysis details
  readonly comparison: ConfidenceComparison
  readonly selectionConfidence: number
  readonly qualityScore: number
  readonly riskLevel: 'low' | 'medium' | 'high'

  // Metadata
  readonly selectionId: string
  readonly selectedAt: number
  readonly processingTimeMs: number
  readonly analysisVersion: string

  // Decision support
  readonly alternativeRecommendations: AlternativeRecommendation[]
  readonly qualityWarnings: QualityWarning[]
  readonly improvementSuggestions: string[]
}

/**
 * Alternative recommendation for selection
 */
export interface AlternativeRecommendation {
  readonly segment: SegmentConfidence
  readonly reason: string
  readonly confidence: number
  readonly tradeoffs: string[]
  readonly useCase: string // When this alternative might be better
}

/**
 * Quality warning for selected content
 */
export interface QualityWarning {
  readonly type:
    | 'low_confidence'
    | 'inconsistent_audio'
    | 'grammar_issues'
    | 'vocabulary_issues'
    | 'coherence_issues'
  readonly severity: 'low' | 'medium' | 'high'
  readonly description: string
  readonly affectedRange?: {start: number; end: number}
  readonly suggestedAction: string
}

/**
 * Risk assessment for confidence selection
 */
export interface ConfidenceRiskAssessment {
  readonly overallRisk: 'low' | 'medium' | 'high'
  readonly specificRisks: ConfidenceRisk[]
  readonly mitigationStrategies: string[]
  readonly confidenceInAssessment: number
}

/**
 * Specific risk in confidence-based selection
 */
export interface ConfidenceRisk {
  readonly type:
    | 'low_confidence_selection'
    | 'audio_quality_degradation'
    | 'linguistic_inconsistency'
    | 'context_mismatch'
  readonly probability: number
  readonly impact: number
  readonly description: string
  readonly mitigation?: string
}

// ================================================================
// Performance and Statistics
// ================================================================

/**
 * Performance statistics for confidence selector
 */
export interface ConfidenceSelectorStats {
  readonly totalSelections: number
  readonly averageSelectionTimeMs: number
  readonly peakSelectionTimeMs: number

  // Selection outcomes
  readonly selectionBreakdown: Map<string, number> // Reason -> count
  readonly averageConfidenceImprovement: number
  readonly qualityImprovementRate: number

  // Accuracy metrics
  readonly selectionAccuracy: number // When ground truth is available
  readonly falsePositiveRate: number
  readonly falseNegativeRate: number

  // Quality metrics
  readonly averageSelectedConfidence: number
  readonly averageRejectedConfidence: number
  readonly linguisticImprovementScore: number

  // System performance
  readonly memoryUsageBytes: number
  readonly cacheHitRate: number
  readonly concurrentSelectionsHandled: number
}

/**
 * Detailed performance metrics for monitoring
 */
export interface ConfidencePerformanceMetrics {
  readonly timestamp: number
  readonly operation: 'selection' | 'comparison' | 'linguistic_analysis' | 'quality_assessment'
  readonly duration: number
  readonly inputSize: number
  readonly outputQuality: number
  readonly memoryDelta: number
  readonly success: boolean
  readonly errorType?: string
  readonly metadata?: Record<string, unknown>
}

// ================================================================
// Event System Types
// ================================================================

/**
 * Events emitted by ConfidenceSelector
 */
export interface ConfidenceSelectorEvents {
  'selection:completed': (result: ConfidenceSelectionResult) => void
  'comparison:analyzed': (comparison: ConfidenceComparison) => void
  'quality:warning': (warning: QualityWarning, segmentId: string) => void
  'linguistic:analysis': (analysis: LinguisticConsistencyAnalysis, segmentId: string) => void
  'confidence:low': (segment: SegmentConfidence, confidence: number) => void
  'performance:stats': (stats: ConfidenceSelectorStats) => void
  error: (error: Error, context: string) => void
  warning: (message: string, context: string) => void
}

// ================================================================
// Batch Processing Types
// ================================================================

/**
 * Batch selection request
 */
export interface BatchSelectionRequest {
  readonly candidates: SegmentConfidence[][] // Array of candidate arrays
  readonly options?: ConfidenceSelectionOptions
  readonly priorityOrder?: number[] // Priority order for processing
  readonly timeoutMs?: number
}

/**
 * Batch selection result
 */
export interface BatchSelectionResult {
  readonly total: number
  readonly processed: number
  readonly successful: number
  readonly failed: number
  readonly results: ConfidenceSelectionResult[]
  readonly errors: Array<{index: number; error: Error}>
  readonly processingTimeMs: number
  readonly averageQualityImprovement: number
}

/**
 * Options for confidence selection
 */
export interface ConfidenceSelectionOptions {
  readonly enableWordLevelAnalysis?: boolean
  readonly enableLinguisticAnalysis?: boolean
  readonly customThresholds?: Partial<ConfidenceSelectorConfig['thresholds']>
  readonly customWeights?: Partial<ConfidenceSelectorConfig['factorWeights']>
  readonly timeoutMs?: number
  readonly preserveAll?: boolean // Keep all alternatives
  readonly requireMinimumConfidence?: number
}

// ================================================================
// Default Configurations
// ================================================================

/**
 * Default configuration for confidence selector
 */
export const DEFAULT_CONFIDENCE_SELECTOR_CONFIG: ConfidenceSelectorConfig = {
  thresholds: {
    minAcceptableConfidence: 0.3, // 30% minimum confidence
    significantDifferenceThreshold: 0.1, // 10% difference needed
    highConfidenceThreshold: 0.8, // 80% is high confidence
    lowConfidenceThreshold: 0.4, // 40% is low confidence
    manualReviewThreshold: 0.2 // Below 20% needs review
  },

  factorWeights: {
    overallConfidence: 0.35, // 35% weight on overall confidence
    acousticQuality: 0.2, // 20% weight on audio quality
    linguisticCoherence: 0.25, // 25% weight on linguistic quality
    temporalConsistency: 0.1, // 10% weight on timing
    speakerConsistency: 0.05, // 5% weight on speaker consistency
    contextCoherence: 0.05 // 5% weight on context
  },

  wordAnalysis: {
    enableWordLevelComparison: true,
    wordConfidenceWeight: 0.6, // 60% weight on word confidence
    contextualFitWeight: 0.4, // 40% weight on contextual fit
    oovPenalty: 0.2, // 20% penalty for out-of-vocabulary
    neighborInfluenceRadius: 2 // Consider 2 words on each side
  },

  linguisticAnalysis: {
    enableGrammarChecking: true,
    enableVocabularyConsistency: true,
    enableCoherenceAnalysis: true,
    grammarWeight: 0.4, // 40% weight on grammar
    vocabularyWeight: 0.3, // 30% weight on vocabulary
    coherenceWeight: 0.3 // 30% weight on coherence
  },

  performance: {
    maxConcurrentComparisons: 3,
    analysisTimeoutMs: 10000, // 10 second timeout
    enableCaching: true,
    cacheExpirationMs: 300000, // 5 minute cache expiry
    enableBatchProcessing: true,
    batchSize: 5
  },

  integration: {
    emitDetailedEvents: false,
    logAllDecisions: false,
    preserveAlternatives: true,
    enableRollback: true
  }
}

// ================================================================
// Utility Types
// ================================================================

/**
 * Helper type for confidence score validation
 */
export interface ConfidenceValidationResult {
  readonly isValid: boolean
  readonly normalizedScore: number
  readonly validationErrors: string[]
  readonly suggestions: string[]
}

/**
 * Helper type for linguistic pattern matching
 */
export interface LinguisticPattern {
  readonly pattern: RegExp
  readonly type: 'grammar' | 'vocabulary' | 'coherence'
  readonly severity: 'low' | 'medium' | 'high'
  readonly description: string
  readonly suggestion?: string
}

/**
 * Context information for confidence evaluation
 */
export interface ConfidenceContext {
  readonly previousSegments: TranscriptSegment[]
  readonly followingSegments: TranscriptSegment[]
  readonly conversationContext: string
  readonly domainContext: string
  readonly speakerContext: {
    readonly speakerId?: string
    readonly speakerProfile?: Record<string, unknown>
  }
}
