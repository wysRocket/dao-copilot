import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  TranscriptionStateManager, 
  getTranscriptionStateManager,
  TranscriptionState,
  TranscriptionResult,
  StateChangeType,
  StateChangeListener
} from '../state/TranscriptionStateManager'
import { TranscriptionWithSource } from '../services/TranscriptionSourceManager'

/**
 * Hook interface for transcription state management
 */
export interface UseTranscriptionStateReturn {
  // Current state
  state: TranscriptionState
  
  // Streaming state convenience accessors
  currentStreamingText: string
  isStreamingActive: boolean
  isCurrentTextPartial: boolean
  streamingProgress: number
  streamingMode: 'character' | 'word' | 'instant'
  
  // Static transcripts convenience accessors
  transcripts: TranscriptionResult[]
  isLoadingTranscripts: boolean
  transcriptCount: number
  
  // Recording state convenience accessors
  isRecording: boolean
  isProcessing: boolean
  recordingTime: number
  recordingStatus: string
  
  // Actions
  startStreaming: (transcription: TranscriptionWithSource) => void
  updateStreaming: (text: string, isPartial?: boolean) => void
  completeStreaming: () => void
  clearStreaming: () => void
  
  addTranscript: (transcript: TranscriptionResult) => void
  clearTranscripts: () => void
  
  setRecordingState: (isRecording: boolean, recordingTime?: number, status?: string) => void
  setProcessingState: (isProcessing: boolean) => void
  setStreamingMode: (mode: 'character' | 'word' | 'instant') => void
  
  // Event subscription
  onStreamingComplete: (callback: () => void) => () => void
  onStateChange: (listener: StateChangeListener) => () => void
  
  // Utilities
  getMemoryUsage: () => { transcriptCount: number; estimatedSize: number }
  performGarbageCollection: () => void
}

/**
 * Primary hook for transcription state management
 * 
 * This hook provides a React-friendly interface to the unified TranscriptionStateManager,
 * handling subscriptions, updates, and providing convenient accessor methods.
 * 
 * @param autoSubscribe - Whether to automatically subscribe to state changes (default: true)
 * @returns Transcription state and actions
 */
export const useTranscriptionState = (autoSubscribe: boolean = true): UseTranscriptionStateReturn => {
  const stateManagerRef = useRef<TranscriptionStateManager>(getTranscriptionStateManager())
  const [state, setState] = useState<TranscriptionState>(stateManagerRef.current.getState())
  
  // Subscribe to state changes
  useEffect(() => {
    if (!autoSubscribe) return
    
    const stateManager = stateManagerRef.current
    
    const unsubscribe = stateManager.subscribe((type: StateChangeType, newState: TranscriptionState) => {
      setState(newState)
    })
    
    // Initialize with current state
    setState(stateManager.getState())
    
    return unsubscribe
  }, [autoSubscribe])
  
  // Streaming actions
  const startStreaming = useCallback((transcription: TranscriptionWithSource) => {
    stateManagerRef.current.startStreaming(transcription)
  }, [])
  
  const updateStreaming = useCallback((text: string, isPartial: boolean = true) => {
    stateManagerRef.current.updateStreaming(text, isPartial)
  }, [])
  
  const completeStreaming = useCallback(() => {
    stateManagerRef.current.completeStreaming()
  }, [])
  
  const clearStreaming = useCallback(() => {
    stateManagerRef.current.clearStreaming()
  }, [])
  
  // Static transcript actions
  const addTranscript = useCallback((transcript: TranscriptionResult) => {
    stateManagerRef.current.addTranscript(transcript)
  }, [])
  
  const clearTranscripts = useCallback(() => {
    stateManagerRef.current.clearTranscripts()
  }, [])
  
  // Recording actions
  const setRecordingState = useCallback((isRecording: boolean, recordingTime: number = 0, status: string = 'Ready') => {
    stateManagerRef.current.setRecordingState(isRecording, recordingTime, status)
  }, [])
  
  const setProcessingState = useCallback((isProcessing: boolean) => {
    stateManagerRef.current.setProcessingState(isProcessing)
  }, [])
  
  const setStreamingMode = useCallback((mode: 'character' | 'word' | 'instant') => {
    stateManagerRef.current.setStreamingMode(mode)
  }, [])
  
  // Event subscription
  const onStreamingComplete = useCallback((callback: () => void) => {
    return stateManagerRef.current.onStreamingComplete(callback)
  }, [])
  
  const onStateChange = useCallback((listener: StateChangeListener) => {
    return stateManagerRef.current.subscribe(listener)
  }, [])
  
  // Utilities
  const getMemoryUsage = useCallback(() => {
    return stateManagerRef.current.getMemoryUsage()
  }, [])
  
  const performGarbageCollection = useCallback(() => {
    stateManagerRef.current.performGarbageCollection()
  }, [])
  
  // Convenience accessors
  const currentStreamingText = state.streaming.current?.text || ''
  const isStreamingActive = state.streaming.isActive
  const isCurrentTextPartial = state.streaming.current?.isPartial || false
  const streamingProgress = state.streaming.progress
  const streamingMode = state.streaming.mode
  
  const transcripts = state.static.transcripts
  const isLoadingTranscripts = state.static.isLoading
  const transcriptCount = state.meta.totalCount
  
  const isRecording = state.recording.isRecording
  const isProcessing = state.recording.isProcessing
  const recordingTime = state.recording.recordingTime
  const recordingStatus = state.recording.status
  
  return {
    // Current state
    state,
    
    // Streaming state convenience accessors
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    streamingProgress,
    streamingMode,
    
    // Static transcripts convenience accessors
    transcripts,
    isLoadingTranscripts,
    transcriptCount,
    
    // Recording state convenience accessors
    isRecording,
    isProcessing,
    recordingTime,
    recordingStatus,
    
    // Actions
    startStreaming,
    updateStreaming,
    completeStreaming,
    clearStreaming,
    
    addTranscript,
    clearTranscripts,
    
    setRecordingState,
    setProcessingState,
    setStreamingMode,
    
    // Event subscription
    onStreamingComplete,
    onStateChange,
    
    // Utilities
    getMemoryUsage,
    performGarbageCollection
  }
}

/**
 * Specialized hook for only streaming state (performance optimized)
 */
export const useStreamingState = () => {
  const {
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    streamingProgress,
    streamingMode,
    startStreaming,
    updateStreaming,
    completeStreaming,
    clearStreaming,
    setStreamingMode,
    onStreamingComplete
  } = useTranscriptionState()
  
  return {
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    streamingProgress,
    streamingMode,
    startStreaming,
    updateStreaming,
    completeStreaming,
    clearStreaming,
    setStreamingMode,
    onStreamingComplete
  }
}

/**
 * Specialized hook for only static transcripts (performance optimized)
 */
export const useStaticTranscripts = () => {
  const {
    transcripts,
    isLoadingTranscripts,
    transcriptCount,
    addTranscript,
    clearTranscripts,
    getMemoryUsage,
    performGarbageCollection
  } = useTranscriptionState()
  
  return {
    transcripts,
    isLoadingTranscripts,
    transcriptCount,
    addTranscript,
    clearTranscripts,
    getMemoryUsage,
    performGarbageCollection
  }
}

/**
 * Specialized hook for only recording state (performance optimized)  
 */
export const useRecordingState = () => {
  const {
    isRecording,
    isProcessing,
    recordingTime,
    recordingStatus,
    setRecordingState,
    setProcessingState
  } = useTranscriptionState()
  
  return {
    isRecording,
    isProcessing,
    recordingTime,
    recordingStatus,
    setRecordingState,
    setProcessingState
  }
}

/**
 * Hook for cross-window state synchronization
 * 
 * This hook helps synchronize the unified state across multiple windows
 * in the Electron app by listening to window messages and broadcasting changes.
 */
export const useTranscriptionStateSynchronization = () => {
  const { onStateChange } = useTranscriptionState()
  
  useEffect(() => {
    // Subscribe to state changes and broadcast to other windows
    const unsubscribe = onStateChange((type: StateChangeType, newState: TranscriptionState) => {
      // Broadcast to other windows if electron is available
      const electronWindow = (window as Window & { electronWindow?: { broadcast: (channel: string, type: StateChangeType, state: TranscriptionState) => void } }).electronWindow
      if (typeof window !== 'undefined' && electronWindow && 'broadcast' in electronWindow) {
        electronWindow.broadcast('transcription-state-sync', type, newState)
      }
    })
    
    // Listen for state sync messages from other windows
    const handleStateSync = (channel: string, type: StateChangeType) => {
      if (channel === 'transcription-state-sync') {
        // Update local state to match other windows
        // Note: This might need more sophisticated merging logic
        console.log('Received transcription state sync:', type)
      }
    }
    
    // Set up inter-window message listener
    let removeListener: (() => void) | undefined
    const electronWindow = (window as Window & { electronWindow?: { onInterWindowMessage: (handler: typeof handleStateSync) => () => void } }).electronWindow
    if (typeof window !== 'undefined' && electronWindow && 'onInterWindowMessage' in electronWindow) {
      removeListener = electronWindow.onInterWindowMessage(handleStateSync)
    }
    
    return () => {
      unsubscribe()
      removeListener?.()
    }
  }, [onStateChange])
}

export default useTranscriptionState
