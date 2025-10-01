/**
 * Training Data Management System for Advanced Intent Classification
 *
 * This system manages training data for the Advanced Intent Classifier,
 * including dataset creation, data augmentation, continuous learning,
 * and active learning capabilities.
 *
 * Key Features:
 * - Diverse question type dataset generation
 * - Data augmentation techniques for variety
 * - Continuous data collection pipeline
 * - Active learning for model improvement
 * - Quality validation and metrics
 * - Export capabilities for model training
 */

import {EventEmitter} from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import {logger} from './gemini-logger'
import {sanitizeLogMessage} from './log-sanitizer'

// Training data interfaces
export interface TrainingExample {
  id: string
  text: string
  intent: string
  confidence: number
  questionType: 'punctuated' | 'no_punctuation' | 'embedded' | 'compound'
  source: 'manual' | 'generated' | 'user_feedback' | 'active_learning'
  metadata: {
    language?: string
    domain?: string
    complexity?: number
    contextLength?: number
    createdAt: Date
    validatedBy?: string
    quality_score?: number
  }
}

export interface DatasetMetrics {
  totalExamples: number
  intentDistribution: Record<string, number>
  questionTypeDistribution: Record<string, number>
  sourceDistribution: Record<string, number>
  qualityScore: number
  coverage: {
    intentCoverage: number
    questionTypeCoverage: number
    domainCoverage: number
  }
}

export interface DataAugmentationConfig {
  synonymReplacement: boolean
  questionPrefixVariation: boolean
  contextualVariation: boolean
  punctuationVariation: boolean
  lengthVariation: boolean
  domainVariation: boolean
  maxVariationsPerExample: number
}

export interface ActiveLearningConfig {
  uncertaintyThreshold: number
  diversityThreshold: number
  maxExamplesPerBatch: number
  retrainingThreshold: number
  feedbackWeight: number
}

/**
 * Training Data Manager
 *
 * Manages the lifecycle of training data for the Advanced Intent Classifier
 */
export class TrainingDataManager extends EventEmitter {
  private examples: Map<string, TrainingExample> = new Map()
  private baseDatasetPath: string
  private augmentationConfig: DataAugmentationConfig
  private activeLearningConfig: ActiveLearningConfig
  private isInitialized: boolean = false

  // Built-in intent patterns for data generation
  private intentPatterns = {
    information_seeking: [
      'What is {topic}',
      'Tell me about {topic}',
      'Explain {topic}',
      'What does {term} mean',
      'Define {term}',
      'How does {process} work',
      'What are the benefits of {topic}',
      'Why is {topic} important'
    ],
    instruction_request: [
      'How do I {action}',
      'Show me how to {action}',
      'Guide me through {process}',
      'What are the steps to {action}',
      'Can you help me {action}',
      'I need to know how to {action}',
      'Teach me to {action}',
      'Walk me through {process}'
    ],
    confirmation_seeking: [
      'Is {statement} correct',
      'Am I right about {topic}',
      'Does this make sense {context}',
      'Is it true that {statement}',
      'Can you confirm {statement}',
      'Would you agree that {statement}',
      'Is my understanding correct about {topic}',
      'Do you think {opinion} is right'
    ],
    clarification_request: [
      'What do you mean by {term}',
      'Can you clarify {statement}',
      "I don't understand {concept}",
      'Could you explain {term} better',
      'What exactly is {concept}',
      "I'm confused about {topic}",
      'Can you be more specific about {topic}',
      'What are you referring to when you say {term}'
    ],
    comparison_request: [
      "What's the difference between {item1} and {item2}",
      'How does {item1} compare to {item2}',
      'Which is better {item1} or {item2}',
      'What are the pros and cons of {topic}',
      'How do {item1} and {item2} differ',
      'Can you compare {item1} versus {item2}',
      'What are the similarities between {item1} and {item2}',
      'Which would you recommend {item1} or {item2}'
    ],
    troubleshooting: [
      "Why isn't {system} working",
      'How do I fix {problem}',
      "What's wrong with {system}",
      "I'm having trouble with {issue}",
      'My {system} is not {expected_behavior}',
      'How can I resolve {problem}',
      'What should I do when {issue} happens',
      'Why am I getting {error}'
    ]
  }

  // Sample data placeholders for augmentation
  private sampleData = {
    topics: [
      'machine learning',
      'artificial intelligence',
      'programming',
      'databases',
      'web development',
      'mobile apps',
      'cloud computing',
      'cybersecurity',
      'data science',
      'DevOps',
      'blockchain',
      'IoT',
      'APIs',
      'algorithms'
    ],
    actions: [
      'install Node.js',
      'deploy a website',
      'create a database',
      'debug code',
      'set up authentication',
      'optimize performance',
      'write tests',
      'configure SSL',
      'implement caching',
      'handle errors',
      'migrate data',
      'scale applications'
    ],
    terms: [
      'API',
      'framework',
      'library',
      'middleware',
      'microservices',
      'containers',
      'serverless',
      'REST',
      'GraphQL',
      'OAuth',
      'JWT',
      'encryption',
      'hashing'
    ],
    systems: [
      'database',
      'server',
      'application',
      'website',
      'API',
      'authentication',
      'payment system',
      'notification service',
      'cache',
      'load balancer'
    ],
    processes: [
      'deployment',
      'testing',
      'debugging',
      'optimization',
      'authentication',
      'data processing',
      'error handling',
      'logging',
      'monitoring',
      'scaling'
    ]
  }

  constructor(
    baseDatasetPath: string = './data/training',
    augmentationConfig: Partial<DataAugmentationConfig> = {},
    activeLearningConfig: Partial<ActiveLearningConfig> = {}
  ) {
    super()

    this.baseDatasetPath = baseDatasetPath
    this.augmentationConfig = {
      synonymReplacement: true,
      questionPrefixVariation: true,
      contextualVariation: true,
      punctuationVariation: true,
      lengthVariation: true,
      domainVariation: true,
      maxVariationsPerExample: 5,
      ...augmentationConfig
    }

    this.activeLearningConfig = {
      uncertaintyThreshold: 0.6,
      diversityThreshold: 0.8,
      maxExamplesPerBatch: 100,
      retrainingThreshold: 0.1,
      feedbackWeight: 2.0,
      ...activeLearningConfig
    }
  }

  /**
   * Initialize the training data manager
   */
  async initialize(): Promise<void> {
    try {
      await this.ensureDirectories()
      await this.loadExistingData()
      await this.generateBaseDataset()
      this.isInitialized = true

      logger.info(
        sanitizeLogMessage('Training Data Manager initialized', {
          examples: this.examples.size,
          baseDatasetPath: this.baseDatasetPath
        })
      )

      this.emit('initialized', {
        totalExamples: this.examples.size,
        datasetPath: this.baseDatasetPath
      })
    } catch (error) {
      logger.error(
        sanitizeLogMessage('Failed to initialize Training Data Manager', {
          error: error instanceof Error ? error.message : String(error)
        })
      )
      throw error
    }
  }

  /**
   * Generate a diverse base dataset with various question types
   */
  async generateBaseDataset(): Promise<void> {
    if (this.examples.size > 0) {
      logger.info('Base dataset already exists, skipping generation')
      return
    }

    logger.info('Generating base training dataset...')
    const generatedExamples: TrainingExample[] = []

    // Generate examples for each intent type
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      for (const pattern of patterns) {
        // Generate variations for each pattern
        const variations = this.generatePatternVariations(pattern, intent)
        generatedExamples.push(...variations)
      }
    }

    // Add the examples to our dataset
    for (const example of generatedExamples) {
      this.examples.set(example.id, example)
    }

    await this.saveDataset()

    logger.info(
      sanitizeLogMessage('Base dataset generated', {
        totalExamples: generatedExamples.length,
        intentTypes: Object.keys(this.intentPatterns).length
      })
    )

    this.emit('datasetGenerated', {
      totalExamples: generatedExamples.length,
      intentTypes: Object.keys(this.intentPatterns).length
    })
  }

  /**
   * Generate variations of a pattern for different question types
   */
  private generatePatternVariations(pattern: string, intent: string): TrainingExample[] {
    const variations: TrainingExample[] = []
    const baseId = this.generateId()

    // Replace placeholders with sample data
    const filledPatterns = this.fillPatternPlaceholders(pattern, 3)

    for (let i = 0; i < filledPatterns.length; i++) {
      const baseText = filledPatterns[i]

      // Generate different question type variations
      const questionTypeVariations = [
        {
          text: baseText + '?',
          type: 'punctuated' as const,
          confidence: 0.9
        },
        {
          text: baseText,
          type: 'no_punctuation' as const,
          confidence: 0.8
        },
        {
          text: `I need some help. ${baseText}?`,
          type: 'embedded' as const,
          confidence: 0.7
        },
        {
          text: `${baseText} and also what are the alternatives?`,
          type: 'compound' as const,
          confidence: 0.8
        }
      ]

      for (const variation of questionTypeVariations) {
        variations.push({
          id: `${baseId}_${i}_${variation.type}`,
          text: variation.text,
          intent,
          confidence: variation.confidence,
          questionType: variation.type,
          source: 'generated',
          metadata: {
            domain: 'technology',
            complexity: this.calculateComplexity(variation.text),
            contextLength: variation.text.length,
            createdAt: new Date(),
            quality_score: variation.confidence
          }
        })
      }
    }

    return variations
  }

  /**
   * Fill pattern placeholders with sample data
   */
  private fillPatternPlaceholders(pattern: string, count: number = 3): string[] {
    const variations: string[] = []
    const placeholders = pattern.match(/\{(\w+)\}/g) || []

    if (placeholders.length === 0) {
      return [pattern]
    }

    for (let i = 0; i < count; i++) {
      let filledPattern = pattern

      for (const placeholder of placeholders) {
        const key = placeholder.replace(/[{}]/g, '') as keyof typeof this.sampleData
        const sampleValues = this.sampleData[key] || ['example']
        const randomValue = sampleValues[Math.floor(Math.random() * sampleValues.length)]
        filledPattern = filledPattern.replace(placeholder, randomValue)
      }

      variations.push(filledPattern)
    }

    return variations
  }

  /**
   * Apply data augmentation techniques to expand the dataset
   */
  async augmentDataset(examples?: TrainingExample[]): Promise<TrainingExample[]> {
    const targetExamples = examples || Array.from(this.examples.values())
    const augmentedExamples: TrainingExample[] = []

    logger.info(
      sanitizeLogMessage('Starting data augmentation', {
        sourceExamples: targetExamples.length,
        maxVariationsPerExample: this.augmentationConfig.maxVariationsPerExample
      })
    )

    for (const example of targetExamples) {
      const variations = await this.generateAugmentations(example)
      augmentedExamples.push(...variations)
    }

    // Add augmented examples to the dataset
    for (const example of augmentedExamples) {
      this.examples.set(example.id, example)
    }

    await this.saveDataset()

    logger.info(
      sanitizeLogMessage('Data augmentation completed', {
        augmentedExamples: augmentedExamples.length,
        totalExamples: this.examples.size
      })
    )

    this.emit('datasetAugmented', {
      augmentedExamples: augmentedExamples.length,
      totalExamples: this.examples.size
    })

    return augmentedExamples
  }

  /**
   * Generate augmented variations of a training example
   */
  private async generateAugmentations(example: TrainingExample): Promise<TrainingExample[]> {
    const variations: TrainingExample[] = []
    const maxVariations = this.augmentationConfig.maxVariationsPerExample

    // Synonym replacement
    if (this.augmentationConfig.synonymReplacement) {
      const synonymVariations = this.applySynonymReplacement(example)
      variations.push(...synonymVariations.slice(0, Math.ceil(maxVariations / 4)))
    }

    // Question prefix variation
    if (this.augmentationConfig.questionPrefixVariation) {
      const prefixVariations = this.applyQuestionPrefixVariation(example)
      variations.push(...prefixVariations.slice(0, Math.ceil(maxVariations / 4)))
    }

    // Punctuation variation
    if (this.augmentationConfig.punctuationVariation) {
      const punctuationVariations = this.applyPunctuationVariation(example)
      variations.push(...punctuationVariations.slice(0, Math.ceil(maxVariations / 4)))
    }

    // Contextual variation
    if (this.augmentationConfig.contextualVariation) {
      const contextVariations = this.applyContextualVariation(example)
      variations.push(...contextVariations.slice(0, Math.ceil(maxVariations / 4)))
    }

    return variations.slice(0, maxVariations)
  }

  /**
   * Apply synonym replacement augmentation
   */
  private applySynonymReplacement(example: TrainingExample): TrainingExample[] {
    // Simple synonym replacement (in a real implementation, use a proper thesaurus API)
    const synonymMap: Record<string, string[]> = {
      what: ['which', 'what kind of'],
      how: ['in what way', 'by what means'],
      where: ['at what location', 'in which place'],
      when: ['at what time', 'during which period'],
      why: ['for what reason', 'what causes'],
      can: ['could', 'would', 'is it possible to'],
      help: ['assist', 'support', 'guide'],
      explain: ['describe', 'clarify', 'tell me about'],
      show: ['demonstrate', 'display', 'illustrate'],
      tell: ['inform', 'explain', 'describe']
    }

    const variations: TrainingExample[] = []
    let variationCount = 0

    for (const [original, synonyms] of Object.entries(synonymMap)) {
      if (variationCount >= 2) break

      const regex = new RegExp(`\\b${original}\\b`, 'gi')
      if (regex.test(example.text)) {
        for (const synonym of synonyms.slice(0, 1)) {
          const augmentedText = example.text.replace(regex, synonym)

          variations.push({
            ...example,
            id: `${example.id}_syn_${variationCount++}`,
            text: augmentedText,
            source: 'generated',
            confidence: Math.max(0.5, example.confidence - 0.1),
            metadata: {
              ...example.metadata,
              createdAt: new Date(),
              quality_score: Math.max(0.5, example.confidence - 0.1)
            }
          })
        }
      }
    }

    return variations
  }

  /**
   * Apply question prefix variation
   */
  private applyQuestionPrefixVariation(example: TrainingExample): TrainingExample[] {
    const questionPrefixes = [
      'Could you tell me',
      'I would like to know',
      'I need to understand',
      'Can you help me understand',
      'I want to know'
    ]

    const variations: TrainingExample[] = []

    // Only apply to certain question types
    if (example.questionType === 'no_punctuation') {
      for (let i = 0; i < 2; i++) {
        const prefix = questionPrefixes[i]
        const augmentedText = `${prefix} ${example.text.toLowerCase()}`

        variations.push({
          ...example,
          id: `${example.id}_prefix_${i}`,
          text: augmentedText,
          source: 'generated',
          questionType: 'embedded',
          confidence: Math.max(0.6, example.confidence - 0.05),
          metadata: {
            ...example.metadata,
            createdAt: new Date(),
            contextLength: augmentedText.length,
            quality_score: Math.max(0.6, example.confidence - 0.05)
          }
        })
      }
    }

    return variations
  }

  /**
   * Apply punctuation variation
   */
  private applyPunctuationVariation(example: TrainingExample): TrainingExample[] {
    const variations: TrainingExample[] = []

    // Add/remove question marks
    if (example.text.endsWith('?')) {
      variations.push({
        ...example,
        id: `${example.id}_nopunct`,
        text: example.text.slice(0, -1),
        questionType: 'no_punctuation',
        source: 'generated',
        confidence: Math.max(0.6, example.confidence - 0.1),
        metadata: {
          ...example.metadata,
          createdAt: new Date(),
          quality_score: Math.max(0.6, example.confidence - 0.1)
        }
      })
    } else {
      variations.push({
        ...example,
        id: `${example.id}_withpunct`,
        text: example.text + '?',
        questionType: 'punctuated',
        source: 'generated',
        confidence: Math.min(0.95, example.confidence + 0.05),
        metadata: {
          ...example.metadata,
          createdAt: new Date(),
          quality_score: Math.min(0.95, example.confidence + 0.05)
        }
      })
    }

    return variations
  }

  /**
   * Apply contextual variation
   */
  private applyContextualVariation(example: TrainingExample): TrainingExample[] {
    const contexts = [
      "I'm working on a project and",
      'As a beginner,',
      'In my application,',
      'For my use case,',
      "I'm trying to understand"
    ]

    const variations: TrainingExample[] = []

    for (let i = 0; i < 2; i++) {
      const context = contexts[i]
      const augmentedText = `${context} ${example.text.toLowerCase()}`

      variations.push({
        ...example,
        id: `${example.id}_context_${i}`,
        text: augmentedText,
        source: 'generated',
        questionType: 'embedded',
        confidence: Math.max(0.6, example.confidence - 0.05),
        metadata: {
          ...example.metadata,
          createdAt: new Date(),
          contextLength: augmentedText.length,
          complexity: this.calculateComplexity(augmentedText),
          quality_score: Math.max(0.6, example.confidence - 0.05)
        }
      })
    }

    return variations
  }

  /**
   * Add training example from user feedback or active learning
   */
  async addTrainingExample(
    text: string,
    intent: string,
    questionType: TrainingExample['questionType'],
    source: TrainingExample['source'] = 'user_feedback',
    metadata: Partial<TrainingExample['metadata']> = {}
  ): Promise<TrainingExample> {
    const example: TrainingExample = {
      id: this.generateId(),
      text,
      intent,
      confidence: 1.0, // High confidence for manually added examples
      questionType,
      source,
      metadata: {
        language: 'en',
        domain: 'general',
        complexity: this.calculateComplexity(text),
        contextLength: text.length,
        createdAt: new Date(),
        quality_score: 1.0,
        ...metadata
      }
    }

    this.examples.set(example.id, example)
    await this.saveDataset()

    logger.info(
      sanitizeLogMessage('Training example added', {
        id: example.id,
        intent,
        questionType,
        source
      })
    )

    this.emit('exampleAdded', example)
    return example
  }

  /**
   * Get dataset metrics and quality statistics
   */
  getDatasetMetrics(): DatasetMetrics {
    const examples = Array.from(this.examples.values())

    const intentDistribution: Record<string, number> = {}
    const questionTypeDistribution: Record<string, number> = {}
    const sourceDistribution: Record<string, number> = {}

    let totalQualityScore = 0

    for (const example of examples) {
      intentDistribution[example.intent] = (intentDistribution[example.intent] || 0) + 1
      questionTypeDistribution[example.questionType] =
        (questionTypeDistribution[example.questionType] || 0) + 1
      sourceDistribution[example.source] = (sourceDistribution[example.source] || 0) + 1
      totalQualityScore += example.metadata.quality_score || 0.5
    }

    const uniqueIntents = Object.keys(intentDistribution).length
    const uniqueQuestionTypes = Object.keys(questionTypeDistribution).length
    const uniqueSources = Object.keys(sourceDistribution).length

    return {
      totalExamples: examples.length,
      intentDistribution,
      questionTypeDistribution,
      sourceDistribution,
      qualityScore: totalQualityScore / examples.length,
      coverage: {
        intentCoverage: uniqueIntents / Object.keys(this.intentPatterns).length,
        questionTypeCoverage: uniqueQuestionTypes / 4, // 4 main question types
        domainCoverage: uniqueSources / 5 // Assuming 5 main sources
      }
    }
  }

  /**
   * Export dataset in various formats for model training
   */
  async exportDataset(
    format: 'json' | 'csv' | 'jsonl' = 'json',
    filePath?: string
  ): Promise<string> {
    const examples = Array.from(this.examples.values())
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const defaultPath = path.join(this.baseDatasetPath, `dataset_${timestamp}.${format}`)
    const outputPath = filePath || defaultPath

    let content: string

    switch (format) {
      case 'json':
        content = JSON.stringify(examples, null, 2)
        break
      case 'jsonl':
        content = examples.map(example => JSON.stringify(example)).join('\n')
        break
      case 'csv':
        const headers =
          'id,text,intent,confidence,questionType,source,domain,complexity,createdAt\n'
        const rows = examples.map(example =>
          [
            example.id,
            `"${example.text.replace(/"/g, '""')}"`,
            example.intent,
            example.confidence,
            example.questionType,
            example.source,
            example.metadata.domain || '',
            example.metadata.complexity || 0,
            example.metadata.createdAt.toISOString()
          ].join(',')
        )
        content = headers + rows.join('\n')
        break
    }

    await fs.writeFile(outputPath, content, 'utf-8')

    logger.info(
      sanitizeLogMessage('Dataset exported', {
        format,
        outputPath,
        examples: examples.length
      })
    )

    this.emit('datasetExported', {format, outputPath, examples: examples.length})
    return outputPath
  }

  /**
   * Implement active learning to identify examples for manual labeling
   */
  identifyActiveLearningCandidates(
    predictionResults: Array<{
      text: string
      predictions: Array<{intent: string; confidence: number}>
    }>
  ): Array<{text: string; reason: string; priority: number}> {
    const candidates: Array<{text: string; reason: string; priority: number}> = []

    for (const result of predictionResults) {
      const maxConfidence = Math.max(...result.predictions.map(p => p.confidence))
      const confidenceSpread =
        Math.max(...result.predictions.map(p => p.confidence)) -
        Math.min(...result.predictions.map(p => p.confidence))

      // Low confidence predictions
      if (maxConfidence < this.activeLearningConfig.uncertaintyThreshold) {
        candidates.push({
          text: result.text,
          reason: `Low confidence (${maxConfidence.toFixed(2)})`,
          priority: 1 - maxConfidence
        })
      }

      // High uncertainty (multiple similar confidence predictions)
      if (confidenceSpread < 0.2 && result.predictions.length > 1) {
        candidates.push({
          text: result.text,
          reason: `High uncertainty (spread: ${confidenceSpread.toFixed(2)})`,
          priority: 0.8
        })
      }
    }

    // Sort by priority (highest first) and limit
    return candidates
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.activeLearningConfig.maxExamplesPerBatch)
  }

  /**
   * Utility methods
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.baseDatasetPath, {recursive: true})
    await fs.mkdir(path.join(this.baseDatasetPath, 'exports'), {recursive: true})
    await fs.mkdir(path.join(this.baseDatasetPath, 'active_learning'), {recursive: true})
  }

  private async loadExistingData(): Promise<void> {
    try {
      const datasetPath = path.join(this.baseDatasetPath, 'dataset.json')
      const content = await fs.readFile(datasetPath, 'utf-8')
      const examples: TrainingExample[] = JSON.parse(content)

      for (const example of examples) {
        this.examples.set(example.id, example)
      }

      logger.info(
        sanitizeLogMessage('Loaded existing dataset', {
          examples: examples.length
        })
      )
    } catch (error) {
      // No existing data, will create new
      logger.info('No existing dataset found, will create new')
    }
  }

  private async saveDataset(): Promise<void> {
    const examples = Array.from(this.examples.values())
    const datasetPath = path.join(this.baseDatasetPath, 'dataset.json')
    await fs.writeFile(datasetPath, JSON.stringify(examples, null, 2))
  }

  private generateId(): string {
    return `example_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private calculateComplexity(text: string): number {
    const words = text.split(/\s+/).length
    const sentences = text.split(/[.!?]+/).length
    const questionWords = (
      text.match(/\b(what|how|where|when|why|which|who|can|could|would|will)\b/gi) || []
    ).length

    return Math.min(10, Math.max(1, words / 10 + sentences * 2 + questionWords * 1.5))
  }

  /**
   * Get training examples by various filters
   */
  getExamples(
    filters: {
      intent?: string
      questionType?: TrainingExample['questionType']
      source?: TrainingExample['source']
      minConfidence?: number
      maxComplexity?: number
    } = {}
  ): TrainingExample[] {
    return Array.from(this.examples.values()).filter(example => {
      if (filters.intent && example.intent !== filters.intent) return false
      if (filters.questionType && example.questionType !== filters.questionType) return false
      if (filters.source && example.source !== filters.source) return false
      if (filters.minConfidence && example.confidence < filters.minConfidence) return false
      if (filters.maxComplexity && (example.metadata.complexity || 0) > filters.maxComplexity)
        return false
      return true
    })
  }

  /**
   * Cleanup and validation
   */
  async validateDataset(): Promise<{valid: boolean; issues: string[]}> {
    const issues: string[] = []
    const examples = Array.from(this.examples.values())

    // Check for duplicates
    const textSet = new Set()
    const duplicates = examples.filter(example => {
      if (textSet.has(example.text)) {
        return true
      }
      textSet.add(example.text)
      return false
    })

    if (duplicates.length > 0) {
      issues.push(`Found ${duplicates.length} duplicate examples`)
    }

    // Check for missing required fields
    const missingFields = examples.filter(
      example => !example.id || !example.text || !example.intent || !example.questionType
    )

    if (missingFields.length > 0) {
      issues.push(`Found ${missingFields.length} examples with missing required fields`)
    }

    // Check intent distribution
    const metrics = this.getDatasetMetrics()
    if (metrics.coverage.intentCoverage < 0.8) {
      issues.push(`Low intent coverage: ${(metrics.coverage.intentCoverage * 100).toFixed(1)}%`)
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }

  /**
   * Clean up the dataset by removing low-quality examples
   */
  async cleanupDataset(qualityThreshold: number = 0.3): Promise<number> {
    const originalSize = this.examples.size
    const toRemove: string[] = []

    for (const [id, example] of this.examples.entries()) {
      if ((example.metadata.quality_score || 0.5) < qualityThreshold) {
        toRemove.push(id)
      }
    }

    for (const id of toRemove) {
      this.examples.delete(id)
    }

    await this.saveDataset()

    const removedCount = toRemove.length
    logger.info(
      sanitizeLogMessage('Dataset cleanup completed', {
        originalSize,
        removed: removedCount,
        remaining: this.examples.size,
        qualityThreshold
      })
    )

    this.emit('datasetCleaned', {removedCount, remainingCount: this.examples.size})
    return removedCount
  }
}
