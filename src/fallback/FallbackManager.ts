/**
 * Multi-tier Fallback Manager for WebSocket Transcription
 *
 * Handles WebSocket schema failures and connection issues by providing
 * fallback strategies: WebSocket → Streaming HTTP → Batch API
 *
 * Integrates with ConnectionMonitor from Task 4.1 to provide seamless
 * transport transitions while preserving audio data and transcription state.
 */

import {EventEmitter} from 'events'
import {logger} from '../services/gemini-logger'
import {ConnectionMonitor} from '../network/ConnectionMonitor'
import WebSocketTransport from './transports/WebSocketTransport'
import HttpStreamTransport from './transports/HttpStreamTransport'
import BatchTransport from './transports/BatchTransport'

// Transport Strategy Interface
export interface TransportStrategy {
  readonly name: string
  readonly priority: number
  isAvailable(): boolean
  initialize(): Promise<void>
  sendAudio(audioData: Buffer, options?: AudioSendOptions): Promise<TranscriptionResult>
  sendTurnComplete(): Promise<void>
  destroy(): Promise<void>
}

// Transport Configuration
export interface TransportConfig {
  timeout: number
  maxRetries: number
  bufferSize: number
  [key: string]: any
}

// Audio Send Options
export interface AudioSendOptions {
  sessionId?: string
  chunkIndex?: number
  isLast?: boolean
  mimeType?: string
}

// Transcription Result
export interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
  sessionId?: string
  source: 'websocket' | 'http-stream' | 'batch'
}

// Fallback Strategy Configuration
export interface FallbackConfig {
  websocket: TransportConfig
  httpStream: TransportConfig
  batch: TransportConfig

  // Failure thresholds
  maxConsecutive1007Errors: number
  maxSchemaVariantFailures: number
  connectionQualityThreshold: number

  // Timing
  fallbackDelayMs: number
  transportTimeoutMs: number

  // Feature flags
  enableAggressiveFallback: boolean
  enableAudioBuffering: boolean
}

// Transport State
export enum TransportState {
  INACTIVE = 'inactive',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  DEGRADED = 'degraded',
  FAILED = 'failed'
}

// Fallback Events
export interface FallbackEvents {
  'transport-changed': (from: string, to: string) => void
  'transport-failed': (transport: string, error: Error) => void
  'fallback-exhausted': () => void
  'audio-buffered': (bufferSize: number) => void
  transcription: (result: TranscriptionResult) => void
}

/**
 * Main Fallback Manager Class
 * Orchestrates transport switching and manages audio buffering
 */
export class FallbackManager extends EventEmitter {
  private config: FallbackConfig
  private transports: Map<string, TransportStrategy> = new Map()
  private currentTransport: TransportStrategy | null = null
  private transportState: TransportState = TransportState.INACTIVE

  // Connection monitoring
  private connectionMonitor: ConnectionMonitor | null = null

  // Audio buffering for transport transitions
  private audioBuffer: Array<{
    data: Buffer
    options: AudioSendOptions
    timestamp: number
  }> = []

  // Failure tracking
  private consecutive1007Errors = 0
  private schemaVariantFailures = 0
  private transportFailureCount = new Map<string, number>()

  // State management
  private isDestroyed = false
  private currentSessionId: string | null = null

  constructor(config: Partial<FallbackConfig> = {}) {
    super()

    this.config = {
      websocket: {timeout: 10000, maxRetries: 3, bufferSize: 1024 * 1024},
      httpStream: {timeout: 15000, maxRetries: 5, bufferSize: 2 * 1024 * 1024},
      batch: {timeout: 30000, maxRetries: 3, bufferSize: 5 * 1024 * 1024},

      maxConsecutive1007Errors: 5,
      maxSchemaVariantFailures: 10,
      connectionQualityThreshold: 0.3,

      fallbackDelayMs: 1000,
      transportTimeoutMs: 30000,

      enableAggressiveFallback: true,
      enableAudioBuffering: true,

      ...config
    }

    // Initialize concrete transport implementations
    this.initializeTransports()

    logger.info('FallbackManager initialized', {
      config: this.config,
      transportsRegistered: this.transports.size
    })
  }

  /**
   * Initialize concrete transport implementations
   */
  private initializeTransports(): void {
    // Create WebSocket transport (highest priority)
    const websocketTransport = new WebSocketTransport({
      maxReconnectAttempts: this.config.websocket.maxRetries,
      reconnectDelayMs: this.config.fallbackDelayMs,
      connectionTimeoutMs: this.config.websocket.timeout
    })

    // Create HTTP Stream transport (medium priority)
    const httpStreamTransport = new HttpStreamTransport({
      timeout: this.config.httpStream.timeout,
      maxRetries: this.config.httpStream.maxRetries,
      retryDelayMs: this.config.fallbackDelayMs
    })

    // Create Batch transport (lowest priority)
    const batchTransport = new BatchTransport({
      maxRetries: this.config.batch.maxRetries,
      retryDelayMs: this.config.fallbackDelayMs * 2,
      maxBatchDelay: this.config.batch.timeout
    })

    // Register transports in priority order
    this.transports.set('websocket', websocketTransport)
    this.transports.set('http-stream', httpStreamTransport)
    this.transports.set('batch', batchTransport)

    // Set initial transport to WebSocket
    this.currentTransport = websocketTransport

    // Set up transport event handlers
    this.setupTransportEventHandlers(websocketTransport)
    this.setupTransportEventHandlers(httpStreamTransport)
    this.setupTransportEventHandlers(batchTransport)

    logger.info('FallbackManager: Initialized transport strategies', {
      transports: Array.from(this.transports.keys()),
      currentTransport: this.currentTransport.name
    })
  }

  /**
   * Set up event handlers for a transport
   */
  private setupTransportEventHandlers(transport: TransportStrategy): void {
    // Check if transport supports event emitting
    const potentialEventEmitter = transport as unknown as {
      on?: (event: string, listener: (...args: unknown[]) => void) => void
    }
    if (typeof potentialEventEmitter.on !== 'function') {
      return
    }

    const eventEmitter = transport as unknown as EventEmitter

    eventEmitter.on('connected', () => {
      logger.info(`FallbackManager: ${transport.name} transport connected`)
      this.emit('transportConnected', {transport: transport.name})
    })

    eventEmitter.on('disconnected', (event: {code: number; reason: string}) => {
      logger.warn(`FallbackManager: ${transport.name} transport disconnected:`, event)
      this.emit('transportDisconnected', {transport: transport.name, ...event})
    })

    eventEmitter.on('error', (error: unknown) => {
      logger.error(`FallbackManager: ${transport.name} transport error:`, {error: String(error)})
      this.handleTransportError(transport.name, error as Error)
    })

    eventEmitter.on('schemaExhausted', (data: unknown) => {
      logger.warn(`FallbackManager: ${transport.name} schema variants exhausted:`, {data})
      this.triggerFallback(`Schema exhausted on ${transport.name}`)
    })

    eventEmitter.on('healthChange', (health: {isHealthy: boolean; quality: number}) => {
      logger.debug(`FallbackManager: ${transport.name} health changed:`, health)
      if (!health.isHealthy && transport === this.currentTransport) {
        this.triggerFallback(`Health degraded on ${transport.name}`)
      }
    })
  }

  /**
   * Register a transport strategy
   */
  registerTransport(transport: TransportStrategy): void {
    if (this.isDestroyed) {
      throw new Error('Cannot register transport on destroyed FallbackManager')
    }

    this.transports.set(transport.name, transport)
    this.transportFailureCount.set(transport.name, 0)

    logger.info('Transport registered', {
      name: transport.name,
      priority: transport.priority,
      totalTransports: this.transports.size
    })
  }

  /**
   * Initialize connection monitoring with integration to existing ConnectionMonitor
   */
  async initializeConnectionMonitoring(websocketClient?: WebSocket): Promise<void> {
    if (websocketClient) {
      // Create connection monitor for the WebSocket
      this.connectionMonitor = new ConnectionMonitor({
        heartbeatInterval: 30000,
        timeoutThreshold: 5000,
        qualityCheckInterval: 5000
      })

      // Listen for connection quality changes
      this.connectionMonitor.on('health_changed', ({quality, status}) => {
        logger.info('Connection health changed', {quality, status})

        // Trigger fallback if quality drops below threshold
        if (quality <= this.config.connectionQualityThreshold) {
          this.handleConnectionDegradation(quality)
        }
      })

      // Listen for heartbeat timeouts
      this.connectionMonitor.on('heartbeat_timeout', ({consecutiveTimeouts}) => {
        logger.warn('Heartbeat timeout detected', {consecutiveTimeouts})
        this.handleHeartbeatTimeout(consecutiveTimeouts)
      })

      // Listen for recovery needed events
      this.connectionMonitor.on('recovery_needed', ({reason, metrics}) => {
        logger.warn('Recovery needed', {reason, metrics})
        this.handleRecoveryNeeded(reason)
      })

      // Start monitoring
      if (websocketClient) {
        this.connectionMonitor.startMonitoring(websocketClient)
      }
    }

    logger.info('Connection monitoring initialized', {
      hasMonitor: !!this.connectionMonitor
    })
  }

  /**
   * Start the fallback system with primary transport
   */
  async start(sessionId?: string): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Cannot start destroyed FallbackManager')
    }

    this.currentSessionId = sessionId || this.generateSessionId()

    logger.info('Starting FallbackManager', {
      sessionId: this.currentSessionId,
      transportsAvailable: Array.from(this.transports.keys())
    })

    // Get highest priority available transport
    const transport = this.getNextAvailableTransport()
    if (!transport) {
      throw new Error('No available transports for fallback manager')
    }

    await this.switchToTransport(transport)
  }

  /**
   * Handle schema validation errors (1007 codes)
   */
  handleSchemaError(error: Error, variant?: number): void {
    if (this.isDestroyed) return

    this.consecutive1007Errors++
    if (variant !== undefined) {
      this.schemaVariantFailures++
    }

    logger.warn('Schema error detected', {
      error: error.message || error,
      consecutive1007Errors: this.consecutive1007Errors,
      schemaVariantFailures: this.schemaVariantFailures,
      variant,
      currentTransport: this.currentTransport?.name
    })

    // Check if we need to fallback due to schema failures
    const shouldFallback =
      this.consecutive1007Errors >= this.config.maxConsecutive1007Errors ||
      this.schemaVariantFailures >= this.config.maxSchemaVariantFailures

    if (shouldFallback) {
      logger.warn('Schema error threshold exceeded, triggering fallback', {
        consecutive1007: this.consecutive1007Errors,
        variantFailures: this.schemaVariantFailures
      })

      this.triggerFallback('schema-errors')
    }
  }

  /**
   * Send audio data through current transport with buffering
   */
  async sendAudio(
    audioData: Buffer,
    options?: AudioSendOptions
  ): Promise<TranscriptionResult | null> {
    if (this.isDestroyed) {
      throw new Error('Cannot send audio on destroyed FallbackManager')
    }

    const sendOptions: AudioSendOptions = {
      sessionId: this.currentSessionId!,
      ...options
    }

    // Buffer audio if enabled
    if (this.config.enableAudioBuffering) {
      this.audioBuffer.push({
        data: audioData,
        options: sendOptions,
        timestamp: Date.now()
      })

      // Limit buffer size
      const maxBufferItems = 100
      if (this.audioBuffer.length > maxBufferItems) {
        this.audioBuffer.shift() // Remove oldest
      }

      this.emit('audio-buffered', this.audioBuffer.length)
    }

    // Send through current transport
    if (!this.currentTransport) {
      logger.warn('No active transport for audio send')
      return null
    }

    try {
      const result = await this.currentTransport.sendAudio(audioData, sendOptions)

      // Reset error counters on successful send
      this.consecutive1007Errors = 0

      this.emit('transcription', result)
      return result
    } catch (error) {
      logger.error('Audio send failed', {
        transport: this.currentTransport.name,
        error: error instanceof Error ? error.message : error
      })

      // Handle specific error types
      if (error instanceof Error && error.message.includes('1007')) {
        this.handleSchemaError(error)
      } else {
        this.handleTransportError(this.currentTransport.name, error as Error)
      }

      return null
    }
  }

  /**
   * Send turn completion signal
   */
  async sendTurnComplete(): Promise<void> {
    if (this.isDestroyed || !this.currentTransport) {
      return
    }

    try {
      await this.currentTransport.sendTurnComplete()
    } catch (error) {
      logger.error('Turn complete failed', {
        transport: this.currentTransport.name,
        error: error instanceof Error ? error.message : error
      })

      if (error instanceof Error && error.message.includes('1007')) {
        this.handleSchemaError(error)
      }
    }
  }

  /**
   * Get current transport information
   */
  getCurrentTransport(): {name: string; state: TransportState} | null {
    if (!this.currentTransport) {
      return null
    }

    return {
      name: this.currentTransport.name,
      state: this.transportState
    }
  }

  /**
   * Get fallback statistics
   */
  getStatistics() {
    return {
      currentTransport: this.currentTransport?.name || null,
      transportState: this.transportState,
      consecutive1007Errors: this.consecutive1007Errors,
      schemaVariantFailures: this.schemaVariantFailures,
      audioBufferSize: this.audioBuffer.length,
      transportFailures: Object.fromEntries(this.transportFailureCount),
      connectionQuality: this.connectionMonitor?.getState().quality || null
    }
  }

  /**
   * Force fallback to next transport
   */
  async forceFallback(reason: string = 'manual'): Promise<void> {
    if (this.isDestroyed) return

    logger.info('Forced fallback triggered', {reason})
    await this.triggerFallback(reason)
  }

  /**
   * Destroy the fallback manager
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) return

    this.isDestroyed = true
    logger.info('Destroying FallbackManager')

    // Stop connection monitoring
    if (this.connectionMonitor) {
      this.connectionMonitor.stopMonitoring()
      this.connectionMonitor = null
    }

    // Destroy current transport
    if (this.currentTransport) {
      await this.currentTransport.destroy()
      this.currentTransport = null
    }

    // Clear buffers
    this.audioBuffer = []

    // Remove listeners
    this.removeAllListeners()

    logger.info('FallbackManager destroyed')
  }

  // Private helper methods

  private async switchToTransport(transport: TransportStrategy): Promise<void> {
    const previousTransport = this.currentTransport?.name

    try {
      // Cleanup previous transport
      if (this.currentTransport) {
        await this.currentTransport.destroy()
      }

      this.transportState = TransportState.INITIALIZING

      // Initialize new transport
      await transport.initialize()

      this.currentTransport = transport
      this.transportState = TransportState.ACTIVE

      logger.info('Transport switched successfully', {
        from: previousTransport || 'none',
        to: transport.name,
        priority: transport.priority
      })

      this.emit('transport-changed', previousTransport || 'none', transport.name)

      // Replay buffered audio if switching transports
      if (previousTransport && this.audioBuffer.length > 0) {
        await this.replayBufferedAudio()
      }
    } catch (error) {
      this.transportState = TransportState.FAILED

      logger.error('Transport switch failed', {
        transport: transport.name,
        error: error instanceof Error ? error.message : error
      })

      this.emit('transport-failed', transport.name, error as Error)
      throw error
    }
  }

  private getNextAvailableTransport(): TransportStrategy | null {
    // Sort transports by priority (highest first)
    const availableTransports = Array.from(this.transports.values())
      .filter(t => t.isAvailable())
      .sort((a, b) => b.priority - a.priority)

    // Skip current transport and failed transports
    for (const transport of availableTransports) {
      if (transport === this.currentTransport) continue

      const failureCount = this.transportFailureCount.get(transport.name) || 0
      if (failureCount < 3) {
        // Max 3 failures per transport
        return transport
      }
    }

    return null
  }

  private async triggerFallback(reason: string): Promise<void> {
    logger.warn('Triggering fallback', {
      reason,
      currentTransport: this.currentTransport?.name
    })

    const nextTransport = this.getNextAvailableTransport()

    if (!nextTransport) {
      logger.error('No fallback transports available')
      this.emit('fallback-exhausted')
      return
    }

    // Add delay to prevent rapid switching
    await new Promise(resolve => setTimeout(resolve, this.config.fallbackDelayMs))

    try {
      await this.switchToTransport(nextTransport)
    } catch (error) {
      logger.error('Fallback failed', {
        transport: nextTransport.name,
        error: error instanceof Error ? error.message : error
      })

      // Increment failure count and try next transport
      const failures = this.transportFailureCount.get(nextTransport.name) || 0
      this.transportFailureCount.set(nextTransport.name, failures + 1)

      // Recursive fallback if more transports available
      const nextNext = this.getNextAvailableTransport()
      if (nextNext) {
        await this.triggerFallback(`${reason}-cascade`)
      }
    }
  }

  private async replayBufferedAudio(): Promise<void> {
    if (!this.currentTransport || this.audioBuffer.length === 0) {
      return
    }

    logger.info('Replaying buffered audio', {
      bufferSize: this.audioBuffer.length,
      transport: this.currentTransport.name
    })

    // Replay buffered audio chunks
    for (const buffered of this.audioBuffer.slice()) {
      // Copy array to avoid modifications during iteration
      try {
        await this.currentTransport.sendAudio(buffered.data, buffered.options)
      } catch (error) {
        logger.warn('Failed to replay buffered audio chunk', {
          error: error instanceof Error ? error.message : error
        })
        break // Stop replay on first failure
      }
    }

    // Clear buffer after successful replay
    this.audioBuffer = []
  }

  private handleConnectionDegradation(quality: number): void {
    if (this.config.enableAggressiveFallback) {
      logger.warn('Connection quality degraded, considering fallback', {quality})

      // Only fallback if quality is very low
      if (quality <= 0.2) {
        this.triggerFallback('connection-quality')
      }
    }
  }

  private handleHeartbeatTimeout(consecutiveTimeouts: number): void {
    if (consecutiveTimeouts >= 3) {
      logger.warn('Multiple heartbeat timeouts, triggering fallback', {consecutiveTimeouts})
      this.triggerFallback('heartbeat-timeout')
    }
  }

  private handleRecoveryNeeded(reason: string): void {
    logger.warn('Recovery needed from ConnectionMonitor', {reason})
    this.triggerFallback(`recovery-${reason}`)
  }

  private handleTransportError(transportName: string, error: Error): void {
    const failures = this.transportFailureCount.get(transportName) || 0
    this.transportFailureCount.set(transportName, failures + 1)

    logger.error('Transport error recorded', {
      transport: transportName,
      failures: failures + 1,
      error: error.message
    })

    this.emit('transport-failed', transportName, error)

    // Trigger fallback for critical errors
    if (failures >= 2) {
      this.triggerFallback(`transport-errors-${transportName}`)
    }
  }

  private generateSessionId(): string {
    return `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export default FallbackManager
