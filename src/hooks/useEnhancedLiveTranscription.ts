/**
 * Enhanced Live Transcription Hook with Advanced Timestamp Tracking
 *
 * This hook extends the basic useLiveTranscription to provide
 * advanced gap detection and timeline management capabilities.
 */

import {useState, useEffect, useCallback, useRef} from 'react'
import {
  EnhancedLiveTranscriptionBuffer,
  EnhancedLiveTranscriptionState
} from '../services/EnhancedLiveTranscriptionBuffer'
import {
  TimestampAnalysis,
  TimelineGap,
  TimestampTrackingConfig
} from '../services/TimestampTrackingService'

export interface UseEnhancedLiveTranscriptionConfig {
  // Basic transcription config
  maxSegments?: number
  retentionTime?: number
  debounceDelay?: number
  autoMergePartials?: boolean
  immediateDisplay?: boolean
  persistentDisplay?: boolean
  timestampTracking?: boolean

  // Enhanced timestamp tracking config
  timestampTrackingConfig?: Partial<TimestampTrackingConfig>

  // Callbacks for gap detection
  onGapDetected?: (gap: TimelineGap) => void
  onContinuityIssue?: (issues: string[], suggestions: string[]) => void
  onSignificantGap?: (gap: TimelineGap) => void
}

export interface UseEnhancedLiveTranscriptionReturn {
  // Basic transcription functionality
  state: EnhancedLiveTranscriptionState
  addSegment: (
    text: string,
    isPartial: boolean,
    source: string,
    audioTimestamp?: number,
    confidence?: number
  ) => string
  finalizeSegment: (segmentId: string, finalText?: string) => boolean
  clear: () => void
  startSession: () => void
  endSession: () => void
  isActive: boolean

  // Enhanced timeline functionality
  timelineAnalysis: TimestampAnalysis
  detectedGaps: TimelineGap[]
  continuityScore: number
  hasSignificantGaps: boolean
  gapRecommendations: {
    hasIssues: boolean
    recommendations: string[]
    gapsToAddress: TimelineGap[]
  }

  // Configuration management
  updateTimestampConfig: (config: Partial<TimestampTrackingConfig>) => void
  validateContinuity: () => {isValid: boolean; issues: string[]; suggestions: string[]}

  // Session analysis
  getSessionAnalysis: () => {
    finalState: EnhancedLiveTranscriptionState
    analysis: TimestampAnalysis
    continuityReport: ReturnType<EnhancedLiveTranscriptionBuffer['validateContinuity']>
  } | null
}

export function useEnhancedLiveTranscription(
  config: UseEnhancedLiveTranscriptionConfig = {}
): UseEnhancedLiveTranscriptionReturn {
  const bufferRef = useRef<EnhancedLiveTranscriptionBuffer | null>(null)
  const [state, setState] = useState<EnhancedLiveTranscriptionState>({
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
    },
    timeline: {
      analysis: {
        totalDuration: 0,
        activeTranscriptionTime: 0,
        gaps: [],
        continuityScore: 1,
        averageSegmentDuration: 0,
        longestGap: null,
        shortestGap: null
      },
      gaps: [],
      segments: [],
      continuityScore: 1
    }
  })

  const [isActive, setIsActive] = useState(false)
  const [sessionAnalysis, setSessionAnalysis] =
    useState<ReturnType<UseEnhancedLiveTranscriptionReturn['getSessionAnalysis']>>(null)

  // Initialize buffer
  useEffect(() => {
    // Create base config for LiveTranscriptionBuffer
    const baseConfig = {
      maxSegments: config.maxSegments,
      retentionTime: config.retentionTime,
      debounceDelay: config.debounceDelay,
      autoMergePartials: config.autoMergePartials,
      immediateDisplay: config.immediateDisplay,
      persistentDisplay: config.persistentDisplay,
      timestampTracking: config.timestampTracking
    }

    // Create timestamp tracking config
    const timestampTrackingConfig = {
      gapDetectionThreshold: 1000,
      maxAcceptableGap: 5000,
      estimationStrategy: 'adaptive' as const,
      enableGapFilling: false,
      timelinePrecision: 100,
      ...config.timestampTrackingConfig
    }

    const enhancedConfig = {
      ...baseConfig,
      timestampTrackingConfig
    }

    const buffer = new EnhancedLiveTranscriptionBuffer(enhancedConfig)
    bufferRef.current = buffer

    // Set up state listener
    const unsubscribe = buffer.subscribe(() => {
      // Get enhanced state instead of basic state
      const enhancedState = buffer.getEnhancedState()
      setState(enhancedState)

      // Check for new gaps and trigger callbacks
      if (config.onGapDetected) {
        const gaps = buffer.getTimelineGaps()
        const previousGaps = state.timeline.gaps
        const newGaps = gaps.filter(gap => !previousGaps.some(prevGap => prevGap.id === gap.id))
        newGaps.forEach(gap => config.onGapDetected?.(gap))
      }

      // Check for significant gaps
      if (config.onSignificantGap && buffer.hasSignificantGaps()) {
        const recommendations = buffer.getGapHandlingRecommendations()
        const significantGaps = recommendations.gapsToAddress
        significantGaps.forEach(gap => config.onSignificantGap?.(gap))
      }

      // Check continuity issues
      if (config.onContinuityIssue) {
        const validation = buffer.validateContinuity()
        if (!validation.isValid && validation.issues.length > 0) {
          config.onContinuityIssue(validation.issues, validation.suggestions)
        }
      }
    })

    return () => {
      unsubscribe()
      buffer.destroy()
    }
  }, []) // Empty dependency array for initial setup only

  const startSession = useCallback(() => {
    if (bufferRef.current) {
      bufferRef.current.startSession()
      setIsActive(true)
      setSessionAnalysis(null)
    }
  }, [])

  const endSession = useCallback(() => {
    if (bufferRef.current && isActive) {
      const analysis = bufferRef.current.endSession()
      setSessionAnalysis(analysis)
      setIsActive(false)
    }
  }, [isActive])

  const addSegment = useCallback(
    (
      text: string,
      isPartial: boolean,
      source: string,
      audioTimestamp?: number,
      confidence?: number
    ): string => {
      if (!bufferRef.current) return ''
      return bufferRef.current.addSegment(text, isPartial, source, audioTimestamp, confidence)
    },
    []
  )

  const finalizeSegment = useCallback((segmentId: string, finalText?: string): boolean => {
    if (!bufferRef.current) return false
    return bufferRef.current.finalizeSegment(segmentId, finalText)
  }, [])

  const clear = useCallback(() => {
    if (bufferRef.current) {
      bufferRef.current.clear()
    }
  }, [])

  const updateTimestampConfig = useCallback((newConfig: Partial<TimestampTrackingConfig>) => {
    if (bufferRef.current) {
      bufferRef.current.updateTimestampConfig(newConfig)
    }
  }, [])

  const validateContinuity = useCallback(() => {
    if (!bufferRef.current) {
      return {isValid: true, issues: [], suggestions: []}
    }
    return bufferRef.current.validateContinuity()
  }, [])

  const getSessionAnalysis = useCallback(() => {
    return sessionAnalysis
  }, [sessionAnalysis])

  // Derived state values
  const timelineAnalysis = state.timeline.analysis
  const detectedGaps = state.timeline.gaps
  const continuityScore = state.timeline.continuityScore
  const hasSignificantGaps = bufferRef.current?.hasSignificantGaps() ?? false
  const gapRecommendations = bufferRef.current?.getGapHandlingRecommendations() ?? {
    hasIssues: false,
    recommendations: [],
    gapsToAddress: []
  }

  return {
    // Basic functionality
    state,
    addSegment,
    finalizeSegment,
    clear,
    startSession,
    endSession,
    isActive,

    // Enhanced timeline functionality
    timelineAnalysis,
    detectedGaps,
    continuityScore,
    hasSignificantGaps,
    gapRecommendations,

    // Configuration and validation
    updateTimestampConfig,
    validateContinuity,
    getSessionAnalysis
  }
}

export default useEnhancedLiveTranscription
