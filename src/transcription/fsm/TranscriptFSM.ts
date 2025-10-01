/* Core FSM implementation */
import {
  FSMTransition,
  PartialInput,
  TranscriptState,
  TranscriptUtterance,
  TransitionReason,
  TransitionRejection,
  TransitionHistoryEntry,
  FSMConfig,
  DEFAULT_FSM_CONFIG
} from './TranscriptStates'
import {isAllowedTransition, transitionReasonRequiresLatency} from './TransitionMatrix'
import {createEventBus} from './EventBus'
import {AnyFSMEvent, EventHandler} from './TranscriptEvents'
import {fsmTelemetry, FSMTelemetry} from './FSMTelemetry'

// Simple UUID v4 (fallback if crypto.randomUUID unavailable)
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface CreateUtteranceOptions {
  sessionId: string
  firstPartial?: PartialInput
}

interface FSMMetrics {
  totalUtterances: number
  activeUtterances: number
  transitionsCount: number
  rejectedTransitions: number
  partialUpdates: number
  finalizations: number
  recoveries: number
  aborts: number
  lastActivity: number
}

export class TranscriptFSMCore {
  private utterances = new Map<string, TranscriptUtterance>()
  private transitionHistory: TransitionHistoryEntry[] = []
  private bus = createEventBus()
  private cleanupTimer: NodeJS.Timeout | null = null
  private metrics: FSMMetrics = {
    totalUtterances: 0,
    activeUtterances: 0,
    transitionsCount: 0,
    rejectedTransitions: 0,
    partialUpdates: 0,
    finalizations: 0,
    recoveries: 0,
    aborts: 0,
    lastActivity: Date.now()
  }
  private config: FSMConfig
  private telemetry: FSMTelemetry

  constructor(
    config: Partial<FSMConfig> = {},
    telemetryConfig?: Partial<import('./FSMTelemetry').FSMTelemetryConfig>
  ) {
    this.config = {...DEFAULT_FSM_CONFIG, ...config}
    this.telemetry = telemetryConfig ? new FSMTelemetry(telemetryConfig) : fsmTelemetry
    this.startCleanup()
  }

  /**
   * Update FSM configuration
   */
  updateConfig(newConfig: Partial<FSMConfig>): void {
    const oldConfig = {...this.config}
    this.config = {...this.config, ...newConfig}

    // Restart cleanup timer if interval changed
    if (oldConfig.cleanupIntervalMs !== this.config.cleanupIntervalMs) {
      this.stopCleanup()
      this.startCleanup()
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<FSMConfig> {
    return {...this.config}
  }

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<FSMMetrics> {
    return {
      ...this.metrics,
      activeUtterances: this.utterances.size
    }
  }

  /**
   * Get transition history
   */
  getHistory(utteranceId?: string): readonly TransitionHistoryEntry[] {
    if (utteranceId) {
      return this.transitionHistory.filter(entry => entry.utteranceId === utteranceId)
    }
    return [...this.transitionHistory]
  }

  /**
   * Clear transition history
   */
  clearHistory(): void {
    const clearedCount = this.transitionHistory.length
    this.transitionHistory = []

    if (this.config.enableMetrics && clearedCount > 0) {
      this.bus.emit('fsm.history.pruned', {pruned: clearedCount, remaining: 0})
    }

    // Log cleanup via telemetry
    this.telemetry.logCleanup(clearedCount, 0, 'history')
  }

  /**
   * Get telemetry instance for advanced monitoring
   */
  getTelemetry(): FSMTelemetry {
    return this.telemetry
  }

  /**
   * Update telemetry configuration
   */
  updateTelemetryConfig(config: Partial<import('./FSMTelemetry').FSMTelemetryConfig>): void {
    this.telemetry.updateConfig(config)
  }

  createUtterance(opts: CreateUtteranceOptions): string {
    const timerId = `create-utterance-${Date.now()}`
    this.telemetry.startPerformanceTimer(timerId)

    try {
      const id = genId()
      const now = performance?.now?.() || Date.now()
      const u: TranscriptUtterance = {
        id,
        sessionId: opts.sessionId,
        createdAt: now,
        updatedAt: now,
        state: TranscriptState.PENDING_PARTIAL,
        textDraft: '',
        sequence: 0
      }
      this.utterances.set(id, u)

      // Update metrics
      this.metrics.totalUtterances++
      this.metrics.lastActivity = now

      if (opts.firstPartial?.text) {
        this.applyPartial(id, opts.firstPartial.text, opts.firstPartial.confidence)
      }

      this.telemetry.endPerformanceTimer(timerId, 'createUtterance', {
        sessionId: opts.sessionId,
        hasFirstPartial: !!opts.firstPartial?.text
      })

      return id
    } catch (error) {
      const errorMsg = `Failed to create utterance: ${error}`
      this.telemetry.logError(errorMsg, {sessionId: opts.sessionId})
      this.bus.emit('fsm.error', {error: errorMsg, context: {sessionId: opts.sessionId}})
      throw new Error(errorMsg)
    }
  }

  applyPartial(utteranceId: string, text: string, confidence?: number): boolean {
    try {
      const u = this.utterances.get(utteranceId)
      if (!u) {
        const errorMsg = 'Utterance not found for partial update'
        this.telemetry.logError(errorMsg, {utteranceId, textLength: text.length})
        this.bus.emit('fsm.error', {
          error: errorMsg,
          context: {utteranceId, textLength: text.length}
        })
        return false
      }

      // Late partial after final
      if (u.state === TranscriptState.FINALIZED || u.state === TranscriptState.ABORTED) {
        this.bus.emit('fsm.partial.late_ignored', {utteranceId, at: Date.now()})
        return false
      }

      const now = performance?.now?.() || Date.now()

      // Promote to STREAMING_ACTIVE if first meaningful partial
      if (u.state === TranscriptState.PENDING_PARTIAL) {
        const success = this.transition(
          u,
          TranscriptState.STREAMING_ACTIVE,
          TransitionReason.PARTIAL_RECEIVED,
          {textLength: text.length, confidence}
        )
        if (!success) return false
        u.startedStreamingAt = now
      }

      // Append text (simple concat for now, merge engine will refine later)
      u.textDraft = text // replace with latest partial (provider sends full running text)
      u.lastPartialAt = now
      u.updatedAt = now
      u.sequence = (u.sequence || 0) + 1
      if (confidence !== undefined) u.confidence = confidence

      // Update metrics
      this.metrics.partialUpdates++
      this.metrics.lastActivity = now

      // Log partial update via telemetry
      this.telemetry.logPartialUpdate(utteranceId, text.length, confidence)

      this.bus.emit('fsm.partial.append', {
        utteranceId,
        draft: u.textDraft,
        confidence: u.confidence,
        sequence: u.sequence,
        at: now
      })

      return true
    } catch (error) {
      const errorMsg = `Failed to apply partial: ${error}`
      this.telemetry.logError(errorMsg, {utteranceId, textLength: text.length})
      this.bus.emit('fsm.error', {
        error: errorMsg,
        context: {utteranceId, textLength: text.length}
      })
      return false
    }
  }

  markEndOfSpeech(utteranceId: string): boolean {
    try {
      const u = this.utterances.get(utteranceId)
      if (!u) {
        this.bus.emit('fsm.error', {
          error: 'Utterance not found for end of speech',
          context: {utteranceId}
        })
        return false
      }
      if (u.state !== TranscriptState.STREAMING_ACTIVE) return false

      const success = this.transition(
        u,
        TranscriptState.AWAITING_FINAL,
        TransitionReason.END_OF_SPEECH_DETECTED
      )
      if (success) {
        u.awaitingFinalSince = performance?.now?.() || Date.now()
      }
      return success
    } catch (error) {
      const errorMsg = `Failed to mark end of speech: ${error}`
      this.bus.emit('fsm.error', {error: errorMsg, context: {utteranceId}})
      return false
    }
  }

  applyFinal(utteranceId: string, finalText: string, confidence?: number): boolean {
    try {
      const u = this.utterances.get(utteranceId)
      if (!u) {
        this.bus.emit('fsm.error', {
          error: 'Utterance not found for final application',
          context: {utteranceId, finalTextLength: finalText.length}
        })
        return false
      }
      if (u.state === TranscriptState.FINALIZED) return true // idempotent

      let success = false
      const context = {finalTextLength: finalText.length, confidence}

      // Fast path if still streaming
      if (u.state === TranscriptState.STREAMING_ACTIVE) {
        success = this.transition(
          u,
          TranscriptState.FINALIZED,
          TransitionReason.FINAL_RECEIVED,
          context
        )
      } else if (
        u.state === TranscriptState.AWAITING_FINAL ||
        u.state === TranscriptState.RECOVERED
      ) {
        success = this.transition(
          u,
          TranscriptState.FINALIZED,
          TransitionReason.FINAL_RECEIVED,
          context
        )
      } else if (u.state === TranscriptState.PENDING_PARTIAL) {
        // Edge: got final before partial? Accept but treat as streaming->final
        success = this.transition(
          u,
          TranscriptState.FINALIZED,
          TransitionReason.FINAL_RECEIVED,
          context
        )
      } else {
        return false
      }

      if (success) {
        u.finalText = finalText
        u.finalizedAt = performance?.now?.() || Date.now()
        if (confidence !== undefined) u.confidence = confidence
        if (!u.textDraft) u.textDraft = finalText
        u.updatedAt = u.finalizedAt

        // Update metrics
        this.metrics.finalizations++
        this.metrics.lastActivity = u.finalizedAt

        // latency from end-of-speech if available
        const latencyMs = u.awaitingFinalSince ? u.finalizedAt - u.awaitingFinalSince : undefined
        if (latencyMs !== undefined) {
          // could emit specialized event or attach to transition; already recorded via transition()
        }
      }

      return success
    } catch (error) {
      const errorMsg = `Failed to apply final: ${error}`
      this.bus.emit('fsm.error', {
        error: errorMsg,
        context: {utteranceId, finalTextLength: finalText.length}
      })
      return false
    }
  }

  abortUtterance(utteranceId: string, cause: 'error' | 'user'): boolean {
    try {
      const u = this.utterances.get(utteranceId)
      if (!u) {
        this.bus.emit('fsm.error', {
          error: 'Utterance not found for abort',
          context: {utteranceId, cause}
        })
        return false
      }
      if (u.state === TranscriptState.FINALIZED || u.state === TranscriptState.ABORTED) return true

      const success = this.transition(
        u,
        TranscriptState.ABORTED,
        cause === 'error' ? TransitionReason.ERROR_ABORT : TransitionReason.USER_STOP,
        {cause}
      )

      if (success) {
        u.abortedAt = performance?.now?.() || Date.now()
        this.metrics.aborts++
        this.metrics.lastActivity = u.abortedAt
      }

      return success
    } catch (error) {
      const errorMsg = `Failed to abort utterance: ${error}`
      this.bus.emit('fsm.error', {error: errorMsg, context: {utteranceId, cause}})
      return false
    }
  }

  recoverUtterance(utteranceId: string, recoveredText: string, confidence?: number): boolean {
    try {
      const u = this.utterances.get(utteranceId)
      if (!u) {
        this.bus.emit('fsm.error', {
          error: 'Utterance not found for recovery',
          context: {utteranceId, recoveredTextLength: recoveredText.length}
        })
        return false
      }
      if (
        u.state !== TranscriptState.STREAMING_ACTIVE &&
        u.state !== TranscriptState.AWAITING_FINAL
      )
        return false

      const success = this.transition(
        u,
        TranscriptState.RECOVERED,
        TransitionReason.RECOVERY_REPLAY,
        {recoveredTextLength: recoveredText.length, confidence}
      )

      if (success) {
        u.recoveredAt = performance?.now?.() || Date.now()
        u.textDraft = recoveredText
        if (confidence !== undefined) u.confidence = confidence
        u.updatedAt = u.recoveredAt

        this.metrics.recoveries++
        this.metrics.lastActivity = u.recoveredAt
      }

      return success
    } catch (error) {
      const errorMsg = `Failed to recover utterance: ${error}`
      this.bus.emit('fsm.error', {
        error: errorMsg,
        context: {utteranceId, recoveredTextLength: recoveredText.length}
      })
      return false
    }
  }

  getUtterance(id: string): TranscriptUtterance | undefined {
    return this.utterances.get(id)
  }

  snapshotRecent(limit: number): TranscriptUtterance[] {
    // Simple approach: return most recently updated items
    return Array.from(this.utterances.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map(u => ({...u})) // shallow clone snapshot
  }

  on<E extends AnyFSMEvent>(event: E, handler: EventHandler<E>): () => void {
    return this.bus.on(event, handler)
  }

  private transition(
    u: TranscriptUtterance,
    to: TranscriptState,
    reason: TransitionReason,
    context?: Record<string, unknown>
  ): boolean {
    const from = u.state
    if (!isAllowedTransition(from, to)) {
      const rejection: TransitionRejection = {
        from,
        attemptedTo: to,
        reason,
        utteranceId: u.id,
        at: Date.now(),
        cause:
          from === to
            ? 'SAME_STATE_NOOP'
            : from === TranscriptState.FINALIZED
              ? 'FINALIZED_IMMUTABLE'
              : 'INVALID_TRANSITION'
      }

      // Log rejection via telemetry
      this.telemetry.logRejection(rejection)

      this.bus.emit('fsm.transition.rejected', rejection)
      this.metrics.rejectedTransitions++

      // Record failed transition in history if enabled
      if (this.config.enableHistoryTracking) {
        this.recordTransitionHistory({
          id: genId(),
          utteranceId: u.id,
          from,
          to,
          reason,
          timestamp: Date.now(),
          success: false,
          error: `Transition rejected: ${rejection.cause}`,
          context
        })
      }

      return false
    }

    const now = performance?.now?.() || Date.now()
    u.state = to
    u.updatedAt = now

    const transition: FSMTransition = {
      from,
      to,
      reason,
      utteranceId: u.id,
      at: now,
      latencyMs: undefined
    }

    if (transitionReasonRequiresLatency(reason) && u.awaitingFinalSince) {
      transition.latencyMs = now - u.awaitingFinalSince
    }

    // Log successful transition via telemetry
    this.telemetry.logTransition(transition, u)

    this.bus.emit('fsm.transition', transition)
    this.metrics.transitionsCount++
    this.metrics.lastActivity = now

    // Record successful transition in history if enabled
    if (this.config.enableHistoryTracking) {
      this.recordTransitionHistory({
        id: genId(),
        utteranceId: u.id,
        from,
        to,
        reason,
        timestamp: now,
        latencyMs: transition.latencyMs,
        success: true,
        context
      })
    }

    return true
  }

  private recordTransitionHistory(entry: TransitionHistoryEntry): void {
    this.transitionHistory.push(entry)

    // Prune old entries if needed
    this.pruneHistory()

    this.bus.emit('fsm.history.recorded', {
      entry,
      totalHistoryCount: this.transitionHistory.length
    })
  }

  private pruneHistory(): void {
    const now = Date.now()
    let pruned = 0

    // Remove entries older than retention period
    const beforeCount = this.transitionHistory.length
    this.transitionHistory = this.transitionHistory.filter(entry => {
      const age = now - entry.timestamp
      return age <= this.config.historyRetentionMs
    })
    pruned += beforeCount - this.transitionHistory.length

    // Trim to max count if still over limit
    if (this.transitionHistory.length > this.config.historyRetentionCount) {
      const excess = this.transitionHistory.length - this.config.historyRetentionCount
      this.transitionHistory = this.transitionHistory.slice(excess)
      pruned += excess
    }

    if (pruned > 0 && this.config.enableMetrics) {
      this.bus.emit('fsm.history.pruned', {
        pruned,
        remaining: this.transitionHistory.length
      })
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = performance?.now?.() || Date.now()
      let removed = 0

      // Remove old terminal states
      for (const [id, u] of this.utterances) {
        if (
          (u.state === TranscriptState.FINALIZED ||
            u.state === TranscriptState.ABORTED ||
            u.state === TranscriptState.RECOVERED) &&
          now - u.updatedAt > this.config.terminalRetentionMs
        ) {
          this.utterances.delete(id)
          removed++
        }
      }

      // If still too many, trim oldest
      if (this.utterances.size > this.config.maxUtterances) {
        const surplus = this.utterances.size - this.config.maxUtterances
        const ordered = Array.from(this.utterances.values()).sort(
          (a, b) => a.updatedAt - b.updatedAt
        )
        for (let i = 0; i < surplus; i++) {
          this.utterances.delete(ordered[i].id)
          removed++
        }
      }

      // Prune history as well
      this.pruneHistory()

      if (removed > 0) {
        console.debug(`[FSM] Pruned ${removed} utterances (size=${this.utterances.size})`)
        this.telemetry.logCleanup(removed, this.utterances.size, 'utterances')
      }
    }, this.config.cleanupIntervalMs)
  }

  /**
   * Destroy the FSM instance and clean up resources
   */
  destroy(): void {
    this.stopCleanup()
    this.utterances.clear()
    this.transitionHistory = []
    this.metrics = {
      totalUtterances: 0,
      activeUtterances: 0,
      transitionsCount: 0,
      rejectedTransitions: 0,
      partialUpdates: 0,
      finalizations: 0,
      recoveries: 0,
      aborts: 0,
      lastActivity: Date.now()
    }

    // Generate final telemetry report before cleanup
    if (this.telemetry !== fsmTelemetry) {
      const report = this.telemetry.generateReport()
      console.log('[FSM] Final telemetry report:\n', report)
      this.telemetry.destroy()
    }
  }

  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}

export const TranscriptFSM = new TranscriptFSMCore()
