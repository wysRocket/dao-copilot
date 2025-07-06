/**
 * Prometheus Metrics Configuration
 * 
 * Defines all metrics for WebSocket connections, transcription performance, and system health
 */

import { 
  register,
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Summary
} from 'prom-client'
import { logger } from '../logging'

// Enable default system metrics collection
collectDefaultMetrics({
  prefix: 'dao_copilot_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
})

/**
 * WebSocket Connection Metrics
 */

// Active WebSocket connections
export const wsActiveConnections = new Gauge({
  name: 'dao_copilot_websocket_active_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['connection_type', 'environment'] as const
})

// Total connection attempts
export const wsConnectionAttempts = new Counter({
  name: 'dao_copilot_websocket_connection_attempts_total',
  help: 'Total number of WebSocket connection attempts',
  labelNames: ['result', 'environment'] as const
})

// Connection duration
export const wsConnectionDuration = new Histogram({
  name: 'dao_copilot_websocket_connection_duration_seconds',
  help: 'Duration of WebSocket connections in seconds',
  labelNames: ['connection_type', 'environment'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300, 600, 1800, 3600]
})

// Connection latency
export const wsConnectionLatency = new Histogram({
  name: 'dao_copilot_websocket_connection_latency_seconds',
  help: 'WebSocket connection establishment latency in seconds',
  labelNames: ['connection_type', 'environment'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
})

// Reconnection attempts
export const wsReconnectionAttempts = new Counter({
  name: 'dao_copilot_websocket_reconnection_attempts_total',
  help: 'Total number of WebSocket reconnection attempts',
  labelNames: ['result', 'environment'] as const
})

/**
 * Message Flow Metrics
 */

// Messages sent
export const wsMessagesSent = new Counter({
  name: 'dao_copilot_websocket_messages_sent_total',
  help: 'Total number of messages sent over WebSocket',
  labelNames: ['message_type', 'priority', 'environment'] as const
})

// Messages received
export const wsMessagesReceived = new Counter({
  name: 'dao_copilot_websocket_messages_received_total',
  help: 'Total number of messages received over WebSocket',
  labelNames: ['message_type', 'environment'] as const
})

// Message queue size
export const wsMessageQueueSize = new Gauge({
  name: 'dao_copilot_websocket_message_queue_size',
  help: 'Current size of the WebSocket message queue',
  labelNames: ['priority', 'connection_id', 'environment'] as const
})

// Message processing time
export const wsMessageProcessingTime = new Histogram({
  name: 'dao_copilot_websocket_message_processing_seconds',
  help: 'Time taken to process WebSocket messages in seconds',
  labelNames: ['message_type', 'operation', 'environment'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
})

// Message size distribution
export const wsMessageSize = new Histogram({
  name: 'dao_copilot_websocket_message_size_bytes',
  help: 'Size of WebSocket messages in bytes',
  labelNames: ['message_type', 'direction', 'environment'] as const,
  buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000]
})

// Message failures
export const wsMessageFailures = new Counter({
  name: 'dao_copilot_websocket_message_failures_total',
  help: 'Total number of failed WebSocket message operations',
  labelNames: ['message_type', 'error_type', 'retry_count', 'environment'] as const
})

/**
 * Transcription Performance Metrics
 */

// Transcription requests
export const transcriptionRequests = new Counter({
  name: 'dao_copilot_transcription_requests_total',
  help: 'Total number of transcription requests',
  labelNames: ['mode', 'result', 'environment'] as const
})

// Transcription latency
export const transcriptionLatency = new Histogram({
  name: 'dao_copilot_transcription_latency_seconds',
  help: 'Transcription processing latency in seconds',
  labelNames: ['mode', 'audio_format', 'environment'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60]
})

// Audio processing metrics
export const audioProcessingTime = new Histogram({
  name: 'dao_copilot_audio_processing_seconds',
  help: 'Audio processing time in seconds',
  labelNames: ['operation', 'format', 'environment'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
})

// Audio chunk size
export const audioChunkSize = new Histogram({
  name: 'dao_copilot_audio_chunk_size_bytes',
  help: 'Audio chunk size in bytes',
  labelNames: ['format', 'sample_rate', 'environment'] as const,
  buckets: [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072]
})

// Transcription accuracy (if available)
export const transcriptionAccuracy = new Gauge({
  name: 'dao_copilot_transcription_accuracy_score',
  help: 'Transcription accuracy score (0-1)',
  labelNames: ['mode', 'environment'] as const
})

/**
 * Error and Health Metrics
 */

// Error rates by category
export const errorsByCategory = new Counter({
  name: 'dao_copilot_errors_total',
  help: 'Total number of errors by category',
  labelNames: ['category', 'severity', 'component', 'environment'] as const
})

// Circuit breaker state
export const circuitBreakerState = new Gauge({
  name: 'dao_copilot_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service', 'environment'] as const
})

// Health check results
export const healthCheckResults = new Gauge({
  name: 'dao_copilot_health_check_score',
  help: 'Health check score (0-100)',
  labelNames: ['component', 'check_type', 'environment'] as const
})

// Service uptime
export const serviceUptime = new Gauge({
  name: 'dao_copilot_service_uptime_seconds',
  help: 'Service uptime in seconds',
  labelNames: ['component', 'environment'] as const
})

/**
 * Performance Metrics
 */

// Memory usage
export const memoryUsage = new Gauge({
  name: 'dao_copilot_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type', 'environment'] as const
})

// CPU usage
export const cpuUsage = new Gauge({
  name: 'dao_copilot_cpu_usage_percent',
  help: 'CPU usage percentage',
  labelNames: ['environment'] as const
})

// Event loop lag
export const eventLoopLag = new Histogram({
  name: 'dao_copilot_event_loop_lag_seconds',
  help: 'Event loop lag in seconds',
  labelNames: ['environment'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
})

/**
 * Business Logic Metrics
 */

// API rate limiting
export const apiRateLimit = new Gauge({
  name: 'dao_copilot_api_rate_limit_remaining',
  help: 'Remaining API rate limit',
  labelNames: ['provider', 'endpoint', 'environment'] as const
})

// Session metrics
export const sessionMetrics = new Summary({
  name: 'dao_copilot_session_duration_seconds',
  help: 'WebSocket session duration in seconds',
  labelNames: ['session_type', 'environment'] as const,
  percentiles: [0.5, 0.9, 0.95, 0.99]
})

// Feature usage
export const featureUsage = new Counter({
  name: 'dao_copilot_feature_usage_total',
  help: 'Total feature usage count',
  labelNames: ['feature', 'user_type', 'environment'] as const
})

/**
 * Configuration and utility functions
 */

// Environment detection
const getEnvironment = (): string => {
  return process.env.NODE_ENV || 'development'
}

// Common labels
export const commonLabels = {
  environment: getEnvironment()
}

/**
 * Initialize metrics collection
 */
export function initializeMetrics(): void {
  try {
    // Set initial values for gauges
    wsActiveConnections.set(commonLabels, 0)
    circuitBreakerState.set({ service: 'websocket', ...commonLabels }, 0)
    
    // Start system metrics collection
    const startTime = Date.now()
    serviceUptime.set({ component: 'websocket-service', ...commonLabels }, 0)
    
    // Update service uptime every 30 seconds
    setInterval(() => {
      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000)
      serviceUptime.set({ component: 'websocket-service', ...commonLabels }, uptimeSeconds)
    }, 30000)

    // Monitor memory usage every 10 seconds
    setInterval(() => {
      const memUsage = process.memoryUsage()
      memoryUsage.set({ type: 'rss', ...commonLabels }, memUsage.rss)
      memoryUsage.set({ type: 'heapUsed', ...commonLabels }, memUsage.heapUsed)
      memoryUsage.set({ type: 'heapTotal', ...commonLabels }, memUsage.heapTotal)
      memoryUsage.set({ type: 'external', ...commonLabels }, memUsage.external)
    }, 10000)

    logger.info('Prometheus metrics collection initialized successfully', {
      metadata: {
        environment: commonLabels.environment,
        timestamp: Date.now()
      }
    })
  } catch (error) {
    logger.error('Failed to initialize metrics collection', error as Error, {
      metadata: {
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    })
    throw error
  }
}

/**
 * Get metrics registry for HTTP endpoint
 */
export function getMetricsRegistry() {
  return register
}

/**
 * Clear all metrics (useful for testing)
 */
export function clearMetrics(): void {
  register.clear()
  logger.debug('All metrics cleared')
}

/**
 * Get current metrics as text (Prometheus format)
 */
export async function getMetricsText(): Promise<string> {
  return register.metrics()
}

/**
 * Helper function to track operation duration
 */
export function trackDuration<T>(
  histogram: Histogram<string>,
  labels: Record<string, string | number>,
  operation: () => Promise<T>
): Promise<T> {
  const timer = histogram.startTimer(labels)
  return operation().finally(() => {
    timer()
  })
}

/**
 * Helper function to increment counter with error handling
 */
export function safeIncrement(
  counter: Counter<string>,
  labels: Record<string, string | number>,
  value: number = 1
): void {
  try {
    counter.inc(labels, value)
  } catch (error) {
    logger.warn('Failed to increment metric counter', {
      metadata: {
        labels,
        value,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}

/**
 * Helper function to set gauge value with error handling
 */
export function safeSetGauge(
  gauge: Gauge<string>,
  labels: Record<string, string | number>,
  value: number
): void {
  try {
    gauge.set(labels, value)
  } catch (error) {
    logger.warn('Failed to set gauge metric', {
      metadata: {
        labels,
        value,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}

/**
 * Record histogram observation with error handling
 */
export function safeObserve(
  histogram: Histogram<string>,
  labels: Record<string, string | number>,
  value: number
): void {
  try {
    histogram.observe(labels, value)
  } catch (error) {
    logger.warn('Failed to observe histogram metric', {
      metadata: {
        labels,
        value,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}

/**
 * Update system-level metrics
 */
export function updateSystemMetrics(): void {
  try {
    // Update memory usage
    const memUsage = process.memoryUsage()
    memoryUsage.set({ type: 'rss', ...commonLabels }, memUsage.rss)
    memoryUsage.set({ type: 'heapUsed', ...commonLabels }, memUsage.heapUsed)
    memoryUsage.set({ type: 'heapTotal', ...commonLabels }, memUsage.heapTotal)
    memoryUsage.set({ type: 'external', ...commonLabels }, memUsage.external)

    // Update event loop lag (simplified)
    const start = process.hrtime.bigint()
    setImmediate(() => {
      const delta = Number(process.hrtime.bigint() - start) / 1e6 // Convert to milliseconds
      eventLoopLag.observe(commonLabels, delta / 1000) // Convert to seconds
    })

    logger.debug('System metrics updated', {
      metadata: { memUsage, timestamp: Date.now() }
    })
  } catch (error) {
    logger.error('Failed to update system metrics', error as Error, {
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
    })
  }
}
