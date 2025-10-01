import {describe, it, expect} from 'vitest'
import {TranscriptFSM, TranscriptState, TransitionReason} from '../../../src/transcription/fsm'

describe('TranscriptFSM Core', () => {
  it('creates utterance and promotes on first partial', () => {
    const id = TranscriptFSM.createUtterance({sessionId: 's1'})
    let u = TranscriptFSM.getUtterance(id)!
    expect(u.state).toBe(TranscriptState.PENDING_PARTIAL)
    TranscriptFSM.applyPartial(id, 'hello')
    u = TranscriptFSM.getUtterance(id)!
    expect(u.state).toBe(TranscriptState.STREAMING_ACTIVE)
    expect(u.textDraft).toBe('hello')
  })

  it('finalizes correctly from streaming', () => {
    const id = TranscriptFSM.createUtterance({sessionId: 's2'})
    TranscriptFSM.applyPartial(id, 'part 1')
    TranscriptFSM.applyFinal(id, 'part 1 final')
    const u = TranscriptFSM.getUtterance(id)!
    expect(u.state).toBe(TranscriptState.FINALIZED)
    expect(u.finalText).toBe('part 1 final')
  })

  it('ignores late partial after final', () => {
    const id = TranscriptFSM.createUtterance({sessionId: 's3'})
    TranscriptFSM.applyPartial(id, 'x')
    TranscriptFSM.applyFinal(id, 'x final')
    const before = TranscriptFSM.getUtterance(id)!.sequence
    TranscriptFSM.applyPartial(id, 'late should ignore')
    const after = TranscriptFSM.getUtterance(id)!.sequence
    expect(after).toBe(before) // no increment
  })
})
