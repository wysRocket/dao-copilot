/**
 * ConflictTypes - Comprehensive Type Definitions for Transcript Conflict Resolution
 *
 * This file defines all types, interfaces, and data structures needed for the conflict resolution
 * system in the transcript merge engine. It provides sophisticated conflict detection, classification,
 * and resolution strategy types to handle complex transcription conflicts accurately.
 */

// ================================================================
// Core Conflict Detection Types
// ================================================================

/**
 * Types of conflicts that can occur between transcript versions
 */
export type ConflictType =
  | 'content_mismatch' // Different text content for same time range
  | 'timing_overlap' // Overlapping time ranges with different content
  | 'confidence_dispute' // Same content but different confidence scores
  | 'speaker_conflict' // Different speaker attributions
  | 'word_boundary_mismatch' // Different word boundary positions
  | 'non_speech_dispute' // Conflicting non-speech event classifications
  | 'language_conflict' // Different language detections
  | 'formatting_conflict' // Different text formatting decisions
  | 'segmentation_dispute' // Different sentence/phrase segmentation
  | 'ambiguity_resolution' // Multiple valid interpretations

/**
 * Severity levels for conflicts
 */
export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Source of a conflict (what caused it)
 */
export type ConflictSource =
  | 'transcription_engine' // Different engines produced different results
  | 'timing_drift' // Time synchronization issues
  | 'audio_quality' // Audio quality differences affecting transcription
  | 'speaker_overlap' // Multiple speakers talking simultaneously
  | 'background_noise' // Noise affecting transcription accuracy
  | 'language_switching' // Code-switching or language changes
  | 'technical_terminology' // Domain-specific terms causing confusion
  | 'accent_variation' // Accent/pronunciation causing different results
  | 'audio_artifacts' // Audio compression or transmission artifacts
  | 'version_mismatch' // Different versions of transcription models

/**
 * Individual conflict between transcript versions
 */
export interface TranscriptConflict {
  id: string
  conflictType: ConflictType
  severity: ConflictSeverity
  source: ConflictSource

  // Affected content
  timeRange: {
    start: number
    end: number
    duration: number
  }

  // Conflicting versions
  primaryVersion: ConflictVersion
  alternativeVersions: ConflictVersion[]

  // Context information
  audioContext: AudioContext
  linguisticContext: LinguisticContext
  technicalContext: TechnicalContext

  // Conflict metadata
  detectedAt: number
  detectionMethod: string
  confidenceInDetection: number
  impactAssessment: ConflictImpactAssessment

  // Resolution information
  resolutionStrategy?: ConflictResolutionStrategy
  resolvedVersion?: ConflictVersion
  resolutionConfidence?: number
  resolutionReasoning?: string
  resolvedAt?: number

  // Audit trail
  resolutionHistory: ConflictResolutionDecision[]
  reviewStatus: 'unreviewed' | 'automated' | 'manual_review' | 'approved'

  conflictMetadata: Record<string, any>
}

/**
 * A version of content involved in a conflict
 */
export interface ConflictVersion {
  versionId: string
  sourceTranscriptId: string
  content: string

  // Quality metrics
  confidence: number
  qualityScore: number
  consistencyScore: number
  linguisticScore: number

  // Timing information
  timestamp: number
  processingTime: number

  // Technical details
  transcriptionEngine: string
  modelVersion: string
  audioQuality: number

  // Evidence supporting this version
  supportingEvidence: SupportingEvidence[]

  // Relationships
  similarVersions: string[]
  derivedFrom?: string

  versionMetadata: Record<string, any>
}

/**
 * Supporting evidence for a conflict version
 */
export interface SupportingEvidence {
  evidenceType: EvidenceType
  strength: number // 0-1 confidence in this evidence
  source: string
  description: string

  // Evidence data
  evidenceData: {
    audioFeatures?: AudioFeatures
    linguisticFeatures?: LinguisticFeatures
    contextualCues?: ContextualCues
    technicalMetrics?: TechnicalMetrics
    externalValidation?: ExternalValidation
  }

  // Evidence metadata
  collectedAt: number
  validityPeriod?: number
  reliability: number

  evidenceMetadata: Record<string, any>
}

export type EvidenceType =
  | 'acoustic_similarity'
  | 'linguistic_consistency'
  | 'contextual_fit'
  | 'frequency_analysis'
  | 'speaker_characteristics'
  | 'background_analysis'
  | 'timing_correlation'
  | 'cross_validation'
  | 'domain_knowledge'
  | 'historical_patterns'

// ================================================================
// Context Information Types
// ================================================================

/**
 * Audio context for a conflict
 */
export interface AudioContext {
  audioQuality: number
  noiseLevel: number
  speechClarity: number
  speakerCount: number

  // Audio characteristics
  dominantFrequencies: number[]
  backgroundType: 'silent' | 'music' | 'noise' | 'speech' | 'mixed'
  volumeVariation: number

  // Technical audio information
  sampleRate: number
  bitDepth: number
  compressionRatio?: number

  audioContextMetadata: Record<string, any>
}

/**
 * Linguistic context for a conflict
 */
export interface LinguisticContext {
  primaryLanguage: string
  detectedLanguages: string[]
  languageConfidence: number

  // Linguistic complexity
  vocabularyComplexity: number
  syntacticComplexity: number
  semanticAmbiguity: number

  // Domain information
  topicalDomain: string
  technicalTerms: string[]

  // Discourse features
  speakingStyle: 'formal' | 'informal' | 'technical' | 'conversational'
  discourseMarkers: string[]

  linguisticContextMetadata: Record<string, any>
}

/**
 * Technical context for a conflict
 */
export interface TechnicalContext {
  processingPipeline: string
  modelVersions: Record<string, string>
  processingSettings: Record<string, any>

  // System state
  systemLoad: number
  availableMemory: number
  processingLatency: number

  // Quality indicators
  signalToNoiseRatio: number
  processingErrors: string[]
  warningFlags: string[]

  technicalContextMetadata: Record<string, any>
}

// ================================================================
// Conflict Resolution Strategy Types
// ================================================================

/**
 * Available conflict resolution strategies
 */
export type ConflictResolutionStrategyType =
  | 'confidence_based' // Choose version with highest confidence
  | 'timing_based' // Resolve based on temporal consistency
  | 'consensus_based' // Find consensus among multiple versions
  | 'quality_weighted' // Weight versions by overall quality metrics
  | 'evidence_aggregation' // Aggregate supporting evidence
  | 'linguistic_coherence' // Prioritize linguistic consistency
  | 'domain_informed' // Use domain knowledge for resolution
  | 'hybrid_approach' // Combine multiple strategies
  | 'manual_escalation' // Escalate to human review
  | 'fallback_strategy' // Use when other strategies fail

/**
 * Configuration for a conflict resolution strategy
 */
export interface ConflictResolutionStrategy {
  strategyType: ConflictResolutionStrategyType
  strategyName: string
  strategyVersion: string

  // Strategy parameters
  parameters: ConflictResolutionParameters

  // Applicability conditions
  applicableConflictTypes: ConflictType[]
  severityThresholds: Record<ConflictSeverity, number>
  minimumConfidenceRequired: number

  // Strategy behavior
  timeoutMs: number
  maxIterations: number
  fallbackStrategy?: ConflictResolutionStrategyType

  // Strategy metadata
  description: string
  author: string
  createdAt: number
  lastUpdatedAt: number

  strategyMetadata: Record<string, any>
}

/**
 * Parameters for different resolution strategies
 */
export interface ConflictResolutionParameters {
  // Confidence-based parameters
  confidenceWeights?: {
    transcriptionConfidence: number
    qualityScore: number
    consistencyScore: number
    linguisticScore: number
  }

  // Timing-based parameters
  timingParameters?: {
    temporalWindowMs: number
    maxTimingDriftMs: number
    timingConfidenceThreshold: number
  }

  // Consensus-based parameters
  consensusParameters?: {
    minimumAgreementThreshold: number
    weightedVoting: boolean
    outlierDetectionEnabled: boolean
    consensusConfidenceThreshold: number
  }

  // Quality-weighted parameters
  qualityWeights?: {
    audioQuality: number
    processingQuality: number
    contextualFit: number
    linguisticConsistency: number
  }

  // Evidence aggregation parameters
  evidenceParameters?: {
    evidenceWeights: Record<EvidenceType, number>
    minimumEvidenceThreshold: number
    evidenceReliabilityThreshold: number
    contradictoryEvidenceHandling: 'ignore' | 'weight_reduced' | 'manual_review'
  }

  // Linguistic coherence parameters
  linguisticParameters?: {
    grammarWeight: number
    vocabularyWeight: number
    contextualWeight: number
    semanticCoherenceWeight: number
  }

  // Domain-informed parameters
  domainParameters?: {
    domainKnowledgeBase: string
    termPriorityWeights: Record<string, number>
    domainSpecificRules: DomainRule[]
  }

  // Hybrid approach parameters
  hybridParameters?: {
    strategyWeights: Record<ConflictResolutionStrategyType, number>
    strategySelectionCriteria: StrategySelectionCriteria
    adaptiveBehavior: boolean
  }

  customParameters?: Record<string, any>
}

/**
 * Domain-specific rule for resolution
 */
export interface DomainRule {
  ruleId: string
  condition: string // Condition in a simple DSL or JSON format
  action: 'prefer' | 'reject' | 'escalate' | 'combine'
  target: string // What to prefer/reject/etc.
  confidence: number

  ruleMetadata: Record<string, any>
}

/**
 * Criteria for selecting strategies in hybrid approaches
 */
export interface StrategySelectionCriteria {
  conflictTypePreferences: Record<ConflictType, ConflictResolutionStrategyType[]>
  severityBasedSelection: Record<ConflictSeverity, ConflictResolutionStrategyType[]>
  contextBasedSelection: {
    audioQualityThresholds: Array<{
      threshold: number
      preferredStrategies: ConflictResolutionStrategyType[]
    }>
    confidenceThresholds: Array<{
      threshold: number
      preferredStrategies: ConflictResolutionStrategyType[]
    }>
  }

  adaptationRules: AdaptationRule[]
}

/**
 * Rule for adapting strategy selection based on historical performance
 */
export interface AdaptationRule {
  ruleId: string
  condition: string
  adaptation: 'increase_weight' | 'decrease_weight' | 'exclude_strategy' | 'prefer_strategy'
  magnitude: number

  ruleMetadata: Record<string, any>
}

// ================================================================
// Resolution Decision and Results Types
// ================================================================

/**
 * A decision made during conflict resolution
 */
export interface ConflictResolutionDecision {
  decisionId: string
  timestamp: number

  // Decision context
  conflictId: string
  strategyUsed: ConflictResolutionStrategyType
  decisionMaker: 'automated' | 'human' | 'hybrid'

  // Decision details
  chosenVersion: string
  rejectedVersions: string[]
  confidence: number
  reasoning: string

  // Supporting information
  evidenceConsidered: SupportingEvidence[]
  alternativesConsidered: string[]
  timeSpentMs: number

  // Quality assessment
  expectedAccuracy: number
  riskAssessment: DecisionRiskAssessment

  decisionMetadata: Record<string, any>
}

/**
 * Risk assessment for a resolution decision
 */
export interface DecisionRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical'

  riskFactors: {
    lowConfidenceVersions: number
    conflictingEvidence: number
    ambiguousContext: number
    timeConstraints: number
    domainComplexity: number
  }

  mitigationStrategies: string[]
  recommendedActions: string[]

  riskMetadata: Record<string, any>
}

/**
 * Impact assessment for a conflict
 */
export interface ConflictImpactAssessment {
  impactLevel: 'negligible' | 'low' | 'moderate' | 'high' | 'severe'

  affectedAspects: {
    transcriptionAccuracy: number
    userExperience: number
    downstreamProcessing: number
    semanticMeaning: number
    temporalConsistency: number
  }

  potentialConsequences: string[]
  urgencyLevel: 'low' | 'normal' | 'high' | 'urgent'

  impactMetadata: Record<string, any>
}

// ================================================================
// Conflict Resolution Results Types
// ================================================================

/**
 * Result of resolving a single conflict
 */
export interface ConflictResolutionResult {
  conflictId: string
  resolutionStatus: 'resolved' | 'partially_resolved' | 'unresolved' | 'escalated'

  // Resolution details
  chosenVersion?: ConflictVersion
  combinedVersion?: ConflictVersion
  confidence: number

  // Process information
  strategyUsed: ConflictResolutionStrategyType
  resolutionTimeMs: number
  iterationsRequired: number

  // Quality metrics
  resolutionQuality: number
  expectedAccuracy: number
  consistencyImprovement: number

  // Alternative options
  alternativeResolutions: AlternativeResolution[]

  // Audit information
  resolutionDecision: ConflictResolutionDecision
  humanReviewRequired: boolean

  resolutionMetadata: Record<string, any>
}

/**
 * Alternative resolution option
 */
export interface AlternativeResolution {
  alternativeId: string
  description: string
  chosenVersion: ConflictVersion
  confidence: number
  reasoning: string

  // Comparison with primary resolution
  accuracyComparison: number
  consistencyComparison: number

  alternativeMetadata: Record<string, any>
}

/**
 * Result of resolving multiple conflicts in a batch
 */
export interface BatchConflictResolutionResult {
  batchId: string
  totalConflicts: number

  // Resolution statistics
  resolvedCount: number
  partiallyResolvedCount: number
  unresolvedCount: number
  escalatedCount: number

  // Individual results
  individualResults: ConflictResolutionResult[]

  // Batch statistics
  averageResolutionTimeMs: number
  averageConfidence: number
  overallQualityImprovement: number

  // Strategy effectiveness
  strategyPerformance: Map<ConflictResolutionStrategyType, StrategyPerformanceMetrics>

  // Processing information
  processingTimeMs: number
  parallelismUsed: number

  batchMetadata: Record<string, any>
}

/**
 * Performance metrics for a resolution strategy
 */
export interface StrategyPerformanceMetrics {
  conflictsHandled: number
  successRate: number
  averageConfidence: number
  averageResolutionTime: number

  qualityMetrics: {
    averageAccuracy: number
    consistencyImprovement: number
    userSatisfaction?: number
  }

  errorAnalysis: {
    commonErrors: string[]
    errorRate: number
    falsePositiveRate?: number
    falseNegativeRate?: number
  }

  performanceMetadata: Record<string, any>
}

// ================================================================
// Supporting Feature Types
// ================================================================

/**
 * Audio features extracted for evidence
 */
export interface AudioFeatures {
  spectralCentroid: number
  spectralRolloff: number
  zeroCrossingRate: number
  mfccCoefficients: number[]

  speechCharacteristics: {
    fundamentalFrequency: number
    formantFrequencies: number[]
    voicingProbability: number
    speechRate: number
  }

  backgroundCharacteristics: {
    noiseType: string
    noiseLevel: number
    signalToNoiseRatio: number
  }

  audioFeaturesMetadata: Record<string, any>
}

/**
 * Linguistic features for evidence
 */
export interface LinguisticFeatures {
  lexicalDiversity: number
  syntacticComplexity: number
  semanticDensity: number

  languageModel: {
    perplexity: number
    languageProbability: number
    unknownWordRate: number
  }

  discourseFeatures: {
    coherenceScore: number
    cohesionScore: number
    topicConsistency: number
  }

  linguisticFeaturesMetadata: Record<string, any>
}

/**
 * Contextual cues for evidence
 */
export interface ContextualCues {
  temporalConsistency: number
  speakerConsistency: number
  topicalRelevance: number

  conversationalContext: {
    turnTaking: boolean
    interactionType: string
    participantCount: number
  }

  environmentalContext: {
    acousticEnvironment: string
    backgroundActivity: string
    recordingConditions: string
  }

  contextualCuesMetadata: Record<string, any>
}

/**
 * Technical metrics for evidence
 */
export interface TechnicalMetrics {
  processingLatency: number
  computationalCost: number
  memoryUsage: number

  modelPerformance: {
    modelConfidence: number
    calibrationScore: number
    uncertaintyEstimate: number
  }

  systemMetrics: {
    cpuUtilization: number
    memoryUtilization: number
    networkLatency?: number
  }

  technicalMetricsMetadata: Record<string, any>
}

/**
 * External validation for evidence
 */
export interface ExternalValidation {
  validationSource: string
  validationMethod: string
  validationResult: 'confirmed' | 'contradicted' | 'inconclusive'
  validationConfidence: number

  validationDetails: {
    comparisonMetrics: Record<string, number>
    agreementLevel: number
    discrepancies: string[]
  }

  externalValidationMetadata: Record<string, any>
}

// ================================================================
// Configuration and Settings Types
// ================================================================

/**
 * Configuration for the conflict resolver
 */
export interface ConflictResolverConfig {
  // Detection settings
  detection: {
    enabledConflictTypes: ConflictType[]
    sensitivityThresholds: Record<ConflictType, number>
    minimumSeverityLevel: ConflictSeverity
    maxConflictsPerBatch: number
  }

  // Resolution settings
  resolution: {
    defaultStrategy: ConflictResolutionStrategyType
    fallbackStrategy: ConflictResolutionStrategyType
    maxResolutionTimeMs: number
    maxIterationsPerConflict: number
    enableParallelResolution: boolean
  }

  // Quality settings
  quality: {
    minimumResolutionConfidence: number
    qualityThresholds: Record<string, number>
    enableQualityValidation: boolean
    requireHumanReview: Record<ConflictSeverity, boolean>
  }

  // Performance settings
  performance: {
    enableCaching: boolean
    cacheExpirationMs: number
    maxCacheSize: number
    batchProcessingSize: number
    parallelismFactor: number
  }

  // Integration settings
  integration: {
    enableTelemetry: boolean
    auditTrailDetail: 'minimal' | 'standard' | 'comprehensive'
    exportResolutionHistory: boolean
    integrationCallbacks: string[]
  }

  // Strategy-specific settings
  strategies: Record<ConflictResolutionStrategyType, ConflictResolutionStrategy>

  configMetadata: Record<string, any>
}

/**
 * Default configuration for conflict resolver
 */
export const DEFAULT_CONFLICT_RESOLVER_CONFIG: ConflictResolverConfig = {
  detection: {
    enabledConflictTypes: [
      'content_mismatch',
      'timing_overlap',
      'confidence_dispute',
      'speaker_conflict',
      'word_boundary_mismatch'
    ],
    sensitivityThresholds: {
      content_mismatch: 0.7,
      timing_overlap: 0.8,
      confidence_dispute: 0.6,
      speaker_conflict: 0.8,
      word_boundary_mismatch: 0.5,
      non_speech_dispute: 0.7,
      language_conflict: 0.9,
      formatting_conflict: 0.3,
      segmentation_dispute: 0.6,
      ambiguity_resolution: 0.8
    },
    minimumSeverityLevel: 'low',
    maxConflictsPerBatch: 100
  },

  resolution: {
    defaultStrategy: 'hybrid_approach',
    fallbackStrategy: 'confidence_based',
    maxResolutionTimeMs: 5000,
    maxIterationsPerConflict: 3,
    enableParallelResolution: true
  },

  quality: {
    minimumResolutionConfidence: 0.7,
    qualityThresholds: {
      accuracy: 0.85,
      consistency: 0.8,
      completeness: 0.9
    },
    enableQualityValidation: true,
    requireHumanReview: {
      low: false,
      medium: false,
      high: true,
      critical: true
    }
  },

  performance: {
    enableCaching: true,
    cacheExpirationMs: 300000, // 5 minutes
    maxCacheSize: 1000,
    batchProcessingSize: 20,
    parallelismFactor: 0.7
  },

  integration: {
    enableTelemetry: true,
    auditTrailDetail: 'standard',
    exportResolutionHistory: true,
    integrationCallbacks: []
  },

  strategies: {
    confidence_based: {
      strategyType: 'confidence_based',
      strategyName: 'Confidence-Based Resolution',
      strategyVersion: '1.0.0',
      parameters: {
        confidenceWeights: {
          transcriptionConfidence: 0.4,
          qualityScore: 0.3,
          consistencyScore: 0.2,
          linguisticScore: 0.1
        }
      },
      applicableConflictTypes: ['confidence_dispute', 'content_mismatch'],
      severityThresholds: {
        low: 0.5,
        medium: 0.6,
        high: 0.7,
        critical: 0.8
      },
      minimumConfidenceRequired: 0.6,
      timeoutMs: 1000,
      maxIterations: 1,
      description: 'Resolves conflicts by selecting the version with highest confidence',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    timing_based: {
      strategyType: 'timing_based',
      strategyName: 'Temporal Consistency Resolution',
      strategyVersion: '1.0.0',
      parameters: {
        timingParameters: {
          temporalWindowMs: 500,
          maxTimingDriftMs: 100,
          timingConfidenceThreshold: 0.8
        }
      },
      applicableConflictTypes: ['timing_overlap', 'word_boundary_mismatch'],
      severityThresholds: {
        low: 0.6,
        medium: 0.7,
        high: 0.8,
        critical: 0.9
      },
      minimumConfidenceRequired: 0.7,
      timeoutMs: 1500,
      maxIterations: 2,
      description: 'Resolves conflicts based on temporal consistency and timing alignment',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    consensus_based: {
      strategyType: 'consensus_based',
      strategyName: 'Multi-Version Consensus',
      strategyVersion: '1.0.0',
      parameters: {
        consensusParameters: {
          minimumAgreementThreshold: 0.6,
          weightedVoting: true,
          outlierDetectionEnabled: true,
          consensusConfidenceThreshold: 0.7
        }
      },
      applicableConflictTypes: ['content_mismatch', 'speaker_conflict', 'ambiguity_resolution'],
      severityThresholds: {
        low: 0.5,
        medium: 0.6,
        high: 0.7,
        critical: 0.8
      },
      minimumConfidenceRequired: 0.6,
      timeoutMs: 2000,
      maxIterations: 3,
      description: 'Finds consensus among multiple transcript versions',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    quality_weighted: {
      strategyType: 'quality_weighted',
      strategyName: 'Quality-Weighted Selection',
      strategyVersion: '1.0.0',
      parameters: {
        qualityWeights: {
          audioQuality: 0.3,
          processingQuality: 0.3,
          contextualFit: 0.2,
          linguisticConsistency: 0.2
        }
      },
      applicableConflictTypes: ['content_mismatch', 'confidence_dispute'],
      severityThresholds: {
        low: 0.6,
        medium: 0.7,
        high: 0.8,
        critical: 0.85
      },
      minimumConfidenceRequired: 0.65,
      timeoutMs: 1500,
      maxIterations: 2,
      description: 'Selects versions based on weighted quality metrics',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    evidence_aggregation: {
      strategyType: 'evidence_aggregation',
      strategyName: 'Evidence-Based Resolution',
      strategyVersion: '1.0.0',
      parameters: {
        evidenceParameters: {
          evidenceWeights: {
            acoustic_similarity: 0.25,
            linguistic_consistency: 0.2,
            contextual_fit: 0.15,
            frequency_analysis: 0.1,
            speaker_characteristics: 0.1,
            background_analysis: 0.05,
            timing_correlation: 0.05,
            cross_validation: 0.05,
            domain_knowledge: 0.03,
            historical_patterns: 0.02
          },
          minimumEvidenceThreshold: 0.6,
          evidenceReliabilityThreshold: 0.7,
          contradictoryEvidenceHandling: 'weight_reduced'
        }
      },
      applicableConflictTypes: [
        'content_mismatch',
        'speaker_conflict',
        'ambiguity_resolution',
        'non_speech_dispute'
      ],
      severityThresholds: {
        low: 0.6,
        medium: 0.7,
        high: 0.8,
        critical: 0.85
      },
      minimumConfidenceRequired: 0.7,
      timeoutMs: 3000,
      maxIterations: 3,
      description: 'Aggregates multiple types of evidence for resolution decisions',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    linguistic_coherence: {
      strategyType: 'linguistic_coherence',
      strategyName: 'Linguistic Coherence Optimization',
      strategyVersion: '1.0.0',
      parameters: {
        linguisticParameters: {
          grammarWeight: 0.3,
          vocabularyWeight: 0.25,
          contextualWeight: 0.25,
          semanticCoherenceWeight: 0.2
        }
      },
      applicableConflictTypes: [
        'content_mismatch',
        'language_conflict',
        'segmentation_dispute',
        'ambiguity_resolution'
      ],
      severityThresholds: {
        low: 0.5,
        medium: 0.6,
        high: 0.7,
        critical: 0.8
      },
      minimumConfidenceRequired: 0.6,
      timeoutMs: 2500,
      maxIterations: 2,
      description: 'Optimizes for linguistic coherence and natural language flow',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    domain_informed: {
      strategyType: 'domain_informed',
      strategyName: 'Domain Knowledge Resolution',
      strategyVersion: '1.0.0',
      parameters: {
        domainParameters: {
          domainKnowledgeBase: 'general',
          termPriorityWeights: {},
          domainSpecificRules: []
        }
      },
      applicableConflictTypes: ['content_mismatch', 'ambiguity_resolution', 'language_conflict'],
      severityThresholds: {
        low: 0.6,
        medium: 0.7,
        high: 0.8,
        critical: 0.85
      },
      minimumConfidenceRequired: 0.7,
      timeoutMs: 2000,
      maxIterations: 2,
      description: 'Uses domain-specific knowledge for informed resolution decisions',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    hybrid_approach: {
      strategyType: 'hybrid_approach',
      strategyName: 'Adaptive Hybrid Resolution',
      strategyVersion: '1.0.0',
      parameters: {
        hybridParameters: {
          strategyWeights: {
            confidence_based: 0.25,
            quality_weighted: 0.2,
            evidence_aggregation: 0.2,
            linguistic_coherence: 0.15,
            consensus_based: 0.1,
            timing_based: 0.05,
            domain_informed: 0.05,
            fallback_strategy: 0,
            manual_escalation: 0
          },
          strategySelectionCriteria: {
            conflictTypePreferences: {
              content_mismatch: ['quality_weighted', 'evidence_aggregation', 'confidence_based'],
              timing_overlap: ['timing_based', 'consensus_based'],
              confidence_dispute: ['confidence_based', 'quality_weighted'],
              speaker_conflict: ['consensus_based', 'evidence_aggregation'],
              word_boundary_mismatch: ['timing_based', 'linguistic_coherence'],
              non_speech_dispute: ['evidence_aggregation', 'consensus_based'],
              language_conflict: ['linguistic_coherence', 'domain_informed'],
              formatting_conflict: ['linguistic_coherence', 'consensus_based'],
              segmentation_dispute: ['linguistic_coherence', 'timing_based'],
              ambiguity_resolution: ['evidence_aggregation', 'domain_informed', 'consensus_based']
            },
            severityBasedSelection: {
              low: ['confidence_based', 'quality_weighted'],
              medium: ['evidence_aggregation', 'consensus_based', 'quality_weighted'],
              high: ['evidence_aggregation', 'hybrid_approach', 'consensus_based'],
              critical: ['evidence_aggregation', 'manual_escalation']
            },
            contextBasedSelection: {
              audioQualityThresholds: [
                {
                  threshold: 0.8,
                  preferredStrategies: ['confidence_based', 'quality_weighted']
                },
                {
                  threshold: 0.5,
                  preferredStrategies: ['evidence_aggregation', 'consensus_based']
                }
              ],
              confidenceThresholds: [
                {
                  threshold: 0.8,
                  preferredStrategies: ['confidence_based', 'quality_weighted']
                },
                {
                  threshold: 0.6,
                  preferredStrategies: ['evidence_aggregation', 'consensus_based']
                }
              ]
            },
            adaptationRules: []
          },
          adaptiveBehavior: true
        }
      },
      applicableConflictTypes: [
        'content_mismatch',
        'timing_overlap',
        'confidence_dispute',
        'speaker_conflict',
        'word_boundary_mismatch',
        'non_speech_dispute',
        'language_conflict',
        'formatting_conflict',
        'segmentation_dispute',
        'ambiguity_resolution'
      ],
      severityThresholds: {
        low: 0.6,
        medium: 0.7,
        high: 0.8,
        critical: 0.85
      },
      minimumConfidenceRequired: 0.7,
      timeoutMs: 4000,
      maxIterations: 3,
      fallbackStrategy: 'confidence_based',
      description: 'Adaptively combines multiple strategies for optimal conflict resolution',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    manual_escalation: {
      strategyType: 'manual_escalation',
      strategyName: 'Human Review Escalation',
      strategyVersion: '1.0.0',
      parameters: {},
      applicableConflictTypes: [
        'content_mismatch',
        'timing_overlap',
        'confidence_dispute',
        'speaker_conflict',
        'word_boundary_mismatch',
        'non_speech_dispute',
        'language_conflict',
        'formatting_conflict',
        'segmentation_dispute',
        'ambiguity_resolution'
      ],
      severityThresholds: {
        low: 0.9,
        medium: 0.8,
        high: 0.7,
        critical: 0.5
      },
      minimumConfidenceRequired: 0.9,
      timeoutMs: 60000, // 1 minute for human response
      maxIterations: 1,
      description: 'Escalates complex conflicts to human reviewers',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    },

    fallback_strategy: {
      strategyType: 'fallback_strategy',
      strategyName: 'Fallback Resolution',
      strategyVersion: '1.0.0',
      parameters: {
        confidenceWeights: {
          transcriptionConfidence: 0.5,
          qualityScore: 0.3,
          consistencyScore: 0.1,
          linguisticScore: 0.1
        }
      },
      applicableConflictTypes: [
        'content_mismatch',
        'timing_overlap',
        'confidence_dispute',
        'speaker_conflict',
        'word_boundary_mismatch',
        'non_speech_dispute',
        'language_conflict',
        'formatting_conflict',
        'segmentation_dispute',
        'ambiguity_resolution'
      ],
      severityThresholds: {
        low: 0.3,
        medium: 0.3,
        high: 0.3,
        critical: 0.3
      },
      minimumConfidenceRequired: 0.3,
      timeoutMs: 500,
      maxIterations: 1,
      description: 'Simple fallback strategy when all others fail',
      author: 'TranscriptionLossElimination',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      strategyMetadata: {}
    }
  },

  configMetadata: {}
}
