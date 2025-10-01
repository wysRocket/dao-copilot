/**
 * Gemini Live WebSocket Connection Pool Manager
 * Optimizes speech recognition performance by maintaining persistent connections
 * and reusing setup-complete connections to eliminate connection overhead
 */

import {EventEmitter} from 'events'
import {GeminiLiveWebSocketClient, GeminiLiveConfig, RealtimeInput} from './gemini-live-websocket'
import {logger} from './gemini-logger'

export interface ConnectionPoolConfig {
  maxConnections: number
  minConnections: number
  connectionTimeout: number
  idleTimeout: number
  warmupConnections: number
  healthCheckInterval: number
  maxRetries: number
}

export interface PooledConnection {
  id: string
  client: GeminiLiveWebSocketClient
  createdAt: Date
  lastUsed: Date
  isActive: boolean
  isSetupComplete: boolean
  requestCount: number
}

export interface ConnectionPoolStats {
  totalConnections: number
  activeConnections: number
  idleConnections: number
  setupCompleteConnections: number
  totalRequests: number
  averageRequestsPerConnection: number
  poolEfficiency: number
}

/**
 * High-performance connection pool for Gemini Live WebSocket connections
 * Provides persistent connections to eliminate setup overhead
 */
export class GeminiConnectionPool extends EventEmitter {
  private connections: Map<string, PooledConnection> = new Map()
  private config: ConnectionPoolConfig
  private geminiConfig: GeminiLiveConfig
  private healthCheckTimer: NodeJS.Timeout | null = null
  private connectionCounter = 0
  private totalRequests = 0
  private isShuttingDown = false

  constructor(geminiConfig: GeminiLiveConfig, poolConfig: Partial<ConnectionPoolConfig> = {}) {
    super()

    this.geminiConfig = geminiConfig
    this.config = {
      maxConnections: 5,
      minConnections: 2,
      connectionTimeout: 10000,
      idleTimeout: 5 * 60 * 1000, // 5 minutes
      warmupConnections: 2,
      healthCheckInterval: 30000, // 30 seconds
      maxRetries: 3,
      ...poolConfig
    }

    logger.info('GeminiConnectionPool initialized', {
      maxConnections: this.config.maxConnections,
      minConnections: this.config.minConnections,
      warmupConnections: this.config.warmupConnections
    })
  }

  /**
   * Initialize the connection pool with warmup connections
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing connection pool', {
        warmupConnections: this.config.warmupConnections
      })

      // Create initial warm connections
      const warmupPromises = Array.from({length: this.config.warmupConnections}, () =>
        this.createConnection()
      )

      await Promise.allSettled(warmupPromises)

      // Start health check timer
      this.startHealthCheck()

      const stats = this.getStats()
      logger.info('Connection pool initialized successfully', {
        totalConnections: stats.totalConnections,
        setupCompleteConnections: stats.setupCompleteConnections
      })

      this.emit('poolInitialized', stats)
    } catch (error) {
      logger.error('Failed to initialize connection pool', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get or create an available connection for speech recognition
   * Returns a setup-complete connection immediately if available
   */
  async getConnection(): Promise<PooledConnection> {
    this.totalRequests++

    try {
      // First, try to get a setup-complete connection
      const setupCompleteConnection = this.findSetupCompleteConnection()
      if (setupCompleteConnection) {
        this.markConnectionUsed(setupCompleteConnection)
        logger.debug('Reusing setup-complete connection', {
          connectionId: setupCompleteConnection.id,
          requestCount: setupCompleteConnection.requestCount
        })
        return setupCompleteConnection
      }

      // Next, try to get any connected connection and wait for setup
      const connectedConnection = this.findConnectedConnection()
      if (connectedConnection) {
        await this.waitForSetupComplete(connectedConnection)
        this.markConnectionUsed(connectedConnection)
        logger.debug('Using connected connection after setup', {
          connectionId: connectedConnection.id
        })
        return connectedConnection
      }

      // If no connections available, create a new one
      logger.debug('No available connections, creating new one', {
        currentConnections: this.connections.size,
        maxConnections: this.config.maxConnections
      })

      if (this.connections.size >= this.config.maxConnections) {
        // Wait for an available connection or timeout
        return await this.waitForAvailableConnection()
      }

      // Create new connection
      const newConnection = await this.createConnection()
      await this.waitForSetupComplete(newConnection)
      this.markConnectionUsed(newConnection)

      return newConnection
    } catch (error) {
      logger.error('Failed to get connection from pool', {
        error: error instanceof Error ? error.message : 'Unknown error',
        totalConnections: this.connections.size,
        totalRequests: this.totalRequests
      })
      throw error
    }
  }

  /**
   * Send transcription request through the pool
   * This is the main optimization - reuses existing connections
   */
  async sendTranscriptionRequest(audioInput: RealtimeInput): Promise<void> {
    const connection = await this.getConnection()

    try {
      // Send the audio data directly without connection overhead
      await connection.client.sendRealtimeInput(audioInput)

      logger.debug('Transcription request sent successfully', {
        connectionId: connection.id,
        requestCount: connection.requestCount,
        hasAudio: !!audioInput.audio
      })
    } catch (error) {
      logger.error('Failed to send transcription request', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Mark connection as potentially bad and remove it
      await this.removeConnection(connection.id)
      throw error
    }
  }

  /**
   * Create a new pooled connection
   */
  private async createConnection(): Promise<PooledConnection> {
    const connectionId = `conn_${++this.connectionCounter}_${Date.now()}`

    try {
      const client = new GeminiLiveWebSocketClient(this.geminiConfig)

      const pooledConnection: PooledConnection = {
        id: connectionId,
        client,
        createdAt: new Date(),
        lastUsed: new Date(),
        isActive: false,
        isSetupComplete: false,
        requestCount: 0
      }

      // Set up event listeners
      this.setupConnectionEventListeners(pooledConnection)

      // Connect the client
      await client.connect()

      // Add to pool
      this.connections.set(connectionId, pooledConnection)

      logger.debug('Created new pooled connection', {
        connectionId,
        totalConnections: this.connections.size
      })

      this.emit('connectionCreated', {connectionId, totalConnections: this.connections.size})

      return pooledConnection
    } catch (error) {
      logger.error('Failed to create pooled connection', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Set up event listeners for a pooled connection
   */
  private setupConnectionEventListeners(pooledConnection: PooledConnection): void {
    const {client, id} = pooledConnection

    client.on('connected', () => {
      pooledConnection.isActive = true
      logger.debug('Pooled connection connected', {connectionId: id})
    })

    client.on('setupComplete', () => {
      pooledConnection.isSetupComplete = true
      logger.debug('Pooled connection setup complete', {connectionId: id})
      this.emit('connectionReady', {connectionId: id})
    })

    client.on('disconnected', () => {
      pooledConnection.isActive = false
      pooledConnection.isSetupComplete = false
      logger.debug('Pooled connection disconnected', {connectionId: id})
    })

    client.on('error', error => {
      logger.warn('Pooled connection error', {
        connectionId: id,
        error: error.message || 'Unknown error'
      })
      // Mark for removal on error
      this.removeConnection(id)
    })

    // Forward transcription events to pool consumers
    client.on('textResponse', data => {
      this.emit('textResponse', {...data, connectionId: id})
    })

    client.on('transcriptionUpdate', data => {
      this.emit('transcriptionUpdate', {...data, connectionId: id})
    })

    client.on('chatResponse', data => {
      this.emit('chatResponse', {...data, connectionId: id})
    })
  }

  /**
   * Find a setup-complete connection (highest priority)
   */
  private findSetupCompleteConnection(): PooledConnection | null {
    for (const connection of this.connections.values()) {
      if (connection.isActive && connection.isSetupComplete && !this.isConnectionBusy(connection)) {
        return connection
      }
    }
    return null
  }

  /**
   * Find any connected connection
   */
  private findConnectedConnection(): PooledConnection | null {
    for (const connection of this.connections.values()) {
      if (connection.isActive && !this.isConnectionBusy(connection)) {
        return connection
      }
    }
    return null
  }

  /**
   * Check if connection is currently busy
   */
  private isConnectionBusy(connection: PooledConnection): boolean {
    // Simple heuristic: connection used very recently is likely busy
    const now = Date.now()
    const timeSinceLastUse = now - connection.lastUsed.getTime()
    return timeSinceLastUse < 1000 // Consider busy if used within last second
  }

  /**
   * Wait for a connection to complete setup
   */
  private async waitForSetupComplete(connection: PooledConnection, timeout = 5000): Promise<void> {
    if (connection.isSetupComplete) {
      return
    }

    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        reject(new Error(`Setup timeout for connection ${connection.id}`))
      }, timeout)

      const setupHandler = () => {
        clearTimeout(timeoutTimer)
        resolve()
      }

      connection.client.once('setupComplete', setupHandler)
    })
  }

  /**
   * Wait for any available connection or timeout
   */
  private async waitForAvailableConnection(timeout = 10000): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        reject(new Error('Timeout waiting for available connection'))
      }, timeout)

      const checkForConnection = () => {
        const connection = this.findSetupCompleteConnection() || this.findConnectedConnection()
        if (connection) {
          clearTimeout(timeoutTimer)
          resolve(connection)
        }
      }

      // Check every 100ms for available connection
      const checkInterval = setInterval(checkForConnection, 100)

      // Also listen for connection ready events
      const readyHandler = () => {
        clearInterval(checkInterval)
        clearTimeout(timeoutTimer)
        const connection = this.findSetupCompleteConnection()
        if (connection) {
          resolve(connection)
        }
      }

      this.once('connectionReady', readyHandler)
    })
  }

  /**
   * Mark connection as used and update stats
   */
  private markConnectionUsed(connection: PooledConnection): void {
    connection.lastUsed = new Date()
    connection.requestCount++
  }

  /**
   * Remove a connection from the pool
   */
  private async removeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return
    }

    try {
      await connection.client.disconnect()
    } catch (error) {
      logger.warn('Error disconnecting pooled connection during removal', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    this.connections.delete(connectionId)

    logger.debug('Removed connection from pool', {
      connectionId,
      remainingConnections: this.connections.size
    })

    this.emit('connectionRemoved', {connectionId, totalConnections: this.connections.size})

    // Ensure minimum connections
    if (this.connections.size < this.config.minConnections && !this.isShuttingDown) {
      this.createConnection().catch(error => {
        logger.error('Failed to create replacement connection', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      })
    }
  }

  /**
   * Start health check timer
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck()
    }, this.config.healthCheckInterval)
  }

  /**
   * Perform health check on all connections
   */
  private performHealthCheck(): void {
    const now = Date.now()
    const connectionsToRemove: string[] = []

    for (const [id, connection] of this.connections.entries()) {
      // Check for idle timeout
      const idleTime = now - connection.lastUsed.getTime()
      if (idleTime > this.config.idleTimeout) {
        logger.debug('Removing idle connection', {
          connectionId: id,
          idleTime
        })
        connectionsToRemove.push(id)
        continue
      }

      // Check connection state
      if (!connection.isActive) {
        logger.debug('Removing inactive connection', {
          connectionId: id
        })
        connectionsToRemove.push(id)
      }
    }

    // Remove unhealthy connections
    for (const id of connectionsToRemove) {
      this.removeConnection(id)
    }

    // Log health check results
    const stats = this.getStats()
    logger.debug('Health check completed', {
      removedConnections: connectionsToRemove.length,
      ...stats
    })
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionPoolStats {
    const totalConnections = this.connections.size
    const activeConnections = Array.from(this.connections.values()).filter(c => c.isActive).length
    const setupCompleteConnections = Array.from(this.connections.values()).filter(
      c => c.isSetupComplete
    ).length
    const idleConnections = totalConnections - activeConnections

    const totalConnectionRequests = Array.from(this.connections.values()).reduce(
      (sum, conn) => sum + conn.requestCount,
      0
    )

    const averageRequestsPerConnection =
      totalConnections > 0 ? totalConnectionRequests / totalConnections : 0

    const poolEfficiency =
      totalConnections > 0 ? (setupCompleteConnections / totalConnections) * 100 : 0

    return {
      totalConnections,
      activeConnections,
      idleConnections,
      setupCompleteConnections,
      totalRequests: this.totalRequests,
      averageRequestsPerConnection,
      poolEfficiency
    }
  }

  /**
   * Shutdown the connection pool gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down connection pool')
    this.isShuttingDown = true

    // Stop health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    // Disconnect all connections
    const disconnectPromises = Array.from(this.connections.values()).map(async connection => {
      try {
        await connection.client.disconnect()
      } catch (error) {
        logger.warn('Error disconnecting connection during shutdown', {
          connectionId: connection.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    await Promise.allSettled(disconnectPromises)
    this.connections.clear()

    logger.info('Connection pool shutdown completed')
    this.emit('poolShutdown')
  }
}
