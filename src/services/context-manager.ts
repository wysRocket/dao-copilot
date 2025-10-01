/**
 * Context-Aware Intent Resolution System
 *
 * This system provides sophisticated conversation context tracking and
 * intent resolution based on multi-turn conversation history. It enables
 * the Advanced Intent Classifier to understand follow-up questions,
 * clarifications, and context-dependent queries.
 *
 * Key Features:
 * - Conversation history tracking with context windows
 * - Multi-turn intent resolution
 * - Follow-up question detection and handling
 * - Context-dependent intent disambiguation
 * - Conversation state management
 * - Context decay and memory management
 * - Contextual intent confidence scoring
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

// Context-aware interfaces
export interface ConversationTurn {
  id: string
  timestamp: Date
  text: string
  intent?: string
  confidence?: number
  entities?: Array<{type: string; value: string; confidence: number}>
  resolved: boolean
  followUpTo?: string
  contextScore?: number
  metadata: {
    speaker?: 'user' | 'assistant'
    processingTime?: number
    contextUsed?: string[]
    disambiguationReason?: string
  }
}

export interface ConversationContext {
  id: string
  turns: ConversationTurn[]
  activeTopics: Array<{topic: string; relevance: number; lastMentioned: Date}>
  entities: Map<string, {value: string; type: string; confidence: number; lastSeen: Date}>
  intentHistory: Array<{intent: string; timestamp: Date; confidence: number}>
  currentFocus?: {
    topic: string
    intent: string
    entities: string[]
    confidence: number
    established: Date
  }
  summary: {
    dominantIntents: Array<{intent: string; frequency: number}>
    keyTopics: Array<{topic: string; mentions: number}>
    conversationLength: number
    averageConfidence: number
    lastActivity: Date
  }
}

export interface ContextResolutionConfig {
  maxContextWindow: number
  contextDecayFactor: number
  followUpDetectionThreshold: number
  disambiguationThreshold: number
  topicRelevanceThreshold: number
  entityExpiryMinutes: number
  minimumContextScore: number
  maxActiveTopics: number
}

export interface IntentResolutionResult {
  originalIntent: string
  resolvedIntent: string
  confidence: number
  contextScore: number
  usedContext: string[]
  isFollowUp: boolean
  disambiguationReason?: string
  suggestedClarification?: string
  entities: Array<{type: string; value: string; confidence: number}>
}

/**
 * Context Manager
 *
 * Manages conversation context and provides context-aware intent resolution
 */
export class ContextManager extends EventEmitter {
  private conversations: Map<string, ConversationContext> = new Map()
  private config: ContextResolutionConfig
  private isInitialized: boolean = false

  // Context patterns for different types of follow-ups
  private followUpPatterns = {
    // Clarification requests
    clarification: [
      /^(what|which|how) (do you mean|did you mean|are you referring to)/i,
      /^(can you|could you) (clarify|explain|be more specific)/i,
      /^(i don't|i'm not) (understand|sure|clear)/i,
      /^(sorry|pardon|what)\?*$/i,
      /^(huh|eh)\?*$/i
    ],

    // Follow-up questions
    followUp: [
      /^(and|also|plus|additionally)/i,
      /^(what about|how about|what if)/i,
      /^(but|however|though)/i,
      /^(then|so|now)/i,
      /^(can (you|I)|could (you|I)|should I)/i
    ],

    // Confirmation requests
    confirmation: [
      /^(is that|is this|are you) (right|correct|sure)/i,
      /^(do you mean|are you saying)/i,
      /^(so you're saying|so basically)/i,
      /^(just to confirm|to be clear)/i,
      /^(right\?|correct\?|yes\?)$/i
    ],

    // Reference to previous context
    contextReference: [
      /\b(that|this|it|them|those|these)\b/i,
      /\b(the (one|thing|method|approach|solution))\b/i,
      /\b(you mentioned|you said|earlier|before)\b/i,
      /\b(from (before|earlier|above))\b/i
    ]
  }

  // Intent disambiguation rules
  private disambiguationRules = {
    // If user asks "how" after information request, likely wants instructions
    information_seeking_to_instruction: {
      previousIntent: 'information_seeking',
      currentPatterns: [/^how (do|can|should)/i],
      newIntent: 'instruction_request',
      confidence: 0.8
    },

    // If user asks "what about X" after instruction, likely wants alternatives
    instruction_to_comparison: {
      previousIntent: 'instruction_request',
      currentPatterns: [/^(what about|how about|what if)/i],
      newIntent: 'comparison_request',
      confidence: 0.7
    },

    // If user says "it doesn't work" after instruction, likely troubleshooting
    instruction_to_troubleshooting: {
      previousIntent: 'instruction_request',
      currentPatterns: [/(doesn't work|not working|error|problem|issue)/i],
      newIntent: 'troubleshooting',
      confidence: 0.9
    },

    // Generic follow-up becomes clarification if uncertain
    uncertain_to_clarification: {
      previousIntent: '*',
      currentPatterns: [/^(what|huh|sorry|pardon)\?*$/i],
      newIntent: 'clarification_request',
      confidence: 0.6
    }
  }

  constructor(config: Partial<ContextResolutionConfig> = {}) {
    super()

    this.config = {
      maxContextWindow: 10,
      contextDecayFactor: 0.9,
      followUpDetectionThreshold: 0.7,
      disambiguationThreshold: 0.6,
      topicRelevanceThreshold: 0.5,
      entityExpiryMinutes: 30,
      minimumContextScore: 0.3,
      maxActiveTopics: 5,
      ...config
    }
  }

  /**
   * Initialize the context manager
   */
  async initialize(): Promise<void> {
    try {
      this.isInitialized = true

      logger.info(
        sanitizeLogMessage('Context Manager initialized', {
          maxContextWindow: this.config.maxContextWindow,
          contextDecayFactor: this.config.contextDecayFactor
        })
      )

      this.emit('initialized', this.config)
    } catch (error) {
      logger.error(
        sanitizeLogMessage('Failed to initialize Context Manager', {
          error: error instanceof Error ? error.message : String(error)
        })
      )
      throw error
    }
  }

  /**
   * Add a new turn to the conversation and get context-aware intent resolution
   */
  async resolveIntentWithContext(
    conversationId: string,
    text: string,
    originalIntent: string,
    originalConfidence: number,
    entities: Array<{type: string; value: string; confidence: number}> = []
  ): Promise<IntentResolutionResult> {
    const startTime = Date.now()

    // Get or create conversation context
    let context = this.conversations.get(conversationId)
    if (!context) {
      context = this.createNewConversation(conversationId)
      this.conversations.set(conversationId, context)
    }

    // Create the new turn
    const newTurn: ConversationTurn = {
      id: this.generateTurnId(),
      timestamp: new Date(),
      text,
      intent: originalIntent,
      confidence: originalConfidence,
      entities,
      resolved: false,
      metadata: {
        speaker: 'user',
        processingTime: 0,
        contextUsed: []
      }
    }

    // Detect if this is a follow-up
    const followUpAnalysis = this.detectFollowUp(text, context)

    // Resolve intent using context
    const resolution = await this.performContextualResolution(
      newTurn,
      originalIntent,
      originalConfidence,
      context,
      followUpAnalysis
    )

    // Update the turn with resolved information
    newTurn.intent = resolution.resolvedIntent
    newTurn.confidence = resolution.confidence
    newTurn.resolved = true
    newTurn.followUpTo = followUpAnalysis.isFollowUp
      ? context.turns[context.turns.length - 1]?.id
      : undefined
    newTurn.contextScore = resolution.contextScore
    newTurn.metadata.processingTime = Date.now() - startTime
    newTurn.metadata.contextUsed = resolution.usedContext
    newTurn.metadata.disambiguationReason = resolution.disambiguationReason

    // Add turn to context and update context state
    this.addTurnToContext(context, newTurn)
    this.updateContextState(context, newTurn)

    // Clean up old context if needed
    this.maintainContextWindow(context)

    logger.info(
      sanitizeLogMessage('Intent resolved with context', {
        conversationId,
        originalIntent,
        resolvedIntent: resolution.resolvedIntent,
        contextScore: resolution.contextScore,
        isFollowUp: resolution.isFollowUp,
        processingTime: newTurn.metadata.processingTime
      })
    )

    this.emit('intentResolved', {
      conversationId,
      turn: newTurn,
      resolution
    })

    return resolution
  }

  /**
   * Detect if the current text is a follow-up to previous turns
   */
  private detectFollowUp(
    text: string,
    context: ConversationContext
  ): {
    isFollowUp: boolean
    followUpType: string | null
    confidence: number
    referencedTurn?: ConversationTurn
  } {
    if (context.turns.length === 0) {
      return {isFollowUp: false, followUpType: null, confidence: 0}
    }

    const lastTurn = context.turns[context.turns.length - 1]
    const recentTurns = context.turns.slice(-3) // Look at last 3 turns

    // Check for different types of follow-ups
    for (const [type, patterns] of Object.entries(this.followUpPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          const confidence = this.calculateFollowUpConfidence(text, type, recentTurns)

          if (confidence >= this.config.followUpDetectionThreshold) {
            return {
              isFollowUp: true,
              followUpType: type,
              confidence,
              referencedTurn: lastTurn
            }
          }
        }
      }
    }

    // Check for implicit references (pronouns, contextual words)
    const hasContextReference = this.followUpPatterns.contextReference.some(pattern =>
      pattern.test(text)
    )

    if (hasContextReference) {
      // Lower confidence for implicit references
      return {
        isFollowUp: true,
        followUpType: 'contextReference',
        confidence: 0.6,
        referencedTurn: lastTurn
      }
    }

    return {isFollowUp: false, followUpType: null, confidence: 0}
  }

  /**
   * Calculate confidence score for follow-up detection
   */
  private calculateFollowUpConfidence(
    text: string,
    followUpType: string,
    recentTurns: ConversationTurn[]
  ): number {
    let confidence = 0.5

    // Boost confidence based on follow-up type
    switch (followUpType) {
      case 'clarification':
        confidence = 0.8
        break
      case 'confirmation':
        confidence = 0.7
        break
      case 'followUp':
        confidence = 0.6
        break
      case 'contextReference':
        confidence = 0.5
        break
    }

    // Boost if recent turns had low confidence (user might be confused)
    const recentLowConfidence = recentTurns.some(turn => (turn.confidence || 0) < 0.6)
    if (recentLowConfidence && followUpType === 'clarification') {
      confidence += 0.1
    }

    // Reduce confidence for very long texts (less likely to be simple follow-ups)
    if (text.length > 100) {
      confidence -= 0.2
    }

    // Boost if text is very short (typical of follow-ups)
    if (text.length < 20) {
      confidence += 0.1
    }

    return Math.max(0, Math.min(1, confidence))
  }

  /**
   * Perform contextual intent resolution
   */
  private async performContextualResolution(
    turn: ConversationTurn,
    originalIntent: string,
    originalConfidence: number,
    context: ConversationContext,
    followUpAnalysis: {isFollowUp: boolean; followUpType: string | null; confidence: number}
  ): Promise<IntentResolutionResult> {
    const usedContext: string[] = []
    let resolvedIntent = originalIntent
    let resolvedConfidence = originalConfidence
    let contextScore = 0
    let disambiguationReason: string | undefined
    let suggestedClarification: string | undefined

    // If it's a follow-up, try to resolve using context
    if (followUpAnalysis.isFollowUp) {
      usedContext.push(`followUp_${followUpAnalysis.followUpType}`)

      // Apply disambiguation rules
      const disambiguation = this.applyDisambiguationRules(turn.text, originalIntent, context)

      if (disambiguation) {
        resolvedIntent = disambiguation.intent
        resolvedConfidence = Math.max(originalConfidence, disambiguation.confidence)
        disambiguationReason = disambiguation.reason
        usedContext.push('disambiguation_rules')
        contextScore += 0.3
      }

      // Use context focus if available
      if (context.currentFocus) {
        const focusRelevance = this.calculateFocusRelevance(turn.text, context.currentFocus)
        if (focusRelevance > this.config.topicRelevanceThreshold) {
          // Context suggests maintaining current focus
          contextScore += focusRelevance * 0.4
          usedContext.push('current_focus')

          // If original confidence is low, boost with context
          if (originalConfidence < 0.7) {
            resolvedConfidence = Math.min(0.9, originalConfidence + focusRelevance * 0.2)
          }
        }
      }

      // Check entity continuity
      const entityContinuity = this.checkEntityContinuity(turn.entities || [], context)
      if (entityContinuity.score > 0) {
        contextScore += entityContinuity.score * 0.2
        usedContext.push('entity_continuity')
      }

      // Use intent history for disambiguation
      const intentHistory = this.analyzeIntentHistory(context)
      if (intentHistory.confidence > 0.5) {
        contextScore += intentHistory.confidence * 0.1
        usedContext.push('intent_history')
      }
    }

    // Calculate final context score
    contextScore = Math.min(1.0, contextScore)

    // Generate clarification if confidence is still low
    if (resolvedConfidence < this.config.disambiguationThreshold) {
      suggestedClarification = this.generateClarificationSuggestion(
        turn.text,
        resolvedIntent,
        context
      )
    }

    return {
      originalIntent,
      resolvedIntent,
      confidence: resolvedConfidence,
      contextScore,
      usedContext,
      isFollowUp: followUpAnalysis.isFollowUp,
      disambiguationReason,
      suggestedClarification,
      entities: turn.entities || []
    }
  }

  /**
   * Apply disambiguation rules based on conversation history
   */
  private applyDisambiguationRules(
    text: string,
    currentIntent: string,
    context: ConversationContext
  ): {intent: string; confidence: number; reason: string} | null {
    const recentTurns = context.turns.slice(-3)

    if (recentTurns.length === 0) return null

    const lastTurn = recentTurns[recentTurns.length - 1]
    const previousIntent = lastTurn.intent

    if (!previousIntent) return null

    // Check each disambiguation rule
    for (const [ruleName, rule] of Object.entries(this.disambiguationRules)) {
      // Check if previous intent matches (or wildcard)
      if (rule.previousIntent !== '*' && rule.previousIntent !== previousIntent) {
        continue
      }

      // Check if current text matches patterns
      const patternMatch = rule.currentPatterns.some(pattern => pattern.test(text))

      if (patternMatch) {
        return {
          intent: rule.newIntent,
          confidence: rule.confidence,
          reason: `Applied rule: ${ruleName} (${rule.previousIntent} → ${rule.newIntent})`
        }
      }
    }

    return null
  }

  /**
   * Calculate relevance to current conversation focus
   */
  private calculateFocusRelevance(
    text: string,
    focus: NonNullable<ConversationContext['currentFocus']>
  ): number {
    let relevance = 0

    // Check for topic keywords
    const topicWords = focus.topic.toLowerCase().split(/\s+/)
    const textLower = text.toLowerCase()

    for (const word of topicWords) {
      if (textLower.includes(word)) {
        relevance += 0.2
      }
    }

    // Check for entity references
    for (const entityName of focus.entities) {
      if (textLower.includes(entityName.toLowerCase())) {
        relevance += 0.3
      }
    }

    // Time decay - focus becomes less relevant over time
    const timeSinceEstablished = (Date.now() - focus.established.getTime()) / (1000 * 60) // minutes
    const timeDecay = Math.max(0, 1 - timeSinceEstablished / 30) // 30-minute relevance window

    return Math.min(1.0, relevance * timeDecay)
  }

  /**
   * Check entity continuity between turns
   */
  private checkEntityContinuity(
    currentEntities: Array<{type: string; value: string; confidence: number}>,
    context: ConversationContext
  ): {score: number; continuousEntities: string[]} {
    const continuousEntities: string[] = []
    let totalScore = 0

    for (const entity of currentEntities) {
      const contextEntity = context.entities.get(entity.value)

      if (contextEntity) {
        // Entity exists in context
        const timeSinceLastSeen = (Date.now() - contextEntity.lastSeen.getTime()) / (1000 * 60)

        if (timeSinceLastSeen <= this.config.entityExpiryMinutes) {
          continuousEntities.push(entity.value)
          totalScore += 0.2 * Math.max(0, 1 - timeSinceLastSeen / this.config.entityExpiryMinutes)
        }
      }
    }

    return {
      score: Math.min(1.0, totalScore),
      continuousEntities
    }
  }

  /**
   * Analyze intent history for patterns
   */
  private analyzeIntentHistory(context: ConversationContext): {
    confidence: number
    dominantIntent?: string
  } {
    const recentIntents = context.intentHistory.slice(-5) // Last 5 intents

    if (recentIntents.length < 2) {
      return {confidence: 0}
    }

    // Find most common intent
    const intentCounts: Record<string, number> = {}
    for (const {intent} of recentIntents) {
      intentCounts[intent] = (intentCounts[intent] || 0) + 1
    }

    const dominantIntent = Object.entries(intentCounts).sort(([, a], [, b]) => b - a)[0][0]

    const dominance = intentCounts[dominantIntent] / recentIntents.length

    return {
      confidence: dominance,
      dominantIntent: dominance > 0.5 ? dominantIntent : undefined
    }
  }

  /**
   * Generate clarification suggestion when confidence is low
   */
  private generateClarificationSuggestion(
    text: string,
    intent: string,
    context: ConversationContext
  ): string {
    const recentTopics = context.activeTopics.slice(0, 3)

    switch (intent) {
      case 'information_seeking':
        if (recentTopics.length > 0) {
          return `Are you asking about ${recentTopics[0].topic}? Or do you need information about something else?`
        }
        return "Could you be more specific about what information you're looking for?"

      case 'instruction_request':
        if (recentTopics.length > 0) {
          return `Do you need help with ${recentTopics[0].topic}? Or are you asking about a different process?`
        }
        return 'What specific task or process would you like help with?'

      case 'clarification_request':
        const lastTurn = context.turns[context.turns.length - 1]
        if (lastTurn) {
          return `Are you asking me to clarify something about "${lastTurn.text}"?`
        }
        return 'What would you like me to clarify?'

      default:
        return "Could you rephrase your question? I want to make sure I understand what you're asking."
    }
  }

  /**
   * Create a new conversation context
   */
  private createNewConversation(conversationId: string): ConversationContext {
    return {
      id: conversationId,
      turns: [],
      activeTopics: [],
      entities: new Map(),
      intentHistory: [],
      summary: {
        dominantIntents: [],
        keyTopics: [],
        conversationLength: 0,
        averageConfidence: 0,
        lastActivity: new Date()
      }
    }
  }

  /**
   * Add turn to context and maintain history
   */
  private addTurnToContext(context: ConversationContext, turn: ConversationTurn): void {
    context.turns.push(turn)

    // Add to intent history
    if (turn.intent && turn.confidence !== undefined) {
      context.intentHistory.push({
        intent: turn.intent,
        timestamp: turn.timestamp,
        confidence: turn.confidence
      })
    }

    // Update entities
    if (turn.entities) {
      for (const entity of turn.entities) {
        context.entities.set(entity.value, {
          value: entity.value,
          type: entity.type,
          confidence: entity.confidence,
          lastSeen: turn.timestamp
        })
      }
    }
  }

  /**
   * Update context state based on new turn
   */
  private updateContextState(context: ConversationContext, turn: ConversationTurn): void {
    // Extract topics from the turn
    const topics = this.extractTopics(turn.text)

    // Update active topics
    for (const topic of topics) {
      const existingTopic = context.activeTopics.find(t => t.topic === topic)

      if (existingTopic) {
        existingTopic.relevance = Math.min(1.0, existingTopic.relevance + 0.1)
        existingTopic.lastMentioned = turn.timestamp
      } else {
        context.activeTopics.push({
          topic,
          relevance: 0.5,
          lastMentioned: turn.timestamp
        })
      }
    }

    // Maintain active topics list size
    context.activeTopics = context.activeTopics
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, this.config.maxActiveTopics)

    // Update current focus
    if (turn.intent && turn.confidence && turn.confidence > 0.7) {
      context.currentFocus = {
        topic: topics[0] || 'general',
        intent: turn.intent,
        entities: (turn.entities || []).map(e => e.value),
        confidence: turn.confidence,
        established: turn.timestamp
      }
    }

    // Update summary
    this.updateContextSummary(context)
  }

  /**
   * Extract topics from text (simple keyword-based for now)
   */
  private extractTopics(text: string): string[] {
    // Simple topic extraction - in production, use NLP techniques
    const techKeywords = [
      'javascript',
      'python',
      'react',
      'node',
      'database',
      'api',
      'authentication',
      'deployment',
      'testing',
      'performance',
      'security',
      'frontend',
      'backend',
      'mobile',
      'web'
    ]

    const foundTopics: string[] = []
    const textLower = text.toLowerCase()

    for (const keyword of techKeywords) {
      if (textLower.includes(keyword)) {
        foundTopics.push(keyword)
      }
    }

    return foundTopics
  }

  /**
   * Update conversation summary statistics
   */
  private updateContextSummary(context: ConversationContext): void {
    const turns = context.turns

    // Update conversation length
    context.summary.conversationLength = turns.length

    // Calculate average confidence
    const confidences = turns.map(t => t.confidence || 0).filter(c => c > 0)
    context.summary.averageConfidence =
      confidences.length > 0 ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length : 0

    // Update last activity
    context.summary.lastActivity = turns[turns.length - 1]?.timestamp || new Date()

    // Calculate dominant intents
    const intentCounts: Record<string, number> = {}
    for (const {intent} of context.intentHistory) {
      intentCounts[intent] = (intentCounts[intent] || 0) + 1
    }

    context.summary.dominantIntents = Object.entries(intentCounts)
      .map(([intent, frequency]) => ({intent, frequency}))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3)

    // Calculate key topics
    const topicCounts: Record<string, number> = {}
    for (const {topic} of context.activeTopics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1
    }

    context.summary.keyTopics = Object.entries(topicCounts)
      .map(([topic, mentions]) => ({topic, mentions}))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5)
  }

  /**
   * Maintain context window size and clean up old data
   */
  private maintainContextWindow(context: ConversationContext): void {
    // Trim turns if exceeding max window
    if (context.turns.length > this.config.maxContextWindow) {
      const excessTurns = context.turns.length - this.config.maxContextWindow
      context.turns = context.turns.slice(excessTurns)
    }

    // Clean up expired entities
    const now = Date.now()
    const expiryThreshold = this.config.entityExpiryMinutes * 60 * 1000

    for (const [key, entity] of context.entities.entries()) {
      if (now - entity.lastSeen.getTime() > expiryThreshold) {
        context.entities.delete(key)
      }
    }

    // Apply context decay to topic relevance
    const decayFactor = this.config.contextDecayFactor
    for (const topic of context.activeTopics) {
      topic.relevance *= decayFactor
    }

    // Remove topics with very low relevance
    context.activeTopics = context.activeTopics.filter(
      topic => topic.relevance > this.config.minimumContextScore
    )
  }

  /**
   * Get conversation context for a given conversation ID
   */
  getConversationContext(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId)
  }

  /**
   * Clear conversation context
   */
  clearConversation(conversationId: string): boolean {
    const existed = this.conversations.has(conversationId)
    this.conversations.delete(conversationId)

    if (existed) {
      this.emit('conversationCleared', {conversationId})
    }

    return existed
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): string[] {
    return Array.from(this.conversations.keys())
  }

  /**
   * Get context statistics
   */
  getContextStats(): {
    activeConversations: number
    totalTurns: number
    averageConversationLength: number
    averageConfidence: number
  } {
    const conversations = Array.from(this.conversations.values())
    const totalTurns = conversations.reduce((sum, c) => sum + c.turns.length, 0)
    const totalConfidence = conversations.reduce((sum, c) => sum + c.summary.averageConfidence, 0)

    return {
      activeConversations: conversations.length,
      totalTurns,
      averageConversationLength: conversations.length > 0 ? totalTurns / conversations.length : 0,
      averageConfidence: conversations.length > 0 ? totalConfidence / conversations.length : 0
    }
  }

  /**
   * Utility methods
   */
  private generateTurnId(): string {
    return `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Export conversation for analysis or backup
   */
  exportConversation(conversationId: string): ConversationContext | null {
    const context = this.conversations.get(conversationId)
    return context ? JSON.parse(JSON.stringify(context)) : null
  }

  /**
   * Import conversation from backup
   */
  importConversation(conversationData: ConversationContext): void {
    // Convert date strings back to Date objects
    conversationData.turns.forEach(turn => {
      turn.timestamp = new Date(turn.timestamp)
    })

    conversationData.activeTopics.forEach(topic => {
      topic.lastMentioned = new Date(topic.lastMentioned)
    })

    conversationData.entities.forEach(entity => {
      entity.lastSeen = new Date(entity.lastSeen)
    })

    conversationData.intentHistory.forEach(intent => {
      intent.timestamp = new Date(intent.timestamp)
    })

    conversationData.summary.lastActivity = new Date(conversationData.summary.lastActivity)

    this.conversations.set(conversationData.id, conversationData)
    this.emit('conversationImported', {conversationId: conversationData.id})
  }
}
