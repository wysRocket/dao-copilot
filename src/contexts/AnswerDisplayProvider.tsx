/**
 * AnswerDisplayProvider - Persistent Answer Display State
 *
 * Provides a shared context for managing real-time answer display state
 * that persists across page navigation in the assistant window.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
  useCallback
} from 'react'
import {
  AnswerDisplayManager,
  AnswerDisplay,
  SearchState,
  AnswerDisplayConfig
} from '../services/AnswerDisplayManager'
import {AnswerStreamingManager} from '../services/AnswerStreamingManager'
import {UltraFastWebSocketManager} from '../services/UltraFastWebSocketManager'

interface AnswerDisplayContextState {
  // Current active answer display
  currentDisplay: AnswerDisplay | null

  // Search state
  searchState: SearchState | null

  // Display state flags
  isStreaming: boolean
  isInitialized: boolean
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'

  // Error state
  error: string | null

  // Display history for the session
  displayHistory: AnswerDisplay[]

  // Last update timestamp
  lastUpdateTime: number
}

interface AnswerDisplayContextActions {
  // Start a new answer display
  startAnswerDisplay: (questionId: string, question: string) => Promise<string>

  // Clear current display
  clearCurrentDisplay: () => void

  // Update configuration
  updateConfig: (config: Partial<AnswerDisplayConfig>) => void

  // Initialize managers
  initializeManagers: (config?: Partial<AnswerDisplayConfig>) => Promise<void>

  // Get display manager instance
  getDisplayManager: () => AnswerDisplayManager | null
}

interface AnswerDisplayContextValue
  extends AnswerDisplayContextState,
    AnswerDisplayContextActions {}

// Create context
const AnswerDisplayContext = createContext<AnswerDisplayContextValue | null>(null)

// Provider props
interface AnswerDisplayProviderProps {
  children: ReactNode
  defaultConfig?: Partial<AnswerDisplayConfig>
}

// Default configuration
const DEFAULT_CONFIG: AnswerDisplayConfig = {
  maxHistorySize: 50,
  showSearchProgress: true,
  showConfidence: true,
  showSources: true,
  showMetadata: false,
  enableTypewriterEffect: true,
  typewriterSpeed: 30,
  updateThrottleMs: 100,
  enableDebugLogging: false
}

export const AnswerDisplayProvider: React.FC<AnswerDisplayProviderProps> = ({
  children,
  defaultConfig = {}
}) => {
  // State management
  const [state, setState] = useState<AnswerDisplayContextState>({
    currentDisplay: null,
    searchState: null,
    isStreaming: false,
    isInitialized: false,
    connectionStatus: 'disconnected',
    error: null,
    displayHistory: [],
    lastUpdateTime: Date.now()
  })

  // Manager references (persistent across re-renders)
  const displayManagerRef = useRef<AnswerDisplayManager | null>(null)
  const answerStreamingManagerRef = useRef<AnswerStreamingManager | null>(null)
  const webSocketManagerRef = useRef<UltraFastWebSocketManager | null>(null)
  const configRef = useRef<AnswerDisplayConfig>({...DEFAULT_CONFIG, ...defaultConfig})

  // Initialize managers
  const initializeManagers = useCallback(async (config: Partial<AnswerDisplayConfig> = {}) => {
    try {
      setState(prev => ({...prev, connectionStatus: 'connecting', error: null}))

      // Update config
      configRef.current = {...configRef.current, ...config}

      // Initialize WebSocket manager if not exists
      if (!webSocketManagerRef.current) {
        webSocketManagerRef.current = new UltraFastWebSocketManager({
          maxConnections: 3,
          heartbeatInterval: 30000
        })
      }

      // Initialize Answer streaming manager if not exists
      if (!answerStreamingManagerRef.current) {
        answerStreamingManagerRef.current = new AnswerStreamingManager(
          webSocketManagerRef.current,
          {
            streamingMode: 'character',
            maxConcurrentStreams: 2
          }
        )
      }

      // Initialize display manager if not exists
      if (!displayManagerRef.current) {
        displayManagerRef.current = new AnswerDisplayManager(
          answerStreamingManagerRef.current,
          webSocketManagerRef.current,
          configRef.current
        )

        // Setup event listeners for the display manager
        setupDisplayManagerListeners(displayManagerRef.current)
      }

      setState(prev => ({
        ...prev,
        isInitialized: true,
        connectionStatus: 'connected'
      }))

      console.log('✅ AnswerDisplayProvider: Managers initialized successfully')
    } catch (error) {
      console.error('❌ AnswerDisplayProvider: Failed to initialize managers:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Initialization failed',
        connectionStatus: 'error'
      }))
    }
  }, [])

  // Setup display manager event listeners
  const setupDisplayManagerListeners = useCallback((displayManager: AnswerDisplayManager) => {
    const handleDisplayStarted = (display: AnswerDisplay) => {
      setState(prev => ({
        ...prev,
        currentDisplay: display,
        lastUpdateTime: Date.now()
      }))
    }

    const handlePartialAnswerUpdated = (display: AnswerDisplay) => {
      setState(prev => ({
        ...prev,
        currentDisplay: display,
        isStreaming: true,
        lastUpdateTime: Date.now()
      }))
    }

    const handleSearchStateUpdated = (searchState: SearchState) => {
      setState(prev => ({
        ...prev,
        searchState,
        lastUpdateTime: Date.now()
      }))
    }

    const handleAnswerCompleted = (display: AnswerDisplay) => {
      setState(prev => ({
        ...prev,
        currentDisplay: display,
        isStreaming: false,
        displayHistory: [display, ...prev.displayHistory].slice(
          0,
          configRef.current.maxHistorySize
        ),
        lastUpdateTime: Date.now()
      }))
    }

    const handleDisplayCleared = () => {
      setState(prev => ({
        ...prev,
        currentDisplay: null,
        searchState: null,
        isStreaming: false,
        lastUpdateTime: Date.now()
      }))
    }

    const handleStreamingStarted = () => {
      setState(prev => ({...prev, isStreaming: true}))
    }

    const handleStreamingCompleted = () => {
      setState(prev => ({...prev, isStreaming: false}))
    }

    // Register event listeners
    displayManager.on('display-started', handleDisplayStarted)
    displayManager.on('partial-answer-updated', handlePartialAnswerUpdated)
    displayManager.on('search-state-updated', handleSearchStateUpdated)
    displayManager.on('answer-completed', handleAnswerCompleted)
    displayManager.on('display-cleared', handleDisplayCleared)
    displayManager.on('streaming-started', handleStreamingStarted)
    displayManager.on('streaming-completed', handleStreamingCompleted)

    // Store cleanup function
    return () => {
      displayManager.off('display-started', handleDisplayStarted)
      displayManager.off('partial-answer-updated', handlePartialAnswerUpdated)
      displayManager.off('search-state-updated', handleSearchStateUpdated)
      displayManager.off('answer-completed', handleAnswerCompleted)
      displayManager.off('display-cleared', handleDisplayCleared)
      displayManager.off('streaming-started', handleStreamingStarted)
      displayManager.off('streaming-completed', handleStreamingCompleted)
    }
  }, [])

  // Action: Start answer display
  const startAnswerDisplay = useCallback(
    async (questionId: string, question: string): Promise<string> => {
      if (!displayManagerRef.current) {
        throw new Error('Display manager not initialized')
      }

      try {
        const displayId = await displayManagerRef.current.startAnswerDisplay(questionId, question)
        return displayId
      } catch (error) {
        console.error('❌ Failed to start answer display:', error)
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to start answer display'
        }))
        throw error
      }
    },
    []
  )

  // Action: Clear current display
  const clearCurrentDisplay = useCallback(() => {
    if (displayManagerRef.current) {
      displayManagerRef.current.clearCurrentDisplay()
    }
  }, [])

  // Action: Update configuration
  const updateConfig = useCallback((newConfig: Partial<AnswerDisplayConfig>) => {
    configRef.current = {...configRef.current, ...newConfig}
    if (displayManagerRef.current) {
      displayManagerRef.current.updateConfig(newConfig)
    }
  }, [])

  // Action: Get display manager instance
  const getDisplayManager = useCallback(() => {
    return displayManagerRef.current
  }, [])

  // Initialize on mount
  useEffect(() => {
    initializeManagers()

    // Cleanup on unmount
    return () => {
      if (displayManagerRef.current) {
        displayManagerRef.current.destroy()
        displayManagerRef.current = null
      }
      if (answerStreamingManagerRef.current) {
        answerStreamingManagerRef.current.destroy()
        answerStreamingManagerRef.current = null
      }
      if (webSocketManagerRef.current) {
        // WebSocket manager cleanup
        const wsManager = webSocketManagerRef.current as unknown as {disconnect?: () => void}
        if (wsManager.disconnect) {
          wsManager.disconnect()
        }
        webSocketManagerRef.current = null
      }
    }
  }, [initializeManagers])

  // Context value
  const contextValue: AnswerDisplayContextValue = {
    // State
    ...state,

    // Actions
    startAnswerDisplay,
    clearCurrentDisplay,
    updateConfig,
    initializeManagers,
    getDisplayManager
  }

  return (
    <AnswerDisplayContext.Provider value={contextValue}>{children}</AnswerDisplayContext.Provider>
  )
}

// Hook to use the answer display context
export const useAnswerDisplay = () => {
  const context = useContext(AnswerDisplayContext)
  if (!context) {
    throw new Error('useAnswerDisplay must be used within an AnswerDisplayProvider')
  }
  return context
}

// Hook to use answer display state only (for read-only components)
export const useAnswerDisplayState = () => {
  const {
    currentDisplay,
    searchState,
    isStreaming,
    isInitialized,
    connectionStatus,
    error,
    displayHistory,
    lastUpdateTime
  } = useAnswerDisplay()

  return {
    currentDisplay,
    searchState,
    isStreaming,
    isInitialized,
    connectionStatus,
    error,
    displayHistory,
    lastUpdateTime
  }
}

// Hook to use answer display actions only
export const useAnswerDisplayActions = () => {
  const {
    startAnswerDisplay,
    clearCurrentDisplay,
    updateConfig,
    initializeManagers,
    getDisplayManager
  } = useAnswerDisplay()

  return {
    startAnswerDisplay,
    clearCurrentDisplay,
    updateConfig,
    initializeManagers,
    getDisplayManager
  }
}

export default AnswerDisplayProvider
