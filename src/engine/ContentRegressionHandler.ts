/**
 * ContentRegressionHandler - Sophisticated Content Regression Analysis
 * 
 * Handles cases where shorter or revised content arrives after longer content,
 * implementing intelligent decision-making to determine whether to accept
 * revisions, keep original content, or merge both versions.
 * 
 * Key Features:
 * - Multi-factor regression analysis (length, confidence, temporal, similarity)
 * - Automatic decision making with configurable thresholds
 * - Version history tracking with rollback capabilities
 * - Performance monitoring and statistics
 * - Event-driven architecture for integration
 * - Risk assessment and mitigation strategies
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  ContentRegression,
  RegressionType,
  RegressionSeverity,
  RegressionAction,
  RegressionDecision,
  RegressionAnalysisResult,
  ContentVersion,
  ContentVersionHistory,
  RegressionDecisionFactor,
  RegressionChange,
  RegressionHandlerStats,
  RegressionPerformanceMetrics,
  ContentRegressionHandlerConfig,
  RegressionAnalysisOptions,
  RegressionApplicationOptions,
  BatchRegressionResult,
  RegressionRiskAssessment,
  RegressionRisk,
  DEFAULT_REGRESSION_HANDLER_CONFIG,
} from '../types/RegressionTypes';
import { TranscriptSegment } from '../types/HashTypes';

// ================================================================
// Content Regression Handler Implementation
// ================================================================

export class ContentRegressionHandler extends EventEmitter {
  private config: ContentRegressionHandlerConfig;
  
  // Version tracking
  private versionHistories = new Map<string, ContentVersionHistory>();
  private activeVersions = new Map<string, string>(); // segmentId -> versionId
  
  // Performance tracking
  private stats: RegressionHandlerStats = {
    totalAnalyses: 0,
    totalRegressions: 0,
    averageAnalysisTimeMs: 0,
    peakAnalysisTimeMs: 0,
    decisionBreakdown: new Map(),
    accuracyRate: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
    averageQualityImprovement: 0,
    contentLengthSaved: 0,
    confidenceImprovement: 0,
    memoryUsageBytes: 0,
    activeVersions: 0,
    cleanupOperations: 0,
  };
  
  // Internal state
  private performanceHistory: RegressionPerformanceMetrics[] = [];
  private analysisTimeHistory: number[] = [];
  private qualityImprovements: number[] = [];
  private cleanupTimer?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(config: Partial<ContentRegressionHandlerConfig> = {}) {
    super();
    this.config = this.mergeConfig(DEFAULT_REGRESSION_HANDLER_CONFIG, config);
    this.initialize();
  }

  // ================================================================
  // Initialization and Configuration
  // ================================================================

  private initialize(): void {
    try {
      // Initialize decision breakdown tracking
      this.initializeDecisionBreakdown();
      
      // Start cleanup timer if version history is enabled
      if (this.config.historyManagement.enableVersionHistory) {
        this.startHistoryCleanupTimer();
      }
      
      this.isInitialized = true;
      console.log('ContentRegressionHandler: Initialized successfully');
    } catch (error) {
      console.error('ContentRegressionHandler: Failed to initialize:', error);
      this.emit('error', error as Error, 'initialization');
    }
  }

  private initializeDecisionBreakdown(): void {
    const actions: RegressionAction[] = [
      'keep_original',
      'accept_revision', 
      'merge_contents',
      'flag_for_review',
      'create_alternative'
    ];
    
    for (const action of actions) {
      this.stats.decisionBreakdown.set(action, 0);
    }
  }

  updateConfig(updates: Partial<ContentRegressionHandlerConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    console.log('ContentRegressionHandler: Configuration updated');
  }

  getConfig(): ContentRegressionHandlerConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  // ================================================================
  // Core Regression Detection and Analysis
  // ================================================================

  /**
   * Analyze potential regression between original and revised content
   */
  async analyzeRegression(
    originalSegment: TranscriptSegment,
    revisedSegment: TranscriptSegment,
    _options: RegressionAnalysisOptions = {}
  ): Promise<RegressionAnalysisResult> {
    const startTime = Date.now();
    const analysisId = this.generateAnalysisId(originalSegment, revisedSegment);
    
    try {
      // Check if this is actually a regression scenario
      if (!this.isRegressionCandidate(originalSegment, revisedSegment)) {
        return this.createNonRegressionResult(originalSegment, revisedSegment, analysisId);
      }

      // Perform multi-factor analysis
      const lengthScore = this.analyzeLengthRegression(originalSegment, revisedSegment);
      const confidenceScore = this.analyzeConfidenceRegression(originalSegment, revisedSegment);
      const temporalScore = this.analyzeTemporalRelationship(originalSegment, revisedSegment);
      const similarityScore = await this.analyzeSimilarity(originalSegment, revisedSegment);

      // Calculate overall score and determine regression characteristics
      const overallScore = this.calculateOverallRegressionScore({
        lengthScore,
        confidenceScore,
        temporalScore,
        similarityScore
      });

      const regressionType = this.determineRegressionType(originalSegment, revisedSegment, {
        lengthScore,
        confidenceScore,
        similarityScore
      });

      const severity = this.determineSeverity(overallScore, regressionType);
      
      // Generate decision recommendation
      const decisionFactors = this.generateDecisionFactors({
        lengthScore,
        confidenceScore,
        temporalScore,
        similarityScore,
        overallScore
      });

      const recommendedAction = this.recommendAction(
        overallScore,
        regressionType,
        severity,
        decisionFactors
      );

      const actionConfidence = this.calculateActionConfidence(
        overallScore,
        decisionFactors,
        recommendedAction
      );

      // Perform risk assessment
      const riskAssessment = this.assessRegressionRisk(
        originalSegment,
        revisedSegment,
        recommendedAction,
        overallScore
      );

      // Create analysis result
      const result: RegressionAnalysisResult = {
        originalSegment,
        revisedSegment,
        analysisId,
        analyzedAt: Date.now(),
        lengthScore,
        confidenceScore,
        temporalScore,
        similarityScore,
        overallScore,
        regressionType,
        severity,
        isLikelyCorrection: this.isLikelyCorrection(originalSegment, revisedSegment, similarityScore),
        isStutteringRemoval: this.isStutteringRemoval(originalSegment, revisedSegment),
        isPunctuationFix: this.isPunctuationFix(originalSegment, revisedSegment),
        recommendedAction,
        actionConfidence,
        decisionFactors,
        riskAssessment,
      };

      // Update statistics
      const analysisTime = Date.now() - startTime;
      this.updateAnalysisStats(analysisTime);

      // Emit analysis event
      this.emit('regression:analyzed', result);

      return result;

    } catch (error) {
      console.error('ContentRegressionHandler: Analysis failed:', error);
      this.emit('error', error as Error, 'regression_analysis');
      throw new Error(`Regression analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Detect and create ContentRegression object from analysis
   */
  async detectRegression(
    originalSegment: TranscriptSegment,
    revisedSegment: TranscriptSegment,
    options: RegressionAnalysisOptions = {}
  ): Promise<ContentRegression | null> {
    try {
      const analysis = await this.analyzeRegression(originalSegment, revisedSegment, options);
      
      // Only create regression if we have a significant regression
      if (analysis.overallScore < this.config.analysisConfig.decisionMaking.autoDecisionThreshold &&
          analysis.severity !== 'low') {
        return null;
      }

      const regression: ContentRegression = {
        id: analysis.analysisId,
        type: analysis.regressionType,
        severity: analysis.severity,
        originalContent: originalSegment,
        revisedContent: revisedSegment,
        detectedAt: analysis.analyzedAt,
        confidence: analysis.overallScore,
        lengthDifference: originalSegment.content.length - revisedSegment.content.length,
        confidenceDifference: (revisedSegment.confidence || 0) - (originalSegment.confidence || 0),
        temporalDistance: Math.abs(revisedSegment.startTime - originalSegment.startTime),
        similarityScore: analysis.similarityScore,
        recommendedAction: analysis.recommendedAction,
        decisionFactors: analysis.decisionFactors,
        alternativeActions: this.generateAlternativeActions(analysis.recommendedAction, analysis),
      };

      this.stats.totalRegressions++;
      this.emit('regression:detected', regression);

      return regression;
    } catch (error) {
      console.error('ContentRegressionHandler: Detection failed:', error);
      return null;
    }
  }

  // ================================================================
  // Decision Making and Application
  // ================================================================

  /**
   * Make decision about how to handle a regression
   */
  async decideRegression(
    regression: ContentRegression,
    options: RegressionApplicationOptions = {}
  ): Promise<RegressionDecision> {
    try {
      const action = regression.recommendedAction;
      const confidence = this.calculateDecisionConfidence(regression);
      
      // Apply the decision
      const result = await this.applyRegressionDecision(regression, action, options);
      
      const decision: RegressionDecision = {
        regressionId: regression.id,
        action,
        decidedAt: Date.now(),
        confidence,
        finalContent: result.finalContent,
        alternativeContent: result.alternativeContent,
        appliedChanges: result.appliedChanges,
        preservedElements: result.preservedElements,
        decisionReasoning: this.generateDecisionReasoning(regression, action),
        automaticallyDecided: confidence >= this.config.analysisConfig.decisionMaking.autoDecisionThreshold,
        reviewRequired: regression.severity === 'critical' && 
                      this.config.integration.requireConfirmationForCritical,
      };

      // Update statistics
      this.updateDecisionStats(action, decision);
      
      // Create version history if enabled
      if (this.config.historyManagement.enableVersionHistory) {
        await this.createVersionHistory(regression, decision);
      }

      this.emit('regression:decided', decision);
      return decision;

    } catch (error) {
      console.error('ContentRegressionHandler: Decision failed:', error);
      this.emit('error', error as Error, 'regression_decision');
      throw error;
    }
  }

  /**
   * Apply a regression decision to get final content
   */
  private async applyRegressionDecision(
    regression: ContentRegression,
    action: RegressionAction,
    _options: RegressionApplicationOptions
  ): Promise<{
    finalContent: TranscriptSegment;
    alternativeContent?: TranscriptSegment;
    appliedChanges: RegressionChange[];
    preservedElements: string[];
  }> {
    const { originalContent, revisedContent } = regression;
    
    switch (action) {
      case 'keep_original':
        return {
          finalContent: originalContent,
          appliedChanges: [],
          preservedElements: [originalContent.content],
        };
        
      case 'accept_revision':
        return {
          finalContent: revisedContent,
          alternativeContent: originalContent,
          appliedChanges: this.generateChanges(originalContent, revisedContent),
          preservedElements: this.findPreservedElements(originalContent, revisedContent),
        };
        
      case 'merge_contents': {
        const mergeResult = await this.mergeContents(originalContent, revisedContent);
        return {
          finalContent: mergeResult.merged,
          alternativeContent: mergeResult.alternative,
          appliedChanges: mergeResult.changes,
          preservedElements: mergeResult.preserved,
        };
      }
        
      case 'flag_for_review':
        return {
          finalContent: originalContent, // Keep original pending review
          alternativeContent: revisedContent,
          appliedChanges: [],
          preservedElements: [originalContent.content],
        };
        
      case 'create_alternative':
        return {
          finalContent: originalContent,
          alternativeContent: revisedContent,
          appliedChanges: [],
          preservedElements: [originalContent.content, revisedContent.content],
        };
        
      default:
        throw new Error(`Unknown regression action: ${action}`);
    }
  }

  // ================================================================
  // Content Merging Logic
  // ================================================================

  /**
   * Intelligent content merging for regression scenarios
   */
  private async mergeContents(
    originalSegment: TranscriptSegment,
    revisedSegment: TranscriptSegment
  ): Promise<{
    merged: TranscriptSegment;
    alternative?: TranscriptSegment;
    changes: RegressionChange[];
    preserved: string[];
  }> {
    try {
      const originalWords = originalSegment.content.split(/\s+/);
      const revisedWords = revisedSegment.content.split(/\s+/);
      
      // Use dynamic programming to find optimal alignment
      const alignment = this.findOptimalAlignment(originalWords, revisedWords);
      
      // Build merged content based on alignment
      const mergedWords: string[] = [];
      const changes: RegressionChange[] = [];
      const preserved: string[] = [];
      
      let originalIndex = 0;
      let revisedIndex = 0;
      
      for (const operation of alignment) {
        switch (operation.type) {
          case 'match': {
            // Words match - use the higher confidence version
            const word = this.selectBetterWord(
              originalWords[originalIndex],
              revisedWords[revisedIndex],
              originalSegment.confidence || 0.5,
              revisedSegment.confidence || 0.5
            );
            mergedWords.push(word);
            preserved.push(word);
            originalIndex++;
            revisedIndex++;
            break;
          }
            
          case 'replace':
            // Word replacement - use revised version if confidence is higher
            if ((revisedSegment.confidence || 0) > (originalSegment.confidence || 0)) {
              mergedWords.push(revisedWords[revisedIndex]);
              changes.push({
                changeType: 'replacement',
                position: mergedWords.length - 1,
                originalText: originalWords[originalIndex],
                newText: revisedWords[revisedIndex],
                confidence: revisedSegment.confidence || 0.5,
                reason: 'Higher confidence replacement',
              });
            } else {
              mergedWords.push(originalWords[originalIndex]);
              preserved.push(originalWords[originalIndex]);
            }
            originalIndex++;
            revisedIndex++;
            break;
            
          case 'insert':
            // New word in revised - add if it seems valuable
            if (this.isValueableInsertion(revisedWords[revisedIndex], originalSegment, revisedSegment)) {
              mergedWords.push(revisedWords[revisedIndex]);
              changes.push({
                changeType: 'insertion',
                position: mergedWords.length - 1,
                originalText: '',
                newText: revisedWords[revisedIndex],
                confidence: revisedSegment.confidence || 0.5,
                reason: 'Valuable addition',
              });
            }
            revisedIndex++;
            break;
            
          case 'delete':
            // Word removed in revised - keep if it seems important
            if (this.isImportantWord(originalWords[originalIndex])) {
              mergedWords.push(originalWords[originalIndex]);
              preserved.push(originalWords[originalIndex]);
            } else {
              changes.push({
                changeType: 'deletion',
                position: mergedWords.length,
                originalText: originalWords[originalIndex],
                newText: '',
                confidence: revisedSegment.confidence || 0.5,
                reason: 'Stuttering or filler removal',
              });
            }
            originalIndex++;
            break;
        }
      }
      
      const mergedContent = mergedWords.join(' ');
      
      const merged: TranscriptSegment = {
        ...originalSegment,
        content: mergedContent,
        confidence: Math.max(
          originalSegment.confidence || 0.5,
          revisedSegment.confidence || 0.5
        ),
        endTime: Math.max(originalSegment.endTime, revisedSegment.endTime),
      };
      
      return {
        merged,
        alternative: revisedSegment,
        changes,
        preserved,
      };
      
    } catch (error) {
      console.error('ContentRegressionHandler: Content merging failed:', error);
      throw new Error(`Content merging failed: ${(error as Error).message}`);
    }
  }

  /**
   * Find optimal alignment between word arrays using dynamic programming
   */
  private findOptimalAlignment(original: string[], revised: string[]): Array<{
    type: 'match' | 'replace' | 'insert' | 'delete';
    originalIndex?: number;
    revisedIndex?: number;
  }> {
    const m = original.length;
    const n = revised.length;
    
    // DP table for edit distance with operation tracking
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(Infinity));
    const operations = Array(m + 1).fill(null).map(() => Array(n + 1).fill(''));
    
    // Initialize base cases
    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
      operations[i][0] = 'delete';
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
      operations[0][j] = 'insert';
    }
    
    // Fill DP table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const originalWord = original[i - 1];
        const revisedWord = revised[j - 1];
        
        if (this.wordsMatch(originalWord, revisedWord)) {
          dp[i][j] = dp[i - 1][j - 1];
          operations[i][j] = 'match';
        } else {
          // Consider all operations
          const replaceCost = dp[i - 1][j - 1] + 1;
          const insertCost = dp[i][j - 1] + 1;
          const deleteCost = dp[i - 1][j] + 1;
          
          const minCost = Math.min(replaceCost, insertCost, deleteCost);
          dp[i][j] = minCost;
          
          if (minCost === replaceCost) {
            operations[i][j] = 'replace';
          } else if (minCost === insertCost) {
            operations[i][j] = 'insert';
          } else {
            operations[i][j] = 'delete';
          }
        }
      }
    }
    
    // Backtrack to find the alignment
    const alignment: Array<{
      type: 'match' | 'replace' | 'insert' | 'delete';
      originalIndex?: number;
      revisedIndex?: number;
    }> = [];
    
    let i = m, j = n;
    while (i > 0 || j > 0) {
      const operation = operations[i][j];
      
      switch (operation) {
        case 'match':
        case 'replace':
          alignment.unshift({
            type: operation as 'match' | 'replace',
            originalIndex: i - 1,
            revisedIndex: j - 1,
          });
          i--;
          j--;
          break;
          
        case 'insert':
          alignment.unshift({
            type: 'insert',
            revisedIndex: j - 1,
          });
          j--;
          break;
          
        case 'delete':
          alignment.unshift({
            type: 'delete',
            originalIndex: i - 1,
          });
          i--;
          break;
      }
    }
    
    return alignment;
  }

  // ================================================================
  // Analysis Helper Methods
  // ================================================================

  /**
   * Check if segments are candidates for regression analysis
   */
  private isRegressionCandidate(original: TranscriptSegment, revised: TranscriptSegment): boolean {
    // Check basic requirements
    if (!original.content || !revised.content) return false;
    
    // Check temporal relationship
    const timeGap = Math.abs(revised.startTime - original.startTime);
    if (timeGap > this.config.analysisConfig.temporalAnalysis.maxTimeGap) return false;
    
    // Check if there's enough similarity to be related
    const minSimilarity = this.config.analysisConfig.similarityAnalysis.minSimilarityThreshold;
    const quickSimilarity = this.calculateQuickSimilarity(original.content, revised.content);
    
    return quickSimilarity >= minSimilarity;
  }

  /**
   * Analyze length-based regression indicators
   */
  private analyzeLengthRegression(original: TranscriptSegment, revised: TranscriptSegment): number {
    const originalLength = original.content.length;
    const revisedLength = revised.content.length;
    
    if (revisedLength >= originalLength) return 0; // No length regression
    
    const reduction = (originalLength - revisedLength) / originalLength;
    const config = this.config.analysisConfig.lengthAnalysis;
    
    // Score based on reduction percentage
    if (reduction < config.minReductionThreshold) return 0.2; // Minimal reduction
    if (reduction > config.maxReductionThreshold) return 0.9; // Excessive reduction
    
    // Linear scoring between thresholds
    const normalizedReduction = (reduction - config.minReductionThreshold) / 
                               (config.maxReductionThreshold - config.minReductionThreshold);
    
    return 0.2 + (normalizedReduction * 0.7); // Scale between 0.2 and 0.9
  }

  /**
   * Analyze confidence-based regression indicators
   */
  private analyzeConfidenceRegression(original: TranscriptSegment, revised: TranscriptSegment): number {
    const originalConf = original.confidence || 0.5;
    const revisedConf = revised.confidence || 0.5;
    
    const confidenceGain = revisedConf - originalConf;
    const config = this.config.analysisConfig.confidenceAnalysis;
    
    // Positive score for confidence improvements
    if (confidenceGain >= config.minConfidenceGain) {
      return Math.min(0.9, confidenceGain * 2); // Cap at 0.9
    }
    
    // Negative score for confidence degradation
    if (confidenceGain < -config.minConfidenceGain) {
      return Math.max(0.1, 0.5 + confidenceGain); // Floor at 0.1
    }
    
    return 0.5; // Neutral if no significant change
  }

  /**
   * Analyze temporal relationship between segments
   */
  private analyzeTemporalRelationship(original: TranscriptSegment, revised: TranscriptSegment): number {
    const timeGap = Math.abs(revised.startTime - original.startTime);
    const config = this.config.analysisConfig.temporalAnalysis;
    
    // Score based on recency (more recent = higher score)
    const recencyScore = Math.max(0, 1 - (timeGap / config.maxTimeGap));
    
    // Apply recency bias
    return recencyScore * (1 + config.recentBias);
  }

  /**
   * Analyze content similarity between segments
   */
  private async analyzeSimilarity(original: TranscriptSegment, revised: TranscriptSegment): Promise<number> {
    const config = this.config.analysisConfig.similarityAnalysis;
    
    // Calculate different similarity metrics
    const exactMatchScore = this.calculateExactMatchScore(original.content, revised.content);
    const positionScore = this.calculatePositionPreservationScore(original.content, revised.content);
    const semanticScore = await this.calculateSemanticSimilarity(original.content, revised.content);
    
    // Weighted combination
    return (
      exactMatchScore * config.exactMatchWeight +
      positionScore * config.positionWeight +
      semanticScore * config.semanticWeight
    );
  }

  /**
   * Calculate overall regression score from individual factors
   */
  private calculateOverallRegressionScore(scores: {
    lengthScore: number;
    confidenceScore: number;
    temporalScore: number;
    similarityScore: number;
  }): number {
    // Weighted combination with decay for conflicting factors
    const weights = {
      length: 0.25,
      confidence: 0.30,
      temporal: 0.20,
      similarity: 0.25,
    };
    
    const weightedSum = (
      scores.lengthScore * weights.length +
      scores.confidenceScore * weights.confidence +
      scores.temporalScore * weights.temporal +
      scores.similarityScore * weights.similarity
    );
    
    // Apply non-linear scaling to emphasize strong signals
    return Math.min(1.0, Math.pow(weightedSum, 0.8));
  }

  // ================================================================
  // Classification and Decision Methods
  // ================================================================

  /**
   * Determine the type of regression based on analysis
   */
  private determineRegressionType(
    original: TranscriptSegment,
    revised: TranscriptSegment,
    scores: { lengthScore: number; confidenceScore: number; similarityScore: number }
  ): RegressionType {
    // High confidence improvement suggests quality improvement
    if (scores.confidenceScore > 0.7) {
      return 'quality_improvement';
    }
    
    // Check for stuttering removal patterns
    if (this.isStutteringRemoval(original, revised)) {
      return 'stuttering_fix';
    }
    
    // Check for punctuation fixes
    if (this.isPunctuationFix(original, revised)) {
      return 'punctuation_fix';
    }
    
    // Check for simple word replacements
    if (this.isWordReplacement(original, revised)) {
      return 'word_replacement';
    }
    
    // High similarity with length reduction suggests correction
    if (scores.similarityScore > 0.8 && scores.lengthScore > 0.6) {
      return 'correction';
    }
    
    // Default to length reduction
    return 'length_reduction';
  }

  /**
   * Determine regression severity
   */
  private determineSeverity(overallScore: number, regressionType: RegressionType): RegressionSeverity {
    // Critical severity for high-risk scenarios
    if (overallScore > 0.9 && regressionType === 'length_reduction') {
      return 'critical';
    }
    
    // High severity for significant changes
    if (overallScore > 0.7) {
      return 'high';
    }
    
    // Medium severity for moderate changes
    if (overallScore > 0.4) {
      return 'medium';
    }
    
    // Low severity for minor changes
    return 'low';
  }

  /**
   * Recommend action based on analysis
   */
  private recommendAction(
    overallScore: number,
    regressionType: RegressionType,
    severity: RegressionSeverity,
    _factors: RegressionDecisionFactor[]
  ): RegressionAction {
    const config = this.config.analysisConfig.decisionMaking;
    
    // Critical severity always requires review
    if (severity === 'critical') {
      return 'flag_for_review';
    }
    
    // High confidence in regression with beneficial type
    if (overallScore > config.autoDecisionThreshold) {
      switch (regressionType) {
        case 'quality_improvement':
        case 'correction':
        case 'stuttering_fix':
        case 'punctuation_fix':
          return 'accept_revision';
        case 'word_replacement':
          return config.enableMerging ? 'merge_contents' : 'accept_revision';
        default:
          return 'keep_original';
      }
    }
    
    // Medium confidence scenarios
    if (overallScore > 0.5) {
      if (config.enableMerging && ['word_replacement', 'correction'].includes(regressionType)) {
        return 'merge_contents';
      }
      return 'create_alternative';
    }
    
    // Low confidence - be conservative
    return 'keep_original';
  }

  // ================================================================
  // Version History Management
  // ================================================================

  /**
   * Create version history entry for regression decision
   */
  private async createVersionHistory(
    regression: ContentRegression,
    decision: RegressionDecision
  ): Promise<void> {
    try {
      const segmentId = this.generateSegmentId(regression.originalContent);
      
      // Get or create version history
      let history = this.versionHistories.get(segmentId);
      if (!history) {
        history = {
          segmentId,
          versions: new Map(),
          activeVersionId: '',
          createdAt: Date.now(),
          lastModifiedAt: Date.now(),
          totalVersions: 0,
          totalRegressions: 0,
          averageQualityImprovement: 0,
          stabilityScore: 1.0,
        };
        this.versionHistories.set(segmentId, history);
      }
      
      // Create version for final content
      const versionId = this.generateVersionId(decision.finalContent);
      const version: ContentVersion = {
        versionId,
        content: decision.finalContent,
        versionNumber: history.totalVersions + 1,
        createdAt: Date.now(),
        source: this.mapActionToSource(decision.action),
        parentVersionId: history.activeVersionId || undefined,
        regressionId: regression.id,
        qualityScore: decision.finalContent.confidence || 0.5,
        isActive: true,
        changes: decision.appliedChanges,
        changesSummary: this.generateChangesSummary(decision.appliedChanges),
        improvementScore: this.calculateImprovementScore(regression, decision),
      };
      
      // Add to history
      history.versions.set(versionId, version);
      history.activeVersionId = versionId;
      history.lastModifiedAt = Date.now();
      history.totalVersions++;
      history.totalRegressions++;
      
      // Update active versions tracking
      this.activeVersions.set(segmentId, versionId);
      
      this.emit('version:created', version);
      this.emit('version:activated', versionId, segmentId);
      
    } catch (error) {
      console.error('ContentRegressionHandler: Version history creation failed:', error);
    }
  }

  // ================================================================
  // Utility Methods
  // ================================================================

  /**
   * Calculate quick similarity for candidate filtering
   */
  private calculateQuickSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Calculate exact match score between contents
   */
  private calculateExactMatchScore(content1: string, content2: string): number {
    const words1 = content1.split(/\s+/);
    const words2 = content2.split(/\s+/);
    
    const maxLength = Math.max(words1.length, words2.length);
    if (maxLength === 0) return 1.0;
    
    let matches = 0;
    const minLength = Math.min(words1.length, words2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (words1[i].toLowerCase() === words2[i].toLowerCase()) {
        matches++;
      }
    }
    
    return matches / maxLength;
  }

  /**
   * Calculate position preservation score
   */
  private calculatePositionPreservationScore(content1: string, content2: string): number {
    const words1 = content1.split(/\s+/);
    const words2 = content2.split(/\s+/);
    
    // Create position maps
    const pos1 = new Map<string, number[]>();
    const pos2 = new Map<string, number[]>();
    
    words1.forEach((word, i) => {
      const key = word.toLowerCase();
      if (!pos1.has(key)) pos1.set(key, []);
      pos1.get(key)!.push(i);
    });
    
    words2.forEach((word, i) => {
      const key = word.toLowerCase();
      if (!pos2.has(key)) pos2.set(key, []);
      pos2.get(key)!.push(i);
    });
    
    // Calculate position preservation
    let totalWords = 0;
    let preservedPositions = 0;
    
    for (const [word, positions1] of pos1) {
      const positions2 = pos2.get(word);
      if (positions2) {
        totalWords += Math.max(positions1.length, positions2.length);
        
        // Count preserved relative positions
        for (let i = 0; i < Math.min(positions1.length, positions2.length); i++) {
          const relativePos1 = positions1[i] / words1.length;
          const relativePos2 = positions2[i] / words2.length;
          
          if (Math.abs(relativePos1 - relativePos2) < 0.1) { // Within 10% of position
            preservedPositions++;
          }
        }
      } else {
        totalWords += positions1.length;
      }
    }
    
    return totalWords === 0 ? 0 : preservedPositions / totalWords;
  }

  /**
   * Calculate semantic similarity (simplified implementation)
   */
  private async calculateSemanticSimilarity(content1: string, content2: string): Promise<number> {
    // For now, use a simple word overlap approach
    // In production, you might use word embeddings or other NLP techniques
    
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Check if words match (allowing for minor variations)
   */
  private wordsMatch(word1: string, word2: string): boolean {
    const normalized1 = word1.toLowerCase().replace(/[^\w]/g, '');
    const normalized2 = word2.toLowerCase().replace(/[^\w]/g, '');
    
    return normalized1 === normalized2;
  }

  /**
   * Select better word based on confidence
   */
  private selectBetterWord(word1: string, word2: string, conf1: number, conf2: number): string {
    if (Math.abs(conf1 - conf2) < 0.1) {
      return word1; // Default to original if confidence is similar
    }
    return conf1 > conf2 ? word1 : word2;
  }

  /**
   * Check if insertion adds value
   */
  private isValueableInsertion(word: string, original: TranscriptSegment, revised: TranscriptSegment): boolean {
    // Skip common filler words
    const fillerWords = new Set(['um', 'uh', 'er', 'ah', 'like', 'you know']);
    if (fillerWords.has(word.toLowerCase())) return false;
    
    // Skip if word appears elsewhere in original
    if (original.content.toLowerCase().includes(word.toLowerCase())) return false;
    
    // Accept if revised has higher confidence
    return (revised.confidence || 0) > (original.confidence || 0);
  }

  /**
   * Check if word is important to preserve
   */
  private isImportantWord(word: string): boolean {
    const fillerWords = new Set(['um', 'uh', 'er', 'ah', 'like', 'you know', 'well']);
    const normalized = word.toLowerCase().replace(/[^\w]/g, '');
    
    return !fillerWords.has(normalized) && normalized.length > 1;
  }

  /**
   * Check if content represents stuttering removal
   */
  private isStutteringRemoval(original: TranscriptSegment, revised: TranscriptSegment): boolean {
    const originalWords = original.content.split(/\s+/);
    const revisedWords = revised.content.split(/\s+/);
    
    // Look for repeated word patterns in original that are cleaned up in revised
    const repeatedWords = this.findRepeatedWords(originalWords);
    if (repeatedWords.length === 0) return false;
    
    // Check if revised content removes these repetitions
    for (const word of repeatedWords) {
      const originalCount = originalWords.filter(w => w.toLowerCase() === word.toLowerCase()).length;
      const revisedCount = revisedWords.filter(w => w.toLowerCase() === word.toLowerCase()).length;
      
      if (revisedCount < originalCount) return true;
    }
    
    return false;
  }

  private findRepeatedWords(words: string[]): string[] {
    const wordCounts = new Map<string, number>();
    
    for (const word of words) {
      const normalized = word.toLowerCase();
      wordCounts.set(normalized, (wordCounts.get(normalized) || 0) + 1);
    }
    
    return Array.from(wordCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([word]) => word);
  }

  /**
   * Check if content represents punctuation fix
   */
  private isPunctuationFix(original: TranscriptSegment, revised: TranscriptSegment): boolean {
    const originalText = original.content.replace(/[^\w\s]/g, '');
    const revisedText = revised.content.replace(/[^\w\s]/g, '');
    
    // If words are identical after removing punctuation, it's likely a punctuation fix
    return originalText.toLowerCase() === revisedText.toLowerCase() && 
           original.content !== revised.content;
  }

  /**
   * Check if content represents word replacement
   */
  private isWordReplacement(original: TranscriptSegment, revised: TranscriptSegment): boolean {
    const originalWords = original.content.split(/\s+/);
    const revisedWords = revised.content.split(/\s+/);
    
    // Similar length suggests word replacement rather than major revision
    const lengthRatio = revisedWords.length / originalWords.length;
    return lengthRatio > 0.7 && lengthRatio < 1.3;
  }

  /**
   * Check if likely correction based on similarity and confidence
   */
  private isLikelyCorrection(original: TranscriptSegment, revised: TranscriptSegment, similarityScore: number): boolean {
    const confidenceImprovement = (revised.confidence || 0) - (original.confidence || 0);
    return similarityScore > 0.7 && confidenceImprovement > 0.1;
  }

  // ================================================================
  // Statistics and Performance Tracking
  // ================================================================

  private updateAnalysisStats(analysisTimeMs: number): void {
    this.stats.totalAnalyses++;
    
    // Update timing statistics
    this.analysisTimeHistory.push(analysisTimeMs);
    if (this.analysisTimeHistory.length > this.config.performanceMonitoring.maxStatsHistory) {
      this.analysisTimeHistory.shift();
    }
    
    this.stats.averageAnalysisTimeMs = 
      this.analysisTimeHistory.reduce((sum, time) => sum + time, 0) / this.analysisTimeHistory.length;
    
    if (analysisTimeMs > this.stats.peakAnalysisTimeMs) {
      this.stats.peakAnalysisTimeMs = analysisTimeMs;
    }
  }

  private updateDecisionStats(action: RegressionAction, decision: RegressionDecision): void {
    const currentCount = this.stats.decisionBreakdown.get(action) || 0;
    this.stats.decisionBreakdown.set(action, currentCount + 1);
    
    // Update improvement tracking if applicable
    if (decision.confidence > 0) {
      this.qualityImprovements.push(decision.confidence);
      if (this.qualityImprovements.length > this.config.performanceMonitoring.maxStatsHistory) {
        this.qualityImprovements.shift();
      }
      
      this.stats.averageQualityImprovement = 
        this.qualityImprovements.reduce((sum, imp) => sum + imp, 0) / this.qualityImprovements.length;
    }
  }

  getPerformanceStats(): RegressionHandlerStats {
    this.stats.memoryUsageBytes = this.estimateMemoryUsage();
    this.stats.activeVersions = this.activeVersions.size;
    return { ...this.stats };
  }

  private estimateMemoryUsage(): number {
    let usage = 0;
    
    // Estimate version history memory
    for (const history of this.versionHistories.values()) {
      usage += 200; // Base history object
      for (const version of history.versions.values()) {
        usage += version.content.content.length * 2; // UTF-16 encoding
        usage += 300; // Version object overhead
      }
    }
    
    // Estimate performance history memory
    usage += this.performanceHistory.length * 100;
    usage += this.analysisTimeHistory.length * 8; // Numbers
    
    return usage;
  }

  // ================================================================
  // Helper Method Implementations
  // ================================================================

  private generateAnalysisId(original: TranscriptSegment, revised: TranscriptSegment): string {
    const content = `${original.content}_${revised.content}_${original.startTime}_${revised.startTime}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private generateSegmentId(segment: TranscriptSegment): string {
    const content = `${segment.content}_${segment.startTime}_${segment.endTime}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
  }

  private generateVersionId(segment: TranscriptSegment): string {
    const content = `${segment.content}_${Date.now()}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
  }

  private createNonRegressionResult(
    original: TranscriptSegment,
    revised: TranscriptSegment,
    analysisId: string
  ): RegressionAnalysisResult {
    return {
      originalSegment: original,
      revisedSegment: revised,
      analysisId,
      analyzedAt: Date.now(),
      lengthScore: 0,
      confidenceScore: 0,
      temporalScore: 0,
      similarityScore: 0,
      overallScore: 0,
      regressionType: 'false_positive',
      severity: 'low',
      isLikelyCorrection: false,
      isStutteringRemoval: false,
      isPunctuationFix: false,
      recommendedAction: 'keep_original',
      actionConfidence: 1.0,
      decisionFactors: [],
      riskAssessment: {
        overallRisk: 'low',
        specificRisks: [],
        mitigationStrategies: [],
        reversibilityScore: 1.0,
        dataLossRisk: 0,
      },
    };
  }

  private generateDecisionFactors(scores: {
    lengthScore: number;
    confidenceScore: number;
    temporalScore: number;
    similarityScore: number;
    overallScore: number;
  }): RegressionDecisionFactor[] {
    return [
      {
        factor: 'length_change',
        value: scores.lengthScore,
        weight: 0.25,
        impact: scores.lengthScore > 0.5 ? 'positive' : 'neutral',
        description: 'Impact of content length changes on decision',
      },
      {
        factor: 'confidence_improvement',
        value: scores.confidenceScore,
        weight: 0.30,
        impact: scores.confidenceScore > 0.5 ? 'positive' : 'negative',
        description: 'Confidence score changes between versions',
      },
      {
        factor: 'temporal_proximity',
        value: scores.temporalScore,
        weight: 0.20,
        impact: 'positive',
        description: 'Temporal relationship between content versions',
      },
      {
        factor: 'content_similarity',
        value: scores.similarityScore,
        weight: 0.25,
        impact: scores.similarityScore > 0.7 ? 'positive' : 'negative',
        description: 'Semantic and structural similarity between versions',
      },
    ];
  }

  private generateAlternativeActions(
    recommended: RegressionAction,
    _analysis: RegressionAnalysisResult
  ): RegressionAction[] {
    const alternatives: RegressionAction[] = [];
    const actions: RegressionAction[] = [
      'keep_original',
      'accept_revision',
      'merge_contents',
      'flag_for_review',
      'create_alternative'
    ];
    
    for (const action of actions) {
      if (action !== recommended) {
        alternatives.push(action);
      }
    }
    
    return alternatives.slice(0, 2); // Return top 2 alternatives
  }

  private calculateActionConfidence(
    overallScore: number,
    factors: RegressionDecisionFactor[],
    action: RegressionAction
  ): number {
    // Base confidence from overall score
    let confidence = overallScore;
    
    // Adjust based on action type
    switch (action) {
      case 'keep_original':
        confidence *= 0.9; // Conservative action, slightly lower confidence
        break;
      case 'accept_revision':
        confidence *= 1.0; // Direct action, full confidence
        break;
      case 'merge_contents':
        confidence *= 0.8; // Complex action, lower confidence
        break;
      case 'flag_for_review':
        confidence = 0.5; // Always medium confidence for review
        break;
      case 'create_alternative':
        confidence *= 0.7; // Safe action but lower confidence
        break;
    }
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private assessRegressionRisk(
    original: TranscriptSegment,
    revised: TranscriptSegment,
    action: RegressionAction,
    _overallScore: number
  ): RegressionRiskAssessment {
    const risks: RegressionRisk[] = [];
    
    // Data loss risk
    if (revised.content.length < original.content.length * 0.5) {
      risks.push({
        type: 'data_loss',
        probability: 0.8,
        impact: 0.9,
        description: 'Significant content reduction may result in information loss',
        mitigation: 'Keep original content as alternative',
      });
    }
    
    // Quality degradation risk
    if ((revised.confidence || 0) < (original.confidence || 0)) {
      risks.push({
        type: 'quality_degradation',
        probability: 0.6,
        impact: 0.7,
        description: 'Revised content has lower confidence score',
        mitigation: 'Verify content quality before applying changes',
      });
    }
    
    // Calculate overall risk
    const avgProbability = risks.reduce((sum, r) => sum + r.probability, 0) / Math.max(1, risks.length);
    const overallRisk = avgProbability > 0.7 ? 'high' : avgProbability > 0.4 ? 'medium' : 'low';
    
    return {
      overallRisk,
      specificRisks: risks,
      mitigationStrategies: risks.map(r => r.mitigation).filter(Boolean) as string[],
      reversibilityScore: action === 'keep_original' ? 1.0 : 0.8,
      dataLossRisk: risks.find(r => r.type === 'data_loss')?.probability || 0,
    };
  }

  private calculateDecisionConfidence(regression: ContentRegression): number {
    // Base confidence from regression confidence
    let confidence = regression.confidence;
    
    // Adjust based on severity
    switch (regression.severity) {
      case 'low':
        confidence *= 0.9;
        break;
      case 'medium':
        confidence *= 1.0;
        break;
      case 'high':
        confidence *= 1.1;
        break;
      case 'critical':
        confidence = 0.5; // Always require review for critical
        break;
    }
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private generateDecisionReasoning(regression: ContentRegression, action: RegressionAction): string {
    const reasons: string[] = [];
    
    reasons.push(`Regression type: ${regression.type}`);
    reasons.push(`Severity: ${regression.severity}`);
    reasons.push(`Confidence: ${(regression.confidence * 100).toFixed(1)}%`);
    
    switch (action) {
      case 'keep_original':
        reasons.push('Preserving original content due to insufficient confidence in revision');
        break;
      case 'accept_revision':
        reasons.push('Accepting revision due to quality improvement indicators');
        break;
      case 'merge_contents':
        reasons.push('Merging contents to preserve valuable elements from both versions');
        break;
      case 'flag_for_review':
        reasons.push('Flagging for manual review due to high risk or complexity');
        break;
      case 'create_alternative':
        reasons.push('Creating alternative version to provide choice without data loss');
        break;
    }
    
    return reasons.join('; ');
  }

  private generateChanges(original: TranscriptSegment, revised: TranscriptSegment): RegressionChange[] {
    const changes: RegressionChange[] = [];
    
    if (original.content !== revised.content) {
      changes.push({
        changeType: 'replacement',
        position: 0,
        originalText: original.content,
        newText: revised.content,
        confidence: revised.confidence || 0.5,
        reason: 'Content revision',
      });
    }
    
    return changes;
  }

  private findPreservedElements(original: TranscriptSegment, revised: TranscriptSegment): string[] {
    const originalWords = new Set(original.content.toLowerCase().split(/\s+/));
    const revisedWords = new Set(revised.content.toLowerCase().split(/\s+/));
    
    return Array.from(originalWords).filter(word => revisedWords.has(word));
  }

  private mapActionToSource(action: RegressionAction): ContentVersion['source'] {
    switch (action) {
      case 'accept_revision':
        return 'revision';
      case 'merge_contents':
        return 'merge';
      case 'keep_original':
        return 'original';
      default:
        return 'correction';
    }
  }

  private generateChangesSummary(changes: RegressionChange[]): string {
    if (changes.length === 0) return 'No changes applied';
    
    const summary = changes.map(change => {
      switch (change.changeType) {
        case 'replacement':
          return `Replaced "${change.originalText}" with "${change.newText}"`;
        case 'insertion':
          return `Inserted "${change.newText}"`;
        case 'deletion':
          return `Deleted "${change.originalText}"`;
        case 'merge':
          return `Merged content`;
        default:
          return 'Unknown change';
      }
    });
    
    return summary.join('; ');
  }

  private calculateImprovementScore(regression: ContentRegression, decision: RegressionDecision): number {
    // Calculate improvement based on confidence change and content quality
    const originalConf = regression.originalContent.confidence || 0.5;
    const finalConf = decision.finalContent.confidence || 0.5;
    
    const confidenceImprovement = finalConf - originalConf;
    const actionBonus = decision.action === 'accept_revision' ? 0.1 : 0;
    
    return Math.max(-1.0, Math.min(1.0, confidenceImprovement + actionBonus));
  }

  private startHistoryCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupVersionHistory();
    }, this.config.historyManagement.historyCleanupIntervalMs);
  }

  private cleanupVersionHistory(): void {
    try {
      const retentionMs = this.config.historyManagement.retentionDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - retentionMs;
      let cleanedVersions = 0;
      
      for (const [segmentId, history] of this.versionHistories.entries()) {
        if (history.lastModifiedAt < cutoffTime) {
          // Remove entire history if too old
          this.versionHistories.delete(segmentId);
          this.activeVersions.delete(segmentId);
          cleanedVersions += history.totalVersions;
        } else {
          // Clean old versions within history
          const maxVersions = this.config.historyManagement.maxVersionsPerSegment;
          if (history.versions.size > maxVersions) {
            const versions = Array.from(history.versions.values())
              .sort((a, b) => a.createdAt - b.createdAt); // Oldest first
            
            const toRemove = versions.slice(0, versions.length - maxVersions);
            for (const version of toRemove) {
              history.versions.delete(version.versionId);
              cleanedVersions++;
            }
          }
        }
      }
      
      if (cleanedVersions > 0) {
        this.stats.cleanupOperations++;
        console.log(`ContentRegressionHandler: Cleaned up ${cleanedVersions} old versions`);
      }
    } catch (error) {
      console.error('ContentRegressionHandler: History cleanup failed:', error);
    }
  }

  private mergeConfig(
    base: ContentRegressionHandlerConfig,
    updates: Partial<ContentRegressionHandlerConfig>
  ): ContentRegressionHandlerConfig {
    const result = JSON.parse(JSON.stringify(base));
    
    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const value = updates[key as keyof ContentRegressionHandlerConfig];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = { ...result[key], ...value };
        } else if (value !== undefined) {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  // ================================================================
  // Public API Methods
  // ================================================================

  /**
   * Process multiple regressions in batch
   */
  async processBatch(
    regressions: Array<{
      original: TranscriptSegment;
      revised: TranscriptSegment;
      options?: RegressionAnalysisOptions;
    }>
  ): Promise<BatchRegressionResult> {
    const startTime = Date.now();
    const results: { segmentId: string; error?: Error; decision?: RegressionDecision }[] = [];
    
    try {
      // Process in batches
      const batchSize = this.config.processing.batchSize;
      
      for (let i = 0; i < regressions.length; i += batchSize) {
        const batch = regressions.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async ({ original, revised, options }) => {
          const segmentId = this.generateSegmentId(original);
          
          try {
            const regression = await this.detectRegression(original, revised, options);
            if (regression) {
              const decision = await this.decideRegression(regression);
              return { segmentId, decision };
            }
            return { segmentId };
          } catch (error) {
            return { segmentId, error: error as Error };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      
      // Compile results
      const successful = results.filter(r => r.decision && !r.error);
      const failed = results.filter(r => r.error);
      const decisions = successful.map(r => r.decision!);
      
      return {
        total: regressions.length,
        processed: results.length,
        successful: successful.length,
        failed: failed.length,
        decisions,
        errors: failed.map(r => ({ segmentId: r.segmentId, error: r.error! })),
        processingTimeMs: Date.now() - startTime,
      };
      
    } catch (error) {
      console.error('ContentRegressionHandler: Batch processing failed:', error);
      throw error;
    }
  }

  /**
   * Get version history for a segment
   */
  getVersionHistory(segmentId: string): ContentVersionHistory | undefined {
    return this.versionHistories.get(segmentId);
  }

  /**
   * Rollback to a previous version
   */
  async rollbackToVersion(segmentId: string, versionId: string): Promise<boolean> {
    try {
      const history = this.versionHistories.get(segmentId);
      if (!history) return false;
      
      const version = history.versions.get(versionId);
      if (!version) return false;
      
      // Deactivate current version
      const currentVersionId = history.activeVersionId;
      if (currentVersionId) {
        const currentVersion = history.versions.get(currentVersionId);
        if (currentVersion) {
          currentVersion.isActive = false;
        }
      }
      
      // Activate target version
      version.isActive = true;
      history.activeVersionId = versionId;
      history.lastModifiedAt = Date.now();
      
      this.activeVersions.set(segmentId, versionId);
      this.emit('version:activated', versionId, segmentId);
      
      return true;
    } catch (error) {
      console.error('ContentRegressionHandler: Rollback failed:', error);
      return false;
    }
  }

  /**
   * Clear all data and shutdown
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.versionHistories.clear();
    this.activeVersions.clear();
    this.performanceHistory = [];
    this.analysisTimeHistory = [];
    this.qualityImprovements = [];
    
    console.log('ContentRegressionHandler: Shut down successfully');
  }
}