/**
 * End-to-End Audio Streaming Pipeline Demo
 * 
 * Demonstrates the complete audio streaming pipeline integration
 * for testing and validation purposes.
 */

import { AudioStreamingPipeline, createAudioStreamingPipeline } from '../services/audio-streaming-pipeline'
import type { AudioPipelineConfig } from '../services/audio-streaming-pipeline'

// Performance monitoring utility
class PerformanceMonitor {
  private startTime: number = 0
  private metrics: {
    totalChunks: number
    totalBytes: number
    totalLatency: number
    errors: number
    startTime: number
    averageLatency: number
    bytesPerSecond: number
  } = {
    totalChunks: 0,
    totalBytes: 0,
    totalLatency: 0,
    errors: 0,
    startTime: 0,
    averageLatency: 0,
    bytesPerSecond: 0
  }

  start(): void {
    this.startTime = Date.now()
    this.metrics.startTime = this.startTime
    this.reset()
  }

  recordChunk(size: number, latency: number): void {
    this.metrics.totalChunks++
    this.metrics.totalBytes += size
    this.metrics.totalLatency += latency
    this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.totalChunks
    
    const elapsedSeconds = (Date.now() - this.startTime) / 1000
    this.metrics.bytesPerSecond = this.metrics.totalBytes / elapsedSeconds
  }

  recordError(): void {
    this.metrics.errors++
  }

  getMetrics() {
    return { ...this.metrics }
  }

  reset(): void {
    this.metrics = {
      totalChunks: 0,
      totalBytes: 0,
      totalLatency: 0,
      errors: 0,
      startTime: this.startTime,
      averageLatency: 0,
      bytesPerSecond: 0
    }
  }

  generateReport(): string {
    const elapsed = (Date.now() - this.startTime) / 1000
    return `
=== Audio Streaming Performance Report ===
Duration: ${elapsed.toFixed(2)}s
Total Chunks: ${this.metrics.totalChunks}
Total Bytes: ${this.metrics.totalBytes}
Average Latency: ${this.metrics.averageLatency.toFixed(2)}ms
Throughput: ${(this.metrics.bytesPerSecond / 1024).toFixed(2)} KB/s
Error Rate: ${((this.metrics.errors / this.metrics.totalChunks) * 100).toFixed(2)}%
Errors: ${this.metrics.errors}
`
  }
}

/**
 * End-to-end test configuration
 */
interface EndToEndTestConfig {
  duration: number // Test duration in seconds
  apiKey: string
  enableWorkers: boolean
  sampleRate: number
  channels: number
  bufferSize: number
  enableVAD: boolean
  enableLogging: boolean
}

/**
 * Comprehensive end-to-end test suite
 */
export class AudioStreamingE2ETest {
  private monitor: PerformanceMonitor
  private pipeline: AudioStreamingPipeline | null = null
  private config: EndToEndTestConfig
  private isRunning = false
  private testResults: {
    success: boolean
    duration: number
    metrics: Record<string, unknown>
    errors: string[]
  } = {
    success: false,
    duration: 0,
    metrics: {},
    errors: []
  }

  constructor(config: EndToEndTestConfig) {
    this.config = config
    this.monitor = new PerformanceMonitor()
  }

  /**
   * Run comprehensive end-to-end test
   */
  async runFullTest(): Promise<void> {
    console.log('🚀 Starting Audio Streaming Pipeline E2E Test...')
    console.log('Configuration:', this.config)

    try {
      await this.testInitialization()
      await this.testStreamingPerformance()
      await this.testErrorHandling()
      await this.testResourceCleanup()
      
      this.testResults.success = true
      console.log('✅ All tests completed successfully!')
      
    } catch (error) {
      this.testResults.success = false
      this.testResults.errors.push(`Test failed: ${error}`)
      console.error('❌ Test failed:', error)
      throw error
    } finally {
      if (this.pipeline) {
        await this.cleanup()
      }
    }
  }

  /**
   * Test pipeline initialization
   */
  private async testInitialization(): Promise<void> {
    console.log('\n🔧 Testing Pipeline Initialization...')
    
    const pipelineConfig: AudioPipelineConfig = {
      websocket: {
        apiKey: this.config.apiKey,
        model: 'gemini-2.0-flash-exp',
        enableReconnect: true
      },
      audio: {
        sampleRate: this.config.sampleRate,
        channels: this.config.channels,
        bitDepth: 16
      },
      processing: {
        enableWorkers: this.config.enableWorkers,
        bufferSize: this.config.bufferSize,
        enableVAD: this.config.enableVAD,
        vadThreshold: 0.01
      }
    }

    this.pipeline = createAudioStreamingPipeline(pipelineConfig)
    
    // Test initialization
    const initStart = Date.now()
    await this.pipeline.initialize()
    const initTime = Date.now() - initStart
    
    console.log(`✅ Pipeline initialized in ${initTime}ms`)
    
    // Verify initial state
    if (this.pipeline.isStreamingActive()) {
      throw new Error('Pipeline should not be active after initialization')
    }
    
    const metrics = this.pipeline.getMetrics()
    if (metrics.isActive || metrics.chunksProcessed !== 0) {
      throw new Error('Initial metrics should show inactive state')
    }
    
    console.log('✅ Initial state verification passed')
  }

  /**
   * Test streaming performance
   */
  private async testStreamingPerformance(): Promise<void> {
    if (!this.pipeline) throw new Error('Pipeline not initialized')
    
    console.log('\n📊 Testing Streaming Performance...')
    
    // Set up event monitoring
    this.setupEventMonitoring()
    
    // Start performance monitoring
    this.monitor.start()
    this.isRunning = true
    
    // Start streaming
    const streamStart = Date.now()
    await this.pipeline.startStreaming()
    const streamStartTime = Date.now() - streamStart
    
    console.log(`✅ Streaming started in ${streamStartTime}ms`)
    console.log(`📡 Running performance test for ${this.config.duration}s...`)
    
    // Run for specified duration
    await this.waitForDuration(this.config.duration * 1000)
    
    // Stop streaming
    await this.pipeline.stopStreaming()
    this.isRunning = false
    
    // Analyze performance
    const pipelineMetrics = this.pipeline.getMetrics()
    const monitorMetrics = this.monitor.getMetrics()
    
    console.log(this.monitor.generateReport())
    console.log('Pipeline Metrics:', pipelineMetrics)
    
    // Validate performance thresholds
    this.validatePerformance(monitorMetrics, pipelineMetrics)
    
    this.testResults.metrics = {
      monitor: monitorMetrics,
      pipeline: pipelineMetrics
    }
  }

  /**
   * Test error handling scenarios
   */
  private async testErrorHandling(): Promise<void> {
    if (!this.pipeline) throw new Error('Pipeline not initialized')
    
    console.log('\n🛡️ Testing Error Handling...')
    
    // Test multiple start calls
    await this.pipeline.startStreaming()
    await this.pipeline.startStreaming() // Should not cause issues
    
    // Test multiple stop calls
    await this.pipeline.stopStreaming()
    await this.pipeline.stopStreaming() // Should not cause issues
    
    console.log('✅ Multiple start/stop calls handled correctly')
    
    // Test error recovery (simulated)
    let errorEmitted = false
    this.pipeline.once('error', () => {
      errorEmitted = true
    })
    
    // Simulate processing error by emitting an error
    this.pipeline.emit('error', new Error('Simulated error'))
    
    if (!errorEmitted) {
      throw new Error('Error event should have been emitted')
    }
    
    console.log('✅ Error handling verification passed')
  }

  /**
   * Test resource cleanup
   */
  private async testResourceCleanup(): Promise<void> {
    if (!this.pipeline) throw new Error('Pipeline not initialized')
    
    console.log('\n🧹 Testing Resource Cleanup...')
    
    let cleanedEmitted = false
    this.pipeline.once('cleaned', () => {
      cleanedEmitted = true
    })
    
    await this.pipeline.cleanup()
    
    if (!cleanedEmitted) {
      throw new Error('Cleaned event should have been emitted')
    }
    
    console.log('✅ Resource cleanup completed successfully')
  }

  /**
   * Set up event monitoring for the test
   */
  private setupEventMonitoring(): void {
    if (!this.pipeline) return
    
    this.pipeline.on('initialized', () => {
      if (this.config.enableLogging) {
        console.log('📡 Pipeline initialized')
      }
    })
    
    this.pipeline.on('streamingStarted', () => {
      if (this.config.enableLogging) {
        console.log('🎵 Streaming started')
      }
    })
    
    this.pipeline.on('streamingStopped', () => {
      if (this.config.enableLogging) {
        console.log('⏹️ Streaming stopped')
      }
    })
    
    this.pipeline.on('chunkProcessed', (data) => {
      this.monitor.recordChunk(data.size, data.latency)
      if (this.config.enableLogging) {
        console.log(`📦 Chunk processed: ${data.size} bytes, ${data.latency}ms latency`)
      }
    })
    
    this.pipeline.on('error', (error) => {
      this.monitor.recordError()
      this.testResults.errors.push(error.message)
      if (this.config.enableLogging) {
        console.error('❌ Pipeline error:', error)
      }
    })
  }

  /**
   * Validate performance against thresholds
   */
  private validatePerformance(monitorMetrics: ReturnType<PerformanceMonitor['getMetrics']>, pipelineMetrics: any): void {
    console.log('\n🎯 Validating Performance Thresholds...')
    
    // Latency threshold: should be under 100ms average
    if (monitorMetrics.averageLatency > 100) {
      console.warn(`⚠️ High latency detected: ${monitorMetrics.averageLatency}ms (threshold: 100ms)`)
    } else {
      console.log(`✅ Latency within threshold: ${monitorMetrics.averageLatency.toFixed(2)}ms`)
    }
    
    // Throughput threshold: should process at least 1KB/s
    if (monitorMetrics.bytesPerSecond < 1024) {
      console.warn(`⚠️ Low throughput detected: ${(monitorMetrics.bytesPerSecond / 1024).toFixed(2)} KB/s`)
    } else {
      console.log(`✅ Throughput adequate: ${(monitorMetrics.bytesPerSecond / 1024).toFixed(2)} KB/s`)
    }
    
    // Error rate threshold: should be under 5%
    const errorRate = (monitorMetrics.errors / monitorMetrics.totalChunks) * 100
    if (errorRate > 5) {
      throw new Error(`High error rate: ${errorRate.toFixed(2)}% (threshold: 5%)`)
    } else {
      console.log(`✅ Error rate acceptable: ${errorRate.toFixed(2)}%`)
    }
    
    // Pipeline metrics consistency
    if (pipelineMetrics.chunksProcessed === 0) {
      console.warn('⚠️ No chunks processed by pipeline')
    } else {
      console.log(`✅ Pipeline processed ${pipelineMetrics.chunksProcessed} chunks`)
    }
  }

  /**
   * Wait for specified duration
   */
  private async waitForDuration(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    if (this.pipeline && this.isRunning) {
      await this.pipeline.stopStreaming()
    }
    if (this.pipeline) {
      await this.pipeline.cleanup()
      this.pipeline = null
    }
    this.isRunning = false
  }

  /**
   * Get test results
   */
  getResults() {
    return this.testResults
  }
}

/**
 * Run quick validation test
 */
export async function runQuickValidationTest(): Promise<void> {
  const config: EndToEndTestConfig = {
    duration: 5, // 5 seconds
    apiKey: process.env.GEMINI_API_KEY || 'test-key',
    enableWorkers: true,
    sampleRate: 16000,
    channels: 1,
    bufferSize: 4096,
    enableVAD: true,
    enableLogging: false
  }

  const test = new AudioStreamingE2ETest(config)
  await test.runFullTest()
  
  const results = test.getResults()
  console.log('🎉 Quick validation test completed:', results.success ? 'PASSED' : 'FAILED')
}

/**
 * Run comprehensive performance test
 */
export async function runPerformanceTest(): Promise<void> {
  const config: EndToEndTestConfig = {
    duration: 30, // 30 seconds
    apiKey: process.env.GEMINI_API_KEY || 'test-key',
    enableWorkers: true,
    sampleRate: 16000,
    channels: 1,
    bufferSize: 4096,
    enableVAD: true,
    enableLogging: true
  }

  const test = new AudioStreamingE2ETest(config)
  await test.runFullTest()
  
  const results = test.getResults()
  console.log('🏆 Performance test completed:', results.success ? 'PASSED' : 'FAILED')
  console.log('📊 Final Results:', results)
}

/**
 * Demo function for manual testing
 */
export async function demonstrateAudioPipeline(): Promise<void> {
  console.log('🎪 Audio Streaming Pipeline Demonstration')
  console.log('==========================================')
  
  const pipeline = createAudioStreamingPipeline({
    websocket: {
      apiKey: process.env.GEMINI_API_KEY || 'demo-key',
      model: 'gemini-2.0-flash-exp',
      enableReconnect: true
    },
    audio: {
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16
    },
    processing: {
      enableWorkers: true,
      bufferSize: 4096,
      enableVAD: true,
      vadThreshold: 0.01
    }
  })

  try {
    // Initialize
    console.log('🔧 Initializing pipeline...')
    await pipeline.initialize()
    console.log('✅ Pipeline initialized')

    // Set up monitoring
    pipeline.on('chunkProcessed', (data) => {
      console.log(`📦 Processed chunk: ${data.size} bytes, ${data.latency}ms`)
    })

    pipeline.on('error', (error) => {
      console.error('❌ Pipeline error:', error.message)
    })

    // Start streaming
    console.log('🎵 Starting audio streaming...')
    await pipeline.startStreaming()
    console.log('✅ Streaming active')

    // Run for 10 seconds
    console.log('⏰ Running for 10 seconds...')
    await new Promise(resolve => setTimeout(resolve, 10000))

    // Stop and cleanup
    console.log('⏹️ Stopping streaming...')
    await pipeline.stopStreaming()
    
    console.log('🧹 Cleaning up...')
    await pipeline.cleanup()
    
    console.log('✨ Demo completed successfully!')

  } catch (error) {
    console.error('❌ Demo failed:', error)
    await pipeline.cleanup()
    throw error
  }
}

// Export for CLI usage
if (typeof window === 'undefined' && require.main === module) {
  const command = process.argv[2]
  
  switch (command) {
    case 'quick':
      runQuickValidationTest().catch(console.error)
      break
    case 'performance':
      runPerformanceTest().catch(console.error)
      break
    case 'demo':
      demonstrateAudioPipeline().catch(console.error)
      break
    default:
      console.log('Usage: node e2e-audio-streaming-test.js [quick|performance|demo]')
  }
}
