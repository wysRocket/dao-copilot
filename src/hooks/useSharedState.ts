import {useCallback} from 'react'
import {useMultiWindowContext} from '../contexts/MultiWindowContext'
import {useWindowState} from '../contexts/WindowStateProvider'
import {TranscriptionWithSource} from '../services/TranscriptionSourceManager'

export interface UseSharedStateReturn {
  // Shared state access
  transcripts: Array<{
    id: string
    text: string
    timestamp: number
    confidence?: number
    source?: string
  }>
  isRecording: boolean
  isProcessing: boolean
  theme: 'light' | 'dark' | 'system'
  settings: {
    audioInputDevice?: string
    transcriptionService?: string
    autoSave?: boolean
    notifications?: boolean
  }

  // Streaming state
  currentStreamingTranscription: TranscriptionWithSource | null
  isStreamingActive: boolean

  // Shared state actions
  addTranscript: (transcript: {text: string; confidence?: number; source?: string}) => void
  clearTranscripts: () => void
  setRecordingState: (isRecording: boolean) => void
  setProcessingState: (isProcessing: boolean) => void
  updateSettings: (
    newSettings: Partial<{
      audioInputDevice?: string
      transcriptionService?: string
      autoSave?: boolean
      notifications?: boolean
    }>
  ) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void

  // Window-specific state
  windowState: {
    windowId: string
    windowType: string
    isVisible: boolean
    isFocused: boolean
    sidebarOpen?: boolean
    currentView?: string
    scrollPosition?: number
    formData?: Record<string, unknown>
    selectedItems?: string[]
    searchQuery?: string
  }
  updateLocalState: (key: string, value: unknown) => void
  resetLocalState: () => void

  // Window actions
  focusWindow: () => void
  hideWindow: () => void
  showWindow: () => void

  // Cross-window communication
  sendToWindow: (targetWindowId: string, channel: string, ...args: unknown[]) => void
  broadcast: (channel: string, ...args: unknown[]) => void
  onMessage: (callback: (channel: string, ...args: unknown[]) => void) => () => void

  // State synchronization
  syncState: () => void
}

export const useSharedState = (): UseSharedStateReturn => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const multiWindowContext = useMultiWindowContext() as any // Type assertion for extended context
  const windowStateContext = useWindowState()

  // Extract shared state
  const {
    sharedState,
    syncState,
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState,
    updateSettings,
    setTheme
  } = multiWindowContext

  // Extract window state
  const {windowState, updateLocalState, resetLocalState, focusWindow, hideWindow, showWindow} =
    windowStateContext

  // Cross-window communication helpers
  const sendToWindow = useCallback(
    (targetWindowId: string, channel: string, ...args: unknown[]) => {
      window.electronWindow?.sendToWindow(targetWindowId, channel, ...args)
    },
    []
  )

  const broadcast = useCallback((channel: string, ...args: unknown[]) => {
    window.electronWindow?.broadcast(channel, ...args)
  }, [])

  const onMessage = useCallback((callback: (channel: string, ...args: unknown[]) => void) => {
    return window.electronWindow?.onInterWindowMessage?.(callback) || (() => {})
  }, [])

  return {
    // Shared state
    transcripts: sharedState.transcripts,
    isRecording: sharedState.isRecording,
    isProcessing: sharedState.isProcessing,
    theme: sharedState.theme,
    settings: sharedState.settings,

    // Streaming state
    currentStreamingTranscription: sharedState.currentStreamingTranscription,
    isStreamingActive: sharedState.isStreamingActive,

    // Shared state actions
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState,
    updateSettings,
    setTheme,

    // Window-specific state
    windowState,
    updateLocalState: updateLocalState as (key: string, value: unknown) => void,
    resetLocalState,

    // Window actions
    focusWindow,
    hideWindow,
    showWindow,

    // Cross-window communication
    sendToWindow,
    broadcast,
    onMessage,

    // State synchronization
    syncState
  }
}

// Specialized hooks for specific use cases
export const useTranscriptionState = () => {
  const {
    transcripts,
    isRecording,
    isProcessing,
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState
  } = useSharedState()

  return {
    transcripts,
    isRecording,
    isProcessing,
    addTranscript,
    clearTranscripts,
    setRecordingState,
    setProcessingState
  }
}

export const useThemeState = () => {
  const {theme, setTheme} = useSharedState()

  return {
    theme,
    setTheme
  }
}

export const useSettingsState = () => {
  const {settings, updateSettings} = useSharedState()

  return {
    settings,
    updateSettings
  }
}

export const useWindowCommunication = () => {
  const {sendToWindow, broadcast, onMessage, windowState} = useSharedState()

  return {
    sendToWindow,
    broadcast,
    onMessage,
    currentWindowId: windowState.windowId,
    currentWindowType: windowState.windowType
  }
}
