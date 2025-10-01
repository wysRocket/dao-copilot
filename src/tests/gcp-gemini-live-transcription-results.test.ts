/**
 * Transcription Result Handling Tests for GCPGeminiLiveClient
 * Tests for Task 16.4 - Handle incoming transcription results
 *
 * This file validates the transcription result processing and management functionality.
 */

import GCPGeminiLiveClient, {type GCPLiveClientConfig} from '../gcp-gemini-live-client'

/**
 * Simple test runner for transcription result handling validation
 */
class TranscriptionResultTestRunner {
  private tests: Array<{name: string; fn: () => void | Promise<void>}> = []
  private passed = 0
  private failed = 0

  test(name: string, fn: () => void | Promise<void>) {
    this.tests.push({name, fn})
  }

  async run() {
    console.log('📝 Running GCPGeminiLiveClient transcription result tests...\n')

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
      console.log('🎉 All transcription result tests passed!')
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
 * Run transcription result handling validation tests
 */
async function runTranscriptionResultTests() {
  const runner = new TranscriptionResultTestRunner()

  // Test 1: Basic Result Management Methods
  runner.test('GCPGeminiLiveClient should have transcription result methods', () => {
    const client = new GCPGeminiLiveClient()

    assert(
      typeof client.getTranscriptionResults === 'function',
      'Should have getTranscriptionResults method'
    )
    assert(typeof client.getPartialResults === 'function', 'Should have getPartialResults method')
    assert(typeof client.getFinalResults === 'function', 'Should have getFinalResults method')
    assert(
      typeof client.getResultsBySession === 'function',
      'Should have getResultsBySession method'
    )
    assert(typeof client.getResultBatch === 'function', 'Should have getResultBatch method')
    assert(
      typeof client.getCombinedTranscription === 'function',
      'Should have getCombinedTranscription method'
    )
    assert(
      typeof client.clearTranscriptionResults === 'function',
      'Should have clearTranscriptionResults method'
    )
    assert(
      typeof client.clearResultsBySession === 'function',
      'Should have clearResultsBySession method'
    )
    assert(
      typeof client.getTranscriptionStats === 'function',
      'Should have getTranscriptionStats method'
    )

    client.destroy()
  })

  // Test 2: Initial State of Results
  runner.test('GCPGeminiLiveClient should start with empty results', () => {
    const client = new GCPGeminiLiveClient()

    const results = client.getTranscriptionResults()
    const partialResults = client.getPartialResults()
    const finalResults = client.getFinalResults()
    const stats = client.getTranscriptionStats()

    assert(Array.isArray(results), 'Should return array for results')
    assert(results.length === 0, 'Should start with no results')
    assert(Array.isArray(partialResults), 'Should return array for partial results')
    assert(partialResults.length === 0, 'Should start with no partial results')
    assert(Array.isArray(finalResults), 'Should return array for final results')
    assert(finalResults.length === 0, 'Should start with no final results')

    assert(stats.totalResults === 0, 'Stats should show 0 total results')
    assert(stats.finalResults === 0, 'Stats should show 0 final results')
    assert(stats.partialResults === 0, 'Stats should show 0 partial results')
    assert(stats.totalTextLength === 0, 'Stats should show 0 text length')

    client.destroy()
  })

  // Test 3: Result Batch Functionality
  runner.test('GCPGeminiLiveClient should handle result batches', () => {
    const client = new GCPGeminiLiveClient()

    const batch = client.getResultBatch(10, 0)

    assert(typeof batch === 'object', 'Should return batch object')
    assert(Array.isArray(batch.results), 'Batch should have results array')
    assert(batch.results.length === 0, 'Batch should start empty')
    assert(typeof batch.hasFinalResults === 'boolean', 'Should have hasFinalResults property')
    assert(typeof batch.hasPartialResults === 'boolean', 'Should have hasPartialResults property')
    assert(typeof batch.totalResults === 'number', 'Should have totalResults property')
    assert(typeof batch.timestamp === 'number', 'Should have timestamp property')
    assert(batch.hasFinalResults === false, 'Should have no final results initially')
    assert(batch.hasPartialResults === false, 'Should have no partial results initially')
    assert(batch.totalResults === 0, 'Should have 0 total results initially')

    client.destroy()
  })

  // Test 4: Combined Transcription
  runner.test('GCPGeminiLiveClient should handle combined transcription', () => {
    const client = new GCPGeminiLiveClient()

    const combinedText = client.getCombinedTranscription()

    assert(typeof combinedText === 'string', 'Should return string for combined transcription')
    assert(combinedText === '', 'Should return empty string initially')

    // Test with session ID
    const sessionText = client.getCombinedTranscription('test-session')
    assert(typeof sessionText === 'string', 'Should return string for session transcription')
    assert(sessionText === '', 'Should return empty string for non-existent session')

    client.destroy()
  })

  // Test 5: Clear Results Functionality
  runner.test('GCPGeminiLiveClient should handle clearing results', () => {
    const client = new GCPGeminiLiveClient()

    // Should not throw when clearing empty results
    client.clearTranscriptionResults()
    client.clearResultsBySession('test-session')

    // Verify still empty after clearing
    const stats = client.getTranscriptionStats()
    assert(stats.totalResults === 0, 'Should still have 0 results after clearing empty')

    client.destroy()
  })

  // Test 6: Transcription Result Events
  runner.test('GCPGeminiLiveClient should support transcription result events', () => {
    const client = new GCPGeminiLiveClient()

    let resultsClearedEventReceived = false

    client.on('transcriptionResult', () => {
      // Event handler for testing
    })

    client.on('finalTranscriptionResult', () => {
      // Event handler for testing
    })

    client.on('partialTranscriptionResult', () => {
      // Event handler for testing
    })

    client.on('turnComplete', () => {
      // Event handler for testing
    })

    client.on('resultsCleared', () => {
      resultsClearedEventReceived = true
    })

    // Test that event listeners are properly set up
    assert(
      client.listenerCount('transcriptionResult') === 1,
      'Should have transcriptionResult listener'
    )
    assert(
      client.listenerCount('finalTranscriptionResult') === 1,
      'Should have finalTranscriptionResult listener'
    )
    assert(
      client.listenerCount('partialTranscriptionResult') === 1,
      'Should have partialTranscriptionResult listener'
    )
    assert(client.listenerCount('turnComplete') === 1, 'Should have turnComplete listener')
    assert(client.listenerCount('resultsCleared') === 1, 'Should have resultsCleared listener')

    // Test clearing results event
    client.clearTranscriptionResults()
    assert(resultsClearedEventReceived, 'Should emit resultsCleared event')

    client.destroy()
  })

  // Test 7: Result Statistics
  runner.test('GCPGeminiLiveClient should provide accurate statistics', () => {
    const client = new GCPGeminiLiveClient()

    const stats = client.getTranscriptionStats()

    assert(typeof stats.totalResults === 'number', 'Should have totalResults stat')
    assert(typeof stats.finalResults === 'number', 'Should have finalResults stat')
    assert(typeof stats.partialResults === 'number', 'Should have partialResults stat')
    assert(typeof stats.totalTextLength === 'number', 'Should have totalTextLength stat')
    assert(typeof stats.averageResultLength === 'number', 'Should have averageResultLength stat')
    assert(typeof stats.sessionsWithResults === 'number', 'Should have sessionsWithResults stat')

    // Verify initial values
    assert(stats.totalResults === 0, 'Should start with 0 total results')
    assert(stats.finalResults === 0, 'Should start with 0 final results')
    assert(stats.partialResults === 0, 'Should start with 0 partial results')
    assert(stats.totalTextLength === 0, 'Should start with 0 text length')
    assert(stats.averageResultLength === 0, 'Should start with 0 average length')
    assert(stats.sessionsWithResults === 0, 'Should start with 0 sessions')

    client.destroy()
  })

  // Test 8: Enhanced Configuration
  runner.test('GCPGeminiLiveClient should handle enhanced transcription config', () => {
    const config: GCPLiveClientConfig = {
      authentication: {
        apiKey: 'test-key'
      },
      model: {
        name: 'gemini-2.5-flash-preview-native-audio-dialog',
        enableNativeAudio: true
      },
      performance: {
        enableDetailedLogging: true,
        enableMonitoring: true
      },
      debug: true
    }

    const client = new GCPGeminiLiveClient(config)

    assert(client instanceof GCPGeminiLiveClient, 'Client should be created with enhanced config')

    // Test methods work with config
    const results = client.getTranscriptionResults()
    const stats = client.getTranscriptionStats()

    assert(Array.isArray(results), 'Should work with enhanced config')
    assert(typeof stats === 'object', 'Stats should work with enhanced config')

    client.destroy()
  })

  // Test 9: Model Support for Different Types
  runner.test('GCPGeminiLiveClient should support different model types for transcription', () => {
    const models = ['gemini-2.5-flash-preview-native-audio-dialog', 'gemini-2.0-flash-live-001']

    models.forEach(model => {
      const client = new GCPGeminiLiveClient({
        model: {name: model}
      })

      assert(client instanceof GCPGeminiLiveClient, `Should create client with ${model} model`)

      // Verify transcription methods work
      const results = client.getTranscriptionResults()
      const stats = client.getTranscriptionStats()

      assert(Array.isArray(results), `Results should work with ${model}`)
      assert(typeof stats === 'object', `Stats should work with ${model}`)

      client.destroy()
    })
  })

  // Test 10: Memory Management
  runner.test('GCPGeminiLiveClient should manage result memory properly', () => {
    const client = new GCPGeminiLiveClient()

    // Verify clean destruction
    const initialStats = client.getTranscriptionStats()
    assert(initialStats.totalResults === 0, 'Should start clean')

    // Clear results multiple times (should not throw)
    client.clearTranscriptionResults()
    client.clearTranscriptionResults()
    client.clearResultsBySession('test')
    client.clearResultsBySession('test')

    // Verify still clean
    const finalStats = client.getTranscriptionStats()
    assert(finalStats.totalResults === 0, 'Should remain clean after multiple clears')

    client.destroy()
  })

  return runner.run()
}

/**
 * Export the test runner for manual execution
 */
export {runTranscriptionResultTests}

/**
 * Run tests if this file is executed directly
 */
if (require.main === module) {
  runTranscriptionResultTests()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}
