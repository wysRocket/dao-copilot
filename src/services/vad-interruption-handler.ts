/**
 * VAD Interruption Handler for Tool Calls
 * 
 * This system manages Voice Activity Detection (VAD) interruptions during
 * tool call execution, allowing for graceful pausing, resuming, and cancellation
 * of search operations based on real-time voice activity signals.
 * 
 * Features:
 * - Real-time VAD signal monitoring
 * - Graceful tool call interruption and resumption
 * - State persistence during interruptions
 * - Priority-based interruption handling
 * - Timeout management for resumed operations
 * - Integration with Enhanced Tool Call Handler
 * - Performance metrics and analytics
 */

import { EventEmitter } from 'events'
import { logger } from './gemini-logger'

// VAD signal types and states
export enum VADSignalType {
  VOICE_START = 'voice_start',
  VOICE_END = 'voice_end',
  VOICE_CONTINUOUS = 'voice_continuous',
  SILENCE_DETECTED = 'silence_detected',
  NOISE_DETECTED = 'noise_detected'
}

export enum InterruptionState {
  RUNNING = 'running',
  PAUSED = 'paused',
  RESUMED = 'resumed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum ToolCallPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Interfaces
interface VADSignal {
  type: VADSignalType
  timestamp: number
  confidence: number // 0-1
  duration?: number // in milliseconds
  audioLevel?: number // dB level
  metadata?: {
    sessionId?: string
    userId?: string
    deviceId?: string
    [key: string]: any
  }
}

interface InterruptionContext {
  toolCallId: string
  toolName: string
  parameters: Record<string, any>
  priority: ToolCallPriority
  startTime: number
  interruptedAt?: number
  resumedAt?: number
  state: InterruptionState
  
  // Execution state
  partialResults?: any
  executionProgress?: number // 0-1
  checkpointData?: any
  
  // Interruption metadata
  interruptionReason: string
  vadSignals: VADSignal[]
  retryCount: number
  maxRetries: number
  timeout: number
  
  // Callbacks and handlers
  onPause?: () => Promise<void>
  onResume?: () => Promise<void>
  onCancel?: () => Promise<void>
  onComplete?: (result: any) => void
  onError?: (error: Error) => void
}

interface InterruptionConfig {
  // VAD sensitivity settings
  vadSensitivity: {
    voiceThreshold: number // confidence threshold for voice detection
    silenceTimeout: number // ms of silence before interruption
    noiseThreshold: number // audio level threshold for noise
    continuousVoiceTimeout: number // max continuous voice before forced pause
  }
  
  // Interruption behavior
  interruption: {
    enableInterruptions: boolean
    interruptionDelay: number // ms delay before interrupting
    resumeDelay: number // ms delay before resuming
    maxInterruptions: number // max interruptions per tool call
    gracePeriod: number // ms grace period for quick voice bursts
  }
  
  // Priority-based settings
  prioritySettings: {
    [ToolCallPriority.LOW]: {
      interruptible: boolean
      resumable: boolean
      timeout: number
    }
    [ToolCallPriority.MEDIUM]: {
      interruptible: boolean
      resumable: boolean
      timeout: number
    }
    [ToolCallPriority.HIGH]: {
      interruptible: boolean
      resumable: boolean
      timeout: number
    }
    [ToolCallPriority.CRITICAL]: {
      interruptible: boolean
      resumable: boolean
      timeout: number
    }
  }
  
  // Performance settings
  performance: {
    maxConcurrentInterruptions: number
    stateCleanupInterval: number // ms
    metricsRetentionTime: number // ms
  }
}

/**
 * VAD Signal Processor for analyzing and filtering VAD signals
 */
class VADSignalProcessor {
  private config: InterruptionConfig['vadSensitivity']
  private signalBuffer: VADSignal[] = []
  private bufferSize = 10
  
  constructor(config: InterruptionConfig['vadSensitivity']) {
    this.config = config
  }
  
  processSignal(signal: VADSignal): {
    shouldInterrupt: boolean
    shouldResume: boolean
    confidence: number
    reason: string
  } {
    this.addToBuffer(signal)
    
    const result = {
      shouldInterrupt: false,
      shouldResume: false,
      confidence: 0,
      reason: ''
    }
    
    switch (signal.type) {
      case VADSignalType.VOICE_START:
        if (signal.confidence >= this.config.voiceThreshold) {
          result.shouldInterrupt = true
          result.confidence = signal.confidence
          result.reason = 'Voice activity detected'
        }
        break
        
      case VADSignalType.VOICE_CONTINUOUS:
        // Check for continuous voice timeout
        const voiceDuration = this.calculateContinuousVoiceDuration()
        if (voiceDuration > this.config.continuousVoiceTimeout) {
          result.shouldInterrupt = true
          result.confidence = 0.9
          result.reason = 'Continuous voice timeout exceeded'
        }
        break
        
      case VADSignalType.VOICE_END:
      case VADSignalType.SILENCE_DETECTED:
        const silenceDuration = this.calculateSilenceDuration()
        if (silenceDuration >= this.config.silenceTimeout) {
          result.shouldResume = true
          result.confidence = 0.8
          result.reason = 'Sufficient silence detected'
        }
        break
        
      case VADSignalType.NOISE_DETECTED:
        if (signal.audioLevel && signal.audioLevel > this.config.noiseThreshold) {
          // High noise might mask voice, be more conservative
          result.confidence = Math.max(0.3, signal.confidence * 0.7)
        }
        break
    }
    
    return result
  }
  
  private addToBuffer(signal: VADSignal): void {
    this.signalBuffer.push(signal)
    if (this.signalBuffer.length > this.bufferSize) {
      this.signalBuffer.shift()
    }
  }
  
  private calculateContinuousVoiceDuration(): number {
    let duration = 0
    const now = Date.now()
    
    for (let i = this.signalBuffer.length - 1; i >= 0; i--) {
      const signal = this.signalBuffer[i]
      if (signal.type === VADSignalType.VOICE_START || 
          signal.type === VADSignalType.VOICE_CONTINUOUS) {
        duration = now - signal.timestamp
      } else {
        break
      }
    }
    
    return duration
  }
  
  private calculateSilenceDuration(): number {
    let duration = 0
    const now = Date.now()
    
    for (let i = this.signalBuffer.length - 1; i >= 0; i--) {
      const signal = this.signalBuffer[i]
      if (signal.type === VADSignalType.SILENCE_DETECTED ||
          signal.type === VADSignalType.VOICE_END) {
        duration = now - signal.timestamp
      } else {
        break
      }
    }
    
    return duration
  }
  
  getSignalHistory(): VADSignal[] {
    return [...this.signalBuffer]
  }
  
  clearBuffer(): void {
    this.signalBuffer = []
  }
}

/**
 * Interruption State Manager for handling tool call lifecycle
 */
class InterruptionStateManager {
  private activeContexts = new Map<string, InterruptionContext>()
  private stateHistory = new Map<string, InterruptionContext[]>()
  private cleanupInterval?: NodeJS.Timeout
  
  constructor(private config: InterruptionConfig) {
    this.startCleanupProcess()
  }
  
  createContext(
    toolCallId: string,
    toolName: string,
    parameters: Record<string, any>,
    priority: ToolCallPriority = ToolCallPriority.MEDIUM
  ): InterruptionContext {
    const prioritySettings = this.config.prioritySettings[priority]
    
    const context: InterruptionContext = {
      toolCallId,
      toolName,
      parameters,
      priority,
      startTime: Date.now(),
      state: InterruptionState.RUNNING,
      interruptionReason: '',
      vadSignals: [],
      retryCount: 0,
      maxRetries: this.config.interruption.maxInterruptions,
      timeout: prioritySettings.timeout
    }
    
    this.activeContexts.set(toolCallId, context)
    return context
  }
  
  updateContextState(
    toolCallId: string, 
    newState: InterruptionState,
    reason?: string,
    additionalData?: Partial<InterruptionContext>
  ): InterruptionContext | null {
    const context = this.activeContexts.get(toolCallId)
    if (!context) return null
    
    const previousState = context.state
    context.state = newState
    
    if (reason) {
      context.interruptionReason = reason
    }
    
    // Update timestamps
    switch (newState) {
      case InterruptionState.PAUSED:
        context.interruptedAt = Date.now()
        break
      case InterruptionState.RESUMED:
        context.resumedAt = Date.now()
        break
    }
    
    // Merge additional data
    if (additionalData) {
      Object.assign(context, additionalData)
    }
    
    // Archive context if completed or failed
    if (newState === InterruptionState.COMPLETED || 
        newState === InterruptionState.FAILED ||
        newState === InterruptionState.CANCELLED) {
      this.archiveContext(toolCallId, context)
    }
    
    logger.debug('Context state updated', {
      toolCallId,
      previousState,
      newState,
      reason,
      executionTime: Date.now() - context.startTime
    })
    
    return context
  }
  
  getContext(toolCallId: string): InterruptionContext | undefined {
    return this.activeContexts.get(toolCallId)
  }
  
  getAllActiveContexts(): InterruptionContext[] {
    return Array.from(this.activeContexts.values())
  }
  
  addVADSignal(toolCallId: string, signal: VADSignal): void {
    const context = this.activeContexts.get(toolCallId)
    if (context) {
      context.vadSignals.push(signal)
      
      // Keep only recent signals to prevent memory bloat
      if (context.vadSignals.length > 50) {
        context.vadSignals = context.vadSignals.slice(-25)
      }
    }
  }
  
  canInterrupt(toolCallId: string): boolean {
    const context = this.activeContexts.get(toolCallId)
    if (!context) return false
    
    const prioritySettings = this.config.prioritySettings[context.priority]
    
    return (
      prioritySettings.interruptible &&
      context.state === InterruptionState.RUNNING &&
      context.retryCount < context.maxRetries &&
      this.config.interruption.enableInterruptions
    )
  }
  
  canResume(toolCallId: string): boolean {
    const context = this.activeContexts.get(toolCallId)
    if (!context) return false
    
    const prioritySettings = this.config.prioritySettings[context.priority]
    
    return (
      prioritySettings.resumable &&
      context.state === InterruptionState.PAUSED &&
      Date.now() - context.startTime < context.timeout
    )
  }
  
  private archiveContext(toolCallId: string, context: InterruptionContext): void {
    this.activeContexts.delete(toolCallId)
    
    const history = this.stateHistory.get(toolCallId) || []
    history.push({ ...context })
    this.stateHistory.set(toolCallId, history)
  }
  
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredContexts()
      this.cleanupOldHistory()
    }, this.config.performance.stateCleanupInterval)
  }
  
  private cleanupExpiredContexts(): void {
    const now = Date.now()
    const expiredContexts: string[] = []
    
    for (const [toolCallId, context] of this.activeContexts) {
      if (now - context.startTime > context.timeout) {
        expiredContexts.push(toolCallId)
      }
    }
    
    for (const toolCallId of expiredContexts) {
      const context = this.activeContexts.get(toolCallId)
      if (context) {
        this.updateContextState(toolCallId, InterruptionState.FAILED, 'Timeout exceeded')
        logger.warn('Tool call context expired due to timeout', {
          toolCallId,
          toolName: context.toolName,
          executionTime: now - context.startTime,
          timeout: context.timeout
        })
      }
    }
  }
  
  private cleanupOldHistory(): void {
    const cutoff = Date.now() - this.config.performance.metricsRetentionTime
    
    for (const [toolCallId, history] of this.stateHistory) {
      const filteredHistory = history.filter(context => context.startTime > cutoff)
      
      if (filteredHistory.length === 0) {
        this.stateHistory.delete(toolCallId)
      } else if (filteredHistory.length !== history.length) {
        this.stateHistory.set(toolCallId, filteredHistory)
      }
    }
  }
  
  getMetrics(): any {
    const activeCount = this.activeContexts.size
    const historyCount = Array.from(this.stateHistory.values()).reduce((sum, h) => sum + h.length, 0)
    
    const stateDistribution = Array.from(this.activeContexts.values()).reduce((dist, context) => {
      dist[context.state] = (dist[context.state] || 0) + 1
      return dist
    }, {} as Record<InterruptionState, number>)
    
    return {
      activeContexts: activeCount,
      archivedContexts: historyCount,
      stateDistribution,
      memoryUsage: {
        activeContextsSize: activeCount,
        historySize: historyCount
      }
    }
  }
  
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
    
    this.activeContexts.clear()
    this.stateHistory.clear()
  }
}

/**
 * Main VAD Interruption Handler
 */
export class VADInterruptionHandler extends EventEmitter {
  private config: InterruptionConfig
  private signalProcessor: VADSignalProcessor
  private stateManager: InterruptionStateManager
  private isInitialized = false
  
  // Performance metrics
  private metrics = {
    totalInterruptions: 0,
    totalResumptions: 0,
    totalCancellations: 0,
    averageInterruptionTime: 0,
    averageResumptionTime: 0,
    successfulResumes: 0,
    failedResumes: 0
  }
  
  constructor(config?: Partial<InterruptionConfig>) {
    super()
    
    this.config = {
      vadSensitivity: {
        voiceThreshold: 0.7,
        silenceTimeout: 2000, // 2 seconds
        noiseThreshold: -20, // -20 dB
        continuousVoiceTimeout: 10000 // 10 seconds
      },
      
      interruption: {
        enableInterruptions: true,
        interruptionDelay: 500, // 500ms
        resumeDelay: 1000, // 1 second
        maxInterruptions: 3,
        gracePeriod: 300 // 300ms
      },
      
      prioritySettings: {
        [ToolCallPriority.LOW]: {
          interruptible: true,
          resumable: true,
          timeout: 30000 // 30 seconds
        },
        [ToolCallPriority.MEDIUM]: {
          interruptible: true,
          resumable: true,
          timeout: 60000 // 1 minute
        },
        [ToolCallPriority.HIGH]: {
          interruptible: false,
          resumable: true,
          timeout: 120000 // 2 minutes
        },
        [ToolCallPriority.CRITICAL]: {
          interruptible: false,
          resumable: false,
          timeout: 300000 // 5 minutes
        }
      },
      
      performance: {
        maxConcurrentInterruptions: 5,
        stateCleanupInterval: 30000, // 30 seconds
        metricsRetentionTime: 3600000 // 1 hour
      },
      
      ...config
    }
    
    this.signalProcessor = new VADSignalProcessor(this.config.vadSensitivity)
    this.stateManager = new InterruptionStateManager(this.config)
    
    this.setupEventHandlers()
    
    logger.info('VAD Interruption Handler initialized', {
      config: {
        enableInterruptions: this.config.interruption.enableInterruptions,
        voiceThreshold: this.config.vadSensitivity.voiceThreshold,
        maxConcurrentInterruptions: this.config.performance.maxConcurrentInterruptions
      }
    })
  }
  
  /**
   * Initialize the VAD interruption handler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    
    // Any initialization logic here
    this.isInitialized = true
    
    logger.info('VAD Interruption Handler initialized successfully')
    this.emit('initialized')
  }
  
  /**
   * Start monitoring a tool call for interruptions
   */
  startMonitoring(
    toolCallId: string,
    toolName: string,
    parameters: Record<string, any>,
    priority: ToolCallPriority = ToolCallPriority.MEDIUM,
    callbacks?: {
      onPause?: () => Promise<void>
      onResume?: () => Promise<void>
      onCancel?: () => Promise<void>
      onComplete?: (result: any) => void
      onError?: (error: Error) => void
    }
  ): InterruptionContext {
    const context = this.stateManager.createContext(toolCallId, toolName, parameters, priority)
    
    if (callbacks) {
      Object.assign(context, callbacks)
    }
    
    this.emit('monitoring_started', {
      toolCallId,
      toolName,
      priority,
      startTime: context.startTime
    })
    
    logger.debug('Started monitoring tool call', {
      toolCallId,
      toolName,
      priority
    })
    
    return context
  }
  
  /**
   * Stop monitoring a tool call
   */
  stopMonitoring(toolCallId: string, result?: any, error?: Error): void {
    const context = this.stateManager.getContext(toolCallId)
    if (!context) return
    
    if (error) {
      this.stateManager.updateContextState(toolCallId, InterruptionState.FAILED, error.message)
      if (context.onError) {
        context.onError(error)
      }
    } else {
      this.stateManager.updateContextState(toolCallId, InterruptionState.COMPLETED, 'Successfully completed')
      if (context.onComplete) {
        context.onComplete(result)
      }
    }
    
    this.emit('monitoring_stopped', {
      toolCallId,
      executionTime: Date.now() - context.startTime,
      state: context.state,
      success: !error
    })
    
    logger.debug('Stopped monitoring tool call', {
      toolCallId,
      finalState: context.state,
      executionTime: Date.now() - context.startTime
    })
  }
  
  /**
   * Process incoming VAD signal
   */
  async processVADSignal(toolCallId: string, signal: VADSignal): Promise<void> {
    const context = this.stateManager.getContext(toolCallId)
    if (!context) return
    
    // Add signal to context
    this.stateManager.addVADSignal(toolCallId, signal)
    
    // Process signal
    const decision = this.signalProcessor.processSignal(signal)
    
    // Handle interruption
    if (decision.shouldInterrupt && this.stateManager.canInterrupt(toolCallId)) {
      await this.handleInterruption(toolCallId, decision.reason, decision.confidence)
    }
    
    // Handle resumption
    if (decision.shouldResume && this.stateManager.canResume(toolCallId)) {
      await this.handleResumption(toolCallId, decision.reason, decision.confidence)
    }
    
    this.emit('vad_signal_processed', {
      toolCallId,
      signal: signal.type,
      confidence: decision.confidence,
      action: decision.shouldInterrupt ? 'interrupt' : decision.shouldResume ? 'resume' : 'none'
    })
  }
  
  /**
   * Force interrupt a tool call
   */
  async forceInterrupt(toolCallId: string, reason: string = 'Force interrupted'): Promise<boolean> {
    if (!this.stateManager.canInterrupt(toolCallId)) {
      return false
    }
    
    return await this.handleInterruption(toolCallId, reason, 1.0)
  }
  
  /**
   * Force resume a tool call
   */
  async forceResume(toolCallId: string, reason: string = 'Force resumed'): Promise<boolean> {
    if (!this.stateManager.canResume(toolCallId)) {
      return false
    }
    
    return await this.handleResumption(toolCallId, reason, 1.0)
  }
  
  /**
   * Cancel a tool call
   */
  async cancelToolCall(toolCallId: string, reason: string = 'Cancelled by request'): Promise<boolean> {
    const context = this.stateManager.getContext(toolCallId)
    if (!context) return false
    
    try {
      if (context.onCancel) {
        await context.onCancel()
      }
      
      this.stateManager.updateContextState(toolCallId, InterruptionState.CANCELLED, reason)
      this.metrics.totalCancellations++
      
      this.emit('tool_call_cancelled', {
        toolCallId,
        reason,
        executionTime: Date.now() - context.startTime
      })
      
      logger.info('Tool call cancelled', { toolCallId, reason })
      return true
      
    } catch (error) {
      logger.error('Error cancelling tool call', {
        toolCallId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }
  
  /**
   * Get current status of a tool call
   */
  getToolCallStatus(toolCallId: string): InterruptionContext | undefined {
    return this.stateManager.getContext(toolCallId)
  }
  
  /**
   * Get all active tool calls
   */
  getActiveToolCalls(): InterruptionContext[] {
    return this.stateManager.getAllActiveContexts()
  }
  
  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<InterruptionConfig>): void {
    Object.assign(this.config, updates)
    this.signalProcessor = new VADSignalProcessor(this.config.vadSensitivity)
    
    logger.info('VAD interruption configuration updated', updates)
    this.emit('config_updated', updates)
  }
  
  /**
   * Get comprehensive metrics
   */
  getMetrics(): any {
    const stateMetrics = this.stateManager.getMetrics()
    
    return {
      handler: this.metrics,
      state: stateMetrics,
      performance: {
        averageInterruptionTime: this.metrics.averageInterruptionTime,
        averageResumptionTime: this.metrics.averageResumptionTime,
        successRate: this.metrics.totalResumptions > 0 ? 
          this.metrics.successfulResumes / this.metrics.totalResumptions : 0
      },
      config: {
        enableInterruptions: this.config.interruption.enableInterruptions,
        maxConcurrentInterruptions: this.config.performance.maxConcurrentInterruptions,
        voiceThreshold: this.config.vadSensitivity.voiceThreshold
      }
    }
  }
  
  /**
   * Shutdown the handler gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down VAD Interruption Handler')
    
    // Cancel all active tool calls
    const activeContexts = this.stateManager.getAllActiveContexts()
    
    for (const context of activeContexts) {
      await this.cancelToolCall(context.toolCallId, 'System shutdown')
    }
    
    // Shutdown components
    this.stateManager.shutdown()
    this.signalProcessor.clearBuffer()
    
    // Clear metrics
    this.removeAllListeners()
    
    logger.info('VAD Interruption Handler shutdown complete')
  }
  
  // Private methods
  
  private async handleInterruption(toolCallId: string, reason: string, confidence: number): Promise<boolean> {
    const context = this.stateManager.getContext(toolCallId)
    if (!context) return false
    
    try {
      const startTime = performance.now()
      
      // Add delay before interruption for grace period
      if (this.config.interruption.gracePeriod > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.interruption.gracePeriod))
      }
      
      // Execute interruption callback
      if (context.onPause) {
        await context.onPause()
      }
      
      // Update state
      this.stateManager.updateContextState(toolCallId, InterruptionState.PAUSED, reason, {
        retryCount: context.retryCount + 1,
        executionProgress: 0.5 // Assume 50% progress when interrupted
      })
      
      const interruptionTime = performance.now() - startTime
      this.updateMetrics('interruption', interruptionTime)
      
      this.emit('tool_call_interrupted', {
        toolCallId,
        reason,
        confidence,
        interruptionTime,
        retryCount: context.retryCount
      })
      
      logger.info('Tool call interrupted', {
        toolCallId,
        reason,
        confidence,
        interruptionTime: `${interruptionTime.toFixed(2)}ms`
      })
      
      return true
      
    } catch (error) {
      logger.error('Error interrupting tool call', {
        toolCallId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.stateManager.updateContextState(toolCallId, InterruptionState.FAILED, 'Interruption failed')
      return false
    }
  }
  
  private async handleResumption(toolCallId: string, reason: string, confidence: number): Promise<boolean> {
    const context = this.stateManager.getContext(toolCallId)
    if (!context) return false
    
    try {
      const startTime = performance.now()
      
      // Add delay before resumption
      if (this.config.interruption.resumeDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.interruption.resumeDelay))
      }
      
      // Execute resumption callback
      if (context.onResume) {
        await context.onResume()
      }
      
      // Update state
      this.stateManager.updateContextState(toolCallId, InterruptionState.RESUMED, reason)
      
      const resumptionTime = performance.now() - startTime
      this.updateMetrics('resumption', resumptionTime)
      this.metrics.successfulResumes++
      
      this.emit('tool_call_resumed', {
        toolCallId,
        reason,
        confidence,
        resumptionTime,
        totalInterruptionTime: context.resumedAt! - context.interruptedAt!
      })
      
      logger.info('Tool call resumed', {
        toolCallId,
        reason,
        confidence,
        resumptionTime: `${resumptionTime.toFixed(2)}ms`,
        totalInterruptionTime: context.resumedAt! - context.interruptedAt!
      })
      
      return true
      
    } catch (error) {
      logger.error('Error resuming tool call', {
        toolCallId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.stateManager.updateContextState(toolCallId, InterruptionState.FAILED, 'Resumption failed')
      this.metrics.failedResumes++
      return false
    }
  }
  
  private updateMetrics(type: 'interruption' | 'resumption', duration: number): void {
    if (type === 'interruption') {
      this.metrics.totalInterruptions++
      this.metrics.averageInterruptionTime = 
        (this.metrics.averageInterruptionTime * (this.metrics.totalInterruptions - 1) + duration) / 
        this.metrics.totalInterruptions
    } else {
      this.metrics.totalResumptions++
      this.metrics.averageResumptionTime = 
        (this.metrics.averageResumptionTime * (this.metrics.totalResumptions - 1) + duration) / 
        this.metrics.totalResumptions
    }
  }
  
  private setupEventHandlers(): void {
    this.on('tool_call_interrupted', (data) => {
      logger.debug('Tool call interrupted event', data)
    })
    
    this.on('tool_call_resumed', (data) => {
      logger.debug('Tool call resumed event', data)
    })
    
    this.on('tool_call_cancelled', (data) => {
      logger.debug('Tool call cancelled event', data)
    })
  }
}

export default VADInterruptionHandler