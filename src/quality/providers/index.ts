/**
 * Quality Providers Index
 *
 * Central export point for all transcription provider implementations
 * and related authentication/integration services.
 */

// Google Speech-to-Text Provider
export {
  GoogleSpeechProvider,
  createGoogleSpeechProvider,
  validateGoogleSpeechConfig,
  GoogleSpeechConfigurations
} from './GoogleSpeechProvider'

// Google Cloud Authentication
export {
  GoogleCloudAuthService,
  createGoogleCloudAuthService,
  validateAuthConfig,
  GoogleCloudAuthConfigurations,
  type GoogleCloudCredentials,
  type AuthenticationConfig,
  type AuthenticationResult
} from './GoogleCloudAuthService'

// Integration Service
export {
  GoogleSpeechIntegrationService,
  createGoogleSpeechIntegration,
  validateIntegrationConfig,
  GoogleSpeechIntegrationConfigurations,
  type GoogleSpeechIntegrationConfig,
  type IntegrationStatus
} from './GoogleSpeechIntegration'

// Utility functions for easy setup
export const ProviderUtils = {
  /**
   * Create a complete Google Speech setup with authentication
   */
  createGoogleSpeechSetup: async (config: {
    projectId: string
    keyFilename?: string
    credentials?: GoogleCloudCredentials
  }) => {
    const {GoogleCloudAuthConfigurations} = await import('./GoogleCloudAuthService')
    const {GoogleSpeechIntegrationConfigurations, createGoogleSpeechIntegration} = await import(
      './GoogleSpeechIntegration'
    )

    // Create auth config
    const authConfig = config.keyFilename
      ? GoogleCloudAuthConfigurations.keyFile(config.projectId, config.keyFilename)
      : config.credentials
        ? GoogleCloudAuthConfigurations.serviceAccount(config.projectId, config.credentials)
        : GoogleCloudAuthConfigurations.adc(config.projectId)

    // Create integration config
    const integrationConfig = GoogleSpeechIntegrationConfigurations.ukrainianFocused(
      config.projectId,
      authConfig
    )

    // Create integration service
    const integration = createGoogleSpeechIntegration(integrationConfig)

    return integration
  },

  /**
   * Quick validation of provider requirements
   */
  validateProviderRequirements: () => {
    const requirements = {
      googleSpeech: {
        name: 'Google Speech-to-Text',
        required: [
          'Google Cloud Project ID',
          'Service Account Credentials or Key File',
          'Speech-to-Text API enabled'
        ],
        optional: ['Custom authentication endpoint', 'Enhanced model access', 'Premium features']
      }
    }

    return requirements
  },

  /**
   * Get supported languages for all providers
   */
  getSupportedLanguages: () => {
    return {
      googleSpeech: [
        'en-US',
        'en-GB',
        'en-AU',
        'en-CA',
        'en-IN',
        'uk-UA',
        'ru-RU',
        'de-DE',
        'fr-FR',
        'es-ES',
        'es-MX',
        'it-IT',
        'pt-BR',
        'pt-PT',
        'ja-JP',
        'ko-KR',
        'zh-CN',
        'zh-TW'
      ]
    }
  }
}

// Type re-exports for convenience
export type {
  GoogleCloudCredentials,
  AuthenticationConfig,
  AuthenticationResult
} from './GoogleCloudAuthService'
export type {GoogleSpeechIntegrationConfig, IntegrationStatus} from './GoogleSpeechIntegration'
