/**
 * Enhanced WebSocket Connection Establishment Service
 *
 * Provides robust connection establishment with advanced configuration,
 * SSL/TLS handling, authentication, and comprehensive logging.
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {GeminiErrorHandler, ErrorType} from './gemini-error-handler'

interface ConnectionOptions {
  protocols?: string[]
  headers?: Record<string, string>
}

interface SetupMessage {
  setup: {
    model?: string
    generation_config: {
      response_modalities: string[]
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: string
          }
        }
      }
    }
  }
}

export interface ConnectionConfig {
  // Core connection settings
  apiKey: string
  endpoint?: string
  model?: string
  protocols?: string[]

  // Timeout and retry settings
  connectionTimeout?: number
  handshakeTimeout?: number
  retryAttempts?: number
  retryDelay?: number

  // SSL/TLS configuration
  tlsConfig?: {
    rejectUnauthorized?: boolean
    ciphers?: string
    secureProtocol?: string
    checkServerIdentity?: boolean
    ca?: string[]
    cert?: string
    key?: string
  }

  // Authentication configuration
  authConfig?: {
    method: 'api_key' | 'oauth' | 'jwt' | 'custom'
    credentials?: Record<string, unknown>
    headers?: Record<string, string>
    queryParams?: Record<string, string>
  }

  // Connection validation
  validation?: {
    validateCertificate?: boolean
    allowSelfSigned?: boolean
    requiredProtocols?: string[]
    maxRedirects?: number
  }

  // Performance settings
  performance?: {
    keepAlive?: boolean
    keepAliveDelay?: number
    noDelay?: boolean
    bufferSize?: number
  }
}

export interface ConnectionMetrics {
  // Timing metrics
  connectionStartTime: number
  connectionEndTime?: number
  handshakeStartTime?: number
  handshakeEndTime?: number
  totalConnectionTime?: number

  // Network metrics
  networkLatency?: number
  serverResponseTime?: number

  // Security metrics
  tlsVersion?: string
  cipher?: string
  certificateInfo?: {
    issuer?: string
    subject?: string
    validFrom?: Date
    validTo?: Date
    fingerprint?: string
  }

  // Connection quality
  quality?: 'excellent' | 'good' | 'fair' | 'poor'
  qualityScore?: number // 0-100
}

interface ConnectionOptions {
  protocols?: string[]
  headers?: Record<string, string>
}

export interface ConnectionResult {
  success: boolean
  websocket?: WebSocket
  metrics: ConnectionMetrics
  error?: Error
  redirectUrl?: string
}

/**
 * Enhanced WebSocket Connection Establishment Service
 */
export class WebSocketConnectionEstablisher extends EventEmitter {
  private config: ConnectionConfig
  private errorHandler: GeminiErrorHandler
  private activeConnections = new Map<string, WebSocket>()
  private connectionMetrics = new Map<string, ConnectionMetrics>()

  constructor(config: ConnectionConfig, errorHandler?: GeminiErrorHandler) {
    super()

    this.config = {
      endpoint:
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.LiveStreaming',
      model: 'gemini-2.0-flash-exp',
      connectionTimeout: 10000,
      handshakeTimeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      protocols: [],
      authConfig: {
        method: 'api_key',
        queryParams: {}
      },
      tlsConfig: {
        rejectUnauthorized: true,
        checkServerIdentity: true
      },
      validation: {
        validateCertificate: true,
        allowSelfSigned: false,
        maxRedirects: 3
      },
      performance: {
        keepAlive: true,
        keepAliveDelay: 30000,
        noDelay: true,
        bufferSize: 8192
      },
      ...config
    }

    this.errorHandler = errorHandler || new GeminiErrorHandler()

    logger.info('WebSocket Connection Establisher initialized', {
      endpoint: this.config.endpoint,
      model: this.config.model,
      connectionTimeout: this.config.connectionTimeout,
      handshakeTimeout: this.config.handshakeTimeout
    })
  }

  /**
   * Establish a new WebSocket connection with enhanced configuration
   */
  async establishConnection(connectionId?: string): Promise<ConnectionResult> {
    const id = connectionId || this.generateConnectionId()
    const startTime = Date.now()

    const metrics: ConnectionMetrics = {
      connectionStartTime: startTime
    }

    this.connectionMetrics.set(id, metrics)

    logger.info('Starting enhanced connection establishment', {
      connectionId: id,
      endpoint: this.config.endpoint,
      model: this.config.model
    })

    this.emit('connectionAttemptStarted', {connectionId: id, config: this.config})

    try {
      // Step 1: Validate configuration
      await this.validateConfiguration()

      // Step 2: Build connection URL with authentication
      const connectionUrl = await this.buildConnectionUrl()

      // Step 3: Prepare connection options
      const connectionOptions = this.prepareConnectionOptions()

      // Step 4: Establish WebSocket connection
      const websocket = await this.createWebSocketConnection(
        connectionUrl,
        connectionOptions,
        metrics
      )

      // Step 5: Perform enhanced handshake
      await this.performHandshake(websocket, metrics)

      // Step 6: Validate connection
      await this.validateConnection(websocket, metrics)

      // Step 7: Calculate connection quality
      this.calculateConnectionQuality(metrics)

      metrics.connectionEndTime = Date.now()
      metrics.totalConnectionTime = metrics.connectionEndTime - metrics.connectionStartTime

      this.activeConnections.set(id, websocket)

      logger.info('Connection established successfully', {
        connectionId: id,
        totalTime: metrics.totalConnectionTime,
        quality: metrics.quality,
        qualityScore: metrics.qualityScore
      })

      this.emit('connectionEstablished', {
        connectionId: id,
        websocket,
        metrics: {...metrics}
      })

      return {
        success: true,
        websocket,
        metrics: {...metrics}
      }
    } catch (error) {
      const connectionError = this.errorHandler.handleError(
        error,
        {
          connectionId: id,
          config: this.config,
          metrics: {...metrics}
        },
        {
          type: ErrorType.WEBSOCKET,
          retryable: this.isRetryableError(error as Error)
        }
      )

      metrics.connectionEndTime = Date.now()
      metrics.totalConnectionTime = metrics.connectionEndTime - metrics.connectionStartTime

      logger.error('Connection establishment failed', {
        connectionId: id,
        error: connectionError.message,
        totalTime: metrics.totalConnectionTime
      })

      this.emit('connectionFailed', {
        connectionId: id,
        error: connectionError,
        metrics: {...metrics}
      })

      return {
        success: false,
        metrics: {...metrics},
        error: new Error(connectionError.message)
      }
    }
  }

  /**
   * Validate connection configuration
   */
  private async validateConfiguration(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('API key is required for connection establishment')
    }

    if (!this.config.endpoint) {
      throw new Error('WebSocket endpoint is required')
    }

    // Validate timeout values
    if (this.config.connectionTimeout && this.config.connectionTimeout < 1000) {
      throw new Error('Connection timeout must be at least 1000ms')
    }

    if (this.config.handshakeTimeout && this.config.handshakeTimeout < 500) {
      throw new Error('Handshake timeout must be at least 500ms')
    }

    // Validate SSL/TLS configuration if provided
    if (this.config.tlsConfig) {
      this.validateTlsConfig(this.config.tlsConfig)
    }

    logger.debug('Configuration validation passed', {
      endpoint: this.config.endpoint,
      hasApiKey: !!this.config.apiKey,
      connectionTimeout: this.config.connectionTimeout,
      handshakeTimeout: this.config.handshakeTimeout
    })
  }

  /**
   * Validate TLS configuration
   */
  private validateTlsConfig(tlsConfig: NonNullable<ConnectionConfig['tlsConfig']>): void {
    // Validate cipher list if provided
    if (tlsConfig.ciphers) {
      const validCipherPattern = /^[A-Z0-9:+-]+$/
      if (!validCipherPattern.test(tlsConfig.ciphers)) {
        throw new Error('Invalid cipher specification')
      }
    }

    // Validate certificate data if provided
    if (tlsConfig.cert && !tlsConfig.key) {
      throw new Error('TLS certificate requires corresponding private key')
    }

    if (tlsConfig.key && !tlsConfig.cert) {
      throw new Error('TLS private key requires corresponding certificate')
    }
  }

  /**
   * Build connection URL with authentication and parameters
   */
  private async buildConnectionUrl(): Promise<string> {
    const baseUrl = this.config.endpoint!

    // Handle authentication
    const authParams = await this.buildAuthenticationParams()

    // Add model parameter
    const params = new URLSearchParams({
      ...authParams,
      ...(this.config.model && {model: this.config.model}),
      ...(this.config.authConfig?.queryParams || {})
    })

    const url = `${baseUrl}?${params.toString()}`

    logger.debug('Built connection URL', {
      baseUrl,
      hasAuth: Object.keys(authParams).length > 0,
      paramCount: params.size
    })

    return url
  }

  /**
   * Build authentication parameters based on configuration
   */
  private async buildAuthenticationParams(): Promise<Record<string, string>> {
    const authMethod = this.config.authConfig?.method || 'api_key'

    switch (authMethod) {
      case 'api_key':
        return {key: this.config.apiKey}

      case 'oauth':
        // For OAuth, we might need to exchange tokens or use existing credentials
        if (!this.config.authConfig?.credentials?.accessToken) {
          throw new Error('OAuth access token is required')
        }
        return {access_token: this.config.authConfig.credentials.accessToken as string}

      case 'jwt':
        if (!this.config.authConfig?.credentials?.token) {
          throw new Error('JWT token is required')
        }
        return {jwt: this.config.authConfig.credentials.token as string}

      case 'custom':
        // Custom authentication allows for flexible auth mechanisms
        return this.config.authConfig?.queryParams || {}

      default:
        throw new Error(`Unsupported authentication method: ${authMethod}`)
    }
  }

  /**
   * Prepare WebSocket connection options
   */
  private prepareConnectionOptions(): ConnectionOptions {
    const options: ConnectionOptions = {}

    // Add protocols if specified
    if (this.config.protocols && this.config.protocols.length > 0) {
      options.protocols = this.config.protocols
    }

    // Add headers for authentication if needed
    if (this.config.authConfig?.headers) {
      options.headers = {...this.config.authConfig.headers}
    }

    // Add any performance options that WebSocket constructor supports
    if (this.config.performance) {
      // Most performance options are set after connection establishment
      // but some can be set during construction in Node.js environments
    }

    logger.debug('Prepared connection options', {
      hasProtocols: !!options.protocols,
      hasHeaders: !!options.headers,
      protocolCount: options.protocols?.length || 0,
      headerCount: Object.keys(options.headers || {}).length
    })

    return options
  }

  /**
   * Create WebSocket connection with timeout and error handling
   */
  private async createWebSocketConnection(
    url: string,
    options: ConnectionOptions,
    metrics: ConnectionMetrics
  ): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      let websocket: WebSocket
      let timeoutId: NodeJS.Timeout | undefined
      let resolved = false

      try {
        websocket = new WebSocket(url, options.protocols)

        // Set connection timeout
        timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true
            websocket.close()
            reject(new Error(`Connection timeout after ${this.config.connectionTimeout}ms`))
          }
        }, this.config.connectionTimeout!)

        websocket.onopen = () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutId!)

            // Record connection timing
            metrics.handshakeStartTime = Date.now()

            logger.debug('WebSocket connection opened', {
              readyState: websocket.readyState,
              protocol: websocket.protocol,
              extensions: websocket.extensions
            })

            resolve(websocket)
          }
        }

        websocket.onerror = error => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutId!)
            reject(new Error(`WebSocket connection error: ${error}`))
          }
        }

        websocket.onclose = event => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutId!)
            reject(new Error(`WebSocket closed during connection: ${event.reason} (${event.code})`))
          }
        }
      } catch (error) {
        if (!resolved) {
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          reject(error)
        }
      }
    })
  }

  /**
   * Perform enhanced handshake process
   */
  private async performHandshake(websocket: WebSocket, metrics: ConnectionMetrics): Promise<void> {
    metrics.handshakeStartTime = Date.now()

    return new Promise((resolve, reject) => {
      const handshakeTimeout = setTimeout(() => {
        reject(new Error(`Handshake timeout after ${this.config.handshakeTimeout}ms`))
      }, this.config.handshakeTimeout!)

      // For Gemini Live API, the handshake is typically completed when connection opens
      // but we can add additional validation here

      try {
        // Send initial setup message if required
        const setupMessage = this.buildSetupMessage()
        if (setupMessage) {
          websocket.send(JSON.stringify(setupMessage))
        }

        metrics.handshakeEndTime = Date.now()
        clearTimeout(handshakeTimeout)

        logger.debug('Handshake completed', {
          handshakeDuration: metrics.handshakeEndTime - metrics.handshakeStartTime!,
          sentSetupMessage: !!setupMessage
        })

        resolve()
      } catch (error) {
        clearTimeout(handshakeTimeout)
        reject(error)
      }
    })
  }

  /**
   * Build setup message for initial handshake
   */
  private buildSetupMessage(): SetupMessage | null {
    // For Gemini Live API, we might want to send initial configuration
    return {
      setup: {
        model: this.config.model,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: 'Aoede'
              }
            }
          }
        }
      }
    }
  }

  /**
   * Validate the established connection
   */
  private async validateConnection(
    websocket: WebSocket,
    metrics: ConnectionMetrics
  ): Promise<void> {
    // Check connection state
    if (websocket.readyState !== WebSocket.OPEN) {
      throw new Error(`Invalid connection state: ${websocket.readyState}`)
    }

    // Validate required protocols if specified
    if (this.config.validation?.requiredProtocols) {
      const actualProtocol = websocket.protocol
      if (!this.config.validation.requiredProtocols.includes(actualProtocol)) {
        throw new Error(
          `Protocol mismatch. Expected: ${this.config.validation.requiredProtocols.join(', ')}, Got: ${actualProtocol}`
        )
      }
    }

    // Record server response timing (if available)
    const responseTime = Date.now()
    if (metrics.handshakeStartTime) {
      metrics.serverResponseTime = responseTime - metrics.handshakeStartTime
    }

    logger.debug('Connection validation passed', {
      readyState: websocket.readyState,
      protocol: websocket.protocol,
      extensions: websocket.extensions,
      serverResponseTime: metrics.serverResponseTime
    })
  }

  /**
   * Calculate connection quality based on metrics
   */
  private calculateConnectionQuality(metrics: ConnectionMetrics): void {
    let qualityScore = 100

    // Factor in connection time
    if (metrics.totalConnectionTime) {
      if (metrics.totalConnectionTime > 5000) qualityScore -= 20
      else if (metrics.totalConnectionTime > 3000) qualityScore -= 10
      else if (metrics.totalConnectionTime > 1000) qualityScore -= 5
    }

    // Factor in server response time
    if (metrics.serverResponseTime) {
      if (metrics.serverResponseTime > 2000) qualityScore -= 15
      else if (metrics.serverResponseTime > 1000) qualityScore -= 8
      else if (metrics.serverResponseTime > 500) qualityScore -= 3
    }

    // Determine quality rating
    let quality: ConnectionMetrics['quality']
    if (qualityScore >= 90) quality = 'excellent'
    else if (qualityScore >= 70) quality = 'good'
    else if (qualityScore >= 50) quality = 'fair'
    else quality = 'poor'

    metrics.quality = quality
    metrics.qualityScore = Math.max(0, qualityScore)

    logger.debug('Connection quality calculated', {
      quality,
      qualityScore: metrics.qualityScore,
      connectionTime: metrics.totalConnectionTime,
      serverResponseTime: metrics.serverResponseTime
    })
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection refused/i,
      /temporary/i,
      /503/,
      /502/,
      /504/
    ]

    return retryablePatterns.some(pattern => pattern.test(error.message))
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get connection metrics for a specific connection
   */
  getConnectionMetrics(connectionId: string): ConnectionMetrics | undefined {
    return this.connectionMetrics.get(connectionId)
  }

  /**
   * Close a specific connection
   */
  async closeConnection(connectionId: string, code?: number, reason?: string): Promise<void> {
    const websocket = this.activeConnections.get(connectionId)
    if (websocket) {
      websocket.close(code, reason)
      this.activeConnections.delete(connectionId)
      this.connectionMetrics.delete(connectionId)

      logger.info('Connection closed', {
        connectionId,
        code,
        reason
      })
    }
  }

  /**
   * Get active connection count
   */
  getActiveConnectionCount(): number {
    return this.activeConnections.size
  }

  /**
   * Clean up all connections and resources
   */
  async cleanup(): Promise<void> {
    const connectionIds = Array.from(this.activeConnections.keys())
    await Promise.all(connectionIds.map(id => this.closeConnection(id, 1000, 'Service shutdown')))

    this.removeAllListeners()

    logger.info('WebSocket Connection Establisher cleaned up', {
      closedConnections: connectionIds.length
    })
  }
}
