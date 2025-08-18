/**
 * Integration test for Gemini Live WebSocket Client
 * This file demonstrates how to use the WebSocket client
 */

import GeminiLiveWebSocketClient, {RealtimeInput, ResponseModality} from './gemini-live-websocket'

// Test configuration
const config = {
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '',
  model: 'gemini-live-2.5-flash-preview',
  responseModalities: [ResponseModality.AUDIO],
  systemInstruction: 'You are a helpful assistant for transcription tasks.',
  reconnectAttempts: 3,
  heartbeatInterval: 30000,
  connectionTimeout: 10000
}

/**
 * Test the WebSocket client connection and basic functionality
 */
async function testWebSocketClient() {
  if (!config.apiKey) {
    console.error(
      'API key not found. Please set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.'
    )
    return
  }

  console.log('Testing Gemini Live WebSocket Client...')

  const client = new GeminiLiveWebSocketClient(config)

  // Set up event listeners
  client.on('connected', () => {
    console.log('✅ Successfully connected to Gemini Live API')
  })

  client.on('stateChange', (newState, previousState) => {
    console.log(`🔄 State changed: ${previousState} -> ${newState}`)
  })

  client.on('message', message => {
    console.log('📨 Received message:', JSON.stringify(message, null, 2))
  })

  client.on('audioData', audioData => {
    console.log('🔊 Received audio data:', audioData.substring(0, 50) + '...')
  })

  client.on('turnComplete', () => {
    console.log('✅ Turn complete')
  })

  client.on('error', error => {
    console.error('❌ Error:', error)
  })

  client.on('disconnected', event => {
    console.log('🔌 Disconnected:', event.code, event.reason)
  })

  client.on('maxReconnectAttemptsReached', () => {
    console.error('❌ Max reconnection attempts reached')
  })

  // New ReconnectionManager event listeners
  client.on('reconnectionStarted', data => {
    console.log(`🔄 Reconnection started: attempt ${data.attempt}, delay ${data.delay}ms`)
  })

  client.on('reconnectionAttempt', data => {
    console.log(`🔄 Reconnection attempt ${data.attempt}`)
  })

  client.on('reconnectionFailed', data => {
    console.warn(`⚠️ Reconnection attempt ${data.attempt} failed: ${data.error.message}`)
  })

  client.on('reconnectionStopped', () => {
    console.log('⏹️ Reconnection stopped')
  })

  client.on('connectionQualityUpdate', quality => {
    console.log(`📊 Connection quality: ${quality}`)
  })

  client.on('reconnectionCountdown', data => {
    if (data.remaining > 0) {
      console.log(`⏰ Next reconnection attempt in ${Math.ceil(data.remaining / 1000)}s`)
    }
  })

  try {
    // Test connection
    await client.connect()

    // Wait a bit for connection to establish
    await new Promise(resolve => setTimeout(resolve, 2000))

    if (client.isConnected()) {
      console.log('✅ Connection established successfully')

      // Test sending a text message
      const textInput: RealtimeInput = {
        text: 'Hello! Can you hear me? Please respond with a short greeting.'
      }

      console.log('📤 Sending text input...')
      client.sendRealtimeInput(textInput)

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Test sending audio data (simulated)
      // In a real implementation, this would be actual audio data
      const mockAudioData: RealtimeInput = {
        audio: {
          data: 'UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DEq2YcCEOR1/LNeSsFJHfH8N2QQAoUXrTp',
          mimeType: 'audio/pcm;rate=16000'
        }
      }

      console.log('📤 Sending mock audio input...')
      client.sendRealtimeInput(mockAudioData)

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Test reconnection metrics
      console.log('📊 Testing reconnection metrics...')
      const metrics = client.getConnectionMetrics()
      const reconnectionState = client.getReconnectionState()
      const connectionHistory = client.getConnectionHistory()

      console.log('Connection Metrics:', {
        connectionQuality: metrics.connectionQuality,
        successfulConnections: metrics.successfulConnections,
        failedConnections: metrics.failedConnections,
        averageConnectionDuration: metrics.averageConnectionDuration,
        totalUptime: metrics.totalUptime
      })

      console.log('Reconnection State:', {
        isReconnecting: reconnectionState.isReconnecting,
        attemptCount: reconnectionState.attemptCount,
        lastAttemptResult: reconnectionState.lastAttemptResult
      })

      console.log('Connection History Length:', connectionHistory.length)
    } else {
      console.error('❌ Failed to establish connection')
    }

    // Test graceful disconnection
    console.log('🔌 Testing graceful disconnection...')
    await client.disconnect()

    console.log('✅ Test completed successfully')
  } catch (error) {
    console.error('❌ Test failed:', error)
  } finally {
    // Clean up
    client.destroy()
  }
}

/**
 * Export the test function for use in other modules
 */
export {testWebSocketClient}

// Run test if this file is executed directly
if (require.main === module) {
  testWebSocketClient()
    .then(() => {
      console.log('Test execution completed')
      process.exit(0)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}
