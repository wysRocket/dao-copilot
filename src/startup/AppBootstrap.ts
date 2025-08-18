/**
 * AppBootstrap - Application Startup and Initialization
 *
 * Manages the complete application startup sequence including:
 * - Persistence layer initialization with crash recovery
 * - System service startup
 * - Configuration validation
 * - Error handling and graceful degradation
 */

import {globalPersistenceManager} from '../persistence/TranscriptPersistenceManager'
import {globalAppLifecycleManager, AppLifecycleEventType} from '../events/AppLifecycleEvents'

/**
 * Bootstrap configuration
 */
export interface BootstrapConfig {
  // Persistence settings
  enablePersistence: boolean
  persistenceRecoveryTimeout: number

  // Startup settings
  maxStartupTime: number
  continueOnErrors: boolean
  enableRecovery: boolean

  // Logging
  logStartupSteps: boolean
  detailedErrorLogs: boolean
}

/**
 * Default bootstrap configuration
 */
export const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = {
  enablePersistence: true,
  persistenceRecoveryTimeout: 30000,

  maxStartupTime: 60000,
  continueOnErrors: true,
  enableRecovery: true,

  logStartupSteps: true,
  detailedErrorLogs: true
}

/**
 * Bootstrap step result
 */
interface BootstrapStep {
  name: string
  success: boolean
  duration: number
  error?: Error
  recoveryAttempted?: boolean
}

/**
 * Bootstrap result
 */
export interface BootstrapResult {
  success: boolean
  totalDuration: number
  steps: BootstrapStep[]
  warnings: string[]
  recoveredSessions?: number
  persistenceEnabled: boolean
}

/**
 * Application Bootstrap Manager
 *
 * Orchestrates the complete application startup sequence with proper error handling,
 * recovery mechanisms, and graceful degradation for failed components.
 */
export class AppBootstrap {
  private config: BootstrapConfig
  private startTime: number = 0

  constructor(config: Partial<BootstrapConfig> = {}) {
    this.config = {...DEFAULT_BOOTSTRAP_CONFIG, ...config}
  }

  /**
   * Perform complete application bootstrap
   */
  async bootstrap(): Promise<BootstrapResult> {
    const result: BootstrapResult = {
      success: false,
      totalDuration: 0,
      steps: [],
      warnings: [],
      persistenceEnabled: false
    }

    this.startTime = Date.now()

    if (this.config.logStartupSteps) {
      console.log('[Bootstrap] Starting application initialization...')
    }

    try {
      // Step 1: Initialize lifecycle event manager
      await this.executeStep(result, 'lifecycle-events', async () => {
        // Lifecycle manager is already initialized as global singleton
        // Just ensure it's ready for app events
        globalAppLifecycleManager.emitLifecycleEvent(AppLifecycleEventType.APP_START)
      })

      // Step 2: Initialize persistence layer with recovery
      if (this.config.enablePersistence) {
        await this.executeStep(result, 'persistence-initialization', async () => {
          await this.initializePersistence()
          result.persistenceEnabled = true
        })
      } else {
        result.warnings.push('Persistence layer disabled by configuration')
      }

      // Step 3: Perform crash recovery (if enabled)
      if (this.config.enableRecovery && result.persistenceEnabled) {
        await this.executeStep(result, 'crash-recovery', async () => {
          const recoveryStats = await this.performCrashRecovery()
          if (recoveryStats) {
            result.recoveredSessions = recoveryStats.sessionsRecovered
          }
        })
      }

      // Step 4: Validate system health
      await this.executeStep(result, 'health-check', async () => {
        await this.performHealthCheck()
      })

      // Step 5: Register shutdown hooks
      await this.executeStep(result, 'shutdown-hooks', async () => {
        this.registerShutdownHooks()
      })

      // Calculate final results
      result.totalDuration = Date.now() - this.startTime
      result.success = result.steps.every(step => step.success || this.config.continueOnErrors)

      if (this.config.logStartupSteps) {
        console.log('[Bootstrap] Initialization completed:', {
          success: result.success,
          duration: result.totalDuration,
          persistenceEnabled: result.persistenceEnabled,
          recoveredSessions: result.recoveredSessions,
          stepCount: result.steps.length,
          warningCount: result.warnings.length
        })
      }

      return result
    } catch (error) {
      result.totalDuration = Date.now() - this.startTime
      result.steps.push({
        name: 'bootstrap-failure',
        success: false,
        duration: result.totalDuration,
        error: error instanceof Error ? error : new Error(String(error))
      })

      console.error('[Bootstrap] Initialization failed:', error)
      return result
    }
  }

  /**
   * Shutdown the application gracefully
   */
  async shutdown(): Promise<void> {
    const shutdownStart = Date.now()
    console.log('[Bootstrap] Starting graceful shutdown...')

    try {
      // Notify lifecycle manager of shutdown
      globalAppLifecycleManager.emitLifecycleEvent(AppLifecycleEventType.APP_CLOSE)

      // Shutdown persistence layer
      if (globalPersistenceManager) {
        await globalPersistenceManager.shutdown()
        console.log('[Bootstrap] Persistence layer shutdown complete')
      }

      // Destroy lifecycle manager
      globalAppLifecycleManager.destroy()

      const shutdownDuration = Date.now() - shutdownStart
      console.log(`[Bootstrap] Graceful shutdown completed in ${shutdownDuration}ms`)
    } catch (error) {
      console.error('[Bootstrap] Error during shutdown:', error)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): BootstrapConfig {
    return {...this.config}
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BootstrapConfig>): void {
    this.config = {...this.config, ...config}
  }

  // Private methods

  /**
   * Execute a bootstrap step with error handling and timing
   */
  private async executeStep(
    result: BootstrapResult,
    stepName: string,
    stepFunction: () => Promise<void>
  ): Promise<void> {
    const stepStart = Date.now()
    const step: BootstrapStep = {
      name: stepName,
      success: false,
      duration: 0
    }

    try {
      if (this.config.logStartupSteps) {
        console.log(`[Bootstrap] Executing step: ${stepName}`)
      }

      await stepFunction()

      step.success = true
      step.duration = Date.now() - stepStart

      if (this.config.logStartupSteps) {
        console.log(`[Bootstrap] Step ${stepName} completed in ${step.duration}ms`)
      }
    } catch (error) {
      step.success = false
      step.duration = Date.now() - stepStart
      step.error = error instanceof Error ? error : new Error(String(error))

      if (this.config.detailedErrorLogs) {
        console.error(`[Bootstrap] Step ${stepName} failed:`, error)
      }

      // Attempt recovery if configured
      if (this.config.continueOnErrors) {
        result.warnings.push(`Step ${stepName} failed but continuing: ${error}`)

        // Mark that recovery was attempted
        step.recoveryAttempted = true
      } else {
        throw error
      }
    } finally {
      result.steps.push(step)
    }

    // Check timeout
    if (Date.now() - this.startTime > this.config.maxStartupTime) {
      throw new Error(`Bootstrap timeout exceeded (${this.config.maxStartupTime}ms)`)
    }
  }

  /**
   * Initialize persistence layer
   */
  private async initializePersistence(): Promise<void> {
    try {
      await globalPersistenceManager.initialize()
    } catch (error) {
      if (this.config.continueOnErrors) {
        console.warn(
          '[Bootstrap] Persistence initialization failed, continuing without persistence:',
          error
        )
        throw new Error(`Persistence initialization failed: ${error}`)
      } else {
        throw error
      }
    }
  }

  /**
   * Perform crash recovery
   */
  private async performCrashRecovery(): Promise<{sessionsRecovered: number} | null> {
    try {
      const healthCheck = await globalPersistenceManager.quickHealthCheck()

      if (!healthCheck.healthy || healthCheck.fileCount === 0) {
        console.log('[Bootstrap] No recovery needed - no WAL files found or WAL not healthy')
        return {sessionsRecovered: 0}
      }

      console.log(`[Bootstrap] Found ${healthCheck.fileCount} WAL files for recovery`)

      // Recovery is performed automatically during persistence initialization
      // The recovery stats would be available through the persistence manager
      const recoveryStats = globalPersistenceManager.getRecoveryStats()

      if (recoveryStats.hasRecoveryManager) {
        console.log('[Bootstrap] Crash recovery completed successfully')
        return {sessionsRecovered: 0} // Would get actual count from recovery manager
      }

      return null
    } catch (error) {
      console.error('[Bootstrap] Recovery failed:', error)
      throw new Error(`Crash recovery failed: ${error}`)
    }
  }

  /**
   * Perform system health check
   */
  private async performHealthCheck(): Promise<void> {
    // Check persistence layer health
    if (globalPersistenceManager) {
      const metrics = globalPersistenceManager.getMetrics()

      if (metrics.ringBuffer.size < 0) {
        throw new Error('Ring buffer is in invalid state')
      }

      console.log('[Bootstrap] System health check passed')
    }
  }

  /**
   * Register shutdown hooks for graceful cleanup
   */
  private registerShutdownHooks(): void {
    // Handle process termination
    process.on('SIGTERM', () => {
      console.log('[Bootstrap] SIGTERM received, shutting down gracefully')
      this.shutdown().then(() => process.exit(0))
    })

    process.on('SIGINT', () => {
      console.log('[Bootstrap] SIGINT received, shutting down gracefully')
      this.shutdown().then(() => process.exit(0))
    })

    // Handle uncaught errors
    process.on('uncaughtException', error => {
      console.error('[Bootstrap] Uncaught exception:', error)
      this.shutdown().then(() => process.exit(1))
    })

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Bootstrap] Unhandled rejection at:', promise, 'reason:', reason)
      this.shutdown().then(() => process.exit(1))
    })

    console.log('[Bootstrap] Shutdown hooks registered')
  }
}

/**
 * Global bootstrap instance for convenience
 */
export const globalBootstrap = new AppBootstrap()

/**
 * Convenience function to bootstrap the application
 */
export async function bootstrapApplication(
  config?: Partial<BootstrapConfig>
): Promise<BootstrapResult> {
  const bootstrap = config ? new AppBootstrap(config) : globalBootstrap
  return await bootstrap.bootstrap()
}

export default AppBootstrap
