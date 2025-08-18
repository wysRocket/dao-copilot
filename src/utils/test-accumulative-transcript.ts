import {useTranscriptStore} from '../state/transcript-state'

// Test the accumulative transcript functionality
export const testAccumulativeTranscript = () => {
  const {addPartialEntry, addFinalEntry} = useTranscriptStore.getState()

  console.log('🧪 Testing Accumulative Transcript Display')

  // Simulate a real transcription session with accumulation
  const testSessionId = `test-session-${Date.now()}`

  // Step 1: Start with partial text
  console.log('Step 1: Adding partial entry "Hello"')
  addPartialEntry({
    id: testSessionId,
    text: 'Hello',
    confidence: 0.8
  })

  // Step 2: Update with more text (should accumulate)
  setTimeout(() => {
    console.log('Step 2: Updating partial entry to "Hello world"')
    addPartialEntry({
      id: testSessionId,
      text: 'Hello world',
      confidence: 0.85
    })
  }, 1000)

  // Step 3: Further accumulation
  setTimeout(() => {
    console.log('Step 3: Updating partial entry to "Hello world, this is"')
    addPartialEntry({
      id: testSessionId,
      text: 'Hello world, this is',
      confidence: 0.87
    })
  }, 2000)

  // Step 4: Final accumulation
  setTimeout(() => {
    console.log('Step 4: Updating partial entry to "Hello world, this is a test"')
    addPartialEntry({
      id: testSessionId,
      text: 'Hello world, this is a test',
      confidence: 0.9
    })
  }, 3000)

  // Step 5: Finalize the transcription
  setTimeout(() => {
    console.log('Step 5: Finalizing transcription')
    addFinalEntry({
      id: `final-${testSessionId}`,
      text: 'Hello world, this is a test of accumulative transcription',
      confidence: 0.95
    })
  }, 4000)

  // Step 6: Start a new session
  setTimeout(() => {
    const newSessionId = `test-session-${Date.now()}`
    console.log('Step 6: Starting new session with partial "And this is"')
    addPartialEntry({
      id: newSessionId,
      text: 'And this is',
      confidence: 0.82
    })

    setTimeout(() => {
      console.log('Step 7: Updating new session to "And this is another sentence"')
      addPartialEntry({
        id: newSessionId,
        text: 'And this is another sentence',
        confidence: 0.88
      })
    }, 1500)
  }, 5000)

  console.log('✅ Test sequence started. Check the UI for accumulative behavior.')
}

// Export for global access in development
if (typeof window !== 'undefined') {
  ;(window as Record<string, unknown>).testAccumulativeTranscript = testAccumulativeTranscript
}
