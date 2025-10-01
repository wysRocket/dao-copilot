/**
 * ConnectionPoolManager - Manages a pool of warm WebSocket connections
 *
 * Provides a pool of pre-established WebSocket connections to reduce latency
 * and improve transcription reliability. Features connection health monitoring,
 * graceful recycling, and dynamic sizing based on demand.
 */

import {EventEmitter} from 'events'
import {GeminiLiveWebSocketClient, type GeminiLiveConfig} from '../services/gemini-live-websocket'
import {logger} from '../services/gemini-logger'
import {markPerformance, PERFORMANCE_MARKERS} from '../utils/performance-profiler'

// Connection states for pool management
export enum ConnectionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  WARMING = 'warming',
  VERIFYING = 'verifying',
  RECYCLING = 'recycling',
  FAILED = 'failed'
}

// Pool management configuration
export interface PoolConfig {
  minPoolSize: number // Minimum connections to maintain
  maxPoolSize: number // Maximum connections allowed
  warmupConnections: number // Number of connections to pre-warm
  maxConnectionAge: number // Max age before connection recycling (ms)
  maxConnectionUsage: number // Max usage count before recycling
  heartbeatInterval: number // Heartbeat check interval (ms)
  heartbeatTimeout: number // Heartbeat response timeout (ms)
  connectionTimeout: number // Connection establishment timeout (ms)
  enablePredictiveScaling: boolean // Enable usage pattern-based scaling
  enableGradualRecycling: boolean // Enable gradual vs immediate recycling
}

// Managed connection wrapper
export interface ManagedConnection {
  id: string
  client: GeminiLiveWebSocketClient
  state: ConnectionState
  createdAt: number
  lastUsed: number
  usageCount: number
  lastHeartbeat: number
  failures: number
  metrics: ConnectionMetrics
}

// Connection performance metrics
export interface ConnectionMetrics {
  averageResponseTime: number
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  lastActivity: number
  connectionLatency: number
}

// Pool statistics and telemetry
export interface PoolStats {
  totalConnections: number
  activeConnections: number
  idleConnections: number
  warmingConnections: number
  failedConnections: number
  averageResponseTime: number
  poolUtilization: number
  errorRate: number
  recyclingEvents: number
  queuedRequests: number
}

// Default pool configuration optimized for transcription workloads
const DEFAULT_POOL_CONFIG: PoolConfig = {
  minPoolSize: 2, // Always keep 2 warm connections
  maxPoolSize: 8, // Maximum 8 concurrent connections
  warmupConnections: 3, // Pre-warm 3 connections on startup
  maxConnectionAge: 3600000, // 1 hour max age
  maxConnectionUsage: 1000, // Recycle after 1000 uses
  heartbeatInterval: 15000, // 15 second heartbeat (per task requirement)
  heartbeatTimeout: 5000, // 5 second heartbeat timeout
  connectionTimeout: 10000, // 10 second connection timeout
  enablePredictiveScaling: true, // Enable smart scaling
  enableGradualRecycling: true // Gradual recycling to prevent disruption
}

/**
 * ConnectionPoolManager class - Main pool management system
 */
export class ConnectionPoolManager extends EventEmitter {
  private config: PoolConfig
  private geminiConfig: GeminiLiveConfig
  private connections: Map<string, ManagedConnection> = new Map()
  // Connection request queue
  private requestQueue: Array<{
    resolve: (connection: GeminiLiveWebSocketClient) => void
    reject: (error: Error) => void
    timestamp: number
  }> = []

  // Pool state tracking
  private isInitialized = false
  private isShuttingDown = false
  private heartbeatTimer: NodeJS.Timeout | null = null
  private recyclingTimer: NodeJS.Timeout | null = null
  private metricsTimer: NodeJS.Timeout | null = null

  // Pool statistics
  private stats: PoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    warmingConnections: 0,
    failedConnections: 0,
    averageResponseTime: 0,
    poolUtilization: 0,
    errorRate: 0,
    recyclingEvents: 0,
    queuedRequests: 0
  }

  // Usage history for predictive scaling
  private usageHistory: Map<string, number> = new Map()
  private currentLoad = 0

  constructor(geminiConfig: GeminiLiveConfig, poolConfig?: Partial<PoolConfig>) {
    super()
    this.geminiConfig = geminiConfig
    this.config = {...DEFAULT_POOL_CONFIG, ...poolConfig}

    logger.info('ConnectionPoolManager initialized', {
      minSize: this.config.minPoolSize,
      maxSize: this.config.maxPoolSize,
      warmupCount: this.config.warmupConnections
    })
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('ConnectionPoolManager already initialized')
      return
    }

    markPerformance(PERFORMANCE_MARKERS.CONNECTION_POOL_INIT_START)

    try {
      // Start monitoring and management tasks
      this.startHeartbeatMonitoring()
      this.startRecyclingProcess()
      this.startMetricsCollection()

      // Pre-warm initial connections
      await this.warmupConnections()

      this.isInitialized = true
      markPerformance(PERFORMANCE_MARKERS.CONNECTION_POOL_INIT_COMPLETE)

      logger.info('ConnectionPoolManager initialized successfully', {
        totalConnections: this.connections.size,
        warmConnections: this.getIdleConnections().length
      })

      this.emit('initialized', {
        totalConnections: this.connections.size,
        stats: this.stats
      })
    } catch (error) {
      logger.error('Failed to initialize ConnectionPoolManager', {error})
      throw error
    }
  }

  /**
   * Get an available connection from the pool
   */
  async getConnection(): Promise<GeminiLiveWebSocketClient> {
    if (!this.isInitialized) {
      throw new Error('ConnectionPoolManager not initialized')
    }

    if (this.isShuttingDown) {
      throw new Error('ConnectionPoolManager is shutting down')
    }

    // Try to get an idle connection first
    const idleConnection = this.getIdleConnection()
    if (idleConnection) {
      this.activateConnection(idleConnection)
      this.emit('connectionAcquired', {
        connectionId: idleConnection.id,
        fromPool: true
      })
      return idleConnection.client
    }

    // If no idle connections and we can create more, create a new one
    if (this.connections.size < this.config.maxPoolSize) {
      try {
        const newConnection = await this.createConnection()
        this.activateConnection(newConnection)
        this.emit('connectionAcquired', {
          connectionId: newConnection.id,
          fromPool: false
        })
        return newConnection.client
      } catch (error) {
        logger.error('Failed to create new connection', {error})
        // Fall through to queueing
      }
    }

    // Queue the request if pool is at capacity
    return new Promise((resolve, reject) => {
      const queueEntry = {
        resolve,
        reject,
        timestamp: Date.now()
      }

      this.requestQueue.push(queueEntry)
      this.stats.queuedRequests = this.requestQueue.length

      logger.info('Connection request queued', {
        queueSize: this.requestQueue.length,
        activeConnections: this.getActiveConnections().length
      })

      // Set timeout for queued request (1 second window per requirement)
      setTimeout(() => {
        const index = this.requestQueue.indexOf(queueEntry)
        if (index !== -1) {
          this.requestQueue.splice(index, 1)
          this.stats.queuedRequests = this.requestQueue.length
          reject(new Error('Connection request timeout - no connection available within 1s'))
        }
      }, 1000)
    })
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(client: GeminiLiveWebSocketClient): void {
    const connection = this.findConnectionByClient(client)
    if (!connection) {
      logger.warn('Attempted to release unknown connection')
      return
    }

    // Update connection statistics
    connection.lastUsed = Date.now()
    connection.usageCount++
    connection.state = ConnectionState.IDLE

    // Process any queued requests
    this.processRequestQueue()

    // Check if connection needs recycling
    this.scheduleConnectionRecyclingCheck(connection)

    this.emit('connectionReleased', {
      connectionId: connection.id,
      usageCount: connection.usageCount
    })

    logger.debug('Connection released to pool', {
      connectionId: connection.id,
      usageCount: connection.usageCount,
      queueSize: this.requestQueue.length
    })
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    this.updateStats()
    return {...this.stats}
  }

  /**
   * Shutdown the pool and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    logger.info('Shutting down ConnectionPoolManager')

    // Clear timers
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.recyclingTimer) clearInterval(this.recyclingTimer)
    if (this.metricsTimer) clearInterval(this.metricsTimer)

    // Reject any queued requests
    for (const request of this.requestQueue) {
      request.reject(new Error('ConnectionPoolManager shutting down'))
    }
    this.requestQueue.length = 0

    // Close all connections gracefully
    const closePromises: Promise<void>[] = []
    for (const connection of this.connections.values()) {
      closePromises.push(this.closeConnection(connection))
    }

    await Promise.allSettled(closePromises)
    this.connections.clear()

    this.emit('shutdown')
    logger.info('ConnectionPoolManager shutdown complete')
  }

  // === Private Implementation Methods ===

  /**
   * Pre-warm connections during startup
   */
  private async warmupConnections(): Promise<void> {
    const warmupCount = Math.min(this.config.warmupConnections, this.config.maxPoolSize)
    const warmupPromises: Promise<ManagedConnection>[] = []

    for (let i = 0; i < warmupCount; i++) {
      warmupPromises.push(this.createConnection())
    }

    try {
      const connections = await Promise.allSettled(warmupPromises)

      let successCount = 0
      for (const result of connections) {
        if (result.status === 'fulfilled') {
          successCount++
        } else {
          logger.error('Failed to create warmup connection', result.reason)
        }
      }

      logger.info(`Warmed up ${successCount}/${warmupCount} connections`)
    } catch (error) {
      logger.error('Error during connection warmup', {error})
      throw error
    }
  }

  /**
   * Create a new managed connection
   */
  private async createConnection(): Promise<ManagedConnection> {
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const connection: ManagedConnection = {
      id: connectionId,
      client: new GeminiLiveWebSocketClient(this.geminiConfig),
      state: ConnectionState.WARMING,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
      lastHeartbeat: Date.now(),
      failures: 0,
      metrics: {
        averageResponseTime: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        lastActivity: Date.now(),
        connectionLatency: 0
      }
    }

    // Set up event handlers for the connection
    this.setupConnectionEventHandlers(connection)

    // Add to pool
    this.connections.set(connectionId, connection)

    try {
      // Establish the connection
      const startTime = Date.now()
      await connection.client.connect()
      const connectionLatency = Date.now() - startTime

      connection.metrics.connectionLatency = connectionLatency
      connection.state = ConnectionState.IDLE
      connection.lastHeartbeat = Date.now()

      logger.info('New connection created successfully', {
        connectionId: connectionId,
        latency: connectionLatency + 'ms'
      })

      this.emit('connectionCreated', {
        connectionId: connectionId,
        latency: connectionLatency
      })

      return connection
    } catch (error) {
      // Remove failed connection from pool
      this.connections.delete(connectionId)
      connection.state = ConnectionState.FAILED

      logger.error('Failed to create connection', {
        connectionId: connectionId,
        error: error
      })

      throw error
    }
  }

  /**
   * Set up event handlers for a managed connection
   */
  private setupConnectionEventHandlers(connection: ManagedConnection): void {
    const client = connection.client

    client.on('connected', () => {
      connection.state = ConnectionState.IDLE
      connection.lastHeartbeat = Date.now()
      logger.debug('Connection established', {connectionId: connection.id})
    })

    client.on('disconnected', () => {
      connection.state = ConnectionState.FAILED
      connection.failures++
      logger.warn('Connection disconnected', {
        connectionId: connection.id,
        failures: connection.failures
      })

      // Schedule reconnection attempt
      this.scheduleConnectionRecovery(connection)
    })

    client.on('error', (error: Error) => {
      connection.state = ConnectionState.FAILED
      connection.failures++
      connection.metrics.failedRequests++

      logger.error('Connection error', {
        connectionId: connection.id,
        error: error.message,
        failures: connection.failures
      })
    })

    client.on('message', () => {
      connection.metrics.lastActivity = Date.now()
      connection.metrics.totalRequests++
      connection.metrics.successfulRequests++
    })
  }

  /**
   * Get an idle connection from the pool
   */
  private getIdleConnection(): ManagedConnection | null {
    const idleConnections = this.getIdleConnections()

    if (idleConnections.length === 0) {
      return null
    }

    // Return the least recently used idle connection
    return idleConnections.reduce((oldest, current) =>
      current.lastUsed < oldest.lastUsed ? current : oldest
    )
  }

  /**
   * Get all idle connections
   */
  private getIdleConnections(): ManagedConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.state === ConnectionState.IDLE)
  }

  /**
   * Get all active connections
   */
  private getActiveConnections(): ManagedConnection[] {
    return Array.from(this.connections.values()).filter(
      conn => conn.state === ConnectionState.ACTIVE
    )
  }

  /**
   * Activate a connection for use
   */
  private activateConnection(connection: ManagedConnection): void {
    connection.state = ConnectionState.ACTIVE
    connection.lastUsed = Date.now()
  }

  /**
   * Find connection by client instance
   */
  private findConnectionByClient(client: GeminiLiveWebSocketClient): ManagedConnection | null {
    for (const connection of this.connections.values()) {
      if (connection.client === client) {
        return connection
      }
    }
    return null
  }

  /**
   * Process queued connection requests
   */
  private processRequestQueue(): void {
    if (this.requestQueue.length === 0) {
      return
    }

    const idleConnection = this.getIdleConnection()
    if (!idleConnection) {
      return
    }

    const request = this.requestQueue.shift()
    if (request) {
      this.stats.queuedRequests = this.requestQueue.length
      this.activateConnection(idleConnection)
      request.resolve(idleConnection.client)

      logger.debug('Processed queued connection request', {
        connectionId: idleConnection.id,
        remainingQueue: this.requestQueue.length
      })
    }
  }

  /**
   * Start heartbeat monitoring for all connections
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeatCheck()
    }, this.config.heartbeatInterval)

    logger.debug('Started heartbeat monitoring', {
      interval: this.config.heartbeatInterval + 'ms'
    })
  }

  /**
   * Perform heartbeat check on all connections
   */
  private performHeartbeatCheck(): void {
    const now = Date.now()
    const promises: Promise<void>[] = []

    for (const connection of this.connections.values()) {
      if (connection.state === ConnectionState.FAILED) {
        continue
      }

      const timeSinceLastHeartbeat = now - connection.lastHeartbeat

      if (timeSinceLastHeartbeat > this.config.heartbeatInterval) {
        // Time to send a heartbeat ping
        promises.push(this.sendHeartbeatPing(connection))
      }
    }

    // Execute all pings concurrently
    if (promises.length > 0) {
      logger.debug('Sending heartbeat pings', {
        connectionCount: promises.length
      })
    }
  }

  /**
   * Send heartbeat ping to a specific connection
   */
  private async sendHeartbeatPing(connection: ManagedConnection): Promise<void> {
    try {
      const pingStart = Date.now()

      // For GeminiLiveWebSocketClient, we don't have a direct ping method
      // Instead, we check the connection health using available methods
      const isHealthy = await this.checkConnectionHealth(connection)

      if (isHealthy) {
        const pingDuration = Date.now() - pingStart

        // Update heartbeat timestamp on successful health check
        connection.lastHeartbeat = Date.now()
        connection.metrics.lastActivity = Date.now()

        logger.debug('Heartbeat successful', {
          connectionId: connection.id,
          healthCheckDuration: pingDuration + 'ms'
        })

        this.emit('heartbeatSuccess', {
          connectionId: connection.id,
          latency: pingDuration
        })
      } else {
        throw new Error('Connection health check failed')
      }
    } catch (error) {
      logger.warn('Heartbeat failed', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error)
      })

      connection.state = ConnectionState.FAILED
      connection.failures++

      this.emit('heartbeatFailure', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error)
      })

      // Schedule recovery
      this.scheduleConnectionRecovery(connection)
    }
  }

  /**
   * Check connection health when ping method is not available
   */
  private async checkConnectionHealth(connection: ManagedConnection): Promise<boolean> {
    try {
      // Use the isConnected() method available in GeminiLiveWebSocketClient
      if (typeof connection.client.isConnected === 'function') {
        return connection.client.isConnected()
      }

      // Fallback: If no health check method available, assume healthy if not failed
      return connection.state !== ConnectionState.FAILED
    } catch (error) {
      logger.debug('Connection health check error', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Start gradual recycling process
   */
  private startRecyclingProcess(): void {
    if (!this.config.enableGradualRecycling) {
      return
    }

    this.recyclingTimer = setInterval(() => {
      this.performGradualRecycling()
    }, 60000) // Check every minute

    logger.debug('Started gradual recycling process')
  }

  /**
   * Perform gradual connection recycling
   */
  private performGradualRecycling(): void {
    const now = Date.now()

    for (const connection of this.connections.values()) {
      if (this.shouldRecycleConnection(connection, now)) {
        this.scheduleConnectionRecycling(connection)
        break // Only recycle one connection at a time for gradual approach
      }
    }
  }

  /**
   * Check if a connection should be recycled
   */
  private shouldRecycleConnection(connection: ManagedConnection, now: number): boolean {
    if (connection.state !== ConnectionState.IDLE) {
      return false
    }

    // Age-based recycling
    const age = now - connection.createdAt
    if (age > this.config.maxConnectionAge) {
      return true
    }

    // Usage-based recycling
    if (connection.usageCount > this.config.maxConnectionUsage) {
      return true
    }

    // Failure-based recycling
    if (connection.failures > 3) {
      return true
    }

    return false
  }

  /**
   * Schedule connection recycling
   */
  private scheduleConnectionRecycling(connection: ManagedConnection): void {
    connection.state = ConnectionState.RECYCLING
    this.stats.recyclingEvents++

    logger.info('Scheduling connection recycling', {
      connectionId: connection.id,
      age: Date.now() - connection.createdAt,
      usageCount: connection.usageCount,
      failures: connection.failures
    })

    // Close the old connection and create a new one
    this.closeConnection(connection).then(() => {
      this.createConnection().catch(error => {
        logger.error('Failed to create replacement connection', error)
      })
    })
  }

  /**
   * Schedule connection recycling check
   */
  private scheduleConnectionRecyclingCheck(connection: ManagedConnection): void {
    if (this.shouldRecycleConnection(connection, Date.now())) {
      this.scheduleConnectionRecycling(connection)
    }
  }

  /**
   * Schedule connection recovery
   */
  private scheduleConnectionRecovery(connection: ManagedConnection): void {
    // Close and recreate the connection
    this.closeConnection(connection).then(() => {
      if (!this.isShuttingDown) {
        this.createConnection().catch(error => {
          logger.error('Failed to recover connection', error)
        })
      }
    })
  }

  /**
   * Close a connection gracefully
   */
  private async closeConnection(connection: ManagedConnection): Promise<void> {
    try {
      this.connections.delete(connection.id)

      if (connection.client) {
        await connection.client.disconnect()
      }

      logger.debug('Connection closed', {connectionId: connection.id})
    } catch (error) {
      logger.error('Error closing connection', {
        connectionId: connection.id,
        error: error
      })
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateStats()
      this.updateUsageHistory()
      this.performPredictiveScaling()
    }, 5000) // Update every 5 seconds
  }

  /**
   * Update pool statistics
   */
  private updateStats(): void {
    const connections = Array.from(this.connections.values())

    this.stats.totalConnections = connections.length
    this.stats.activeConnections = connections.filter(
      c => c.state === ConnectionState.ACTIVE
    ).length
    this.stats.idleConnections = connections.filter(c => c.state === ConnectionState.IDLE).length
    this.stats.warmingConnections = connections.filter(
      c => c.state === ConnectionState.WARMING
    ).length
    this.stats.failedConnections = connections.filter(
      c => c.state === ConnectionState.FAILED
    ).length

    // Calculate averages
    const totalRequests = connections.reduce((sum, c) => sum + c.metrics.totalRequests, 0)
    const totalResponseTime = connections.reduce(
      (sum, c) => sum + c.metrics.averageResponseTime * c.metrics.totalRequests,
      0
    )
    const totalFailures = connections.reduce((sum, c) => sum + c.metrics.failedRequests, 0)

    this.stats.averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0
    this.stats.errorRate = totalRequests > 0 ? totalFailures / totalRequests : 0
    this.stats.poolUtilization =
      this.config.maxPoolSize > 0 ? this.stats.activeConnections / this.config.maxPoolSize : 0
  }

  /**
   * Update usage history for predictive scaling
   */
  private updateUsageHistory(): void {
    if (!this.config.enablePredictiveScaling) {
      return
    }

    const currentHour = new Date().getHours().toString().padStart(2, '0')
    const currentUtilization = this.stats.poolUtilization

    // Exponential moving average: 70% historical, 30% current
    const existing = this.usageHistory.get(currentHour) || currentUtilization
    this.usageHistory.set(currentHour, existing * 0.7 + currentUtilization * 0.3)
  }

  /**
   * Perform predictive scaling based on usage patterns
   */
  private performPredictiveScaling(): void {
    if (!this.config.enablePredictiveScaling) {
      return
    }

    const nextHour = ((new Date().getHours() + 1) % 24).toString().padStart(2, '0')

    const predictedLoad = this.usageHistory.get(nextHour) || 0.5
    const targetPoolSize = Math.ceil(this.config.maxPoolSize * predictedLoad)

    const currentPoolSize = this.stats.totalConnections

    // Adjust pool size based on prediction
    if (targetPoolSize > currentPoolSize && currentPoolSize < this.config.maxPoolSize) {
      logger.info('Predictive scaling: increasing pool size', {
        current: currentPoolSize,
        target: targetPoolSize,
        predictedLoad: predictedLoad
      })

      // Create additional connections
      const connectionsToAdd = Math.min(
        targetPoolSize - currentPoolSize,
        this.config.maxPoolSize - currentPoolSize
      )
      for (let i = 0; i < connectionsToAdd; i++) {
        this.createConnection().catch(error => {
          logger.error('Failed to create connection for predictive scaling', error)
        })
      }
    }
  }
}
