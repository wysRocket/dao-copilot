/**
 * WebSocketTranscriptionRouter
 * 
 * Automatically routes WebSocket transcriptions to the streaming renderer
 * instead of static display. Provides intelligent routing decisions based
 * on transcription source and current system state.
 */

import { 
  isWebSocketTranscription, 
  getTranscriptionSourceInfo,
  hasWebSocketCharacteristics
} from '../utils/transcription-detection'
import { TranscriptionWithSource } from './TranscriptionSourceManager'

export interface RouterConfiguration {
  enableWebSocketPriority: boolean
  enableAutoRouting: boolean
  fallbackToStatic: boolean
  queueNonWebSocketStreaming: boolean
  maxQueueSize: number
  routingDebugMode: boolean
}

export interface RoutingDecision {
  action: 'route-to-streaming' | 'route-to-static' | 'queue' | 'drop' | 'merge'
  priority: number
  shouldInterrupt: boolean
  reason: string
  metadata: {
    isWebSocket: boolean
    isStreaming: boolean
    isBatch: boolean
    hasActiveStream: boolean
    queuePosition?: number
  }
}

export interface StreamingTarget {
  startStreamingTranscription: (transcription: TranscriptionWithSource) => void
  updateStreamingTranscription: (transcription: TranscriptionWithSource) => void
  completeStreamingTranscription: (transcription: TranscriptionWithSource) => void
  isStreamingActive: boolean
  currentStreamingSource?: string
}

export interface StaticTarget {
  addStaticTranscription: (transcription: TranscriptionWithSource) => void
  appendToLastTranscription: (text: string) => void
  updateTranscription: (id: string, transcription: TranscriptionWithSource) => void
}

export class WebSocketTranscriptionRouter {
  private config: RouterConfiguration
  private streamingTarget: StreamingTarget | null = null
  private staticTarget: StaticTarget | null = null
  private transcriptionQueue: TranscriptionWithSource[] = []
  private activeStreamingSource: string | null = null
  private routingHistory: Array<{
    transcription: TranscriptionWithSource
    decision: RoutingDecision
    timestamp: number
  }> = []

  constructor(config: Partial<RouterConfiguration> = {}) {
    this.config = {
      enableWebSocketPriority: true,
      enableAutoRouting: true,
      fallbackToStatic: true,
      queueNonWebSocketStreaming: true,
      maxQueueSize: 10,
      routingDebugMode: false,
      ...config
    }
  }

  /**
   * Register streaming target (e.g., StreamingTextContext)
   */
  setStreamingTarget(target: StreamingTarget): void {
    this.streamingTarget = target
    if (this.config.routingDebugMode) {
      console.log('🔀 Router: Streaming target registered')
    }
  }

  /**
   * Register static target (e.g., MultiWindowContext)
   */
  setStaticTarget(target: StaticTarget): void {
    this.staticTarget = target
    if (this.config.routingDebugMode) {
      console.log('🔀 Router: Static target registered')
    }
  }

  /**
   * Main routing method - determines where to send a transcription
   */
  routeTranscription(transcription: TranscriptionWithSource): RoutingDecision {
    const sourceInfo = getTranscriptionSourceInfo(transcription.source)
    const currentState = this.getCurrentSystemState()
    
    if (this.config.routingDebugMode) {
      console.log('🔀 Router: Routing transcription:', {
        source: transcription.source,
        text: transcription.text.substring(0, 50) + '...',
        sourceInfo,
        currentState
      })
    }

    // Create routing decision
    const decision = this.createRoutingDecision(transcription, sourceInfo, currentState)
    
    // Execute the routing decision
    this.executeRoutingDecision(transcription, decision)
    
    // Store in history for debugging
    this.routingHistory.push({
      transcription,
      decision,
      timestamp: Date.now()
    })

    // Keep history manageable
    if (this.routingHistory.length > 100) {
      this.routingHistory.splice(0, 50)
    }

    return decision
  }

  /**
   * Create routing decision based on transcription and system state
   */
  private createRoutingDecision(
    transcription: TranscriptionWithSource,
    sourceInfo: ReturnType<typeof getTranscriptionSourceInfo>,
    currentState: ReturnType<typeof this.getCurrentSystemState>
  ): RoutingDecision {
    // WebSocket transcriptions get highest priority
    if (sourceInfo.isWebSocket) {
      return {
        action: 'route-to-streaming',
        priority: 1,
        shouldInterrupt: true,
        reason: 'WebSocket transcription routes to streaming with interrupt capability',
        metadata: {
          isWebSocket: true,
          isStreaming: false,
          isBatch: false,
          hasActiveStream: currentState.hasActiveStreaming
        }
      }
    }

    // Handle streaming transcriptions
    if (sourceInfo.isStreaming) {
      // If WebSocket is active, queue the streaming transcription
      if (currentState.activeStreamingSource && isWebSocketTranscription(currentState.activeStreamingSource)) {
        if (this.transcriptionQueue.length < this.config.maxQueueSize) {
          return {
            action: 'queue',
            priority: 2,
            shouldInterrupt: false,
            reason: 'Streaming transcription queued due to active WebSocket stream',
            metadata: {
              isWebSocket: false,
              isStreaming: true,
              isBatch: false,
              hasActiveStream: true,
              queuePosition: this.transcriptionQueue.length
            }
          }
        } else {
          return {
            action: 'route-to-static',
            priority: 2,
            shouldInterrupt: false,
            reason: 'Queue full, routing streaming transcription to static display',
            metadata: {
              isWebSocket: false,
              isStreaming: true,
              isBatch: false,
              hasActiveStream: true
            }
          }
        }
      }

      // Route to streaming if no WebSocket is active
      return {
        action: 'route-to-streaming',
        priority: 2,
        shouldInterrupt: false,
        reason: 'Streaming transcription routes to streaming renderer',
        metadata: {
          isWebSocket: false,
          isStreaming: true,
          isBatch: false,
          hasActiveStream: currentState.hasActiveStreaming
        }
      }
    }

    // Handle batch transcriptions
    if (sourceInfo.isBatch) {
      // Check if it has WebSocket characteristics despite batch source
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (hasWebSocketCharacteristics(transcription as any)) {
        if (this.config.routingDebugMode) {
          console.log('🔀 Router: Batch transcription has WebSocket characteristics, upgrading to streaming')
        }
        
        return {
          action: 'route-to-streaming',
          priority: 1.5,
          shouldInterrupt: false,
          reason: 'Batch transcription with WebSocket characteristics upgraded to streaming',
          metadata: {
            isWebSocket: false,
            isStreaming: true,
            isBatch: true,
            hasActiveStream: currentState.hasActiveStreaming
          }
        }
      }

      return {
        action: 'route-to-static',
        priority: 3,
        shouldInterrupt: false,
        reason: 'Batch transcription routes to static display',
        metadata: {
          isWebSocket: false,
          isStreaming: false,
          isBatch: true,
          hasActiveStream: currentState.hasActiveStreaming
        }
      }
    }

    // Fallback for unknown sources
    return {
      action: this.config.fallbackToStatic ? 'route-to-static' : 'drop',
      priority: 4,
      shouldInterrupt: false,
      reason: 'Unknown source type, using fallback behavior',
      metadata: {
        isWebSocket: false,
        isStreaming: false,
        isBatch: false,
        hasActiveStream: currentState.hasActiveStreaming
      }
    }
  }

  /**
   * Execute the routing decision
   */
  private executeRoutingDecision(
    transcription: TranscriptionWithSource,
    decision: RoutingDecision
  ): void {
    if (this.config.routingDebugMode) {
      console.log('🔀 Router: Executing decision:', decision.action, 'for', transcription.source)
    }

    switch (decision.action) {
      case 'route-to-streaming':
        this.routeToStreaming(transcription, decision.shouldInterrupt)
        break

      case 'route-to-static':
        this.routeToStatic(transcription)
        break

      case 'queue':
        this.addToQueue(transcription)
        break

      case 'merge':
        this.mergeWithCurrent(transcription)
        break

      case 'drop':
        if (this.config.routingDebugMode) {
          console.log('🔀 Router: Dropping transcription:', transcription.text.substring(0, 50))
        }
        break
    }
  }

  /**
   * Route transcription to streaming target
   */
  private routeToStreaming(transcription: TranscriptionWithSource, shouldInterrupt: boolean): void {
    if (!this.streamingTarget) {
      if (this.config.routingDebugMode) {
        console.warn('🔀 Router: No streaming target available, falling back to static')
      }
      this.routeToStatic(transcription)
      return
    }

    try {
      if (shouldInterrupt && this.streamingTarget.isStreamingActive) {
        // Complete current stream before starting new one
        if (this.config.routingDebugMode) {
          console.log('🔀 Router: Interrupting current stream for higher priority transcription')
        }
        // The streaming target should handle the interruption
      }

      this.streamingTarget.startStreamingTranscription(transcription)
      this.activeStreamingSource = transcription.source
      
      if (this.config.routingDebugMode) {
        console.log('🔀 Router: ✅ Routed to streaming:', transcription.text.substring(0, 50) + '...')
      }
    } catch (error) {
      console.error('🔀 Router: Error routing to streaming:', error)
      if (this.config.fallbackToStatic) {
        this.routeToStatic(transcription)
      }
    }
  }

  /**
   * Route transcription to static target
   */
  private routeToStatic(transcription: TranscriptionWithSource): void {
    if (!this.staticTarget) {
      console.warn('🔀 Router: No static target available, transcription lost')
      return
    }

    try {
      this.staticTarget.addStaticTranscription(transcription)
      
      if (this.config.routingDebugMode) {
        console.log('🔀 Router: ✅ Routed to static:', transcription.text.substring(0, 50) + '...')
      }
    } catch (error) {
      console.error('🔀 Router: Error routing to static:', error)
    }
  }

  /**
   * Add transcription to queue
   */
  private addToQueue(transcription: TranscriptionWithSource): void {
    if (this.transcriptionQueue.length >= this.config.maxQueueSize) {
      // Remove oldest if queue is full
      this.transcriptionQueue.shift()
    }

    this.transcriptionQueue.push(transcription)
    
    if (this.config.routingDebugMode) {
      console.log('🔀 Router: ✅ Added to queue:', transcription.text.substring(0, 50) + '...', 
                  `(${this.transcriptionQueue.length}/${this.config.maxQueueSize})`)
    }
  }

  /**
   * Merge transcription with current streaming transcription
   */
  private mergeWithCurrent(transcription: TranscriptionWithSource): void {
    if (!this.streamingTarget || !this.streamingTarget.isStreamingActive) {
      // No active stream to merge with, route to static
      this.routeToStatic(transcription)
      return
    }

    try {
      this.streamingTarget.updateStreamingTranscription(transcription)
      
      if (this.config.routingDebugMode) {
        console.log('🔀 Router: ✅ Merged with current stream:', transcription.text.substring(0, 50) + '...')
      }
    } catch (error) {
      console.error('🔀 Router: Error merging with current stream:', error)
      this.routeToStatic(transcription)
    }
  }

  /**
   * Process queued transcriptions when streaming becomes available
   */
  processQueue(): void {
    if (!this.streamingTarget || this.streamingTarget.isStreamingActive || this.transcriptionQueue.length === 0) {
      return
    }

    const nextTranscription = this.transcriptionQueue.shift()
    if (nextTranscription) {
      if (this.config.routingDebugMode) {
        console.log('🔀 Router: Processing queued transcription:', nextTranscription.text.substring(0, 50) + '...')
      }
      this.routeToStreaming(nextTranscription, false)
    }
  }

  /**
   * Handle completion of streaming transcription
   */
  onStreamingComplete(source: string): void {
    if (this.activeStreamingSource === source) {
      this.activeStreamingSource = null
      
      if (this.config.routingDebugMode) {
        console.log('🔀 Router: Streaming completed for source:', source)
      }
      
      // Process next item in queue
      setTimeout(() => this.processQueue(), 100)
    }
  }

  /**
   * Get current system state for routing decisions
   */
  private getCurrentSystemState() {
    return {
      hasActiveStreaming: this.streamingTarget?.isStreamingActive || false,
      activeStreamingSource: this.activeStreamingSource,
      queueLength: this.transcriptionQueue.length,
      hasStreamingTarget: !!this.streamingTarget,
      hasStaticTarget: !!this.staticTarget
    }
  }

  /**
   * Get router statistics
   */
  getStats() {
    const recentHistory = this.routingHistory.slice(-50)
    const actionCounts = recentHistory.reduce((acc, entry) => {
      acc[entry.decision.action] = (acc[entry.decision.action] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      queueLength: this.transcriptionQueue.length,
      activeStreamingSource: this.activeStreamingSource,
      recentActions: actionCounts,
      totalRoutingDecisions: this.routingHistory.length,
      config: this.config
    }
  }

  /**
   * Clear router state
   */
  reset(): void {
    this.transcriptionQueue = []
    this.activeStreamingSource = null
    this.routingHistory = []
    
    if (this.config.routingDebugMode) {
      console.log('🔀 Router: State reset')
    }
  }

  /**
   * Update router configuration
   */
  updateConfig(newConfig: Partial<RouterConfiguration>): void {
    this.config = { ...this.config, ...newConfig }
    
    if (this.config.routingDebugMode) {
      console.log('🔀 Router: Configuration updated:', this.config)
    }
  }
}

// Singleton instance for global use
let globalRouter: WebSocketTranscriptionRouter | null = null

/**
 * Get the global WebSocketTranscriptionRouter instance
 */
export function getWebSocketRouter(): WebSocketTranscriptionRouter {
  if (!globalRouter) {
    globalRouter = new WebSocketTranscriptionRouter({
      enableWebSocketPriority: true,
      enableAutoRouting: true,
      fallbackToStatic: true,
      queueNonWebSocketStreaming: true,
      maxQueueSize: 5,
      routingDebugMode: process.env.NODE_ENV === 'development'
    })
  }
  return globalRouter
}

/**
 * Reset the global router instance
 */
export function resetWebSocketRouter(): void {
  globalRouter?.reset()
  globalRouter = null
}
