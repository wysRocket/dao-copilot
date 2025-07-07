/**
 * Transcription Pipeline Context and Hooks
 *
 * Provides React context and hooks for managing transcription pipeline state
 * across the application with real-time WebSocket updates and performance optimizations.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode
} from 'react'
import {
  TranscriptionPipeline,
  PipelineEvent,
  PipelineState,
  TranscriptionPipelineConfig,
  createProductionTranscriptionPipeline
} from '../services/transcription-pipeline'
import {TranscriptionMode} from '../services/gemini-live-integration'
import {TranscriptionResult} from '../services/audio-recording'

/**
 * Pipeline context state interface
 */
interface TranscriptionPipelineContextState {
  // Pipeline Instance
  pipeline: TranscriptionPipeline | null

  // State
  pipelineState: PipelineState | null
  transcripts: TranscriptionResult[]
  isInitialized: boolean
  isLoading: boolean
  error: Error | null

  // Actions
  initialize: (config?: Partial<TranscriptionPipelineConfig>) => Promise<void>
  startTranscription: () => Promise<void>
  stopTranscription: () => Promise<void>
  toggleTranscription: () => Promise<void>
  switchMode: (mode: TranscriptionMode) => Promise<void>
  clearTranscripts: () => void

  // Configuration
  updateConfig: (updates: Partial<TranscriptionPipelineConfig>) => void
  getConfig: () => TranscriptionPipelineConfig | null

  // Utilities
  destroy: () => Promise<void>
}

/**
 * Default context value
 */
const defaultContextValue: TranscriptionPipelineContextState = {
  pipeline: null,
  pipelineState: null,
  transcripts: [],
  isInitialized: false,
  isLoading: false,
  error: null,
  initialize: async () => {},
  startTranscription: async () => {},
  stopTranscription: async () => {},
  toggleTranscription: async () => {},
  switchMode: async () => {},
  clearTranscripts: () => {},
  updateConfig: () => {},
  getConfig: () => null,
  destroy: async () => {}
}

/**
 * Pipeline context
 */
const TranscriptionPipelineContext =
  createContext<TranscriptionPipelineContextState>(defaultContextValue)

/**
 * Pipeline provider props
 */
interface TranscriptionPipelineProviderProps {
  children: ReactNode
  autoInitialize?: boolean
  initialConfig?: Partial<TranscriptionPipelineConfig>
  apiKey?: string
}

/**
 * Transcription Pipeline Provider Component
 */
export const TranscriptionPipelineProvider: React.FC<TranscriptionPipelineProviderProps> = ({
  children,
  autoInitialize = true,
  initialConfig = {},
  apiKey
}) => {
  // State
  const [pipeline, setPipeline] = useState<TranscriptionPipeline | null>(null)
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Refs for cleanup
  const mountedRef = useRef(true)
  const configRef = useRef<Partial<TranscriptionPipelineConfig>>(initialConfig)

  /**
   * Initialize pipeline
   */
  const initialize = useCallback(
    async (config?: Partial<TranscriptionPipelineConfig>) => {
      if (!mountedRef.current) return

      try {
        setIsLoading(true)
        setError(null)

        // Merge configurations
        const finalConfig = {...configRef.current, ...config}
        configRef.current = finalConfig

        // Get API key from various sources
        const resolvedApiKey =
          finalConfig.apiKey ||
          apiKey ||
          process.env.GOOGLE_API_KEY ||
          process.env.VITE_GOOGLE_API_KEY ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GEMINI_API_KEY

        if (!resolvedApiKey) {
          throw new Error('Google API Key is required for transcription pipeline')
        }

        // Create pipeline instance
        const newPipeline = createProductionTranscriptionPipeline(resolvedApiKey, finalConfig)

        // Set up event listeners
        const handleStateChange = (state: PipelineState) => {
          if (mountedRef.current) {
            setPipelineState(state)
          }
        }

        const handleTranscriptionReceived = (result: TranscriptionResult) => {
          if (mountedRef.current) {
            setTranscripts(prev => {
              const updated = [...prev, result]
              // Limit history to prevent memory issues
              return updated.length > 1000 ? updated.slice(-500) : updated
            })
          }
        }

        const handleError = (err: Error) => {
          if (mountedRef.current) {
            setError(err)
          }
        }

        const handleConnected = () => {
          if (mountedRef.current) {
            setError(null) // Clear errors on successful connection
          }
        }

        // Register event listeners
        newPipeline.on(PipelineEvent.STATE_CHANGED, handleStateChange)
        newPipeline.on(PipelineEvent.TRANSCRIPTION_RECEIVED, handleTranscriptionReceived)
        newPipeline.on(PipelineEvent.ERROR, handleError)
        newPipeline.on(PipelineEvent.CONNECTED, handleConnected)

        // Initialize the pipeline
        await newPipeline.initialize()

        if (mountedRef.current) {
          setPipeline(newPipeline)
          setPipelineState(newPipeline.getState())
          setTranscripts(newPipeline.getTranscripts())
          setIsInitialized(true)
        }
      } catch (err) {
        console.error('Failed to initialize transcription pipeline:', err)
        if (mountedRef.current) {
          setError(err as Error)
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false)
        }
      }
    },
    [apiKey]
  )

  /**
   * Start transcription
   */
  const startTranscription = useCallback(async () => {
    if (!pipeline) {
      throw new Error('Pipeline not initialized')
    }

    try {
      setError(null)
      await pipeline.startTranscription()
    } catch (err) {
      const error = err as Error
      setError(error)
      throw error
    }
  }, [pipeline])

  /**
   * Stop transcription
   */
  const stopTranscription = useCallback(async () => {
    if (!pipeline) {
      return
    }

    try {
      await pipeline.stopTranscription()
    } catch (err) {
      const error = err as Error
      setError(error)
      throw error
    }
  }, [pipeline])

  /**
   * Toggle transcription
   */
  const toggleTranscription = useCallback(async () => {
    if (!pipeline) {
      throw new Error('Pipeline not initialized')
    }

    try {
      await pipeline.toggleTranscription()
    } catch (err) {
      const error = err as Error
      setError(error)
      throw error
    }
  }, [pipeline])

  /**
   * Switch transcription mode
   */
  const switchMode = useCallback(
    async (mode: TranscriptionMode) => {
      if (!pipeline) {
        throw new Error('Pipeline not initialized')
      }

      try {
        setError(null)
        await pipeline.switchMode(mode)
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      }
    },
    [pipeline]
  )

  /**
   * Clear transcripts
   */
  const clearTranscripts = useCallback(() => {
    if (pipeline) {
      pipeline.clearTranscripts()
    }
    setTranscripts([])
  }, [pipeline])

  /**
   * Update configuration
   */
  const updateConfig = useCallback(
    (updates: Partial<TranscriptionPipelineConfig>) => {
      configRef.current = {...configRef.current, ...updates}
      if (pipeline) {
        pipeline.updateConfig(updates)
      }
    },
    [pipeline]
  )

  /**
   * Get current configuration
   */
  const getConfig = useCallback(() => {
    return pipeline ? pipeline.getConfig() : null
  }, [pipeline])

  /**
   * Destroy pipeline
   */
  const destroy = useCallback(async () => {
    if (pipeline) {
      try {
        await pipeline.destroy()
      } catch (err) {
        console.error('Error destroying pipeline:', err)
      }
    }
    setPipeline(null)
    setPipelineState(null)
    setTranscripts([])
    setIsInitialized(false)
    setError(null)
  }, [pipeline])

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize && !isInitialized && !isLoading) {
      initialize(initialConfig)
    }
  }, [autoInitialize, isInitialized, isLoading, initialize, initialConfig])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pipeline) {
        pipeline.destroy().catch(console.error)
      }
    }
  }, [pipeline])

  // Context value
  const contextValue: TranscriptionPipelineContextState = {
    pipeline,
    pipelineState,
    transcripts,
    isInitialized,
    isLoading,
    error,
    initialize,
    startTranscription,
    stopTranscription,
    toggleTranscription,
    switchMode,
    clearTranscripts,
    updateConfig,
    getConfig,
    destroy
  }

  return (
    <TranscriptionPipelineContext.Provider value={contextValue}>
      {children}
    </TranscriptionPipelineContext.Provider>
  )
}

/**
 * Hook to use transcription pipeline context
 */
export const useTranscriptionPipeline = (): TranscriptionPipelineContextState => {
  const context = useContext(TranscriptionPipelineContext)

  if (!context) {
    throw new Error('useTranscriptionPipeline must be used within a TranscriptionPipelineProvider')
  }

  return context
}

/**
 * Hook for connection state with optimized re-renders
 */
export const useConnectionState = () => {
  const {pipelineState} = useTranscriptionPipeline()

  return {
    isConnected: pipelineState?.isConnected || false,
    connectionQuality: pipelineState?.connectionQuality || 'disconnected',
    isInitialized: pipelineState?.isInitialized || false,
    lastError: pipelineState?.lastError
  }
}

/**
 * Hook for recording state with optimized re-renders
 */
export const useRecordingState = () => {
  const {pipelineState} = useTranscriptionPipeline()

  return {
    isRecording: pipelineState?.isRecording || false,
    isStreaming: pipelineState?.isStreaming || false,
    isProcessing: pipelineState?.isProcessing || false,
    currentMode: pipelineState?.currentMode || TranscriptionMode.HYBRID,
    recordingMode: pipelineState?.recordingMode
  }
}

/**
 * Hook for performance metrics with optimized re-renders
 */
export const usePerformanceMetrics = () => {
  const {pipelineState} = useTranscriptionPipeline()

  return {
    latency: pipelineState?.latency || 0,
    throughput: pipelineState?.throughput || 0,
    bufferHealth: pipelineState?.bufferHealth || 1.0,
    droppedFrames: pipelineState?.droppedFrames || 0,
    transcriptCount: pipelineState?.transcriptCount || 0,
    processingQueue: pipelineState?.processingQueue || 0
  }
}

/**
 * Hook for transcripts with debouncing and performance optimization
 */
export const useTranscripts = (debounceMs = 150) => {
  const {transcripts} = useTranscriptionPipeline()
  const [debouncedTranscripts, setDebouncedTranscripts] = useState(transcripts)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedTranscripts(transcripts)
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [transcripts, debounceMs])

  return debouncedTranscripts
}

/**
 * Hook for actions with error handling
 */
export const useTranscriptionActions = () => {
  const {
    startTranscription,
    stopTranscription,
    toggleTranscription,
    switchMode,
    clearTranscripts,
    error
  } = useTranscriptionPipeline()

  const [isPerformingAction, setIsPerformingAction] = useState(false)

  const safeAction = useCallback(
    async (action: () => Promise<void>) => {
      if (isPerformingAction) return

      try {
        setIsPerformingAction(true)
        await action()
      } catch (err) {
        console.error('Action failed:', err)
        throw err
      } finally {
        setIsPerformingAction(false)
      }
    },
    [isPerformingAction]
  )

  return {
    startTranscription: () => safeAction(startTranscription),
    stopTranscription: () => safeAction(stopTranscription),
    toggleTranscription: () => safeAction(toggleTranscription),
    switchMode: (mode: TranscriptionMode) => safeAction(() => switchMode(mode)),
    clearTranscripts,
    isPerformingAction,
    error
  }
}

/**
 * Hook for WebSocket-specific functionality
 */
export const useWebSocketFeatures = () => {
  const {pipelineState, switchMode} = useTranscriptionPipeline()

  const isWebSocketMode = pipelineState?.currentMode === TranscriptionMode.WEBSOCKET
  const isHybridMode = pipelineState?.currentMode === TranscriptionMode.HYBRID
  const supportsWebSocket = isWebSocketMode || isHybridMode

  const enableWebSocketMode = useCallback(() => {
    return switchMode(TranscriptionMode.WEBSOCKET)
  }, [switchMode])

  const enableHybridMode = useCallback(() => {
    return switchMode(TranscriptionMode.HYBRID)
  }, [switchMode])

  const enableBatchMode = useCallback(() => {
    return switchMode(TranscriptionMode.BATCH)
  }, [switchMode])

  return {
    isWebSocketMode,
    isHybridMode,
    supportsWebSocket,
    enableWebSocketMode,
    enableHybridMode,
    enableBatchMode,
    connectionQuality: pipelineState?.connectionQuality || 'disconnected'
  }
}

export default TranscriptionPipelineContext
