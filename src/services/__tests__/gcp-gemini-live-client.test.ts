/**
 * Basic Validation Tests for GCPGeminiLiveClient Class
 * Tests for Task 16.1 - Create GCPGeminiLiveClient class
 *
 * This file validates the basic structure and functionality of the client.
 * It's designed to work without test framework dependencies.
 */

import {EventEmitter} from 'events'
import GCPGeminiLiveClient, {
  createGCPGeminiLiveClient,
  createNativeAudioClient,
  createHalfCascadeClient,
  type GCPLiveClientConfig
} from '../gcp-gemini-live-client'

/**
 * Simple test runner for basic validation
 */
class TestRunner {
  private tests: Array<{name: string; fn: () => void | Promise<void>}> = []
  private passed = 0
  private failed = 0

  test(name: string, fn: () => void | Promise<void>) {
    this.tests.push({name, fn})
  }

  async run() {
    console.log('🧪 Running GCPGeminiLiveClient validation tests...\n')

    for (const test of this.tests) {
      try {
        await test.fn()
        console.log(`✅ ${test.name}`)
        this.passed++
      } catch (error) {
        console.log(`❌ ${test.name}`)
        console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`)
        this.failed++
      }
    }

    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`)

    if (this.failed === 0) {
      console.log('🎉 All tests passed!')
    }

    return this.failed === 0
  }
}

/**
 * Simple assertion helper
 */
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * Run validation tests
 */
async function runValidationTests() {
  const runner = new TestRunner()

  // Test 1: Basic Constructor
  runner.test('GCPGeminiLiveClient constructor should work', () => {
    const client = new GCPGeminiLiveClient()

    assert(
      client instanceof GCPGeminiLiveClient,
      'Client should be instance of GCPGeminiLiveClient'
    )
    assert(client instanceof EventEmitter, 'Client should extend EventEmitter')
    assert(typeof client.initialize === 'function', 'Should have initialize method')
    assert(typeof client.connect === 'function', 'Should have connect method')
    assert(typeof client.disconnect === 'function', 'Should have disconnect method')
    assert(typeof client.startStreaming === 'function', 'Should have startStreaming method')
    assert(typeof client.stopStreaming === 'function', 'Should have stopStreaming method')

    client.destroy()
  })

  // Test 2: Configuration Handling
  runner.test('GCPGeminiLiveClient should handle configuration', () => {
    const config: GCPLiveClientConfig = {
      authentication: {
        apiKey: 'test-key'
      },
      model: {
        name: 'gemini-2.5-flash-preview-native-audio-dialog',
        enableNativeAudio: true
      },
      debug: true
    }

    const client = new GCPGeminiLiveClient(config)

    assert(client instanceof GCPGeminiLiveClient, 'Client should be created with config')
    assert(!client.isClientConnected(), 'Should not be connected initially')
    assert(!client.isClientStreaming(), 'Should not be streaming initially')
    assert(client.getCurrentSession() === null, 'Should have no session initially')

    client.destroy()
  })

  // Test 3: Metrics
  runner.test('GCPGeminiLiveClient should provide metrics', () => {
    const client = new GCPGeminiLiveClient()

    const metrics = client.getMetrics()
    assert(typeof metrics === 'object', 'Metrics should be an object')
    assert(typeof metrics.connection === 'object', 'Should have connection metrics')
    assert(typeof metrics.audio === 'object', 'Should have audio metrics')
    assert(typeof metrics.performance === 'object', 'Should have performance metrics')
    assert(typeof metrics.errors === 'object', 'Should have error metrics')

    assert(metrics.connection.state === 'disconnected', 'Should start disconnected')
    assert(typeof metrics.connection.uptime === 'number', 'Should have uptime')
    assert(typeof metrics.errors.total === 'number', 'Should have error count')

    client.destroy()
  })

  // Test 4: State Management
  runner.test('GCPGeminiLiveClient should manage state correctly', () => {
    const client = new GCPGeminiLiveClient()

    // Initial state
    assert(!client.isClientConnected(), 'Should start disconnected')
    assert(!client.isClientStreaming(), 'Should start not streaming')
    assert(client.getCurrentSession() === null, 'Should have no session')

    // Metrics should reflect initial state
    const metrics = client.getMetrics()
    assert(metrics.connection.state === 'disconnected', 'Metrics should show disconnected')
    assert(metrics.errors.total === 0, 'Should have no errors initially')

    client.destroy()
  })

  // Test 5: Factory Functions
  runner.test('Factory functions should work', () => {
    // Test basic factory
    const client1 = createGCPGeminiLiveClient()
    assert(client1 instanceof GCPGeminiLiveClient, 'createGCPGeminiLiveClient should work')
    client1.destroy()

    // Test native audio factory
    const client2 = createNativeAudioClient({debug: true})
    assert(client2 instanceof GCPGeminiLiveClient, 'createNativeAudioClient should work')
    client2.destroy()

    // Test half-cascade factory
    const client3 = createHalfCascadeClient({debug: true})
    assert(client3 instanceof GCPGeminiLiveClient, 'createHalfCascadeClient should work')
    client3.destroy()
  })

  // Test 6: Event Emitter Functionality
  runner.test('GCPGeminiLiveClient should support events', () => {
    const client = new GCPGeminiLiveClient()

    let eventReceived = false
    client.on('test-event', () => {
      eventReceived = true
    })

    client.emit('test-event')
    assert(eventReceived, 'Should be able to emit and receive events')

    client.destroy()
  })

  // Test 7: Cleanup
  runner.test('GCPGeminiLiveClient should cleanup properly', async () => {
    const client = new GCPGeminiLiveClient()

    // Should not throw on destroy
    await client.destroy()

    // Should handle multiple destroy calls
    await client.destroy()

    // State should be clean after destroy
    assert(!client.isClientConnected(), 'Should be disconnected after destroy')
    assert(!client.isClientStreaming(), 'Should not be streaming after destroy')
  })

  return runner.run()
}

/**
 * Export the test runner for manual execution
 */
export {runValidationTests}

/**
 * Run tests if this file is executed directly
 */
if (require.main === module) {
  runValidationTests()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}
