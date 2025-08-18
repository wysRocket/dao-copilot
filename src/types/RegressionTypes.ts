/**
 * RegressionTypes - Type definitions for Content Regression Handling
 *
 * Defines types for handling cases where shorter/revised content arrives
 * after longer content has been processed. Critical for real-time
 * transcription accuracy where corrections and revisions are common.
 */

import {ContentHash, TranscriptSegment} from './HashTypes'

// ================================================================
// Core Regression Types
// ================================================================

/**
 * Represents different types of content regressions detected
 */
export type RegressionType =
  | 'length_reduction' // New content is significantly shorter
  | 'quality_improvement' // New content has higher confidence
  | 'correction' // New content appears to be a correction
  | 'stuttering_fix' // Removed stuttering or repetition
  | 'punctuation_fix' // Punctuation or formatting correction
  | 'word_replacement' // Single or few word replacements
  | 'false_positive' // Regression detection was incorrect

/**
 * Severity levels for regression decisions
 */
export type RegressionSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Action to take when regression is detected
 */
export type RegressionAction =
  | 'keep_original' // Keep the longer/original content
  | 'accept_revision' // Accept the new shorter content
  | 'merge_contents' // Attempt to merge both versions
  | 'flag_for_review' // Mark for manual review
  | 'create_alternative' // Keep both as alternatives

// ================================================================
// Content Regression Data Structures
// ================================================================

/**
 * Represents a detected content regression
 */
export interface ContentRegression {
  readonly id: string
  readonly type: RegressionType
  readonly severity: RegressionSeverity
  readonly originalContent: TranscriptSegment
  readonly revisedContent: TranscriptSegment
  readonly detectedAt: number
  readonly confidence: number

  // Analysis details
  readonly lengthDifference: number
  readonly confidenceDifference: number
  readonly temporalDistance: number
  readonly similarityScore: number

  // Decision metadata
  readonly recommendedAction: RegressionAction
  readonly decisionFactors: RegressionDecisionFactor[]
  readonly alternativeActions: RegressionAction[]
}

/**
 * Factors that influence regression handling decisions
 */
export interface RegressionDecisionFactor {
  readonly factor: string
  readonly value: number
  readonly weight: number
  readonly impact: 'positive' | 'negative' | 'neutral'
  readonly description: string
}

/**
 * Represents the outcome of a regression handling decision
 */
export interface RegressionDecision {
  readonly regressionId: string
  readonly action: RegressionAction
  readonly decidedAt: number
  readonly confidence: number

  // Result details
  readonly finalContent: TranscriptSegment
  readonly alternativeContent?: TranscriptSegment
  readonly appliedChanges: RegressionChange[]
  readonly preservedElements: string[]

  // Decision tracking
  readonly decisionReasoning: string
  readonly automaticallyDecided: boolean
  readonly reviewRequired: boolean
}

/**
 * Represents a specific change applied during regression handling
 */
export interface RegressionChange {
  readonly changeType: 'replacement' | 'deletion' | 'insertion' | 'merge'
  readonly position: number
  readonly originalText: string
  readonly newText: string
  readonly confidence: number
  readonly reason: string
}

// ================================================================
// Regression Analysis Types
// ================================================================

/**
 * Configuration for regression analysis algorithms
 */
export interface RegressionAnalysisConfig {
  // Length analysis
  readonly lengthAnalysis: {
    readonly minReductionThreshold: number // Minimum % reduction to consider
    readonly maxReductionThreshold: number // Maximum % reduction to accept
    readonly significantLengthDifference: number // Characters difference threshold
  }

  // Confidence analysis
  readonly confidenceAnalysis: {
    readonly minConfidenceGain: number // Minimum confidence improvement
    readonly confidenceWeight: number // Weight in decision making
    readonly lowConfidenceThreshold: number // Threshold for low confidence
    readonly highConfidenceThreshold: number // Threshold for high confidence
  }

  // Temporal analysis
  readonly temporalAnalysis: {
    readonly maxTimeGap: number // Max time between contents (ms)
    readonly recentBias: number // Bias toward more recent content
    readonly stalenessThreshold: number // Time after which content is stale
  }

  // Similarity analysis
  readonly similarityAnalysis: {
    readonly minSimilarityThreshold: number // Minimum similarity to consider related
    readonly exactMatchWeight: number // Weight for exact substring matches
    readonly positionWeight: number // Weight for preserved word positions
    readonly semanticWeight: number // Weight for semantic similarity
  }

  // Decision making
  readonly decisionMaking: {
    readonly autoDecisionThreshold: number // Confidence threshold for auto-decisions
    readonly conservativeBias: number // Bias toward keeping original content
    readonly qualityBias: number // Bias toward higher quality content
    readonly enableMerging: boolean // Enable content merging attempts
  }
}

/**
 * Results of regression analysis for a content pair
 */
export interface RegressionAnalysisResult {
  readonly originalSegment: TranscriptSegment
  readonly revisedSegment: TranscriptSegment
  readonly analysisId: string
  readonly analyzedAt: number

  // Analysis scores
  readonly lengthScore: number
  readonly confidenceScore: number
  readonly temporalScore: number
  readonly similarityScore: number
  readonly overallScore: number

  // Detected characteristics
  readonly regressionType: RegressionType
  readonly severity: RegressionSeverity
  readonly isLikelyCorrection: boolean
  readonly isStutteringRemoval: boolean
  readonly isPunctuationFix: boolean

  // Decision support
  readonly recommendedAction: RegressionAction
  readonly actionConfidence: number
  readonly decisionFactors: RegressionDecisionFactor[]
  readonly riskAssessment: RegressionRiskAssessment
}

/**
 * Risk assessment for regression handling decisions
 */
export interface RegressionRiskAssessment {
  readonly overallRisk: 'low' | 'medium' | 'high'
  readonly specificRisks: RegressionRisk[]
  readonly mitigationStrategies: string[]
  readonly reversibilityScore: number
  readonly dataLossRisk: number
}

/**
 * Specific risk identified in regression handling
 */
export interface RegressionRisk {
  readonly type: 'data_loss' | 'incorrect_correction' | 'quality_degradation' | 'context_loss'
  readonly probability: number
  readonly impact: number
  readonly description: string
  readonly mitigation?: string
}

// ================================================================
// Version History and Tracking
// ================================================================

/**
 * Represents a content version in the regression history
 */
export interface ContentVersion {
  readonly versionId: string
  readonly content: TranscriptSegment
  readonly versionNumber: number
  readonly createdAt: number
  readonly source: 'original' | 'revision' | 'merge' | 'correction'

  // Version metadata
  readonly parentVersionId?: string
  readonly regressionId?: string
  readonly qualityScore: number
  readonly isActive: boolean

  // Changes from previous version
  readonly changes: RegressionChange[]
  readonly changesSummary: string
  readonly improvementScore: number
}

/**
 * History tracking for a specific content segment
 */
export interface ContentVersionHistory {
  readonly segmentId: string
  readonly versions: Map<string, ContentVersion>
  readonly activeVersionId: string
  readonly createdAt: number
  readonly lastModifiedAt: number

  // History statistics
  readonly totalVersions: number
  readonly totalRegressions: number
  readonly averageQualityImprovement: number
  readonly stabilityScore: number // How often content changes
}

// ================================================================
// Regression Handler Configuration
// ================================================================

/**
 * Configuration for the ContentRegressionHandler
 */
export interface ContentRegressionHandlerConfig {
  readonly analysisConfig: RegressionAnalysisConfig

  // Processing options
  readonly processing: {
    readonly enabledRegressionTypes: Set<RegressionType>
    readonly maxConcurrentAnalyses: number
    readonly analysisTimeoutMs: number
    readonly enableBatchProcessing: boolean
    readonly batchSize: number
  }

  // History management
  readonly historyManagement: {
    readonly enableVersionHistory: boolean
    readonly maxVersionsPerSegment: number
    readonly historyCleanupIntervalMs: number
    readonly retentionDays: number
  }

  // Performance monitoring
  readonly performanceMonitoring: {
    readonly enabled: boolean
    readonly sampleRate: number
    readonly trackDetailedMetrics: boolean
    readonly maxStatsHistory: number
  }

  // Integration settings
  readonly integration: {
    readonly notifyOnHighSeverity: boolean
    readonly logAllDecisions: boolean
    readonly enableRollback: boolean
    readonly requireConfirmationForCritical: boolean
  }
}

// ================================================================
// Performance and Statistics
// ================================================================

/**
 * Performance statistics for regression handling
 */
export interface RegressionHandlerStats {
  readonly totalAnalyses: number
  readonly totalRegressions: number
  readonly averageAnalysisTimeMs: number
  readonly peakAnalysisTimeMs: number

  // Decision statistics
  readonly decisionBreakdown: Map<RegressionAction, number>
  readonly accuracyRate: number
  readonly falsePositiveRate: number
  readonly falseNegativeRate: number

  // Quality improvements
  readonly averageQualityImprovement: number
  readonly contentLengthSaved: number
  readonly confidenceImprovement: number

  // System performance
  readonly memoryUsageBytes: number
  readonly activeVersions: number
  readonly cleanupOperations: number
}

/**
 * Detailed metrics for performance monitoring
 */
export interface RegressionPerformanceMetrics {
  readonly timestamp: number
  readonly operation: 'analysis' | 'decision' | 'application' | 'cleanup'
  readonly duration: number
  readonly memoryDelta: number
  readonly success: boolean
  readonly errorType?: string
  readonly metadata?: Record<string, unknown>
}

// ================================================================
// Event System Types
// ================================================================

/**
 * Events emitted by ContentRegressionHandler
 */
export interface RegressionHandlerEvents {
  'regression:detected': (regression: ContentRegression) => void
  'regression:analyzed': (analysis: RegressionAnalysisResult) => void
  'regression:decided': (decision: RegressionDecision) => void
  'regression:applied': (segmentId: string, finalContent: TranscriptSegment) => void
  'version:created': (version: ContentVersion) => void
  'version:activated': (versionId: string, segmentId: string) => void
  'performance:stats': (stats: RegressionHandlerStats) => void
  error: (error: Error, context: string) => void
  warning: (message: string, context: string) => void
}

// ================================================================
// Default Configurations
// ================================================================

/**
 * Default configuration for regression analysis
 */
export const DEFAULT_REGRESSION_ANALYSIS_CONFIG: RegressionAnalysisConfig = {
  lengthAnalysis: {
    minReductionThreshold: 0.15, // 15% reduction minimum
    maxReductionThreshold: 0.8, // 80% reduction maximum
    significantLengthDifference: 10 // 10 characters
  },

  confidenceAnalysis: {
    minConfidenceGain: 0.1, // 10% confidence improvement
    confidenceWeight: 0.3, // 30% weight in decisions
    lowConfidenceThreshold: 0.5, // Below 50% is low
    highConfidenceThreshold: 0.8 // Above 80% is high
  },

  temporalAnalysis: {
    maxTimeGap: 30000, // 30 seconds maximum gap
    recentBias: 0.2, // 20% bias toward recent content
    stalenessThreshold: 60000 // 1 minute staleness threshold
  },

  similarityAnalysis: {
    minSimilarityThreshold: 0.4, // 40% minimum similarity
    exactMatchWeight: 0.4, // 40% weight for exact matches
    positionWeight: 0.3, // 30% weight for position preservation
    semanticWeight: 0.3 // 30% weight for semantic similarity
  },

  decisionMaking: {
    autoDecisionThreshold: 0.8, // 80% confidence for auto-decisions
    conservativeBias: 0.1, // 10% bias toward keeping original
    qualityBias: 0.2, // 20% bias toward higher quality
    enableMerging: true // Enable content merging
  }
}

/**
 * Default configuration for regression handler
 */
export const DEFAULT_REGRESSION_HANDLER_CONFIG: ContentRegressionHandlerConfig = {
  analysisConfig: DEFAULT_REGRESSION_ANALYSIS_CONFIG,

  processing: {
    enabledRegressionTypes: new Set([
      'length_reduction',
      'quality_improvement',
      'correction',
      'stuttering_fix',
      'punctuation_fix',
      'word_replacement'
    ]),
    maxConcurrentAnalyses: 5,
    analysisTimeoutMs: 5000, // 5 seconds timeout
    enableBatchProcessing: true,
    batchSize: 10
  },

  historyManagement: {
    enableVersionHistory: true,
    maxVersionsPerSegment: 5,
    historyCleanupIntervalMs: 300000, // 5 minutes
    retentionDays: 7 // Keep history for 1 week
  },

  performanceMonitoring: {
    enabled: true,
    sampleRate: 0.1, // Sample 10% of operations
    trackDetailedMetrics: false,
    maxStatsHistory: 1000
  },

  integration: {
    notifyOnHighSeverity: true,
    logAllDecisions: false,
    enableRollback: true,
    requireConfirmationForCritical: true
  }
}

// ================================================================
// Utility Types
// ================================================================

/**
 * Options for regression analysis
 */
export interface RegressionAnalysisOptions {
  readonly includeVersionHistory?: boolean
  readonly enableDetailedAnalysis?: boolean
  readonly customWeights?: Partial<RegressionAnalysisConfig>
  readonly timeoutMs?: number
}

/**
 * Options for regression decision application
 */
export interface RegressionApplicationOptions {
  readonly preserveHistory?: boolean
  readonly requireConfirmation?: boolean
  readonly notifyObservers?: boolean
  readonly dryRun?: boolean
}

/**
 * Batch processing result for multiple regressions
 */
export interface BatchRegressionResult {
  readonly total: number
  readonly processed: number
  readonly successful: number
  readonly failed: number
  readonly decisions: RegressionDecision[]
  readonly errors: Array<{segmentId: string; error: Error}>
  readonly processingTimeMs: number
}
