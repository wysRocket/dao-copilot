/**
 * Low Latency WebSocket Configuration
 *
 * Optimized configuration values for real-time transcription with minimal delay
 * Based on diagnostic analysis and real-time performance requirements
 */

export interface LowLatencyWebSocketConfig {
  /** Connection timeout optimized for immediate failure detection */
  timeout: number

  /** Reconnection delay minimized for fast recovery */
  reconnectDelay: number

  /** Heartbeat interval optimized to maintain connection without latency */
  heartbeatInterval: number

  /** Message processing batching disabled for immediate updates */
  disableBatching: boolean

  /** Performance optimization flags */
  optimization: {
    /** Disable compression for faster processing */
    disableCompression: boolean

    /** Enable immediate flushing of messages */
    immediateFlush: boolean

    /** Reduce buffer sizes for lower latency */
    reduceBuffering: boolean

    /** Prioritize speed over reliability for real-time use */
    prioritizeSpeed: boolean
  }
}

/**
 * Optimized configuration for low latency WebSocket transcription
 *
 * Values optimized based on Task 28.2 requirements:
 * - Immediate message processing without batching
 * - Minimal timeout for faster error detection
 * - Reduced reconnection delays
 * - Optimized heartbeat intervals
 */
export const LOW_LATENCY_WEBSOCKET_CONFIG: LowLatencyWebSocketConfig = {
  // Reduced from 30000ms to 5000ms for faster timeout detection
  timeout: 5000,

  // Reduced from 1000ms to 100ms for immediate reconnection attempts
  reconnectDelay: 100,

  // Reduced from 30000ms to 15000ms to maintain connection without adding latency
  heartbeatInterval: 15000,

  // Disable message batching for immediate processing
  disableBatching: true,

  optimization: {
    // Disable compression to reduce processing overhead
    disableCompression: true,

    // Enable immediate message flushing
    immediateFlush: true,

    // Reduce buffer sizes to minimize latency
    reduceBuffering: true,

    // Prioritize speed over reliability for real-time transcription
    prioritizeSpeed: true
  }
}

/**
 * Enhanced configuration that merges low latency settings with existing config
 */
export function createLowLatencyConfig(
  baseConfig?: Record<string, unknown>
): Record<string, unknown> {
  const websocketConfig = (baseConfig?.websocket as Record<string, unknown>) || {}
  const audioConfig = (baseConfig?.audio as Record<string, unknown>) || {}
  const performanceConfig = (baseConfig?.performance as Record<string, unknown>) || {}
  const errorHandlingConfig = (baseConfig?.errorHandling as Record<string, unknown>) || {}

  return {
    ...baseConfig,
    websocket: {
      ...websocketConfig,
      // Apply low latency optimizations
      timeout: LOW_LATENCY_WEBSOCKET_CONFIG.timeout,
      reconnectDelay: LOW_LATENCY_WEBSOCKET_CONFIG.reconnectDelay,
      heartbeatInterval: LOW_LATENCY_WEBSOCKET_CONFIG.heartbeatInterval,

      // Optimize reconnection strategy for speed
      maxReconnectAttempts: 10, // More attempts but faster
      exponentialBackoff: false, // Linear backoff for consistent timing

      // Additional low latency optimizations
      binaryType: 'arraybuffer', // Faster binary processing
      compressionDisabled: true // Disable compression
    },
    audio: {
      ...audioConfig,
      // Optimize audio settings for low latency
      inputSampleRate: 16000, // Standard rate
      outputSampleRate: 16000, // Match input to avoid conversion
      encoding: 'linear16', // Fastest encoding
      channels: 1, // Mono for speed
      chunkSize: 2048 // Smaller chunks for lower latency (reduced from 4096)
    },
    performance: {
      ...performanceConfig,
      // Optimize performance settings
      enableMonitoring: true, // Keep monitoring for diagnostics
      bufferSize: 4096, // Reduced buffer size (from 8192)
      maxQueueSize: 50, // Reduced queue size (from 100)
      enableDetailedLogging: false, // Disable detailed logging for speed

      // Low latency specific settings
      immediateProcessing: true,
      disableThrottling: true,
      prioritizeLatency: true
    },
    errorHandling: {
      ...errorHandlingConfig,
      // Optimize error handling for quick recovery
      enableAutoRecovery: true,
      maxRetries: 5, // More retries but faster
      circuitBreaker: {
        failureThreshold: 3, // Faster failure detection (reduced from 5)
        successThreshold: 2, // Faster recovery (reduced from 3)
        timeout: 30000, // Faster circuit breaker reset (reduced from 60000)
        monitoringPeriod: 150000 // Shorter monitoring period (reduced from 300000)
      }
    }
  }
}

/**
 * Apply low latency optimizations to GCP SDK Manager configuration
 */
export function optimizeGCPSDKForLowLatency(
  config?: Record<string, unknown>
): Record<string, unknown> {
  const geminiLiveConfig = (config?.geminiLive as Record<string, unknown>) || {}
  const retryConfig = (config?.retryConfig as Record<string, unknown>) || {}

  return {
    ...config,
    geminiLive: {
      ...geminiLiveConfig,
      // Reduce WebSocket timeout in SDK
      websocketTimeout: LOW_LATENCY_WEBSOCKET_CONFIG.timeout,

      // Enable optimizations
      enableNativeAudio: true, // Use native audio processing for speed
      enableTextMode: true // Enable both modes for flexibility
    },
    retryConfig: {
      ...retryConfig,
      // Optimize retry strategy
      maxRetries: 5,
      retryDelay: LOW_LATENCY_WEBSOCKET_CONFIG.reconnectDelay,
      exponentialBackoff: false // Linear backoff for consistent timing
    }
  }
}

/**
 * Network condition based configuration adjustments
 */
export function adjustConfigForNetworkCondition(
  baseConfig: Record<string, unknown>,
  networkCondition: 'excellent' | 'good' | 'poor' | 'critical'
): Record<string, unknown> {
  const config = {...baseConfig}
  const websocketConfig = (config.websocket as Record<string, unknown>) || {}
  const audioConfig = (config.audio as Record<string, unknown>) || {}

  // Ensure websocket and audio configs exist
  config.websocket = websocketConfig
  config.audio = audioConfig

  switch (networkCondition) {
    case 'excellent':
      // Most aggressive optimizations
      websocketConfig.timeout = 3000
      websocketConfig.reconnectDelay = 50
      audioConfig.chunkSize = 1024 // Smallest chunks
      break

    case 'good':
      // Standard low latency optimizations
      websocketConfig.timeout = LOW_LATENCY_WEBSOCKET_CONFIG.timeout
      websocketConfig.reconnectDelay = LOW_LATENCY_WEBSOCKET_CONFIG.reconnectDelay
      audioConfig.chunkSize = 2048
      break

    case 'poor':
      // More conservative but still optimized
      websocketConfig.timeout = 10000
      websocketConfig.reconnectDelay = 500
      audioConfig.chunkSize = 4096
      websocketConfig.exponentialBackoff = true
      break

    case 'critical':
      // Fallback to more reliable settings
      websocketConfig.timeout = 15000
      websocketConfig.reconnectDelay = 2000
      audioConfig.chunkSize = 8192
      websocketConfig.exponentialBackoff = true
      websocketConfig.maxReconnectAttempts = 3
      break
  }

  return config
}

export default {
  LOW_LATENCY_WEBSOCKET_CONFIG,
  createLowLatencyConfig,
  optimizeGCPSDKForLowLatency,
  adjustConfigForNetworkCondition
}
