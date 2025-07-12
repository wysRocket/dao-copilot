#!/usr/bin/env node
/**
 * Manual test script to verify WebSocket connection with correct Gemini Live API model
 * Run with: node test-websocket-fix.js
 */

const fs = require('fs')
const path = require('path')

// Import the WebSocket client
const GeminiLiveWebSocketClient = require('./dist/services/gemini-live-websocket.js').default

async function testWebSocketConnection() {
  console.log('🧪 Testing WebSocket connection with corrected Gemini Live API model...\n')

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    console.error('❌ No API key found. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.')
    process.exit(1)
  }

  console.log('✅ API key found (first 8 chars):', apiKey.substring(0, 8) + '...')

  // Create client with correct Live API model
  const client = new GeminiLiveWebSocketClient({
    apiKey,
    model: 'gemini-2.0-flash-live-001' // Using correct Live API model
  })

  try {
    console.log('🔌 Attempting to connect to Gemini Live API WebSocket...')
    console.log('📡 Model: gemini-2.0-flash-live-001')
    console.log(
      '🌐 Endpoint: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent\n'
    )

    // Set up event listeners
    client.on('connected', () => {
      console.log('✅ WebSocket connected successfully!')
    })

    client.on('setupComplete', () => {
      console.log('✅ Setup message accepted by server!')
      console.log('🎉 This confirms the model compatibility issue is RESOLVED!\n')

      // Disconnect after successful setup
      setTimeout(() => {
        client.disconnect()
      }, 1000)
    })

    client.on('error', error => {
      console.error('❌ WebSocket error:', error.message)
      if (error.message.includes('1011')) {
        console.error('💡 1011 errors typically indicate model compatibility issues')
      } else if (error.message.includes('1007')) {
        console.error('💡 1007 errors typically indicate invalid message format')
      }
    })

    client.on('disconnected', () => {
      console.log('🔌 WebSocket disconnected')
      console.log('\n🎯 Test completed!')
    })

    // Connect to WebSocket
    await client.connect()

    // Wait for events
    await new Promise(resolve => {
      setTimeout(resolve, 5000) // Wait 5 seconds for connection events
    })
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('\n🔍 This might indicate:')
    console.error('   - Network connectivity issues')
    console.error('   - Invalid API key')
    console.error('   - API quota exceeded')
    console.error('   - Model compatibility issues (if 1011 error)')
  }
}

// Run the test
testWebSocketConnection().catch(console.error)
