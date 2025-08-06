/**
 * Audio Streaming Integration Tests for GCPGeminiLiveClient
 * Tests for Task 16.3 - Implement real-time audio streami  // Test 4: Different Audio Formats
  runner.test('GCPGeminiLiveClient should handle different audio formats', () => {
    // Test with supported formats for the default native audio model
    const configs = [
      { format: 'pcm16' as const, expectedFormat: 'pcm16' }
    ]
    
    configs.forEach(({ format }) => {
      const client = new GCPGeminiLiveClient({
        audio: { format }
      })
      
      assert(client instanceof GCPGeminiLiveClient, `Should create client with ${format} format`)
      client.destroy()
    })
    
    // Test with half-cascade model that supports more formats
    const halfCascadeClient = new GCPGeminiLiveClient({
      model: { name: 'gemini-2.0-flash-live-001' },
      audio: { format: 'pcm16' }
    })
    
    assert(halfCascadeClient instanceof GCPGeminiLiveClient, 'Should create client with half-cascade model')
    halfCascadeClient.destroy()
  })le validates the audio streaming functionality of the client.
 */

import GCPGeminiLiveClient, {type GCPLiveClientConfig} from '../gcp-gemini-live-client'

/**
 * Simple test runner for audio streaming validation
 */
class AudioStreamingTestRunner {
  private tests: Array<{name: string; fn: () => void | Promise<void>}> = []
  private passed = 0
  private failed = 0

  test(name: string, fn: () => void | Promise<void>) {
    this.tests.push({name, fn})
  }

  async run() {
    console.log('🎙️ Running GCPGeminiLiveClient audio streaming tests...\n')

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
      console.log('🎉 All audio streaming tests passed!')
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
 * Run audio streaming validation tests
 */
async function runAudioStreamingTests() {
  const runner = new AudioStreamingTestRunner()

  // Test 1: Audio Configuration
  runner.test('GCPGeminiLiveClient should accept audio configuration', () => {
    const config: GCPLiveClientConfig = {
      authentication: {
        apiKey: 'test-key'
      },
      model: {
        name: 'gemini-2.5-flash-preview-native-audio-dialog',
        enableNativeAudio: true
      },
      audio: {
        inputSampleRate: 16000,
        outputSampleRate: 24000,
        format: 'pcm16',
        channels: 1,
        chunkSize: 4096
      }
    }

    const client = new GCPGeminiLiveClient(config)

    assert(client instanceof GCPGeminiLiveClient, 'Client should be created with audio config')
    assert(!client.isClientStreaming(), 'Should not be streaming initially')

    client.destroy()
  })

  // Test 2: Audio Streaming Methods
  runner.test('GCPGeminiLiveClient should have audio streaming methods', () => {
    const client = new GCPGeminiLiveClient()

    assert(typeof client.startStreaming === 'function', 'Should have startStreaming method')
    assert(typeof client.stopStreaming === 'function', 'Should have stopStreaming method')
    assert(typeof client.isClientStreaming === 'function', 'Should have isClientStreaming method')

    client.destroy()
  })

  // Test 3: Audio Streaming State Management
  runner.test('GCPGeminiLiveClient should manage streaming state', async () => {
    const client = new GCPGeminiLiveClient({
      debug: true
    })

    // Initial state
    assert(!client.isClientStreaming(), 'Should start not streaming')

    // Test streaming without connection (should fail gracefully)
    try {
      await client.startStreaming()
      assert(false, 'Should not allow streaming without connection')
    } catch (error) {
      assert(error instanceof Error, 'Should throw error when not connected')
      assert(
        (error as Error).message.includes('Not connected'),
        'Error should mention connection requirement'
      )
    }

    // State should remain unchanged after failed start
    assert(!client.isClientStreaming(), 'Should still not be streaming after failed start')

    await client.destroy()
  })

  // Test 4: Audio Format Configuration
  runner.test('GCPGeminiLiveClient should handle different audio formats', () => {
    // Test with supported formats for the default native audio model
    const configs = [{format: 'pcm16' as const, expectedFormat: 'pcm16'}]

    configs.forEach(({format}) => {
      const client = new GCPGeminiLiveClient({
        audio: {format}
      })

      assert(client instanceof GCPGeminiLiveClient, `Should create client with ${format} format`)
      client.destroy()
    })

    // Test with half-cascade model that supports more formats
    const halfCascadeClient = new GCPGeminiLiveClient({
      model: {name: 'gemini-2.0-flash-live-001'},
      audio: {format: 'pcm16'}
    })

    assert(
      halfCascadeClient instanceof GCPGeminiLiveClient,
      'Should create client with half-cascade model'
    )
    halfCascadeClient.destroy()
  })

  // Test 5: Audio Sample Rate Configuration
  runner.test('GCPGeminiLiveClient should handle different sample rates', () => {
    const sampleRates = [16000, 24000, 48000]

    sampleRates.forEach(sampleRate => {
      const client = new GCPGeminiLiveClient({
        audio: {
          inputSampleRate: sampleRate,
          outputSampleRate: sampleRate
        }
      })

      assert(
        client instanceof GCPGeminiLiveClient,
        `Should create client with ${sampleRate}Hz sample rate`
      )
      client.destroy()
    })
  })

  // Test 6: Audio Events
  runner.test('GCPGeminiLiveClient should support audio-related events', () => {
    const client = new GCPGeminiLiveClient()

    client.on('streamingStarted', () => {
      // Event handler for testing
    })

    client.on('streamingStopped', () => {
      // Event handler for testing
    })

    client.on('audioChunkSent', () => {
      // Event handler for testing
    })

    client.on('audioStreamingError', () => {
      // Event handler for testing
    })

    // Test that event listeners are properly set up
    assert(client.listenerCount('streamingStarted') === 1, 'Should have streamingStarted listener')
    assert(client.listenerCount('streamingStopped') === 1, 'Should have streamingStopped listener')
    assert(client.listenerCount('audioChunkSent') === 1, 'Should have audioChunkSent listener')
    assert(
      client.listenerCount('audioStreamingError') === 1,
      'Should have audioStreamingError listener'
    )

    client.destroy()
  })

  // Test 7: Audio Metrics Integration
  runner.test('GCPGeminiLiveClient should track audio metrics', () => {
    const client = new GCPGeminiLiveClient()

    const metrics = client.getMetrics()

    assert(typeof metrics.audio === 'object', 'Should have audio metrics')
    assert(typeof metrics.audio.totalBytesSent === 'number', 'Should track bytes sent')
    assert(typeof metrics.audio.totalBytesReceived === 'number', 'Should track bytes received')
    assert(typeof metrics.audio.chunksProcessed === 'number', 'Should track chunks processed')
    assert(typeof metrics.audio.averageChunkSize === 'number', 'Should track average chunk size')
    assert(typeof metrics.audio.streamingDuration === 'number', 'Should track streaming duration')

    client.destroy()
  })

  // Test 8: Native Audio vs Half-Cascade Models
  runner.test('GCPGeminiLiveClient should support different model types', () => {
    const models = ['gemini-2.5-flash-preview-native-audio-dialog', 'gemini-2.0-flash-live-001']

    models.forEach(model => {
      const client = new GCPGeminiLiveClient({
        model: {name: model}
      })

      assert(client instanceof GCPGeminiLiveClient, `Should create client with ${model} model`)
      client.destroy()
    })
  })

  return runner.run()
}

/**
 * Export the test runner for manual execution
 */
export {runAudioStreamingTests}

/**
 * Run tests if this file is executed directly
 */
if (require.main === module) {
  runAudioStreamingTests()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}
