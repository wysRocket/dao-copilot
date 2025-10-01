/**
 * Intelligent Question Processing System with ML Feedback Integration
 * 
 * This system integrates the OptimizedQuestionDetector, OptimizedTranscriptionQuestionPipeline,
 * and QuestionClassificationFeedbackSystem to create a comprehensive AI-powered question
 * processing solution with continuous learning capabilities.
 * 
 * Features:
 * - High-performance question detection with real-time processing
 * - Continuous learning through feedback loops
 * - Active learning for sample selection
 * - Performance monitoring and adaptive improvement
 * - Multi-modal feedback collection (explicit and implicit)
 * - Automated model retraining and evaluation
 */

import { EventEmitter } from 'events'
import { OptimizedQuestionDetector } from './optimized-question-detector'
import { OptimizedTranscriptionQuestionPipeline } from './optimized-transcription-question-pipeline'
import { QuestionClassificationFeedbackSystem } from './question-classification-feedback-system'
import { logger } from './gemini-logger'
import { sanitizeLogMessage } from './log-sanitizer'
import {
  QuestionAnalysis,
  QuestionType,
  QuestionIntent,
  QuestionDetectionConfig
} from './question-detector'

interface ProcessedQuestion {
  id: string
  text: string
  analysis: QuestionAnalysis
  processingTime: number
  timestamp: number
  source: 'transcription' | 'direct' | 'batch'
  metadata?: {
    transcriptionConfidence?: number
    isFinal?: boolean
    fastPath?: boolean
    cacheHit?: boolean
  }
}

interface UserInteractionMetrics {
  questionId: string
  responseTime: number // Time between question and user response
  followUpQuestions: number // Number of follow-up questions
  userEngagement: number // Engagement score (0-1)
  satisfactionIndicators: {
    explicitRating?: number // 1-5 star rating
    implicitSatisfaction: number // Derived from behavior (0-1)
    completedInteraction: boolean // Did user get their answer
  }
}

interface SystemPerformanceMetrics {
  questionDetection: {
    averageProcessingTime: number
    accuracy: number
    throughputPerSecond: number
    cacheHitRate: number
  }
  feedbackSystem: {
    feedbackVolume: number
    accuracyImprovement: number
    activeLearningEffectiveness: number
    modelRetrainings: number
  }
  pipeline: {
    endToEndLatency: number
    transcriptionProcessingRate: number
    bufferEfficiency: number
  }
}

interface IntelligentProcessingConfig {
  // Question detection configuration
  questionDetection: Partial<QuestionDetectionConfig>
  
  // Pipeline configuration
  pipeline: {
    bufferTimeoutMs: number
    maxBufferSize: number
    enableConcurrentProcessing: boolean
  }
  
  // Feedback system configuration
  feedbackSystem: {
    enableExplicitFeedback: boolean
    enableImplicitFeedback: boolean
    enableActiveLearning: boolean
    retrainingThreshold: number
  }
  
  // Performance monitoring
  monitoring: {
    enableRealTimeMetrics: boolean
    reportingInterval: number
    alertThresholds: {
      accuracyDrop: number
      latencyIncrease: number
    }
  }
  
  // Integration settings
  integration: {
    enableAutoImprovement: boolean
    feedbackCollectionRate: number
    performanceOptimizationEnabled: boolean
  }
}

/**
 * Comprehensive AI Question Processing System with Continuous Learning
 */
export class IntelligentQuestionProcessingSystem extends EventEmitter {
  private config: IntelligentProcessingConfig
  
  // Core components
  private questionDetector: OptimizedQuestionDetector
  private transcriptionPipeline: OptimizedTranscriptionQuestionPipeline
  private feedbackSystem: QuestionClassificationFeedbackSystem
  
  // System state
  private isInitialized = false
  private questionCounter = 0
  private startTime = Date.now()
  
  // Performance tracking
  private processedQuestions: Map<string, ProcessedQuestion> = new Map()
  private userInteractions: Map<string, UserInteractionMetrics> = new Map()
  private performanceHistory: SystemPerformanceMetrics[] = []
  
  // Active learning management
  private pendingLabeling: Set<string> = new Set()
  private labelingQueue: string[] = []

  constructor(config: Partial<IntelligentProcessingConfig> = {}) {
    super()

    this.config = {
      // Question detection defaults
      questionDetection: {
        confidenceThreshold: 0.7,
        maxAnalysisDelay: 25,
        enableCaching: true,
        cacheSize: 2000,
        enableFastPath: true,
        fastPathThreshold: 0.85,
        enableConcurrentProcessing: true,
        performanceTargetMs: 25
      },
      
      // Pipeline defaults
      pipeline: {
        bufferTimeoutMs: 500,
        maxBufferSize: 50,
        enableConcurrentProcessing: true
      },
      
      // Feedback system defaults
      feedbackSystem: {
        enableExplicitFeedback: true,
        enableImplicitFeedback: true,
        enableActiveLearning: true,
        retrainingThreshold: 0.05
      },
      
      // Monitoring defaults
      monitoring: {
        enableRealTimeMetrics: true,
        reportingInterval: 300000, // 5 minutes
        alertThresholds: {
          accuracyDrop: 0.1,
          latencyIncrease: 0.5
        }
      },
      
      // Integration defaults
      integration: {
        enableAutoImprovement: true,
        feedbackCollectionRate: 0.1, // Collect feedback for 10% of questions
        performanceOptimizationEnabled: true
      },
      
      ...config
    }

    // Initialize core components
    this.questionDetector = new OptimizedQuestionDetector(this.config.questionDetection)
    
    this.transcriptionPipeline = new OptimizedTranscriptionQuestionPipeline({
      bufferTimeoutMs: this.config.pipeline.bufferTimeoutMs,
      maxBufferSize: this.config.pipeline.maxBufferSize,
      enableConcurrentProcessing: this.config.pipeline.enableConcurrentProcessing,
      questionDetectionConfig: this.config.questionDetection
    })

    this.feedbackSystem = new QuestionClassificationFeedbackSystem(this.questionDetector, {
      enableExplicitFeedback: this.config.feedbackSystem.enableExplicitFeedback,
      enableImplicitFeedback: this.config.feedbackSystem.enableImplicitFeedback,
      activeLearning: {
        enabled: this.config.feedbackSystem.enableActiveLearning,
        strategy: 'uncertainty',
        selectionSize: 10,
        confidenceThreshold: 0.7
      },
      retrainingThreshold: this.config.feedbackSystem.retrainingThreshold
    })

    logger.info('IntelligentQuestionProcessingSystem initialized', {
      questionDetectionEnabled: true,
      transcriptionPipelineEnabled: true,
      feedbackSystemEnabled: true,
      activeLearningEnabled: this.config.feedbackSystem.enableActiveLearning
    })
  }

  /**
   * Initialize the complete system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      const initStart = performance.now()

      // Initialize all components
      logger.info('Initializing question detection system...')
      await this.questionDetector.initialize()

      logger.info('Initializing transcription pipeline...')
      await this.transcriptionPipeline.initialize()

      logger.info('Initializing feedback system...')
      await this.feedbackSystem.initialize()

      // Set up event handlers
      this.setupEventHandlers()

      // Start monitoring and maintenance tasks
      this.startSystemMonitoring()

      this.isInitialized = true
      const initTime = performance.now() - initStart

      logger.info('IntelligentQuestionProcessingSystem initialization complete', {
        initializationTime: `${initTime.toFixed(2)}ms`,
        componentsInitialized: 3,
        activeLearningEnabled: this.config.feedbackSystem.enableActiveLearning
      })

      this.emit('system_initialized', {
        initTime,
        components: ['question_detector', 'transcription_pipeline', 'feedback_system']
      })

    } catch (error) {
      logger.error('Failed to initialize IntelligentQuestionProcessingSystem', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Process a direct question (not from transcription)
   */
  async processQuestion(text: string, source: 'direct' | 'batch' = 'direct'): Promise<ProcessedQuestion | null> {
    if (!this.isInitialized) {
      throw new Error('System must be initialized before processing questions')
    }

    const questionId = this.generateQuestionId()
    const startTime = performance.now()

    try {
      // Detect and analyze the question
      const analysis = await this.questionDetector.detectQuestion(text)
      
      if (!analysis?.isQuestion) {
        return null
      }

      const processingTime = performance.now() - startTime
      const processedQuestion: ProcessedQuestion = {
        id: questionId,
        text,
        analysis,
        processingTime,
        timestamp: Date.now(),
        source,
        metadata: {
          fastPath: processingTime < 15, // Assuming fast path if very quick
          cacheHit: processingTime < 5    // Assuming cache hit if extremely quick
        }
      }

      // Store the processed question
      this.processedQuestions.set(questionId, processedQuestion)

      // Consider for active learning (based on sampling rate)
      if (this.shouldCollectFeedback()) {
        this.considerForActiveLearning(text, analysis)
      }

      // Emit event
      this.emit('question_processed', processedQuestion)

      logger.info('Question processed successfully', sanitizeLogMessage({
        questionId,
        questionType: analysis.questionType,
        confidence: analysis.confidence.toFixed(2),
        processingTime: `${processingTime.toFixed(2)}ms`,
        source
      }))

      return processedQuestion

    } catch (error) {
      logger.error('Error processing question', {
        questionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        source
      })
      return null
    }
  }

  /**
   * Process transcription input
   */
  async processTranscription(
    text: string,
    confidence: number = 1.0,
    isFinal: boolean = true,
    transcriptId?: string
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('System must be initialized before processing transcriptions')
    }

    try {
      await this.transcriptionPipeline.processTranscription(text, confidence, isFinal, transcriptId)
      
      logger.debug('Transcription processed', {
        textLength: text.length,
        confidence,
        isFinal,
        transcriptId
      })

    } catch (error) {
      logger.error('Error processing transcription', {
        error: error instanceof Error ? error.message : 'Unknown error',
        textLength: text.length
      })
    }
  }

  /**
   * Record explicit user feedback
   */
  recordUserFeedback(
    questionId: string,
    isCorrect: boolean,
    correctedType?: QuestionType,
    correctedIntent?: QuestionIntent,
    userRating?: number,
    comments?: string
  ): void {
    const processedQuestion = this.processedQuestions.get(questionId)
    if (!processedQuestion) {
      logger.warn('Feedback received for unknown question', { questionId })
      return
    }

    this.feedbackSystem.recordExplicitFeedback(
      questionId,
      processedQuestion.text,
      processedQuestion.analysis,
      {
        isCorrect,
        correctedType,
        correctedIntent,
        confidence: userRating ? userRating / 5 : undefined,
        userComments: comments
      }
    )

    logger.info('User feedback recorded', {
      questionId,
      isCorrect,
      correctedType,
      userRating
    })

    this.emit('user_feedback_recorded', {
      questionId,
      isCorrect,
      correctedType,
      userRating
    })
  }

  /**
   * Record user interaction metrics for implicit feedback
   */
  recordUserInteraction(questionId: string, metrics: UserInteractionMetrics): void {
    const processedQuestion = this.processedQuestions.get(questionId)
    if (!processedQuestion) {
      logger.warn('Interaction metrics received for unknown question', { questionId })
      return
    }

    this.userInteractions.set(questionId, metrics)

    // Calculate implicit feedback
    const implicitMetrics = {
      responseTime: metrics.responseTime,
      followUpQuestions: metrics.followUpQuestions,
      satisfactionScore: metrics.satisfactionIndicators.implicitSatisfaction,
      abandonmentRate: metrics.satisfactionIndicators.completedInteraction ? 0 : 1
    }

    this.feedbackSystem.recordImplicitFeedback(
      questionId,
      processedQuestion.text,
      processedQuestion.analysis,
      implicitMetrics
    )

    logger.debug('User interaction recorded', {
      questionId,
      responseTime: metrics.responseTime,
      followUpQuestions: metrics.followUpQuestions,
      satisfaction: metrics.satisfactionIndicators.implicitSatisfaction
    })

    this.emit('user_interaction_recorded', { questionId, metrics })
  }

  /**
   * Get questions needing manual labeling (active learning)
   */
  async getQuestionsForLabeling(count: number = 10): Promise<string[]> {
    if (!this.config.feedbackSystem.enableActiveLearning) {
      return []
    }

    try {
      const candidates = await this.feedbackSystem.getActiveLearningCandidates()
      const selected = candidates.slice(0, count)
      
      selected.forEach(question => this.pendingLabeling.add(question))
      this.labelingQueue.push(...selected)

      logger.info('Active learning candidates selected', {
        candidatesAvailable: candidates.length,
        selected: selected.length,
        pendingLabeling: this.pendingLabeling.size
      })

      this.emit('labeling_candidates_selected', { candidates: selected, totalPending: this.pendingLabeling.size })
      return selected

    } catch (error) {
      logger.error('Error getting active learning candidates', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return []
    }
  }

  /**
   * Submit labeled sample from active learning
   */
  async submitLabeledSample(
    questionText: string,
    isQuestion: boolean,
    questionType: QuestionType,
    intent: QuestionIntent,
    confidence: number = 1.0
  ): Promise<void> {
    try {
      await this.feedbackSystem.addLabeledSample(questionText, isQuestion, questionType, intent, confidence)
      
      this.pendingLabeling.delete(questionText)
      this.labelingQueue = this.labelingQueue.filter(q => q !== questionText)

      logger.info('Labeled sample submitted', {
        questionLength: questionText.length,
        isQuestion,
        questionType,
        confidence,
        pendingLabeling: this.pendingLabeling.size
      })

      this.emit('labeled_sample_submitted', {
        questionText,
        isQuestion,
        questionType,
        intent,
        pendingLabeling: this.pendingLabeling.size
      })

    } catch (error) {
      logger.error('Error submitting labeled sample', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Get comprehensive system performance report
   */
  getPerformanceReport(): {
    system: SystemPerformanceMetrics
    questionDetection: any
    transcriptionPipeline: any
    feedbackSystem: any
    recommendations: string[]
  } {
    const detectorMetrics = this.questionDetector.getPerformanceSummary()
    const pipelineMetrics = this.transcriptionPipeline.getPerformanceSummary()
    const feedbackReport = this.feedbackSystem.getPerformanceReport()

    const systemMetrics: SystemPerformanceMetrics = {
      questionDetection: {
        averageProcessingTime: detectorMetrics.averageProcessingTime,
        accuracy: feedbackReport.current.accuracy,
        throughputPerSecond: detectorMetrics.throughputPerSecond,
        cacheHitRate: detectorMetrics.cacheHitRate
      },
      feedbackSystem: {
        feedbackVolume: feedbackReport.trends.feedbackVolume,
        accuracyImprovement: feedbackReport.trends.accuracyTrend,
        activeLearningEffectiveness: this.calculateActiveLearningEffectiveness(),
        modelRetrainings: this.countModelRetrainings()
      },
      pipeline: {
        endToEndLatency: this.calculateEndToEndLatency(),
        transcriptionProcessingRate: pipelineMetrics.throughputPerSecond,
        bufferEfficiency: pipelineMetrics.bufferEfficiency
      }
    }

    const recommendations = this.generateSystemRecommendations(systemMetrics, feedbackReport)

    return {
      system: systemMetrics,
      questionDetection: detectorMetrics,
      transcriptionPipeline: pipelineMetrics,
      feedbackSystem: feedbackReport,
      recommendations
    }
  }

  /**
   * Get system status
   */
  getSystemStatus(): {
    isInitialized: boolean
    uptime: number
    questionsProcessed: number
    feedbackCollected: number
    activeLearningQueue: number
    performanceScore: number
  } {
    const uptime = Date.now() - this.startTime
    const detectorMetrics = this.questionDetector.getPerformanceSummary()
    const feedbackStatus = this.feedbackSystem.getSystemStatus()

    // Calculate overall performance score (0-1)
    const performanceScore = Math.min(1, (
      (detectorMetrics.cacheHitRate * 0.3) +
      (Math.min(1, 50 / detectorMetrics.averageProcessingTime) * 0.4) + // Normalize processing time
      (feedbackStatus.currentAccuracy * 0.3)
    ))

    return {
      isInitialized: this.isInitialized,
      uptime,
      questionsProcessed: this.processedQuestions.size,
      feedbackCollected: feedbackStatus.feedbackCount,
      activeLearningQueue: this.pendingLabeling.size,
      performanceScore
    }
  }

  /**
   * Set up event handlers between components
   */
  private setupEventHandlers(): void {
    // Handle questions detected by transcription pipeline
    this.transcriptionPipeline.on('question_detected', (data) => {
      const processedQuestion: ProcessedQuestion = {
        id: this.generateQuestionId(),
        text: data.transcript.text,
        analysis: data.analysis,
        processingTime: data.processingTime,
        timestamp: Date.now(),
        source: 'transcription',
        metadata: {
          transcriptionConfidence: data.transcript.confidence,
          isFinal: true
        }
      }

      this.processedQuestions.set(processedQuestion.id, processedQuestion)
      
      // Consider for active learning
      if (this.shouldCollectFeedback()) {
        this.considerForActiveLearning(processedQuestion.text, processedQuestion.analysis)
      }

      this.emit('question_processed', processedQuestion)
    })

    // Handle feedback system events
    this.feedbackSystem.on('model_retrained', (data) => {
      logger.info('Model retrained by feedback system', data)
      this.emit('model_retrained', data)
    })

    this.feedbackSystem.on('performance_report', (report) => {
      this.emit('feedback_performance_report', report)
    })

    // Handle detector performance events
    this.questionDetector.on('config_updated', (config) => {
      logger.info('Question detector configuration updated', config)
      this.emit('detector_config_updated', config)
    })
  }

  /**
   * Start system monitoring and maintenance tasks
   */
  private startSystemMonitoring(): void {
    if (!this.config.monitoring.enableRealTimeMetrics) {
      return
    }

    // Performance monitoring
    setInterval(() => {
      const report = this.getPerformanceReport()
      
      // Check for performance alerts
      this.checkPerformanceAlerts(report.system)
      
      // Store performance history
      this.performanceHistory.push(report.system)
      
      // Limit history size
      if (this.performanceHistory.length > 100) {
        this.performanceHistory.shift()
      }
      
      this.emit('performance_monitoring_report', report)
      
    }, this.config.monitoring.reportingInterval)

    // Cleanup old processed questions
    setInterval(() => {
      this.cleanupOldData()
    }, 600000) // Every 10 minutes
  }

  /**
   * Check for performance alerts
   */
  private checkPerformanceAlerts(metrics: SystemPerformanceMetrics): void {
    const alerts: string[] = []

    if (this.performanceHistory.length > 1) {
      const previous = this.performanceHistory[this.performanceHistory.length - 1]
      
      // Check accuracy drop
      const accuracyDrop = previous.questionDetection.accuracy - metrics.questionDetection.accuracy
      if (accuracyDrop > this.config.monitoring.alertThresholds.accuracyDrop) {
        alerts.push(`Accuracy dropped by ${(accuracyDrop * 100).toFixed(1)}%`)
      }
      
      // Check latency increase
      const latencyIncrease = (metrics.questionDetection.averageProcessingTime - previous.questionDetection.averageProcessingTime) / previous.questionDetection.averageProcessingTime
      if (latencyIncrease > this.config.monitoring.alertThresholds.latencyIncrease) {
        alerts.push(`Processing time increased by ${(latencyIncrease * 100).toFixed(1)}%`)
      }
    }

    if (alerts.length > 0) {
      logger.warn('Performance alerts detected', { alerts })
      this.emit('performance_alerts', { alerts, metrics })
    }
  }

  /**
   * Determine if feedback should be collected for this question
   */
  private shouldCollectFeedback(): boolean {
    return Math.random() < this.config.integration.feedbackCollectionRate
  }

  /**
   * Consider question for active learning
   */
  private considerForActiveLearning(text: string, analysis: QuestionAnalysis): void {
    // Add to active learning if confidence is below threshold
    if (analysis.confidence < this.config.questionDetection.confidenceThreshold! + 0.1) {
      // This would be handled by the feedback system's active learning component
      logger.debug('Question considered for active learning', {
        textLength: text.length,
        confidence: analysis.confidence,
        questionType: analysis.questionType
      })
    }
  }

  /**
   * Generate unique question ID
   */
  private generateQuestionId(): string {
    return `q_${Date.now()}_${++this.questionCounter}`
  }

  /**
   * Calculate active learning effectiveness
   */
  private calculateActiveLearningEffectiveness(): number {
    // This would calculate how much active learning improves the model
    // For now, return a placeholder
    return this.pendingLabeling.size > 0 ? 0.8 : 0.5
  }

  /**
   * Count model retrainings
   */
  private countModelRetrainings(): number {
    // This would track actual retrainings
    return 0
  }

  /**
   * Calculate end-to-end latency
   */
  private calculateEndToEndLatency(): number {
    const recentQuestions = Array.from(this.processedQuestions.values())
      .filter(q => q.source === 'transcription')
      .slice(-100)
    
    if (recentQuestions.length === 0) return 0

    const avgProcessingTime = recentQuestions.reduce((sum, q) => sum + q.processingTime, 0) / recentQuestions.length
    const pipelineMetrics = this.transcriptionPipeline.getPerformanceSummary()
    
    return avgProcessingTime + (pipelineMetrics.averageProcessingTime || 0)
  }

  /**
   * Generate system-level recommendations
   */
  private generateSystemRecommendations(
    systemMetrics: SystemPerformanceMetrics,
    feedbackReport: any
  ): string[] {
    const recommendations: string[] = []

    if (systemMetrics.questionDetection.averageProcessingTime > 50) {
      recommendations.push('Consider optimizing question detection processing time')
    }

    if (systemMetrics.questionDetection.cacheHitRate < 0.7) {
      recommendations.push('Improve cache hit rate by adjusting cache configuration')
    }

    if (systemMetrics.feedbackSystem.feedbackVolume < 50) {
      recommendations.push('Increase feedback collection rate to improve model learning')
    }

    if (this.pendingLabeling.size > 50) {
      recommendations.push('Process pending active learning samples to improve accuracy')
    }

    return recommendations.concat(feedbackReport.recommendations)
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000) // 24 hours
    
    // Clean up old processed questions
    for (const [id, question] of this.processedQuestions.entries()) {
      if (question.timestamp < cutoffTime) {
        this.processedQuestions.delete(id)
        this.userInteractions.delete(id)
      }
    }

    logger.debug('Cleaned up old data', {
      processedQuestionsRemaining: this.processedQuestions.size,
      userInteractionsRemaining: this.userInteractions.size
    })
  }

  /**
   * Update system configuration
   */
  updateConfiguration(newConfig: Partial<IntelligentProcessingConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Update component configurations
    if (newConfig.questionDetection) {
      this.questionDetector.updateConfig(newConfig.questionDetection)
    }
    
    if (newConfig.pipeline) {
      this.transcriptionPipeline.updateConfig(newConfig.pipeline)
    }

    logger.info('System configuration updated', {
      questionDetectionConfig: !!newConfig.questionDetection,
      pipelineConfig: !!newConfig.pipeline,
      feedbackSystemConfig: !!newConfig.feedbackSystem
    })

    this.emit('configuration_updated', this.config)
  }

  /**
   * Shutdown the system gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down IntelligentQuestionProcessingSystem...')

    try {
      // Generate final report
      const finalReport = this.getPerformanceReport()
      this.emit('final_system_report', finalReport)

      // Clean up components
      await this.feedbackSystem.destroy()
      this.transcriptionPipeline.destroy()
      this.questionDetector.destroy()

      // Clear data structures
      this.processedQuestions.clear()
      this.userInteractions.clear()
      this.performanceHistory = []
      this.pendingLabeling.clear()
      this.labelingQueue = []

      // Remove event listeners
      this.removeAllListeners()

      this.isInitialized = false

      logger.info('IntelligentQuestionProcessingSystem shutdown complete')

    } catch (error) {
      logger.error('Error during system shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

export default IntelligentQuestionProcessingSystem