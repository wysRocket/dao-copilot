/**
 * Answer Synthesizer
 * 
 * This module provides intelligent answer synthesis capabilities, combining information
 * from multiple search results to create coherent, comprehensive answers. It uses
 * advanced NLP techniques for content extraction, deduplication, and synthesis.
 * 
 * Features:
 * - Multi-source information extraction and combination
 * - Content deduplication and relevance filtering
 * - Coherent answer structure generation
 * - Confidence scoring based on source quality and consensus
 * - Citation and source attribution
 * - Answer quality assessment and validation
 * - Support for different answer formats (direct, explanatory, comparative)
 */

import { EventEmitter } from 'events'
import { RankedResult, SearchQuery } from './search-service'
import { logger } from './gemini-logger'
import * as natural from 'natural'

// Types and interfaces
interface SynthesizedAnswer {
  answer: string
  confidenceScore: number
  answerType: 'direct' | 'explanatory' | 'comparative' | 'procedural' | 'inconclusive'
  sources: AnswerSource[]
  citations: Citation[]
  
  // Quality metrics
  quality: {
    coherence: number
    completeness: number
    accuracy: number
    conciseness: number
    overall: number
  }
  
  // Metadata
  metadata: {
    synthesisTime: number
    sourceCount: number
    wordCount: number
    consensusLevel: number
    alternativeAnswers?: string[]
    uncertaintyAreas?: string[]
  }
}

interface AnswerSource {
  title: string
  snippet: string
  link: string
  credibilityScore: number
  relevanceScore: number
  usageWeight: number
  extractedFacts: ExtractedFact[]
}

interface ExtractedFact {
  fact: string
  confidence: number
  sourceReliability: number
  factType: 'definition' | 'statistic' | 'process' | 'relationship' | 'temporal' | 'opinion'
  supportingEvidence: string[]
}

interface Citation {
  sourceIndex: number
  title: string
  link: string
  relevantText: string
  citationStyle: 'inline' | 'reference'
}

interface SynthesisMetrics {
  totalSyntheses: number
  averageConfidence: number
  averageSourceCount: number
  averageProcessingTime: number
  answerTypeDistribution: Record<string, number>
  qualityMetrics: {
    averageCoherence: number
    averageCompleteness: number
    averageAccuracy: number
    averageConciseness: number
  }
}

/**
 * Content Extractor for extracting key information from search results
 */
class ContentExtractor {
  private sentenceTokenizer = new natural.SentenceTokenizer()
  private wordTokenizer = new natural.WordTokenizer()
  private stemmer = natural.PorterStemmer
  
  // Keywords that indicate different types of facts
  private factTypeIndicators = {
    definition: ['is', 'are', 'means', 'refers to', 'defined as', 'known as'],
    statistic: ['percent', '%', 'million', 'billion', 'approximately', 'about', 'roughly'],
    process: ['first', 'then', 'next', 'finally', 'step', 'procedure', 'method'],
    relationship: ['because', 'causes', 'leads to', 'results in', 'due to', 'affects'],
    temporal: ['when', 'during', 'after', 'before', 'since', 'until', 'in', 'year', 'century'],
    opinion: ['believe', 'think', 'argue', 'suggest', 'claim', 'opinion', 'view']
  }
  
  /**
   * Extract key facts from search results
   */
  extractFacts(results: RankedResult[], searchQuery: SearchQuery): AnswerSource[] {
    logger.debug('Extracting facts from search results', {
      resultCount: results.length,
      queryType: searchQuery.queryType
    })
    
    const answerSources: AnswerSource[] = results.map(result => {
      const extractedFacts = this.extractFactsFromResult(result, searchQuery)
      
      return {
        title: result.title,
        snippet: result.snippet,
        link: result.link,
        credibilityScore: result.credibilityScore,
        relevanceScore: result.relevanceScore,
        usageWeight: this.calculateUsageWeight(result, extractedFacts),
        extractedFacts
      }
    })
    
    // Filter out sources with no useful facts
    const filteredSources = answerSources.filter(source => source.extractedFacts.length > 0)
    
    logger.debug('Fact extraction complete', {
      originalSources: answerSources.length,
      filteredSources: filteredSources.length,
      totalFacts: filteredSources.reduce((sum, s) => sum + s.extractedFacts.length, 0)
    })
    
    return filteredSources
  }
  
  /**
   * Extract facts from a single search result
   */
  private extractFactsFromResult(result: RankedResult, searchQuery: SearchQuery): ExtractedFact[] {
    const facts: ExtractedFact[] = []
    const text = `${result.title}. ${result.snippet}`
    const sentences = this.sentenceTokenizer.tokenize(text)
    
    sentences.forEach(sentence => {
      const fact = this.processSentence(sentence, result, searchQuery)
      if (fact) {
        facts.push(fact)
      }
    })
    
    return facts
  }
  
  /**
   * Process a sentence to extract a potential fact
   */
  private processSentence(sentence: string, result: RankedResult, searchQuery: SearchQuery): ExtractedFact | null {
    const cleanSentence = sentence.trim()
    
    // Skip very short or long sentences
    if (cleanSentence.length < 20 || cleanSentence.length > 300) {
      return null
    }
    
    // Determine fact type
    const factType = this.determineFactType(cleanSentence)
    
    // Calculate confidence based on sentence characteristics
    const confidence = this.calculateFactConfidence(cleanSentence, searchQuery, result)
    
    // Skip low-confidence facts
    if (confidence < 0.3) {
      return null
    }
    
    return {
      fact: cleanSentence,
      confidence,
      sourceReliability: result.credibilityScore,
      factType,
      supportingEvidence: [result.title] // Could be expanded to find supporting sentences
    }
  }
  
  /**
   * Determine the type of fact based on content analysis
   */
  private determineFactType(sentence: string): ExtractedFact['factType'] {
    const lowerSentence = sentence.toLowerCase()
    
    for (const [factType, indicators] of Object.entries(this.factTypeIndicators)) {
      for (const indicator of indicators) {
        if (lowerSentence.includes(indicator)) {
          return factType as ExtractedFact['factType']
        }
      }
    }
    
    return 'definition' // Default
  }
  
  /**
   * Calculate confidence score for an extracted fact
   */
  private calculateFactConfidence(sentence: string, searchQuery: SearchQuery, result: RankedResult): number {
    let confidence = 0.5 // Base confidence
    
    // Source credibility boost
    confidence += result.credibilityScore * 0.3
    
    // Relevance boost
    confidence += result.relevanceScore * 0.2
    
    // Keyword matching boost
    const queryKeywords = searchQuery.keywords
    const sentenceWords = this.wordTokenizer.tokenize(sentence.toLowerCase()) || []
    const keywordMatches = queryKeywords.filter(keyword =>
      sentenceWords.some(word => word.includes(keyword.toLowerCase()))
    ).length
    
    confidence += (keywordMatches / Math.max(queryKeywords.length, 1)) * 0.2
    
    // Entity matching boost
    const entityMatches = searchQuery.entities.filter(entity =>
      sentence.toLowerCase().includes(entity.toLowerCase())
    ).length
    
    confidence += (entityMatches / Math.max(searchQuery.entities.length, 1)) * 0.3
    
    // Sentence quality indicators
    if (sentence.includes('.') || sentence.includes(',')) confidence += 0.05 // Well-structured
    if (sentence.match(/\d+/)) confidence += 0.05 // Contains numbers/data
    if (sentence.length > 50 && sentence.length < 150) confidence += 0.1 // Good length
    
    return Math.min(confidence, 1.0)
  }
  
  /**
   * Calculate how much weight to give this source in synthesis
   */
  private calculateUsageWeight(result: RankedResult, extractedFacts: ExtractedFact[]): number {
    const factCount = extractedFacts.length
    const averageFactConfidence = factCount > 0 
      ? extractedFacts.reduce((sum, f) => sum + f.confidence, 0) / factCount
      : 0
    
    // Weight based on result quality and fact extraction success
    return (
      result.combinedScore * 0.4 +
      (factCount / 10) * 0.3 + // Normalize fact count
      averageFactConfidence * 0.3
    )
  }
}

/**
 * Answer Generator for synthesizing coherent answers from extracted facts
 */
class AnswerGenerator {
  private factDeduplicator = new Map<string, ExtractedFact>()
  
  /**
   * Generate a coherent answer from answer sources
   */
  generateAnswer(sources: AnswerSource[], searchQuery: SearchQuery): {
    answer: string
    answerType: SynthesizedAnswer['answerType']
    citations: Citation[]
    consensusLevel: number
  } {
    logger.debug('Generating answer from sources', {
      sourceCount: sources.length,
      queryType: searchQuery.queryType,
      intent: searchQuery.intent
    })
    
    // Deduplicate and rank facts
    const rankedFacts = this.rankAndDeduplicateFacts(sources)
    
    // Determine answer type based on query and available facts
    const answerType = this.determineAnswerType(searchQuery, rankedFacts)
    
    // Generate answer based on type
    const { answer, citations } = this.generateAnswerByType(
      answerType,
      rankedFacts,
      sources,
      searchQuery
    )
    
    // Calculate consensus level
    const consensusLevel = this.calculateConsensusLevel(rankedFacts, sources)
    
    logger.debug('Answer generation complete', {
      answerType,
      answerLength: answer.length,
      citationCount: citations.length,
      consensusLevel: consensusLevel.toFixed(3)
    })
    
    return {
      answer,
      answerType,
      citations,
      consensusLevel
    }
  }
  
  /**
   * Rank and deduplicate facts from multiple sources
   */
  private rankAndDeduplicateFacts(sources: AnswerSource[]): ExtractedFact[] {
    this.factDeduplicator.clear()
    
    // Collect all facts with deduplication
    sources.forEach(source => {
      source.extractedFacts.forEach(fact => {
        const factKey = this.generateFactKey(fact.fact)
        const existingFact = this.factDeduplicator.get(factKey)
        
        if (!existingFact || fact.confidence > existingFact.confidence) {
          // Keep the higher confidence version
          this.factDeduplicator.set(factKey, {
            ...fact,
            supportingEvidence: existingFact
              ? [...existingFact.supportingEvidence, ...fact.supportingEvidence]
              : fact.supportingEvidence
          })
        }
      })
    })
    
    // Convert to array and sort by confidence
    const uniqueFacts = Array.from(this.factDeduplicator.values())
    return uniqueFacts.sort((a, b) => b.confidence - a.confidence)
  }
  
  /**
   * Generate a simplified key for fact deduplication
   */
  private generateFactKey(fact: string): string {
    // Simple key generation - could be enhanced with semantic similarity
    return fact.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100) // Limit length
  }
  
  /**
   * Determine the best answer type based on query and available facts
   */
  private determineAnswerType(
    searchQuery: SearchQuery,
    rankedFacts: ExtractedFact[]
  ): SynthesizedAnswer['answerType'] {
    if (rankedFacts.length === 0) {
      return 'inconclusive'
    }
    
    // Check for direct answer patterns
    const hasDefinitions = rankedFacts.some(f => f.factType === 'definition')
    const hasStatistics = rankedFacts.some(f => f.factType === 'statistic')
    const hasProcesses = rankedFacts.some(f => f.factType === 'process')
    
    // Match answer type to query characteristics
    if (searchQuery.queryType === 'procedural' && hasProcesses) {
      return 'procedural'
    }
    
    if (searchQuery.queryType === 'comparison') {
      return 'comparative'
    }
    
    if (searchQuery.intent === 'definition' && hasDefinitions) {
      return 'direct'
    }
    
    if (rankedFacts.length >= 3 || searchQuery.intent === 'explanation') {
      return 'explanatory'
    }
    
    return 'direct' // Default
  }
  
  /**
   * Generate answer based on the determined type
   */
  private generateAnswerByType(
    answerType: SynthesizedAnswer['answerType'],
    rankedFacts: ExtractedFact[],
    sources: AnswerSource[],
    searchQuery: SearchQuery
  ): { answer: string, citations: Citation[] } {
    const citations: Citation[] = []
    
    switch (answerType) {
      case 'direct':
        return this.generateDirectAnswer(rankedFacts, sources, citations)
      
      case 'explanatory':
        return this.generateExplanatoryAnswer(rankedFacts, sources, citations, searchQuery)
      
      case 'comparative':
        return this.generateComparativeAnswer(rankedFacts, sources, citations)
      
      case 'procedural':
        return this.generateProceduralAnswer(rankedFacts, sources, citations)
      
      default:
        return this.generateInconclusiveAnswer(searchQuery, citations)
    }
  }
  
  /**
   * Generate a direct, concise answer
   */
  private generateDirectAnswer(
    rankedFacts: ExtractedFact[],
    sources: AnswerSource[],
    citations: Citation[]
  ): { answer: string, citations: Citation[] } {
    const topFact = rankedFacts[0]
    const sourceIndex = this.findSourceIndex(topFact, sources)
    
    if (sourceIndex >= 0) {
      citations.push({
        sourceIndex,
        title: sources[sourceIndex].title,
        link: sources[sourceIndex].link,
        relevantText: topFact.fact,
        citationStyle: 'inline'
      })
    }
    
    let answer = topFact.fact
    
    // Add supporting information if available
    if (rankedFacts.length > 1) {
      const supportingFact = rankedFacts[1]
      if (supportingFact.confidence > 0.6) {
        answer += ` ${supportingFact.fact}`
        
        const supportingSourceIndex = this.findSourceIndex(supportingFact, sources)
        if (supportingSourceIndex >= 0 && supportingSourceIndex !== sourceIndex) {
          citations.push({
            sourceIndex: supportingSourceIndex,
            title: sources[supportingSourceIndex].title,
            link: sources[supportingSourceIndex].link,
            relevantText: supportingFact.fact,
            citationStyle: 'inline'
          })
        }
      }
    }
    
    return { answer, citations }
  }
  
  /**
   * Generate an explanatory, comprehensive answer
   */
  private generateExplanatoryAnswer(
    rankedFacts: ExtractedFact[],
    sources: AnswerSource[],
    citations: Citation[],
    searchQuery: SearchQuery
  ): { answer: string, citations: Citation[] } {
    const sections: string[] = []
    const usedSources = new Set<number>()
    
    // Group facts by type for better organization
    const factsByType = this.groupFactsByType(rankedFacts)
    
    // Start with definitions if available
    if (factsByType.definition && factsByType.definition.length > 0) {
      sections.push(this.buildSection('Definition', factsByType.definition, sources, citations, usedSources))
    }
    
    // Add statistics/data
    if (factsByType.statistic && factsByType.statistic.length > 0) {
      sections.push(this.buildSection('Key Facts', factsByType.statistic, sources, citations, usedSources))
    }
    
    // Add relationships/explanations
    if (factsByType.relationship && factsByType.relationship.length > 0) {
      sections.push(this.buildSection('Explanation', factsByType.relationship, sources, citations, usedSources))
    }
    
    // Add temporal information
    if (factsByType.temporal && factsByType.temporal.length > 0) {
      sections.push(this.buildSection('Timeline', factsByType.temporal, sources, citations, usedSources))
    }
    
    // Fallback: use top facts if no organized sections
    if (sections.length === 0) {
      const topFacts = rankedFacts.slice(0, 3)
      sections.push(topFacts.map(fact => fact.fact).join(' '))
      
      topFacts.forEach(fact => {
        const sourceIndex = this.findSourceIndex(fact, sources)
        if (sourceIndex >= 0 && !usedSources.has(sourceIndex)) {
          citations.push({
            sourceIndex,
            title: sources[sourceIndex].title,
            link: sources[sourceIndex].link,
            relevantText: fact.fact,
            citationStyle: 'reference'
          })
          usedSources.add(sourceIndex)
        }
      })
    }
    
    const answer = sections.join('\n\n')
    return { answer, citations }
  }
  
  /**
   * Generate a comparative answer
   */
  private generateComparativeAnswer(
    rankedFacts: ExtractedFact[],
    sources: AnswerSource[],
    citations: Citation[]
  ): { answer: string, citations: Citation[] } {
    // For now, use explanatory format
    // In a more sophisticated implementation, this would identify and compare entities
    return this.generateExplanatoryAnswer(rankedFacts, sources, citations, {} as SearchQuery)
  }
  
  /**
   * Generate a procedural answer
   */
  private generateProceduralAnswer(
    rankedFacts: ExtractedFact[],
    sources: AnswerSource[],
    citations: Citation[]
  ): { answer: string, citations: Citation[] } {
    const processFacts = rankedFacts.filter(f => f.factType === 'process')
    
    if (processFacts.length === 0) {
      return this.generateExplanatoryAnswer(rankedFacts, sources, citations, {} as SearchQuery)
    }
    
    const steps = processFacts.map((fact, index) => `${index + 1}. ${fact.fact}`).join('\n')
    
    // Add citations
    processFacts.forEach(fact => {
      const sourceIndex = this.findSourceIndex(fact, sources)
      if (sourceIndex >= 0) {
        citations.push({
          sourceIndex,
          title: sources[sourceIndex].title,
          link: sources[sourceIndex].link,
          relevantText: fact.fact,
          citationStyle: 'reference'
        })
      }
    })
    
    return { answer: steps, citations }
  }
  
  /**
   * Generate an inconclusive answer
   */
  private generateInconclusiveAnswer(
    searchQuery: SearchQuery,
    citations: Citation[]
  ): { answer: string, citations: Citation[] } {
    const answer = `I couldn't find sufficient reliable information to answer "${searchQuery.originalQuestion}". The available sources may not contain enough relevant details, or the topic might require more specialized knowledge.`
    
    return { answer, citations }
  }
  
  private groupFactsByType(facts: ExtractedFact[]): Record<string, ExtractedFact[]> {
    const grouped: Record<string, ExtractedFact[]> = {}
    
    facts.forEach(fact => {
      if (!grouped[fact.factType]) {
        grouped[fact.factType] = []
      }
      grouped[fact.factType].push(fact)
    })
    
    return grouped
  }
  
  private buildSection(
    sectionTitle: string,
    facts: ExtractedFact[],
    sources: AnswerSource[],
    citations: Citation[],
    usedSources: Set<number>
  ): string {
    const content = facts.slice(0, 2).map(fact => fact.fact).join(' ')
    
    facts.slice(0, 2).forEach(fact => {
      const sourceIndex = this.findSourceIndex(fact, sources)
      if (sourceIndex >= 0 && !usedSources.has(sourceIndex)) {
        citations.push({
          sourceIndex,
          title: sources[sourceIndex].title,
          link: sources[sourceIndex].link,
          relevantText: fact.fact,
          citationStyle: 'reference'
        })
        usedSources.add(sourceIndex)
      }
    })
    
    return content
  }
  
  private findSourceIndex(fact: ExtractedFact, sources: AnswerSource[]): number {
    return sources.findIndex(source =>
      source.extractedFacts.some(f => f.fact === fact.fact)
    )
  }
  
  private calculateConsensusLevel(rankedFacts: ExtractedFact[], sources: AnswerSource[]): number {
    if (rankedFacts.length === 0) return 0
    
    // Simple consensus: higher when multiple sources support similar facts
    const averageConfidence = rankedFacts.reduce((sum, f) => sum + f.confidence, 0) / rankedFacts.length
    const sourceConfidenceVariance = this.calculateSourceConfidenceVariance(sources)
    
    return averageConfidence * (1 - sourceConfidenceVariance)
  }
  
  private calculateSourceConfidenceVariance(sources: AnswerSource[]): number {
    if (sources.length <= 1) return 0
    
    const scores = sources.map(s => s.credibilityScore)
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length
    
    return Math.sqrt(variance) // Standard deviation normalized
  }
}

/**
 * Quality Assessor for evaluating answer quality
 */
class QualityAssessor {
  /**
   * Assess the quality of a synthesized answer
   */
  assessQuality(
    answer: string,
    sources: AnswerSource[],
    searchQuery: SearchQuery,
    consensusLevel: number
  ): SynthesizedAnswer['quality'] {
    const coherence = this.assessCoherence(answer)
    const completeness = this.assessCompleteness(answer, searchQuery, sources)
    const accuracy = this.assessAccuracy(sources, consensusLevel)
    const conciseness = this.assessConciseness(answer, searchQuery.queryType)
    
    const overall = (coherence + completeness + accuracy + conciseness) / 4
    
    return {
      coherence,
      completeness,
      accuracy,
      conciseness,
      overall
    }
  }
  
  private assessCoherence(answer: string): number {
    let score = 0.5 // Base score
    
    // Check for proper sentence structure
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 0)
    if (sentences.length > 0) score += 0.1
    
    // Check for transitions and flow
    if (answer.includes('however') || answer.includes('additionally') || answer.includes('furthermore')) {
      score += 0.1
    }
    
    // Check for logical structure
    if (answer.includes('first') || answer.includes('second') || answer.includes('finally')) {
      score += 0.1
    }
    
    // Penalty for very short answers
    if (answer.length < 50) score -= 0.2
    
    return Math.max(0, Math.min(score, 1.0))
  }
  
  private assessCompleteness(answer: string, searchQuery: SearchQuery, sources: AnswerSource[]): number {
    let score = 0.5
    
    // Check if key entities from the query are addressed
    const addressedEntities = searchQuery.entities.filter(entity =>
      answer.toLowerCase().includes(entity.toLowerCase())
    ).length
    
    score += (addressedEntities / Math.max(searchQuery.entities.length, 1)) * 0.3
    
    // Check if answer length is appropriate for query type
    if (searchQuery.queryType === 'procedural' && answer.length > 100) score += 0.1
    if (searchQuery.queryType === 'factual' && answer.length > 50) score += 0.1
    if (searchQuery.queryType === 'comparison' && answer.length > 150) score += 0.1
    
    // Consider source utilization
    const sourceUtilization = Math.min(sources.length / 3, 1.0) // Optimal: 3+ sources
    score += sourceUtilization * 0.2
    
    return Math.min(score, 1.0)
  }
  
  private assessAccuracy(sources: AnswerSource[], consensusLevel: number): number {
    const averageCredibility = sources.reduce((sum, s) => sum + s.credibilityScore, 0) / Math.max(sources.length, 1)
    return (averageCredibility + consensusLevel) / 2
  }
  
  private assessConciseness(answer: string, queryType: SearchQuery['queryType']): number {
    const wordCount = answer.split(/\s+/).length
    
    // Optimal length ranges by query type
    const optimalRanges = {
      factual: [20, 80],
      procedural: [50, 200],
      comparison: [80, 250],
      temporal: [30, 120],
      conceptual: [60, 180]
    }
    
    const [minOptimal, maxOptimal] = optimalRanges[queryType] || [30, 150]
    
    if (wordCount >= minOptimal && wordCount <= maxOptimal) {
      return 1.0
    }
    
    // Penalty for being too short or too long
    if (wordCount < minOptimal) {
      return Math.max(0.3, wordCount / minOptimal)
    }
    
    if (wordCount > maxOptimal) {
      return Math.max(0.3, maxOptimal / wordCount)
    }
    
    return 0.8
  }
}

/**
 * Main AnswerSynthesizer class
 */
export class AnswerSynthesizer extends EventEmitter {
  private contentExtractor: ContentExtractor
  private answerGenerator: AnswerGenerator
  private qualityAssessor: QualityAssessor
  private isInitialized = false
  
  // Configuration
  private config = {
    minSourceCount: 1,
    maxSourceCount: 10,
    minConfidenceThreshold: 0.4,
    enableCitations: true,
    preferenceReliableSources: true
  }
  
  // Metrics tracking
  private metrics: SynthesisMetrics = {
    totalSyntheses: 0,
    averageConfidence: 0,
    averageSourceCount: 0,
    averageProcessingTime: 0,
    answerTypeDistribution: {},
    qualityMetrics: {
      averageCoherence: 0,
      averageCompleteness: 0,
      averageAccuracy: 0,
      averageConciseness: 0
    }
  }

  constructor() {
    super()
    
    this.contentExtractor = new ContentExtractor()
    this.answerGenerator = new AnswerGenerator()
    this.qualityAssessor = new QualityAssessor()
    
    logger.info('AnswerSynthesizer initialized', { config: this.config })
  }
  
  /**
   * Initialize the answer synthesizer
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    
    this.isInitialized = true
    
    logger.info('AnswerSynthesizer fully initialized')
    this.emit('initialized')
  }
  
  /**
   * Synthesize an answer from ranked search results
   */
  async synthesizeAnswer(results: RankedResult[], searchQuery: SearchQuery): Promise<SynthesizedAnswer> {
    if (!this.isInitialized) {
      throw new Error('AnswerSynthesizer not initialized. Call initialize() first.')
    }
    
    const startTime = performance.now()
    this.metrics.totalSyntheses++
    
    try {
      logger.info('Synthesizing answer', {
        resultCount: results.length,
        queryType: searchQuery.queryType,
        intent: searchQuery.intent
      })
      
      // Step 1: Extract facts from search results
      const extractionStartTime = performance.now()
      const answerSources = this.contentExtractor.extractFacts(results, searchQuery)
      const extractionTime = performance.now() - extractionStartTime
      
      this.emit('facts_extracted', {
        sourceCount: answerSources.length,
        totalFacts: answerSources.reduce((sum, s) => sum + s.extractedFacts.length, 0),
        extractionTime
      })
      
      if (answerSources.length < this.config.minSourceCount) {
        logger.warn('Insufficient sources for synthesis', {
          available: answerSources.length,
          required: this.config.minSourceCount
        })
      }
      
      // Step 2: Generate coherent answer
      const generationStartTime = performance.now()
      const { answer, answerType, citations, consensusLevel } = 
        this.answerGenerator.generateAnswer(answerSources, searchQuery)
      const generationTime = performance.now() - generationStartTime
      
      this.emit('answer_generated', {
        answerType,
        answerLength: answer.length,
        citationCount: citations.length,
        consensusLevel,
        generationTime
      })
      
      // Step 3: Assess answer quality
      const qualityStartTime = performance.now()
      const quality = this.qualityAssessor.assessQuality(
        answer,
        answerSources,
        searchQuery,
        consensusLevel
      )
      const qualityTime = performance.now() - qualityStartTime
      
      // Step 4: Calculate final confidence score
      const confidenceScore = this.calculateConfidenceScore(
        quality,
        consensusLevel,
        answerSources.length,
        answerType
      )
      
      // Step 5: Build final synthesized answer
      const synthesisTime = performance.now() - startTime
      
      const synthesizedAnswer: SynthesizedAnswer = {
        answer,
        confidenceScore,
        answerType,
        sources: answerSources,
        citations,
        quality,
        metadata: {
          synthesisTime,
          sourceCount: answerSources.length,
          wordCount: answer.split(/\s+/).length,
          consensusLevel,
          alternativeAnswers: [], // Could be expanded to include alternative formulations
          uncertaintyAreas: this.identifyUncertaintyAreas(answerSources, confidenceScore)
        }
      }
      
      // Update metrics
      this.updateMetrics(synthesizedAnswer, synthesisTime)
      
      logger.info('Answer synthesis complete', {
        answerType,
        confidenceScore: confidenceScore.toFixed(3),
        qualityScore: quality.overall.toFixed(3),
        synthesisTime: synthesisTime.toFixed(2),
        wordCount: synthesizedAnswer.metadata.wordCount
      })
      
      this.emit('synthesis_complete', {
        answerType,
        confidenceScore,
        qualityScore: quality.overall,
        synthesisTime
      })
      
      return synthesizedAnswer
      
    } catch (error) {
      const synthesisTime = performance.now() - startTime
      
      logger.error('Answer synthesis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        synthesisTime
      })
      
      this.emit('synthesis_error', {
        error: error instanceof Error ? error : new Error('Unknown error'),
        synthesisTime
      })
      
      throw error
    }
  }
  
  /**
   * Calculate overall confidence score
   */
  calculateConfidenceScore(
    quality: SynthesizedAnswer['quality'],
    consensusLevel: number,
    sourceCount: number,
    answerType: SynthesizedAnswer['answerType']
  ): number {
    let confidence = quality.overall * 0.5 + consensusLevel * 0.3
    
    // Source count factor
    const sourceCountFactor = Math.min(sourceCount / 5, 1.0) // Optimal: 5+ sources
    confidence += sourceCountFactor * 0.15
    
    // Answer type confidence adjustments
    const typeMultipliers = {
      direct: 1.0,
      explanatory: 0.9,
      comparative: 0.85,
      procedural: 0.9,
      inconclusive: 0.3
    }
    
    confidence *= typeMultipliers[answerType]
    
    return Math.max(0.1, Math.min(confidence, 0.95)) // Cap between 0.1 and 0.95
  }
  
  /**
   * Get synthesis metrics
   */
  getMetrics(): SynthesisMetrics {
    return { ...this.metrics }
  }
  
  /**
   * Update configuration
   */
  updateConfig(updates: Partial<typeof this.config>): void {
    Object.assign(this.config, updates)
    
    logger.info('AnswerSynthesizer configuration updated', updates)
    this.emit('config_updated', updates)
  }
  
  /**
   * Shutdown the synthesizer
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down AnswerSynthesizer')
    
    this.removeAllListeners()
    
    logger.info('AnswerSynthesizer shutdown complete')
  }
  
  // Private methods
  
  private identifyUncertaintyAreas(
    sources: AnswerSource[],
    confidenceScore: number
  ): string[] {
    const uncertaintyAreas: string[] = []
    
    if (confidenceScore < 0.6) {
      uncertaintyAreas.push('Overall answer reliability')
    }
    
    if (sources.length < 3) {
      uncertaintyAreas.push('Limited source validation')
    }
    
    const lowCredibilitySources = sources.filter(s => s.credibilityScore < 0.6)
    if (lowCredibilitySources.length > sources.length / 2) {
      uncertaintyAreas.push('Source credibility concerns')
    }
    
    return uncertaintyAreas
  }
  
  private updateMetrics(synthesizedAnswer: SynthesizedAnswer, synthesisTime: number): void {
    const count = this.metrics.totalSyntheses
    
    // Update averages
    this.metrics.averageConfidence = 
      (this.metrics.averageConfidence * (count - 1) + synthesizedAnswer.confidenceScore) / count
    
    this.metrics.averageSourceCount = 
      (this.metrics.averageSourceCount * (count - 1) + synthesizedAnswer.metadata.sourceCount) / count
    
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (count - 1) + synthesisTime) / count
    
    // Update answer type distribution
    const answerType = synthesizedAnswer.answerType
    this.metrics.answerTypeDistribution[answerType] = 
      (this.metrics.answerTypeDistribution[answerType] || 0) + 1
    
    // Update quality metrics
    const quality = synthesizedAnswer.quality
    this.metrics.qualityMetrics.averageCoherence = 
      (this.metrics.qualityMetrics.averageCoherence * (count - 1) + quality.coherence) / count
    
    this.metrics.qualityMetrics.averageCompleteness = 
      (this.metrics.qualityMetrics.averageCompleteness * (count - 1) + quality.completeness) / count
    
    this.metrics.qualityMetrics.averageAccuracy = 
      (this.metrics.qualityMetrics.averageAccuracy * (count - 1) + quality.accuracy) / count
    
    this.metrics.qualityMetrics.averageConciseness = 
      (this.metrics.qualityMetrics.averageConciseness * (count - 1) + quality.conciseness) / count
  }
}

export default AnswerSynthesizer