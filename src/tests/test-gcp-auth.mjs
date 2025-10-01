/**
 * Authentication Test Script
 * Tests different authentication methods for GCP Gemini Live API
 */

import {
  createAuthFromEnvironment,
  GCPAuthManager,
  getGeminiAuthentication
} from './src/services/gcp-auth-manager.js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function testApiKeyAuth() {
  console.log('🔑 Testing API Key Authentication...')

  const authManager = new GCPAuthManager({
    method: 'api-key'
  })

  const result = await authManager.initialize()

  if (result.success) {
    console.log('✅ API Key authentication successful')
    console.log(`📝 Credentials expire: ${result.expiresAt?.toISOString()}`)
    return true
  } else {
    console.log('❌ API Key authentication failed:', result.error)
    return false
  }
}

async function testEnvironmentAuth() {
  console.log('🌍 Testing Environment-based Authentication...')

  const authManager = createAuthFromEnvironment()
  const result = await authManager.initialize()

  if (result.success) {
    console.log(`✅ Environment authentication successful (method: ${result.method})`)
    console.log(`📝 Credentials expire: ${result.expiresAt?.toISOString()}`)
    return true
  } else {
    console.log(`❌ Environment authentication failed (method: ${result.method}):`, result.error)
    return false
  }
}

async function testHelperFunction() {
  console.log('🔧 Testing Helper Function...')

  const auth = await getGeminiAuthentication()

  if (auth.success) {
    console.log('✅ Helper function successful')
    if (auth.apiKey) {
      console.log(`📝 Using API Key: ${auth.apiKey.substring(0, 10)}...`)
    }
    if (auth.accessToken) {
      console.log(`📝 Using Access Token: ${auth.accessToken.substring(0, 20)}...`)
    }
    return true
  } else {
    console.log('❌ Helper function failed:', auth.error)
    return false
  }
}

async function testServiceAccountAuth() {
  console.log('🏢 Testing Service Account Authentication...')

  // Check if service account credentials are available
  const hasServiceAccount =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_KEY

  if (!hasServiceAccount) {
    console.log('⏭️ Skipping service account test (no credentials configured)')
    return true // Don't fail the test if not configured
  }

  const authManager = new GCPAuthManager({
    method: 'service-account'
  })

  const result = await authManager.initialize()

  if (result.success) {
    console.log('✅ Service Account authentication successful')
    console.log(`📝 Credentials expire: ${result.expiresAt?.toISOString()}`)
    return true
  } else {
    console.log('❌ Service Account authentication failed:', result.error)
    return false
  }
}

async function testCredentialRefresh() {
  console.log('🔄 Testing Credential Refresh...')

  const authManager = createAuthFromEnvironment()

  // Get initial credentials
  const initial = await authManager.getCredentials()
  if (!initial.success) {
    console.log('❌ Initial credential fetch failed:', initial.error)
    return false
  }

  // Refresh credentials
  const refreshed = await authManager.refreshCredentials()
  if (!refreshed.success) {
    console.log('❌ Credential refresh failed:', refreshed.error)
    return false
  }

  console.log('✅ Credential refresh successful')
  return true
}

async function main() {
  console.log('🧪 Starting GCP Authentication Tests')
  console.log('='.repeat(60))

  const tests = [
    {name: 'API Key Auth', fn: testApiKeyAuth},
    {name: 'Environment Auth', fn: testEnvironmentAuth},
    {name: 'Helper Function', fn: testHelperFunction},
    {name: 'Service Account Auth', fn: testServiceAccountAuth},
    {name: 'Credential Refresh', fn: testCredentialRefresh}
  ]

  const results = []

  for (const test of tests) {
    try {
      console.log(`\n🔍 Running ${test.name}...`)
      const result = await test.fn()
      results.push({name: test.name, passed: result})
    } catch (error) {
      console.log(`❌ ${test.name} threw an error:`, error)
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
  } else if (passCount > 0) {
    console.log('⚠️ Some tests passed - check configuration for failed tests')
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
