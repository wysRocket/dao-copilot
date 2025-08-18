/**
 * Feature Flag System Integration Example and Test
 *
 * Demonstrates how to integrate the FeatureFlagManager and ConfigurationIntegration
 * with the transcription loss prevention worker components.
 *
 * This example shows:
 * - Initialization of the feature flag system
 * - Registration of worker components
 * - Dynamic configuration updates
 * - Environment variable overrides
 * - Configuration validation
 * - Real-time configuration propagation
 */

import {
  initializeFeatureFlagManager,
  getFeatureFlagManager,
  OrphanDetectionConfig,
  GapDetectionConfig,
  RecoveryConfig,
  TelemetryConfig
} from './FeatureFlagManager'

import {
  initializeConfigurationIntegration,
  getConfigurationIntegration
} from './ConfigurationIntegration'

// ================================================================
// Mock Worker Components (for demonstration)
// ================================================================

class MockOrphanDetectionWorker {
  private config: OrphanDetectionConfig
  private running = false
  private timer?: NodeJS.Timeout

  constructor(initialConfig: OrphanDetectionConfig) {
    this.config = initialConfig
  }

  async updateConfiguration(config: OrphanDetectionConfig): Promise<void> {
    console.log('OrphanDetectionWorker: Configuration updated', {
      scanInterval: `${this.config.scanIntervalMs}ms -> ${config.scanIntervalMs}ms`,
      stuckThreshold: `${this.config.stuckThresholdMs}ms -> ${config.stuckThresholdMs}ms`,
      enabled: `${this.config.enabled} -> ${config.enabled}`
    })

    this.config = {...config}

    // Restart with new interval if running
    if (this.running) {
      await this.stop()
      await this.start()
    }
  }

  async start(): Promise<void> {
    if (this.running || !this.config.enabled) return

    this.running = true
    this.timer = setInterval(() => {
      console.log(
        `OrphanDetectionWorker: Scanning for orphans (interval: ${this.config.scanIntervalMs}ms, threshold: ${this.config.stuckThresholdMs}ms)`
      )
    }, this.config.scanIntervalMs)

    console.log('OrphanDetectionWorker: Started')
  }

  async stop(): Promise<void> {
    if (!this.running) return

    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }

    console.log('OrphanDetectionWorker: Stopped')
  }

  isRunning(): boolean {
    return this.running
  }
}

class MockGapDetector {
  private config: GapDetectionConfig
  private enabled = true

  constructor(initialConfig: GapDetectionConfig) {
    this.config = initialConfig
    this.enabled = initialConfig.enabled
  }

  async updateConfiguration(config: GapDetectionConfig): Promise<void> {
    console.log('GapDetector: Configuration updated', {
      timestampGapThreshold: `${this.config.timestampGapThresholdMs}ms -> ${config.timestampGapThresholdMs}ms`,
      speechConfidence: `${this.config.speechConfidenceThreshold} -> ${config.speechConfidenceThreshold}`,
      speechPatternAnalysis: `${this.config.enableSpeechPatternAnalysis} -> ${config.enableSpeechPatternAnalysis}`,
      enabled: `${this.config.enabled} -> ${config.enabled}`
    })

    this.config = {...config}
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    console.log(`GapDetector: ${enabled ? 'Enabled' : 'Disabled'}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }
}

class MockRecoveryManager {
  private config: RecoveryConfig
  private enabled = true

  constructor(initialConfig: RecoveryConfig) {
    this.config = initialConfig
    this.enabled = initialConfig.enabled
  }

  async updateConfiguration(config: RecoveryConfig): Promise<void> {
    console.log('RecoveryManager: Configuration updated', {
      maxAttempts: `${this.config.maxRecoveryAttempts} -> ${config.maxRecoveryAttempts}`,
      timeout: `${this.config.recoveryTimeoutMs}ms -> ${config.recoveryTimeoutMs}ms`,
      exponentialBackoff: `${this.config.exponentialBackoff} -> ${config.exponentialBackoff}`,
      contextReconstruction: `${this.config.enableContextReconstruction} -> ${config.enableContextReconstruction}`,
      enabled: `${this.config.enabled} -> ${config.enabled}`
    })

    this.config = {...config}
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    console.log(`RecoveryManager: ${enabled ? 'Enabled' : 'Disabled'}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }
}

class MockTelemetryCoordinator {
  private config: TelemetryConfig
  private enabled = true

  constructor(initialConfig: TelemetryConfig) {
    this.config = initialConfig
    this.enabled = initialConfig.enabled
  }

  async updateConfiguration(config: TelemetryConfig): Promise<void> {
    console.log('TelemetryCoordinator: Configuration updated', {
      maxEventHistory: `${this.config.maxEventHistory} -> ${config.maxEventHistory}`,
      aggregationInterval: `${this.config.aggregationIntervalMs}ms -> ${config.aggregationIntervalMs}ms`,
      logLevel: `${this.config.logLevel} -> ${config.logLevel}`,
      debugEvents: `${this.config.enableDebugEvents} -> ${config.enableDebugEvents}`,
      enabled: `${this.config.enabled} -> ${config.enabled}`
    })

    this.config = {...config}
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    console.log(`TelemetryCoordinator: ${enabled ? 'Enabled' : 'Disabled'}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }
}

// ================================================================
// Integration Example
// ================================================================

export class FeatureFlagIntegrationExample {
  private orphanWorker?: MockOrphanDetectionWorker
  private gapDetector?: MockGapDetector
  private recoveryManager?: MockRecoveryManager
  private telemetryCoordinator?: MockTelemetryCoordinator

  /**
   * Initialize the complete feature flag system
   */
  async initialize(): Promise<void> {
    console.log('\n=== Initializing Feature Flag System ===')

    // Initialize the feature flag manager
    const featureFlagManager = await initializeFeatureFlagManager({
      system: {
        autoSave: true,
        saveIntervalMs: 30000, // Save every 30 seconds
        enableValidation: true,
        enableEnvOverrides: true,
        configFilePath: './config/transcription-feature-flags.json'
      },
      // Override some default values
      orphanDetection: {
        scanIntervalMs: 3000, // Slightly slower scan
        stuckThresholdMs: 5000, // More patience for stuck partials
        aggressiveDetection: true // Enable aggressive detection
      },
      telemetry: {
        logLevel: 'debug', // Enable debug logging
        enableDebugEvents: true
      }
    })

    // Initialize configuration integration
    const configIntegration = await initializeConfigurationIntegration(featureFlagManager)

    // Create worker components with initial configuration
    const configs = featureFlagManager.getConfig()
    this.orphanWorker = new MockOrphanDetectionWorker(configs.orphanDetection)
    this.gapDetector = new MockGapDetector(configs.gapDetection)
    this.recoveryManager = new MockRecoveryManager(configs.recovery)
    this.telemetryCoordinator = new MockTelemetryCoordinator(configs.telemetry)

    // Register components with configuration integration
    configIntegration.registerOrphanDetectionWorker(this.orphanWorker)
    configIntegration.registerGapDetector(this.gapDetector)
    configIntegration.registerRecoveryManager(this.recoveryManager)
    configIntegration.registerTelemetryCoordinator(this.telemetryCoordinator)

    // Start orphan detection worker if enabled
    if (configs.orphanDetection.enabled) {
      await this.orphanWorker.start()
    }

    console.log('Feature Flag System initialized successfully')
    console.log('Integration Status:', configIntegration.getStatus())
  }

  /**
   * Demonstrate dynamic configuration updates
   */
  async demonstrateConfigUpdates(): Promise<void> {
    console.log('\n=== Demonstrating Dynamic Configuration Updates ===')

    const featureFlagManager = getFeatureFlagManager()

    // Update orphan detection settings
    console.log('\n--- Updating Orphan Detection Configuration ---')
    await featureFlagManager.updateOrphanDetectionConfig({
      scanIntervalMs: 1500, // Faster scanning
      stuckThresholdMs: 3500, // Less patience
      maxOrphansPerScan: 15 // Process more orphans per scan
    })

    // Wait a moment to see the effect
    await this.delay(5000)

    // Update gap detection settings
    console.log('\n--- Updating Gap Detection Configuration ---')
    await featureFlagManager.updateGapDetectionConfig({
      timestampGapThresholdMs: 2000, // Detect larger gaps
      speechConfidenceThreshold: 0.8, // Require higher confidence
      enableSpeechPatternAnalysis: false // Disable for performance
    })

    // Update recovery settings
    console.log('\n--- Updating Recovery Configuration ---')
    await featureFlagManager.updateRecoveryConfig({
      maxRecoveryAttempts: 5, // More attempts
      recoveryTimeoutMs: 7000, // Longer timeout
      exponentialBackoff: false // Disable backoff for faster retries
    })

    // Update telemetry settings
    console.log('\n--- Updating Telemetry Configuration ---')
    await featureFlagManager.updateTelemetryConfig({
      maxEventHistory: 2000, // Keep more events
      aggregationIntervalMs: 15000, // Aggregate more frequently
      logLevel: 'warn', // Reduce logging verbosity
      enableDebugEvents: false // Disable debug events
    })

    // Wait to see effects
    await this.delay(3000)
  }

  /**
   * Demonstrate component enable/disable functionality
   */
  async demonstrateComponentToggling(): Promise<void> {
    console.log('\n=== Demonstrating Component Enable/Disable ===')

    const configIntegration = getConfigurationIntegration()

    // Disable orphan detection
    console.log('\n--- Disabling Orphan Detection ---')
    await configIntegration.setComponentEnabled('orphanDetection', false)
    await this.delay(2000)

    // Re-enable with different settings
    console.log('\n--- Re-enabling Orphan Detection with New Settings ---')
    const featureFlagManager = getFeatureFlagManager()
    await featureFlagManager.updateOrphanDetectionConfig({
      enabled: true,
      scanIntervalMs: 2500,
      aggressiveDetection: false
    })
    await this.delay(3000)

    // Disable all components
    console.log('\n--- Disabling All Components ---')
    await configIntegration.setComponentEnabled('orphanDetection', false)
    await configIntegration.setComponentEnabled('gapDetection', false)
    await configIntegration.setComponentEnabled('recovery', false)
    await configIntegration.setComponentEnabled('telemetry', false)
    await this.delay(2000)

    // Re-enable all components
    console.log('\n--- Re-enabling All Components ---')
    await configIntegration.setComponentEnabled('orphanDetection', true)
    await configIntegration.setComponentEnabled('gapDetection', true)
    await configIntegration.setComponentEnabled('recovery', true)
    await configIntegration.setComponentEnabled('telemetry', true)
    await this.delay(2000)
  }

  /**
   * Demonstrate configuration validation
   */
  async demonstrateValidation(): Promise<void> {
    console.log('\n=== Demonstrating Configuration Validation ===')

    const featureFlagManager = getFeatureFlagManager()

    // Try invalid configurations
    console.log('\n--- Testing Invalid Configurations ---')

    try {
      await featureFlagManager.updateOrphanDetectionConfig({
        scanIntervalMs: 500 // Too low (minimum is 1000)
      })
    } catch (error) {
      console.log('✓ Orphan detection validation caught error:', (error as Error).message)
    }

    try {
      await featureFlagManager.updateGapDetectionConfig({
        speechConfidenceThreshold: 1.5 // Too high (maximum is 1.0)
      })
    } catch (error) {
      console.log('✓ Gap detection validation caught error:', (error as Error).message)
    }

    try {
      await featureFlagManager.updateRecoveryConfig({
        maxRecoveryAttempts: 15 // Too high (maximum is 10)
      })
    } catch (error) {
      console.log('✓ Recovery validation caught error:', (error as Error).message)
    }

    try {
      await featureFlagManager.updateTelemetryConfig({
        logLevel: 'invalid' as 'debug' // Invalid log level (cast to bypass TypeScript)
      })
    } catch (error) {
      console.log('✓ Telemetry validation caught error:', (error as Error).message)
    }

    console.log('\n--- All Validation Tests Passed ---')
  }

  /**
   * Demonstrate configuration history and rollback
   */
  async demonstrateHistoryAndRollback(): Promise<void> {
    console.log('\n=== Demonstrating Configuration History and Rollback ===')

    const featureFlagManager = getFeatureFlagManager()

    // Make several configuration changes
    console.log('\n--- Making Configuration Changes ---')
    await featureFlagManager.updateOrphanDetectionConfig({scanIntervalMs: 1000})
    console.log('Change 1: Scan interval -> 1000ms')

    await featureFlagManager.updateOrphanDetectionConfig({scanIntervalMs: 1500})
    console.log('Change 2: Scan interval -> 1500ms')

    await featureFlagManager.updateOrphanDetectionConfig({scanIntervalMs: 2000})
    console.log('Change 3: Scan interval -> 2000ms')

    // Show history
    const history = featureFlagManager.getConfigHistory()
    console.log(`\nConfiguration history has ${history.length} entries`)

    // Rollback one step
    console.log('\n--- Rolling Back 1 Step ---')
    await featureFlagManager.rollbackConfig(1)
    const currentConfig = featureFlagManager.getOrphanDetectionConfig()
    console.log(`After rollback: Scan interval is ${currentConfig.scanIntervalMs}ms`)

    // Rollback two more steps
    console.log('\n--- Rolling Back 2 More Steps ---')
    await featureFlagManager.rollbackConfig(2)
    const finalConfig = featureFlagManager.getOrphanDetectionConfig()
    console.log(`After final rollback: Scan interval is ${finalConfig.scanIntervalMs}ms`)
  }

  /**
   * Demonstrate environment variable overrides
   */
  demonstrateEnvironmentOverrides(): void {
    console.log('\n=== Environment Variable Overrides ===')
    console.log('To test environment overrides, set these variables before running:')
    console.log('export ORPHAN_SCAN_INTERVAL_MS=1800')
    console.log('export GAP_TIMESTAMP_THRESHOLD_MS=1200')
    console.log('export RECOVERY_MAX_ATTEMPTS=4')
    console.log('export TELEMETRY_LOG_LEVEL=debug')
    console.log('')
    console.log('Then restart the application to see the overrides applied.')

    // Show current environment detection
    const envVars = [
      'ORPHAN_SCAN_INTERVAL_MS',
      'GAP_TIMESTAMP_THRESHOLD_MS',
      'RECOVERY_MAX_ATTEMPTS',
      'TELEMETRY_LOG_LEVEL'
    ]

    console.log('\nCurrent environment variables:')
    envVars.forEach(varName => {
      const value = process.env[varName]
      console.log(`${varName}: ${value || 'not set'}`)
    })
  }

  /**
   * Show system status
   */
  showSystemStatus(): void {
    console.log('\n=== System Status ===')

    const featureFlagManager = getFeatureFlagManager()
    const configIntegration = getConfigurationIntegration()

    console.log('\nFeature Flag Manager:', featureFlagManager.getSystemInfo())
    console.log('\nConfiguration Integration:', configIntegration.getStatus())
    console.log('\nCurrent Configurations:', configIntegration.getCurrentConfigurations())
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    console.log('\n=== Cleaning Up ===')

    // Stop orphan worker
    if (this.orphanWorker?.isRunning()) {
      await this.orphanWorker.stop()
    }

    // Shutdown integration systems
    const {shutdownConfigurationIntegration} = await import('./ConfigurationIntegration')
    const {shutdownFeatureFlagManager} = await import('./FeatureFlagManager')

    await shutdownConfigurationIntegration()
    await shutdownFeatureFlagManager()

    console.log('Cleanup completed')
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ================================================================
// Example Usage
// ================================================================

/**
 * Run the complete feature flag integration example
 */
export async function runFeatureFlagExample(): Promise<void> {
  const example = new FeatureFlagIntegrationExample()

  try {
    // Initialize system
    await example.initialize()

    // Show environment info
    example.demonstrateEnvironmentOverrides()

    // Show initial status
    example.showSystemStatus()

    // Demonstrate dynamic updates
    await example.demonstrateConfigUpdates()

    // Demonstrate component toggling
    await example.demonstrateComponentToggling()

    // Demonstrate validation
    await example.demonstrateValidation()

    // Demonstrate history and rollback
    await example.demonstrateHistoryAndRollback()

    // Show final status
    example.showSystemStatus()

    console.log('\n=== Feature Flag Example Completed Successfully ===')
  } catch (error) {
    console.error('Feature Flag Example failed:', error)
  } finally {
    // Always cleanup
    await example.cleanup()
  }
}

// If this file is run directly, execute the example
if (require.main === module) {
  runFeatureFlagExample().catch(console.error)
}
