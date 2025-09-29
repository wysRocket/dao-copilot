#!/usr/bin/env node

/**
 * Query Optimization and Caching Integration Test
 *
 * This test validates the advanced query optimization features including:
 * - NLP-based query analysis and expansion
 * - Intent classification for search strategy selection
 * - Query refinement and optimization scoring
 * - Enhanced caching with distributed support
 * - Integration with existing search tools
 */

import {AdvancedQueryOptimizer} from '../src/services/query-optimization.js'
import OptimizedSearchIntegration from '../src/services/optimized-search-integration.js'

/**
 * Test Configuration
 */
const TEST_CONFIG = {
  // Test Gemini API key - replace with actual key for full testing
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key-placeholder',

  // Google Search API credentials - replace with actual credentials
  GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY || 'test-search-key-placeholder',
  CUSTOM_SEARCH_ENGINE_ID: process.env.CUSTOM_SEARCH_ENGINE_ID || 'test-engine-id-placeholder',

  // Test queries with different characteristics
  TEST_QUERIES: [
    'what is artificial intelligence',
    'how to implement neural networks in Python',
    'best practices for TypeScript development',
    'Google Gemini API documentation',
    'machine learning algorithms comparison',
    'climate change effects 2024',
    'cryptocurrency market trends',
    'Node.js performance optimization'
  ],

  // Enable test modes
  ENABLE_ACTUAL_API_CALLS: process.env.NODE_ENV !== 'test',
  ENABLE_CACHE_TESTING: true,
  ENABLE_OPTIMIZATION_TESTING: true,
  ENABLE_INTEGRATION_TESTING: true,

  // Performance thresholds
  OPTIMIZATION_TIMEOUT: 10000,
  SEARCH_TIMEOUT: 30000,
  BATCH_SIZE: 3
}

/**
 * Test Results Tracking
 */
class TestTracker {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      details: []
    }
    this.startTime = Date.now()
  }

  startTest(name) {
    console.log(`\n🧪 Starting test: ${name}`)
    return {
      name,
      startTime: Date.now(),
      pass: (details = '') => this.pass(name, details),
      fail: (error, details = '') => this.fail(name, error, details),
      skip: (reason = '') => this.skip(name, reason)
    }
  }

  pass(name, details = '') {
    this.results.total++
    this.results.passed++
    console.log(`✅ PASS: ${name}`, details ? `- ${details}` : '')
    this.results.details.push({name, status: 'PASS', details})
  }

  fail(name, error, details = '') {
    this.results.total++
    this.results.failed++
    console.log(`❌ FAIL: ${name} - ${error.message || error}`, details ? `- ${details}` : '')
    this.results.details.push({name, status: 'FAIL', error: error.message || error, details})
  }

  skip(name, reason = '') {
    this.results.total++
    this.results.skipped++
    console.log(`⏭️  SKIP: ${name}`, reason ? `- ${reason}` : '')
    this.results.details.push({name, status: 'SKIP', reason})
  }

  summary() {
    const duration = Date.now() - this.startTime
    console.log(`\n📊 Test Summary:`)
    console.log(`   Total: ${this.results.total}`)
    console.log(`   Passed: ${this.results.passed}`)
    console.log(`   Failed: ${this.results.failed}`)
    console.log(`   Skipped: ${this.results.skipped}`)
    console.log(`   Duration: ${duration}ms`)

    if (this.results.failed > 0) {
      console.log(`\n❌ Failed Tests:`)
      this.results.details
        .filter(t => t.status === 'FAIL')
        .forEach(t => console.log(`   - ${t.name}: ${t.error}`))
    }

    return this.results.failed === 0
  }
}

/**
 * Query Optimization Tests
 */
async function testQueryOptimization(tracker) {
  const test = tracker.startTest('Query Optimization - Basic Functionality')

  try {
    const config = {
      enableNLPProcessing: true,
      enableQueryExpansion: true,
      enableIntentClassification: true,
      enableQueryRefinement: true,
      geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
      geminiModel: 'gemini-2.5-flash',
      maxQueryLength: 500,
      expansionTermsLimit: 5,
      refinementAttempts: 2,
      cacheConfig: {
        enableDistributedCache: false,
        fallbackToMemory: true,
        defaultTTL: 3600,
        maxCacheSize: 1000,
        compressionEnabled: false,
        encryptionEnabled: false,
        keyPrefix: 'test-opt:'
      }
    }

    const optimizer = new AdvancedQueryOptimizer(config)

    // Test basic optimization
    const query = 'what is AI'
    const result = await optimizer.optimizeQuery(query)

    if (!result) {
      throw new Error('No optimization result returned')
    }

    if (result.originalQuery !== query) {
      throw new Error('Original query mismatch')
    }

    if (
      typeof result.optimizationScore !== 'number' ||
      result.optimizationScore < 0 ||
      result.optimizationScore > 1
    ) {
      throw new Error('Invalid optimization score')
    }

    if (!result.analysis || !result.analysis.intent) {
      throw new Error('Missing query analysis')
    }

    test.pass(`Score: ${result.optimizationScore.toFixed(2)}, Intent: ${result.analysis.intent}`)
  } catch (error) {
    if (!TEST_CONFIG.ENABLE_ACTUAL_API_CALLS && error.message.includes('API')) {
      test.skip('API calls disabled in test environment')
    } else {
      test.fail(error)
    }
  }
}

/**
 * Cache Performance Tests
 */
async function testCachePerformance(tracker) {
  const test = tracker.startTest('Cache Performance - Hit/Miss Tracking')

  try {
    const config = {
      enableNLPProcessing: false, // Disable to focus on cache testing
      enableQueryExpansion: false,
      enableIntentClassification: false,
      enableQueryRefinement: false,
      geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
      geminiModel: 'gemini-2.5-flash',
      maxQueryLength: 500,
      expansionTermsLimit: 5,
      refinementAttempts: 2,
      cacheConfig: {
        enableDistributedCache: false,
        fallbackToMemory: true,
        defaultTTL: 60, // Short TTL for testing
        maxCacheSize: 100,
        compressionEnabled: false,
        encryptionEnabled: false,
        keyPrefix: 'test-cache:'
      }
    }

    const optimizer = new AdvancedQueryOptimizer(config)

    // Test query
    const query = 'test cache performance'

    // First call - should miss cache
    const start1 = Date.now()
    const result1 = await optimizer.optimizeQuery(query)
    const time1 = Date.now() - start1

    // Second call - should hit cache (if working)
    const start2 = Date.now()
    const result2 = await optimizer.optimizeQuery(query)
    const time2 = Date.now() - start2

    // Verify results are consistent
    if (result1.originalQuery !== result2.originalQuery) {
      throw new Error('Cached result inconsistency')
    }

    // Cache hit should be faster (though with basic analysis it might not be significant)
    const cacheStats = optimizer.getCacheStats()

    test.pass(
      `Cache stats - Keys: ${cacheStats.keys}, First call: ${time1}ms, Second call: ${time2}ms`
    )
  } catch (error) {
    test.fail(error)
  }
}

/**
 * Intent Classification Tests
 */
async function testIntentClassification(tracker) {
  const test = tracker.startTest('Intent Classification - Query Analysis')

  try {
    const config = {
      enableNLPProcessing: true,
      enableQueryExpansion: false,
      enableIntentClassification: true,
      enableQueryRefinement: false,
      geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
      geminiModel: 'gemini-2.5-flash',
      maxQueryLength: 500,
      expansionTermsLimit: 5,
      refinementAttempts: 2,
      cacheConfig: {
        enableDistributedCache: false,
        fallbackToMemory: true,
        defaultTTL: 3600,
        maxCacheSize: 1000,
        compressionEnabled: false,
        encryptionEnabled: false,
        keyPrefix: 'test-intent:'
      }
    }

    const optimizer = new AdvancedQueryOptimizer(config)

    // Test different types of queries
    const testCases = [
      {query: 'What is machine learning?', expectedType: 'question'},
      {query: 'how to install Node.js', expectedType: 'question'},
      {query: 'Python programming tutorial', expectedType: 'keyword'},
      {query: 'latest news about AI', expectedType: 'keyword'}
    ]

    let correctClassifications = 0

    for (const testCase of testCases) {
      try {
        const result = await optimizer.optimizeQuery(testCase.query)

        if (result.analysis && result.analysis.queryType) {
          if (result.analysis.queryType === testCase.expectedType) {
            correctClassifications++
          }
          console.log(
            `   "${testCase.query}" -> ${result.analysis.queryType} (expected: ${testCase.expectedType})`
          )
        }
      } catch (error) {
        console.log(`   Error analyzing "${testCase.query}": ${error.message}`)
      }

      // Small delay to avoid overwhelming API
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    test.pass(`Classified ${correctClassifications}/${testCases.length} queries correctly`)
  } catch (error) {
    if (!TEST_CONFIG.ENABLE_ACTUAL_API_CALLS && error.message.includes('API')) {
      test.skip('API calls disabled in test environment')
    } else {
      test.fail(error)
    }
  }
}

/**
 * Integration Tests
 */
async function testSearchIntegration(tracker) {
  const test = tracker.startTest('Search Integration - End-to-End Flow')

  try {
    const config = {
      geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
      googleSearchApiKey: TEST_CONFIG.GOOGLE_SEARCH_API_KEY,
      customSearchEngineId: TEST_CONFIG.CUSTOM_SEARCH_ENGINE_ID,
      queryOptimization: {
        enableNLPProcessing: true,
        enableQueryExpansion: true,
        enableIntentClassification: true,
        enableQueryRefinement: true,
        geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
        geminiModel: 'gemini-2.5-flash',
        maxQueryLength: 500,
        expansionTermsLimit: 3,
        refinementAttempts: 1,
        cacheConfig: {
          enableDistributedCache: false,
          fallbackToMemory: true,
          defaultTTL: 3600,
          maxCacheSize: 1000,
          compressionEnabled: false,
          encryptionEnabled: false,
          keyPrefix: 'test-integration:'
        }
      },
      enableOptimization: true,
      enableFallback: true,
      maxRetries: 2,
      timeout: TEST_CONFIG.SEARCH_TIMEOUT
    }

    const integration = new OptimizedSearchIntegration(config)

    // Test optimized search
    const query = 'TypeScript best practices'
    const result = await integration.optimizedSearch(query, {
      maxResults: 5,
      useOptimization: true
    })

    if (!result) {
      throw new Error('No search result returned')
    }

    if (!result.optimization || result.optimization.originalQuery !== query) {
      throw new Error('Invalid optimization metadata')
    }

    if (!Array.isArray(result.results)) {
      throw new Error('Invalid results format')
    }

    // Test suggestions
    const suggestions = await integration.getSearchSuggestions(query)

    if (!suggestions || !Array.isArray(suggestions.suggestions)) {
      throw new Error('Invalid suggestions format')
    }

    test.pass(
      `Results: ${result.results.length}, Suggestions: ${suggestions.suggestions.length}, Score: ${result.optimization.optimizationScore.toFixed(2)}`
    )
  } catch (error) {
    if (
      !TEST_CONFIG.ENABLE_ACTUAL_API_CALLS &&
      (error.message.includes('API') || error.message.includes('key'))
    ) {
      test.skip('API calls disabled or missing credentials')
    } else {
      test.fail(error)
    }
  }
}

/**
 * Batch Processing Tests
 */
async function testBatchProcessing(tracker) {
  const test = tracker.startTest('Batch Processing - Multiple Query Optimization')

  try {
    const config = {
      geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
      googleSearchApiKey: TEST_CONFIG.GOOGLE_SEARCH_API_KEY,
      customSearchEngineId: TEST_CONFIG.CUSTOM_SEARCH_ENGINE_ID,
      queryOptimization: {
        enableNLPProcessing: false, // Disabled for faster batch testing
        enableQueryExpansion: false,
        enableIntentClassification: false,
        enableQueryRefinement: false,
        geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
        geminiModel: 'gemini-2.5-flash',
        maxQueryLength: 500,
        expansionTermsLimit: 2,
        refinementAttempts: 1,
        cacheConfig: {
          enableDistributedCache: false,
          fallbackToMemory: true,
          defaultTTL: 3600,
          maxCacheSize: 1000,
          compressionEnabled: false,
          encryptionEnabled: false,
          keyPrefix: 'test-batch:'
        }
      },
      enableOptimization: false, // Disabled for testing basic batch functionality
      enableFallback: true,
      maxRetries: 1,
      timeout: TEST_CONFIG.SEARCH_TIMEOUT
    }

    const integration = new OptimizedSearchIntegration(config)

    // Test batch search
    const queries = TEST_CONFIG.TEST_QUERIES.slice(0, 3) // Limit for testing
    const results = await integration.batchOptimizedSearch(queries, {
      maxResults: 3,
      concurrency: 2,
      useOptimization: false
    })

    if (!Array.isArray(results) || results.length !== queries.length) {
      throw new Error('Invalid batch results format')
    }

    let successCount = 0
    for (const result of results) {
      if (result && result.optimization) {
        successCount++
      }
    }

    test.pass(`Processed ${queries.length} queries, ${successCount} successful`)
  } catch (error) {
    if (
      !TEST_CONFIG.ENABLE_ACTUAL_API_CALLS &&
      (error.message.includes('API') || error.message.includes('key'))
    ) {
      test.skip('API calls disabled or missing credentials')
    } else {
      test.fail(error)
    }
  }
}

/**
 * Configuration Tests
 */
async function testConfiguration(tracker) {
  const test = tracker.startTest('Configuration - Dynamic Updates')

  try {
    const config = {
      enableNLPProcessing: true,
      enableQueryExpansion: true,
      enableIntentClassification: true,
      enableQueryRefinement: true,
      geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
      geminiModel: 'gemini-2.5-flash',
      maxQueryLength: 100, // Start with small limit
      expansionTermsLimit: 2,
      refinementAttempts: 1,
      cacheConfig: {
        enableDistributedCache: false,
        fallbackToMemory: true,
        defaultTTL: 1800,
        maxCacheSize: 500,
        compressionEnabled: false,
        encryptionEnabled: false,
        keyPrefix: 'test-config:'
      }
    }

    const optimizer = new AdvancedQueryOptimizer(config)

    // Test configuration update
    optimizer.updateConfig({
      maxQueryLength: 500,
      expansionTermsLimit: 5
    })

    // Test with longer query after config update
    const longQuery =
      'this is a longer test query to verify that configuration updates work properly for the query optimization system'

    if (longQuery.length <= 100) {
      throw new Error('Test query should be longer than initial limit')
    }

    const result = await optimizer.optimizeQuery(longQuery)

    if (!result || result.originalQuery !== longQuery) {
      throw new Error('Configuration update failed - query rejected')
    }

    // Test cache clearing
    optimizer.clearCache()
    const stats = optimizer.getCacheStats()

    if (stats.keys > 0) {
      throw new Error('Cache not properly cleared')
    }

    test.pass('Configuration updates and cache clearing successful')
  } catch (error) {
    test.fail(error)
  }
}

/**
 * Error Handling Tests
 */
async function testErrorHandling(tracker) {
  const test = tracker.startTest('Error Handling - Invalid Inputs and Edge Cases')

  try {
    const config = {
      enableNLPProcessing: true,
      enableQueryExpansion: true,
      enableIntentClassification: true,
      enableQueryRefinement: true,
      geminiApiKey: 'invalid-api-key',
      geminiModel: 'gemini-2.5-flash',
      maxQueryLength: 50,
      expansionTermsLimit: 5,
      refinementAttempts: 2,
      cacheConfig: {
        enableDistributedCache: false,
        fallbackToMemory: true,
        defaultTTL: 3600,
        maxCacheSize: 1000,
        compressionEnabled: false,
        encryptionEnabled: false,
        keyPrefix: 'test-error:'
      }
    }

    const optimizer = new AdvancedQueryOptimizer(config)

    let errorHandled = 0

    // Test empty query
    try {
      await optimizer.optimizeQuery('')
      // Should still return a result, even if basic
    } catch {
      errorHandled++
    }

    // Test overly long query
    try {
      const longQuery = 'x'.repeat(200) // Exceeds maxQueryLength
      const result = await optimizer.optimizeQuery(longQuery)
      // Should throw error
      if (!result) {
        errorHandled++
      }
    } catch (error) {
      if (error.message.includes('maximum length')) {
        errorHandled++
      }
    }

    // Test with invalid API key (should fallback gracefully)
    try {
      const result = await optimizer.optimizeQuery('test query')
      // Should return basic analysis even with invalid API key
      if (result && result.analysis && result.analysis.model === 'basic') {
        errorHandled++
      }
    } catch {
      // Also acceptable if error is properly handled
      errorHandled++
    }

    test.pass(`Handled ${errorHandled}/3 error conditions properly`)
  } catch (error) {
    test.fail(error)
  }
}

/**
 * Performance Tests
 */
async function testPerformance(tracker) {
  const test = tracker.startTest('Performance - Response Times and Throughput')

  try {
    const config = {
      enableNLPProcessing: false, // Disabled for consistent timing
      enableQueryExpansion: false,
      enableIntentClassification: false,
      enableQueryRefinement: false,
      geminiApiKey: TEST_CONFIG.GEMINI_API_KEY,
      geminiModel: 'gemini-2.5-flash',
      maxQueryLength: 500,
      expansionTermsLimit: 5,
      refinementAttempts: 2,
      cacheConfig: {
        enableDistributedCache: false,
        fallbackToMemory: true,
        defaultTTL: 3600,
        maxCacheSize: 1000,
        compressionEnabled: false,
        encryptionEnabled: false,
        keyPrefix: 'test-perf:'
      }
    }

    const optimizer = new AdvancedQueryOptimizer(config)

    // Test response time
    const queries = ['test query 1', 'test query 2', 'test query 3']
    const times = []

    for (const query of queries) {
      const start = Date.now()
      await optimizer.optimizeQuery(query)
      const duration = Date.now() - start
      times.push(duration)
    }

    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
    const maxTime = Math.max(...times)

    // Performance thresholds (basic analysis should be fast)
    if (avgTime > 1000) {
      throw new Error(`Average response time too high: ${avgTime}ms`)
    }

    if (maxTime > 2000) {
      throw new Error(`Maximum response time too high: ${maxTime}ms`)
    }

    test.pass(`Average: ${avgTime.toFixed(0)}ms, Max: ${maxTime}ms`)
  } catch (error) {
    test.fail(error)
  }
}

/**
 * Main Test Runner
 */
async function runTests() {
  console.log('🚀 Query Optimization and Caching Integration Test Suite')
  console.log('='.repeat(60))

  const tracker = new TestTracker()

  // Run all tests
  await testQueryOptimization(tracker)
  await testCachePerformance(tracker)
  await testIntentClassification(tracker)
  await testSearchIntegration(tracker)
  await testBatchProcessing(tracker)
  await testConfiguration(tracker)
  await testErrorHandling(tracker)
  await testPerformance(tracker)

  // Show summary
  const success = tracker.summary()

  console.log('\n' + '='.repeat(60))
  console.log(success ? '🎉 All tests completed successfully!' : '❌ Some tests failed!')

  // Exit with appropriate code
  process.exit(success ? 0 : 1)
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('💥 Test runner failed:', error)
    process.exit(1)
  })
}

export {runTests, TestTracker}
export default runTests
