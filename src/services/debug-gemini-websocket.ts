/**
 * Debug script to test Gemini Live WebSocket connection
 */

import GeminiLiveWebSocketClient, { ResponseModality } from './gemini-live-websocket'

async function debugGeminiWebSocket() {
  console.log('🔍 Starting Gemini Live WebSocket Debug Test')
  console.log('=' .repeat(50))
  
  // Check for API key
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.')
    return
  }
  
  console.log(`✅ API Key found: ${apiKey.substring(0, 8)}...`)
  
  const client = new GeminiLiveWebSocketClient({
    apiKey,
    model: 'gemini-2.5-flash-live',
    responseModalities: [ResponseModality.TEXT],
    systemInstruction: 'You are a helpful assistant.',
    reconnectAttempts: 1, // Reduced for faster debugging
    heartbeatInterval: 30000,
    connectionTimeout: 30000, // Increased timeout for debugging
    apiVersion: 'v1beta'
  })
  
  // Set up detailed event logging
  client.on('connected', () => {
    console.log('✅ WebSocket connected')
  })
  
  client.on('setupMessageSent', (setupMessage) => {
    console.log('📤 Setup message sent:', JSON.stringify(setupMessage, null, 2))
  })
  
  client.on('setupComplete', (response) => {
    console.log('✅ Setup completed:', response)
  })
  
  client.on('error', (error) => {
    console.error('❌ WebSocket error:', error)
  })
  
  client.on('disconnected', (reason) => {
    console.log('🔌 WebSocket disconnected:', reason)
  })
  
  // Add raw message logging for debugging
  const originalHandleMessage = client['handleMessage'].bind(client)
  client['handleMessage'] = function(event: MessageEvent) {
    console.log('📥 Raw WebSocket message received:', event.data)
    return originalHandleMessage(event)
  }
  
  try {
    console.log('🔄 Attempting to connect...')
    await client.connect()
    
    console.log('✅ Connection established successfully!')
    console.log('Connection state:', client.getConnectionState())
    console.log('Setup completed:', client.isSetupCompleted())
    
    // Wait for setup or timeout
    console.log('⏳ Waiting for setup completion...')
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Setup timeout - no setupComplete event received'))
      }, 30000)
      
      client.on('setupComplete', () => {
        clearTimeout(timeout)
        resolve(undefined)
      })
      
      // If already complete, resolve immediately
      if (client.isSetupCompleted()) {
        clearTimeout(timeout)
        resolve(undefined)
      }
    })
    
    console.log('✅ Setup completed successfully!')
    
  } catch (error) {
    console.error('❌ Debug test failed:', error)
    console.log('\nConnection details:')
    console.log('- State:', client.getConnectionState())  
    console.log('- Setup completed:', client.isSetupCompleted())
    console.log('- Error stats:', client.getErrorStats())
  } finally {
    console.log('🧹 Cleaning up...')
    await client.disconnect()
  }
}

// Run the debug test if this file is executed directly
if (require.main === module) {
  debugGeminiWebSocket().catch(console.error)
}

export { debugGeminiWebSocket }
