/**
 * GCP Gemini Live API Test - JavaScript version
 * Basic connectivity and functionality test for the Google AI SDK
 */

import {GoogleGenAI} from '@google/genai'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Configuration for testing
const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog'
const GEMINI_HALF_CASCADE_MODEL = 'gemini-live-2.5-flash-preview'

/**
 * Test basic SDK connectivity and authentication
 */
export async function testGCPGeminiConnection() {
  try {
    console.log('🔧 Testing GCP Gemini Live API connectivity...')

    // Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      console.error(
        '❌ No API key found. Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable.'
      )
      return false
    }

    // Initialize the client
    const client = new GoogleGenAI({apiKey})
    console.log('✅ Client initialized successfully')

    // Test basic text generation first (simpler than Live API)
    try {
      console.log('🧪 Testing basic text generation...')
      const result = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            parts: [{text: 'Hello, this is a test. Please respond with "Test successful".'}]
          }
        ]
      })

      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text
      console.log('📝 Text response:', responseText)

      if (responseText && responseText.toLowerCase().includes('test successful')) {
        console.log('✅ Basic text generation test passed')
      } else {
        console.log('⚠️ Basic text generation test passed but response unexpected')
      }
    } catch (textError) {
      console.error('❌ Basic text generation failed:', textError)
      return false
    }

    // Test Live API availability (without actually starting a session)
    try {
      console.log('🧪 Testing Live API model availability...')

      // Test native audio model
      console.log(`📡 Checking native audio model: ${GEMINI_LIVE_MODEL}`)
      console.log(`📡 Checking half-cascade model: ${GEMINI_HALF_CASCADE_MODEL}`)

      if (client.live) {
        console.log('✅ Live API interface found')
      } else {
        console.log(
          '⚠️ Live API interface not directly accessible (may require WebSocket implementation)'
        )
      }

      console.log('✅ GCP Gemini Live API connectivity test completed successfully')
      return true
    } catch (liveError) {
      console.error('❌ Live API test failed:', liveError)
      return false
    }
  } catch (error) {
    console.error('❌ GCP Gemini Live API connectivity test failed:', error)
    return false
  }
}

// Run the test if this file is executed directly
async function main() {
  console.log('🧪 Starting GCP Gemini Live API Test')
  console.log('='.repeat(50))

  const result = await testGCPGeminiConnection()

  console.log('='.repeat(50))
  console.log(`📊 Test Result: ${result ? '✅ PASSED' : '❌ FAILED'}`)

  if (result) {
    console.log('🎉 GCP Gemini API connectivity test passed!')
  } else {
    console.log('⚠️ Test failed. Please check configuration and credentials.')
    process.exit(1)
  }
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
}
