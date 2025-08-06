/**
 * Enhanced Performance Hook for Optimized Transcription Startup
 * React hook that implements and manages startup optimizations
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import OptimizedStartupManager, { 
  StartupPhase, 
  type StartupOptimizationConfig, 
  type StartupMetrics 
} from '../services/optimized-startup-manager'
import { GeminiLiveConfig } from '../services/gemini-live-websocket'
import { markPerformance, PERFORMANCE_MARKERS } from '../utils/performance-profiler'

export interface UseOptimizedStartupConfig extends StartupOptimizationConfig {
  autoStartOnMount?: boolean
  enablePerformanceLogging?: boolean
  enableMetricsCollection?: boolean
  fallbackToSequential?: boolean
}

export interface OptimizedStartupState {
  isStarting: boolean
  currentPhase: StartupPhase
  metrics: Partial<StartupMetrics> | null
  error: Error | null
  progress: number // 0-100
  estimatedTimeRemaining: number // milliseconds
  optimizationSuggestions: string[]
}

export interface OptimizedStartupActions {
  startOptimizedSequence: () => Promise<void>
  abortStartup: () => void
  resetState: () => void
  retryWithFallback: () => Promise<void>
  updateConfig: (config: Partial<UseOptimizedStartupConfig>) => void
}

/**
 * Enhanced hook for managing optimized transcription startup
 */
export function useOptimizedStartup(
  geminiConfig: GeminiLiveConfig,
  config: UseOptimizedStartupConfig = {}
): [OptimizedStartupState, OptimizedStartupActions] {
  
  const [state, setState] = useState<OptimizedStartupState>({
    isStarting: false,
    currentPhase: StartupPhase.IDLE,
    metrics: null,
    error: null,
    progress: 0,
    estimatedTimeRemaining: 0,
    optimizationSuggestions: []
  })

  const startupManagerRef = useRef<OptimizedStartupManager | null>(null)
  const configRef = useRef<UseOptimizedStartupConfig>({
    enableParallelInitialization: true,
    enablePreWarming: true,
    enableConnectionPooling: true,
    enableAudioPreInitialization: true,
    enableTranscriptionPreWarming: true,
    connectionTimeout: 3000,
    audioInitTimeout: 1000,
    transcriptionInitTimeout: 500,
    autoStartOnMount: false,
    enablePerformanceLogging: true,
    enableMetricsCollection: true,
    fallbackToSequential: true,
    ...config
  })

  const phaseProgressMap = useRef<Record<StartupPhase, number>>({
    [StartupPhase.IDLE]: 0,
    [StartupPhase.INITIALIZING]: 10,
    [StartupPhase.WEBSOCKET_CONNECTING]: 30,
    [StartupPhase.AUDIO_INITIALIZING]: 60,
    [StartupPhase.TRANSCRIPTION_INITIALIZING]: 80,
    [StartupPhase.READY]: 100,
    [StartupPhase.ERROR]: 0
  })

  const estimatedTimesRef = useRef<Record<StartupPhase, number>>({
    [StartupPhase.IDLE]: 0,
    [StartupPhase.INITIALIZING]: 5000,
    [StartupPhase.WEBSOCKET_CONNECTING]: 3000,
    [StartupPhase.AUDIO_INITIALIZING]: 1000,
    [StartupPhase.TRANSCRIPTION_INITIALIZING]: 500,
    [StartupPhase.READY]: 0,
    [StartupPhase.ERROR]: 0
  })

  /**
   * Initialize startup manager
   */
  const initializeStartupManager = useCallback(() => {
    if (startupManagerRef.current) {
      startupManagerRef.current.destroy()
    }

    startupManagerRef.current = new OptimizedStartupManager(configRef.current)

    // Set up event listeners
    startupManagerRef.current.on('phaseChange', (phase: StartupPhase) => {
      setState(prev => ({
        ...prev,
        currentPhase: phase,
        progress: phaseProgressMap.current[phase],
        estimatedTimeRemaining: estimatedTimesRef.current[phase]
      }))

      if (configRef.current.enablePerformanceLogging) {
        console.log(`[OptimizedStartup] Phase changed to: ${phase}`)
      }
    })

    startupManagerRef.current.on('startupComplete', (metrics: StartupMetrics) => {
      setState(prev => ({
        ...prev,
        isStarting: false,
        metrics,
        error: null,
        progress: 100,
        estimatedTimeRemaining: 0,
        optimizationSuggestions: startupManagerRef.current?.getOptimizationRecommendations() || []
      }))

      if (configRef.current.enablePerformanceLogging) {
        console.log('[OptimizedStartup] Startup completed successfully:', metrics)
      }
    })

    startupManagerRef.current.on('startupError', (error: Error) => {
      setState(prev => ({
        ...prev,
        isStarting: false,
        error,
        currentPhase: StartupPhase.ERROR,
        progress: 0,
        estimatedTimeRemaining: 0
      }))

      if (configRef.current.enablePerformanceLogging) {
        console.error('[OptimizedStartup] Startup failed:', error)
      }
    })

    // Set up additional performance monitoring
    startupManagerRef.current.on('optimizedTranscriptionReceived', (data) => {
      markPerformance(PERFORMANCE_MARKERS.FIRST_TRANSCRIPTION_DISPLAY)
      
      if (configRef.current.enablePerformanceLogging) {
        console.log('[OptimizedStartup] First transcription received:', data)
      }
    })

    startupManagerRef.current.on('optimizedError', (error) => {
      if (configRef.current.enablePerformanceLogging) {
        console.error('[OptimizedStartup] WebSocket error:', error)
      }
    })

  }, [])

  /**
   * Start optimized startup sequence
   */
  const startOptimizedSequence = useCallback(async () => {
    if (state.isStarting) {
      console.warn('[OptimizedStartup] Startup already in progress')
      return
    }

    setState(prev => ({
      ...prev,
      isStarting: true,
      error: null,
      currentPhase: StartupPhase.INITIALIZING,
      progress: 10,
      metrics: null
    }))

    try {
      if (!startupManagerRef.current) {
        initializeStartupManager()
      }

      if (configRef.current.enablePerformanceLogging) {
        console.log('[OptimizedStartup] Starting optimized sequence with config:', configRef.current)
      }

      await startupManagerRef.current!.startOptimizedSequence(geminiConfig)

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      
      setState(prev => ({
        ...prev,
        isStarting: false,
        error: errorObj,
        currentPhase: StartupPhase.ERROR,
        progress: 0
      }))

      // Attempt fallback if enabled
      if (configRef.current.fallbackToSequential && 
          configRef.current.enableParallelInitialization) {
        
        if (configRef.current.enablePerformanceLogging) {
          console.log('[OptimizedStartup] Attempting fallback to sequential initialization')
        }

        setTimeout(() => {
          retryWithFallback()
        }, 1000)
      }

      throw errorObj
    }
  }, [state.isStarting, geminiConfig, initializeStartupManager])

  /**
   * Retry with fallback configuration (sequential initialization)
   */
  const retryWithFallback = useCallback(async () => {
    const fallbackConfig: UseOptimizedStartupConfig = {
      ...configRef.current,
      enableParallelInitialization: false,
      enablePreWarming: false,
      connectionTimeout: 8000,
      audioInitTimeout: 5000,
      transcriptionInitTimeout: 3000
    }

    configRef.current = fallbackConfig

    if (configRef.current.enablePerformanceLogging) {
      console.log('[OptimizedStartup] Retrying with fallback configuration:', fallbackConfig)
    }

    // Reinitialize manager with fallback config
    initializeStartupManager()
    
    // Start the sequence again
    await startOptimizedSequence()
  }, [initializeStartupManager, startOptimizedSequence])

  /**
   * Abort current startup sequence
   */
  const abortStartup = useCallback(() => {
    if (startupManagerRef.current) {
      startupManagerRef.current.abortStartup()
    }

    setState(prev => ({
      ...prev,
      isStarting: false,
      currentPhase: StartupPhase.IDLE,
      progress: 0,
      estimatedTimeRemaining: 0,
      error: null
    }))

    if (configRef.current.enablePerformanceLogging) {
      console.log('[OptimizedStartup] Startup sequence aborted')
    }
  }, [])

  /**
   * Reset state to initial values
   */
  const resetState = useCallback(() => {
    abortStartup()
    
    setState({
      isStarting: false,
      currentPhase: StartupPhase.IDLE,
      metrics: null,
      error: null,
      progress: 0,
      estimatedTimeRemaining: 0,
      optimizationSuggestions: []
    })

    if (configRef.current.enablePerformanceLogging) {
      console.log('[OptimizedStartup] State reset')
    }
  }, [abortStartup])

  /**
   * Update configuration
   */
  const updateConfig = useCallback((newConfig: Partial<UseOptimizedStartupConfig>) => {
    configRef.current = { ...configRef.current, ...newConfig }

    if (configRef.current.enablePerformanceLogging) {
      console.log('[OptimizedStartup] Configuration updated:', newConfig)
    }

    // Reinitialize if not currently starting
    if (!state.isStarting) {
      initializeStartupManager()
    }
  }, [state.isStarting, initializeStartupManager])

  /**
   * Auto-start on mount if enabled
   */
  useEffect(() => {
    if (configRef.current.autoStartOnMount) {
      startOptimizedSequence().catch(error => {
        console.error('[OptimizedStartup] Auto-start failed:', error)
      })
    }

    // Initialize startup manager even if not auto-starting
    initializeStartupManager()

    // Cleanup on unmount
    return () => {
      if (startupManagerRef.current) {
        startupManagerRef.current.destroy()
        startupManagerRef.current = null
      }
    }
  }, []) // Only run once on mount

  /**
   * Update estimated time remaining based on phase changes
   */
  useEffect(() => {
    if (state.isStarting && state.estimatedTimeRemaining > 0) {
      const timer = setInterval(() => {
        setState(prev => ({
          ...prev,
          estimatedTimeRemaining: Math.max(0, prev.estimatedTimeRemaining - 100)
        }))
      }, 100)

      return () => clearInterval(timer)
    }
  }, [state.isStarting, state.currentPhase])

  /**
   * Collect metrics if enabled
   */
  useEffect(() => {
    if (configRef.current.enableMetricsCollection && state.metrics) {
      // Store metrics in localStorage for analysis
      const metricsKey = 'optimized_startup_metrics'
      const existingMetrics = JSON.parse(localStorage.getItem(metricsKey) || '[]')
      const newMetrics = {
        ...state.metrics,
        timestamp: new Date().toISOString(),
        config: configRef.current
      }
      
      existingMetrics.push(newMetrics)
      
      // Keep only last 50 metrics
      if (existingMetrics.length > 50) {
        existingMetrics.splice(0, existingMetrics.length - 50)
      }
      
      localStorage.setItem(metricsKey, JSON.stringify(existingMetrics))

      if (configRef.current.enablePerformanceLogging) {
        console.log('[OptimizedStartup] Metrics collected and stored:', newMetrics)
      }
    }
  }, [state.metrics])

  const actions: OptimizedStartupActions = {
    startOptimizedSequence,
    abortStartup,
    resetState,
    retryWithFallback,
    updateConfig
  }

  return [state, actions]
}

/**
 * Hook to get historical performance metrics
 */
export function useStartupMetricsHistory(): {
  metrics: Array<StartupMetrics & { timestamp: string; config: UseOptimizedStartupConfig }>
  clearHistory: () => void
  getAverageMetrics: () => Partial<StartupMetrics>
  getBestPerformance: () => (StartupMetrics & { timestamp: string }) | null
} {
  const [metrics, setMetrics] = useState<Array<StartupMetrics & { 
    timestamp: string; 
    config: UseOptimizedStartupConfig 
  }>>([])

  useEffect(() => {
    const storedMetrics = JSON.parse(localStorage.getItem('optimized_startup_metrics') || '[]')
    setMetrics(storedMetrics)
  }, [])

  const clearHistory = useCallback(() => {
    localStorage.removeItem('optimized_startup_metrics')
    setMetrics([])
  }, [])

  const getAverageMetrics = useCallback((): Partial<StartupMetrics> => {
    if (metrics.length === 0) return {}

    const totals = metrics.reduce((acc, metric) => ({
      totalStartupTime: acc.totalStartupTime + (metric.totalStartupTime || 0),
      websocketConnectionTime: acc.websocketConnectionTime + (metric.websocketConnectionTime || 0),
      audioInitializationTime: acc.audioInitializationTime + (metric.audioInitializationTime || 0),
      transcriptionInitializationTime: acc.transcriptionInitializationTime + (metric.transcriptionInitializationTime || 0),
      firstTranscriptionTime: acc.firstTranscriptionTime + (metric.firstTranscriptionTime || 0)
    }), {
      totalStartupTime: 0,
      websocketConnectionTime: 0,
      audioInitializationTime: 0,
      transcriptionInitializationTime: 0,
      firstTranscriptionTime: 0
    })

    return {
      totalStartupTime: totals.totalStartupTime / metrics.length,
      websocketConnectionTime: totals.websocketConnectionTime / metrics.length,
      audioInitializationTime: totals.audioInitializationTime / metrics.length,
      transcriptionInitializationTime: totals.transcriptionInitializationTime / metrics.length,
      firstTranscriptionTime: totals.firstTranscriptionTime / metrics.length
    }
  }, [metrics])

  const getBestPerformance = useCallback(() => {
    if (metrics.length === 0) return null

    return metrics.reduce((best, current) => {
      if (!best || (current.totalStartupTime && current.totalStartupTime < (best.totalStartupTime || Infinity))) {
        return current
      }
      return best
    }, null as (StartupMetrics & { timestamp: string }) | null)
  }, [metrics])

  return {
    metrics,
    clearHistory,
    getAverageMetrics,
    getBestPerformance
  }
}

export default useOptimizedStartup
