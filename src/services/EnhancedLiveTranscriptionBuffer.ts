/**
 * Enhanced Live Transcription Buffer with Advanced Timestamp Tracking
 *
 * This service extends the basic LiveTranscriptionBuffer to integrate
 * the TimestampTrackingService for advanced gap detection and timeline management.
 */

import {
  LiveTranscriptionBuffer,
  LiveTranscriptionBufferConfig,
  LiveTranscriptionState
} from './LiveTranscriptionBuffer'
import {
  TimestampTrackingService,
  TimestampAnalysis,
  TimelineGap,
  TimelineSegment,
  TimestampTrackingConfig
} from './TimestampTrackingService'

export interface EnhancedLiveTranscriptionState extends LiveTranscriptionState {
  timeline: {
    analysis: TimestampAnalysis
    gaps: TimelineGap[]
    segments: TimelineSegment[]
    continuityScore: number
  }
}

export interface EnhancedLiveTranscriptionConfig extends LiveTranscriptionBufferConfig {
  timestampTrackingConfig: TimestampTrackingConfig
}

export class EnhancedLiveTranscriptionBuffer extends LiveTranscriptionBuffer {
  private timestampService: TimestampTrackingService
  private enhancedConfig: EnhancedLiveTranscriptionConfig

  constructor(config?: Partial<EnhancedLiveTranscriptionConfig>) {
    const defaultTimestampConfig: TimestampTrackingConfig = {
      gapDetectionThreshold: 1000, // 1 second
      maxAcceptableGap: 5000, // 5 seconds
      estimationStrategy: 'adaptive',
      enableGapFilling: false,
      timelinePrecision: 100 // 100ms precision
    }

    const defaultEnhancedConfig: EnhancedLiveTranscriptionConfig = {
      // Base LiveTranscriptionBuffer config
      maxSegments: 1000,
      retentionTime: 3600000, // 1 hour
      debounceDelay: 100,
      autoMergePartials: true,
      immediateDisplay: true,
      persistentDisplay: true,
      timestampTracking: true,
      // Enhanced timestamp tracking config
      timestampTrackingConfig: defaultTimestampConfig
    }

    const mergedConfig = {...defaultEnhancedConfig, ...config}
    super(mergedConfig)
    this.enhancedConfig = mergedConfig

    this.timestampService = new TimestampTrackingService(
      this.enhancedConfig.timestampTrackingConfig
    )
  }

  /**
   * Start a new transcription session with enhanced timestamp tracking
   */
  public startSession(): void {
    super.startSession()
    this.timestampService.startSession(Date.now())
  }

  /**
   * Add a segment with enhanced timestamp tracking
   */
  public addSegment(
    text: string,
    isPartial: boolean,
    source: string,
    audioTimestamp?: number,
    confidence?: number
  ): string {
    // Call parent method to get segment ID
    const segmentId = super.addSegment(text, isPartial, source, audioTimestamp, confidence)

    // Get the added segment from parent
    const segments = super.getState().segments
    const addedSegment = segments.find(s => s.id === segmentId)

    if (addedSegment) {
      // Add to timeline service for gap detection
      this.timestampService.addSegment(
        segmentId,
        text,
        isPartial,
        addedSegment.startTime,
        addedSegment.endTime,
        confidence
      )
    }

    return segmentId
  }

  /**
   * Finalize a segment with timeline update
   */
  public finalizeSegment(segmentId: string, finalText?: string): boolean {
    const success = super.finalizeSegment(segmentId, finalText)

    if (success) {
      const segments = super.getState().segments
      const finalizedSegment = segments.find(s => s.id === segmentId)

      if (finalizedSegment && finalText) {
        this.timestampService.finalizeSegment(segmentId, finalText, finalizedSegment.endTime)
      }
    }

    return success
  }

  /**
   * Get enhanced state with timeline information
   */
  public getEnhancedState(): EnhancedLiveTranscriptionState {
    const baseState = super.getState()
    const analysis = this.timestampService.getTimestampAnalysis()
    const gaps = this.timestampService.getDetectedGaps()
    const timelineSegments = this.timestampService.getTimelineSegments()

    return {
      ...baseState,
      timeline: {
        analysis,
        gaps,
        segments: timelineSegments,
        continuityScore: analysis.continuityScore
      }
    }
  }

  /**
   * Get timeline analysis
   */
  public getTimelineAnalysis(): TimestampAnalysis {
    return this.timestampService.getTimestampAnalysis()
  }

  /**
   * Get detected gaps in transcription
   */
  public getTimelineGaps(): TimelineGap[] {
    return this.timestampService.getDetectedGaps()
  }

  /**
   * Validate timeline continuity
   */
  public validateContinuity(): {
    isValid: boolean
    issues: string[]
    suggestions: string[]
  } {
    return this.timestampService.validateContinuity()
  }

  /**
   * Update timestamp tracking configuration
   */
  public updateTimestampConfig(config: Partial<TimestampTrackingConfig>): void {
    this.timestampService.updateConfig(config)
    this.enhancedConfig.timestampTrackingConfig = {
      ...this.enhancedConfig.timestampTrackingConfig,
      ...config
    }
  }

  /**
   * End session and provide final analysis
   */
  public endSession(): {
    finalState: EnhancedLiveTranscriptionState
    analysis: TimestampAnalysis
    continuityReport: ReturnType<TimestampTrackingService['validateContinuity']>
  } {
    super.endSession()

    const finalState = this.getEnhancedState()
    const analysis = this.getTimelineAnalysis()
    const continuityReport = this.validateContinuity()

    return {
      finalState,
      analysis,
      continuityReport
    }
  }

  /**
   * Get configuration including timestamp tracking settings
   */
  public getEnhancedConfig(): EnhancedLiveTranscriptionConfig {
    return {...this.enhancedConfig}
  }

  /**
   * Check if timeline has gaps that might affect display continuity
   */
  public hasSignificantGaps(): boolean {
    const gaps = this.getTimelineGaps()
    return gaps.some(
      gap => gap.duration > this.enhancedConfig.timestampTrackingConfig.maxAcceptableGap
    )
  }

  /**
   * Get recommendation for gap handling
   */
  public getGapHandlingRecommendations(): {
    hasIssues: boolean
    recommendations: string[]
    gapsToAddress: TimelineGap[]
  } {
    const gaps = this.getTimelineGaps()
    const significantGaps = gaps.filter(
      gap => gap.duration > this.enhancedConfig.timestampTrackingConfig.maxAcceptableGap
    )

    const recommendations: string[] = []

    if (significantGaps.length > 0) {
      recommendations.push('Consider adjusting gap detection threshold')
      recommendations.push('Check audio input quality and connection stability')

      if (significantGaps.some(g => g.type === 'network')) {
        recommendations.push('Network-related gaps detected - check connection')
      }

      if (significantGaps.some(g => g.type === 'processing')) {
        recommendations.push('Processing delays detected - consider performance optimization')
      }
    }

    const analysis = this.getTimelineAnalysis()
    if (analysis.continuityScore < 0.8) {
      recommendations.push('Low continuity score - enable gap filling if appropriate')
    }

    return {
      hasIssues: significantGaps.length > 0,
      recommendations,
      gapsToAddress: significantGaps
    }
  }
}

export default EnhancedLiveTranscriptionBuffer
