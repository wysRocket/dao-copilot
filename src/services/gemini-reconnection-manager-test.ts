/**
 * Test suite for ReconnectionManager
 * Tests various reconnection strategies and connection quality monitoring
 */

import ReconnectionManager, {ReconnectionStrategy} from './gemini-reconnection-manager'
import {GeminiErrorHandler} from './gemini-error-handler'

/**
 * Mock connection function for testing
 */
let mockConnectionSuccess = true
const mockConnectionDelay = 0

async function mockConnect(): Promise<void> {
  if (mockConnectionDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, mockConnectionDelay))
  }

  if (!mockConnectionSuccess) {
    throw new Error('Mock connection failed')
  }
}

/**
 * Test ReconnectionManager with different strategies
 */
async function testReconnectionStrategies() {
  console.log('🧪 Testing Reconnection Strategies...')

  const errorHandler = new GeminiErrorHandler()

  // Test Exponential Backoff
  console.log('\n📈 Testing Exponential Backoff Strategy')
  const exponentialManager = new ReconnectionManager(
    {
      maxAttempts: 5,
      strategy: ReconnectionStrategy.EXPONENTIAL,
      baseDelay: 100,
      maxDelay: 5000,
      jitterEnabled: false,
      backoffMultiplier: 2
    },
    errorHandler
  )

  exponentialManager.on('reconnectionStarted', data => {
    console.log(`  Attempt ${data.attempt}: delay = ${data.delay}ms`)
  })

  // Simulate connection failure to test backoff
  mockConnectionSuccess = false
  exponentialManager.onConnectionLost('Test failure')
  exponentialManager.startReconnection(mockConnect)

  // Wait for a few attempts
  await new Promise(resolve => setTimeout(resolve, 2000))
  exponentialManager.stopReconnection()

  // Test Linear Backoff
  console.log('\n📊 Testing Linear Backoff Strategy')
  const linearManager = new ReconnectionManager(
    {
      maxAttempts: 5,
      strategy: ReconnectionStrategy.LINEAR,
      baseDelay: 100,
      maxDelay: 5000,
      jitterEnabled: false
    },
    errorHandler
  )

  linearManager.on('reconnectionStarted', data => {
    console.log(`  Attempt ${data.attempt}: delay = ${data.delay}ms`)
  })

  linearManager.onConnectionLost('Test failure')
  linearManager.startReconnection(mockConnect)

  await new Promise(resolve => setTimeout(resolve, 1500))
  linearManager.stopReconnection()

  // Test Fibonacci Backoff
  console.log('\n🌀 Testing Fibonacci Backoff Strategy')
  const fibonacciManager = new ReconnectionManager(
    {
      maxAttempts: 5,
      strategy: ReconnectionStrategy.FIBONACCI,
      baseDelay: 100,
      maxDelay: 5000,
      jitterEnabled: false
    },
    errorHandler
  )

  fibonacciManager.on('reconnectionStarted', data => {
    console.log(`  Attempt ${data.attempt}: delay = ${data.delay}ms`)
  })

  fibonacciManager.onConnectionLost('Test failure')
  fibonacciManager.startReconnection(mockConnect)

  await new Promise(resolve => setTimeout(resolve, 1500))
  fibonacciManager.stopReconnection()

  // Cleanup
  exponentialManager.destroy()
  linearManager.destroy()
  fibonacciManager.destroy()
  errorHandler.destroy()

  console.log('✅ Reconnection strategies test completed')
}

/**
 * Test connection quality monitoring
 */
async function testConnectionQualityMonitoring() {
  console.log('\n🔍 Testing Connection Quality Monitoring...')

  const errorHandler = new GeminiErrorHandler()
  const manager = new ReconnectionManager(
    {
      maxAttempts: 10,
      strategy: ReconnectionStrategy.EXPONENTIAL,
      baseDelay: 100,
      maxDelay: 1000
    },
    errorHandler
  )

  manager.on('connectionEstablished', data => {
    console.log(`  Connection established - Quality: ${data.metrics.connectionQuality}`)
  })

  manager.on('connectionLost', data => {
    console.log(
      `  Connection lost - Quality: ${data.metrics.connectionQuality}, Reason: ${data.reason}`
    )
  })

  // Simulate good connections
  console.log('\n✅ Simulating successful connections...')
  mockConnectionSuccess = true

  for (let i = 0; i < 5; i++) {
    manager.onConnectionEstablished()
    await new Promise(resolve => setTimeout(resolve, 100))
    manager.onConnectionLost('Normal disconnect')
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  console.log('Current metrics:', manager.getMetrics())

  // Simulate poor connections
  console.log('\n❌ Simulating poor connections...')

  for (let i = 0; i < 3; i++) {
    manager.onConnectionEstablished()
    await new Promise(resolve => setTimeout(resolve, 20)) // Very short connections
    manager.onConnectionLost('Connection unstable')
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  console.log('Updated metrics:', manager.getMetrics())

  // Test connection history
  const history = manager.getConnectionHistory()
  console.log(`Connection history contains ${history.length} entries`)

  manager.destroy()
  errorHandler.destroy()

  console.log('✅ Connection quality monitoring test completed')
}

/**
 * Test reconnection with jitter
 */
async function testJitterReconnection() {
  console.log('\n🎲 Testing Jitter in Reconnection...')

  const errorHandler = new GeminiErrorHandler()
  const manager = new ReconnectionManager(
    {
      maxAttempts: 3,
      strategy: ReconnectionStrategy.EXPONENTIAL,
      baseDelay: 1000,
      maxDelay: 5000,
      jitterEnabled: true,
      jitterRange: 0.2 // 20% jitter
    },
    errorHandler
  )

  const delays: number[] = []

  manager.on('reconnectionStarted', data => {
    delays.push(data.delay)
    console.log(`  Attempt ${data.attempt}: delay = ${data.delay}ms (with jitter)`)
  })

  mockConnectionSuccess = false
  manager.onConnectionLost('Test jitter')
  manager.startReconnection(mockConnect)

  await new Promise(resolve => setTimeout(resolve, 1000))
  manager.stopReconnection()

  // Verify jitter was applied (delays should be slightly different from base calculation)
  console.log('Delays with jitter:', delays)

  manager.destroy()
  errorHandler.destroy()

  console.log('✅ Jitter reconnection test completed')
}

/**
 * Test successful reconnection flow
 */
async function testSuccessfulReconnection() {
  console.log('\n🔄 Testing Successful Reconnection Flow...')

  const errorHandler = new GeminiErrorHandler()
  const manager = new ReconnectionManager(
    {
      maxAttempts: 3,
      strategy: ReconnectionStrategy.EXPONENTIAL,
      baseDelay: 200,
      maxDelay: 1000
    },
    errorHandler
  )

  let reconnectionStarted = false
  let reconnectionCompleted = false

  manager.on('reconnectionStarted', data => {
    reconnectionStarted = true
    console.log(`  Reconnection started: attempt ${data.attempt}`)
  })

  manager.on('connectionEstablished', data => {
    if (data.wasReconnection) {
      reconnectionCompleted = true
      console.log('  Reconnection successful!')
    }
  })

  // Start with a connection loss
  manager.onConnectionLost('Network interruption')

  // First attempt will fail
  mockConnectionSuccess = false
  manager.startReconnection(mockConnect)

  // Wait for first attempt to fail
  await new Promise(resolve => setTimeout(resolve, 500))

  // Make next attempt succeed
  mockConnectionSuccess = true

  // Wait for successful reconnection
  await new Promise(resolve => setTimeout(resolve, 1000))

  // Manually trigger successful connection
  manager.onConnectionEstablished()

  console.log('Test results:', {
    reconnectionStarted,
    reconnectionCompleted,
    finalState: manager.getState(),
    finalMetrics: manager.getMetrics()
  })

  manager.destroy()
  errorHandler.destroy()

  console.log('✅ Successful reconnection test completed')
}

/**
 * Test configuration updates
 */
async function testConfigurationUpdates() {
  console.log('\n⚙️ Testing Configuration Updates...')

  const errorHandler = new GeminiErrorHandler()
  const manager = new ReconnectionManager(
    {
      maxAttempts: 3,
      strategy: ReconnectionStrategy.LINEAR,
      baseDelay: 1000
    },
    errorHandler
  )

  console.log('Initial config - Strategy: LINEAR, Base delay: 1000ms')

  // Update configuration
  manager.updateConfig({
    strategy: ReconnectionStrategy.EXPONENTIAL,
    baseDelay: 500,
    maxAttempts: 5
  })

  console.log('Updated config - Strategy: EXPONENTIAL, Base delay: 500ms, Max attempts: 5')

  // Test the updated configuration
  manager.on('reconnectionStarted', data => {
    console.log(`  Attempt ${data.attempt}: delay = ${data.delay}ms`)
  })

  mockConnectionSuccess = false
  manager.onConnectionLost('Config test')
  manager.startReconnection(mockConnect)

  await new Promise(resolve => setTimeout(resolve, 1000))
  manager.stopReconnection()

  manager.destroy()
  errorHandler.destroy()

  console.log('✅ Configuration updates test completed')
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting ReconnectionManager Test Suite...')

  try {
    await testReconnectionStrategies()
    await testConnectionQualityMonitoring()
    await testJitterReconnection()
    await testSuccessfulReconnection()
    await testConfigurationUpdates()

    console.log('\n🎉 All ReconnectionManager tests completed successfully!')
  } catch (error) {
    console.error('\n❌ Test suite failed:', error)
    throw error
  }
}

// Export test functions
export {
  testReconnectionStrategies,
  testConnectionQualityMonitoring,
  testJitterReconnection,
  testSuccessfulReconnection,
  testConfigurationUpdates,
  runAllTests
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\nTest execution completed successfully')
      process.exit(0)
    })
    .catch(error => {
      console.error('\nTest execution failed:', error)
      process.exit(1)
    })
}
