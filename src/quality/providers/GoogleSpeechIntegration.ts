/**
 * Google Speech Integration Service
 *
 * Integrates Google Speech-to-Text provider with the existing transcription system.
 * Handles provider registration, configuration management, and fallback scenarios.
 */

import {EventEmitter} from 'events'
import {
  GoogleSpeechProvider,
  createGoogleSpeechProvider,
  validateGoogleSpeechConfig
} from './GoogleSpeechProvider'
import {
  GoogleCloudAuthService,
  createGoogleCloudAuthService,
  type AuthenticationConfig
} from './GoogleCloudAuthService'
import type {TranscriptionQualityManager} from '../services/TranscriptionQualityManager'

// Integration configuration types
export interface GoogleSpeechIntegrationConfig {
  // Google Cloud settings
  projectId: string

  // Authentication configuration
  auth: AuthenticationConfig

  // Provider settings
  providerConfig?: {
    priority?: number
    enabled?: boolean
    fallbackOnly?: boolean
    qualityThreshold?: number
  }

  // Quality settings
  qualityConfig?: {
    enableQualityMonitoring?: boolean
    minConfidenceScore?: number
    autoSwitchThreshold?: number
    comparisonEnabled?: boolean
  }

  // Integration settings
  integrationConfig?: {
    autoRegister?: boolean
    replaceExisting?: boolean
    enableMetrics?: boolean
    enableLogging?: boolean
  }
}

export interface IntegrationStatus {
  isInitialized: boolean
  authenticationStatus: 'pending' | 'authenticated' | 'failed'
  providerStatus: 'pending' | 'registered' | 'failed'
  qualityManagerIntegrated: boolean
  errors: string[]
  lastUpdate: number
}

/**
 * Google Speech Integration Service
 */
export class GoogleSpeechIntegrationService extends EventEmitter {
  private config: GoogleSpeechIntegrationConfig
  private authService: GoogleCloudAuthService | null = null
  private speechProvider: GoogleSpeechProvider | null = null
  private qualityManager: TranscriptionQualityManager | null = null
  private status: IntegrationStatus

  constructor(config: GoogleSpeechIntegrationConfig) {
    super()
    this.config = config
    this.status = {
      isInitialized: false,
      authenticationStatus: 'pending',
      providerStatus: 'pending',
      qualityManagerIntegrated: false,
      errors: [],
      lastUpdate: Date.now()
    }
  }

  /**
   * Initialize the integration
   */
  public async initialize(): Promise<IntegrationStatus> {
    try {
      this.updateStatus({errors: []})

      // Step 1: Initialize authentication
      await this.initializeAuthentication()

      // Step 2: Initialize Speech provider
      await this.initializeSpeechProvider()

      // Step 3: Set up provider configuration
      this.configureProvider()

      // Step 4: Register with quality manager (if available)
      await this.registerWithQualityManager()

      this.updateStatus({
        isInitialized: true,
        lastUpdate: Date.now()
      })

      this.emit('initialized', this.status)
      return this.status
    } catch (error) {
      const errorMessage = `Integration initialization failed: ${error}`
      this.updateStatus({
        errors: [...this.status.errors, errorMessage],
        lastUpdate: Date.now()
      })

      this.emit('initialization:error', errorMessage)
      throw error
    }
  }

  /**
   * Register with an existing quality manager
   */
  public async registerWithQualityManager(
    qualityManager?: TranscriptionQualityManager
  ): Promise<void> {
    if (qualityManager) {
      this.qualityManager = qualityManager
    }

    if (!this.qualityManager) {
      // Try to find quality manager from global scope or import
      try {
        // In a real application, you might import or get this from a service locator
        // For now, we'll skip if not provided
        this.updateStatus({
          qualityManagerIntegrated: false,
          errors: [...this.status.errors, 'Quality manager not available for integration']
        })
        return
      } catch (error) {
        this.updateStatus({
          errors: [...this.status.errors, `Failed to locate quality manager: ${error}`]
        })
        return
      }
    }

    if (!this.speechProvider) {
      throw new Error('Speech provider not initialized')
    }

    try {
      // Register the provider with the quality manager
      await this.qualityManager.registerProvider(this.speechProvider)

      // Set up quality monitoring if enabled
      if (this.config.qualityConfig?.enableQualityMonitoring) {
        this.setupQualityMonitoring()
      }

      this.updateStatus({
        qualityManagerIntegrated: true,
        lastUpdate: Date.now()
      })

      this.emit('quality-manager:registered', this.qualityManager)
    } catch (error) {
      const errorMessage = `Failed to register with quality manager: ${error}`
      this.updateStatus({
        errors: [...this.status.errors, errorMessage],
        lastUpdate: Date.now()
      })
      throw error
    }
  }

  /**
   * Get the current integration status
   */
  public getStatus(): IntegrationStatus {
    return {...this.status}
  }

  /**
   * Get the Google Speech provider instance
   */
  public getSpeechProvider(): GoogleSpeechProvider | null {
    return this.speechProvider
  }

  /**
   * Get the authentication service instance
   */
  public getAuthService(): GoogleCloudAuthService | null {
    return this.authService
  }

  /**
   * Update integration configuration
   */
  public updateConfiguration(newConfig: Partial<GoogleSpeechIntegrationConfig>): void {
    const oldConfig = this.config
    this.config = {...this.config, ...newConfig}

    // Handle configuration changes
    this.handleConfigurationChange(oldConfig, this.config)

    this.emit('configuration:updated', this.config)
  }

  /**
   * Test the integration
   */
  public async testIntegration(): Promise<{
    success: boolean
    results: Record<string, unknown>
    errors: string[]
  }> {
    const results: Record<string, unknown> = {}
    const errors: string[] = []

    try {
      // Test 1: Authentication
      if (this.authService) {
        try {
          const token = await this.authService.getAccessToken()
          results.authentication = {
            success: true,
            hasToken: !!token,
            tokenLength: token?.length || 0
          }
        } catch (error) {
          results.authentication = {success: false, error: `${error}`}
          errors.push(`Authentication test failed: ${error}`)
        }
      } else {
        results.authentication = {success: false, error: 'Auth service not initialized'}
        errors.push('Auth service not initialized')
      }

      // Test 2: Speech provider
      if (this.speechProvider) {
        try {
          const config = this.speechProvider.getConfiguration()
          results.speechProvider = {
            success: true,
            isInitialized: config.isInitialized,
            supportedLanguages: config.supportedLanguages?.length || 0,
            capabilities: config.capabilities
          }

          // Test transcription with mock audio
          const mockAudio = new ArrayBuffer(1024)
          const transcriptionResult = await this.speechProvider.transcribe(mockAudio, {
            language: 'en',
            quality: 'medium'
          })

          results.transcription = {
            success: true,
            hasText: !!transcriptionResult.text,
            confidence: transcriptionResult.confidence,
            processingTime: transcriptionResult.processingTime
          }
        } catch (error) {
          results.speechProvider = {success: false, error: `${error}`}
          errors.push(`Speech provider test failed: ${error}`)
        }
      } else {
        results.speechProvider = {success: false, error: 'Speech provider not initialized'}
        errors.push('Speech provider not initialized')
      }

      // Test 3: Quality manager integration
      if (this.qualityManager && this.speechProvider) {
        try {
          const providers = await this.qualityManager.getAvailableProviders()
          const googleProvider = providers.find(p => p.id === 'google-speech')
          results.qualityIntegration = {
            success: !!googleProvider,
            providerFound: !!googleProvider,
            totalProviders: providers.length
          }

          if (!googleProvider) {
            errors.push('Google Speech provider not found in quality manager')
          }
        } catch (error) {
          results.qualityIntegration = {success: false, error: `${error}`}
          errors.push(`Quality manager integration test failed: ${error}`)
        }
      } else {
        results.qualityIntegration = {
          success: false,
          error: 'Quality manager or speech provider not available'
        }
        errors.push('Quality manager or speech provider not available for integration test')
      }

      const overallSuccess = errors.length === 0
      this.emit('test:completed', {success: overallSuccess, results, errors})

      return {success: overallSuccess, results, errors}
    } catch (error) {
      const errorMessage = `Integration test failed: ${error}`
      errors.push(errorMessage)
      this.emit('test:error', errorMessage)

      return {success: false, results, errors}
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Cleanup speech provider
    if (this.speechProvider) {
      this.speechProvider.cleanup()
      this.speechProvider = null
    }

    // Cleanup auth service
    if (this.authService) {
      this.authService.cleanup()
      this.authService = null
    }

    // Reset status
    this.status = {
      isInitialized: false,
      authenticationStatus: 'pending',
      providerStatus: 'pending',
      qualityManagerIntegrated: false,
      errors: [],
      lastUpdate: Date.now()
    }

    this.removeAllListeners()
  }

  // Private helper methods

  private async initializeAuthentication(): Promise<void> {
    try {
      this.authService = createGoogleCloudAuthService(this.config.auth)

      // Set up event listeners
      this.authService.on('authenticated', () => {
        this.updateStatus({authenticationStatus: 'authenticated'})
        this.emit('authentication:success')
      })

      this.authService.on('authentication:error', error => {
        this.updateStatus({
          authenticationStatus: 'failed',
          errors: [...this.status.errors, `Authentication error: ${error}`]
        })
        this.emit('authentication:error', error)
      })

      // Initialize authentication
      const result = await this.authService.initialize()

      if (!result.success) {
        throw new Error(result.error || 'Authentication initialization failed')
      }
    } catch (error) {
      this.updateStatus({
        authenticationStatus: 'failed',
        errors: [...this.status.errors, `Auth initialization failed: ${error}`]
      })
      throw error
    }
  }

  private async initializeSpeechProvider(): Promise<void> {
    if (!this.authService) {
      throw new Error('Authentication service not initialized')
    }

    try {
      // Validate Google Speech configuration
      const speechConfig = {
        projectId: this.config.projectId,
        credentials: this.config.auth.credentials,
        keyFilename: this.config.auth.keyFilename
      }

      const validation = validateGoogleSpeechConfig(speechConfig)
      if (!validation.valid) {
        throw new Error(`Invalid Google Speech configuration: ${validation.errors.join(', ')}`)
      }

      // Create speech provider
      this.speechProvider = createGoogleSpeechProvider(speechConfig)

      // Set up event listeners
      this.speechProvider.on('initialized', () => {
        this.updateStatus({providerStatus: 'registered'})
        this.emit('provider:initialized')
      })

      this.speechProvider.on('initialization:error', error => {
        this.updateStatus({
          providerStatus: 'failed',
          errors: [...this.status.errors, `Provider initialization error: ${error}`]
        })
        this.emit('provider:error', error)
      })

      // Initialize provider
      await this.speechProvider.initialize()
    } catch (error) {
      this.updateStatus({
        providerStatus: 'failed',
        errors: [...this.status.errors, `Provider initialization failed: ${error}`]
      })
      throw error
    }
  }

  private configureProvider(): void {
    if (!this.speechProvider) return

    const providerConfig = this.config.providerConfig || {}
    const qualityConfig = this.config.qualityConfig || {}

    // Update provider configuration
    this.speechProvider.updateConfiguration({
      priority: providerConfig.priority || 5,
      enabled: providerConfig.enabled !== false,
      minConfidenceScore: qualityConfig.minConfidenceScore || 0.7,
      enableMetrics: this.config.integrationConfig?.enableMetrics !== false
    })

    this.emit('provider:configured', this.speechProvider.getConfiguration())
  }

  private setupQualityMonitoring(): void {
    if (!this.speechProvider || !this.qualityManager) return

    const qualityConfig = this.config.qualityConfig || {}

    // Set up quality monitoring events
    this.speechProvider.on('transcription:completed', result => {
      // Emit quality metrics
      this.emit('quality:metrics', {
        provider: 'google-speech',
        confidence: result.confidence,
        processingTime: result.processingTime,
        language: result.language,
        textLength: result.text?.length || 0
      })

      // Check quality thresholds
      if (
        qualityConfig.minConfidenceScore &&
        result.confidence < qualityConfig.minConfidenceScore
      ) {
        this.emit('quality:warning', {
          provider: 'google-speech',
          reason: 'low_confidence',
          confidence: result.confidence,
          threshold: qualityConfig.minConfidenceScore
        })
      }
    })

    this.speechProvider.on('transcription:error', error => {
      this.emit('quality:error', {
        provider: 'google-speech',
        error: error.message || error,
        timestamp: Date.now()
      })
    })
  }

  private updateStatus(updates: Partial<IntegrationStatus>): void {
    this.status = {...this.status, ...updates}
    this.emit('status:updated', this.status)
  }

  private handleConfigurationChange(
    oldConfig: GoogleSpeechIntegrationConfig,
    newConfig: GoogleSpeechIntegrationConfig
  ): void {
    // Check if authentication config changed
    if (JSON.stringify(oldConfig.auth) !== JSON.stringify(newConfig.auth)) {
      this.initializeAuthentication().catch(error => {
        this.emit('configuration:error', `Auth reconfiguration failed: ${error}`)
      })
    }

    // Check if provider config changed
    if (JSON.stringify(oldConfig.providerConfig) !== JSON.stringify(newConfig.providerConfig)) {
      this.configureProvider()
    }

    // Check if quality config changed
    if (JSON.stringify(oldConfig.qualityConfig) !== JSON.stringify(newConfig.qualityConfig)) {
      if (newConfig.qualityConfig?.enableQualityMonitoring) {
        this.setupQualityMonitoring()
      }
    }
  }
}

// Factory function for easy integration setup
export function createGoogleSpeechIntegration(
  config: GoogleSpeechIntegrationConfig
): GoogleSpeechIntegrationService {
  return new GoogleSpeechIntegrationService(config)
}

// Configuration validation for the entire integration
export function validateIntegrationConfig(config: Partial<GoogleSpeechIntegrationConfig>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!config.projectId) {
    errors.push('projectId is required')
  }

  if (!config.auth) {
    errors.push('auth configuration is required')
  } else {
    // Validate auth config - in production, import and validate properly
    // For now, skip additional auth validation
  }

  // Validate provider config
  if (config.providerConfig) {
    const pc = config.providerConfig
    if (pc.priority !== undefined && (pc.priority < 1 || pc.priority > 10)) {
      errors.push('providerConfig.priority must be between 1 and 10')
    }
    if (pc.qualityThreshold !== undefined && (pc.qualityThreshold < 0 || pc.qualityThreshold > 1)) {
      errors.push('providerConfig.qualityThreshold must be between 0 and 1')
    }
  }

  // Validate quality config
  if (config.qualityConfig) {
    const qc = config.qualityConfig
    if (
      qc.minConfidenceScore !== undefined &&
      (qc.minConfidenceScore < 0 || qc.minConfidenceScore > 1)
    ) {
      errors.push('qualityConfig.minConfidenceScore must be between 0 and 1')
    }
    if (
      qc.autoSwitchThreshold !== undefined &&
      (qc.autoSwitchThreshold < 0 || qc.autoSwitchThreshold > 1)
    ) {
      errors.push('qualityConfig.autoSwitchThreshold must be between 0 and 1')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// Pre-configured integration setups
export const GoogleSpeechIntegrationConfigurations = {
  /**
   * Ukrainian-focused configuration with quality monitoring
   */
  ukrainianFocused: (
    projectId: string,
    auth: AuthenticationConfig
  ): GoogleSpeechIntegrationConfig => ({
    projectId,
    auth,
    providerConfig: {
      priority: 8,
      enabled: true,
      fallbackOnly: false,
      qualityThreshold: 0.8
    },
    qualityConfig: {
      enableQualityMonitoring: true,
      minConfidenceScore: 0.7,
      autoSwitchThreshold: 0.75,
      comparisonEnabled: true
    },
    integrationConfig: {
      autoRegister: true,
      replaceExisting: false,
      enableMetrics: true,
      enableLogging: true
    }
  }),

  /**
   * High-accuracy configuration
   */
  highAccuracy: (projectId: string, auth: AuthenticationConfig): GoogleSpeechIntegrationConfig => ({
    projectId,
    auth,
    providerConfig: {
      priority: 9,
      enabled: true,
      fallbackOnly: false,
      qualityThreshold: 0.9
    },
    qualityConfig: {
      enableQualityMonitoring: true,
      minConfidenceScore: 0.85,
      autoSwitchThreshold: 0.9,
      comparisonEnabled: true
    },
    integrationConfig: {
      autoRegister: true,
      replaceExisting: false,
      enableMetrics: true,
      enableLogging: true
    }
  }),

  /**
   * Fallback-only configuration
   */
  fallbackOnly: (projectId: string, auth: AuthenticationConfig): GoogleSpeechIntegrationConfig => ({
    projectId,
    auth,
    providerConfig: {
      priority: 3,
      enabled: true,
      fallbackOnly: true,
      qualityThreshold: 0.6
    },
    qualityConfig: {
      enableQualityMonitoring: false,
      minConfidenceScore: 0.5,
      comparisonEnabled: false
    },
    integrationConfig: {
      autoRegister: true,
      replaceExisting: false,
      enableMetrics: false,
      enableLogging: false
    }
  })
}
