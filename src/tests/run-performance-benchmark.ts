#!/usr/bin/env node

/**
 * Performance Benchmark Test Runner
 * Demonstrates the performance improvements from connection pooling and streaming optimizations
 */

import {TranscriptionPerformanceBenchmark} from './transcription-performance-benchmark'

async function runPerformanceBenchmark() {
  console.log('🚀 Starting Transcription Performance Benchmark\n')

  const benchmark = new TranscriptionPerformanceBenchmark({
    testDuration: 30000, // 30 seconds
    requestCount: 10, // 10 concurrent requests
    enableBaseline: true, // Compare against baseline
    enableDetailedLogging: false // Reduce log noise during benchmark
  })

  try {
    // Initialize benchmark
    console.log('📊 Initializing benchmark...')
    await benchmark.initialize()
    console.log('✅ Benchmark initialized\n')

    // Run comprehensive benchmark
    console.log('🔬 Running performance comparison...')
    const results = await benchmark.runBenchmark()

    // Generate and display report
    console.log('\n📈 BENCHMARK RESULTS')
    console.log('='.repeat(80))
    console.log(benchmark.generateReport(results))

    // Summary insights
    console.log('\n🎯 KEY INSIGHTS')
    console.log('='.repeat(80))

    const {performanceImprovement} = results

    if (performanceImprovement.latencyReduction > 0) {
      console.log(`✅ Latency improved by ${performanceImprovement.latencyReduction.toFixed(1)}%`)
    }

    if (performanceImprovement.connectionOverheadSavings > 0) {
      console.log(
        `✅ Connection overhead reduced by ${performanceImprovement.connectionOverheadSavings.toFixed(0)}ms per request`
      )
    }

    if (performanceImprovement.partialResultAdvantage > 0) {
      console.log(
        `✅ Streaming partial results provide ${performanceImprovement.partialResultAdvantage}% faster perceived performance`
      )
    }

    console.log(`✅ Pool efficiency: ${(results.optimizedResult.poolEfficiency * 100).toFixed(1)}%`)
    console.log(`✅ Partial results received: ${results.optimizedResult.partialResultsReceived}`)

    // Performance classification
    const avgLatency = results.optimizedResult.averageLatency
    let performanceGrade = 'Unknown'

    if (avgLatency < 500) {
      performanceGrade = '🏆 Excellent (< 500ms)'
    } else if (avgLatency < 1000) {
      performanceGrade = '🥇 Good (< 1000ms)'
    } else if (avgLatency < 2000) {
      performanceGrade = '🥈 Fair (< 2000ms)'
    } else {
      performanceGrade = '🥉 Needs Improvement (> 2000ms)'
    }

    console.log(`\n🏅 Performance Grade: ${performanceGrade}`)

    if (avgLatency > 1000) {
      console.log('\n💡 OPTIMIZATION RECOMMENDATIONS:')
      console.log('- Consider using a faster Gemini model for real-time scenarios')
      console.log('- Implement additional connection pooling strategies')
      console.log('- Optimize audio preprocessing and compression')
      console.log('- Consider WebAssembly for audio processing acceleration')
    }

    console.log('\n🎉 Benchmark completed successfully!')
  } catch (error) {
    console.error('❌ Benchmark failed:', error)
    process.exit(1)
  }
}

async function runQuickValidation() {
  console.log('⚡ Running Quick Performance Validation\n')

  try {
    const benchmark = new TranscriptionPerformanceBenchmark({
      testDuration: 10000, // 10 seconds
      requestCount: 3, // 3 requests for quick test
      enableBaseline: false, // Skip baseline for speed
      enableDetailedLogging: true
    })

    await benchmark.initialize()
    const results = await benchmark.runBenchmark()

    console.log('📊 Quick Validation Results:')
    console.log(`- Average Latency: ${results.optimizedResult.averageLatency.toFixed(0)}ms`)
    console.log(
      `- Success Rate: ${((results.optimizedResult.successfulRequests / results.optimizedResult.totalRequests) * 100).toFixed(0)}%`
    )
    console.log(`- Pool Efficiency: ${(results.optimizedResult.poolEfficiency * 100).toFixed(0)}%`)
    console.log(`- Partial Results: ${results.optimizedResult.partialResultsReceived}`)

    if (
      results.optimizedResult.averageLatency < 2000 &&
      results.optimizedResult.successfulRequests > 0
    ) {
      console.log('✅ Optimized transcription service is working correctly!')
    } else {
      console.log('⚠️  Service may need additional optimization')
    }
  } catch (error) {
    console.error('❌ Quick validation failed:', error)
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'benchmark'

  // Check for required environment variables
  if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ Missing GOOGLE_API_KEY environment variable')
    console.log('💡 Please set your Google API key: export GOOGLE_API_KEY="your-api-key"')
    process.exit(1)
  }

  console.log('🔧 Transcription Performance Benchmark Tool')
  console.log('='.repeat(50))

  switch (command) {
    case 'quick':
    case 'validate':
      await runQuickValidation()
      break
    case 'benchmark':
    case 'full':
    default:
      await runPerformanceBenchmark()
      break
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Benchmark interrupted by user')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Benchmark terminated')
  process.exit(0)
})

// Run the benchmark
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error)
    process.exit(1)
  })
}

export {runPerformanceBenchmark, runQuickValidation}
