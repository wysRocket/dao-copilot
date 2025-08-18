import React, {useEffect, useState, useCallback, useRef} from 'react'
import {RealTimeTranscriptionService} from '../services/real-time-transcription-service'
import {useTranscriptStore} from '../state/transcript-state'

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
  const lastPartialRef = useRef<string>('')
  const bestSoFarRef = useRef<string>('')
  const lastTwoPartialsRef = useRef<string[]>([])

  // Find the largest suffix of 'a' that matches the prefix of 'b' (overlap-aware merge)
  function mergeWithOverlap(a: string, b: string): string {
    const A = (a || '').trim()
    const B = (b || '').trim()
    if (!A) return B
    if (!B) return A
    if (A === B) return A
    if (B.includes(A)) return B
    if (A.includes(B)) return A

    // Hyphen first, brackets not escaped to satisfy TS/ESLint rules
    const stripPunc = (s: string) => s.replace(/[-()[\],.!?;:{}"'“”‘’—–]/g, '')
    const eqLoose = (x: string, y: string) =>
      x === y ||
      x.toLowerCase() === y.toLowerCase() ||
      stripPunc(x).toLowerCase() === stripPunc(y).toLowerCase()

    // Limit overlap search to reasonable window to avoid O(n^2) cost on long strings
    const maxOverlap = Math.min(80, Math.min(A.length, B.length))
    for (let len = maxOverlap; len > 0; len--) {
      const suffix = A.slice(-len)
      const prefix = B.slice(0, len)
      if (eqLoose(suffix, prefix)) {
        return (A + B.slice(len)).replace(/\s+/g, ' ').trim()
      }
    }
    // No overlap found, just join with a space
    return (A + ' ' + B).replace(/\s+/g, ' ').trim()
  }

  // Merge logic for partial updates coming from different accumulation strategies
  function accumulateStreamingText(prevText: string, incomingText: string): string {
    return mergeWithOverlap(prevText, incomingText)
  }

  // Keep an accumulation buffer to prevent dropped partials
  const bufferRef = useRef<string>('')

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
          setupComplete: false,
          error: null
        }))
        console.log('✅ Real-time transcription initialized')
      })

      // Reflect setup-complete from service
      serviceRef.current.on('setup-complete', () => {
        setState(prev => ({
          ...prev,
          setupComplete: true
        }))
      })

      serviceRef.current.on('transcription', (chunk: TranscriptionChunk) => {
        setState(prev => {
          if (chunk.isFinal) {
            // Choose the most complete text between accumulated partials and incoming final
            const prevPartial = (bestSoFarRef.current || lastPartialRef.current || '').trim()
            const incoming = (chunk.text || '').trim()

            // Prefer overlap-aware merging to avoid dropped or duplicated words
            let finalText = incoming
            if (prevPartial && incoming) finalText = mergeWithOverlap(prevPartial, incoming)
            else if (prevPartial) finalText = prevPartial

            // Clear buffers on final
            lastPartialRef.current = ''
            bestSoFarRef.current = ''
            bufferRef.current = ''

            const finalChunk: TranscriptionChunk = {
              ...chunk,
              text: finalText,
              isFinal: true
            }

            if (!finalChunk.confidence || finalChunk.confidence >= confidenceThreshold) {
              return {
                ...prev,
                currentTranscript: '',
                finalTranscripts: [...prev.finalTranscripts, finalChunk],
                latency: performance.now() - chunk.timestamp
              }
            }

            return {...prev, currentTranscript: ''}
          }

          // Accumulate interim transcript robustly to prevent missing words
          const incoming = (chunk.text || '').trim()
          const prevText = (lastPartialRef.current || '').trim()
          let nextText = accumulateStreamingText(prevText, incoming)

          // Maintain a regression-proof best-so-far buffer
          const best = (bestSoFarRef.current || '').trim()
          if (!best) {
            bestSoFarRef.current = nextText
          } else if (nextText.includes(best)) {
            bestSoFarRef.current = nextText
          } else if (best.includes(nextText)) {
            // Keep more complete text
            nextText = best
          } else {
            // Merge to avoid drops at boundaries
            bestSoFarRef.current = mergeWithOverlap(best, nextText)
            nextText = bestSoFarRef.current
          }

          // Track last two partials (debug aid)
          const history = lastTwoPartialsRef.current
          history.push(incoming)
          if (history.length > 2) history.shift()

          lastPartialRef.current = nextText
          bufferRef.current = nextText

          return {
            ...prev,
            currentTranscript: bestSoFarRef.current || nextText,
            latency: performance.now() - chunk.timestamp
          }
        })

        // Ensure global UI shows streaming on first partial
        try {
          useTranscriptStore.getState().startStreaming()
        } catch {
          // no-op
        }
      })

      serviceRef.current.on('error', (error: Error) => {
        setState(prev => ({
          ...prev,
          error: error.message,
          isConnected: false
        }))
        console.error('❌ Transcription error:', error)
      })
      // no-op

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

        // Turn off global streaming UI on stop
        try {
          useTranscriptStore.getState().stopStreaming()
        } catch {
          // no-op
        }
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
      // Optimistically toggle global streaming UI on start
      try {
        useTranscriptStore.getState().startStreaming()
      } catch {
        // no-op
      }
      await initialize()
    } else if (!state.isConnected) {
      try {
        useTranscriptStore.getState().startStreaming()
      } catch {
        // no-op
      }
      await initialize()
    }
  }, [initialize, state.isConnected])

  // Stop transcription
  const stop = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stop()
      serviceRef.current = null
    }
    // Also ensure UI reflects stopped state
    try {
      useTranscriptStore.getState().stopStreaming()
    } catch {
      // no-op
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
