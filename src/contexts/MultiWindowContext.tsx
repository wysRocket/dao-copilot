import React, {createContext, useContext, useEffect, useState, ReactNode, useCallback} from 'react'
import { getTranscriptionSourceManager, TranscriptionWithSource, TranscriptionSource, TranscriptionSourceManager } from '../services/TranscriptionSourceManager'

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
    source?: string  // Add source information
  }>
  isRecording: boolean
  isProcessing: boolean

  // Streaming transcription state
  currentStreamingTranscription: TranscriptionWithSource | null
  isStreamingActive: boolean

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
  
  // Enhanced transcription methods with source support
  addTranscriptionWithSource: (transcription: TranscriptionWithSource) => void
  addTranscript: (transcript: { text: string; confidence?: number; source?: string }) => void  // Legacy support
}

const MultiWindowContext = createContext<MultiWindowContextType | null>(null)

const DEFAULT_SHARED_STATE: SharedState = {
  transcripts: [],
  isRecording: false,
  isProcessing: false,
  currentStreamingTranscription: null,
  isStreamingActive: false,
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

  // Initialize source manager
  const sourceManager = getTranscriptionSourceManager()

  // Enhanced transcription method with source routing
  const addTranscriptionWithSource = useCallback(
    (transcription: TranscriptionWithSource) => {
      console.log('🔄 MultiWindowContext: Processing transcription with source:', transcription.source)
      
      // Route the transcription through the source manager
      const result = sourceManager.processTranscription(transcription)
      
      console.log('🔄 Source manager routing decision:', result.routing)
      
      // Handle streaming transcription
      if (result.streamingTranscription) {
        console.log('🔄 Setting streaming transcription:', result.streamingTranscription.text.substring(0, 50) + '...')
        broadcastStateChange('currentStreamingTranscription', result.streamingTranscription)
        broadcastStateChange('isStreamingActive', true)
      }
      
      // Handle static transcription
      if (result.staticTranscription) {
        console.log('🔄 Adding static transcription:', result.staticTranscription.text.substring(0, 50) + '...')
        const staticTranscript = {
          id: result.staticTranscription.id,
          text: result.staticTranscription.text,
          timestamp: result.staticTranscription.timestamp,
          confidence: result.staticTranscription.confidence,
          source: result.staticTranscription.source
        }
        
        // Add to static transcripts
        broadcastStateChange('transcripts', [...sharedState.transcripts, staticTranscript])
      }
    },
    [sharedState.transcripts, broadcastStateChange, sourceManager]
  )

  // Legacy addTranscript method for backward compatibility
  const addTranscript = useCallback(
    (transcript: { text: string; confidence?: number; source?: string }) => {
      console.log('🔄 MultiWindowContext: Legacy addTranscript called with source:', transcript.source)
      
      // Convert legacy format to TranscriptionWithSource
      const transcriptionWithSource: TranscriptionWithSource = {
        id: `transcript-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: transcript.text,
        timestamp: Date.now(),
        confidence: transcript.confidence,
        source: transcript.source ? 
          TranscriptionSourceManager.parseSource(transcript.source) : 
          TranscriptionSource.BATCH,
        isPartial: false
      }
      
      // Route through the new method
      addTranscriptionWithSource(transcriptionWithSource)
    },
    [addTranscriptionWithSource]
  )

  const clearTranscripts = useCallback(() => {
    sourceManager.clearAll()
    broadcastStateChange('transcripts', [])
    broadcastStateChange('currentStreamingTranscription', null)
    broadcastStateChange('isStreamingActive', false)
  }, [broadcastStateChange, sourceManager])

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
    addTranscript: (transcript: { text: string; confidence?: number; source?: string }) => void
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
    addTranscriptionWithSource,
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState,
    updateSettings,
    setTheme
  }

  return <MultiWindowContext.Provider value={contextValue}>{children}</MultiWindowContext.Provider>
}
