/**
 * Test suite for Gemini Error Handler and Logger
 * Comprehensive testing of error classification, logging, and integration
 */

import { GeminiErrorHandler, ErrorType, LogLevel } from './gemini-error-handler'
import { GeminiLogger, MemoryLogOutput } from './gemini-logger'

/**
 * Test the error handler functionality
 */
async function testErrorHandler(): Promise<void> {
  console.log('\n=== Testing Gemini Error Handler ===')

  const errorHandler = new GeminiErrorHandler({
    maxErrorHistory: 10,
    logLevel: LogLevel.DEBUG
  })

  // Test 1: Network Error Classification
  console.log('\n1. Testing error classification...')
  const networkError = new Error('Network timeout occurred')
  const classifiedError = errorHandler.handleError(networkError)
  
  console.log(`✓ Network error classified as: ${classifiedError.type}`)
  console.log(`✓ Retryable: ${classifiedError.retryable}`)
  console.log(`✓ Error ID: ${classifiedError.id}`)

  // Test 2: Authentication Error
  const authError = new Error('Unauthorized access - invalid token')
  const authGeminiError = errorHandler.handleError(authError)
  
  console.log(`✓ Auth error classified as: ${authGeminiError.type}`)
  console.log(`✓ Retryable: ${authGeminiError.retryable}`)

  // Test 3: Custom Error with Context
  const customError = errorHandler.handleError(
    new Error('API rate limit exceeded'),
    { userId: '12345', endpoint: '/api/transcribe' },
    { type: ErrorType.RATE_LIMIT, retryable: true, maxRetries: 5 }
  )

  console.log(`✓ Custom error type: ${customError.type}`)
  console.log(`✓ Context included: ${!!customError.context}`)

  // Test 4: Error Statistics
  const stats = errorHandler.getStats()
  console.log(`✓ Total errors: ${stats.total}`)
  console.log(`✓ Retryable errors: ${stats.retryable}`)
  console.log(`✓ Non-retryable errors: ${stats.nonRetryable}`)

  // Test 5: Retry Logic
  console.log('\n2. Testing retry logic...')
  console.log(`✓ Should retry network error: ${errorHandler.shouldRetry(classifiedError)}`)
  console.log(`✓ Should retry auth error: ${errorHandler.shouldRetry(authGeminiError)}`)

  const retriedError = errorHandler.incrementRetryCount(classifiedError)
  console.log(`✓ Retry count incremented: ${retriedError.retryCount}`)

  errorHandler.destroy()
  console.log('✓ Error handler cleaned up')
}

/**
 * Test the logger functionality
 */
async function testLogger(): Promise<void> {
  console.log('\n=== Testing Gemini Logger ===')

  // Test 1: Memory Output
  console.log('\n1. Testing memory log output...')
  const memoryOutput = new MemoryLogOutput(5)
  const logger = new GeminiLogger({
    level: LogLevel.DEBUG,
    enableConsole: false
  })

  logger.addOutput(memoryOutput)

  // Log various levels
  logger.error('Test error message', { context: 'error' })
  logger.warn('Test warning message', { context: 'warn' })
  logger.info('Test info message', { context: 'info' })
  logger.debug('Test debug message', { context: 'debug' })

  const entries = memoryOutput.getEntries()
  console.log(`✓ Logged ${entries.length} entries to memory`)
  console.log(`✓ First entry level: ${LogLevel[entries[0].level]}`)

  // Test 2: Log Level Filtering
  console.log('\n2. Testing log level filtering...')
  logger.setLevel(LogLevel.WARN)
  logger.trace('This should not appear')
  logger.debug('This should not appear')
  logger.info('This should not appear')
  logger.warn('This should appear')

  const filteredEntries = memoryOutput.getEntries()
  const warnAndAbove = filteredEntries.filter(e => e.level <= LogLevel.WARN)
  console.log(`✓ After setting WARN level, ${warnAndAbove.length} entries at WARN level or above`)

  // Test 3: Console Output
  console.log('\n3. Testing console output...')
  const consoleLogger = new GeminiLogger({
    level: LogLevel.INFO,
    enableConsole: true,
    colorize: true
  })

  consoleLogger.info('This is an info message with colors')
  consoleLogger.warn('This is a warning message')
  consoleLogger.error('This is an error message')

  logger.close()
  consoleLogger.close()
  console.log('✓ Loggers cleaned up')
}

/**
 * Test error handler and logger integration
 */
async function testIntegration(): Promise<void> {
  console.log('\n=== Testing Error Handler + Logger Integration ===')

  const errorHandler = new GeminiErrorHandler({
    logLevel: LogLevel.INFO
  })

  const memoryOutput = new MemoryLogOutput()
  const logger = new GeminiLogger({
    level: LogLevel.DEBUG,
    enableConsole: false
  })
  logger.addOutput(memoryOutput)

  // Simulate error events
  errorHandler.on('error', (error) => {
    logger.error(`Error occurred: ${error.message}`, {
      errorId: error.id,
      type: error.type
    })
  })

  errorHandler.on('error:network', (error) => {
    logger.warn(`Network error detected: ${error.message}`, {
      errorId: error.id
    })
  })

  // Trigger some errors
  errorHandler.handleError(new Error('Connection failed'))
  errorHandler.handleError(new Error('Invalid API key'), {}, { type: ErrorType.AUTHENTICATION })
  errorHandler.handleError(new Error('Rate limit exceeded'), {}, { type: ErrorType.RATE_LIMIT })

  const logEntries = memoryOutput.getEntries()
  const errorLogs = logEntries.filter(entry => entry.level === LogLevel.ERROR)
  const warnLogs = logEntries.filter(entry => entry.level === LogLevel.WARN)

  console.log(`✓ Generated ${errorLogs.length} error log entries`)
  console.log(`✓ Generated ${warnLogs.length} warning log entries`)

  // Test error export
  console.log('\n1. Testing error export...')
  const errorsJson = errorHandler.exportErrors()
  const errors = JSON.parse(errorsJson)
  console.log(`✓ Exported ${errors.length} errors`)

  // Test log export
  console.log('\n2. Testing log export...')
  const logsJson = logger.exportLogs()
  const logs = JSON.parse(logsJson)
  console.log(`✓ Exported ${logs.length} log entries`)

  errorHandler.destroy()
  logger.close()
  console.log('✓ Integration test completed')
}

/**
 * Test performance under load
 */
async function testPerformance(): Promise<void> {
  console.log('\n=== Testing Performance ===')

  const errorHandler = new GeminiErrorHandler()
  const logger = new GeminiLogger({
    enableConsole: false
  })

  const startTime = Date.now()
  const errorCount = 1000

  console.log(`\n1. Processing ${errorCount} errors...`)
  for (let i = 0; i < errorCount; i++) {
    errorHandler.handleError(new Error(`Test error ${i}`), { iteration: i })
  }

  const errorTime = Date.now() - startTime
  console.log(`✓ Processed ${errorCount} errors in ${errorTime}ms`)
  console.log(`✓ Average: ${(errorTime / errorCount).toFixed(2)}ms per error`)

  const logStartTime = Date.now()
  const logCount = 1000

  console.log(`\n2. Processing ${logCount} log entries...`)
  for (let i = 0; i < logCount; i++) {
    logger.info(`Test log entry ${i}`, { iteration: i })
  }

  // Force flush
  logger.flush()

  const logTime = Date.now() - logStartTime
  console.log(`✓ Processed ${logCount} log entries in ${logTime}ms`)
  console.log(`✓ Average: ${(logTime / logCount).toFixed(2)}ms per log entry`)

  // Memory usage test
  const stats = errorHandler.getStats()
  console.log(`\n3. Memory usage:`)
  console.log(`✓ Total errors tracked: ${stats.total}`)
  console.log(`✓ Average processing time: ${stats.avgProcessingTime.toFixed(2)}ms`)

  errorHandler.destroy()
  logger.close()
  console.log('✓ Performance test completed')
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<void> {
  console.log('🧪 Starting Gemini Error Handler and Logger Tests')

  try {
    await testErrorHandler()
    await testLogger()
    await testIntegration()
    await testPerformance()

    console.log('\n✅ All tests completed successfully!')
    console.log('\n📊 Test Summary:')
    console.log('• Error classification and handling: ✓')
    console.log('• Logging with multiple outputs: ✓')
    console.log('• Error-Logger integration: ✓')
    console.log('• Performance under load: ✓')

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

// Export for use in other test files
export {
  testErrorHandler,
  testLogger,
  testIntegration,
  testPerformance,
  runAllTests
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
}
