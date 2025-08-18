/**
 * Dynamic WebSocket Configuration Manager
 *
 * Manages WebSocket configuration based on real-time network conditions
 * and diagnostic feedback for optimal low-latency performance
 */

import {getWebSocketDiagnostics, WebSocketMetrics} from './websocket-diagnostics'
import {
  LOW_LATENCY_WEBSOCKET_CONFIG,
  createLowLatencyConfig,
  optimizeGCPSDKForLowLatency,
  adjustConfigForNetworkCondition
} from './low-latency-config'

export interface ConfigurationUpdate {
  timestamp: number
  networkCondition: 'excellent' | 'good' | 'poor' | 'critical'
  config: Record<string, unknown>
  reason: string
  metrics: {
    latency: number
    connectionTime: number
    messageCount: number
  }
}

export interface ConfigurationManagerOptions {
  /** Enable automatic configuration adjustment based on performance */
  enableDynamicAdjustment?: boolean

  /** Update interval for configuration checks (ms) */
  updateInterval?: number

  /** Callback for configuration changes */
  onConfigurationChange?: (update: ConfigurationUpdate) => void

  /** Enable debug logging */
  debug?: boolean
}

/**
 * Dynamic WebSocket Configuration Manager
 *
 * Monitors network performance and automatically adjusts WebSocket configuration
 * for optimal low-latency real-time transcription
 */
export class WebSocketConfigurationManager {
  private options: Required<ConfigurationManagerOptions>
  private currentConfig: Record<string, unknown>
  private lastNetworkCondition: 'excellent' | 'good' | 'poor' | 'critical' = 'good'
  private updateIntervalId: NodeJS.Timeout | null = null
  private configHistory: ConfigurationUpdate[] = []
  private diagnostics = getWebSocketDiagnostics()

  constructor(
    initialConfig: Record<string, unknown> = {},
    options: ConfigurationManagerOptions = {}
  ) {
    this.options = {
      enableDynamicAdjustment: true,
      updateInterval: 5000, // Check every 5 seconds
      onConfigurationChange: () => {}, // Default no-op
      debug: process.env.NODE_ENV === 'development',
      ...options
    }

    // Initialize with low latency configuration
    this.currentConfig = createLowLatencyConfig(initialConfig)

    if (this.options.debug) {
      console.log('🔧 WebSocketConfigurationManager initialized with low latency config')
    }

    // Start dynamic adjustment if enabled
    if (this.options.enableDynamicAdjustment) {
      this.startDynamicAdjustment()
    }
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(): Record<string, unknown> {
    return {...this.currentConfig}
  }

  /**
   * Get configuration optimized for GCP SDK
   */
  getGCPOptimizedConfig(): Record<string, unknown> {
    return optimizeGCPSDKForLowLatency(this.currentConfig)
  }

  /**
   * Manually update configuration based on network condition
   */
  updateForNetworkCondition(condition: 'excellent' | 'good' | 'poor' | 'critical'): void {
    const previousConfig = {...this.currentConfig}
    const newConfig = adjustConfigForNetworkCondition(this.currentConfig, condition)

    this.currentConfig = newConfig
    this.lastNetworkCondition = condition

    const metrics = this.diagnostics.getMetrics()
    const update: ConfigurationUpdate = {
      timestamp: Date.now(),
      networkCondition: condition,
      config: newConfig,
      reason: `Manual adjustment for ${condition} network condition`,
      metrics: {
        latency: metrics.averageLatency,
        connectionTime: metrics.connectionTime,
        messageCount: metrics.totalMessages
      }
    }

    this.recordConfigurationChange(update)

    if (this.options.debug) {
      console.log(`🔧 Configuration updated for ${condition} network condition`, {
        previousTimeout: (previousConfig.websocket as Record<string, unknown>)?.timeout,
        newTimeout: (newConfig.websocket as Record<string, unknown>)?.timeout,
        latency: metrics.averageLatency
      })
    }
  }

  /**
   * Start dynamic configuration adjustment based on performance metrics
   */
  private startDynamicAdjustment(): void {
    if (this.updateIntervalId) return

    this.updateIntervalId = setInterval(() => {
      this.checkAndAdjustConfiguration()
    }, this.options.updateInterval)

    if (this.options.debug) {
      console.log('🔧 Dynamic configuration adjustment started')
    }
  }

  /**
   * Stop dynamic configuration adjustment
   */
  stopDynamicAdjustment(): void {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId)
      this.updateIntervalId = null

      if (this.options.debug) {
        console.log('🔧 Dynamic configuration adjustment stopped')
      }
    }
  }

  /**
   * Check performance metrics and adjust configuration if needed
   */
  private checkAndAdjustConfiguration(): void {
    const metrics = this.diagnostics.getMetrics()
    const currentCondition = this.assessNetworkCondition(metrics)

    // Only adjust if network condition changed significantly
    if (currentCondition !== this.lastNetworkCondition) {
      const reason =
        `Automatic adjustment: ${this.lastNetworkCondition} → ${currentCondition} ` +
        `(latency: ${metrics.averageLatency.toFixed(2)}ms)`

      this.updateForNetworkCondition(currentCondition)

      const update: ConfigurationUpdate = {
        timestamp: Date.now(),
        networkCondition: currentCondition,
        config: this.currentConfig,
        reason,
        metrics: {
          latency: metrics.averageLatency,
          connectionTime: metrics.connectionTime,
          messageCount: metrics.totalMessages
        }
      }

      this.recordConfigurationChange(update)
    }
  }

  /**
   * Assess network condition based on performance metrics
   */
  private assessNetworkCondition(
    metrics: WebSocketMetrics
  ): 'excellent' | 'good' | 'poor' | 'critical' {
    const {averageLatency, connectionTime, missedMessages, totalMessages} = metrics
    const missedRate = totalMessages > 0 ? missedMessages / totalMessages : 0

    // Excellent: Very low latency, fast connection, no missed messages
    if (averageLatency < 50 && connectionTime < 2000 && missedRate < 0.01) {
      return 'excellent'
    }

    // Good: Low latency, reasonable connection time, few missed messages
    if (averageLatency < 150 && connectionTime < 5000 && missedRate < 0.05) {
      return 'good'
    }

    // Poor: Higher latency, slower connection, some missed messages
    if (averageLatency < 300 && connectionTime < 10000 && missedRate < 0.15) {
      return 'poor'
    }

    // Critical: High latency, slow connection, many missed messages
    return 'critical'
  }

  /**
   * Record configuration change and notify callback
   */
  private recordConfigurationChange(update: ConfigurationUpdate): void {
    this.configHistory.push(update)

    // Keep only last 50 configuration changes
    if (this.configHistory.length > 50) {
      this.configHistory = this.configHistory.slice(-50)
    }

    // Notify callback
    this.options.onConfigurationChange(update)

    if (this.options.debug) {
      console.log('🔧 Configuration change recorded:', {
        condition: update.networkCondition,
        reason: update.reason,
        latency: update.metrics.latency
      })
    }
  }

  /**
   * Get configuration change history
   */
  getConfigurationHistory(): ConfigurationUpdate[] {
    return [...this.configHistory]
  }

  /**
   * Get current network condition assessment
   */
  getCurrentNetworkCondition(): 'excellent' | 'good' | 'poor' | 'critical' {
    return this.lastNetworkCondition
  }

  /**
   * Force configuration refresh based on current metrics
   */
  refreshConfiguration(): void {
    this.checkAndAdjustConfiguration()
  }

  /**
   * Reset to default low latency configuration
   */
  resetToLowLatencyDefaults(): void {
    this.currentConfig = createLowLatencyConfig()
    this.lastNetworkCondition = 'good'

    const update: ConfigurationUpdate = {
      timestamp: Date.now(),
      networkCondition: 'good',
      config: this.currentConfig,
      reason: 'Manual reset to low latency defaults',
      metrics: {
        latency: 0,
        connectionTime: 0,
        messageCount: 0
      }
    }

    this.recordConfigurationChange(update)

    if (this.options.debug) {
      console.log('🔧 Configuration reset to low latency defaults')
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    currentCondition: string
    averageLatency: number
    configurationChanges: number
    uptime: number
  } {
    const metrics = this.diagnostics.getMetrics()
    const firstChange = this.configHistory[0]
    const uptime = firstChange ? Date.now() - firstChange.timestamp : 0

    return {
      currentCondition: this.lastNetworkCondition,
      averageLatency: metrics.averageLatency,
      configurationChanges: this.configHistory.length,
      uptime
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.stopDynamicAdjustment()
    this.configHistory = []

    if (this.options.debug) {
      console.log('🔧 WebSocketConfigurationManager destroyed')
    }
  }
}

// Singleton instance for global configuration management
let globalConfigManager: WebSocketConfigurationManager | null = null

/**
 * Get or create global configuration manager
 */
export function getWebSocketConfigurationManager(
  initialConfig?: Record<string, unknown>,
  options?: ConfigurationManagerOptions
): WebSocketConfigurationManager {
  if (!globalConfigManager) {
    globalConfigManager = new WebSocketConfigurationManager(initialConfig, options)
  }
  return globalConfigManager
}

/**
 * Reset global configuration manager
 */
export function resetWebSocketConfigurationManager(): void {
  if (globalConfigManager) {
    globalConfigManager.destroy()
    globalConfigManager = null
  }
}

export default WebSocketConfigurationManager
