/**
 * Test script for the updated Gemini Live API WebSocket implementation
 * This script verifies that the fixes for GitHub issue #161 work correctly
 */

import GeminiLiveWebSocketClient, {ConnectionState, ResponseModality} from './gemini-live-websocket'

async function testGeminiWebSocket() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY

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
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: [ResponseModality.TEXT],
    systemInstruction: 'You are a helpful AI assistant. Please respond briefly.',
    reconnectAttempts: 3,
    heartbeatInterval: 30000,
    connectionTimeout: 15000
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

      // Test sending a simple text message
      console.log('\n2️⃣ Testing text message sending...')
      await client.sendRealtimeInput({
        text: 'Hello! Can you confirm that you received this message?'
      })
      console.log('✅ Text message sent successfully')

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
}

// Run the test if this file is executed directly
if (require.main === module) {
  testGeminiWebSocket().catch(console.error)
}

export {testGeminiWebSocket}
