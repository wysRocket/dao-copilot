/*
 * Allowed transition matrix for Transcript FSM.
 * Fast O(1) validation via Set lookup.
 */
import {TranscriptState, TransitionReason} from './TranscriptStates'

// Represent allowed transitions as string keys `${from}>${to}`
const allowed = new Set<string>([
  // Creation path
  `${TranscriptState.PENDING_PARTIAL}>${TranscriptState.STREAMING_ACTIVE}`,
  // Streaming growth (idempotent partial appends)
  `${TranscriptState.STREAMING_ACTIVE}>${TranscriptState.STREAMING_ACTIVE}`,
  // Waiting for final
  `${TranscriptState.STREAMING_ACTIVE}>${TranscriptState.AWAITING_FINAL}`,
  // Direct finalize fast path
  `${TranscriptState.STREAMING_ACTIVE}>${TranscriptState.FINALIZED}`,
  // Awaiting final -> final
  `${TranscriptState.AWAITING_FINAL}>${TranscriptState.FINALIZED}`,
  // Recovery paths
  `${TranscriptState.STREAMING_ACTIVE}>${TranscriptState.RECOVERED}`,
  `${TranscriptState.AWAITING_FINAL}>${TranscriptState.RECOVERED}`,
  `${TranscriptState.RECOVERED}>${TranscriptState.FINALIZED}`,
  // Abort (allowed from any non terminal except already finalized)
  `${TranscriptState.PENDING_PARTIAL}>${TranscriptState.ABORTED}`,
  `${TranscriptState.STREAMING_ACTIVE}>${TranscriptState.ABORTED}`,
  `${TranscriptState.AWAITING_FINAL}>${TranscriptState.ABORTED}`,
  `${TranscriptState.RECOVERED}>${TranscriptState.ABORTED}`
])

export function isAllowedTransition(from: TranscriptState, to: TranscriptState): boolean {
  if (from === to && from !== TranscriptState.STREAMING_ACTIVE) return false // avoid noop except growth state
  if (from === TranscriptState.FINALIZED) return false // immutable
  return allowed.has(`${from}>${to}`)
}

export function transitionReasonRequiresLatency(reason: TransitionReason): boolean {
  return reason === TransitionReason.FINAL_RECEIVED || reason === TransitionReason.RECOVERY_REPLAY
}
