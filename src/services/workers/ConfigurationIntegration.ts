/**
 * Configuration Integration Service
 *
 * Bridges the FeatureFlagManager with all transcription loss prevention components,
 * enabling dynamic runtime configuration updates without application restart.
 *
 * Features:
 * - Real-time configuration propagation
 * - Component lifecycle management
 * - Configuration validation and fallback
 * - Event-driven updates
 * - Performance monitoring integration
 */

import {EventEmitter} from 'events'
import {
  FeatureFlagManager,
  OrphanDetectionConfig,
  GapDetectionConfig,
  RecoveryConfig,
  TelemetryConfig,
  getFeatureFlagManager
} from './FeatureFlagManager'

// Import worker components (interfaces/types for now since they're in separate files)
interface OrphanDetectionWorkerInterface {
  updateConfiguration(config: OrphanDetectionConfig): Promise<void>
  isRunning(): boolean
  stop(): Promise<void>
  start(): Promise<void>
}

interface GapDetectorInterface {
  updateConfiguration(config: GapDetectionConfig): Promise<void>
  isEnabled(): boolean
  setEnabled(enabled: boolean): Promise<void>
}

interface RecoveryManagerInterface {
  updateConfiguration(config: RecoveryConfig): Promise<void>
  isEnabled(): boolean
  setEnabled(enabled: boolean): Promise<void>
}

interface TelemetryCoordinatorInterface {
  updateConfiguration(config: TelemetryConfig): Promise<void>
  isEnabled(): boolean
  setEnabled(enabled: boolean): Promise<void>
}

// ================================================================
// Configuration Integration Events
// ================================================================

export interface ConfigurationIntegrationEvents {
  'component:registered': (componentType: string, component: unknown) => void
  'component:unregistered': (componentType: string) => void
  'config:propagated': (componentType: string, config: unknown) => void
  'config:propagation:failed': (componentType: string, error: Error) => void
  'integration:started': () => void
  'integration:stopped': () => void
  'integration:error': (error: Error, context: string) => void
}

// ================================================================
// Configuration Integration Manager
// ================================================================

export class ConfigurationIntegration extends EventEmitter {
  private featureFlagManager: FeatureFlagManager
  private orphanDetectionWorker?: OrphanDetectionWorkerInterface
  private gapDetector?: GapDetectorInterface
  private recoveryManager?: RecoveryManagerInterface
  private telemetryCoordinator?: TelemetryCoordinatorInterface
  private isStarted = false

  constructor(featureFlagManager?: FeatureFlagManager) {
    super()
    this.featureFlagManager = featureFlagManager || getFeatureFlagManager()
    this.setupEventListeners()
  }

  // ================================================================
  // Component Registration
  // ================================================================

  /**
   * Register OrphanDetectionWorker instance
   */
  registerOrphanDetectionWorker(worker: OrphanDetectionWorkerInterface): void {
    this.orphanDetectionWorker = worker
    this.emit('component:registered', 'orphanDetectionWorker', worker)
    console.log('ConfigurationIntegration: OrphanDetectionWorker registered')

    // Apply current configuration immediately if integration is started
    if (this.isStarted) {
      this.propagateOrphanDetectionConfig().catch(error => {
        console.error(
          'ConfigurationIntegration: Failed to apply initial orphan detection config:',
          error
        )
      })
    }
  }

  /**
   * Register GapDetector instance
   */
  registerGapDetector(detector: GapDetectorInterface): void {
    this.gapDetector = detector
    this.emit('component:registered', 'gapDetector', detector)
    console.log('ConfigurationIntegration: GapDetector registered')

    // Apply current configuration immediately if integration is started
    if (this.isStarted) {
      this.propagateGapDetectionConfig().catch(error => {
        console.error(
          'ConfigurationIntegration: Failed to apply initial gap detection config:',
          error
        )
      })
    }
  }

  /**
   * Register RecoveryManager instance
   */
  registerRecoveryManager(manager: RecoveryManagerInterface): void {
    this.recoveryManager = manager
    this.emit('component:registered', 'recoveryManager', manager)
    console.log('ConfigurationIntegration: RecoveryManager registered')

    // Apply current configuration immediately if integration is started
    if (this.isStarted) {
      this.propagateRecoveryConfig().catch(error => {
        console.error('ConfigurationIntegration: Failed to apply initial recovery config:', error)
      })
    }
  }

  /**
   * Register TelemetryCoordinator instance
   */
  registerTelemetryCoordinator(coordinator: TelemetryCoordinatorInterface): void {
    this.telemetryCoordinator = coordinator
    this.emit('component:registered', 'telemetryCoordinator', coordinator)
    console.log('ConfigurationIntegration: TelemetryCoordinator registered')

    // Apply current configuration immediately if integration is started
    if (this.isStarted) {
      this.propagateTelemetryConfig().catch(error => {
        console.error('ConfigurationIntegration: Failed to apply initial telemetry config:', error)
      })
    }
  }

  // ================================================================
  // Component Unregistration
  // ================================================================

  /**
   * Unregister OrphanDetectionWorker
   */
  unregisterOrphanDetectionWorker(): void {
    if (this.orphanDetectionWorker) {
      this.orphanDetectionWorker = undefined
      this.emit('component:unregistered', 'orphanDetectionWorker')
      console.log('ConfigurationIntegration: OrphanDetectionWorker unregistered')
    }
  }

  /**
   * Unregister GapDetector
   */
  unregisterGapDetector(): void {
    if (this.gapDetector) {
      this.gapDetector = undefined
      this.emit('component:unregistered', 'gapDetector')
      console.log('ConfigurationIntegration: GapDetector unregistered')
    }
  }

  /**
   * Unregister RecoveryManager
   */
  unregisterRecoveryManager(): void {
    if (this.recoveryManager) {
      this.recoveryManager = undefined
      this.emit('component:unregistered', 'recoveryManager')
      console.log('ConfigurationIntegration: RecoveryManager unregistered')
    }
  }

  /**
   * Unregister TelemetryCoordinator
   */
  unregisterTelemetryCoordinator(): void {
    if (this.telemetryCoordinator) {
      this.telemetryCoordinator = undefined
      this.emit('component:unregistered', 'telemetryCoordinator')
      console.log('ConfigurationIntegration: TelemetryCoordinator unregistered')
    }
  }

  // ================================================================
  // Lifecycle Management
  // ================================================================

  /**
   * Start configuration integration
   */
  async start(): Promise<void> {
    try {
      if (this.isStarted) {
        console.log('ConfigurationIntegration: Already started')
        return
      }

      // Ensure FeatureFlagManager is initialized
      const systemInfo = this.featureFlagManager.getSystemInfo()
      if (!systemInfo.isInitialized) {
        await this.featureFlagManager.initialize()
      }

      // Apply current configurations to all registered components
      await this.propagateAllConfigurations()

      this.isStarted = true
      this.emit('integration:started')
      console.log('ConfigurationIntegration: Started successfully')
    } catch (error) {
      console.error('ConfigurationIntegration: Failed to start:', error)
      this.emit('integration:error', error as Error, 'start')
      throw error
    }
  }

  /**
   * Stop configuration integration
   */
  async stop(): Promise<void> {
    try {
      if (!this.isStarted) {
        console.log('ConfigurationIntegration: Already stopped')
        return
      }

      this.isStarted = false
      this.emit('integration:stopped')
      console.log('ConfigurationIntegration: Stopped successfully')
    } catch (error) {
      console.error('ConfigurationIntegration: Error during stop:', error)
      this.emit('integration:error', error as Error, 'stop')
    }
  }

  // ================================================================
  // Configuration Propagation
  // ================================================================

  /**
   * Propagate all configurations to registered components
   */
  private async propagateAllConfigurations(): Promise<void> {
    const propagationPromises = [
      this.propagateOrphanDetectionConfig(),
      this.propagateGapDetectionConfig(),
      this.propagateRecoveryConfig(),
      this.propagateTelemetryConfig()
    ]

    // Wait for all propagations to complete, but don't fail if some components aren't registered
    const results = await Promise.allSettled(propagationPromises)

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const componentTypes = ['orphanDetection', 'gapDetection', 'recovery', 'telemetry']
        console.warn(
          `ConfigurationIntegration: Failed to propagate ${componentTypes[index]} config:`,
          result.reason
        )
      }
    })
  }

  /**
   * Propagate orphan detection configuration
   */
  private async propagateOrphanDetectionConfig(): Promise<void> {
    if (!this.orphanDetectionWorker) {
      return // Component not registered
    }

    try {
      const config = this.featureFlagManager.getOrphanDetectionConfig()
      await this.orphanDetectionWorker.updateConfiguration(config)

      // Handle enabled/disabled state
      if (config.enabled && !this.orphanDetectionWorker.isRunning()) {
        await this.orphanDetectionWorker.start()
      } else if (!config.enabled && this.orphanDetectionWorker.isRunning()) {
        await this.orphanDetectionWorker.stop()
      }

      this.emit('config:propagated', 'orphanDetectionWorker', config)
      console.log('ConfigurationIntegration: OrphanDetectionWorker config propagated')
    } catch (error) {
      this.emit('config:propagation:failed', 'orphanDetectionWorker', error as Error)
      console.error('ConfigurationIntegration: Failed to propagate orphan detection config:', error)
      throw error
    }
  }

  /**
   * Propagate gap detection configuration
   */
  private async propagateGapDetectionConfig(): Promise<void> {
    if (!this.gapDetector) {
      return // Component not registered
    }

    try {
      const config = this.featureFlagManager.getGapDetectionConfig()
      await this.gapDetector.updateConfiguration(config)

      // Handle enabled/disabled state
      if (config.enabled !== this.gapDetector.isEnabled()) {
        await this.gapDetector.setEnabled(config.enabled)
      }

      this.emit('config:propagated', 'gapDetector', config)
      console.log('ConfigurationIntegration: GapDetector config propagated')
    } catch (error) {
      this.emit('config:propagation:failed', 'gapDetector', error as Error)
      console.error('ConfigurationIntegration: Failed to propagate gap detection config:', error)
      throw error
    }
  }

  /**
   * Propagate recovery configuration
   */
  private async propagateRecoveryConfig(): Promise<void> {
    if (!this.recoveryManager) {
      return // Component not registered
    }

    try {
      const config = this.featureFlagManager.getRecoveryConfig()
      await this.recoveryManager.updateConfiguration(config)

      // Handle enabled/disabled state
      if (config.enabled !== this.recoveryManager.isEnabled()) {
        await this.recoveryManager.setEnabled(config.enabled)
      }

      this.emit('config:propagated', 'recoveryManager', config)
      console.log('ConfigurationIntegration: RecoveryManager config propagated')
    } catch (error) {
      this.emit('config:propagation:failed', 'recoveryManager', error as Error)
      console.error('ConfigurationIntegration: Failed to propagate recovery config:', error)
      throw error
    }
  }

  /**
   * Propagate telemetry configuration
   */
  private async propagateTelemetryConfig(): Promise<void> {
    if (!this.telemetryCoordinator) {
      return // Component not registered
    }

    try {
      const config = this.featureFlagManager.getTelemetryConfig()
      await this.telemetryCoordinator.updateConfiguration(config)

      // Handle enabled/disabled state
      if (config.enabled !== this.telemetryCoordinator.isEnabled()) {
        await this.telemetryCoordinator.setEnabled(config.enabled)
      }

      this.emit('config:propagated', 'telemetryCoordinator', config)
      console.log('ConfigurationIntegration: TelemetryCoordinator config propagated')
    } catch (error) {
      this.emit('config:propagation:failed', 'telemetryCoordinator', error as Error)
      console.error('ConfigurationIntegration: Failed to propagate telemetry config:', error)
      throw error
    }
  }

  // ================================================================
  // Event Listeners Setup
  // ================================================================

  /**
   * Setup event listeners for FeatureFlagManager
   */
  private setupEventListeners(): void {
    // Listen for configuration updates
    this.featureFlagManager.on('config:updated', async section => {
      if (!this.isStarted) {
        return // Don't propagate if integration isn't started
      }

      try {
        switch (section) {
          case 'orphanDetection':
            await this.propagateOrphanDetectionConfig()
            break
          case 'gapDetection':
            await this.propagateGapDetectionConfig()
            break
          case 'recovery':
            await this.propagateRecoveryConfig()
            break
          case 'telemetry':
            await this.propagateTelemetryConfig()
            break
          default:
            console.log(`ConfigurationIntegration: Unknown configuration section: ${section}`)
        }
      } catch (error) {
        console.error(
          `ConfigurationIntegration: Failed to handle config update for ${section}:`,
          error
        )
        this.emit('integration:error', error as Error, `config:updated:${section}`)
      }
    })

    // Listen for FeatureFlagManager errors
    this.featureFlagManager.on('config:error', (error, context) => {
      console.error(`ConfigurationIntegration: FeatureFlagManager error in ${context}:`, error)
      this.emit('integration:error', error, `featureFlagManager:${context}`)
    })

    console.log('ConfigurationIntegration: Event listeners set up')
  }

  // ================================================================
  // Status and Information
  // ================================================================

  /**
   * Get integration status
   */
  getStatus() {
    return {
      isStarted: this.isStarted,
      featureFlagManager: this.featureFlagManager.getSystemInfo(),
      registeredComponents: {
        orphanDetectionWorker: !!this.orphanDetectionWorker,
        gapDetector: !!this.gapDetector,
        recoveryManager: !!this.recoveryManager,
        telemetryCoordinator: !!this.telemetryCoordinator
      },
      componentStates: {
        orphanDetectionWorker: this.orphanDetectionWorker?.isRunning() ?? null,
        gapDetector: this.gapDetector?.isEnabled() ?? null,
        recoveryManager: this.recoveryManager?.isEnabled() ?? null,
        telemetryCoordinator: this.telemetryCoordinator?.isEnabled() ?? null
      }
    }
  }

  /**
   * Get current configurations for all components
   */
  getCurrentConfigurations() {
    return {
      orphanDetection: this.featureFlagManager.getOrphanDetectionConfig(),
      gapDetection: this.featureFlagManager.getGapDetectionConfig(),
      recovery: this.featureFlagManager.getRecoveryConfig(),
      telemetry: this.featureFlagManager.getTelemetryConfig()
    }
  }

  /**
   * Force configuration re-propagation to all components
   */
  async refreshAllConfigurations(): Promise<void> {
    if (!this.isStarted) {
      throw new Error(
        'ConfigurationIntegration: Cannot refresh configurations - integration not started'
      )
    }

    console.log('ConfigurationIntegration: Force refreshing all configurations')
    await this.propagateAllConfigurations()
    console.log('ConfigurationIntegration: All configurations refreshed successfully')
  }

  // ================================================================
  // Utility Methods
  // ================================================================

  /**
   * Update configuration for a specific component type
   */
  async updateComponentConfiguration(componentType: string, updates: unknown): Promise<void> {
    switch (componentType) {
      case 'orphanDetection':
        await this.featureFlagManager.updateOrphanDetectionConfig(
          updates as Partial<OrphanDetectionConfig>
        )
        break
      case 'gapDetection':
        await this.featureFlagManager.updateGapDetectionConfig(
          updates as Partial<GapDetectionConfig>
        )
        break
      case 'recovery':
        await this.featureFlagManager.updateRecoveryConfig(updates as Partial<RecoveryConfig>)
        break
      case 'telemetry':
        await this.featureFlagManager.updateTelemetryConfig(updates as Partial<TelemetryConfig>)
        break
      default:
        throw new Error(`ConfigurationIntegration: Unknown component type: ${componentType}`)
    }
  }

  /**
   * Enable or disable a specific component
   */
  async setComponentEnabled(componentType: string, enabled: boolean): Promise<void> {
    await this.updateComponentConfiguration(componentType, {enabled})
  }

  /**
   * Get FeatureFlagManager instance
   */
  getFeatureFlagManager(): FeatureFlagManager {
    return this.featureFlagManager
  }
}

// ================================================================
// Singleton Instance
// ================================================================

let configurationIntegrationInstance: ConfigurationIntegration | null = null

/**
 * Get singleton instance of ConfigurationIntegration
 */
export function getConfigurationIntegration(): ConfigurationIntegration {
  if (!configurationIntegrationInstance) {
    configurationIntegrationInstance = new ConfigurationIntegration()
  }
  return configurationIntegrationInstance
}

/**
 * Initialize singleton instance
 */
export async function initializeConfigurationIntegration(
  featureFlagManager?: FeatureFlagManager
): Promise<ConfigurationIntegration> {
  if (configurationIntegrationInstance) {
    await configurationIntegrationInstance.stop()
  }

  configurationIntegrationInstance = new ConfigurationIntegration(featureFlagManager)
  await configurationIntegrationInstance.start()

  return configurationIntegrationInstance
}

/**
 * Shutdown singleton instance
 */
export async function shutdownConfigurationIntegration(): Promise<void> {
  if (configurationIntegrationInstance) {
    await configurationIntegrationInstance.stop()
    configurationIntegrationInstance = null
  }
}
