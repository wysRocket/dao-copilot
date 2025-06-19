/**
 * Factory and utilities for Gemini Live Integration Service
 * Provides convenient ways to create and configure the integration service
 */

import GeminiLiveIntegrationService, {
  TranscriptionMode,
  type IntegrationConfig,
  type IntegrationState
} from './gemini-live-integration'
import {ReconnectionStrategy} from './gemini-reconnection-manager'
import type {ConnectionMetrics} from './gemini-reconnection-manager'
import {logger} from './gemini-logger'

/**
 * Preset configurations for different use cases
 */
export const IntegrationPresets = {
  /**
   * Development preset - optimized for testing and development
   */
  development: {
    mode: TranscriptionMode.HYBRID,
    fallbackToBatch: true,
    realTimeThreshold: 500,
    batchFallbackDelay: 2000,
    audioBufferSize: 1024,
    enableAudioStreaming: true,
    heartbeatInterval: 15000,
    connectionTimeout: 5000,
    reconnectionStrategy: ReconnectionStrategy.EXPONENTIAL,
    reconnectionConfig: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      jitterEnabled: true
    }
  } as Partial<IntegrationConfig>,

  /**
   * Production preset - optimized for reliability and performance
   */
  production: {
    mode: TranscriptionMode.HYBRID,
    fallbackToBatch: true,
    realTimeThreshold: 1000,
    batchFallbackDelay: 5000,
    audioBufferSize: 4096,
    enableAudioStreaming: true,
    heartbeatInterval: 30000,
    connectionTimeout: 10000,
    reconnectionStrategy: ReconnectionStrategy.EXPONENTIAL,
    reconnectionConfig: {
      maxAttempts: 10,
      baseDelay: 1000,
      maxDelay: 30000,
      jitterEnabled: true,
      qualityThreshold: 0.8
    }
  } as Partial<IntegrationConfig>,

  /**
   * Real-time preset - optimized for low latency
   */
  realtime: {
    mode: TranscriptionMode.WEBSOCKET,
    fallbackToBatch: false,
    realTimeThreshold: 100,
    batchFallbackDelay: 1000,
    audioBufferSize: 512,
    enableAudioStreaming: true,
    heartbeatInterval: 10000,
    connectionTimeout: 3000,
    reconnectionStrategy: ReconnectionStrategy.LINEAR,
    reconnectionConfig: {
      maxAttempts: 5,
      baseDelay: 500,
      maxDelay: 5000,
      jitterEnabled: false
    }
  } as Partial<IntegrationConfig>,

  /**
   * Batch-only preset - traditional batch processing
   */
  batchOnly: {
    mode: TranscriptionMode.BATCH,
    fallbackToBatch: false,
    enableAudioStreaming: false,
    audioBufferSize: 8192
  } as Partial<IntegrationConfig>
}

/**
 * Factory class for creating configured integration services
 */
export class GeminiLiveIntegrationFactory {
  /**
   * Create integration service with development preset
   */
  static createDevelopment(
    apiKey: string,
    overrides?: Partial<IntegrationConfig>
  ): GeminiLiveIntegrationService {
    const config = {
      ...IntegrationPresets.development,
      apiKey,
      ...overrides
    }

    logger.info('Creating development integration service', {
      mode: config.mode,
      fallbackEnabled: config.fallbackToBatch
    })

    return new GeminiLiveIntegrationService(config)
  }

  /**
   * Create integration service with production preset
   */
  static createProduction(
    apiKey: string,
    overrides?: Partial<IntegrationConfig>
  ): GeminiLiveIntegrationService {
    const config = {
      ...IntegrationPresets.production,
      apiKey,
      ...overrides
    }

    logger.info('Creating production integration service', {
      mode: config.mode,
      fallbackEnabled: config.fallbackToBatch
    })

    return new GeminiLiveIntegrationService(config)
  }

  /**
   * Create integration service with real-time preset
   */
  static createRealtime(
    apiKey: string,
    overrides?: Partial<IntegrationConfig>
  ): GeminiLiveIntegrationService {
    const config = {
      ...IntegrationPresets.realtime,
      apiKey,
      ...overrides
    }

    logger.info('Creating real-time integration service', {
      mode: config.mode,
      streamingEnabled: config.enableAudioStreaming
    })

    return new GeminiLiveIntegrationService(config)
  }

  /**
   * Create integration service with batch-only preset
   */
  static createBatchOnly(
    apiKey: string,
    overrides?: Partial<IntegrationConfig>
  ): GeminiLiveIntegrationService {
    const config = {
      ...IntegrationPresets.batchOnly,
      apiKey,
      ...overrides
    }

    logger.info('Creating batch-only integration service', {
      mode: config.mode
    })

    return new GeminiLiveIntegrationService(config)
  }

  /**
   * Create integration service from environment variables
   */
  static createFromEnvironment(
    preset: keyof typeof IntegrationPresets = 'production'
  ): GeminiLiveIntegrationService {
    const apiKey =
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.VITE_GOOGLE_API_KEY

    if (!apiKey) {
      throw new Error(
        'API key not found in environment variables. Please set GOOGLE_API_KEY, GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or VITE_GOOGLE_API_KEY'
      )
    }

    const envOverrides: Partial<IntegrationConfig> = {}

    // Parse environment-specific overrides
    if (process.env.GEMINI_TRANSCRIPTION_MODE) {
      const mode = process.env.GEMINI_TRANSCRIPTION_MODE.toLowerCase()
      if (Object.values(TranscriptionMode).includes(mode as TranscriptionMode)) {
        envOverrides.mode = mode as TranscriptionMode
      }
    }

    if (process.env.GEMINI_ENABLE_FALLBACK === 'false') {
      envOverrides.fallbackToBatch = false
    }

    if (process.env.GEMINI_AUDIO_BUFFER_SIZE) {
      const bufferSize = parseInt(process.env.GEMINI_AUDIO_BUFFER_SIZE, 10)
      if (!isNaN(bufferSize)) {
        envOverrides.audioBufferSize = bufferSize
      }
    }

    if (process.env.GEMINI_HEARTBEAT_INTERVAL) {
      const heartbeat = parseInt(process.env.GEMINI_HEARTBEAT_INTERVAL, 10)
      if (!isNaN(heartbeat)) {
        envOverrides.heartbeatInterval = heartbeat
      }
    }

    const config = {
      ...IntegrationPresets[preset],
      apiKey,
      ...envOverrides
    }

    logger.info('Creating integration service from environment', {
      preset,
      mode: config.mode,
      apiKeyLength: apiKey.length
    })

    return new GeminiLiveIntegrationService(config)
  }

  /**
   * Create integration service with custom configuration
   */
  static createCustom(config: IntegrationConfig): GeminiLiveIntegrationService {
    logger.info('Creating custom integration service', {
      mode: config.mode,
      hasApiKey: !!config.apiKey
    })

    return new GeminiLiveIntegrationService(config)
  }
}

/**
 * Utility functions for integration service management
 */
export class IntegrationUtils {
  /**
   * Monitor integration service state and log changes
   */
  static monitorState(
    service: GeminiLiveIntegrationService,
    logInterval: number = 10000
  ): () => void {
    let lastState: IntegrationState | null = null

    const monitor = () => {
      const currentState = service.getState()

      if (!lastState || this.hasStateChanged(lastState, currentState)) {
        logger.info('Integration service state update', {
          mode: currentState.mode,
          connectionState: currentState.connectionState,
          isStreaming: currentState.isStreaming,
          isProcessing: currentState.isProcessing,
          bytesStreamed: currentState.bytesStreamed,
          messagesReceived: currentState.messagesReceived,
          errors: currentState.errors
        })
        lastState = currentState
      }
    }

    const intervalId = setInterval(monitor, logInterval)
    monitor() // Initial log

    // Return cleanup function
    return () => {
      clearInterval(intervalId)
    }
  }

  /**
   * Check if integration state has significantly changed
   */
  private static hasStateChanged(oldState: IntegrationState, newState: IntegrationState): boolean {
    return (
      oldState.mode !== newState.mode ||
      oldState.connectionState !== newState.connectionState ||
      oldState.isStreaming !== newState.isStreaming ||
      oldState.isProcessing !== newState.isProcessing ||
      oldState.errors !== newState.errors ||
      Math.abs(oldState.bytesStreamed - newState.bytesStreamed) > 1024 ||
      Math.abs(oldState.messagesReceived - newState.messagesReceived) > 5
    )
  }

  /**
   * Get comprehensive health status of integration service
   */
  static getHealthStatus(service: GeminiLiveIntegrationService): {
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: Record<string, unknown>
  } {
    const state = service.getState()
    const metrics = service.getMetrics()

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    const details: Record<string, unknown> = {
      mode: state.mode,
      connectionState: state.connectionState,
      isStreaming: state.isStreaming,
      isProcessing: state.isProcessing,
      bytesStreamed: state.bytesStreamed,
      messagesReceived: state.messagesReceived,
      errors: state.errors
    }

    // Check for unhealthy conditions
    if (state.errors > 10) {
      status = 'unhealthy'
      details.reason = 'High error count'
    } else if (state.errors > 3) {
      status = 'degraded'
      details.reason = 'Moderate error count'
    }

    // Add connection metrics if available
    if ('connectionMetrics' in metrics) {
      const connMetrics = metrics.connectionMetrics as ConnectionMetrics
      details.connectionQuality = connMetrics.connectionQuality
      details.successfulConnections = connMetrics.successfulConnections
      details.failedConnections = connMetrics.failedConnections

      if (
        connMetrics.connectionQuality === 'unstable' ||
        connMetrics.connectionQuality === 'poor'
      ) {
        if (status === 'healthy') status = 'degraded'
        details.connectionIssue = `Connection quality is ${connMetrics.connectionQuality}`
      }
    }

    return {status, details}
  }

  /**
   * Create a summary report of integration service performance
   */
  static createPerformanceReport(service: GeminiLiveIntegrationService): string {
    const state = service.getState()
    const metrics = service.getMetrics()
    const health = this.getHealthStatus(service)

    const report = `
=== Gemini Live Integration Service Performance Report ===

Health Status: ${health.status.toUpperCase()}
Mode: ${state.mode}
Connection State: ${state.connectionState}

Audio Streaming:
- Streaming Active: ${state.isStreaming}
- Bytes Streamed: ${state.bytesStreamed.toLocaleString()}
- Processing Active: ${state.isProcessing}

Communication:
- Messages Received: ${state.messagesReceived}
- Error Count: ${state.errors}

${
  'connectionMetrics' in metrics
    ? `
Connection Quality:
- Quality: ${(metrics.connectionMetrics as ConnectionMetrics).connectionQuality}
- Successful Connections: ${(metrics.connectionMetrics as ConnectionMetrics).successfulConnections}
- Failed Connections: ${(metrics.connectionMetrics as ConnectionMetrics).failedConnections}
- Average Duration: ${Math.round((metrics.connectionMetrics as ConnectionMetrics).averageConnectionDuration / 1000)}s
`
    : ''
}

Last Updated: ${new Date().toISOString()}
`

    return report
  }
}

/**
 * Singleton instance manager for global use
 */
export class IntegrationSingleton {
  private static instance: GeminiLiveIntegrationService | null = null
  private static config: IntegrationConfig | null = null

  /**
   * Initialize the singleton instance
   */
  static initialize(config: IntegrationConfig): GeminiLiveIntegrationService {
    if (this.instance) {
      logger.warn('Integration singleton already initialized, destroying previous instance')
      this.instance.destroy()
    }

    this.config = config
    this.instance = new GeminiLiveIntegrationService(config)

    logger.info('Integration singleton initialized')
    return this.instance
  }

  /**
   * Get the singleton instance (must be initialized first)
   */
  static getInstance(): GeminiLiveIntegrationService {
    if (!this.instance) {
      throw new Error(
        'Integration singleton not initialized. Call IntegrationSingleton.initialize() first.'
      )
    }
    return this.instance
  }

  /**
   * Check if singleton is initialized
   */
  static isInitialized(): boolean {
    return this.instance !== null
  }

  /**
   * Destroy the singleton instance
   */
  static async destroy(): Promise<void> {
    if (this.instance) {
      await this.instance.destroy()
      this.instance = null
      this.config = null
      logger.info('Integration singleton destroyed')
    }
  }

  /**
   * Get the current configuration
   */
  static getConfig(): IntegrationConfig | null {
    return this.config
  }
}

export default {
  GeminiLiveIntegrationFactory,
  IntegrationUtils,
  IntegrationSingleton,
  IntegrationPresets
}
