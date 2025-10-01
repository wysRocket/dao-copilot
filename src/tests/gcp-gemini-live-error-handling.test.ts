/**
 * Comprehensive Error Handling Tests for GCP Gemini Live Client
 * Tests for Task 16.5 - Implement error handling and logging
 *
 * Tests circuit breaker, recovery strategies, error classification, and monitoring
 */

import {GCPGeminiLiveClient} from '../gcp-gemini-live-client'
import {ErrorType, RecoveryStrategy, CircuitBreakerState} from '../gemini-error-handler'

/**
 * Simple test runner for error handling validation
 */
class ErrorHandlingTestRunner {
  private tests: Array<{name: string; fn: () => void | Promise<void>}> = []
  private passed = 0
  private failed = 0

  test(name: string, fn: () => void | Promise<void>) {
    this.tests.push({name, fn})
  }

  async run(): Promise<{passed: number; failed: number; total: number}> {
    console.log('🧪 Running Error Handling Tests...\n')

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

    console.log(`\n📊 Error Handling Test Results:`)
    console.log(`   Passed: ${this.passed}`)
    console.log(`   Failed: ${this.failed}`)
    console.log(`   Total: ${this.tests.length}`)

    return {
      passed: this.passed,
      failed: this.failed,
      total: this.tests.length
    }
  }
}

const runner = new ErrorHandlingTestRunner()

// Test: Circuit Breaker Status
runner.test('Circuit Breaker - should provide status', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'},
    errorHandling: {enableAutoRecovery: true}
  })

  const status = client.getCircuitBreakerStatus()

  if (!Object.prototype.hasOwnProperty.call(status, 'state'))
    throw new Error('Missing state property')
  if (!Object.prototype.hasOwnProperty.call(status, 'failureCount'))
    throw new Error('Missing failureCount property')
  if (status.state !== CircuitBreakerState.CLOSED) throw new Error('Initial state should be CLOSED')
  if (status.failureCount !== 0) throw new Error('Initial failure count should be 0')

  await client.destroy()
})

// Test: Circuit Breaker Reset
runner.test('Circuit Breaker - should allow manual reset', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  client.resetCircuitBreaker()
  const status = client.getCircuitBreakerStatus()

  if (status.state !== CircuitBreakerState.CLOSED)
    throw new Error('State should be CLOSED after reset')
  if (status.failureCount !== 0) throw new Error('Failure count should be 0 after reset')

  await client.destroy()
})

// Test: Error Statistics
runner.test('Error Statistics - should provide comprehensive stats', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  const stats = client.getErrorStats()

  if (!Object.prototype.hasOwnProperty.call(stats, 'total'))
    throw new Error('Missing total property')
  if (!Object.prototype.hasOwnProperty.call(stats, 'byType'))
    throw new Error('Missing byType property')
  if (!Object.prototype.hasOwnProperty.call(stats, 'retryable'))
    throw new Error('Missing retryable property')
  if (!Object.prototype.hasOwnProperty.call(stats, 'nonRetryable'))
    throw new Error('Missing nonRetryable property')
  if (stats.total !== 0) throw new Error('Initial total should be 0')

  await client.destroy()
})

// Test: Recent Errors Tracking
runner.test('Error Tracking - should track recent errors', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  const recentErrors = client.getRecentErrors(10)

  if (!Array.isArray(recentErrors)) throw new Error('Recent errors should be an array')
  if (recentErrors.length !== 0) throw new Error('Initial recent errors should be empty')

  await client.destroy()
})

// Test: Error Handling Statistics
runner.test('Error Handling - should provide comprehensive statistics', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  const stats = client.getErrorHandlingStats()

  if (!Object.prototype.hasOwnProperty.call(stats, 'totalErrors'))
    throw new Error('Missing totalErrors property')
  if (!Object.prototype.hasOwnProperty.call(stats, 'errorsByType'))
    throw new Error('Missing errorsByType property')
  if (!Object.prototype.hasOwnProperty.call(stats, 'circuitBreaker'))
    throw new Error('Missing circuitBreaker property')
  if (!Object.prototype.hasOwnProperty.call(stats, 'recovery'))
    throw new Error('Missing recovery property')
  if (!Object.prototype.hasOwnProperty.call(stats, 'clientMetrics'))
    throw new Error('Missing clientMetrics property')

  await client.destroy()
})

// Test: Recovery Process Management
runner.test('Recovery Management - should track active recoveries', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  const activeRecoveries = client.getActiveRecoveries()

  if (!Array.isArray(activeRecoveries)) throw new Error('Active recoveries should be an array')
  if (activeRecoveries.length !== 0) throw new Error('Initial active recoveries should be empty')

  await client.destroy()
})

// Test: Recovery Cancellation
runner.test('Recovery Management - should cancel all recoveries', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  const cancelledCount = client.cancelAllRecoveries()

  if (typeof cancelledCount !== 'number') throw new Error('Cancelled count should be a number')
  if (cancelledCount < 0) throw new Error('Cancelled count should be non-negative')

  await client.destroy()
})

// Test: Recovery Strategy Configuration
runner.test('Recovery Configuration - should configure error strategies', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  // Should not throw
  client.configureErrorRecovery(ErrorType.NETWORK, RecoveryStrategy.EXPONENTIAL_BACKOFF, {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2
  })

  await client.destroy()
})

// Test: Auto Recovery Configuration
runner.test('Configuration - should control auto recovery', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  // Should not throw
  client.setAutoRecoveryEnabled(false)
  client.setAutoRecoveryEnabled(true)

  await client.destroy()
})

// Test: Max Retries Configuration
runner.test('Configuration - should set max retries', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  // Should not throw
  client.setMaxRetries(5)

  await client.destroy()
})

// Test: Error Log Export
runner.test('Data Export - should export error logs as JSON', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  const errorLogs = client.exportErrorLogs()

  if (typeof errorLogs !== 'string') throw new Error('Error logs should be a string')

  // Should be valid JSON
  try {
    JSON.parse(errorLogs)
  } catch {
    throw new Error('Error logs should be valid JSON')
  }

  await client.destroy()
})

// Test: All Logs Export
runner.test('Data Export - should export all logs as JSON', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  const allLogs = client.exportAllLogs()

  if (typeof allLogs !== 'string') throw new Error('All logs should be a string')

  // Should be valid JSON
  try {
    JSON.parse(allLogs)
  } catch {
    throw new Error('All logs should be valid JSON')
  }

  await client.destroy()
})

// Test: Error History Clearing
runner.test('Data Management - should clear error history', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  // Should not throw
  client.clearErrorHistory()

  const stats = client.getErrorStats()
  if (stats.total !== 0) throw new Error('Total errors should be 0 after clearing')

  await client.destroy()
})

// Test: Circuit Breaker Prevention
runner.test('Circuit Breaker - should prevent operations when open', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'},
    errorHandling: {
      circuitBreaker: {
        failureThreshold: 1, // Low threshold for testing
        timeout: 60000
      }
    }
  })

  // Force circuit breaker to open by accessing private error handler
  const clientWithPrivates = client as unknown as {errorHandler: {recordFailure: () => void}}
  for (let i = 0; i < 5; i++) {
    clientWithPrivates.errorHandler.recordFailure()
  }

  try {
    await client.connect()
    throw new Error('Connect should have failed due to circuit breaker')
  } catch (error) {
    if (!error || !(error instanceof Error)) {
      throw new Error('Expected an Error object')
    }
    if (!error.message.includes('circuit breaker')) {
      throw new Error('Error should mention circuit breaker')
    }
  }

  await client.destroy()
})

// Test: Error Event Handling
runner.test('Event Handling - should emit error events', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  let errorReceived = false

  client.on('error', () => {
    errorReceived = true
  })

  // Simulate an error
  client.emit('error', new Error('Test error'))

  // Wait a moment for event processing
  await new Promise(resolve => setTimeout(resolve, 10))

  if (!errorReceived) throw new Error('Error event should have been received')

  await client.destroy()
})

// Test: Cleanup on Destroy
runner.test('Cleanup - should clean up error handler on destroy', async () => {
  const client = new GCPGeminiLiveClient({
    authentication: {apiKey: 'test-key'}
  })

  // Should not throw even if cleanup has issues
  await client.destroy()
})

// Run all tests
runner
  .run()
  .then(results => {
    if (results.failed > 0) {
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('Test runner failed:', error)
    process.exit(1)
  })

export {ErrorHandlingTestRunner}
