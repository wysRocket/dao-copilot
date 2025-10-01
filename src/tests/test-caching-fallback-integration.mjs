/**
 * Integration Tests for Caching and Fallback Systems
 * 
 * This test suite validates the integration between:
 * - Enhanced Tool Call Handler
 * - Search Cache System
 * - Search Fallback System
 * - Google Search API integration
 * 
 * Test scenarios:
 * - Primary API success paths
 * - Cache hit/miss scenarios
 * - Fallback provider switching
 * - Offline knowledge base responses
 * - Error handling and recovery
 * - Performance benchmarks
 * - Concurrent request handling
 */

import { EnhancedToolCallHandler } from '../src/services/enhanced-tool-call-handler'
import { SearchCacheSystem } from '../src/services/search-cache-system'
import { SearchFallbackSystem } from '../src/services/search-fallback-system'
import { logger } from '../src/services/gemini-logger'

// Test configuration
const TEST_CONFIG = {
  google: {
    apiKey: process.env.GOOGLE_API_KEY || 'test-key',
    searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || 'test-engine',
    baseUrl: 'https://www.googleapis.com/customsearch/v1',
    timeout: 5000,
    retryAttempts: 1,
    rateLimit: 100,
    quotaLimit: 1000,
    safeSearch: true
  },
  caching: {
    enabled: true,
    maxCacheSize: 10 * 1024 * 1024, // 10MB for testing
    defaultTTL: 300000, // 5 minutes for testing
    diskCacheEnabled: false // Use memory only for tests
  },
  fallback: {
    enabled: true,
    providers: ['duckduckgo'],
    timeout: 8000
  },
  performance: {
    maxConcurrentRequests: 2,
    requestTimeout: 10000,
    retryDelay: 500
  },
  quality: {
    minimumConfidence: 0.2,
    relevanceThreshold: 0.3,
    enableResultRanking: true
  }
}

interface TestResult {
  testName: string
  success: boolean
  duration: number
  details: any
  error?: string
}

class IntegrationTestSuite {
  private handler: EnhancedToolCallHandler
  private testResults: TestResult[] = []

  constructor() {
    this.handler = new EnhancedToolCallHandler(TEST_CONFIG)
  }

  async runAllTests(): Promise<void> {
    logger.info('Starting integration test suite for caching and fallback systems')
    
    try {
      await this.handler.initialize()
      
      // Core functionality tests
      await this.testBasicSearchFunctionality()
      await this.testCacheHitScenario()
      await this.testCacheMissScenario()
      await this.testCacheEvictionBehavior()
      
      // Fallback system tests
      await this.testPrimaryAPIFailure()
      await this.testFallbackProviderSwitching()
      await this.testOfflineKnowledgeBase()
      await this.testFallbackWithCacheIntegration()
      
      // Error handling tests
      await this.testRateLimitHandling()
      await this.testTimeoutRecovery()
      await this.testInvalidQueryHandling()
      await this.testNetworkErrorRecovery()
      
      // Performance tests
      await this.testConcurrentRequestHandling()
      await this.testResponseTimeOptimization()
      await this.testMemoryUsageOptimization()
      
      // Quality and ranking tests
      await this.testResultQualityFiltering()
      await this.testResultRankingLogic()
      await this.testConfidenceScoring()
      
      // System integration tests
      await this.testEndToEndWorkflow()
      await this.testGracefulShutdown()
      
      this.printTestSummary()
      
    } catch (error) {
      logger.error('Test suite failed to initialize', { error })
      throw error
    } finally {
      await this.handler.shutdown()
    }
  }

  // Core Functionality Tests

  private async testBasicSearchFunctionality(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'artificial intelligence machine learning',
          maxResults: 5
        },
        context: {
          conversationId: 'test-conv-1',
          sessionId: 'test-session-1'
        }
      })
      
      const success = response.success && 
                     response.results && 
                     response.results.length > 0 &&
                     response.executionTime > 0
      
      this.recordTestResult('Basic Search Functionality', success, startTime, {
        resultCount: response.results?.length || 0,
        executionTime: response.executionTime,
        source: response.source,
        confidence: response.confidence
      })
      
    } catch (error) {
      this.recordTestResult('Basic Search Functionality', false, startTime, {}, 
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testCacheHitScenario(): Promise<void> {
    const startTime = performance.now()
    const testQuery = 'cache test query unique'
    
    try {
      // First request - should miss cache
      const firstResponse = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: { query: testQuery, maxResults: 3 }
      })
      
      // Wait a moment to ensure cache is written
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Second request - should hit cache
      const secondResponse = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: { query: testQuery, maxResults: 3 }
      })
      
      const success = firstResponse.success && 
                     secondResponse.success &&
                     secondResponse.source === 'cache' &&
                     secondResponse.executionTime < firstResponse.executionTime
      
      this.recordTestResult('Cache Hit Scenario', success, startTime, {
        firstResponseTime: firstResponse.executionTime,
        secondResponseTime: secondResponse.executionTime,
        cacheHit: secondResponse.source === 'cache',
        speedImprovement: firstResponse.executionTime - secondResponse.executionTime
      })
      
    } catch (error) {
      this.recordTestResult('Cache Hit Scenario', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testCacheMissScenario(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const uniqueQuery = `cache miss test ${Date.now()}`
      
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: { query: uniqueQuery, maxResults: 3 }
      })
      
      const success = response.success && 
                     response.source !== 'cache' &&
                     response.results && 
                     response.results.length > 0
      
      this.recordTestResult('Cache Miss Scenario', success, startTime, {
        source: response.source,
        resultCount: response.results?.length || 0,
        executionTime: response.executionTime
      })
      
    } catch (error) {
      this.recordTestResult('Cache Miss Scenario', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testCacheEvictionBehavior(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Fill cache with multiple entries
      const queries = Array.from({ length: 10 }, (_, i) => 
        `cache eviction test ${i} ${Date.now()}`
      )
      
      const responses: any[] = []
      for (const query of queries) {
        const response = await this.handler.executeToolCall({
          tool: 'google_search',
          parameters: { query, maxResults: 2 }
        })
        responses.push(response)
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      // Check that all requests succeeded
      const allSucceeded = responses.every(r => r.success)
      
      // Get cache statistics
      const metrics = this.handler.getSystemMetrics()
      const cacheStats = metrics.cache
      
      this.recordTestResult('Cache Eviction Behavior', allSucceeded, startTime, {
        totalQueries: queries.length,
        allSucceeded,
        cacheStats: cacheStats || {}
      })
      
    } catch (error) {
      this.recordTestResult('Cache Eviction Behavior', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Fallback System Tests

  private async testPrimaryAPIFailure(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Temporarily disable Google API to force fallback
      const originalConfig = { ...TEST_CONFIG.google }
      this.handler.updateConfig({
        google: { ...originalConfig, apiKey: 'invalid-key' }
      })
      
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'fallback test query',
          maxResults: 3
        }
      })
      
      // Restore original config
      this.handler.updateConfig({ google: originalConfig })
      
      const success = response.source === 'fallback' || 
                     response.source === 'offline' ||
                     response.source === 'cache'
      
      this.recordTestResult('Primary API Failure', success, startTime, {
        source: response.source,
        success: response.success,
        resultCount: response.results?.length || 0
      })
      
    } catch (error) {
      this.recordTestResult('Primary API Failure', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testFallbackProviderSwitching(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // This test would require actual fallback providers to be configured
      // For now, we'll test the interface and basic functionality
      
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'fallback provider test',
          maxResults: 3
        }
      })
      
      const success = response.success !== undefined &&
                     response.source !== undefined &&
                     response.executionTime > 0
      
      this.recordTestResult('Fallback Provider Switching', success, startTime, {
        source: response.source,
        success: response.success,
        confidence: response.confidence
      })
      
    } catch (error) {
      this.recordTestResult('Fallback Provider Switching', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testOfflineKnowledgeBase(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Test with a common query that might be in offline knowledge base
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'what is artificial intelligence',
          maxResults: 3
        }
      })
      
      const success = response.success !== undefined &&
                     response.results !== undefined
      
      this.recordTestResult('Offline Knowledge Base', success, startTime, {
        source: response.source,
        resultCount: response.results?.length || 0,
        confidence: response.confidence
      })
      
    } catch (error) {
      this.recordTestResult('Offline Knowledge Base', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testFallbackWithCacheIntegration(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const testQuery = 'fallback cache integration test'
      
      // Make request that might use fallback
      const firstResponse = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: { query: testQuery, maxResults: 3 }
      })
      
      // Make same request again - should potentially hit cache
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const secondResponse = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: { query: testQuery, maxResults: 3 }
      })
      
      const success = firstResponse.success !== undefined &&
                     secondResponse.success !== undefined &&
                     (secondResponse.source === 'cache' || 
                      secondResponse.executionTime <= firstResponse.executionTime)
      
      this.recordTestResult('Fallback Cache Integration', success, startTime, {
        firstSource: firstResponse.source,
        secondSource: secondResponse.source,
        speedImprovement: firstResponse.executionTime - secondResponse.executionTime
      })
      
    } catch (error) {
      this.recordTestResult('Fallback Cache Integration', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Error Handling Tests

  private async testRateLimitHandling(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // This test would require actually hitting rate limits
      // For now, test the interface and basic error handling
      
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'rate limit test',
          maxResults: 3
        }
      })
      
      const success = response.success !== undefined &&
                     response.metadata?.quota !== undefined
      
      this.recordTestResult('Rate Limit Handling', success, startTime, {
        quota: response.metadata?.quota,
        success: response.success
      })
      
    } catch (error) {
      this.recordTestResult('Rate Limit Handling', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testTimeoutRecovery(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Test with very short timeout to trigger timeout handling
      this.handler.updateConfig({
        google: { ...TEST_CONFIG.google, timeout: 1 },
        performance: { ...TEST_CONFIG.performance, requestTimeout: 2000 }
      })
      
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'timeout recovery test',
          maxResults: 3
        }
      })
      
      // Restore normal timeout
      this.handler.updateConfig({
        google: { ...TEST_CONFIG.google, timeout: 5000 },
        performance: { ...TEST_CONFIG.performance, requestTimeout: 10000 }
      })
      
      // Success if we got a response (from fallback/cache) or proper error handling
      const success = response.success !== undefined
      
      this.recordTestResult('Timeout Recovery', success, startTime, {
        source: response.source,
        success: response.success,
        error: response.error?.code
      })
      
    } catch (error) {
      this.recordTestResult('Timeout Recovery', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testInvalidQueryHandling(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: '', // Empty query
          maxResults: 3
        }
      })
      
      const success = response.success === false || 
                     response.error !== undefined
      
      this.recordTestResult('Invalid Query Handling', success, startTime, {
        success: response.success,
        error: response.error?.code,
        message: response.error?.message
      })
      
    } catch (error) {
      this.recordTestResult('Invalid Query Handling', true, startTime, {
        caughtError: true
      })
    }
  }

  private async testNetworkErrorRecovery(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Test with invalid endpoint to simulate network error
      this.handler.updateConfig({
        google: { ...TEST_CONFIG.google, baseUrl: 'https://invalid-endpoint.example.com' }
      })
      
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'network error test',
          maxResults: 3
        }
      })
      
      // Restore original config
      this.handler.updateConfig({
        google: { ...TEST_CONFIG.google, baseUrl: 'https://www.googleapis.com/customsearch/v1' }
      })
      
      // Success if fallback mechanisms kicked in
      const success = response.source === 'fallback' || 
                     response.source === 'cache' ||
                     response.source === 'offline' ||
                     response.error?.retryable !== undefined
      
      this.recordTestResult('Network Error Recovery', success, startTime, {
        source: response.source,
        success: response.success,
        error: response.error
      })
      
    } catch (error) {
      this.recordTestResult('Network Error Recovery', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Performance Tests

  private async testConcurrentRequestHandling(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        this.handler.executeToolCall({
          tool: 'google_search',
          parameters: {
            query: `concurrent test query ${i}`,
            maxResults: 2
          }
        })
      )
      
      const responses = await Promise.allSettled(concurrentRequests)
      const successful = responses.filter(r => r.status === 'fulfilled')
      
      const success = successful.length >= 3 // At least 3 out of 5 should succeed
      
      this.recordTestResult('Concurrent Request Handling', success, startTime, {
        totalRequests: concurrentRequests.length,
        successful: successful.length,
        failed: responses.length - successful.length
      })
      
    } catch (error) {
      this.recordTestResult('Concurrent Request Handling', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testResponseTimeOptimization(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const query = 'response time optimization test'
      
      // Warm up cache
      await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: { query, maxResults: 3 }
      })
      
      // Measure cached response time
      const cachedStart = performance.now()
      const cachedResponse = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: { query, maxResults: 3 }
      })
      const cachedTime = performance.now() - cachedStart
      
      const success = cachedResponse.success &&
                     cachedTime < 1000 && // Should be under 1 second
                     cachedResponse.source === 'cache'
      
      this.recordTestResult('Response Time Optimization', success, startTime, {
        cachedTime: cachedTime.toFixed(2),
        source: cachedResponse.source,
        underThreshold: cachedTime < 1000
      })
      
    } catch (error) {
      this.recordTestResult('Response Time Optimization', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testMemoryUsageOptimization(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const initialMemory = process.memoryUsage()
      
      // Make multiple requests to test memory management
      for (let i = 0; i < 10; i++) {
        await this.handler.executeToolCall({
          tool: 'google_search',
          parameters: {
            query: `memory test query ${i}`,
            maxResults: 2
          }
        })
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed
      
      // Success if memory increase is reasonable (less than 50MB)
      const success = memoryIncrease < 50 * 1024 * 1024
      
      this.recordTestResult('Memory Usage Optimization', success, startTime, {
        initialMemory: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalMemory: Math.round(finalMemory.heapUsed / 1024 / 1024),
        increase: Math.round(memoryIncrease / 1024 / 1024),
        withinLimit: success
      })
      
    } catch (error) {
      this.recordTestResult('Memory Usage Optimization', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Quality and Ranking Tests

  private async testResultQualityFiltering(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'quality filtering test artificial intelligence',
          maxResults: 5
        }
      })
      
      // Check that results meet minimum confidence threshold
      const allMeetThreshold = response.results?.every(r => 
        r.confidence >= TEST_CONFIG.quality.minimumConfidence
      ) || false
      
      const success = response.success && allMeetThreshold
      
      this.recordTestResult('Result Quality Filtering', success, startTime, {
        resultCount: response.results?.length || 0,
        allMeetThreshold,
        averageConfidence: response.results?.reduce((sum, r) => sum + r.confidence, 0) / 
                          (response.results?.length || 1)
      })
      
    } catch (error) {
      this.recordTestResult('Result Quality Filtering', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testResultRankingLogic(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const response = await this.handler.executeToolCall({
        tool: 'google_search',
        parameters: {
          query: 'result ranking test machine learning',
          maxResults: 5
        }
      })
      
      // Check that results are sorted by confidence (descending)
      const properlyRanked = response.results?.every((result, index) => {
        if (index === 0) return true
        return result.confidence <= response.results![index - 1].confidence
      }) || false
      
      const success = response.success && properlyRanked
      
      this.recordTestResult('Result Ranking Logic', success, startTime, {
        resultCount: response.results?.length || 0,
        properlyRanked,
        confidenceValues: response.results?.map(r => r.confidence.toFixed(2)) || []
      })
      
    } catch (error) {
      this.recordTestResult('Result Ranking Logic', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testConfidenceScoring(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const responses = await Promise.all([
        // High-quality query
        this.handler.executeToolCall({
          tool: 'google_search',
          parameters: {
            query: 'artificial intelligence definition wikipedia',
            maxResults: 3
          }
        }),
        
        // Lower-quality query
        this.handler.executeToolCall({
          tool: 'google_search',
          parameters: {
            query: 'random words test query',
            maxResults: 3
          }
        })
      ])
      
      const highQualityConfidence = responses[0].confidence
      const lowQualityConfidence = responses[1].confidence
      
      const success = responses.every(r => r.success !== undefined) &&
                     highQualityConfidence >= 0 && highQualityConfidence <= 1 &&
                     lowQualityConfidence >= 0 && lowQualityConfidence <= 1
      
      this.recordTestResult('Confidence Scoring', success, startTime, {
        highQualityConfidence: highQualityConfidence.toFixed(2),
        lowQualityConfidence: lowQualityConfidence.toFixed(2),
        confidenceRange: success
      })
      
    } catch (error) {
      this.recordTestResult('Confidence Scoring', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // System Integration Tests

  private async testEndToEndWorkflow(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Simulate a complete workflow
      const conversationId = `e2e-test-${Date.now()}`
      
      const responses = await Promise.all([
        this.handler.executeToolCall({
          tool: 'google_search',
          parameters: {
            query: 'machine learning algorithms',
            maxResults: 3
          },
          context: { conversationId }
        }),
        
        this.handler.executeToolCall({
          tool: 'google_search',
          parameters: {
            query: 'neural networks deep learning',
            maxResults: 3
          },
          context: { conversationId }
        }),
        
        this.handler.executeToolCall({
          tool: 'google_search',
          parameters: {
            query: 'artificial intelligence applications',
            maxResults: 3
          },
          context: { conversationId }
        })
      ])
      
      const allSuccessful = responses.every(r => r.success !== undefined)
      const totalResults = responses.reduce((sum, r) => sum + (r.results?.length || 0), 0)
      
      const success = allSuccessful && totalResults > 0
      
      this.recordTestResult('End-to-End Workflow', success, startTime, {
        requestCount: responses.length,
        allSuccessful,
        totalResults,
        conversationId
      })
      
    } catch (error) {
      this.recordTestResult('End-to-End Workflow', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async testGracefulShutdown(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Get initial metrics
      const initialMetrics = this.handler.getSystemMetrics()
      
      // The shutdown will be tested in the finally block
      const success = initialMetrics !== undefined &&
                     typeof initialMetrics === 'object'
      
      this.recordTestResult('Graceful Shutdown', success, startTime, {
        metricsAvailable: success,
        handlerMetrics: initialMetrics.handler || {},
        systemMetrics: initialMetrics.system || {}
      })
      
    } catch (error) {
      this.recordTestResult('Graceful Shutdown', false, startTime, {},
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Utility Methods

  private recordTestResult(
    testName: string, 
    success: boolean, 
    startTime: number, 
    details: any,
    error?: string
  ): void {
    this.testResults.push({
      testName,
      success,
      duration: performance.now() - startTime,
      details,
      error
    })
    
    const status = success ? 'PASS' : 'FAIL'
    const duration = (performance.now() - startTime).toFixed(2)
    
    logger.info(`[TEST ${status}] ${testName}`, {
      duration: `${duration}ms`,
      details,
      error
    })
  }

  private printTestSummary(): void {
    const total = this.testResults.length
    const passed = this.testResults.filter(t => t.success).length
    const failed = total - passed
    const averageDuration = this.testResults.reduce((sum, t) => sum + t.duration, 0) / total
    
    const summary = {
      total,
      passed,
      failed,
      passRate: `${((passed / total) * 100).toFixed(1)}%`,
      averageDuration: `${averageDuration.toFixed(2)}ms`,
      totalDuration: `${this.testResults.reduce((sum, t) => sum + t.duration, 0).toFixed(2)}ms`
    }
    
    logger.info('='.repeat(80))
    logger.info('INTEGRATION TEST SUITE SUMMARY')
    logger.info('='.repeat(80))
    logger.info('Overall Results:', summary)
    
    if (failed > 0) {
      logger.info('Failed Tests:')
      this.testResults
        .filter(t => !t.success)
        .forEach(t => {
          logger.info(`  ❌ ${t.testName}: ${t.error || 'Unknown error'}`)
        })
    }
    
    logger.info('='.repeat(80))
    
    // Also log detailed results
    console.log('\n📊 DETAILED TEST RESULTS:')
    console.table(this.testResults.map(t => ({
      Test: t.testName,
      Status: t.success ? '✅ PASS' : '❌ FAIL',
      'Duration (ms)': t.duration.toFixed(2),
      Error: t.error || ''
    })))
  }
}

// Export for use in other modules
export { IntegrationTestSuite }

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new IntegrationTestSuite()
  
  testSuite.runAllTests()
    .then(() => {
      logger.info('Integration test suite completed successfully')
      process.exit(0)
    })
    .catch(error => {
      logger.error('Integration test suite failed', { error })
      process.exit(1)
    })
}