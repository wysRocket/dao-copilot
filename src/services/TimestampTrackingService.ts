/**
 * Enhanced Timestamp Tracking Service for Live Transcription
 *
 * This service extends the basic timestamp functionality in LiveTranscriptionBuffer
 * to provide advanced gap detection, continuity verification, and timeline management.
 *
 * Key Features:
 * 1. Gap Detection: Identifies silence periods or missing segments
 * 2. Continuity Verification: Ensures smooth timeline progression
 * 3. Gap Handling: Strategies for handling detected gaps
 * 4. Timeline Visualization: Provides timeline data for UI display
 */

export interface TimelineGap {
  id: string
  startTime: number
  endTime: number
  duration: number
  type: 'silence' | 'processing' | 'network' | 'unknown'
  metadata?: {
    detectedAt: number
    confidence?: number
    [key: string]: unknown
  }
}

export interface TimestampAnalysis {
  totalDuration: number
  activeTranscriptionTime: number
  gaps: TimelineGap[]
  continuityScore: number // 0-1, where 1 is perfect continuity
  averageSegmentDuration: number
  longestGap: TimelineGap | null
  shortestGap: TimelineGap | null
}

export interface TimestampTrackingConfig {
  gapDetectionThreshold: number // Minimum silence to consider a gap (ms)
  maxAcceptableGap: number // Maximum gap before warning (ms)
  estimationStrategy: 'linear' | 'audio-based' | 'adaptive'
  enableGapFilling: boolean // Fill small gaps with estimated content
  timelinePrecision: number // Timestamp precision in ms
}

export interface TimelineSegment {
  id: string
  startTime: number
  endTime: number
  text: string
  isPartial: boolean
  confidence?: number
  hasGapBefore?: boolean
  hasGapAfter?: boolean
  estimatedDuration?: number
  wordTimings?: WordTiming[]
}

export interface WordTiming {
  word: string
  startTime: number
  endTime: number
  confidence?: number
}

export class TimestampTrackingService {
  private config: TimestampTrackingConfig
  private sessionStartTime: number = 0
  private lastKnownTime: number = 0
  private timelineSegments: TimelineSegment[] = []
  private detectedGaps: TimelineGap[] = []
  private nextGapId: number = 1

  private readonly defaultConfig: TimestampTrackingConfig = {
    gapDetectionThreshold: 1000, // 1 second
    maxAcceptableGap: 5000, // 5 seconds
    estimationStrategy: 'adaptive',
    enableGapFilling: false,
    timelinePrecision: 100 // 100ms precision
  }

  constructor(config?: Partial<TimestampTrackingConfig>) {
    this.config = {...this.defaultConfig, ...config}
  }

  /**
   * Initialize a new transcription session
   */
  public startSession(startTime?: number): void {
    this.sessionStartTime = startTime || Date.now()
    this.lastKnownTime = this.sessionStartTime
    this.timelineSegments = []
    this.detectedGaps = []
    this.nextGapId = 1
  }

  /**
   * Add a new segment to the timeline with gap detection
   */
  public addSegment(
    id: string,
    text: string,
    isPartial: boolean,
    startTime?: number,
    endTime?: number,
    confidence?: number
  ): TimelineSegment {
    const estimatedStartTime = this.estimateStartTime(startTime)
    const estimatedEndTime = this.estimateEndTime(estimatedStartTime, text, isPartial, endTime)

    // Detect gap before this segment
    const hasGapBefore = this.detectGapBefore(estimatedStartTime)

    const segment: TimelineSegment = {
      id,
      startTime: estimatedStartTime,
      endTime: estimatedEndTime,
      text,
      isPartial,
      confidence,
      hasGapBefore,
      estimatedDuration: estimatedEndTime - estimatedStartTime
    }

    // Update timeline
    this.insertSegmentInTimeline(segment)
    this.lastKnownTime = estimatedEndTime

    return segment
  }

  /**
   * Finalize a partial segment
   */
  public finalizeSegment(id: string, finalText: string, endTime?: number): TimelineSegment | null {
    const segmentIndex = this.timelineSegments.findIndex(s => s.id === id)
    if (segmentIndex === -1) return null

    const segment = this.timelineSegments[segmentIndex]
    const estimatedEndTime = this.estimateEndTime(segment.startTime, finalText, false, endTime)

    const updatedSegment: TimelineSegment = {
      ...segment,
      text: finalText,
      isPartial: false,
      endTime: estimatedEndTime,
      estimatedDuration: estimatedEndTime - segment.startTime
    }

    this.timelineSegments[segmentIndex] = updatedSegment

    // Check for gap after this segment
    this.checkGapAfterSegment(segmentIndex)

    return updatedSegment
  }

  /**
   * Get comprehensive timeline analysis
   */
  public getTimestampAnalysis(): TimestampAnalysis {
    const totalDuration = this.lastKnownTime - this.sessionStartTime
    const activeTranscriptionTime = this.calculateActiveTranscriptionTime()
    const gaps = [...this.detectedGaps]
    const continuityScore = this.calculateContinuityScore()
    const averageSegmentDuration = this.calculateAverageSegmentDuration()

    const longestGap =
      gaps.length > 0
        ? gaps.reduce((longest, gap) => (gap.duration > longest.duration ? gap : longest))
        : null

    const shortestGap =
      gaps.length > 0
        ? gaps.reduce((shortest, gap) => (gap.duration < shortest.duration ? gap : shortest))
        : null

    return {
      totalDuration,
      activeTranscriptionTime,
      gaps,
      continuityScore,
      averageSegmentDuration,
      longestGap,
      shortestGap
    }
  }

  /**
   * Get all timeline segments ordered by time
   */
  public getTimelineSegments(): TimelineSegment[] {
    return [...this.timelineSegments].sort((a, b) => a.startTime - b.startTime)
  }

  /**
   * Get detected gaps
   */
  public getDetectedGaps(): TimelineGap[] {
    return [...this.detectedGaps]
  }

  /**
   * Check timeline continuity and return issues
   */
  public validateContinuity(): {
    isValid: boolean
    issues: string[]
    suggestions: string[]
  } {
    const issues: string[] = []
    const suggestions: string[] = []

    // Check for overlapping segments
    for (let i = 0; i < this.timelineSegments.length - 1; i++) {
      const current = this.timelineSegments[i]
      const next = this.timelineSegments[i + 1]

      if (current.endTime > next.startTime) {
        issues.push(`Segments ${current.id} and ${next.id} overlap`)
        suggestions.push('Consider adjusting segment timing or implementing overlap resolution')
      }
    }

    // Check for excessive gaps
    const analysis = this.getTimestampAnalysis()
    const excessiveGaps = analysis.gaps.filter(gap => gap.duration > this.config.maxAcceptableGap)

    if (excessiveGaps.length > 0) {
      issues.push(`${excessiveGaps.length} gaps exceed acceptable threshold`)
      suggestions.push('Review gap detection settings or audio quality')
    }

    // Check continuity score
    if (analysis.continuityScore < 0.8) {
      issues.push('Low continuity score detected')
      suggestions.push('Consider enabling gap filling or adjusting detection thresholds')
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<TimestampTrackingConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  /**
   * Get current configuration
   */
  public getConfig(): TimestampTrackingConfig {
    return {...this.config}
  }

  // Private helper methods

  private estimateStartTime(providedTime?: number): number {
    if (providedTime !== undefined) return providedTime

    // Use estimation strategy
    switch (this.config.estimationStrategy) {
      case 'linear':
        return this.lastKnownTime
      case 'audio-based':
        // Would integrate with audio timing if available
        return this.lastKnownTime
      case 'adaptive':
      default:
        // Adaptive estimation based on recent segment patterns
        return this.adaptiveTimeEstimation()
    }
  }

  private estimateEndTime(
    startTime: number,
    text: string,
    isPartial: boolean,
    providedEndTime?: number
  ): number {
    if (providedEndTime !== undefined && !isPartial) return providedEndTime

    // Estimate based on text length and typical speaking rate
    const wordsPerMinute = 150 // Average speaking rate
    const wordCount = text.split(' ').length
    const estimatedDuration = (wordCount / wordsPerMinute) * 60 * 1000 // Convert to ms

    // For partial segments, don't set end time or estimate conservatively
    if (isPartial) {
      return startTime + Math.max(estimatedDuration, 500) // Minimum 500ms for partial
    }

    return startTime + estimatedDuration
  }

  private detectGapBefore(startTime: number): boolean {
    if (this.timelineSegments.length === 0) return false

    const timeSinceLastSegment = startTime - this.lastKnownTime

    if (timeSinceLastSegment > this.config.gapDetectionThreshold) {
      this.createGap(this.lastKnownTime, startTime, 'silence')
      return true
    }

    return false
  }

  private createGap(startTime: number, endTime: number, type: TimelineGap['type']): void {
    const gap: TimelineGap = {
      id: `gap-${this.nextGapId++}`,
      startTime,
      endTime,
      duration: endTime - startTime,
      type,
      metadata: {
        detectedAt: Date.now()
      }
    }

    this.detectedGaps.push(gap)
  }

  private insertSegmentInTimeline(segment: TimelineSegment): void {
    // Insert segment in correct chronological position
    const insertIndex = this.timelineSegments.findIndex(s => s.startTime > segment.startTime)

    if (insertIndex === -1) {
      this.timelineSegments.push(segment)
    } else {
      this.timelineSegments.splice(insertIndex, 0, segment)
    }
  }

  private checkGapAfterSegment(segmentIndex: number): void {
    if (segmentIndex >= this.timelineSegments.length - 1) return

    const current = this.timelineSegments[segmentIndex]
    const next = this.timelineSegments[segmentIndex + 1]

    const gap = next.startTime - current.endTime

    if (gap > this.config.gapDetectionThreshold) {
      this.createGap(current.endTime, next.startTime, 'unknown')
      next.hasGapBefore = true
    }
  }

  private adaptiveTimeEstimation(): number {
    if (this.timelineSegments.length < 2) return this.lastKnownTime

    // Calculate average gap between recent segments
    const recentSegments = this.timelineSegments.slice(-3)
    const gaps = []

    for (let i = 0; i < recentSegments.length - 1; i++) {
      const gap = recentSegments[i + 1].startTime - recentSegments[i].endTime
      gaps.push(gap)
    }

    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
    return this.lastKnownTime + Math.max(averageGap, 0)
  }

  private calculateActiveTranscriptionTime(): number {
    return this.timelineSegments.reduce((total, segment) => {
      return total + (segment.endTime - segment.startTime)
    }, 0)
  }

  private calculateContinuityScore(): number {
    if (this.timelineSegments.length === 0) return 1

    const totalTime = this.lastKnownTime - this.sessionStartTime
    if (totalTime === 0) return 1

    const gapTime = this.detectedGaps.reduce((total, gap) => total + gap.duration, 0)
    return Math.max(0, 1 - gapTime / totalTime)
  }

  private calculateAverageSegmentDuration(): number {
    if (this.timelineSegments.length === 0) return 0

    const totalDuration = this.timelineSegments.reduce((total, segment) => {
      return total + (segment.endTime - segment.startTime)
    }, 0)

    return totalDuration / this.timelineSegments.length
  }
}

export default TimestampTrackingService
