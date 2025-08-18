/* Lightweight event bus (no external deps) */
import {AnyFSMEvent, EventBus, EventHandler, FSMEventPayloads} from './TranscriptEvents'

type HandlerSet<E extends AnyFSMEvent = AnyFSMEvent> = Set<EventHandler<E>>

export function createEventBus(): EventBus {
  const handlers: Map<AnyFSMEvent, HandlerSet> = new Map()

  function on<E extends AnyFSMEvent>(event: E, handler: EventHandler<E>): () => void {
    const existing = handlers.get(event) as HandlerSet<E> | undefined
    const set: HandlerSet<E> = existing ?? (new Set() as HandlerSet<E>)
    if (!existing) handlers.set(event, set as HandlerSet)
    set.add(handler)
    return () => {
      set.delete(handler)
      if (set.size === 0) handlers.delete(event)
    }
  }

  function emit<E extends AnyFSMEvent>(event: E, payload: FSMEventPayloads[E]): void {
    const set = handlers.get(event) as HandlerSet<E> | undefined
    if (!set) return
    for (const h of set) {
      try {
        h(payload)
      } catch (e) {
        console.error('FSM event handler error', e)
      }
    }
  }

  return {on, emit}
}
