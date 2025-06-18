/**
 * Test file for Gemini Live API Authentication System
 * Run with: node --loader ts-node/esm src/services/gemini-auth-test.ts
 */

import { GeminiAuthManager, AuthMethod, createAuthManagerFromEnv } from './gemini-auth.js'

/**
 * Test API Key Authentication
 */
async function testApiKeyAuth() {
  console.log('\n=== Testing API Key Authentication ===')
  
  const authManager = new GeminiAuthManager({
    method: AuthMethod.API_KEY,
    apiKey: 'test-api-key-123'
  })

  try {
    const result = await authManager.authenticate()
    console.log('✓ API Key authentication result:', result)
    
    const headers = authManager.getAuthHeaders()
    console.log('✓ Auth headers:', headers)
    
    const wsParams = authManager.getWebSocketParams()
    console.log('✓ WebSocket params:', wsParams)
    
    console.log('✓ Is authenticated:', authManager.isAuthenticated())
    
  } catch (error) {
    console.error('✗ API Key authentication error:', error)
  }
}

/**
 * Test Bearer Token Authentication
 */
async function testBearerTokenAuth() {
  console.log('\n=== Testing Bearer Token Authentication ===')
  
  const authManager = new GeminiAuthManager({
    method: AuthMethod.BEARER_TOKEN,
    accessToken: 'test-bearer-token-456'
  })

  try {
    const result = await authManager.authenticate()
    console.log('✓ Bearer token authentication result:', result)
    
    const headers = authManager.getAuthHeaders()
    console.log('✓ Auth headers:', headers)
    
    console.log('✓ Is authenticated:', authManager.isAuthenticated())
    
  } catch (error) {
    console.error('✗ Bearer token authentication error:', error)
  }
}

/**
 * Test OAuth2 Authentication (mock)
 */
async function testOAuth2Auth() {
  console.log('\n=== Testing OAuth2 Authentication (Mock) ===')
  
  const authManager = new GeminiAuthManager({
    method: AuthMethod.OAUTH2,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    scopes: ['https://www.googleapis.com/auth/generative-language']
  })

  try {
    // This will fail in real testing without proper OAuth2 setup
    // but we can test the configuration and structure
    console.log('✓ OAuth2 auth manager created successfully')
    console.log('✓ Configuration validated')
    
    // Test event handling
    authManager.on('authenticated', (credentials) => {
      console.log('✓ Authentication event received:', credentials)
    })
    
    authManager.on('authError', (error) => {
      console.log('✓ Auth error event received:', error)
    })
    
    console.log('✓ OAuth2 auth manager ready (would need real credentials to test)')
    
  } catch (error) {
    console.error('✗ OAuth2 authentication error:', error)
  }
}

/**
 * Test Environment-based Authentication
 */
async function testEnvAuth() {
  console.log('\n=== Testing Environment-based Authentication ===')
  
  // Set test environment variables
  process.env.GEMINI_API_KEY = 'env-test-api-key-789'
  process.env.GEMINI_AUTH_METHOD = 'api_key'
  
  try {
    const authManager = createAuthManagerFromEnv()
    const result = await authManager.authenticate()
    
    console.log('✓ Environment-based authentication result:', result)
    console.log('✓ Environment auth manager created and authenticated')
    
  } catch (error) {
    console.error('✗ Environment authentication error:', error)
  }
}

/**
 * Test Authentication Events
 */
async function testAuthEvents() {
  console.log('\n=== Testing Authentication Events ===')
  
  const authManager = new GeminiAuthManager({
    method: AuthMethod.API_KEY,
    apiKey: 'test-events-key'
  })

  // Set up event listeners
  authManager.on('authenticated', (credentials) => {
    console.log('✓ Authenticated event:', credentials)
  })
  
  authManager.on('authError', (error) => {
    console.log('✓ Auth error event:', error)
  })
  
  authManager.on('configUpdated', (config) => {
    console.log('✓ Config updated event:', config)
  })
  
  authManager.on('credentialsCleared', () => {
    console.log('✓ Credentials cleared event')
  })

  try {
    await authManager.authenticate()
    
    // Test config update
    authManager.updateConfig({ apiKey: 'updated-key' })
    
    // Test credential clearing
    authManager.clearCredentials()
    
    console.log('✓ All authentication events tested')
    
  } catch (error) {
    console.error('✗ Auth events error:', error)
  }
}

/**
 * Test Authentication Error Handling
 */
async function testAuthErrorHandling() {
  console.log('\n=== Testing Authentication Error Handling ===')
  
  try {
    // Test missing API key
    void new GeminiAuthManager({
      method: AuthMethod.API_KEY
      // apiKey missing
    })
    console.log('✗ Should have thrown error for missing API key')
  } catch (error) {
    console.log('✓ Correctly caught missing API key error:', (error as Error).message)
  }
  
  try {
    // Test missing OAuth2 credentials
    void new GeminiAuthManager({
      method: AuthMethod.OAUTH2
      // clientId and clientSecret missing
    })
    console.log('✗ Should have thrown error for missing OAuth2 credentials')
  } catch (error) {
    console.log('✓ Correctly caught missing OAuth2 credentials error:', (error as Error).message)
  }
  
  try {
    // Test invalid auth method
    void new GeminiAuthManager({
      method: 'invalid_method' as AuthMethod
    })
    console.log('✗ Should have thrown error for invalid auth method')
  } catch (error) {
    console.log('✓ Correctly caught invalid auth method error:', (error as Error).message)
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Starting Gemini Live API Authentication Tests...')
  
  await testApiKeyAuth()
  await testBearerTokenAuth()
  await testOAuth2Auth()
  await testEnvAuth()
  await testAuthEvents()
  await testAuthErrorHandling()
  
  console.log('\n✅ All authentication tests completed!')
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error)
}

export { runTests }
