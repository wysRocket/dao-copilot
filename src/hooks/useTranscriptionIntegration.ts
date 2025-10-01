/**
 * Integration hook for enhanced live transcription with existing systems
 *
 * This hook bridges the new LiveTranscriptionBuffer system with:
 * 1. TranscriptionStateManager
 * 2. StreamingTextContext
 * 3. GCP Gemini Live API Client
 * 4. Existing recording controls
 */

import {useEffect, useRef, useCallback} from 'react'
import {useTranscriptionState} from './useTranscriptionState'
import {useStreamingText} from '../contexts/StreamingTextContext'
import useLiveTranscription from './useLiveTranscription'

export interface TranscriptionIntegrationConfig {
  /** Enable automatic bridging with TranscriptionStateManager */
  bridgeStateManager?: boolean
  /** Enable automatic bridging with StreamingTextContext */
  bridgeStreamingContext?: boolean
  /** Source identifier for this integration */
  sourceId?: string
  /** Automatically start session when recording begins */
  autoStartSession?: boolean
  /** Automatically handle transcription completion */
  autoHandleCompletion?: boolean
}

export interface TranscriptionIntegrationResult {
  /** Current transcription text (always persistent) */
  currentText: string
  /** Whether actively receiving transcription data */
  isActivelyTranscribing: boolean
  /** Whether there's been recent activity */
  hasRecentActivity: boolean
  /** Performance and state information */
  stats: {
    segmentCount: number
    sessionDuration: number
    memoryUsage: number
    averageConfidence: number
  }

  /** Manually inject transcription data */
  injectTranscription: (text: string, isPartial: boolean, source?: string) => void
  /** Start a new transcription session */
  startSession: () => void
  /** End the current session */
  endSession: () => void
  /** Clear all transcription data (if not persistent) */
  clearAll: () => void
}

/**
 * Hook that integrates enhanced live transcription with existing systems
 */
export function useTranscriptionIntegration(
  config: TranscriptionIntegrationConfig = {}
): TranscriptionIntegrationResult {
  const {
    bridgeStateManager = true,
    bridgeStreamingContext = true,
    sourceId = 'integrated-transcription',
    autoStartSession = true,
    autoHandleCompletion = true
  } = config

  // Initialize the enhanced live transcription system
  const {
    currentText,
    isActivelyStreaming,
    hasRecentActivity,
    state,
    performanceStats,
    startSession: startLiveSession,
    endSession: endLiveSession,
    addSegment,
    clearTranscription
  } = useLiveTranscription({
    immediateDisplay: true,
    persistentDisplay: true,
    timestampTracking: true,
    autoMergePartials: true,
    maxSegments: 2000,
    retentionTime: 7200000, // 2 hours
    debounceDelay: 50
  })

  // Get existing transcription systems
  const transcriptionState = useTranscriptionState()
  const streamingTextContext = useStreamingText()

  // Track integration state
  const isSessionActiveRef = useRef(false)
  const lastBridgedTextRef = useRef('')

  // Control methods (defined early to avoid dependency issues)
  const startSession = useCallback(() => {
    console.log('🔴 TranscriptionIntegration: Starting integrated session')

    isSessionActiveRef.current = true
    startLiveSession()

    // Reset bridging state
    lastBridgedTextRef.current = ''
  }, [startLiveSession])

  const endSession = useCallback(() => {
    console.log('🔴 TranscriptionIntegration: Ending integrated session')

    isSessionActiveRef.current = false
    endLiveSession()
  }, [endLiveSession])

  const injectTranscription = useCallback(
    (text: string, isPartial: boolean, source?: string) => {
      console.log('🔴 TranscriptionIntegration: Manual transcription injection:', {
        text: text.substring(0, 50) + '...',
        isPartial,
        source
      })

      // Auto-start session if not active
      if (!isSessionActiveRef.current && autoStartSession) {
        startSession()
      }

      addSegment(text, isPartial, source || sourceId, undefined, undefined, {manual: true})
    },
    [addSegment, sourceId, autoStartSession, startSession]
  )

  const clearAll = useCallback(() => {
    console.log('🔴 TranscriptionIntegration: Clearing all transcription data')

    clearTranscription()
    lastBridgedTextRef.current = ''
  }, [clearTranscription])

  // Bridge with TranscriptionStateManager
  useEffect(() => {
    if (!bridgeStateManager || !transcriptionState) return

    const handleStateChange = () => {
      const currentState = transcriptionState.state

      // Handle streaming transcription updates
      if (currentState.streaming.current && currentState.streaming.isActive) {
        const streamingText = currentState.streaming.current.text
        const isPartial = currentState.streaming.current.isPartial

        // Only bridge if text has changed
        if (streamingText !== lastBridgedTextRef.current) {
          console.log('🔴 TranscriptionIntegration: Bridging from StateManager:', {
            text: streamingText.substring(0, 50) + '...',
            isPartial,
            source: currentState.streaming.current.source
          })

          addSegment(
            streamingText,
            isPartial,
            `statemanager-${currentState.streaming.current.source}`,
            undefined,
            currentState.streaming.current.confidence
          )

          lastBridgedTextRef.current = streamingText
        }
      }

      // Auto-start session when recording begins
      if (autoStartSession && currentState.recording.isRecording && !isSessionActiveRef.current) {
        console.log('🔴 TranscriptionIntegration: Auto-starting session (recording detected)')
        startSession()
      }

      // Auto-end session when recording stops
      if (
        autoHandleCompletion &&
        !currentState.recording.isRecording &&
        isSessionActiveRef.current
      ) {
        console.log('🔴 TranscriptionIntegration: Auto-ending session (recording stopped)')
        endSession()
      }
    }

    // Initial state check
    handleStateChange()

    // For now, we'll poll the state since subscribe might not be available
    const interval = setInterval(handleStateChange, 500)

    return () => clearInterval(interval)
  }, [
    bridgeStateManager,
    transcriptionState,
    addSegment,
    autoStartSession,
    autoHandleCompletion,
    startSession,
    endSession
  ])

  // Bridge with StreamingTextContext
  useEffect(() => {
    if (!bridgeStreamingContext || !streamingTextContext) return

    const {currentStreamingText, isStreamingActive, isCurrentTextPartial} = streamingTextContext

    // Bridge streaming text updates
    if (currentStreamingText && currentStreamingText !== lastBridgedTextRef.current) {
      console.log('🔴 TranscriptionIntegration: Bridging from StreamingContext:', {
        text: currentStreamingText.substring(0, 50) + '...',
        isPartial: isCurrentTextPartial,
        isActive: isStreamingActive
      })

      addSegment(
        currentStreamingText,
        isCurrentTextPartial,
        'streaming-context',
        undefined,
        undefined,
        {bridged: true}
      )

      lastBridgedTextRef.current = currentStreamingText
    }

    // Auto-start session when streaming becomes active
    if (autoStartSession && isStreamingActive && !isSessionActiveRef.current) {
      console.log('🔴 TranscriptionIntegration: Auto-starting session (streaming active)')
      startSession()
    }
  }, [bridgeStreamingContext, streamingTextContext, addSegment, autoStartSession, startSession])

  // Calculate aggregated stats
  const stats = {
    segmentCount: performanceStats.segmentCount,
    sessionDuration: Math.round(state.totalDuration / 1000),
    memoryUsage: performanceStats.memoryUsage,
    averageConfidence: state.stats.averageConfidence
  }

  return {
    currentText,
    isActivelyTranscribing: isActivelyStreaming,
    hasRecentActivity,
    stats,
    injectTranscription,
    startSession,
    endSession,
    clearAll
  }
}

export default useTranscriptionIntegration
