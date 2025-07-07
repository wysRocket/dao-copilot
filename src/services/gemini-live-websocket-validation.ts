/**
 * Validation Test for Updated Gemini Live WebSocket Implementation
 *
 * This script validates that the WebSocket implementation follows GitHub issue #176 requirements:
 * - Uses correct endpoint URL
 * - Uses gemini-live-2.5-flash-preview model
 * - Sends proper setup message with session resumption
 * - Supports both TEXT and AUDIO response modalities
 */

import {GeminiLiveWebSocketClient, type GeminiLiveConfig} from './gemini-live-websocket'

/**
 * Test configuration validation
 */
export function validateConfiguration(): boolean {
  console.log('🔍 Validating WebSocket configuration...')

  const testConfig: GeminiLiveConfig = {
    apiKey: 'test-api-key',
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: ['TEXT', 'AUDIO'],
    systemInstruction: 'You are a helpful assistant.',
    connectionTimeout: 10000
  }

  const client = new GeminiLiveWebSocketClient(testConfig)

  // Test that the client was created with correct configuration
  const configValid =
    // @ts-expect-error - accessing private property for testing
    client.config.model === 'gemini-live-2.5-flash-preview' &&
    // @ts-expect-error - accessing private property for testing
    client.config.responseModalities?.includes('TEXT') &&
    // @ts-expect-error - accessing private property for testing
    client.config.responseModalities?.includes('AUDIO')

  if (configValid) {
    console.log('✅ Configuration validation passed')
    console.log(`   Model: ${testConfig.model}`)
    console.log(`   Response modalities: ${testConfig.responseModalities?.join(', ')}`)
    return true
  } else {
    console.log('❌ Configuration validation failed')
    return false
  }
}

/**
 * Test URL generation
 */
export function validateWebSocketUrl(): boolean {
  console.log('🔍 Validating WebSocket URL generation...')

  const testConfig: GeminiLiveConfig = {
    apiKey: 'test-api-key'
  }

  const client = new GeminiLiveWebSocketClient(testConfig)

  // @ts-expect-error - accessing private method for testing
  const url = client.buildWebSocketUrl()

  const expectedBaseUrl =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'
  const isCorrectUrl = url.startsWith(expectedBaseUrl)

  if (isCorrectUrl) {
    console.log('✅ WebSocket URL validation passed')
    console.log(`   URL: ${url}`)
    return true
  } else {
    console.log('❌ WebSocket URL validation failed')
    console.log(`   Expected to start with: ${expectedBaseUrl}`)
    console.log(`   Got: ${url}`)
    return false
  }
}

/**
 * Test setup message structure
 */
export async function validateSetupMessage(): Promise<boolean> {
  console.log('🔍 Validating setup message structure...')

  const testConfig: GeminiLiveConfig = {
    apiKey: 'test-api-key',
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: ['TEXT', 'AUDIO'],
    systemInstruction: 'You are a helpful assistant.'
  }

  const client = new GeminiLiveWebSocketClient(testConfig)

  // Create a mock WebSocket to test setup message
  let setupMessageSent: any = null

  // Mock WebSocket
  const mockWs = {
    send: (message: string) => {
      setupMessageSent = JSON.parse(message)
    },
    readyState: 1 // WebSocket.OPEN
  }

  // @ts-expect-error - accessing private property for testing
  client.ws = mockWs
  // @ts-expect-error - accessing private property for testing
  client.connectionState = 'connected'

  try {
    // @ts-expect-error - accessing private method for testing
    await client.sendSetupMessage()

    if (setupMessageSent && setupMessageSent.setup) {
      const setup = setupMessageSent.setup
      const isValid =
        setup.model === 'models/gemini-live-2.5-flash-preview' &&
        setup.generationConfig?.responseModalities?.includes('TEXT') &&
        setup.generationConfig?.responseModalities?.includes('AUDIO') &&
        setup.sessionResumption === true &&
        setup.systemInstruction?.parts?.[0]?.text === 'You are a helpful assistant.'

      if (isValid) {
        console.log('✅ Setup message validation passed')
        console.log('   Setup message structure:', JSON.stringify(setupMessageSent, null, 2))
        return true
      } else {
        console.log('❌ Setup message validation failed')
        console.log('   Setup message:', JSON.stringify(setupMessageSent, null, 2))
        return false
      }
    } else {
      console.log('❌ Setup message validation failed - no message sent')
      return false
    }
  } catch (error) {
    console.log('❌ Setup message validation failed with error:', error)
    return false
  }
}

/**
 * Run all validation tests
 */
export async function runValidationTests(): Promise<boolean> {
  console.log('🚀 Running Gemini Live WebSocket validation tests...\n')

  const tests = [validateConfiguration, validateWebSocketUrl, validateSetupMessage]

  const results: boolean[] = []

  for (const test of tests) {
    try {
      const result = await test()
      results.push(result)
      console.log() // Add spacing between tests
    } catch (error) {
      console.log(`❌ Test failed with error: ${error}`)
      console.log() // Add spacing between tests
      results.push(false)
    }
  }

  const allPassed = results.every(result => result)

  console.log('📊 Validation Summary:')
  console.log(`   Total tests: ${tests.length}`)
  console.log(`   Passed: ${results.filter(r => r).length}`)
  console.log(`   Failed: ${results.filter(r => !r).length}`)

  if (allPassed) {
    console.log(
      '🎉 All validation tests passed! Implementation follows GitHub issue #176 requirements.'
    )
  } else {
    console.log('⚠️  Some validation tests failed. Review the implementation.')
  }

  return allPassed
}

// Run tests if this file is executed directly
if (require.main === module) {
  runValidationTests()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('Error running validation tests:', error)
      process.exit(1)
    })
}
