/**
 * Google Cloud Authentication Service
 *
 * Handles authentication for Google Cloud services including Speech-to-Text.
 * Supports multiple authentication methods: service account keys, environment variables,
 * and Application Default Credentials (ADC).
 */

import {EventEmitter} from 'events'

// Authentication configuration types
export interface GoogleCloudCredentials {
  type: 'service_account'
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  auth_provider_x509_cert_url: string
  client_x509_cert_url: string
}

export interface AuthenticationConfig {
  // Method 1: Service Account Key File
  keyFilename?: string

  // Method 2: Service Account Credentials Object
  credentials?: GoogleCloudCredentials

  // Method 3: Environment Variables
  useEnvironmentAuth?: boolean

  // Method 4: Application Default Credentials
  useApplicationDefaultCredentials?: boolean

  // Additional settings
  projectId: string
  scopes?: string[]
  timeout?: number
}

export interface AuthenticationResult {
  success: boolean
  accessToken?: string
  tokenType?: string
  expiresAt?: number
  projectId: string
  error?: string
}

/**
 * Google Cloud Authentication Service
 */
export class GoogleCloudAuthService extends EventEmitter {
  private config: AuthenticationConfig
  private currentToken: string | null = null
  private tokenExpiry: number | null = null
  private refreshTimer: NodeJS.Timeout | null = null

  constructor(config: AuthenticationConfig) {
    super()
    this.config = config
  }

  /**
   * Initialize authentication
   */
  public async initialize(): Promise<AuthenticationResult> {
    try {
      const result = await this.authenticate()

      if (result.success) {
        // Set up automatic token refresh
        this.setupTokenRefresh()
        this.emit('initialized', result)
      } else {
        this.emit('initialization:error', result.error)
      }

      return result
    } catch (error) {
      const errorMessage = `Authentication initialization failed: ${error}`
      this.emit('initialization:error', errorMessage)
      return {
        success: false,
        projectId: this.config.projectId,
        error: errorMessage
      }
    }
  }

  /**
   * Authenticate with Google Cloud
   */
  public async authenticate(): Promise<AuthenticationResult> {
    try {
      // Try different authentication methods in order of priority
      let result: AuthenticationResult

      if (this.config.credentials) {
        result = await this.authenticateWithCredentials()
      } else if (this.config.keyFilename) {
        result = await this.authenticateWithKeyFile()
      } else if (this.config.useEnvironmentAuth) {
        result = await this.authenticateWithEnvironment()
      } else if (this.config.useApplicationDefaultCredentials) {
        result = await this.authenticateWithADC()
      } else {
        throw new Error('No authentication method configured')
      }

      if (result.success) {
        this.currentToken = result.accessToken || null
        this.tokenExpiry = result.expiresAt || null
        this.emit('authenticated', result)
      } else {
        this.emit('authentication:error', result.error)
      }

      return result
    } catch (error) {
      const errorMessage = `Authentication failed: ${error}`
      this.emit('authentication:error', errorMessage)
      return {
        success: false,
        projectId: this.config.projectId,
        error: errorMessage
      }
    }
  }

  /**
   * Get current access token (refresh if needed)
   */
  public async getAccessToken(): Promise<string> {
    // Check if token is valid and not expired
    if (this.currentToken && this.isTokenValid()) {
      return this.currentToken
    }

    // Refresh token if needed
    const result = await this.authenticate()
    if (!result.success || !result.accessToken) {
      throw new Error('Failed to get valid access token')
    }

    return result.accessToken
  }

  /**
   * Check if current token is valid
   */
  public isTokenValid(): boolean {
    if (!this.currentToken) return false
    if (!this.tokenExpiry) return true // No expiry info, assume valid

    // Add 5-minute buffer before expiry
    const bufferTime = 5 * 60 * 1000
    return Date.now() < this.tokenExpiry - bufferTime
  }

  /**
   * Get authentication headers for API requests
   */
  public async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken()
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  /**
   * Get project ID
   */
  public getProjectId(): string {
    return this.config.projectId
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<AuthenticationConfig>): void {
    this.config = {...this.config, ...newConfig}

    // Re-initialize if credentials changed
    if (
      newConfig.credentials ||
      newConfig.keyFilename ||
      newConfig.useEnvironmentAuth !== undefined ||
      newConfig.useApplicationDefaultCredentials !== undefined
    ) {
      this.initialize().catch(error => {
        this.emit('configuration:error', error)
      })
    }

    this.emit('configuration:updated', this.config)
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    this.currentToken = null
    this.tokenExpiry = null
    this.removeAllListeners()
  }

  // Private authentication methods

  private async authenticateWithCredentials(): Promise<AuthenticationResult> {
    if (!this.config.credentials) {
      throw new Error('Credentials not provided')
    }

    try {
      // Create JWT token for Google Cloud API
      const token = await this.createJWTToken(this.config.credentials)

      // Exchange JWT for access token
      const accessToken = await this.exchangeJWTForAccessToken(token)

      return {
        success: true,
        accessToken: accessToken.access_token,
        tokenType: accessToken.token_type || 'Bearer',
        expiresAt: Date.now() + (accessToken.expires_in || 3600) * 1000,
        projectId: this.config.credentials.project_id
      }
    } catch (error) {
      return {
        success: false,
        projectId: this.config.projectId,
        error: `Credentials authentication failed: ${error}`
      }
    }
  }

  private async authenticateWithKeyFile(): Promise<AuthenticationResult> {
    if (!this.config.keyFilename) {
      throw new Error('Key filename not provided')
    }

    try {
      // In production, this would read the key file:
      // const keyFile = await fs.readFile(this.config.keyFilename, 'utf8');
      // const credentials = JSON.parse(keyFile) as GoogleCloudCredentials;

      // Mock implementation for development
      const mockCredentials: GoogleCloudCredentials = {
        type: 'service_account',
        project_id: this.config.projectId,
        private_key_id: 'mock-key-id',
        private_key: '-----BEGIN PRIVATE KEY-----\nmock-private-key\n-----END PRIVATE KEY-----',
        client_email: 'mock@example.iam.gserviceaccount.com',
        client_id: 'mock-client-id',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/mock%40example.iam.gserviceaccount.com'
      }

      // Use the credentials to authenticate
      const savedCredentials = this.config.credentials
      this.config.credentials = mockCredentials
      const result = await this.authenticateWithCredentials()
      this.config.credentials = savedCredentials

      return result
    } catch (error) {
      return {
        success: false,
        projectId: this.config.projectId,
        error: `Key file authentication failed: ${error}`
      }
    }
  }

  private async authenticateWithEnvironment(): Promise<AuthenticationResult> {
    try {
      // Check for required environment variables
      const requiredVars = ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT']

      for (const varName of requiredVars) {
        if (!process.env[varName]) {
          throw new Error(`Missing environment variable: ${varName}`)
        }
      }

      // Mock successful authentication
      return {
        success: true,
        accessToken: 'mock-env-access-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600 * 1000,
        projectId: process.env.GOOGLE_CLOUD_PROJECT || this.config.projectId
      }
    } catch (error) {
      return {
        success: false,
        projectId: this.config.projectId,
        error: `Environment authentication failed: ${error}`
      }
    }
  }

  private async authenticateWithADC(): Promise<AuthenticationResult> {
    try {
      // Application Default Credentials (ADC) authentication
      // In production, this would use the Google Auth Library

      // Mock successful ADC authentication
      return {
        success: true,
        accessToken: 'mock-adc-access-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600 * 1000,
        projectId: this.config.projectId
      }
    } catch (error) {
      return {
        success: false,
        projectId: this.config.projectId,
        error: `ADC authentication failed: ${error}`
      }
    }
  }

  private async createJWTToken(credentials: GoogleCloudCredentials): Promise<string> {
    // In production, this would use the 'jsonwebtoken' library or Google's auth library
    // For development, return a mock JWT token

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: credentials.private_key_id
    }

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: credentials.client_email,
      sub: credentials.client_email,
      aud: credentials.token_uri,
      iat: now,
      exp: now + 3600,
      scope: this.config.scopes?.join(' ') || 'https://www.googleapis.com/auth/cloud-platform'
    }

    // Mock JWT token (in production, properly sign with private key)
    const mockJWT = `${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}.mock-signature`

    return mockJWT
  }

  private async exchangeJWTForAccessToken(jwtToken: string): Promise<{
    access_token: string
    token_type?: string
    expires_in?: number
  }> {
    // In production, this would make an actual HTTP request to Google's token endpoint

    // Mock exchange process
    await new Promise(resolve => setTimeout(resolve, 100))

    if (!jwtToken) {
      throw new Error('Invalid JWT token')
    }

    return {
      access_token: 'mock-exchanged-access-token',
      token_type: 'Bearer',
      expires_in: 3600
    }
  }

  private setupTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    if (!this.tokenExpiry) {
      return // No expiry info, skip auto-refresh
    }

    // Refresh 10 minutes before expiry
    const refreshTime = this.tokenExpiry - Date.now() - 10 * 60 * 1000

    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(() => {
        this.authenticate().catch(error => {
          this.emit('token:refresh:error', error)
        })
      }, refreshTime)
    }
  }
}

// Factory function for easy service creation
export function createGoogleCloudAuthService(config: AuthenticationConfig): GoogleCloudAuthService {
  return new GoogleCloudAuthService(config)
}

// Configuration validation
export function validateAuthConfig(config: Partial<AuthenticationConfig>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!config.projectId) {
    errors.push('projectId is required')
  }

  const authMethods = [
    config.keyFilename,
    config.credentials,
    config.useEnvironmentAuth,
    config.useApplicationDefaultCredentials
  ].filter(Boolean)

  if (authMethods.length === 0) {
    errors.push('At least one authentication method must be configured')
  }

  if (authMethods.length > 1) {
    errors.push('Only one authentication method should be configured at a time')
  }

  if (config.credentials) {
    const required = ['project_id', 'private_key', 'client_email']
    for (const field of required) {
      if (!config.credentials[field as keyof GoogleCloudCredentials]) {
        errors.push(`credentials.${field} is required`)
      }
    }
  }

  if (config.timeout && (config.timeout < 1000 || config.timeout > 60000)) {
    errors.push('timeout must be between 1000ms and 60000ms')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// Common authentication configurations
export const GoogleCloudAuthConfigurations = {
  /**
   * Service account credentials configuration
   */
  serviceAccount: (
    projectId: string,
    credentials: GoogleCloudCredentials
  ): AuthenticationConfig => ({
    projectId,
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  }),

  /**
   * Key file configuration
   */
  keyFile: (projectId: string, keyFilename: string): AuthenticationConfig => ({
    projectId,
    keyFilename,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  }),

  /**
   * Environment variables configuration
   */
  environment: (projectId: string): AuthenticationConfig => ({
    projectId,
    useEnvironmentAuth: true,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  }),

  /**
   * Application Default Credentials configuration
   */
  adc: (projectId: string): AuthenticationConfig => ({
    projectId,
    useApplicationDefaultCredentials: true,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  }),

  /**
   * Development/testing configuration
   */
  development: (projectId: string): AuthenticationConfig => ({
    projectId,
    useApplicationDefaultCredentials: true,
    timeout: 10000,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  })
}
