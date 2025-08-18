/**
 * Enhanced Transcription Router
 *
 * Integrates the enhanced live transcription system (with performance optimization,
 * timestamp tracking, and gap detection) with the existing WebSocketTranscriptionRouter.
 * Provides seamless routing between enhanced and legacy transcription systems.
 */

import {
  WebSocketTranscriptionRouter,
  RouterConfiguration,
  RoutingDecision,
  StreamingTarget
} from './WebSocketTranscriptionRouter'
import {EnhancedLiveTranscriptionBuffer} from '../services/EnhancedLiveTranscriptionBuffer'
import {TranscriptionPerformanceMonitor} from '../services/TranscriptionPerformanceMonitor'
import {TranscriptionWithSource} from './TranscriptionSourceManager'

export interface EnhancedRouterConfiguration extends RouterConfiguration {
  // Enhanced features
  enablePerformanceOptimization: boolean
  enableTimestampTracking: boolean
  enableGapDetection: boolean
  enableVirtualScrolling: boolean
  enablePerformanceMonitoring: boolean

  // Buffer configuration
  maxBufferSize: number
  segmentRetentionTime: number
  partialResultTimeout: number

  // Performance thresholds
  maxRenderTime: number
  maxMemoryUsage: number
  minFrameRate: number

  // Gap detection settings
  gapDetectionThreshold: number
  maxAcceptableGap: number
  enableAdaptiveGapDetection: boolean

  // Integration settings
  fallbackToLegacyRenderer: boolean
  enableHybridMode: boolean
  legacyCompatibilityMode: boolean
}

export interface EnhancedStreamingTarget extends StreamingTarget {
  // Enhanced streaming methods
  startEnhancedStreaming: (
    transcription: TranscriptionWithSource,
    config?: Partial<EnhancedRouterConfiguration>
  ) => void
  updateWithTimestamp: (transcription: TranscriptionWithSource, timestamp?: number) => void
  handlePartialResult: (transcription: TranscriptionWithSource, isPartial: boolean) => void
  completeWithAnalysis: (transcription: TranscriptionWithSource, analysis?: object) => void

  // Performance monitoring
  getPerformanceMetrics: () => object
  isPerformanceOptimized: boolean

  // Buffer management
  getBufferState: () => object
  clearBuffer: () => void
  getSegmentCount: () => number
}

export class EnhancedTranscriptionRouter extends WebSocketTranscriptionRouter {
  private enhancedConfig: EnhancedRouterConfiguration
  private performanceMonitor: TranscriptionPerformanceMonitor
  private enhancedTarget: EnhancedStreamingTarget | null = null
  private bufferInstances: Map<string, EnhancedLiveTranscriptionBuffer> = new Map()

  constructor(config: Partial<EnhancedRouterConfiguration> = {}) {
    // Initialize base router with enhanced config
    super(config)

    this.enhancedConfig = {
      // Base router config
      enableWebSocketPriority: true,
      enableAutoRouting: true,
      fallbackToStatic: true,
      queueNonWebSocketStreaming: true,
      maxQueueSize: 10,
      routingDebugMode: false,

      // Enhanced features
      enablePerformanceOptimization: true,
      enableTimestampTracking: true,
      enableGapDetection: true,
      enableVirtualScrolling: true,
      enablePerformanceMonitoring: true,

      // Buffer configuration
      maxBufferSize: 1000,
      segmentRetentionTime: 30000, // 30 seconds
      partialResultTimeout: 5000, // 5 seconds

      // Performance thresholds
      maxRenderTime: 16, // 60fps = 16ms per frame
      maxMemoryUsage: 100, // 100MB
      minFrameRate: 30,

      // Gap detection settings
      gapDetectionThreshold: 1000, // 1 second
      maxAcceptableGap: 5000, // 5 seconds
      enableAdaptiveGapDetection: true,

      // Integration settings
      fallbackToLegacyRenderer: true,
      enableHybridMode: true,
      legacyCompatibilityMode: false,

      ...config
    }

    // Initialize performance monitoring
    this.performanceMonitor = new TranscriptionPerformanceMonitor({
      maxRenderTime: this.enhancedConfig.maxRenderTime,
      maxMemoryUsage: this.enhancedConfig.maxMemoryUsage,
      minFrameRate: this.enhancedConfig.minFrameRate,
      memoryGrowthRate: 5, // 5MB/minute default
      renderTimeVariance: 5 // 5ms variance default
    })

    if (this.enhancedConfig.routingDebugMode) {
      console.log('🚀 Enhanced Router: Initialized with config:', this.enhancedConfig)
    }
  }

  /**
   * Register enhanced streaming target with performance optimization capabilities
   */
  setEnhancedStreamingTarget(target: EnhancedStreamingTarget): void {
    this.enhancedTarget = target

    // Also register with base router for backward compatibility
    this.setStreamingTarget(target)

    if (this.enhancedConfig.routingDebugMode) {
      console.log('🚀 Enhanced Router: Enhanced streaming target registered')
    }
  }

  /**
   * Enhanced routing method that considers performance and timestamp requirements
   */
  routeTranscription(transcription: TranscriptionWithSource): RoutingDecision {
    // Get base routing decision
    const baseDecision = super.routeTranscription(transcription)

    // Enhance decision with performance considerations
    const enhancedDecision = this.enhanceRoutingDecision(transcription, baseDecision)

    // Execute enhanced routing if available
    if (this.shouldUseEnhancedRouting(transcription, enhancedDecision)) {
      this.executeEnhancedRouting(transcription, enhancedDecision)
    }

    return enhancedDecision
  }

  /**
   * Determine if enhanced routing should be used
   */
  private shouldUseEnhancedRouting(
    transcription: TranscriptionWithSource,
    decision: RoutingDecision
  ): boolean {
    // Use enhanced routing if:
    // 1. Enhanced target is available
    // 2. Performance optimization is enabled
    // 3. Not in legacy compatibility mode
    // 4. Transcription would benefit from enhanced features

    if (!this.enhancedTarget || this.enhancedConfig.legacyCompatibilityMode) {
      return false
    }

    if (!this.enhancedConfig.enablePerformanceOptimization) {
      return false
    }

    // Check if transcription would benefit from enhanced features
    const isLongText = transcription.text.length > 500
    const isStreamingDecision = decision.action === 'route-to-streaming'
    const hasTimestampData = transcription.timestamp !== undefined

    return (
      isStreamingDecision &&
      (isLongText || hasTimestampData || this.enhancedConfig.enableTimestampTracking)
    )
  }

  /**
   * Enhance the base routing decision with performance considerations
   */
  private enhanceRoutingDecision(
    transcription: TranscriptionWithSource,
    baseDecision: RoutingDecision
  ): RoutingDecision {
    // Start with base decision
    const enhanced: RoutingDecision = {...baseDecision}

    // Get current performance metrics
    const performanceStats = this.performanceMonitor.getStats()
    const currentAlerts = this.performanceMonitor.getActiveAlerts()

    // Adjust routing based on performance
    if (currentAlerts.length > 0) {
      const hasRenderingAlert = currentAlerts.some(
        alert => alert.category === 'performance' || alert.category === 'responsiveness'
      )

      if (hasRenderingAlert && this.enhancedConfig.fallbackToLegacyRenderer) {
        enhanced.action = 'route-to-static'
        enhanced.reason += ' (Performance fallback: Rendering issues detected)'
        // Enhanced metadata will be handled below
      }
    }

    // Consider text length for virtual scrolling
    if (transcription.text.length > 1000 && this.enhancedConfig.enableVirtualScrolling) {
      enhanced.priority = Math.max(enhanced.priority - 1, 1) // Higher priority for long text
      // Enhanced metadata will be handled below
    }

    // Create enhanced metadata (since we can't modify the base interface)
    const enhancedMetadata = {
      ...enhanced.metadata,
      performanceFallback: currentAlerts.length > 0,
      recommendVirtualScrolling: transcription.text.length > 1000,
      enhancedFeatures: {
        performanceOptimization: this.enhancedConfig.enablePerformanceOptimization,
        timestampTracking: this.enhancedConfig.enableTimestampTracking,
        gapDetection: this.enhancedConfig.enableGapDetection,
        virtualScrolling: this.enhancedConfig.enableVirtualScrolling
      },
      performanceStats: performanceStats
        ? {
            averageRenderTime: performanceStats.averageRenderTime,
            currentMemoryUsage: performanceStats.averageMemoryUsage,
            frameRate: performanceStats.averageFrameRate
          }
        : undefined
    }

    // Return enhanced decision with new metadata
    return {
      ...enhanced,
      metadata: enhancedMetadata
    }
  }

  /**
   * Execute enhanced routing with performance optimization
   */
  private executeEnhancedRouting(
    transcription: TranscriptionWithSource,
    decision: RoutingDecision
  ): void {
    if (!this.enhancedTarget) return

    try {
      // Get or create buffer for this source (for future use)
      this.getOrCreateBuffer(transcription.source)

      // Record performance metrics
      const startTime = performance.now()

      switch (decision.action) {
        case 'route-to-streaming':
          if (this.enhancedConfig.enableTimestampTracking) {
            this.enhancedTarget.updateWithTimestamp(transcription, transcription.timestamp)
          } else {
            this.enhancedTarget.startEnhancedStreaming(transcription, this.enhancedConfig)
          }
          break

        case 'route-to-static':
          // For static routing, we don't have the addStaticTranscription method
          // in EnhancedStreamingTarget, so we skip enhanced handling
          console.log('🚀 Enhanced Router: Routing to static (handled by base router)')
          break

        default:
          // Handle other actions with base router
          break
      }

      // Record routing performance
      const routingTime = performance.now() - startTime
      this.performanceMonitor.recordRender(
        routingTime,
        transcription.text.length,
        1 // One visible segment (the routing operation)
      )
    } catch (error) {
      console.error('🚀 Enhanced Router: Error in enhanced routing:', error)

      // Fallback to base routing
      if (this.enhancedConfig.fallbackToLegacyRenderer) {
        console.log('🚀 Enhanced Router: Falling back to legacy routing')
        // The base router already executed, so we don't need to do anything
      }
    }
  }

  /**
   * Get or create buffer instance for a transcription source
   */
  private getOrCreateBuffer(source: string): EnhancedLiveTranscriptionBuffer {
    if (!this.bufferInstances.has(source)) {
      const buffer = new EnhancedLiveTranscriptionBuffer({
        maxSegments: this.enhancedConfig.maxBufferSize,
        timestampTrackingConfig: {
          gapDetectionThreshold: this.enhancedConfig.gapDetectionThreshold,
          maxAcceptableGap: this.enhancedConfig.maxAcceptableGap,
          estimationStrategy: 'adaptive',
          enableGapFilling: false,
          timelinePrecision: 100
        }
      })

      this.bufferInstances.set(source, buffer)
    }

    return this.bufferInstances.get(source)!
  }

  /**
   * Update configuration at runtime
   */
  updateConfiguration(config: Partial<EnhancedRouterConfiguration>): void {
    this.enhancedConfig = {...this.enhancedConfig, ...config}

    // Update performance monitor thresholds
    if (config.maxRenderTime || config.maxMemoryUsage || config.minFrameRate) {
      this.performanceMonitor.updateThresholds({
        maxRenderTime: this.enhancedConfig.maxRenderTime,
        maxMemoryUsage: this.enhancedConfig.maxMemoryUsage,
        minFrameRate: this.enhancedConfig.minFrameRate,
        memoryGrowthRate: 5, // Default values
        renderTimeVariance: 5
      })
    }

    if (this.enhancedConfig.routingDebugMode) {
      console.log('🚀 Enhanced Router: Configuration updated:', config)
    }
  }

  /**
   * Get comprehensive router status
   */
  getRouterStatus() {
    const performanceStats = this.performanceMonitor.getStats()
    const activeBuffers = Array.from(this.bufferInstances.keys())

    return {
      enhancedFeatures: {
        performanceOptimization: this.enhancedConfig.enablePerformanceOptimization,
        timestampTracking: this.enhancedConfig.enableTimestampTracking,
        gapDetection: this.enhancedConfig.enableGapDetection,
        virtualScrolling: this.enhancedConfig.enableVirtualScrolling,
        performanceMonitoring: this.enhancedConfig.enablePerformanceMonitoring
      },
      performance: performanceStats,
      activeBuffers,
      bufferCount: this.bufferInstances.size,
      hasEnhancedTarget: !!this.enhancedTarget
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // Clear all buffers (they don't have cleanup methods)
    this.bufferInstances.clear()

    // Cleanup performance monitor
    this.performanceMonitor.stopMonitoring()

    if (this.enhancedConfig.routingDebugMode) {
      console.log('🚀 Enhanced Router: Cleanup completed')
    }
  }
}

// Global enhanced router instance
let globalEnhancedRouter: EnhancedTranscriptionRouter | null = null

/**
 * Get the global enhanced router instance
 */
export function getEnhancedRouter(
  config?: Partial<EnhancedRouterConfiguration>
): EnhancedTranscriptionRouter {
  if (!globalEnhancedRouter) {
    globalEnhancedRouter = new EnhancedTranscriptionRouter(config)
  }
  return globalEnhancedRouter
}

/**
 * Reset the global enhanced router (useful for testing)
 */
export function resetEnhancedRouter(): void {
  if (globalEnhancedRouter) {
    globalEnhancedRouter.cleanup()
    globalEnhancedRouter = null
  }
}
