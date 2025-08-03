/**
 * Test script for the updated Gemini Live API WebSocket implementation
 * This script verifies that the fixes for GitHub issue #161 work correctly
 */

import GeminiLiveWebSocketClient, {ConnectionState, ResponseModality} from './gemini-live-websocket'
import { getGoogleApiKeys, getEnvVar } from '../utils/env-utils'

async function testGeminiWebSocket() {
  const keys = getGoogleApiKeys()
  const apiKey = keys.primary || keys.secondary

  if (!apiKey) {
    console.error(
      '❌ No API key found. Please set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.'
    )
    return
  }

  console.log('🚀 Testing Gemini Live API WebSocket Implementation (Issue #161 fixes)')
  console.log('='.repeat(70))

  const client = new GeminiLiveWebSocketClient({
    apiKey,
    model: 'gemini-2.5-flash-live',
    responseModalities: [ResponseModality.TEXT],
    systemInstruction: 'You are a helpful AI assistant. Please respond briefly.',
    reconnectAttempts: 3,
    heartbeatInterval: 30000,
    connectionTimeout: 15000,
    apiVersion: getEnvVar('GEMINI_API_VERSION', 'v1beta') // Use configured API version or default to v1beta
  })

  // Set up event listeners
  client.on('connected', () => {
    console.log('✅ WebSocket connected successfully')
  })

  client.on('setupMessageSent', setupMessage => {
    console.log('✅ Setup message sent:', JSON.stringify(setupMessage, null, 2))
  })

  client.on('setupComplete', response => {
    console.log('✅ Setup completed:', response)
  })

  client.on('serverContent', content => {
    console.log('📥 Received server content:', content)
  })

  client.on('error', error => {
    console.error('❌ WebSocket error:', error.message)
  })

  client.on('disconnected', event => {
    console.log('🔌 WebSocket disconnected:', event.code, event.reason)
  })

  client.on('stateChange', (newState, oldState) => {
    console.log(`🔄 State changed: ${oldState} -> ${newState}`)
  })

  try {
    // Test connection
    console.log('\n1️⃣ Testing WebSocket connection...')
    await client.connect()

    // Wait a moment for setup to complete
    await new Promise(resolve => setTimeout(resolve, 2000))

    if (client.getConnectionState() === ConnectionState.CONNECTED) {
      console.log('✅ Connection established successfully')

      // Debug: Log audio buffer details before sending
      const fs = require('fs')
      const path = require('path')
      const testAudioPath = path.resolve(__dirname, '../male.wav')
      if (fs.existsSync(testAudioPath)) {
        const audioBuffer = fs.readFileSync(testAudioPath)
        console.log('🔊 Audio buffer length:', audioBuffer.length)
        console.log('🔊 First 32 bytes:', audioBuffer.slice(0, 32).toString('hex'))
        console.log('🔊 Last 32 bytes:', audioBuffer.slice(-32).toString('hex'))
        // Example: send audio buffer to Gemini
        await client.sendRealtimeInput({
          audio: audioBuffer,
          encoding: 'LINEAR16',
          sampleRate: 16000,
          channels: 1
        })
        console.log('✅ Audio buffer sent to Gemini')
      } else {
        console.warn('⚠️ Test audio file not found:', testAudioPath)
      }

      // Wait for response
      console.log('\n3️⃣ Waiting for response...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    } else {
      console.error('❌ Failed to establish connection')
    }
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : 'Unknown error')
  }

  // Test cleanup
  console.log('\n4️⃣ Testing cleanup...')
  await client.disconnect()
  await client.destroy()
  console.log('✅ Cleanup completed')

  console.log('\n' + '='.repeat(70))
  console.log('🏁 Test completed')

  // Debug: Log raw Gemini API response
  client.on('serverContent', content => {
    console.log('📥 [RAW Gemini API Response]:', JSON.stringify(content, null, 2))
  })
  client.on('textResponse', data => {
    console.log('📥 [Parsed Text Response]:', JSON.stringify(data, null, 2))
  })
}

// Run the test if this file is executed directly
if (require.main === module) {
  testGeminiWebSocket().catch(console.error)
}

export {testGeminiWebSocket}
