/**
 * GCP Gemini Live API Authentication Configuration
 * Supports multiple authentication methods for different deployment scenarios
 */

import {GoogleAuth} from 'google-auth-library'

export interface AuthConfig {
  // Primary authentication method
  method: 'api-key' | 'service-account' | 'ephemeral-token' | 'default'

  // API Key authentication (simplest)
  apiKey?: string

  // Service Account authentication (server-side)
  serviceAccountKeyFile?: string
  serviceAccountKey?: object
  projectId?: string

  // Ephemeral token authentication (client-side)
  ephemeralToken?: string
  ephemeralTokenProvider?: () => Promise<string>

  // Default authentication (uses environment/metadata)
  scopes?: string[]
}

export interface AuthResult {
  success: boolean
  method: string
  credentials?: {
    apiKey?: string
    accessToken?: string
    ephemeralToken?: string
    client?: unknown
  }
  error?: string
  expiresAt?: Date
}

/**
 * GCP Authentication Manager for Gemini Live API
 */
export class GCPAuthManager {
  private config: AuthConfig
  private googleAuth?: GoogleAuth
  private cachedCredentials?: {
    apiKey?: string
    accessToken?: string
    ephemeralToken?: string
    client?: unknown
  }
  private credentialsExpiry?: Date

  constructor(config: AuthConfig) {
    this.config = config
  }

  /**
   * Initialize authentication based on configuration
   */
  async initialize(): Promise<AuthResult> {
    try {
      switch (this.config.method) {
        case 'api-key':
          return await this.initializeApiKey()

        case 'service-account':
          return await this.initializeServiceAccount()

        case 'ephemeral-token':
          return await this.initializeEphemeralToken()

        case 'default':
          return await this.initializeDefault()

        default:
          throw new Error(`Unsupported authentication method: ${this.config.method}`)
      }
    } catch (error) {
      console.error('Authentication initialization failed:', error)
      return {
        success: false,
        method: this.config.method,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get current authentication credentials
   */
  async getCredentials(): Promise<AuthResult> {
    // Check if cached credentials are still valid
    if (this.cachedCredentials && this.credentialsExpiry && new Date() < this.credentialsExpiry) {
      return {
        success: true,
        method: this.config.method,
        credentials: this.cachedCredentials,
        expiresAt: this.credentialsExpiry
      }
    }

    // Re-initialize if credentials expired
    return await this.initialize()
  }

  /**
   * API Key authentication (simplest method)
   */
  private async initializeApiKey(): Promise<AuthResult> {
    const apiKey =
      this.config.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GOOGLE_API_KEY

    if (!apiKey) {
      return {
        success: false,
        method: 'api-key',
        error:
          'No API key found. Set GEMINI_API_KEY, GOOGLE_AI_API_KEY, or GOOGLE_API_KEY environment variable'
      }
    }

    this.cachedCredentials = {apiKey}
    // API keys don't expire, but we'll refresh daily for security
    this.credentialsExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)

    return {
      success: true,
      method: 'api-key',
      credentials: this.cachedCredentials,
      expiresAt: this.credentialsExpiry
    }
  }

  /**
   * Service Account authentication (for server-side applications)
   */
  private async initializeServiceAccount(): Promise<AuthResult> {
    try {
      let keyFile: string | undefined
      let keyData: object | undefined

      // Try to get service account from config
      if (this.config.serviceAccountKey) {
        keyData = this.config.serviceAccountKey
      } else if (this.config.serviceAccountKeyFile) {
        keyFile = this.config.serviceAccountKeyFile
      } else {
        // Try environment variables
        const keyFilePath =
          process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_KEY_FILE

        const keyDataEnv = process.env.GCP_SERVICE_ACCOUNT_KEY

        if (keyDataEnv) {
          try {
            keyData = JSON.parse(keyDataEnv)
          } catch {
            return {
              success: false,
              method: 'service-account',
              error: 'Invalid JSON in GCP_SERVICE_ACCOUNT_KEY environment variable'
            }
          }
        } else if (keyFilePath) {
          keyFile = keyFilePath
        } else {
          return {
            success: false,
            method: 'service-account',
            error:
              'No service account credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or provide serviceAccountKey'
          }
        }
      }

      // Initialize Google Auth
      this.googleAuth = new GoogleAuth({
        keyFile,
        credentials: keyData,
        projectId: this.config.projectId,
        scopes: this.config.scopes || [
          'https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/generative-language'
        ]
      })

      // Get access token
      const client = await this.googleAuth.getClient()
      const accessToken = await client.getAccessToken()

      if (!accessToken.token) {
        return {
          success: false,
          method: 'service-account',
          error: 'Failed to obtain access token from service account'
        }
      }

      this.cachedCredentials = {
        accessToken: accessToken.token,
        client
      }

      // Tokens typically expire in 1 hour
      this.credentialsExpiry = accessToken.res?.data?.expires_in
        ? new Date(Date.now() + accessToken.res.data.expires_in * 1000)
        : new Date(Date.now() + 3600 * 1000) // Default 1 hour

      return {
        success: true,
        method: 'service-account',
        credentials: this.cachedCredentials,
        expiresAt: this.credentialsExpiry
      }
    } catch (error) {
      return {
        success: false,
        method: 'service-account',
        error: error instanceof Error ? error.message : 'Service account authentication failed'
      }
    }
  }

  /**
   * Ephemeral token authentication (for client-side applications)
   */
  private async initializeEphemeralToken(): Promise<AuthResult> {
    try {
      let token: string | undefined

      if (this.config.ephemeralToken) {
        token = this.config.ephemeralToken
      } else if (this.config.ephemeralTokenProvider) {
        token = await this.config.ephemeralTokenProvider()
      } else {
        return {
          success: false,
          method: 'ephemeral-token',
          error: 'No ephemeral token or token provider configured'
        }
      }

      if (!token) {
        return {
          success: false,
          method: 'ephemeral-token',
          error: 'Failed to obtain ephemeral token'
        }
      }

      this.cachedCredentials = {ephemeralToken: token}

      // Ephemeral tokens typically have short lifespans (15-60 minutes)
      this.credentialsExpiry = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes default

      return {
        success: true,
        method: 'ephemeral-token',
        credentials: this.cachedCredentials,
        expiresAt: this.credentialsExpiry
      }
    } catch (error) {
      return {
        success: false,
        method: 'ephemeral-token',
        error: error instanceof Error ? error.message : 'Ephemeral token authentication failed'
      }
    }
  }

  /**
   * Default authentication (uses environment or metadata server)
   */
  private async initializeDefault(): Promise<AuthResult> {
    try {
      this.googleAuth = new GoogleAuth({
        scopes: this.config.scopes || [
          'https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/generative-language'
        ]
      })

      const client = await this.googleAuth.getClient()
      const accessToken = await client.getAccessToken()

      if (!accessToken.token) {
        return {
          success: false,
          method: 'default',
          error: 'Failed to obtain access token using default authentication'
        }
      }

      this.cachedCredentials = {
        accessToken: accessToken.token,
        client
      }

      this.credentialsExpiry = accessToken.res?.data?.expires_in
        ? new Date(Date.now() + accessToken.res.data.expires_in * 1000)
        : new Date(Date.now() + 3600 * 1000)

      return {
        success: true,
        method: 'default',
        credentials: this.cachedCredentials,
        expiresAt: this.credentialsExpiry
      }
    } catch (error) {
      return {
        success: false,
        method: 'default',
        error: error instanceof Error ? error.message : 'Default authentication failed'
      }
    }
  }

  /**
   * Refresh credentials if they're expired
   */
  async refreshCredentials(): Promise<AuthResult> {
    this.cachedCredentials = undefined
    this.credentialsExpiry = undefined
    return await this.initialize()
  }

  /**
   * Validate current credentials
   */
  async validateCredentials(): Promise<boolean> {
    const result = await this.getCredentials()
    return result.success
  }
}

/**
 * Create authentication manager from environment variables
 */
export function createAuthFromEnvironment(): GCPAuthManager {
  // Determine authentication method based on available environment variables
  let method: AuthConfig['method'] = 'api-key' // Default to API key

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_KEY) {
    method = 'service-account'
  } else if (process.env.GCP_EPHEMERAL_TOKEN) {
    method = 'ephemeral-token'
  }

  const config: AuthConfig = {
    method,
    apiKey:
      process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY,
    serviceAccountKeyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    ephemeralToken: process.env.GCP_EPHEMERAL_TOKEN,
    projectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/generative-language'
    ]
  }

  return new GCPAuthManager(config)
}

/**
 * Helper function to get authentication for Gemini API
 */
export async function getGeminiAuthentication(): Promise<{
  success: boolean
  apiKey?: string
  accessToken?: string
  error?: string
}> {
  const authManager = createAuthFromEnvironment()
  const result = await authManager.getCredentials()

  if (!result.success) {
    return {
      success: false,
      error: result.error
    }
  }

  if (result.credentials?.apiKey) {
    return {
      success: true,
      apiKey: result.credentials.apiKey
    }
  }

  if (result.credentials?.accessToken) {
    return {
      success: true,
      accessToken: result.credentials.accessToken
    }
  }

  return {
    success: false,
    error: 'No valid credentials found'
  }
}
