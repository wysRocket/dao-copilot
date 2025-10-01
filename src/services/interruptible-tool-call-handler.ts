/**
 * Interruptible Tool Call Handler
 * 
 * This module integrates the Enhanced Tool Call Handler with the VAD Interruption
 * Handler to provide seamless voice-activity-aware search operations. It enables
 * the AI answering machine to gracefully pause and resume Google Search API calls
 * based on real-time voice activity detection signals.
 * 
 * Features:
 * - Seamless integration between tool calling and VAD interruption
 * - State preservation during interruptions
 * - Automatic retry and resumption logic
 * - Performance monitoring and metrics
 * - Configurable interruption policies
 * - Real-time status updates and events
 */

import { EventEmitter } from 'events'
import { EnhancedToolCallHandler } from './enhanced-tool-call-handler'
import { 
  VADInterruptionHandler, 
  VADSignalType, 
  InterruptionState, 
  ToolCallPriority 
} from './vad-interruption-handler'
import { logger } from './gemini-logger'

// Types and interfaces
interface InterruptibleToolCallRequest {
  tool: string
  parameters: Record<string, any>
  context?: {
    conversationId?: string
    userId?: string
    sessionId?: string
    previousQueries?: string[]
  }
  
  // Interruption-specific options
  interruption?: {
    priority?: ToolCallPriority
    allowInterruptions?: boolean
    maxInterruptions?: number
    saveStateOnInterrupt?: boolean
    resumeTimeout?: number
  }
  
  // VAD monitoring options
  vadMonitoring?: {
    enabled?: boolean
    sensitivity?: number
    silenceTimeout?: number
    noiseThreshold?: number
  }
}

interface InterruptibleToolCallResponse {
  success: boolean
  toolName: string
  executionTime: number
  results?: any[]
  totalResults?: number
  searchQuery?: string
  source: 'primary' | 'cache' | 'fallback' | 'offline' | 'interrupted' | 'resumed'
  confidence: number
  
  // Interruption metadata
  interruption?: {
    wasInterrupted: boolean
    interruptionCount: number
    totalInterruptionTime: number
    finalState: InterruptionState
    vadSignalCount: number
  }
  
  error?: {
    code: string
    message: string
    retryable: boolean
  }
  
  metadata: {
    quota: {
      used: number
      remaining: number
      resetTime?: number
    }
    performance: {
      apiResponseTime: number
      cacheHitRate: number
      fallbackUsed: boolean
      interruptionOverhead: number
    }
    context: {
      conversationId?: string
      sessionId?: string
      relatedQueries?: string[]
      vadSignals?: any[]
    }
  }
}

interface InterruptionPolicy {
  enableByDefault: boolean
  defaultPriority: ToolCallPriority
  priorityOverrides: {
    [toolName: string]: ToolCallPriority
  }
  timeoutSettings: {
    [ToolCallPriority.LOW]: number
    [ToolCallPriority.MEDIUM]: number
    [ToolCallPriority.HIGH]: number
    [ToolCallPriority.CRITICAL]: number
  }
  retrySettings: {
    maxRetries: number
    backoffMultiplier: number
    maxBackoffDelay: number
  }
}

/**
 * Checkpoint Manager for saving and restoring tool call state
 */
class ToolCallCheckpointManager {
  private checkpoints = new Map<string, any>()
  private maxCheckpoints = 100
  
  saveCheckpoint(toolCallId: string, state: {
    tool: string
    parameters: Record<string, any>
    partialResults?: any
    executionProgress?: number
    timestamp: number
  }): void {
    this.checkpoints.set(toolCallId, { ...state })
    
    // Cleanup old checkpoints
    if (this.checkpoints.size > this.maxCheckpoints) {
      const oldest = Array.from(this.checkpoints.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
      this.checkpoints.delete(oldest[0])
    }
    
    logger.debug('Checkpoint saved', {
      toolCallId,
      tool: state.tool,
      progress: state.executionProgress
    })
  }
  
  loadCheckpoint(toolCallId: string): any | null {
    const checkpoint = this.checkpoints.get(toolCallId)
    if (checkpoint) {
      logger.debug('Checkpoint loaded', {
        toolCallId,
        tool: checkpoint.tool,
        age: Date.now() - checkpoint.timestamp
      })
    }
    return checkpoint || null
  }
  
  removeCheckpoint(toolCallId: string): void {
    this.checkpoints.delete(toolCallId)
  }
  
  getCheckpointStats(): { total: number, oldestAge: number, newestAge: number } {
    const checkpoints = Array.from(this.checkpoints.values())
    const now = Date.now()
    
    if (checkpoints.length === 0) {
      return { total: 0, oldestAge: 0, newestAge: 0 }
    }
    
    const ages = checkpoints.map(c => now - c.timestamp)
    
    return {
      total: checkpoints.length,
      oldestAge: Math.max(...ages),
      newestAge: Math.min(...ages)
    }
  }
  
  clearExpiredCheckpoints(maxAge: number): number {
    const now = Date.now()
    const expired: string[] = []
    
    for (const [toolCallId, checkpoint] of this.checkpoints) {
      if (now - checkpoint.timestamp > maxAge) {
        expired.push(toolCallId)
      }
    }
    
    expired.forEach(id => this.checkpoints.delete(id))
    
    logger.debug('Expired checkpoints cleared', {
      clearedCount: expired.length,
      remainingCount: this.checkpoints.size
    })
    
    return expired.length
  }
}

/**
 * Performance Monitor for tracking interruption-related metrics
 */
class InterruptionPerformanceMonitor {
  private metrics = {
    totalCalls: 0,
    interruptedCalls: 0,
    resumedCalls: 0,
    cancelledCalls: 0,
    averageExecutionTime: 0,
    averageInterruptionOverhead: 0,
    successRate: 0,
    interruptionRate: 0
  }
  
  recordToolCall(
    wasInterrupted: boolean,
    executionTime: number,
    interruptionOverhead: number,
    success: boolean,
    state: InterruptionState
  ): void {
    this.metrics.totalCalls++
    
    if (wasInterrupted) {
      this.metrics.interruptedCalls++
      
      if (state === InterruptionState.COMPLETED || state === InterruptionState.RESUMED) {
        this.metrics.resumedCalls++
      } else if (state === InterruptionState.CANCELLED) {
        this.metrics.cancelledCalls++
      }
    }
    
    // Update averages
    const total = this.metrics.totalCalls
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (total - 1) + executionTime) / total
    
    if (wasInterrupted) {
      const interruptedTotal = this.metrics.interruptedCalls
      this.metrics.averageInterruptionOverhead = 
        (this.metrics.averageInterruptionOverhead * (interruptedTotal - 1) + interruptionOverhead) / interruptedTotal
    }
    
    // Update rates
    this.metrics.successRate = this.calculateSuccessRate()
    this.metrics.interruptionRate = this.metrics.interruptedCalls / this.metrics.totalCalls
  }
  
  private calculateSuccessRate(): number {
    const successfulCalls = this.metrics.totalCalls - this.metrics.cancelledCalls
    return this.metrics.totalCalls > 0 ? successfulCalls / this.metrics.totalCalls : 0
  }
  
  getMetrics(): typeof this.metrics {
    return { ...this.metrics }
  }
  
  reset(): void {
    Object.keys(this.metrics).forEach(key => {
      (this.metrics as any)[key] = 0
    })
  }
}

/**
 * Main Interruptible Tool Call Handler
 */
export class InterruptibleToolCallHandler extends EventEmitter {
  private toolCallHandler: EnhancedToolCallHandler
  private vadHandler: VADInterruptionHandler
  private checkpointManager: ToolCallCheckpointManager
  private performanceMonitor: InterruptionPerformanceMonitor
  private policy: InterruptionPolicy
  private isInitialized = false
  
  // Active tool calls tracking
  private activeToolCalls = new Map<string, {
    request: InterruptibleToolCallRequest
    startTime: number
    interruptionStartTime?: number
    totalInterruptionTime: number
    vadSignalCount: number
  }>()

  constructor(
    toolCallHandler: EnhancedToolCallHandler,
    vadHandler: VADInterruptionHandler,
    policy?: Partial<InterruptionPolicy>
  ) {
    super()
    
    this.toolCallHandler = toolCallHandler
    this.vadHandler = vadHandler
    this.checkpointManager = new ToolCallCheckpointManager()
    this.performanceMonitor = new InterruptionPerformanceMonitor()
    
    this.policy = {
      enableByDefault: true,
      defaultPriority: ToolCallPriority.MEDIUM,
      priorityOverrides: {
        'google_search': ToolCallPriority.LOW,
        'web_search': ToolCallPriority.LOW,
        'search': ToolCallPriority.LOW
      },
      timeoutSettings: {
        [ToolCallPriority.LOW]: 30000,
        [ToolCallPriority.MEDIUM]: 60000,
        [ToolCallPriority.HIGH]: 120000,
        [ToolCallPriority.CRITICAL]: 300000
      },
      retrySettings: {
        maxRetries: 3,
        backoffMultiplier: 1.5,
        maxBackoffDelay: 10000
      },
      ...policy
    }
    
    this.setupEventHandlers()
    
    logger.info('Interruptible Tool Call Handler initialized', {
      enableByDefault: this.policy.enableByDefault,
      defaultPriority: this.policy.defaultPriority
    })
  }
  
  /**
   * Initialize the interruptible handler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    
    await this.toolCallHandler.initialize()
    await this.vadHandler.initialize()
    
    this.isInitialized = true
    
    logger.info('Interruptible Tool Call Handler fully initialized')
    this.emit('initialized')
  }
  
  /**
   * Execute a tool call with VAD interruption support
   */
  async executeInterruptibleToolCall(request: InterruptibleToolCallRequest): Promise<InterruptibleToolCallResponse> {
    const toolCallId = this.generateToolCallId()
    const startTime = performance.now()
    
    try {
      // Determine interruption settings
      const priority = this.determinePriority(request)
      const allowInterruptions = request.interruption?.allowInterruptions ?? this.policy.enableByDefault
      
      // Track active tool call
      this.activeToolCalls.set(toolCallId, {
        request,
        startTime: Date.now(),
        totalInterruptionTime: 0,
        vadSignalCount: 0
      })
      
      // Start VAD monitoring if enabled
      if (allowInterruptions && request.vadMonitoring?.enabled !== false) {
        await this.startVADMonitoring(toolCallId, request, priority)
      }
      
      // Execute the tool call
      const response = await this.executeWithInterruptions(toolCallId, request, priority)
      
      // Calculate final metrics
      const executionTime = performance.now() - startTime
      const activeCall = this.activeToolCalls.get(toolCallId)
      const interruptionOverhead = activeCall?.totalInterruptionTime || 0
      
      // Record performance metrics
      this.performanceMonitor.recordToolCall(
        response.interruption?.wasInterrupted || false,
        executionTime,
        interruptionOverhead,
        response.success,
        response.interruption?.finalState || InterruptionState.COMPLETED
      )
      
      // Clean up
      this.activeToolCalls.delete(toolCallId)
      this.checkpointManager.removeCheckpoint(toolCallId)
      
      return response
      
    } catch (error) {
      const executionTime = performance.now() - startTime
      
      // Clean up on error
      this.activeToolCalls.delete(toolCallId)
      this.checkpointManager.removeCheckpoint(toolCallId)
      this.vadHandler.stopMonitoring(toolCallId, undefined, error instanceof Error ? error : new Error('Unknown error'))
      
      // Record failed call
      this.performanceMonitor.recordToolCall(
        false,
        executionTime,
        0,
        false,
        InterruptionState.FAILED
      )
      
      // Return error response
      return this.createErrorResponse(request.tool, executionTime, error instanceof Error ? error : new Error('Unknown error'))
    }
  }
  
  /**
   * Process VAD signal for active tool calls
   */
  async processVADSignal(signal: {
    type: VADSignalType
    timestamp: number
    confidence: number
    duration?: number
    audioLevel?: number
    metadata?: any
  }): Promise<void> {
    // Process for all active tool calls that have VAD monitoring enabled
    for (const [toolCallId, activeCall] of this.activeToolCalls) {
      if (activeCall.request.vadMonitoring?.enabled !== false) {
        activeCall.vadSignalCount++
        await this.vadHandler.processVADSignal(toolCallId, signal)
      }
    }
    
    this.emit('vad_signal_received', {
      signalType: signal.type,
      confidence: signal.confidence,
      activeToolCalls: this.activeToolCalls.size
    })
  }
  
  /**
   * Force interrupt a specific tool call
   */
  async forceInterruptToolCall(toolCallId: string, reason?: string): Promise<boolean> {
    return await this.vadHandler.forceInterrupt(toolCallId, reason)
  }
  
  /**
   * Force resume a specific tool call
   */
  async forceResumeToolCall(toolCallId: string, reason?: string): Promise<boolean> {
    return await this.vadHandler.forceResume(toolCallId, reason)
  }
  
  /**
   * Cancel a specific tool call
   */
  async cancelToolCall(toolCallId: string, reason?: string): Promise<boolean> {
    const activeCall = this.activeToolCalls.get(toolCallId)
    if (activeCall) {
      this.activeToolCalls.delete(toolCallId)
      this.checkpointManager.removeCheckpoint(toolCallId)
    }
    
    return await this.vadHandler.cancelToolCall(toolCallId, reason)
  }
  
  /**
   * Get status of all active tool calls
   */
  getActiveToolCallsStatus(): any[] {
    return Array.from(this.activeToolCalls.entries()).map(([toolCallId, activeCall]) => {
      const vadStatus = this.vadHandler.getToolCallStatus(toolCallId)
      
      return {
        toolCallId,
        toolName: activeCall.request.tool,
        startTime: activeCall.startTime,
        executionTime: Date.now() - activeCall.startTime,
        totalInterruptionTime: activeCall.totalInterruptionTime,
        vadSignalCount: activeCall.vadSignalCount,
        state: vadStatus?.state || 'unknown',
        priority: vadStatus?.priority || 'medium'
      }
    })
  }
  
  /**
   * Get comprehensive metrics
   */
  getComprehensiveMetrics(): any {
    const toolCallMetrics = this.toolCallHandler.getSystemMetrics()
    const vadMetrics = this.vadHandler.getMetrics()
    const interruptionMetrics = this.performanceMonitor.getMetrics()
    const checkpointStats = this.checkpointManager.getCheckpointStats()
    
    return {
      toolCall: toolCallMetrics,
      vad: vadMetrics,
      interruption: interruptionMetrics,
      checkpoints: checkpointStats,
      activeToolCalls: this.activeToolCalls.size,
      system: {
        isInitialized: this.isInitialized,
        policy: this.policy
      }
    }
  }
  
  /**
   * Update policy configuration
   */
  updatePolicy(updates: Partial<InterruptionPolicy>): void {
    Object.assign(this.policy, updates)
    
    logger.info('Interruption policy updated', updates)
    this.emit('policy_updated', updates)
  }
  
  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Interruptible Tool Call Handler')
    
    // Cancel all active tool calls
    const activeToolCallIds = Array.from(this.activeToolCalls.keys())
    
    for (const toolCallId of activeToolCallIds) {
      await this.cancelToolCall(toolCallId, 'System shutdown')
    }
    
    // Shutdown components
    await this.vadHandler.shutdown()
    await this.toolCallHandler.shutdown()
    
    // Clear data
    this.activeToolCalls.clear()
    this.performanceMonitor.reset()
    this.removeAllListeners()
    
    logger.info('Interruptible Tool Call Handler shutdown complete')
  }
  
  // Private methods
  
  private async startVADMonitoring(
    toolCallId: string,
    request: InterruptibleToolCallRequest,
    priority: ToolCallPriority
  ): Promise<void> {
    const callbacks = {
      onPause: async () => {
        await this.handleToolCallPause(toolCallId, request)
      },
      onResume: async () => {
        await this.handleToolCallResume(toolCallId, request)
      },
      onCancel: async () => {
        await this.handleToolCallCancel(toolCallId, request)
      },
      onComplete: (result: any) => {
        this.emit('tool_call_completed', { toolCallId, result })
      },
      onError: (error: Error) => {
        this.emit('tool_call_error', { toolCallId, error })
      }
    }
    
    this.vadHandler.startMonitoring(
      toolCallId,
      request.tool,
      request.parameters,
      priority,
      callbacks
    )
  }
  
  private async executeWithInterruptions(
    toolCallId: string,
    request: InterruptibleToolCallRequest,
    priority: ToolCallPriority
  ): Promise<InterruptibleToolCallResponse> {
    let attempt = 0
    const maxRetries = request.interruption?.maxInterruptions ?? this.policy.retrySettings.maxRetries
    
    while (attempt <= maxRetries) {
      try {
        // Check if we have a checkpoint to resume from
        const checkpoint = this.checkpointManager.loadCheckpoint(toolCallId)
        const actualRequest = checkpoint ? this.createResumedRequest(request, checkpoint) : request
        
        // Execute the tool call
        const response = await this.toolCallHandler.executeToolCall(actualRequest)
        
        // Convert to interruptible response
        return this.createInterruptibleResponse(toolCallId, response, request)
        
      } catch (error) {
        attempt++
        
        if (attempt > maxRetries) {
          throw error
        }
        
        // Apply exponential backoff
        const delay = Math.min(
          1000 * Math.pow(this.policy.retrySettings.backoffMultiplier, attempt - 1),
          this.policy.retrySettings.maxBackoffDelay
        )
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        logger.warn('Tool call retry attempt', {
          toolCallId,
          attempt,
          maxRetries,
          delay,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    throw new Error(`Tool call failed after ${maxRetries} retries`)
  }
  
  private async handleToolCallPause(toolCallId: string, request: InterruptibleToolCallRequest): Promise<void> {
    const activeCall = this.activeToolCalls.get(toolCallId)
    if (activeCall) {
      activeCall.interruptionStartTime = Date.now()
      
      // Save checkpoint if enabled
      if (request.interruption?.saveStateOnInterrupt !== false) {
        this.checkpointManager.saveCheckpoint(toolCallId, {
          tool: request.tool,
          parameters: request.parameters,
          executionProgress: 0.5, // Assume 50% progress
          timestamp: Date.now()
        })
      }
    }
    
    this.emit('tool_call_paused', { toolCallId })
    logger.debug('Tool call paused', { toolCallId })
  }
  
  private async handleToolCallResume(toolCallId: string, request: InterruptibleToolCallRequest): Promise<void> {
    const activeCall = this.activeToolCalls.get(toolCallId)
    if (activeCall && activeCall.interruptionStartTime) {
      const interruptionDuration = Date.now() - activeCall.interruptionStartTime
      activeCall.totalInterruptionTime += interruptionDuration
      activeCall.interruptionStartTime = undefined
    }
    
    this.emit('tool_call_resumed', { toolCallId })
    logger.debug('Tool call resumed', { toolCallId })
  }
  
  private async handleToolCallCancel(toolCallId: string, request: InterruptibleToolCallRequest): Promise<void> {
    const activeCall = this.activeToolCalls.get(toolCallId)
    if (activeCall) {
      this.activeToolCalls.delete(toolCallId)
      this.checkpointManager.removeCheckpoint(toolCallId)
    }
    
    this.emit('tool_call_cancelled', { toolCallId })
    logger.debug('Tool call cancelled', { toolCallId })
  }
  
  private determinePriority(request: InterruptibleToolCallRequest): ToolCallPriority {
    // Check for explicit priority
    if (request.interruption?.priority) {
      return request.interruption.priority
    }
    
    // Check tool-specific overrides
    const toolPriority = this.policy.priorityOverrides[request.tool]
    if (toolPriority) {
      return toolPriority
    }
    
    // Use default priority
    return this.policy.defaultPriority
  }
  
  private createResumedRequest(
    originalRequest: InterruptibleToolCallRequest,
    checkpoint: any
  ): InterruptibleToolCallRequest {
    // For now, just return the original request
    // In a more sophisticated implementation, we would modify the request
    // based on the checkpoint data to resume from where we left off
    return originalRequest
  }
  
  private createInterruptibleResponse(
    toolCallId: string,
    response: any,
    request: InterruptibleToolCallRequest
  ): InterruptibleToolCallResponse {
    const activeCall = this.activeToolCalls.get(toolCallId)
    const vadStatus = this.vadHandler.getToolCallStatus(toolCallId)
    
    const wasInterrupted = vadStatus?.state === InterruptionState.PAUSED ||
                          vadStatus?.state === InterruptionState.RESUMED ||
                          vadStatus?.interruptedAt !== undefined
    
    return {
      ...response,
      source: response.source || 'primary',
      interruption: {
        wasInterrupted,
        interruptionCount: vadStatus?.retryCount || 0,
        totalInterruptionTime: activeCall?.totalInterruptionTime || 0,
        finalState: vadStatus?.state || InterruptionState.COMPLETED,
        vadSignalCount: activeCall?.vadSignalCount || 0
      },
      metadata: {
        ...response.metadata,
        performance: {
          ...response.metadata.performance,
          interruptionOverhead: activeCall?.totalInterruptionTime || 0
        },
        context: {
          ...response.metadata.context,
          vadSignals: vadStatus?.vadSignals || []
        }
      }
    }
  }
  
  private createErrorResponse(
    toolName: string,
    executionTime: number,
    error: Error
  ): InterruptibleToolCallResponse {
    return {
      success: false,
      toolName,
      executionTime,
      source: 'primary',
      confidence: 0,
      interruption: {
        wasInterrupted: false,
        interruptionCount: 0,
        totalInterruptionTime: 0,
        finalState: InterruptionState.FAILED,
        vadSignalCount: 0
      },
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
        retryable: false
      },
      metadata: {
        quota: { used: 0, remaining: 0 },
        performance: {
          apiResponseTime: executionTime,
          cacheHitRate: 0,
          fallbackUsed: false,
          interruptionOverhead: 0
        },
        context: {}
      }
    }
  }
  
  private generateToolCallId(): string {
    return `tc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
  
  private setupEventHandlers(): void {
    // Forward tool call handler events
    this.toolCallHandler.on('tool_call_success', (data) => {
      this.emit('enhanced_tool_call_success', data)
    })
    
    this.toolCallHandler.on('tool_call_error', (data) => {
      this.emit('enhanced_tool_call_error', data)
    })
    
    // Forward VAD handler events
    this.vadHandler.on('tool_call_interrupted', (data) => {
      const activeCall = this.activeToolCalls.get(data.toolCallId)
      if (activeCall) {
        activeCall.interruptionStartTime = Date.now()
      }
      this.emit('vad_interruption', data)
    })
    
    this.vadHandler.on('tool_call_resumed', (data) => {
      const activeCall = this.activeToolCalls.get(data.toolCallId)
      if (activeCall && activeCall.interruptionStartTime) {
        const interruptionDuration = Date.now() - activeCall.interruptionStartTime
        activeCall.totalInterruptionTime += interruptionDuration
        activeCall.interruptionStartTime = undefined
      }
      this.emit('vad_resumption', data)
    })
    
    this.vadHandler.on('tool_call_cancelled', (data) => {
      this.activeToolCalls.delete(data.toolCallId)
      this.checkpointManager.removeCheckpoint(data.toolCallId)
      this.emit('vad_cancellation', data)
    })
  }
}

export default InterruptibleToolCallHandler