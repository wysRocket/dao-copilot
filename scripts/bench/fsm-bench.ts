/* Simple benchmark harness for TranscriptFSM ingestion latency */
import {TranscriptFSM} from '../../src/transcription/fsm'

function bench(iterations = 10000) {
  const utteranceId = TranscriptFSM.createUtterance({sessionId: 'bench'})
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    TranscriptFSM.applyPartial(utteranceId, `partial ${i}`)
  }
  TranscriptFSM.applyFinal(utteranceId, 'final text')
  const end = performance.now()
  const avg = (end - start) / iterations
  console.log(`FSM partial avg latency: ${avg.toFixed(4)} ms over ${iterations} iterations`)
}

bench(parseInt(process.argv[2] || '10000', 10))
