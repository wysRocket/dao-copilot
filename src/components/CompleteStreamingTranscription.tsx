/**
 * Complete Streaming Transcription Integration
 * Combines enhanced parsing, optimized rendering, and error handling
 */

import React, {useEffect, useState, useCallback, useRef} from 'react'
import {cn} from '../utils/tailwind'

// Import our enhanced components
import {OptimizedStreamingRenderer, useOptimizedStreamingText} from './OptimizedStreamingRenderer'
import StreamingTranscriptionParser, {
  type StreamingTranscriptionResult,
  TranscriptionState
} from '../services/streaming-transcription-parser'
import {
  ErrorType,
  ErrorSeverity,
  useStreamingErrorHandler
} from '../services/streaming-error-handler'

// Import existing components for compatibility
import GlassBox from './GlassBox'
import {StreamingStateIndicator} from './StreamingStateIndicator'

export interface CompleteStreamingTranscriptionProps {
  /** Whether streaming is currently active */
  isActive: boolean
  /** WebSocket connection state */
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'error'
  /** Source of the transcription */
  source?: string
  /** Confidence score */
  confidence?: number
  /** Custom CSS classes */
  className?: string
  /** Callback when transcription is received */
  onTranscription?: (result: StreamingTranscriptionResult) => void
  /** Callback when error occurs */
  onError?: (error: Error) => void
  /** Callback when connection state changes */
  onConnectionStateChange?: (state: string) => void
  /** Enable debug mode */
  debugMode?: boolean
  /** Maximum text length to display */
  maxTextLength?: number
  /** Animation settings */
  animationSettings?: {
    enabled: boolean
    speed: number
    showCursor: boolean
  }
}

/**
 * Complete streaming transcription component with all enhancements
 */
export const CompleteStreamingTranscription: React.FC<CompleteStreamingTranscriptionProps> = ({
  isActive,
  connectionState,
  source = 'websocket',
  confidence,
  className,
  onTranscription,
  onError,
  onConnectionStateChange,
  debugMode = false,
  maxTextLength = 5000,
  animationSettings = {
    enabled: true,
    speed: 50,
    showCursor: true
  }
}) => {
  const [sessionId] = useState(() => `session_${Date.now()}`)
  const parserRef = useRef<StreamingTranscriptionParser | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Use our optimized streaming text hook
  const {
    text,
    isPartial,
    updateText,
    clearText
  } = useOptimizedStreamingText('', 50)
  
  // Use error handler hook
  const {
    handleError
  } = useStreamingErrorHandler()
  
  // State for UI
  const [connectionStatus, setConnectionStatus] = useState(connectionState)
  const [errorCount, setErrorCount] = useState(0)
  const [lastTranscriptionTime, setLastTranscriptionTime] = useState<number | null>(null)
  
  /**
   * Initialize parser and error handler
   */
  useEffect(() => {
    if (!parserRef.current) {
      parserRef.current = new StreamingTranscriptionParser(sessionId)
      
      // Set up parser event handlers
      parserRef.current.on('transcriptionResult', (result: StreamingTranscriptionResult) => {
        setLastTranscriptionTime(Date.now())
        
        // Update optimized text display
        updateText(result.text, result.state === TranscriptionState.PARTIAL)
        
        // Call external callback
        onTranscription?.(result)
        
        if (debugMode) {
          console.log('🎤 Transcription result:', {
            text: result.text,
            state: result.state,
            language: result.language,
            confidence: result.confidence,
            isComplete: result.isComplete
          })
        }
      })
      
      parserRef.current.on('transcriptionError', (result: StreamingTranscriptionResult, error: Error) => {
        handleError(
          ErrorType.PARSING_ERROR,
          `Transcription parsing failed: ${error.message}`,
          {
            sessionId,
            result,
            originalError: error.message
          },
          ErrorSeverity.MEDIUM,
          error
        )
        
        setErrorCount(prev => prev + 1)
        onError?.(error)
      })
      
      parserRef.current.on('transcriptionComplete', (result: StreamingTranscriptionResult) => {
        if (debugMode) {
          console.log('✅ Transcription session complete:', {
            finalText: result.text,
            language: result.language,
            sessionDuration: result.metadata?.sessionDuration
          })
        }
      })
    }
    
    setIsInitialized(true)
    
    return () => {
      if (parserRef.current) {
        parserRef.current.removeAllListeners()
        parserRef.current = null
      }
    }
  }, [sessionId, handleError, onTranscription, onError, updateText, debugMode])
  
  /**
   * Handle connection state changes
   */
  useEffect(() => {
    if (connectionStatus !== connectionState) {
      setConnectionStatus(connectionState)
      onConnectionStateChange?.(connectionState)
      
      // Handle connection errors
      if (connectionState === 'error') {
        handleError(
          ErrorType.WEBSOCKET_CONNECTION,
          'WebSocket connection failed',
          {
            sessionId,
            previousState: connectionStatus,
            source
          },
          ErrorSeverity.HIGH
        )
      } else if (connectionState === 'connected' && connectionStatus === 'error') {
        // Connection recovered
        console.log('✅ WebSocket connection recovered')
      }
    }
  }, [connectionState, connectionStatus, sessionId, source, handleError, onConnectionStateChange])
  
  /**
   * Handle active state changes
   */
  useEffect(() => {
    if (!isActive && text) {
      // Session ended, complete the transcription
      if (parserRef.current) {
        parserRef.current.complete()
      }
    } else if (!isActive) {
      // Clear text when not active
      clearText()
    }
  }, [isActive, text, clearText])
  
  /**
   * Process incoming WebSocket messages
   */
  const processMessage = useCallback((message: unknown) => {
    if (!parserRef.current || !isInitialized) {
      console.warn('Parser not initialized, queuing message')
      return
    }
    
    try {
      const result = parserRef.current.parseMessage(message)
      
      if (result && debugMode) {
        console.log('📥 Processed message:', {
          hasText: !!result.text,
          textLength: result.text.length,
          state: result.state,
          language: result.language
        })
      }
      
    } catch (error) {
      handleError(
        ErrorType.PARSING_ERROR,
        `Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          sessionId,
          message: typeof message === 'object' ? JSON.stringify(message).slice(0, 200) : String(message).slice(0, 200)
        },
        ErrorSeverity.MEDIUM,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }, [isInitialized, handleError, sessionId, debugMode])
  
  /**
   * Get status indicator state
   */
  const getStatusIndicatorState = useCallback(() => {
    if (connectionState === 'error') return 'error'
    if (connectionState === 'connecting') return 'connecting'
    if (connectionState === 'disconnected') return 'disconnected'
    if (isActive && text) return 'receiving'
    if (isActive) return 'listening'
    return 'listening' // Default to listening instead of idle
  }, [connectionState, isActive, text])
  
  /**
   * Handle clear action
   */
  const handleClear = useCallback(() => {
    clearText()
    if (parserRef.current) {
      parserRef.current.reset()
    }
    setLastTranscriptionTime(null)
  }, [clearText])
  
  // Don't render if not initialized
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-sm text-gray-600">Initializing transcription...</span>
      </div>
    )
  }
  
  return (
    <div
      className={cn(
        'complete-streaming-transcription',
        'relative w-full',
        className
      )}
    >
      <GlassBox
        variant="light"
        cornerRadius={12}
        className={cn(
          'streaming-container relative overflow-hidden transition-all duration-300',
          {
            'border-green-400/40 shadow-green-400/20': connectionState === 'connected' && isActive,
            'border-blue-400/40 shadow-blue-400/20': connectionState === 'connecting',
            'border-red-400/40 shadow-red-400/20': connectionState === 'error',
            'border-gray-400/20': connectionState === 'disconnected'
          }
        )}
      >
        {/* Header with status and controls */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <StreamingStateIndicator
              state={getStatusIndicatorState()}
              size="small"
            />
            
            <div className="text-sm">
              <div className="font-medium text-white/90">
                Live Transcription
              </div>
              <div className="text-xs text-white/60">
                {source} • {connectionState}
                {confidence && ` • ${Math.round(confidence * 100)}%`}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Error indicator */}
            {errorCount > 0 && (
              <div 
                className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 border border-red-500/30"
                title={`${errorCount} errors occurred`}
              >
                {errorCount} errors
              </div>
            )}
            
            {/* Last activity indicator */}
            {lastTranscriptionTime && (
              <div className="text-xs text-white/50">
                {new Date(lastTranscriptionTime).toLocaleTimeString()}
              </div>
            )}
            
            {/* Clear button */}
            {text && (
              <button
                onClick={handleClear}
                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                title="Clear transcription"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        {/* Main transcription area */}
        <div className="p-4 min-h-[100px]">
          {text ? (
            <OptimizedStreamingRenderer
              text={text}
              isPartial={isPartial}
              enableAnimations={animationSettings.enabled}
              animationSpeed={animationSettings.speed}
              showCursor={animationSettings.showCursor}
              maxLength={maxTextLength}
              enableVirtualScrolling={text.length > 1000}
              className="text-white/90 leading-6"
              styles={{
                partial: {
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontStyle: 'italic'
                },
                final: {
                  color: 'rgba(255, 255, 255, 0.95)',
                  fontWeight: '400'
                },
                container: {
                  fontSize: '15px',
                  lineHeight: '1.6'
                }
              }}
            />
          ) : isActive ? (
            <div className="flex items-center text-white/60 text-sm">
              <div className="animate-pulse w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
              Listening for speech...
            </div>
          ) : (
            <div className="text-white/50 text-sm text-center py-8">
              Click start to begin transcription
            </div>
          )}
        </div>
        
        {/* Debug information */}
        {debugMode && (
          <div className="border-t border-white/10 p-3 text-xs text-white/50 font-mono">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div>Session: {sessionId}</div>
                <div>Text Length: {text.length}</div>
                <div>Is Partial: {isPartial ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div>Errors: {errorCount}</div>
                <div>Connection: {connectionState}</div>
                <div>Active: {isActive ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </div>
        )}
      </GlassBox>
    </div>
  )
}

/**
 * Hook to integrate with existing WebSocket messages
 */
export const useCompleteStreamingTranscription = () => {
  const componentRef = useRef<{
    processMessage: (message: unknown) => void
  } | null>(null)
  
  const processMessage = useCallback((message: unknown) => {
    componentRef.current?.processMessage(message)
  }, [])
  
  return {
    processMessage,
    componentRef
  }
}

/**
 * Export the main component as default
 */
export default CompleteStreamingTranscription
