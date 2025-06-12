import React, {createContext, useContext, useEffect, useState, ReactNode, useCallback} from 'react'

interface WindowState {
  windowType: string
  isMinimized?: boolean
  isPinned?: boolean
  position?: {x: number; y: number}
  size?: {width: number; height: number}
  isVisible?: boolean
  lastActive?: number
}

export interface SharedState {
  // Transcription state
  transcripts: Array<{
    id: string
    text: string
    timestamp: number
    confidence?: number
  }>
  isRecording: boolean
  isProcessing: boolean

  // Theme state
  theme: 'light' | 'dark' | 'system'

  // App state
  activeWindowId: string | null
  windowStates: Record<string, WindowState>

  // Settings state
  settings: {
    audioInputDevice?: string
    transcriptionService?: string
    autoSave?: boolean
    notifications?: boolean
  }
}

interface MultiWindowContextType {
  sharedState: SharedState
  updateSharedState: <K extends keyof SharedState>(key: K, value: SharedState[K]) => void
  syncState: () => void
  subscribeToStateChanges: (callback: (newState: SharedState) => void) => () => void
  broadcastStateChange: <K extends keyof SharedState>(key: K, value: SharedState[K]) => void
}

const MultiWindowContext = createContext<MultiWindowContextType | null>(null)

const DEFAULT_SHARED_STATE: SharedState = {
  transcripts: [],
  isRecording: false,
  isProcessing: false,
  theme: 'system',
  activeWindowId: null,
  windowStates: {},
  settings: {
    autoSave: true,
    notifications: true
  }
}

export const useMultiWindowContext = () => {
  const context = useContext(MultiWindowContext)
  if (!context) {
    throw new Error('useMultiWindowContext must be used within a MultiWindowProvider')
  }
  return context
}

interface MultiWindowProviderProps {
  children: ReactNode
}

export const MultiWindowProvider: React.FC<MultiWindowProviderProps> = ({children}) => {
  const [sharedState, setSharedState] = useState<SharedState>(DEFAULT_SHARED_STATE)
  const [stateChangeCallbacks, setStateChangeCallbacks] = useState<
    Array<(newState: SharedState) => void>
  >([])

  // Initialize shared state from localStorage
  useEffect(() => {
    const initializeState = async () => {
      try {
        // Load persisted state from localStorage
        const persistedState = localStorage.getItem('multiWindowState')
        if (persistedState) {
          const parsedState = JSON.parse(persistedState)
          setSharedState(prev => ({...prev, ...parsedState}))
        }

        // Get current window info
        const windowInfo = await window.electronWindow?.getWindowInfo()
        if (windowInfo) {
          setSharedState(prev => ({
            ...prev,
            activeWindowId: windowInfo.windowId
          }))
        }
      } catch (error) {
        console.error('Failed to initialize multi-window state:', error)
      }
    }

    initializeState()
  }, [])

  // Persist state changes to localStorage
  useEffect(() => {
    const stateToPerist = {
      transcripts: sharedState.transcripts,
      theme: sharedState.theme,
      settings: sharedState.settings
    }
    localStorage.setItem('multiWindowState', JSON.stringify(stateToPerist))
  }, [sharedState])

  // Listen for inter-window state synchronization
  useEffect(() => {
    const removeListener = window.electronWindow?.onInterWindowMessage?.(
      (channel: string, ...args: unknown[]) => {
        if (channel === 'state-sync') {
          const [stateKey, newValue] = args
          setSharedState(prev => ({
            ...prev,
            [stateKey as string]: newValue
          }))
        } else if (channel === 'full-state-sync') {
          const [newState] = args
          if (newState && typeof newState === 'object') {
            setSharedState(prev => ({
              ...prev,
              ...newState
            }))
          }
        }
      }
    )

    return removeListener
  }, [])

  const updateSharedState = useCallback(
    <K extends keyof SharedState>(key: K, value: SharedState[K]) => {
      setSharedState(prev => {
        const newState = {...prev, [key]: value}

        // Notify all state change callbacks
        stateChangeCallbacks.forEach(callback => callback(newState))

        return newState
      })
    },
    [stateChangeCallbacks]
  )

  const broadcastStateChange = useCallback(
    <K extends keyof SharedState>(key: K, value: SharedState[K]) => {
      // Update local state
      updateSharedState(key, value)

      // Broadcast to other windows
      window.electronWindow?.broadcast?.('state-sync', key, value)
    },
    [updateSharedState]
  )

  const syncState = useCallback(() => {
    // Broadcast current state to all windows
    window.electronWindow?.broadcast?.('full-state-sync', sharedState)
  }, [sharedState])

  const subscribeToStateChanges = useCallback((callback: (newState: SharedState) => void) => {
    setStateChangeCallbacks(prev => [...prev, callback])

    // Return unsubscribe function
    return () => {
      setStateChangeCallbacks(prev => prev.filter(cb => cb !== callback))
    }
  }, [])

  // Transcription-specific helpers
  const addTranscript = useCallback(
    (transcript: {text: string; confidence?: number}) => {
      const newTranscript = {
        id: `transcript-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: transcript.text,
        timestamp: Date.now(),
        confidence: transcript.confidence
      }

      broadcastStateChange('transcripts', [...sharedState.transcripts, newTranscript])
    },
    [sharedState.transcripts, broadcastStateChange]
  )

  const clearTranscripts = useCallback(() => {
    broadcastStateChange('transcripts', [])
  }, [broadcastStateChange])

  const setRecordingState = useCallback(
    (isRecording: boolean) => {
      broadcastStateChange('isRecording', isRecording)
    },
    [broadcastStateChange]
  )

  const setProcessingState = useCallback(
    (isProcessing: boolean) => {
      broadcastStateChange('isProcessing', isProcessing)
    },
    [broadcastStateChange]
  )

  const updateSettings = useCallback(
    (newSettings: Partial<SharedState['settings']>) => {
      const updatedSettings = {...sharedState.settings, ...newSettings}
      broadcastStateChange('settings', updatedSettings)
    },
    [sharedState.settings, broadcastStateChange]
  )

  const setTheme = useCallback(
    (theme: SharedState['theme']) => {
      broadcastStateChange('theme', theme)
    },
    [broadcastStateChange]
  )

  // Enhanced context value with helper methods
  const contextValue: MultiWindowContextType & {
    // Transcription helpers
    addTranscript: (transcript: {text: string; confidence?: number}) => void
    clearTranscripts: () => void
    setRecordingState: (isRecording: boolean) => void
    setProcessingState: (isProcessing: boolean) => void

    // Settings helpers
    updateSettings: (newSettings: Partial<SharedState['settings']>) => void

    // Theme helpers
    setTheme: (theme: SharedState['theme']) => void
  } = {
    sharedState,
    updateSharedState,
    syncState,
    subscribeToStateChanges,
    broadcastStateChange,

    // Helper methods
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState,
    updateSettings,
    setTheme
  }

  return <MultiWindowContext.Provider value={contextValue}>{children}</MultiWindowContext.Provider>
}
