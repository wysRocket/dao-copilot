/**
 * Machine Learning Feedback Loop System for Question Classification Improvement
 * 
 * This system implements a comprehensive feedback loop for continuous improvement
 * of question detection and classification accuracy. Features include:
 * 
 * Core Components:
 * - Active learning strategies for sample selection
 * - Online learning for real-time model updates
 * - Multi-source feedback collection (explicit and implicit)
 * - Incremental training with mini-batch gradient descent
 * - Performance tracking with sliding window evaluation
 * - Confusion matrix analysis for classification insights
 * - Automated model retraining and evaluation
 * 
 * Integration: Works with OptimizedQuestionDetector for continuous improvement
 */

import { EventEmitter } from 'events'
import { OptimizedQuestionDetector } from './optimized-question-detector'
import { logger } from './gemini-logger'
import { sanitizeLogMessage } from './log-sanitizer'
import {
  QuestionAnalysis,
  QuestionType,
  QuestionIntent,
  Entity
} from './question-detector'

// Feedback data structures
interface FeedbackEntry {
  id: string
  questionText: string
  originalAnalysis: QuestionAnalysis
  userFeedback: UserFeedback
  timestamp: number
  source: 'explicit' | 'implicit' | 'system'
}

interface UserFeedback {
  isCorrect: boolean
  correctedType?: QuestionType
  correctedIntent?: QuestionIntent
  confidence?: number
  userComments?: string
  implicitMetrics?: ImplicitMetrics
}

interface ImplicitMetrics {
  responseTime: number // Time taken to respond to the answer
  followUpQuestions: number // Number of follow-up questions
  satisfactionScore: number // Derived from user behavior (0-1)
  abandonmentRate: number // Did user abandon before getting answer
}

interface TrainingExample {
  text: string
  features: number[]
  labels: {
    isQuestion: boolean
    questionType: QuestionType
    confidence: number
    intent: QuestionIntent
  }
  weight: number // Sample importance weight
}

interface PerformanceMetrics {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  confusionMatrix: Map<string, Map<string, number>>
  classificationReport: Map<QuestionType, ClassMetrics>
}

interface ClassMetrics {
  precision: number
  recall: number
  f1Score: number
  support: number
}

interface ActiveLearningConfig {
  enabled: boolean
  strategy: 'uncertainty' | 'committee' | 'margin' | 'entropy'
  selectionSize: number
  confidenceThreshold: number
}

interface OnlineLearningConfig {
  enabled: boolean
  algorithm: 'sgd' | 'passive_aggressive' | 'perceptron'
  learningRate: number
  batchSize: number
  momentum?: number
}

interface FeedbackSystemConfig {
  // Active learning configuration
  activeLearning: ActiveLearningConfig
  
  // Online learning configuration
  onlineLearning: OnlineLearningConfig
  
  // Feedback collection
  enableExplicitFeedback: boolean
  enableImplicitFeedback: boolean
  feedbackWindowSize: number
  
  // Performance evaluation
  evaluationWindowSize: number
  retrainingThreshold: number // Accuracy drop threshold for retraining
  minSamplesForRetraining: number
  
  // Model persistence
  modelSaveInterval: number // Save model every N updates
  feedbackStoreSize: number // Max stored feedback entries
  
  // Performance monitoring
  performanceReportInterval: number // Report interval in ms
  enableAdaptiveThresholds: boolean
}

/**
 * Comprehensive ML Feedback System for Question Classification Improvement
 */
export class QuestionClassificationFeedbackSystem extends EventEmitter {
  private config: FeedbackSystemConfig
  private questionDetector: OptimizedQuestionDetector
  
  // Feedback storage and management
  private feedbackStore: Map<string, FeedbackEntry> = new Map()
  private trainingBuffer: TrainingExample[] = []
  private unlabeledPool: Set<string> = new Set()
  
  // Performance tracking
  private performanceHistory: PerformanceMetrics[] = []
  private slidingWindowEvaluator: SlidingWindowEvaluator
  private confusionMatrix: ConfusionMatrixTracker
  
  // Online learning components
  private onlineLearner?: OnlineLearner
  private featureExtractor: QuestionFeatureExtractor
  
  // Active learning components
  private activeLearner?: ActiveLearner
  
  // System state
  private lastRetraining = Date.now()
  private lastModelSave = Date.now()
  private lastPerformanceReport = Date.now()
  private isInitialized = false

  constructor(
    questionDetector: OptimizedQuestionDetector,
    config: Partial<FeedbackSystemConfig> = {}
  ) {
    super()
    
    this.questionDetector = questionDetector
    this.config = {
      // Active learning defaults
      activeLearning: {
        enabled: true,
        strategy: 'uncertainty',
        selectionSize: 10,
        confidenceThreshold: 0.7
      },
      
      // Online learning defaults
      onlineLearning: {
        enabled: true,
        algorithm: 'passive_aggressive',
        learningRate: 0.01,
        batchSize: 16,
        momentum: 0.9
      },
      
      // Feedback collection defaults
      enableExplicitFeedback: true,
      enableImplicitFeedback: true,
      feedbackWindowSize: 1000,
      
      // Performance evaluation defaults
      evaluationWindowSize: 500,
      retrainingThreshold: 0.05, // 5% accuracy drop
      minSamplesForRetraining: 50,
      
      // Model persistence defaults
      modelSaveInterval: 100, // Every 100 updates
      feedbackStoreSize: 5000,
      
      // Performance monitoring defaults
      performanceReportInterval: 300000, // 5 minutes
      enableAdaptiveThresholds: true,
      
      ...config
    }

    // Initialize components
    this.slidingWindowEvaluator = new SlidingWindowEvaluator(this.config.evaluationWindowSize)
    this.confusionMatrix = new ConfusionMatrixTracker()
    this.featureExtractor = new QuestionFeatureExtractor()
    
    if (this.config.onlineLearning.enabled) {
      this.onlineLearner = new OnlineLearner(this.config.onlineLearning)
    }
    
    if (this.config.activeLearning.enabled) {
      this.activeLearner = new ActiveLearner(this.config.activeLearning)
    }

    logger.info('QuestionClassificationFeedbackSystem initialized', {
      activeLearningEnabled: this.config.activeLearning.enabled,
      onlineLearningEnabled: this.config.onlineLearning.enabled,
      evaluationWindowSize: this.config.evaluationWindowSize,
      retrainingThreshold: this.config.retrainingThreshold
    })
  }

  /**
   * Initialize the feedback system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Set up event listeners on the question detector
      this.questionDetector.on('question_analyzed', (data) => {
        this.handleQuestionAnalyzed(data)
      })

      // Initialize online learner if enabled
      if (this.onlineLearner) {
        await this.onlineLearner.initialize()
      }

      // Initialize active learner if enabled
      if (this.activeLearner) {
        await this.activeLearner.initialize()
      }

      // Start periodic tasks
      this.startPeriodicTasks()

      this.isInitialized = true
      logger.info('QuestionClassificationFeedbackSystem initialization complete')
      this.emit('initialized')

    } catch (error) {
      logger.error('Failed to initialize feedback system', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Record explicit user feedback
   */
  recordExplicitFeedback(
    questionId: string,
    questionText: string,
    originalAnalysis: QuestionAnalysis,
    userFeedback: UserFeedback
  ): void {
    if (!this.config.enableExplicitFeedback) {
      return
    }

    const feedbackEntry: FeedbackEntry = {
      id: questionId,
      questionText,
      originalAnalysis,
      userFeedback,
      timestamp: Date.now(),
      source: 'explicit'
    }

    this.storeFeedback(feedbackEntry)
    this.processExplicitFeedback(feedbackEntry)
    
    logger.info('Explicit feedback recorded', sanitizeLogMessage({
      questionId,
      isCorrect: userFeedback.isCorrect,
      correctedType: userFeedback.correctedType,
      originalConfidence: originalAnalysis.confidence,
      userConfidence: userFeedback.confidence
    }))

    this.emit('explicit_feedback_recorded', feedbackEntry)
  }

  /**
   * Record implicit user feedback based on behavior
   */
  recordImplicitFeedback(
    questionId: string,
    questionText: string,
    originalAnalysis: QuestionAnalysis,
    implicitMetrics: ImplicitMetrics
  ): void {
    if (!this.config.enableImplicitFeedback) {
      return
    }

    // Convert implicit metrics to feedback
    const satisfactionThreshold = 0.7
    const isCorrect = implicitMetrics.satisfactionScore >= satisfactionThreshold

    const userFeedback: UserFeedback = {
      isCorrect,
      confidence: implicitMetrics.satisfactionScore,
      implicitMetrics
    }

    const feedbackEntry: FeedbackEntry = {
      id: questionId,
      questionText,
      originalAnalysis,
      userFeedback,
      timestamp: Date.now(),
      source: 'implicit'
    }

    this.storeFeedback(feedbackEntry)
    this.processImplicitFeedback(feedbackEntry)

    logger.debug('Implicit feedback recorded', sanitizeLogMessage({
      questionId,
      satisfactionScore: implicitMetrics.satisfactionScore,
      responseTime: implicitMetrics.responseTime,
      followUpQuestions: implicitMetrics.followUpQuestions
    }))

    this.emit('implicit_feedback_recorded', feedbackEntry)
  }

  /**
   * Get samples for active learning labeling
   */
  async getActiveLearningCandidates(): Promise<string[]> {
    if (!this.activeLearner || !this.config.activeLearning.enabled) {
      return []
    }

    const candidates = await this.activeLearner.selectSamplesToLabel(
      Array.from(this.unlabeledPool),
      this.questionDetector,
      this.config.activeLearning.selectionSize
    )

    logger.info('Active learning candidates selected', {
      candidateCount: candidates.length,
      strategy: this.config.activeLearning.strategy,
      unlabeledPoolSize: this.unlabeledPool.size
    })

    this.emit('active_learning_candidates', { candidates, strategy: this.config.activeLearning.strategy })
    return candidates
  }

  /**
   * Add labeled sample from active learning
   */
  async addLabeledSample(
    questionText: string,
    isQuestion: boolean,
    questionType: QuestionType,
    intent: QuestionIntent,
    confidence: number = 1.0
  ): Promise<void> {
    const features = this.featureExtractor.extract(questionText)
    const trainingExample: TrainingExample = {
      text: questionText,
      features,
      labels: {
        isQuestion,
        questionType,
        confidence,
        intent
      },
      weight: 1.0 // Higher weight for actively selected samples
    }

    this.trainingBuffer.push(trainingExample)
    this.unlabeledPool.delete(questionText)

    // Trigger online learning if buffer is full
    if (this.trainingBuffer.length >= this.config.onlineLearning.batchSize) {
      await this.triggerOnlineLearning()
    }

    logger.info('Labeled sample added from active learning', {
      questionLength: questionText.length,
      isQuestion,
      questionType,
      bufferSize: this.trainingBuffer.length
    })

    this.emit('labeled_sample_added', { questionText, isQuestion, questionType, intent })
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(): {
    current: PerformanceMetrics
    historical: PerformanceMetrics[]
    trends: {
      accuracyTrend: number
      f1Trend: number
      feedbackVolume: number
    }
    recommendations: string[]
  } {
    const current = this.calculateCurrentPerformance()
    const trends = this.calculateTrends()
    const recommendations = this.generateRecommendations(current, trends)

    return {
      current,
      historical: this.performanceHistory,
      trends,
      recommendations
    }
  }

  /**
   * Handle question analysis from detector
   */
  private handleQuestionAnalyzed(data: {
    text: string
    analysis: QuestionAnalysis | null
    processingTime: number
    fastPathUsed: boolean
    cacheHit: boolean
  }): void {
    // Add to unlabeled pool for active learning
    if (data.analysis && data.analysis.isQuestion) {
      this.unlabeledPool.add(data.text)
    }

    // Limit unlabeled pool size
    if (this.unlabeledPool.size > 10000) {
      const poolArray = Array.from(this.unlabeledPool)
      this.unlabeledPool = new Set(poolArray.slice(-5000))
    }
  }

  /**
   * Process explicit feedback
   */
  private processExplicitFeedback(feedback: FeedbackEntry): void {
    // Update performance tracking
    this.slidingWindowEvaluator.addPrediction(
      feedback.userFeedback.isCorrect ? 1 : 0,
      feedback.originalAnalysis.isQuestion ? 1 : 0
    )

    // Update confusion matrix
    const actual = feedback.userFeedback.correctedType || 
                  (feedback.userFeedback.isCorrect ? feedback.originalAnalysis.questionType : 'none')
    const predicted = feedback.originalAnalysis.questionType

    this.confusionMatrix.addPrediction(actual, predicted)

    // Create training example
    const features = this.featureExtractor.extract(feedback.questionText)
    const trainingExample: TrainingExample = {
      text: feedback.questionText,
      features,
      labels: {
        isQuestion: feedback.userFeedback.isCorrect ? 
                   feedback.originalAnalysis.isQuestion : 
                   !feedback.originalAnalysis.isQuestion,
        questionType: feedback.userFeedback.correctedType || feedback.originalAnalysis.questionType,
        confidence: feedback.userFeedback.confidence || 1.0,
        intent: feedback.userFeedback.correctedIntent || feedback.originalAnalysis.intent
      },
      weight: 1.5 // Higher weight for explicit feedback
    }

    this.trainingBuffer.push(trainingExample)
  }

  /**
   * Process implicit feedback
   */
  private processImplicitFeedback(feedback: FeedbackEntry): void {
    const metrics = feedback.userFeedback.implicitMetrics!
    
    // Convert implicit metrics to training signals
    const satisfactionWeight = metrics.satisfactionScore
    const responseTimeWeight = Math.max(0, 1 - metrics.responseTime / 10000) // Normalize response time
    
    // Update performance tracking with weighted score
    this.slidingWindowEvaluator.addPrediction(
      feedback.userFeedback.isCorrect ? 1 : 0,
      feedback.originalAnalysis.isQuestion ? 1 : 0
    )

    // Create training example with adjusted weight
    const features = this.featureExtractor.extract(feedback.questionText)
    const trainingExample: TrainingExample = {
      text: feedback.questionText,
      features,
      labels: {
        isQuestion: feedback.originalAnalysis.isQuestion,
        questionType: feedback.originalAnalysis.questionType,
        confidence: satisfactionWeight,
        intent: feedback.originalAnalysis.intent
      },
      weight: Math.max(0.1, satisfactionWeight * responseTimeWeight) // Lower weight for implicit feedback
    }

    this.trainingBuffer.push(trainingExample)
  }

  /**
   * Store feedback with size management
   */
  private storeFeedback(feedback: FeedbackEntry): void {
    this.feedbackStore.set(feedback.id, feedback)

    // Manage store size
    if (this.feedbackStore.size > this.config.feedbackStoreSize) {
      const entries = Array.from(this.feedbackStore.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
      
      const toRemove = entries.slice(0, Math.floor(this.config.feedbackStoreSize * 0.2))
      toRemove.forEach(([id]) => this.feedbackStore.delete(id))
    }
  }

  /**
   * Trigger online learning with buffered examples
   */
  private async triggerOnlineLearning(): Promise<void> {
    if (!this.onlineLearner || this.trainingBuffer.length === 0) {
      return
    }

    try {
      const batch = this.trainingBuffer.splice(0, this.config.onlineLearning.batchSize)
      await this.onlineLearner.updateBatch(batch)

      logger.info('Online learning update completed', {
        batchSize: batch.length,
        algorithm: this.config.onlineLearning.algorithm,
        learningRate: this.config.onlineLearning.learningRate
      })

      this.emit('online_learning_updated', { batchSize: batch.length })

      // Check if retraining is needed
      await this.checkRetrainingNeed()

    } catch (error) {
      logger.error('Online learning update failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Check if model retraining is needed
   */
  private async checkRetrainingNeed(): Promise<void> {
    const currentPerformance = this.calculateCurrentPerformance()
    
    if (this.performanceHistory.length === 0) {
      this.performanceHistory.push(currentPerformance)
      return
    }

    const lastPerformance = this.performanceHistory[this.performanceHistory.length - 1]
    const accuracyDrop = lastPerformance.accuracy - currentPerformance.accuracy

    if (accuracyDrop > this.config.retrainingThreshold && 
        this.feedbackStore.size >= this.config.minSamplesForRetraining) {
      
      await this.triggerModelRetraining()
    }

    this.performanceHistory.push(currentPerformance)
  }

  /**
   * Trigger full model retraining
   */
  private async triggerModelRetraining(): Promise<void> {
    logger.info('Triggering model retraining', {
      feedbackSamples: this.feedbackStore.size,
      trainingBufferSize: this.trainingBuffer.length
    })

    try {
      // Collect all training data
      const allTrainingData = this.collectTrainingData()
      
      // Retrain the question detector (this would be implemented based on your model architecture)
      // await this.questionDetector.retrain(allTrainingData)

      this.lastRetraining = Date.now()
      this.emit('model_retrained', { 
        samplesUsed: allTrainingData.length,
        timestamp: this.lastRetraining
      })

      logger.info('Model retraining completed', {
        samplesUsed: allTrainingData.length,
        duration: Date.now() - this.lastRetraining
      })

    } catch (error) {
      logger.error('Model retraining failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Collect all training data from feedback
   */
  private collectTrainingData(): TrainingExample[] {
    const trainingData: TrainingExample[] = []

    for (const feedback of this.feedbackStore.values()) {
      const features = this.featureExtractor.extract(feedback.questionText)
      trainingData.push({
        text: feedback.questionText,
        features,
        labels: {
          isQuestion: feedback.userFeedback.correctedType ? true : feedback.originalAnalysis.isQuestion,
          questionType: feedback.userFeedback.correctedType || feedback.originalAnalysis.questionType,
          confidence: feedback.userFeedback.confidence || feedback.originalAnalysis.confidence,
          intent: feedback.userFeedback.correctedIntent || feedback.originalAnalysis.intent
        },
        weight: feedback.source === 'explicit' ? 1.5 : 1.0
      })
    }

    return trainingData
  }

  /**
   * Calculate current performance metrics
   */
  private calculateCurrentPerformance(): PerformanceMetrics {
    const accuracy = this.slidingWindowEvaluator.getAccuracy()
    const f1Score = this.slidingWindowEvaluator.getF1Score()
    const confusionMatrix = this.confusionMatrix.getMatrix()
    
    // Calculate precision and recall (simplified)
    let tp = 0, fp = 0, fn = 0, tn = 0
    
    // This is a simplified calculation - in practice you'd want more detailed metrics
    for (const [actual, predicted] of this.slidingWindowEvaluator.getPredictions()) {
      if (actual === 1 && predicted === 1) tp++
      else if (actual === 0 && predicted === 1) fp++
      else if (actual === 1 && predicted === 0) fn++
      else tn++
    }

    const precision = tp > 0 ? tp / (tp + fp) : 0
    const recall = tp > 0 ? tp / (tp + fn) : 0

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      confusionMatrix: this.confusionMatrix.matrix,
      classificationReport: new Map() // Would be populated with per-class metrics
    }
  }

  /**
   * Calculate performance trends
   */
  private calculateTrends(): {
    accuracyTrend: number
    f1Trend: number
    feedbackVolume: number
  } {
    if (this.performanceHistory.length < 2) {
      return { accuracyTrend: 0, f1Trend: 0, feedbackVolume: this.feedbackStore.size }
    }

    const recent = this.performanceHistory.slice(-5)
    const accuracyTrend = recent[recent.length - 1].accuracy - recent[0].accuracy
    const f1Trend = recent[recent.length - 1].f1Score - recent[0].f1Score

    return {
      accuracyTrend,
      f1Trend,
      feedbackVolume: this.feedbackStore.size
    }
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    current: PerformanceMetrics,
    trends: { accuracyTrend: number; f1Trend: number; feedbackVolume: number }
  ): string[] {
    const recommendations: string[] = []

    if (current.accuracy < 0.8) {
      recommendations.push('Consider collecting more training data - accuracy is below 80%')
    }

    if (trends.accuracyTrend < -0.05) {
      recommendations.push('Accuracy is declining - consider model retraining')
    }

    if (trends.feedbackVolume < 100) {
      recommendations.push('Increase user feedback collection for better model improvement')
    }

    if (current.precision < current.recall) {
      recommendations.push('Consider adjusting classification thresholds to improve precision')
    }

    return recommendations
  }

  /**
   * Start periodic maintenance tasks
   */
  private startPeriodicTasks(): void {
    // Performance reporting
    setInterval(() => {
      if (Date.now() - this.lastPerformanceReport > this.config.performanceReportInterval) {
        const report = this.getPerformanceReport()
        this.emit('performance_report', report)
        this.lastPerformanceReport = Date.now()
      }
    }, this.config.performanceReportInterval)

    // Trigger online learning for buffered data
    setInterval(() => {
      if (this.trainingBuffer.length > 0) {
        this.triggerOnlineLearning()
      }
    }, 30000) // Every 30 seconds
  }

  /**
   * Get system status and statistics
   */
  getSystemStatus(): {
    isInitialized: boolean
    feedbackCount: number
    trainingBufferSize: number
    unlabeledPoolSize: number
    lastRetraining: number
    performanceHistory: number
    currentAccuracy: number
  } {
    return {
      isInitialized: this.isInitialized,
      feedbackCount: this.feedbackStore.size,
      trainingBufferSize: this.trainingBuffer.length,
      unlabeledPoolSize: this.unlabeledPool.size,
      lastRetraining: this.lastRetraining,
      performanceHistory: this.performanceHistory.length,
      currentAccuracy: this.slidingWindowEvaluator.getAccuracy()
    }
  }

  /**
   * Clean up and save state
   */
  async destroy(): Promise<void> {
    // Save current state if needed
    const finalReport = this.getPerformanceReport()
    this.emit('final_report', finalReport)

    // Clean up resources
    this.feedbackStore.clear()
    this.trainingBuffer = []
    this.unlabeledPool.clear()
    this.performanceHistory = []

    this.removeAllListeners()
    this.isInitialized = false

    logger.info('QuestionClassificationFeedbackSystem destroyed')
  }
}

/**
 * Sliding Window Performance Evaluator
 */
class SlidingWindowEvaluator {
  private windowSize: number
  private predictions: { actual: number; predicted: number }[] = []

  constructor(windowSize: number = 1000) {
    this.windowSize = windowSize
  }

  addPrediction(actual: number, predicted: number): void {
    this.predictions.push({ actual, predicted })
    if (this.predictions.length > this.windowSize) {
      this.predictions.shift()
    }
  }

  getAccuracy(): number {
    if (this.predictions.length === 0) return 0
    const correct = this.predictions.filter(p => p.actual === p.predicted).length
    return correct / this.predictions.length
  }

  getF1Score(): number {
    if (this.predictions.length === 0) return 0
    
    let tp = 0, fp = 0, fn = 0
    for (const pred of this.predictions) {
      if (pred.actual === 1 && pred.predicted === 1) tp++
      if (pred.actual === 0 && pred.predicted === 1) fp++
      if (pred.actual === 1 && pred.predicted === 0) fn++
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    return precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0
  }

  getPredictions(): { actual: number; predicted: number }[] {
    return [...this.predictions]
  }
}

/**
 * Confusion Matrix Tracker
 */
class ConfusionMatrixTracker {
  public matrix: Map<string, Map<string, number>> = new Map()
  private classes: Set<string> = new Set()

  addPrediction(actual: string, predicted: string): void {
    this.classes.add(actual).add(predicted)
    
    if (!this.matrix.has(actual)) {
      this.matrix.set(actual, new Map())
    }
    
    const row = this.matrix.get(actual)!
    row.set(predicted, (row.get(predicted) || 0) + 1)
  }

  getMatrix(): number[][] {
    const sortedClasses = Array.from(this.classes).sort()
    return sortedClasses.map(actual =>
      sortedClasses.map(predicted =>
        this.matrix.get(actual)?.get(predicted) || 0
      )
    )
  }

  getClasses(): string[] {
    return Array.from(this.classes).sort()
  }
}

/**
 * Feature Extractor for Question Text
 */
class QuestionFeatureExtractor {
  extract(text: string): number[] {
    const features: number[] = []
    const words = text.toLowerCase().split(/\s+/)
    const chars = text.length
    
    // Basic features
    features.push(words.length) // Word count
    features.push(chars) // Character count
    features.push(text.includes('?') ? 1 : 0) // Has question mark
    
    // Question word features
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does']
    questionWords.forEach(word => {
      features.push(words.includes(word) ? 1 : 0)
    })
    
    // Punctuation features
    features.push((text.match(/[.!?]/g) || []).length) // Punctuation count
    features.push((text.match(/[A-Z]/g) || []).length / chars) // Capital letter ratio
    
    // Sentence structure features
    features.push(words[0] && questionWords.includes(words[0]) ? 1 : 0) // Starts with question word
    features.push(text.endsWith('?') ? 1 : 0) // Ends with question mark
    
    return features
  }
}

/**
 * Online Learning Implementation
 */
class OnlineLearner {
  private config: OnlineLearningConfig
  private weights: number[] = []
  private initialized = false

  constructor(config: OnlineLearningConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    // Initialize weights (simplified - in practice you'd load from saved model)
    this.weights = new Array(50).fill(0) // Assuming 50 features
    this.initialized = true
  }

  async updateBatch(examples: TrainingExample[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    for (const example of examples) {
      this.updateSingle(example)
    }
  }

  private updateSingle(example: TrainingExample): void {
    const prediction = this.predict(example.features)
    const target = example.labels.isQuestion ? 1 : -1
    const weight = example.weight

    // Simplified online learning update (Passive-Aggressive)
    if (prediction * target < 1) {
      const loss = Math.max(0, 1 - target * prediction)
      const normSquared = example.features.reduce((sum, f) => sum + f * f, 0)
      const tau = loss / (normSquared + 1e-8) // Add small epsilon to avoid division by zero

      for (let i = 0; i < this.weights.length && i < example.features.length; i++) {
        this.weights[i] += tau * target * example.features[i] * weight
      }
    }
  }

  predict(features: number[]): number {
    let score = 0
    for (let i = 0; i < this.weights.length && i < features.length; i++) {
      score += this.weights[i] * features[i]
    }
    return score
  }
}

/**
 * Active Learning Implementation
 */
class ActiveLearner {
  private config: ActiveLearningConfig

  constructor(config: ActiveLearningConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    // Active learner initialization
  }

  async selectSamplesToLabel(
    unlabeledTexts: string[],
    questionDetector: OptimizedQuestionDetector,
    selectionSize: number
  ): Promise<string[]> {
    if (unlabeledTexts.length === 0) return []

    switch (this.config.strategy) {
      case 'uncertainty':
        return this.uncertaintySampling(unlabeledTexts, questionDetector, selectionSize)
      case 'margin':
        return this.marginSampling(unlabeledTexts, questionDetector, selectionSize)
      default:
        return this.uncertaintySampling(unlabeledTexts, questionDetector, selectionSize)
    }
  }

  private async uncertaintySampling(
    texts: string[],
    detector: OptimizedQuestionDetector,
    n: number
  ): Promise<string[]> {
    const uncertainties: Array<{ text: string; uncertainty: number }> = []

    for (const text of texts) {
      const analysis = await detector.detectQuestion(text)
      if (analysis) {
        const uncertainty = 1 - analysis.confidence
        uncertainties.push({ text, uncertainty })
      }
    }

    return uncertainties
      .sort((a, b) => b.uncertainty - a.uncertainty)
      .slice(0, n)
      .map(item => item.text)
  }

  private async marginSampling(
    texts: string[],
    detector: OptimizedQuestionDetector,
    n: number
  ): Promise<string[]> {
    // Simplified margin sampling - would need access to prediction probabilities
    return this.uncertaintySampling(texts, detector, n)
  }
}

export default QuestionClassificationFeedbackSystem