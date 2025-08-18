/**
 * GrowthPathTypes - Type definitions for Growth Path Analysis System
 *
 * Defines comprehensive types for identifying and analyzing the most consistent
 * growth paths when reconciling multiple versions of transcript evolution,
 * including directed graph analysis, path optimization, and branch management.
 */

import {TranscriptSegment} from './HashTypes'
import {SegmentConfidence} from './ConfidenceTypes'

// ================================================================
// Core Growth Path Types
// ================================================================

/**
 * Types of evolution operations in transcript growth
 */
export type GrowthOperation =
  | 'insertion' // New content added
  | 'modification' // Existing content changed
  | 'deletion' // Content removed
  | 'split' // Single segment split into multiple
  | 'merge' // Multiple segments merged into one
  | 'reorder' // Content reordered/repositioned
  | 'refinement' // Quality improvement without structural change
  | 'correction' // Error correction in existing content

/**
 * Confidence levels for growth path predictions
 */
export type PathConfidence =
  | 'very_low' // < 0.3 - Highly uncertain
  | 'low' // 0.3-0.5 - Uncertain
  | 'medium' // 0.5-0.7 - Moderately confident
  | 'high' // 0.7-0.9 - Confident
  | 'very_high' // > 0.9 - Very confident

/**
 * Strategy for handling path conflicts
 */
export type ConflictResolutionStrategy =
  | 'confidence_based' // Choose path with highest confidence
  | 'majority_consensus' // Follow most common evolution pattern
  | 'temporal_priority' // Prefer chronologically consistent paths
  | 'quality_optimized' // Optimize for final quality
  | 'conservative' // Prefer minimal changes
  | 'aggressive' // Allow major restructuring
  | 'hybrid' // Combine multiple strategies

/**
 * Types of path relationships between nodes
 */
export type PathRelationType =
  | 'direct_evolution' // Direct A -> B transformation
  | 'parallel_branch' // Alternative evolution from same source
  | 'convergent_merge' // Multiple paths converging to same result
  | 'divergent_split' // Single path splitting into alternatives
  | 'circular_reference' // Potentially problematic circular dependency
  | 'orphaned_branch' // Disconnected from main evolution tree

// ================================================================
// Node and Edge Structures
// ================================================================

/**
 * A node in the transcript evolution graph
 */
export interface TranscriptNode {
  readonly id: string
  readonly timestamp: number
  readonly segment: TranscriptSegment
  readonly segmentConfidence?: SegmentConfidence

  // Node metadata
  readonly version: string
  readonly source: string // Where this version came from
  readonly generationDepth: number // How many steps from original
  readonly branchId: string // Which evolution branch this belongs to

  // Quality metrics
  readonly nodeConfidence: number // Confidence in this node's validity
  readonly stabilityScore: number // How stable/permanent this version seems
  readonly consensusLevel: number // Agreement among different sources

  // Relationship metadata
  readonly parentNodes: string[] // Previous version node IDs
  readonly childNodes: string[] // Subsequent version node IDs
  readonly siblingNodes: string[] // Alternative versions at same depth

  // Analysis data
  readonly analysisMetadata: Record<string, unknown>
  readonly tags: string[]
  readonly flags: NodeFlag[]
}

/**
 * Flags that can be applied to nodes for analysis
 */
export interface NodeFlag {
  readonly type:
    | 'quality_issue'
    | 'temporal_anomaly'
    | 'confidence_drop'
    | 'isolation_risk'
    | 'merge_candidate'
  readonly severity: 'low' | 'medium' | 'high'
  readonly description: string
  readonly createdAt: number
}

/**
 * An edge representing transition between transcript versions
 */
export interface TranscriptEdge {
  readonly id: string
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly operation: GrowthOperation
  readonly confidence: number
  readonly weight: number // Cost/benefit of this transition

  // Operation details
  readonly operationData: GrowthOperationData
  readonly transformationCost: number // Computational cost of transformation
  readonly qualityImprovement: number // Quality gain from this transformation
  readonly consistencyScore: number // How consistent with other operations

  // Temporal information
  readonly detectedAt: number
  readonly validFromTime: number
  readonly validUntilTime?: number

  // Relationship metadata
  readonly relationType: PathRelationType
  readonly alternativeEdges: string[] // Other possible transitions
  readonly reversibility: number // How easily this can be undone (0-1)

  // Analysis data
  readonly edgeMetadata: Record<string, unknown>
  readonly validationResults: EdgeValidationResult[]
}

/**
 * Specific data about a growth operation
 */
export interface GrowthOperationData {
  readonly operation: GrowthOperation
  readonly description: string
  readonly affectedRange: {start: number; end: number}
  readonly originalContent?: string
  readonly newContent?: string
  readonly contentDelta: ContentDelta
  readonly contextualFactors: string[]
}

/**
 * Delta information between content versions
 */
export interface ContentDelta {
  readonly insertions: ContentChange[]
  readonly deletions: ContentChange[]
  readonly modifications: ContentChange[]
  readonly moves: ContentMove[]
  readonly statisticalSummary: DeltaStatistics
}

/**
 * A specific change in content
 */
export interface ContentChange {
  readonly position: number
  readonly originalText?: string
  readonly newText?: string
  readonly changeType: 'word' | 'phrase' | 'sentence' | 'paragraph'
  readonly confidence: number
  readonly reason: string
}

/**
 * A move operation in content
 */
export interface ContentMove {
  readonly fromPosition: number
  readonly toPosition: number
  readonly text: string
  readonly confidence: number
}

/**
 * Statistical summary of content delta
 */
export interface DeltaStatistics {
  readonly totalChanges: number
  readonly insertionCount: number
  readonly deletionCount: number
  readonly modificationCount: number
  readonly moveCount: number
  readonly averageChangeConfidence: number
  readonly contentSimilarityScore: number
  readonly structuralSimilarityScore: number
}

/**
 * Validation result for an edge
 */
export interface EdgeValidationResult {
  readonly validationType: 'temporal' | 'logical' | 'quality' | 'consistency'
  readonly isValid: boolean
  readonly confidence: number
  readonly issues: string[]
  readonly suggestions: string[]
}

// ================================================================
// Growth Path Analysis Types
// ================================================================

/**
 * A complete path through the evolution graph
 */
export interface GrowthPath {
  readonly id: string
  readonly startNode: string
  readonly endNode: string
  readonly nodeSequence: string[]
  readonly edgeSequence: string[]
  readonly pathType: 'linear' | 'branching' | 'merging' | 'complex'

  // Path quality metrics
  readonly totalConfidence: number
  readonly averageConfidence: number
  readonly pathWeight: number // Total cost of path
  readonly qualityImprovement: number // End quality - start quality
  readonly consistencyScore: number // How internally consistent the path is
  readonly stabilityScore: number // How stable the path seems long-term

  // Path characteristics
  readonly length: number // Number of nodes in path
  readonly duration: number // Time span covered by path
  readonly operationTypes: GrowthOperation[]
  readonly branchPoints: number // How many branch decisions in path
  readonly mergePoints: number // How many merge decisions in path

  // Risk assessment
  readonly riskLevel: 'low' | 'medium' | 'high'
  readonly riskFactors: PathRiskFactor[]
  readonly mitigationStrategies: string[]

  // Analysis metadata
  readonly discoveredAt: number
  readonly lastValidatedAt: number
  readonly validationResults: PathValidationResult[]
  readonly alternativePaths: string[] // IDs of alternative paths
  readonly pathMetadata: Record<string, unknown>
}

/**
 * Risk factors that might affect path validity
 */
export interface PathRiskFactor {
  readonly type:
    | 'temporal_inconsistency'
    | 'quality_regression'
    | 'low_confidence'
    | 'structural_instability'
  readonly severity: 'low' | 'medium' | 'high'
  readonly description: string
  readonly affectedNodes: string[]
  readonly likelihood: number
  readonly impact: number
  readonly mitigation?: string
}

/**
 * Validation result for an entire path
 */
export interface PathValidationResult {
  readonly validationType: 'temporal' | 'logical' | 'quality' | 'consistency' | 'completeness'
  readonly isValid: boolean
  readonly confidence: number
  readonly score: number
  readonly issues: PathValidationIssue[]
  readonly strengths: string[]
  readonly recommendations: string[]
}

/**
 * Specific validation issue found in a path
 */
export interface PathValidationIssue {
  readonly type:
    | 'missing_node'
    | 'invalid_transition'
    | 'circular_reference'
    | 'quality_drop'
    | 'temporal_gap'
  readonly severity: 'warning' | 'error' | 'critical'
  readonly description: string
  readonly affectedNodes: string[]
  readonly affectedEdges: string[]
  readonly suggestedFix?: string
}

// ================================================================
// Analysis Configuration Types
// ================================================================

/**
 * Configuration for growth path analysis
 */
export interface GrowthPathAnalyzerConfig {
  // Path discovery settings
  readonly pathDiscovery: {
    readonly maxPathLength: number // Maximum nodes in a path
    readonly maxSearchDepth: number // Maximum search depth
    readonly minPathConfidence: number // Minimum confidence to consider
    readonly maxAlternativePaths: number // Maximum alternatives to track
    readonly pruningThreshold: number // When to prune unlikely paths
    readonly branchingFactor: number // Max branches to explore per node
  }

  // Quality thresholds
  readonly quality: {
    readonly minNodeConfidence: number
    readonly minEdgeConfidence: number
    readonly qualityImprovementWeight: number
    readonly consistencyWeight: number
    readonly stabilityWeight: number
    readonly penaltyForComplexity: number
  }

  // Temporal analysis
  readonly temporal: {
    readonly maxTemporalGap: number // Max time gap between nodes (ms)
    readonly temporalConsistencyWeight: number
    readonly allowBackwardTime: boolean // Allow temporal reversals
    readonly temporalToleranceMs: number // Tolerance for timing variations
  }

  // Conflict resolution
  readonly conflictResolution: {
    readonly strategy: ConflictResolutionStrategy
    readonly confidenceThreshold: number
    readonly consensusRequirement: number // Minimum agreement level
    readonly tieBreakingMethod: 'random' | 'temporal' | 'quality' | 'confidence'
  }

  // Performance settings
  readonly performance: {
    readonly maxConcurrentAnalyses: number
    readonly analysisTimeoutMs: number
    readonly enableCaching: boolean
    readonly cacheExpirationMs: number
    readonly memoryLimit: number // Max memory usage in bytes
    readonly enableProgressiveAnalysis: boolean // Analyze incrementally
  }

  // Validation settings
  readonly validation: {
    readonly enableDeepValidation: boolean
    readonly validationTimeoutMs: number
    readonly requireFullPathValidation: boolean
    readonly validationCacheSize: number
  }

  // Integration settings
  readonly integration: {
    readonly emitDetailedEvents: boolean
    readonly preserveAnalysisHistory: boolean
    readonly enableRollbackCapability: boolean
    readonly autoOptimizePaths: boolean
  }
}

// ================================================================
// Analysis Result Types
// ================================================================

/**
 * Result of growth path analysis
 */
export interface GrowthPathAnalysisResult {
  readonly analysisId: string
  readonly inputNodes: string[]
  readonly startTime: number
  readonly endTime: number
  readonly processingTimeMs: number

  // Discovered paths
  readonly allPaths: GrowthPath[]
  readonly optimalPaths: GrowthPath[]
  readonly recommendedPath: GrowthPath
  readonly alternativePaths: GrowthPath[]

  // Analysis metadata
  readonly graphStatistics: GraphStatistics
  readonly pathStatistics: PathStatistics
  readonly qualityMetrics: PathQualityMetrics
  readonly validationSummary: ValidationSummary

  // Decision support
  readonly pathComparisons: PathComparison[]
  readonly riskAssessment: PathRiskAssessment
  readonly optimizationRecommendations: OptimizationRecommendation[]

  // Analysis quality
  readonly analysisConfidence: number
  readonly completeness: number // How complete the analysis is (0-1)
  readonly reliability: number // How reliable the results are (0-1)

  // Metadata
  readonly analysisVersion: string
  readonly configurationUsed: GrowthPathAnalyzerConfig
  readonly warningsGenerated: AnalysisWarning[]
}

/**
 * Statistics about the analyzed graph
 */
export interface GraphStatistics {
  readonly totalNodes: number
  readonly totalEdges: number
  readonly connectedComponents: number
  readonly averageNodeDegree: number
  readonly maxPathLength: number
  readonly branchingFactor: number
  readonly cyclicPaths: number
  readonly isolatedNodes: number
  readonly averageConfidence: number
}

/**
 * Statistics about discovered paths
 */
export interface PathStatistics {
  readonly totalPathsAnalyzed: number
  readonly validPathsFound: number
  readonly averagePathLength: number
  readonly averagePathConfidence: number
  readonly shortestPathLength: number
  readonly longestPathLength: number
  readonly pathLengthDistribution: Map<number, number>
  readonly operationFrequency: Map<GrowthOperation, number>
}

/**
 * Quality metrics for paths
 */
export interface PathQualityMetrics {
  readonly averageQualityImprovement: number
  readonly maxQualityImprovement: number
  readonly minQualityImprovement: number
  readonly qualityImprovementVariance: number
  readonly consistencyScore: number
  readonly stabilityScore: number
  readonly riskDistribution: Map<string, number>
}

/**
 * Summary of validation results
 */
export interface ValidationSummary {
  readonly totalValidations: number
  readonly passedValidations: number
  readonly failedValidations: number
  readonly validationRate: number
  readonly commonIssues: Map<string, number>
  readonly validationTypeResults: Map<string, {passed: number; failed: number}>
}

/**
 * Comparison between different paths
 */
export interface PathComparison {
  readonly pathA: string
  readonly pathB: string
  readonly comparisonType: 'quality' | 'confidence' | 'stability' | 'efficiency'
  readonly winner: 'A' | 'B' | 'tie'
  readonly scoreDifference: number
  readonly reasoning: string
  readonly tradeoffs: string[]
}

/**
 * Risk assessment for path selection
 */
export interface PathRiskAssessment {
  readonly overallRisk: 'low' | 'medium' | 'high'
  readonly riskFactors: PathRiskFactor[]
  readonly mitigationStrategies: MitigationStrategy[]
  readonly riskTolerance: number
  readonly recommendedActions: string[]
}

/**
 * Strategy for mitigating path risks
 */
export interface MitigationStrategy {
  readonly riskType: string
  readonly strategy: string
  readonly effectiveness: number
  readonly implementationCost: number
  readonly description: string
}

/**
 * Recommendation for path optimization
 */
export interface OptimizationRecommendation {
  readonly type:
    | 'merge_paths'
    | 'split_path'
    | 'prune_branch'
    | 'add_validation'
    | 'improve_confidence'
  readonly description: string
  readonly expectedBenefit: number
  readonly implementationComplexity: 'low' | 'medium' | 'high'
  readonly priority: 'low' | 'medium' | 'high'
  readonly affectedPaths: string[]
}

/**
 * Warning generated during analysis
 */
export interface AnalysisWarning {
  readonly type: 'performance' | 'quality' | 'consistency' | 'completeness'
  readonly severity: 'info' | 'warning' | 'error'
  readonly message: string
  readonly context: string
  readonly suggestedAction?: string
}

// ================================================================
// Performance and Statistics
// ================================================================

/**
 * Performance metrics for growth path analyzer
 */
export interface GrowthPathAnalyzerStats {
  readonly totalAnalyses: number
  readonly averageAnalysisTimeMs: number
  readonly peakAnalysisTimeMs: number
  readonly successfulAnalyses: number
  readonly failedAnalyses: number

  // Path discovery stats
  readonly averagePathsDiscovered: number
  readonly maxPathsDiscovered: number
  readonly pathPruningRate: number
  readonly averageGraphComplexity: number

  // Quality metrics
  readonly averageResultConfidence: number
  readonly averagePathQuality: number
  readonly optimizationSuccessRate: number

  // Performance metrics
  readonly memoryUsageBytes: number
  readonly cacheHitRate: number
  readonly analysisTimeDistribution: Map<string, number> // time range -> count
  readonly errorRate: number
}

// ================================================================
// Event System Types
// ================================================================

/**
 * Events emitted by GrowthPathAnalyzer
 */
export interface GrowthPathAnalyzerEvents {
  'analysis:started': (analysisId: string, nodeCount: number) => void
  'analysis:completed': (result: GrowthPathAnalysisResult) => void
  'path:discovered': (path: GrowthPath, analysisId: string) => void
  'path:optimized': (originalPath: string, optimizedPath: GrowthPath) => void
  'validation:completed': (pathId: string, results: PathValidationResult[]) => void
  'risk:detected': (pathId: string, riskFactor: PathRiskFactor) => void
  'performance:stats': (stats: GrowthPathAnalyzerStats) => void
  warning: (warning: AnalysisWarning) => void
  error: (error: Error, context: string) => void
}

// ================================================================
// Batch and Advanced Operations
// ================================================================

/**
 * Request for batch path analysis
 */
export interface BatchPathAnalysisRequest {
  readonly nodeGroups: TranscriptNode[][]
  readonly analysisOptions: Partial<GrowthPathAnalyzerConfig>
  readonly parallelism: number
  readonly timeoutMs?: number
  readonly priorityOrder?: number[]
}

/**
 * Result of batch path analysis
 */
export interface BatchPathAnalysisResult {
  readonly requestId: string
  readonly totalGroups: number
  readonly processedGroups: number
  readonly successfulGroups: number
  readonly failedGroups: number
  readonly results: GrowthPathAnalysisResult[]
  readonly errors: Array<{groupIndex: number; error: Error}>
  readonly overallStats: BatchAnalysisStats
  readonly processingTimeMs: number
}

/**
 * Statistics for batch analysis
 */
export interface BatchAnalysisStats {
  readonly averageGroupProcessingTime: number
  readonly totalPathsDiscovered: number
  readonly averagePathsPerGroup: number
  readonly overallQualityScore: number
  readonly consistencyAcrossGroups: number
}

// ================================================================
// Utility and Helper Types
// ================================================================

/**
 * Options for path analysis customization
 */
export interface PathAnalysisOptions {
  readonly focusOnQuality?: boolean
  readonly allowComplexPaths?: boolean
  readonly preferStability?: boolean
  readonly maxComputationTime?: number
  readonly customWeights?: {
    readonly quality: number
    readonly confidence: number
    readonly stability: number
    readonly efficiency: number
  }
}

/**
 * Context for path analysis
 */
export interface AnalysisContext {
  readonly domainKnowledge?: string
  readonly historicalPatterns?: string[]
  readonly qualityExpectations?: number
  readonly performanceRequirements?: {
    readonly maxLatency: number
    readonly maxMemoryUsage: number
  }
  readonly businessRules?: string[]
}

/**
 * Template for common analysis patterns
 */
export interface AnalysisTemplate {
  readonly name: string
  readonly description: string
  readonly config: Partial<GrowthPathAnalyzerConfig>
  readonly applicableScenarios: string[]
  readonly expectedPerformance: {
    readonly accuracy: number
    readonly speed: number
    readonly memoryUsage: number
  }
}

// ================================================================
// Default Configurations
// ================================================================

/**
 * Default configuration for growth path analyzer
 */
export const DEFAULT_GROWTH_PATH_ANALYZER_CONFIG: GrowthPathAnalyzerConfig = {
  pathDiscovery: {
    maxPathLength: 20,
    maxSearchDepth: 10,
    minPathConfidence: 0.3,
    maxAlternativePaths: 5,
    pruningThreshold: 0.1,
    branchingFactor: 3
  },

  quality: {
    minNodeConfidence: 0.4,
    minEdgeConfidence: 0.3,
    qualityImprovementWeight: 0.3,
    consistencyWeight: 0.25,
    stabilityWeight: 0.2,
    penaltyForComplexity: 0.1
  },

  temporal: {
    maxTemporalGap: 60000, // 1 minute
    temporalConsistencyWeight: 0.15,
    allowBackwardTime: false,
    temporalToleranceMs: 5000 // 5 seconds
  },

  conflictResolution: {
    strategy: 'confidence_based',
    confidenceThreshold: 0.6,
    consensusRequirement: 0.7,
    tieBreakingMethod: 'confidence'
  },

  performance: {
    maxConcurrentAnalyses: 2,
    analysisTimeoutMs: 30000, // 30 seconds
    enableCaching: true,
    cacheExpirationMs: 600000, // 10 minutes
    memoryLimit: 100 * 1024 * 1024, // 100MB
    enableProgressiveAnalysis: true
  },

  validation: {
    enableDeepValidation: true,
    validationTimeoutMs: 10000, // 10 seconds
    requireFullPathValidation: false,
    validationCacheSize: 1000
  },

  integration: {
    emitDetailedEvents: false,
    preserveAnalysisHistory: true,
    enableRollbackCapability: true,
    autoOptimizePaths: false
  }
}
