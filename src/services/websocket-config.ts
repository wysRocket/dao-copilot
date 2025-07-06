/**
 * WebSocket Configuration Management
 *
 * Centralized configuration management for WebSocket connections
 * with environment-specific settings and validation.
 */

import {logger} from './gemini-logger'

export interface WebSocketConfig {
  // Connection settings
  endpoint: string
  model: string
  apiKey: string

  // Timeout settings
  connectionTimeout: number
  handshakeTimeout: number
  messageTimeout: number
  pingInterval: number
  pongTimeout: number

  // Retry and reconnection settings
  maxRetryAttempts: number
  initialRetryDelay: number
  maxRetryDelay: number
  retryBackoffMultiplier: number
  reconnectOnClose: boolean

  // Performance settings
  maxQueueSize: number
  queueCheckInterval: number
  heartbeatInterval: number

  // Audio streaming settings
  audioConfig: {
    sampleRate: number
    channels: number
    bitsPerSample: number
    encoding: string
    chunkSize: number
  }

  // Security settings
  validateSSL: boolean
  allowSelfSignedCerts: boolean

  // Logging and monitoring
  enableDetailedLogging: boolean
  logSensitiveData: boolean
  enableMetrics: boolean
  metricsRetentionPeriod: number
}

export interface EnvironmentConfig {
  development: Partial<WebSocketConfig>
  production: Partial<WebSocketConfig>
  test: Partial<WebSocketConfig>
}

/**
 * Default WebSocket configuration
 */
const DEFAULT_CONFIG: WebSocketConfig = {
  // Connection settings
  endpoint:
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.LiveStreaming',
  model: 'gemini-live-2.5-flash-preview',
  apiKey: '',

  // Timeout settings (in milliseconds)
  connectionTimeout: 10000, // 10 seconds
  handshakeTimeout: 5000, // 5 seconds
  messageTimeout: 30000, // 30 seconds
  pingInterval: 30000, // 30 seconds
  pongTimeout: 5000, // 5 seconds

  // Retry and reconnection settings
  maxRetryAttempts: 5,
  initialRetryDelay: 1000, // 1 second
  maxRetryDelay: 30000, // 30 seconds
  retryBackoffMultiplier: 2,
  reconnectOnClose: true,

  // Performance settings
  maxQueueSize: 100,
  queueCheckInterval: 100, // 100ms
  heartbeatInterval: 30000, // 30 seconds

  // Audio streaming settings
  audioConfig: {
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    encoding: 'linear16',
    chunkSize: 1024
  },

  // Security settings
  validateSSL: true,
  allowSelfSignedCerts: false,

  // Logging and monitoring
  enableDetailedLogging: false,
  logSensitiveData: false,
  enableMetrics: true,
  metricsRetentionPeriod: 86400000 // 24 hours in milliseconds
}

/**
 * Environment-specific configuration overrides
 */
const ENVIRONMENT_CONFIGS: EnvironmentConfig = {
  development: {
    enableDetailedLogging: true,
    logSensitiveData: false, // Still keep sensitive data protected
    connectionTimeout: 15000,
    maxRetryAttempts: 3,
    validateSSL: false, // Allow local development
    allowSelfSignedCerts: true
  },

  production: {
    enableDetailedLogging: false,
    logSensitiveData: false,
    connectionTimeout: 8000,
    maxRetryAttempts: 5,
    validateSSL: true,
    allowSelfSignedCerts: false,
    metricsRetentionPeriod: 604800000 // 7 days in production
  },

  test: {
    enableDetailedLogging: true,
    logSensitiveData: false,
    connectionTimeout: 5000,
    handshakeTimeout: 2000,
    maxRetryAttempts: 2,
    initialRetryDelay: 100,
    maxRetryDelay: 1000,
    validateSSL: false,
    allowSelfSignedCerts: true,
    heartbeatInterval: 5000,
    metricsRetentionPeriod: 3600000 // 1 hour for tests
  }
}

/**
 * WebSocket Configuration Manager
 */
export class WebSocketConfigManager {
  private config: WebSocketConfig
  private environment: string

  constructor(environment?: string) {
    this.environment = environment || this.detectEnvironment()
    this.config = this.buildConfig()

    logger.info('WebSocket configuration initialized', {
      environment: this.environment,
      model: this.config.model,
      endpoint: this.config.endpoint.substring(0, 50) + '...',
      hasApiKey: !!this.config.apiKey
    })
  }

  /**
   * Get the current configuration
   */
  getConfig(): WebSocketConfig {
    return {...this.config}
  }

  /**
   * Update configuration with partial settings
   */
  updateConfig(updates: Partial<WebSocketConfig>): void {
    this.config = {...this.config, ...updates}

    this.validateConfig()

    logger.info('WebSocket configuration updated', {
      updatedFields: Object.keys(updates),
      environment: this.environment
    })
  }

  /**
   * Get configuration for a specific property
   */
  get<K extends keyof WebSocketConfig>(key: K): WebSocketConfig[K] {
    return this.config[key]
  }

  /**
   * Set configuration for a specific property
   */
  set<K extends keyof WebSocketConfig>(key: K, value: WebSocketConfig[K]): void {
    this.config[key] = value
    this.validateConfig()

    logger.debug('Configuration property updated', {
      property: key,
      environment: this.environment
    })
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = this.buildConfig()
    logger.info('WebSocket configuration reset to defaults', {
      environment: this.environment
    })
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig(): Partial<WebSocketConfig> {
    return ENVIRONMENT_CONFIGS[this.environment as keyof EnvironmentConfig] || {}
  }

  /**
   * Validate current configuration
   */
  private validateConfig(): void {
    const errors: string[] = []

    // Validate required fields
    if (!this.config.endpoint) {
      errors.push('WebSocket endpoint is required')
    }

    if (!this.config.model) {
      errors.push('Model name is required')
    }

    if (!this.config.apiKey) {
      errors.push('API key is required')
    }

    // Validate timeout values
    if (this.config.connectionTimeout < 1000) {
      errors.push('Connection timeout must be at least 1000ms')
    }

    if (this.config.handshakeTimeout < 500) {
      errors.push('Handshake timeout must be at least 500ms')
    }

    if (this.config.messageTimeout < 1000) {
      errors.push('Message timeout must be at least 1000ms')
    }

    // Validate retry settings
    if (this.config.maxRetryAttempts < 0) {
      errors.push('Max retry attempts must be non-negative')
    }

    if (this.config.initialRetryDelay < 100) {
      errors.push('Initial retry delay must be at least 100ms')
    }

    if (this.config.retryBackoffMultiplier < 1) {
      errors.push('Retry backoff multiplier must be at least 1')
    }

    // Validate performance settings
    if (this.config.maxQueueSize < 1) {
      errors.push('Max queue size must be at least 1')
    }

    if (this.config.queueCheckInterval < 10) {
      errors.push('Queue check interval must be at least 10ms')
    }

    // Validate audio settings
    if (this.config.audioConfig.sampleRate < 8000) {
      errors.push('Sample rate must be at least 8000 Hz')
    }

    if (this.config.audioConfig.channels < 1) {
      errors.push('Audio channels must be at least 1')
    }

    if (this.config.audioConfig.chunkSize < 64) {
      errors.push('Audio chunk size must be at least 64 bytes')
    }

    if (errors.length > 0) {
      const errorMessage = `WebSocket configuration validation failed: ${errors.join(', ')}`
      logger.error(errorMessage, {
        environment: this.environment,
        errors
      })
      throw new Error(errorMessage)
    }
  }

  /**
   * Build configuration by merging defaults with environment overrides
   */
  private buildConfig(): WebSocketConfig {
    const environmentConfig = ENVIRONMENT_CONFIGS[this.environment as keyof EnvironmentConfig] || {}
    const envVarOverrides = this.getEnvironmentVariableOverrides()

    return {
      ...DEFAULT_CONFIG,
      ...environmentConfig,
      ...envVarOverrides
    }
  }

  /**
   * Get configuration overrides from environment variables
   */
  private getEnvironmentVariableOverrides(): Partial<WebSocketConfig> {
    const overrides: Partial<WebSocketConfig> = {}

    // API Key from environment
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    if (apiKey) {
      overrides.apiKey = apiKey
    }

    // Endpoint override
    const endpoint = process.env.GEMINI_WEBSOCKET_ENDPOINT
    if (endpoint) {
      overrides.endpoint = endpoint
    }

    // Model override
    const model = process.env.GEMINI_MODEL
    if (model) {
      overrides.model = model
    }

    // Timeout overrides
    const connectionTimeout = process.env.WS_CONNECTION_TIMEOUT
    if (connectionTimeout && !isNaN(Number(connectionTimeout))) {
      overrides.connectionTimeout = Number(connectionTimeout)
    }

    const handshakeTimeout = process.env.WS_HANDSHAKE_TIMEOUT
    if (handshakeTimeout && !isNaN(Number(handshakeTimeout))) {
      overrides.handshakeTimeout = Number(handshakeTimeout)
    }

    // Retry settings
    const maxRetryAttempts = process.env.WS_MAX_RETRY_ATTEMPTS
    if (maxRetryAttempts && !isNaN(Number(maxRetryAttempts))) {
      overrides.maxRetryAttempts = Number(maxRetryAttempts)
    }

    // Logging settings
    const enableDetailedLogging = process.env.WS_ENABLE_DETAILED_LOGGING
    if (enableDetailedLogging) {
      overrides.enableDetailedLogging = enableDetailedLogging.toLowerCase() === 'true'
    }

    const enableMetrics = process.env.WS_ENABLE_METRICS
    if (enableMetrics) {
      overrides.enableMetrics = enableMetrics.toLowerCase() === 'true'
    }

    return overrides
  }

  /**
   * Detect current environment
   */
  private detectEnvironment(): string {
    // Check NODE_ENV first
    if (process.env.NODE_ENV) {
      return process.env.NODE_ENV.toLowerCase()
    }

    // Check for specific environment indicators
    if (process.env.ELECTRON_IS_DEV === 'true' || process.env.NODE_ENV === 'development') {
      return 'development'
    }

    if (process.env.CI === 'true' || process.env.NODE_ENV === 'test') {
      return 'test'
    }

    // Default to production
    return 'production'
  }

  /**
   * Get configuration summary for logging (without sensitive data)
   */
  getConfigSummary(): Record<string, unknown> {
    return {
      environment: this.environment,
      model: this.config.model,
      endpoint: this.config.endpoint.substring(0, 50) + '...',
      hasApiKey: !!this.config.apiKey,
      connectionTimeout: this.config.connectionTimeout,
      handshakeTimeout: this.config.handshakeTimeout,
      maxRetryAttempts: this.config.maxRetryAttempts,
      enableDetailedLogging: this.config.enableDetailedLogging,
      enableMetrics: this.config.enableMetrics,
      audioSampleRate: this.config.audioConfig.sampleRate,
      audioChannels: this.config.audioConfig.channels
    }
  }
}

// Export a default instance
export const defaultWebSocketConfig = new WebSocketConfigManager()

// Export factory function for creating custom instances
export function createWebSocketConfig(environment?: string): WebSocketConfigManager {
  return new WebSocketConfigManager(environment)
}

// Export configuration presets for specific use cases
export const CONFIG_PRESETS = {
  LOW_LATENCY: {
    connectionTimeout: 5000,
    handshakeTimeout: 2000,
    messageTimeout: 15000,
    pingInterval: 15000,
    queueCheckInterval: 50,
    heartbeatInterval: 15000
  },

  HIGH_RELIABILITY: {
    connectionTimeout: 15000,
    handshakeTimeout: 8000,
    maxRetryAttempts: 10,
    initialRetryDelay: 2000,
    maxRetryDelay: 60000,
    retryBackoffMultiplier: 1.5,
    heartbeatInterval: 45000
  },

  MINIMAL_RESOURCES: {
    maxQueueSize: 50,
    queueCheckInterval: 200,
    heartbeatInterval: 60000,
    enableDetailedLogging: false,
    enableMetrics: false,
    metricsRetentionPeriod: 3600000 // 1 hour
  }
} as const

export type ConfigPreset = keyof typeof CONFIG_PRESETS
