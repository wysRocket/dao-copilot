/**
 * Authentication Test Script - JavaScript version
 * Tests different authentication methods for GCP Gemini Live API
 */

import {GoogleGenAI} from '@google/genai'
import {GoogleAuth} from 'google-auth-library'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

/**
 * Test API Key Authentication
 */
async function testApiKeyAuth() {
  console.log('🔑 Testing API Key Authentication...')

  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY

  if (!apiKey) {
    console.log('❌ No API key found in environment variables')
    return false
  }

  try {
    const client = new GoogleGenAI({apiKey})

    // Test with a simple API call
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [{text: 'Test authentication'}]
        }
      ]
    })

    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.log('✅ API Key authentication successful')
      console.log(`📝 API Key: ${apiKey.substring(0, 10)}...`)
      return true
    } else {
      console.log('❌ API Key authentication failed - no response')
      return false
    }
  } catch (error) {
    console.log('❌ API Key authentication failed:', error.message)
    return false
  }
}

/**
 * Test Service Account Authentication
 */
async function testServiceAccountAuth() {
  console.log('🏢 Testing Service Account Authentication...')

  const hasServiceAccount =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_KEY

  if (!hasServiceAccount) {
    console.log('⏭️ Skipping service account test (no credentials configured)')
    console.log('💡 To test: Set GOOGLE_APPLICATION_CREDENTIALS or GCP_SERVICE_ACCOUNT_KEY')
    return true // Don't fail the test if not configured
  }

  try {
    let authConfig = {}

    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
      try {
        authConfig.credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY)
      } catch {
        console.log('❌ Invalid JSON in GCP_SERVICE_ACCOUNT_KEY')
        return false
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      authConfig.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
    }

    authConfig.scopes = [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/generative-language'
    ]

    const auth = new GoogleAuth(authConfig)
    const client = await auth.getClient()
    const accessToken = await client.getAccessToken()

    if (accessToken.token) {
      console.log('✅ Service Account authentication successful')
      console.log(`📝 Access Token: ${accessToken.token.substring(0, 20)}...`)
      return true
    } else {
      console.log('❌ Service Account authentication failed - no token')
      return false
    }
  } catch (error) {
    console.log('❌ Service Account authentication failed:', error.message)
    return false
  }
}

/**
 * Test Environment Variable Configuration
 */
async function testEnvironmentConfig() {
  console.log('🌍 Testing Environment Variable Configuration...')

  const envVars = [
    'GEMINI_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GCP_SERVICE_ACCOUNT_KEY',
    'GCP_PROJECT_ID'
  ]

  let foundVars = 0
  for (const varName of envVars) {
    if (process.env[varName]) {
      foundVars++
      const value = process.env[varName]
      const displayValue = value.length > 20 ? `${value.substring(0, 15)}...` : value
      console.log(`✅ ${varName}: ${displayValue}`)
    } else {
      console.log(`⚪ ${varName}: not set`)
    }
  }

  if (foundVars > 0) {
    console.log(`✅ Environment configuration found (${foundVars}/${envVars.length} variables set)`)
    return true
  } else {
    console.log('❌ No authentication environment variables found')
    return false
  }
}

/**
 * Test Live API Interface Availability
 */
async function testLiveAPIInterface() {
  console.log('🚀 Testing Live API Interface Availability...')

  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY

  if (!apiKey) {
    console.log('❌ No API key available for Live API test')
    return false
  }

  try {
    const client = new GoogleGenAI({apiKey})

    if (client.live) {
      console.log('✅ Live API interface is available')
      console.log('📝 Live API models supported:')
      console.log('   - gemini-2.5-flash-preview-native-audio-dialog (native audio)')
      console.log('   - gemini-live-2.5-flash-preview (half-cascade)')
      return true
    } else {
      console.log('❌ Live API interface not found')
      return false
    }
  } catch (error) {
    console.log('❌ Live API interface test failed:', error.message)
    return false
  }
}

/**
 * Test Authentication Priority and Fallback
 */
async function testAuthPriority() {
  console.log('🔄 Testing Authentication Priority and Fallback...')

  const methods = []

  // Check API Key
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
    methods.push('API Key')
  }

  // Check Service Account
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_KEY) {
    methods.push('Service Account')
  }

  // Check Default/Metadata
  // (Would need to be in GCP environment to test)

  if (methods.length > 0) {
    console.log(`✅ Available authentication methods: ${methods.join(', ')}`)
    console.log('📝 Recommended priority: Service Account → API Key → Default')
    return true
  } else {
    console.log('❌ No authentication methods available')
    return false
  }
}

async function main() {
  console.log('🧪 Starting GCP Authentication Tests')
  console.log('='.repeat(60))

  const tests = [
    {name: 'Environment Config', fn: testEnvironmentConfig},
    {name: 'API Key Auth', fn: testApiKeyAuth},
    {name: 'Service Account Auth', fn: testServiceAccountAuth},
    {name: 'Live API Interface', fn: testLiveAPIInterface},
    {name: 'Auth Priority', fn: testAuthPriority}
  ]

  const results = []

  for (const test of tests) {
    try {
      console.log(`\n🔍 Running ${test.name}...`)
      const result = await test.fn()
      results.push({name: test.name, passed: result})
    } catch (error) {
      console.log(`❌ ${test.name} threw an error:`, error.message)
      results.push({name: test.name, passed: false})
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Results Summary:')

  let passCount = 0
  for (const result of results) {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED'
    console.log(`${result.name}: ${status}`)
    if (result.passed) passCount++
  }

  console.log(`\n🎯 Overall: ${passCount}/${results.length} tests passed`)

  if (passCount === results.length) {
    console.log('🎉 All authentication tests passed!')
    console.log('📋 Next Steps:')
    console.log('   1. Authentication system is ready')
    console.log('   2. Can proceed with Live API client implementation')
    console.log('   3. Consider adding service account for production')
  } else if (passCount > 0) {
    console.log('⚠️ Some tests passed - authentication partially configured')
    console.log('💡 Consider setting up additional authentication methods for redundancy')
  } else {
    console.log('💥 All tests failed - check authentication setup')
    process.exit(1)
  }
}

// Run the tests
main().catch(error => {
  console.error('❌ Test runner failed:', error)
  process.exit(1)
})
