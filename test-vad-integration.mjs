/**
 * Integration Tests for VAD Interruption System
 * 
 * This module provides comprehensive integration testing for the VAD interruption
 * handling system. It tests the interaction between the Enhanced Tool Call Handler
 * and VAD Interruption Handler to ensure seamless voice-activity-aware operation.
 */

import { InterruptibleToolCallHandler } from '../services/interruptible-tool-call-handler'
import { EnhancedToolCallHandler } from '../services/enhanced-tool-call-handler'
import { VADInterruptionHandler, VADSignalType, ToolCallPriority } from '../services/vad-interruption-handler'
import { logger } from '../services/gemini-logger'

// Test configuration
const TEST_CONFIG = {
  duration: 30000, // 30 second test
  vadSignalInterval: 1000, // Send VAD signal every 1 second
  searchQuery: 'test AI answering machine integration',
  maxConcurrentTests: 5,
  
  vadSignals: [
    { type: VADSignalType.VOICE_START, confidence: 0.85, audioLevel: 0.7 },
    { type: VADSignalType.VOICE_ACTIVE, confidence: 0.9, audioLevel: 0.8 },
    { type: VADSignalType.VOICE_END, confidence: 0.75, audioLevel: 0.3 },
    { type: VADSignalType.SILENCE, confidence: 0.95, audioLevel: 0.1 }
  ]
}

// Mock statistics collector
class TestStatistics {
  private stats = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    totalExecutionTime: 0,
    totalInterruptions: 0,
    totalResumptions: 0,
    averageResponseTime: 0,
    errors: [] as string[]
  }
  
  recordTest(passed: boolean, executionTime: number, interruptions: number, resumptions: number, error?: string): void {
    this.stats.totalTests++
    
    if (passed) {
      this.stats.passedTests++
    } else {
      this.stats.failedTests++
      if (error) this.stats.errors.push(error)
    }
    
    this.stats.totalExecutionTime += executionTime
    this.stats.totalInterruptions += interruptions
    this.stats.totalResumptions += resumptions
    
    // Update average response time
    this.stats.averageResponseTime = this.stats.totalExecutionTime / this.stats.totalTests
  }
  
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalTests > 0 ? this.stats.passedTests / this.stats.totalTests : 0,
      averageInterruptionsPerTest: this.stats.totalTests > 0 ? this.stats.totalInterruptions / this.stats.totalTests : 0
    }
  }
  
  getSummary(): string {
    const stats = this.getStats()
    return `
Integration Test Summary:
========================
Total Tests: ${stats.totalTests}
Passed: ${stats.passedTests} (${(stats.successRate * 100).toFixed(1)}%)
Failed: ${stats.failedTests}
Average Execution Time: ${stats.averageResponseTime.toFixed(2)}ms
Total Interruptions: ${stats.totalInterruptions}
Total Resumptions: ${stats.totalResumptions}
Average Interruptions per Test: ${stats.averageInterruptionsPerTest.toFixed(2)}
Errors: ${stats.errors.length > 0 ? '\n  - ' + stats.errors.join('\n  - ') : 'None'}
    `.trim()
  }
}

// VAD Signal Simulator
class VADSignalSimulator {
  private isRunning = false
  private intervalId?: NodeJS.Timeout
  private signalCount = 0
  
  start(
    handler: InterruptibleToolCallHandler,
    interval: number = 1000,
    signalPattern?: typeof TEST_CONFIG.vadSignals
  ): void {
    if (this.isRunning) return
    
    this.isRunning = true
    this.signalCount = 0
    const signals = signalPattern || TEST_CONFIG.vadSignals
    
    this.intervalId = setInterval(() => {
      const signal = signals[this.signalCount % signals.length]
      
      handler.processVADSignal({
        ...signal,
        timestamp: Date.now(),
        duration: 500,
        metadata: { simulationIndex: this.signalCount }
      })
      
      this.signalCount++
      
      logger.debug('VAD signal simulated', {
        type: signal.type,
        confidence: signal.confidence,
        count: this.signalCount
      })
    }, interval)
    
    logger.info('VAD signal simulator started', { interval, patternLength: signals.length })
  }
  
  stop(): void {
    if (!this.isRunning) return
    
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
    
    this.isRunning = false
    
    logger.info('VAD signal simulator stopped', { totalSignals: this.signalCount })
  }
  
  getSignalCount(): number {
    return this.signalCount
  }
}

// Individual test cases
class IntegrationTestCase {
  private name: string
  private stats = new TestStatistics()
  private vadSimulator = new VADSignalSimulator()
  
  constructor(name: string) {
    this.name = name
  }
  
  /**
   * Test basic VAD interruption functionality
   */
  async testBasicInterruption(handler: InterruptibleToolCallHandler): Promise<boolean> {
    logger.info(`Starting test: ${this.name} - Basic Interruption`)
    const startTime = performance.now()
    
    try {
      // Start VAD signal simulation
      this.vadSimulator.start(handler, 2000) // Signal every 2 seconds
      
      // Execute a tool call that should be interrupted
      const response = await handler.executeInterruptibleToolCall({
        tool: 'google_search',
        parameters: { query: TEST_CONFIG.searchQuery, limit: 10 },
        interruption: {
          priority: ToolCallPriority.LOW,
          allowInterruptions: true,
          maxInterruptions: 3,
          saveStateOnInterrupt: true
        },
        vadMonitoring: {
          enabled: true,
          sensitivity: 0.7,
          silenceTimeout: 5000
        }
      })
      
      const executionTime = performance.now() - startTime
      const wasInterrupted = response.interruption?.wasInterrupted || false
      const interruptionCount = response.interruption?.interruptionCount || 0
      const vadSignalCount = response.interruption?.vadSignalCount || 0
      
      // Stop simulation
      this.vadSimulator.stop()
      
      // Validate response
      const success = response.success && wasInterrupted && interruptionCount > 0 && vadSignalCount > 0
      
      this.stats.recordTest(
        success,
        executionTime,
        interruptionCount,
        vadSignalCount,
        success ? undefined : 'Basic interruption validation failed'
      )
      
      logger.info(`Test result: ${this.name} - Basic Interruption`, {
        success,
        executionTime: executionTime.toFixed(2),
        wasInterrupted,
        interruptionCount,
        vadSignalCount
      })
      
      return success
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.vadSimulator.stop()
      
      this.stats.recordTest(
        false,
        executionTime,
        0,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      )
      
      logger.error(`Test failed: ${this.name} - Basic Interruption`, error)
      return false
    }
  }
  
  /**
   * Test high-priority tool call that should not be interrupted
   */
  async testHighPriorityNoInterruption(handler: InterruptibleToolCallHandler): Promise<boolean> {
    logger.info(`Starting test: ${this.name} - High Priority No Interruption`)
    const startTime = performance.now()
    
    try {
      // Start aggressive VAD signal simulation
      this.vadSimulator.start(handler, 500) // Signal every 0.5 seconds
      
      // Execute a high-priority tool call
      const response = await handler.executeInterruptibleToolCall({
        tool: 'google_search',
        parameters: { query: TEST_CONFIG.searchQuery, limit: 5 },
        interruption: {
          priority: ToolCallPriority.HIGH,
          allowInterruptions: true,
          maxInterruptions: 1,
          saveStateOnInterrupt: true
        },
        vadMonitoring: {
          enabled: true,
          sensitivity: 0.5
        }
      })
      
      const executionTime = performance.now() - startTime
      const wasInterrupted = response.interruption?.wasInterrupted || false
      const interruptionCount = response.interruption?.interruptionCount || 0
      
      // Stop simulation
      this.vadSimulator.stop()
      
      // High priority calls should complete without interruption despite VAD signals
      const success = response.success && !wasInterrupted && interruptionCount === 0
      
      this.stats.recordTest(
        success,
        executionTime,
        interruptionCount,
        0,
        success ? undefined : 'High priority call was unexpectedly interrupted'
      )
      
      logger.info(`Test result: ${this.name} - High Priority No Interruption`, {
        success,
        executionTime: executionTime.toFixed(2),
        wasInterrupted,
        interruptionCount
      })
      
      return success
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.vadSimulator.stop()
      
      this.stats.recordTest(
        false,
        executionTime,
        0,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      )
      
      logger.error(`Test failed: ${this.name} - High Priority No Interruption`, error)
      return false
    }
  }
  
  /**
   * Test multiple concurrent tool calls with different priorities
   */
  async testConcurrentToolCalls(handler: InterruptibleToolCallHandler): Promise<boolean> {
    logger.info(`Starting test: ${this.name} - Concurrent Tool Calls`)
    const startTime = performance.now()
    
    try {
      // Start VAD signal simulation
      this.vadSimulator.start(handler, 1500) // Signal every 1.5 seconds
      
      // Execute multiple tool calls concurrently
      const promises = [
        handler.executeInterruptibleToolCall({
          tool: 'google_search',
          parameters: { query: 'concurrent test low priority', limit: 3 },
          interruption: { priority: ToolCallPriority.LOW },
          vadMonitoring: { enabled: true }
        }),
        
        handler.executeInterruptibleToolCall({
          tool: 'google_search',
          parameters: { query: 'concurrent test medium priority', limit: 3 },
          interruption: { priority: ToolCallPriority.MEDIUM },
          vadMonitoring: { enabled: true }
        }),
        
        handler.executeInterruptibleToolCall({
          tool: 'google_search',
          parameters: { query: 'concurrent test high priority', limit: 3 },
          interruption: { priority: ToolCallPriority.HIGH },
          vadMonitoring: { enabled: true }
        })
      ]
      
      const responses = await Promise.all(promises)
      const executionTime = performance.now() - startTime
      
      // Stop simulation
      this.vadSimulator.stop()
      
      // Analyze results
      const allSucceeded = responses.every(r => r.success)
      const lowPriorityInterrupted = responses[0].interruption?.wasInterrupted || false
      const mediumPriorityInterrupted = responses[1].interruption?.wasInterrupted || false
      const highPriorityInterrupted = responses[2].interruption?.wasInterrupted || false
      
      const totalInterruptions = responses.reduce((sum, r) => sum + (r.interruption?.interruptionCount || 0), 0)
      const totalVadSignals = responses.reduce((sum, r) => sum + (r.interruption?.vadSignalCount || 0), 0)
      
      // Success criteria: all calls succeeded, priority-based interruption behavior
      const success = allSucceeded && 
                     lowPriorityInterrupted && 
                     !highPriorityInterrupted // High priority should not be interrupted
      
      this.stats.recordTest(
        success,
        executionTime,
        totalInterruptions,
        totalVadSignals,
        success ? undefined : 'Concurrent tool calls did not follow priority-based interruption rules'
      )
      
      logger.info(`Test result: ${this.name} - Concurrent Tool Calls`, {
        success,
        executionTime: executionTime.toFixed(2),
        allSucceeded,
        lowPriorityInterrupted,
        mediumPriorityInterrupted,
        highPriorityInterrupted,
        totalInterruptions
      })
      
      return success
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.vadSimulator.stop()
      
      this.stats.recordTest(
        false,
        executionTime,
        0,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      )
      
      logger.error(`Test failed: ${this.name} - Concurrent Tool Calls`, error)
      return false
    }
  }
  
  /**
   * Test VAD monitoring disabled scenario
   */
  async testVADMonitoringDisabled(handler: InterruptibleToolCallHandler): Promise<boolean> {
    logger.info(`Starting test: ${this.name} - VAD Monitoring Disabled`)
    const startTime = performance.now()
    
    try {
      // Start aggressive VAD signal simulation
      this.vadSimulator.start(handler, 300) // Signal every 0.3 seconds
      
      // Execute tool call with VAD monitoring disabled
      const response = await handler.executeInterruptibleToolCall({
        tool: 'google_search',
        parameters: { query: TEST_CONFIG.searchQuery, limit: 5 },
        interruption: {
          priority: ToolCallPriority.LOW,
          allowInterruptions: false // Disable interruptions
        },
        vadMonitoring: {
          enabled: false // Disable VAD monitoring
        }
      })
      
      const executionTime = performance.now() - startTime
      const wasInterrupted = response.interruption?.wasInterrupted || false
      const vadSignalCount = response.interruption?.vadSignalCount || 0
      
      // Stop simulation
      this.vadSimulator.stop()
      
      // Success criteria: call succeeded without interruptions despite VAD signals
      const success = response.success && !wasInterrupted && vadSignalCount === 0
      
      this.stats.recordTest(
        success,
        executionTime,
        0,
        0,
        success ? undefined : 'Tool call was interrupted despite VAD monitoring being disabled'
      )
      
      logger.info(`Test result: ${this.name} - VAD Monitoring Disabled`, {
        success,
        executionTime: executionTime.toFixed(2),
        wasInterrupted,
        vadSignalCount
      })
      
      return success
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.vadSimulator.stop()
      
      this.stats.recordTest(
        false,
        executionTime,
        0,
        0,
        error instanceof Error ? error.message : 'Unknown error'
      )
      
      logger.error(`Test failed: ${this.name} - VAD Monitoring Disabled`, error)
      return false
    }
  }
  
  getStatistics(): any {
    return this.stats.getStats()
  }
  
  getSummary(): string {
    return this.stats.getSummary()
  }
}

/**
 * Main Integration Test Suite
 */
export class VADInterruptionIntegrationTestSuite {
  private handler?: InterruptibleToolCallHandler
  private enhancedHandler?: EnhancedToolCallHandler
  private vadHandler?: VADInterruptionHandler
  private isInitialized = false
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    
    try {
      logger.info('Initializing VAD Integration Test Suite')
      
      // Initialize components (these would normally be dependency-injected)
      // For testing, we'll create minimal mocks/stubs
      this.enhancedHandler = new EnhancedToolCallHandler()
      this.vadHandler = new VADInterruptionHandler()
      this.handler = new InterruptibleToolCallHandler(this.enhancedHandler, this.vadHandler)
      
      // Initialize all components
      await this.handler.initialize()
      
      this.isInitialized = true
      logger.info('VAD Integration Test Suite initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize VAD Integration Test Suite', error)
      throw error
    }
  }
  
  /**
   * Run comprehensive integration test suite
   */
  async runFullTestSuite(): Promise<{
    success: boolean
    totalTests: number
    passedTests: number
    failedTests: number
    summary: string
  }> {
    if (!this.isInitialized || !this.handler) {
      throw new Error('Test suite not initialized. Call initialize() first.')
    }
    
    logger.info('Starting comprehensive VAD integration test suite')
    const overallStartTime = performance.now()
    
    const testCases = [
      new IntegrationTestCase('Basic Interruption'),
      new IntegrationTestCase('High Priority No Interruption'),
      new IntegrationTestCase('Concurrent Tool Calls'),
      new IntegrationTestCase('VAD Monitoring Disabled')
    ]
    
    const results = await Promise.all([
      testCases[0].testBasicInterruption(this.handler),
      testCases[1].testHighPriorityNoInterruption(this.handler),
      testCases[2].testConcurrentToolCalls(this.handler),
      testCases[3].testVADMonitoringDisabled(this.handler)
    ])
    
    const totalTests = results.length
    const passedTests = results.filter(result => result).length
    const failedTests = totalTests - passedTests
    const overallExecutionTime = performance.now() - overallStartTime
    
    // Generate comprehensive summary
    const summary = `
VAD Interruption Integration Test Suite Results
==============================================
Overall Execution Time: ${overallExecutionTime.toFixed(2)}ms
Total Test Cases: ${totalTests}
Passed: ${passedTests}
Failed: ${failedTests}
Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%

Individual Test Results:
${testCases.map((testCase, index) => `
${testCase.constructor.name} ${index + 1}: ${results[index] ? 'PASSED' : 'FAILED'}
${testCase.getSummary()}
`).join('\n')}

System Metrics During Testing:
${JSON.stringify(this.handler.getComprehensiveMetrics(), null, 2)}
    `.trim()
    
    logger.info('VAD integration test suite completed', {
      totalTests,
      passedTests,
      failedTests,
      successRate: (passedTests / totalTests) * 100,
      executionTime: overallExecutionTime
    })
    
    return {
      success: failedTests === 0,
      totalTests,
      passedTests,
      failedTests,
      summary
    }
  }
  
  /**
   * Run a specific test case
   */
  async runSingleTest(testName: string): Promise<boolean> {
    if (!this.isInitialized || !this.handler) {
      throw new Error('Test suite not initialized. Call initialize() first.')
    }
    
    const testCase = new IntegrationTestCase(testName)
    
    switch (testName.toLowerCase()) {
      case 'basic':
      case 'basic interruption':
        return await testCase.testBasicInterruption(this.handler)
        
      case 'priority':
      case 'high priority':
        return await testCase.testHighPriorityNoInterruption(this.handler)
        
      case 'concurrent':
      case 'concurrent tool calls':
        return await testCase.testConcurrentToolCalls(this.handler)
        
      case 'disabled':
      case 'vad monitoring disabled':
        return await testCase.testVADMonitoringDisabled(this.handler)
        
      default:
        throw new Error(`Unknown test case: ${testName}`)
    }
  }
  
  /**
   * Cleanup test suite
   */
  async cleanup(): Promise<void> {
    if (this.handler) {
      await this.handler.shutdown()
    }
    
    this.isInitialized = false
    logger.info('VAD Integration Test Suite cleaned up')
  }
}

// Export test runner function for easy execution
export async function runVADIntegrationTests(): Promise<void> {
  const testSuite = new VADInterruptionIntegrationTestSuite()
  
  try {
    await testSuite.initialize()
    const results = await testSuite.runFullTestSuite()
    
    console.log('\n' + results.summary)
    
    if (results.success) {
      logger.info('🎉 All VAD integration tests passed!')
    } else {
      logger.warn(`⚠️ ${results.failedTests} VAD integration tests failed`)
    }
  } catch (error) {
    logger.error('VAD integration test suite failed', error)
  } finally {
    await testSuite.cleanup()
  }
}

export default VADInterruptionIntegrationTestSuite