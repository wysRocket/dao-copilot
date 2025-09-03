/**
 * Multi-Part Question Processor
 * 
 * Advanced question processing system that handles compound questions, 
 * follow-up questions, and context-dependent queries. Extends the base
 * QuestionDetector with sophisticated multi-part analysis capabilities.
 * 
 * Features:
 * - Compound question decomposition and analysis
 * - Follow-up question detection with coreference resolution
 * - Context-aware processing across conversation turns
 * - Sequential question chaining and dependency tracking
 * - Performance-optimized for real-time processing
 */

import {EventEmitter} from 'events'
import {QuestionDetector, QuestionAnalysis, QuestionType, QuestionContext} from './question-detector'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

export interface MultiPartQuestionConfig {
  // Analysis settings
  enableCompoundDetection: boolean
  enableFollowUpDetection: boolean  
  enableContextualChaining: boolean
  enableCoreferenceResolution: boolean
  
  // Processing thresholds
  minPartLength: number
  maxPartsPerQuestion: number
  contextWindowSize: number
  
  // Performance settings
  maxProcessingTimeMs: number
  enableIncrementalProcessing: boolean
  batchProcessingThreshold: number
}

export interface QuestionPart {
  id: string
  text: string
  type: QuestionType
  confidence: number
  position: number
  dependencies: string[] // IDs of parts this depends on
  entities: any[]
  isComplete: boolean
}

export interface CompoundQuestion {
  id: string
  originalText: string
  parts: QuestionPart[]
  mainQuestion: string
  subQuestions: string[]
  processingStrategy: 'sequential' | 'parallel' | 'hierarchical'
  complexity: number
  timestamp: number
}

export interface FollowUpContext {
  previousQuestions: string[]
  recentEntities: any[]
  conversationTopics: string[]
  referentialPronouns: string[]
  temporalMarkers: string[]
}

export interface ContextualAnalysis {
  isFollowUp: boolean
  requiresContext: boolean
  missingReferences: string[]
  resolvedReferences: Map<string, string>
  contextConfidence: number
}

export interface MultiPartAnalysis {
  isMultiPart: boolean
  totalParts: number
  compoundQuestion?: CompoundQuestion
  contextualAnalysis: ContextualAnalysis
  processingRecommendation: 'immediate' | 'buffered' | 'context_required'
  confidence: number
}

/**
 * Multi-Part Question Processor
 * Handles complex question scenarios with context awareness
 */
export class MultiPartQuestionProcessor extends EventEmitter {
  private config: MultiPartQuestionConfig
  private baseDetector: QuestionDetector
  private processingBuffer: string[] = []
  private contextHistory: FollowUpContext
  private activeCompoundQuestions: Map<string, CompoundQuestion> = new Map()
  
  // Pattern databases for multi-part detection
  private conjunctionPatterns: Set<string>
  private sequenceMarkers: Set<string>
  private referentialPronouns: Set<string>
  private temporalConnectors: Set<string>
  
  constructor(
    baseDetector: QuestionDetector,
    config: Partial<MultiPartQuestionConfig> = {}
  ) {
    super()
    
    this.baseDetector = baseDetector
    this.config = {
      enableCompoundDetection: true,
      enableFollowUpDetection: true,
      enableContextualChaining: true,
      enableCoreferenceResolution: true,
      minPartLength: 3,
      maxPartsPerQuestion: 5,
      contextWindowSize: 10,
      maxProcessingTimeMs: 200,
      enableIncrementalProcessing: true,
      batchProcessingThreshold: 3,
      ...config
    }
    
    this.contextHistory = {
      previousQuestions: [],
      recentEntities: [],
      conversationTopics: [],
      referentialPronouns: [],
      temporalMarkers: []
    }
    
    this.initializePatterns()
    
    logger.info('MultiPartQuestionProcessor initialized', {
      enableCompoundDetection: this.config.enableCompoundDetection,
      enableFollowUpDetection: this.config.enableFollowUpDetection,
      contextWindowSize: this.config.contextWindowSize
    })
  }

  /**
   * Analyze text for multi-part question patterns
   */
  async analyzeMultiPartQuestion(text: string): Promise<MultiPartAnalysis> {
    const startTime = performance.now()
    
    try {
      // Initialize analysis result
      const analysis: MultiPartAnalysis = {
        isMultiPart: false,
        totalParts: 1,
        contextualAnalysis: {
          isFollowUp: false,
          requiresContext: false,
          missingReferences: [],
          resolvedReferences: new Map(),
          contextConfidence: 0
        },
        processingRecommendation: 'immediate',
        confidence: 0
      }

      // Step 1: Basic compound question detection
      if (this.config.enableCompoundDetection) {
        const compoundAnalysis = await this.detectCompoundQuestion(text)
        if (compoundAnalysis) {
          analysis.isMultiPart = true
          analysis.compoundQuestion = compoundAnalysis
          analysis.totalParts = compoundAnalysis.parts.length
          analysis.confidence = Math.max(analysis.confidence, 0.8)
        }
      }

      // Step 2: Follow-up question analysis
      if (this.config.enableFollowUpDetection) {
        const contextualAnalysis = this.analyzeContextualDependencies(text)
        analysis.contextualAnalysis = contextualAnalysis
        
        if (contextualAnalysis.isFollowUp) {
          analysis.isMultiPart = true
          analysis.confidence = Math.max(analysis.confidence, 0.7)
        }
      }

      // Step 3: Processing strategy determination
      analysis.processingRecommendation = this.determineProcessingStrategy(
        analysis
      )

      const processingTime = performance.now() - startTime
      
      this.emit('multi_part_analyzed', {
        text,
        analysis,
        processingTime
      })

      return analysis
      
    } catch (error) {
      logger.error('Error analyzing multi-part question', {
        error: error instanceof Error ? error.message : 'Unknown error',
        text: sanitizeLogMessage(text)
      })
      
      // Return default analysis on error
      return {
        isMultiPart: false,
        totalParts: 1,
        contextualAnalysis: {
          isFollowUp: false,
          requiresContext: false,
          missingReferences: [],
          resolvedReferences: new Map(),
          contextConfidence: 0
        },
        processingRecommendation: 'immediate',
        confidence: 0
      }
    }
  }

  /**
   * Detect compound questions with multiple parts
   */
  private async detectCompoundQuestion(text: string): Promise<CompoundQuestion | null> {
    // Step 1: Look for conjunction patterns
    const hasConjunctions = this.detectConjunctionPattern(text)
    
    // Step 2: Look for sequence markers
    const hasSequenceMarkers = this.detectSequenceMarkers(text)
    
    // Step 3: Look for multiple interrogative patterns
    const interrogativeCount = this.countInterrogatives(text)
    
    // Determine if this is compound based on patterns
    const isCompound = hasConjunctions || hasSequenceMarkers || interrogativeCount > 1
    
    if (!isCompound) {
      return null
    }

    // Decompose into parts
    const parts = await this.decomposeIntoQuestionParts(text)
    
    if (parts.length < 2) {
      return null
    }

    const compoundQuestion: CompoundQuestion = {
      id: this.generateQuestionId(),
      originalText: text,
      parts: parts,
      mainQuestion: this.identifyMainQuestion(parts),
      subQuestions: this.extractSubQuestions(parts),
      processingStrategy: this.determineCompoundStrategy(parts),
      complexity: this.calculateComplexity(parts),
      timestamp: Date.now()
    }

    return compoundQuestion
  }

  /**
   * Analyze contextual dependencies for follow-up questions
   */
  private analyzeContextualDependencies(text: string): ContextualAnalysis {
    const analysis: ContextualAnalysis = {
      isFollowUp: false,
      requiresContext: false,
      missingReferences: [],
      resolvedReferences: new Map(),
      contextConfidence: 0
    }

    // Check for referential pronouns
    const pronouns = this.detectReferentialPronouns(text)
    if (pronouns.length > 0) {
      analysis.isFollowUp = true
      analysis.requiresContext = true
      analysis.contextConfidence += 0.3
      
      // Try to resolve references if coreference resolution is enabled
      if (this.config.enableCoreferenceResolution) {
        analysis.resolvedReferences = this.resolveReferences(pronouns)
        analysis.contextConfidence += 0.2
      }
    }

    // Check for temporal connectors ("also", "then", "next", etc.)
    const temporalConnectors = this.detectTemporalConnectors(text)
    if (temporalConnectors.length > 0) {
      analysis.isFollowUp = true
      analysis.contextConfidence += 0.2
    }

    // Check for implicit references ("the same", "that one", etc.)
    const implicitRefs = this.detectImplicitReferences(text)
    if (implicitRefs.length > 0) {
      analysis.requiresContext = true
      analysis.missingReferences = implicitRefs
      analysis.contextConfidence += 0.1
    }

    // Determine if context is required
    analysis.requiresContext = analysis.requiresContext || 
                                analysis.missingReferences.length > 0 ||
                                analysis.contextConfidence > 0.5

    return analysis
  }

  /**
   * Decompose compound text into individual question parts
   */
  private async decomposeIntoQuestionParts(text: string): Promise<QuestionPart[]> {
    const parts: QuestionPart[] = []
    
    // Strategy 1: Split by conjunctions
    const conjunctionSplit = this.splitByConjunctions(text)
    
    // Strategy 2: Split by sequence markers  
    const sequenceSplit = this.splitBySequenceMarkers(text)
    
    // Choose the split that produces the most valid question parts
    const candidates = [conjunctionSplit, sequenceSplit]
    const bestSplit = candidates.reduce((best, current) => 
      current.length > best.length ? current : best
    )

    // Analyze each part
    for (let i = 0; i < bestSplit.length; i++) {
      const partText = bestSplit[i].trim()
      
      if (partText.length < this.config.minPartLength) {
        continue
      }

      // Use base detector to analyze this part
      const analysis = await this.baseDetector.detectQuestion(partText)
      
      if (analysis && analysis.isQuestion) {
        const part: QuestionPart = {
          id: `${this.generateQuestionId()}-part-${i}`,
          text: partText,
          type: analysis.questionType,
          confidence: analysis.confidence,
          position: i,
          dependencies: this.identifyPartDependencies(partText, parts),
          entities: analysis.entities,
          isComplete: this.isPartComplete(partText)
        }
        
        parts.push(part)
      }
    }

    return parts
  }

  /**
   * Split text by conjunction patterns
   */
  private splitByConjunctions(text: string): string[] {
    const conjunctions = Array.from(this.conjunctionPatterns).join('|')
    const pattern = new RegExp(`\\b(${conjunctions})\\b`, 'gi')
    
    return text.split(pattern)
      .filter(part => part.trim().length > 0)
      .filter(part => !this.conjunctionPatterns.has(part.toLowerCase().trim()))
  }

  /**
   * Split text by sequence markers
   */
  private splitBySequenceMarkers(text: string): string[] {
    const markers = Array.from(this.sequenceMarkers).join('|')
    const pattern = new RegExp(`\\b(${markers})\\b`, 'gi')
    
    return text.split(pattern)
      .filter(part => part.trim().length > 0)
      .filter(part => !this.sequenceMarkers.has(part.toLowerCase().trim()))
  }

  /**
   * Detect conjunction patterns in text
   */
  private detectConjunctionPattern(text: string): boolean {
    return Array.from(this.conjunctionPatterns).some(conj => 
      text.toLowerCase().includes(conj)
    )
  }

  /**
   * Detect sequence markers in text
   */
  private detectSequenceMarkers(text: string): boolean {
    return Array.from(this.sequenceMarkers).some(marker => 
      text.toLowerCase().includes(marker)
    )
  }

  /**
   * Count interrogative words in text
   */
  private countInterrogatives(text: string): number {
    const interrogatives = ['who', 'what', 'when', 'where', 'why', 'how', 'which']
    return interrogatives.reduce((count, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi')
      const matches = text.match(regex)
      return count + (matches ? matches.length : 0)
    }, 0)
  }

  /**
   * Detect referential pronouns that require context
   */
  private detectReferentialPronouns(text: string): string[] {
    const pronouns: string[] = []
    const words = text.toLowerCase().split(/\s+/)
    
    words.forEach(word => {
      if (this.referentialPronouns.has(word)) {
        pronouns.push(word)
      }
    })
    
    return pronouns
  }

  /**
   * Detect temporal connectors indicating follow-up
   */
  private detectTemporalConnectors(text: string): string[] {
    const connectors: string[] = []
    const words = text.toLowerCase().split(/\s+/)
    
    words.forEach(word => {
      if (this.temporalConnectors.has(word)) {
        connectors.push(word)
      }
    })
    
    return connectors
  }

  /**
   * Detect implicit references requiring context
   */
  private detectImplicitReferences(text: string): string[] {
    const implicitPatterns = [
      /\bthe same\b/i,
      /\bthat one\b/i,
      /\bthis one\b/i,
      /\blike before\b/i,
      /\bas mentioned\b/i,
      /\bpreviously\b/i
    ]
    
    const references: string[] = []
    
    implicitPatterns.forEach(pattern => {
      const match = text.match(pattern)
      if (match) {
        references.push(match[0])
      }
    })
    
    return references
  }

  /**
   * Resolve references using context history
   */
  private resolveReferences(pronouns: string[]): Map<string, string> {
    const resolved = new Map<string, string>()
    
    // Simple rule-based resolution using recent entities
    pronouns.forEach(pronoun => {
      switch (pronoun.toLowerCase()) {
        case 'it':
        case 'this':
        case 'that':
          // Find most recent non-person entity
          const recentEntity = this.contextHistory.recentEntities
            .filter(e => e.type !== 'person')
            .slice(-1)[0]
          if (recentEntity) {
            resolved.set(pronoun, recentEntity.text)
          }
          break
          
        case 'they':
        case 'them':
          // Find most recent plural entity or group
          const pluralEntity = this.contextHistory.recentEntities
            .filter(e => e.type === 'organization' || e.text.includes('s'))
            .slice(-1)[0]
          if (pluralEntity) {
            resolved.set(pronoun, pluralEntity.text)
          }
          break
      }
    })
    
    return resolved
  }

  /**
   * Identify dependencies between question parts
   */
  private identifyPartDependencies(partText: string, existingParts: QuestionPart[]): string[] {
    const dependencies: string[] = []
    
    // Check if this part references previous parts
    const hasReferences = this.detectReferentialPronouns(partText).length > 0
    
    if (hasReferences && existingParts.length > 0) {
      // Simple heuristic: depend on the immediately previous part
      const previousPart = existingParts[existingParts.length - 1]
      dependencies.push(previousPart.id)
    }
    
    return dependencies
  }

  /**
   * Determine if a question part is complete
   */
  private isPartComplete(partText: string): boolean {
    // Check for complete sentence structure
    const hasQuestionMark = partText.includes('?')
    const hasInterrogative = this.countInterrogatives(partText) > 0
    const hasAuxiliary = /\b(do|does|did|can|could|will|would|should|is|are|was|were|have|has|had)\b/i.test(partText)
    
    return hasQuestionMark || (hasInterrogative && hasAuxiliary)
  }

  /**
   * Identify the main question from parts
   */
  private identifyMainQuestion(parts: QuestionPart[]): string {
    // Find the part with highest confidence and least dependencies
    const mainPart = parts.reduce((main, current) => {
      const mainScore = main.confidence - (main.dependencies.length * 0.1)
      const currentScore = current.confidence - (current.dependencies.length * 0.1)
      
      return currentScore > mainScore ? current : main
    })
    
    return mainPart.text
  }

  /**
   * Extract sub-questions from parts
   */
  private extractSubQuestions(parts: QuestionPart[]): string[] {
    return parts
      .filter(part => part.dependencies.length > 0) // Parts with dependencies are sub-questions
      .map(part => part.text)
  }

  /**
   * Determine processing strategy for compound question
   */
  private determineCompoundStrategy(parts: QuestionPart[]): 'sequential' | 'parallel' | 'hierarchical' {
    // Check if parts have dependencies
    const hasDependencies = parts.some(part => part.dependencies.length > 0)
    
    if (hasDependencies) {
      return 'sequential'
    }
    
    // Check if parts are related or independent
    const entities = parts.flatMap(part => part.entities.map(e => e.text))
    const uniqueEntities = new Set(entities)
    const entityOverlap = (entities.length - uniqueEntities.size) / entities.length
    
    if (entityOverlap > 0.3) {
      return 'hierarchical'
    }
    
    return 'parallel'
  }

  /**
   * Calculate complexity score for compound question
   */
  private calculateComplexity(parts: QuestionPart[]): number {
    let complexity = parts.length * 2 // Base complexity from part count
    
    // Add complexity for dependencies
    const totalDependencies = parts.reduce((sum, part) => sum + part.dependencies.length, 0)
    complexity += totalDependencies * 1.5
    
    // Add complexity for entity density
    const totalEntities = parts.reduce((sum, part) => sum + part.entities.length, 0)
    complexity += totalEntities * 0.5
    
    return Math.min(complexity, 10) // Cap at 10
  }

  /**
   * Determine overall processing strategy
   */
  private determineProcessingStrategy(analysis: MultiPartAnalysis): 'immediate' | 'buffered' | 'context_required' {
    // If context is required but missing, wait for context
    if (analysis.contextualAnalysis.requiresContext && 
        analysis.contextualAnalysis.missingReferences.length > 0) {
      return 'context_required'
    }
    
    // If confidence is low, buffer for more information
    if (analysis.confidence < 0.6) {
      return 'buffered'
    }
    
    // If it's a compound question with dependencies, might need buffering
    if (analysis.compoundQuestion && 
        analysis.compoundQuestion.processingStrategy === 'sequential') {
      return 'buffered'
    }
    
    return 'immediate'
  }

  /**
   * Update context history with new question
   */
  updateContext(text: string, analysis: any): void {
    // Add to question history
    this.contextHistory.previousQuestions.push(text)
    if (this.contextHistory.previousQuestions.length > this.config.contextWindowSize) {
      this.contextHistory.previousQuestions.shift()
    }
    
    // Add entities to context
    if (analysis && analysis.entities) {
      this.contextHistory.recentEntities.push(...analysis.entities)
      if (this.contextHistory.recentEntities.length > 50) {
        this.contextHistory.recentEntities = this.contextHistory.recentEntities.slice(-50)
      }
    }
  }

  /**
   * Initialize pattern databases
   */
  private initializePatterns(): void {
    // Conjunctions for compound questions
    this.conjunctionPatterns = new Set([
      'and', 'or', 'but', 'also', 'plus', 'additionally', 
      'furthermore', 'moreover', 'besides', 'as well as'
    ])
    
    // Sequence markers
    this.sequenceMarkers = new Set([
      'first', 'second', 'third', 'then', 'next', 'after that',
      'finally', 'lastly', 'also', 'furthermore', 'additionally'
    ])
    
    // Referential pronouns requiring context
    this.referentialPronouns = new Set([
      'it', 'this', 'that', 'they', 'them', 'these', 'those',
      'he', 'she', 'him', 'her', 'his', 'hers', 'their'
    ])
    
    // Temporal connectors indicating follow-up
    this.temporalConnectors = new Set([
      'then', 'next', 'after', 'before', 'now', 'later',
      'subsequently', 'following', 'preceding'
    ])
  }

  /**
   * Generate unique question ID
   */
  private generateQuestionId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get current context history
   */
  getContextHistory(): FollowUpContext {
    return {
      previousQuestions: [...this.contextHistory.previousQuestions],
      recentEntities: [...this.contextHistory.recentEntities],
      conversationTopics: [...this.contextHistory.conversationTopics],
      referentialPronouns: [...this.contextHistory.referentialPronouns],
      temporalMarkers: [...this.contextHistory.temporalMarkers]
    }
  }

  /**
   * Clear context history
   */
  clearContext(): void {
    this.contextHistory = {
      previousQuestions: [],
      recentEntities: [],
      conversationTopics: [],
      referentialPronouns: [],
      temporalMarkers: []
    }
    
    this.activeCompoundQuestions.clear()
    
    logger.info('MultiPartQuestionProcessor context cleared')
    this.emit('context_cleared')
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MultiPartQuestionConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    logger.info('MultiPartQuestionProcessor configuration updated', {
      enableCompoundDetection: this.config.enableCompoundDetection,
      enableFollowUpDetection: this.config.enableFollowUpDetection
    })
    
    this.emit('config_updated', this.config)
  }

  /**
   * Process compound question with strategy
   */
  async processCompoundQuestion(compoundQuestion: CompoundQuestion): Promise<QuestionPart[]> {
    switch (compoundQuestion.processingStrategy) {
      case 'sequential':
        return this.processSequentially(compoundQuestion.parts)
      case 'parallel':
        return this.processParallel(compoundQuestion.parts)
      case 'hierarchical':
        return this.processHierarchically(compoundQuestion.parts)
      default:
        return compoundQuestion.parts
    }
  }

  /**
   * Process parts sequentially (respecting dependencies)
   */
  private async processSequentially(parts: QuestionPart[]): Promise<QuestionPart[]> {
    const processed: QuestionPart[] = []
    
    // Sort by dependencies (parts with no deps first)
    const sortedParts = [...parts].sort((a, b) => a.dependencies.length - b.dependencies.length)
    
    for (const part of sortedParts) {
      // Check if dependencies are satisfied
      const depsSatisfied = part.dependencies.every(depId => 
        processed.some(p => p.id === depId)
      )
      
      if (depsSatisfied) {
        // Process this part
        processed.push({ ...part, isComplete: true })
        this.emit('part_processed', part)
      }
    }
    
    return processed
  }

  /**
   * Process parts in parallel (independent processing)
   */
  private async processParallel(parts: QuestionPart[]): Promise<QuestionPart[]> {
    // All parts can be processed simultaneously
    const processed = parts.map(part => ({ ...part, isComplete: true }))
    
    // Emit events for all parts
    processed.forEach(part => this.emit('part_processed', part))
    
    return processed
  }

  /**
   * Process parts hierarchically (main question with sub-questions)
   */
  private async processHierarchically(parts: QuestionPart[]): Promise<QuestionPart[]> {
    // Find main question (no dependencies, highest confidence)
    const mainPart = parts.find(part => part.dependencies.length === 0)
    const subParts = parts.filter(part => part.dependencies.length > 0)
    
    const processed: QuestionPart[] = []
    
    if (mainPart) {
      processed.push({ ...mainPart, isComplete: true })
      this.emit('part_processed', mainPart)
    }
    
    // Process sub-parts after main part
    for (const subPart of subParts) {
      processed.push({ ...subPart, isComplete: true })
      this.emit('part_processed', subPart)
    }
    
    return processed
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.clearContext()
    this.removeAllListeners()
    
    logger.info('MultiPartQuestionProcessor destroyed')
  }
}

export default MultiPartQuestionProcessor