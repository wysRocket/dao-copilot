/**
 * Performance Optimization Suite for Audio Streaming Pipeline
 *
 * Tools and utilities for monitoring, measuring, and optimizing
 * the real-time audio streaming system.
 */

import {
  AudioStreamingPipeline,
  createAudioStreamingPipeline
} from '../services/audio-streaming-pipeline'
import type {AudioPipelineConfig} from '../services/audio-streaming-pipeline'

// Performance metrics collection
export interface PerformanceMetrics {
  // Timing metrics
  initializationTime: number
  averageChunkLatency: number
  maxChunkLatency: number
  minChunkLatency: number

  // Throughput metrics
  chunksPerSecond: number
  bytesPerSecond: number
  totalChunksProcessed: number
  totalBytesProcessed: number

  // Resource metrics
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }

  // Error metrics
  errorRate: number
  totalErrors: number
  errorTypes: Record<string, number>

  // Connection metrics
  connectionTime: number
  reconnectionCount: number
  networkLatency: number
}

// Performance threshold configuration
export interface PerformanceThresholds {
  maxAverageLatency: number // ms
  maxErrorRate: number // percentage
  minThroughput: number // bytes/second
  maxMemoryUsage: number // bytes
  maxInitTime: number // ms
}

// Default performance thresholds
export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  maxAverageLatency: 100, // 100ms
  maxErrorRate: 5, // 5%
  minThroughput: 1024, // 1KB/s
  maxMemoryUsage: 100 * 1024 * 1024, // 100MB
  maxInitTime: 5000 // 5 seconds
}

/**
 * Performance monitoring and optimization utility
 */
export class AudioStreamingOptimizer {
  private pipeline: AudioStreamingPipeline | null = null
  private metrics: PerformanceMetrics
  private thresholds: PerformanceThresholds
  private startTime: number = 0
  private chunkLatencies: number[] = []
  private errors: Array<{type: string; message: string; timestamp: number}> = []
  private isMonitoring = false

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = {...DEFAULT_THRESHOLDS, ...thresholds}
    this.metrics = this.initializeMetrics()
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      initializationTime: 0,
      averageChunkLatency: 0,
      maxChunkLatency: 0,
      minChunkLatency: Infinity,
      chunksPerSecond: 0,
      bytesPerSecond: 0,
      totalChunksProcessed: 0,
      totalBytesProcessed: 0,
      memoryUsage: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      },
      errorRate: 0,
      totalErrors: 0,
      errorTypes: {},
      connectionTime: 0,
      reconnectionCount: 0,
      networkLatency: 0
    }
  }

  /**
   * Create optimized pipeline configuration
   */
  createOptimizedConfig(baseConfig: Partial<AudioPipelineConfig>): AudioPipelineConfig {
    const optimized: AudioPipelineConfig = {
      websocket: {
        apiKey: baseConfig.websocket?.apiKey || '',
        model: 'gemini-live-2.5-flash-preview',
        enableReconnect: true
      },
      audio: {
        sampleRate: 16000, // Optimal for speech recognition
        channels: 1, // Mono for efficiency
        bitDepth: 16 // Good balance of quality/performance
      },
      processing: {
        enableWorkers: true, // Offload processing
        bufferSize: 4096, // Balanced latency/stability
        enableVAD: true, // Reduce unnecessary data
        vadThreshold: 0.01 // Sensitive detection
      }
    }

    // Merge with user config
    return {
      websocket: {...optimized.websocket, ...baseConfig.websocket},
      audio: {...optimized.audio, ...baseConfig.audio},
      processing: {...optimized.processing, ...baseConfig.processing}
    }
  }

  /**
   * Start performance monitoring
   */
  async startMonitoring(config: AudioPipelineConfig): Promise<void> {
    console.log('🎯 Starting performance monitoring...')

    this.startTime = Date.now()
    this.isMonitoring = true

    // Create and initialize pipeline
    const initStart = Date.now()
    this.pipeline = createAudioStreamingPipeline(config)

    // Set up event monitoring
    this.setupEventMonitoring()

    try {
      await this.pipeline.initialize()
      this.metrics.initializationTime = Date.now() - initStart
      this.metrics.connectionTime = this.metrics.initializationTime

      console.log(`✅ Pipeline initialized in ${this.metrics.initializationTime}ms`)
    } catch (error) {
      this.recordError('initialization', error as Error)
      throw error
    }
  }

  /**
   * Set up event monitoring for performance tracking
   */
  private setupEventMonitoring(): void {
    if (!this.pipeline) return

    this.pipeline.on('chunkProcessed', data => {
      this.recordChunkProcessed(data.size, data.latency)
    })

    this.pipeline.on('error', error => {
      this.recordError('processing', error)
    })

    this.pipeline.on('streamingStarted', () => {
      console.log('📊 Streaming started - performance monitoring active')
    })

    this.pipeline.on('streamingStopped', () => {
      console.log('📊 Streaming stopped - calculating final metrics')
      this.calculateFinalMetrics()
    })
  }

  /**
   * Record chunk processing metrics
   */
  private recordChunkProcessed(size: number, latency: number): void {
    this.chunkLatencies.push(latency)
    this.metrics.totalChunksProcessed++
    this.metrics.totalBytesProcessed += size

    // Update latency metrics
    this.metrics.averageChunkLatency =
      this.chunkLatencies.reduce((a, b) => a + b, 0) / this.chunkLatencies.length
    this.metrics.maxChunkLatency = Math.max(this.metrics.maxChunkLatency, latency)
    this.metrics.minChunkLatency = Math.min(this.metrics.minChunkLatency, latency)

    // Update throughput metrics
    const elapsedSeconds = (Date.now() - this.startTime) / 1000
    this.metrics.chunksPerSecond = this.metrics.totalChunksProcessed / elapsedSeconds
    this.metrics.bytesPerSecond = this.metrics.totalBytesProcessed / elapsedSeconds

    // Update memory metrics
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage()
      this.metrics.memoryUsage = {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      }
    }
  }

  /**
   * Record error metrics
   */
  private recordError(type: string, error: Error): void {
    this.errors.push({
      type,
      message: error.message,
      timestamp: Date.now()
    })

    this.metrics.totalErrors++
    this.metrics.errorTypes[type] = (this.metrics.errorTypes[type] || 0) + 1
    this.metrics.errorRate =
      (this.metrics.totalErrors / Math.max(this.metrics.totalChunksProcessed, 1)) * 100
  }

  /**
   * Calculate final metrics
   */
  private calculateFinalMetrics(): void {
    if (this.metrics.minChunkLatency === Infinity) {
      this.metrics.minChunkLatency = 0
    }

    // Add any final calculations here
    console.log('📈 Final metrics calculated')
  }

  /**
   * Run performance test
   */
  async runPerformanceTest(
    config: AudioPipelineConfig,
    durationMs: number = 30000
  ): Promise<PerformanceMetrics> {
    console.log(`🚀 Running ${durationMs / 1000}s performance test...`)

    await this.startMonitoring(config)

    if (!this.pipeline) {
      throw new Error('Pipeline not initialized')
    }

    try {
      // Start streaming
      await this.pipeline.startStreaming()

      // Run for specified duration
      await new Promise(resolve => setTimeout(resolve, durationMs))

      // Stop streaming
      await this.pipeline.stopStreaming()

      // Analyze results
      const analysis = this.analyzePerformance()
      console.log(this.generateReport())

      return this.metrics
    } finally {
      await this.cleanup()
    }
  }

  /**
   * Analyze performance against thresholds
   */
  analyzePerformance(): {
    passed: boolean
    issues: string[]
    recommendations: string[]
  } {
    const issues: string[] = []
    const recommendations: string[] = []

    // Check latency
    if (this.metrics.averageChunkLatency > this.thresholds.maxAverageLatency) {
      issues.push(
        `High average latency: ${this.metrics.averageChunkLatency.toFixed(2)}ms (threshold: ${this.thresholds.maxAverageLatency}ms)`
      )
      recommendations.push('Consider reducing buffer size or enabling more aggressive optimization')
    }

    // Check error rate
    if (this.metrics.errorRate > this.thresholds.maxErrorRate) {
      issues.push(
        `High error rate: ${this.metrics.errorRate.toFixed(2)}% (threshold: ${this.thresholds.maxErrorRate}%)`
      )
      recommendations.push('Investigate error sources and improve error handling')
    }

    // Check throughput
    if (this.metrics.bytesPerSecond < this.thresholds.minThroughput) {
      issues.push(
        `Low throughput: ${(this.metrics.bytesPerSecond / 1024).toFixed(2)} KB/s (threshold: ${this.thresholds.minThroughput / 1024} KB/s)`
      )
      recommendations.push('Check network connectivity or increase buffer size')
    }

    // Check memory usage
    if (this.metrics.memoryUsage.heapUsed > this.thresholds.maxMemoryUsage) {
      issues.push(
        `High memory usage: ${(this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB (threshold: ${this.thresholds.maxMemoryUsage / 1024 / 1024} MB)`
      )
      recommendations.push(
        'Optimize buffer management or implement more aggressive garbage collection'
      )
    }

    // Check initialization time
    if (this.metrics.initializationTime > this.thresholds.maxInitTime) {
      issues.push(
        `Slow initialization: ${this.metrics.initializationTime}ms (threshold: ${this.thresholds.maxInitTime}ms)`
      )
      recommendations.push('Optimize service initialization or use lazy loading')
    }

    return {
      passed: issues.length === 0,
      issues,
      recommendations
    }
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const analysis = this.analyzePerformance()
    const elapsed = (Date.now() - this.startTime) / 1000

    return `
=== Audio Streaming Performance Report ===
🕐 Test Duration: ${elapsed.toFixed(2)}s
🚀 Initialization: ${this.metrics.initializationTime}ms

📊 Processing Metrics:
  • Total Chunks: ${this.metrics.totalChunksProcessed}
  • Total Bytes: ${(this.metrics.totalBytesProcessed / 1024).toFixed(2)} KB
  • Chunks/sec: ${this.metrics.chunksPerSecond.toFixed(2)}
  • Throughput: ${(this.metrics.bytesPerSecond / 1024).toFixed(2)} KB/s

⏱️ Latency Metrics:
  • Average: ${this.metrics.averageChunkLatency.toFixed(2)}ms
  • Maximum: ${this.metrics.maxChunkLatency.toFixed(2)}ms
  • Minimum: ${this.metrics.minChunkLatency.toFixed(2)}ms

🧠 Memory Usage:
  • Heap Used: ${(this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
  • Heap Total: ${(this.metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
  • RSS: ${(this.metrics.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB

❌ Error Metrics:
  • Error Rate: ${this.metrics.errorRate.toFixed(2)}%
  • Total Errors: ${this.metrics.totalErrors}
  • Error Types: ${JSON.stringify(this.metrics.errorTypes)}

📈 Performance Analysis:
${analysis.passed ? '✅ All thresholds passed!' : '⚠️ Performance issues detected:'}
${analysis.issues.map(issue => `  • ${issue}`).join('\n')}

💡 Recommendations:
${analysis.recommendations.map(rec => `  • ${rec}`).join('\n')}
`
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return {...this.metrics}
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.isMonitoring = false
    if (this.pipeline) {
      await this.pipeline.cleanup()
      this.pipeline = null
    }
  }
}

/**
 * Run comprehensive performance optimization test
 */
export async function runOptimizationSuite(): Promise<void> {
  console.log('🎯 Audio Streaming Performance Optimization Suite')
  console.log('================================================')

  const optimizer = new AudioStreamingOptimizer()

  // Test different configurations
  const configs = [
    {
      name: 'Low Latency',
      config: optimizer.createOptimizedConfig({
        websocket: {
          apiKey: 'test-key',
          model: 'gemini-live-2.5-flash-preview',
          enableReconnect: true
        },
        processing: {bufferSize: 2048, enableWorkers: true, enableVAD: true, vadThreshold: 0.01}
      })
    },
    {
      name: 'High Quality',
      config: optimizer.createOptimizedConfig({
        websocket: {
          apiKey: 'test-key',
          model: 'gemini-live-2.5-flash-preview',
          enableReconnect: true
        },
        audio: {sampleRate: 22050, channels: 1, bitDepth: 16},
        processing: {bufferSize: 8192, enableWorkers: true, enableVAD: true, vadThreshold: 0.01}
      })
    },
    {
      name: 'Balanced',
      config: optimizer.createOptimizedConfig({
        websocket: {
          apiKey: 'test-key',
          model: 'gemini-live-2.5-flash-preview',
          enableReconnect: true
        },
        processing: {bufferSize: 4096, enableWorkers: true, enableVAD: true, vadThreshold: 0.01}
      })
    }
  ]

  const results: Array<{name: string; metrics: PerformanceMetrics}> = []

  for (const {name, config} of configs) {
    console.log(`\n🧪 Testing ${name} configuration...`)

    try {
      const metrics = await optimizer.runPerformanceTest(config, 10000) // 10 second test
      results.push({name, metrics})
    } catch (error) {
      console.error(`❌ ${name} configuration failed:`, error)
    }
  }

  // Compare results
  console.log('\n📊 Configuration Comparison:')
  console.log('============================')

  results.forEach(({name, metrics}) => {
    console.log(`\n${name}:`)
    console.log(`  Latency: ${metrics.averageChunkLatency.toFixed(2)}ms`)
    console.log(`  Throughput: ${(metrics.bytesPerSecond / 1024).toFixed(2)} KB/s`)
    console.log(`  Error Rate: ${metrics.errorRate.toFixed(2)}%`)
    console.log(`  Memory: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`)
  })

  // Find best configuration
  const best = results.reduce((best, current) => {
    const bestScore = best.metrics.averageChunkLatency + best.metrics.errorRate * 10
    const currentScore = current.metrics.averageChunkLatency + current.metrics.errorRate * 10
    return currentScore < bestScore ? current : best
  })

  console.log(`\n🏆 Best configuration: ${best.name}`)
  console.log('✨ Optimization complete!')
}

// Export for CLI usage
if (typeof window === 'undefined' && require.main === module) {
  const command = process.argv[2]

  switch (command) {
    case 'optimize':
      runOptimizationSuite().catch(console.error)
      break
    default:
      console.log('Usage: node audio-performance-optimizer.js optimize')
  }
}
