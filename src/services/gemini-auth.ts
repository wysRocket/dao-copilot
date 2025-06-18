/**
 * Gemini Live API Authentication Module
 * Handles API key and OAuth 2.0 token-based authentication for secure WebSocket connections
 */

import { EventEmitter } from 'events'

export enum AuthMethod {
  API_KEY = 'api_key',
  OAUTH2 = 'oauth2',
  BEARER_TOKEN = 'bearer_token'
}

export interface AuthConfig {
  method: AuthMethod
  apiKey?: string
  accessToken?: string
  refreshToken?: string
  clientId?: string
  clientSecret?: string
  tokenEndpoint?: string
  scopes?: string[]
}

export interface AuthCredentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  tokenType?: string
}

export interface AuthResult {
  success: boolean
  credentials?: AuthCredentials
  error?: string
  headers?: Record<string, string>
  queryParams?: Record<string, string>
}

/**
 * Authentication Manager for Gemini Live API
 */
interface OAuth2TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
}

export class GeminiAuthManager extends EventEmitter {
  private config: AuthConfig
  private credentials: AuthCredentials | null = null
  private refreshTimer: NodeJS.Timeout | null = null

  constructor(config: AuthConfig) {
    super()
    this.config = { ...config }
    this.validateConfig()
  }

  /**
   * Validate authentication configuration
   */
  private validateConfig(): void {
    if (!this.config.method) {
      throw new Error('Authentication method is required')
    }

    switch (this.config.method) {
      case AuthMethod.API_KEY:
        if (!this.config.apiKey) {
          throw new Error('API key is required for API_KEY authentication method')
        }
        break
      case AuthMethod.OAUTH2:
        if (!this.config.clientId || !this.config.clientSecret) {
          throw new Error('Client ID and secret are required for OAuth2 authentication')
        }
        break
      case AuthMethod.BEARER_TOKEN:
        if (!this.config.accessToken) {
          throw new Error('Access token is required for BEARER_TOKEN authentication method')
        }
        break
    }
  }

  /**
   * Authenticate and get credentials
   */
  async authenticate(): Promise<AuthResult> {
    try {
      switch (this.config.method) {
        case AuthMethod.API_KEY:
          return this.authenticateWithApiKey()
          
        case AuthMethod.OAUTH2:
          return await this.authenticateWithOAuth2()
          
        case AuthMethod.BEARER_TOKEN:
          return this.authenticateWithBearerToken()
          
        default:
          throw new Error(`Unsupported authentication method: ${this.config.method}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error'
      this.emit('authError', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Authenticate using API key
   */
  private authenticateWithApiKey(): AuthResult {
    if (!this.config.apiKey) {
      throw new Error('API key not provided')
    }

    this.credentials = {
      accessToken: this.config.apiKey,
      tokenType: 'api_key'
    }

    this.emit('authenticated', this.credentials)

    return {
      success: true,
      credentials: this.credentials,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      queryParams: {
        'key': this.config.apiKey
      }
    }
  }

  /**
   * Authenticate using OAuth 2.0
   */
  private async authenticateWithOAuth2(): Promise<AuthResult> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('OAuth2 credentials not provided')
    }

    try {
      // If we have a refresh token, try to refresh first
      if (this.config.refreshToken) {
        const refreshResult = await this.refreshOAuth2Token()
        if (refreshResult.success) {
          return refreshResult
        }
      }

      // Otherwise, perform initial OAuth2 flow
      const tokenResponse = await this.performOAuth2Flow()
      
      this.credentials = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        tokenType: tokenResponse.token_type || 'Bearer'
      }

      // Set up automatic token refresh
      this.scheduleTokenRefresh()
      this.emit('authenticated', this.credentials)

      return {
        success: true,
        credentials: this.credentials,
        headers: {
          'Authorization': `${this.credentials.tokenType} ${this.credentials.accessToken}`
        }
      }
    } catch (error) {
      throw new Error(`OAuth2 authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Authenticate using Bearer token
   */
  private authenticateWithBearerToken(): AuthResult {
    if (!this.config.accessToken) {
      throw new Error('Bearer token not provided')
    }

    this.credentials = {
      accessToken: this.config.accessToken,
      tokenType: 'Bearer'
    }

    this.emit('authenticated', this.credentials)

    return {
      success: true,
      credentials: this.credentials,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`
      }
    }
  }

  /**
   * Perform OAuth2 token exchange
   */
  private async performOAuth2Flow(): Promise<OAuth2TokenResponse> {
    const tokenEndpoint = this.config.tokenEndpoint || 'https://oauth2.googleapis.com/token'
    
    const params = new URLSearchParams({
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
      grant_type: 'client_credentials',
      scope: this.config.scopes?.join(' ') || 'https://www.googleapis.com/auth/generative-language'
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`Token request failed: ${errorData.error || response.statusText}`)
    }

    return response.json()
  }

  /**
   * Refresh OAuth2 access token
   */
  private async refreshOAuth2Token(): Promise<AuthResult> {
    if (!this.config.refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const tokenEndpoint = this.config.tokenEndpoint || 'https://oauth2.googleapis.com/token'
      
      const params = new URLSearchParams({
        client_id: this.config.clientId!,
        client_secret: this.config.clientSecret!,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token'
      })

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`Token refresh failed: ${errorData.error || response.statusText}`)
      }

      const tokenData = await response.json()
      
      this.credentials = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || this.config.refreshToken,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        tokenType: tokenData.token_type || 'Bearer'
      }

      // Update config with new refresh token if provided
      if (tokenData.refresh_token) {
        this.config.refreshToken = tokenData.refresh_token
      }

      this.scheduleTokenRefresh()
      this.emit('tokenRefreshed', this.credentials)

      return {
        success: true,
        credentials: this.credentials,
        headers: {
          'Authorization': `${this.credentials.tokenType} ${this.credentials.accessToken}`
        }
      }
    } catch (error) {
      this.emit('refreshError', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed'
      }
    }
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    if (!this.credentials?.expiresAt) {
      return
    }

    // Refresh 5 minutes before expiration
    const refreshTime = this.credentials.expiresAt - Date.now() - (5 * 60 * 1000)
    
    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(async () => {
        console.log('Auto-refreshing OAuth2 token')
        await this.refreshOAuth2Token()
      }, refreshTime)
    }
  }

  /**
   * Get current authentication headers
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.credentials) {
      throw new Error('Not authenticated')
    }

    switch (this.config.method) {
      case AuthMethod.API_KEY:
        return {
          'Authorization': `Bearer ${this.credentials.accessToken}`
        }
      case AuthMethod.OAUTH2:
      case AuthMethod.BEARER_TOKEN:
        return {
          'Authorization': `${this.credentials.tokenType || 'Bearer'} ${this.credentials.accessToken}`
        }
      default:
        throw new Error('Unknown authentication method')
    }
  }

  /**
   * Get query parameters for WebSocket connection
   */
  getWebSocketParams(): Record<string, string> {
    if (!this.credentials) {
      throw new Error('Not authenticated')
    }

    if (this.config.method === AuthMethod.API_KEY) {
      return {
        'key': this.credentials.accessToken
      }
    }

    // For OAuth2 and Bearer tokens, authentication is typically done via headers
    // but some WebSocket implementations may require it in the query string
    return {}
  }

  /**
   * Check if current credentials are valid and not expired
   */
  isAuthenticated(): boolean {
    if (!this.credentials) {
      return false
    }

    if (this.credentials.expiresAt && this.credentials.expiresAt <= Date.now()) {
      return false
    }

    return true
  }

  /**
   * Clear authentication credentials
   */
  clearCredentials(): void {
    this.credentials = null
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    this.emit('credentialsCleared')
  }

  /**
   * Get current credentials (read-only)
   */
  getCredentials(): AuthCredentials | null {
    return this.credentials ? { ...this.credentials } : null
  }

  /**
   * Update configuration (useful for updating tokens or keys)
   */
  updateConfig(newConfig: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.validateConfig()
    this.emit('configUpdated', this.config)
  }
}

/**
 * Factory function to create auth manager from environment variables
 */
export function createAuthManagerFromEnv(): GeminiAuthManager {
  const method = (process.env.GEMINI_AUTH_METHOD as AuthMethod) || AuthMethod.API_KEY
  
  const config: AuthConfig = {
    method,
    apiKey: process.env.GEMINI_API_KEY,
    accessToken: process.env.GEMINI_ACCESS_TOKEN,
    refreshToken: process.env.GEMINI_REFRESH_TOKEN,
    clientId: process.env.GEMINI_CLIENT_ID,
    clientSecret: process.env.GEMINI_CLIENT_SECRET,
    tokenEndpoint: process.env.GEMINI_TOKEN_ENDPOINT,
    scopes: process.env.GEMINI_SCOPES?.split(',')
  }

  return new GeminiAuthManager(config)
}
