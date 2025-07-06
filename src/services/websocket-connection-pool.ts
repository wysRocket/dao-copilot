/**
 * WebSocket Connection Pool Manager
 *
 * Manages a pool of WebSocket connections with load balancing,
 * health monitoring, and automatic failover capabilities.
 */

import {EventEmitter} from 'events'
import {logger} from './gemini-logger'
import {WebSocketConnectionEstablisher, ConnectionConfig} from './websocket-connection-establisher'
import {WebSocketConfigManager} from './websocket-config'
import {WebSocketHealthMonitor} from './websocket-health-monitor'

export interface PoolConfig {
  minConnections: number
  maxConnections: number
  connectionTimeout: number
  healthCheckInterval: number
  connectionIdleTimeout: number
  loadBalancingStrategy: 'round-robin' | 'least-connections' | 'health-based'
  enableFailover: boolean
  failoverThreshold: number // Health score threshold for failover
}

export interface PoolConnection {
  id: string
  websocket: WebSocket
  healthMonitor: WebSocketHealthMonitor
  lastUsed: number
  messageCount: number
  healthScore: number
  isHealthy: boolean
}

export interface PoolStats {
  totalConnections: number
  healthyConnections: number
  activeConnections: number
  idleConnections: number
  averageHealthScore: number
  totalMessages: number
  errorRate: number
}

/**
 * WebSocket Connection Pool Manager
 */
export class WebSocketConnectionPool extends EventEmitter {
  private config: PoolConfig
  private wsConfig: WebSocketConfigManager
  private connectionEstablisher: WebSocketConnectionEstablisher
  private connections = new Map<string, PoolConnection>()
  private currentConnectionIndex = 0
  private isInitialized = false
  private healthCheckInterval: NodeJS.Timeout | null = null
  private maintenanceInterval: NodeJS.Timeout | null = null

  constructor(
    poolConfig: Partial<PoolConfig>,
    connectionConfig?: ConnectionConfig,
    wsConfig?: WebSocketConfigManager
  ) {
    super()

    this.wsConfig = wsConfig || new WebSocketConfigManager()

    this.config = {
      minConnections: 2,
      maxConnections: 10,
      connectionTimeout: 10000,
      healthCheckInterval: 30000,
      connectionIdleTimeout: 300000, // 5 minutes
      loadBalancingStrategy: 'health-based',
      enableFailover: true,
      failoverThreshold: 70,
      ...poolConfig
    }

    this.connectionEstablisher = new WebSocketConnectionEstablisher(
      connectionConfig || {
        apiKey: this.wsConfig.get('apiKey'),
        endpoint: this.wsConfig.get('endpoint'),
        model: this.wsConfig.get('model')
      },
      undefined,
      this.wsConfig
    )

    // Forward events from connection establisher
    this.connectionEstablisher.on(
      'connectionEstablished',
      this.handleConnectionEstablished.bind(this)
    )
    this.connectionEstablisher.on('connectionFailed', this.handleConnectionFailed.bind(this))
    this.connectionEstablisher.on('healthAlert', this.handleHealthAlert.bind(this))

    logger.info('WebSocket Connection Pool initialized', {
      minConnections: this.config.minConnections,
      maxConnections: this.config.maxConnections,
      loadBalancingStrategy: this.config.loadBalancingStrategy
    })
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    logger.info('Initializing WebSocket connection pool', {
      targetConnections: this.config.minConnections
    })

    // Create initial connections
    const connectionPromises: Promise<void>[] = []
    for (let i = 0; i < this.config.minConnections; i++) {
      connectionPromises.push(this.createConnection())
    }

    await Promise.allSettled(connectionPromises)

    // Start maintenance tasks
    this.startHealthChecks()
    this.startMaintenance()

    this.isInitialized = true

    const healthyConnections = this.getHealthyConnections().length
    logger.info('WebSocket connection pool initialized', {
      targetConnections: this.config.minConnections,
      healthyConnections,
      successRate: (healthyConnections / this.config.minConnections) * 100
    })

    this.emit('poolInitialized', {
      totalConnections: this.connections.size,
      healthyConnections
    })
  }

  /**
   * Get the best available connection based on load balancing strategy
   */
  getConnection(): PoolConnection | null {
    const healthyConnections = this.getHealthyConnections()

    if (healthyConnections.length === 0) {
      logger.warn('No healthy connections available')
      this.emit('noHealthyConnections')
      return null
    }

    let selectedConnection: PoolConnection

    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        selectedConnection = this.getRoundRobinConnection(healthyConnections)
        break
      case 'least-connections':
        selectedConnection = this.getLeastConnectionsConnection(healthyConnections)
        break
      case 'health-based':
        selectedConnection = this.getHealthBasedConnection(healthyConnections)
        break
      default:
        selectedConnection = healthyConnections[0]
    }

    // Update usage statistics
    selectedConnection.lastUsed = Date.now()
    selectedConnection.messageCount++

    logger.debug('Connection selected', {
      connectionId: selectedConnection.id,
      strategy: this.config.loadBalancingStrategy,
      healthScore: selectedConnection.healthScore,
      messageCount: selectedConnection.messageCount
    })

    return selectedConnection
  }

  /**
   * Release a connection back to the pool (optional for connection tracking)
   */
  releaseConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId)
    if (connection) {
      // Connection is automatically available again
      logger.debug('Connection released', {connectionId})
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): PoolStats {
    const connections = Array.from(this.connections.values())
    const healthyConnections = connections.filter(c => c.isHealthy)
    const activeConnections = connections.filter(c => Date.now() - c.lastUsed < 60000) // Active in last minute

    const totalMessages = connections.reduce((sum, c) => sum + c.messageCount, 0)
    const averageHealthScore =
      connections.length > 0
        ? connections.reduce((sum, c) => sum + c.healthScore, 0) / connections.length
        : 0

    return {
      totalConnections: connections.length,
      healthyConnections: healthyConnections.length,
      activeConnections: activeConnections.length,
      idleConnections: connections.length - activeConnections.length,
      averageHealthScore: Math.round(averageHealthScore),
      totalMessages,
      errorRate: 0 // Would need error tracking implementation
    }
  }

  /**
   * Scale the pool up or down
   */
  async scalePool(targetSize: number): Promise<void> {
    if (targetSize < this.config.minConnections || targetSize > this.config.maxConnections) {
      throw new Error(
        `Target size ${targetSize} is outside allowed range (${this.config.minConnections}-${this.config.maxConnections})`
      )
    }

    const currentSize = this.connections.size

    if (targetSize > currentSize) {
      // Scale up
      const connectionsToAdd = targetSize - currentSize
      logger.info('Scaling pool up', {currentSize, targetSize, connectionsToAdd})

      const connectionPromises: Promise<void>[] = []
      for (let i = 0; i < connectionsToAdd; i++) {
        connectionPromises.push(this.createConnection())
      }

      await Promise.allSettled(connectionPromises)
    } else if (targetSize < currentSize) {
      // Scale down
      const connectionsToRemove = currentSize - targetSize
      logger.info('Scaling pool down', {currentSize, targetSize, connectionsToRemove})

      await this.removeConnections(connectionsToRemove)
    }

    this.emit('poolScaled', {
      previousSize: currentSize,
      newSize: this.connections.size,
      targetSize
    })
  }

  /**
   * Drain the pool (close all connections)
   */
  async drain(): Promise<void> {
    logger.info('Draining connection pool', {
      connections: this.connections.size
    })

    const connectionIds = Array.from(this.connections.keys())
    await Promise.all(connectionIds.map(id => this.removeConnection(id)))

    this.stopHealthChecks()
    this.stopMaintenance()

    this.isInitialized = false

    logger.info('Connection pool drained')
    this.emit('poolDrained')
  }

  /**
   * Create a new connection and add it to the pool
   */
  private async createConnection(): Promise<void> {
    try {
      const result = await this.connectionEstablisher.establishConnection()

      if (result.success && result.websocket) {
        // Connection establishment will trigger handleConnectionEstablished
        logger.debug('Connection creation initiated')
      } else {
        throw new Error(result.error?.message || 'Connection establishment failed')
      }
    } catch (error) {
      logger.error('Failed to create connection', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * Remove a specific connection from the pool
   */
  private async removeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return
    }

    logger.debug('Removing connection from pool', {connectionId})

    // Clean up health monitor
    connection.healthMonitor.cleanup()

    // Close WebSocket connection
    await this.connectionEstablisher.closeConnection(connectionId)

    // Remove from pool
    this.connections.delete(connectionId)

    this.emit('connectionRemoved', {connectionId})
  }

  /**
   * Remove multiple connections (for scaling down)
   */
  private async removeConnections(count: number): Promise<void> {
    // Prefer removing unhealthy connections first, then least recently used
    const connections = Array.from(this.connections.values())
    const sortedConnections = connections.sort((a, b) => {
      // Unhealthy connections first
      if (a.isHealthy !== b.isHealthy) {
        return a.isHealthy ? 1 : -1
      }
      // Then by last used (oldest first)
      return a.lastUsed - b.lastUsed
    })

    const connectionsToRemove = sortedConnections.slice(0, count)
    await Promise.all(connectionsToRemove.map(c => this.removeConnection(c.id)))
  }

  /**
   * Get healthy connections
   */
  private getHealthyConnections(): PoolConnection[] {
    return Array.from(this.connections.values()).filter(c => c.isHealthy)
  }

  /**
   * Round-robin connection selection
   */
  private getRoundRobinConnection(healthyConnections: PoolConnection[]): PoolConnection {
    const connection = healthyConnections[this.currentConnectionIndex % healthyConnections.length]
    this.currentConnectionIndex = (this.currentConnectionIndex + 1) % healthyConnections.length
    return connection
  }

  /**
   * Least connections selection
   */
  private getLeastConnectionsConnection(healthyConnections: PoolConnection[]): PoolConnection {
    return healthyConnections.reduce((least, current) =>
      current.messageCount < least.messageCount ? current : least
    )
  }

  /**
   * Health-based connection selection
   */
  private getHealthBasedConnection(healthyConnections: PoolConnection[]): PoolConnection {
    // Sort by health score (highest first), then by message count (lowest first)
    return healthyConnections.sort((a, b) => {
      if (b.healthScore !== a.healthScore) {
        return b.healthScore - a.healthScore
      }
      return a.messageCount - b.messageCount
    })[0]
  }

  /**
   * Start health checks for all connections
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks()
    }, this.config.healthCheckInterval)

    logger.debug('Health checks started', {
      interval: this.config.healthCheckInterval
    })
  }

  /**
   * Stop health checks
   */
  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      logger.debug('Health checks stopped')
    }
  }

  /**
   * Start maintenance tasks
   */
  private startMaintenance(): void {
    if (this.maintenanceInterval) {
      return
    }

    this.maintenanceInterval = setInterval(() => {
      this.performMaintenance()
    }, 60000) // Run maintenance every minute

    logger.debug('Maintenance tasks started')
  }

  /**
   * Stop maintenance tasks
   */
  private stopMaintenance(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval)
      this.maintenanceInterval = null
      logger.debug('Maintenance tasks stopped')
    }
  }

  /**
   * Perform health checks on all connections
   */
  private performHealthChecks(): void {
    this.connections.forEach(async connection => {
      const healthStatus = connection.healthMonitor.getHealthStatus()

      connection.healthScore = healthStatus.score
      connection.isHealthy =
        healthStatus.healthy && healthStatus.score >= this.config.failoverThreshold

      if (!connection.isHealthy) {
        logger.warn('Connection health degraded', {
          connectionId: connection.id,
          healthScore: connection.healthScore,
          healthy: healthStatus.healthy,
          issues: healthStatus.issues.length
        })

        if (this.config.enableFailover && healthStatus.score < this.config.failoverThreshold) {
          this.emit('connectionFailover', {
            connectionId: connection.id,
            healthScore: healthStatus.score,
            reason: 'Health score below threshold'
          })
        }
      }
    })

    // Check if we need to scale the pool
    const healthyCount = this.getHealthyConnections().length
    if (healthyCount < this.config.minConnections) {
      const connectionsNeeded = this.config.minConnections - healthyCount
      logger.info('Scaling up pool due to unhealthy connections', {
        healthyCount,
        minRequired: this.config.minConnections,
        connectionsNeeded
      })

      // Create replacement connections
      for (
        let i = 0;
        i < connectionsNeeded && this.connections.size < this.config.maxConnections;
        i++
      ) {
        this.createConnection().catch(error => {
          logger.error('Failed to create replacement connection', {
            error: error instanceof Error ? error.message : String(error)
          })
        })
      }
    }
  }

  /**
   * Perform maintenance tasks
   */
  private async performMaintenance(): Promise<void> {
    const now = Date.now()

    // Remove idle connections if we have more than minimum
    if (this.connections.size > this.config.minConnections) {
      const idleConnections = Array.from(this.connections.values()).filter(
        c => now - c.lastUsed > this.config.connectionIdleTimeout
      )

      if (idleConnections.length > 0) {
        const maxToRemove = this.connections.size - this.config.minConnections
        const connectionsToRemove = idleConnections.slice(0, maxToRemove)

        logger.info('Removing idle connections', {
          idleConnections: idleConnections.length,
          removing: connectionsToRemove.length
        })

        await Promise.all(connectionsToRemove.map(c => this.removeConnection(c.id)))
      }
    }

    // Emit pool statistics
    this.emit('poolStats', this.getPoolStats())
  }

  /**
   * Handle successful connection establishment
   */
  private handleConnectionEstablished(event: {
    connectionId: string
    websocket: WebSocket
    healthMonitor: WebSocketHealthMonitor
    metrics: Record<string, unknown>
  }): void {
    const {connectionId, websocket, healthMonitor} = event

    const poolConnection: PoolConnection = {
      id: connectionId,
      websocket,
      healthMonitor,
      lastUsed: Date.now(),
      messageCount: 0,
      healthScore: 100,
      isHealthy: true
    }

    this.connections.set(connectionId, poolConnection)

    logger.info('Connection added to pool', {
      connectionId,
      totalConnections: this.connections.size
    })

    this.emit('connectionAdded', {
      connectionId,
      totalConnections: this.connections.size
    })
  }

  /**
   * Handle connection establishment failure
   */
  private handleConnectionFailed(event: {
    connectionId: string
    error?: Error
    metrics: Record<string, unknown>
  }): void {
    const {connectionId, error} = event

    logger.error('Connection establishment failed', {
      connectionId,
      error: error?.message
    })

    this.emit('connectionFailed', event)
  }

  /**
   * Handle health alerts from individual connections
   */
  private handleHealthAlert(event: {
    connectionId: string
    alert: {
      category: string
      severity: string
      message: string
    }
  }): void {
    const {connectionId, alert} = event

    logger.warn('Health alert from connection', {
      connectionId,
      alertType: alert.category,
      severity: alert.severity,
      message: alert.message
    })

    this.emit('connectionHealthAlert', event)
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    await this.drain()
    await this.connectionEstablisher.cleanup()
    this.removeAllListeners()

    logger.info('WebSocket Connection Pool cleaned up')
  }
}

// Export factory function
export function createConnectionPool(
  poolConfig?: Partial<PoolConfig>,
  connectionConfig?: ConnectionConfig,
  wsConfig?: WebSocketConfigManager
): WebSocketConnectionPool {
  return new WebSocketConnectionPool(poolConfig || {}, connectionConfig, wsConfig)
}
