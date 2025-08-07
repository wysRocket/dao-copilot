import React, {useEffect, useState, useCallback, useRef} from 'react'
import {RealTimeTranscriptionService} from '../services/real-time-transcription-service'

interface TranscriptionChunk {
  text: string
  isFinal: boolean
  confidence?: number
  timestamp: number
}

interface UseRealTimeTranscriptionOptions {
  autoStart?: boolean
  confidenceThreshold?: number
}

interface TranscriptionState {
  isInitialized: boolean
  isConnected: boolean
  currentTranscript: string
  finalTranscripts: TranscriptionChunk[]
  error: string | null
  latency: number
  reconnectAttempts: number
  setupComplete: boolean
}

/**
 * React hook for ultra-low latency real-time transcription
 * Provides instant speech-to-text with persistent connections
 */
export function useRealTimeTranscription(options: UseRealTimeTranscriptionOptions = {}) {
  const {autoStart = false, confidenceThreshold = 0.5} = options

  const serviceRef = useRef<RealTimeTranscriptionService | null>(null)
  const [state, setState] = useState<TranscriptionState>({
    isInitialized: false,
    isConnected: false,
    currentTranscript: '',
    finalTranscripts: [],
    error: null,
    latency: 0,
    reconnectAttempts: 0,
    setupComplete: false
  })

  // Initialize service
  const initialize = useCallback(async () => {
    try {
      console.log('🚀 Initializing real-time transcription...')

      if (serviceRef.current) {
        serviceRef.current.stop()
      }

      serviceRef.current = new RealTimeTranscriptionService()

      // Set up event listeners
      serviceRef.current.on('initialized', () => {
        setState(prev => ({
          ...prev,
          isInitialized: true,
          isConnected: true,
          setupComplete: true,
          error: null
        }))
        console.log('✅ Real-time transcription initialized')
      })

      serviceRef.current.on('transcription', (chunk: TranscriptionChunk) => {
        setState(prev => {
          if (chunk.isFinal) {
            // Add to final transcripts if confidence is high enough
            if (!chunk.confidence || chunk.confidence >= confidenceThreshold) {
              return {
                ...prev,
                currentTranscript: '',
                finalTranscripts: [...prev.finalTranscripts, chunk],
                latency: performance.now() - chunk.timestamp
              }
            }
            return {...prev, currentTranscript: ''}
          } else {
            // Update current (interim) transcript
            return {
              ...prev,
              currentTranscript: chunk.text,
              latency: performance.now() - chunk.timestamp
            }
          }
        })
      })

      serviceRef.current.on('error', (error: Error) => {
        setState(prev => ({
          ...prev,
          error: error.message,
          isConnected: false
        }))
        console.error('❌ Transcription error:', error)
      })

      serviceRef.current.on('stopped', () => {
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isConnected: false,
          setupComplete: false,
          currentTranscript: '',
          error: null
        }))
        console.log('🛑 Real-time transcription stopped')
      })

      await serviceRef.current.initialize()
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isInitialized: false,
        isConnected: false
      }))
      console.error('❌ Failed to initialize real-time transcription:', error)
    }
  }, [confidenceThreshold])

  // Start transcription
  const start = useCallback(async () => {
    if (!serviceRef.current) {
      await initialize()
    } else if (!state.isConnected) {
      await initialize()
    }
  }, [initialize, state.isConnected])

  // Stop transcription
  const stop = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stop()
      serviceRef.current = null
    }
  }, [])

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentTranscript: '',
      finalTranscripts: []
    }))
  }, [])

  // Get status
  const getStatus = useCallback(() => {
    if (serviceRef.current) {
      const status = serviceRef.current.getStatus()
      setState(prev => ({
        ...prev,
        latency: status.latency,
        reconnectAttempts: status.reconnectAttempts,
        isConnected: status.connected,
        setupComplete: status.setupComplete
      }))
      return status
    }
    return {connected: false, latency: 0, reconnectAttempts: 0, setupComplete: false}
  }, [])

  // Auto-start if requested
  useEffect(() => {
    if (autoStart) {
      start()
    }

    return () => {
      stop()
    }
  }, [autoStart, start, stop])

  // Update status periodically
  useEffect(() => {
    const interval = setInterval(getStatus, 1000)
    return () => clearInterval(interval)
  }, [getStatus])

  return {
    // State
    isInitialized: state.isInitialized,
    isConnected: state.isConnected,
    currentTranscript: state.currentTranscript,
    finalTranscripts: state.finalTranscripts,
    error: state.error,
    latency: state.latency,
    reconnectAttempts: state.reconnectAttempts,
    setupComplete: state.setupComplete,

    // Actions
    start,
    stop,
    clearTranscripts,
    getStatus,

    // Computed
    allTranscripts: [
      ...state.finalTranscripts,
      ...(state.currentTranscript
        ? [
            {
              text: state.currentTranscript,
              isFinal: false,
              timestamp: Date.now()
            }
          ]
        : [])
    ],

    isActive: state.isInitialized && state.isConnected && state.setupComplete,
    hasError: !!state.error
  }
}

/**
 * Real-time transcription status component
 */
export const RealTimeTranscriptionStatus: React.FC<{
  latency: number
  isConnected: boolean
  reconnectAttempts: number
  error?: string | null
}> = ({latency, isConnected, reconnectAttempts, error}) => {
  const getStatusColor = () => {
    if (error) return 'text-red-500'
    if (!isConnected) return 'text-yellow-500'
    if (latency < 100) return 'text-green-500'
    if (latency < 500) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getStatusText = () => {
    if (error) return `Error: ${error}`
    if (!isConnected) return 'Disconnected'
    if (reconnectAttempts > 0) return `Connected (${reconnectAttempts} reconnects)`
    return 'Connected'
  }

  return (
    <div className={`font-mono text-sm ${getStatusColor()}`}>
      <div className="flex items-center space-x-2">
        <div
          className={`h-2 w-2 rounded-full ${
            isConnected && !error
              ? 'animate-pulse bg-green-500'
              : error
                ? 'bg-red-500'
                : 'bg-yellow-500'
          }`}
        />
        <span>{getStatusText()}</span>
        {isConnected && !error && (
          <span className="text-gray-400">• {latency.toFixed(0)}ms latency</span>
        )}
      </div>
    </div>
  )
}
