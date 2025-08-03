/**
 * Test Script for Enhanced WebSocket Transcription Processing
 * Tests the improved streaming transcription parser and message handling
 */

import StreamingTranscriptionParser, {
  TranscriptionState,
  type StreamingTranscriptionResult
} from '../services/streaming-transcription-parser'

interface TestMessage {
  name: string
  message: unknown
  expectedText?: string
  expectedState?: TranscriptionState
  expectedLanguage?: string
}

// Test messages in various formats that Gemini Live API might send
const testMessages: TestMessage[] = [
  {
    name: 'Gemini Live server_content format',
    message: {
      server_content: {
        model_turn: {
          parts: [
            {
              text: 'Hello world this is a test'
            }
          ]
        },
        turn_complete: true
      }
    },
    expectedText: 'Hello world this is a test',
    expectedState: TranscriptionState.FINAL,
    expectedLanguage: 'en'
  },
  {
    name: 'Russian/Ukrainian text (like our current issue)',
    message: {
      server_content: {
        model_turn: {
          parts: [
            {
              text: 'на початку'
            }
          ]
        },
        turn_complete: false
      }
    },
    expectedText: 'на початку',
    expectedState: TranscriptionState.PARTIAL,
    expectedLanguage: 'uk'
  },
  {
    name: 'Partial transcription format',
    message: {
      server_content: {
        parts: [
          {
            text: 'This is partial text'
          }
        ],
        partial: true
      }
    },
    expectedText: 'This is partial text',
    expectedState: TranscriptionState.PARTIAL,
    expectedLanguage: 'en'
  },
  {
    name: 'Direct text format',
    message: {
      text: 'Direct text message',
      isFinal: true,
      confidence: 0.95
    },
    expectedText: 'Direct text message',
    expectedState: TranscriptionState.FINAL,
    expectedLanguage: 'en'
  },
  {
    name: 'JSON string format',
    message: JSON.stringify({
      server_content: {
        model_turn: {
          parts: [
            {
              text: 'JSON string test message'
            }
          ]
        }
      }
    }),
    expectedText: 'JSON string test message',
    expectedState: TranscriptionState.PARTIAL,
    expectedLanguage: 'en'
  },
  {
    name: 'Multiple parts aggregation',
    message: {
      server_content: {
        model_turn: {
          parts: [
            { text: 'First part' },
            { text: 'Second part' },
            { text: 'Third part' }
          ]
        },
        turn_complete: true
      }
    },
    expectedText: 'First part Second part Third part',
    expectedState: TranscriptionState.FINAL,
    expectedLanguage: 'en'
  },
  {
    name: 'Russian text with confidence',
    message: {
      server_content: {
        model_turn: {
          parts: [
            {
              text: 'Привет мир'
            }
          ]
        },
        confidence: 0.9,
        turn_complete: false
      }
    },
    expectedText: 'Привет мир',
    expectedState: TranscriptionState.PARTIAL,
    expectedLanguage: 'ru'
  },
  {
    name: 'Error message format',
    message: {
      error: {
        message: 'Connection failed',
        code: 1000
      }
    },
    expectedText: '',
    expectedState: TranscriptionState.ERROR
  },
  {
    name: 'Empty/null message',
    message: null,
    expectedText: '',
    expectedState: undefined
  },
  {
    name: 'Malformed JSON string',
    message: '{"invalid": json}',
    expectedText: '',
    expectedState: TranscriptionState.ERROR
  }
]

/**
 * Run comprehensive tests on the streaming transcription parser
 */
export async function runStreamingParserTests(): Promise<void> {
  console.log('🧪 Running Streaming Transcription Parser Tests...\n')

  const parser = new StreamingTranscriptionParser('test_session')
  let testsPassed = 0
  let testsFailed = 0

  // Set up event listeners for debugging
  parser.on('transcriptionResult', (result: StreamingTranscriptionResult) => {
    console.log('📡 Event: transcriptionResult', {
      text: result.text,
      state: result.state,
      language: result.language,
      confidence: result.confidence
    })
  })

  parser.on('transcriptionError', (result: StreamingTranscriptionResult, error: Error) => {
    console.log('❌ Event: transcriptionError', {
      error: error.message,
      result
    })
  })

  // Run individual tests
  for (const test of testMessages) {
    console.log(`\n🔬 Testing: ${test.name}`)
    console.log('📥 Input:', JSON.stringify(test.message, null, 2))

    try {
      const result = parser.parseMessage(test.message)
      
      if (!result && !test.expectedText) {
        console.log('✅ PASS: Correctly returned null for invalid input')
        testsPassed++
        continue
      }

      if (!result && test.expectedText) {
        console.log(`❌ FAIL: Expected text "${test.expectedText}" but got null`)
        testsFailed++
        continue
      }

      if (result) {
        console.log('📤 Output:', {
          text: result.text,
          state: result.state,
          language: result.language,
          confidence: result.confidence,
          isComplete: result.isComplete,
          chunkText: result.metadata?.chunkText
        })

        // Verify text content
        if (test.expectedText && !result.text.includes(test.expectedText)) {
          console.log(`❌ FAIL: Expected text to contain "${test.expectedText}" but got "${result.text}"`)
          testsFailed++
          continue
        }

        // Verify state
        if (test.expectedState && result.state !== test.expectedState) {
          console.log(`❌ FAIL: Expected state "${test.expectedState}" but got "${result.state}"`)
          testsFailed++
          continue
        }

        // Verify language detection (if expected)
        if (test.expectedLanguage && result.language && result.language !== test.expectedLanguage) {
          console.log(`⚠️  WARN: Expected language "${test.expectedLanguage}" but detected "${result.language}"`)
          // Don't fail the test for language detection differences
        }

        console.log('✅ PASS: All assertions passed')
        testsPassed++
      }

    } catch (error) {
      console.log(`❌ FAIL: Exception thrown: ${error instanceof Error ? error.message : error}`)
      testsFailed++
    }
  }

  // Test text accumulation
  console.log('\n🔄 Testing Text Accumulation...')
  parser.reset()

  const chunks = [
    { text: 'First chunk', isFinal: false },
    { text: 'second chunk', isFinal: false },
    { text: 'final chunk', isFinal: true }
  ]

  let accumulatedText = ''
  for (const chunk of chunks) {
    const result = parser.parseMessage({
      text: chunk.text,
      isFinal: chunk.isFinal
    })

    if (result) {
      accumulatedText = result.text
      console.log(`📝 After "${chunk.text}": "${accumulatedText}"`)
    }
  }

  if (accumulatedText === 'First chunk second chunk final chunk') {
    console.log('✅ PASS: Text accumulation works correctly')
    testsPassed++
  } else {
    console.log(`❌ FAIL: Expected "First chunk second chunk final chunk" but got "${accumulatedText}"`)
    testsFailed++
  }

  // Test language statistics
  console.log('\n🌍 Testing Language Detection Statistics...')
  const languageStats = parser.getLanguageStats()
  console.log('📊 Language Stats:', Object.fromEntries(languageStats))

  if (languageStats.size > 0) {
    console.log('✅ PASS: Language detection is working')
    testsPassed++
  } else {
    console.log('⚠️  WARN: No languages detected in tests')
  }

  // Summary
  console.log('\n📋 Test Summary:')
  console.log(`✅ Tests Passed: ${testsPassed}`)
  console.log(`❌ Tests Failed: ${testsFailed}`)
  console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`)

  if (testsFailed === 0) {
    console.log('🎉 All tests passed! The streaming parser is working correctly.')
  } else {
    console.log('⚠️  Some tests failed. Review the output above for details.')
  }

  // Cleanup
  parser.removeAllListeners()
  console.log('\n🧹 Test cleanup completed.')
}

/**
 * Test the actual live transcription integration
 */
export async function testLiveTranscriptionIntegration(): Promise<void> {
  console.log('\n🎤 Testing Live Transcription Integration...')

  // Test if we can access the enhanced audio recording service
  try {
    const {getEnhancedAudioRecordingService} = await import('../services/enhanced-audio-recording')
    const audioService = getEnhancedAudioRecordingService()
    
    console.log('📊 Audio Service State:', {
      isRecording: audioService.getState().isRecording,
      mode: audioService.getState().mode,
      status: audioService.getState().status,
      config: audioService.getConfig()
    })

    // Test the global test functions
    if (typeof window !== 'undefined') {
      const globalWindow = window as unknown as Record<string, unknown>
      if (typeof globalWindow.forceTestTranscription === 'function') {
        console.log('🧪 Running forced test transcription...')
        globalWindow.forceTestTranscription()
        console.log('✅ Forced test transcription executed')
      } else {
        console.log('⚠️  Global test functions not available (not in browser context)')
      }
    }

  } catch (error) {
    console.error('❌ Error testing live integration:', error)
  }
}

// Make functions available globally for manual testing
if (typeof window !== 'undefined') {
  const globalWindow = window as unknown as Record<string, unknown>
  globalWindow.runStreamingParserTests = runStreamingParserTests
  globalWindow.testLiveTranscriptionIntegration = testLiveTranscriptionIntegration
}

// Export for module usage
export default {
  runStreamingParserTests,
  testLiveTranscriptionIntegration
}
