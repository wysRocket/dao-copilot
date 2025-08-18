/**
 * TranscriptReconciler - UUID and Transcript Continuity Manager
 *
 * Ensures seamless transcript continuity across transport changes by:
 * - Preserving session and utterance identifiers across fallback transports
 * - Merging partial transcripts from different transport sources
 * - Resolving conflicts in overlapping transcript segments
 * - Maintaining transcript ordering and timestamps
 * - Coordinating with existing GeminiSessionManager and transcript systems
 *
 * This component integrates with the existing transcript infrastructure while
 * providing transport-agnostic continuity during fallback scenarios.
 */

import {EventEmitter} from 'events'
import type {TranscriptionResult, TranscriptionSource} from '../state/TranscriptionStateManager'

// Integration with existing session management
import {GeminiSessionManager} from '../services/GeminiSessionManager'
import {generateSecureId, generateSessionId} from '../utils/uuid-generator'
import {generateTranscriptId} from '../utils/transcript-deduplication'

// Type definitions for reconciliation
export interface TranscriptSegment {
  id: string
  sessionId: string
  utteranceId: string
  text: string
  startTime: number
  endTime: number
  confidence: number
  isPartial: boolean
  isFinal: boolean
  source: TranscriptionSource
  transport: 'websocket' | 'http-stream' | 'batch'
  timestamp: number
  sequenceNumber: number
  metadata: {
    originalId?: string
    mergeHistory?: string[]
    conflictResolution?: 'merge' | 'replace' | 'skip'
    transportSwitchPoint?: boolean
  }
}

export interface ReconciliationResult {
  reconciledSegments: TranscriptSegment[]
  conflictsResolved: number
  segmentsMerged: number
  continuityMaintained: boolean
  sessionPreserved: boolean
  errors: string[]
}

export interface TransportSwitchContext {
  fromTransport: string
  toTransport: string
  switchTime: number
  activeUtteranceId: string
  activeSessionId: string
  partialText: string
  confidence: number
}

export interface ReconcilerConfig {
  maxSegmentBuffer: number
  conflictResolutionStrategy:
    | 'merge'
    | 'confidence-based'
    | 'timestamp-priority'
    | 'transport-priority'
  mergeOverlapThreshold: number // milliseconds
  maxTimestampDrift: number // milliseconds
  confidenceThreshold: number
  enableAdvancedMerging: boolean
  preservePartialSegments: boolean
  debugLogging: boolean
}

const DEFAULT_RECONCILER_CONFIG: ReconcilerConfig = {
  maxSegmentBuffer: 100,
  conflictResolutionStrategy: 'confidence-based',
  mergeOverlapThreshold: 500,
  maxTimestampDrift: 1000,
  confidenceThreshold: 0.7,
  enableAdvancedMerging: true,
  preservePartialSegments: true,
  debugLogging: false
}

/**
 * Transcript Reconciler for transport-agnostic continuity
 */
export class TranscriptReconciler extends EventEmitter {
  private config: ReconcilerConfig
  private segmentBuffer: Map<string, TranscriptSegment[]> = new Map()
  private sessionManager?: GeminiSessionManager
  private currentSessionId: string | null = null
  private currentUtteranceId: string | null = null
  private sequenceCounter: number = 0
  private reconciliationHistory: ReconciliationResult[] = []
  private transportSwitchHistory: TransportSwitchContext[] = []
  private isInitialized: boolean = false

  // Metrics and monitoring
  private metrics = {
    segmentsProcessed: 0,
    conflictsResolved: 0,
    segmentsMerged: 0,
    transportSwitches: 0,
    reconciliationErrors: 0,
    continuityBreaks: 0
  }

  constructor(config: Partial<ReconcilerConfig> = {}) {
    super()
    this.config = {...DEFAULT_RECONCILER_CONFIG, ...config}

    if (this.config.debugLogging) {
      console.log('🔄 TranscriptReconciler: Initializing with config:', this.config)
    }
  }

  /**
   * Initialize reconciler with session manager integration
   */
  async initialize(sessionManager?: GeminiSessionManager): Promise<void> {
    if (this.isInitialized) {
      console.warn('🔄 TranscriptReconciler: Already initialized')
      return
    }

    this.sessionManager = sessionManager

    // Get current session context from session manager
    if (this.sessionManager) {
      try {
        const sessionInfo = await this.sessionManager.getCurrentSession()
        if (sessionInfo) {
          this.currentSessionId = sessionInfo.sessionId
          // Extract utterance ID from session state if available
          this.currentUtteranceId = sessionInfo.currentUtteranceId || this.generateUtteranceId()
        }
      } catch (error) {
        console.warn('🔄 TranscriptReconciler: Failed to get session info:', error)
      }
    }

    // Fallback: generate new session context if needed
    if (!this.currentSessionId) {
      this.currentSessionId = generateSessionId()
    }
    if (!this.currentUtteranceId) {
      this.currentUtteranceId = this.generateUtteranceId()
    }

    this.isInitialized = true
    this.emit('initialized', {
      sessionId: this.currentSessionId,
      utteranceId: this.currentUtteranceId
    })

    if (this.config.debugLogging) {
      console.log('🔄 TranscriptReconciler: Initialized with session context:', {
        sessionId: this.currentSessionId,
        utteranceId: this.currentUtteranceId,
        hasSessionManager: !!this.sessionManager
      })
    }
  }

  /**
   * Process incoming transcript result for reconciliation
   */
  async processTranscript(
    result: TranscriptionResult,
    transport: 'websocket' | 'http-stream' | 'batch',
    context?: Partial<TranscriptSegment>
  ): Promise<TranscriptSegment> {
    if (!this.isInitialized) {
      throw new Error('TranscriptReconciler must be initialized before processing')
    }

    this.metrics.segmentsProcessed++

    // Create transcript segment from result
    const segment = this.createSegmentFromResult(result, transport, context)

    // Ensure session continuity
    segment.sessionId = this.currentSessionId!

    // Handle utterance ID continuity
    if (!segment.utteranceId) {
      segment.utteranceId = this.currentUtteranceId!
    }

    // Buffer segment for reconciliation
    await this.bufferSegment(segment)

    // Emit segment processed event
    this.emit('segmentProcessed', segment)

    if (this.config.debugLogging) {
      console.log('🔄 TranscriptReconciler: Processed segment:', {
        id: segment.id,
        transport: segment.transport,
        text: segment.text.slice(0, 50) + '...',
        isPartial: segment.isPartial,
        sequenceNumber: segment.sequenceNumber
      })
    }

    return segment
  }

  /**
   * Handle transport switch with context preservation
   */
  async handleTransportSwitch(
    fromTransport: string,
    toTransport: string,
    context: {
      partialText?: string
      confidence?: number
      activeUtterance?: string
    } = {}
  ): Promise<TransportSwitchContext> {
    this.metrics.transportSwitches++

    const switchContext: TransportSwitchContext = {
      fromTransport,
      toTransport,
      switchTime: Date.now(),
      activeUtteranceId: this.currentUtteranceId!,
      activeSessionId: this.currentSessionId!,
      partialText: context.partialText || '',
      confidence: context.confidence || 0.8
    }

    // Store switch context
    this.transportSwitchHistory.push(switchContext)

    // Keep only recent history
    if (this.transportSwitchHistory.length > 10) {
      this.transportSwitchHistory.shift()
    }

    // Mark any pending segments as transport switch points
    await this.markTransportSwitchPoint(switchContext)

    this.emit('transportSwitch', switchContext)

    if (this.config.debugLogging) {
      console.log('🔄 TranscriptReconciler: Transport switch processed:', {
        from: fromTransport,
        to: toTransport,
        partialTextLength: switchContext.partialText.length,
        utteranceId: switchContext.activeUtteranceId
      })
    }

    return switchContext
  }

  /**
   * Reconcile buffered segments and return consolidated result
   */
  async reconcileSegments(sessionId?: string): Promise<ReconciliationResult> {
    const targetSession = sessionId || this.currentSessionId!
    const segments = this.segmentBuffer.get(targetSession) || []

    if (segments.length === 0) {
      return {
        reconciledSegments: [],
        conflictsResolved: 0,
        segmentsMerged: 0,
        continuityMaintained: true,
        sessionPreserved: true,
        errors: []
      }
    }

    const result: ReconciliationResult = {
      reconciledSegments: [],
      conflictsResolved: 0,
      segmentsMerged: 0,
      continuityMaintained: true,
      sessionPreserved: true,
      errors: []
    }

    try {
      // Sort segments by timestamp and sequence
      const sortedSegments = [...segments].sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp
        }
        return a.sequenceNumber - b.sequenceNumber
      })

      // Group segments by utterance for processing
      const utteranceGroups = this.groupSegmentsByUtterance(sortedSegments)

      // Process each utterance group
      for (const utteranceSegments of utteranceGroups.values()) {
        const reconciledUtterance = await this.reconcileUtteranceSegments(utteranceSegments)
        result.reconciledSegments.push(...reconciledUtterance.segments)
        result.conflictsResolved += reconciledUtterance.conflictsResolved
        result.segmentsMerged += reconciledUtterance.segmentsMerged
        result.errors.push(...reconciledUtterance.errors)
      }

      // Validate continuity
      result.continuityMaintained = this.validateContinuity(result.reconciledSegments)
      result.sessionPreserved = result.reconciledSegments.every(s => s.sessionId === targetSession)

      // Update metrics
      this.metrics.conflictsResolved += result.conflictsResolved
      this.metrics.segmentsMerged += result.segmentsMerged
      if (result.errors.length > 0) {
        this.metrics.reconciliationErrors += result.errors.length
      }
      if (!result.continuityMaintained) {
        this.metrics.continuityBreaks++
      }

      // Store reconciliation history
      this.reconciliationHistory.push(result)
      if (this.reconciliationHistory.length > 50) {
        this.reconciliationHistory.shift()
      }

      this.emit('reconciliationComplete', result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown reconciliation error'
      result.errors.push(errorMessage)
      this.metrics.reconciliationErrors++
      console.error('🔄 TranscriptReconciler: Reconciliation failed:', error)
    }

    return result
  }

  /**
   * Get current session and utterance context
   */
  getCurrentContext(): {
    sessionId: string | null
    utteranceId: string | null
    isInitialized: boolean
  } {
    return {
      sessionId: this.currentSessionId,
      utteranceId: this.currentUtteranceId,
      isInitialized: this.isInitialized
    }
  }

  /**
   * Update utterance context (for new utterances)
   */
  updateUtteranceContext(utteranceId?: string): string {
    this.currentUtteranceId = utteranceId || this.generateUtteranceId()
    this.emit('utteranceUpdated', this.currentUtteranceId)

    if (this.config.debugLogging) {
      console.log('🔄 TranscriptReconciler: Updated utterance context:', this.currentUtteranceId)
    }

    return this.currentUtteranceId
  }

  /**
   * Get reconciliation metrics
   */
  getMetrics(): typeof this.metrics & {
    bufferedSegments: number
    transportSwitches: TransportSwitchContext[]
    recentReconciliations: number
  } {
    const bufferedSegments = Array.from(this.segmentBuffer.values()).reduce(
      (sum, segments) => sum + segments.length,
      0
    )

    return {
      ...this.metrics,
      bufferedSegments,
      transportSwitches: this.transportSwitchHistory.slice(-5), // Last 5 switches
      recentReconciliations: this.reconciliationHistory.length
    }
  }

  /**
   * Clear buffers and reset state
   */
  async reset(): Promise<void> {
    this.segmentBuffer.clear()
    this.reconciliationHistory = []
    this.transportSwitchHistory = []
    this.sequenceCounter = 0

    // Reset metrics
    ;(this.metrics as Record<string, number>) = {
      segmentsProcessed: 0,
      conflictsResolved: 0,
      segmentsMerged: 0,
      transportSwitches: 0,
      reconciliationErrors: 0,
      continuityBreaks: 0
    }

    this.emit('reset')

    if (this.config.debugLogging) {
      console.log('🔄 TranscriptReconciler: Reset completed')
    }
  }

  /**
   * Destroy reconciler and cleanup
   */
  async destroy(): Promise<void> {
    await this.reset()
    this.removeAllListeners()
    this.isInitialized = false

    if (this.config.debugLogging) {
      console.log('🔄 TranscriptReconciler: Destroyed')
    }
  }

  // Private methods

  private createSegmentFromResult(
    result: TranscriptionResult,
    transport: 'websocket' | 'http-stream' | 'batch',
    context?: Partial<TranscriptSegment>
  ): TranscriptSegment {
    return {
      id: result.id || generateTranscriptId(result),
      sessionId: context?.sessionId || this.currentSessionId!,
      utteranceId: context?.utteranceId || this.currentUtteranceId!,
      text: result.text,
      startTime: result.startTime || result.timestamp,
      endTime: result.endTime || result.timestamp + (result.duration || 0),
      confidence: result.confidence || 0.8,
      isPartial: result.isPartial || false,
      isFinal: result.isFinal || false,
      source: result.source,
      transport,
      timestamp: result.timestamp,
      sequenceNumber: this.sequenceCounter++,
      metadata: {
        originalId: result.id,
        mergeHistory: [],
        ...context?.metadata
      }
    }
  }

  private async bufferSegment(segment: TranscriptSegment): Promise<void> {
    const sessionSegments = this.segmentBuffer.get(segment.sessionId) || []
    sessionSegments.push(segment)

    // Limit buffer size
    if (sessionSegments.length > this.config.maxSegmentBuffer) {
      sessionSegments.shift()
    }

    this.segmentBuffer.set(segment.sessionId, sessionSegments)
  }

  private groupSegmentsByUtterance(
    segments: TranscriptSegment[]
  ): Map<string, TranscriptSegment[]> {
    const groups = new Map<string, TranscriptSegment[]>()

    for (const segment of segments) {
      const utteranceSegments = groups.get(segment.utteranceId) || []
      utteranceSegments.push(segment)
      groups.set(segment.utteranceId, utteranceSegments)
    }

    return groups
  }

  private async reconcileUtteranceSegments(segments: TranscriptSegment[]): Promise<{
    segments: TranscriptSegment[]
    conflictsResolved: number
    segmentsMerged: number
    errors: string[]
  }> {
    const result = {
      segments: [] as TranscriptSegment[],
      conflictsResolved: 0,
      segmentsMerged: 0,
      errors: [] as string[]
    }

    if (segments.length === 0) {
      return result
    }

    if (segments.length === 1) {
      result.segments = [...segments]
      return result
    }

    // Sort segments by timestamp
    const sortedSegments = [...segments].sort((a, b) => a.timestamp - b.timestamp)

    // Find and resolve overlapping segments
    for (let i = 0; i < sortedSegments.length; i++) {
      const currentSegment = sortedSegments[i]

      // Check for overlaps with subsequent segments
      const overlappingSegments = this.findOverlappingSegments(
        currentSegment,
        sortedSegments.slice(i + 1)
      )

      if (overlappingSegments.length === 0) {
        result.segments.push(currentSegment)
      } else {
        // Merge overlapping segments
        const mergedSegment = await this.mergeOverlappingSegments(
          currentSegment,
          overlappingSegments
        )
        result.segments.push(mergedSegment)
        result.segmentsMerged += overlappingSegments.length
        result.conflictsResolved++

        // Skip processed overlapping segments
        i += overlappingSegments.length
      }
    }

    return result
  }

  private findOverlappingSegments(
    baseSegment: TranscriptSegment,
    candidates: TranscriptSegment[]
  ): TranscriptSegment[] {
    const overlapping: TranscriptSegment[] = []

    for (const candidate of candidates) {
      const candidateStart = candidate.startTime || candidate.timestamp
      const timeDiff = Math.abs(candidateStart - baseSegment.timestamp)

      if (timeDiff <= this.config.mergeOverlapThreshold) {
        overlapping.push(candidate)
      } else {
        break // Segments are sorted, no more overlaps possible
      }
    }

    return overlapping
  }

  private async mergeOverlappingSegments(
    baseSegment: TranscriptSegment,
    overlappingSegments: TranscriptSegment[]
  ): Promise<TranscriptSegment> {
    const allSegments = [baseSegment, ...overlappingSegments]

    // Choose merge strategy based on configuration
    switch (this.config.conflictResolutionStrategy) {
      case 'confidence-based':
        return this.mergeByConfidence(allSegments)
      case 'timestamp-priority':
        return this.mergeByTimestamp(allSegments)
      case 'transport-priority':
        return this.mergeByTransportPriority(allSegments)
      case 'merge':
      default:
        return this.mergeByTextCombination(allSegments)
    }
  }

  private mergeByConfidence(segments: TranscriptSegment[]): TranscriptSegment {
    const highest = segments.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    )

    return {
      ...highest,
      metadata: {
        ...highest.metadata,
        mergeHistory: segments.map(s => s.id),
        conflictResolution: 'confidence-based'
      }
    }
  }

  private mergeByTimestamp(segments: TranscriptSegment[]): TranscriptSegment {
    const earliest = segments.reduce((earliest, current) =>
      current.timestamp < earliest.timestamp ? current : earliest
    )

    return {
      ...earliest,
      metadata: {
        ...earliest.metadata,
        mergeHistory: segments.map(s => s.id),
        conflictResolution: 'timestamp-priority'
      }
    }
  }

  private mergeByTransportPriority(segments: TranscriptSegment[]): TranscriptSegment {
    const transportPriority: Record<string, number> = {
      websocket: 3,
      'http-stream': 2,
      batch: 1
    }

    const prioritized = segments.reduce((best, current) =>
      (transportPriority[current.transport] || 0) > (transportPriority[best.transport] || 0)
        ? current
        : best
    )

    return {
      ...prioritized,
      metadata: {
        ...prioritized.metadata,
        mergeHistory: segments.map(s => s.id),
        conflictResolution: 'transport-priority'
      }
    }
  }

  private mergeByTextCombination(segments: TranscriptSegment[]): TranscriptSegment {
    // Sort by timestamp for coherent text combination
    const sorted = [...segments].sort((a, b) => a.timestamp - b.timestamp)

    // Combine text intelligently
    const combinedText = this.combineTexts(sorted.map(s => s.text))

    // Use highest confidence
    const maxConfidence = Math.max(...sorted.map(s => s.confidence))

    // Use earliest timestamp
    const earliestTimestamp = Math.min(...sorted.map(s => s.timestamp))

    const baseSegment = sorted[0]

    return {
      ...baseSegment,
      text: combinedText,
      confidence: maxConfidence,
      timestamp: earliestTimestamp,
      metadata: {
        ...baseSegment.metadata,
        mergeHistory: segments.map(s => s.id),
        conflictResolution: 'merge'
      }
    }
  }

  private combineTexts(texts: string[]): string {
    if (texts.length === 1) return texts[0]

    // Simple text combination - can be enhanced with more sophisticated merging
    const uniqueTexts = [...new Set(texts.filter(t => t.trim().length > 0))]

    if (uniqueTexts.length === 1) {
      return uniqueTexts[0]
    }

    // Find the longest text as base
    const longest = uniqueTexts.reduce((longest, current) =>
      current.length > longest.length ? current : longest
    )

    return longest
  }

  private validateContinuity(segments: TranscriptSegment[]): boolean {
    if (segments.length <= 1) return true

    const sorted = [...segments].sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const current = sorted[i]

      const timeDiff = current.timestamp - prev.timestamp

      // Check if gap is too large
      if (timeDiff > this.config.maxTimestampDrift) {
        return false
      }
    }

    return true
  }

  private async markTransportSwitchPoint(switchContext: TransportSwitchContext): Promise<void> {
    const sessionSegments = this.segmentBuffer.get(switchContext.activeSessionId) || []

    // Mark recent segments as transport switch points
    const recentSegments = sessionSegments.filter(
      s => s.timestamp > switchContext.switchTime - 2000 // Within 2 seconds
    )

    for (const segment of recentSegments) {
      segment.metadata.transportSwitchPoint = true
    }
  }

  private generateUtteranceId(): string {
    return generateSecureId('utterance')
  }
}

// Factory function for easy instantiation
export function createTranscriptReconciler(
  config?: Partial<ReconcilerConfig>
): TranscriptReconciler {
  return new TranscriptReconciler(config)
}

// Export types for external use
export type {ReconcilerConfig, TranscriptSegment, ReconciliationResult, TransportSwitchContext}
