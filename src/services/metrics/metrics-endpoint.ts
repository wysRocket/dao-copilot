/**
 * Metrics Endpoint Service
 * 
 * Provides HTTP endpoint for Prometheus metrics scraping
 */

import * as express from 'express'
import { Server } from 'http'
import { register } from 'prom-client'
import { logger } from '../logging'
import { initializeMetrics, updateSystemMetrics } from './prometheus-metrics'
import { webSocketMetrics } from './websocket-metrics'

/**
 * Metrics Server Configuration
 */
interface MetricsServerConfig {
  port: number
  host: string
  endpoint: string
  updateInterval: number
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: MetricsServerConfig = {
  port: 9090,
  host: '0.0.0.0',
  endpoint: '/metrics',
  updateInterval: 5000 // 5 seconds
}

/**
 * Metrics Endpoint Service
 */
export class MetricsEndpointService {
  private app: express.Application
  private server: Server | null = null
  private updateTimer: NodeJS.Timeout | null = null
  private config: MetricsServerConfig
  private isRunning: boolean = false

  constructor(config: Partial<MetricsServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.app = express()
    this.setupRoutes()
    
    // Initialize metrics on startup
    initializeMetrics()
    
    logger.info('Metrics endpoint service initialized', {
      metadata: { config: this.config }
    })
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const summary = webSocketMetrics.getMetricsSummary()
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: {
          activeConnections: summary.activeConnections,
          totalMessageQueues: summary.totalMessageQueues,
          uptime: process.uptime()
        }
      })
    })

    // Metrics endpoint
    this.app.get(this.config.endpoint, async (req, res) => {
      try {
        // Update system metrics before serving
        updateSystemMetrics()
        
        // Serve Prometheus metrics
        res.set('Content-Type', register.contentType)
        const metrics = await register.metrics()
        res.send(metrics)
        
        logger.debug('Metrics served successfully', {
          metadata: { 
            endpoint: this.config.endpoint,
            size: metrics.length
          }
        })
      } catch (error) {
        logger.error('Failed to serve metrics', error as Error)
        res.status(500).json({
          error: 'Failed to generate metrics',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Metrics info endpoint
    this.app.get('/metrics/info', async (req, res) => {
      try {
        const metricObjects = await register.getMetricsAsJSON()
        const metricNames = metricObjects.map(metric => ({
          name: metric.name,
          help: metric.help,
          type: String(metric.type)
        }))

        res.json({
          registry: 'prometheus',
          metrics: metricNames,
          total: metricNames.length,
          endpoint: this.config.endpoint
        })
      } catch (error) {
        logger.error('Failed to get metrics info', error as Error)
        res.status(500).json({
          error: 'Failed to get metrics info',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // WebSocket metrics summary endpoint
    this.app.get('/metrics/websocket', (req, res) => {
      const summary = webSocketMetrics.getMetricsSummary()
      res.json({
        websocket: summary,
        timestamp: new Date().toISOString()
      })
    })

    // Error handling middleware
    this.app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Metrics endpoint error', error, {
        metadata: { url: req.url }
      })
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      })
    })
  }

  /**
   * Start the metrics server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Metrics server already running')
      return
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          this.isRunning = true
          
          // Start periodic metrics updates
          this.startPeriodicUpdates()
          
          logger.info('Metrics server started', {
            metadata: {
              host: this.config.host,
              port: this.config.port,
              endpoint: this.config.endpoint,
              updateInterval: this.config.updateInterval
            }
          })
          
          resolve()
        })

        this.server.on('error', (error) => {
          logger.error('Metrics server error', error)
          reject(error)
        })
        
      } catch (error) {
        logger.error('Failed to start metrics server', error as Error)
        reject(error)
      }
    })
  }

  /**
   * Stop the metrics server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Metrics server not running')
      return
    }

    return new Promise((resolve) => {
      // Stop periodic updates
      this.stopPeriodicUpdates()
      
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false
          logger.info('Metrics server stopped')
          resolve()
        })
      } else {
        this.isRunning = false
        resolve()
      }
    })
  }

  /**
   * Start periodic metrics updates
   */
  private startPeriodicUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
    }

    this.updateTimer = setInterval(() => {
      try {
        updateSystemMetrics()
        logger.debug('System metrics updated periodically')
      } catch (error) {
        logger.error('Failed to update system metrics', error as Error)
      }
    }, this.config.updateInterval)

    logger.debug('Periodic metrics updates started', {
      metadata: { interval: this.config.updateInterval }
    })
  }

  /**
   * Stop periodic metrics updates
   */
  private stopPeriodicUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
      logger.debug('Periodic metrics updates stopped')
    }
  }

  /**
   * Get server status
   */
  getStatus(): {
    isRunning: boolean
    config: MetricsServerConfig
    uptime?: number
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      uptime: this.isRunning ? process.uptime() : undefined
    }
  }

  /**
   * Update server configuration
   */
  updateConfig(newConfig: Partial<MetricsServerConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...newConfig }
    
    logger.info('Metrics server configuration updated', {
      metadata: { oldConfig, newConfig: this.config }
    })

    // Restart periodic updates if interval changed
    if (oldConfig.updateInterval !== this.config.updateInterval && this.isRunning) {
      this.startPeriodicUpdates()
    }
  }

  /**
   * Force metrics update
   */
  forceUpdate(): void {
    try {
      updateSystemMetrics()
      logger.debug('Forced metrics update completed')
    } catch (error) {
      logger.error('Failed to force update metrics', error as Error)
      throw error
    }
  }

  /**
   * Get current metrics as JSON
   */
  async getMetricsAsJSON(): Promise<Array<{ name: string; help: string; type: string }>> {
    try {
      updateSystemMetrics()
      const metrics = await register.getMetricsAsJSON()
      return metrics.map(metric => ({
        name: metric.name,
        help: metric.help,
        type: String(metric.type)
      }))
    } catch (error) {
      logger.error('Failed to get metrics as JSON', error as Error)
      throw error
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    try {
      register.clear()
      initializeMetrics() // Reinitialize after clearing
      webSocketMetrics.reset()
      logger.info('All metrics cleared and reinitialized')
    } catch (error) {
      logger.error('Failed to clear metrics', error as Error)
      throw error
    }
  }
}

// Export singleton instance
export const metricsEndpoint = new MetricsEndpointService()

// Utility functions
export async function startMetricsServer(config?: Partial<MetricsServerConfig>): Promise<void> {
  if (config) {
    metricsEndpoint.updateConfig(config)
  }
  await metricsEndpoint.start()
}

export async function stopMetricsServer(): Promise<void> {
  await metricsEndpoint.stop()
}

export function getMetricsServerStatus() {
  return metricsEndpoint.getStatus()
}
