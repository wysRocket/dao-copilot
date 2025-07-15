/**
 * TranscriptionEventTest - Component for testing the unified WebSocket event flow
 *
 * This component provides buttons to simulate WebSocket transcription events
 * and verify they properly flow through the TranscriptionEventMiddleware
 * to the unified TranscriptionStateManager.
 */

import React, {useState} from 'react'
import {getTranscriptionEventMiddleware} from '../middleware/TranscriptionEventMiddleware'
import {useTranscriptionState} from '../hooks/useTranscriptionState'

export const TranscriptionEventTest: React.FC = () => {
  const [testResults, setTestResults] = useState<string[]>([])
  const middleware = getTranscriptionEventMiddleware()

  const {state, currentStreamingText, isStreamingActive, transcripts} = useTranscriptionState()

  const addTestResult = (result: string) => {
    setTestResults(prev => [`${new Date().toLocaleTimeString()}: ${result}`, ...prev.slice(0, 9)])
  }

  const testPartialWebSocketTranscription = () => {
    addTestResult('🧪 Testing partial WebSocket transcription...')
    middleware.simulateTranscription(
      'This is a partial WebSocket transcription being typed...',
      'websocket-gemini',
      true
    )

    setTimeout(() => {
      const isActive = middleware.getStateManager().getState().streaming.isActive
      addTestResult(
        `✅ Streaming active: ${isActive}, Text: "${currentStreamingText.substring(0, 30)}..."`
      )
    }, 100)
  }

  const testCompleteWebSocketTranscription = () => {
    addTestResult('🧪 Testing complete WebSocket transcription...')
    middleware.simulateTranscription(
      'This is a complete WebSocket transcription message.',
      'websocket-gemini',
      false
    )

    setTimeout(() => {
      const isActive = middleware.getStateManager().getState().streaming.isActive
      addTestResult(
        `✅ Streaming active: ${isActive}, Text: "${currentStreamingText.substring(0, 30)}..."`
      )
    }, 100)
  }

  const testStaticTranscription = () => {
    addTestResult('🧪 Testing static (non-WebSocket) transcription...')
    middleware.simulateTranscription('This is a static batch transcription.', 'batch-upload', false)

    setTimeout(() => {
      const transcriptCount = middleware.getStateManager().getState().static.transcripts.length
      addTestResult(`✅ Static transcripts count: ${transcriptCount}`)
    }, 100)
  }

  const testStreamingSequence = () => {
    addTestResult('🧪 Testing streaming sequence (partial → complete)...')

    // Start with partial
    middleware.simulateTranscription('Hello, this is a streaming...', 'websocket-gemini', true)

    setTimeout(() => {
      addTestResult(`📝 Partial: "${currentStreamingText}"`)
      // Update with more text
      middleware.simulateTranscription(
        'Hello, this is a streaming transcription being updated...',
        'websocket-gemini',
        true
      )
    }, 500)

    setTimeout(() => {
      addTestResult(`📝 Updated: "${currentStreamingText}"`)
      // Complete the transcription
      middleware.simulateTranscription(
        'Hello, this is a streaming transcription being updated and now completed!',
        'websocket-gemini',
        false
      )
    }, 1000)

    setTimeout(() => {
      const isActive = middleware.getStateManager().getState().streaming.isActive
      addTestResult(`✅ Final: Active=${isActive}, Text="${currentStreamingText}"`)
    }, 1500)
  }

  const clearResults = () => {
    setTestResults([])
  }

  return (
    <div className="transcription-event-test rounded-lg border bg-gray-50 p-4 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold">🧪 Transcription Event Flow Test</h3>

      {/* Current State Display */}
      <div className="mb-4 rounded bg-blue-50 p-3 dark:bg-blue-900">
        <h4 className="mb-2 font-medium">Current State:</h4>
        <div className="space-y-1 text-sm">
          <div>
            🔄 Streaming Active:{' '}
            <span className="font-mono">{isStreamingActive ? 'true' : 'false'}</span>
          </div>
          <div>
            📝 Streaming Text:{' '}
            <span className="font-mono">
              &quot;{currentStreamingText.substring(0, 50)}
              {currentStreamingText.length > 50 ? '...' : ''}&quot;
            </span>
          </div>
          <div>
            📊 Static Transcripts: <span className="font-mono">{transcripts.length}</span>
          </div>
          <div>
            🎯 Stream Progress: <span className="font-mono">{state.streaming.progress}</span>
          </div>
        </div>
      </div>

      {/* Test Buttons */}
      <div className="mb-4 space-x-2 space-y-2">
        <button
          onClick={testPartialWebSocketTranscription}
          className="rounded bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
        >
          Test Partial WebSocket
        </button>

        <button
          onClick={testCompleteWebSocketTranscription}
          className="rounded bg-green-500 px-3 py-2 text-white hover:bg-green-600"
        >
          Test Complete WebSocket
        </button>

        <button
          onClick={testStaticTranscription}
          className="rounded bg-purple-500 px-3 py-2 text-white hover:bg-purple-600"
        >
          Test Static Transcription
        </button>

        <button
          onClick={testStreamingSequence}
          className="rounded bg-orange-500 px-3 py-2 text-white hover:bg-orange-600"
        >
          Test Streaming Sequence
        </button>

        <button
          onClick={clearResults}
          className="rounded bg-gray-500 px-3 py-2 text-white hover:bg-gray-600"
        >
          Clear Results
        </button>
      </div>

      {/* Test Results */}
      <div className="test-results">
        <h4 className="mb-2 font-medium">Test Results:</h4>
        <div className="max-h-60 overflow-y-auto rounded bg-black p-3 font-mono text-sm text-green-400">
          {testResults.length === 0 ? (
            <div className="text-gray-500">No test results yet. Click a test button above.</div>
          ) : (
            testResults.map((result, index) => <div key={index}>{result}</div>)
          )}
        </div>
      </div>

      {/* Debug Information */}
      <details className="mt-4">
        <summary className="cursor-pointer font-medium">🔍 Debug State Information</summary>
        <pre className="mt-2 overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-700">
          {JSON.stringify(
            {
              streaming: state.streaming,
              static: {
                transcriptCount: state.static.transcripts.length,
                lastUpdate: state.static.lastUpdate
              },
              meta: state.meta
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  )
}

export default TranscriptionEventTest
