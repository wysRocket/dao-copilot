/*
 * Transcript Lifecycle FSM - State & Transition Type Definitions
 * Provides deterministic lifecycle management for transcript utterances.
 */

export enum TranscriptState {
  PENDING_PARTIAL = 'PENDING_PARTIAL',
  STREAMING_ACTIVE = 'STREAMING_ACTIVE',
  AWAITING_FINAL = 'AWAITING_FINAL',
  FINALIZED = 'FINALIZED',
  ABORTED = 'ABORTED',
  RECOVERED = 'RECOVERED'
}

export enum TransitionReason {
  PARTIAL_RECEIVED = 'PARTIAL_RECEIVED',
  END_OF_SPEECH_DETECTED = 'END_OF_SPEECH_DETECTED',
  BUFFER_QUIET = 'BUFFER_QUIET',
  FINAL_RECEIVED = 'FINAL_RECEIVED',
  RECOVERY_REPLAY = 'RECOVERY_REPLAY',
  USER_STOP = 'USER_STOP',
  ERROR_ABORT = 'ERROR_ABORT',
  TIMEOUT_ORPHAN = 'TIMEOUT_ORPHAN',
  MERGE_UPDATE = 'MERGE_UPDATE'
}

export interface TranscriptUtterance {
  id: string
  sessionId: string
  createdAt: number
  updatedAt: number
  state: TranscriptState
  lastPartialAt?: number
  startedStreamingAt?: number
  awaitingFinalSince?: number
  finalizedAt?: number
  abortedAt?: number
  recoveredAt?: number
  textDraft: string
  finalText?: string
  confidence?: number
  meta?: Record<string, unknown>
  orphanCheckCount?: number
  sequence?: number
}

export interface FSMTransition {
  from: TranscriptState
  to: TranscriptState
  reason: TransitionReason
  at: number
  utteranceId: string
  latencyMs?: number
  extra?: Record<string, unknown>
}

export interface PartialInput {
  text: string
  confidence?: number
  timestamp?: number
  speaker?: string
  language?: string
  metadata?: Record<string, unknown>
}

export type FSMEventType =
  | 'fsm.transition'
  | 'fsm.transition.rejected'
  | 'fsm.partial.append'
  | 'fsm.partial.late_ignored'
  | 'fsm.orphan.recovery_attempt'
  | 'fsm.orphan.recovered'

export interface TransitionRejection {
  from: TranscriptState
  attemptedTo: TranscriptState
  reason: TransitionReason
  utteranceId: string
  at: number
  cause: 'INVALID_TRANSITION' | 'FINALIZED_IMMUTABLE' | 'SAME_STATE_NOOP'
}

export interface TransitionHistoryEntry {
  id: string
  utteranceId: string
  from: TranscriptState
  to: TranscriptState
  reason: TransitionReason
  timestamp: number
  latencyMs?: number
  context?: Record<string, unknown>
  success: boolean
  error?: string
}

export interface FSMConfig {
  maxUtterances: number
  terminalRetentionMs: number
  cleanupIntervalMs: number
  historyRetentionCount: number
  historyRetentionMs: number
  enableHistoryTracking: boolean
  enableMetrics: boolean
}

export const DEFAULT_FSM_CONFIG: FSMConfig = {
  maxUtterances: 5000,
  terminalRetentionMs: 5 * 60 * 1000, // 5 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
  historyRetentionCount: 1000,
  historyRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
  enableHistoryTracking: true,
  enableMetrics: true
}
