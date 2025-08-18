/**
 * MergeTelemetry - Comprehensive Telemetry System for Transcript Merge Decisions
 *
 * This file provides advanced telemetry capabilities to track, analyze, and optimize
 * the transcript merge engine's performance, decisions, and outcomes. It includes
 * detailed metrics collection, performance monitoring, decision tree visualization,
 * and exportable analytics for continuous improvement.
 */

import {EventEmitter} from 'events'
import {TranscriptResult} from '../types/TranscriptionTypes'
import {ContentHash} from '../types/HashTypes'
import {SegmentConfidence} from '../types/ConfidenceTypes'
import {GrowthPath, TranscriptNode} from '../types/GrowthPathTypes'
import {TranscriptConflict, ConflictResolutionResult} from '../types/ConflictTypes'

// ================================================================
// Telemetry Data Types
// ================================================================

/**
 * Core telemetry event types
 */
export type TelemetryEventType =
  | 'merge_started'
  | 'merge_completed'
  | 'merge_failed'
  | 'hash_collision'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'regression_detected'
  | 'confidence_calculated'
  | 'growth_path_analyzed'
  | 'deduplication_performed'
  | 'performance_warning'
  | 'quality_threshold_breach'
  | 'algorithm_optimization'
  | 'cache_miss'
  | 'cache_hit'
  | 'processing_milestone'

/**
 * Severity levels for telemetry events
 */
export type TelemetrySeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical'

/**
 * Individual telemetry event
 */
export interface TelemetryEvent {
  id: string
  timestamp: number
  eventType: TelemetryEventType
  severity: TelemetrySeverity

  // Event context
  sessionId: string
  mergeOperationId?: string
  componentName: string

  // Event data
  eventData: Record<string, any>

  // Performance metrics
  processingTimeMs?: number
  memoryUsageBytes?: number
  cpuUtilization?: number

  // Quality metrics
  accuracyScore?: number
  confidenceScore?: number
  consistencyScore?: number

  // Relationships
  parentEventId?: string
  relatedEventIds: string[]

  // Metadata
  tags: string[]
  metadata: Record<string, any>
}

/**
 * Merge operation telemetry summary
 */
export interface MergeOperationTelemetry {
  operationId: string
  sessionId: string
  startTime: number
  endTime?: number

  // Input metrics
  inputTranscripts: number
  totalSegments: number
  totalDuration: number

  // Processing metrics
  hashingTimeMs: number
  conflictDetectionTimeMs: number
  conflictResolutionTimeMs: number
  growthPathAnalysisTimeMs: number
  deduplicationTimeMs: number

  // Results metrics
  hashCollisions: number
  conflictsDetected: number
  conflictsResolved: number
  duplicatesRemoved: number
  qualityImprovement: number

  // Quality metrics
  outputAccuracy: number
  outputConsistency: number
  outputCompleteness: number

  // Algorithm performance
  algorithmBreakdown: AlgorithmPerformanceMetrics

  // Decision tree
  decisionTree: MergeDecisionNode[]

  // Events
  events: TelemetryEvent[]

  operationMetadata: Record<string, any>
}

/**
 * Performance metrics for specific algorithms
 */
export interface AlgorithmPerformanceMetrics {
  contentHashing: {
    timeMs: number
    memoryMB: number
    hashesGenerated: number
    collisionRate: number
    efficiency: number
  }

  regressionHandling: {
    timeMs: number
    memoryMB: number
    regressionsDetected: number
    resolutionSuccessRate: number
    efficiency: number
  }

  confidenceSelection: {
    timeMs: number
    memoryMB: number
    selectionsPerformed: number
    averageConfidence: number
    efficiency: number
  }

  growthPathAnalysis: {
    timeMs: number
    memoryMB: number
    pathsAnalyzed: number
    optimalPathsFound: number
    efficiency: number
  }

  conflictResolution: {
    timeMs: number
    memoryMB: number
    conflictsProcessed: number
    resolutionSuccessRate: number
    efficiency: number
  }
}

/**
 * Node in the merge decision tree
 */
export interface MergeDecisionNode {
  id: string
  nodeType: 'decision' | 'action' | 'result'
  timestamp: number

  // Decision information
  decisionPoint: string
  algorithm: string
  input: any
  output: any

  // Decision metrics
  confidence: number
  processingTimeMs: number
  alternativesConsidered: number

  // Tree structure
  parentId?: string
  childIds: string[]

  // Context
  contextData: Record<string, any>

  nodeMetadata: Record<string, any>
}

/**
 * Session-wide telemetry summary
 */
export interface SessionTelemetry {
  sessionId: string
  startTime: number
  endTime?: number

  // Session overview
  totalOperations: number
  successfulOperations: number
  failedOperations: number

  // Aggregate metrics
  totalProcessingTimeMs: number
  averageOperationTimeMs: number
  peakMemoryUsageMB: number
  totalTranscriptsProcessed: number

  // Quality metrics
  overallAccuracy: number
  overallConsistency: number
  overallCompleteness: number

  // Algorithm efficiency
  algorithmEfficiency: Record<string, number>

  // Error analysis
  errorDistribution: Map<string, number>
  warningDistribution: Map<string, number>

  // Performance trends
  performanceTrends: PerformanceTrend[]

  // Operations
  operations: MergeOperationTelemetry[]

  sessionMetadata: Record<string, any>
}

/**
 * Performance trend data
 */
export interface PerformanceTrend {
  metricName: string
  timePoints: number[]
  values: number[]
  trend: 'improving' | 'degrading' | 'stable'
  trendStrength: number
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  // Collection settings
  collection: {
    enabledEventTypes: TelemetryEventType[]
    minimumSeverity: TelemetrySeverity
    maxEventsPerOperation: number
    enablePerformanceMetrics: boolean
    enableDecisionTracking: boolean
  }

  // Storage settings
  storage: {
    enableInMemoryBuffer: boolean
    maxBufferSize: number
    enablePersistence: boolean
    persistenceFormat: 'json' | 'csv' | 'parquet'
    persistenceDirectory: string
    compressionEnabled: boolean
  }

  // Analysis settings
  analysis: {
    enableRealTimeAnalysis: boolean
    analysisIntervalMs: number
    enableTrendDetection: boolean
    enableAnomalyDetection: boolean
    anomalyThreshold: number
  }

  // Export settings
  export: {
    enableAutoExport: boolean
    exportIntervalMs: number
    exportFormats: Array<'json' | 'csv' | 'parquet' | 'xlsx'>
    exportDirectory: string
    includeRawEvents: boolean
    includeAggregateMetrics: boolean
  }

  // Performance settings
  performance: {
    enableSampling: boolean
    samplingRate: number
    maxImpactPercent: number
    enableAsyncProcessing: boolean
    bufferFlushIntervalMs: number
  }

  // Integration settings
  integration: {
    enableMetricsEndpoint: boolean
    enableHealthChecks: boolean
    enableDebugEndpoints: boolean
    webhookEndpoints: string[]
  }

  configMetadata: Record<string, any>
}

/**
 * Telemetry statistics
 */
export interface TelemetryStats {
  eventsCollected: number
  operationsTracked: number
  sessionsRecorded: number

  averageEventSize: number
  totalMemoryUsage: number
  collectionOverhead: number

  exportedDatasets: number
  lastExportTime: number

  errorRate: number
  warningRate: number

  performanceImpact: {
    averageLatencyMs: number
    maxLatencyMs: number
    throughputReduction: number
  }

  storageStats: {
    bufferUtilization: number
    persistedEvents: number
    compressionRatio: number
  }
}

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  collection: {
    enabledEventTypes: [
      'merge_started',
      'merge_completed',
      'merge_failed',
      'conflict_detected',
      'conflict_resolved',
      'performance_warning',
      'quality_threshold_breach'
    ],
    minimumSeverity: 'info',
    maxEventsPerOperation: 1000,
    enablePerformanceMetrics: true,
    enableDecisionTracking: true
  },

  storage: {
    enableInMemoryBuffer: true,
    maxBufferSize: 10000,
    enablePersistence: true,
    persistenceFormat: 'json',
    persistenceDirectory: './telemetry-data',
    compressionEnabled: true
  },

  analysis: {
    enableRealTimeAnalysis: true,
    analysisIntervalMs: 30000, // 30 seconds
    enableTrendDetection: true,
    enableAnomalyDetection: true,
    anomalyThreshold: 2.0 // 2 standard deviations
  },

  export: {
    enableAutoExport: true,
    exportIntervalMs: 300000, // 5 minutes
    exportFormats: ['json', 'csv'],
    exportDirectory: './telemetry-exports',
    includeRawEvents: true,
    includeAggregateMetrics: true
  },

  performance: {
    enableSampling: false,
    samplingRate: 0.1, // 10% sampling
    maxImpactPercent: 5, // Max 5% performance impact
    enableAsyncProcessing: true,
    bufferFlushIntervalMs: 10000 // 10 seconds
  },

  integration: {
    enableMetricsEndpoint: true,
    enableHealthChecks: true,
    enableDebugEndpoints: false,
    webhookEndpoints: []
  },

  configMetadata: {}
}

// ================================================================
// Visualization and Analysis Types
// ================================================================

/**
 * Data for decision tree visualization
 */
export interface DecisionTreeVisualization {
  treeId: string
  operationId: string

  // Tree structure
  nodes: DecisionTreeNode[]
  edges: DecisionTreeEdge[]

  // Visualization metadata
  layout: 'hierarchical' | 'radial' | 'force_directed'
  colorScheme: string
  nodeSize: 'uniform' | 'by_importance' | 'by_time'

  // Interactive features
  enableCollapsing: boolean
  enableFiltering: boolean
  enableSearch: boolean

  visualizationMetadata: Record<string, any>
}

/**
 * Node for decision tree visualization
 */
export interface DecisionTreeNode {
  id: string
  label: string
  nodeType: 'decision' | 'action' | 'result'

  // Visual properties
  position: {x: number; y: number}
  size: number
  color: string
  shape: 'circle' | 'square' | 'diamond' | 'triangle'

  // Data properties
  confidence: number
  processingTime: number
  importance: number

  // Interactive properties
  tooltip: string
  clickable: boolean
  collapsible: boolean

  nodeVisualizationMetadata: Record<string, any>
}

/**
 * Edge for decision tree visualization
 */
export interface DecisionTreeEdge {
  id: string
  sourceId: string
  targetId: string

  // Visual properties
  weight: number
  color: string
  style: 'solid' | 'dashed' | 'dotted'

  // Data properties
  confidence: number
  label?: string

  edgeVisualizationMetadata: Record<string, any>
}

/**
 * Performance metrics visualization
 */
export interface PerformanceVisualization {
  chartId: string
  chartType: 'line' | 'bar' | 'scatter' | 'heatmap' | 'gauge'

  // Data
  metrics: PerformanceMetricSeries[]
  timeRange: {start: number; end: number}

  // Visualization settings
  title: string
  xAxisLabel: string
  yAxisLabel: string
  showLegend: boolean
  showTrends: boolean

  // Interactive features
  enableZoom: boolean
  enablePan: boolean
  enableTooltips: boolean

  performanceVisualizationMetadata: Record<string, any>
}

/**
 * Performance metric series for visualization
 */
export interface PerformanceMetricSeries {
  name: string
  data: Array<{timestamp: number; value: number}>
  color: string
  lineStyle: 'solid' | 'dashed' | 'dotted'
  showPoints: boolean
}

// ================================================================
// Export and Analysis Types
// ================================================================

/**
 * Exported telemetry dataset
 */
export interface TelemetryDataset {
  datasetId: string
  generatedAt: number

  // Dataset scope
  sessionIds: string[]
  operationIds: string[]
  timeRange: {start: number; end: number}

  // Dataset contents
  events: TelemetryEvent[]
  operations: MergeOperationTelemetry[]
  sessions: SessionTelemetry[]

  // Aggregate metrics
  summary: DatasetSummary

  // Export metadata
  exportFormat: string
  compressionUsed: boolean
  fileSize: number

  datasetMetadata: Record<string, any>
}

/**
 * Summary of dataset contents
 */
export interface DatasetSummary {
  totalEvents: number
  totalOperations: number
  totalSessions: number

  eventTypeDistribution: Map<TelemetryEventType, number>
  severityDistribution: Map<TelemetrySeverity, number>

  performanceSummary: {
    averageOperationTime: number
    peakMemoryUsage: number
    totalProcessingTime: number
    errorRate: number
  }

  qualitySummary: {
    averageAccuracy: number
    averageConsistency: number
    averageCompleteness: number
    qualityTrend: 'improving' | 'degrading' | 'stable'
  }

  algorithmSummary: {
    mostUsedAlgorithm: string
    mostEfficientAlgorithm: string
    algorithmPerformanceRanking: Array<{
      algorithm: string
      efficiency: number
      usage: number
    }>
  }
}

/**
 * Analysis report generated from telemetry data
 */
export interface TelemetryAnalysisReport {
  reportId: string
  generatedAt: number
  analysisType: 'performance' | 'quality' | 'trends' | 'anomalies' | 'comprehensive'

  // Analysis scope
  datasetId: string
  analysisTimeRange: {start: number; end: number}

  // Key findings
  keyFindings: AnalysisFinding[]

  // Recommendations
  recommendations: AnalysisRecommendation[]

  // Detailed analysis sections
  performanceAnalysis?: PerformanceAnalysisSection
  qualityAnalysis?: QualityAnalysisSection
  trendAnalysis?: TrendAnalysisSection
  anomalyAnalysis?: AnomalyAnalysisSection

  // Confidence in analysis
  analysisConfidence: number
  dataQuality: number

  reportMetadata: Record<string, any>
}

/**
 * Individual finding from telemetry analysis
 */
export interface AnalysisFinding {
  findingId: string
  category: 'performance' | 'quality' | 'trend' | 'anomaly' | 'optimization'
  severity: 'info' | 'warning' | 'critical'

  title: string
  description: string
  evidence: any[]

  impactAssessment: {
    affectedComponents: string[]
    impactLevel: 'low' | 'medium' | 'high' | 'critical'
    affectedMetrics: string[]
  }

  confidence: number

  findingMetadata: Record<string, any>
}

/**
 * Recommendation from telemetry analysis
 */
export interface AnalysisRecommendation {
  recommendationId: string
  category: 'configuration' | 'algorithm' | 'infrastructure' | 'process'
  priority: 'low' | 'medium' | 'high' | 'urgent'

  title: string
  description: string
  rationale: string

  implementation: {
    effort: 'low' | 'medium' | 'high'
    timeline: string
    prerequisites: string[]
    steps: string[]
  }

  expectedBenefit: {
    performanceImprovement: number
    qualityImprovement: number
    efficiencyGain: number
  }

  confidence: number

  recommendationMetadata: Record<string, any>
}

/**
 * Performance analysis section
 */
export interface PerformanceAnalysisSection {
  overallPerformanceScore: number
  performanceTrend: 'improving' | 'degrading' | 'stable'

  bottleneckAnalysis: {
    primaryBottlenecks: string[]
    bottleneckImpact: Record<string, number>
    recommendedOptimizations: string[]
  }

  resourceUtilization: {
    cpuUtilization: number
    memoryUtilization: number
    ioUtilization: number
    utilizationTrends: Record<string, 'improving' | 'degrading' | 'stable'>
  }

  algorithmEfficiency: {
    mostEfficientAlgorithms: string[]
    leastEfficientAlgorithms: string[]
    efficiencyTrends: Record<string, number>
  }
}

/**
 * Quality analysis section
 */
export interface QualityAnalysisSection {
  overallQualityScore: number
  qualityTrend: 'improving' | 'degrading' | 'stable'

  accuracyAnalysis: {
    averageAccuracy: number
    accuracyDistribution: number[]
    accuracyTrend: 'improving' | 'degrading' | 'stable'
    lowAccuracyOperations: string[]
  }

  consistencyAnalysis: {
    averageConsistency: number
    consistencyVariance: number
    consistencyTrend: 'improving' | 'degrading' | 'stable'
    inconsistentOperations: string[]
  }

  completenessAnalysis: {
    averageCompleteness: number
    completenessGaps: string[]
    completenessTrend: 'improving' | 'degrading' | 'stable'
  }
}

/**
 * Trend analysis section
 */
export interface TrendAnalysisSection {
  significantTrends: PerformanceTrend[]
  trendSummary: Record<string, 'improving' | 'degrading' | 'stable'>

  seasonalPatterns: {
    detected: boolean
    patterns: Array<{
      metric: string
      periodMs: number
      amplitude: number
      confidence: number
    }>
  }

  correlationAnalysis: {
    strongCorrelations: Array<{
      metric1: string
      metric2: string
      correlation: number
      significance: number
    }>
  }
}

/**
 * Anomaly analysis section
 */
export interface AnomalyAnalysisSection {
  anomaliesDetected: number

  anomalies: Array<{
    anomalyId: string
    timestamp: number
    metric: string
    expectedValue: number
    actualValue: number
    severity: 'minor' | 'moderate' | 'major' | 'critical'
    potentialCauses: string[]
  }>

  anomalyPatterns: {
    recurringAnomalies: string[]
    anomalyFrequency: number
    mostCommonAnomalyTypes: string[]
  }
}

export {TelemetryEvent, MergeOperationTelemetry, SessionTelemetry, TelemetryConfig, TelemetryStats}
