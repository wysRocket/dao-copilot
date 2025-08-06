/**
 * Enhanced Transcription Integration Component
 *
 * Integrates all enhanced transcription components with the existing system:
 * - Enhanced router with performance optimization
 * - Configuration management
 * - Performance monitoring
 * - Timestamp tracking and gap detection
 * - Virtual scrolling renderer
 */

import React, {useEffect, useRef, useCallback, useState} from 'react'
import {PerformanceOptimizedTranscriptionRenderer} from './PerformanceOptimizedTranscriptionRenderer'
import {
  EnhancedTranscriptionRouter,
  getEnhancedRouter
} from '../services/EnhancedTranscriptionRouter'
import {
  getTranscriptionConfig,
  TranscriptionConfigManager,
  CompleteTranscriptionConfig
} from '../services/TranscriptionConfigManager'
import {useEnhancedLiveTranscription} from '../hooks/useEnhancedLiveTranscription'
import {TranscriptionWithSource} from '../services/TranscriptionSourceManager'
import {TranscriptionSegment} from '../services/LiveTranscriptionBuffer'
import {PerformanceAlert} from '../services/TranscriptionPerformanceMonitor'

export interface EnhancedTranscriptionIntegrationProps {
  // Core transcription props
  className?: string
  style?: React.CSSProperties

  // Configuration
  configOverrides?: object
  enableConfiguration?: boolean

  // Callbacks
  onSegmentAdded?: (segment: TranscriptionSegment) => void
  onSessionStart?: () => void
  onSessionEnd?: (analysis: object) => void
  onPerformanceAlert?: (alert: PerformanceAlert) => void
  onConfigChange?: (config: CompleteTranscriptionConfig) => void

  // Integration settings
  enableDebugMode?: boolean
  enableTelemetry?: boolean
  fallbackToLegacy?: boolean
}

export const EnhancedTranscriptionIntegration: React.FC<EnhancedTranscriptionIntegrationProps> = ({
  className,
  style,
  configOverrides = {},
  enableConfiguration = true,
  onSegmentAdded,
  onSessionStart,
  onSessionEnd,
  onPerformanceAlert,
  onConfigChange,
  enableDebugMode = false,
  enableTelemetry = true,
  fallbackToLegacy = true
}) => {
  // Configuration management
  const configManager = useRef<TranscriptionConfigManager | null>(null)
  const router = useRef<EnhancedTranscriptionRouter | null>(null)

  // Component state
  const [isInitialized, setIsInitialized] = useState(false)
  const [currentConfig, setCurrentConfig] = useState<CompleteTranscriptionConfig | null>(null)
  const [performanceAlerts, setPerformanceAlerts] = useState<PerformanceAlert[]>([])

  // Enhanced transcription hook
  const {
    state,
    addSegment,
    startSession,
    endSession,
    isActive,
    timelineAnalysis,
    getSessionAnalysis
  } = useEnhancedLiveTranscription({
    timestampTracking: true,
    timestampTrackingConfig: {
      gapDetectionThreshold: 1000,
      maxAcceptableGap: 5000,
      estimationStrategy: 'adaptive',
      enableGapFilling: false,
      timelinePrecision: 100
    }
  })

  /**
   * Initialize the integration system
   */
  const initializeIntegration = useCallback(() => {
    try {
      // Initialize configuration manager
      configManager.current = getTranscriptionConfig(configOverrides)
      const config = configManager.current.getConfig()

      // Initialize enhanced router
      router.current = getEnhancedRouter(config.router)

      // Set up enhanced streaming target
      const enhancedTarget = {
        // Base StreamingTarget interface
        startStreamingTranscription: (transcription: TranscriptionWithSource) => {
          if (enableDebugMode) {
            console.log('🚀 Integration: Starting transcription stream:', transcription)
          }
          startSession()
          addSegment(transcription.text, true, transcription.source, transcription.timestamp)
        },

        updateStreamingTranscription: (transcription: TranscriptionWithSource) => {
          if (enableDebugMode) {
            console.log('🚀 Integration: Updating transcription stream:', transcription)
          }
          addSegment(transcription.text, true, transcription.source, transcription.timestamp)
        },

        completeStreamingTranscription: (transcription: TranscriptionWithSource) => {
          if (enableDebugMode) {
            console.log('🚀 Integration: Completing transcription stream:', transcription)
          }
          addSegment(transcription.text, false, transcription.source, transcription.timestamp)

          // Get session analysis
          const analysis = getSessionAnalysis()
          if (analysis) {
            onSessionEnd?.(analysis)
          }
        },

        isStreamingActive: isActive,
        currentStreamingSource: undefined, // This isn't available in the state

        // Enhanced methods
        startEnhancedStreaming: (transcription: TranscriptionWithSource, routerConfig?: object) => {
          if (enableDebugMode) {
            console.log('🚀 Integration: Starting enhanced stream with config:', routerConfig)
          }

          // Update router configuration if provided
          if (routerConfig && router.current) {
            router.current.updateConfiguration(routerConfig)
          }

          startSession()
          addSegment(transcription.text, true, transcription.source, transcription.timestamp)
          onSessionStart?.()
        },

        updateWithTimestamp: (transcription: TranscriptionWithSource, timestamp?: number) => {
          const actualTimestamp = timestamp || transcription.timestamp || Date.now()
          addSegment(transcription.text, true, transcription.source, actualTimestamp)
        },

        handlePartialResult: (transcription: TranscriptionWithSource, isPartial: boolean) => {
          addSegment(transcription.text, isPartial, transcription.source, transcription.timestamp)

          if (onSegmentAdded && state.segments.length > 0) {
            onSegmentAdded(state.segments[state.segments.length - 1])
          }
        },

        completeWithAnalysis: (transcription: TranscriptionWithSource, analysis?: object) => {
          addSegment(transcription.text, false, transcription.source, transcription.timestamp)

          const sessionAnalysis = analysis || getSessionAnalysis()
          if (sessionAnalysis) {
            onSessionEnd?.(sessionAnalysis)
          }
        },

        // Performance monitoring
        getPerformanceMetrics: () => {
          return router.current?.getRouterStatus()?.performance || {}
        },

        isPerformanceOptimized: true,

        // Buffer management
        getBufferState: () => {
          return {
            segmentCount: state.segments.length,
            currentText: state.currentText,
            isActive: isActive,
            totalCharacters: state.segments.reduce((total, seg) => total + seg.text.length, 0)
          }
        },

        clearBuffer: () => {
          // Buffer clearing would need to be implemented in the hook
          console.log('🚀 Integration: Buffer clear requested')
        },

        getSegmentCount: () => state.segments.length
      }

      // Register the enhanced target with the router
      router.current.setEnhancedStreamingTarget(enhancedTarget)

      // Set up configuration listener
      if (enableConfiguration && configManager.current) {
        configManager.current.addListener(config => {
          setCurrentConfig(config)

          // Update router configuration
          if (router.current) {
            router.current.updateConfiguration(config.router)
          }

          onConfigChange?.(config)
        })

        setCurrentConfig(config)
      }

      setIsInitialized(true)

      if (enableDebugMode) {
        console.log('🚀 Integration: System initialized successfully', {
          config: config,
          router: router.current.getRouterStatus()
        })
      }
    } catch (error) {
      console.error('🚀 Integration: Failed to initialize:', error)

      if (fallbackToLegacy) {
        console.log('🚀 Integration: Falling back to legacy mode')
        setIsInitialized(true) // Allow basic functionality
      }
    }
  }, [
    configOverrides,
    enableConfiguration,
    enableDebugMode,
    fallbackToLegacy,
    addSegment,
    startSession,
    endSession,
    isActive,
    state,
    getSessionAnalysis,
    onSegmentAdded,
    onSessionStart,
    onSessionEnd,
    onConfigChange
  ])

  /**
   * Handle performance alerts
   */
  const handlePerformanceAlert = useCallback(
    (alert: PerformanceAlert) => {
      setPerformanceAlerts(prev => [...prev, alert])
      onPerformanceAlert?.(alert)

      if (enableDebugMode) {
        console.log('🚀 Integration: Performance alert:', alert)
      }
    },
    [onPerformanceAlert, enableDebugMode]
  )

  // Method available for external transcription processing (via ref or future props)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const processTranscription = useCallback(
    (transcription: TranscriptionWithSource) => {
      if (!router.current || !isInitialized) {
        console.warn('🚀 Integration: Router not initialized, skipping transcription')
        return
      }

      try {
        const decision = router.current.routeTranscription(transcription)

        if (enableDebugMode) {
          console.log('🚀 Integration: Routing decision:', decision)
        }

        // The routing is handled automatically by the router
        // This method is available for external transcription processing
      } catch (error) {
        console.error('🚀 Integration: Error processing transcription:', error)

        if (fallbackToLegacy) {
          // Fallback to direct segment addition
          addSegment(transcription.text, true, transcription.source, transcription.timestamp)
        }
      }
    },
    [router, isInitialized, enableDebugMode, fallbackToLegacy, addSegment]
  )

  // Initialize on mount
  useEffect(() => {
    initializeIntegration()

    // Cleanup on unmount
    return () => {
      if (router.current) {
        router.current.cleanup()
      }
    }
  }, [initializeIntegration])

  // Performance monitoring effect
  useEffect(() => {
    if (!isInitialized || !router.current) return

    const interval = setInterval(() => {
      try {
        const status = router.current!.getRouterStatus()

        if (status.performance && enableTelemetry) {
          // Check for performance issues
          const alerts = status.performance.alertHistory || []
          const newAlerts = alerts.filter(
            (alert: PerformanceAlert) =>
              !performanceAlerts.some(existing => existing.id === alert.id)
          )

          newAlerts.forEach(handlePerformanceAlert)
        }
      } catch (error) {
        console.error('🚀 Integration: Performance monitoring error:', error)
      }
    }, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [isInitialized, enableTelemetry, performanceAlerts, handlePerformanceAlert])

  // Render the enhanced transcription display
  if (!isInitialized) {
    return (
      <div className={`enhanced-transcription-loading ${className || ''}`} style={style}>
        <div className="loading-indicator">Initializing Enhanced Transcription System...</div>
      </div>
    )
  }

  return (
    <div className={`enhanced-transcription-integration ${className || ''}`} style={style}>
      <PerformanceOptimizedTranscriptionRenderer
        segments={state.segments}
        currentText={state.currentText}
        isStreaming={isActive}
        config={{
          virtualScrolling: currentConfig?.router?.enableVirtualScrolling ?? true,
          containerHeight: 400,
          itemHeight: 30,
          overscan: 5,
          renderBatchSize: 20,
          updateThrottle: 16,
          maxVisibleSegments: 50,
          enableProfiling: enableDebugMode,
          logPerformanceMetrics: enableDebugMode
        }}
        className="enhanced-transcription-renderer"
      />

      {enableDebugMode && (
        <div
          className="integration-debug-panel"
          style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            padding: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            borderRadius: '5px',
            fontSize: '12px',
            maxWidth: '300px',
            zIndex: 9999
          }}
        >
          <div>
            <strong>Enhanced Transcription Debug</strong>
          </div>
          <div>Segments: {state.segments.length}</div>
          <div>Active: {isActive ? 'Yes' : 'No'}</div>
          <div>Alerts: {performanceAlerts.length}</div>
          {timelineAnalysis && <div>Gaps: {timelineAnalysis.gaps?.length || 0}</div>}
        </div>
      )}
    </div>
  )
}

export default EnhancedTranscriptionIntegration
