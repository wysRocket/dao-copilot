import React, { createContext, useContext, ReactNode } from 'react'
import useTranscriptionState, { UseTranscriptionStateReturn } from '../hooks/useTranscriptionState'

/**
 * Context for providing unified transcription state throughout the application
 */
const TranscriptionStateContext = createContext<UseTranscriptionStateReturn | null>(null)

/**
 * Props for the TranscriptionStateProvider
 */
interface TranscriptionStateProviderProps {
  children: ReactNode
  /**
   * Whether to automatically subscribe to state changes
   * Set to false for performance-sensitive components that don't need real-time updates
   */
  autoSubscribe?: boolean
}

/**
 * Provider component that wraps the application and provides unified transcription state
 * 
 * This replaces the multiple overlapping contexts (MultiWindowContext, StreamingTextContext, etc.)
 * with a single, unified state management solution.
 * 
 * @param children - Child components
 * @param autoSubscribe - Whether to automatically subscribe to state changes (default: true)
 */
export const TranscriptionStateProvider: React.FC<TranscriptionStateProviderProps> = ({ 
  children, 
  autoSubscribe = true 
}) => {
  const transcriptionState = useTranscriptionState(autoSubscribe)
  
  return (
    <TranscriptionStateContext.Provider value={transcriptionState}>
      {children}
    </TranscriptionStateContext.Provider>
  )
}

/**
 * Hook to access the unified transcription state from any component
 * 
 * This hook provides access to all transcription-related state and actions
 * throughout the application. It replaces the need for multiple context hooks.
 * 
 * @throws Error if used outside of TranscriptionStateProvider
 * @returns Unified transcription state and actions
 */
export const useTranscriptionStateContext = (): UseTranscriptionStateReturn => {
  const context = useContext(TranscriptionStateContext)
  
  if (!context) {
    throw new Error('useTranscriptionStateContext must be used within a TranscriptionStateProvider')
  }
  
  return context
}

/**
 * Higher-order component that automatically provides transcription state context
 * 
 * @param Component - Component to wrap
 * @param autoSubscribe - Whether to automatically subscribe to state changes
 * @returns Wrapped component with transcription state context
 */
export const withTranscriptionState = <P extends object>(
  Component: React.ComponentType<P>,
  autoSubscribe: boolean = true
) => {
  const WrappedComponent = (props: P) => (
    <TranscriptionStateProvider autoSubscribe={autoSubscribe}>
      <Component {...props} />
    </TranscriptionStateProvider>
  )
  
  WrappedComponent.displayName = `withTranscriptionState(${Component.displayName || Component.name})`
  
  return WrappedComponent
}

/**
 * Specialized hooks that use the context internally for convenience
 */

/**
 * Hook for components that only need streaming state
 */
export const useStreamingStateContext = () => {
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
  } = useTranscriptionStateContext()
  
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
 * Hook for components that only need static transcript state
 */
export const useStaticTranscriptsContext = () => {
  const {
    transcripts,
    isLoadingTranscripts,
    transcriptCount,
    addTranscript,
    clearTranscripts,
    getMemoryUsage,
    performGarbageCollection
  } = useTranscriptionStateContext()
  
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
 * Hook for components that only need recording state
 */
export const useRecordingStateContext = () => {
  const {
    isRecording,
    isProcessing,
    recordingTime,
    recordingStatus,
    setRecordingState,
    setProcessingState
  } = useTranscriptionStateContext()
  
  return {
    isRecording,
    isProcessing,
    recordingTime,
    recordingStatus,
    setRecordingState,
    setProcessingState
  }
}

export default TranscriptionStateProvider
