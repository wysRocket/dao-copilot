/**
 * Simple Transcription Demo
 * 
 * This demonstrates the fast, simple approach to live transcription
 * that replaces the over-engineered components causing performance issues.
 * 
 * This component should be used instead of CompleteStreamingTranscription
 * for immediate performance improvement.
 */

import React, { useEffect, useRef } from 'react'
import FastTranscriptionDisplay, { useFastTranscriptionState } from './FastTranscriptionDisplay'
import { SimpleWebSocketTranscriptionHandler } from '../services/simple-websocket-transcription-handler'

export interface SimpleTranscriptionDemoProps {
  /** Whether transcription is active */
  isActive?: boolean
  /** Custom className */
  className?: string
  /** Callback when transcription text changes */
  onTranscriptionChange?: (text: string, isPartial: boolean) => void
}

/**
 * Simple transcription demo component
 * 
 * This component shows how to integrate the FastTranscriptionDisplay
 * with the SimpleWebSocketTranscriptionHandler for optimal performance.
 */
export const SimpleTranscriptionDemo: React.FC<SimpleTranscriptionDemoProps> = ({
  isActive = false,
  className,
  onTranscriptionChange
}) => {
  const handlerRef = useRef<SimpleWebSocketTranscriptionHandler | null>(null)
  const {
    text,
    isPartial,
    connectionState,
    isListening,
    updateText,
    clearText,
    setConnectionState,
    setIsListening
  } = useFastTranscriptionState()
  
  // Initialize handler
  useEffect(() => {
    if (!handlerRef.current) {
      handlerRef.current = new SimpleWebSocketTranscriptionHandler()
      
      // Set up transcription event handler
      handlerRef.current.on('transcription', (result) => {
        console.log('🎤 Transcription received:', result)
        updateText(result.text, result.isPartial)
        onTranscriptionChange?.(result.text, result.isPartial)
      })
    }
    
    return () => {
      if (handlerRef.current) {
        handlerRef.current.removeAllListeners()
        handlerRef.current = null
      }
    }
  }, [updateText, onTranscriptionChange])
  
  // Handle active state changes
  useEffect(() => {
    if (handlerRef.current) {
      if (isActive) {
        handlerRef.current.start()
        setIsListening(true)
        setConnectionState('connected')
      } else {
        handlerRef.current.stop()
        setIsListening(false)
      }
    }
  }, [isActive, setIsListening, setConnectionState])
  
  // Simulate WebSocket message processing
  // In a real app, this would be connected to your actual WebSocket
  const simulateMessage = (messageType: 'text' | 'partial' | 'empty') => {
    if (!handlerRef.current) return
    
    const sampleMessages = {
      text: {
        content: 'This is a sample transcription message from the WebSocket.',
        isPartial: false,
        confidence: 0.95
      },
      partial: {
        content: 'This is a partial transcription that is still being...',
        isPartial: true,
        confidence: 0.8
      },
      empty: {} // This would cause empty transcription
    }
    
    handlerRef.current.processMessage(sampleMessages[messageType])
  }
  
  // Handle clear action
  const handleClear = () => {
    clearText()
    if (handlerRef.current) {
      handlerRef.current.reset()
    }
  }
  
  return (
    <div className={className}>
      <div className="space-y-4">
        <FastTranscriptionDisplay
          text={text}
          isPartial={isPartial}
          connectionState={connectionState}
          isListening={isListening}
          onTextClick={() => {
            if (text) {
              navigator.clipboard.writeText(text)
              console.log('📋 Text copied to clipboard')
            }
          }}
          showStatus={true}
        />
        
        {/* Demo controls */}
        <div className="flex flex-wrap gap-2 p-4 bg-black/10 rounded-lg border border-white/10">
          <h3 className="w-full text-sm font-medium text-white/90 mb-2">
            Demo Controls (for testing)
          </h3>
          
          <button
            onClick={() => simulateMessage('text')}
            className="px-3 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded border border-blue-500/30 transition-colors"
          >
            Send Complete Text
          </button>
          
          <button
            onClick={() => simulateMessage('partial')}
            className="px-3 py-1 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded border border-yellow-500/30 transition-colors"
          >
            Send Partial Text
          </button>
          
          <button
            onClick={() => simulateMessage('empty')}
            className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded border border-red-500/30 transition-colors"
          >
            Send Empty Message
          </button>
          
          <button
            onClick={handleClear}
            className="px-3 py-1 text-xs bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 rounded border border-gray-500/30 transition-colors"
          >
            Clear Text
          </button>
        </div>
        
        {/* Debug info */}
        <div className="p-3 bg-black/20 rounded text-xs text-white/60 font-mono">
          <div>Handler Session: {handlerRef.current?.getSessionId()}</div>
          <div>Text Length: {text.length}</div>
          <div>Is Partial: {isPartial ? 'Yes' : 'No'}</div>
          <div>Connection: {connectionState}</div>
          <div>Listening: {isListening ? 'Yes' : 'No'}</div>
        </div>
      </div>
    </div>
  )
}

export default SimpleTranscriptionDemo
