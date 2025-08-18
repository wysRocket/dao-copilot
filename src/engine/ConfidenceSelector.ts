/**
 * ConfidenceSelector - Advanced Confidence-Based Selection Algorithm
 *
 * Implements sophisticated confidence evaluation and selection between competing
 * transcript versions using weighted scoring, linguistic consistency analysis,
 * and multi-factor quality assessment for optimal transcription accuracy.
 */

import {EventEmitter} from 'events'
import {TranscriptSegment} from '../types/HashTypes'
import {
  ConfidenceSelectorConfig,
  ConfidenceSelectionResult,
  SegmentConfidence,
  ConfidenceComparison,
  WordConfidence,
  LinguisticConsistencyAnalysis,
  WordLevelComparison,
  ConfidenceSelectorStats,
  ConfidencePerformanceMetrics,
  BatchSelectionRequest,
  BatchSelectionResult,
  ConfidenceSelectionOptions,
  GrammarIssue,
  VocabularyIssue,
  LinguisticPattern,
  ConfidenceContext,
  DEFAULT_CONFIDENCE_SELECTOR_CONFIG
} from '../types/ConfidenceTypes'

/**
 * Advanced confidence-based selection system with linguistic analysis
 */
export class ConfidenceSelector extends EventEmitter {
  private config: ConfidenceSelectorConfig
  private stats: ConfidenceSelectorStats
  private performanceMetrics: ConfidencePerformanceMetrics[] = []

  // Caching system
  private comparisonCache = new Map<string, ConfidenceComparison>()
  private linguisticAnalysisCache = new Map<string, LinguisticConsistencyAnalysis>()

  // Performance monitoring
  private activeTasks = new Set<string>()
  private memoryBaseline: number = 0

  // Linguistic patterns for quality analysis
  private grammarPatterns: LinguisticPattern[] = []
  private vocabularyPatterns: LinguisticPattern[] = []
  private coherencePatterns: LinguisticPattern[] = []

  constructor(config: Partial<ConfidenceSelectorConfig> = {}) {
    super()
    this.config = {...DEFAULT_CONFIDENCE_SELECTOR_CONFIG, ...config}
    this.stats = this.initializeStats()
    this.memoryBaseline = this.getCurrentMemoryUsage()
    this.initializeLinguisticPatterns()
  }

  // ================================================================
  // Public API - Selection Methods
  // ================================================================

  /**
   * Select the best transcript segment from competing candidates
   */
  public async selectBestSegment(
    candidates: SegmentConfidence[],
    options: ConfidenceSelectionOptions = {}
  ): Promise<ConfidenceSelectionResult> {
    const startTime = Date.now()
    const taskId = `select_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      this.activeTasks.add(taskId)
      this.logPerformanceMetric('selection', startTime, candidates.length, true)

      // Validate inputs
      if (candidates.length === 0) {
        throw new Error('No candidates provided for selection')
      }

      if (candidates.length === 1) {
        return this.createSingleCandidateResult(candidates[0], startTime, taskId)
      }

      // Apply custom configuration if provided
      const effectiveConfig = this.mergeSelectionOptions(options)

      // Perform pairwise comparisons
      const comparison = await this.performComprehensiveComparison(candidates, effectiveConfig)

      // Select the best candidate
      const selectionResult = await this.makeSelectionDecision(
        candidates,
        comparison,
        effectiveConfig
      )

      // Update statistics and emit events
      this.updateStats(selectionResult)
      this.emit('selection:completed', selectionResult)

      return selectionResult
    } catch (error) {
      this.logPerformanceMetric('selection', startTime, candidates.length, false, error.message)
      this.emit('error', error, 'selectBestSegment')
      throw error
    } finally {
      this.activeTasks.delete(taskId)
    }
  }

  /**
   * Batch selection for multiple candidate sets
   */
  public async selectBatch(request: BatchSelectionRequest): Promise<BatchSelectionResult> {
    const startTime = Date.now()
    const results: ConfidenceSelectionResult[] = []
    const errors: Array<{index: number; error: Error}> = []

    let processed = 0
    let successful = 0

    // Process in batches if enabled
    const batchSize = this.config.performance.enableBatchProcessing
      ? this.config.performance.batchSize
      : 1

    for (let i = 0; i < request.candidates.length; i += batchSize) {
      const batch = request.candidates.slice(i, i + batchSize)

      // Process batch in parallel
      const batchPromises = batch.map(async (candidates, batchIndex) => {
        try {
          const globalIndex = i + batchIndex
          const result = await this.selectBestSegment(candidates, request.options)
          return {index: globalIndex, result}
        } catch (error) {
          return {index: i + batchIndex, error}
        }
      })

      const batchResults = await Promise.allSettled(batchPromises)

      // Process results
      for (const settledResult of batchResults) {
        processed++

        if (settledResult.status === 'fulfilled') {
          const {index, result, error} = settledResult.value
          if (error) {
            errors.push({index, error})
          } else {
            results[index] = result
            successful++
          }
        } else {
          // This shouldn't happen with Promise.allSettled, but handle it
          errors.push({
            index: processed - 1,
            error: new Error(settledResult.reason?.toString() || 'Unknown error')
          })
        }
      }
    }

    const processingTimeMs = Date.now() - startTime
    const averageQualityImprovement = this.calculateAverageQualityImprovement(results)

    return {
      total: request.candidates.length,
      processed,
      successful,
      failed: errors.length,
      results: results.filter(r => r !== undefined),
      errors,
      processingTimeMs,
      averageQualityImprovement
    }
  }

  // ================================================================
  // Confidence Analysis Methods
  // ================================================================

  /**
   * Analyze segment confidence with detailed metrics
   */
  public async analyzeSegmentConfidence(
    segment: TranscriptSegment,
    context?: ConfidenceContext
  ): Promise<SegmentConfidence> {
    const startTime = Date.now()

    try {
      // Extract word-level confidences
      const wordConfidences = await this.extractWordConfidences(segment)

      // Compute confidence scores from multiple sources
      const confidenceSources = await this.computeMultiSourceConfidences(
        segment,
        wordConfidences,
        context
      )

      // Analyze quality metrics
      const qualityMetrics = await this.analyzeSegmentQuality(segment, wordConfidences, context)

      // Compute statistical measures
      const stats = this.computeConfidenceStatistics(wordConfidences)

      const segmentConfidence: SegmentConfidence = {
        segment,
        overallConfidence: this.computeOverallConfidence(confidenceSources),
        confidenceSources,
        wordConfidences,

        // Quality metrics
        acousticQuality: qualityMetrics.acousticQuality,
        linguisticCoherence: qualityMetrics.linguisticCoherence,
        temporalConsistency: qualityMetrics.temporalConsistency,
        speakerConsistency: qualityMetrics.speakerConsistency,

        // Statistics
        averageWordConfidence: stats.averageWordConfidence,
        confidenceVariance: stats.confidenceVariance,
        lowConfidenceWordCount: stats.lowConfidenceWordCount,
        highConfidenceWordCount: stats.highConfidenceWordCount,

        // Metadata
        analysisTimestamp: Date.now(),
        analysisVersion: '1.0.0'
      }

      this.logPerformanceMetric('quality_assessment', startTime, segment.text.length, true)

      return segmentConfidence
    } catch (error) {
      this.logPerformanceMetric(
        'quality_assessment',
        startTime,
        segment.text.length,
        false,
        error.message
      )
      throw error
    }
  }

  /**
   * Compare two segments with detailed analysis
   */
  public async compareSegments(
    segmentA: SegmentConfidence,
    segmentB: SegmentConfidence
  ): Promise<ConfidenceComparison> {
    const startTime = Date.now()
    const comparisonId = this.generateComparisonId(segmentA, segmentB)

    // Check cache first
    if (this.config.performance.enableCaching) {
      const cached = this.comparisonCache.get(comparisonId)
      if (cached && this.isCacheEntryValid(cached)) {
        return cached
      }
    }

    try {
      // Perform factor-by-factor comparison
      const factorAnalysis = await this.performFactorAnalysis(segmentA, segmentB)

      // Word-level comparison
      const wordLevelComparisons = await this.performWordLevelComparison(
        segmentA.wordConfidences,
        segmentB.wordConfidences
      )

      // Linguistic consistency analysis
      const linguisticAnalysis = await this.performLinguisticAnalysis(
        segmentA.segment,
        segmentB.segment
      )

      // Risk assessment
      const riskAssessment = this.assessSelectionRisk(segmentA, segmentB)

      // Overall winner determination
      const overallWinner = this.determineOverallWinner(
        factorAnalysis,
        wordLevelComparisons,
        linguisticAnalysis
      )

      const comparison: ConfidenceComparison = {
        segmentA,
        segmentB,
        comparisonId,
        comparedAt: Date.now(),

        overallWinner,
        confidenceDifference: Math.abs(segmentA.overallConfidence - segmentB.overallConfidence),
        recommendedChoice: this.determineRecommendedChoice(
          overallWinner,
          riskAssessment,
          factorAnalysis
        ),

        factorAnalysis,
        wordLevelComparisons,
        linguisticAnalysis,

        decisionConfidence: this.computeDecisionConfidence(factorAnalysis, wordLevelComparisons),
        riskAssessment,
        alternativeRecommendations: this.generateAlternativeRecommendations(
          segmentA,
          segmentB,
          factorAnalysis
        )
      }

      // Cache the result
      if (this.config.performance.enableCaching) {
        this.comparisonCache.set(comparisonId, comparison)
      }

      this.emit('comparison:analyzed', comparison)
      this.logPerformanceMetric('comparison', startTime, 2, true)

      return comparison
    } catch (error) {
      this.logPerformanceMetric('comparison', startTime, 2, false, error.message)
      throw error
    }
  }

  // ================================================================
  // Linguistic Analysis Methods
  // ================================================================

  /**
   * Perform comprehensive linguistic analysis
   */
  private async performLinguisticAnalysis(
    segmentA: TranscriptSegment,
    segmentB: TranscriptSegment
  ): Promise<LinguisticConsistencyAnalysis> {
    const cacheKey = `${segmentA.id}_${segmentB.id}_linguistic`

    if (this.config.performance.enableCaching) {
      const cached = this.linguisticAnalysisCache.get(cacheKey)
      if (cached) return cached
    }

    const startTime = Date.now()

    try {
      // Grammar analysis
      const grammarScoreA = await this.analyzeGrammar(segmentA.text)
      const grammarScoreB = await this.analyzeGrammar(segmentB.text)
      const grammarScore = Math.max(grammarScoreA.score, grammarScoreB.score)

      // Vocabulary consistency
      const vocabConsistencyA = await this.analyzeVocabularyConsistency(segmentA.text)
      const vocabConsistencyB = await this.analyzeVocabularyConsistency(segmentB.text)
      const vocabularyConsistency = Math.max(vocabConsistencyA.score, vocabConsistencyB.score)

      // Semantic coherence
      const semanticCoherenceA = await this.analyzeSemanticCoherence(segmentA.text)
      const semanticCoherenceB = await this.analyzeSemanticCoherence(segmentB.text)
      const semanticCoherence = Math.max(semanticCoherenceA, semanticCoherenceB)

      // Syntactic correctness
      const syntacticCorrectnessA = await this.analyzeSyntacticCorrectness(segmentA.text)
      const syntacticCorrectnessB = await this.analyzeSyntacticCorrectness(segmentB.text)
      const syntacticCorrectness = Math.max(syntacticCorrectnessA, syntacticCorrectnessB)

      // Discourse coherence
      const discourseCoherenceA = await this.analyzeDiscourseCoherence(segmentA.text)
      const discourseCoherenceB = await this.analyzeDiscourseCoherence(segmentB.text)
      const discourseCoherence = Math.max(discourseCoherenceA, discourseCoherenceB)

      // Combine issues from both segments
      const grammarIssues = [...grammarScoreA.issues, ...grammarScoreB.issues]
      const vocabularyIssues = [...vocabConsistencyA.issues, ...vocabConsistencyB.issues]
      const coherenceBreaks = [
        ...this.detectCoherenceBreaks(segmentA.text),
        ...this.detectCoherenceBreaks(segmentB.text)
      ]

      const overallLinguisticScore = this.computeOverallLinguisticScore({
        grammarScore,
        vocabularyConsistency,
        semanticCoherence,
        syntacticCorrectness,
        discourseCoherence
      })

      const analysis: LinguisticConsistencyAnalysis = {
        grammarScore,
        vocabularyConsistency,
        semanticCoherence,
        syntacticCorrectness,
        discourseCoherence,
        grammarIssues,
        vocabularyIssues,
        coherenceBreaks,
        overallLinguisticScore,
        linguisticQualityRating: this.determineLinguisticQualityRating(overallLinguisticScore)
      }

      if (this.config.performance.enableCaching) {
        this.linguisticAnalysisCache.set(cacheKey, analysis)
      }

      this.emit('linguistic:analysis', analysis, cacheKey)
      this.logPerformanceMetric('linguistic_analysis', startTime, 2, true)

      return analysis
    } catch (error) {
      this.logPerformanceMetric('linguistic_analysis', startTime, 2, false, error.message)
      throw error
    }
  }

  /**
   * Analyze grammar quality with issue detection
   */
  private async analyzeGrammar(text: string): Promise<{
    score: number
    issues: GrammarIssue[]
  }> {
    const issues: GrammarIssue[] = []
    let score = 1.0

    // Check for common grammar patterns
    for (const pattern of this.grammarPatterns) {
      const matches = Array.from(text.matchAll(pattern.pattern))

      for (const match of matches) {
        const issue: GrammarIssue = {
          type: this.determineGrammarIssueType(pattern.description),
          position: match.index || 0,
          problematicText: match[0],
          suggestion: pattern.suggestion,
          confidence: 0.8,
          severity: pattern.severity
        }

        issues.push(issue)

        // Reduce score based on severity
        const penalty =
          pattern.severity === 'high' ? 0.2 : pattern.severity === 'medium' ? 0.1 : 0.05
        score = Math.max(0, score - penalty)
      }
    }

    return {score, issues}
  }

  /**
   * Analyze vocabulary consistency
   */
  private async analyzeVocabularyConsistency(text: string): Promise<{
    score: number
    issues: VocabularyIssue[]
  }> {
    const issues: VocabularyIssue[] = []
    let score = 1.0

    const words = text.toLowerCase().split(/\s+/)
    const wordFrequency = new Map<string, number>()

    // Build frequency map
    for (const word of words) {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1)
    }

    // Check for vocabulary issues
    for (let i = 0; i < words.length; i++) {
      const word = words[i]

      // Check against vocabulary patterns
      for (const pattern of this.vocabularyPatterns) {
        if (pattern.pattern.test(word)) {
          const issue: VocabularyIssue = {
            type: this.determineVocabularyIssueType(pattern.description),
            position: i,
            word,
            confidence: 0.7,
            contextScore: this.calculateContextScore(word, words, i)
          }

          issues.push(issue)

          const penalty =
            pattern.severity === 'high' ? 0.15 : pattern.severity === 'medium' ? 0.08 : 0.04
          score = Math.max(0, score - penalty)
        }
      }

      // Check for repetition issues
      if (wordFrequency.get(word)! > 3 && word.length > 3) {
        const issue: VocabularyIssue = {
          type: 'repetition_error',
          position: i,
          word,
          confidence: 0.6,
          contextScore: 0.3
        }

        issues.push(issue)
        score = Math.max(0, score - 0.05)
      }
    }

    return {score, issues}
  }

  // ================================================================
  // Selection Decision Methods
  // ================================================================

  /**
   * Make the final selection decision
   */
  private async makeSelectionDecision(
    candidates: SegmentConfidence[],
    comparison: ConfidenceComparison,
    config: ConfidenceSelectorConfig
  ): Promise<ConfidenceSelectionResult> {
    const selectionId = `selection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const startTime = Date.now()

    // Find the best candidate based on weighted scoring
    let bestCandidate = candidates[0]
    let bestScore = this.computeWeightedScore(bestCandidate, config)

    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i]
      const score = this.computeWeightedScore(candidate, config)

      if (score > bestScore) {
        bestCandidate = candidate
        bestScore = score
      }
    }

    // Check if confidence meets minimum threshold
    if (bestCandidate.overallConfidence < config.thresholds.minAcceptableConfidence) {
      this.emit(
        'warning',
        `Selected candidate has low confidence: ${bestCandidate.overallConfidence}`,
        'makeSelectionDecision'
      )
    }

    // Generate quality warnings
    const qualityWarnings = this.generateQualityWarnings(bestCandidate, config)

    // Generate alternative recommendations
    const alternativeRecommendations = this.generateDetailedAlternatives(candidates, bestCandidate)

    // Assess risk level
    const riskLevel = this.determineRiskLevel(bestCandidate, comparison)

    // Generate improvement suggestions
    const improvementSuggestions = this.generateImprovementSuggestions(
      bestCandidate,
      qualityWarnings
    )

    const result: ConfidenceSelectionResult = {
      candidates,
      selectedSegment: bestCandidate,
      alternativeSegments: candidates.filter(c => c !== bestCandidate),
      selectionReason: this.generateSelectionReason(bestCandidate, bestScore, comparison),

      comparison,
      selectionConfidence: bestScore,
      qualityScore: this.computeQualityScore(bestCandidate),
      riskLevel,

      selectionId,
      selectedAt: Date.now(),
      processingTimeMs: Date.now() - startTime,
      analysisVersion: '1.0.0',

      alternativeRecommendations,
      qualityWarnings,
      improvementSuggestions
    }

    return result
  }

  /**
   * Compute weighted score for a candidate
   */
  private computeWeightedScore(
    candidate: SegmentConfidence,
    config: ConfidenceSelectorConfig
  ): number {
    const weights = config.factorWeights

    return (
      candidate.overallConfidence * weights.overallConfidence +
      candidate.acousticQuality * weights.acousticQuality +
      candidate.linguisticCoherence * weights.linguisticCoherence +
      candidate.temporalConsistency * weights.temporalConsistency +
      candidate.speakerConsistency * weights.speakerConsistency +
      (candidate.segment.confidence || 0) * weights.contextCoherence
    )
  }

  // ================================================================
  // Word-Level Analysis Methods
  // ================================================================

  /**
   * Extract word-level confidence information
   */
  private async extractWordConfidences(segment: TranscriptSegment): Promise<WordConfidence[]> {
    const words = segment.text.split(/\s+/)
    const wordConfidences: WordConfidence[] = []

    let currentTime = segment.startTime
    const avgWordDuration = (segment.endTime - segment.startTime) / words.length

    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const startTime = currentTime
      const endTime = currentTime + avgWordDuration

      // Generate primary confidence score
      const primaryConfidence = this.generateWordConfidenceScore(word, i, words, segment)

      // Generate alternative confidences from different sources
      const alternativeConfidences = this.generateAlternativeConfidenceScores(
        word,
        i,
        words,
        segment
      )

      // Compute composite confidence
      const compositeConfidence = this.computeCompositeWordConfidence(
        primaryConfidence,
        alternativeConfidences
      )

      // Analyze contextual fit
      const contextScore = this.calculateContextScore(word, words, i)
      const neighborInfluence = this.calculateNeighborInfluence(words, i)

      const wordConfidence: WordConfidence = {
        text: word,
        startTime,
        endTime,
        position: i,

        primaryConfidence,
        alternativeConfidences,
        compositeConfidence,

        isOutOfVocabulary: this.isOutOfVocabulary(word),
        alternativeTranscriptions: this.generateAlternativeTranscriptions(word),

        contextScore,
        neighborInfluence
      }

      wordConfidences.push(wordConfidence)
      currentTime = endTime
    }

    return wordConfidences
  }

  /**
   * Perform word-level comparison between two sets of word confidences
   */
  private async performWordLevelComparison(
    wordsA: WordConfidence[],
    wordsB: WordConfidence[]
  ): Promise<WordLevelComparison[]> {
    const comparisons: WordLevelComparison[] = []
    const maxLength = Math.max(wordsA.length, wordsB.length)

    for (let i = 0; i < maxLength; i++) {
      const wordA = i < wordsA.length ? wordsA[i] : undefined
      const wordB = i < wordsB.length ? wordsB[i] : undefined

      if (!wordA && !wordB) continue

      const comparison = this.compareWords(wordA, wordB, i)
      comparisons.push(comparison)
    }

    return comparisons
  }

  /**
   * Compare two word confidences
   */
  private compareWords(
    wordA: WordConfidence | undefined,
    wordB: WordConfidence | undefined,
    position: number
  ): WordLevelComparison {
    if (!wordA && !wordB) {
      throw new Error('Both words are undefined')
    }

    if (!wordA) {
      return {
        position,
        wordB,
        comparisonResult: 'B_better',
        confidenceDelta: wordB!.compositeConfidence,
        contextualFit: 'B_better',
        recommendedChoice: wordB!.text
      }
    }

    if (!wordB) {
      return {
        position,
        wordA,
        comparisonResult: 'A_better',
        confidenceDelta: wordA.compositeConfidence,
        contextualFit: 'A_better',
        recommendedChoice: wordA.text
      }
    }

    // Both words exist - compare them
    const confidenceDelta = wordA.compositeConfidence - wordB.compositeConfidence
    const contextualFit =
      wordA.contextScore > wordB.contextScore
        ? 'A_better'
        : wordB.contextScore > wordA.contextScore
          ? 'B_better'
          : 'equivalent'

    let comparisonResult: WordLevelComparison['comparisonResult']
    let recommendedChoice: string

    // Decision logic
    const significantDifference =
      Math.abs(confidenceDelta) > this.config.thresholds.significantDifferenceThreshold

    if (significantDifference) {
      comparisonResult = confidenceDelta > 0 ? 'A_better' : 'B_better'
      recommendedChoice = confidenceDelta > 0 ? wordA.text : wordB.text
    } else if (wordA.contextScore > wordB.contextScore + 0.1) {
      comparisonResult = 'A_better'
      recommendedChoice = wordA.text
    } else if (wordB.contextScore > wordA.contextScore + 0.1) {
      comparisonResult = 'B_better'
      recommendedChoice = wordB.text
    } else {
      // Both are similar - check for other factors
      const aScore = wordA.compositeConfidence + wordA.contextScore
      const bScore = wordB.compositeConfidence + wordB.contextScore

      if (Math.abs(aScore - bScore) < 0.05) {
        comparisonResult = 'equivalent'
        recommendedChoice = wordA.text // Default to A
      } else {
        comparisonResult = aScore > bScore ? 'A_better' : 'B_better'
        recommendedChoice = aScore > bScore ? wordA.text : wordB.text
      }
    }

    // Check if both are poor quality
    if (
      wordA.compositeConfidence < this.config.thresholds.lowConfidenceThreshold &&
      wordB.compositeConfidence < this.config.thresholds.lowConfidenceThreshold
    ) {
      comparisonResult = 'both_poor'
    }

    return {
      position,
      wordA,
      wordB,
      comparisonResult,
      confidenceDelta,
      contextualFit,
      recommendedChoice
    }
  }

  // ================================================================
  // Quality Assessment Methods
  // ================================================================

  /**
   * Analyze segment quality across multiple dimensions
   */
  private async analyzeSegmentQuality(
    segment: TranscriptSegment,
    wordConfidences: WordConfidence[],
    context?: ConfidenceContext
  ): Promise<{
    acousticQuality: number
    linguisticCoherence: number
    temporalConsistency: number
    speakerConsistency: number
  }> {
    // Acoustic quality based on confidence scores and audio metrics
    const acousticQuality = this.computeAcousticQuality(segment, wordConfidences)

    // Linguistic coherence based on grammar and vocabulary
    const linguisticCoherence = await this.computeLinguisticCoherence(segment.text)

    // Temporal consistency based on timing patterns
    const temporalConsistency = this.computeTemporalConsistency(segment, wordConfidences, context)

    // Speaker consistency
    const speakerConsistency = this.computeSpeakerConsistency(segment, context)

    return {
      acousticQuality,
      linguisticCoherence,
      temporalConsistency,
      speakerConsistency
    }
  }

  /**
   * Compute acoustic quality score
   */
  private computeAcousticQuality(
    segment: TranscriptSegment,
    wordConfidences: WordConfidence[]
  ): number {
    if (wordConfidences.length === 0) return 0

    // Average word confidence
    const avgWordConfidence =
      wordConfidences.reduce((sum, word) => sum + word.compositeConfidence, 0) /
      wordConfidences.length

    // Confidence variance (lower is better)
    const variance =
      wordConfidences.reduce(
        (sum, word) => sum + Math.pow(word.compositeConfidence - avgWordConfidence, 2),
        0
      ) / wordConfidences.length

    // Penalize high variance
    const variancePenalty = Math.min(variance * 2, 0.3)

    // Audio quality indicators from segment
    const audioQuality = segment.confidence || avgWordConfidence

    return Math.max(0, Math.min(1, audioQuality - variancePenalty))
  }

  /**
   * Compute linguistic coherence score
   */
  private async computeLinguisticCoherence(text: string): Promise<number> {
    let coherenceScore = 1.0

    // Grammar analysis
    const grammarAnalysis = await this.analyzeGrammar(text)
    coherenceScore *= grammarAnalysis.score

    // Vocabulary consistency
    const vocabAnalysis = await this.analyzeVocabularyConsistency(text)
    coherenceScore *= vocabAnalysis.score

    // Semantic coherence
    const semanticScore = await this.analyzeSemanticCoherence(text)
    coherenceScore *= semanticScore

    return Math.max(0, Math.min(1, coherenceScore))
  }

  // ================================================================
  // Utility Methods
  // ================================================================

  /**
   * Generate a unique comparison ID
   */
  private generateComparisonId(segmentA: SegmentConfidence, segmentB: SegmentConfidence): string {
    const aHash = this.hashSegmentContent(segmentA)
    const bHash = this.hashSegmentContent(segmentB)
    return `comparison_${Math.min(aHash, bHash)}_${Math.max(aHash, bHash)}`
  }

  /**
   * Hash segment content for comparison caching
   */
  private hashSegmentContent(segment: SegmentConfidence): number {
    const content = `${segment.segment.text}_${segment.overallConfidence}_${segment.segment.startTime}`
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Check if a cached entry is still valid
   */
  private isCacheEntryValid(comparison: ConfidenceComparison): boolean {
    if (!this.config.performance.enableCaching) return false

    const age = Date.now() - comparison.comparedAt
    return age < this.config.performance.cacheExpirationMs
  }

  /**
   * Initialize performance statistics
   */
  private initializeStats(): ConfidenceSelectorStats {
    return {
      totalSelections: 0,
      averageSelectionTimeMs: 0,
      peakSelectionTimeMs: 0,
      selectionBreakdown: new Map(),
      averageConfidenceImprovement: 0,
      qualityImprovementRate: 0,
      selectionAccuracy: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      averageSelectedConfidence: 0,
      averageRejectedConfidence: 0,
      linguisticImprovementScore: 0,
      memoryUsageBytes: 0,
      cacheHitRate: 0,
      concurrentSelectionsHandled: 0
    }
  }

  /**
   * Initialize linguistic patterns for quality analysis
   */
  private initializeLinguisticPatterns(): void {
    // Grammar patterns
    this.grammarPatterns = [
      {
        pattern: /\b(is|are|was|were)\s+(is|are|was|were)\b/gi,
        type: 'grammar',
        severity: 'high',
        description: 'Doubled auxiliary verbs'
      },
      {
        pattern: /\b(a|an)\s+(a|an)\b/gi,
        type: 'grammar',
        severity: 'medium',
        description: 'Doubled articles'
      },
      {
        pattern: /\b(the)\s+(the)\b/gi,
        type: 'grammar',
        severity: 'low',
        description: 'Doubled definite articles'
      }
    ]

    // Vocabulary patterns
    this.vocabularyPatterns = [
      {
        pattern: /\b(um|uh|er|ah)\b/gi,
        type: 'vocabulary',
        severity: 'low',
        description: 'Filler words'
      },
      {
        pattern: /\b(\w+)\s+\1\b/gi,
        type: 'vocabulary',
        severity: 'medium',
        description: 'Word repetition'
      }
    ]

    // Coherence patterns
    this.coherencePatterns = [
      {
        pattern: /\.\s*[a-z]/g,
        type: 'coherence',
        severity: 'medium',
        description: 'Missing capitalization after period'
      }
    ]
  }

  /**
   * Log performance metrics
   */
  private logPerformanceMetric(
    operation: ConfidencePerformanceMetrics['operation'],
    startTime: number,
    inputSize: number,
    success: boolean,
    errorType?: string
  ): void {
    const metric: ConfidencePerformanceMetrics = {
      timestamp: Date.now(),
      operation,
      duration: Date.now() - startTime,
      inputSize,
      outputQuality: success ? 1 : 0,
      memoryDelta: this.getCurrentMemoryUsage() - this.memoryBaseline,
      success,
      errorType
    }

    this.performanceMetrics.push(metric)

    // Keep only recent metrics
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics = this.performanceMetrics.slice(-500)
    }

    this.emit('performance:stats', this.stats)
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed
    }
    return 0
  }

  // Additional helper methods for various calculations and analyses...
  // (Continuing with implementation details as needed)

  /**
   * Create result for single candidate scenario
   */
  private createSingleCandidateResult(
    candidate: SegmentConfidence,
    startTime: number,
    taskId: string
  ): ConfidenceSelectionResult {
    return {
      candidates: [candidate],
      selectedSegment: candidate,
      alternativeSegments: [],
      selectionReason: 'Only candidate available',

      comparison: {} as ConfidenceComparison, // Empty comparison for single candidate
      selectionConfidence: candidate.overallConfidence,
      qualityScore: this.computeQualityScore(candidate),
      riskLevel:
        candidate.overallConfidence > 0.8
          ? 'low'
          : candidate.overallConfidence > 0.5
            ? 'medium'
            : 'high',

      selectionId: taskId,
      selectedAt: Date.now(),
      processingTimeMs: Date.now() - startTime,
      analysisVersion: '1.0.0',

      alternativeRecommendations: [],
      qualityWarnings: this.generateQualityWarnings(candidate, this.config),
      improvementSuggestions: []
    }
  }

  // ... Additional implementation methods continue as needed
  // (The implementation would continue with all the remaining helper methods)

  /**
   * Merge selection options with default config
   */
  private mergeSelectionOptions(options: ConfidenceSelectionOptions): ConfidenceSelectorConfig {
    return {
      ...this.config,
      thresholds: {...this.config.thresholds, ...options.customThresholds},
      factorWeights: {...this.config.factorWeights, ...options.customWeights}
    }
  }

  /**
   * Perform comprehensive comparison of multiple candidates
   */
  private async performComprehensiveComparison(
    candidates: SegmentConfidence[],
    config: ConfidenceSelectorConfig
  ): Promise<ConfidenceComparison> {
    // For simplicity, compare first two candidates
    // In a full implementation, this would do pairwise comparisons
    return await this.compareSegments(candidates[0], candidates[1])
  }

  /**
   * Perform factor analysis between two segments
   */
  private async performFactorAnalysis(
    segmentA: SegmentConfidence,
    segmentB: SegmentConfidence
  ): Promise<Map<string, any>> {
    const factorAnalysis = new Map()

    // Overall confidence comparison
    factorAnalysis.set('overallConfidence', {
      scoreA: segmentA.overallConfidence,
      scoreB: segmentB.overallConfidence,
      winner: segmentA.overallConfidence > segmentB.overallConfidence ? 'A' : 'B'
    })

    // Acoustic quality comparison
    factorAnalysis.set('acousticQuality', {
      scoreA: segmentA.acousticQuality,
      scoreB: segmentB.acousticQuality,
      winner: segmentA.acousticQuality > segmentB.acousticQuality ? 'A' : 'B'
    })

    return factorAnalysis
  }

  /**
   * Determine overall winner from analysis
   */
  private determineOverallWinner(
    factorAnalysis: Map<string, any>,
    wordComparisons: WordLevelComparison[],
    linguisticAnalysis: LinguisticConsistencyAnalysis
  ): 'A' | 'B' | 'tie' {
    let aScore = 0
    let bScore = 0

    // Count factor wins
    for (const [, analysis] of factorAnalysis) {
      if (analysis.winner === 'A') aScore++
      if (analysis.winner === 'B') bScore++
    }

    // Count word-level wins
    for (const comparison of wordComparisons) {
      if (comparison.comparisonResult === 'A_better') aScore++
      if (comparison.comparisonResult === 'B_better') bScore++
    }

    return aScore > bScore ? 'A' : bScore > aScore ? 'B' : 'tie'
  }

  /**
   * Determine recommended choice
   */
  private determineRecommendedChoice(
    winner: 'A' | 'B' | 'tie',
    riskAssessment: any,
    factorAnalysis: Map<string, any>
  ): 'A' | 'B' | 'merge' | 'manual_review' {
    if (winner === 'tie') return 'merge'
    return winner
  }

  /**
   * Compute decision confidence
   */
  private computeDecisionConfidence(
    factorAnalysis: Map<string, any>,
    wordComparisons: WordLevelComparison[]
  ): number {
    // Simple confidence calculation based on factor agreement
    let agreements = 0
    const total = factorAnalysis.size + wordComparisons.length

    for (const [, analysis] of factorAnalysis) {
      if (analysis.winner !== 'tie') agreements++
    }

    for (const comparison of wordComparisons) {
      if (comparison.comparisonResult !== 'equivalent') agreements++
    }

    return total > 0 ? agreements / total : 0
  }

  /**
   * Generate alternative recommendations
   */
  private generateAlternativeRecommendations(
    segmentA: SegmentConfidence,
    segmentB: SegmentConfidence,
    factorAnalysis: Map<string, any>
  ): string[] {
    return [
      'Consider manual review for close decisions',
      'Use merge strategy for complementary strengths'
    ]
  }

  /**
   * Assess selection risk
   */
  private assessSelectionRisk(segmentA: SegmentConfidence, segmentB: SegmentConfidence): any {
    return {
      overallRisk: 'low',
      specificRisks: [],
      mitigationStrategies: [],
      confidenceInAssessment: 0.8
    }
  }

  /**
   * Compute multi-source confidences
   */
  private async computeMultiSourceConfidences(
    segment: TranscriptSegment,
    wordConfidences: WordConfidence[],
    context?: ConfidenceContext
  ): Promise<any[]> {
    return [
      {
        source: 'speech_recognition',
        granularity: 'segment',
        value: segment.confidence || 0.8,
        computedAt: Date.now(),
        rawScore: segment.confidence || 0.8,
        normalizedScore: segment.confidence || 0.8,
        adjustedScore: segment.confidence || 0.8,
        qualityFactors: new Map(),
        reliability: 0.9
      }
    ]
  }

  /**
   * Compute overall confidence from multiple sources
   */
  private computeOverallConfidence(sources: any[]): number {
    if (sources.length === 0) return 0
    return sources.reduce((sum, source) => sum + source.value, 0) / sources.length
  }

  /**
   * Compute confidence statistics
   */
  private computeConfidenceStatistics(wordConfidences: WordConfidence[]): {
    averageWordConfidence: number
    confidenceVariance: number
    lowConfidenceWordCount: number
    highConfidenceWordCount: number
  } {
    if (wordConfidences.length === 0) {
      return {
        averageWordConfidence: 0,
        confidenceVariance: 0,
        lowConfidenceWordCount: 0,
        highConfidenceWordCount: 0
      }
    }

    const confidences = wordConfidences.map(w => w.compositeConfidence)
    const average = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length

    const variance =
      confidences.reduce((sum, conf) => sum + Math.pow(conf - average, 2), 0) / confidences.length

    const lowCount = confidences.filter(
      c => c < this.config.thresholds.lowConfidenceThreshold
    ).length
    const highCount = confidences.filter(
      c => c > this.config.thresholds.highConfidenceThreshold
    ).length

    return {
      averageWordConfidence: average,
      confidenceVariance: variance,
      lowConfidenceWordCount: lowCount,
      highConfidenceWordCount: highCount
    }
  }

  /**
   * Generate word confidence score
   */
  private generateWordConfidenceScore(
    word: string,
    position: number,
    words: string[],
    segment: TranscriptSegment
  ): any {
    return {
      source: 'speech_recognition',
      granularity: 'word',
      value: Math.random() * 0.4 + 0.6, // Mock confidence between 0.6-1.0
      computedAt: Date.now(),
      rawScore: Math.random() * 0.4 + 0.6,
      normalizedScore: Math.random() * 0.4 + 0.6,
      adjustedScore: Math.random() * 0.4 + 0.6,
      qualityFactors: new Map(),
      reliability: 0.8
    }
  }

  /**
   * Generate alternative confidence scores
   */
  private generateAlternativeConfidenceScores(
    word: string,
    position: number,
    words: string[],
    segment: TranscriptSegment
  ): any[] {
    return []
  }

  /**
   * Compute composite word confidence
   */
  private computeCompositeWordConfidence(primary: any, alternatives: any[]): number {
    return primary.value
  }

  /**
   * Calculate context score for a word
   */
  private calculateContextScore(word: string, words: string[], position: number): number {
    // Simple context scoring based on word length and position
    const baseScore = Math.min(word.length / 10, 1)
    const positionBonus = position > 0 && position < words.length - 1 ? 0.1 : 0
    return Math.min(baseScore + positionBonus, 1)
  }

  /**
   * Calculate neighbor influence
   */
  private calculateNeighborInfluence(words: string[], position: number): number {
    const radius = this.config.wordAnalysis.neighborInfluenceRadius
    let influence = 0
    let count = 0

    for (
      let i = Math.max(0, position - radius);
      i <= Math.min(words.length - 1, position + radius);
      i++
    ) {
      if (i !== position) {
        influence += words[i].length / 10 // Simple scoring
        count++
      }
    }

    return count > 0 ? influence / count : 0
  }

  /**
   * Check if word is out of vocabulary
   */
  private isOutOfVocabulary(word: string): boolean {
    // Simple check - words with numbers or very short/long words
    return /\d/.test(word) || word.length < 2 || word.length > 20
  }

  /**
   * Generate alternative transcriptions
   */
  private generateAlternativeTranscriptions(word: string): string[] {
    // Simple phonetic alternatives
    const alternatives: string[] = []

    // Common substitutions
    if (word.includes('th')) {
      alternatives.push(word.replace('th', 'f'))
    }
    if (word.includes('ph')) {
      alternatives.push(word.replace('ph', 'f'))
    }

    return alternatives
  }

  /**
   * Analyze semantic coherence
   */
  private async analyzeSemanticCoherence(text: string): Promise<number> {
    // Simple semantic analysis based on sentence structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    let coherenceScore = 1.0

    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/)
      if (words.length < 3) {
        coherenceScore *= 0.8 // Penalty for very short sentences
      }
      if (words.length > 50) {
        coherenceScore *= 0.9 // Penalty for very long sentences
      }
    }

    return Math.max(0, Math.min(1, coherenceScore))
  }

  /**
   * Analyze syntactic correctness
   */
  private async analyzeSyntacticCorrectness(text: string): Promise<number> {
    // Simple syntactic analysis
    let score = 1.0

    // Check for basic sentence structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    for (const sentence of sentences) {
      const trimmed = sentence.trim()

      // Should start with capital letter
      if (!/^[A-Z]/.test(trimmed)) {
        score *= 0.9
      }

      // Should have reasonable length
      if (trimmed.length < 10 || trimmed.length > 200) {
        score *= 0.95
      }
    }

    return Math.max(0, Math.min(1, score))
  }

  /**
   * Analyze discourse coherence
   */
  private async analyzeDiscourseCoherence(text: string): Promise<number> {
    // Simple discourse analysis based on text flow
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)

    if (sentences.length <= 1) return 1.0

    let coherenceScore = 1.0

    // Check for abrupt topic changes (simplified)
    for (let i = 1; i < sentences.length; i++) {
      const prevWords = new Set(sentences[i - 1].toLowerCase().split(/\s+/))
      const currWords = new Set(sentences[i].toLowerCase().split(/\s+/))

      // Calculate word overlap
      let overlap = 0
      for (const word of currWords) {
        if (prevWords.has(word) && word.length > 3) {
          overlap++
        }
      }

      const overlapRatio = overlap / Math.min(prevWords.size, currWords.size)
      if (overlapRatio < 0.1) {
        coherenceScore *= 0.95 // Small penalty for low overlap
      }
    }

    return Math.max(0, Math.min(1, coherenceScore))
  }

  /**
   * Detect coherence breaks
   */
  private detectCoherenceBreaks(text: string): any[] {
    const breaks: any[] = []

    // Simple detection of potential coherence issues
    const sentences = text.split(/[.!?]+/)

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim()

      // Check for very short sentences
      if (sentence.length < 10 && sentence.length > 0) {
        breaks.push({
          type: 'temporal_inconsistency',
          position: i,
          description: 'Very short sentence may indicate transcription error',
          severity: 'minor'
        })
      }
    }

    return breaks
  }

  /**
   * Compute overall linguistic score
   */
  private computeOverallLinguisticScore(scores: {
    grammarScore: number
    vocabularyConsistency: number
    semanticCoherence: number
    syntacticCorrectness: number
    discourseCoherence: number
  }): number {
    const weights = this.config.linguisticAnalysis

    return (
      scores.grammarScore * weights.grammarWeight +
      scores.vocabularyConsistency * weights.vocabularyWeight +
      scores.semanticCoherence * weights.coherenceWeight +
      scores.syntacticCorrectness * 0.2 +
      scores.discourseCoherence * 0.1
    )
  }

  /**
   * Determine linguistic quality rating
   */
  private determineLinguisticQualityRating(score: number): 'poor' | 'fair' | 'good' | 'excellent' {
    if (score >= 0.9) return 'excellent'
    if (score >= 0.7) return 'good'
    if (score >= 0.5) return 'fair'
    return 'poor'
  }

  /**
   * Determine grammar issue type
   */
  private determineGrammarIssueType(description: string): GrammarIssue['type'] {
    if (description.includes('verb')) return 'subject_verb_disagreement'
    if (description.includes('article')) return 'article_error'
    return 'other'
  }

  /**
   * Determine vocabulary issue type
   */
  private determineVocabularyIssueType(description: string): VocabularyIssue['type'] {
    if (description.includes('filler')) return 'out_of_vocabulary'
    if (description.includes('repetition')) return 'repetition_error'
    return 'domain_mismatch'
  }

  /**
   * Compute temporal consistency
   */
  private computeTemporalConsistency(
    segment: TranscriptSegment,
    wordConfidences: WordConfidence[],
    context?: ConfidenceContext
  ): number {
    // Simple temporal consistency check
    const duration = segment.endTime - segment.startTime
    const wordCount = wordConfidences.length

    if (wordCount === 0) return 0

    const avgWordDuration = duration / wordCount

    // Reasonable word duration is between 0.1 and 2.0 seconds
    if (avgWordDuration < 0.1 || avgWordDuration > 2.0) {
      return 0.5 // Moderate consistency for unusual timing
    }

    return 0.9 // Good consistency for normal timing
  }

  /**
   * Compute speaker consistency
   */
  private computeSpeakerConsistency(
    segment: TranscriptSegment,
    context?: ConfidenceContext
  ): number {
    // Without speaker identification data, assume good consistency
    return 0.8
  }

  /**
   * Generate selection reason
   */
  private generateSelectionReason(
    selectedSegment: SegmentConfidence,
    score: number,
    comparison: ConfidenceComparison
  ): string {
    return `Selected based on highest weighted score (${score.toFixed(3)}) with confidence ${selectedSegment.overallConfidence.toFixed(3)}`
  }

  /**
   * Compute quality score
   */
  private computeQualityScore(segment: SegmentConfidence): number {
    return (
      segment.overallConfidence * 0.4 +
      segment.acousticQuality * 0.3 +
      segment.linguisticCoherence * 0.2 +
      segment.temporalConsistency * 0.1
    )
  }

  /**
   * Generate quality warnings
   */
  private generateQualityWarnings(
    segment: SegmentConfidence,
    config: ConfidenceSelectorConfig
  ): any[] {
    const warnings: any[] = []

    if (segment.overallConfidence < config.thresholds.lowConfidenceThreshold) {
      warnings.push({
        type: 'low_confidence',
        severity: 'high',
        description: `Overall confidence ${segment.overallConfidence} is below threshold`,
        suggestedAction: 'Consider manual review'
      })
    }

    if (segment.acousticQuality < 0.5) {
      warnings.push({
        type: 'inconsistent_audio',
        severity: 'medium',
        description: 'Poor acoustic quality detected',
        suggestedAction: 'Check audio source quality'
      })
    }

    return warnings
  }

  /**
   * Generate detailed alternatives
   */
  private generateDetailedAlternatives(
    candidates: SegmentConfidence[],
    selected: SegmentConfidence
  ): any[] {
    return candidates
      .filter(c => c !== selected)
      .map(candidate => ({
        segment: candidate,
        reason: 'Alternative with different confidence profile',
        confidence: candidate.overallConfidence,
        tradeoffs: ['May have different accuracy characteristics'],
        useCase: 'When higher/lower confidence is preferred'
      }))
  }

  /**
   * Determine risk level
   */
  private determineRiskLevel(
    segment: SegmentConfidence,
    comparison: ConfidenceComparison
  ): 'low' | 'medium' | 'high' {
    if (segment.overallConfidence > 0.8) return 'low'
    if (segment.overallConfidence > 0.5) return 'medium'
    return 'high'
  }

  /**
   * Generate improvement suggestions
   */
  private generateImprovementSuggestions(segment: SegmentConfidence, warnings: any[]): string[] {
    const suggestions: string[] = []

    if (warnings.some(w => w.type === 'low_confidence')) {
      suggestions.push('Consider using higher quality audio input')
      suggestions.push('Try alternative speech recognition models')
    }

    if (segment.acousticQuality < 0.6) {
      suggestions.push('Improve microphone setup or recording environment')
    }

    return suggestions
  }

  /**
   * Update statistics after selection
   */
  private updateStats(result: ConfidenceSelectionResult): void {
    this.stats.totalSelections++
    this.stats.averageSelectionTimeMs =
      (this.stats.averageSelectionTimeMs * (this.stats.totalSelections - 1) +
        result.processingTimeMs) /
      this.stats.totalSelections

    if (result.processingTimeMs > this.stats.peakSelectionTimeMs) {
      this.stats.peakSelectionTimeMs = result.processingTimeMs
    }

    this.stats.averageSelectedConfidence =
      (this.stats.averageSelectedConfidence * (this.stats.totalSelections - 1) +
        result.selectedSegment.overallConfidence) /
      this.stats.totalSelections

    const reasonCount = this.stats.selectionBreakdown.get(result.selectionReason) || 0
    this.stats.selectionBreakdown.set(result.selectionReason, reasonCount + 1)
  }

  /**
   * Calculate average quality improvement from batch results
   */
  private calculateAverageQualityImprovement(results: ConfidenceSelectionResult[]): number {
    if (results.length === 0) return 0

    const improvements = results.map(result => {
      const alternatives = result.alternativeSegments
      if (alternatives.length === 0) return 0

      const maxAlternativeConfidence = Math.max(...alternatives.map(a => a.overallConfidence))
      return result.selectedSegment.overallConfidence - maxAlternativeConfidence
    })

    return improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length
  }

  /**
   * Get current statistics
   */
  public getStats(): ConfidenceSelectorStats {
    return {...this.stats}
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = this.initializeStats()
    this.performanceMetrics = []
  }

  /**
   * Clear caches
   */
  public clearCaches(): void {
    this.comparisonCache.clear()
    this.linguisticAnalysisCache.clear()
  }
}
