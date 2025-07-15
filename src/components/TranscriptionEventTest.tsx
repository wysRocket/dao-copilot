/**
 * TranscriptionEventTest - Component for testing the unified WebSocket event flow
 * 
 * This component provides buttons to simulate WebSocket transcription events
 * and verify they properly flow through the TranscriptionEventMiddleware
 * to the unified TranscriptionStateManager.
 */

import React, { useState } from 'react'
import { getTranscriptionEventMiddleware } from '../middleware/TranscriptionEventMiddleware'
import { useTranscriptionState } from '../hooks/useTranscriptionState'

export const TranscriptionEventTest: React.FC = () => {
  const [testResults, setTestResults] = useState<string[]>([])
  const middleware = getTranscriptionEventMiddleware()
  
  const {
    state,
    currentStreamingText,
    isStreamingActive,
    transcripts
  } = useTranscriptionState()

  const addTestResult = (result: string) => {
    setTestResults(prev => [`${new Date().toLocaleTimeString()}: ${result}`, ...prev.slice(0, 9)])
  }

  const testPartialWebSocketTranscription = () => {
    addTestResult('🧪 Testing partial WebSocket transcription...')
    middleware.simulateTranscription('This is a partial WebSocket transcription being typed...', 'websocket-gemini', true)
    
    setTimeout(() => {
      const isActive = middleware.getStateManager().getState().streaming.isActive
      addTestResult(`✅ Streaming active: ${isActive}, Text: "${currentStreamingText.substring(0, 30)}..."`)
    }, 100)
  }

  const testCompleteWebSocketTranscription = () => {
    addTestResult('🧪 Testing complete WebSocket transcription...')
    middleware.simulateTranscription('This is a complete WebSocket transcription message.', 'websocket-gemini', false)
    
    setTimeout(() => {
      const isActive = middleware.getStateManager().getState().streaming.isActive
      addTestResult(`✅ Streaming active: ${isActive}, Text: "${currentStreamingText.substring(0, 30)}..."`)
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
      middleware.simulateTranscription('Hello, this is a streaming transcription being updated...', 'websocket-gemini', true)
    }, 500)
    
    setTimeout(() => {
      addTestResult(`📝 Updated: "${currentStreamingText}"`)
      // Complete the transcription
      middleware.simulateTranscription('Hello, this is a streaming transcription being updated and now completed!', 'websocket-gemini', false)
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
    <div className="transcription-event-test p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4">🧪 Transcription Event Flow Test</h3>
      
      {/* Current State Display */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded">
        <h4 className="font-medium mb-2">Current State:</h4>
        <div className="text-sm space-y-1">
          <div>🔄 Streaming Active: <span className="font-mono">{isStreamingActive ? 'true' : 'false'}</span></div>
          <div>📝 Streaming Text: <span className="font-mono">&quot;{currentStreamingText.substring(0, 50)}{currentStreamingText.length > 50 ? '...' : ''}&quot;</span></div>
          <div>📊 Static Transcripts: <span className="font-mono">{transcripts.length}</span></div>
          <div>🎯 Stream Progress: <span className="font-mono">{state.streaming.progress}</span></div>
        </div>
      </div>

      {/* Test Buttons */}
      <div className="mb-4 space-x-2 space-y-2">
        <button
          onClick={testPartialWebSocketTranscription}
          className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test Partial WebSocket
        </button>
        
        <button
          onClick={testCompleteWebSocketTranscription}
          className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Test Complete WebSocket
        </button>
        
        <button
          onClick={testStaticTranscription}
          className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          Test Static Transcription
        </button>
        
        <button
          onClick={testStreamingSequence}
          className="px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
        >
          Test Streaming Sequence
        </button>
        
        <button
          onClick={clearResults}
          className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Clear Results
        </button>
      </div>

      {/* Test Results */}
      <div className="test-results">
        <h4 className="font-medium mb-2">Test Results:</h4>
        <div className="bg-black text-green-400 p-3 rounded font-mono text-sm max-h-60 overflow-y-auto">
          {testResults.length === 0 ? (
            <div className="text-gray-500">No test results yet. Click a test button above.</div>
          ) : (
            testResults.map((result, index) => (
              <div key={index}>{result}</div>
            ))
          )}
        </div>
      </div>

      {/* Debug Information */}
      <details className="mt-4">
        <summary className="cursor-pointer font-medium">🔍 Debug State Information</summary>
        <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded text-xs overflow-auto">
          {JSON.stringify({
            streaming: state.streaming,
            static: {
              transcriptCount: state.static.transcripts.length,
              lastUpdate: state.static.lastUpdate
            },
            meta: state.meta
          }, null, 2)}
        </pre>
      </details>
    </div>
  )
}

export default TranscriptionEventTest
