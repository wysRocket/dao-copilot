/**
 * React hook for live transcription display with persistent, continuous text
 *
 * This hook ensures:
 * 1. Text appears immediately when recording starts
 * 2. Text never disappears during the session
 * 3. Smooth transitions between partial and final results
 * 4. Optimized performance for real-time updates
 */

import {useState, useEffect, useRef, useCallback} from 'react'
import {LiveTranscriptionBuffer, LiveTranscriptionState} from '../services/LiveTranscriptionBuffer'

export interface LiveTranscriptionHookConfig {
  /** Show text immediately when recording starts */
  immediateDisplay?: boolean
  /** Never clear text during session */
  persistentDisplay?: boolean
  /** Track audio timestamps for continuity */
  timestampTracking?: boolean
  /** Auto-merge consecutive partial results */
  autoMergePartials?: boolean
  /** Maximum number of segments to keep in memory */
  maxSegments?: number
  /** How long to keep segments before cleanup (ms) */
  retentionTime?: number
  /** Debounce delay for UI updates (ms) */
  debounceDelay?: number
}

export interface LiveTranscriptionHookResult {
  /** Current complete transcription text */
  currentText: string
  /** Whether transcription is actively streaming */
  isActivelyStreaming: boolean
  /** Whether there's been recent activity */
  hasRecentActivity: boolean
  /** Current transcription state */
  state: LiveTranscriptionState
  /** Performance statistics */
  performanceStats: {
    segmentCount: number
    averageSegmentLength: number
    memoryUsage: number
    updateFrequency: number
  }

  // Control methods
  /** Start a new transcription session */
  startSession: (audioStartTime?: number) => void
  /** End the current session */
  endSession: () => void
  /** Add a transcription segment */
  addSegment: (
    text: string,
    isPartial: boolean,
    source?: string,
    audioTimestamp?: number,
    confidence?: number,
    metadata?: Record<string, unknown>
  ) => string
  /** Finalize a partial segment */
  finalizeSegment: (segmentId: string, finalText?: string) => boolean
  /** Clear all segments (only if persistent display is disabled) */
  clearTranscription: () => void
  /** Update configuration */
  updateConfig: (newConfig: Partial<LiveTranscriptionHookConfig>) => void
}

/**
 * Hook for managing live transcription display with continuity
 */
export function useLiveTranscription(
  config: LiveTranscriptionHookConfig = {}
): LiveTranscriptionHookResult {
  // Default configuration optimized for live display
  const defaultConfig: Required<LiveTranscriptionHookConfig> = {
    immediateDisplay: true,
    persistentDisplay: true,
    timestampTracking: true,
    autoMergePartials: true,
    maxSegments: 1000,
    retentionTime: 3600000, // 1 hour
    debounceDelay: 100 // Smooth but responsive
  }

  const finalConfig = {...defaultConfig, ...config}

  // State for UI rendering
  const [transcriptionState, setTranscriptionState] = useState<LiveTranscriptionState>({
    segments: [],
    currentText: '',
    isActivelyStreaming: false,
    lastUpdateTime: 0,
    sessionStartTime: 0,
    totalDuration: 0,
    stats: {
      totalSegments: 0,
      partialSegments: 0,
      finalSegments: 0,
      corrections: 0,
      averageConfidence: 0
    }
  })

  const [performanceStats, setPerformanceStats] = useState({
    segmentCount: 0,
    averageSegmentLength: 0,
    memoryUsage: 0,
    updateFrequency: 0
  })

  // Refs for the buffer and listeners
  const bufferRef = useRef<LiveTranscriptionBuffer | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const performanceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize buffer on mount
  useEffect(() => {
    console.log('🔴 useLiveTranscription: Initializing buffer with config:', finalConfig)

    bufferRef.current = new LiveTranscriptionBuffer(finalConfig)

    // Subscribe to state changes
    unsubscribeRef.current = bufferRef.current.subscribe((state: LiveTranscriptionState) => {
      console.log('🔴 useLiveTranscription: State update:', {
        currentText: state.currentText.substring(0, 50) + '...',
        segmentCount: state.segments.length,
        isActivelyStreaming: state.isActivelyStreaming
      })

      setTranscriptionState(state)
    })

    // Set up performance monitoring
    performanceTimerRef.current = setInterval(() => {
      if (bufferRef.current) {
        setPerformanceStats(bufferRef.current.getPerformanceStats())
      }
    }, 1000) // Update performance stats every second

    return () => {
      // Cleanup on unmount
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }

      if (performanceTimerRef.current) {
        clearInterval(performanceTimerRef.current)
      }

      if (bufferRef.current) {
        bufferRef.current.destroy()
      }
    }
  }, []) // Only run once on mount

  // Update buffer config when config changes
  useEffect(() => {
    if (bufferRef.current) {
      bufferRef.current.updateConfig(finalConfig)
    }
  }, [finalConfig])

  // Control methods
  const startSession = useCallback((audioStartTime?: number) => {
    console.log('🔴 useLiveTranscription: Starting session')

    if (bufferRef.current) {
      bufferRef.current.startSession(audioStartTime)
    }
  }, [])

  const endSession = useCallback(() => {
    console.log('🔴 useLiveTranscription: Ending session')

    if (bufferRef.current) {
      bufferRef.current.endSession()
    }
  }, [])

  const addSegment = useCallback(
    (
      text: string,
      isPartial: boolean,
      source: string = 'unknown',
      audioTimestamp?: number,
      confidence?: number,
      metadata?: Record<string, unknown>
    ): string => {
      if (!bufferRef.current) {
        console.warn('useLiveTranscription: Cannot add segment - buffer not initialized')
        return ''
      }

      return bufferRef.current.addSegment(
        text,
        isPartial,
        source,
        audioTimestamp,
        confidence,
        metadata
      )
    },
    []
  )

  const finalizeSegment = useCallback((segmentId: string, finalText?: string): boolean => {
    if (!bufferRef.current) {
      console.warn('useLiveTranscription: Cannot finalize segment - buffer not initialized')
      return false
    }

    return bufferRef.current.finalizeSegment(segmentId, finalText)
  }, [])

  const clearTranscription = useCallback(() => {
    console.log('🔴 useLiveTranscription: Clearing transcription')

    if (bufferRef.current) {
      bufferRef.current.clear()
    }
  }, [])

  const updateConfig = useCallback((newConfig: Partial<LiveTranscriptionHookConfig>) => {
    console.log('🔴 useLiveTranscription: Updating config:', newConfig)

    if (bufferRef.current) {
      bufferRef.current.updateConfig(newConfig)
    }
  }, [])

  // Derived state
  const hasRecentActivity = bufferRef.current?.hasRecentActivity() || false

  return {
    currentText: transcriptionState.currentText,
    isActivelyStreaming: transcriptionState.isActivelyStreaming,
    hasRecentActivity,
    state: transcriptionState,
    performanceStats,

    // Control methods
    startSession,
    endSession,
    addSegment,
    finalizeSegment,
    clearTranscription,
    updateConfig
  }
}

export default useLiveTranscription
