import fs from 'fs'
import path from 'path'
import {logger} from '../utils/logger'
import {validateApiKeys, getSecureEnvVar} from '../utils/environment'

/**
 * Environment configuration with production-ready validation
 * Supports multiple environment files and secure variable handling
 */
export class EnvironmentConfig {
  private static instance: EnvironmentConfig

  public readonly isProduction: boolean
  public readonly isDevelopment: boolean
  public readonly appName: string
  public readonly appVersion: string
  public readonly enableTelemetry: boolean
  public readonly debugMode: boolean

  // API Configuration
  public readonly geminiApiKey?: string
  public readonly openaiApiKey?: string
  public readonly anthropicApiKey?: string

  // Build Configuration
  public readonly buildTarget: string
  public readonly generateSourcemaps: boolean
  public readonly minifyCode: boolean

  private constructor() {
    // Load environment-specific .env file
    this.loadEnvironmentFile()

    // Core environment
    this.isProduction = process.env.NODE_ENV === 'production'
    this.isDevelopment = process.env.NODE_ENV === 'development'

    // Application config
    this.appName = process.env.APP_NAME || 'DAO Copilot'
    this.appVersion = process.env.APP_VERSION || '1.0.0'

    // Feature flags
    this.enableTelemetry = this.getBooleanEnv('ENABLE_TELEMETRY', !this.isProduction)
    this.debugMode = this.getBooleanEnv('DEBUG_MODE', this.isDevelopment)

    // API Keys (secured)
    this.geminiApiKey = getSecureEnvVar('GEMINI_API_KEY')
    this.openaiApiKey = getSecureEnvVar('OPENAI_API_KEY')
    this.anthropicApiKey = getSecureEnvVar('ANTHROPIC_API_KEY')

    // Build configuration
    this.buildTarget =
      process.env.BUILD_TARGET || (this.isProduction ? 'production' : 'development')
    this.generateSourcemaps = this.getBooleanEnv('GENERATE_SOURCEMAPS', this.isDevelopment)
    this.minifyCode = this.getBooleanEnv('MINIFY_CODE', this.isProduction)

    // Validate critical configuration
    this.validateConfiguration()
  }

  public static getInstance(): EnvironmentConfig {
    if (!EnvironmentConfig.instance) {
      EnvironmentConfig.instance = new EnvironmentConfig()
    }
    return EnvironmentConfig.instance
  }

  private loadEnvironmentFile(): void {
    try {
      // Try to load environment-specific file first
      const envFile = this.isProduction ? '.env.production' : '.env.development'
      const envPath = path.resolve(process.cwd(), envFile)

      if (fs.existsSync(envPath)) {
        // Dynamic import for dotenv to avoid build issues
        const dotenv = eval('require')('dotenv')
        dotenv.config({path: envPath})
        logger.info(`Loaded environment from ${envFile}`)
      } else {
        // Fallback to default .env
        const dotenv = eval('require')('dotenv')
        dotenv.config()
        logger.info('Loaded default .env file')
      }
    } catch (error) {
      logger.warn('Failed to load environment file:', error)
    }
  }

  private getBooleanEnv(key: string, defaultValue: boolean): boolean {
    const value = process.env[key]
    if (value === undefined) return defaultValue
    return value.toLowerCase() === 'true'
  }

  private validateConfiguration(): void {
    const issues: string[] = []

    // Validate API keys
    const hasValidApiKeys = validateApiKeys()
    if (!hasValidApiKeys && this.isProduction) {
      issues.push('Missing required API keys for production build')
    }

    // Production-specific validations
    if (this.isProduction) {
      if (!this.appVersion || this.appVersion === '1.0.0') {
        issues.push('Production builds should have a specific version number')
      }

      if (this.debugMode) {
        logger.warn('Debug mode is enabled in production - this may impact performance')
      }

      if (this.generateSourcemaps) {
        logger.warn('Source maps are enabled in production - consider disabling for security')
      }
    }

    // Log configuration status
    if (issues.length > 0) {
      logger.warn('Configuration issues detected:', issues)

      if (this.isProduction) {
        throw new Error(
          `Production build blocked due to configuration issues: ${issues.join(', ')}`
        )
      }
    } else {
      logger.info('Environment configuration validated successfully')
    }

    // Log current configuration
    this.logConfiguration()
  }

  private logConfiguration(): void {
    const config = {
      environment: this.isProduction ? 'production' : 'development',
      appName: this.appName,
      appVersion: this.appVersion,
      buildTarget: this.buildTarget,
      debugMode: this.debugMode,
      enableTelemetry: this.enableTelemetry,
      minifyCode: this.minifyCode,
      generateSourcemaps: this.generateSourcemaps,
      apiKeysConfigured: {
        gemini: !!this.geminiApiKey,
        openai: !!this.openaiApiKey,
        anthropic: !!this.anthropicApiKey
      }
    }

    logger.info('Current configuration:', config)
  }

  /**
   * Get runtime configuration for different parts of the application
   */
  public getFeatureFlags() {
    return {
      enableTelemetry: this.enableTelemetry,
      debugMode: this.debugMode,
      enableCrashReporting: this.getBooleanEnv('CRASH_REPORTING', this.isProduction),
      enableAutoUpdate: this.getBooleanEnv('AUTO_UPDATE_CHECK', this.isProduction)
    }
  }

  public getBuildConfig() {
    return {
      target: this.buildTarget,
      minify: this.minifyCode,
      sourcemaps: this.generateSourcemaps,
      production: this.isProduction
    }
  }
}

// Export singleton instance
export const environmentConfig = EnvironmentConfig.getInstance()
