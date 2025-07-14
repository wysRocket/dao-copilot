import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { TextStreamBuffer } from '../services/TextStreamBuffer'

interface StreamingTranscription {
  id: string
  text: string
  isPartial: boolean
  timestamp: number
  confidence?: number
  source: string
}

interface StreamingTextContextType {
  // Current streaming state
  currentStreamingText: string
  isStreamingActive: boolean
  isCurrentTextPartial: boolean
  
  // Stream management
  startStreamingTranscription: (transcription: StreamingTranscription) => void
  updateStreamingTranscription: (text: string, isPartial: boolean) => void
  completeStreamingTranscription: () => void
  clearStreaming: () => void
  
  // Configuration
  streamingMode: 'character' | 'word' | 'instant'
  setStreamingMode: (mode: 'character' | 'word' | 'instant') => void
  
  // Event handlers
  onStreamingComplete?: () => void
  setOnStreamingComplete: (callback: () => void) => void
}

const StreamingTextContext = createContext<StreamingTextContextType | null>(null)

interface StreamingTextProviderProps {
  children: React.ReactNode
  onTranscriptionComplete?: (transcription: { text: string; confidence?: number }) => void
}

export const StreamingTextProvider: React.FC<StreamingTextProviderProps> = ({
  children,
  onTranscriptionComplete
}) => {
  // Core streaming state
  const [currentStreamingText, setCurrentStreamingText] = useState('')
  const [isStreamingActive, setIsStreamingActive] = useState(false)
  const [isCurrentTextPartial, setIsCurrentTextPartial] = useState(false)
  const [streamingMode, setStreamingMode] = useState<'character' | 'word' | 'instant'>('character')
  
  // Refs for managing streaming
  const streamBufferRef = useRef<TextStreamBuffer | null>(null)
  const currentTranscriptionRef = useRef<StreamingTranscription | null>(null)
  const streamingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const onStreamingCompleteRef = useRef<(() => void) | undefined>(undefined)

  // Initialize stream buffer
  useEffect(() => {
    if (!streamBufferRef.current) {
      streamBufferRef.current = new TextStreamBuffer({
        debounceDelay: 30, // Faster for live streaming
        autoFlush: true,
        enableCorrectionDetection: true,
        maxChunks: 50
      })

      // Subscribe to stream buffer updates
      const unsubscribe = streamBufferRef.current.subscribe('textUpdate', (text, isPartial) => {
        console.log('🔴 StreamingTextContext: Stream buffer update:', text.substring(0, 50) + '...', 'partial:', isPartial)
        setCurrentStreamingText(text)
        setIsCurrentTextPartial(isPartial)
      })

      return () => {
        unsubscribe()
        streamBufferRef.current?.destroy()
      }
    }
  }, [])

  // Start streaming a new transcription
  const startStreamingTranscription = useCallback((transcription: StreamingTranscription) => {
    console.log('🔴 StreamingTextContext: Starting streaming transcription:', transcription.text.substring(0, 50) + '...')
    
    // Clear any existing streaming
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
    }
    
    // Store current transcription
    currentTranscriptionRef.current = transcription
    
    // Set initial state
    setIsStreamingActive(true)
    setCurrentStreamingText('')
    setIsCurrentTextPartial(true)
    
    // Add to stream buffer for animated rendering
    if (streamBufferRef.current) {
      streamBufferRef.current.clear() // Clear previous content
      streamBufferRef.current.addText(transcription.text, transcription.isPartial)
    }
    
    // Set completion timeout
    const completionDelay = transcription.isPartial ? 5000 : 2000 // Longer for partial, shorter for final
    streamingTimeoutRef.current = setTimeout(() => {
      completeStreamingTranscription()
    }, completionDelay)
  }, [])

  // Update streaming transcription (for progressive updates)
  const updateStreamingTranscription = useCallback((text: string, isPartial: boolean) => {
    console.log('🔴 StreamingTextContext: Updating streaming transcription:', text.substring(0, 50) + '...', 'partial:', isPartial)
    
    if (currentTranscriptionRef.current) {
      currentTranscriptionRef.current.text = text
      currentTranscriptionRef.current.isPartial = isPartial
      
      // Update stream buffer
      if (streamBufferRef.current) {
        streamBufferRef.current.clear()
        streamBufferRef.current.addText(text, isPartial)
      }
      
      // Reset completion timeout
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
      }
      
      const completionDelay = isPartial ? 5000 : 2000
      streamingTimeoutRef.current = setTimeout(() => {
        completeStreamingTranscription()
      }, completionDelay)
    }
  }, [])

  // Complete streaming transcription
  const completeStreamingTranscription = useCallback(() => {
    console.log('🔴 StreamingTextContext: Completing streaming transcription')
    
    if (currentTranscriptionRef.current) {
      const finalTranscription = currentTranscriptionRef.current
      
      // Mark as final and update stream
      setIsCurrentTextPartial(false)
      if (streamBufferRef.current) {
        streamBufferRef.current.clear()
        streamBufferRef.current.addText(finalTranscription.text, false)
      }
      
      // Call completion callback
      if (onStreamingCompleteRef.current) {
        onStreamingCompleteRef.current()
      }
      
      // Add to permanent transcript list after a delay
      setTimeout(() => {
        if (onTranscriptionComplete && finalTranscription.text.trim()) {
          onTranscriptionComplete({
            text: finalTranscription.text,
            confidence: finalTranscription.confidence
          })
        }
        
        // Clear streaming state
        clearStreaming()
      }, 1500) // Show completed state for 1.5 seconds
    }
  }, [onTranscriptionComplete])

  // Clear streaming state
  const clearStreaming = useCallback(() => {
    console.log('🔴 StreamingTextContext: Clearing streaming state')
    
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
      streamingTimeoutRef.current = null
    }
    
    currentTranscriptionRef.current = null
    setIsStreamingActive(false)
    setCurrentStreamingText('')
    setIsCurrentTextPartial(false)
    
    if (streamBufferRef.current) {
      streamBufferRef.current.clear()
    }
  }, [])

  // Set completion callback
  const setOnStreamingComplete = useCallback((callback: () => void) => {
    onStreamingCompleteRef.current = callback
  }, [])

  const contextValue: StreamingTextContextType = {
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    startStreamingTranscription,
    updateStreamingTranscription,
    completeStreamingTranscription,
    clearStreaming,
    streamingMode,
    setStreamingMode,
    onStreamingComplete: onStreamingCompleteRef.current,
    setOnStreamingComplete
  }

  return (
    <StreamingTextContext.Provider value={contextValue}>
      {children}
    </StreamingTextContext.Provider>
  )
}

export const useStreamingText = () => {
  const context = useContext(StreamingTextContext)
  if (!context) {
    throw new Error('useStreamingText must be used within a StreamingTextProvider')
  }
  return context
}

export default StreamingTextContext
