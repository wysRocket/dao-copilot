/**
 * WebSocket to UI Data Flow Diagnostic Script
 *
 * This script tests the complete pipeline from WebSocket responses to UI display
 * to identify where the data flow is breaking.
 */

import {TranscriptionSource} from '../services/TranscriptionSourceManager'

console.log('🔍 Starting WebSocket to UI Data Flow Diagnostic...')

async function testWebSocketDataFlow() {
  try {
    // Step 1: Test if the transcription IPC test function works
    console.log('📋 Step 1: Testing IPC streaming communication...')
    const {testStreamingTranscriptionIPC} = await import('../services/main-stt-transcription')
    await testStreamingTranscriptionIPC()

    setTimeout(async () => {
      // Step 2: Test if the Gemini bridge is properly initialized
      console.log('📋 Step 2: Testing Gemini Bridge initialization...')
      try {
        const {getGeminiTranscriptionBridge} = await import(
          '../services/gemini-transcription-bridge'
        )
        const bridge = getGeminiTranscriptionBridge()

        console.log('Bridge status:', bridge.getStatus())

        // Test bridge event emission
        bridge.on(
          'eventForwarded',
          (event: {text?: string; isPartial?: boolean; source?: string}) => {
            console.log('✅ Bridge forwarded event:', {
              text: event.text?.substring(0, 50) + '...',
              isPartial: event.isPartial,
              source: event.source
            })
          }
        )

        bridge.on('bridgeError', (error: {message?: string}) => {
          console.error('❌ Bridge error:', error)
        })
      } catch (bridgeError) {
        console.error('❌ Failed to test bridge:', bridgeError)
      }

      // Step 3: Test TranscriptionStateManager
      console.log('📋 Step 3: Testing TranscriptionStateManager...')
      try {
        const {getTranscriptionStateManager} = await import('../state/TranscriptionStateManager')
        const stateManager = getTranscriptionStateManager()

        console.log('State manager current state:', {
          isStreamingActive: stateManager.getState().streaming.isActive,
          transcriptCount: stateManager.getState().static.transcripts.length,
          streamingText: stateManager.getState().streaming.current?.text?.substring(0, 50) + '...'
        })

        // Test manual state injection
        stateManager.startStreaming({
          id: 'test-streaming-diagnostic',
          text: 'Test diagnostic streaming text',
          timestamp: Date.now(),
          isPartial: true,
          confidence: 0.9,
          source: TranscriptionSource.WEBSOCKET_GEMINI
        })

        console.log('✅ Injected test streaming text into state manager')

        // Check if state updated
        setTimeout(() => {
          const newState = stateManager.getState()
          console.log('State after injection:', {
            isStreamingActive: newState.streaming.isActive,
            streamingText: newState.streaming.current?.text?.substring(0, 50) + '...'
          })
        }, 100)
      } catch (stateError) {
        console.error('❌ Failed to test state manager:', stateError)
      }

      // Step 4: Test WebSocket diagnostics panel connection
      console.log('📋 Step 4: Testing WebSocket Diagnostics connection...')
      try {
        const {getWebSocketDiagnostics} = await import('../utils/websocket-diagnostics')
        const diagnostics = getWebSocketDiagnostics()

        console.log('WebSocket diagnostics state:', {
          isEnabled: true,
          hasInstance: !!diagnostics
        })

        // Test manual diagnostic logging
        if (diagnostics && typeof diagnostics.logWebSocketTiming === 'function') {
          diagnostics.logWebSocketTiming('test-diagnostic', 100)
          console.log('✅ Injected test data into diagnostics')
        } else {
          console.warn('⚠️ Diagnostics methods not available')
        }
      } catch (diagnosticsError) {
        console.error('❌ Failed to test diagnostics:', diagnosticsError)
      }

      // Step 5: Test actual WebSocket client if available
      console.log('📋 Step 5: Testing WebSocket client direct access...')
      try {
        // Try to get a WebSocket client instance directly
        const geminiModule = await import('../services/gemini-live-websocket')
        const GeminiLiveWebSocketClient =
          geminiModule.default || (geminiModule as any).GeminiLiveWebSocketClient

        if (GeminiLiveWebSocketClient) {
          console.log('✅ WebSocket client class is available')
        } else {
          console.warn('⚠️ WebSocket client class not found')
        }
      } catch (clientError) {
        console.error('❌ Failed to test WebSocket client:', clientError)
      }

      console.log('🔍 WebSocket to UI Data Flow Diagnostic completed')
      console.log('Check the logs above to identify where the data flow breaks')
    }, 2000) // Give IPC test time to complete
  } catch (error) {
    console.error('❌ Diagnostic failed:', error)
  }
}

// Export for manual testing
;(globalThis as any).testWebSocketDataFlow = testWebSocketDataFlow

// Auto-run the diagnostic
testWebSocketDataFlow()

export default testWebSocketDataFlow
