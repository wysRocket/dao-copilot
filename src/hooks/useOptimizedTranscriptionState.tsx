/**
 * Optimized State Management for Real-Time Transcription
 * Uses React 18 features and performance optimizations
 */

import {
  useState,
  useCallback,
  useMemo,
  useDeferredValue,
  useTransition,
  useRef,
  useEffect
} from 'react'
import {produce} from 'immer'

export interface TranscriptionSegment {
  id: string
  text: string
  confidence: number
  isPartial: boolean
  timestamp: number
  startTime?: number
  endTime?: number
  speaker?: string
}

export interface TranscriptionState {
  segments: TranscriptionSegment[]
  currentSegment: TranscriptionSegment | null
  isActive: boolean
  totalWords: number
  averageConfidence: number
  sessionDuration: number
  lastUpdate: number
}

export interface TranscriptionActions {
  addSegment: (segment: TranscriptionSegment) => void
  updateCurrentSegment: (text: string, confidence?: number) => void
  finalizeCurrentSegment: () => void
  clearTranscripts: () => void
  setActive: (active: boolean) => void
  removeSegment: (id: string) => void
  updateSegment: (id: string, updates: Partial<TranscriptionSegment>) => void
}

export interface UseOptimizedTranscriptionStateOptions {
  maxSegments?: number
  enableDeferredUpdates?: boolean
  enableTransitions?: boolean
  autoCleanup?: boolean
  cleanupThreshold?: number
}

const createInitialState = (): TranscriptionState => ({
  segments: [],
  currentSegment: null,
  isActive: false,
  totalWords: 0,
  averageConfidence: 0,
  sessionDuration: 0,
  lastUpdate: Date.now()
})

export const useOptimizedTranscriptionState = (
  options: UseOptimizedTranscriptionStateOptions = {}
) => {
  const {
    maxSegments = 1000,
    enableDeferredUpdates = true,
    enableTransitions = true,
    autoCleanup = true,
    cleanupThreshold = 500
  } = options

  // Core state with immer for immutable updates
  const [state, setState] = useState<TranscriptionState>(createInitialState)

  // React 18: Use transitions for non-urgent updates
  const [isPending, startTransition] = useTransition()

  // React 18: Defer expensive computations
  const deferredSegments = enableDeferredUpdates ? useDeferredValue(state.segments) : state.segments

  // Performance tracking
  const sessionStartRef = useRef<number>(Date.now())
  const updateCountRef = useRef<number>(0)
  const lastCleanupRef = useRef<number>(Date.now())

  /**
   * Generate unique segment ID
   */
  const generateSegmentId = useCallback(() => {
    return `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  /**
   * Calculate derived state (memoized for performance)
   */
  const derivedState = useMemo(() => {
    const segments = deferredSegments
    const totalWords = segments.reduce(
      (count, segment) => count + segment.text.split(/\s+/).filter(word => word.length > 0).length,
      0
    )

    const totalConfidence = segments.reduce((sum, segment) => sum + segment.confidence, 0)
    const averageConfidence = segments.length > 0 ? totalConfidence / segments.length : 0

    const sessionDuration = Date.now() - sessionStartRef.current

    return {
      totalWords,
      averageConfidence,
      sessionDuration,
      segmentCount: segments.length,
      wordsPerMinute: sessionDuration > 0 ? totalWords / (sessionDuration / 60000) : 0
    }
  }, [deferredSegments])

  /**
   * Optimized state updater using immer
   */
  const updateState = useCallback(
    (updater: (draft: TranscriptionState) => void) => {
      updateCountRef.current++

      const performUpdate = () => {
        setState(currentState =>
          produce(currentState, draft => {
            updater(draft)
            draft.lastUpdate = Date.now()
          })
        )
      }

      if (enableTransitions && updateCountRef.current % 10 !== 0) {
        // Use transition for non-critical updates (every 10th update is immediate)
        startTransition(performUpdate)
      } else {
        // Immediate update for critical changes
        performUpdate()
      }
    },
    [enableTransitions]
  )

  /**
   * Add a new transcription segment
   */
  const addSegment = useCallback(
    (segment: TranscriptionSegment) => {
      updateState(draft => {
        // Finalize current segment if exists
        if (draft.currentSegment && !draft.currentSegment.isPartial) {
          draft.segments.push(draft.currentSegment)
          draft.currentSegment = null
        }

        // Add new segment
        if (segment.isPartial) {
          draft.currentSegment = segment
        } else {
          draft.segments.push(segment)
        }

        // Auto-cleanup if enabled
        if (autoCleanup && draft.segments.length > maxSegments) {
          const excessCount = draft.segments.length - cleanupThreshold
          draft.segments.splice(0, excessCount)
        }
      })
    },
    [updateState, autoCleanup, maxSegments, cleanupThreshold]
  )

  /**
   * Update the current partial segment
   */
  const updateCurrentSegment = useCallback(
    (text: string, confidence = 0.8) => {
      updateState(draft => {
        if (draft.currentSegment) {
          draft.currentSegment.text = text
          draft.currentSegment.confidence = confidence
          draft.currentSegment.timestamp = Date.now()
        } else {
          draft.currentSegment = {
            id: generateSegmentId(),
            text,
            confidence,
            isPartial: true,
            timestamp: Date.now()
          }
        }
      })
    },
    [updateState, generateSegmentId]
  )

  /**
   * Finalize the current segment
   */
  const finalizeCurrentSegment = useCallback(() => {
    updateState(draft => {
      if (draft.currentSegment) {
        draft.currentSegment.isPartial = false
        draft.currentSegment.endTime = Date.now()
        draft.segments.push(draft.currentSegment)
        draft.currentSegment = null
      }
    })
  }, [updateState])

  /**
   * Clear all transcription data
   */
  const clearTranscripts = useCallback(() => {
    updateState(draft => {
      draft.segments = []
      draft.currentSegment = null
      draft.totalWords = 0
      draft.averageConfidence = 0
    })

    // Reset session tracking
    sessionStartRef.current = Date.now()
    updateCountRef.current = 0
    lastCleanupRef.current = Date.now()
  }, [updateState])

  /**
   * Set transcription active state
   */
  const setActive = useCallback(
    (active: boolean) => {
      updateState(draft => {
        draft.isActive = active

        if (active) {
          sessionStartRef.current = Date.now()
        } else {
          // Finalize any partial segment when stopping
          if (draft.currentSegment) {
            draft.currentSegment.isPartial = false
            draft.currentSegment.endTime = Date.now()
            draft.segments.push(draft.currentSegment)
            draft.currentSegment = null
          }
        }
      })
    },
    [updateState]
  )

  /**
   * Remove a specific segment
   */
  const removeSegment = useCallback(
    (id: string) => {
      updateState(draft => {
        const index = draft.segments.findIndex(segment => segment.id === id)
        if (index !== -1) {
          draft.segments.splice(index, 1)
        }
      })
    },
    [updateState]
  )

  /**
   * Update a specific segment
   */
  const updateSegment = useCallback(
    (id: string, updates: Partial<TranscriptionSegment>) => {
      updateState(draft => {
        const segment = draft.segments.find(s => s.id === id)
        if (segment) {
          Object.assign(segment, updates)
        }
      })
    },
    [updateState]
  )

  /**
   * Auto-cleanup effect
   */
  useEffect(() => {
    if (!autoCleanup) return

    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      const timeSinceLastCleanup = now - lastCleanupRef.current

      // Run cleanup every 30 seconds
      if (timeSinceLastCleanup > 30000 && state.segments.length > cleanupThreshold) {
        updateState(draft => {
          const excessCount = Math.floor(draft.segments.length * 0.1) // Remove 10%
          draft.segments.splice(0, excessCount)
        })
        lastCleanupRef.current = now
      }
    }, 30000) // Check every 30 seconds

    return () => clearInterval(cleanupInterval)
  }, [autoCleanup, cleanupThreshold, state.segments.length, updateState])

  // Actions object
  const actions: TranscriptionActions = useMemo(
    () => ({
      addSegment,
      updateCurrentSegment,
      finalizeCurrentSegment,
      clearTranscripts,
      setActive,
      removeSegment,
      updateSegment
    }),
    [
      addSegment,
      updateCurrentSegment,
      finalizeCurrentSegment,
      clearTranscripts,
      setActive,
      removeSegment,
      updateSegment
    ]
  )

  // Combined state with derived values
  const enhancedState = useMemo(
    () => ({
      ...state,
      ...derivedState,
      isPending,
      updateCount: updateCountRef.current
    }),
    [state, derivedState, isPending]
  )

  return {
    state: enhancedState,
    actions,
    deferredSegments,

    // Performance utilities
    getPerformanceMetrics: () => ({
      updateCount: updateCountRef.current,
      sessionDuration: Date.now() - sessionStartRef.current,
      averageUpdatesPerSecond:
        updateCountRef.current / ((Date.now() - sessionStartRef.current) / 1000),
      memoryUsage: state.segments.length,
      isPending
    }),

    // Advanced utilities
    exportTranscripts: () =>
      state.segments.map(segment => ({
        text: segment.text,
        confidence: segment.confidence,
        timestamp: segment.timestamp,
        startTime: segment.startTime,
        endTime: segment.endTime
      })),

    getTranscriptText: (includePartial = true) => {
      let text = state.segments.map(s => s.text).join(' ')
      if (includePartial && state.currentSegment) {
        text += (text ? ' ' : '') + state.currentSegment.text
      }
      return text
    },

    // Search functionality
    searchSegments: (query: string) => {
      const lowercaseQuery = query.toLowerCase()
      return state.segments.filter(segment => segment.text.toLowerCase().includes(lowercaseQuery))
    }
  }
}

export default useOptimizedTranscriptionState
