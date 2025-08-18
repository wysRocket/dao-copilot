/* Typed event payload definitions for FSM event bus */
import {FSMTransition, TransitionRejection, TransitionHistoryEntry} from './TranscriptStates'

export interface PartialAppendedPayload {
  utteranceId: string
  draft: string
  confidence?: number
  sequence: number
  at: number
}

export interface HistoryRecordedPayload {
  entry: TransitionHistoryEntry
  totalHistoryCount: number
}

export type FSMEventPayloads = {
  'fsm.transition': FSMTransition
  'fsm.transition.rejected': TransitionRejection
  'fsm.partial.append': PartialAppendedPayload
  'fsm.partial.late_ignored': {utteranceId: string; at: number}
  'fsm.orphan.recovery_attempt': {utteranceId: string; at: number}
  'fsm.orphan.recovered': {utteranceId: string; at: number}
  'fsm.history.recorded': HistoryRecordedPayload
  'fsm.history.pruned': {pruned: number; remaining: number}
  'fsm.error': {error: string; context?: Record<string, unknown>}
  'fsm.force.finalized': {id: string; text: string; previousState: string; timestamp: number}
  'fsm.orphan.detected': {transcriptId: string; currentState: string; stuckDuration: number}
  'fsm.late.partial': {transcriptId: string; partialText: string; timestamp: number}
}

export type AnyFSMEvent = keyof FSMEventPayloads

export type EventHandler<E extends AnyFSMEvent> = (payload: FSMEventPayloads[E]) => void

export interface EventBus {
  on<E extends AnyFSMEvent>(event: E, handler: EventHandler<E>): () => void
  emit<E extends AnyFSMEvent>(event: E, payload: FSMEventPayloads[E]): void
}
